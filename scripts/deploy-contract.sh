#!/bin/bash
set -e

# Deploy the NEAR permission contract
# Usage: ./scripts/deploy-contract.sh [testnet|mainnet] [contract-account-id]
#
# Examples:
#   ./scripts/deploy-contract.sh testnet permission.shade.testnet
#   ./scripts/deploy-contract.sh mainnet permission.shade.near

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Parse arguments
NETWORK="${1:-testnet}"
CONTRACT_ID="${2:-}"

if [ -z "$CONTRACT_ID" ]; then
    echo "Usage: $0 [testnet|mainnet] <contract-account-id>"
    echo ""
    echo "Examples:"
    echo "  $0 testnet permission.shade.testnet"
    echo "  $0 mainnet permission.shade.near"
    exit 1
fi

# Validate network
if [ "$NETWORK" != "testnet" ] && [ "$NETWORK" != "mainnet" ]; then
    echo "Error: Network must be 'testnet' or 'mainnet'"
    exit 1
fi

# Set NEAR CLI network
export NEAR_ENV="$NETWORK"

# Check for WASM file
WASM_PATH="$PROJECT_ROOT/out/permission_contract.wasm"
if [ ! -f "$WASM_PATH" ]; then
    echo "WASM file not found at $WASM_PATH"
    echo "Building contract first..."
    "$SCRIPT_DIR/build-contract.sh"
fi

# Double-check WASM exists after build
if [ ! -f "$WASM_PATH" ]; then
    echo "Error: WASM file still not found after build. Check for build errors."
    exit 1
fi

echo ""
echo "Deploying permission contract..."
echo "  Network: $NETWORK"
echo "  Contract ID: $CONTRACT_ID"
echo "  WASM: $WASM_PATH"
echo ""

# Check if near-cli is installed
if ! command -v near &> /dev/null; then
    echo "Error: near-cli not found. Install with: npm install -g near-cli"
    exit 1
fi

# Get MPC contract ID based on network
if [ "$NETWORK" == "testnet" ]; then
    MPC_CONTRACT="v1.signer-prod.testnet"
else
    MPC_CONTRACT="v1.signer"
fi

echo "Using MPC contract: $MPC_CONTRACT"
echo ""

# Deploy the contract
echo "Step 1: Deploying WASM..."
near deploy "$CONTRACT_ID" "$WASM_PATH" --networkId "$NETWORK"

echo ""
echo "Step 2: Initializing contract..."

# Get the deployer account (assumes you're logged in with near-cli)
DEPLOYER=$(near state "$CONTRACT_ID" --networkId "$NETWORK" 2>/dev/null | grep -oP 'signer_id: \K[^,]+' || echo "")

if [ -z "$DEPLOYER" ]; then
    # Try to get from environment or use contract ID as owner
    DEPLOYER="$CONTRACT_ID"
fi

# Initialize the contract
near call "$CONTRACT_ID" new \
    "{\"owner\": \"$DEPLOYER\", \"mpc_contract\": \"$MPC_CONTRACT\"}" \
    --accountId "$CONTRACT_ID" \
    --networkId "$NETWORK" \
    --gas 30000000000000

echo ""
echo "Step 3: Adding TEE relayer (if NEAR_ACCOUNT_ID is set)..."

if [ -n "$NEAR_ACCOUNT_ID" ]; then
    near call "$CONTRACT_ID" add_tee_relayer \
        "{\"relayer\": \"$NEAR_ACCOUNT_ID\"}" \
        --accountId "$CONTRACT_ID" \
        --networkId "$NETWORK" \
        --gas 30000000000000
    echo "Added TEE relayer: $NEAR_ACCOUNT_ID"
else
    echo "Skipped - set NEAR_ACCOUNT_ID to add a TEE relayer"
fi

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Contract: $CONTRACT_ID"
echo "Network: $NETWORK"
echo "MPC Contract: $MPC_CONTRACT"
echo ""
echo "Next steps:"
echo "  1. Add TEE relayers: near call $CONTRACT_ID add_tee_relayer '{\"relayer\": \"<account>\"}' --accountId $CONTRACT_ID"
echo "  2. Update .env with PERMISSION_CONTRACT_ID=$CONTRACT_ID"
echo "  3. Test with: near view $CONTRACT_ID get_config '{}'"
