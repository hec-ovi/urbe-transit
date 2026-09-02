import { describe, expect, it } from 'vitest'
import { generate } from '../src'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { facePlaneDistance, linkGround, segmentPolygonDistance } from './helpers'

const atlas = buildFixtureAtlas()
const out = generate(atlas, { seed: 'alpha' })

describe('links', () => {
  it('produces every kind on the fixture city', () => {
    const kinds = new Set(out.links.map((l) => l.kind))
    expect(kinds).toContain('bridge')
    expect(kinds).toContain('ac-tube')
    expect(kinds).toContain('wire')
    expect(kinds).toContain('tunnel')
  })

  it('linkRefs match links one to one', () => {
    expect(out.linkRefs).toHaveLength(out.links.length)
    for (const l of out.links) {
      const ref = out.linkRefs.find((r) => r.linkId === l.id)
      expect(ref).toBeDefined()
      expect(ref!.kind).toBe(l.kind)
      expect(ref!.buildingA).toBe(l.a.buildingId)
      expect(ref!.buildingB).toBe(l.b.buildingId)
    }
  })

  it('paths terminate exactly on both face planes', () => {
    for (const l of out.links) {
      const start = l.path[0]
      const end = l.path[l.path.length - 1]
      expect(facePlaneDistance(atlas, l.a.buildingId, l.a.face, start)).toBeLessThan(1e-6)
      expect(facePlaneDistance(atlas, l.b.buildingId, l.b.face, end)).toBeLessThan(1e-6)
      expect(l.length).toBeGreaterThan(0)
    }
  })

  it('a diagonal link closes with no gap: slanted cuts still sit in the face plane', () => {
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
  })

  it('a link you walk inside has room to stand up in', () => {
    const inside = out.links.filter((l) => l.walkable.inside)
    expect(new Set(inside.map((l) => l.kind))).toEqual(new Set(['bridge', 'ac-tube', 'tunnel']))
    for (const l of inside) {
      expect(l.crossSection.height, `${l.kind} headroom`).toBeGreaterThanOrEqual(2.1)
      expect(l.crossSection.width, `${l.kind} width`).toBeGreaterThanOrEqual(0.9)
    }
    for (const l of out.links.filter((x) => x.kind === 'wire')) expect(l.walkable.inside).toBe(false)
  })

  it('walkable links appear in the walk graph as portal edges', () => {
    const linkEdges = out.networks.walk.edges.filter((e) => e.kind === 'link')
    const walkable = out.links.filter((l) => l.walkable.over || l.walkable.inside)
    expect(linkEdges.map((e) => e.linkId).sort()).toEqual(walkable.map((l) => l.id).sort())
  })

  it('above-ground links never pass through a third building', () => {
    for (const l of out.links) {
      if (l.kind === 'tunnel') continue
      const [ax, , az] = l.path[0]
      const [bx, , bz] = l.path[l.path.length - 1]
      const minY = Math.min(...l.path.map((p) => p[1]))
      for (const parcel of atlas.parcels) {
        if (parcel.id === l.a.buildingId || parcel.id === l.b.buildingId) continue
        const height = atlas.volumetric.buildings.find((b) => b.parcelId === parcel.id)!.height
        if (height + 1 < minY) continue
        // Sampled midpoints of the track must stay outside this footprint.
        for (let t = 0.05; t < 1; t += 0.05) {
          const x = ax + (bx - ax) * t
          const z = az + (bz - az) * t
          const fp = parcel.footprint
          let inside = false
          for (let i = 0, j = fp.length - 1; i < fp.length; j = i++) {
            if (fp[i][1] > z !== fp[j][1] > z && x < ((fp[j][0] - fp[i][0]) * (z - fp[i][1])) / (fp[j][1] - fp[i][1]) + fp[i][0]) inside = !inside
          }
          expect(inside, `${l.id} crosses ${parcel.id}`).toBe(false)
        }
      }
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

  it('tunnels run below ground', () => {
    for (const l of out.links.filter((x) => x.kind === 'tunnel')) {
      for (const p of l.path) expect(p[1]).toBeLessThan(0)
    }
  })

  it('wires sag between their anchors', () => {
    const wire = out.links.find((l) => l.kind === 'wire')!
    const yStart = wire.path[0][1]
    const yEnd = wire.path[wire.path.length - 1][1]
    const yMid = wire.path[Math.floor(wire.path.length / 2)][1]
    expect(yMid).toBeLessThan(Math.min(yStart, yEnd))
  })
})
