// Date helpers for the ledger tables.
// Accepts ISO strings ("2026-10-13", "2026-10-13T..."), or the "13 OCT 26"
// style stored in expiration_date. No Date objects are used for parsing, so
// there are no timezone shifts.

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function parseDate(value) {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();

  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return { y: +m[1], m: +m[2], d: +m[3] };

  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{2}|\d{4})$/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toUpperCase());
    if (mi === -1) return null;
    const y = m[3].length === 2 ? 2000 + +m[3] : +m[3];
    return { y, m: mi + 1, d: +m[1] };
  }
  return null;
}

// "13 OCT 26" (or an em dash when empty/unparseable)
export function fmtDate(value) {
  const p = parseDate(value);
  if (!p) return '—';
  return `${String(p.d).padStart(2, '0')} ${MONTHS[p.m - 1]} ${String(p.y).slice(-2)}`;
}

// Sortable number (YYYYMMDD) or null
export function dateKey(value) {
  const p = parseDate(value);
  return p ? p.y * 10000 + p.m * 100 + p.d : null;
}
