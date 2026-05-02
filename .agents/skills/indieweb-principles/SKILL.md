---
name: indieweb-principles
description: >
  Reference for IndieWeb philosophy and principles as they apply
  to implementation decisions. Load this skill when a decision
  touches data ownership, content portability, site identity,
  or long-term longevity — or when the person asks why IndieWeb
  recommends a particular approach. Do not load for routine
  implementation work where the principle is already clear from
  AGENTS.md context.
---

# IndieWeb Principles — Reference During Implementation

## How to Use This Skill

These principles are not rules. They are lenses for evaluating
decisions that have no single technically correct answer. When a
decision feels close — two approaches seem equally valid — check
it against the relevant principle below before presenting a gallery.

They are also not equally weighted in all contexts. The first
three principles (own your data, humans first, make what you need)
are load-bearing for every IndieWeb site. The remaining seven
are more contextual — apply them when the situation calls for them.

---

## The Principles

### 1. Own Your Data
**What it means:** Content lives on the person's domain. Canonical
URLs point here. No third party controls access to the content or
can make it inaccessible by changing their terms or shutting down.

**Agent behavior:**
- Flag any dependency that makes content inaccessible if the
  service shuts down. Ask the Socratic ownership question:
  "Who controls this content if that service disappears?"
- Never store canonical content in a third-party system without
  an export path. Document the export path in docs/dependencies.md.
- Syndicated copies must link back to the canonical URL here.

**Apply when:** Evaluating any vendor dependency, database choice,
hosting decision, or syndication target.

---

### 2. Humans First
**What it means:** Human-readable HTML is the primary layer.
Machine-readable markup (microformats2, JSON-LD, RSS) is built
on top of it — never as a replacement.

**Agent behavior:**
- Readable HTML ships first. Parseable markup is added to it,
  never substituted for it.
- A page that works only for machines — or only for machines
  after hydration — violates this principle.
- microformats2 classes are attributes on visible, human-readable
  elements. Do not create hidden elements solely for parser
  consumption.

**Apply when:** Designing templates, adding semantic markup,
evaluating server vs. client rendering choices.

---

### 3. Make What You Need
**What it means:** Build for stated use cases only. Do not scaffold
features the person has not described needing.

**Agent behavior:**
- Ask before building anything not explicitly requested.
- "The person might want this later" is not a justification for
  building it now.
- Speculative scaffolding creates maintenance burden and encodes
  assumptions about what the person values.

**Apply when:** Deciding scope at the start of any feature,
evaluating whether to add a post type, route, or endpoint that
wasn't explicitly requested.

**Connects to:** The Scope question in the socratic-depth skill —
"What would happen if you didn't build this?"

---

### 4. Use What You Make
**What it means:** Test the site as the site owner would use it.
If it doesn't work for the owner, it doesn't ship.

**Agent behavior:**
- Test every feature from the perspective of the person posting,
  editing, and reading their own content — not from the
  perspective of an external visitor or parser.
- A feature that passes external tests but is frustrating for
  the owner to use is not done.

**Apply when:** Reviewing any publishing flow, editor experience,
or admin interface before marking a feature complete.

---

### 5. Document
**What it means:** Every non-obvious decision gets a comment or
a docs/ entry. The site should be understandable to its owner
after a six-month gap.

**Agent behavior:**
- Any decision that would not be immediately obvious to the
  person six months from now gets a comment in the code or
  an entry in docs/.
- DECISIONS.md is the primary record for architectural choices.
  Code comments handle implementation-level decisions.
- "This is standard" is not a substitute for documentation when
  the standard is not something the person would know.

**Apply when:** Writing non-trivial logic, making a choice
between two valid approaches, adding any IndieWeb spec endpoint.

---

### 6. UX Before Plumbing
**What it means:** Do not implement a spec until a real UX need
depends on it. Protocol infrastructure without a user-facing
reason to exist is waste.

**Agent behavior:**
- A real UX need exists when the person has described a workflow
  or outcome the spec would enable. If none is stated, ask.
- Building Micropub before the person has described a publishing
  workflow they're frustrated by is plumbing before UX.
- This principle overrides the spec priority table in
  indieweb-specs when no UX need is present.

**Apply when:** Evaluating whether to start implementing a new
IndieWeb spec, or when a spec endpoint is requested without a
stated reason.

---

### 7. Modularity
**What it means:** Each web feature is isolated. Replacing or
removing one must not cascade into breaking others.

**Agent behavior:**
- Webmention, IndieAuth, Micropub, and WebSub endpoints are
  independent. Removing one must not break the others.
- Use the spec dependency map in indieweb-specs to check for
  hidden dependencies before modifying any spec feature.
- microformats2 classes are the most common source of hidden
  coupling — a class removed from a template may break a spec
  feature that depends on it elsewhere.

**Apply when:** Refactoring, removing a feature, or evaluating
whether a change to one spec endpoint could affect another.

---

### 8. Longevity
**What it means:** The site should still work and still be
readable in ten years. URLs are permanent. Implementation
details do not leak into public addresses.

**Agent behavior:**
- No database IDs in public URLs. No framework internals
  in public URLs. No post type names in public URLs —
  types change; URLs must not.
- Permanent redirects for any moved content. Never a 404
  for a URL that was once public.
- Prefer formats with long track records: HTML, Atom, JSON.
  Avoid formats tied to a single framework or vendor.

**Apply when:** Designing URL structure, evaluating format
choices, moving or renaming content.

**Connects to:** The Consequence question in socratic-depth —
"What becomes harder to change in six months?"

---

### 9. Pluralism and Voice
**What it means:** The web is most valuable when it contains
distinct, irreplaceable personal voices. Generic patterns
produce a less valuable web.

**Agent behavior:**
- The gallery protocol exists partly to counteract AI averaging.
  The implied option must surface this specific person's
  direction — not the most common direction for someone with
  similar stated preferences.
- DESIGN.md exists to make the person's aesthetic identity
  legible to the agent across sessions. Use it.
- AI-generated prose for publication must be marked as a draft
  for human review. The person is always the named author.
- Research on human-AI collaboration (Walton et al., 2026,
  doi:10.1145/3773292) found human-steered sessions produce
  outcomes 2–4× better than passive ones. The protocols here
  are not friction — they are what makes the output good.

**Apply when:** Generating any content draft, choosing between
a conventional and unconventional design option, evaluating
whether a feature reflects the person's voice or a generic
pattern.

---

### 10. Have Fun
**What it means:** Personality and joy are features. Do not
sand them down in pursuit of convention or correctness.

**Agent behavior:**
- An unconventional choice that the person loves is better
  than a conventional choice they tolerate.
- "That's not how most sites do it" is not a reason to
  discourage a direction the person is excited about.
- Support unconventional choices fully. Rule 4 of AGENTS.md —
  the person owns everything — includes the right to build
  something strange, playful, or deliberately imperfect.
- If the person's DESIGN.md Observed Taste signals joy or
  humor, the gallery options should reflect that register —
  not neutralize it.

**Apply when:** Any moment where a technically correct but
joyless choice is about to be presented as the only option.

---

## Principle Conflict Resolution

When two principles appear to conflict, resolve in this order:

1. **Own your data** overrides convenience. A simpler solution
   that compromises ownership is not simpler — it is worse.

2. **Humans first** overrides machine optimization. A page that
   is more parseable but less readable has made the wrong trade.

3. **Make what you need** overrides completeness. An unbuilt
   feature cannot break.

4. **Have fun** overrides convention. The person's enjoyment
   of their own site is a feature, not a vanity.

If a conflict cannot be resolved with this ordering, present it
to the person as a gallery with one option per principle. Let
them choose which value takes precedence for this project.

---

> These are not checkboxes.
> They are the reason the checkboxes exist.