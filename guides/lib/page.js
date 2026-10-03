/* Page assembly: turns a parsed volume into a complete HTML document.

   Split from `render.js` because this is where document-level decisions live —
   which heading opens a chapter, what the sidebar lists, where the Q&A banks
   are cut — while `render.js` stays a set of block-level renderers that know
   nothing about pages.

   Zero dependencies. */

"use strict";

var inl = require("./inline.js");
var r = require("./render.js");

// ---------- splitting a volume into chapters ----------

// A chapter opens at `##`. Level 1 headings are part dividers and level 3+ are
// subsections; a volume whose front matter is absent (java-01) still lands
// every chapter here because `##` is used consistently across all 34 files.
function splitChapters(blocks) {
  var chapters = [];
  var current = null;

  blocks.forEach(function (b) {
    if (b.type === "heading" && b.level === 2) {
      current = { title: b.text, blocks: [] };
      chapters.push(current);
      return;
    }
    if (!current) {
      // Preamble before the first `##`: front matter rendered as an untitled
      // chapter so nothing is dropped.
      current = { title: null, blocks: [] };
      chapters.push(current);
    }
    current.blocks.push(b);
  });

  return chapters;
}

// ---------- the table of contents ----------

// Chapters are always listed. Their `N.M` subsections go in a collapsed
// `<details>` with a count, because a volume like database-03 has 57 and a flat
// list would be a wall in a 268px sidebar.
function buildToc(chapters) {
  var html = "";

  chapters.forEach(function (ch) {
    if (!ch.title) return;

    var subs = ch.blocks.filter(function (b) {
      return b.type === "heading" && b.level >= 3;
    });

    html += '<li><a href="#' + ch.id + '">' + r.esc(ch.title) + "</a>";
    if (subs.length) {
      html += '<details class="toc__more"><summary>' + subs.length +
              " section" + (subs.length === 1 ? "" : "s") + "</summary><ul>";
      subs.forEach(function (s) {
        html += '<li><a href="#' + s.id + '">' + r.esc(s.text) + "</a></li>";
      });
      html += "</ul></details>";
    }
    html += "</li>";
  });

  return html;
}

// ---------- a chapter ----------

// Q&A openers are pulled out of the block stream so each can claim the blocks
// until the next opener. They render in place rather than in a separate bank:
// in every volume they are interleaved with the prose that sets them up, so
// hoisting them would detach a question from the material it tests.
function renderChapter(ch) {
  var html = "";

  if (ch.title) {
    html += '<section id="' + ch.id + '" data-filter-target>';
    html += '<h2 class="vol__h2">' + inl.render(ch.title) + "</h2>";
  } else {
    html += '<section class="vol__preamble" data-filter-target>';
  }

  var blocks = ch.blocks;
  var i = 0;
  var letterOrder = [];
  var letterCounts = {};

  // Question numbers restart at 1 in every chapter — `**Q1.**` opens eleven
  // separate banks across a volume — so the id carries the chapter to stay
  // unique page-wide.
  var chapterKey = (ch.id || "preamble").replace(/^chapter-/, "");
  var seq = 0;

  while (i < blocks.length) {
    var b = blocks[i];

    if (b.type === "heading" && b.level >= 3) {
      html += r.renderHeading(b, b.id);
      i++;
      continue;
    }

    if (b.type === "para") {
      var qa = r.parseQa(b.text);
      if (qa) {
        // Claim everything up to the next opener or heading.
        var answer = [];
        var j = i + 1;
        while (j < blocks.length) {
          var nx = blocks[j];
          if (nx.type === "heading") break;
          if (nx.type === "para" && r.parseQa(nx.text)) break;
          answer.push(nx);
          j++;
        }
        seq++;
        html += r.renderQa(qa, answer, chapterKey + "-" + seq);
        if (letterCounts[qa.letter] === undefined) letterOrder.push(qa.letter);
        letterCounts[qa.letter] = (letterCounts[qa.letter] || 0) + 1;
        i = j;
        continue;
      }
    }

    html += r.renderBlock(b, 0, false);
    i++;
  }

  ch.qaLetters = letterOrder;
  ch.qaCounts = letterCounts;

  return html + "</section>";
}

// ---------- the document ----------

function renderDocument(opts) {
  var slug = r.makeSlugger();
  var fm = opts.frontMatter || {};
  var blocks = opts.blocks.slice();

  // The first level-1 heading is the volume title and becomes the page's `<h1>`,
  // not a section. java-01 has no front matter at all and opens straight on
  // `# Part 1 — Java Basics`, so the heading is the only title available there;
  // the other 33 declare `title` and the two agree.
  //
  // When front matter supplies the title, the body's copy of that heading is
  // still consumed rather than left in the flow. Left in, all 33 front-matter
  // volumes render the title twice — once in the masthead, once as a second
  // `<h1>` at the top of the content — because the masthead is built from
  // front matter alone and never looked at the body. The two are always equal,
  // so dropping the body's copy loses no text.
  var title = fm.title || null;
  var rest = [];
  var seenFirstH1 = false;

  // The body's first paragraph restates the front-matter subtitle — literally
  // `**Study & Interview Mastery Guide**` under a subtitle saying the same — in
  // all 33 volumes that have front matter. The masthead already shows it, so it
  // is consumed here too; left in, every volume renders its subtitle twice.
  //
  // The comparison is exact and emphasis-stripped. Measured across the corpus it
  // is 33 exact matches, 0 near-matches, 0 first paragraphs that are something
  // else — so a looser rule would be guessing at a case that does not exist.
  var subtitle = (fm.subtitle || "").trim();
  var consumedSubtitle = false;

  function isSubtitleEcho(b) {
    if (!subtitle || consumedSubtitle) return false;
    if (b.type !== "para") return false;
    var bare = b.text.replace(/\*\*/g, "").trim();
    if (bare !== subtitle) return false;
    consumedSubtitle = true;
    return true;
  }

  blocks.forEach(function (b) {
    if (b.type === "heading" && b.level === 1 && !seenFirstH1) {
      seenFirstH1 = true;
      if (!title) title = b.text; // no front matter: this heading *is* the title
      return; // consumed either way
    }
    if (isSubtitleEcho(b)) return;
    // Later part dividers stay in the flow — they mark a real boundary.
    rest.push(b);
  });

  var chapters = splitChapters(rest);

  // Ids are allocated in document order first, so the sidebar and the body
  // always agree — allocating them during rendering would let the sidebar drift.
  chapters.forEach(function (ch) {
    if (ch.title) ch.id = slug(ch.title);
    ch.blocks.forEach(function (b) {
      if (b.type === "heading" && b.level >= 3) b.id = slug(b.text);
    });
  });

  var body = chapters.map(function (ch) { return renderChapter(ch); }).join("\n\n");
  var toc = buildToc(chapters);

  return { title: title, chapters: chapters, body: body, tocHtml: toc };
}

module.exports = {
  splitChapters: splitChapters,
  buildToc: buildToc,
  renderChapter: renderChapter,
  renderDocument: renderDocument
};