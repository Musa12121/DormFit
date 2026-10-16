---
doc: prd
status: draft
---

# DormFit — product requirements

Source: scope.md > The Core Loop. Reflects the user's new flow; user review is pending.

## The Core Journey

1. Enter required width/length and optional height.
2. Choose furniture amounts and optional custom sizes.
3. Compare three calculated suggestions; optionally review AI-understood preferences and generate a separate Gemini layout.
4. Select another suggestion, edit pieces, or revise the inputs.
5. Save locally or export/import files.

## Screens and Layout

A guided two-step input form, followed by suggestion cards above the editor. Saved plans and the explicit sample open directly into the editor.

## Look and Feel

Light and dark themes, blue/peach accents, local fonts and measured SVG. The top bar switches between English, Russian and Turkish. Mobile forms and cards stack vertically.

## Features and Behavior

### Dimensions

Width/length: 2–100 m; optional height: 1.8–6 m. Invalid values block progress. Height is saved but does not affect floor placement. Doors and windows can be dragged between walls and resized, with up to 12 openings.

### Furniture Quantities

0–10 of each type, 30 total, at least one required. Selected types expose width/depth in centimetres. Unused sizes of zero-quantity items do not block generation.

### Suggestions

Three local placement styles. Preserve exact quantities and custom sizes. Visibly flag unresolved overlap/bounds/door issues. Say that no conflict-free candidate was found rather than claiming impossibility.

### Editor and Persistence

Retain dragging, resizing, rotation, duplicate/delete, undo/redo, zoom, fullscreen, isometric view, snapshots, JSON and PNG. Confirm before deleting a saved layout. Colour zones do not require two owners.

## States and Boundaries

Fresh workspace starts with dimensions, then zero quantities. An existing workspace seeds the form with its saved dimensions and furniture quantities. Empty quantities disable generation. An overfilled room retains all pieces. Invalid import preserves current work. Removing optional height omits it from the project.

## Product Decisions

User: dimensions → quantities → suggestions, optional height, understandable code. Optional Gemini generation uses a local backend with a private key placeholder filled only by the user. Note interpretation and layout generation share a cap of 10 actual Gemini calls per minute and 100 per UTC day, including retries. Regular layouts remain available when the allowance is exhausted. Counters are in memory and reset on backend restart.

## Deferred

Accounts, cloud synchronization, public backend hosting and vertical-clearance checks. Local Gemini coordinate generation is in scope; no real key is included. Source publication does not deploy the app.
