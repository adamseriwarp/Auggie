import { NavLink } from 'react-router-dom'

export default function NavHeader() {
  return (
    <nav style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
      background: 'rgba(20,20,30,0.92)', backdropFilter: 'blur(6px)',
      display: 'flex', alignItems: 'center', gap: 0,
      height: 44, padding: '0 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)'
    }}>
      <span style={{ color: '#fff', fontWeight: 700, fontSize: 15, marginRight: 24, letterSpacing: 0.5 }}>
        Warp LTL
      </span>
      <NavLink
        to="/"
        end
        style={({ isActive }) => ({
          color: isActive ? '#5b9fff' : '#bbb',
          textDecoration: 'none', fontWeight: 600, fontSize: 13,
          padding: '4px 12px', borderRadius: 6,
          background: isActive ? 'rgba(91,159,255,0.15)' : 'transparent',
          transition: 'all 0.15s'
        })}
      >
        Demand Map
      </NavLink>
      <NavLink
        to="/coverage"
        style={({ isActive }) => ({
          color: isActive ? '#5b9fff' : '#bbb',
          textDecoration: 'none', fontWeight: 600, fontSize: 13,
          padding: '4px 12px', borderRadius: 6,
          background: isActive ? 'rgba(91,159,255,0.15)' : 'transparent',
          transition: 'all 0.15s'
        })}
      >
        Coverage Map
      </NavLink>
    </nav>
  )
}

