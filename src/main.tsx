import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)

// Offline support: cache the app shell and map tiles. Production builds only, so `vite dev` stays simple.
if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // The page that registered the worker was loaded before it took control, so hand it the URLs it already used.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin))
        reg.active?.postMessage({ type: 'CACHE_URLS', urls })
      })
      .catch((e) => console.warn('Service worker registration failed', e))
  })
}
