// =============================================================================
// index.js - Profession registry
// Version: 1.0
// Last Updated: 2026-04-23
//
// PROJECT:      Rolodeck (project v0.26)
// FILES:        index.js   (this file — registry)
//               water.js   (water treatment preset)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Add future profession imports here and include them in PROFESSIONS
//   - DEFAULT_PROFESSION_KEY must always be a valid key in PROFESSIONS
//   - ProfessionContext reads this registry on startup
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial registry — water treatment only
// =============================================================================

import { water } from './water';

export const PROFESSIONS = { water };

export const DEFAULT_PROFESSION_KEY = 'water';
