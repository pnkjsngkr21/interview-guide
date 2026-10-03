/* Markdown block parser for the deep-dive volumes.
   Fence-aware, quote-aware, and aware of the repository's own conventions:
   wrapped headings, blockquote callouts, and bold-led interview Q&A.

   Zero dependencies. Returns a block list; nothing here emits HTML. */

"use strict";

// ---------- Front matter ----------

// Only `key: value` pairs, values optionally quoted. The corpus carries no
// nested maps, lists, or multi-line scalars, so this stays deliberately small.
function parseFrontMatter(lines) {
  if (lines[0] !== "---") {
    return { data: {}, bodyStart: 0 };
  }

  const data = {};
  let i = 1;

  while (i < lines.length && lines[i] !== "---") {
    const line = lines[i];
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(line);
    if (m) {
      let value = m[2].trim();
      if (
        value.length >= 2 &&
        value.charAt(0) === '"' &&
        value.charAt(value.length - 1) === '"'
      ) {
        value = value.slice(1, -1);
      }
      data[m[1]] = value;
    }
    i++;
  }

  // Skip a blank line after the closing fence.
  let bodyStart = i + 1;
  while (bodyStart < lines.length && lines[bodyStart].trim() === "") {
    bodyStart++;
  }

  return { data, bodyStart };
}

// ---------- Quote handling ----------

var QUOTE_PREFIX = /^(>\s?)+/;

// Number of quote levels on a line, and the line with them stripped. Returns
// depth 0 for an unquoted line.
function quoteDepth(line) {
  var m = QUOTE_PREFIX.exec(line);
  if (!m) return { depth: 0, rest: line };
  var depth = (m[0].match(/>/g) || []).length;
  return { depth: depth, rest: line.slice(m[0].length) };
}

// A line that is blank except for quote markers — `>` alone. It separates
// paragraphs *within* a blockquote, so it must stay inside the quote.
function isQuoteBlank(line) {
  return /^(>\s*)+$/.test(line);
}

// ---------- Fences ----------

var FENCE_OPEN = /^(\s*)(`{3,}|~{3,})[ \t]*(.*)$/;

// Marks which lines sit inside a fenced code block. Runs before every other
// rule because each of them consults the mask.
//
// Three corpus-specific requirements:
//   - leading whitespace is allowed, because fences are nested inside ordered
//     list items indented by three spaces (spring-04) and would otherwise be
//     mistaken for indented code blocks;
//   - quote markers are stripped first, because 20 fence lines live inside
//     blockquotes;
//   - the closing fence must match the opener's character and be at least as
//     long, so a `text` diagram containing a ``` comment cannot close early.
function maskFences(lines) {
  var mask = new Array(lines.length).fill(false);
  var open = null;

  for (var i = 0; i < lines.length; i++) {
    var q = quoteDepth(lines[i]);
    var m = FENCE_OPEN.exec(q.rest);

    if (open === null) {
      if (!m) continue;
      // An info string on a backtick fence may not contain a backtick.
      if (m[2].charAt(0) === "`" && m[3].indexOf("`") !== -1) continue;
      open = { char: m[2].charAt(0), len: m[2].length, info: m[3].trim() };
      mask[i] = true;
      continue;
    }

    mask[i] = true;

    if (m && m[2].charAt(0) === open.char && m[2].length >= open.len && m[3].trim() === "") {
      open = null;
    }
  }

  return { mask: mask, unclosed: open !== null };
}

// ---------- Headings ----------

var HEADING = /^(#{1,6})\s+(.+?)\s*$/;

// A joined heading that is really a sentence wearing a heading mark.
//
// Matched on the "Continued in Chapter N" prefix alone. An earlier draft also
// treated any heading ending in `. ! ?` as a bridge, which misclassified the
// real heading `1.1 What Is Java?` — the corpus contains exactly 18
// punctuation-terminated headings and 17 of them are bridges, so the predicate
// has to key on the phrase rather than on punctuation.
function isBridgeNote(text) {
  return /^Continued in Chapter \d+/.test(text);
}

// Resolves the hard-wrapped headings. Prose is hard-wrapped near 95 columns and
// a few headings were wrapped too, leaving `## Chapter 13 ... Tricky` followed
// by `## Questions`.
//
// The rule is purely structural: same level, only blank lines between, therefore
// one heading. All 31 such pairs in the corpus are genuine joins and no length
// threshold is used, because the first lines range from 33 to 84 columns.
function resolveHeadings(lines, mask) {
  var marks = [];
  var i = 0;

  while (i < lines.length) {
    if (mask[i]) {
      i++;
      continue;
    }

    var m = HEADING.exec(lines[i]);
    if (!m) {
      i++;
      continue;
    }

    var level = m[1].length;
    var text = m[2];
    var start = i;
    var last = i;
    var absorbed = 0;

    // Absorb continuation lines: same level, blanks only in between.
    for (var j = i + 1; j < lines.length; j++) {
      if (mask[j]) break;
      if (lines[j].trim() === "") continue;

      var n = HEADING.exec(lines[j]);
      if (n && n[1].length === level) {
        text += " " + n[2];
        last = j;
        absorbed++;
        continue;
      }
      break;
    }

    marks.push({
      level: level,
      text: text,
      bridge: isBridgeNote(text),
      start: start,
      end: last,
      // Heading lines folded into this one. `end - start` is not this: the span
      // also covers the blank separator lines the rule skips over.
      absorbed: absorbed
    });

    i = last + 1;
  }

  return marks;
}

// ---------- Blocks ----------

var LIST_ITEM = /^(\s*)([-*+])\s+(.*)$/;
var ORDERED_ITEM = /^(\s*)(\d{1,3})\.\s+(.*)$/;
var TABLE_ROW = /^\s*\|/;
var TABLE_SEP = /^\s*\|[\s:|-]+\|\s*$/;
var QA_OPEN = /^\*\*([A-Z]{1,2})(\d{1,3})\.\s/;

// A thematic break: three or more hyphens alone on a line.
//
// The distinction from a setext heading is why this is not simply "`---` means
// <hr>". In CommonMark a `---` directly under a paragraph line promotes that
// line to an `<h2>`. The corpus contains exactly one `---` following a
// non-blank line, and it sits inside a ```yaml fence as a Kubernetes document
// separator — `maskFences` already covers it, and this predicate is only ever
// reached for unmasked lines.
//
// `parseFrontMatter` consumes its own closing `---` before the body is parsed,
// so that line never reaches here either.
var THEMATIC_BREAK = /^ {0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/;

// An all-caps bare paragraph, with no terminal punctuation.
var ALLCAPS = /^[A-Z0-9 ,'&()—-]{8,}$/;

function isBlank(line) {
  return line.trim() === "";
}

// Starts any block that must interrupt a running paragraph.
function startsBlock(line, mask, i, lines) {
  var q = quoteDepth(line);
  if (q.depth > 0 && !isBlank(q.rest)) return true;
  if (q.depth > 0 && isQuoteBlank(line)) return true;

  if (FENCE_OPEN.test(q.rest)) return true;
  if (THEMATIC_BREAK.test(q.rest)) return true;
  if (TABLE_ROW.test(q.rest)) return true;
  if (LIST_ITEM.test(q.rest)) return true;
  if (ORDERED_ITEM.test(q.rest)) return true;
  if (HEADING.test(q.rest)) return true;
  if (QA_OPEN.test(q.rest)) return true;

  return false;
}

// Collects the body of a fenced block starting at the opening line.
function readFence(lines, mask, start) {
  var q = quoteDepth(lines[start]);
  var m = FENCE_OPEN.exec(q.rest);
  var body = [];
  var i = start + 1;

  while (i < lines.length) {
    var qi = quoteDepth(lines[i]);
    var mi = FENCE_OPEN.exec(qi.rest);
    if (
      mi &&
      mi[2].charAt(0) === m[2].charAt(0) &&
      mi[2].length >= m[2].length &&
      mi[3].trim() === ""
    ) {
      break;
    }
    body.push(qi.rest);
    i++;
  }

  return {
    block: { type: "code", lang: m[3].trim(), body: body },
    end: Math.min(i, lines.length - 1)
  };
}

// A table is a run of `|` rows whose second line is a `| --- |` separator.
// Header cells come from the first row; body rows follow to the first blank or
// non-row line.
function readTable(lines, mask, start) {
  var rows = [];
  var i = start;

  while (i < lines.length && !mask[i] && TABLE_ROW.test(quoteDepth(lines[i]).rest)) {
    rows.push(quoteDepth(lines[i]).rest.trim());
    i++;
  }

  if (rows.length < 2 || !TABLE_SEP.test(rows[1])) {
    return null;
  }

  var split = function (row) {
    var inner = row.replace(/^\|/, "").replace(/\|$/, "");
    var cells = inner.split("|");
    // A trailing pipe produces a final empty cell; drop exactly one.
    if (cells.length && cells[cells.length - 1].trim() === "") cells.pop();
    return cells;
  };

  var head = split(rows[0]);
  var body = rows.slice(2).map(split);

  return {
    block: { type: "table", head: head, rows: body },
    end: i - 1
  };
}

// A list is a run of items at one indent level. Nested items recurse, which
// covers the nine genuine two-space nested lists in the corpus. An indented
// fence inside a list item is consumed as that item's content.
function readList(lines, mask, start) {
  var ordered = ORDERED_ITEM.test(quoteDepth(lines[start]).rest);
  var first = ordered ? ORDERED_ITEM.exec(quoteDepth(lines[start]).rest)
                      : LIST_ITEM.exec(quoteDepth(lines[start]).rest);
  var baseIndent = first[1].length;
  var items = [];
  var i = start;

  while (i < lines.length) {
    var rest = quoteDepth(lines[i]).rest;

    // A fence opener is masked like its body, so the mask check has to come
    // after recognising it — otherwise the indented fence under a list item
    // (spring-04 item 2 carries two of them) is skipped and its code lost.
    if (mask[i]) {
      var maskedOpen = FENCE_OPEN.exec(rest);
      if (!maskedOpen) {
        // Interior of a fence this list has already consumed; skip past it.
        while (i < lines.length && mask[i]) i++;
        continue;
      }
      if (maskedOpen[1].length > baseIndent && items.length) {
        var mf = readFence(lines, mask, i);
        var host = items[items.length - 1];
        if (!host.fences) host.fences = [];
        host.fences.push(mf.block);
        host.lines.push.apply(host.lines, lines.slice(i, mf.end + 1));
        i = mf.end + 1;
        continue;
      }
      break;
    }

    if (isBlank(rest) || isQuoteBlank(lines[i])) {
      // A blank may sit inside a list item (before a continuation or a nested
      // fence) or terminate the list. Peek: if the next content line belongs to
      // this list, continue; otherwise stop.
      var k = i + 1;
      while (k < lines.length && isBlank(quoteDepth(lines[k]).rest) && !mask[k]) k++;
      if (k >= lines.length) break;

      var peek = quoteDepth(lines[k]).rest;
      // A fence opener is masked like its body, so it needs recognising here
      // too or the blank line before it would end the list and orphan the code.
      if (mask[k] && !FENCE_OPEN.test(peek)) break;

      var peekOrdered = ORDERED_ITEM.exec(peek);
      var peekUnordered = LIST_ITEM.exec(peek);
      var peekItem = peekOrdered || peekUnordered;

      if (peekItem && peekItem[1].length >= baseIndent) {
        i = k;
        continue;
      }
      // An indented fence belongs to the preceding item.
      if (FENCE_OPEN.test(peek)) {
        i++;
        continue;
      }
      break;
    }

    var mOrdered = ORDERED_ITEM.exec(rest);
    var mUnordered = LIST_ITEM.exec(rest);

    if (mOrdered && mOrdered[1].length === baseIndent) {
      items.push({ text: mOrdered[3], children: [], lines: [lines[i]] });
      i++;
      continue;
    }
    if (mUnordered && mUnordered[1].length === baseIndent) {
      items.push({ text: mUnordered[3], children: [], lines: [lines[i]] });
      i++;
      continue;
    }

    if (TABLE_ROW.test(rest)) break;

    // A thematic break ends the list, for the same reason a heading does. Without
    // this the break is absorbed as lazy continuation and the `<hr>` is lost —
    // the defect the `# Part N` heading check below was written for, recurring
    // through a different character.
    if (THEMATIC_BREAK.test(rest)) break;

    // A heading ends the list, even with no blank line before it. All nine Java
    // volumes put `# Part N — …` on the line straight after a table-of-contents
    // bullet, and lazy continuation absorbed it into the bullet, losing the
    // volume's part divider entirely.
    if (HEADING.test(rest)) break;

    // A blockquote ends the list. Thirteen quotes in the corpus sit directly
    // under a list item with no blank line between, and treating them as lazy
    // continuation swallowed the whole quote into the item's text.
    if (quoteDepth(lines[i]).depth > 0) break;

    var cur = mOrdered || mUnordered;
    if (cur && cur[1].length > baseIndent) {
      // Genuinely nested item at a deeper level.
      items[items.length - 1].children.push({
        text: cur[3],
        children: [],
        lines: [lines[i]]
      });
      i++;
      continue;
    }

    if (items.length && !cur) {
      // Lazy continuation of the current item's text.
      items[items.length - 1].text += " " + rest.trim();
      i++;
      continue;
    }

    break;
  }

  return {
    block: { type: "list", ordered: ordered, items: items },
    end: i - 1
  };
}

// A blockquote is a run of quoted lines, including blank `>` separators and
// fenced content. The body is re-parsed by the caller at depth + 1.
function readQuote(lines, mask, start) {
  var body = [];
  var i = start;

  while (i < lines.length && (quoteDepth(lines[i]).depth > 0 || isQuoteBlank(lines[i]))) {
    body.push(quoteDepth(lines[i]).rest);
    i++;
  }

  // Trim trailing blanks from the quote body.
  while (body.length && body[body.length - 1].trim() === "") body.pop();

  return { block: { type: "quote", body: body }, end: i - 1 };
}

// Joins hard-wrapped lines. The wrap is a source artifact, never semantic, so
// no `<br>` is emitted anywhere in this pipeline.
function readParagraph(lines, mask, start) {
  var parts = [quoteDepth(lines[start]).rest.trim()];
  var i = start + 1;

  while (i < lines.length) {
    if (mask[i]) break;
    if (isBlank(quoteDepth(lines[i]).rest) && !isQuoteBlank(lines[i])) break;
    if (startsBlock(lines[i], mask, i, lines)) break;
    parts.push(quoteDepth(lines[i]).rest.trim());
    i++;
  }

  return {
    block: { type: "para", text: parts.join(" ") },
    end: i - 1
  };
}

// The repository's deliberate all-caps tic, used as a bare paragraph. Two
// variants exist across the 34 volumes — `BEFORE YOU MOVE ON, …` in 31 files and
// `BEFORE YOU CALL YOURSELF DONE, …` in java-09 — so the predicate keys on the
// invariant frame rather than on either literal.
var BANNER = /^BEFORE YOU .+, YOU SHOULD BE ABLE TO$/;

function classifyParagraph(text) {
  var t = text.trim();
  if (BANNER.test(t)) return "banner";
  if (ALLCAPS.test(t) && !/[.!?,;]$/.test(t)) return "banner";
  return "para";
}

// Walks a line range and returns blocks. Used for the document body and again
// recursively for every blockquote body, so quotes get identical treatment.
function parseLines(lines) {
  var f = maskFences(lines);
  var mask = f.mask;
  var headings = resolveHeadings(lines, mask);
  var headingAt = {};
  headings.forEach(function (h) {
    headingAt[h.start] = h;
  });

  var blocks = [];
  var i = 0;

  while (i < lines.length) {
    if (mask[i] && !headingAt[i]) {
      var fence = readFence(lines, mask, i);
      blocks.push(fence.block);
      i = fence.end + 1;
      continue;
    }

    if (headingAt[i]) {
      var h = headingAt[i];
      blocks.push({
        type: h.bridge ? "bridge" : "heading",
        level: h.level,
        text: h.text
      });
      i = h.end + 1;
      continue;
    }

    if (isBlank(lines[i]) || isQuoteBlank(lines[i])) {
      i++;
      continue;
    }

    var rest = quoteDepth(lines[i]).rest;

    if (quoteDepth(lines[i]).depth > 0) {
      var q = readQuote(lines, mask, i);
      q.block.blocks = parseLines(q.block.body);
      delete q.block.body;
      blocks.push(q.block);
      i = q.end + 1;
      continue;
    }

    if (FENCE_OPEN.test(rest)) {
      var fz = readFence(lines, mask, i);
      blocks.push(fz.block);
      i = fz.end + 1;
      continue;
    }

    if (THEMATIC_BREAK.test(rest)) {
      blocks.push({ type: "hr" });
      i++;
      continue;
    }

    if (TABLE_ROW.test(rest)) {
      var t = readTable(lines, mask, i);
      if (t) {
        blocks.push(t.block);
        i = t.end + 1;
        continue;
      }
    }

    if (LIST_ITEM.test(rest) || ORDERED_ITEM.test(rest)) {
      var l = readList(lines, mask, i);
      blocks.push(l.block);
      i = l.end + 1;
      continue;
    }

    var p = readParagraph(lines, mask, i);
    p.block.kind = classifyParagraph(p.block.text);
    blocks.push(p.block);
    i = p.end + 1;
  }

  return blocks;
}

function parse(markdown) {
  var lines = markdown.replace(/\r\n?/g, "\n").replace(/\n+$/, "").split("\n");
  var fm = parseFrontMatter(lines);
  var blocks = parseLines(lines.slice(fm.bodyStart));

  return {
    frontMatter: fm.data,
    blocks: blocks,
    unclosedFence: maskFences(lines.slice(fm.bodyStart)).unclosed
  };
}

module.exports = {
  parse: parse,
  // exported for the census in build.js
  maskFences: maskFences,
  quoteDepth: quoteDepth,
  resolveHeadings: resolveHeadings,
  parseFrontMatter: parseFrontMatter
};