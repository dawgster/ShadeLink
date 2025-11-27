import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getAssociatedTokenAddress, getAccount } from "@solana/spl-token";
import { config } from "../config";
import { SOL_NATIVE_MINT } from "../constants";

const connection = new Connection(config.solRpcUrl, "confirmed");

/**
 * Get the native SOL balance for an address
 */
export async function getSolBalance(address: string): Promise<bigint> {
  const pubkey = new PublicKey(address);
  const balance = await connection.getBalance(pubkey);
  return BigInt(balance);
}

/**
 * Get the SPL token balance for an address and mint
 */
export async function getTokenBalance(
  ownerAddress: string,
  mintAddress: string,
): Promise<bigint> {
  // If it's native SOL, return the SOL balance
  if (mintAddress === SOL_NATIVE_MINT) {
    return getSolBalance(ownerAddress);
  }

  const ownerPubkey = new PublicKey(ownerAddress);
  const mintPubkey = new PublicKey(mintAddress);

  try {
    const ata = await getAssociatedTokenAddress(mintPubkey, ownerPubkey);
    const account = await getAccount(connection, ata);
    return account.amount;
  } catch (err: any) {
    // Account doesn't exist yet - balance is 0
    if (err.name === "TokenAccountNotFoundError") {
      return BigInt(0);
    }
    throw err;
  }
}

/**
 * Wait for a token balance to reach at least the expected amount
 * @param ownerAddress - The address to check
 * @param mintAddress - The token mint address (or SOL_NATIVE_MINT for native SOL)
 * @param expectedAmount - The minimum expected balance
 * @param timeoutMs - Maximum time to wait (default 10 minutes)
 * @param pollIntervalMs - How often to check (default 5 seconds)
 * @returns The actual balance when it reaches or exceeds expectedAmount
 */
export async function waitForTokenBalance(
  ownerAddress: string,
  mintAddress: string,
  expectedAmount: bigint,
  timeoutMs = 10 * 60 * 1000, // 10 minutes
  pollIntervalMs = 5000, // 5 seconds
): Promise<bigint> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const balance = await getTokenBalance(ownerAddress, mintAddress);

    if (balance >= expectedAmount) {
      return balance;
    }

    console.log(
      `[waitForTokenBalance] Current: ${balance}, expected: ${expectedAmount}, waiting...`,
    );

    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `Timeout waiting for token balance. Expected ${expectedAmount} but current balance is ${await getTokenBalance(ownerAddress, mintAddress)}`,
  );
}

/**
 * Check if a token balance has increased since a previous check
 */
export async function hasBalanceIncreased(
  ownerAddress: string,
  mintAddress: string,
  previousBalance: bigint,
): Promise<{ increased: boolean; currentBalance: bigint }> {
  const currentBalance = await getTokenBalance(ownerAddress, mintAddress);
  return {
    increased: currentBalance > previousBalance,
    currentBalance,
  };
}
