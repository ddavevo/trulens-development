// SidebarRoot.jsx (bundled to sidebar.bundle.js)
import React, {useEffect, useState} from 'react';
import { createRoot } from 'react-dom/client';

function Sidebar() {
  const [selected, setSelected] = useState(null);
  const [clusters, setClusters] = useState([]);

  useEffect(()=> {
    chrome.storage.session.get(null, (items) => {
      // find tp for this tab
      // naive: pick first tp key
      const keys = Object.keys(items).filter(k => k.startsWith('tp:'));
      if (keys.length) {
        setSelected(items[keys[0]]);
      }
    });
    // subscribe to incoming messages
    chrome.runtime.onMessage.addListener((m) => {
      if (m.type === 'TP_SELECT') setSelected(m.payload);
    });
  },[]);

  useEffect(()=> {
    if (!selected) return;
    // call backend to get alternatives
    fetch('https://your-backend.example/api/alternatives', {
      method: 'POST', headers: {'content-type':'application/json'},
      body: JSON.stringify({ sentence: selected.sentence, url: window.location.href })
    })
    .then(r=>r.json()).then(data => setClusters(data.clusters || []));
  }, [selected]);

  if (!selected) return <div style={{padding:16}}>Select a highlighted sentence to see alternative angles.</div>;

  return (
    <div style={{padding:12,fontFamily:'Inter,system-ui'}}>
      <h3>Talking point</h3>
      <div style={{fontSize:13,marginBottom:10}}><em>{selected.sentence}</em></div>

      <h4>Alternative angles</h4>
      {clusters.map(c => (
        <div key={c.id} style={{borderRadius:8, padding:10, marginBottom:8, boxShadow:'0 1px 2px rgba(0,0,0,0.06)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontWeight:600}}>{c.sourceTitle}</div>
              <div style={{fontSize:12,color:'#666'}}>{new URL(c.sourceURL).hostname}</div>
            </div>
            <div style={{fontSize:12}}>{(c.matchScore*100).toFixed(0)}%</div>
          </div>
          <blockquote style={{marginTop:8,fontSize:13,whiteSpace:'pre-wrap'}}>"{c.verbatimExcerpt}"</blockquote>
          <div style={{marginTop:8}}>
            <a href={c.sourceURL} target="_blank" rel="noopener">Open source ↗</a>
          </div>
        </div>
      ))}
      <button onClick={()=>{/* fetch more logic */}}>Fetch more</button>
    </div>
  );
}

createRoot(document.getElementById('root')).render(<Sidebar />);