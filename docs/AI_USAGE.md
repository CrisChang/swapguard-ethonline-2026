# AI assistance disclosure

2026-09-10 publication follow-up: the participant authorized GitHub synchronization and publication to the existing site, and requested test-data/report retention on the website. Codex implemented the fixed evidence report section, MCP transcript recorder and integrity checks. Eight synthetic scenarios were actually run through the local MCP transport; inputs remain constructed and the recorded outcomes are not chain-authenticated or independent validation. No human review, real trading or customer adoption is implied by this run.

Date: 2026-09-08. Project: SwapGuard, ETHOnline 2026, Building from Scratch.

## Human direction recorded

The participant created the competition project as **SwapGuard / DeFi / Building from Scratch**, provided the submission-form context and approved starting the first version: “好的，先做第一版吧”. Earlier direction emphasized learning from previous hackathons and preserving unrelated projects. Update 2026-09-10: the participant supplied six original Mandarin voice recordings and confirmed no narration errors; the assembled subtitled video was uploaded, and participant screenshots show project submission and Check-in 2 complete. Manual code review is still not claimed complete.

## AI contribution

An AI coding assistant generated most of this first implementation and iterated on it using compiler, automated test, live RPC and screenshot feedback. AI assistance covered:

- Project setup and build/deployment configuration.
- `src/`: frontend, CSS, validation, integer policy, types and contract interfaces.
- `server/` and `worker/`: RPC integration, synthetic fixtures, API and runtime entry points.
- `tests/`, `scripts/`, CI configuration and verification commands.
- README, feedback notes, source references, submission/demo drafts and this disclosure.
- `public/shield.svg`, created as a new code-native graphic.

Third-party dependencies were installed from npm. The assistant did not copy the participant's earlier hackathon or trading code. No private key, wallet signature or mainnet transaction was used. Read-only mainnet requests were made for validation.

## Working specification used

Build an independent read-only Ethereum WETH/USDC preflight tool. Compare two actual Uniswap v3 single-pool quotes, read Chainlink references at the same block, calculate exact minimum output and transparent risk thresholds, optionally inspect public balance/allowances, and distinguish missing or stale data from a successful check. Samples must be explicitly synthetic and never replace failed live data. Changes to inputs must invalidate old reports. Add tests and inspect desktop/mobile screenshots. Do not modify previous projects or perform wallet actions.

## Additional human direction — 2026-09-09

The participant approved focusing on a concrete minimum-output scenario, publishing constructed test data on the website, and improving automatic minimum-output/slippage UX. The assistant implemented the floor calculation, independent confirmation, narrow legacy decoder, public synthetic lab, tests and revised documentation. This includes `src/lib/protection*.ts`, `src/ProtectionLab.tsx`, `src/protection.css`, `scripts/check-protection.ts` and corresponding tests. Most code, fixtures and prose in this extension were AI-generated. Human code review and final narration are not claimed complete.

## Before final submission

### Task-budget experiment — 2026-09-09

The participant approved testing the task-level cost narrative and asked to run
data first. The assistant wrote the protocol before observing outcomes, generated
the local-only fork calibration scripts, deterministic policy/replay and tests,
and ran them. The stress paths are AI-constructed, not external market samples.
Six independent route/size profiles used real contract execution inside a local
Anvil fork with fake funds; no user wallet or mainnet transaction was involved.
The first wait-for-cheaper-gas policy completed fewer tasks than the baselines;
this negative result is retained in `experiments/`. Human review remains pending.

### Task workbench and receipt loop — 2026-09-09

The participant explicitly requested finishing the task-level loop and updating
the outputs and project description. The assistant wrote the new session state
machine, synthetic browser workbench, local replay persistence, export schema,
unit/browser tests, local-fork receipt proof and revised submission/demo copy.
This includes `src/lib/task-session.ts`, `src/TaskWorkbench.tsx`, its stylesheet,
`scripts/check-task-fork.ts` and corresponding tests. The assistant ran an
isolated fake-money fork approval, induced revert and retry; it did not use
the participant's wallet. Scenarios and prose remain AI-assisted. The older
negative pilot outcomes were retained without retuning. Human code review,
narration, external feedback and final competition submission remain separate.

### Participant review still required

The assistant also investigated the live RPC failure at the participant's request
on 2026-09-09, edited `server/live.ts`, `server/api.ts`, added privacy-safe
`server/rpc-diagnostics.ts` and transport tests, and checked official event/prize
rules. Provider throttling remains unresolved pending independent RPC access;
no production availability or competition eligibility is claimed from unit tests.

The participant should review the implementation and its limits, validate the user experience, decide which sponsor criteria are actually met, retain this assistance disclosure and the genuine commit history, and record their own compliant narration. This document does not assert that AI-generated work alone satisfies the event's meaningful-human-input requirement or that any organizer has approved this entry.

## Agent-facing accounting extension — 2026-09-10

The participant proposed serving existing AI agents through MCP/Skill rather than another swap channel, and explicitly approved modifying the website while retaining manual analysis. Their direction asked to clarify audience, problem, outputs, scope, background and costs across gas and failed trades. The assistant proposed replacing the unproven “minimum loss” claim with task-level accounting and original-condition checks. The prevalence of missing cost records remains a hypothesis, not customer research.

AI assistance generated `src/lib/agent-ledger.ts`, `src/lib/agent-examples.ts`, `src/AgentWorkbench.tsx`, `src/agent-workbench.css`, `server/agent-journal.ts`, `server/mcp.ts`, `scripts/check-mcp.ts`, related tests and documentation. The assistant integrated the official MCP SDK, ran deterministic tests and an actual SDK client/server stdio check with constructed inputs and restart persistence. No live LLM evaluation, authenticated receipt verification, wallet signature or transaction broadcast occurred in this extension. The original frozen pilot and local-fork evidence were not modified. Scope, implementation specification and Agent operating instructions are retained in `AGENT_INTEGRATION.md`.

The earlier RPC-throttling investigation above is historical: a separate 2026-09-10 readiness audit passed both live directions at block 25944202 after dedicated RPC configuration. This does not establish continuous uptime. The earlier participant video and submitted form do not automatically cover this new Agent extension. Human review, external sponsor feedback completion and any form/video revision remain separate participant actions.
