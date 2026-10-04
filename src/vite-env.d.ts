/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ELECTION_API_BASE_URL?: string
  readonly VITE_ELECTION_RESULTS_PATH?: string
  readonly VITE_ELECTION_USE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
