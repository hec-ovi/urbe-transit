import layout from '../layout.json'
import { renderLayout } from './layout'

/** Checkbox with one label and color, shared by every layer. */
export class Toggle {
  readonly el: HTMLElement
  readonly input: HTMLInputElement

  constructor(label: string, color: string, checked: boolean, onChange: (checked: boolean) => void) {
    const rendered = renderLayout(layout.toggle, { label }, { change: () => {
      this.setChecked(this.input.checked)
      onChange(this.input.checked)
    } })
    this.el = rendered.el
    this.input = rendered.refs.input as HTMLInputElement
    rendered.refs.swatch.style.backgroundColor = color
    rendered.refs.swatch.style.color = color
    this.setChecked(checked)
  }

  setChecked(checked: boolean): void {
    this.input.checked = checked
    this.el.classList.toggle('is-checked', checked)
  }
}
