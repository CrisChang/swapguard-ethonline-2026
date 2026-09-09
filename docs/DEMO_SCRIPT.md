# SwapGuard — human-narrated demo, about 3 minutes

Draft for the updated task-workbench build. Record in your own clear voice, at normal speed, with at least 720p video. Target 2–4 minutes and verify the current event rules before upload. This script is not a completed video.

## 0:00–0:25 — the specific problem

“A failed swap is not a free retry. For a small automated trade, the approval and failed attempts can consume the budget even when nothing completes. SwapGuard keeps one original price floor and one gas ledger for the whole task.”

Show the workbench and its **Replay only · no wallet** label. Keep the constructed-data disclosure visible.

## 0:25–0:55 — conditions, not another slippage slider

“This is a constructed replay anchored to measured gas and quotes from a local Ethereum fork. I want to exchange 0.04 WETH. My initial tolerance sets a minimum of 100.195216 USDC. Separately, I allow up to three USDC-equivalent of gas across approvals and retries. I choose timely execution and at most three swap attempts.”

Default scenario: **Revert, then recover**. Confirm and click **Create replay task**. Gas is paid in ETH; USDC-equivalent is a common accounting unit. No real wallet authorization is requested.

## 0:55–1:40 — approval, failure, retry

Click **Check & advance replay**, then **Reconcile synthetic receipt**.

“The approval costs about 0.347 USDC-equivalent. We recheck before preparing the swap. Approval alone is not permission to ignore the remaining budget.”

Check again and reconcile the first swap receipt.

“This synthetic first attempt reverts. Its gas remains charged: total spending is now about 1.404. The minimum output did not move and the approval is not repeated.”

Click **Run remaining replay**.

“The second swap completes. Total replay gas is about 1.743, including the failed attempt. We show output separately from output minus all task gas. These are constructed results, not real savings or a live trade.”

## 1:40–2:10 — the negative case matters

Export the report. Create another task, choose **Cost-first** and **Waiting misses the floor**, confirm, and run the replay.

“Waiting can reduce fees, but it can also miss the trade. This task does not complete. We report no output, not a successful zero-cost trade. Our frozen pilot likewise completed fewer tasks with the first cost-first policy: 28 out of 48, versus 34 for immediate execution.”

## 2:10–2:45 — protocol integration and evidence

Open **Quote & tolerance**, choose **Live onchain** and query WETH/USDC. Show the block, Uniswap v3 quotes and Chainlink sources. If RPC fails, retain the error; never relabel a sample as live.

“The live panel reads actual Uniswap and Chainlink contracts. A separate legacy SwapRouter02 checker verifies original minimum-output and deadline consistency. We also ran a local-fork approval, deliberately reverted swap, and successful retry through the same ledger, using fake funds. The receipt proof is in the public repository.”

Optional: show `experiments/results/task-loop-25938600.json`. Its first revert is deliberately forced by a stronger minimum, not an observed MEV event. Local hashes are not mainnet transactions.

## 2:45–3:10 — precise contribution and limits

“The contribution is task-level constraints, receipt accounting and reproducible evidence — not inventing slippage or claiming better routing. The website is a replay and read-only prototype. It does not sign or broadcast transactions; its budget checks are estimates, not an onchain guarantee. Waiting is a user tradeoff, not a promise of more fills.”

Show the repository and AI disclosure. Explain only the code you have reviewed. Final competition submission and sponsor feedback are separate steps.
