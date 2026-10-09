import { useMemo, useState } from 'react';
import { dateKey } from '../lib/dates.js';

// Maps a sort key to the field it reads from a position row.
const FIELD = { opened: 'opened_at', expiration: 'expiration_date', closed: 'closed_at', last: 'last_trade_date' };
// First click direction per column: most recent first, except expiration (soonest first).
const FIRST_DIR = { opened: 'desc', expiration: 'asc', closed: 'desc', last: 'desc' };

// Default: most recently traded at the top.
export function useSortedRows(rows) {
  const [sort, setSort] = useState({ key: 'last', dir: 'desc' });

  function toggleSort(key) {
    setSort((s) =>
      s.key === key
        ? { key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: FIRST_DIR[key] || 'desc' }
    );
  }

  function resetSort() {
    setSort({ key: 'opened', dir: 'desc' });
  }

  const sorted = useMemo(() => {
    const field = FIELD[sort.key];
    const mult = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const ka = dateKey(a[field]);
      const kb = dateKey(b[field]);
      // Rows with no date always sink to the bottom, either direction.
      if (ka === null && kb === null) return b.id - a.id;
      if (ka === null) return 1;
      if (kb === null) return -1;
      if (ka !== kb) return (ka - kb) * mult;
      return b.id - a.id; // tie-break: newest-created first
    });
  }, [rows, sort]);

  return { sorted, sort, toggleSort, resetSort };
}
