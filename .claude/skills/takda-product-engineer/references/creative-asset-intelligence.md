# Creative Asset Intelligence

Loaded during Phase 4 whenever a new icon, illustration, decorative
graphic, or other visual asset is needed. Gives the decision framework
for choosing the right medium, and the mandatory protocol for when real
(non-code-generated) artwork is required. Does not override any approval
rule in `SKILL.md` Section 0 — in particular, the asset-request protocol
in Section 4 below is itself an approval gate, not a suggestion.

---

## 1. The Decision Framework

Work through these questions in order; stop at the first medium that
genuinely satisfies the need — don't default to the most complex option
"to be safe," and don't force a cheap option past its honest limit.

| Question | If yes → |
|---|---|
| Is this a common, recognizable interface glyph (an arrow, a checkmark, a trash icon)? | **Existing icon library** (lucide-react, already installed — do not introduce a second icon library). |
| Is it a simple geometric/decorative shape, a data visualization, or a custom icon lucide doesn't have? | **SVG** (hand-authored path/shape, inline or as a component). |
| Is it a flat color field, a gradient, a simple pattern, a shadow/glow effect? | **CSS** (gradients, box-shadow, blend modes — no extra asset at all). |
| Does it need internal texture/depth built from several simple shapes (clouds, craters, a layered landscape)? | **Hybrid: CSS/SVG composited** (multiple gradient layers or SVG shapes in one construct — see `environmental-storytelling.md` §3 for the concrete technique). |
| Does it need a specific illustrated character, scene, or painterly/
  photographic texture that flat shapes structurally cannot produce? | **Original digital illustration** — a real asset-generation/sourcing need. Go to Section 4 below. |
| Is it a real photograph, or does it need photographic realism (a textured material, a real-world object)? | **Optimized raster artwork** (a real photo/render, properly compressed/responsive). Go to Section 4 below. |

**CSS/SVG is the default, not a constraint to force everything into.**
It's free (no asset pipeline, infinitely scalable, trivially theme-aware,
cheap to animate), which is why it's the first resort — but "we already
have this technique working" is never a reason to ship a visibly weaker
result than the brief actually calls for. If CSS/SVG has stopped
improving the result and started just adding complexity, that's the
signal to move to the next tier, not to keep layering gradients.

## 2. Icon Consistency Rules

- One icon library for interface glyphs (lucide-react) — introducing a
  second one is a dependency decision gated by Section 0, not a free
  choice.
- Consistent size per context (e.g., all list-row icons the same size,
  all nav icons the same size) — a grab-bag of icon sizes across
  otherwise-similar contexts reads as unpolished.
- Consistent stroke width — lucide's default is already consistent; don't
  mix stroke weights by pulling icons from different sources.
- Decorative illustration (empty states, atmosphere art) should share a
  visual register with itself across instances (the same line-weight/
  fill style for every empty-state illustration, not a different style
  per screen).

## 3. Illustration Style for Empty States & Decorative Art

Match Takda's established register: simple, warm, line-art-leaning
illustration (see Takda's own book/seal motifs) rather than a flat,
generic icon stretched large, and rather than an overly detailed/
busy illustration that competes with the surrounding interface. A good
empty-state illustration should be legible and meaningful at roughly
40-56px — if it needs to be huge to read, it's too detailed for this use.

## 4. The Asset-Request Protocol (mandatory when real artwork is needed)

When Section 1's framework concludes that CSS/SVG genuinely cannot
deliver the required quality, **stop before generating, sourcing, or
integrating anything**, and present exactly this, then wait for explicit
approval:

1. **Asset type** — original illustration vs. photograph vs. stock
   source, and why (tie back to which Section 1 question triggered this).
2. **Composition requirements** — subject, framing, mood/style reference,
   what must be in focus vs. background.
3. **Exact dimensions** — the largest size it will render at, plus the
   aspect ratio(s) needed across breakpoints.
4. **Responsive cropping strategy** — does one image crop safely across
   all needed widths (a focal-point-safe crop), or are multiple
   crops/`srcset` variants needed? State which.
5. **Optimization requirements** — target format (WebP/AVIF with a
   fallback), target file-size ceiling, and whether it needs to be an
   optimized raster at all vs. convertible to SVG.
6. **Integration plan** — exactly which component/file it plugs into,
   and how it degrades (a placeholder, a CSS fallback) if it's ever
   missing or slow to load.

Only after the user explicitly approves this spec does sourcing/
generation/integration happen — and that step is itself still gated by
whatever Section 0 approval already governs file edits. Never generate or
integrate an asset "to show what it would look like" without this
approval sequence completed first.

## 5. Optimization Baseline (once an asset is approved)

- Serve modern formats (WebP/AVIF) with a broadly-supported fallback.
- Always set explicit width/height (or `aspect-ratio`) to prevent layout
  shift while loading.
- Lazy-load anything below the fold; never lazy-load the first visible
  hero/masthead image.
- Respect the existing responsive-image conventions already in `src/`
  rather than introducing a new, one-off loading pattern.

## 6. Creative Capability Awareness — Knowing When a Technique Has Hit Its Ceiling

**Recognize the ceiling of the current medium, explicitly, rather than
discovering it through repeated polishing.** CSS/SVG, a specific icon
library, or any other available medium each has an honest quality
ceiling (see Section 1's framework). The failure mode to actively avoid
is repeatedly refining a CSS/SVG approximation — another gradient layer,
another shape — pass after pass, when the actual gap is medium-level, not
polish-level: no amount of additional CSS layering will produce
photographic texture, a specific illustrated character, or painterly
detail, because the medium itself cannot do that, not because it hasn't
been tried hard enough yet.

**The test:** if a refinement pass (`design-refinement-loop.md`) is about
to add complexity without the result moving meaningfully closer to the
actual creative goal, stop and ask whether the medium itself — not the
execution — is the limit. If so, that's a Section 4 asset-need moment,
not a refinement-loop moment.

**When this happens, recommend the appropriate path instead of
continuing to iterate on the wrong medium:**
- A different, more capable *code-based* medium if one is genuinely
  available (e.g., an actual chart library already in the stack, instead
  of hand-built SVG, for genuinely complex data visualization).
- A real asset-generation/sourcing need, via the Section 4 protocol.
- A collaboration point: if the right answer is a human designer's
  judgment call (a brand decision, a genuinely subjective aesthetic
  choice) rather than something any tool can resolve, say that plainly
  instead of continuing to produce more automated attempts at it.

**Never present a technical workaround as artistic equivalence without
evidence.** A CSS approximation that was built because real artwork
wasn't yet approved is a reasonable interim step — but it must be
labeled as exactly that (an interim approximation, pending the real
asset) and never described as "equivalent quality" or "just as good"
without Tier-3+ evidence (`visual-quality-assurance.md`) actually
supporting that specific claim.

## Common Mistakes

- Reaching for a stock photo or external illustration when a CSS/SVG
  technique would have genuinely sufficed (over-engineering the asset
  pipeline for something simple).
- Forcing CSS/SVG past its honest limit and shipping a visibly flat
  result where real texture/illustration was actually needed, without
  ever flagging the gap.
- Generating or integrating an asset before the Section 4 spec was even
  presented, let alone approved.
- A new illustration that doesn't match the established line-weight/
  style register of existing illustrations elsewhere in the app.
- Repeatedly refining a CSS/SVG approximation across multiple passes
  instead of recognizing after the first or second that the medium
  itself, not the execution, is the limiting factor.
- Describing a workaround as "equivalent" to the real asset without any
  evidence backing that specific comparison.
