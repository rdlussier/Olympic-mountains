import { defineConfig } from 'vite'

export default defineConfig({
  base: './',
  server: {
    host: '127.0.0.1',
    port: 11100,
    strictPort: true
  },
  preview: {
    host: '127.0.0.1',
    port: 11101,
    strictPort: true
  }
})
