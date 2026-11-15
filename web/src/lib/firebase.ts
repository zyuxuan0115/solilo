import { getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import {
  GoogleAuthProvider,
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type Auth,
  type User,
} from 'firebase/auth'
import { isFirebaseClientConfigured, webEnv } from './env'

let firebaseApp: FirebaseApp | null = null
let firebaseAuth: Auth | null = null
let emulatorConnected = false

export function getClientAuth(): Auth | null {
  if (!isFirebaseClientConfigured) return null
  if (firebaseAuth) return firebaseAuth

  firebaseApp =
    getApps()[0] ??
    initializeApp({
      apiKey: webEnv.firebase.apiKey,
      authDomain: webEnv.firebase.authDomain || `${webEnv.firebase.projectId}.firebaseapp.com`,
      projectId: webEnv.firebase.projectId,
      appId: webEnv.firebase.appId || undefined,
    })

  firebaseAuth = getAuth(firebaseApp)

  if (webEnv.firebase.emulatorUrl && !emulatorConnected) {
    connectAuthEmulator(firebaseAuth, webEnv.firebase.emulatorUrl, { disableWarnings: true })
    emulatorConnected = true
  }

  return firebaseAuth
}

export {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
}
