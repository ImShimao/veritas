import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

const resolvePath = (relative: string) => fileURLToPath(new URL(relative, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@veritas/core': resolvePath('./packages/core/src/index.ts'),
      '@veritas/engine': resolvePath('./packages/engine/src/index.ts'),
      '@veritas/extractors': resolvePath('./packages/extractors/src/index.ts'),
      '@veritas/nlu': resolvePath('./packages/nlu/src/index.ts'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'packages/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['packages/*/src/**/*.ts'],
      exclude: ['**/*.test.ts', '**/index.ts'],
    },
  },
});
