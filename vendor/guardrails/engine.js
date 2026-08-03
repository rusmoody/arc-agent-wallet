/**
 * The verdict engine.
 *
 * The order is strict and deliberate:
 *   1. Limit envelope.  2. Rules gather signals.  3. Collapse into a score.
 *   4. Thresholds.  5. Autonomy level.  6. Log.
 *
 * No LLM is part of this chain. The model proposes an Intent — that is all.
 */

import { Actor } from './intent.js';
import { policy as makePolicy, violations, Autonomy } from './policy.js';
import { combine, Decision, sortedSignals } from './verdict.js';

export class InMemorySink {
  constructor() {
    this.records = [];
  }

  write(record) {
    this.records.push(record);
  }
}

function auditRecord(intentObj, verdict) {
  return Object.freeze({
    intentId: intentObj.intentId,
    at: new Date().toISOString(),
    actor: intentObj.actor,
    action: intentObj.action,
    artifacts: intentObj.artifacts.map((a) => `${a.kind}:${a.value}`),
    decision: verdict.decision,
    score: Math.round(verdict.score * 1e4) / 1e4,
    signals: sortedSignals(verdict.signals),
    reasons: verdict.reasons,
  });
}

export class Engine {
  constructor(rules, policyObj = null, sink = null) {
    this.rules = [...rules];
    this.policy = policyObj ?? makePolicy();
    this.sink = sink ?? new InMemorySink();
  }

  evaluate(intentObj, spentToday = 0) {
    const reasons = [];

    // 1. Hard layer. Not overridable by rules or by the autonomy level.
    const envViolations = violations(this.policy.envelope, intentObj, spentToday);

    // 2-3. Soft layer.
    const signals = [];
    for (const rule of this.rules) {
      if (rule.appliesTo(intentObj)) signals.push(...rule.evaluate(intentObj));
    }
    const score = combine(signals);

    // 4. Thresholds.
    let decision;
    if (score >= this.policy.blockThreshold) {
      decision = Decision.BLOCK;
      reasons.push(`score ${score.toFixed(2)} above the block threshold`);
    } else if (score >= this.policy.confirmThreshold) {
      decision = Decision.CONFIRM;
      reasons.push(`score ${score.toFixed(2)} above the confirm threshold`);
    } else {
      decision = Decision.ALLOW;
    }

    // 5. The envelope outranks autonomy.
    if (envViolations.length > 0) {
      if (decision !== Decision.BLOCK) decision = Decision.CONFIRM;
      reasons.push(...envViolations);
    } else if (
      decision === Decision.ALLOW
      && intentObj.actor === Actor.AGENT
      && this.policy.autonomy === Autonomy.NORMAL
    ) {
      // The autonomy level applies only to agent actions on our behalf.
      decision = Decision.CONFIRM;
      reasons.push('normal autonomy level — confirm manually');
    }

    const verdict = Object.freeze({
      intentId: intentObj.intentId,
      decision,
      score,
      signals: Object.freeze(signals),
      reasons: Object.freeze(reasons),
    });

    // 6.
    this.sink.write(auditRecord(intentObj, verdict));
    return verdict;
  }
}
