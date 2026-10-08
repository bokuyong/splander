import type { CapacitorConfig } from '@capacitor/cli'

// Same value as THEME.ui.background in src/data/theme.ts, index.html and vite.config.ts.
const NIGHT = '#120F20'

// Native wrappers (Android / iOS) around the same `npm run build` output that
// GitHub Pages serves. `npm run cap:sync` builds and copies dist/ into both
// native projects; see docs/release-android.md and docs/release-ios.md.
const config: CapacitorConfig = {
  appId: 'io.github.bokuyong.splander',
  appName: '스플랜더',
  webDir: 'dist',
  // shown behind the web view while it loads and in the gaps around it
  backgroundColor: NIGHT,
  // the page already blocks pinch zoom; the web views must not add their own
  zoomEnabled: false,
  android: {
    // https://localhost only: never mix in plain http content
    allowMixedContent: false,
    backgroundColor: NIGHT,
  },
  ios: {
    // the page is a fixed, full-screen layout that draws its own safe areas:
    // no automatic insets and no rubber-banding of the outer scroll view
    contentInset: 'never',
    scrollEnabled: false,
    backgroundColor: NIGHT,
    preferredContentMode: 'mobile',
  },
  plugins: {
    // Android 15+ draws edge-to-edge: Capacitor keeps the env(safe-area-inset-*)
    // values the page already pads with (viewport-fit=cover) and styles the bars
    SystemBars: {
      insetsHandling: 'native',
      initialViewportFitValueHint: 'cover',
      style: 'DARK',
    },
    StatusBar: {
      // opaque dark bar above the page (light icons on NIGHT)
      overlaysWebView: false,
      style: 'DARK',
      backgroundColor: NIGHT,
    },
    SplashScreen: {
      // the page itself paints NIGHT immediately: hide the splash as soon as
      // the web view is up instead of holding it for seconds
      launchShowDuration: 0,
      launchAutoHide: true,
      launchFadeOutDuration: 150,
      backgroundColor: NIGHT,
      splashFullScreen: false,
      splashImmersive: false,
    },
  },
}

export default config
