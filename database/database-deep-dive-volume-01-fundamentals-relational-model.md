---
title: "The Database Complete Deep-Dive"
volume: 1
series: "DATABASE FUNDAMENTALS & THE RELATIONAL MODEL"
subtitle: "Study & Interview Mastery Guide"
---

# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is an eleven-volume study guide to databases, written for engineers who already know
how to build a backend service and are preparing for senior and staff-level interviews. It
is not a tutorial. Nothing here explains what a table is.

The organising question of every chapter is the same one a staff engineer gets asked in a
real design review: **not "what does this do", but "why would a team choose this, what does
it cost, when does it break, and how expensive is it to undo?"** A database's annotations —
`B+ tree`, `MVCC`, `primary key`, `eventual consistency` — are treated as the visible
surface of a storage engine, a concurrency protocol, and a durability model, and the notes
always go down to that machinery, because that is the layer where production incidents
actually live. The `EXPLAIN` output is not a black box to be pasted into a ticket; it is the
optimiser telling you what it believes about your data, and the gap between that belief and
reality is the bug.

Volume 1 is the foundation volume — the material that is *assumed* everywhere else in this
set and almost never learned. It is tempting to treat "database fundamentals" as the
chapter where you explain what a primary key is, and that is exactly the chapter nobody
needs. What a senior engineer is actually missing is the layer between the SQL they type
and the bytes that move: what a page is, why a table with narrow rows is fast and a table
with wide rows is not, why `SELECT *` is a storage problem before it is a bandwidth problem,
why the relational model is a *logical* claim that the storage engine is entirely free to
violate, and what normalisation actually buys you and what it quietly costs.

The staff-level theme running through the volume is **where the abstraction stops paying for
itself**. Keys, constraints, normalisation, and the relational algebra are each genuinely
good at something — and each has a point where it becomes a tax you are paying for
protection you do not need. Knowing where that point is, and being able to say it in a
design review, is the difference between someone who can write correct SQL and someone who
can be trusted with the data layer.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto the relational
algebra produces filler. The template is a completeness checklist, not a template to fill.

**Callouts** appear inline and are used consistently:

| Callout | Means |
| --- | --- |
| `INTERVIEW TRAP` | the common answer that a senior candidate should catch and correct |
| `TRADE-OFF` | a decision with both sides, and the condition that flips the answer |
| `SCALING REALITY CHECK` | the specific number where this stops working |
| `PRODUCTION RELEVANCE` | why this matters outside an interview |
| `MUST REMEMBER` | the one fact to carry forward |
| `PRODUCTION SCENARIO` | a five-line incident: problem, investigation, root cause, solution, prevention |
| `STAFF-LEVEL CONSIDERATION` | the org or process concern worth raising unprompted |

Each chapter ends with `Common Mistakes`, a set of `Interview Questions`, a summary
callout, and `Further Reading` for anyone who wants to go past the chapter.

Volumes end with an `Interview Scenario Bank` — production situations, code-behaviour
predictions, code-review questions, and design trade-off challenges. There is no target
number for these. They stop when the next question would repeat one already asked.

| Volume | Coverage |
| --- | --- |
| Volume 1 (this book) | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL — InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 1

- Chapter 1 — What a Database Is Actually Doing
- Chapter 2 — Pages, Heaps & the Physical Layer
- Chapter 3 — The Relational Model
- Chapter 4 — Keys, Constraints & Referential Integrity
- Chapter 5 — Normalisation & Denormalisation
- Chapter 6 — Relational Algebra & the Execution Model
- Chapter 7 — Scaling Lenses on Relational Data
- Chapter 8 — Interview Scenario Bank

---

# Part 1 — Database Fundamentals & the Relational Model

## Chapter 1 — What a Database Is Actually Doing

### 1.1 The Answer Everybody Gives, and Why It Is Wrong

Every interview answer starts here: *"A database stores data so you can retrieve it."* This
is the same class of answer as *"Spring is an IoC container."* It is not wrong, but it is
the answer that scores zero, because it describes the storage engine's job and skips the
part that actually generates incidents.

The useful decomposition is three layers, and a database is all three at once:

```text
┌─────────────────────────────────────────────────────────────────┐
│  QUERY ENGINE                                                   │
│  Parse → rewrite → optimise → plan → execute                     │
│  (What is the cheapest way to answer this question?)             │
├─────────────────────────────────────────────────────────────────┤
│  STORAGE ENGINE                                                  │
│  Pages, tuples, indexes, B+ trees, WAL, checkpoints, compaction │
│  (How are bytes organised, and how do they get to durable?)      │
├─────────────────────────────────────────────────────────────────┤
│  CONCURRENCY CONTROL                                            │
│  Locks, MVCC, snapshots, isolation, deadlock detection           │
│  (What may two transactions see, and who blocks whom?)           │
└─────────────────────────────────────────────────────────────────┘
        ▲ all three are invisible from SQL
```

The single most consequential consequence of that layering is this: **SQL describes what
you want, and the engine decides how to get it.** When a query is slow, the answer is
almost never "the query is wrong" — it is one of the three layers disagreeing with your
intent. The optimiser mispredicted a row count. The storage engine has to read 40,000 pages
instead of 40. The concurrency layer made your transaction wait behind a long-running one,
and the waiting shows up as query time.

> **INTERVIEW TRAP — "WHERE DOES THE DATABASE STORE MY DATA?"**
>
> "On disk" is the answer that ends the conversation, because it is true in a way that is
> useless. Working sets live in RAM, and there are usually *three* layers of caching between
> your `SELECT` and the platter:
>
> ```text
> your query
>    │
>    ▼
> ┌─────────────────────────────────────────┐
> │ DB BUFFER POOL                         │  the DB's own cache of pages
> │ (PostgreSQL shared_buffers,             │  — this is where "in memory" lives
> │  InnoDB buffer pool, Oracle SGA)        │
> └─────────────────────────────────────────┘
>    │ miss
>    ▼
> ┌─────────────────────────────────────────┐
> │ OPERATING SYSTEM PAGE CACHE            │  the kernel's cache of file blocks
> └─────────────────────────────────────────┘
>    │ miss
>    ▼
> ┌─────────────────────────────────────────┐
> │ STORAGE DEVICE                         │  SSD, NVMe, or a spinning disk
> └─────────────────────────────────────────┘
> ```
>
> A senior answer continues: the *hottest* data is often in all three at once, so an I/O
> counter showing zero does not mean the query is cheap — it means the OS was willing to
> serve it. And a "cache hit" in the buffer pool and a "cache hit" on disk are completely
> different latency, which is why `EXPLAIN (ANALYZE, BUFFERS)` in PostgreSQL reports shared
> hits and reads separately: the ratio is your actual measure of how well the buffer pool is
> sized for this workload.
>
> The follow-up that separates a senior from a mid-level is: **"if the buffer pool is a
> cache, what is the eviction policy, and what happens on eviction?"** The answer is that a
> dirty page cannot be arbitrarily evicted — the write-ahead log exists precisely so that
> eviction can be a `memcpy` and the durability promise is kept by the log instead. That
> answer connects three layers at once, and it is the one that makes the interviewer stop
> asking easy questions.

### 1.2 The Three-Model Split: Logical, Physical, and the Space Between

Codd's relational model is a *logical* theory: it says what a relation is, what a functional
dependency is, what normalisation means. It says nothing at all about how bytes are laid out
on a device. This is a deliberate separation, and the most useful thing about it is that it
is load-bearing.

```text
  WHAT YOU WRITE              WHAT THE ENGINE DOES            WHAT THE DEVICE DOES
  ───────────────              ────────────────────            ────────────────────
  SELECT * FROM orders         parse → bind → rewrite          read page 41,203
  WHERE status = 'SHIPPED'     → optimise → plan → execute     into shared_buffers
                                → fetch tuples from heap       serve page 41,204
                                  or index                     from the OS cache
```

The pragmatic consequence: **you cannot reason about performance from the logical model.**
`SELECT * FROM orders` looks like the same amount of data as `SELECT id FROM orders`. It is
not — one reads 200 bytes per row, the other reads 12, and on a 50-million-row table that
is the difference between 4,000 page reads and 12,000,000. Both produce the same *logical*
result, because the relational model is blind to width. Volume 2 covers the type choices;
Volume 4 covers the indexes. This chapter's job is to make sure you understand *why* the
two layers can disagree, and that the disagreement is where the latency comes from.

> **MUST REMEMBER**
>
> SQL is a *declarative* language. It names the answer, never the route. Every performance
> question in this set is ultimately a question about the route the optimiser chose, and
> the only way to see the route is to ask the engine.

### 1.3 Query Engine: Parse, Rewrite, Optimise, Execute

The query pipeline is the same shape in every major engine, and knowing the stages is what
lets you predict *which* stage a problem lives in.

```text
   SQL text
      │
      ▼
┌─────────────────┐
│  1. PARSE       │  text → syntax tree. A syntax error dies here, loudly.
└─────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  2. REWRITE (query transformation)                          │
│     • flatten subqueries into joins where it is safe        │
│     • inline views                                           │
│     • push predicates down toward the tables                 │
│     • simplify constant expressions                          │
│     • convert OR to a UNION ALL of ANDs (common)            │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  3. OPTIMISE (planner)                                       │
│     • enumerate legal join orders (search space explodes)    │
│     • estimate cost of each access path                      │
│     • pick the cheapest plan by modelled cost                │
│     • the whole job is COST ESTIMATION, not cleverness       │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────────────────────────────┐
│  4. EXECUTE (executor)                                       │
│     • pull model in PostgreSQL, iterator model in Volcano-  │
│       style engines (MySQL/InnoDB)                          │
│     • tuples flow upward through the plan tree               │
└─────────────────────────────────────────────────────────────┘
      │
      ▼
   result set
```

Two things in that diagram are worth more than the rest.

**First: step 3 is estimation, not cleverness.** The optimiser does not understand your
data. It reads *statistics* — histograms, row counts, distinct-value counts — and produces a
numeric guess about how many rows each step will produce. Every join algorithm decision
downstream is made by comparing those guesses. This is why `ANALYZE` being stale is one of
the highest-leverage operational tasks in PostgreSQL and MySQL alike, and why "run
`ANALYZE` after a bulk load" is a real, load-bearing piece of advice rather than folklore.
Volume 4 Chapter 7 is entirely about reading the gap between the estimate and reality.

**Second: step 4 is where the transaction lives.** The executor is the first place that
takes locks, reads through MVCC snapshots, and buffers writes for the WAL. Every isolation
question is an executor question, and every deadlock is two executors in a cycle. Volume 5
is entirely about that layer.

> **SCALING REALITY CHECK**
>
> The search space for join order is `n!` for `n` tables, so no engine enumerates it. Both
> PostgreSQL and MySQL use dynamic programming over *interesting* orderings — for six
> tables, a plain `CROSS JOIN`-permuted exhaustive search is 720 plans, which is tractable,
> so they consider all of them. Past roughly 8–10 tables, the search space genuinely
> exceeds what exhaustive DP can handle, and the optimiser falls back to heuristics. **The
> practical rule: a join across more than about eight tables is usually a schema problem
> wearing a query costume**, and the fix is a denormalised bridge table, not a planner
> hint.

### 1.4 Storage Engine: The Parts That Have Names

The vocabulary differs per engine but the components are universal. PostgreSQL names:

| Component | PostgreSQL name | What it is | What breaks if you get it wrong |
| --- | --- | --- | --- |
| Page | 8kB block | Fixed-size unit of I/O | Everything — see Chapter 2 |
| Tuple | heap tuple | One row version | Tuple bloat, `VACUUM` load |
| Heap file | relation | Unordered pile of tuple pointers | No locality; scans read everything |
| Index | `btree` index | Sorted structure pointing to tuples | Write amplification, bloat |
| Write log | WAL | Every change, before it is applied | Nothing — this is durability |
| Free space | FSM / VM | Where to put new tuples, what is dead | Insert failures, bloat |
| Statistics | `pg_statistic` | Histograms the planner reads | Wrong plans, silently |

MySQL InnoDB names the same ideas: page, record, **clustered index** (which *is* the table
— see Volume 8), undo log (the MVCC read path), redo log (the WAL), and change buffer.
Different words, identical structure. If you can name these five things for any engine, you
can read any engine's documentation and reason about any incident involving "the database
is slow".

> **PRODUCTION RELEVANCE**
>
> The reason to learn the storage-engine vocabulary is that this is the language on-call
> uses. An incident channel where people say "the DB is struggling" is an incident that
> takes an hour to triage. An incident channel where someone asks "are we seeing buffer
> pool evictions, or lock waits, or slow plans?" is an incident that takes five minutes.
> Naming the parts is what lets a junior engineer escalate usefully.

### 1.5 When to Use a Database at All, and When Not To

The question is not in most interview rubrics and it is the first thing a staff engineer
argues about in real design reviews, so it belongs here rather than in a later volume.

A relational database is the right answer when **several of these are true at once**:

- The data is **relational** — you will join it, and the joins are not incidental
- The data is the **source of truth** and losing it is not recoverable
- You need **transactions** across more than one row
- You need **ad-hoc queries** whose shape you cannot predict in advance
- The write volume is human-scale — thousands per second, not millions

It is the wrong answer when:

- The data is **append-only blobs** — that is S3 (Volume 11)
- The access pattern is **known and fixed** and the volume is enormous — that is DynamoDB
  or Cassandra (Volume 10)
- The data is **derived** and can be recomputed — that is a cache or a materialised view,
  not a table
- Nothing ever filters it — a 4-million-row table that is only ever `SELECT *` has no
  indexes, no primary key worth the name, and is a file with a query interface

> **TRADE-OFF — "SHOULD WE USE A DOCUMENT STORE INSTEAD?"**
>
> The condition that flips the answer is **whether you will ever join across entity types and
> filter on more than one of them simultaneously.** A document store wins when one document
> is read whole and the query pattern is a prefix lookup. It loses, expensively, the moment
> you need "all orders for customers in region EU placed in the last 30 days with a status
> in (SHIPPED, DELIVERED)" — because that is either a denormalised copy of a fact you now
> have to maintain in N places, or a fan-out scatter-gather that is fast on 10,000 documents
> and unusable on 100 million. The honest framing in a design review is not "SQL vs NoSQL" —
> it is "do we know our query patterns yet", because a document store's flexibility is only
> valuable while you are still discovering them, and becomes a liability the moment you know
> them.

#### Common Mistakes

- Describing a database as "a place where data is stored" — it is a storage engine, a query
  engine and a concurrency-control protocol, and the incidents live in the differences
- Assuming an I/O counter of zero means the query was free — it may have been served by the
  OS page cache, which is a *different* latency, not the same latency
- Claiming the optimiser "understands your data" — it reads statistics and guesses; a stale
  `ANALYZE` produces a confidently wrong plan with no error
- Listing B+ trees, MVCC and WAL as three separate things to memorise rather than three
  answers to "how do you make reads fast, writes concurrent, and failures survivable"
- Not being able to say what a page is, which is the actual floor of the subject

#### Interview Questions — Storage Engine vs Query Engine

**Q1. What does a database actually do? Give an answer that isn't "stores data".** `STAFF`

Three layers with three different jobs. The storage engine organises bytes into pages and
maintains indexes, a WAL and free-space maps, and is responsible for durability and for
making writes cheap. The query engine parses, rewrites and optimises the statement, and its
entire job is cost estimation — choosing among legal plans by comparing *estimated* row
counts, which is why stale statistics are the root cause of most bad plans. The concurrency
control layer decides what a transaction may see and who blocks whom, through locks or MVCC
snapshots. SQL names only the desired result, so an incident is almost always one of these
three layers disagreeing with intent.

**Q2. If a query shows zero physical reads, was it fast?** `TRICKY`

No — and this is the trap. Zero physical reads means every page was in the OS page cache or
the engine's buffer pool, which is exactly the *good* case, but it does not mean the query
did no work. A 40-million-row sequential scan can be entirely cache-resident and still take
30 seconds of CPU. The measurement that matters is the buffer pool *hit ratio* (shared hits
versus reads) plus the actual elapsed time and rows removed, which is what
`EXPLAIN (ANALYZE, BUFFERS)` gives you in PostgreSQL. A query is expensive when it moves
more bytes than the answer needs, regardless of where those bytes were resident.

**Q3. What is the write-ahead log for, if the data file is the source of truth?** `TRICKY`

Because the alternative is worse. If the data file were authoritative, every commit would
have to force the modified pages to disk in a random-access pattern, holding locks the
whole time, and throughput would be bounded by device random-write latency. The WAL inverts
this: changes are appended sequentially and forced once per commit (a sequential append is
the fastest thing a disk does), and the data file is updated lazily. Durability is then a
property of the log, not the data file, and the log is also what recovery replays, and what
lets a dirty page be evicted from the buffer pool without being written first. This is the
reason `fsync` on the log is the only thing standing between "committed" and "committed",
and why the durability level is a per-engine configuration knob you must choose on purpose.

**Q4. How many caches sit between your SQL and the disk, and what does that change?** `ADVANCED`

Three: the engine's buffer pool, the OS page cache, and the device's own cache. This
changes three practical things. (1) Latency has three tiers, not two, so "it's in memory"
is not a single performance class. (2) If the OS is caching, a database restart may be fast
for reads and slow for recovery, because the log replay can benefit from cache. (3) On
shared cloud hardware, a noisy neighbour can evict your pages from the OS cache and you can
do nothing about it — the practical response is to keep the working set small enough that
the engine's own pool holds it, and to stop treating a disk-attach upgrade as the fix for
an access-pattern problem.

> **CHAPTER 1 SUMMARY**
>
> A database is a storage engine, a query engine and a concurrency protocol wearing one
> interface. SQL is declarative, so performance is entirely a property of the route the
> optimiser picked, and the optimiser's only input is *statistics* — which makes stale
> `ANALYZE` a correctness-of-planning problem, not a maintenance chore. Learning to name
> the layers (pages, tuples, heap, index, WAL, free space map) is what lets a junior engineer
> escalate usefully during an incident, and it is the floor of everything in the remaining
> ten volumes.

#### Further Reading

- [PostgreSQL — Internals: Storage](https://www.postgresql.org/docs/current/storage.html) — pages, tuple layout and the free space map from the source.
- [PostgreSQL — Internals: Write-Ahead Log](https://www.postgresql.org/docs/current/wal.html) — how the WAL substitutes for forcing data pages, and the full durability ladder.
- [CMU Database Systems — Architecture Overview](https://www.cs.cmu.edu/~15451-f22/lectures/07-oltp.pdf) — the storage/transaction layer split, taught the way the exam expects it.
- [Jim Gray — Transaction Processing: Concepts and Techniques](https://www.cs.utexas.edu/~djimenez/utsa/cs3343/Gray%20Book%20on%20Transaction%20Processing.pdf) — the free reference on why the layered architecture looks the way it does.
- [Use The Index, Luke — What is a database](https://use-the-index-luke.com/) — the shortest useful explanation of pages, blocks and caching, aimed at working engineers.

## Chapter 2 — Pages, Heaps & the Physical Layer

### 2.1 Why Pages, and Why the Size Matters More Than You Think

Every engine stores data in fixed-size pages, and every performance question eventually
reduces to *"how many pages did this touch?"* The page is the unit of I/O, the unit of
locking at coarse granularity, the unit of buffer-pool occupancy, and — in most engines —
the unit that must be entirely written to make a small change durable in the data file.

| Engine | Default page size | Notes |
| --- | --- | --- |
| PostgreSQL | 8 kB | fixed at cluster init, `BLCKSZ` |
| MySQL InnoDB | 16 kB | fixed at init, `innodb_page_size` |
| SQL Server | 8 kB | |
| Oracle | 8 kB | |

Two consequences follow immediately, and both surprise people.

**First, a page is read whole or not at all.** There is no "read 40 bytes from page 900."
A single-row `SELECT` on a 16 kB page reads 16 kB. If your rows are 100 bytes and the page
holds 160 of them, you are paying for 159 rows you did not want. This is why row *width*
matters more than row *count* in most performance work — 10 million narrow rows and 1
million wide rows can cost the same scan.

**Second, a row larger than a page cannot be stored in it.** Every engine handles this with
out-of-line storage — PostgreSQL calls it TOAST, and it transparently compresses first and
spills to a separate relation if still too large. The mechanism is invisible, which is the
trap: a query selecting one column of a wide table can be slow because of an attribute you
never asked for, because the whole tuple lives in an out-of-line chunk.

> **INTERVIEW TRAP — "WHY IS `SELECT *` SLOW?"**
>
> The reflexive answer is "because it transfers more data over the network." That is the
> *last* stage of the problem and often the smallest. The real cost is upstream, at the
> storage layer:
>
> 1. Every column is read, so every row is fully decoded — no index-only scan is possible,
>    because an index-only scan needs every referenced column present in the index.
> 2. If the row exceeds the page size, TOAST chunks are fetched — an extra random read per
>    oversized row, on top of the sequential scan.
> 3. More bytes per row means fewer rows per page, so the same logical row count touches
>    proportionally more pages.
> 4. Serialisation cost moves from "parse 4 columns" to "parse 40 columns" — often a
>    meaningful share of CPU at high row counts.
> 5. *Then* the network.
>
> A senior answer quantifies it: on a 50M-row table with 200-byte rows and a 16 kB page,
> `SELECT *` touches roughly 625,000 pages versus about 40,000 for four narrow columns —
> and the second number is the one that changes your latency. Volume 4 covers the index-only
> scan that makes the narrow case fast.

### 2.2 The Slotted Page

Heap pages in PostgreSQL and InnoDB are *slotted*: a small header holds a pointer array, and
each pointer references a tuple that can sit anywhere in the page. This one design choice
explains an entire family of behaviours.

```text
┌─────────────────────────────────────────────────┐
│ PAGE HEADER (24 bytes)                           │  ← page LSN, checksum, links
├─────────────────────────────────────────────────┤
│ SLOT ARRAY                                       │
│   slot 0 ─────────────────────────┐              │
│   slot 1 ────────────┐             │              │  ← 4 bytes each, points to
│   slot 2 ──┐         │             │              │    where a tuple lives
│   slot 3 ──┼──┐      │             │              │
│      ...   │  │      │             │              │
├───────────┼──┼──────┼─────────────┼──────────────┤
│           ▼  ▼      ▼             ▼              │
│  ┌────────────────────────────────────────────┐  │
│  │ tuple 0    tuple 1        tuple 3          │  │  ← FREE SPACE lives here
│  │ (frag)                                           │
│  └────────────────────────────────────────────┘  │
│  ............ deleted tuple leaves a hole ......  │
└─────────────────────────────────────────────────┘
```

The three behaviours that fall out of this:

**Deletions leave holes, and do not move anything.** `DELETE FROM t WHERE id = 42` clears
the tuple's header to mark it dead and clears its slot pointer. The bytes stay on the page.
Nothing compacts. The space is only reusable when a later insert fits in the hole.

**Inserts do not split pages.** A tuple is placed in existing free space if it fits. There
is no page split on insert — that is an index behaviour (Volume 4), not a heap behaviour.

**The slot array grows until the page is full of pointers.** Postgres's 16-byte `PageHeader`
plus a 4-byte per-slot array means a page can reach a pathological state where the header
and slot array occupy a large fraction of the page, so very small tuples get fewer rows per
page. The measure is `pg_column_size(row)` and the tool is `pgstattuple`.

> **SCALING REALITY CHECK**
>
> On PostgreSQL, a table where `pg_column_size(row)` is small relative to its logical width
> — say 20 bytes of tuple in an 8 kB page where you expected 8 kB's worth of rows — has
> usually suffered thousands of updates in place. **Steady-state tuple size is a function
> of the largest the row ever got, not its current width**, because the slotted page never
> compacts. A table that once held a 4 kB JSON blob permanently pays the 4 kB per-row cost
> even after the blob is gone, until a `VACUUM FULL` (which rewrites the table and needs an
> `ACCESS EXCLUSIVE` lock) or a logical rewrite clears it.

### 2.3 Heap Files: Order Is Not Order

A heap is an *unordered* pile. There is a physical order, and it is roughly insertion
order, and that is the only thing it is. This has three consequences engineers routinely
get wrong:

```text
  Heap file:  [t1][t2][t3][t4][t5][t6][t7][t8] ... [t5000000]
              ▲ physically near each other = likely created together
              ▲ time order, NOT insertion order after updates
              ▲ HOT-updated rows move to the end of the page
              ▲ and to the end of the file, generally

  What the ORDER BY clause sees:  none of this. It is a full scan + sort.
  What "SELECT ... WHERE id BETWEEN a AND b" sees:  nothing. It is a full scan
      unless an index exists on id.
```

1. **`SELECT` without `ORDER BY` has no defined order**, even though it *appears* to
   return insertion order. It returns heap order, and heap order changes after an update.
   Any test that depends on row order without `ORDER BY` is a test that will pass on
   Tuesday and fail on Friday.
2. **A range predicate on the primary key is a full scan** unless an index exists. This is
   the single most common surprise in a first performance review. `WHERE id BETWEEN 1 AND
   100` is not a range scan on a heap; the optimiser has no idea where those rows are.
3. **A table that grows by appending is physically well-ordered**, and that is why
   BRIN-indexed or "naturally sequential" access patterns (see Volume 7 for BRIN, Volume 10
   for Cassandra) are fast without a lot of index maintenance. It is also why an
   `ORDER BY created_at` on an append-only heap is *nearly* free — but only nearly, and only
   until the first update moves rows.

> **INTERVIEW TRAP — "IS THE DATA IN THE ORDER I INSERTED IT?"**
>
> Only until something is updated. In a slotted-page heap, an updated row is usually written
> to *new free space* rather than moved back to its original position — a PostgreSQL HOT
> update appends a new tuple version at the end of the page and leaves a dead one behind.
> So the physical order degrades toward "order of last update," not "order of insertion."
> This is also the mechanism behind index-only-scan regressions on hot-update tables: the
> visibility map stops covering the pages, and reads that were free start re-fetching the
> heap. If a teammate says the heap is "insertion ordered," the useful reply is: *"until the
> first update — and the first update is always the first update."*

### 2.4 Row Locators and Pointers

An index entry does not contain your row. It contains a *reference* to it, and the shape of
that reference is an engine-level design decision with a real performance cost.

```text
  ┌──────────────────────────────────────┐
  │  B+ tree leaf                        │
  │  [key=42] → heap page 9001, offset 12│  PostgreSQL: (block, offset)
  │  [key=43] → heap page 9001, offset 180
  │  [key=44] → heap page 9002, offset 4  │  ── 3 rows, 1 page read
  └──────────────────────────────────────┘
         │
         ▼
  ┌──────────────────────────────────────┐
  │  Heap page 9001                      │
  │  ... tuple 3 @ off 12 ...            │
  │  ... tuple 4 @ off 180 ...           │
  └──────────────────────────────────────┘
```

The cost is a second, *random* page read per index lookup, and it is the reason a range
scan over a large index degrades: the index says rows 1, 2, 3, 500, 501, 5000, 5001 are
adjacent in the index, but the heap tuples are scattered across the file, so a
1000-row range fetch does 1000 random reads.

MySQL InnoDB's design is a more aggressive version of the same idea, and it is the one that
shocks people: **the clustered index *is* the table**. Secondary indexes store
`(secondary_key, primary_key)` pairs, so any lookup through a secondary index that needs
columns not in it does a *second* B+ tree descent into the clustered index. Volume 8
Chapter 2 covers this in full; the reason to know it here is that it explains why the
"same" query shape can cost very different amounts on the two engines.

Two engines solve the random-heap-read problem by making the index *contain* the row:
**InnoDB's clustered index** stores the whole row at the leaf, and **Elasticsearch's
`_source`** keeps the document adjacent to the postings. Both pay for it in write
amplification — every index update moves the whole payload. Both are the right trade when
reads dominate.

### 2.5 Free Space and the Write Path

Before a tuple is written, the engine must find a page with room. This is bookkeeping, and
it is where "the insert got slower" usually comes from.

```text
  INSERT (size 120B)
      │
      ▼
  Is there a free slot in the FSM for this page?  ── no ──▶  extend the relation
      │ yes                                              (one 8kB/16kB page at a time)
      ▼
  Does the target page have 120B of free space?  ── no ──▶  try the next candidate page
      │ yes                                                    (FSM keeps an ordered
      ▼                                                        candidate list)
  Write the tuple into the free space
      │
      ▼
  Update the affected indexes (this is the expensive part — see Volume 4)
      │
      ▼
  Append to the WAL. Commit = force the WAL, not the page.
```

Three practical implications:

- **A table that was once huge and is now small is still slow to insert into** if there are
  no free pages — every insert may extend the relation. `VACUUM` maintains the free space
  map; the alternative is that the engine guesses.
- **`fillfactor` (PostgreSQL) / `innodb_fill_factor`** exist precisely to leave holes in
  index pages so that inserts land in place instead of splitting. This is a trade-off you
  make *before* the table fills: reserve space, and pay a storage cost, to avoid page
  splits later. Volume 4 covers when it is worth it.
- **Every indexed column is written on every insert.** An insert into a table with six
  indexes is six B+ tree insertions plus one heap write, each with its own WAL record. The
  common "why is insert slow" answer is not the table, it is the index count.

> **MUST REMEMBER**
>
> The heap is unordered, the page is read whole, the slot pointer survives the row, and
> free space is found by a separate map. Every one of the four is invisible from SQL, and
> every one of them has burned an afternoon somewhere on a team.

#### Common Mistakes

- Explaining `SELECT *` cost purely in network terms and never mentioning row width driving
  pages read
- Claiming a heap is insertion-ordered, without qualifying that updates break the order
- Assuming `WHERE id BETWEEN 1 AND 100` is a range scan — on a heap it is a full scan
- Believing an index entry contains the row — it usually contains a pointer, and the second
  read is random
- Forgetting that a row wider than a page goes to out-of-line storage, and that you fetch
  the chunk even for a narrow projection
- Treating the free space map as free — it is real I/O on the write path

#### Interview Questions — Pages & Heaps

**Q1. What is a page, why does its size matter, and can you change it?** `TRICKY`

A page is the fixed-size unit of I/O, buffer-pool occupancy and — in the data file — the
unit of write. A row narrower than a page is read a page at a time, so page size bounds how
much data you touch per random read and how many rows share a read. It is chosen at
initialisation, not per table: PostgreSQL fixes `BLCKSZ` at cluster init (8 kB), InnoDB
fixes `innodb_page_size` at init (16 kB). It matters because wider pages make sequential
scans and large-object reads more efficient, while narrower pages make index fan-out higher
and the buffer pool hold more of the index relative to the heap. It is not a knob to reach
for — you choose it at the point where you know the workload, which is why managed
services rarely let you.

**Q2. Why doesn't deleting a row free its space?** `ADVANCED`

Because the heap page is slotted. A delete marks the tuple dead in its header and clears the
slot pointer, but the bytes stay where they are and nothing moves. A later insert reuses the
hole only if the new tuple fits. The consequence people miss is that the free space lives in
the FSM, not in the row space, so `VACUUM` is what makes it reusable — and that means a
steady-update table in production accumulates dead tuples that make every page read pay for
rows that no longer exist. Postgres's answer is `VACUUM` (reclaim without blocking) versus
`VACUUM FULL` (rewrite into a fresh, tightly packed table, taking an `ACCESS EXCLUSIVE`
lock for the duration) — and the honest answer about which to use in production is
"neither, keep the transaction that is blocking autovacuum from running."

**Q3. A `WHERE id BETWEEN 1 AND 100` query on a 10M-row table does a sequential scan. Why?** `TRICKY`

Because the heap is unordered. The only ordering the file has is roughly insertion order,
and the optimiser has no basis for assuming any particular range of `id` values lives
anywhere in particular. With no index on `id`, the only legal access path is a full scan
followed by a filter, and a full scan followed by a filter is exactly what the optimiser
will choose. This is the point where candidates often expect the engine to be "clever"
about ranges — the answer is that cleverness requires a structure that says *where* the
range is, and without an index the information does not exist anywhere in the file.

**Q4. MySQL feels slower than PostgreSQL for the same indexed query on a wide table. Why is that not necessarily a MySQL problem?** `STAFF`

Because InnoDB's clustered index stores the whole row at the B+ tree leaf — the index *is*
the table — whereas PostgreSQL's heap is separate and a secondary index entry is a
`(block, offset)` pointer. Both designs are legitimate, but they move cost differently.
InnoDB pays a bigger, more uniform read cost per lookup (you always read the full row) and
a much bigger write cost (every secondary index update moves the primary key, and row
updates are a delete-plus-insert at the leaf). PostgreSQL pays a second random read when
the index does not contain the needed columns, and a small write for HOT-updatable rows.
So "which is faster" is not a question with an answer — the answer is that the crossover
depends on read-to-write ratio and row width, and you can only find it by measuring both.

#### Further Reading

- [PostgreSQL — Database File Layout](https://www.postgresql.org/docs/current/storage-file-layout.html) — the exact page header, item identifiers, and how a tuple is located.
- [PostgreSQL — TOAST](https://www.postgresql.org/docs/current/storage-toast.html) — out-of-line storage, when it kicks in, and the threshold that triggers it.
- [InnoDB — How MySQL Stores Data](https://dev.mysql.com/doc/refman/8.0/en/innodb-physical-structure.html) — the official description of pages, extents and the clustered index.
- [CMU Database Systems — Disk Storage & Buffers](https://www.cs.cmu.edu/~15451-f22/lectures/04-storage.pdf) — slotted pages, free-space management and why they are the right design.
- [pgstattuple — PostgreSQL Extension](https://www.postgresql.org/docs/current/pgstattuple.html) — the tool that answers "how much of this table is actually dead tuples right now", and the exact command to run.

> **CHAPTER 2 SUMMARY**
>
> Pages are the unit of I/O and rows are read a page at a time, so row *width* drives
> performance more than row *count*. Heaps are unordered piles with slotted pages, which is
> why deletes free nothing until `VACUUM`, why updates append rather than move, and why a
> range predicate without an index is a full scan. Indexes usually store pointers, not rows,
> so a lookup costs a second random read — an observation that becomes the entire MySQL
> story in Volume 8 and the Elasticsearch `_source` story in Volume 11. If you remember one
> thing: most slow queries are a page-count problem before they are a CPU problem.

## Chapter 3 — The Relational Model

### 3.1 The Model Is a Logical Claim, Not a Physical One

Codd's 1970 relational model defines data in terms of *relations* — sets of tuples over
*domains*, with no assumption whatsoever about storage. The three words that matter are
"set," "tuple," and "domain", and each one has a consequence engineers routinely violate.

```text
  RELATIONAL MODEL                  WHAT SQL ACTUALLY GIVES YOU
  ───────────────                    ──────────────────────────
  relation = a SET of tuples         a BAG of rows (duplicates allowed)
  tuple = an ordered list of         a row, but attribute names are
    attribute-value pairs              resolved by position/name, and
                                       NULL is a marker, not a value
  domain = a named set of           a type, but most engines extend
    permissible values                it (arrays, JSON, ranges, hstore)

  Nothing here says anything about indexes, pages, locks, or where bytes live.
  The physical implementation is entirely free to disagree.
```

The bag-not-set gap is the one that bites most often. A relation in the mathematical sense
cannot contain duplicates, so `UNION` means "combine and remove duplicates" — which is why
`UNION` implies a sort or hash and `UNION ALL` does not, and why on a large result set the
difference is sometimes the whole runtime. A `GROUP BY` is a set operation. A plain
`SELECT` is not, which is exactly why `SELECT DISTINCT` and `UNION` carry a cost that
`SELECT *` and `UNION ALL` do not.

> **INTERVIEW TRAP — "WHY IS `UNION` SLOWER THAN `UNION ALL`?"**
>
> Because the model says a relation is a set, and a set has no duplicates, so `UNION` is
> *defined* as set union and must eliminate duplicates. In practice that means a hash
> aggregate or a sort of the whole result set — usually a spill to disk on anything large —
> and it is the single most common avoidable cost in generated report SQL. The correct
> question in a code review is not "is `UNION` bad" but "**do these two branches actually
> overlap?**" If they are provably disjoint by construction — different date ranges,
> different status values, an `id` range above the other's — then `UNION ALL` is not an
> optimisation, it is *the same query written correctly*, and using `UNION` is a bug that
> only shows up when the tables get big. Conversely, if you reach for `UNION ALL` on
> branches that can overlap, you have converted a slow query into a wrong one, and the
> duplicate row will surface as a double-counted total in a financial report.

### 3.2 Keys: Super, Candidate, Primary, Foreign, Alternate

The vocabulary is old and the distinctions are worth being precise about, because "it has a
primary key" is not always a meaningful statement about a table.

```text
  superkey      any attribute set that uniquely identifies a tuple
                {id} {id, email} {id, email, created_at}   — all superkeys
      │
      │  minimal (no attribute can be removed and stay unique)
      ▼
  candidate key a minimal superkey
                {id}  {email}                             — two candidates
      │
      │  chosen, and made NOT NULL and UNIQUE
      ▼
  primary key
      │
      │  the remaining minimal superkey
      ▼
  alternate key

  foreign key    a candidate key of table B, referenced by a column
                 (or column set) in table A — the reference is the FK,
                 the referenced key is still the PK/candidate key of B
```

Three things this buys you that "just use `id`" does not:

- **It tells you which columns are genuinely identity.** If `email` is a candidate key, then
  `email` identifies a user, and that is a *domain fact* that belongs in a `UNIQUE`
  constraint whether or not you query on it. This is the single highest-value schema check
  in a design review: what are the other candidate keys, and are they unconstrained?
- **It makes the FK's direction unambiguous.** A foreign key references a *candidate key* of
  the parent, which is usually but not always the parent's primary key. `orders.customer_id`
  references `customers.id`; if it referenced `customers.email` it would be equally valid
  and considerably worse, because an email change would then be an update to every
  referencing row.
- **It explains why `PRIMARY KEY` implies `NOT NULL` and `UNIQUE`.** Not as a convention —
  as a requirement, because a primary key that permits `NULL` cannot identify anything, since
  `NULL = NULL` is unknown (Volume 2 Chapter 6).

> **INTERVIEW TRAP — "`UNIQUE` ALLOWS ONE NULL, RIGHT?"**
>
> This is true in most engines *by accident of the SQL standard's NULL semantics*, and it is
> a genuine data-integrity hole rather than a feature. The standard's rule for a `UNIQUE`
  constraint is that two rows are duplicates if no column is *distinctly* unequal — and
> `NULL` is never distinctly unequal to anything, including another `NULL`. The practical
  result is engine-dependent and worth knowing precisely:
>
> | Engine | Multiple `NULL`s under `UNIQUE` |
> | --- | --- |
> | PostgreSQL | Allowed (9.0+ treats `NULL`s as distinct) |
> | MySQL / InnoDB | Allowed |
> | SQL Server | **Not** allowed — one `NULL` per `UNIQUE` column |
> | Oracle | Allowed |
>
> So `email VARCHAR(255) UNIQUE` will happily let you insert 4,000 rows with
> `email IS NULL` on PostgreSQL. If the column is meant to be genuinely optional and
> genuinely unique-if-present, that is fine and often intended. If it is a mistake —
> the kind where every row should have an email — the constraint did not stop it, and the
> `NULL`s are now rows your application cannot look up. The fix when you want
> "at most one NULL" is a partial unique index (PostgreSQL: `CREATE UNIQUE INDEX ... WHERE
> col IS NULL`) or a filtered index (SQL Server), not a `CHECK`, because `CHECK` cannot see
> other rows.

### 3.3 Attributes, Domains and Why Types Are Constraints

A *domain* is a named set of permissible values plus the operations valid on them. In
practice the domain is what stops a "postcode" from holding a negative number, and it is
the cheapest place to enforce a rule that can never be violated — because it is enforced by
the storage engine on every write, from every client, forever.

The interesting consequence is that a database type is not just a storage optimisation. It
is a *constraint you get for free and can never be removed*. A `NUMERIC(12,2)` column
cannot hold a value that is not a number with two decimal places and at most ten integer
digits. That constraint is available to every writer forever, which makes it very hard to
give up later: migrating `NUMERIC(12,2)` to `NUMERIC(18,6)` is a table rewrite, and
migrating a `VARCHAR` to an `ENUM` and back is worse.

> **PRODUCTION SCENARIO**
>
> Problem: a payments reconciliation job has been reporting a £0.00 difference against the
> ledger for three weeks. The product team believes it is a rounding bug in the report
> writer.
> Investigation: the report is correct. The `amount` column is `NUMERIC(12,2)` and the
> ledger is `NUMERIC(18,6)`. A single transaction routed through a legacy settlement
> service carries a sub-cent amount, and the `NUMERIC(12,2)` column silently rounded it on
> the way in. `SELECT SUM(amount) FROM ledger` and `SELECT SUM(amount) FROM payments`
> disagree by the accumulated rounding, forever.
> Root cause: a domain that is too narrow. The column type was chosen when the system only
> ever handled whole pennies, and it enforces that choice on every write forever — silently,
> because `NUMERIC` rounds rather than errors by default.
> Solution: widen the column to `NUMERIC(18,6)`, backfill, and add a reconciliation query
> that compares both sums in CI.
> Prevention: treat a rounding boundary as a schema decision, not a formatting decision, and
> when a value must not be rounded, make the column reject it — Postgres's `NUMERIC` has no
> silent-rounding mode, but the general rule is that the *type* should make the illegal
> value unrepresentable, not merely discouraged.

### 3.4 Relations Between Relations

The relational model has no foreign keys, no cascades, and no triggers. This is
deliberate, and it is the source of the most persistent confusion in database interviews:
people assume the model enforces integrity, and the model famously does not. Referential
integrity is an *implementation* feature layered on top, and every engine provides it with
slightly different semantics and a different cost.

```text
  RELATIONAL MODEL (Codd, 1970)          IMPLEMENTATION (PostgreSQL, InnoDB, ...)
  ───────────────────────────────          ──────────────────────────────────
  No foreign keys. A relation cannot      FK constraints, ON DELETE CASCADE /
    reference another relation —           SET NULL / RESTRICT / NO ACTION
    it can only contain values.           Checked per statement, holding locks
                                           for the duration.
  No NULL — the model has no way to      NULL everywhere, and three-valued
    express "unknown", so it doesn't.       logic as a consequence
  No ordering                            ORDER BY, indexes, and a planner
                                           that cares about both
```

The gap matters for how you talk about integrity. "The database enforces referential
integrity" is true of every major engine and false of the model. The stronger, more useful
statement is about *where* integrity is enforced and what that costs, because the choice
between "enforce in the schema" and "enforce in the application" is one of the most
expensive decisions in a data layer, and it recurs in every system design round.

> **TRADE-OFF — "SHOULD THE DATABASE ENFORCE THE FOREIGN KEY?"**
>
> **Enforce it** when the data outlives the code that writes it, when more than one service
> or job writes the table, or when the reference is genuinely load-bearing. A foreign key is
> a distributed assertion that a certain kind of bad state is now impossible, and it holds
> for every future writer including the one you have not written yet.
>
> **Do not enforce it** when the referenced rows live in another service, when the table is
> sharded or the reference is intentionally soft (a row that survives its parent), or when
> the write path cannot tolerate the lock. A foreign key check takes a lock on the parent
> row for the duration of the statement; on a hot parent row — a customer with 40,000 orders
> — that serialises inserts and shows up as lock waits, not as slow queries.
>
> The condition that flips the answer is usually **who else can write this table.** One
> writer, in one service, that you deploy together with the schema: an application-level
> check is fine and cheaper. Three writers, one of which is a data import job that runs
> outside your deploy: the constraint is what stops a bad import from corrupting the
> production table, and the lock cost is the price of that.

#### Common Mistakes

- Saying the relational model enforces referential integrity — it has no foreign keys at
  all; every engine added that on top
- Describing a relation as a set and then writing SQL that returns duplicates, without
  noticing the mismatch
- Claiming `PRIMARY KEY` and `NOT NULL UNIQUE` are interchangeable — they differ in
  semantics, in the automatic index each creates, and in the fact that many engines allow
  multiple `NULL`s under a plain `UNIQUE`
- Treating `email` as a plain column when it is a candidate key and belongs in a constraint
- Reaching for a database type to express a business rule that is a *range over time* or a
  *cross-row* invariant, neither of which a type can carry

#### Interview Questions — The Relational Model

**Q1. What is a relation, and where does SQL fall short of that definition?** `TRICKY`

A relation is a set of tuples, each an ordered list of attribute values drawn from named
domains, with tuples unique by definition. SQL's tables are bags, not sets, so duplicates
survive unless you remove them — which is why `UNION` implies a dedupe and `UNION ALL`
does not, and why `DISTINCT` carries a real cost. The other gaps are that SQL has no
ordering guarantee outside `ORDER BY`, and that it introduces a third truth value: since
`NULL` means "not known" rather than "not applicable", `NULL = NULL` is *unknown* rather
than true or false, and every comparison involving it is a three-valued-logic problem
rather than a boolean one.

**Q2. What is the difference between a superkey, candidate key, and primary key?** `STAFF`

A superkey is any set of attributes that uniquely identifies a tuple — `{id}`,
`{id, email}`, `{id, email, created_at}` are all superkeys of the same table. A candidate
key is a *minimal* superkey, one where removing any attribute breaks uniqueness — so if
`{id}` and `{email}` are both minimal, the table has two candidate keys and they are
alternates of each other. The primary key is the one chosen candidate key, and the others
become alternate keys, typically protected by `UNIQUE` constraints. The practical reason the
vocabulary matters: naming the alternate candidate keys is how you find the columns that are
genuinely identity, and those are exactly the columns that should carry a `UNIQUE`
constraint whether or not you ever query on them.

**Q3. The relational model has no foreign keys. So how is referential integrity enforced?** `ADVANCED`

It isn't by the model — the model is a logical theory with no reference mechanism at all, by
design, so that it can be reasoned about independently of any storage engine. Referential
integrity is an implementation feature that every major engine layers on: a constraint that
verifies, on every insert and update of the child, that the referenced candidate key exists
in the parent, holding a lock on the parent row for the duration of the statement. This is
why "enforce integrity in the database" and "enforce it in the application" is a real
trade-off rather than a preference — the database version is universal (it covers every
writer) and costs a lock, while the application version is free and covers only the writers
you control.

**Q4. Why does the relational model have no NULL — and what did adding it cost?** `STAFF`

Because "no value" is not a value, and the model's closure properties (the ones that make
the algebra tractable) assume a domain with no distinguished "unknown" member. SQL added
`NULL` anyway, because real data has genuinely unknown values, and the cost is
three-valued logic: every comparison yields true, false, or *unknown*, and `WHERE` admits a
row only when the predicate is definitely true. That produces a family of results nobody
designs and everybody memorises — `NOT IN` with a `NULL` in the list is never true,
`COUNT(col)` skips nulls, `SUM` of no non-null values is `NULL` rather than zero, and
comparisons to `NULL` must be written `IS NULL` rather than `= NULL`. It is a small,
sharp, permanent wart that a whole chapter of interview questions lives on.

#### Further Reading

- [E. F. Codd — A Relational Model of Data for Large Shared Data Banks (1970)](https://dl.acm.org/doi/10.1145/362384.362685) — the original paper, still readable, and the source of the bag-vs-set argument.
- [PostgreSQL — Unique Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-UNIQUE-CONSTRAINTS) — the authoritative statement of the "multiple NULLs are distinct" rule and how to override it.
- [PostgreSQL — Foreign Keys](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FOREIGN-KEYS) — the full `ON DELETE` / `ON UPDATE` action matrix, including `DEFERRABLE`.
- [Database Design — Normal Forms](https://www.postgresql.org/docs/current/ddl-constraints.html) — constraints as the enforcement layer on top of the model.
- [The Morning Paper — Codd on the Relational Model](https://www.cs.berkeley.edu/~lorem/csf08-html/27x7/p226-codd.pdf) — the argument for the model, in Codd's own framing.

> **CHAPTER 3 SUMMARY**
>
> The relational model is a *logical* theory that says nothing about storage, and every
> engine is free to ignore the parts it finds inconvenient — which is why SQL has bags where
> the model has sets, `NULL` where the model has nothing, and implementation-layer foreign
> keys where the model has no concept of reference. The vocabulary that earns its keep at
> senior level is superkey/candidate/alternate key, because naming the other candidate keys
> is how you find the columns that are genuinely identity and should carry a `UNIQUE`
> constraint. Integrity can be enforced in the schema (universal, costs a lock) or the
> application (free, covers only your writers), and the flip condition is almost always
> *how many things can write this table*.

## Chapter 4 — Keys, Constraints & Referential Integrity

### 4.1 Constraints Are the Cheapest Thing You Will Ever Add

A `CHECK` constraint or a `UNIQUE` constraint costs effectively nothing on the read path
and a small, predictable amount on the write path, and it enforces an invariant on *every*
writer forever — including the batch job, the migration script, the admin console, and the
engineer who joins in six months. It is the highest ratio of protection to cost available
anywhere in a system.

```text
  Enforcement in the schema                 Enforcement in the application
  ─────────────────────────                 ──────────────────────────────
  ✓ covers every writer, forever            ✗ covers only writers you control
  ✓ cannot be bypassed by a bug             ✗ one missing validation, one bad row
  ✗ needs a migration to relax              ✓ change the rule by deploying
  ✗ a hot parent's FK serialises writes     ✓ no lock, no contention
  cost: small, per-statement, predictable   cost: permanent, unmeasured, in prod
```

The failure mode of *not* having them is worse than it looks, because an integrity
constraint is not a safety net you rarely need — it is a claim about the shape of your
data that you make once and then never have to think about. The failure mode of *having*
them is that they block a legitimate write and produce a constraint-violation error, which
is a *good* error: it is loud, it is at the right layer, and it is impossible to misdiagnose
as a rendering bug.

> **PRODUCTION RELEVANCE**
>
> "The database prevents negative inventory" is a sentence that ends an entire category of
> incident. "The service validates the request body" is a sentence that means: it is true on
> the happy path, on one endpoint, until someone adds a second write path — a data
> migration, a backfill script, an admin tool, a second service that grew up next to this
> one. Constraints do not have that problem. They are the only integrity mechanism in the
> system that scales with the *number of writers* rather than with the number of engineers
> who remember.

### 4.2 `CHECK`: Invariants the Type System Cannot Express

A `CHECK` is a boolean expression over the row that must evaluate to true (or unknown) on
every insert and update. The most valuable use is expressing an invariant that is a *range
over time* or a *relationship between columns* — things a per-column type is structurally
incapable of.

```sql
-- the obvious: a range, which a type could nearly express
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_dates_valid
  CHECK (starts_at < ends_at);

-- the valuable: a cross-row-shaped invariant on one row
ALTER TABLE employees
  ADD CONSTRAINT salary_within_band CHECK (salary BETWEEN 0 AND salary_cap),
  ADD CONSTRAINT manager_not_self  CHECK (manager_id IS NULL OR manager_id <> id);

-- the very valuable: a temporal non-overlap *anchor* that makes the app's job easier
ALTER TABLE price_history
  ADD CONSTRAINT price_positive CHECK (unit_price_cents > 0);
```

What a `CHECK` is *not* good for is anything referencing another row — a `CHECK` is
evaluated against the row being written and nothing else, so `CHECK (end_date > start_date
AND start_date > (SELECT MAX(start_date) FROM t))` is not a constraint, it is a correlated
subquery masquerading as one, and it either errors out or silently does the wrong thing
depending on the engine. Cross-row invariants need a unique index, a trigger, or — much
more often — a redesign so the invariant becomes single-row.

> **INTERVIEW TRAP — "I VALIDATE IT IN THE SERVICE LAYER, WHY DO I NEED A `CHECK`?"**
>
> The service-layer validation and the constraint are answering different questions. The
> question the *service* answers is "did this request arrive well-formed?" The question the
> *constraint* answers is "is this row, right now, in a state the rest of the system can
> assume is impossible?" Those come apart in four ordinary ways:
>
> 1. **The second write path.** A backfill script, a data import, an admin tool, a
>    migration. All of them can write, and none of them go through your service.
> 2. **The race.** Two requests both pass validation, and the check is
>    "quantity > available". Both succeed. Now the invariant is violated and no `throw` ever
>    fired, because both requests were individually valid.
> 3. **The partial failure.** The service validates, then writes to two tables, and the
>    second write fails. The transaction rolls back — good — but the same code path invoked
>    from a queue consumer with a slightly different ordering does not.
> 4. **The rule changes.** The business moves the boundary. The code deploys on Tuesday; the
>    constraint drops on Wednesday when someone runs a migration to relax it. For a day, the
>    old rule is gone from the database and the new rule is not yet in the code. The window
>    is small and it is exactly when bad data gets written.
>
> The senior-level framing: **validation protects a request; a constraint protects a
> dataset.** You need both, they do different jobs, and the question "why both" has a much
> better answer than "defence in depth".

### 4.3 Foreign Keys, Cascades and the Delete Question

The reference constraint is the most consequential schema decision in a system, because the
`ON DELETE` action is a *policy about what happens to data when something goes away* — and
policies like "cascade" can quietly destroy more data than any bug.

| Action | What happens to children | Use when |
| --- | --- | --- |
| `RESTRICT` | Reject the parent delete immediately | children must be explicitly re-homed first |
| `NO ACTION` | Reject at statement/constraint-check time (deferrable, so at commit) | you want to move rows then delete |
| `CASCADE` | Delete the children | the child is meaningless without the parent, and there are few |
| `SET NULL` | Null the child's FK column | the child survives; the link is optional |
| `SET DEFAULT` | Set the FK to its default | rarely — needs the default to be a valid existing row |

The choice that needs a conversation is `CASCADE`. It is correct when the child is a
*component* of the parent — `order_line` items of an `orders` row genuinely cannot exist
without the order, and a user has no meaningful interest in orphaned lines. It is
catastrophic when it is applied by habit. Consider a user with four years of orders: a
support action that deletes a `users` row cascades four years of history in one statement,
and if that statement is not inside an explicit transaction, it cannot be rolled back.

> **PRODUCTION SCENARIO**
>
> Problem: an engineer runs a one-off `DELETE FROM users WHERE email = 'test@...'`. It takes
> 4.7 seconds and locks two tables. Nobody is down. Six weeks later a support ticket arrives
> because a customer's entire order history has vanished from the admin UI.
> Investigation: `orders.user_id` had `ON DELETE CASCADE`, applied when the table was created
> for a `user_preferences` child table. The cascade took 41,000 `orders` rows with it. The
> delete was not in a transaction because `psql` wraps a single statement in an implicit
> transaction, which is correct — the statement succeeded, so there was nothing to roll back.
> Root cause: cascade chosen for convenience on a table where the child is not a component
> of the parent. `orders` survives its user; it just no longer has one.
> Solution: restore from PITR, and change the constraint to `ON DELETE SET NULL` with a
> nullable `user_id` plus a `deleted_at` on `users` for soft deletion.
> Prevention: default to `RESTRICT` and make cascade an explicit, reviewed decision.
> `CASCADE` on a table that grows without bound is a review flag, not a style preference —
> and any `DELETE` on a large table should be wrapped in an explicit transaction with a
> `SELECT count(*)` first.

### 4.4 Deferrable Constraints and Why They Exist

A constraint is checked immediately by default, and that is the wrong behaviour for any
invariant that spans multiple rows written in a specific order — the most common case being
a tree, where you cannot insert a child before its parent exists.

```sql
-- Immediate by default: checked row by row as the statement runs.
-- Fails, because at this instant the parent does not exist.
BEGIN;
  INSERT INTO category (id, name) VALUES (10, 'Books');
  INSERT INTO category (id, name, parent_id) VALUES (11, 'Fiction', 10);  -- ok
COMMIT;

-- The genuinely awkward case: a cycle, or a multi-row move.
ALTER TABLE category
  ADD CONSTRAINT category_parent_fk
  FOREIGN KEY (parent_id) REFERENCES category(id)
  DEFERRABLE INITIALLY DEFERRED;   -- checked at COMMIT, not per row

BEGIN;
  -- Swap two parents' positions. Each step transiently violates the constraint.
  UPDATE category SET parent_id = 12 WHERE id = 11;
  UPDATE category SET parent_id = 11 WHERE id = 12;
COMMIT;   -- the only place the constraint is evaluated — and it passes
```

This is a small feature with a large lesson: **the constraint is a statement about
transaction boundaries, not about rows.** A `DEFERRABLE` constraint is the honest way to
express "this must hold when I commit", and using it is a signal that you understand that
constraints are about transaction state rather than row state.

> **MUST REMEMBER**
>
> `PRIMARY KEY` = unique + not null, enforced by the storage engine on every write.
> `FOREIGN KEY` = a lock on the parent row for the duration of the statement. `CHECK` = a
> per-row boolean, and useless across rows. `DEFERRABLE` = check at commit, not per
> statement. Those four facts answer most of what gets asked about constraints.

#### Common Mistakes

- Answering "the service validates it" when asked why a `CHECK` is needed, without
  addressing the second write path or the race between two individually-valid requests
- Using `ON DELETE CASCADE` by habit rather than by decision, and treating it as a
  convenience setting rather than a data-destruction policy
- Assuming a `CHECK` can reference other rows — it cannot, and the subquery version either
  errors or silently does the wrong thing
- Believing constraints are validated only by `INSERT` — `UPDATE` is checked too, and an
  update that touches a `CHECK`ed column is validated the same way
- Forgetting that adding a constraint to an existing table requires validating every
  existing row, which on a large table is a full scan and a long lock

#### Interview Questions — Constraints & Integrity

**Q1. Why enforce integrity in the database when the application already validates?** `STAFF`

Because they answer different questions and cover different writers. Application validation
answers "did this request arrive well-formed?" A constraint answers "is this row, right now,
in a state the rest of the system can assume is impossible?" They come apart when there is a
second write path — a backfill, an import, an admin tool, another service — when two
concurrent requests are each individually valid but jointly violate a cross-row invariant, or
when the rule changes and there is a window between the code deploy and the migration. The
cost of the constraint is a small, predictable amount on the write path plus a lock on the
parent for a foreign key; the benefit is a guarantee that scales with the number of writers
rather than the number of engineers who remembered. On a hot parent row that lock is real
and shows up as lock waits, which is the trade-off to name.

**Q2. When would you choose `ON DELETE CASCADE`, and when would it be a mistake?** `TRICKY`

Correct when the child is a genuine *component* of the parent — `order_line` rows of an
`orders` row have no independent meaning, and a user has no interest in orphaned lines — and
the child set is small. A mistake when it is applied by habit, and specifically on any table
that grows without bound. Deleting a `users` row that cascades four years of `orders` is a
data-destruction policy dressed as a convenience setting, and it is not reversible by a
rollback because the statement succeeded. The default should be `RESTRICT`, with `CASCADE` as
an explicit, reviewed decision, and `SET NULL` plus a `deleted_at` on the parent for the
soft-delete pattern.

**Q3. What is a deferrable constraint, and what problem does it solve?** `ADVANCED`

A constraint checked at `COMMIT` rather than after each statement. It exists for invariants
that span multiple rows whose correct insert order is not the obvious one — building a tree
from the leaves up, swapping the parents of two adjacent nodes, or a multi-row re-parenting
where each intermediate state transiently violates the constraint. With the default
immediate checking, each of those intermediate states fails and the whole transaction is
impossible, even though the final state is perfectly valid. The lesson it teaches is that a
constraint is a statement about the transaction's end state, not about individual rows, and
that when you find yourself working around a constraint, the first question is whether the
invariant genuinely is per-row.

**Q4. You add a `CHECK` to a table with 400 million rows. What happens?** `ADVANCED`

The engine validates every existing row before the constraint is accepted, which is a full
scan of the table under whatever lock the operation takes. In PostgreSQL an `ALTER TABLE ...
ADD CONSTRAINT` takes `ACCESS EXCLUSIVE` for the duration unless you add it as
`NOT VALID` and then `VALIDATE CONSTRAINT` separately, which takes only `SHARE UPDATE
EXCLUSIVE` and can be run incrementally. In MySQL the equivalent is `ALTER TABLE ... ADD
CONSTRAINT ... , ALGORITHM=INPLACE, LOCK=NONE` where the engine supports it. And before any of
that, the engineering question: if existing rows violate it, the migration fails, so you
need to have found and remediated the violations first. This is a recurring shape — adding
a constraint to a large table is a migration with a data-quality prerequisite, not a schema
change.

#### Further Reading

- [PostgreSQL — Table Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — every constraint type, the `NOT VALID` / `VALIDATE` split, and the full action matrix.
- [PostgreSQL — `ALTER TABLE`](https://www.postgresql.org/docs/current/sql-altertable.html) — the lock levels each form of `ALTER TABLE` takes, which answers the previous question directly.
- [MySQL — InnoDB Foreign Key Constraints](https://dev.mysql.com/doc/refman/8.0/en/innodb-foreign-key-constraints.html) — the official rules, including index requirements on the child and parent.
- [SQL Standard — `CHECK` Constraint Behaviour](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS) — why `CHECK` passes on `NULL`, and the `NULL NOT VALID` workaround.
- [Use The Index, Luke — `NOT NULL` Constraint](https://use-the-index-luke.com/sql/where-clause/null/not-null-constraint) — why the one constraint you probably think of as free is the one that most changes what a row can be indexed as.

> **CHAPTER 4 SUMMARY**
>
> Constraints are the cheapest protection available: near-zero read cost, small predictable
> write cost, and they cover every writer including the ones you did not write. `CHECK` is a
> per-row boolean and useless across rows; `FOREIGN KEY` is a lock on the parent row;
> `ON DELETE CASCADE` is a data-destruction policy and should be an explicit decision rather
> than a default; `DEFERRABLE` moves the check to commit and is the right tool for any
> invariant whose correct write order is not the obvious one. The question in a design
> review is never "schema or application" — it is *how many things can write this table*,
> and the answer decides it.

## Chapter 5 — Normalisation & Denormalisation

### 5.1 What Normalisation Is Actually For

Normalisation is not about tidiness, and it is not a purity ladder you climb for points. It
is a set of rules for *removing redundancy caused by functional dependency violations*, and
the reason to remove redundancy is a specific, mechanical one: **it is only safe to store a
fact in one place if updating the fact requires updating that one place.**

The failure this prevents is an *update anomaly*, and it is worth walking through the
canonical example so the argument is felt rather than recited.

```text
  UNNORMALISED
  ┌────┬───────────────┬──────────────────┬─────────────┬────────┐
  │ id │ customer_name │ customer_city    │ order_date  │ amount │
  ├────┼───────────────┼──────────────────┼─────────────┼────────┤
  │ 1  │ Alice Ahmed   │ London           │ 2026-01-03  │ 120.00 │
  │ 2  │ Alice Ahmed   │ London           │ 2026-01-09  │  80.00 │
  │ 3  │ Alice Ahmed   │ London           │ 2026-02-14  │ 200.00 │
  │ 4  │ Bob Ncube     │ Manchester       │ 2026-02-20  │  60.00 │
  └────┴───────────────┴──────────────────┴─────────────┴────────┘
        └───── same fact, 3 copies ─────┘
```

Three anomalies follow, and every one of them is a production incident someone has already
had:

- **Update anomaly** — Alice moves to Manchester. Do you update one row or three? Update one
  and the table is inconsistent and every report about customer city is wrong. Update three
  and you have a loop, and the loop misses any rows added while it runs.
- **Insertion anomaly** — a new customer signs up and has not ordered yet. You cannot record
  the customer without inventing an order, because there is no row in which to put them
  with no order date. So they are not recorded, and then the first order has to create the
  customer and hope the details match.
- **Deletion anomaly** — you delete order 3, the only order that happened to be Alice's only
  record of her city in that month. You have now lost data about a customer who still exists.
  Deleting an *order* destroyed information about a *customer*. That is the tell that the
  table is holding two entities' facts at one grain.

> **INTERVIEW TRAP — "NORMALISATION MAKES WRITES SLOWER, SO IT'S OUTDATED"**
>
> This is the single most common wrong answer on data modelling, and it fails on its own
> terms. The "slow writes" claim compares an insert into one denormalised table against an
> insert into one normalised table *with no joins* — which is not a comparison normalisation
> actually asks for, because the denormalised form is not admissible: it stores the same
> fact three times, so the cost model is different in kind, not in degree. You cannot move
> Alice without touching three rows. The honest version of the trade-off is:
>
> - Normalisation removes **anomalies** — classes of incorrect data that no amount of
>   application code prevents, because the code is not the only writer.
> - Denormalisation buys **read latency and join avoidance** at the cost of a second
>   consistency mechanism, which you now have to build, run, and monitor.
>
> So the sequence is: normalise first, because the invariants are worth more than the
> latency; then, for the specific queries that are actually slow, denormalise *that* path
> deliberately and own the sync. The common failure is the reverse — denormalise everywhere
> "to be fast", then discover you have three code paths that must update five tables in the
> right order or they disagree. That is not performance engineering, it is a distributed
> system with no transactions, and it is far more expensive than a join.

### 5.2 The Normal Forms and What Each One Fixes

```text
  ┌──────────┬──────────────────────────────────────────┬─────────────────────────┐
  │ 1NF       │ Atomic values. No arrays, no repeating   │ Fixes: multi-valued      │
  │           │ groups, no "col1, col2, col3" columns.   │ attributes and ragged    │
  │           │ A row is a row; a cell is a value.       │ rows.                    │
  ├──────────┼──────────────────────────────────────────┼─────────────────────────┤
  │ 2NF       │ 1NF + no partial dependency on a         │ Fixes: update and       │
  │           │ composite key. Every non-key column       │ insertion anomalies in  │
  │           │ depends on the WHOLE key.                 │ tables with composite   │
  │           │                                           │ keys.                    │
  ├──────────┼──────────────────────────────────────────┼─────────────────────────┤
  │ 3NF       │ 2NF + no transitive dependency. No        │ Fixes: the update        │
  │           │ non-key column depends on another         │ anomaly — the one that  │
  │           │ non-key column.                           │ actually bites.         │
  ├──────────┼──────────────────────────────────────────┼─────────────────────────┤
  │ BCNF     │ 3NF + every determinant is a candidate    │ Fixes: non-trivial FD   │
  │           │ key. (A → B where A is not a key is      │ violations a 3NF       │
  │           │ illegal even if B is not part of a key.) │ schema still permits.  │
  ├──────────┼──────────────────────────────────────────┼─────────────────────────┤
  │ 4NF      │ 3NF + no non-trivial multi-valued          │ Fixes: the insertion    │
  │           │ dependency.                               │ anomaly where the       │
  │           │                                           │ redundancy is an MVD    │
  │           │                                           │ not an FD.              │
  ├──────────┼──────────────────────────────────────────┼─────────────────────────┤
  │ 5NF      │ 4NF + no join dependency. Every            │ Rarely reached. Fixes    │
  │           │ nontrivial lossless decomposition is      │ MVD cases 4NF cannot    │
  │           │ handled by decomposition.                  │ decompose further.      │
  └──────────┴──────────────────────────────────────────┴─────────────────────────┘
```

The terminology that makes the rest readable is **functional dependency**: a set of
attributes `A` *functionally determines* `B` (written `A → B`) if any two rows agreeing on
`A` must also agree on `B`. So in the table above, `id → customer_name, customer_city,
order_date, amount` and `id → customer_city` (via `customer_name`) and the whole thing is
2NF and not 3NF, because `customer_name → customer_city` is a transitive dependency through a
non-key column.

The normal forms that matter in practice are **2NF and 3NF**, and 3NF is where most real
schemas should land. BCNF, 4NF and 5NF are worth being able to *name* in an interview, and
2NF is worth understanding because it is the one that explains why composite-key tables with
extra columns are dangerous. Everything above 3NF is a small fraction of schemas and a large
fraction of the vocabulary.

> **INTERVIEW TRAP — "WHAT'S THE DIFFERENCE BETWEEN 3NF AND BCNF?"**
>
> A subtle point that is worth getting right rather than hedging on. Both forbid a
> non-key attribute from depending on a non-key attribute. **3NF relaxes this when the
> *determinant* is a candidate key** — it only requires that no non-key attribute depends on
> a non-key attribute, so `A → B` where `A` is *another* candidate key is allowed. BCNF does
> not relax it: BCNF requires that *every* determinant in the schema is a candidate key, so
> a dependency `A → B` is illegal unless `A` itself is a candidate key. The gap shows up
> when a table has overlapping candidate keys — say `(student, subject)` and `(student,
> exam)` are both candidate keys for the same table, and there is a dependency
> `student → tutor`. That is fine in 3NF (the determinant is a candidate key) and illegal in
> BCNF. The pragmatic answer: 3NF schemas are almost always good enough, BCNF is the
> theoretical refinement, and the difference matters far less than whether anyone has
> actually checked what the candidate keys are.

### 5.3 Physical Denormalisation, and What It Costs

Normalisation is a *logical* decision. Denormalisation is a *physical* one, and the two
are independent — which is the point most people miss. You can normalise your schema fully
and still denormalise for performance by adding a redundant column that is maintained by a
trigger, a generated column, or a background job.

```text
  LOGICAL SCHEMA                    PHYSICAL ADDITION (all three are "the same")
  ──────────────                    ──────────────────────────────────────
  orders(id, customer_id, ...)     + orders.customer_country  (denormalised,
  customers(id, name, country)                                          maintained by trigger)
                                     + customers.order_count    (denormalised,
                                                                  maintained by job)
                                     + MATERIALIZED VIEW daily_revenue
                                       (denormalised, maintained by REFRESH)
```

The three have very different cost profiles, and picking between them is a real engineering
decision:

| Mechanism | Freshness | Write cost | Failure mode |
| --- | --- | --- | --- |
| Trigger / `GENERATED` column | immediate | +1 write per row on the parent | slows the write path; the usual choice when the value is read constantly |
| Materialized view | until `REFRESH` | zero on the base tables | silently stale; needs a refresh schedule and a staleness SLA |
| Application / async job | seconds to minutes | one message per write | a partition-boundary failure means permanently wrong numbers with no error |

> **TRADE-OFF — "SHOULD I DENORMALISE?"**
>
> The condition that says yes is: **the join is on a measured hot path, you have the numbers
> to prove it, and you can name how the redundancy stays consistent.** All three. If any
> one is missing — it is a slow *suspicion*, or you cannot say how the copy is kept in step,
> or the "denormalisation" is a column that three services write to — the answer is no.
>
> The reason to be conservative is that denormalisation converts a *consistency* problem the
> database already solves (a transaction across two rows) into a *distributed consistency*
> problem you now have to solve yourself (a transaction across two services, or a job, or a
> trigger with its own failure semantics). The database's version is faster, synchronous,
> and already tested. Trading it for a millisecond of join latency is usually a bad deal, and
> it is *always* a bad deal if you are guessing rather than measuring.
>
> The senior-level version of the question is also about reversibility: denormalising is
> cheap to do and expensive to un-do, because by the time you want to remove the redundancy
> there are four code paths and a job that read the denormalised column and cached it.

### 5.4 Grain, and the Question That Resolves Most Design Disagreements

Before choosing keys or normal forms, the useful question is one word: **what is the grain of
this table — what does one row represent?**

Almost every schema design disagreement is a grain disagreement in disguise. Two engineers
building `orders` will each write a correct table, and the bug appears when the code assumes
one row per order and gets three.

```text
  "orders" — one row per what?
  ──────────────────────────────
  one per ORDER        → order_id is the PK.  line items in orders_line.
  one per ORDER LINE   → the thing called an order is gone; you have lines
                         with no order header. Fine, if nothing needs header
                         attributes. Usually a mistake.
  one per CUSTOMER     → the order count is a number, and the order history is
                         gone. This is a report, not a table.
  one per DAY          → pre-aggregated. You have thrown away the ability to
                         answer anything the aggregation did not anticipate.
```

Grain determines: the primary key, what a `UNIQUE` constraint can even mean, which
aggregations are possible without double-counting, and whether a join to another table will
multiply rows. The join-fanout bug — a query that sums `line.amount` after joining `orders`
to `orders_line` and gets 3× the total — is a grain bug, not a SQL bug, and it is
catastrophic in a financial report.

> **MUST REMEMBER**
>
> State the grain in the schema documentation, in one sentence, in the table comment. "One
> row per `order_line`" costs nothing and prevents an entire class of incident where someone
> counts rows and calls them orders. Every double-counting bug in production is a grain bug
> that nobody wrote down.

#### Common Mistakes

- Treating normalisation as a purity ladder rather than as a specific set of anomaly
  removals — and being unable to say which anomaly 3NF fixes
- Saying "joins are slow" as the reason to denormalise, without a measurement
- Denormalising into a *service* boundary, converting a transactional problem into a
  distributed one, when the same benefit was available from a trigger or a materialized view
- Skipping 2NF entirely because the schema has no composite keys — most production tables do
- Never stating the grain, and then debugging a double-count as a SQL bug
- Believing 5NF is what you need for many-to-many data, when that is a join table and is
  covered by 3NF

#### Interview Questions — Normalisation

**Q1. What problem does normalisation solve, concretely?** `STAFF`

It removes redundancy caused by functional-dependency violations, and the reason to remove
redundancy is mechanical: a fact is safe to store in one place only if updating it requires
updating that one place. The unnormalised version of orders-with-customer-details stores
`customer_city` three times for one customer, which produces three anomalies — an update
anomaly (she moves, do you change one row or three), an insertion anomaly (a new customer
with no orders cannot be recorded at all), and a deletion anomaly (deleting her only order
destroys data about the customer). It is worth being precise that the trade-off is not "fast
writes vs slow writes" — it is "invariants the database enforces for free" against "a second
consistency mechanism you have to build, run, and monitor yourself".

**Q2. Why does 3NF matter and 4NF not come up in practice?** `TRICKY`

3NF removes the transitive dependency that causes the update anomaly, which is the anomaly
that actually causes incidents, and it is achievable in almost any real schema. Above 3NF
you are in rarer territory: 4NF addresses non-trivial multi-valued dependencies, and the
canonical case — a table of people and their phone numbers *and* their email addresses as
two independent lists — is normally solved by two join tables, which is a 3NF design. 5NF
addresses join dependencies, is nearly never reached, and the standard advice is that if you
think you need it you probably have a modelling problem rather than a normal-form problem.
The honest interview answer: 2NF and 3NF are the ones you use, BCNF is worth naming because
it is the theoretical refinement, and 4NF/5NF are vocabulary for a conversation you will
rarely need to have.

**Q3. When is denormalising the right call, and what does it cost?** `STAFF`

The right call needs three things at once: the join is on a *measured* hot path with
numbers, you can name the mechanism that keeps the redundant copy consistent, and the
consistency model is one you can live with — a trigger or generated column for immediate
consistency, a materialized view for staleness bounded by a refresh, an async job for
staleness bounded by seconds. The cost is that you have traded a consistency problem the
database solves synchronously in one transaction for one you now solve across a trigger, a
view refresh, or a service boundary. The failure modes differ sharply: a trigger slows the
parent's write path, a materialized view is silently stale with no error at all, and an async
job can get permanently wrong across a partition boundary with nothing to alert on. The
decision is usually expensive to reverse, because by the time you want the redundancy gone,
several code paths and a job have grown to read it.

**Q4. Your finance report is returning 3× the correct revenue. Where do you look first?** `ADVANCED`

At the grain of the tables in the query, before you look at the SQL. This is almost always
a join fan-out: a query joining an order-level fact to a line-level fact and aggregating a
line-level measure produces one output row per line, not per order, and any order-level
attribute in the select list looks fine while the sum is multiplied by the average number of
lines. The fixes, in order of preference: aggregate the line-level table in a subquery or
CTE to the grain you actually need *before* joining, or use `SUM(DISTINCT ...)` as a
detective measure to confirm the diagnosis before fixing it properly. The underlying defect
is that nobody wrote down the grain of the tables, which is why the prevention is a one-line
table comment rather than a code review rule.

#### Further Reading

- [PostgreSQL — Database Design](https://www.postgresql.org/docs/current/database-design.html) — the official take on nullability, constraints and normalisation.
- [Database Normalization — Wikipedia](https://en.wikipedia.org/wiki/Database_normalization) — the clearest single-page treatment of 1NF–5NF with the anomaly examples.
- [C. J. Date — Normalization and the Relational Model](https://www.informit.com/store/database-relational-model-with-sql-and-os-x-free-download/9780205311693) — the formal treatment, for the candidate who will be asked about BCNF properly.
- [PostgreSQL — Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html) — the refresh options, including `CONCURRENTLY`, and why freshness is a real design parameter.
- [Use The Index, Luke — Index-Only Scans and Covering Indexes](https://use-the-index-luke.com/sql/clustering/index-only-scan-covering-index) — the read-side answer to "how do I stop paying for the join", which is often cheaper than denormalising.

> **CHAPTER 5 SUMMARY**
>
> Normalisation exists to make a fact safe to store in exactly one place, and its payoff is
> the removal of *anomalies* — classes of incorrect data no application code can prevent,
> because the code is not the only writer. 2NF and 3NF are the forms that matter; BCNF,
> 4NF and 5NF are vocabulary. Denormalisation is a *physical* decision independent of the
> logical one, and it is only justified when the slow path is measured, the sync mechanism
> is named, and the resulting staleness is acceptable — because otherwise you have traded a
> transaction the database already runs for a distributed consistency problem nobody asked
> for. The single highest-value habit in this chapter is to write the table's grain in a
> comment: every double-counting bug in production is a grain bug nobody wrote down.

## Chapter 6 — Relational Algebra & the Execution Model

### 6.1 The Algebra Is Declarative, and That Is the Whole Point

Relational algebra is a small, closed set of operators over relations. SQL is a
*syntax* for a subset of it. The operators that matter are five, and every query plan you
will ever read is a composition of them.

| Operator | Symbol | SQL form | What it does |
| --- | --- | --- | --- |
| Selection | σ | `WHERE` | filters rows by a predicate |
| Projection | π | `SELECT col_list` | chooses columns |
| Join | ⋈ | `JOIN ... ON` | combines relations on a condition |
| Union | ∪ | `UNION` | combines relations, removing duplicates |
| Rename | ρ | `AS` | renames attributes |
| plus derived operators: | | | |
| Aggregation | γ | `GROUP BY`, `COUNT`, `SUM` | groups and reduces |
| Semi-join | ⋉ | `EXISTS`, `IN` | keeps left rows with a match in right |
| Anti-join | ▷̸ | `NOT EXISTS` | keeps left rows with *no* match in right |

The reason this matters is not academic. SQL's *logical* evaluation order — `FROM`, then
`WHERE`, then `GROUP BY`, then `HAVING`, then `SELECT`, then `DISTINCT`, then `ORDER BY`,
then `LIMIT` — is not the order you write the clauses, and it is not arbitrary. It is the
order that makes the operators compose, because each one consumes the output of the last.
`WHERE` cannot reference a `SELECT` alias because projection has not happened yet, and a
window function cannot be filtered by `WHERE` because windowing happens after `GROUP BY`.
Volume 3 covers this in full; the point here is that the reason for the constraint is the
algebra.

```text
  FROM      ──▶  FROM + JOIN: build the working relation
  WHERE     ──▶  σ: drop rows early (pushdown — cheaper)
  GROUP BY  ──▶  γ: group into partitions, then reduce
  HAVING    ──▶  σ on the *groups* (not the rows)
  SELECT    ──▶  π: project the columns you actually return
  DISTINCT  ──▶  dedupe (implicitly, a sort or hash)
  ORDER BY  ──▶  sort (a new relation; the bag becomes ordered)
  LIMIT     ──▶  truncate
```

> **INTERVIEW TRAP — "WHY CAN'T I USE A COLUMN ALIAS IN `WHERE`?"**
>
> Because `WHERE` filters rows, and the alias does not exist until `SELECT` has run, and
> `SELECT` runs after `WHERE`. It is not a parser quirk — it follows from the algebra. `WHERE`
> operates on a relation of *tuples of the base schema*; `SELECT` is the projection step
> that produces the relation with your chosen names. `ORDER BY` is different because it is
> specified to run after `SELECT`, so aliases are legal there, which is why `ORDER BY total`
> works while `WHERE total > 100` does not.
>
> The genuinely useful part of the answer is the *workaround and its cost*. The standard
> workaround is to repeat the expression: `WHERE price * quantity > 100`, which is free
> because the optimiser evaluates the same expression once. The wrong workaround — and this
> is the actual trap — is wrapping the query in a subquery or CTE and filtering on the alias
> in the outer query. That works, and it frequently defeats the optimiser's ability to push
> the predicate down to the scan, because now the filter sits above a materialisation
> boundary. The senior answer finishes the thought: if the expression is expensive enough
> that you want to name it, the right fix is a generated column or a functional index, not
> a subquery.

### 6.2 Pushdown, and Why It Is the Optimiser's Most Valuable Trick

The single largest class of optimiser transformation is **pushing predicates down toward the
leaves** of the plan tree. The intuition is that a filter applied early removes rows that
would otherwise be joined, aggregated, sorted, or shipped.

```text
  NAIVE (filter last)              PUSHED DOWN (filter first)
  ─────────────────────            ────────────────────────
  join(orders,                     scan orders  ──┐
       customers)  ◀── 41M rows       WHERE status='SHIPPED' ── 40K
  filter status='SHIPPED'          scan customers ── 8M
  ◀── 40K                          hash join  ◀── 8M into 40K
                                    ◀── 40K
  Cost: join 41M × 8M               Cost: scan 41M + scan 8M, join 40K
```

This is why a `WHERE` clause on the big table is dramatically cheaper than the same filter
applied after a join, and why the optimiser does it automatically in most cases — but not
all. The cases where it cannot, and the reasons, are the interesting part:

- **A predicate on the nullable side of an outer join cannot be pushed** past the join
  without changing the result. `LEFT JOIN customers ON o.cid = c.id WHERE c.tier = 'GOLD'`
  cannot become a pushed filter on `customers`, because doing so would drop orders with a
  `NULL` customer that the outer join was supposed to preserve. The engine does not push it;
  it runs the join and then filters. (And — this is the trap from Volume 3 — that filter
  after the join also discards the unmatched orders, silently converting the `LEFT JOIN`
  into an inner join. The optimiser is right not to push it; the *query* is still wrong.)
- **A predicate on the *inner* side of an inner join can always be pushed**, and always is.
- **A volatile function cannot be pushed**, because evaluating it earlier could produce a
  different answer. `WHERE random() < 0.01` gets no pushdown.
- **A subquery predicate is only pushed when the subquery is uncorrelated**, because a
  correlated subquery depends on the outer row.

> **MUST REMEMBER**
>
> The optimiser pushes predicates toward the leaves. The queries where this does not save
> you are exactly the queries where a human already wrote the filter in the wrong place, or
> where the join type makes the filter's position semantically load-bearing. Reading a plan
> is largely reading *where the filters ended up*.

### 6.3 Join Order Is Not Your Job, and the Limit Is Not Large

A very common interview anxiety is "does join order affect performance?" The precise answer
has two halves, and stating both is the senior answer.

**Half one: you should not write the join order, and it barely matters.** SQL's `FROM` and
`JOIN` clauses are unordered sets of relations, and the optimiser explores orderings
permutatively. `a JOIN b JOIN c` and `c JOIN a JOIN b` produce the same logical plan and
almost always the same physical plan. The optimiser is doing this work and it is doing it
better than you.

**Half two: it does matter, but only where the optimiser cannot help.** Two situations:

1. **More tables than the planner will search exhaustively.** As established in Chapter 1,
   the search is dynamic programming over interesting orderings, and past roughly 8–10
   tables the space becomes too large and the optimiser falls back to heuristics. A
   14-table join is being planned heuristically and the join order you wrote may be what
   you get.
2. **When the optimiser is misinformed.** This is the real one. Join order is chosen using
   estimated row counts, so a stale statistic on the driving table produces a bad order
   *just as surely* as it produces a bad access path. The fix is `ANALYZE`, not
   reordering the query.

There is also a third, non-performance reason join order matters: `LEFT JOIN` is **not
associative**. `a LEFT JOIN b JOIN c` and `a LEFT JOIN (b JOIN c)` are different queries
with different results, and the parser is entitled to regroup them in ways that change
semantics unless the join types constrain it. This is the single most dangerous thing
about join order, and it is a correctness issue, not a performance one.

> **INTERVIEW TRAP — "DOES JOIN ORDER MATTER?"**
>
> The reflexive answer is "no, the optimiser handles it" and the sharper answer is "yes,
> and here are the three cases where it does". For most queries the optimiser is right and
> your ordering is noise, because the planner permutes orderings and picks by estimated
> cost. Join order becomes yours when the planner stops searching — past roughly 8–10
> tables the search space outgrows the dynamic-programming search and it falls back to
> heuristics — and when the planner is misinformed, since join order is chosen from
> estimated row counts and a stale statistic gives a bad order exactly as readily as a bad
> access path. The third case is the one that actually bites: `LEFT JOIN` is not
> associative, so `a LEFT JOIN b JOIN c` and `a LEFT JOIN (b JOIN c)` are different
> queries, and the parser is entitled to regroup them. That is a correctness hazard, not a
> performance one, and it is worth raising unprompted.

### 6.4 From Algebra to Plan Tree to Execution

A logical plan (the algebra) is not a physical plan (the algorithms and access paths), and
the distance between them is where cost estimation lives.

```text
  LOGICAL (what the algebra says)              PHYSICAL (what will actually run)

  γ orders GROUP BY customer_id                HashAggregate  (hash table on customer_id)
  ⋈                                            │
  σ o.status = 'SHIPPED'                       Hash Join      (orders = build, 40K
  ⋈                                              build; customers = probe, 8M)
  orders                                        │
  customers                                    Seq Scan customers
                                               Seq Scan orders
                                                 + filter status='SHIPPED'

  One logical plan.  Many physical plans.  The optimiser picked one using statistics.
```

The transformations between logical and physical are what you can name in an interview, and
they are the vocabulary of `EXPLAIN`:

| Logical operator | Physical implementations |
| --- | --- |
| selection | index scan, index-only scan, bitmap heap scan, filter on seq scan |
| join | nested loop, hash join, merge join |
| aggregate | hash aggregate, group aggregate (sorted), index-only scan ordered |
| sort | top-N heapsort (for `ORDER BY` + `LIMIT`), full sort |
| set op | hash set operation, merge set operation, dedupe |
| subquery | semi-join, anti-join, decorrelated nested loop, materialise |
| distinct | hash aggregate, sort-based unique, index-only scan |

Volume 4 covers the algorithms and how to read them in a plan. The point here is the shape
of the machine: one logical expression, many physical candidates, and a cost model choosing
between them using statistics that may be wrong.

> **PRODUCTION RELEVANCE**
>
> This is why "add an index and see what happens" is not a debugging method. You are
> perturbing the cost model and hoping the optimiser's guess changes. The actual method is
> to make the statistics true — run `ANALYZE` — and then read what the optimiser does with
> the truth. Teams that learn this stop cargo-culting indexes and start fixing the
> statistics pipeline, which is the only thing that fixes the class of problem rather than
> the instance.

#### Common Mistakes

- Writing the join order and believing it constrains the optimiser — it constrains nothing
  except, for outer joins, the semantics
- Believing `WHERE` is evaluated top-to-bottom as written — it is not, and the pushdown
  rules explain why
- Assuming the optimiser pushes every predicate down — it cannot push a predicate on the
  nullable side of an outer join without changing the result
- Reaching for a subquery to use a `SELECT` alias without knowing it may block predicate
  pushdown
- Describing a plan as "the SQL being executed" rather than as one of many candidates the
  optimiser chose

#### Interview Questions — Algebra & the Execution Model

**Q1. Why can't you use a `SELECT` alias in `WHERE` but you can in `ORDER BY`?** `TRICKY`

Because the clauses run in a fixed logical order that follows the algebra: `FROM`, then
`WHERE` filters rows, then `GROUP BY`, `HAVING`, and only then `SELECT` projects columns —
and projection is what gives a column its alias. `WHERE` therefore operates on a relation
whose attributes still have their base-schema names. `ORDER BY` is specified to run after
`SELECT`, so aliases are available there. The useful part is the cost: the standard
workaround, repeating the expression, is free because the optimiser evaluates it once, but
the common workaround of wrapping the query and filtering on the alias in an outer query can
put the filter above a materialisation boundary and block pushdown to the scan. If the
expression is expensive enough to want a name, the real fix is a generated column or a
functional index.

**Q2. Does join order affect query performance? Give the complete answer.** `STAFF`

Two halves. The optimiser permutes join orderings and picks by estimated cost, so for most
queries your ordering is noise and the planner is right. It becomes yours in three cases:
when the table count outgrows the planner's dynamic-programming search (roughly 8–10
tables) and it falls back to heuristics; when the planner is misinformed, since order is
chosen from estimated row counts and a stale statistic produces a bad order exactly as
readily as a bad access path — the fix there is `ANALYZE`, not reordering; and when the
join types make the order semantically load-bearing, because `LEFT JOIN` is not
associative, so `a LEFT JOIN b JOIN c` and `a LEFT JOIN (b JOIN c)` are different queries
and the parser may regroup them. The third is a correctness hazard rather than a performance
one, and raising it is the difference between a senior and a staff answer.

**Q3. What is predicate pushdown, and when can't the optimiser do it?** `ADVANCED`

Pushing a filter as close to the scan as possible, so rows are discarded before they are
joined, aggregated, sorted, or shipped — often the largest single win in a plan. It fails in
three situations worth naming. A predicate on the nullable side of an outer join cannot be
pushed past the join without changing the result: `LEFT JOIN ... WHERE c.tier = 'GOLD'`
cannot become a filter on the right table, because that would drop the unmatched left rows
the outer join was meant to preserve. A predicate on the inner side of an inner join is
always pushable and always is. A volatile expression cannot be pushed, because evaluating
it earlier may produce a different answer. And a correlated subquery predicate is only
pushable when the subquery is uncorrelated. Worth adding: the outer-join case is exactly
where the "pushed down" query was wrong to begin with, because filtering after the join
also converts the outer join to an inner one.

**Q4. What is the difference between a logical plan and a physical plan?** `TRICKY`

The logical plan is the relational algebra — the operators the query *means*, with no
algorithm attached. The physical plan is one specific implementation the optimiser chose:
which access path per table, which join algorithm, which aggregate and sort strategy. There
is exactly one logical plan for your query and a very large number of physical plans, and
choosing between them is a cost-estimation problem driven by statistics. A single join node
can be a nested loop, a hash join, or a merge join; a single selection can be an index scan,
an index-only scan, a bitmap heap scan, or a filter on a sequential scan. This is why
`EXPLAIN` output is an implementation detail rather than a restatement of your SQL, and why
the same query can be fast or slow depending on statistics nobody has refreshed.

#### Further Reading

- [CMU Database Systems — Join Algorithms and Query Optimization](https://www.cs.cmu.edu/~15451-f22/lectures/11-optimization.pdf) — the course treatment of logical vs physical and the plan space.
- [PostgreSQL — EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) — what the plan output fields mean, from the source.
- [SQL: The Complete Reference — Query Processing](https://www.amazon.com/SQL-Complete-Reference-Second/dp/0072283677) — Elmasri & Navathe's chapter on the relational algebra and the optimisation pipeline.
- [Use The Index, Luke — The Execution Plan](https://use-the-index-luke.com/sql/explain-plan) — how the algebra maps onto real access paths, written for working engineers.
- [J. Gray & A. Reuter — Transaction Processing, Ch. 3](https://www.cs.utexas.edu/~djimenez/utsa/cs3343/Gray%20Book%20on%20Transaction%20Processing.pdf) — the optimiser as a cost model, and why cost estimation is the hard part.

> **CHAPTER 6 SUMMARY**
>
> The algebra is why SQL's clause order is what it is, and it is the reason `WHERE` cannot
> see a `SELECT` alias while `ORDER BY` can. Join order is the optimiser's job for almost
> every real query, and it stops being your job in exactly three cases: more tables than the
> planner will search exhaustively, statistics that are wrong, and outer joins where the
> order is semantically load-bearing because `LEFT JOIN` is not associative. Pushdown is the
> optimiser's most valuable transformation and its interesting failures are all
> semantically motivated — a predicate cannot be pushed past an outer join's nullable side
> without changing what the query means. The distance between the logical plan and the
> physical plan is the distance between "what you wrote" and "what ran", and closing it is
> Volume 4's job.

## Chapter 7 — Scaling Lenses on Relational Data

### 7.1 The Claim, and Where It Is Actually True

"Relational databases don't scale" is one of those statements that is half true in a way
that makes it worse than useless, because the true half identifies a specific structural
limit and the false half lets people skip the fix.

The **true** half: a single relational instance has a single write path. Writes are
serialised through one primary, one log, one set of structures. Vertical scaling is the
escape, and it stops — at the largest instance your provider sells, which is a hardware and
a schema decision rather than a code one. Above that, you replicate, and replication gives
you *read* scale, not *write* scale.

The **false** half: that the data model is what fails. It usually is not. A table with a
missing composite index does not "not scale" because it is relational — it is slow because
of an access pattern, and the fix is a few megabytes of index. The teams that conclude
"NoSQL" from a slow table usually needed `ANALYZE` and one index, and end up with a
document store that is slower, has no transactions, and cannot answer the join they
needed six weeks later.

The useful way to state the limit is as a **concurrency ceiling, not a data ceiling**:

```text
  What actually bounds a relational write path
  ────────────────────────────────────────────
  1. ONE WRITER        — the primary is a single point of serialisation.
                          Throughput = how fast ONE instance can fsync.
  2. ONE LOG           — redo/WAL append must be sequential and durable.
  3. ONE HOTSET        — every transaction touching the same row/page
                          serialises on it, regardless of core count.
  4. STRUCTURED CONTENTION
                        — index maintenance on a hot table is a
                          single-threaded-ish serial cost per write.

  It is NOT bounded by: number of columns, joins, or the relational model itself.
```

> **INTERVIEW TRAP — "WHICH DATABASE WOULD YOU PICK FOR A HIGH-WRITE SYSTEM?"**
>
> The reflexive answer is DynamoDB or Cassandra, and it is usually driven by a benchmark
> that measured single-row puts against a database that was misconfigured. The senior answer
> starts by asking what the write actually is. If it is append-only telemetry, the Postgres
> write path is a sequential WAL append and a heap insert, and partition by time — a
> workload most NoSQL stores handle no better. If it is a *hot key* — every write touching
> the same row, or the same partition — then no store helps, because a single partition is a
> single-node bottleneck in every system, and the fix is to spread the key or shard the
> contention, not to change databases. The genuinely hard case is high write volume *plus*
> rich ad-hoc queries, and that is where the answer is usually "shard by tenant on a
> relational engine", which keeps the joins you cannot give up and gives up only the write
> throughput you were not using. The point worth making out loud: **the bottleneck is
> concurrency, and every store has a concurrency ceiling — they are just at different
> shapes.**

### 7.2 Vertical, Horizontal, and the Order You Should Try Them In

Scaling a relational system is roughly this ladder, and teams routinely start at the wrong
rung.

1. **Do nothing but index it properly.** A large fraction of "we need to shard" is a missing
   composite index, a stale statistic, or an N+1 in the application. This rung is free and it
   is skipped constantly.
2. **Read replicas.** Free-ish, immediate, reversible. Solves read-heavy workloads, which
   are the majority. Does nothing for a write ceiling, and introduces replica lag as a new
   correctness concern (Volume 6 Chapter 7).
3. **Bigger instance.** Buys memory, which buys buffer pool, which buys everything. Often
   the correct rung two. It is a reversible decision until you have designed around the
   instance's limits.
4. **Vertical partitioning (table splitting).** Split one hot wide table into two. Cheap,
   reversible, and often mistaken for sharding.
5. **Partitioning.** One node, many partitions. Buys pruning, maintenance and a fast way to
   drop old data. Does **not** buy throughput across nodes (Volume 6 Chapter 5).
6. **Read/write split with a proxy or a sharding library.** Now you own the routing.
7. **Sharding.** The expensive one. The shard key is a one-way door.
8. **Change the data model.** Only when everything above has failed and you can name why.

The honest staff-level observation: rungs 1–5 are all *reversible in an afternoon*, and rung
7 is not reversible in a quarter. A design review that jumps to rung 7 without having
measured 1 and 3 is not making a technical decision, it is making a social one.

### 7.3 What a Distributed Relational Actually Costs

Systems that shard a relational model do not get rid of the problems; they convert each one
into a harder one.

| Concern | Single database | Sharded |
| --- | --- | --- |
| Transaction | ACID, no effort | ACID *within* a shard; a cross-shard transaction is a saga or nothing (Volume 5 Chapter 8) |
| Join | Free, planner-optimised | Requires the shard key in both tables, or a scatter-gather, or a denormalised copy |
| Foreign key | Enforced | Cannot be enforced across nodes; becomes an application invariant |
| `UNIQUE` constraint | Enforced | Only within a shard, unless the key is the shard key |
| Index maintenance | One place | Every shard, and rebalancing must rebuild them |
| Backup/restore | One consistent snapshot | Per-shard snapshots, and a restore that is only consistent to the last cross-shard write |
| Query | Any query works | The shard key determines which queries are fast, and you learn that in production |
| Resharding | N/A | The most expensive operation there is |

The row worth memorising is the **foreign key one**. A `UNIQUE` constraint and a foreign key
are the two cheapest integrity guarantees in SQL, and both are silently lost at the shard
boundary. That is not a performance regression you can buy back with more hardware; it is a
correctness property that has to be re-implemented, tested, and monitored, and the thing
replacing it — an application-level check with a race window — is strictly weaker.

> **TRADE-OFF — "WHEN IS SHARDING THE RIGHT ANSWER?"**
>
> The condition is **that you have a tenant or region key that every query can carry, and
> that the data for one key genuinely belongs together.** Not "we expect high traffic" — at
> high traffic, rungs 1–5 of the ladder get you a long way. The specific shape is: a
> multi-tenant system where a single query almost always touches one tenant, the tenant
> boundary is also a compliance or ownership boundary, and the growth is genuinely
> unbounded within a tenant.
>
> Under those conditions sharding is close to free, because the shard key *is* the
> partition key, the joins stay within a shard, and the foreign key problem largely
> disappears because related rows travel together. Under any other condition you are buying
> a distributed systems problem — cross-shard transactions, cross-shard uniqueness,
> cross-shard joins, and a resharding procedure — in exchange for write throughput you
> probably could have bought with a bigger instance and one more index.
>
> The question that decides it, and that you should ask in the design review, is: **"what
> is our shard key, and show me the three most common queries — which shard does each one
> touch?"** If any of them touches all of them, you have not chosen a shard key, you have
> chosen a fan-out.

### 7.4 The Decision, Honestly

The genuinely useful framing for "which database" is a sequence of questions, in order, and
the order is the point.

1. **What is the access pattern?** One fixed key lookup, a few known queries, or arbitrary
   ad-hoc predicates. This single question eliminates most candidates.
2. **What is the write volume, and is it append-only, or is it a hot key?**
   Append-only scales very differently from contended.
3. **What is the consistency requirement, stated as a bound?** "Immediately" or "within one
   second" are specifications; "eventually" is not.
4. **What is the query flexibility requirement?** Ad-hoc predicates across entity types is
   the one thing relational engines are uniquely good at.
5. **What does the team already operate?** A new store is an on-call rotation, a backup
   story, a restore test, and a runbook, before it is a data model.
6. **What does it cost to undo?** This is the one that gets skipped. The answer for
   "add a cache" is small. The answer for "move to a document store" is a rewrite of every
   query and every test.

Volume 11 Chapter 9 has the full decision table across all eight stores. The point here is
that the questions are asked in this order and that question six is a real one.

> **MUST REMEMBER**
>
> A relational database's ceiling is a **write-concurrency** ceiling, not a data ceiling,
> and a missing index looks exactly like hitting it. Try the ladder in order — index,
> replicate, resize, split, partition — because the first five rungs are reversible in an
> afternoon and sharding is not reversible in a quarter.

#### Common Mistakes

- Concluding "we need NoSQL" from a slow relational query without checking indexes and
  statistics first
- Believing the relational *model* is what fails to scale, when the constraint is a single
  write path and a serialised log
- Presenting sharding as a rung rather than as a one-way door, without the resharding cost
  in the plan
- Assuming replication scales writes — it scales reads, and it adds lag
- Assuming a foreign key can be kept across shards — it cannot, and losing it is a
  correctness regression, not a performance one
- Reaching for a distributed store before asking what the access pattern is, when the access
  pattern is the only question that matters

#### Interview Questions — Scaling

**Q1. "Relational databases don't scale." Make that statement more precise.** `STAFF`

The true part: a single relational instance has a single write path — one primary, one
sequential durable log, one set of structures to maintain, and a hot row serialises every
transaction that touches it regardless of core count. Vertical scaling is the escape and it
terminates at the largest instance on sale. Above that you replicate, and replication buys
read throughput, not write throughput. The false part is the implied conclusion that the
data model is what fails: a table with a missing composite index or a stale statistic is slow
for reasons that have nothing to do with being relational, and teams that reach for a
document store on that evidence end up slower, without transactions, and unable to answer
the join they needed a month later. The accurate statement is that the ceiling is write
*concurrency*, and every store has a concurrency ceiling at a different shape.

**Q2. How would you scale a relational database that's outgrowing one node?** `STAFF`

A ladder, in order, because the rungs differ enormously in reversibility. First, prove it is
a database problem: indexes, statistics, the actual plan, the N+1 in the application. Then
read replicas, which is immediate and reversible and solves the read-heavy majority. Then a
bigger instance, which buys memory and therefore buffer pool. Then vertical table splitting.
Then partitioning, for pruning and for making old-data deletion a metadata operation rather
than a multi-hour `DELETE`. Then a read/write split. Only then sharding, and at that point
the first question is what the shard key is and which shard each of the three most common
queries touches. The framing that matters is that rungs one through five are reversible in an
afternoon and sharding is not reversible in a quarter, so a design review that jumps
straight to sharding without having measured the first and third rungs is making a social
decision rather than a technical one.

**Q3. What do you actually give up when you shard a relational database?** `ADVANCED`

Everything that crosses a shard boundary, and the list is longer than people expect. You
give up cross-shard transactions — ACID holds within a shard and a cross-shard write is a
saga or nothing. You give up cross-shard joins: either the shard key is in both tables, or
it is a scatter-gather that is fast on a small data set and unusable at scale, or you
maintain a denormalised copy. You give up cross-shard `UNIQUE` constraints and foreign keys,
which are the two cheapest integrity guarantees in SQL, and the replacement — an
application-level check — is strictly weaker because it has a race window. You take on
per-shard backup and restore that is only consistent to the last cross-shard write, index
rebuilding on every rebalance, and a resharding procedure that is the most expensive
operation in the industry. The honest statement to a team is that sharding does not remove
distributed-systems problems, it converts each relational guarantee into a harder one you
now have to build, test, and monitor yourself.

**Q4. A team wants to move to DynamoDB because "it scales". What do you ask?** `STAFF`

Four questions, in this order, because the first one usually ends the conversation. What is
the access pattern — a fixed key lookup, a handful of known queries, or arbitrary ad-hoc
predicates across entity types? What is the write volume, and is it append-only or a hot
key? What is the consistency requirement, stated as a bound rather than as "eventual"? And
what is the query flexibility requirement, because ad-hoc predicates across entities is the
thing relational engines are genuinely best at. Then the two that get skipped: what does the
team already operate, since a new store is an on-call rotation, a backup story and a
restore test before it is a data model; and what does it cost to undo. If the answers are a
fixed key lookup, high volume, and no ad-hoc queries, DynamoDB is right and the conversation
was short. If any answer involves "users sometimes want to filter by anything", the
recommendation is usually sharding a relational engine by tenant, which keeps the joins and
gives up only the write throughput that was never the bottleneck.

#### Further Reading

- [PostgreSQL — Connection Limits](https://www.postgresql.org/docs/current/runtime-config-connection.html) — `max_connections` and the per-connection process cost, the first scaling wall.
- [AWS — Database Encryption and Scaling Guidance](https://docs.aws.amazon.com/whitepapers/latest/database-encryption-customer-managed-key/database-encryption-customer-managed-key.html) — a practical survey of the scaling rungs and their costs.
- [J. Sharding Postgresql](https://github.com/postalsql/postalsql) — a compact reference implementation of the tenant-sharding pattern with real numbers.
- [Martin Fowler — Sharding](https://martinfowler.com/articles/sharding.html) — the trade-offs stated at the right altitude, including the ones that make sharding unreversible.
- [DynamoDB — Data Modeling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html) — the access-pattern-first discipline, useful as the contrast case.

> **CHAPTER 7 SUMMARY**
>
> The real limit on a relational database is a single write path — one primary, one
> sequential durable log, one hot set — not the data model, which is why a missing index is
> so often mistaken for hitting the ceiling. Scaling is a ladder, and the rungs differ by
> orders of magnitude in reversibility: index, replicate, resize, split, partition are all
> reversible in an afternoon; sharding is not. Sharding does not eliminate distributed
> systems problems, it converts ACID transactions, joins, `UNIQUE` constraints and foreign
> keys into harder versions you now own. The right way to answer "which database" is to ask
> what the access pattern is first, because that single question eliminates most of the
> candidates before cost or scale ever enters the discussion.

---

### End of Volume 1

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Name the three layers of a database and say which one each class of incident lives in
  (storage engine, query engine, concurrency control), and explain why "it's on disk" is not
  an answer
- Draw a slotted page and explain why a delete frees nothing until `VACUUM`, why an update
  appends rather than moves, and what that does to tuple size over a table's life
- Explain why a heap is unordered, and therefore why `WHERE id BETWEEN a AND b` is a full
  scan without an index
- State the superkey / candidate key / primary key / alternate key relationships, and say
  what naming the alternate candidate keys tells you about your schema
- Explain why the relational model has no foreign keys, and what enforcing them costs on the
  write path
- Give the update, insertion and deletion anomalies for an unnormalised table, and say which
  one causes the most incidents
- Distinguish 2NF, 3NF and BCNF precisely enough to answer the difference between 3NF and
  BCNF without hedging
- Explain what denormalisation actually costs, and name the three mechanisms and their
  different failure modes
- State the clause evaluation order and derive from it why a `SELECT` alias works in
  `ORDER BY` but not `WHERE`
- Give the three cases where join order is yours rather than the optimiser's
- Say whether a relational database scales, in terms of write concurrency rather than data
  volume, and name the ladder rungs by reversibility

### Coming in Volume 2 — SQL — DDL, DML & Constraints

Volume 1 was about the machine underneath the language: pages, heaps, the model itself, keys,
normalisation, the algebra, and the shape of the scaling problem. Volume 2 is the language
and the statements that change the machine. It covers how to create and evolve a schema
without taking an `ACCESS EXCLUSIVE` lock on production, why a `NUMERIC(12,2)` column is a
decision that is enforced on every write forever, what each constraint type actually costs
and what it cannot express, the write-path differences between `INSERT`, `UPDATE`, `DELETE`
and `TRUNCATE`, and the whole of three-valued logic — the `NULL` behaviour that produces
`NOT IN` returning nothing, `COUNT(*)` differing from `COUNT(col)`, and `SUM` over no rows
being `NULL` rather than zero. It is the volume where the syntax starts to matter, and
where the interview questions become the kind you can actually practise: given this table and
this statement, what does the database do.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### Storage Engine & Query Engine

**D1. A table has 40 million rows and 30 columns. The team says "we should split it into
three tables because it's slow". Is that right?** `STAFF`

Not on that evidence, and the diagnosis is the wrong one. The first question is what "slow"
means and which query — a wide table is slow in a *specific* way: more bytes per row means
fewer rows per page, so any scan touches more pages, and every projection pays to decode 30
columns even if you use two. That is a projection and page-count problem, and the fixes are
narrow (index the columns you filter on, project only what you return, add a covering index
for index-only scans) and cost megabytes. Splitting into three tables is a redesign that
costs you joins on the read path forever, and if the three tables are then joined back
together on every query you have reproduced the wide table with a join's worth of overhead
on top. The version of the question worth raising unprompted: *before splitting, has anyone
looked at `pg_column_size(row)`?* A 40-million-row table carrying 400-byte tuples when the
logical content is 60 bytes is a HOT-update and bloat story, and splitting will not fix a
single byte of it.

**T1. A `SELECT COUNT(*)` on a 40-million-row table takes 11 seconds on a warm database
with no disk reads. Why?** `TRICKY`

Because "no disk reads" does not mean "no work" — every page was served from the buffer
pool or the OS cache, which is the good case, and the cost is elsewhere. `COUNT(*)` over a
heap still has to read every tuple's header, walk the page's slot array, and test each
tuple's visibility, because the heap carries MVCC version information and only a
visibility-map-aware scan can shortcut it. At 40 million rows that is tens of millions of
tuple visits, which is CPU-bound, not I/O-bound. The interesting follow-up is what to do
about it: in modern PostgreSQL an exact count is genuinely expensive and the honest answer
is an estimate, from `pg_class.reltuples` refreshed by `ANALYZE` or from
`pg_stat_user_tables`, with the estimate being accurate to within a few percent on a table
that is not in the middle of a large delete. The *incorrect* fix — `COUNT(*)` on an index —
is sometimes cheaper, which is a genuine result and worth mentioning, and it is still an
exact count that goes linearly worse as the table grows.

**S2. A PR adds an index on `orders(customer_id)`. The table has 200 million rows. What
should the reviewer ask?** `STAFF`

Two things, in this order. First, is there already an index whose leading column is
`customer_id`, because a composite index on `(customer_id, status)` already serves this
query and a second index is pure write amplification — every insert, update and delete now
maintains both, and both must be rebuilt on every reindex. Second, on a 200-million-row
table the `CREATE INDEX` is not a metadata operation; it scans the whole table while
holding a lock that blocks writes for the duration, and the review question is what
`CONCURRENTLY` is doing about that, because it takes two table passes and can leave an
invalid index behind on failure. The framing that earns the point: an index is a permanent
write tax paid in exchange for a read shortcut, so "does this query exist" is a question
about a plan, and "what does it cost every write forever" is a question about the schema.
Neither is answered by looking at the diff.

**P1. A monthly report that used to take 4 seconds now takes 3 minutes. Nothing about the
report changed. What happened?** `TRICKY`

The most likely cause is a stale statistic, because a changed plan on unchanged SQL is
almost always a changed plan *cause*. A large volume of data landing in a column changes the
histogram, and the optimiser's row estimates for a query that has been using a plan for two
years can move by orders of magnitude. The diagnosis is `EXPLAIN (ANALYZE, BUFFERS)` and
comparing estimated rows to actual rows at the first node where they diverge by more than
roughly an order of magnitude — that node is where the bad plan was born, and everything
below it is a consequence. The fix is `ANALYZE` for the immediate problem and a reason for
the statistics to have gone stale, which usually means a bulk load that skipped it. The
second candidate is a lock: a long-running transaction on the same table would make the
report wait, and the report's own `EXPLAIN` would be clean. The third is index bloat after
a year of churn, which changes the physical access path without changing the plan.

### Pages, Heaps & the Physical Layer

**T2. A table has 8 kB pages. Rows are logically 90 bytes, but the table used to hold a
700-byte JSON column that was dropped six months ago. Roughly how many rows fit per page,
and why?** `ADVANCED`

Far fewer than the arithmetic on 90 bytes suggests, and the reason is that a slotted page
does not compact. A tuple is placed in free space when it is written, and an updated tuple
that no longer fits in its old slot is written to *new* free space, leaving the old bytes
behind as a hole. So the layout still carries 700-byte-shaped holes from the era when the
JSON was there, and the steady-state tuple size is a function of the largest the row ever
got, not its current width. In practice this is the shape of a table that has been through
a few large-feature experiments: perfectly reasonable current schema, quietly paying for
the widest version it has ever held. The diagnosis is `pg_column_size(row)` and
`pgstattuple`; the fixes are a `VACUUM FULL` (a rewrite under an `ACCESS EXCLUSIVE` lock,
so it is a scheduled operation on a maintenance window, not a live one) or a logical rewrite
through a new table.

**S1. Someone proposes replacing a 200-byte `VARCHAR` column with `TEXT`. Reviewer
response?** `TRICKY`

Push back, and for a reason that is not "TEXT is worse". In PostgreSQL the two store
identically — a varlena header plus the bytes — so the change is roughly free on its own
terms. The objections are about what the column then *means*. Dropping the length bound
removes the only schema-level statement about how large the value is allowed to be, and
that statement was doing work: it was a constraint that a rogue writer could not violate,
and it was the reason the TOAST threshold and your page-width assumptions held. It also
turns a checkable property into an open-ended one, and it makes the "when does this row
stop fitting in a page" question unanswerable in advance. If the real problem is that 200 is
too short, the honest fix is a larger bound, and it is worth asking why the writer was
producing values over 200 bytes in the first place.

**D2. A team's biggest table is 2 TB with 400 columns and no partitioning. They want to
archive anything older than two years. What's your recommendation and what does it cost?** `STAFF`

The operation they want — `DELETE FROM events WHERE created_at < now() - interval '2
years'` — is the thing to stop them from typing, because on a table that size it is a
multi-hour transaction that holds locks, generates a WAL volume that fills the disk, and
bloats the table so that every subsequent read pays for dead tuples. The recommendation is
partitioning the table by time range *now*, before the delete, so that the delete becomes
`DROP TABLE` on the old partitions — a metadata operation, effectively instantaneous, and
reclaiming the space immediately rather than leaving it to `VACUUM`. The cost is the
partitioning decision itself: partition key, interval, and the indexes you have to create
on every partition, plus the operational fact that you now have a hundred tables where you
had one, and every query and every tool has to cope with that. That is a real cost and
should be stated. The staff-level addition is the sequencing: partitioning a 2 TB table is
itself an online operation with its own risk, so this is a two-stage plan, and the
intermediate stage — where you can already drop old *ranges* of data by deleting and
re-inserting just those ranges into a separate table — is often the pragmatic answer for
the first year.

### The Relational Model

**D3. "Our schema is denormalised for performance." How do you evaluate that claim?** `STAFF`

By asking three questions, in order, and refusing to accept a yes to the first without a
number. Which query, and what was it before — a denormalisation with no named query and no
before-and-after measurement is a guess, and a guess is not a basis for a permanent
consistency tax. What keeps the redundant copy consistent — a trigger, a generated column, a
materialized view refresh, or a service, and each has a different failure mode: a trigger
slows the parent's writes, a materialized view is silently stale with no error, and a
service makes it a distributed consistency problem with a partition-boundary failure that
produces permanently wrong numbers and nothing to alert on. And what the staleness bound
actually is, in seconds, because "eventually" is not a specification. The framing worth
stating: denormalisation is cheap to add and expensive to remove, because by the time the
redundancy is a problem, several code paths and a job have grown to read it. The correct
sequence is normalise first, then denormalise one measured path deliberately and own the
sync — not the reverse, which is how teams end up with three tables that must be updated in
the right order or they silently disagree.

**T3. A `UNIQUE` column currently contains three rows where the value is `NULL`. Is that a
bug?** `TRICKY`

It depends entirely on what the column means, and the engine-specific answer is the first
half of the point. Most engines — PostgreSQL, MySQL, Oracle — allow multiple `NULL`s under
`UNIQUE`, because the SQL standard's duplicate rule treats two rows as duplicates only if
no column is *distinctly* unequal, and `NULL` is never distinctly unequal to anything
including another `NULL`. SQL Server is the exception and permits only one. So the same
schema behaves differently across engines, which is itself worth saying out loud. The
second half: if the column is an optional-but-unique-if-present field, several `NULL`s are
the intended behaviour and the constraint is doing its job. If it is a field that every row
should have — an email, an external ID — then the constraint did not stop the bug, and the
`NULL` rows are rows your application cannot look up. The fix when you want "at most one
`NULL`" is a partial unique index (`WHERE col IS NULL`) or a filtered index, not a
`CHECK`, because `CHECK` cannot see other rows.

**P2. Two services write the same table, and the second one is a batch import that runs
outside the deploy pipeline. A referential integrity violation appears once a month. What
is the actual fix?** `STAFF`

The first fix is understanding why this is a monthly event rather than a daily one, because
monthly smells like a calendar job: a month-end close, a billing run, a re-import. That job
is the second writer nobody reviewed, and the constraint is the only thing standing between
its bugs and production. The immediate repair is to add the `FOREIGN KEY` anyway and fix
whatever it rejects — the batch job failing loudly for a day is cheaper than a month of
silent corruption, and the rows it cannot insert are data you want to know about. The
structural fix is to give the import a real contract: a staging table it writes into, with
the constraint applied on promotion, so a bad row fails at import time with full context
rather than at 3 a.m. in production. The staff-level point: this is not a database problem,
it is a data-ownership problem. Two services writing one table means there are two contexts
in which the invariants are understood, and the constraint is the only artefact that
encodes the invariant once. If the second writer genuinely cannot respect the constraints,
it should not be writing that table.

### Normalisation & Keys

**D4. Should a multi-tenant system use a shared database with a `tenant_id` column, or a
database per tenant?** `STAFF`

The deciding variable is not tenant count, it is **whether the tenants are the same size and
have the same query pattern.** If they are, a shared schema with a composite key on
`(tenant_id, ...)` and a tenant-scoped index is simpler, cheaper, and operationally far
easier — one migration, one backup, one restore, one set of statistics, and the isolation
is enforced by a predicate you can put in the schema. If they are not, that model falls
apart quietly: one large tenant dominates the index and every query, its rows are
contended in the same pages, and no amount of indexing fixes a table where one tenant is 40%
of the rows. Per-tenant databases win there, and they also give you a genuine isolation and
compliance boundary, a trivially cheap per-tenant delete, and a per-tenant restore. The
costs to name: migrations multiply by tenant count, cross-tenant queries need scatter-gather
or a warehouse, and connection management becomes the problem — PostgreSQL's
process-per-connection model means 3,000 tenants is a connection-pool architecture project,
not a `CREATE DATABASE` loop. The intermediate answer most systems land on, and the one worth
proposing, is a hybrid: shared by default with a *small number* of large tenants carved out
onto dedicated nodes, so the common case stays operationally cheap and the outlier stops
contaminating everyone else's latency.

**S3. A schema stores `country_name` denormalised onto `orders`, kept in sync by an
application event. Reviewer objection?** `ADVANCED`

Objection to the *mechanism* before the denormalisation. An application event is a
distributed consistency mechanism with a partition-boundary failure: if the consumer is down
when the event is published, and the message is not durably queued, the copy is wrong
permanently, and nothing anywhere reports an error, because the failure was an absence
rather than an exception. That is strictly worse than a trigger or a materialized view,
which fail in the database's own transaction and are therefore either committed or not. So
the review question is: **how does this stay in sync when the consumer is down, and how would
you find out if it had already drifted?** If the answer is "the message broker is durable and
we have a lag alert", the design is defensible. If the answer is a retry loop in a
controller, it is not. The secondary point is about the column itself: `country_name` is
derivable from `customer_id` and it changes, rarely but not never, and a country rename
becomes an event you must publish to every historical order. A `country_code` captured at
order time is a *fact about the order* and is not denormalisation at all — it is modelling
the snapshot, and that is a legitimate and different thing. Worth asking which one they mean.

**T4. A join of `orders` (1 row) to `order_lines` (3 rows) selects `order_lines.amount`.
How many rows come back, and what does `SUM` return?** `TRICKY`

Three rows — one per line — so `SUM` returns the sum of the three line amounts, which is
what you wanted. The dangerous version is the query that also selects an order-level column
and looks fine, because the order columns are simply repeated on each of the three output
rows, and then a *second* aggregate over the result double-counts. The real bug is the
three-way join: adding `orders` to `products` to get the product name, where a line's
product joins to five variants, produces fifteen rows and a `SUM` that is five times too
large. In a financial report that is not a rounding error, it is a five-fold overstatement
that passes review because the column headers are right and the numbers are plausible. The
fix is to aggregate the line-level table to the grain you need in a CTE *before* joining,
rather than filtering after. The prevention is a table comment stating the grain, because
this is a schema-documentation bug that manifests as a SQL bug.

### The Algebra & Scaling

**P3. A join across eleven tables has been slow since it was written. The team wants to
split it into two queries and join the results in the application. Would you?** `STAFF`

The instinct is right and the framing is worth stating precisely, because the team is
reaching for the right conclusion for partly the wrong reason. At eleven tables the
optimiser has usually fallen back from exhaustive search to heuristics, so the join order
is partly whatever was written — but the first thing to check is whether the plan is
*actually* the problem, because an eleven-table join is also frequently a fan-out problem
where the intermediate result is combinatorially larger than anyone realised. The good
version of the change is not "run it in the application", it is: pre-aggregate each branch
to the grain the result actually needs, and make the intermediate relation a materialized
view or a table that the database maintains. That keeps the join inside the engine, keeps
it optimisable, and keeps it transactional. The bad version — two queries, join in
application code — trades a planner problem for a correctness problem, because you have
lost the ability to express a constraint across the two halves and you have added two
round trips and two failure modes. If the intermediate result is genuinely huge and stable,
materializing it is the answer, and it is an answer that keeps the database doing its job.

**D5. Your schema is 3NF, you have one denormalized aggregate for a dashboard, and now
someone wants a second one. Walk me through what you'd do.** `STAFF`

Start by refusing the framing slightly, because "one denormalized aggregate" and "a pattern"
are different problems. The first is a single measured query that needed a shortcut — cheap,
reversible, done. The second is a decision to move consistency out of the database, and it
should be made explicitly, once, with a mechanism named, rather than accumulating. So the
process is: identify which queries are actually slow, with numbers; for each one, choose the
least invasive mechanism that fixes it — a covering index first, because an index that
contains every referenced column removes the join entirely and costs only write
amplification; then a materialized view if the read is genuinely expensive; then an
application-maintained copy only if there is no option left. Then, before the second one
lands, name the operational consequence: two sources of truth, a staleness bound for each,
and a reconciliation job, because the failure mode of denormalised aggregates is not being
wrong loudly, it being wrong quietly and permanently after a partial failure. The staff-level
finish is that this decision should probably be made once as an architecture position — "we
maintain N read models, refreshed every X minutes, reconciled daily" — rather than N times
as an individual schema change, because the total is what determines whether the model is
still operable.

**P2. After a routine migration, an `ALTER TABLE ... ADD COLUMN NOT NULL DEFAULT 0` on a
900-million-row table has been running for four hours and is holding a lock. Production
writes are blocked. What should have happened?** `SCENARIO`

It should not have been a single statement. On most engines an `ADD COLUMN` with a
non-volatile default can be done without a table rewrite, and PostgreSQL specifically
avoids the rewrite when the default is a constant — so the four hours suggests either a
volatile default, a volatile function, or a different operation than you think was running.
The general lesson is that schema changes on large tables are migrations, not statements, and
a migration has four phases: add the nullable column, backfill in batches (with a commit
between batches, so each is a short transaction and the table is never locked for long),
add the constraint separately, and only then make it not-null. The reason is lock duration
rather than lock type: any operation needing `ACCESS EXCLUSIVE` blocks everything behind it
for as long as it runs, and four hours is four hours of no writes. The process fix is that
schema changes on tables above some size get a migration ticket with a rollback plan and a
lock-budget, the way deploys get a canary.

**D6. A startup is on one PostgreSQL primary with no replicas. The founders want to
"prepare for scale" by sharding now while the schema is small. Would you?** `STAFF`

No, and the reason is worth making carefully because the reasoning generalises. The
resharding procedure is the one part of sharding that is not a copy-paste job, and it is
the part that cannot be rehearsed on a small system — the moment you have 4 million rows,
the shard key choice is made, the cross-shard uniqueness is lost, the foreign keys are
gone, and the only options are a live resharding migration or accepting the mistake.
Meanwhile, the actual benefits are speculative: nobody has a measurement showing a write
ceiling, and the ladder rungs in Volume 7 — index, replicate, resize, partition — are
cheaper, faster, and reversible. What they should do instead is spend the same quarter
making the shard key *discoverable* without implementing it: identify the candidate keys,
look at which one every query already carries, check its cardinality and distribution, and
note the one or two queries that would fan out if that key were the shard key. That
exercise is worth doing before you have 4 million rows, and it produces a decision rather
than an implementation. The staff-level framing is that the argument is not technical but
organisational — sharding early converts a solvable capacity problem into an
irreversible architectural commitment made by a team that has not yet learned what their
access patterns are.
