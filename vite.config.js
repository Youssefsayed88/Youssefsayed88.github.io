import { defineConfig } from 'vite'
import wasm from 'vite-plugin-wasm'

export default defineConfig({
  // @dimforge/rapier3d imports its .wasm via WASM-ESM integration, which needs
  // this transform. Top-level await is fine without a second plugin because the
  // build targets es2022.
  plugins: [wasm()],
  // Relative base so the build works from a GitHub Pages project subpath too.
  base: './',
  build: {
    target: 'es2022',
    outDir: 'dist',
    assetsInlineLimit: 0,
    rollupOptions: {
      // Two entries: the showroom, and the generated fallback/CV page.
      input: {
        main: 'index.html',
        classic: 'classic.html',
      },
    },
  },
  server: { port: 5173 },
})
