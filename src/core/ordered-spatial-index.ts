import { SpatialIndex } from './spatial-index'
import type { Bounds } from './spatial-index'

/** Complete overlap queries retain the source collection's stable order. */
export class OrderedSpatialIndex<T> {
  private readonly spatial: SpatialIndex<{ value: T; order: number }>

  constructor(values: readonly T[], bounds: (value: T) => Bounds) {
    this.spatial = new SpatialIndex(values.map((value, order) => ({ value, order })), entry => bounds(entry.value))
  }

  query(bounds: Bounds): T[] {
    return this.spatial.query(bounds).sort((a, b) => a.order - b.order).map(entry => entry.value)
  }
}
