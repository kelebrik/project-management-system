import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * The Highcharts modules are imported only by highchartsExtras, which pages
 * load on demand, so the dev server would otherwise meet them (and the pages)
 * at the first request: optimised and transformed up front, a page loaded on
 * demand opens at once, also with several e2e workers on one server.
 */
const HIGHCHARTS_MODULES = [
  'highcharts',
  'highcharts/highcharts-more',
  'highcharts/modules/dumbbell',
  'highcharts/modules/timeline',
  'highcharts/modules/xrange',
  'highcharts/modules/drilldown',
  'highcharts/modules/heatmap',
  'highcharts/modules/annotations',
  'highcharts/modules/exporting',
  'highcharts/modules/offline-exporting',
  'highcharts/modules/export-data',
  'highcharts/modules/accessibility',
]

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: { include: [...HIGHCHARTS_MODULES, 'html-to-image'] },
  server: { warmup: { clientFiles: ['./src/pages/*.tsx', './src/components/charts/highchartsExtras.ts', './src/components/charts/HighchartsChartImpl.tsx'] } },
})
