# DormFit

DormFit helps you plan where furniture can go in a room. Enter the room size, choose the furniture you have or want, and compare layout ideas. You can move and resize furniture before saving or exporting your plan.

The app creates three layouts using placement rules. These layouts work without AI. You can also ask Gemini for a separate layout based on your written preferences.

## What the app can do

- Set the room's width and length, and add doors and windows.
- Choose from 24 common types of furniture and set how many of each you need.
- Compare three layouts made by the app's placement rules.
- Move, resize and rotate furniture in a 2D plan, or view the room in an illustrative 3D view.
- Save layouts in this browser, or export a picture or a file you can import later.
- Use the app in English, Russian or Turkish, with a light or dark theme.
- Optionally ask Gemini to make another layout from your preferences.

## How I shaped the project

I refined DormFit through testing and feedback. I changed the steps so people enter the room size and furniture amounts before seeing layouts. I also asked for movable doors and windows, four furniture directions, clearer furniture drawings, checks that keep the entrance clear, and an optional AI layout that shows its understood conditions first.

## Start the app

You need **Git** and **Node.js 22.18 or newer**.

In VS Code, open **Terminal → New Terminal**. Run these commands one at a time:

```powershell
git clone https://github.com/Musa12121/DormFit.git
cd DormFit
npm.cmd ci
npm.cmd run dev
```

- `git clone` downloads the project. Skip the first two commands if the project is already open in VS Code.
- `cd DormFit` opens the project folder in the terminal.
- `npm.cmd ci` installs the packages the app needs. You only need to do this once, unless the packages change.
- `npm.cmd run dev` starts the website and its local server.

Open the **Local** address shown in the terminal. It is usually **http://127.0.0.1:5173**. Keep the terminal open while using the app. Press **Ctrl+C** in that terminal to stop it.

These commands use `npm.cmd` for Windows PowerShell. On macOS or Linux, use `npm` instead.

**You do not need an API key to use the regular layouts.** If the optional Gemini settings file is missing, the app starts with AI turned off.

## Make a room plan

1. Enter the room's width and length in metres.
2. Drag doors and windows on the room preview to place them. They snap to a wall. You can add more openings or change their size.
3. Choose how many beds, wardrobes, desks and other furniture items you need.
4. Change an item's size if needed. Furniture sizes are in centimetres.
5. Choose **Show layouts** and pick one of the suggestions.
6. Move, resize or rotate furniture in the plan.

The furniture list includes single, double and bunk beds, desks, wardrobes, bookshelves, plants, carpets, sofas, chairs, TVs, bedside tables, drawers, cabinets, shoe racks, tables, fridges, washing machines, storage boxes and floor lamps. Use **Search furniture** to find an item.

Items such as dining chairs are separate from dining tables, so add both if you need them. A TV stand includes a television. The separate TV item is a television on its own feet.

## Regular layouts and Gemini layouts

| Layout | How it is made | Uses your written note? |
| --- | --- | --- |
| Three regular layouts | DormFit's placement rules | No |
| Optional Gemini layout | Gemini suggests positions; DormFit checks them | It tries to follow the conditions you confirm |

The regular layouts try to keep furniture inside the room, avoid overlaps and leave the door area clear. They do not use your written note.

To use Gemini, choose **Create an AI layout** and write a preference, for example:

> Place the desk near Window 1.

Before Gemini places the furniture, DormFit shows the conditions it understood. You can edit or remove them, then confirm. “Near” means within 60 cm; “away” means at least 100 cm, measured from one item's edge to the other's.

DormFit checks the Gemini layout for room boundaries, overlapping furniture, door space, walking routes and the conditions you confirmed. If Gemini returns a readable layout but some checks fail, DormFit still shows it as a best-effort layout and marks the missed conditions and placement warnings. You can edit the layout yourself. If Gemini cannot return a readable layout or the service is unavailable, the regular layouts remain available, but they do not follow your note. These checks are planning guides; they do not replace real measurements or building rules.

Gemini is optional. When you use it, the app sends your room size, furniture choices and note to Google. Do not include private or sensitive information in a note. Read the app's Terms & privacy information before using AI.

The backend allows up to **10 Gemini calls in 60 seconds** and **100 calls per day**. The server counts days using UTC time. These limits are shared by everyone using the same backend. Restarting the local backend resets its counters. Google's own limits may also apply.

## Add a Gemini API key (optional)

Only do this if you want AI layouts. The API key is a private code for your Gemini account.

1. Open `server/config.local.mjs`.
2. Put your key between the quotes in `apiKey: ''`.
3. Save the file, stop the app with **Ctrl+C**, and run `npm.cmd run dev` again.

If the file does not exist, copy `server/config.example.mjs` and name the copy `config.local.mjs` in the `server` folder.

Keep the key private. Do not put it in the `src` folder or share it in a screenshot or message. Git ignores the local settings file. The automated tests use fake keys and do not send requests to Gemini.

## Edit and save

- Click furniture to select it. Change its width or length in the left panel.
- Drag furniture to move it. Click **Rotate** or press `R` to turn it by 90 degrees.
- Use **Undo** and **Redo** to step through changes.
- Use the **2D/3D** switch to change the view. The 3D view is illustrative; it does not check ceiling height.
- Use the **+** and **−** buttons to zoom, or the fullscreen button to expand the plan. Press `Escape` to leave fullscreen.
- Save a layout to keep it in this browser on this computer. Saved layouts do not automatically appear on other devices. You can save up to 20.
- Export **PNG** for a picture, or **JSON** (a file with the plan's data) to import and edit later.

## Run the tests

From the project folder, run:

```powershell
npm.cmd test
```

This checks the TypeScript code and runs the frontend and backend tests. You do not need to start the website or add an API key.

To run the frontend or backend tests separately:

```powershell
npm.cmd run test:frontend
npm.cmd run test:backend
```

The browser tests use Chrome. Start the website in one terminal:

```powershell
npm.cmd run dev:client
```

Then open a second terminal in the project folder and run:

```powershell
npm.cmd run test:e2e
```

These tests use sample AI replies. They do not need a real API key or a running backend.

## If something goes wrong

- If the app says a port is already in use, stop the old app in its terminal with **Ctrl+C**, then start it again.
- If Gemini cannot return a readable layout or the service is unavailable, check the message shown by the app. Regular layouts still work, but they do not use your note. A best-effort AI layout may have warnings; review them before using it.

## Main project files

- `src/components` contains the forms, buttons, room views and furniture drawings.
- `src/domain/planner.ts` creates the three regular layouts.
- `src/domain/ai.ts` checks layouts suggested by Gemini.
- `src/App.tsx` connects the main screens and actions.
- `server` contains the local server and Gemini connection.
- `tests` contains the automated tests.
- `devpost/scope.md`, `devpost/prd.md` and `devpost/spec.md` describe the project plan and how the app works.

## Current limits

- Rooms must be rectangular. Width and length must be between 2 and 100 metres.
- You can add up to 12 doors and windows in total. Each opening must fit on its wall without overlapping another opening.
- You can choose up to 30 furniture items. The app has size limits for furniture and may not find a layout for every room.
- The app does not collect room or furniture heights, so it cannot check ceiling clearance.
- Walking-space checks use a simple 60 cm-wide path. They do not check building rules, wheelchair access, drawer movement, or how a real door is built.
- The 3D view uses example heights. Check the actual furniture measurements before arranging your room.

## Future plans

Let users enter room and furniture heights, add ceiling fixtures such as chandeliers, and compare furniture heights with room height to warn when an item may not fit.

## License

DormFit uses the MIT License. See [LICENSE](LICENSE).
