/* Chapter scroll-spy.

   Marks the sidebar link for whichever chapter section is currently in view.
   It is deliberately the only script on the page that touches navigation state,
   and it is droppable: deleting this file and its one <script> tag changes no
   rendered byte and breaks no link. Every anchor already resolves on its own.

   `aria-current` is set rather than a class, so the styling lives in guide.css
   and this file carries no presentational decision.

   Zero dependencies. Works from file:// with no server. */

(function () {
  "use strict";

  var links = Array.prototype.slice.call(
    document.querySelectorAll(".sidebar .toc a[href^='#']")
  );
  if (!links.length) return;

  // Section id -> its link. The sidebar and the body are built from the same
  // chapter list with the same deduplicated slugs, so this always pairs up; the
  // build asserts every href resolves regardless.
  var pairs = [];
  links.forEach(function (a) {
    var id = decodeURIComponent(a.getAttribute("href").slice(1));
    var section = document.getElementById(id);
    if (section) pairs.push({ link: a, section: section });
  });
  if (!pairs.length) return;

  // Ascending by document position. `compareDocumentPosition` is the only
  // ordering primitive that is correct without measuring, and it avoids the
  // getBoundingClientRect-in-a-loop pass that would run on every scroll event.
  pairs.sort(function (x, y) {
    var rel = x.section.compareDocumentPosition(y.section);
    if (rel & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
    if (rel & Node.DOCUMENT_POSITION_PRECEDING) return 1;
    return 0;
  });

  var current = null;

  function mark(entry) {
    if (!entry || entry === current) return;
    if (current) current.link.removeAttribute("aria-current");
    entry.link.setAttribute("aria-current", "true");
    current = entry;
  }

  // The last section whose top has passed the reading line. A plain
  // intersection-ratio threshold is wrong here: sections vary from four lines
  // to forty, so a small section can never reach the ratio a tall one hits
  // comfortably, and the highlight would flicker as the ratio dips below the
  // threshold on scroll.
  var line = function () {
    return window.innerHeight * 0.25;
  };

  function pick() {
    var chosen = pairs[0];
    for (var i = 0; i < pairs.length; i++) {
      if (pairs[i].section.getBoundingClientRect().top <= line()) {
        chosen = pairs[i];
      } else {
        break;
      }
    }
    mark(chosen);
  }

  // `passive` so the scroll handler can never delay scrolling. The handler is
  // cheap — a getBoundingClientRect per section — but a volume has up to 13
  // chapters and this runs on every frame of a scroll.
  var queued = false;

  function onScroll() {
    if (queued) return;
    queued = true;
    requestAnimationFrame(function () {
      queued = false;
      pick();
    });
  }

  if ("IntersectionObserver" in window) {
    // Used only as a cheap trigger: observing the sections and re-running the
    // same position test on entry is far cheaper than observing every pixel of
    // the page, and it reuses `pick` rather than duplicating its ordering.
    var io = new IntersectionObserver(onScroll, {
      rootMargin: "-25% 0px -70% 0px",
      threshold: [0]
    });
    pairs.forEach(function (p) { io.observe(p.section); });
  } else {
    window.addEventListener("scroll", onScroll, { passive: true });
  }

  window.addEventListener("resize", onScroll, { passive: true });

  // The filtered state hides sections, which would leave the spy pointing at an
  // invisible one. search.js toggles `hidden`, and a MutationObserver on the
  // main column is the only way to notice.
  var main = document.getElementById("main");
  if (main && "MutationObserver" in window) {
    new MutationObserver(onScroll).observe(main, {
      attributes: true,
      attributeFilter: ["hidden"],
      subtree: true
    });
  }

  mark(pairs[0]);
})();