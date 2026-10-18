/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  readonly VITE_SUPABASE_ANON_KEY: string
  readonly VITE_ENABLE_DEMO_LOGINS: string
  readonly VITE_MEDIA_BASE_URL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
