import type { LayerId } from '../../types/output'
import { LAYER_COLORS } from '../colors'
import layout from '../layout.json'
import { renderLayout } from '../ui/layout'
import { Toggle } from '../ui/Toggle'

/** Visibility state belongs to this widget; callbacks only change painting. */
export class LayerPanel {
  readonly el: HTMLElement
  private readonly visible = new Set<LayerId>()
  private readonly toggles = new Map<LayerId, Toggle>()
  private readonly count: HTMLElement

  constructor(layers: { id: LayerId; name: string }[], private readonly onChange: (visible: ReadonlySet<LayerId>) => void) {
    const rendered = renderLayout(layout.layers, {}, { all: () => this.setAll(true), none: () => this.setAll(false) })
    this.el = rendered.el
    this.count = rendered.refs.count
    for (const layer of layers) {
      this.visible.add(layer.id)
      const toggle = new Toggle(layer.name, LAYER_COLORS[layer.id], true, checked => {
        if (checked) this.visible.add(layer.id)
        else this.visible.delete(layer.id)
        this.changed()
      })
      this.toggles.set(layer.id, toggle)
      rendered.refs.list.append(toggle.el)
    }
    this.updateCount()
  }

  setAll(enabled: boolean): void {
    this.visible.clear()
    for (const [id, toggle] of this.toggles) { toggle.setChecked(enabled); if (enabled) this.visible.add(id) }
    this.changed()
  }

  private updateCount(): void { this.count.textContent = `${this.visible.size}/${this.toggles.size}` }
  private changed(): void { this.updateCount(); this.onChange(this.visible) }
  get visibleLayers(): ReadonlySet<LayerId> { return this.visible }
}
