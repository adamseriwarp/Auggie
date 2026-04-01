import { useState } from 'react'
import { useQuoteData } from './hooks/useQuoteData'
import { useBookingStats } from './hooks/useBookingStats'
import { useExpansionData } from './hooks/useExpansionData'
import CsvUploader from './components/CsvUploader'
import JsonUploader from './components/JsonUploader'
import Overview from './views/Overview'
import RouteExplorer from './views/RouteExplorer'
import AirportAnalysis from './views/AirportAnalysis'
import CompetitorBreakdown from './views/CompetitorBreakdown'
import PricingPriority from './views/PricingPriority'
import PricingReport from './views/PricingReport'
import ExpansionOverview from './views/expansion/ExpansionOverview'
import ZipRankings from './views/expansion/ZipRankings'
import ExpansionSummaries from './views/expansion/ExpansionSummaries'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'routes', label: 'Route Explorer' },
  { id: 'airports', label: 'Airport Analysis' },
  { id: 'competitors', label: 'Competitor Breakdown' },
  { id: 'pricing', label: 'Pricing Priority' },
  { id: 'report', label: 'Pricing Report' },
  { id: 'expansion', label: '🗺 Expansion' },
]

const EXPANSION_SUBTABS = [
  { id: 'exp-overview', label: 'Overview' },
  { id: 'exp-zips', label: 'ZIP Rankings' },
  { id: 'exp-summaries', label: 'Summaries' },
]

export default function App() {
  const { data, stats, error, loading, loadFile, reset } = useQuoteData()
  const { routeStats, totals: bookingTotals } = useBookingStats()
  const expansion = useExpansionData()
  const [activeTab, setActiveTab] = useState('overview')
  const [expSubTab, setExpSubTab] = useState('exp-overview')

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
        {activeTab === 'overview' && <Overview data={data} stats={stats} bookingTotals={bookingTotals} />}
        {activeTab === 'routes' && <RouteExplorer data={data} bookingStats={routeStats} />}
        {activeTab === 'airports' && <AirportAnalysis data={data} />}
        {activeTab === 'competitors' && <CompetitorBreakdown data={data} />}
        {activeTab === 'pricing' && <PricingPriority data={data} />}
        {activeTab === 'report' && <PricingReport data={data} bookingStats={routeStats} />}
        {activeTab === 'expansion' && (
          expansion.data ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex gap-0 bg-white border border-gray-200 rounded-lg overflow-hidden">
                  {EXPANSION_SUBTABS.map(st => (
                    <button key={st.id} onClick={() => setExpSubTab(st.id)}
                      className={`px-4 py-2 text-sm font-medium transition-colors ${
                        expSubTab === st.id
                          ? 'bg-blue-500 text-white'
                          : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                      }`}>
                      {st.label}
                    </button>
                  ))}
                </div>
                <button onClick={expansion.reset}
                  className="text-xs text-gray-400 hover:text-gray-600 border border-gray-200 rounded-lg px-3 py-1.5 hover:bg-gray-50 transition-colors">
                  ↩ Upload new JSON
                </button>
              </div>
              {expSubTab === 'exp-overview' && <ExpansionOverview data={expansion.data} />}
              {expSubTab === 'exp-zips' && <ZipRankings data={expansion.data} />}
              {expSubTab === 'exp-summaries' && <ExpansionSummaries data={expansion.data} />}
            </div>
          ) : (
            <JsonUploader onFile={expansion.loadFile} error={expansion.error} loading={expansion.loading} />
          )
        )}
      </main>
    </div>
  )
}
