# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Layout

This is a single-context repo.

Read these files if they exist:

- `CONTEXT.md` at the repo root
- `docs/adr/` for architectural decision records

If any of these files don't exist, proceed silently. The producer skill (`grill-with-docs`) can create them later when domain language or decisions actually get resolved.

## Project Domain

EDIMAGE WORLD is an interactive fiction art website. The core domain terms are:

- **idea**: the user's initial seed thought
- **draw cards**: AI-generated concept, form, genre, style, and scale cards
- **interactive world**: the branching fiction session
- **rewind / review**: the limited two-step undo mechanic
- **knowledge base**: uploaded or curated creative text used as generation context
- **easter egg library**: keyword-triggered absurd narrative insertions
- **skin**: the visual atmosphere selected on the home screen
- **invite code**: access gate for limited public testing

## Use the glossary's vocabulary

When output names a domain concept, prefer the terms used in `CONTEXT.md` and this file. Don't drift to generic alternatives unless the user explicitly asks for a different product language.

If a concept is missing, note it for `grill-with-docs` rather than inventing permanent terminology in code or issue titles.

## Flag ADR conflicts

If output contradicts an existing ADR, surface it explicitly rather than silently overriding it.
