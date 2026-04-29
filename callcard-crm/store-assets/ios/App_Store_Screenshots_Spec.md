# App Store Screenshot Specifications — Rolodeck

---

## Required Devices

| Device | Resolution | Required? |
|--------|-----------|-----------|
| iPhone 14 Pro Max (6.7") | 1290×2796 | **Required** (primary) |
| iPhone SE / 8 (4.7") | 750×1334 | Required |
| iPad Pro 12.9" (6th gen) | 2048×2732 | Optional (if tablet layout added) |

---

## Screenshot Set (6 primary, 8 optional)

All screenshots: Rolodeck Classic theme unless otherwise noted.
All should include a subtle overlay tagline (white text, dark scrim at bottom).

---

### Screenshot 1 — Customer List (Hero)

**Screen:** CustomersScreen
**State:** 7–8 sample customers visible; sort set to "Name"; search bar empty
**Sample data:** Mix of customer names (plumbing/HVAC context), varied service
  statuses — 2 overdue (red badge), 1 due in 14 days (orange), rest green/ok
**Tagline overlay:** "Every customer, perfectly organized."
**Notes:** Shows the core value prop immediately. FAB visible bottom-right.

---

### Screenshot 2 — Customer Detail

**Screen:** CustomerDetailScreen
**State:** Full customer info visible (name, email, phone, address, zip);
  service status badge showing "Overdue by 12 days" in red;
  service log showing 3 entries (most recent first)
**Tagline overlay:** "Full history at a glance."

---

### Screenshot 3 — Services Alert View

**Screen:** ServicesScreen
**State:** "Overdue" filter active; 4 customers listed with red "Overdue by N days"
  badges; urgency-sorted
**Tagline overlay:** "Never miss a service date."
**Notes:** This is the key differentiating screen — shows the annual reminder value.

---

### Screenshot 4 — Add Service Entry

**Screen:** AddServiceScreen
**State:** "Service" toggle selected; date field filled (today's date);
  notes field mid-input: "Replaced filter, checked pressure, all systems normal"
**Tagline overlay:** "Log a service in seconds."

---

### Screenshot 5 — Settings + Themes

**Screen:** SettingsScreen
**State:** Theme picker visible showing all 4 swatches; "Midnight" theme currently
  active (so the whole screenshot is in dark mode)
**Tagline overlay:** "Four themes. Your style."
**Notes:** Shows both feature depth (themes) and that a dark mode exists.

---

### Screenshot 6 — Midnight Theme Customer List

**Screen:** CustomersScreen, Midnight theme
**State:** Same customer list as Screenshot 1, but in dark purple/cream palette
**Tagline overlay:** "Day or night mode — you choose."
**Notes:** Reinforces the theme feature and shows dark mode polish.

---

### Screenshot 7 — Search in Action (optional)

**Screen:** CustomersScreen
**State:** Search bar active with "Smith" typed; 2 results shown
**Tagline overlay:** "Find anyone instantly."

---

### Screenshot 8 — Send Invoice (optional, for post-Square launch)

**Screen:** CustomerDetailScreen with InvoiceButton modal open
**State:** Dollar amount "149.00" entered
**Tagline overlay:** "Invoice customers in two taps."
**Notes:** Hold until Square integration ships.

---

## Design Notes

- Use real-looking (but fictional) customer names and service data
- Service log notes should be realistic: "Replaced anode rod, flushed water heater",
  "Annual AC tune-up, replaced filters", "Fixed slow drain in master bath", etc.
- Avoid any real personal information
- Overlay taglines: DM Serif Display, 32–36pt, white, centered, with 40% black scrim
  on bottom third of image
- Consistent safe area margins on all screenshots
