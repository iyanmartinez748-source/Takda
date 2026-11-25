# Premium Design Standards

Loaded during Phase 4 (Visual Prototype/Execution). Covers surfaces,
lighting/shadow/material treatment, and interaction/motion principles —
the details that distinguish a premium application from an ordinary one
at close inspection. Does not override any approval rule in `SKILL.md`
Section 0.

---

## 1. Corner Radius

**Use a small, deliberate scale, not arbitrary values.** A healthy radius
system has roughly 4 tiers, each tied to a role:
- **Full/pill** (`rounded-full`) — avatars, dots, badges, circular
  buttons.
- **Large** (`rounded-2xl`+) — primary containers: cards, panels, modals.
- **Medium** (`rounded-xl`) — buttons, inputs, secondary interactive
  elements.
- **Small** (`rounded-lg` or less) — compact icon buttons, small chips.

The test for "is this already consistent": grep the actual radius
utility usage across the codebase before assuming it needs fixing — a
spread across exactly these 4 tiers is a *working* system, not
inconsistency, even though it looks like "4 different values" at a
glance. Inconsistency is a *container* and a *button* using different
radii for the same role in different parts of the app, not the existence
of multiple tiers.

## 2. Surface Depth, Shadow, and Material

**Shadows communicate elevation, not decoration.** A heavier/larger
shadow means "this sits above/in front of its surroundings" (a modal, a
hovered card, a floating action button) — don't apply a heavy shadow to
something that doesn't need to read as elevated; it just looks like
unexplained fog under a flat element.

**Prefer a graduated elevation system over one flat shadow value
everywhere:** resting state (subtle, if any), hover/interactive-lift
state (slightly stronger), and true overlay state (modals, dropdowns —
strongest). Reusing the *same* shadow value for a resting card and an
open modal flattens the hierarchy between "content on the page" and
"content temporarily floating above it."

**Glassmorphism — selective, not default.** A frosted/translucent surface
(`backdrop-filter: blur`) works for a small number of genuinely elevated,
persistent-over-content surfaces (a sticky top bar, a bottom nav) where
something is meant to feel layered above scrolling content. It is
expensive to repeat across many small cards in a grid (real performance
cost multiplied by instance count) and reads as noise rather than
premium once overused. Prefer a plain surface + a subtle inset
highlight (a 1px top inner shadow using a light/dark highlight token) to
fake a "glass-adjacent" feel on repeated elements, without the blur cost
— this is Takda's own established convention and should stay the
default for anything that repeats.

**Borders as the quiet structural layer.** A 1px border in a
low-contrast neutral tone (not pure black/white) is often a better way to
separate a surface from its background than a shadow — it's cheaper,
doesn't imply false elevation, and reads as "defined" rather than
"floating." Use shadows for things that are genuinely elevated; use
borders for things that are simply separated.

## 3. Buttons, Icons, Proportions

**Icon-to-text alignment:** an icon paired with a text label should be
optically centered against the text's cap-height/x-height, not just
vertically centered against the full line-box — a slightly-off icon
baseline is a small detail that reads as "not quite polished" even when
nothing is objectively broken.

**Button proportion:** padding should scale with font size, not stay
fixed — a `text-xs` button and a `text-base` button using identical
padding values will look disproportionate (one cramped, one oversized
relative to its text). Keep a consistent padding-to-text-size *ratio*
across button sizes, not a single fixed padding value reused everywhere.

**Touch targets:** maintain at least a 44×44px actual hit area for any
tappable control on mobile, even when the *visible* glyph is smaller
(a small icon can sit inside a larger invisible tappable box — this is
Takda's own established pattern for compact list-row actions; keep using
it rather than shrinking the real hit area to match a small visible
icon).

## 4. Interaction States

Every interactive element needs a deliberate treatment for each of:
**rest → hover → active/pressed → focus-visible → disabled**. Missing any
one of these (most commonly: a visible, non-default focus-visible ring)
is a concrete, checkable premium-polish gap, not a stylistic nicety —
keyboard and screen-reader users depend on focus-visible specifically.

**Press feedback should be immediate and subtle** — a small scale-down
(`active:scale-[0.98]`) or a brightness/opacity shift reads as responsive;
anything that takes longer than ~150ms to register as "something
happened" reads as laggy regardless of actual performance.

**Disabled states need a non-color signal too** (reduced opacity *and*
`cursor-not-allowed`/`aria-disabled`), not just a slightly duller color
that a user might mistake for the normal resting state.

## 4a. Motion Design Catalog (specific techniques, carried over from V1)

Beyond the general hover/press/focus states above, these specific motion
categories each have their own concrete technique — don't let "keep
motion restrained" (§6 below) become an excuse to skip them where they
genuinely apply:

- **Page/view transitions** — when switching between major views
  (Dashboard → Subjects, opening a detail screen), a brief, consistent
  fade/slide (not a bespoke effect per screen) signals "you moved
  somewhere," without the user losing their place. Keep it under ~200ms;
  longer reads as sluggish.
- **Modal/dialog transitions** — entrance should feel like the modal
  arrived (a slight scale-up + fade from ~96% to 100%, not a hard cut),
  exit can be faster/simpler than entrance. Takda's own
  `.takda-sheet-enter`/pop-in conventions are the established pattern —
  reuse them rather than inventing a new one per modal.
- **Scroll-triggered reveals** — use sparingly, only where content
  genuinely benefits from a staged appearance (a long landing page), and
  always respect `prefers-reduced-motion` by showing content in its final
  state immediately rather than withholding it behind a scroll trigger.
- **Number counters** — animating a stat from 0 (or its old value) to its
  new value on change is a legitimate, satisfying premium touch for
  dashboard statistics specifically *when the number actually changed*
  (not on every re-render) — don't animate a value that's identical to
  what was already shown.
- **Interactive charts** — hover/focus on a data point should reveal its
  exact value (a tooltip), and any entrance animation (bars growing,
  lines drawing in) should run once on first render, not replay on every
  unrelated re-render of the surrounding component.

## 5. Loading, Empty, and Error States — Treated as Real Design Surfaces

**A loading state is not "nothing, then content."** Any list/data view
that can take visible time to populate should show a skeleton shaped like
the real content (matching its layout — icon + two text lines, a card
grid, etc.) rather than a blank area or a bare spinner with no context of
what's coming.

**An empty state is an opportunity, not a failure mode.** "No data yet"
screens should explain *what* goes here and *how* to add the first one
— ideally paired with a small, on-brand illustration (CSS/SVG, matching
the app's own visual language — see `creative-asset-intelligence.md`),
not just a terse gray sentence.

**Error states need to be consistent in presentation**, not just in
color token. Decide once (banner vs. inline text vs. toast) for a given
category of error (e.g., "form validation" vs. "network/server error")
and apply it everywhere that category occurs — a screen where some
errors are red inline text and others are a bordered banner reads as
unfinished even if the color tokens are all technically correct.

## 6. Microinteractions

**Restraint is the premium signal, not density of effects.** One
well-placed, meaningful microinteraction (a satisfying checkbox-complete
animation, a subtle success pulse) reads as more premium than five
different animated flourishes competing for attention on the same
screen. If in doubt, cut rather than add.

**Every microinteraction needs a `prefers-reduced-motion` fallback** — not
optional, not "respect it when convenient." A reduced-motion user should
get the same *information* (something succeeded, something is loading)
through an instant state change instead of an animated one, never
nothing at all.

## 7. Scrollbars & Overflow

Prefer a styled, unobtrusive scrollbar (thin, token-colored thumb) over
the raw OS default inside any custom-scrolling container (a modal body,
a horizontally-scrolling shelf) — a default chunky system scrollbar
inside an otherwise polished custom panel is a small but noticeable
"premium" miss. Never hide overflow outright just to avoid styling it —
that's covering a symptom, not fixing it (see the responsive-design
guidance already established elsewhere in this project: no blanket
`overflow-x: hidden` to mask a real layout problem).

## Common Mistakes

- A heavy shadow on a flat, non-elevated card "because it looks nice."
- Glassmorphism/backdrop-blur applied to every repeated card in a grid.
- A focus-visible state that's missing, or identical to the hover state.
- An empty state that's just muted gray text with no illustration or
  guidance.
- Five different animated effects on one screen, none of them essential.
- A raw system scrollbar inside an otherwise custom-styled modal.
