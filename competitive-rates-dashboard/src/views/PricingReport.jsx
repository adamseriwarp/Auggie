import { useMemo } from 'react'
import { usePnlData } from '../hooks/usePnlData'

const ACTION_STYLE = {
  'Raise Price':              { bg: 'bg-red-100',    text: 'text-red-700',    icon: '🔴' },
  'Raise Price (Opportunity)':{ bg: 'bg-orange-100', text: 'text-orange-700', icon: '🟠' },
  'Lower Price':              { bg: 'bg-red-100',    text: 'text-red-700',    icon: '🔴' },
}

function fmt$(n)   { return '$' + Math.round(n).toLocaleString() }
function fmtPct(n) { return (n > 0 ? '+' : '') + n.toFixed(1) + '%' }

function fmtRate(n) {
  if (n === null || n === undefined || isNaN(n)) return '—'
  return `${(n * 100).toFixed(1)}%`
}

function csvValue(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function computeAction(avgPctDiff, margin, orderCount) {
  if (avgPctDiff === null) return null
  if (avgPctDiff < -15 && margin !== null && margin < 0) return 'Raise Price'
  if (avgPctDiff < -15 && margin !== null && margin > 0 && orderCount >= 500) return 'Raise Price (Opportunity)'
  if (avgPctDiff > 15  && margin !== null && margin < 0 && orderCount < 100)  return 'Lower Price'
  return null
}

function computeImpact(lane, action) {
  const { orderCount, totalRevenue, totalCost, compRate } = lane
  const currentAvgRevPerOrder   = totalRevenue / orderCount
  const currentAvgCostPerOrder  = totalCost   / orderCount
  const currentProfit           = totalRevenue - totalCost
  const recPrice                = compRate * 0.95
  const priceDeltaPct           = (recPrice - currentAvgRevPerOrder) / currentAvgRevPerOrder * 100

  let volumeFactor
  if (action === 'Lower Price') {
    volumeFactor = 1.25
  } else {
    volumeFactor = 1 - (0.5 * priceDeltaPct / 100)
  }

  const estNewOrders   = orderCount * volumeFactor
  const estNewRevenue  = estNewOrders * recPrice
  const estNewCost     = estNewOrders * currentAvgCostPerOrder
  const profitDelta    = (estNewRevenue - estNewCost) - currentProfit
  const revenueDelta   = estNewRevenue - totalRevenue
  const estNewMargin   = estNewRevenue !== 0 ? ((estNewRevenue - estNewCost) / estNewRevenue) * 100 : null

  return { currentAvgRevPerOrder, compRate, recPrice, priceDeltaPct, estNewOrders, revenueDelta, profitDelta, estNewMargin }
}

function exportCsv(rows) {
  const headers = ['Route','Pickup ZIP3','Dropoff ZIP3','Action','Orders','Quoted','Booked','Book Rate','Current Avg Rate','Quoted Warp Rate','Comp Rate','Rec Price','Price Δ%','Est New Orders','Revenue Δ','Profit Δ','Current Margin %','Est New Margin %']
  const lines = [headers.join(',')]
  rows.forEach((r) => {
    const values = [
      r.zip3Route, r.pickupZip3, r.dropoffZip3, r.action, r.orderCount,
      r.quote_count ?? '',
      r.booked_count ?? '',
      r.book_rate !== null && r.book_rate !== undefined ? (r.book_rate * 100).toFixed(1) : '',
      r.currentAvgRevPerOrder.toFixed(2),
      r.avgQuotedWarpRate !== null && r.avgQuotedWarpRate !== undefined ? Math.round(r.avgQuotedWarpRate) : '',
      r.compRate.toFixed(2),
      r.recPrice.toFixed(2),
      r.priceDeltaPct.toFixed(1),
      Math.round(r.estNewOrders),
      Math.round(r.revenueDelta),
      Math.round(r.profitDelta),
      r.margin !== null ? r.margin.toFixed(1) : '',
      r.estNewMargin !== null ? r.estNewMargin.toFixed(1) : '',
    ]
    lines.push(values.map(csvValue).join(','))
  })
  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href = url; a.download = 'pricing_impact_report.csv'; a.click()
  URL.revokeObjectURL(url)
}

export default function PricingReport({ data: compData, bookingStats = {} }) {
  const { routeData, loading, error } = usePnlData()

  const rows = useMemo(() => {
    if (!routeData || !compData) return []

    // Build comp map by ZIP3 route to match Route Explorer
    const compMap = {}
    compData.forEach((r) => {
      const key = r.zip3_route
      if (!key) return
      if (!compMap[key]) compMap[key] = { sum: 0, count: 0, warpSum: 0, warpCount: 0, compSum: 0, compCount: 0 }
      if (r.pct_difference !== null) {
        compMap[key].sum   += r.pct_difference
        compMap[key].count += 1
      }
      if (r.min_warp_rate !== null && r.min_warp_rate !== undefined) {
        compMap[key].warpSum   += r.min_warp_rate
        compMap[key].warpCount += 1
      }
      if (r.min_competitor_rate !== null && r.min_competitor_rate !== undefined) {
        compMap[key].compSum   += r.min_competitor_rate
        compMap[key].compCount += 1
      }
    })

    const result = []
    routeData.forEach((route) => {
      const comp = compMap[route.zip3Route]
      const booking = bookingStats[route.zip3Route] || { quote_count: null, booked_count: null, book_rate: null }
      const avgPctDiff = comp && comp.count > 0 ? comp.sum / comp.count : null
      const avgQuotedWarpRate = comp && comp.warpCount > 0 ? comp.warpSum / comp.warpCount : null
      const avgCompRate = comp && comp.compCount > 0 ? comp.compSum / comp.compCount : null
      const action = computeAction(avgPctDiff, route.margin, route.orderCount)
      if (!action || avgCompRate === null) return

      const impact = computeImpact({ ...route, compRate: avgCompRate }, action)
      result.push({ ...route, ...booking, avgPctDiff, avgQuotedWarpRate, action, ...impact })
    })

    // Sort by profitDelta descending
    result.sort((a, b) => b.profitDelta - a.profitDelta)
    return result
  }, [routeData, compData, bookingStats])

  if (loading) return <div className="flex items-center justify-center py-20 text-gray-400 text-sm">Loading P&L data…</div>
  if (error)   return <div className="flex items-center justify-center py-20 text-red-500 text-sm">{error}</div>

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Pricing Impact Report</h2>
          <p className="text-sm text-gray-400 mt-1">{rows.length.toLocaleString()} actionable ZIP3 routes · ranked by Profit Δ</p>
        </div>
        <button
          onClick={() => exportCsv(rows)}
          className="px-3 py-1.5 text-sm font-medium border border-gray-200 rounded-lg text-gray-600 hover:bg-gray-50 transition-colors"
        >
          Export CSV
        </button>
      </div>

      {/* Disclaimer */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-xs text-amber-800">
        Volume estimates assume 0.5 price elasticity for price increases and 25% volume uplift for price decreases. Use as directional guidance only.
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-gray-200 bg-gray-50">
            <tr>
              {['Route','Action','Orders','Quoted','Booked','Book Rate','Current Avg Rate','Quoted Warp Rate','Comp Rate','Rec Price','Price Δ%','Est. New Orders','Revenue Δ','Profit Δ','Current Margin %','Est. New Margin %'].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row, i) => {
              const as = ACTION_STYLE[row.action]
              const revColor = row.revenueDelta >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
              const prfColor = row.profitDelta  >= 0 ? 'text-green-600 font-medium' : 'text-red-600 font-medium'
              return (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-800 whitespace-nowrap">{row.zip3Route}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${as.bg} ${as.text}`}>
                      {as.icon} {row.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{row.orderCount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-600">{row.quote_count !== null && row.quote_count !== undefined ? row.quote_count.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{row.booked_count !== null && row.booked_count !== undefined ? row.booked_count.toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtRate(row.book_rate)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt$(row.currentAvgRevPerOrder)}</td>
                  <td className="px-4 py-3 text-gray-600">{row.avgQuotedWarpRate != null ? '$' + Math.round(row.avgQuotedWarpRate).toLocaleString() : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt$(row.compRate)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmt$(row.recPrice)}</td>
                  <td className="px-4 py-3 text-gray-600">{fmtPct(row.priceDeltaPct)}</td>
                  <td className="px-4 py-3 text-gray-600">{Math.round(row.estNewOrders).toLocaleString()}</td>
                  <td className={`px-4 py-3 ${revColor}`}>{fmt$(row.revenueDelta)}</td>
                  <td className={`px-4 py-3 ${prfColor}`}>{fmt$(row.profitDelta)}</td>
                  <td className="px-4 py-3 text-gray-600">{row.margin !== null ? fmtPct(row.margin) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{row.estNewMargin !== null ? fmtPct(row.estNewMargin) : '—'}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <p className="text-center py-12 text-gray-400 text-sm">No actionable ZIP3 routes found in current data.</p>
        )}
      </div>
    </div>
  )
}

