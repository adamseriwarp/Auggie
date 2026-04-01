import { useState } from 'react'

export function useExpansionData() {
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  const [loading, setLoading] = useState(false)

  function loadFile(file) {
    if (!file || !file.name.endsWith('.json')) {
      setError('Please upload a .json file (expansion_output.json).')
      return
    }
    setLoading(true)
    setError(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(e.target.result)
        if (!parsed.metadata || !parsed.zips) {
          setError('Invalid file. Expected expansion_output.json from the export script.')
          setLoading(false)
          return
        }
        setData(parsed)
        setLoading(false)
      } catch {
        setError('Failed to parse JSON. Make sure you upload expansion_output.json.')
        setLoading(false)
      }
    }
    reader.onerror = () => {
      setError('Failed to read file.')
      setLoading(false)
    }
    reader.readAsText(file)
  }

  function reset() {
    setData(null)
    setError(null)
  }

  return { data, error, loading, loadFile, reset }
}

