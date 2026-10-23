# Issue tracker: Local Markdown

Issues and specs for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01`, never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file
- Comments append to the bottom of the file under a `## Comments` heading

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path.

## Wayfinding operations

- **Map**: `.scratch/<effort>/map.md` (Notes / Decisions-so-far / Fog).
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md` with `Type:` (`research`/`prototype`/`grilling`/`task`) and `Status:` (`claimed`/`resolved`) lines.
- **Blocking**: a `Blocked by: NN, NN` line near the top.
- **Frontier**: open, unblocked, unclaimed files; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append under `## Answer`, set `Status: resolved`, then append a context pointer to `map.md`.
