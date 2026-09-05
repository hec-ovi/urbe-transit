import { defineConfig } from 'vitest/config'

export default defineConfig({ test: { include: ['src/networks/junctions/**/*.test.ts'] } })
