import type { AtlasBlueprint } from '../../types/atlas'
import type { ConnectionsOutput, LayerId } from '../../types/output'
import { paintAir, paintAtlas, paintLinks, paintRoad, paintSignals, paintTransit, paintWalk, type Frame } from './painters'

/** Pan and zoom 2D map of the atlas base with every connections layer over it. */
export class MapView {
  readonly el: HTMLCanvasElement
  private visible: ReadonlySet<LayerId> = new Set()
  private time = 8 * 3600
  private scale = 2
  private centerX = 0
  private centerZ = 0
  private dragging = false
  private fitted = false

  constructor(
    private readonly atlas: AtlasBlueprint,
    private readonly output: ConnectionsOutput,
  ) {
    this.el = document.createElement('canvas')
    this.el.className = 'map-view'
    const { min, max } = atlas.meta.bounds
    this.centerX = (min[0] + max[0]) / 2
    this.centerZ = (min[1] + max[1]) / 2
    this.bindPointer()
    this.syncVisibleAttr()
  }

  setVisible(layers: ReadonlySet<LayerId>): void {
    this.visible = new Set(layers)
    this.syncVisibleAttr()
    this.render()
  }

  setTime(t: number): void {
    this.time = t
    this.render()
  }

  resize(width: number, height: number): void {
    this.el.width = width
    this.el.height = height
    if (!this.fitted) {
      this.fitted = true
      const { min, max } = this.atlas.meta.bounds
      const spanX = Math.max(1, max[0] - min[0])
      const spanZ = Math.max(1, max[1] - min[1])
      this.scale = Math.min(40, Math.max(0.05, 0.92 * Math.min(width / spanX, height / spanZ)))
    }
    this.render()
  }

  render(): void {
    const ctx = this.el.getContext('2d')
    if (!ctx) return
    const { width, height } = this.el
    ctx.fillStyle = '#14161a'
    ctx.fillRect(0, 0, width, height)
    const f: Frame = {
      ctx,
      scale: this.scale,
      toScreen: (x, z) => [
        width / 2 + (x - this.centerX) * this.scale,
        height / 2 + (z - this.centerZ) * this.scale,
      ],
    }
    paintAtlas(f, this.atlas)
    const on = (id: LayerId) => this.visible.has(id)
    if (on('links.tunnels')) paintLinks(f, this.output, 'tunnel', 'links.tunnels')
    if (on('walk')) paintWalk(f, this.output, this.time)
    if (on('road')) paintRoad(f, this.output)
    if (on('transit.train')) paintTransit(f, this.output, 'train', 'transit.train', this.time)
    if (on('transit.subway')) paintTransit(f, this.output, 'subway', 'transit.subway', this.time)
    if (on('transit.bus')) paintTransit(f, this.output, 'bus', 'transit.bus', this.time)
    if (on('links.wires')) paintLinks(f, this.output, 'wire', 'links.wires')
    if (on('links.acTubes')) paintLinks(f, this.output, 'ac-tube', 'links.acTubes')
    if (on('links.bridges')) paintLinks(f, this.output, 'bridge', 'links.bridges')
    if (on('signals')) paintSignals(f, this.output, this.atlas, this.time)
    if (on('air')) paintAir(f, this.output)
  }

  /** Visible layers mirrored to a data attribute so state is observable without canvas access. */
  private syncVisibleAttr(): void {
    this.el.dataset.visibleLayers = [...this.visible].sort().join(',')
  }

  private bindPointer(): void {
    this.el.addEventListener('wheel', (e) => {
      e.preventDefault()
      const factor = e.deltaY < 0 ? 1.15 : 1 / 1.15
      this.scale = Math.min(40, Math.max(0.05, this.scale * factor))
      this.render()
    })
    this.el.addEventListener('pointerdown', (e) => {
      this.dragging = true
      this.el.setPointerCapture(e.pointerId)
    })
    this.el.addEventListener('pointerup', () => {
      this.dragging = false
    })
    this.el.addEventListener('pointermove', (e) => {
      if (!this.dragging) return
      this.centerX -= e.movementX / this.scale
      this.centerZ -= e.movementY / this.scale
      this.render()
    })
  }
}
