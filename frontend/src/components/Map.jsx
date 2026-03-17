import { useState, useMemo } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { Map as MapGL } from 'react-map-gl/maplibre'
import * as topojson from 'topojson-client'
import { scaleQuantile } from 'd3-scale'
import Tooltip from './Tooltip'
import Legend from './Legend'
import 'maplibre-gl/dist/maplibre-gl.css'

const INITIAL_VIEW = { longitude: -98.35, latitude: 39.5, zoom: 4, pitch: 0, bearing: 0 }
const BASEMAP = 'https://basemaps.cartocdn.com/gl/positron-nolabels-gl-style/style.json'
const COLOR_RANGE = [
  [255,245,235],[254,230,206],[253,208,162],[253,174,107],
  [241,105,19],[217,72,1],[127,39,4]
]

export default function Map({ topology, originCounts, odMatrix, hideNoData = false }) {
  const [hoverInfo, setHoverInfo] = useState(null)
  const [selectedOrigin, setSelectedOrigin] = useState(null)

  // The counts driving the current map view
  const displayCounts = useMemo(() => {
    if (selectedOrigin && odMatrix[selectedOrigin]) {
      return odMatrix[selectedOrigin]
    }
    return originCounts
  }, [selectedOrigin, originCounts, odMatrix])

  const geojson = useMemo(() => {
    const key = Object.keys(topology.objects)[0]
    const full = topojson.feature(topology, topology.objects[key])
    if (!hideNoData) return full
    const dataZips = new Set(Object.keys(originCounts))
    return {
      ...full,
      features: full.features.filter(f => dataZips.has(f.properties.ZIP3))
    }
  }, [topology, originCounts, hideNoData])

  const colorScale = useMemo(() => {
    const values = Object.values(displayCounts).filter(v => v > 0)
    if (values.length === 0) return () => COLOR_RANGE[0]
    return scaleQuantile().domain(values).range(COLOR_RANGE)
  }, [displayCounts])

  const layers = useMemo(() => [
    new GeoJsonLayer({
      id: 'zcta',
      data: geojson,
      filled: true,
      stroked: true,
      lineWidthMinPixels: 0.5,
      getLineColor: f => {
        if (selectedOrigin && f.properties.ZIP3 === selectedOrigin) {
          return [30, 100, 255, 255]
        }
        return [80, 80, 80, 80]
      },
      getLineWidth: f => {
        if (selectedOrigin && f.properties.ZIP3 === selectedOrigin) return 3
        return 0.5
      },
      getFillColor: f => {
        const zip = f.properties.ZIP3
        if (selectedOrigin && zip === selectedOrigin) return [30, 100, 255, 220]
        const count = displayCounts[zip]
        if (count == null) return [200, 200, 200, 160]
        const [r, g, b] = colorScale(count)
        return [r, g, b, 200]
      },
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 255, 255, 80],
      updateTriggers: {
        getFillColor: [displayCounts, selectedOrigin],
        getLineColor: selectedOrigin,
        getLineWidth: selectedOrigin
      },
      onHover: info => {
        if (info.object) {
          const zip = info.object.properties.ZIP3
          setHoverInfo({ x: info.x, y: info.y, zip, count: displayCounts[zip] ?? null })
        } else {
          setHoverInfo(null)
        }
      },
      onClick: info => {
        if (info.object) {
          const zip = info.object.properties.ZIP3
          setSelectedOrigin(prev => prev === zip ? null : zip)
        }
      }
    })
  ], [geojson, displayCounts, colorScale, selectedOrigin])

  const handleReset = () => setSelectedOrigin(null)

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative' }}>
      <DeckGL initialViewState={INITIAL_VIEW} controller={true} layers={layers}>
        <MapGL mapStyle={BASEMAP} />
      </DeckGL>

      {/* Mode label + reset button */}
      <div style={{
        position: 'absolute', top: 16, left: '50%', transform: 'translateX(-50%)',
        background: 'rgba(255,255,255,0.95)', borderRadius: 8, padding: '8px 16px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.15)', display: 'flex', alignItems: 'center', gap: 12,
        fontSize: 14, fontWeight: 500, color: '#333', pointerEvents: 'none'
      }}>
        {selectedOrigin
          ? `Destinations from ZIP: ${selectedOrigin}`
          : 'Origin quote density — click a ZIP to explore destinations'
        }
        {selectedOrigin && (
          <button
            onClick={handleReset}
            style={{
              pointerEvents: 'all', cursor: 'pointer', border: 'none',
              background: '#1e64ff', color: '#fff', borderRadius: 6,
              padding: '4px 10px', fontSize: 13, fontWeight: 600
            }}
          >
            ← Reset
          </button>
        )}
      </div>

      <Legend colorRange={COLOR_RANGE} counts={displayCounts} selectedOrigin={selectedOrigin} />
      <Tooltip hoverInfo={hoverInfo} />
    </div>
  )
}

