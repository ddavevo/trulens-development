// contentScript.js
// 1) Article extraction
function extractArticleText() {
  const article = document.querySelector('article') || document.querySelector('main') || document.body;
  const paragraphs = Array.from(article.querySelectorAll('p')).filter(p => p.innerText.trim().length > 40);
  const text = paragraphs.map(p=>p.innerText.trim()).join('\n\n');
  return { text, paragraphs };
}

// 2) Mark anchors (simple approach: highlight candidate sentences locally)
function wrapSentenceRange(paragraphNode, sentenceText, id) {
  const html = paragraphNode.innerHTML;
  // naive replace first occurrence of sentenceText
  const idx = html.indexOf(sentenceText);
  if (idx === -1) return false;
  const before = html.slice(0, idx);
  const after = html.slice(idx + sentenceText.length);
  paragraphNode.innerHTML = before + `<span class="tp-anchor" data-tp-id="${id}">${sentenceText}</span>` + after;
  return true;
}

function addHighlightStyle() {
  if (document.getElementById('tp-style')) return;
  const style = document.createElement('style');
  style.id = 'tp-style';
  style.innerHTML = `
    .tp-anchor { background: linear-gradient(90deg, rgba(255,255,0,0.35), rgba(255,200,0,0.2)); cursor: pointer; }
    .tp-anchor:hover { outline: 2px solid rgba(255,200,0,0.3); }
  `;
  document.head.appendChild(style);
}

async function initLocalCandidates() {
  addHighlightStyle();
  const { text, paragraphs } = extractArticleText();
  // naive sentence split
  const sentences = text.split(/(?<=[.?!])\s+(?=[A-Z0-9])/).filter(s => s.length > 40);
  // pick top N (naive: longest unique sentences)
  const uniq = [...new Set(sentences)].sort((a,b)=>b.length-a.length).slice(0,6);
  uniq.forEach((s,i) => {
    // find paragraph to wrap this sentence
    for (const p of paragraphs) {
      if (p.innerText.includes(s)) { wrapSentenceRange(p, s, 'tp-' + i); break; }
    }
  });
  // click handler to open sidebar and pass selected sentence
  document.addEventListener('click', (e) => {
    const el = e.target.closest('.tp-anchor');
    if (!el) return;
    const tp = { id: el.dataset.tpId, sentence: el.innerText };
    // send message to sidebar/background
    chrome.runtime.sendMessage({ type: 'TP_SELECT', payload: tp });
    // open sidebar (browser action could open)
    try { chrome.sidebarAction.open(); } catch(e) {}
  });
}

// run
initLocalCandidates();
