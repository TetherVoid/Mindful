import { Component } from 'react'
import { isChunkLoadError, reloadOnce } from './chunkReload'

// Catches a render error and prints a page in its place, instead of letting
// React unmount the whole app to a blank screen.
//
// Two placements, set by `level`:
//   'route'  inside the layout, around one page. The index rail and the
//            colophon — and the support line in it — stay on screen.
//            `resetKey` is the pathname, so moving to another page clears it.
//   'root'   around everything, for a failure in the layout or the providers.
//            Uses plain links, because the router may be what failed.
//
// The error goes to the console and nowhere else. No stack trace is shown: it
// means nothing to a reader and can name things that are nobody's business.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { error: null, reloading: false, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  // Navigating to another page clears a caught error, so a failure on one page
  // does not follow the reader to the next.
  static getDerivedStateFromProps(props, state) {
    if (props.resetKey !== state.resetKey) {
      return { error: null, reloading: false, resetKey: props.resetKey }
    }
    return null
  }

  componentDidCatch(error) {
    console.error('[mindful] a page failed to render:', error)
    // A chunk from an older deploy: one reload usually fixes it outright.
    if (isChunkLoadError(error) && reloadOnce()) this.setState({ reloading: true })
  }

  render() {
    const { error, reloading } = this.state
    if (!error) return this.props.children
    if (reloading) {
      return (
        <div className="page-loading" role="status" aria-live="polite">
          Fetching the newest edition
        </div>
      )
    }

    const chunk = isChunkLoadError(error)
    const title = chunk ? 'A newer edition is available' : 'This page could not be set'
    const message = chunk
      ? 'Mindful was updated while this page was open. Reloading will bring in the new edition. Nothing you saved is lost.'
      : 'Something went wrong while this page was being put together. Anything you had already saved is safe.'

    const panel = (
      <section className="panel" role="alert">
        <div className="panel-head">
          <span className="panel-head-num">§ —</span>
          <h2>{title}</h2>
        </div>
        <p className="empty-state">{message}</p>
        <div className="brief-actions">
          <button type="button" className="btn btn--solid" onClick={() => window.location.reload()}>
            Reload
          </button>
          <a className="btn btn--quiet" href="/dashboard">
            Return to the day sheet
          </a>
        </div>
      </section>
    )

    if (this.props.level === 'root') {
      return (
        <main id="main-content" className="standalone">
          <div className="folio">{panel}</div>
        </main>
      )
    }
    return <div className="folio">{panel}</div>
  }
}
