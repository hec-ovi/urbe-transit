import './ui/styles.css'
import { AppView } from './ui/views/AppView'
import { buildFixtureAtlas } from '../fixtures/atlas.fixture'

const app = new AppView(buildFixtureAtlas(), 'alpha')
document.body.append(app.el)
app.fit()
window.addEventListener('resize', () => app.fit())
