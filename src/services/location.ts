import type { DeviceLocation } from '../types'

export function watchDeviceLocation(
  onLocation: (location: DeviceLocation) => void,
  onError: (message: string) => void,
): number {
  if (!('geolocation' in navigator)) {
    onError('This browser does not support device location.')
    return -1
  }

  return navigator.geolocation.watchPosition(
    (position) => {
      onLocation({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: position.coords.heading,
        speed: position.coords.speed,
        updatedAt: position.timestamp,
      })
    },
    (error) => {
      const messages: Record<number, string> = {
        1: 'Location permission was denied. Allow location access in your browser settings.',
        2: 'Your device could not determine its location. Check GPS/location services.',
        3: 'Location request timed out. Please try again.',
      }
      onError(messages[error.code] ?? 'Unable to read device location.')
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 },
  )
}

export function stopDeviceLocation(watchId: number) {
  if (watchId >= 0) navigator.geolocation.clearWatch(watchId)
}
