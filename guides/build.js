/* Build the static guide site from the markdown volumes.

   The `.md` files stay the source of truth and are never written to. This
   script only reads them and writes `.html` under `guides/`, so the site is
   servable straight from a clone with no tooling at all.

   Run:  node guides/build.js          write pages and assert
         node guides/build.js --check  assert against the committed HTML only

   Zero dependencies. */

"use strict";

var fs = require("fs");
var path = require("path");

var md = require("./lib/markdown.js");
var page = require("./lib/page.js");
var shell = require("./lib/shell.js");
var check = require("./lib/check.js");
var index = require("./lib/index.js");

var ROOT = path.join(__dirname, "..");
var OUT = __dirname;

var TRACKS = ["java", "spring", "database", "microservices"];

var TRACK_LABEL = {
  java: "Java",
  spring: "Spring",
  database: "Database",
  microservices: "Microservices"
};

// The volume filename is fixed at authoring time and never renumbered. The
// output name drops the `deep-dive-volume-` infix and keeps everything else, so
// the mapping back to the source is obvious in both directions. These match the
// names the cheatsheets already use, which is what lets a volume page link
// across to its cheatsheet.
function collect() {
  var tracks = [];
  var problems = [];

  TRACKS.forEach(function (track) {
    var dir = path.join(ROOT, track);
    var names = fs.readdirSync(dir).filter(function (f) {
      return f.endsWith(".md") && !f.includes("README");
    }).sort();

    var volumes = names.map(function (name) {
      var base = name
        .replace(/\.md$/, "")
        .replace(/-deep-dive-volume-/, "-");
      var n = /^(\d+)/.exec(base);
      return {
        track: track,
        sourceFile: name,
        sourcePath: track + "/" + name,
        // `{NN}-{slug}.md` → `{NN}-{slug}.html`; the java-09 volume is named
        // `...volume-09-final-volume.md`, which keeps its `final-volume` tail
        // rather than inventing a title the author did not use.
        outFile: base + ".html",
        outPath: track + "/" + base + ".html",
        order: n ? parseInt(n[1], 10) : 0,
        label: base.replace(/^\d+-/, "").replace(/-/g, " ")
      };
    });

    volumes.forEach(function (v, i) {
      v.prev = i > 0 ? volumes[i - 1] : null;
      v.next = i < volumes.length - 1 ? volumes[i + 1] : null;
      v.ownHref = v.outFile;
    });

    tracks.push({ track: track, label: TRACK_LABEL[track], volumes: volumes });
  });

  return { tracks: tracks, problems: problems };
}

// A page-level description for the `<meta>` tag. The front matter carries a
// subtitle for most volumes, but java-01 has no front matter at all, so the
// first chapter title stands in. This is metadata only — it must never be
// invented prose.
function description(volume, doc) {
  var fm = doc.frontMatter || {};
  if (fm.subtitle) return fm.subtitle;
  var first = doc.blocks.filter(function (b) { return b.type === "heading" && b.level === 2; })[0];
  return first ? first.text : volume.label;
}

function buildOne(volume, track, siblings) {
  var raw = fs.readFileSync(path.join(ROOT, volume.sourcePath), "utf8");
  var doc = md.parse(raw);
  var out = page.renderDocument({ blocks: doc.blocks, frontMatter: doc.frontMatter });

  var qaCount = 0, diagramCount = 0;
  (function walk(bs) {
    bs.forEach(function (b) {
      if (b.type === "code" && b.lang === "text") diagramCount++;
      if (b.blocks) walk(b.blocks);
      if (b.items) b.items.forEach(function (it) { (it.fences || []).forEach(function (f) { if (f.lang === "text") diagramCount++; }); });
    });
  })(doc.blocks);

  out.chapters.forEach(function (ch) {
    if (ch.qaCounts) Object.keys(ch.qaCounts).forEach(function (l) { qaCount += ch.qaCounts[l]; });
  });

  volume.stats = {
    chapters: out.chapters.filter(function (c) { return c.title; }).length,
    qa: qaCount,
    diagrams: diagramCount
  };
  volume.title = index.titleFor(volume, doc.frontMatter);
  volume.num = volume.order < 10 ? "0" + volume.order : String(volume.order);
  volume.cheatsheet = cheatsheetHref(volume);

  return {
    html: shell.document({
      title: out.title || volume.label,
      trackLabel: track.label + " — " + (doc.frontMatter.series || "Deep-Dive"),
      frontMatter: doc.frontMatter,
      description: description(volume, doc),
      sourcePath: volume.sourcePath,
      cheatsheetHref: cheatsheetHref(volume),
      tocHtml: out.tocHtml,
      body: out.body,
      chapterCount: out.chapters.filter(function (c) { return c.title; }).length,
      qaCount: qaCount,
      diagramCount: diagramCount,
      siblings: siblings,
      ownHref: volume.ownHref,
      prev: volume.prev ? { href: volume.prev.outFile, label: volume.prev.label } : null,
      next: volume.next ? { href: volume.next.outFile, label: volume.next.label } : null
    }),
    // Handed to the assertions so conservation compares against the same
    // parsed tree the page was rendered from.
    chapters: out.chapters
  };
}

// Each volume has a cheatsheet with a matching numeric prefix but not always a
// matching slug, so the link is resolved against what is actually on disk
// rather than assumed.
var cheatsheetIndex = null;

function loadCheatsheets() {
  if (cheatsheetIndex) return cheatsheetIndex;
  cheatsheetIndex = {};
  var dir = path.join(ROOT, "cheatsheets");
  TRACKS.forEach(function (track) {
    var d = path.join(dir, track);
    if (!fs.existsSync(d)) return;
    fs.readdirSync(d).filter(function (f) { return f.endsWith(".html"); }).forEach(function (f) {
      var n = /^(\d+)-/.exec(f);
      if (n) cheatsheetIndex[track + "/" + n[1]] = track + "/" + f;
    });
  });
  return cheatsheetIndex;
}

function cheatsheetHref(volume) {
  var idx = loadCheatsheets();
  return idx[volume.track + "/" + volume.order] || null;
}

function main() {
  var checkOnly = process.argv.indexOf("--check") !== -1;
  var catalogue = collect();
  var written = 0;
  var failures = [];

  catalogue.tracks.forEach(function (track) {
    var siblings = track.volumes.map(function (v) {
      return { href: v.outFile, label: v.label };
    });

    track.volumes.forEach(function (volume) {
      var built = buildOne(volume, track, siblings);
      var target = path.join(OUT, volume.outPath);

      if (!checkOnly) {
        var dir = path.dirname(target);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(target, built.html, "utf8");
      } else if (!fs.existsSync(target)) {
        failures.push(volume.outPath + ": not built");
        return;
      } else if (fs.readFileSync(target, "utf8") !== built.html) {
        // Without this, `--check` would report success on a stale page — it
        // would only be validating the freshly-rendered string against the
        // sources, never the file a reader actually opens. A hand-edit or a
        // missed rebuild has to fail here, or the flag is decoration.
        failures.push(volume.outPath + ": on disk differs from what this build produces");
      }

      var problems = check.page(volume.outPath, built.html, built.chapters, target);
      problems.forEach(function (p) { failures.push(volume.outPath + ": " + p); });
      written++;
    });
  });

  console.log("built " + written + " pages" + (checkOnly ? " (check only)" : ""));

  // The index is generated from the same pass, so a volume cannot be built
  // without being listed. Its title comes from front matter, which `buildOne`
  // resolved as it went.
  var indexHtml = index.build({ tracks: catalogue.tracks });
  var indexTarget = path.join(OUT, "index.html");

  if (!checkOnly) {
    fs.writeFileSync(indexTarget, indexHtml, "utf8");
  } else if (!fs.existsSync(indexTarget)) {
    failures.push("index.html: not built");
  } else {
    var stale = fs.readFileSync(indexTarget, "utf8") !== indexHtml;
    if (stale) failures.push("index.html: on disk differs from what this build produces");
  }

  var indexProblems = check.page("guides/index.html", indexHtml, null, indexTarget);
  indexProblems.forEach(function (p) { failures.push("index.html: " + p); });

  if (failures.length) {
    console.log("");
    console.log(failures.length + " problem(s):");
    failures.slice(0, 40).forEach(function (f) { console.log("  " + f); });
    if (failures.length > 40) console.log("  ... and " + (failures.length - 40) + " more");
    process.exitCode = 1;
  }
}

main();