# Continuous Design Refinement

Loaded during Phase 6b (Refinement). Defines the iteration loop, its
stopping criteria, and the scope discipline that keeps "refinement" from
quietly becoming an unapproved redesign. Does not override any approval
rule in `SKILL.md` Section 0 — every fix found here still goes through
Section 0's approval gates before being applied, exactly like any other
implementation work.

---

## 1. The Refinement Loop, Concretely

```
Review (Phase 6a) → identify specific weaknesses → fix within authorized
scope → re-review the specific thing that was fixed → repeat until
stopping criteria are met → report to the user (Phase 6c)
```

Each pass should target **specific, named weaknesses** identified in
Phase 6a — never a vague "make it better" pass with no defined target.
If Phase 6a didn't produce a concrete list of issues, go back and produce
one before starting to refine.

## 2. Scope Discipline — the Part Most Likely to Go Wrong

**Refinement fixes identified weaknesses within whatever scope is already
authorized. It does not expand scope.** Concretely:
- If the authorized work was "fix the contrast issue in component X,"
  refinement means iterating on component X's contrast — not restructuring
  component X's layout, and not touching component Y because it has a
  similar issue you noticed along the way (flag Y, don't fix it
  silently).
- A genuinely new opportunity discovered mid-refinement ("I also found
  this and it would really help") is a **finding to report**, not
  something to act on unilaterally — route it back through Phase 2/
  Section 0's approval checkpoint like any other new work, even if it
  feels small.
- "Refinement" is never a backdoor past an approval gate. If a fix would
  require a file edit that wasn't part of the already-approved scope,
  that file edit needs its own approval, full stop.

## 3. When Restructuring vs. Targeted Fixing

Some weaknesses are only fixable by touching a structure that's already
been heavily tuned elsewhere (a long-iterated responsive grid, a
carefully-sequenced animation system). Before restructuring something
like that:
- Check whether a targeted, additive fix solves the actual identified
  weakness without touching the tuned structure at all (usually
  possible — most real weaknesses are narrower than they first appear).
- If restructuring really is necessary, say so explicitly and treat it as
  new-scope creative work (back to Phase 2's exploration-then-approval
  path), not as a refinement pass — restructuring something you can't
  verify the result of (no browser access) carries real risk of breaking
  previously-working behavior, and that risk itself belongs in front of
  the user, not absorbed silently.

## 4. Stopping Criteria — Avoiding Both Failure Modes

**Stop too early** (declaring something finished after one pass with
known issues) is a real failure mode — Phase 6a explicitly says "do not
accept your first implementation as the final version."

**Iterate endlessly without measurable improvement** is the opposite
failure mode, and is just as real. Concrete signals it's time to stop
refining and report to the user instead of continuing:
- The specific, named weaknesses from the current Phase 6a review have
  all been addressed (even if new, smaller ones are now visible — report
  those as findings for the user's next decision, don't chase them
  automatically forever).
- Further changes would require restructuring beyond the authorized
  scope (see Section 3).
- Further changes would require Tier-3+ visual evidence that isn't
  available (`visual-quality-assurance.md`) — don't guess at a fix for a
  problem you can't actually confirm exists or confirm is fixed.
- A genuine technical or capability limitation is reached — e.g., an
  asset need identified per `creative-asset-intelligence.md` Section 4
  that requires separate approval, or the medium-ceiling signal in that
  file's Section 6 (another refinement pass would add complexity without
  moving closer to the actual goal — that's a capability limit, not
  something another pass will fix).

**When any of these is true, stop and report** — a clear list of what was
fixed, what's known to remain, and what would need further approval or
evidence to continue. This is the correct, complete outcome; it is not an
incomplete one.

## 5. Reporting a Refinement Pass

Keep the same evidence-tier discipline as Phase 6a's review
(`visual-quality-assurance.md`) — a fix that was made and statically
verified is not the same claim as a fix that was made and visually
confirmed. State which is which for every item in the pass.

## Common Mistakes

- Expanding scope mid-refinement because a related issue was "right
  there."
- Restructuring a heavily-tuned existing system to fix a narrow issue
  that an additive fix would have solved.
- Refining indefinitely on cosmetic micro-adjustments with no clear
  stopping point, instead of reporting back once the named weaknesses are
  addressed.
- Declaring the first pass final without checking it against Phase 6a's
  own review questions.
