# Icon Exports

Master source: `../icon.svg` (1024×1024 artboard)

All PNGs in this directory are **generated from the SVG**. Never edit them directly —
edit `icon.svg` then re-run the generator.

---

## Generate all icons

```bash
# From the rolodeck/ project root:
npm install      # installs sharp (devDependency)
npm run icons    # runs scripts/generate-icons.js
```

That's it. All files below will appear in this directory.

---

## Generated files

### iOS

| File | Size | Usage |
|------|------|-------|
| `icon.png` | 1024×1024 | Expo app icon + App Store listing (**no alpha channel**) |
| `icon-60@2x.png` | 120×120 | iPhone home screen @2x |
| `icon-60@3x.png` | 180×180 | iPhone home screen @3x |
| `icon-76.png` | 76×76 | iPad home screen @1x |
| `icon-76@2x.png` | 152×152 | iPad home screen @2x |
| `icon-83.5@2x.png` | 167×167 | iPad Pro home screen @2x |
| `icon-40@2x.png` | 80×80 | Spotlight @2x |
| `icon-40@3x.png` | 120×120 | Spotlight @3x |
| `icon-29@2x.png` | 58×58 | Settings @2x |
| `icon-29@3x.png` | 87×87 | Settings @3x |
| `icon-20@2x.png` | 40×40 | Notification @2x |
| `icon-20@3x.png` | 60×60 | Notification @3x |

### Android

| File | Size | Usage |
|------|------|-------|
| `icon-512.png` | 512×512 | Play Store listing icon |
| `adaptive-icon-fg.png` | 648×648 | Adaptive icon foreground (icon in safe zone, transparent bg) |
| `adaptive-icon-bg.png` | 648×648 | Adaptive icon background (solid `#C6ECEA`) |

---

## How `app.json` uses these

```json
"icon": "./store-assets/icons/icon.png",
"android": {
  "adaptiveIcon": {
    "foregroundImage": "./store-assets/icons/adaptive-icon-fg.png",
    "backgroundColor": "#C6ECEA"
  }
}
```

These paths are already set in `app.json`. Run `npm run icons` once and Expo
will pick everything up automatically.
