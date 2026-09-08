export type Bounds = { minX: number; minZ: number; maxX: number; maxZ: number }
type Entry<T> = Bounds & { value: T }
type Node<T> = Bounds & { entries?: Entry<T>[]; left?: Node<T>; right?: Node<T> }

const overlaps = (a: Bounds, b: Bounds): boolean =>
  a.minX <= b.maxX && a.maxX >= b.minX && a.minZ <= b.maxZ && a.maxZ >= b.minZ

/** Complete ground-plane bounding rectangles with no size or center restriction. */
export class SpatialIndex<T> {
  private readonly root?: Node<T>

  constructor(values: readonly T[], bounds: (value: T) => Bounds) {
    if (values.length) this.root = this.build(values.map(value => ({ ...bounds(value), value })))
  }

  query(bounds: Bounds): T[] {
    const result: T[] = []
    const visit = (node: Node<T>): void => {
      if (!overlaps(node, bounds)) return
      if (node.entries) {
        for (const entry of node.entries) if (overlaps(entry, bounds)) result.push(entry.value)
      } else {
        visit(node.left!)
        visit(node.right!)
      }
    }
    if (this.root) visit(this.root)
    return result
  }

  private build(entries: Entry<T>[]): Node<T> {
    const bounds = { minX: Infinity, minZ: Infinity, maxX: -Infinity, maxZ: -Infinity }
    for (const entry of entries) {
      bounds.minX = Math.min(bounds.minX, entry.minX)
      bounds.minZ = Math.min(bounds.minZ, entry.minZ)
      bounds.maxX = Math.max(bounds.maxX, entry.maxX)
      bounds.maxZ = Math.max(bounds.maxZ, entry.maxZ)
    }
    if (entries.length <= 8) return { ...bounds, entries }
    const xAxis = bounds.maxX - bounds.minX >= bounds.maxZ - bounds.minZ
    entries.sort(xAxis
      ? (a, b) => (a.minX + a.maxX) - (b.minX + b.maxX)
      : (a, b) => (a.minZ + a.maxZ) - (b.minZ + b.maxZ))
    const middle = Math.floor(entries.length / 2)
    return { ...bounds, left: this.build(entries.slice(0, middle)), right: this.build(entries.slice(middle)) }
  }
}
