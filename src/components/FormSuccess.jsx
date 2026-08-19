export default function FormSuccess({ message, visible }) {
  if (!visible) return null

  return (
    <div className="form-success-banner" role="status">
      {message}
    </div>
  )
}
