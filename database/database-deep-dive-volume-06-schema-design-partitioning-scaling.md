---
title: "The Database Complete Deep-Dive"
volume: 6
series: "SCHEMA DESIGN, PARTITIONING & SCALING"
subtitle: "Study & Interview Mastery Guide"
---

# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is an eleven-volume study guide to databases, written for engineers who already know
how to build a backend service and are preparing for senior and staff-level interviews. It
is not a tutorial. Nothing here explains what a column is.

The organising question of every chapter is the same one a staff engineer gets asked in a
real design review: **not "what does this do", but "why would a team choose this, what does
it cost, when does it break, and how expensive is it to undo?"** This volume is where that
question stops being hypothetical. Volumes 1 through 5 were about getting one node to
answer a question correctly and quickly. This volume is about the point at which the
schema you designed on day one — the key you chose, the column you put on the join, the
`WHERE` clause you filtered by — becomes the constraint you cannot move. A surrogate key
becomes a shard key. A `customer_id` column becomes a fan-out. A missing composite index
becomes a cross-shard join that no amount of hardware fixes.

Volume 6 is the volume where **schema design and system design stop being separate
subjects.** Partitioning is a schema decision with an operational consequence; sharding is
a schema decision with a distributed-systems consequence; the connection pool is a schema
decision with a concurrency consequence. A staff engineer is expected to hold all three in
one sentence: *"we partition `events` monthly on `created_at` because retention is a
`DROP TABLE`, which lets us keep a 2-billion-row table on one node, which means we do not
need to shard it, which means the shard key decision — the most expensive decision in the
industry — is still ahead of us rather than behind us."* That sentence is the volume.

The staff-level theme running through the nine chapters is **the difference between a
decision that is cheap to reverse and one that is not, and knowing which is which before
you make it.** Adding a `CHECK` constraint is reversible. Changing a primary key from
`BIGINT` to `UUID` is not. Adding an index is reversible; it just costs you disk and write
throughput while it exists. Changing your partition key is not. Adding a read replica is
reversible; adding a shard key is a two-quarter migration under live traffic. Every
chapter here is built so the candidate can say which side of that line a given change is
on, because that classification *is* the staff-level answer.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto a connection
pool produces filler. The template is a completeness checklist, not a template to fill.

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

This volume is the point in the set where the questions stop being about SQL and start
being about commitments. The design trade-off questions here are the ones that get asked
with a real number attached — *500 million rows, 40 services, 8,000 queries per second* —
and the candidate who can talk for three minutes about why the partition key and the
leading index column must agree, and what it costs to reshard, is the candidate being
evaluated for staff.

### Continuing From Volume 5

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 (this book) | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL — InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 6

- Chapter 1 — Choosing Types & Naming for Change
- Chapter 2 — Modelling Relationships
- Chapter 3 — Temporal & Historical Data
- Chapter 4 — Index & Partition Co-Design
- Chapter 5 — Partitioning
- Chapter 6 — Sharding
- Chapter 7 — Replication & Read Scaling
- Chapter 8 — Connection Pooling & Client-Side Limits
- Chapter 9 — Interview Scenario Bank

---

# Part 1 — Schema Design, Partitioning & Scaling

## Chapter 1 — Choosing Types & Naming for Change

### 1.1 The Key Is the Most Expensive Column You Will Choose

Every other column in the schema is a fact. The key is a *promise* — a promise that this
value will identify this row forever, in this table and in every table that references it,
and that the promise will survive a restore, a replication lag, a merge from two
environments, and a reindex. Choosing it badly does not produce a slow query. It produces
a migration that touches every table, every foreign key, every API response, every cached
serialisation, and every downstream consumer who stored your ID in their own system.

The four candidates, stated honestly:

| Candidate | Insert locality | Index size | Merge safety | Unguessable |
| --- | --- | --- | --- | --- |
| `BIGINT` sequence | perfect — rightmost leaf, no splits | 8 bytes | **no** — collides across environments | no |
| `UUID` v4 (random) | **worst** — random leaf, split on most inserts | 16 bytes | yes | yes |
| `UUID` v7 (time-ordered) | good — 48-bit ms prefix, monotonic-ish | 16 bytes | yes | yes |
| Natural key (`email`, `sku`) | depends on generation | wide | yes, if the business key is globally unique | sometimes |

The table already contains the trap. `UUID` wins three of the four columns and loses the
column that determines whether your writes are fast, and almost every team picks it
*because* it wins three of the four.

### 1.2 `BIGINT` and the Insertion-Order Argument

A `BIGINT` primary key backed by a sequence produces a monotonically increasing value. That
one property does three things in a B+ tree, and all three are the reason a sequential key
is fast.

```text
  SEQUENTIAL BIGINT INSERTS — every insert lands on the SAME leaf

  root
   │
   └──┬──────────────────────────────────────────────┐
      │ page 1001  [1M .. 1.5M]                      │  ← inserts arrive here
      ├──┼────────────────────────────────────────────┤     8kB, ~80 rows
      │ page 1002  [1.5M .. 2M]                      │
      └──┴────────────────────────────────────────────┘
                        ▲
                        └── every new row is the largest key in the table,
                            so the rightmost leaf is the only one that changes

  1. NO PAGE SPLITS.  A split happens when a leaf has no room.
     The rightmost leaf is empty by definition, so it always has room.
  2. NO DIRTY-PAGE CHURN.  One leaf is hot; the other 99.99% stay clean
     and get skipped by the write-back path entirely.
  3. PERFECT RANGE LOCALITY.  "Last 7 days" is a contiguous range on
     disk.  A query for it touches 3 pages, not 3,000.
```

Against that, a random `UUID` v4 as the clustered key:

```text
  RANDOM UUID INSERTS — the key is uniformly distributed over 2^122 values

  root
   │
   └──┬──────────────────────────────────────────────┐
      │ page 1001  [000a..0f3b]  92% full  SPLIT ──┐ │
      ├──┼─────────────────────────────────────────┼─┤
      │ page 1002  [0f3c..1e77]  61% full         │ │
      ├──┼─────────────────────────────────────────┼─┤
      │ page 1003  [1e78..2a10]  88% full  SPLIT ──┘ │
      ├──┼─────────────────────────────────────────┤   ← ~40 of ~80 rows
      │ page 1004  [2a11..3f9e]  55% full         │      moved per split
      └──┴─────────────────────────────────────────┘

  A split copies ~half the page. At 8kB and ~100-byte rows that is
  ~40 rows written to do ONE logical insert.
```

That is the number to be able to produce unprompted: **a B+ tree leaf is roughly 60–70%
full after a split, and 100% full on a monotonic append.** On an 8 kB page holding ~80
rows of 100 bytes, a random insert that lands in a page above the fill threshold causes a
split that rewrites ~40 rows. If your insert rate is 2,000 rows/second and a third of
them split, that is ~667 splits/second × 40 rows = **~27,000 row-writes per second of pure
overhead** — plus the WAL records for all of them, plus the dirty pages that can no longer
be evicted in order.

The second, quieter cost is the **working set**. With a monotonic key, a query for recent
data touches the last few leaves, which are also the hottest in the buffer pool, because
they are the only ones being written. With a random key, a query for recent data — and a
`created_at` range scan is the most common query in most applications — has to find its
pages scattered across the entire key space, so a scan of the last 7 days of a 2-billion-
row table touches pages that were never co-resident, and the buffer pool hit ratio falls
even though the buffer pool size did not change.

> **INTERVIEW TRAP — "UUID PRIMARY KEYS ARE GOOD BECAUSE THEY AVOID CONTENTION"**
>
> The contention argument is real and it is about a *different* problem: at high insert
> rates, a single monotonic key can become a hot spot because every insert targets the
> same leaf, and on a distributed system a single sequence generator is a single point
> that has to round-trip. The candidate who says "sequential integers cause contention, so
> we use UUIDs" is right about the contention and has silently made four much larger
> problems:
>
> - **Every insert is a random page write.** A split rewrites half a page. On an 8 kB page
>   that is ~40 rows written per split, and the WAL records all of them.
> - **The index is 2× the size.** 16 bytes versus 8, and secondary indexes, replica
>   traffic, and the write-ahead log all scale with it. On a 2-billion-row table with
>   three secondary indexes that is real terabytes of extra storage and extra network per
>   replication hop.
> - **Range scans stop being ranges.** Every secondary index has the PK appended, so a
>   `created_at` index on a random-PK table is also randomly ordered in its tail.
> - **It does not actually remove the contention.** PostgreSQL's sequences are explicitly
>   designed so that concurrent inserts do *not* serialise on a single row lock — a
>   sequence hands out a block of values per session. The contention a sequential key
>   creates in PostgreSQL is at the `current` row in the sequence relation, and
>   `CACHE 32` amortises it. You trade a measured, bounded, tiny cost for an unmeasured,
>   unbounded, large one.
>
> The correct answer when asked: "the contention is real on some engines and is bounded by
> sequence caching here; the write-amplification cost of random primary keys is real on
> every engine. If you need a conflict-free, merge-safe identifier, you want a **time-ordered
> UUID** — UUIDv7 — not a random one, and you should be able to say why."

### 1.3 UUIDv7, and the Limits of Its Mitigation

UUIDv7 puts a 48-bit big-endian Unix-millisecond timestamp in the leading bits, followed by
random data. The consequence is that the *sort order* of the UUID correlates with
generation order, which restores most of the locality a `BIGINT` had — inserts cluster into
the same region of the key space, page splits drop, and a recent-rows range scan is
contiguous again.

```text
  UUIDv4                                 UUIDv7
  ┌────────────────────────────────┐     ┌────────────────────────────────┐
  │ f47ac10b-58cc-4372-a567-      │     │ 018f3e5a-7b2c-7def-8a1b-      │
  │ 0e40202b9d7a                  │     │ c3d4e5f60718                  │
  │                                │     │  └─ ts_ms 48 bits (monotonic) │
  │  fully random → no ordering   │     │  └─ rand_a 12 bits             │
  │  → page split on most inserts │     │  └─ rand_b 62 bits             │
  └────────────────────────────────┘     └────────────────────────────────┘
   48 bits of entropy is genuinely unguessable; the first 12 hex
   characters now leak your wall-clock time to anyone holding a row.
```

Three limits worth stating, because the honest answer is "this helps, and it is not free":

- **It is still 16 bytes.** Twice the primary key, twice the tail on every secondary index.
- **It leaks time.** Anyone holding a row can read approximately when it was created. For
  most applications that is irrelevant; for a system where creation time is a business
  secret (an anonymous survey response, a medical intake form, a whistleblower platform)
  it is a genuine leak, and the fix is a separate encrypted or opaque identifier — not a
  v4 UUID pretending to be private.
- **It is monotonic only per millisecond per node.** Two nodes generating at the same
  millisecond still interleave randomly, and a few engines offer a "UUIDv7 with monotonic
  counter within the same millisecond" variant that recovers the rest. If you are deploying
  UUIDv7 across 40 application instances, the "time-ordered" property is at 40-way
  resolution, not global.

> **TRADE-OFF — "SEQUENCE OR UUID?"**
>
> Both sides, and the condition that flips the answer.
>
> **Choose the sequence when:** rows are created in one place, IDs are never exposed to an
> untrusted party, and you are sharding later. A `BIGINT` sequence is 8 bytes instead of
> 16, inserts are append-only, and — critically — a `BIGINT` encodes locality, so
> `customer_id = 8` almost certainly lives on shard 0 and `customer_id = 900` almost
> certainly does not. That makes range queries, `BETWEEN` predicates, and "recent rows"
> scans single-shard for free. This is a genuine, under-discussed advantage of `BIGINT`
> that only becomes visible once you are sharding.
>
> **Choose UUID when:** rows are created in more than one place (offline clients, edge
> nodes, a mobile app that has been offline for a week), IDs must be generated without
> touching the database (bulk imports, pre-allocated ID blocks), the same entity is merged
> from two environments, or the ID is a capability and you do not want IDs to be
> enumerable. If a user can increment `customer_id` and read someone else's account by
> guessing, the ID is a broken authorisation model and `UUID` — v7, or v4 if unguessability
> beats locality — is a real fix.
>
> **The condition that flips it, stated as the question to ask in the design review:** does
> this system ever create a row without talking to a database, or merge data from two
> databases? If yes, sequence. If no, and IDs are not a capability, `UUIDv7` is the better
> default.

### 1.4 Sequences, and the Gap That Is Not a Bug

A sequence is a separate object. `nextval` is not rolled back, so a sequence-based
identifier is **not gapless** — a rolled-back transaction burns its value. This surprises
people who treat `id` as a count, and it is correct behaviour: making sequences gapless
requires a lock held across the whole transaction, which serialises every insert.

```sql
-- PostgreSQL: a sequence with a block cache.
-- Each session grabs CACHE values in one round trip instead of one per row.
CREATE SEQUENCE order_id_seq
  AS BIGINT
  START WITH 1000001
  INCREMENT BY 1
  CACHE 50;              -- 50 nextval calls per round trip

CREATE TABLE orders (
  id          BIGINT      PRIMARY KEY DEFAULT nextval('order_id_seq'),
  customer_id BIGINT      NOT NULL REFERENCES customers (id),
  placed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_cents BIGINT      NOT NULL
);
```

The `CACHE 50` is a two-sided trade and it is a good staff-level detail: it cuts the
round-trip cost of sequence allocation by ~50×, and it *widens* the gap, because with 200
concurrent sessions each holding 50 cached values you can skip up to **10,000 sequence
values** in a burst. The default is `CACHE 1`, which is gapless in practice but pays a
round trip per insert. The tuning is to raise the cache until the gaps stop mattering —
and gaps matter for three specific things: anything that infers "count = max(id)"
(the wrong query, but one people write), anything that exposes IDs to humans as
sequential receipts, and any table that will be sharded later, since the `BIGINT` value
becomes the routing decision.

A fourth trap: `MAX(id) + 1` as a key generator. It is race-free in no circumstances, it
takes a full scan or an index probe, and it breaks the moment you have two writers. If
you want a gapless number for a document number or an invoice number, that is a *business*
sequence with a different design (see Chapter 3 — it is a temporal range problem), not a
primary key.

> **MUST REMEMBER**
>
> A `BIGINT` sequence key is not just "smaller". It is *monotonic*, and monotonicity is a
> physical property that makes inserts append-only, keeps the buffer pool's hot set
> contiguous, and — once you shard — makes ID ranges map to shards. A random `UUID` key
> gives up all three, costs double the bytes, and only wins on the axis (merge safety,
> unguessability) that you can often get some other way.

### 1.5 Naming, and How to Survive a Rename

Naming conventions are unglamorous and they are load-bearing, because the first thing
anyone does in an incident is grep. The rules that survive a rename are the ones that name
*what a column means* rather than what it currently is.

**The rules, and the reason for each:**

- **`snake_case`, singular table names, plural for join tables.** `order_line`, not
  `OrderLines` or `order_lines`. The plural/singular distinction for join tables is not
  taste — it tells a reader which columns are the two foreign keys before they read the
  constraints.
- **Name the foreign key after the table it points at, not after the relationship.**
  `customer_id` in `orders`, not `purchaser_ref`. When a second team adds a table three
  months later, the convention is the only thing that makes the schema navigable.
- **Never rename a primary key column.** The one exception people should consider is a
  homogeneous table where the key is genuinely `id` and *every* table in the schema uses
  `id`. That is a real convention with real benefits (ORM friendliness, query brevity) and
  real costs (a join needs table aliases, and `SELECT id FROM orders JOIN customers` has
  two `id`s). Pick it at the start; do not migrate into it.
- **Encode units and semantics in the name, not in a comment.** `total_cents BIGINT`, not
  `total DECIMAL(10,2)`. `timeout_ms INTEGER`, not `timeout INTEGER`. `created_at
  TIMESTAMPTZ`, not `created TIMESTAMP` — the `TIMESTAMPTZ` versus `TIMESTAMP` distinction
  in PostgreSQL is a *storage* distinction (UTC microseconds versus wall-clock with no
  zone) and the column name is where most teams fail to signal which one they mean.
- **Prefix booleans and state columns consistently.** `is_`, `has_`, `can_` for booleans.
  A `status` column with values `'A'`/`'P'` is a lookup table that has not been written
  yet; Volume 2 covers the `CHECK` that keeps it honest.

**The rename that actually costs you.** Renaming a *column* is a `ALTER TABLE ... RENAME`
plus an application deploy, and it is manageable. Renaming a *table* that other tables
reference is a rename plus every `REFERENCES` clause plus every view plus every ORM mapping
plus every stored query string that mentioned it. Renaming a *primary key value type* is
the one that is a genuine migration: change the type, backfill every foreign key, rewrite
every index, invalidate every cached deserialisation, and coordinate with every downstream
consumer who stored your ID. The mitigation is procedural rather than technical: **decide
the key type in the first week, and treat a change as a major-version event.**

> **PRODUCTION RELEVANCE**
>
> The reason naming deserves a section in a volume about scaling is that schema navigation
> cost is a real, measurable drag. The empirical claim worth making in a design review is
> that a schema where a new engineer can find the owner of a piece of data in under five
> minutes ships changes faster than one that is half the size, because the bottleneck in a
> large schema is almost never the query — it is the forty minutes before the query. A
> foreign key called `customer_id` instead of `cust_ref_7` is not a style preference; it is
> the difference between a rename that a search finds and a rename somebody has to trace
> through a spreadsheet.

#### Common Mistakes

- Choosing `UUID` v4 as the primary key "for scalability", when the scalability argument is
  about a contention that sequences with `CACHE` already solve, and the cost is a page
  split on most inserts
- Believing a gapless `id` is achievable, or attempting it with `MAX(id) + 1`
- Treating the key type as a formatting decision rather than as the identity scheme of the
  whole system
- Using `TIMESTAMP` (without time zone) for a business timestamp and only discovering the
  bug at the first DST boundary
- Renaming a table that other tables reference without a migration plan for the
  `REFERENCES` clauses, the views, and the ORM mappings
- Naming the join table in the singular when every other table is plural, so nobody can
  tell which two columns are the keys

#### Interview Questions — Keys & Types

**Q1. Why is a `BIGINT` sequence faster than a random `UUID` as a primary key, given both
are unique?** `STAFF`

Because the difference is not uniqueness, it is *locality of write*. A monotonic key means
every new key sorts after every existing key, so every insert lands on the rightmost leaf
of the B+ tree, which is by construction empty and never splits. A random `UUID` lands
uniformly across the whole key space, so a large fraction of inserts hit a leaf that is
already above the fill threshold and force a page split, and a split on an 8 kB page with
~100-byte rows rewrites roughly 40 rows. That is one logical insert costing 40 physical row
writes, and the WAL records all of them. The second cost is the working set: a
`created_at` range scan on a random-PK table has to chase pages scattered across the entire
index, so the buffer pool hit ratio falls without the pool changing size. The third is
size: 16 bytes of key is 16 bytes appended to every secondary index and every WAL record.
The contention argument for UUIDs is real on some engines but is bounded by sequence
caching (`CACHE 50` plus one round trip per block) and does not outweigh this. If you need
merge-safety or unguessability, the answer is a time-ordered UUID (v7), not a random one.

**Q2. You have 200 application instances, 40 services, and you are merging two
environments weekly. Sequence or `UUID`?** `STAFF`

`UUID`, and specifically v7 rather than v4, with the reasoning stated rather than the
keyword. Weekly environment merges mean ID collisions are a routine event, not a rare one,
and a collision on a primary key is a failed migration — the merge halts and someone
hand-repairs. Unguessability matters too if the ID appears in a URL and you do not want
enumerable user IDs. But the choice of v7 over v4 is the staff part: v4 is random, so it
reintroduces the page-split and working-set costs of Chapter 1 into a system that does not
need them, while v7's 48-bit millisecond prefix restores insert locality and range-scan
contiguity. The thing to volunteer is the trade you are giving up — 16 bytes instead of
8, and a timestamp leak in the first 12 hex characters. And the thing to volunteer *before*
anyone asks is that if you later shard, you want the shard key to be *something else* —
these UUIDs are deliberately uncorrelated with which shard a row is on, so a
`WHERE customer_uuid = ?` query cannot be pruned.

**Q3. A table has `id BIGINT GENERATED ALWAYS AS IDENTITY` and a unique index on `email`.
Should `email` be the primary key?** `TRICKY`

No, and the reason is that the question is really asking whether you understand what a
primary key is *for*. `email` is a natural key, and natural keys change — people change
email addresses, and when they do, every table referencing the customer must be updated
inside a transaction or the schema breaks. A surrogate key makes that a no-op: the email
changes, the `id` does not, and nothing else in the schema is affected. The surrogate key
is what makes the *references* stable. The natural key gets a `UNIQUE NOT NULL` constraint,
which gives you the "one account per email" business rule without making it the identity.
The real reason to keep the surrogate is a little more operational: an `email`-keyed primary
key means every insert is a random write into a text index, so you have taken a UUID's
write-amplification problem and added collation and case-folding and max-length to it. The
case where a natural key *is* right is when the business value is genuinely immutable and
globally unique and meaningful to the human reading the row — a country ISO code, a currency
code, an immutable SKU.

**Q4. Your team wants to rename `orders.total` to `orders.total_amount` and add a
currency column. What is the actual risk, and how would you sequence it?** `ADVANCED`

The rename itself is the small part; the risk is that `total` is almost certainly read by
something you cannot see. In order: the application (an ORM mapping, a repository
interface with a `@Query` naming the column, a native SQL string), reporting queries and
dashboards, downstream consumers reading the table directly, and the seed/migration files
that are not idempotent because the old column was assumed to exist. The sequence that
works is additive, not substitutive: add `total_amount` nullable, dual-write both in the
application and with a trigger, backfill in batches, flip reads, then drop `total` in a
later release. For a column *rename* specifically, the two-step is to add the new name,
backfill, move reads, and only then `DROP COLUMN` — because a rename in one step means no
version of the application works at any point during the deploy, unless you take a lock
that blocks all reads. The staff-level addition is to ask how the team would *know* the
rename was complete, and the answer should involve a query against `information_schema` and
a search of the codebase, not a promise in the PR description.

**Q5. What is the actual cost of a gapless identifier, and when do you need one?**
`ADVANCED`

A gapless sequence requires holding a lock across the entire transaction that used the
value, so a rollback can be undone by reusing the number. That serialises every insert on
that sequence, which converts a 2,000 writes/second table into a single-threaded
table. That is why no engine does it by default, and why `nextval` is explicitly
non-transactional. The honest answer is that you almost never need a gapless *primary
key*, because `COUNT(*)` should be `COUNT(*)` and `MAX(id)` should never be a count. You
need gapless numbers for two specific things: a human-facing document number (invoice,
contract, purchase order) where people notice gaps and assume records are missing, and
certain regulatory sequences. The right design for those is a separate, deliberately
serial business sequence with its own table and its own locking discipline — it is a
temporal range problem, not a key problem, and Chapter 3 covers the shape. Coupling the
business document number to the primary key means a rollback burns a real invoice number.

> **CHAPTER 1 SUMMARY**
>
> The primary key is the one column you will not get a second opinion on, and the reason
> is that it is the only column that every other table, index, API response and downstream
> consumer depends on. `BIGINT` sequences win on the axis people forget — monotonicity,
> which makes inserts append-only, keeps the hot set of the B+ tree contiguous, costs half
> the bytes, and encodes locality that later pays off as free shard routing. Random `UUID`
> v4 keys pay a page split on a large fraction of inserts, double every index, and scatter
> every recent-rows scan. When you need merge-safety or unguessability, the answer is
> `UUIDv7`, and the staff part of that answer is naming what it costs (bytes, and a
> timestamp leak) and what it does not solve (shard pruning). Names matter here for the
> unglamorous reason that the first step of every incident is a grep, and the first step of
> every migration is finding every reader.

#### Further Reading

- [RFC 9562 — UUID Version 7 and Version 8](https://www.rfc-editor.org/rfc/rfc9562.html) — the normative spec for time-ordered UUIDs, including the monotonic-counter variant.
- [PostgreSQL — Identity Columns](https://www.postgresql.org/docs/current/ddl-identity.html) — `GENERATED ... AS IDENTITY` versus `SERIAL`, and why the standard form is the one to use.
- [Use The Index, Luke — The Drawbacks of UUID Values](https://use-the-index-luke.com/2021-07-27/the-drawbacks-of-uuid-values.html) — the page-split and cache-locality argument with worked numbers, from the practitioner side.
- [PostgreSQL — Sequences](https://www.postgresql.org/docs/current/sql-createsequence.html) — `CACHE`, `CYCLE`, and what the sequence cache actually does to your gap width.
- [Brandur Leach — Randomness in Postgres and pivot tables](https://brandur.org/randomness/) — the wider pattern: random identifiers are cheap to generate right and expensive to be wrong about later.

## Chapter 2 — Modelling Relationships

Volume 1 Chapter 5 established the *grain* of a table and the anomalies that follow from
getting it wrong. This chapter is the next layer up: given the grain, what are the actual
relationships, where does the foreign key go, and what happens when a row points at one of
three possible tables.

### 2.1 One-to-One, and Why It Is Rarely One-to-One

A true 1:1 relationship is rarer than it looks, because the moment a second row can exist
without the first, it is 1:N. The modelling decision is where to put the foreign key, and
there are exactly two correct places.

```sql
-- Option A: the "many" side is the one with the FK. This is a 1:1 only
-- because of the UNIQUE constraint. Remove the UNIQUE and it is 1:N.
CREATE TABLE users (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email         TEXT        NOT NULL UNIQUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE user_preferences (
  user_id       BIGINT PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
  locale        TEXT NOT NULL DEFAULT 'en-GB',
  theme         TEXT NOT NULL DEFAULT 'system',
  marketing_opt_in BOOLEAN NOT NULL DEFAULT false,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- user_preferences.user_id is both the PK and the FK. That single fact
-- enforces 1:1 (a PK is unique) and gives you the cascading delete for free.

-- Option B: the FK lives on the parent, nullable, with UNIQUE.
-- Correct when the child is *created later* in the child's lifecycle —
-- no user row can exist before its preferences row does.
ALTER TABLE users ADD COLUMN preferences_id BIGINT UNIQUE
  REFERENCES user_preferences (id) ON DELETE SET NULL;
```

The reason Option B is chosen at all is a *lifecycle* fact, not a modelling preference: if
`user_preferences` is created in the same request as the user, A is simpler; if preferences
are optional and provisioned later (or by a migration), B avoids a nullable gap on the
child. The trap in Option B is **two nullable FKs to the same pair of tables**, which
permanently permits the state where `users.preferences_id` is set but no
`user_preferences` row exists — a foreign key from `users` to `user_preferences` does not
check the *other* direction.

The real modelling error is calling something 1:1 when it is 1:N. "A customer has one
address" is 1:N the moment a second address is possible, and it is 1:1 the moment it
does not. Deciding which of those two futures you are designing for is the entire
question, and the answer should be written down because `addresses.customer_id` with no
`UNIQUE` is the 1:N answer and adding the `UNIQUE` later is a migration that fails the
moment the second row exists.

### 2.2 One-to-Many, and Where the Foreign Key Goes

A 1:N relationship has exactly one legal placement, and the placement is forced by the
grain: **the foreign key goes on the "many" side.** A `customer_id` on `orders`, never an
`order_ids` array on `customers`.

```sql
CREATE TABLE customers (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email      TEXT        NOT NULL UNIQUE,
  name       TEXT        NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE orders (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id BIGINT      NOT NULL REFERENCES customers (id),
  status      TEXT        NOT NULL DEFAULT 'PLACED',
  placed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_cents BIGINT      NOT NULL
);

-- The index that makes "this customer's orders" fast. Note that the FK
-- does NOT create this index in PostgreSQL.
CREATE INDEX orders_customer_id_idx ON orders (customer_id);

-- The index that makes "orders still unpaid" fast. The FK column is
-- deliberately NOT the leading column, and that is the whole point of 4.4.
CREATE INDEX orders_status_placed_at_idx ON orders (status, placed_at DESC);
```

Two mechanical details that cost real incidents. **A foreign key does not create an index on
the referencing column** in PostgreSQL, and in MySQL/InnoDB it usually does only because
the FK needs it for its own bookkeeping — but the *shape* of that index is `(customer_id)`
alone, which serves the child-side query and nothing else. If you will also ask "all
pending orders across all customers", the useful index is `(status, placed_at)`, and
`status` leading means the FK is not usable as a prefix. **Deleting a parent with children
is where the `ON DELETE` clause earns its keep** — `ON DELETE CASCADE` (children die with
the parent, correct for a value object like preferences), `ON DELETE RESTRICT` (refuse,
correct for anything with financial meaning, and the default in most engines), and
`ON DELETE SET NULL` (orphan the children, correct only when the FK is nullable and the
child has independent meaning). The choice is a *business* statement about what a
customer *is* when it is deleted, and getting it wrong is not recoverable from a backup
taken an hour ago.

### 2.3 Many-to-Many, and What Goes on the Join Table

An N:M relationship becomes two 1:N relationships and a join table. The join table is
where the actual design work is, and almost every under-designed join table is missing at
least one of these columns.

```sql
-- The minimum: two foreign keys, and a composite primary key so the same
-- relationship cannot be recorded twice.
CREATE TABLE products (
  id    BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  sku   TEXT NOT NULL UNIQUE,
  name  TEXT NOT NULL
);

CREATE TABLE order_line (
  order_id   BIGINT NOT NULL REFERENCES orders (id)          ON DELETE CASCADE,
  product_id BIGINT NOT NULL REFERENCES products (id)        ON DELETE RESTRICT,
  -- attributes OF THE RELATIONSHIP, not of either entity:
  quantity        INTEGER     NOT NULL CHECK (quantity > 0),
  unit_price_cents BIGINT     NOT NULL CHECK (unit_price_cents >= 0),
  discount_cents  BIGINT      NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT order_line_pk PRIMARY KEY (order_id, product_id)
);
-- That CHECK is the whole point: a line with quantity 0 or a negative
-- price is not a line item, it is a bug, and the database is the cheapest
-- place to say so.

-- An index for the reverse direction, which the composite PK does NOT give you.
CREATE INDEX order_line_product_id_idx ON order_line (product_id);
```

The three mistakes on a join table, in order of how often they are made:

- **Leaving off the reverse index.** `(order_id, product_id)` serves "lines for this
  order" and cannot serve "orders containing this product" — that is the leftmost-prefix
  rule from Volume 4, and it applies to the join table like any other.
- **Moving the price onto the product.** `products.price_cents` records the *current*
  price, so every historical invoice silently changes when the product is repriced. The
  price on `order_line` is not redundancy — it is a *temporal fact about the relationship*,
  and Volume 1 Chapter 5's rule ("store a fact in one place only if updating it requires
  updating that one place") does not apply because updating the price of a sold line does
  *not* require updating the product.
- **Forgetting the row's own identity.** Some code — an ORM, an event log, a CDC
  connector — needs a stable single-column key on the join row. Adding
  `id BIGINT GENERATED ALWAYS AS IDENTITY` alongside a `UNIQUE (order_id, product_id)` is
  cheap and prevents the schema from being reshaped later.

> **MUST REMEMBER**
>
> The join table is not a bookkeeping artefact. It is where the *relationship's own
> attributes* live, and a relationship with attributes is a first-class entity. The moment
> you write `unit_price_cents` on it, you have a fact that must be immutable after the
> fact — which is Chapter 3's subject, and which is why "just look up the current price"
> is a data-retention bug, not an optimisation.

### 2.4 Self-References and Hierarchies

An entity that points at itself — `employees.manager_id REFERENCES employees (id)` — is
perfectly ordinary and needs one non-obvious index.

```sql
CREATE TABLE employees (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name       TEXT NOT NULL,
  manager_id BIGINT REFERENCES employees (id) ON DELETE SET NULL,
  -- A self-FK MUST be nullable, or the first insert (the CEO, who has no
  -- manager) cannot happen.
  CONSTRAINT employees_no_self_manager CHECK (manager_id IS DISTINCT FROM id)
);
CREATE INDEX employees_manager_id_idx ON employees (manager_id);
```

The `CHECK` is not decoration. Without it, `UPDATE employees SET manager_id = id WHERE id = 5`
creates a self-cycle, and every recursive query over the hierarchy becomes an infinite
loop with no error — the recursive CTE either hits the recursion limit or, worse, a
materialised recursive view silently produces a wrong number of rows. Cycles of length
greater than one are equally possible and cannot be caught by a `CHECK`; catching them
requires a recursive validation query you run as a scheduled integrity check. That is
worth saying in an interview, because it is the difference between "I know how to write
the FK" and "I know what a self-reference can break".

Hierarchies that are **adjacency lists** (a `parent_id` on the row) are simple and every
query over them is a recursive traversal whose cost grows with depth. Where the depth is
bounded and small — org charts under a company, category trees under a root — the two
better shapes are a **materialised path** (`path TEXT` holding `/1/14/207/`, with
`LIKE '/1/14/%'` for subtree queries, at the cost of rewriting the path on every move) and
a **nested set** (`lft`, `rgt`, subtree in one range scan, at the cost of a full-table
rewrite on every move and a much harder concurrent-write story). The adjacency list wins
when the tree is *shallow and rarely restructured*, which is most of them. A
closure table (`ancestor_id`, `descendant_id`, `depth`) is the general answer when the
hierarchy is genuinely deep and moves often, and it is also the shape that shards
cleanly, because the subtree of a node is a contiguous set of rows by `descendant_id`.

> **SCALING REALITY CHECK**
>
> An adjacency list costs one index lookup *per level* of the traversal. A 12-level
> management hierarchy queried top-down is 12 round trips, and each is a separate
> B+ tree descent on a 1.2-million-row `employees` table. If the query is on a page
> render path, that is 12 × 0.4ms of index I/O plus 12 × the planner's row estimate
> compounding, and it will show up as a p99 problem while the average looks fine —
> because the p99 request is the one whose manager chain happens to be the deep one. The
> number at which it stops being acceptable is about four levels on a latency-sensitive
> path.

### 2.5 The Polymorphic Association Problem

This is the modelling problem that most often produces a schema nobody wants to maintain.
The requirement: an `activity` table must be able to say "customer 42 did something to
*an order, an invoice, or a credit note*", and you want to query "all activity for order
900" without three queries.

```text
  THE IMPOSSIBLE TABLE
  ┌──────────┬────────────┬─────────────┬──────────────┬─────────────┐
  │ id       │ actor_id   │ target_type │ target_id    │ verb        │
  ├──────────┼────────────┼─────────────┼──────────────┼─────────────┤
  │ 1        │ 42         │ 'order'     │ 900          │ 'viewed'    │
  │ 2        │ 42         │ 'invoice'   │ 77           │ 'paid'      │
  │ 3        │ 51         │ 'order'     │ 901          │ 'cancelled' │
  │ 4        │ 42         │ 'credit'    │ 12           │ 'issued'    │
  └──────────┴────────────┴─────────────┴──────────────┴─────────────┘
                                    ▲
                                    └── ONE column cannot hold a FOREIGN KEY
                                        to three different tables. This is not a
                                        limitation of any engine. It is what a
                                        foreign key *is*: a guarantee that a value
                                        exists in a specific named relation.
```

**Solution 1 — the nullable triple with a `CHECK`.** The most common answer, and the right
one most of the time.

```sql
CREATE TABLE activity (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id    BIGINT NOT NULL REFERENCES customers (id),
  order_id    BIGINT REFERENCES orders (id),
  invoice_id  BIGINT REFERENCES invoices (id),
  credit_note_id BIGINT REFERENCES credit_notes (id),
  verb        TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Exactly one target, guaranteed.
  CONSTRAINT activity_one_target CHECK (
    (order_id IS NOT NULL)::int
  + (invoice_id IS NOT NULL)::int
  + (credit_note_id IS NOT NULL)::int = 1)
);
CREATE INDEX activity_order_id_idx    ON activity (order_id)    WHERE order_id IS NOT NULL;
CREATE INDEX activity_invoice_id_idx  ON activity (invoice_id)  WHERE invoice_id IS NOT NULL;
```

The cost, stated honestly: **every new target type is a migration** — a new nullable
column, a new FK, a new index, and a change to the `CHECK`. And every query has to know
which column to look at, so "all activity for a customer" is a `UNION ALL` of three
queries rather than one. That is not a defect, it is the price of the referential
integrity you kept, and the price is worth paying precisely because the alternative
(loose `target_type`/`target_id` pairs) throws it away. Notice the partial indexes: with a
`WHERE order_id IS NOT NULL` predicate, an `activity` row that is not about an order takes
up no index space at all, which matters when you have 50 million rows and 40% are
invoices.

**Solution 2 — a supertype/table-per-hierarchy.** Make `orders`, `invoices` and
`credit_notes` all children of a common `document` table, and point `activity` at
`document`.

```sql
CREATE TABLE document (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  kind        TEXT NOT NULL CHECK (kind IN ('order', 'invoice', 'credit_note')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- orders.document_id is UNIQUE and REFERENCES document(id).
-- invoices.document_id is UNIQUE and REFERENCES document(id).
-- credit_notes.document_id is UNIQUE and REFERENCES document(id).
CREATE TABLE activity (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id BIGINT NOT NULL REFERENCES document (id),
  verb        TEXT NOT NULL,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

One FK, one index, one query pattern, and adding a fourth document type is a new child
table with no change to `activity`. The costs: an extra join on every read of an order
(the `kind` discriminator has to be joined back to get order attributes), no ability to put
a foreign key *from* `activity` to the child, and a modelling claim — "an order is a kind
of document" — that has to be true for the whole system or the abstraction leaks.

**Solution 3 — a real association table.** `activity_target(activity_id, target_id)` where
`target_id` references a union table. This is Solution 2 with an indirection for the case
where one activity touches *several* targets. The read model needs a type discriminator to
join back, so it costs the same join as Solution 2 and adds a table.

**Solution 4 — accept the loose pair, and own it.** `target_type TEXT`, `target_id BIGINT`,
no FK, plus a dispatch table in application code that knows how to fetch each. This is
legitimate in exactly two situations: the target set is genuinely open-ended and will keep
growing, and the association is *decorative* (an audit line, a notification fan-out
record) where a dangling reference is harmless. It is illegitimate the moment anything
deletes a target — at which point you have discovered that you need a soft-delete
convention and an orphan sweeper, and you have traded a `FOREIGN KEY` for two jobs and an
alert.

> **TRADE-OFF — "NULLABLE TRIPLE OR A COMMON SUPERTYPE?"**
>
> The condition that decides it is **how often the set of target types will change, and
> whether the target types share attributes you query together.**
>
> Nullable triple wins when the set is *stable* — three to five types, known, unlikely to
> grow. You get full referential integrity on every target, no extra join on the hot path,
> and a `CHECK` that makes the "exactly one target" rule a database guarantee rather than
> an application convention. Its cost is linear in the number of types: each new one is a
> migration plus a new index plus a new branch in every query.
>
> Supertype wins when the types are *conceptually one thing* (all three are financial
> documents, all three are content items, all three are a "listing" on a marketplace) and
> the set will grow. Adding a fourth type is a new child table and nothing else, and any
> query "all activity for any document in set X" is a single join. Its cost is an extra
> join on every read of every document, and a modelling commitment that the abstraction is
> real.
>
> The trap in answering this badly is reaching for Solution 4 because it is the least work
> today. The loose pair is a permanent loss of a guarantee, and the moment someone deletes
> an invoice the activity row points at nothing and nothing complains.

### 2.6 When a Table Should Be a Value Object

A *value object* has no identity of its own: two rows with the same values are
interchangeable, it is compared by value, and it cannot be referenced independently. An
address on a customer, a line on an order, a set of permissions, a period of a
subscription. The correct home for a value object is a table with a composite primary key
that includes its owner's key, and an `ON DELETE CASCADE` — because "this value exists"
is meaningless independently of the thing it belongs to.

```sql
CREATE TABLE customer_address (
  customer_id  BIGINT NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  address_kind TEXT   NOT NULL CHECK (address_kind IN ('SHIPPING', 'BILLING', 'OTHER')),
  line1        TEXT   NOT NULL,
  line2        TEXT,
  city         TEXT   NOT NULL,
  postcode     TEXT   NOT NULL,
  country_code CHAR(2) NOT NULL,
  valid_from   TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to     TIMESTAMPTZ,
  -- Partial uniqueness: exactly one current SHIPPING address per customer,
  -- unlimited historical ones. This is a temporal constraint (Chapter 3)
  -- expressed as an index, and it is the only way to express it.
  CONSTRAINT customer_address_pk PRIMARY KEY (customer_id, address_kind, valid_from)
);
CREATE UNIQUE INDEX customer_address_one_current_shipping
  ON customer_address (customer_id, address_kind) WHERE valid_to IS NULL;
```

The tell that a table *should* have been a value object is that it has a surrogate key and
no other table references it. If nothing points at `address.id`, the ID is a fiction, and
it is a fiction that will one day be used — by a report, an audit table, a cache key, or a
bad decision. Value objects get inlined into their owner as columns when they are truly
one-to-one, one-to-many with no independent query pattern, and short — a `billing_address`
block of six `TEXT` columns on `customers` is usually the right call and is not
denormalisation, because those are not a repeated fact; they are a *composition*.

> **MUST REMEMBER**
>
> The polymorphic association is not a SQL limitation to be worked around — it is the
> foreign key refusing to lie. One column cannot point at three relations, and any design
> that lets it (a `type` string plus a bare `id`) has chosen to remove a guarantee rather
> than to solve a modelling problem. When you pick the nullable triple, the `CHECK` is
> what makes it a design rather than a convention, and the partial indexes are what keep
> it from costing three index entries per row.

#### Common Mistakes

- Calling a relationship 1:1 when a second row is possible — `customers.address_id` with no
  `UNIQUE`, and the second address arrives as a production incident
- Putting a `UNIQUE` on the "one" side of a 1:1 *and* allowing the child to be created
  independently, producing two nullable FKs and a state where both are set
- Forgetting the reverse index on an N:M join table, so "which orders contain this product"
  is a full scan of the join table
- Putting the *current* price on the product instead of the price on the line, so every
  historical invoice rewrites itself when the catalogue is repriced
- Writing an adjacency list with no cycle prevention, so `manager_id = id` is one bad
  `UPDATE` away from an infinite recursive traversal
- Solving the polymorphic association with `target_type`/`target_id` and no foreign key,
  which means a deleted target is a silent orphan
- Giving a value object a surrogate key, which is an invitation to reference it later and
  to have to handle that reference forever

#### Interview Questions — Relationships

**P1. A customer has, in production, four shipping addresses and a test in the suite that
asserts one. The `UNIQUE` was added in a migration six months ago and the migration
"passed". How does that happen, and what is the fix?** `STAFF`

The migration "passed" because the suite ran against a database that did not have the
duplicate data, or — more likely and more interesting — because the constraint was added in
a form that does not actually enforce uniqueness over the rows that exist. In PostgreSQL,
adding a `UNIQUE` to a column with duplicates fails loudly, so the real mechanism is
usually one of three: the `UNIQUE` was added as a `CREATE UNIQUE INDEX CONCURRENTLY` that
failed on duplicates and the failure was swallowed by the migration runner; the constraint
was added to a *partial* index with a `WHERE` predicate that excluded the offending rows
(which is a real and defensible engineering decision that nobody documented); or the
duplicates were created after the constraint, through a code path that disables
constraints, a `COPY`-style bulk load into a staging table followed by a `SET
session_replication_role = replica` insert, or a replica that had the constraint removed to
speed up replay. The fix is not "remove the duplicates" — it is to find out which of those
three created them, because two of the three are still running. Then decide, per duplicate,
which is canonical, write the others into a history table rather than deleting them, and only
then create the constraint. The prevention is that a uniqueness constraint on customer-visible
data needs a data-quality query run *before* the migration is written, and the migration
needs a documented rollback that does not involve dropping the constraint.

**D1. You are designing the audit log for a system with 12 entity types that can all be
acted on. Walk me through how you model "actor did verb to target" and what you would tell
the team about the migration cost of your choice.** `STAFF`

The first question is not technical: are the 12 types conceptually one thing? If they are
all "documents" in the business's language — invoice, credit note, order, quote, all
things a finance team would call paperwork — then the supertype is the honest model. One
`document` table with a `kind` discriminator, twelve child tables each with a `UNIQUE`
`document_id`, and `activity.document_id` as a single foreign key. Adding a thirteenth
type is one child table and a code change in the type registry; the `activity` table, its
index, and every query against it are untouched. The costs I would state unprompted: every
read of any document now costs one extra join to get the discriminator, the 1:1 child
relationship must be enforced by a `UNIQUE` on each child, and the model commits the team
to "these twelve things really are the same kind of thing" — which is a modelling claim
that gets harder to defend when type thirteen turns out to be a `refund`, which is
sometimes a document and sometimes an adjustment to a document.

If instead the types are *not* conceptually unified — say four are documents, four are
users, four are assets — then the supertype is a fiction and the nullable triple is right.
Four nullable FK columns, a `CHECK` that exactly one is set, a partial index per column,
and the honest statement to the team: "each new type we add costs one nullable column, one
FK, one partial index, a migration, and a new branch in every query that wants
cross-type activity. That is the price of the referential integrity we keep. If we drop
the FKs and use a `type`/`id` pair, the migration cost per type goes to zero and we lose
the ability to ever detect a dangling reference — so the question for the team is which
one we are buying."

The staff-level addition, which is the thing an interviewer is listening for: I would want
to know what the *read* requirements are before choosing. If the dominant query is "all
activity on this one document", both designs are one index probe. If the dominant query is
"all activity by this actor across all types", the supertype is one indexed scan and the
triple is a four-way `UNION ALL` — same answer, four plans, four latency floors. And
whichever I pick, the partition decision comes next, and the partition key is `occurred_at`
for the activity table regardless of the choice, which is Chapter 5.

**T2. `orders` has 400 million rows and `order_line` has 2.1 billion. You run
`SELECT count(*) FROM orders o JOIN order_line l ON l.order_id = o.id WHERE o.status =
'PENDING'`. What does the planner most likely do, and what is the number that decides
whether it is right?** `ADVANCED`

Two things are being estimated, and one of them is usually wrong. The planner estimates how
many `orders` rows have `status = 'PENDING'` from `pg_statistic`, and then — if it chooses
a nested loop over `order_line` with an index probe on `l.order_id` — it estimates how many
lines each pending order has, which it derives from a *global average* unless it has
correlated statistics. If pending orders are 2% of 400 million, that is 8 million probes
into a 2.1-billion-row index, and each probe is a B+ tree descent. The alternative plan is
a hash join over a full scan of `order_line`, which is 2.1 billion rows and roughly 200GB
of sequential I/O. The planner picks between "8 million random index probes" and "one
enormous sequential scan", and it is picking on an estimate of 8 million probes, not on
what they will actually cost.

The number that decides it is the ratio of *pending* to *all* orders, because that is what
the nested loop's cost scales with. Under about 1%, the nested loop wins and the query is
fine. Above roughly 5–10%, the probe count is in the tens of millions, each one a random
read against a 2.1-billion-row index that does not fit in cache, and the query becomes an
I/O storm. Above that, the honest answer is that the query is asking for a data structure
you do not have: you want a partial index on `orders` `WHERE status = 'PENDING'` so the
8 million rows are contiguous, and then a join that goes the other way — scan those 8
million order IDs and probe `order_line` in *batches* with a `= ANY(array)` or a merge
join on a sorted input. Which is the general shape of the fix: when a filter selects a
small fraction of a large table, materialise the small fraction, sort it, and merge.

**S1. A PR adds a `foreign key (product_id) references products(id)` to a 900-million-row
`order_line` table. What is the reviewer's actual objection?** `ADVANCED`

Three, in order. First, `NOT VALID`: adding a validated foreign key to a 900-million-row
table takes a `SHARE ROW EXCLUSIVE` lock — which blocks every `INSERT`, `UPDATE` and
`DELETE` on the table — for the duration of a full scan of both the referencing table and
the referenced one. On a table taking 4,000 inserts/second that is a write outage measured
in hours, and it is the single most common way a schema migration takes down a service. The
correct form is `ADD CONSTRAINT ... FOREIGN KEY ... NOT VALID`, which takes a much weaker
lock and checks only *new* rows, followed by a separate `VALIDATE CONSTRAINT` which takes
`SHARE UPDATE EXCLUSIVE` — a lock that does not block reads or writes. So the reviewer
blocks the PR until it says `NOT VALID`, and asks where the `VALIDATE` is scheduled, because
that is a separate operation with its own lock and its own runtime and it is routinely
forgotten.

Second, the missing `(product_id)` index. The FK is a business-rule statement, not a
performance one, and PostgreSQL does not create the index — so after this migration every
cascade and every parent-side check is a sequential scan of a 900-million-row table. The
index has to be created `CONCURRENTLY` and it is a large object that the migration needs to
account for in its disk budget.

Third, and this is the staff-level point: the team should decide, in the PR, whether
`ON DELETE` behaviour is `RESTRICT`, `CASCADE`, or `SET NULL`, because the default in
PostgreSQL is `NO ACTION` which behaves like `RESTRICT` but is deferrable, and the
difference matters enormously for a product that is about to be deleted. A reviewer who
raises "you have not said what happens when a product is deleted, and your application
probably expects one of these" is making the comment that prevents an incident six months
out.

> **CHAPTER 2 SUMMARY**
>
> Relationship modelling is mostly placement: a 1:1 puts its key on the side whose row is
> created second, a 1:N puts its key on the many side and indexes it (a foreign key does
> not), and an N:M becomes a join table that carries the *relationship's own attributes* —
> which is why the price lives on the line and not the product. The genuinely hard case is
> the polymorphic association, and the right answer is never "add a `type` string and drop
> the foreign key": it is a `CHECK`-constrained set of nullable FKs with partial indexes
> when the target set is stable, a supertype when the targets are conceptually one thing
> and will grow, and a loose pair only when the set is truly open-ended and a dangling
> reference is harmless. Every one of those choices names a cost, and the candidate who
> states the cost before being asked is the one being hired.

#### Further Reading

- [PostgreSQL — Foreign Keys](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FOREIGN-KEYS) — the constraint, the `MATCH` options, and the `NOT VALID` two-step migration pattern.
- [PostgreSQL — Self-Referencing Foreign Keys](https://www.postgresql.org/docs/current/ddl-fk.html) — the official treatment, including the delete and update actions.
- [Use The Index, Luke — Foreign Keys Need Indexes](https://use-the-index-luke.com/foreign-keys/) — why the constraint does not create the index, and the cascade cost that follows.
- [PostgreSQL — Check Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS) — the mechanism behind the "exactly one target" rule, and why `NOT VALID` applies to checks too.
- [Martin Fowler — Patterns of Enterprise Application Architecture — Mapping to Relational Databases](https://martinfowler.com/eaaCatalog/EAAStrategies.html) — the reference treatment of association patterns including the single-table inheritance alternative.

## Chapter 3 — Temporal & Historical Data

The question this chapter answers is one almost no interview rubric lists, and it is the
question that determines whether a system can ever answer "what did this look like last
March". A schema is a statement about the present. A business almost always wants a
statement about time, and there are exactly three shapes for that, plus a fourth that
almost nobody designs on purpose and everybody needs.

### 3.1 The Range Representation, and the Half-Open Invariant

The representation is not the interesting part; the invariant is. A time range on a row is
stored as `valid_from` and `valid_to`, and there is one rule that has to hold for every
temporal table in the system or every query written against it is subtly wrong:

```sql
-- A temporal row. valid_to IS NULL means "still current" and means
-- infinity — never 'now' written into the column, and never a sentinel date.
CREATE TABLE customer_address_version (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  customer_id   BIGINT      NOT NULL REFERENCES customers (id) ON DELETE CASCADE,
  address_kind  TEXT        NOT NULL,
  line1         TEXT        NOT NULL,
  city          TEXT        NOT NULL,
  postcode      TEXT        NOT NULL,
  country_code  CHAR(2)     NOT NULL,
  valid_from    TIMESTAMPTZ NOT NULL,
  valid_to      TIMESTAMPTZ
);

-- The half-open invariant, stated as a constraint: every row is
-- [valid_from, valid_to), so a row ending at 10:00:00 and a row
-- beginning at 10:00:00 do NOT overlap.
CREATE INDEX customer_address_version_lookup
  ON customer_address_version (customer_id, address_kind, valid_from DESC)
  WHERE valid_to IS NULL;
```

Three conventions, each of which prevents a specific class of bug:

- **Half-open intervals: `[from, to)`.** This is not a preference. With closed intervals
  `[from, to]`, a change at exactly 10:00:00 produces two rows that both contain 10:00:00,
  and "what was true at 10:00:00" has two answers. With half-open intervals it has one,
  and adjacent changes tile the timeline exactly with no gap and no overlap.
- **`valid_to IS NULL` means infinity, not "now".** Writing `now()` into the column at
  close time means you have to remember to update it, you cannot express a row that is
  current, and any query joining on `valid_to > some_time` silently misses open rows. The
  `NULL` costs you a `COALESCE` in a few queries and buys you a "currently true" query that
  is a single index probe.
- **Timestamps are `TIMESTAMPTZ`, always, and they are UTC inside the engine.** The
  conversion to local time happens in the presentation layer, and the column name ends in
  `_at` to say so. A `TIMESTAMP WITHOUT TIME ZONE` in PostgreSQL stores a wall-clock
  reading with no offset, and it is wrong for every row written more than one timezone
  away from whoever wrote it.

The overlap-prevention constraint is worth knowing by name, because it is the difference
between a temporal table that is merely *shaped* right and one that is *enforced* right. In
PostgreSQL, `btree_gist` plus an exclusion constraint makes overlap impossible at the
database level:

```sql
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE customer_address_version
  ADD CONSTRAINT no_overlapping_address_versions
  EXCLUDE USING gist (
    customer_id  WITH =,
    address_kind WITH =,
    tstzrange(valid_from, COALESCE(valid_to, 'infinity'), '[)')
        WITH &&
  );
```

That is the only mechanism in any mainstream engine that makes "these two rows overlap"
*impossible* rather than unlikely. Without it, overlap prevention is a `SELECT` for
conflicts inside the write transaction — which works, serialises concurrent writers to
the same key, and has to be written correctly by hand at every call site.

### 3.2 SCD Type 1 — Overwrite, and the One-Way Door

**Slowly Changing Dimension Type 1** is: on change, `UPDATE` the row. The old value is
gone.

```sql
-- SCD Type 1. One row per customer, forever. The previous postcode
-- ceases to exist the instant this runs.
UPDATE customers
   SET postcode = 'SW1A 1AA', updated_at = now()
 WHERE id = 42;
```

This is the default in almost every application, it is correct for the large majority of
data, and it is *free*. There is no write amplification, no extra rows, no query changes —
`SELECT * FROM customers WHERE id = 42` returns exactly the current state and there is
nothing to think about.

The cost is a single fact: **Type 1 cannot answer a question about the past.** Not "it is
expensive to answer", not "you would need a slow query" — *it cannot answer it at all*. The
value is gone. Once the postcode is overwritten, no query over this table, no index on it,
and no amount of hardware will tell you what the postcode was on the day the invoice was
issued.

> **INTERVIEW TRAP — "WE LOG ALL THE UPDATES, SO WE HAVE HISTORY"**
>
> This is the most common way teams believe they have solved temporal data when they have
> not, and the belief is expensive because it prevents the right decision being made at the
> right time. The claim only holds if:
>
> - The log captures the **whole row before the write**, not just which row changed. A
>   log of `(customer_id, 'postcode', 'old_value')` is a change log, and reconstructing
>   "what was the full state at time T" from it requires knowing which columns existed at
>   T and in what order they were applied — which is a temporal database you have built by
>   accident, in the least-tested part of the system.
> - The log is **durable and queryable at the same fidelity as the base table**. A log
>   shipped to a data warehouse on a 15-minute batch, or sampled, or retained for 30 days,
>   does not support a compliance question about a transaction from 14 months ago.
> - Nobody can **change or delete** the log. An audit log that the application can write to
>   is not an audit log.
>
> The honest framing for a design review: an application-level change log is a reasonable
> thing to have, and it is not a substitute for the schema being able to represent history
> in the same transaction as the write. The reason it is not a substitute is atomicity —
> the moment you maintain history *outside* the transaction that changes the row, you have
> a dual-write, and a dual-write that fails halfway is a system that believes the address
> changed when it did not, or the reverse.

### 3.3 SCD Type 2 — Version Rows, and Its Actual Cost

**Type 2** is: on change, close the current row and insert a new one. Nothing is
overwritten.

```sql
-- SCD Type 2, written correctly: the close and the insert are ONE statement,
-- so there is no window in which the customer has two current rows or none.
WITH closed AS (
  UPDATE customer_address_version
     SET valid_to = now()
   WHERE customer_id = 42
     AND address_kind = 'SHIPPING'
     AND valid_to IS NULL
  RETURNING customer_id, address_kind, line1, city, postcode, country_code, valid_from
)
INSERT INTO customer_address_version
  (customer_id, address_kind, line1, city, postcode, country_code, valid_from, valid_to)
SELECT customer_id, address_kind, line1, city, 'SW1A 1AA', country_code, now(), NULL
  FROM closed;
```

**What Type 2 buys:** "what was true at time T" is a single index probe. `WHERE
customer_id = 42 AND valid_from <= T AND (valid_to > T OR valid_to IS NULL)` uses the
`(customer_id, valid_from DESC)` index and reads one row. Auditors can be answered.
Reconstructing a historical invoice is a join, not an archaeology project.

**What Type 2 costs, all of which are real:**

- **Row count multiplies by the number of changes, not by the number of entities.** A
  customer who moves eleven times has twelve address rows. The table's growth rate becomes
  the *change* rate, which for some entities is orders of magnitude higher than the create
  rate. This is the cost people do not model, and it is why Type 2 on a high-churn table
  needs a retention policy (which means Type 2 combined with partitioning, and the
  partition boundary is the retention mechanism — Chapter 5).
- **Every read needs "the current one" logic.** `SELECT * FROM customer_address_version
  WHERE valid_to IS NULL` is right for the current state and *wrong* for the history query.
  Two different queries, and the current-state one is the one that has to be on the partial
  index, because the history table's cardinality is the problem.
- **The natural key is no longer unique.** `(customer_id)` is no longer a key. Every
  consumer that assumed one-row-per-customer — a `JOIN` that fans out, an `INSERT ...
  SELECT` that assumed cardinality, a report that counts customers — now has a bug. This
  is a **grain change**, and Volume 1 Chapter 5's lesson applies directly: state the new
  grain ("one row per address version, one open row per customer per kind") or you will
  debug a join fan-out as a SQL bug.
- **Foreign keys get harder.** If `orders` references the address version, the FK is now to
  a row that will be closed, and the "current" address is a moving target. The usual
  resolution is for the order to copy the address at time of purchase (which is not
  denormalisation; it is a temporal fact about the relationship — Chapter 2).

> **TRADE-OFF — "WHICH SCD TYPE?"**
>
> The question that decides it is: **what is the smallest time window somebody will ask a
> question about, and who is allowed to ask it?**
>
> Type 1 is right when there is no such question — a user's display name, a cached count, a
> product's description. Nothing outside the product team needs to know what it used to be.
>
> Type 2 is right when the answer is required by a person, an auditor, or a customer
> dispute, and the answer must be exact. Insurance, banking, healthcare, any regulated
> billing, anything with a chargeback. The window that triggers it is usually "the last
> seven years" and the requester is usually someone who can escalate.
>
> Type 3 is almost never right on its own and is worth naming so you can rule it out. It
> stores history in *columns* on the current row — `postcode_current`,
> `postcode_previous`, `postcode_previous_2` — so you can answer "what is it now, what was
> it, and what was it before that" with one row. It cannot answer anything past the number
> of columns you allocated, it widens every row on every update, and it is genuinely used
> in two situations: fast-changing dimensions in a warehouse where only the last few states
> matter, and slowly-changing *attributes* that must not move the row. Its failure mode is
> structural — the third column is populated by an `UPDATE` that a future maintainer
> reorders, and then the history is silently wrong.

### 3.4 Bitemporal Records, and Why They Exist

There is a second kind of time, and it is the one people discover they need *after* an
audit.

```text
  ONE TIMELINE (transaction time)          TWO TIMELINES
  ────────────────────────────────          ────────────────────────────────
  "we believed this was true"               "we believed this was true"
       │                                          │
  valid_from ──────── valid_to                 valid_from ──────── valid_to
  the TRUTH's timeline                      the TRUTH's timeline
                                                       │
                                        recorded_from ──── recorded_to
                                          the KNOWLEDGE's timeline
                                          (when WE learned it)
```

Consider: on 12 March, a customer's postcode was `E1 6AN`. On 20 March we received a
retroactive correction saying it had been `E1 6JF` since 1 January. A single timeline
cannot represent this. What we want to say is: "the truth changed on 1 January, but we did
not *know* that until 20 March. So as of any date between 1 and 20 January, a report
produced *today* should still show `E1 6AN`, and a report produced on 5 January would also
have shown `E1 6AN` — and the two must be identical, because nothing was known."

```sql
-- Bitemporal: four timestamps, and the row is a statement about a
-- (truth-interval, knowledge-interval) rectangle.
CREATE TABLE customer_postcode_history (
  customer_id  BIGINT      NOT NULL,
  postcode     TEXT        NOT NULL,
  -- the truth timeline
  valid_from   TIMESTAMPTZ NOT NULL,
  valid_to     TIMESTAMPTZ NOT NULL,
  -- the knowledge timeline
  recorded_from TIMESTAMPTZ NOT NULL,
  recorded_to   TIMESTAMPTZ,
  CONSTRAINT bitemporal_pk PRIMARY KEY (customer_id, valid_from, recorded_from),
  CONSTRAINT truth_ordered    CHECK (valid_to > valid_from),
  CONSTRAINT knowledge_ordered CHECK (recorded_to IS NULL OR recorded_to > recorded_from)
);
```

The payoff is the "as-of" query that no single-timeline design can answer:

```sql
-- "What did the system believe on 5 January, about the truth on 3 January?"
-- Two axes of 'as of'. This is the query that a financial regulator
-- eventually asks for and that a Type 1 or Type 2 schema cannot produce.
SELECT postcode
  FROM customer_postcode_history
 WHERE customer_id = 42
   AND valid_from   <= '2026-01-03' AND valid_to     >  '2026-01-03'
   AND recorded_from <= '2026-01-05' AND (recorded_to IS NULL OR recorded_to > '2026-01-05');
```

The cost is a fourth timestamp, a `UNIQUE` constraint on a four-column key, and — the part
that actually hurts — **a closed knowledge interval on every correction, which means
`UPDATE` on a row that a prior report already used.** You are not updating a value; you
are *retracting a statement*, and a report already generated from it is wrong in a way you
cannot fix. Which is the honest cost of bitemporality: it makes the system's epistemic
history auditable, and in exchange it makes the system's *epistemic history itself*
subject to retraction. Very few systems need it. The ones that do are banks, insurance,
and anything where a regulator can ask what you knew when.

> **PRODUCTION SCENARIO**
>
> Problem: a quarterly regulatory report produced on 1 April reported the wrong balances
> for 1,400 accounts, and re-running it the next day produced different numbers. Nobody
> changed the source data.
> Investigation: the report reads a Type 2 history table and takes the row current *as of
> the report date*. Over the weekend, a bulk job backdated 1,400 postcode corrections with
> effective dates in the preceding quarter, inserting history rows whose `valid_from` was
> in the past. The query is correct; the *data* is not.
> Root cause: the backfill inserted retroactive history without any record of when the
> correction was received, so the schema cannot distinguish "we always believed this" from
> "we learned this on Saturday", and a report that is supposed to reproduce what was known
> at a point in time cannot.
> Solution: the backfill was re-run with bitemporal `recorded_from` set to the job's
> execution time, and the report query was changed to take an explicit `as_of_known_at`
> parameter, defaulting to the original reporting date. The re-run reproduced the original
> numbers exactly.
> Prevention: no retroactive correction may be applied without a recorded time, enforced by
> making the knowledge-timeline columns `NOT NULL` in the table definition rather than in a
> convention, and adding a check that the bulk job's `recorded_from` is never earlier than
> its own start.

### 3.5 Temporal Tables and Native Support

Not every engine's temporal support is created equal, and the categories matter because
they change what you have to build.

| Kind | What it is | Engines |
| --- | --- | --- |
| **Time-travel / snapshot** | Query the table as it was at a past point, engine-managed | SQL Server `SYSTEM_TIME` (temporal tables), Oracle Flashback |
| **History tracking** | Versions captured automatically on change | SQL Server `SYSTEM_VERSIONING` |
| **Period types** | A first-class range type with operators | PostgreSQL `tstzrange`, `daterange` — plus `btree_gist` for exclusion constraints |
| **None** | You build it | everything else, including MySQL |

```sql
-- PostgreSQL: the period type makes the "as of" query a range operator
-- rather than a pair of comparisons, and — more importantly — makes
-- the exclusion constraint in 3.1 expressible at all.
SELECT postcode
  FROM customer_postcode_history
 WHERE customer_id = 42
   AND tstzrange(valid_from, valid_to, '[)') @> TIMESTAMPTZ '2026-01-03 00:00:00+00';
```

The PostgreSQL-specific point worth having ready is that `tstzrange` is not only a query
convenience — it is a **constraint** convenience. The `@>` operator gives you the as-of
query; `&&` plus `EXCLUDE USING gist` gives you the guarantee that no two versions overlap.
A schema written with plain timestamps and an application-level overlap check has *no*
database-enforced version of that guarantee, and the check is in the code that runs least
often.

MySQL has none of this — no period types, no `EXCLUDE`, no system versioning — so a MySQL
Type 2 implementation maintains `valid_to` in application code or a trigger, and the
overlap invariant is a convention. That is a real difference between the engines and it
belongs in the answer when someone asks "how would you do temporal data in our stack".

> **MUST REMEMBER**
>
> SCD Type 1 is not a weaker version of Type 2; it is a **permanent, unrecoverable
> decision to be unable to answer questions about the past.** There is no index, no
> hardware, and no later migration that recovers an overwritten value. The cost of moving
> from Type 1 to Type 2 *after* the fact is a backfill of a history you never recorded, and
> the history you did not record cannot be reconstructed from the current rows. That is why
> the decision is a one-way door, and why the question to ask in a design review is not "do
> we need history" but "**who will be the first person to ask, and will they be
> contractual?**"

#### Common Mistakes

- Storing closed intervals as `[from, to]` rather than `[from, to)`, so a change at an
  exact instant has two correct answers
- Writing `now()` into `valid_to` on close instead of leaving `NULL` for "current", which
  makes "give me the current row" a full scan or a sentinel-date comparison
- Using `TIMESTAMP` rather than `TIMESTAMPTZ` for business timestamps, and only finding out
  at the first timezone or DST boundary
- Believing an application change log substitutes for a temporal schema, and discovering
  during a dual-write failure that the two can disagree
- Applying Type 2 to a high-churn table and then being surprised that the history table has
  40× the rows — the growth rate is the *change* rate, not the create rate
- Changing the grain when moving to Type 2 (one row per version, not per customer) without
  updating the schema documentation, and debugging a join fan-out as a SQL problem
- Overwriting a Type 1 value and believing a backup covers it — a backup is not a history;
  it is a coarser version of one, and it is not queryable as "what was true at T"

#### Interview Questions — Temporal Data

**D1. A payments company must be able to answer, two years from now, "what did this
customer's billing address look like when this charge was made, and what did *our system
believe* it to be at the time?" Pick your schema and defend it.** `STAFF`

That second clause is the whole question, and it is the clause most candidates skip — the
first half is a Type 2 problem, the second half is bitemporal, and answering only the first
half is a mid-level answer. I would build it bitemporally and say why in one sentence: a
single timeline cannot distinguish the truth changing from our knowledge of the truth
changing, and the second is exactly what a regulator asks about when a dispute arises six
months after a retroactive correction. Concretely, a `billing_address_history` keyed on
`(customer_id, valid_from, recorded_from)` with four timestamps, a `CHECK` on each interval
ordering, and the whole thing in one table with a `UNIQUE (customer_id, valid_from,
recorded_from)` — because a corrective entry is *not* an update, it is a new statement
about a past interval.

The `charge` row carries its own copy of the address as it was at charge time, and I would
be explicit that this is not denormalisation: updating the current address does not require
updating historical charges, because a charge's address is a fact about the charge, not
about the customer. Volume 1's rule — store a fact once if updating it requires updating it
in one place — does not fire here, and being able to explain why is the point of the
question.

The costs I would state unprompted: a four-column key means every index is wider; a
retroactive correction closes a knowledge interval on a row that a previously-generated
report already used, which means the system can retract a statement it has already made
and cannot fix the report already sent; the query is two range operators on an index, so
it needs `(customer_id, valid_from, recorded_from)` in that order and the "as of
knowledge" axis will not be a leading column; and the table's growth rate is the
*correction* rate, which for addresses is low but for, say, exchange rates is enormous —
which is why exchange rates in a system like this are also partitioned by `valid_from`
month and the ones older than the statutory retention window are dropped.

The staff-level addition: I would ask the team who can *retract* a knowledge interval, and
I would want that answer to be a small, audited, named list rather than "anyone with write
access to the table". A bitemporal table where application code can freely close
`recorded_to` is a table where the second half of the question has a weak answer.

**T2. You move a table to SCD Type 2. The very next deploy, a query that used to return
one row per customer now returns four for 30% of customers. Nothing threw. What is the
bug, and where else will it show up?** `ADVANCED`

It is a grain change, and it is exactly the failure Volume 1 Chapter 5 predicts. The table
grain went from "one row per customer" to "one row per customer per address version", and
`customer_id` stopped being a key. Every query written against the old grain is now
wrong in a way that depends on the data: for a customer who has never moved, four rows
become one and nothing looks wrong; for a customer who has moved three times, four rows
become four. That is the worst class of bug — data-dependent, silent, and correlated with
exactly the customers who are the most active, so it will show up in the support queue for
your best users first.

The places it will surface, in the order they usually surface: (1) any `SELECT ... GROUP BY
customer_id` whose aggregate is a `SUM` or `COUNT` of a column on the now-versioned table,
which is now multiplied by the version count; (2) any `INSERT ... SELECT` from this table
into a snapshot or export table, which silently writes four rows per customer; (3) any
`LEFT JOIN` from a child table to this one on `customer_id` alone, which now fans out by
version count and inflates every aggregate downstream of it; (4) `DISTINCT` added as an
emergency fix, which hides the fan-out in that query and leaves it in the twelve other
queries with the same shape; (5) the ORM layer, where a `@OneToOne` or a
`@ManyToOne` that assumed a single result now either throws `NonUniqueResultException` —
loud, therefore already found — or returns a `List` where the code expected one object —
quiet, therefore not yet found.

The fix is not to add `DISTINCT`. The fix is to add the missing predicate — `WHERE
valid_to IS NULL` for current state, or a `tstzrange(...) @> :as_of` for history — at
every site that wants one row, and to write the new grain in the table comment so the next
person reads it before writing the query.

**S1. A PR adds a temporal-history table to hold every change to a customer profile, and
it maintains the history from a `Kafka` consumer. Review it.** `STAFF`

The blocking objection is that the history write is not in the same transaction as the
change, and therefore cannot be correct. The profile is updated by the API service; the
history is written by a consumer reading the outbox or the WAL. Between the two there is a
window — bounded by the consumer lag, but a window — in which a query against the history
table returns the old state for a customer whose current state has already changed. If
anything in the system reads the history for an "as of now" answer, that reader is wrong
during the window, and the error is not loud.

The second objection is that the history table is derived data with no authority, and the
review needs to establish which one is authoritative when they disagree. If the base table
is authoritative, the history table is a projection and the report should read the base
table for current state — in which case why does the history table exist, and the answer
must be "for the as-of queries that the base table cannot answer", which is a good answer
and should be written down. If the history table is authoritative for anything, the
consumer needs an idempotency key and a replay story, because it will receive the same
event twice.

The third objection is granularity: does the history row store the whole row or just the
changed field? Whole row, always — a changed-field history cannot reconstruct a state,
because reconstructing a state requires knowing the values of the fields that did not
change at that point, which requires either a full row or a replay of the entire change
log in order. If the PR stores changed fields only, ask what the "as of T" query does and
listen for whether the answer is "we replay the log" without mentioning that the log's
own retention is shorter than the as-of window.

The fourth, and the one worth raising last because it is the most expensive to fix: the
partition and retention plan. A history table has no natural upper bound, and the obvious
design — a row per change, forever — produces a table that is mostly dead weight whose only
use is queries older than any realistic customer dispute window. The PR should say what the
retention period is and how it is enforced, and the enforcement mechanism is a partition
drop (Chapter 5), not a `DELETE`.

**D2. Your CFO asks for a one-line answer: "if we had to correct last quarter's revenue
number tomorrow, could we?" What do you say, and what is the first thing you change?** `STAFF`

The honest answer is a qualified no, and the qualification is the useful part. "We could
recompute it from the current data if and only if nothing that affects revenue has been
overwritten since — and in our schema, order status, refund amounts and product prices are
all SCD Type 1, so a repricing or a status correction changes history and we cannot
reconstruct the original figure. What we *can* do is recompute a number that is correct as
of today, and that is a different number than the one we reported."

The first thing to change is not the temporal schema — it is deciding which facts are
*reports* and which are *money*. The narrow, cheap, high-value change is to make the
invoice line immutable: `unit_price_cents`, `quantity`, `discount_cents` and the tax rate
on a line, once the invoice is issued, are facts that no correction may overwrite. Correct
the invoice with a *credit note* — a new row that references the original — rather than an
`UPDATE`. That is both the correct accounting model and the Type 2 model, and it happens to
be the answer to the CFO. The second change is Type 2 on anything whose history a
regulator might ask about, and the third is a bitemporal `recorded_at` on the corrections
themselves, so a retroactive fix is visibly retroactive.

The staff-level addition is the process answer, and it is the part a senior candidate
skips: this is a question about *what the business believes its numbers are*, and the
answer to it is a retention policy with a named owner, a documented definition of which
fields are immutable-after-issue, and a quarterly reconciliation that compares the
recomputed-from-history figure against the reported figure. A schema that can answer the
question but no process that ever asks it is a schema nobody maintains, and in two years it
will be wrong anyway.

> **CHAPTER 3 SUMMARY**
>
> Temporal data is a design decision with exactly three answers and a fourth that only
> auditors ask for. Type 1 overwrites and is free until someone asks what the value used to
> be, at which point the information is gone and no migration recovers it — which makes it
> a one-way door and the single most important thing to get right *before* the data
> accumulates. Type 2 closes the current row and opens a new one in the same statement, and
> buys a single index probe for any as-of question at the price of a grain change, a growth
> rate set by the *change* rate rather than the create rate, and a `valid_to IS NULL` on
> every current-state query. Bitemporal adds a second timeline so the system can distinguish
> when the truth was true from when it learned it, which is the only structure that can
> reproduce what a report *would have said* on a past date. Under all three, the
> non-negotiables are half-open intervals, `NULL` meaning infinity, `TIMESTAMPTZ` only, and
> the grain written down in the table comment.

#### Further Reading

- [PostgreSQL — Range Types](https://www.postgresql.org/docs/current/rangetypes.html) — `tstzrange`, the containment operator, and how period types are meant to be used.
- [PostgreSQL — Exclusion Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION) — the only mechanism that makes overlapping temporal versions *impossible* rather than unlikely.
- [PostgreSQL — `btree_gist`](https://www.postgresql.org/docs/current/btree-gist.html) — the extension that lets equality and range live in the same GiST index, which is what makes bitemporal exclusion constraints work.
- [SQL Server — Temporal Tables](https://learn.microsoft.com/en-us/sql/relational-databases/tables/temporal-tables) — the system-versioned implementation, for contrast with the pattern-based approach.
- [Martin Fowler — Snapshot Pattern](https://martinfowler.com/eaaCatalog/Snapshot.html) — the treatment of temporal objects, including the bitemporal framing and its cost.

## Chapter 4 — Index & Partition Co-Design

Chapters 1 through 3 were about a single table. This chapter is about the moment there are
ten million of them, and it is the chapter that most candidates have never thought about,
because index design and partition design are taught as separate subjects and they are in
fact **one decision with two halves**. Volume 4 owns the B+ tree mechanics and the
leftmost-prefix rule; this chapter is about what happens when you must also decide *where
the rows physically live*, and why the two decisions have to be made in the same meeting.

### 4.1 The One Rule: The Partition Key and the Leading Index Column Should Agree

This is the single most consequential sentence in the chapter, and it has a mechanical
reason that falls straight out of Volume 4.

A partitioned table in PostgreSQL is not one B+ tree. It is one B+ tree *per partition*,
plus a catalogue that says which partitions a query has to visit. Pruning happens by
comparing the query's predicates against the partition bounds. For pruning to happen at
all, the predicate has to be on the partition key. And for the index *within* each
partition to help, the predicate has to be on the leading index column.

```text
  CASE A — THEY AGREE.  PARTITIONED BY RANGE (created_at), INDEX (created_at, customer_id)

    query: WHERE created_at >= '2026-08-01' AND customer_id = 42

    step 1  PRUNE   10 partitions → 2 visited ......... GOOD
            partition bounds say only p2026_08 and p2026_09 can
            hold rows after 2026-08-01.
    step 2  INDEX   (created_at, customer_id) is leftmost-
            prefix usable inside each  ................ GOOD

    cost ≈ 2 partitions × O(log n) — and it does not grow when the
           table does.  This is the shape you are aiming for.

  CASE B — THEY DISAGREE.  PARTITIONED BY RANGE (customer_id), INDEX (created_at, customer_id)

    query: WHERE created_at >= '2026-08-01' AND customer_id = 42

    step 1  PRUNE   1 partition visited ............... GOOD
            the partition key is customer_id and the query has
            a customer_id predicate, so it does prune.
    step 2  INDEX   (created_at, customer_id) is useless
            here: created_at is a RANGE predicate, not an
            equality, so there is no leftmost prefix to
            use  → sequential scan of the whole
            partition  ............................... BAD

    Right pruning, wasted index.  The query still works and
    still returns the right answer.  It is just doing a scan
    where it should be doing four page reads.

  CASE C — THE DISASTER.  PARTITIONED BY RANGE (region), INDEX (created_at, customer_id)
                    and every query filters on created_at only.

    query: WHERE created_at >= '2026-08-01'

    step 1  PRUNE   no region predicate, so ALL 12
            partitions are visited  ................... BAD
    step 2  INDEX   usable inside each, but you just paid
            12 index descents and 12 sets of page reads
            for what should have been one  ............ BAD

    You have made every query slower and bought yourself one
    thing: the ability to DROP a region.  Which may be exactly
    what you wanted — but then say so, because you did not get
    a faster database.
```

> **INTERVIEW TRAP — "I ADDED A COMPOSITE INDEX, WHY IS THE QUERY STILL SLOW?"**
>
> Because a composite index only helps if the query's predicates are a *prefix* of it, and
> the reason that rule exists is that a B+ tree is sorted left to right. `(created_at,
> customer_id)` can serve "everything in August, for customer 42" and "everything in
> August" and "customer 42" is *not* usable, because `customer_id` is the second column
> and the tree is not sorted by it within a given `created_at`. If the query is
> `WHERE customer_id = 42` with no time bound, that index contributes nothing and the
> planner will not use it — and the reason it does not use it is not a bug, it is the
> planner correctly refusing to sort 400 million rows on your behalf.
>
> The second half of the trap, which is the one that actually costs a system its
> afternoon: **if the table is partitioned, there is a prune step before the index step,
> and it is the prune step that is being wasted.** An index that would be fine on a flat
> table can be useless inside a partition if the partition key is not the leading column,
> because the planner must first decide it is going to the right partition, and a query
> with no partition-key predicate is going to *every* partition. So the composite index
> and the partition key have to be designed together, and the diagnostic question is
> always the same: **"for this query, which partitions get visited, and is the leading
> index column the first thing the `WHERE` clause constrains?"**

### 4.2 The Decision Order, and Why It Is Not "Indexes First"

The order is not a preference; it follows from which decisions are reversible.

```text
  STEP 1  THE QUERY PATTERNS.  List the top ~20 queries by frequency
          and by p99 contribution. Not the queries you expect — the
          ones in the slow-query log. You cannot choose a key that
          serves queries you have not identified.

  STEP 2  THE PARTITION KEY.  Chosen from the query patterns AND from
          the operational requirements (retention, archival, the
          only bulk operation you will ever need to run).  This is a
          ONE-WAY DOOR in every engine that supports partitioning on
          a partitioned table, because changing it means recreating
          the table and every index on it.

  STEP 3  THE CLUSTERING / INDEX ORDER.  Per partition.  The leading
          column is almost always the partition key — the case for
          agreement is 4.1.  Trailing columns follow the query
          patterns from step 1, in the order their predicates appear.

  STEP 4  THE REMAINING INDEXES.  Secondary indexes for queries
          steps 1–3 did not cover.  These are cheap to add and cheap
          to drop.  They are the last thing decided and the first
          thing to try when a new query appears.

  WHAT IS REVERSIBLE:
    adding an index          → minutes, and only costs disk + write
    dropping an index        → minutes
    adding a partition       → minutes (ATTACH/DETACH, see 5.6)
    changing the partition key→ rewrite the entire table
    changing the key column  → rewrite the table + every FK + every
                               consumer that stored the value
```

The step-2-is-a-one-way-door claim deserves its weight, because "we will add a partition
later" is a sentence teams say and then discover is false. In PostgreSQL, converting a
plain table into a partitioned one requires `ALTER TABLE ... ATTACH PARTITION` for each
partition, which is possible, but converting it *back*, or changing which column the
ranges are on, is a full table rewrite plus a rebuild of every index. In MySQL the
`PARTITION BY` clause is part of the table definition and `ALTER TABLE ... PARTITION BY` is
effectively a copy. Oracle, SQL Server and every cloud-native engine have the same
property. So the honest answer to "we will partition it when it gets big" is: the
partitioning decision that matters is the *column* you choose, and the timing of the
mechanical change is much less important than people think.

### 4.3 What the Pruning Is Actually Worth

Pruning is worth real numbers, and the numbers depend on how the partitions are sized. The
useful framing is: **a partitioned table's query cost is a function of how many partitions
it touches, not how many rows the table has.** That is a genuinely different scaling law
from an unpartitioned table, and it is the entire argument for partitioning.

```text
  UNPARTITIONED `events`, 1.4 billion rows, 8kB pages, ~140 bytes/row
  ───────────────────────────────────────────────────────────────────
  "last 24 hours" = ~40,000 rows
    B+ tree on (created_at, ...): the recent rows are at the right
    end of the tree, and they are the HOT pages.
    → ~3 index pages + ~1,200 heap pages ≈ 10MB.  ~15ms.

  "last 24 hours for customer 42" — 60 rows
    → index descent to (created_at, 42) ≈ 4 pages.  ~1ms.
    Both fine. This is the case partitioning does NOT help.

  "all events for customer 42, ever" — 8,900 rows
    → the leading column is created_at and there is no bound on it,
      so a full index scan of 1.4B entries.  ~1.1GB.  ~4 seconds.
    ↑ THIS is the query partitioning fixes, and it fixes it only if
      the partition key is customer_id.  If the partition key is
      created_at, this query is exactly as slow as it was before.
```

Monthly range partitions over 1.4 billion rows with a growing history put roughly
90–100 million rows in a recent month and the same in each archived month. The properties
that follow:

- **The working set per partition is bounded.** 100 million rows × 140 bytes = 14GB, so a
  partition's hot index and recently-touched heap pages fit in a buffer pool that a
  quarter of the machine would hold. The same buffer pool cannot hold the hot pages of a
  1.4-billion-row unpartitioned table, because the hot pages of an unpartitioned table are
  a *thin slice of a huge key space* and get evicted by the sheer volume of cold pages
  competing for the same pool.
- **The number of partitions is the pruning granularity, and it multiplies planning time.**
  Every partitioned table adds a planning step, and every partition in the table is
  enumerated in the plan before pruning removes most of them. The number where this starts
  to hurt is roughly **a few hundred partitions in one table** — past that, planning time
  becomes visible in p99 latency, and the standard mitigations are sub-partitioning (so a
  query that must scan all partitions hits coarser objects) and culling old partitions
  (ATTACH/DETACH, so the catalogue stops growing). Chapter 5 covers this with numbers.
- **Pruning is a promise about the query, and the promise is fragile.** Partition pruning
  only happens when the planner can prove the predicate bounds exclude a partition. A
  `WHERE created_at >= $1` with a *parameter* prunes at plan time using a generic plan
  only if the parameter is a constant; PostgreSQL's plan caching will use a generic plan
  for a prepared statement after five executions, and a generic plan may prune *nothing*.
  The mitigations are the ones Volume 4 covers — `plan_cache_mode`, or partitioning on a
  column that the query constrains with an equality rather than a range, because equality
  on a partition key prunes regardless of whether the value is known at plan time.

> **MUST REMEMBER**
>
> **Partitioning on a column you do not filter on buys you pruning on nothing.** It buys
> you exactly one thing: the ability to `DROP` or `DETACH` a whole partition instead of
> deleting rows. That is a real and often enormous win (Chapter 5), and it is worth doing
> for retention alone. But if the claim in the design doc is "we partitioned it to make
> queries faster" and the queries do not touch the partition key, the claim is false, and
> the cost is that every one of those queries now visits every partition and is *slower*
> than it was before partitioning.

### 4.4 Co-Designing the Indexes That Matter

Given a partition key, the index design is a straightforward application of the
leftmost-prefix rule with one adjustment: the trailing columns are chosen from the top-20
query list, and the *order within* the trailing columns is chosen by selectivity, not by
whichever column someone noticed first.

```sql
CREATE TABLE events (
  id            BIGINT      GENERATED ALWAYS AS IDENTITY,
  customer_id   BIGINT      NOT NULL,
  event_type    TEXT        NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL,
  payload       JSONB       NOT NULL,
  CONSTRAINT events_pk PRIMARY KEY (created_at, id)   -- must contain the
);                                                      -- partition key

-- Monthly range partitions.  The leading index column and the
-- partition key are BOTH created_at, by design and not by accident.
CREATE TABLE events_2026_08 PARTITION OF events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE events_2026_09 PARTITION OF events
  FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');

-- Q1: "events for a customer, newest first, this month"
--      WHERE customer_id = ? AND created_at >= ? ORDER BY created_at DESC
CREATE INDEX ON events (customer_id, created_at DESC);
--  leading customer_id  → the equality predicate prunes to a month
--  created_at          → the range and the sort direction, both covered

-- Q2: "count events of a type in a window"
--      WHERE event_type = ? AND created_at BETWEEN ? AND ?
CREATE INDEX ON events (event_type, created_at);
--  Here the partition key is NOT leading, and that is correct:
--  this query cannot prune (no customer predicate), so it visits all
--  partitions, and inside each the leading event_type is what makes
--  it fast.  Disagreement is fine when the disagreement is deliberate
--  and the query is not the hot one.  It is not fine when it is
--  accidental — see 4.1, Case B.
```

Two things in that DDL that are easy to get wrong and expensive to fix later.

**The primary key must contain the partition key.** This is not a stylistic preference; in
PostgreSQL it is a requirement, and the error message says so. It is also a real modelling
statement: a unique constraint on a partitioned table is only enforced *per partition*
unless it contains the partition key, so `(customer_id)` alone as a `UNIQUE` on a
`created_at`-partitioned table would not be global. The composite `(created_at, id)` is
correct for the storage layer, and the right place to enforce "one row per customer per
event type per day" is a separate `UNIQUE` on a `BRIN`-friendly or per-partition index with
a `NULL`-free key.

**The trailing column order is by selectivity, and "selectivity" means different things
for different engines.** For a column with a million distinct values, equality on it is
highly selective. For a low-cardinality column like `event_type` with nine values, equality
on it is not — and putting it first in a composite index spends the index's whole value
on distinguishing nine cases. The rule that generalises: **put equality predicates on
high-cardinality columns first, then the range predicate, then the sort column.** That
ordering maximises the number of index entries the scan can skip, and it is exactly the
rule Volume 4 derives for flat tables — carried unchanged into the partitioned case, which
is worth saying, because the candidate who thinks partitioning changes index design has
misunderstood both.

### 4.5 When the Co-Design Breaks Down

There are two cases where the partition key and the leading index column must disagree,
and recognising them is the difference between a design that works and a design that is
correctly argued into uselessness.

**Case one: the maintenance-only partition.** You partition by `region` because you
occasionally need to drop a region (Chapter 5's canonical win), and you accept that queries
do not prune. That is a legitimate trade and the honest statement is: "we did not partition
for query performance; we partitioned for retention, and we have measured the cost as N× on
the global-scan queries." The cost is real and nameable — a monthly `COUNT(*)` across all
12 regions now reads 12 partition indexes instead of one, and a report that scans the whole
table is proportionally slower. For a table where that report runs hourly, it is a
non-issue. For a table where it is on the request path, it is not.

**Case two: the hot partition.** You partition by `created_at` for retention, and your hot
query is "all events for this customer, ever". That query prunes nothing and the leading
column does not match. The fix is not to repartition; it is to give that query its own
index with `customer_id` leading (`CREATE INDEX ON events (customer_id, created_at)` above,
which is exactly that) and accept that it visits every partition. The alternative — a
separate *unpartitioned* copy of a per-customer rollup — is a denormalisation, and
Volume 1 Chapter 5's rules govern it.

What is *not* legitimate is arriving at either case by accident, which in practice means
picking the partition key from whatever column had a natural-looking range and then
discovering the query patterns afterwards.

#### Common Mistakes

- Choosing the partition key from the column with a "natural range" rather than from the
  top-20 query list, and then discovering the queries cannot prune
- Believing pruning plus a composite index both help, when the partition key is the second
  column and the index is therefore not leftmost-prefix usable for the query that matters
- Treating "we partitioned it" as a performance claim, and not checking how many partitions
  a given query actually visits
- Forgetting that a partitioned table's `UNIQUE` constraint is only global if it contains
  the partition key, and shipping a per-partition "uniqueness" that is not uniqueness
- Believing pruning works with a parameterised predicate, having tested it with a literal
  and never seen the generic plan
- Building 200+ partitions on a single table, then discovering that planning time — not
  execution — is in the p99
- Adding the index for the new hot query in the wrong column order because the column
  "looked more important", rather than because of its cardinality

#### Interview Questions — Index & Partition Co-Design

**D1. A 900-million-row `events` table. The team wants to partition it monthly on
`created_at` for retention. They also say the hot query is "all events for a customer,
any time". Walk me through the design, and tell me what the team has to give up.** `STAFF`

Both facts are compatible, and the design that satisfies them is: partition monthly on
`created_at`, give the retention win, and accept that the hot query prunes nothing. The
index set then has two distinct shapes, and saying so is the answer. Retention and
pruning are served by indexes leading with `created_at` — `(created_at, customer_id)` for
windowed queries, `(event_type, created_at)` for the type-count query. The hot
customer query gets its own index leading with `customer_id`:
`(customer_id, created_at DESC)`, which prunes nothing but, within every partition it
visits, turns an 8,900-row full index scan into a handful of index descents. So the hot
query costs twelve partition descents instead of one — twelve index probes on a
900-million-row table is milliseconds, and the query goes from four seconds to
single-digit milliseconds. That is the trade, stated in numbers.

What they give up is stated the same way: any query that touches `created_at` as a *range*
without an equality on a leading index column now visits all twelve partitions, and the
daily "count all events" report and the hourly "top customers by volume" job both get
proportionally slower. The mitigation is to not put those on the request path, and to
measure them before and after so the number is known rather than discovered.

The second thing to raise unprompted is the one-way door. The partition *column* is
effectively permanent; the monthly *cadence* is not, because you can add next month's
partition ahead of time and `ATTACH` an existing table as a partition for a historical
range. And the third is the 200-partition ceiling — at a monthly cadence, 900 million rows
is about 6 years of history before the table has 72 live partitions, and the team should
know that archived partitions are `DETACH`ed and dropped, not carried forever, because
every partition in the table is a planning-time cost even when pruned.

**T2. A query that was 40ms becomes 900ms after a "harmless" parameter change. Nothing in
the SQL changed. The table is partitioned monthly on `created_at`. What is the most likely
explanation, and how do you confirm it?** `ADVANCED`

Prepared-statement plan caching, and the generic plan. The application changed from
inline literals to a parameterised query — in practice this is usually a switch from
JDBC string-built SQL to server-side prepared statements, or an ORM's `IN` clause
handling changing strategy, or a PgBouncer/ProxySQL transaction-pooling change (Volume 7
covers the pooling interaction). With a custom plan, the planner knows the literal value of
`created_at`, compares it against the partition bounds, and prunes eleven of twelve
partitions. With a generic plan it has a `Param` with an unknown value, it cannot prove any
bound, and it visits all twelve — the same query, the same index, twelve times the work.

The confirmation is `EXPLAIN (ANALYZE)` with the parameter *explicitly set* versus the plan
actually chosen, plus `pg_prepared_statements` / `pg_stat_statements` to see whether a
generic plan is in use, and `log_planner_stats`. The specific PostgreSQL lever is
`plan_cache_mode = force_custom_plan` on the statement or the session, which is the
correct fix when the parameter is a low-cardinality value like a tenant ID and forcing a
custom plan costs 0.1ms of planning per execution — an excellent trade.

The staff-level point is that the mitigation should not be "always force custom plans",
because on a statement executed 10,000 times/second the extra 0.1ms of planning is a
full millisecond of CPU per second of wall clock, and for a query with a genuinely
high-cardinality parameter the generic plan is better because the custom plan picks a
different, wrong index based on one sample. The right rule is to partition on a column the
query constrains with an **equality** wherever possible, because equality on a partition
key prunes correctly under a generic plan too — a generic plan can prune to *the partition
for this value* if the value is known at execution, which it always is. Range predicates
on the partition key are the fragile case, and that is an argument for the partition key
choice that should be made at design time, not at incident time.

**D2. Your team proposes sharding `orders` by `merchant_id` because "merchants are the
natural tenant boundary". The hot queries are: a customer's order history, a merchant's
order list, and a global revenue report. What is your answer?** `STAFF`

I would push back, and the pushback would be structured around the four shard-key
properties rather than around a preference. `merchant_id` has good cardinality (400,000
merchants) and, on a marketplace, reasonable evenness — but it fails the fourth property,
which is *query alignment*, and it fails it for two of the three hot queries. A customer's
order history has no `merchant_id` in the predicate at all — the customer has ordered from
eleven merchants — so it is an eleven-shard scatter-gather for what is, for a real
customer, a small number of rows. The global revenue report touches all 400,000 shards
bucketed into, say, 32 physical nodes, which is a full-cluster scan on the request path of
the finance team's most important query.

The fix is to make the shard key the **customer**, not the merchant, because the customer
is the entity that is present in the most queries. Then: a customer's order history is
one shard; a merchant's order list becomes a scatter-gather across shards, and that is the
right thing to pay for, because it is a *listing* query where the result is naturally
bounded by a page and can be served by a denormalised merchant-order-index built from the
change stream; the global revenue report is a warehouse query and should be reading a
materialised aggregate, not the OLTP shards, whatever the shard key is.

The other two properties then need checking rather than assuming. Evenness: if your top
merchant is 8% of GMV, then no shard key containing `merchant_id` is even, and if you
shard by `customer_id` you are even by construction unless you have customers who
represent 5% of orders each — which is a real possibility in a B2B system and needs a
measurement, not an assumption. Stability: `customer_id` never changes, but if you ever
merge two customer records you have just moved a customer between shards, which is the
reshard problem in miniature and needs the merge to be a planned, offline operation.

The last thing I would say, and it is the staff part: this decision is reversible in
neither direction, it takes a quarter to execute, and it should be made with the
finance team's report in the room, not after. The migration from "shard by merchant" to
"shard by customer" is a full data movement with a dual-write window; the migration from
"not sharded" to "sharded by customer" is much cheaper because it happens before the data
exists. **The whole point of choosing well now is that the expensive version of this
conversation is the second one.**

> **CHAPTER 4 SUMMARY**
>
> Index design and partition design are one decision, and the rule that unifies them is
> that **the partition key and the leading index column should almost always be the same
> column** — because a query only prunes if it constrains the partition key, and only uses
> a composite index if it constrains the index's leftmost prefix, and if those two
> predicates are different columns you have guaranteed that every hot query is either a
> full scan or a twelve-partition scan. The decision order follows reversibility: identify
> the real query patterns from the slow-query log, choose the partition key from them plus
> the operational requirement that matters (almost always retention), then design the
> indexes per partition with the partition key leading, and treat everything else as cheap
> and adjustable. And the one thing partitioning gives you for free that no index can is
> the ability to remove data by dropping a structure rather than by deleting rows — which
> is Chapter 5, and which is the single most under-used operational feature in relational
> databases.

#### Further Reading

- [PostgreSQL — Declarative Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) — the official treatment of `RANGE`, `LIST` and `HASH`, constraint enforcement, and the `ATTACH`/`DETACH` lifecycle.
- [PostgreSQL — Partition Pruning](https://www.postgresql.org/docs/current/ddl-partitioning.html#DDL-PARTITIONING-DECLARATIVE-MAINTENANCE) — execution-time versus plan-time pruning, and why a parameter can change the answer.
- [Use The Index, Luke — Advanced Indexing](https://use-the-index-luke.com/advanced-indexing.html) — index design for a large table, with the pruning-versus-maintenance framing in the same language this chapter uses.
- [PostgreSQL — `EXPLAIN` and `BUFFERS`](https://www.postgresql.org/docs/current/using-explain.html) — the measurement that settles every argument in 4.1, including per-partition plans.
- [Vitess — Choosing a Shard Key](https://vitess.io/docs/reference/features/sharding/) — the same co-design problem at the sharding layer, useful for seeing what the partition-level answer looks like when it is replicated across nodes.

## Chapter 5 — Partitioning

### 5.1 The Distinction That Is the Whole Chapter

Partitioning is **one database, split into many physical pieces that the engine manages**.
Sharding is **many databases, on many machines, with the routing done by your application
or by a proxy**. The distinction is not pedantic; conflating them is a staff-level tell,
because the two have opposite cost curves and different failure modes and confusing them
produces designs that are simultaneously too complex and not enough.

```text
  PARTITIONING                              SHARDING
  ───────────                              ───────
  ONE server                                MANY servers
  one process                                many processes
  one buffer pool                            one buffer pool each
  one max_connections                        one max_connections each
  one WAL, one set of indexes                 N WALs, N sets of indexes
  one failure domain                          N failure domains
  one point of backup                         N points of backup
  NO cross-partition cost for a query         EVERY cross-shard query is a
    that prunes (1 partition)                  network round trip
  PARTITION PRUNING: the engine               ROUTING: your code, your
    skips partitions for you                   proxy, your mistake
  The unit of scaling is the                  The unit of scaling is the
    PARTITION (cheaper, reversible)            SHARD (expensive, near-irreversible)
  FAILURE: one node dies, one table is        FAILURE: one node dies, 1/N
    unavailable. Everything is fine.           of requests fail unless you
                                               built failover.
```

The most useful one-line version for an interview: **partitioning is a physical
organisation of one logical database; sharding is a physical distribution of several
logical databases, each of which is unaware of the others.** Partitioning gives you
pruning and maintenance. Sharding gives you capacity. They are sometimes used together —
a shard is usually itself partitioned — and they are never substitutes.

### 5.2 Range, List, and Hash

```sql
-- RANGE. The default, and the one that gives you retention.
-- "rows between 2026-08-01 and 2026-09-01 are in this partition"
CREATE TABLE events_2026_08 PARTITION OF events
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

-- LIST. For a small, closed, business-defined set. 'EU' rows, 'US' rows.
-- Great when the set changes rarely and the natural operations are
-- "all EU rows" (prunes) or "drop EU" (maintenance).
CREATE TABLE events_eu PARTITION OF events FOR VALUES IN ('EU');
CREATE TABLE events_us PARTITION OF events FOR VALUES IN ('US');
-- Anything not listed has NO partition and the INSERT fails loudly.
-- A DEFAULT partition catches the rest, but then the default is
-- unprunable and unbounded — which is a silent design smell.

-- HASH. Even distribution, no ordering, no pruning by range.
CREATE TABLE events_p0 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 0);
CREATE TABLE events_p1 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 1);
CREATE TABLE events_p2 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 2);
CREATE TABLE events_p3 PARTITION OF events FOR VALUES WITH (MODULUS 4, REMAINDER 3);
```

The choice is not aesthetic. **Range** is the one that pairs with time and therefore with
retention, which is why it is the default for event and log tables. **List** is for a small
closed set with no natural order — regions, tiers, statuses-that-a-row-can-be — and it is
under-used because people reach for `RANGE` on an enum. **Hash** exists for one purpose:
even distribution when you have no good key and no queries that need pruning. Its honest
weakness is that it gives up *both* of the things partitioning is for. A hash-partitioned
table cannot prune for a time range, because the hash is not a range; and you cannot drop
a hash partition for retention, because the hash function does not correspond to any
business boundary. Hash partitioning is a way of splitting a table evenly when you have
decided you do not need either benefit — which, if you have decided that, is an argument
for sharding rather than partitioning.

A **sub-partitioned** table is where partitioning earns its keep, and it is the shape to
have ready:

```text
  events  (PARTITION BY RANGE (created_at))
    ├── events_2026_08  (PARTITION BY LIST (region))
    │     ├── events_2026_08_eu      ~35M rows, ~4.9GB
    │     ├── events_2026_08_uk      ~4M rows, ~0.6GB
    │     ├── events_2026_08_us      ~50M rows, ~7.0GB
    │     └── events_2026_08_apac    ~11M rows, ~1.5GB
    ├── events_2026_09  (PARTITION BY LIST (region))
    │     └── ... same four ...
    └── events_2026_10  (PARTITION BY LIST (region))
          └── ... created in advance, empty, waiting

  What this buys:
   [prunes]  retention by month:  DROP TABLE events_2026_06       (instant)
   [prunes]  retention by region within a month (GDPR erasure):
                             DROP TABLE events_2026_08_eu   (instant)
   [prunes]  a query with BOTH predicates prunes to exactly one leaf
  [full]   a query with only created_at visits 4 sub-partitions per month
  [full]   a query with only region visits every month — 12 × 4
```

The sub-partitioning cost is the important part and it is worth stating: **every pruning
factor multiplies.** A query with a month predicate and no region predicate visits 4 leaf
partitions instead of 1. That is fine at 4 and painful at 40. The rule is to sub-partition
only for a *second, independent* maintenance dimension that you actually operate — GDPR
erasure by region is a real one; "in case we want to drop by country" is not.

### 5.3 Partition-Wise Operation, the Feature Nobody Uses

Beyond pruning, a partitioned table in PostgreSQL can do two things an unpartitioned one
cannot, and both of them are about *maintenance* rather than queries. This is the part of
partitioning that is genuinely under-used, and the reason is that most teams only learn
about pruning.

```sql
-- Partition-wise append: a bulk INSERT that already carries the partition
-- key is routed to one partition and no scan of the others is needed.
INSERT INTO events_2026_09 SELECT * FROM staging_events;

-- Partition-wise aggregate: a GROUP BY whose key includes the partition
-- key is computed per partition and combined, with no single huge
-- hash table and no spilling to a temp file.
--   this needs events PARTITION BY RANGE (created_at, region)
--   or a sub-partitioned table, because the grouping key must contain
--   the full partition key
SELECT region, count(*)
  FROM events
 WHERE created_at >= '2026-01-01'
 GROUP BY region;

-- VACUUM, ANALYZE, index maintenance, and CLUSTER all run per partition,
-- which means each is bounded by one partition's size rather than the
-- table's — the reason autovacuum keeps up on a partitioned table and
-- does not on a 2-billion-row flat one (Volume 7).
```

The practical framing for a design review: **partitioning converts every unbounded
maintenance operation into a bounded one.** That is a bigger deal for uptime than query
latency, and it is the argument to make when the query-side benefit is thin.

### 5.4 The Canonical Win: `DROP` Instead of `DELETE`

This is the headline of the chapter, so here are the numbers, in the shape an interviewer
wants them.

```sql
-- What retention is usually written as:
DELETE FROM events WHERE created_at < now() - INTERVAL '90 days';

-- What retention should be written as, on a table partitioned monthly:
DROP TABLE events_2026_05;
-- and the partition's indexes with it, because an index belongs to the
-- partition, not to the parent.

  THE ARITHMETIC
  ─────────────
  Table: events, 1.4 billion rows, ~140 bytes/row heap
  Monthly partition:  ~100 million rows
  One 90-day retention sweep:  3 partitions, ~300 million rows

  DELETE 300 MILLION ROWS
    heap bytes deleted      300M × 140B            =  42 GB
    dead tuples created     300M                  =  one per row
    WAL generated           ~300M × ~90B           =  27 GB  (minimum)
    transaction duration    at 50k rows/s (a
                            conservative single-
                            writer DELETE rate)    =  6,000 s
                                                     =  100 minutes
    locks held              row locks on 300M rows
                            + a single long transaction
                            that holds every dead
                            tuple's xmax, so
                            VACUUM cannot reclaim
                            ANY of it until commit
    what the user sees      one statement that will
                            time out, holding locks,
                            generating 27GB of WAL,
                            and requiring a crash
                            recovery replay of all
                            of it on the next restart

  DROP ONE PARTITION
    metadata operation      unlink the files, invalidate
                            the plan cache entries
    duration                10 – 500 ms
    WAL generated           ~0
    locks held              ACCESS EXCLUSIVE on a table
                            nobody is reading
    recovery replay         nothing
    what the user sees      the partition is gone
```

The reason `DELETE` is so much worse is not the rows — it is the **single transaction**.
300 million row deletions in one transaction means 300 million `xmax` values, every one of
which is a tuple VACUUM cannot remove, and the vacuum cannot remove any of them until the
statement commits. So a 100-minute transaction is also a 100-minute window in which the
table's free space map gets no updates and the table physically doubles in size, and if the
process is killed at minute 90, PostgreSQL rolls back 90 minutes of work and then has to
replay 27GB of WAL during recovery. `DROP TABLE` on a partition is a catalog operation plus
file unlinks, and the space comes back immediately and completely.

Even `DELETE` in batches — 10,000 rows per statement in a loop — is better, because each
batch commits and VACUUM can reclaim between batches, and because a crash loses only the
last batch. But it is still ~300 million row-level operations where a partition drop is
one, and the batched version still writes the full 27GB of WAL and still leaves the table
bloated until vacuum catches up. The batched `DELETE` is the right answer only when the
table is *not* partitioned, and it is the right answer for the *first* release of a
retention feature, before anyone has partitioned anything.

> **PRODUCTION SCENARIO**
>
> Problem: a 1.4-billion-row `events` table on a 900GB node had a quarterly retention job
> that ran `DELETE FROM events WHERE created_at < now() - INTERVAL '90 days'`. It had been
> running for eleven minutes every Sunday for two years without incident.
> Investigation: in June the table crossed 1.4 billion rows for the first time and the
> Sunday job was still running at 06:00 on Monday. At 04:40 the p99 latency on the
> `/account/activity` endpoint — a query that touches `events` — went from 40ms to 9
> seconds, and the connection pool exhausted because those queries were waiting on the
> `DELETE`'s locks. `pg_stat_activity` showed one `DELETE` holding 300 million row locks
> and 42GB of dead tuples, and `pg_stat_progress_vacuum` showed nothing running.
> Root cause: the `DELETE` was one transaction. VACUUM could not reclaim any of the 300
> million dead tuples because their `xmax` still pointed at a live transaction, so the
> table's physical size was doubling during the run and the free space map was frozen. The
> endpoint's queries were not blocked by row locks on the rows being deleted — they were
> slow because the table had doubled and the working set no longer fit in the buffer pool.
> Solution: the table was partitioned monthly on `created_at` (which requires a one-off
> migration of 1.4 billion rows, done during a planned weekend with the service in
> read-only mode), and the retention job became `DROP TABLE events_2026_03;` — 180ms,
> no locks on anything, zero WAL. The `DELETE` was retained as a fallback with a
> batch size of 50,000 for the tables that are not yet partitioned.
> Prevention: retention on any table over 100 million rows is implemented as a partition
> drop, and a lint rule in CI fails any migration containing an unbounded `DELETE`.

> **SCALING REALITY CHECK**
>
> Partitioning stops paying for itself as a *query* optimisation somewhere in the
> low hundreds of millions of rows, provided the query prunes. As a *maintenance*
> mechanism it pays for itself at 10 million rows, because the alternative to dropping a
> partition is a `DELETE` that grows linearly with retention window. And it stops being
> usable as a maintenance mechanism at a few hundred live partitions per table, because
> planning time and catalogue size become a p99 problem — at which point the answer is
> `DETACH` the old partitions and archive them to cheaper storage, which is itself
> something you can only do because you partitioned.

#### Common Mistakes

- Conflating partitioning with sharding, and then designing for one while explaining the
  other
- Partitioning by a column the hot queries do not touch, and calling it a performance
  improvement
- Writing retention as `DELETE ... WHERE created_at < ...` on a partitioned table, when the
  partition drop is one operation instead of 300 million
- Running `DELETE` on a large table in a single transaction, which blocks vacuum and doubles
  the table's physical size for the duration
- Creating hundreds of live partitions in one table and then debugging planning time in the
  p99
- Using `RANGE` on a small closed enum instead of `LIST`, and then not being able to drop
  or add a value without a partition bound change
- Using `HASH` partitioning and expecting range pruning or retention by drop
- Forgetting that a `UNIQUE` constraint on a partitioned table is only global when it
  contains the partition key

#### Interview Questions — Partitioning

**D1. Our `events` table is 1.4 billion rows and 900GB. Retention is 90 days, written as a
single `DELETE`, run weekly. I want to move to monthly range partitions on `created_at`.
Give me the full plan, the risks, and tell me what I have decided not to solve.** `STAFF`

The plan, in order. First, prove the partition key: I want the top-20 queries from the slow
query log, and I want to know how many of them carry a `created_at` predicate. If most do,
range partitioning on `created_at` wins on both axes. If most hot queries are per-customer
with no time bound, the partition key is right for retention and wrong for reads, and I say
that explicitly and add a `(customer_id, created_at)` index to cover the hot path. Second,
the migration itself: create the partitioned parent as an empty table with the identical
schema and indexes, create the twelve monthly partitions, create next quarter's partitions
empty ahead of time, then move the data in slices — `INSERT INTO events_new SELECT * FROM
events WHERE created_at >= x AND created_at < y` per month, in the lowest-traffic window,
with the source table still authoritative, then a short write freeze, a final delta copy,
a rename, and a rollback plan that is renaming the old table back. On 1.4 billion rows that
is 42GB of heap plus every index, so the migration needs free disk for a full second copy
— 1.1TB — and that is the first thing to verify, before writing any code. Third, the
retention job becomes `DROP TABLE events_2026_03;` with a fallback `DELETE` in 50,000-row
batches for any table not yet converted, and the fallback carries a comment explaining why
it exists. Fourth, the `DELETE` job is deleted, not disabled, because a disabled job is a
job someone re-enables during an incident.

The risks, in order of how much they worry me: the disk requirement for the parallel copy,
which is usually the one that kills these projects; index build time, because every index on
the parent is built per partition and 12 partitions × 6 indexes is 72 index builds; and the
constraint question — any `UNIQUE` that did not contain `created_at` was previously global
and now becomes per-partition, so it has to be re-expressed with the partition key included
or enforced in the application, and that is a correctness change disguised as a mechanical
one. I would also want to re-run `ANALYZE` on each partition after the copy, because the
new table's statistics start empty and the first day of a partitioned table with no
statistics is a day of bad plans.

What I have decided not to solve: the customer-history query still prunes nothing and still
visits twelve partitions; the global reporting queries are unchanged and still expensive;
and I have not partitioned the other eleven large tables, because doing twelve of these
sequentially is a quarter of work and this one is the proof. I would say that out loud,
because a migration plan that claims to solve everything is a migration plan that gets
half-funded.

**T2. You partition a table monthly. `EXPLAIN` on the query for last 7 days shows a scan
of 3 partitions. The identical query in staging shows 1. What is different?** `ADVANCED`

Three candidates, and the answer requires checking all three. (1) *Different partition
bounds.* Staging probably has a default partition or a differently-bounded set, and if
staging's bounds are wider the "same" query includes more partitions there, not fewer — so
this candidate predicts the opposite, and if staging scans *fewer* partitions, the
difference is that staging's monthly partition boundaries are at a different phase, so
"last 7 days" happens to fall inside a single month there and straddles a boundary in
production. That is a real and instructive answer: the number of partitions touched depends
on the *phase* of the boundaries, so a query can touch 1 partition on 1 September and 2 on
30 September with no code change. (2) *Plan-time versus execution-time pruning.* Production
has more distinct `created_at` values, so the planner may have switched to a generic plan
for the prepared statement and lost plan-time pruning, while staging's small parameter
variety kept it on a custom plan. `EXPLAIN (ANALYZE)` with the plan actually chosen, plus
`pg_stat_statements`, distinguishes this. (3) *A different table.* The staging query hits a
`view` or a differently-partitioned parent, and the "identical query" is not hitting the
table you think.

The one I would bet on is (2), and the reason it is interesting is that it is invisible in
staging *because staging has low variance*. That is the general lesson worth stating: a
partitioned query's cost is not a property of the query, it is a property of the query
plus the parameter plus the phase of the partition boundaries plus the plan cache state.
Which means staging cannot validate partitioning performance, and the load test must use
production-shaped parameter distributions.

**D2. When would you tell a team *not* to partition, and what would you tell them to do
instead?** `STAFF`

I would say do not partition when the table is under about 100 million rows, or when the
hot queries do not constrain the partition key and there is no retention requirement, or
when the operational cost of the migration exceeds the benefit for the next two years. The
middle one is the interesting test. If the hot queries are all by primary key — "fetch
order 9001" — then a B+ tree lookup on the PK is already O(log n) with perfect locality,
and partitioning it by time means every single-row lookup now does a partition-key
comparison, and the index per partition is smaller, and the actual win is nothing. That is
the "partitioning by a column you do not filter on buys you pruning on nothing" case with
the added sting that the queries do not filter on *anything you can partition by* usefully.

So what do they do instead? Add the index the query needs, check the working set against
the buffer pool, and — the thing candidates omit — check whether the table is large because
of a retention policy nobody wrote down. A 900GB table with two years of data and a
business that only cares about 90 days is a `DELETE` job and a partitioning job, and the
second is worth doing precisely so the first becomes a drop. If the answer is "we need all
seven years and we query all of it", then the answer is not partitioning, it is either
columnar storage for the cold partitions, an archival tier, or accepting that this table
wants to be sharded (Chapter 6) and should be on a roadmap rather than discovered in an
incident.

The staff-level close: partitioning is a *single-node* technique and its ceiling is a
single node's CPU, memory and I/O. The moment the honest answer to "is this table big for
one very large machine" is no — and for a 1.4-billion-row table with 900GB of heap, the
answer is roughly "yes, it still fits on one 2TB machine, but not comfortably" — the next
step is not more partitions. The next step is sharding, and the shard key decision that
implies is the most expensive one in the industry. Knowing which of those two questions you
are answering is the reason to decide the partition key first and well.

> **CHAPTER 5 SUMMARY**
>
> Partitioning is one database divided into many physical pieces, and it buys exactly two
> things: **pruning**, so a query visits one partition instead of the whole table, and
> **maintenance**, so a bounded operation (vacuum, analyze, index build) is bounded by one
> partition's size and — the headline — so retention is a `DROP TABLE` taking 180
> milliseconds instead of a 300-million-row `DELETE` taking 100 minutes, writing 27GB of
> WAL and blocking vacuum for its whole duration. Range partitions on a time column are the
> default because time is what you eventually want to remove; list partitions fit a small
> closed business set; hash partitions give up both benefits and are the right answer only
> when you have decided you need neither. Sub-partitioning multiplies pruning factors, so
> add a second dimension only for a second maintenance operation you actually perform. And
> the boundary of the whole subject is the one candidates blur: **partitioning is one node,
> many partitions, and it stops scaling at one node.** What comes past that ceiling is
> sharding, and it is not the same decision at all.

#### Further Reading

- [PostgreSQL — Declarative Partitioning](https://www.postgresql.org/docs/current/ddl-partitioning.html) — the official guide, including sub-partitioning, constraint enforcement, and the `ATTACH`/`DETACH` lifecycle.
- [PostgreSQL — `ATTACH PARTITION` / `DETACH PARTITION`](https://www.postgresql.org/docs/current/sql-attachpartition.html) — the online operations that make a rolling migration to a partitioned table possible.
- [MySQL — Partitioning](https://dev.mysql.com/doc/refman/8.4/en/partitioning.html) — the engine that has partitioning but no partition types worth using for range pruning in most real schemas, and why.
- [Use The Index, Luke — Composite Index](https://use-the-index-luke.com/idx/composite-index.html) — the leftmost-prefix rule and column ordering, which is the index half of the partition-and-index co-design in this chapter.
- [AWS Aurora — Advanced Data Types and Partitioning](https://docs.aws.amazon.com/aurora/rds-ug/latest/aurora-partitioning.html) — a managed engine's partitioning, useful for seeing which operations the vendor automates and which it does not.

## Chapter 6 — Sharding

Sharding is the decision to distribute one logical database across many physical ones.
Unlike everything in Chapters 1 through 5, it is not reversible in any practical sense, it
cannot be done inside a transaction you control, and every mistake in it surfaces as a
cross-node query rather than as an error. The whole chapter exists to make the candidate
able to reason about a decision that, once made, governs everything above it.

### 6.1 Horizontal, Vertical, and the Reasons People Confuse Them

**Vertical partitioning** — also called vertical scaling or a vertical split — cuts a wide
table into narrower ones, or moves columns into a second table. It is the least glamorous
and most under-used answer, and it should be the first one considered.

```text
  orders (a genuinely wide row, 4.1KB because of 3 JSONB columns)

  BEFORE — one row, 4.1KB, 18 rows per 8kB page
    ┌──────┬───────────┬──────────────┬──────────────┐
    │ id   │ core      │ audit_blob   │ search_blob  │
    │ 8B   │ 340B      │ 1.8KB        │ 1.9KB        │
    └──────┴───────────┴──────────────┴──────────────┘

  AFTER — two tables, joined only when both are needed
    orders      (id, customer_id, status, total, placed_at)  340B  → 24/page
    order_blob  (order_id, audit JSONB, search JSONB)        3.7KB →  2/page

  The 2 rows/page table is the point: blobs are read almost never
  and written rarely, so they are 3% of queries and 88% of the bytes.
  Moving them out means the hot table's working set is 12× smaller
  and it fits in a buffer pool an order of magnitude smaller.

  This is "vertical partitioning" and it is a SCHEMA change, not a
  scaling change. No sharding, no distribution, no cross-node
  anything. It is also a denormalisation decision (Volume 1 §5.3)
  because the row is now split across two relations.
```

**Horizontal partitioning** — sharding — cuts *rows*. Every shard has the same schema and
a disjoint subset of the rows. That is the expensive one.

The reason people reach for sharding when vertical would do is that sharding is the
technique everyone has heard of, and because "the database is too big" feels like it needs
a distributed answer. The honest triage order is:

1. **Do you have an index problem?** A missing or wrong-column index on a 200-million-row
   table looks exactly like a capacity problem and is fixed in a day. Check the slow query
   log first. Volume 4 owns this.
2. **Do you have a working-set problem?** A 900GB table whose *hot* data is 30GB is a
   buffer-pool-sizing and archiving problem, not a distribution problem.
3. **Do you have a write-throughput problem?** A single node tops out around 20,000–50,000
   small writes/second on ordinary hardware. If you need 200,000, that is genuinely more
   than one node can do and sharding is the answer.
4. **Only now: is one node physically unable to hold the data or the connections?**

Steps 1 and 2 are the ones teams skip, and they are the ones that are cheap.

### 6.2 The Shard Key and Its Four Properties

The shard key is the column whose value routes a row to a shard. Choosing it is choosing
the query shapes that will be fast forever, and the four properties are non-negotiable.

```text
  1. CARDINALITY — enough distinct values that the data spreads.
   [full]    boolean (2 values)          → 2 shards, and one is huge
   [full]    country_code (250 values)   → usable, but skewed by population
    [prunes]   customer_id (4.2M)         → fine

  2. EVENNESS — the values distribute uniformly across shards.
   [full]    country_code in a system where
        30% of users are in one country
                                     → that shard has 30% of the
                                       data and 100% of the traffic
   [full]    the "big tenant" problem: in a B2B SaaS, 12 customers
        generate 40% of queries.  Even a uniform hash of
        customer_id does not help if those 12 customers hash to
        4 shards.  This needs a separate answer (see below).
    [prunes]   a hash function, IF the input is uniform

  3. STABILITY — THE ONE THAT CANNOT BE FIXED LATER.
     The value must NEVER change for the life of the row.  If a
     customer's shard is derived from merchant_id and the customer
     switches merchant, the row MOVES SHARDS.  That is a reshard.
   [full]    tenant_id where tenants get acquired and merged
   [full]    any status, region, category, or "current plan" column
   [full]    a timestamp
    [prunes]   customer_id, user_id, account_id

  4. QUERY ALIGNMENT — the shard key appears in the predicate of
     the queries that matter, so no cross-shard work is needed.
     This is the property people forget, and it is the one that
     decides whether the system is fast or unusable.
    [prunes]   "orders for customer 42"                     → shard(42)
   [full]    "orders for merchant 9001"                   → all shards
   [full]    "all orders in the last 7 days"              → all shards
   [full]    "revenue by region, this quarter"            → all shards
```

> **MUST REMEMBER**
>
> **Stability is the property that cannot be repaired.** Cardinality and evenness can be
> improved by adding shards or by a rebalancing pass. Query alignment can sometimes be
> fixed by adding a denormalised index or a cache. A shard key whose *value changes* means
> every row that changes it has to be physically moved between machines, live, with a
> dual-write window and a consistency protocol — which is a reshard, and a reshard is the
> single most expensive routine operation in the industry. So the first filter on any
> proposed shard key is: **can this value ever change for a row that already exists? If
> yes, it is not a shard key.**

### 6.3 Fan-Out, the Reason Sharded Queries Are Slow

Fan-out is the cost every cross-shard query pays, and it is multiplicative in a way that
makes a "fast" sharded system slow.

```text
  ONE-SHARD QUERY — the good case
    shard(42)  ──── one network round trip, one index probe
      8ms

  N-SHARD SCATTER-GATHER — every cross-shard query
    ┌─────────┐   ┌─────────┐   ┌─────────┐   ┌─────────┐
    │ shard 0 │   │ shard 1 │   │ shard 2 │   │ shard 3 │   ... × 64
    └────┬────┘   └────┬────┘   └────┬────┘   └────┬────┘
         │ 8ms         │ 9ms         │ 8ms         │ 30ms   ← one slow shard
         └─────────────┴──────┬──────┴─────────────┘
                               ▼
                    the AGGREGATE takes as long as the
                    SLOWEST shard, not the average.
                    p50 = 9ms.   p99 = 400ms.

  THE THREE MULTIPLIERS
    1. LATENCY:  N round trips, run in parallel, so the total is
       max(per-shard) not sum(per-shard) — IF you parallelise.
       Serial fan-out is N × 8ms.  64 shards × 8ms = 512ms.
    2. LOAD:    a query that is 0.1ms of work on one shard is
       0.1ms × 64 = 6.4ms of work cluster-wide.  Fan-out does
       not just add latency, it multiplies load.  A dashboard
       that fans out is 64 queries, and 50 dashboards are
       3,200 queries, and that is how a cluster falls over.
    3. TAIL:    the p99 is set by the slowest shard AND by the
       queueing at the scatter-gather coordinator.  64 sockets,
       64 thread pool entries, and one coordinator that must
       stay up to combine — a new single point of failure that
       did not exist before sharding.
```

The arithmetic to have ready: **a scatter-gather query across 64 shards with 8ms median
per-shard latency has a ~9ms median and a p99 measured in hundreds of milliseconds.** The
median is fine — which is exactly why these systems ship and then disappoint. The p99 is
what users complain about, and it is composed of the slowest shard plus the coordinator's
own variance plus the tail of 64 connections competing for the same thread pool.

The mitigations, in the order to reach for them:

1. **Do not issue the cross-shard query on a request path.** This is the real answer. Global
   reports belong in a pre-aggregated table maintained asynchronously, or in a warehouse.
2. **Denormalise into the shard key's dimension.** A per-customer `merchant_id` list,
   maintained on write, so "orders for merchant 9001" becomes a lookup of 11 customer IDs
   and then 11 single-shard queries — bounded and predictable rather than unbounded.
3. **Co-locate by a second key.** Route rows by `customer_id` but *store* related rows
   that share a merchant in the same shard, so the join stays local. This buys a
   constraint (a row can only live in one place) for a large saving, and it is the design
   behind most "shard by tenant, co-locate by account" schemes.
4. **Cache the global answer.** Correct only with a stated staleness bound, and the
   staleness has to be a product decision (Volume 9 owns the cache mechanics; the
   cross-service caching correctness question belongs to the Microservices set, Volume 2,
   Chapter 8).
5. **Push the scatter into a background job with a budget.** Accept it, but bound it:
   chunk it, run it off-peak, and never let it share a pool with the request path.

### 6.4 The Reshard

A reshard is the operation of changing the shard key, the shard count, or the hash
function, with the data in place and the service running. It is the thing that makes
sharding a one-way door, and describing it accurately is what separates a candidate who
has sharded from one who has read about sharding.

```text
  RESHARD 32 → 64 SHARDS, live, no downtime

  PHASE 0  DUAL WRITE (days to weeks)
    every write goes to BOTH the old and new location
    a background job backfills the new location
    a reconciliation job compares the two continuously
    the old location is still authoritative for reads
    ← the system now has two writes per operation and
       therefore a dual-write consistency problem.  The
       Microservices set, Volume 2 Chapter 7, owns outbox and CDC
       as the principled alternative.

  PHASE 1  VERIFY
    row counts match, checksums match, replica lag is zero on both
    the cutover is a decision, not a date — "the numbers have
    matched for 7 days", not "we said Tuesday"

  PHASE 2  FLIP READS (an afternoon)
    read routing changes to the new location
    the old location is still written
    ← a read-after-write violation is now possible, and it is
       a correctness bug, not a performance one (Chapter 7)

  PHASE 3  STOP WRITING THE OLD LOCATION
    usually days later, once reads are stable

  PHASE 4  DECOMMISSION
    drop the old shards, remove the routing rules, delete the
    reconciliation job and its alerts

  TOTAL: weeks of dual-write overhead, a 2× storage bill for
  the duration, a rollback that is "flip reads back", and one
  new consistency protocol the team has to reason about for the
  whole duration.
```

The honest characterisation: **a reshard is a distributed migration of the entire dataset
under live traffic, with a dual-write window in the middle, and it is the reason the shard
key cannot change.** Every candidate who says "we can reshard if we pick the wrong key"
has described a plan that has never been executed.

There are two ways to reduce the cost, and both are design decisions made on day one:

- **Start with more, smaller shards than you need.** Thirty-two shards on hardware that
  could serve sixteen means the next doubling is a *split* (move half of each shard to a
  new one) rather than a *rehash* (move everything according to a new function). A split is
  a per-shard operation that can be done one shard at a time with a bounded blast radius;
  a rehash is a whole-cluster operation. This is the single most valuable piece of sharding
  advice and it is free on day one and impossible on day 400.
- **Make the routing function explicit and stored.** If shard assignment is a row or a
  lookup table rather than a hash function buried in application code, changing it is a
  data change. If it is `crc32(customer_id) % 64` written into a library, changing it is a
  deployment across every service plus a migration.

### 6.5 A Topology, and What Each Shape Buys

```text
  ONE WRITER, N REPLICAS PER SHARD  (the default; see Chapter 7)

     ┌────────────────────────────────────────────────────┐
     │  shard 0          shard 1          shard 2    ...   │
     │ ┌──────────┐    ┌──────────┐    ┌──────────┐        │
     │ │ PRIMARY  │    │ PRIMARY  │    │ PRIMARY  │  writes│
     │ ├──────────┤    ├──────────┤    ├──────────┤        │
     │ │ replica  │    │ replica  │    │ replica  │  reads │
     │ └──────────┘    └──────────┘    └──────────┘        │
     └────────────────────────────────────────────────────┘
        routing:  hash(customer_id) % 3  →  shard

 [prunes]  simplest. Writes are single-shard, so single-shard transactions
    and single-shard referential integrity. Reads scale per shard.
[full]   one writer per shard. Write throughput does NOT improve with
    more shards — it improves with more shards-per-row-group only
    if you split the shard key's value space (see below).
[full]   a failed primary is a promotion, a failover, and a
    single-shard availability gap.

  SPLIT BY SUB-RANGE — multiple writers for one logical shard

     shard 0                     shard 1
     ┌────┐┌────┐┌────┐┌────┐    ┌────┐┌────┐┌────┐┌────┐
     │ a–f││g–l││m–r││s–z│    │ a–f││g–l││m–r││s–z│
     └────┘└────┘└────┘└────┘    └────┘└────┘└────┘└────┘
       w1    w2    w3    w4       w1    w2    w3    w4
     customer_ids A–F, G–L, M–R, S–Z — disjoint, so
     "all orders for this customer" is ONE node.

 [prunes]  write throughput scales with sub-shards.
 [prunes]  this is how a hot shard is split without a rehash.
[full]   "all orders for these 4 customers" now spans nodes.
[full]   more moving parts, more connection pools (Chapter 8 scales
    with the node count, which is the number people forget).

  THE TRUTH ABOUT WRITE SCALING
  ─────────────────────────────
  A row lives in exactly one place.  Therefore:
    • more shards with the same key      → more capacity, same
                                           write rate per row
    • splitting a key's value space      → more writers, and
                                           the number of writers
                                           is now the number of
                                           sub-shards
    • there is no configuration of a
      relational store that gives you
      "write any row to any node"        → that is not a
                                           relational store
```

The last box is the one that saves a candidate from a bad answer. A system that lets you
write any row to any node — DynamoDB, Cassandra, Spanner with certain configurations — has
bought that capability by giving up something: a join, a cross-row transaction, or a
secondary index with strong consistency. Microservices Volume 2 Chapter 8 owns
database-per-service; the Microservices Volume 3 set owns the operational platform layer
where sharding middleware lives. What belongs to this volume is the *schema* decision: the
shard key, its four properties, and the queries it forces you to give up.

> **TRADE-OFF — "SHARD BY TENANT OR SHARD BY CUSTOMER?"**
>
> Almost every B2B system asks this. Tenant (account) sharding is the industry default and
> it wins on three counts that are genuinely decisive: it makes a noisy-neighbour problem
> solvable (a customer with 400× the average load gets its own shard, or its own cluster),
> it makes data isolation and per-tenant deletion a routing decision rather than a `DELETE`,
> and it makes the cross-tenant query — which every SaaS needs for support, billing and
> analytics — the *unusual* one rather than the common one.
>
> It loses on the two hardest properties. **Stability**: tenants get acquired, merged and
> migrated between plans, and a tenant that moves is a reshard. **Evenness**: a shard keyed
> on tenant id is only as even as the tenants, and SaaS tenant distributions are famously
> power-law — a handful of enterprise tenants routinely produce 30% of the load, and no
> amount of hashing a skewed input fixes that.
>
> The condition that flips it is **whether the product is multi-tenant as a feature or as
> a storage detail.** If a customer never sees another customer's data, tenant sharding is
> correct and the support queries are a small, well-understood minority. If the product is
> a single logical marketplace where a user interacts with many counterparties — a payments
> network, a marketplace, a social graph — then the *user* is the natural boundary, the
> tenant is a filter rather than a location, and sharding by tenant makes the most common
> query in the product a cross-shard query.

#### Common Mistakes

- Reaching for sharding when a missing index or a too-large working set is the actual
  problem, and getting a distributed system with the same latency
- Choosing a shard key with low cardinality or a power-law distribution and calling the
  result "evenly distributed"
- Choosing a shard key that can change — a status, a region, a plan tier, a merchant — and
  thereby guaranteeing a reshard
- Choosing a shard key that is not in the hot query's `WHERE` clause, so the hot query is
  a scatter-gather, and not noticing because the median is fine
- Issuing cross-shard queries on a request path, and blaming the p50 when the p99 is the
  problem
- Starting with exactly the number of shards the hardware needs, so the next doubling is a
  full rehash rather than a per-shard split
- Assuming that adding shards increases write throughput, when a row lives in exactly one
  place
- Putting the hash function inside application code instead of in a table, so changing it
  is a fleet-wide deployment plus a migration

#### Interview Questions — Sharding

**D1. Design the sharding for a B2B marketplace. Customers, merchants, orders, and
payments. Tell me the shard key, the four properties checked, the queries that lose, and
what you would do about the big merchant.** `STAFF`

The shard key is `customer_id`, and the reason is query alignment, not the obviousness of
"tenants". Let me check the four properties out loud. *Cardinality*: 4.2 million customers,
against 64 target shards — 65,000 customers per shard, fine. *Evenness*: order volume per
customer is close to log-normal rather than power-law, so a hash of `customer_id` is
even to within a few percent, and I would verify it with an actual `GROUP BY` on
`order_count` bucketed by hash before committing. *Stability*: a customer row's
`customer_id` never changes — merges are handled by a separate identity-resolution table
and a planned offline move, which is a reshard I would rather have rarely than often, and
the merge process is a business process that can wait for a maintenance window. *Query
alignment*: this is the one that decides it. "My orders", "my saved sellers", "my
payments", "my disputes" — the overwhelming majority of the product is a customer looking
at a customer, and every one of those is one shard. "All orders for merchant 9001" and
"all orders in the last 7 days" are not, and those are the queries that lose.

The queries that lose, named: merchant order listing, global revenue reporting, and
cross-marketplace search. I would handle each differently. Merchant listing becomes a
denormalised `merchant_id → customer_id[]` lookup table maintained on write, so the query
becomes "find these 11 customers, then 11 single-shard reads" — bounded and predictable
rather than a 64-way fan-out. Global revenue is a warehouse query; it reads a
pre-aggregated rollup, not the OLTP shards, whatever the shard key is. Search goes to a
search engine (Volume 11) fed by the change stream.

The big merchant is the interesting part and it deserves a real answer rather than a
gesture. If one merchant is 8% of orders, hashing by `customer_id` puts those orders
across all shards, so no single shard is hot from it — *unless* the merchant's buyers are
themselves skewed toward a few customers, which they usually are. So the mitigation is
three-layered: the denormalised merchant-to-customer map (which bounds the read), a
per-merchant aggregation maintained on write (so the listing query does not read order
rows at all), and an escape hatch — a merchant whose order rate exceeds a threshold gets
its *own* sub-shard keyed on `merchant_id` for a separate high-volume table, which is a
deliberate second shard key for one entity and an admission that perfect uniformity was
never achievable.

The last thing I would say: the routing function is a lookup table, not a hash in code, and
we start at 64 shards on hardware that serves 32, so the next doubling is a split. Both
cost nothing now and are both impossible to retrofit.

**T2. A sharded system fans out a query across 64 shards. Per-shard latency is 8ms at p50
and 40ms at p99. The end-to-end p50 is 9ms and the end-to-end p99 is 600ms. Account for
the 600ms.** `ADVANCED`

The 600ms is not the per-shard p99 — it is 15× the per-shard p99, so something in the
scatter-gather layer is adding latency that the shards themselves do not have. There are
four contributors, and in a real system it is usually a combination.

**The slowest shard, not the average.** The end-to-end latency is `max(per-shard)`, so it
is set by the p99 *of the maximum across 64 shards*, not by the 64th percentile of any
one shard. If per-shard latency were perfectly independent, the maximum of 64 samples from
a distribution with a 40ms p99 lands well above 40ms — order 150–250ms. The amplification
comes purely from taking 64 draws instead of 1. This is a statistical fact, not an
engineering failure, and it is why fan-out hurts the tail far more than the median.

**Serial rather than parallel fan-out.** If the coordinator issues shards sequentially —
which a naive client with a connection pool of 4 will do, queuing 60 of the 64 requests —
then 64 shards at 8ms is 512ms, and 16 of them at 40ms is 640ms. The fix is a coordinator
with a dedicated pool sized above the shard count, or at least enough to saturate it, and
the number that decides it is the ratio of the pool size to the shard count.

**The coordinator itself.** 64 sockets, 64 result buffers, 64 goroutines or threads, and a
coordinator that has to stay resident for the whole query. The result assembly — merging
64 sorted result sets for a paginated query — is CPU and allocation work that does not
appear in any shard's latency, and it is on the critical path. A `LIMIT 20` query that
fans out to 64 shards has to fetch 64 sorted streams and merge them, and that merge is
O(N log 64) over whatever each shard returned before the coordinator can discard most of
it.

**Head-of-line blocking in a shared pool.** If the scatter-gather runs on the same
connection pool as the request path — which is the default in most frameworks — then 50
concurrent fan-out queries occupy the entire pool, and the 51st user-visible request waits
for a dashboard query to finish. The p99 is then set by *other users' dashboards*, and no
amount of shard-side optimisation moves it. The fix is a separate pool for scatter-gather
with its own size, its own timeout, and a concurrency cap, so a fan-out storm degrades
fan-out rather than the product.

The correct answer to the interviewer is that 9ms p50 and 600ms p99 is a *healthy-looking
median hiding a scatter-gather problem*, and the first measurement is to break the 600ms
into fan-out time, coordinator merge time, and pool wait time — because those three have
three completely different fixes and only one of them is about the database.

**D2. A competitor just sharded onto 64 nodes and is winning on latency. We have one very
large machine and are also losing on latency. What do you tell my CTO?** `STAFF`

I would tell them that the competitor's latency win is not evidence that sharding was the
cause, and that copying it would cost us a quarter and might not move the number at all.
The first thing to establish is *which* queries are slow. If it is the reporting and
dashboard queries — and in my experience it almost always is — then the fix is
pre-aggregating them, not distributing the transactional data, and pre-aggregation is a
week's work. If it is the core transactional path and the single node is genuinely
saturated on CPU or I/O, then the conversation is real and sharding is on the table, but
the next step is to measure what is saturating: an expensive query plan, a missing index,
a hot row contended by 4,000 writes/second, or a vacuum that cannot keep up. Those are all
one-node problems with one-node fixes, and sharding distributes the symptom.

The second thing I would say is the connection count. Before we have 64 nodes, we have 40
services × 25 instances × a pool size somebody set to 200, and that is 200,000 potential
database connections against a `max_connections` of a few hundred. That is Chapter 8, and
it is the wall that hits most teams first — usually at around 300 concurrent connections,
long before the disk fills. The order of operations for a team in our position is: pool
management, then index review, then vertical partitioning of the wide tables, then
archiving cold partitions, then pre-aggregating the reports, and only then sharding.

The third thing, which is the staff answer: **sharding is a decision about the org as much
as the data.** It means every team that touches the schema now needs to know the shard
key, needs a connection pool sized for their own share, and needs to answer "can I run this
query without fanning out?" in code review. It creates a permanent constraint that shows
up in every future design discussion, and the constraint is invisible until you are already
living inside it. My ask to the CTO is for a named owner for the routing layer, a written
policy on which queries may fan out, and agreement that the shard key decision gets a
design review with the two most senior engineers in the room — because the alternative is
that it gets decided in a ticket by whoever is on call that week.

> **CHAPTER 6 SUMMARY**
>
> Sharding is many databases where partitioning was many pieces of one, and it is the only
> decision in this volume that cannot be reversed in practice. The shard key must have
> four properties — cardinality, evenness, **stability** (the one that cannot be repaired,
> because a changed value means a reshard) and **query alignment** (the one that decides
> whether the hot query is one node or all of them) — and the correct order of reasoning is
> to pick the key from the query patterns first and check the distribution second, because a
> key that is perfectly even but absent from your hot `WHERE` clause produces a system
> whose median looks fine and whose p99 is a scatter-gather across 64 shards. Fan-out is
> the tax: it multiplies latency at the tail, multiplies cluster load by N, and introduces
> a coordinator that is a new single point of failure. The mitigations for it are to get the
> cross-shard query off the request path, denormalise a mapping so the fan-out is bounded
> rather than total, co-locate related rows, and cache with a stated staleness bound. Start
> with twice the shards you need so the next growth is a split rather than a rehash, keep
> the routing function in a table rather than in code, and treat the reshard as a planned
> quarter of dual-write overhead rather than a hope that the key was right.

#### Further Reading

- [Vitess — Sharding Architecture](https://vitess.io/docs/reference/features/sharding/) — the reference treatment of a real sharding system, including vindexes, resharding and scatter queries.
- [AWS DynamoDB — Designing Partition Keys to Distribute Workload](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Partitioning.html) — the four shard-key properties stated as operational guidance by a vendor that lives with the consequences.
- [Jepsen — Consistent Enough](https://jepsen.io/analyses/dynamodb-2-0.html) — what actually happens to a cross-shard query under failure, and why the vendor's phrasing and the observed behaviour differ.
- [PlanetScale — Sharding MySQL](https://planetscale.com/blog/sharding-mysql) — the practical mechanics of a managed sharded MySQL, including resharding and the operational surface it adds.
- [Martin Kleppmann — A Guide to the Family of Error-Prevention Protocols](https://martin.kleppmann.com/2016/02/08/how-safe-are-safe-transactions.html) — why the dual-write phase of a reshard is the hard part, and the alternatives.

## Chapter 7 — Replication & Read Scaling

### 7.1 The Arrangement, and the Read Routing Diagram

A replica is a full copy of a database kept current by streaming its changes. It buys read
capacity, it buys a copy you can query without harming the primary, and it is a
single-node failure-domain improvement that is *not* a high-availability story on its own.

```text
                     WRITES
                       │
                       ▼
          ┌────────────────────────────┐
          │        PRIMARY             │
          │  WAL ──► apply ──► heap    │
          └─────┬───────────┬──────────┘
                │           │
        async   │           │  synchronous (quorum)
        replica │           │  waits for N acknowledgements
                ▼           ▼
        ┌──────────┐  ┌──────────┐
        │ REPLICA  │  │ REPLICA  │
        └────┬─────┘  └────┬─────┘
             │             │
             ▼             ▼
        READS (lagged)  READS (lagged)

  READ ROUTING
  ─────────────
   request ──► router / proxy / middleware
                  │
                  ├── "did this client just write?"  ──► PRIMARY
                  ├── "is this read-after-write?"    ──► PRIMARY
                  ├── "is this within the RYW window?"──► PRIMARY
                  ├── "is this an explicitly stale-
                  │    tolerant read?"                ──► REPLICA
                  └── "everything else"                ──► REPLICA
                  (the overwhelmingly large majority — this is
                   where the read capacity actually comes from)

  READ REPLICA
      ▲
      └── one replica of a replica.  Used for reporting and
          analytics so a heavy query cannot lag the read replicas
          serving the product.  It is N replication hops further
          behind, and the lag is cumulative.
```

That diagram is the whole of Chapter 7 in one picture, and almost every question below is
a question about one of its four elements: the primary's WAL, the replication mode, the
read router's rules, or the lag.

### 7.2 Synchronous, Asynchronous, and the Price of Each

```sql
-- PostgreSQL: asynchronous. The commit returns as soon as the WAL
-- is on the primary's disk. The replica catches up whenever it can.
--  [prunes]  write latency is unaffected by replica health
-- [full]   a primary failure can lose the last N transactions
-- [full]   every read from a replica can be stale
synchronous_standby_names = ''

-- PostgreSQL: synchronous_commit = on with one sync standby.
-- The commit waits for the replica to confirm it has the record.
--  [prunes]  zero data loss on a single-primary failover
-- [full]   write latency now includes the replica's round trip
-- [full]   AND: if the sync replica is DOWN, writes BLOCK until it
--      comes back (or until synchronous_commit_timeout fires
--      and the commit is allowed to proceed unsynchronised).
synchronous_standby_names = 'replica_1'
synchronous_commit = on
synchronous_commit_timeout = 3s
```

> **INTERVIEW TRAP — "SYNCHRONOUS REPLICATION GIVES US DURABILITY WITHOUT COST"**
>
> There is a cost, and it is not primarily latency — it is **availability**. With a
> synchronous standby, the primary's commit path depends on the replica being up. If the
> replica is down, restarting, or simply slow, writes block. A read-only replica failure
> becomes a write outage on the primary. That is the trade: you have converted a
> *durability* problem (losing the last few transactions on failover) into an
> *availability* problem (not being able to write at all), and the second one is usually
> worse because it is happening now rather than during a failover you may never have.
>
> The engineering answer is the quorum, and the number to be able to produce: with `N`
> replicas and requiring `M` acknowledgements, the write path survives the loss of
> `N − M + 1` replicas. Two replicas requiring one acknowledgement (`ANY 1 (...)`) tolerates
> the loss of one replica and is *still synchronous*. One primary and two replicas
> requiring two acknowledgements is a configuration where the replica count includes the
> primary itself, so it is `FIRST 2 (...)` and it means "the primary plus one replica" —
> and then losing *both* the primary and that replica is an outage, which is correct and
> should be stated as the cost.
>
> The other cost, the one people forget: synchronous replication makes write latency depend
> on the *slowest* replica, so one lagging replica degrades the whole write path. And the
> default posture most teams should have is deliberate: asynchronous with a
> `synchronous_commit_timeout` as a bounded backstop, plus a documented RPO (how many
> seconds of writes can be lost), because "we might lose a few seconds of writes" and "we
> can lose nothing" are both acceptable answers as long as somebody chose one on purpose.

### 7.3 Replica Lag Is a Correctness Problem

This is the point the chapter exists to make, and it is worth stating with the mechanism
rather than the slogan.

```text
  TIMELINE
  ────────
  t=0ms      user submits a profile edit        → PRIMARY
  t=12ms     commit returns                      → PRIMARY
  t=15ms     user navigates to the profile page
  t=18ms     SELECT * FROM profile WHERE id=42   → REPLICA[full]    (pre-edit value)
            ───────────────────────────────────────────────────────────
            THE USER SEES THEIR OWN EDIT REVERTED.

  t=400ms    the same SELECT, again              → REPLICA
            ───────────────────────────────────────────────────────────
            Now it is correct.  Nothing was wrong.  Nobody
            logged an error.  The page was simply wrong for
            400ms, and the support ticket says "the site
            lost my change".
```

The three manifestations, all of them correctness failures:

- **Read-after-write violation.** The user writes, then reads, and does not see their own
  write. It is a violation of a guarantee most users believe is absolute, and no amount of
  average latency matters once they have seen it once.
- **The "ghost" record.** A user deletes an account, sees it gone, refreshes, and sees it
  back. Or: a user cancels a subscription, the primary records the cancellation, a
  background job reads from a replica and concludes the account is still active, and
  reactivates it. This is the version that causes real damage rather than embarrassment.
- **Monotonicity violation inside a single page.** A list page reads the replica for the
  header (showing 12 items) and the replica again a moment later for the items (showing 14
  new ones). Nothing is individually wrong and the page is incoherent.

The lag is not a fixed number, and treating it as one is the second mistake. Typical
figures: **10–200ms on a quiet system with asynchronous replication and a fast network;
seconds during a checkpoint, a bulk load, a `VACUUM`, a network interruption, or a replica
that is CPU-starved; and unbounded during a replica restart or a failover.** The single
most under-appreciated cause is the last one: an operationally-triggered replica restart
(`pg_ctl restart`, a failover, an OS patch) resets lag to zero and it rebuilds from the
WAL position it was at, and if there was a large write backlog the catch-up is a
sequential replay that can take minutes. During that window *every* read from that replica
is stale, and the lag metric is the only thing that says so.

### 7.4 Fixing Read-After-Write

Four mechanisms, and they compose. The honest engineering answer is that a system with
replicas needs at least one of them plus a stated policy about which reads may be stale.

```text
  1. SESSION / STICKY ROUTING
     the client that just wrote is routed to the primary for a
     window of time.  Simple, and the reason most CDNs and
     shopping carts feel "sticky" in a good way.
     Cost: a sticky window is a correctness heuristic, and its
           length is a guess.  Too short and the bug survives;
           too long and a large share of your traffic hits the
           primary and the replica is doing nothing.
     Works badly for:  mobile clients that reconnect, background
           jobs, anything not request-scoped.

  2. STICKY REPLICA (the correct general answer)
     the write records the replica's LSN at commit time, and
     reads are routed to a replica whose LSN is >= that value.
     No guessing a duration.  Correct for any lag distribution.
     Cost: a round trip to check the LSN (or a cached, sampled
           one), and if the write shard's replica is down the
           read has to wait or go to the primary.
     In PostgreSQL this is `pg_last_wal_replay_lsn()` on the
     replica, compared against the primary's `pg_current_wal_lsn()`
     recorded in the session.

  3. MONOTONIC READS
     the client sends the highest value it has already seen, and
     the reader will not return anything older.  This fixes
     "page 1 showed 12, page 2 showed 14" and the ghost record,
     and it does NOT fix "I just wrote and did not see it".
     Implemented with a `WHERE seen_version <= :last_seen` on a
     monotonic column, or by holding a per-session floor.

  4. READ YOUR WRITES, EXPLICITLY
     the read-after-write path is opt-in at the call site.  The
     endpoint that redirects after a save goes to the primary.
     Honest, verbose, and it scales because it is a small,
     named set of endpoints rather than a global rule.

  AND THE DEFAULT, WHICH IS NOT A FIX:
  5. "eventually consistent" as a product statement, with a
     staleness bound that has been agreed with somebody who
     owns a business consequence.  A 5-second bound on a
     follower count is fine.  A 5-second bound on "your payment
     failed" is not.
```

> **MUST REMEMBER**
>
> A replica is a **correctness** surface, not a performance surface. The moment reads are
> served from it, the system has two answers to every question and a guarantee that was
> previously absolute — "a committed write is visible" — is now "a committed write is
> visible, eventually, except on the replica, where it is visible when it arrives". Every
> mechanism above is a way of restoring part of that guarantee for a specific class of read,
> and the failure mode of *not* having one is not a slow page; it is a user being told the
> system lost their change, or a job acting on state that has already been superseded.

### 7.5 Cascading Replicas, and Why Reporting Belongs on One

```text
  PRIMARY ──► READ REPLICA (serves the product)
                  │
                  └──► REPORTING REPLICA (serves dashboards, BI)
                        │
                        └──► ARCHIVE / ETL CONSUMER

  Every hop adds lag. The reporting replica is behind the read
  replica, which is behind the primary. A report that says
  "as of now" is wrong by the sum of the hops, and nobody knows
  what that sum is because it depends on load.

  WHY IT IS WORTH IT:
    a dashboard query that scans 900 million rows for 4 minutes
    does NOT block product traffic on a separate reporting
    replica.  On the product read replica it would blow the
    lag, and blown lag is read-after-write violations for
    every user, caused by Finance running a report.
```

The operational rule that follows: **the replica serving the product is a production
dependency and is sized and alerted as one.** Replica lag, replica CPU, and replication
throughput are paging-level metrics on the product replica. The reporting replica has its
own, looser, alerts — and the two are separated specifically so that an unindexed report
cannot cause a correctness incident for users.

> **PRODUCTION SCENARIO**
>
> Problem: users reported that saving a change to their profile sometimes appeared to do
> nothing, and that one support ticket described an account "reappearing after being
> deleted". No errors in any log. Latency was normal.
> Investigation: the profile page was served from a read replica. Replica lag was being
> monitored as a 5-minute average and read as "healthy" (average 40ms) while the p99 lag
> during business hours was consistently 3–8 seconds, spiking after the nightly reporting
> job started. The "reappearing account" was a scheduled retention job that read
> `deleted_at IS NULL` from the replica to decide which accounts to purge; on a lagging
> replica it found an account that had been deleted nine seconds earlier, concluded it was
> still active, and reactivated it. The next run, nine seconds later, found it deleted
> again, and the flapping continued for as long as the lag did.
> Root cause: read-after-write violation on the profile page (no sticky routing, no
> read-your-writes on the save-then-redirect path), and — the more serious finding — a
> *background job* reading from a replica and treating its view as authoritative for a
> destructive decision. Replica lag was monitored with an average, which is the one
> statistic that cannot detect this class of problem.
> Solution: the save-then-redirect endpoint was routed to the primary; the retention job
> was moved to the primary with a `FOR UPDATE SKIP LOCKED` batch pattern and a hard
> timeout; the reporting job was moved to a cascading reporting replica so it stopped
> causing product lag; and replica lag alerting changed from a 5-minute average to
> per-minute p99 with a 2-second page threshold.
> Prevention: any job that takes a *destructive or state-changing* action reads from the
> primary, and that rule is in the service's data-access template. Reads that may be stale
> are reads that only produce a response to a human.

#### Common Mistakes

- Believing synchronous replication is free, and only discovering that a read-replica
  outage has become a primary write outage
- Setting `synchronous_standby_names` without a `synchronous_commit_timeout`, so a replica
  failure blocks writes indefinitely rather than degrading to asynchronous
- Monitoring replica lag as an average, which is the one statistic that cannot detect a
  correctness problem, because the problem is a tail
- Routing every read to a replica because the reads are "read-only", including the read
  that immediately follows the write on the same page
- Letting a destructive or state-changing background job read from a replica and act on
  what it sees
- Running reporting and analytics against the replica that serves product traffic, so a
  Finance query causes a user-visible correctness problem
- Assuming a replica is a high-availability solution on its own — losing the primary is
  still a promotion, a routing change and a data-loss decision, and it is not automatic

#### Interview Questions — Replication & Read Scaling

**P1. After a routine failover last night, an engineer noticed a customer had been charged
twice for one order. The primary's log shows one `INSERT` into `payments`. Where do you
start, and what is the likely mechanism?** `STAFF`

Two mechanisms, and I would check them in this order because they are more likely and
cheaper to confirm. First, **asynchronous replication and lost writes**: with
`synchronous_standby_names` unset, the primary acknowledged the commit as soon as its own
WAL was durable, and the failover promoted a replica that had not yet received the
`INSERT`. The customer's money moved and the order does not exist in the new primary, so
the retry from the client — which is exactly what a well-behaved client does on a timeout —
created a second payment. The diagnostic is the old primary's WAL: if the `INSERT` is
there and was acknowledged, the loss was replication lag at the moment of failure, and the
fix is the RPO decision, not the client.

Second, **the retry itself is not idempotent**. Even with zero data loss, a client that
retries on a network timeout has no way to know whether the first attempt committed, and a
`payments` table with no idempotency key will happily take the second write. This is
arguably the deeper defect, because it exists whether or not replication loses anything.

The resolution is three things, and the third is the staff one. First, a durability
decision made on purpose: if we cannot lose acknowledged writes, the write path has to
wait for a quorum, and the cost is that a replica outage becomes a write outage, which
requires a `synchronous_commit_timeout` and a documented degradation behaviour. Second, an
idempotency key on every externally-triggered money-moving operation, unique-constrained,
with the retry carrying the same key. Third — and this is what I would raise in the
post-mortem — a decision about *when* the retry logic is allowed to fire. A client that
retries a `POST /payments` after a 2-second timeout, against a system that took 3 seconds,
has created a second payment. That is a client policy, and the policy should be "retry only
idempotent operations, and for the rest, query the state first".

**D1. We are adding three read replicas and routing 90% of reads to them. Walk me through
the design, the failure modes, and what you would put on the dashboard.** `STAFF`

The design starts with the routing rules, because they are the actual design and the
replicas are just hardware. The rules, in priority order: any read in a session that has
written within the last N milliseconds goes to the primary; any read tagged explicitly
`require_fresh` goes to the primary — that set is the save-then-redirect endpoints, the
account and permissions checks, and every read inside a destructive job; everything else
goes to a replica. I would implement it as a middleware concern with a per-request
decision, not as a config flag per query string, so the default is safe and the exception
is explicit. I would also add the *sticky replica* mechanism rather than a time window,
because a time window is a guess about lag and sticky-by-LSN is not — the write records
the replica's replay LSN and the read refuses to go to a replica behind it.

The failure modes, named before they happen. Replica lag exceeding the freshness
requirement, which is a correctness event and pages. A replica dying, which for
asynchronous replication is *not* a primary problem but for synchronous it is — so I would
state explicitly whether the write path depends on any replica and what the degradation
behaviour is. A replica being *silently* wrong rather than merely stale, which is the
scary one: a replica restored from a bad backup, or one where a `pg_rewind` went the wrong
way, will serve confidently incorrect data, and no lag metric detects it. The mitigation
is periodic row-count and checksum comparisons against the primary. A replica running out
of disk, which historically is how replication *stops* rather than fails — and a stopped
replication with a healthy process is the worst of both.

The dashboard, six panels. Replication lag in seconds, per replica, as a p99 over one
minute and not an average, with a threshold at 2 seconds and a page at 10. Bytes
replicated per second versus bytes generated, so a backlog is visible before the lag
metric moves. Replica disk free, because that is the leading indicator. Replica CPU and
I/O, because a CPU-starved replica is a slow replica and a slow replica is a lag
generator. Query count split primary versus replica, because "90% of reads" is a claim
that should be continuously verified rather than assumed. And the count of reads served
from a replica *within a freshness violation* — an application-level metric, not a
database one, and the only one that measures the thing users actually complain about.

The last thing I would say: with three replicas plus a primary, and 40 services, the
connection count is now a different problem than it was. Chapter 8 is where that becomes
arithmetic, and it is the constraint that will determine how many replicas you can
actually afford, because each replica is a full set of `max_connections` slots being
consumed by pools that were sized for one database.

**T2. Replication is asynchronous, one replica, and the monitoring shows a 5-minute
average lag of 35ms. A user reports their last edit was lost. What is the minimum
explanation consistent with all of this?** `ADVANCED`

The average is the tell. A 5-minute average of 35ms is compatible with a lag distribution
whose median is 20ms and whose p99 is 30 seconds — for example a replica that is perfectly
caught up except for a three-minute window every hour when the nightly `VACUUM` or the
checkpoint runs. The average barely moves, because 57 minutes of 0.02s dominates the mean
over 300 seconds. So the monitoring is not wrong, it is measuring the wrong statistic for
this failure mode, and that alone explains the gap between what the dashboard said and
what the user experienced.

The minimum mechanism consistent with it: the user's write committed to the primary at
`t=0`; the read was routed to the replica at `t=400ms`, in the middle of a lag window; the
replica returned the pre-edit value. Nothing else needs to be true. No failover, no bug, no
replication stop — just an average that cannot see a tail.

The second-order question an interviewer will press with is "and what else could it be",
and the honest list is short: a read routed to a *different* replica than the one the
write path tracks (three replicas, no sticky routing, so the read hit the one with the
lag); a caching layer in front (Volume 9) serving a stale entry with a TTL that outlives
the change; or a load balancer routing the write to primary A and the read to a standby
that is synchronously replicating from a different node entirely — a failover that left
traffic split. The first is by far the most likely, and the diagnostic that distinguishes
all four in one step is: can the support engineer reproduce it by replaying the request
against the primary directly? If the primary returns the correct value, the write is fine
and the read path is at fault, and the read path has three candidates (replica, cache,
wrong node) that can be separated by disabling each in turn.

**S1. A PR routes all reads without a `WHERE` clause to a read replica, on the reasoning
that "they are read-only queries". Review it.** `STAFF`

The reasoning is exactly the misconception, and the reviewer's job is to replace it with
the real one: "read-only" is a property of the SQL, and freshness is a property of the
*question being answered*. The queries this rule mis-routes are exactly the ones that
matter, and they are all of one shape — a read that immediately follows a write in the same
user-visible flow. The checkout confirmation page that reads the order the user just
placed. The profile page after a save-and-redirect. The "your subscription was cancelled"
acknowledgement. The permissions check that decides whether the user sees the admin menu
after a role change. Each of those is a read-only `SELECT` and each of them is a
read-after-write violation waiting for a lag window.

The blocking comment should be specific: a blanket rule for `SELECT` is not reviewable and
not safe, and the safe default is the opposite one — route to the primary, and opt *into*
staleness explicitly per call site, with the call site naming why it tolerates it. That
inverts the failure mode: a developer who has not thought about freshness gets correctness,
and a developer who has decided to accept staleness has to write down the decision.

The second comment is about the mechanism, not the rule. A time-based sticky window
(`last write within 5 seconds → primary`) is a guess about the lag distribution, and the
guess is wrong in exactly the cases that matter. A sticky-replica mechanism that records
the replica's LSN at write time and refuses to read from a replica behind it is correct
regardless of how laggy the replica gets — it just becomes slow, which is the right failure
mode. If the team wants the cheap version, take the time window, but set the window from
the measured p99 lag and alert when p99 lag exceeds the window, because at that point the
guarantee is void and nothing in the application will tell you.

The third comment is the operational one this PR will cause: routing reads to replicas
means replica lag is now a *page-level* correctness metric for this service, so the
service's runbook has to say what to do when it pages, and the answer cannot be "restart
the replica" without someone having thought about what that does to the freshness
guarantee for the duration of the restart — which is minutes, and during which the read
router will either fail over to another replica (also lagged) or send everything to the
primary (which is fine and is the correct fallback).

> **CHAPTER 7 SUMMARY**
>
> Replicas buy read capacity and a place to run reports; they do not buy correctness, and
> they take a guarantee away. Once reads are served from a replica, "a committed write is
> visible" becomes "a committed write is visible eventually", and the failure mode of
> ignoring that is not slowness — it is a user not seeing their own edit, a deleted account
> reappearing because a job read a lagging replica and reactivated it, or a single page
> incoherently mixing two points in time. The fix is a *routing policy*, not a config flag:
> freshness-sensitive reads to the primary by default, staleness opt-in per call site, and
> sticky-by-LSN rather than sticky-by-timer so the mechanism is correct under any lag
> distribution. On the write side, synchronous replication trades **availability** for
> durability — a dead sync replica is a write outage — so the mode, the quorum, and the
> resulting RPO should be chosen deliberately and written down. And on the monitoring side,
> the one statistic that cannot detect any of this is the average lag: the failure is a
> tail, and a three-minute lag window every hour averages to 35ms.

#### Further Reading

- [PostgreSQL — Replication](https://www.postgresql.org/docs/current/replication.html) — the official architecture, the physical-versus-logical distinction, and slot management.
- [PostgreSQL — Warm Standby Servers & Synchronous Replication](https://www.postgresql.org/docs/current/warm-standby.html#SYNCHRONOUS-REPLICATION) — `synchronous_standby_names`, the quorum forms, and what the `FIRST`/`ANY` distinction actually means.
- [PostgreSQL — Logical Replication and Replication Slots](https://www.postgresql.org/docs/current/logical-replication.html) — the mechanism for the read replicas that need different indexes, and the slot-lag failure mode.
- [Jepsen — Consensus, Pt. 2: Replication](https://jepsen.io/analyses/consensus-2.html) — what replicated systems actually guarantee, and why "it is replicated" is not a durability argument.
- [Debezium — PostgreSQL Connector](https://debezium.io/documentation/reference/stable/connectors/postgresql.html) — the change-data-capture path from a replica to a downstream read model, which is how most systems build their non-shardable projections.

## Chapter 8 — Connection Pooling & Client-Side Limits

### 8.1 The Database Is the Scarce Resource

Every other resource in a system scales by adding a machine. The database does not. A
PostgreSQL server has a `max_connections`, and every connection is a *process* with its own
address space, its own memory for buffers, sort and hash state, and its own entry in the
lock tables. The ceiling is not a configuration number you can raise; it is a physical one
that gets worse as you raise it.

```text
  THE MODEL
  ─────────
  PostgreSQL:  ONE BACKEND PROCESS PER CONNECTION.
  MySQL:       ONE THREAD PER CONNECTION.
  Both:        each connection holds memory whether or not it is
               running a query.

  PostgreSQL work_mem = 4MB (default 4MB in modern versions)
    A single sort may allocate work_mem PER SORT NODE, and a
    hash join may allocate it per hash table.  A pathological
    query on one connection can allocate 100MB–1GB.
    500 connections × even 16MB of working memory
                       = 8GB of RAM that the OS has taken
                         away from the shared buffer pool
                         EVEN IF THE CONNECTIONS ARE IDLE.

  The second cost is lock-table memory: every transaction holding
  a lock consumes entries in the lock manager's shared array, and
  that array is fixed-size and partitioned — 256 partitions by
  default.  Past a few thousand concurrent lockers, lock
  acquisition starts to spin on contended partitions.  This is
  the "LWLock contention" you see in a 500-connection server,
  and it makes every query slower, including the ones doing
  nothing.

  THE THIRD COST, AND IT IS THE ONE THAT BITES
  500 concurrent connections on one machine means every query
  contends for CPU with 499 others.  Context switching, cache
  thrash on the shared buffer pool, and a run queue longer
  than the core count.  p50 might survive.  p99 and p999 will
  not.  You have made the database worse by making it busier.
```

> **INTERVIEW TRAP — "WE INCREASED max_connections TO 1000 TO FIX THE TIMEOUTS"**
>
> This is a genuine, extremely common production anti-pattern, and it works for about a
> day. The reasoning is locally correct — application threads were timing out waiting for
> a connection, so more connections means fewer timeouts — and globally wrong, because the
> timeouts were a *symptom* of a queue, and adding capacity to a queue that is already
> saturated moves the queue into a different resource.
>
> What actually happens: the pool sizes were not the problem; something was making queries
> slow, so connections were held longer, so the pool of 200 became a queue of 200 waiting
> requests, so the pool grew to 500, so the database now has 500 processes competing for
> 8 cores with a run queue of 500, so every query — including the fast ones that were not
> part of the original problem — is now slow, so connections are held even longer, so
> application threads exhaust *their* pools, and you have a positive feedback loop. **The
> system is now strictly worse and it is worse in a way that gets worse under load, which
> is exactly when you cannot afford it.**
>
> The correct diagnosis chain is: what is the actual query latency distribution, how many
> connections does the server actually need to serve that latency at the offered load, and
> what is making the slow queries slow. And Little's Law gives the third answer directly:
> **concurrency = throughput × latency.** At 2,000 queries/second and 20ms of latency, the
> database needs about 40 concurrent connections. A pool of 500 is not a safety margin,
> it is a queue with extra steps.

### 8.2 Little's Law, Applied to a Database

The arithmetic is short and it is the single most useful thing to have ready for this
chapter.

```text
  LITTLE'S LAW:   L = λ × W

  L  = number of connections the database needs (concurrent work)
  λ  = throughput the system must sustain  (queries/second)
  W  = average time one query occupies a connection (seconds)

  ─────────────────────────────────────────────────────────────────

  λ = 2,000 queries/sec,  W = 20ms = 0.020s
  L = 2000 × 0.020 = 40 connections.     ← the system needs 40.

  λ = 2,000 queries/sec,  W = 200ms = 0.200s     ← queries got slow
  L = 2000 × 0.200 = 400 connections.             ← 10× the resources

  THE SAME 2,000 qps with the same 400 connections is what a
  500-connection pool is trying to sustain, and it is sustaining
  it by *destroying* throughput: 400 processes on 8 cores cannot
  do 2,000 queries/second at 200ms each — they do maybe 800/second
  and the queue is where the rest of the demand lives, which
  is your p99.

  ─────────────────────────────────────────────────────────────────
  So: 500 connections is worse than 50 for two distinct reasons.
  1. A pool of 50 CONVERGES to the latency the database can
     actually deliver.  Excess demand is rejected fast (or
     times out fast) instead of becoming a queue.
  2. A pool of 500 AMPLIFIES.  Each connection costs memory and
     CPU even when idle, and 500 of them turn a latency problem
     into a throughput problem, which is worse because
     throughput problems do not recover when the load drops.
  ─────────────────────────────────────────────────────────────────

  HOW TO SIZE IT, IN PRACTICE
    1. Measure the true p95/p99 query latency, not the average.
       p99 = 200ms is what the pool has to be able to absorb.
    2. L = λ_p99 × W_p99, then multiply by a SAFETY FACTOR
       of 1.5–2.  Not 10.
    3. Add PgBouncer in transaction pooling mode and set the
       POOL total to 2–4× max_connections, not 500 per service.
    4. Total across all services: Σ pools ≤ max_connections × 0.8
       — the 0.2 is headroom for the replication connection, the
       autovacuum workers, the monitoring, and the person
       connecting by hand during an incident.
    5. RE-CHECK when the query mix changes.  A pool sized for a
       20ms API is sized wrong the day one report moves onto
       the same path.
```

The sum in step 4 is where real systems fail, and it is worth doing the arithmetic
aloud in an interview:

```text
  40 services
  × 25 instances each
  × pool size 20 (a reasonable number per instance!)
  ─────────────────────────────
  = 20,000 potential connections

  against a PostgreSQL max_connections of 500.

  The arithmetic is not "we need a bigger max_connections".
  20,000 backend processes would need ~2TB of RAM for their
  baseline working memory alone.  The number 500 was never
  arbitrary — it is a memory budget.
```

> **PRODUCTION RELEVANCE**
>
> This is why **PgBouncer** exists, and why it is the answer to give. A connection pooler
> sits between the application and the database and holds a small number of *real*
> connections while multiplexing many *virtual* ones. In **transaction pooling** mode — the
> mode that matters for PostgreSQL — a real backend connection is held only for the
> duration of a transaction and then returned to the pool for a different client to use.
> One hundred application sessions with a PgBouncer pool of 60 real connections is a normal,
> correct, high-performing configuration. **Session pooling**, which holds a backend for the
> whole session, is barely better than no pooler at all and is the reason some deployments
> report that adding PgBouncer "did nothing" — they used session mode. Volume 7 Chapter 1
> covers PostgreSQL's connection-per-process model concretely; this chapter is about the
> client-side arithmetic that determines the pool sizes PgBouncer will have to multiplex.

### 8.3 Pool Exhaustion, and What It Looks Like

```text
  THE FAILURE, in order:
  1. All pool connections are in use — because a query is slow,
     not because traffic is high.  (A leak, a long transaction,
     a report on the request path.)
  2. Application threads block waiting for a connection.
     thread pool exhausted.
  3. Request latency goes to the connection-acquisition timeout
     and the application returns 500s.
  4. MEANWHILE the database is fine.  Its query latency is
     normal.  Its connection count is 40 out of 500.
     The health check on the DATABASE says everything is green.

  This asymmetry is why pool exhaustion is so hard to diagnose:
  the component that is failing is not the one that looks broken.
  A dashboard on the database shows a healthy system.  The
  dashboards that matter are on the APPLICATION: pool
  active/idle/pending, and acquire-wait time.
```

Four causes, and the diagnostic that separates them:

- **A slow query holding connections.** `pg_stat_activity` shows many connections in
  `active` with long `query_start` ages. The pool is fine; the queries are the problem.
- **A transaction left open.** A connection in `idle in transaction` is the nastiest state
  in PostgreSQL: it holds its snapshot, it holds every `xmax` it has created (so VACUUM
  cannot clean anything), and it holds locks. One of these can cause a table to bloat
  without bound. The alert is a hard rule — **zero connections in `idle in transaction`
  older than 60 seconds** — and it is not optional.
- **A leak.** The pool's `active` count is at maximum and `idle` is zero, permanently, and
  the application's heap grows. In an application pool this is usually a connection opened
  outside the pool (a direct driver connection in a scheduled job, an ORM session opened
  and never closed, a `DriverManager.getConnection` in a utility).
- **Undersized pool for a legitimately bursty workload.** Here Little's Law says so, and
  the correct response is a *bounded queue* with a fast rejection, not a bigger pool. A pool
  that grows to 500 under a burst is a pool that turns a burst into a database outage.

### 8.4 Client-Side Limits Beyond Connections

Three more limits live on the client side, and all three are the reason a well-configured
database can still fail.

- **Statement timeout.** A query with no timeout is a query that will eventually occupy a
  connection for as long as it can be made to. `statement_timeout` on the connection (or
  per-role) is the difference between one bad query and one bad afternoon, and it should be
  set in the connection string so that it applies to every client including the ones nobody
  remembered.
- **Idle transaction timeout.** `idle_in_transaction_session_timeout` is the setting that
  kills the `idle in transaction` connection, and it is the single highest-value
  `postgresql.conf` line for stability in a fleet with many services.
- **Transaction pooler incompatibility.** Transaction pooling breaks session-level state:
  `SET` without `SET LOCAL`, `LISTEN`/`NOTIFY`, advisory locks held across transactions,
  `WITH HOLD` cursors, and temporary tables. This is not a hypothetical — it is the single
  most common surprise when a team moves to PgBouncer, and the reason the "connection
  string must be configured for transaction mode" line exists.

```sql
-- The three settings that belong in the connection string, not in
-- a wiki page nobody reads.
--   statement_timeout            = 30s     a runaway query fails fast
--   idle_in_transaction_session_timeout = 60s  a leaked transaction dies
--   lock_timeout                 = 5s      a lock wait fails instead of queueing
--   connect_timeout              = 5s      a dead host fails fast

-- And on the server, the per-role version, so that even a client
-- that sets nothing is bounded:
ALTER ROLE application SET statement_timeout = '30s';
ALTER ROLE application SET idle_in_transaction_session_timeout = '60s';
ALTER ROLE application SET lock_timeout = '5s';
```

> **MUST REMEMBER**
>
> **Concurrency = throughput × latency.** The database needs exactly as many concurrent
> connections as its offered load requires at its *actual* latency, and a pool far larger
> than that is not headroom — it is a queue that has been moved into the database's memory
> and CPU. Five hundred connections against a 2,000 qps, 20ms workload is not a safety
> margin; it is a 10× oversubscription that turns a latency problem into a throughput
> problem, which does not recover when the load drops. Size the pool to the number
> Little's Law gives, add a factor of two, put a connection pooler in front, and hold the
> *total* across every service to about 80% of `max_connections`.

#### Common Mistakes

- Raising `max_connections` in response to connection timeouts, which is a queue being
  answered with more queue
- Sizing pools per service without summing them, so 40 services each with a "reasonable"
  pool ask for 20,000 connections from a server budgeted for 500
- Using PgBouncer in **session** pooling mode and concluding that connection pooling "does
  not work"
- Enabling transaction pooling without checking for session state in the application —
  `SET` without `SET LOCAL`, advisory locks, `LISTEN`/`NOTIFY`, temp tables
- Never setting `statement_timeout`, so one pathological query holds a connection until
  somebody kills it by hand
- Never alerting on `idle in transaction`, so a leaked transaction silently blocks VACUUM
  and the table bloats for a week
- Monitoring the database's health while the failure is in the application's pool — the
  database is idle at 40 of 500 connections and everything looks green
- Using `idle_in_transaction_session_timeout` without understanding it as a *correctness*
  tool, since it aborts a transaction the application believed was still running

#### Interview Questions — Pooling & Connection Limits

**D1. We have 40 services on one PostgreSQL primary, 25 instances each. Every service
sets `maximumPoolSize: 20`, which is the framework default everyone copied. Our p99 is
4 seconds and our DB CPU is at 70%. Walk me through what is actually happening and what
you would change, in order.** `STAFF`

First, the arithmetic, because it reframes everything. 40 × 25 × 20 = **20,000 potential
connections** against a `max_connections` that is almost certainly a few hundred. So either
most of those 20,000 are never concurrent, in which case the pool is not the problem and
the p99 is, or a large fraction of them are concurrent, in which case the database should
be refusing connections and the fact that it is not tells me `max_connections` has been
raised, probably to 1,000 or 2,000, and that is the root cause.

The mechanism, stated in one paragraph: a pool of 20 per instance means each of the 1,000
application instances can have 20 queries running at once. Under peak load enough of them
are in flight that the database has hundreds of concurrent backends on a machine sized for
dozens. Each backend costs memory even when idle, so the shared buffer pool shrinks; the
run queue exceeds the core count, so context switching dominates; lock-manager partitions
start to spin. p50 survives because the fast queries are still fast. p99 is 4 seconds
because the slow queries are queued behind 500 other processes. **And the feedback loop is
what makes it dangerous**: slower queries hold connections longer, so more pool slots are
busy, so more requests queue for connections, so the effective concurrency rises further.
The database at 70% CPU is not idle; it is 70% of a much larger, much less efficient
workload than it used to process.

What I would change, in order. **One, stop the bleeding:** set `max_connections` back to
something the machine can hold — I would size it by memory, at roughly 20MB of working
memory per backend plus the shared pool, so a 64GB machine with a 32GB shared pool gets
about 1,200 and no more — and set a per-role `statement_timeout` so a slow query cannot
occupy a slot for minutes. **Two, put PgBouncer in transaction pooling mode in front**,
with `pool_mode = transaction` and the total pool sized to about 2× `max_connections`
across all services rather than per service. That single change turns 20,000 virtual
sessions into ~1,200 real backends and is usually the whole fix. **Three, then re-measure
the pool sizes with Little's Law against the *real* p99 query latency** — at 2,000 qps and
a healthy 15ms p99, 30–60 connections per service across the fleet is the number, not 20
per instance. **Four, only then, look at why p99 was 4 seconds in the first place**,
because the pool change will improve the symptom and the underlying slow query is still
there.

The thing I would add unprompted, because it is the part that does not appear in a
runbook: **the sum across services is the number that matters, and it needs a policy, not
a default.** A framework default copied into forty repositories is forty independent
decisions that no one made. That needs a per-service connection budget that sums to under
80% of `max_connections`, checked in CI, and reviewed when a new service is added — which
is an organisational fix for a technical problem, and it is the part a staff engineer is
actually being asked for.

**T2. A service's pool is exhausted. `pg_stat_activity` shows 12 connections in `active`,
380 in `idle`, and 1 in `idle in transaction` with a `state_age` of 47 minutes. DB CPU is
at 15%. What is going on?** `ADVANCED`

The one `idle in transaction` connection is the answer, and it is the answer to a different
question than the one being asked. An `idle in transaction` connection has a snapshot it
is holding and, more importantly, has created tuple versions — any row it updated or
deleted has an `xmax` pointing at it, and VACUUM cannot remove any of those tuples until
that transaction ends. It is also holding every lock it acquired. A 47-minute-old one is a
leaked transaction: a service that opened a transaction, did some work, and then did
something that never completed — an exception path that did not roll back, a `LISTEN` loop
that is waiting, a debugger, or an application request thread that is blocked on
something else while holding the database transaction open (a remote HTTP call inside a
transaction is the classic).

But that does not explain the exhaustion on its own — 12 active and 380 idle means
connections are *available*. Which means the pool exhaustion is not a database-side
exhaustion at all; it is an application-side pool accounting problem, and the candidates
are: connections opened outside the pool (a leak), the pool reporting a different
definition of "in use" than the service thinks, or — the one I would bet on — a
**transaction-scoped leak where the connection is returned to the pool but the pool's
metrics count it as busy**, or a pool that has hit its own internal limit while the
database has hundreds free. The other very likely candidate in a framework: a query that
holds a connection while doing non-database work, so the connection is `idle in transaction`
from the database's point of view for the whole time — and if there are only *twelve* of
those on this service, the pool is not full, the *threads* are.

So the correct answer is: there are two separate problems and the team is looking at one
of them. The `idle in transaction` connection is a real bug and a serious one — it is
blocking VACUUM on whatever tables it touched 47 minutes ago, which on a hot table means
bloat is accumulating right now — and it is fixed by `idle_in_transaction_session_timeout`
plus finding the code path that does not close. The pool exhaustion is a different
diagnosis, and the diagnostic is the application-side pool metrics: `active`, `idle`,
`pending`, and *acquisition wait time*. If `pending` is high and the database has 380 idle
connections, the pool is not being handed out, and the reason is almost always a leak or
a framework bug rather than the database.

**D2. Your team wants to raise `max_connections` to 5,000 to survive a traffic spike.
Give me the argument against, and tell me what you would propose instead.** `STAFF`

The argument is not "5,000 is a lot of connections" — it is that raising the limit makes
the spike *worse*, and that is the part the team will not have considered. A connection is
not a free waiter; it is a PostgreSQL backend process with a memory floor and a share of
the machine. 5,000 of them on a 64GB instance with a 32GB shared buffer pool is 32GB of
RAM already committed to connection state before a single query runs, so the buffer pool
shrinks by half, cache hit rates fall, and every query — including the ones that were
fine — gets slower. The run queue goes from tens to thousands, context switching dominates
the CPU, and lock-manager contention appears, which slows down queries that are not
competing for I/O at all. So the spike, instead of being absorbed by idle capacity, is
converted from a *throughput* problem into a *latency* problem across the whole system,
including the requests that were succeeding.

And the recovery is worse. A latency spike that ends leaves the database in a state where
all 5,000 connections are active with queries in flight; those queries hold locks, produce
WAL, and contend for the same CPU. Getting back to normal is not "when the traffic
subsides" — it is after the queue drains, which at 5,000-deep is minutes of degraded
service *after* the traffic is back to normal. This is the pathology that makes connection
storms so much worse than traffic storms: **the system keeps being damaged after the cause
is removed.**

What I would propose, in order. **One: a connection pooler, before anything else.** PgBouncer
in transaction mode means the 20,000 virtual sessions the fleet is nominally capable of
become ~1,200 real backends, and the "spike" becomes a queue in the application — which is
where a queue belongs, because it is bounded, observable, and can shed load deliberately.
**Two: a deliberate queue with a fast rejection.** Connection acquisition should have a
short timeout and a load-shedding behaviour — a bulkhead per endpoint tier, with reporting
and exports on their own small pools so a Finance query cannot consume the capacity the
checkout path needs. That is the thing that actually survives a spike, and it is a
*design* change rather than a tuning change. **Three: rate limiting at the edge**, so the
spike never reaches the connection pool in the first place. **Four: and only if the
underlying latency is genuinely the problem, find it.** Because a spike that makes 4-second
p99 usually does so by making one class of query slow under concurrency — a plan that
degrades when the statistics change with a much larger sample, a lock convoy on a hot row,
a vacuum that cannot keep up — and none of those are fixed by more connections.

The last thing I would say to the team, and it is the staff part: `max_connections` is a
*memory budget*, and the reason 100 is a common default is not that 100 is a magic safe
number but that it forces the conversation about poolers to happen before the incident
rather than after it. We would be spending that safety margin on our own convenience, and
the trade we would be making is deliberately converting a future, bounded, obvious
outage into a present, unbounded, subtle one.

> **CHAPTER 8 SUMMARY**
>
> Every other resource in a system scales by adding a machine; the database does not,
> because a PostgreSQL connection is a process with a memory floor and a share of the CPU
> even when it is idle. So the connection count is a *memory budget*, and the arithmetic
> that sizes it is Little's Law: **concurrency = throughput × latency** — 2,000 queries per
> second at 20ms needs about 40 connections, and a pool of 500 is not headroom but a queue
> that has been moved into the database's CPU and memory, where it degrades every query
> including the healthy ones and keeps degrading after the load that caused it has gone.
> The practical sequence is: sum every service's pool first (40 × 25 × 20 is 20,000
> connections against a server budgeted for hundreds), put a transaction-mode pooler in
> front, size the totals to about 80% of `max_connections`, set `statement_timeout` and
> `idle_in_transaction_session_timeout` in the connection string so every client is
> bounded including the ones nobody remembers, and alert on pool wait time rather than on
> database health — because when a pool is exhausted the database is idle and green, and
> the component that is failing is not the one that looks broken.

---

#### Further Reading

- [PostgreSQL — Connection Limits](https://www.postgresql.org/docs/current/runtime-config-connection.html) — `max_connections`, `superuser_reserved_connections`, and what the documentation says about not raising it casually.
- [PostgreSQL — `idle_in_transaction_session_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html) — the setting that kills a leaked transaction, and why it is a correctness tool.
- [PgBouncer — Configuration](https://www.pgbouncer.org/config.html) — `pool_mode`, the three modes and what session state each one breaks, and the sizing guidance.
- [Use The Index, Luke — Connection Pooling](https://use-the-index-luke.com/2016-11-25/connection-pooling.html) — the practitioner framing of why the database is the scarce resource.
- [Little's Law — Wikipedia](https://en.wikipedia.org/wiki/Little%27s_law) — the derivation behind `L = λ × W`, stated so it can be quoted correctly under pressure.

### End of Volume 6

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain why a `BIGINT` sequence key beats a random `UUID` v4 on the axis people forget —
  monotonicity, append-only inserts, contiguous hot pages, and half the index bytes — and
  give the page-split arithmetic (a split on an 8 kB page with ~100-byte rows rewrites ~40
  rows, and a leaf sits at 60–70% fill after a split versus 100% on an append)
- State when `UUID` is correct (merge fan-in, rows created without touching a database,
  IDs as capabilities) and name the mitigation for the locality problem — UUIDv7 — along
  with its two costs (16 bytes, and a leaked creation timestamp)
- Model a polymorphic association, say which of the four solutions you would pick and
  under what condition, and explain why a `target_type`/`target_id` pair with no foreign
  key is a permanent loss of a guarantee rather than a design
- Distinguish SCD Type 1, Type 2 and bitemporal by the question each can answer, and state
  plainly that choosing Type 1 for an audited fact is a one-way door that no later migration
  can undo
- State the three non-negotiables of any temporal range — half-open `[from, to)`, `NULL`
  meaning infinity rather than `now()`, and `TIMESTAMPTZ` only
- Explain why the partition key and the leading index column should almost always be the
  same column, and predict what happens to a hot query when they disagree
- Give the number for the canonical win: dropping a partition is ~180ms of metadata work
  against a ~100-minute, 27GB-of-WAL, vacuum-blocking single-transaction `DELETE` of
  300 million rows
- State that partitioning is one node with many partitions and sharding is many nodes, and
  explain why confusing the two is a design error rather than a vocabulary slip
- List the four shard-key properties and identify **stability** as the one that cannot be
  repaired, and explain why a changed shard key means a reshard
- Compute the fan-out cost of a 64-shard scatter-gather, and explain why the p99 rather
  than the p50 is what tells you it is happening
- State that replica lag is a correctness problem, give the three manifestations
  (read-after-write violation, the ghost record, in-page monotonicity violation), and name
  the one monitoring statistic that cannot detect it
- Explain why synchronous replication trades availability for durability, and what a dead
  sync replica does to the write path
- Apply Little's Law to a database (`L = λ × W`), show the arithmetic for why 500
  connections is worse than 50, and explain what a transaction-mode connection pooler
  changes about the fleet's connection budget

### Coming in Volume 7 — PostgreSQL

Volumes 1 to 6 were portable: they apply to any relational engine, and every one of them
is a decision about *your schema* rather than about a vendor. Volume 7 starts the engine
set, and it starts with PostgreSQL because it is the engine where the abstraction leaks
in the most instructive ways. This is the volume where the connection-per-process model
that Chapter 8 asked you to size for becomes a real `postmaster` and a real set of backends;
where MVCC, which Volume 5 described as a concept, becomes vacuum, the visibility map, HOT
updates and the free space map; where the planner, which Volume 4 treated as a black box
that reads statistics, becomes something you can read the source of. It is also where the
partitioning and indexing material from this volume meets a real implementation — where
`ATTACH PARTITION` actually behaves, where `EXCLUDE USING gist` is actually the only
overlap guarantee, and where the bitemporal schema from Chapter 3 is a period type rather
than a convention.

## Chapter 9 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). This bank is deliberately the **most D-weighted in
the set**, and that is not an accident of emphasis. Everything in this volume is a decision
under constraint — a scale number, a query pattern, a reversible-or-not classification —
and the questions that separate a senior candidate from a staff one are not "what is
partition pruning" (that is a `T`) but "you have this workload, this hardware, and this
retention policy; what is the shard key, what does it cost you, and what do you tell the
team you are not solving". The `D` questions below push on exactly that: cost, reversibility,
query alignment, and the organisational conversation that the technical answer implies. If
you can hold a shard-key discussion for three minutes without conflating partitioning with
sharding, and can name the number that stops each technique working, you are answering at
the level this volume is written for.

### Key Choice

**D1. We are starting a multi-tenant product with 40,000 customers on day one. Every
consultant who has ever designed this has said "use UUIDs so you can shard later". Is that
right?** `STAFF`

The advice is half right, and the half that is wrong is the half that costs you. It is
right that a primary key generated by a single sequence is a coordination point and that
UUIDs remove the need to round-trip to the database for an identifier. It is wrong about
what you are actually buying, because the thing you will need to shard on is almost
certainly `tenant_id` or `customer_id`, not the primary key — so the primary key's
unguessability and global uniqueness buy you nothing about routing, and a `BIGINT` key is
also *better* for routing, because its monotonicity means `customer_id = 8` almost
certainly lives on shard 0 and `customer_id = 900` almost certainly does not, which makes
range queries single-shard for free.

So the decision is: `customer_id` as a `BIGINT` sequence, and a `tenant_id` you will shard
on later if you need to. With 40,000 customers you can start on one node for years. The
consultant's real concern — "we will not be able to insert without a round trip" — is
solved by the sequence's `CACHE` clause, which batches the allocation and cuts the round
trips by the cache size without any of the UUID costs. And if the specific worry is
offline or multi-writer insertion, that is a real requirement worth designing for with
pre-allocated ID *blocks* per tenant — a sequence range handed out per tenant — which
keeps the `BIGINT` properties and gives tenant-local allocation.

Where the advice is genuinely right, and where I would change the consultant's answer
rather than reverse it: if the product exposes customer IDs in URLs and you do not want
enumerable user accounts, then unguessability is a security requirement, and in that case
use a `UUIDv7` — not a v4, because v4 reintroduces the random-insert page-split problem on
a table that will hold every customer row for the life of the product. The condition is
"IDs are a capability", and it is a *security* condition, not a *scaling* condition. Saying
that distinction out loud, and noting that the scaling argument is a false one, is the
staff answer.

**P1. Insert latency on our busiest table tripled over six months with no traffic growth and
no schema change. The primary key is a `UUID` v4. What is your first hypothesis and what
is the first measurement?** `STAFF`

The first hypothesis is table growth, and the mechanism is the one from Chapter 1. A `UUID`
v4 primary key means every insert lands at a uniformly random position in a B+ tree that is
getting deeper and more fragmented. As the table grows, the index gets more pages, the
inserts land across a wider and wider physical spread, the buffer pool's hit rate for the
hot write path falls, and each insert that hits a leaf above the fill threshold causes a
split that rewrites roughly half an 8 kB page — around 40 rows of 100 bytes — and writes
all 40 to the WAL. The tripling is not traffic; it is the product of a growing key space
and a random access pattern, and it will keep getting worse.

The first measurement is `EXPLAIN (ANALYZE, BUFFERS)` on a representative `INSERT ...
RETURNING`, which in PostgreSQL shows the buffer pool hit ratio and the number of pages
dirtied. The specific signature to look for is a *high* number of dirty buffers and a
*low* hit ratio on the primary key index, and it is distinguishable from a bloat problem
because a bloat problem shows a large heap scan for few rows, not a large number of dirty
index pages for an insert. The second measurement, which is the one that confirms it
outright, is the table's physical size versus its logical size (`pg_total_relation_size`
against a `reltuples × width` estimate) — a heavily fragmented index is much larger than
the data implies.

The fix has two parts and only one of them is a migration. The immediate part is
operational: `REINDEX CONCURRENTLY` to defragment the index, which recovers the locality
without a lock and without changing anything, and which is reversible in the sense that it
costs nothing but time. The durable part is the key type: migrating to `UUIDv7` or a
`BIGINT` sequence restores monotonicity, and it is a full rewrite of the table plus every
foreign key plus every index plus every value the application has cached or exported. That
is why the answer to "how do we prevent this for the next table" is a schema review gate
rather than a fix, and why the first measurement in a real post-mortem is always
`pg_stat_user_tables` for `n_dead_tup` and index size, in that order.

**T1. A table has `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` and 40 million rows. You
add a secondary index on `(status, created_at)`. Does the query `WHERE status = 'PENDING'
AND created_at > now() - interval '7 days'` get faster, and what determines the answer?**
`TRICKY`

Yes, substantially — and the reason is worth being precise about, because it is the same
reason the primary key choice matters and the opposite reason. The secondary index's
entries are sorted by `(status, created_at)`, which is completely independent of the
random primary key, so the index is internally well-ordered and the query is a single range
scan on it. The random `UUID` only affects the *primary* index and the heap's write
pattern; it does not affect the locality of a secondary index whose leading columns are
correlated columns. The query goes from a full heap scan of 40 million rows to an index
range scan over however many rows are actually pending in the last week, and it returns
`ctid`s which then have to be looked up in the heap — so it is not free, and on a table
where the matching rows are a large fraction of the heap you may see the planner choose a
sequential scan anyway.

What determines the answer is the selectivity: the fraction of rows matching both
predicates. If `status = 'PENDING'` is 0.3% of the table and the 7-day window is 1%, the
combined selectivity is around 0.003% — 12,000 rows out of 40 million — and the index scan
is overwhelmingly the right plan. If the table has a bug where 40% of rows are pending,
the index is worse than a scan and the planner knows it. The trap in the interview is the
candidate who attributes the index's usefulness to the key type; the key type is irrelevant
here, and saying so precisely — and then explaining what *is* relevant, which is that the
index correlates two columns that are both correlated, so the index's own locality is good —
is what separates the two answers.

**S1. A PR replaces `id BIGINT GENERATED ALWAYS AS IDENTITY` with
`id UUID PRIMARY KEY DEFAULT gen_random_uuid()` on a 40-million-row table, to "remove the
bottleneck on sequence allocation". Review it.** `STAFF`

The first comment is that the premise is almost certainly false and the evidence should be
demanded before the change is approved. Sequence allocation in PostgreSQL does not serialise
on a single row the way the folklore suggests — a session allocates a *block* of values per
`nextval` call according to `CACHE`, so the round trips are amortised, and the contention
that does exist is on the `current` row in the sequence relation and is bounded. So "the
sequence is a bottleneck" is a claim about a measurement nobody has made. The reviewer's
first request is the `EXPLAIN (ANALYZE)` of a representative insert, and if the answer is
that insert time is dominated by index maintenance and WAL rather than by `nextval`, the
change is solving nothing and introducing the page-split and cache-locality costs from
Chapter 1 — on 40 million rows, a split rewrites roughly 40 rows of an 8 kB page and the
replication stream for the key column doubles in size.

The second comment is about the migration itself, which is the part that will hurt. Changing
a primary key type means: a new column, a dual-write or trigger to keep both populated, a
backfill of 40 million rows, a `UNIQUE` constraint per foreign key, every secondary index
rebuilt because the key is appended to all of them, and then every consumer that has stored
the ID — API responses, event payloads, cache keys, another team's database — breaks at
cutover. That is a quarter of work and a coordinated release, and none of it is in the PR
as described. If the team genuinely cannot touch a single central sequence — because
writers are distributed across regions and cannot round-trip to one database — then the
right answer is time-ordered IDs (UUIDv7, or a per-region block allocation from a single
sequence with a large `CACHE` and a documented gap), and the PR should say which of those
constraints it is actually solving.

The third comment is the cheapest possible fix, which nobody proposed: raise the sequence
`CACHE`. Going from `CACHE 1` to `CACHE 1000` cuts the round trips per insert by a factor of
a thousand at the cost of a wider gap, and the gap is almost never a problem — nothing
should be inferring "count = max(id)", and if something is, that something is already
wrong.

**T2. A table has `id UUID PRIMARY KEY DEFAULT gen_random_uuid()` and is written at 3,000
rows/second. You add a `BIGINT GENERATED ALWAYS AS IDENTITY` column, backfill it, and switch
the primary key to it. What is the disk-space and I/O cost of the transition, and what is
the one thing that can make it fail halfway?** `ADVANCED`

The disk and I/O cost is the reason this is a project rather than a migration. Adding the
column is cheap; backfilling 40 million rows is a full table rewrite, and while the backfill
runs every one of the table's indexes — primary and secondary — has to be maintained, so the
table is being written at 3,000 rows/second *by the application* while simultaneously being
rewritten *by the migration*. That is roughly double the write volume and double the WAL,
and it is the reason the safe shape is not "add a column to the live table" but "create a
new table, backfill into it in slices, and cut over" — which needs free disk for a full
second copy plus every index, on a 40-million-row table that is real terabytes of headroom
requirement and the first thing to verify.

The thing that can make it fail halfway is the dual-write window and the foreign keys.
While both keys exist, every `INSERT` must populate both and every child table's foreign key
still points at the old one, so a partial failure produces a table where the new key is
populated for some rows and not others, and the new primary key's `UNIQUE` constraint is
satisfied by a partial set. Worse, the *old* key's values are the ones in every foreign key
in the system, so the cutover is not "switch the primary key" — it is "rewrite every foreign
key, every index, and every stored reference in every consumer", and doing that without a
consistent freeze produces orphaned references that no constraint catches because the
constraint has already been dropped.

The mitigation, and it is the same mitigation as every other one-way door in this volume: do
the migration as a new table plus a controlled freeze, keep the old key populated and
`UNIQUE`-constrained until the new one is proven, and treat the cutover as a release with a
rollback rather than a migration script. And the honest framing for the review: the cost of
this change is roughly a quarter of engineering, and the benefit — if the premise about the
sequence was wrong — is zero. Establish the premise first.

**D2. You are designing a system where entities are created in three places: the main
API, a batch importer that runs offline for six hours a night, and a mobile client that may
have been offline for a week. Pick a key scheme and defend the operational consequences,
not just the correctness ones.** `STAFF`

This is the case where the merge-fan-in and offline-creation arguments genuinely win, and
the design has to survive all three writers. A single sequence cannot serve the mobile client
at all — it is offline and cannot round-trip — and pre-allocating ID blocks to mobile clients
leaks IDs permanently when a client is wiped, and the importer running six hours offline
against the same sequence is a coordination problem you would solve with a very large
`CACHE`, which means a very wide gap that a nightly reconcile has to reason about. So the
choice is a `UUID`, and the second half of the answer is that it must be **v7**, with the
locality argument from Chapter 1 stated out loud: v4 would reintroduce the random-insert page
split into a table that receives 3,000 rows/second from three sources, which is the worst
possible combination.

The operational consequences, which is what the question is really asking. **Merge
behaviour:** no collisions, ever, and the merge tooling becomes a plain `INSERT` with
`ON CONFLICT DO NOTHING` on a business key — because a natural business key still has to
exist to make that work, and that is a schema requirement the UUID does not remove. **Gap
behaviour:** gaps become the norm rather than the exception, and any process that counts rows
by looking at the maximum identifier is now definitively wrong, so the counting convention
has to be written down. **Index size:** 16 bytes of key on every secondary index and every
WAL record, and on a multi-billion-row table that is terabytes — a real budget line, not a
detail. **Shard alignment:** the IDs are deliberately uncorrelated with anything, so
`WHERE customer_uuid = ?` cannot be pruned, and if this system will ever be sharded the
shard key must be a *different* column that the routing can use, with a mapping from UUID
to shard that is itself stored. And the mobile client's week-old IDs: those rows were created
locally and arrive late, so a `created_at`-partitioned table receives them into old
partitions, and if retention has already dropped those partitions the data is lost. That
last one is a genuine, non-obvious hazard, and the mitigation is either a grace period on
retention or routing late arrivals by ingestion time rather than event time — a decision
with a real correctness consequence, and the kind of thing a staff engineer raises before it
becomes a support ticket about a customer's missing photos.

**D3. Your team wants to add a `created_at` column to every table so that partitioning is
available later. Walk me through why that is a worse idea than it sounds, and what the
alternative is.** `STAFF`

Because "we will partition later" makes the partition *column* permanent while making the
*mechanical change* trivial, and this proposal is choosing the column badly and
indiscriminately. Three problems, in order.

**The column does not mean the same thing in every table, and a partition key has to.** For
`orders`, `created_at` when the order was placed. For `order_line`, `created_at` on the line
— which is fine, because a line cannot predate its order. For a slowly-changing table like
`customer_address_version`, `created_at` is *not* the right partition key at all: the
queries are "current address" and "address as of T", and the meaningful column is `valid_from`.
For a table of derived data, `created_at` may be the refresh time, so every partition contains
every fact at every granularity. A single global convention applied to every table produces
some right partition keys, some useless ones, and at least one actively misleading one.

**It is on the write path of every table forever.** A `created_at TIMESTAMPTZ NOT NULL
DEFAULT now()` is a function call or a sequence read on every insert, and on a high-volume
table that is measurable — and it is a column that exists solely for a hypothetical future,
which is exactly the kind of speculative schema the normalisation argument was about. Worse,
once it is there, someone *will* start filtering on it, and then it is load-bearing whether
or not anyone decided it should be.

**It does not actually unblock partitioning.** The real constraint on converting a table to
a partitioned one is not having a timestamp; it is having the *primary key contain the
partition key*, and primary keys are immutable without a full rewrite. So the preparation
that actually matters is not adding a column, it is choosing a key scheme whose future
partitioning is compatible.

The alternative is to not prepare at all, and to instead adopt a policy: when a table crosses
the threshold where partitioning is worth it, the partition key is chosen *then*, from that
table's own query patterns and its retention requirement, and the migration is planned as a
project with a disk budget. That is more honest than a column added to 200 tables on the
theory that it will be right, and it recognises that the correct partition key is genuinely
table-specific — which is the whole argument of Chapter 4.

### Relationship Modelling

**D4. An order can be paid by card, by bank transfer, or by credit note, and each payment
method has attributes the others do not (card: last-4, authorisation code; transfer: sort
code, reference; credit note: reason, issued_by). Give me the schema, and tell me the
three things that will go wrong with the obvious version.** `STAFF`

The schema: `payment` as a supertype — `(id, order_id, amount_cents, method, paid_at,
created_at)` — with three child tables `card_payment`, `transfer_payment` and
`credit_note_payment`, each with a `UNIQUE` `payment_id` FK to the supertype, plus an
`order_credit_note` supertype/child structure if credit notes also need to exist
independently of payments. One FK, one place to query "all payments for this order", no
nullable columns, and a fourth method is a new child table with no change to `payment`.

The three things that go wrong with the obvious version, and they are the three I would
write on the whiteboard. **One: the single wide table with nullable columns.** `card_last4`,
`auth_code`, `sort_code`, `credit_reason` all nullable on one `payment` table. Every read
carries the width of the widest method; the `CHECK`-based "exactly one method's columns are
populated" constraint is a fifteen-way boolean expression that no one maintains; and adding
a fifth method is a nullable column plus a `CHECK` change plus a migration — which is
exactly the linear cost the supertype exists to avoid. **Two: the polymorphic
`method`/`reference_id` pair with no foreign key.** Then a deleted card record leaves
`payment` pointing at nothing, nothing complains, and finance finds out from a reconciliation
report six weeks later. **Three: putting the method-specific attributes on the `order`
rather than on the payment.** An order can be paid twice (part-payment, then the rest), so
`order` is the wrong grain; and a retry that creates a second payment with a different card
now conflicts with a `UNIQUE` on the order.

The staff-level addition: the decision hinges on **whether the method set is closed and
whether the attributes are ever queried together with the common ones.** If a fifth method
is likely within two years and the method-specific attributes are queried on nearly every
screen, the wide nullable table is arguably more readable and the `CHECK` cost is paid once.
If the set is stable and the attributes are rarely read together, the supertype is right. I
would also say that `amount_cents` and `paid_at` belong on the supertype and are
immutable after creation, which is a Chapter 3 decision wearing a Chapter 2 costume: a
correction to a payment is a refund row referencing the original, never an `UPDATE`.

**S1. This `CHECK` constraint is being added to a 300-million-row table:
`CHECK ((order_id IS NOT NULL) + (invoice_id IS NOT NULL) + (credit_note_id IS NOT NULL) = 1)`.
What does the reviewer need to say before this merges?** `STAFF`

Three things, in order of severity. **One: `NOT VALID`, or the migration is an outage.**
Adding a validated `CHECK` to a 300-million-row table takes an `ACCESS EXCLUSIVE` lock for
the duration of a full table scan — the `ACCESS EXCLUSIVE` is the same lock `ALTER TABLE`
takes for most operations, so it blocks every read and every write on the table, including
the plain `SELECT`s, for as long as the scan takes. On a 300-million-row table that is
minutes of total unavailability. The correct form is `ADD CONSTRAINT ... CHECK (...) NOT
VALID`, which takes a much weaker lock and only applies to new and updated rows, followed by
a scheduled `VALIDATE CONSTRAINT`, which takes `SHARE UPDATE EXCLUSIVE` and does not block
reads or writes. The reviewer's blocking comment is: where is the `VALIDATE`, and is it
scheduled as separate work, because that is a separate operation with its own runtime and it
is routinely forgotten. And before the `NOT VALID` migration ships, somebody should run the
constraint's predicate as a `SELECT` to count the violations, because if there are any the
`VALIDATE` will fail later and at the worst possible moment.

**Two: the constraint assumes the data is already clean and says nothing about it staying
clean.** The constraint prevents *new* rows from having zero or two targets, and it says
nothing about the 300 million existing rows if the migration uses `NOT VALID` and the
`VALIDATE` is never run. That is a legitimate trade (validate asynchronously) but it has to
be a decision, and the decision belongs in the migration file as a comment, not in someone's
head.

**Three: the partial indexes are not in this migration and they are required for the
design to work.** The reason to choose a nullable triple over a loose `(type, id)` pair is
that the FKs give you referential integrity — and the reason to choose the triple over a
supertype is that there is no extra join, which is only true if `activity_order_id_idx` is
partial (`WHERE order_id IS NOT NULL`). Without the partial indexes, every one of the
300 million activity rows occupies an entry in all three indexes, two of which are useless
for that row, and the table grows by roughly 60% in index bytes for no query benefit. The
reviewer asks: are the three partial indexes in this migration, and are they being built
`CONCURRENTLY` given the table size?

**D5. We need "everything that happened to this order" — an audit feed covering 12 entity
types, read on the order detail page, with a legal 7-year retention. The obvious
implementation stores a JSONB `changes` blob plus a `resource_type` string. Convince me it
is wrong, or tell me why it is fine.** `STAFF`

I would not call it wrong; I would call it a different system with different properties, and
the differences are the argument. The JSONB design is genuinely good at two things the
relational design is bad at: the write is one row with no schema coordination across 12
entity types, and the "what changed" question is answered by reading one field. Where it
stops working is queries *about* the history rather than *of* it, and there are four
specific ones this system will ask.

**"Show me every change to this customer's address, in order."** That is a `jsonb_path_query`
over 300 million rows, or a functional index on an expression that extracts address changes
— which is a hand-built index whose maintenance semantics you now own. The relational
design has it as a range scan on `(customer_id, valid_from)`. **"How many times has this
field been changed in the last year?"** is an aggregate over JSONB with no statistics to
plan against, so the planner guesses, and a wrong guess on 300 million rows is a wrong plan
with no error. **"Which version of the address was in force when this invoice was issued?"**
is a temporal as-of join (Chapter 3), and a JSONB blob does not have a `valid_from` to join
on — so you have to infer the interval from the feed's own ordering, which is only valid if
the feed is complete and never reordered, and those are exactly the assumptions that break
silently. And **"produce a report of all address changes in 2023 for the regulator"** is a
sequential scan of a 300-million-row JSONB table with a per-row parse, versus a partitioned
range scan on a typed column.

The one thing the JSONB design does have, and which I would concede, is that the relational
design has 12 tables to keep in step with the application, and every one of them is a place
where a bug produces a *missing history row* rather than a visible error. That is a real
cost, and the reason people choose the blob. My resolution is usually to keep the blob as
the write-side record — cheap, complete, append-only — and to build a **typed projection
for the two or three fields that are actually queried or audited**, maintained in the same
transaction, with the blob remaining the fallback and the projection's completeness
reconciled by a scheduled job. That gives you the queryability where it is needed and the
completeness everywhere, and it is honest about the fact that the projection can drift from
the blob, which is a thing you now have to monitor.

**P1. A customer support ticket says "my saved items are missing". Investigation finds the
`customer_favourite` table has 4,000 orphaned rows whose `product_id` matches no row in
`products`. The foreign key exists. Explain how that is possible, and what it says about the
system.** `STAFF`

The FK existing makes this a genuinely interesting bug rather than a schema omission, so
the mechanism has to be one that bypasses the constraint rather than one that never had it.
Four candidates, in order of likelihood. **A replica or a restored backup without the
constraint.** Dropping and recreating a table on a large replica to speed up replay is a
real operational practice, and a replica built that way serves perfectly good rows that the
primary would have rejected. If reads are routed to replicas (Chapter 7), the orphans can be
*displayed* long before the primary knows anything is wrong. **A bulk load path.** `COPY` into
a staging table followed by a `SET session_replication_role = replica` insert, or a
data-fix script that disables triggers, bypasses FK enforcement. This is the most common
cause and it is nearly always a one-off data migration from three years ago whose tooling
nobody remembers. **A cascading delete that ran in the wrong order,** or an
`ON DELETE SET NULL` on a column that was not nullable at the time — which would have
failed, so this one is weaker. **Cross-database writes.** Another service, or a reporting
tool, writing directly to this database with credentials that have `session_replication_role`
available.

What it says about the system is the more important half, and it is two things. First: the
FK is not a guarantee, it is a *default behaviour of every write path that has not been
deliberately configured to bypass it* — and the paths that bypass it are invisible in the
schema. That is an argument for treating `session_replication_role` as a privileged setting
that only a named role can set, so the bypass is a permission rather than a flag anyone can
flip. Second, and this is the staff point: **an FK prevents a row from pointing at something
that does not exist, but it does not prevent the thing it pointed at from disappearing if
some path does not honour the `ON DELETE` clause.** Orphans arise from the deletes, not the
inserts. So the review question for any schema with an FK is not "does the constraint exist"
but "what is the delete path, and does it go through the database". If the answer is "the
application issues `DELETE FROM products` and the database cascades", that is a system where
orphans are impossible. If the answer involves a service deleting rows in a batch with its
own retry logic, that is a system with an FK and no referential integrity, and the
constraint is providing reassurance rather than protection.

**T1. `orders` is 400 million rows, `order_line` is 2.1 billion, and both have a FK.
`order_line` has an index on `(order_id)`. A nightly job deletes 50,000 orders, each with
about 5 lines. Give me the wall-clock cost and the number that decides it.** `ADVANCED`

The wall-clock cost is dominated by the cascade's index maintenance, and the reason is
specific: each deleted order requires the database to find its 5 lines via the
`(order_id)` index, then delete 250,000 rows in total, and each of those 250,000 deletions
updates the `order_line` primary key index, every secondary index on `order_line`, and the
free space map — and produces WAL. So the cost is not "delete 250,000 rows", it is "delete
250,000 rows across a table with, say, four indexes, on a 2.1-billion-row B+ tree", and each
of those deletions is a random write into a structure too large to be cached.

The number that decides it is the **fraction of `order_line` that is being deleted**: 250,000
out of 2.1 billion is 0.012%. Below roughly 0.1%, an indexed cascade is the right
mechanism — it is doing 250,000 index probes, which at even 0.5ms of cold random I/O is two
minutes, and that is fine. Above about 1% — which for a nightly retention job means the
retention window is too short or the table is growing faster than the job keeps up — the
cascade becomes the problem, because you are now doing tens of millions of random index
writes into a table that does not fit in cache, and the cost per row rises sharply. The
other number that matters is whether the lines are *contiguous*: if the 50,000 orders are
contiguous in insertion order, the `order_id` range gives the cascade a sequential scan
rather than 50,000 separate index descents, and the same 250,000 deletions cost a fraction
as much. So the job's batching strategy — deleting by `order_id` range rather than by
arbitrary ID list — is a real optimisation with a real number attached.

The staff-level observation is that a retention policy on `orders` is really a retention
policy on `order_line`, and the two tables have wildly different sizes, so the constraint
that makes the schema correct is also what makes retention expensive. The resolution, in
order: batch by `order_id` range to get locality; use a single multi-row `DELETE` per batch
so the WAL is one sequential append rather than 250,000 interleaved records; and if the
fraction is genuinely high, ask whether `order_line` should be range-partitioned on the same
column as `orders`, so the retention becomes a `DROP TABLE` on both — which is Chapter 5's
canonical win, and which for a 2.1-billion-row table is the difference between a two-minute
job and a 180-millisecond one.

**D6. A team wants to model "a notification can be sent by email, SMS, push, or Slack,
and each channel has a provider, a delivery status, and a retry count". They have proposed
a single `notification_delivery` table with `channel` plus `provider_ref`. Give me the
design, and tell me what happens when they add a fifth channel.** `STAFF`

The design: a `notification` supertype — the thing being communicated — with
`(id, user_id, template_id, created_at)`, and a `notification_delivery` child per attempt,
carrying the fields that are genuinely common to *all* channels: `channel`,
`attempt_number`, `status` (`QUEUED`, `SENT`, `DELIVERED`, `FAILED`, `BOUNCED`),
`created_at`, `sent_at`, `delivered_at`, `failure_reason`. Then four child tables —
`email_delivery`, `sms_delivery`, `push_delivery`, `slack_delivery` — each with a `UNIQUE`
`delivery_id` and only the channel-specific columns: the provider message ID, the template
variables, the device token, the Slack thread timestamp. The `notification` is separate from
the `delivery` because there can be many deliveries per notification (one per channel, plus
retries), and the retry count is an attribute of the *delivery*, not the notification.

Adding a fifth channel is then: one child table with a `UNIQUE delivery_id` and its
channel-specific columns, a new value in the `channel` `CHECK`, and a new row in whatever
dispatch table maps channels to providers. **No change to `notification`, no change to
`notification_delivery`, no migration of existing rows, and no new nullable columns** — which
is the property that makes this a design rather than a pattern that will be extended by
adding three more nullable columns.

What actually goes wrong with the proposed version, and the two things I would say about it.
The `provider_ref` is a foreign key that does not exist, so a delivered email whose provider
row was cleaned up after 90 days leaves a dangling reference in the delivery history — and
delivery history is exactly the table someone will ask about when a user says "I never got
the message". So the provider reference has the same problem as Chapter 2's loose
`target_type`/`target_id` pair, and the fix is the same: make `provider_ref` a real FK to a
`provider` table with a `RESTRICT` delete, and keep the provider rows. And the second
problem is that a single wide table forces every read of a push delivery to carry the email
and SMS columns, so the table's row width is set by the widest channel, and the natural
temptation — adding `slack_thread_ts` as another nullable column — is the design beginning
to collapse back into the thing we just replaced. The test of whether a design is holding is
exactly what the fifth channel costs, so it is the right thing to ask in the review.

**D7. We have a self-referencing `category` table with 6 levels of depth and 400,000
rows, and the category tree is restructured about twice a year. Choose between an adjacency
list, a materialised path, a nested set, and a closure table, and defend it with the
restructuring frequency in the number.** `STAFF`

Closure table, and the reason is that 400,000 rows and twice-a-year restructuring puts this
squarely in the case where adjacency is too slow and the set-based options are too
expensive. Let me do the arithmetic rather than assert it.

Adjacency list: 6 levels means 6 index probes per subtree query, and the traversal cost is
not 6 lookups but 6 *rounds of round trips* if done naively in the application — which is
400,000 rows of category tree being re-fetched on a product-listing page. A single recursive
CTE fixes the round trips and gives you a depth-6 walk, but the query is still six index
descents on a 400,000-row table for every product page, and the 95th percentile is dominated
by the deep subtrees. Restructuring, by contrast, is the one thing adjacency does *well*:
moving a node is one `UPDATE` of its `parent_id`. So adjacency wins on writes and loses on
reads, and this system reads constantly and writes twice a year.

Materialised path (`path TEXT` holding `/1/14/207/`): subtree reads become
`WHERE path LIKE '/1/14/%'`, which is a single index range scan — genuinely fast, and the
depth-6 problem disappears entirely. The cost is the restructure: moving a node with 30,000
descendants means rewriting 30,000 `path` values, and doing it in the same transaction is a
30,000-row update that holds locks for its duration. Twice a year, is that acceptable? 30,000
rows is about a second, so yes — and that is the number that makes this defensible rather
than hopeful. The subtlety that people miss is that the path rewrite must be done
bottom-up or with a temporary prefix, because a mid-flight update that changes a parent
before its children corrupts the subtree; and the path column's index grows with tree depth,
so the rows are wider than they look.

Nested set (`lft`, `rgt`): reads are a single range scan and the *ordering* is free, which
materialised path does not give you. Writes are the disaster: inserting a node anywhere in
the tree requires renumbering every row after the insertion point, and with 400,000 rows
that is a 400,000-row update *per insert*. For a tree that is written to by product
merchandisers interactively, that is unusable. Nested set is the right answer for a tree
that is essentially static and read constantly, and the wrong answer for anything a human
edits.

So: closure table if you want the writes to be cheap *and* the reads to be cheap, accepting
a `category_closure(ancestor_id, descendant_id, depth)` table with roughly 2.4 million rows
for 400,000 nodes at average depth 6, a `UNIQUE (ancestor, descendant)` constraint, and two
indexes. A subtree is `WHERE ancestor_id = 14` — one index scan, no depth, no string
prefix. A move is delete-and-reinsert the affected closure rows, which is proportional to
the subtree and no more. And the depth 6 read is one query instead of six.

The staff-level close: whichever you pick, the constraint that makes it *correct* rather than
merely fast is preventing cycles. Closure tables make cycles structurally possible, so
overlap and acyclicity checks on `(ancestor, descendant)` are not optional, and a
scheduled integrity query that asserts `NOT EXISTS (ancestor_id = descendant_id AND depth
> 0)` is what stops a bad import from creating a loop that makes a subtree query return
infinity rows.

The 7-year retention also settles it: a 7-year JSONB history table with no partitioning
cannot be pruned, so the retention requirement is satisfied by a `DELETE` of tens of
millions of rows, and everything in Chapter 5's headline number applies. A partitioned,
typed projection drops a year in one `DROP TABLE`. The retention requirement alone is
enough to justify the relational side existing.

### Temporal Data

**D8. We are a payments company. Our CFO asks: "if we had to correct last quarter's revenue
number, could we?" and our CTO asks: "could we prove to a regulator what we reported on a
given day?" Those are two different questions. Design for both.** `STAFF`

They are two different questions and they have two different answers, and the reason they
are not the same is that one is about *the truth's* history and the other is about *our
knowledge's* history. Revenue correctness is a Type 2 problem; "prove what we reported on
1 April" is bitemporal, and the difference is the whole design.

For revenue: SCD Type 2 is not sufficient on its own, and the reason is the grain. The
immutable unit is not the order and not the payment — it is the **invoice line**, and the
specific columns are `quantity`, `unit_price_cents`, `tax_rate` and the line total. Once
issued, none of those may be overwritten by anything. Corrections happen by issuing a
**credit note**, which is a new row referencing the original invoice, which is both the
correct accounting treatment and a Type 2 version row with a business identity. Order
status is Type 1 — nobody asks what an order's status was in March, and the churn from
tracking it would be enormous. Refund amounts are append-only. So the answer is a *mixed*
temporal model, and the discipline is a written list of which columns are in which class,
owned by finance, not by engineering. That list is the deliverable; the schema follows from
it.

For the regulator: `billing_address_history` keyed on `(customer_id, valid_from,
recorded_from)`, with the four timestamps, the interval-ordering `CHECK`s, and the
charge row carrying its own copy of the address as it was at charge time. The copy is not
denormalisation — updating the current address does not require updating historical charges,
because the charge's address is a fact about the charge, and Volume 1's "store it once"
condition does not fire. The correction mechanism is the thing to design deliberately: a
retroactive change inserts a new knowledge-timeline row, never updates one, and
`recorded_from` is set to the moment the correction was *received*, not to the effective
date. That single distinction is what lets the system reproduce a past report exactly.

The costs, stated because the CFO needs them: the history tables grow at the *correction*
rate, so they are partitioned by `valid_from` month and 7-year-old partitions are archived
to object storage and detached; a bitemporal table has a four-column key and every index is
wider; and a retroactive correction means a previously-generated report is now wrong in a
way that cannot be fixed, only superseded. The process answer is the last thing I would say
and the thing a staff engineer raises unprompted: there must be a **quarterly
reconciliation** that recomputes revenue from history and compares it against what was
reported, with a named owner and a defined action on a mismatch. A schema that can answer
the question and no process that ever asks it is a schema nobody maintains.

**P1. A user deleted their account eleven months ago. The account still appears in an
active-users dashboard, and the compliance team wants it out of a table where retention is
90 days. The deletion is a `deleted_at` on the `users` table. Why hasn't this worked?** `TRICKY`

Four reasons, and they are in the order I would check them. (1) **The dashboard filters on
the replica and the delete is recent** — no, that is eleven months, so lag is not it. (2)
**The dashboard is a materialised view or an aggregate table maintained by a job, and the
job's filter is `created_at < now() - 90 days` rather than `deleted_at IS NULL`** — so it
counts rows by age, not by liveness, and a user created 400 days ago and deleted last
month is counted. This is the most likely answer and it is a grain-and-definition bug, not
a `WHERE` clause typo: the question "what is an active user" has two defensible answers and
the dashboard picked the wrong one. (3) **The GDPR erasure path ran the anonymisation on a
different table** — the `users` row is soft-deleted, but the `user_profile`, `user_event`
and `search_index` rows still hold the email, and the compliance team's "out of the table"
means out of *all* of them, and nobody has a list. (4) **Retention and erasure are being
run as one job**, so the 90-day retention is deleting rows by `created_at` while the erasure
requirement is about `deleted_at`, and the two have been conflated in one scheduled task
for two years.

The fix has two parts. The first is a definition: write down that "active user" means
`deleted_at IS NULL AND last_seen_at > now() - 30 days`, put it in the dashboard's query,
and note that it is a *different number* from the one currently displayed, which means
someone has to tell people why the number changed. The second is a deletion inventory:
enumerate every table that holds a column capable of identifying a person, give it an owner,
and give it an erasure mechanism — a partition drop where retention allows, a `DELETE` on
the small ones, and a genuine hard-delete on the ones where soft-delete is not compliance.
The staff-level addition is that this inventory is a schema-level artefact, not a
per-dashboard fix, and the reason it needs to be one is that the next table someone adds
will reintroduce the same gap — so the durable fix is a `CHECK` or a naming convention that
makes "this column holds personal data" a queryable fact rather than tribal knowledge.

**T1. A SCD Type 2 table is written by two different code paths: the main API, which
closes and reopens atomically, and a nightly reconciliation job, which opens a new version
for any row whose address differs from what the system believes. A user who changed
address twice in one day now has three rows and no current one. What is the actual race, and
what constraint would have prevented it?** `ADVANCED`

The race is between the two paths' read-then-write cycles, and it is a classic
read-modify-write with no serialisation between the paths. The API's path is safe against
itself: `UPDATE ... WHERE valid_to IS NULL RETURNING ...` followed by the `INSERT` is one
statement, so two concurrent API calls serialise on the `UPDATE` — the second finds no
open row and updates zero rows, which is detectable. The job's path is not: it reads the
current row, compares in application code, and if it decides a change is needed it does
*its own* close-and-open. If the job reads the current row, then the API commits a new
version, and *then* the job closes the row it read — the job's `UPDATE ... WHERE valid_to
IS NULL` matches nothing (because the API already closed it), and depending on whether the
job checks the affected-row count it either (a) silently does nothing, leaving the
correction unrecorded, or (b) inserts a version on top with a `valid_from` that is *earlier*
than the API's, producing overlapping intervals with two current rows.

The constraint that would have prevented it is the one from Chapter 3: an exclusion
constraint on `tstzrange(valid_from, COALESCE(valid_to, 'infinity'), '[)') WITH &&`,
scoped to `(customer_id, address_kind)`. Overlap becomes *impossible* at the database
level, so the second writer's insert fails with a constraint violation rather than
producing a bad state — and a loud failure on a nightly job is a much better outcome than a
silent double-current row that only surfaces when somebody asks what the address was.
Secondary defences, in order: make the job's write use the same single-statement
close-and-open as the API's, so it participates in the same row-level serialisation; and
make every close check the affected-row count and raise if it is zero, so "someone else got
there first" is an explicit branch rather than a silent no-op.

The deeper version of this bug is the one to say in an interview: **it is a dual-write with
no shared transaction**, and the general fix — an advisory lock on `(customer_id,
address_kind)` taken by both paths, or routing both paths through one function — is what
prevents the next version of it. Two code paths that both mutate a temporal range is two
writers to a guarantee, and guarantees do not survive that.

**P2. Finance reports quarterly revenue and it changes between two runs of the same query
on the same data. The report joins an SCD Type 2 dimension and filters on
`valid_to IS NULL` plus a `WHERE` clause on the order status at report time rather than at
order time. What is the bug, and what is the correct query?** `STAFF`

Two distinct bugs, and separating them is the whole question. The first is the status
filter. In an SCD Type 2 table, a row's `status` is the status *as of the moment that row
was current*; when the order moves from `pending` to `shipped`, a new version row is written
with the new status and a bounded `valid_to`, and the old row is retained. So filtering
`status = 'shipped'` on the dimension table is filtering on the *current* status, not the
status at the time the fact was recorded — and a fact that was shipped in March and is
`refunded` today no longer matches a report asking "shipped in March". The status the report
wants is the one the *fact row* carries, or the one on the dimension version that was current
at the fact's date. The second is the `valid_to IS NULL` filter applied as a general
predicate rather than joined to the fact. `valid_to IS NULL` means "current now", so joining
it to a fact from six months ago forces the join to the *today* version and silently
re-states history with current values. The correct join is a range containment: join the
fact's date against the dimension's validity interval, so each fact resolves to the version
that was actually in effect when it was recorded.

```sql
SELECT SUM(f.amount) AS revenue
FROM order_fact f
JOIN customer_dim c
  ON c.customer_sk = f.customer_sk
 AND c.valid_from <= f.ordered_at
 AND c.valid_to   >  f.ordered_at          -- half-open; the same interval as the write path
WHERE f.ordered_at >= DATE '2026-01-01'
  AND f.ordered_at <  DATE '2026-04-01';
```

The `>` rather than `>=` on `valid_to` is not pedantry — it is the same half-open interval
from Chapter 3, and it is what makes adjacent versions non-overlapping at the boundary. A
fact at exactly the instant a version ended belongs to the *next* version, and `>=` would
match it to both.

The staff-level point is that "the report changed between two runs" is a *bitemporal*
symptom even when no one intended bitemporality. Each run of the report is a query executed
at a different *transaction time*, and because the query reads current versions it produces
a different answer for a fixed input. The fix that makes the report reproducible is to pin
the knowledge time: record, at write time, the interval during which a dimension version was
*known* to be current, and query the fact as-of both its event time and the report's
as-of time. Then re-running last quarter's report with the same as-of timestamp returns the
same number forever, and the discrepancy above stops being a bug and becomes visible as a
legitimate restatement you can explain to an auditor.

**T2. Two concurrent transactions both try to close the current version of a customer's
address and open a successor. Table has `EXCLUDE USING gist (customer_id WITH =,
tstzrange(valid_from, valid_to) WITH &&)`. What happens?** `ADVANCED`

`EXCLUDE` takes a lock that conflicts with itself, and the second transaction blocks on the
first — this is the difference between a constraint and an application-level check. When T1
commits, the exclusion constraint is re-evaluated for T2's pending row, finds it overlaps the
row T1 just wrote, and T2 fails with an exclusion violation. T2 does not silently create an
overlap, and T2 does not succeed because it read a stale snapshot: the index insertion waits
on the conflicting transaction and then re-checks against the committed state.

So the failure mode is a constraint violation surfaced as an exception at commit, not a
lock timeout and not a lost update. In application terms T2 must handle
`23P01 exclusion_violation` by retrying the read-then-write, and the retry has to re-read the
current version because T1's successor is now the one T2 must close. The practical trap is
that the common "read current, close it, insert successor" sequence is *not* atomic without
this, and without the constraint two interleaved transactions produce two open intervals
for the same customer — at which point every query using `valid_to IS NULL` returns two
rows, and the "which one is current" ambiguity propagates into every downstream join.

The design point worth drawing out: this is the case where a declarative constraint is not
an optimisation but the correctness argument. An application check — "does an overlapping
row exist?" — is a `SELECT` followed by an `INSERT` with a gap between them, and the gap is
where the second transaction slips in. The exclusion index closes the gap by making the
overlap check and the write a single atomic operation, which is a materially stronger
property than any amount of retry logic in the application.

**S1. Review this DDL for a subscription service. Is the `EXCLUDE` constraint right, and
what happens when you add a second history table for the same entity?** `ADVANCED`

```sql
CREATE TABLE subscription_history (
  id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  subscription_id bigint      NOT NULL,
  plan_code       text        NOT NULL,
  seats           integer     NOT NULL,
  valid_from      timestamptz NOT NULL,
  valid_to        timestamptz,
  CONSTRAINT no_overlapping_versions
    EXCLUDE USING gist (subscription_id WITH =, tstzrange(valid_from, valid_to) WITH &&)
);
```

The constraint is right for the stated purpose — one current version per subscription, and
no two versions overlapping in time. Three things to raise in the review, in order of how
much they will cost.

The first is that the exclusion constraint silently depends on `btree_gist` for the
`subscription_id WITH =` part; without that extension installed the `CREATE TABLE` fails
with a missing-operator-class error, and the failure surfaces at deploy time on whichever
node has the extension missing. That belongs in a migration precheck, not a discovery at
2am. The second is that this table has no `ON DELETE` story, so a subscription deleted from
the parent leaves its history rows, which is probably correct for a billing table and
certainly worth writing down explicitly. The third is the `id` primary key: for a history
table that is append-only, a `bigint` identity is right and cheap, and nothing about
correctness needs a surrogate natural key — but the `id` is not in any index, so the only
indexes are the primary key and the exclusion index, and any query filtering on
`plan_code` will sequential-scan a table that grows without bound. Add an index on
`plan_code` if that reporting query matters, and remember the table has no partition key, so
it will keep growing.

On the second history table: the answer is that you now have two independent overlap
constraints and no constraint between them, and that is the actual risk. If subscriptions
and invoices each have a history table and an invoice must be dated inside the subscription
version that was current when it was raised, nothing in this schema enforces it — the two
histories can disagree and the constraint set will still be satisfied. That cross-history
invariant cannot be an `EXCLUDE` constraint on either table; it is a deferred trigger, a
scheduled reconciliation query, or a modelling change to put both facts in one versioned
structure. Naming that as the cost of the design is the staff-level contribution, because
the first thing anyone will do after adding the second table is assume the constraints
compose.

**D9. A SaaS product bills per seat with mid-period upgrades. Finance needs to reconstruct
"what was the billable seat count on any given minute of history", and the current design
is SCD Type 2 on the subscription with a `seats` column. What is wrong with it, and what
do you model instead?** `STAFF`

What is wrong is that Type 2 on the subscription records *changes*, not *states*. If a
subscription goes 10 → 20 → 10 seats, Type 2 gives you three versions, which is correct as a
change log. But the billing question is not "when did it change" — it is "what was true
throughout this interval", and those differ the moment the change log is not the same as the
history. Specifically, Type 2's interval is the interval during which that version was
*current*, which is derived from the change, not independently recorded. The cost shows up
on corrections: if a change was entered late, or a backdated change is applied, the derived
intervals shift and every bill that overlapped them has to be recomputed — and there is no
record of what the intervals used to be.

The alternative is SCD Type 2 on a *derived state* row rather than on the subscription, with
one row per billing-relevant interval. When a change happens, close the open row and open a
new one — but key the rows on `(subscription_id, valid_from)` with the state fully
materialised, and record *why* each row exists. The billing-relevant history is then
`SELECT seats, valid_from, valid_to FROM subscription_state WHERE subscription_id = ? AND
tstzrange(...) @> some_instant`, which is a single index lookup and does not depend on
replaying a change log. That is the honest answer to a "reconstruct any instant" requirement.

The second half of the design is the interval boundaries. Billing boundaries are rarely the
moment the seat was added; they are often the moment of the month, or a proration rule, or
the contract anniversary. So the model needs a second timeline: the *effective* timeline
(when the seat count actually changed) and the *billing* timeline (when it started being
charged, which may be later). That is a bitemporal model and it is the only one that answers
both "when did the customer have 20 seats" and "what did we bill them in March" without
either answer corrupting the other. Concretely: `valid_from`/`valid_to` for the effective
state, and `recorded_from`/`recorded_to` for the knowledge interval, so a March re-run of a
February bill with a February knowledge cutoff still returns the original answer.

The staff-level close is that this is not over-engineering, it is the minimum for a system
that will be audited. Once seat counts can go up and down, any query that derives current
state by replaying changes is one bug away from billing a customer for seats they did not
have, and the cost of that is a refund process and a regulatory conversation. Materialising
the state costs one extra write per change and buys the property that any historical answer
is a lookup rather than a computation.

### Partitioning

**D10. `events` is 1.4 billion rows and 900GB. Retention is 90 days, currently implemented
as a weekly single-transaction `DELETE`. I want monthly range partitions on `created_at`.
Give me the plan, the risks, and what you are deciding not to solve.** `STAFF`

The plan, in order. **One, prove the key.** The top 20 queries from the slow query log, and
specifically: how many of them carry a `created_at` predicate? If most do, range
partitioning wins on both axes. If the hot path is per-customer with no time bound, the
partition key is right for retention and wrong for reads, and I say that explicitly and add
a `(customer_id, created_at)` index to carry the hot path — pruning will be nil for that
query and the index makes each of the twelve partition visits cheap. **Two, size the
migration before writing it.** Creating the partitioned parent and copying 900GB of heap
plus every index needs free space for a full second copy — 1.1TB — and verifying that is the
first task, because it is what kills these projects. **Three, the migration shape:** empty
parent with identical schema and indexes, twelve monthly partitions plus next quarter's
created empty ahead of time, slice-by-slice `INSERT ... SELECT ... WHERE created_at >= x
AND created_at < y` per month in the lowest-traffic window with the source still
authoritative, a short write freeze, a final delta copy, a rename, and a rollback plan that
is renaming the old table back. **Four, the retention job becomes `DROP TABLE
events_2026_03;`** — ~180ms, no locks on live tables, no WAL — with the batched `DELETE`
retained only as a documented fallback for tables not yet converted. **Five, `ANALYZE` each
partition after the copy**, because the new table's statistics start empty and day one of
a partitioned table with no statistics is a day of confidently bad plans.

The risks, in order of how much they worry me. The disk requirement, which is usually the
project-killer. Index build time: every parent index is built per partition, so 12
partitions × 6 indexes is 72 index builds. And the one that is a *correctness* change
disguised as a mechanical one: any `UNIQUE` constraint that did not contain `created_at`
was global and now becomes per-partition, so it has to be re-expressed with the partition
key included or moved to the application — and nobody notices until two months later when
a duplicate exists in two different months. I would also plan for the `DELETE`'s existing
blast radius during the copy: the copy itself is a sustained 900GB of sequential write and
it will interact with the buffer pool and the WAL.

What I am deciding not to solve: the customer-history query still prunes nothing and visits
twelve partitions; global reporting is unchanged and still slow; the other eleven large
tables are not converted, because doing twelve of these sequentially is a quarter of work
and this one is the proof. I would say that out loud, because a migration plan that claims
to solve everything is one that gets half-funded.

**D11. The team wants to shard `orders` by `merchant_id` because "merchants are the natural
tenant boundary". The hot queries are: a customer's order history, a merchant's order list,
and a global revenue report. Give me the four-property analysis and your
recommendation.** `STAFF`

`merchant_id` has good cardinality (400,000 merchants) and, on a marketplace, roughly
acceptable evenness. It fails the fourth property — query alignment — for two of the three
hot queries, and that is the property that decides everything else.

A customer's order history has no `merchant_id` in the predicate at all: the customer has
ordered from eleven merchants, so the query becomes an eleven-way scatter-gather to
retrieve a customer's small, bounded set of rows. The merchant's order list prunes
perfectly, and the global revenue report touches every shard — which is the finance team's
most important query and the one least suited to a fan-out. And there is a fourth property
that I would check rather than assume: **stability**. Merchants get acquired, onboarded
into a parent group, and migrated between legal entities, and each of those changes the
`merchant_id` a row is filed under — which is a reshard, and a reshard is the most
expensive routine operation in the industry. So the recommendation is to shard by
`customer_id`: the customer is the entity present in the most queries, `customer_id` never
changes, cardinality is 4.2M, and order distribution per customer is close to log-normal so
a hash is even to within a few percent — which I would verify with an actual
`GROUP BY` on hash bucket before committing, not assume.

What that costs, named: the merchant's order list becomes the scatter-gather. The answer is
a denormalised `merchant_id → customer_id[]` lookup maintained on write, which turns the
query into "find these 11 customers, then 11 single-shard reads" — bounded and predictable
rather than unbounded — plus a per-merchant order-count aggregate so the listing does not
read order rows at all. The global revenue report becomes a warehouse query against a
pre-aggregated rollup, and it should be one whatever the shard key is. The one thing I
would add as a genuine risk: if any single customer represents more than a few percent of
orders — plausible in a B2B system — then `customer_id` hashing is *not* even, and the
answer is a dedicated sub-shard for that entity, which is an admission that perfect
uniformity was never achievable and is better than discovering it in production.

**T1. A query that was 40ms becomes 900ms after a "harmless" change from inline literals to
a parameterised query. Nothing in the SQL changed. The table is partitioned monthly on
`created_at`. What is the most likely explanation and how do you confirm it?** `ADVANCED`

Prepared-statement plan caching, and the generic plan. With a custom plan the planner knows
the literal value of `created_at`, compares it against the partition bounds, and prunes
eleven of twelve partitions. With a generic plan it holds a `Param` with an unknown value,
cannot prove any bound, and visits all twelve — same query, same index, twelve times the
work, no error anywhere. The application change that triggers it is usually a switch to
server-side prepared statements, an ORM's list-parameter handling changing strategy, or a
change in how the connection is pooled.

The confirmation is `EXPLAIN (ANALYZE)` with the parameter explicitly set, alongside the
plan actually chosen — `pg_prepared_statements` and `pg_stat_statements` will show a
generic plan where you expected a custom one — plus `log_planner_stats`. The specific
PostgreSQL lever is `plan_cache_mode = force_custom_plan` for the statement or session.

The staff-level point is that the mitigation is not "always force custom plans", because
planning is not free at 10,000 executions/second and for a genuinely high-cardinality
parameter a custom plan fitted to one sample is *worse* than a generic one. The durable
answer is a partition-key choice that the query constrains with an **equality**, because
equality on a partition key prunes correctly under a generic plan — the value is known at
execution time. Range predicates on the partition key are the fragile case, and that is an
argument to be made at design time, when the partition key is being chosen, not at incident
time. It is a nice illustration of the general principle: some of the most expensive
operational incidents are design decisions that were made in a different room six months
earlier.

**P1. A 900-million-row events table was partitioned by month on `created_at`. Eighteen
months later, 40% of queries are dashboard queries for "the last 90 days of activity by
region", and they are slow. The monthly partitions are 50 million rows each. What went
wrong, and what do you do given you cannot re-partition without downtime?** `STAFF`

What went wrong is that the partition key is a *reception* timestamp and the queries are
*analysis* over a window that does not align with it. `created_at` monthly partitioning
prunes beautifully for "give me March" and gives nothing for "last 90 days", which spans
three to four partitions regardless of how they are cut, because a rolling window has no
boundary. So every dashboard query reads three or four 50-million-row partitions, aggregates
40 million rows, and the cost is set by the row count rather than the range. Pruning did its
job; the job was just not the job being asked for.

Given no downtime, the fixes in order. **Add a second, aligned index** on
`(region, created_at)` inside each partition — a covering index where the whole query is
answered from the index, so the 40 million rows never become 40 million heap fetches. This
is the cheapest intervention and often sufficient: partitioning already narrowed it to a
third of the table, and an index finishes the job. **Add BRIN** on `created_at` if the
inserts are in roughly time order, which for an event stream they usually are — a BRIN
index on a 50-million-row partition is a few hundred blocks, gives coarse range pruning
without the write amplification of a full B+ tree, and is the right structure for
"append-only, monotonically keyed" data. **Materialise the dashboard** into a rollup table
maintained by a scheduled job or a trigger, keyed by `(day, region)`, so the query reads a
few thousand rows; this is the honest answer for a query that is expensive, frequent, and
tolerant of being a few minutes stale. **Re-partition** on a key that matches the query, and
if you must, do it with a new table populated by `INSERT ... SELECT` in chunks, verified,
then an atomic rename — a new table gets the new layout and old queries keep working against
the old one until cutover.

The staff-level observation is about the *process*, not the fix. The team partitioned on a
key that was plausible and defensible at the time, and the requirement that would have
disproved it — "we will also have rolling-window dashboards" — was not written down. So the
takeaway is not "partition on the dashboard's column"; it is that a partition key is a
commitment about which queries you have optimised for, and a 40% workload that the partition
key does not serve is a design mismatch, not a performance bug.

**T2. A table is range-partitioned by month on `created_at`, and this is the query:** `TRICKY`

```sql
SELECT region, count(*)
FROM events
WHERE created_at >= now() - interval '90 days'
GROUP BY region;
```

You have 18 months of partitions and 40 reporting users. Does the planner prune, and what
does `EXPLAIN` actually show?

It prunes — and how well depends on a runtime detail worth understanding rather than
assuming. The partition key is `created_at`, the predicate is on `created_at`, and the bound
is `now() - interval '90 days'`, which is a **stable** function, not `volatile`. That matters
because the planner evaluates stable expressions once at the start of the statement and can
use the resulting constant for pruning at *plan* time. Had the predicate been
`now() - random() * interval '90 days'`, or had the expression been volatile, pruning would
be deferred to execution time — the plan would include a runtime pruning step that walks
partitions one by one. Either way the partitions are excluded, so the row count is the same;
the difference is planning overhead and whether the pruning shows up as an `Append` node
with three child scans or as a `Subplans Removed` line.

The `EXPLAIN` output will show something like `Append` with three or four `Seq Scan` (or
`Index Only Scan`) children, and — for the runtime case — a note like
`Subplans Removed: 14`. That note is the visible proof of pruning, and the number of
remaining child scans is the number of partitions the query actually touched. So the
concrete check is: count the child scans. If it is three, the range predicate pruned fifteen.
If it is eighteen, nothing pruned and the reason is almost always that the *leading* index
column does not match the partition key — the query is only filtering on an indexed column
that is not `created_at`, so each partition gets a full scan and the partition key is doing
locality work that an index would do better.

One more thing worth saying out loud: pruning reduces the partitions scanned, not the rows
returned. Even perfectly pruned, this query aggregates tens of millions of rows, and
partitioning did nothing about that — it bounded the input, not the work. A rollup table is
the answer to the work, and this is the standard place where "we partitioned it" stops being
an adequate answer.

**S1. Review this partitioning DDL. Three things are wrong and one of them will bite in
production.** `ADVANCED`

```sql
CREATE TABLE events (
  id          bigint GENERATED ALWAYS AS IDENTITY,
  account_id  bigint      NOT NULL,
  region      text        NOT NULL,
  payload     jsonb       NOT NULL,
  created_at  timestamptz NOT NULL
) PARTITION BY RANGE (id);

CREATE TABLE events_2026_01 PARTITION OF events
  FOR VALUES FROM (0) TO (1000000);
```

The wrong things. **The partition key is `id`, and `id` is a sequence.** Sequences produce
values that are monotonic *globally* but are allocated in blocks, and more importantly, a
sequence's values do not correspond to any time boundary you can name in advance — so you
cannot pre-create a partition, and more importantly you cannot predict which partition a
row lands in. This is a design that looks partitioned and behaves like one enormous
partition, plus the overhead of routing every insert. If you want to partition by an
identity you must derive the boundary from a timestamp. **The range is arbitrary** — `0` to
`1000000` — which means the partition fills at a rate nobody has calculated, and the moment
it fills, inserts fail with an "no partition of relation found" error until someone notices
and adds another. **There is no `DEFAULT` partition.** Adding one is what turns the
operational failure mode from a hard error into a silently-growing catch-all that you
discover by querying it — and the reason teams want one is precisely that the error is
awful. **The primary key is missing.** PostgreSQL requires that a partitioned table's
uniqueness constraints include the partition key, so `PRIMARY KEY (id)` is rejected here and
the table has *no* unique constraint at all. The fix is `PRIMARY KEY (id, created_at)`, which
is workable but changes the meaning of the key: a duplicate `id` in a different month is now
allowed, and every "id is unique" invariant in the application becomes an assumption rather
than a guarantee.

The one that bites in production is the missing key. The other three fail loudly at deploy
or at the first overflow; the missing key fails the first time a retry double-inserts, which
is exactly the moment you are already dealing with something else.

**D12. A 1.2-billion-row table is unpartitioned. Leadership wants it partitioned "for
performance". Before you partition, what three questions do you need answered, and what
would each answer let you do instead?** `STAFF`

Partitioning is not a performance intervention; it is an *operability* intervention that
happens to improve some queries. So the first three questions are diagnostic, and each one
can point at a cheaper answer than partitioning.

**One: what query is slow, and is the slow part scanning, sorting, or updating?** If it is
scanning, the answer is an index or a rollup, and both are reversible in minutes. If it is
updating — a 1.2-billion-row table where a single `UPDATE` touches 2% of the rows and takes
three hours because of index maintenance and vacuum — then partitioning genuinely helps,
because you can find a partition where the affected rows are a small fraction and operate
there. That distinction is the whole of "does partitioning help" and it is knowable from
`pg_stat_statements` before you change anything.

**Two: which operation are you trying to make cheaper?** Each of the three big wins maps to
a different question. Bulk `DELETE` maps to "what is our retention policy" — the answer
might be partition on time and `DROP`. Time-window queries map to "what is our top
dashboard" — the answer might be a rollup table of 50,000 rows. Maintenance maps to
"vacuum, reindex, `ALTER TABLE`" — the answer might be the partition itself, since those
become per-partition operations you can run during a maintenance window. If you cannot
answer "which operation", you are not ready to partition, and the honest response is that
you do not yet know what problem you are solving.

**Three: does the partition key have the right distribution, and will it still in three
years?** Not "is it a column I have" but "will every future query filter on it". This is
where the 1.2-billion-row case is genuinely different from the tutorial case: a
mis-chosen partition key on a small table is recoverable in an afternoon, and on a
1.2-billion-row table it means an `INSERT ... SELECT` of the entire table, a verification
window where both copies exist, and a storage cost of two full copies during cutover — which
is a real number you should calculate, because a 1.2-billion-row table at 200 bytes is
240 GB and you will need that much free space plus WAL for the copy.

Then the sequencing, which is the staff part. There is a cheaper first move available for
most tables in this position: **verify the partition key before you commit to it**, by
adding the partition key as a *leading index column* first and measuring. If the index makes
the workload fast, you may never partition; if it does not, the index has told you which
queries partitioning would help. And when you do partition, do it by building the new
partitioned table alongside, verifying row counts and checksums, and flipping atomically —
never by rewriting the existing table in place, which on 1.2 billion rows is an
all-day operation with no rollback.

### Sharding

**D13. Design the sharding for a B2B marketplace — customers, merchants, orders, payments.
Give me the shard key, the four properties checked, the queries that lose, and what you do
about the big merchant.** `STAFF`

The shard key is `customer_id`, and the reason is query alignment, not the obviousness of
"tenants". *Cardinality*: 4.2M customers against 64 shards, ~65,000 per shard, fine.
*Evenness*: order volume per customer is close to log-normal, so a hash of `customer_id` is
even to within a few percent — verified with a real `GROUP BY` on hash bucket before
committing. *Stability*: a `customer_id` never changes; identity merges go through a
separate resolution table and a planned offline move, which is a reshard I would rather
have rarely. *Query alignment*: this is the one that decides it. "My orders", "my saved
sellers", "my payments", "my disputes" is the overwhelming majority of the product, and
every one of those is one shard.

The queries that lose, by name: merchant order listing, global revenue reporting, and
cross-marketplace search. Each gets a different answer. Merchant listing becomes a
denormalised `merchant_id → customer_id[]` map maintained on write, so the query is "these
11 customers, then 11 single-shard reads" — bounded, not a 64-way fan-out — plus a
per-merchant order-count aggregate so the listing never reads order rows. Global revenue is
a warehouse query against a pre-aggregated rollup; it should never touch the OLTP shards
whatever the shard key is. Search belongs in a search engine fed by the change stream.

The big merchant is the part that deserves a real answer. If one merchant is 8% of orders,
hashing by `customer_id` scatters those orders — *unless* the merchant's buyers are
themselves skewed toward a few customers, which in a B2B marketplace they usually are. So
the mitigation is three-layered: the merchant-to-customer map bounds the read; a
per-merchant aggregate maintained on write means the listing query reads no order rows at
all; and a merchant whose order rate exceeds a threshold gets its own sub-shard keyed on
`merchant_id` for a separate high-volume table — a deliberate second shard key for one
entity, and an honest admission that perfect uniformity is not achievable.

The two day-one decisions that are free now and impossible to retrofit: start at 64 shards
on hardware that serves 32, so the next growth is a per-shard *split* rather than a
whole-cluster *rehash*; and keep the routing function in a lookup table rather than in
`crc32(customer_id) % 64` inside a library, so changing it is a data change rather than a
fleet-wide deployment plus a migration.

**D14. A competitor just moved to 64 shards and is winning on latency. We have one very
large machine and are also losing on latency. What do you tell my CTO?** `STAFF`

I tell them the competitor's latency win is not evidence that sharding caused it, and that
copying the move would cost a quarter and might not move our number at all. The first thing
to establish is *which* queries are slow — and in my experience it is the reporting and
dashboard queries, in which case the fix is pre-aggregating them, a week's work, not
distributing the transactional data. If the core transactional path is genuinely saturated,
the conversation is real, and then the next step is to measure *what* is saturating: an
expensive plan, a missing index, a hot row contended by thousands of writes, or a vacuum
that cannot keep up. All four are one-node problems with one-node fixes, and sharding
distributes the symptom while adding a permanent constraint.

The second thing is the connection count, because that is the wall most teams hit *before*
the disk fills. Forty services × 25 instances × a pool size somebody copied is 20,000
potential connections against a few hundred slots — Chapter 8. The sequence for a team in
our position is: pool management, then index review, then vertical partitioning of the wide
tables, then archiving cold partitions, then pre-aggregating reports, and only then
sharding. Each step is days to weeks; the reshard afterwards is a quarter.

The third thing, and it is the staff answer: **sharding is a decision about the org as much
as the data.** Every team that touches the schema now needs to know the shard key, needs a
connection pool sized for their own share, and needs to answer "can this query run without
fanning out?" in code review. It creates a permanent constraint that is invisible until you
are living inside it. My ask is for a named owner for the routing layer, a written policy
on which queries may fan out, and agreement that the shard key gets a design review with
the two most senior engineers present — because the alternative is that it gets decided in a
ticket by whoever is on call that week, and discovered to be wrong eighteen months later
during a migration nobody budgeted for.

**T1. A sharded system fans out across 64 shards. Per-shard p50 is 8ms, p99 is 40ms.
End-to-end p50 is 9ms and end-to-end p99 is 600ms. Account for the 600ms.** `ADVANCED`

The 600ms is 15× the per-shard p99, so the scatter-gather layer is adding latency the shards
themselves do not have. Four contributors, and it is usually a combination.

**The maximum, not the average.** End-to-end latency is `max(per-shard)`, so it is set by
the 99th percentile *of the maximum across 64 draws*, not by the p99 of one shard. With
independent samples from that latency distribution, the max of 64 lands well above 40ms —
order 150–250ms. The amplification is arithmetic, not a fault, and it is precisely why
fan-out hurts the tail far more than the median.

**Serial rather than parallel fan-out.** A coordinator issuing shards sequentially — which
a naive client with a connection pool of 4 does, queueing 60 of the 64 — spends 512ms at
8ms per shard, and more if 16 of them are at 40ms. The deciding number is the ratio of the
coordinator's pool size to the shard count, and a pool below the shard count guarantees
queuing.

**The coordinator's own work.** 64 sockets, 64 buffers, 64 threads, and a merge. A
`LIMIT 20` query fanned out to 64 shards has to fetch 64 *sorted* streams and merge them
before it can discard most of the result — `O(N log 64)` CPU and allocation on the critical
path, and that time appears in no shard's latency metric.

**Head-of-line blocking in a shared pool.** If fan-out shares the request-path pool — the
framework default — then 50 concurrent dashboards occupy it entirely and the 51st
user-visible request waits for a dashboard. The p99 is then set by *other users' reports*,
and no shard-side optimisation moves it. The fix is a separate pool for scatter-gather with
its own size, timeout and concurrency cap, so a fan-out storm degrades fan-out.

The right first move is to break the 600ms into fan-out time, merge time, and pool wait
time — three different problems with three different fixes, and only one of them is about
the database. The headline to give the interviewer is that 9ms p50 with 600ms p99 is a
healthy-looking median hiding a scatter-gather problem, which is exactly how a sharded
system disappoints.

**S1. This PR adds a `shardKey` extractor to the data-access layer, implemented as
`crc32(orderId) % 64` in a shared library, with the shard map hard-coded and the modulus a
constant. Review it.** `STAFF`

The blocking objection is that this makes the reshard impossible without a fleet-wide
deployment. The routing function is the thing that defines where every row in the system
lives; a hard-coded modulus in a shared library means that changing the shard count — or
fixing a bad shard key — requires a code change, a build, and a rolling deployment across
every service *simultaneously with* the data migration, because the old code and the new
code disagree about where rows are. That is a dual-write window with no way to have both
versions live, which is the worst possible version of the reshard: no rollback, because
rolling back the code would also change the routing.

The correct shape is a routing *table* — `(key_prefix, shard_id)` rows in a table or a
config service, cached with a short TTL and hot-reloadable — so that changing the map is a
data change that the running binaries pick up, and so that the old and new maps can coexist
during the migration. That is what Vitess calls a vindex, and the reason the concept exists
is that routing has to be a datum, not a constant.

The second objection is that `orderId` is the wrong key and it is worth asking how they
chose it. The hot query is "this customer's orders", which has an `orderId` in the
predicate only if the caller already knows it — so the query that dominates the product's
traffic is a 64-way fan-out, and the `LIMIT 20` pagination makes it worse because each
shard must return a sorted page and the coordinator must merge 64 sorted streams. The
suggestion is `customerId`, with the merchant-side lookups denormalised into a
`merchantId → customerId[]` map. And the stability question must be asked out loud: does
`orderId` ever change? It does not, which is good, and the answer to "why did you pick it"
is likely "it was on the object we already had", which is a reason the review should not
accept.

The third comment is about the number 64 and the hardware. Sixty-four is a magic constant
with no recorded justification, and the two questions that decide it are "how many shards
does the current hardware need" and "how far away is the next hardware change". If the
answer is 32, then 64 is right *if and only if* the routing table makes the next step a
per-shard split rather than a rehash — which is exactly why the first objection has to be
resolved before the second is meaningful. The fourth is smaller but real: a shared library
means the extraction is not instrumented, so there is no metric for "how many queries
fanned out to how many shards", and without that metric none of the scatter-gather costs in
Chapter 6 will ever be visible on a dashboard.

**P1. A 12-shard MySQL cluster has one shard holding 9x the data of every other shard and
taking 60% of the query traffic. The shard key is `tenant_id`. Two of the nine largest
tenants are on that shard. What are your options, in order of preference, and which one
forces a reshard?** `ADVANCED`

The first diagnostic question is *why* — the imbalance has two very different causes and
they have different fixes. Either the two largest tenants genuinely produce 9x the traffic,
in which case the shard key is doing its job (grouping related data together) and the
problem is capacity on one node, not the key; or the two tenants became large *after* the
sharding was chosen, in which case the key's evenness property has decayed over time and
this is the beginning of a reshard. Distinguishing them is `SELECT tenant_id, count(*)` per
shard — if two tenants account for the difference, the key is fine and the tenants are just
big.

In preference order. **Move the tenants to dedicated nodes.** The cleanest fix, because it
preserves the shard key's semantics: leave the shard set alone, and route the two large
tenants to separate nodes. This requires no reshard at all if your routing is a table rather
than a hash function (Chapter 6's point) — you change the table. If routing *is* a hash, you
cannot do this, which is a direct argument for the routing table. **Split the tenants
internally**, giving each a suffix on the shard key, so a tenant's rows are further
partitioned across a subset of nodes. Correct, but the second query to the tenant's data now
scatters, and any cross-suffix aggregation for one tenant becomes a fan-out. **Reshard.**
Only if the first two do not fit.

The reshard is the one that forces you through the four-phase procedure in Chapter 6, and
the reason is not the data movement — at this size that is a few hours — it is that **the
shard key's stability property has failed**, and you are about to write rows to a different
key range than they were originally hashed into. That breaks everything that assumes
`hash(tenant_id) → shard`: existing foreign-key-like references, cached shard lookups,
materialised views, and any query that assumed a single-shard aggregate for a tenant. The
dual-write phase exists precisely to build the new mapping before anything reads from it,
and skipping straight to a bulk move means a window where a `customer_orders` table and its
referencing table are on different shards, which is a referential integrity problem with no
transaction across it.

The staff-level point is that imbalance is a normal steady-state condition of a sharded
system, not an incident. A shard key with perfect evenness at launch will be uneven within
a year. So the design requirement is not "choose an even key" — it is "choose a key whose
imbalance you can *remediate without resharding*", which is the routing-table property from
Chapter 6 and the reason the answer to "can I move a tenant" is worth more than the answer to
"is the distribution even today".

**T2. A query is `SELECT * FROM orders WHERE customer_id = ? AND status = 'open'`.
Sharded by `customer_id`, 64 shards. What does the plan look like, and what happens to it
if `status = 'open'` is 0.2% of that customer's orders?** `TRICKY`

The plan is a single-shard lookup — `customer_id` is the shard key, so the router resolves
`customer_id` to one shard and the query executes there and nowhere else. That is the entire
benefit of query-aligned sharding, and it is why the sharding decision is made on the
largest-volume query rather than on load distribution.

The 0.2% is where the interesting problem lives. The shard has, say, 5,000 of that
customer's orders and 15 of them are open. To find those 15, the query has to look at all
5,000 — because there is no index that can answer "which 15 are open" without scanning, and
`status` is not in the shard key so the best available plan is an index on
`(customer_id, status)` giving 5,000 index entries filtered to 15, or a full scan of 5,000
rows. The query is fast in absolute terms and that is the trap: it will never appear on a
latency dashboard, because 5,000 rows on one node is a millisecond. It becomes a problem
through accumulation — a customer with 500,000 historical orders now has an open-orders
query that reads 500,000 rows to return 20, and *that* customer's query is 50x the average,
which is exactly how a per-customer query can quietly become the slowest query in the system
while never being the slowest query on any given dashboard.

Two mitigations, and the second is the interesting one. An index on `(customer_id, status)`
in the right column order makes it an index-only scan over 5,000 index entries rather than
5,000 heap rows, which is a large constant-factor win but still linear in the customer's
total order count. The structural fix is that **the index column order should match the
filter selectivity and the shard key should match the identity**, which it does — so the
remaining improvement is a covering index that includes the columns the query returns,
turning it into an index-only scan over entries small enough to stay cached. The more
aggressive fix is to not ask the question that way: maintain a small `open_orders` table
partitioned by `customer_id`, holding only non-terminal orders, so the query reads 15 rows
out of a 15-row table. That is a denormalisation with a strict insert-and-remove discipline,
and it is the right answer for a "current state" query over a large append-only history.

The general lesson: **sharding on `customer_id` makes all of one customer's rows co-located,
which converts a distributed problem into a local one, but it does nothing about the fact
that one customer's data can be unbounded.** Per-key skew is the residual problem that
survives good sharding, and the durable answer is to bound the per-key working set
somewhere — by archiving, by a current-state table, or by a second sharding dimension.

**S2. Review this sharding routing code. What breaks at 2x growth, and what is the bug that
breaks today?** `ADVANCED`

```java
public String shardFor(long customerId) {
    return "shard-" + (Math.abs((int) customerId) % 16);
}
```

Two problems. The **today bug** is `Math.abs((int) customerId)` — the cast to `int`
truncates, so any `customerId` above `Integer.MAX_VALUE` wraps to a negative number, and
because of the overflow *different* large IDs can map to the same shard with no useful
relationship. The classic case is a 64-bit ID whose low 32 bits happen to be `0x80000000`,
which becomes `Integer.MIN_VALUE`, whose `Math.abs` is itself `Integer.MIN_VALUE` (still
negative), so `% 16` yields a negative shard number and you get a shard called
`shard--8`. Silent, and it only affects a fraction of rows, which makes it a support-ticket
bug rather than an outage. `Math.floorMod` or masking with `% 16L` fixes it; the point is
that the modulo is on a value the author did not reason about the range of.

The **growth problem** is `16`, hardcoded. Resharding to 32 requires changing this literal,
redeploying every application instance, and having every instance agree on the boundary
instant — and instances that disagree route the same customer to different shards, which
means duplicate rows and reads that cannot see their own writes. So the shard count is
effectively frozen at 16 by this function, forever, which is Chapter 6's reshard phase in
miniature: change the number and you have started a migration whether you meant to or not.

The review recommendation is the one from Chapter 6 — **routing must be data, not code**.
A `shard_routing(tenant_id, shard_id)` table, or a shard-count held in configuration with
consistent-hash ranges rather than a modulo, means growth is a data migration plus a config
change rather than a coordinated code deploy. If you must keep a computation, hash
modulo with a *range assignment table* of `(start, end, shard)`, so the mapping is
`sum of shard counts` rather than a literal, and reshard is a table update.

**D15. Your order system must support (a) a customer's full order history, (b) reporting
across all orders, (c) per-merchant settlement, and (d) a customer's live "what is in my
cart". Pick a shard key and defend it, and say which of the four you just made worse.**
`STAFF`

The key is `customer_id`, and the argument is that (a) and (d) are the queries that scale
with the customer base and must be single-shard, while (b) and (c) are the queries that are
already expensive and tolerate fan-out because they are run by a small number of internal
consumers. That is the whole sharding heuristic: **align with the largest external query
volume, accept fan-out on internal aggregate volume.**

With `customer_id` as the key: (a) is one shard, one index range, no fan-out. (d) is one
shard and one row — cart state is small and hot, and co-locating it with the customer's
orders means the cart query and the "is there an unpaid order" check are the same shard.
(c) is the price: settlement is a merchant-scoped aggregate, so it fans out across every
shard and then reduces, and a merchant with orders from 2 million customers is a
scatter-gather over 64 shards. (b) is the other price: a global report is a full scatter.

Now the part I would actually argue for in the interview. The naive response is to say "use
a compound key, `merchant_id` then `customer_id`", and that is a trap. It would make (c) and
(b) single-shard and force (a) and (d) to scatter, which is the worse trade: the customer
facing queries are the ones with unbounded user count, and the internal reports are run by
maybe 200 people. Then the follow-up: what if one merchant is 30% of the business? Then
`merchant_id`-first sharding puts 30% of all data on one node, and you have traded a
correctness-neutral fan-out for a capacity incident.

So the resolution is not a single perfect key — it is acknowledging that this workload has
two access patterns with different shapes, and the durable design separates them. The
**write path and the customer-facing reads stay sharded by `customer_id`**, because that is
where the volume is. The **reporting and settlement path gets its own structures** — a
settlement table keyed by `(merchant_id, period)` populated by a consumer reading the change
stream, and report rollups maintained off the same stream. This is a CQRS-shaped answer, and
the reason it is the right one here is a specific property: reporting and settlement are
*derived* data, and derived data can be rebuilt, denormalised, and sharded on a different key
than the source without any consistency risk. A settlement table sharded by `merchant_id` is
not competing with the order table sharded by `customer_id`; it is a different store with
its own key, fed asynchronously.

The staff-level close: the honest framing of the trade is that (a) and (d) are the queries
whose fan-out cost is borne by the *product*, because a user waiting on a page load is a
revenue-visible latency, while (b) and (c) fan-out cost is borne by *us*, as batch job
runtime. Align the key with whoever feels the latency. And then say the thing that
distinguishes a staff answer: "if I could only pick one, I pick `customer_id`, and I would
also raise that our reporting requirement is currently unserved by any index, so the fan-out
decision is really a decision to build a reporting store — and that is a project, not a
schema."

### Replication & Read Scaling

**P1. Users report that saving a profile change sometimes appears to do nothing. One
ticket says an account "reappeared after being deleted". No errors. Latency normal.
Investigate.** `STAFF`

Two findings, and the second is the more serious. The first is a read-after-write
violation: the profile page is served from a read replica, there is no sticky routing, and
the save-then-redirect lands on a replica that has not yet received the commit. Replica lag
was being monitored as a five-minute average reading "healthy" at 40ms, which is entirely
compatible with a p99 lag of 3–8 seconds — the average is the one statistic that cannot
detect this, because the problem is a tail.

The second is the one I would escalate. The deleted account "reappearing" is a scheduled
retention job that read `deleted_at IS NULL` from the replica to decide which accounts to
purge. On a lagging replica it found an account deleted nine seconds earlier, concluded it
was still active, and reactivated it. The next run, nine seconds later, found it deleted
again, and the flapping continued for as long as the lag did. That is a **background job
taking a destructive, state-changing action on the basis of a replica read**, and it is not
a staleness annoyance — it is a job undoing a deletion, repeatedly, driven by a latency
metric nobody was watching correctly.

The resolution, in order. Any job that takes a destructive or state-changing action reads
from the primary, with a `FOR UPDATE SKIP LOCKED` batch pattern and a hard timeout; the
rule goes into the service's data-access template so it cannot be forgotten. The
save-then-redirect endpoint is routed to the primary, ideally via sticky-by-replay-LSN
rather than a time window, because a time window is a guess about a distribution. The
reporting job that was *causing* the lag moves to a cascading reporting replica so Finance
queries stop producing user-visible correctness problems. And lag alerting changes from a
five-minute average to a per-minute p99 with a 2-second page threshold, because a metric
that cannot detect the failure is not a metric.

The prevention is the generalisation: reads that may be stale are reads that only produce a
response to a human. Anything that writes, deletes, or decides reads from the primary.

**D16. We are adding three read replicas and routing 90% of reads to them. Give me the
design, the failure modes, and what goes on the dashboard.** `STAFF`

The design starts with the routing rules, because they are the design and the replicas are
hardware. Priority order: a read in a session that wrote within the freshness window goes
to the primary; a read tagged `require_fresh` goes to the primary — and that tag set is
the save-then-redirect endpoints, permission checks, and every read inside a destructive
job; everything else goes to a replica. I would implement this as a per-request middleware
decision rather than a config flag per query string, so the default is safe and staleness
is an explicit, reviewable exception. And I would use sticky-by-replay-LSN over
sticky-by-timer, because the timer is a guess about lag and the LSN comparison is not — the
write records the replica's replay position and a read refuses to go to a replica behind
it, degrading to slow rather than to wrong.

The failure modes, named in advance. Lag exceeding the freshness requirement — a correctness
event, so it pages. A replica dying, which is not a primary problem under asynchronous
replication and *is* a primary problem under synchronous, so the write path's dependency on
replicas has to be stated and its degradation behaviour documented. **A replica being
silently wrong rather than merely stale** — restored from a bad backup, or a `pg_rewind` that
went the wrong way, serves confidently incorrect data and no lag metric detects it; the
mitigation is periodic row-count and checksum comparison against the primary. And a replica
running out of disk, which is how replication historically *stops* rather than fails — a
stopped replication with a healthy process is the worst of both, because there is no error
to alert on.

The dashboard, six panels. Replication lag in seconds, per replica, as a per-minute p99
and never an average. Bytes replicated per second versus bytes generated, so a backlog is
visible *before* the lag metric moves. Replica disk free, the leading indicator. Replica CPU
and I/O, because a CPU-starved replica is a lag generator. The primary/replica query-count
split, because "90% of reads" is a claim that should be continuously verified. And an
application-level counter of reads served from a replica inside a freshness violation — the
only one of the six that measures what users actually complain about.

The last thing: three replicas plus a primary across 40 services is a different connection
problem from one database, and each replica is a full set of `max_connections` consumed by
pools sized for a single node. That is Chapter 8's arithmetic, and it is the constraint
that will decide how many replicas you can actually afford.

**S1. A PR changes the read router so that every `SELECT` without a `WHERE` clause is routed
to a read replica, on the reasoning that "they are read-only queries". Review it.** `STAFF`

The reasoning is the misconception, and replacing it is the whole comment: "read-only" is a
property of the SQL and freshness is a property of the *question*. The queries this rule
misfires on are precisely the ones that matter, and they share one shape — a read that
immediately follows a write in the same user-visible flow. The checkout confirmation reading
the order just placed. The profile page after save-and-redirect. The "your subscription was
cancelled" acknowledgement. The permission check deciding whether the admin menu appears
after a role change. Every one is a `SELECT`, and every one is a read-after-write violation
waiting for a lag window.

The blocking change is to invert the default: route to the primary, and make staleness an
explicit opt-in per call site with a comment naming why it is acceptable. That way a
developer who has not thought about freshness gets correctness by default, and a developer
who has decided to tolerate staleness has written down the decision where a reviewer can
see it. A blanket rule for `SELECT` is neither reviewable nor safe.

The second comment is on the mechanism. A time-based sticky window — "primary if the last
write was within 5 seconds" — is a guess calibrated to a lag distribution, and the guess is
wrong exactly when it matters: if p99 lag exceeds the window, the guarantee is already void
and nothing in the application will say so. So either sticky-by-LSN, or a time window plus
a page when p99 lag exceeds it. The second is defensible; the first is correct.

The third comment is the operational consequence this PR creates. Reads on replicas make
replica lag a *page-level correctness* metric for this service, so the runbook has to
contain the answer to "what do we do when it pages" — and "restart the replica" is not an
answer until someone has worked out what restarting does to the freshness guarantee for
the duration, which is minutes, during which the router either falls over to another
replica (also lagged) or sends everything to the primary (which is the correct fallback, and
should be written down as the behaviour rather than discovered during the page).

**T1. Replication is asynchronous, one replica, and monitoring shows a five-minute average
lag of 35ms. A user reports their last edit was lost. What is the minimum explanation
consistent with all of this?** `ADVANCED`

The average is the tell. A five-minute mean of 35ms is compatible with a distribution whose
median is 20ms and whose p99 is 30 seconds — a replica perfectly caught up except for a
three-minute window each hour when the checkpoint or `VACUUM` runs. Fifty-seven minutes of
0.02s dominates the mean over 300 seconds, so the dashboard is not lying; it is measuring
the wrong statistic for this failure mode. That alone explains the gap between the panel and
the user.

The minimum mechanism: the write committed to the primary at `t=0`; the read was routed to
the replica at `t=400ms`, inside the lag window; the replica returned the pre-edit value.
Nothing else needs to be true — no failover, no bug, no replication stop. Just an average
that cannot see a tail.

The follow-up an interviewer will press with is "and what else could it be", and the honest
list is short. The read may have hit a *different* replica than the one the write path
tracks, if there are several and no sticky routing. A cache in front may be serving a stale
entry whose TTL outlives the change. Or the load balancer may be routing writes to a
primary and reads to a node that is a synchronous standby of a different primary entirely —
a failover that left traffic split. One diagnostic separates all four: ask whether the
support engineer can reproduce it by replaying the request against the primary directly. If
the primary returns the correct value, the write is fine and the fault is on the read path,
and the three candidates — replica, cache, wrong node — separate by disabling each in turn.

**P2. After a failover, the application works for about 40 seconds and then a flood of
duplicate-key errors arrives on an idempotent `INSERT`. No, the retry logic was not removed.
Explain.** `ADVANCED`

The retry logic is intact and that is the problem — the error is not a failure of the write,
it is a failure of the *read-your-writes guarantee* that the retry was written to preserve.
Picture what failover does to an idempotent insert. The client submits
`INSERT INTO payments (...)`; the connection to the old primary dies at an ambiguous moment
— the statement may have committed, may not have, and the client cannot tell. The retry
logic correctly resubmits. If the new primary has the row, the retry raises a duplicate-key
error. That is the expected, correct behaviour of a correct retry against a system that has
a genuine ambiguity — and it means the failure window is exactly the failover window, which
is why it clusters 40 seconds after promotion.

The 40 seconds specifically is worth explaining because it is not the replication lag, it is
the recovery path: the new primary must finish replaying the old primary's WAL before it can
be promoted, then the old primary — which is now a replica and may still have clients
connected — is fenced, and clients reconnect. During the reconnection, in-flight requests
from the old primary are re-established against the new one, and any request whose commit
status was unknown at the moment of the crash retries. So the errors are concentrated in the
reconnect burst, not spread over the promotion.

The correct answer has two parts, and the second is the staff part. First, **the retry must
be read-then-write, not blind write**: on a duplicate-key error for an idempotency key the
client already holds, re-read by that key and treat the existing row as success. A retry
that only writes cannot distinguish "already done" from "someone else did it wrongly", and
conflating them means either duplicate data or spurious errors. Second, **the failover needs a
fencing story for in-flight writes on the old primary** — either the old primary is
guaranteed read-only after promotion, or writes on it are rejected by a lease, because a
client that successfully commits to a demoted old primary has created a row that exists
nowhere else and will be silently lost on the next reconciliation. That is the correctness
bug hiding inside a duplicate-key error, and it is the thing to raise.

**T2. Replication is asynchronous, lag is normally 20ms, and spikes to 30 seconds during a
bulk import. A user creates an order and immediately sees the order list empty. Then, 30
seconds later, the order appears. What is the read-routing fix, and why does the obvious
one not fully work?** `ADVANCED`

The bug is a read-after-write violation: the write went to the primary, the read was routed
to a replica, and the replica did not have the row yet. Chapter 7's tools apply — sticky
routing by session, or a read-your-writes marker on the connection that pins subsequent reads
to the primary for a window.

The obvious fix — "always read the user's own data from the primary" — does not fully work,
and the reason is instructive. It removes the violation for the user's own list, but it
concentrates the entire read-your-own-data traffic on the primary, so the primary is now
carrying the write load plus every user-visible read, and it does not fix the *related*
violations: the order confirmation page reads a joined view (order + customer + payment
status) and if any part of that is served by a replica the same race exists in another
place. So per-query judgement about "is this user-visible" is a losing game, because the
question is not about the query, it is about the *sequence*: read-after-write is a property
of the session's history, not of any single statement.

The correct fix is session-scoped. The connection records the primary's LSN at the moment of
the successful write; subsequent reads carry `min_applied_lsn`, and a replica whose applied
position has not reached it is not eligible — the router picks another replica or the
primary. This is sticky-by-LSN rather than sticky-by-timer, and it degrades to the primary
only for the milliseconds it actually takes for the replica to catch up, so the primary load
is proportional to real lag rather than to a guess at a safe window. During a 30-second lag
spike, that means those sessions read from the primary for up to 30 seconds — which is
correct and which you should expect, and the reason the fix has a cost you must plan for
rather than a cost of zero.

The staff-level point is that the bulk import is the actual bug. A 30-second lag spike from
a bulk import is avoidable, and the standard mitigations are: chunk the import so it does not
saturate WAL, throttle it to a fraction of the replica's apply capacity, and — best —
replicate the import rather than the rows, so the replicas apply the same batch. Once you
have built read-your-writes correctly, lag spikes are a performance problem; before you
have, they are a correctness problem, and the second is much more urgent to fix.

**S2. Review this connection-routing config. It looks like it fixes read-after-write, and
it does not.** `TRICKY`

```yaml
read_routing:
  mode: round_robin_replicas
  read_your_writes:
    enabled: true
    window: 30s
```

The intent is right; the mechanism has two problems. **The window is a guess, and a guess
that is wrong in the safe direction is fine, wrong in the unsafe direction is a bug.**
Thirty seconds was chosen because normal lag is 20ms, so it is 1,500x the expected value —
which is defensible as a conservative default and indefensible as a *correctness*
mechanism, because during the import spike described above, 30 seconds of lag is exceeded and
any write older than the window reads from a replica that still lacks it. The value is not a
guarantee; it is a probability, and the only mechanism that is a guarantee is the LSN
comparison, because it asks the replica where it actually is rather than asking the clock
how long ago the write happened.

The second problem is that `mode: round_robin_replicas` is at odds with
`read_your_writes` in a way the config does not express. Round-robin means the router has no
way to prefer a replica that has caught up — it just picks the next one in the list, so
within a single session two consecutive reads can hit replicas at wildly different applied
positions. That violates **monotonic reads**, which is the weaker and separate guarantee that
a user should not see their list *shrink* between page loads. A round-robin pool and a
read-your-writes window together produce the worst combination: each read individually
satisfies the 30-second check, and the pair of them together shows the user a
non-monotonic sequence.

What I would ask for in review: replace the timer with a per-connection minimum applied
position, and replace round-robin with least-replication-lag or a small set of "known
lagging" replicas that new sessions avoid. And add a metric for the fallback rate — the
fraction of reads that went to the primary because no replica had caught up — because a
silent increase in that number during an incident is the earliest signal that replicas have
stopped keeping up, long before user-visible staleness.

**D17. You are migrating from one primary with two asynchronous replicas to a
five-node topology with synchronous replication to two of them and asynchronous to three.
Walk me through what breaks in the application, not the database.** `STAFF`

The database change is straightforward — configure `synchronous_standby_names` for two nodes
and the rest follow asynchronously. What breaks is everything the application assumed about
latency, and it is worth being specific because the failure is not a crash, it is a
degradation.

First, **write latency now depends on a quorum.** Every write on the primary waits for two
replicas to acknowledge, so write latency is at least the slowest of the two, round-tripped.
Under normal conditions that is a few milliseconds and invisible. Under a degraded condition
— one replica gone, or its disk slow, or its network congested — the write latency becomes
that node's latency, and a single slow node now degrades every write on the system. That is
the Chapter 7 availability cost, and it manifests as a latency problem long before it
manifests as an availability problem. So the application needs a write timeout that is
shorter than the user-facing timeout, and it needs to distinguish "the write did not happen"
from "we do not know" — an unknown outcome is retryable, a definite failure is not.

Second, **when the second synchronous replica goes down, writes stop** if the configuration
requires exactly two. `ANY 2 (r1, r2)` requires two of them; `FIRST 2` takes the first two
that respond. The choice is deliberate: `ANY 2` is a quorum guarantee and will block;
`FIRST 1` would not be synchronous at all. So the operational requirement is that the
application's availability now depends on the *quorum* being available, which means the
deployment needs a documented degradation path — and that is a change-management
conversation, not a database one.

Third, and this is the piece most candidates miss: **the application needs to know which
failures are safe to retry.** Under synchronous replication with `ANY 2`, a client that
loses its connection mid-commit does not know whether the commit succeeded, exactly as in
the failover case above — and now that ambiguity exists on *every* network blip rather than
only during failover. So the idempotency-key discipline, which is usually introduced as a
response to duplicate-key errors, becomes a prerequisite for the topology. That is the
dependency the reviewer needs to hear: the synchronous-replication change and the
idempotency work are the same project.

Fourth, **read routing has more targets and worse consistency.** Three asynchronous replicas
means a much wider spread of staleness, so the read-your-writes mechanism from Chapter 7 is
no longer optional tuning — it is load-bearing, and the "two replicas have applied your
LSN" test gets harder as replica count grows because a third replica may be arbitrarily far
behind. And the application needs a per-read decision now, not a per-connection one, for the
strongest read paths.

The staff-level close: the question behind the question is whether this topology is buying
durability or availability, because it is buying durability at the cost of availability.
An alternative that gets the durability without the coupling is synchronous replication to
one remote node for the archive, with local replicas asynchronous — RPO 0 for catastrophic
site loss, RPO of milliseconds for a node loss, and no write path coupled to a second node's
health. Naming that trade explicitly, and asking which failure they are actually protecting
against, is the answer that shows staff-level judgement rather than pattern recall.

### Pooling & Connection Limits

**D18. We have 40 services on one PostgreSQL primary, 25 instances each, every service
setting `maximumPoolSize: 20` because that is the framework default everyone copied. p99 is
4 seconds, DB CPU is at 70%. What is happening and what do you change, in order?** `STAFF`

The arithmetic reframes it: 40 × 25 × 20 = **20,000 potential connections** against a
`max_connections` that is almost certainly a few hundred. So either most are never
concurrent, in which case the pool is not the problem and the p99 is, or a large fraction
*are* concurrent, in which case the server should be refusing connections — and the fact
that it is not tells me `max_connections` has been raised, probably to 1,000 or 2,000, and
that is the root cause.

The mechanism: 1,000 application instances each able to run 20 queries means hundreds of
concurrent backends on a machine sized for dozens. Each backend costs memory even when
idle, so the shared buffer pool shrinks; the run queue exceeds the core count; lock-manager
partitions start to spinning. p50 survives because fast queries stay fast; p99 is 4 seconds
because slow queries queue behind 500 other processes. And the feedback loop is what makes
it dangerous — slower queries hold connections longer, so more pool slots are busy, so
effective concurrency rises further. **The database at 70% CPU is not idle; it is 70% of a
much larger and much less efficient workload than it used to process.**

What I would change, in order. **One, stop the bleeding:** bring `max_connections` back to
a number the machine's memory supports — roughly 20MB of working memory per backend plus
the shared pool, so a 64GB instance with a 32GB shared pool supports about 1,200 and no
more — and set a per-role `statement_timeout` so a slow query cannot occupy a slot for
minutes. **Two, put PgBouncer in transaction mode in front**, with the total pool sized
across all services at about 2× `max_connections` rather than 20 per instance. That single
change turns 20,000 virtual sessions into ~1,200 real backends and is usually the entire
fix. **Three, re-derive the pool sizes with Little's Law against real p99 latency** — at
2,000 qps and a healthy 15ms p99, tens of connections per service across the fleet, not 20
per instance. **Four, only then, find out why p99 was 4 seconds**, because the pool change
improves the symptom and the slow query is still there.

The part that is not a runbook item: **the sum across services is the number that matters,
and it needs a policy.** A framework default copied into forty repositories is forty
independent decisions nobody made. That needs a per-service connection budget summing to
under 80% of `max_connections`, enforced in CI, and reviewed when a service is added — an
organisational fix for a technical problem, and the part a staff engineer is actually being
asked for.

**D19. A team wants to raise `max_connections` to 5,000 to survive a traffic spike. Give me
the argument against and tell me what you would propose instead.** `STAFF`

The argument is not that 5,000 is a large number — it is that raising the limit makes the
spike *worse*, which is the part of the proposal the team has not considered. A connection
is not a free waiter; it is a backend process with a memory floor and a share of the
machine. Five thousand of them on a 64GB instance with a 32GB shared buffer pool commits
32GB to connection state before a single query runs, so the buffer pool halves, cache hit
rates fall, and every query including the healthy ones slows. The run queue goes from tens
to thousands, context switching dominates, and lock-manager contention appears — which
slows queries not competing for I/O at all. The spike is converted from a throughput
problem into a latency problem across the whole system, including the requests that were
succeeding.

Recovery is worse than onset. A latency spike that ends leaves 5,000 connections active
with queries in flight, holding locks, producing WAL, competing for the same CPU; getting
back to normal is not "when traffic subsides" but after the queue drains — minutes of
degraded service *after* the traffic has normalised. That is the pathology that makes
connection storms so much worse than traffic storms: **the system keeps being damaged
after the cause is removed.**

What I would propose, in order. **A connection pooler first** — PgBouncer in transaction
mode turns 20,000 nominal sessions into ~1,200 real backends and makes the spike a queue in
the application, where a queue belongs, because it is bounded, observable, and can shed load
deliberately. **A deliberate queue with fast rejection** — a short acquisition timeout and
a load-shedding policy, with reporting and exports on their own small pools so a Finance
query cannot consume checkout's capacity. That is what actually survives a spike, and it is
a design change rather than a tuning change. **Rate limiting at the edge**, so the spike
never reaches the pool. **And only then, find the latency** — because a spike that produces
4-second p99 usually does so by degrading one class of query under concurrency, and a plan
that flips when statistics change with a much larger sample, a lock convoy on a hot row, or
a vacuum that cannot keep up are all invisible at low load and all unaffected by more
connections.

The last thing I would say: `max_connections` is a *memory budget*. The reason 100 is a
common default is not that 100 is magic but that it forces the pooler conversation to
happen before the incident rather than after it. We would be spending that safety margin
on our own convenience, converting a future, bounded, obvious outage into a present,
unbounded, subtle one.

**T1. A service's pool is exhausted. `pg_stat_activity` shows 12 `active`, 380 `idle`, and
one `idle in transaction` with a `state_age` of 47 minutes. Database CPU is 15%. What is
going on?** `ADVANCED`

The 47-minute `idle in transaction` is a genuine and serious bug, but it does not explain
the exhaustion — which is the insight this question is testing. An `idle in transaction`
connection holds a snapshot, and more importantly has created tuple versions: any row it
updated or deleted has an `xmax` pointing at it, so VACUUM cannot remove any of those until
it ends. It also holds every lock it took. A 47-minute-old one is a leaked transaction — an
exception path that did not roll back, a `LISTEN` loop, or a request thread blocked on
something non-database while holding the transaction open, and a remote HTTP call inside a
transaction is the classic.

But 12 active and 380 idle means connections are *available*. So the pool is not exhausted
database-side at all; the failure is in application-side pool accounting. The candidates:
connections opened outside the pool (a leak), the pool's own internal limit being hit while
the database has hundreds free, or — the one I would bet on in a framework — a **query that
holds a connection while doing non-database work**, so the connection is `idle in
transaction` from the database's point of view for the entire duration. If there are only
twelve of those, the *threads* are exhausted, not the pool.

So the answer is: there are two problems and the team is looking at one. The leaked
transaction is real, is blocking VACUUM on whatever it touched 47 minutes ago — meaning
bloat is accumulating right now on a hot table — and is fixed by
`idle_in_transaction_session_timeout` plus finding the code path that does not close. The
pool exhaustion is a separate diagnosis, and the diagnostic is the application-side metrics:
`active`, `idle`, `pending`, and *acquisition wait time*. High `pending` with 380 idle
connections database-side means the pool is not handing them out, and that is almost always
a leak or a framework bug rather than the database.

**P1. After a traffic spike, the database is fine but the application is dead: thread pool
exhausted, 4,000 requests queued, all of them waiting to check out a connection from a
pool of 20. Give me the diagnosis and the fix, and say what number you would set the pool
to.** `STAFF`

The diagnosis is that the pool is *too small for the offered concurrency*, and the symptom
is counterintuitive enough to be worth naming: the queue is not in the database, it is in
the application. 20 connections are all busy, 4,000 threads are waiting to check out, and
each waiting thread holds memory and a stack while contributing nothing. The throughput
cannot exceed what 20 connections can do in flight, so the extra 3,980 threads add latency
and memory pressure and buy exactly zero additional queries per second. Worse, the waiting
threads are what will time out and produce user-visible errors, so a *larger* pool would
make the incident worse, not better — which is the point to make before anyone reaches for
`maxPoolSize = 500`.

Little's Law gives the fix and the number. `L = λ × W` where `L` is connections in flight,
`λ` is the arrival rate of queries, and `W` is the time each one holds a connection. Take the
observed `W` of 25ms and the target `λ` of 2,000 queries/second: `L = 2000 × 0.025 = 50`. So
roughly 50 connections saturate the database — 60 to be safe against variance in `W`. Below
that the pool is the bottleneck; above it the extra connections buy nothing and cost
contention on `work_mem` allocations, lock-table entries, and buffer-pool locality. The
critically important caveat is that the `W` you must use is the **database-side** time, not
the client-side round trip, because a connection held for 25ms of which 22ms is the network
is not 25ms of database work — and a 2ms database that the network makes 40ms will be sized
wrong by a factor of twenty if you measure it from the application.

The fix is three-part. **Size the pool from Little's Law**, at database time, with headroom
— and monitor `W` so the number is re-derived when query mix changes. **Bound the application
thread pool to match**, so that requests queue at the edge (where they can shed load) rather
than deep in the request path (where they consume memory). **Add timeouts so waiting is
visible**: a connection-acquisition timeout turns an unbounded queue into a fast failure,
which lets a load balancer shed traffic and keeps the system responsive under load rather
than merely slow.

The staff-level observation is that pool exhaustion is nearly always a *query* problem
reported as a *pool* problem. A connection held for 25ms instead of 2ms is a query doing
something expensive, and the pool sized to that number is a pool sized to a bug. So the real
conversation is: what query changed, and did we size the pool to a symptom that will be gone
by Friday? The other staff point is that a pool is a *queue with an admission policy*, and
the admission policy is a load-shedding decision — which belongs at the edge, visible, and
rate-limited by the caller, rather than as a 4,000-deep memory-hungry queue inside the app.

**T2. A pool of 20 connections serves 40 application threads. Two threads block on
`pg_sleep(30)`. What happens to throughput, and what would you change?** `TRICKY`

Throughput collapses toward 18 queries in flight. With 20 connections and two of them held
for 30 seconds, 18 remain for the other 38 threads, so the effective concurrency has been
cut by 10% while the queue has grown by 100%. This is the blocking-query failure mode, and
it is worse than the arithmetic suggests: `pg_sleep` is a trivial query that consumes one
slot for 30 seconds while doing no work, so the connections are wasted rather than
merely busy.

Little's Law states the number precisely. If the intended load is `λ = 800 queries/second`
and each should hold a connection for 3ms, then `L = 800 × 0.003 = 2.4` — the whole workload
needs about three connections. Two of the twenty are gone to a sleep, which is a 40% loss of
capacity, and the 38 threads now queue behind 18 connections. Meanwhile the pool looks
correctly configured, which is what makes this hard to spot: `maxPoolSize` is 20 and nothing
is above it.

What to change, in order. **Remove the blocking call** — `pg_sleep` in application code is a
bug, and if it represents a call to an external service, that call does not belong inside a
database transaction or a checked-out connection at all. Move it to an async worker so the
request thread is released immediately; this is the actual fix and it is a code change, not
a configuration change. **`statement_timeout` and `idle_in_transaction_session_timeout`** so
the next occurrence is a bounded error rather than a 30-second slot loss, and so an idle
transaction cannot pin a connection indefinitely. **Size the pool to the real `W`**, which
after removing the sleep is ~3ms, meaning a pool of 20 is already generous — which is the
satisfying conclusion, because the pool was never the problem.

The staff point is the generalisation: **a pool must be sized for the median, and defended
against the tail.** Two pathological queries is enough to halve a small pool's capacity, so
the operational requirement is not a bigger pool but a guarantee that no single query can
hold a connection for an unbounded time. That guarantee is `statement_timeout` at the
database and a query timeout at the client, and both belong in the review of any pool-size
discussion, because a pool sized to survive the tail is a pool sized far too large for the
median.

**S1. Review this pool configuration for a Spring Boot service. Three of these four values
are wrong, and the fourth is the one that will page you.** `ADVANCED`

```yaml
spring:
  datasource:
    hikaricp:
      maximum-pool-size: 500
      minimum-idle: 20
      connection-timeout: 60000
      max-lifetime: 1800000
```

**`maximum-pool-size: 500`** is the headline error and the one from the trap in Chapter 8:
500 connections against a `max_connections` of 200 means the pool's *maximum* exceeds the
database's, so the failure mode is not "the app is busy" but "the app has opened every
connection on the server and is now being refused", and 500 threads waiting in the
application for a connection that will never be granted. The second-order cost is that at
500 connections, `work_mem` is multiplied 2.5x against the same memory budget, so a query
that was comfortably inside `work_mem` now spills to disk, and query latency rises on a
machine that is not under any load. Size it with Little's Law.

**`minimum-idle: 20`** against 500 is a warm-pool mismatch, and it means the pool keeps 20
connections permanently open and lets the other 480 grow on demand — which is fine, but it
also means the pool never shrinks its idle set back, and if 20 is a real requirement then
the maximum is being set by something other than measurement. Pick them together, and let
the idle floor be the number you are confident you always need.

**`connection-timeout: 60000`** is 60 seconds, and that is a page rather than a parameter.
A request that waits a minute for a connection has already exceeded every sane user-facing
timeout upstream, so it is not failing fast, it is failing slowly and consuming a thread the
whole time. This should be in the low thousands of milliseconds, so contention surfaces as
an error the circuit breaker and the load balancer can see.

**`max-lifetime: 1800000`** is the one that is technically fine and operationally
load-bearing, and it is the one to leave alone with a comment. It is slightly below the
typical 30-minute connection lifetime imposed by an intermediate load balancer or a cloud
proxy, which is the correct relationship — the client retires the connection slightly before
the infrastructure does, so the pool never hands out a connection that is about to be killed
silently underneath it. The subtle failure of getting this wrong is not an error message; it
is a periodic spike in "connection reset" errors every 30 minutes that correlates with
traffic and looks like a load problem. So the review note is: keep it, document *why* it is
set below the proxy lifetime, and set it with jitter so 20 connections do not all expire in
the same second — that synchronised expiry is the one way this setting can itself cause a
brief stall.

**D20. A service has 12 application instances, each with a pool of 20, against one primary
that allows `max_connections = 200`. Load test at 2x expected peak. What breaks first, and
what is the number that decides the architecture?** `STAFF`

The arithmetic breaks first, and it is worth doing out loud because the number is not the one
people expect. 12 × 20 = 240 connections demanded against a server limit of 200, so **the
service cannot even reach steady state** — at peak, 40 of those connections are refused, and
because the pool treats a refusal as a hard error rather than a throttle, those requests
fail rather than queue. This is the case that makes the "pool per instance" model untenable
without a shared pooler, and it is a configuration problem today, before any load.

Under load, the second thing to break is memory. 240 connections each holding a
`work_mem` allocation means 240 concurrent sort/hash buffers where the machine was budgeted
for 200, and at `work_mem = 64MB` that is a few gigabytes of spill on a database sized for
200 connections. So the *latency* degrades on the server while the application is waiting on
the pool — meaning the Little's Law calculation inverts: `W` rises, so `L` for the same `λ`
rises, so the application wants *more* connections to sustain the same throughput, so it
opens more. That positive feedback loop is the actual failure mode, and it ends in
connection-refused errors under a load spike that the machine could otherwise have served.
The third thing to break is the observability, because per-instance pools mean the aggregate
is invisible in any single pool's metrics.

The number that decides the architecture is the ratio of **total pooled connections to
`max_connections`**, and it should be well under 1 — say 0.6 to 0.7 — because you want
headroom for the replication tooling, the monitoring, the migrations, and the human with
`psql` who needs to get in during an incident. Here it is 1.2, so you are over budget before
the test starts. The second number is the per-instance pool size implied by Little's Law:
if the service needs 60 connections in flight at peak and there are 12 instances, each gets
5. The fact that it is configured for 20 each — 4x the requirement — is the diagnosis, and it
is the same mistake as the 500 in the trap, just at a scale where it does not page you.

The architectural consequence, stated as the recommendation: with more than a handful of
instances, put **PgBouncer in transaction pooling mode** between the service and the primary
(Chapter 8). Then the application's pools can be generous about *concurrency* while the
server sees only a small number of actual server connections, because the server connection
is held for the transaction rather than for the session. The one hard constraint to state
alongside it — because getting it wrong means the PgBouncer win is illusory — is that
transaction pooling is incompatible with session state: `SET`, `LISTEN/NOTIFY`, session-level
advisory locks, and multi-statement transactions that rely on the same connection must be
excluded, or you get failures that look like data corruption rather than routing. And the
staff-level addition: the number to put in a design document is not "how big is the pool" but
"what is our total connection budget, split how", because the pool size is a consequence of
that budget and a distributed system with per-instance pools has no single number to govern.

### Rollout, Reversibility & the Schema Migration

The reason this subsection exists as its own: every other topic in this bank has an
operational steady state, but a *change* to schema, partitioning, or topology has a
transition, and the transition is where the incidents live. These are the questions where the
differentiator is whether you treat a schema change as a migration with a rollback or as a
`CREATE INDEX CONCURRENTLY` you run on a Friday.

**P1. You must add a `NOT NULL` column with no default to a 900-million-row table that takes
40,000 writes/second. Give me the sequence of steps and say what each one costs.** `ADVANCED`

The sequence, and the reason for the order. **Add the column as nullable** — a metadata-only
change in PostgreSQL, taking a brief `ACCESS EXCLUSIVE` lock and rewriting nothing. Cost:
milliseconds of lock time, and a table where the new column is null for every row. **Add a
`CHECK (col IS NOT NULL) NOT VALID`** — this validates existing rows lazily, takes only a
brief lock, and is enforced for all *new* and *updated* rows immediately. Cost: milliseconds.
This is the step people skip, and it is the step that makes the migration safe, because it
closes the door on new violations while the backfill is still running. **Backfill in batches**
— a few thousand rows per transaction with a `WHERE col IS NULL` predicate, a short
`statement_timeout`, and a pause tuned so the table is not saturated. Cost: hours of
background I/O, and this is the number to reason about — 900 million rows at a batch rate
that keeps the table's write latency under, say, 10% of baseline might take a day, and the
constraint is the *write* path, not the read throughput. A migration that completes in an
hour by going full-speed will cost you 40,000 writes/second of latency, which is the whole
budget. **Validate the constraint** with `VALIDATE CONSTRAINT`, which scans without the
long lock. **Set `NOT NULL`**, which in modern PostgreSQL is a metadata-only change because
the validated `CHECK` is the proof. Cost: milliseconds.

The critical safety properties: at every point a failure leaves the system working, because
each step is independently reversible (drop the constraint, drop the column, both are fast);
no step holds a lock that blocks writes for longer than the lock-acquisition timeout; and no
step is a rewrite, so there is never a 900-million-row copy. What makes this hard in practice
is that step 3 will take a day and therefore spans deploys, so the process needs to tolerate
"the migration is half done" as a normal state — which means the code that reads the column
must be deployed in a version that tolerates nulls, and the migration must be resumable
(`WHERE col IS NULL` makes it idempotent and restartable).

**T1. `CREATE INDEX CONCURRENTLY` on a 400-million-row table. What does it actually do,
what can go wrong, and why is it invalid to run two at once?** `ADVANCED`

It builds a second, complete B+ tree alongside the existing one, and then — this is the part
people are surprised by — it takes a brief `SHARE UPDATE EXCLUSIVE` lock at the start and a
brief one at the end, but **does not block writes in between**. The build itself takes two
table passes: one to collect the live tuples in sorted order, one to insert them. So it
consumes I/O and CPU for the duration of a full index build, on a table receiving 40,000
writes/second, and the writes continue throughout — which is the point, and also the cost.
The new index is populated with the *snapshot* the build started from, so anything written
after that point has to be picked up in the second pass, and that second pass is where it
can go wrong.

Two failure modes to name. **`CREATE INDEX CONCURRENTLY` can fail and leave an `INVALID`
index.** The index is created but marked invalid, meaning the planner will not use it and it
is still consuming disk and write overhead on every subsequent insert. Recovery is
`DROP INDEX` and retry, or `REINDEX CONCURRENTLY`; leaving invalid indexes around is a common
slow leak, and a monitoring query on `pg_index.indisvalid = false` is worth having. And
**it fails if the table is written in a way that makes concurrent building impossible** —
a failure to uniquely identify a row during the build produces "could not find unique
existence check" and the same invalid-index residue.

The "only one at a time" constraint is because the build holds a slot in the relation's
`CREATE INDEX` queue, and a second concurrent build on the same table either waits or fails;
in practice `CREATE INDEX CONCURRENTLY` on two tables simultaneously is the risk, because
both take the same global "one CIC per table" bookkeeping and the classic error is running
several at once on different tables and saturating I/O so badly that none of them finish
before the maintenance window ends. The discipline is: one at a time, scheduled, with a
cancel-and-retry story, and always `DROP` the invalid residue on failure.

**S1. Review this migration plan. It has two ordering bugs and one missing safety step.** `ADVANCED`

```sql
-- Step 1
CREATE INDEX CONCURRENTLY idx_orders_customer_created
  ON orders (customer_id, created_at DESC);
-- Step 2
ALTER TABLE orders ALTER COLUMN status SET NOT NULL;
-- Step 3
BEGIN;
UPDATE orders SET status = 'unknown' WHERE status IS NULL;
COMMIT;
-- Step 4
CREATE INDEX CONCURRENTLY idx_orders_status ON orders (status);
```

**Step 2 is the first ordering bug.** `SET NOT NULL` on a column with existing nulls fails
immediately — and worse, in a database where a previous operation left the constraint
unvalidated, it may not fail at all but succeed on a table the planner will then treat as
trustworthy. The correct order is step 3 before step 2, and the correct version of step 2 is
`ADD CONSTRAINT ... CHECK (status IS NOT NULL) NOT VALID` → backfill → `VALIDATE CONSTRAINT`
→ `SET NOT NULL`, which is the P9 sequence. As written, step 3's backfill is unreachable
because step 2 would have stopped the migration.

**Step 4 is the second ordering bug, in the opposite direction:** it creates a single-column
index on `status` when a 400-million-row table with a low-cardinality `status` is exactly
the case where the index has to be built before the `NOT NULL` is enforced, because the
`SET NOT NULL` scan and the index build both need I/O and running them together doubles the
impact on writes. It is also questionable on its merits — a low-cardinality `status` index
is usually only useful in combination, so the index the query needs is probably
`(customer_id, status)` or a partial index on `status = 'open'`, and building a full index
on a five-value column is a lot of I/O for a plan that will rarely choose it.

**The missing safety step is that there is no verification and no rollback.** Nothing here
checks that step 1's index is `indisvalid`, that step 3's backfill actually reached zero
rows, or that the `SET NOT NULL` in step 2 did not fail after step 3. A migration plan
should read as a sequence of independently-verifiable steps: check `pg_index.indisvalid`
after each `CONCURRENTLY` build, check `SELECT count(*) WHERE status IS NULL` returns 0
after the backfill, and — the rollback question — know that dropping the index is instant
but that step 3's committed data change is not reversible without a second update. Writing
`updated_at = now()` into step 3 is often worth it for exactly that reason: it makes the
backfill detectable and correctable rather than anonymous.

**D21. You are moving 1.2 billion rows from an unpartitioned table to a partitioned one,
with 40,000 writes/second arriving throughout. Describe the migration, and tell me how you
know when it is safe to cut over.** `STAFF`

The migration is a **dual-write with a verify-then-flip**, and the first decision is the
one that makes the rest safe: the new table must exist alongside the old one, and every
write must go to both. In practice that means changing the application (or a trigger) to
write to both, and it means accepting, for the duration, that every write is paid for
twice. The alternative — a bulk `INSERT ... SELECT` followed by a catch-up delta — has a
window at the end where you compute a delta by timestamp, and timestamps are not a reliable
high-water mark for a table with concurrent transactions committing out of order. So
dual-write, and the migration's length is the length of the copy, not the length of the
delta.

The copy itself: `INSERT INTO orders_new SELECT * FROM orders` in batches by primary key
range, sized so each batch takes under a second, with a pause tuned to the write path —
the same Little's Law reasoning as the backfill in P9, because the copy is competing with
40,000 writes/second for the same I/O. 1.2 billion rows at a rate that keeps production
latency flat is a multi-day operation, and saying that honestly is part of the answer; a
migration plan that does not state its duration is a plan that will be interrupted.

Verification is the step that decides cutover, and "it finished" is not verification. Three
checks, in increasing strength. **Row counts** per partition and in total. **Checksums** —
a deterministic hash aggregate per key range, compared between old and new; this catches
truncation, type coercion, and column ordering mistakes that row counts cannot. **And a
time-bounded spot check**: pick 1,000 random primary keys, fetch from both tables, and
require byte-identical rows. That is what catches a bug where 0.01% of rows are wrong —
a wrong `NULL` handling, a timezone shift, a rounding difference in a `numeric` column — and
0.01% of 1.2 billion is 120,000 rows, which row counts and checksums on a moving target
will not reliably surface.

Cutover is then a single atomic action: stop the old writes, verify the last delta
(under dual-write this is bounded and small), rename `orders` to `orders_old` and
`orders_new` to `orders` inside a transaction, and only then drop the old table. The rename
is fast and atomic, so the cutover window is seconds. And the rollback is the rename
reversed, which is why the old table is kept for a defined period rather than dropped
immediately — the rollback must be cheap for as long as anyone might need it, and "we dropped
it an hour ago" converts a bad cutover into an outage.

The staff-level close is the thing I would raise unprompted: **this migration is not really
about the partitioned table, it is about the fact that the system has no verified way to
compare two copies of its own data.** Every large migration needs that, and building it
first — a reusable row-comparison tool with key-range sampling and checksum aggregation — is
cheaper than building it under pressure, and is reusable for the next migration, which there
will be.

**T2. You add a column as nullable, backfill it in batches, and then run
`ALTER TABLE ... SET NOT NULL` while the backfill job is still running. What happens, and
what is the correct ordering?** `ADVANCED`

The `SET NOT NULL` fails, and how it fails is the useful part. A modern PostgreSQL will
either scan the table to verify no nulls remain — taking a strong lock for the duration of a
900-million-row scan, which is the incident — or, if a validated `CHECK (col IS NOT NULL)`
already proves it, complete as a metadata-only change. Which one you get depends entirely
on whether the proof exists. In the sequence above it does not, so you get the scan, and the
strong lock is held for minutes while 40,000 writes/second queue behind it.

The correct ordering is the P9 sequence: add the `CHECK ... NOT VALID` first so new and
updated rows are constrained immediately, backfill until the count is zero, `VALIDATE
CONSTRAINT`, and only then `SET NOT NULL` — at which point the validated check is the proof
and the operation is a catalog update. The generalisable lesson is that **`NOT NULL` is not
one constraint, it is a conclusion, and the cheap way to reach the conclusion is to make
something else prove it.** The same reasoning applies to a `PRIMARY KEY` on a large table and
to a foreign key: let the already-validated supporting index and the `NOT VALID`/`VALIDATE`
pair do the verification, and the final DDL is metadata-only.

**S2. Review this runbook for adding an index to a hot production table. Which step is
wrong, and which step is missing?** `ADVANCED`

```bash
# 1. Confirm the index is valid
psql -c "SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid;"

# 2. Build it
psql -c "CREATE INDEX CONCURRENTLY idx_orders_merchant ON orders (merchant_id, created_at DESC);"

# 3. Confirm it was created
psql -c "SELECT count(*) FROM pg_indexes WHERE indexname = 'idx_orders_merchant';"

# 4. ANALYZE
psql -c "ANALYZE orders;"
```

**Step 3 is the wrong step**, and it is wrong in a way that hides a real failure. `count(*)`
returning 1 tells you a row exists in the catalog — and an *invalid* index from a failed
`CREATE INDEX CONCURRENTLY` also exists in the catalog. So the check passes on precisely the
failure it was written to detect, and the invalid index sits there consuming disk and
write-amplifying every insert, invisible to the planner. The check must be
`SELECT indisvalid, indisready FROM pg_index WHERE indexrelid = 'idx_orders_merchant'::regclass`,
or better, the inverse of step 1 run again: if `idx_orders_merchant` appears in the
`NOT indisvalid` list, the build failed and the index must be dropped before retrying.

**The missing step is the error handling.** A runbook with no `ON_ERROR_STOP` and no
failure branch is a runbook that reports success on failure — `psql -c` returns non-zero, but
a human reading terminal scrollback will not notice, and the next step (`ANALYZE`) runs
regardless. The missing discipline is: check the exit code, and on any error run the
`DROP INDEX` for the possibly-invalid residue before doing anything else. `DROP INDEX` on a
1.4-billion-row index is fast — it is a catalog operation — so the failure path is cheap,
and leaving it out means the retry starts on top of a broken index.

Two smaller things worth raising while in there. Step 2 has no `statement_timeout`, so a
build that has stalled on I/O can occupy the maintenance window indefinitely, and since CIC
takes a lock at the end to mark the index ready, a build that finishes right as the window
closes can block writes at the worst moment. And `ANALYZE orders` after a concurrent index
build is arguably unnecessary — the build's own second pass leaves the table's statistics
adequate for the new index, and the planner will re-estimate on first use — though it is
harmless. What is not harmless is running it during peak, since `ANALYZE` on a large table
samples and is cheap but not free.
