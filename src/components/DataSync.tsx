import { useEffect } from 'react'
import { supabase, supabaseConfigured } from '../lib/supabase'
import { hydrateFromSupabase, subscribeLiveData } from '../lib/session'
import { useStore } from '../store'
import { backendReady, tick, weatherSync } from '../lib/functions'
import { flushOutbox, initOutbox, setOnline as setOutboxOnline } from '../lib/outbox'

export default function DataSync() {
  useEffect(() => {
    // ---- Offline outbox: real connectivity, real IndexedDB queue, automatic replay on reconnect.
    initOutbox({
      onChange: (items) => useStore.getState().setSyncItems(items),
      onNotify: (msg, kind) => useStore.getState().showToast(msg, msg, kind),
    })
    const goOnline = () => {
      useStore.getState().setOnline(true)
      void flushOutbox().then(() => hydrateFromSupabase())
    }
    const goOffline = () => useStore.getState().setOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    // Start from the real connection state, not a stale value.
    useStore.getState().setOnline(navigator.onLine)
    setOutboxOnline(navigator.onLine)

    if (!supabaseConfigured) {
      return () => {
        window.removeEventListener('online', goOnline)
        window.removeEventListener('offline', goOffline)
      }
    }

    void hydrateFromSupabase().then(() => flushOutbox())
    const unsubLive = subscribeLiveData()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      useStore.getState().setAuthUserId(session?.user?.id || null)
      void hydrateFromSupabase()
    })

    // Live forecast: a signed-in coordinator refreshes the hazard clock from Open-Meteo (the server skips it if fresh).
    window.setTimeout(() => {
      const s = useStore.getState()
      if (backendReady() && s.user?.role === 'coordinator' && s.isOnline) void weatherSync().then(() => hydrateFromSupabase()).catch(() => undefined)
    }, 4000)

    // Heartbeat fallback: a signed-in coordinator drives escalation/alerts once a minute
    // (the pg_cron job from database/sql/10_map_cron.sql does it even when nobody is logged in).
    const beat = window.setInterval(() => {
      const s = useStore.getState()
      if (backendReady() && s.isOnline && s.user?.role === 'coordinator' && document.visibilityState === 'visible') void tick().catch(() => undefined)
      if (s.isOnline) void flushOutbox()
    }, 60_000)

    return () => {
      window.clearInterval(beat)
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
      unsubLive()
      data.subscription.unsubscribe()
    }
  }, [])
  return null
}
