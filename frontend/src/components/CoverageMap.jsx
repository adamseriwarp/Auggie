import { useState, useEffect, useMemo, useRef } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { Map as MapGL } from 'react-map-gl/maplibre'
import * as topojson from 'topojson-client'
import 'maplibre-gl/dist/maplibre-gl.css'
import crossdocks from '../data/crossdocks.json'

const INITIAL_VIEW = { longitude: -98.35, latitude: 39.5, zoom: 4, pitch: 0, bearing: 0 }
const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'
const PROXIMITY_MAX = 500
const DEBOUNCE_MS = 150

// Color constants
const COLOR_SERVICED = [34, 139, 34, 200]       // green
const COLOR_UNSERVICED = [220, 80, 40, 200]     // red-orange
const COLOR_NO_DATA = [180, 180, 180, 120]      // gray

/** Haversine distance in miles between two lat/lng points */
function haversine(lat1, lng1, lat2, lng2) {
  const R = 3958.8
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/**
 * Normalize zip data from either array format (mock) or { zip: count } object (pipeline).
 * Returns { zips: string[], counts: { zip: number } }
 */
function normalizeZipData(data) {
  if (Array.isArray(data)) {
    const counts = {}
    data.forEach(z => { counts[z] = 1 })
    return { zips: data, counts }
  }
  return { zips: Object.keys(data), counts: data }
}

function getZipColor(zip, servicedSet, unservicedSet) {
  if (servicedSet.has(zip)) return COLOR_SERVICED
  if (unservicedSet.has(zip)) return COLOR_UNSERVICED
  return COLOR_NO_DATA
}

export default function CoverageMap() {
  const [topology, setTopology] = useState(null)
  const [servicedOrigins, setServicedOrigins] = useState([])
  const [unservicedOrigins, setUnservicedOrigins] = useState([])
  const [servicedDests, setServicedDests] = useState([])
  const [unservicedDests, setUnservicedDests] = useState([])
  const [odServiced, setOdServiced] = useState({})
  const [odUnserviced, setOdUnserviced] = useState({})
  const [viewMode, setViewMode] = useState('origin') // 'origin' | 'destination'
  const [selectedZip, setSelectedZip] = useState(null)
  const [hoverInfo, setHoverInfo] = useState(null)
  const [loading, setLoading] = useState(true)

  // Filter state (applies to unserviced ZIPs only)
  const [proximityMiles, setProximityMiles] = useState(PROXIMITY_MAX)
  const [proximityMilesDisplay, setProximityMilesDisplay] = useState(PROXIMITY_MAX)
  const [proximityMode, setProximityMode] = useState('crossdock') // 'crossdock' | 'serviced'
  const [demandMin, setDemandMin] = useState(0)
  const [demandMinDisplay, setDemandMinDisplay] = useState(0)
  const proximityTimer = useRef(null)
  const demandTimer = useRef(null)

  useEffect(() => {
    Promise.all([
      fetch('/zcta.topojson').then(r => r.json()),
      fetch('/data/serviced_origin_zips.json').then(r => r.json()),
      fetch('/data/unserviced_origin_zips.json').then(r => r.json()),
      fetch('/data/serviced_dest_zips.json').then(r => r.json()),
      fetch('/data/unserviced_dest_zips.json').then(r => r.json()),
      fetch('/data/od_serviced.json').then(r => r.json()),
      fetch('/data/od_unserviced.json').then(r => r.json()),
    ]).then(([topo, sOrigins, uOrigins, sDests, uDests, odS, odU]) => {
      setTopology(topo)
      setServicedOrigins(sOrigins)
      setUnservicedOrigins(uOrigins)
      setServicedDests(sDests)
      setUnservicedDests(uDests)
      setOdServiced(odS)
      setOdUnserviced(odU)
      setLoading(false)
    })
  }, [])

  const geojson = useMemo(() => {
    if (!topology) return null
    const key = Object.keys(topology.objects)[0]
    return topojson.feature(topology, topology.objects[key])
  }, [topology])

  // Pre-compute zip centroids from ZCTA topojson properties (run once on load)
  const zipCentroids = useMemo(() => {
    if (!geojson) return {}
    const centroids = {}
    geojson.features.forEach(f => {
      const zip = f.properties.ZCTA5CE20
      const lat = parseFloat(f.properties.INTPTLAT20)
      const lng = parseFloat(f.properties.INTPTLON20)
      if (!isNaN(lat) && !isNaN(lng)) centroids[zip] = { lat, lng }
    })
    return centroids
  }, [geojson])

  // Normalize serviced/unserviced data (handles both array and { zip: count } formats)
  const { servicedOriginSet } = useMemo(() => {
    const { zips } = normalizeZipData(servicedOrigins)
    return { servicedOriginSet: new Set(zips) }
  }, [servicedOrigins])

  const { servicedDestSet } = useMemo(() => {
    const { zips } = normalizeZipData(servicedDests)
    return { servicedDestSet: new Set(zips) }
  }, [servicedDests])

  const { unservicedOriginSet, unservicedOriginCounts } = useMemo(() => {
    const { zips, counts } = normalizeZipData(unservicedOrigins)
    return { unservicedOriginSet: new Set(zips), unservicedOriginCounts: counts }
  }, [unservicedOrigins])

  const { unservicedDestSet, unservicedDestCounts } = useMemo(() => {
    const { zips, counts } = normalizeZipData(unservicedDests)
    return { unservicedDestSet: new Set(zips), unservicedDestCounts: counts }
  }, [unservicedDests])

  // Pre-compute min distance from each zip centroid to any crossdock (runs once after centroids load)
  const crossdockDistances = useMemo(() => {
    const distances = {}
    Object.entries(zipCentroids).forEach(([zip, { lat, lng }]) => {
      let minDist = Infinity
      crossdocks.forEach(cd => {
        const d = haversine(lat, lng, cd.lat, cd.lng)
        if (d < minDist) minDist = d
      })
      distances[zip] = minDist
    })
    return distances
  }, [zipCentroids])

  // Pre-compute min distance from each unserviced zip to the nearest serviced zip centroid.
  // Only computed when proximityMode === 'serviced' (lazy — skip otherwise).
  const servicedDistances = useMemo(() => {
    if (proximityMode !== 'serviced') return {}
    if (Object.keys(zipCentroids).length === 0) return {}
    const currentServicedSet = viewMode === 'origin' ? servicedOriginSet : servicedDestSet
    const currentUnservicedSet = viewMode === 'origin' ? unservicedOriginSet : unservicedDestSet
    const distances = {}
    currentUnservicedSet.forEach(zip => {
      const c = zipCentroids[zip]
      if (!c) { distances[zip] = Infinity; return }
      let minDist = Infinity
      currentServicedSet.forEach(sZip => {
        const sc = zipCentroids[sZip]
        if (!sc) return
        const d = haversine(c.lat, c.lng, sc.lat, sc.lng)
        if (d < minDist) minDist = d
      })
      distances[zip] = minDist
    })
    return distances
  }, [proximityMode, viewMode, zipCentroids, servicedOriginSet, servicedDestSet, unservicedOriginSet, unservicedDestSet])

  // Max demand value for slider range
  const maxDemand = useMemo(() => {
    const counts = viewMode === 'origin' ? unservicedOriginCounts : unservicedDestCounts
    const vals = Object.values(counts)
    return vals.length > 0 ? Math.max(...vals) : 1
  }, [viewMode, unservicedOriginCounts, unservicedDestCounts])

  // Reset filter state when switching view modes
  useEffect(() => {
    setProximityMiles(PROXIMITY_MAX)
    setProximityMilesDisplay(PROXIMITY_MAX)
    setDemandMin(0)
    setDemandMinDisplay(0)
  }, [viewMode])

  // Debounced slider handlers
  const handleProximityChange = val => {
    setProximityMilesDisplay(val)
    clearTimeout(proximityTimer.current)
    proximityTimer.current = setTimeout(() => setProximityMiles(val), DEBOUNCE_MS)
  }

  const handleDemandChange = val => {
    setDemandMinDisplay(val)
    clearTimeout(demandTimer.current)
    demandTimer.current = setTimeout(() => setDemandMin(val), DEBOUNCE_MS)
  }

  // Compute which zips are colored based on view mode, selected zip, and active filters
  const { servicedSet, unservicedSet } = useMemo(() => {
    if (selectedZip) {
      // Click-through: show OD pairs for the selected zip (no filter applied)
      const sSet = new Set(odServiced[selectedZip] || [])
      const uSet = new Set(odUnserviced[selectedZip] || [])
      return { servicedSet: sSet, unservicedSet: uSet }
    }

    const currentServicedSet = viewMode === 'origin' ? servicedOriginSet : servicedDestSet
    const currentUnservicedSet = viewMode === 'origin' ? unservicedOriginSet : unservicedDestSet
    const currentCounts = viewMode === 'origin' ? unservicedOriginCounts : unservicedDestCounts
    const filtersActive = proximityMiles < PROXIMITY_MAX || demandMin > 0

    if (!filtersActive) {
      return { servicedSet: currentServicedSet, unservicedSet: currentUnservicedSet }
    }

    // Apply filters to unserviced zips only
    const filtered = new Set()
    currentUnservicedSet.forEach(zip => {
      // Demand filter
      if (demandMin > 0 && (currentCounts[zip] || 0) < demandMin) return
      // Proximity filter
      if (proximityMiles < PROXIMITY_MAX) {
        const dist = proximityMode === 'crossdock'
          ? (crossdockDistances[zip] ?? Infinity)
          : (servicedDistances[zip] ?? Infinity)
        if (dist > proximityMiles) return
      }
      filtered.add(zip)
    })

    return { servicedSet: currentServicedSet, unservicedSet: filtered }
  }, [viewMode, selectedZip, servicedOriginSet, servicedDestSet, unservicedOriginSet, unservicedDestSet,
    unservicedOriginCounts, unservicedDestCounts, odServiced, odUnserviced,
    proximityMiles, proximityMode, demandMin, crossdockDistances, servicedDistances])

  const layers = useMemo(() => {
    if (!geojson) return []
    return [
      new GeoJsonLayer({
        id: 'coverage-zcta',
        data: geojson,
        filled: true,
        stroked: true,
        lineWidthMinPixels: 0.3,
        getLineColor: f => {
          if (selectedZip && f.properties.ZCTA5CE20 === selectedZip) return [30, 100, 255, 255]
          return [100, 100, 100, 60]
        },
        getLineWidth: f => {
          if (selectedZip && f.properties.ZCTA5CE20 === selectedZip) return 3
          return 0.3
        },
        getFillColor: f => {
          const zip = f.properties.ZCTA5CE20
          if (selectedZip && zip === selectedZip) return [30, 100, 255, 220]
          return getZipColor(zip, servicedSet, unservicedSet)
        },
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 60],
        updateTriggers: {
          getFillColor: [servicedSet, unservicedSet, selectedZip],
          getLineColor: selectedZip,
          getLineWidth: selectedZip
        },
        onHover: info => {
          if (info.object) {
            const zip = info.object.properties.ZCTA5CE20
            const status = servicedSet.has(zip) ? 'Serviced' : unservicedSet.has(zip) ? 'Unserviced' : 'No data'
            setHoverInfo({ x: info.x, y: info.y, zip, status })
          } else {
            setHoverInfo(null)
          }
        },
        onClick: info => {
          if (info.object) {
            const zip = info.object.properties.ZCTA5CE20
            setSelectedZip(prev => prev === zip ? null : zip)
          }
        }
      })
    ]
  }, [geojson, servicedSet, unservicedSet, selectedZip])

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', fontSize: 18, color: '#555' }}>
        Loading coverage data...
      </div>
    )
  }

  const modeLabel = selectedZip
    ? `Coverage destinations from ZIP: ${selectedZip}`
    : viewMode === 'origin'
      ? 'Origin coverage — click a ZIP to see its destinations'
      : 'Destination coverage — click a ZIP to see its origins'

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <DeckGL initialViewState={INITIAL_VIEW} controller={true} layers={layers}>
        <MapGL mapStyle={BASEMAP} />
      </DeckGL>

      {/* Mode toggle bar */}
      <div style={{
        position: 'absolute', top: 52, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.97)', borderRadius: 8, padding: '8px 16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 14, fontWeight: 500, color: '#333', zIndex: 10
      }}>
        <button
          onClick={() => { setViewMode('origin'); setSelectedZip(null) }}
          style={{
            border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: viewMode === 'origin' && !selectedZip ? '#1e64ff' : '#eee',
            color: viewMode === 'origin' && !selectedZip ? '#fff' : '#333'
          }}
        >
          Origins
        </button>
        <button
          onClick={() => { setViewMode('destination'); setSelectedZip(null) }}
          style={{
            border: 'none', borderRadius: 6, padding: '4px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
            background: viewMode === 'destination' && !selectedZip ? '#1e64ff' : '#eee',
            color: viewMode === 'destination' && !selectedZip ? '#fff' : '#333'
          }}
        >
          Destinations
        </button>
        <span style={{ color: '#666', fontSize: 13 }}>{modeLabel}</span>
        {selectedZip && (
          <button
            onClick={() => setSelectedZip(null)}
            style={{
              border: 'none', background: '#e44', color: '#fff', borderRadius: 6,
              padding: '4px 10px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}
          >
            ← Reset
          </button>
        )}
      </div>

      {/* Filter Panel — applies to unserviced ZIPs only */}
      {!selectedZip && (
        <div style={{
          position: 'absolute', left: 16, top: 100,
          background: 'rgba(255,255,255,0.97)', borderRadius: 8,
          padding: '14px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
          fontSize: 12, color: '#333', width: 230, zIndex: 10
        }}>
          <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 13, color: '#222' }}>
            Filters <span style={{ fontWeight: 400, color: '#888' }}>(unserviced only)</span>
          </div>

          {/* Proximity slider */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Proximity:{' '}
              <span style={{ color: '#1e64ff' }}>
                {proximityMilesDisplay >= PROXIMITY_MAX ? 'All' : `≤ ${proximityMilesDisplay} mi`}
              </span>
            </div>
            <input
              type="range" min={0} max={PROXIMITY_MAX} step={10}
              value={proximityMilesDisplay}
              onChange={e => handleProximityChange(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#1e64ff' }}
            />
            <div style={{ fontSize: 11, color: '#888', marginBottom: 6 }}>0 mi — 500 mi (All)</div>
            {/* Proximity mode toggle */}
            <div style={{ display: 'flex', gap: 4 }}>
              {['crossdock', 'serviced'].map(mode => (
                <button key={mode} onClick={() => setProximityMode(mode)} style={{
                  flex: 1, border: 'none', borderRadius: 4, padding: '4px 0', fontSize: 11,
                  fontWeight: 600, cursor: 'pointer',
                  background: proximityMode === mode ? '#1e64ff' : '#eee',
                  color: proximityMode === mode ? '#fff' : '#555'
                }}>
                  {mode === 'crossdock' ? 'Nearest Crossdock' : 'Nearest Serviced'}
                </button>
              ))}
            </div>
          </div>

          {/* Demand slider */}
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Min demand:{' '}
              <span style={{ color: '#1e64ff' }}>
                {demandMinDisplay === 0 ? 'All' : `≥ ${demandMinDisplay}`}
              </span>
            </div>
            <input
              type="range" min={0} max={maxDemand || 1} step={1}
              value={demandMinDisplay}
              onChange={e => handleDemandChange(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#1e64ff' }}
            />
            <div style={{ fontSize: 11, color: '#888' }}>0 (All) — {maxDemand} missed quotes</div>
          </div>

          {/* Reset filters button — only shown when filters are active */}
          {(proximityMiles < PROXIMITY_MAX || demandMin > 0) && (
            <button
              onClick={() => {
                setProximityMiles(PROXIMITY_MAX); setProximityMilesDisplay(PROXIMITY_MAX)
                setDemandMin(0); setDemandMinDisplay(0)
              }}
              style={{
                marginTop: 12, width: '100%', border: 'none', borderRadius: 5,
                padding: '5px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: '#f3f3f3', color: '#555'
              }}
            >
              Reset filters
            </button>
          )}
        </div>
      )}

      {/* Legend */}
      <div style={{
        position: 'absolute', bottom: 32, right: 16,
        background: 'rgba(255,255,255,0.95)', borderRadius: 8,
        padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
        fontSize: 12, color: '#333', minWidth: 140, zIndex: 10
      }}>
        <div style={{ fontWeight: 600, marginBottom: 8 }}>Coverage</div>
        {[
          { color: `rgb(${COLOR_SERVICED[0]},${COLOR_SERVICED[1]},${COLOR_SERVICED[2]})`, label: 'Serviced' },
          { color: `rgb(${COLOR_UNSERVICED[0]},${COLOR_UNSERVICED[1]},${COLOR_UNSERVICED[2]})`, label: 'Unserviced' },
          { color: `rgb(${COLOR_NO_DATA[0]},${COLOR_NO_DATA[1]},${COLOR_NO_DATA[2]})`, label: 'No data' },
        ].map(({ color, label }) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 20, height: 14, borderRadius: 3, background: color, border: '1px solid rgba(0,0,0,0.1)' }} />
            <span>{label}</span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoverInfo && (
        <div style={{
          position: 'absolute', left: hoverInfo.x + 12, top: hoverInfo.y - 10,
          background: 'rgba(30,30,30,0.9)', color: '#fff',
          padding: '6px 10px', borderRadius: 6, fontSize: 13,
          pointerEvents: 'none', zIndex: 20
        }}>
          <div><strong>ZIP: {hoverInfo.zip}</strong></div>
          <div>{hoverInfo.status}</div>
          {hoverInfo.status === 'Unserviced' && (() => {
            const counts = viewMode === 'origin' ? unservicedOriginCounts : unservicedDestCounts
            const count = counts[hoverInfo.zip]
            return count != null ? <div style={{ color: '#ffd' }}>{count} missed quote{count !== 1 ? 's' : ''}</div> : null
          })()}
        </div>
      )}
    </div>
  )
}

