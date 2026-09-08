import { STORAGE_KEYS } from '@shared/constants/storage'
import { clearStoredUtm } from './utm'
import { getConsent, hasDeclined } from './consentStore'

// The cookie-consent choice: reading it, recording it, and acting on it.
//
// The read side lives in consentStore.js and is re-exported here so every
// existing caller keeps the same import. See that file for why.
export { getConsent, hasDeclined }

export function setConsent(choice) {
  localStorage.setItem(STORAGE_KEYS.cookieConsent, choice)
}

// Declining also undoes any UTM capture already written at app boot, before
// the choice could be made.
export function applyConsentChoice(choice) {
  setConsent(choice)
  if (choice === 'declined') clearStoredUtm()
}
