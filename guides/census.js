/* Census check: parse every volume and compare the block counts against the
   figures measured directly from the corpus. Run: node guides/census.js */

"use strict";

var fs = require("fs");
var path = require("path");
var md = require("./lib/markdown.js");

var ROOT = path.join(__dirname, "..");
var TRACKS = ["java", "spring", "database", "microservices"];

var files = [];
TRACKS.forEach(function (track) {
  fs.readdirSync(path.join(ROOT, track)).forEach(function (f) {
    if (f.endsWith(".md") && !f.includes("README")) files.push(track + "/" + f);
  });
});

// Every block the parser can emit, walked recursively so quotes and nested
// lists contribute to the same totals the renderer will see.
function walk(blocks, fn) {
  blocks.forEach(function (b) {
    fn(b);
    if (b.blocks) walk(b.blocks, fn);
    if (b.items) b.items.forEach(function (it) { fn(it); });
  });
}

// Counts read straight off the source text. It recurses into quote bodies for
// the same reason the parser does — a fence or heading inside a blockquote is
// still a fence or heading — so the two sides of the comparison are like-for-
// like rather than parser-vs-parser.
var FENCE = /^(\s*)(`{3,}|~{3,})[ \t]*(.*)$/;

function sourceCounts(lines, c) {
  var mask = md.maskFences(lines).mask;
  var i = 0;

  while (i < lines.length) {
    var rest = md.quoteDepth(lines[i]).rest;

    if (mask[i]) {
      var fm = FENCE.exec(rest);
      if (fm) {
        // Count the opening delimiter, then step past the whole block.
        c.fenceOpens++;
        if (fm[3].trim() === "text") c.textFences++;
        var ch = fm[2].charAt(0), len = fm[2].length, j = i + 1;
        while (j < lines.length) {
          var jm = FENCE.exec(md.quoteDepth(lines[j]).rest);
          if (jm && jm[2].charAt(0) === ch && jm[2].length >= len && jm[3].trim() === "") break;
          j++;
        }
        i = j + 1;
        continue;
      }
      i++;
      continue;
    }

    if (md.quoteDepth(lines[i]).depth > 0) {
      // A region is a run of quoted lines; a run of bare `>` markers carries no
      // content and is a source artifact, not a blockquote (db-03 has six).
      var b = [], k = i;
      while (k < lines.length && (md.quoteDepth(lines[k]).depth > 0 || /^(>\s*)+$/.test(lines[k]))) {
        b.push(md.quoteDepth(lines[k]).rest);
        k++;
      }
      while (b.length && b[b.length - 1].trim() === "") b.pop();
      if (b.some(function (x) { return x.trim() !== ""; })) {
        c.quotes++;
        sourceCounts(b, c);
      }
      i = k;
      continue;
    }

    if (/^\s*\|/.test(rest) &&
        i + 1 < lines.length && !mask[i + 1] &&
        /^\s*\|[\s:|-]+\|\s*$/.test(md.quoteDepth(lines[i + 1]).rest)) c.tables++;
    if (/^#{1,6}\s/.test(rest)) c.headings++;
    if (/^\*\*[A-Z]{1,2}\d{1,3}\.\s/.test(rest)) c.qa++;
    i++;
  }
  return c;
}

var src = { fenceOpens: 0, textFences: 0, tables: 0, quotes: 0, headings: 0, qa: 0 };
var got = { headings: 0, bridges: 0, codes: 0, textCodes: 0, tables: 0, quotes: 0, lists: 0, paras: 0, banners: 0, qa: 0 };
var joins = 0, joinPairs = 0;
var langs = {};
var problems = [];
var failures = 0;

function check(label, expected, actual) {
  var ok = expected === actual;
  if (!ok) failures++;
  console.log("  " + (ok ? "ok  " : "FAIL") + "  " + label + "  " + expected + (ok ? "" : "  (parsed " + actual + ")"));
  return ok;
}

files.forEach(function (rel) {
  var raw = fs.readFileSync(path.join(ROOT, rel), "utf8");
  var doc = md.parse(raw);
  if (doc.unclosedFence) problems.push(rel + ": unclosed fence");

  var lines = raw.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  var body = lines.slice(md.parseFrontMatter(lines).bodyStart);

  var sc = sourceCounts(body, src);

  // Join accounting. This must recurse into quote bodies exactly as parseLines
  // does, because a heading inside a blockquote is resolved by a nested call.
  (function scan(ls) {
    var mask = md.maskFences(ls).mask;
    md.resolveHeadings(ls, mask).forEach(function (h) {
      if (h.absorbed > 0) { joinPairs++; joins += h.absorbed; }
    });

    var i = 0;
    while (i < ls.length) {
      if (mask[i]) { i++; continue; }
      if (md.quoteDepth(ls[i]).depth > 0) {
        var b = [];
        while (i < ls.length && (md.quoteDepth(ls[i]).depth > 0 || /^(>\s*)+$/.test(ls[i]))) {
          b.push(md.quoteDepth(ls[i]).rest);
          i++;
        }
        while (b.length && b[b.length - 1].trim() === "") b.pop();
        if (b.length) scan(b);
        continue;
      }
      i++;
    }
  })(body);

  var qaInDoc = 0;
  walk(doc.blocks, function (b) {
    if (b.type === "heading") got.headings++;
    else if (b.type === "bridge") got.bridges++;
    else if (b.type === "code") {
      got.codes++;
      if (b.lang === "text") got.textCodes++;
      langs[b.lang || "(none)"] = (langs[b.lang] || 0) + 1;
    } else if (b.type === "table") got.tables++;
    else if (b.type === "quote") got.quotes++;
    else if (b.type === "list") got.lists++;
    else if (b.kind === "banner") got.banners++;
    else if (b.type === "para") {
      got.paras++;
      if (/^\*\*[A-Z]{1,2}\d{1,3}\.\s/.test(b.text)) qaInDoc++;
    }
    // A list item's own indented fences are separate code blocks; the plan's
    // 1,878 figure counts every fence opening in the corpus, wherever it sits.
    if (b.fences) b.fences.forEach(function (f) {
      got.codes++;
      if (f.lang === "text") got.textCodes++;
      langs[f.lang || "(none)"] = (langs[f.lang] || 0) + 1;
    });
  });
  got.qa += qaInDoc;
});

console.log("files:", files.length);
console.log("");
console.log("PARITY  (source count vs emitted count)");
check("heading lines", src.headings, got.headings + got.bridges + joins);
check("  of which join pairs", 31, joinPairs);
check("  of which bridge notes", 17, got.bridges);
check("tables", src.tables, got.tables);
check("quote regions", src.quotes, got.quotes);
check("fence openings", src.fenceOpens, got.codes);
check("Q&A openers", src.qa, got.qa);
check("text diagrams", src.textFences, got.textCodes);
check("banners", 32, got.banners);
console.log("");
console.log("SHAPE");
console.log("  headings / bridges     ", got.headings, "/", got.bridges);
console.log("  code blocks            ", got.codes, " of which text diagrams", got.textCodes);
console.log("  tables / quotes        ", got.tables, "/", got.quotes);
console.log("  lists / paras / banners", got.lists, "/", got.paras, "/", got.banners);
console.log("");
console.log("LANGUAGES", JSON.stringify(langs, null, 1));
console.log("");
if (problems.length) {
  console.log("PROBLEMS:");
  problems.forEach(function (p) { console.log("  " + p); });
}
if (failures) {
  console.log(failures + " parity failure(s)");
  process.exitCode = 1;
} else {
  console.log("all parity checks pass");
}