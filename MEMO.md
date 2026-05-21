# Make the deal a first-class object

> Slice 1 design memo · The Crescent / Greenroom case study · 2026-05-21

> **Note on slice naming.** The brief labels this slice "deal modeling." On the evidence, modeling — making the calculator handle the deal types it's missing — is the downstream symptom; the root cause is that the deal itself never has a single source of truth. I widened the slice from "calculator handles all deal types" to **"make the deal a first-class object,"** and modeling becomes one of four downstream gaps the upstream fix closes.

## The slice

Sarah Kim: *"The deal was a ghost. Mariana had her notes, I had my email, Andrea had her recollection of the negotiation, and none of them perfectly agreed."* The deeper root cause is that Greenroom itself amplifies the fragmentation. Without it, Mariana's settlement lives in two places (email + Excel). With it, five+ (half-filled deal fields, an unreliable status, a calculator that fails on 62% of her deals, an empty audit trail) — information is more scattered, not less.

**Slice 1 deep: make the deal a first-class object.** Four components, end-to-end: the LLM extracts deal terms from prose; structured `issues[]` surface prose-internal problems (ambiguity, drift, deferral, missing context); a cross-source reconcile pass compares the extracted canonical against the structured DB fields and emits drift issues; the settlement calculator now handles vs / percentage_of_net / door deals, removing the amber empty state. History (component 4) is deferred to phase 2.

**Why this cut over the others.** 62% of The Crescent's deals don't fit the in-app calculator. 21 paid settlements still carry disputed recoups. Coastal Spell alone had three WME marketing-recoup disputes in one year. The calculator gap, the agent disputes, the status drift, the 2am surprises — all downstream echoes of one root cause. **One upstream cut has more leverage than six downstream patches.**

## Design choices

**Decision 1: the LLM's responsibility is narrow.** It extracts semantics from a single source (the prose notes); it does not self-report confidence and does not reconcile across sources. Anything the prose itself leaves unresolved — internal ambiguity, content deferred to email, drift notes, missing critical values — is surfaced as a structured `Issue` with `kind`, `field`, an actionable `message`, and a `proseSnippet` for provenance. The subject is the deal, not the AI. A senior teammate doesn't say "I'm 0.6 confident"; they say "I've extracted what's there — these three things I couldn't resolve from the source, you decide."

**Decision 2: visibility instead of forced resolution.** A status badge on the show header and an issues panel next to the deal make problems visible. Mariana chooses when to open them — including settling now and addressing issues later. The product never blocks her with a modal demanding a 30-second, four-choice decision.

**Decision 3: prompt engineering is a product lever, not an engineering default.** Extraction runs on `gpt-4o-mini` with a short set of critical prompt rules — we did not upgrade to `gpt-4o` or `4.1`. At The Crescent's ~22 shows/month, marginal cost is ~$0.013 per extraction — under thirty cents per venue per month, effectively zero.

**UI taste.** Provenance hover, bidirectional, between issues and the prose spans that triggered them; an issues list in place of confidence labels (subject is deal, not AI); a status badge — not a modal — for visibility; microcopy in Mariana's language (*"Prose says 'against gross' but the inline note says WME disputed the basis interpretation. Confirm…"*) instead of engineering jargon; existing visual tokens reused (amber for drift, brand for verified, rose for conflict) rather than inventing new ones.

## What I cut

- **2am walkthrough conversation.** Mariana's own line: *"Most of the friction comes from things knowable on Wednesday."* 2am is the symptom; the deal-as-ghost is the disease.
- **Dispute resolution.** Of 24 disputed settlements in the DB, 15 carry positive sign-off text — and Sarah Kim's read is "real disputes are about one in thirty." Most disputes are downstream symptoms of ghost-deal ambiguity; resolving them at the dispute step is a bandage.
- **Real-time prediction.** Marcus doesn't want a payout prediction; he wants a *deal-cleanliness* prediction. That's a byproduct of canonical extraction (a static scan over the issues a deal carries), not a separate slice.
- **Audit trails.** Plumbing. Absorbed into slice 1 as the history component (phase 2). Standing alone, it doesn't show enough PM judgment.
- **Post-show agent communication.** Tightly coupled to deal modeling (an agent-facing statement must cite the canonical deal). At 6-8 hours of build, it didn't fit alongside the four components — placed in §5 as the near-term ship.

## Validation

A three-tier pyramid, each layer stricter than the last:

- **Training set** (10 cases, used during prompt iteration): **10/10 PASS.**
- **In-distribution holdout** (9 cases, untouched during iteration; covers sellout bonuses, vs-of-gross basis, the "85/15 net" slang shorthand, and bonuses deferred to email): **9/9 clean.**
- **Random sample** (N=20 untouched rows from the 537-deal DB, no curation, no PM pre-knowledge of which patterns to expect): v1 **19/20** → one prompt patch → v2 **20/20**.

Total cost across all three rounds: ~$0.04 (`gpt-4o-mini` at temperature=0).

**The PM takeaway:** the random sample caught a real gap the curated holdout missed. On show_0364, the prose described the walkout-pot threshold as "breakeven on guarantee + expenses" — dynamic, not a dollar amount. The LLM correctly set threshold to `null` but failed to surface a `missing_context` issue, silently hiding the gap. Fix: a CRITICAL prompt rule pairing any null critical bonus/recoup field (when caused by vague or dynamic prose) with a `missing_context` issue. Product fix, not eval fix. The full iteration trail (including a separate `720 → 900` temperature-drift bug) is in the session upload bonus.

**Production still needs:** sampled human review (~5-10% of live extractions) as a hedge against LLM drift; cross-source reconciliation extended to more fields and bonus types; a Mariana-acceptance metric (issues followed vs overridden vs ignored); and a continuous random-sampling cadence (e.g., 20 rows/month) with adversarial seeding to probe the long tail.

## What ships next

**Inside slice 1.** History (component 4 — `deal_changes` table plus a last-three-changes timeline in the UI); the confirm flow (issue-resolution actions write back to the audit trail); a native `walkout_pot` bonus type in the DB schema so the calculator can apply it directly.

**Beyond slice 1 — three horizons.**

- **Near-term (vertical, first step):** Slice 5 — an agent-facing settlement statement that cites the canonical deal, closing the venue ↔ agent loop. This is what Sarah Kim asked for in plain words: *"structured collaboration, not an asymmetric document."*
- **Mid-term (vertical, deepening):** extend canonical into adjacent stages — advance and booking — closing Pri's CEO-memo "advance craft gap."
- **Long-term (horizontal, network):** the 340-venue data network enables an agent-profile and agent-side coaching loop, addressing Sarah's *"deal emails get written at 11pm by overworked agents"* at its source. This is where Greenroom's unfair advantage actually cashes in.
