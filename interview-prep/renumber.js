// Renumber a volume's bonus chapters to make room for new teaching chapters.
// Single-pass mapping: each match is rewritten exactly once, so N->N+1 chains
// cannot double-apply (the bug you get from sequential .replace() calls).
//
// usage: node renumber.js <file> <shift> <firstBonus> <lastBonus> [--write]

const fs = require('fs');
const [, , file, shiftArg, firstArg, lastArg, mode] = process.argv;
const SHIFT = parseInt(shiftArg, 10);
const FIRST = parseInt(firstArg, 10);
const LAST = parseInt(lastArg, 10);

let h = fs.readFileSync(file, 'utf8');
const changes = [];
const show = (from, to, kind) => { if (from !== to) changes.push('  ' + kind + ' ' + from + ' -> ' + to); };
const map = (n) => (n >= FIRST && n <= LAST ? n + SHIFT : n);

const before = h;

// 1. section ids + QA ids + QA hrefs:  "chapter-8-bonus-..." and "8-bonus-..."
//    one regex covers both, because `chapter-8-bonus-` contains `8-bonus-`.
h = h.replace(/(\d+)-bonus-/g, (m, d) => {
  const n = parseInt(d, 10), out = map(n);
  show(n + '-bonus-', out + '-bonus-', 'id/href');
  return out + '-bonus-';
});

// 2. every rendered "Chapter N" that names a bonus chapter: h2, sidebar, prose
h = h.replace(/Chapter (\d+)(?= \(Bonus)/g, (m, d) => {
  const n = parseInt(d, 10), out = map(n);
  show('Chapter ' + n, 'Chapter ' + out, 'text ');
  return 'Chapter ' + out;
});

// 3. the "Continued in Chapter N" bridge paragraphs
h = h.replace(/(Continued in Chapter )(\d+)/g, (m, pre, d) => {
  const n = parseInt(d, 10), out = map(n);
  show(pre.trim() + ' ' + n, pre.trim() + ' ' + out, 'bridge');
  return pre + out;
});

console.log('=== ' + file + '  (shift ' + SHIFT + ' over chapters ' + FIRST + '-' + LAST + ') ===');
const tally = {};
changes.forEach(c => { const k = c.trim().split(' ')[0]; tally[k] = (tally[k] || 0) + 1; });
Object.entries(tally).forEach(([k, v]) => console.log('  ' + v + '  ' + k));
console.log('  total rewrites: ' + changes.length);
if (mode !== '--write') {
  console.log('\n(dry run — pass --write to apply)');
} else {
  fs.writeFileSync(file, h, 'utf8');
  console.log('  WRITTEN');
}