import React from 'react';

// A rubber-stamp style badge: OPEN in blue-black ink, CLOSED in green or red
// depending on whether the position ended profitable.
export default function StatusStamp({ status, netTotal = 0 }) {
  if (status === 'open') {
    return <span className="stamp stamp-open">OPEN</span>;
  }
  const win = netTotal >= 0;
  return <span className={`stamp ${win ? 'stamp-win' : 'stamp-loss'}`}>{win ? 'CLOSED · WIN' : 'CLOSED · LOSS'}</span>;
}
