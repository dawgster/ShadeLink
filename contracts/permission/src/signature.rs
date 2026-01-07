use near_sdk::env;

/// Verify NEAR/Solana Ed25519 signature using NEAR's built-in verifier
/// Both NEAR and Solana use Ed25519, the difference is message format
pub fn verify_ed25519_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    // Ed25519 signatures are 64 bytes, public keys are 32 bytes
    if signature.len() != 64 || public_key.len() != 32 {
        return false;
    }

    // Convert to fixed-size arrays
    let sig: [u8; 64] = match signature.try_into() {
        Ok(s) => s,
        Err(_) => return false,
    };
    let pk: [u8; 32] = match public_key.try_into() {
        Ok(p) => p,
        Err(_) => return false,
    };

    // Use NEAR's built-in Ed25519 verification
    env::ed25519_verify(&sig, message, &pk)
}

/// Verify NEAR Ed25519 signature
/// NEAR uses SHA-256 hash of NEP-413 formatted message
pub fn verify_near_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    // NEAR signs SHA-256 hash of the message (NEP-413 format)
    let hash = env::sha256(message);
    verify_ed25519_signature(public_key, &hash, signature)
}

/// Verify Solana Ed25519 signature
/// Solana signs raw message bytes directly
pub fn verify_solana_signature(public_key: &[u8], message: &[u8], signature: &[u8]) -> bool {
    // Solana signs raw message
    verify_ed25519_signature(public_key, message, signature)
}

/// Verify EVM secp256k1 signature (personal_sign format)
/// Uses NEAR's ecrecover to recover the address
pub fn verify_evm_signature(address: &str, message: &[u8], signature: &[u8]) -> bool {
    // EVM signatures are 65 bytes: r (32) + s (32) + v (1)
    if signature.len() != 65 {
        return false;
    }

    // Parse expected address (remove 0x prefix if present)
    let expected_address = match parse_evm_address(address) {
        Some(addr) => addr,
        None => return false,
    };

    // Create Ethereum signed message hash
    let prefixed_message = create_eth_signed_message(message);
    let message_hash = env::keccak256(&prefixed_message);

    // Parse signature components
    let v = signature[64];
    // Recovery ID: v is either 27/28, convert to 0/1
    let recovery_id = if v >= 27 { v - 27 } else { v };

    // Use NEAR's ecrecover to get public key
    let recovered_pubkey = match env::ecrecover(&message_hash, signature, recovery_id, true)
    {
        Some(pubkey) => pubkey,
        None => return false,
    };

    // Derive address from recovered public key (last 20 bytes of keccak256 hash)
    let pubkey_hash = env::keccak256(&recovered_pubkey);
    let recovered_address: [u8; 20] = pubkey_hash[12..32].try_into().unwrap_or([0u8; 20]);

    // Compare addresses
    recovered_address == expected_address
}

/// Parse EVM address from hex string
fn parse_evm_address(address: &str) -> Option<[u8; 20]> {
    let addr_str = address.strip_prefix("0x").unwrap_or(address);
    if addr_str.len() != 40 {
        return None;
    }

    let bytes = match hex::decode(addr_str) {
        Ok(b) => b,
        Err(_) => return None,
    };

    if bytes.len() != 20 {
        return None;
    }

    let mut result = [0u8; 20];
    result.copy_from_slice(&bytes);
    Some(result)
}

/// Create Ethereum signed message format
/// "\x19Ethereum Signed Message:\n" + len(message) + message
fn create_eth_signed_message(message: &[u8]) -> Vec<u8> {
    let prefix = format!("\x19Ethereum Signed Message:\n{}", message.len());
    let mut result = prefix.into_bytes();
    result.extend_from_slice(message);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_evm_address() {
        let addr = "0x742d35Cc6634C0532925a3b844Bc9e7595f2bD20";
        let result = parse_evm_address(addr);
        assert!(result.is_some());

        let addr_no_prefix = "742d35Cc6634C0532925a3b844Bc9e7595f2bD20";
        let result2 = parse_evm_address(addr_no_prefix);
        assert!(result2.is_some());

        assert_eq!(result, result2);
    }

    #[test]
    fn test_create_eth_signed_message() {
        let message = b"Hello";
        let result = create_eth_signed_message(message);
        let expected = "\x19Ethereum Signed Message:\n5Hello";
        assert_eq!(result, expected.as_bytes());
    }
}
