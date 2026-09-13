import layout from '../layout.json'
import { renderLayout } from '../ui/layout'

/** Per-preview dismissible messages, with timers released on disposal. */
export class ToastManager {
  readonly el = renderLayout(layout.toast).el
  private readonly timers = new Set<number>()

  show(message: string): void {
    const rendered = renderLayout(layout.notification, { message }, { dismiss: () => dismiss() })
    const dismiss = (): void => { clearTimeout(timer); this.timers.delete(timer); rendered.el.remove() }
    const timer = window.setTimeout(dismiss, 2800)
    this.timers.add(timer)
    this.el.append(rendered.el)
  }

  dispose(): void {
    for (const timer of this.timers) clearTimeout(timer)
    this.timers.clear()
    this.el.replaceChildren()
  }
}
