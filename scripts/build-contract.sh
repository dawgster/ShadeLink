#!/bin/bash
set -e

# Build the NEAR permission contract
# Uses cargo-near for proper ABI generation and WASM optimization
# Requires: cargo-near (install with: curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh)

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
CONTRACT_DIR="$PROJECT_ROOT/contracts/permission"

echo "Building permission contract..."
echo "Contract directory: $CONTRACT_DIR"

cd "$CONTRACT_DIR"

# Check for cargo-near
if ! command -v cargo-near &> /dev/null; then
    echo "cargo-near not found. Installing..."
    curl --proto '=https' --tlsv1.2 -LsSf https://github.com/near/cargo-near/releases/latest/download/cargo-near-installer.sh | sh
fi

# Ensure Rust 1.86 is set (required for NEAR compatibility)
rustup override set 1.86 2>/dev/null || true
rustup target add wasm32-unknown-unknown 2>/dev/null || true

# Build the contract with cargo-near
cargo near build non-reproducible-wasm

# Get the output path
WASM_PATH="$CONTRACT_DIR/target/near/permission_contract.wasm"

if [ -f "$WASM_PATH" ]; then
    # Get file size
    SIZE=$(ls -lh "$WASM_PATH" | awk '{print $5}')
    echo ""
    echo "✅ Contract built successfully!"
    echo "   Output: $WASM_PATH"
    echo "   Size: $SIZE"

    # Copy to a more accessible location
    mkdir -p "$PROJECT_ROOT/out"
    cp "$WASM_PATH" "$PROJECT_ROOT/out/permission_contract.wasm"
    echo "   Copied to: $PROJECT_ROOT/out/permission_contract.wasm"

    # Also copy ABI if available
    ABI_PATH="$CONTRACT_DIR/target/near/permission_contract_abi.json"
    if [ -f "$ABI_PATH" ]; then
        cp "$ABI_PATH" "$PROJECT_ROOT/out/"
        echo "   ABI copied to: $PROJECT_ROOT/out/permission_contract_abi.json"
    fi
else
    echo "❌ Build failed - WASM file not found"
    exit 1
fi
