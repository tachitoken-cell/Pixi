---
version: 1
slug: "stats-index-html"
primary_target: "stats/index.html"
related_targets: ["stats/style.css","stats/client.js"]
---

# Mossvale public statistics

Mode: Operate.

The visitor checks current population, compares concurrent-player history with unique accounts active per UTC hour, and inspects registered-account and confirmed MOSS-auction totals, finalized voucher payouts, and the active treasury balance. Both chart definitions were explicitly confirmed by the user.

The user pinned a familiar SteamDB-inspired statistics layout inside Mossvale's existing identity. Use the authored wordmark, forest masthead, Marcellus headings, light chart content, and green data marks documented in `stats/DESIGN.md`. The pinned layout is the composition authority; no generated composition was used.

The first viewport presents compact navigation, the page title, six headline totals in a three-column desktop grid, and the concurrent-player chart with period controls. Hourly activity and realm counts follow, then a downloadable history table and short definitions. Preserve the mobile two-column totals and stacked chart sections.

Concurrent counts measure simultaneous connected world sessions. Hourly activity counts unique accounts during each UTC hour. Missing readings stay empty, unavailable realms remain explicit, and partial hours are identified. Pointer inspection has a labeled native slider and text readout; the hourly table supplies exact values.

Verification captures: `artifacts/stats/desktop-final.png` and `artifacts/stats/mobile-final.png`. These contain synthetic preview data and establish visual evidence only.
