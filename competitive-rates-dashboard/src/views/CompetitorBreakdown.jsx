import { useMemo, useState } from 'react'

export default function CompetitorBreakdown({ data }) {
  const [sortKey, setSortKey] = useState('win_count')
  const [sortDir, setSortDir] = useState(-1)

  const rows = useMemo(() => {
    const map = {}
    data.forEach((r) => {
      const c = r.competitor_carrier || 'Unknown'
      if (!map[c]) map[c] = { carrier: c, pcts: [], warp_rates: [], comp_rates: [] }
      if (r.pct_difference !== null) map[c].pcts.push(r.pct_difference)
      if (r.min_warp_rate !== null) map[c].warp_rates.push(r.min_warp_rate)
      if (r.min_competitor_rate !== null) map[c].comp_rates.push(r.min_competitor_rate)
    })
    return Object.values(map).map((g) => ({
      carrier: g.carrier,
      win_count: g.pcts.length,
      avg_pct: g.pcts.length ? g.pcts.reduce((a, b) => a + b, 0) / g.pcts.length : null,
      avg_warp: g.warp_rates.length ? g.warp_rates.reduce((a, b) => a + b, 0) / g.warp_rates.length : null,
      avg_comp: g.comp_rates.length ? g.comp_rates.reduce((a, b) => a + b, 0) / g.comp_rates.length : null,
    }))
  }, [data])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
      const bv = b[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
      return (av - bv) * sortDir
    })
  }, [rows, sortKey, sortDir])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(-1) }
  }

  function pctColor(val) {
    if (val === null) return 'text-gray-400'
    if (val <= 0) return 'text-green-600'
    if (val <= 15) return 'text-yellow-600'
    return 'text-red-600'
  }

  function Th({ k, label }) {
    return (
      <th onClick={() => handleSort(k)}
        className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap hover:text-gray-900">
        {label}{sortKey === k ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  const total = data.length

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <Th k="carrier" label="Carrier" />
            <Th k="win_count" label="Routes Won" />
            <th className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">
              Share of Routes
            </th>
            <Th k="avg_pct" label="Avg % Diff vs Warp" />
            <Th k="avg_comp" label="Avg Comp Rate*" />
            <Th k="avg_warp" label="Avg Warp Rate" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.carrier} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-4 py-2.5 font-medium text-gray-800 whitespace-nowrap">{row.carrier}</td>
              <td className="px-4 py-2.5 text-gray-700">{row.win_count.toLocaleString()}</td>
              <td className="px-4 py-2.5 text-gray-500">
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-400 rounded-full"
                      style={{ width: `${Math.min((row.win_count / total) * 100, 100)}%` }}
                    />
                  </div>
                  <span className="text-xs">{((row.win_count / total) * 100).toFixed(1)}%</span>
                </div>
              </td>
              <td className={`px-4 py-2.5 whitespace-nowrap ${pctColor(row.avg_pct)}`}>
                {row.avg_pct !== null ? `${row.avg_pct > 0 ? '+' : ''}${row.avg_pct.toFixed(1)}%` : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {row.avg_comp !== null ? `$${row.avg_comp.toFixed(2)}` : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {row.avg_warp !== null ? `$${row.avg_warp.toFixed(2)}` : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
        * After 15% markdown applied · Click column headers to sort
      </p>
    </div>
  )
}

