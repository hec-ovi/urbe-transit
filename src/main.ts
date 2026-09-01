import './ui/styles.css'
import { AppView } from './ui/views/AppView'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'
import { generate } from './generate'
import { ConnectionsError } from './core/errors'
import type { AtlasBlueprint } from './types/atlas'

const NO_LAYERS = {
  bridges: false, acTubes: false, wires: false, tunnels: false,
  airPaths: false, bus: false, subway: false, train: false,
}

/**
 * The dev server offers the atlas sample; without it, or when the sample breaks the contract,
 * the fixture keeps the box standalone and the sidebar names the reason.
 */
async function loadAtlas(): Promise<{ atlas: AtlasBlueprint; source: string }> {
  try {
    const res = await fetch('/atlas-blueprint.json')
    if (res.ok) {
      const atlas = (await res.json()) as AtlasBlueprint
      generate(atlas, { seed: 'validation-probe', toggles: NO_LAYERS })
      return { atlas, source: `atlas sample (seed ${atlas.meta.seed})` }
    }
  } catch (e) {
    if (e instanceof ConnectionsError) {
      return { atlas: buildFixtureAtlas(), source: `fixture city (atlas sample rejected: ${e.message})` }
    }
  }
  return { atlas: buildFixtureAtlas(), source: 'fixture city' }
}

const { atlas, source } = await loadAtlas()
const app = new AppView(atlas, 'alpha', source)
document.body.append(app.el)
app.fit()
window.addEventListener('resize', () => app.fit())
