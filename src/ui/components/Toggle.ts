/** Checkbox row with a color swatch. Props: label, color, checked. Event: onChange(checked). */
export class Toggle {
  readonly el: HTMLLabelElement

  constructor(label: string, color: string, checked: boolean, onChange: (checked: boolean) => void) {
    this.el = document.createElement('label')
    this.el.className = 'toggle'
    const input = document.createElement('input')
    input.type = 'checkbox'
    input.checked = checked
    input.addEventListener('change', () => onChange(input.checked))
    const swatch = document.createElement('span')
    swatch.className = 'toggle-swatch'
    swatch.style.background = color
    const text = document.createElement('span')
    text.textContent = label
    this.el.append(input, swatch, text)
  }
}
