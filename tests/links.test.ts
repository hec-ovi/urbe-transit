import { expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import type { AtlasBlueprint, Vec2 } from '../src/types/atlas'
import type { LinkKind, LinkRef } from '../src/types/output'
import { faceLength, facePlaneDistance, linkGround, segmentPolygonDistance } from './helpers'

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'omega' })

it('publishes matching links, fitted cuts, walking flags and portal references', () => {

  expect(out.linkRefs).toHaveLength(out.links.length)
  for (const l of out.links) {
    const ref = out.linkRefs.find((r) => r.linkId === l.id)
    expect(ref).toBeDefined()
    expect(ref!.kind).toBe(l.kind)
    expect(ref!.buildingA).toBe(l.a.buildingId)
    expect(ref!.buildingB).toBe(l.b.buildingId)
  }

  for (const l of out.links) {
    const start = l.path[0]
    const end = l.path[l.path.length - 1]
    expect(facePlaneDistance(atlas, l.a.buildingId, l.a.face, start)).toBeLessThan(1e-6)
    expect(facePlaneDistance(atlas, l.b.buildingId, l.b.face, end)).toBeLessThan(1e-6)
    expect(l.length).toBeGreaterThan(0)
  }

  const inside = out.links.filter((l) => l.walkable.inside)
  expect(new Set(inside.map((l) => l.kind))).toEqual(new Set(['bridge', 'ac-tube', 'tunnel']))
  for (const l of inside) {
    expect(l.crossSection.height, `${l.kind} headroom`).toBeGreaterThanOrEqual(2.1)
    expect(l.crossSection.width, `${l.kind} width`).toBeGreaterThanOrEqual(0.9)
  }
  for (const l of out.links.filter((x) => x.kind === 'wire')) expect(l.walkable.inside).toBe(false)

  const linkEdges = out.networks.walk.edges.filter((e) => e.kind === 'link')
  const walkable = out.links.filter((l) => l.walkable.over || l.walkable.inside)
  expect(linkEdges.map((e) => e.linkId).sort()).toEqual(walkable.map((l) => l.id).sort())
  for (const ap of out.apertures) {
    const ys = ap.cut.polygon.map(point => point[1])
    expect(ap.base).toBe(Math.min(...ys))
    expect(ap.base + ap.height).toBeCloseTo(Math.max(...ys))
    expect(ap.u - ap.width / 2).toBeGreaterThanOrEqual(0)
    expect(ap.u + ap.width / 2).toBeLessThanOrEqual(faceLength(atlas, ap.buildingId, ap.face))
    for (const point of ap.cut.polygon) expect(facePlaneDistance(atlas, ap.buildingId, ap.face, point)).toBeLessThan(1e-6)
  }
})

it('the complete width of every above-ground link clears third buildings', () => {
  for (const l of out.links) {
    if (l.kind === 'tunnel') continue
    const [a, b] = linkGround(l)
    const bottom = Math.min(...l.path.map((p) => p[1])) - l.crossSection.height / 2
    for (const parcel of atlas.parcels) {
      if (parcel.id === l.a.buildingId || parcel.id === l.b.buildingId) continue
      const building = atlas.volumetric.buildings.find((v) => v.parcelId === parcel.id)!
      if (building.height <= bottom) continue
      expect(
        segmentPolygonDistance(a, b, parcel.footprint),
        `${l.id} ${l.kind} clips ${parcel.id}`,
      ).toBeGreaterThan(l.crossSection.width / 2)
    }
  }
})

/** A deck whose centerline misses a bridge while its carriageway clips the bridge edge. */
function grazingDeckAtlas() {
  const atlas = buildFixtureAtlas()
  const target = generate(atlas, { seed: 'alpha' }).links.find((l) => l.kind === 'bridge')!
  const a = target.path[0]
  const b = target.path[target.path.length - 1]
  const dx = b[0] - a[0]
  const dz = b[2] - a[2]
  const len = Math.hypot(dx, dz)
  const dir: [number, number] = [dx / len, dz / len]
  const normal: [number, number] = [-dir[1], dir[0]]
  const midpoint: [number, number] = [(a[0] + b[0]) / 2, (a[2] + b[2]) / 2]
  const offset = target.crossSection.width / 2 + 0.05
  const center: [number, number] = [midpoint[0] + normal[0] * offset, midpoint[1] + normal[1] * offset]
  const halfLength = Math.min(5, len / 4)
  const from: [number, number] = [center[0] - dir[0] * halfLength, center[1] - dir[1] * halfLength]
  const to: [number, number] = [center[0] + dir[0] * halfLength, center[1] + dir[1] * halfLength]
  atlas.streets.nodes.push(
    { id: 'grazing-a', position: from, edgeIds: ['grazing-deck'], connections: [{ level: 8, edgeIds: ['grazing-deck'] }] },
    { id: 'grazing-b', position: to, edgeIds: ['grazing-deck'], connections: [{ level: 8, edgeIds: ['grazing-deck'] }] },
  )
  const length = Math.hypot(to[0] - from[0], to[1] - from[1])
  atlas.streets.edges.push({
    id: 'grazing-deck', class: 'highway', from: 'grazing-a', to: 'grazing-b',
    path: [from, to], width: 0.2, sidewalk: { left: 0, right: 0 }, level: 8,
    elevationProfile: [{ distance: 0, level: 8 }, { distance: length, level: 8 }],
  })
  return atlas
}

it('keeps complete bridge and duct widths above a grazing highway deck', () => {
  const atlas = grazingDeckAtlas(), result = generate(atlas, { seed: 'alpha' })
  const deck = atlas.streets.edges.find(edge => edge.id === 'grazing-deck')!
  for (const link of result.links.filter(link => link.kind === 'bridge' || link.kind === 'ac-tube')) {
    const [a, b] = linkGround(link)
    const [c, d] = deck.path
    const length = Math.hypot(d[0] - c[0], d[1] - c[1])
    const n = [-(d[1] - c[1]) / length * deck.width / 2, (d[0] - c[0]) / length * deck.width / 2]
    const polygon: [number, number][] = [[c[0]+n[0],c[1]+n[1]],[d[0]+n[0],d[1]+n[1]],[d[0]-n[0],d[1]-n[1]],[c[0]-n[0],c[1]-n[1]]]
    if (segmentPolygonDistance(a, b, polygon) > link.crossSection.width / 2) continue
    for (const end of [link.a, link.b]) expect(result.apertures.find(ap => ap.id === end.apertureId)!.base).toBeGreaterThanOrEqual(13.5)
  }
})

it('selects a connection floor feasible within a tight receiving building', () => {
  const atlas = buildFixtureAtlas()
  for (const id of ['p0', 'p1']) {
    const parcel = atlas.parcels.find(p => p.id === id)!
    parcel.type = 'hotel'
    parcel.envelope = { minFloors: 6, maxFloors: 6, floorHeight: 4.5, maxHeight: 27 }
    atlas.volumetric.buildings.find(building => building.parcelId === id)!.height = 27
  }
  const result = generate(atlas, { seed: 'alpha' })
  const openings = result.apertures.filter(ap => ['p0', 'p1'].includes(ap.buildingId) && ap.kind === 'bridge')
  expect(openings.length).toBeGreaterThan(0)
  for (const ap of openings) {
    const room = 27 - ap.base
    // Six generated hotel floors need at least 4.5 m each, including the pinned floor.
    const feasible = [1,2,3,4,5].some(below => ap.base / below >= 4.5 && ap.base / below <= 5 && room >= Math.max(ap.height, 4.5) + (5 - below) * 4.5)
    expect(feasible).toBe(true)
  }
})

it('allocates default basements at 4.5 m and preserves feasible explicit tunnel bases', () => {
  const defaultTunnels = out.apertures.filter(ap => ap.kind === 'tunnel')
  expect(defaultTunnels.length).toBeGreaterThan(0)
  expect(new Set(defaultTunnels.map(ap => ap.base))).toEqual(new Set([-4.5]))

  const deeper = generate(atlas, { seed: 'alpha', links: { tunnel: { minBase: -6, density: 1 } } })
  const deeperTunnels = deeper.apertures.filter(ap => ap.kind === 'tunnel')
  expect(deeperTunnels.length).toBeGreaterThan(0)
  expect(new Set(deeperTunnels.map(ap => ap.base))).toEqual(new Set([-6]))

  const shallow = generate(atlas, { seed: 'alpha', links: { tunnel: { minBase: -4, density: 1 } } })
  expect(shallow.links.filter(link => link.kind === 'tunnel')).toEqual([])
})

/** A thin station shaft that misses a tunnel centerline but clips the edge of its swept section. */
function shaftOnTunnelEdge(): AtlasBlueprint {
  const atlas = buildFixtureAtlas()
  const target = generate(atlas, { seed: 'alpha' }).links.find((l) => l.kind === 'tunnel')!
  const [a, b] = linkGround(target)
  const [dx, dz] = [b[0] - a[0], b[1] - a[1]]
  const len = Math.hypot(dx, dz)
  const offset = target.crossSection.width / 2 + 0.05
  const center: Vec2 = [(a[0] + b[0]) / 2 - (dz / len) * offset, (a[1] + b[1]) / 2 + (dx / len) * offset]
  const station = atlas.transit.subwayStations[0]
  const footprint: Vec2[] = [[center[0] - .1, center[1] - .1], [center[0] + .1, center[1] - .1], [center[0] + .1, center[1] + .1], [center[0] - .1, center[1] + .1]]
  const foot: [number, number, number] = [center[0], -12, center[1]]
  const handoff: [number, number, number] = [station.position[0], -12, station.position[1]]
  station.entrances.push(center)
  station.shafts = [...station.shafts, { footprint, top: 0, bottom: -12, passage: [] }]
  station.accessPaths.push({
    entranceIndex: station.entrances.length - 1,
    segments: [{ kind: 'stairs', path: [[center[0], 0, center[1]], foot] }, { kind: 'passage', path: [foot, handoff] }],
    platformHandoff: handoff,
  })
  return atlas
}

it('keeps the complete swept section of every link clear of a station shaft', () => {
  const atlas = shaftOnTunnelEdge()
  const shaft = atlas.transit.subwayStations[0].shafts.at(-1)!
  for (const link of generate(atlas, { seed: 'alpha' }).links) {
    const ys = link.path.map((p) => p[1])
    if (Math.min(...ys) - link.crossSection.height / 2 >= shaft.top) continue
    if (Math.max(...ys) + link.crossSection.height / 2 <= shaft.bottom) continue
    const [a, b] = linkGround(link)
    expect(segmentPolygonDistance(a, b, shaft.footprint), `${link.id} ${link.kind} enters the shaft`).toBeGreaterThan(link.crossSection.width / 2)
  }
})

it('hangs every end under the supplied standing roofs and leaves a lot without a building empty', () => {
  // Real roofs: p2 and p3 stand far below their envelopes, and p0's lot holds no building at all.
  const roofs = Object.fromEntries(atlas.volumetric.buildings.map(b => [b.parcelId, { roof: b.height, stands: true }]))
  roofs.p2 = { roof: 20, stands: true }
  roofs.p3 = { roof: 28, stands: true }
  roofs.p0 = { roof: 0, stands: false }
  const result = generate(atlas, { seed: 'omega', buildings: roofs })

  const headRoom = (kind: string) => (kind === 'wire' ? 1 : 2)
  const ends = result.links.flatMap(l => [{ kind: l.kind, end: l.a }, { kind: l.kind, end: l.b }])
  expect(ends.length).toBeGreaterThan(0)
  for (const { kind, end } of ends) {
    if (kind === 'tunnel') continue
    const ap = result.apertures.find(a => a.id === end.apertureId)!
    expect(ap.base + ap.height, `${end.apertureId} on ${end.buildingId}`).toBeLessThanOrEqual(roofs[end.buildingId].roof - headRoom(kind))
  }
  for (const link of result.links) expect(link.heightSource).toBe('roof')

  // The cap bites: without roofs the same seed hangs an end above where p2 really stops.
  expect(out.apertures.some(ap => ap.buildingId === 'p2' && ap.base + ap.height > 20)).toBe(true)
  expect(result.apertures.filter(ap => ap.buildingId === 'p2').length).toBeGreaterThan(0)

  expect(result.apertures.filter(ap => ap.buildingId === 'p0')).toEqual([])
  expect(result.linkRefs.filter(ref => ref.buildingA === 'p0' || ref.buildingB === 'p0')).toEqual([])
})

/** Roofs for every parcel, with the facing p0/p1 pair set to the heights under test. */
function peerRoofs(p0: number, p1: number) {
  const roofs = Object.fromEntries(atlas.volumetric.buildings.map(b => [b.parcelId, { roof: b.height, stands: true }]))
  return { ...roofs, p0: { roof: p0, stands: true }, p1: { roof: p1, stands: true } }
}

const joins = (kind: LinkKind, refs: readonly LinkRef[]): LinkRef[] =>
  refs.filter(ref => ref.kind === kind && [ref.buildingA, ref.buildingB].sort().join() === 'p0,p1')

it('leaves roofs more than two floors apart unlinked', () => {
  const result = generate(atlas, { seed: 'omega', buildings: peerRoofs(20, 32) })
  expect(joins('bridge', result.linkRefs)).toEqual([])
  expect(joins('ac-tube', result.linkRefs)).toEqual([])
})

it('bridges peer roofs at one elevation on both buildings, clear of the ground', () => {
  const result = generate(atlas, { seed: 'omega', buildings: peerRoofs(15, 21) })
  const bridges = joins('bridge', result.linkRefs)
  expect(bridges.length).toBeGreaterThan(0)
  for (const ref of bridges) {
    const link = result.links.find(l => l.id === ref.linkId)!
    const [a, b] = [link.a, link.b].map(end => result.apertures.find(ap => ap.id === end.apertureId)!)
    expect(a.base).toBeCloseTo(b.base)
    expect(a.base).toBeGreaterThanOrEqual(9)
    expect(link.path[0][1]).toBeCloseTo(link.path[link.path.length - 1][1])
  }
})

it('wires a pair the peer rule refuses a bridge', () => {
  const result = generate(atlas, { seed: 'omega', buildings: peerRoofs(20, 32) })
  expect(joins('wire', result.linkRefs).length).toBeGreaterThan(0)
})
