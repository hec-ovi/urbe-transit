import type { LayoutNode } from '../schema'

/** Renders declared elements once; components supply slots and event hooks. */
export function renderLayout(
  schema: LayoutNode,
  bindings: Record<string, string> = {},
  actions: Record<string, (event: Event) => void> = {},
  slots: Record<string, HTMLElement> = {},
): { el: HTMLElement; refs: Record<string, HTMLElement> } {
  const refs: Record<string, HTMLElement> = {}
  const render = (node: LayoutNode): HTMLElement => {
    const el = node.slot ? slots[node.slot] : document.createElement(node.tag ?? 'div')
    if (node.ref) refs[node.ref] = el
    if (node.className) el.className = node.className
    for (const [key, value] of Object.entries(node.attributes ?? {})) if (value !== undefined) el.setAttribute(key, value)
    const text = node.binding ? bindings[node.binding] : node.text
    if (text !== undefined) {
      if (el instanceof HTMLInputElement) el.value = text
      else el.textContent = text
    }
    if (node.action) el.addEventListener(node.event ?? 'click', actions[node.action])
    for (const child of node.children ?? []) el.append(render(child))
    return el
  }
  return { el: render(schema), refs }
}
