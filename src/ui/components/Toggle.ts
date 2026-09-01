/** Checkbox row with a color swatch. Props: label, color, checked. Event: onChange(checked). */
export class Toggle {
  readonly el: HTMLLabelElement
  readonly input: HTMLInputElement
  private readonly swatch: HTMLSpanElement
  private readonly labelText: HTMLSpanElement

  constructor(label: string, color: string, checked: boolean, onChange: (checked: boolean) => void) {
    this.el = document.createElement('label')
    this.el.className = 'toggle'
    if (checked) this.el.classList.add('is-checked')

    this.input = document.createElement('input')
    this.input.type = 'checkbox'
    this.input.checked = checked
    this.input.className = 'toggle-checkbox'
    this.input.addEventListener('change', () => {
      this.syncState()
      onChange(this.input.checked)
    })

    const customBox = document.createElement('span')
    customBox.className = 'toggle-box'

    this.swatch = document.createElement('span')
    this.swatch.className = 'toggle-swatch'
    this.swatch.style.backgroundColor = color
    this.swatch.style.color = color

    this.labelText = document.createElement('span')
    this.labelText.className = 'toggle-label'
    this.labelText.textContent = label

    this.el.append(this.input, customBox, this.swatch, this.labelText)
  }

  setChecked(checked: boolean): void {
    this.input.checked = checked
    this.syncState()
  }

  private syncState(): void {
    if (this.input.checked) {
      this.el.classList.add('is-checked')
    } else {
      this.el.classList.remove('is-checked')
    }
  }
}
