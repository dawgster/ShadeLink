# Codebase Improvement Backlog

Identified during flow architecture refactoring session.

## Completed

- [x] **Registry-based flow dispatch** - Replaced hardcoded if/else with self-registering flows
- [x] **Auto-validate via registry** - Uses `requiredMetadataFields` and `validateMetadata` hooks
- [x] **Extract bridgeBack logic** - Created `src/utils/intents.ts` with shared quote utilities
- [x] **Extract NEAR transaction pattern** - All NEAR flows now use `executeNearFunctionCall` helper

## Quick Wins (Low Effort)

- [x] **Consolidate logging** - Replaced all `console.log` calls with `logger.*` across all flows
- [x] **Centralize signature validation** - Created `src/utils/authorization.ts` with `requireUserDestination`, `validateNearWithdrawAuthorization`, `validateSolanaWithdrawAuthorization`
- [x] **Extract address debug logging** - Added `logNearAddressInfo` and `logSolanaIntentsInfo` helpers to `src/flows/context.ts`
- [~] **Clean up legacy exports** - Keep `executeXxxFlow` wrappers for live tests and direct invocation (used by solSwap.live.test.ts)

## Medium Effort

- [x] **Extract NEAR transaction pattern** - `prepare → sign → finalize → broadcast` (DONE - moved to completed)
- [x] **Extract Solana transaction pattern** - Added `signAndBroadcastSingleSigner` and `signAndBroadcastDualSigner` to `src/utils/solana.ts`
- [x] **Improve type safety** - Added `KitInstruction` and `KitAccountMeta` interfaces for @solana/kit instruction handling in kaminoWithdraw
- [x] **Break down large functions** - Extracted `deriveDepositAddresses`, `loadMarketAndReserve`, `maybeCreateRentFundingInstruction` from `buildKaminoDepositTransaction`

## Higher Effort

- [x] **Add flow unit tests** - All 6 flows now have tests: burrowDeposit (15), burrowWithdraw (14), kaminoDeposit (13), kaminoWithdraw (12), nearSwap (10), solSwap (3), metrics (35) = 102 total
- [ ] **Flow composition system** - Reusable "steps" that flows can compose (deferred - not needed)
- [x] **Metrics/telemetry hooks** - Added `MetricsCollector` class with step timing, error categorization, and structured JSON log output via `emitFlowMetrics()`

## Files Most Affected

| File | Issues |
|------|--------|
| `src/flows/burrowDeposit.ts` | NEAR tx pattern, logging, no tests |
| `src/flows/burrowWithdraw.ts` | NEAR tx pattern, logging, no tests |
| `src/flows/nearSwap.ts` | NEAR tx pattern, logging, no tests |
| `src/flows/kaminoDeposit.ts` | Solana tx pattern, large functions, no tests |
| `src/flows/kaminoWithdraw.ts` | Solana tx pattern, signature validation, no tests |
| `src/flows/solSwap.ts` | Solana tx pattern, type safety |

## Priority Order

1. Extract NEAR transaction pattern (high ROI)
2. Consolidate logging (easy win)
3. Centralize signature validation
4. Extract Solana transaction pattern
5. Add flow unit tests
