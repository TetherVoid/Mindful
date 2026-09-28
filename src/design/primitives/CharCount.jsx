// A quiet character count under a text field.
//
// Hidden until the writer is within a fifth of the limit, so it never nags a
// short entry; from there it counts toward the limit, which the field itself
// (maxLength) enforces. The database holds the same limit, so this is a
// courtesy, not the control.
export default function CharCount({ value, max, id }) {
  const length = value?.length ?? 0
  if (length < max * 0.8) return null
  return (
    <span id={id} className={length >= max ? 'char-count char-count--full' : 'char-count'} aria-live="polite">
      {length.toLocaleString()} / {max.toLocaleString()}
    </span>
  )
}
