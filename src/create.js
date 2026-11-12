// "Create" page: choose between a museum and a face filter, plus "My creations".
import { startBackground } from './background.js'
import { mountNav } from './nav.js'
import { renderWorks } from './works-ui.js'
import { initI18n } from './i18n.js'

startBackground(document.getElementById('bg-canvas'))
await initI18n()
mountNav()
renderWorks(document.getElementById('works'))
