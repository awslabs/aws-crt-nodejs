import { defineConfig } from 'vite'

// https://vitejs.dev/config/
export default defineConfig({
  build: {
    outDir: 'public',
    lib: {
      entry: 'src/service-worker.ts',
      name: "service-worker",
      formats: ["es"],
      fileName: () => "service-worker.js"
    }
  }
})
