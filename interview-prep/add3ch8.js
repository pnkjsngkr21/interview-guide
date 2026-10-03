const fs = require('fs');
const FILE = 'java-03-core-java.html';
let h = fs.readFileSync(FILE, 'utf8');

function cut(start, end) {
  const i = h.indexOf(start);
  if (i < 0) throw new Error('not found: ' + start.slice(0, 70));
  if (h.indexOf(start, i + 1) >= 0) throw new Error('not unique: ' + start.slice(0, 70));
  const j = h.indexOf(end, i);
  if (j < 0) throw new Error('end not found: ' + end.slice(0, 70));
  const removed = h.slice(i, j);
  h = h.slice(0, i) + h.slice(j);
  return removed;
}
function replaceOnce(a, b) {
  const i = h.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a.slice(0, 70));
  if (h.indexOf(a, i + 1) >= 0) throw new Error('not unique: ' + a.slice(0, 70));
  h = h.slice(0, i) + b + h.slice(i);
}

// 1. Lift the closing block out of chapter 7 and re-attach it to chapter 8.
const END_ANCHOR = '<h3 class="vol__h3" id="end-of-volume-3">';
const CH9 = '<section id="chapter-9-bonus';
let tail = cut(END_ANCHOR, CH9);          // "...Coming in Volume 4 ...</h3></section>\n\n"
tail = tail.trimEnd();                    // the cut point sits at the next section tag
if (!tail.endsWith('</section>')) throw new Error('tail shape changed: ' + tail.slice(-40));

// 2. Extend the checklist with java.time — chapter 8 now carries the ending, so it
//    has to be in the list the reader is asked to self-check against.
//    (Edited on `tail`, not `h`: `cut` already lifted this text out of the document.)
{
  const from = '<li>Apply PECS to design a copy-style method signature without hesitating, and explain why type erasure makes it necessary</li></ul>';
  const k = tail.indexOf(from);
  if (k < 0 || tail.indexOf(from, k + 1) >= 0) throw new Error('checklist anchor not unique');
  tail = tail.slice(0, k) +
    from.slice(0, -'</ul>'.length) +
    '<li>Separate Instant, LocalDateTime, OffsetDateTime and ZonedDateTime by what zone knowledge each carries</li>' +
    '<li>Explain why a Duration day is exactly 24 hours and a Period day is a calendar day, and when each is correct</li>' +
    '<li>Say which of java.util.Date and java.sql.Timestamp is deprecated — the answer is the one you would get wrong</li>' +
    '</ul>' +
    tail.slice(k + from.length);
}

const tailInner = tail.slice(0, -'</section>'.length);

// 3. Insert the new chapter between chapter 7 and the first bonus chapter.
const ch8 = fs.readFileSync('ch8.html', 'utf8').trim();
const i = h.indexOf(CH9);
if (i < 0) throw new Error('chapter 9 anchor missing');
h = h.slice(0, i) + ch8 + '\n\n' + tailInner + h.slice(i);

// 4. Sidebar: chapter 7 loses the two closing entries, chapter 8 gains them.
replaceOnce(
  '<li><a href="#end-of-volume-3">End of Volume 3</a></li><li><a href="#coming-in-volume-4-collections-framework">Coming in Volume 4 — Collections Framework</a></li></ul></details></li>',
  '</ul></details></li>' +
  '<li><a href="#chapter-8-dates-times-and-time-zones">Chapter 8 — Dates, Times &amp; Time Zones</a>' +
  '<details class="toc__more"><summary>10 sections</summary><ul>' +
  '<li><a href="#81-why-javatime-exists">8.1 Why java.time Exists</a></li>' +
  '<li><a href="#82-the-eight-core-types">8.2 The Core Types</a></li>' +
  '<li><a href="#83-duration-vs-period">8.3 Duration vs Period</a></li>' +
  '<li><a href="#84-zones-and-dst">8.4 Zones and DST</a></li>' +
  '<li><a href="#85-parsing-and-formatting">8.5 Parsing and Formatting</a></li>' +
  '<li><a href="#86-clock-and-testability">8.6 Clock, and the Legacy Escape Hatches</a></li>' +
  '<li><a href="#87-common-mistakes">8.7 Common Mistakes</a></li>' +
  '<li><a href="#interview-questions-8">Interview Questions</a></li>' +
  '<li><a href="#end-of-volume-3">End of Volume 3</a></li>' +
  '<li><a href="#coming-in-volume-4-collections-framework">Coming in Volume 4 — Collections Framework</a></li>' +
  '</ul></details></li>');

// 5. Chapter 9's "one-shot" framing in the prose intro.
replaceOnce(
  'Every Chapter 1–7 concept framed as',
  'Every Chapter 1–8 concept framed as');

fs.writeFileSync(FILE, h, 'utf8');
console.log('Vol 3: chapter 8 (java.time) inserted, closing block moved, sidebar rebuilt');