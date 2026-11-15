export type ThemeChoice = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'solilo-color-scheme'

function updateMetaColorScheme(choice: ThemeChoice): void {
  if (typeof document === 'undefined') return
  let meta = document.querySelector('meta[name="color-scheme"]') as HTMLMetaElement | null
  if (!meta) {
    meta = document.createElement('meta')
    meta.name = 'color-scheme'
    document.head.prepend(meta)
  }
  meta.content = choice === 'system' ? 'light dark' : choice
}

export function readStoredThemeChoice(): ThemeChoice {
  if (typeof window === 'undefined') return 'system'
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark') return raw
  } catch {
    // Ignore blocked storage
  }
  return 'system'
}

export function applyThemeChoice(choice: ThemeChoice): void {
  updateMetaColorScheme(choice)
  if (typeof window === 'undefined') return
  try {
    if (choice === 'system') {
      localStorage.removeItem(STORAGE_KEY)
    } else {
      localStorage.setItem(STORAGE_KEY, choice)
    }
  } catch {
    // Still applied to meta even if localStorage is unavailable
  }
}

export function subscribeThemeStorageSync(onChange: (choice: ThemeChoice) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const handler = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY) return
    const next =
      event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : 'system'
    updateMetaColorScheme(next)
    onChange(next)
  }
  window.addEventListener('storage', handler)
  return () => window.removeEventListener('storage', handler)
}
