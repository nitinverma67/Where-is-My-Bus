export type UserRole = 'student' | 'driver' | 'management'

export interface DeviceLocation {
  latitude: number
  longitude: number
  accuracy: number
  heading: number | null
  speed: number | null
  updatedAt: number
}

export interface BusLocationRecord extends DeviceLocation {
  busId: string
  isActive: boolean
}
