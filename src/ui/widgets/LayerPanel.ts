import type { LayerId } from '../../types/output'
import { LAYER_COLORS } from '../colors'
import { Toggle } from '../components/Toggle'

/** Layer visibility list. Props: layers. Event: onChange(visible set). All layers start visible. */
export class LayerPanel {
  readonly el: HTMLElement
  private readonly visible = new Set<LayerId>()
  private readonly toggles = new Map<LayerId, Toggle>()
  private readonly countBadge: HTMLElement

  constructor(
    private readonly layers: { id: LayerId; name: string }[],
    private readonly onChange: (visible: ReadonlySet<LayerId>) => void,
  ) {
    this.el = document.createElement('div')
    this.el.className = 'layer-panel'

    const header = document.createElement('div')
    header.className = 'panel-header'

    const titleGroup = document.createElement('div')
    titleGroup.className = 'panel-title-group'

    const title = document.createElement('h2')
    title.textContent = 'Layers'

    this.countBadge = document.createElement('span')
    this.countBadge.className = 'panel-badge'
    this.countBadge.textContent = `${layers.length}/${layers.length}`

    titleGroup.append(title, this.countBadge)

    const actions = document.createElement('div')
    actions.className = 'panel-actions'

    const allBtn = document.createElement('button')
    allBtn.className = 'btn-tiny'
    allBtn.textContent = 'ALL'
    allBtn.title = 'Enable all layers'
    allBtn.type = 'button'
    allBtn.addEventListener('click', () => this.setAll(true))

    const noneBtn = document.createElement('button')
    noneBtn.className = 'btn-tiny'
    noneBtn.textContent = 'NONE'
    noneBtn.title = 'Disable all layers'
    noneBtn.type = 'button'
    noneBtn.addEventListener('click', () => this.setAll(false))

    actions.append(allBtn, noneBtn)
    header.append(titleGroup, actions)
    this.el.append(header)

    const list = document.createElement('div')
    list.className = 'layer-list'

    for (const layer of layers) {
      this.visible.add(layer.id)
      const toggle = new Toggle(layer.name, LAYER_COLORS[layer.id], true, (checked) => {
        if (checked) this.visible.add(layer.id)
        else this.visible.delete(layer.id)
        this.updateBadge()
        this.onChange(this.visible)
      })
      this.toggles.set(layer.id, toggle)
      list.append(toggle.el)
    }
    this.el.append(list)
  }

  setAll(enable: boolean): void {
    if (enable) {
      for (const layer of this.layers) this.visible.add(layer.id)
    } else {
      this.visible.clear()
    }
    for (const [, toggle] of this.toggles) {
      toggle.setChecked(enable)
    }
    this.updateBadge()
    this.onChange(this.visible)
  }

  private updateBadge(): void {
    this.countBadge.textContent = `${this.visible.size}/${this.layers.length}`
  }

  get visibleLayers(): ReadonlySet<LayerId> {
    return this.visible
  }
}
