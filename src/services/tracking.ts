import {
  onDisconnect,
  onValue,
  ref,
  serverTimestamp,
  set,
  update,
  type Unsubscribe,
} from 'firebase/database'
import { realtimeDatabase } from './firebase'
import type { BusLocationRecord, DeviceLocation } from '../types'

function requireDatabase() {
  if (!realtimeDatabase) throw new Error('Firebase Realtime Database is not configured.')
  return realtimeDatabase
}

export function normalizeBusId(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '-')
}

export async function prepareBusTracking(busId: string) {
  const id = normalizeBusId(busId)
  if (!id) throw new Error('Enter the assigned bus number before starting GPS.')
  const busRef = ref(requireDatabase(), `liveLocations/${id}`)
  await onDisconnect(busRef).update({ isActive: false, updatedAt: serverTimestamp() })
}

export async function publishBusLocation(busId: string, location: DeviceLocation) {
  const id = normalizeBusId(busId)
  if (!id) throw new Error('Bus number is missing.')
  await set(ref(requireDatabase(), `liveLocations/${id}`), {
    busId: id,
    latitude: location.latitude,
    longitude: location.longitude,
    accuracy: location.accuracy,
    heading: location.heading,
    speed: location.speed,
    updatedAt: serverTimestamp(),
    isActive: true,
  })
}

export async function markBusOffline(busId: string) {
  const id = normalizeBusId(busId)
  if (!id) return
  await update(ref(requireDatabase(), `liveLocations/${id}`), {
    isActive: false,
    updatedAt: serverTimestamp(),
  })
}

function parseRecord(busId: string, value: Record<string, unknown> | null): BusLocationRecord | null {
  if (!value || typeof value.latitude !== 'number' || typeof value.longitude !== 'number') return null
  return {
    busId,
    latitude: value.latitude,
    longitude: value.longitude,
    accuracy: typeof value.accuracy === 'number' ? value.accuracy : 0,
    heading: typeof value.heading === 'number' ? value.heading : null,
    speed: typeof value.speed === 'number' ? value.speed : null,
    updatedAt: typeof value.updatedAt === 'number' ? value.updatedAt : Date.now(),
    isActive: value.isActive === true,
  }
}

export function subscribeToBus(busId: string, onLocation: (location: BusLocationRecord | null) => void, onError: (message: string) => void): Unsubscribe {
  const id = normalizeBusId(busId)
  if (!id) {
    onLocation(null)
    return () => undefined
  }
  return onValue(ref(requireDatabase(), `liveLocations/${id}`), (snapshot) => {
    onLocation(parseRecord(id, snapshot.val() as Record<string, unknown> | null))
  }, (error) => onError(error.message))
}

export function subscribeToAllBuses(onLocations: (locations: BusLocationRecord[]) => void, onError: (message: string) => void): Unsubscribe {
  return onValue(ref(requireDatabase(), 'liveLocations'), (snapshot) => {
    const data = snapshot.val() as Record<string, Record<string, unknown>> | null
    const locations = Object.entries(data ?? {}).flatMap(([id, value]) => {
      const record = parseRecord(id, value)
      return record ? [record] : []
    })
    onLocations(locations.sort((a, b) => a.busId.localeCompare(b.busId)))
  }, (error) => onError(error.message))
}
