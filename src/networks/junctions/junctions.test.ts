import { describe, expect, it } from 'vitest'
import { buildJunctionTopology, connectJunctions, JunctionTopologyError } from './index'
import { atlasN103, fixturePorts, graphFixture } from './test-fixtures'
import type { JunctionInput, JunctionRoutingInput } from './schema'

const routing = (input: JunctionInput): JunctionRoutingInput => {
  const ports = fixturePorts(input)
  return { ...input, ports, maximumConnectorWidth: 2, route: request => [ports[request.fromPortId].position, ports[request.toPortId].position] }
}

describe('junction topology public contract', () => {
  it('preserves the real short e8 arm through n103 without crossing its opposite sidewalks', () => {
    const input = atlasN103(), before = structuredClone(input)
    const result = buildJunctionTopology(input)
    const complex = result.complexes.find(value => value.internalEdgeIds.includes('e8'))!
    expect(input).toEqual(before)
    expect(complex.nodeIds).toEqual(['n103', 'n104'])
    expect(complex.groupIds).toEqual(['n103:grade', 'n104:grade'])
    expect(complex.internalEdgeIds).toEqual(['e8'])
    expect(complex.boundaries).toHaveLength(1)
    expect(complex.boundaries[0].map(step => [step.from.edgeId, step.to.edgeId, step.via.map(leg => leg.edgeId)])).toEqual([
      ['e207', 'e29', []], ['e29', 'e9', ['e8']], ['e9', 'e214', ['e8']], ['e214', 'e207', []],
    ])
    expect(complex.boundaries.flat().every(step => step.connection?.from.side === 'left' && step.connection.to.side === 'right')).toBe(true)
    expect(result.complexes.find(value => value.groupIds.includes('n104:deck'))!.internalEdgeIds).toEqual([])
    expect(buildJunctionTopology({ nodes: [...input.nodes].reverse(), edges: [...input.edges].reverse(), endpoints: [...input.endpoints].reverse() })).toEqual(result)
  })

  it('traces both sides of a bent chain and an enclosed internal boundary exactly once', () => {
    const input = graphFixture({ a: [0, 0], b: [8, 0], c: [8, 8], d: [0, 8], west: [-30, 0], east: [38, 8] }, [
      { id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' },
      { id: 'cd', from: 'c', to: 'd' }, { id: 'da', from: 'd', to: 'a' },
      { id: 'aw', from: 'a', to: 'west' }, { id: 'ce', from: 'c', to: 'east' },
    ])
    const complex = buildJunctionTopology(input).complexes.find(value => value.internalEdgeIds.length)!
    expect(complex.internalEdgeIds).toEqual(['ab', 'bc', 'cd', 'da'])
    expect(complex.boundaries).toHaveLength(1)
    expect(complex.closedBoundaries).toHaveLength(1)
    const legs = [...complex.boundaries.flat().flatMap(step => step.via), ...complex.closedBoundaries.flat()]
    expect(legs).toHaveLength(8)
    expect(new Set(legs.map(leg => `${leg.edgeId}/${leg.fromNodeId}`)).size).toBe(8)
    expect(complex.boundaries[0].map(step => step.from.edgeId).sort()).toEqual(['aw', 'ce'])
    expect(() => connectJunctions(routing(input))).toThrowError(expect.objectContaining({ code: 'E_JUNCTION_UNRESOLVED' }))
  })

  it('uses the grid tolerance for consumed runs without changing endpoint dimensions', () => {
    const input = graphFixture({ a: [0, 0], b: [12.0005, 0], c: [-30, 0] }, [
      { id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c' },
    ])
    expect(buildJunctionTopology(input).complexes.find(value => value.nodeIds.includes('a'))!.internalEdgeIds).toEqual(['ab'])
    input.edges[0].length = 12.002
    expect(buildJunctionTopology(input).complexes.find(value => value.nodeIds.includes('a'))!.internalEdgeIds).toEqual([])
    expect(input.endpoints.every(endpoint => endpoint.clearance === 6)).toBe(true)
  })

  it('routes every demanded boundary connection at its complete selected width', () => {
    const input = routing(atlasN103())
    const requests: Parameters<JunctionRoutingInput['route']>[0][] = []
    const result = connectJunctions({ ...input, route: request => {
      requests.push(request)
      return input.route(request)
    } })
    expect(result.connectors).toHaveLength(result.complexes.flatMap(complex => complex.boundaries.flat()).filter(step => step.connection).length)
    for (const connection of result.connectors) {
      expect(connection.width).toBe(2)
      expect(connection.path3[0]).toEqual(input.ports[connection.from.id].position)
      expect(connection.path3.at(-1)).toEqual(input.ports[connection.to.id].position)
    }
    expect(requests.filter(request => request.via.some(leg => leg.edgeId === 'e8'))).toHaveLength(2)
    expect(requests.some(request => request.complex.nodeIds.join(',') === 'n103,n104')).toBe(true)
  })

  it('preserves deliberate null-side barriers and emits no highway walking connection', () => {
    const input = routing(graphFixture({ a: [0, 0], b: [5, 0] }, [{ id: 'h', from: 'a', to: 'b', walking: false }]))
    expect(connectJunctions(input).connectors).toEqual([])
    const partlyWalking = routing(atlasN103())
    partlyWalking.endpoints.find(endpoint => endpoint.nodeId === 'n103' && endpoint.edgeId === 'e29')!.ports.right = null
    const topology = connectJunctions(partlyWalking)
    expect(topology.complexes.flatMap(complex => complex.boundaries.flat()).some(step => step.to.edgeId === 'e29' && step.connection === null)).toBe(true)
  })

  it('leaves an ordinary terminal open and retains real consumed-edge return demands', () => {
    const terminal = routing(graphFixture({ a: [0, 0], b: [50, 0] }, [{ id: 'ab', from: 'a', to: 'b' }]))
    expect(connectJunctions({ ...terminal, route: () => { throw new Error('An open terminal has no route demand') } }).connectors).toEqual([])
    const consumed = graphFixture({ a: [0, 0], b: [5, 0], c: [-50, 0] }, [
      { id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c' },
    ])
    const returnStep = buildJunctionTopology(consumed).complexes.find(complex => complex.internalEdgeIds.includes('ab'))!.boundaries[0][0]
    expect(returnStep.from).toEqual(returnStep.to)
    expect(returnStep.via).toHaveLength(2)
    expect(returnStep.connection).not.toBeNull()
  })

  it('refuses unresolved geometry without omitting a requested connection or narrowing it', () => {
    const input = routing(atlasN103())
    const seen: number[] = []
    expect(() => connectJunctions({ ...input, route: request => { seen.push(request.width); return null } })).toThrowError(JunctionTopologyError)
    expect(seen).toEqual([2])
    for (const route of [() => [[1, 2, 3], [4, 5, 6]], () => [[NaN, 0, 0], [4, 5, 6]]] as JunctionRoutingInput['route'][]) {
      expect(() => connectJunctions({ ...input, route })).toThrowError(expect.objectContaining({ code: 'E_JUNCTION_UNRESOLVED' }))
    }
    const closed = routing(graphFixture({ a: [0, 0], b: [5, 0] }, [{ id: 'e', from: 'a', to: 'b' }]))
    expect(() => connectJunctions(closed)).toThrowError(expect.objectContaining({ code: 'E_JUNCTION_UNRESOLVED' }))
  })

  it('rejects invalid incidence, repeated identities, dimensions, groups and referenced ports', () => {
    const changes: ((input: JunctionRoutingInput) => void)[] = [
      input => { input.nodes.push(input.nodes[0]) },
      input => { input.edges[0].from = 'absent' },
      input => { input.edges[0].length = 0 },
      input => { input.endpoints.pop() },
      input => { input.endpoints[1].nodeId = input.endpoints[0].nodeId },
      input => { input.endpoints[1].groupId = input.endpoints[0].groupId },
      input => { input.endpoints[0].clearance = -1 },
      input => { input.endpoints[0].tangent = [0, 0] },
      input => { input.endpoints[0].ports.left = 'absent' },
      input => { input.maximumConnectorWidth = 0 },
      input => { Object.values(input.ports)[0].width = NaN },
    ]
    for (const change of changes) {
      const input = routing(atlasN103())
      change(input)
      expect(() => connectJunctions(input)).toThrowError(expect.objectContaining({ code: 'E_JUNCTION_INPUT' }))
    }
  })
})
