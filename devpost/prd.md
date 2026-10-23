---
doc: prd
status: draft
---

# DormFit: How the app should work

This document describes the current app in simple terms. It is still a draft for review.

## Main steps

1. Enter the room's width and length. Height can be left blank.
2. Add or move doors and windows.
3. Choose furniture types, amounts and sizes.
4. See three layouts made by DormFit's placement rules.
5. Pick a layout and edit it, or change the room and furniture details.
6. Save the plan in the browser or export it as a picture or data file.

Users may also ask Gemini to make a separate layout from their written preferences.

## What users see

The app guides users through room details and furniture choices, then shows layout suggestions and an editor. The page can use light or dark colours. Users can choose English, Russian or Turkish. On small screens, the forms and layout cards stack vertically.

## Room details

- Room width and length must each be between 2 and 100 metres.
- Users can add up to 12 doors and windows. They can drag them along the room walls and change their widths.

## Furniture

- Users can choose up to 10 of each furniture type and 30 items in total.
- At least one item is needed to make a layout.
- Users can change the width and depth of selected furniture.
- A requested item is not silently removed when the room is crowded. If an item cannot be placed, the app shows a warning.

## Layout suggestions

DormFit creates three layouts with its own placement rules. The layouts use the requested furniture amounts and sizes. The app checks room edges, furniture overlaps, door space and walking routes. It may show a warning if it cannot find a plan that passes these checks.

These checks are planning help. They do not prove that a real room is safe or that every possible furniture arrangement has been found.

## Optional Gemini layout

Gemini is optional. When a user asks for an AI layout, the app sends the room details, selected furniture and written note to Google. Before making a layout from a note, Gemini lists the conditions it understood. The user can change these conditions and must confirm them.

DormFit checks the returned layout. If Gemini is unavailable or the layout fails the checks, the app explains the problem. The three regular layouts remain available, but they do not use the written note.

The local backend allows up to 10 Gemini calls in 60 seconds and 100 calls per UTC day. The count includes retries and is shared by people using that backend. The count resets when the backend restarts.

## Editing and saving

Users can move, resize, rotate, duplicate and delete furniture. Undo and Redo reverse edits. The editor has 2D and illustrative 3D views, zoom and fullscreen. Users can save up to 20 plans in the current browser, or export and import a plan file.

The app asks before deleting a saved plan. Invalid imported files do not replace the user's current plan.

## Current limits

The app handles rectangular rooms only and does not collect room or furniture heights. The 3D furniture heights are examples. The walking-route check uses a simple 60 cm space and is not a building-code or wheelchair-access check. Saved plans stay in the browser unless the user exports them.

## Not planned for this version

User accounts, online saving, public hosting, non-rectangular rooms and checks for furniture height are outside the current version.

## Future plans

Let users enter room and furniture heights, add ceiling fixtures such as chandeliers, and compare furniture heights with room height to warn when an item may not fit.
