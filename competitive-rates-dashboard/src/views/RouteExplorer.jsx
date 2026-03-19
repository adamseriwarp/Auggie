import { useState, useMemo } from 'react'
import {
  useReactTable, getCoreRowModel, getSortedRowModel,
  getFilteredRowModel, flexRender, createColumnHelper,
} from '@tanstack/react-table'

const helper = createColumnHelper()

function pctColor(val) {
  if (val === null) return 'text-gray-400'
  if (val <= -20) return 'text-green-700 font-semibold'
  if (val <= 0) return 'text-green-600'
  if (val <= 20) return 'text-red-500'
  return 'text-red-700 font-semibold'
}

function fmt(val, prefix = '') {
  if (val === null || isNaN(val)) return '—'
  return `${prefix}$${val.toFixed(2)}`
}

function fmtPct(val) {
  if (val === null || isNaN(val)) return '—'
  return `${val > 0 ? '+' : ''}${val.toFixed(1)}%`
}

const columns = [
  helper.accessor('zip3_route', { header: 'Route', size: 100 }),
  helper.accessor(r => `${r.pickup_airport} → ${r.dropoff_airport}`, {
    id: 'airport_pair', header: 'Airports', size: 120,
  }),
  helper.accessor('min_warp_rate', {
    header: 'Warp Rate',
    cell: ({ getValue }) => fmt(getValue(), ''),
    size: 110,
  }),
  helper.accessor('min_competitor_rate', {
    header: 'Competitor Rate*',
    cell: ({ getValue }) => fmt(getValue(), ''),
    size: 130,
  }),
  helper.accessor('competitor_carrier', { header: 'Carrier', size: 160 }),
  helper.accessor('pct_difference', {
    header: '% Diff',
    cell: ({ getValue }) => (
      <span className={pctColor(getValue())}>{fmtPct(getValue())}</span>
    ),
    size: 90,
  }),
]

function uniq(arr) { return [...new Set(arr)].filter(Boolean).sort() }

export default function RouteExplorer({ data }) {
  const [search, setSearch] = useState('')
  const [pickupAirport, setPickupAirport] = useState('')
  const [dropoffAirport, setDropoffAirport] = useState('')
  const [carrier, setCarrier] = useState('')
  const [pctMin, setPctMin] = useState(-100)
  const [pctMax, setPctMax] = useState(200)
  const [sorting, setSorting] = useState([])

  const pickupAirports = useMemo(() => uniq(data.map(r => r.pickup_airport)), [data])
  const dropoffAirports = useMemo(() => uniq(data.map(r => r.dropoff_airport)), [data])
  const carriers = useMemo(() => uniq(data.map(r => r.competitor_carrier)), [data])

  const filtered = useMemo(() => data.filter(r => {
    if (search && !r.zip3_route.includes(search)) return false
    if (pickupAirport && r.pickup_airport !== pickupAirport) return false
    if (dropoffAirport && r.dropoff_airport !== dropoffAirport) return false
    if (carrier && r.competitor_carrier !== carrier) return false
    if (r.pct_difference !== null && (r.pct_difference < pctMin || r.pct_difference > pctMax)) return false
    return true
  }), [data, search, pickupAirport, dropoffAirport, carrier, pctMin, pctMax])

  const table = useReactTable({
    data: filtered, columns, state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  function Select({ value, onChange, options, placeholder }) {
    return (
      <select
        value={value} onChange={e => onChange(e.target.value)}
        className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-300"
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    )
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-wrap gap-3 items-end">
        <input
          value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Search ZIP3 route…"
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-300 w-40"
        />
        <Select value={pickupAirport} onChange={setPickupAirport} options={pickupAirports} placeholder="Pickup airport" />
        <Select value={dropoffAirport} onChange={setDropoffAirport} options={dropoffAirports} placeholder="Dropoff airport" />
        <Select value={carrier} onChange={setCarrier} options={carriers} placeholder="Carrier" />
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span>% diff:</span>
          <input type="number" value={pctMin} onChange={e => setPctMin(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 w-20 text-sm focus:outline-none" />
          <span>to</span>
          <input type="number" value={pctMax} onChange={e => setPctMax(Number(e.target.value))}
            className="border border-gray-200 rounded px-2 py-1.5 w-20 text-sm focus:outline-none" />
        </div>
        <span className="text-sm text-gray-400 ml-auto">{filtered.length} routes</span>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b border-gray-200">
            {table.getHeaderGroups().map(hg => (
              <tr key={hg.id}>
                {hg.headers.map(h => (
                  <th key={h.id}
                    onClick={h.column.getToggleSortingHandler()}
                    className="px-4 py-3 text-left font-medium text-gray-600 cursor-pointer select-none whitespace-nowrap hover:text-gray-900"
                  >
                    {flexRender(h.column.columnDef.header, h.getContext())}
                    {h.column.getIsSorted() === 'asc' ? ' ↑' : h.column.getIsSorted() === 'desc' ? ' ↓' : ''}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row, i) => (
              <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-gray-400 px-4 py-2 border-t border-gray-100">
          * Competitor rate after 15% markdown applied
        </p>
      </div>
    </div>
  )
}

