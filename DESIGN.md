# DESIGN.md — Creative Identity Document

<!-- GOVERNANCE
     This file is owned by the human. Sections marked HUMAN-AUTHORED
     are filled in by you, ideally before the first build session, or
     collaboratively with an AI assistant in a dedicated conversation.
     Sections marked AGENT-PROPOSED are populated by the agent during
     sessions and confirmed by you — the same pattern as MEMORY.md.

     The agent reads this file at every session start.
     The agent never asks design questions out of sequence:
       1. References must exist before Derived Identity is attempted.
       2. Derived Identity must exist before Declared Preferences are prompted.
       3. Observed Taste is queued during sessions and proposed at session end.

     If this file is empty or incomplete, the agent asks for References
     before any other design question. It never asks for Declared
     Preferences first.

     Taste constraints recorded here are distinct from technical
     constraints in CONSTRAINTS.md. Do not move entries between files
     unless a taste preference becomes a technical requirement. -->

---

## References
<!-- HUMAN-AUTHORED
     The most important section. Fill this before anything else.
     The agent derives everything downstream from what you put here.
     Screenshots and art files should be committed to your repository.
     URLs are acceptable if files are not available. -->

- **Admired applications or websites:**
  <!-- Filenames of screenshots in your repo, or URLs.
       Example: screenshots/notion-dark.png, https://example.com -->
  - https://bsky.app/
  - https://fornesus.blog/

- **Admired art, design work, or visual culture:**
  <!-- Filenames, URLs, or plain descriptions.
       Example: Saul Bass film posters, brutalist typography,
       screenshots/bauhaus-ref.jpg -->
  - Bluesky's conversational feed rhythm and lightweight social framing.
  - The existing atmosphere and background sensibility of `fornesus.blog`.

- **Admired writing or editorial voices:**
  <!-- Publications, authors, or specific pieces whose tone or
       structure you want to echo. These inform copy direction
       as much as visual references do. -->
  - Personal writing that invites response to ideas rather than performing as a brand voice.

- **Logo:**
  <!-- Filename if available in your repository.
       Example: assets/logo.svg
       Leave blank if none exists yet. -->
  - `artifacts/microblog/public/logo.svg`

- **Existing brand materials:**
  <!-- Any other files — type specimens, color swatches, style guides —
       already committed to the repo. -->
  - `artifacts/microblog/public/opengraph.jpg`
  - `artifacts/microblog/src/index.css`

---

## Derived Identity
<!-- AGENT-PROPOSED, HUMAN-CONFIRMED
     The agent fills this section collaboratively after References exist,
     by asking questions and proposing observations. You confirm, correct,
     or expand each entry before it is considered stable.
     Do not fill this section yourself before discussing it with the agent —
     the value is in the derivation process, not the output alone. -->

- **What your references share:**
  <!-- The common thread the agent observes across your inputs.
       Example: "High contrast, sparse layout, type as the primary
       visual element, no decorative illustration." -->
  - A personal publishing space that feels socially alive: clean, readable, conversational, and centered on ongoing thought rather than polished broadcasting.

- **The tension you are navigating:**
  <!-- The productive contradiction in your references — the thing
       that makes your aesthetic specific rather than generic.
       Example: "Warm and personal, but not precious or nostalgic." -->
  - Open and participatory like a social platform, but still intimate and authored like a personal site.

- **What you dislike in contrast:**
  <!-- Defined negatively. Taste is largely shaped by refusal.
       Be specific — "corporate" is a start, but "the visual language
       of SaaS landing pages: gradient CTAs, stock photography of
       smiling teams, artificial whitespace" is more useful.
       This section informs the agent's gallery options as strongly
       as positive preferences do. -->
  - A generic creator-brand site, overproduced social polish, or any interface that makes the writing feel secondary to growth mechanics.

- **The feeling on first load:**
  <!-- One to three words or a short sentence describing the immediate
       emotional register you want a first-time visitor to experience.
       Example: "Curious. Like finding someone's personal library." -->
  - Thoughtful, current, and personally inhabited.

---

## Declared Preferences
<!-- HUMAN-AUTHORED, after Derived Identity is complete.
     These are starting points, not permanent constraints.
     If you change your mind, update this section and note the
     change in DECISIONS.md. Do not move taste preferences to
     CONSTRAINTS.md unless they become technical requirements. -->

- **Color direction:**
  <!-- A palette, a mood, specific hex values, or a reference.
       Example: "Dark background. Warm off-white text. One accent
       color, used sparingly — leaning toward ochre or rust." -->
  - **Bauhaus Primary Tricolor:** A strict palette of Red (`#FF0000`), Blue (`#0000FF`), and Yellow (`#FFFF00`).
  - Stark White (`#FFFFFF`) and Black (`#000000`) provide the structural foundation and heavy borders.
  - No pastels, no gradients, and no intermediate colors like orange or green.

- **Type direction:**
  <!-- Specific typefaces, or a descriptive direction if typefaces
       are not yet chosen.
       Example: "Serif for body, monospace for metadata and code.
       Nothing geometric or neutral — something with visible history." -->
  - **Space Grotesk** for primary sans-serif UI and body text.
  - **Inter** as the fallback or for specific legible blocks.
  - High weight (900/Black) and all-caps used for headers and interactive elements to emphasize the Brutalist aesthetic.

- **Layout disposition:**
  <!-- How you want space and content to relate.
       Example: "Generous margins. Text width constrained. No sidebars.
       Let the content breathe." -->
  - Rigid grid-based layout with heavy borders (8px-12px for primary containers).
  - High-density information stack on mobile, with secondary widgets "hidden in plain sight" at the bottom of the feed.

- **Motion and interaction:**
  <!-- Your position on animation, transitions, and interactive behavior.
       Example: "No decorative animation. Transitions only where they
       carry meaning. Fast." -->
  - Instant, snappy transitions.
  - Interaction feedback via "Brutal Pop" scale effects and stark shadow translations.

- **What must never appear:**
  <!-- Visual or tonal elements that would immediately feel wrong.
       Example: "Stock photography. Gradient hero sections.
       Auto-playing anything. Emoji used decoratively." -->
  - Pastels, soft shadows, rounded corners (all radii must be 0), and any decorative color outside the primary tricolor set.

---

## Observed Taste
<!-- AGENT-PROPOSED, HUMAN-CONFIRMED
     Populated during sessions when the agent notices a signal —
     an enthusiasm, a complaint, a reference made in passing,
     an implied direction not yet consciously claimed.
     Proposed at session end alongside MEMORY.md updates.
     Format mirrors MEMORY.md:

     YYYY-MM-DD · CATEGORY · Observation in one sentence.
         [Optional: the exact exchange or context that surfaced it]

     Valid categories:
     INFLUENCE · REFUSAL · TENSION · VOICE · DIRECTION

     Examples:
     2026-04-10 · REFUSAL · Finds AI-generated imagery dishonest
         rather than merely aesthetically displeasing.
         [User: "it's not that I dislike how it looks, I dislike
         what it means"]
     2026-04-10 · TENSION · Wants the site to feel personal but
         is resistant to anything that reads as self-indulgent.
     2026-04-10 · INFLUENCE · Referenced Saul Bass twice without
         being asked about visual influences.

     Keep under 50 entries. When approaching the limit, ask the
     user to review — consolidate stable patterns into Derived
     Identity and archive older entries to docs/design-archive.md. -->

2026-04-29 · REFUSAL · Dislikes an always-open composer at the top of the homepage and prefers writing to begin as a deliberate, opt-in action rather than a permanent visual demand.
    [Surfaced when the user described the top-level post dialog as distracting and chose a collapsed composer.]

2026-04-29 · DIRECTION · Wants the site to retain useful social-feed affordances like filtering and sorting even as it becomes more of a single-author showcase.
    [Surfaced when the user explicitly asked for browse controls despite noting the site may no longer feel like a traditional social platform.]

2026-04-29 · TENSION · Wants showcase-grade expressive authoring for the owner while keeping the overall site experience readable and focused for visitors.
    [Surfaced through the combined requests for rich posts, embeds, media uploads, and a calmer homepage composition flow.]

---

<!-- The agent holds the brush. You choose what gets painted.
     This document is how you tell the agent what you see. -->
