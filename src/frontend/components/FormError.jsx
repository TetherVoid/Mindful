// Errors are stamped in the margin with a label, so the reason and the fact
// that something failed are legible without reading the sentence.
export default function FormError({ message, label = 'Error' }) {
  if (!message) return null
  return (
    <div className="form-error" role="alert">
      <strong>{label}</strong>
      <span>{message}</span>
    </div>
  )
}
