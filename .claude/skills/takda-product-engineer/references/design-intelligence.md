# Design Intelligence (includes Visual Hierarchy & Composition)

Loaded during Phase 2b (Art Direction) and Phase 3 (Design Architecture).
This file covers typography, color, visual hierarchy/focal points,
editorial composition and asymmetric balance, grid systems, information
density/negative space, and visual rhythm/alignment — the merged
"Design Intelligence" + "Visual Hierarchy and Composition" module. This
file does not restate or override any approval rule in `SKILL.md` Section
0 — it is methodology only.

---

## 1. Typography Systems & Font Pairing

**The framework:** every screen needs at most 2-3 typographic roles, each
with one clear job:
- **Display/editorial** — headings, hero text, anything meant to carry
  personality. In Takda this is Fraunces (serif, variable optical size).
- **Interface/functional** — body text, labels, buttons, forms,
  navigation. In Takda this is Inter.
- **(Optional) Data/tabular** — numbers meant to be scanned in columns
  (stats, prices, dates). Reuse the interface font with `tabular-nums`
  rather than introducing a third family.

**Pairing rule:** a serif display face paired with a geometric/grotesque
sans for interface text is a classic, reliable editorial pairing (it's
why Fraunces+Inter was chosen for Takda) — the contrast in letterform
construction (humanist curves vs. clean geometric sans) is what reads as
"designed," not just "two fonts."

**Scale:** don't invent arbitrary sizes. Use a bounded type scale — Takda's
practical scale is `text-xs(12px) → text-sm(14px) → text-base(16px) →
text-lg(18px) → text-xl(20px) → text-2xl(24px) → text-3xl(30px) →
text-4xl(36px)+`. Each jump should be deliberate: a card title and a page
title should never be the same size.

**Weight discipline:** reserve `font-bold`/`font-extrabold` for true
emphasis (page titles, key stats). Overusing bold flattens hierarchy —
if every label is bold, nothing reads as more important than anything
else. Body/caption text should default to `font-medium` or regular.

**Line-height:** display headings read best tight (`leading-tight`,
`tracking-tight` at large sizes — Fraunces specifically, being a serif
with generous x-height, benefits from slightly negative tracking above
`text-xl`). Body/paragraph text needs room (`leading-relaxed`,
`leading-7`) — tight line-height on multi-line body text actively hurts
readability.

**Letter-spacing:** tight (`tracking-tight`) on large display type; wide
(`tracking-wide`) only on small uppercase labels/eyebrows (it's what
makes all-caps readable at 10-11px instead of looking cramped). Never
apply wide tracking to lowercase body text.

**Responsive type:** headings should step down at least one size between
desktop and mobile (`text-xl sm:text-2xl md:text-3xl`, not a single fixed
size) — a 36px heading that was comfortable on a 1440px screen is
disproportionate on a 375px phone.

**Long user-generated content:** never assume short strings. Subject
names, note bodies, activity titles are user-typed and can be long.
Always pair a `truncate`/`line-clamp-N` strategy with a title attribute
or a way to see the full text, and test the layout mentally (or for
real, once verification is possible) against a deliberately long string,
not just the placeholder example.

**Common mistakes:**
- Using the display font for buttons, form inputs, or navigation (Stage
  B's own rule: serif stays for *headings*, not interface chrome).
- More than 2 real font families in one view.
- A single fixed heading size across all breakpoints.
- Centering body paragraphs (fine for a single short line; hurts
  readability past 2-3 lines — left-align instead).

## 2. Color Psychology & Semantic Color Systems

**Semantic first, decorative second.** Every color in a product UI should
answer "what does this mean," not just "does it look nice." Takda's own
token system already does this correctly: `--takda-status-overdue-*` (red
family = urgency/risk), `--takda-status-week-*` (green = healthy/on
track/completed), `--takda-status-tomorrow-*` (amber = attention-soon),
brand purple = identity/primary action. Any new color must declare which
of these families it belongs to, or introduce a new family with the same
discipline (a dedicated `-text`/`-bg`/`-dot`/`-border` set, not a lone
hex).

**The 60-30-10 rule, adapted:** roughly 60% of a screen should be neutral
surface/background, 30% a secondary supporting tone (muted text, borders,
subtle tints), and 10% or less genuinely saturated accent color (brand,
status colors). A screen where every card is a different saturated color
violates this and reads as "cards competing for attention" rather than
"one composition" — this is the literal "disconnected cards" failure
mode identified in Takda's own Twilight theme.

**Tint scales vs. independent semantic tokens — know which one you're
using.** A *tint scale* (e.g. `--takda-brand-tint-1/2/3`) is built to step
lightness progressively for ONE hue, for things like increasingly
prominent surfaces of the same color. An *independent semantic token*
(e.g. `--takda-status-week-bg`) is tuned on its own, for its own meaning.
Never pull a background for a multi-card grid from a tint scale on one
card and independent semantic tokens on its neighbors — their lightness
values were never designed to match each other, and in a dark theme the
mismatch becomes visually obvious (this exact bug shipped in Takda's own
Twilight dashboard and had to be fixed with a dedicated token).

**Dark themes are not just inverted light themes.** A color that works as
text on white does not automatically work as text on near-black — compute
it, don't assume it. A brand color tuned for "readable as a button fill
with white text" and a brand color tuned for "readable as text color on a
dark page" are frequently two different colors in a dark theme, even
though they can be the identical color in a light theme (this is exactly
why Takda ended up with a `--takda-brand-solid` vs. `--takda-brand-text`
split).

**Common mistakes:**
- Inventing a new color ad hoc instead of extending the existing token
  family it semantically belongs to.
- Assuming "it passed in Classic so it passes everywhere" — always
  re-check each theme independently (see `visual-quality-assurance.md`
  for how).
- Using saturated color for decoration where a neutral would do, diluting
  the meaning of saturated color elsewhere on the same screen.

## 3. Visual Hierarchy & Focal Points

**Hierarchy is created by relationship, not by size alone.** Four levers,
used together: **scale** (bigger = more important), **weight** (bolder/
more saturated = more important), **position** (top-left and
center-of-first-view read as most important in LTR layouts), and
**isolation/whitespace** (an element surrounded by more empty space reads
as more important than one packed tightly among others). A screen where
every card uses the same size, same weight, same surface treatment, and
equal spacing has *no* hierarchy regardless of how nice each individual
card looks — this is the real failure mode behind "every card competes
equally for attention."

**Pick one focal point per screen.** Ask: if a user looks at this screen
for one second, what should they see first? For a dashboard, that's
usually the greeting/status masthead or the single most time-sensitive
item (an overdue task, the next class). Everything else should be
visibly secondary to it — smaller, less saturated, or simply positioned
after it.

**Urgency needs more than color.** An "overdue" badge that's only
distinguished by a red dot, sitting in a list of otherwise-identical rows,
is easy to miss at a glance. Real urgency hierarchy combines: color +
position (surface it earlier/separately) + sometimes a count badge or
label text, not color alone. Takda's own `URGENCY_STYLE` system (color +
label text together) is a good baseline — don't remove the label text
even when the color alone seems "obviously" red.

**Common mistakes:**
- Flat, uniform card grids with no size/weight variation ("competing
  cards").
- Treating every status/action as equally prominent.
- Hierarchy conveyed by color alone, with no accessible non-color signal.

## 4. Editorial Composition & Asymmetric Balance

**Symmetric grids are safe; asymmetric composition reads as "designed."**
A perfectly even 2-or-4-column grid of identically-sized cards is the
fastest way to look like a generic dashboard template. An editorial
composition instead varies card *span* and *position* deliberately — one
hero element spanning wider, supporting elements smaller and grouped —
while keeping an underlying grid so it still feels ordered, not random.

**Asymmetric ≠ unbalanced.** True visual balance in an asymmetric layout
comes from weight, not symmetry: a large, light-colored element on one
side can balance a small, dark/saturated element on the other, because
visual "weight" is a function of size × contrast × saturation, not just
physical area. If an asymmetric layout feels lopsided, the fix is usually
adjusting contrast/saturation of the smaller side, not making everything
the same size again.

**When to use it, when not to.** Reserve genuine asymmetric restructuring
for screens meant to be *read* (a masthead, a landing hero, an editorial
feature) — information-dense utility screens (a data table, a settings
list, a dense activity log) are usually better served by a calm,
regular, scannable grid. Don't impose "editorial" asymmetry on a screen
whose job is fast scanning, not storytelling.

## 5. Grid Systems & Responsive Layouts

**Think in content-aware grids, not fixed column counts.** CSS Grid with
explicit per-item `col-span` (what Takda's own dashboard bento grid
already does) lets different cards claim different widths based on their
actual content needs, rather than forcing every card into one uniform
cell. Plan the grid at each breakpoint tier deliberately — don't just let
a fixed column-count collapse arbitrarily; decide, at each tier, which
elements deserve to be full-width and which pair up.

**Container queries over viewport media queries for reusable
components.** A component that will be dropped into different-width
contexts (a sidebar one day, a full-width section the next) should
respond to *its own* available width via `@container`, not the viewport —
otherwise it will look right in one context and wrong in another
(Takda's own established convention; keep using it for new reusable
components).

**Mobile is not "desktop, but narrower."** Below the collapse breakpoint,
a grid should become one deliberately-ordered stacked column, not a
cramped 2-column squeeze of desktop content. Decide the stacking *order*
explicitly (what should a student see first on a phone?) rather than
letting DOM order alone decide it.

## 6. Information Density & Negative Space

**Negative space is a design element, not wasted space.** A screen with
too little breathing room between groups reads as "crowded/stressed" even
if every individual card is well-designed — exactly the opposite of a
"calm, organized" dashboard. Group related elements with small internal
gaps (e.g. `gap-2`) and separate distinct groups with a visibly larger gap
(e.g. `gap-6`+) — the *contrast* between the two gap sizes is what
communicates grouping, more than either value alone.

**Density should match task, not screen real estate.** A quick-glance
dashboard summary can be dense (many stats visible at once); a
form/dialog asking for careful input should be airier (fewer fields
visible per scroll, more space per field) so it doesn't feel like an
interrogation. Don't apply one density standard uniformly everywhere.

**Common mistakes:**
- Equal gaps everywhere (no visible grouping).
- Padding added without reducing anything else — "crowded" is usually
  fixed by removing/consolidating an element, not just adding padding
  around the same amount of content.

## 7. Visual Rhythm & Alignment

**Pick a spacing unit and stay on it.** An 8px (or 4px) base spacing
grid — i.e. every margin/padding/gap is a multiple of that unit — is what
makes a layout feel intentional rather than ad hoc. Tailwind's own
spacing scale is already built on a 4px unit (`gap-1`=4px, `gap-2`=8px,
etc.) — the discipline is using it *consistently*, not introducing
arbitrary one-off pixel values (`mt-[13px]`) except where a specific,
documented reason requires it (matching an icon's exact optical center,
for instance).

**Alignment creates implied lines.** Elements across different cards
should share invisible alignment lines (the same left edge, the same
baseline for a row of numbers) — when they don't, the eye perceives
disorder even if no single element looks wrong in isolation. When
building a repeated card/row pattern (subject cards, activity rows),
keep the icon position, label position, and value position at the exact
same offset across every instance.

**Common mistakes:**
- Icons/avatars at slightly different sizes across otherwise-identical
  rows.
- Mixed text-alignment (some labels left, some centered) within one
  repeated list.
- Off-grid one-off spacing values scattered through a component that
  otherwise follows the 4px/8px rhythm.

## 8. Application-Wide Visual Consistency

**A token system only works if every screen actually uses it.** The
single most common real-world failure mode (confirmed repeatedly in
Takda's own history) is a component built before a token/pattern existed,
never retrofitted — producing a hardcoded color or font choice that
silently diverges once the rest of the app moves on. When auditing
consistency, don't just check the screens you're actively working on —
grep for the old pattern (a specific hex, a specific Tailwind utility
class family) across the *entire* source tree, not just the files you
expect to be affected.

**Consistency has levels — check all of them:** (1) token-level (same
colors/fonts/radii referenced), (2) component-level (the same kind of
button/card/badge looks the same everywhere it appears), (3)
behavioral-level (the same kind of interaction — e.g. a destructive
delete action — follows the same confirmation/feedback pattern
everywhere it exists). A screen can pass level 1 and still fail level 2
or 3.

## Common Design Mistakes (cross-cutting summary)

- Generic template feel: symmetric grids everywhere, no focal point, no
  distinct typographic voice.
- Every card/status visually competing at equal weight.
- Color carrying meaning with no secondary (non-color) signal.
- Inconsistent spacing rhythm within one screen.
- A component whose token usage silently diverged from the rest of the
  app and was never audited against it.
- Treating "I verified the hex values compute correctly" as equivalent to
  "I saw it rendered and it looks right" — these are different kinds of
  verification (see `visual-quality-assurance.md`).
