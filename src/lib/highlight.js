// TruLens - Text Highlighting Engine (Cached Score-Based Highlights)

// Import scoring functions for use in classifier
import { scoreAI, scorePol, scoreBias } from "./scoring.js";
import { analyze } from "./heuristics.js";

// ---- HIGHLIGHTS CORE ----

let TL_HL_ON = false;

let TL_SCAN_CACHE = []; // [{ el, score }...] populated by your scan

/**
 * Inject highlight styles into the page
 */
export function injectStyles() {
  if (document.getElementById("trulens-style")) return;
  const style = document.createElement("style");
  style.id = "trulens-style";
  style.textContent = `
    /* highlights on/off gate by class on <html> */
    .tl-hl-on .tl-hl-yellow { background: linear-gradient(to right, rgba(255,235,59,.35), rgba(255,235,59,0)); transition: background .2s; }
    .tl-hl-on .tl-hl-red    { background: linear-gradient(to right, rgba(244,67,54,.30), rgba(244,67,54,0)); transition: background .2s; }

    /* when off, ensure background is cleared */
    html:not(.tl-hl-on) .tl-hl-yellow,
    html:not(.tl-hl-on) .tl-hl-red { background: none !important; }

    /* optional subtle outline for accessibility */
    .tl-hl-outline { outline: 2px solid rgba(255,235,59,.35); outline-offset: 2px; }
    
    .trulens-panel { all: initial; }
  `;
  document.documentElement.appendChild(style);
}

function tlSetRootClass(on) {
  TL_HL_ON = !!on;
  document.documentElement.classList.toggle('tl-hl-on', TL_HL_ON);
}

function tlClearHighlights() {
  // Remove our marker classes only; do NOT destroy site text nodes
  document.querySelectorAll('.tl-hl-yellow, .tl-hl-red, .tl-hl-outline').forEach(el => {
    el.classList.remove('tl-hl-yellow','tl-hl-red','tl-hl-outline');
  });
}

function tlApplyHighlights() {
  if (!TL_HL_ON) return;

  // Use the most recent scan results (score per block)

  TL_SCAN_CACHE.forEach(({el, score}) => {
    // classify by your existing thresholds
    if (score >= 60) el.classList.add('tl-hl-red');
    else if (score >= 40) el.classList.add('tl-hl-yellow');
  });
}

async function tlSetHighlights(on) {
  // Persist + update DOM
  tlSetRootClass(on);
  chrome.storage.local.set({ tl_hl_on: TL_HL_ON });
  tlClearHighlights();
  if (TL_HL_ON) tlApplyHighlights();
}

/**
 * Get current highlight state
 * @returns {boolean} Current highlight state
 */
function tlGetHighlights() {
  return TL_HL_ON;
}

/**
 * Clear all highlights and cache
 */
export function clearHighlights() {
  TL_SCAN_CACHE = [];
  tlClearHighlights();
  tlSetRootClass(false);
  chrome.storage.local.set({ tl_hl_on: false });
}

/**
 * Apply highlights to text nodes based on scores
 * @param {Array} spans - Text nodes to potentially highlight
 * @param {Function} scoreFn - Function that returns a score (0-100) for each text chunk
 */
export function applyHighlights(spans, scoreFn) {
  // Clear previous cache
  TL_SCAN_CACHE = [];
  tlClearHighlights();
  
  const applied = [];
  spans.forEach(node => {
    try {
      const t = node.nodeValue;
      if (!t || !t.trim()) return;
      
      const score = scoreFn(t);
      if (score >= 40) { // Only highlight if score >= 40
        // Wrap text node in span
        const wrap = document.createElement("span");
        
        if (node.parentNode) {
          node.parentNode.replaceChild(wrap, node);
          wrap.textContent = t;
          applied.push(wrap);
          
          // Cache element with its score
          TL_SCAN_CACHE.push({ el: wrap, score });
        }
      }
    } catch (e) {
      console.warn("TruLens: Could not highlight node:", e);
    }
  });
  
  // Apply highlights if enabled
  if (TL_HL_ON) {
    tlApplyHighlights();
  }
  
  return applied;
}

/**
 * Create a score function based on analysis metrics
 * Returns a combined score (0-100) for text chunks
 */
export function makeClassifier(analysis) {
  const metrics = analysis.metrics || analysis;
  
  // Calculate base scores for the document
  const aiScore = scoreAI({ metrics });
  const polScore = scorePol({ metrics });
  const biasScore = scoreBias({ metrics });
  
  // Use the maximum of the three scores as the overall signal strength
  const maxScore = Math.max(aiScore, polScore, biasScore);
  
  return function (textChunk) {
    const t = textChunk.toLowerCase();
    
    // Check for specific indicators in this chunk
    const hasAI = /(?:in conclusion|furthermore|additionally|moreover|in summary|it is important to note)/.test(t);
    const hasPol = /(?:left-wing|right-wing|woke|fascist|communist|patriot|globalist|deep state|radical|traitor)/.test(t);
    const hasBias = /(?:clearly|obviously|shocking|outrageous|baseless|allegedly|disgraceful|undeniably)/.test(t);
    
    // If chunk has indicators, use document-level scores
    if (hasAI || hasPol || hasBias) {
      // Weight by which indicators are present
      let chunkScore = 0;
      if (hasAI) chunkScore = Math.max(chunkScore, aiScore);
      if (hasPol) chunkScore = Math.max(chunkScore, polScore);
      if (hasBias) chunkScore = Math.max(chunkScore, biasScore);
      return chunkScore;
    }
    
    // Otherwise return 0 (no highlight)
    return 0;
  };
}

// read stored state on load
chrome.storage.local.get({ tl_hl_on: false }, d => {
  tlSetRootClass(d.tl_hl_on);
});

// Message listener for highlight controls
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (!msg || !msg.type) return false;

  if (msg.type === 'TRULENS_SET_HIGHLIGHTS') {
    tlSetHighlights(!!msg.on).then(() => sendResponse({ ok: true, on: TL_HL_ON }));
    return true; // Keep channel open for async response
  }

  if (msg.type === 'TRULENS_GET_HIGHLIGHTS') {
    sendResponse({ on: TL_HL_ON });
    return true; // Keep channel open
  }

  if (msg.type === 'TRULENS_REQUEST_SCAN') {
    scanAndRender();
    sendResponse({ ok: true });
    return true; // Keep channel open
  }

  return false;
});

/**
 * Get visible paragraph elements from the page
 * @returns {Array<HTMLElement>} Array of visible paragraph elements
 */
function visibleParagraphs() {
  const paragraphs = Array.from(document.querySelectorAll('p, div[class*="text"], div[class*="content"], article p, main p, section p'));
  return paragraphs.filter(el => {
    try {
      const style = window.getComputedStyle(el);
      const isVisible = style.display !== 'none' && 
                        style.visibility !== 'hidden' && 
                        style.opacity !== '0' &&
                        el.offsetHeight > 0 &&
                        el.offsetWidth > 0;
      const hasText = el.innerText && el.innerText.trim().length > 0;
      return isVisible && hasText;
    } catch (e) {
      return false;
    }
  });
}

/**
 * Compute metrics for a given text
 * @param {string} text - Text to analyze
 * @returns {Object} Metrics object
 */
function metricsFor(text) {
  if (!text || text.trim().length === 0) {
    return { ttr: 0, avgLen: 0, sentVar: 0, repeatedBigrams: 0, polHits: 0, biasHits: 0 };
  }
  const analysis = analyze(text);
  return analysis.metrics || analysis;
}

/**
 * Compute a combined score from metrics
 * @param {Object} metrics - Metrics object
 * @returns {Object} Object with score (0-100) and breakdown
 */
function scoreMetrics(metrics) {
  const ai = scoreAI({ metrics });
  const pol = scorePol({ metrics });
  const bias = scoreBias({ metrics });
  // Use the maximum of the three scores as the overall score
  const score = Math.max(ai, pol, bias);
  return { score, ai, pol, bias };
}

/**
 * Scan visible paragraphs and render highlights
 * After scanning visible paragraphs, computes scores per block and updates highlights
 */
function scanAndRender() {
  const blocks = visibleParagraphs();
  
  // compute scores per block with your existing metrics
  const perBlock = blocks.map(el => {
    const m = metricsFor(el.innerText);
    const s = scoreMetrics(m).score; // 0..100
    return { el, score: s };
  });

  TL_SCAN_CACHE = perBlock;          // cache for highlights
  tlClearHighlights();               // remove any stale classes
  if (TL_HL_ON) tlApplyHighlights(); // re-apply if toggle is on

  // ...your existing UI update (badge/panel, reasons, save payload)...
  
  return perBlock;
}

// Export functions for external use
export { tlSetHighlights, tlGetHighlights, tlSetRootClass, tlClearHighlights, tlApplyHighlights, scanAndRender, visibleParagraphs, metricsFor, scoreMetrics };
