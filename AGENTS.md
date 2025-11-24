# Repository Guidelines

## Project Structure & Module Organization
- Core service code lives in `src/`. `src/index.ts` wires the Hono server, mounts route handlers from `src/routes` (`agentAccount.ts`, `ethAccount.ts`, `transaction.ts`, `status.ts`), and starts a Redis-backed queue consumer.
- Background queue logic sits in `src/queue/` (Redis client, consumer, intent types) and status tracking in `src/state/`. Chain-swap orchestration scaffolding is in `src/flows/solSwap.ts`.
- Shared helpers (fetching on-chain data, signing, HTTP) sit in `src/utils/`. TypeScript declarations for the Shade Agent SDK are in `src/shade-agent-js.d.ts`.
- Build artifacts are emitted to `dist/` by `tsc`. A lightweight demo frontend lives in `frontend/` with its own `package.json`; it talks to the API URLs exposed by the service.

## Build, Test, and Development Commands
- Install dependencies: `npm install`.
- Run locally with auto-reload: `npm run dev` (uses `tsx` to execute `src/index.ts`).
- Type-check and emit JS: `npm run build` (outputs to `dist/`).
- Run the built server: `npm start` (expects prior `npm run build`).
- Docker targets: `npm run docker:build` (amd64 image), `npm run docker:build:no-cache`, `npm run docker:push`, `npm run docker:prune`.
- Deploy to Phala Cloud with the compose + env from this repo: `npm run phala:deploy`.
- Frontend preview: `cd frontend && npm install && npm run dev`.

## Coding Style & Naming Conventions
- Language: TypeScript targeting Node `ES2022` using CommonJS modules. Compiler is `strict`; keep types precise and avoid `any`.
- Prefer async/await; keep route handlers small and delegate logic to `src/utils`.
- Naming: camelCase for variables/functions, PascalCase for classes/types, kebab-case for files.
- Formatting: follow existing whitespace (2-space indent). Keep imports ordered (node/third-party/local) and remove unused symbols to satisfy the compiler.

## Testing Guidelines
- Automated tests live under `src/**/*.(spec|test).ts` (Vitest). Run with `npm test`. Add coverage for route handlers and utility modules, mocking external RPC/REST calls.
- For manual checks, exercise `GET /api/agent-account`, `GET /api/eth-account`, and `POST /api/transaction` against the local server.

## Commit & Pull Request Guidelines
- Use clear, lowercase/imperative commit messages (e.g., `add eth tx handler`, `fix phala deploy config`), mirroring the existing simple history.
- PRs should describe changes, include any required environment notes, and link issues. Add logs or screenshots for API/CLI output when relevant (e.g., deployed endpoint URLs).

## Security & Configuration Tips
- Copy `.env.development.local.example` to `.env.development.local` and fill required keys (NEAR account ID, Phala token, RPC endpoints). Do not commit secrets.
- Queue + swap settings: `REDIS_URL` (e.g., `redis://127.0.0.1:6379`), `REDIS_QUEUE_KEY` (default `near:intents`), `SOL_RPC_URL`, `JUPITER_API_URL`, optional `JUPITER_CLUSTER` (`mainnet`/`devnet`), and `DRY_RUN_SWAPS=true` to avoid on-chain sends while wiring the flow. Chain signatures default to mainnet `v1.signer` with the provided MPC key; override via `CHAIN_SIGNATURE_CONTRACT_ID`, `NEAR_NETWORK` (`mainnet`/`testnet`), `CHAIN_SIGNATURE_MPC_KEY`. On `NEAR_NETWORK=testnet`, defaults shift to devnet Solana RPC and `v1.signer-prod.testnet`.
- Queue behavior knobs: `MAX_INTENT_ATTEMPTS` (default 3), `INTENT_RETRY_BACKOFF_MS` (default 1000, exponential via attempt multiplier), `REDIS_DEAD_LETTER_KEY` (default `near:intents:dead-letter`), status TTL via `STATUS_TTL_SECONDS` (default 86400). Jupiter/price fetch retries: `JUPITER_MAX_ATTEMPTS` (default 3), `JUPITER_RETRY_BACKOFF_MS` (default 500), `PRICE_FEED_MAX_ATTEMPTS` (default 3), `PRICE_FEED_RETRY_BACKOFF_MS` (default 500).
- Redis intent payload (stringified JSON) expected by the consumer: `intentId` (unique), `sourceChain` (e.g., `solana`), `destinationChain` (`solana`), `sourceAsset` (input mint), `finalAsset` (output mint), `sourceAmount` (base units), `slippageBps` (int), `userDestination` (recipient on Solana), `agentDestination` (agent-owned Solana address), optional `depositMemo`, `originTxHash`, `sessionId`, `metadata`.
- When moving from local to TEE, ensure `NEXT_PUBLIC_contractId` uses the correct prefix (`ac-proxy.` for local, `ac-sandbox.` for Phala). Verify Docker is running before deployments, and prune images cautiously.

## Code Analysis — 2025-11-21
- **Server/Routes**: `src/index.ts` wires Hono with CORS, health check, and API mounts for `/api/{eth-account,agent-account,transaction,status,chainsig-test,intents}`. Queue consumer starts automatically unless `ENABLE_QUEUE=false` (defaults to disabled on testnet). `/api/status/:intentId` now reads Redis-backed status entries (24h TTL).
- **Intent pipeline**: `/api/intents` validates payloads (destination must be Solana, numeric `sourceAmount`, default `slippageBps` 300) then enqueues to Redis and marks status `pending` in Redis. Consumer (`src/queue/consumer.ts`) BRPOPs from Redis into a processing list, validates again, sets `processing`, runs `executeSolanaSwapFlow`, and marks `succeeded`/`failed` before acking; statuses survive restarts while Redis retains keys.
- **Solana swap flow**: `executeSolanaSwapFlow` halts early with `dry-run-<intentId>` when `DRY_RUN_SWAPS=true`. Otherwise derives agent pubkey via chain-signature, fetches Jupiter quote/swap (honoring `JUPITER_CLUSTER`) with request timeouts, builds a `VersionedTransaction`, requests Near chain-signature using `solana-1`, attaches signature, and broadcasts via `SOL_RPC_URL`.
- **Ethereum path**: `ethAccount` now fails fast when `NEXT_PUBLIC_contractId` is missing before attempting derivation. RPC URL and price-pusher contract address come from config/env (defaults still point to Sepolia test contract). `transaction` fetches ETH price from OKX/Coinbase with timeouts, prepares `updatePrice` calldata, requests ECDSA signature for `ethereum-1`, finalizes the tx, broadcasts, and returns the hash plus price.
- **Config defaults** (`src/config.ts`): loads `.env.development.local` when not production. Provides fallbacks for Redis, Solana RPC, Jupiter URLs, Ethereum RPC/contract, chain-signature contract/network/mpc key, and toggles queue. Warns when `NEXT_PUBLIC_contractId` absent (prevents signing/derivation). Defaults to mainnet chain-signature contract/key even on local unless overridden.
- **Tests**: Vitest suite covers swap flow helpers, queue consumer stubs, signature parsing, and intent validation; run via `npm test`.
- **Reliability changes**: Consumer retries failed intents up to `MAX_INTENT_ATTEMPTS` with exponential backoff and pushes final failures to a dead-letter list. Status writes are durable in Redis with TTL.
- **Known gaps/risks**: External APIs (Jupiter/OKX/Coinbase) still lack circuit-breaking or jittered retry beyond simple backoff; rate limits may still throttle. Queue auto-enables on mainnet-like settings unless `ENABLE_QUEUE=false`. Status TTL depends on Redis availability. HTTP route coverage now includes intents/status/agent-account/eth-account/transaction/chainsig-test; remaining gaps are response schema drift and live RPC/signature integration.

## Live Testing
- Optional devnet swap test: `src/flows/solSwap.live.test.ts` runs only when `RUN_LIVE_SOL=1` is set. Requires `NEXT_PUBLIC_contractId`, `SOL_RPC_URL` pointing to devnet, and env vars `LIVE_SOL_DESTINATION` and `LIVE_SOL_AGENT` (Solana addresses). Disables `DRY_RUN_SWAPS` for this test. Use small amounts (`sourceAmount` is tiny wrapped SOL) and ensure a funded agent key.
