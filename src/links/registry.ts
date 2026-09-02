import type { Aperture, Link, LinkKind, LinkRef } from '../types/output'
import { CROSS_SECTIONS, WALKABLE, type LinkGeometry } from './geometry'
import type { BuildingIndex } from './buildings'
import { stackFits, type StackBase } from './stack'

/** The base-separation invariant: on one building, bases are equal or at least this far apart. */
const BASE_SEPARATION = 2.5
/** Clear band kept between two apertures sharing a face. */
const FACE_CLEARANCE = 0.3

/** Accepted links with their apertures, and the per-building reservations that keep them legal. */
export class LinkRegistry {
  private readonly links: Link[] = []
  private readonly apertures: Aperture[] = []
  private readonly refs: LinkRef[] = []
  private readonly counts = new Map<string, number>()
  private readonly bases = new Map<string, number[]>()
  /** Pinned floors per building: one entry per aperture that cuts a hole, wire anchors excluded. */
  private readonly stack = new Map<string, StackBase[]>()
  private readonly faceSpans = new Map<string, [number, number][]>()

  constructor(private readonly buildings: BuildingIndex) {}

  count(kind: LinkKind, buildingId: string): number {
    return this.counts.get(`${kind}:${buildingId}`) ?? 0
  }

  /**
   * Every aperture invariant for one end: base separation on the building, no overlap on the face,
   * and a floor stack of the building's family that still lands on all its pinned floors.
   */
  fits(ap: Omit<Aperture, 'id' | 'linkId'>): boolean {
    const used = this.bases.get(ap.buildingId) ?? []
    const separated = used.every((u) => Math.abs(u - ap.base) < 1e-6 || Math.abs(u - ap.base) >= BASE_SEPARATION)
    if (!separated) return false
    const spans = this.faceSpans.get(`${ap.buildingId}:${ap.face}`) ?? []
    const lo = ap.u - ap.width / 2 - FACE_CLEARANCE
    const hi = ap.u + ap.width / 2 + FACE_CLEARANCE
    if (spans.some(([a, b]) => lo < b && hi > a)) return false
    if (ap.kind === 'wire-anchor') return true
    const pinned = [...(this.stack.get(ap.buildingId) ?? []), { base: ap.base, height: ap.height }]
    return stackFits(this.buildings.parcel(ap.buildingId), pinned)
  }

  add(kind: LinkKind, aId: string, bId: string, geo: LinkGeometry): void {
    const id = `l${this.links.length}`
    const apA: Aperture = { ...geo.apertureA, id: `${id}a`, linkId: id }
    const apB: Aperture = { ...geo.apertureB, id: `${id}b`, linkId: id }
    this.apertures.push(apA, apB)
    this.links.push({
      id,
      kind,
      a: { buildingId: aId, floor: apA.floor, face: apA.face, apertureId: apA.id },
      b: { buildingId: bId, floor: apB.floor, face: apB.face, apertureId: apB.id },
      path: geo.path,
      crossSection: CROSS_SECTIONS[kind],
      walkable: WALKABLE[kind],
      length: geo.length,
    })
    this.refs.push({ linkId: id, kind, buildingA: aId, buildingB: bId })
    for (const bid of [aId, bId]) this.counts.set(`${kind}:${bid}`, this.count(kind, bid) + 1)
    for (const ap of [apA, apB]) {
      this.bases.set(ap.buildingId, [...(this.bases.get(ap.buildingId) ?? []), ap.base])
      if (ap.kind !== 'wire-anchor') {
        this.stack.set(ap.buildingId, [...(this.stack.get(ap.buildingId) ?? []), { base: ap.base, height: ap.height }])
      }
      const key = `${ap.buildingId}:${ap.face}`
      this.faceSpans.set(key, [...(this.faceSpans.get(key) ?? []), [ap.u - ap.width / 2, ap.u + ap.width / 2]])
    }
  }

  result(): { links: Link[]; apertures: Aperture[]; refs: LinkRef[] } {
    return { links: this.links, apertures: this.apertures, refs: this.refs }
  }
}
