// The password rule, in one place.
//
// Supabase enforces a minimum length server-side (Authentication -> Policies),
// and that is the check that actually counts — this one exists so the person
// typing gets told before a round trip, and so sign-up and change-password
// cannot drift apart on what they accept.
//
// Length is the only rule. Composition requirements ("one capital, one digit,
// one symbol") reliably produce Passw0rd! and nothing better; NIST dropped them
// in SP 800-63B for exactly that reason.

export const MIN_PASSWORD_LENGTH = 10

// bcrypt, which is what Supabase's auth schema uses, silently truncates at 72
// bytes. Refusing longer input is honest; accepting it and ignoring the tail is
// not.
export const MAX_PASSWORD_LENGTH = 72

/**
 * @param {string} password
 * @returns {string|null} the reason it is unusable, or null if it is fine
 */
export function describePasswordProblem(password) {
  const value = String(password ?? '')
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Use at least ${MIN_PASSWORD_LENGTH} characters.`
  }
  if (new TextEncoder().encode(value).length > MAX_PASSWORD_LENGTH) {
    return `That is longer than ${MAX_PASSWORD_LENGTH} bytes, which is more than the hash can hold.`
  }
  if (value.trim().length === 0) {
    return 'A password of only spaces is not one.'
  }
  return null
}

/** Throws with a readable message if the password cannot be used. */
export function assertUsablePassword(password) {
  const problem = describePasswordProblem(password)
  if (problem) throw new Error(problem)
}
