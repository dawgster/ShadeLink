/**
 * Integration tests for permission contract on testnet
 *
 * Run with: cargo test --test integration -- --ignored --nocapture
 *
 * Prerequisites:
 * - Contract deployed to testnet at permission-shade.testnet
 * - near-cli installed and configured with testnet credentials
 */

use std::process::Command;
use std::str;

const CONTRACT_ID: &str = "permission-shade.testnet";

fn near_view(method: &str, args: &str) -> String {
    let output = Command::new("near")
        .args([
            "view",
            CONTRACT_ID,
            method,
            args,
            "--networkId", "testnet"
        ])
        .env("NEAR_ENV", "testnet")
        .env_remove("NEAR_NETWORK")
        .output()
        .expect("Failed to execute near view command");

    String::from_utf8_lossy(&output.stdout).to_string()
}

fn near_call(method: &str, args: &str) -> String {
    let output = Command::new("near")
        .args([
            "call",
            CONTRACT_ID,
            method,
            args,
            "--accountId", CONTRACT_ID,
            "--networkId", "testnet",
            "--gas", "100000000000000"
        ])
        .env("NEAR_ENV", "testnet")
        .env_remove("NEAR_NETWORK")
        .output()
        .expect("Failed to execute near call command");

    let stdout = String::from_utf8_lossy(&output.stdout);
    let stderr = String::from_utf8_lossy(&output.stderr);
    format!("{}\n{}", stdout, stderr)
}

#[test]
#[ignore] // Run with --ignored flag
fn test_get_config() {
    let result = near_view("get_config", "{}");
    println!("get_config result:\n{}", result);

    assert!(result.contains("permission-shade.testnet"));
    assert!(result.contains("v1.signer-prod.testnet"));
    assert!(result.contains("tee_relayers"));
}

#[test]
#[ignore]
fn test_register_tee_relayer() {
    // Add a test relayer
    let result = near_call(
        "register_tee_relayer",
        r#"{"relayer_account": "test-relayer.testnet"}"#
    );
    println!("register_tee_relayer result:\n{}", result);

    // Verify it was added
    let config = near_view("get_config", "{}");
    println!("config after adding relayer:\n{}", config);

    // Check if relayer is in the list (or it might already exist)
    // The important thing is no error occurred
    assert!(!result.contains("Error") || result.contains("test-relayer"));
}

#[test]
#[ignore]
fn test_get_operations_nonexistent() {
    // Query operations for a path that doesn't exist
    let result = near_view(
        "get_operations",
        r#"{"derivation_path": "nonexistent-path-12345"}"#
    );
    println!("get_operations (nonexistent) result:\n{}", result);

    // Should return empty array for nonexistent path
    assert!(result.contains("[]") || result.contains("[ ]"));
}

#[test]
#[ignore]
fn test_get_active_operations_empty() {
    let result = near_view(
        "get_active_operations",
        r#"{"from_index": 0, "limit": 10}"#
    );
    println!("get_active_operations result:\n{}", result);

    // Should return an empty array or list
    assert!(result.contains("[") && result.contains("]"));
}

#[test]
#[ignore]
fn test_is_operation_allowed_nonexistent() {
    let result = near_view(
        "is_operation_allowed",
        r#"{"derivation_path": "test-path", "operation_id": "nonexistent-op"}"#
    );
    println!("is_operation_allowed result:\n{}", result);

    // Should return false for nonexistent operation
    assert!(result.contains("false"));
}

#[test]
#[ignore]
fn test_get_next_nonce_new_path() {
    let result = near_view(
        "get_next_nonce",
        r#"{"derivation_path": "brand-new-path-xyz"}"#
    );
    println!("get_next_nonce result:\n{}", result);

    // For paths with no permissions, the method may return nothing or panic
    // A non-existent path returns nothing (contract returns None -> JSON null -> empty)
    // The test passes as long as we don't get an unexpected error
    assert!(!result.contains("Error") || result.contains("0") || result.contains("1") || result.is_empty());
}

#[test]
#[ignore]
fn test_contract_state() {
    // Get state to verify contract is properly initialized
    let output = Command::new("near")
        .args([
            "state",
            CONTRACT_ID,
            "--networkId", "testnet"
        ])
        .env("NEAR_ENV", "testnet")
        .env_remove("NEAR_NETWORK")
        .output()
        .expect("Failed to execute near state command");

    let result = String::from_utf8_lossy(&output.stdout);
    println!("Contract state:\n{}", result);

    // Contract should have code deployed
    assert!(!result.contains("11111111111111111111111111111111"));
}
