import { useState, useMemo } from 'react'

function uniq(arr) { return [...new Set(arr)].filter(Boolean).sort() }

export default function ZipRankings({ data }) {
  const zips = data.zips

  const [search, setSearch] = useState('')
  const [airport, setAirport] = useState('')
  const [region, setRegion] = useState('')
  const [crossdock, setCrossdock] = useState('')
  const [maxDist, setMaxDist] = useState(300)
  const [minQuotes, setMinQuotes] = useState(1)
  const [sortKey, setSortKey] = useState('quote_count')
  const [sortDir, setSortDir] = useState(-1)

  const airports = useMemo(() => uniq(zips.map(z => z.airport_code)), [zips])
  const regions = useMemo(() => uniq(zips.map(z => z.region)), [zips])
  const crossdocks = useMemo(() => uniq(zips.map(z => z.nearest_crossdock)), [zips])

  const filtered = useMemo(() => zips.filter(z => {
    if (search && !z.zip_code.includes(search)) return false
    if (airport && z.airport_code !== airport) return false
    if (region && z.region !== region) return false
    if (crossdock && z.nearest_crossdock !== crossdock) return false
    if (z.distance_miles != null && z.distance_miles > maxDist) return false
    if (z.quote_count < minQuotes) return false
    return true
  }), [zips, search, airport, region, crossdock, maxDist, minQuotes])

  const sorted = useMemo(() => [...filtered].sort((a, b) => {
    const av = a[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
    const bv = b[sortKey] ?? (sortDir === 1 ? Infinity : -Infinity)
    return (av > bv ? 1 : av < bv ? -1 : 0) * sortDir
  }), [filtered, sortKey, sortDir])

  function handleSort(key) {
    if (sortKey === key) setSortDir(d => -d)
    else { setSortKey(key); setSortDir(-1) }
  }

  function Th({ k, label }) {
    return (
      <th onClick={() => handleSort(k)}
        className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap hover:text-gray-900">
        {label}{sortKey === k ? (sortDir === -1 ? ' ↓' : ' ↑') : ''}
      </th>
    )
  }

  function Select({ value, onChange, options, placeholder }) {
    return (
      <select value={value} onChange={e => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300">
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search ZIP…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-32" />
        <Select value={airport} onChange={setAirport} options={airports} placeholder="Airport" />
        <Select value={region} onChange={setRegion} options={regions} placeholder="Region" />
        <Select value={crossdock} onChange={setCrossdock} options={crossdocks} placeholder="Crossdock" />
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Max dist:</span>
          <input type="number" value={maxDist} onChange={e => setMaxDist(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 w-20 text-sm focus:outline-none" />
          <span>mi</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>Min quotes:</span>
          <input type="number" value={minQuotes} onChange={e => setMinQuotes(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 w-20 text-sm focus:outline-none" />
        </div>
        <span className="text-sm text-gray-400 ml-auto">{sorted.length.toLocaleString()} ZIPs</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <Th k="zip_code" label="ZIP Code" />
              <Th k="quote_count" label="Unserviced Quotes" />
              <Th k="distance_miles" label="Distance to Crossdock" />
              <Th k="nearest_crossdock" label="Nearest Crossdock" />
              <Th k="airport_code" label="Airport" />
              <Th k="region" label="Region" />
            </tr>
          </thead>
          <tbody>
            {sorted.map((z, i) => (
              <tr key={z.zip_code} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2.5 font-mono text-gray-800">{z.zip_code}</td>
                <td className="px-4 py-2.5 font-semibold text-gray-800">{(z.quote_count ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-gray-600">
                  {z.distance_miles != null ? `${z.distance_miles.toFixed(1)} mi` : '—'}
                </td>
                <td className="px-4 py-2.5 text-gray-600 whitespace-nowrap">{z.nearest_crossdock || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{z.airport_code || '—'}</td>
                <td className="px-4 py-2.5 text-gray-600">{z.region || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

