# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A curated interview-prep study collection: 34 "deep-dive volumes" (Java, Spring, Database,
Microservices) and one condensed hand-authored cheatsheet per volume, served as a **plain static
site**. There is **no `package.json`, no `node_modules`, no build step, and no toolchain.** The HTML
is hand-authored and committed; it is edited directly, like any other document.

The volumes were originally markdown, rendered into `guides/` by a zero-dependency Node build. That
conversion was a one-time task and has been retired, along with the converter (`build.js`, `census.js`,
`lib/`) and the markdown sources. The markdown remains in git history at commit `fcec505`.

## Commands

Run from the repo root. These verify a page; none of them generate anything.

```
node guides/check-guide.js --index guides/index.html            # the guides index
node guides/check-guide.js guides/java/java-01-java-basics.html # a volume page
node cheatsheets/check.js cheatsheets/java/01-java-basics.html  # a cheatsheet
```

Both checkers resolve every relative link against the filesystem, so a page still pointing at a
deleted file fails rather than shipping a dead link. Run the relevant one after editing a page.

The site is servable with no tooling: open `index.html` from `file://`.

## Architecture

There is no pipeline. Two deliverables, both hand-authored, sharing three assets.

```
index.html          landing page
java/pdfs/          printable PDF editions
guides/
  index.html        track and volume index, filterable
  guide.css         additive long-form styles (strictly adds selectors; never edits cheatsheet.css)
  toc.js            chapter scroll-spy (IntersectionObserver, sets aria-current)
  check-guide.js    per-page contract checker
  <track>/*.html    the 34 volume pages
cheatsheets/
  index.html        all 34 cheatsheets, grouped by track
  cheatsheet.css    shared tokens, light/dark gate, .page grid
  search.js         filtering (reads the data-* filter markup)
  highlight.js      code block labelling + syntax highlighting
  check.js          cheatsheet contract checker
  <track>/*.html    the 34 cheatsheets
```

Five JavaScript files remain. Three run in the browser (`search.js`, `highlight.js`, `toc.js`); two
are validators (`check-guide.js`, `check.js`). Nothing converts and nothing overwrites.

### The design that matters most

**Reuse, don't fork.** Both deliverables load `cheatsheets/cheatsheet.css` first — it owns every
colour token, the light/dark gate, and the `.page` grid — then `guide.css`, which only adds
selectors. `search.js` and `highlight.js` are used unmodified by both.

**Corollary you must preserve:** `highlight.js` selects `pre.snippet` only. ASCII diagrams are
`pre.diagram` with **no** `data-lang`, so the highlighter structurally cannot tokenise the 711
diagrams. `check-guide.js` asserts this rather than trusting that someone re-reads `highlight.js`.
When adding a code-block case, keep that guarantee.

## Contracts for contributors

Two authoring contracts govern content. Read the relevant one before editing prose:

- **`guides/README.md`** — the volume-page contract: the shared page shell, what `check-guide.js`
  asserts, the editing rules (LF, no tabs, no trailing whitespace, no emoji) that used to be
  enforced by the build, and the anchors you must not break.
- **`cheatsheets/README.md`** — the cheatsheet contract: hand-authored, one per volume, the two page
  shapes (narrative vs reference) and their very different measures, the five-things box, the
  callout component vocabulary, the `data-*` filter markup `search.js` reads.

Key invariants across both:
- **`cheatsheets/cheatsheet.css`, `cheatsheets/search.js`, `cheatsheets/highlight.js`, and
  `cheatsheets/check.js` are shared and read-only.** Both deliverables depend on them. Change a
  token or a filter behaviour there, and expect every page to move.
- Cheatsheets are hand-authored from their volume and must **link, not restate**, any concept
  another volume owns.
- A `pre.diagram` block is an ASCII diagram, not code. Leave it untagged.
- `.bridge` marks a chapter continuing in the next volume — a plain paragraph, deliberately not a
  heading, so it has no id and no sidebar entry.

## Conventions

- UTF-8, **LF line endings**. `.gitattributes` pins `guides/**/*.html` to `-text` so a Windows
  checkout cannot rewrite them to CRLF and churn every diff.
- No emoji anywhere.
- Zero dependencies in any script; `fs` and `path` only.
- HTML is committed as-is. Edit the file; there is nothing to rebuild.

## Things that will mislead you

- **There is no build.** If you are looking for a generator, a task runner, or a way to
  "regenerate" the volumes, there isn't one — `guides/*.html` is the source. Editing it directly is
  correct, not a shortcut.
- **The checkers verify structure, not content.** `check-guide.js` has no source to compare a page
  against, so it catches broken links, duplicate ids, missing assets and encoding damage — but it
  cannot tell you that a chapter was dropped or a paragraph mangled. Read the diff.
- **Nothing checks the root `index.html` or `README.md`.** `check-guide.js` assumes the
  `guides/` shell and will false-fail on it. Links in those two files are unverified.
- The guides site and the cheatsheets are **two separate deliverables** with different contracts and
  different checkers. Do not run one against the other. `cheatsheets/check.js` has no `--index`
  mode, so it reports false failures on `cheatsheets/index.html`; that is known, not something you
  broke.