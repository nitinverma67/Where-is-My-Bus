import { useEffect, useMemo, useRef, useState } from 'react'
import { Activity, BusFront, LayoutDashboard, MapPinned, Menu, Radio, ShieldCheck, Users, X, Wifi, WifiOff } from 'lucide-react'
import { LiveMap } from './components/LiveMap'
import { ensureAnonymousSession, isFirebaseConfigured } from './services/firebase'
import { stopDeviceLocation, watchDeviceLocation } from './services/location'
import { markBusOffline, normalizeBusId, prepareBusTracking, publishBusLocation, subscribeToAllBuses, subscribeToBus } from './services/tracking'
import type { BusLocationRecord, DeviceLocation, UserRole } from './types'

const roleLabels: Record<UserRole, string> = {
  student: 'Student portal',
  driver: 'Driver portal',
  management: 'Management portal',
}

function formatTime(timestamp: number) {
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(timestamp)
}

export default function App() {
  const [role, setRole] = useState<UserRole>('student')
  const [location, setLocation] = useState<DeviceLocation | null>(null)
  const [remoteLocation, setRemoteLocation] = useState<BusLocationRecord | null>(null)
  const [allLocations, setAllLocations] = useState<BusLocationRecord[]>([])
  const [tracking, setTracking] = useState(false)
  const [error, setError] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const [driverBusId, setDriverBusId] = useState('BUS-01')
  const [studentBusId, setStudentBusId] = useState('BUS-01')
  const [firebaseReady, setFirebaseReady] = useState(false)
  const [firebaseError, setFirebaseError] = useState('')
  const [uid, setUid] = useState('')
  const watchId = useRef<number>(-1)
  const activeDriverBus = useRef('')

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setFirebaseError('Firebase configuration is missing. Copy .env.example to .env and check the Firebase values.')
      return
    }
    ensureAnonymousSession()
      .then((user) => { setUid(user.uid); setFirebaseReady(true); setFirebaseError('') })
      .catch((reason: unknown) => setFirebaseError(reason instanceof Error ? reason.message : 'Could not connect to Firebase Authentication.'))
  }, [])

  useEffect(() => () => stopDeviceLocation(watchId.current), [])

  useEffect(() => {
    if (!firebaseReady || role !== 'student') return
    setRemoteLocation(null)
    return subscribeToBus(studentBusId, setRemoteLocation, setFirebaseError)
  }, [firebaseReady, role, studentBusId])

  useEffect(() => {
    if (!firebaseReady || role !== 'management') return
    return subscribeToAllBuses(setAllLocations, setFirebaseError)
  }, [firebaseReady, role])

  const mapLocations = useMemo(() => {
    if (role === 'student') return remoteLocation ? [remoteLocation] : []
    if (role === 'management') return allLocations
    if (location && driverBusId.trim()) {
      return [{ ...location, busId: normalizeBusId(driverBusId), isActive: tracking }]
    }
    return []
  }, [role, remoteLocation, allLocations, location, driverBusId, tracking])

  const startTracking = async () => {
    setError('')
    if (!firebaseReady) {
      setError(firebaseError || 'Wait for Firebase to connect before starting bus tracking.')
      return
    }
    const busId = normalizeBusId(driverBusId)
    if (!busId) { setError('Enter your assigned bus number first.'); return }
    try {
      await prepareBusTracking(busId)
      activeDriverBus.current = busId
      watchId.current = watchDeviceLocation(
        (nextLocation) => {
          setLocation(nextLocation)
          setTracking(true)
          publishBusLocation(busId, nextLocation).catch((reason: unknown) => {
            setError(reason instanceof Error ? reason.message : 'Could not publish GPS location to Firebase.')
          })
        },
        (message) => {
          setError(message)
          setTracking(false)
          markBusOffline(busId).catch(() => undefined)
        },
      )
      if (watchId.current >= 0) setTracking(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not prepare Firebase bus tracking.')
    }
  }

  const stopTracking = () => {
    stopDeviceLocation(watchId.current)
    watchId.current = -1
    setTracking(false)
    const busId = activeDriverBus.current
    activeDriverBus.current = ''
    if (busId) markBusOffline(busId).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not mark bus offline.'))
  }

  const activeCount = allLocations.filter((item) => item.isActive).length
  const currentBus = role === 'driver' ? normalizeBusId(driverBusId) : normalizeBusId(studentBusId)

  return (
    <div className="app-shell">
      <aside className={`sidebar ${menuOpen ? 'sidebar-open' : ''}`}>
        <div className="brand"><div className="brand-mark"><BusFront size={22} /></div><div><strong>Where Is My Bus</strong><span>Campus transit platform</span></div><button className="mobile-close" onClick={() => setMenuOpen(false)} aria-label="Close menu"><X /></button></div>
        <div className="side-label">WORKSPACE</div>
        <nav className="role-nav" aria-label="Portal selection">
          {(['student', 'driver', 'management'] as UserRole[]).map((item) => (
            <button key={item} className={role === item ? 'nav-item active' : 'nav-item'} onClick={() => { setRole(item); setMenuOpen(false); setError('') }}>
              {item === 'student' ? <Users size={18} /> : item === 'driver' ? <BusFront size={18} /> : <ShieldCheck size={18} />}
              <span>{roleLabels[item]}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom"><div className={`connection-dot ${firebaseReady ? '' : 'offline'}`} /><span>{firebaseReady ? 'Firebase connected' : 'Connecting to Firebase'}</span><span className="setup-tag">V2</span></div>
      </aside>

      {menuOpen && <button className="mobile-scrim" onClick={() => setMenuOpen(false)} aria-label="Close navigation" />}

      <main className="main-area">
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMenuOpen(true)} aria-label="Open menu"><Menu /></button>
          <div><span className="eyebrow">CAMPUS TRANSPORT</span><h1>{roleLabels[role]}</h1></div>
          <div className="topbar-right"><span className={`live-indicator ${firebaseReady ? 'connected' : ''}`}><span /> {firebaseReady ? 'Firebase online' : 'Connecting'}</span><div className="avatar">W</div></div>
        </header>

        <section className="welcome-row"><div><h2>{role === 'driver' ? 'Driver workspace' : role === 'management' ? 'Fleet overview' : 'Track your bus'}</h2><p>{role === 'driver' ? 'Share your actual device GPS with students in real time.' : role === 'management' ? 'Monitor the latest location of every bus publishing GPS.' : 'Enter your bus number to see its latest live location.'}</p></div><div className="date-chip"><Activity size={15} /> Firebase real-time tracking</div></section>

        <section className="stats-grid">
          <article className="stat-card"><div className="stat-icon blue"><BusFront size={19} /></div><span className="stat-label">{role === 'management' ? 'Active buses' : 'Bus number'}</span><strong>{role === 'management' ? `${activeCount} active` : role === 'driver' ? (normalizeBusId(driverBusId) || 'Not set') : (normalizeBusId(studentBusId) || 'Not set')}</strong><small>{role === 'management' ? `${allLocations.length} buses have reported` : role === 'driver' ? 'Your assigned bus ID' : 'Bus you are subscribed to'}</small></article>
          <article className="stat-card"><div className="stat-icon violet"><MapPinned size={19} /></div><span className="stat-label">Live location</span><strong>{role === 'driver' ? (tracking ? 'Broadcasting' : 'Not started') : role === 'management' ? `${activeCount} reporting` : remoteLocation?.isActive ? 'Bus is live' : remoteLocation ? 'Bus offline' : 'Waiting for bus'}</strong><small>{role === 'driver' ? (location ? `${location.accuracy.toFixed(0)} m GPS accuracy` : 'Start tracking from this device') : role === 'management' ? 'Realtime database status' : remoteLocation ? `Last update ${formatTime(remoteLocation.updatedAt)}` : 'Waiting for driver GPS update'}</small></article>
          <article className="stat-card"><div className="stat-icon green"><Radio size={19} /></div><span className="stat-label">Realtime service</span><strong>{firebaseReady ? 'Connected' : 'Not connected'}</strong><small>{firebaseReady ? `Session ${uid.slice(0, 8)}` : 'Firebase connection required'}</small></article>
        </section>

        {role === 'driver' && <section className="control-panel"><div className="control-copy"><strong>Start sharing bus location</strong><p>Use the driver's phone. Keep this page open while the bus is moving.</p></div><div className="control-actions"><label className="field-label">Assigned bus number<input value={driverBusId} onChange={(event) => setDriverBusId(event.target.value.toUpperCase())} disabled={tracking} placeholder="Example: BUS-01" /></label>{tracking ? <button className="button button-danger" onClick={stopTracking}>Stop live tracking</button> : <button className="button button-primary" onClick={startTracking} disabled={!firebaseReady}>Start live tracking</button>}</div></section>}

        {role === 'student' && <section className="control-panel"><div className="control-copy"><strong>Choose your bus</strong><p>Use the same bus number that the driver enters in the Driver Portal.</p></div><label className="field-label">Bus number<input value={studentBusId} onChange={(event) => setStudentBusId(event.target.value.toUpperCase())} placeholder="Example: BUS-01" /></label></section>}

        {role === 'management' && <section className="control-panel management-summary"><div className="control-copy"><strong>Live fleet monitoring</strong><p>This list updates automatically whenever a driver starts or stops sharing GPS.</p></div><div className="fleet-count"><strong>{activeCount}</strong><span>active / {allLocations.length} known buses</span></div></section>}

        {(error || firebaseError) && <div className="error-banner">{error || firebaseError}</div>}

        <section className="map-section">
          <div className="section-heading"><div><h3>{role === 'management' ? 'All bus locations' : role === 'driver' ? 'Your bus location' : `${currentBus || 'Selected bus'} location`}</h3><p>Google Maps · Firebase Realtime Database · Actual device GPS</p></div><div className="map-actions">{role === 'driver' && <span className={`tracking-pill ${tracking ? 'active' : ''}`}>{tracking ? <Wifi size={14} /> : <WifiOff size={14} />}{tracking ? 'Broadcasting' : 'Not broadcasting'}</span>}</div></div>
          <LiveMap locations={mapLocations} deviceLocation={role === 'driver' ? location : null} />
          <div className="map-footer"><span><span className={`status-dot ${role === 'driver' ? (tracking ? 'on' : '') : (role === 'student' ? (remoteLocation?.isActive ? 'on' : '') : (activeCount ? 'on' : ''))}`} />{role === 'driver' ? (tracking ? 'Your GPS is being sent to Firebase' : 'GPS sharing is stopped') : role === 'student' ? (remoteLocation?.isActive ? 'Receiving live bus location' : 'No active GPS signal from this bus') : `${activeCount} buses currently sharing GPS`}</span>{role === 'student' && remoteLocation && <span>{remoteLocation.latitude.toFixed(6)}, {remoteLocation.longitude.toFixed(6)} · Updated {formatTime(remoteLocation.updatedAt)}</span>}{role === 'driver' && location && <span>{location.latitude.toFixed(6)}, {location.longitude.toFixed(6)}</span>}</div>
        </section>

        {role === 'management' && <section className="bus-list-panel"><div className="section-heading"><div><h3>Fleet status</h3><p>Live status from Firebase Realtime Database</p></div></div>{allLocations.length === 0 ? <p className="empty-state">No buses have shared a location yet. Start GPS from a driver's device to see it here.</p> : <div className="bus-list">{allLocations.map((bus) => <article className="bus-row" key={bus.busId}><div className="bus-row-icon"><BusFront size={17} /></div><div className="bus-row-main"><strong>{bus.busId}</strong><span>{bus.latitude.toFixed(5)}, {bus.longitude.toFixed(5)} · {bus.accuracy.toFixed(0)} m accuracy</span></div><span className={`bus-status ${bus.isActive ? 'online' : 'offline'}`}>{bus.isActive ? 'Live' : 'Offline'}</span><time>{formatTime(bus.updatedAt)}</time></article>)}</div>}</section>}

        <section className="next-step"><div className="next-icon"><LayoutDashboard size={19} /></div><div><strong>Phase 2 · Firebase live GPS synchronization</strong><p>Driver GPS is written to liveLocations/{'{busId}'} in Firebase Realtime Database. Students subscribe to their bus number, while management receives updates for the complete fleet. The current role switch is for development testing; proper account and driver-to-bus permissions are part of the authentication phase.</p></div></section>
      </main>
    </div>
  )
}
