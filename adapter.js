/**
 * Arc adapter.
 *
 * This is the whole point of the project: it sits between what an agent (or a
 * user) wants to do on-chain and the actual signature. It translates a proposed
 * transaction into an Intent, runs it through guardrails-core, and only offers
 * to sign when the engine returns `allow`. A `block` or `confirm` never signs
 * silently — the human is always in the loop for those.
 *
 * The engine knows nothing about Arc. This file is the only place that does.
 */

import {
  Action, Actor, ArtifactKind, artifact, intent,
  Engine, InMemorySink, policy, envelope, Autonomy, DEFAULT_WALLET_RULES,
} from './vendor/guardrails/index.js';

// --- Arc testnet constants (verified from Circle docs) ---
export const ARC = Object.freeze({
  chainId: 5042002,
  chainIdHex: '0x4cf592',           // 5042002 in hex
  rpc: 'https://rpc.testnet.arc.network',
  name: 'Arc Testnet',
  explorer: 'https://testnet.arcscan.app',
  // On Arc, USDC is the gas token. An optional ERC-20 interface also exists.
  usdcErc20: '0x3600000000000000000000000000000000000000',
  usdcDecimals: 6,
  faucet: 'https://faucet.circle.com',
});

const UNLIMITED = (2n ** 256n) - 1n;

/**
 * Local history + reputation the adapter supplies to the engine as facts.
 * In a real deployment this comes from the user's own past transactions and an
 * optional public reports list. Here it's a simple in-memory store the UI seeds,
 * so the engine stays free of any network lookup.
 */
export class LocalKnowledge {
  constructor() {
    this.seenAddresses = new Set();   // addresses the user has transacted with
    this.contractAges = new Map();    // address -> age in days (adapter-fetched)
    this.reports = new Map();         // address -> scam_reports count
  }

  markSeen(addr) { this.seenAddresses.add(addr.toLowerCase()); }
  setContractAge(addr, days) { this.contractAges.set(addr.toLowerCase(), days); }
  setReports(addr, n) { this.reports.set(addr.toLowerCase(), n); }

  factsFor(addr) {
    const key = (addr || '').toLowerCase();
    const facts = { seen_before: this.seenAddresses.has(key) };
    if (this.contractAges.has(key)) facts.contract_age_days = this.contractAges.get(key);
    if (this.reports.has(key)) facts.scam_reports = this.reports.get(key);
    return facts;
  }
}

/**
 * Build an Intent from a proposed transfer.
 * @param {{to:string, amount:number|string, currency?:string}} tx
 * @param {LocalKnowledge} know
 */
export function transferIntent(tx, know) {
  const facts = know.factsFor(tx.to);
  return intent({
    actor: Actor.AGENT,
    action: Action.TRANSFER,
    amount: tx.amount,
    currency: tx.currency || 'USDC',
    artifacts: [artifact(ArtifactKind.ADDRESS, tx.to, facts)],
  });
}

/**
 * Build an Intent from a proposed token approval.
 * @param {{spender:string, allowance:bigint|string}} appr
 * @param {LocalKnowledge} know
 */
export function approvalIntent(appr, know) {
  const facts = know.factsFor(appr.spender);
  facts.allowance = appr.allowance?.toString?.() ?? String(appr.allowance);
  return intent({
    actor: Actor.AGENT,
    action: Action.APPROVE_ALLOWANCE,
    artifacts: [artifact(ArtifactKind.CONTRACT, appr.spender, facts)],
  });
}

/**
 * The gate. Given a proposed action, return the engine's verdict plus a single
 * boolean the UI must obey: `mayAutoSign`. Only an `allow` under advanced
 * autonomy may sign without asking. Everything else requires an explicit human
 * tap — and a `block` should not offer signing at all.
 */
export function screen(proposedIntent, userPolicy, spentToday = 0) {
  const engine = new Engine(DEFAULT_WALLET_RULES, userPolicy, new InMemorySink());
  const verdict = engine.evaluate(proposedIntent, spentToday);

  return {
    verdict,
    decision: verdict.decision,
    score: verdict.score,
    reasons: verdict.reasons,
    signals: verdict.signals,
    // The core safety invariant, expressed for the UI:
    mayAutoSign: verdict.decision === 'allow',
    mayOfferSign: verdict.decision !== 'block',
  };
}

export { policy, envelope, Autonomy, DEFAULT_WALLET_RULES, UNLIMITED };
