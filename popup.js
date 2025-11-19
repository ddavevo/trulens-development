// TruLens Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  // Load current analysis
  await loadAnalysis();

  // Button handlers
  document.getElementById('trulens-open-panel').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_OPEN_PANEL' });
      window.close();
    }
  });

  document.getElementById('trulens-rescan').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_REQUEST_SCAN' });
      setTimeout(() => loadAnalysis(), 500);
    }
  });

  document.getElementById('trulens-toggle-highlights').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_TOGGLE_HIGHLIGHTS' });
    }
  });

  document.getElementById('trulens-open-perspective').addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_REQUEST_PERSPECTIVE' });
      chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_OPEN_PANEL' });
      window.close();
    }
  });

  // Quiet mode toggle
  const quietModeCheckbox = document.getElementById('trulens-quiet-mode');
  const settingsResponse = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
  const settings = settingsResponse.data || {};
  quietModeCheckbox.checked = settings.quietMode || false;

  quietModeCheckbox.addEventListener('change', async () => {
    const newSettings = { ...settings, quietMode: quietModeCheckbox.checked };
    await chrome.runtime.sendMessage({
      type: 'TRULENS_SET_SETTINGS',
      settings: newSettings
    });

    // Notify content script
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) {
      chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_SETTINGS_UPDATED' });
    }
  });
});

async function loadAnalysis() {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_LATEST' });
    const data = response.data;

    if (data) {
      const badgeEl = document.getElementById('trulens-popup-badge');
      const chip = badgeEl.querySelector('.trulens-badge-chip');
      chip.textContent = data.overall || 'Unknown';
      const labelClass = (data.overall || '').includes('AI') ? 'ai' : (data.overall || '').includes('Mixed') ? 'mixed' : 'human';
      chip.className = `trulens-badge-chip ${labelClass}`;
      badgeEl.querySelector('.trulens-badge-sublabel').textContent = 
        `confidence: ${data.confidence || 'steady'}`;
    } else {
      // Try to get from current tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) {
        try {
          chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_GET_LATEST' }, (response) => {
            if (response && response.data) {
              const badgeEl = document.getElementById('trulens-popup-badge');
              const chip = badgeEl.querySelector('.trulens-badge-chip');
              chip.textContent = response.data.overall || 'Analyzing...';
              const labelClass = (response.data.overall || '').includes('AI') ? 'ai' : (response.data.overall || '').includes('Mixed') ? 'mixed' : 'human';
              chip.className = `trulens-badge-chip ${labelClass}`;
              badgeEl.querySelector('.trulens-badge-sublabel').textContent = 
                `confidence: ${response.data.confidence || 'steady'}`;
            }
          });
        } catch (e) {
          // Content script not ready
          const badgeEl = document.getElementById('trulens-popup-badge');
          badgeEl.querySelector('.trulens-badge-chip').textContent = 'Not analyzed';
        }
      }
    }
  } catch (error) {
    console.error('Error loading analysis:', error);
  }
}

