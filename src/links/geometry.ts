import type { V3 } from '../core/vec'
import { add3, cross3, dist3, dot3, lift, norm3, scale3, sub3 } from '../core/vec'
import type { BuildingFaces, Face } from '../atlas/faces'
import type { Aperture, ApertureKind, LinkKind } from '../types/output'

export interface CrossSection {
  shape: 'rect' | 'circle'
  width: number
  height: number
}

export interface LinkGeometry {
  path: V3[]
  length: number
  apertureA: Omit<Aperture, 'id' | 'linkId'>
  apertureB: Omit<Aperture, 'id' | 'linkId'>
}

const WIRE_SAMPLES = 9
const CIRCLE_SAMPLES = 12
/** A link steeper than this against a face normal gets an unbuildably long cut; reject. */
const MIN_AXIS_DOT = 0.25

/**
 * Exact link geometry between two faces. Centers sit on the face planes; the cut polygon at each
 * end is the exact intersection of the link solid with that face plane (closed-form miter cut),
 * so a diagonal link closes with zero gap.
 */
export function buildLinkGeometry(
  facesA: BuildingFaces, faceA: Face, uA: number, centerYA: number,
  facesB: BuildingFaces, faceB: Face, uB: number, centerYB: number,
  kind: ApertureKind, cross: CrossSection,
): LinkGeometry | null {
  const cA = facesA.pointOn(faceA, uA, centerYA)
  const cB = facesB.pointOn(faceB, uB, centerYB)
  const axis = norm3(sub3(cB, cA))
  const nA = lift(faceA.normal, 0)
  const nB = lift(faceB.normal, 0)
  if (dot3(axis, nA) < MIN_AXIS_DOT || -dot3(axis, nB) < MIN_AXIS_DOT) return null

  const offsets = sectionOffsets(axis, cross)
  const cutA = offsets.map((o) => intersectWithFacePlane(add3(cA, o), axis, facesA, faceA))
  const cutB = offsets.map((o) => intersectWithFacePlane(add3(cB, o), axis, facesB, faceB))
  if (cutA.some((p) => p === null) || cutB.some((p) => p === null)) return null

  const apertureA = makeAperture(facesA, faceA, cutA as V3[], axis, kind, cross.shape)
  const apertureB = makeAperture(facesB, faceB, cutB as V3[], scale3(axis, -1), kind, cross.shape)
  if (!apertureA || !apertureB) return null

  const path = kind === 'wire-anchor' ? catenary(cA, cB) : [cA, cB]
  let length = 0
  for (let i = 1; i < path.length; i++) length += dist3(path[i - 1], path[i])
  return { path, length, apertureA, apertureB }
}

/** Cross-section corner (or sampled rim) offsets in the plane perpendicular to the axis. */
function sectionOffsets(axis: V3, cross: CrossSection): V3[] {
  const side = norm3(cross3(axis, [0, 1, 0]))
  const up = norm3(cross3(side, axis))
  const w = cross.width / 2
  const h = cross.height / 2
  if (cross.shape === 'rect') {
    return [
      add3(scale3(side, -w), scale3(up, -h)),
      add3(scale3(side, w), scale3(up, -h)),
      add3(scale3(side, w), scale3(up, h)),
      add3(scale3(side, -w), scale3(up, h)),
    ]
  }
  const out: V3[] = []
  for (let i = 0; i < CIRCLE_SAMPLES; i++) {
    const a = (i / CIRCLE_SAMPLES) * Math.PI * 2
    out.push(add3(scale3(side, Math.cos(a) * w), scale3(up, Math.sin(a) * h)))
  }
  return out
}

/** Intersect the line p + t*axis with the face plane; null when near-parallel. */
function intersectWithFacePlane(p: V3, axis: V3, faces: BuildingFaces, face: Face): V3 | null {
  const n = lift(face.normal, 0)
  const denom = dot3(axis, n)
  if (Math.abs(denom) < 1e-9) return null
  const t = -faces.planeDistance(face, p) / denom
  return add3(p, scale3(axis, t))
}

const FACE_MARGIN = 0.5

function makeAperture(
  faces: BuildingFaces, face: Face, cut: V3[], axisDir: V3,
  kind: ApertureKind, shape: 'rect' | 'circle',
): Omit<Aperture, 'id' | 'linkId'> | null {
  const us = cut.map((p) => faces.uOf(face, p))
  const ys = cut.map((p) => p[1])
  const uMin = Math.min(...us)
  const uMax = Math.max(...us)
  if (uMin < FACE_MARGIN || uMax > face.length - FACE_MARGIN) return null
  const base = Math.min(...ys)
  const height = Math.max(...ys) - base
  const nominalFloor = faces.parcel.envelope.floorHeight
  return {
    buildingId: faces.parcel.id,
    floor: Math.floor(base / nominalFloor),
    face: face.index,
    kind,
    u: (uMin + uMax) / 2,
    base,
    width: uMax - uMin,
    height,
    shape,
    cut: { polygon: cut, axisDir },
  }
}

/** Sagging wire: parabolic approximation of the catenary, sag 3% of span. */
function catenary(a: V3, b: V3): V3[] {
  const span = dist3(a, b)
  const sag = span * 0.03
  const out: V3[] = []
  for (let i = 0; i < WIRE_SAMPLES; i++) {
    const t = i / (WIRE_SAMPLES - 1)
    const p = add3(a, scale3(sub3(b, a), t))
    out.push([p[0], p[1] - sag * 4 * t * (1 - t), p[2]])
  }
  return out
}

export const CROSS_SECTIONS: Record<LinkKind, CrossSection> = {
  bridge: { shape: 'rect', width: 4, height: 3.2 },
  'ac-tube': { shape: 'rect', width: 2, height: 2.4 },
  wire: { shape: 'circle', width: 0.1, height: 0.1 },
  tunnel: { shape: 'rect', width: 3, height: 2.8 },
}

export const WALKABLE: Record<LinkKind, { over: boolean; inside: boolean }> = {
  bridge: { over: false, inside: true },
  'ac-tube': { over: true, inside: true },
  wire: { over: false, inside: false },
  tunnel: { over: false, inside: true },
}
