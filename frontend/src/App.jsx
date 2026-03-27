import { useState, useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import Map from './components/Map'
import CoverageMap from './components/CoverageMap'
import NavHeader from './components/NavHeader'

function DemandMapPage() {
  const [topology, setTopology] = useState(null)
  const [originCounts, setOriginCounts] = useState(null)
  const [odMatrix, setOdMatrix] = useState(null)

  useEffect(() => {
    Promise.all([
      fetch('/scf.topojson').then(r => r.json()),
      fetch('/data/origin_counts.json').then(r => r.json()),
      fetch('/data/od_matrix.json').then(r => r.json())
    ]).then(([topo, counts, od]) => {
      setTopology(topo)
      setOriginCounts(counts)
      setOdMatrix(od)
    })
  }, [])

  if (!topology || !originCounts || !odMatrix) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', fontSize:18, color:'#555' }}>
        Loading map data...
      </div>
    )
  }

  return <Map topology={topology} originCounts={originCounts} odMatrix={odMatrix} />
}

export default function App() {
  return (
    <BrowserRouter>
      <NavHeader />
      <Routes>
        <Route path="/" element={<DemandMapPage />} />
        <Route path="/coverage" element={<CoverageMap />} />
      </Routes>
    </BrowserRouter>
  )
}

