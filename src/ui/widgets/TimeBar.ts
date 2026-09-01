/** Simulation clock. Props: initial seconds. Event: onChange(t). Play advances one minute per frame. */
export class TimeBar {
  readonly el: HTMLElement
  private seconds: number
  private playing = false
  private readonly slider: HTMLInputElement
  private readonly readout: HTMLSpanElement
  private readonly playBtn: HTMLButtonElement

  constructor(initial: number, private readonly onChange: (t: number) => void) {
    this.seconds = initial
    this.el = document.createElement('div')
    this.el.className = 'time-bar'

    const header = document.createElement('div')
    header.className = 'time-bar-header'

    const titleGroup = document.createElement('div')
    titleGroup.className = 'time-title-group'

    const title = document.createElement('h2')
    title.textContent = 'Clock'

    this.readout = document.createElement('span')
    this.readout.className = 'time-readout'

    titleGroup.append(title)
    header.append(titleGroup, this.readout)

    const mainRow = document.createElement('div')
    mainRow.className = 'time-main-row'

    this.playBtn = document.createElement('button')
    this.playBtn.className = 'time-play-btn'
    this.playBtn.type = 'button'
    this.playBtn.textContent = 'Play'
    this.playBtn.setAttribute('aria-label', 'Toggle simulation clock playback')
    this.playBtn.addEventListener('click', () => {
      this.playing = !this.playing
      this.playBtn.textContent = this.playing ? 'Pause' : 'Play'
      if (this.playing) {
        this.playBtn.classList.add('is-playing')
        this.tick()
      } else {
        this.playBtn.classList.remove('is-playing')
      }
    })

    this.slider = document.createElement('input')
    this.slider.type = 'range'
    this.slider.min = '0'
    this.slider.max = String(24 * 3600)
    this.slider.step = '60'
    this.slider.value = String(initial)
    this.slider.setAttribute('aria-label', 'Simulation time')
    this.slider.addEventListener('input', () => this.set(Number(this.slider.value)))

    mainRow.append(this.playBtn, this.slider)

    const presetsRow = document.createElement('div')
    presetsRow.className = 'time-presets'

    const presets: [string, number, string][] = [
      ['08:00', 8 * 3600, 'Morning Rush'],
      ['12:00', 12 * 3600, 'Midday'],
      ['18:00', 18 * 3600, 'Evening Rush'],
      ['00:00', 0, 'Midnight'],
    ]

    for (const [label, sec, tooltip] of presets) {
      const btn = document.createElement('button')
      btn.className = 'btn-preset'
      btn.textContent = label
      btn.title = tooltip
      btn.type = 'button'
      btn.addEventListener('click', () => this.set(sec))
      presetsRow.append(btn)
    }

    this.el.append(header, mainRow, presetsRow)
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
