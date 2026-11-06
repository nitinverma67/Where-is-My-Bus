import { useEffect, useRef, useState } from 'react'
import { Activity, BusFront, LayoutDashboard, MapPinned, Menu, Radio, ShieldCheck, Users, X } from 'lucide-react'
import { LiveMap } from './components/LiveMap'
import { stopDeviceLocation, watchDeviceLocation } from './services/location'
import { isFirebaseConfigured } from './services/firebase'
import type { DeviceLocation, UserRole } from './types'

const roleLabels: Record<UserRole, string> = {
  student: 'Student portal',
  driver: 'Driver portal',
  management: 'Management portal',
}

export default function App() {
  const [role, setRole] = useState<UserRole>('student')
  const [location, setLocation] = useState<DeviceLocation | null>(null)
  const [tracking, setTracking] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const watchId = useRef<number>(-1)

  useEffect(() => () => stopDeviceLocation(watchId.current), [])

  const startTracking = () => {
    setError('')
    watchId.current = watchDeviceLocation(
      (nextLocation) => {
        setLocation(nextLocation)
        setTracking(true)
      },
      (message) => {
        setError(message)
        setTracking(false)
      },
    )
  }

  const stopTracking = () => {
    stopDeviceLocation(watchId.current)
    watchId.current = -1
    setTracking(false)
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><BusFront size={22} /></div><div><strong>Where Is My Bus</strong><span>Campus transit platform</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X /></button></div>
        <div className="side-label">WORKSPACE</div>
        <nav className="role-nav" aria-label="Portal selection">
          {(['student', 'driver', 'management'] as UserRole[]).map((item) => (
            <button key={item} className={role === item ? 'nav-item active' : 'nav-item'} onClick={() => { setRole(item); setMenuOpen(false) }}>
              {item === 'student' ? <Users size={18} /> : item === 'driver' ? <BusFront size={18} /> : <ShieldCheck size={18} />}
              <span>{roleLabels[item]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className="connection-dot" /><span>Project setup</span><span className="setup-tag">V1</span></div>
      </aside>

      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button>
          <div><span className="eyebrow">CAMPUS TRANSPORT</span><h1>{roleLabels[role]}</h1></div>
          <div className="topbar-right"><span className="live-indicator"><span /> GPS {tracking ? 'active' : 'standby'}</span><div className="avatar">W</div></div>
        </header>

        <section className="welcome-row"><div><h2>Good day</h2><p>Your transport overview at a glance.</p></div><div className="date-chip"><Activity size={15} /> Real-time tracking setup</div></section>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-icon blue"><BusFront size={19} /></div><span className="stat-label">Assigned bus</span><strong>{role === 'driver' ? 'Not assigned' : 'Awaiting data'}</strong><small>Connected to Firebase in next setup phase</small></article>
          <article className="stat-card"><div className="stat-icon violet"><MapPinned size={19} /></div><span className="stat-label">Live location</span><strong>{location ? 'GPS received' : 'Not started'}</strong><small>{location ? `${location.accuracy.toFixed(0)} m reported accuracy` : 'Start device GPS to locate this device'}</small></article>
          <article className="stat-card"><div className="stat-icon green"><Radio size={19} /></div><span className="stat-label">Realtime service</span><strong>{isFirebaseConfigured ? 'Firebase configured' : 'Needs configuration'}</strong><small>Database sync and access rules are next</small></article>
        </section>

        <section className="map-section">
          <div className="section-heading"><div><h3>Live location map</h3><p>Google Maps · Device GPS · Location permission required</p></div><div className="map-actions">{tracking ? <button className="button button-danger" onClick={stopTracking}>Stop tracking</button> : <button className="button button-primary" onClick={startTracking}>Start device GPS</button>}</div></div>
          {error && <div className="error-banner">{error}</div>}
          <LiveMap location={location} />
          <div className="map-footer"><span><span className={`status-dot ${tracking ? 'on' : ''}`} />{tracking ? 'This device is sharing its location with this page' : 'GPS is currently off'}</span>{location && <span>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</span>}</div>
        </section>

        <section className="next-step"><div className="next-icon"><LayoutDashboard size={19} /></div><div><strong>Next implementation step</strong><p>Connect authenticated driver GPS updates to Firebase Realtime Database, then subscribe to the same bus location from the student and management portals. This starter currently reads device GPS locally; it does not yet broadcast it to other devices.</p></div></section>
      </main>
    </div>
  )
}
