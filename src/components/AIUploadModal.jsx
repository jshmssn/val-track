import { useState, useRef, useCallback, useEffect } from 'react';
import { C, styles } from '../styles/tokens';
import { aiApi } from '../api/matchesApi';
import { MatchForm } from './MatchForm';

const ACCEPTED = '.png,.jpg,.jpeg,.webp,.gif,.pdf,.doc,.docx,.txt';
const ACCEPTED_TYPES = ['image/png','image/jpeg','image/webp','image/gif','application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain'];

function fileIcon(file) {
  if (!file) return '📄';
  if (file.type.startsWith('image/')) return '🖼️';
  if (file.type === 'application/pdf') return '📕';
  if (file.type.includes('word')) return '📝';
  return '📄';
}

function fmtBytes(n) {
  if (n < 1024) return n + ' B';
  if (n < 1048576) return (n/1024).toFixed(1) + ' KB';
  return (n/1048576).toFixed(1) + ' MB';
}

function uid() { return Math.random().toString(36).slice(2,9); }

export function AIUploadModal({ matchType, dispatch, onClose, refData }) {
  const [queue, setQueue] = useState([]);
  const queueRef = useRef([]);
  const [globalDrag, setGlobalDrag] = useState(false);
  const [reviewItem, setReviewItem] = useState(null);
  const inputRef = useRef();
  const dragCount = useRef(0);

  useEffect(() => { queueRef.current = queue; }, [queue]);

  const addFiles = useCallback((fileList) => {
    const incoming = Array.from(fileList)
      .filter(f => ACCEPTED_TYPES.includes(f.type) || f.name.match(/\.(doc|docx|txt)$/i))
      .map(f => ({ id:uid(), file:f, status:'idle', extracted:null, error:'' }));
    if (!incoming.length) return;
    setQueue(q => [...q, ...incoming]);
  }, []);

  const removeItem = id => setQueue(q => q.filter(i => i.id !== id));

  const onOverlayDragEnter = useCallback(e => { e.preventDefault(); dragCount.current++; setGlobalDrag(true); }, []);
  const onOverlayDragLeave = useCallback(e => { e.preventDefault(); dragCount.current--; if (dragCount.current <= 0) { dragCount.current=0; setGlobalDrag(false); } }, []);
  const onOverlayDragOver  = useCallback(e => { e.preventDefault(); }, []);
  const onOverlayDrop      = useCallback(e => { e.preventDefault(); dragCount.current=0; setGlobalDrag(false); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }, [addFiles]);

  useEffect(() => {
    const h = e => {
      const items = e.clipboardData?.items;
      if (!items) return;
      const imgs = [];
      for (const item of items) {
        if (item.type.startsWith('image/')) {
          const blob = item.getAsFile();
          if (blob) { const ext = item.type.split('/')[1]||'png'; imgs.push(new File([blob], `pasted-${Date.now()}.${ext}`, { type:item.type })); }
        }
      }
      if (imgs.length) addFiles(imgs);
    };
    window.addEventListener('paste', h);
    return () => window.removeEventListener('paste', h);
  }, [addFiles]);

  const extractItem = useCallback(async id => {
    setQueue(q => q.map(i => i.id===id ? {...i,status:'loading',error:''} : i));
    try {
      const item = queueRef.current.find(i => i.id===id);
      const timelineDone = queueRef.current.find(i => i.id!==id && i.status==='done' && (i.extracted?.screenshotType==='timeline' || (i.playerAgentMap && i.playerAgentMap.length>0)));
      const pamToSend = timelineDone?.playerAgentMap || timelineDone?.extracted?.playerAgentMap || null;
      const result = await aiApi.extract(item.file, matchType, pamToSend);
      setQueue(q => q.map(i => i.id===id ? {...i,status:'done',extracted:result.extracted,playerAgentMap:result.playerAgentMap||result.extracted?.playerAgentMap||[]} : i));
    } catch (err) {
      setQueue(q => q.map(i => i.id===id ? {...i,status:'error',error:err.message||'Extraction failed'} : i));
    }
  }, [queue, matchType]);

  const extractAll = useCallback(async () => {
    const pending = queue.filter(i => i.status==='idle'||i.status==='error');
    const sorted = [...pending.filter(i => i.extracted?.screenshotType==='timeline'), ...pending.filter(i => i.extracted?.screenshotType!=='timeline')];
    for (const item of sorted) await extractItem(item.id);
  }, [queue, extractItem]);

  const pendingCount = queue.filter(i => i.status==='idle'||i.status==='error').length;
  const doneCount    = queue.filter(i => i.status==='done').length;
  const loadingCount = queue.filter(i => i.status==='loading').length;

  const doneTimeline   = queue.find(i => i.status==='done' && (i.extracted?.screenshotType==='timeline' || (i.playerAgentMap&&i.playerAgentMap.length>0) || (i.extracted?.playerAgentMap&&i.extracted.playerAgentMap.length>0)));
  const doneScoreboard = queue.find(i => i.status==='done' && i.extracted?.screenshotType==='scoreboard');
  const hasTimeline = !!doneTimeline, hasScoreboard = !!doneScoreboard;
  const playerAgentCount = (doneTimeline?.playerAgentMap || doneTimeline?.extracted?.playerAgentMap || []).length;

  const normalizeKey = name => (name||'').toLowerCase().replace(/[^a-z0-9]/g,'');

  const mergeAndReview = () => {
    if (!doneTimeline || !doneScoreboard) return;
    const pam = doneTimeline.playerAgentMap || doneTimeline.extracted?.playerAgentMap || [];
    if (pam.length === 0) { alert('⚠️ Agent names could not be read from Timeline. Make sure a round is selected.'); return; }
    const tmap = {}; pam.forEach(({player,agent}) => { if (player&&agent) tmap[normalizeKey(player)]=agent; });
    const correctedPS = (doneScoreboard.extracted.playerStats||[]).map(p => { const k=normalizeKey(p.player); return tmap[k] ? {...p,agent:tmap[k]} : p; });
    const merged = { ...doneScoreboard.extracted, playerStats:correctedPS, teamMetrics:{...doneScoreboard.extracted.teamMetrics,...doneTimeline.extracted.teamMetrics}, date:doneScoreboard.extracted.date||doneTimeline.extracted.date, map:doneScoreboard.extracted.map||doneTimeline.extracted.map, result:doneScoreboard.extracted.result||doneTimeline.extracted.result, score:doneScoreboard.extracted.score||doneTimeline.extracted.score };
    setReviewItem({ extracted:merged, _merged:true });
  };

  if (reviewItem) return <MatchForm dispatch={dispatch} onClose={() => setReviewItem(null)} prefill={reviewItem.extracted} refData={refData} />;

  return (
    <div
      className="modal-overlay"
      style={{ background: globalDrag ? 'rgba(232,37,60,0.12)' : 'rgba(0,0,0,0.75)', outline: globalDrag ? '3px dashed var(--red)' : 'none', outlineOffset:-6 }}
      onDragEnter={onOverlayDragEnter} onDragLeave={onOverlayDragLeave} onDragOver={onOverlayDragOver} onDrop={onOverlayDrop}
    >
      {globalDrag ? (
        <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:12,pointerEvents:'none' }}>
          <div style={{ fontSize:64 }}>📂</div>
          <div style={{ fontSize:28,fontWeight:900,letterSpacing:'0.1em',color:'#fff' }}>DROP FILES ANYWHERE</div>
          <div style={{ fontSize:11,color:'rgba(255,255,255,0.5)',fontFamily:'var(--mono)',letterSpacing:'0.1em' }}>PNG · JPG · WEBP · PDF · DOC · TXT</div>
        </div>
      ) : (
        <div className="modal-box" style={{ maxWidth:560 }} onClick={e=>e.stopPropagation()}>
          <div className="modal-head">
            <div style={{ display:'flex',alignItems:'center',gap:10 }}>
              <div style={{ fontSize:18,fontWeight:900,letterSpacing:'0.08em',textTransform:'uppercase' }}>
                ✦ AI Match Import
              </div>
              <span style={{ background:'var(--red)',color:'#fff',padding:'3px 10px',borderRadius:4,fontSize:10,fontWeight:800,letterSpacing:'0.1em' }}>{matchType.toUpperCase()}</span>
            </div>
            <button className="modal-close" onClick={onClose}>✕</button>
          </div>

          <div style={{ padding:24, overflowY:'auto', flexGrow:1 }}>
            <div className="drop-zone" onClick={() => inputRef.current?.click()}>
              <div style={{ fontSize:36,marginBottom:10 }}>📂</div>
              <div style={{ fontSize:15,fontWeight:700,letterSpacing:'0.05em',marginBottom:4 }}>
                Click to browse or drag files anywhere
              </div>
              <div style={{ fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',letterSpacing:'0.08em' }}>
                PNG · JPG · WEBP · PDF · DOC · TXT
              </div>
              <div style={{ fontSize:10,color:'var(--red)',marginTop:6,fontFamily:'var(--mono)',letterSpacing:'0.06em' }}>
                ⌘V / CTRL+V to paste screenshot
              </div>
              <input ref={inputRef} type="file" accept={ACCEPTED} multiple style={{ display:'none' }} onChange={e=>addFiles(e.target.files)} />
            </div>

            {queue.length > 0 && queue.map(item => (
              <div key={item.id} className={`queue-item ${item.status}`}>
                <span style={{ fontSize:20 }}>{fileIcon(item.file)}</span>
                <div style={{ flexGrow:1,minWidth:0 }}>
                  <div style={{ fontSize:13,fontWeight:700,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis' }}>
                    {item.file.name}
                    {item.status==='done' && item.extracted?.screenshotType && (
                      <span style={{ marginLeft:8,fontSize:9,fontWeight:800,letterSpacing:'0.08em',padding:'1px 6px',borderRadius:4, background:item.extracted.screenshotType==='timeline'?'rgba(167,139,250,0.15)':'rgba(56,189,248,0.15)', color:item.extracted.screenshotType==='timeline'?'var(--violet)':'var(--sky)' }}>
                        {item.extracted.screenshotType.toUpperCase()}
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize:10,color:'var(--text3)',fontFamily:'var(--mono)',marginTop:2 }}>
                    {fmtBytes(item.file.size)}
                    {item.status==='done'&&item.extracted && ` · ${item.extracted.map||'?'} · ${item.extracted.result||'?'} ${item.extracted.score||''}`}
                    {item.status==='error' && <span style={{ color:'var(--red)' }}> · {item.error}</span>}
                  </div>
                </div>

                <span style={{ fontSize:10,fontWeight:800,letterSpacing:'0.08em',flexShrink:0, color:item.status==='done'?'var(--emerald)':item.status==='error'?'var(--red)':item.status==='loading'?'var(--red)':'var(--text3)' }}>
                  {item.status==='idle'&&'PENDING'}
                  {item.status==='loading'&&<span className="spin">▲</span>}
                  {item.status==='done'&&'✓'}
                  {item.status==='error'&&'✕'}
                </span>

                {/* {item.status==='done'&&item.extracted?.screenshotType==='timeline'&&(
                  <button className="btn-primary" style={{ fontSize:10,padding:'4px 10px' }} onClick={() => { const pam=item.playerAgentMap||item.extracted?.playerAgentMap||[]; setReviewItem({...item,extracted:{...item.extracted,playerAgentMap:pam}}); }}>
                    Review →
                  </button>
                )} */}

                {item.status!=='loading'&&(
                  <button style={{ background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:14,padding:'0 2px' }} onClick={() => removeItem(item.id)}>✕</button>
                )}
              </div>
            ))}
          </div>

          <div className="form-actions" style={{ justifyContent:'space-between' }}>
            <span style={{ fontSize:11,color:'var(--text3)',fontFamily:'var(--mono)' }}>
              {queue.length===0 ? 'Upload Scoreboard + Timeline to import'
                : hasTimeline&&hasScoreboard ? `✓ Ready · ${playerAgentCount} agents mapped`
                : hasScoreboard&&!hasTimeline ? '⚠ Upload Timeline for agent names'
                : hasTimeline&&!hasScoreboard ? '⚠ Upload Scoreboard for player stats'
                : `${queue.length} file${queue.length!==1?'s':''} · ${doneCount} done`}
            </span>
            <div style={{ display:'flex',gap:8 }}>
              <button className="btn-secondary" onClick={onClose}>Close</button>
              {pendingCount > 0 && (
                <button className="btn-primary" disabled={loadingCount>0} style={{ opacity:loadingCount>0?0.6:1 }} onClick={extractAll}>
                  {loadingCount>0 ? 'Analyzing…' : `✦ Extract${pendingCount>1?` All ${pendingCount}`:''}`}
                </button>
              )}
              {hasTimeline&&hasScoreboard&&(
                <button className="btn-primary" onClick={mergeAndReview}>✦ Review →</button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
