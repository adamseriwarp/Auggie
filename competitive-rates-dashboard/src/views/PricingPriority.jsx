import { useState, useMemo } from 'react'
import { usePnlData } from '../hooks/usePnlData'

const PRIORITY_ORDER = { 'Raise Price': 0, 'Lower Price': 1, 'Capture Margin': 2, 'Vulnerable': 3, 'Healthy': 4, 'No Comp Data': 5 }
const PRIORITY_STYLE = {
  'Raise Price':    { bg: 'bg-red-100',    text: 'text-red-700',    icon: '🔴' },
  'Lower Price':    { bg: 'bg-red-100',    text: 'text-red-700',    icon: '🔴' },
  'Capture Margin': { bg: 'bg-orange-100', text: 'text-orange-700', icon: '🟠' },
  'Vulnerable':     { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: '🟡' },
  'Healthy':        { bg: 'bg-green-100',  text: 'text-green-700',  icon: '🟢' },
  'No Comp Data':   { bg: 'bg-gray-100',   text: 'text-gray-500',   icon: '⚪' },
}

function percentile(sorted, p) {
  const idx = Math.floor(sorted.length * p)
  return sorted[Math.min(idx, sorted.length - 1)]
}

function computePriority(avgPctDiff, margin, volumeTier) {
  if (avgPctDiff === null) return 'No Comp Data'
  if (avgPctDiff < -15 && margin !== null && margin < 0) return 'Raise Price'
  if (avgPctDiff > 15 && margin !== null && margin < 0 && volumeTier === 'Low') return 'Lower Price'
  if (avgPctDiff < -15 && margin !== null && margin > 0 && volumeTier === 'High') return 'Capture Margin'
  if (avgPctDiff > 15 && margin !== null && margin > 0) return 'Vulnerable'
  if (Math.abs(avgPctDiff) <= 15 && margin !== null && margin > 0) return 'Healthy'
  return 'No Comp Data'
}

function SortHeader({ col, label, sortCol, sortDir, onSort }) {
  const active = sortCol === col
  return (
    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase cursor-pointer select-none hover:text-gray-700" onClick={() => onSort(col)}>
      {label} {active ? (sortDir === 'asc' ? '↑' : '↓') : <span className="text-gray-300">↕</span>}
    </th>
  )
}

export default function PricingPriority({ data: compData }) {
  const { laneData, loading, error } = usePnlData()
  const [sortCol, setSortCol] = useState('priority')
  const [sortDir, setSortDir] = useState('asc')

  const joined = useMemo(() => {
    if (!laneData || !compData) return []

    // Build comp map: "PICKUP→DROPOFF" → avg pct_difference
    const compMap = {}
    compData.forEach((r) => {
      const key = `${r.pickup_airport}→${r.dropoff_airport}`
      if (!compMap[key]) compMap[key] = { sum: 0, count: 0 }
      if (r.pct_difference !== null) {
        compMap[key].sum += r.pct_difference
        compMap[key].count += 1
      }
    })

    // Percentile thresholds for volume
    const counts = laneData.map((l) => l.orderCount).sort((a, b) => a - b)
    const p33 = percentile(counts, 0.33)
    const p67 = percentile(counts, 0.67)

    return laneData.map((lane) => {
      const key = `${lane.startMarket}→${lane.endMarket}`
      const comp = compMap[key]
      const avgPctDiff = comp && comp.count > 0 ? comp.sum / comp.count : null
      const volumeTier = lane.orderCount >= p67 ? 'High' : lane.orderCount <= p33 ? 'Low' : 'Medium'
      const priority = computePriority(avgPctDiff, lane.margin, volumeTier)
      return { ...lane, avgPctDiff, volumeTier, priority }
    })
  }, [laneData, compData])

  const sorted = useMemo(() => {
    if (!joined.length) return []
    return [...joined].sort((a, b) => {
      let va, vb
      if (sortCol === 'priority') {
        va = PRIORITY_ORDER[a.priority] ?? 99
        vb = PRIORITY_ORDER[b.priority] ?? 99
        if (va !== vb) return va - vb
        return Math.abs(b.margin ?? 0) - Math.abs(a.margin ?? 0)
      }
      if (sortCol === 'lane') { va = a.lane; vb = b.lane }
      else if (sortCol === 'orderCount') { va = a.orderCount; vb = b.orderCount }
      else if (sortCol === 'totalRevenue') { va = a.totalRevenue; vb = b.totalRevenue }
      else if (sortCol === 'margin') { va = a.margin ?? -Infinity; vb = b.margin ?? -Infinity }
      else if (sortCol === 'avgPctDiff') { va = a.avgPctDiff ?? -Infinity; vb = b.avgPctDiff ?? -Infinity }
      else if (sortCol === 'volumeTier') { va = a.volumeTier; vb = b.volumeTier }
      const dir = sortDir === 'asc' ? 1 : -1
      if (typeof va === 'string') return va.localeCompare(vb) * dir
      return (va - vb) * dir
    })
  }, [joined, sortCol, sortDir])

  function handleSort(col) {
    if (sortCol === col) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    else { setSortCol(col); setSortDir('asc') }
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading P&L data…</div>
  if (error) return <div className="flex items-center justify-center py-20 text-red-500 text-sm">{error}</div>

  const headerProps = { sortCol, sortDir, onSort: handleSort }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-gray-800">Pricing Priority</h2>
        <p className="text-sm text-gray-400 mt-1">{sorted.length.toLocaleString()} lanes · ranked by urgency</p>
      </div>
      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              <SortHeader col="lane" label="Lane" {...headerProps} />
              <SortHeader col="orderCount" label="Orders" {...headerProps} />
              <SortHeader col="totalRevenue" label="Revenue" {...headerProps} />
              <SortHeader col="margin" label="Margin %" {...headerProps} />
              <SortHeader col="avgPctDiff" label="Avg vs Competitor %" {...headerProps} />
              <SortHeader col="volumeTier" label="Volume Tier" {...headerProps} />
              <SortHeader col="priority" label="Priority" {...headerProps} />
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {sorted.map((row, i) => {
              const ps = PRIORITY_STYLE[row.priority] || PRIORITY_STYLE['No Comp Data']
              const marginColor = row.margin === null ? 'text-gray-400' : row.margin >= 0 ? 'text-green-600' : 'text-red-600'
              const compColor = row.avgPctDiff === null ? 'text-gray-400' : row.avgPctDiff <= 0 ? 'text-green-600' : 'text-red-600'
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800">{row.lane}</td>
                  <td className="px-4 py-3 text-gray-600">{row.orderCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">${row.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</td>
                  <td className={`px-4 py-3 font-medium ${marginColor}`}>{row.margin !== null ? `${row.margin.toFixed(1)}%` : '—'}</td>
                  <td className={`px-4 py-3 font-medium ${compColor}`}>{row.avgPctDiff !== null ? `${row.avgPctDiff > 0 ? '+' : ''}${row.avgPctDiff.toFixed(1)}%` : '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{row.volumeTier}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${ps.bg} ${ps.text}`}>
                      {ps.icon} {row.priority}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

