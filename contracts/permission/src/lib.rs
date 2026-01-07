use near_sdk::collections::{LookupMap, UnorderedMap, UnorderedSet};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, ext_contract, near, AccountId, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError,
};

mod signature;
mod types;

use signature::{verify_evm_signature, verify_near_signature, verify_solana_signature};
use types::*;

/// Gas for cross-contract call to MPC signer
const GAS_FOR_MPC_SIGN: Gas = Gas::from_tgas(100);
/// Gas for callback after MPC sign
const GAS_FOR_CALLBACK: Gas = Gas::from_tgas(20);

/// External interface for ChainSignatureContract
#[ext_contract(ext_chain_sig)]
pub trait ChainSignatureContract {
    fn sign(&mut self, request: SignRequest) -> Promise;
}

/// Sign request format for ChainSignatureContract
#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct SignRequest {
    pub payload_v2: PayloadV2,
    pub path: String,
    pub domain_id: u8,
}

#[derive(Serialize, Deserialize, Clone)]
#[serde(crate = "near_sdk::serde")]
pub struct PayloadV2 {
    #[serde(rename = "Eddsa", skip_serializing_if = "Option::is_none")]
    pub eddsa: Option<String>,
    #[serde(rename = "Ecdsa", skip_serializing_if = "Option::is_none")]
    pub ecdsa: Option<String>,
}

/// Main permission contract
#[derive(PanicOnDefault)]
#[near(contract_state)]
pub struct PermissionContract {
    /// Contract owner (admin)
    pub owner: AccountId,
    /// User permissions: derivation_path -> UserPermissions
    pub permissions: LookupMap<DerivationPath, UserPermissions>,
    /// Wallet address to derivation path mapping for lookup
    pub wallet_to_path: LookupMap<String, DerivationPath>,
    /// Authorized TEE relayers that can request signatures
    pub tee_relayers: UnorderedSet<AccountId>,
    /// ChainSignatureContract address
    pub mpc_contract: AccountId,
    /// Active operations index for efficient polling
    pub active_operations: UnorderedSet<String>,
    /// Nonce tracking for replay protection
    pub used_nonces: LookupMap<String, bool>,
}

#[near]
impl PermissionContract {
    /// Initialize the contract
    #[init]
    pub fn new(owner: AccountId, mpc_contract: AccountId) -> Self {
        Self {
            owner,
            permissions: LookupMap::new(b"p"),
            wallet_to_path: LookupMap::new(b"w"),
            tee_relayers: UnorderedSet::new(b"t"),
            mpc_contract,
            active_operations: UnorderedSet::new(b"a"),
            used_nonces: LookupMap::new(b"n"),
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Admin Methods
    // ═══════════════════════════════════════════════════════════════════════════

    /// Register an authorized TEE relayer (owner only)
    pub fn register_tee_relayer(&mut self, relayer_account: AccountId) {
        self.assert_owner();
        self.tee_relayers.insert(&relayer_account);
        env::log_str(&format!("Registered TEE relayer: {}", relayer_account));
    }

    /// Remove a TEE relayer (owner only)
    pub fn remove_tee_relayer(&mut self, relayer_account: AccountId) {
        self.assert_owner();
        self.tee_relayers.remove(&relayer_account);
        env::log_str(&format!("Removed TEE relayer: {}", relayer_account));
    }

    /// Update MPC contract address (owner only)
    pub fn update_mpc_contract(&mut self, mpc_contract: AccountId) {
        self.assert_owner();
        self.mpc_contract = mpc_contract;
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // User Management (called by TEE with user signature)
    // ═══════════════════════════════════════════════════════════════════════════

    /// Register a wallet and create permission set for a derivation path
    /// Called by TEE relayer with user's signature
    pub fn register_wallet(
        &mut self,
        derivation_path: DerivationPath,
        wallet_type: WalletType,
        public_key: Vec<u8>,
        chain_address: String,
        signature: Vec<u8>,
        message: Vec<u8>,
        nonce: u64,
    ) {
        self.assert_tee_relayer();

        // Check nonce not used
        let nonce_key = format!("{}:{}", chain_address, nonce);
        assert!(
            !self.used_nonces.contains_key(&nonce_key),
            "Nonce already used"
        );
        self.used_nonces.insert(&nonce_key, &true);

        // Verify signature
        let is_valid = self.verify_user_signature(
            &wallet_type,
            &public_key,
            &chain_address,
            &message,
            &signature,
        );
        assert!(is_valid, "Invalid signature");

        // Verify message contains expected derivation path
        let expected_msg = format!(
            "Register wallet for derivation path: {} with nonce: {}",
            derivation_path, nonce
        );
        assert!(
            message == expected_msg.as_bytes(),
            "Message does not match expected format"
        );

        // Create or update user permissions
        let registered_wallet = RegisteredWallet {
            wallet_type,
            public_key,
            chain_address: chain_address.clone(),
        };

        if let Some(mut perms) = self.permissions.get(&derivation_path) {
            // Add wallet to existing permissions
            if !perms
                .owner_wallets
                .iter()
                .any(|w| w.chain_address == chain_address)
            {
                perms.owner_wallets.push(registered_wallet);
                self.permissions.insert(&derivation_path, &perms);
            }
        } else {
            // Create new permission set
            let perms = UserPermissions {
                owner_wallets: vec![registered_wallet],
                allowed_operations: UnorderedMap::new(
                    format!("ops:{}", derivation_path).as_bytes(),
                ),
                next_nonce: 1,
            };
            self.permissions.insert(&derivation_path, &perms);
        }

        // Map wallet address to derivation path
        self.wallet_to_path
            .insert(&chain_address, &derivation_path);

        env::log_str(&format!(
            "Registered wallet {} for path {}",
            chain_address, derivation_path
        ));
    }

    /// Add an allowed operation (user must sign)
    pub fn add_allowed_operation(
        &mut self,
        derivation_path: DerivationPath,
        operation: AllowedOperationInput,
        signature: Vec<u8>,
        message: Vec<u8>,
        signer_address: String,
    ) -> String {
        self.assert_tee_relayer();

        // Get user permissions
        let mut perms = self
            .permissions
            .get(&derivation_path)
            .expect("No permissions for derivation path");

        // Find signer's wallet
        let signer_wallet = perms
            .owner_wallets
            .iter()
            .find(|w| w.chain_address == signer_address)
            .expect("Signer not authorized for this derivation path");

        // Verify signature
        let is_valid = self.verify_user_signature(
            &signer_wallet.wallet_type,
            &signer_wallet.public_key,
            &signer_address,
            &message,
            &signature,
        );
        assert!(is_valid, "Invalid signature");

        // Generate operation ID
        let operation_id = format!("{}-{}", derivation_path, perms.next_nonce);
        perms.next_nonce += 1;

        // Create allowed operation
        let allowed_op = AllowedOperation {
            operation_id: operation_id.clone(),
            derivation_path: derivation_path.clone(),
            operation_type: operation.operation_type,
            destination_address: operation.destination_address,
            destination_chain: operation.destination_chain,
            slippage_bps: operation.slippage_bps,
            expires_at: operation.expires_at,
            executed: false,
            nonce: perms.next_nonce - 1,
            created_at: env::block_timestamp(),
        };

        // Store operation
        perms
            .allowed_operations
            .insert(&operation_id, &allowed_op);
        self.permissions.insert(&derivation_path, &perms);

        // Add to active operations index
        let active_key = format!("{}:{}", derivation_path, operation_id);
        self.active_operations.insert(&active_key);

        env::log_str(&format!(
            "Added operation {} for path {}",
            operation_id, derivation_path
        ));

        operation_id
    }

    /// Remove an allowed operation (user must sign)
    pub fn remove_allowed_operation(
        &mut self,
        derivation_path: DerivationPath,
        operation_id: String,
        signature: Vec<u8>,
        message: Vec<u8>,
        signer_address: String,
    ) {
        self.assert_tee_relayer();

        // Get user permissions
        let mut perms = self
            .permissions
            .get(&derivation_path)
            .expect("No permissions for derivation path");

        // Find signer's wallet
        let signer_wallet = perms
            .owner_wallets
            .iter()
            .find(|w| w.chain_address == signer_address)
            .expect("Signer not authorized for this derivation path");

        // Verify signature
        let is_valid = self.verify_user_signature(
            &signer_wallet.wallet_type,
            &signer_wallet.public_key,
            &signer_address,
            &message,
            &signature,
        );
        assert!(is_valid, "Invalid signature");

        // Remove operation
        perms.allowed_operations.remove(&operation_id);
        self.permissions.insert(&derivation_path, &perms);

        // Remove from active operations index
        let active_key = format!("{}:{}", derivation_path, operation_id);
        self.active_operations.remove(&active_key);

        env::log_str(&format!(
            "Removed operation {} from path {}",
            operation_id, derivation_path
        ));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Signature Requests (called by TEE)
    // ═══════════════════════════════════════════════════════════════════════════

    /// Request signature for an allowed operation
    /// This validates against allowlist then calls MPC
    pub fn sign_allowed(
        &mut self,
        derivation_path: DerivationPath,
        operation_id: String,
        payload: Vec<u8>,
        key_type: String,
        tee_price: Option<u128>,
        tee_timestamp: Option<u64>,
    ) -> Promise {
        self.assert_tee_relayer();

        // Get user permissions
        let mut perms = self
            .permissions
            .get(&derivation_path)
            .expect("No permissions for derivation path");

        // Get operation
        let mut operation = perms
            .allowed_operations
            .get(&operation_id)
            .expect("Operation not in allowlist");

        // Validate operation
        assert!(!operation.executed, "Operation already executed");

        if let Some(expires) = operation.expires_at {
            assert!(
                env::block_timestamp() < expires,
                "Operation has expired"
            );
        }

        // For conditional orders, validate price
        if let Some(price) = tee_price {
            if let Err(e) = self.validate_price_condition(&operation, price, tee_timestamp) {
                env::panic_str(e);
            }
        }

        // Mark as executed (prevent replay)
        operation.executed = true;
        perms.allowed_operations.insert(&operation_id, &operation);
        self.permissions.insert(&derivation_path, &perms);

        // Remove from active operations index
        let active_key = format!("{}:{}", derivation_path, operation_id);
        self.active_operations.remove(&active_key);

        // Prepare MPC sign request
        let domain_id = match key_type.as_str() {
            "Eddsa" => 1u8,
            "Ecdsa" => 0u8,
            _ => panic!("Invalid key type"),
        };

        let payload_hex = hex::encode(&payload);
        let payload_v2 = if key_type == "Eddsa" {
            PayloadV2 {
                eddsa: Some(payload_hex),
                ecdsa: None,
            }
        } else {
            PayloadV2 {
                eddsa: None,
                ecdsa: Some(payload_hex),
            }
        };

        let sign_request = SignRequest {
            payload_v2,
            path: derivation_path.clone(),
            domain_id,
        };

        env::log_str(&format!(
            "Requesting MPC signature for operation {}",
            operation_id
        ));

        // Cross-contract call to ChainSignatureContract
        ext_chain_sig::ext(self.mpc_contract.clone())
            .with_static_gas(GAS_FOR_MPC_SIGN)
            .with_attached_deposit(NearToken::from_yoctonear(1))
            .sign(sign_request)
            .then(
                Self::ext(env::current_account_id())
                    .with_static_gas(GAS_FOR_CALLBACK)
                    .on_mpc_sign_complete(derivation_path, operation_id),
            )
    }

    /// Callback after MPC sign completes
    #[private]
    pub fn on_mpc_sign_complete(
        &mut self,
        derivation_path: DerivationPath,
        operation_id: String,
        #[callback_result] result: Result<Vec<u8>, PromiseError>,
    ) -> Vec<u8> {
        match result {
            Ok(signature) => {
                env::log_str(&format!(
                    "MPC signature received for operation {}",
                    operation_id
                ));
                signature
            }
            Err(e) => {
                // Revert executed flag on failure
                if let Some(mut perms) = self.permissions.get(&derivation_path) {
                    if let Some(mut operation) = perms.allowed_operations.get(&operation_id) {
                        operation.executed = false;
                        perms.allowed_operations.insert(&operation_id, &operation);
                        self.permissions.insert(&derivation_path, &perms);

                        // Re-add to active operations
                        let active_key = format!("{}:{}", derivation_path, operation_id);
                        self.active_operations.insert(&active_key);
                    }
                }
                env::panic_str(&format!("MPC sign failed: {:?}", e));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Query Methods
    // ═══════════════════════════════════════════════════════════════════════════

    /// Get all active operations for TEE polling
    pub fn get_active_operations(
        &self,
        from_index: u64,
        limit: u64,
    ) -> Vec<(DerivationPath, AllowedOperation)> {
        let mut results = Vec::new();
        let keys: Vec<_> = self.active_operations.iter().collect();

        for key in keys.iter().skip(from_index as usize).take(limit as usize) {
            let parts: Vec<&str> = key.split(':').collect();
            if parts.len() >= 2 {
                let path = parts[0].to_string();
                let op_id = parts[1..].join(":");

                if let Some(perms) = self.permissions.get(&path) {
                    if let Some(op) = perms.allowed_operations.get(&op_id) {
                        results.push((path, op));
                    }
                }
            }
        }

        results
    }

    /// Get operations for a specific derivation path
    pub fn get_operations(&self, derivation_path: DerivationPath) -> Vec<AllowedOperation> {
        if let Some(perms) = self.permissions.get(&derivation_path) {
            perms.allowed_operations.values().collect()
        } else {
            Vec::new()
        }
    }

    /// Get a specific operation
    pub fn get_operation(
        &self,
        derivation_path: DerivationPath,
        operation_id: String,
    ) -> Option<AllowedOperation> {
        self.permissions
            .get(&derivation_path)
            .and_then(|perms| perms.allowed_operations.get(&operation_id))
    }

    /// Check if an operation is allowed (not executed, not expired)
    pub fn is_operation_allowed(
        &self,
        derivation_path: DerivationPath,
        operation_id: String,
    ) -> bool {
        if let Some(perms) = self.permissions.get(&derivation_path) {
            if let Some(op) = perms.allowed_operations.get(&operation_id) {
                if op.executed {
                    return false;
                }
                if let Some(expires) = op.expires_at {
                    if env::block_timestamp() >= expires {
                        return false;
                    }
                }
                return true;
            }
        }
        false
    }

    /// Get derivation path for a wallet address
    pub fn get_path_for_wallet(&self, chain_address: String) -> Option<DerivationPath> {
        self.wallet_to_path.get(&chain_address)
    }

    /// Check if account is a registered TEE relayer
    pub fn is_tee_relayer(&self, account: AccountId) -> bool {
        self.tee_relayers.contains(&account)
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // Internal Methods
    // ═══════════════════════════════════════════════════════════════════════════

    fn assert_owner(&self) {
        assert_eq!(
            env::predecessor_account_id(),
            self.owner,
            "Only owner can call this method"
        );
    }

    fn assert_tee_relayer(&self) {
        assert!(
            self.tee_relayers.contains(&env::predecessor_account_id()),
            "Only authorized TEE relayers can call this method"
        );
    }

    fn verify_user_signature(
        &self,
        wallet_type: &WalletType,
        public_key: &[u8],
        chain_address: &str,
        message: &[u8],
        signature: &[u8],
    ) -> bool {
        match wallet_type {
            WalletType::Near => verify_near_signature(public_key, message, signature),
            WalletType::Solana => verify_solana_signature(public_key, message, signature),
            WalletType::Evm => verify_evm_signature(chain_address, message, signature),
        }
    }

    fn validate_price_condition(
        &self,
        operation: &AllowedOperation,
        current_price: u128,
        timestamp: Option<u64>,
    ) -> Result<(), &'static str> {
        // Check timestamp is recent (within 60 seconds)
        if let Some(ts) = timestamp {
            let now = env::block_timestamp();
            if now > ts && now - ts > 60_000_000_000 {
                // 60 seconds in nanoseconds
                return Err("Price timestamp too old");
            }
        }

        // Check price condition based on operation type
        match &operation.operation_type {
            AllowedOperationType::LimitOrder {
                trigger_price,
                condition,
                ..
            } => {
                let trigger = trigger_price.0;
                match condition {
                    PriceCondition::Above => {
                        if current_price < trigger {
                            return Err("Price condition not met: price below trigger");
                        }
                    }
                    PriceCondition::Below => {
                        if current_price > trigger {
                            return Err("Price condition not met: price above trigger");
                        }
                    }
                }
            }
            AllowedOperationType::StopLoss { trigger_price, .. } => {
                if current_price > trigger_price.0 {
                    return Err("Stop-loss condition not met: price above trigger");
                }
            }
            AllowedOperationType::TakeProfit { trigger_price, .. } => {
                if current_price < trigger_price.0 {
                    return Err("Take-profit condition not met: price below trigger");
                }
            }
            AllowedOperationType::Swap { .. } => {
                // Swaps don't have price conditions
            }
        }

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::VMContextBuilder;
    use near_sdk::testing_env;

    fn get_context(predecessor: AccountId) -> VMContextBuilder {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor);
        builder
    }

    #[test]
    fn test_init() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let mpc: AccountId = "mpc.near".parse().unwrap();

        testing_env!(get_context(owner.clone()).build());
        let contract = PermissionContract::new(owner.clone(), mpc);

        assert_eq!(contract.owner, owner);
    }

    #[test]
    fn test_register_tee_relayer() {
        let owner: AccountId = "owner.near".parse().unwrap();
        let mpc: AccountId = "mpc.near".parse().unwrap();
        let relayer: AccountId = "relayer.near".parse().unwrap();

        testing_env!(get_context(owner.clone()).build());
        let mut contract = PermissionContract::new(owner.clone(), mpc);

        contract.register_tee_relayer(relayer.clone());
        assert!(contract.is_tee_relayer(relayer));
    }
}
