/** Simulation clock. Props: initial seconds. Event: onChange(t). Play advances one minute per frame. */
export class TimeBar {
  readonly el: HTMLElement
  private seconds: number
  private playing = false
  private readonly slider: HTMLInputElement
  private readonly readout: HTMLSpanElement

  constructor(initial: number, private readonly onChange: (t: number) => void) {
    this.seconds = initial
    this.el = document.createElement('div')
    this.el.className = 'time-bar'

    const play = document.createElement('button')
    play.textContent = 'Play'
    play.addEventListener('click', () => {
      this.playing = !this.playing
      play.textContent = this.playing ? 'Pause' : 'Play'
      if (this.playing) this.tick()
    })

    this.slider = document.createElement('input')
    this.slider.type = 'range'
    this.slider.min = '0'
    this.slider.max = String(24 * 3600)
    this.slider.step = '60'
    this.slider.value = String(initial)
    this.slider.addEventListener('input', () => this.set(Number(this.slider.value)))

    this.readout = document.createElement('span')
    this.readout.className = 'time-readout'

    this.el.append(play, this.slider, this.readout)
    this.set(initial)
  }

  get time(): number {
    return this.seconds
  }

  private set(t: number): void {
    this.seconds = t
    const hh = String(Math.floor(t / 3600) % 24).padStart(2, '0')
    const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
    this.readout.textContent = `${hh}:${mm}`
    this.slider.value = String(t)
    this.onChange(t)
  }

  private tick(): void {
    if (!this.playing) return
    this.set((this.seconds + 60) % (24 * 3600))
    requestAnimationFrame(() => this.tick())
  }
}
