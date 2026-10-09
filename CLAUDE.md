# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A curated interview-prep study collection: 35 "deep-dive volumes" (Java, Spring, Database,
Microservices) and one condensed hand-authored cheatsheet per volume, served as a **plain static
site**. There is **no `package.json`, no `node_modules`, no build step, and no toolchain.** The HTML
is hand-authored and committed; it is edited directly, like any other document.

The volumes were originally markdown, rendered into HTML by a zero-dependency Node build. That
conversion was a one-time task and has been retired, along with the converter (`build.js`, `census.js`,
`lib/`) and the markdown sources. The markdown remains in git history at commit `fcec505`.

## Commands

Run from the repo root. These verify a page; none of them generate anything.

```
node interview-prep/check.js --volume     interview-prep/java/java-01-java-basics.html
node interview-prep/check.js --cheatsheet interview-prep/cheatsheets/java/01-java-basics.html
node interview-prep/check.js --index      index.html
```

The flag is **required** and selects the contract: the three page shapes have different asset
depths, different shells and different invariants. There is deliberately no filename inference —
guessing which contract you meant is the easiest way for a check to silently stop applying to the
pages it protects.

All three modes resolve every relative link against the filesystem, so a page still pointing at a
deleted file fails rather than shipping a dead link. Run the relevant one after editing a page.

The site is servable with no tooling: open `index.html` from `file://`.

## Architecture

There is no pipeline. One tree, hand-authored, with one shared asset layer and one validator.

```
index.html          the only index: a filterable catalogue wall linking all 69 content pages
java/pdfs/          printable PDF editions
fonts/              self-hosted webfonts, loaded by site.css via url("../fonts/…")
interview-prep/
  site.css          every colour token, the light/dark gate, the .page grid — then the
                    long-form volume styles, strictly additive, appended at the end
  toc.js            chapter scroll-spy (IntersectionObserver, sets aria-current)
  search.js         filtering (reads the data-* filter markup)
  highlight.js      code block labelling + syntax highlighting
  check.js          contract checker for all three page shapes
  README.md         the authoring contract for both content types
  <track>/*.html        the 35 volume pages
  cheatsheets/<track>/*.html    the 34 cheatsheets
```

Five JavaScript files remain. Three run in the browser (`search.js`, `highlight.js`, `toc.js`); one
validates (`check.js`). Nothing converts and nothing overwrites.

### The design that matters most

**One asset layer, shared unmodified.** All 69 pages load `site.css`; volumes add `toc.js`, and every
page shares `search.js` and `highlight.js`. Those four files are shared and read-only — change a token
or a filter behaviour in one and expect every page on the site to move.

**Section order inside `site.css` is load-bearing.** The token/grid layer comes first and the
long-form volume styles are appended after it, because the second half only *adds* selectors and
custom properties; reversing the order would let the additions stop winning.

**Corollary you must preserve:** `highlight.js` selects `pre.snippet` only. The residual
`pre.diagram` blocks — terminal transcripts, ASCII tables and numbered prose lists, roughly forty
across the volumes — carry **no** `data-lang`, so the highlighter structurally cannot tokenise
them; and the drawings that used to be ASCII are now `<figure class="figure">` SVG that it cannot
select either. `check.js --volume` asserts the `pre.diagram` half and `check.js` asserts the SVG
half on every page. When adding a code-block case, keep both guarantees.

## Contracts for contributors

One authoring contract governs content: **`interview-prep/README.md`**. Read it before editing prose.
It covers the shared page shell, the volume and cheatsheet contracts beneath it, what `check.js`
asserts, the editing rules (LF, no tabs, no trailing whitespace, no emoji) that used to be enforced
by the build, and the anchors you must not break.

Key invariants:
- **`interview-prep/site.css`, `search.js`, `highlight.js`, and `toc.js` are shared and read-only.**
  Every page depends on them.
- Cheatsheets are hand-authored from their volume and must **link, not restate**, any concept
  another volume owns.
- A `pre.diagram` block is text, not a drawing — a terminal transcript, an ASCII table, a numbered
  prose list. Leave it untagged. Drawings are `<figure class="figure">` inline SVG, never
  `pre.diagram`.
- `.bridge` marks a chapter continuing in the next volume — a plain paragraph, deliberately not a
  heading, so it has no id and no sidebar entry.

## Conventions

- UTF-8, **LF line endings**. `.gitattributes` pins `interview-prep/**/*.{html,css}` **and
  `index.html`** to `-text` so a Windows checkout cannot rewrite them to CRLF and churn every diff.
  The checker reads files as raw bytes and fails on any CR, so this is load-bearing, not cosmetic.
- No emoji anywhere outside `pre` blocks, which the checker asserts with the code masked out. Note
  the asymmetry: a `<pre>` is masked, a `<figure>` is not, so `✓ ⚠ ✅ ❌ ★` inside a converted figure
  is a hard failure. That is deliberate — it forces a drawing to carry meaning in
  `.node--good`/`--warn`/`--bad` rather than in a glyph.
- Zero dependencies in any script; `fs` and `path` only.
- HTML is committed as-is. Edit the file; there is nothing to rebuild.

## Things that will mislead you

- **There is no build.** If you are looking for a generator, a task runner, or a way to
  "regenerate" the volumes, there isn't one — `interview-prep/**/*.html` is the source. Editing it
  directly is correct, not a shortcut.
- **A figure is not a `<pre>`.** The emoji mask, the highlighter's `pre.snippet` selector and the
  `pre.diagram` no-`data-lang` guarantee all stop at `</pre>`. An SVG figure sits outside all three,
  which is why the emoji rule applies to figure text and why the figure contract in `check.js` is a
  separate block from the diagram guarantee.
- **The checker verifies structure, not content.** It has no source to compare a page against, so it
  catches broken links, duplicate ids, missing assets and encoding damage — but it cannot tell you
  that a chapter was dropped or a paragraph mangled. Read the diff.
- **Warnings are advisory, not failures.** The authoring contract treats density and composition as
  guides, so a page that trips one is reported and still exits 0. There are ~572 such warnings across
  the 34 cheatsheets today; that is the baseline, not a regression.
- **`README.md` at the root is unchecked.** `check.js --index` covers `index.html`, but there is no
  mode for the root README, so its links are unverified.