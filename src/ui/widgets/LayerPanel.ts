import type { LayerId } from '../../types/output'
import { LAYER_COLORS } from '../colors'
import { Toggle } from '../components/Toggle'

/** Layer visibility list. Props: layers. Event: onChange(visible set). All layers start visible. */
export class LayerPanel {
  readonly el: HTMLElement
  private readonly visible = new Set<LayerId>()

  constructor(layers: { id: LayerId; name: string }[], onChange: (visible: ReadonlySet<LayerId>) => void) {
    this.el = document.createElement('div')
    this.el.className = 'layer-panel'
    const title = document.createElement('h2')
    title.textContent = 'Layers'
    this.el.append(title)
    for (const layer of layers) {
      this.visible.add(layer.id)
      const toggle = new Toggle(layer.name, LAYER_COLORS[layer.id], true, (checked) => {
        if (checked) this.visible.add(layer.id)
        else this.visible.delete(layer.id)
        onChange(this.visible)
      })
      this.el.append(toggle.el)
    }
  }

  get visibleLayers(): ReadonlySet<LayerId> {
    return this.visible
  }
}
