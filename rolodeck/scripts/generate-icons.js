// =============================================================================
// generate-icons.js - Generates all required app icon PNGs from icon.svg
// Version: 1.1
// Last Updated: 2026-04-09
//
// PROJECT:      Rolodeck (project v1.10)
// FILES:        scripts/generate-icons.js       (this file — icon pipeline)
//               store-assets/icon.svg            (light icon master source)
//               store-assets/icon-dark.svg       (dark icon master source)
//               store-assets/icons/              (output directory)
//               plugins/withDarkIcon.js          (consumes icon-dark.png)
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
//   - icon-dark.png (1024) is flattened with dark brand bg — used by the
//     withDarkIcon config plugin for iOS 18 dark mode icon support
//   - adaptive-icon-fg.png: icon centered with padding to respect the Android
//     adaptive icon 72dp safe zone (icon occupies center 72/108 = 66.7%)
//   - adaptive-icon-bg.png: solid #C6ECEA fill, same dimensions
//   - Outputs file list summary to stdout on completion
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// v1.1  2026-04-09  Claude  Dark icon support
//         - Added SVG_DARK_SRC and BRAND_BG_DARK constants
//         - Added icon-dark.png entry with per-entry src/flattenBg overrides
//         - Updated render loop to use per-icon src and flattenBg if present
// =============================================================================

'use strict';

const sharp  = require('sharp');
const fs     = require('fs');
const path   = require('path');

const ROOT         = path.join(__dirname, '..');
const SVG_SRC      = path.join(ROOT, 'store-assets', 'icon.svg');
const SVG_DARK_SRC = path.join(ROOT, 'store-assets', 'icon-dark.svg');
const OUT_DIR      = path.join(ROOT, 'store-assets', 'icons');

// Adaptive icon dimensions: 648px = 108dp @ xxxhdpi (6x baseline)
// Safe zone = inner 432px (72dp) = center 66.7%
// Icon fills the safe zone; padding on each side = (648 - 432) / 2 = 108px
const ADAPTIVE_TOTAL   = 648;
const ADAPTIVE_ICON_SZ = 432;
const ADAPTIVE_PAD     = (ADAPTIVE_TOTAL - ADAPTIVE_ICON_SZ) / 2; // 108px each side

// Brand background colors for flatten operations (removes alpha channel)
const BRAND_BG      = { r: 198, g: 236, b: 234, alpha: 1 }; // #C6ECEA  (light)
const BRAND_BG_DARK = { r:  14, g:  36, b:  34, alpha: 1 }; // #0E2422  (dark)

// ── Export manifest ───────────────────────────────────────────────────────────
//
// flatten: true  → composite onto solid brand bg (removes alpha)
//                  required for iOS App Store primary icon
// src:           → override SVG source (defaults to SVG_SRC)
// flattenBg:     → override flatten background color (defaults to BRAND_BG)
// note:          → shown in completion summary

const ICONS = [
  // iOS — light (default)
  { name: 'icon.png',         size: 1024, flatten: true, note: 'Expo app icon / App Store listing (no alpha)' },
  // iOS — dark (iOS 18 automatic dark mode icon)
  { name: 'icon-dark.png',    size: 1024, flatten: true, src: SVG_DARK_SRC, flattenBg: BRAND_BG_DARK, note: 'Dark mode icon for iOS 18+ (no alpha)' },
  { name: 'icon-60@2x.png',   size: 120,                 note: 'iPhone home @2x' },
  { name: 'icon-60@3x.png',   size: 180,                 note: 'iPhone home @3x' },
  { name: 'icon-76.png',      size: 76,                  note: 'iPad home @1x' },
  { name: 'icon-76@2x.png',   size: 152,                 note: 'iPad home @2x' },
  { name: 'icon-83.5@2x.png', size: 167,                 note: 'iPad Pro home @2x' },
  { name: 'icon-40@2x.png',   size: 80,                  note: 'Spotlight @2x' },
  { name: 'icon-40@3x.png',   size: 120,                 note: 'Spotlight @3x' },
  { name: 'icon-29@2x.png',   size: 58,                  note: 'Settings @2x' },
  { name: 'icon-29@3x.png',   size: 87,                  note: 'Settings @3x' },
  { name: 'icon-20@2x.png',   size: 40,                  note: 'Notification @2x' },
  { name: 'icon-20@3x.png',   size: 60,                  note: 'Notification @3x' },
  // Android
  { name: 'icon-512.png',     size: 512,                 note: 'Play Store listing icon' },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(str, len) {
  return str.length >= len ? str : str + ' '.repeat(len - str.length);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  // Validate source
  if (!fs.existsSync(SVG_SRC)) {
    console.error(`\n  ERROR: SVG source not found at:\n  ${SVG_SRC}\n`);
    process.exit(1);
  }

  // Ensure output directory exists
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

    console.log(`  ✓  ${pad(name, 24)} ${size}×${size}   ${note}`);
  }

  // ── Adaptive icon foreground ──────────────────────────────────────────────

  const fgBuffer = await sharp(svgBuffer, { density: 300 })
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

  console.log(`  ✓  ${'adaptive-icon-fg.png'.padEnd(24)} ${ADAPTIVE_TOTAL}×${ADAPTIVE_TOTAL}   Android adaptive foreground (transparent bg, safe-zone padded)`);

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

  console.log(`  ✓  ${'adaptive-icon-bg.png'.padEnd(24)} ${ADAPTIVE_TOTAL}×${ADAPTIVE_TOTAL}   Android adaptive background (#C6ECEA solid)`);

  // ── Done ──────────────────────────────────────────────────────────────────

  console.log('\n  ─────────────────────────────────────────');
  console.log(`  ${ICONS.length + 2} files written to store-assets/icons/`);  // +2 = adaptive-icon-fg + adaptive-icon-bg
  console.log(`  Source: store-assets/icon.svg\n`);
}

main().catch((err) => {
  console.error('\n  ERROR:', err.message);
  if (err.message.includes('Cannot find module')) {
    console.error('  Run:  npm install  (installs sharp from devDependencies)\n');
  }
  process.exit(1);
});
