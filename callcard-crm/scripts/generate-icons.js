// =============================================================================
// generate-icons.js - Generates all required app icon PNGs from icon.svg
// Version: 1.5
// Last Updated: 2026-05-01
//
// PROJECT:      Rolodeck (project v2.0.1)
// FILES:        scripts/generate-icons.js          (this file — icon pipeline)
//               store-assets/icon.svg               (light icon master source)
//               store-assets/icon-dark.svg          (dark icon master source)
//               store-assets/adaptive-icon-fg.svg   (Android fg — no bg rect)
//               store-assets/splash.png             (splash screen — dedicated path)
//               store-assets/icons/                 (output directory)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// USAGE:
//   npm run icons
//   (or: node scripts/generate-icons.js)
//
// REQUIRES:
//   sharp ^0.33 (in devDependencies) — zero system dependency SVG renderer
//
// ARCHITECTURE:
//   - Reads store-assets/icon.svg (light) and icon-dark.svg (dark) as sources
//   - Each ICONS entry may override `src` (SVG path) and `flattenBg` (color)
//   - icon.png (1024) is flattened with light brand bg — App Store requires
//     no alpha channel on the primary icon
//   - icon-dark.png (1024) is flattened with dark brand bg — used as iOS
//     dark + tinted variants in app.json
//   - splash.png (1024) is output to store-assets/ (NOT icons/) so app.json
//     can reference a path distinct from icon.png — iOS caches launch screens
//     by asset name; a separate path guarantees the new image is loaded
//   - adaptive-icon-fg.png: rendered from store-assets/adaptive-icon-fg.svg
//     (clipboard only, NO baked-in cream bg — the cream comes from
//     adaptive-icon-bg.png so the launcher composite matches the Play Store
//     hi-res icon visually). Sized into the 72dp safe zone (center 66.7%).
//   - adaptive-icon-bg.png: solid #FDF0E0 fill, same dimensions
//   - adaptive-icon-monochrome.png: white silhouette on transparent bg —
//     used as Android 13+ Material You themed icon (monochromeImage).
//     Generated from adaptive-icon-fg.svg too, so the silhouette is the
//     clipboard graphic only (NOT a solid white square from the cream bg).
//   - Outputs file list summary to stdout on completion
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-09  Claude  Dark icon support
//         - Added SVG_DARK_SRC and BRAND_BG_DARK constants
//         - Added icon-dark.png entry with per-entry src/flattenBg overrides
//         - Updated render loop to use per-icon src and flattenBg if present
// v1.2  2026-04-17  Claude  Android monochrome + Expo upgrade housekeeping
//         - Added generateMonochrome() — renders SVG, makes all opaque pixels
//           white, preserves alpha; outputs adaptive-icon-monochrome.png
//         - Removed stale reference to withDarkIcon.js plugin (removed long ago)
//         - Updated PROJECT block to current version [updated ARCHITECTURE]
// v1.3  2026-04-25  Claude  Rustic Trade brand colors
//         - BRAND_BG: #C6ECEA → #FDF0E0 (Rustic Trade parchment)
//         - BRAND_BG_DARK: #0E2422 → #2A1506 (Rustic Trade dark brown)
// v1.4  2026-04-26  Claude  Dedicated splash screen asset
//         - Added splash.png to ICONS, output to store-assets/ (not icons/)
//         - app.json splash.image now points to ./store-assets/splash.png so
//           iOS sees a fresh asset path and cannot serve the cached old launch
//           screen [updated ARCHITECTURE, FILES]
// v1.5  2026-05-01  Claude  Fix Play Store launcher / hi-res icon mismatch
//         - Added SVG_ADAPTIVE_FG_SRC pointing at new
//           store-assets/adaptive-icon-fg.svg (clipboard only, no bg rect)
//         - Adaptive foreground now renders that SVG into the safe zone, so
//           the launcher composite shows clipboard at the same visual
//           prominence as icon-512.png (Play Store hi-res). Previously the
//           full icon.svg (cream bg + clipboard) was inset into the safe
//           zone, producing a small clipboard floating on a cream square on
//           top of a cream bg — visually different from the store listing
//           and a Misleading-Claims policy violation
//         - Monochrome icon also switched to the new SVG; previously the
//           cream bg rect (fully opaque) became a solid white square in
//           the silhouette pass, defeating Material You themed icons
//           [updated ARCHITECTURE, FILES]
// =============================================================================

'use strict';

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const ROOT             = path.join(__dirname, '..');
const SVG_SRC          = path.join(ROOT, 'store-assets', 'icon.svg');
const SVG_DARK_SRC     = path.join(ROOT, 'store-assets', 'icon-dark.svg');
const SVG_ADAPTIVE_FG  = path.join(ROOT, 'store-assets', 'adaptive-icon-fg.svg');
const OUT_DIR          = path.join(ROOT, 'store-assets', 'icons');

// Adaptive icon dimensions: 648px = 108dp @ xxxhdpi (6x baseline)
// Safe zone = inner 432px (72dp) = center 66.7%
// Icon fills the safe zone; padding on each side = (648 - 432) / 2 = 108px
const ADAPTIVE_TOTAL   = 648;
const ADAPTIVE_ICON_SZ = 432;
const ADAPTIVE_PAD     = (ADAPTIVE_TOTAL - ADAPTIVE_ICON_SZ) / 2; // 108px each side

// Brand background colors for flatten operations (removes alpha channel)
const BRAND_BG      = { r: 253, g: 240, b: 224, alpha: 1 }; // #FDF0E0  Rustic Trade parchment (light)
const BRAND_BG_DARK = { r:  42, g:  21, b:   6, alpha: 1 }; // #2A1506  Rustic Trade dark brown

// ── Export manifest ───────────────────────────────────────────────────────────
//
// flatten: true  → composite onto solid brand bg (removes alpha)
//                  required for iOS App Store primary icon
// src:           → override SVG source (defaults to SVG_SRC)
// flattenBg:     → override flatten background color (defaults to BRAND_BG)
// note:          → shown in completion summary

const ICONS = [
  // iOS — light (any/default)
  { name: 'icon.png',         size: 1024, flatten: true,  note: 'Expo app icon / App Store listing (no alpha)' },
  // Splash screen — separate path from icon.png to bust iOS launch screen cache
  { name: '../splash.png',    size: 1024, flatten: true,  note: 'Splash screen (store-assets/splash.png — dedicated path)' },
  // iOS — dark + tinted (iOS 18 / iOS 26)
  { name: 'icon-dark.png',    size: 1024, flatten: true,  src: SVG_DARK_SRC, flattenBg: BRAND_BG_DARK, note: 'Dark + tinted mode icon for iOS 18+ (no alpha)' },
  { name: 'icon-60@2x.png',   size: 120,                  note: 'iPhone home @2x' },
  { name: 'icon-60@3x.png',   size: 180,                  note: 'iPhone home @3x' },
  { name: 'icon-76.png',      size: 76,                   note: 'iPad home @1x' },
  { name: 'icon-76@2x.png',   size: 152,                  note: 'iPad home @2x' },
  { name: 'icon-83.5@2x.png', size: 167,                  note: 'iPad Pro home @2x' },
  { name: 'icon-40@2x.png',   size: 80,                   note: 'Spotlight @2x' },
  { name: 'icon-40@3x.png',   size: 120,                  note: 'Spotlight @3x' },
  { name: 'icon-29@2x.png',   size: 58,                   note: 'Settings @2x' },
  { name: 'icon-29@3x.png',   size: 87,                   note: 'Settings @3x' },
  { name: 'icon-20@2x.png',   size: 40,                   note: 'Notification @2x' },
  { name: 'icon-20@3x.png',   size: 60,                   note: 'Notification @3x' },
  // Android
  { name: 'icon-512.png',     size: 512,                  note: 'Play Store listing icon' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(str, len) {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

// Renders SVG at the given size and returns a white-on-transparent PNG buffer.
// Every pixel that has any opacity becomes solid white; fully transparent
// pixels stay transparent. Used for Android Material You themed icons.
async function generateMonochrome(svgBuf, size) {
  const { data, info } = await sharp(svgBuf, { density: Math.ceil((size / 1024) * 300 + 72) })
    .resize(size, size, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const pixels = new Uint8Array(data);
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i + 3] > 0) {
      pixels[i]     = 255; // R → white
      pixels[i + 1] = 255; // G → white
      pixels[i + 2] = 255; // B → white
    }
  }

  return sharp(Buffer.from(pixels), {
    raw: { width: info.width, height: info.height, channels: 4 },
  }).png({ compressionLevel: 9 });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!fs.existsSync(SVG_SRC)) {
    console.error(`\n  ERROR: SVG source not found at:\n  ${SVG_SRC}\n`);
    process.exit(1);
  }

  fs.mkdirSync(OUT_DIR, { recursive: true });

  const svgBuffer = fs.readFileSync(SVG_SRC);

  console.log('\n  Rolodeck — Icon Generator');
  console.log('  ─────────────────────────────────────────\n');

  // ── Standard icon exports ─────────────────────────────────────────────────

  for (const { name, size, flatten, src, flattenBg, note } of ICONS) {
    const iconBuf = src ? fs.readFileSync(src) : svgBuffer;
    let pipeline = sharp(iconBuf, { density: Math.ceil((size / 1024) * 300 + 72) })
      .resize(size, size, { fit: 'cover' });

    if (flatten) {
      pipeline = pipeline.flatten({ background: flattenBg || BRAND_BG });
    }

    await pipeline
      .png({ compressionLevel: 9 })
      .toFile(path.join(OUT_DIR, name));

    console.log(`  ✓  ${pad(name, 28)} ${size}×${size}   ${note}`);
  }

  // ── Adaptive icon foreground ──────────────────────────────────────────────
  // Source is adaptive-icon-fg.svg — clipboard-only, no cream bg rect.
  // Cream comes from adaptive-icon-bg.png so the launcher composite matches
  // the Play Store hi-res icon at the same visual scale.

  const adaptiveFgSvg = fs.readFileSync(SVG_ADAPTIVE_FG);

  const fgBuffer = await sharp(adaptiveFgSvg, { density: 300 })
    .resize(ADAPTIVE_ICON_SZ, ADAPTIVE_ICON_SZ, { fit: 'cover' })
    .toBuffer();

  await sharp(fgBuffer)
    .extend({
      top:        ADAPTIVE_PAD,
      bottom:     ADAPTIVE_PAD,
      left:       ADAPTIVE_PAD,
      right:      ADAPTIVE_PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png({ compressionLevel: 9 })
    .toFile(path.join(OUT_DIR, 'adaptive-icon-fg.png'));

  console.log(`  ✓  ${'adaptive-icon-fg.png'.padEnd(28)} ${ADAPTIVE_TOTAL}×${ADAPTIVE_TOTAL}   Android adaptive foreground (transparent bg, safe-zone padded)`);

  // ── Adaptive icon background ──────────────────────────────────────────────

  await sharp({
    create: {
      width:    ADAPTIVE_TOTAL,
      height:   ADAPTIVE_TOTAL,
      channels: 4,
      background: BRAND_BG,
    },
  })
    .png()
    .toFile(path.join(OUT_DIR, 'adaptive-icon-bg.png'));

  console.log(`  ✓  ${'adaptive-icon-bg.png'.padEnd(28)} ${ADAPTIVE_TOTAL}×${ADAPTIVE_TOTAL}   Android adaptive background (#FDF0E0 solid)`);

  // ── Android monochrome (Material You themed icon) ─────────────────────────
  // Use the clipboard-only SVG too — otherwise the cream bg rect (fully
  // opaque) becomes a solid white square in the silhouette pass.
  // Render into the safe zone so the silhouette has the same scale as the
  // foreground composite.

  const monoFgBuffer = await sharp(adaptiveFgSvg, { density: 300 })
    .resize(ADAPTIVE_ICON_SZ, ADAPTIVE_ICON_SZ, { fit: 'cover' })
    .toBuffer();
  const monoPaddedBuffer = await sharp(monoFgBuffer)
    .extend({
      top:        ADAPTIVE_PAD,
      bottom:     ADAPTIVE_PAD,
      left:       ADAPTIVE_PAD,
      right:      ADAPTIVE_PAD,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .png()
    .toBuffer();
  const monoPipeline = await generateMonochrome(monoPaddedBuffer, ADAPTIVE_TOTAL);
  await monoPipeline.toFile(path.join(OUT_DIR, 'adaptive-icon-monochrome.png'));

  console.log(`  ✓  ${'adaptive-icon-monochrome.png'.padEnd(28)} ${ADAPTIVE_TOTAL}×${ADAPTIVE_TOTAL}   Android Material You themed icon (white silhouette, transparent bg)`);

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log('\n  ─────────────────────────────────────────');
  console.log(`  ${ICONS.length + 3} files written (store-assets/splash.png + store-assets/icons/)`);
  console.log(`  Source: store-assets/icon.svg\n`);
}

main().catch((err) => {
  console.error('\n  ERROR:', err.message);
  if (err.message.includes('Cannot find module')) {
    console.error('  Run:  npm install  (installs sharp from devDependencies)\n');
  }
  process.exit(1);
});
