---
title: "The Database Complete Deep-Dive"
volume: 4
series: "INDEXES, QUERY PLANNING & EXECUTION"
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

Volume 4 is the volume where people discover that the database was never slow, it was
*misunderstood*. Every performance problem in Volumes 1 through 3 was framed logically —
which table holds the fact, which join is correct, which `NULL` semantics apply. This
volume turns the frame around: the same query, logically identical, can cost four page
reads or four million depending entirely on structures the SQL never mentions. The whole
volume is built around one asymmetry: **SQL names the answer and never the route, so the
route is chosen by a cost model reading statistics, and every bad plan is a bad number
somewhere upstream.** The most useful thing a senior engineer can do in an incident is not
write a better query — it is read the plan, find the node where actual rows diverge from
estimated rows by two orders of magnitude, and know that node is where the fix goes.

The staff-level theme running through the volume is **where the abstraction stops paying
for itself**. An index looks like free performance and is actually a permanent tax on
every write; a composite index looks like one index and is actually an ordering commitment
that cannot be changed without a rebuild; an ORM looks like it removes the need to think
about access paths and actually hides them from you until production. Knowing where each
of those stops paying — and being able to say it in a design review, with a number — is
the difference between someone who can add an index and someone who can be trusted with
the data layer.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto page splits
produces filler. The template is a completeness checklist, not a template to fill.

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

### Continuing From Volume 3

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 (this book) | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL | process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL | InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies | data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 4

- Chapter 1 — Why Indexes Exist
- Chapter 2 — B+ Trees in Detail
- Chapter 3 — Types of Index
- Chapter 4 — Index Design & the Leftmost Prefix Rule
- Chapter 5 — Query Execution: Access Paths
- Chapter 6 — Joins at Runtime
- Chapter 7 — Reading `EXPLAIN` / `EXPLAIN ANALYZE`
- Chapter 8 — Statistics & the Optimiser
- Chapter 9 — Interview Scenario Bank

---

# Part 4 — Indexes, Query Planning & Execution

## Chapter 1 — Why Indexes Exist

### 1.1 The O(n) Scan, With the Arithmetic Done Properly

An index exists to convert a *linear search over a file* into a *logarithmic descent
through a structure*. The reason that matters is not asymptotic in the abstract — it is
that the two options do different kinds of I/O, and the kinds have a price difference of
roughly three orders of magnitude.

Start with the honest baseline. A 10-million-row `orders` table with an average row width
of 200 bytes on a PostgreSQL 8 kB page:

```text
  row width                200 bytes (including 24-byte tuple header)
  usable page space        8192 - 24 (page header) - 16 (page-level)  = 8152 bytes
  tuples per page          floor(8152 / (200 + 4 slot))               = 39 rows/page
  total heap pages         10,000,000 / 39                            = 256,411 pages
  total heap bytes         256,411 x 8,192                             = 2.01 GB
```

Now the cost of touching all of it, on two different devices:

| Access pattern | Per-page cost | 256,411 pages | Notes |
| --- | --- | --- | --- |
| NVMe SSD, sequential | ~0.05 ms | ~13 s | 2 GB at ~160 MB/s effective |
| NVMe SSD, random | ~0.10 ms | ~26 s | 10,000 IOPS ceiling, queue depth 1 |
| SATA SSD, sequential | ~0.5 ms | ~128 s | ~160 MB/s |
| SATA SSD, random | ~5 ms | ~1,283 s | ~200 IOPS |
| Spinning disk, random | ~8 ms | ~2,051 s | seek dominates, ~125 IOPS |
| Spinning disk, sequential | ~0.1 ms | ~26 s | readahead hides the seek |

The two columns that matter are the *last two rows of each block*: sequential is 80× faster
than random on the same spinning disk, and 2× faster than random on an NVMe. **That ratio
is the entire reason indexes are shaped the way they are.** If random and sequential I/O
cost the same, a hash index would be strictly better than a B+ tree for point lookups and
nobody would care about range scans. The B+ tree is not the best structure for finding one
row — it is the best structure for finding one row *and* then continuing to find the next
few hundred rows in order, over a structure small enough to sit mostly in RAM.

> **SCALING REALITY CHECK**
>
> The crossover point where an index stops paying is a function of three numbers, and it is
> worth being able to compute it. With a 39-rows-per-page heap, a lookup that finds 1 row
> touches 1 index page + 1 heap page. A sequential scan touches `N/39` pages. The scan
> wins when `N/39 × C_seq < C_rand × 3`, i.e. when `N < 39 × 3 × (C_rand / C_seq)`. On
> NVMe that ratio is 2, giving `N < 234`. On spinning disk the ratio is 80, giving
> `N < 9,360`. **So the same query on the same table is correctly index-scanned on a
> laptop and correctly seq-scanned on a 7200 rpm disk**, and if a candidate quotes a single
> "the table is too small" threshold without a device, they have not thought about it.

### 1.2 B-Tree vs B+ Tree — the Distinction Most Candidates Conflate

This is the single most commonly fudged answer in database interviews, and the fudge is
always the same: describing a B+ tree and calling it a B-tree. They are different
structures, the difference is not cosmetic, and the difference is the reason range scans
are fast.

**A B-tree stores the row payload (or a pointer to it) in *every* node — internal nodes
included. A B+ tree stores keys in internal nodes and *all* payloads in the leaves only.**

```text
  B-TREE (payload in every node)                B+ TREE (payload in leaves only)
  ┌───────────────────────────────┐             ┌───────────────────────────────┐
  │ [10 | 20 | 30]  ← data HERE  │             │ [21 | 41]     separator keys │
  ├───────┬────────┬──────────────┤             ├──────┬────────┬──────────────┤
  │ [5]   │ [15]   │ [25]         │             │      ▼        ▼              │
  │ d1    │ d2     │ d3     ← d4   │             │ ┌────────┐ ┌────────┐         │
  └───────┴────────┴──────────────┘             │ │ 1..20  │→│ 22..40 │→…        │
   a key equal to 20 lives in the ROOT          │ │ payload│ │ payload│         │
   → 1 node touched, but the root is full       │ └────────┘ └────────┘         │
                                                 │       linked leaf list       │
                                                 └───────────────────────────────┘
                                                 a key equal to 20 lives in a LEAF
                                                 → 3 nodes touched, but 2 are tiny
```

The consequences, in the order a candidate should give them:

1. **A B+ tree's internal nodes are tiny.** If an internal entry is a 8-byte key plus a
   6-byte page pointer plus 8 bytes of tuple header and alignment, call it 16 bytes. An
   8 kB page holds `8152 / 16 ≈ 509` of them. A B-tree internal node must also fit a full
   row payload — say 200 bytes — so it holds `8152 / (200 + 8) ≈ 39` of them. **The B+
   tree's fan-out is 13× higher, so its height is lower by a factor of `log(509)/log(39)
   ≈ 1.53` per level.** On a 10M-row index that is the difference between a 3-level tree
   and a 4-level tree, and the difference between 3 page reads and 4.
2. **A B+ tree's leaves are in one sorted run, physically linked.** A range scan touches
   the first leaf and then follows pointers left-to-right, reading pages that are adjacent
   in *key* order. The readahead-friendly property that made sequential I/O 80× cheaper
   than random is available to an index, not just to a full-table scan.
3. **A B+ tree has more levels for a small index but the extra levels are cheap.** The
   root and internal levels are the pages most likely to stay pinned in the buffer pool,
   because every single-row lookup touches them. Their *hit rate* is near 100% and their
   *size* is tiny — for a 10M-row `bigint`-keyed index at ~28 bytes per leaf entry, the
   whole index is about 80 MB, of which the two upper levels are about 160 KB. This is why
   the "three page reads" mental model in Chapter 2 holds: two of the three reads are
   practically free.

> **INTERVIEW TRAP — "A B-TREE INDEX GIVES YOU O(log n) LOOKUPS"**
>
> The trap is not the complexity, it is the framing. A B-tree gives you O(log n) with
> *high constants*; a B+ tree gives you O(log n) with *low constants plus an O(k)
> sequential continuation*. The follow-up that distinguishes a senior answer is
> **"why does the leaf list matter?"** and the answer is: without it, a range scan would
> have to re-descend from the root for every row, turning `WHERE id BETWEEN 1 AND 1000`
> into 1000 × 3 = 3000 page reads. With it, the scan is 1 descent plus a left-to-right
> walk. And the reason that walk is fast is that its pages are *adjacent in key order*,
> which lets the OS readahead turn 1000 potentially-random reads into roughly 1000/64 = 16
> sequential I/Os on a 64 kB readahead window.
>
> A second trap in the same family: MySQL InnoDB's primary key index is called a
> *clustered* index, and the word "clustered" is not a synonym for "B-tree". It is a B+
> tree that happens to store the entire row at the leaf, which makes the table and the
> index the same structure. Volume 8 Chapter 2 owns that story; the reason to know the
> distinction here is that it changes what a covering index costs on each engine.

### 1.3 Sequential I/O Is the Entire Point

The framing that makes every other index decision fall out: **an index exists to shrink
the number of pages you touch, and the pages it leaves you touching should be in as close
to sequential order as possible.** Both halves matter and most explanations only teach the
first.

The shrink is a function of how much of the index fits in memory, and the arithmetic is in
Chapter 2. The short form for a 10M-row `int8`-keyed index: 509 entries per page, so
19,646 leaf pages (157 MB), 39 second-level pages (312 kB), and one root. Height 3, and the
entire non-leaf portion — the part every single lookup must touch — is 320 kB. That is the
whole reason the index wins, and Chapter 2 does the arithmetic line by line.

The second half is subtler and is where good candidates separate from great ones. A
B-tree descent is three *random* reads by nature — the root's child pointers point
anywhere. A range scan that follows the leaf list is a mix: the first 3 reads are random,
and everything after is sequential. On spinning disk, a query that returns 10 rows
converts 3 random reads into 3 sequential-ish reads if the pages happen to be near each
other, and cannot do better than 3 random reads otherwise. A query returning 10,000 rows
converts 3 random + 35 sequential, and the 35 sequential reads are nearly free.

**This is why `LIMIT` interacts with index choice so strongly.** `ORDER BY created_at
LIMIT 10` on a table with an index on `(created_at)` reads 3 random pages plus 1 leaf
page. The same query without the index reads the entire heap and sorts it — 256,411 pages
plus a 10M-row sort, which in PostgreSQL may spill to a temp file. The index converts an
O(N log N) with a spill into an O(log N) with a constant of 4. Adding a matching
`ORDER BY` index to a `LIMIT` query is the single highest ratio of improvement to bytes
written in this entire volume.

> **PRODUCTION RELEVANCE**
>
> The readahead framing has a direct operational consequence. On a spinning-disk host, the
> difference between an index and no index for a range query is not "3 reads vs 256,411
> reads" — it is "3 random reads at 8 ms plus a sequential tail" vs "a purely sequential
> 256,411-page scan that readahead converts into about 4,000 physical reads". The
> index-based plan may still be faster, but not by the 80× the naive comparison implies.
> This is exactly why a benchmark run on a laptop SSD and a decision made against it fails
> in production, and why `EXPLAIN (ANALYZE, BUFFERS)` on the *production* instance is the
> only measurement that counts.

### 1.4 What an Index Entry Actually Contains

Almost nobody can draw the contents of an index entry without hesitating, and the contents
are where several performance behaviours are decided.

A **PostgreSQL** `btree` entry is a `IndexTuple`: a 8-byte `IndexTupleData` header
(containing a 4-byte `t_tid` — the transaction ID of the inserting transaction — and the
offset of the key data), followed by the key columns in `attr` order, followed by — if the
index is not the table's primary key and you asked for it — extra columns, and optionally a
trailing truncation of the key. There is no row payload, because PostgreSQL indexes point.

```text
  PostgreSQL btree leaf entry (bigint key, no INCLUDE)
  ┌──────────┬──────────────┬────────────────┐
  │ 8 bytes  │ 8 bytes key  │  (TID lives in  │   ← total ≈ 16-24 bytes
  │ tuple hdr│ id = 42      │   the header)   │
  └──────────┴──────────────┴────────────────┘

  where the TID points (volume 1, chapter 2, §2.4):
  ┌───────────┬────────┐
  │ block =   │ offset │
  │  90,041   │  = 17  │   → 6 bytes, and it is the whole "where is the row" story
  └───────────┴────────┘
```

A **MySQL InnoDB** secondary index entry is `(secondary_key_columns, primary_key_columns)`
— no row pointer at all, because the primary key *is* the row locator, and the clustered
index is the table. So a secondary index on `orders(status)` has a `status` value plus the
full 8-byte `order_id`, and a lookup that needs any other column makes a second descent
into the clustered index.

Three things follow immediately, and all three are interview material:

1. **A secondary index on a wide table is narrower than the table, by construction.** The
   `status` secondary index above is ~30 bytes per entry, so a 40M-row `orders` table has
   a 1.1 GB secondary index against a 9.6 GB table. That is why index-only scans are
   possible and why "the index is a copy of the table" is exactly backwards.
2. **A secondary index is not free to maintain, and its width is the cost.** Every
   `INSERT` into a table with N secondary indexes performs N B+ tree insertions, and each
   one is a WAL record, a page pin, possibly a page split, and eventually a buffer-pool
   eviction. This is Chapter 3's subject.
3. **Non-leaf entries in PostgreSQL are key-only; the `t_tid` in an internal node is a
   "high key" separator, not a real row pointer.** A frequent interview confusion.

> **MUST REMEMBER**
>
> An index is an ordered structure over a *narrow* copy of a subset of your columns, plus
> a locator. Narrow is why it fits in RAM; ordered is why range scans work; the locator is
> why a lookup is not free. A column you can make narrower without changing its meaning
> is a column you can fit more of into the same memory, which is the cheapest index
> optimisation that exists and almost nobody applies.

#### Common Mistakes

- Conflating B-tree and B+ tree, and describing payloads as living in internal nodes
- Explaining indexes purely as "O(log n) lookups" without the sequential-continuation half
  that is the actual reason B+ trees won
- Believing an index entry contains the row — on PostgreSQL it is a 6-byte `(block,
  offset)` pointer, on InnoDB it is the primary key
- Quoting a "table too small for an index" threshold with no device attached — the
  threshold moves by 40× between an NVMe and a spinning disk
- Assuming `LIMIT 10` makes the query cheap regardless of whether the `ORDER BY` can be
  satisfied from an index — without one, `LIMIT` reduces the *output*, not the *work*
- Forgetting that every index is a write amplification factor, so the "free" index added to
  fix a report is a permanent tax on every write to that table

#### Interview Questions — Why Indexes Exist

**Q1. What problem does an index actually solve? Give the answer with units.** `STAFF`

It converts a page-count problem into a page-count problem with a much smaller constant, and
the constant differs by access pattern. A scan of a 10M-row, 200-byte-row table on 8 kB
pages touches `10,000,000 / floor(8152/204) = 256,411` pages. The same table with a
bigint-keyed B+ tree has a height of 3 at 291 leaf entries per page, so a point lookup is
3 page reads and a 1,000-row range is `3 + ceil(1000/291) = 7`. The reason this is a win
rather than a wash is that the 3 descent pages are ~557 kB of internal nodes that never
leave the buffer pool, while the scan pages are 2 GB that mostly do not. Sequential reads
on a spinning disk cost about 1/80 of random reads, so the "hard" pages in a scan are far
cheaper than the arithmetic suggests, while the index's leaf pages are still random
access. Both effects point the same way, which is why the index wins — and why the margin
shrinks dramatically on fast storage.

**Q2. What is the difference between a B-tree and a B+ tree, and what breaks if you build
the wrong one?** `TRICKY`

A B-tree stores the payload or a row pointer in every node, including internal nodes. A
B+ tree stores only separator keys in internal nodes and all payloads in the leaves, and
links the leaves left-to-right in key order. Two consequences break if you get it wrong.
First, **fan-out**: a B+ tree internal entry is ~16 bytes (8-byte key, 8-byte page
pointer) so an 8 kB page holds ~509 children, while a B-tree internal entry must also
carry a 200-byte payload and holds only ~39. The 13× fan-out difference means a lower
height, and on a 10M-row index the difference between height 3 and height 4 is a page
read on *every single lookup*. Second, **range traversal**: without the linked leaf list,
every row in a range costs a fresh root-to-leaf descent, so `WHERE id BETWEEN 1 AND 1000`
becomes 3,000 page reads instead of 7. Databases store data in heaps precisely so the B+
tree can stay narrow, and pay the second random read in exchange.

**Q3. Why is a `bigint` primary key often a better index key than a `uuid`?** `ADVANCED`

Width, and width compounds three times. A `bigint` key is 8 bytes and a `uuid` is 16
bytes, so leaf entries are ~28 vs ~36 bytes and a leaf page holds 291 vs 226 entries —
about 22% more rows per page, which compounds into a smaller tree, a better buffer-pool
hit rate, and fewer pages read. The second cost is comparison: binary integer comparison is
a single wide load, while a UUID compares 16 bytes byte-by-byte with collation-sensitive
branches in some engines, and worse, random UUIDs sort *randomly* rather than
sequentially, so the index's physical layout is uncorrelated with insertion order and the
leaf list walk loses the readahead benefit. The third is size on the write path, and in
InnoDB a secondary index entry is `(secondary_key, primary_key)`, so a 16-byte UUID
primary key adds 8 bytes to *every* secondary index entry in the table. A sequential
`bigint` with a time prefix — Twitter's snowflake, ULID in its binary form — is the usual
compromise, and the honest staff-level caveat is that it leaks business volume information
to anyone who can read an ID.

**Q4. Your report says "add an index on `orders(customer_id)`" and the query got exactly
as slow. What are the five things to check, in order?** `SCENARIO`

In order of probability: (1) the table is too small for the index to be worth it, and the
optimiser is correctly choosing a sequential scan — check the table's actual page count,
not the row count everyone quotes; (2) the predicate is not sargable, so no index could
have been used, which means the index is not merely unused but *unusable* — look for a
function or a cast on the column side; (3) statistics are stale, so the optimiser's
estimate of the match count is off by orders of magnitude; (4) the query is a small part
of a larger problem and the time is in the join or the sort, not the lookup, which
`EXPLAIN ANALYZE` shows immediately; (5) the index exists but the plan is cached, so you
are looking at a plan chosen before the index was created. The order matters because the
first three are the common ones and the last two are the ones where more indexes make
things worse.

#### Further Reading

- [Use The Index, Luke — What is an index](https://use-the-index-luke.com//what-is-an-index) — the best short treatment of why index structure follows from disk geometry.
- [PostgreSQL — B-Tree Indexes](https://www.postgresql.org/docs/current/btree.html) — the authoritative description of the structure, including the high-key separator entries.
- [CMU Database Systems — Indexes & B+ Trees](https://www.cs.cmu.edu/~15451-f22/lectures/08-indexes.pdf) — the derivation of fan-out and height that the interview question is really asking for.
- [Jim Gray — Transaction Processing: Chapter 9, The B-Tree](https://www.cs.utexas.edu/~djimenez/utsa/cs3343/Gray%20Book%20on%20Transaction%20Processing.pdf) — the original treatment of occupancy, split and merge behaviour.
- [Database Systems: The Complete Book — Chapter 11, Indexing](https://cs.wisc.edu/~yxy/cs764-f20/notes/DBsystems-CompleteBook.pdf) — hash versus tree indexes and the space/time trade-off made explicit.

> **CHAPTER 1 SUMMARY**
>
> An index converts a 256,411-page sequential scan into a 3-page descent because its
> internal levels are small enough to live permanently in the buffer pool — not because
> "log n" is impressive. The structure that achieves this is a B+ tree, not a B-tree:
> payloads only at the leaves, leaves linked in key order, fan-out of ~509 children per
> 8 kB page instead of ~39. The linked leaf list is what turns a range into a sequential
> walk, and sequential is 80× cheaper than random on spinning media and still 2× cheaper
> on an NVMe. An index entry holds a narrow copy of your key plus a locator — a 6-byte
> `(block, offset)` in PostgreSQL, a primary key in InnoDB — and the narrowness is the
> reason it fits in memory at all. Everything in this volume is a consequence of that: how
> you choose column order (Chapter 4), which structure to use (Chapter 3), and what the
> optimiser believes about the row counts above it (Chapter 8).

## Chapter 2 — B+ Trees in Detail

### 2.1 Fan-Out Arithmetic, Done on Screen

Height is the only number that matters, and height is a pure function of fan-out. So
compute the fan-out rather than quoting a rule of thumb.

```text
  POSTGRESQL btree, 8 kB page, bigint key, no INCLUDE columns
  ────────────────────────────────────────────────────────────────────
  page overhead              24 B  PageHeaderData
                           + 16 B  BTPageOpaqueData (right sibling, etc.)
  ────────────────────────────────────────────────────────────────────
  space for entries          8192 - 24 - 16                  = 8152 B

  internal node entry
    IndexTupleData header          8 B
    key (int8)                     8 B
    padding to 8-byte alignment    0 B
                              ─────────
    per entry                     16 B
    entries per internal page      8152 / 16                  = 509

  leaf node entry
    IndexTupleData header          8 B
    key (int8)                     8 B
    xmin (in header)               4 B  (already counted in the 8 B above)
    padding                        0 B
                              ─────────
    per entry                     16 B   (leaf and internal are the same here)
    entries per leaf page          8152 / 16                  = 509

  ────────────────────────────────────────────────────────────────────
  this is the *idealised* number. Real leaves carry posting tuples for
  HOT-updatable columns, and a real index with 90% fill factor carries ~10%
  more entries per page. 509 is the ceiling; ~460-480 is typical.
```

Two variations, and the fan-out is a straight division:

```text
  key (int8, 8 B)                     8 + 8              = 16 B  →  509/leaf
  key (text, 40 B)                    8 + 40             = 48 B  →  169/leaf  (3.0x down)
  key (text 40) + INCLUDE(name 32)    8 + 40 + 32        = 80 B  →  101/leaf  (5.0x down)
  ───────────────────────────────────────────────────────────────────────────
  every term is the 8-byte IndexTupleData header plus the key (and INCLUDE)
  columns.  No separate row pointer term — the TID lives in the header.
```

Now the payoff, on a 10-million-row index:

| Key definition | Entries/leaf | Leaf pages | Level 1 pages | Root | **Height** |
| --- | --- | --- | --- | --- | --- |
| `int8`, no INCLUDE | 509 | 19,646 | 39 | 1 | **3** |
| `int8`, `INCLUDE (name)` 32 B | 101 | 99,010 | 981 | 1 | **4** |
| `text(40)`, no INCLUDE | 169 | 59,172 | 117 | 1 | **3** |
| `text(40)`, `INCLUDE (name)` 32 B | 72 | 138,889 | 1,374 | 2 | **4** |

Read the table twice, because it is the single most useful piece of arithmetic in this
chapter. **Adding a 32-byte `INCLUDE` column to a 10M-row index moved the height from 3 to
4.** That is one extra page read on every point lookup, forever, in exchange for making
some range queries index-only. This is the trade-off the covering-index trick in Chapter 4
is actually making, and it is why "just add the columns to the index so it covers" is bad
advice delivered without a row count attached to it.

```text
  HEIGHT vs ROW COUNT, FOR AN int8-KEYED INDEX (fan-out 509)
  ─────────────────────────────────────────────────────────────────
      rows                       height    point-lookup page reads
  ----------------------  ----------   --------------------------
         1,000 ..    259,081          2                  2
        10,000 .. 131,950,029          3                  3
   100,000,000 ..  67,162,164,961      4                  4
  ─────────────────────────────────────────────────────────────────
  509^2 = 259,081    509^3 = 131,950,029    509^4 = 67,162,164,961
```

The jump from three to four is the punchline: **a B+ tree on an 8-byte key stays three levels tall
for the entire range of table sizes a real system will ever see.** The "logarithmic
depth" framing is true and mostly irrelevant — the *constant* is what you are optimising,
and the constant is the fan-out, and the fan-out is a function of how many bytes your key
column occupies. That is the actionable form of the whole theory: **narrow your key.**

### 2.2 The Structure, Drawn Properly

```text
  ┌─────────────────────────────────────────────────────────────────────┐
  │  NODE 1  (root, page 0)                          height 1, 1 page   │
  │  ┌──────────┬──────────┬──────────┬──────────┬──────────┐            │
  │  │  < 1012  │  < 2048  │  < 3061  │  < 4096  │  < 5100  │  ← high  │
  │  │ page 41  │ page 88  │ page 12  │ page 77  │ page 33  │    keys   │
  │  └──────────┴──────────┴──────────┴──────────┴──────────┘            │
  └─────────────────────────────────────────────────────────────────────┘
       │            │            │            │            │
       ▼            ▼            ▼            ▼            ▼
  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐
  │ page 41 │  │ page 88 │  │ page 12 │  │ page 77 │  │ page 33 │  height 2
  │ 1002..  │  │ 2049..  │  │ 3062..  │  │ 4097..  │  │ 5101..  │  5 pages
  │ 2047    │  │ 3060    │  │ 4095    │  │ 5100    │  │ 6000    │  (of 39)
  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘
       │            │            │            │            │
  ┌────▼─────┐ ┌────▼─────┐ ┌────▼─────┐ ┌───▼──────┐ ┌───▼──────┐
  │ leaf 101 │ │ leaf 202 │ │ leaf 301 │ │ leaf 401 │ │ leaf 501 │  height 3
  │ 1002..   │ │ 2049..   │ │ 3062..   │ │ 4097..   │ │ 5101..   │
  │ 1500     │ │ 2500     │ │ 3500     │ │ 4500     │ │ 5500     │  leaves
  └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
       └────────────┴───────────┴────────────┴────────────┘
                            ▲
              THE LEAF LIST — doubly linked in every real implementation
              a range scan walks this chain left to right and never
              re-ascends to the root. This is the single structural
              feature that makes ranges cheap, and it is the thing
              that distinguishes a B+ tree from a B-tree.

  Point lookup for id = 3,500:
     root (page 0)   →  "3500 >= 3061, go to page 12"       1 page read
     page 12         →  "3500 is in 3062..4095, follow link"  1 page read
     leaf 301        →  "found at offset 88 in this page"     1 page read
     ───────────────────────────────────────────────────────
                                                     total: 3 page reads
```

Two details in that diagram are load-bearing and routinely missed in interviews.

**The internal entries are high keys, not "the first key on the page below".** In
PostgreSQL the root's `3061` separator means *everything less than 3061 goes left; 3061
itself lives in the page to the right*. This is why a key equal to a separator value costs
exactly the same as any other key. Getting this backwards is what produces the claim that
"finding a key that happens to be a boundary requires a special case".

**The leaf chain is bidirectional.** Forward links serve the range scan; backward links
serve nothing user-visible but are what make concurrent insert placement and page splits
simpler to implement. Candidates sometimes say "singly linked" and it costs nothing
operationally, but "doubly linked" is the correct answer and demonstrates you have looked
at an actual implementation.

### 2.3 Occupancy, Fill Factor, and Page Splits

A B+ tree node is a fixed-size page, and pages fill up. When a leaf has no room, it
**splits**: the entries are divided approximately in half between the original page and a
new page, a separator is inserted into the parent, and if the parent is now full it splits
too, potentially all the way to the root. A split therefore costs `O(height)` page writes
in the worst case, and the tree's occupancy after a bulk load depends entirely on how the
load was done.

```text
  LEAF PAGE SPLIT — 291-entry leaf, inserting key 5,000
  ───────────────────────────────────────────────────────────────────
  BEFORE (page 77, 291/509 entries = 57% full, 291*16 = 4,656 B used)
  ┌───────────────────────────────────────────────┐
  │ 4097 4098 4099 4100 ... 4999 5000  (no room) │
  │ free: 0 bytes                                  │
  └───────────────────────────────────────────────┘

  INSERT key 5,000 → no space → SPLIT at the midpoint
  (PostgreSQL's page split uses a fillfactor and a
   suffix/prefix split algorithm, not a blind 50/50;
   the result is that the two halves are each
   ~50% full, which is why a bulk-loaded index ends up
   at exactly 50% fill — the worst case for space
   and the best case for split avoidance thereafter.)

  AFTER
       ┌──────────────────────┐   ┌──────────────────────┐
       │ page 77 (new)       │   │ page 44 (old)       │
       │ 4097 .. 4548        │◄─►│ 4549 .. 5000        │
       │ 146 entries, 48%    │   │ 152 entries, 50%    │
       └──────────────────────┘   └──────────┬───────────┘
                                                │ separator 4549
                                                ▼ goes into page 12
  ───────────────────────────────────────────────────────────────────
  write cost: 2 leaf pages rewritten + 1 internal page updated
  amortised: a leaf at 50% fill must absorb ~250 inserts before
             splitting again, so 2 page writes / 250 inserts
             = 0.008 page writes per insert
```

PostgreSQL's `fillfactor` is the knob that changes this arithmetic, and it is one of the
most misunderstood settings in the engine.

```sql
-- Reserve 20% of each leaf page so sequential inserts land in place
-- instead of splitting pages.
CREATE INDEX CONCURRENTLY idx_orders_created_at
    ON orders (created_at)
    WITH (fillfactor = 80);
```

```text
  WHAT fillfactor=80 CHANGES
  ─────────────────────────────────────────────────────────────────
  post-BULK-LOAD (no fillfactor set, index built by CREATE INDEX)
     leaf occupancy  ~50%   →  19,646 leaf pages for 10M rows,  157 MB
     a later bulk INSERT of 5M rows splits ~1,700 pages

  WITH fillfactor=80
     leaf occupancy  ~90%   →  10,916 leaf pages for 10M rows,   87 MB
     a later bulk INSERT of 5M rows splits ~550 pages
     BUT the index is 44% smaller, so the buffer pool holds 1.8x more of it

  ───────────────────────────────────────────────────────────────────
  the size saving is a *read* win, not a write win, and it is usually
  the larger effect. 44% fewer index pages means 44% fewer index evictions,
  which means a higher hit rate on the exact pages that matter.
```

> **TRADE-OFF — "SHOULD EVERY INDEX HAVE A fillfactor?"**
>
> The condition that flips the answer is **whether the indexed column is append-only in
> practice.** For a monotonically increasing key (`created_at` with a sequence, an
> `AUTO_INCREMENT` id, an insertion-ordered ULID) every insert lands at the *right-hand
> edge* of the tree, so sequential inserts never split an existing page — they just extend
> the last page until it splits once, then the new page, and so on. A low fillfactor on an
> append-only key buys nothing and costs 20% of your index size for the life of the table.
> For a randomly-ordered key (`uuid`, a randomly generated surrogate, a status that
> toggles between a few values), inserts land anywhere, every 4th or 5th insert splits a
> page, and a low fillfactor is a large write-path win. The test is not "is the column
> random" but **"does the value increase monotonically at write time"**, and the honest
> engineering answer is to set `fillfactor` on the indexes you have measured, name the
> ones you measured in a comment, and not sprinkle it everywhere on principle.

### 2.4 The Three-Page-Reads Mental Model, and When It Lies

The most useful and most abused rule of thumb in performance work is *"a B+ tree lookup is
three page reads"*. Here it is again, with the arithmetic, and then here is every way it
stops being true.

```text
  THE MODEL, VALIDATED
  ───────────────────────────────────────────────────────────────────
  int8 key, 10M rows, 8 kB pages, fan-out 509
    height = ceil(log_509(10,000,000)) = ceil(2.78) = 3
    page reads for one point lookup  = 3   (root, level-1, leaf)
    page reads for a 1,000-row range = 3 + ceil(1000/291) = 3 + 4 = 7

  THE MODEL STARTS LYING WHEN
  ───────────────────────────────────────────────────────────────────
  1. the key is wide
       a 40-byte text key drops fan-out to 169
       ceil(log_169(10,000,000)) = 3 still, but at 100M rows
       ceil(log_169(100,000,000)) = 4 while ceil(log_509(100,000,000)) = 3

  2. INCLUDE columns are wide
       INCLUDE (name) on the same index: fan-out 101
       ceil(log_101(10,000,000)) = 4 instead of 3
       → one extra page read on every point lookup, permanently

  3. the index is not in memory
       "3 page reads" is 3 *logical* reads. If the leaf page was
       evicted, that is 3 buffer-pool misses, and if the OS page cache
       also missed, 3 device reads at 5-8 ms each on spinning media.
       3 × 8 ms = 24 ms, which is the *floor* for one point lookup
       on that hardware and no amount of index tuning moves it.

  4. the lookup is not a point lookup
       a nested loop with an index on the inner side does H descents,
       one per outer row. 100 outer rows = 300 page reads, and the
       "3 page reads" number is only meaningful if you remember it
       is per *iteration*.  (Chapter 7, the rows × loops trap.)

  5. the engine's clustered/covering design changes the count
       InnoDB secondary index → clustered index descent: 3 + 3 = 6
       reads for a query that needs a non-indexed column, and the
       clustered descent is 3 reads *every time* because it is a
       different tree.  (Volume 8, chapter 2.)
```

> **INTERVIEW TRAP — "HOW MANY PAGE READS DOES AN INDEX LOOKUP COST?"**
>
> "Three" is the answer that gets the follow-up question, and the follow-up question is the
> whole point of the interview. The good answer says: **three *logical* page reads for a
> height-3 tree, and three only under four conditions** — the key is narrow enough to keep
> fan-out around 500, there are no wide `INCLUDE` columns, the internal levels are resident
> in the buffer pool (which they almost always are, because they total around 557 kB for a
> 10M-row index), and it is a point lookup rather than a nested-loop iteration. Then add:
> on InnoDB a secondary-index lookup for a non-indexed column is *six* reads because the
> second descent is a different tree, and a range over the same index is 3 plus
> `ceil(k/291)`, not three. The candidate who says "three, but it depends" is right; the
> candidate who says "three" is right about one case out of six and is showing they have
> only ever used an index on a narrow key.

### 2.5 Fragmentation, Bloat, and Deletion

Deletion and update both degrade a B+ tree in a way that is invisible from SQL and
expensive to fix.

```text
  DELETING FROM A LEAF
  ───────────────────────────────────────────────────────────────────
  page 77: 4097 4098 4099 4100 4101 4102 4103 4104 4105 4106
            ^^^^^^^^^^^^^ deleted
  AFTER (PostgreSQL: the entries are marked dead in the page's
         item array; the bytes are NOT reclaimed on the page)
  page 77: 4097 [dead] [dead] 4100 4101 4102 4103 4104 4105 4106
            free space: 0 bytes  — the page is STILL 57% full of
            bytes, 54% full of live entries
  ───────────────────────────────────────────────────────────────────
  a REINDEX rewrites the index and packs it; a plain VACUUM in
  PostgreSQL does NOT compact btree pages (there is no equivalent
  of heap tuple reuse for index pages), so bloat in an index
  accumulates until the index is rebuilt.
```

The asymmetry is the point. In a **heap**, a delete leaves a hole a later insert can reuse
(Volume 1, §2.2). In a **B+ tree**, a deleted key frees bytes in the page but leaves the
entries in sorted position, so a new insert of a *different* key cannot use the gap unless
it happens to sort into it — and inserting into the middle of a page that is already full
means a split anyway. The result is that index bloat is monotonic until a rebuild, and the
"REINDEX" operation is not free: it rewrites the whole index and takes a lock that blocks
writes to the table.

Three practical consequences, all of which appear in real postmortems:

- **An index that was once much larger than it is now is still large.** Deleting 90% of a
  table's rows does not shrink any of its indexes. The queries get faster (fewer live
  entries per page means better cache locality) but the memory footprint and the buffer-pool
  pressure do not improve.
- **`pgstatindex` / `innodbindexstats` is how you find out.** A bloat estimate above about
  50% on a large index means you have a maintenance problem, not a query problem.
- **Vacuum starvation cascades.** On PostgreSQL, autovacuum that cannot get a page lock on
  a btree page does not shrink it, so an index on a high-churn column needs either
  autovacuum settings tuned for it or a scheduled `REINDEX CONCURRENTLY`. This is a Volume
  7 operational topic; the Volume 4 point is that the *query* symptom appears long before
  anyone thinks to look at index bloat.

> **PRODUCTION SCENARIO**
>
> Problem: a `sessions` table with an index on `user_id`. After eighteen months the table
> is down to 400,000 rows from a peak of 22,000,000, and queries that were 8 ms are now
> 600 ms. The team has already archived the old rows and the table is 3 GB.
> Investigation: `EXPLAIN (ANALYZE, BUFFERS)` on the slow query shows a correct index scan
> with 4 buffer hits and 2,100 reads — 2,100 reads for a query that should need 3. `pgstattuple`
> on the index reports 61% bloat; `pg_stat_user_tables` shows `n_dead_tup` at zero, because
> the deletions were `DELETE` statements and the table is genuinely empty of dead tuples.
> Root cause: the index was built when the table was 22M rows and is 6.1 GB with 61% dead
> entries. Buffer-pool residency collapsed, so the 3-page descent is now mostly disk.
> Solution: `REINDEX INDEX CONCURRENTLY idx_sessions_user_id` — `CONCURRENTLY` because the
> table takes writes and a plain `REINDEX` holds an exclusive lock on the index for the
> duration of a 6 GB rewrite. Prevention: alert on index bloat ratio for indexes over 1 GB,
> and put `user_id` behind a partial index (`WHERE deleted_at IS NULL`) so the index size
> tracks the live set rather than the historical set.

#### Common Mistakes

- Quoting "three page reads" without the fan-out arithmetic that produces three, which
  makes the number unfalsifiable
- Forgetting that the constant in `O(log n)` is the fan-out, and that a wide `INCLUDE`
  column can change the *height* and not just the size
- Claiming `VACUUM` compacts B-tree pages — it does not; index bloat needs `REINDEX`
- Believing a `fillfactor` helps an append-only index — it is pure waste there
- Treating index bloat as a query problem when it is a memory-footprint problem
- Assuming the leaf chain is singly linked, or that internal nodes contain row pointers
  rather than high keys

#### Interview Questions — B+ Tree Mechanics

**Q1. Walk through the arithmetic that produces "three page reads" for a 10M-row
lookup.** `STAFF`

Start with the page. PostgreSQL's 8 kB page has a 24-byte `PageHeaderData` and a 16-byte
`BTPageOpaqueData`, leaving 8,152 bytes for index entries. An `int8`-keyed btree entry is
an 8-byte `IndexTupleData` plus an 8-byte key, so 16 bytes, giving `8152 / 16 = 509`
entries per node. With 10,000,000 rows, the leaves are `10,000,000 / 509 = 19,646` pages,
the second level is `19,646 / 509 = 39` pages, and the root is 1. That is height 3, so a
point lookup reads the root, one second-level page, and one leaf — three page reads. The
point of the arithmetic is that it tells you what to optimise: 509 entries per node is the
number, and it is a function of key width. Doubling the key to 16 bytes drops fan-out to
254 and takes a 100M-row index from height 3 to 4. And of the three reads, the root and
the 39 second-level pages total 320 kB, so they are permanently buffer-resident — which is
why the model is so reliable in practice and why the leaf read is the only one that ever
touches a device.

**Q2. A leaf page is 100% full. What exactly happens on the next insert, and how much does
it cost?** `ADVANCED`

The insert has nowhere to go, so the page splits. In PostgreSQL the leaf's entries are
redistributed between the original page and a newly allocated page, a separator entry is
inserted into the parent, and if the parent cannot hold the separator it splits too,
recursively, potentially all the way to the root — which is the only operation in a B+
tree that changes the height. The immediate cost is two leaf pages rewritten plus one
internal page modified, and in PostgreSQL all of it is WAL-logged because it is
durability-relevant. The amortised cost is what matters: a leaf that just split is about
50% full, so it absorbs roughly 250 more inserts before splitting again, giving about
`2 / 250 = 0.008` page writes per insert. The reason bulk loading a fresh index leaves it
at 50% occupancy is precisely that every page in it was created by a split. `fillfactor`
is the mitigation: building with `fillfactor = 90` means the split leaves 90/10 rather than
50/50, so the index is 44% smaller — a read-side win — at the cost of splitting sooner.

**Q3. Why do deleted rows make an index bigger but a heap the same size?** `TRICKY`

Because the two structures handle free space differently. A heap page is *slotted* — a
delete marks the tuple dead and clears the slot pointer, and the free bytes are recorded in
the free space map, so the next insert of a small row reuses the hole with no movement. A
B+ tree leaf is sorted, so a delete marks entries dead but cannot compact them: a new key
that sorts into the gap would have to be written into a page that is already at its
maximum occupancy, which would immediately require another split. So the bytes stay. The
consequence is asymmetric: a heap's footprint responds to `VACUUM`, an index's does not
respond at all until `REINDEX`, and an index built when the table held 22M rows is still
6.1 GB after the table drops to 400,000 rows. Queries still get faster (fewer live entries
means better locality) but buffer-pool pressure does not improve, which is the number that
actually bites.

**Q4. When would you choose a lower fillfactor, and what is the specific cost?** `STAFF`

On indexes whose key is **not monotonically increasing at write time** — a randomly
generated UUID primary key, a `status` column that toggles among a handful of values, a
`last_login_at` updated on every request. There, inserts land anywhere in the key space, so
roughly every fifth insert splits a page, and each split is two page writes plus a parent
update. With `fillfactor = 70` you cut split frequency roughly in half. The cost is
concrete and it is on the read side: the index is about 30% larger, so it occupies 30% more
buffer pool, so the hit rate on the pages that matter drops, so the "3 page reads" become 3
reads with a worse probability of being a disk read. The correct test is whether the key is
monotonic at write time, not whether the column "looks random" — an `AUTO_INCREMENT` id and
a timestamp both look random to a human reading the schema and are both perfectly
append-only in practice.

#### Further Reading

- [PostgreSQL — B-Tree Indexes](https://www.postgresql.org/docs/current/btree.html) — splits, high keys, `fillfactor` and the deduplication optimisation, from the source of truth.
- [PostgreSQL — REINDEX and index maintenance](https://www.postgresql.org/docs/current/sql-reindex.html) — the exact flags for online index rebuilds and what each one locks.
- [pgstattuple — PostgreSQL Extension](https://www.postgresql.org/docs/current/pgstattuple.html) — the commands that measure index bloat and fill factor directly.
- [CMU Database Systems — Tree Indexes](https://www.cs.cmu.edu/~15451-f22/lectures/09-treeindexes.pdf) — node occupancy, split cost, and why B+ tree rather than B tree is the right structure for external storage.
- [Use The Index, Luke — B-Tree index](https://use-the-index-luke.com/btree) — the practical write-up of how leaf pages and links determine real-world behaviour.

> **CHAPTER 2 SUMMARY**
>
> Height is a pure function of fan-out, and fan-out is a pure function of key width: 8,152
> usable bytes in an 8 kB page divided by a 16-byte entry gives 509 children, and 509³ is
> 131 million rows inside a three-level tree. That is why an `int8` key stays three levels
> tall at every table size a real system will see, and why "three page reads" is a good
> model — and why it stops being one the moment a wide `INCLUDE` column drops fan-out to
> 101 and pushes a 10M-row index to height 4. Splits leave pages at 50% occupancy, which
> is why a bulk-loaded index wastes half its space and why `fillfactor` exists; splits also
> determine the amortised write cost, roughly 0.008 page writes per insert. Deletion is the
> asymmetries: a heap hole is reusable, a B-tree gap is not, so index bloat is monotonic
> until `REINDEX`. Two of the three reads on a point lookup come from 320 kB of
> always-resident internal nodes, which is the real reason the model holds in practice.

## Chapter 3 — Types of Index

### 3.1 The Taxonomy, and Why Every Engine Offers a Different Subset

There are two families of index and confusing them is a reliable way to lose an interview.
The first family is organised by *ordering* — B+ tree and hash. The second is organised by
*what it summarises* — BRIN, GIN, GiST, and the full-text inverted index. The second family
exists because the first family's cost is driven by the width of the key, and when the thing
you want to look up is a document, a tag set, or a geographic region, the key is wider than
the page and a B+ tree is structurally incapable of holding it usefully.

| Index | Structure | Equality | Range | Ordering | Write cost | PostgreSQL | MySQL 8 | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| B-tree | B+ tree | excellent | excellent | yes | 1 tree insert per row | yes | yes | the default, and the right answer 90% of the time |
| Hash | hashed buckets | excellent | **none** | no | 1 bucket insert | yes (WAL-logged) | yes | equality only; useless for a range |
| BRIN | block-range summary | poor | on min/max | by block | ~1 page per 128 pages | yes | no | tiny, for physically-correlated data |
| GIN | inverted index + posting lists | good on array/text | poor | no | high, plus pending list | yes | no | `@>`, `@@`, JSONB containment |
| GiST | extensible search tree | good | moderate | family-dependent | high | yes | no | geometry, full-text, `tsvector`, exclusion constraints |
| Full-text | inverted index | word-level | ranked | by score | very high | via GIN/GiST | native `FULLTEXT` | `MATCH ... AGAINST`, ranking |
| Bitmap | bit vectors per value | good | no | no | very low | derived, not declared | no (InnoDB has no persistent bitmap) | planner-internal for low-selectivity `AND`s |
| Covering / `INCLUDE` | B+ tree with payload | as B-tree | as B-tree | yes | + payload width | `INCLUDE` | no equivalent | enables index-only scan |

**Hash index.** The structure is a bucket array and chained or open-addressed entries, and
the whole point is that it is *smaller* than a B+ tree when you only need equality — no
internal nodes, no high keys, no ordering to maintain, and the search terminates when it
finds a bucket. On a 10M-row `users` table with a `char(36)` email column, the B+ tree
leaves hold `8152 / (8 + 36 + 8) = 157` entries, so the index is 8.8 MB; a hash index needs
one entry per distinct value plus a bucket array, which at a 1.5% load factor is about
10.9 MB — larger, and still useless for `WHERE email LIKE 'a%'`. The real reason hash indexes
are rare is not size, it is that **the single most common reason to add an index is a range
predicate, and a hash index is structurally unable to serve one.**

```text
  WHAT A HASH INDEX CAN AND CANNOT DO
  ───────────────────────────────────────────────────────────────────────────
  WHERE email = 'a@b.com'      →  hash('a@b.com') → bucket → 1 probe     ✓ fast
  WHERE created_at > '2026-01'  →  no ordering exists                     ✗ impossible
  WHERE id BETWEEN 1 AND 1000   →  no ordering exists                     ✗ impossible
  ORDER BY email LIMIT 10       →  no ordering exists                     ✗ impossible
  GROUP BY email                →  no ordering exists                     ✗ impossible
  MIN(email) / MAX(email)       →  no ordering exists                     ✗ impossible
  DISTINCT email                →  no ordering exists                     ✗ impossible

  PostgreSQL note: since PG 10, hash indexes are WAL-logged, which removed the
  last real reason to avoid them — but no mainstream workload has ever needed
  one. The dialect is: "when you can prove your access pattern is pure equality
  on a single column and never will contain a range, a hash index is a defensible
  3-5% space saving. Otherwise it is strictly worse than the B+ tree you
  already have."
```

**BRIN — Block Range INverted.** This one is worth a paragraph of its own because it is
the only index here whose cost is measured in *blocks read from the index*, not rows
inserted, and it is the most under-used index in PostgreSQL.

```text
  BRIN ON (created_at), pages_per_range = 128
  ────────────────────────────────────────────────────────────────────
  blocks 0..127     min=2026-01-03  max=2026-01-09   16 B of summary
  blocks 128..255   min=2026-01-09  max=2026-01-15   16 B of summary
  blocks 256..383   min=2026-01-15  max=2026-01-22   16 B of summary
  ...
  total for 2 GB heap (256,411 blocks) = 256,411/128 = 2,004 entries
                                       = 2,004 × 16 B = 32 KB of index
  ────────────────────────────────────────────────────────────────────
  A B+ tree on the same column: 10M/509 = 19,646 leaf pages = 157 MB
  BRIN is 4,900x smaller than the B+ tree on the same column.
```

That is the appeal and the trap. BRIN stores only the **min and max** of each 128-block
range and is therefore **lossy**: it can prove a range is *outside* the query's bounds
(readahead pruning — skip all 128 blocks at once) but it can only prove a range is
*inside* by reading it. A query for `created_at BETWEEN '2026-01-05' AND '2026-01-06'`
touches every block whose min/max overlaps that window, which on append-only data is
usually 1–3 ranges. On a table where the column is *not* physically correlated with block
order — say a `status` column updated in place, or a UUID primary key — every range's
min/max spans the entire domain, nothing can be pruned, and BRIN degenerates into a
sequential scan with 32 KB of overhead.

> **INTERVIEW TRAP — "WHAT IS A BRIN INDEX GOOD FOR?"**
>
> The wrong answer is "large tables". Size is a consequence, not the criterion. The right
> answer is **physical correlation**: BRIN wins when the indexed column's values are
> strongly ordered in the heap, which is true of an append-only table with a monotonic
> insert column and false for a randomly-keyed table. The arithmetic that makes the case: a
> BRIN entry is 16 bytes and covers 128 blocks (1 MB on 8 kB pages), so a 2 GB heap costs
> 32 KB of index — 4,900× smaller than the equivalent B+ tree at 157 MB. That means the
> entire index is permanently buffer-resident and the *pruning* is nearly free. The honest
> boundary conditions to volunteer are: it is lossy, so it can only exclude ranges by
> min/max and must read anything that might match; it depends on `autovacuum` running,
> because the summaries are recomputed as pages change; and if the correlation breaks — a
> backfill, an `UPDATE` that rewrites history, a partition merged out of order — it silently
> stops helping with no error and no plan change.

**GIN and GiST.** Both are "search tree" structures in the abstract, both are extensible,
and the practical difference is what they are *used* for. GIN is an inverted index where
each posting list holds the set of row IDs containing a given key, and it is the structure
behind `WHERE tags @> ARRAY['urgent','eu']` and `WHERE doc @> '{"status":"open"}'`.
Lookups are near-hash-speed on the posting list, but GIN has no ordering, so range scans
and `ORDER BY` on the indexed expression require a separate sort, and *every* insert must
insert into every posting list that matches — which is why a GIN index on a high-cardinality
array column can cost more than the table. GiST is a general balanced search tree with
user-defined *commutator* and *consistent* functions, which is why it can serve geometric
predicates (`ST_Intersects`) and exclusion constraints (`EXCLUDE USING gist`), and why
full-text search in older PostgreSQL used it before GIN overtook it. The trade is that GiST
is slower per lookup and smaller per entry than GIN, but it supports ordered and range-like
access that GIN cannot.

**Bitmap indexes and bitmap heap scans.** A persistent bitmap index stores, per distinct
value, a bit vector over the heap's row positions. A 10M-row table with 50,000 distinct
statuses is 50,000 × 1.25 MB = 62 GB — which is exactly why nobody ships a persistent
bitmap index. But the *transient* version is one of the best things a planner does, and it
is a different mechanism that shares the name. When a predicate matches 15% of a table,
an index scan costs 1.5M row fetches, each with a `WHERE` evaluation; a **bitmap heap scan**
walks the index once, builds a compact in-memory bitmap of 1.5M bits = 188 kB, and then
walks the heap *in physical order* reading every page and testing a bit. The heuristic
switches from a plain index scan to a bitmap scan when the estimated match count exceeds
about 25% of the relation *and* the index is not a covering one. The important consequence
for interviews: **a bitmap heap scan has no ordering, so it always requires a subsequent
sort for `ORDER BY`, and it reads the heap in physical order, which means it is the fastest
plan for a large low-selectivity query and the worst possible plan if the query also needs
sorted output.**

### 3.2 The Write-Path Cost of Each Type

Every index type has a different cost per `INSERT`, and this is the number that decides
how many you can afford.

| Index type | Cost per inserted row | Why | Batching? |
| --- | --- | --- | --- |
| B-tree | 1 tree descent + occasional split; ~1 page read, ~1 page write amortised | one insertion, path copied | yes, PostgreSQL `COPY` avoids per-row index maintenance until the end |
| Hash | 1 bucket insert | no ordering to maintain | yes, trivially |
| BRIN | **1 summary update per 128 blocks** | only the min/max of the range changes | yes |
| GIN | **one posting-list insert per matching key** | a row with 12 tags writes 12 places | yes, via the *pending list* — inserts accumulate and are flushed by `gin_clean_pending_list()` |
| GiST | 1 tree insert, but with per-key loss functions evaluated | user-defined search strategy | poorly |
| Full-text (GIN-backed) | same as GIN, on the tokenised document | one posting entry per distinct word | yes, via pending list |
| Bitmap (transient) | O(distinct values) per batch | rebuilds the vector | rebuilt per query, not maintained |

The BRIN row is the one that surprises people: **a BRIN index's per-insert write cost is
1/128 of a B+ tree's**, because a single 16-byte min/max update in shared memory covers
every insert into the same 128-block range. That is a genuine and large win on
high-ingest tables, and it is the concrete argument for using BRIN on append-only
time-series data rather than a B+ tree.

The GIN row is the opposite and equally important: **a GIN index's write cost is
proportional to the number of indexed elements per row, not the number of rows.** A
`tags text[]` column averaging 12 elements on a 10M-row table performs 120M posting-list
insertions — more write work than the 10M heap inserts plus a 10M-entry B+ tree
combined. The mitigation exists and is worth naming: PostgreSQL's GIN *pending list*
buffers index insertions in memory and flushes them in one pass, so a bulk `COPY` is
dramatically cheaper than 10M individual inserts. The unmitigated case is a steady trickle
of single-row inserts, where the pending list is flushed constantly and you get none of the
benefit.

### 3.3 Partial, Covering, Functional, Multi-Column and Bitmap

Four modifiers that change an index's *shape* rather than its type. All four are ordinary
B+ trees with different contents, and all four are badly misunderstood.

**Partial index** — `CREATE INDEX ... WHERE predicate`. Only rows matching the predicate
get index entries. The use case is a *small, hot subset* of a large table.

```sql
-- 2% of orders are 'pending'; the index is 2% of the size of a full one.
CREATE INDEX CONCURRENTLY idx_orders_pending
    ON orders (created_at)
    WHERE status = 'pending';
```

```text
  10,000,000-row orders table
  full index on created_at       : 19,646 leaf pages = 157 MB
  partial WHERE status='pending' :    394 leaf pages =   3 MB
  ───────────────────────────────────────────────────────────
  the partial index is 52x smaller, so it is permanently buffer-resident,
  AND it is cheaper to maintain (197,000 inserts instead of 10,000,000).

  BUT the planner can only use it when it can PROVE the query predicate
  implies the index predicate.  WHERE status = 'pending'        ✓
      WHERE status IN ('pending','shipped')                    ✓ (implied)
      WHERE status = 'PENDING'   (case/citext difference)      ✗ → seq scan
      WHERE created_at > now() - interval '1 day'  (no status) ✗ → seq scan
  ───────────────────────────────────────────────────────────
  the last case is the trap: the query LOOKS like it should use the
  partial index and cannot, because nothing about a time predicate
  implies the row is pending.  This is predicate implication, and it
  is why partial indexes on status columns frequently go unused.
```

**Covering index / `INCLUDE`** — payload columns carried in the leaf so the query never
touches the heap. This is the mechanism behind the index-only scan.

```sql
-- key columns first, INCLUDE columns after, in the leaf only
CREATE INDEX CONCURRENTLY idx_orders_cust_covering
    ON orders (customer_id)
    INCLUDE (status, total_cents);
```

```text
  leaf entry WITHOUT INCLUDE
    8 B tuple hdr + 8 B customer_id          = 16 B   → 509 entries/page
  leaf entry WITH INCLUDE (status varchar(12), total_cents int)
    8 + 8 + 13 + 8                           = 37 B   → 220 entries/page
  ───────────────────────────────────────────────────────────────
  index size grows 157 MB → 366 MB (2.3x)
  buffer-pool residency for this index drops to 43% of what it was
  and every query needing (customer_id, status, total_cents) becomes
  index-only — saving one random heap read per matching row.

  THE BREAK-EVEN
  index-only saves 1 random heap read per matching row (~8 ms on spinning
  media, ~0.1 ms on NVMe).  Index size increase: 209 MB.
  209 MB of extra index displaces 209 MB of buffer pool.
  If the displaced pages were being read at all, the win is large.
  If they were not, you paid 209 MB for nothing.
  ───────────────────────────────────────────────────────────────
  Verdict: covering indexes are worth it when the hot query is
  (a) high-frequency, (b) returns many rows, and (c) the index is
  not so large that residency collapse costs more than the heap
  reads you saved.  They are NOT worth it "to be safe".
```

There is a second, less-discussed reason to size a covering index carefully, and it is the
visibility map. On PostgreSQL, an **index-only scan** is only free if every page the index
references is marked *all-visible* in the visibility map — meaning no tuple in the page has a
version newer than every running snapshot. Autovacuum sets those bits. A table that is
updated frequently never accumulates all-visible pages, and the planner will happily
choose an index-only scan whose "Heap Fetches" number is one per row. That is the single
most common disappointment with covering indexes, and `EXPLAIN (ANALYZE, BUFFERS)`'s
`Heap Fetches` counter is how you detect it.

**Functional / expression index** — an index over a computed value rather than a column.

```sql
CREATE INDEX CONCURRENTLY idx_users_lower_email
    ON users ((lower(email)));
```

```text
  WHY IT EXISTS
  ───────────────────────────────────────────────────────────────────
  CREATE INDEX ON users (lower(email)) creates entries for
    'alice@x.com'  'ALICE@x.com'  'Alice@x.com'
  all three mapping to the SAME leaf entry, because the index key
  is the normalised form, not the stored form.

  it is the only way to serve this predicate:
      WHERE lower(email) = lower($1)
  and the planner will match the expression index to the expression
  predicate automatically.  Note it needs IMMUTABLE — `lower()` is
  immutable, `now()` is not, so you cannot index now().
```

**Multi-column (composite)** — covered in depth in Chapter 4, which is where it belongs
because the column *order* is the entire design decision.

**Bitmap index** — already covered above with the important distinction between the
persistent structure (which nobody uses at scale) and the transient bitmap heap scan (which
the planner builds for you).

### 3.4 The Index Count Problem

Here is the number nobody puts in an interview answer and everybody should know.

```text
  WRITE AMPLIFICATION, WORKED
  ────────────────────────────────────────────────────────────────────
  A single INSERT into `orders` with 12 indexes on it:

    1  heap insert                                    1 page write
   12  B+ tree inserts (12 indexes)
       = 12 × (1 page pinned, likely 1 page write)
                                                    12 page writes
   12  WAL records for the index changes (PostgreSQL)
   13  total page writes per inserted row

  At 10,000 inserts/sec, that is 130,000 page writes/sec.
  On an NVMe at 200,000 IOPS that is 65% of the device.
  On a SATA SSD at 150,000 IOPS it is 87% of the device.
  On a 7200 rpm disk at 125 IOPS the device cannot do 5,000 inserts/sec.
  ────────────────────────────────────────────────────────────────────
  and the buffer pool now has to hold 12 more trees' worth of pages
  competing with the heap for the same memory, so the heap's own
  hit rate drops too — the write path got slower *and* the read
  path got slower, from a change made to help the read path.
```

The amplification is not symmetric across index types. A BRIN index costs `1/128` of a B+
tree per insert. A GIN index on a 12-element array costs 12 B+ tree inserts' worth of
work in a single index. And an index that duplicates a prefix of an existing composite
index — `idx(a)` alongside `idx(a, b, c)` — costs a full tree's maintenance and buys
nothing, because `(a)` is already the leftmost prefix of `(a, b, c)` and every query the
first one could serve, the second one also serves. This is the most common *pure waste*
index in real schemas, and finding it is a five-minute query with `pg_stat_user_indexes`
(sort by `idx_scan` ascending; anything with zero or near-zero scans over a long period is
either the redundant prefix or a leftover).

> **PRODUCTION RELEVANCE**
>
> The staff-level version of this is that index count is a *governed* resource, not a
> per-PR decision. The honest review question is not "does this query need an index" but
> "this is the thirteenth index on this table; what is the write throughput of the service
> that writes to it, and who owns that number". The measurable practice that works is a
> scheduled report of `idx_scan` per index with a review of anything unused for 30 days,
> plus a per-table index budget agreed with whoever owns the write-heavy service. Removing
> dead indexes is the single highest-ratio write-path improvement available and it requires
> no code change at all.

#### Common Mistakes

- Presenting hash indexes as a general improvement over B+ trees, without noticing they
  cannot serve a single range, order, or aggregate
- Describing BRIN as "for big tables" rather than "for physically-correlated data", and
  omitting that it is lossy and depends on autovacuum
- Claiming bitmap indexes shrink query time in general — the *bitmap heap scan* is a
  planner-internal structure, and persistent bitmap indexes are enormous
- Adding `INCLUDE` columns "to be safe" without computing the fan-out change, which can
  move the tree from height 3 to height 4
- Building a partial index whose predicate the application's queries cannot be proven to
  imply, so it is never used
- Forgetting the visibility map — a covering index on a frequently-updated table gives an
  index-only scan with one heap fetch per row, which is the same cost as a normal index scan
- Not knowing that a redundant single-column prefix of a composite index costs a full
  tree's write maintenance for zero read benefit

#### Interview Questions — Index Types

**Q1. Compare a hash index and a B+ tree index on the same column, and say when the hash
index wins.** `TRICKY`

A hash index stores a bucket array and hashed entries, terminates the search when it finds
a bucket, and maintains no ordering at all. A B+ tree maintains total order, costs three
page reads for a point lookup, and — critically — supports `<`, `BETWEEN`, `ORDER BY`,
`GROUP BY`, `DISTINCT`, `MIN`/`MAX` and range `LIKE`. The hash index can serve exactly one
predicate shape: `col = constant`. It wins only when all of these hold: the access pattern
is pure equality on that one column, is known not to change, and the space saving is real —
which is usually 3–5% on a narrow column, not the dramatic factor folklore claims, because
you must still store the key to detect hash collisions. In practice this means: no
mainstream workload uses a hash index, PostgreSQL stopped WAL-logging them (removing the
correctness objection) in version 10, and the defensible staff answer is that a hash index
is a *narrowing* of the design space that a B+ tree strictly dominates, and you should be
able to name the one case where you would still consider it.

**Q2. What is BRIN for, and what are its two hard requirements?** `ADVANCED`

A block-range index that stores only the min and max of each 128-block range — 16 bytes per
range, so a 2 GB heap costs 32 KB of index, roughly 4,900× smaller than the equivalent
B+ tree at 157 MB. That size means it is permanently buffer-resident and its pruning is
free, and because inserting a row only updates one summary entry, its per-insert write cost
is 1/128 of a B+ tree's. The first hard requirement is **physical correlation**: the indexed
column's values must be monotonic in heap order, which is true of an append-only table with
a sequential insert column and false for a randomly-keyed or heavily-updated table — if
every range's min/max spans the domain, nothing can be pruned and it is a sequential scan
with overhead. The second is **autovacuum**: summaries are recomputed as pages change, so a
table that is never vacuumed, or vacuumed too late, has stale ranges that prune incorrectly.
It is also fundamentally lossy — it can only *exclude* ranges by min/max, so a selective
query still reads every block that might match.

**Q3. You add `INCLUDE (status, total_cents)` to an index on `orders(customer_id)`. What
happens to the index, and when is it a mistake?** `STAFF`

The leaf entries go from 16 bytes to 37 bytes, so entries per leaf page drop from 509 to
220. The index grows from 157 MB to 366 MB and, for 10M rows, the fan-out drop of 2.3×
takes the tree from height 3 to height 3 still but pushes a 100M-row index to height 4 —
one extra page read on every point lookup. Meanwhile the *read* benefit is that queries
needing only `customer_id`, `status` and `total_cents` become index-only and save one
random heap read per matching row. The break-even is whether the extra 209 MB of index
displaces buffer pool that was being read anyway: on spinning media a saved random read is
8 ms and 8 ms × many rows is a large win; on NVMe a saved random read is 0.1 ms, so the
209 MB of extra residency pressure can easily cost more than it saves. And there is a
second failure mode: an index-only scan is only free when the visibility map marks every
referenced page all-visible, so on a table with steady `UPDATE`s you get index-only scans
whose `Heap Fetches` is one per row, and you have paid the size for nothing.

**Q4. A table takes 40,000 inserts/sec and has grown to 14 indexes. Walk through what that
costs and what you would actually do about it.** `SCENARIO`

The cost is 14 B+ tree insertions per row on top of the heap write — 15 page writes per
row, or 600,000 page writes per second. On a device that sustains 150,000 IOPS that is
four times the device's capability, so the engine is already in a mode of writing ahead to
the log and letting the buffer pool absorb it, which means eviction pressure, and the
heap's own hit rate is now competing with 14 trees' worth of pages for the same memory.
The investigation starts with `pg_stat_user_indexes` sorted by `idx_scan` ascending, and
the answer is usually that three or four of the fourteen are either unused for months, or
are a leftmost-prefix duplicate of an existing composite index, or were added for a query
that no longer exists. Removing those is a pure write-path win with no application change.
The part worth raising unprompted is that "add an index" is a decision with an ongoing
cost that nobody owns, so the durable fix is a review gate on index count plus a monthly
report of unused indexes with a 30-day clock.

#### Further Reading

- [PostgreSQL — Indexes](https://www.postgresql.org/docs/current/indexes.html) — the full type list, `INCLUDE`, expression and partial indexes, from the manual.
- [PostgreSQL — BRIN indexes](https://www.postgresql.org/docs/current/brin.html) — block-range summaries, `pages_per_range`, `autosummarize` and the correlation requirement.
- [PostgreSQL — GIN indexes and the pending list](https://www.postgresql.org/docs/current/gin.html) — why GIN's write cost scales with elements per row, and the buffering that mitigates it.
- [MySQL — InnoDB index types](https://dev.mysql.com/doc/refman/8.0/en/innodb-index-types.html) — hash, the full-text parser, and why MySQL has no GIN equivalent.
- [Use The Index, Luke — Index types](https://use-the-index-luke.com/idx) — the practical guide to which structure to reach for and when each stops working.

> **CHAPTER 3 SUMMARY**
>
> Index types split into two families: ordered structures (B+ tree, hash) and
> summarising structures (BRIN, GIN, GiST, full-text, bitmap), and the second family exists
> precisely because the first is constrained by key width. A hash index serves exactly one
> predicate shape — equality — and loses ordering, so it loses `BETWEEN`, `ORDER BY`,
> `GROUP BY`, `DISTINCT` and `MIN`/`MAX` with it. BRIN is the most under-used index in
> PostgreSQL because it costs 16 bytes per 128 blocks, making it 4,900× smaller than the
> B+ tree on the same column with 1/128 of the per-insert write cost — but it is lossy and
> requires physical correlation and autovacuum. The four modifiers matter as much as the
> types: partial indexes shrink the tree to the hot subset, `INCLUDE` enables index-only
> scans at the cost of fan-out, expression indexes are the only way to serve a normalised
> predicate, and composite indexes are a column-ordering commitment. Every one of them
> taxes the write path, which is why index count on a hot table is a resource to be
> governed rather than accumulated.

## Chapter 4 — Index Design & the Leftmost Prefix Rule

### 4.1 The Leftmost Prefix Rule, From First Principles

A composite index on `(a, b, c)` is not three indexes. It is a single index over a
*concatenated key*, and the sort order it can answer is lexicographic: `a`, then `b` within
equal `a`, then `c` within equal `a` and `b`.

```text
  INDEX ON orders (region, created_at, status)
  ───────────────────────────────────────────────────────────────────────────

  THE SORT ORDER IS LEXICOGRAPHIC AND FIXED:
  (EU,  2026-01-05, shipped)
  (EU,  2026-01-05, pending)     ← b and c are only ordered WITHIN equal a
  (EU,  2026-01-09, shipped)
  (US,  2026-01-02, pending)
  (US,  2026-02-11, shipped)
  (US,  2026-02-11, pending)

  CONSEQUENCE — you can seek on a prefix and walk the rest:

  WHERE region = 'EU'                 ✓  1 column,  seekable
  WHERE region = 'EU' AND created_at >= X   ✓  2 columns, seekable on (region,
                                                range on created_at)
  WHERE region = 'EU' AND status = 'shipped'  ✓  seekable on region, then FILTER
                                                     status within the region —
                                                     no ordering help on status
  WHERE created_at >= X              ✗  created_at is the 2nd column; with no
                                         bound on region the rows are scattered
                                         across every region block.  FULL SCAN
                                         OF THE INDEX, then filter.
  WHERE status = 'shipped'           ✗  3rd column. Same reason.  FULL SCAN.
  WHERE region = 'EU' AND created_at = X AND status = 'shipped'
                                    ✓  all three — a single-point seek, height-many
                                         page reads total, regardless of table size
  ───────────────────────────────────────────────────────────────────────────
```

The rule in one sentence: **a composite index can only be *seeked* on a prefix of its
columns, and within that prefix it can only be *seeked* on the leading run of equality
predicates. Everything after the first range predicate is a filter, not a seek.**

That second clause is the part most candidates miss, and it is where the interesting
decisions live.

```text
  THE "EQUALITY THEN RANGE" RULE, ON (region, created_at)
  ───────────────────────────────────────────────────────────────────────────
  Q1: WHERE region = 'EU' AND created_at >= '2026-01-01'
      region is EQUALITY   → seek boundary is established
      created_at is RANGE → walk the leaf list from (EU, 2026-01-01) forward
      ⇒ 1 descent + ceil(matching/509) page reads.  PERFECT use of the index.

  Q2: WHERE created_at >= '2026-01-01' AND region = 'EU'
      ! SQL has no textual column order requirement — this is the SAME query.
      PostgreSQL reorders predicates during rewrite, so it plans identically.
      But the *index* order is fixed at (region, created_at); you cannot make
      (created_at, region) the index just because the SQL lists it first.

  Q3: WHERE region IN ('EU','US') AND created_at >= '2026-01-01'
      region is an EQUALITY SET → the engine does TWO seeks, one per value,
      each followed by a forward walk.  This is why IN is often as good as =.

  Q4: WHERE created_at >= '2026-01-01' AND region <> 'EU'
      region is a RANGE, created_at is a RANGE, and the RANGE comes first
      ⇒ the index cannot seek.  Only a full index scan + filter survives.
```

### 4.2 Choosing the Column Order: Cardinality Is the Wrong Answer

The reflexive advice is "put the most selective column first", and it is wrong as a
general rule. The correct question is: **which column, when constrained, best narrows the
scan, and which of the remaining queries can still use the index?**

Consider the actual query mix for an `orders` table. Assume 10M rows, and:

```text
  Q_A  WHERE region = 'EU'                        1%   of table      100,000 rows
  Q_B  WHERE created_at >= '2026-01-01'           8%   of table      800,000 rows
  Q_C  WHERE region = 'EU' AND created_at >= X    0.08%             8,000 rows
  Q_D  WHERE status = 'pending'                   2%                200,000 rows
  Q_E  WHERE customer_id = 9182                   0.0001%              10 rows
```

```text
  ORDER A: (region, created_at)          ORDER B: (created_at, region)
  ─────────────────────────────────────   ─────────────────────────────────────
  Q_A seek on region (1%)      197 leaves  Q_A NO SEEK — full index scan (1%)
  Q_B NO SEEK — full scan (8%)  1.7M pg    Q_B seek on created_at (8%)  1,571 lv
  Q_C seek region, walk        16 leaves   Q_C seek created_at, filter region
        created_at (0.08%)                   (0.08%)  → reads 1,571 leaves
  Q_D, Q_E need their own                 Q_D, Q_E need their own
        indexes                                    indexes
  verdict: 2 of 5 well, 1 badly.          verdict: Q_C is the disaster. 16 leaves
                                                 → 1,571, a 100x loss, because
                                                 a RANGE on the FIRST column
                                                 destroys the seek on the second.

  ORDER C: (region, created_at, status)
  ──────────────────────────────────────────────────────────────────────
  Q_C  seek region, walk created_at, filter status IN THE INDEX — the
       covering effect: 16 leaf pages, ZERO heap reads, vs Order A's 16
       leaf pages plus 8,000 random heap fetches.
  Q_D  STILL no seek — status is third and nothing constrains the prefix.
       (A partial index `WHERE status = 'pending'` would serve Q_D, and
        would also prove the point: 2% of the table, 394 leaves.)
  cost: 1 extra 8-byte column in the leaf → fan-out 509→421, no height
        change at 10M rows.
```

The general rule that falls out, and which is the answer to give in an interview:

1. **Equality columns first**, in an order among themselves you can defend (usually by
   selectivity, since it makes no difference to seekability but changes the intermediate
   set size).
2. **The range column immediately after the equality run.** This is the load-bearing
   position: a range predicate can only be *walked*, never *seeked*, so it must be last in
   the seekable prefix and everything after it is a filter.
3. **Columns that only ever appear in equality predicates, late** — they become index
   filters, which are free relative to heap fetches.
4. **Never put a range column before an equality column.** That single mistake costs 100×
   on the composite query, and it is the mistake a candidate makes when they think
   "most selective first".

The exception worth volunteering: if one column is *massively* more selective than the
others — `customer_id` at 0.0001% against everything else at 1% — putting it first is
right even if it is never an equality predicate, because a seek that returns 10 rows beats
a filtered walk that returns 100,000. The way to say this without hedging is: **selectivity
breaks ties *within* a column class, but it never moves a range column ahead of an
equality column unless the range column is selective enough that filtering is not
worthwhile.** That is the actual decision, and it is always a per-query-mix judgement,
which is why index design is a schema-design activity and not a per-query one.

### 4.3 Sargability: The Silent Killer

A predicate is **sargable** — searchable, or *seekable* — if the indexed column appears
alone on one side of the comparison operator. Every one of the following breaks it, and
every one of them produces a sequential scan with no error, no warning, and a plan that
looks entirely reasonable.

```sql
-- 4,100,000 of 10,000,000 rows match.  Index on (status).
-- index (status) exists.  Sequential scan.  And it is the RIGHT plan.

-- ✓ sargable: the column is alone on its side
WHERE status = 'shipped'
WHERE created_at >= '2026-01-01'
WHERE id BETWEEN 1 AND 1000

-- ✗ NOT sargable: a function wraps the column
WHERE date(created_at) = '2026-01-01'
WHERE lower(email) = $1
WHERE total_cents / 100 = 42.50
WHERE created_at + interval '1 day' = $1
WHERE abs(balance) > 100

-- ✗ NOT sargable: an implicit cast is applied to the COLUMN
WHERE varchar_col = 42            -- see §4.4
WHERE text_col = some_int_col
WHERE numeric_col = '42.5'::int

-- ✗ NOT sargable: the column is on the "wrong" side of an operator
WHERE 100 < balance              -- (usually still fine; say so honestly)
WHERE '2026' || '' = substr(created_at,1,4)
```

**The arithmetic of "it doesn't matter":** the planner is not stupid. For
`WHERE date(created_at) = '2026-01-01'` matching 4.1M of 10M rows, a sequential scan is
genuinely cheaper than reading 4.1M index entries and then fetching 4.1M heap rows. The
planner *sees a non-sargable predicate as non-indexable*, estimates a 41% match rate,
and correctly concludes that a sequential scan wins. The problem is not the planner's
arithmetic — it is that the *sargable* version of the same query would have matched 1% and
been 40× faster. **The non-sargable form is not slow because the planner is bad; it is slow
because it removed the planner's ability to see the truth.** That is the precise answer,
and it is a much better one than "the index isn't being used".

**The fix, in order of preference:**

```sql
-- 1. rewrite the predicate so the column is bare   (best, always)
WHERE created_at >= '2026-01-01' AND created_at < '2026-01-02'

-- 2. create an expression index matching the expression   (when the
--    expression is genuinely part of the query's semantics)
CREATE INDEX ON orders (date(created_at));
--    the planner matches the expression index to the expression predicate
--    automatically.  Note: only IMMUTABLE functions qualify — lower() is,
--    now() is not.

-- 3. generated / stored column, indexed normally   (when you need both forms)
ALTER TABLE orders ADD COLUMN created_on date
    GENERATED ALWAYS AS (created_at::date) STORED;
CREATE INDEX ON orders (created_on);
--    ! the generated column must be STORED, not VIRTUAL, or it has no index
--    representation in PostgreSQL.
```

> **INTERVIEW TRAP — "WHY ISN'T MY INDEX BEING USED?"**
>
> The expected answer mentions only "the table is small" or "low selectivity", and both
> can be true while missing the real cause. The complete answer is a decision tree, and you
> should walk it in this order because the causes are ordered by frequency:
>
> 1. **The predicate is not sargable** — a function, an implicit cast, or a subquery is on
>    the column side. Check this first, because it is the most common and the only one that
>    is a genuine defect in the query.
> 2. **The table is small enough that a sequential scan is genuinely cheaper.** This is the
>    planner being *right*. Below roughly 234 rows on NVMe or 9,360 rows on spinning disk
>    (§1.1), an index lookup costs more than the scan. There is nothing to fix.
> 3. **The column is not selective enough to be worth it.** Matching 40% of a table costs
>    more in index entries plus heap fetches than reading the table once. Again: the
>    planner is right, and "add an index" was the wrong advice.
> 4. **Statistics are stale**, so the estimate that drove the decision was wrong. Fixable
>    with `ANALYZE`; see Chapter 8.
> 5. **The plan is cached.** On PostgreSQL, a generic plan for a prepared statement was
>    chosen with different parameters than the one you are running. Visible as a difference
>    between `EXPLAIN` and `EXPLAIN` with the values hard-coded.
> 6. **The index is redundant** — a leftmost prefix of an existing composite index, or a
>    duplicate. It does not appear unused; it is simply never the *cheapest* plan because
>    the wider index does the same job.
>
> The reason to have the order is that causes 1, 2 and 3 need opposite responses. Cause 1
> means fix the query. Causes 2 and 3 mean the planner is correct and the advice was wrong.
> A candidate who answers "add a more selective index" for cause 1 has made the system
> worse.

### 4.4 The Implicit Cast Trap

This one is worth isolating because it is the most counter-intuitive of all the sargability
failures, because nothing in the SQL looks wrong, and because it has bitten essentially
every team that has ever had a reporting schema with mixed types.

```sql
CREATE TABLE events (
    id         bigint PRIMARY KEY,
    user_ref   VARCHAR(64),        -- legacy, stores a numeric id as text
    occurred   timestamptz NOT NULL
);
CREATE INDEX idx_events_user_ref ON events (user_ref);
```

```sql
-- 12,000,000 rows.  user_ref matches 40 rows.
EXPLAIN ANALYZE
SELECT * FROM events WHERE user_ref = 9182;    -- ! integer literal
```

```text
  Seq Scan on events  (cost=0.00..384120.00 rows=40 width=52)
                    (actual time=0.031..8420.117 rows=40 loops=1)
    Filter: (user_ref = '9182'::text)
    Rows Removed by Filter: 11,999,960
    Buffers: shared hit=18112
  Planning Time: 0.092 ms
  Execution Time: 8420.203 ms
  ───────────────────────────────────────────────────────────────────────────
  8.4 SECONDS to return 40 rows, with a perfect index on the column.
```

```text
  WHAT HAPPENED, PRECISELY
  ───────────────────────────────────────────────────────────────────────────
  user_ref is VARCHAR.  9182 is an integer.  The comparison's type is
  decided by the type with HIGHER precedence in the type hierarchy, and
  integer outranks varchar, so the comparison resolves to
  (varchar = varchar) and the engine must convert the LITERAL:
  '9182'::text.  A constant is perfectly indexable, and the index stores
  varchar — so on PostgreSQL this query uses the index cleanly.

  MySQL refuses it.  MySQL's optimiser declines an index on a VARCHAR
  column when compared to a numeric literal, applying the conversion to
  the COLUMN side in its index-lookup paths rather than risking a lossy
  comparison, and falls back to the 8.4-second scan above.

  The genuine PostgreSQL failure is the REVERSE direction: an index on an
  INTEGER column compared to a text literal, WHERE int_col = '9182',
  where the engine must cast the COLUMN to text to perform the comparison
  and an index on the integer cannot be used.
  ───────────────────────────────────────────────────────────────────────────
```

The general rule, stated so it survives either engine's specifics: **the index can only be
used if the value being looked up has the same type as the indexed column, or a type the
engine can convert without touching the column.** The moment the conversion must be applied
to the *column* — because type precedence resolved the comparison the other way — the index
becomes unusable, and the symptom is a sequential scan on a query that looks trivially
indexable. The high-signal real-world form is a `NUMERIC` money column compared to a
floating-point literal, which forces a cast of the column and kills the index on every
PostgreSQL version. The fix in every case is the same and is worth saying out loud: **make
the literal's type match the column's type at the call site, and if you cannot control the
call site, change the column's type.**

### 4.5 `OR`, `LIKE`, and the `UNION ALL` Rewrite

**`OR` is where the leftmost prefix rule stops helping you.** A single B+ tree cannot answer
`a = 1 OR b = 2` when `a` and `b` are different columns and only one of them is the leading
index column, because the entries for `a = 1` and the entries for `b = 2` are interleaved
in the key space rather than being two contiguous runs.

```sql
-- ✗ the planner may: seq scan, OR use a BitmapOr of two index scans
--   (fine when both branches are selective), or use idx(a) and never
--   touch the b branch (wrong answer — no, it will not do this)
EXPLAIN SELECT * FROM events
 WHERE user_ref = 9182 OR ip_address = '10.0.0.7';
```

```text
  BitmapOr works when BOTH branches are selective:
  ───────────────────────────────────────────────────────────────────
  BitmapOr
    → Bitmap Index Scan on idx_events_user_ref      (rows=20)
    → Bitmap Index Scan on idx_events_ip            (rows=15)
    → Bitmap Heap Scan on events                     (rows=35, 1,204 pages)
  Buffers: shared hit=1204    Planning Time: 0.14 ms

  BitmapOr is a BAD idea when either branch is unselective:
  ───────────────────────────────────────────────────────────────────
  WHERE user_ref = 9182 OR user_ref IS NULL
  → the IS NULL branch matches 11,999,960 rows (PostgreSQL does not
    index IS NULL efficiently by default without a matching partial index)
  → the planner sees a 100% match, chooses a Seq Scan, and is RIGHT.
  The presence of one selective branch does not help if the other is total.
```

The rewrite that always works, and the one to offer when asked "how do I make `OR` fast":

```sql
-- UNION ALL, not UNION: UNION deduplicates, which forces a sort or a hash
-- over the combined result and can cost more than the OR saved.
SELECT * FROM events WHERE user_ref = 9182
UNION ALL
SELECT * FROM events WHERE ip_address = '10.0.0.7';
```

```text
  WHY UNION ALL, NOT UNION
  ───────────────────────────────────────────────────────────────────
  UNION requires duplicate elimination across the whole result, which
  needs either a sort (O(n log n), likely a temp-file spill) or a hash
  aggregate over the full result set.  UNION ALL does not.

  Cost of OR:        one plan, the planner must pick ONE access path
                     (or pay for a BitmapOr it may not choose)
  Cost of UNION ALL: two independent plans, each with its own index, run
                     sequentially or in parallel; no dedup step

  When the two branches cannot overlap, UNION ALL is strictly better.
  When they can overlap, you need a deduplicating column, not UNION —
  the standard trick is to add the discriminating column to the SELECT
  list and let the application or a DISTINCT ON handle it:
      SELECT * FROM events WHERE user_ref = 9182
      UNION ALL
      SELECT * FROM events WHERE ip_address = '10.0.0.7' AND user_ref IS NULL
  … which is both correct and sargable.
```

**`LIKE` is a prefix rule hiding in plain sight.** A B+ tree's leaf list is in sorted key
order, so a prefix pattern is a contiguous range and a pattern with a leading wildcard is
not.

```text
  WHERE name LIKE 'smith%'     ✓  seek to 'smith', walk the leaf list forward,
                                   stop at 'smixt'         — uses index
  WHERE name LIKE '%smith'     ✗  '%' is a wildcard in EVERY collation's sort order,
                                   so the set is not contiguous.  Seq scan.
  WHERE name LIKE '%smith%'    ✗  same, and worse
  WHERE name ILIKE 'smith%'    ✗  case-insensitive breaks the stored ordering entirely
  ────────────────────────────────────────────────────────────────────
  the index that WOULD serve '%smith%' is a trigram index (pg_trgm's GIN),
  which indexes all 3-character substrings and intersects the posting lists
  for 'smi','mit','ith'.  On 12M rows that index is ~2 GB and writes are
  expensive — the exact trade-off to raise when someone proposes it.
```

### 4.6 The Covering-Index / Index-Only Scan Playbook

The technique, stated end to end, because it is the highest-leverage index technique
available and it is misapplied constantly.

```sql
-- the query we want to make fast
SELECT status, SUM(total_cents)
  FROM orders
 WHERE customer_id = $1
 GROUP BY status;
--  customer_id matches ~40 rows; the current plan is 3 index pages
--  + 40 random heap reads = ~320 ms on spinning media
```

```sql
-- INCLUDE carries payload in the LEAF only: it does NOT become part of
-- the key, so it does not participate in sorting and it cannot be a
-- seek predicate.  It exists purely so the query never touches the heap.
CREATE INDEX CONCURRENTLY idx_orders_customer_covering
    ON orders (customer_id)
    INCLUDE (status, total_cents);
```

```text
  BEFORE
  ───────────────────────────────────────────────────────────────────
  Index Scan using idx_orders_customer on orders
    Index Cond: (customer_id = $1)
    ->  Rows Removed by Filter: 0
    Buffers: shared hit=44          3 index + 40 heap + 1 overhead
  Execution Time: 318.442 ms

  AFTER
  ───────────────────────────────────────────────────────────────────
  Index Only Scan using idx_orders_customer_covering on orders
    Index Cond: (customer_id = $1)
    Heap Fetches: 0
    Buffers: shared hit=2           2 index pages, ZERO heap reads
  Execution Time: 0.184 ms
  ───────────────────────────────────────────────────────────────────
  1,730x faster, and the two counters that prove why are
  "Heap Fetches: 0" and "shared hit=2".

  ! "Heap Fetches: 40" would mean the visibility map does not cover
    those heap pages — the index-only scan is doing the same work as a
    normal index scan, plus the 209 MB of extra index size.  Check this
    number first before celebrating.
```

**The visibility-map dependency, in full.** An index-only scan reads the index leaf and
needs the row's transaction visibility. If the page is not marked *all-visible* in the
visibility map, it must visit the heap to check. PostgreSQL maintains that map in
autovacuum, and it is *only* set for pages where every tuple is committed and older than
every running snapshot. So:

```text
  INDEX-ONLY SCAN ACTUALLY BEHAVES LIKE  A NORMAL INDEX SCAN WHEN
  ───────────────────────────────────────────────────────────────────
  • the table has never been vacuumed since the index was created
  • the table receives steady UPDATEs (every update creates a new tuple
    version, clearing all-visible on that page)
  • the table is append-only but autovacuum is disabled or starved
  • you are in the same transaction that made the rows
  ───────────────────────────────────────────────────────────────────
  HEALTHEY  HEAP FETCHES  =  index_scan_count × (1 - all_visible_fraction)
  so on a table with 60% all-visible coverage, an index-only scan reads
  0.4 heap pages per index entry — 40% of the cost of a normal scan, for
  100% of the index size.  The whole technique only pays off above
  roughly 95% all-visible coverage.
```

The MySQL/PostgreSQL vocabulary difference is worth one line because it is asked:
PostgreSQL's `INCLUDE` clause and index-only scan; MySQL's equivalent is a *covering index*
where you simply append the payload columns **in the index definition** — which is
different in a way that matters, because in MySQL those columns *do* participate in the sort
order. So `INDEX (customer_id, status, total_cents)` in MySQL can be *seeked* on
`(customer_id, status)` as a two-column equality, while in PostgreSQL
`ON orders (customer_id) INCLUDE (status, total_cents)` can only be seeked on
`customer_id`. Getting this backwards produces an index that cannot serve the query it was
built for.

> **TRADE-OFF — "SHOULD I COVER THIS INDEX?"**
>
> The condition that flips the answer is **the match rate of the query, measured in rows,
> against the size increase of the index.** Covering wins when the query returns many rows
> (each one saved a random heap read — 8 ms on spinning media, 0.1 ms on NVMe) and the index
> stays small enough that the extra residency pressure does not push the *other* queries'
> heap pages out of the buffer pool. It loses when the query returns one or two rows — you
> paid 2.3× the index size to save one heap read that the buffer pool would have served
> anyway — and it loses badly on a table with low all-visible coverage, where you save
> nothing and pay the full size increase. The measurement that settles it is not a
> benchmark; it is reading `Heap Fetches` in `EXPLAIN (ANALYZE, BUFFERS)` on the real
> table with real autovacuum behaviour. And the staff-level note is that covering indexes
> are the ones most likely to be *quietly* wrong: nothing fails, the query is fast, and the
> cost shows up six months later as buffer-pool pressure on an unrelated query.

#### Common Mistakes

- Ordering composite columns by "most selective first" without separating equality
  columns from range columns — the range column's position is the whole decision
- Putting a range column before an equality column, which turns a 16-leaf-page seek into a
  1,571-leaf-page filtered walk
- Blaming the planner when the predicate is not sargable — the planner cannot see a truth
  that was hidden from it
- Believing `WHERE created_at >= X` can use `(region, created_at)` because `created_at` is
  *in* the index — it is in the index, but not seekable
- Using `UNION` rather than `UNION ALL` in the `OR` rewrite, and paying for a dedup sort
- Celebrating an index-only scan without checking `Heap Fetches`
- Confusing PostgreSQL's `INCLUDE` (leaf payload, not part of the key) with MySQL's
  covering index (appended key columns, part of the sort order)
- Assuming `LIKE 'foo%'` needs a trigram index — it is a plain prefix range and uses a
  B+ tree

#### Interview Questions — Index Design

**Q1. You have an index on `(region, created_at)`. Which of these can seek, and why?**
`STAFF`

`WHERE region = 'EU'` seeks — `region` is the leading column with an equality bound.
`WHERE region = 'EU' AND created_at >= '2026-01-01'` seeks and then walks, which is the
ideal use — the equality establishes a starting position and the range predicate rides the
leaf list forward. `WHERE created_at >= '2026-01-01'` cannot seek: without a bound on
`region`, the qualifying rows are scattered across every region block, so the only legal
plan is a full scan of the index followed by a filter. `WHERE region IN ('EU','US')` seeks
twice, once per value, and each seek walks forward. The rule is that a composite index is a
single lexicographic sort, so it can only be *seeked* on a prefix, and within that prefix
only on the leading run of equality predicates — everything after the first range predicate
is a filter, not a seek.

**Q2. When does a `WHERE varchar_col = 42` fail to use an index on `varchar_col`, and what
is the general rule?** `TRICKY`

The comparison's type is decided by the type with higher precedence in the type hierarchy,
which for `varchar = integer` resolves to `varchar = varchar` — so the literal is cast to
text, and the index, which stores text, should be usable. The failure mode is the one where
the precedence runs the other way: an index on an `INTEGER` column compared to a text
literal, `WHERE int_col = '9182'`, forces the engine to cast the *column* to text to
perform the comparison, and an index on the integer cannot be used. MySQL is stricter still
and refuses the index in the `varchar = integer` case as well. The general rule that
survives every engine's specifics: **the index is usable only if the value being looked up
has the same type as the indexed column, or a type the engine can convert without touching
the column.** The moment a conversion must be applied to the column, the predicate is
non-sargable. The fix is to make the types agree at the call site, and where you cannot
control the call site, to change the column's type — which is a schema decision, not a
query-tuning one.

**Q3. `WHERE date(created_at) = '2026-01-05'` does a sequential scan. Is the index broken?**
`TRICKY`

No, and the reason is worth more than the fix. `date()` wraps the column, so the predicate
is non-sargable and the planner models it as "filter every row", estimating a match rate
from the histogram of `date(created_at)` — which it does not have, so it falls back to a
default. It then compares a sequential scan of 256,411 pages against an index lookup plan
and picks the scan. The planner is not wrong about the *cost model*; it is working from a
belief the query made impossible. The sargable rewrite — `created_at >= '2026-01-05' AND
created_at < '2026-01-06'` — is 1% of the rows, 2,565 pages, and uses a two-column range
seek. If the expression is genuinely part of the query's semantics, the second fix is an
expression index on `(date(created_at))`, which the planner will match automatically, and
which requires the function to be `IMMUTABLE` — so `lower()` qualifies and `now()` does
not.

**Q4. Design the index set for a `messages` table with these five queries, and say what
you would deliberately leave unindexed.** `STAFF`

```sql
-- 40M rows.  conversation_id: 1.2M conversations, avg 33 messages each.
-- sender_id: 2M users.  sent_at: append-only.  read_at: nullable, 62% set.

Q1  WHERE conversation_id = $1 ORDER BY sent_at DESC LIMIT 50   -- 400 calls/sec
Q2  WHERE sender_id = $1 ORDER BY sent_at DESC LIMIT 50         -- 900 calls/sec
Q3  WHERE conversation_id = $1 AND sent_at > $2                 -- 1,100 calls/sec
Q4  WHERE read_at IS NULL                                       -- unread badge
Q5  SELECT count(*) FROM messages WHERE sent_at > $1           -- daily rollup
```

I would create exactly three. `(conversation_id, sent_at DESC)` serves Q1 as a perfect
seek-plus-reverse-walk and Q3 as a seek-plus-forward-walk, and both are covered by one
index — this is the leftmost prefix rule paying for itself. `(sender_id, sent_at DESC)`
serves Q2, same shape, and it has to be separate because there is no prefix relationship
between them. And a partial index `(conversation_id, sent_at) WHERE read_at IS NULL` for
Q4: that is 38% of the table, so 15.2M entries, and — this is the point of a partial index —
it is 3.2× smaller than the full composite, permanently buffer-resident, and the predicate
`read_at IS NULL` is *implied* by the index predicate so the planner can use it. Q5 I would
deliberately leave unindexed: `sent_at > $1` on an append-only table is a range that
matches a contiguous, physically-located tail of the heap, so a sequential scan reading
18,000 pages and readahead-accelerated is faster than 15M index entries, and a BRIN index
on `sent_at` is 32 KB and prunes almost all of it. The deliberate omission is the teaching
point: an index on a low-selectivity range on a physically-correlated append-only table is
slower than no index at all.

**Q5. When is a covering index the wrong call, and how would you know you made the
mistake?** `ADVANCED`

It is the wrong call when the query returns very few rows, because you multiply the index
size by 2.3× to save one or two heap reads that the buffer pool would have served anyway,
and the extra 209 MB displaces buffer pool that other queries were using. It is also wrong
on a table whose heap is not all-visible — and this is the failure people miss — because an
index-only scan on a table with steady updates reads the heap anyway, once per matching
row, and you have paid the full size increase for the privilege of calling it an
index-only scan in the plan text. The way to know is not a benchmark: it is reading `Heap
Fetches` in `EXPLAIN (ANALYZE, BUFFERS)` on the production-shaped table. If it is 0, the
visibility map is covering and the technique is working. If it equals the row count, the
visibility map is not covering, the plan is a normal index scan with extra steps, and the
fix is `VACUUM` and a check on autovacuum's health rather than anything to do with the
index.

#### Further Reading

- [PostgreSQL — Indexes: multicolumn, expressions, partial](https://www.postgresql.org/docs/current/indexes-multicolumn.html) — the leftmost prefix rule and `INCLUDE` from the manual, with worked examples.
- [PostgreSQL — Query Planning: Statistics and selectivity](https://www.postgresql.org/docs/current/planner-stats.html) — how column order, correlation and `ANALYZE` interact with the plan choice.
- [Use The Index, Luke — Multi-column indexes](https://use-the-index-luke.com/composite-index) — the best practical write-up of the equality-then-range rule, including the worst-case arithmetic.
- [MySQL — Multiple-Column Indexes](https://dev.mysql.com/doc/refman/8.0/en/multiple-column-indexes.html) — MySQL's covering-index semantics, which differ from PostgreSQL's `INCLUDE` in a way that matters.
- [PostgreSQL — pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html) — the trigram index, and the honest cost of making `LIKE '%foo%'` fast.

> **CHAPTER 4 SUMMARY**
>
> A composite index is a single lexicographic sort, so it can only be seeked on a prefix
> and only on the leading run of equality predicates — a range column can be *walked*, not
> *seeked*, so it must sit immediately after the equality run and never before it. Putting
> a range column first is the expensive mistake: it turns a 16-leaf-page seek into a
> 1,571-leaf-page filtered walk for a 100× return. Cardinality breaks ties *within* a
> column class; it never moves a range column ahead of an equality column. Sargability is
> the gate in front of all of it — a function, a cast, or an arithmetic operation on the
> column side makes the predicate invisible to the index, and the resulting sequential
> scan is not a planner failure but a query that removed the planner's ability to see the
> truth. The highest-leverage technique, the covering index, is a bet on match rate: it
> wins at 1,000 matching rows and loses at one, and it is only free when the visibility map
> covers the heap pages, which is why `Heap Fetches` is the number to check before
> celebrating.

## Chapter 5 — Query Execution: Access Paths

### 5.1 The Four Access Paths and Their Arithmetic

An access path is the answer to "how does the executor obtain the matching rows of one
table". There are four, and the planner's whole job is to pick between them using estimated
costs. Being able to state the cost model for each is what makes the `EXPLAIN` output
readable rather than decorative.

```text
  THE COST MODEL, IN UNITS
  ────────────────────────────────────────────────────────────────────────
  PostgreSQL exposes relative costs, NOT milliseconds.  The unit is
  "1.0 = one sequential page read from a cold, spinning device, as
  measured at seq_page_cost = 1.0".  The knobs:

    seq_page_cost        = 1.0    (8 kB sequential read)
    random_page_cost     = 4.0    (8 kB random read)     ← the key ratio
    cpu_tuple_cost       = 0.01   (per tuple: projection + filter)
    cpu_index_tuple_cost = 0.005  (per index tuple)
    cpu_operator_cost    = 0.0025 (per operator evaluation)
    parallel_setup_cost  = 1000
    effective_cache_size = the planner's belief about RAM, 4× shared_buffers

  A sequential scan of 256,411 pages costs ≈ 256,411.
  An index scan costing 3 page reads + 40 heap fetches costs
        3 × 4.0  (random)
      + 40 × 4.0 (random heap fetches)
      + 40 × 0.01 (filter evaluation)
      + 40 × 0.005 (index tuple)
      = 12 + 0.4 + 0.2 + 0.2  ≈ 12.8
  and the planner will pick that over 256,411 every time.

  ! THE 4.0 IS A LIE ON MODERN HARDWARE.
  On an NVMe SSD, random_page_cost is closer to 1.0 — the ratio is ~1.0,
  not 4.0.  Since PG 9.5 you can set random_page_cost = 1.1, and many
  teams should.  Conversely, on spinning media or a network-attached
  volume the ratio is 8-20 and the default understates it badly.  The
  consequence: DEFAULT COST SETTINGS PRODUCE BAD PLANS ON BOTH KINDS
  OF HARDWARE, in opposite directions.
  ────────────────────────────────────────────────────────────────────────
```

**Sequential scan.** Read every page in order, evaluate the filter on every tuple. Cost
`N/rows_per_page × seq_page_cost + N × cpu_tuple_cost`. It has exactly one advantage —
**it has no ordering requirement and it reads pages in physical order, so readahead makes
it 80× cheaper on spinning media than the arithmetic suggests** — and two disadvantages: it
touches every page, and it evaluates the predicate on every row, which is a CPU cost
proportional to the table size rather than the answer size.

```text
  Seq Scan on orders  (cost=0.00..384120.00 rows=1200000 width=64)
                      (actual time=0.019..29184.553 rows=1180233 loops=1)
    Filter: (region = 'EU'::text)
    Rows Removed by Filter: 8819767
    Buffers: shared hit=256411
  Planning Time: 0.142 ms
  Execution Time: 29190.881 ms
  ───────────────────────────────────────────────────────────────────────────
  read 256,411 pages, evaluated 10,000,000 predicates, returned 1,180,233.
  88% of the CPU was spent on Rows Removed by Filter.
```

**Index scan.** Descend the tree, walk the leaves in order, fetch each matching heap page
through the TID. Cost `height × random_page_cost + k × (random_page_cost +
cpu_tuple_cost)` where `k` is the match count. Note the `k ×` — **this is a per-row cost,
which is why an index scan over 40% of a table is a bad plan even though the index exists.**

```text
  Index Scan using idx_orders_region on orders
    (cost=0.43..192044.21 rows=100000 width=64)      ← ESTIMATED
    (actual time=0.052..8421.117 rows=1180233 loops=1) ← ACTUAL
    Index Cond: (region = 'EU'::text)
    Buffers: shared hit=1180233                      ← 1.18M random heap reads
  Execution Time: 8424.006 ms
  ───────────────────────────────────────────────────────────────────────────
  1,180,233 buffer accesses, of which 1,180,233 are distinct heap pages
  read in random order.  At random_page_cost 4.0 this is cost 4,720,932
  and the planner correctly rejects it in favour of the seq scan.
```

**Index-only scan.** An index scan where every referenced column is in the index, so the
heap is never visited — *provided the visibility map says it can be skipped*. Covered in
detail in Chapter 4; the access-path point is that it is the cheapest path per matching
row (a sequential walk of the leaf list, zero random I/O) but the most fragile, because its
correctness depends on an unrelated maintenance process.

**Bitmap heap scan.** Read the index for all matching entries, build a bitmap in memory,
then read the heap in physical order testing bits. It exists as a *middle path*:

```text
                    cost per matching row
  ───────────────────────────────────────────────────────────────────
  Seq Scan            1.0 page amortised, SEQUENTIAL
                     1 predicate evaluation

  Index Scan          1.0 random page per row      ← 4.0 cost units
                     1 predicate evaluation

  Bitmap Heap Scan    1/291 of a page per row amortised, SEQUENTIAL
                     1 bit test, no predicate evaluation
                     memory: match_count / 8 bytes
                       1,180,233 rows → 147 kB of bitmap
  ───────────────────────────────────────────────────────────────────

  the planner's switching heuristic, roughly:
     if match_rate  > ~25%  AND  index is not covering  →  Bitmap Heap Scan
     if match_rate  > ~25%  AND  index is covering      →  Index Only Scan
     if match_rate <= ~25%  AND  table is large         →  Index Scan
     if match_rate <= ~25%  AND  table is small         →  Seq Scan
```

### 5.2 When the Planner Is Right to Reject Your Index

This is the question that separates candidates, and the honest answer is uncomfortable for
people who believe indexes are free. **The planner rejecting an index is usually correct,
and an index that is never used is a liability rather than an asset.**

```text
  FOUR REASONS THE PLANNER IGNORES YOUR INDEX
  ────────────────────────────────────────────────────────────────────────
  1. THE TABLE IS TOO SMALL
     Sequential scan cost  =  N/39 pages × 1.0
     Index scan cost       =  3 × 4.0  +  k × 4.0
     The scan wins when N/39 < 12 + 4k.  For k = 1 that is N < 468 rows.
     On NVMe (random = 1.0), the crossover is N < 195 rows.
     ⇒  ANY index on a 300-row lookup table is dead weight.  Every
        insert into it pays maintenance.  Every write pays.  Zero reads
        ever use it.

  2. THE PREDICATE IS NOT SELECTIVE ENOUGH
     An index scan costs 4 cost units per matching row (random fetch);
     a sequential scan costs 1/39 = 0.026 per row for a 39-rows-per-page
     table.  Break-even: 4k = 0.026N  →  k/N = 0.64%.
     ⇒  AN INDEX PAYS ONLY IF IT ELIMINATES AT LEAST 99.36% OF THE
        TABLE.  On an SSD at random=1.0, break-even is k/N = 2.6%.
     This is the number most people do not know and every staff
     candidate should: the threshold is under 1% on spinning media.
     "Add an index on status" is wrong when status matches 40% of rows.
     (There is one exception — the *covering* index, whose per-row cost
     drops to ~0.0034, moving break-even out to 11%.)

  3. THE COLUMN IS IN THE WRONG POSITION
     Covered in Chapter 4.  A non-leading column of a composite index is
     not merely unseekable, it is unindexed.

  4. THE ESTIMATE IS WRONG
     Stale statistics, correlated columns, or a parameter the planner
     guessed.  This is a *bug*, not a reason, and it is the one case
     where a human needs to intervene.  Chapter 8.
  ────────────────────────────────────────────────────────────────────────
```

The arithmetic in point 2 deserves to be the centre of an interview answer, because it
inverts the intuition. People arrive believing indexes make things faster. The correct
framing is: **an index is a bet that the query will discard the overwhelming majority of the
table, and on spinning media the bet has to pay at a 0.64% match rate.** Below that
threshold the index costs more than the scan, and adding it is a net loss for every write
and every buffer-pool byte it occupies.

> **TRADE-OFF — "THE INDEX MAKES THE REPORT SLOWER"**
>
> The condition that flips the answer is **match rate**, and the measurement to take is
> the row count the predicate actually returns, not the number of distinct values in the
> column. There are three legitimate outcomes when adding an index makes things slower, and
> they need different responses. (1) The planner is right and the match rate is 15% — the
> index is genuinely a loss, and the fix is a partial index on the subset that matters,
> which drops the entry count to 5% of the table. (2) The planner is right for the *plan
> shape* but wrong for the *hardware* — the random-to-sequential cost ratio on your
> production storage is not the 4.0 the planner assumes, so raise `random_page_cost` to
> match the device; this is a configuration fix and it changes the shape of the plan rather
> than the data. (3) The plan did not change at all and the slowdown is something else
> entirely — usually the extra index competing for buffer pool with the working set. Only
> the first two are about the index, and telling them apart requires `EXPLAIN ANALYZE`
> before and after, not a benchmark.

### 5.3 "I Added an Index and Nothing Changed" — A Diagnostic Procedure

This deserves a procedure rather than a list, because it is asked constantly and a
candidate who cannot execute it sounds like they have only read about indexes.

```text
  STEP 1 — Is the plan even the same?
  EXPLAIN (ANALYZE, BUFFERS, VERBOSE) <query>;
  Still "Seq Scan" with a big "Rows Removed by Filter" → index rejected,
    go to step 2.   Node type changed but the time did not → the time is
    elsewhere in the tree, go to step 6.

  STEP 2 — Is the predicate sargable?
      Filter: (date(created_at) = '2026-01-05'::date)     ← UNUSABLE
      Index Cond: (created_at >= ... AND created_at < ...) ← usable
  The index is not unused, it is unusable.  Fix the query.  §4.3.

  STEP 3 — Is the table big and selective enough for it to matter?
  SELECT relpages, reltuples FROM pg_class WHERE relname = 'orders';
    relpages = 256,411  (2.1 GB)     reltuples = 10,000,000
  Match 2M of 10M → index scan costs 8M cost units against a seq scan's
  256,411.  The planner chose correctly; no index can help.  §5.2.

  STEP 4 — Are the statistics current?
  SELECT last_analyze, n_mod_since_analyze FROM pg_stat_user_tables
   WHERE relname = 'orders';
    last_analyze = 2026-03-14   n_mod_since_analyze = 4,182,000  (42%)
  ⇒ ANALYZE orders;  and find out why autovacuum is not keeping up.  Ch. 8.

  STEP 5 — Are you looking at a cached plan?
      EXPLAIN <query with literal 42>
      PREPARE q AS <query>;  EXPLAIN EXECUTE q(42);
  Plans differ → parameter sniffing.  §8.5.

  STEP 6 — Did the index make some OTHER query slower?
  pg_stat_user_indexes → is the new index's idx_scan still 0?
  pg_stat_statements  → did shared_blks_read climb for queries that did
                         not change?  That is buffer-pool displacement, and
                         it is the most common outcome on a memory-bound
                         system.  §3.4, §5.4.
```

### 5.4 The Buffer Pool Interaction Nobody Expects

A fourth-order effect that shows up constantly in production and is essentially absent from
tutorials: **an index competes for the buffer pool with the table, and the competition is
not symmetric.**

```text
  2 GB shared_buffers, orders table = 2.1 GB, indexes = 640 MB

  BEFORE adding idx_orders_email (180 MB):
    working set that fits:  orders hot pages (1.2 GB) + all indexes (640 MB)
                          =  1.84 GB  → 92% of the pool
    hot query hit ratio: 99.1%

  AFTER (total 2.24 GB of index+table, pool 2 GB):
    hot query pages displaced: 240 MB
    hot query hit ratio: 88.3%
    the new index is used 40 times/sec, saving 40 × 8 ms = 0.32 s/sec
    the hot query now does 0.117 × its previous physical reads

  NET: you made a fast query slow to make a rare query faster, and
  neither number is visible in EXPLAIN because the buffer pool state
  is not part of the plan.
  ────────────────────────────────────────────────────────────────────
  The detection method is not EXPLAIN.  It is:
    SELECT relname, heap_blks_hit, heap_blks_read, idx_blks_hit, idx_blks_read
      FROM pg_statio_user_tables ORDER BY heap_blks_read DESC;
  and per-query:
    SELECT query, shared_blks_hit, shared_blks_read, calls
      FROM pg_stat_statements ORDER BY shared_blks_read DESC LIMIT 20;
  A query whose shared_blks_read climbs without a corresponding change
  in its own plan is being hurt by someone else's index.
```

The design response is not "add fewer indexes" in the abstract — it is to keep the
hot-query working set smaller than the pool, which usually means narrowing hot rows,
removing dead indexes, and being suspicious of `SELECT *` on a table that is read often.
`pg_stat_statements` ordered by `shared_blks_read` is the tool that finds the actual
offender, and it is worth naming in an interview as the thing you would reach for.

> **PRODUCTION RELEVANCE**
>
> The staff-level form of this observation is that index review is really *memory
> budgeting*. A database on a fixed-RAM instance has a fixed number of pages it can keep
> resident, and every index added spends some of that budget. The teams that do this well
> treat `shared_buffers` sizing and index count as one decision, and they treat an
> `idx_scan = 0` index on a large table as a bug with a due date rather than as a harmless
> leftover. The concrete practice is a monthly report of unused indexes, a review gate on
> new ones against a per-table budget, and a shared understanding that the buffer pool is
> the scarce resource — not CPU, not disk, and certainly not the number of queries you can
> afford to write.

#### Common Mistakes

- Believing an index always helps, and not being able to state the 0.64% break-even match
  rate on spinning media
- Describing the plan cost in milliseconds when the planner reports relative units against
  `seq_page_cost = 1.0`
- Forgetting that `random_page_cost = 4.0` is calibrated to spinning media and makes the
  planner pessimistic on SSDs and optimistic on network storage
- Assuming a bitmap heap scan is always an improvement — it is a middle path, and it forces
  a sort if the query has an `ORDER BY`
- Blaming the index for a regression when the real cause is buffer-pool displacement of a
  different query
- Answering "I added an index and nothing changed" with "add a better index" instead of
  running the six-step diagnostic
- Not knowing that an unused index on a large table still costs buffer pool, which affects
  every other query

#### Interview Questions — Access Paths

**Q1. Under what circumstances is a sequential scan the correct plan, and how do you know
the planner is right rather than wrong?** `STAFF`

Three circumstances, and they should be given with the arithmetic. First, **the table is
small**: a sequential scan of an N-row, 39-rows-per-page table costs `N/39` cost units,
while an index lookup costs `3 × random_page_cost` for the descent plus `4 ×
random_page_cost` per matching row, so below roughly 468 rows (195 on NVMe, where
`random_page_cost` should be 1.1) the scan is genuinely cheaper. Second, **the predicate
is not selective**: an index scan costs about 4 cost units per matching row while a
sequential scan amortises at `1/39 = 0.026` per row, so the index only pays when it
discards more than 99.36% of the table. A predicate matching 15% of rows is 15× more
expensive via the index. Third, **the plan needs the rows in physical order** — a
`BitmapOr` over two low-selectivity predicates, or a full aggregate with no filter. The way
to know the planner is right rather than wrong is `EXPLAIN (ANALYZE, BUFFERS)`: if the
actual time and actual row count match the estimate within an order of magnitude, the cost
model's input was correct and the plan is a genuine optimum for this hardware. If actual
rows are 100× the estimate, the planner was working from bad statistics and the plan is
wrong for a reason that has nothing to do with indexes.

**Q2. You add an index on a `VARCHAR(64)` column and the plan does not change. Walk me
through what you check.** `SCENARIO`

Step one is `EXPLAIN (ANALYZE, BUFFERS)` before and after, to confirm the plan genuinely
did not change rather than merely change shape. Step two is the `Index Cond` line: if it
reads `Filter:` rather than `Index Cond:`, the predicate is non-sargable and the index is
unusable — most often a function, a cast, or an arithmetic expression on the column side.
Step three is size and selectivity: the table's `relpages`, and the actual match count. If
the predicate matches 2M of 10M rows, the index scan costs roughly 8M cost units against a
sequential scan's 256,411, and the planner is correct. Step four is statistics freshness —
`last_analyze` and `n_mod_since_analyze`; a bulk load six months ago with 42% of rows
modified since means the estimate driving the decision was wrong. Step five is plan caching:
compare `EXPLAIN` with the literal inlined against `EXPLAIN EXECUTE` on a prepared
statement, and if they differ you are looking at parameter sniffing. Step six is the one
people forget — did the index make some *other* query slower by displacing it from the
buffer pool, in which case the plan you are reading is not the query that got worse.

**Q3. When is a bitmap heap scan the right plan, and what is its cost model?** `ADVANCED`

It is the middle path between a sequential scan and an index scan, and it exists because
both extremes are wrong for a predicate matching somewhere between 5% and 30% of a large
table. An index scan over 1.18M matching rows does 1.18M random heap fetches; a sequential
scan reads 256,411 pages but evaluates 10M predicates on the CPU. The bitmap heap scan
reads the index once to build a bitmap — 1,180,233 bits = 147 kB in memory — and then reads
the heap once, in physical order, testing one bit per row. Its cost is one sequential pass
over the heap plus one pass over the matching index entries, and it eliminates the
per-tuple predicate evaluation entirely. The planner switches to it when the estimated
match rate exceeds roughly 25% and the index is not covering; if the index is covering it
prefers an index-only scan, which is cheaper still. The important trade-off to volunteer is
that the output arrives in *physical* order, so any `ORDER BY` on a different column forces
a sort on top — which for 1.18M rows is a 200 MB sort that may spill to disk and can easily
cost more than the scan it was meant to avoid.

**Q4. Your `shared_buffers` is 2 GB. You add a 180 MB index and the top query's latency
doubles. Explain the mechanism and what you would do.** `STAFF`

Buffer-pool displacement. The instance can hold a fixed number of pages resident, and every
index spends some of that budget. Adding 180 MB of index means 22,500 fewer pages available
for the table, so the hot query's working set no longer fits, its hit ratio falls from
99.1% to something like 88%, and its physical reads rise by an order of magnitude. The new
index itself is used 40 times a second and is working perfectly — you have simply moved
the pain onto a query that runs 4,000 times a second. This is invisible in `EXPLAIN`,
because the buffer pool's state is not part of any plan. The detection is
`pg_stat_statements` ordered by `shared_blks_read`: a query whose reads climb with no
change to its own plan has been displaced by someone else's index. The responses, in order
of preference: remove the unused and redundant indexes first, which is often 300 MB back
for free; then shrink the hot path's working set by narrowing the hot query's projection;
then consider whether the new query could be served by a partial or BRIN index an order of
magnitude smaller. Raising `shared_buffers` is the answer of last resort and should be
justified by a measured hit-ratio deficit, not by this incident.

#### Further Reading

- [PostgreSQL — Query Planning: Costs](https://www.postgresql.org/docs/current/runtime-config-query.html#GUC-RANDOM-PAGE-COST) — the exact meaning and defaults of every cost constant.
- [PostgreSQL — Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) — the full option set, including `BUFFERS` and `WAL`, from the manual.
- [Use The Index, Luke — How indexes are used](https://use-the-index-luke.com/sql-performance-index) — the practical side of scan versus lookup, with the cost reasoning behind each.
- [CMU Database Systems — Query Execution & Planning](https://www.cs.cmu.edu/~15451-f22/lectures/12-exec-plan.pdf) — the Volcano iterator model underneath the plan tree, which is what the `loops` column is really counting.
- [pg_stat_statements — PostgreSQL Extension](https://www.postgresql.org/docs/current/pgstatstatements.html) — the per-query buffer and time counters that detect displacement an `EXPLAIN` cannot.

> **CHAPTER 5 SUMMARY**
>
> An access path is a cost decision made in relative units where one sequential page read
> is 1.0, and the four paths are sequential scan, index scan, index-only scan and bitmap
> heap scan. The arithmetic that governs all of them: an index scan costs about 4 cost
> units per matching row while a sequential scan amortises at 0.026, so **an index only
> pays when it discards more than 99.36% of a table** — below that, adding one is a net
> loss. That is why the planner rejecting an index is usually correct, and it is the
> honest answer to "my index is not being used". The three genuine bugs are a
> non-sargable predicate, stale statistics, and a cached plan from parameter sniffing.
> Underneath all of it sits the cost model's own calibration: `random_page_cost = 4.0` is
> a spinning-disk assumption that makes the planner pessimistic on SSDs and optimistic on
> network volumes, so the same schema can get a bad plan on both. And the effect nobody
> predicts is buffer-pool displacement — an index is also a claim on the RAM that keeps
> other queries' pages resident, which is why `pg_stat_statements` ordered by
> `shared_blks_read` finds problems that no `EXPLAIN` can.

## Chapter 6 — Joins at Runtime

Volume 3 covered what a join *means*. This chapter covers how one is *executed*, and the
distinction is not academic: the same four tables joined in the same logical order can be
answered by three different algorithms, and the choice moves runtime by a factor of a
thousand.

### 6.1 Nested Loop

Read every row of the outer relation, and for each one, look up the matching rows of the
inner relation. The cost is `|outer| × (cost of one inner lookup)`.

```text
  NESTED LOOP — the two regimes, same algorithm, 1.9×10^9 apart
  ───────────────────────────────────────────────────────────────────────────
  INNER: customers, 1,200,000 rows = 30,769 pages

  REGIME A — inner access = sequential scan
    for each row in OUTER:  scan the ENTIRE inner table
    cost = |OUTER| × 30,769

    OUTER = orders, 10,000,000 rows
      10,000,000 × 30,769 = 3.08 × 10^11 page reads
      at 200 IOPS = 178 DAYS                       ✗ not a query, an outage

  REGIME B — inner access = index lookup on id      ◄── the one that matters
    for each row in OUTER:  descend 3 pages, fetch matches
    cost = |OUTER| × (3 + k)

    OUTER = orders_filtered, 40 rows (recent EU orders)
      40 × (3 index + 1 heap) = 160 page reads = 6.4 ms
      ratio vs Regime A:  3.08×10^11 / 160 = 1.9×10^9      ✓
  ───────────────────────────────────────────────────────────────────────────
  Same algorithm, same two relations, 9 orders of magnitude apart, decided
  entirely by whether the inner access has an index.
  ───────────────────────────────────────────────────────────────────────────
```

```text
  CRITICAL DETAIL IN REGIME B — the "3 page reads" is PER ITERATION
  ───────────────────────────────────────────────────────────────────────────
  In the EXPLAIN output, that inner index scan reports:

      ->  Index Scan using customers_pkey on customers
            (cost=0.43..8.31 rows=1 width=180) (actual rows=1 loops=40)
                                                                ^^^^^^^^^
                                                  40 iterations × 3 reads = 120

  The `rows=1` is NOT the total.  The total is rows × loops.
  This is the single most misread number in EXPLAIN output and Chapter 7
  devotes a section to it.  It matters most precisely here, because a
  nested loop is the one node type where the multiplier is large and
  the per-iteration number is small.
  ───────────────────────────────────────────────────────────────────────────
```

**Regime B is why a nested loop is often correct.** The folklore is that nested loop is
the naive algorithm and hash join is the smart one, and that is true only for large outer
relations. The planner compares `|outer| × inner_lookup_cost` against `|outer| + |inner|`
and picks whichever is smaller:

| Outer rows | Inner rows | Inner index? | Chosen | Why |
| --- | --- | --- | --- | --- |
| 40 | 1,200,000 | yes | **nested loop** | 160 reads vs 1.2M for hash |
| 40 | 1,200,000 | no | nested loop (seq inner) | 40 × 30,769 = 1.2M — tie |
| 5,000 | 1,200,000 | yes | **hash join** | 15,020 vs 1.2M+5,000 |
| 10,000,000 | 1,200,000 | yes | **hash join** | 30M vs 1.2M+10M |
| 10,000,000 | 1,200,000 | no | **hash join** | 3.08×10^11 vs 1.2M+10M |

The row where the answer flips is around 25,000 outer rows for that inner size — and the
flip point moves *linearly with the inner relation's size*, so a bigger inner table means
the planner tolerates a much bigger outer relation before abandoning the loop. **A small
outer table changes the answer**, and that is the fact to volunteer.

### 6.2 Hash Join

Build a hash table from one side, then probe it with the other. Cost is linear in both
inputs, which makes it the general-purpose choice for large joins.

```text
  HASH JOIN
  ───────────────────────────────────────────────────────────────────────────

  PHASE 1 — BUILD the hash table from the INNER relation
  ───────────────────────────────────────────────────────────────────────────
    hash_table = new  bucket array sized for work_mem
    for each row in INNER:                        ◄── |INNER| iterations
        h = hash(customer_id)
        bucket[h % n_buckets].append(row)        ◄── the build cost
                                                   ONE full pass, ONE row in RAM
                                                   per distinct key

  PHASE 2 — PROBE with the OUTER relation
  ───────────────────────────────────────────────────────────────────────────
    for each row in OUTER:                        ◄── |OUTER| iterations
        h = hash(orders.customer_id)
        for each row in bucket[h % n_buckets]:    ◄── average 1-3 comparisons
            if orders.customer_id = customer.id:  ◄── the probe
                emit join result

  ───────────────────────────────────────────────────────────────────────────
  MEMORY:  the hash table must fit in work_mem
           1,200,000 rows × 180 bytes + 32 B bucket overhead = 254 MB
           default work_mem = 4 MB
  ⇒ SPILLS.  See below.
  ───────────────────────────────────────────────────────────────────────────
```

```text
  WHAT "SPILLING" LOOKS LIKE  (work_mem 4 MB, build side 254 MB)
  ───────────────────────────────────────────────────────────────────────────
  The executor partitions BOTH sides by the same hash function into
  work_mem-sized batches on disk, then hash-joins each batch pair in
  memory:

      Batch 0: 1,842 rows in   Batch 1: 1,911 rows in   ...  139 batches
      139 × 2 sides = 278 writes + 278 reads = 556 random 8 kB I/Os
      at 200 IOPS = 2.78 seconds of pure spill overhead, every execution.

  THE FIX, in order of preference:
    1. reduce the build side so it fits — a covering index on the build
       side, a partial index, or a filter pushed BELOW the join rather
       than above it.  This is the only fix with no downside.
    2. change the plan — if the build side has a usable index and the
       outer side is small, a nested loop avoids the hash entirely.
    3. raise work_mem for the SESSION:  SET work_mem = '256MB';
       ! PER CONNECTOR, PER WORKER, PER OPERATION.  200 pooled connections
          at 256 MB exhausts a 32 GB host instantly.  This is why "just raise
          work_mem" is a staff-level answer and not a junior one.
       PostgreSQL 13+ has hash_mem_multiplier, which scales work_mem for the
       hash join specifically and is safer than raising work_mem globally.
```

> **INTERVIEW TRAP — "WHICH SIDE GOES IN THE HASH TABLE?"**
>
> The trap is answering "the smaller one" without the caveat, because the build side is not
> chosen by row count. It is chosen by the plan that produces the cheapest input, which is
> usually — but not always — the smaller relation, and the deciding factor is **whether
> memory is available at the time the join starts**. A query running concurrently with nine
> other queries each using 200 MB of `work_mem` may find that a nominally smaller build
> side does not fit, and the planner will swap sides to use the one it can hold. The
> sharper version of the question is *"what happens when the build side does not fit?"* and
> the answer must include: the join spills to disk in `work_mem`-sized hash partitions,
> both inputs are partitioned by the same hash function so each pair can be processed
> independently, the cost goes from one sequential pass to two passes plus 2× the batch
> count in random disk writes, and the right response is usually to reduce the build side
> — add the predicate that filters it, add a covering index that makes it narrow, or let a
> nested loop handle it instead — rather than to raise `work_mem` globally, because
> `work_mem` is allocated per operation per worker and raising it globally on a pool of
> 200 connections is how a database runs out of RAM.

### 6.3 Merge Join

Sort both inputs, then walk them in lockstep. It is the only algorithm that produces output
in sorted order, and it is the natural choice when the inputs are *already* sorted.

```text
  MERGE JOIN — the lockstep walk
  ───────────────────────────────────────────────────────────────────────────

    sort(A)                    sort(B)
    ─────────                  ─────────
    1  Alice                   1  Alice   → MATCH, emit (1,1), advance both
    2  Bob                     2  Bob     → MATCH, emit (2,2), advance both
    3  Carol                   3  Dave    → A < B, emit (3,∅), advance A only
    4  Dave                    4  Erin    → MATCH, emit (4,4), advance both
    5  Frank                   5  Frank   → MATCH, emit (5,5), advance both
    6  Grace

    advance pointer ──────────────────────────────────────────────►
    each row is read exactly ONCE from each side.  Total comparisons
    are O(|A| + |B|) after the sorts, not O(|A| × |B|).
  ───────────────────────────────────────────────────────────────────────────

  CRITICAL PRECONDITION: BOTH INPUTS MUST BE SORTED ON THE JOIN KEY
  ───────────────────────────────────────────────────────────────────────────
  If the plan shows a "Sort" node above a relation that feeds a
  Merge Join, you are paying:

      sort 1,200,000 rows of 180 bytes = 216 MB
      external merge sort → 216 MB / work_mem(4 MB) = 54 disk batches
      written to a temp file and read back
      = ~108 random 8 kB I/Os = 0.54 s of pure sort cost

  and if the sort is a top-N or an index scan that avoids it entirely,
  the merge join becomes dramatically cheaper.  This is the entire
  practical argument for the classic advice:

      create the index so the sort disappears
      → Merge Join without a Sort node
      → which requires the join predicate to match the index's
        leading column, in the same order
  ───────────────────────────────────────────────────────────────────────────
```

Merge join wins in three situations, and it is worth being able to name all three: (1)
**both inputs arrive already sorted**, so no sort node is needed — the most common real
case, and the reason `ORDER BY` + `LIMIT` queries sometimes get merge joins; (2) **the
output must be sorted anyway**, in which case the sort is not wasted work and every other
algorithm would pay for it separately; (3) **both relations are large and neither fits in
`work_mem`**, where merge join's streaming behaviour beats a hash join that would spill in
the same way but with random I/O rather than sequential.

### 6.4 How the Planner Actually Picks

The decision procedure, and it is genuinely just this:

```text
  FOR EACH CANDIDATE JOIN ORDER (the planner enumerates "interesting" ones,
  not all n! permutations — Volume 1, §1.3):
  ───────────────────────────────────────────────────────────────────────────
    FOR EACH candidate join METHOD (nested loop / hash / merge):
        estimate cost by the formulas above, using ESTIMATED row counts
        from the histograms
    keep the (order, method) pair with the lowest total cost
  ───────────────────────────────────────────────────────────────────────────

  THE THREE ESTIMATES THAT DRIVE IT, AND HOW WRONG THEY GET
  ───────────────────────────────────────────────────────────────────────────
  1. cardinality of the base relation      from reltuples/reltuples_stats
     accurate to ±5% after ANALYZE

  2. selectivity of a single predicate      from the histogram of that column
     accurate when the data is not skewed; catastrophically wrong on a
     column where 99% of rows share one value (the classic "status"
     histogram, where the planner sees one bucket and estimates 0.5%)

  3. cardinality of the join result         the PRODUCT of the two above,
     or a multi-column histogram if extended statistics exist

  where it goes catastrophically wrong:
  ───────────────────────────────────────────────────────────────────────────
  • correlated predicates.  `WHERE a.x = b.y AND a.z = b.w` — the planner
    multiplies the two selectivities.  If they are correlated (rows that
    match on x almost always match on w) the true result is far LARGER
    than the product.  Error: 100x-10,000x.  Fix: CREATE STATISTICS with
    dependencies.  §8.4.

  • a stale histogram after a bulk load.  The planner believes January's
    distribution; the table now holds 40M rows all with last_seen = today.
    Error: 100x.  Fix: ANALYZE.  §8.3.

  • a parameter.  The planner must choose a plan before it knows the value.
    §8.5.
```

### 6.5 `LATERAL` and the Index-Nested-Loop Escape Hatch

`LATERAL` is the SQL construct that lets a per-row lookup be expressed explicitly, which
turns the "will the planner pick a nested loop?" question into something you control.

```sql
-- The top-10-customers-by-value query that is otherwise a full scan.
SELECT c.id, c.name, t.total
  FROM customers c
  CROSS JOIN LATERAL (
        SELECT SUM(total_cents) AS total
          FROM orders o
         WHERE o.customer_id = c.id
         ORDER BY o.created_at DESC
         LIMIT 10
  ) t
 WHERE t.total IS NOT NULL
 ORDER BY t.total DESC
 LIMIT 100;
```

```text
  WHAT LATERAL DOES
  ───────────────────────────────────────────────────────────────────────────
  The inner subquery may reference columns from the relation to its LEFT.
  That is the entire feature.  The consequence for planning:

  without LATERAL, you need a CTE + window function:
      WITH recent AS (
        SELECT customer_id, SUM(total) OVER (PARTITION BY customer_id) total,
               ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) rn
          FROM orders
      )
      SELECT ... FROM customers JOIN recent USING (customer_id)
      WHERE rn <= 10
    → this aggregates over ALL 40,000,000 orders, then joins.
      Even with an index, the window function forces a full pass.  40M rows.

  with LATERAL:
      for each of 1,200,000 customers:
          Index Scan using idx_orders_customer_created on orders
            Index Cond: (customer_id = c.id)          ◄── 3 page reads
            Filter: recent 10                          ◄── 10 rows
      total = 1,200,000 × 3 index + heap fetches
            = 3,600,000 index + up to 12,000,000 heap reads
      and the planner can stop after it has 100 results if you also
      bound the customer side.

  ───────────────────────────────────────────────────────────────────────────
  THIS IS THE CANONICAL CASE FOR LATERAL, and it needs exactly two things:
    1. an index on (customer_id, <the ORDER BY column>)
    2. LIMIT inside the lateral, so each iteration is bounded
  ───────────────────────────────────────────────────────────────────────────
```

The honest caveat, and it belongs in a staff answer: **`LATERAL` moves the work from one
big sequential pass to N small random lookups, and that is a win only when the index
exists and the per-iteration result is bounded.** On a table with no index it is
`1,200,000 × 30,769` page reads — the worst possible plan, and PostgreSQL *will* choose it
if the statistics say the join is selective. `LATERAL` is a tool for making a plan shape
explicit when you know the shape is right; it is not a substitute for an index.

> **SCALING REALITY CHECK**
>
> The nested-loop-with-index regime has a hard ceiling that is worth computing, because it
> is where "this query was fast at 100k rows and is impossible at 100M" comes from. An
> index-nested-loop costs `|outer| × (height + k)` page reads. At `height = 3` and `k = 1`,
> that is `4 × |outer|`. For the result to complete in one second on spinning media at
> 125 IOPS, `|outer|` must be under 31 rows. On an NVMe at 100,000 IOPS, `|outer|` can be
> 25,000. **So the largest outer relation for which an index-nested-loop is a one-second
> query moves by three orders of magnitude with the storage device**, and any rule of thumb
> about "how big can the outer side be" is a rule of thumb about your hardware. The
> cross-over against a hash join is `|outer| = (|inner| × hash_build_cost) / (inner_lookup
> cost)`, which for a 1.2M-row inner relation with a `work_mem`-resident build is around
> 300,000 outer rows. Past that, you are building a hash table; before it, you are probing
> an index.

#### Common Mistakes

- Describing nested loop as always-slow, when the index-nested-loop regime is the correct
  and often the fastest plan
- Reading the inner node's `rows` in a `EXPLAIN` as the total and forgetting to multiply by
  `loops` — in a nested loop this is where the real number lives
- Saying the hash join builds on "the smaller table" without the `work_mem` caveat, which
  is what actually decides it under concurrency
- Omitting the spill-to-disk behaviour when the build side exceeds `work_mem`, which is
  the most common real-world hash join
- Describing merge join without the "both sides must be sorted" precondition, which is the
  entire practical content of the algorithm
- Believing `LATERAL` is an optimisation — it is a way of *expressing* a plan shape, and
  without an index it is the worst possible plan
- Forgetting that a `Sort` node above a merge join's input means you are paying for an
  external sort that an index could have eliminated

#### Interview Questions — Join Algorithms

**Q1. When is a nested loop the right choice, and how does the planner decide?** `STAFF`

A nested loop is right when the outer relation is small *and* the inner side has a usable
index, because its cost is `|outer| × (height + k)` page reads — for 40 outer rows against
a 1.2M-row inner table with a primary-key index, that is 160 page reads, against 1.2M for
a hash join's build phase. The planner computes both costs from estimated row counts and
takes the lower. The outer size at which the answer flips is roughly 25,000 rows for a
1.2M-row inner relation, and that threshold moves linearly with the inner size: a bigger
inner relation means a bigger build cost for the hash join, which means the loop survives
to a larger outer. The corollary worth volunteering is that "small" is relative to the
*inner* size, not an absolute number — 200,000 outer rows against a 4,000-row inner is a
perfect nested loop, and 40 outer rows against a 200M-row inner is a catastrophic one. And
the failure mode is the other regime: a nested loop with a *sequential* inner access costs
`|outer| × |inner|/39` page reads, which for 10M × 1.2M is 3×10^11 page reads and about
178 days. That is why "the join is nested loop" in a plan is not by itself a red flag — you
have to look at the inner node.

**Q2. A hash join spills to disk. What is happening, what does it cost, and what do you do
about it?** `TRICKY`

The build side's hash table must fit in `work_mem`, which defaults to 4 MB. When it does
not — a 1.2M-row build side at 180 bytes is 254 MB — the executor partitions *both*
relations by the same hash function into `work_mem`-sized batches, writes them to temp
files, and then processes each batch pair independently with a hash join that fits in
memory. The cost is therefore two full passes plus 2 × the batch count in random 8 kB disk
operations: 139 batches at 4 MB means 278 writes and 278 reads, which at 200 IOPS is 2.78
seconds of pure spill overhead — often more than the join itself. The responses, in order
of preference: reduce the build side so it fits, which means pushing the filter that
removes rows *below* the join rather than above it, or adding a covering index that makes
the build side narrow; then consider whether an index-nested-loop would avoid the hash
entirely, which it will if the outer side is small; then `SET work_mem` for the session
only, understanding that it is per connector per worker per operation, so 200 pooled
connections at 256 MB each will exhaust a 32 GB host. The staff-level caveat is that
"raise `work_mem` globally" is how a memory incident starts, and PostgreSQL 13's
`hash_mem_multiplier` exists precisely to scope the increase to hash joins.

**Q3. Merge join requires both inputs sorted. What does that cost, and how do you remove
it?** `ADVANCED`

The sort. Sorting a 1.2M-row, 180-byte relation is 216 MB, and with `work_mem` at 4 MB
that is an external merge sort writing and reading back 54 batches — about 108 random
8 kB I/Os, roughly 0.54 seconds, per input, before the join does any work. That is
frequently more than the join itself, which is why seeing a `Sort` node above a merge
join's input is the signal to look for an index rather than to raise `work_mem`. The
removal requires the index's leading column to be the join key *in the same order* as the
join, and it works because an index scan returns rows already in join-key order, so the
sort node vanishes. The general rule is that merge join's true cost is
`sort(A) + sort(B) + |A| + |B|`, and it wins when both sorts are free — either because
the inputs arrive sorted, or because the output must be sorted anyway and the sort is not
wasted work, or because both relations are too large to hash and streaming beats
spilling.

**Q4. `LATERAL` turned a 40-million-row aggregation into 1.2M index lookups and made the
query 20× faster. When is that the wrong move?** `STAFF`

When there is no index on the inner side, in which case the same `LATERAL` is
`1,200,000 × 30,769 = 3.7 × 10^10` page reads and PostgreSQL will happily choose it if the
statistics make the join look selective. `LATERAL` expresses a plan shape; it does not make
that shape cheap. It is also wrong when the per-iteration result is not bounded — dropping
the `LIMIT` from inside the lateral means each iteration aggregates *all* of that
customer's orders, which is the original problem wearing a different syntax. And it is
wrong when the outer relation is large and the inner work per row is more than a constant:
at 200,000 outer rows each requiring a 4-page lookup plus a partial sort, you have traded
one sequential pass for 800,000 random reads, and a hash join with the predicate pushed
below it would be far better. The honest framing is that `LATERAL` is the right tool for
"for each row, find the top-k related rows" *given* an index on the join column, and it is
the tool by which you make the top-k pattern expressible at all — the window-function
alternative has to aggregate the entire table.

**Q5. Your reports endpoint does a five-way join that is a nested loop over a 40,000-row
outer relation. You can add `work_mem`, add indexes, rewrite the query, or change the
schema. Which do you do first, and how do you decide?** `SCENARIO`

The first step is not a change, it is a measurement: `EXPLAIN (ANALYZE, BUFFERS)` on the
nested loop, specifically the inner node's `loops` and the aggregate of its buffer counts,
multiplied out. If the outer is genuinely 40,000 and the inner access is a sequential
scan, the cost is `40,000 × |inner|/39` and no amount of `work_mem` helps because there is
no hash table involved — the fix there is a predicate pushed below the join or a schema
change. If the inner access is an index scan, the cost is `40,000 × 4 = 160,000` page
reads, and the question becomes whether a hash join would beat it, which for a large inner
relation it probably would; that is a `work_mem` or a plan-shape question, not an index
question. The index question is whether the inner index *covers* the columns the join and
the subsequent filter need, because if it does not, each iteration also pays a random heap
read, and 40,000 of those is the whole problem. The schema change is the last option but
it is the one that scales: if the report is `orders ⋈ customers ⋈ products ⋈ shipments ⋈
returns` and the driving table is a fact table, the correct answer is usually a
materialised view refreshed on a schedule, not a faster join. The order I would propose is
cover the inner index, then bound the outer relation in the application, then consider the
materialised view — and I would not start with `work_mem`, because a 40,000-iteration
nested loop is telling you the plan shape is wrong, and no memory setting fixes a plan
shape.

#### Further Reading

- [PostgreSQL — Joins and Nested Loops](https://www.postgresql.org/docs/current/using-explain.html#USING-EXPLAIN-JOINS) — how the planner combines join methods with the `loops` value, from the manual.
- [PostgreSQL — Query Planning: Join](https://www.postgresql.org/docs/current/runtime-config-query.html) — the cost constants for joins and how `work_mem` and `hash_mem_multiplier` interact.
- [CMU Database Systems — Join Algorithms](https://www.cs.cmu.edu/~15451-f22/lectures/11-joins.pdf) — the derivation of nested loop, hash join and merge join costs that the planner implements.
- [PostgreSQL — LATERAL](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-LATERAL) — the specification, and the cases the manual calls out where it beats the window-function form.
- [Use The Index, Luke — Joins](https://use-the-index-luke.com/joins) — the practical side of index-nested-loop versus hash join, with the crossover arithmetic.

> **CHAPTER 6 SUMMARY**
>
> Three algorithms, three cost formulas, and a planner that picks by comparing estimated
> costs. Nested loop costs `|outer| × inner_lookup`, which makes an index-nested-loop the
> correct and often the fastest plan for a small outer relation — 40 outer rows against a
> 1.2M-row inner is 160 page reads versus 1.2M for a hash build — and the crossover moves
> linearly with the inner size and by three orders of magnitude with the storage device.
> The same algorithm with a *sequential* inner access is `3×10^11` page reads, which is why
> "nested loop" in a plan is only meaningful once you read the inner node and multiply its
> `rows` by its `loops`. Hash join is linear in both inputs but bounded by `work_mem`: a
> 254 MB build side against a 4 MB budget spills into hash-partitioned temp files at
> roughly 556 random I/Os, and "raise `work_mem`" is a memory incident waiting to happen
> because it is per connection per worker per operation. Merge join is the only algorithm
> that returns sorted output and it requires both inputs sorted, so its true cost is
> `sort(A) + sort(B) + |A| + |B|`, and an index that removes both sorts is usually worth
> more than any planner setting. The estimates that drive all of it come from histograms,
> and the three ways they fail — correlated predicates, stale statistics after a bulk load,
> and unknown parameters — are the subject of Chapter 8.

## Chapter 7 — Reading `EXPLAIN` / `EXPLAIN ANALYZE`

### 7.1 `EXPLAIN` Without `ANALYZE` Is an Opinion, Not a Measurement

This distinction is the single most important thing in the chapter and it is the one
candidates most often get wrong in a job interview.

```sql
EXPLAIN SELECT * FROM orders WHERE region = 'EU';
```

```text
  Seq Scan on orders  (cost=0.00..384120.00 rows=1000000 width=180)
  Filter: (region = 'EU'::text)
  Planning Time: 0.142 ms
  ───────────────────────────────────────────────────────────────────────────
  THIS IS NOT A MEASUREMENT.  Nothing was executed.  The cost of 384,120
  is the optimiser's *estimate* of what the scan would cost, computed
  from statistics, using a cost model calibrated to a device that may
  not be your device.  The rows=1000000 is a *guess* about the match
  count.  Both can be wrong by orders of magnitude and you cannot tell
  from this output.
```

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE) SELECT * FROM orders WHERE region = 'EU';
```

```text
  Seq Scan on orders  (cost=0.00..384120.00 rows=1000000 width=180)
                      (actual time=0.019..29184.553 rows=1180233 loops=1)
    Filter: (region = 'EU'::text)
    Rows Removed by Filter: 8819767
    Buffers: shared hit=256411
  Planning Time: 0.142 ms
  Execution Time: 29190.881 ms
  ───────────────────────────────────────────────────────────────────────────
  NOW it is a measurement: the query ran, for 29.19 seconds, and
  returned 1,180,233 rows.  The estimate said 1,000,000 — within 18%,
  so the planner's model was reasonable and the plan is genuinely
  correct for this predicate.  29 seconds is the *right answer* to a
  question that asked for 11% of the table.
  ───────────────────────────────────────────────────────────────────────────
```

**`EXPLAIN ANALYZE` executes the query.** That has three consequences that every engineer
learns the hard way exactly once:

1. `INSERT`, `UPDATE` and `DELETE` are executed and rolled back. That is safe but it takes
   the locks, it consumes the WAL, and it triggers any side effects of volatile functions.
2. It costs the query's full runtime. An `EXPLAIN ANALYZE` of a 40-second report is a
   40-second report, and doing it in a production console is a self-inflicted incident.
3. It does **not** give a plan that reflects the parameters your application passes. It
   gives a plan for the literals you typed, which is a different problem from the one you
   are usually debugging.

The three-stage practice that avoids all three:

```text
  1.  EXPLAIN <query>                              cheap, safe, estimates only
      →  sanity-check the plan SHAPE.  Is the join order what you expected?
         Is there a Sort that an index could remove?  Stop here if it looks right.

  2.  EXPLAIN <query> with production parameter values hard-coded
      →  if this is a parameterised query, this is closer to reality than
         step 1 and still costs nothing

  3.  EXPLAIN (ANALYZE, BUFFERS) <query>
      →  only now, ideally on a replica, with a statement_timeout set
      →  this is the only step that measures
```

### 7.2 The Plan Tree, Annotated

```text
  Sort  (cost=184523.40..184523.45 rows=40000 width=64)
        (actual time=8120.441..8122.109 rows=38120 loops=1)
        Sort Key: t.total DESC          Sort Method: quicksort  Memory: 4212kB
      Buffers: shared hit=20418
   ▲ total 8122 ms, but a 4212 kB in-memory quicksort is ~180 ms of that.
     The time is in the child.  Always read the tree leaves-up.

  ->  Aggregate  (actual time=8120.112..8120.401 rows=40000 loops=1)
                    Group Key: t.customer_id
                    ->  Nested Loop  (actual time=8118.902..8110.442 rows=40000 loops=1)
                                    Buffers: shared hit=20412
        ->  Index Only Scan using orders_covering on orders o
              (cost=0.43..4.12 rows=42 width=28)
              (actual time=0.041..0.187 rows=40 loops=1000)   ◄── READ THIS LINE
              Index Cond: (region = 'EU'::text)     Heap Fetches: 0
              ->  Index Only Scan using customers_pkey on customers c
                    (cost=0.43..8.31 rows=1 width=180)
                    (actual time=0.003..0.004 rows=1 loops=40000) ◄── AND THIS
                    Index Cond: (c.id = o.customer_id)

  Planning Time: 0.312 ms       Execution Time: 8122.556 ms
  ───────────────────────────────────────────────────────────────────────────
  WHERE THE TIME WENT:
    Nested Loop                8110 ms   ─┐
      orders scan, 1000 loops    187 ms   │ the inner lookup, 40,000 times,
      customers scan, 40k loops  160 ms  ─┘ is 160 of 8110 ms = 2%
      outer per-loop overhead   7750 ms     executor bookkeeping, buffer
                                           lookups, visibility checks
    Aggregate                    0.3 ms
    Sort                        180 ms
  ───────────────────────────────────────────────────────────────────────────
  THE TWO NUMBERS THAT MATTER:
    orders:    actual rows=40,  loops=1000  →  40,000 rows total
    customers: actual rows=1,   loops=40000 →  40,000 rows total
  NEITHER `rows=40` NOR `rows=1` IS THE TOTAL.  §7.3.
```

The structural reading rules, in the order a senior candidate should apply them:

1. **`Execution Time` at the bottom is the wall clock.** But a query can also be limited by
   a `LIMIT` at the top, in which case the top node's `actual time` is what matters, not the
   root's — with `LIMIT 10`, the executor stops feeding the top once it has 10 rows.
2. **Read leaves to root.** A parent node's `actual time` *includes* its children's. A node
   whose own time (parent time minus max child time) is large is doing local work — a
   sort, a hash build, a filter evaluation. A node whose own time is small and whose child
   is large is a pass-through and the child is the problem.
3. **Look for a `Sort` node whose `Sort Method` is `external merge Disk: 84MB`.** That is
   a query about to be limited by disk. `quicksort Memory: 4212kB` is fine; `external merge
   Disk: 42120kB` is an incident.
4. **`Rows Removed by Filter` is the CPU you wasted.** A node with
   `rows=1,180,233` and `Rows Removed by Filter: 8,819,767` evaluated 10M predicates to
   return 11% of the table — that is 8.8M wasted `cpu_operator_cost` evaluations.
5. **`Buffers: shared hit=N` and `shared read=N` are two different latencies.** `hit` is
   RAM at ~100 ns; `read` is the OS cache or the device. A query with `hit=20418,
   read=0` is doing almost all its work in RAM and its 8 seconds is CPU and executor
   overhead, not I/O. A query with `hit=200, read=20418` is doing device I/O. The *ratio*
   tells you which problem you have, and they have completely different fixes.

### 7.3 The `rows × loops` Trap — the Most Common `EXPLAIN` Error

This deserves its own section because it is the single most common misreading of `EXPLAIN`
output in production, and it produces a diagnosis that is exactly backwards.

```text
  WHAT THE PLAN SAYS
  ───────────────────────────────────────────────────────────────────────────
  ->  Nested Loop  (actual rows=1 loops=100000)
        ->  Index Scan using t_pkey on t
              (actual rows=1 loops=100000)

  THE MISREADING
  "The index scan returns 1 row, 100,000 times. That is tiny. The nested
   loop's 1 row is the bottleneck.  Something is wrong with the loop."

  THE TRUTH
  actual rows × loops = 1 × 100,000 = 100,000 rows read from `t`.
  The nested loop produced 100,000 rows.
  This is not a small query.  It is a 100,000-row operation that the plan
  text renders in a way that reads like a single-row lookup.
  ───────────────────────────────────────────────────────────────────────────
```

The rule, stated precisely: **`rows` in an `EXPLAIN ANALYZE` node is the average number of
rows that node emits *per iteration of its parent*, and `loops` is the number of times the
parent called it. The node's total output is `rows × loops`.** For a top-level node,
`loops=1` and the two coincide, which is exactly why the error survives — nobody tests
their understanding on the top node.

```text
  WORKED EXAMPLES — the multiplier is not always large
  ───────────────────────────────────────────────────────────────────────────
  Nested Loop (actual rows=1200000)
    ->  Seq Scan on a  (actual rows=200 loops=1)
            200 × 1 = 200   ✓ small outer, 1.2M output
    ->  Index Scan on b (actual rows=6 loops=200)
            6 × 200 = 1,200  ← the inner produced 1,200 rows
                                (and 200 × 3 = 600 index page reads
                                 plus 1,200 heap reads)

  Hash Join (actual rows=980000)
    ->  Seq Scan on orders  (actual rows=980000 loops=1)
    ->  Hash  (actual rows=1200000 loops=1)
          ->  Seq Scan on customers (actual rows=1200000 loops=1)
  every loops=1 here, because a hash join scans each input exactly once

  Aggregate (actual rows=12 loops=1)
    ->  Nested Loop (actual rows=40 loops=12)
          ->  Index Scan (actual rows=40 loops=12)
                40 × 12 = 480 rows read
  ───────────────────────────────────────────────────────────────────────────
  and the case that makes the number look WRONG:
  Index Only Scan (actual rows=0.5 loops=1000000)
  → 0.5 is a legitimate floating-point average.  PostgreSQL rounds
    `rows` to one decimal place precisely because sub-1 averages are
    real and common in nested loops.  0.5 × 1,000,000 = 500,000.
  Anyone who reads "0.5 rows" as "almost nothing" is wrong by six
  orders of magnitude.
  ───────────────────────────────────────────────────────────────────────────
```

The second thing people get wrong in the same line: **estimated `rows` is also per-loop.**
The plan line carries both, and they are both averages:

```text
  ->  Index Scan using t_pkey on t
        (cost=0.43..8.31 rows=1 width=8)  (actual rows=1 loops=100000)
        Index Cond: (t.fk = outer.id)
  ────────────────────────────────────────────────────────────────────
  ESTIMATED:  cost 8.31, rows 1        ← 1 row per iteration,
                                           8.31 × 100,000 = 831,000 total
  ACTUAL:     cost —,     rows 1        ← 1 row per iteration,
                                           actual total 100,000
  RATIO: 0.12 — the estimate was 8.3x HIGH for this node.
  ────────────────────────────────────────────────────────────────────
  The comparison you must make to find a bad plan is:

      (estimated rows) × (estimated loops)   vs   (actual rows) × loops

  and the loop count itself is often where the real error is.  The
  planner estimated the outer at 1,000 rows; the outer actually produced
  100,000.  That is a 100x error in the OUTER, which propagated to 100x
  more inner iterations than anyone costed.
```

### 7.4 Estimated vs Actual: Finding the Node That Broke the Plan

The method, and it is mechanical:

```text
  1. Run EXPLAIN (ANALYZE, BUFFERS).
  2. Walk the tree from the top.  At the topmost node, compute
         error = (actual rows) / (estimated rows)
  3. If |error| > 10, that node is where the plan went wrong.  Everything
     above it inherited the error.  STOP here — do not look further up.
  4. If |error| <= 10 at this node, move to its children and repeat.
  5. The DEEPEST node with a large error is the root cause.  Everything
     above it is a consequence.

  Why deepest: the optimiser's cost for a parent is derived from its
  children's estimates.  A child that estimated 10,000 and produced
  1,000,000 makes the parent's estimate wrong, which makes the grandparent's
  wrong, and so on to the root.  The top node's 100x error is a symptom.
  The leaf's 100x error is the disease.
  ────────────────────────────────────────────────────────────────────
```

Worked:

```text
  Aggregate    (rows=2000)   (actual rows=1180000)    ratio 590x   ← consequence
    ->  Hash Join (rows=2000) (actual rows=1180000)   ratio 590x   ← consequence
          ->  Seq Scan orders (rows=400000) (actual rows=400000)  ratio 1.0  ✓
          ->  Hash (rows=2000) (actual rows=1180000)  ratio 590x   ← consequence
                ->  Index Scan customers (rows=1200000) (actual 1200000) ratio 1.0 ✓
                ->  Index Scan countries (rows=2000) (actual rows=2000) ratio 1.0 ✓
  ────────────────────────────────────────────────────────────────────
  BOTH base relations and BOTH leaf access paths were estimated correctly.
  The error is in the HASH node: it says 2,000 output rows and produces
  1,180,000.

  What that means:  the planner believed the join would be highly
  selective — 2,000 rows out of 1,200,000 — and therefore picked a plan
  whose cost is proportional to the small side.  It actually produced
  1,180,000.  The plan is not "wrong" in shape; it is wrong because it
  costed a 2,000-row join as cheap and got a 1,180,000-row join.
  ────────────────────────────────────────────────────────────────────
  WHY the hash node mis-estimated, and the answer is not "the planner is
  dumb":  the estimate of a join's output cardinality assumes INDEPENDENCE
  between the join predicates unless extended statistics declare otherwise.
  If `customers.country_id` and `customers.active` are correlated —
  99% of active customers are in 3 countries — the true join result is
  ~590x larger than the product of the two selectivities.
  Fix: CREATE STATISTICS ON country_id, active FROM customers;  §8.4.
```

The other direction — actual *lower* than estimated — matters too and is less discussed. A
node estimated at 1,000,000 and producing 40 means the planner over-priced it, usually
picked a sequential scan over an index scan, and the query is doing far more work than it
needed. The same diagnostic finds it: the deepest node with a large error ratio, in the
other direction.

### 7.5 Buffers: Hit vs Read, and Where the Time Really Goes

```sql
EXPLAIN (ANALYZE, BUFFERS, WAL) <query>;
```

```text
  Buffers: shared hit=20418 read=918 dirty=0
            temp read=18422 written=18422
  ───────────────────────────────────────────────────────────────────────────
  shared hit=20,418    20,418 pages served from the database's own buffer
                       pool.  ~100 ns each.  Total 2.0 ms.
  shared read=918       918 pages NOT in the buffer pool.  Each went to the
                       OS page cache or the device.  At 0.1-8 ms each:
                       92 ms to 7.3 ms... 0.09 ms to 7.3 ms.
  temp read/written    18,422 pages (144 MB) through a TEMP FILE.  This is
                       a sort or hash that exceeded work_mem.  This is
                       the single most actionable number in the block.

  HIT RATIO  = 20,418 / (20,418 + 918) = 95.7%
  ────────────────────────────────────────────────────────────────────
  Reading this correctly:
    • hit ratio above 99%  →  I/O is not your problem; look at CPU
    • hit ratio below 90%  →  I/O is your problem; the working set does
                             not fit.  Answer is bigger shared_buffers
                             or fewer/smaller indexes, not a query change.
    • temp written > 0     →  a sort or hash spilled.  Raise work_mem
                             for this operation, add an index that
                             removes the sort, or reduce the input.
    • dirty > 0            →  this was a writing query; combine with WAL.
  ────────────────────────────────────────────────────────────────────
```

The distinction that trips people: **`Execution Time` high with `read=0` is a CPU problem
and an `Execution Time` high with `read` in the thousands is an I/O problem**, and the
fixes are entirely disjoint. High CPU with no physical reads means: a sort that is
in-memory but large, a `Rows Removed by Filter` in the millions, a nested loop with a
huge loop count doing executor work, or a query that is simply returning a lot of rows to
the client — which is a *client* problem, and `EXPLAIN` will not show you the network time
at all.

For writes, `WAL` is the analogue:

```text
  WAL: records=184 (0.014 MB)
  ────────────────────────────────────────────────────────────────────
  184 WAL records for the statement.  Each is a sequentially appended
  8 kB-aligned record.  This is the write amplification of the statement
  measured directly — and note that 184 records for a single-row UPDATE
  on a table with 14 indexes is exactly the "1 heap + 14 index" cost
  from Chapter 3, made visible.
  ────────────────────────────────────────────────────────────────────
```

### 7.6 Plan Caching and Prepared Statements

A prepared statement is planned once and the plan is cached, and the caching policy is
where a whole category of production problems lives.

```text
  POSTGRESQL 12+ — FIVE PLAN CACHES FOR ONE STATEMENT
  ───────────────────────────────────────────────────────────────────────────
  1. the custom plan cache   — plans built with the ACTUAL parameter values
     (up to 5 kept), rebuilt for the first 5 executions
  2. the generic plan cache  — a plan built WITHOUT knowing the values
  3. a list of the generic plans, keyed by nothing (a statement has one)
  ───────────────────────────────────────────────────────────────────────────
  THE POLICY (plan_cache_mode = auto, the default):
     first 5 executions  →  build a CUSTOM plan with the real values
                             if the estimated cost of the custom plan is
                             not more than generic_plan_cost_ratio
                             (default 0.10, i.e. 10%) above the average
                             custom cost, switch to the GENERIC plan
     thereafter         →  reuse the generic plan
  ───────────────────────────────────────────────────────────────────────────
  WHY THIS IS A TRAP:
     query WHERE region = $1
       executions 1-5 all pass region = 'EU'   →  custom plan, correct
       cost of the generic plan (no value known) is 11% above the
       average custom cost →  SWITCH TO GENERIC
       execution 6 passes region = 'US'        →  0.9% of the table
       the generic plan assumed an unknown region and chose a SEQ SCAN
       →  29,184 ms for 90,000 rows
  ───────────────────────────────────────────────────────────────────────────
  The generic plan is chosen once, for the values seen in executions 1-5,
  and then reused for every value forever.  This is parameter sniffing,
  and it is the reason a query that is fine in staging is catastrophic in
  production: staging sends the same value 100% of the time, so the
  custom and generic plans agree.
  ───────────────────────────────────────────────────────────────────────────
```

The diagnostics and the fixes, in order:

```sql
-- 1. See the cached plans and the decision
SELECT query, generic_plans, custom_plans
  FROM pg_prepared_statements;

-- 2. Compare what the generic plan does against the specific values
PREPARE q AS SELECT * FROM orders WHERE region = $1;
EXPLAIN EXECUTE q('EU');        -- 0.41 ms  Index Scan
EXPLAIN EXECUTE q('APAC');      -- 29,184 ms  Seq Scan
                                     ^^^ the generic plan, same for both
-- 3. Force custom plans, always, and take the planning-time cost
SET plan_cache_mode = force_custom_plan;
-- 4. Or make the generic plan safe by telling the planner the
--    distribution of the parameter
CREATE STATISTICS (dependencies, ndistinct) ON region, status FROM orders;
-- 5. Or rewrite so the parameter cannot smuggle in a bad distribution
   --   (see §8.5 for the full treatment)
```

MySQL, Oracle and SQL Server have structurally the same problem with different names —
Oracle's *adaptive cursor sharing* and SQL Server's *parameter sniffing* with
`OPTION (RECOMPILE)` as the standard fix, which is the direct equivalent of
`force_custom_plan`. The transferable insight is that **a cached plan is a decision made
from the first few executions and applied to all the rest**, and any parameter whose
distribution is skewed relative to the first few calls is a live grenade.

#### Common Mistakes

- Treating `EXPLAIN` output as a measurement — without `ANALYZE` it is an estimate
  computed from statistics on a cost model calibrated for different hardware
- Running `EXPLAIN ANALYZE` on a long query in a production console, which is a
  self-inflicted incident
- Reading a node's `rows` value as the total when `loops` is greater than 1 — and
  particularly misreading sub-1 averages like `rows=0.5 loops=1000000`
- Comparing estimated `rows` to actual `rows` without checking whether the error is in
  `loops` rather than in the per-iteration average
- Looking for the bad estimate at the top of the tree rather than at the deepest node with a
  large error ratio
- Concluding "I/O is fine" from a high buffer hit ratio when `temp read`/`written` is large
  and a sort or hash is spilling
- Assuming a cached plan was chosen for the parameters you are currently passing
- Forgetting that `EXPLAIN ANALYZE` executes `INSERT`/`UPDATE`/`DELETE` and takes the locks

#### Interview Questions — Reading EXPLAIN

**Q1. What is the difference between `EXPLAIN` and `EXPLAIN ANALYZE`, and when would
using the wrong one mislead you?** `STAFF`

`EXPLAIN` plans without executing, so the cost and row numbers are the optimiser's
*estimates* derived from statistics using a cost model whose `random_page_cost = 4.0`
reflects spinning media. It is free, safe, and correct for one purpose: checking the plan's
shape. It will not tell you the query is slow, and a plan with a Seq Scan in it is not
evidence that the query is slow. `EXPLAIN ANALYZE` executes and measures, giving you real
elapsed time, real row counts, buffer hit and read counts, and — for writes — the WAL
volume. It costs the query's full runtime, it executes DML (rolled back, but the locks are
taken), and it plans with the literals you typed rather than the parameters your application
sends, which is a different plan from the one running in production. The practical sequence
is: `EXPLAIN` for shape, then `EXPLAIN` with production values hard-coded, then
`EXPLAIN (ANALYZE, BUFFERS)` on a replica. The specific way the wrong one misleads: a plan
that looks bad on shape may be fine if the actual row count is 200 rather than 40,000, and a
plan that looks fine may be a 30-second sequential scan that is genuinely the right answer
for a predicate matching 9% of a 40-million-row table.

**Q2. In this node, what is the total number of rows the index scan produced, and what
does the number in the plan text mean?** `TRICKY`

```text
->  Index Scan using orders_pkey on orders
      (cost=0.43..8.31 rows=1 width=64)  (actual rows=1 loops=1000000)
```
`rows=1` is the average number of rows emitted *per iteration of the parent*, not the
total, and `loops=1,000,000` is how many times the parent called it. The total is
`1 × 1,000,000 = 1,000,000 rows`. This is the most common misreading of `EXPLAIN` output
and it produces a diagnosis that is exactly backwards, because the plan *looks* like a
single-row lookup. The same rule applies to the estimated side: `cost=0.43..8.31` is the
per-iteration cost, so the estimated total cost of that node is `8.31 × 1,000,000 =
8,310,000`. And note that `rows` is a floating-point average rounded to one decimal place —
`actual rows=0.5 loops=1000000` means 500,000 rows, which is common in a nested loop where
some outer rows match and some do not. Top-level nodes have `loops=1`, which is exactly
why the error survives: nobody tests their understanding on the node where the two numbers
happen to coincide.

**Q3. How do you find the node that caused a bad plan?** `ADVANCED`

Mechanically: run `EXPLAIN (ANALYZE)`, walk the tree from the top, and compute
`actual rows / estimated rows` at each node — remembering that both numbers are per-loop
and the `loops` counts may differ between the two. If the ratio is more than about 10×,
that node is where the plan went wrong and everything above it inherited the error; if it
is within 10×, descend to the children. The answer is the *deepest* node with a large
error, because a parent's cost estimate is derived from its children's — a child that
underestimated by 100× makes the parent wrong, which makes the grandparent wrong, all the
way to a root that looks catastrophically wrong while the actual disease is one index
selectivity estimate several levels down. The classic instance is a hash node: both base
relations estimated correctly, both index access paths estimated correctly, and the join
itself estimated at 2,000 rows when it produced 1,180,000. That is not a bad plan shape —
it is a correct plan for a small join, costed wrong because the optimiser assumes the join
predicates are independent. The fix is extended statistics declaring the dependencies
between the columns, not a plan hint.

**Q4. A query takes 30 seconds with `hit=20,418 read=918`. Where is the time?** `STAFF`

Not on disk. The buffer hit ratio is 95.7%, so 20,418 of the 21,336 page accesses were
served from RAM at roughly 100 nanoseconds each — about 2 milliseconds total. The 918
reads, at 0.1 to 8 milliseconds, are between 0.09 and 7.3 seconds and are a real
contribution, but they cannot account for 30 seconds on their own. The time is CPU and
executor overhead: the plan shape tells you where. A `Sort` node with `Sort Method:
external merge Disk: 42120kB` is writing and reading 164 MB of temp file. A node with
`Rows Removed by Filter: 8,819,767` is evaluating nearly nine million predicates that
produced nothing. A nested loop with a `loops` count in the millions is doing per-iteration
bookkeeping that dominates once each iteration is cheap. And if none of those apply, the
time is in serialising rows to the client, which `EXPLAIN` does not measure at all — you
would see it as a high `Execution Time` with a small `actual rows` and no `temp` or
`Rows Removed by Filter` signature, and the fix is on the application side, in batching
or in not selecting forty columns. The `temp read=18422 written=18422` line, if present,
is the most actionable number in the block and points at a `work_mem` problem
specifically.

**Q5. What is parameter sniffing and how do you diagnose and fix it?** `ADVANCED`

Parameter sniffing is the cached-plan problem: PostgreSQL plans a prepared statement
without knowing the parameter values, so it uses the distribution of the first few
executions to cost a generic plan, and if the custom plans from the first five executions
happened to agree with it, the generic plan is adopted and used for every subsequent
execution. When the parameter is skewed — a large tenant, a common status, a small region —
the first five calls and the steady state disagree, and the cached plan is wrong for
everything after. The diagnosis is a three-line comparison: `EXPLAIN` with the literal
inlined, then `PREPARE` the statement and `EXPLAIN EXECUTE` it with the same value and
with a different one. If the literal version is fast and the prepared version is slow
regardless of the value, it is sniffing; `pg_prepared_statements` confirms it by showing
`custom_plans = 5, generic_plans = 1,184,223`. The fixes are, in order of effectiveness:
eliminate the reason the plans differ, usually a composite index that makes the good plan
the only plan; then `SET plan_cache_mode = force_custom_plan` scoped to the role that owns
the statement, accepting the planning cost; then extended statistics that let the generic
plan be costed against the true parameter distribution. `RECOMPILE` per execution is the
SQL Server equivalent and has the same cost profile.

#### Further Reading

- [PostgreSQL — Using EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) — every option, including `BUFFERS`, `WAL`, `SETTINGS` and `FORMAT JSON`, from the manual.
- [PostgreSQL — Query Planning Configuration](https://www.postgresql.org/docs/current/runtime-config-query.html) — `plan_cache_mode`, `plan_cache_size`, `random_page_cost` and the cache policy constants.
- [PostgreSQL — pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) — the per-statement counters that reveal a plan being reused far more than it is replanned.
- [CMU Database Systems — Query Planning & Optimisation II](https://www.cs.cmu.edu/~15451-f22/lectures/13-optimization.pdf) — cardinality estimation, the independence assumption, and why a 100x estimate error is normal.
- [Use The Index, Luke — Reading an execution plan](https://use-the-index-luke.com/sql-execution-plan) — the practical guide to what each line of the plan text actually means.

> **CHAPTER 7 SUMMARY**
>
> `EXPLAIN` is an opinion and `EXPLAIN ANALYZE` is a measurement, and the difference is
> not academic: the first is estimates computed from statistics by a cost model calibrated
> to spinning media, the second is the query actually running. The three-step practice —
> `EXPLAIN` for shape, then with production values inlined, then `ANALYZE` on a replica —
> avoids both the cost and the self-inflicted incident. The node whose numbers matter most
> is the one with the largest `actual rows / estimated rows` ratio, and it is the *deepest*
> such node, because a parent's cost is derived from its children's and the top node's
> 100× error is a symptom rather than the cause. Both `rows` and `cost` in a node are
> **per loop iteration**; the totals are `rows × loops` and `cost × loops`, and a node
> reading `actual rows=1 loops=1000000` produced a million rows while looking like a
> single-row lookup. Buffers separate the two latency worlds: a high hit ratio with high
> `Execution Time` is CPU and executor overhead, a low one is I/O, and a non-zero
> `temp written` is a `work_mem` problem regardless of anything else. And every cached plan
> is a decision made from the first five executions and applied to the rest forever, which
> is why a skewed parameter turns a working query into a 30-second sequential scan in
> production while staging — where every call passes the same value — never sees it.

## Chapter 8 — Statistics & the Optimiser

### 8.1 What the Optimiser Actually Knows

The optimiser does not know your data. It knows four things about each column, and every
decision it makes is arithmetic over those four numbers.

```text
  THE FOUR STATISTICS, AND HOW EACH IS COMPUTED
  ───────────────────────────────────────────────────────────────────────────

  1. ROW COUNT (relpages, reltuples)
     from the last ANALYZE or VACUUM.  Drives the base sequential scan cost.
     Accurate to a few percent after ANALYZE.  WRONG by 100x after a bulk
     load that did not ANALYZE.

  2. DISTINCT VALUE COUNT (ndistinct)
     estimated, or exact if the column is the table's primary key (then it
     equals reltuples exactly and the planner knows without ANALYZE).
     ! for an UNANALYZED table PostgreSQL assumes 200 distinct values for
       every column — a number that is wrong for essentially every real table
       and is the source of a remarkable number of catastrophic first-query
       plans on a freshly migrated database.

  3. THE HISTOGRAM  ◄── the important one
     PostgreSQL's MCV (most-common-values) list plus equi-depth buckets:

       most_common_vals   = {EU, US, APAC, pending, shipped, ...}   up to 100
       most_common_freqs  = {0.31, 0.28, 0.14, 0.11, 0.09, ...}
       histogram_bounds   = [2026-01-01, 2026-01-04, 2026-01-08, ...]
       correlation        = 0.998      ◄── see §8.3

     For a value IN the MCV list, the selectivity is looked up directly.
     For a value in a histogram bucket, the planner assumes UNIFORM
     distribution within the bucket and interpolates.
     ! THAT ASSUMPTION IS WHERE MOST BAD PLANS COME FROM.

  4. CORRELATION
     a value from -1 to +1 measuring how closely the physical order of the
     table matches the column's logical order.
       +1.0  the column is in perfect physical order  (append-only table,
             sequential primary key)   → a range predicate needs 1 page
       0.0   no relationship                          → a range predicate
             must estimate scattered tuples
      -1.0  reverse order
     THIS is the number that decides whether a range predicate on a
     non-indexed column reads 1 page or 500.  And it is the number nobody
     looks at.
```

The single most useful diagnostic query in PostgreSQL, and the one to reach for before
concluding anything about a bad plan:

```sql
SELECT attname, n_distinct, correlation, most_common_freqs
  FROM pg_stats
 WHERE tablename = 'orders'
   AND attname IN ('region','status','created_at');
```

```text
   attname     | n_distinct | correlation | most_common_freqs
  ─────────────┼────────────┼─────────────┼──────────────────────────────
   region      |        140 |      -0.42  │ {0.31,0.28,0.14,...}
   status      |          6 |       0.03  │ {0.62,0.11,0.09,...}
   created_at  |          0 |       0.998 | {}                 ◄── 0 = "unique"
  ────────────────────────────────────────────────────────────────────────
  READ THESE THREE ROWS:
  • region: 140 distinct values and correlation -0.42.  A range predicate
    on region will read hundreds of scattered pages.  There is no index,
    so this is a genuine problem.
  • status: 6 distinct values, 62% in the first bucket.  The planner
    knows exactly how unselective this column is, which is why no amount
    of indexing on status helps a 60%-matching query.
  • created_at: correlation 0.998 means physically ordered, so a
    "last 7 days" predicate without an index reads a CONTIGUOUS TAIL.
    The planner knows this.  Do not add an index.
  ────────────────────────────────────────────────────────────────────────
```

### 8.2 `ANALYZE` and the Sampling Behind It

`ANALYZE` does not read the table. It **samples** it, and the sample size is the number
that determines how accurate every estimate downstream is.

```text
  DEFAULT: maintenance_work_mem = 64 MB
           default_statistics_target = 100
           sample rows = 300 × 100 = 30,000
  ───────────────────────────────────────────────────────────────────────────
  a 30,000-row sample of a 40,000,000-row table is a 0.075% sample.
  If a value's true frequency is 0.03%, the expected number of
  occurrences in the sample is 9.  That is enough to put it in the MCV
  list.  If the true frequency is 0.003%, the expected count is 0.9 and
  the planner falls back to the uniform-within-bucket assumption.

  increasing statistics:
    SET default_statistics_target = 1000;   → 300,000-row sample, 10x the
                                             planning time for ANALYZE
                                             and a better MCV list

  a bucket with 1,600 rows in it (10M rows / 6,250 buckets for
  default_statistics_target=100) is where the uniform assumption hurts:
  the planner thinks the target value is uniformly spread across 1,600
  rows, when in fact all 1,600 are in one corner of the value range.
  ───────────────────────────────────────────────────────────────────────────
```

Two operational facts about `ANALYZE` that belong in a production answer:

- **`ANALYZE` takes `SHARE UPDATE EXCLUSIVE`**, which does not block reads or writes, so
  it is safe to run on a live table. It *does* block `VACUUM`, and two `ANALYZE`s on the
  same table serialise.
- **`ANALYZE` is not the same as `VACUUM` and does not reclaim anything.** It only updates
  statistics. People conflate them because both are "maintenance", and the consequence is a
  team that runs `VACUUM` believing it fixed a bad plan.

### 8.3 Correlation: The Number Nobody Checks

Correlation deserves its own treatment because it produces the class of bad plan that looks
most obviously wrong and is least often diagnosed.

```text
  A RANGE PREDICATE WITH NO INDEX — the same query, two physical layouts
  ───────────────────────────────────────────────────────────────────────────
  WHERE created_at >= now() - interval '7 days'   on a 40M-row table
  with NO index on created_at.  3,200,000 rows match.

  THE PLANNER'S ESTIMATE: look up the histogram bucket holding that value,
  assume the 7 days' worth of rows are UNIFORMLY DISTRIBUTED WITHIN IT,
  estimate 3,200,000.  The estimate is not the problem.

  THE PROBLEM is that the same 3,200,000 rows can cost 55,172 pages or
  3,200,000 pages depending on something the histogram cannot express:

  correlation ≈ 1.0 (append-only)
     the last 7 days are PHYSICALLY CONTIGUOUS at the end of the heap.
     3,200,000 / 58 rows per page = 55,172 pages, read SEQUENTIALLY,
     readahead-accelerated.  This is a GOOD plan.

  correlation ≈ 0.2 (rows have been updated and moved)
     the 3.2M rows are scattered.  3,200,000 RANDOM page reads.
     No scan shape escapes it.

  Correlation is the statistic that tells the estimator which of these it
  is looking at, and it is maintained automatically.

  ⇒  THE RIGHT "RECENTLY CREATED" INDEX IS A FUNCTION OF CORRELATION:
       • ≈ 1.0, few matching rows → NO INDEX.  The seq scan is correct and
         fast, and adding an index replaces a sequential tail with a
         3-page descent plus thousands of random heap fetches.  The
         planner is right to decline.
       • ≈ 0.3, many rows         → BRIN.  32 KB, exploits the same
         physical structure, costs 1/128 of a B+ tree to maintain.
       • ≈ 0.0                    → B+ tree, or fix the table.
```

Correlation is also destroyed in a way that is worth warning about: **it is a property of the
current physical layout, and any operation that rewrites a table changes it.** A
`VACUUM FULL`, a `CLUSTER` on a different index, a partition-wise rewrite, a large
`UPDATE` that pushes rows to new pages — all of them reset it, and all of them can turn a
good plan into a bad one without any code changing. Conversely, a table that once had
correlation 0.3 and then had a compaction pass can go from a bad plan to a good one for
reasons nobody can explain from the schema.

### 8.4 Extended Statistics — Declaring Correlation to the Optimiser

The estimator's default assumption is that predicates are **independent**. When they are
not, the estimate is wrong by a multiplicative factor, and no amount of `ANALYZE` fixes it
because the data is being measured accurately and interpreted incorrectly.

```sql
-- These two columns are strongly correlated: 99% of active customers
-- are in 3 countries. The planner multiplies the two selectivities and
-- gets an answer 590x too small.

CREATE STATISTICS stat_customer_country_active
    (dependencies, ndistinct, mcv)
    ON country_id, active
    FROM customers;

ANALYZE customers;
```

```text
  WHAT EACH KIND GIVES YOU
  ───────────────────────────────────────────────────────────────────────────
  ndistinct
    fixes SELECTIVITY for a multi-column GROUPING.
    Problem: SELECT count(DISTINCT a), count(DISTINCT b) FROM t
             the planner estimates sum(ndv(a)) + sum(ndv(b)), which
             OVER-counts when a and b are correlated.
    Fix: ndistinct estimate for (a,b) replaces the sum.

  dependencies (functional dependencies)
    fixes MULTI-COLUMN EQUALITY on the same side of a join or filter.
    Declares: a → b   (knowing a tells you b)
    Changes: the planner uses the MCV list of (a,b) pairs instead of
             multiplying two independent selectivities.
    This is the 590x fix from §7.4.

  mcv
    gives a REAL multi-column most-common-values list, which is what
    makes the above two accurate for skewed data.
    Without it, dependencies only help for pairs where one functionally
    determines the other.

  ───────────────────────────────────────────────────────────────────────────
  WHAT IT DOES NOT FIX
  ───────────────────────────────────────────────────────────────────────────
  • cross-table statistics.  CREATE STATISTICS is per-table; a join
    between orders.customer_id and customers.id has no cross-table
    statistics mechanism.  The estimator still assumes independence
    across the join, which is the most common source of a catastrophic
    join cardinality estimate.
  • the plan_cache_mode problem.  Extended statistics do not fix
    parameter sniffing; they help the generic plan be costed better,
    but the generic plan still has no value to reason with.
  ───────────────────────────────────────────────────────────────────────────
```

The one-line staff summary: **extended statistics convert a guess the optimiser is forced
to make into a measurement you took**, and the columns worth declaring are exactly the ones
where your application's invariant means one column determines another — tenant_id
determines region, country determines currency, order_status determines whether
`fulfilled_at` is non-null.

### 8.5 The Parameter Sniffing Trap in Full

This is the most valuable single topic in the chapter, because it is the one that most
often produces a production incident that nobody can reproduce in staging.

```text
  THE SCENARIO — orders, 40M rows, skew that makes the cache decision a coin flip
  ───────────────────────────────────────────────────────────────────────────
    region:  'EU' = 1.1%    'US' = 8.2%    'APAC' = 0.6%    'LATAM' = 0.05%
  Query:  SELECT ... FROM orders WHERE region = $1 AND created_at >= $2

  EXECUTION 1.  The internal ops dashboard opens the new feature first.
  $1 = 'US' (8.2%).

      executions 1-5:  custom plan with the value inlined
                       → index scan on (region, created_at), 2,941 rows
                       → cost 0.42 .. 1,918.44
                       → the generic plan (no value known) costs 2,091.03
                       → ratio 2,091.03/1,918.44 = 1.09
      1.09 < generic_plan_cost_ratio (1.10)  ⇒  ADOPT THE GENERIC PLAN

  EXECUTION 2.  LatAm's first request arrives.  $1 = 'LATAM' (0.05%).

      The generic plan was costed with NO value, so it assumed the common
      case — where the sequential scan is 9% cheaper than the index scan.
      It runs that plan.

      → 29,184 ms, 292 MB read, 20,000 rows returned.  For the 10th tenant.

  ───────────────────────────────────────────────────────────────────────────
  THE MARGIN THAT DECIDED IT: had the first five callers been the EU
  dashboard (1.1%), the ratio would have been 1,043.19/892.10 = 1.17, the
  generic plan would NOT have been adopted, and none of this would happen.
  The bug was a 0.01 difference in a cost ratio, decided by which user
  clicked first.

  WHY STAGING NEVER SEES IT:
    30,000 rows and one tenant, so every plan is trivially correct and the
    seq scan is genuinely right.  And the same value every time, so custom
    and generic agree and the switch is invisible.
```

```text
  THE FIXES, IN THE ORDER I WOULD APPLY THEM
  ───────────────────────────────────────────────────────────────────────────

  1. MAKE THE GOOD PLAN THE ONLY PLAN   ◄── the structural fix
     A composite index on (region, created_at) means both the 0.05% case
     and the 8.2% case use an index scan.  The two plans converge, so
     the choice stops mattering.  This is the fix to reach for first
     because it removes the problem class rather than the instance.

  2. FORCE CUSTOM PLANS FOR THE STATEMENT
     SET plan_cache_mode = force_custom_plan;   -- per role, or per session
     Costs the planning time (0.3 ms here) on every execution.
     Correct and blunt.  Appropriate when the statement is not ultra-
     high-QPS and the plan differences are large.

  3. PLAN_CACHE_MODE = AUTO_TAIL_FIRST  (PG 16+)
     biases toward custom plans for the first portion of the statement's
     life, so a new skew is discovered quickly.

  4. GIVE THE GENERIC PLAN SOMETHING TO REASON ABOUT
     CREATE STATISTICS (dependencies, mcv) ON region, created_at FROM orders;
     plus, if the region distribution is known, a query rewrite that
     makes the parameter's cardinality visible:
         WHERE region = $1 AND created_at >= $2
         -- becomes, if you control the call site:
         WHERE region = CASE WHEN $1 = 'US' THEN 'US' ELSE $1 END
     ... which is a hack, and the honest statement is that hack 1 is
     better.

  5. SQL Server: OPTION (RECOMPILE) on the statement.
     Same trade, different spelling: replan every execution, pay planning
     time every time.
  ───────────────────────────────────────────────────────────────────────────
```

The detection, and it is one query, is worth giving verbatim in an interview:

```sql
SELECT queryid,
       calls,
       shared_blks_read,
       mean_exec_time,
       query
  FROM pg_stat_statements
 ORDER BY shared_blks_read DESC
 LIMIT 20;
```

A statement with an enormous `calls` count, a small `mean_exec_time` for most of its
history, and a `shared_blks_read` that grew recently is a parameter-sniffing victim. The
corroborating query is `pg_prepared_statements`, where `custom_plans = 5` and a
`generic_plans` count in the millions is the signature.

> **SCALING REALITY CHECK**
>
> Statistics have a scale limit, and it is worth knowing where it is. At
> `default_statistics_target = 100`, PostgreSQL samples 30,000 rows and builds roughly
> 100 MCV entries and 6,250 histogram buckets. Two failure modes appear at scale. **Skew
> below the sample threshold**: a value at 0.003% frequency is expected to appear 0.9 times
> in a 30,000-row sample, so it misses the MCV list and the planner falls back to
> uniform-within-bucket — and if that value is the *only* one that matters to a critical
> query, the plan is wrong for it every time. The fix is a partial or functional index
> targeting that value, or a higher `default_statistics_target` for that column.
> **Correlations beyond three columns**: extended statistics declare dependencies between
> named columns, and there is no mechanism for declaring a dependency across *tables*, so a
> four-way join with correlated predicates on both sides has no accurate estimate available
> and the planner will get it wrong by whatever factor the correlation implies. At that
> point the honest engineering answer is a narrower query, a denormalised bridge table, or
> a materialised view — not another statistics object.

> **PRODUCTION SCENARIO**
>
> Problem: at 09:40 the p99 latency of the tenant dashboard goes from 40 ms to 31 s and
> stays there. No deploy, no config change, no traffic spike. CPU is normal. The database
> is not saturated. The dashboard works perfectly for two of eleven tenants and is broken
> for the other nine.
> Investigation: `pg_stat_statements` shows the dashboard query with 4.1M calls and a
> `shared_blks_read` of 1.9 billion — 15 TB of read traffic since midnight. `EXPLAIN` with
> the literal inlined is 0.4 ms on an index scan. `EXPLAIN EXECUTE` on the application's
> prepared statement is 31 s on a sequential scan, for *every* parameter value.
> `pg_prepared_statements` confirms `custom_plans = 5, generic_plans = 4,092,118`.
> Root cause: at 09:38 a new tenant was onboarded and started issuing dashboards; its
> region value is 0.05% of the table. The first five executions of the statement after that
> deploy — which is when the statement's cache entry was recreated, because the old cached
> plan had been invalidated by an unrelated `ANALYZE` — happened to be from the two large
> tenants whose custom plans agreed with the generic plan to within 9%, so the generic plan
> was adopted. Every subsequent execution, including the new tenant's, uses a sequential
> scan costed for an 8% match.
> Solution: a composite index on `(region, created_at)`, so both plans are index scans and
> the question stops mattering. Interim: `force_custom_plan` on the dashboard role.
> Prevention: monitor the `generic_plans / (generic_plans + custom_plans)` ratio per
> statement and alert above 0.9; and treat "an unrelated `ANALYZE` caused a latency
> incident" as a known behaviour, because a plan-cache invalidation re-opens the five-
> execution window and the next five callers decide the plan for everyone.

#### Common Mistakes

- Believing the optimiser "knows your data" — it knows four numbers per column and every
  decision is arithmetic over them
- Forgetting that `n_distinct = 0` in `pg_stats` means "this column is unique", not "no
  information"
- Assuming correlation is a constant property of a table, when any table rewrite resets it
- Adding an index to a table with correlation near 1.0 where a sequential scan was already
  reading a contiguous tail
- Expecting `ANALYZE` to fix a bad plan caused by correlated predicates, when the problem
  is the independence assumption and only `CREATE STATISTICS ... (dependencies)` addresses
  it
- Believing `VACUUM` and `ANALYZE` are interchangeable
- Confusing "the plan changed and got worse" with "the plan is wrong" — a plan that matches
  its estimates and is still slow is the correct answer to a bad question
- Diagnosing parameter sniffing in staging, where it cannot occur, and dismissing the
  production report

#### Interview Questions — Statistics & the Optimiser

**Q1. What statistics does the optimiser have, and what does it not have?** `STAFF`

Four per column: the row count, the number of distinct values, an MCV list plus
equi-depth histogram buckets, and a physical correlation coefficient. Everything the
planner decides is arithmetic over those four. What it does not have is anything
cross-table — the estimator assumes that predicates on different tables are independent
when costing a join, and there is no mechanism to declare otherwise, which is why a
correlated `WHERE a.x = b.y AND a.z = b.w` can be mis-costed by 100× and only
`CREATE STATISTICS` on the *single-table* case can be fixed. The specific artefacts to
name are the independence assumption behind multi-column selectivities, the
uniform-within-bucket assumption behind histogram interpolation, and the default of 200
distinct values for every column on a table that has never been `ANALYZE`d — which is
the source of the classic catastrophe where the first query against a freshly migrated
database picks a catastrophic plan and gets fixed by running `ANALYZE`.

**Q2. A "recent rows" query on a 40M-row table is slow. Correlation says what about
whether to add an index?** `ADVANCED`

Correlation is the deciding number, and the answer runs opposite to the intuition in both
directions. If correlation is near +1.0 — an append-only table, which is the common case for
"recently created" queries — the matching rows are physically contiguous at the end of the
heap, so a sequential scan reads them as a readahead-friendly tail. Adding a B+ tree index
there makes the query *slower*: you replace a 3,000-page sequential tail with a 3-page
index descent plus 3,000 random heap fetches, and the planner is right to decline. If
correlation is near 0 — the table has been updated enough that rows moved, which is what
`VACUUM` does not undo and a compaction pass does — then those 3,000,000 rows are scattered
and no scan can avoid 3,000,000 random page reads, and the answer is a B+ tree. And there
is a third option that is usually the right one: a **BRIN** index, which is 32 KB for the
whole table, costs 1/128 of a B+ tree to maintain, and exploits exactly the same physical
structure — it is a correlation-aware summary that helps when correlation is partial. The
staff-level caveat is that correlation is not a stable property of a table: a `VACUUM
FULL`, a `CLUSTER`, or a large `UPDATE` resets it, so a plan can change for reasons nothing
in the schema explains.

**Q3. What are extended statistics for, and what can they not fix?** `TRICKY`

The estimator multiplies selectivities, which is only correct when the predicates are
independent. Extended statistics let you declare that they are not, in three ways.
`dependencies` declares a functional relationship — country determines currency — and makes
the planner use a real multi-column MCV list instead of a product of two marginals; this is
the fix for the 590× join cardinality error. `ndistinct` fixes multi-column distinct
counting, where the default is to sum the per-column estimates and over-count correlated
groups. `mcv` supplies the multi-column frequency data the other two need to be accurate on
skewed data. What they cannot fix: anything cross-table, because `CREATE STATISTICS` is
per-table and the join estimator's independence assumption across relations has no
override; and they do not fix parameter sniffing, because they help cost a generic plan
better but a generic plan still has no parameter value to reason with. The practical
guidance is to declare statistics for exactly the columns where an application invariant
makes one determine another — tenant determines region, country determines currency — and
accept that a four-way correlated join is a query-shape problem.

**Q4. `ANALYZE` ran last night. The plan got *worse*. How is that possible?** `STAFF`

Three mechanisms, and all three are real. First, the *sample* changed. `ANALYZE` samples
30,000 rows by default, and a different sample produces a different MCV list; if a skewed
value was previously in the MCV list and the new sample missed it, the planner falls back
to the uniform-within-bucket assumption and the estimate for exactly that value degrades.
Second, the *row count* changed. If a bulk load happened and the table grew from 4M to 40M
rows, the estimates for the base relations change and a plan that was correct at 4M may
not be at 40M — the index might be less selective in relative terms, or the sort might have
crossed from in-memory to spilling. Third, and most often, a *plan cache entry was
invalidated* by the `ANALYZE` itself, reopening the five-execution custom-plan window in
the parameter-sniffing cycle described in §8.5. The next five callers of that statement
decide the plan for all subsequent callers, and if they happen to be skewed the wrong way
you get a 30-second sequential plan on a query that was 40 ms. This is genuinely
counter-intuitive — maintenance made it worse — and the way to know which mechanism it was
is `pg_prepared_statements`: if `custom_plans` reset to 5 and `generic_plans` is now
large, it is the third.

#### Further Reading

- [PostgreSQL — Planner Statistics](https://www.postgresql.org/docs/current/planner-stats.html) — the four statistics, the sample size, and the independence assumption, from the manual.
- [PostgreSQL — CREATE STATISTICS](https://www.postgresql.org/docs/current/sql-createstatistics.html) — `dependencies`, `ndistinct` and `mcv`, with the exact cases each is for.
- [PostgreSQL — Monitoring Autovacuum](https://www.postgresql.org/docs/current/monitoring-autovacuum.html) — why statistics and vacuum are different jobs, and the thresholds that make autovacuum keep up.
- [CMU Database Systems — Query Optimisation I](https://www.cs.cmu.edu/~15451-f22/lectures/12-optimization.pdf) — histograms, MCV lists, and cardinality estimation as the mathematical object the whole chapter is about.
- [Use The Index, Luke — Statistics and data distribution](https://use-the-index-luke.com/sql-explain) — the practical side of skew, histograms and why a "random" parameter breaks plans.

> **CHAPTER 8 SUMMARY**
>
> The optimiser knows four numbers per column — row count, distinct count, an MCV list with
> equi-depth buckets, and a correlation coefficient — and every decision it makes is
> arithmetic over them, using two assumptions that are frequently false: that predicates are
> independent, and that values are uniformly distributed within a histogram bucket.
> Correlation is the most under-examined of the four, and it inverts the intuition in both
> directions: an append-only table with correlation near 1.0 serves a "recent rows" query
> correctly and *faster* with a sequential scan than with an index, while a table whose
> correlation has been destroyed by updates needs a B+ tree or, better, a 32 KB BRIN.
> Extended statistics declare correlation you know and the estimator cannot see, and they
> are the only fix for the 590× join-cardinality error — but they are per-table, so a
> four-way correlated join remains a query-shape problem. And the highest-value operational
> fact in the volume is that an `ANALYZE` can make things *worse*, because it invalidates a
> cached plan and reopens the five-execution window in which the next five callers choose
> the plan for everyone. Every bad plan is a bad number, and this chapter is where you go to
> find it.

---

### End of Volume 4

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Distinguish a B-tree from a B+ tree in terms of where the payload lives and what the
  linked leaf list buys, and derive the fan-out arithmetic for a specific page size and key
  width rather than quoting a rule of thumb
- Compute the crossover point at which an index stops paying for a given table, match rate
  and device — the 0.64% break-even on spinning media, 2.6% on an NVMe with
- Compute the crossover between nested loop and hash join for a given outer and inner
  size, and explain what a hash join does when the build side exceeds `work_mem`
- Explain parameter sniffing end to end — the five-execution custom-plan window, why
  staging cannot reproduce it, and why an `ANALYZE` can make a plan worse — and name the
  fixes in order of preference
- State the write cost of an index in units of page writes, and argue for a per-table index
  budget rather than per-PR index decisions

### Coming in Volume 5 — Transactions, Isolation Levels & Concurrency

Volume 4 was about how a query gets its answer when nothing else is happening. Volume 5 is
about what changes when something else is — many readers, many writers, and a durability
promise, which is where the single-snapshot model stops being sufficient. It states ACID
precisely rather than approximately, names and reproduces the five anomalies rather than
listing them, compares the four isolation levels on the anomalies they actually prevent,
and then derives MVCC, the lock manager, deadlock detection, and two-phase commit as the
mechanisms behind those guarantees. Every plan you read in Volume 4 is read through a
snapshot, so the order matters: the isolation level determines whether that plan is seeing a
consistent world at all.

## Chapter 9 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). The **D** questions are the ones that separate a
senior answer from a staff one: they push on scale, cost, reversibility, and
organisational fit rather than syntax recall. The weighting in this bank is deliberately
tilted toward **D** — about 40% of the questions — because index and planner work is where
the answers are trade-offs rather than facts. A candidate who can recite what a B+ tree is
has learned something any textbook states; a candidate who can compute a break-even, name
the number at which their advice inverts, and say who should own the decision is someone
you would let design a data layer.

### B+ Tree Mechanics

**P1. Your `sessions` table is 3 GB with a 6.1 GB index on `user_id`. The table was
22M rows eighteen months ago and is 400,000 rows now. Queries that were 8 ms are 600 ms.
The team archived the rows and nothing changed. What is actually going on, and what do you
tell them?** `SCENARIO`

The archive reduced the number of live entries but not the size of the structure, because a
B+ tree page that has had entries deleted still occupies the same bytes — the entries are
marked dead in the page's item array and nothing compacts, unlike a heap where a deleted
tuple's slot pointer is cleared and the bytes become reusable free space. The index was
built when the table held 22M rows, so it is still sized for 22M rows: 6.1 GB, of which
roughly 61% is dead entries. Fewer live entries per page should make lookups *better*, and
it does not, because the failure is buffer-pool residency. The whole point of a three-page
descent is that the root and the second level are 320 kB of always-hot pages; that still
holds. What changed is that the leaf pages were never the problem — the problem is that
this index is competing for a 2 GB pool with a 3 GB table, and 6.1 GB of index means
eviction pressure across both. `EXPLAIN (ANALYZE, BUFFERS)` on the slow query shows 2,100
`shared read` where it once showed 4 `shared hit`. So the answer to the team is: archiving
does not shrink an index, the fix is `REINDEX INDEX CONCURRENTLY` (concurrent because a
plain `REINDEX` holds an exclusive lock on the index for the duration of a 6.1 GB rewrite
and this table takes writes), and the durable fix is a **partial index** —
`ON sessions (user_id) WHERE deleted_at IS NULL` — so the index size tracks the live set
rather than the historical set. The one to raise unprompted: this will happen again on
every archive, so the archive job should be paired with a reindex or the schema should have
been partial from the start.

**T1. You insert into a B+ tree with a `bigint` key at the rate of 5,000 rows per second
into a table whose index is currently at 90% fill factor. Predict: the height over the
next hour, the number of page splits, and whether the height changes at all.** `ADVANCED`

The height does not change over an hour. 5,000 rows per second is 18 million rows an hour,
and a `bigint` index on a 4 GB key range has 509 fan-out, so the tree goes from height 3 to
height 4 only when it passes 509³ = 131,950,029 rows — a 6× growth, not a 1-hour one. The
split count is the interesting number. With `fillfactor = 90`, each page holds about 458
live entries and 51 free slots, so a page splits roughly every 51 inserts rather than
every 250 as it would at 50% fill. At 5,000 inserts per second, that is 98 page splits per
second, each writing two leaf pages plus a parent update — 294 page writes per second of
pure split overhead, against 5,000 of insert overhead, so roughly 6% amplification rather
than the 20-30% you would get at default fillfactor. And this assumes the key is
*monotonic*, which for an `AUTO_INCREMENT` or a sequence-backed id it is: every insert
lands at the right-hand edge, so a page that splits is immediately followed by a new page
that does not split again for 51 inserts. If the key were a random UUID, inserts would land
anywhere in the key space and the split count would be driven by the fill factor alone
rather than by the right-edge clustering — roughly the same rate here, but the resulting
page occupancy distribution would be much worse, because split pages get partially refilled
by later random inserts and partially abandoned.

**S1. A PR adds `INCLUDE (status, total_cents, shipping_address, notes)` to the
`orders(customer_id)` index, with a comment saying "so we don't have to hit the table".
Reviewer notes: what is wrong, and what would you need to know to write the blocking
comment?** `STAFF`

The blocker is not that covering is wrong, it is that nobody computed the fan-out
consequence. `INCLUDE` columns land in the leaf, and every one of them is on the per-entry
write path and in the per-page read path. Four columns — a 12-byte status, an 8-byte
amount, a 120-byte address and a 200-byte `notes` — take the entry from 16 bytes to 364,
which drops entries per leaf page from 509 to 22. That is a 23× larger index, a fan-out
drop from 509 to 22, and on a 10M-row table a height change from 3 to 5: **two extra page
reads on every single point lookup**, permanently, to serve a projection that only some
queries need. The other two things to check before writing the comment: whether the table's
visibility map actually covers the heap pages, because `notes` is almost certainly a
frequently-updated column and a page with a recent tuple version is not all-visible, in
which case the "index-only" scan fetches the heap once per row and pays the 23× index size
for nothing; and whether `notes` is a large object that should be TOASTed out of the row
entirely rather than carried in an index. The unblocking version of the change is an
`INCLUDE (status, total_cents)` only — 37 bytes, 220 entries per page, no height change —
and leaving the address and the notes in the heap, where a query that genuinely needs them
should pay one heap read.

**D1. You must choose between a 6 GB table and a 4 GB index on it, on a 16 GB instance with
8 GB of buffer pool. Walk me through the decision, including who should be in the room.**
`STAFF`

The framing that gets a staff answer is that this is a memory-budget decision, not a
storage decision, and 8 GB of buffer pool means the index and the table cannot both be
resident. The analysis: the index is 4 GB against a 6 GB table, so the two together are 10
GB against 8 GB of pool. Whichever is chosen, something is displaced. If you keep the
table, the index's 4 GB is paged in on demand — and index pages are the *hot* ones, because
the upper levels are touched by every lookup, so evicting the index means the top 320 kB
of the tree starts hitting disk on every query. If you shrink the index instead — partial
indexes, dropping the redundant single-column prefixes, a BRIN on the append-only timestamp
instead of a B+ tree — you can plausibly get it under 800 MB, which makes the whole
question disappear. **So the first move is not a choice, it is a reduction**, and that is
the answer to lead with: a 4 GB index on a 6 GB table is a symptom, and the number of
indexes, their widths and their overlap are the actual problem. Only after that reduction
does the budget conversation happen, and it should be measured — `pg_statio_user_tables`
ordered by `read` for the last 24 hours against `shared_buffers`, which tells you the hit
ratio you are actually achieving and therefore how much of the 4 GB is earning its place.
Who is in the room: whoever owns the write-heavy service using that table, because every
index is a per-insert tax and the reduction is not free on the write path; and whoever owns
instance sizing, because "8 GB of pool" is a decision someone made and this is the evidence
that it was made without the index count in it. The durable answer is governance — a
per-table index budget, a monthly unused-index report with a clock on it, and a review gate
— because a one-time reduction does not survive the next year of feature work.

**D2. You have a B+ tree with fan-out 509 and a root that currently points to 509 children.
A bulk load of 40M rows arrives with `COPY`, then a second load of 40M arrives with random
`bigint` keys drawn from the full 64-bit range. Predict the height after each load, the
number of leaf pages after each load, and which of the two loads the tree handles better.**
`ADVANCED`

After the first load the tree is three levels, because 40M is well under 509² = 259,081
children at level two — 40M sorted rows pack into roughly 78,586 leaf pages of 509 entries,
which is 155 levels-two pages, so the height is three and the point-lookup cost is three
page reads. The second load does not change the height either: 80M rows is still under
509³ = 131,950,029, so the tree is still three levels deep and still three page reads per
lookup. **The height is completely insensitive to the load, which is the whole reason the
fan-out matters more than the logarithm.** The leaf-page count is where the two loads
diverge. The sorted load appended at the right edge of every leaf, so the pages are near
100% full: 78,586 pages for the first 40M. The random load is a different story — a
random insert has a 50% chance of landing on the right-hand edge of a page and a 50% chance
of landing somewhere in the middle where there is no room, forcing a split that leaves both
halves about half full. Effective occupancy drops from roughly 90% to roughly 55%, so the
same 40M rows take about 130,000 pages instead of 78,586. That is a 1.65× page and cache
cost for the same logical row count, and it is invisible in `reltuples` — the table says
40 million rows either way. The prediction to state out loud is that the *second* load is
the one that hurts, and the mitigation is not a lower fillfactor but random_page_cost
tuning or, better, the observation that if you are going to generate random keys anyway,
a hash index or a UUIDv7-style time-ordered key avoids the problem at the source.

**D3. A PR adds a second index on `sessions(user_id)` where the existing index is
`sessions(user_id) WHERE deleted_at IS NULL`. The author says "the partial one misses
archived rows, so we need both". What is the actual purpose, and what would you ask before
approving?** `TRICKY`

The premise is half right and the conclusion is wrong, which is exactly the shape of a
comment worth writing. The partial index is not "missing" archived rows by accident — it is
defined to contain only live ones, and every query that must see archived rows is *already*
excluded from using it, correctly. So the second index does serve a real purpose, but not
the one stated: it serves the small minority of queries that filter on `deleted_at IS NOT
NULL` or genuinely want history. The questions to ask before approving are, first, **how
many rows and what percentage of the table** — if archived sessions are 1% of a 22M-row
table that is 220,000 rows and a second index is about 6 MB and entirely reasonable; if
someone plans to archive by partition or by making retention a parameter, the second index
is the wrong shape. Second, **is `deleted_at` ever set back to `NULL`, or unset again**, and
is it a nullable column with no default — because a nullable predicate column invites
`deleted_at IS NULL` to be written inconsistently and any row that slips through as `NULL`
by accident is silently in the partial index. Third, **does the second index need the same
`INCLUDE` columns** to serve the reporting query, or will it be a strict scan into the heap
while the partial one does an index-only scan — which would make the reporting path
*slower* than today. The blocking observation for the comment: if the second index is meant
for retention reporting, the write amplification is the cost that matters, and a BRIN index
on `(deleted_at)` at 32 pages is a better fit than a 6 MB B+ tree for a column that is
written once and rarely read by equality.

**D4. Your `orders` table has 400M rows. A nightly job reindexes it in 40 minutes, during
which it holds a lock that blocks writes. Someone proposes moving the reindex to a
weekend. Give me the three things you would say, and the number that decides it.** `STAFF`

The three things: the duration is the wrong thing to optimise, the lock is the actual
problem, and a weekend still blocks writes because the table is not quiet on weekends in a
business with weekend traffic. The number that decides it is the *fraction of the index
that is dead*, not the index size. If a `REINDEX` takes 40 minutes on a 400M-row table
with a 30 GB index, that is roughly 30 GB of sequential rewrite at about 12.5 MB/s of
effective write throughput — and the reason it is slow is not the rewrite, it is that the
result is then almost identical to the original, meaning the bloat is not coming from
routine churn but from a bulk delete that left the index mostly hollow. **So the first
move is to find the bloat source, not to schedule around it.** The three queries: check
`pgstatindex` for `leaf_fragmentation` and the ratio of leaf tuples to live tuples, find
which `deleted_at`-style predicate or partition drop is removing the rows, and confirm
whether the index is even needed at that size — a 30 GB index on a table with a 2% live
set wants to be a partial index, which is both smaller and faster. On the locking itself,
the answer is `REINDEX CONCURRENTLY`, which rebuilds into a new file and swaps, taking only
a brief exclusive lock at the swap. It is roughly twice the CPU and IO of a plain reindex,
so a 40-minute job becomes 80 — which is the trade to state plainly: **you are buying
write availability with wall-clock and IO, and that trade is correct for a table taking
400M-row-adjacent production traffic.** The staff-level addition: none of this is a
scheduling decision, it is a missing-constraint decision, and the durable fix is a
retention policy that drops partitions rather than deleting rows, because a `DROP TABLE`
on a partition removes its indexes in one operation and creates no bloat at all.

### Index Types & Trade-offs

**P1. A time-series metrics table grows by 400,000 rows per second, is never updated, is
never deleted from, and is queried almost exclusively as "give me this metric for this
time range". Someone on the team has proposed four indexes. Respond to each.** `SCENARIO`

They are almost all wrong, and the interesting part is why. A B+ tree on `metric_id,
timestamp` is the conventional answer and it is the one to reject first: 400,000 inserts
per second through a B+ tree is 400,000 descents per second, and at 34 million rows per day
the index grows about 65 MB per hour, so the working set is unbounded and the tree depth
will keep climbing. A single B+ tree on `timestamp` alone is worse — it has no correlation
with metric identity, so every query for one metric is a scattered range. A separate B+
tree per metric does not scale because metrics are created dynamically. What actually fits
this workload is a **BRIN index on `timestamp`**: 16 bytes per 128 blocks, so a 1 TB heap
costs 80 KB of index, and the per-insert write cost is 1/128 of a B+ tree's because a
single min/max update covers every insert into the same 128-block range. It is *ideal* here
because the table is append-only, which is precisely the physical-correlation condition
BRIN requires, and range queries are what it prunes for. The second thing to say is the
one about scale: 400,000 rows per second is 34 billion rows per day, and at 8 kB pages
that is 587 million pages per day — 4.8 TB per day. **The honest staff answer is that
index choice is the second question.** The first is that a single-node relational heap is
not the right store for this ingest rate, and Volume 6 and Volume 10 own the partitioning
and time-series answers. The index recommendation is real; it is just not the thing that
makes this workload work.

**T1. `CREATE INDEX ON t USING gin (col);` on a table with 10M rows, each with an average
of 12 array elements. Compare the cost of (a) 10M individual single-row inserts, (b) a
single `COPY` of 10M rows, and (c) 10M inserts in transactions of 1,000 rows.** `ADVANCED`

They are genuinely different, and the difference is the pending list. (a) is the worst: each
insert is 1 heap write plus 12 posting-list insertions, and because the index cannot be
maintained in a single pass it accumulates a pending list that `gin_clean_pending_list()`
must flush — and with a single-row transaction the pending list is flushed on essentially
every statement, so you get 12 posting-list insertions *plus* a pending-list flush per row.
That is the unmitigated case and it is genuinely expensive. (b) is dramatically better: the
`COPY` bypasses per-row index maintenance and the entire index is built in one ordered pass
at the end, so the cost is 10M heap writes plus one index build, and the index build is
sequential. (c) is in between and much closer to (a) than to (b), which surprises people —
the pending list is per-transaction-flush, not per-statement-flush, so a 1,000-row
transaction amortises the flush over 12,000 posting-list insertions and is far better than
(a), but it is still doing 12 index insertions per row rather than a bulk build. The
operational consequence is worth stating: **GIN's write cost scales with elements per row,
not rows**, so a 12-element array costs 12 index writes where a B+ tree would cost 1, and
teams are routinely surprised by a "slow insert" that is entirely the GIN index. If the
write rate is high and the array is wide, the alternatives are a B+ tree on the extracted
scalar (a denormalisation) or a different engine.

**D1. You are migrating a 2 TB PostgreSQL database to a columnar warehouse. Three people
have proposed three index strategies: replicate the B+ tree indexes, rebuild as zone
maps on load, or use no secondary structures at all. Give me the answer and the number
that decides it.** `SCENARIO`

No secondary structures, and the deciding number is the compression ratio zone maps
achieve on the same data. A columnar store does not need a B+ tree because it does not
do random point lookups: it reads 8,192-row column chunks, decompresses them, and
evaluates predicates over whole vectors. A PostgreSQL B+ tree on `(created_at)` buys you
one thing — finding the 400 rows in a 2 TB table that match a timestamp range without
reading the table. The columnar store gets the same selectivity for free from min/max
statistics per chunk plus row-group pruning, and it gets it *without* paying the write
cost of maintaining 340 indexes during the load. The reason someone reaches for the B+ tree
anyway is habit: the source database has these indexes, and carrying them across feels
safe. It is not free — the second number that decides it is load throughput. Loading with
14 indexes on a 400M-row table is roughly 12× the write cost of loading the heap, and at
the 2 TB scale you are load-bound, not query-bound. The one legitimate case for carrying
an index across is if the source is doing key-based lookups *during* the load, for
referential-integrity checks or incremental sync, and that is solved by loading to a heap
and creating the indexes afterwards, not by carrying them. What to tell the team: **indexes
are a row-store optimisation, and a columnar store has already solved the problem they
solve differently** — the migration should map predicates, not objects.

**S1. A PR adds `CREATE INDEX ON documents USING gin (body gin_trgm_ops)` to a 3 TB table
with 80M rows, to make `WHERE body LIKE '%accommodation%'` fast. Walk through what this
costs, and the two questions you ask before approving.** `ADVANCED`

It works, and the two questions are the ones that decide whether it is affordable. First:
**what is the average document length in tokens**, because a GIN trigram index stores three
character trigrams per posting and the posting list for a common trigram is enormous —
`gin_trgm_ops` is specifically designed to keep posting lists short by not indexing
trigrams that occur in more than a threshold fraction of the table, and that is why the
index is buildable at all on 3 TB, but it also means the index is useless for the very
common trigram and only selective for rare ones. On a body column of 4,000 words, a
trigram index is typically 20-30% of table size, so 600 MB-900 MB, and building it is a
multi-hour operation that takes a `SHARE` lock. Second: **is `LIKE '%...%'` the actual
access pattern or a symptom of a missing full-text index**, because the honest version of
this query is `to_tsquery('english', 'accommodation')` matched against a `tsvector` column,
which a GIN index serves far more efficiently and which also gets you ranking, stemming,
and phrase handling. The blocking comment: approve the trigram index only if the search is
genuinely substring — product codes, SKUs, names with typos, anything where stemming would
be wrong — and reject it if it is prose, because prose wants `tsvector`. The write-path
cost to state explicitly: every document update rewrites this index, and GIN's pending-list
mechanism means the cost is amortised but the space is not reclaimed until `gin_clean_pending_list`
runs, which is why a frequently-updated 3 TB table with a trigram GIN index will find its
disk growing faster than its data.

**T2. `CREATE INDEX ON t USING brin (created_at) WITH (pages_per_range = 64)` on a 400 GB
table, 8 billion rows, append-only, one row per 200 bytes. Give me the index size, the
number of page reads for a one-hour time range, and the two conditions under which this
index silently stops being chosen.** `ADVANCED`

Size first, because it is the number that makes BRIN worth considering at all. 400 GB at
8 kB pages is 51.2 million heap pages, and 64 pages per range gives 800,000 ranges, each
storing a 12-byte `tint` vector and 24 bytes of summary — call it 40 bytes of overhead per
range, so 32 MB total. That is 0.008% of the table, against a B+ tree on the same column
at roughly 16 bytes per entry times 8 billion entries = 128 GB, which is a third of the
table. The ratio — 0.008% versus 32% — is the entire argument for BRIN, and it is why
BRIN is the only index anyone should consider at this scale. Page reads for a one-hour
range: 8 billion rows over, say, three years is 2.3M rows per hour, and at 200 bytes per
row that is 460 MB, or 56,250 heap pages, which at 64 pages per range is 879 ranges to
recheck. A range is lossy, so the planner estimates a fraction of the 879 ranges survive
the min/max test — on truly monotonic data, 879 — and that is 879 index tuples plus 56,250
heap pages, sequentially. The two conditions that make it silently stop being chosen are
**physical correlation with the indexed column**, which is the one BRIN is built on and
which an `UPDATE` or a random-order `COPY` destroys in a single statement, and **a
`pages_per_range` that is too large**, which averages the min/max over more rows and
destroys selectivity without any error. The failure mode to name out loud is the second
one: it does not throw, it just stops pruning, and you find out from a sequential scan in a
`EXPLAIN` six weeks later.

**D5. Your workload is 95% read, 5% write, and the read pattern is "give me this
customer's last 50 orders". You have a choice: a wide covering index, a narrow index plus
heap fetches, or a cached denormalised read model. Make the call and defend it with
numbers.** `STAFF`

Narrow index plus heap fetches, and the reason is the row count in the match. "This
customer's last 50 orders" with an index on `(customer_id, created_at DESC)` is a three-page
descent plus one leaf page — 4 page reads — and the 50 heap fetches that follow are 50
random reads that hit the buffer pool, because those 50 rows were just written or just read
by the same query's neighbours. The covering alternative adds 37 bytes per entry, drops
fan-out from 509 to 220, and grows the index 2.3×, which on a 40M-row table is 157 MB
becoming 366 MB — and the extra 209 MB comes directly out of an 8 GB buffer pool that is
already holding the heap pages those 50 fetches are reading. So the covering index pays a
real, ongoing memory cost to save reads that were not happening anyway. The denormalised
read model is the one to reach for if the read rate is high enough that even 0.2 ms matters
— at 2,000 requests per second, 50 heap fetches at 0.1 ms is 10 seconds of buffer-pool
time per second, which is real, and a Redis or in-process cache in front of the index
covers the same ground with none of the write-path or memory-residency cost. The ordering
I would defend: index first, cache second, denormalise third. And the condition that flips
it is the *match rate* — if the query returned 5,000 rows instead of 50, the 5,000 heap
fetches would be 5,000 random page reads and the covering index wins decisively, so the
decision is a function of how many rows a query returns, not of how often it runs.

### Composite Index Design

**S1. Review this predicate against the existing index on `orders(region, created_at,
status)`: `WHERE created_at >= $1 AND region <> $2`. The developer says "it uses the
index". What do you check and what do you say?** `TRICKY`

You check the `Index Cond` line, not the developer's claim, and you are looking for the
difference between `Index Cond` and `Filter`. This predicate cannot seek. `created_at` is
the second column of the index and there is no equality bound on `region` to establish a
starting position, so the only legal plan is a full scan of the index with a filter — and
`region <> $2` is a *range* predicate on the leading column, which is worse than useless
here because it tells the optimiser nothing about where to start. If the plan says `Filter:
(created_at >= $1 AND region <> $2)` rather than `Index Cond:`, the developer's claim is
wrong. What you say is not "you cannot use the index" — you can, it just reads all 19,646
leaf pages and evaluates 40M predicates, which is a sequential scan of the index and is
almost certainly worse than a sequential scan of the heap. The rewrite is to give the
planner a position to start from: `WHERE region IN (...) AND created_at >= $1` with the
region list enumerated by the application, which turns each value into a seek. If the
region set is genuinely open-ended — "every region except EU" — then the right answer is
probably a different index, on `(created_at)` alone, so the range on the leading column can
be sought, and you should say that rather than pretending a rewrite will fix it.

**T1. Given an index on `(tenant_id, created_at)`, predict the plan and the page reads for
each of these five queries against a 40M-row table with 200 tenants. (a) `tenant_id = 7
AND created_at >= X`; (b) `tenant_id IN (7, 12, 44) AND created_at >= X`; (c) `tenant_id
= 7 AND created_at BETWEEN X AND Y`; (d) `tenant_id = 7`; (e) `created_at >= X AND
tenant_id <> 7`.** `TRICKY`

(a) is the ideal case: one seek into the tenant's contiguous run, then a forward walk of
the leaf list. The tenant holds 40M/200 = 200,000 rows, and if the range covers 1% of its
history that is 2,000 rows across `ceil(2000/509) = 4` leaves — 3 descent pages plus 4
leaves, 7 page reads. (b) is three of (a), run as three seeks — 21 page reads — and it is
worth noting that `IN` is frequently as good as `=` here precisely because the engine
performs one seek per value rather than a filter. (c) is identical to (a) with a stopping
point, so the same 7 reads. (d) seeks but has no upper bound, so it walks the tenant's
entire run: 200,000 rows over 393 leaves, 396 page reads — still vastly better than a scan
of 19,646, and the reason a multi-tenant index is worth having even for an unbounded
per-tenant scan. (e) is the failure case: no bound on the leading column, and `<>` is a
range on it, so there is no seek and the planner will choose a sequential scan of the heap.
It might still scan the *index* and filter, which reads 19,646 pages rather than 256,411
and returns 39.8M rows to the heap — which is a plan you will see and should distrust,
because it is only better than the heap scan if the planner is not also fetching rows. The
arithmetic worth stating: the index is only a win for (e) if the filter rejects most rows
*and* the engine is not fetching the rejected ones, and neither of those is guaranteed.

**D6. You are the tech lead for a schema with 14 tables, each with 2-6 indexes, and the
write-heavy services are starting to saturate their disk. Design the index review process,
not the index list.** `STAFF`

The process, because the index list is the easy half and will be out of date in six months.
First, get the current state and make it a report rather than an opinion: `pg_stat_user_indexes`
sorted by `idx_scan` ascending, joined against index size and against the table's write rate
from `pg_stat_user_tables`, so the output is a ranked list of "bytes maintained per day
against reads served". That single query finds most of the wins — unused indexes, and
redundant single-column prefixes of an existing composite, which are the most common pure
waste. Second, define the categories and give each a disposition: *live and covering*,
keep; *live and redundant* — a prefix of a wider index that does the same job — drop,
because it costs a full tree's maintenance for zero read benefit; *unused for 90 days*,
drop, with a 30-day clock and an owner notified; *foreign key with no index* — this is the
one that gets missed, because PostgreSQL does not index the referencing side of a foreign key
automatically and a missing one turns every parent delete or update into a sequential scan
of the child, holding a lock on it. Third, add a gate at the point of change: a new index
requires a query in the PR that uses it, an estimate of its size from the row count and key
width, and a statement of which existing index it overlaps. Fourth, and this is the part
that decides whether the process survives: a monthly report with a named owner and a
30-day clock on every unused index, and a per-table index budget agreed with whoever owns
the write-heavy service, so "add an index" is a trade against a number someone else is
measured on. The failure mode to name is a process that only runs when someone remembers,
which is why the report has to be scheduled and the gate has to be in the review template
rather than in a wiki.

**T2. You have `CREATE INDEX ON events (tenant_id, event_type, created_at)`. Predict the
plan and the page reads for four queries: (a) `tenant_id = 7 AND event_type = 'click'`,
(b) `tenant_id = 7 AND event_type = 'click' AND created_at >= '2026-01-01'`,
(c) `event_type = 'click' AND tenant_id = 7`, and (d) `created_at >= '2026-01-01'`.** `TRICKY`

(b) and (c) are the same query to a human and different queries to a planner, and the
planner's version is the one that matters. (a) is a two-column equality seek: descend
root, level two, leaf, so 3 page reads, and scan every entry in the leaf range matching
both — with `event_type` having 200 distinct values, roughly 0.5% of the tenant's rows, so
about 250 rows on a 50,000-row tenant. (b) adds a range on the third column and costs the
same 3 page reads to *start*, then continues rightward through the leaf chain as long as
the range holds — that is the linked-leaf-list paying for itself, and it is why (b) is
strictly better than (a) on I/O even though the descent is identical. (c) writes the same
predicate in a different order and **cannot use this index for a seek at all**: the leading
column `tenant_id` is not constrained, so there is no single leaf range to descend to, and
the planner's only options are a full index scan or a bitmap heap scan over the whole
index. That is the leftmost prefix rule biting, and the reason it bites is that the index
is *ordered* by `tenant_id` first — rows for `event_type = 'click'` are scattered across
all 50,000 tenants, and a B+ tree cannot seek to a scattered set. (d) has no equality at
all, so it is a full index scan of the whole index, which for a range that returns half the
table is worse than a sequential scan and the planner will correctly choose one. The
punchline to deliver: **column order in the index is a claim about which queries you have
optimised for, and (c) is the query that pays for the wrong claim.**

**S2. A PR adds `CREATE INDEX ON orders (status, created_at DESC, id)`. The author says
"status first because we always filter by status". Review.** `ADVANCED`

Filtering by status is necessary and not sufficient, and the word *always* is where the
review starts. If `status` has 12 values over 400M rows, the most selective single value is
still 8.3% of the table — 33 million rows — so a `status = 'pending'` predicate is not
selective at all and putting it first means every seek lands on a range of 33M index
entries, which the planner will read from a 30 GB index in preference to a 40 GB heap only
because the index is smaller and the fetch is sequential. The two things to interrogate:
**the cardinality of the leading column**, which is the whole ballgame, and **the fact that
the author has put `created_at DESC` before `id`**, which is a decision with a cost. Mixing
directions in a composite index is legal in PostgreSQL and generally a mistake, because it
means the index can serve `ORDER BY created_at DESC` for a fixed `status` but not
`ORDER BY created_at ASC`, so the next person to want ascending order adds a second index
rather than reusing this one. The blocking recommendation is to check the distribution
first — `SELECT status, count(*) FROM orders GROUP BY status` — and if the intent is
*"recent pending orders"*, the index that serves it is `(status, created_at DESC)`, which
happens to be what they wrote, so the review outcome is "approved with the `id` column
dropped, because `id` is in the heap and there is no uniqueness requirement here". If the
distribution is skewed — one status at 2% — the answer inverts and the author is right.

**D7. Your team has 40 microservices, each owning a schema, each with its own migration
tool, and the shared reporting database has 340 indexes across 60 tables. Design the
governance you would put in place, and tell me what you would not build.** `STAFF`

The first honest move is to establish that the number 340 is the problem and not the
distribution, so the governance starts with measurement rather than a rule: a weekly report
from `pg_stat_user_indexes` of indexes with `idx_scan = 0` since the last stats reset, and
a second of total index bytes per table. In a mature schema the first list is routinely
15-25% of all indexes — indexes added for a query that was then rewritten, or for a
migration that has long since been reversed. Those get dropped, and that single exercise
typically buys more than any design change. What I would **not** build: a central index
registry service, a schema-review bot, or a per-team index quota. A registry becomes a
write-heavy service whose data is wrong within a week, a bot gets bypassed the first time
it blocks a deadline, and a quota pushes teams toward dropping indexes other teams depend
on — the failure mode is invisible because nobody owns the cross-team query. What I would
build instead is three cheap enforcement points: `CREATE INDEX CONCURRENTLY` and a
`--statement-timeout` mandated in the migration tool's defaults so nobody builds a 30 GB
index inside a transaction window; a `pg_stat_statements`-backed slow-query report routed
to the owning team's channel so index decisions get made where the queries are; and a
quarterly review of the `idx_scan = 0` list with a clock on it, which is the only mechanism
that reliably removes indexes. The org point worth raising unprompted: **index governance
fails when it is a review gate and succeeds when it is a scheduled deletion with a
notification** — reviews produce judgement, deletions produce results.

### Access Paths

**T1. You have a 1M-row table, 128 MB, in a 4 GB buffer pool, fully cached, on NVMe.
The planner costs a sequential scan at 1,340 page reads and an index scan on a
low-selectivity `status` column at 2,900 page reads. Predict the chosen plan, the chosen
plan's actual runtime, and the condition under which that answer flips.** `STAFF`

Sequential scan, and it is the planner being right for a reason that is about *ordering*,
not about being lazy. 1,340 page reads from a cached buffer pool is roughly 1,340 × 0.2 µs
of CPU plus memcpy — about 0.4 ms of pure memory-bandwidth work with perfectly
prefetchable access. The index plan is 2,900 page reads of which the leaf portion is a
*random* walk through a 12 MB index, so 1,560 pages arrive in 156 leaf-page-sized runs
whose prefetcher cannot help because the order is by `status` value and then by row
locator, not by physical order. The runtime gap is not 2.9/1.3 = 2.2× but closer to 3-4×,
because random access has no prefetch and a sequential scan has 128 kB of it. The
condition that flips it is the table growing past the point where 1,340 pages stop being
cheap: at 100M rows the same scan is 134,000 pages, most of them `read` rather than `hit`,
and `seq_page_cost` starts telling the truth that it was calibrated to hide. Two more
numbers worth stating because interviewers push on them: the crossover is where the index
match rate falls below roughly 0.64% of the table on spinning disk and roughly 2.6% on
NVMe, which is the empirical break-even point where the random-read penalty is repaid;
and **the plan that is correct at 1M rows is not the plan that is correct at 100M**, which
is why "it worked last year" is never a defence of a sequential scan.

**S1. A PR adds a `WHERE status = 'x' AND created_at > $1` predicate to an endpoint. The
query goes from 2 ms to 900 ms. There is an index on `status` and an index on `created_at`
separately. What is the diagnosis, and what do you recommend?** `TRICKY`

The diagnosis is that a `BitmapAnd` of two independent indexes is a bad plan here, and
there are three ways to prove it. First, `EXPLAIN (ANALYZE, BUFFERS)` will show the
bitmap heap scan reading far more heap pages than the row count implies, because each
bitmap is built by a full index scan — the `status` bitmap alone is a scan of the entire
`status` index, and if `status = 'x'` matches 30% of 40M rows that is 12M index entries
examined to build a bitmap of 12M rows, which is not a selection at all. Second, the
`Heap Fetches` or the heap-blocks-read count will be far above the number of rows
returned, which is the signature of a bitmap that failed to select. Third, the `rows`
estimate on the BitmapAnd node will be orders of magnitude above the actual. What to
recommend, in order of preference: **a composite index on `(status, created_at)`**, which
turns two full index scans into one three-page descent plus a contiguous leaf scan — the
`status` equality establishes the seek boundary and `created_at > $1` becomes a range
within it, which is the equality-then-range rule from Chapter 4 doing the work. If the
composite is refused because the two predicates are independently optional, that is
exactly what two *partial* indexes or two separate composites are for, not two single-column
indexes. And if the query genuinely needs any combination, the correct structure is one
index per *query shape*, not one per column — the rule to state is that an index exists to
serve a predicate combination, and a single-column index serves a single-column predicate.

**P1. You turn on `log_planner_stats` and discover that your top query has a plan cache
hit rate of 99.4% and a `generic_plan_cost_ratio` of 0.35. Explain what is happening, and
tell me whether you should act on it.** `SCENARIO`

Nothing is happening, and the fact that you had to look is the interesting part. The hit
rate of 99.4% says the prepared statement is being reused, which is the goal. The
`generic_plan_cost_ratio` of 0.35 says: on the first five executions the planner built a
*custom* plan with the real parameter values, and the average cost of that custom plan was
0.35× the average cost the planner estimated for the *generic* plan — the one it builds
without knowing parameter values. The rule is that PostgreSQL sticks with the custom plan
while the ratio stays below 0.10, and switches to the generic plan above it, because a
generic plan is cheaper to reuse across a cache eviction. At 0.35 you are above the
threshold, so it has locked in a generic plan chosen for the *average* parameter value,
which is the correct trade only if your parameters really are average-distributed. On an
OLTP path with a tenant id that is 99% `tenant_id = 1` and 1% everything else, the average
is not a value anyone sends, and the generic plan is wrong for both populations. So: act
only if you can show the parameters are skewed, and the fix is not a `plan_cache_mode`
setting on the whole database — it is `SET LOCAL plan_cache_mode = force_custom_plan` on
the specific statement, or restructuring the query so the skew is explicit in the SQL
rather than implicit in a bind parameter. The number to quote in the write-up is the
`custom_plan_cost_ratio` itself, because it is the single measurement that distinguishes
"the generic plan is fine" from "the generic plan is a compromise that happens to be
losing", and almost nobody has it switched on.

**P2. A report query on a 200M-row table returns 40M rows. Someone asks you to add an
index to make it fast. Give me the answer, and the number that decides it.** `STAFF`

The answer is that no index makes it fast, because the query asks for 40 million rows and
that is a data-transfer problem, not an access-path problem. The arithmetic is the whole
answer: 40M rows at 180 bytes each is 7.2 GB of result, and at 100 MB/s of client-side
throughput that is 72 seconds no matter how the server finds them. The planner is right to
pick a sequential scan — at 20% selectivity the index scan is more expensive *and* returns
the same 40M rows, and the extra 40M random heap fetches make it strictly worse. The
number that decides it is the ratio of returned rows to scanned rows, and once that is
above roughly 2-3% the sequential scan wins on I/O alone. What you do instead is attack
the row count: pagination with a keyset predicate (`WHERE (created_at, id) < ($1, $2)
ORDER BY created_at DESC LIMIT 1000`) which is a covering-index seek on
`(created_at DESC, id)`; aggregation pushed into SQL so the server returns 200 rows
instead of 40 million; or a `GROUP BY` with `COUNT(*)` that the index can serve
index-only, turning 7.2 GB of transfer into 4 kB. The unprompted staff point: **someone
asking for an index on a query that returns 20% of the table is asking the wrong question,
and the tell is the row count in the response** — if the application is discarding 39.9

**S2. A PR adds this predicate and a matching index on `status` alone. The reviewer says
it should be a covering index. Review the pair.** `TRICKY`

Both halves are wrong, and the reason is one number neither of them computed. The query
selects `id, status, total_cents` and filters on `status = 'x' AND created_at > $1`. An
index on `status` alone gives an index scan with heap fetches; the reviewer's covering
index `(status, created_at) INCLUDE (total_cents)` would give an index-only scan — and
neither is right, because the predicate has two columns and one of them, `status`, is the
less selective of the pair. If `status` has 12 values over 200M rows, `status = 'x'` is
8.3% of the table and 16.6M rows pass it, so a seek on `status` narrows to 16.6M entries
and the `created_at` range trims those to whatever fraction of 16.6 million is recent —
and a sequential scan reading 200M rows to return 16.6M is 8% selectivity, which is
already past the break-even point where the planner prefers the scan. The blocking comment
should say three things: the composite `(status, created_at)` is the minimum that lets both
predicates participate, `INCLUDE (total_cents)` is worth it only if the visibility map is
actually clean, and **before either, someone should run `SELECT status, count(*) FROM
orders GROUP BY status`** — because if the distribution is skewed and `'x'` is 0.3%, an
index wins decisively and both reviewers were over-thinking it. The generalisable rule for
the review: an index recommendation without a cardinality check is a guess, and the check
is one query.

**D8. You have a 2 GB buffer pool, a 4 GB table, and 2.1 GB of indexes. A new query is
added that is 40M random point lookups per hour against a 200M-row table. Walk me through
the decision, including what you would tell the team about the index they will want next.**
`STAFF`

The decision is that this query cannot be served from memory and the index will make that
worse before it makes it better, so the first move is to change the access pattern rather
than the index. The arithmetic: 200M rows at 200 bytes is 40 GB, 40M lookups per hour is
11,111 per second, and at 11k random lookups per second against a 2 GB pool holding 2.1 GB
of index and 4 GB of table, the resident fraction of the *index* is about 95% but the
resident fraction of the *heap* is near zero — so every lookup is a guaranteed heap read.
That is 11,111 random reads per second, and on spinning storage that is a queue, not a
throughput figure. Three options in order. **Batch it into a range scan**: if those 40M
keys are 40M ids and the query wants all of them, a `WHERE id = ANY($1)` with a sorted
array is a bitmap heap scan or, better, a merge join against a sorted `VALUES` list that
turns 40M random reads into a sequential pass — the same data, one sequential read.
**Reconsider whether it is 40M point lookups at all**, because a query that touches every
row in a table is a scan wearing a disguise, and the honest version of that is a
sequential scan with a filter, which the planner would pick if you wrote it that way.
**Only then, index design**: a BRIN on an `id`-like column does not help, but a covering
index that eliminates the heap fetch does, if the columns needed are narrow — the test is
whether `Heap Fetches: 0` is achievable, which depends on the visibility map, which
depends on the update rate, and that dependency is the thing to tell the team. What they
will want next is an index on the predicate column, and the answer to give is: **the
planner is not choosing an access path because your indexes are bad, it is choosing one
because 11,111 random reads per second is not affordable at this buffer-pool-to-table
ratio, and the fix is the ratio.**

### Join Algorithms

**D9. A five-table join in your reporting service is a nested loop with 40,000 iterations
and takes 90 seconds. Walk me through the diagnosis and the fix, in order.** `SCENARIO`

The diagnosis starts with the plan and specifically the inner node, because a nested loop
with 40,000 iterations is only a problem if the inner access is expensive. I read
`EXPLAIN (ANALYZE, BUFFERS)` and multiply the inner node's `rows` by its `loops` — the
number people get wrong here is the total, and at 40,000 iterations even a 4-page inner
lookup is 160,000 page reads. If the inner access is a *sequential* scan, the cost is
`40,000 × |inner|/39`, which for a 1.2M-row inner is 1.2 × 10^9 page reads and the fix is
not memory: it is a predicate pushed below the join or a join-order change. If the inner
access is an *index* scan, the cost is 160,000 reads and the question becomes whether the
inner index covers the columns the join and the subsequent filters need — if it does not,
each of the 40,000 iterations also pays a random heap read, and covering the inner index
may be the entire fix. The second thing I check is whether the 40,000-row outer relation
is real or an artefact of a missing predicate; a report outer that should be 400 rows and
is 40,000 is a filter that was lost, and that is a query bug rather than a tuning problem.
The third is whether a hash join would be better, which for 40,000 outer rows against a
1.2M-row inner is genuinely close — that is a `work_mem` question, and the answer is to
test with a session-local `work_mem`, not to raise it globally. The fix I would actually
propose for a five-table report nobody can make fast enough is to stop optimising the join
and build a materialised view, refreshed on a schedule the report's freshness requirement
actually justifies. The staff framing is that a 90-second five-way report is usually a
*requirement* problem wearing a performance costume.

**T1. Predict the plan for `SELECT * FROM a JOIN b ON a.fk = b.id` where `a` has 30
rows, `b` has 8,000,000, `b` has a primary key index, and there is no index on `a.fk`.
Compare it to the same query with `a` at 300,000 rows. What changes, and what is the
crossover?** `ADVANCED`

At 30 outer rows with a usable index on `b.id`, the nested loop costs
`30 × (3 + 1) = 120` page reads against a hash join's `8,000,000/39 = 205,128` for the
build phase plus 30 probes, so the planner picks the nested loop — correctly, and by a
factor of about 1,700. At 300,000 outer rows, the nested loop costs `300,000 × 4 =
1,200,000` reads and the hash join costs `205,128 + 300,000 = 505,128` build-and-scan
units, so the crossover is somewhere between and the hash join wins. Solving it: nested
loop wins while `|outer| × 4 < 205,128 + |outer|`, i.e. `|outer| < 68,376`. The general
shape is that the crossover moves *linearly with the inner size* — an 80M-row inner pushes
it past a million outer rows — and it also moves with the device, because the 4 in the
formula is `random_page_cost`, and correcting that to 1.1 on an NVMe pushes the crossover
out to `205,128 / 3 = 68,376`… unchanged here, but on a fast device the hash build itself
is much cheaper, which moves it further. Two things to volunteer that make the answer
staff-level: the plan is only the nested loop *if* `b.id` is actually indexed, and the
`SELECT *` forces a heap fetch on every one of the 120 matches — a covering index on
`b(id, ...)` would make it a genuine index-only scan. And the reason staging never sees the
300,000-row case is that staging tables are small enough that the seq scan wins at every
size.

**D10. You have to join a 30M-row fact table to three 1,000-row dimension tables on
different keys. No index exists on any of the fact table's foreign keys. You may add three
indexes, add one, add none, or restructure. What is the right call and what does it cost
per day?** `STAFF`

Add all three, and the reason is that this is the case where an index is unambiguously
correct rather than a judgement call. The cost arithmetic makes it obvious: a nested loop
over 1,000 dimension rows with a *sequential* inner scan is `1,000 × 30,000,000/39 =
7.7 × 10^8` page reads, which is not a slow query, it is a query that does not terminate in
a working day. With an index on the fact table's foreign key, the same shape is
`1,000 × (3 + k)`, which for a fact table with 30,000 rows per dimension key is
`1,000 × 30,003 = 3 × 10^7` — still large, which is the point: a fact table at that grain
needs a different approach too, and I would raise that. But the three indexes are
prerequisites rather than the solution. The write cost is the number to state: three B+
trees on `bigint` foreign keys over a 30M-row fact table is 3 × `30,000,000/509 = 58,939`
leaf pages = 1.4 GB of index, maintained on every fact insert. If the fact table ingests
50,000 rows per second, that is 150,000 additional B+ tree insertions per second, 153,000
page writes per second, and a buffer pool that now has to hold 1.4 GB of index competing
with the fact table's own pages. The restructuring option — a narrow star schema where the
fact table carries the dimension keys as `smallint` rather than `bigint` surrogate ids, which
drops each index's entry from 16 bytes to 11 and the leaf pages by 30% — is the right
*second* move, and the right first move is asking whether the fact table should be 30M rows
at all, or whether the last 24 months of it can be partitioned or archived. The decision
rule I would give the team: for a fact table, index the foreign keys, keep them narrow, and
treat the fact table's growth as a partitioning conversation rather than an indexing one.

**S1. A PR adds `JOIN dim_country c ON c.code = f.country_code` where `f` is a 200M-row fact
table and `dim_country` has 250 rows, with an index on `dim_country(code)`. The query is a
nested loop with 200M iterations. Review it.** `STAFF`

The plan is wrong and the reviewer has to say so, because 200M iterations against a 250-row
dimension is the exact shape that should never be a nested loop from the fact side. The
correct plan is a **hash join with the 250-row dimension as the build side** — a 250-row
hash table is a single 8 kB page, every fact row probes it once, and the whole join is 200M
probes against a page-resident hash table, which is 200M × ~50 ns = 10 ms of CPU. The
nested loop is 200M × (one index descent of 3 pages) = 600M page lookups, which even at a
100% buffer hit rate is 600M × 0.2 µs = 120 seconds. The reason the planner chose the
nested loop, and the thing to write in the comment, is almost always **a stale or missing
`ANALYZE` on `dim_country`, or a `rows` estimate on the fact side that is far too low** —
the planner sees "250 rows on the right" and cannot distinguish a 250-row build from a
250-row-per-iteration probe without knowing how many fact rows will drive it. The fix is
threefold and all three are worth naming: run `ANALYZE dim_country` so the 250 rows are
real to the planner, verify the index on `dim_country(code)` actually exists — the join
looks indexed and the index is often on `id` instead, and the third is to check whether
`country_code` is a `text` column being compared to a `char(2)`, which is an implicit-cast
nested-loop killer of its own. The blocking comment is short: **a 250-row table joined to a
200M-row table is a 200M-probe hash join, not a 200M-iteration nested loop, and if the
planner cannot see that then our statistics are the bug, not the query.**

**T2. Predict the plan and the peak memory for: a 30M-row fact table hash-joined to a
1M-row dimension on a `bigint` key, with `work_mem = 64 MB`, followed by a second join to a
20M-row table. Which one spills, and what does the planner do about it?** `ADVANCED`

The first join's build side is chosen by the smaller input, so the 1M-row dimension is the
build side — and here the arithmetic decides the whole plan. A hash table entry is roughly
8 bytes of key plus an 8-byte `TupleHashEntry` header plus bucket overhead, call it 32
bytes, so 1M rows is 32 MB, which fits inside 64 MB `work_mem` with headroom. No spill, and
the join is 30M hash-table probes against a 32 MB structure — the 32 MB does not fit in L2
but fits comfortably in L3 on a modern server, so probes run at memory latency, roughly
100 ns each, giving 3 seconds. The second join is the interesting one: joining 30M rows to
20M rows means *both* inputs are too large to fit. A hash join can only build on one side,
so the planner is forced into a **partitioned hash join** if the engine supports one,
otherwise a nested loop or a merge join. The one to predict is the merge join if both
inputs already arrive sorted, and the honest statement is that for a 30M × 20M equijoin with
no useful index on the large side, the merge join with a sort is the right answer, at the
cost of sorting 30M and 20M rows — which at ~1.5M rows per second external-merge is 20 and
13 seconds respectively, and 480 MB and 320 MB of temp files. What the planner actually
does when it cannot make `work_mem` work is spill the hash table to a batch file and
process it in multiple passes, which converts one pass over the data into `n_batches` passes
over the *hash table* — and since the hash table is the smaller side, that is usually the
cheaper disaster. The number to quote: at 64 MB `work_mem` a build side above roughly 1.5M
rows spills, and the fix is per-statement `SET LOCAL work_mem` on the reporting path, not a
global bump that would let one query consume the machine.

**D1. Your nightly reconciliation job joins four tables in a different order every week
because the planner picks a different join order each night as statistics drift. Nobody can
tell me which order is "right". What do you build?** `SCENARIO`

Build a mechanism, not an order, because "the right order" is not a property of the query —
it is a property of the query against the current statistics, and it will change. The
mechanism has three parts. **First, make the alternatives testable**: set
`enable_nestloop`, `enable_hashjoin`, `enable_mergejoin` off one at a time in a session and
run the join with `EXPLAIN (ANALYZE, BUFFERS)` under each, which takes five minutes and
produces the actual best plan rather than the estimated one. If the planner's choice is
within 10% of the measured best, the drift is not worth engineering against and you should
say so. If it is 10× off, you have your answer. **Second, stabilise the inputs**: the reason
the order drifts is that the nightly load changes cardinalities, so `ANALYZE` right after
the load rather than on a schedule, and if the load is idempotent, capture the plan
immediately after `ANALYZE` and diff it weekly — a plan that changes without a data change
is a statistics problem, and a plan that changes *with* a data change is a volume problem,
and those are different tickets. **Third, make the plan reproducible where it must be**,
which for a reconciliation job is defensible: `SET LOCAL enable_hashjoin = off` at the top
of the job, with a comment recording which run of `EXPLAIN` produced that decision and
when, so the next person knows it is a pinned choice with an expiry date and not a
permanent truth. The staff-level point to make in the ticket: **a nightly job whose plan
changes is a monitoring gap, not a planner bug** — you would never accept the same for a
deploy, and the fix is the same, which is a plan-diff alert.

### Reading EXPLAIN

**P1. You open a ticket for a slow report and paste this into it. What is the single most
useful sentence you can add, and what fix does it point to?** `SCENARIO`

```text
->  Index Scan using orders_region_idx on orders o
      (cost=0.43..18422.10 rows=1000000 width=180)
      (actual time=0.052..8421.117 rows=1180233 loops=1)
    Index Cond: (region = 'EU'::text)
    Buffers: shared hit=1180233
```

The sentence is: *this is not a slow query, it is a query that asked for 11.8% of a
40-million-row table, and the plan is the right one.* The `shared hit=1,180,233` is the
tell — there is no `shared read` at all, so every one of those page accesses was served
from RAM at roughly 100 nanoseconds and the entire 8.4 seconds is buffer-pool lookup
overhead and executor work, not I/O. Adding an index does not help, because an index scan
on the same predicate costs the same 1.18M page accesses; the only index that would help is
a *covering* one, which would make it an index-only scan reading a few thousand leaf pages
instead of 1.18M heap pages, and that is a 100× win on exactly this query. So the fix the
sentence points at is `INCLUDE` the projected columns, sized against the fan-out arithmetic
— if the projection is three narrow columns, 37 bytes per entry, 220 per leaf, no height
change, and the index grows 2.3× while the query drops from 8.4 s to under 100 ms. The
higher-order point is the one to make in the ticket rather than the fix: the report is
asking a question the data model does not support cheaply, and a covering index is treating
the symptom. The question to take back to the team is why a report needs 11.8% of a table
in its result set, and whether the answer is a narrower filter, an aggregate computed
inside the database, or a summary table — because 400 requests per second of 8.4 seconds is
3,360 seconds of CPU per second, which is a capacity problem regardless of the plan.

**T1. Given this plan fragment, what is the total number of index page reads, and what
would the number be if the planner's estimate had been correct?** `TRICKY`

```text
->  Nested Loop  (cost=17.28..184523.40 rows=40000 width=64)
                  (actual time=8118.9..8110.4 rows=40000 loops=1)
     ->  Index Only Scan using orders_covering on orders o
           (cost=0.43..4.12 rows=42 width=28)
           (actual time=0.041..0.187 rows=40 loops=1000)
           Heap Fetches: 0
     ->  Index Only Scan using customers_pkey on customers c
           (cost=0.43..8.31 rows=1 width=180)
           (actual time=0.003..0.004 rows=1 loops=40000)
```

The outer index-only scan: `rows=40 × loops=1000 = 40,000` rows read, at an estimated cost
of `4.12 × 1000 = 4,120` cost units, and because `Heap Fetches: 0` the entire 4,120 is
index pages. The inner scan: `rows=1 × loops=40,000 = 40,000` rows, at an estimated cost of
`8.31 × 40,000 = 332,400` cost units. Total estimated cost 336,520; the plan's own root
estimate is 184,523, which is lower than the sum because the optimiser's cost for a nested
loop is not the naive sum of its children's top-line costs. If the planner's estimate had
been correct — 42 rows per outer iteration instead of 40 — the arithmetic barely moves,
which is the point: **the estimates here are good.** The outer was estimated at 42 and
produced 40, a 5% error; the inner was estimated at 1 and produced 1. The plan is not a
victim of a cardinality error. The 8.1 seconds is real work: 40,000 index-nested-loop
iterations, each doing a buffer lookup, a visibility check and a comparison, plus a
`GROUP BY` aggregate and an in-memory top-N sort. That is the profile of a query whose
*shape* is the problem, not its estimates — and the response is to make the outer relation
smaller, make the inner lookup cheaper, or both, rather than to reach for `ANALYZE` or a
plan hint.

**D11. Your team wants to make `EXPLAIN ANALYZE` a required step in the review template
for every query-touching PR. Argue for it, argue against it, and propose something
better.** `STAFF`

For it: it is the only artifact that separates "I think this query is fast" from "I
measured this query", it catches the estimate-versus-actual divergence before production
does, and `Heap Fetches: 0` versus `40` is a difference between a working covering index
and a 209 MB mistake that nothing else surfaces. Against it, and these are the reasons it
will not survive as a blanket rule: it *executes* the statement, so it takes the locks,
consumes the WAL, and costs the query's full runtime — a 40-second report in CI is a
40-second report, and a naive `EXPLAIN ANALYZE` in a staging console during a load test
is a self-inflicted incident. It also measures the *wrong query*, because the plan it
produces is for the literals you typed rather than the parameters your application
passes, which is precisely the plan that differs under parameter sniffing — so a review
template full of `EXPLAIN ANALYZE` output can be actively misleading, because it shows a
plan the production code will not use. And it is unreadable in a diff: the useful signal is
one ratio on one line, and the rest is noise nobody reads, which produces performative
compliance. What I would propose instead is three things, in this order: a **non-executing
`EXPLAIN`** in the template, checked in, so the plan *shape* is reviewable and a shape
change shows up in the diff — a new `Seq Scan` or a new `Sort` on a table that had neither
is a reviewable event. Second, a **`pg_stat_statements` regression check in CI** against a
baseline, asserting on `calls`, `mean_exec_time` and `shared_blks_read` for the statements
the PR touches, which catches regressions in the *actual* parameterised execution rather
than a literal-inlined one. Third, a **pre-merge integration test with production-shaped
data volume**, asserting on query count and on `shared_blks_read` per call — the same
technique the Spring set uses to catch N+1s, and it works here for the same reason, because
it is a *control* rather than a diagnostic. The `EXPLAIN ANALYZE` paste belongs in the
ticket when something is already wrong, not in the template when it is not.

**T2. You have this plan fragment and it takes 4 seconds. Work out the total work, and
identify which single number in the output is lying to you.** `ADVANCED`

```text
  Limit  (cost=0.43..8471.20 rows=50 width=180) (actual time=4102.183..4102.190 rows=50 loops=1)
    ->  Sort  (cost=0.43..8210.00 rows=150000 width=180)
              (actual time=4102.100..4102.140 rows=50 loops=1)
          Sort Key: o.created_at DESC
          Sort Method: top-N heapsort  Memory: 30kB
          ->  Index Scan using orders_customer_created_idx on orders o
                (cost=0.43..8100.00 rows=150000 width=180)
                (actual time=0.041..3890.220 rows=150000 loops=1)
                Index Cond: (customer_id = 42)
                Buffers: shared hit=118 hit=1 read=4093
```

The work is 150,000 index entries scanned and 150,000 rows fetched from the heap in one
loop, so `rows × loops` is 150,000 × 1 = 150,000. `loops=1` is the thing to check first and
it is `1` here, so no multiplication trap in this particular plan. The number that is lying
is `rows=150000` on the Index Scan. The query has no `LIMIT` in the index scan, so the
estimate is the planner's guess at how many of the customer's orders exist, and 150,000
actual confirms it was exactly right — which means the *plan* is not the problem and the
problem is that the query asks for all 150,000 orders to return 50. The fix is structural:
this is `ORDER BY created_at DESC LIMIT 50` implemented as a sort-then-truncate, and it
should be a top-N heapsort over an index that already provides the order, so the index
should be `(customer_id, created_at DESC)` and the sort should disappear entirely. `Buffers:
shared hit=118 read=4093` confirms the second thing: 97% of the pages were *read*, not
hit, so this is a cold-cache sequential-ish walk of the index plus 150,000 random heap
fetches. The answer to deliver: **the estimate is right, the plan is faithful, and the
query is wrong** — which is the case interviewers rarely include, because it is the one
where no amount of statistics work helps.

**S1. A PR pastes `EXPLAIN` output — no `ANALYZE`, no `BUFFERS` — into the review with the
note "plan looks fine, 4 rows estimated". What do you write back?** `TRICKY`

The note is self-refuting and the review comment should say so precisely rather than
politely. `EXPLAIN` without `ANALYZE` is a *cost-model output*, not a measurement: every
number in it is the planner's estimate, computed before a single row was touched, and the
estimates are derived from the very statistics that may be wrong. "4 rows estimated" is
therefore not evidence of anything except that the planner believes the table has a
matching distribution — and the most common cause of a bad plan is precisely that belief
being wrong. The two concrete asks in the review, in order: **`EXPLAIN (ANALYZE, BUFFERS,
VERBOSE)` on the same query against a realistic dataset**, because `loops` and the actual
rows are the only two columns that turn the output into evidence, and the
`rows × loops` product at the deepest node is the number that actually predicts runtime;
and **`SET LOCAL` the parameter values**, because an `EXPLAIN` of a prepared statement with
no values bound is planning a query nobody will run. The closing line worth putting in the
comment, because it generalises beyond this PR: **an `EXPLAIN` without `ANALYZE` can tell
you the shape the planner chose; it can never tell you whether that shape was right.**

**D1. Your slowest query is 4 seconds and you have never once run `EXPLAIN ANALYZE` on
it, because it is a production statement and the last time someone ran it against
production they took down the replica. How do you fix this?** `SCENARIO`

The fear is legitimate and the answer is that you never need to run the expensive thing
against production. There is a dedicated mechanism for exactly this, and the fact that
your team reached for "run it on prod" means the mechanism is not enabled — so the first
action is a configuration change, not a query. Three options, in order of preference.
**`auto_explain` with `auto_explain.log_analyze` and `auto_explain.log_min_duration`**: it
logs a full `EXPLAIN ANALYZE` for any statement exceeding a threshold, to a separate log,
with no client round trip and no risk of a plan-cache eviction cascade — the overhead is a
sampling-enabled instrumentation on qualifying statements only, and you set the threshold
at 1,000 ms so the 4-second query is captured and the 2 ms ones are not. **A statement
timeout on a read replica**, where you can afford 30 seconds of CPU to get real data,
because a replica is doing no writes and the only risk is replication lag. **A shadow
table**: replay last night's production data into a staging database and run
`EXPLAIN ANALYZE` there, which is the only option that gives you real plans without real
risk, at the cost that the statistics differ from production. The one to insist on is the
first, because it converts a recurring incident investigation into a log line you already
have, and the threshold is the design decision worth writing down: **set it above your p99
and you will collect the queries that are actually costing you money, and set it below and
you will drown.** The staff-level closing: this is a missing observability capability, and
the ask to your team is for a slow-query log, not for permission to run `EXPLAIN ANALYZE`
in a ticket.

### Statistics & The Optimiser

**P1. A 90M-row table is bulk-loaded every night by `COPY`, and every morning the first
few queries against it pick bad plans and time out. By 10am the plans are fine. Nobody can
reproduce it outside the nightly job. What is happening and what do you change?** `SCENARIO`

The statistics are describing yesterday's table. `COPY` bypasses the incremental statistics
maintenance that ordinary inserts feed, so when the load finishes the table's row count,
`n_distinct` and histogram are all still the pre-load values — and on a table that has never
been `ANALYZE`d at all, PostgreSQL assumes 200 distinct values for every column, which is
wrong for essentially every real table. The first queries run against a table whose
statistics say 4M rows when it holds 90M, and the planner's costing is wrong in a
direction-dependent way: sequential scans look cheap because the table is believed small,
and index scans look expensive because the match rates are computed from the wrong
distributions. By 10am, autovacuum has caught up and everything is correct — which is why
it reproduces only inside the nightly job. The fix is to `ANALYZE` the table as the last
step of the load, in the same job, before the table is handed to the application: an
`ANALYZE orders;` costs seconds on 90M rows and turns a class of morning timeouts into
nothing. If the load is into a staging table that is then swapped in, the `ANALYZE` belongs
on the staging table before the rename, so the application never sees a window where
statistics are wrong. The second change is to raise
`ALTER TABLE orders ALTER COLUMN status SET STATISTICS 1000;` for the columns where the
distribution is genuinely skewed, since the default 30,000-row sample on a 90M-row table is
a 0.03% sample and a 0.03%-frequency value is expected to appear 0.9 times in it. And the
one to raise unprompted: this is not only a `COPY` problem. Autovacuum's thresholds are
`autovacuum_vacuum_scale_factor = 0.02` plus `autovacuum_vacuum_threshold = 50`, so on a
90M-row table autovacuum waits for 1.8M row changes before it runs, and on a
high-churn-by-update table that is hours. Lowering the scale factor for the tables that
matter is the durable fix.

**S1. A PR adds `CREATE STATISTICS stat_x (dependencies) ON status, warehouse_id FROM
orders;` with the comment "the planner was underestimating the join". Reviewer: what three
questions determine whether this helps, and what is the failure mode if the first answer is
"no"?** `TRICKY`

Three questions. First, **is the dependency real?** `dependencies` declares that knowing
`status` tells you `warehouse_id`, or a specific mapping between them. If the relationship
is a soft correlation — 85% of shipped orders come from three warehouses, not a functional
determination — the declaration is a lie and the planner will cost joins using a
relationship that does not hold, which can make plans *worse* than the independence
assumption rather than better. `mcv` is the right kind here, not `dependencies`, because it
captures the actual pair frequencies without asserting a functional dependency. Second, **is
the two-column `mcv` included?** `dependencies` on its own uses the MCV list of the pair,
but a very high-cardinality pair produces a list too large to be useful, and adding `mcv`
explicitly alongside `ndistinct` is the standard combination. Third, **does `ANALYZE` run
afterwards?** Statistics objects are populated by `ANALYZE`, and creating one does nothing
until it does — so a `CREATE STATISTICS` in a migration that is not followed by an
`ANALYZE` in the same migration is a no-op that will be found by a future engineer assuming
it is broken. The failure mode if the dependency is not real: the planner gains a
*certainty* about a relationship that is only usually true, costs plans on that basis, and
produces a confidently wrong plan for exactly the 15% of rows where the relationship breaks
— which is worse than the independence assumption, because independence at least degrades
gracefully. The review comment should ask for the evidence that the dependency holds, which
in practice means a query against the pair frequencies, and should ask for `mcv` rather than
bare `dependencies` if the answer is "strongly but not perfectly correlated".

**D12. You are on call. A query that ran in 200 ms for six months is taking 30 seconds. No
deploy happened. The last database change was an `ANALYZE` that a maintenance job runs every
night at 02:00. Walk me through your first thirty minutes.** `STAFF`

The `ANALYZE` is the first thing to look at and it is the right instinct even though it
sounds absurd — maintenance made it worse. The mechanism is a plan-cache invalidation
reopening the custom-plan window: `ANALYZE` invalidates cached plans for the affected
relations, and on the next execution PostgreSQL replans with the actual parameter values for
the first five executions, then decides whether to adopt a generic plan. If the first five
callers after 02:00 happen to be skewed in one direction, they choose the plan for
everyone. So the first check is `pg_prepared_statements` — `custom_plans` at 5 with a large
`generic_plans` count is the signature — and the second is comparing `EXPLAIN` with the
literal inlined against `EXPLAIN EXECUTE` on the prepared statement with the same value. If
the literal version is fast and the prepared version is slow for every value, that is
parameter sniffing and the immediate mitigation is `SET plan_cache_mode = force_custom_plan`
on the role owning the statement, scoped as tightly as I can manage. In parallel I want
`pg_stat_statements` for that `queryid`: `calls`, `mean_exec_time`, and whether
`shared_blks_read` climbed around 02:00. And I want to know whether the *plan* changed or
the *data* changed — because the alternative explanation is that a bulk load overnight made
a previously-selective predicate match much more, and the plan that was correct at 4M rows
is wrong at 40M; `pg_stat_user_tables.last_analyze` and `n_mod_since_analyze` will say
immediately. The thirty-minute deliverable is: a mitigation, a cause, and a permanent fix
that does not depend on anyone running `ANALYZE` at the right time. The permanent fix is
usually structural — an index that makes the good plan the only plan — because
`force_custom_plan` treats the symptom and the next schema change reopens the same window.
And the process change I would propose is monitoring the
`generic_plans / (generic_plans + custom_plans)` ratio per statement, alerting above 0.9,
because a statement that has stopped getting custom plans is running on a decision made for
somebody else's data, and that is invisible from the application side.

**D13. You have a 500 GB PostgreSQL instance, 1,100 tables, and 2,400 indexes. Statistics
management is currently "whatever autovacuum does". Design the statistics programme.**
`STAFF`

The programme has three layers and the first is visibility, because nobody can manage what
they cannot see. Layer one is a daily report, not a dashboard nobody opens: a per-table roll
up of `last_analyze`, `n_mod_since_analyze` as a fraction of `reltuples`,
`last_autoanalyze`, and the ratio `n_mod_since_analyze / (autovacuum_vacuum_threshold +
autovacuum_vacuum_scale_factor × reltuples)` — that last number is the one that matters,
because it is the fraction of the way to the next autovacuum and it is > 1 on the tables
that are being missed. Layer two is thresholds, and this is where the scale bites: the
default `autovacuum_vacuum_scale_factor = 0.02` on a 500 GB instance means a 2-billion-row
table waits for 40 million row changes, which at a moderate write rate is days. Large tables
need `ALTER TABLE ... SET (autovacuum_vacuum_scale_factor = 0.001,
autovacuum_analyze_scale_factor = 0.002)` and small hot ones need the opposite treatment, so
the setting is per-table and derived from write rate and table size rather than global.
Tables that are bulk-loaded need a post-load `ANALYZE` in the load job, because the
incremental path does not see `COPY`. Layer three is targeted statistics for the columns
where the default sample genuinely cannot see the data: `SET STATISTICS 1000` on
low-frequency values that drive critical query paths, `CREATE STATISTICS` with
`dependencies, mcv, ndistinct` on the column pairs your application invariants make
dependent — tenant determines region, country determines currency, status determines
`fulfilled_at` — and a rule that any index added for a query on two or more columns comes
with a statistics object for those columns. And the part that decides whether it survives
is ownership: thresholds live in the schema as table storage parameters so they migrate with
it, the report has a named owner and a weekly review, and there is an explicit decision
about which tables are large enough that a `VACUUM` needs to be manually scheduled rather
than left to autovacuum. On a 500 GB instance, statistics management is not a database
task, it is a fleet-management task, and the tooling has to exist for it.
**P2. A 90M-row `events` table gets 6M rows every night via `COPY`, and the morning
"yesterday's events" query is slow only on Mondays. The same query on other days is 200 ms.
What is Monday-specific, and what do you change?** `SCENARIO`

The Monday-specific fact is that Monday is the first query after a weekend of no queries,
which means it is the first query to hit pages that `autovacuum` has not yet marked
all-visible, and the first query to run against a buffer pool that has been displaced by
the weekend's other traffic. Both of those are cache-state problems wearing a planner's
costume, and the way to tell them apart is `EXPLAIN (ANALYZE, BUFFERS)`: if Monday shows
`Heap Fetches: 180000` where Tuesday shows `Heap Fetches: 12`, the index is doing an
index-only scan on Tuesday and degrading to an index scan on Monday because the visibility
map was cleared by the weekend's `VACUUM` churn — that is the dependency from Chapter 4,
and the fix is to make the bulk load cheaper to keep visible, not to add an index. If both
show the same `Heap Fetches` but Monday's `shared read` is 40,000 against Tuesday's 300, it
is pure buffer-pool displacement and the fix is cache or instance sizing. The change I
would make in both cases is the same one and it is about ordering, not indexing: **run
`VACUUM (ANALYZE)` as the last step of the nightly load, not on autovacuum's schedule**,
because a 6M-row `COPY` invalidates the visibility map for every page it touches and
autovacuum's thresholds are tuned for incremental churn, not a 6% daily table rewrite. The
number worth putting in the ticket is the `Heap Fetches` ratio between the fast day and the
slow day, because that single ratio distinguishes a visibility-map problem from a cache
problem, and the two fixes are entirely different.

**T1. You run `ALTER TABLE orders ALTER COLUMN status SET STATISTICS 10000` on a 400M-row
table. Predict what happens to `ANALYZE` duration, to the accuracy of the estimate on
`status`, and to the plan for a query that filters `status = 'pending'`.** `ADVANCED`

The sample size is the whole story. The default target is 100, so at 400M rows `ANALYZE`
reads 30,000 rows and builds a histogram from those. Raising the target to 10,000 samples
300,000 rows — a 10× longer `ANALYZE`, which on a 400M-row table with 12 indexes goes from
about 20 seconds to roughly 3 minutes, and that is a real operational cost on a table
someone runs `ANALYZE` on after every load. What you get for it depends entirely on the
distribution, and this is the part that surprises people. If `status` has 12 values that are
roughly uniform, the default sample already has 2,500 rows per value and the estimate is
already accurate to well under 1% — so the 10× sample buys you nothing measurable. If
`status` is skewed, say `'pending'` is 0.4% of the table — 1.6M rows out of 400M — then the
default 30,000-row sample contains about 120 `'pending'` rows, which is enough for a
frequency estimate but marginal, and the most-common-values list becomes the thing that
matters. The prediction for the query is the interesting part: **raising the statistics
target changes the estimate, and if the estimate crosses the planner's threshold, the plan
changes** — for a predicate matching 0.4% of 400M rows, the index-scan cost estimate drops
enough that a sequential scan stops winning, so you get a plan flip. The right answer to
the interviewer is that per-column `SET STATISTICS` is a scalpel for a known distribution
problem, and the first question is always whether the default sample already sees enough
rows of the value being filtered — because for a uniformly-distributed column, raising it
is pure cost.

### Migration & Multi-Version Cost

**D14. You are moving a 40 TB PostgreSQL cluster to a new engine that does not support
online index builds and has no `INCLUDE` clause. Give me the migration plan, and tell me
which indexes you refuse to recreate.** `STAFF`

The plan is a two-phase cutover built around the fact that you cannot build indexes in
production on the target, so every index must be built offline on a restored copy and
shipped. Phase one, on a physical replica taken at a known LSN: restore it on the target,
create all indexes there with no concurrent traffic, and measure. Phase two, the window:
a few minutes of write downtime, promote the target, and replay the delta. The three
things that make or break this, and they are all index work. **First, index build time is
the window.** 40 TB with 340 indexes at roughly 30-60 MB/s of write throughput during a
build is the dominant cost of the whole migration, so the measure you need is per-index
build time, and the one to watch is the *largest* index, because a 30 GB index that takes
40 minutes is the one that breaks the schedule. **Second, `INCLUDE` has no equivalent in
most engines**, so every covering index becomes either a non-unique index whose trailing
columns are part of the key — which changes the semantics, since two rows differing only
in the trailing column can no longer collapse — or a redundant unique index on the full
column list. That is a design decision with data-integrity consequences and it has to be
made deliberately, per index, not by a mechanical translation. **Third, and this is the
one to raise as the reason you might not migrate, the indexes you refuse to recreate are
the BRIN indexes.** A BRIN on a 40 TB append-only table costs 0.008% of the table — a few
GB against a multi-terabyte B+ tree that the target engine will build because it has no
BRIN. Recreating it as a B+ tree adds hundreds of gigabytes and a multi-day build to serve
the same time-range queries. The recommendation is therefore to not migrate, or to migrate
only after the target has BRIN, and the number to put in the write-up is the ratio between
the B+ tree and BRIN sizes on the largest time-series table, because that is the one that
decides it. The org point: **a migration plan that enumerates the indexes you will not
recreate is a plan; one that says "we'll recreate everything" is a wish.**

**P1. A migration from engine A to engine B is going to take four months. Index DDL is the
critical path. Someone proposes a shared-nothing approach: migrate table by table, each
with its own cutover, indexes built on the target from a snapshot. Give me the first three
things that break.** `SCENARIO`

First, **foreign keys across a cutover boundary.** In a single-engine schema, a join is a
nested loop or a hash join inside one database. Split across two engines it is a network
call, and a per-row network call turns a 200 ms query into a 200-second one. Every
referential-integrity join that crosses a migration boundary needs to be materialised as a
denormalised copy on the source side, which is a schema change, not a migration step, and
therefore has to be in the plan from day one rather than discovered at the 60% mark.
Second, **the index set is only valid for the data at snapshot time.** A partial index with
`WHERE deleted_at IS NULL` is 2% of a table on Monday and 40% of it in six months; an index
whose leading column's cardinality collapses under the new workload is not merely slow, it is
actively harmful, because the planner will keep choosing it. So the index inventory has to
be re-derived against the *target* data distribution, which means the snapshot has to be
re-analyzed and the plans re-explained on the target before the cutover is committed, not
after. Third, **write amplification compounds.** A 40 TB database with 340 indexes takes
340 index writes per row for the entire migration window, on both engines, and if the
migration runs for four months that is four months of double write cost on a system that is
already at capacity. The mitigation that actually works is to strip non-essential indexes
from the *source* before the bulk load — a real, immediate capacity win, and the one that
should be scheduled first. The number to quote: total index bytes divided by table bytes,
because at anything above about 25% the migration's write cost is dominated by index
maintenance rather than by the data.

**D1. You have a 12-column table where `CREATE INDEX` on all 12 columns is impossible in
practice on the target engine, which caps key width at 3,000 bytes. Design the index set,
and tell me what you measure to decide the split.** `ADVANCED`

The 3,000-byte cap is a hard physical constraint, not a design hint: at 16 bytes per entry
plus a 6-byte `bigint` payload, a 3,000-byte key holds 136 entries per 8 kB page, which is a
fan-out of 136 rather than 509, and 136³ = 2.5 million rows is the point where the tree
becomes four levels deep. **So a wide key does not merely make the index big, it makes it
taller**, and that is the number that decides the design — you have roughly 2.5M rows of
headroom per tree before every point lookup goes from three page reads to four. The split
therefore follows the query shapes, not the columns: one index per *access pattern*,
each kept under about three columns, and any column that appears in more than one index
becomes a candidate for a narrower `bigint` surrogate. `tenant_id` as a `uuid` is 16 bytes
plus alignment; as a `bigint` it is 8, and on a hot leading column that is the difference
between 509 and 340 entries per page. What to measure before splitting anything: the top
20 queries by total time from `pg_stat_statements`, and for each one the *set of columns
actually constrained*, not the set of columns in the table. The common finding is that of
12 columns, 4 appear in predicates and the other 8 appear only in projections, which belong
in the heap, not in any key. The number to put in the design doc is the max rows per tree
at the permitted key width, because that is the volume at which the design has to be
revisited.

**S1. A migration script contains `CREATE INDEX idx_legacy ON legacy_orders (id, legacy_id,
customer_id, status, created_at, updated_at, total_cents, currency, notes);`. It has been
in the repo for a year. What do you do?** `TRICKY`

Delete it, and the reason is that this index is a snapshot of a schema nobody has looked at
in a year, and every column in it is a guess about what a query might need. At 8 columns
averaging 20 bytes the entry is roughly 166 bytes, so an 8 kB page holds 49 entries against
509 for a bare `bigint` — a 10× larger index and a fan-out of 49, which puts a 50M-row
table at 49³ = 117,649 rows before the tree becomes four levels deep, and every point
lookup on it is a four-page descent. So this index is not just fat, it is actively making
the table slower to query than having no index at all would. The review has three steps.
**First, establish that it is unused**: `pg_stat_user_indexes.idx_scan` for it, and if it
has been scanned zero times since the last stats reset, it is not serving anyone and the
case is closed regardless of how it looks. **Second, if it is used, find which prefix is
used** — the leftmost prefix rule means a query touching only `(id)` is using it, and a
query touching `(id, legacy_id, customer_id, status, created_at)` is using it too, and
those two facts call for completely different indexes. If everything that uses it stops at
`id`, replace it with the 16-byte `id` index and get the fan-out back to 509. **Third, add
the guardrail**, which is the part that stops this recurring: a CI check that fails a
migration containing an `INDEX` on more than three columns, or one where the sum of column
widths exceeds 200 bytes, with a comment linking to the fan-out arithmetic so the rule
reads as a consequence rather than a style preference. The staff point to add in the PR: a
year-old unreviewed index in a migration script is not a performance question, it is an
ownership question — nobody knows who added it or what it was for.

**T2. You `DROP INDEX CONCURRENTLY` a 30 GB index. It runs for six hours and then fails
with "cannot be executed in a transaction block", leaving an invalid index behind. What
happened, and what is the correct procedure?** `TRICKY`

Two separate mistakes compounded, and both are worth naming because both are common. The
error message is the giveaway that the statement was issued inside a transaction — many
migration tools wrap every migration in a transaction by default, and
`DROP INDEX CONCURRENTLY` is explicitly one of the statements that cannot run there,
because a concurrent drop does a three-phase operation (mark invalid, wait for transactions,
drop) and the invalid phase must be visible to other sessions, which a transaction
prevents. The second mistake is the reason you were allowed to run it for six hours at all:
there is no timeout on the statement by default, so it held a `SHARE UPDATE EXCLUSIVE`
lock on the table for six hours, which does not block reads or writes but does block
`VACUUM`, and on a hot table that is how a six-hour index drop becomes a bloat incident.
The state you are left in is the genuinely bad part: the index still exists and is still
being maintained on every insert, every update, and every vacuum, but it returns nothing
useful because it is marked invalid. Its space is not reclaimed and its write cost is still
being paid, so the system is strictly worse off than before you started. The correct
recovery is `DROP INDEX CONCURRENTLY` again, outside the transaction — the second attempt
sees the already-invalid index and finishes fast because the mark-invalid phase is already
done — and if that is not available, `REINDEX INDEX CONCURRENTLY` to rebuild it valid
before deciding what to do with it. The durable fix is to make your migration tool's
transaction mode a per-migration setting rather than a global default, because
`CONCURRENTLY` on create and drop are the two statements that will need it and they are
exactly the two people forget.

**D15. Your team is 11 months into a migration. Index DDL has consistently taken 60% of
the elapsed time. The vendor says index build is inherently serial. Do you accept that, and
if not, what is the counter-proposal?** `STAFF`

I do not accept it, because "inherently serial" is a claim about one implementation of one
operation, and the counter-proposal is to stop treating index build as a prerequisite for
everything else. The three levers, in order of value. **First, parallel build.** Every
modern engine can build an index using multiple workers — PostgreSQL's
`max_parallel_maintenance_workers`, MySQL's `innodb_sort_buffer_size` and its parallel sort,
and both engines' ability to
process leaf pages concurrently — and the speedup is bounded by how much of the build is
CPU versus I/O. For a 30 GB index on spinning-class storage the build is I/O-bound and
parallelism buys perhaps 1.5×; for the same index on NVMe it is CPU-bound and parallelism
buys 4-8×. The number to put in the plan is the build rate in MB/s per worker, measured on
one index, because that single measurement tells you whether your bottleneck is the disk or
the single-threaded sort, and therefore how much of the remaining 60% you can recover. **The
durable fix is incremental index maintenance**: a non-unique index on a table with frequent
commits must scan the whole table, but many engines support tracking dirty pages since the
last build so a subsequent `REINDEX` or a second build pass only processes what changed —
turning a 6-hour rebuild into a 4-minute incremental one, and changing the migration plan
from "leave a window open" to "rebuild continuously during the migration". **Second,
overlap the builds with the data movement.** If index build is 60% of elapsed time and it is
currently a phase that follows a copy phase, the two should be pipelined: build indexes on
tables as soon as those tables land, not after all of them land. On a 40 TB migration with
per-table granularity that converts a serial 6-month critical path into one bounded by the
slowest single table. **Third, question the index set itself**, which is back to Chapter 4:
a meaningful fraction of the 340 indexes will have zero reads in the target, because the
queries that motivated them are served by a different engine feature. Deleting them before
the migration is free capacity and free build time. The org point: **a migration plan that
does not name its longest serial phase is not a plan**, and "index DDL is 60% of elapsed
time" is the sentence that should have been in the first review.
