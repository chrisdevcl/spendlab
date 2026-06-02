import type { NextConfig } from "next";

// next-pwa is removed: it was silently failing to inject push handlers into
// the Workbox-generated SW, and every attempt to work around it added more
// complexity. The manifest is already linked in layout.tsx; the SW is served
// from public/sw.js directly (committed to git, not generated).
const config: NextConfig = {
  reactStrictMode: true,
};

export default config;
