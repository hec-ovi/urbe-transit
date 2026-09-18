import { version } from '../package.json'

/** Release version. package.json is the single source; every other surface quotes it. */
export const PACKAGE_VERSION: string = version

/** Stable document format emitted by the original generate(atlas, params) entry point. */
export const CONNECTIONS_DOCUMENT_VERSION = '0.9.0'

/** Document format emitted by generateRooftopSpans(request). */
export const ROOFTOP_SPAN_DOCUMENT_VERSION = '1.0.0'
