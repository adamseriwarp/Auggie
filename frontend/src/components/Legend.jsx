export default function Legend({ colorRange, counts, selectedOrigin }) {
  const values = Object.values(counts).filter(v => v > 0).sort((a, b) => a - b)
  if (values.length === 0) return null

  const min = values[0]
  const max = values[values.length - 1]
  const steps = colorRange.length

  return (
    <div style={{
      position: 'absolute', bottom: 32, right: 16,
      background: 'rgba(255,255,255,0.95)', borderRadius: 8,
      padding: '12px 16px', boxShadow: '0 2px 8px rgba(0,0,0,0.15)',
      fontSize: 12, color: '#333', minWidth: 160
    }}>
      <div style={{ fontWeight: 600, marginBottom: 8 }}>
        {selectedOrigin ? 'Destination quotes' : 'Origin quotes'}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {colorRange.map(([r, g, b], i) => {
          const lo = Math.round(min + (max - min) * (i / steps))
          const hi = Math.round(min + (max - min) * ((i + 1) / steps))
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 20, height: 14, borderRadius: 3,
                background: `rgb(${r},${g},${b})`,
                border: '1px solid rgba(0,0,0,0.1)'
              }} />
              <span>{lo.toLocaleString()} – {hi.toLocaleString()}</span>
            </div>
          )
        })}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 2 }}>
          <div style={{
            width: 20, height: 14, borderRadius: 3,
            background: 'rgb(200,200,200)', border: '1px solid rgba(0,0,0,0.1)'
          }} />
          <span>No data</span>
        </div>
      </div>
    </div>
  )
}

