# Gemini CLI Assistant Context

See AGENTS.md for all project context, conventions, and task ownership.

<!-- Any Gemini CLI Code-specific additions below.
     AGENTS.md is the authoritative rule set.
     Only add here what Gemini CLI needs that
     other tools do not. -->
When Gemini CLI is in Plan Mode and the user's prompt names a specific route, file, or output format — triggering gallery suppression — explicitly note the suppression at the top of the plan and offer one alternative framing before building. This surfaces the trade-off even when the prompt signals execution intent.