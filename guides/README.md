# Deep-Dive Guides

The 34 study volumes rendered as a static site. Every chapter, question, answer and diagram
from the markdown sources, in a browser-readable form.

**The markdown volumes remain the source of truth.** Everything in this directory except
`guide.css`, `toc.js` and `lib/` is generated from them, and no build step is needed to read
the result — open `index.html` from disk and it works.

## Layout

```
guides/
  index.html       generated — track and volume index, filterable
  guide.css        additive long-form styles (cheatsheet.css is the token source)
  toc.js           chapter scroll-spy
  build.js         the converter
  lib/             markdown parser, inline parser, renderers, assertions
  java/            9 generated pages
  spring/          11 generated pages
  database/        11 generated pages
  microservices/   3 generated pages
```

## Rebuilding

```
node guides/build.js          write all 34 pages and the index
node guides/build.js --check  assert against the committed HTML without writing
```

Requires Node and nothing else. There is no `package.json`, no `node_modules` and no
toolchain — the build uses only `fs` and `path`, matching `cheatsheets/check.js`.

`--check` also fails if `index.html` on disk differs from what the current sources would
generate, so it doubles as a staleness check in CI.

## The contract

The `.md` volumes, `cheatsheets/cheatsheet.css`, `cheatsheets/search.js` and
`cheatsheets/highlight.js` are **read-only**. The build reads them and writes only under
`guides/`. If you need to change a volume, edit the markdown and rebuild — never the HTML.

Three things follow from reusing the cheatsheet assets unchanged:

- `cheatsheet.css` is loaded first and supplies every colour token, the light/dark gate and
  the `.page` grid. `guide.css` only adds selectors; it never edits an existing rule.
- `search.js` and `highlight.js` are used unmodified.
- `highlight.js` selects `pre.snippet` and nothing else. That is what keeps the 711 ASCII
  diagrams from being tokenised — a `text` fence is emitted as `pre.diagram` with no
  `data-lang`, so the highlighter structurally cannot reach it. `lib/check.js` asserts this
  rather than relying on anyone re-reading `highlight.js`.

## What the build asserts

Every build, and every `--check`, runs these against each page. They exist to catch silent
corruption rather than visible miscounting:

- **Word conservation** — the source volume's word stream must equal the page's text
  content, exactly. Parity compares two counts and would happily pass a renderer that
  dropped a chapter; comparing the text cannot be satisfied by losing material.
- **Code conservation** — every `<pre><code>` must equal its source fence body
  character-for-character after entity decoding.
- **Relative links resolve on disk** — depth is derived from the page's own path, since the
  index sits one directory down and the volumes sit two.
- Balanced tags, unique ids, every `href="#…"` resolving to an emitted id, no BOM, no CRLF,
  no tabs or trailing whitespace in generated markup, and no literal `[text](url)` surviving.

Two of these were written after the first build passed everything else, because passing is
only meaningful if failing is possible. Both were negative-tested: deleting a chapter, and
perturbing one code block, each fail loudly.

## Corpus facts the parser is built against

Measured across all 34 volumes. They are acceptance criteria, not estimates:

| | |
|---|---|
| Chapters / `N.M` subsections | 349 / 1,287 (up to 57 in one volume) |
| Bold-led Q&A items | 6,158, of which 1,549 (25%) hard-wrap past line 1 |
| Code fences | 1,887, of which 711 are `text` diagrams |
| Blockquote regions | 4,633 — 988 labelled, 3,645 plain |
| Inline links | 853, all inside list items |
| Heading slug collisions | present in all 34 files — dedup is mandatory |
| Same-level heading joins | 31 → 23 headings + 8 bridge notes |
| `snake_case` in prose | 4,131 lines — `_`-emphasis is disabled because of it |

The three corrections to the original plan's figures were all in the same direction: the
plan's scanner counted masked *lines* with a broken separator test and reported 452 tables,
1,878 fences and 707 diagrams against measured truth of 454, 1,887 and 711.

## Notes for contributors

- A heading that wraps across two `##` lines with only a blank between them is joined.
  `Continued in Chapter N…` is rendered as a `.bridge` paragraph rather than a heading.
- `_italic_` does not work, by design — `snake_case` identifiers are everywhere and there is
  no `_emphasis_` usage in the corpus.
- A `text` fence is a diagram. Do not tag one with a language; it would be highlighted.
- Q&A openers render in place, interleaved with the prose that sets them up, rather than
  being hoisted into a bank at the end of the chapter.