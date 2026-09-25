// localStorage keys used across the app.
//
// These are also read by the pre-paint script in index.html, which cannot
// import anything. Changing a key here means changing it there too — see
// AGENT_RULES.md § 3, Files that are coupled on purpose.
export const STORAGE_KEYS = {
  theme: 'theme',
  accentColor: 'accentColor',
  density: 'density',
  reduceMotion: 'reduceMotion',
  moodHistoryLength: 'moodHistoryLength',
  cookieConsent: 'cookie_consent',
  utmParams: 'utm_params',
}
