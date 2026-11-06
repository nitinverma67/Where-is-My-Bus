import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, onAuthStateChanged, signInAnonymously, type User } from 'firebase/auth'
import { getDatabase } from 'firebase/database'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  databaseURL: import.meta.env.VITE_FIREBASE_DATABASE_URL,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
}

export const isFirebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.databaseURL && firebaseConfig.projectId && firebaseConfig.appId,
)

export const firebaseApp = isFirebaseConfigured
  ? (getApps().length ? getApp() : initializeApp(firebaseConfig))
  : null

export const realtimeDatabase = firebaseApp ? getDatabase(firebaseApp) : null
export const firestore = firebaseApp ? getFirestore(firebaseApp) : null

/** Creates a quiet, temporary anonymous session; users do not see a login screen. */
export async function ensureAnonymousSession(): Promise<User> {
  if (!firebaseApp) throw new Error('Firebase is not configured. Check your .env file.')
  const auth = getAuth(firebaseApp)
  if (auth.currentUser) return auth.currentUser

  return new Promise<User>((resolve, reject) => {
    let unsubscribe: () => void = () => {}
    unsubscribe = onAuthStateChanged(auth, async (user) => {
      unsubscribe()
      if (user) {
        resolve(user)
        return
      }
      try {
        const credential = await signInAnonymously(auth)
        resolve(credential.user)
      } catch (error) {
        reject(error)
      }
    }, (error) => {
      unsubscribe()
      reject(error)
    })
  })
}
