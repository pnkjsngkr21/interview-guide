# Deep-Dive Guides

The 34 study volumes as a static site. Every chapter, question, answer and diagram, in a
browser-readable form.

**These pages are hand-authored and are the source of truth.** There is no build step, no
converter, and nothing to regenerate — open `index.html` from disk and it works.

## Layout

```
guides/
  index.html       the track and volume index, filterable
  guide.css        additive long-form styles (cheatsheet.css is the token source)
  toc.js           chapter scroll-spy
  check-guide.js   per-page contract checker
  java/            9 pages
  spring/          11 pages
  database/        11 pages
  microservices/   3 pages
```

Every page shares one shell: `cheatsheet.css` first, then `guide.css`, then a sidebar, a
masthead, a filter toolbar, the body, and a pager. Editing one page means editing that
structure directly; there is no template to change it in.

## Provenance

The volumes were originally authored as markdown and rendered into this directory by a
zero-dependency Node build (`build.js` plus a `lib/` of parser and renderer modules). The
conversion was a one-time task. The converter and the markdown sources have both been
retired; the markdown remains in git history at commit `fcec505` if you need to consult what
a page was rendered from.

## The contract

`cheatsheets/cheatsheet.css`, `cheatsheets/search.js` and `cheatsheets/highlight.js` are
**shared and read-only** — the same files serve both deliverables, and `cheatsheets/check.js`
depends on their behaviour. Change a token or a filter behaviour there, not here.

Three things follow from reusing the cheatsheet assets unchanged:

- `cheatsheet.css` is loaded first and supplies every colour token, the light/dark gate and
  the `.page` grid. `guide.css` only adds selectors; it never edits an existing rule.
- `search.js` and `highlight.js` are used unmodified.
- `highlight.js` selects `pre.snippet` and nothing else. That is what keeps the 711 ASCII
  diagrams from being tokenised — a diagram is emitted as `pre.diagram` with no `data-lang`,
  so the highlighter structurally cannot reach it. `check-guide.js` asserts this rather than
  relying on anyone re-reading `highlight.js`.

## What `check-guide.js` asserts

```
node guides/check-guide.js guides/index.html --index        # the index
node guides/check-guide.js guides/java/java-01-java-basics.html   # a volume page
```

Per page: the required assets load, the `<h1>` is not repeated in the body, ids are unique,
every `href="#…"` resolves to an emitted id, **every relative link resolves to a real file on
disk**, `pre.diagram` carries no `data-lang`, and the encoding is clean — no BOM, no CRLF, no
tabs, and no unparsed `[text](url)` left in the markup.

The disk-resolution check is the one that matters most now. The pages are edited by hand, so
nothing else catches a link left pointing at a file that no longer exists.

This checker deliberately verifies only what is checkable from a page alone. It has no source
to compare against, so it cannot catch content that was silently dropped — only structural
breakage. Read the page yourself for that.

## Editing rules

These were previously enforced by the build and are now on you:

- **LF line endings.** `.gitattributes` pins `guides/**/*.html` to `-text` to stop a Windows
  checkout rewriting them to CRLF, which would churn every diff.
- **No tabs, no trailing whitespace, no emoji.** The checker enforces the first two; the third
  is a convention across the repo.
- **Keep the shell intact.** The filter box needs `data-filter-input`, `data-filter-empty` and
  at least one `data-filter-target`; the skip link needs `<main id="main">`; the scroll-spy
  needs the sidebar `.toc` anchors. `check-guide.js` checks all of these.

## Notes

- A `pre.diagram` block is an ASCII diagram, not code. Leave it untagged so the highlighter
  skips it.
- The `.bridge` paragraph marks a chapter that continues in the next volume — a plain
  paragraph, deliberately not a heading, so it gets no id and no sidebar entry.
- Slugs are deduplicated per page, so a repeated heading becomes `topic-2`, `topic-3` and so
  on. Renaming a heading changes its anchor, so check for inbound `#` links first.