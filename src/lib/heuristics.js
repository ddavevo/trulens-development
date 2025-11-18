// TruLens - Text Extraction & Heuristic Analysis

/**
 * Extract visible text nodes from the page, excluding nav/aside/script/style
 * Returns both concatenated text and text node references for highlighting
 */
export function extractText(root = document.body) {
  // Gather visible text nodes (skip nav/aside/script/style)
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const t = node.nodeValue.trim();
      if (!t) return NodeFilter.FILTER_REJECT;
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName;
      
      // Skip structural/hidden elements
      const skipTags = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "IFRAME", "SVG", "ASIDE", "NAV", "FOOTER"]);
      if (skipTags.has(tag)) return NodeFilter.FILTER_REJECT;
      
      // Check visibility with defensive try/catch
      try {
        const style = window.getComputedStyle(parent);
        const hidden = style.display === "none" || style.visibility === "hidden";
        if (hidden) return NodeFilter.FILTER_REJECT;
      } catch (e) {
        // Cross-origin or shadow DOM issue - skip this node
        console.warn("TruLens: Could not check style for node, skipping:", e);
        return NodeFilter.FILTER_REJECT;
      }
      
      return NodeFilter.FILTER_ACCEPT;
    }
  });
  
  let text = "";
  let spans = [];
  let node;
  
  try {
    while ((node = walker.nextNode())) {
      const s = node.nodeValue;
      if (s && s.trim()) {
        text += s + " ";
        spans.push(node);
      }
    }
  } catch (e) {
    console.warn("TruLens: Error during text extraction:", e);
  }
  
  return { text: text.replace(/\s+/g, " ").trim(), spans };
}

/**
 * Simple tokenizer for analyzing text
 */
export function tokenize(sent) {
  return (sent || "").toLowerCase().match(/[a-z0-9'']+|[.,!?;:()]/g) || [];
}

/**
 * Split text into sentences
 */
export function splitSentences(text) {
  return (text.match(/[^.!?]+[.!?]+/g) || [text]).map(s => s.trim()).filter(Boolean);
}

// Polarized lexicon - terms associated with polarized rhetoric
const polarizedLex = [
  "radical", "traitor", "propaganda", "fake news", "patriot", "woke", "fascist", "communist",
  "leftist", "right-wing", "globalist", "deep state", "corrupt elite", "rigged"
];

// Bias markers - hedging and amplifying language
const biasMarkers = [
  "clearly", "obviously", "undeniably", "allegedly", "reportedly", "many say", "everyone knows",
  "disgraceful", "shocking", "outrageous", "massive", "huge", "incredible", "devastating", "baseless", "false"
];

/**
 * Analyze text using local heuristics
 * Returns metrics used for scoring
 */
export function analyze(text) {
  if (!text || text.length < 10) {
    console.warn("TruLens: Insufficient text for analysis");
    return {
      counts: { tokens: 0, words: 0, uniqWords: 0, sentences: 0 },
      metrics: { ttr: 0, avgLen: 0, sentVar: 0, repeatedBigrams: 0, polHits: 0, biasHits: 0 }
    };
  }
  
  const sentences = splitSentences(text);
  const tokens = tokenize(text);
  const words = tokens.filter(t => /^[a-z0-9'']+$/i.test(t));
  const uniq = new Set(words);
  const ttr = words.length ? (uniq.size / words.length) : 0;
  const avgLen = sentences.length ? words.length / sentences.length : 0;

  // Sentence length variance (higher variance may indicate more natural writing)
  const lens = sentences.map(s => tokenize(s).filter(w => /^[a-z0-9'']+$/i.test(w)).length);
  const mean = lens.length ? lens.reduce((a, b) => a + b, 0) / lens.length : 0;
  const variance = lens.length ? lens.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / lens.length : 0;
  const sentVar = Math.sqrt(variance);

  // Repetitive bigrams (repeated phrases may indicate AI generation)
  const bigrams = new Map();
  for (let i = 0; i < words.length - 1; i++) {
    const bg = words[i] + " " + words[i + 1];
    bigrams.set(bg, (bigrams.get(bg) || 0) + 1);
  }
  const repeatedBigrams = [...bigrams.values()].filter(c => c >= 3).length;

  // Polarized lexicon hits
  const polHits = polarizedLex.reduce((acc, term) => {
    const re = new RegExp("\\b" + term.replace(/\s+/g, "\\s+") + "\\b", "i");
    return acc + (re.test(text) ? 1 : 0);
  }, 0);

  // Bias markers
  const biasHits = biasMarkers.reduce((acc, term) => {
    const re = new RegExp("\\b" + term + "\\b", "i");
    return acc + ((text.match(re) || []).length);
  }, 0);

  return {
    counts: { tokens: tokens.length, words: words.length, uniqWords: uniq.size, sentences: sentences.length },
    metrics: { ttr, avgLen, sentVar, repeatedBigrams, polHits, biasHits }
  };
}
