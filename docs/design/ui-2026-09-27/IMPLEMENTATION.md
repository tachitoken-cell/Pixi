# September 27 UI import

Source downloads: `mossvale_icons_all_64x64_complete_updated (1).zip` and `mossvale_recent_ui_layouts_18mb.zip`, downloaded by the user on September 27. The original layout files and README are retained here. `source-sha256.json` records every supplied PNG/text file.

All 18 transparent 64×64 navigation PNGs are installed in `public/ui/navigation/` with their original filenames and pixels. `MENU_ICONS` in `src/icons.ts` provides explicit `menu-*` routes; spell, talent, combat and resource artwork keep their existing routes. The Wallet and Specialist icons appear on their existing panel controls/headings rather than introducing new features.

Friends, Referrals, Adventure Board, Inventory, Spellbook, Chat and the desktop hotbar/menu use the supplied emerald, gold and leaf direction with live HTML content and existing actions. Reference balances, character names and older referral percentages are examples; displayed values remain authoritative game data. The mobile hotbar retains four visible abilities and all sixteen saved assignments.

`public/ui/redesign/panel-frame.svg` and `chat-frame.svg` embed the original blank-layout PNG bytes and use a viewBox to exclude transparent outer padding. CSS border-image slices the artwork around responsive content. No downloaded code was executed and no image text is used as an interactive control.

The live controls reuse three further crops without changing the supplied pixels: `tab-frame.svg` and `tab-selected-frame.svg` embed `04_chat_layout.png` at viewBoxes `451 108 361 130` and `103 108 343 130`; `slot-frame.svg` embeds `07_general_ui_layout.png` at `70 918 417 141`. Tabs use border-image slices `48 32 24 32`; slots use `28`. These frames surround live labels, equipment, skill icons and controls instead of baking their contents into screenshots. Chat uses a separate outer frame so selection cannot cover a painted tab; the desktop options menu uses a compact 44-pixel icon grid.

The reference archive includes alternate layouts and full mockups, not a separate implementation for each PNG. Those alternatives are retained as source references; the working panels adapt their composition to the game's available data and controls.

## Direct Discord attachment follow-up

The initial archive-only pass missed the individual contract view and player status HUD in the linked messages. The second message contains six attachments, including two player-HUD images absent from the archive. `discord_references/` retains full-resolution, lossless WebP responses from Discord's media service, with hashes in `source-sha256.json`. It also contains the first message's blank skillbar, which supplies the runtime skillbar frame and slots. These are artwork sources only; embedded names, numbers and instructions are not game data.

| Linked message | Attachments | Live view |
| --- | --- | --- |
| `1553614956531032064` | 1 | Spellbook: available/learned collections and hotbar editor |
| Same | 2–3 | Adventure Board, including Active, Noticeboard and Completed navigation |
| Same | 4–5 | Character inventory and bag views |
| Same | 6–7 | Skillbar frame, live abilities and bank control |
| Same | 8–9 | Chat: live channel tabs, composer, resizing and Hide/Show |
| `1553615219392249905` | 1–2 | Individual contract detail: objective, progress, live rewards, tracking and actions |
| Same | 3–4 | Player portrait, level, name/class/title, health and casting HUD |
| Same | 5 | Options-menu frame, adapted to the requested compact grid |
| Same | 6 | General frame reused for the interaction prompt |
| `1553615367207911466` | 1 | Blank referral ledger artwork |
| `1553529706605838336` | 1 | Referral ledger composition with live tiers, wallet and rules |

Friends and the alternative inventory layouts from the archive are also implemented/adapted in the existing views. The archive README mentions a mobile spellbook image, but neither the archive nor the four linked message groups contains a separate mobile spellbook mockup; the live spellbook reflows on phones. Blank and filled versions share one functional view. The skillbar retains its existing cycling bank control, the blue player bar shows actual casting rather than a fabricated mana resource, and contract rewards contain only the XP and gold paid by the game.
