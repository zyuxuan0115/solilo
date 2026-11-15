const rawApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.trim()
const rawPublicOrigin = (import.meta.env.VITE_PUBLIC_ORIGIN as string | undefined)?.trim()

export const webEnv = {
  apiBaseUrl: (rawApiBase || '/apps/solilo/api').replace(/\/+$/, ''),
  publicOrigin: (
    rawPublicOrigin ||
    (typeof window !== 'undefined' ? window.location.origin : 'https://kate0115.cc')
  ).replace(/\/+$/, ''),
  firebase: {
    apiKey: (import.meta.env.VITE_FIREBASE_API_KEY as string | undefined)?.trim() ?? '',
    authDomain: (import.meta.env.VITE_FIREBASE_AUTH_DOMAIN as string | undefined)?.trim() ?? '',
    projectId: (import.meta.env.VITE_FIREBASE_PROJECT_ID as string | undefined)?.trim() ?? '',
    appId: (import.meta.env.VITE_FIREBASE_APP_ID as string | undefined)?.trim() ?? '',
    emulatorUrl:
      (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL as string | undefined)?.trim() ?? '',
  },
}

export const isFirebaseClientConfigured = Boolean(
  webEnv.firebase.apiKey && webEnv.firebase.projectId,
)
