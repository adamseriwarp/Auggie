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

function fmtRate(val) {
  if (val === null || val === undefined || isNaN(val)) return '—'
  return `${(val * 100).toFixed(1)}%`
}

function csvValue(val) {
  if (val === null || val === undefined) return ''
  const str = String(val)
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

function exportRowsToCsv(rows) {
  const headers = [
    'Route',
    'Pickup Airport',
    'Dropoff Airport',
    'Airports',
    'Quoted',
    'Booked',
    'Book Rate',
    'Warp Rate',
    'Recommended Price',
    'Competitor Rate',
    'Carrier',
    'Pct Diff',
  ]

  const lines = [headers.join(',')]
  rows.forEach((row) => {
    const r = row.original
    const values = [
      r.zip3_route,
      r.pickup_airport,
      r.dropoff_airport,
      `${r.pickup_airport} → ${r.dropoff_airport}`,
      r.quote_count ?? '',
      r.booked_count ?? '',
      r.book_rate !== null && r.book_rate !== undefined ? (r.book_rate * 100).toFixed(1) : '',
      r.min_warp_rate !== null ? r.min_warp_rate.toFixed(2) : '',
      r.recommended_price !== null ? r.recommended_price.toFixed(2) : '',
      r.min_competitor_rate !== null ? r.min_competitor_rate.toFixed(2) : '',
      r.competitor_carrier,
      r.pct_difference !== null ? r.pct_difference.toFixed(1) : '',
    ]
    lines.push(values.map(csvValue).join(','))
  })

  const blob = new Blob([lines.join('\n')], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'route_explorer_export.csv'
  a.click()
  URL.revokeObjectURL(url)
}

const columns = [
  helper.accessor('zip3_route', { header: 'Route', size: 100 }),
  helper.accessor(r => `${r.pickup_airport} → ${r.dropoff_airport}`, {
    id: 'airport_pair', header: 'Airports', size: 120,
  }),
  helper.accessor('quote_count', {
    header: 'Quoted',
    cell: ({ getValue }) => {
      const val = getValue()
      return val !== null && val !== undefined ? val.toLocaleString() : '—'
    },
    size: 90,
  }),
  helper.accessor('booked_count', {
    header: 'Booked',
    cell: ({ getValue }) => {
      const val = getValue()
      return val !== null && val !== undefined ? val.toLocaleString() : '—'
    },
    size: 90,
  }),
  helper.accessor('book_rate', {
    header: 'Book Rate',
    cell: ({ getValue }) => fmtRate(getValue()),
    size: 100,
  }),
  helper.accessor('min_warp_rate', {
    header: 'Warp Rate',
    cell: ({ getValue }) => fmt(getValue(), ''),
    size: 110,
  }),
  helper.accessor('recommended_price', {
    header: 'Recommended Price',
    cell: ({ getValue }) => {
      const val = getValue()
      if (val === null || val === undefined) return '—'
      return `$${val.toFixed(2)}`
    },
    size: 150,
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

export default function RouteExplorer({ data, bookingStats = {} }) {
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

  const rows = useMemo(() => data.map((row) => ({
    ...row,
    ...(bookingStats[row.zip3_route] || { quote_count: null, booked_count: null, book_rate: null }),
  })), [data, bookingStats])

  const filtered = useMemo(() => rows.filter(r => {
    if (search && !r.zip3_route.includes(search)) return false
    if (pickupAirport && r.pickup_airport !== pickupAirport) return false
    if (dropoffAirport && r.dropoff_airport !== dropoffAirport) return false
    if (carrier && r.competitor_carrier !== carrier) return false
    if (r.pct_difference !== null && (r.pct_difference < pctMin || r.pct_difference > pctMax)) return false
    return true
  }), [rows, search, pickupAirport, dropoffAirport, carrier, pctMin, pctMax])

  const table = useReactTable({
    data: filtered, columns, state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })
  const visibleRows = table.getRowModel().rows

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
        <div className="ml-auto flex items-center gap-3">
          <button
            onClick={() => exportRowsToCsv(visibleRows)}
            disabled={visibleRows.length === 0}
            className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Export CSV
          </button>
          <span className="text-sm text-gray-400">{filtered.length} routes</span>
        </div>
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

