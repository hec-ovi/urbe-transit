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

const EPS = 1e-9

/** One aperture as the stack sees it: where its floor is pinned and how tall that floor must be. */
export interface StackBase {
  base: number
  height: number
}

/** Floor heights the family of this parcel type builds with. */
export function floorHeights(type: ParcelType): { min: number; max: number } {
  return FLOOR_HEIGHTS[FAMILY[type]] ?? FLOOR_HEIGHTS.residential
}

/**
 * Floor counts these bases admit inside the envelope, or null when no stack fits them at all.
 * Bases at or below the ground plane are basements and pin nothing above.
 */
export function admissibleFloors(parcel: Parcel, bases: readonly StackBase[]): { lo: number; hi: number } | null {
  const { min, max } = floorHeights(parcel.type)
  const tallest = new Map<number, number>()
  for (const b of bases) {
    if (b.base <= EPS) continue
    tallest.set(b.base, Math.max(tallest.get(b.base) ?? 0, b.height))
  }
  let lo = 0
  let hi = 0
  let prev = 0
  let need = min
  for (const base of [...tallest.keys()].sort((x, y) => x - y)) {
    const gap = base - prev
    if (need > max + EPS || gap < need - EPS) return null
    const floorsLo = Math.ceil(gap / max - EPS)
    const floorsHi = need > min + EPS ? 1 + Math.floor((gap - need) / min + EPS) : Math.floor(gap / min + EPS)
    if (floorsLo > floorsHi) return null
    lo += floorsLo
    hi += floorsHi
    prev = base
    need = Math.max(tallest.get(base)!, min)
  }
  const room = parcel.envelope.maxHeight - prev
  if (need > max + EPS || room < need - EPS) return null
  return { lo: lo + 1, hi: hi + 1 + Math.floor((room - need) / min + EPS) }
}

/** True when some admissible floor count is one the parcel envelope allows. */
export function stackFits(parcel: Parcel, bases: readonly StackBase[]): boolean {
  const range = admissibleFloors(parcel, bases)
  if (!range) return false
  return range.hi >= parcel.envelope.minFloors && range.lo <= parcel.envelope.maxFloors
}
