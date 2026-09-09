# Competition network scope — checked 2026-09-09

The published [ETHOnline 2026 rules](https://ethglobal.com/events/ethonline2026/info/details)
and [Uniswap Foundation prize criteria](https://ethglobal.com/events/ethonline2026/prizes/uniswap-foundation)
do not state a requirement for this tooling entry to trade real funds or deploy
a custom contract to mainnet. This is a reading of published criteria, not an
organizer's eligibility approval. Other partner prizes can have different
network requirements and must be checked separately.

Uniswap accepts integration with its protocols, including v3, and ecosystem
tooling. Its listed requirements include a public source repository, FEEDBACK.md,
the external Developer Feedback Form containing that file's link, and README
references allowing reviewers to verify the integration. The external feedback
form has not yet been submitted for this project.

## What this entry actually runs

| Component                | Network / data                                               | Real funds?                          |
| ------------------------ | ------------------------------------------------------------ | ------------------------------------ |
| Public website           | Cloudflare HTTPS application                                 | No                                   |
| Live quote panel         | Ethereum mainnet, chain 1; Uniswap/Chainlink read-only calls | No signing, broadcast or Gas payment |
| Task workbench           | Explicit synthetic browser replay                            | No                                   |
| Recorded execution proof | Local Anvil mainnet fork, chain 31337                        | Fake local funds only                |

The local fork is **not** a transaction on a public testnet such as Sepolia.
Its transaction hashes are local proof, not mainnet explorer links. The app has
no new custom onchain contract to deploy and no live transaction endpoint.
If public testnet execution is added later, label it separately and record real
testnet receipts. Do not imply the present prototype already has that feature.

For this scope, retain real read-only integration evidence plus reproducible
fork tests; do not introduce real-money trading just to make the demo seem more
complete. Reliable live RPC access and an honest 2–4 minute demo remain important.
The event rules also explicitly prohibit text-to-speech / AI voiceover in the
demo video; use the participant's own narration, retain AI-use attribution,
and show meaningful human review and contribution.

## RPC setup is not wallet funding

An RPC endpoint supplies blockchain data. It is not a wallet private key and
does not require a funded competition wallet for these reads. For the hosted
Worker, configure a dedicated HTTPS Ethereum-mainnet URL under the existing
`ETHEREUM_RPC_URL` **Secret** binding in Cloudflare. Do not put it in a `VITE_*`
variable, the public repository, screenshots or chat. Configuring this binding
replaces the default public endpoint list; verify it supports historical-block
`eth_call`, QuoterV2 simulation, and the required request volume. Provider quotas
and free-plan availability must be checked with the selected provider.
