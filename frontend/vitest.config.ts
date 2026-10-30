import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@renderer': resolve(import.meta.dirname, 'src'),
      '@shared': resolve(import.meta.dirname, 'src/shared')
    }
  },
  test: { environment: 'jsdom', include: ['tests/**/*.test.ts'] }
})
