import { expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { faceLength, facePlaneDistance, linkGround, segmentPolygonDistance } from './helpers'

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })

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

  const diagonal = out.links.find((l) => {
    const [a, b] = [l.path[0], l.path[l.path.length - 1]]
    return l.kind !== 'wire' && Math.abs(a[1] - b[1]) > 0.5
  })
  expect(diagonal).toBeDefined()
  const apA = out.apertures.find((a) => a.id === diagonal!.a.apertureId)!
  for (const v of apA.cut.polygon) {
    expect(facePlaneDistance(atlas, apA.buildingId, apA.face, v)).toBeLessThan(1e-6)
  }
  // The slanted cut is taller than the straight cross-section: the exact miter stretch.
  expect(apA.height).toBeGreaterThan(diagonal!.crossSection.height)

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
    parcel.envelope = { minFloors: 6, maxFloors: 6, floorHeight: 3.2, maxHeight: 19.2 }
    atlas.volumetric.buildings.find(building => building.parcelId === id)!.height = 19.2
  }
  const result = generate(atlas, { seed: 'alpha' })
  const openings = result.apertures.filter(ap => ['p0', 'p1'].includes(ap.buildingId) && ap.kind === 'bridge')
  expect(openings.length).toBeGreaterThan(0)
  for (const ap of openings) {
    const room = 19.2 - ap.base
    // Hotel floors range from 2.8 to 5 m; six floors must include this opening.
    const feasible = [1,2,3,4,5].some(below => ap.base / below >= 2.8 && ap.base / below <= 5 && room >= ap.height + (5 - below) * 2.8)
    expect(feasible).toBe(true)
  }
})
