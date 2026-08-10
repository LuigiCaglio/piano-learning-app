# Handoff — Piano Learning App

Status as of 2026-08-11. Written for whoever (human or Claude) picks this up next.

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
  a "still broken" report.

## Known gotcha: stale PWA service-worker cache

Hit repeatedly this session, on both localhost and the live site: after
pushing a new build, a tab that already had the app open can keep serving the
**old** JS/CSS from the service worker even though the new build is live on
the server (confirmed once via the GitHub Actions API: the deploy had
succeeded, but the open tab still showed an old footer hash). A plain reload
is not enough.

**Fix**: Incognito/Private window bypasses it entirely (best for a quick
"does the fix actually work" check). To fix a regular tab: Chrome → Settings →
Site settings → All sites → find the site → **Clear & reset**. If it's
installed to the home screen on Android, fully close it (swipe from recent
apps) before reopening, not just background it. Always re-check the footer
hash after clearing, before concluding anything about a build.

## Current status: awaiting tablet confirmation of this session's work

Everything below has been verified via the full automated suite (Vitest +
Playwright, see Useful commands) and manually on desktop Chrome (once past
the caching gotcha above), but **not yet confirmed on the user's actual
Android tablet** — that's the next thing to check. Latest pushed build:
`fe32b03`.

### Resolved: the "tap doesn't highlight" mystery
Original symptom: tapping a note never highlighted the matching piano key on
the tablet, while pressing Play always did — despite the tap→state pipeline
passing every automated test across five different event-handling
implementations (`click`, `pointerup`, `pointerdown`+`setPointerCapture`, and
combinations). The investigation spanned most of a prior session; see git log
around commits `4bfa1e8`..`b95a4d5` for the blow-by-blow if the root cause
below ever turns out to be incomplete.

**Actual root cause**, found by testing on desktop Chrome via the on-screen
debug overlay (still present in the code, see below): the tap handler was
working the whole time — `click` fired, the hit-test found the right note,
`setActiveMidiNotes` ran. What was missing was *visible feedback*. Two
compounding issues:
1. Klavier's "realistic" piano key preset (`node_modules/klavier/dist/realistic.mjs`)
   marks an active key with only a few-shades-darker gradient plus a
   drop-shadow — subtle by design (simulates a physically depressed key), not
   a flashy highlight. Fixed in build `40503c5`: a bold orange outline in
   `src/components/PianoKeyboard/PianoKeyboard.css`, driven by the same
   `.klavier-realistic-key-*.active` class Klavier already applies.
2. Tap never touched the *score* itself — only the piano keyboard below it.
   The user's own framing nailed it: "make it show a location in the
   pentagram, the same way the play/pause thing does." Fixed in build
   `fe126ed`: tap now shows and moves OSMD's own cursor (the "bouncing ball"
   playback uses) to the tapped note's position, via a `stepCursorTo` helper
   shared with `advanceCursorTo` in `ScoreViewer.tsx` — literally the same
   mechanism, not a parallel implementation.

Still-present temporary diagnostics (safe to remove once the tablet
confirms all of this): the `DEBUG:` line under the score in
`ScoreViewer.tsx` (last click/pointer event, hit-test result), the
`navigator.userAgent` line and uncaught-error banner in `App.tsx`.

### New this session: whole-beat tap + hand filter + tap-to-seek (build `fe32b03`)
Three related requests, all in `src/components/ScoreViewer/noteIndex.ts`,
`ScoreViewer.tsx`, and `App.tsx`:
1. Tapping in the empty gap between the treble and bass staff now selects
   every note aligned with that beat instead of finding nothing.
2. **Any** tap (precise or in the gap) now selects the *whole beat* across
   every staff, not just whichever note is literally under the fingertip —
   e.g. tapping the treble note of a grand-staff chord also surfaces the bass
   notes at the same instant. Matches on the note's actual OSMD timestamp
   (exact), not screen-pixel proximity (no principled threshold exists for
   "same beat" vs. "adjacent beat" in pixels). A hand filter (Right
   hand/Left hand in `HandSelector`) narrows this down to one staff, mirroring
   how `playableNotes` already filters audio.
3. Tapping a note now also seeks playback there (`PlaybackEngine.seek()`,
   which already existed but was unused by tap) — pressing Play next starts
   from the tapped position instead of always the beginning.

## Useful commands
- `npm run build` — typecheck + production build
- `npx vitest run` — unit tests (~1.5s, 39 tests)
- `npx playwright test` — full e2e suite (~4 min, 45 tests across
  chromium-desktop/ipad-landscape/ipad-portrait). The tap-drift regression
  test is `tests/tap-to-identify.spec.ts` → *"a real touch with natural drift
  still registers as a tap, not a scroll"*.
- Local preview matching production (not `npm run dev`, which runs React
  StrictMode's dev-only double-render behavior and can behave differently):
  `npm run build && npm run preview -- --port 4173`. Kill any server already
  on that port first if testing a fresh build — Playwright's own webServer
  step will otherwise reuse a stale one instead of rebuilding.

## Everything else in the app
Working and not in question: MusicXML import, piece library (IndexedDB),
playback engine (Tone.js + smplr piano samples) with tempo/loop/hands-separate
practice, metronome, offline PWA install.
