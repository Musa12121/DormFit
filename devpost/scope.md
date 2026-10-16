---
doc: scope
status: draft
---

# DormFit — quantity-based room planning

## The Unique Kernel

Enter room dimensions and furniture quantities; get measured layout suggestions containing those items.

## Who It's For

Someone arranging a rectangular room, with any supported number of beds, wardrobes, desks and other available furniture. The flow does not assume two roommates.

## The Core Loop

Width/length and optional height → furniture quantities and sizes → compare suggestions → select and adjust → save/export.

## Inspiration & Identity

Use an architectural-studio style with light and dark themes. Support English, Russian and Turkish. Keep the code simple and understandable.

## What "Working" Looks Like

Suggestions use the exact quantities and sizes entered. Inputs can be revised. Unplaced furniture remains present with visible issues.

## The POC Boundary

Local React/TypeScript/Vite frontend, one rectangular room, optional informational height, quantity form, measured placement rules, editable SVG, isometric preview and local/file persistence.

## Explicitly Deferred

Accounts, cloud persistence and public hosting are deferred. Optional Gemini integration now generates furniture coordinates through a local backend and validates them against room geometry and confirmed preferences. No real API key is included. Vertical fit is not checked because furniture height is not collected.

## Revision

The latest user request replaces the original two-roommate-first flow with dimensions → quantities → suggestions. Previous saved files remain readable.
