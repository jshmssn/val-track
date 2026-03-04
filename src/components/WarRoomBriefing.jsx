import { useState, useMemo, useRef } from 'react';
import { pct } from '../utils/statsHelpers';

// ─── helpers ────────────────────────────────────────────────
function toNum(v) { const n = Number(v); return Number.isFinite(n) ? n : 0; }

function parseScore(score) {
  const [a, b] = String(score || '').split('-');
  return { us: toNum(a), them: toNum(b), diff: toNum(a) - toNum(b) };
}

function buildTeamStats(matches) {
  const total = matches.length;
  if (!total) return null;
  const wins = matches.filter(m => m.result === 'Win').length;

  // Per-player aggregates
  const playerMap = {};
  for (const m of matches) {
    for (const ps of m.playerStats || []) {
      if (!ps.player) continue;
      if (!playerMap[ps.player]) playerMap[ps.player] = { name: ps.player, games: 0, totalAcs: 0, totalKd: 0, totalKast: 0, agentCounts: {} };
      const p = playerMap[ps.player];
      p.games++;
      p.totalAcs += toNum(ps.acs);
      p.totalKd += toNum(ps.kd);
      p.totalKast += toNum(ps.kast);
      p.agentCounts[ps.agent] = (p.agentCounts[ps.agent] || 0) + 1;
    }
  }
  const players = Object.values(playerMap).map(p => ({
    ...p,
    avgAcs: Math.round(p.totalAcs / p.games),
    avgKd: +(p.totalKd / p.games).toFixed(2),
    avgKast: Math.round(p.totalKast / p.games),
    topAgent: Object.entries(p.agentCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Unknown',
  }));

  // Map breakdown
  const mapMap = {};
  for (const m of matches) {
    if (!m.map) continue;
    if (!mapMap[m.map]) mapMap[m.map] = { map: m.map, played: 0, wins: 0 };
    mapMap[m.map].played++;
    if (m.result === 'Win') mapMap[m.map].wins++;
  }
  const maps = Object.values(mapMap).map(r => ({ ...r, winRate: pct(r.wins, r.played) }))
    .sort((a, b) => b.played - a.played);

  // ATK / DEF
  let atkRounds = 0, atkWins = 0, defRounds = 0, defWins = 0;
  for (const m of matches) {
    atkRounds += toNum(m.teamMetrics?.atkRounds);
    atkWins += toNum(m.teamMetrics?.atkWins);
    defRounds += toNum(m.teamMetrics?.defRounds);
    defWins += toNum(m.teamMetrics?.defWins);
  }

  // Pistol
  let pistolWins = 0;
  for (const m of matches) {
    if (m.teamMetrics?.atkPistolWin === 'Win') pistolWins++;
    if (m.teamMetrics?.defPistolWin === 'Win') pistolWins++;
  }

  // Recent form (last 5)
  const sorted = [...matches].sort((a, b) => b.date.localeCompare(a.date));
  const recent = sorted.slice(0, 5).map(m => m.result === 'Win' ? 'W' : 'L');

  return {
    total, wins, losses: total - wins,
    winRate: pct(wins, total),
    atkPct: pct(atkWins, atkRounds),
    defPct: pct(defWins, defRounds),
    pistolPct: pct(pistolWins, total * 2),
    players: players.sort((a, b) => b.avgAcs - a.avgAcs),
    maps,
    recent,
  };
}

function buildOpponentHistory(matches, opponent) {
  const scoped = matches.filter(m => m.opponent === opponent);
  if (!scoped.length) return null;
  const wins = scoped.filter(m => m.result === 'Win').length;
  const sorted = [...scoped].sort((a, b) => b.date.localeCompare(a.date));
  const scores = sorted.map(m => `${m.result} ${m.score} on ${m.map} (${m.date})`);
  return {
    played: scoped.length, wins, losses: scoped.length - wins,
    winRate: pct(wins, scoped.length),
    scores,
  };
}

// ─── main component ──────────────────────────────────────────
export function WarRoomBriefing({ matches }) {
  const opponents = useMemo(() => [...new Set(matches.map(m => m.opponent).filter(Boolean))].sort(), [matches]);
  const mapOptions = useMemo(() => [...new Set(matches.map(m => m.map).filter(Boolean))].sort(), [matches]);

  const [opponent, setOpponent] = useState(opponents[0] || '');
  const [matchType, setMatchType] = useState('Scrim');
  const [selectedMap, setSelectedMap] = useState('Unknown');
  const [customOpponent, setCustomOpponent] = useState('');
  const [isNewOpp, setIsNewOpp] = useState(false);

  const [apiKey, setApiKey] = useState('');
  const [brief, setBrief] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const briefRef = useRef();

  const teamStats = useMemo(() => buildTeamStats(matches), [matches]);
  const oppHistory = useMemo(() => buildOpponentHistory(matches, isNewOpp ? customOpponent : opponent), [matches, opponent, customOpponent, isNewOpp]);

  const activeOpponent = isNewOpp ? (customOpponent || 'Unknown') : (opponent || 'Unknown');

  async function generateBriefing() {
    if (!apiKey.trim()) { setErr('Please enter your Anthropic API key above.'); return; }
    setLoading(true);
    setErr(null);
    setBrief(null);

    const mapRecord = teamStats?.maps.find(m => m.map === selectedMap);
    const mapNote = mapRecord
      ? `Win rate on ${selectedMap}: ${mapRecord.winRate}% in ${mapRecord.played} matches.`
      : `No prior data for map ${selectedMap}.`;

    const playerSummary = (teamStats?.players || []).map(p =>
      `${p.name} — avg ACS ${p.avgAcs}, KD ${p.avgKd}, KAST ${p.avgKast}%, top agent ${p.topAgent}`
    ).join('\n');

    const histNote = oppHistory
      ? `We have ${oppHistory.played} matches vs ${activeOpponent}: ${oppHistory.wins}W-${oppHistory.losses}L (${oppHistory.winRate}%). Past games: ${oppHistory.scores.slice(0, 3).join(' | ')}.`
      : `First time playing ${activeOpponent} — no prior match history.`;

    const prompt = `You are a professional Valorant esports head coach. Generate a WAR ROOM PRE-MATCH BRIEFING for your team.

CONTEXT:
- Match type: ${matchType}
- Opponent: ${activeOpponent}
- Map: ${selectedMap}
- Our overall record: ${teamStats?.wins || 0}W-${teamStats?.losses || 0}L (${teamStats?.winRate || 0}% win rate)
- Our ATK side: ${teamStats?.atkPct || 0}%, DEF side: ${teamStats?.defPct || 0}%, Pistol: ${teamStats?.pistolPct || 0}%
- Recent form (last 5): ${teamStats?.recent?.join(' ') || 'N/A'}
- ${mapNote}
- ${histNote}

PLAYER STATS:
${playerSummary || 'No player data available.'}

Generate a complete briefing in this exact JSON format (valid JSON only, no markdown):
{
  "headline": "One powerful 6-10 word match headline",
  "classification": "CONFIDENTIAL | COACH USE ONLY",
  "executive_summary": "2-3 sentences. Tone: calm, professional, sharp. Summarize the situation and key win conditions.",
  "threat_assessment": {
    "level": "LOW | MEDIUM | HIGH | CRITICAL",
    "rationale": "2 sentences explaining the threat level based on history and context."
  },
  "map_intel": {
    "overview": "2 sentences about playing this map for us specifically.",
    "atk_priority": "One tactical priority for attack side on this map.",
    "def_priority": "One tactical priority for defense side on this map.",
    "key_site": "A-SITE or B-SITE — which to prioritize and why in one sentence."
  },
  "player_assignments": [
    { "name": "player name", "agent": "recommended agent", "role": "their primary role this match", "directive": "one tactical instruction for this player" }
  ],
  "win_conditions": ["Condition 1 in one line", "Condition 2 in one line", "Condition 3 in one line"],
  "danger_zones": ["Risk 1 in one line", "Risk 2 in one line"],
  "coach_notes": "2-3 sentences of free-form coaching insight. Personal, direct, motivational but grounded.",
  "timeout_protocol": "One sentence describing when and how to call timeouts this match."
}`;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          max_tokens: 1000,
          messages: [
            { role: 'system', content: 'You are a professional Valorant esports head coach. Always respond with valid JSON only, no markdown, no preamble.' },
            { role: 'user', content: prompt }
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'HTTP ' + res.status);
      const text = data.choices?.[0]?.message?.content || '';
      const clean = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(clean);
      setBrief(parsed);
    } catch (e) {
      setErr('Failed: ' + e.message);
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function handlePrint() {
    window.print();
  }

  const threatColors = { LOW: '#10b981', MEDIUM: '#f59e0b', HIGH: '#f97316', CRITICAL: '#e8253c' };
  const threatBg = { LOW: 'rgba(16,185,129,0.1)', MEDIUM: 'rgba(245,158,11,0.1)', HIGH: 'rgba(249,115,22,0.1)', CRITICAL: 'rgba(232,37,60,0.15)' };

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      {/* ── Header card ── */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(232,37,60,0.08) 0%, rgba(255,255,255,0.01) 100%)',
        padding: 18,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: 0, right: 0, width: 220, height: 220,
          background: 'radial-gradient(circle, rgba(232,37,60,0.06) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />
        <div style={{ fontSize: 10, color: 'rgba(232,37,60,0.9)', letterSpacing: '0.2em', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>
          ◈ WAR ROOM · CLASSIFIED MATCH INTELLIGENCE
        </div>
        <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: '0.03em', marginBottom: 4, fontFamily: "'Barlow Condensed', sans-serif" }}>
          Pre-Match Briefing Generator
        </div>
        <div style={{ fontSize: 13, color: '#8a93a6' }}>
          AI synthesizes your team's real tracked data into a complete tactical brief — ready to share before kick-off.
        </div>
      </div>

      {/* ── API Key ── */}
      <div style={{
        border: '1px solid rgba(245,158,11,0.25)',
        borderRadius: 10,
        background: 'rgba(245,158,11,0.05)',
        padding: '12px 16px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 16 }}>🔑</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 9, color: '#f59e0b', letterSpacing: '0.15em', fontFamily: "'DM Mono', monospace", marginBottom: 5 }}>
            OPENAI API KEY — stored in memory only, never saved
          </div>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            style={{
              background: '#181c22', border: '1px solid rgba(245,158,11,0.3)',
              color: '#e8eaf0', padding: '8px 12px', fontSize: 13,
              borderRadius: 7, width: '100%', outline: 'none',
              fontFamily: "'DM Mono', monospace", boxSizing: 'border-box',
            }}
          />
        </div>
        {apiKey && (
          <span style={{ fontSize: 18 }}>✅</span>
        )}
      </div>

      {/* ── Config ── */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        background: '#12151a',
        padding: 18,
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: 14,
        alignItems: 'end',
      }}>
        {/* Opponent toggle */}
        <div>
          <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.15em', fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: 'uppercase' }}>Opponent</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <button onClick={() => setIsNewOpp(false)} style={{
              flex: 1, padding: '6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              background: !isNewOpp ? '#e8253c' : '#1f242c', color: !isNewOpp ? '#fff' : '#8a93a6',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif",
            }}>TRACKED</button>
            <button onClick={() => setIsNewOpp(true)} style={{
              flex: 1, padding: '6px', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em',
              background: isNewOpp ? '#e8253c' : '#1f242c', color: isNewOpp ? '#fff' : '#8a93a6',
              border: 'none', borderRadius: 6, cursor: 'pointer', fontFamily: "'Barlow Condensed', sans-serif",
            }}>NEW</button>
          </div>
          {isNewOpp ? (
            <input
              value={customOpponent}
              onChange={e => setCustomOpponent(e.target.value)}
              placeholder="Enter opponent name..."
              style={{ background: '#181c22', border: '1px solid rgba(255,255,255,0.07)', color: '#e8eaf0', padding: '9px 12px', fontSize: 13, borderRadius: 8, width: '100%', outline: 'none', fontFamily: "'Barlow Condensed', sans-serif", fontWeight: 600, boxSizing: 'border-box' }}
            />
          ) : (
            <select value={opponent} onChange={e => setOpponent(e.target.value)} style={{ background: '#181c22', border: '1px solid rgba(255,255,255,0.07)', color: '#e8eaf0', padding: '9px 12px', fontSize: 13, borderRadius: 8, width: '100%', outline: 'none' }}>
              {opponents.map(o => <option key={o}>{o}</option>)}
              {!opponents.length && <option>No opponents tracked</option>}
            </select>
          )}
        </div>

        <div>
          <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.15em', fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: 'uppercase' }}>Match Type</div>
          <select value={matchType} onChange={e => setMatchType(e.target.value)} style={{ background: '#181c22', border: '1px solid rgba(255,255,255,0.07)', color: '#e8eaf0', padding: '9px 12px', fontSize: 13, borderRadius: 8, width: '100%', outline: 'none' }}>
            <option>Scrim</option>
            <option>Tournament</option>
            <option>Qualifier</option>
            <option>Grand Final</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.15em', fontFamily: "'DM Mono', monospace", marginBottom: 6, textTransform: 'uppercase' }}>Map</div>
          <select value={selectedMap} onChange={e => setSelectedMap(e.target.value)} style={{ background: '#181c22', border: '1px solid rgba(255,255,255,0.07)', color: '#e8eaf0', padding: '9px 12px', fontSize: 13, borderRadius: 8, width: '100%', outline: 'none' }}>
            <option value="Unknown">Unknown / TBD</option>
            {mapOptions.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={generateBriefing}
            disabled={loading}
            style={{
              background: loading ? '#1f242c' : 'linear-gradient(135deg, #e8253c, #c0182d)',
              border: 'none', color: '#fff', padding: '11px 20px',
              fontSize: 13, fontWeight: 800, letterSpacing: '0.12em',
              cursor: loading ? 'not-allowed' : 'pointer', borderRadius: 9,
              fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase',
              boxShadow: loading ? 'none' : '0 0 20px rgba(232,37,60,0.35)',
              transition: 'all 0.2s',
            }}
          >
            {loading ? '⟳ Generating...' : '⚡ Generate Brief'}
          </button>
          {brief && (
            <button onClick={handlePrint} style={{
              background: '#1f242c', border: '1px solid rgba(255,255,255,0.1)', color: '#8a93a6',
              padding: '9px 20px', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em',
              cursor: 'pointer', borderRadius: 9, fontFamily: "'Barlow Condensed', sans-serif", textTransform: 'uppercase',
            }}>
              🖨 Print Brief
            </button>
          )}
        </div>
      </div>

      {/* ── Context strip ── */}
      {teamStats && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 8 }}>
          {[
            { label: 'TEAM RECORD', val: `${teamStats.wins}W-${teamStats.losses}L`, sub: `${teamStats.winRate}%`, col: '#10b981' },
            { label: 'VS OPPONENT', val: oppHistory ? `${oppHistory.wins}W-${oppHistory.losses}L` : 'New', sub: oppHistory ? `${oppHistory.winRate}%` : 'No history', col: '#38bdf8' },
            { label: 'ATK SIDE', val: `${teamStats.atkPct}%`, sub: 'win rate', col: '#f59e0b' },
            { label: 'DEF SIDE', val: `${teamStats.defPct}%`, sub: 'win rate', col: '#a78bfa' },
            { label: 'PISTOL', val: `${teamStats.pistolPct}%`, sub: 'conv rate', col: '#e8253c' },
            { label: 'RECENT', val: teamStats.recent.join(''), sub: 'last 5', col: '#8a93a6' },
          ].map(item => (
            <div key={item.label} style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 9, padding: '10px 12px', background: '#12151a' }}>
              <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace" }}>{item.label}</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: item.col, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.02em' }}>{item.val}</div>
              <div style={{ fontSize: 11, color: '#8a93a6' }}>{item.sub}</div>
            </div>
          ))}
        </div>
      )}

      {err && (
        <div style={{ border: '1px solid rgba(232,37,60,0.3)', borderRadius: 10, padding: '12px 16px', background: 'rgba(232,37,60,0.08)', color: '#e8253c', fontSize: 13 }}>
          ⚠ {err}
        </div>
      )}

      {loading && (
        <div style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 12, padding: 40, background: '#12151a', textAlign: 'center' }}>
          <div style={{ fontSize: 28, marginBottom: 10 }}>⚡</div>
          <div style={{ fontFamily: "'Barlow Condensed', sans-serif", fontSize: 18, fontWeight: 800, letterSpacing: '0.1em', marginBottom: 8 }}>GENERATING INTEL BRIEF</div>
          <div style={{ fontSize: 12, color: '#8a93a6', fontFamily: "'DM Mono', monospace" }}>analyzing match data · synthesizing tactics · writing briefing...</div>
        </div>
      )}

      {/* ── The actual briefing document ── */}
      {brief && (
        <div ref={briefRef} className="war-room-print" style={{
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 14,
          background: '#0e1116',
          overflow: 'hidden',
        }}>
          {/* Doc header */}
          <div style={{
            background: 'linear-gradient(135deg, rgba(232,37,60,0.15) 0%, rgba(12,14,16,0.98) 60%)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            padding: '20px 24px',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 16,
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(232,37,60,0.8)', letterSpacing: '0.2em', fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
                ◈ {brief.classification}
              </div>
              <div style={{ fontSize: 26, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', lineHeight: 1.1 }}>
                {brief.headline}
              </div>
              <div style={{ fontSize: 12, color: '#8a93a6', marginTop: 4 }}>
                {matchType} · vs {activeOpponent} · {selectedMap} · {new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>
            <div style={{
              background: threatBg[brief.threat_assessment?.level] || 'rgba(232,37,60,0.1)',
              border: `1px solid ${threatColors[brief.threat_assessment?.level] || '#e8253c'}`,
              borderRadius: 10, padding: '10px 16px', textAlign: 'center',
            }}>
              <div style={{ fontSize: 9, color: '#8a93a6', letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace" }}>THREAT</div>
              <div style={{ fontSize: 20, fontWeight: 900, color: threatColors[brief.threat_assessment?.level] || '#e8253c', fontFamily: "'Barlow Condensed', sans-serif" }}>
                {brief.threat_assessment?.level}
              </div>
            </div>
          </div>

          <div style={{ padding: 24, display: 'grid', gap: 16 }}>
            {/* Executive Summary */}
            <Section label="EXECUTIVE SUMMARY">
              <p style={{ fontSize: 14, color: '#c8cdd8', lineHeight: 1.65, margin: 0 }}>{brief.executive_summary}</p>
              <p style={{ fontSize: 13, color: '#8a93a6', lineHeight: 1.6, margin: '10px 0 0' }}>{brief.threat_assessment?.rationale}</p>
            </Section>

            {/* 2-col row: Map Intel + Win Conditions */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Section label={`MAP INTEL · ${selectedMap}`}>
                <p style={{ fontSize: 13, color: '#c8cdd8', lineHeight: 1.6, margin: '0 0 10px' }}>{brief.map_intel?.overview}</p>
                <div style={{ display: 'grid', gap: 7 }}>
                  <TagRow tag="ATK" text={brief.map_intel?.atk_priority} col="#f59e0b" />
                  <TagRow tag="DEF" text={brief.map_intel?.def_priority} col="#38bdf8" />
                  <TagRow tag="PRIORITY SITE" text={brief.map_intel?.key_site} col="#a78bfa" />
                </div>
              </Section>

              <div style={{ display: 'grid', gap: 12 }}>
                <Section label="WIN CONDITIONS">
                  <div style={{ display: 'grid', gap: 7 }}>
                    {(brief.win_conditions || []).map((c, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ color: '#10b981', fontFamily: "'DM Mono', monospace", fontSize: 11, marginTop: 2, flexShrink: 0 }}>{String(i + 1).padStart(2, '0')}</span>
                        <span style={{ fontSize: 13, color: '#c8cdd8', lineHeight: 1.5 }}>{c}</span>
                      </div>
                    ))}
                  </div>
                </Section>
                <Section label="DANGER ZONES">
                  <div style={{ display: 'grid', gap: 7 }}>
                    {(brief.danger_zones || []).map((d, i) => (
                      <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                        <span style={{ color: '#e8253c', fontFamily: "'DM Mono', monospace", fontSize: 11, marginTop: 2, flexShrink: 0 }}>⚠</span>
                        <span style={{ fontSize: 13, color: '#c8cdd8', lineHeight: 1.5 }}>{d}</span>
                      </div>
                    ))}
                  </div>
                </Section>
              </div>
            </div>

            {/* Player Assignments */}
            <Section label="PLAYER ASSIGNMENTS">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: 10 }}>
                {(brief.player_assignments || []).map((p, i) => (
                  <div key={i} style={{
                    border: '1px solid rgba(255,255,255,0.07)',
                    borderRadius: 10,
                    padding: '12px 14px',
                    background: '#181c22',
                    borderLeft: '3px solid #e8253c',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <div style={{ fontWeight: 900, fontSize: 15, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.05em' }}>{p.name}</div>
                      <div style={{ fontSize: 12, fontWeight: 700, color: '#38bdf8', background: 'rgba(56,189,248,0.1)', padding: '2px 8px', borderRadius: 4 }}>{p.agent}</div>
                    </div>
                    <div style={{ fontSize: 10, color: '#a78bfa', letterSpacing: '0.1em', fontFamily: "'DM Mono', monospace", marginBottom: 5 }}>{p.role}</div>
                    <div style={{ fontSize: 12, color: '#8a93a6', lineHeight: 1.5 }}>{p.directive}</div>
                  </div>
                ))}
              </div>
            </Section>

            {/* Coach Notes */}
            <Section label="COACH NOTES">
              <div style={{
                borderLeft: '3px solid rgba(232,37,60,0.5)',
                paddingLeft: 14,
              }}>
                <p style={{ fontSize: 14, color: '#c8cdd8', lineHeight: 1.7, margin: '0 0 10px', fontStyle: 'italic' }}>{brief.coach_notes}</p>
                <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 10, color: '#454e60', fontFamily: "'DM Mono', monospace", marginTop: 2 }}>TIMEOUT:</span>
                  <span style={{ fontSize: 13, color: '#8a93a6' }}>{brief.timeout_protocol}</span>
                </div>
              </div>
            </Section>

            {/* Footer */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 10, color: '#454e60', fontFamily: "'DM Mono', monospace" }}>
                VAL-TRACK · WAR ROOM INTELLIGENCE · {new Date().toISOString().slice(0, 19).replace('T', ' ')} UTC
              </span>
              <span style={{ fontSize: 10, color: 'rgba(232,37,60,0.6)', fontFamily: "'DM Mono', monospace" }}>
                COACH USE ONLY
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Print CSS */}
      <style>{`
        @media print {
          body { background: white !important; color: black !important; }
          .sidebar, .topbar, .filter-bar, header, nav, aside { display: none !important; }
          .war-room-print { border: 2px solid #333 !important; background: white !important; color: black !important; }
          .war-room-print * { color: black !important; background: white !important; border-color: #ccc !important; }
          .main-content { margin: 0 !important; padding: 0 !important; }
        }
      `}</style>
    </div>
  );
}

function Section({ label, children }) {
  return (
    <section style={{
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 11,
      background: '#12151a',
      padding: '14px 16px',
    }}>
      <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.18em', fontFamily: "'DM Mono', monospace", marginBottom: 10, textTransform: 'uppercase' }}>
        {label}
      </div>
      {children}
    </section>
  );
}

function TagRow({ tag, text, col }) {
  return (
    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
      <span style={{ fontSize: 9, color: col, fontFamily: "'DM Mono', monospace", background: `${col}18`, padding: '2px 6px', borderRadius: 4, flexShrink: 0, marginTop: 1, letterSpacing: '0.08em', fontWeight: 700 }}>{tag}</span>
      <span style={{ fontSize: 12, color: '#c8cdd8', lineHeight: 1.5 }}>{text}</span>
    </div>
  );
}