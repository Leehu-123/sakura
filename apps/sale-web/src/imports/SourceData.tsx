import { useState } from 'react';
export function SourceData({ data }: { data?: Record<string, unknown> }) {
  const [index, setIndex] = useState(0);
  if (!data) return null;
  const rows = Array.isArray(data.rows)
    ? (data.rows as { row: number; values: Record<string, unknown> }[])
    : null;
  const values = (rows?.[index]?.values || data.values || {}) as Record<string, unknown>;
  return (
    <details className="panel import-panel">
      <summary>Thông tin gốc từ file Sapo</summary>
      <p>
        {String(data.file || '')} · Dòng {rows?.[index]?.row || String(data.row || '')}
      </p>
      {Array.isArray(data.warnings) && (
        <ul>
          {data.warnings.map((w, i) => (
            <li key={i}>{String(w)}</li>
          ))}
        </ul>
      )}
      {rows && rows.length > 1 && (
        <label>
          Dòng nguồn
          <select value={index} onChange={(e) => setIndex(Number(e.target.value))}>
            {rows.map((r, i) => (
              <option key={i} value={i}>
                Dòng {r.row}
              </option>
            ))}
          </select>
        </label>
      )}
      <dl className="import-facts">
        {Object.entries(values)
          .filter(([, v]) => v !== null && v !== '')
          .map(([k, v]) => (
            <div key={k}>
              <dt>{k}</dt>
              <dd style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{String(v)}</dd>
            </div>
          ))}
      </dl>
    </details>
  );
}
