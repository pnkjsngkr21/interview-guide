/* The guides index page.

   Generated rather than hand-authored, from the same volumes the pages come
   from, so a volume can never be listed here without being built, or built
   without being listed.

   Every number on the page is counted from the parsed volume — chapters,
   questions, diagrams — rather than typed in. The one piece of prose per
   volume is the volume's own `series` line from its front matter, which is the
   author's title for it.

   Zero dependencies. */

"use strict";

var esc = function (s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
};

// The two volumes whose front matter cannot supply a title.
//
//   java-01 has no front matter at all — it opens straight on a `# Part 1`
//   heading, having been authored before the convention existed.
//
//   java-09 declares `series: "FINAL VOLUME"`, which describes its position in
//   the series rather than its subject. Its filename says "modern-java-
//   production", so that is used instead.
//
// Both fall back to the filename, which for every other volume agrees with
// `series` anyway. Spelling these two out is the honest alternative to a
// general "looks wrong, drop it" heuristic.
var UNTITLED = {
  "java/1": "Java Basics",
  "java/9": "Modern Java & Production"
};

function titleFor(volume, frontMatter) {
  var key = volume.track + "/" + volume.order;
  if (UNTITLED[key]) return UNTITLED[key];
  if (frontMatter.series) return frontMatter.series;
  return volume.label;
}

// "N chapters · M questions · K diagrams" — omits a zero, and never renders an
// empty cell, because a volume with no diagrams should not claim zero.
function statsLine(s) {
  var parts = [];
  parts.push(s.chapters + (s.chapters === 1 ? " chapter" : " chapters"));
  if (s.qa) parts.push(s.qa + (s.qa === 1 ? " question" : " questions"));
  if (s.diagrams) parts.push(s.diagrams + (s.diagrams === 1 ? " diagram" : " diagrams"));
  return parts.join(" · ");
}

function volumeEntry(v, cheatsheet) {
  var html = '<div class="vol" data-filter-target>';
  html += '<span class="vol__num">' + esc(v.num) + "</span>";
  html += "<span>";

  // The source and cheatsheet links are siblings of the title link, not nested
  // inside it. `<a>` cannot contain `<a>`, and the browser's parser closes the
  // outer one at the inner tag, which would leave the source link swallowing the
  // rest of the row.
  //
  // Paths here are relative to `guides/index.html`, so they take one `..` —
  // unlike the volume pages, which sit a track directory deeper and take two.
  html += '<a class="vol__title" href="' + esc(v.track + "/" + v.outFile) + '">' +
          esc(v.title) + "</a>";
  html += '<a class="vol__src" href="../' + esc(v.sourcePath) + '">source</a>';
  html += '<span class="vol__hook">' + esc(statsLine(v.stats)) + "</span>";

  // The cheatsheet is the condensed form of exactly this volume, so listing it
  // beside the full one is the useful pairing rather than a cross-link.
  if (cheatsheet) {
    html += ' <a class="vol__src" href="../cheatsheets/' + esc(cheatsheet) +
            '">cheatsheet</a>';
  }
  html += "</span></div>";
  return html;
}

// Summed across a track's volumes, for the one line under the track heading.
function sumStats(volumes) {
  return volumes.reduce(function (a, v) {
    a.chapters += v.stats.chapters;
    a.qa += v.stats.qa;
    a.diagrams += v.stats.diagrams;
    return a;
  }, { chapters: 0, qa: 0, diagrams: 0 });
}

function trackSection(track) {
  var html = '<section class="track" id="' + esc(track.track) + '" data-filter-group>';
  html += '<div class="track__head"><h2>' + esc(track.label) + "</h2>";
  html += '<span class="track__count">' + track.volumes.length +
          (track.volumes.length === 1 ? " volume" : " volumes") + "</span></div>";
  html += '<p class="track__hook">' + esc(statsLine(sumStats(track.volumes))) + "</p>";

  track.volumes.forEach(function (v) {
    html += volumeEntry(v, v.cheatsheet);
  });

  return html + "</section>";
}

function build(opts) {
  var totals = opts.tracks.reduce(function (a, t) {
    a.volumes += t.volumes.length;
    a.chapters += t.volumes.reduce(function (s, v) { return s + v.stats.chapters; }, 0);
    a.qa += t.volumes.reduce(function (s, v) { return s + v.stats.qa; }, 0);
    a.diagrams += t.volumes.reduce(function (s, v) { return s + v.stats.diagrams; }, 0);
    return a;
  }, { volumes: 0, chapters: 0, qa: 0, diagrams: 0 });

  var html = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n";
  html += '<meta charset="utf-8">\n';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  html += "<title>Deep-Dive Guides — Interview Prep Guide</title>\n";
  html += '<meta name="description" content="The full deep-dive study volumes for Java, Spring, Database and Microservices, served as a static site.">\n';
  html += '<link rel="stylesheet" href="../cheatsheets/cheatsheet.css">\n';
  html += '<link rel="stylesheet" href="guide.css">\n';
  html += "</head>\n<body>\n";
  html += '<a class="skip" href="#main">Skip to content</a>\n\n';
  html += '<div class="page">\n\n';

  html += '<nav class="sidebar" aria-label="Contents">\n<h2>Tracks</h2>\n<ul>\n';
  opts.tracks.forEach(function (t) {
    html += '<li><a href="#' + esc(t.track) + '">' + esc(t.label) + "</a></li>";
  });
  html += "</ul>\n";
  html += "<h2>Repository</h2>\n<ul>\n";
  html += '<li><a href="../cheatsheets/index.html">Cheatsheets</a></li>\n';
  html += '<li><a href="../index.html">Study guide root</a></li>\n';
  html += '<li><a href="README.md">How this is built</a></li>\n';
  html += "</ul>\n</nav>\n\n";

  html += '<main class="main" id="main">\n\n';
  html += '<header class="masthead">\n';
  html += '<p class="masthead__eyebrow">Interview Prep Guide</p>\n';
  html += "<h1>Deep-Dive Guides</h1>\n";
  html += '<p class="masthead__sub">The full volumes, in full. Every chapter, every question and ' +
          "answer, every diagram — the material the " +
          '<a href="../cheatsheets/index.html">cheatsheets</a> were condensed from. ' +
          "Read these when you are learning a topic; keep a cheatsheet open when you are revising one.</p>\n";
  html += '<ul class="masthead__meta">\n';
  html += "<li>" + totals.volumes + " volumes across " + opts.tracks.length + " tracks</li>\n";
  html += "<li>" + totals.chapters + " chapters</li>\n";
  html += "<li>" + totals.qa + " interview questions</li>\n";
  html += "<li>" + totals.diagrams + " diagrams</li>\n";
  html += "</ul>\n</header>\n\n";

  html += '<div class="toolbar">\n<div class="search">\n';
  html += '<input type="search" data-filter-input placeholder="Filter by topic, concept or tool — press /" aria-label="Filter volumes">\n';
  html += '<span class="search__count" data-filter-count role="button" tabindex="0" title="Clear filter"></span>\n';
  html += "</div>\n</div>\n\n";

  html += '<p class="empty" data-filter-empty hidden>No volume matches that filter.</p>\n\n';

  opts.tracks.forEach(function (t) { html += trackSection(t); html += "\n\n"; });

  html += '<footer class="pagefoot">\n';
  html += "<span>Every volume page links back to its markdown source, which remains the source of truth.</span>\n";
  html += "</footer>\n\n</main>\n</div>\n\n";
  html += '<script src="../cheatsheets/search.js"></script>\n';
  html += "</body>\n</html>\n";

  return html;
}

module.exports = {
  build: build,
  titleFor: titleFor
};