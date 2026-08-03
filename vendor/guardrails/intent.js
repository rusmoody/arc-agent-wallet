/**
 * Normalised representation of a proposed action.
 *
 * Port of guardrails/intent.py. Semantics must match —
 * see conformance/cases.json.
 */

/** Who proposes the action. */
export const Actor = Object.freeze({
  AGENT: 'agent',
  COUNTERPARTY: 'counterparty',
  USER: 'user',
});

/** Action type. Extended by adapters. */
export const Action = Object.freeze({
  TRANSFER: 'transfer',
  SIGN_CONTRACT: 'sign_contract',
  APPROVE_ALLOWANCE: 'approve_allowance',
  VISIT_LINK: 'visit_link',
  INBOUND_MESSAGE: 'inbound_message',
  INBOUND_CALL: 'inbound_call',
});

/**
 * Artifacts — what participates in the scheme.
 * Deliberately absent: identity, social profiles, photos, connections.
 */
export const ArtifactKind = Object.freeze({
  ADDRESS: 'address',
  CONTRACT: 'contract',
  DOMAIN: 'domain',
  URL: 'url',
  PHONE: 'phone',
  TEXT: 'text',
});

/**
 * @param {string} kind
 * @param {string} value
 * @param {Record<string, unknown>} [facts] external signals attached by the adapter
 */
export function artifact(kind, value, facts = {}) {
  return Object.freeze({ kind, value, facts: Object.freeze({ ...facts }) });
}

let counter = 0;
function newId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `intent-${Date.now()}-${counter++}`;
}

/**
 * @param {{
 *   actor: string, action: string,
 *   artifacts?: ReadonlyArray<object>,
 *   amount?: number|null, currency?: string|null,
 *   context?: Record<string, unknown>, source?: string, intentId?: string,
 * }} spec
 */
export function intent(spec) {
  return Object.freeze({
    actor: spec.actor,
    action: spec.action,
    artifacts: Object.freeze([...(spec.artifacts ?? [])]),
    amount: spec.amount ?? null,
    currency: spec.currency ?? null,
    context: Object.freeze({ ...(spec.context ?? {}) }),
    source: spec.source ?? 'unknown',
    intentId: spec.intentId ?? newId(),
    createdAt: new Date().toISOString(),
  });
}

export function artifactsOf(intentObj, kind) {
  return intentObj.artifacts.filter((a) => a.kind === kind);
}
