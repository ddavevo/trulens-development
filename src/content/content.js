// TruLens Content Script — badge, Shadow host, message bus, CSP-safe module loading
(() => {
  if (window.__trulensMounted) return;
  window.__trulensMounted = true;

  // Import highlight module early to activate message listener
  import(chrome.runtime.getURL("src/lib/highlight.js")).then(module => {
    // Inject styles immediately
    module.injectStyles();
  }).catch(e => console.error("[TruLens] Failed to load highlight module:", e));

  // Floating badge
  const badge = document.createElement("button");
  badge.id = "trulens-badge";
  badge.textContent = "TruLens";
  Object.assign(badge.style, {
    position:"fixed", bottom:"16px", right:"16px", zIndex:2147483646,
    background:"#4b5cff", color:"#fff", border:"none", borderRadius:"999px",
    padding:"10px 14px", fontSize:"12px", boxShadow:"0 6px 18px rgba(0,0,0,.25)", cursor:"pointer"
  });
  document.documentElement.appendChild(badge);

  // Shadow host for the panel
  let host = document.getElementById("trulens-root");
  if (!host) {
    host = document.createElement("div");
    host.id = "trulens-root";
    Object.assign(host.style, { position:"fixed", top:"0", right:"0", width:"0", height:"0", zIndex:2147483647 });
    document.documentElement.appendChild(host);
  }

  // Load the panel module in the **content script context** (CSP-safe)
  let panelLoaded = false;
  async function ensurePanelLoaded() {
    if (panelLoaded) return;
    await import(chrome.runtime.getURL("src/content/panel.js"));
    panelLoaded = true;
  }

  badge.addEventListener("click", async () => {
    await ensurePanelLoaded();
    window.dispatchEvent(new CustomEvent("trulens:open"));
  });

  // Messages from popup
  chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
    try {
      if (msg?.type === "TRULENS_OPEN" || msg?.type === "TRULENS_OPEN_AND_SCAN") {
        await ensurePanelLoaded();
        window.dispatchEvent(new CustomEvent("trulens:open"));
        if (msg.type === "TRULENS_OPEN_AND_SCAN") {
          setTimeout(() => window.dispatchEvent(new CustomEvent("trulens:scan")), 200);
        }
        sendResponse?.({ ok: true });
      }
    } catch (e) {
      console.error("[TruLens] content error:", e);
      sendResponse?.({ ok:false, error:String(e) });
    }
    return true;
  });
})();
