# Mossvale Wiki design

Scope: the static wiki in `wiki/`. This does not change the game interface.

## Purpose

A reference encyclopedia. Readers look up named creatures, locations, items,
level requirements, rewards, and mechanics. The user explicitly requested a
conventional wiki and removal of promotional copy and generic filler.

## Layout

- A narrow sidebar contains main-page, all-article, and topic links.
- The masthead reuses the actual Mossvale logo on its forest-green background.
- Search remains visible in a compact sticky header.
- The main page contains topic lists, dungeon requirements, world-boss locations,
  the creature directory, and links to all regions. No marketing hero or banners.
- Articles use one title, a factual summary, numbered contents, sections,
  cross-references, tables and a category footer.
- Monster and dungeon infoboxes contain entity-specific facts. Monster portraits
  render actual game models, with transparent backgrounds; no stock illustrations.

## Type and color

Marcellus, self-hosted, is reserved for article and section headings. Body text
uses the system sans-serif stack at 14px with 1.7 line height. Main titles are
2.6rem on desktop and 2.15rem on mobile.

White (`#fff`) is the article background. Ink is `#26352d`; secondary text is
`#536156`; links are `#225f45`. The pale sidebar/contents surface is `#f1f4ef`.
Table headers use `#e8eee3`, alternating rows `#f6f8f3`, and borders `#cdd5cb`.
The masthead uses `#203d31` with the logo and a `#ead5a5` wiki label.
Infoboxes use `#f8faf6` and `#b6c3b2`; search borders use `#abb9aa`.
Borders and square corners group reference material; small controls have 2–3px
radii. No shadows or decorative animation.

## Responsive and accessible behavior

At 760px and below the sidebar becomes native collapsible navigation; article
infoboxes enter document flow. The main-page columns stack and creature links
use two columns. Search has a visible submit button and an accessible label.
Tables scroll inside focusable, labelled wrappers without overflowing the page.
Article contents use real fragment links. All links and controls show focus.
Navigation and articles work without JavaScript; search is a progressive
enhancement. Reduced-motion preferences disable smooth scrolling. Print output
hides navigation and preserves article content and infoboxes.
