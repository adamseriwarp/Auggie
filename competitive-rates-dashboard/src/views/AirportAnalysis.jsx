import { useMemo, useState } from 'react'

function pctColor(val) {
  if (val <= -10) return 'text-green-700 font-semibold'
  if (val <= 0) return 'text-green-600'
  if (val <= 10) return 'text-red-500'
  return 'text-red-700 font-semibold'
}

export default function AirportAnalysis({ data }) {
  const [sortKey, setSortKey] = useState('avg_pct')
  const [sortDir, setSortDir] = useState(1)

  const rows = useMemo(() => {
    const map = {}
    data.forEach((r) => {
      const key = `${r.pickup_airport} → ${r.dropoff_airport}`
      if (!map[key]) map[key] = { pair: key, pickup: r.pickup_airport, dropoff: r.dropoff_airport, pcts: [], warp: [], comp: [], rec: [] }
      if (r.pct_difference !== null) map[key].pcts.push(r.pct_difference)
      if (r.min_warp_rate !== null) map[key].warp.push(r.min_warp_rate)
      if (r.min_competitor_rate !== null) map[key].comp.push(r.min_competitor_rate)
      if (r.recommended_price !== null) map[key].rec.push(r.recommended_price)
    })
    return Object.values(map).map((g) => ({
      pair: g.pair,
      route_count: g.pcts.length,
      avg_pct: g.pcts.length ? g.pcts.reduce((a, b) => a + b, 0) / g.pcts.length : null,
      avg_warp: g.warp.length ? g.warp.reduce((a, b) => a + b, 0) / g.warp.length : null,
      avg_rec: g.rec.length ? g.rec.reduce((a, b) => a + b, 0) / g.rec.length : null,
      avg_comp: g.comp.length ? g.comp.reduce((a, b) => a + b, 0) / g.comp.length : null,
    }))
  }, [data])

  const sorted = useMemo(() => {
    return [...rows].sort((a, b) => {
      const av = a[sortKey] ?? Infinity
      const bv = b[sortKey] ?? Infinity
      return (av - bv) * sortDir
    })
  }, [rows, sortKey, sortDir])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(1) }
  }

  function Th({ k, label }) {
    return (
      <th onClick={() => handleSort(k)}
        className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap hover:text-gray-900">
        {label}{sortKey === k ? (sortDir === 1 ? ' ↑' : ' ↓') : ''}
      </th>
    )
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
      <table className="w-full text-sm">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <Th k="pair" label="Airport Pair" />
            <Th k="route_count" label="Routes" />
            <Th k="avg_pct" label="Avg % Diff" />
            <Th k="avg_warp" label="Avg Warp Rate" />
            <Th k="avg_rec" label="Avg Rec Price" />
            <Th k="avg_comp" label="Avg Comp Rate*" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr key={row.pair} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
              <td className="px-4 py-2.5 font-mono text-gray-800 whitespace-nowrap">{row.pair}</td>
              <td className="px-4 py-2.5 text-gray-600">{row.route_count}</td>
              <td className={`px-4 py-2.5 whitespace-nowrap ${pctColor(row.avg_pct)}`}>
                {row.avg_pct !== null ? `${row.avg_pct > 0 ? '+' : ''}${row.avg_pct.toFixed(1)}%` : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {row.avg_warp !== null ? `$${row.avg_warp.toFixed(2)}` : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {row.avg_rec !== null ? `$${row.avg_rec.toFixed(2)}` : '—'}
              </td>
              <td className="px-4 py-2.5 text-gray-600">
                {row.avg_comp !== null ? `$${row.avg_comp.toFixed(2)}` : '—'}
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
