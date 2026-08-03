/**
 * The result of an evaluation.
 *
 * Probabilities, not verdicts: the engine never asserts "safe".
 * The most it says is "no risk signals found".
 */

export const Decision = Object.freeze({
  ALLOW: 'allow',
  CONFIRM: 'confirm',
  BLOCK: 'block',
});

export const NO_SIGNALS_TEXT =
  'No clear risk signals found. This is not a guarantee of safety — ' +
  'the check only sees known patterns.';

/**
 * A single observation. Not a verdict — a contribution to the overall picture.
 * @param {{code: string, severity: number, explanation: string, source?: string}} spec
 */
export function signal(spec) {
  if (!(spec.severity >= 0 && spec.severity <= 1)) {
    throw new RangeError(`severity out of range 0..1: ${spec.severity}`);
  }
  return Object.freeze({
    code: spec.code,
    severity: spec.severity,
    explanation: spec.explanation,
    source: spec.source ?? 'rule',
  });
}

/**
 * Probabilistic combination: 1 - Π(1 - severity).
 * Many weak signals accumulate, but the score never reaches 1.0.
 */
export function combine(signals) {
  let acc = 1;
  for (const s of signals) acc *= 1 - s.severity;
  return 1 - acc;
}

export function sortedSignals(signals) {
  return [...signals].sort((a, b) => b.severity - a.severity);
}

export function explain(verdict) {
  if (verdict.signals.length === 0) return NO_SIGNALS_TEXT;
  return sortedSignals(verdict.signals).map((s) => `• ${s.explanation}`).join('\n');
}
