import { Component } from 'react'
import type { ReactNode } from 'react'

/** One screen failing to draw shows a way out instead of taking the whole page down to white. */
export default class ScreenBoundary extends Component<{ children: ReactNode; name: string }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return <div className="panel"><div className="panel-body">
      <b>{this.props.name}没有打开</b>
      <p className="small muted">网站刚更新过，或者网络断了一下。刷新一下就好。</p>
      <button className="primary sm" onClick={() => location.reload()}>刷新页面</button>
    </div></div>
  }
}
