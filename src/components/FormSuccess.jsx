export default function FormSuccess({ visible, message }) {
  if (!visible) return null
  return (
    <div className="form-ok" role="status">
      <strong>Logged</strong>
      <span>{message}</span>
    </div>
  )
}
