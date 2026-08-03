/**
 * Rules.
 *
 * A rule looks at an Intent and returns signals. It does NOT make decisions.
 * A rule never touches the network: everything external arrives in artifact.facts.
 */

import { Action, Actor, ArtifactKind, artifactsOf } from './intent.js';
import { signal } from './verdict.js';

/** A freshly registered domain — a phishing classic. */
export class FreshDomainRule {
  constructor(daysThreshold = 30) {
    this.code = 'fresh_domain';
    this.daysThreshold = daysThreshold;
  }

  appliesTo(intentObj) {
    return artifactsOf(intentObj, ArtifactKind.DOMAIN).length > 0
      || artifactsOf(intentObj, ArtifactKind.URL).length > 0;
  }

  evaluate(intentObj) {
    const out = [];
    for (const a of intentObj.artifacts) {
      const age = a.facts.domain_age_days;
      if (age === undefined || age === null || age >= this.daysThreshold) continue;
      out.push(signal({
        code: this.code,
        severity: age < 7 ? 0.6 : 0.4,
        explanation: `The domain ${a.value} was registered ${age} days ago. `
          + 'Scam sites usually live only a few days.',
      }));
    }
    return out;
  }
}

/** The artifact appears in public report registries. */
export class ScamReportsRule {
  constructor() {
    this.code = 'scam_reports';
  }

  appliesTo(intentObj) {
    return intentObj.artifacts.length > 0;
  }

  evaluate(intentObj) {
    const out = [];
    for (const a of intentObj.artifacts) {
      const reports = a.facts.scam_reports;
      if (!reports) continue;
      out.push(signal({
        code: this.code,
        severity: Math.min(0.9, 0.3 + 0.1 * reports),
        explanation: `${a.value} appears in ${reports} scam reports.`,
      }));
    }
    return out;
  }
}

/**
   * Pressure and urgency — the core of almost every scheme.
   * These markers are Russian on purpose: they are detection data. The
   * production detector uses the language-specific dataset files.
   */
export class PressurePatternRule {
  constructor() {
    this.code = 'pressure_pattern';
    this.markers = [
      'срочно', 'немедленно', 'никому неговори', 'никому не сообщайте',
      'счёт заблокирован', 'служба безопасности', 'подтвердите код',
      'переведите на безопасный счёт',
    ];
  }

  appliesTo(intentObj) {
    return intentObj.action === Action.INBOUND_MESSAGE
      || intentObj.action === Action.INBOUND_CALL;
  }

  evaluate(intentObj) {
    const hits = [];
    for (const a of artifactsOf(intentObj, ArtifactKind.TEXT)) {
      const lowered = a.value.toLowerCase();
      for (const m of this.markers) if (lowered.includes(m)) hits.push(m);
    }
    if (hits.length === 0) return [];
    const unique = [...new Set(hits)].sort();
    return [signal({
      code: this.code,
      severity: Math.min(0.85, 0.3 + 0.2 * hits.length),
      explanation: 'The message shows signs of pressure: ' + unique.join(', ')
        + '. Real organisations do not rush you or ask for codes.',
    })];
  }
}

/** A demand for an irreversible payment. */
export class IrreversibleChannelRule {
  constructor() {
    this.code = 'irreversible_channel';
  }

  appliesTo(intentObj) {
    return intentObj.actor === Actor.COUNTERPARTY;
  }

  evaluate(intentObj) {
    const channel = intentObj.context.payment_channel;
    if (!['gift_card', 'crypto', 'wire', 'p2p_transfer'].includes(channel)) return [];
    return [signal({
      code: this.code,
      severity: 0.55,
      explanation: `Payment is requested through an irreversible channel (${channel}). `
        + 'Such a payment is almost impossible to get back.',
    })];
  }
}

/** The agent sends funds to an address with no interaction history. */
export class UnknownRecipientRule {
  constructor() {
    this.code = 'unknown_recipient';
  }

  appliesTo(intentObj) {
    return intentObj.actor === Actor.AGENT && intentObj.action === Action.TRANSFER;
  }

  evaluate(intentObj) {
    const out = [];
    for (const a of artifactsOf(intentObj, ArtifactKind.ADDRESS)) {
      if (a.facts.seen_before) continue;
      out.push(signal({
        code: this.code,
        severity: 0.4,
        explanation: `The recipient ${a.value} has not appeared in history before.`,
      }));
    }
    return out;
  }
}

/**
 * An `approve` that lets a contract move the user's tokens.
 * The single most exploited action in crypto wallets: an unlimited approval
 * to an unknown contract is consent to drain the whole balance later.
 */
export class TokenApprovalRule {
  constructor() {
    this.code = 'token_approval';
    this.UNLIMITED = (2n ** 256n) - 1n;
  }

  appliesTo(intentObj) {
    return intentObj.actor === Actor.AGENT
      && intentObj.action === Action.APPROVE_ALLOWANCE;
  }

  evaluate(intentObj) {
    const out = [];
    for (const a of artifactsOf(intentObj, ArtifactKind.CONTRACT)) {
      const known = a.facts.seen_before === true;
      const allowance = a.facts.allowance;
      const unlimited = allowance !== undefined && allowance !== null
        && BigInt(allowance) >= this.UNLIMITED;

      let severity;
      let explanation;
      if (unlimited && !known) {
        severity = 0.8;
        explanation = `This approves ${a.value} to move an UNLIMITED amount of `
          + 'your tokens, and the contract has no history with you. If it is '
          + 'malicious, it can drain that token entirely, at any later time.';
      } else if (unlimited) {
        severity = 0.5;
        explanation = `This grants ${a.value} an unlimited allowance. Even for a `
          + 'known contract, prefer approving only the amount you need.';
      } else if (!known) {
        severity = 0.45;
        explanation = `This approves an unknown contract (${a.value}) to move your `
          + 'tokens. Approvals are how most wallet-drainer scams work.';
      } else {
        continue;
      }
      out.push(signal({ code: this.code, severity, explanation }));
    }
    return out;
  }
}

/** A contract deployed very recently, for an agent action. */
export class FreshContractRule {
  constructor(daysThreshold = 14) {
    this.code = 'fresh_contract';
    this.daysThreshold = daysThreshold;
  }

  appliesTo(intentObj) {
    return intentObj.actor === Actor.AGENT;
  }

  evaluate(intentObj) {
    const out = [];
    for (const a of intentObj.artifacts) {
      if (a.kind !== ArtifactKind.CONTRACT && a.kind !== ArtifactKind.ADDRESS) continue;
      const age = a.facts.contract_age_days;
      if (age === undefined || age === null || age >= this.daysThreshold) continue;
      out.push(signal({
        code: this.code,
        severity: age < 3 ? 0.5 : 0.35,
        explanation: `The contract ${a.value} was deployed ${age} day(s) ago. `
          + 'Drainer contracts are usually brand new.',
      }));
    }
    return out;
  }
}

export const DEFAULT_GUARDIAN_RULES = Object.freeze([
  new FreshDomainRule(),
  new ScamReportsRule(),
  new PressurePatternRule(),
  new IrreversibleChannelRule(),
]);

export const DEFAULT_WALLET_RULES = Object.freeze([
  new ScamReportsRule(),
  new UnknownRecipientRule(),
  new TokenApprovalRule(),
  new FreshContractRule(),
]);
