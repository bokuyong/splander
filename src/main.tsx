import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { Capacitor } from '@capacitor/core'
import './ui/styles/fonts.css'
import './index.css'
import App from './App.tsx'
import { applyThemeVars } from './ui/theme'
import { installSoundUnlock } from './ui/logic/sound'
import { installAnalytics } from './ui/logic/analytics'

// PWA service worker (offline shell, auto update), web only: the same
// registration vite-plugin-pwa would inject. The native app (Capacitor) ships
// its files locally and gets new versions from the store, so a worker would
// only serve a stale shell for one launch after an update.
if (import.meta.env.PROD && !Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {})
  })
}

applyThemeVars()
installAnalytics()
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
