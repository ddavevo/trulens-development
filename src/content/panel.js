// TruLens Panel — Shadow DOM, runs when imported by content script
import { extractText, analyze } from "../lib/heuristics.js";
import { scoreAI, scorePol, scoreBias } from "../lib/scoring.js";
import { injectStyles as injectHLStyles, applyHighlights, clearHighlights, makeClassifier } from "../lib/highlight.js";
import { buildOpposingQueries } from "../lib/perspective.js";

(function init() {
  let host = document.getElementById("trulens-root");
  if (!host) { host = document.createElement("div"); host.id="trulens-root"; document.documentElement.appendChild(host); }
  if (host.shadowRoot) return; // already mounted

  const shadow = host.attachShadow({ mode:"open" });

  // CSS in Shadow
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("src/styles/panel.css");
  shadow.appendChild(link);

  // Panel HTML
  shadow.innerHTML += `
    <div id="panel">
      <header><strong>TruLens</strong><button id="close">×</button></header>
      <section id="scores">
        <div class="card"><div>AI-like</div><div id="score-ai">–</div></div>
        <div class="card"><div>Polarization</div><div id="score-pol">–</div></div>
        <div class="card"><div>Bias</div><div id="score-bias">–</div></div>
      </section>
      <section id="legend">
        <span class="chip yellow"></span> AI-like (≥40%)
        <span class="chip red"></span> High (≥60%)
      </section>
      <section id="controls">
        <button id="scan">Scan</button>
        <label><input type="checkbox" id="toggle-highlights" checked> Highlights</label>
        <button id="clear">Clear</button>
      </section>
      <section id="perspective"><h4>Perspective Check</h4><div id="links"></div></section>
      <footer><small>Signals are heuristic and informational. Verify sources.</small></footer>
    </div>
  `;

  // Make visible
  Object.assign(host.style, { width:"360px", height:"100vh" });

  const $ = s => shadow.querySelector(s);
  const scoreAIEl = $("#score-ai"), scorePolEl = $("#score-pol"), scoreBiasEl = $("#score-bias"), linksEl = $("#links");
  const toggleHighlights = $("#toggle-highlights");

  function setScores(ai, pol, bias) {
    scoreAIEl.textContent   = ai   === undefined ? "–" : `${ai}%`;
    scorePolEl.textContent  = pol  === undefined ? "–" : `${pol}%`;
    scoreBiasEl.textContent = bias === undefined ? "–" : `${bias}%`;
  }

  // Track highlight state locally
  let localHlState = false;

  // Restore highlight toggle state
  function restoreToggle() {
    chrome.storage.local.get({ tl_hl_on: false }, d => {
      localHlState = d.tl_hl_on;
      toggleHighlights.checked = d.tl_hl_on;
      // Sync with highlight module via message
      chrome.runtime.sendMessage({ type: 'TRULENS_SET_HIGHLIGHTS', on: d.tl_hl_on });
    });
  }

  // Wire highlight toggle
  function wireToggle() {
    toggleHighlights.addEventListener("change", e => {
      const on = !!e.target.checked;
      localHlState = on;
      chrome.runtime.sendMessage({ type: 'TRULENS_SET_HIGHLIGHTS', on });
    });
  }

  async function runScan(){
    try{
      injectHLStyles(); // page-level highlight CSS
      clearHighlights();
      const { text, spans } = extractText();
      if (!text || !spans.length) { setScores(0,0,0); linksEl.innerHTML = ""; return; }
      const analysis = analyze(text);
      const ai = scoreAI(analysis), pol = scorePol(analysis), bias = scoreBias(analysis);
      setScores(ai,pol,bias);

      linksEl.innerHTML = "";
      buildOpposingQueries(document.title,"auto").slice(0,6).forEach(url=>{
        const a=document.createElement("a"); a.href=url; a.target="_blank"; a.rel="noopener"; a.textContent=url; linksEl.appendChild(a);
      });

      const classifier = makeClassifier(analysis);
      applyHighlights(spans, classifier);
      
      // Apply current toggle state via message (this will apply highlights if enabled)
      chrome.runtime.sendMessage({ type: 'TRULENS_SET_HIGHLIGHTS', on: toggleHighlights.checked }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[TruLens] Failed to set highlights:", chrome.runtime.lastError);
        }
      });

      chrome.storage.local.set({ lastTruLens: { url:location.href, title:document.title, time:Date.now(), scores:{ai,pol,bias} } });
    }catch(e){ console.error("[TruLens] scan error:", e); }
  }

  $("#scan").addEventListener("click", runScan);
  $("#clear").addEventListener("click", ()=>{ clearHighlights(); setScores(); linksEl.innerHTML=""; });
  $("#close").addEventListener("click", ()=>{
    Object.assign(host.style, { width:"0px", height:"0px", display:"none" });
    // Also hide the panel content
    const panel = shadow.querySelector("#panel");
    if (panel) panel.style.display = "none";
  });

  restoreToggle(); wireToggle();

  // Somewhere after you build the panel DOM:
  // Setup highlight toggle buttons (supports multiple button styles)
  // Checkbox version - search in shadow DOM first, then main document
  const hlBtn = shadow.querySelector('#tl-highlights') || shadow.querySelector('[data-tl="toggle-highlights"]') || document.getElementById('tl-highlights');
  
  // If it's a checkbox:
  if (hlBtn && hlBtn.type === 'checkbox') {
    // initialize
    chrome.storage.local.get({ tl_hl_on: false }, d => { 
      hlBtn.checked = d.tl_hl_on;
      localHlState = d.tl_hl_on;
    });
    hlBtn.addEventListener('change', e => {
      localHlState = !!e.target.checked;
      chrome.runtime.sendMessage({ type: 'TRULENS_SET_HIGHLIGHTS', on: localHlState });
    });
  }

  // If it's a regular button, toggle on click:
  const hlBtn2 = shadow.querySelector('#tl-highlights-btn') || document.getElementById('tl-highlights-btn');
  if (hlBtn2) {
    // Get initial state for button toggle
    chrome.runtime.sendMessage({ type: 'TRULENS_GET_HIGHLIGHTS' }, (response) => {
      if (response && response.on !== undefined) {
        localHlState = response.on;
      }
    });
    
    hlBtn2.addEventListener('click', () => {
      localHlState = !localHlState;
      chrome.runtime.sendMessage({ type: 'TRULENS_SET_HIGHLIGHTS', on: localHlState });
      // Update checkbox states if they exist
      if (toggleHighlights) toggleHighlights.checked = localHlState;
      if (hlBtn && hlBtn.type === 'checkbox') hlBtn.checked = localHlState;
    });
  }

  // Global events from content/popup
  window.addEventListener("trulens:open", ()=> {
    Object.assign(host.style, { width:"360px", height:"100vh", display:"block" });
    const panel = shadow.querySelector("#panel");
    if (panel) panel.style.display = "block";
  });
  window.addEventListener("trulens:scan", runScan);

  // Don't auto-open on load - only open when explicitly requested
})();
