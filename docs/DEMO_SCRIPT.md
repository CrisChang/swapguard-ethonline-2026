# Human-narrated demo outline — about 3 minutes

Draft only. Record your own clear voice at normal speed, with at least 720p video. Keep the final video between 2 and 4 minutes. Do not substitute text-to-speech, AI voiceover, music-only audio or accelerated footage. Check the final event rules before upload.

## 0:00–0:25 — one problem

“A good quote is not the same as a protected transaction. What if I confirmed one minimum received, but the transaction encodes a lower amount? SwapGuard checks that specific mismatch.”

Show the protection lab with its synthetic-data label visible.

## 0:25–1:15 — controlled example

“This is constructed test data. The quote is 0.400 WETH for 1,000 USDC. I choose 0.5% tolerance, so the minimum is automatically calculated as 0.398 WETH. I do not have to work it out by hand.”

Run Unchanged transaction, then Minimum quietly reduced.

“Only the encoded floor changed, to 0.360. The displayed quote did not change. This no longer preserves my independently confirmed conditions. The 0.038 gap means weaker protection, not actual money lost or saved.”

Show the expected/encoded minimum comparison, then the zero-floor case if time permits.

## 1:15–1:50 — inspectable evidence

Run all 25 cases and download the results.

“We publish inputs and expectations, including valid controls, recipient and amount errors, extra calls and stale confirmations. These are reproducible regression cases, not a real-world security-accuracy benchmark.”

Point to the legacy SwapRouter02-only scope, not Universal Router.

## 1:50–2:35 — practical workflow

Open Quote & tolerance. Select Live onchain, analyze a small WETH/USDC quote and show the block and sources. If RPC fails, keep the error visible or explicitly use the synthetic mode instead.

“This panel reads actual Uniswap quotes and Chainlink references. The user chooses a percentage, not a manual output floor. The protection panel asks them to confirm sender and recipient independently before checking a pasted draft. A constructed draft stays labelled as constructed, even when using a live quote.”

Open Check a transaction draft. Use a clearly labelled example address/draft, never a secret or signature. Show that editing an input clears confirmation.

## 2:35–3:05 — distinction and limits

“Slippage tolerance is the percentage setting; minimum received is the corresponding token amount. SwapGuard does not replace the router's minimum-output check: it checks whether the transaction carries the protection the user chose. A match does not prove execution readiness or safety. No transaction is signed or sent.”

Show the public repository and AI disclosure. Explain only what you have actually reviewed. Do not claim an audit, measured losses prevented or final submission.
