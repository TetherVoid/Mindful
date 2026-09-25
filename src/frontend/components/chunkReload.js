// Recovering from a page chunk that will not load.
//
// Every signed-in page is a lazy chunk with a hashed filename. When a new
// version is deployed while someone has the app open, the chunks their tab
// knows about are gone from the server, and the next page they open fails to
// import. One reload fetches the new index and fixes it. Two reloads in a row
// means something else is wrong, so the second failure is shown instead of
// reloading again — a reload loop is worse than an error page.

const KEY = 'mindful:chunk-reload-at'
const WINDOW_MS = 10_000

const CHUNK_ERROR =
  /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|ChunkLoadError/i

export function isChunkLoadError(error) {
  if (!error) return false
  return error.name === 'ChunkLoadError' || CHUNK_ERROR.test(String(error.message ?? error))
}

/**
 * Reloads the page unless it already did so in the last few seconds.
 * Returns true if a reload was started.
 */
export function reloadOnce() {
  let last = 0
  try {
    last = Number(sessionStorage.getItem(KEY)) || 0
  } catch {
    // Storage can throw (private mode, blocked site data). Without it there is
    // no way to tell a first failure from a loop, so do not reload at all.
    return false
  }
  if (Date.now() - last < WINDOW_MS) return false
  try {
    sessionStorage.setItem(KEY, String(Date.now()))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
