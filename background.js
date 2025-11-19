// TruLens Background Service Worker (MV3)
// Message hub + storage management

chrome.runtime.onInstalled.addListener(async () => {
  // Seed defaults on install
  const defaults = {
    settings: {
      smartBubbles: true,
      selectionToolbar: true,
      highlights: false,
      quietMode: false,
      onDeviceLearning: false
    },
    weights: {
      avgSentLen: 0.15,
      stdSentLen: 0.10,
      ttr: 0.20,
      commaChainRate: 0.05,
      repetition: 0.15,
      punctRate: 0.05,
      quotes: 0.10,
      opinion: 0.10,
      balance: 0.10
    },
    scans: [],
    highlights: []
  };

  const existing = await chrome.storage.local.get(['settings', 'weights', 'scans', 'highlights']);
  
  if (!existing.settings) {
    await chrome.storage.local.set({ settings: defaults.settings });
  }
  if (!existing.weights) {
    await chrome.storage.local.set({ weights: defaults.weights });
  }
  if (!existing.scans) {
    await chrome.storage.local.set({ scans: [] });
  }
  if (!existing.highlights) {
    await chrome.storage.local.set({ highlights: [] });
  }
});

// Message handlers
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'TRULENS_SAVE') {
    handleSave(message.payload);
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'TRULENS_GET_LATEST') {
    handleGetLatest().then(data => {
      sendResponse({ success: true, data });
    }).catch(err => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }

  if (message.type === 'TRULENS_GET_SETTINGS') {
    chrome.storage.local.get('settings').then(result => {
      sendResponse({ success: true, data: result.settings || {} });
    });
    return true;
  }

  if (message.type === 'TRULENS_SET_SETTINGS') {
    chrome.storage.local.set({ settings: message.settings }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'TRULENS_GET_WEIGHTS') {
    chrome.storage.local.get('weights').then(result => {
      sendResponse({ success: true, data: result.weights || {} });
    });
    return true;
  }

  if (message.type === 'TRULENS_SET_WEIGHTS') {
    chrome.storage.local.set({ weights: message.weights }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'TRULENS_RESET_WEIGHTS') {
    const defaults = {
      avgSentLen: 0.15,
      stdSentLen: 0.10,
      ttr: 0.20,
      commaChainRate: 0.05,
      repetition: 0.15,
      punctRate: 0.05,
      quotes: 0.10,
      opinion: 0.10,
      balance: 0.10
    };
    chrome.storage.local.set({ weights: defaults }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  if (message.type === 'TRULENS_GET_HIGHLIGHTS') {
    chrome.storage.local.get('highlights').then(result => {
      sendResponse({ success: true, data: result.highlights || [] });
    });
    return true;
  }

  if (message.type === 'TRULENS_SET_HIGHLIGHTS') {
    chrome.storage.local.set({ highlights: message.highlights }).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }

  return false;
});

async function handleSave(payload) {
  const result = await chrome.storage.local.get('scans');
  const scans = result.scans || [];
  scans.unshift(payload);
  
  // Keep only last 50
  const trimmed = scans.slice(0, 50);
  await chrome.storage.local.set({ scans: trimmed });
}

async function handleGetLatest() {
  const result = await chrome.storage.local.get('scans');
  const scans = result.scans || [];
  return scans.length > 0 ? scans[0] : null;
}

