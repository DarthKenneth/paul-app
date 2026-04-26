// =============================================================================
// water.js - Water Treatment profession preset
// Version: 1.1.1
// Last Updated: 2026-04-25
//
// PROJECT:      Callout (project v1.3.0)
// FILES:        water.js   (this file — water treatment config)
//               index.js   (profession registry — imports this)
//
// Copyright © 2026 ArdinGate Studios LLC. All rights reserved.
//
// ARCHITECTURE:
//   - serviceTypes IDs 'service' and 'install' preserved for backward compat
//     with existing stored entries; 'salt_delivery' and 'water_test' are new
//   - settingsKey is unused for new types (durations come from typeDurations
//     in ProfessionContext, not scheduleSettings); kept on service/install for
//     legacy schedule settings migration path
//   - install: true marks the type that gets rust-colored save button and
//     "Initial {label}" on the oldest log entry
//   - customLists provide default items; user overrides stored per-profession
//     in @callout_lists_water
//   - checklist items have type 'check' (boolean) or 'measure' (numeric value)
//   - equipmentFields: per-customer site/equipment info stored on customer.equipment
//   - entryFields: per-visit dropdowns shown on the Add Service form;
//     source refers to a customList key
//
// CHANGE LOG:
// v1.0  2026-04-23  Claude  Initial preset — Routine Service + Equipment Install only
// v1.1  2026-04-23  Claude  Full water treatment preset
//       - Added Salt Delivery and Water Test service types
//       - Added customLists: Equipment Types, Brands, Salt Types
//       - Added checklist: Hardness, Iron, Salt level, Brine clean, Bypass, Regen
//       - Added equipmentFields and entryFields
// v1.1.1  2026-04-25  Claude  Update project block + storage key comment reference
// =============================================================================

export const water = {
  id:      'water',
  name:    'Water Treatment',
  emoji:   '💧',
  tagline: 'Softeners, RO systems, filters, whole-home water',

  defaultIntervalDays: 365,

  serviceTypes: [
    {
      id:          'service',
      label:       'Routine Service',
      icon:        'construct-outline',
      defaultMins: 30,
      settingsKey: 'serviceMins',
    },
    {
      id:          'install',
      label:       'Equipment Install',
      icon:        'home-outline',
      defaultMins: 150,
      settingsKey: 'installMins',
      install:     true,
    },
    {
      id:          'salt_delivery',
      label:       'Salt Delivery',
      icon:        'bag-handle-outline',
      defaultMins: 15,
    },
    {
      id:          'water_test',
      label:       'Water Test',
      icon:        'flask-outline',
      defaultMins: 20,
    },
  ],

  customLists: [
    {
      key:   'equipmentTypes',
      label: 'Equipment Types',
      items: [
        'Softener',
        'RO System',
        'UV Sterilizer',
        'Iron Filter',
        'Sediment Filter',
        'Carbon Filter',
        'Well Tank',
        'Whole-House Filter',
      ],
    },
    {
      key:   'brands',
      label: 'Brands',
      items: [
        'Fleck',
        'Clack',
        'Culligan',
        'Kinetico',
        'RainSoft',
        'GE',
        'Whirlpool',
        'WaterBoss',
      ],
    },
    {
      key:   'saltTypes',
      label: 'Salt Types',
      items: [
        'Solar crystal',
        'Pellets',
        'Potassium chloride',
        'Rock salt',
        'Iron Out',
      ],
    },
  ],

  checklist: [
    { id: 'hardness',    label: 'Hardness (gpg)',   type: 'measure' },
    { id: 'iron',        label: 'Iron (ppm)',        type: 'measure' },
    { id: 'salt_level',  label: 'Salt level',        type: 'check'   },
    { id: 'brine_clean', label: 'Brine tank clean',  type: 'check'   },
    { id: 'bypass',      label: 'Bypass verified',   type: 'check'   },
    { id: 'regen',       label: 'Regen cycle test',  type: 'check'   },
  ],

  equipmentFields: [
    { key: 'softener', label: 'Softener', kind: 'text' },
    { key: 'saltType', label: 'Salt type', kind: 'dropdown', source: 'saltTypes' },
    { key: 'source',   label: 'Source',   kind: 'text' },
  ],

  entryFields: [
    { key: 'equipmentServiced', label: 'Equipment Serviced', source: 'equipmentTypes', optional: false },
    { key: 'saltUsed',          label: 'Salt Used',          source: 'saltTypes',      optional: true  },
  ],
};
