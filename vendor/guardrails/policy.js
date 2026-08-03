/**
 * Two independent layers.
 *
 * Envelope  — how much is allowed at all. Hard rules, always in force.
 * Autonomy  — whether to ask for confirmation WITHIN the envelope.
 */

export const Autonomy = Object.freeze({
  NORMAL: 'normal',
  ADVANCED: 'advanced',
});

/**
 * @param {{
 *   perTxCap?: number|null, dailyCap?: number|null,
 *   allowedActions?: ReadonlyArray<string>|null,
 *   allowlist?: ReadonlyArray<string>, denylist?: ReadonlyArray<string>,
 * }} [spec]
 */
export function envelope(spec = {}) {
  return Object.freeze({
    perTxCap: spec.perTxCap ?? null,
    dailyCap: spec.dailyCap ?? null,
    allowedActions: spec.allowedActions ? new Set(spec.allowedActions) : null,
    allowlist: new Set(spec.allowlist ?? []),
    denylist: new Set(spec.denylist ?? []),
  });
}

/** What the envelope forbids here. Empty array = within the envelope. */
export function violations(env, intentObj, spentToday = 0) {
  const out = [];

  if (env.allowedActions !== null && !env.allowedActions.has(intentObj.action)) {
    out.push(`action ${intentObj.action} not allowed by policy`);
  }

  for (const a of intentObj.artifacts) {
    if (env.denylist.has(a.value)) out.push(`${a.value} is on the denylist`);
  }

  if (intentObj.amount !== null && intentObj.amount !== undefined) {
    if (env.perTxCap !== null && intentObj.amount > env.perTxCap) {
      out.push(`amount ${intentObj.amount} exceeds the per-transaction cap ${env.perTxCap}`);
    }
    if (env.dailyCap !== null && spentToday + intentObj.amount > env.dailyCap) {
      out.push(`daily cap ${env.dailyCap} would be exceeded`);
    }
  }

  return out;
}

/**
 * @param {{envelope?: object, autonomy?: string,
 *          confirmThreshold?: number, blockThreshold?: number}} [spec]
 */
export function policy(spec = {}) {
  return Object.freeze({
    envelope: spec.envelope ?? envelope(),
    autonomy: spec.autonomy ?? Autonomy.NORMAL,
    confirmThreshold: spec.confirmThreshold ?? 0.35,
    blockThreshold: spec.blockThreshold ?? 0.75,
  });
}
