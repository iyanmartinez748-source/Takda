# Takda Commercial (Remotion)

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

Two compositions are registered in `src/Root.tsx`:

| id               | Resolution  | Aspect | Use case                                   |
|------------------|-------------|--------|---------------------------------------------|
| `TakdaVertical`  | 1080×1920   | 9:16   | TikTok, Reels, YouTube Shorts               |
| `TakdaLandscape` | 1920×1080   | 16:9   | Website, YouTube, presentations             |

Both run at **30fps** for **1200 frames (40 seconds)**, matching the 8-beat
story in the brief. Every scene is written once, parametrized by
`orientation: "vertical" | "landscape"`, so layout adapts (phone mockup vs.
laptop mockup, stacked vs. side-by-side) without duplicating scene logic.

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
npm run render:vertical    # → out/takda-vertical.mp4   (1080x1920)
npm run render:landscape   # → out/takda-landscape.mp4  (1920x1080)
npm run build               # renders both
```

Output lands in `video/remotion/out/` (gitignored).

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
so the commercial renders silent by design — every scene is timed so
music/SFX can be dropped in later without re-touching the visuals.

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
