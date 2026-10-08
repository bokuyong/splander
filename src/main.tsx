import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './ui/styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { applyThemeVars } from './ui/theme'

applyThemeVars()

// iOS Safari ignores user-scalable=no: block pinch and double-tap zoom here.
document.addEventListener('gesturestart', (e) => e.preventDefault())
document.addEventListener('dblclick', (e) => e.preventDefault())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
