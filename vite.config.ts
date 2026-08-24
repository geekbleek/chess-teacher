import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';
import { execSync } from 'node:child_process';

// Stamped into the page so you can tell at a glance whether a phone is showing a
// stale build — the service worker caches aggressively and "is it live yet?" is
// otherwise unanswerable from the device.
const buildStamp = (() => {
  const time = new Date().toISOString().slice(0, 16).replace('T', ' ');
  try {
    const sha = execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
    return `${time} · ${sha}`;
  } catch {
    return `${time} · dev`;
  }
})();

// GitHub Pages serves this project at /<repo>/, so assets need that base.
// Override with BASE_PATH=/ for local preview or a custom domain.
const base = process.env.BASE_PATH ?? '/chess-teacher/';

export default defineConfig({
  base,
  define: { __BUILD__: JSON.stringify(buildStamp) },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon-180.png', 'icon-512.png'],
      manifest: {
        name: 'Chess Teacher',
        short_name: 'Teacher',
        description: 'Pattern drills that teach the plan, not the move.',
        theme_color: '#161512',
        background_color: '#161512',
        display: 'standalone',
        orientation: 'portrait',
        start_url: base,
        scope: base,
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Everything is static and on-device; cache the whole app for offline drills.
        globPatterns: ['**/*.{js,css,html,png,svg,json}'],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
