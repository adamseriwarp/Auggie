function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

export default function ExpansionOverview({ data }) {
  const { metadata, by_region } = data
  const fmt = (n) => (n ?? 0).toLocaleString()
  const date = new Date(metadata.generated_at).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric'
  })
  const weeks = metadata.weeks_analyzed
  const dateRange = weeks.length > 0
    ? `${weeks[0]} → ${weeks[weeks.length - 1]}`
    : '—'

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Summary</h2>
          <span className="text-xs text-gray-400">Generated {date} · {weeks.length} weeks ({dateRange})</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total Quotes" value={fmt(metadata.total_quotes)} />
          <StatCard label="Unrated Quotes" value={fmt(metadata.total_unrated_quotes)}
            sub={`${((metadata.total_unrated_quotes / metadata.total_quotes) * 100).toFixed(1)}% of total`}
            color="text-orange-600" />
          <StatCard label="Serviced ZIPs" value={fmt(metadata.serviced_zip_count)} color="text-green-600" />
          <StatCard label="Unserviced ZIPs" value={fmt(metadata.unserviced_zip_count)}
            sub="with unrated demand" color="text-red-600" />
          <StatCard label="Weeks Analyzed" value={weeks.length} sub={dateRange} />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-auto">
        <div className="px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-800">Unserviced Demand by Region</h2>
          <p className="text-xs text-gray-400 mt-0.5">% Not Serviced = unserviced quotes ÷ total quotes from that region</p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              {['Region', 'Unserviced ZIPs', 'Unserviced Quotes', 'Total Quotes', '% Not Serviced', 'Avg Distance (mi)'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium text-gray-600 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {by_region.map((row, i) => (
              <tr key={row.region} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                <td className="px-4 py-2.5 font-medium text-gray-800">{row.region}</td>
                <td className="px-4 py-2.5 text-gray-600">{(row.zip_count ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-gray-600">{(row.unserviced_quotes ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2.5 text-gray-600">{(row.total_quotes ?? 0).toLocaleString()}</td>
                <td className="px-4 py-2.5">
                  <span className={row.pct_not_serviced > 20 ? 'text-red-600 font-semibold' : 'text-gray-600'}>
                    {row.pct_not_serviced != null ? `${row.pct_not_serviced}%` : '—'}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-gray-600">
                  {row.avg_distance_miles != null ? row.avg_distance_miles.toFixed(1) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

