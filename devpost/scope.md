---
doc: scope
status: draft
---

# DormFit: Room layout ideas

## What the app does

DormFit helps people plan where furniture can go in a rectangular room. A user enters the room size, chooses the furniture and how many of each item they need, then compares layout ideas.

## Who it is for

Anyone who wants to arrange or rearrange furniture in a room.

## How a user works with it

1. Enter the room's width and length.
2. Add doors and windows, then choose furniture and amounts.
3. Compare three layouts made by DormFit's placement rules.
4. Choose a layout and move, resize or rotate furniture.
5. Save the plan in the browser or export it as a file.

Users can also ask Gemini for a separate layout based on written preferences. They review and confirm the conditions DormFit understood before generating it.

## Main goals

- Make it clear what each step asks the user to do.
- Keep the regular layouts available without an AI key.
- Show furniture in a clear 2D plan and an illustrative 3D view.
- Let users change the furniture and room openings.
- Keep the code understandable.

## What is included

The app supports one rectangular room, room dimensions, doors, windows, furniture amounts and sizes, three rule-based layouts, editing, local saving and file export. Optional Gemini layouts use a Node.js server on the user's computer.

## What is not included

There are no user accounts, online saving or public app hosting. The app does not collect room or furniture heights, so it cannot check ceiling clearance or building rules.

## Future plans

Let users enter room and furniture heights, add ceiling fixtures such as chandeliers, and compare furniture heights with room height to warn when an item may not fit.

## Revision

The project began with a different room-planning flow. Feedback changed it to ask for room size and furniture amounts before showing layout ideas. Other changes include movable doors and windows, four furniture directions, clearer furniture drawings, checks for door space and an optional Gemini layout with reviewable conditions. Older saved files are still supported.
