# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repository is

A curated interview-prep study collection: 34 markdown "deep-dive volumes" (Java, Spring, Database,
Microservices), one condensed hand-authored cheatsheet per volume, and a zero-dependency Node build
that renders the volumes as a static site. There is **no `package.json`, no `node_modules`, and no
toolchain** — only `fs` and `path`, matching the philosophy of `cheatsheets/check.js`. Everything
runs with plain `node <script>`.

## Commands

Run from the repo root:

```
node guides/build.js                      # write all 34 pages + guides/index.html, and assert
node guides/build.js --check              # assert only; also fails if committed HTML is stale
node guides/census.js                     # block-count parity against the corpus census
node guides/check-guide.js <page.html>    # per-page contract check for a generated volume page
node guides/check-guide.js --index guides/index.html   # same, for the guides index (different contract)
```

`--check` is the one to run before committing any `.md` edit. It compares committed bytes against a
fresh build, so a stale page fails. A full build + check takes ~1.3s.

The site is servable with no tooling: open `index.html` from `file://`.

## Architecture

The 34 `.md` volumes are the **source of truth**. Everything under `guides/` except `guide.css`,
`toc.js`, and `lib/` is generated and committed, so the site is readable straight from a clone.

### Generated site (`guides/`)

```
build.js          entry: walk 4 tracks → parse → render → write → assert
census.js         parse-only parity check against measured corpus figures
check-guide.js    per-page contract checker for a *committed* page (no source in hand)
guide.css         additive long-form styles (strictly adds selectors; never edits cheatsheet.css)
toc.js            chapter scroll-spy (IntersectionObserver, sets aria-current)
lib/markdown.js   fence-aware, quote-aware block parser → block tree
lib/inline.js     inline span parser (code spans → escape → links → bold → italic)
lib/render.js     block renderers, callout map, Q&A item renderer
lib/page.js       page assembly: chapters, TOC, title consumption
lib/shell.js      document shell, masthead, toolbar, pager, footer
lib/index.js      guides/index.html generation
lib/check.js      build-time assertions (parity + word/code conservation)
java|spring|database|microservices/   generated pages, one per volume
```

Pipeline: `markdown.js` produces a block tree → `page.js` splits it into chapters and assigns
document-order slug ids (so sidebar and body always agree) → `render.js`/`inline.js` emit HTML →
`shell.js` wraps it → `check.js` asserts. `lib/` modules are required relatively; Node resolves that
without a `package.json`.

### The two designs that matter most

**1. Reuse, don't fork.** Volume pages load `cheatsheets/cheatsheet.css` first (it owns every colour
token, the light/dark gate, and the `.page` grid) then `guide.css`, which only adds selectors.
`search.js` and `highlight.js` are used unmodified. `guide.css` is strictly additive and never edits
an existing `cheatsheet.css` rule.

**2. Conservation, not parity, catches corruption.** `lib/check.js` runs on every build. Parity
compares two *counts* and would pass a renderer that dropped a chapter. The load-bearing assertions
compare *text*:
- **Word conservation** — the source volume's word stream must equal the page's text content, exactly.
- **Code conservation** — every `<pre><code>` must equal its source fence character-for-character
  after entity decoding (this is also the ASCII-diagram guard).
- Plus: relative links resolve on disk (depth derived from the page's own path), balanced tags,
  unique ids, `href="#…"` resolves, no BOM/CRLF/tabs/trailing whitespace, no literal `[text](url)`.

Corollary you must preserve: `highlight.js` selects `pre.snippet` only. A `text` fence must be
emitted as `pre.diagram` with **no** `data-lang`, so the highlighter structurally cannot tokenise
the 711 ASCII diagrams. `check.js` asserts this rather than trusting that someone re-reads
`highlight.js`. When adding a code-block case, keep that guarantee.

When you add an assertion, negative-test it — confirm it actually fails on a deliberately broken
input. An assertion that cannot fail is decoration. Two were written only after the first build
passed everything else.

## Contracts for contributors

Three authoring contracts govern content. Read the relevant one before editing prose:

- **`database/README.md`** — the canonical format contract for the markdown volumes: front matter,
  section order, heading hierarchy, callout labels, question prefixes, style rules (no emoji, LF,
  `- ` lists, `| --- |` tables, hard-wrap ~95 cols). The Spring/Microservices/Java sets inherit it.
- **`cheatsheets/README.md`** — the cheatsheet contract: hand-authored (never generated), one per
  volume, the two page shapes (narrative vs reference) and their very different measures, the
  five-things box, the callout component vocabulary, the `data-*` filter markup `search.js` reads.
- **`guides/README.md`** — the generated site's build contract, what the build asserts, and the
  measured corpus facts the parser is built against.

Key invariants across all three:
- **The `.md` volumes, `cheatsheets/cheatsheet.css`, `search.js`, `highlight.js`, and
  `cheatsheets/check.js` are read-only.** The build reads them and writes only under `guides/`.
  To change a volume, edit the markdown and rebuild — never the generated HTML.
- Cheatsheets are hand-authored from their source volume and must **link, not restate**, any concept
  another volume owns.
- `_italic_` is disabled in the rendered volumes on purpose (`snake_case` is everywhere); a heading
  wrapped across two same-level lines with only blanks between is joined; `Continued in Chapter N…`
  renders as a `.bridge` paragraph; a `text` fence is a diagram.

## Conventions

- UTF-8, **LF line endings** (enforced by `.gitattributes` with `-text`, and by the build's hygiene
  assertions). A CRLF working tree makes `--check` report every page stale.
- No emoji anywhere in generated markup or authored content.
- Zero dependencies in any script; `fs` and `path` only.
- Generated HTML is committed. If you edit a `.md`, rebuild and commit the regenerated pages with it.

## Things that will mislead you

- **There is no test suite.** The assertions in `lib/check.js` (run by `build.js`) and
  `check-guide.js` are the tests. `census.js` is a separate parse-only parity check.
- **`--check` compares committed bytes**, so it fails both on a genuinely stale page *and* on a
  working tree whose line endings were rewritten (the `.gitattributes` `-text` rules exist to
  prevent the latter). If `--check` fails on all 35 pages at once, suspect line endings before
  suspecting the parser.
- The generated site and the cheatsheets are **two separate deliverables** with different
  contracts and different checkers (`check-guide.js` vs `cheatsheets/check.js`). Do not run one
  against the other.