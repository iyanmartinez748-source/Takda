# Environmental Design & Visual Storytelling

Loaded during Phase 4 whenever the work touches the Atmosphere system,
a hero/masthead, or any other decorative-environment surface. Codifies
Takda's own built environmental-design language as durable precedent, so
it doesn't need to be rediscovered from the codebase each time, and sets
the standard for "cinematic depth via lightweight CSS/SVG" work generally.
Does not override any approval rule in `SKILL.md` Section 0.

---

## 1. What "Environmental Storytelling" Means Here

The Atmosphere system (dawn/day/dusk/night behind the dashboard greeting)
is Takda's signature expression of "cinematic, cozy, academic" — its job
is to make the dashboard feel like a *place* (a particular time of day in
a particular world), not just a colored gradient behind some text.
Environmental storytelling is judged on whether a student would actually
recognize and feel each time of day distinctly, not on whether the CSS is
clever.

## 2. The Established Visual Language (one consistent world across all four periods)

**Layered depth, not a flat backdrop.** Every scene is built from
distinct depth layers, back to front: sky gradient → ambient light (a
soft blurred halo) → a crisp sun/moon disc (with its own light source
logic) → clouds/stars (mid-ground) → layered landscape silhouettes
(far/mid/near, each its own distinct shape, lightening and desaturating
toward the back — atmospheric perspective) → a foreground scrim (a subtle
gradient ensuring foreground text stays readable regardless of scene).
A new environmental scene should use this same layer stack, not a single
flat gradient — "simple gradients and blurred circles" alone is exactly
the weakness this module exists to prevent repeating.

**Each period has its own defined mood, not just a different hue:**
- **Dawn** — soft, hopeful, quiet. Warm-cool gradient transition
  (violet → rose → peach), a soft sun with gentle light rays, 2-3
  graceful animated birds, light mist near the horizon. Peaceful, not
  dramatic.
- **Day** — clear, calm, refreshing. Bright blue-to-white gradient,
  soft multi-lobed clouds drifting gently, a bright crisp sun. The
  "working/focused" mood.
- **Dusk** — the most cinematic period: golden-hour drama. Deep
  violet-to-orange gradient, a large, clearly-defined warm sun low in
  the sky, strong layered mountain/hill silhouettes for depth, warm rim
  light on the landscape edges.
- **Night** — peaceful, contemplative, built for quiet study. Deep
  indigo/near-black gradient, a soft-glowing moon (with subtle crater
  texture for realism, not a flat disc), twinkling stars of varied
  size/brightness (not uniform dots — a few brighter "accent" stars read
  as more sophisticated than many identical ones), the same layered
  silhouettes in their darkest, most desaturated form.

**Consistency requirement:** a technique used for one period (the 3-layer
hill system, the crisp sun/moon disc, multi-lobe clouds) must be used for
*all four*, even where the brief only explicitly calls it out for one —
"maintain a consistent environmental world across all four periods" means
exactly this: the same construction language, different colors/mood.

## 3. "Sophisticated 3D-like Depth" Through Lightweight CSS/SVG — How, Concretely

- **Atmospheric perspective** (distant = lighter/hazier/less saturated,
  near = darkest/sharpest) is the single highest-value depth trick for a
  flat 2D scene, and it's nearly free (a handful of static gradient/color
  layers, no 3D engine needed).
- **Layered backgrounds in one element** (multiple `radial-gradient(...)`
  entries in a single `background` property) build a textured shape
  (cloud puffs, moon craters) from one static DOM node — no extra markup,
  no extra paint cost versus a flat shape.
- **A defined light source** (the sun/moon disc itself, not just its
  glow) with a consistent highlight position across halo/glow/disc layers
  is what separates "a light effect" from "an object that is a light
  source" — always draw the actual body, not only its glow.
- **Static directional light cues** (a conic-gradient ray burst, a rim
  light on a silhouette edge) read as "lit by this scene's sun" without
  needing any animation or a real lighting engine.

## 4. Deliberately Not Photorealistic — Say So, Don't Pretend

CSS/SVG atmosphere art is stylized, flat-shaded illustration — closer to
a vector poster than a photo. That's the correct, honest register for
this technique; never describe a CSS gradient scene as "photorealistic"
or imply it is real photography. If a request specifically wants
photographic/painterly realism beyond what gradients and shapes can
deliver, that's a real artwork need — see Section 5 below and
`creative-asset-intelligence.md`.

## 5. When CSS/SVG Genuinely Isn't Enough

Stop and flag it — don't force a technique past its honest limit. Signs
a scene needs real artwork instead of more clever CSS:
- The brief specifically asks for painterly/photographic texture
  (brushwork, film grain, realistic cloud volumetrics) that flat
  gradients structurally cannot produce.
- The scene needs a specific, recognizable illustrated character or
  object beyond simple geometric shapes.
- Stacking more and more gradient layers has stopped adding depth and
  started adding paint cost with diminishing visual return.

When this happens, follow `creative-asset-intelligence.md`'s asset-request
protocol exactly: specify the exact asset needed, then stop and get
approval before any generation/sourcing/integration — never substitute a
weaker CSS approximation silently and call it equivalent, and never
integrate an asset without that separate approval.

## 6. Performance & Accessibility Discipline (non-negotiable, ties to Section 0)

- **Continuous animation only on the active/visible scene.** Every
  looping animation (cloud drift, bird flight, star twinkle) must be
  scoped so it runs *only* while that scene is the one currently shown —
  an inactive scene sitting at `opacity: 0` must not still be animating
  underneath; that's wasted battery for zero visible effect. Verify this
  by checking the CSS selector itself requires the "active" state class,
  not just the scene's own identity.
- **`prefers-reduced-motion` must suppress every one of these animations
  outright** (not merely slow them down) — a twinkling star or flapping
  wing is exactly the kind of persistent motion that preference exists to
  remove. A scene *transition* (the crossfade between periods) can be
  shortened rather than fully removed, since it's a one-time state
  change, not a persistent loop.
- **Foreground text must stay readable against every scene.** The scrim
  layer (a gradient darkening/lightening the area behind text) should be
  verified against the *lightest* and *darkest* moments of every scene,
  not just a middle case.
- **All of this is decorative, not informational** — mark the entire
  decorative layer `aria-hidden="true"` (the real greeting/status text
  lives in its own normal, non-hidden layer) and `pointer-events-none`
  (it must never intercept a click/hover meant for real content beneath
  or beside it).

## 7. Technical Correctness (carried over from V1 — still required)

Any time-of-day-driven feature (the Atmosphere system's "auto" mode, the
dashboard greeting) must:
- **Use the user's actual local timezone/device clock**, not a server
  timezone or a hardcoded offset.
- **Handle time-period boundaries correctly** — verify the exact hour
  values at which one period hands off to the next, including edge
  cases (midnight rollover, the exact boundary minute).
- **Avoid unnecessary page reloads** when the time period changes while
  the app is open — re-resolve and re-render the affected state in place
  (this is how Takda's own `resolvedAtmosphere` state + periodic
  re-check already works; new time-driven features should follow the
  same pattern, not force a reload).

This is a correctness requirement, not a creative one — it belongs here
because it's specific to this feature area, but it is checked the same
way as any other functional claim (`SKILL.md` Section 4), not as a
visual one.

## Common Mistakes

- A new scene/period that reuses one flat gradient with no depth layers,
  while siblings have the full layer stack.
- An animation added without checking whether it needs
  `prefers-reduced-motion` handling or active-scene scoping.
- Describing a CSS gradient as "photorealistic."
- Silently settling for a weaker CSS approximation when the brief
  actually called for real artwork, instead of flagging the gap.
- A sun/moon drawn only as a blurred glow, with no actual defined disc.
- A time-based feature that reads server time, ignores the exact
  boundary hour, or forces a full page reload to reflect a time change.
