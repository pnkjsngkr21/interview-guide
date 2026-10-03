const fs = require('fs');
const FILE = 'java-06-multithreading-concurrency.html';
let h = fs.readFileSync(FILE, 'utf8');

function insertBefore(anchor, text) {
  const i = h.indexOf(anchor);
  if (i < 0) throw new Error('anchor not found: ' + anchor);
  if (h.indexOf(anchor, i + 1) >= 0) throw new Error('anchor NOT unique: ' + anchor);
  h = h.slice(0, i) + text + h.slice(i);
}
function replaceOnce(a, b) {
  const i = h.indexOf(a);
  if (i < 0) throw new Error('not found: ' + a.slice(0, 60));
  if (h.indexOf(a, i + 1) >= 0) throw new Error('not unique: ' + a.slice(0, 60));
  h = h.slice(0, i) + b + h.slice(i);
}
// append a <li> to the <ul> that ends immediately before `before`
function addListItem(before, item) {
  const i = h.indexOf(before);
  if (i < 0) throw new Error('not found: ' + before);
  const u = h.lastIndexOf('</ul>', i);
  if (u < 0) throw new Error('no </ul> before ' + before);
  h = h.slice(0, u) + '<li>' + item + '</li>' + h.slice(u);
}

// ============================================================ 4.5 StampedLock

const STAMPED =
'<h3 class="vol__h3" id="45-stampedlock-optimistic-reading-without-blocking">4.5 StampedLock &mdash; Optimistic Reading Without Blocking</h3>' +
'<p><code>ReadWriteLock</code> removes reader-writer contention but leaves reader-reader contention: every reader still queues behind every other reader. <code>StampedLock</code> adds a third mode for the case where a read is cheap and being momentarily out of date is acceptable &mdash; it takes <strong>no lock at all</strong> and validates the result afterwards.</p>' +
'<pre class="diagram"><code>  mode          takes a lock   blocks writers   blocks other readers\n' +
'  ---------------------------------------------------------------------------\n' +
'  write          yes            yes              yes\n' +
'  read           yes            yes              yes\n' +
'  optimistic     NO             no               no      &lt;- validate() instead\n' +
'\n' +
'  optimistic read = tryOptimisticRead()   -&gt; copy the fields under your own code\n' +
'                     validate(stamp)       -&gt; true? use them.  false? redo the whole read.\n' +
'                     no unlock needed &mdash; a plain optimistic stamp holds nothing</code></pre>' +
'<p>It is the only lock here that is <strong>stamp-based rather than ownership-based</strong>. Acquisition returns a <code>long</code> stamp and every subsequent operation takes that stamp back: unlocking, or converting between read and write mode.</p>' +
'<div class="table-wrap"><table><thead><tr><th>Method</th><th>Returns</th><th>Meaning</th></tr></thead><tbody>' +
'<tr><td><code>writeLock()</code></td><td>stamp</td><td>Exclusive. Blocks until no reader or writer holds it.</td></tr>' +
'<tr><td><code>readLock()</code></td><td>stamp</td><td>Shared. Blocks only while a writer holds it.</td></tr>' +
'<tr><td><code>tryOptimisticRead()</code></td><td>stamp, or <code>0</code></td><td>Acquires nothing. Returns <code>0</code> if the lock is currently exclusively held.</td></tr>' +
'<tr><td><code>validate(stamp)</code></td><td><code>boolean</code></td><td>True if the lock has not been exclusively acquired since the stamp was issued.</td></tr>' +
'<tr><td><code>unlockRead/Write(stamp)</code></td><td>&mdash;</td><td>Throws <code>IllegalMonitorStateException</code> if the stamp does not match the lock&rsquo;s current mode.</td></tr>' +
'<tr><td><code>tryConvertToWriteLock(stamp)</code></td><td>a <strong>new</strong> stamp, or <code>0</code></td><td>Upgrades. On success the returned stamp replaces the old one everywhere.</td></tr>' +
'</tbody></table></div>' +
'<aside class="callout callout--trap"><span class="callout__label">Interview trap</span><p>An optimistic stamp does <strong>not</strong> hold a lock, so it needs <strong>no unlock</strong>. The Javadoc example says so outright. You only call <code>unlockRead(stamp)</code> for a stamp you obtained from <code>tryConvertToReadLock(stamp)</code> &mdash; and then you pass the <em>returned</em> stamp, not the optimistic one. Passing the raw optimistic stamp to <code>unlockRead</code> throws <code>IllegalMonitorStateException</code>. This is the single most common StampedLock mistake, and it fails in the direction of throwing rather than silently leaking, which is at least a kind of mercy.</p></aside>' +
'<aside class="callout callout--must"><span class="callout__label">Must remember</span><p><strong>Non-reentrancy is not uniform.</strong> Re-acquiring the <em>write</em> lock on a thread that already holds it blocks forever. Re-acquiring the <em>read</em> lock does not self-deadlock &mdash; read locks are counted, so it simply increments &mdash; but you must then release as many times as you acquired, and it will deadlock if a writer slips in between. And because a <code>StampedLock</code> has <strong>no notion of ownership</strong> (like <code>Semaphore</code>, unlike most <code>Lock</code> implementations), a stamp acquired on one thread may be released on another. Nothing enforces discipline here; the caller owns it.</p></aside>' +
'<aside class="callout callout--prod"><span class="callout__label">In production</span><p>Two capabilities <code>ReentrantLock</code> has and this one does not: it supports <code>Condition</code> &mdash; <code>asReadLock()</code> and <code>asWriteLock()</code> both throw <code>UnsupportedOperationException</code> from <code>newCondition()</code> &mdash; and it does not extend <code>AbstractQueuedSynchronizer</code>. It reimplements AQS&rsquo;s queueing algorithm over <code>Unsafe</code> compare-and-swap on a packed state field, and implements only <code>Serializable</code>. Do not describe it as unrelated to AQS; describe it as not extending it.</p></aside>' +
'<aside class="callout callout--trap"><span class="callout__label">Interview trap</span><p>&ldquo;StampedLock has no interruptible acquisition&rdquo; is wrong. <code>writeLockInterruptibly()</code>, <code>readLockInterruptibly()</code>, <code>tryWriteLock(long, TimeUnit)</code> and <code>tryReadLock(long, TimeUnit)</code> all exist and all throw <code>InterruptedException</code>. Only the untimed <code>writeLock()</code> and <code>readLock()</code> are uninterruptible.</p></aside>' +
'<aside class="callout callout--summary"><span class="callout__label">Chapter summary</span><p>StampedLock adds optimistic reading to the lock family: read without locking, then check whether a writer interfered, and retry if so. It is stamp-based rather than ownership-based, non-reentrant (write re-acquire deadlocks, read re-acquire is merely counted), supports no <code>Condition</code>, and does not extend AQS. The trap worth memorising is that an optimistic stamp requires no unlock.</p></aside>';

insertBefore('<h4 class="vol__h4" id="common-mistakes-4">', STAMPED);

addListItem('<h4 class="vol__h4" id="interview-questions-4">',
  'Calling <code>unlockRead()</code> with a plain optimistic stamp. It holds no lock; only a stamp returned by <code>tryConvertToReadLock()</code> is released.');

replaceOnce(
  '<li><a href="#44-readwritelock-optimizing-for-read-heavy-workloads">4.4 ReadWriteLock — Optimizing for Read-Heavy Workloads</a></li><li><a href="#common-mistakes-4">',
  '<li><a href="#44-readwritelock-optimizing-for-read-heavy-workloads">4.4 ReadWriteLock — Optimizing for Read-Heavy Workloads</a></li>' +
  '<li><a href="#45-stampedlock-optimistic-reading-without-blocking">4.5 StampedLock &mdash; Optimistic Reading Without Blocking</a></li>' +
  '<li><a href="#common-mistakes-4">');

replaceOnce(
  '<a href="#chapter-4-atomic-classes-and-explicit-locks">Chapter 4 — Atomic Classes &amp; Explicit Locks</a><details class="toc__more"><summary>7 sections</summary>',
  '<a href="#chapter-4-atomic-classes-and-explicit-locks">Chapter 4 — Atomic Classes &amp; Explicit Locks</a><details class="toc__more"><summary>8 sections</summary>');

// StampedLock Q&A, appended at the end of chapter 4
insertBefore('<section id="chapter-5-coordination-utilities"',
  '<h4 class="vol__h4" id="stampedlock-questions">StampedLock Questions</h4>' +
  '<article class="qa" id="4-stampedlock-1"><p class="qa__q"><a class="qa__num" href="#4-stampedlock-1">Q6</a> What are StampedLock&rsquo;s three modes? <span class="qa__badge"><code>TRICKY</code></span></p><div class="qa__a"><p>Write, read, and optimistic. The optimistic mode takes no lock at all &mdash; you read, then call <code>validate(stamp)</code> to check no writer interfered.</p></div></article>' +
  '<article class="qa" id="4-stampedlock-2"><p class="qa__q"><a class="qa__num" href="#4-stampedlock-2">Q7</a> Do you unlock after a successful optimistic read?</p><div class="qa__a"><p>No. An optimistic stamp does not hold a lock and needs no unlock. You only release a stamp that <code>tryConvertToReadLock()</code> returned.</p></div></article>' +
  '<article class="qa" id="4-stampedlock-3"><p class="qa__q"><a class="qa__num" href="#4-stampedlock-3">Q8</a> Is StampedLock reentrant? <span class="qa__badge"><code>TRICKY</code></span></p><div class="qa__a"><p>No. Re-acquiring the write lock on the same thread blocks forever. Re-acquiring the read lock increments a count rather than deadlocking, but you must release as many times as you acquired, and a writer arriving in between will deadlock it.</p></div></article>' +
  '<article class="qa" id="4-stampedlock-4"><p class="qa__q"><a class="qa__num" href="#4-stampedlock-4">Q9</a> Can you use a <code>Condition</code> with a StampedLock?</p><div class="qa__a"><p>No. <code>asReadLock()</code> and <code>asWriteLock()</code> both throw <code>UnsupportedOperationException</code> from <code>newCondition()</code>.</p></div></article>' +
  '<article class="qa" id="4-stampedlock-5"><p class="qa__q"><a class="qa__num" href="#4-stampedlock-5">Q10</a> Does StampedLock support interruptible acquisition? <span class="qa__badge"><code>ADVANCED</code></span></p><div class="qa__a"><p>Yes &mdash; <code>writeLockInterruptibly()</code>, <code>readLockInterruptibly()</code>, and both timed <code>tryWriteLock</code>/<code>tryReadLock</code> overloads throw <code>InterruptedException</code>. Only the untimed blocking acquires are uninterruptible.</p></div></article>' +
  '<article class="qa" id="4-stampedlock-6"><p class="qa__q"><a class="qa__num" href="#4-stampedlock-6">Q11</a> Does StampedLock extend AbstractQueuedSynchronizer?</p><div class="qa__a"><p>No &mdash; it implements only <code>Serializable</code> and reimplements AQS&rsquo;s queueing algorithm over <code>Unsafe</code> CAS on a packed state field.</p></div></article>' +
  '</section>');
// remove the </section> that used to close chapter 4 (now doubled)
h = h.replace('</div></article></section></section><section id="chapter-5-coordination-utilities"',
              '</div></article></section><section id="chapter-5-coordination-utilities"');

// ================================================================ 5.4 Phaser

const PHASER =
'<h3 class="vol__h3" id="54-phaser-reusable-barrier-with-a-variable-party-count">5.4 Phaser &mdash; Reusable Barrier with a Variable Party Count</h3>' +
'<p><code>Phaser</code> (Java 7) is a reusable barrier that fixes the two things that make <code>CyclicBarrier</code> awkward: the party count can change while the barrier is in use, and the units of progress are <em>phases</em> rather than arrival indices.</p>' +
'<pre class="diagram"><code>  party count is fixed      -&gt; CyclicBarrier(3)   every phase waits for exactly 3\n' +
'  party count varies        -&gt; Phaser(2)          parties register() and deregister() freely\n' +
'\n' +
'  register() / bulkRegister(n)     add parties at any time\n' +
'  arrive()                         arrive now, do not wait\n' +
'  arriveAndAwaitAdvance()          arrive AND block until the phase advances\n' +
'  arriveAndDeregister()            arrive and drop out of future phases\n' +
'  onAdvance(phase, parties) -&gt; true    terminate on advance</code></pre>' +
'<div class="table-wrap"><table><thead><tr><th></th><th><code>CountDownLatch</code></th><th><code>CyclicBarrier</code></th><th><code>Phaser</code></th></tr></thead><tbody>' +
'<tr><td>Reusable</td><td>No &mdash; one-shot, count never resets</td><td>Yes</td><td>Yes</td></tr>' +
'<tr><td>Party count</td><td>Fixed at construction</td><td>Fixed at construction</td><td>Varies &mdash; <code>register()</code>/<code>arriveAndDeregister()</code></td></tr>' +
'<tr><td><code>await()</code> gives you</td><td>&mdash;</td><td>Your arrival <strong>index</strong></td><td>Nothing; the phase number advances</td></tr>' +
'<tr><td>Per-round hook</td><td>&mdash;</td><td>A <code>Runnable</code> barrier action</td><td>Overridable <code>onAdvance(phase, parties)</code></td></tr>' +
'<tr><td>Interruptible wait</td><td><code>await()</code> yes</td><td><code>await()</code> yes</td><td>Not via <code>arriveAndAwaitAdvance()</code> &mdash; see below</td></tr>' +
'</tbody></table></div>' +
'<aside class="callout callout--trap"><span class="callout__label">Interview trap</span><p><code>arriveAndAwaitAdvance()</code> returns the <strong>arrival</strong> phase number &mdash; the phase you arrived <em>at</em>, not the one it advanced to &mdash; and a <strong>negative value means termination, not interruption</strong>. It does not throw <code>InterruptedException</code> and keeps waiting even if the thread is interrupted, which is exactly how it differs from <code>CyclicBarrier.await()</code>. If you need to escape a stalled phase, you must call <code>awaitAdvanceInterruptibly()</code> instead.</p></aside>' +
'<aside class="callout callout--must"><span class="callout__label">Must remember</span><p>Phases are not monotonic forever: the counter <strong>wraps back to zero after <code>Integer.MAX_VALUE</code></strong>. Any loop of the form <code>while (phase &lt; target) { ... phase = arriveAndAwaitAdvance(); }</code> is therefore only safe because real programs never run that many phases &mdash; not because the number is conceptually infinite.</p></aside>' +
'<aside class="callout callout--prod"><span class="callout__label">In production</span><p>If a registered party never arrives, the phase never advances and <code>onAdvance()</code> is <strong>never invoked</strong> &mdash; so overriding it to terminate is not a mitigation for an absent party; it runs only when all other waiting parties are dormant. The real recovery levers are <code>forceTermination()</code>, <code>arriveAndDeregister()</code>, or an interruptible wait. Note also that an exception thrown from <code>onAdvance()</code> is propagated to the advancing party and <strong>no advance occurs</strong>, which stalls the barrier permanently. And <code>register()</code> silently does nothing once the phaser has terminated, returning a negative number.</p></aside>' +
'<aside class="callout callout--summary"><span class="callout__label">Chapter summary</span><p>Reach for <code>Phaser</code> over <code>CyclicBarrier</code> when the set of participants changes &mdash; tasks that finish early deregister instead of holding the barrier hostage, and tasks that start late register into the current phase. The trap is that <code>arriveAndAwaitAdvance()</code> returns the arrival phase, treats a negative result as termination rather than interruption, and ignores interrupts entirely.</p></aside>';

insertBefore('<h4 class="vol__h4" id="common-mistakes-5">', PHASER);

addListItem('<h4 class="vol__h4" id="interview-questions-5">',
  'Expecting <code>arriveAndAwaitAdvance()</code> to throw <code>InterruptedException</code> or to return the new phase number. It does neither &mdash; use <code>awaitAdvanceInterruptibly()</code> when you need to escape.');

replaceOnce(
  '<li><a href="#countdownlatch-vs-cyclicbarrier">CountDownLatch vs CyclicBarrier</a></li><li><a href="#common-mistakes-5">',
  '<li><a href="#countdownlatch-vs-cyclicbarrier">CountDownLatch vs CyclicBarrier</a></li>' +
  '<li><a href="#54-phaser-reusable-barrier-with-a-variable-party-count">5.4 Phaser &mdash; Reusable Barrier with a Variable Party Count</a></li>' +
  '<li><a href="#common-mistakes-5">');

replaceOnce(
  '<a href="#chapter-5-coordination-utilities">Chapter 5 — Coordination Utilities</a><details class="toc__more"><summary>6 sections</summary>',
  '<a href="#chapter-5-coordination-utilities">Chapter 5 — Coordination Utilities</a><details class="toc__more"><summary>7 sections</summary>');

insertBefore('<section id="chapter-6-failure-modes-and-the-producer-consumer-problem"',
  '<h4 class="vol__h4" id="phaser-questions">Phaser Questions</h4>' +
  '<article class="qa" id="5-phaser-1"><p class="qa__q"><a class="qa__num" href="#5-phaser-1">Q6</a> What does <code>arriveAndAwaitAdvance()</code> return? <span class="qa__badge"><code>TRICKY</code></span></p><div class="qa__a"><p>The arrival phase number &mdash; the phase it arrived at, not the new one &mdash; or a negative value if the phaser has terminated.</p></div></article>' +
  '<article class="qa" id="5-phaser-2"><p class="qa__q"><a class="qa__num" href="#5-phaser-2">Q7</a> Does a negative return mean the wait was interrupted?</p><div class="qa__a"><p>No. Negative means termination. <code>arriveAndAwaitAdvance()</code> does not throw <code>InterruptedException</code> and continues waiting even when interrupted. Use <code>awaitAdvanceInterruptibly()</code> for that.</p></div></article>' +
  '<article class="qa" id="5-phaser-3"><p class="qa__q"><a class="qa__num" href="#5-phaser-3">Q8</a> When would you choose Phaser over CyclicBarrier?</p><div class="qa__a"><p>When the participant count must vary. <code>CyclicBarrier</code> is fixed-size for its whole life; a <code>Phaser</code> lets tasks <code>register()</code> or <code>arriveAndDeregister()</code> as they come and go.</p></div></article>' +
  '<article class="qa" id="5-phaser-4"><p class="qa__q"><a class="qa__num" href="#5-phaser-4">Q9</a> A registered task crashes without deregistering. What happens, and how do you recover? <span class="qa__badge"><code>ADVANCED</code></span></p><div class="qa__a"><p>The phase never advances, so <code>onAdvance()</code> is never called and cannot help. Recover with <code>forceTermination()</code>, <code>arriveAndDeregister()</code>, or an interruptible wait on the stalled party.</p></div></article>' +
  '<article class="qa" id="5-phaser-5"><p class="qa__q"><a class="qa__num" href="#5-phaser-5">Q10</a> Does the phase number increase forever?</p><div class="qa__a"><p>No &mdash; it wraps back to zero after <code>Integer.MAX_VALUE</code>.</p></div></article>' +
  '</section>');
h = h.replace('</div></article></section></section><section id="chapter-6-failure-modes-and-the-producer-consumer-problem"',
              '</div></article></section><section id="chapter-6-failure-modes-and-the-producer-consumer-problem"');

fs.writeFileSync(FILE, h, 'utf8');
console.log('Vol 6 updated: StampedLock 4.5 + Phaser 5.4, 11 new questions');