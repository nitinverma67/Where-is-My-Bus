import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps'
import type { BusLocationRecord, DeviceLocation } from '../types'

interface LiveMapProps {
  locations: BusLocationRecord[]
  deviceLocation?: DeviceLocation | null
}

const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 }

export function LiveMap({ locations, deviceLocation }: LiveMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <div className="map-placeholder">
        <div className="map-placeholder-card">
          <strong>Google Maps is not configured yet</strong>
          <span>Add your restricted key to <code>.env</code> as VITE_GOOGLE_MAPS_API_KEY, then restart the dev server.</span>
        </div>
      </div>
    )
  }

  const first = locations.find((item) => item.isActive) ?? locations[0]
  const center = first
    ? { lat: first.latitude, lng: first.longitude }
    : deviceLocation
      ? { lat: deviceLocation.latitude, lng: deviceLocation.longitude }
      : INDIA_CENTER

  return (
    <div className="map-frame">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          center={center}
          defaultZoom={first || deviceLocation ? 15 : 5}
          gestureHandling="greedy"
          mapTypeControl
          fullscreenControl
          streetViewControl={false}
          className="google-map"
        >
          {locations.map((item) => (
            <Marker
              key={item.busId}
              position={{ lat: item.latitude, lng: item.longitude }}
              title={`${item.busId}${item.isActive ? ' · Live' : ' · Offline'}`}
            />
          ))}
          {deviceLocation && locations.length === 0 && (
            <Marker position={{ lat: deviceLocation.latitude, lng: deviceLocation.longitude }} title="This device GPS" />
          )}
        </Map>
      </APIProvider>
    </div>
  )
}
