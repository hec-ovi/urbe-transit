import { generate } from '../../generate'
import type { AtlasBlueprint } from '../../types/atlas'
import { ToastManager, toast } from '../components/Toast'
import { LayerPanel } from '../widgets/LayerPanel'
import { TimeBar } from '../widgets/TimeBar'
import { MapView, type ViewportState } from './MapView'

const INITIAL_TIME = 8 * 3600

/** Root preview: seed input, layer panel, clock, map canvas, HUD controls, and toasts. */
export class AppView {
  readonly el: HTMLElement
  private map!: MapView
  private mapWrap!: HTMLElement
  private hudStatus!: HTMLElement
  private readonly toasts: ToastManager

  constructor(
    private readonly atlas: AtlasBlueprint,
    initialSeed: string,
    private readonly source = 'fixture city',
  ) {
    this.el = document.createElement('div')
    this.el.className = 'app'
    this.toasts = ToastManager.get()
    this.buildFor(initialSeed)
  }

  private buildFor(seed: string): void {
    this.el.replaceChildren()
    const output = generate(this.atlas, { seed })

    const side = document.createElement('aside')
    side.className = 'sidebar'

    // Sidebar Header
    const brandHeader = document.createElement('div')
    brandHeader.className = 'sidebar-brand'

    const title = document.createElement('h1')
    title.textContent = 'CONNECTIONS'

    const versionBadge = document.createElement('span')
    versionBadge.className = 'badge-tag'
    versionBadge.textContent = '2D PREVIEW'

    brandHeader.append(title, versionBadge)

    // Source Tag
    const sourceWrap = document.createElement('div')
    sourceWrap.className = 'source-wrap'

    const sourceStatusDot = document.createElement('span')
    sourceStatusDot.className = 'status-dot'

    const sourceLine = document.createElement('p')
    sourceLine.className = 'source-line'
    sourceLine.textContent = this.source

    sourceWrap.append(sourceStatusDot, sourceLine)

    // Seed Input Control
    const seedSection = document.createElement('div')
    seedSection.className = 'seed-section'

    const seedLabel = document.createElement('label')
    seedLabel.className = 'section-label'
    seedLabel.htmlFor = 'seed-input'
    seedLabel.textContent = 'Seed Generator'

    const seedRow = document.createElement('div')
    seedRow.className = 'seed-row'

    const seedInput = document.createElement('input')
    seedInput.id = 'seed-input'
    seedInput.type = 'text'
    seedInput.value = seed
    seedInput.setAttribute('aria-label', 'seed')
    seedInput.setAttribute('placeholder', 'Enter seed...')
    seedInput.setAttribute('spellcheck', 'false')
    seedInput.setAttribute('autocomplete', 'off')

    const regen = document.createElement('button')
    regen.className = 'btn-generate'
    regen.textContent = 'Generate'
    regen.type = 'button'
    regen.addEventListener('click', () => {
      const nextSeed = seedInput.value.trim() || 'seed'
      this.buildFor(nextSeed)
      toast(`Regenerated preview with seed "${nextSeed}"`, { type: 'success' })
    })

    seedInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        regen.click()
      }
    })

    seedRow.append(seedInput, regen)
    seedSection.append(seedLabel, seedRow)

    // Map View & HUD
    this.map = new MapView(this.atlas, output, (vp) => this.updateHud(vp))
    const panel = new LayerPanel(output.layers, (visible) => {
      this.map.setVisible(visible)
      this.updateHudLayerCount(visible.size, output.layers.length)
    })
    const timeBar = new TimeBar(INITIAL_TIME, (t) => this.map.setTime(t))

    side.append(brandHeader, sourceWrap, seedSection, panel.el, timeBar.el)

    // Main map area
    this.mapWrap = document.createElement('main')
    this.mapWrap.className = 'map-wrap'

    // Floating Map HUD Controls
    const hudControls = document.createElement('div')
    hudControls.className = 'map-hud-controls'

    const zoomInBtn = document.createElement('button')
    zoomInBtn.className = 'btn-hud'
    zoomInBtn.textContent = '+'
    zoomInBtn.title = 'Zoom in (+)'
    zoomInBtn.type = 'button'
    zoomInBtn.addEventListener('click', () => this.map.zoom(1.25))

    const zoomOutBtn = document.createElement('button')
    zoomOutBtn.className = 'btn-hud'
    zoomOutBtn.textContent = '−'
    zoomOutBtn.title = 'Zoom out (−)'
    zoomOutBtn.type = 'button'
    zoomOutBtn.addEventListener('click', () => this.map.zoom(1 / 1.25))

    const resetBtn = document.createElement('button')
    resetBtn.className = 'btn-hud'
    resetBtn.textContent = 'RESET'
    resetBtn.title = 'Reset view (0 / R)'
    resetBtn.type = 'button'
    resetBtn.addEventListener('click', () => {
      this.map.resetView()
      toast('Viewport reset to default bounds', { type: 'info' })
    })

    hudControls.append(zoomInBtn, zoomOutBtn, resetBtn)

    // Floating Map Status Readout
    this.hudStatus = document.createElement('div')
    this.hudStatus.className = 'map-hud-status'
    this.hudStatus.textContent = `SCALE: 1.00x | ${output.layers.length}/${output.layers.length} LAYERS`

    this.mapWrap.append(this.map.el, hudControls, this.hudStatus)

    // Append to root element
    this.el.append(side, this.mapWrap, this.toasts.el)

    this.map.setVisible(panel.visibleLayers)
    this.map.setTime(timeBar.time)
    this.fit()
  }

  private updateHud(vp: ViewportState): void {
    if (!this.hudStatus) return
    const activeLayers = this.map.el.dataset.visibleLayers ? this.map.el.dataset.visibleLayers.split(',').filter(Boolean).length : 0
    this.hudStatus.textContent = `SCALE: ${vp.scale.toFixed(2)}x | X: ${Math.round(vp.centerX)}, Z: ${Math.round(vp.centerZ)} | ${activeLayers} ACTIVE`
  }

  private updateHudLayerCount(active: number, total: number): void {
    if (!this.hudStatus) return
    const text = this.hudStatus.textContent || ''
    const parts = text.split('|')
    if (parts.length >= 2) {
      this.hudStatus.textContent = `${parts[0].trim()} | ${parts[1].trim()} | ${active}/${total} ACTIVE`
    } else {
      this.hudStatus.textContent = `${active}/${total} ACTIVE`
    }
  }

  /** Match the canvas to its container; call on mount and window resize. */
  fit(): void {
    const w = this.mapWrap.clientWidth || 1200
    const h = this.mapWrap.clientHeight || 800
    this.map.resize(w, h)
  }
}
