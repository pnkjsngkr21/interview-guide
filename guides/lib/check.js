/* Build-time assertions.

   Parity alone would pass on a renderer that quietly dropped a chapter, because
   the counts would still agree with each other. These are the checks that catch
   silent corruption rather than visible miscounting:

   - word conservation: the whitespace-token stream of the source must equal the
     text-node stream of the page, per file, exactly;
   - code conservation: every code block must equal its source fence body
     character-for-character after entity decoding, which is the diagram guard;
   - structural integrity: balanced tags, unique ids, resolvable anchors, and no
     diagram carrying a language that would hand it to the highlighter.

   Zero dependencies. */

"use strict";

var fs = require("fs");
var path = require("path");
var r = require("./render.js");

var VOID = ["area", "base", "br", "col", "embed", "hr", "img", "input",
            "link", "meta", "param", "source", "track", "wbr"];

// The two checks the plan calls out as non-negotiable, plus the structural set.
// `chapters` is the parsed-and-split volume, needed for conservation; it is
// optional so the same checks can run against a bare page. `filePath` is where
// the page will live, needed to resolve relative hrefs against disk.
function page(name, html, chapters, filePath) {
  var problems = [];

  checkBalance(html, problems);
  checkUniqueIds(html, problems);
  checkAnchors(html, problems);
  checkDiagramIsolation(html, problems);
  checkHygiene(html, problems, name);
  if (filePath) checkLinks(html, filePath, problems);
  if (chapters) checkConservation(html, chapters, problems);

  return problems;
}

// ---------- relative links ----------

// The generated pages are committed and served as a static site, so a link that
// does not resolve is a dead end for every reader and nothing in a browser
// reports it. The volume pages sit two directories down (`guides/java/x.html`)
// and the index sits one (`guides/index.html`), so the depth has to come from
// the page's own path rather than being assumed.
function checkLinks(html, filePath, problems) {
  var dir = path.dirname(filePath);
  var re = /\shref="([^"]+)"/g;
  var m;

  while ((m = re.exec(html))) {
    var href = m[1];

    if (/^(https?:|mailto:|data:)/i.test(href)) continue;

    if (href.charAt(0) === "#") continue; // handled by checkAnchors

    var target = path.resolve(dir, href.split("#")[0]);
    if (!fs.existsSync(target)) {
      problems.push('href="' + href + '" resolves to no file');
    }
  }
}

// ---------- conservation ----------

// This is the check that matters most. Parity compares two counts, and a
// renderer that dropped an entire chapter would still pass parity as long as
// the source count dropped with it. Comparing the *text* of the source against
// the *text* of the page, word for word, cannot be satisfied by losing
// material: an unclosed blockquote that swallowed a chapter, a table absorbed
// into a paragraph, or a dropped fence all show up as a difference.
//
// The two sides are compared as an ordered sequence of chunks — prose and code
// interleaved in document order — rather than as two flat texts, because the
// code chunks are held to a stricter standard than the prose (exact character
// match) and must be lifted out before the prose tokens are counted.

function decode(s) {
  return s
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

// Turns markdown source text into the word stream the page will carry.
//
// Three normalisations, each matching something the renderer deliberately does
// rather than losing:
//   - `[label](url)` keeps only the label, because the url moves into an
//     attribute and never becomes visible text;
//   - a labelled callout's first paragraph is dropped entirely, because the
//     renderer retitles it (`INTERVIEW TRAP` → "Interview trap") and the label
//     span is excluded on the HTML side to match. The label's own presence is
//     covered by callout-count parity instead, so nothing is unchecked here —
//     this just keeps the wording out of a wording-exact comparison.
var LINK = /\[([^\]]*)\]\([^)\s]*\)/g;

function normalise(text) {
  return text.replace(LINK, "$1");
}

function words(s) {
  return s.match(/[A-Za-z0-9_$]+/g) || [];
}

// Walks the parsed block tree in the order the renderer will emit it.
function walk(blocks, out) {
  blocks.forEach(function (b) {
    switch (b.type) {
      case "code":
        out.push({ code: b.body.join("\n") });
        return;

      case "table":
        b.head.forEach(function (c) { out.push({ text: c }); });
        b.rows.forEach(function (row) {
          row.forEach(function (c) { out.push({ text: c }); });
        });
        return;

      case "list":
        b.items.forEach(function (it) {
          out.push({ text: it.text });
          (it.fences || []).forEach(function (f) {
            out.push({ code: f.body.join("\n") });
          });
          walk(it.children, out);
        });
        return;

      case "quote":
        // A callout consumes its first paragraph as the label; everything after
        // it renders in place.
        walk(r.calloutLabel(b.blocks) ? b.blocks.slice(1) : b.blocks, out);
        return;

      case "hr":
        // No text on either side; the element carries no words to conserve.
        return;

      default:
        out.push({ text: b.text });
    }
  });
  return out;
}

// The chapters, as `renderDocument` hands them over. Only these become body
// content — the front matter goes to the masthead and the first `# Part N`
// heading becomes the page title, both of which are chrome rather than prose.
function sourceChunks(chapters) {
  var out = [];
  chapters.forEach(function (ch) {
    if (ch.title) out.push({ text: ch.title });
    walk(ch.blocks, out);
  });
  return out;
}

// The prose of the rendered page: the region between the first chapter section
// and the last, which excludes the masthead, the toolbar and the page footer.
// Code is lifted out so it is not counted as prose here — it is compared
// separately and exactly.
function pageProse(html) {
  var main = /<main[^>]*>([\s\S]*?)<\/main>/.exec(html);
  if (!main) return "";
  var from = main[1].indexOf("<section");
  var to = main[1].lastIndexOf("</section>");
  if (from === -1 || to === -1) return "";
  return main[1].slice(from, to + "</section>".length);
}

function checkConservation(html, chapters, problems) {
  var chunks = sourceChunks(chapters);

  var srcText = [];
  var srcCode = [];
  chunks.forEach(function (c) {
    if (c.code !== undefined) srcCode.push(c.code);
    else srcText.push(normalise(c.text));
  });

  var body = pageProse(html)
    .replace(/<pre\b[\s\S]*?<\/pre>/g, " ")
    // The label span and the empty-answer placeholder are the only elements
    // whose text the renderer writes itself; both are excluded on the source
    // side above.
    .replace(/<span class="callout__label">[\s\S]*?<\/span>/g, " ")
    .replace(/<p class="qa__empty">[\s\S]*?<\/p>/g, " ");

  var outText = words(decode(body.replace(/<[^>]*>/g, " ")));

  var srcWords = words(srcText.join("\n"));
  if (srcWords.length !== outText.length) {
    problems.push("word conservation failed: source " + srcWords.length +
                  " words, page " + outText.length);
    return;
  }
  for (var i = 0; i < srcWords.length; i++) {
    if (srcWords[i] !== outText[i]) {
      problems.push("word " + (i + 1) + ' differs: source "' + srcWords[i] +
                    '", page "' + outText[i] + '"');
      return;
    }
  }

  checkCode(html, srcCode, problems);
}

// Every code block must equal its source fence body character-for-character
// after entity decoding. This is the diagram guard: a highlighter mangling one
// of the 711 ASCII diagrams, or a fence losing a line, fails here immediately.
function checkCode(html, srcCode, problems) {
  var re = /<pre class="(?:snippet|diagram)"[^>]*><code>([\s\S]*?)<\/code><\/pre>/g;
  var out = [];
  var m;
  while ((m = re.exec(html))) out.push(m[1]);

  if (out.length !== srcCode.length) {
    problems.push("code conservation failed: " + out.length + " blocks in page, " +
                  srcCode.length + " fences in source");
    return;
  }
  for (var i = 0; i < out.length; i++) {
    if (decode(out[i]) !== srcCode[i]) {
      problems.push("code block " + (i + 1) + " differs from its source fence");
      return;
    }
  }
}

// ---------- tags ----------

function checkBalance(html, problems) {
  var stack = [];
  var re = /<(\/?)([a-zA-Z][a-zA-Z0-9]*)\b[^>]*?(\/?)>/g;
  var m;

  while ((m = re.exec(html))) {
    var closing = m[1] === "/";
    var tag = m[2].toLowerCase();
    var selfClosing = m[3] === "/";

    if (VOID.indexOf(tag) !== -1 || selfClosing) continue;

    if (closing) {
      if (!stack.length) {
        problems.push("stray </" + tag + ">");
        continue;
      }
      var open = stack.pop();
      if (open !== tag) {
        problems.push("</" + tag + "> closes <" + open + ">");
        return;
      }
    } else {
      stack.push(tag);
    }
  }

  if (stack.length) problems.push("unclosed <" + stack[stack.length - 1] + ">");
}

// ---------- ids and anchors ----------

function checkUniqueIds(html, problems) {
  var ids = {};
  var re = /\sid="([^"]+)"/g;
  var m;
  while ((m = re.exec(html))) {
    if (ids[m[1]]) problems.push('duplicate id "' + m[1] + '"');
    ids[m[1]] = true;
  }
}

function checkAnchors(html, problems) {
  var ids = {};
  var re = /\sid="([^"]+)"/g;
  var m;
  while ((m = re.exec(html))) ids[m[1]] = true;

  var hrefs = /\shref="#([^"]+)"/g;
  while ((m = hrefs.exec(html))) {
    if (!ids[m[1]]) problems.push('href="#' + m[1] + '" resolves to no id');
  }
}

// ---------- the diagram guard ----------

// `highlight.js` selects `pre.snippet` only, so a diagram is safe as long as it
// is not a snippet and carries no language. This asserts that structurally
// rather than relying on anyone re-reading that file.
function checkDiagramIsolation(html, problems) {
  var re = /<pre class="diagram"([^>]*)>/g;
  var m;
  while ((m = re.exec(html))) {
    if (/data-lang/.test(m[1])) {
      problems.push("pre.diagram carries data-lang and would be highlighted");
    }
  }
}

// ---------- hygiene ----------

function checkHygiene(html, problems, name) {
  if (html.charCodeAt(0) === 0xfeff) problems.push("starts with a BOM");
  if (/\r/.test(html)) problems.push("contains CR");

  // Tabs, trailing whitespace and emoji are authoring-contract rules for markup
  // the renderer writes. Code blocks are excluded for all three, and not as a
  // loophole: several of the volume's ASCII diagrams carry trailing spaces and
  // the ⚠ / ❌ glyphs, and the `.md` files are read-only source of truth. These
  // checks are "the generated markup is clean", not "the corpus is clean".
  var markup = html.replace(/<code>[\s\S]*?<\/code>/g, "");

  if (/\t/.test(markup)) problems.push("contains a tab");
  if (/[ \t]+\n/.test(markup)) problems.push("has trailing whitespace in markup");

  var emoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;
  if (emoji.test(markup)) problems.push("contains an emoji in markup");

  // A markdown link that never got parsed would survive as literal text. Checked
  // against the markup only, for the same reason as above: db-07 documents the
  // chapter template inside a ```markdown fence and that template legitimately
  // contains `- [Title](url) — description` as the shape of a Further Reading
  // bullet. It is preserved source, not an unparsed link.
  if (/\[[^\]\n]+\]\([^)\s]+\)/.test(markup)) {
    problems.push("an unparsed markdown link survives as text");
  }
}

module.exports = {
  page: page
};