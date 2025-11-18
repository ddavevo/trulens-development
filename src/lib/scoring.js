// TruLens - Scoring Engine
// Map heuristic metrics → normalized 0..1 → percent score

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

// Tunable knobs for demo "variance" feel
export const SCORE_WEIGHTS = {
  ai: { lowTTR: 0.35, repeat: 0.35, sentVar: 0.30 },
  pol: { polHits: 0.70, sentVar: 0.30 },
  bias: { biasHits: 0.70, adjStack: 0.30 }
};

/**
 * AI-like Score (0-100)
 * Lower TTR, more repetition, low variance → higher AI-like score
 */
export function scoreAI({ metrics }) {
  // Lower TTR → more AI-like; more repetition → more AI-like; low variance → more AI-like
  const ttrComp = clamp01((0.55 - metrics.ttr) / 0.55);          // ttr < 0.55 increases score
  const repeatComp = clamp01(metrics.repeatedBigrams / 6);        // >=6 repeated bigrams hits 1
  const varComp = clamp01((0.8 - Math.min(metrics.sentVar, 0.8)) / 0.8);
  const s = SCORE_WEIGHTS.ai.lowTTR * ttrComp + SCORE_WEIGHTS.ai.repeat * repeatComp + SCORE_WEIGHTS.ai.sentVar * varComp;
  return Math.round(100 * s);
}

/**
 * Polarization Score (0-100)
 * More polarized terms, higher variance in sentence structure → higher score
 */
export function scorePol({ metrics }) {
  const polComp = clamp01(metrics.polHits / 6);                   // 6+ polarized terms → 1
  const varComp = clamp01(metrics.sentVar / 12);                   // higher variance may correlate with rhetoric
  const s = SCORE_WEIGHTS.pol.polHits * polComp + SCORE_WEIGHTS.pol.sentVar * varComp;
  return Math.round(100 * s);
}

/**
 * Bias Score (0-100)
 * More bias markers, adjectival stacking → higher score
 */
export function scoreBias({ metrics }) {
  const biasComp = clamp01(metrics.biasHits / 10);                 // 10+ bias markers → 1
  const adjStackProxy = clamp01((metrics.avgLen - 22) / 20);         // longer sentences often stack adjectives/adverbs
  const s = SCORE_WEIGHTS.bias.biasHits * biasComp + SCORE_WEIGHTS.bias.adjStack * adjStackProxy;
  return Math.round(100 * s);
}

