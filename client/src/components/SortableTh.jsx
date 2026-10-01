import React from 'react';

export default function SortableTh({ label, sortKey, sort, onSort }) {
  const active = sort.key === sortKey;
  const arrow = active ? (sort.dir === 'asc' ? '▲' : '▼') : '';
  return (
    <th aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`th-sort ${active ? 'active' : ''}`} onClick={() => onSort(sortKey)}>
        {label}
        <span className="th-sort-arrow">{arrow}</span>
      </button>
    </th>
  );
}
