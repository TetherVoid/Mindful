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
