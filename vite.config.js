import { defineConfig } from 'vite'

export default defineConfig({
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
