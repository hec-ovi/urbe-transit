export type ToastType = 'info' | 'success' | 'warning'

export interface ToastOptions {
  durationMs?: number
  type?: ToastType
}

/**
 * Toast Notification System with square corners, slide/fade transitions, and dark technical styling.
 */
export class ToastManager {
  private static instance: ToastManager | null = null
  readonly el: HTMLElement

  constructor() {
    this.el = document.createElement('div')
    this.el.className = 'toast-container'
    this.el.setAttribute('aria-live', 'polite')
    this.el.setAttribute('aria-atomic', 'true')
  }

  static get(): ToastManager {
    if (!ToastManager.instance) {
      ToastManager.instance = new ToastManager()
    }
    return ToastManager.instance
  }

  show(message: string, options: ToastOptions = {}): HTMLElement {
    const { durationMs = 2800, type = 'info' } = options
    const toast = document.createElement('div')
    toast.className = `toast toast-${type}`

    const badge = document.createElement('span')
    badge.className = 'toast-badge'
    badge.textContent = type === 'success' ? 'OK' : type === 'warning' ? 'WARN' : 'SYS'

    const text = document.createElement('span')
    text.className = 'toast-message'
    text.textContent = message

    const closeBtn = document.createElement('button')
    closeBtn.className = 'toast-close'
    closeBtn.setAttribute('aria-label', 'Dismiss notification')
    closeBtn.textContent = '×'

    let timer: number | undefined

    const dismiss = () => {
      if (timer) clearTimeout(timer)
      toast.classList.add('toast-exit')
      toast.addEventListener(
        'animationend',
        () => {
          toast.remove()
        },
        { once: true },
      )
      // Fallback removal if animationend doesn't fire (e.g. in test environment)
      setTimeout(() => toast.remove(), 200)
    }

    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation()
      dismiss()
    })

    toast.append(badge, text, closeBtn)
    this.el.appendChild(toast)

    if (durationMs > 0) {
      timer = window.setTimeout(dismiss, durationMs)
    }

    return toast
  }
}

export const toast = (message: string, options?: ToastOptions) => ToastManager.get().show(message, options)
