---
name: Mossvale statistics
description: Public player and economy charts within Mossvale's woodland identity.
colors:
  forest: "#203d31"
  green: "#28734c"
  moss-bar: "#628553"
  partial-bar: "#bbcbb1"
  ground: "#f5f7f3"
  surface: "#ffffff"
  text: "#26352d"
  muted: "#58685c"
  line: "#d4ded0"
  chart-fill: "#e9f2e4"
  focus: "#b37e29"
typography:
  headline:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "36px"
    fontWeight: 400
    lineHeight: 1.2
  title:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "25px"
    fontWeight: 400
    lineHeight: 1.2
  body:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    lineHeight: 1.5
  label:
    fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
    fontSize: "13px"
    fontWeight: 600
rounded:
  control: "4px"
components:
  button:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.forest}"
    rounded: "{rounded.control}"
    padding: "7px 13px"
  range-selected:
    backgroundColor: "{colors.forest}"
    textColor: "{colors.surface}"
---

# Design System: Mossvale statistics

## Overview

This records the built statistics surface in `index.html`, `style.css`, and `client.js`. The user requested familiar SteamDB-inspired charts, retaining Mossvale's authored wordmark, forest masthead, Marcellus headings, and light content surfaces. The existing Mossvale identity is the visual authority; this page does not establish a replacement identity.

The implementation uses native HTML controls and SVG charts without a charting dependency. The desktop and mobile captures in `../artifacts/stats/desktop-final.png` and `../artifacts/stats/mobile-final.png` show synthetic verification data, not production statistics.

## Colors

### Primary

Forest anchors the masthead and selected time range. Green identifies concurrency and the live population. Moss bars encode hourly activity; pale partial bars distinguish incomplete hours. Focus uses an amber outline independent of data colors.

### Neutral

The pale ground, white chart and table surfaces, muted secondary text, and subdued dividers keep dense data readable. Chart fill is a light green wash below the concurrent line.

## Typography

Marcellus is locally served with Georgia and serif fallbacks. It supplies the page and section headings; system sans-serif supplies figures, controls, axes, and explanatory copy. Numbers use tabular figures where alignment matters.

The main heading reduces to 29px and section headings to 23px below 640px. Desktop metrics use 38px figures, with smaller MOSS figures to accommodate long amounts. Axis labels are 11px, table content 13px, and supporting copy generally 11–14px.

## Layout

The masthead and main content use a centered 1216px container with 28px horizontal padding. Six totals in a three-column desktop grid precede the full-width concurrent chart. Hourly activity and live realm counts share the next row; history and definitions follow below.

At 900px spacing contracts and headings wrap. At 640px the metrics become a two-column grid, chart controls fill a row, hourly activity and realm counts stack, definitions become one column, and horizontal page padding becomes 18px. The history table scrolls inside its own focusable region. SVG viewBoxes are recalculated from rendered width so mobile axes remain legible.

## Elevation & Depth

The interface is flat: white surfaces, background tones, and thin dividers establish hierarchy. It uses no shadows, decorative gradients, or chart animation.

## Shapes

Chart and table regions are rectangular. Buttons have lightly rounded corners; the joined time-range buttons round only the group's outer corners. The native range slider follows platform behavior with the chart's green accent.

## Components

- **Masthead:** authored wordmark, statistics label, and direct Wiki and Play Mossvale links.
- **Totals:** online population, recorded 24-hour peak, registered accounts, confirmed MOSS auction spending, finalized voucher payouts, and the current active treasury balance; unavailable totals use an em dash with explanatory text.
- **Concurrent chart:** 24-hour, 7-day, 30-day, and all-time controls; pointer inspection and a labeled keyboard-operable time slider share a timestamped text readout. Missing readings break the line.
- **Hourly chart:** a separate series of unique accounts per UTC hour. Partial hours use the lighter bar treatment; exact values and coverage appear in the table.
- **Realm list:** named EU, North American, and Asian populations with explicit reporting status.
- **History table:** scoped column headings, alternating row tones, progressive disclosure, and CSV download.
- **Feedback:** loading, unavailable, partial-realm, and stale-data messages remain textual. A skip link, visible focus rings, SVG titles, and live readout support non-pointer use.

## Do's and Don'ts

- Preserve the existing wordmark, forest masthead, and Marcellus heading family.
- Keep concurrency and hourly unique-account activity distinct, with UTC labels and exact table values.
- Preserve native keyboard controls and keep missing observations visibly missing.
- Do not fill absent history with zeros or interpolate over reporting gaps.
- Do not add decorative imagery or motion that competes with the charts.
