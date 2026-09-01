import { beforeEach, describe, expect, it } from 'vitest'
import { getByLabelText, getByRole, getByText } from '@testing-library/dom'
import userEvent from '@testing-library/user-event'
import { AppView } from '../src/ui/views/AppView'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'

let app: AppView

beforeEach(() => {
  document.body.replaceChildren()
  app = new AppView(buildFixtureAtlas(), 'alpha')
  document.body.append(app.el)
})

describe('preview UI', () => {
  it('renders one toggle per export layer, all visible at start', () => {
    const boxes = app.el.querySelectorAll<HTMLInputElement>('.layer-panel input[type=checkbox]')
    expect(boxes.length).toBeGreaterThanOrEqual(10)
    for (const box of boxes) expect(box.checked).toBe(true)
    const canvas = app.el.querySelector('canvas')!
    expect(canvas.dataset.visibleLayers!.split(',').length).toBe(boxes.length)
  })

  it('toggling a layer updates the map visibility state', async () => {
    const user = userEvent.setup()
    const canvas = app.el.querySelector('canvas')!
    expect(canvas.dataset.visibleLayers).toContain('links.bridges')
    await user.click(getByText(app.el, 'Bridges'))
    expect(canvas.dataset.visibleLayers).not.toContain('links.bridges')
    await user.click(getByText(app.el, 'Bridges'))
    expect(canvas.dataset.visibleLayers).toContain('links.bridges')
  })

  it('the clock readout follows the slider', () => {
    const slider = app.el.querySelector<HTMLInputElement>('input[type=range]')!
    slider.value = String(13 * 3600 + 30 * 60)
    slider.dispatchEvent(new Event('input'))
    expect(getByText(app.el, '13:30')).toBeTruthy()
  })

  it('a new seed regenerates the preview', async () => {
    const user = userEvent.setup()
    const seed = getByLabelText(app.el, 'seed') as HTMLInputElement
    await user.clear(seed)
    await user.type(seed, 'omega')
    await user.click(getByRole(app.el, 'button', { name: 'Generate' }))
    const seedAfter = getByLabelText(app.el, 'seed') as HTMLInputElement
    expect(seedAfter.value).toBe('omega')
    expect(app.el.querySelector('canvas')).toBeTruthy()
  })
})
