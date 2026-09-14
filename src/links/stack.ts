import type { Parcel, ParcelType } from '../types/atlas'

/**
 * Floor-height families and the stack recipe, mirrored from ../exterior/schemas/floor-constants.json.
 * Exterior pins a floor's walking surface at every aperture base, so the bases on one building only
 * work if some stack of that family's floor heights lands on all of them at once.
 */
const FAMILY: Record<ParcelType, string> = {
  residential: 'residential',
  hotel: 'hotel',
  offices: 'office',
  corpo: 'corpo',
  hospital: 'hospital',
  clinic: 'hospital',
  police: 'security',
  military: 'security',
  factory: 'industrial',
  commerce: 'commerce',
  mall: 'commerce',
  restaurant: 'commerce',
  coffee_shop: 'commerce',
}

const FLOOR_HEIGHTS: Record<string, { min: number; max: number }> = {
  residential: { min: 2.6, max: 4.5 },
  hotel: { min: 2.8, max: 5.0 },
  office: { min: 3.4, max: 6.0 },
  corpo: { min: 3.6, max: 6.5 },
  hospital: { min: 3.8, max: 6.0 },
  security: { min: 3.0, max: 5.0 },
  industrial: { min: 4.5, max: 12.0 },
  commerce: { min: 3.0, max: 6.0 },
}

/** Mirrored generation policy: 4 m clear height and 0.5 m slab/ceiling allowance. */
export const DEFAULT_FLOOR_HEIGHT = 4.5

const EPS = 1e-9

/** One aperture as the stack sees it: where its floor is pinned and how tall that floor must be. */
export interface StackBase {
  base: number
  height: number
}

/** Floor heights the family of this parcel type builds with. */
export function floorHeights(type: ParcelType): { min: number; max: number } {
  const { min, max } = FLOOR_HEIGHTS[FAMILY[type]] ?? FLOOR_HEIGHTS.residential
  return { min: Math.max(min, DEFAULT_FLOOR_HEIGHT), max }
}

/**
 * Floor counts these bases admit inside the envelope, or null when no stack fits them at all.
 * Negative bases must admit basement floors up to ground without moving any base.
 */
export function admissibleFloors(parcel: Parcel, bases: readonly StackBase[]): { lo: number; hi: number } | null {
  const { min, max } = floorHeights(parcel.type)
  const tallest = new Map<number, number>()
  for (const b of bases) {
    tallest.set(b.base, Math.max(tallest.get(b.base) ?? 0, b.height))
  }
  const basement = [...tallest.keys()].filter(base => base < -EPS).sort((x, y) => x - y)
  for (let i = 0; i < basement.length; i++) {
    const base = basement[i]
    const gap = (basement[i + 1] ?? 0) - base
    const need = Math.max(tallest.get(base)!, min)
    if (!gapFloors(gap, need, min, max)) return null
  }
  let lo = 0
  let hi = 0
  let prev = 0
  let need = Math.max(tallest.get(0) ?? 0, min)
  for (const base of [...tallest.keys()].filter(base => base > EPS).sort((x, y) => x - y)) {
    const gap = base - prev
    const floors = gapFloors(gap, need, min, max)
    if (!floors) return null
    lo += floors.lo
    hi += floors.hi
    prev = base
    need = Math.max(tallest.get(base)!, min)
  }
  const room = parcel.envelope.maxHeight - prev
  if (need > max + EPS || room < need - EPS) return null
  return { lo: lo + 1, hi: hi + 1 + Math.floor((room - need) / min + EPS) }
}

function gapFloors(gap: number, need: number, min: number, max: number): { lo: number; hi: number } | null {
  if (need > max + EPS || gap < need - EPS) return null
  const lo = Math.ceil(gap / max - EPS)
  const hi = need > min + EPS ? 1 + Math.floor((gap - need) / min + EPS) : Math.floor(gap / min + EPS)
  return lo <= hi ? { lo, hi } : null
}

/** True when some admissible floor count is one the parcel envelope allows. */
export function stackFits(parcel: Parcel, bases: readonly StackBase[]): boolean {
  const range = admissibleFloors(parcel, bases)
  if (!range) return false
  return range.hi >= parcel.envelope.minFloors && range.lo <= parcel.envelope.maxFloors
}
