# Interview Prep

The authoring contract for everything in this directory: the 35 study volumes, the 34 condensed
cheatsheets, and the shell they share.

**These pages are hand-authored and are the source of truth.** There is no build step, no
converter, and nothing to regenerate — open `../index.html` from disk and it works.

## Layout

```
interview-prep/
  site.css        every colour token, the light/dark gate and the .page grid — then the
                  long-form volume styles, strictly additive, appended at the end
  toc.js          chapter scroll-spy
  search.js       filtering (reads the data-* filter markup)
  highlight.js    code block labelling + syntax highlighting
  check.js        contract checker for all three page shapes
  java/           10 volumes
  spring/        11 volumes
  database/      11 volumes
  microservices/  3 volumes
  cheatsheets/
    java/         9 cheatsheets
    spring/      11 cheatsheets
    database/    11 cheatsheets
    microservices/ 3 cheatsheets
```

Both content types share one shell: a skip link, a sidebar, a masthead, a filter toolbar, the
body, and a pager. Editing one page means editing that structure directly; there is no template to
change it in.

## Provenance

The volumes were originally authored as markdown and rendered into HTML by a zero-dependency Node
build (`build.js` plus a `lib/` of parser and renderer modules). The conversion was a one-time task.
The converter and the markdown sources have both been retired; the markdown remains in git history
at commit `fcec505` if you need to consult what a page was rendered from.

---

# Shared contract

These bind both content types.

## The asset layer is shared and read-only

`site.css`, `search.js`, `highlight.js` and `toc.js` serve every page, and no page carries its own
copy of any of them. Change a token or a filter behaviour there, not in a page.

Four things follow from sharing them:

- **`site.css` is ordered.** The token/grid layer comes first and supplies every colour token, the
  light/dark gate and the `.page` grid. The long-form volume styles are appended at the end and only
  *add* selectors and custom properties — they never edit an existing rule. Reversing the order
  would let the additions stop winning.
- **`search.js` and `highlight.js` are used unmodified by both content types.**
- **`highlight.js` selects `pre.snippet` and nothing else.** That is what keeps the residual
  `pre.diagram` blocks — the terminal transcripts and ASCII tables a volume keeps for text rather
  than drawing — from being tokenised; a volume diagram is emitted as `pre.diagram` with no
  `data-lang`, so the highlighter structurally cannot reach it. `check.js --volume` asserts this
  rather than relying on anyone re-reading `highlight.js`.
- **`toc.js` belongs to volumes only.** It drives the chapter scroll-spy, which cheatsheets have no
  use for.

## What `check.js` asserts

```
node interview-prep/check.js --volume     interview-prep/java/java-01-java-basics.html
node interview-prep/check.js --cheatsheet interview-prep/cheatsheets/java/01-java-basics.html
node interview-prep/check.js --index      index.html
```

The flag is required and selects the contract; there is deliberately no filename inference.

**On every page:** the required assets load at the right depth, the skip link and `<main id="main">`
are present, ids are unique, every `href="#…"` resolves to an emitted id, **every relative link
resolves to a real file on disk**, no unparsed `[text](url)` remains, no double-escaped entity
remains, tag balance holds, and the encoding is clean — no BOM, no CRLF, no tabs.

**`--volume` adds:** the `<h1>` is not repeated in the body, `pre.diagram` carries no `data-lang`
and is not empty, and the masthead's figure count matches the page.

**Both page shapes add:** the SVG figure contract — `role="img"`, a non-degenerate `viewBox`, an
`aria-label`, a drawing primitive, a `<figcaption>` opening with a `<strong>`, one `<marker>` per
figure with `orient="auto-start-reverse"`, every `url(#…)` resolving to a marker defined in that
figure or an earlier one, and no literal `fill="#…"`/`stroke="#…"` inside a figure.

**`--cheatsheet` adds:** script order (`search.js` before `highlight.js`), the `class=` shell
contract, filter-markup exactness, TOC↔section bidirectional match, table structure and
colspan/rowspan resolution, the callout prefix taxonomy, keyfacts-exactly-5, snippet attributes,
and the 2-4 figure density guide. Density is **not** checked on volumes: a volume's figure count
is however many drawings its source prose contained, not a composition choice.

**`--index` adds:** exactly 35 volumes and 34 cheatsheets with the right path prefixes, four
track groups, and every track id reachable from the sidebar.

The disk-resolution check is the one that matters most now. The pages are edited by hand, so
nothing else catches a link left pointing at a file that no longer exists. `--index` matters
especially: it is the only page linking all 69 content pages, so it is the check that would catch a
rename anywhere in the tree.

This checker deliberately verifies only what is checkable from a page alone. It has no source to
compare against, so it cannot catch content that was silently dropped — only structural breakage.
Read the page yourself for that.

**Warnings are advisory.** The composition and density rules below are guides, not contracts, so a
page that trips one is reported and still exits 0. There are ~559 such warnings across the 34
cheatsheets today; that is the baseline, not a regression.

## Editing rules

These were previously enforced by the build and are now on you:

- **LF line endings.** `.gitattributes` pins `interview-prep/**/*.{html,css}` and `index.html` to
  `-text` to stop a Windows checkout rewriting them to CRLF, which would churn every diff. The
  checker reads files as raw bytes and fails on any CR, so this is load-bearing.
- **No tabs, no trailing whitespace.** Both are enforced by the checker.
- **No emoji anywhere outside `pre` blocks.** A volume uses `✓ ⚠ ✅ ★` inside `pre.diagram`, where
  the glyph is the drawing, and inside a `<figure>` **not at all** — a converted figure carries the
  same meaning through `.node--good`/`--warn`/`--bad` and `.fill-warn`/`.fill-bad`. The checker
  masks every `<pre>` before scanning and does not mask figures, so a glyph inside an SVG is a hard
  failure pointing at the right line. That asymmetry is deliberate: it is what forces the drawing to
  be semantic rather than transliterated.
- **Keep the shell intact.** The filter box needs `data-filter-input`, `data-filter-empty` and at
  least one `data-filter-target`; the skip link needs `<main id="main">`; the volume scroll-spy
  needs the sidebar `.toc` anchors. `check.js` checks all of these.
- Slugs are deduplicated per page, so a repeated heading becomes `topic-2`, `topic-3` and so on.
  Renaming a heading changes its anchor, so check for inbound `#` links first.

## Style rules

Binding on both content types:

- Em-dashes for asides; `*italics*` for the concept being defined; `**bold**` for the
  load-bearing claim in a paragraph.
- `- ` for unordered lists, never `*`.
- Tables use `| --- |` separators with no alignment colons; identifiers are `code`-wrapped.
- UTF-8, LF line endings, 2-space indent.

Tone: the register the volumes already use. Senior and staff. A statement of what is true, then
the condition under which it stops being true. No hedging, no "it depends" without the dependency
named.

## Deduplication

The volumes already assign each hardest trap a single owning volume — B+ tree internals to
Database Volume 4, gap locks to Volume 8, cache stampede to Volume 9, deadlock prevention to Java
Volume 6. A cheatsheet must respect that ownership.

Where a concept is owned elsewhere, **link, do not restate**. A one-line pointer with a link is
worth more than a compressed half-version, because the half-version is where the inaccuracy creeps
in.

Cross-set references follow the same rule: state the target, never re-derive the content.

## Filtering

All three page shapes share `search.js`. Markup contract:

| Attribute | On | Effect |
| --- | --- | --- |
| `data-filter-input` | the `<input>` | drives the filter |
| `data-filter-target` | each filterable `<section>` or catalogue row | shown or hidden |
| `data-filter-group` | each track | hidden once all its targets are hidden |
| `data-filter-count` | the counter span | shows the match count, clears on click |
| `data-filter-empty` | the no-results `<p>` | shown when nothing matches |

Every target's text is read once at load and cached. Filtering matches all whitespace-separated
terms, so `deadlock lock` narrows rather than widens. `/` focuses the box; `Escape` clears it.

## Scope

These pages are **screen only**. There is no `@media print` block and no page-break handling.

If print support is ever added it belongs as an additive print block at the end of `site.css`.
Nothing about the page structure needs to change to accommodate it — which is the reason the layout
avoids print-hostile constructs in the first place.

---

# Volume page contract

Applies to `interview-prep/<track>/*.html` — 35 pages.

Every chapter, question, answer and diagram, in a browser-readable form. The volumes are written to
be *read*; the cheatsheets below are written to be *reached into*.

A volume page loads `site.css`, then `search.js`, `highlight.js` and `toc.js` at the end of
`<body>`.

## Notes

- A `pre.diagram` block is text, not a drawing — a terminal transcript, an ASCII table, a numbered
  prose list. Leave it untagged so the highlighter skips it. Drawings are `<figure class="figure">`
  SVG, not `pre.diagram`; see *Figures* below.

### Figures

Draw in inline SVG, not ASCII. A volume's drawings used to be `text` fences because markdown had
nowhere else to put a diagram; it does not need one, and an ASCII state machine costs a paragraph
to explain and reads worse than it looks.

The rules that keep them legible — identical on both page shapes:

- **Show the mechanism, not the name.** A box labelled "cache" says less than the path a request
  takes through it. Draw what the reader has to picture.
- **One figure, one claim.** The `<figcaption>` states what the picture shows; if it needs a
  paragraph, the figure is doing the wrong job.
- **`viewBox` sized to the content**, CSS scales it to `width: 100%`. Wide flows read
  left-to-right; layered stacks top-to-bottom. On a volume, author between **840 and 960 units
  wide** and under **900 tall**: the content column is 1054 px at the page's 1440 px max-width, so
  that band renders the 12px `.label` and 10.5px `.edge-label` between 11 and 14 px at every
  viewport from 900px up. A figure authored outside the band is legible at exactly one window
  width. (`java-04-collections-framework.html` predates this band at 1180 units and renders its
  labels at 8-9px — it is the shape to copy, not its width.)
- **Structure in `currentColor`-family classes** (`.node`, `.edge`, `.label`); these inherit the page
  foreground and so survive a theme switch for free. Reserve a literal hue for the element that
  carries the claim, via `.node--good` / `--warn` / `--bad` / `.edge--good` etc. A literal
  `fill="#…"` inside a figure is a checker failure, scoped to figure innards so that a code snippet
  quoting SVG or CSS is not mistaken for a drawing.
- **No glyphs.** `✓ ⚠ ✅ ❌ ★` become `.node--good`/`--warn`/`--bad` and `.fill-warn`/`.fill-bad`. A
  `<figure>` is not inside a `<pre>`, so the emoji check reads it and a glyph there fails the page.
- **Arrowheads are `<marker>`s**, one per figure, `orient="auto-start-reverse"` with
  `fill="context-stroke"` so the head matches its line. Give each figure's marker a distinct id —
  ids are document-global — using `arw-<track>-<NN>-<FF>-<v>`, e.g. `arw-database-04-07-a`, where
  `NN` is the volume number, `FF` the figure's index in document order and `v` the head variant
  (`a` unless a figure needs a second, differently-shaped head). Spell the track in full: the
  cheatsheets' older `arw-s4-a` style would collide silently under a copy, because `url(#…)` still
  resolves to *a* marker and duplicate-id detection is per-page.
- **No literal `>` in an `aria-label`.** The checker reads `<svg([^>]*)>`, so a `>` inside the
  attribute truncates what it inspects. Write `&gt;` or "to".
- **Label arrows with a word or three.** Anything longer belongs in the caption.
- **Every `<svg>` carries `role="img"` and an `aria-label`** stating the same claim as the caption,
  for readers who cannot see it.

**Density differs by page shape, and only the cheatsheet's is a rule.** A cheatsheet carries two
to four figures; a volume carries as many as its chapters have claims that need a picture, and the
practical cap is **one figure per `vol__h3` subsection that had at least one diagram block** —
convert the block the surrounding prose argues from and leave the rest as `pre.diagram`.
`database-04` holds 65 blocks and should land near 15 figures and 50 residual blocks, not 65
figures. A volume page of nothing but figures has not been deepened, only redrawn.
- The `.bridge` paragraph marks a chapter that continues in the next volume — a plain paragraph,
  deliberately not a heading, so it gets no id and no sidebar entry.
- Volumes cross-link to sibling volumes by bare filename within the volume tree. A link from
  `microservices/` into `spring/` is `../spring/<file>.html#<chapter>` and stays that way: the two
  trees moved together, so the relative hop is unchanged.

---

# Cheatsheet page contract

Applies to `interview-prep/cheatsheets/<track>/*.html` — 34 pages. There is one per volume
except Java Volume 10 (Testing & Build Tooling), which has a volume page and no cheatsheet,
so its wall row carries no cheatsheet link.

Each page is derived from the corresponding volume. The volumes are written to be *read*; these are
written to be *reached into* when someone asks you a question and you have about ninety seconds.

## What a cheatsheet is, and is not

It is **not** a summary. A summary preserves the shape of the source; a cheatsheet is built around
what a candidate has to *say*. The test for including anything is: could this plausibly be the
answer to a question a senior interviewer would ask?

It is **not** a transcript of the volume. Nothing is included for completeness. The target is
roughly 10–15 minutes of reading for a full volume.

Three things earn a place:

- **A decision with a failure mode.** "Use `ArrayBlockingQueue`" is useless. "Use
  `ArrayBlockingQueue` because `newFixedThreadPool`'s unbounded queue turns a slow consumer into
  unbounded memory growth instead of backpressure" is the page.
- **A trap.** The wrong answer a strong candidate catches and corrects.
- **A number.** Defaults, thresholds, and limits — the things you cannot derive under pressure.

Everything else is a link back to the volume.

## File naming

`{NN}-{kebab-case-slug}.html`, two-digit zero-padded, inside a folder named for the track.

| Volume | Cheatsheet |
| --- | --- |
| `../java/java-06-multithreading-concurrency.html` | `java/06-multithreading-concurrency.html` |
| `../spring/spring-04-transaction-management.html` | `spring/04-transaction-management.html` |

The `../` hop out of `cheatsheets/<track>/` replaces the old `guides/` prefix, and the volume number
is kept. The mapping is one-to-one and obvious, though note that three cheatsheets carry a slug of
their own rather than the volume's: `java/05-java-8-plus.html`,
`java/09-modern-java-production.html` and `database/10-nosql-distributed-stores.html`. Volume
numbers are fixed at authoring time and never renumbered.

## Page structure

Every page is this, in this order:

1. `<head>` — title, meta description, `<link rel="stylesheet" href="../../site.css">`
2. Skip link
3. `.sidebar` — chapter list, anchors matching the sections below
4. `.masthead` — series name, volume number and title, one-line hook, source link
5. `.toolbar` — search box plus prev/next paging
6. `.keyfacts` — "if you only remember five things"
7. One `<section data-filter-target>` per chapter, in the source volume's chapter order
8. `.pagefoot` — prev/next and the source link

Chapter order always mirrors the source volume. A reader who knows the volume must find things
where they expect them.

### Density

There are two page shapes, and conflating them is the most common error in this set.

A **narrative page** runs paragraphs, like `java/06-multithreading-concurrency.html` — 2,216 words
across eight sections. A **reference page** carries tables and callouts densely and narrates less:
the tables hold decision rules, the callouts hold traps. A reference page will read as much
"longer" than the exemplar while being better organised, and a stripped-tag word count cannot tell
the two apart, because it counts table cells and callout bodies as though they were prose.

**So measure the right thing:**

- **Narration** — text outside every table, figure, callout, and numbers cell. This is what
  compresses, and it is the only thing a word budget should govern. Roughly 400-500 words per full
  page is generous; the exemplar carries about 500 in total.
- **Callout load-bearing-ness** — every callout must carry a trap, a trade-off condition, a number,
  or a failure mode that no table on the same page states. Check each one; do not count them. A page
  running three callouts per section may be perfectly tight: on `07-jvm-internals-memory.html` all
  fourteen were audited and all fourteen passed, after one was deleted and then correctly reverted
  for carrying a mechanism no table stated. Density is not the signal, redundancy is.
- **Fact coverage** — is anything from the volume's hard material missing.

A word total is a useful smell test, never a target. Do not set a page-length goal and then decide
what to delete to hit it; that inverts the work and the page loses its best material first.

When something genuinely is too wordy, the cut order is: framing words ("it's worth noting that",
"in practice, many teams"), transitions, paragraphs restating a visible table row, then a whole
callout that is a pure duplicate of a table row. A deleted callout must be justified by naming the
row it duplicated — and if no callout is a pure duplicate, **delete none**. A page that is
well-organised and longer than the exemplar is not a page that needs cutting.

**Never** cut a fact, a number, a trap, a decision-with-a-failure-mode, or a figcaption. A
figcaption is the figure's only statement of its claim — shortening it to save words is backwards.
Never pad.

### The five-things box

Present on every page, without exception. Five bullets, five being a real ceiling — the point is
that this is what survives when everything else has been forgotten. Every bullet should be a
complete answer to a question you would actually be asked, not a topic name.

If a page's content does not compress to five, the page is not ready yet.

## Components

Each component carries over an existing callout convention from the markdown volumes. Nothing here
invents a new vocabulary.

| Class | Carries over | Renders as |
| --- | --- | --- |
| `.callout--trap` | `INTERVIEW TRAP` | the common answer a senior candidate should catch |
| `.callout--tradeoff` | `TRADE-OFF` | both sides, plus the condition that flips it |
| `.callout--scale` | `SCALING REALITY CHECK` | the specific number where it stops working |
| `.callout--must` | `MUST REMEMBER` | the one fact to carry forward |
| `.keyfacts` | `CHAPTER N SUMMARY` | the page's opening five |
| `.numbers` / `.number` | memorable figures | defaults, thresholds, limits |
| `table.table--decision` | "framed as a decision with a failure mode" | Concept / Rule / When it bites |
| `.figure` | drawings on both page shapes | inline SVG, mechanism not name |
| `pre.snippet` | language-tagged code fences | the two or three snippets worth typing from memory |

A `TRADE-OFF` callout without the condition that flips the answer is not a trade-off. If you cannot
name the condition, it is a rule, and it belongs in a table.

### Code snippets

Only code a candidate might genuinely be asked to write or read aloud. Not illustrative fragments,
not framework setup, not anything that would be faster to describe in a sentence. Wrap long lines —
the volume's own snippets run past 95 columns and read badly on screen.

```html
<pre class="snippet" data-lang="java" data-title="ThreadPoolExecutor" data-hl-line="5">
```

- `data-lang` adds the label bar and switches on highlighting. Always set it.
- `data-title` is the thing being shown, in three or four words.
- `data-hl-line` is a comma-separated 1-based list of lines to emphasise — normally the one line
  the paragraph beneath is actually talking about. Never more than two.

**Write the code HTML-escaped inside `<code>`** — `&lt;` for `<`, `&amp;` for `&`. `highlight.js`
reads `textContent`, tokenises, and writes back escaped HTML, so the round-trip is lossless and
`Ctrl+F` still matches the real characters. Never put markup inside a `<pre>`: the highlighter
replaces the contents wholesale and any tags you wrote there will be escaped into visible text.

Highlighting is Java-shaped: one language across the whole set, so there is no per-volume vocabulary
to maintain. Keep snippets to constructs it recognises — imports, generics, annotations, lambdas all
render correctly, but exotic syntax will simply render uncoloured rather than break.

### Figures

Cheatsheets draw in inline SVG under the same rules as the volumes — see *Figures* in the volume
page contract above, which is shared rather than repeated.

Cheatsheet-specific density: aim for roughly two to four figures on a full page, each replacing a
paragraph of prose. A page of nothing but diagrams has not been condensed, only redrawn.

## The catalogue wall

`../index.html` is the site's only index: all 35 volumes and all 34 cheatsheets in one wall,
grouped by track, each volume row linking both its volume and its cheatsheet. It is filterable via
the same `search.js` the content pages use — `data-filter-target` on each row, `data-filter-group`
on each track section.

It loads only `search.js`; it has no code blocks and no chapters to spy on.