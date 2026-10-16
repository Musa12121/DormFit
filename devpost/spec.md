---
doc: spec
status: draft
---

# DormFit — technical specification

## How This Works, In Plain Language

The form collects room dimensions and furniture counts. A function creates one object per piece. A second function tries positions/rotations and returns three candidates. The selected plan can be edited and saved locally.

## The Core Journey Through the System

RoomSetup → createProject(room, requests) → generateLayouts(project) → LayoutSuggestions → PlanCanvas / IsoCanvas → local storage or export.

## Stack and Run Instructions

React, TypeScript, Vite, Lucide, native SVG/CSS, Node HTTP server, Node tests, Playwright. Run npm ci and npm run dev to start frontend and backend. Build with npm run build. Gemini uses native fetch without an AI SDK.

## Components

- RoomSetup.tsx: two-step form; converts metres to centimetres.
- domain/setup.ts: quantity limits, typed requests and request-to-furniture conversion.
- domain/planner.ts: rectangle checks, exact occupied-area union, canPlace, positionScore, findPosition and generateLayouts. Ordinary loops and short rule comments.
- LayoutSuggestions.tsx: cards, selection, revise-input action and fit warning.
- App.tsx: workflow, editor history and saving.
- PlanCanvas / IsoCanvas: measured 2D editing and illustrative projection.
- storage / export: validated versioned JSON, snapshots and PNG.
- AiControls / domain/ai / requestAiPlan: optional written note, shared coordinate/geometry/near-away validation and cancellable generation request.
- server/app.mjs / gemini.mjs / planPrompt.mjs: local JSON API, input validation, Gemini coordinates, extracted requirements, one repair attempt and safe error messages.
- domain/repairAiPlan.ts: bounded search for nearby valid coordinates, preserving every declared placement requirement. Adjusted AI proposals are labelled in the UI. Safe diagnostic codes distinguish provider failures from plan validation failures without exposing credentials or raw errors.
- server/config.local.mjs: ignored, frontend-inaccessible private key placeholder, filled in only by the user.

## Data Model

Room: width/depth (200–10,000 cm), optional height and up to 12 wall openings with widths and offsets, all in cm. Legacy centred door/window data remains readable.
FurnitureRequest: kind, count, width, depth.
Project v1: room and exact furniture list; optional legacy roommate data preserves old files.
SavedProject: id, updatedAt, Project. Limit: 10 per kind, 30 total, 20 saved snapshots.

## Placement Algorithm

Try four clockwise directions (0, 90, 180, 270 degrees) with a 10 cm wall margin. Use a 10 cm search grid for small rooms and bounded samples with alignment anchors for large rooms. Reject bounds, door-swing/landing and solid overlaps. Score positions by wall distance, facing and each style's preference, then check up to 128 preferred candidates for connected walking access. Larger pieces normally go first; daylight gives desks first choice. Rugs go last and may underlay furniture. Retain unplaced pieces and report conflicts.

The search is heuristic. Optional height is informational. The catalog offers 24 common furniture types; older types are retained for saved-file compatibility. Furniture stores an optional full rotation alongside the compatible rotated boolean. Old files map false/true to 0/90 degrees. SVG and isometric drawings use shared coordinate transforms.

Access checks reserve a 60 cm landing beyond each door swing and trace a 60 cm square through free floor space. The graph uses obstacle boundaries and furniture centres instead of a room-sized grid. All doorways must connect, every solid item needs a reachable side, and selected storage/appliance types need front access. The same checks validate AI output, local repairs and manual edits. This is a simplified planning check, not a building-code or wheelchair-access assessment.

## Editor Behaviour

Keep pointer/keyboard editing and undo/redo. SVG viewBox provides 50–200% zoom. Fullscreen has a local expanded fallback and Escape exit. PNG restores the full viewBox. Doors and windows snap along walls when dragged. Saved-layout deletion requires confirmation. Language and theme choices persist in browser storage.

## Failure Modes

Invalid dimensions block progress. Empty/excessive quantities disable generation. No conflict-free candidate shows issues without dropping furniture. Storage failure remains visible. Invalid imports cannot replace the workspace.

## External Services and Delivery

Optional Gemini calls go through the loopback-only Node backend. The key stays in ignored backend config; Vite denies access to server files. Gemini generates coordinates and facing for every item from the note. Shared checks reject bounds, door/landing, collision, walking-access and declared near/away failures (60/100 cm edge distances). One repair attempt includes specific validation feedback. Valid AI geometry is featured separately from the three algorithm alternatives, which are labelled as not applying notes. Unfulfilled requests remain visible. Missing keys, network failures and invalid responses preserve clearly labelled local plans. Fonts remain local. The source is published on GitHub; the application itself runs locally.

`server/aiLimits.mjs` reserves an allowance before every outgoing Gemini call, including interpretation, generation and compatibility or placement retries. The shared backend limit is 10 calls per rolling 60 seconds and 100 per UTC calendar day. Blocked requests return HTTP 429, a safe translated message and a Retry-After header. Invalid inputs do not consume the allowance. The in-memory counters reset on restart; multiple deployed processes would need shared persistent storage.

## Decisions and Open Issues

The user subsequently authorized Gemini integration and requested an empty key slot with a comment, to fill privately. Implemented a small local backend; no actual key is supplied or read during development. Real-key verification is performed by the user. Hands-on user review is pending.
