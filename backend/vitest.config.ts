import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
  },
  resolve: {
    // Allow vitest to resolve .js extensions to .ts source files (ESM TypeScript pattern)
    extensions: ['.ts', '.js'],
  },
});
