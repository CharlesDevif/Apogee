/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CESIUM_ION_TOKEN?: string;
  readonly VITE_BACKEND_HOST?: string;
  readonly VITE_BACKEND_PORT?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
