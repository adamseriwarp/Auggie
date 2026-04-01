import { useState } from 'react'

function SortableTable({ title, rows, columns }) {
  const [sortKey, setSortKey] = useState(columns[1]?.key || '')
  const [sortDir, setSortDir] = useState(-1)

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(-1) }
  }

  const sorted = [...rows].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
    const bv = b[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
    return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir
  })

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
      <div className="px-6 py-4 border-b border-gray-100">
        <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            {columns.map(col => (
              <th key={col.key} onClick={() => handleSort(col.key)}
                className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap hover:text-gray-900">
                {col.label}{sortKey === col.key ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              {columns.map(col => (
                <td key={col.key} className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                  {col.render ? col.render(row[col.key], row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const fmt = n => (n ?? 0).toLocaleString()
const fmtDist = v => v != null ? `${Number(v).toFixed(1)} mi` : '—'
const fmtPct = v => v != null ? `${v}%` : '—'

export default function ExpansionSummaries({ data }) {
  const { by_crossdock, by_airport, by_region, customers } = data

  return (
    <div className="space-y-6">
      <SortableTable
        title="By Crossdock"
        rows={by_crossdock}
        columns={[
          { key: 'nearest_crossdock', label: 'Crossdock' },
          { key: 'zip_count', label: 'Unserviced ZIPs', render: fmt },
          { key: 'unserviced_quotes', label: 'Unserviced Quotes', render: fmt },
          { key: 'avg_distance_miles', label: 'Avg Distance', render: fmtDist },
        ]}
      />

      <SortableTable
        title="By Airport Code"
        rows={by_airport}
        columns={[
          { key: 'airport_code', label: 'Airport' },
          { key: 'zip_count', label: 'Unserviced ZIPs', render: fmt },
          { key: 'unserviced_quotes', label: 'Unserviced Quotes', render: fmt },
          { key: 'total_quotes', label: 'Total Quotes', render: fmt },
          { key: 'pct_not_serviced', label: '% Not Serviced',
            render: (v) => <span className={v > 20 ? 'text-red-600 font-semibold' : ''}>{fmtPct(v)}</span> },
          { key: 'avg_distance_miles', label: 'Avg Distance', render: fmtDist },
        ]}
      />

      <SortableTable
        title="By Region"
        rows={by_region}
        columns={[
          { key: 'region', label: 'Region' },
          { key: 'zip_count', label: 'Unserviced ZIPs', render: fmt },
          { key: 'unserviced_quotes', label: 'Unserviced Quotes', render: fmt },
          { key: 'total_quotes', label: 'Total Quotes', render: fmt },
          { key: 'pct_not_serviced', label: '% Not Serviced',
            render: (v) => <span className={v > 20 ? 'text-red-600 font-semibold' : ''}>{fmtPct(v)}</span> },
          { key: 'avg_distance_miles', label: 'Avg Distance', render: fmtDist },
        ]}
      />

      {customers && customers.length > 0 && (
        <SortableTable
          title="By Customer"
          rows={customers}
          columns={[
            { key: 'customer', label: 'Customer' },
            { key: 'unserviced_quotes', label: 'Unserviced Quotes', render: fmt },
            { key: 'total_quotes', label: 'Total Quotes', render: fmt },
            { key: 'pct_not_serviced', label: '% Not Serviced',
              render: (v) => <span className={v > 20 ? 'text-red-600 font-semibold' : ''}>{fmtPct(v)}</span> },
          ]}
        />
      )}
    </div>
  )
}

