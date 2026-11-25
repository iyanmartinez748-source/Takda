# Visual Quality Assurance

Loaded whenever a visual rating, judgment, or "this looks X" claim is
about to be made — always during Phase 6a, and any other time Section
0/4/12 of `SKILL.md` trigger it. This is the single most important
reference module: it exists specifically because source-code inspection
was repeatedly treated as equivalent to visual verification in this
project's own history, and the user had to explicitly correct that more
than once. Does not override any approval rule in `SKILL.md` Section 0 —
it adds a verification standard on top of it.

---

## 1. The Core Rule

**Source-code inspection is not visual verification.** Reading a
component's JSX/CSS tells you what *should* render. It does not tell you
what actually renders — browser engines, font loading, cascade
interactions, container sizing, and real content length can all produce
a result the source code doesn't obviously predict. Treat every visual
claim as unverified until it clears one of the evidence tiers below.

## 2. Design Output Stages — Not All "Direction" Is Equally Concrete

Before verification tiers even apply, know which *stage* a piece of
creative work is actually at — these are increasingly concrete, and each
one is a different, weaker kind of commitment than the next:

1. **Written creative direction** — prose describing concept, mood,
   palette intent (Phase 2's output). Useful for alignment; proves
   nothing about how it will actually look.
2. **Described layout** — prose describing structure/composition (Phase
   3/4's output in text form). Still words, not pixels.
3. **Wireframe** — a structural sketch (even a rough one), showing
   placement/hierarchy without real visual polish.
4. **Rendered visual prototype** — an actual visual artifact that can be
   looked at: a published Artifact/standalone HTML mockup, a real
   screenshot, anything that produces pixels a person (or an image-
   capable review) can actually see. This is the first stage that
   constitutes real Tier-3 evidence (Section 3 below).
5. **Actual application implementation** — the real feature, built into
   the real app with real data/state.

**A written description alone is never sufficient for final
visual-direction approval on major work.** For any major redesign, new
screen, or significant creative initiative, a rendered visual prototype
(stage 4) — or the real implementation itself, once it exists and is
actually viewed — is required before that direction is treated as
approved for full application integration. A detailed Phase 2/3
description is a legitimate basis for the user to give *provisional*
direction-level feedback ("yes, explore that direction further"); it is
not a basis for "this is the final visual direction, go build it
everywhere."

**When rendering capability is genuinely unavailable:** say so plainly,
and propose a concrete alternative rather than quietly settling for
stage 1-3 and proceeding as if that were enough. Takda's own established
alternative is the Artifact tool — building a standalone, isolated
HTML/CSS prototype (exactly how the Takda Almanac V3 direction was
originally proposed and approved, before any real application code was
touched) produces genuine stage-4 evidence without touching the real
app at all. Creating such a prototype file is Phase 4 proposal work, not
Phase 5 implementation — it doesn't edit, build, or deploy the actual
Takda application — but it still respects whatever specific boundaries
the user has set for that activity (e.g., scope limited to the
standalone artifact only, no application file edits). If no rendering
pathway is available at all in a given context, state that limitation
explicitly and mark the direction as unverified pending it, rather than
proceeding to full integration on stages 1-3 alone.

## 3. The Five Distinct Verification Tiers — Never Blur Them Together

| Tier | What it actually proves | What it does NOT prove |
|---|---|---|
| **Static code verification** | The code is syntactically correct, tokens/classes are referenced correctly, no dangling variables, logic is internally consistent. | What it looks like rendered. Never report this as "verified visually." |
| **Computed accessibility verification** | A specific foreground/background pair's contrast ratio, computed by the actual WCAG relative-luminance formula by hand (not estimated). | Whether the overall composition looks good, whether the color choice is *harmonious*, or anything about layout/spacing/hierarchy. |
| **Browser verification** | The actual rendered result in a real browser — a screenshot, a live Preview you (or the user) actually viewed, a dev-server render. This is the first tier that can support a genuine aesthetic claim. | Behavior on a different device/OS/browser engine, or anything not actually shown in what was viewed (e.g., a screenshot at one viewport width says nothing about another width). |
| **Physical-device testing** | Real touch-target feel, real safe-area/notch behavior, true color rendering on that device's panel, real performance under real battery/thermal conditions. | Nothing it wasn't actually run on — one device doesn't stand in for all devices. |
| **Subjective visual assessment** | A qualitative judgment ("this feels premium," "this hierarchy reads clearly") — inherently requires Tier 3+ (something was actually seen) as its input; it is never valid as a standalone claim built only on Tiers 1-2. |

**User acceptance is a separate, sixth category, not a verification tier**
— it's not something you produce or claim; it's the user's own decision,
always final, regardless of how much evidence supports your own
assessment (see `SKILL.md` Phase 6c).

## 4. The Mandatory Fallback Rule

**If no Tier-3+ evidence exists, every visual rating and every
"looks/feels X" statement must be explicitly marked "pending visual
verification."** Not omitted, not implied as done, not hedged vaguely —
stated plainly as pending, every time, for every category not actually
backed by evidence. This applies even under time pressure, even when a
user has asked for a confident-sounding deliverable, even when Tiers 1-2
evidence is extensive and well-documented. Extensive Tier 1-2 work is
real and worth presenting — it is just never a substitute for Tier 3+ on
anything genuinely visual.

**Never fabricate:**
- A specific numeric score ("8.5/10") without an actual render behind it.
- A phrase implying verification happened ("tested across themes," "looks
  cohesive now") when only code/computation was reviewed.
- A screenshot-review claim when no image was actually viewed.
- A "this is now production-ready" / "complete" declaration — completion
  of *implementation* is real and claimable once the code is actually
  written and statically sound; completion of *visual quality* is not
  claimable past Tier 2 evidence.

## 5. What to Actually Do When Tier 3+ Evidence Is Available

- A **published Preview URL** (e.g., a Vercel deployment) is real Tier-3
  evidence *once actually viewed* — fetching/opening it and describing
  what's seen is legitimate browser verification; merely knowing the URL
  exists and that the deployment "succeeded" (a CI status check) is
  Tier-1-adjacent (it proves the build didn't error, not what it looks
  like) and must not be conflated with having viewed it.
- A **screenshot** (provided by the user, or captured via an available
  tool) should be reviewed systematically against what the work was
  *supposed* to achieve — don't just confirm "yes it rendered," check it
  against the specific creative-direction/hierarchy/contrast goals from
  Phase 2/3.
- Note the **representative conditions actually covered**: which
  viewport width(s), which theme(s), which interaction state(s) (empty,
  loaded, error, focused). A screenshot of one state in one theme at one
  width is real evidence for exactly that combination — say so
  explicitly, and mark every other combination still pending, rather
  than generalizing one observed state to all of them.

## 6. What to Do When Tier 3+ Evidence Is Not Available

State plainly: "Visual verification is pending — I have not seen this
rendered." Then still deliver everything that *is* genuinely available:
Tier 1 (static correctness), Tier 2 (computed contrast, with the actual
ratios shown), and a clear list of what specifically still needs a real
look once evidence becomes available. This is a complete, honest
deliverable — it is not a failure state, and should not be apologized
for at length; it's simply the accurate status.

## 7. Reporting Format for a Visual QA Pass

When delivering Phase 6a's review, structure findings so evidence status
is unambiguous per claim — never one blanket "verification: pending/done"
label covering a mix of claims with different actual evidence levels.
Minimum shape per claim:

```
Claim: [what is being asserted]
Evidence tier: [1 / 2 / 3 / 4 — see table above]
Evidence: [the specific contrast ratio computed, or the specific
           screenshot/Preview viewed and what state/width/theme it showed]
Status: [confirmed / pending verification]
```

## Common Mistakes

- Writing "verified" or "confirmed working" when only the code was read.
- Treating a successful CI/deployment status as proof of visual quality.
- Generalizing one screenshot (one theme, one width) into a claim about
  "the app" broadly.
- Assigning a numeric score to make a report feel more complete, when no
  render was actually seen.
- Apologizing extensively for pending verification instead of just
  stating it plainly and moving on to what *is* actually deliverable.
