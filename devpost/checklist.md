---
doc: checklist
status: draft
---

# Frontend delivery record

Technical completion record only; no learner review or curriculum completion is inferred.

- [x] React/TypeScript static studio and responsive styling.
- [x] Measured SVG furniture, dragging, keyboard movement, rotation and history.
- [x] Collision, boundary and door-zone checks; exact floor footprint union.
- [x] Dimensions-first setup, optional height, furniture quantities and three placement strategies. The user's latest flow replaces the original two-roommate setup.
- [x] Isometric preview, local snapshots, JSON transfer and PNG export.
- [x] Fourteen domain checks passed, including quantities, custom sizes, optional height, legacy files and overfilled rooms.
- [x] Sixteen browser journeys passed against the final production build, including the complete input flow, mobile setup, overfilled rooms, editor controls, fullscreen, export/import and local saving.
- [x] Local fonts, license notices, run instructions and planning drafts.
- [x] User chose local-only delivery; no source uploaded or site deployed.
- [ ] User hands-on review and requested refinements.
- [x] User authorized a local Gemini backend, with a private key placeholder they fill themselves.

## Revisions

- Browser testing found a React deferred-state-updater issue in undo/redo snapshots. Capturing the previous Project before queuing state updates repaired history; undo and redo were verified in Chrome.
- Replaced coarse occupancy sampling with exact rectangle-union area; overlapping pieces are counted once.
- Bundled fonts locally so the runtime has no third-party network dependency.
- Implemented the user's dimensions → quantities → suggestions flow. Extracted RoomSetup, quantity conversion and layout cards; simplified generation into named placement functions and formatted source for readability. Optional height is informational, and no AI API was added.
- Later added optional Gemini comparison after explicit user authorization. Node keeps the key in ignored backend-only config; AI selects and explains an existing calculated plan. Missing keys and failed validation preserve local plans. Real-key verification is left to the user.
- Changed AI comparison into actual coordinate generation after the user's plant/window example exposed the limitation. Checks now enforce geometry and extracted spatial requirements; a separate Gemini plan, explicit local alternatives, partial-match disclosure and one repair attempt replace template-only selection. Private config was not read; tests use fake keys and mocked responses.
- Replaced CSS-width zoom with a centred SVG viewBox in both views. Separated 100% reset from native fullscreen, added mobile fullscreen fallback and Escape exit, and kept PNG exports independent of editor zoom. Verified actual furniture scaling, fullscreen bounds, zoom limits, and the existing browser journeys.

## Final Review

Awaiting the user's hands-on feedback. Implementation verification is complete; no final learner sign-off is claimed.

## Code Tour and App Map

README documents the actual file boundaries and the edit → geometry → SVG → local autosave flow. A learner walkthrough has not been performed.
