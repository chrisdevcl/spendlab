/**
 * Generates all PWA icons + favicon for SpendLab.
 *
 * Output:
 *   public/favicon.svg              — SVG favicon (modern browsers)
 *   public/favicon.png              — PNG favicon 32×32 (fallback)
 *   public/apple-touch-icon.png     — 180×180 para iOS "Add to Home Screen"
 *   public/icons/icon-{N}x{N}.png  — Iconos PWA estándar
 *   public/icons/icon-512x512-maskable.png — Icono maskable (Android)
 *
 * Usage: pnpm generate-icons
 */

import sharp from "sharp";
import { mkdirSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = join(__dirname, "../public");
const ICONS_DIR = join(PUBLIC_DIR, "icons");

const SIZES = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const BG = "#0D9488";   // teal-600
const FG = "#FFFFFF";

mkdirSync(ICONS_DIR, { recursive: true });

// ── SVG builder ──────────────────────────────────────────────────────────────
function buildSVG(size, { fullBleed = false } = {}) {
  const fontSize = Math.max(18, Math.round(size * 0.38));
  // Rounded corners: ~20% para iconos normales; 0 para maskable (el SO recorta)
  const r = fullBleed ? 0 : Math.round(size * 0.2);

  if (fullBleed) {
    // Maskable: fondo a full bleed, "SL" centrado con padding de ~10%
    // para que no quede recortado por la máscara del SO
    const pad = Math.round(size * 0.1);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" fill="${BG}"/>
  <text
    x="50%"
    y="50%"
    dominant-baseline="central"
    text-anchor="middle"
    fill="${FG}"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="${fontSize - pad}"
    font-weight="700"
    letter-spacing="-1"
  >SL</text>
</svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}">
  <rect width="${size}" height="${size}" rx="${r}" ry="${r}" fill="${BG}"/>
  <text
    x="50%"
    y="50%"
    dominant-baseline="central"
    text-anchor="middle"
    fill="${FG}"
    font-family="'Helvetica Neue', Helvetica, Arial, sans-serif"
    font-size="${fontSize}"
    font-weight="700"
    letter-spacing="-1"
  >SL</text>
</svg>`;
}

// ── Generador de PNG ─────────────────────────────────────────────────────────
async function generatePNG(size, outPath, options = {}) {
  const svg = buildSVG(size, options);
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(outPath);
}

// ── favicon.svg (SVG nativo, navegadores modernos) ───────────────────────────
console.log("Generating favicons…");
writeFileSync(join(PUBLIC_DIR, "favicon.svg"), buildSVG(32));
console.log("  ✓ favicon.svg");

// ── favicon.png 32×32 (fallback) ─────────────────────────────────────────────
await generatePNG(32, join(PUBLIC_DIR, "favicon.png"));
console.log("  ✓ favicon.png  (32×32)");

// ── apple-touch-icon.png 180×180 ─────────────────────────────────────────────
// iOS espera /apple-touch-icon.png en la raíz o el tag <link> en el HTML.
await generatePNG(180, join(PUBLIC_DIR, "apple-touch-icon.png"));
console.log("  ✓ apple-touch-icon.png  (180×180)");

// ── Iconos PWA estándar ───────────────────────────────────────────────────────
console.log(`\nGenerating ${SIZES.length} PWA icons…`);
for (const size of SIZES) {
  await generatePNG(size, join(ICONS_DIR, `icon-${size}x${size}.png`));
  console.log(`  ✓ icon-${size}x${size}.png`);
}

// ── Icono maskable 512×512 (Android adaptive icons) ──────────────────────────
// Fondo full bleed sin bordes redondeados; el SO aplica su propia máscara.
await generatePNG(512, join(ICONS_DIR, "icon-512x512-maskable.png"), { fullBleed: true });
console.log("  ✓ icon-512x512-maskable.png");

console.log("\nDone.");
