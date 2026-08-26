import { defineConfig } from 'vite'
import { resolve } from 'path'
import dts from 'vite-plugin-dts'

export default defineConfig({
  publicDir: false,
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'agent-core',
      formats: ['es', 'cjs'],
      fileName: (format) => `index.${format === 'es' ? 'mjs' : 'cjs'}`,
    },
  },
  plugins: [dts({ rollupTypes: true })],
  resolve: {
    alias: [{ find: /^@(.+)$/, replacement: new URL('./src/$1', import.meta.url).pathname }],
  },
})
