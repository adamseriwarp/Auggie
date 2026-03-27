import { useState, useEffect, useMemo } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { Map as MapGL } from 'react-map-gl/maplibre'
import * as topojson from 'topojson-client'
import 'maplibre-gl/dist/maplibre-gl.css'

const INITIAL_VIEW = { longitude: -98.35, latitude: 39.5, zoom: 4, pitch: 0, bearing: 0 }
const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'

// Color constants
const COLOR_SERVICED = [34, 139, 34, 200]       // green
const COLOR_UNSERVICED = [220, 80, 40, 200]     // red-orange
const COLOR_NO_DATA = [180, 180, 180, 120]      // gray

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

  // Compute which zips are colored based on view mode and selected zip
  const { servicedSet, unservicedSet } = useMemo(() => {
    if (selectedZip) {
      // Click-through: show destinations reachable from selected origin
      const sSet = new Set(odServiced[selectedZip] || [])
      const uSet = new Set(odUnserviced[selectedZip] || [])
      return { servicedSet: sSet, unservicedSet: uSet }
    }
    if (viewMode === 'origin') {
      return {
        servicedSet: new Set(servicedOrigins),
        unservicedSet: new Set(unservicedOrigins)
      }
    } else {
      return {
        servicedSet: new Set(servicedDests),
        unservicedSet: new Set(unservicedDests)
      }
    }
  }, [viewMode, selectedZip, servicedOrigins, unservicedOrigins, servicedDests, unservicedDests, odServiced, odUnserviced])

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
        </div>
      )}
    </div>
  )
}

