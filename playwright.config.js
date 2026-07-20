// Fairli Tier-1: läuft gegen den Pages-Mimic-Server; SW geblockt für Determinismus
// (SW-spezifisches Verhalten wird separat/manuell getestet, s. DEVELOPER_ONBOARDING).
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  timeout: 20_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: 'http://127.0.0.1:8080',
    serviceWorkers: 'block',
    locale: 'de-CH',
  },
  webServer: {
    command: 'node tests/pages-server.mjs',
    url: 'http://127.0.0.1:8080/chores/',
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Pixel 7'] }, grepInvert: /@sw/ },
    { name: 'webkit-iphone', use: { ...devices['iPhone 14'] }, grepInvert: /@sw/ },
    // Eigenes Projekt für das, was den ECHTEN Service Worker braucht
    // (v4.56.0: das persönliche Manifest kommt von ihm). Bewusst klein
    // gehalten und mit @sw markiert — der Rest bleibt deterministisch.
    { name: 'chromium-sw', use: { ...devices['Pixel 7'], serviceWorkers: 'allow' }, grep: /@sw/ },
  ],
});
