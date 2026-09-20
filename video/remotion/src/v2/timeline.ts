export const FPS = 30;

const s = (seconds: number) => Math.round(seconds * FPS);

// V2 story beats: Problem -> Relief -> Product Experience -> Progress -> CTA.
// Tighter than V1 (40s) — 35s total, still built from whole-second scene
// blocks so nothing feels clipped. Change a duration here and every scene
// after it shifts automatically (Commercial.tsx reads from this object).
export const scenes = {
  hook: { from: s(0), duration: s(4) }, // 0-4s: "Too many deadlines?" + card burst -> "Keep everything in one place."
  reveal: { from: s(4), duration: s(4) }, // 4-8s: logo reveal, "Meet Takda."
  subjects: { from: s(8), duration: s(5) }, // 8-13s: tap a subject, see its activities
  activities: { from: s(13), duration: s(6) }, // 13-19s: tasks appear, complete one
  deadlines: { from: s(19), duration: s(5) }, // 19-24s: calendar highlight + upcoming list
  progress: { from: s(24), duration: s(4) }, // 24-28s: 0 -> 82% "Less stress. More progress."
  devices: { from: s(28), duration: s(3.5) }, // 28-31.5s: laptop -> phone, parallax
  cta: { from: s(31.5), duration: s(3.5) }, // 31.5-35s: "Stay on track with Takda."
};

export const TOTAL_DURATION = scenes.cta.from + scenes.cta.duration; // 1050 frames = 35.0s

export const TRANSITION_FRAMES = 16;

// Absolute-frame timing points for sound design — see README.md ("Adding
// audio to V2") for how to wire these into <Audio>/<Sequence>. Nothing is
// bundled: no royalty-free track/SFX set was available to include safely,
// so these are documented drop-in points only.
export const audioCues = [
  { frame: scenes.hook.from, label: "hook hit — sharp, modern UI whoosh under \"Too many deadlines?\"" },
  { frame: scenes.hook.from + s(0.3), label: "notification pop — first academic card" },
  { frame: scenes.hook.from + s(0.45), label: "notification pop — second card" },
  { frame: scenes.hook.from + s(0.6), label: "notification pop — third card" },
  { frame: scenes.hook.from + s(0.75), label: "notification pop — fourth card" },
  { frame: scenes.hook.from + s(0.9), label: "notification pop — fifth card" },
  { frame: scenes.hook.from + s(1.05), label: "notification pop — sixth card" },
  { frame: scenes.hook.from + s(2.6), label: "soft whoosh — cards converge into \"Keep everything in one place.\"" },
  { frame: scenes.reveal.from, label: "logo reveal — deep impact/hit + light sweep shimmer" },
  { frame: scenes.reveal.from + s(1.2), label: "\"Meet Takda.\" settle — subtle pop" },
  { frame: scenes.subjects.from + s(1.8), label: "UI tap/click — subject card selected" },
  { frame: scenes.subjects.from + s(2.0), label: "drawer slide — soft swoosh (activities reveal)" },
  { frame: scenes.activities.from + s(3.2), label: "UI tap/click — task row selected" },
  { frame: scenes.activities.from + s(3.5), label: "task checkbox tick — satisfying completion sound" },
  { frame: scenes.deadlines.from + s(1.0), label: "calendar date highlight — soft pulse tick" },
  { frame: scenes.deadlines.from + s(1.4), label: "notification ping — deadline callout" },
  { frame: scenes.deadlines.from + s(3.0), label: "soft whoosh — upcoming list slides in" },
  { frame: scenes.progress.from, label: "rising chime starts — progress ring begins filling" },
  { frame: scenes.progress.from + s(3.2), label: "chime resolves — 82% lands" },
  { frame: scenes.devices.from, label: "soft whoosh — laptop enters" },
  { frame: scenes.devices.from + s(0.6), label: "soft whoosh — phone floats in" },
  { frame: scenes.cta.from, label: "logo return — soft impact + chime" },
  { frame: scenes.cta.from + s(1.5), label: "CTA button pop + subtle glow pulse loop starts" },
] as const;

// Scene timing is built to comfortably fit this narration (not generated
// yet — see README.md "Voice-over"). Each line's frame range is the scene
// it narrates, so dropping in VO later needs no re-timing of the visuals.
export const voiceoverCues = [
  { text: "Too many deadlines?", from: scenes.hook.from, to: scenes.hook.from + scenes.hook.duration },
  {
    text: "Meet Takda — your academic life, organized.",
    from: scenes.reveal.from,
    to: scenes.reveal.from + scenes.reveal.duration,
  },
  {
    text: "Keep your subjects, activities, and deadlines in one place.",
    from: scenes.subjects.from,
    to: scenes.subjects.from + scenes.subjects.duration,
  },
  {
    text: "Know exactly what you need to do and stay on top of what comes next.",
    from: scenes.activities.from,
    to: scenes.deadlines.from + scenes.deadlines.duration,
  },
  {
    text: "Less stress. More progress.",
    from: scenes.progress.from,
    to: scenes.progress.from + scenes.progress.duration,
  },
  {
    text: "Plan anywhere. Study smarter.",
    from: scenes.devices.from,
    to: scenes.devices.from + scenes.devices.duration,
  },
  { text: "Stay on track with Takda.", from: scenes.cta.from, to: scenes.cta.from + scenes.cta.duration },
] as const;
