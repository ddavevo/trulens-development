// background.js
chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'TP_SELECT') {
    // persist per-tab selection
    chrome.storage.session.set({ ['tp:'+sender.tab.id]: msg.payload });
    // optionally activate sidebar
  }
});
