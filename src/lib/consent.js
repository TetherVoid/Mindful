import { clearStoredUtm } from './utm'

const CONSENT_KEY = 'cookie_consent'

export function getConsent() {
  return localStorage.getItem(CONSENT_KEY)
}

export function setConsent(choice) {
  localStorage.setItem(CONSENT_KEY, choice)
}

export function hasDeclined() {
  return getConsent() === 'declined'
}

// Declining also undoes any UTM capture already written at app boot, before
// the choice could be made.
export function applyConsentChoice(choice) {
  setConsent(choice)
  if (choice === 'declined') clearStoredUtm()
}
