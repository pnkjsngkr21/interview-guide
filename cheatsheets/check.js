// Contract checker for any cheatsheet volume page.
// Mirrors the authoring contract in cheatsheets/README.md.
//
//   node check.js <path/to/page.html>
//
// Exits non-zero on any error. Warnings are advisory: the contract says
// density is not the signal, so a page that trips a composition guide is
// reported and not failed.

const fs = require("fs");
const path = require("path");

if (process.argv.length < 3) {
  console.error("usage: node check.js <page.html>");
  process.exit(2);
}
const PAGE = path.resolve(process.argv[2]);

const errs = [];
const warns = [];
function fail(m) { errs.push(m); }
function warn(m) { warns.push(m); }

// --- encoding / line endings / whitespace ---------------------------------
const raw = fs.readFileSync(PAGE);
if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) fail("BOM present");
if (raw.includes(Buffer.from("\r\n"))) fail("CRLF found");
if (raw.includes(Buffer.from("\r"))) fail("stray CR");
const s = raw.toString("utf8");

function count(re) { return (s.match(re) || []).length; }
function words(t) { return t.trim().split(/\s+/).filter(Boolean).length; }

const lines = s.split("\n");
for (let i = 0; i < lines.length; i++) {
  if (lines[i].indexOf("\t") !== -1) fail("tab on line " + (i + 1));
  if (lines[i] !== lines[i].replace(/\s+$/, "")) warn("trailing whitespace line " + (i + 1));
}

// --- emoji / pictographs -------------------------------------------------
const ALLOW_CP = [0x2190, 0x2191, 0x2192, 0x2193, 0x2014, 0x2013, 0x2018, 0x2019,
  0x201c, 0x201d, 0x2212, 0x2264, 0x2265, 0x00d7, 0x00b7, 0x2026, 0x00a0];
for (let i = 0; i < lines.length; i++) {
  for (const ch of lines[i]) {
    const cp = ch.codePointAt(0);
    if (ALLOW_CP.indexOf(cp) !== -1) continue;
    if ((cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) {
      fail("emoji/pictograph U+" + cp.toString(16) + " line " + (i + 1));
    }
  }
}
for (const m of s.matchAll(/&(#x?[0-9a-fA-F]+|#\d+);/g)) {
  const v = m[1];
  const cp = /^#x/i.test(v) ? parseInt(v.slice(2), 16) : parseInt(v.slice(1), 10);
  if ((cp >= 0x1f000 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf)) {
    fail("entity-encoded emoji &" + v + ";");
  }
}

// --- tag balance ---------------------------------------------------------
const TAGS = ["html", "head", "body", "main", "nav", "section", "table", "thead", "tbody",
  "tr", "figure", "svg", "pre", "code", "ol", "ul", "li", "p", "div", "span", "defs",
  "marker", "footer", "header", "a", "strong", "em"];
for (const tag of TAGS) {
  const o = count(new RegExp("<" + tag + "(?![\\w-])[\\s>/]", "g"));
  const c = count(new RegExp("</" + tag + ">", "g"));
  if (o !== c) fail("tag <" + tag + "> unbalanced: " + o + " open, " + c + " close");
}

// --- head / structure contract -------------------------------------------
const REQUIRED = [
  '<link rel="stylesheet" href="../cheatsheet.css">', 'class="skip"', 'class="page"',
  'class="sidebar"', 'class="masthead"', 'class="masthead__eyebrow"',
  'class="masthead__sub"', 'class="masthead__meta"', 'class="toolbar"', 'class="search"',
  'class="pager"', 'class="keyfacts"', 'class="pagefoot"', 'src="../search.js"',
  'src="../highlight.js"', '<meta name="viewport"', '<meta name="description"', "<title>"];
for (const r of REQUIRED) {
  if (s.indexOf(r) === -1) fail("missing required markup: " + r);
}
if (s.indexOf("search.js") > s.indexOf("highlight.js")) {
  fail("script order: search.js must precede highlight.js");
}

// --- filtering contract --------------------------------------------------
if (count(/data-filter-input/g) !== 1) fail("expected exactly one data-filter-input");
if (count(/data-filter-count/g) !== 1) fail("expected exactly one data-filter-count");
if (count(/data-filter-empty/g) !== 1) fail("expected exactly one data-filter-empty");
if (count(/data-filter-target/g) < 2) fail("too few data-filter-target sections");
if (s.indexOf("data-filter-empty hidden") === -1) fail("empty state must start hidden");

// --- sections vs TOC, and section numbering ------------------------------
const ids = [];
for (const m of s.matchAll(/<section id="([^"]+)"/g)) ids.push(m[1]);
const toc = [];
for (const m of s.matchAll(/<li><a href="#([^"]+)"/g)) toc.push(m[1]);
for (const a of toc) { if (ids.indexOf(a) === -1) fail("TOC anchor with no section: #" + a); }
for (const i of ids) { if (toc.indexOf(i) === -1) fail("section not in TOC: #" + i); }
if (count(/class="section__num"/g) !== ids.length) fail("one section__num per section required");

// Chapters are numbered 01..N; only the numbers/appendix section carries &nbsp;.
const chaps = ids.filter(function (i) { return i !== "numbers"; });
chaps.forEach(function (id, n) {
  const m = s.match(new RegExp('<section id="' + id + '"[\\s\\S]*?<span class="section__num">([^<]*)<'));
  const want = String(n + 1).padStart(2, "0");
  if (!m) { fail("no section__num for #" + id); }
  else if (m[1] !== want) { fail("#" + id + ' numbered "' + m[1] + '", expected "' + want + '"'); }
});
const lastNum = s.match(/<section id="numbers"[\s\S]*?<span class="section__num">([^<]*)</);
if (!lastNum || lastNum[1] !== "&nbsp;") {
  fail("the numbers section should carry &nbsp;, got " + (lastNum ? lastNum[1] : "nothing"));
}

// --- tables --------------------------------------------------------------
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

// --- callouts ------------------------------------------------------------
const PREFIX = { "callout--trap": "Interview trap", "callout--tradeoff": "Trade-off",
  "callout--scale": "Scaling reality check", "callout--must": "Must remember" };
const callouts = [];
// The label may contain inline markup (a <code>SQL</code> in a claim), so it is
// matched up to the closing span rather than with a [^<]+ character class.
for (const m of s.matchAll(/<div class="callout (callout--\w+)">\s*<span class="callout__label">([\s\S]*?)<\/span>/g)) {
  callouts.push([m[1], m[2]]);
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

// --- keyfacts: exactly five ---------------------------------------------
const kf = s.match(/<div class="keyfacts">([\s\S]*?)<\/div>\s*(?=<p)/);
if (!kf) fail("keyfacts box not found");
else {
  const n = (kf[1].match(/<li>/g) || []).length;
  if (n !== 5) fail("keyfacts must have exactly 5 bullets, found " + n);
  if (kf[1].indexOf("<h2>") === -1) fail("keyfacts has no heading");
}

// --- snippets ------------------------------------------------------------
let snippetCount = 0;
for (const m of s.matchAll(/<pre class="snippet"([^>]*)>([\s\S]*?)<\/pre>/g)) {
  snippetCount++;
  const attrs = m[1], body = m[2];
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

// --- figures -------------------------------------------------------------
const figs = [];
for (const m of s.matchAll(/<figure class="figure">\s*<svg([^>]*)>([\s\S]*?)<\/svg>([\s\S]*?)<\/figure>/g)) {
  figs.push([m[1], m[2], m[3]]);
}
if (figs.length < 2 || figs.length > 4) warn("figure count " + figs.length + " outside 2-4");
const markerIds = [];
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
  for (const m of inner.matchAll(/<marker id="([^"]+)"/g)) markerIds.push(m[1]);
  for (const m of inner.matchAll(/url\(#([^)]+)\)/g)) {
    if (markerIds.indexOf(m[1]) === -1) fail("marker #" + m[1] + " referenced before or without definition");
  }
}
for (const id of markerIds) {
  const uses = (s.match(new RegExp("url\\(#" + id + "\\)", "g")) || []).length;
  if (!uses) warn("marker " + id + " is defined but never used");
}
const allIds = [];
for (const m of s.matchAll(/\sid="([^"]+)"/g)) allIds.push(m[1]);
for (const id of allIds) {
  if (allIds.filter(function (x) { return x === id; }).length > 1) fail("duplicate element id: " + id);
}
for (const m of s.matchAll(/(?:fill|stroke)="(#[0-9a-fA-F]{3,8})"/g)) {
  if (m[1].toLowerCase() !== "context-stroke") fail("literal hue " + m[1] + " - use currentColor classes");
}
if (count(/orient="auto-start-reverse"/g) !== markerIds.length) {
  fail("each marker needs orient=auto-start-reverse");
}

// --- links resolve -------------------------------------------------------
for (const m of s.matchAll(/href="([^"]+)"/g)) {
  const href = m[1];
  if (href.charAt(0) === "#" || href.indexOf("http") === 0) continue;
  if (!fs.existsSync(path.resolve(path.dirname(PAGE), href))) fail("dead link: " + href);
}

// --- number cards --------------------------------------------------------
for (const m of s.matchAll(/<div class="number">([\s\S]*?)<\/div>/g)) {
  if (m[1].indexOf("number__value") === -1) fail("number card with no number__value");
  if (m[1].indexOf("number__label") === -1) fail("number card with no number__label");
}

// --- narration word count (outside table/figure/callout/numbers/keyfacts) -
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

console.log("=== " + path.relative(process.cwd(), PAGE) + " ===");
console.log("narration words:          " + narration +
  "   (contract: 400-500 generous; siblings run 1600-2500 and were not cut)");
console.log("total words (smoke only): " + total);
console.log("sections " + ids.length + " | tables " + count(/<table[\s>]/g) +
  " | figures " + figs.length + " | snippets " + snippetCount +
  " | callouts " + callouts.length + " | number cards " + count(/<div class="number">/g));
console.log("callout mix:             " + ["trap", "tradeoff", "scale", "must"]
  .map(function (t) {
    return t + "=" + callouts.filter(function (c) { return c[0].endsWith(t); }).length;
  }).join("  "));
console.log("markers:                 " + markerIds.join(", "));
console.log("");
warns.forEach(function (w) { console.log("WARN  " + w); });
console.log("");
if (errs.length) { errs.forEach(function (e) { console.log("FAIL  " + e); }); process.exit(1); }
console.log("PASS - no errors");
