export type ConnectionsErrorCode = 'E_ATLAS_INVALID' | 'E_PARAMS_INVALID' | 'E_ROOFTOP_INPUT_INVALID'

export class ConnectionsError extends Error {
  constructor(
    readonly code: ConnectionsErrorCode,
    message: string,
    readonly path?: string,
  ) {
    super(message)
    this.name = 'ConnectionsError'
  }
}
