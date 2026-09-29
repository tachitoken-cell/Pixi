---
name: Mossvale game interface
description: Mossvale's established woodland fantasy interface, with readable quest and NPC flows.
colors:
  forest: "#06291e"
  forest-raised: "#0c3020"
  parchment-ink: "#443723"
  text: "#f5e7b8"
  text-secondary: "#c8d8ae"
  gold: "#e2c783"
  focus: "#f4d28a"
typography:
  title:
    fontFamily: "Marcellus, Georgia, serif"
    fontSize: "24px"
    lineHeight: 1.25
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "13px"
    lineHeight: 1.6
  compactHud:
    fontFamily: "Mossvale HUD, DM Sans, sans-serif"
spacing:
  compact: "8px"
  related: "12px"
  group: "16px"
  window: "30px"
---

## Overview

Keep the established Mossvale visual identity. The user's September 28 direction retains the game's style while focusing on quests, animation and useful UI improvements. The September 29 implementation takes Benji's composition as the layout reference: a separated desktop HUD, five-skill touch arc, full-screen mobile menu, quest folio, searchable catalogs and list/detail service windows. The reference contributes layout, interaction patterns, icons and UI samples. Mossvale retains its own fonts, painted artwork and woodland materials.

This record describes the local `benji-updates-sep28` worktree. All 36 public exports in the supplied reference map to 32 actual game surfaces, with desktop, portrait and landscape composition. The refreshed 99-view capture and final affected-view confirmation passed with both original fonts loaded; independent visual review and built-game results are recorded in the review document. No merge, deployment or native-store release is asserted. Review evidence and source gaps belong in `docs/design/ui-2026-09-28/review.md` and the task's QA records.

## Colors

Oak, parchment, deep forest green and antique gold provide the material palette. Parchment uses dark brown ink; forest panels use warm cream with muted green copy. Gold marks headings, selection and rewards. Existing rarity, health, currency and warning meanings remain intact.

## Typography

Marcellus carries window and quest titles; DM Sans carries controls, descriptions and numerical state. The condensed Mossvale HUD face remains in compact combat labels. The supplied reference's Outfit typography is not the game's type system. Larger quest titles establish hierarchy without changing the established title lettering.

## Layout

**Source composition, Mossvale materials.** Apply the authored layout to the existing game controls and state. Do not replace a live surface with a screenshot or a prototype's simulated balance, player or event.

- The desktop HUD has a compact live player portrait and health display at the upper left, the minimap and tracked quest card at the upper right, a centered ability bar with XP above it, and a separate two-row menu dock at the lower right. Saved HUD scaling still applies; the menu lifts clear of the action bar when needed. Touch devices show the player and quest at the upper left, minimap and Menu at the upper right, a left joystick with Sprint/Jump and a five-skill arc around Attack at the lower right. Twenty skills span four mobile pages. The full-screen menu has labelled buttons, Close, Escape and contained keyboard focus; opening it cancels gameplay input. Saved touch-control group positions still apply.
- The quest folio places an active/completed quest list beside an objective and reward sheet on desktop. At narrow widths, selection opens the detail sheet with a return-to-list control. The existing campaign remains accessible in a collapsible section. Tracked story progress and rewards appear in the HUD, while starter guidance and instance objectives retain their own context.
- Backpack opens directly from the bag shortcut. Search, capacity tabs, category filters, sorting and item grid/list controls act on the current inventory. Character remains a separate entry with its equipment view. Item inspection and actions retain their existing artwork and authoritative item identities.
- Trainer and merchant windows keep a list and selected detail pane together on desktop. Mobile places the same detail/action block immediately beneath its selected row, with primary touch actions at least 44px tall. Trainers show counted availability filters; shops retain Buy/Sell, counted categories, pagination and quantity controls. Real gold and bag capacity remain visible in the footer. Story choices stay alongside NPC services.

- Bank presents both real storage grids on desktop and tabs on phones; search does not change slot identities. Auction details appear below the selected mobile listing. Store and NFT pages keep exact quotes and ownership states.
- Spellbook search includes locked skills with a persistent inspector. Talent branches become mobile tabs. Workshop rank progress, friend grouping, achievement completion and companion collection filters operate on the existing catalogs.
- Arena shows the best current bracket and next rank. The dungeon catalog leads into selected requirements, encounters, party, rewards and entry actions. Instant Combat and raid panels expose actual timing, routes, rewards and progress. The specialist pause is explicit.
- Loading reports completed startup components, without fabricated download percentages. Login retains provider-owned authentication. Wallet asset summaries and native scrolling tabs retain the existing explicit review and recovery flows.

## Elevation & Depth

Use the existing oak (`/ui/wood-frame.png`), parchment (`/ui/parchment-frame.png`) and ornate forest (`/ui/redesign/panel-frame.svg`) artwork for the corresponding surfaces. Painted borders and darker inset surfaces provide the main depth cues. Story dialogue uses the journal's forest materials with a dimmed, desaturated world behind the conversation. Preserve real character/NPC canvases and reduced-motion behavior.

## Components

**One action, one state.** The selected NPC detail pane owns a single purchase or training action across desktop and mobile. Quantity fields and high-rarity sale acknowledgements are not duplicated. Learned, unavailable and pending states remain inspectable without enabling an invalid action. Refreshes retain selected-row identity, search selection, journal focus and list scrolling.

Quest navigation distinguishes tracking a destination from speaking with the nearby giver to accept or claim a quest. Authentication, nearby-NPC access, saved controls, item ownership, inventory limits and payment review remain authoritative. Loading follows genuine readiness. Tap/open/close samples use the existing effects bus, mute, background and gesture rules; combat and death audio retain their current behavior.

## Do's and Don'ts

- Do retain the minimap, original wordmark, painted controls, live portraits and saved HUD/chat scaling when applying source layouts.
- Do review populated desktop and mobile states together, including unavailable actions, empty lists and selected details. Document physical-device limits separately from browser proof.
- Don't adopt the reference's mint/Outfit/glass skin as a replacement for Mossvale's visual identity or treat every reference screen as already implemented.
- Don't present the retained level-60 cap, +5 equipment upgrade limit, paused specialist classes or paused atlas work as UI features. They are separate gameplay and project constraints; this layout record does not change them.
- Don't treat the earlier package-skin gallery or pre-correction Mossvale gallery as final proof of the September 29 layouts.

September 29 verification includes 99 actual-renderer captures across 32 desktop/phone/landscape surfaces and three narrow views, with both original fonts loaded. Final affected-view confirmation, build and wiki checks passed. The coordinator inspected all ten contact sheets, the independent assigned-scope review passed, and ten populated mobile HUD layouts plus the desktop/mobile built-game journeys passed. Actual quest/input checks are recorded separately from fixture captures; neither establishes physical iOS/Android behavior. See `docs/design/ui-2026-09-28/review.md` for current results and limitations.
