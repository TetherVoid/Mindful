import { hasDeclined } from './consent'

const STORAGE_KEY = 'utm_params'
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']

export function captureUtmParams() {
  if (localStorage.getItem(STORAGE_KEY)) return
  if (hasDeclined()) return

  const params = new URLSearchParams(window.location.search)
  const found = {}
  let hasAny = false

  for (const key of UTM_KEYS) {
    const value = params.get(key)
    if (value) {
      found[key] = value
      hasAny = true
    }
  }

  if (hasAny) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(found))
  }
}

export function clearStoredUtm() {
  localStorage.removeItem(STORAGE_KEY)
}

export function getStoredUtm() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
