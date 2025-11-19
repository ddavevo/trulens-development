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
      <section id="controls">
        <button id="scan">Scan</button>
        <button id="clear">Clear</button>
      </section>
      <section id="sources">
        <h4>Alternative Sources</h4>
        <div id="sources-list"></div>
      </section>
      <footer><small>Signals are heuristic and informational. Stay critical, verify sources.</small></footer>
    </div>
  `;

  // Make visible
  Object.assign(host.style, { width:"360px", height:"100vh" });

  const $ = s => shadow.querySelector(s);
  const sourcesListEl = $("#sources-list");

  // Helper function to truncate text to 3 lines
  function truncateToThreeLines(text, maxLength = 200) {
    if (!text) return "";
    // Rough estimate: ~60-70 chars per line for 3 lines
    const truncated = text.length > maxLength ? text.substring(0, maxLength).trim() + "..." : text;
    return truncated;
  }

  // Helper function to extract domain from URL
  function extractDomain(url) {
    try {
      const urlObj = new URL(url);
      return urlObj.hostname.replace('www.', '');
    } catch (e) {
      return url;
    }
  }

  // Function to create source card
  function createSourceCard(source) {
    const card = document.createElement("div");
    card.className = "source-card";
    
    const excerpt = document.createElement("div");
    excerpt.className = "source-excerpt";
    excerpt.textContent = truncateToThreeLines(source.excerpt || source.url);
    
    const urlButton = document.createElement("a");
    urlButton.className = "source-url-button";
    urlButton.href = source.url;
    urlButton.target = "_blank";
    urlButton.rel = "noopener noreferrer";
    urlButton.textContent = extractDomain(source.url);
    
    card.appendChild(excerpt);
    card.appendChild(urlButton);
    
    return card;
  }

  // Function to display alternative sources
  function displaySources(sources) {
    sourcesListEl.innerHTML = "";
    if (!sources || sources.length === 0) {
      const empty = document.createElement("div");
      empty.className = "empty-state";
      empty.textContent = "No alternative sources found. Click Scan to find sources.";
      sourcesListEl.appendChild(empty);
      return;
    }
    
    sources.forEach(source => {
      const card = createSourceCard(source);
      sourcesListEl.appendChild(card);
    });
  }

  // Track highlight state locally
  let localHlState = false;

  async function runScan(){
    try{
      injectHLStyles(); // page-level highlight CSS
      clearHighlights();
      const { text, spans } = extractText();
      if (!text || !spans.length) { 
        displaySources([]);
        return; 
      }
      
      const analysis = analyze(text);
      const ai = scoreAI(analysis), pol = scorePol(analysis), bias = scoreBias(analysis);

      // Build alternative sources
      const searchUrls = buildOpposingQueries(document.title, "auto").slice(0, 6);
      const sources = searchUrls.map(url => {
        // Extract a brief excerpt from the current page topic
        // For now, use the document title and a snippet of text as placeholder excerpt
        const topic = document.title || "";
        const snippet = text.substring(0, 150).replace(/\s+/g, " ").trim();
        const excerpt = topic && snippet ? `${topic}. ${snippet}` : snippet || topic || url;
        
        return {
          url: url,
          excerpt: excerpt
        };
      });

      displaySources(sources);

      const classifier = makeClassifier(analysis);
      applyHighlights(spans, classifier);
      
      // Apply current toggle state via message (this will apply highlights if enabled)
      chrome.runtime.sendMessage({ type: 'TRULENS_SET_HIGHLIGHTS', on: localHlState }, (response) => {
        if (chrome.runtime.lastError) {
          console.warn("[TruLens] Failed to set highlights:", chrome.runtime.lastError);
        }
      });

      chrome.storage.local.set({ lastTruLens: { url:location.href, title:document.title, time:Date.now(), scores:{ai,pol,bias} } });
    }catch(e){ console.error("[TruLens] scan error:", e); }
  }

  $("#scan").addEventListener("click", runScan);
  $("#clear").addEventListener("click", ()=>{ 
    clearHighlights(); 
    displaySources([]);
  });
  $("#close").addEventListener("click", ()=>{
    Object.assign(host.style, { width:"0px", height:"0px", display:"none" });
    // Also hide the panel content
    const panel = shadow.querySelector("#panel");
    if (panel) panel.style.display = "none";
  });


  // Global events from content/popup
  window.addEventListener("trulens:open", ()=> {
    Object.assign(host.style, { width:"360px", height:"100vh", display:"block" });
    const panel = shadow.querySelector("#panel");
    if (panel) panel.style.display = "block";
  });
  window.addEventListener("trulens:scan", runScan);

  // Don't auto-open on load - only open when explicitly requested
})();
