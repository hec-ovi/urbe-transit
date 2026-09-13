import layout from '../layout.json'
import { renderLayout } from '../ui/layout'

/** Preview clock state; emits seconds without computing signal or vehicle behavior. */
export class TimeBar {
  readonly el: HTMLElement
  private seconds: number
  private frame?: number
  private playing = false
  private readonly slider: HTMLInputElement
  private readonly readout: HTMLElement
  private readonly play: HTMLElement

  constructor(initial: number, private readonly onChange: (seconds: number) => void) {
    this.seconds = initial
    const rendered = renderLayout(layout.clock, {}, {
      play: () => this.togglePlayback(),
      time: event => this.set(Number((event.target as HTMLInputElement).value)),
      preset: event => this.set(Number((event.currentTarget as HTMLButtonElement).value)),
    })
    this.el = rendered.el
    this.slider = rendered.refs.slider as HTMLInputElement
    this.readout = rendered.refs.readout
    this.play = rendered.refs.play
    this.set(initial)
  }

  get time(): number { return this.seconds }

  dispose(): void {
    this.playing = false
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
  }

  private set(seconds: number): void {
    this.seconds = seconds
    const hh = String(Math.floor(seconds / 3600) % 24).padStart(2, '0')
    const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0')
    this.readout.textContent = `${hh}:${mm}`
    this.slider.value = String(seconds)
    this.onChange(seconds)
  }

  private togglePlayback(): void {
    if (this.playing) this.dispose()
    else { this.playing = true; this.tick() }
    this.play.textContent = this.playing ? layout.clockLabels.pause : layout.clockLabels.play
    this.play.classList.toggle('is-playing', this.playing)
  }

  private tick(): void {
    if (!this.playing) return
    this.set((this.seconds + Number(this.slider.step)) % Number(this.slider.max))
    this.frame = requestAnimationFrame(() => this.tick())
  }
}
