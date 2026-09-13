import type { PreviewActions, PreviewInput } from '../schema'
import layout from '../layout.json'
import { renderLayout } from '../ui/layout'
import { ToastManager } from '../components/Toast'
import { LayerPanel } from '../widgets/LayerPanel'
import { TimeBar } from '../widgets/TimeBar'
import { MapView } from '../components/MapView'

/** Renders the preview schema with supplied data and actions. */
export class AppView {
  readonly el: HTMLElement
  private readonly map: MapView
  private readonly clock: TimeBar
  private readonly refs: Record<string, HTMLElement>
  private readonly toasts = new ToastManager()

  constructor(input: PreviewInput, actions: PreviewActions) {
    this.map = new MapView(input.atlas, input.output, actions.frameAt, viewport => {
      if (this.refs) this.refs.status.textContent = `SCALE: ${viewport.scale.toFixed(2)}x | X: ${Math.round(viewport.centerX)}, Z: ${Math.round(viewport.centerZ)}`
    })
    const panel = new LayerPanel(input.output.layers, visible => this.map.setVisible(visible))
    this.clock = new TimeBar(layout.initialTime, time => this.map.setTime(time))
    const rendered = renderLayout(layout.app, { seed: input.seed, source: input.source }, {
      generate: event => { event.preventDefault(); actions.generate((this.refs.seed as HTMLInputElement).value) },
      zoomIn: () => this.map.zoom(1.25), zoomOut: () => this.map.zoom(1 / 1.25), reset: () => this.map.resetView(),
    }, { map: this.map.el, layers: panel.el, clock: this.clock.el, toast: this.toasts.el })
    this.el = rendered.el
    this.refs = rendered.refs
    this.map.setVisible(panel.visibleLayers)
  }

  showMessage(message: string): void { this.toasts.show(message) }

  fit(): void { this.map.resize(this.refs.mapWrap.clientWidth || 1200, this.refs.mapWrap.clientHeight || 800) }

  dispose(): void { this.clock.dispose(); this.toasts.dispose() }
}
