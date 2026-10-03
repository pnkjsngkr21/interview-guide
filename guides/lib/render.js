/* Block renderers and page shell for the deep-dive volumes.

   The cheatsheet component vocabulary is reused rather than reinvented:
   `.callout--*`, `.page`/`.sidebar`/`.main`, `.masthead`, `.table-wrap`,
   `.section__head`, `pre.snippet`, `.pager`, `.skip`. Every selector emitted
   here already exists in `cheatsheet.css` except the long-form ones, which live
   in `guide.css`.

   Zero dependencies. */

"use strict";

var inl = require("./inline.js");

function esc(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// ---------- anchors ----------

// Ids are document-global and the corpus collides freely — every one of the 34
// files repeats at least two headings — so slugs are deduplicated page-wide.
function slugify(text) {
  return String(text)
    .replace(/`/g, "")
    .replace(/&/g, " and ")
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

function makeSlugger() {
  var seen = {};
  return function (text) {
    var base = slugify(text) || "section";
    if (!seen[base]) { seen[base] = 1; return base; }
    seen[base]++;
    return base + "-" + seen[base];
  };
}

// ---------- leaf blocks ----------

// `highlight.js` selects `pre.snippet` only, which is what keeps the 711 ASCII
// diagrams from being tokenised. A diagram therefore gets `pre.diagram` and no
// `data-lang`, and check.js fails the build if that ever stops being true.
function renderCode(block) {
  var body = esc(block.body.join("\n"));
  if (block.lang === "text") return '<pre class="diagram"><code>' + body + "</code></pre>";
  var lang = block.lang ? ' data-lang="' + esc(block.lang) + '"' : "";
  return '<pre class="snippet"' + lang + "><code>" + body + "</code></pre>";
}

function renderTable(block) {
  var html = '<div class="table-wrap"><table><thead><tr>';
  block.head.forEach(function (c) { html += "<th>" + inl.render(c.trim()) + "</th>"; });
  html += "</tr></thead><tbody>";
  block.rows.forEach(function (row) {
    html += "<tr>";
    row.forEach(function (c) { html += "<td>" + inl.render(c.trim()) + "</td>"; });
    html += "</tr>";
  });
  return html + "</tbody></table></div>";
}

function renderItem(item) {
  var html = "<li>" + inl.render(item.text);
  (item.fences || []).forEach(function (f) { html += renderCode(f); });
  if (item.children && item.children.length) {
    html += "<ul>";
    item.children.forEach(function (c) { html += renderItem(c); });
    html += "</ul>";
  }
  return html + "</li>";
}

function renderList(block) {
  var tag = block.ordered ? "ol" : "ul";
  var html = "<" + tag + ">";
  block.items.forEach(function (it) { html += renderItem(it); });
  return html + "</" + tag + ">";
}

// ---------- callouts ----------

// A blockquote is a callout iff its first line is `**LABEL**` with the label
// already upper case. Measured: 988 labelled, 3,651 plain. The two production
// labels merge deliberately — `PRODUCTION RELEVANCE` and `PRODUCTION SCENARIO`
// do the same rhetorical job, and separate colours would imply a distinction
// the author never drew.
var CALLOUT_CLASS = {
  "INTERVIEW TRAP": "trap",
  "MUST REMEMBER": "must",
  "SCALING REALITY CHECK": "scale",
  "TRADE-OFF": "tradeoff",
  "PRODUCTION RELEVANCE": "prod",
  "PRODUCTION SCENARIO": "prod",
  "STAFF-LEVEL CONSIDERATION": "staff",
  "INTERVIEW SCENARIO": "prod"
};

var CALLOUT_TITLE = {
  trap: "Interview trap",
  must: "Must remember",
  scale: "Scaling reality check",
  tradeoff: "Trade-off",
  prod: "In production",
  staff: "Staff-level",
  summary: "Chapter summary"
};

function calloutLabel(blocks) {
  var first = blocks[0];
  if (!first || first.type !== "para") return null;

  var m = /^\*\*([^*]+)\*\*(.*)$/.exec(first.text.trim());
  if (!m) return null;

  var label = m[1].trim();
  if (label !== label.toUpperCase()) return null;

  // `CHAPTER 3 SUMMARY` carries a numeral, so it matches by pattern while the
  // rest match by exact label.
  if (/^CHAPTER \d+ SUMMARY$/.test(label)) return { label: label, modifier: "summary", rest: m[2].trim() };

  var mod = CALLOUT_CLASS[label];
  if (!mod) return null;
  return { label: label, modifier: mod, rest: m[2].trim() };
}

// Label and claim sometimes share a line (`**TRADE-OFF — "…"**`). The label
// element carries both, which is what the cheatsheets do.
function renderCallout(quote, depth) {
  var info = calloutLabel(quote.blocks);
  if (!info) return null;

  var html = '<aside class="callout callout--' + info.modifier + '">';
  var subtitle = info.rest.replace(/^[—–-]\s*/, "");
  html += '<span class="callout__label">' + esc(CALLOUT_TITLE[info.modifier] || info.label);
  if (subtitle) html += " &mdash; " + inl.render(subtitle);
  html += "</span>";

  // The bold run that carried the label is consumed above. If the label and the
  // claim shared that one line there is nothing left to render.
  var rest = quote.blocks.slice(1);
  rest.forEach(function (b) { html += renderBlock(b, depth + 1); });
  return html + "</aside>";
}

// ---------- blockquotes ----------

// Plain quotes are the majority case. They carry no chrome inside a Q&A answer,
// where `.qa__a` already supplies the left rule — 3,387 of the 4,639 regions
// are answers, and tinting all of them would turn a volume into a wall of
// colour.
function renderQuote(block, depth, inAnswer) {
  var callout = renderCallout(block, depth);
  if (callout) return callout;

  var inner = block.blocks.map(function (b) { return renderBlock(b, depth + 1, true); }).join("\n");

  if (inAnswer) return inner;
  var cls = depth > 0 ? "note note--nested" : "note";
  return '<blockquote class="' + cls + '">' + inner + "</blockquote>";
}

// ---------- dispatch ----------

function renderBlock(block, depth, inAnswer) {
  depth = depth || 0;

  switch (block.type) {
    case "code": return renderCode(block);
    case "table": return renderTable(block);
    case "list": return renderList(block);
    case "para":
      if (block.kind === "banner") return '<p class="banner">' + inl.render(block.text) + "</p>";
      return "<p>" + inl.render(block.text) + "</p>";
    case "quote": return renderQuote(block, depth, inAnswer);
    case "hr": return "<hr>";
    case "heading": return renderHeading(block, slugify(block.text));
    case "bridge": return '<p class="bridge">' + inl.render(block.text) + "</p>";
    default: return "";
  }
}

function renderHeading(block, id) {
  var level = Math.min(block.level, 4);
  return '<h' + level + ' class="vol__h' + level + '" id="' + id + '">' +
         inl.render(block.text) + "</h" + level + ">";
}

// ---------- the Q&A items ----------

// A bold-led opener: `**P12. question** \`TRICKY\``. 6,160 of these across the
// corpus, and 1,549 (25%) hard-wrap, so the renderer accumulates forward until
// the closing `**` — but that accumulation belongs to the block parser, which
// has already joined the wrapped lines. Here the whole opener is one paragraph.
var QA_OPEN = /^\*\*([A-Z]{1,2})(\d{1,3})\.\s/;

function parseQa(text) {
  var m = QA_OPEN.exec(text);
  if (!m) return null;

  var close = text.indexOf("**", m[0].length);
  if (close === -1) return null;

  return {
    letter: m[1],
    num: m[2],
    id: "qa-" + m[1].toLowerCase() + m[2],
    question: text.slice(m[0].length, close).trim(),
    badges: text.slice(close + 2).trim()
  };
}

// An opener claims every block until the next opener or heading. Measured: 3,387
// answers are a blockquote and 2,759 are plain paragraphs, and the wrapper makes
// the second kind legible without branching on style.
function renderQa(qa, answerBlocks, id) {
  var anchor = id || qa.id;
  var html = '<article class="qa" id="' + anchor + '">';
  html += '<p class="qa__q"><a class="qa__num" href="#' + anchor + '">' +
          qa.letter + qa.num + "</a> " + inl.render(qa.question);
  if (qa.badges) html += ' <span class="qa__badge">' + inl.render(qa.badges) + "</span>";
  html += "</p>";

  html += '<div class="qa__a">';
  if (!answerBlocks.length) html += '<p class="qa__empty">See the chapter above.</p>';
  answerBlocks.forEach(function (b) { html += renderBlock(b, 0, true); });
  return html + "</div></article>";
}

module.exports = {
  esc: esc,
  slugify: slugify,
  makeSlugger: makeSlugger,
  renderBlock: renderBlock,
  renderCode: renderCode,
  renderTable: renderTable,
  renderList: renderList,
  renderCallout: renderCallout,
  renderQuote: renderQuote,
  calloutLabel: calloutLabel,
  renderHeading: renderHeading,
  parseQa: parseQa,
  renderQa: renderQa,
  QA_OPEN: QA_OPEN,
  CALLOUT_CLASS: CALLOUT_CLASS,
  CALLOUT_TITLE: CALLOUT_TITLE
};