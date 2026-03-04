import { useMemo, useState } from 'react';

// ─── pure helpers ─────────────────────────────────────────────────────────────
const toNum = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

function getPlayerHistory(matches, player) {
  // Return last N matches for this player, sorted oldest→newest
  return [...matches]
    .filter(m => (m.playerStats || []).some(ps => ps.player === player))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(m => {
      const ps = m.playerStats.find(p => p.player === player);
      return {
        date: m.date,
        result: m.result,
        opponent: m.opponent,
        map: m.map,
        agent: ps?.agent || '?',
        acs: toNum(ps?.acs),
        kd: toNum(ps?.kd),
        kast: toNum(ps?.kast),
        adr: toNum(ps?.adr),
        kills: toNum(ps?.kills),
        deaths: toNum(ps?.deaths),
      };
    });
}

function calcTrend(values) {
  // Linear regression slope over last values
  if (values.length < 2) return 0;
  const n = values.length;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  values.forEach((y, x) => {
    num += (x - xMean) * (y - yMean);
    den += (x - xMean) ** 2;
  });
  return den === 0 ? 0 : num / den;
}

function classifyForm(history) {
  if (history.length === 0) return { status: 'NO DATA', emoji: '—', color: '#454e60', bg: 'rgba(69,78,96,0.15)', glow: 'transparent' };
  const recent = history.slice(-5);
  const acsSlope = calcTrend(recent.map(r => r.acs));
  const kdSlope = calcTrend(recent.map(r => r.kd));
  const winRate = recent.filter(r => r.result === 'Win').length / recent.length;
  const avgAcs = recent.reduce((a, b) => a + b.acs, 0) / recent.length;
  const avgKd = recent.reduce((a, b) => a + b.kd, 0) / recent.length;

  const hotScore = (acsSlope > 8 ? 2 : acsSlope > 3 ? 1 : 0)
    + (kdSlope > 0.05 ? 2 : kdSlope > 0.01 ? 1 : 0)
    + (winRate >= 0.6 ? 1 : 0)
    + (avgAcs >= 240 ? 1 : 0)
    + (avgKd >= 1.2 ? 1 : 0);

  const coldScore = (acsSlope < -8 ? 2 : acsSlope < -3 ? 1 : 0)
    + (kdSlope < -0.05 ? 2 : kdSlope < -0.01 ? 1 : 0)
    + (winRate <= 0.3 ? 1 : 0)
    + (avgAcs < 185 ? 1 : 0)
    + (avgKd < 0.85 ? 1 : 0);

  if (hotScore >= 3) return { status: 'HOT', emoji: '🔥', color: '#f97316', bg: 'rgba(249,115,22,0.1)', glow: 'rgba(249,115,22,0.25)', acsSlope, kdSlope };
  if (coldScore >= 3) return { status: 'SLUMP', emoji: '📉', color: '#e8253c', bg: 'rgba(232,37,60,0.1)', glow: 'rgba(232,37,60,0.2)', acsSlope, kdSlope };
  return { status: 'STEADY', emoji: '➡️', color: '#38bdf8', bg: 'rgba(56,189,248,0.08)', glow: 'transparent', acsSlope, kdSlope };
}

// ─── SVG Sparkline ────────────────────────────────────────────────────────────
function Sparkline({ values, color, width = 120, height = 40 }) {
  if (values.length < 2) return <svg width={width} height={height} />;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = 4;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const points = values.map((v, i) => {
    const x = pad + (i / (values.length - 1)) * w;
    const y = pad + h - ((v - min) / range) * h;
    return `${x},${y}`;
  });

  const areaPoints = [
    `${pad},${pad + h}`,
    ...points,
    `${pad + w},${pad + h}`,
  ].join(' ');

  return (
    <svg width={width} height={height} style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id={`grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPoints} fill={`url(#grad-${color.replace('#', '')})`} />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Last point dot */}
      {(() => {
        const last = points[points.length - 1].split(',');
        return <circle cx={last[0]} cy={last[1]} r="3" fill={color} />;
      })()}
    </svg>
  );
}

// ─── Mini result dot row ──────────────────────────────────────────────────────
function ResultDots({ history }) {
  const recent = history.slice(-5);
  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      {recent.map((r, i) => (
        <div
          key={i}
          title={`${r.result} vs ${r.opponent} (${r.map})`}
          style={{
            width: 8, height: 8, borderRadius: '50%',
            background: r.result === 'Win' ? '#10b981' : '#e8253c',
            boxShadow: r.result === 'Win' ? '0 0 5px rgba(16,185,129,0.5)' : '0 0 5px rgba(232,37,60,0.4)',
            cursor: 'default',
          }}
        />
      ))}
      {recent.length === 0 && <span style={{ fontSize: 11, color: '#454e60' }}>no data</span>}
    </div>
  );
}

// ─── Single player form card ──────────────────────────────────────────────────
function FormCard({ player, history, metric }) {
  const [hovered, setHovered] = useState(false);
  const recent = history.slice(-5);
  const form = classifyForm(history);
  const values = recent.map(r => r[metric]);
  const latest = recent[recent.length - 1];
  const prev = recent[recent.length - 2];

  const metaLabel = { acs: 'ACS', kd: 'K/D', kast: 'KAST %', adr: 'ADR' };
  const latestVal = latest ? (metric === 'kd' ? latest[metric].toFixed(2) : Math.round(latest[metric])) : '—';
  const delta = latest && prev ? latest[metric] - prev[metric] : null;
  const deltaStr = delta !== null
    ? `${delta >= 0 ? '+' : ''}${metric === 'kd' ? delta.toFixed(2) : Math.round(delta)}`
    : null;

  const peakAcs = recent.length ? Math.max(...recent.map(r => r.acs)) : 0;
  const avgAcs = recent.length ? Math.round(recent.reduce((a, b) => a + b.acs, 0) / recent.length) : 0;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        border: `1px solid ${hovered ? form.color + '55' : 'rgba(255,255,255,0.07)'}`,
        borderRadius: 14,
        background: hovered ? form.bg : '#12151a',
        padding: '16px 18px',
        display: 'grid',
        gap: 12,
        cursor: 'default',
        transition: 'all 0.2s ease',
        boxShadow: hovered ? `0 0 24px ${form.glow}` : 'none',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Background glow orb */}
      <div style={{
        position: 'absolute', top: -20, right: -20,
        width: 100, height: 100, borderRadius: '50%',
        background: `radial-gradient(circle, ${form.color}18 0%, transparent 70%)`,
        pointerEvents: 'none',
        opacity: hovered ? 1 : 0.5,
        transition: 'opacity 0.2s',
      }} />

      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ fontWeight: 900, fontSize: 16, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em' }}>
            {player}
          </div>
          <div style={{ fontSize: 11, color: '#8a93a6', marginTop: 2 }}>
            {latest?.agent || '—'} · {recent.length} recent matches
          </div>
        </div>
        <div style={{
          background: form.bg,
          border: `1px solid ${form.color}44`,
          borderRadius: 8,
          padding: '4px 10px',
          fontSize: 11,
          fontWeight: 800,
          color: form.color,
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '0.1em',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          whiteSpace: 'nowrap',
        }}>
          <span>{form.emoji}</span>
          <span>{form.status}</span>
        </div>
      </div>

      {/* Sparkline + latest stat */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.15em', fontFamily: "'DM Mono', monospace", marginBottom: 3 }}>
            {metaLabel[metric]} TREND (LAST {recent.length})
          </div>
          <Sparkline values={values} color={form.color} width={130} height={44} />
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace" }}>LATEST</div>
          <div style={{ fontSize: 30, fontWeight: 900, color: form.color, fontFamily: "'Barlow Condensed', sans-serif", lineHeight: 1 }}>
            {latestVal}
          </div>
          {deltaStr && (
            <div style={{ fontSize: 12, fontWeight: 700, color: delta >= 0 ? '#10b981' : '#e8253c', fontFamily: "'DM Mono', monospace" }}>
              {deltaStr}
            </div>
          )}
        </div>
      </div>

      {/* Mini stat pills */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
        {[
          { label: 'AVG ACS', val: avgAcs },
          { label: 'PEAK ACS', val: peakAcs },
          { label: 'WIN RATE', val: `${recent.length ? Math.round(recent.filter(r => r.result === 'Win').length / recent.length * 100) : 0}%` },
        ].map(item => (
          <div key={item.label} style={{
            background: 'rgba(255,255,255,0.03)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 7,
            padding: '6px 8px',
            textAlign: 'center',
          }}>
            <div style={{ fontSize: 14, fontWeight: 800, fontFamily: "'Barlow Condensed', sans-serif" }}>{item.val}</div>
            <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.1em', fontFamily: "'DM Mono', monospace" }}>{item.label}</div>
          </div>
        ))}
      </div>

      {/* Result dots */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontSize: 9, color: '#454e60', letterSpacing: '0.12em', fontFamily: "'DM Mono', monospace" }}>LAST {recent.length} RESULTS</div>
        <ResultDots history={history} />
      </div>
    </div>
  );
}

// ─── Summary banner ───────────────────────────────────────────────────────────
function FormBanner({ formData }) {
  const hot = formData.filter(f => f.form.status === 'HOT').map(f => f.player);
  const slump = formData.filter(f => f.form.status === 'SLUMP').map(f => f.player);
  const steady = formData.filter(f => f.form.status === 'STEADY').map(f => f.player);

  if (!formData.length) return null;

  return (
    <div style={{
      border: '1px solid rgba(255,255,255,0.07)',
      borderRadius: 12,
      background: 'linear-gradient(135deg, rgba(249,115,22,0.06) 0%, rgba(12,14,16,0) 60%)',
      padding: '14px 18px',
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
      gap: 10,
    }}>
      {[
        { label: '🔥 HOT PLAYERS', names: hot, color: '#f97316', bg: 'rgba(249,115,22,0.1)' },
        { label: '📉 IN SLUMP', names: slump, color: '#e8253c', bg: 'rgba(232,37,60,0.1)' },
        { label: '➡️ STEADY', names: steady, color: '#38bdf8', bg: 'rgba(56,189,248,0.08)' },
      ].map(item => (
        <div key={item.label} style={{
          border: `1px solid ${item.color}33`,
          borderRadius: 9,
          padding: '10px 12px',
          background: item.bg,
        }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: item.color, letterSpacing: '0.1em', fontFamily: "'DM Mono', monospace", marginBottom: 6 }}>
            {item.label}
          </div>
          {item.names.length > 0
            ? item.names.map(n => (
              <div key={n} style={{ fontSize: 13, fontWeight: 700, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.04em', lineHeight: 1.6 }}>{n}</div>
            ))
            : <div style={{ fontSize: 12, color: '#454e60' }}>None</div>
          }
        </div>
      ))}
      <div style={{
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 9,
        padding: '10px 12px',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#8a93a6', letterSpacing: '0.1em', fontFamily: "'DM Mono', monospace", marginBottom: 4 }}>
          COACH ALERT
        </div>
        <div style={{ fontSize: 12, color: '#c8cdd8', lineHeight: 1.5 }}>
          {slump.length === 0 && hot.length > 0
            ? `${hot[0]} is peaking — lean on them this match.`
            : slump.length > 0
            ? `${slump[0]} needs a check-in before next game.`
            : 'Team form is stable across the board.'}
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────
export function PlayerFormTracker({ matches }) {
  const [metric, setMetric] = useState('acs');

  const players = useMemo(() => {
    const set = new Set();
    matches.forEach(m => (m.playerStats || []).forEach(ps => set.add(ps.player)));
    return [...set].sort();
  }, [matches]);

  const formData = useMemo(() =>
    players.map(player => {
      const history = getPlayerHistory(matches, player);
      const form = classifyForm(history);
      return { player, history, form };
    }).sort((a, b) => {
      const order = { HOT: 0, STEADY: 1, SLUMP: 2, 'NO DATA': 3 };
      return (order[a.form.status] ?? 3) - (order[b.form.status] ?? 3);
    }),
    [matches, players]
  );

  const metrics = [
    { id: 'acs', label: 'ACS' },
    { id: 'kd', label: 'K/D' },
    { id: 'kast', label: 'KAST' },
    { id: 'adr', label: 'ADR' },
  ];

  if (players.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: '#454e60', fontFamily: "'DM Mono', monospace", fontSize: 13 }}>
        No player data yet — add some matches to track form.
      </div>
    );
  }

  return (
    <div style={{ display: 'grid', gap: 14 }}>

      {/* ── Header ── */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.07)',
        borderRadius: 12,
        background: 'linear-gradient(135deg, rgba(249,115,22,0.07) 0%, rgba(12,14,16,0) 50%)',
        padding: '18px 20px',
        display: 'grid',
        gridTemplateColumns: '1fr auto',
        alignItems: 'center',
        gap: 16,
      }}>
        <div>
          <div style={{ fontSize: 10, color: 'rgba(249,115,22,0.9)', letterSpacing: '0.2em', fontFamily: "'DM Mono', monospace", marginBottom: 5 }}>
            ◈ LIVE FORM TRACKER · LAST 5 MATCHES
          </div>
          <div style={{ fontSize: 22, fontWeight: 900, fontFamily: "'Barlow Condensed', sans-serif", letterSpacing: '0.03em' }}>
            Who's Hot, Who's Not
          </div>
          <div style={{ fontSize: 13, color: '#8a93a6', marginTop: 2 }}>
            Real-time form status based on stat trends, not just averages.
          </div>
        </div>

        {/* Metric switcher */}
        <div style={{ display: 'flex', gap: 6 }}>
          {metrics.map(m => (
            <button
              key={m.id}
              onClick={() => setMetric(m.id)}
              style={{
                background: metric === m.id ? '#f97316' : '#1f242c',
                border: 'none',
                color: metric === m.id ? '#fff' : '#8a93a6',
                padding: '7px 14px',
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: '0.1em',
                cursor: 'pointer',
                borderRadius: 7,
                fontFamily: "'DM Mono', monospace",
                transition: 'all 0.15s',
                boxShadow: metric === m.id ? '0 0 12px rgba(249,115,22,0.3)' : 'none',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Form summary banner ── */}
      <FormBanner formData={formData} />

      {/* ── Cards grid ── */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
        gap: 12,
      }}>
        {formData.map(({ player, history }) => (
          <FormCard
            key={player}
            player={player}
            history={history}
            metric={metric}
          />
        ))}
      </div>

      {/* ── Legend ── */}
      <div style={{
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: 9,
        padding: '10px 14px',
        display: 'flex',
        gap: 20,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}>
        <span style={{ fontSize: 10, color: '#454e60', fontFamily: "'DM Mono', monospace", letterSpacing: '0.1em' }}>HOW IT WORKS:</span>
        {[
          { emoji: '🔥', label: 'HOT', desc: 'Rising ACS/KD + winning' },
          { emoji: '📉', label: 'SLUMP', desc: 'Falling stats + losing streak' },
          { emoji: '➡️', label: 'STEADY', desc: 'Flat trend, consistent' },
        ].map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#8a93a6' }}>
            <span>{item.emoji}</span>
            <span style={{ fontWeight: 700, fontFamily: "'DM Mono', monospace" }}>{item.label}</span>
            <span>— {item.desc}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
