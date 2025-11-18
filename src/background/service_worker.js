// TruLens MVP - Background Service Worker
// Handles extension lifecycle and message passing

chrome.runtime.onInstalled.addListener(() => {
  console.log("TruLens MVP installed.");
});

// Optional: handle messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "SCAN_COMPLETE") {
    // Could update badge or handle other lifecycle events
    console.log("Scan completed on:", sender.tab?.url);
  }
  return true;
});

