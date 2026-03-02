import { useState } from 'react';
import { PLAYERS as FALLBACK_PLAYERS, AGENTS as FALLBACK_AGENTS, MAPS as FALLBACK_MAPS } from '../data/sampleData';
import { styles, C } from '../styles/tokens';

function buildBlank(playerNames) {
  const names = playerNames?.length > 0 ? playerNames : FALLBACK_PLAYERS;
  return {
    date:'', opponent:'', type:'Scrim', result:'Win', score:'', map:'Ascent', tournament:'',
    playerStats: names.map(p => ({ player:p, agent:'Jett', acs:'', kills:'', deaths:'', assists:'', adr:'', kast:'', fkRate:'', clutchRate:'' })),
    teamMetrics: { atkRounds:'', atkWins:'', defRounds:'', defWins:'', atkPistolWin:'', defPistolWin:'' },
  };
}

const STEPS = ['Match Info', 'Player Stats', 'Team Metrics'];

export function MatchForm({ dispatch, onClose, prefill, refData }) {
  const agentNames = refData?.agentNames?.length > 0 ? refData.agentNames : FALLBACK_AGENTS;
  const mapNames   = refData?.mapNames?.length > 0   ? refData.mapNames   : FALLBACK_MAPS;
  const playerNames= refData?.playerNames?.length > 0 ? refData.playerNames : FALLBACK_PLAYERS;

  const buildInitial = () => {
    if (!prefill) return buildBlank(playerNames);
    const extractedStats = prefill.playerStats || [];
    const agentMap = prefill.playerAgentMap || [];
    const blankRow = (player, agent) => ({ player:player||'', agent:agent||'Jett', acs:'', kills:'', deaths:'', assists:'', adr:'', kast:'', fkRate:'', clutchRate:'' });
    const ps = extractedStats.length > 0
      ? extractedStats.map(s => ({ player:s.player||'', agent:s.agent||'Jett', acs:s.acs??'', kills:s.kills??'', deaths:s.deaths??'', assists:s.assists??'', adr:s.adr??'', kast:s.kast??'', fkRate:s.fkRate!=null?+(s.fkRate*100).toFixed(0):'', clutchRate:s.clutchRate!=null?+(s.clutchRate*100).toFixed(0):'' }))
      : agentMap.length > 0 ? agentMap.map(e => blankRow(e.player, e.agent))
      : playerNames.map(p => blankRow(p, 'Jett'));
    const tm = prefill.teamMetrics || {};
    return { date:prefill.date&&prefill.date!=='null'?prefill.date:'', opponent:prefill.opponent||'', type:prefill.type||'Scrim', result:prefill.result||'Win', score:prefill.score||'', map:prefill.map&&prefill.map!=='null'?prefill.map:'', tournament:prefill.tournament||'', playerStats:ps, teamMetrics:{ atkRounds:tm.atkRounds??'', atkWins:tm.atkWins??'', defRounds:tm.defRounds??'', defWins:tm.defWins??'', atkPistolWin:tm.atkPistolWin??'', defPistolWin:tm.defPistolWin??'' } };
  };

  const [form, setForm] = useState(buildInitial);
  const [step, setStep] = useState(0);

  const setField = (k, v) => setForm(f => ({ ...f, [k]:v }));
  const setPS    = (i, k, v) => setForm(f => { const ps=[...f.playerStats]; ps[i]={...ps[i],[k]:v}; return {...f,playerStats:ps}; });
  const setMetric= (k, v) => setForm(f => ({ ...f, teamMetrics:{...f.teamMetrics,[k]:v} }));

  const handleSubmit = () => {
    if (!form.date || !form.opponent) { alert('Date and opponent are required.'); return; }
    dispatch({ type:'ADD_MATCH', payload:{
      ...form,
      playerStats: form.playerStats.map(ps => ({ ...ps, acs:+ps.acs, kills:+ps.kills, deaths:+ps.deaths, assists:+ps.assists, adr:+ps.adr, kast:+ps.kast, fkRate:+(+ps.fkRate/100).toFixed(2), clutchRate:+(+ps.clutchRate/100).toFixed(2) })),
      teamMetrics: { ...Object.fromEntries(Object.entries(form.teamMetrics).filter(([k])=>!['atkPistolWin','defPistolWin'].includes(k)).map(([k,v])=>[k,+v])), atkPistolWin:form.teamMetrics.atkPistolWin, defPistolWin:form.teamMetrics.defPistolWin },
    }});
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-box">
        <div className="modal-head">
          <div className="modal-title">{prefill ? '✦ AI Import — Review Match' : 'New Match'}</div>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        <div className="form-tabs">
          {STEPS.map((t,i) => (
            <button key={t} className={`form-tab${step===i?' active':''}`} onClick={() => setStep(i)}>
              {i+1}. {t}
            </button>
          ))}
        </div>

        {step === 0 && (
          <div className="form-grid">
            <FF label="Date"        type="date"  value={form.date}          onChange={v=>setField('date',v)} />
            <FF label="Opponent"    value={form.opponent}  onChange={v=>setField('opponent',v)}    placeholder="Team name" />
            <FS label="Map"         value={form.map}       options={mapNames}                       onChange={v=>setField('map',v)} />
            <FS label="Type"        value={form.type}      options={['Scrim','Tournament']}          onChange={v=>setField('type',v)} />
            <FS label="Result"      value={form.result}    options={['Win','Loss']}                  onChange={v=>setField('result',v)} />
            <FF label="Score"       value={form.score}     onChange={v=>setField('score',v)}         placeholder="13-9" />
            <FF label="Tournament"  value={form.tournament||''} onChange={v=>setField('tournament',v)} placeholder="Optional" />
          </div>
        )}

        {step === 1 && (
          <div style={styles.formPlayersTable}>
            <table style={styles.table}>
              <thead>
                <tr>{['Player','Agent','ACS','K','D','A'].map(h=><th key={h} style={styles.th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {form.playerStats.map((ps,i) => (
                  <tr key={i} style={i%2===0?styles.trEven:styles.trOdd}>
                    <td style={styles.td}><input className="inline-input" style={{width:90}} type="text" value={ps.player} onChange={e=>setPS(i,'player',e.target.value)} placeholder="IGN" /></td>
                    <td style={styles.td}><select className="inline-select" value={ps.agent} onChange={e=>setPS(i,'agent',e.target.value)}>{agentNames.map(a=><option key={a}>{a}</option>)}</select></td>
                    {['acs','kills','deaths','assists'].map(k=>(
                      <td key={k} style={styles.td}><input className="inline-input" type="number" value={ps[k]} onChange={e=>setPS(i,k,e.target.value)} placeholder="0" min="0" /></td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="form-note">⚠ Enter FK% and Clutch% as whole numbers (e.g. 45 for 45%)</div>
          </div>
        )}

        {step === 2 && (
          <div className="form-grid">
            {[['atkRounds','ATK Rounds'],['atkWins','ATK Wins'],['defRounds','DEF Rounds'],['defWins','DEF Wins']].map(([k,l])=>(
              <FF key={k} label={l} type="number" value={form.teamMetrics[k]} onChange={v=>setMetric(k,v)} placeholder="0" />
            ))}
            <FS label="ATK Pistol" value={form.teamMetrics.atkPistolWin} options={['Win','Loss']} onChange={v=>setMetric('atkPistolWin',v)} />
            <FS label="DEF Pistol" value={form.teamMetrics.defPistolWin} options={['Win','Loss']} onChange={v=>setMetric('defPistolWin',v)} />
          </div>
        )}

        <div className="form-actions">
          {step > 0 && <button className="btn-secondary" onClick={() => setStep(s=>s-1)}>← Back</button>}
          {step < 2  && <button className="btn-primary"   onClick={() => setStep(s=>s+1)}>Next →</button>}
          {step === 2 && <button className="btn-primary"  onClick={handleSubmit}>Save Match</button>}
        </div>
      </div>
    </div>
  );
}

function FF({ label, value, onChange, type='text', placeholder }) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <input className="form-input" type={type} value={value} placeholder={placeholder} onChange={e=>onChange(e.target.value)} />
    </div>
  );
}

function FS({ label, value, options, onChange }) {
  return (
    <div className="form-field">
      <label className="form-label">{label}</label>
      <select className="form-input" value={value} onChange={e=>onChange(e.target.value)} style={{ color: value==='' ? 'var(--text3)' : 'inherit' }}>
        {value==='' && <option value="" disabled>Select {label}</option>}
        {options.map(o=><option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );
}
