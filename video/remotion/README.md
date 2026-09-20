# Takda Commercial (Remotion)

> **Two versions exist side by side: V1 (original) and V2 (revised cut).**
> V1's files are untouched. V2 lives entirely under `src/v2/` as separate
> compositions and separate output files, so both can be compared directly.
> See "V2 — what's different" below for the full rundown.

A programmatic, code-driven promotional video for Takda, built with
[Remotion](https://www.remotion.dev/) + React + TypeScript. This project is
**completely isolated** from the Takda web app: it lives under `video/`, has
its own `package.json`, and does not import, build, or run anything from
`../../src`. Nothing here can affect the production app.

It reuses Takda's real visual identity instead of inventing a new one:

- **Colors** — pulled directly from `../../src/App.jsx` and
  `../../public/manifest.webmanifest`: primary `#3D2FE0`, background
  `#F5F6FA`, ink `#1B1B2F`, borders `#E4E4F0`, the subject accent palette,
  and the red/amber/green status tones. See `src/theme.ts`.
- **Typography** — the same two Google Fonts the app loads (`FONT_LINK` in
  `App.jsx`): **Fraunces** for display/headline text, **Inter** for body/UI
  text. Self-hosted locally, see "Fonts" below.
- **Logo** — the actual `public/takda-icon.png` app icon, copied into
  `public/takda-icon.png` here.
- **UI** — the device-mockup screens (`src/components/ui/*Screen.tsx`)
  recreate the real Sidebar, Subjects grid, Activities list, and Calendar
  from `App.jsx` (same layout, colors, radii, and copy patterns), driven by
  representative sample data rather than a live Supabase connection.

## Structure

```
video/remotion/
  src/
    Root.tsx            # registers the two <Composition>s
    Commercial.tsx       # sequences all 8 scenes on the shared timeline
    timeline.ts          # frame ranges per scene + audio cue timestamps
    theme.ts              # Takda's color tokens
    fonts.ts              # self-hosted Fraunces/Inter loading
    types.ts
    components/
      GradientBackground.tsx
      SceneFade.tsx        # cross-fade/rise transition between scenes
      Logo.tsx
      DeviceMockups.tsx    # PhoneMockup / LaptopMockup device chrome
      DeviceHero.tsx        # headline + device layout shared by scenes 3-5
      ui/
        AppFrame.tsx         # sidebar / mobile top bar chrome (from Sidebar in App.jsx)
        SubjectsScreen.tsx
        ActivitiesScreen.tsx
        CalendarScreen.tsx
    scenes/
      Scene1Problem.tsx      # 0-5s   "Assignments. Quizzes. Projects. Deadlines."
      Scene2Intro.tsx        # 5-9s   Logo reveal — "Meet Takda."
      Scene3Subjects.tsx     # 9-14s  Subjects
      Scene4Activities.tsx   # 14-20s Activities
      Scene5Deadlines.tsx    # 20-26s Calendar / deadlines
      Scene6Progress.tsx     # 26-31s Progress ring — "Less stress. More progress."
      Scene7Anywhere.tsx     # 31-35s Laptop + phone — "Plan anywhere. Study smarter."
      Scene8CTA.tsx           # 35-40s Logo + "Stay on track with Takda." + CTA
  public/
    takda-icon.png        # copied from ../../public/takda-icon.png
    fonts/                 # self-hosted Fraunces + Inter (see below)
```

All four compositions are registered in `src/Root.tsx`:

| id                          | Resolution  | Aspect | Duration | Use case                         |
|------------------------------|-------------|--------|----------|-----------------------------------|
| `TakdaVertical`              | 1080×1920   | 9:16   | 40.0s    | V1 — TikTok, Reels, Shorts        |
| `TakdaLandscape`             | 1920×1080   | 16:9   | 40.0s    | V1 — website, YouTube, decks      |
| `TakdaCommercialV2Vertical`  | 1080×1920   | 9:16   | 35.0s    | V2 — TikTok, Reels, Shorts        |
| `TakdaCommercialV2Landscape` | 1920×1080   | 16:9   | 35.0s    | V2 — website, YouTube, decks      |

Both versions run at **30fps**. Every scene is written once, parametrized by
`orientation: "vertical" | "landscape"`, so layout adapts (phone mockup vs.
laptop mockup, stacked vs. side-by-side) without duplicating scene logic.

## V2 — what's different

V2 is a revision of V1's pacing, motion, and a few scenes' content — not a
redesign. It keeps V1's palette, Fraunces/Inter, the real app icon, and the
same recreated Subjects/Activities/Calendar UI patterns. Lives entirely
under `src/v2/` (own `timeline.ts`, `Commercial.tsx`, `scenes/`, `ui/`,
`components/`) and reuses `src/theme.ts`, `src/fonts.ts`,
`src/components/GradientBackground.tsx`, `src/components/DeviceMockups.tsx`
and `src/components/ui/AppFrame.tsx` from V1 rather than forking them, since
those are generic and unchanged.

**Structure:**

```
video/remotion/src/v2/
  timeline.ts          # scene frame ranges, audio cues, voiceover cue map
  Commercial.tsx        # sequences all 8 scenes
  components/
    SceneTransition.tsx  # fade + rise + subtle zoom between scenes
  ui/
    DeviceHeroV2.tsx      # larger, more center-weighted headline+device layout
    SubjectsScreenV2.tsx  # subject grid + tap-to-open drawer with activities
    ActivitiesScreenV2.tsx # task list + tap-to-complete + confirmation toast
    CalendarScreenV2.tsx   # date highlight + deadline callout + upcoming list
  scenes/
    Scene1Hook.tsx        # 0-4s   "Too many deadlines?" + card burst -> "Keep everything in one place."
    Scene2Reveal.tsx      # 4-8s   Logo reveal (glow + light sweep), "Meet Takda."
    Scene3Subjects.tsx    # 8-13s  Tap a subject -> see its activities
    Scene4Activities.tsx  # 13-19s Tasks appear -> complete one -> toast
    Scene5Deadlines.tsx   # 19-24s Calendar date highlight + upcoming list
    Scene6Progress.tsx    # 24-28s 0->82% ring, "Less stress. More progress."
    Scene7Devices.tsx     # 28-31.5s Laptop -> phone, parallax
    Scene8CTA.tsx          # 31.5-35s "Stay on track with Takda." + CTA
```

**Story/pacing:**
- 40s → 35s total, built from the Problem → Relief → Product Experience →
  Progress → CTA arc the brief asked for.
- Scene 1 (hook) replaced: V1's four words appearing one at a time (slow,
  lots of empty space) becomes "Too many deadlines?" with six academic
  notification cards bursting in around it in under a second, then
  converging into "Keep everything in one place." — a much faster, more
  TikTok-native open.
- Scene 2 (reveal): logo is larger with a light-sweep + glow, and the
  wordmark under the icon was dropped so "Takda" only appears once on
  screen at a time (in "Meet Takda."), not twice.
- Scenes 3-5 now demonstrate interaction instead of a static screenshot:
  a subject card gets "tapped" and a drawer slides up with its activities;
  a task row gets "tapped," its checkbox fills, and a "Nice! 1 task done."
  toast confirms it; a calendar date gets highlighted with a pulse and a
  deadline callout + upcoming-list panel slide up.
- Scene 6 (progress) reworked: the ring now sweeps through 0→25→48→67→82
  (not a flat fill), uses noticeably more of the frame (was a lot of empty
  vertical space in V1), adds slowly-drifting background check icons, and
  ends on a prominent "82% On Track" pill with real hold time before the
  scene cross-fades out.
- Scene 7 (devices): laptop and phone now enter on staggered timing with
  independent drift (parallax) instead of both appearing together.
- Scene 8 (CTA): the `takda.app` placeholder line is **removed** — it was
  never a confirmed domain, so V2 doesn't advertise it. The CTA button has
  a looping soft glow pulse instead of being static.
- Vertical-specific: headlines and device mockups are sized up and pulled
  toward the vertical center rather than sitting in a mostly-empty top
  band; this isn't the landscape composition rescaled, it's its own layout
  per scene (see `DeviceHeroV2.tsx`).

**Two real bugs found and fixed while building V2** (both from stress-testing
every scene as rendered stills before the full render, not just eyeballing
Remotion Studio):
1. Scene 5's calendar callout + upcoming-list were originally stacked in
   normal document flow below the calendar grid, which made the total
   content taller than the device screen in landscape and clipped the
   bottom calendar row. Fixed by making that panel absolutely positioned
   (the same trick V1's calendar toast already relied on), so it overlays
   instead of adding height.
2. Scene 6's "82% On Track" badge originally appeared at frame 100 of a
   120-frame scene whose own cross-fade-out starts at frame 104 — it never
   had a real "hold" moment before dissolving with the rest of the scene.
   Moved the ring's checkpoints earlier (finishes by frame 68 instead of
   96) and the badge to frame 76, giving it ~28 frames of clean visibility.

## Voice-over

`src/v2/timeline.ts` exports `voiceoverCues`: the brief's narration script
split into 7 lines, each mapped to the scene-frame range it was written to
narrate. No AI voice was generated (not asked for yet) — this is purely a
timing map so a VO track can be dropped in later without re-timing any
scene. To use it, render a VO clip per line, then add each as an
`<Audio>` inside a `<Sequence from={cue.from} durationInFrames={cue.to - cue.from}>`
in `src/v2/Commercial.tsx`.

## Getting started

```bash
cd video/remotion
npm install
```

### Preview (Remotion Studio)

```bash
npm start
```

This opens Remotion Studio in the browser with a live-reloading timeline.
Pick `TakdaVertical` or `TakdaLandscape` from the sidebar, scrub the
timeline, and play back in real time.

### Render the final MP4

```bash
# V1
npm run render:vertical      # → out/takda-vertical.mp4                 (1080x1920)
npm run render:landscape     # → out/takda-landscape.mp4                (1920x1080)
npm run build                 # renders both V1 outputs

# V2
npm run render:v2:vertical   # → out/takda-commercial-v2-vertical.mp4   (1080x1920)
npm run render:v2:landscape  # → out/takda-commercial-v2-landscape.mp4  (1920x1080)
npm run build:v2              # renders both V2 outputs
```

Output lands in `video/remotion/out/` (gitignored). V1's output files are
never overwritten by a V2 render — they're different filenames.

## Fonts

`src/fonts.ts` loads Fraunces and Inter from `public/fonts/*.woff2` via
`@remotion/fonts`, instead of fetching them from Google Fonts at render
time the way `@remotion/google-fonts` normally would. That's a deliberate
workaround: in this sandbox, the headless Chromium Remotion drives doesn't
trust the outbound HTTPS proxy's certificate for `fonts.gstatic.com`, so a
live fetch fails mid-render. The two files in `public/fonts/` are the exact
same "latin" variable-font subset Google's CSS API serves for the URL in
`FONT_LINK` (`App.jsx`) — see `public/fonts/README.md` for provenance. On a
normal machine with working internet access to Google Fonts you could
switch back to `@remotion/google-fonts` if preferred; the self-hosted
approach is also just more reliable for CI/render farms in general.

## Chromium / ffmpeg in this environment

`remotion.config.ts` points Remotion at the pre-installed headless Chromium
under `/opt/pw-browsers` (used by Playwright in this container) instead of
letting it try to download its own copy, which the sandboxed network
doesn't allow. This is conditional on that path existing, so it's a no-op
on a normal developer machine — Remotion will download/use its own Chromium
there as usual.

## Adding audio

No royalty-free audio track ships with this project (none was available),
so both V1 and V2 render silent by design — every scene is timed so
music/SFX can be dropped in later without re-touching the visuals. V2's
cue list is in `src/v2/timeline.ts` (`audioCues`), with entries for the
new interactions (subject tap, task tap, calendar highlight, device
parallax, CTA glow) — everything below applies the same way to V2, just
edit `src/v2/Commercial.tsx` and use `src/v2/timeline.ts`'s cues instead.

To add a background track once you have a royalty-free file:

```tsx
// in src/Commercial.tsx
import { Audio, staticFile } from "remotion";
// ...
<Audio src={staticFile("music/your-track.mp3")} volume={0.6} />
```

Put the file in `public/music/`. Remotion will mix it into the rendered
MP4 automatically.

**Sound-effect cue points** are already defined in `src/timeline.ts`
(`audioCues`), as absolute frame numbers matched to on-screen moments:

- Logo reveal (whoosh + chime) — scene 2 start, and again at the CTA
- Wordmark settle (soft pop) — scene 2
- Scene transition swoosh — into Subjects
- Task-checkbox tick (completion sound) — the two checkmarks in
  `ActivitiesScreen` (frames 70 and 100, scene-relative)
- Calendar notification ping — the deadline toast in `CalendarScreen`
  (frame 26, scene-relative)
- Progress-ring fill (rising chime) — scene 6
- Device-swap swoosh — scene 7
- CTA button pop (light tap) — scene 8

To wire one in, wrap it in a `<Sequence from={cue.frame} durationInFrames={...}>`
with an `<Audio>` inside `Commercial.tsx`, using the frame numbers from
`audioCues` directly so the sound stays locked to the animation even if
scene timing is later adjusted.

## Editing the script/copy

All on-screen copy lives directly in each scene component under
`src/scenes/`. Timing (when each scene starts/ends) lives in one place,
`src/timeline.ts` — change a scene's `duration` there and every scene after
it shifts automatically.

## Notes

- The device-mockup screens use representative sample data (subject names,
  task titles, dates) — not a live connection to Supabase or the real app.
  This is intentional: the brief asks for the commercial's code to stay
  fully isolated from the production app.
- `remotion.config.ts` sets `overwriteOutput`, so re-running a render
  command overwrites the previous MP4 in `out/` rather than erroring.
