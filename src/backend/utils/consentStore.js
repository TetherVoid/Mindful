import { STORAGE_KEYS } from '@shared/constants/storage'

// Reading the cookie-consent choice, and nothing else.
//
// Split out of consent.js to break a cycle that predates the layer split:
// consent.js needs to clear UTM values when a visitor declines, and utm.js
// needs to know whether they have declined before capturing anything. ES
// modules tolerate that loop through hoisting, so it worked — but a cycle in
// two files everything else depends on is a trap for anyone editing either.
//
// Anything that only needs to READ the choice imports this file. consent.js
// keeps the write side and the side effects.
export function getConsent() {
  return localStorage.getItem(STORAGE_KEYS.cookieConsent)
}

export function hasDeclined() {
  return getConsent() === 'declined'
}
