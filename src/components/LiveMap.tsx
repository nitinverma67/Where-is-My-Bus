import { APIProvider, Map, Marker } from '@vis.gl/react-google-maps'
import type { DeviceLocation } from '../types'

interface LiveMapProps {
  location: DeviceLocation | null
}

const INDIA_CENTER = { lat: 22.9734, lng: 78.6569 }

export function LiveMap({ location }: LiveMapProps) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return (
      <div className="map-placeholder">
        <div className="map-placeholder-card">
          <strong>Google Maps is not configured yet</strong>
          <span>Add your new restricted key to <code>.env</code> as VITE_GOOGLE_MAPS_API_KEY, then restart the dev server.</span>
        </div>
      </div>
    )
  }

  const center = location
    ? { lat: location.latitude, lng: location.longitude }
    : INDIA_CENTER

  return (
    <div className="map-frame">
      <APIProvider apiKey={apiKey}>
        <Map
          defaultCenter={center}
          center={center}
          defaultZoom={location ? 16 : 5}
          gestureHandling="greedy"
          mapTypeControl
          fullscreenControl
          streetViewControl={false}
          className="google-map"
        >
          {location && <Marker position={{ lat: location.latitude, lng: location.longitude }} title="Current device location" />}
        </Map>
      </APIProvider>
    </div>
  )
}
