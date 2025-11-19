// TruLens Options Script

document.addEventListener('DOMContentLoaded', async () => {
  // Load current settings
  const settingsResponse = await chrome.runtime.sendMessage({ type: 'TRULENS_GET_SETTINGS' });
  const settings = settingsResponse.data || {};

  // Populate toggles
  document.getElementById('smart-bubbles').checked = settings.smartBubbles !== false;
  document.getElementById('selection-toolbar').checked = settings.selectionToolbar !== false;
  document.getElementById('highlights').checked = settings.highlights === true;
  document.getElementById('quiet-mode').checked = settings.quietMode === true;
  document.getElementById('on-device-learning').checked = settings.onDeviceLearning === true;

  // Load perspective sources
  const perspectiveSources = settings.perspectiveSources || {};
  
  document.getElementById('sources-national').value = 
    (perspectiveSources.National || ['nytimes.com', 'wsj.com', 'usatoday.com']).join(', ');
  document.getElementById('sources-international').value = 
    (perspectiveSources.International || ['bbc.com', 'theguardian.com', 'reuters.com', 'aljazeera.com']).join(', ');
  document.getElementById('sources-business').value = 
    (perspectiveSources.Business || ['bloomberg.com', 'ft.com']).join(', ');
  document.getElementById('sources-public').value = 
    (perspectiveSources['Public broadcaster'] || ['npr.org', 'pbs.org']).join(', ');
  document.getElementById('sources-factchecks').value = 
    (perspectiveSources['Fact-checks'] || ['apnews.com', 'politifact.com', 'snopes.com']).join(', ');

  // Save button
  document.getElementById('save-settings').addEventListener('click', async () => {
    const newSettings = {
      smartBubbles: document.getElementById('smart-bubbles').checked,
      selectionToolbar: document.getElementById('selection-toolbar').checked,
      highlights: document.getElementById('highlights').checked,
      quietMode: document.getElementById('quiet-mode').checked,
      onDeviceLearning: document.getElementById('on-device-learning').checked,
      perspectiveSources: {
        National: parseDomains(document.getElementById('sources-national').value),
        International: parseDomains(document.getElementById('sources-international').value),
        Business: parseDomains(document.getElementById('sources-business').value),
        'Public broadcaster': parseDomains(document.getElementById('sources-public').value),
        'Fact-checks': parseDomains(document.getElementById('sources-factchecks').value)
      }
    };

    await chrome.runtime.sendMessage({
      type: 'TRULENS_SET_SETTINGS',
      settings: newSettings
    });

    // Notify all tabs
    const tabs = await chrome.tabs.query({});
    for (const tab of tabs) {
      try {
        chrome.tabs.sendMessage(tab.id, { type: 'TRULENS_SETTINGS_UPDATED' });
      } catch (e) {
        // Ignore errors (e.g., chrome:// pages)
      }
    }

    showStatus('Settings saved!');
  });

  // Reset weights button
  document.getElementById('reset-weights').addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ type: 'TRULENS_RESET_WEIGHTS' });
    showStatus('Weights reset to defaults.');
  });
});

function parseDomains(text) {
  return text.split(',').map(d => d.trim()).filter(d => d.length > 0);
}

function showStatus(message) {
  const statusEl = document.getElementById('save-status');
  statusEl.textContent = message;
  statusEl.style.display = 'block';
  setTimeout(() => {
    statusEl.style.display = 'none';
  }, 3000);
}

