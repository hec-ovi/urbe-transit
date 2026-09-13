import type { AtlasBlueprint } from '../types/atlas'
import type { ConnectionsOutput } from '../types/output'
import type { VehiclePosition } from '../networks/transit'

export interface PreviewInput {
  atlas: AtlasBlueprint
  output: ConnectionsOutput
  seed: string
  source: string
}

export interface PreviewFrame {
  signals: Record<string, string>
  vehicles: VehiclePosition[]
}

export interface PreviewActions {
  generate(seed: string): void
  frameAt(seconds: number): PreviewFrame
}

/** Static layout nodes; actions and data bindings are supplied by the caller. */
export interface LayoutNode {
  tag?: string
  ref?: string
  className?: string
  text?: string
  binding?: string
  attributes?: Record<string, string | undefined>
  action?: string
  event?: string
  slot?: string
  children?: LayoutNode[]
}
