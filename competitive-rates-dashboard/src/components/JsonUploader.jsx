import { useRef, useState } from 'react'

export default function JsonUploader({ onFile, error, loading }) {
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
    <div className="flex items-center justify-center p-12">
      <div className="max-w-lg w-full text-center">
        <h2 className="text-xl font-semibold text-gray-800 mb-2">Expansion Analysis</h2>
        <p className="text-gray-500 text-sm mb-6">
          Run <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">python expansion_analysis/export_expansion_data.py</code> first,
          then upload the generated <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-xs">expansion_output.json</code>.
        </p>

        <div
          onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`border-2 border-dashed rounded-xl p-10 cursor-pointer transition-colors ${
            dragging
              ? 'border-blue-500 bg-blue-50'
              : 'border-gray-300 bg-white hover:border-blue-400 hover:bg-blue-50'
          }`}
        >
          <div className="text-3xl mb-3">📂</div>
          <p className="text-gray-700 font-medium text-sm">
            {loading ? 'Loading...' : 'Drop expansion_output.json here or click to browse'}
          </p>
          <input ref={inputRef} type="file" accept=".json" className="hidden" onChange={handleChange} />
        </div>

        {error && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}

