/* Minimal syntax highlighting for cheatsheet code blocks.
   Hand-rolled rather than a library: the repo carries no dependencies and no
   build step, and the vocabulary needed here is tiny. Highlights in place,
   leaving the existing text content untouched so Ctrl+F still works. */

(function () {
  "use strict";

  var KEYWORDS = (
    // control + declarations
    "abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|" +
    "do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|" +
    "instanceof|int|interface|long|native|new|package|private|protected|public|return|" +
    "short|static|strictfp|super|switch|synchronized|this|throw|throws|transient|try|" +
    "void|volatile|while|var|record|sealed|permits|yield|" +
    // contextual, still worth colouring
    "true|false|null"
  );

  // One pass, alternatives ordered so comments and strings win before anything
  // inside them can be mistaken for code. Left-to-right, never re-scanned.
  var MASTER = new RegExp(
    [
      "(\\/\\/[^\\n]*)",                                  // 1 line comment
      "(\\/\\*[\\s\\S]*?\\*\\/)",                          // 2 block comment
      "(\"(?:\\\\.|[^\"\\\\])*\")",                       // 3 string
      "('(?:\\\\.|[^'\\\\])*')",                          // 4 char
      "(@[A-Za-z_]\\w*)",                                 // 5 annotation
      "\\b(\\d[\\d_]*\\.?[\\d_]*(?:[eE][+-]?\\d+)?[fFdDlL]?)\\b", // 6 number
      "\\b(" + KEYWORDS + ")\\b",                         // 7 keyword
      "\\b([A-Z][A-Za-z0-9_]*)\\b",                       // 8 type-ish
      "\\b([a-zA-Z_]\\w*)(?=\\s*\\()"                      // 9 call
    ].join("|"),
    "g"
  );

  var CLASS_FOR = {
    1: "tok-com",
    2: "tok-com",
    3: "tok-str",
    4: "tok-str",
    5: "tok-ann",
    6: "tok-num",
    7: "tok-kw",
    8: "tok-type",
    9: "tok-fn"
  };

  function escapeHtml(s) {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function highlight(text) {
    var out = "";
    var last = 0;
    var m;

    MASTER.lastIndex = 0;
    while ((m = MASTER.exec(text)) !== null) {
      // Guard against a zero-length match stalling the loop.
      if (m.index === MASTER.lastIndex) {
        MASTER.lastIndex++;
        continue;
      }
      out += escapeHtml(text.slice(last, m.index));

      var group = 0;
      for (var i = 1; i <= 9; i++) {
        if (m[i] !== undefined) {
          group = i;
          break;
        }
      }

      if (group === 0) {
        out += escapeHtml(m[0]);
      } else {
        out +=
          '<span class="' + CLASS_FOR[group] + '">' +
          escapeHtml(m[group]) +
          "</span>";
      }
      last = MASTER.lastIndex;
    }

    out += escapeHtml(text.slice(last));
    return out;
  }

  function label(block) {
    var cls = block.getAttribute("data-lang");
    if (!cls) {
      return "";
    }
    var name = block.getAttribute("data-title");
    return (
      '<span class="code__lang">' +
      escapeHtml(cls) +
      (name ? ' <span class="code__title">' + escapeHtml(name) + "</span>" : "") +
      "</span>"
    );
  }

  function highlightBlock(text, highlightLines) {
    var lines = text.replace(/\n+$/, "").split("\n");
    var marks = null;

    if (highlightLines) {
      marks = {};
      highlightLines.split(",").forEach(function (n) {
        var i = parseInt(n, 10);
        if (!isNaN(i)) {
          marks[i] = true;
        }
      });
    }

    return lines
      .map(function (line, i) {
        var html = highlight(line);
        return marks && marks[i + 1]
          ? '<span class="line line--hl">' + html + "</span>"
          : html;
      })
      .join("\n");
  }

  function render() {
    var blocks = document.querySelectorAll("pre.snippet");

    Array.prototype.forEach.call(blocks, function (block) {
      if (block.getAttribute("data-hl") === "done") {
        return;
      }

      var code = block.querySelector("code");
      if (!code) {
        return;
      }

      code.innerHTML = highlightBlock(
        code.textContent,
        block.getAttribute("data-hl-line")
      );

      if (block.getAttribute("data-lang")) {
        var bar = document.createElement("div");
        bar.className = "code__bar";
        bar.innerHTML = label(block);
        block.insertBefore(bar, code);
      }

      block.setAttribute("data-hl", "done");
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", render);
  } else {
    render();
  }
})();
