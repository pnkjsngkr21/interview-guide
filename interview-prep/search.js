/* Cheatsheet filtering — shared by index.html and all 34 volume pages.
   No dependencies, no build step. See cheatsheets/README.md. */

(function () {
  "use strict";

  var input = document.querySelector("[data-filter-input]");
  var targets = Array.prototype.slice.call(
    document.querySelectorAll("[data-filter-target]")
  );
  var groups = Array.prototype.slice.call(
    document.querySelectorAll("[data-filter-group]")
  );
  var counter = document.querySelector("[data-filter-count]");
  var emptyState = document.querySelector("[data-filter-empty]");

  if (!input || targets.length === 0) {
    return;
  }

  // Cache each target's text once, lowercase, so typing stays cheap on the
  // larger pages. dataset.haystack would also work but leaks into the DOM.
  var haystacks = targets.map(function (el) {
    return (el.textContent || "").toLowerCase().replace(/\s+/g, " ");
  });

  function apply(rawQuery) {
    var query = (rawQuery || "").trim().toLowerCase();

    // Match every whitespace-separated term, so "deadlock lock" narrows rather
    // than widening the way a single substring match would.
    var terms = query.length ? query.split(/\s+/) : [];

    var visible = 0;

    targets.forEach(function (el, i) {
      var match =
        terms.length === 0 || terms.every(function (t) {
          return haystacks[i].indexOf(t) !== -1;
        });
      el.hidden = !match;
      if (match) {
        visible++;
      }
    });

    // Hide a track/group only once every item inside it is filtered out.
    groups.forEach(function (group) {
      var items = group.querySelectorAll("[data-filter-target]");
      var anyVisible = Array.prototype.some.call(items, function (el) {
        return !el.hidden;
      });
      group.hidden = !anyVisible;
    });

    if (counter) {
      counter.textContent =
        terms.length === 0 ? "" : visible + " of " + targets.length;
    }

    if (emptyState) {
      emptyState.hidden = terms.length === 0 || visible > 0;
    }
  }

  input.addEventListener("input", function () {
    apply(input.value);
  });

  input.addEventListener("keydown", function (event) {
    if (event.key === "Escape") {
      input.value = "";
      apply("");
    }
  });

  // The count doubles as an affordance — clicking it clears the filter.
  if (counter) {
    counter.addEventListener("click", function () {
      input.value = "";
      apply("");
      input.focus();
    });
  }

  // "/" focuses the search box, the way most reference docs behave.
  document.addEventListener("keydown", function (event) {
    if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    var active = document.activeElement;
    var typing =
      active &&
      (active.tagName === "INPUT" ||
        active.tagName === "TEXTAREA" ||
        active.isContentEditable);
    if (typing) {
      return;
    }
    event.preventDefault();
    input.focus();
    input.select();
  });

  apply("");
})();
