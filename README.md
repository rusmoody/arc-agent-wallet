# arc-agent-wallet

**A wallet on Arc testnet where the engine signs only what it approves.**

Every transaction is screened by
[guardrails-core](https://github.com/rusmoody/guardrails-core) before it can be
signed. An unlimited approval to an unknown contract — the shape of a wallet
drainer — is refused outright and never gets a sign button. Anything unusual
asks first. The routine and safe goes through.

It's the same open decision engine that catches scam messages in
[scam-guardian](https://github.com/rusmoody/scam-guardian), pointed at the other
side of the same problem: not a stranger trying to trick a person, but an action
about to move a person's money.

---

## Why this shape

Agent wallets are coming — software that holds funds and acts on your behalf.
The risk is obvious: an agent that can sign can be tricked, prompted, or buggy
into signing something that drains you. The usual answer is "trust the model."
This is the other answer: **the model proposes, deterministic code decides.**

An LLM (or a user, or another program) can *want* to make a transaction. It only
produces an Intent. Then code with no cleverness and no network checks it against
hard limits and known-bad patterns, and a signature is offered only if it passes.

## The safety invariant

One rule the UI cannot break, enforced in `adapter.js`, not just in the page:

- A **blocked** action gets no sign button at all (`mayOfferSign === false`).
- Only an **allowed** action may sign without a second thought (`mayAutoSign`).
- A **confirm** requires an explicit, informed human tap.

The spending envelope (per-transaction and daily caps) is a hard layer: it holds
even at the most autonomous setting. "Advanced autonomy" means "don't nag me over
routine things," never "no limits."

## What it screens for

From the shared engine's wallet rules:

- **token_approval** — an `approve` that lets a contract move your tokens. An
  unlimited allowance to an unknown contract blocks; even a known contract is
  warned against unlimited approvals. This is how most drainer scams work.
- **fresh_contract** — a contract deployed very recently, the usual shape of a
  drainer.
- **unknown_recipient** — an address with no history with you.
- **scam_reports** — an address appearing in public report lists.

Plus the policy envelope: per-tx cap, daily cap, allowed action types, denylist.

## Running it

This is a static page. No build step.

1. Serve the folder (any static server), or deploy to Netlify.
2. Open it, connect a wallet (MetaMask), approve the switch to **Arc Testnet**
   (chain `5042002`).
3. Fund the wallet with test USDC from [faucet.circle.com](https://faucet.circle.com).
4. Propose a transfer or an approval, screen it, and see the verdict before any
   signature is possible.

On Arc, **USDC is the gas token** — you pay fees in USDC, not ETH. The optional
ERC-20 USDC interface used here is at `0x3600…0000`.

## What this is not

- **Not mainnet.** Arc mainnet isn't live; this targets testnet only. Never point
  it at real funds.
- **Not custody.** The page holds no private key and sends nothing to any server.
  Signing happens in your own wallet.
- **Not a separate engine.** The detection logic lives in `guardrails-core` and is
  vendored here unchanged, so the wallet and the scam detector can't drift apart.

## Layout

```
index.html   the wallet page
wallet.js    UI + ethers.js signing, gated by the verdict
adapter.js   the Arc layer: tx → Intent → engine → gated signature
vendor/guardrails/   the engine, vendored from guardrails-core (do not edit here)
```

## License

Apache-2.0. Built toward Circle's Arc developer grant program and the agentic
economy it's aimed at.
