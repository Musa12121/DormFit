# DormFit

DormFit helps you arrange furniture in your room. Enter your room size, choose how many pieces of furniture you need, and compare suggested layouts.

For example: **a 4 × 5 metre room with 2 beds, 1 wardrobe and 1 desk.** Pick a layout, then move the furniture yourself if you want.

## 1. Start the website

You need **Git** and **Node.js 22.18 or newer**. Node.js runs the app's server on your computer. It includes `npm`, which installs the packages the project needs.

In VS Code, open **Terminal → New Terminal**. Run these commands one at a time:

```powershell
git clone https://github.com/Musa12121/DormFit.git
cd DormFit
npm.cmd ci
npm.cmd run dev
```

- `git clone` downloads the project. Skip the first two commands if you already have the project open in its folder.
- `cd DormFit` opens the downloaded project folder.
- `npm.cmd ci` installs the required packages. You do not need to run it every time you start the app.
- `npm.cmd run dev` starts the website and its local server.

**No API key or private settings file is needed to start.** You can create, edit and save regular layouts immediately. If `server/config.local.mjs` is missing, the backend uses the empty-key defaults in `server/config.example.mjs`. AI is optional; section 4 explains how to enable it.

Open the **Local** address shown in the terminal. It is usually **http://127.0.0.1:5173**. If the terminal shows a different address, use that one.

Keep the terminal open while using the app. Press **Ctrl+C** in that terminal to stop it.

The commands here use `npm.cmd` for Windows PowerShell. On macOS or Linux, use `npm` instead.

## 2. Create a room layout

Use the language menu in the top bar to choose **English**, **Русский** (Russian) or **Türkçe** (Turkish). The app remembers your choice in this browser. Changing the language keeps your room measurements, furniture and notes.

1. Enter the room's width and length in **metres**, such as 4 and 5. Height is optional.
2. **Drag doors and windows on the room preview** to position them. They snap to the nearest wall with space. Under **Doors and windows**, change widths or use **Add window** and **Add door** for more openings.
3. Click **Next: furniture** and choose how many beds, wardrobes, desks and other items you need.
4. Change furniture sizes if needed. These are in **centimetres**, such as 90 × 200 for a bed.
5. Click **Show layouts**. If you enabled AI and wrote a note, review its conditions first.
6. Choose a layout. You can then move, rotate or resize its furniture.

**Offset** means distance from a corner. On the top and bottom walls, measure from the left corner. On the left and right walls, measure from the top corner. For example, a window on the right wall with offset 100 starts 100 cm below the top corner.

You can drag openings with a mouse or touch. Focus an opening with the keyboard and use arrow keys to move it, or press **R** to change its wall. Dragging snaps in 5 cm steps and avoids other openings. Doorways have an amber frame, a handle and a visible swing arc.

After creating a layout, drag openings directly on the main **2D plan**. Use **Undo** to reverse a whole drag in one step. Width and offset fields are still available for exact measurements; there is no wall dropdown. Opening positions are included in saved layouts and JSON files. Older files still open with their original centred door and window.

You can create layouts without an AI key.

The catalog has **24 common room items**: single, double and bunk beds; desks; wardrobes; bookshelves; plants; carpets; sofas; sofa chairs; chairs; office chairs; TVs; bedside tables; drawers; storage cabinets; shoe racks; small tables; dining tables; fridges; TV stands; washing machines; storage boxes; and floor lamps. Each has its own recognisable icon. Short explanations clarify items such as a bedside table (a small table next to the bed). Use **Search furniture** in the quantities screen or furniture library to find an item. Search works in the selected page language and in English. Filtering keeps your selected quantities and sizes.

Less familiar items such as ottomans and vanities are no longer offered in new rooms. Existing saved layouts containing older types still open, and editing their quantities keeps those items.

Every type can be resized, rotated, saved and used in regular or AI layouts. The 3D view uses illustrative heights. A bunk bed takes one floor footprint; the app does not check ceiling or upper-bunk clearance. Dining chairs are separate items, so add them to your selection if needed. The TV stand includes a television; the separate TV item represents a television on its own feet. Appliances are visual room-planning objects; the app does not check power, plumbing, ventilation or installation requirements.

## 3. Regular layouts and AI layouts

| Setting | What creates the layout? | Does it use your written note? |
| --- | --- | --- |
| AI off | The app's placement rules | No |
| AI on | Gemini AI, followed by the app's checks | It tries to; read the explanation shown with the result |

The regular placement rules try to fit the furniture inside the room, avoid overlaps and leave the doorway clear. The app offers three regular layout options.

To use AI, enable **Create an AI layout using my notes**. In **Your room preferences**, write something like:

> Place the plant near the window and the desk near the right wall.

You can write notes in other languages or mix languages in one note, such as Russian and German. The original note is sent unchanged. Gemini is asked to read every part and reply in the language selected in the top bar. It can still misunderstand a request, so check the conditions before confirming. Automated tests check how notes and language choices are sent; they do not prove how well the live model understands every language.

Changing language cancels an unfinished AI request. Already generated AI text keeps its original language; click **Generate layouts** again for new explanations in the selected language. Your saved room data and any names you type are kept as entered.

With a note, AI works in two steps:

1. **Review your preferences:** Gemini reads your note and lists conditions, such as **Plant 1 → near → Window 2**. No AI furniture layout has been generated yet.
2. Correct the furniture, target or near/away choice. You can add or remove conditions and remove unsupported requests. Click **Confirm & create layout** when you are ready.

Only the confirmed conditions are required. Removing a condition stops the original note from adding it back. **Near** means within 60 cm; **away** means at least 100 cm, measured between edges. Choose a numbered opening for a specific window or door. The generic window/door target uses the nearest opening of that kind.

Requests AI cannot turn into conditions are shown separately. You can keep them as visible limitations or remove them. If interpretation fails, you can add conditions manually or go back and edit the note. A Gemini key is still required to generate an AI layout.

After confirmation, Gemini suggests furniture positions and directions. The app checks that all items are present, fit inside the room, avoid overlaps, leave every door's swing and entrance landing clear, and meet the confirmed conditions. It also checks a connected **60 cm walking route** from the entrance to the other doors and to each solid item. Wardrobes, drawers, storage cabinets, fridges and washing machines need reachable standing space at their front. Rugs are walkable.

For example, drawers immediately beyond the door arc can still block someone entering. The app now rejects that arrangement. It tries a local repair or asks Gemini to fix it; a plan that still fails these checks is not accepted as an AI layout. Conflicting conditions or a crowded room may prevent a valid layout.

AI without a written note skips the review step. With a note, interpretation normally makes one model request; layout generation can make up to two more if a placement retry is needed. A recognised output-format rejection can cause one extra compatibility request per attempt. Other errors, including quota or key errors, do not trigger this retry.

### AI request limits

The backend allows **10 Gemini calls in any 60 seconds** and **100 calls per UTC calendar day**. These limits are shared by all visitors and browser tabs using that backend. Reading a note, creating a layout and retrying a failed AI response all use this allowance. Failed calls count too. Invalid room details do not use it.

When the limit is reached, the app shows how many seconds to wait. Regular layouts, editing and saving still work. Google may have its own lower limits; these settings do not change Google's quota.

To change the numbers, edit `perMinute` and `perDay` in **`server/aiLimits.mjs`**, then restart the backend. This file contains no API key.

The counters live in backend memory: refreshing the page does not reset them, but restarting the backend does. This suits the current local app. Public hosting with multiple backend processes would need a shared, persistent counter.

An accepted result appears in its own large **Your AI-designed layout** section, with a purple **DESIGNED BY GEMINI AI** banner. The three locally calculated options appear separately under **Algorithm layouts**. AI may misunderstand part of your request, so read the explanation too.

**If you see “AI layout failed — showing regular layouts”, the AI layout failed. The regular layouts shown instead do not follow your written note.**

## 4. Add your Gemini API key

An API key is a private code that lets the app use your Gemini account. You only need it for AI layouts.

1. Open `server/config.local.mjs` yourself.
2. Find `apiKey: ''`. Paste your key between the two quotes and save the file.
3. Stop the app with **Ctrl+C**, then run `npm.cmd run dev` again.

If the file is missing, copy `server/config.example.mjs` and name the copy `config.local.mjs`. Keep it in the `server` folder. This step is only needed to enable AI; regular layouts work without it. An existing settings file with invalid syntax still produces a safe error so you can correct it.

Keep your key private. Do not put it in the `src` folder or share it in screenshots or messages. The local key file is excluded from Git. Automated tests use fake responses and do not send real Gemini requests.

## 5. Edit and save a layout

| Action | How to do it |
| --- | --- |
| Select furniture | Click it |
| Resize furniture | Select it, then edit Furniture width or Furniture length in the left panel. Press Enter or click outside the field to apply |
| Move a door or window | Drag it on the preview or main 2D plan. Arrow keys move a focused opening; R changes its wall |
| Move furniture | Drag it, or select it and use the arrow keys |
| Rotate furniture | Select it and press `R`, or click Rotate. Each click turns it 90°: 0° → 90° → 180° → 270° → 0°. The left panel shows its current angle |
| Delete furniture | Select it and press `Delete` |
| Zoom in or out | Use the `+` and `−` buttons |
| Open fullscreen | Click the fullscreen button; press `Escape` to leave |
| See the 3D view | Use the 2D/3D switch |
| Switch dark mode on or off | Use the moon or sun button in the header. Your choice is remembered in this browser |
| Change language | Choose English, Русский or Türkçe in the top bar. Your choice is remembered in this browser |

Saved layouts stay **in this browser on this computer**. They do not automatically appear on another device. You can keep up to 20 saved layouts.

To delete a saved layout, click its trash button under **My layouts**, then confirm with **Delete layout**. Choose **Cancel**, close the dialog or press **Escape** to keep it.

- **PNG** exports a picture of the plan for viewing or sharing.
- **JSON** exports the plan's data. Import this file later to continue editing.

## 6. Run the tests

Tests automatically check how the app behaves. For example: does requesting two beds create two beds? Does the wardrobe drawing have doors? Does the app reject an invalid AI layout?

From the project folder, run:

```powershell
npm.cmd test
```

This checks TypeScript types and runs the frontend and backend tests. You do not need to start the website or provide an API key for these tests.

| Test group | What it checks | Last separate run |
| --- | --- | --- |
| Frontend — Vitest | Forms, room drawings, four-way rotation and history, catalog search, opening controls, AI review, translated messages and deletion confirmation | 222 passed |
| Backend — Node.js test runner | All 24 common items, older saved furniture, requests, geometry, entrance and walking access, four directions, confirmed preferences, format compatibility, AI limits and startup | 237 passed |
| Browser — Playwright | Chrome workflows, all furniture types, dragging, AI notes, three page languages, rejected blocked entrances and four-way rotation | 55 checks passed |

Request-limit tests use a fake clock and fake Gemini responses. They check the minute and daily caps, shared limits across both AI endpoints, wait times, midnight resets and retries. They do not use your API key or wait a real minute or day.

Startup tests use temporary settings files. They check that missing settings allow the backend to run, valid settings are respected and broken settings cannot leak a key in error messages. They never open your private settings file.

Access tests cover drawers beyond the door swing, disconnected parts of a room, narrow gaps, multiple doors, front access for cupboards, walkable rugs and repairing the reported 3 × 5 metre room. Rotation tests cover all four angles, old saved files, saved facing, keyboard controls and undo/redo.

To run the frontend or backend tests separately:

```powershell
npm.cmd run test:frontend
npm.cmd run test:backend
```

### Browser tests

These tests need Chrome installed and the website running. In one terminal, run:

```powershell
npm.cmd run dev:client
```

Open a **second terminal** in the project folder and run:

```powershell
npm.cmd run test:e2e
```

If the website opens on a different port, such as `5174`, set its address in the second terminal before running the tests:

```powershell
$env:TEST_URL = 'http://127.0.0.1:5174'
npm.cmd run test:e2e
```

Screenshots are saved in `test-results`. AI responses are simulated, so these tests do not need a real API key or the backend running.

### What is test coverage?

Coverage tells you how much of the code ran during the tests. A result of 70% does not mean the app is “70% correct”.

To create the frontend report:

```powershell
npm.cmd run test:coverage
```

Then open `coverage/frontend/index.html` in your browser.

For the backend report, run `npm.cmd run test:backend:coverage`. Its results appear in the terminal.

Browser tests are not included in the frontend percentage. Generate a new report after code changes to see the current coverage.

## 7. Fix common problems

| Problem | What to try |
| --- | --- |
| “An old or incompatible backend” | Stop the old server terminal with `Ctrl+C`, run `npm.cmd run dev`, then refresh the page |
| Port `3001` is already in use | Stop the backend you started earlier, then start the app again |
| API key or usage-limit error | Check your key and your Gemini account's usage limits |
| The AI layout failed validation | Try a simpler note and check that your furniture sizes and quantities can fit in the room |
| The console shows `502` | Read the explanation on the website; `502` alone does not tell you the cause |

For `GEMINI_BAD_REQUEST`, restart the updated backend first. It now uses the current structured-output format and a smaller schema. If Google explicitly rejects that format, it makes one compatibility attempt using JSON mode. Every result still passes the same layout and preference checks. An unrelated request or model-setting error remains visible instead of triggering repeated requests. The compatibility path is tested with simulated responses; automated tests do not check your live API key.

Request-format reference: [Google's structured-output guide](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).

## 8. Find your way around the code

The **frontend** is what you see and use in the browser. It uses React, TypeScript and Vite. The **backend** is the Node.js server that talks to Gemini and checks requests.

| Location | What it contains |
| --- | --- |
| `src/components` | Forms, buttons, room views and furniture drawings |
| `src/translations.ts`, `src/i18n.ts` | Russian and Turkish text, the language choice and translated messages |
| `src/domain/planner.ts` | Rules for creating layouts without AI |
| `src/domain/access.ts` | Checks connected 60 cm walking routes and access to furniture fronts |
| `src/domain/rotation.ts`, `src/domain/geometry.ts` | Four furniture directions, drawing coordinates and measured footprints |
| `src/domain/ai.ts` | Checks for AI layouts |
| `src/domain/openings.ts` | Opening positions, validation and door-clearance areas |
| `src/components/OpeningEditor.tsx` | Door and window controls |
| `src/components/PreferenceReviewModal.tsx` | Editable conditions shown before AI layout generation |
| `server/preferencePrompt.mjs` | Instructions for turning a note into conditions |
| `server/language.mjs` | Chooses the language Gemini should use in its replies |
| `server/aiLimits.mjs` | Limits actual Gemini calls, including retries |
| `server/loadConfig.mjs` | Uses safe defaults when private settings are missing and hides sensitive configuration errors |
| `src/domain/limits.ts` | Shared room-size limits, used by the forms and data checks |
| `src/domain/positions.ts` | Limits the number of positions searched in larger rooms |
| `src/components/useTheme.ts`, `src/theme.css` | Saves the light/dark choice and defines the theme colours |
| `src/App.tsx` | Connects the main screens and actions |
| `server` | The backend and Gemini connection |
| `tests` | Automated tests |

## Current limits

Rooms are rectangular, with each side between **2 and 100 metres**. The old 10-metre cap was an input restriction. The higher cap keeps very large inputs manageable; large rooms use a wider search grid, with extra positions beside furniture and walls. Layout suggestions are not guaranteed to find every possible arrangement.

Doors and windows can be placed on any of the four walls. You can add up to 12 openings in total. Openings must fit their wall without overlapping. Door widths are 60–140 cm; window widths start at 60 cm. The planner reserves a square swing area plus a 60 cm landing farther into the room. A dashed amber area shows the landing. Door hinges and outward-opening doors are not configurable yet.

Walking access uses a simplified 60 × 60 cm footprint moving along the floor. It checks connected routes and standing space, not building regulations, wheelchair access, drawer extensions or real door mechanics. Manual edits can introduce a blocked route; the app shows a warning. Existing saved layouts remain readable, including their old two-position rotation flags.

You can choose up to 30 furniture items. Furniture dimensions are 20–400 cm. Resizing keeps an item inside the room where possible; if it overlaps another item, the app shows a warning. Use Undo to restore the previous size.

Room height is saved, but the app does not check whether furniture fits under the ceiling. Heights in the 3D view are illustrations. Check real measurements and walking space before arranging your actual room.

See [LICENSE](LICENSE) for the project's license.
