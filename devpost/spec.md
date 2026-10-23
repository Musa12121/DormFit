---
doc: spec
status: draft
---

# DormFit: How the app works

This document explains the main parts of DormFit and how they work together.

## Tools used

- **React** builds the screens and buttons.
- **TypeScript** helps catch mistakes in the app's code.
- **Vite** starts the website during development and prepares it for a build.
- **Node.js** runs a small local server for optional Gemini requests.
- **SVG and CSS** draw the room and furniture in the browser. SVG is a way to draw clear shapes on a web page.
- **Vitest, Node's test runner and Playwright** check the app and its main actions.

The server uses Node.js built-in tools. It does not use Express. There is no database. Saved plans stay in the browser unless the user exports a file.

## How a layout is made

1. The room form checks the measurements and furniture amounts.
2. DormFit makes a list of each individual furniture item.
3. The layout planner tries places and directions for each item.
4. It checks the room edges, door areas, furniture overlaps and walking space.
5. It shows three layout ideas. The user can choose and edit one.

The app stores room and furniture measurements in centimetres. The room can be 2 to 100 metres wide and long. Users can choose up to 10 of each furniture type and 30 items total.

The planner tries four directions: 0, 90, 180 and 270 degrees. It checks many positions, starting with a 10 cm step in smaller rooms. For large rooms it checks a smaller set of useful positions to keep the search manageable. Larger furniture is usually placed first. The three options use different placement preferences.

If an item cannot be placed, the app keeps it in the plan and shows a warning. A warning-free layout is not guaranteed for every room or set of furniture.

## Room access checks

The planner leaves room for a door to open and for someone to step inside. It also checks whether a simple 60 cm-wide path can connect the entrance to the rest of the room. Some storage and appliances need clear space in front of them.

These checks are simple guides. They do not check building rules, wheelchair access, real door hinges or whether drawers can open fully. Manual edits can create a blocked path, so the app may show a warning after an edit.

## Optional Gemini layout

Gemini is not needed for the three regular layouts. If the user turns on AI:

1. The user writes a note. Gemini turns it into a list of conditions.
2. The user can edit that list and confirms which conditions to use.
3. Gemini suggests a place and direction for each item.
4. DormFit checks the suggestion with the same room and access rules.
5. If the suggestion has problems, DormFit tries to find nearby positions that pass the checks. It keeps the confirmed conditions.

The app shows the Gemini layout separately from the three regular layouts. If AI fails, the regular layouts remain available and are clearly described as not following the note.

Room details, furniture choices and the user's note are sent to Google when AI is used. The Gemini key is kept in `server/config.local.mjs`, which is excluded from Git. The key is not included in the browser code. The app has a shared limit of 10 Gemini calls in 60 seconds and 100 calls per day. The server counts days using UTC time. The counters are held in memory and reset if the server restarts.

## Saving and editing

The editor supports selecting, moving, resizing, rotating, copying and deleting furniture. Undo and Redo restore earlier edits. The 2D plan uses the real floor measurements; the 3D view is an illustration.

Saved plans and the language and colour-theme choices are kept in browser storage. A user can also export a PNG picture or a JSON data file (a file with the plan's details). Files are checked before they are imported, so a bad file does not replace the open plan. The app asks before deleting a saved plan.

Older saved plans can still use some furniture types that are no longer offered for new rooms. Older two-direction rotation values are also read.

## Main source files

- `src/components/RoomSetup.tsx` collects room measurements and furniture amounts.
- `src/domain/setup.ts` checks those details and makes the furniture list.
- `src/domain/planner.ts` makes the three regular layouts.
- `src/domain/geometry.ts`, `src/domain/openings.ts` and `src/domain/access.ts` check sizes, doors, windows and walking space.
- `src/components/PlanCanvas.tsx` draws and edits the 2D plan.
- `src/components/IsoCanvas.tsx` draws the illustrative 3D view.
- `src/domain/ai.ts` checks layouts from Gemini.
- `server` receives AI requests, checks them and talks to Gemini.
- `src/i18n.ts` and `src/translations.ts` choose and show translated text.
- `tests` contains tests for the app, server and browser actions.

## Running checks

Run `npm.cmd test` on Windows to check the code types and run the frontend and backend tests. To test the app in Chrome, start it with `npm.cmd run dev:client`, then run `npm.cmd run test:e2e` in a second terminal.

The automated AI tests use fake keys and sample replies. They do not call Gemini or check a real API key.
