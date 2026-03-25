import { useState } from 'react'
import { useQuoteData } from './hooks/useQuoteData'
import CsvUploader from './components/CsvUploader'
import Overview from './views/Overview'
import RouteExplorer from './views/RouteExplorer'
import AirportAnalysis from './views/AirportAnalysis'
import CompetitorBreakdown from './views/CompetitorBreakdown'
import PricingPriority from './views/PricingPriority'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'routes', label: 'Route Explorer' },
  { id: 'airports', label: 'Airport Analysis' },
  { id: 'competitors', label: 'Competitor Breakdown' },
  { id: 'pricing', label: 'Pricing Priority' },
]

export default function App() {
  const { data, stats, error, loading, loadFile, reset } = useQuoteData()
  const [activeTab, setActiveTab] = useState('overview')

  if (loading && !data) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400 text-sm">Loading data…</p>
      </div>
    )
  }

  if (!data) {
    return <CsvUploader onFile={loadFile} error={error} loading={loading} />
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-lg font-bold text-gray-900">Competitive Rates</span>
          <span className="text-sm text-gray-400">{data.length.toLocaleString()} routes loaded</span>
        </div>
        <button
          onClick={reset}
          className="text-sm text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors"
        >
          ↩ Upload different CSV
        </button>
      </header>

      <nav className="bg-white border-b border-gray-200 px-6">
        <div className="flex">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </nav>

      <main className="px-6 py-6 max-w-7xl mx-auto">
        {activeTab === 'overview' && <Overview data={data} stats={stats} />}
        {activeTab === 'routes' && <RouteExplorer data={data} />}
        {activeTab === 'airports' && <AirportAnalysis data={data} />}
        {activeTab === 'competitors' && <CompetitorBreakdown data={data} />}
        {activeTab === 'pricing' && <PricingPriority data={data} />}
      </main>
    </div>
  )
}
