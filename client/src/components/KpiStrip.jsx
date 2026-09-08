import React from 'react';
import { fmtMoney } from '../lib/api.js';

export default function KpiStrip({ summary }) {
  if (!summary) return null;
  const plClass = summary.realized_pl >= 0 ? 'pl-gain' : 'pl-loss';

  return (
    <div className="kpi-strip">
      <div className="kpi">
        <div className="kpi-label">Open Positions</div>
        <div className="kpi-value">{summary.open_positions}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Total Trades</div>
        <div className="kpi-value">{summary.total_trades}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Realized P/L</div>
        <div className={`kpi-value ${plClass}`}>{fmtMoney(summary.realized_pl)}</div>
      </div>
      <div className="kpi">
        <div className="kpi-label">Win Rate</div>
        <div className="kpi-value">{summary.win_rate === null ? '—' : `${summary.win_rate}%`}</div>
      </div>
    </div>
  );
}
