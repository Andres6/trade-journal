import React from 'react';
import { fmtMoney } from '../lib/api.js';

export default function KpiStrip({ summary, metrics }) {
  if (!summary) return null;
  const realizedPlClass = summary.realized_pl >= 0 ? 'pl-gain' : 'pl-loss';
  const unrealizedPlClass = summary.unrealized_pl >= 0 ? 'pl-gain' : 'pl-loss';

  // Define all available KPI items with unique keys
  const allKpis = {
    open_positions: {
      label: 'Open Positions',
      value: summary.open_positions,
    },
    total_trades: {
      label: 'Total Trades',
      value: summary.total_trades,
    },
    realized_pl: {
      label: 'Realized P/L',
      value: fmtMoney(summary.realized_pl),
      className: realizedPlClass,
    },
    unrealized_pl: {
      label: 'Unrealized P/L',
      value: fmtMoney(summary.unrealized_pl),
      className: unrealizedPlClass,
    },
    win_rate: {
      label: 'Win Rate',
      value: summary.win_rate === null ? '—' : `${summary.win_rate}%`,
    },
  };

  // If a 'metrics' prop is passed, filter to only those keys. Otherwise show all.
  const keysToDisplay = metrics || Object.keys(allKpis);

  return (
    <div className="kpi-strip">
      {keysToDisplay.map((key) => {
        const kpi = allKpis[key];
        if (!kpi) return null;
        return (
          <div className="kpi" key={key}>
            <div className="kpi-label">{kpi.label}</div>
            <div className={`kpi-value ${kpi.className || ''}`}>{kpi.value}</div>
          </div>
        );
      })}
    </div>
  );
}