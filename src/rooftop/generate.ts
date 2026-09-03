import { PACKAGE_VERSION, ROOFTOP_SPAN_DOCUMENT_VERSION } from '../version'
import { planRooftopSpans } from './planner'
import type { RooftopSpanOutput, RooftopSpanRequest } from './types'
import { validateRooftopSpanRequest } from './validate'

/** Fits a deterministic subset of continuous collision-free rooftop antenna catenaries. */
export function generateRooftopSpans(request: RooftopSpanRequest): RooftopSpanOutput {
  const params = validateRooftopSpanRequest(request)
  return {
    meta: {
      seed: request.seed,
      schemaVersion: ROOFTOP_SPAN_DOCUMENT_VERSION,
      generatorVersion: PACKAGE_VERSION,
    },
    spans: planRooftopSpans(request, params),
  }
}
