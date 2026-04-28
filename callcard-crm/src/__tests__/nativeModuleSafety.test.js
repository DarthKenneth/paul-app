// =============================================================================
// nativeModuleSafety.test.js - Static checks for native-module landmines
// Version: 1.0
// Last Updated: 2026-04-28
//
// PROJECT:      Rolodeck (project v1.5)
//
// PURPOSE:
//   Catch the class of bug where a native module's namespace export changes
//   shape between SDK versions, breaking previously-valid `import * as X` code
//   silently at runtime. The original incident: `expo-file-system` v55 turned
//   FileSystem.writeAsStringAsync into a function that throws at runtime, but
//   the import line itself still resolved — Jest, type-checks, and CI all let
//   the bad code through. This file scans source for known-risky patterns and
//   fails if any reappear, so the next regression of this kind is caught at
//   test time instead of in a TestFlight crash report.
//
//   Add new patterns here whenever an SDK migration trips us up.
//
// CHANGE LOG:
// v1.0  2026-04-28  Claude  Initial — guards against direct expo-file-system
//                            namespace import (must use /legacy until migrated
//                            to the new File/Directory API)
// =============================================================================

const fs   = require('fs');
const path = require('path');

const SRC_ROOT = path.resolve(__dirname, '..');
const APP_FILE = path.resolve(__dirname, '..', '..', 'App.js');

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    if (entry.name === '__tests__') continue;
    if (entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (/\.(js|jsx|ts|tsx)$/.test(entry.name)) files.push(full);
  }
  return files;
}

function listSourceFiles() {
  const files = walk(SRC_ROOT);
  if (fs.existsSync(APP_FILE)) files.push(APP_FILE);
  return files;
}

function findMatches(pattern) {
  const offenders = [];
  for (const file of listSourceFiles()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, idx) => {
      // Strip line/block comments (best-effort) — we want to catch real imports,
      // not historical changelog references.
      const stripped = line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '');
      if (pattern.test(stripped)) {
        offenders.push(`${path.relative(SRC_ROOT + '/..', file)}:${idx + 1}  ${line.trim()}`);
      }
    });
  }
  return offenders;
}

describe('Native module safety guards', () => {
  test('no source file imports expo-file-system without /legacy suffix', () => {
    // SDK 55 moved the namespace exports to a class-based API. The old
    // namespace re-exports throw at runtime ("getInfoAsync imported from
    // expo-file-system is deprecated. This method will throw in runtime.").
    // Until this codebase is migrated to the File/Directory class API,
    // every import must come from the supported legacy module.
    const offenders = findMatches(
      /from\s+['"]expo-file-system['"]\s*;?\s*$/,
    );
    if (offenders.length) {
      throw new Error(
        'Found direct expo-file-system imports — these throw at runtime in SDK 55.\n' +
        'Use `import * as FileSystem from "expo-file-system/legacy"` instead.\n\n' +
        offenders.join('\n'),
      );
    }
  });

  test('no source file uses Alert.alert with raw err.message as body', () => {
    // Curated user-facing copy only. Use reportAndShow() from
    // src/utils/errorReporting instead. Raw err.message has leaked
    // internal strings ("Cannot read property UTF8 of undefined") to users.
    const offenders = findMatches(
      /Alert\.alert\([^)]*,\s*(?:err|e|error)\.message\s*[),]/,
    );
    if (offenders.length) {
      throw new Error(
        'Found Alert.alert calls that pass raw err.message as the body.\n' +
        'Use reportAndShow() from utils/errorReporting.js with curated fallback copy instead.\n\n' +
        offenders.join('\n'),
      );
    }
  });

  test('no source file uses ImagePicker.MediaTypeOptions (deprecated enum)', () => {
    // Was deprecated in expo-image-picker; current API is `mediaTypes: ['images']`
    const offenders = findMatches(
      /ImagePicker\.MediaTypeOptions/,
    );
    if (offenders.length) {
      throw new Error(
        'Found deprecated ImagePicker.MediaTypeOptions usage.\n' +
        'Use the string-array API instead, e.g. mediaTypes: ["images"].\n\n' +
        offenders.join('\n'),
      );
    }
  });
});
