use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::U128;
use near_sdk::serde::{Deserialize, Serialize};

/// Derivation path for MPC key (e.g., "solana-1,user-xyz")
pub type DerivationPath = String;

/// Supported wallet types for signature verification
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub enum WalletType {
    /// NEAR Ed25519 with NEP-413 format
    Near,
    /// Solana Ed25519 raw message
    Solana,
    /// EVM secp256k1 ECDSA (personal_sign)
    Evm,
}

/// Price condition for triggering operations
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(crate = "near_sdk::serde")]
pub enum PriceCondition {
    Above,
    Below,
}

/// Operation types user can pre-approve
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
#[serde(tag = "type")]
pub enum AllowedOperationType {
    /// Any swap from source to target asset
    Swap {
        source_asset: String,
        target_asset: String,
        max_amount: U128,
    },
    /// Limit order: execute when price crosses threshold
    LimitOrder {
        price_asset: String,
        quote_asset: String,
        trigger_price: U128,
        condition: PriceCondition,
        source_asset: String,
        target_asset: String,
        max_amount: U128,
    },
    /// Stop-loss: sell when price drops below threshold
    StopLoss {
        price_asset: String,
        quote_asset: String,
        trigger_price: U128,
        source_asset: String,
        target_asset: String,
        max_amount: U128,
    },
    /// Take-profit: sell when price rises above threshold
    TakeProfit {
        price_asset: String,
        quote_asset: String,
        trigger_price: U128,
        source_asset: String,
        target_asset: String,
        max_amount: U128,
    },
}

/// A pre-approved operation
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AllowedOperation {
    /// Unique operation ID
    pub operation_id: String,
    /// Which MPC key this applies to
    pub derivation_path: DerivationPath,
    /// Type of operation allowed
    pub operation_type: AllowedOperationType,
    /// Where to send output
    pub destination_address: String,
    /// Which chain for destination
    pub destination_chain: String,
    /// Maximum slippage in basis points
    pub slippage_bps: u16,
    /// Optional expiry timestamp (nanoseconds)
    pub expires_at: Option<u64>,
    /// Whether operation has been executed
    pub executed: bool,
    /// Nonce for replay protection
    pub nonce: u64,
    /// When operation was created
    pub created_at: u64,
}

/// Input for creating an allowed operation (without auto-generated fields)
#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct AllowedOperationInput {
    pub operation_type: AllowedOperationType,
    pub destination_address: String,
    pub destination_chain: String,
    pub slippage_bps: u16,
    pub expires_at: Option<u64>,
}

/// User's registered wallet for signing allowlist changes
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct RegisteredWallet {
    pub wallet_type: WalletType,
    pub public_key: Vec<u8>,
    pub chain_address: String,
}

/// User permission set for a derivation path
#[derive(BorshDeserialize, BorshSerialize)]
pub struct UserPermissions {
    /// Wallets authorized to manage this permission set
    pub owner_wallets: Vec<RegisteredWallet>,
    /// Allowed operations for this derivation path
    pub allowed_operations: UnorderedMap<String, AllowedOperation>,
    /// Next nonce for operation IDs
    pub next_nonce: u64,
}

/// View type for user permissions (for queries)
#[derive(Serialize, Deserialize)]
#[serde(crate = "near_sdk::serde")]
pub struct UserPermissionsView {
    pub owner_wallets: Vec<RegisteredWallet>,
    pub operations: Vec<AllowedOperation>,
    pub next_nonce: u64,
}

impl From<&UserPermissions> for UserPermissionsView {
    fn from(perms: &UserPermissions) -> Self {
        Self {
            owner_wallets: perms.owner_wallets.clone(),
            operations: perms.allowed_operations.values().collect(),
            next_nonce: perms.next_nonce,
        }
    }
}
