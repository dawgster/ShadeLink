/**
 * Permission contract types - matching contracts/permission/src/types.rs
 */

// ─── Basic Types ────────────────────────────────────────────────────────────────

/** Derivation path for MPC key (e.g., "solana-1,user-xyz") */
export type DerivationPath = string;

/** Supported wallet types for signature verification */
export type WalletType = "Near" | "Solana" | "Evm";

/** Price condition for triggering operations */
export type PriceCondition = "Above" | "Below";

// ─── Operation Types ────────────────────────────────────────────────────────────

export interface SwapOperation {
  type: "Swap";
  source_asset: string;
  target_asset: string;
  max_amount: string; // U128 as string
}

export interface LimitOrderOperation {
  type: "LimitOrder";
  price_asset: string;
  quote_asset: string;
  trigger_price: string; // U128 as string
  condition: PriceCondition;
  source_asset: string;
  target_asset: string;
  max_amount: string;
}

export interface StopLossOperation {
  type: "StopLoss";
  price_asset: string;
  quote_asset: string;
  trigger_price: string;
  source_asset: string;
  target_asset: string;
  max_amount: string;
}

export interface TakeProfitOperation {
  type: "TakeProfit";
  price_asset: string;
  quote_asset: string;
  trigger_price: string;
  source_asset: string;
  target_asset: string;
  max_amount: string;
}

export type AllowedOperationType =
  | SwapOperation
  | LimitOrderOperation
  | StopLossOperation
  | TakeProfitOperation;

// ─── Allowed Operation ──────────────────────────────────────────────────────────

export interface AllowedOperation {
  operation_id: string;
  derivation_path: DerivationPath;
  operation_type: AllowedOperationType;
  destination_address: string;
  destination_chain: string;
  slippage_bps: number;
  expires_at?: number; // nanoseconds
  executed: boolean;
  nonce: number;
  created_at: number; // nanoseconds
}

export interface AllowedOperationInput {
  operation_type: AllowedOperationType;
  destination_address: string;
  destination_chain: string;
  slippage_bps: number;
  expires_at?: number; // nanoseconds
}

// ─── Registered Wallet ──────────────────────────────────────────────────────────

export interface RegisteredWallet {
  wallet_type: WalletType;
  public_key: number[]; // Vec<u8> as array
  chain_address: string;
}

// ─── User Permissions View ──────────────────────────────────────────────────────

export interface UserPermissionsView {
  owner_wallets: RegisteredWallet[];
  operations: AllowedOperation[];
  next_nonce: number;
}

// ─── Method Arguments ───────────────────────────────────────────────────────────

export interface RegisterWalletArgs {
  derivation_path: DerivationPath;
  wallet_type: WalletType;
  public_key: number[]; // Vec<u8> as array
  chain_address: string;
  signature: number[]; // Vec<u8> as array
  message: number[]; // Vec<u8> as array
  nonce: number;
}

export interface AddAllowedOperationArgs {
  derivation_path: DerivationPath;
  operation: AllowedOperationInput;
  signature: number[];
  message: number[];
}

export interface RemoveAllowedOperationArgs {
  derivation_path: DerivationPath;
  operation_id: string;
  signature: number[];
  message: number[];
}

export interface SignAllowedArgs {
  derivation_path: DerivationPath;
  operation_id: string;
  payload: number[]; // Transaction bytes
  key_type: "Eddsa" | "Ecdsa";
  tee_price?: string; // U128 as string
  tee_timestamp?: number;
}

// ─── Query Results ──────────────────────────────────────────────────────────────

export interface GetActiveOperationsResult {
  derivation_path: DerivationPath;
  operation: AllowedOperation;
}

// ─── Message Construction ───────────────────────────────────────────────────────

/**
 * Create message for registering a wallet
 */
export function createRegisterWalletMessage(
  derivationPath: string,
  walletType: WalletType,
  publicKey: Uint8Array,
  chainAddress: string,
  nonce: number,
): string {
  return JSON.stringify({
    action: "register_wallet",
    derivation_path: derivationPath,
    wallet_type: walletType,
    public_key: Array.from(publicKey),
    chain_address: chainAddress,
    nonce,
  });
}

/**
 * Create message for adding an allowed operation
 */
export function createAddOperationMessage(
  derivationPath: string,
  operation: AllowedOperationInput,
  nonce: number,
): string {
  return JSON.stringify({
    action: "add_operation",
    derivation_path: derivationPath,
    operation,
    nonce,
  });
}

/**
 * Create message for removing an allowed operation
 */
export function createRemoveOperationMessage(
  derivationPath: string,
  operationId: string,
  nonce: number,
): string {
  return JSON.stringify({
    action: "remove_operation",
    derivation_path: derivationPath,
    operation_id: operationId,
    nonce,
  });
}
