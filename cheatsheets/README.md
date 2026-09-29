# Cheatsheets

Condensed, one page per volume, for use under interview pressure.

Each page is derived from the corresponding volume in the deep-dive guides. The volumes are
written to be *read*; these are written to be *reached into* when someone asks you a question
and you have about ninety seconds.

This is the authoring contract for that material. It follows the same spirit as
[`database/README.md`](../database/README.md), which is the contract for the markdown volumes
themselves — the style rules here are inherited from it rather than restated as new ones.

---

## What a cheatsheet is, and is not

It is **not** a summary. A summary preserves the shape of the source; a cheatsheet is built
around what a candidate has to *say*. The test for including anything is: could this plausibly
be the answer to a question a senior interviewer would ask?

It is **not** a transcript of the volume. Nothing is included for completeness. The target is
roughly 10–15 minutes of reading for a full volume.

Three things earn a place:

- **A decision with a failure mode.** "Use `ArrayBlockingQueue`" is useless. "Use
  `ArrayBlockingQueue` because `newFixedThreadPool`'s unbounded queue turns a slow consumer
  into unbounded memory growth instead of backpressure" is the page.
- **A trap.** The wrong answer a strong candidate catches and corrects.
- **A number.** Defaults, thresholds, and limits — the things you cannot derive under pressure.

Everything else is a link back to the volume.

---

## File Naming

`{NN}-{kebab-case-slug}.html`, two-digit zero-padded, inside a folder named for the track.

| Source | Cheatsheet |
| --- | --- |
| `java/java-deep-dive-volume-06-multithreading-concurrency.md` | `java/06-multithreading-concurrency.html` |
| `spring/spring-deep-dive-volume-04-transaction-management.md` | `spring/04-transaction-management.html` |

The `deep-dive-volume-` infix is dropped; everything else is preserved so the mapping stays
one-to-one and obvious. Volume numbers are fixed at authoring time and never renumbered.

---

## Page Structure

Every page is this, in this order:

1. `<head>` — title, meta description, `<link rel="stylesheet" href="../cheatsheet.css">`
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

A **narrative page** runs paragraphs, like `java/06-multithreading-concurrency.html` — 2,216
words across eight sections. A **reference page** carries
tables and callouts densely and narrates less: the tables hold decision rules, the callouts
hold traps. A reference page will read as much "longer" than the exemplar while being better
organised, and a stripped-tag word count cannot tell the two apart, because it counts table
cells and callout bodies as though they were prose.

**So measure the right thing:**

- **Narration** — text outside every table, figure, callout, and numbers cell. This is what
  compresses, and it is the only thing a word budget should govern. Roughly 400-500 words per
  full page is generous; the exemplar carries about 500 in total.
- **Callout load-bearing-ness** — every callout must carry a trap, a trade-off condition, a
  number, or a failure mode that no table on the same page states. Check each one; do not
  count them. A page running three callouts per section may be perfectly tight: on
  `07-jvm-internals-memory.html` all fourteen were audited and all fourteen passed, after one
  was deleted and then correctly reverted for carrying a mechanism no table stated. Density
  is not the signal, redundancy is.
- **Fact coverage** — is anything from the volume's hard material missing.

A word total is a useful smell test, never a target. Do not set a page-length goal and then
decide what to delete to hit it; that inverts the work and the page loses its best material
first.

When something genuinely is too wordy, the cut order is: framing words ("it's worth noting
that", "in practice, many teams"), transitions, paragraphs restating a visible table row, then
a whole callout that is a pure duplicate of a table row. A deleted callout must be justified by
naming the row it duplicated — and if no callout is a pure duplicate, **delete none**. A page
that is well-organised and longer than the exemplar is not a page that needs cutting.

**Never** cut a fact, a number, a trap, a decision-with-a-failure-mode, or a figcaption. A
figcaption is the figure's only statement of its claim — shortening it to save words is
backwards. Never pad.

### The five-things box

Present on every page, without exception. Five bullets, five being a real ceiling — the point
is that this is what survives when everything else has been forgotten. Every bullet should be
a complete answer to a question you would actually be asked, not a topic name.

If a page's content does not compress to five, the page is not ready yet.

---

## Components

Each component carries over an existing callout convention from the markdown volumes. Nothing
here invents a new vocabulary.

| Class | Carries over | Renders as |
| --- | --- | --- |
| `.callout--trap` | `INTERVIEW TRAP` | the common answer a senior candidate should catch |
| `.callout--tradeoff` | `TRADE-OFF` | both sides, plus the condition that flips it |
| `.callout--scale` | `SCALING REALITY CHECK` | the specific number where it stops working |
| `.callout--must` | `MUST REMEMBER` | the one fact to carry forward |
| `.keyfacts` | `CHAPTER N SUMMARY` | the page's opening five |
| `.numbers` / `.number` | memorable figures | defaults, thresholds, limits |
| `table.table--decision` | "framed as a decision with a failure mode" | Concept / Rule / When it bites |
| `.figure` | ASCII diagrams in the volumes | inline SVG, mechanism not name |
| `pre.snippet` | language-tagged code fences | the two or three snippets worth typing from memory |

A `TRADE-OFF` callout without the condition that flips the answer is not a trade-off. If you
cannot name the condition, it is a rule, and it belongs in a table.

### Code snippets

Only code a candidate might genuinely be asked to write or read aloud. Not illustrative
fragments, not framework setup, not anything that would be faster to describe in a sentence.
Wrap long lines — the volume's own snippets run past 95 columns and read badly on screen.

```html
<pre class="snippet" data-lang="java" data-title="ThreadPoolExecutor" data-hl-line="5">
```

- `data-lang` adds the label bar and switches on highlighting. Always set it.
- `data-title` is the thing being shown, in three or four words.
- `data-hl-line` is a comma-separated 1-based list of lines to emphasise — normally the one
  line the paragraph beneath is actually talking about. Never more than two.

**Write the code HTML-escaped inside `<code>`** exactly as you would in the markdown volumes —
`&lt;` for `<`, `&amp;` for `&`. `highlight.js` reads `textContent`, tokenises, and writes back
escaped HTML, so the round-trip is lossless and `Ctrl+F` still matches the real characters.
Never put markup inside a `<pre>`: the highlighter replaces the contents wholesale and any tags
you wrote there will be escaped into visible text.

Highlighting is Java-shaped: one language across the whole set, so there is no per-volume
vocabulary to maintain. Keep snippets to constructs it recognises — imports, generics,
annotations, lambdas all render correctly, but exotic syntax will simply render uncoloured
rather than break.

### Figures

Draw in inline SVG, not ASCII. The volumes use `text` fences because markdown has nowhere else
to put a diagram; the cheatsheets do, and an ASCII state machine costs a paragraph to explain
and reads worse than it looks.

The rules that keep them legible:

- **Show the mechanism, not the name.** A box labelled "cache" says less than the path a request
  takes through it. Draw what the reader has to picture.
- **One figure, one claim.** The `<figcaption>` states what the picture shows; if it needs a
  paragraph, the figure is doing the wrong job.
- **`viewBox` sized to the content**, CSS scales it to `width: 100%`. Wide flows read
  left-to-right; layered stacks top-to-bottom.
- **Structure in `currentColor`-family classes** (`.node`, `.edge`, `.label`); these inherit the
  page foreground and so survive a theme switch for free. Reserve a literal hue for the element
  that carries the claim, via `.node--good` / `--warn` / `--bad` / `.edge--good` etc.
- **Arrowheads are `<marker>`s**, one per figure, `orient="auto-start-reverse"` with
  `fill="context-stroke"` so the head matches its line. Give each figure's marker a distinct
  id — ids are document-global.
- **Label arrows with a word or three.** Anything longer belongs in the caption.
- **Every `<svg>` carries `role="img"` and an `aria-label`** stating the same claim as the
  caption, for readers who cannot see it.

Aim for roughly two to four figures on a full page, each replacing a paragraph of prose. A page
of nothing but diagrams has not been condensed, only redrawn.

---

## Filtering

Both `index.html` and the volume pages share `search.js`. Markup contract:

| Attribute | On | Effect |
| --- | --- | --- |
| `data-filter-input` | the `<input>` | drives the filter |
| `data-filter-target` | each filterable `<section>` or `.vol` | shown or hidden |
| `data-filter-group` | each `.track` | hidden once all its targets are hidden |
| `data-filter-count` | the counter span | shows the match count, clears on click |
| `data-filter-empty` | the no-results `<p>` | shown when nothing matches |

Every target's text is read once at load and cached. Filtering matches all whitespace-separated
terms, so `deadlock lock` narrows rather than widens. `/` focuses the box; `Escape` clears it.

## Shared Assets

Three files serve all 34 pages, and no page carries its own copy of any of them.

| File | Serves | Notes |
| --- | --- | --- |
| `cheatsheet.css` | every page | Tokens, layout, components, light + dark |
| `search.js` | every page | Drives the filter markup above |
| `highlight.js` | volume pages | Adds the `data-lang` label bar and tokenises `<pre>` |

A volume page loads both scripts at the end of `<body>`, in that order. `index.html` loads only
`search.js` — it has no code blocks.

---

## Style Rules

Inherited from `database/README.md` and binding here:

- **No emoji anywhere.**
- Em-dashes for asides; `*italics*` for the concept being defined; `**bold**` for the
  load-bearing claim in a paragraph.
- `- ` for unordered lists, never `*`.
- Tables use `| --- |` separators with no alignment colons; identifiers are `code`-wrapped.
- UTF-8, LF line endings, 2-space indent.

Tone: the register the volumes already use. Senior and staff. A statement of what is true,
then the condition under which it stops being true. No hedging, no "it depends" without the
dependency named.

---

## Deduplication

The volumes already assign each hardest trap a single owning volume — B+ tree internals to
Database Volume 4, gap locks to Volume 8, cache stampede to Volume 9, deadlock prevention to
Java Volume 6. A cheatsheet must respect that ownership.

Where a concept is owned elsewhere, **link, do not restate**. A one-line pointer with a link
is worth more than a compressed half-version, because the half-version is where the
inaccuracy creeps in.

Cross-set references follow the same rule: state the target, never re-derive the content.

---

## Index Page

`index.html` lists all 34 pages grouped by track, each with its volume number, title, and a
one-line hook stating what you'd be asked about that volume. The hook is the hard part — it is
the difference between "Volume 4" and "B+ trees, page splits, leftmost prefix, and reading
EXPLAIN".

---

## Scope

These pages are **screen only**. There is no `@media print` block and no page-break handling.

If print support is ever added it belongs as an additive print block at the end of
`cheatsheet.css`. Nothing about the page structure needs to change to accommodate it — which
is the reason the layout avoids print-hostile constructs in the first place.
