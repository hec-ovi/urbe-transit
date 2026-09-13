import type { V2 } from '../core/vec'

/** Removes exact shared subdivision seams from search outlines, leaving paving proofs unchanged. */
export function walkingBoundaries(polygons: V2[][]): V2[][] {
  const edges = new Map<string, { a: V2; b: V2; from: string; to: string }>()
  let joined = false
  for (const polygon of polygons) for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i], b = polygon[(i + 1) % polygon.length]
    const from = JSON.stringify(a), to = JSON.stringify(b)
    if (from === to) continue
    const key = JSON.stringify([from, to]), reverse = JSON.stringify([to, from])
    if (edges.has(key)) return polygons
    if (edges.delete(reverse)) joined = true
    else edges.set(key, { a, b, from, to })
  }
  if (!joined) return polygons
  const outgoing = new Map<string, { a: V2; b: V2; from: string; to: string }>()
  const incoming = new Set<string>()
  for (const edge of edges.values()) {
    if (outgoing.has(edge.from) || incoming.has(edge.to)) return polygons
    outgoing.set(edge.from, edge)
    incoming.add(edge.to)
  }
  if ([...outgoing.keys()].some(key => !incoming.has(key))) return polygons
  const boundaries: V2[][] = []
  while (outgoing.size) {
    const first = outgoing.values().next().value!
    const polygon: V2[] = []
    let edge = first
    do {
      polygon.push(edge.a)
      outgoing.delete(edge.from)
      if (edge.to === first.from) break
      const next = outgoing.get(edge.to)
      if (!next) return polygons
      edge = next
    } while (true)
    if (polygon.length < 3) return polygons
    boundaries.push(polygon)
  }
  return boundaries.length ? boundaries : polygons
}
