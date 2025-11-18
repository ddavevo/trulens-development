// TruLens Popup - Extension Popup Interface

const urlEl = document.getElementById("url");
const aiEl = document.getElementById("ai");
const polEl = document.getElementById("pol");
const biasEl = document.getElementById("bias");
const scanBtn = document.getElementById("scan");
const exportBtn = document.getElementById("export");

console.log("TruLens Popup: Loading...");

// Load last scan results
chrome.storage.local.get("lastTruLens", ({ lastTruLens }) => {
  console.log("TruLens Popup: Last scan data:", lastTruLens);
  
  if (lastTruLens) {
    try {
      urlEl.textContent = new URL(lastTruLens.url).hostname;
    } catch (e) {
      urlEl.textContent = lastTruLens.url || "—";
    }
    aiEl.textContent = lastTruLens.scores.ai + "%";
    polEl.textContent = lastTruLens.scores.pol + "%";
    biasEl.textContent = lastTruLens.scores.bias + "%";
  } else {
    urlEl.textContent = "No scans yet";
    console.log("TruLens Popup: No previous scans found");
  }
});

// Scan current tab - CSP-safe message passing
document.getElementById("scan").addEventListener("click", async ()=>{
  const [tab] = await chrome.tabs.query({active:true,currentWindow:true});
  if (!tab?.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: "TRULENS_OPEN_AND_SCAN" });
  window.close();
});

// Export last scan as JSON
exportBtn.addEventListener("click", () => {
  console.log("TruLens Popup: Export JSON clicked");
  
  chrome.storage.local.get("lastTruLens", ({ lastTruLens }) => {
    const data = lastTruLens || { 
      message: "No scan data available",
      timestamp: new Date().toISOString()
    };
    
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    
    // Use chrome.downloads API
    chrome.downloads.download({
      url: url,
      filename: "trulens-result.json",
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error("TruLens Popup: Download error:", chrome.runtime.lastError);
        // Fallback: open in new tab
        window.open(url, "_blank");
      } else {
        console.log("TruLens Popup: Export initiated, download ID:", downloadId);
        // Clean up blob URL after a delay
        setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    });
  });
});

function activeTab(cb) {
  chrome.tabs.query({ active: true, currentWindow: true }, tabs => cb(tabs?.[0]));
}

function getHL(cb) {
  activeTab(tab => {
    if (!tab?.id) return cb(false);
    chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_GET_HIGHLIGHTS' }, res => cb(!!res?.on));
  });
}

function setHL(on, cb) {
  activeTab(tab => {
    if (!tab?.id) return cb(false);
    chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_SET_HIGHLIGHTS', on }, res => cb(!!res?.ok));
  });
}

// Wire UI
const hlToggle = document.getElementById('popup-hl-toggle'); // checkbox or button you have in popup.html

if (hlToggle) {
  // Initialize from tab state
  getHL(on => {
    if ('checked' in hlToggle) hlToggle.checked = on;
    else hlToggle.textContent = on ? 'Turn Highlights Off' : 'Turn Highlights On';
  });

  hlToggle.addEventListener('click', () => {
    if ('checked' in hlToggle) {
      setHL(hlToggle.checked, () => {});
    } else {
      getHL(on => setHL(!on, () => {
        getHL(newOn => hlToggle.textContent = newOn ? 'Turn Highlights Off' : 'Turn Highlights On');
      }));
    }
  });
}

console.log("TruLens Popup: Ready");
