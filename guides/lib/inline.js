/* Inline span parser for the deep-dive volumes.

   The order here is load-bearing, not stylistic. Code spans are lifted out to
   sentinels before anything else touches the text, because the corpus puts
   literal `<` and `&` inside them — `new List<String>[10]`, `&&`,
   `count & (bucket - 1)` — and escaping first would corrupt them into
   `&lt;`/`&amp;` mid-span, which is both visible and irreversible.

   Zero dependencies. Emits HTML. */

"use strict";

// A sentinel must survive the escaping pass untouched and cannot be typed by
// the author. These are Private Use Area codepoints, which never appear in the
// corpus (the check.js allowlist covers the printable range only).
var SPAN_OPEN = "";
var SPAN_CLOSE = "";

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Pass 1 — lift every `code` span out of the text, verbatim and unescaped.
function extractCodeSpans(text, spans) {
  var out = "";
  var i = 0;

  while (i < text.length) {
    if (text.charAt(i) !== "`") {
      out += text.charAt(i);
      i++;
      continue;
    }

    // Count the opening run. A run of N backticks closes on the next run of
    // exactly N, which is what CommonMark specifies and what keeps
    // ``` inside a span from terminating it.
    var run = 0;
    while (text.charAt(i + run) === "`") run++;
    var fence = text.substr(i, run);
    var close = text.indexOf(fence, i + run);

    // No matching closer: the backticks are literal text, not a span.
    if (close === -1) {
      out += fence;
      i += run;
      continue;
    }

    var inner = text.slice(i + run, close);
    spans.push(inner);
    out += SPAN_OPEN + (spans.length - 1) + SPAN_CLOSE;
    i = close + run;
  }

  return out;
}

// Pass 3 — links. Applied to already-escaped text, so a URL's `&` is already
// `&amp;`; that is what belongs in an href and the browser decodes it.
var LINK = /\[([^\]]*)\]\(([^)\s]*)\)/g;

function applyLinks(escaped) {
  return escaped.replace(LINK, function (whole, label, href) {
    // A rejected target must leave the text intact rather than half-consumed:
    // `[^)\s]*` stops at the first `)`, so `[x](javascript:alert(1))` would come
    // back as `x)` and lose a character. Returning `whole` keeps the source
    // text exactly as written, which is the honest outcome for a link that was
    // never a link.
    if (/^\s*javascript:/i.test(href)) return whole;

    // A bare anchor stays in-page; anything else is treated as external and
    // gets the usual hardening. The corpus has no `javascript:` URLs, but the
    // generated pages are committed and served as a static site, so the check
    // costs nothing and keeps a hostile edit from becoming an XSS vector.
    var external = !/^#/.test(href);
    var attrs = ' href="' + href + '"';
    if (external) attrs += ' rel="noopener noreferrer"';
    return "<a" + attrs + ">" + label + "</a>";
  });
}

// Pass 4/5 — strong, then emphasis.
//
// Both operate on escaped text, and code spans have already been lifted to
// sentinels, so a `*` inside `COUNT(*)` or `allowedOrigins("*")` is never in
// play here — the corpus is full of those and they are all already safe.
//
// The one place the two interact is nested emphasis: `**70% of the CPU
// *request***` closes the strong run at the first `**`, which is the `*` that
// opens the inner italic plus the first of its two closing marks. Left alone
// that yields `<strong>… <em>request</strong></em>` and an unbalanced document.
// So the closing delimiter of a strong run must not be a run that also closes an
// italic opened inside it: `***` at the end is treated as the italic's `*`
// followed by the strong's `**`.
function applyBold(escaped) {
  return escaped.replace(/\*\*(.+?)\*\*\*/g, function (whole, inner) {
    // Triple close: the innermost `*` closes an italic, the outer two the strong.
    return "<strong>" + inner + "*</strong>";
  }).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function applyItalic(escaped) {
  return escaped.replace(/\*([^*\n]+?)\*/g, "<em>$1</em>");
}

// `_`-emphasis is deliberately absent. 4,131 lines in the corpus carry
// `snake_case` identifiers, and there is not one `_emphasis_` in the set, so
// enabling it would italicise identifiers and nothing else.

// Pass 6 — restore the code spans, escaping their contents as *text*. A span
// body may legitimately contain markup characters and also genuine inline
// markup: the corpus writes `**\`foo\`**`, and the span inside must come back
// escaped rather than interpreted.
function restoreCodeSpans(escaped, spans) {
  var out = "";
  var i = 0;

  while (i < escaped.length) {
    var at = escaped.indexOf(SPAN_OPEN, i);
    if (at === -1) {
      out += escaped.slice(i);
      break;
    }

    var end = escaped.indexOf(SPAN_CLOSE, at);
    out += escaped.slice(i, at);
    var idx = parseInt(escaped.slice(at + SPAN_OPEN.length, end), 10);
    out += "<code>" + escapeHtml(spans[idx]) + "</code>";
    i = end + SPAN_CLOSE.length;
  }

  return out;
}

function render(text) {
  var spans = [];
  var working = extractCodeSpans(text, spans);
  working = escapeHtml(working);
  working = applyLinks(working);
  working = applyBold(working);
  working = applyItalic(working);
  return restoreCodeSpans(working, spans);
}

module.exports = {
  render: render,
  escapeHtml: escapeHtml
};