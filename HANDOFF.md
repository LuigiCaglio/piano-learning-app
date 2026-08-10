# Handoff — Piano Learning App

Status as of 2026-08-10. Written for whoever (human or Claude) picks this up next.

## What this app is

A tablet PWA that helps a guitarist (fluent sheet-music reader, slow at piano
translation) learn piano. Import a MusicXML piece, tap a note/chord on the
rendered score to see which piano key(s) to press, play back with
tempo/loop/hands-separate practice, metronome, works offline.

- **Live URL**: https://luigicaglio.github.io/piano-learning-app/
- **Repo**: https://github.com/LuigiCaglio/piano-learning-app (public), branch `main`
- **Deploy**: `.github/workflows/deploy.yml`, triggers automatically on push to
  `main`, ~2-3 min. No `gh` CLI on this machine — authenticate to the GitHub
  API with a token from `git credential fill` (see any recent commit in this
  session's history for the exact pattern).
- **Build verification**: the footer shows the deployed git short-hash
  (`build <hash>`, wired via `vite.config.ts` → `define` → `src/global.d.ts`).
  Always confirm the tablet's footer matches the latest commit before trusting
  a "still broken" report — this has caught real caching issues before.

## Likely root cause found (build `40503c5`) — awaiting on-device confirmation

After five failed event-handling iterations (all described below, kept for
history), the user tested build `87ec1cf` on **desktop Chrome via localhost**
— not the tablet — using the on-screen debug overlay. Result: `click` fired,
the hit-test found the correct note (`hit=65`), and the user confirmed *"the
note correctly displayes on the keyboard so it gets it"* (the red note-name
label appeared) — **but it still didn't look "highlighted."**

That is the real breakthrough: the tap→state→render pipeline was working
correctly the whole time, on desktop, with plain `click`. Tracing into
Klavier's "realistic" piano preset (`node_modules/klavier/dist/realistic.mjs`)
showed why it didn't *look* like it worked: an active key only gets a
few-shades-darker gradient (`#EBEBEB`→`#D9D9D9` for white keys) plus a
drop-shadow that its own CSS only applies to the first key in a run of
adjacent active keys — subtle by design (simulates a physically depressed
key), not a flashy highlight. For one isolated tapped note this is very easy
to miss, especially on a tablet screen. This plausibly explains the *entire*
investigation below: the tap handler may have been working on the tablet all
along, just with visual feedback too subtle to register as "highlighted."

Build `40503c5` adds a bold, unmissable outline driven by the same
`.klavier-realistic-key-*.active` class Klavier already applies (see
`src/components/PianoKeyboard/PianoKeyboard.css`) — pure CSS, no changes to
event handling. **Not yet confirmed on the actual tablet.** If it's still not
visible there after this, the original event-handling mystery (below) is
back in play and priority 3 (remote debugging) is the next real lever, since
priority-1/2 diagnostics are already shipped.

## Original investigation: tap-to-identify on the user's real tablet (kept for history)

Tapping a note/chord on the score does not reliably highlight the matching
piano key(s) **on the user's actual Android tablet**, despite this working in
literally every automated test (Playwright, including realistic CDP-simulated
touch with drift) across four distinct implementations. Playback-driven
highlighting (pressing the Play button) has always worked correctly on their
device — this is the single most important clue: it proves the React
state/rendering pipeline (`activeMidiNotes` → `PianoKeyboard`) is fine, and
narrows the bug to specifically how the score container detects/receives the
tap gesture.

### What's been ruled out (confirmed by the user directly, not assumed)
- Caching / stale deploy — footer build hash checked and matched each time.
- Browser profile state — same failure in Incognito.
- React state plumbing — playback highlighting works, proving the same
  downstream code path (`setActiveMidiNotes`/`playingMidiNotes` →
  `displayedMidiNotes` → `PianoKeyboard`) is sound.
- Stale cached tap coordinates — `noteIndex.ts` was rewritten so
  `findNoteHitAtPoint` reads `getBoundingClientRect()` live on every call,
  never from a cache. Didn't fix it.

### Approaches tried on the score's tap handler (all pass automated tests; only the last is unconfirmed on-device)
1. `click` + `touch-action: manipulation` → **fails automated test too**:
   Chromium's touch-to-click synthesis has its own ~10px movement threshold,
   independent of `touch-action`, that cancels `click` once a real finger tap
   drifts past it.
2. `click` + `touch-action: pan-y` → same failure mode.
3. `pointerup` + `touch-action: none` (build `4bfa1e8`) → passes automated
   realistic-drift test. User: still broken on device.
4. `pointerup` + `pointerdown`/`setPointerCapture` + `touch-action: none`
   (build `75e9c20`) → passes automated tests. User: **"same problem. Use the
   same mechanism you use for the 'play' thing."**
5. **Current** (build `b95a4d5`, just pushed, awaiting user confirmation):
   listen for **both** `click` and `pointerup` on the score container
   (`src/components/ScoreViewer/ScoreViewer.tsx`), keep `pointerdown` +
   `setPointerCapture` + `touch-action: none`. Rationale: `click` is the exact
   mechanism every other control in this app uses (Play/Pause button,
   checkboxes, piece library) and none of those have ever been reported
   broken on this device — a strong signal the bug is specific to this
   container's custom event handling, not touch in general. `pointerup` is
   kept as a fallback since automated testing proves `click` alone drops taps
   with real drift (item 1 above). Full 43-test Playwright suite (3 viewport
   projects) + 26 Vitest unit tests pass on this build.

### The real mystery, still unexplained
Automated testing has never reproduced the failure, across four structurally
different approaches, including a CDP-dispatched real touch sequence with
~22px of drift. Leading unconfirmed hypothesis: the tablet appears to run an
**older Android/Chrome version** (Google Play Protect flagged the app install
as "unsafe," and Android itself warned it "doesn't include the latest privacy
protections" — both consistent with an old OS). Older Chrome/WebView
PointerEvent implementations (`setPointerCapture`, `touch-action` honoring for
gesture-claiming) may simply be patchier than desktop Chromium, which is what
Playwright drives even when simulating touch via CDP. This would explain the
consistent test-pass/device-fail split. **Not yet verified.**

### Confirmed: build `b95a4d5` (click+pointerup dual listener) still fails
User confirmed on 2026-08-10: playback highlighting still works, tap-to-identify
still doesn't, on this build too. Five structurally different approaches have
now failed on-device while passing every automated test. Build `87ec1cf`
(pushed 2026-08-10) re-adds the on-screen diagnostics described below —
**awaiting user to tap a note on the real device and report what the debug
line under the score says, plus the UA line above the piece library.**

### Next steps in priority order
1. ~~Get the tablet's actual Chrome/Android version~~ — build `87ec1cf` now
   prints `navigator.userAgent` directly on-screen (above the piece library),
   no need to dig through Settings. Just need the user to read it off.
2. ~~Re-add the on-page debug overlay~~ — done in build `87ec1cf`. It now
   reports whichever of `click` / `pointerdown` / `pointerup` / `pointercancel`
   last fired (with `pointerType`), the coordinates, how many tappable regions
   were built, and the hit-test result. **This is the critical unblock**: it
   tells us definitively whether the tap event fires at all on this device, or
   fires but the hit-test comes back empty, or never fires. Each implies a
   completely different fix (event-handling vs. hit-test geometry vs.
   something else claiming the gesture first).
3. **Chrome remote debugging over USB** (`chrome://inspect` from a laptop
   connected to the tablet) would give real devtools console/event access on
   the actual device — far more diagnostic than continued guessing from here.
   Requires the user to enable USB debugging and connect the tablet to a
   computer.
4. **Bigger architectural option, not yet attempted**: replace the single
   delegated listener + manual coordinate hit-testing on the OSMD-rendered SVG
   with real, individually-overlaid DOM `<button>` elements positioned over
   each note (absolutely positioned, computed after each render/resize). This
   would make every note tap use literally the same native button/click path
   as Play/Pause, with no coordinate math involved in the interaction itself.
   Nontrivial: needs care around `.score-viewer`'s `overflow-x: auto` so
   overlay positions don't go stale on scroll (positioning them relative to
   the scrollable container's content box, not the viewport, avoids needing
   to recompute on every scroll — sketched out but not implemented).

## New feature: tap between staves selects the whole beat (build `b72539c`)

User request: tapping in the empty gap between the treble and bass staff (no
note directly there) should select every note vertically aligned with that x
position, not just fail silently. Implemented in
`src/components/ScoreViewer/noteIndex.ts` (`findColumnHit`): if the existing
precise nearest-note search finds nothing, fall back to matching every note
whose horizontal span contains the tap's x, scoped to whichever system (line
of music) is vertically closest to the tap — scoping matters because a new
system resets x back to the left margin, so an unrelated note on a different
line could otherwise coincidentally share an x position. System identity
comes from OSMD's `GraphicalMeasure.ParentMusicSystem`. Covered by new unit
tests in `tests/unit/noteIndex.test.ts`. Not yet confirmed by the user in the
real app (only verified via unit tests + full Playwright suite passing).

## Useful commands
- `npm run build` — typecheck + production build
- `npx vitest run` — unit tests (~2s, 31 tests)
- `npx playwright test` — full e2e suite (~4 min, 43 tests across
  chromium-desktop/ipad-landscape/ipad-portrait). The tap-drift regression
  test is `tests/tap-to-identify.spec.ts` → *"a real touch with natural drift
  still registers as a tap, not a scroll"* — it's the one test in this repo
  that specifically exists to catch the class of bug this whole investigation
  has been about.

## Everything else in the app
Working and not in question: MusicXML import, piece library (IndexedDB),
playback engine (Tone.js + smplr piano samples) with tempo/loop/hands-separate
practice, metronome, follow-along cursor, offline PWA install. None of this
has been touched or is suspected in the tap-to-identify investigation.
