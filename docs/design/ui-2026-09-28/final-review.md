# Independent final UI review — September 29

Scope: root-owned mobile HUD, mobile menu, entry/loading layout, dungeon browser, Arena overview and collection integration in `src/main.ts`. This review did not modify runtime files and does not independently approve this reviewer's own commerce implementation.

## Final verdict

**Pass for the assigned review scope after the bounded corrections.** No material finding from this review remains open. The font-verified desktop/mobile/landscape entry and Arena compositions remain readable; the final mobile menu has all 18 real actions. Corrected mobile headings, Dungeon reward text and party row, Achievements category rail and Store category rail were visually checked. Root's final 99-view report covers the wider source-surface inventory; this reviewer does not claim independent inspection of all 99 individual images.

The new `scripts/check-mobile-hud-layout.mjs` passes 10 populated layouts: 390×844, 768×1024, 844×390, 667×375 and 320×640, each with player/target effects hidden and active. It uses the real fixture/stylesheet, all five visible skill slots, four party members, waypoint, PvP, every real store boost, chat, stamina and a cast. It verifies original font loading, sibling non-overlap, viewport bounds, 44px interactive targets and boost-child containment, excluding only parent/child containment from overlap checks. This catches the earlier hidden-slot and capped-parent-width gaps.

Run `node scripts/build-benji-ui-review.mjs`, then `node scripts/check-mobile-hud-layout.mjs`. The script supports the repository's `MOSSVALE_PLAYWRIGHT` and `MOSSVALE_CHROME` overrides. It starts an isolated Vite server unless `MOSSVALE_UI_URL` is supplied; `MOSSVALE_HUD_REPORT` optionally writes measured bounds. Final evidence is retained at `artifacts/benji-ui/mobile-hud-layout.json`.

## Code review

- Mobile menu opening retains the existing `mobile-ui-open` cancellation path: movement keys, joystick capture, queued touch actions, auto-attack, casting, gathering and hotbar drag/hold state stop. The menu now has a named dialog, an explicit close button, Escape handling and a button focus loop. Opening an actual window closes the menu and uses the existing window controller.
- The touch layout uses the real hotbar's five-slot paging, cooldowns and saved underlying slot order. Source demo stamina and skill state are not imported. The existing movable-control offsets remain in effect.
- Entry composition keeps the existing secure sign-in providers and real readiness gates. Startup progress counts completed real startup promises. Critical asset failures retain the existing error/retry route; no fabricated successful load or sign-in is introduced.
- The dungeon browser draws its catalog, level bounds and encounter counts from current definitions. Story chambers appear only with the required active quest; quest rewards and leaderboard exclusion remain distinct from ordinary dungeon rewards. The actual party, proximity, unlock and authoritative entry handlers are retained.
- Arena overview derives the highest rating and aggregate win/loss/draw counts from actual bracket records. Queue controls and native wager restrictions remain unchanged. Thresholds match `arenaRank`.
- Collection search/owned filters preserve focus, caret and scroll. Existing preview canvas/model objects are retained across refreshes, and disposed when no preview remains. Selection actions carry the rendered pet/mount identity; learning, NFT review and summon/ride gates are retained. Session cleanup resets filter and selection state.

## First-pass findings — all resolved

The first 99-view gallery was inspected once for this reviewer's assigned surfaces: desktop/phone/landscape entry, loading, Dungeon and Arena; phone/narrow HUD and menu; phone collection/Achievements and Store. The root reviewer inspected the other contact sheets. Mossvale's woodland frames, serif headings, gold accents and actual source-based compositions remain recognizable. Entry and Arena showed no material layout issue in this pass. The following first-pass findings drove the bounded correction batch; final verification above confirms their resolution.

| Priority | Finding | Evidence and bounded correction |
| --- | --- | --- |
| P1 | Mobile quest/target/focus/context overlap | At 390×844, forced visible PvP moves the quest tracker from its authored position to y=152 via `minimap.css`'s legacy `translateY(60px)`. It overlaps target, focus, waypoint and party. Old `unit-frames.css` selectors contain an additional `.unit-frame` and `:has()` selectors, so they override new target/focus positions and keep the player frame at 96px high. Override the old positioning deliberately, neutralize the mobile quest transform, and place populated context rails without collisions. Include active-effect selector variants, rather than only the empty-frame case. |
| P1 | Landscape HUD context competes with controls | At 844×390, party overlaps the hotbar page button by 100×44px; boosts overlap the fifth skill; PvP overlaps Attack/Clear; focus overlaps Sprint/Jump. The translated quest also overlaps the player and waypoint. Keep context outside the action arc and movement controls in the landscape layout. |
| P2 | Tablet control scale creates a collision | At 768×1024, inherited `--mobile-control-scale:1.25` makes Clear overlap Use by 20×11px. Scope scale=1 to the new authored fixed layout; all intended targets then retain at least 44px. This replaces the initial unverified estimate involving skill slot 4. |
| P2 | Dark text on dark headings/rewards | Mobile Dungeon, professions and workshop use the shared green panel heading with inherited dark text; Dungeon's green completion-reward strip also has dark text. Give the scoped mobile heading title/eyebrow and Dungeon reward text explicit cream/muted-light colors. |
| P2 | Dungeon party name squeezed vertically | Desktop Dungeon renders Mira one character per line. Its party Summon button inherits the panel's 100% width and large top margin inside a flex row. Scope that button to automatic width, no shrink/margin, and give the name column `min-width:0`. |
| P2 | Achievements mobile category rail loses its layout | The portrait capture still has eight vertically stacked category rows consuming roughly 400px before results. Higher-specificity legacy character-bags rules override the new horizontal category rail. Match the mobile window selector specificity. |

The first-pass HUD measurement at 320×640 also confirmed the quest/target/focus/context issue. That evidence guided the dedicated narrow and short-portrait branches, which pass the final populated check. The geometry probe used visible waypoint, four party members, all real store boosts and active PvP, so hidden default states do not conceal overlap. Its report records actual bounds and pairwise intersections.

### Commerce follow-up — resolved

These are confirmations of this reviewer's own earlier implementation, not independent approval of it:

- Shop Previous/Next initially measured 36×44px on the phone. The mobile rule now supplies `min-width:44px` in addition to the height, verified at 44×44px.
- Store's intended mobile category rail initially remained a grid because old `body.mobile-controls #store-window ...` rules outrank the newer Store selectors. The first phone screenshot showed category names colliding with icons/adjacent columns. Matching that specificity restored the horizontal rail and mobile footer; the corrected screenshot is readable.
- Store purchase actions are scroll-reachable at 390×844 and 844×390 across Featured, Mounts, Boosts, Pets and Gacha. The legacy pinned-footer assertion does not describe the current design. At a simulated 844×210 keyboard viewport with a 40px visual-viewport offset, the inherited 42%-width purchase column makes buttons about 51.6px tall while only 49.6px remain below the sticky heading. Full-button visibility fails by about 1px, although the button center is clickable. The corrected full-width mobile purchase column removes that wrapping. All tested actions are now fully scroll-reachable without pinning the footer.

## Verification and limits

- `node scripts/check-arena-menu.mjs` — pass.
- `node scripts/check-hotbar.mjs` — pass.
- `node scripts/check-mobile-controls.mjs` — pass.
- Populated HUD regression — pass, with real fonts and no page errors; measured evidence in `artifacts/benji-ui/mobile-hud-layout.json`. Store follow-up — all actions scroll-reachable across the five tested categories at 390×844, 844×390 and simulated 844×210 keyboard viewport; Shop pagination is 44×44px. No purchase or production request was made.
- Final gallery filenames: `artifacts/benji-ui/mossvale-{desktop,mobile,landscape,narrow}-*.png`. The first-pass menu/wing/font fixture issues were corrected before the final gallery. Fresh Dungeon and HUD captures were inspected after the final CSS changes. Entry/menu, Achievements, Store and shared-heading confirmations use the font-verified final captures. Source fixtures and forced HUD contexts are renderer evidence, separate from the parent's actual-game interaction proof.

Runtime corrections and the final full-gallery capture were performed by the parent agent. This reviewer added only the regression script and review record during this assignment. Browser emulation does not establish physical-device behavior. No production authentication, payment, ownership mutation, push or deployment was performed by this review.
