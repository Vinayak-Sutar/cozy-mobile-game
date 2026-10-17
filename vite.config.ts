import { defineConfig } from 'vite';

export default defineConfig({
  // Relative asset paths so the same build can later be bundled into a Capacitor app.
  base: './',
  build: {
    target: 'es2020',
  },
});
