import { generate } from './generate'
import { signalStateAt } from './networks/signals'
import { transitVehiclesAt } from './networks/transit'
import { AppView } from './ui/views/AppView'
import type { AtlasBlueprint } from './types/atlas'

/** Owns generation and time queries outside presentation. */
export class PreviewController {
  readonly el = document.createElement('div')
  private view!: AppView

  constructor(private readonly atlas: AtlasBlueprint, seed: string, private readonly source = 'fixture city') {
    this.el.style.display = 'contents'
    this.generate(seed)
  }

  private generate(rawSeed: string): void {
    const seed = rawSeed.trim() || 'seed'
    try {
      const output = generate(this.atlas, { seed })
      const view = new AppView({ atlas: this.atlas, output, seed, source: this.source }, {
        generate: next => this.generate(next),
        frameAt: seconds => ({
          signals: Object.fromEntries(output.networks.signals.map(signal => [signal.id, signalStateAt(signal, seconds)])),
          vehicles: transitVehiclesAt(output.networks.transit.routes, seconds),
        }),
      })
      this.view?.dispose()
      this.view = view
      this.el.replaceChildren(view.el)
      this.fit()
    } catch (error) {
      if (!this.view) throw error
      this.view.showMessage(error instanceof Error ? error.message : String(error))
    }
  }

  fit(): void { this.view.fit() }
  dispose(): void { this.view.dispose() }
}
