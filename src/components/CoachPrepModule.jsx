import { useMemo, useState } from 'react';
import { pct } from '../utils/statsHelpers';

function toNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function parseScore(score) {
  const [usRaw, themRaw] = String(score || '').split('-');
  const us = toNum(usRaw);
  const them = toNum(themRaw);
  return { us, them, diff: us - them };
}

function sidePct(matches, side) {
  const roundsKey = side === 'atk' ? 'atkRounds' : 'defRounds';
  const winsKey = side === 'atk' ? 'atkWins' : 'defWins';
  const totals = matches.reduce(
    (acc, m) => {
      acc.rounds += toNum(m.teamMetrics?.[roundsKey]);
      acc.wins += toNum(m.teamMetrics?.[winsKey]);
      return acc;
    },
    { rounds: 0, wins: 0 },
  );
  return pct(totals.wins, totals.rounds);
}

function pistolPct(matches) {
  const total = matches.length * 2;
  if (!total) return 0;
  let wins = 0;
  for (const m of matches) {
    if (m.teamMetrics?.atkPistolWin === 'Win') wins += 1;
    if (m.teamMetrics?.defPistolWin === 'Win') wins += 1;
  }
  return pct(wins, total);
}

function mapInsights(matches) {
  const groups = {};
  for (const m of matches) {
    const map = m.map || 'Unknown';
    if (!groups[map]) groups[map] = [];
    groups[map].push(m);
  }

  const rows = Object.entries(groups).map(([map, items]) => {
    const wins = items.filter((m) => m.result === 'Win').length;
    return {
      map,
      played: items.length,
      winRate: pct(wins, items.length),
      wins,
      losses: items.length - wins,
    };
  });

  const eligible = rows.filter((r) => r.played >= 2);
  const banCandidate = [...eligible].sort((a, b) => {
    if (a.winRate !== b.winRate) return a.winRate - b.winRate;
    return b.played - a.played;
  })[0] || null;
  const pickCandidate = [...eligible].sort((a, b) => {
    if (a.winRate !== b.winRate) return b.winRate - a.winRate;
    return b.played - a.played;
  })[0] || null;

  return { rows: rows.sort((a, b) => b.played - a.played), banCandidate, pickCandidate };
}

function buildRecommendations(analysis) {
  if (!analysis || analysis.played === 0) {
    return [
      'No opponent data yet. Start by tracking map and side outcomes for at least 3 matches.',
      'Run one custom drill block for pistol rounds and one for anti-eco conversion each week.',
      'Record timeout moments in notes after each match to build better mid-game protocols.',
    ];
  }

  const tips = [];
  if (analysis.atkPct < 45) {
    tips.push('Attack side is underperforming. Build a 6-round scripted open with set utility timings.');
  }
  if (analysis.defPct < 45) {
    tips.push('Defense side is leaking rounds. Prioritize first-contact pairing and retake role assignments.');
  }
  if (analysis.pistolPct < 45) {
    tips.push('Pistol conversion is low. Lock two pistol packages per map and rehearse buy/position defaults.');
  }
  if (analysis.closeLosses >= 2) {
    tips.push('Close-game losses are frequent. Define timeout triggers and final-5-round calling rules.');
  }
  if (analysis.mapInsight?.banCandidate) {
    tips.push(
      `Consider banning ${analysis.mapInsight.banCandidate.map}: ${analysis.mapInsight.banCandidate.winRate}% in ${analysis.mapInsight.banCandidate.played} games.`,
    );
  }
  if (analysis.mapInsight?.pickCandidate && analysis.mapInsight.pickCandidate.winRate >= 60) {
    tips.push(
      `Lean into ${analysis.mapInsight.pickCandidate.map} as a comfort pick: ${analysis.mapInsight.pickCandidate.winRate}% win rate.`,
    );
  }

  if (tips.length === 0) {
    tips.push('Current profile is balanced. Focus prep on opponent-specific veto and anti-default adaptations.');
  }
  return tips.slice(0, 4);
}

function analyzeOpponent(matches, opponent) {
  const scoped = opponent === 'All Opponents'
    ? matches
    : matches.filter((m) => (m.opponent || 'Unknown') === opponent);

  const played = scoped.length;
  const wins = scoped.filter((m) => m.result === 'Win').length;
  const losses = played - wins;
  const closeLosses = scoped.filter((m) => m.result !== 'Win' && Math.abs(parseScore(m.score).diff) <= 3).length;
  const closeGames = scoped.filter((m) => Math.abs(parseScore(m.score).diff) <= 3).length;
  const avgRoundDiff = played
    ? Math.round(
        scoped.reduce((sum, m) => sum + parseScore(m.score).diff, 0) / played,
      )
    : 0;

  const atkPct = sidePct(scoped, 'atk');
  const defPct = sidePct(scoped, 'def');
  const pistol = pistolPct(scoped);
  const sideGap = Math.abs(atkPct - defPct);
  const mapInsight = mapInsights(scoped);

  // 0-100 risk score: higher means harder matchup profile.
  const threatScore = played
    ? Math.min(
        100,
        Math.round(
          (pct(losses, played) * 0.5) +
            (pct(closeLosses, played) * 0.2) +
            (sideGap * 0.2) +
            ((100 - pistol) * 0.1),
        ),
      )
    : 0;

  return {
    opponent,
    played,
    wins,
    losses,
    winRate: pct(wins, played),
    closeLosses,
    closeGames,
    avgRoundDiff,
    atkPct,
    defPct,
    pistolPct: pistol,
    sideGap,
    threatScore,
    mapInsight,
  };
}

function draftContextWeight(match, selectedMap, selectedOpponent) {
  let w = 0.35;
  if (selectedMap !== 'All Maps') {
    w += match.map === selectedMap ? 0.45 : -0.1;
  }
  if (selectedOpponent !== 'All Opponents') {
    w += (match.opponent || 'Unknown') === selectedOpponent ? 0.35 : -0.1;
  }
  return Math.max(0.1, w);
}

function perfScore(row, result) {
  const acs = toNum(row.acs);
  const kast = toNum(row.kast);
  const kills = toNum(row.kills);
  const deaths = toNum(row.deaths);
  const assists = toNum(row.assists);

  return (
    (acs * 0.55) +
    (kast * 1.3) +
    ((kills - deaths) * 5) +
    (assists * 1.15) +
    (result === 'Win' ? 18 : -8)
  );
}

function buildDraftPlan(matches, selectedMap, selectedOpponent) {
  const players = [...new Set(matches.flatMap((m) => (m.playerStats || []).map((ps) => ps.player)).filter(Boolean))].sort();

  const roster = players.map((player) => {
    const agentAgg = {};
    const rows = matches.filter((m) => (m.playerStats || []).some((ps) => ps.player === player));

    for (const m of rows) {
      const ctxWeight = draftContextWeight(m, selectedMap, selectedOpponent);
      const statRow = (m.playerStats || []).find((ps) => ps.player === player);
      if (!statRow || !statRow.agent) continue;
      const key = statRow.agent;
      if (!agentAgg[key]) {
        agentAgg[key] = { agent: key, weighted: 0, weightTotal: 0, games: 0, wins: 0 };
      }
      agentAgg[key].weighted += perfScore(statRow, m.result) * ctxWeight;
      agentAgg[key].weightTotal += ctxWeight;
      agentAgg[key].games += 1;
      if (m.result === 'Win') agentAgg[key].wins += 1;
    }

    const ranked = Object.values(agentAgg)
      .map((a) => {
        const avgScore = a.weightTotal ? a.weighted / a.weightTotal : 0;
        const winRate = pct(a.wins, a.games);
        const stability = Math.min(12, a.games * 2);
        const finalScore = Math.round(avgScore + (winRate * 0.4) + stability);
        const confidence = Math.min(99, Math.round((a.weightTotal * 22) + (a.games * 5)));
        return { ...a, winRate, avgScore: Math.round(avgScore), finalScore, confidence };
      })
      .sort((a, b) => b.finalScore - a.finalScore);

    const top = ranked[0] || null;
    const backup = ranked[1] || null;
    const flex = ranked[2] || null;

    return {
      player,
      top,
      backup,
      flex,
      totalGames: rows.length,
    };
  });

  const assigned = roster.filter((r) => r.top).map((r) => ({
    player: r.player,
    agent: r.top.agent,
    confidence: r.top.confidence,
    score: r.top.finalScore,
  }));
  const uniqueAgents = new Set(assigned.map((a) => a.agent)).size;
  const avgConfidence = assigned.length
    ? Math.round(assigned.reduce((sum, a) => sum + a.confidence, 0) / assigned.length)
    : 0;
  const projectedPower = assigned.length
    ? Math.round(assigned.reduce((sum, a) => sum + a.score, 0) / assigned.length)
    : 0;

  return {
    roster,
    assigned,
    uniqueAgents,
    avgConfidence,
    projectedPower,
  };
}

export function CoachPrepModule({ matches }) {
  const opponents = useMemo(() => {
    const names = [...new Set(matches.map((m) => m.opponent || 'Unknown'))];
    return ['All Opponents', ...names.sort()];
  }, [matches]);

  const [selectedOpponent, setSelectedOpponent] = useState('All Opponents');
  const mapOptions = useMemo(
    () => ['All Maps', ...[...new Set(matches.map((m) => m.map).filter(Boolean))].sort()],
    [matches],
  );
  const [selectedDraftMap, setSelectedDraftMap] = useState('All Maps');
  const [selectedDraftOpponent, setSelectedDraftOpponent] = useState('All Opponents');

  const ranking = useMemo(
    () =>
      opponents
        .filter((x) => x !== 'All Opponents')
        .map((opp) => analyzeOpponent(matches, opp))
        .filter((r) => r.played > 0)
        .sort((a, b) => b.threatScore - a.threatScore),
    [matches, opponents],
  );

  const analysis = useMemo(
    () => analyzeOpponent(matches, selectedOpponent),
    [matches, selectedOpponent],
  );

  const recommendations = useMemo(
    () => buildRecommendations(analysis),
    [analysis],
  );
  const draftPlan = useMemo(
    () => buildDraftPlan(matches, selectedDraftMap, selectedDraftOpponent),
    [matches, selectedDraftMap, selectedDraftOpponent],
  );

  return (
    <div style={{ display: 'grid', gap: 14 }}>
      <div
        style={{
          border: '1px solid var(--border)',
          borderRadius: 12,
          background: 'linear-gradient(165deg, rgba(56,189,248,0.08), rgba(255,255,255,0.01))',
          padding: 14,
          display: 'grid',
          gridTemplateColumns: '1fr auto',
          gap: 10,
          alignItems: 'end',
        }}
      >
        <div>
          <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', fontFamily: 'var(--mono)' }}>
            COACH LAB
          </div>
          <div style={{ fontSize: 20, fontWeight: 900, marginTop: 4 }}>
            Matchup Prep Intelligence
          </div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            Auto-generated threat profile and game-plan priorities from your tracked matches.
          </div>
        </div>
        <div className="filter-group" style={{ minWidth: 230 }}>
          <label className="filter-label">Opponent Scope</label>
          <select
            className="filter-select"
            value={selectedOpponent}
            onChange={(e) => setSelectedOpponent(e.target.value)}
          >
            {opponents.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
        <InsightCard label="Threat Score" value={`${analysis.threatScore}/100`} sub={`${analysis.played} matches`} tone="var(--red)" />
        <InsightCard label="Win Rate" value={`${analysis.winRate}%`} sub={`${analysis.wins}W-${analysis.losses}L`} tone="var(--emerald)" />
        <InsightCard label="Side Gap" value={`${analysis.sideGap}%`} sub={`ATK ${analysis.atkPct}% | DEF ${analysis.defPct}%`} tone="var(--amber)" />
        <InsightCard label="Pistol Win%" value={`${analysis.pistolPct}%`} sub={`${analysis.closeLosses} close losses`} tone="var(--sky)" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 12 }}>
        <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--s1)', padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', fontFamily: 'var(--mono)', marginBottom: 8 }}>
            PRIORITY GAME PLAN
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            {recommendations.map((tip) => (
              <div
                key={tip}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 10,
                  padding: '10px 12px',
                  background: 'var(--s2)',
                  fontSize: 13,
                  lineHeight: 1.45,
                }}
              >
                {tip}
              </div>
            ))}
          </div>
        </section>

        <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--s1)', padding: 14 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', fontFamily: 'var(--mono)', marginBottom: 8 }}>
            MAP VETO SIGNALS
          </div>
          <div style={{ display: 'grid', gap: 8 }}>
            <MapCallout
              label="Ban Candidate"
              row={analysis.mapInsight.banCandidate}
              fallback="Not enough repeated map data yet"
              tone="var(--red)"
            />
            <MapCallout
              label="Pick Candidate"
              row={analysis.mapInsight.pickCandidate}
              fallback="No clear comfort map yet"
              tone="var(--emerald)"
            />
            <div style={{ borderTop: '1px solid var(--border)', marginTop: 4, paddingTop: 8 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>Map Records</div>
              <div style={{ display: 'grid', gap: 6, maxHeight: 190, overflow: 'auto', paddingRight: 4 }}>
                {analysis.mapInsight.rows.map((r) => (
                  <div
                    key={r.map}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto',
                      gap: 8,
                      fontSize: 12,
                      alignItems: 'center',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: '7px 9px',
                      background: 'var(--s2)',
                    }}
                  >
                    <span>{r.map}</span>
                    <span style={{ color: 'var(--text2)' }}>{r.played}x</span>
                    <span style={{ fontWeight: 800 }}>{r.winRate}%</span>
                  </div>
                ))}
                {analysis.mapInsight.rows.length === 0 && (
                  <div style={{ fontSize: 12, color: 'var(--text3)' }}>No map data.</div>
                )}
              </div>
            </div>
          </div>
        </section>
      </div>

      <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--s1)', padding: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', fontFamily: 'var(--mono)', marginBottom: 10 }}>
          OPPONENT THREAT LADDER
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table className="stats-table" style={{ minWidth: 660 }}>
            <thead>
              <tr>
                <th>Opponent</th>
                <th>Threat</th>
                <th>Record</th>
                <th>Side Split</th>
                <th>Pistol</th>
                <th>Avg Round Diff</th>
              </tr>
            </thead>
            <tbody>
              {ranking.map((r) => (
                <tr key={r.opponent}>
                  <td>{r.opponent}</td>
                  <td>{r.threatScore}/100</td>
                  <td>{r.wins}W-{r.losses}L ({r.winRate}%)</td>
                  <td>A {r.atkPct}% | D {r.defPct}%</td>
                  <td>{r.pistolPct}%</td>
                  <td>{r.avgRoundDiff > 0 ? `+${r.avgRoundDiff}` : r.avgRoundDiff}</td>
                </tr>
              ))}
              {ranking.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ color: 'var(--text3)' }}>
                    No opponent data available yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--s1)', padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'end', marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text3)', letterSpacing: '0.1em', fontFamily: 'var(--mono)' }}>
              COACH DRAFT ROOM
            </div>
            <div style={{ fontSize: 18, fontWeight: 900 }}>Recommended Player-Agent Setup</div>
            <div style={{ fontSize: 12, color: 'var(--text2)' }}>
              Context-aware picks by player using weighted map/opponent performance.
            </div>
          </div>
          <div className="filter-group" style={{ minWidth: 170 }}>
            <label className="filter-label">Map Context</label>
            <select className="filter-select" value={selectedDraftMap} onChange={(e) => setSelectedDraftMap(e.target.value)}>
              {mapOptions.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </div>
          <div className="filter-group" style={{ minWidth: 180 }}>
            <label className="filter-label">Opponent Context</label>
            <select className="filter-select" value={selectedDraftOpponent} onChange={(e) => setSelectedDraftOpponent(e.target.value)}>
              {opponents.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10, marginBottom: 10 }}>
          <InsightCard label="Projected Power" value={`${draftPlan.projectedPower}`} sub="avg lineup score" tone="var(--violet)" />
          <InsightCard label="Avg Confidence" value={`${draftPlan.avgConfidence}%`} sub="reliability of picks" tone="var(--sky)" />
          <InsightCard label="Unique Agents" value={`${draftPlan.uniqueAgents}`} sub="composition diversity" tone="var(--amber)" />
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {draftPlan.roster.map((entry) => (
            <DraftRow key={entry.player} entry={entry} />
          ))}
          {draftPlan.roster.length === 0 && (
            <div style={{ color: 'var(--text3)', fontSize: 12 }}>No player data found for this context.</div>
          )}
        </div>
      </section>
    </div>
  );
}

function InsightCard({ label, value, sub, tone }) {
  return (
    <article
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'var(--s1)',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.1em', fontFamily: 'var(--mono)' }}>
        {label}
      </div>
      <div style={{ fontSize: 26, fontWeight: 900, lineHeight: 1.1, color: tone }}>
        {value}
      </div>
      <div style={{ fontSize: 11, color: 'var(--text2)' }}>{sub}</div>
    </article>
  );
}

function MapCallout({ label, row, fallback, tone }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '10px 12px',
        background: 'var(--s2)',
      }}
    >
      <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.1em', fontFamily: 'var(--mono)' }}>
        {label}
      </div>
      {row ? (
        <>
          <div style={{ fontSize: 18, fontWeight: 900, color: tone }}>{row.map}</div>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            {row.winRate}% win rate in {row.played} matches
          </div>
        </>
      ) : (
        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 4 }}>{fallback}</div>
      )}
    </div>
  );
}

function DraftRow({ entry }) {
  return (
    <div
      style={{
        border: '1px solid var(--border)',
        borderRadius: 10,
        background: 'var(--s2)',
        padding: '9px 10px',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr auto',
        gap: 8,
        alignItems: 'center',
      }}
    >
      <div>
        <div style={{ fontWeight: 800, fontSize: 14 }}>{entry.player}</div>
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{entry.totalGames} tracked matches</div>
      </div>

      <PickCell label="Primary" row={entry.top} tone="var(--emerald)" />
      <PickCell label="Backup" row={entry.backup} tone="var(--sky)" />
      <PickCell label="Flex" row={entry.flex} tone="var(--amber)" compact />
    </div>
  );
}

function PickCell({ label, row, tone, compact = false }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', letterSpacing: '0.08em', fontFamily: 'var(--mono)' }}>
        {label}
      </div>
      {row ? (
        <>
          <div style={{ fontWeight: 800, color: tone, fontSize: compact ? 12 : 14 }}>
            {row.agent}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text2)' }}>
            score {row.finalScore} | conf {row.confidence}%
          </div>
        </>
      ) : (
        <div style={{ fontSize: 11, color: 'var(--text3)' }}>n/a</div>
      )}
    </div>
  );
}
