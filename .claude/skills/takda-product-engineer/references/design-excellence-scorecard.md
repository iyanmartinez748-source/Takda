# Design Excellence Scorecard

Loaded during Phase 6a **automatically** for any major visual redesign,
new screen, or significant creative initiative — not only when the user
explicitly asks for a rating. A reusable rubric so this doesn't get
re-authored ad hoc each time. **Every rule in `references/visual-quality-
assurance.md` applies to every score produced here** — this file defines
*what* to score, VQA defines *how a score may legitimately be claimed*.
Does not override any approval rule in `SKILL.md` Section 0.

---

## 0. How to Use This Scorecard

- **When this applies automatically:** a new screen, a major redesign, or
  any work whose own scope matches Phase 2a's "non-trivial" threshold
  (see `creative-art-direction.md` §1) triggers this scorecard whether or
  not the user asked for a rating — Phase 6a is incomplete without it for
  that scale of work. A minor, narrowly-scoped visual correction (a
  single token fix, a spacing tweak, a one-line contrast fix) does not
  need the full scorecard — use **proportionate evaluation** instead:
  report what changed, its evidence tier, and whether it resolved the
  specific issue, without forcing all ten categories.
- **Minimum desired quality: 9/10 in every applicable category.
  Aspirational target: 9.5/10 or higher.** These are objectives the work
  aims at — never guaranteed outcomes, and never self-assigned without
  Tier-3+ evidence (see VQA).
- **WCAG AA accessibility is reported separately, as a measurable
  pass/fail with actual computed ratios** — not folded into a subjective
  "Readability" score. A category can be subjectively pleasant to read
  and still fail AA, or vice versa; keep the two findings distinct.
- **Mark a category "Not applicable"** when the surface being evaluated
  genuinely doesn't have that dimension (e.g., "Dashboard composition" on
  a single modal dialog) — don't force a score onto an irrelevant
  category.
- **Never average categories together, and never let a strong average
  conceal one weak category.** Report each of the ten categories as its
  own independent score. A design with nine 9.5s and one confirmed 5 is
  reported as exactly that — nine strong categories and one real
  problem — never blended into a single "8.9 overall" that hides which
  specific thing needs fixing.
- **No final visual rating without actual rendered evidence (Tier 3+).**
  This is not a reminder — it is the same hard rule as VQA Section 3,
  restated here because it is the rule most likely to be skipped under
  time pressure on a scorecard specifically. A category without Tier-3+
  evidence is reported as "pending verification," never a number.
- **User acceptance remains mandatory regardless of score.** Even a
  scorecard reporting 9.5 across every category does not constitute
  approval — it is information for the user's own decision (Phase 6c),
  never a self-declaration that the work is done.
- **Never inflate a rating to hit the target.** A category that is
  honestly a 6 is reported as a 6, with the evidence that puts it there
  and the corrective action that would move it up. The 9/9.5 figures are
  where the work aims, not where every report must land.
- **The user holds final visual acceptance authority, always** — this
  scorecard informs that decision; it never substitutes for it.

## 1. Scoring Anchors (used for every category below)

| Band | Score | Means |
|---|---|---|
| Ordinary | 5-6 | Functional, but generic/templated — would look the same in almost any app. |
| Good | 7-8 | Solid and internally consistent, no major flaws, but not distinctive or memorable. |
| Excellent | 9 | Distinctive, polished, no confirmed defects — the minimum desired bar. |
| Exceptional | 9.5-10 | Distinctive *and* cohesive *and* verified across all relevant conditions (themes/widths/states), with no known open gaps. |

A score below 5 means a confirmed defect exists (not just "could be
nicer") — state the defect plainly rather than assigning a number in that
range as a vague impression.

## 2. The Ten Categories

For each: evaluation criteria, common failure patterns, what evidence is
required to score it at all, and the typical corrective action.

### Typography
- **Criteria:** a clear 2-3-role type system (display/interface/data),
  deliberate scale and weight hierarchy, line-height/tracking tuned per
  size, readable long-content handling. (`design-intelligence.md` §1)
- **Common failures:** display font used on interface chrome; flat
  weight (everything bold or nothing bold); untested against long
  user-generated strings.
- **Evidence required:** Tier 3+ (rendered) for the scale/hierarchy
  judgment; Tier 1 suffices only to confirm the *intended* classes are
  applied, not that they read well.
- **Corrective action:** apply the role/scale/tracking rules in
  `design-intelligence.md` §1; re-render and re-check.

### Color Palette
- **Criteria:** semantic color discipline, 60/30/10 balance, theme-aware
  construction (not inverted-light-theme assumptions). (`design-
  intelligence.md` §2)
- **Common failures:** ad hoc hex values outside the token system;
  multi-card surfaces pulling backgrounds from mismatched sources
  (tint-scale vs. independent token) producing "disconnected" cards.
- **Evidence required:** Tier 2 (computed contrast) for any
  accessibility-adjacent claim; Tier 3+ for a harmony/cohesion judgment.
- **Corrective action:** trace every color back to its token family;
  compute actual contrast for anything new; add a dedicated token rather
  than reusing one from an unrelated scale.

### Visual Hierarchy
- **Criteria:** one clear focal point per screen; scale/weight/position/
  whitespace used deliberately to rank importance; urgency communicated
  through more than color alone. (`design-intelligence.md` §3)
- **Common failures:** uniform cards all competing equally; hierarchy
  conveyed by color with no accessible secondary signal.
- **Evidence required:** Tier 3+ — hierarchy is fundamentally a perceptual
  claim.
- **Corrective action:** apply `design-intelligence.md` §3's four levers;
  pick and strengthen one focal point.

### Artistic Execution
- **Criteria:** distinctive, intentional visual identity (not a generic
  template); environmental/decorative work has real depth, not flat
  gradients; every element serves a purpose. (`creative-art-direction.md`,
  `environmental-storytelling.md`)
- **Common failures:** symmetric, template-feeling layouts; decorative
  elements that are technically present but visually thin (a glow with
  no defined light source, a silhouette with no depth layering).
- **Evidence required:** Tier 3+.
- **Corrective action:** apply the layered-depth/light-source techniques
  in `environmental-storytelling.md` §3, or the asymmetric-composition
  guidance in `design-intelligence.md` §4.

### Readability
- **Criteria:** actual legibility at real sizes/weights/contrasts across
  every theme, not just Classic. Separate from — but informed by — the
  WCAG AA finding below.
- **Common failures:** a muted/tertiary text tier that passes in one
  theme and fails in another; text over a variable/decorative background
  (atmosphere scrim) not checked at its worst moment.
- **Evidence required:** Tier 2 minimum (computed contrast per theme);
  Tier 3+ to confirm actual legibility (font rendering, real content
  length) beyond the raw ratio.
- **Corrective action:** compute per-theme, not just per-default-theme;
  re-tune the specific failing token, preserving its tier's relative
  position in the hierarchy (don't collapse two tiers together while
  fixing one).

### Premium Appearance
- **Criteria:** consistent, purposeful corner-radius/shadow/border system;
  selective glassmorphism; deliberate state treatment (hover/press/focus/
  disabled); restrained microinteractions. (`premium-design-standards.md`)
- **Common failures:** shadow used as decoration rather than elevation
  signal; missing focus-visible states; glassmorphism applied to every
  repeated card.
- **Evidence required:** Tier 3+ for the overall impression; Tier 1 can
  confirm a specific state (e.g., focus-visible) is coded, but not that
  it reads well.
- **Corrective action:** apply `premium-design-standards.md`'s
  elevation/state/glassmorphism rules.

### Dashboard Composition
- **Criteria:** the screen reads as one composition, not a pile of
  individually-fine cards — balance, grouping, negative space,
  information density matched to task. (`design-intelligence.md` §4, §6)
- **Common failures:** every card the same size/weight; no visible
  grouping via spacing contrast; equal density everywhere regardless of
  task.
- **Evidence required:** Tier 3+.
- **Corrective action:** introduce deliberate span/size variation and
  spacing-contrast grouping; identify and strengthen one focal point.

### Responsive Design
- **Criteria:** verified behavior across the representative width set in
  active use for this project, in both portrait/landscape where relevant,
  with no unintended horizontal overflow and real touch-target sizing.
- **Common failures:** a fixed-size element that doesn't scale down; a
  grid that cramps rather than reflows below its collapse breakpoint;
  overflow masked with a blanket `overflow-x: hidden` instead of fixed at
  the source.
- **Evidence required:** Tier 3+ *per width actually checked* — a single
  width's screenshot is evidence for that width only, not "responsive
  design" generally; state exactly which widths were covered.
- **Corrective action:** apply `design-intelligence.md` §5's grid/
  container-query guidance; fix the overflow at its source.

### Interaction Design
- **Criteria:** every interactive element has a deliberate rest/hover/
  press/focus/disabled treatment; motion is meaningful and
  reduced-motion-safe. (`premium-design-standards.md` §4, §6)
- **Common failures:** missing or default-browser focus ring; animation
  with no reduced-motion fallback; feedback that's too slow to read as
  responsive.
- **Evidence required:** Tier 3+ to confirm the feel; Tier 1 to confirm
  `prefers-reduced-motion` is actually handled in the CSS.
- **Corrective action:** add the missing state treatment; add the
  reduced-motion fallback.

### Application-Wide Consistency
- **Criteria:** the same token/component/behavioral pattern holds across
  every screen it applies to, not just the screens most recently worked
  on. (`design-intelligence.md` §8)
- **Common failures:** an older component never retrofitted to a newer
  token/pattern, discovered only by actually searching the whole
  codebase for the old pattern.
- **Evidence required:** Tier 1 is actually sufficient and necessary here
  (a full-codebase search for the old pattern) — this is the one category
  where exhaustive static verification is the primary evidence, though
  Tier 3+ is still needed to confirm the fix renders correctly once
  applied.
- **Corrective action:** search exhaustively, not just in the files
  expected to be affected; apply the same fix everywhere the old pattern
  is found.

## 3. WCAG AA — Reported Separately, Always With Real Numbers

For every foreground/background pair newly introduced or changed, report
the actual computed ratio (WCAG relative-luminance formula) against the
4.5:1 (normal text) / 3:1 (large text, ≥18px regular or ≥14px bold) / 3:1
(meaningful non-text UI) thresholds, per theme. A pass/fail table, not a
rolled-up subjective impression — "accessible-feeling" is not a
substitute for the actual ratio.

## 4. Scorecard Output Template

```
Category: [name, or "Not applicable" with a one-line reason]
Evidence tier: [per references/visual-quality-assurance.md]
Score: [number, or "pending verification"]
Justification: [what was actually observed/computed, in one or two sentences]
Corrective action (if below 9): [specific, concrete next step]
```

Plus a separate WCAG AA table (Section 3 above) and a closing line
reiterating that final acceptance belongs to the user.

## Common Mistakes

- Rolling WCAG AA into the subjective "Readability" number instead of
  reporting it separately with real ratios.
- Scoring "Responsive Design" as a single number without stating which
  widths were actually checked.
- Inflating a category to 9 because that's the target, rather than
  reporting what the evidence actually supports.
- Scoring a category that doesn't apply to the surface under review
  instead of marking it not applicable.
