export const FPS = 30;

const s = (seconds: number) => Math.round(seconds * FPS);

// Scene boundaries, in frames, matching the requested 8-beat story (each
// range is [from, from+durationInFrames)). Total = 40s @ 30fps = 1200 frames.
export const scenes = {
  problem: { from: s(0), duration: s(5) }, // 0-5s
  intro: { from: s(5), duration: s(4) }, // 5-9s
  subjects: { from: s(9), duration: s(5) }, // 9-14s
  activities: { from: s(14), duration: s(6) }, // 14-20s
  deadlines: { from: s(20), duration: s(6) }, // 20-26s
  progress: { from: s(26), duration: s(5) }, // 26-31s
  anywhere: { from: s(31), duration: s(4) }, // 31-35s
  cta: { from: s(35), duration: s(5) }, // 35-40s
};

export const TOTAL_DURATION =
  scenes.cta.from + scenes.cta.duration;

// Crossfade length used by <SceneTransition> between every pair of scenes.
export const TRANSITION_FRAMES = 14;

// Timing points for sound design, expressed as absolute frame numbers so an
// editor can line them up 1:1 once music/SFX are added. See
// README.md ("Adding audio") for how to wire these into <Audio>/<Sequence>.
export const audioCues = [
  { frame: scenes.intro.from, label: "logo reveal — soft whoosh + chime" },
  {
    frame: scenes.intro.from + s(2),
    label: "wordmark settle — subtle pop",
  },
  {
    frame: scenes.subjects.from,
    label: "transition swipe — soft swoosh",
  },
  {
    frame: scenes.activities.from + s(2.2),
    label: "task checkbox tick — completion sound",
  },
  {
    frame: scenes.activities.from + s(4.2),
    label: "task checkbox tick — completion sound",
  },
  {
    frame: scenes.deadlines.from + s(1.5),
    label: "calendar notification — notification ping",
  },
  {
    frame: scenes.progress.from + s(0.5),
    label: "progress ring fill — rising chime",
  },
  {
    frame: scenes.anywhere.from,
    label: "device swap — soft swoosh",
  },
  { frame: scenes.cta.from, label: "logo return — soft whoosh + chime" },
  {
    frame: scenes.cta.from + s(2.5),
    label: "CTA button pop — light tap",
  },
] as const;
