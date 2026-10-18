/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_ENABLE_DEMO_LOGINS: string
  readonly VITE_STAFF_INVITE_CODE?: string
  /** Optional: a MapLibre style URL (MapTiler, Stadia, OpenFreeMap...). Use {key} as the placeholder for the API key. */
  readonly VITE_MEDIA_BASE_URL?: string
  readonly VITE_MAP_STYLE_URL?: string
  readonly VITE_MAP_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
