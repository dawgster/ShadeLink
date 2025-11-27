import tokenMappings from "./token-mappings.json";

interface Deployment {
  address?: string;
  type?: string;
  decimals: number;
  chainName: string;
  bridge: string;
}

interface GroupedToken {
  defuseAssetId: string;
  symbol: string;
  name: string;
  decimals: number;
  icon: string;
  originChainName: string;
  deployments: Deployment[];
  tags: string[];
}

interface UnifiedToken {
  unifiedAssetId: string;
  symbol: string;
  name: string;
  icon: string;
  groupedTokens: GroupedToken[];
  tags: string[];
}

interface TokenMappings {
  tokens: UnifiedToken[];
}

const mappings = tokenMappings as TokenMappings;

/**
 * Get the Defuse asset ID for a given chain and symbol/address
 * @param chainName - The chain name (e.g., "solana", "eth", "near", "base")
 * @param symbolOrAddress - The token symbol (e.g., "SOL", "USDC") or address
 * @returns The defuseAssetId or null if not found
 */
export function getDefuseAssetId(
  chainName: string,
  symbolOrAddress: string,
): string | null {
  const normalizedSymbol = symbolOrAddress.toUpperCase();
  const normalizedChain = chainName.toLowerCase();

  for (const token of mappings.tokens) {
    // Check if symbol matches
    if (token.symbol.toUpperCase() === normalizedSymbol) {
      // Find the grouped token for the specified chain
      for (const grouped of token.groupedTokens) {
        if (grouped.originChainName === normalizedChain) {
          return grouped.defuseAssetId;
        }
        // Also check deployments for the chain
        for (const deployment of grouped.deployments) {
          if (deployment.chainName === normalizedChain) {
            return grouped.defuseAssetId;
          }
        }
      }
    }

    // Check grouped tokens for address match
    for (const grouped of token.groupedTokens) {
      for (const deployment of grouped.deployments) {
        if (
          deployment.chainName === normalizedChain &&
          deployment.address?.toLowerCase() === symbolOrAddress.toLowerCase()
        ) {
          return grouped.defuseAssetId;
        }
      }
    }
  }

  return null;
}

/**
 * Get the Defuse asset ID for native SOL
 */
export function getSolDefuseAssetId(): string {
  return "nep141:sol.omft.near";
}

/**
 * Get token info by defuseAssetId
 */
export function getTokenByDefuseId(defuseAssetId: string): GroupedToken | null {
  for (const token of mappings.tokens) {
    for (const grouped of token.groupedTokens) {
      if (grouped.defuseAssetId === defuseAssetId) {
        return grouped;
      }
    }
  }
  return null;
}

/**
 * Get all tokens for a specific chain
 */
export function getTokensForChain(chainName: string): GroupedToken[] {
  const normalizedChain = chainName.toLowerCase();
  const result: GroupedToken[] = [];

  for (const token of mappings.tokens) {
    for (const grouped of token.groupedTokens) {
      if (grouped.originChainName === normalizedChain) {
        result.push(grouped);
        continue;
      }
      for (const deployment of grouped.deployments) {
        if (deployment.chainName === normalizedChain) {
          result.push(grouped);
          break;
        }
      }
    }
  }

  return result;
}
