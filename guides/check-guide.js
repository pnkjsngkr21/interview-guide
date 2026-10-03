/* Contract checker for a generated guide page.
   Mirrors `cheatsheets/check.js` in shape, but checks the volume contract
   described in guides/README.md rather than the cheatsheet one.

     node guides/check-guide.js <page.html>        a volume page
     node guides/check-guide.js --index <page>     the guides index

   Exits non-zero on any error.

   The index is checked separately because it genuinely is a different contract:
   it sits one directory up rather than two, so its asset paths take one `..`,
   and it has no scroll-spy (nothing to spy on, since it has no chapters of its
   own) and no syntax highlighting (no code blocks). Inferring this from the
   filename would be the wrong kind of cleverness — the flag is explicit.

   The distinction from `lib/check.js` matters: that runs inside the build, where
   the parsed source is in hand and conservation can compare text against text.
   This runs on a committed file with no source, so it verifies the properties
   that are checkable from the page alone — that the file is self-contained and
   servable, that its navigation resolves, and that the diagram guarantee holds.
   Anything requiring the markdown is the build's job, not this one's.

   Zero dependencies. */

"use strict";

var fs = require("fs");
var path = require("path");

var isIndex = process.argv.indexOf("--index") !== -1;
var args = process.argv.slice(2).filter(function (a) { return a !== "--index"; });

if (args.length < 1) {
  console.error("usage: node check-guide.js [--index] <page.html>");
  process.exit(2);
}

var PAGE = path.resolve(args[0]);

// `guides/index.html` is one level below the repo root; `guides/<track>/x.html`
// is two. The asset paths follow from that depth.
var UP = isIndex ? ".." : "../..";

var errs = [];
function fail(m) { errs.push(m); }

// ---------- encoding ----------

var raw = fs.readFileSync(PAGE);
if (raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf) fail("BOM present");
if (raw.includes(Buffer.from("\r\n"))) fail("CRLF found");
if (raw.includes(Buffer.from("\r"))) fail("stray CR");

var s = raw.toString("utf8");

var lines = s.split("\n");
for (var i = 0; i < lines.length; i++) {
  if (lines[i].indexOf("\t") !== -1) fail("tab on line " + (i + 1));
}

// ---------- the assets a page needs to be servable ----------

// These are the failure modes that make a committed static site silently broken:
// the page renders as unstyled text, or the filter and highlighting do nothing,
// and nothing in the repository notices.
function up(n) { return new Array(n + 1).join("../"); }

var REQUIRED = [
  { re: '<link rel="stylesheet" href="' + up(isIndex ? 1 : 2) + 'cheatsheets/cheatsheet.css">',
    what: "cheatsheet.css (tokens and layout)" },
  { re: '<link rel="stylesheet" href="' + up(isIndex ? 0 : 1) + 'guide.css">',
    what: "guide.css (long-form styles)" },
  { re: '<script src="' + up(isIndex ? 1 : 2) + 'cheatsheets/search.js"></script>',
    what: "search.js (filtering)" }
];

// The index has no chapters to spy on and no code blocks to highlight, so it
// loads neither script. Demanding them would be a false failure.
if (!isIndex) {
  REQUIRED.push({ re: '<script src="' + up(1) + 'toc.js"></script>',
                  what: "toc.js (scroll-spy)" });
  REQUIRED.push({ re: '<script src="' + up(2) + 'cheatsheets/highlight.js"></script>',
                  what: "highlight.js (syntax highlighting)" });
}

REQUIRED.forEach(function (r) {
  if (s.indexOf(r.re) === -1) fail("does not load " + r.what);
});

// ---------- heading structure ----------

// Exactly one `<h1>` per page, in the masthead. Later `# Part N — …` dividers
// are legitimately `<h1>` in the body — they mark real boundaries — so the check
// is that none of them *repeats the title*, not that there is only one h1.
var pageTitle = /<h1>([^<]*)<\/h1>/.exec(s);
if (!pageTitle) {
  fail("no <h1> in the masthead");
} else {
  var title = pageTitle[1].toLowerCase().replace(/&amp;/g, "&");
  var bodyStart = s.indexOf("<section");
  var bodyHtml = bodyStart === -1 ? "" : s.slice(bodyStart);
  var bodyH1 = /<h1[^>]*>([^<]*)<\/h1>/g;
  var bh;
  while ((bh = bodyH1.exec(bodyHtml))) {
    if (bh[1].toLowerCase().replace(/&amp;/g, "&") === title) {
      fail("the volume title is repeated as an <h1> in the body");
    }
  }
}

// ---------- navigation ----------

if (!/<a class="skip" href="#main">/.test(s)) fail("no skip link");
if (!/<main[^>]*id="main"/.test(s)) fail('no <main id="main"> for the skip link to target');
if (!/data-filter-input/.test(s)) fail("no filter input");
if (!/data-filter-target/.test(s)) fail("no filter targets");
if (!/data-filter-empty/.test(s)) fail("no empty state for the filter");

var idRe = /\sid="([^"]+)"/g;
var ids = {};
var m;
while ((m = idRe.exec(s))) {
  if (ids[m[1]]) fail('duplicate id "' + m[1] + '"');
  ids[m[1]] = true;
}

var hrefRe = /\shref="([^"]+)"/g;
while ((m = hrefRe.exec(s))) {
  var href = m[1];
  if (href.charAt(0) === "#") {
    if (!ids[href.slice(1)]) fail('href="' + href + '" resolves to no id');
    continue;
  }
  if (/^(https?:|mailto:|data:)/i.test(href)) continue;
  if (!fs.existsSync(path.resolve(path.dirname(PAGE), href.split("#")[0]))) {
    fail('href="' + href + '" resolves to no file');
  }
}

// ---------- the diagram guarantee ----------

// `highlight.js` selects `pre.snippet` only. A `text` fence must therefore be
// emitted as `pre.diagram` with no `data-lang`; if it ever carries one, the
// highlighter reaches into ASCII art and mangles the box-drawing characters.
var diagRe = /<pre class="diagram"([^>]*)>/g;
var diagrams = 0;
while ((m = diagRe.exec(s))) {
  diagrams++;
  if (/data-lang/.test(m[1])) {
    fail("pre.diagram carries data-lang and would be highlighted");
  }
}

// Every `.diagram` needs a `<code>` child with real content, or it is an empty
// box — a fence that lost its body.
var emptyDiagram = /<pre class="diagram"[^>]*><code><\/code><\/pre>/;
if (emptyDiagram.test(s)) fail("an empty pre.diagram — a fence lost its body");

// ---------- unparsed markdown ----------

// Stripped of code, because db-07 documents a markdown chapter template inside
// a ```markdown fence, and `- [Title](url)` there is preserved source rather
// than a link that failed to parse.
var markup = s.replace(/<code>[\s\S]*?<\/code>/g, "");
if (/\[[^\]\n]+\]\([^)\s]+\)/.test(markup)) {
  fail("an unparsed markdown link survives as text");
}
if (/&amp;(lt|gt|amp|quot);/.test(markup)) fail("double-escaped entity");

// ---------- report ----------

function count(re) { return (s.match(re) || []).length; }

console.log("=== " + path.relative(process.cwd(), PAGE) + " ===");
console.log("chapters " + count(/<section[\s>]/g) +
            " | questions " + count(/class="qa__q"/g) +
            " | diagrams " + diagrams +
            " | snippets " + count(/<pre class="snippet"/g) +
            " | tables " + count(/<table[\s>]/g) +
            " | callouts " + count(/<aside class="callout/g));
console.log("ids " + Object.keys(ids).length + " | bytes " + raw.length);
console.log("");

if (errs.length) {
  errs.forEach(function (e) { console.log("FAIL  " + e); });
  process.exit(1);
}
console.log("PASS - no errors");