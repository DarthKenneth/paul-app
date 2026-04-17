# CLAUDE.md — Version History System

Drop this file in any repo root. Claude Code reads it automatically on session start.

---

## [Project]

**Name:** Rolodeck
**Type:** Mobile app (React Native / Expo managed workflow)
**Repo:** local
**Created:** 2026-04-03

**Version source of truth:** `/VERSION`
**Synced manifests:** `package.json "version"`, `app.json "expo.version"`

**Tier definitions for this project:**

- **MAJOR** ([X].0): Full rewrites, breaking changes to AsyncStorage schema (requires migration), major navigation restructure, engine/framework migrations
- **MINOR** (0.X.0 → 0.[X+1].0): New screens, new features, new components, new integrations, new color themes, changes that add or alter user-facing behavior
- **PATCH** (0.X.Y → 0.X.[Y+1]): Bug fixes, text/label corrections, style tweaks, minor UX polish, performance improvements with no behavior change

**Build number vs. version string:**
- EAS auto-increments the build number (CFBundleVersion) on every `eas build` — this is handled automatically and does NOT replace a version bump
- Every EAS build push MUST also carry a new version string in VERSION / app.json / package.json
  - Feature build → bump MINOR (0.23 → 0.24)
  - Fix-only build → bump PATCH (0.23 → 0.23.1, next fix build → 0.23.2)
  - Multiple fix builds in one session that haven't shipped yet can share one version bump
- The version string and build number are both visible in TestFlight; keeping them in sync is the only way to tell builds apart
- CHANGELOG entries use the version string (e.g. `## [0.23.1]`), not the build number

**Project-specific conventions:**
- Square integration changes are always minor+ (they alter a user-facing surface)
- Storage schema changes that require migration are always major

---

## Bootstrap (First Session)

**The `[Project]` section above is filled in** — this repo is set up. Read `VERSION` and
`CHANGELOG.md` to establish current state, then proceed with the user's task.

---

## Task Protocol

### Every Task That Modifies Code

Do all of these. No exceptions.

1. **File headers** — every modified file has an updated header with new file version.
2. **VERSION** — bumped if the task included any user-facing change.
3. **CHANGELOG.md** — new entry added if project version bumped.
4. **Manifest sync** — `package.json "version"` and `app.json "expo.version"` match `VERSION`.
5. **Project Block sync** — `(project vX.Y)` in every file touched this task reflects current project version.

### When Touching a File for the First Time in a Session

Read its existing header to pick up the file-level version. The on-disk header is
the source of truth — never assume a version from memory.

### User Edits Between Sessions

If files have been modified since the last session, add a User entry before Claude's
work. If scope is unclear, default to minor: `v[next minor]  [date]  User  Manual edits (details unknown)`.

---

## Project Versioning Rules

- **When to bump:** every task with user-facing changes
- **One project bump per task, max**
- **Sequencing:** patch after v1.2.1 → v1.2.2; minor resets patch (v1.3, not v1.3.0); major resets both
- **Pre-release format:** always 3 components — `0.MINOR.PATCH`. Never drop the patch (write `0.23.0`, not `0.23`). Bump to `1.0.0` when user declares ready.

---

## Changelog Format

```markdown
## [X.Y] - YYYY-MM-DD

### Added
### Changed
### Fixed
### Removed
### Security
### Infrastructure
```

Omit empty categories.

---

## File Header Rules

### Scope

Every **complete code file** Claude writes or modifies gets a version history header.
Includes: `.js`, `.jsx`, `.ts`, `.tsx`, `.json` (via sibling `_VERSION.md`), `.css`,
`.yaml`, `.env`, `Dockerfile`, etc.

Excludes: inline code snippets in explanations, generated build outputs, `node_modules`.

### Comment Syntax

- `//` — JS, TS, JSX, TSX
- `#` — Python, bash, YAML, TOML, Dockerfile, .env
- `/* */` — CSS
- `<!-- -->` — HTML, XML, SVG

JSON: use sibling `{base}_VERSION.md` file.

### Format (JS/JSX)

```
// =============================================================================
// FileName.js - One-line purpose description
// Version: 1.0
// Last Updated: 2026-04-03
//
// PROJECT:      Rolodeck (project v1.0)
// FILES:        FileName.js       (this file — role)
//               SiblingFile.js    (role)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - Key patterns and constraints
//
// CHANGE LOG:
// v1.0  2026-04-03  Claude  Initial scaffold
// =============================================================================
```

### File Versioning Tiers

| Tier | When |
|---|---|
| **Patch** (v1.0.1) | Default. Single logical purpose, any line count. |
| **Minor** (v1.1) | 2+ distinct purposes, OR new independently invocable unit, OR change alters how multiple parts interact. |
| **Major** (v2.0) | Full/near-full rewrite, fundamental architecture change. |

**One version per task.** Author tags: `User`, `Claude`. Dates: YYYY-MM-DD.

### Change Log Entry Format

| Tier | Format |
|---|---|
| Patch | Single line, complete description. No sub-bullets. |
| Minor | Brief summary label. Sub-bullets: one per mechanical edit. |
| Major | Brief summary label. Sub-bullets: one per major change area. |

History is **append-only**. Never truncate or collapse.

---

## Memory (Supplementary)

On-disk files are always source of truth. If memory and disk disagree, disk wins.
