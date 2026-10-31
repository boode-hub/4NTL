import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    __E2E__: 'false',
    __STORE__: 'false',
    __BUILT_AT__: '0',
    __VERSION__: JSON.stringify('0.0.0-test'),
  },
  test: {
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
    environment: 'node',
    restoreMocks: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.test.ts',
        'src/globals.d.ts',
        // Thin wiring around browser APIs; exercised by the e2e suite instead.
        'src/background/index.ts',
        'src/background/extpay-free.ts',
        'src/background/badge.ts',
        'src/content/index.ts',
        'src/options/options.ts',
        'src/list/list.ts',
        'src/result/result.ts',
      ],
      reporter: ['text', 'html', 'lcov'],
      thresholds: { statements: 90, branches: 85, functions: 90, lines: 90 },
    },
  },
});
