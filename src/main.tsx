import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { applyThemeVars } from './ui/theme'
import { installSoundUnlock } from './ui/logic/sound'

applyThemeVars()
// Audio may only start from a tap: arm the context on the first gesture.
installSoundUnlock()

// iOS Safari ignores user-scalable=no: block pinch and double-tap zoom here.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
