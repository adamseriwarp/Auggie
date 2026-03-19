import { useRef, useState } from 'react'

export default function CsvUploader({ onFile, error, loading }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleDrop(e) {
    e.preventDefault()
    setDragging(false)
    const file = e.dataTransfer.files[0]
    if (file) onFile(file)
  }

  function handleChange(e) {
    const file = e.target.files[0]
    if (file) onFile(file)
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="max-w-lg w-full text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Competitive Rates Dashboard
        </h1>
        <p className="text-gray-500 mb-8">
          Upload your <code className="bg-gray-100 px-1.5 py-0.5 rounded text-sm font-mono">pivot_table_with_airports.csv</code> to explore Warp's pricing competitiveness.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`
            border-2 border-dashed rounded-xl p-12 cursor-pointer transition-colors
            ${dragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
            }
          `}
        >
          <div className="text-4xl mb-4">📂</div>
          <p className="text-gray-700 font-medium">
            {loading ? 'Parsing CSV...' : 'Drop your CSV here or click to browse'}
          </p>
          <p className="text-gray-400 text-sm mt-1">Only .csv files are accepted</p>
          <input
            ref={inputRef}
            type="file"
            accept=".csv"
            className="hidden"
            onChange={handleChange}
          />
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}

        <p className="text-xs text-gray-400 mt-6">
          Your data never leaves your browser — all processing happens locally.
        </p>
      </div>
    </div>
  )
}

