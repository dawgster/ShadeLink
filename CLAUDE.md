# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Shade Agent is a verifiable cross-chain DeFi automation platform enabling trustless, self-custodial operations across Solana, NEAR, and Ethereum. It uses Trusted Execution Environments (TEE) via Phala Cloud and Multi-Party Computation (MPC) chain signatures for secure key management.

**Core Pattern**: Intent Dispatch → Bridge Completion → Destination Action Execution

## Build & Development Commands

```bash
# Development
npm install              # Install dependencies
npm run dev              # Run locally with auto-reload (tsx)
npm run build            # TypeScript compilation to dist/
npm start                # Run built server (requires npm run build first)
npm test                 # Run Vitest unit tests

# Docker
npm run docker:build     # Build amd64 Docker image
npm run docker:push      # Push to registry

# Deployment
npm run phala:deploy     # Deploy to Phala Cloud TEE

# Frontend (separate package)
cd frontend && npm install && npm run dev
```

## Architecture

**Entry Point**: `src/index.ts` - Hono server setup, route mounting, queue consumer startup

**Routes** (`src/routes/`):
- `agentAccount.ts` / `ethAccount.ts` / `solAccount.ts` - Address derivation via chain signatures
- `intents.ts` - Submit and quote cross-chain swaps
- `kaminoPositions.ts` / `burrowPositions.ts` - Query lending positions
- `transaction.ts` - Sign and broadcast Ethereum transactions
- `status.ts` - Intent execution status

**Flows** (`src/flows/`):
- `solSwap.ts` - Solana swap execution via Jupiter
- `kaminoDeposit.ts` / `kaminoWithdraw.ts` - Solana lending (Kamino)
- `burrowDeposit.ts` / `burrowWithdraw.ts` - NEAR lending (Burrow)

**Queue System** (`src/queue/`):
- `consumer.ts` - Intent processing worker with retries and exponential backoff
- `intentsPoller.ts` - Monitors Defuse API for bridge completion
- Redis-backed with dead-letter queue for failed intents

**Utilities** (`src/utils/`):
- `chainSignature.ts` - MPC signing requests
- `signature.ts` / `nearSignature.ts` / `solanaSignature.ts` - Signature verification
- `solana.ts` / `nearTransaction.ts` / `ethereum.ts` - Chain-specific helpers

## Coding Conventions

- TypeScript targeting ES2022 with CommonJS modules, strict mode enabled
- Prefer async/await; keep route handlers small, delegate logic to `src/utils`
- Naming: camelCase for variables/functions, PascalCase for classes/types, kebab-case for files
- 2-space indent, imports ordered (node/third-party/local)

## Testing

- Tests in `src/**/*.(spec|test).ts` using Vitest
- Mock external RPC/REST calls in tests
- Live swap test: `src/flows/solSwap.live.test.ts` runs only when `RUN_LIVE_SOL=1`

## Key Environment Variables

Copy `.env.development.local.example` to `.env.development.local`:

- `NEXT_PUBLIC_contractId` - NEAR contract ID (required for signing/derivation)
- `NEAR_ACCOUNT_ID`, `NEAR_SEED_PHRASE` - NEAR account credentials
- `SOL_RPC_URL`, `ETH_RPC_URL` - Chain RPC endpoints
- `REDIS_URL` - Queue backend (default `redis://127.0.0.1:6379`)
- `DRY_RUN_SWAPS=true` - Skip on-chain sends during development
- `ENABLE_QUEUE=false` - Disable queue consumer (defaults to disabled on testnet)
- `CHAIN_SIGNATURE_CONTRACT_ID`, `NEAR_NETWORK` - Chain signature config

Queue tuning: `MAX_INTENT_ATTEMPTS`, `INTENT_RETRY_BACKOFF_MS`, `STATUS_TTL_SECONDS`

## Intent Pipeline

1. `/api/intents` validates payload and enqueues to Redis
2. Consumer BRPOPs from Redis, validates, sets status to `processing`
3. Executes flow (e.g., `executeSolanaSwapFlow`)
4. Updates status to `succeeded`/`failed`, moves failures to dead-letter queue
5. Status tracked in Redis with 24-hour TTL

## Protocol Integrations

- **Kamino Finance** - Solana lending
- **Burrow Protocol** - NEAR lending
- **Jupiter** - Solana DEX aggregator
- **Defuse Intents** - Cross-chain swaps

Supported chains: NEAR, Solana, Ethereum, Base, Arbitrum
