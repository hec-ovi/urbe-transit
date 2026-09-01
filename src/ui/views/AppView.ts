import { generate } from '../../generate'
import type { AtlasBlueprint } from '../../types/atlas'
import { LayerPanel } from '../widgets/LayerPanel'
import { TimeBar } from '../widgets/TimeBar'
import { MapView } from './MapView'

const INITIAL_TIME = 8 * 3600

/** Root preview: seed input, layer panel, clock and the map. */
export class AppView {
  readonly el: HTMLElement
  private map!: MapView
  private mapWrap!: HTMLElement

  constructor(private readonly atlas: AtlasBlueprint, initialSeed: string) {
    this.el = document.createElement('div')
    this.el.className = 'app'
    this.buildFor(initialSeed)
  }

  private buildFor(seed: string): void {
    this.el.replaceChildren()
    const output = generate(this.atlas, { seed })

    const side = document.createElement('aside')
    side.className = 'sidebar'
    const title = document.createElement('h1')
    title.textContent = 'connections'
    const seedRow = document.createElement('div')
    seedRow.className = 'seed-row'
    const seedInput = document.createElement('input')
    seedInput.type = 'text'
    seedInput.value = seed
    seedInput.setAttribute('aria-label', 'seed')
    const regen = document.createElement('button')
    regen.textContent = 'Generate'
    regen.addEventListener('click', () => this.buildFor(seedInput.value || 'seed'))
    seedRow.append(seedInput, regen)

    this.map = new MapView(this.atlas, output)
    const panel = new LayerPanel(output.layers, (visible) => this.map.setVisible(visible))
    const timeBar = new TimeBar(INITIAL_TIME, (t) => this.map.setTime(t))
    side.append(title, seedRow, panel.el, timeBar.el)

    this.mapWrap = document.createElement('main')
    this.mapWrap.className = 'map-wrap'
    this.mapWrap.append(this.map.el)
    this.el.append(side, this.mapWrap)

    this.map.setVisible(panel.visibleLayers)
    this.map.setTime(timeBar.time)
    this.fit()
  }

  /** Match the canvas to its container; call on mount and window resize. */
  fit(): void {
    const w = this.mapWrap.clientWidth || 1200
    const h = this.mapWrap.clientHeight || 800
    this.map.resize(w, h)
  }
}
