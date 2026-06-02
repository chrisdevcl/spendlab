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
    register: true,
    skipWaiting: true,
    // Ensure the activated SW immediately controls all open clients.
    // Without this, navigator.serviceWorker.controller stays null until
    // the next page load, which prevents push subscriptions in Chrome.
    clientsClaim: true,
    // worker/index.js is merged into the generated sw.js — adds push handlers
    customWorkerDir: "worker",
    disable: false,
  })(baseConfig);
}

export default finalConfig;
