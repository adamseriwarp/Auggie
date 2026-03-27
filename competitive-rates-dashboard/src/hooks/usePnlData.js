import { useState, useEffect } from 'react'
import Papa from 'papaparse'

const PNL_CSV_PATH = '/ltl_order_pnl_export_2026-01-01_2026-03-25.csv'

function parseNumber(...values) {
  for (const value of values) {
    const parsed = parseFloat(value)
    if (!isNaN(parsed)) return parsed
  }
  return null
}

export function usePnlData() {
  const [laneData, setLaneData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetch(PNL_CSV_PATH)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.text()
      })
      .then((text) => {
        Papa.parse(text, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => {
            const rows = results.data

            // Group by startMarket → endMarket lane
            const laneMap = {}
            rows.forEach((row) => {
              const start = row['startMarket'] || ''
              const end = row['endMarket'] || ''
              if (!start || !end) return
              const key = `${start}→${end}`
              if (!laneMap[key]) {
                laneMap[key] = {
                  startMarket: start,
                  endMarket: end,
                  lane: `${start} → ${end}`,
                  orderCodes: new Set(),
                  totalRevenue: 0,
                  totalCost: 0,
                }
              }
              const entry = laneMap[key]
              const code = row['orderCode']
              if (code) entry.orderCodes.add(code)
              const rev = parseNumber(row['correctedRevenue'], row['revenue'])
              const cost = parseNumber(row['correctedCost'], row['cost'])
              if (rev !== null) entry.totalRevenue += rev
              if (cost !== null) entry.totalCost += cost
            })

            const lanes = Object.values(laneMap).map((l) => {
              const orderCount = l.orderCodes.size
              const totalRevenue = l.totalRevenue
              const totalCost = l.totalCost
              const margin =
                totalRevenue !== 0
                  ? ((totalRevenue - totalCost) / totalRevenue) * 100
                  : null
              return {
                startMarket: l.startMarket,
                endMarket: l.endMarket,
                lane: l.lane,
                orderCount,
                totalRevenue,
                totalCost,
                margin,
              }
            })

            setLaneData(lanes)
            setLoading(false)
          },
          error: (err) => {
            setError(`Parse error: ${err.message}`)
            setLoading(false)
          },
        })
      })
      .catch((err) => {
        setError(`Failed to load P&L data: ${err.message}`)
        setLoading(false)
      })
  }, [])

  return { laneData, loading, error }
}

