import type { NextConfig } from "next";

const baseConfig: NextConfig = {
  reactStrictMode: true,
};

// next-pwa v5 injects webpack plugins unconditionally, which crashes Turbopack
// (Next 16 default). Skip the wrapper entirely in dev; apply in production only.
const isDev = process.env.NODE_ENV !== "production";

let finalConfig: NextConfig;

if (isDev) {
  finalConfig = baseConfig;
} else {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const withPWA = require("next-pwa");
  finalConfig = withPWA({
    dest: "public",
    // Generate Workbox to a separate file so our /sw.js is not overwritten.
    // /sw.js (committed to git) is the primary SW — it handles push notifications
    // and loads /workbox-sw.js via importScripts for caching.
    sw: "workbox-sw.js",
    // push-setup.tsx registers /sw.js manually; next-pwa must not register
    // workbox-sw.js on its own (wrong file, wrong scope intent).
    register: false,
    skipWaiting: true,
    clientsClaim: true,
    disable: false,
  })(baseConfig);
}

export default finalConfig;
