/* The HTML shell: `<head>`, sidebar, masthead, toolbar and page footer.

   Everything here is a string template over the shared `cheatsheet.css`
   component vocabulary. Keeping it separate from `render.js` means the block
   renderers stay testable without a document around them.

   Zero dependencies. */

"use strict";

var inl = require("./inline.js");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// The sidebar lists every volume in the track, so a reader can move sideways
// without going back to the index.
function sidebar(opts) {
  var html = '<nav class="sidebar" aria-label="Contents">';
  html += "<h2>Chapters</h2>";
  html += '<ol class="toc">' + opts.tocHtml + "</ol>";

  html += "<h2>This volume</h2><ul>";
  html += '<li><a href="../index.html">All guides</a></li>';
  html += '<li><a href="../../' + esc(opts.sourcePath) + '">Markdown source</a></li>';
  if (opts.cheatsheetHref) {
    html += '<li><a href="../../cheatsheets/' + esc(opts.cheatsheetHref) + '">Cheatsheet</a></li>';
  }
  html += "</ul>";

  html += "<h2>Series</h2><ul>";
  opts.siblings.forEach(function (s) {
    var cur = s.href === opts.ownHref ? ' class="is-current"' : "";
    html += '<li><a' + cur + ' href="' + esc(s.href) + '">' + esc(s.label) + "</a></li>";
  });
  html += "</ul></nav>";

  return html;
}

function masthead(opts) {
  var fm = opts.frontMatter || {};
  var html = '<header class="masthead">';
  html += '<p class="masthead__eyebrow">' + esc(opts.trackLabel) + " &middot; " +
          esc(fm.series || "Deep-Dive") + "</p>";
  html += "<h1>" + esc(opts.title) + "</h1>";

  if (fm.subtitle) {
    html += '<p class="masthead__sub">' + inl.render(fm.subtitle) + "</p>";
  }

  html += '<ul class="masthead__meta">';
  html += "<li>" + opts.chapterCount + " chapters</li>";
  if (opts.qaCount) html += "<li>" + opts.qaCount + " questions</li>";
  if (opts.diagramCount) html += "<li>" + opts.diagramCount + " diagrams</li>";
  html += '<li>From <a href="../../' + esc(opts.sourcePath) + '">the source volume</a></li>';
  html += "</ul></header>";

  return html;
}

function toolbar(opts) {
  var html = '<div class="toolbar"><div class="search">';
  html += '<input type="search" data-filter-input placeholder="Filter chapters — press /" aria-label="Filter chapters">';
  html += '<span class="search__count" data-filter-count role="button" tabindex="0" title="Clear filter"></span>';
  html += "</div>";

  html += '<div class="pager">';
  if (opts.prev) html += '<a class="pager__prev" href="' + esc(opts.prev.href) + '">&larr; ' + esc(opts.prev.label) + "</a>";
  if (opts.next) html += '<a class="pager__next" href="' + esc(opts.next.href) + '">' + esc(opts.next.label) + " &rarr;</a>";
  html += "</div></div>";

  return html;
}

function pagefoot(opts) {
  var html = '<footer class="pagefoot"><div class="pager">';
  if (opts.prev) html += '<a class="pager__prev" href="' + esc(opts.prev.href) + '">&larr; ' + esc(opts.prev.label) + "</a>";
  if (opts.next) html += '<a class="pager__next" href="' + esc(opts.next.href) + '">' + esc(opts.next.label) + " &rarr;</a>";
  html += "</div>";
  html += "<span>The markdown volume remains the source of truth for this page.</span>";
  return html + "</footer>";
}

function document_(opts) {
  var fm = opts.frontMatter || {};
  var title = opts.title + " — " + opts.trackLabel + " Deep-Dive";

  var html = "<!DOCTYPE html>\n<html lang=\"en\">\n<head>\n";
  html += '<meta charset="utf-8">\n';
  html += '<meta name="viewport" content="width=device-width, initial-scale=1">\n';
  html += "<title>" + esc(title) + "</title>\n";
  html += '<meta name="description" content="' + esc(opts.description) + '">\n';
  html += '<link rel="stylesheet" href="../../cheatsheets/cheatsheet.css">\n';
  html += '<link rel="stylesheet" href="../guide.css">\n';
  html += "</head>\n<body>\n";
  html += '<a class="skip" href="#main">Skip to content</a>\n\n';
  html += '<div class="page">\n\n';
  html += sidebar(opts) + "\n\n";
  html += '<main class="main main--guide" id="main">\n\n';
  html += masthead(opts) + "\n\n";
  html += toolbar(opts) + "\n\n";
  html += '<p class="empty" data-filter-empty hidden>No chapter matches that filter.</p>\n\n';
  html += opts.body + "\n\n";
  html += pagefoot(opts) + "\n\n";
  html += "</main>\n</div>\n\n";
  html += '<script src="../../cheatsheets/search.js"></script>\n';
  html += '<script src="../toc.js"></script>\n';
  html += '<script src="../../cheatsheets/highlight.js"></script>\n';
  html += "</body>\n</html>\n";

  return html;
}

module.exports = {
  sidebar: sidebar,
  masthead: masthead,
  toolbar: toolbar,
  pagefoot: pagefoot,
  document: document_,
  esc: esc
};