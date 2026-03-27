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

function parseZip3(value) {
  const digits = String(value ?? '').trim().replace(/\D/g, '')
  if (!digits) return ''
  return digits.padStart(5, '0').slice(0, 3)
}

function summarizePnlGroups(groupMap) {
  return Object.values(groupMap).map((group) => {
    const orderCount = group.orderCodes.size
    const totalRevenue = group.totalRevenue
    const totalCost = group.totalCost
    const margin =
      totalRevenue !== 0
        ? ((totalRevenue - totalCost) / totalRevenue) * 100
        : null

    return {
      ...group,
      orderCount,
      totalRevenue,
      totalCost,
      margin,
    }
  })
}

export function usePnlData() {
  const [laneData, setLaneData] = useState(null)
  const [routeData, setRouteData] = useState(null)
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

            const laneMap = {}
            const routeMap = {}

            rows.forEach((row) => {
              const code = row['orderCode']
              const rev = parseNumber(row['correctedRevenue'], row['revenue'])
              const cost = parseNumber(row['correctedCost'], row['cost'])

              // Group by startMarket → endMarket lane
              const start = row['startMarket'] || ''
              const end = row['endMarket'] || ''
              if (start && end) {
                const laneKey = `${start}→${end}`
                if (!laneMap[laneKey]) {
                  laneMap[laneKey] = {
                    startMarket: start,
                    endMarket: end,
                    lane: `${start} → ${end}`,
                    orderCodes: new Set(),
                    totalRevenue: 0,
                    totalCost: 0,
                  }
                }
                const laneEntry = laneMap[laneKey]
                if (code) laneEntry.orderCodes.add(code)
                if (rev !== null) laneEntry.totalRevenue += rev
                if (cost !== null) laneEntry.totalCost += cost
              }

              // Group by ZIP3 route to align with Route Explorer
              const pickupZip3 = parseZip3(row['pickZipCode'])
              const dropoffZip3 = parseZip3(row['dropZipCode'])
              if (pickupZip3 && dropoffZip3) {
                const zip3Route = `${pickupZip3}-${dropoffZip3}`
                if (!routeMap[zip3Route]) {
                  routeMap[zip3Route] = {
                    zip3Route,
                    pickupZip3,
                    dropoffZip3,
                    orderCodes: new Set(),
                    totalRevenue: 0,
                    totalCost: 0,
                  }
                }
                const routeEntry = routeMap[zip3Route]
                if (code) routeEntry.orderCodes.add(code)
                if (rev !== null) routeEntry.totalRevenue += rev
                if (cost !== null) routeEntry.totalCost += cost
              }
            })

            const lanes = summarizePnlGroups(laneMap)
            const routes = summarizePnlGroups(routeMap)

            setLaneData(lanes)
            setRouteData(routes)
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

  return { laneData, routeData, loading, error }
}

