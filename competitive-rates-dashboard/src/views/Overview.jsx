import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer
} from 'recharts'

function StatCard({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <p className="text-sm text-gray-500 mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color || 'text-gray-900'}`}>{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  )
}

function buildBuckets(data) {
  const buckets = [
    { label: '< −20%', min: -Infinity, max: -20, color: '#16a34a' },
    { label: '−20 to 0%', min: -20, max: 0, color: '#86efac' },
    { label: '0 to +20%', min: 0, max: 20, color: '#fca5a5' },
    { label: '> +20%', min: 20, max: Infinity, color: '#dc2626' },
  ]
  return buckets.map((b) => ({
    ...b,
    count: data.filter((r) => r.pct_difference > b.min && r.pct_difference <= b.max).length,
  }))
}

export default function Overview({ data, stats }) {
  const buckets = buildBuckets(data)

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-semibold text-gray-800 mb-4">Summary</h2>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
          <StatCard label="Total Routes" value={stats.total.toLocaleString()} />
          <StatCard
            label="Warp Cheaper"
            value={`${stats.cheaperPct}%`}
            sub={`${stats.cheaperCount.toLocaleString()} routes`}
            color="text-green-600"
          />
          <StatCard
            label="Warp More Expensive"
            value={`${stats.expensivePct}%`}
            sub={`${stats.expensiveCount.toLocaleString()} routes`}
            color="text-red-600"
          />
          <StatCard
            label="Avg % Difference"
            value={`${stats.avgPct > 0 ? '+' : ''}${stats.avgPct}%`}
            color={parseFloat(stats.avgPct) <= 0 ? 'text-green-600' : 'text-red-600'}
          />
          <StatCard
            label="Top Competitor"
            value={stats.topCarrier}
            sub="by route wins"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h2 className="text-xl font-semibold text-gray-800 mb-1">
          Route Distribution by % Difference
        </h2>
        <p className="text-sm text-gray-400 mb-6">
          Green = Warp cheaper &nbsp;·&nbsp; Red = Warp more expensive
        </p>
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={buckets} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 13 }} />
            <YAxis tick={{ fontSize: 13 }} />
            <Tooltip formatter={(v) => [`${v} routes`, 'Count']} />
            <Bar dataKey="count" radius={[4, 4, 0, 0]}>
              {buckets.map((b, i) => (
                <Cell key={i} fill={b.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

