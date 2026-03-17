export default function Tooltip({ hoverInfo }) {
  if (!hoverInfo) return null
  const { x, y, zip, count } = hoverInfo
  return (
    <div style={{
      position: 'absolute', left: x + 12, top: y - 10,
      background: 'rgba(30,30,30,0.9)', color: '#fff',
      padding: '6px 10px', borderRadius: 6, fontSize: 13,
      pointerEvents: 'none', zIndex: 10
    }}>
      <div><strong>ZIP: {zip}</strong></div>
      <div>{count != null ? `${count.toLocaleString()} quotes` : 'No data'}</div>
    </div>
  )
}

