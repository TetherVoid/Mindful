import { Component } from 'react'

// Generic fallback-to-nothing boundary — used for decorative content
// (the 3D scene) where failing quietly is better than breaking the page.
export default class SilentErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error) {
    console.error('Decorative content failed to render:', error)
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}
