/* Contract checker for the three page shapes this site serves.
   Merged from the former `guides/check-guide.js` and `cheatsheets/check.js`,
   which enforced the two halves of what is now one site's contract.

     node interview-prep/check.js --volume     <page.html>   a deep-dive volume
     node interview-prep/check.js --cheatsheet <page.html>   a cheatsheet
     node interview-prep/check.js --index      <index.html>  the catalogue wall

   Exactly one flag is required. The three pages have genuinely different
   contracts — different asset depths, different shells, different invariants —
   and inferring which one you meant from the filename would be the wrong kind of
   cleverness. It would also be the single easiest way for a check to silently
   stop applying to the pages it is meant to protect.

   What runs where:

     - The encoding, link, id and encoding-hygiene core runs on every mode.
     - The volume contract adds the diagram guarantee, which is what keeps
       `highlight.js` out of the residual `pre.diagram` blocks.
     - The figure contract runs on every page that draws: the SVG structure,
       marker integrity and literal-hue rejection. Both page shapes draw in
       inline SVG and both are held to the same structure; only the density
       guide differs, so only that is mode-gated.
     - The cheatsheet contract adds the density, table, callout and snippet
       checks that the one-page shape is held to.
     - The index contract adds the catalogue counts. It is the only page that
       links all 68 content pages, so its link resolution is the check that would
       catch a rename anywhere in the tree.

   This runs on a committed file with no source, so it verifies what is
   checkable from the page alone — that the file is self-contained and servable,
   that its navigation resolves, that its structural invariants hold. Anything
   requiring the markdown sources is retired along with them.

   Zero dependencies. Exits non-zero on any error. Warnings are advisory: the
   authoring contract says density is a guide, not the signal, so a page that
   trips a composition rule is reported and not failed. */

"use strict";

const fs = require("fs");
const path = require("path");

const MODES = ["--volume", "--cheatsheet", "--index"];
const MODE = process.argv.find(function (a) { return MODES.indexOf(a) !== -1; });
const args = process.argv.slice(2).filter(function (a) { return MODES.indexOf(a) === -1; });

if (!MODE || args.length !== 1) {
  console.error("usage: node check.js (--volume|--cheatsheet|--index) <page.html>");
  process.exit(2);
}

const PAGE = path.resolve(args[0]);
const isVolume = MODE === "--volume";
const isCheatsheet = MODE === "--cheatsheet";

const errs = [];
const warns = [];
function fail(m) { errs.push(m); }
function warn(m) { warns.push(m); }

// ---------------------------------------------------------------- encoding ---
// Load as bytes first. `.gitattributes` pins these files to LF because this
// check reads them raw, and a CRLF checkout would otherwise fail every run on
// files nobody touched — which reads as a checker bug rather than a config miss.

const raw = fs.readFileSync(PAGE);
if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) fail("BOM present");
if (raw.includes(Buffer.from("\r\n"))) fail("CRLF found");
if (raw.includes(Buffer.from("\r"))) fail("stray CR");

const s = raw.toString("utf8");
const lines = s.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf("\t") !== -1) fail("tab on line " + (i + 1));
  if (lines[i] !== lines[i].replace(/\s+$/, "")) warn("trailing whitespace line " + (i + 1));
}

function count(re) { return (s.match(re) || []).length; }
function words(t) { return t.trim().split(/\s+/).filter(Boolean).length; }

// Counters shared with the report block below. Declared here because the mode
// blocks that populate them are a different block scope.
var diagrams = 0, snippetCount = 0;
var figs = [], callouts = [], markerIds = [];

// -------------------------------------------------------------------- emoji ---
// Volume pages use ✓ ⚠ ✅ ★ deliberately inside `pre.diagram` and `pre.snippet`,
// where the glyph IS the drawing. Blanking every <pre> block leaves zero
// pictographs outside code on all 69 pages, which is the invariant this
// asserts: no emoji in prose.
//
// Note the asymmetry, which is deliberate: the mask stops at `</pre>`, so a
// `<figure>` is NOT masked. A status glyph inside a converted SVG figure is a
// hard failure here, pointing at the right line. That is the mechanism by which
// a figure is forced to carry its meaning in `.node--good/warn/bad` rather than
// in a glyph — read that failure as a design instruction, not a checker bug.
//
// The mask preserves newlines so the reported line number is the real one —
// collapsing each block to a single space would slide every later line up by
// however tall the block was and point at unrelated prose.
const proseOnly = s.replace(/<pre[\s\S]*?<\/pre>/g, function (block) {
  return block.replace(/[^\n]/g, " ");
}).split("\n");
const ALLOW_CP = [0x2190, 0x2191, 0x2192, 0x2193, 0x2014, 0x2013, 0x2018, 0x2019,
  0x201c, 0x201d, 0x2212, 0x2264, 0x2265, 0x00d7, 0x00b7, 0x2026, 0x00a0];
for (let i = 0; i < proseOnly.length; i++) {
  for (const ch of proseOnly[i]) {
    const cp = ch.codePointAt(0);
    if (ALLOW_CP.indexOf(cp) !== -1) continue;
    if ((cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) {
      fail("emoji/pictograph U+" + cp.toString(16) + " line " + (i + 1));
    }
  }
}
// The entity-encoded form is a separate loop over the UNMASKED string: an
// encoded pictograph in prose is exactly what this is here to catch.
for (const m of s.matchAll(/&(#x?[0-9a-fA-F]+|#\d+);/g)) {
  const v = m[1];
  const cp = /^#x/i.test(v) ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10);
  if ((cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) {
    fail("entity-encoded emoji &" + v + ";");
  }
}

// ---------------------------------------------------------- tag balance ------
const TAGS = ["html", "head", "body", "main", "nav", "section", "table", "thead", "tbody",
  "tr", "figure", "svg", "pre", "code", "ol", "ul", "li", "p", "div", "span", "defs",
  "marker", "footer", "header", "a", "strong", "em"];
for (const tag of TAGS) {
  const o = count(new RegExp("<" + tag + "(?![\\w-])[\\s>/]", "g"));
  const c = count(new RegExp("</" + tag + ">", "g"));
  if (o !== c) fail("tag <" + tag + "> unbalanced: " + o + " open, " + c + " close");
}

// --------------------------------------------------- assets the page needs ---
// Each page must be servable on its own: unstyled text or a dead filter is the
// failure mode nothing in a static repo would otherwise notice.

const ASSETS = {
  volume: [
    ['<link rel="stylesheet" href="../site.css">', "site.css (tokens and layout)"],
    ['<script src="../search.js"></script>', "search.js (filtering)"],
    ['<script src="../toc.js"></script>', "toc.js (scroll-spy)"],
    ['<script src="../highlight.js"></script>', "highlight.js (syntax highlighting)"],
  ],
  cheatsheet: [
    ['<link rel="stylesheet" href="../../site.css">', "site.css (tokens and layout)"],
    ['<script src="../../search.js"></script>', "search.js (filtering)"],
    ['<script src="../../highlight.js"></script>', "highlight.js (syntax highlighting)"],
  ],
  index: [
    ['<link rel="stylesheet" href="interview-prep/site.css">', "site.css (tokens and layout)"],
    ['<script src="interview-prep/search.js"></script>', "search.js (filtering)"],
  ],
};
for (const [re, what] of ASSETS[MODE.slice(2)]) {
  if (s.indexOf(re) === -1) fail("does not load " + what);
}

for (const m of ['<meta name="viewport"', '<meta name="description"', "<title>"]) {
  if (s.indexOf(m) === -1) fail("missing required markup: " + m);
}

// The catalogue has no chapters to spy on and no code to highlight, so it loads
// neither toc.js nor highlight.js; demanding them would be a false failure.
if (isCheatsheet && s.indexOf("search.js") > s.indexOf("highlight.js")) {
  fail("script order: search.js must precede highlight.js");
}

// ------------------------------------------------------- shell and access ---
if (!/<a class="skip" href="#main">/.test(s)) fail("no skip link");
if (!/<main[^>]*id="main"/.test(s)) fail('no <main id="main"> for the skip link to target');

const SHELL = isCheatsheet
  ? ['class="page"', 'class="sidebar"', 'class="masthead"', 'class="masthead__eyebrow"',
     'class="masthead__sub"', 'class="masthead__meta"', 'class="toolbar"', 'class="search"',
     'class="pager"', 'class="keyfacts"', 'class="pagefoot"']
  : isVolume
    ? ['class="page"', 'class="sidebar"', 'class="masthead"', 'class="pagefoot"']
    : ['class="page"', 'class="sidebar"', 'class="masthead"', 'class="toolbar"',
       'class="search"', 'class="pagefoot"'];
for (const r of SHELL) {
  if (s.indexOf(r) === -1) fail("missing required markup: " + r);
}

// ------------------------------------------------------------- the filter ---
// Every filterable page carries exactly one input, one counter and one empty
// state, and at least two filterable items. The empty state starts hidden so it
// cannot flash before search.js has run.

if (count(/data-filter-input/g) !== 1) fail("expected exactly one data-filter-input");
if (count(/data-filter-count/g) !== 1) fail("expected exactly one data-filter-count");
if (count(/data-filter-empty/g) !== 1) fail("expected exactly one data-filter-empty");
if (count(/data-filter-target/g) < 2) fail("too few data-filter-target sections");
if (s.indexOf("data-filter-empty hidden") === -1) fail("empty state must start hidden");

// ------------------------------------------------------------ ids and links ---

const ids = {};
const idRe = /\sid="([^"]+)"/g;
let m;
while ((m = idRe.exec(s))) {
  if (ids[m[1]]) fail('duplicate id "' + m[1] + '"');
  ids[m[1]] = true;
}

const hrefRe = /\shref="([^"]+)"/g;
while ((m = hrefRe.exec(s))) {
  const href = m[1];
  if (href.charAt(0) === "#") {
    if (!ids[href.slice(1)]) fail('href="' + href + '" resolves to no id');
    continue;
  }
  if (/^(https?:|mailto:|data:)/i.test(href)) continue;
  // Strip the fragment before resolving. A relative href that carries one is
  // real on this site, and resolving the fragment as part of the filename
  // would report a link that works as dead.
  if (!fs.existsSync(path.resolve(path.dirname(PAGE), href.split("#")[0]))) {
    fail('href="' + href + '" resolves to no file');
  }
}

// ------------------------------------------------- unparsed markdown --------
 // Stripped of code first, because a markdown chapter template rendered inside
 // a fence keeps its literal `- [Title](url)` — that is preserved source, not a
 // link that failed to parse.
const markup = s.replace(/<code>[\s\S]*?<\/code>/g, "");
if (/\[[^\]\n]+\]\([^)\s]+\)/.test(markup)) {
  fail("an unparsed markdown link survives as text");
}
if (/&amp;(lt|gt|amp|quot);/.test(markup)) fail("double-escaped entity");

// ===================================================== the volume contract ===

if (isVolume) {
  // Exactly one `<h1>` in the masthead. Later `# Part N — …` dividers are
  // legitimately `<h1>` in the body — they mark real boundaries — so the check
  // is that none of them *repeats the title*, not that there is only one h1.
  const pageTitle = /<h1>([^<]*)<\/h1>/.exec(s);
  if (!pageTitle) {
    fail("no <h1> in the masthead");
  } else {
    const title = pageTitle[1].toLowerCase().replace(/&amp;/g, "&");
    const bodyStart = s.indexOf("<section");
    const bodyHtml = bodyStart === -1 ? "" : s.slice(bodyStart);
    const bodyH1 = /<h1[^>]*>([^<]*)<\/h1>/g;
    let bh;
    while ((bh = bodyH1.exec(bodyHtml))) {
      if (bh[1].toLowerCase().replace(/&amp;/g, "&") === title) {
        fail("the volume title is repeated as an <h1> in the body");
      }
    }
  }

  // --- the diagram guarantee ---
  // `highlight.js` selects `pre.snippet` only, and the diagram classes carry no
  // `data-lang`, so the highlighter structurally cannot reach them.
  //
  // This is the volume contract's share of that guarantee, and it still has a
  // population: a volume keeps a residual set of `pre.diagram` blocks for what
  // is text rather than drawing — terminal transcripts (SHOW CREATE TABLE,
  // EXPLAIN, replica status, jstack), ASCII `+---+` tables, bean-definition
  // dumps and numbered prose lists. Drawings are not here at all; they are
  // `<figure class="figure">` SVG, which the highlighter cannot select either
  // because it carries no `data-lang`, and which the figure contract checks
  // instead.
  //
  // So the invariant is: nothing tagged `data-lang` may sit in a `pre.diagram`.
  // The counts this file used to quote (725) described the pre-conversion corpus
  // and are historical, not a target to hold the pages to.
  const diagRe = /<pre class="diagram"([^>]*)>/g;
  while ((m = diagRe.exec(s))) {
    diagrams++;
    if (/data-lang/.test(m[1])) {
      fail("pre.diagram carries data-lang and would be highlighted");
    }
  }
  if (/<pre class="diagram"[^>]*>\s*(?:<code>\s*<\/code>)?\s*<\/pre>/.test(s)) {
    fail("an empty pre.diagram — a fence lost its body");
  }
}

// ====================================================== the figure contract ===

// The figure rules are shared, not cheatsheet-only: both page shapes draw in
// inline SVG and both are held to the same structure. What differs is density,
// and only the density rule is mode-gated. See interview-prep/README.md
// "Figures" for the authoring rules these assertions protect.

for (const mm of s.matchAll(/<figure class="figure">\s*<svg([^>]*)>([\s\S]*?)<\/svg>([\s\S]*?)<\/figure>/g)) {
  figs.push([mm[1], mm[2], mm[3]]);
}

// Density is a composition guide and it is cheatsheet-tuned: a cheatsheet is a
// condensed page where a figure must earn its place against a 400-500 word
// narration budget, so 2-4 is the guide there. A volume's figure count is not a
// choice — it is however many diagram blocks the source prose contained, and
// during a staged conversion it is transiently 0 on a page whose drawings are
// still ASCII. Range-checking it on a volume would warn on every page for a
// number the author did not pick, so the check does not run there.
if (isCheatsheet && (figs.length < 2 || figs.length > 4)) {
  warn("figure count " + figs.length + " outside 2-4");
}

for (const f of figs) {
  const attrs = f[0], inner = f[1], rest = f[2];
  if (attrs.indexOf('role="img"') === -1) fail("svg missing role=img");
  if (attrs.indexOf('aria-label="') === -1) fail("svg missing aria-label");
  const vb = attrs.match(/viewBox="([^"]+)"/);
  if (!vb) fail("svg missing viewBox");
  else {
    const n = vb[1].trim().split(/\s+/).map(Number);
    if (n.length !== 4 || n.some(isNaN) || n[2] <= 0 || n[3] <= 0) fail("degenerate viewBox " + vb[1]);
  }
  if (!/<(text|rect|line|path|circle|polygon|polyline)[\s>]/.test(inner)) fail("svg draws nothing");
  const cap = rest.match(/<figcaption>([\s\S]*?)<\/figcaption>/);
  if (!cap) fail("figure without figcaption");
  else {
    const w = words(cap[1].replace(/<[^>]+>/g, " ").replace(/&mdash;/g, " "));
    if (w < 25) warn("figcaption under 25 words (" + w + ")");
    if (cap[1].indexOf("<strong>") === -1) warn("figcaption states no <strong> claim");
  }
  // Markers are pushed in document order before this figure's references are
  // checked, so the test is "defined in this figure or an earlier one" — the
  // same guarantee it gave a cheatsheet. It is order-sensitive in one direction
  // only: a figure referencing a marker defined in a LATER figure fails. Hence
  // <defs> is the first child of <svg> in the pattern.
  for (const mm of inner.matchAll(/<marker id="([^"]+)"/g)) markerIds.push(mm[1]);
  for (const mm of inner.matchAll(/url\(#([^)]+)\)/g)) {
    if (markerIds.indexOf(mm[1]) === -1) {
      fail("marker #" + mm[1] + " referenced before or without definition");
    }
  }
}
for (const id of markerIds) {
  const uses = (s.match(new RegExp("url\\(#" + id + "\\)", "g")) || []).length;
  if (!uses) warn("marker " + id + " is defined but never used");
}

// Literal hues are rejected inside figures, not across the page. Scoping it to
// the figure innards is what lets this run on volumes at all: a volume is full of
// <pre class="snippet"> blocks quoting real Java, SQL and CSS, and a snippet that
// happens to show SVG or CSS markup must not be read as a figure drawing a wrong
// colour. On the cheatsheets the unscoped scan found nothing outside figures
// anyway, so this is equivalent there and strictly safer here.
//
// The old `!== "context-stroke"` guard was unreachable: the capture group is
// `#[0-9a-fA-F]{3,8}` and "context-stroke" can never match it. The only permitted
// literal fill is the marker's own `context-stroke`, which does not match and so
// needs no exemption.
for (const f of figs) {
  for (const mm of f[1].matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)) {
    fail("literal hue " + mm[1] + " in a figure - use the currentColor classes");
  }
}
if (count(/orient="auto-start-reverse"/g) !== markerIds.length) {
  fail("each marker needs orient=auto-start-reverse");
}

// The masthead carries a hand-maintained figure count and it has drifted — four
// of 36 pages were already wrong before any conversion. Reporting it is cheap. It
// is a warning rather than a failure because the wording rule has branches
// ("N figures", optionally plus "M console transcripts") and the exact vocabulary
// is the author's call.
const mast = s.match(/<ul class="masthead__meta">([\s\S]*?)<\/ul>/);
if (mast && figs.length) {
  const claimed = /<li>(\d+) figures?<\/li>/.exec(mast[1]);
  if (!claimed) warn("masthead carries no figure count (" + figs.length + " on page)");
  else if (+claimed[1] !== figs.length) {
    warn("masthead says " + claimed[1] + " figures, page has " + figs.length);
  }
}

// ================================================== the cheatsheet contract ===

if (isCheatsheet) {
  // --- sections vs TOC, and section numbering ---
  const cids = [];
  for (const mm of s.matchAll(/<section id="([^"]+)"/g)) cids.push(mm[1]);
  const toc = [];
  for (const mm of s.matchAll(/<li><a href="#([^"]+)"/g)) toc.push(mm[1]);
  for (const a of toc) { if (cids.indexOf(a) === -1) fail("TOC anchor with no section: #" + a); }
  for (const i of cids) { if (toc.indexOf(i) === -1) fail("section not in TOC: #" + i); }
  if (count(/class="section__num"/g) !== cids.length) fail("one section__num per section required");

  // Chapters are numbered 01..N; only the numbers/appendix section carries &nbsp;.
  const chaps = cids.filter(function (i) { return i !== "numbers"; });
  chaps.forEach(function (id, n) {
    const mm = s.match(new RegExp('<section id="' + id + '"[\\s\\S]*?<span class="section__num">([^<]*)<'));
    const want = String(n + 1).padStart(2, "0");
    if (!mm) { fail("no section__num for #" + id); }
    else if (mm[1] !== want) { fail("#" + id + ' numbered "' + mm[1] + '", expected "' + want + '"'); }
  });
  const lastNum = s.match(/<section id="numbers"[\s\S]*?<span class="section__num">([^<]*)</);
  if (!lastNum || lastNum[1] !== "&nbsp;") {
    fail("the numbers section should carry &nbsp;, got " + (lastNum ? lastNum[1] : "nothing"));
  }

  // --- tables ---
  for (const t of s.matchAll(/<table[^>]*>([\s\S]*?)<\/table>/g)) {
    const th = (t[1].match(/<th[\s>]/g) || []).length;
    if (th < 2) fail("table with fewer than 2 header cells");
    if (t[1].indexOf("<caption>") === -1) warn("table without a caption");
    const rows = [];
    for (const r of t[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
      if (/<td[\s>]/.test(r[1])) rows.push(r[1]);
    }
    if (!rows.length) fail("table with no body rows");
    // A cell's contribution to the column count is its colspan, and a rowspan
    // in an earlier row legitimately shortens the rows beneath it. Both are
    // correct HTML, so spans are resolved before the count is compared.
    const carry = [];                       // columns still held by a rowspan
    const freeAt = (i) => {                 // first free column at or after i
      while (carry[i]) i++;
      return i;
    };
    for (const r of rows) {
      const cells = r.match(/<td[^>]*>/g) || [];
      const fresh = [];                      // spans opened by this row
      let col = 0, wide = 0;
      for (const c of cells) {
        const cs = c.match(/colspan="(\d+)"/);
        const rs = c.match(/rowspan="(\d+)"/);
        col = freeAt(col);
        wide = Math.max(wide, col + (cs ? +cs[1] : 1));
        if (rs) fresh.push([col, cs ? +cs[1] : 1, +rs[1] - 1]);
        col += cs ? +cs[1] : 1;
      }
      // A row that sits under a rowspan is not short: the carried cells supply
      // the remaining columns, so the row's width is the greater of its own
      // extent and the furthest column a carried span still occupies.
      let carried = 0;
      for (let k = 0; k < carry.length; k++) if (carry[k]) carried = k + 1;
      for (let k = 0; k < carry.length; k++) if (carry[k]) carry[k]--;
      // A rowspan="4" occupies its own row plus three below, so its counter is
      // seeded only after this row's carry has aged -- hence the merge below.
      for (const [c0, w0, span] of fresh) {
        if (span > 0) for (let k = 0; k < w0; k++) carry[c0 + k] = (carry[c0 + k] || 0) + span;
      }
      const width = Math.max(wide, carried);
      if (width !== th) fail("table row has " + width + " cells, header has " + th);
    }
  }
  if (count(/table--decision/g) < 4) warn("fewer than 4 table--decision tables");

  // --- callouts ---
  const PREFIX = { "callout--trap": "Interview trap", "callout--tradeoff": "Trade-off",
    "callout--scale": "Scaling reality check", "callout--must": "Must remember" };
  // The label may contain inline markup (a <code>SQL</code> in a claim), so it is
  // matched up to the closing span rather than with a [^<]+ character class.
  for (const mm of s.matchAll(/<div class="callout (callout--\w+)">\s*<span class="callout__label">([\s\S]*?)<\/span>/g)) {
    callouts.push([mm[1], mm[2]]);
  }
  const seenTypes = new Set();
  for (const pair of callouts) {
    const cls = pair[0], t = pair[1].trim();
    if (!PREFIX[cls]) { fail("unknown callout class " + cls); continue; }
    const prefix = PREFIX[cls];
    if (t.toLowerCase().indexOf(prefix.toLowerCase()) !== 0) {
      // Style drift, not a rendering defect: the CSS uppercases the label but
      // does not supply the prefix, so a missing prefix is worth reporting --
      // but it should not outweigh a real failure in the exit code.
      warn('callout ' + cls + ' label omits the "' + prefix + '" prefix: "' + t + '"');
    }
    // The set writes the separator both ways: &mdash; and a literal em-dash.
    const claim = t.slice(prefix.length).trim();
    const DASH = /^(&mdash;|—)\s*/;
    if (!DASH.test(claim)) {
      warn(cls + ' label states no specific claim after the em-dash: "' + t + '"');
    } else if (words(claim.replace(DASH, "")) < 2) {
      warn(cls + " claim too short to identify the callout when filtered: " + t);
    }
    seenTypes.add(cls.replace("callout--", ""));
  }
  for (const t of ["trap", "tradeoff", "scale", "must"]) {
    if (!seenTypes.has(t)) warn("no callout--" + t + " on page");
  }
  const opened = count(/<div class="callout /g);
  if (opened !== callouts.length) fail((opened - callouts.length) + " callout(s) with no leading callout__label");
  if (callouts.length > 20) warn("callout count " + callouts.length + " is above the 12-20 composition guide");

  // --- keyfacts: exactly five ---
  // The lookahead is load-bearing: the box contains sibling divs, and without it
  // the lazy match stops at the wrong closing tag.
  const kf = s.match(/<div class="keyfacts">([\s\S]*?)<\/div>\s*(?=<p)/);
  if (!kf) fail("keyfacts box not found");
  else {
    const n = (kf[1].match(/<li>/g) || []).length;
    if (n !== 5) fail("keyfacts must have exactly 5 bullets, found " + n);
    if (kf[1].indexOf("<h2>") === -1) fail("keyfacts has no heading");
  }

  // --- snippets ---
  for (const mm of s.matchAll(/<pre class="snippet"([^>]*)>([\s\S]*?)<\/pre>/g)) {
    snippetCount++;
    const attrs = mm[1], body = mm[2];
    const lang = attrs.match(/data-lang="([^"]+)"/);
    const title = attrs.match(/data-title="([^"]+)"/);
    const hl = attrs.match(/data-hl-line="([^"]+)"/);
    const id = title ? title[1] : lang ? lang[1] : "?";
    if (!lang) fail("snippet missing data-lang (" + id + ")");
    if (!title) { fail("snippet missing data-title (" + id + ")"); }
    else {
      const w = words(title[1]);
      if (w < 3 || w > 4) warn('data-title "' + title[1] + '" is ' + w + " words, want 3-4");
    }
    const cm = body.match(/<code>([\s\S]*)<\/code>/);
    if (!cm) { fail("snippet has no <code> (" + id + ")"); continue; }
    if (/<[a-zA-Z/]/.test(cm[1])) fail("markup inside <pre> (" + id + ")");
    const src = cm[1].replace(/\n+$/, "");
    if (!src.trim()) fail("empty snippet (" + id + ")");
    const n = src.split("\n").length;
    if (hl) {
      const vals = hl[1].split(",").map(Number);
      if (vals.length > 2) fail("data-hl-line has " + vals.length + " values (" + id + ")");
      for (const v of vals) {
        if (v < 1 || v > n) fail("data-hl-line " + v + " out of range 1.." + n + " (" + id + ")");
      }
    }
    if (n > 26) warn("snippet " + id + " is " + n + " lines");
    const sl = src.split("\n");
    for (let k = 0; k < sl.length; k++) {
      if (sl[k].length > 88) warn("snippet " + id + " line " + (k + 1) + " is " + sl[k].length + " cols");
    }
  }
  if (snippetCount < 3 || snippetCount > 8) warn("snippet count " + snippetCount + " outside 3-8");

  // --- number cards ---
  for (const mm of s.matchAll(/<div class="number">([\s\S]*?)<\/div>/g)) {
    if (mm[1].indexOf("number__value") === -1) fail("number card with no number__value");
    if (mm[1].indexOf("number__label") === -1) fail("number card with no number__label");
  }
}

// ==================================================== the catalogue contract ==

if (MODE === "--index") {
  // The wall is the only page that links every content page, so these counts
  // are what notice a volume or cheatsheet dropping out of the catalogue, or a
  // track being renamed out from under the links.
  const volLinks = s.match(/class="wall__title" href="interview-prep\/(java|spring|database|microservices)\//g) || [];
  const cheatLinks = s.match(/class="wall__cheat" href="interview-prep\/cheatsheets\/(java|spring|database|microservices)\//g) || [];
  // Volumes and cheatsheets are counted separately and are NOT equal: Java Volume 10
  // (Testing & Build Tooling) has a volume page and no cheatsheet, so its wall row
  // carries no wall__cheat anchor. Adding a cheatsheet for it makes both 36.
  if (volLinks.length !== 36) fail("expected 36 volume links in the wall, found " + volLinks.length);
  if (cheatLinks.length !== 35) fail("expected 35 cheatsheet links in the wall, found " + cheatLinks.length);
  if (count(/data-filter-group/g) !== 4) fail("expected 4 data-filter-group tracks");
  if (count(/data-filter-target/g) !== 36) fail("expected 36 data-filter-target rows");
  for (const track of ["java", "spring", "database", "microservices"]) {
    if (!new RegExp('<section class="wall__track" id="' + track + '"').test(s)) {
      fail("wall has no track section for " + track);
    }
    if (s.indexOf('<a href="#' + track + '">') === -1) {
      fail("sidebar has no anchor link to #" + track);
    }
  }
}

// ------------------------------------------------------------------ report ---

console.log("=== " + path.relative(process.cwd(), PAGE) + " [" + MODE.slice(2) + "] ===");
if (isVolume) {
  console.log("chapters " + count(/<section[\s>]/g) +
              " | questions " + count(/class="qa__q"/g) +
              " | figures " + figs.length +
              " | ascii blocks " + diagrams +
              " | snippets " + count(/<pre class="snippet"/g) +
              " | tables " + count(/<table[\s>]/g) +
              " | callouts " + count(/<aside class="callout/g));
} else if (isCheatsheet) {
  // Narration is counted outside table/figure/callout/numbers/keyfacts/snippet,
  // so it measures the prose a reader actually reads. The contract calls 400-500
  // generous; siblings run 1600-2500 and were not cut.
  let nar = s.slice(s.indexOf("<main"), s.indexOf("<footer"));
  nar = nar.replace(/<table[\s\S]*?<\/table>/g, " ")
           .replace(/<figure[\s\S]*?<\/figure>/g, " ")
           .replace(/<div class="callout[\s\S]*?<\/div>\s*(?=<)/g, " ")
           .replace(/<div class="numbers"[\s\S]*?<\/div>\s*(?=<p)/g, " ")
           .replace(/<div class="keyfacts">[\s\S]*?<\/div>\s*(?=<p)/g, " ")
           .replace(/<pre class="snippet"[\s\S]*?<\/pre>/g, " ")
           .replace(/<[^>]+>/g, " ")
           .replace(/&mdash;|&ndash;/g, " ");
  const narration = words(nar);
  const total = words(s.replace(/<[^>]+>/g, " "));
  console.log("narration words:          " + narration +
    "   (contract: 400-500 generous; siblings run 1600-2500 and were not cut)");
  console.log("total words (smoke only): " + total);
  console.log("sections " + count(/<section[\s>]/g) +
    " | tables " + count(/<table[\s>]/g) +
    " | figures " + figs.length +
    " | snippets " + snippetCount +
    " | callouts " + callouts.length +
    " | number cards " + count(/<div class="number">/g));
  console.log("callout mix:             " + ["trap", "tradeoff", "scale", "must"]
    .map(function (t) {
      return t + "=" + callouts.filter(function (c) { return c[0].endsWith(t); }).length;
    }).join("  "));
} else {
  console.log("volumes " + count(/class="wall__title"/g) +
              " | cheatsheets " + count(/class="wall__cheat"/g) +
              " | tracks " + count(/data-filter-group/g));
}
console.log("ids " + Object.keys(ids).length + " | bytes " + raw.length);
console.log("");

warns.forEach(function (w) { console.log("WARN  " + w); });
if (warns.length) console.log("");
if (errs.length) { errs.forEach(function (e) { console.log("FAIL  " + e); }); process.exit(1); }
console.log("PASS - no errors");