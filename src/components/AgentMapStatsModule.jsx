import { useState } from 'react';
import { AGENTS as FALLBACK_AGENTS, MAPS as FALLBACK_MAPS } from '../data/sampleData';
import { pct } from '../utils/statsHelpers';

const uniq = (arr) => [...new Set(arr)];

function summarize(entries) {
  const played = entries.length;
  const wins = entries.filter((e) => e.result === 'Win').length;
  const losses = played - wins;
  return {
    played,
    wins,
    losses,
    winRate: pct(wins, played),
    winPct: played ? `${pct(wins, played)}%` : '-',
  };
}

function tone(winRate, played) {
  if (!played) return 'muted';
  if (winRate < 50) return 'bad';
  if (winRate >= 60) return 'good';
  return 'mid';
}

export function AgentMapStatsModule({ matches, mapNames = [], agentNames = [] }) {
  const [expandedAgent, setExpandedAgent] = useState(null);

  const seenMaps = matches.map((m) => m.map).filter(Boolean);
  const seenAgents = matches.flatMap((m) => (m.playerStats || []).map((ps) => ps.agent)).filter(Boolean);

  const mapList = uniq([...(mapNames.length ? mapNames : FALLBACK_MAPS), ...seenMaps]);
  const agentList = uniq([...(agentNames.length ? agentNames : FALLBACK_AGENTS), ...seenAgents]);

  const entries = matches.flatMap((m) =>
    (m.playerStats || []).map((ps) => ({
      map: m.map,
      agent: ps.agent,
      result: m.result,
    })),
  );

  const overallByAgent = agentList.map((agent) => ({
    agent,
    summary: summarize(entries.filter((e) => e.agent === agent)),
  }));

  const usedAgents = overallByAgent.filter((r) => r.summary.played > 0);
  const mostPlayed = [...usedAgents].sort((a, b) => b.summary.played - a.summary.played)[0];
  const bestAgent = [...usedAgents].sort((a, b) => b.summary.winRate - a.summary.winRate)[0];

  const sortedAgents = [...overallByAgent].sort((a, b) => {
    if (b.summary.played !== a.summary.played) return b.summary.played - a.summary.played;
    return b.summary.winRate - a.summary.winRate;
  });

  return (
    <div className="agentmap-layout">
      <div className="agentmap-cards">
        <div className="agentmap-card">
          <div className="agentmap-card-label">Agents Used</div>
          <div className="agentmap-card-value">{usedAgents.length}</div>
          <div className="agentmap-card-sub">with current filters</div>
        </div>
        <div className="agentmap-card">
          <div className="agentmap-card-label">Best Agent</div>
          <div className="agentmap-card-value agentmap-good">{bestAgent ? bestAgent.agent : '-'}</div>
          <div className="agentmap-card-sub">{bestAgent ? bestAgent.summary.winPct : 'no data'}</div>
        </div>
        <div className="agentmap-card">
          <div className="agentmap-card-label">Most Played Agent</div>
          <div className="agentmap-card-value">{mostPlayed ? mostPlayed.agent : '-'}</div>
          <div className="agentmap-card-sub">{mostPlayed ? `${mostPlayed.summary.played} picks` : 'no data'}</div>
        </div>
      </div>

      <div className="agent-list">
        {sortedAgents.map(({ agent, summary }) => {
          const isExpanded = expandedAgent === agent;
          const agentEntries = entries.filter((e) => e.agent === agent);
          return (
            <section key={agent} className="agent-row-wrap">
              <div className="agent-row">
                <div className="agent-row-main">
                  <div className="agent-row-name">{agent}</div>
                  <div className="agent-row-sub">
                    {summary.played} picks • {summary.wins}W-{summary.losses}L
                  </div>
                </div>

                <div className={`agent-row-pill tone-${tone(summary.winRate, summary.played)}`}>
                  {summary.winPct}
                </div>

                <button
                  className="agent-detail-btn"
                  onClick={() => setExpandedAgent(isExpanded ? null : agent)}
                >
                  {isExpanded ? 'Hide Details' : 'Show Details'}
                </button>
              </div>

              {isExpanded && (
                <div className="agent-details-panel">
                  <div className="agent-detail-summary">
                    <div className="detail-chip">
                      <span className="detail-label">Overall</span>
                      <span className="detail-value">{summary.winPct}</span>
                    </div>
                    <div className="detail-chip">
                      <span className="detail-label">Record</span>
                      <span className="detail-value">{summary.wins}W-{summary.losses}L</span>
                    </div>
                    <div className="detail-chip">
                      <span className="detail-label">Picks</span>
                      <span className="detail-value">{summary.played}</span>
                    </div>
                  </div>

                  <div className="agent-map-list">
                    {mapList.map((map) => {
                      const mapSummary = summarize(agentEntries.filter((e) => e.map === map));
                      return (
                        <div key={`${agent}-${map}`} className={`agent-map-row tone-${tone(mapSummary.winRate, mapSummary.played)}`}>
                          <div className="map-name">{map}</div>
                          <div className="map-win">{mapSummary.winPct}</div>
                          <div className="map-record">{mapSummary.wins}W-{mapSummary.losses}L</div>
                          <div className="map-played">{mapSummary.played} picks</div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
