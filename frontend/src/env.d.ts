/// <reference types="vite/client" />
import type { MarkGoApi } from './shared/types'

declare global {
  interface Window {
    markgo: MarkGoApi
  }
}
