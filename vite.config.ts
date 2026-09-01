import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vitest/config'

/**
 * Serves the atlas sample blueprint at /atlas-blueprint.json during dev.
 * Path comes from ATLAS_BLUEPRINT (default: the committed atlas sample next to this repo);
 * a 404 makes the preview fall back to the fixture city, keeping the box standalone.
 */
function atlasBlueprint(): Plugin {
  return {
    name: 'atlas-blueprint',
    configureServer(server) {
      server.middlewares.use('/atlas-blueprint.json', (_req, res) => {
        const path = resolve(process.env.ATLAS_BLUEPRINT ?? '../atlas/samples/city-urbe.json')
        if (!existsSync(path)) {
          res.statusCode = 404
          res.end('no atlas blueprint')
          return
        }
        res.setHeader('content-type', 'application/json')
        res.end(readFileSync(path))
      })
    },
  }
}

export default defineConfig({
  plugins: [atlasBlueprint()],
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
  },
})
