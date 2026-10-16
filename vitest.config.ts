import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'jsdom',
    include: ['tests/frontend/**/*.test.{ts,tsx}'],
    setupFiles: ['tests/frontend/setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    maxWorkers: 2,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: 'coverage/frontend',
      include: ['src/components/**/*.{ts,tsx}', 'src/App.tsx', 'src/domain/requestAiPlan.ts', 'src/domain/storage.ts'],
    },
  },
}));
