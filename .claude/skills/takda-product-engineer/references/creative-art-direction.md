# Creative & Art Direction

Loaded during Phase 2a (Creative Exploration) and Phase 2b (Art
Direction). This file covers how to generate and compare genuinely
distinct design directions, and Takda's own established creative voice
— the concrete "what already exists" a new direction must either honor
or deliberately, explicitly extend. Does not override any approval rule
in `SKILL.md` Section 0.

---

## 1. Creative Exploration: Generating Distinct Directions

**What counts as "genuinely distinct" (not three flavors of one idea):**
directions should differ on at least one structural axis, not just a
color swap. Useful axes to vary across 2-3 drafts:
- **Composition axis:** symmetric/grid-based vs. asymmetric/editorial.
- **Density axis:** information-dense/utilitarian vs. spacious/calm.
- **Personality axis:** restrained/minimal vs. warm/decorative (e.g. the
  Almanac's atmosphere system vs. a flatter, purely functional treatment).
- **Motion axis:** static/instant vs. a deliberate signature transition or
  ambient animation.

Three drafts that only change the accent hue are not three directions —
that's one direction with a color variable.

**Comparison framework — evaluate each direction against:**
1. **Does it solve Phase 1's actual problem**, or is it attractive but
   orthogonal to the user's real need?
2. **Does it fit within Takda's existing token system**, or does it quietly
   require a parallel set of colors/fonts to work (a red flag — see
   Section 0's "no parallel design system" rule)?
3. **What's the implementation cost/risk** — does it touch a
   heavily-tuned existing layout (see `design-refinement-loop.md`'s note
   on when restructuring is/isn't worth the risk), or is it additive and
   low-risk?
4. **What's the accessibility profile** — does the direction's color/
   contrast story look viable before even building it, or does it lean on
   a palette likely to fail (see `visual-quality-assurance.md`)?

**Present trade-offs plainly, don't silently pick a favorite.** State what
each direction is good at and what it costs, then make a recommendation —
but the comparison itself, not just the conclusion, is the useful
deliverable; it's what lets the user redirect cheaply before any
implementation cost is spent.

## 2. Takda's Established Creative Voice (the baseline to extend, not ignore)

This is "what already exists," stated explicitly so it doesn't need to be
rediscovered from the codebase every time. Per Section 0/1's Creative
Autonomy rule, this baseline can be *proposed* for improvement — but any
new work should at minimum know what it's extending or deliberately
departing from.

**Identity:** "Takda Almanac" — premium, cozy, cinematic, academic,
editorial. Not a generic SaaS dashboard; the intended feeling is closer to
a well-made student planner/almanac than a corporate analytics tool.

**Typography:** Fraunces (display/editorial, variable optical size) +
Inter (interface). See `design-intelligence.md` §1 for the full pairing
rationale — the short version: serif carries personality on headings
only, sans carries everything functional.

**Color system:** token-based, three themes —
- **Classic** — the default, bright/clean, brand purple `#3D2FE0`.
- **Matcha Café** — warm cream/green, softer and more organic.
- **Twilight** — dark/cozy evening theme, brand `#6655E0`, with its own
  dedicated `-text`/`-solid` split and harmonized card backgrounds (a
  dark theme is its own design problem, not an inverted light theme —
  see `design-intelligence.md` §2).

Every status/semantic color (overdue=red, due-soon=amber, on-track/
completed=green, brand=identity/primary) is defined per-theme as a full
family (`-dot`/`-text`/`-bg`/`-border`), never a bare hex reused loosely.

**Signature feature — the Atmosphere system:** an independent,
time-of-day-driven decorative environment (dawn/day/dusk/night) behind
the dashboard greeting, selectable manually or following the device
clock, entirely separate from the Theme preference. This is Takda's most
distinctive visual element and the clearest expression of its "cinematic/
cozy" personality — see `environmental-storytelling.md` for its full
visual language and conventions before touching or extending it.

**Iconography:** lucide-react icons throughout, used at consistent sizes
per context (not ad hoc). Decorative illustration (atmosphere art, empty
states) is hand-built CSS/SVG, not a stock icon library stretched out of
its intended use.

**Motion:** restrained — native CSS transitions/animations, no animation
library installed (see Section 0's restricted-tech list). Motion is used
for state feedback (hover/press, loading) and a small number of ambient
effects (the atmosphere scenes), never as decoration layered onto static
content for its own sake.

## 3. When to Honor the Baseline vs. When to Challenge It

**Honor it by default** for anything that isn't the explicit subject of
the current creative work — don't let a dashboard redesign quietly change
the Sidebar's established pattern as a side effect.

**Challenge it explicitly** when the baseline itself is the identified
weakness — e.g., if a past implementation technically works but reads as
generic, flat, or visually incoherent (the exact gap that motivated this
V2 skill upgrade), say so and propose the stronger alternative, scoped
through Phase 2's exploration-then-comparison process, not as a silent
unilateral change.

**The line is scope, not sentiment.** A proposal to improve the
Twilight palette's internal harmony is refinement within the baseline. A
proposal to replace Fraunces/Inter with a different pairing, or to drop
the Atmosphere system, is a major departure from the established
identity and needs explicit user approval before any implementation,
per Section 0.

## 4. Reference Study — Extracting a Technique, Not an Impression

Naming an inspiration ("study Apple/Linear/Stripe/Notion") is only
useful if it produces something concrete to apply. For any reference
named as inspiration, extract one or more of the following *specific,
transferable techniques* — never just "their general polish":
- **Spacing/density convention** — e.g. Linear's generous negative space
  and tight information grouping; Stripe's consistent small-radius,
  high-contrast-border card system.
- **Type-scale discipline** — e.g. Apple's restrained, very limited set
  of weight/size combinations reused everywhere rather than ad hoc sizes.
- **Elevation/surface language** — e.g. Notion's near-flat surfaces with
  borders doing the separation work instead of shadows.
- **A specific interaction pattern** — e.g. a particular hover-reveal or
  focus treatment, not "their interactions feel nice" in general.

State which specific technique is being borrowed and how it's being
reinterpreted through Takda's own tokens (per Section 2/3 above) — "this
screen borrows Linear's generous negative space, expressed with Takda's
own `gap-6`+ grouping convention" is a usable creative-direction
statement; "inspired by Linear" alone is not.

## Common Mistakes

- Three "directions" that are really one direction with different accent
  colors.
- Proposing a direction that requires inventing new tokens that duplicate
  an existing family's purpose, instead of extending that family.
- Treating the established voice as untouchable even when it's the
  acknowledged weak point under discussion.
- Treating the established voice as disposable by default, redesigning
  things nobody asked to have redesigned.
