import { useEffect, useState } from 'react'

const BOOKING_STATS_PATH = '/route_booking_stats.json'

export function useBookingStats() {
  const [routeStats, setRouteStats] = useState({})
  const [totals, setTotals] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(BOOKING_STATS_PATH)
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json()
      })
      .then((payload) => {
        setRouteStats(payload?.routes || {})
        setTotals(payload?.totals || null)
        setLoading(false)
      })
      .catch(() => {
        setLoading(false)
      })
  }, [])

  return { routeStats, totals, loading }
}