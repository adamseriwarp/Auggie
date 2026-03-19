import { useState, useMemo } from 'react'
import Papa from 'papaparse'

function parseRow(row) {
  return {
    zip3_route: row['zip3_route'] || '',
    pickup_zip5: row['pickup_zip5'] || '',
    dropoff_zip5: row['dropoff_zip5'] || '',
    pickup_airport: row['pickup_airport_code'] || '',
    dropoff_airport: row['dropoff_airport_code'] || '',
    min_competitor_rate: parseFloat(row['min_competitor_rate']) || null,
    competitor_carrier: row['competitor_carrier_name'] || '',
    min_warp_rate: parseFloat(row['min_warp_rate']) || null,
    pct_difference: parseFloat(row['pct_difference']) || null,
  }
}

export function useQuoteData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function loadFile(file) {
    if (!file || !file.name.endsWith('.csv')) {
      setError('Please upload a .csv file.')
      return
    }
    setLoading(true)
    setError(null)
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const rows = results.data.map(parseRow).filter(
          (r) => r.zip3_route && r.pct_difference !== null
        )
        if (rows.length === 0) {
          setError('CSV parsed but no valid rows found. Check column names.')
          setLoading(false)
          return
        }
        setData(rows)
        setLoading(false)
      },
      error: (err) => {
        setError(`Parse error: ${err.message}`)
        setLoading(false)
      },
    })
  }

  function reset() {
    setData(null)
    setError(null)
  }

  const stats = useMemo(() => {
    if (!data) return null
    const valid = data.filter((r) => r.pct_difference !== null)
    const cheaper = valid.filter((r) => r.pct_difference <= 0)
    const expensive = valid.filter((r) => r.pct_difference > 0)
    const avgPct = valid.reduce((s, r) => s + r.pct_difference, 0) / valid.length

    const carrierCounts = {}
    valid.forEach((r) => {
      if (r.competitor_carrier) {
        carrierCounts[r.competitor_carrier] = (carrierCounts[r.competitor_carrier] || 0) + 1
      }
    })
    const topCarrier = Object.entries(carrierCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || '—'

    return {
      total: valid.length,
      cheaperCount: cheaper.length,
      cheaperPct: ((cheaper.length / valid.length) * 100).toFixed(1),
      expensiveCount: expensive.length,
      expensivePct: ((expensive.length / valid.length) * 100).toFixed(1),
      avgPct: avgPct.toFixed(1),
      topCarrier,
    }
  }, [data])

  return { data, stats, error, loading, loadFile, reset }
}

