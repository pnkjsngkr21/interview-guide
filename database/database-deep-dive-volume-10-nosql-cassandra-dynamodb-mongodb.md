---
title: "The Database Complete Deep-Dive"
volume: 10
series: "NOSQL & DISTRIBUTED STORES"
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
it cost, when does it break, and how expensive is it to undo?"** Distributed stores are
usually introduced through a vendor's pitch — *"NoSQL gives you horizontal scale and no
schema migrations"* — and that pitch is exactly the surface this volume refuses. Cassandra's
`WHERE` clause, DynamoDB's WCU arithmetic, MongoDB's embedding rules and the LSM write
path are all treated as the visible surface of a consistency protocol, a partition-key
contract and a compaction policy, because that is the layer where the incidents live.

Volume 10 is the volume where the vocabulary goes wrong. CAP is repeated more often and
misstated more often in this field than anywhere else in the set, and a candidate who says
"we chose AP" without being able to say *which operation, and what happens when the network
is up* scores zero on the question that was being asked. The same is true of "eventually
consistent" (a model without a bound is not a specification), "schemaless" (you have
designed a key schema; you just wrote it in the client instead of in DDL), and "the
partition key" (which is a ceiling on throughput, on storage per node, and on the shape of
every query you will ever write).

The staff-level theme running through the volume is **what a distributed store trades away
on your behalf, and whether the trade was yours**. Every engine in this volume gives you
horizontal write scale by moving the hard problem from the schema into the partition key.
That is a genuinely good trade when the access patterns are known and stable, and it is a
trap when they are not — because a partition key cannot be changed later without rewriting
the data. The judgement being built here is not "which database is fastest" but "how do I
know the access patterns, and what happens to this system when I am wrong about them".

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto the
read-repair protocol produces filler. The template is a completeness checklist, not a
template to fill.

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

### Continuing From Volume 9

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL — InnoDB, the clustered index, the undo log, next-next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 (this book) | NoSQL & Distributed Stores — CAP precisely, consistency models, partitioning, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 10

- Chapter 1 — Why Relational Stores Stopped Being the Default
- Chapter 2 — The CAP Theorem, Precisely
- Chapter 3 — Consistency Models
- Chapter 4 — Partitioning & Data Distribution
- Chapter 5 — Cassandra: Architecture
- Chapter 6 — Cassandra: Data Modelling
- Chapter 7 — DynamoDB: Architecture & Data Model
- Chapter 8 — DynamoDB: Consistency, Capacity & Access Patterns
- Chapter 9 — MongoDB: Document Model & Aggregation
- Chapter 10 — Choosing a NoSQL Store
- Chapter 11 — Interview Scenario Bank

---

# Part 1 — Why Distributed Stores Exist

## Chapter 1 — Why Relational Stores Stopped Being the Default

### 1.1 The Answer Everybody Gives, and Why It Is Wrong

Every interview answer starts here: *"We moved to NoSQL because relational databases don't
scale."* It is the same class of answer as *"We use microservices because the monolith
doesn't scale."* It is not wrong — it is unspecific in exactly the way that hides the real
decision.

The useful decomposition is that "scale" is at least four different problems, and NoSQL
engines solve a different one in each case:

```text
  "IT DOESN'T SCALE" — WHICH SCALE?
  ─────────────────────────────────────

  1. WRITE THROUGHPUT per second
     A relational primary has one writer (a leader) and it is one process.
     Cassandra and DynamoDB spread writes across every node in the ring.
     → THIS is what key-value stores genuinely fixed.

  2. DATA VOLUME per machine
     A 10 TB table on a box with 64 GB of RAM means the working set does
     not fit. NoSQL does not fix this; it changes the shape of the problem
     (shard it, and let each shard be a normal database).

  3. READ THROUGHPUT / LATENCY at the 99th percentile
     Adding read replicas is a relational answer and usually a better one
     than changing database.

  4. DEVELOPER VELOCITY — "I want to store a JSON blob"
     This is a schema-design problem wearing a platform costume.
```

Almost every team that says "we need NoSQL" is answering problem 4 and is really
complaining about problem 3, and would be better served by an index and a read replica
than by a distributed store. The genuinely unsolvable-by-PostgreSQL case is problem 1:
write throughput that exceeds what one process can push, on a workload where the write is
a cheap key-value put and the data is never joined.

> **INTERVIEW TRAP — "WE NEED NOSQL BECAUSE RELATIONAL DOESN'T SCALE"**
>
> The expected senior answer is to break the claim into its parts rather than accept it.
> Write throughput, storage volume, read latency and developer velocity are four different
> problems with four different solutions, and only the first is genuinely solved by moving
> off a relational engine. A relational primary is a single writer by construction — one
> leader process, one WAL, one lock manager — and that is a hard architectural fact, not a
> tuning problem. But the claims that usually accompany it are false: adding nodes to a
> PostgreSQL cluster *does* increase read capacity (streaming replication, and read replicas
> you can route to), and a 10 TB table is a *storage* problem solved by partitioning, which
> Volume 6 owns, not by a different database.
>
> The follow-up that ends the conversation: **"what is your current write rate, and what is
> the per-write cost in the relational engine?"** A team writing 2,000 small transactions
> per second is well inside PostgreSQL's range, and the thing actually costing them is
> probably a missing index causing a sequential scan inside each write's `SELECT`, or
> `fsync` batching not being configured for their storage. The honest answer at that point
> is "we have not measured, and the migration is a year of work" — which is a completely
> different design review than "we need NoSQL".

### 1.2 The Four Costs That Are Real

Each of the four claims below is true sometimes. Each is also a *cost*, and the cost is
what a design review is actually arguing about.

**Cost 1 — schema rigidity, and the price of a migration on a hot table.** This is the
strongest of the four arguments and it is real, but it is narrower than it sounds. A
`ALTER TABLE ADD COLUMN` that is nullable with no default is fast in PostgreSQL and MySQL —
metadata-only, no rewrite. A migration that rewrites a 500 GB table while it is being
written to requires a shadow table, a backfill in batches, a dual-write window, and a
cutover, which is a project, and during it your application is running code that talks to
two shapes. The honest statement is: **adding a *column* is cheap, and changing the
*shape of an entity* is a project.** NoSQL does not remove the second cost; it moves it
into a place with no tooling, because a document store's "migration" is code you write
yourself, running over data you cannot take a lock on.

> **PRODUCTION RELEVANCE**
>
> The migration tax is not the `ALTER`. It is the *coordination tax*: the deploy that
> requires a backfill, the application version that must be compatible with both shapes, the
> question of what happens to rows written between the backfill and the constraint, and the
> rollback plan if the backfill is wrong. This is why the decision to move to a document or
> key-value store is usually made by a team trying to escape a *release-process* problem,
> and it does not work — the release process has to be re-invented in the new system, and
> the new system's version of the problem has fewer tools.

**Cost 2 — single-writer throughput.** A relational engine's write path is serialised
through one leader: one process, one WAL, one lock manager, one set of dirty pages. You can
scale that leader vertically, and you can make it very fast, and it is still one process
with one lock on its throughput ceiling. Distributing it means either a multi-leader design
with conflict resolution (which is a distributed-systems project with a long tail of
anomalies) or sharding the data by key so each shard has its own single writer — which is
exactly what a distributed store does internally, and exactly what you can also do
yourself at the application layer with a sharding middleware.

> **TRADE-OFF — "SHOULD WE SHARD POSTGRESQL OR MOVE TO CASSANDRA?"**
>
> Both approaches end up with a partition key and a cross-shard query problem; the
> difference is who owns the shard router and what the cross-shard query costs. Flipping
> condition: **how many distinct query patterns do you have, and how many of them are
> cross-shard?** Two or three, and you shard Postgres (Citus, or application-level routing
> with a `ShardingSphere`/ProxySQL layer) and keep joins. Fifteen patterns including
> "give me everything for this user across every entity type, sorted by date", and a
> document or wide-column store where each pattern gets its own table is cheaper, because
> the alternative is eight hand-written fan-out queries that you maintain forever.

**Cost 3 — operational cost of running a relational cluster well.** This is the most
underrated cost and the one nobody puts in the pitch deck. A relational engine in
production is not "a database". It is a replication setup, a failover procedure, a backup
and point-in-time-restore story, a connection pool with a real configuration, a vacuum or
a purge job, a statistics refresh, an extension strategy, a migration process, and an
on-call runbook for each of those. Every item is a recurring tax and several of them are
silent failure modes — stale statistics, a `WAL` archive that quietly stopped shipping, a
replica that has been `pg_is_in_recovery` for six months. A distributed store does not
remove this tax; it replaces it with a different set (compaction debt, repair windows,
partition-key audits, capacity modelling) and in exchange removes the single-writer ceiling
and the manual `VACUUM`.

**Cost 4 — write amplification at the storage layer.** This is the one that genuinely
changes shape. A B+ tree's write cost is a page write, and a page write is a random I/O
— the slowest thing a disk does. A log-structured store's write cost is a sequential
append plus an in-memory write, and sequential append is the fastest thing a disk does.
At a high enough write rate against a high-enough index count, that difference is the
whole argument. Chapter 5 is entirely about the machinery, and Volume 1 Chapter 1's WAL
discussion is the direct ancestor of the memtable.

### 1.3 Where the Argument Is Overstated

This section is the reason a senior candidate gets hired, and it is the part that almost
nobody writes down.

- **"We need a flexible schema."** Most teams that say this need a JSON column, a
  `jsonb` column with a GIN index, or one more nullable column. The actual requirement is
  usually "these four attributes are present on 3% of rows and we filter on one of them" —
  which is a partial index, not a document store.
- **"Our rows are getting wide."** Wide rows are a normalisation conversation, not a
  database-selection conversation. Volume 1 Chapter 5 and Volume 6 Chapter 2 own that.
- **"Relational joins are slow."** A join is slow because the planner misestimated, and it
  misestimated because statistics are stale or because the index is missing. Volume 4
  Chapter 7 is entirely about reading that gap. Migrating to a store that cannot join at
  all converts a five-minute index fix into a nine-month denormalisation programme with a
  permanent consistency problem attached.
- **"We need horizontal scale."** How much? A PostgreSQL primary with `synchronous_commit
  = off` and batched `fsync` handles thousands of small writes per second. If your target
  is 50,000 writes/second you have a real problem, and you should say the number out loud
  in the design review, because the number changes the answer.
- **"NoSQL is more modern."** It is a different set of trade-offs, most of which were made
  deliberately to buy write scale at the cost of query flexibility. Modern is not a
  property.

> **STAFF-LEVEL CONSIDERATION**
>
> The most expensive NoSQL migration is the one justified by a *production incident* that a
> simpler change would have fixed. When a team proposes a store change during an incident,
> the staff-level move is to ask for the number — request rate, p99, data volume, and the
> one query that is slow — and to propose the boring alternative explicitly, in writing,
> with a date. If the boring alternative is rejected, the record now contains a decision
> and a reason, and the migration can proceed with a shared understanding. If it is
> accepted, the migration never gets proposed again. This is worth more than any
> architectural argument, and it is the thing that is missing when the decision is made
> without it.

#### Common Mistakes

- Saying "relational doesn't scale" without a number — the number is the entire argument
- Treating a missing index, stale statistics or a sequential scan inside a write path as
  evidence that the database is the wrong database
- Believing `ALTER TABLE ADD COLUMN` is expensive on a multi-billion-row table — a nullable
  column with no default is metadata-only in both PostgreSQL and InnoDB
- Assuming a store change escapes the migration problem instead of relocating it into
  hand-written, untestable application code
- Ignoring operational cost when comparing a cluster you already know how to run against
  one you would be learning in production
- Failing to distinguish a read-scaling problem (replicas work) from a write-scaling
  problem (single writer does not)

#### Interview Questions — Why Distributed Stores Exist

**Q1. When would you move off a relational database, and how do you know?** `STAFF`

Only with a number. Write throughput per second on a table that is append-mostly and never
joined, at a data volume per node that a single box cannot hold a working set for, and
where the query patterns are known and stable. Those three together are the case where a
distributed store wins outright. The "how do you know" half matters more: I want the
current p99 write latency, the current throughput, the number of concurrent connections,
and the number of queries per write, because a write that costs a sequential scan is a bug
not a ceiling. And I want the boring answer on the table first — partitioning (Volume 6),
a read replica, batching, a covering index on the write's own `SELECT` — because those
routinely buy a factor of ten and cost a sprint.

**Q2. What does a document or key-value store actually cost you that a relational one
does not?** `TRICKY`

Four things, and they compound. (1) No general-purpose join, so any query spanning entity
types is either a denormalised copy you now maintain in several places, or a fan-out
scatter-gather whose latency is the sum of the shards. (2) The schema is not enforced, so a
malformed record is a runtime failure in someone else's code rather than a rejected write —
the "flexibility" is a validation burden relocated to the application. (3) Secondary
indexes are either local and fragile (Cassandra) or eventually consistent by definition
(DynamoDB GSIs), so a query you can write casually in SQL may be a schema migration in
these systems. (4) Your tooling is worse: no cross-table constraints, no ad-hoc `SELECT`
to debug an incident with, and a data fix is a program you write and run rather than a
transaction you open.

**Q3. A team wants Cassandra for their 30 GB Postgres database because "it will be faster".
What do you say?** `SCENARIO`

I ask which query is slow, and I would expect the answer to be one query rather than a
table, because at 30 GB the working set fits in RAM and PostgreSQL will serve it from the
buffer pool faster than any distributed store will serve it over the network. Then I ask
what their *write* rate is: if it is under a few thousand per second, the single-writer
ceiling is not their problem and Cassandra buys them write scale they do not need in
exchange for denormalising every access pattern, operating a ring, and taking on compaction
and tombstone debt. The one thing I would genuinely check is whether they have a
write-amplifying index pattern — a relational engine updating a row plus five index entries
plus a heap page per write is genuinely bad at high write rates, and that is the one case
where LSM wins. But it is fixed by fixing the indexes, and I would want to see the
`EXPLAIN` before agreeing to a migration that cannot be undone cheaply.

> **CHAPTER 1 SUMMARY**
>
> "Relational does not scale" is four claims wearing one coat, and only one of them —
> single-writer write throughput on an append-only, never-joined workload — is genuinely
> solved by moving off a relational engine. Schema rigidity is real but narrower than
> claimed (`ADD COLUMN` is metadata-only; changing an entity's *shape* is a project, in any
> store); read scale is solved by replicas; data volume is a partitioning problem; and
> "flexible schema" is usually a nullable column or a `jsonb` index. The engineering cost
> of a store change is not the migration — it is that you trade a well-tooled, well-
> documented, well-constrained system for one where every invariant, every index and every
> cross-entity query becomes application code you write, run, and maintain forever. Say the
> number out loud, put the boring alternative in writing, and make the decision on the
> measurement.

#### Further Reading

- [Dynamo — Amazon's Highly Available Key-value Store (SOSP 2007)](https://www.allthingsdistributed.com/2007/10/paper-dynamo-amazon-ssos07.html) — the paper that started the field, and the source of the "eventually consistent" and quorum vocabulary used ever since.
- [Apache Cassandra — Introduction](https://cassandra.apache.org/doc/latest/cassandra/architecture/intro.html) — the official architecture overview, and the shortest honest account of the LSM write path.
- [PostgreSQL — Populating a Database](https://www.postgresql.org/docs/current/sql-insert.html) and [ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — the official statement of which schema changes are cheap, for the "schema rigidity" claim.
- [DynamoDB Developer Guide — Data Modeling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html) — the official access-pattern-first framing, from the team that ships the service.

## Chapter 2 — The CAP Theorem, Precisely

### 2.1 What CAP Actually Claims

**The Microservices set's Volume 2, Chapter 1 owns CAP as an architecture question** — the
theorem as it applies to a whole system, PACELC as it governs service boundaries, and the
consistency spectrum as a design vocabulary. This chapter does not re-derive any of that.
This chapter asks the narrower, harder, database-level question: **what does a given engine
actually guarantee, per operation, and what does it do when the network is whole?**

The CAP theorem, from Gilbert and Lynch, is a statement about what a *distributed system*
can guarantee while a network partition is in progress. Its actual content is an
impossibility result: **during a partition, no system can simultaneously guarantee
linearizable consistency and total availability.** Three consequences follow, and all
three are routinely dropped:

1. **The claim is conditional on a partition.** Outside a partition, when the network is
   whole, a distributed system can offer both linearizable reads and full availability. The
   impossibility proof requires the partition to hold for its duration.
2. **Partition tolerance is not a choice.** A distributed system *will* experience
   partitions — partitions are not failures you decline to handle, they are the normal
   failure mode of a network. So the real decision is C or A, and it is only forced while
   the partition lasts.
3. **Consistency and availability are properties of an *operation*, not of a database.**
   This is the consequence almost everyone misses, and it is the whole chapter.

> **MUST REMEMBER**
>
> **CAP is a per-operation claim made during a partition.** A database is not "CP" or "AP".
> A particular read might be linearizable while a particular write is only eventually
> consistent, in the same table, in the same statement, on the same cluster — and most
> engines let you choose per query.

> **INTERVIEW TRAP — "IS YOUR DATABASE CP OR AP?"**
>
> The trap answer is a single label, because the question is malformed. The question is
> asking for a property the thing does not have. The right answer names the operation and
> the condition:
>
> - **"Which operation, and what do you do when the network is up?"** During a partition,
>   our order-status read is served from any replica and may be a few seconds stale, and our
>   payment write requires a quorum of three replicas, so it will *fail* on the minority
>   side rather than fork. So: the read is A, the write is C, and the label "our database is
>   AP" is useless because it describes neither of them.
> - The **second** thing worth saying is that most teams claiming AP are describing their
>   database's default. A single-writer primary with asynchronous replicas is **CP**, not
>   AP: partition the primary and writes fail. That is the wrong label on a real system,
>   and it is a daily misstatement.
> - The **third** is that CAP says nothing about the 99.99% of the time there is no
>   partition — which is why it is the least useful of the three letters for everyday
>   engineering, and why PACELC's else branch is the one that governs your database's
>   configuration.

### 2.2 The Partition Is a Given

This is worth a diagram because "P is not optional" is the part that flips a whole design
conversation once a candidate says it out loud.

```text
  YOUR SYSTEM, AS DRAWN IN THE DESIGN DOC
  ──────────────────────────────────────

      ┌────────┐        ┌────────┐
      │ App A  │───────▶│  DB    │◀───────│ App B  │
      └────────┘        └────────┘        └────────┘
                            │
                        (looks fine)

  YOUR SYSTEM, AS IT WILL ACTUALLY RUN
  ──────────────────────────────────────

      ┌────────┐   //   ┌────────┐   //   ┌────────┐
      │ App A  │       │ DB N1  │       │ App B  │
      └────────┘       └────────┘       └────────┘
                      ┌────────┐
                      │ DB N2  │     ← the partition. It is not a failure
                      └────────┘       you designed around. It is a Tuesday.

  The choice you now face, PER OPERATION:

      READ  ──▶ serve stale from N1/N2?  (A)  ── or ── (C) reject, risk unavailability
      WRITE ──▶ accept on both sides?    (A)  ── or ── (C) fail, keep a single truth

  Note the asymmetry that most "AP" claims hide:
  serving stale READS under partition is small and explicable.
  serving WRITES on both sides is split-brain, and the
  reconciliation is your problem, forever, with no rollback.
```

The most common real-world resolution is therefore a system that is *read*-available and
*write*-unavailable under partition. The reads are safe to serve stale; the writes are
not safe to accept twice. Calling that "AP" is a category error that hides a real and
sensible design.

### 2.3 PACELC — the Else Branch, and Why It Governs Your Database Configuration

**P**artition → choose **A**vailability or **C**onsistency. **E**lse → choose **L**atency
or **C**onsistency.

The word doing the work is `ELSE`. CAP describes a rare, dramatic moment that lasts
minutes. PACELC's else branch describes every request in the steady state, and the steady
state is where you configured your read consistency level, your cache TTL, your replica
routing, and your SLAs.

| Steady-state decision (the ELSE branch) | You chose latency | You chose consistency |
| --- | --- | --- |
| Cassandra read level | `ONE` (one replica, ~1 RTT) | `QUORUM` (2 of 3 at RF=3, more nodes) |
| DynamoDB read | eventually consistent (0.5 RCU per 4 KB) | strongly consistent (1 RCU per 4 KB, doubles it) |
| DynamoDB write | `Write` / batched | `TransactWriteItems` (2× cost, 4 MB, 100 items) |
| Replica vs primary reads | replica, possible staleness | primary, single writer, higher latency |
| Multi-region reads | regional endpoint, local data | home region, cross-region RTT |

Every one of those rows is a PACELC decision in the else branch, and every one of them is
made *before* the partition — at design time, by choosing a configuration value. That is
the practical argument for PACELC in a design review: **CAP is what happens to you, PACELC
is what you chose.**

### 2.4 What Engines Actually Guarantee

Now the database-level answer, which is what this volume exists for. The table below is
about *operations*, not about databases, and it is worth reading row by row.

| Operation | What a partition does | Typical engine behaviour |
| --- | --- | --- |
| Write to a single-node / single-primary relational DB | Primary is on the minority side | Write fails, returns an error. **C** |
| Read from a replica during that partition | Replica is stale but reachable | Read succeeds with old data. **A** |
| `QUORUM` write, RF=3, no partition | 2 of 3 replicas must ack | Succeeds at ~1 RTT, 2 replicas hold it |
| `QUORUM` write, RF=3, partition isolates 1 node | Remaining 2 still form a quorum | Succeeds. The isolated node is repaired later by hinted handoff |
| `QUORUM` write, RF=3, partition isolates 2 nodes | Only 1 of 3 reachable, no quorum | **Fails.** This is the C half of the trade, and it is real |
| `ONE` read, RF=3 | 1 replica answers, possibly stale | Succeeds. **A** |
| `ALL` write, RF=3 | all 3 must ack | Fails under *any* partition. Maximally C, minimally A |
| DynamoDB `PutItem` | quorum of replicas in the AZ group | Succeeds if a majority of the replicas can be reached |
| DynamoDB read, eventually consistent | 1 replica answers | Succeeds, may be stale. **A** |
| DynamoDB read, `ConsistentRead=true` | waits for a quorum to agree | Fails or blocks if a quorum is unreachable. **C** |

Three things to notice in that table, all of which are the difference between a mid-level
and a staff answer.

**First, the "C" outcomes are failures, and that is the point.** Under a partition, the
strongly consistent operations return errors. An engineer who said "we chose consistency"
and did not realise that means "we chose to return `503` to some users" has not finished
the design.

**Second, `QUORUM` is a majority intersection argument, not a magic number.** With RF=3,
a quorum write to 2 replicas and a later quorum read from 2 replicas *must* overlap in at
least one replica, so the reader is guaranteed to see the write. RF=2 would not work: a
quorum is 2 of 2, a write goes to both, a read goes to both — but with one node down, both
operations fail. RF=1 is trivially consistent and trivially loses data. RF=3 is the
smallest useful value and the reason it is the near-universal default. RF=5 buys a lower
probability of an unavailable quorum, at 5/3 the write cost and the same read cost as
RF=3 for `QUORUM` reads.

**Third, "eventually consistent" is not a guarantee that all three operations above behave
the same way.** The guarantees live at the *operation* level and the *consistency level*
parameter, which is exactly why a single label cannot describe a database.

> **INTERVIEW TRAP — "OUR DYNAMODB TABLE IS EVENTUALLY CONSISTENT, SO WE CHOSE AP"**
>
> Three errors in one sentence. (1) DynamoDB's default is eventually consistent *reads*;
> the write path is a durable quorum, so a write is strongly consistent the moment it
> returns. (2) Consistency is per-request: `ConsistentRead=true` on a `GetItem` gives a
> linearizable read from the same table, at 2× the read cost, and AWS documents that you
> can and should use it selectively. (3) "AP" is not a label you attach to a table — during
> a partition, a strongly consistent read of an item whose partition is isolated on the
> minority side *fails*, while the same read on another item's partition succeeds. The
> correct sentence is: "our writes are quorum-durable, our default reads are eventually
> consistent, and we pay for strongly consistent reads on exactly two paths, and under a
> partition those two paths return errors rather than stale data."

#### Common Mistakes

- "Pick two of three" as the explanation, without the condition
- Labelling a whole database or system "CP" or "AP" when the guarantees are per-operation
- Treating a single-writer primary with async replicas as AP — it is CP with lag
- Not saying what happens to the *strongly* consistent operation during a partition (it
  fails, or it blocks, and that is what "C" means)
- Omitting PACELC entirely, or mentioning it without connecting the else branch to a
  configuration choice the reader has actually made
- Reasoning about "consistency" when you mean "durability" — they are different
  properties, and a durable quorum write is not a linearizable read

#### Interview Questions — CAP

**Q1. Is Cassandra CP or AP?** `TRICKY`

Neither label, as a description of the database. During a partition, a `QUORUM` write at
RF=3 needs 2 of 3 replicas: if 2 nodes are reachable it succeeds and repairs the third
later by hinted handoff, and if only 1 is reachable it *fails* — that is the C half. A
`ONE` read always returns, from whichever replica answers, possibly stale — that is the A
half. So the accurate answer is: writes at `QUORUM` are C, reads at `ONE` are A, reads at
`QUORUM` are C, and Cassandra lets you choose per statement. What makes it *feel* AP is
that the default read level is `ONE` and the default write level is usually `QUORUM`, so
the common case is available reads over a write path that will refuse rather than fork.
And the real question behind the label is what your application does when the write fails.

**Q2. What is PACELC and why does it matter more in practice?** `STAFF`

CAP says: during a partition, choose availability or consistency. PACELC adds the else
branch: when there is *no* partition — the steady state, which is almost every request —
you choose between latency and consistency. CAP describes an incident; PACELC describes
production. It matters because the configuration choices that govern your everyday
latency are all else-branch choices: read consistency level, whether a read goes to a
replica or the primary, whether a multi-region read is served locally or at home, whether
a cross-item update is a transaction or a single-item overwrite. A team that has only
reasoned about CAP has a partition story and a daily consistency problem, and the daily
one costs more user trust than the partition ever would.

**Q3. Under a partition, what does a strongly consistent DynamoDB read do?** `ADVANCED`

It blocks briefly and then fails if it cannot gather agreement from a quorum of the
replicas in the item's Availability Zone group — AWS documents that a strongly consistent
read against an unavailable replica will fail, and that you can raise the HTTP timeout to
tolerate a temporarily unavailable replica. So the trade is explicit: a strongly consistent
read is a linearizable read that costs 2× the read capacity units and that becomes an error
during a partition. That is the "C" in CAP expressed as an API contract, and the reason a
staff engineer picks the strongly consistent read on the two paths where a stale value is
a bug (a payment status, a just-written record) and an eventually consistent read
everywhere a stale value is cosmetic.

**Q4. Your team is migrating a single-primary Postgres to a multi-writer store to
"improve availability". What is the actual risk you have taken on?** `ADVANCED`

You have traded a single serialisation point — the source of all of Postgres's simplicity
about what is true — for concurrent writes that can conflict, and you have not decided what
happens when two writes touch the same logical entity. Concretely: last-writer-wins on a
whole item silently discards a concurrent update, so two increments to a counter become
one; a read-modify-write across items is not atomic without a transaction (and the
transaction costs 2× capacity, is capped at 100 items and 4 MB, and cannot span a region);
and if you later discover the two updates were not actually independent, there is no
snapshot to roll back to, so the repair is an application-level reconciliation. The
availability gain is real, but it is a gain in *write availability during a partition*, and
that was the only axis that was ever going to improve.

> **CHAPTER 2 SUMMARY**
>
> CAP is a conditional, per-operation impossibility result: during a network partition, no
> system offers both linearizable consistency and total availability. Partition tolerance
> is not a choice — partitions are the normal failure mode of a network — so the real
> decision is C or A, made per operation, and only while the partition lasts. That is why
> "is your database CP or AP" is a malformed question: the guarantees live at the
> consistency-level parameter of a statement, and one statement can be C while another on
> the same table is A. PACELC's else branch is the part that governs production, because
> every read consistency level and every replica-routing decision is an else-branch choice
> made before the incident. The senior move is always the same: name the operation, name
> the consistency level, and say what the client sees when the quorum is unreachable — an
> error, not a stale value.

#### Further Reading

- [S. Gilbert and N. Lynch — Brewer's Conjecture and the Feasibility of Consistent, Available, Partition-Tolerant Web Services](https://groups.csail.mit.edu/6.824/papers/Gilbert.pdf) — the original statement, including the precise definition of "available" that most summaries lose.
- [Microservices Volume 2, Chapter 1 — CAP, PACELC and the Consistency Spectrum](https://github.com/) — this set's architecture-level treatment; this chapter is the database-level companion and does not repeat it.
- [Apache Cassandra — Consistency Levels](https://cassandra.apache.org/doc/latest/cassandra/dml/consistency.html) — the official definitions of `ONE`, `QUORUM`, `ALL`, `LOCAL_QUORUM` and the serial levels, and what each returns under a partition.
- [Amazon DynamoDB Developer Guide — Read and Write Consistency Model](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteConsistency.html) — the official statement that consistency is per-request and that a strongly consistent read can fail when a replica is unavailable.
- [Pat Helland — Life Beyond Distributed Transactions](https://www.infoq.com/articles/life-beyond-distributed-transactions/) — the argument that the interesting trade is not ACID but idempotence and a single-item invariant, which is what distributed stores are actually built around.

## Chapter 3 — Consistency Models

### 3.1 The Ladder, Defined

A consistency model is a specification of what a client can observe about the order and
timing of operations. They form a ladder, and the useful thing to memorise is not the
definitions but **what each rung forbids, what it costs, and who has to know it exists.**

| Model | What it forbids | Cost | Who pays |
| --- | --- | --- | --- |
| **Linearizable** | Nothing. All operations appear to take effect at a single point between invocation and response, in an order consistent with real time | Highest. A quorum read or write per operation, typically +1 RTT | Nobody. Code is ordinary |
| **Sequential** | Reordering operations *from the same client*. Concurrent operations from different clients may interleave freely | One replica's propagation delay | Low. Sticky session or client-side sequencing |
| **Causal** | Observing a cause after its effect. If A caused B, no replica may show B without also showing A | Propagation delay, plus a version-vector comparison per read | Moderate. Cache invalidation becomes causal rather than global |
| **Read-your-writes** | Showing a client state older than a write it was told succeeded | A route to the primary, or a version token | Low, but it is a contract that needs a test |
| **Monotonic reads** | Showing a client a value older than one it has already seen | Read to a catch-up replica | Low |
| **Monotonic writes** | Writing from a client after another client has seen a later write from the same client | Write to the primary | Low |
| **Eventual** | Nothing in steady state. Guarantees only convergence | Zero. That is the entire point | **The application.** Every screen, every computed field, every "why is this number wrong" ticket |

Two of those deserve the emphasis a staff candidate gives them.

**Linearizable is not "the safe default" — it is the only model that lets you write ordinary
code.** Everything below it exists to avoid a quorum round trip, and every rung below it
exists to avoid a round trip at all. You are buying single-digit milliseconds with a
correctness burden that lands in your application, and that burden is paid again for every
screen, every export, every reconciliation job, forever.

**Eventual consistency is not free, and the database does not pay the cost — the UI does.**
A stale value returned to a screen is a support ticket, a refund, or a designer reworking
the screen so the staleness is less obviously wrong. This is the sentence to say in a design
review, because it moves the conversation from "what does the database support" to "who
will see the wrong number, and what will they do about it".

> **PRODUCTION RELEVANCE**
>
> The classic eventual-consistency incident is not a server error. It is: the user edits
> their address, the profile page shows the new value, and the *order confirmation* page —
> which reads a denormalised copy of the customer record written by an asynchronous
> projection — still shows the old one, and the parcel goes to the old address. The
> database is working exactly as configured. The consistency model was chosen correctly for
> the write path and never propagated to the read model that *prints things*.

### 3.2 What Each Engine Actually Offers

The abstraction above is clean; the engines are not. This table is the one to memorise,
because "what can I actually set" is the question a design review asks.

| Model | Cassandra | DynamoDB | MongoDB | Redis |
| --- | --- | --- | --- | --- |
| Linearizable read | `SERIAL` (Paxos, heavyweight) or `QUORUM` with a guarantee caveat | `ConsistentRead=true` (2× RCU) | read concern `linearizable`, `majority` on the primary | Single primary only; inherent |
| Sequential per-client | `SERIAL` / LWT on the same partition | Not a documented per-client guarantee; conditional writes on one item | Not directly | Single-node scope |
| Causal | Not a model; vector-clock-free by default | Not a model | Not a model | Not a model |
| Read-your-writes | Read at `QUORUM` after a `QUORUM` write, or a `SERIAL` read | Re-read with `ConsistentRead=true` | `majority` read after `w: "majority"` write | Immediate — one node |
| Monotonic reads | Pin the session to a replica | `ConsistentRead` reads | `majority`/primary | One node |
| Eventual (default) | `ONE` reads | Default `GetItem`/`Query` | read concern `local`, secondaries | Replica reads |

Read the table carefully, because the gaps are the interesting part. **Not one of these
engines offers a "causal consistency" switch**, and yet the single most valuable
consistency tool in practice — a read-your-writes guarantee — is available in all of them
through *composition* (route the read, or use a quorum). That is worth saying out loud,
because "which of the seven models does this engine support" is the wrong question; the
right question is "which of the guarantees do I need, and what does it cost in this
engine's vocabulary".

> **MUST REMEMBER**
>
> The consistency models in the table are not settings. They are *consequences* of
> settings: a consistency level, a read preference, a routing decision, a write concern, or
> a read concern. There is no "eventual consistency: on" anywhere, and a candidate who
> cannot name the setting behind a guarantee does not yet understand the system they are
> defending.

### 3.3 "Eventually Consistent" Is Not a Specification

This is the single most consequential thing in the chapter, and it is a
specification problem rather than a technical one. "This data is eventually consistent"
tells a reader nothing they can build on: not how long, not what happens when a replica is
permanently down, not whether it converges when a write is *rejected* on a replica.

An eventual-consistency claim is only usable if it names at least four things:

1. **The bound.** How long? "Typically under a second" is a claim. "Within 2 seconds under
   normal operation" is a specification with a test attached. Cassandra's own read paths
   are unbounded by default: `ONE` read latency is whatever the slowest reachable replica
   says, and a node that is down rather than lagging does not return at all — the read
   succeeds against another replica and the data is simply as old as that replica is.
2. **The mechanism.** How does it converge? Anti-entropy repair, hinted handoff, read
   repair, a CDC stream, a projection worker? Each has different failure behaviour.
3. **The failure case.** What if the node holding the newest value is down for a week?
   Cassandra: the value exists on other replicas at RF≥2, hinted handoff replays when it
   returns, and `nodetool repair` is the backstop. DynamoDB: a durable write quorum means
   the value is on a majority of replicas and the service reconciles. But if your
   *application's* eventual consistency is a projection table updated by a worker, the
   answer is "it never converges, and the bug is in the worker".
4. **Who is responsible for noticing.** A convergence guarantee nobody monitors is a hope.
   `nodetool tp` in Cassandra and a replication-lag alarm in DynamoDB are the difference
   between a model and a specification.

> **INTERVIEW TRAP — "OUR CATALOGUE IS EVENTUALLY CONSISTENT"**
>
> Follow up with the four questions, and the answer is usually silence: *how long, via
> what mechanism, what happens if a replica is permanently down, and who is watching?* A
> senior answer reframes it: "eventual consistency is a *process*, not a promise. In our
> system convergence happens through X, it takes Y under normal operation, there is no
> bound at all when Z is down, and the alarm on the convergence lag metric is what turns
> 'eventually' from a word into a specification." Saying that, and then naming the metric
> and the alert threshold, is the difference between a candidate who has read about
> consistency and one who has operated it.

### 3.4 Read-Your-Writes: The One Number to Carry

If you carry one number out of this chapter it is this: **moving from eventual consistency
to read-your-writes costs you a route to the primary, or a version check.** Those are the
only two mechanisms; everything else — session tokens, sticky reads, a `?version=` query
parameter, an ETag, a conditional write — is an implementation of one of the two.

```text
  OPTION A — route the read to where the write landed.
    The write returns (or you know) the replica/primary that handled it;
    the client's next read for that aggregate goes there.
      • Simple, exactly correct.
      • Costs primary capacity, including from users who only read.
      • Breaks in multi-region: "the primary" is a different primary elsewhere.
      • In Cassandra this is a read at QUORUM rather than ONE — the quorum is what
        guarantees the intersection with the write's replicas.

  OPTION B — version / token check.
    The write returns a monotonic token (a row version, a sequence number, a
    conditional-write etag, an opaque ETag). The read carries it; if the
    replica's version is behind, the read is escalated.
      • Costs nothing in steady state — 99% of reads are served locally.
      • Costs a token in the API contract, a commitment that is hard to remove.
      • Comes free where the engine already has one: a DynamoDB
        ConditionExpression, a Cassandra SERIAL read, a MongoDB writeConcern +
        readConcern pair.
```

The staff-level observation is that **this is a per-read-path decision with no global
setting.** "Our system is eventually consistent" is a fact about a *query*, not about a
system, and somewhere on every critical path there is a query where eventual is not good
enough. The review question is not "what is our consistency model" but **"which reads, if
stale, would a user call a bug?"** — and the answer is a short, writable list: your
balance, your order status, your permission check, your write confirmation, the price at
checkout.

> **STAFF-LEVEL CONSIDERATION**
>
> The consistency conversation is a *product* conversation wearing an engineering costume.
> Engineering can implement any of these models; it cannot decide that showing a customer a
> stale delivery address is acceptable. Getting that decision made explicitly — a one-page
> list of the reads where staleness is a bug and the reads where it is cosmetic — is worth
> more than choosing the right database, and it is the artefact that is missing when the
> incident happens three months later. Write the list. It is the cheapest durable artefact
> in this whole chapter, and it is the thing you can take into a design review and get a
> decision on.

#### Common Mistakes

- Saying "our system is eventually consistent" with no bound, no mechanism, and no
  monitor — that is a hope, not a specification
- Listing consistency models without the cost column, and so missing that the cost of
  eventual consistency is paid by the application rather than the database
- Assuming read replicas give read-your-writes. They give monotonicity at best
- Believing all seven models are configuration settings on the engine
- Treating read-your-writes as a global policy instead of a short list of specific reads
- Conflating durability with consistency — a write can be durable on two replicas and
  still not be visible to an `ONE` read of the third

#### Interview Questions — Consistency Models

**Q1. Explain eventual consistency and why "eventually" is not a specification.** `STAFF`

Because convergence is a process with a mechanism, a duration, a failure mode, and an
owner, and "eventually" names none of them. A usable claim needs four things: the bound
(how long, under normal conditions), the mechanism (anti-entropy repair, hinted handoff,
read repair, or a CDC/projection worker), the failure case (a node down for a week means
the bound does not apply, and for an application-side projection it may never converge), and
the monitor (a convergence-lag metric with an alert, or the guarantee is unmonitored and
therefore fictional). In Cassandra, `ONE` reads are unbounded even in normal operation
because the read is served by whichever replica responds, and a node that is *down* rather
than lagging simply does not answer.

**Q2. Your service writes a profile, then immediately reads it through a replica and
occasionally shows the old value. What guarantees were broken, and what fixes exist?**
`TRICKY`

Read-your-writes was broken, and it was never provided in the first place — replica reads
give monotonicity at best and say nothing about a client's own writes. The three fixes,
in increasing cost: route reads for that aggregate to the primary (or to the replica that
acknowledged the write) for a short window after a write, which is exact and costs primary
capacity; carry a version token from the write and escalate the read when the replica's
version is behind, which costs nothing in the steady state but puts a token in your API
contract; or accept the staleness and make the UI tolerant, which is a product decision
and usually the wrong one for a write confirmation. The deeper point is that this is not
a bug in the replica — it is doing exactly what it was configured to do, and the
configuration is the thing to review.

**Q3. Which of the seven consistency models can a Cassandra deployment actually give you,
and which can it not?** `ADVANCED`

Linearizable is available but heavyweight: a `SERIAL` read or a lightweight transaction
runs a Paxos round, and it is only meaningful for a single partition. Sequential
per-client and read-your-writes are reachable by reading at `QUORUM` after a `QUORUM`
write, because the majority intersection guarantees the reader sees the write. Causal
consistency is *not* available — Cassandra's default coordinator-based writes do not carry
version vectors, so it will not detect and repair a read that shows an effect without its
cause. Monotonic reads and monotonic writes are reachable by pinning sessions to a replica
or the primary, at a latency cost. Eventual is the default at `ONE`. So the honest answer
is that of the seven, Cassandra gives you linearizable, sequential, read-your-writes,
monotonic reads and writes, and eventual — and that causal is the one you have to build
yourself.

> **CHAPTER 3 SUMMARY**
>
> Consistency models are a ladder, and the useful memory is the *cost column*: linearizable
> is the only rung that lets you write ordinary code, every rung below it buys latency with
 correctness you must now handle in the application, and the bottom rung's bill is paid by
> whoever builds the screens. Engines do not expose these as named settings — they are
> consequences of a consistency level, a read preference, a write concern, a read concern
> or a routing decision — and none of the major engines offers a causal-consistency switch,
> which is why the single most valuable tool, read-your-writes, is always constructed rather
> than configured. "Eventually consistent" without a bound, a mechanism, a failure case and
> a monitor is not a specification, it is a hope, and the review question that fixes it is
> not "what is our consistency model" but "which reads, if stale, would a user call a
> bug?"

#### Further Reading

- [Doug Terry — Implementing Read-Modify-Write with the Paxos Algorithm (Microsoft Research)](https://www.microsoft.com/en-us/research/publication/implementing-read-modify-write-with-the-paxos-algorithm/) — the session guarantee framework that produced the linearisable/sequential/casual/session taxonomy.
- [Apache Cassandra — Data Consistency](https://cassandra.apache.org/doc/latest/cassandra/dml/consistency.html) — the official consistency levels, including the serial levels and what each costs in replicas contacted.
- [Amazon DynamoDB Developer Guide — Read and Write Consistency Model](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteConsistency.html) — the per-request consistency contract, including the failure mode of a strongly consistent read against an unavailable replica.
- [Kubernetes Documentation — Consistency Models](https://kubernetes.io/docs/concepts/architecture/consistency/) — a clear, engine-neutral restatement of linearisable, serialisable and eventual with the failure semantics spelled out.
- [Marc Shapiro — The Pros and Cons of Eventually Consistent Data](https://www.cs.utexas.edu/~watkins/380p/comments/shapiro.html) — a short and rigorous treatment of why "eventual" without a bound is nearly meaningless.

## Chapter 4 — Partitioning & Data Distribution

### 4.1 Why This Chapter Is the Real Content of Every NoSQL Design

Everything else in this volume is engine detail. The partition key is the design. It is the
one decision that determines how much data lives on one machine, how much write throughput
one machine can absorb, whether a given query is a point read or a fan-out, and whether a
rebalancing operation moves a petabyte or a megabyte. **And unlike an index, a secondary
index, or a consistency level, it cannot be changed later without rewriting the data.**

That is the sentence a candidate should lead with in a design review, because it changes
the tone of the conversation: choosing a partition key is not a tuning decision, it is a
commitment. "We chose `user_id` as the partition key" is a statement about the next three
years of the company's storage layout.

> **MUST REMEMBER**
>
> A partition key is simultaneously four things: the unit of storage, the unit of
> replication, the unit of write throughput, and the ceiling on query shape. Change any one
> of them and you have changed all four. This is why "let's just shard by a different key"
> is a data-migration project with a downtime plan, not a configuration change.

### 4.2 Hash vs Range

```text
  RANGE PARTITIONING                 HASH PARTITIONING
  ─────────────────                 ─────────────────
  pk range                           pk hashed
  ┌────────┬────────┬────────┐       ┌────────┬────────┬────────┐
  │   A–H  │   I–P  │   Q–Z  │       │  #a71  │  #3f0  │  #9c4  │
  └────────┴────────┴────────┘       └────────┴────────┴────────┘
    n1       n2       n3              n1       n3       n2

  ✓ range queries are natural        ✓ even distribution, always
  ✓ keys are human-meaningful         ✓ no hot range at the end
  ✗ HOT SPOT when key space is        ✗ range queries touch every partition
    skewed (timestamps, autoinc)      ✗ keys are opaque
  ✗ one node owns the new key range   ✗ rebalancing moves live data
  ✗ rebalancing is a key-range move
```

The failure mode of range partitioning is the one that bites in production: an
ever-growing key space with an uneven distribution. Timestamps are the classic — a
`created_at` range partition means every write in the last hour goes to one node, and
"add more nodes" does not help because the writes are not spread. Hash partitioning
removes that class of bug entirely, which is why both DynamoDB and Cassandra partition by
a hash of the partition key.

The cost of hash partitioning is *range queries*, and this is a real cost that people
forget. A query like "all events for user 42 in March" is a single-partition read if `42`
is the partition key and March is in the sort key's range; it is a full-table fan-out if
the partition key is the tenant. The answer is not to abandon hash partitioning — it is
the design pattern DynamoDB's own documentation leads with (a sort key designed so the
access pattern is a prefix scan of one partition), and Chapter 8 covers it properly.

> **TRADE-OFF**
>
> Range partitioning wins when your dominant access pattern is a range scan and the key
> space is naturally bounded (a country code, a tenant list you control). It loses when
> the key space grows without bound or the distribution is skewed. Hash partitioning wins
> in almost every other case. The flip condition that is most often missed: **if your
> partition key is a monotonically increasing value — a timestamp, an autoincrement, a
> ULID — hash it.** That one sentence prevents the most common hot-partition incident in
> this whole volume.

### 4.3 The Partition Key as a Ceiling

This is the number-driven part, and it is the difference between a candidate who has read
about partitioning and one who has been paged about it.

```text
  A CLUSTER OF 24 NODES. USEFUL THROUGHPUT: ENORMOUS.
  ONE PARTITION. USEFUL THROUGHPUT: THAT OF ONE NODE.

  Node 1  Node 2  Node 3  ...  Node 24
    ▲                                    ▲
    │                                    │
  ┌─┴──────────────────────────────────┴─┐
  │  partition key = "tenant_id = 1"     │   ← every one of these 24 nodes is
  │  partition key = "tenant_id = 1"     │     idle. This is one key's ceiling.
  │  partition key = "tenant_id = 1"     │
  └──────────────────────────────────────┘
       writes/s you will actually get

  Horizontal scale does not help, because the work is not spread
  across the ring. It is all in one key.
```

**Cassandra.** A partition is owned by a set of replicas determined by the replication
factor and the token ring. Writes to one partition are coordinated (routed to the first
replica) and then sent to that partition's replicas — not to the whole ring. Adding nodes
changes token ownership and therefore which nodes own which partitions, but it does not
split a partition. So a single hot partition key is limited by the throughput of its
coordinator plus its replicas, and the "add another node" reflex does nothing for it.

**DynamoDB.** The documented ceiling is explicit: **a single partition can absorb roughly
1,000 WCU/s and 1,000 RCU/s** in a single region (AWS documents up to 3,000 read units per
second for strongly consistent reads on a single partition, and the write ceiling of
1,000 WCU/s per partition as the hard limit). Adaptive capacity — documented, and genuinely
useful — absorbs *skew across a table's partitions* by moving capacity to the hot ones, and
it also tracks item sizes so that large items are not throttled by small-item provisioning.
**It does not split a partition across nodes.** A single hot key is a single key's ceiling,
and the mitigations are all application-side: add a random or computed suffix to the
partition key to spread the load across several partitions, and keep them in the same
item if you need a transactional single-item guarantee.

**MongoDB.** A shard holds a range or a hash of the shard key; a hot shard key has the
same ceiling, and MongoDB's own guidance is a hashed index for a monotonically increasing
shard key, with the caveat that range queries across a hashed shard key are not supported.

> **SCALING REALITY CHECK**
>
> DynamoDB's documented per-partition ceiling is the number to carry: **1,000 write capacity
> units per second and 1,000 read capacity units per second on a single partition** (with
> up to 3,000 read units per second for strongly consistent reads on one partition). A
> customer, an account, a device, or a tenant is a natural single partition key, and any
> of them can be a legitimate 1,000-writes-per-second key. The moment your per-tenant write
> rate approaches a few hundred per second, you are designing a "one big tenant" problem,
> and the fix is in the key, not the capacity.

### 4.4 The Partition Key Determines Whether a Query Is O(1) or a Fan-Out

This is the practical consequence and it is worth making concrete with an example, because
"fan-out" is a word that hides a p99.

```text
  QUERY: "all orders for customer C, newest first, page 1"

  CASE A — pk = customer_id, sk = order_ts DESC
  ──────────────────────────────────────────────
  hash("C") → partition 8813 → ONE node
  sort key range [now-1yr, now] → first 25
  Work: 1 partition, 1 range, 25 rows.
  Latency: ~1 RTT. Independent of table size.  ✓

  CASE B — pk = order_id (a per-order key)
  ──────────────────────────────────────────────
  No idea which partition holds C's orders.
  Work: read every partition, filter, sort, take 25.
  Latency: 1 RTT + N partitions, N = table size / data per partition.
           Pages forever, times out at 1M rows, times out at 10M.  ✗

  CASE C — pk = customer_id, and you forgot the sort key
  ──────────────────────────────────────────────
  hash("C") → partition 8813 → ONE node, but the WHOLE partition.
  Work: read all of customer C's orders, sort in the application, take 25.
  Latency: fine at 200 orders, 40ms at 20,000, and a 1.2 GB payload at 200,000.
           A partition is a hard storage ceiling, usually 5–10 GB in Cassandra.  !
```

Case C is the one that surprises people, and it is the reason DynamoDB documents a
700 KB item-size limit per attribute and Cassandra enforces practical partition-size limits
in production guidance even though the storage layer itself does not. **A partition is a
unit of storage as well as a unit of throughput**, and a partition that grows without
bound is a slow-motion version of a table that never got partitioned: everything still
works until it does not, and by then it is in production.

### 4.5 Hot Partitions, and Why "Add a Node" Does Not Fix Them

```text
  THE HOT-PARTITION FAILURE

  1. One key takes all the traffic.
     09:14  p99 write latency on one item: 4 ms      (normal)
     09:41  traffic ramps (a campaign, a cron, a viral post)
     09:52  coordinator CPU on 3 replicas pinned at 100%
     09:53  client timeouts; the client retries; the retries add load
     10:01  the retries look like a network problem, so on-call adds nodes

  2. Adding nodes does nothing.
     Nodes 25–48 join the ring. They own new partitions. The hot
     partition still has exactly its replication factor of replicas,
     and they are still the same overloaded machines.

  3. The overload is now a stuck queue.
     Appending to the memtable is fine, but the memtable cannot flush
     because compaction cannot keep up on those 3 machines.
     Write latencies grow from seconds to minutes. The "outage" is
     now a latency outage affecting the 3 replicas of one key.

  4. The correct fix was in the key, three hours earlier.
     pk = f"{account_id}-{hash(order_id) % 16}"
     → 16 partitions instead of 1, and the item's 16 siblings are
       combined by a query when the item is read whole.
```

Three lessons, and the third is the one that generalises beyond Cassandra.

1. **A hot partition is a per-key resource ceiling, and the cluster size is irrelevant to
   it.** The remedy is always to change the key or spread the key — add a bucket suffix,
   use a computed shard, split a counter into N counters.
2. **Latency failures amplify into self-inflicted outages** because clients retry. A client
   timeout with a retry is a load multiplier on the exact machine that is already
   saturated, so a warm partition becomes an outage in minutes. Backoff and jitter are not
   optional at this layer.
3. **A hot partition degrades into a storage problem.** The moment a partition's write
   rate exceeds what its replicas can compact, the write path stops being a latency problem
   and becomes a durability problem — memtables cannot flush, the commit log is the only
   copy, and a node failure during that window is real data loss. This is Chapter 5's
   subject and it is the reason compaction is on the staff interview syllabus at all.

### 4.6 The Partition Key Is Decided Once and Lived With

> **STAFF-LEVEL CONSIDERATION**
>
> The organisational version of "the partition key is decided once" is that the team which
> chooses it will not be the team that pays for it, and the team that pays for it will not
> understand why the constraint exists. The mitigation is not a better design doc; it is
> three artefacts that cost an afternoon. (1) A one-page **access pattern list** — every
> query the system serves, written as a `WHERE` clause, with its expected rate. If the list
> does not fit on a page, the schema is not designed. (2) A **partition review** that walks
> the list against the proposed keys and names, explicitly, the queries that are fan-outs
> and the keys that are hot. (3) A **key-change runbook** that says what a re-key would
> involve — dual-write, backfill, cutover — so the day someone needs it, it is a known
> procedure rather than a research project. Volume 6 Chapter 8 owns the relational version
> of the same problem; this is the distributed version, and the artefacts are the same.

> **PRODUCTION SCENARIO**
>
> Problem: a device-telemetry table in Cassandra began returning partial page results about
> forty minutes after a weekly firmware rollout pushed updates to a large fleet of devices.
> Investigation: `nodetool tablestats` showed the affected partitions' write latency at
> several seconds while the rest of the ring was idle; `nodetool cfstats` showed compaction
> backlog concentrated on three nodes; the same three nodes were the replicas for the
> partition holding `device_id = "fleet-default"`, which a buggy firmware build had used as
> a placeholder for devices with no identity.
> Root cause: a null-or-default device id collapsed an entire class of devices onto one
> partition key, so a logical bug in the client became a physical ceiling in the database.
> Solution: shard the partition key by a hash suffix, backfill the affected rows to the
> sharded keys with a dual-read window, and add a validation check at the ingestion
> boundary that rejects a placeholder identity at write time rather than at read time.
> Prevention: a partition-level alert on write p99 and on compaction backlog, plus a
> standing rule that any dimension a client can default must not be a partition key.

#### Common Mistakes

- Treating the partition key as a tuning parameter rather than a commitment that requires a
  data migration to change
- Using a monotonically increasing value (timestamp, autoincrement, ULID) as a partition
  key without hashing it, which produces a range-partition hot spot
- Assuming more nodes fix a hot partition — they do not, and saying so is the question
- Believing adaptive capacity or automatic sharding splits a single partition
- Not noticing that a partition is also a *storage* ceiling, so a single customer key is a
  slow-motion unbounded table
- Designing a partition key from the entity's identity and forgetting that its access
  pattern is by date, status, or full text

#### Interview Questions — Partitioning

**Q1. What is the partition key and what does choosing one commit you to?** `STAFF`

It is the key whose value selects the unit of distribution — the unit of storage, the unit
of replication, the unit of write throughput, and the ceiling on query shape. Choosing one
commits you to four things at once: how data is laid out, how many replicas a datum has,
how fast a single key can be written, and which queries are point reads versus fan-outs.
The expensive part is that this is effectively permanent — changing it is a dual-write, a
backfill, and a cutover, not a configuration change. So the design review question is
never "is this key good for one query" but "walk me through the whole access pattern list
and show me every query this key serves and every query it turns into a scan."

**Q2. How do you detect and fix a hot partition in Cassandra?** `ADVANCED`

Detection: per-partition write latency and row counts are visible in `nodetool
tablestats` and in the per-partition metrics, and the tell at the cluster level is a small
set of nodes pinned while the rest are idle, plus a compaction backlog growing on exactly
those nodes. The root cause is almost always a skewed or defaulted key dimension — a
timestamp, a status, a null that became a constant, or a key with a power-law distribution
— so I would look at which *value* of the partition key is responsible, not at the cluster.
Fix: re-key with a suffix or a computed shard so the load spreads over N partitions
(`pk = f"{id}-{hash(other_field) % 16}"`), and accept that reads of the whole entity now
need a query across the N siblings or a second table. You can also spread writes of a
counter across N counters. You cannot fix it by adding nodes, and you cannot fix it by
raising throughput settings, because the work is on one key.

**Q3. Your DynamoDB table is at 40% of its provisioned capacity on average but the p99
latency is 200 ms. What is happening?** `SCENARIO`

Almost certainly a hot partition, and adaptive capacity is not the answer you might hope
for. Average utilisation is 40% while p99 latency is 200 ms is the classic signature of
traffic concentrated on a small number of partition keys: most of the table is idle, a few
partitions are pinned, and requests against them are queued behind each other. Adaptive
capacity absorbs skew *across* a table's partitions and tracks item sizes, so it will
raise the effective capacity of the hot partitions, but it cannot split a partition — a
single key remains bounded by the per-partition limits, and AWS documents 1,000 WCU/s and
1,000 RCU/s per partition as the practical ceiling. I would identify the hot keys from
CloudWatch's per-item and per-partition metrics, then re-key: add a computed suffix to the
partition key so the load spreads over several partitions, and if the entity must be read
and written as a unit, keep the canonical item in one partition and use a transaction or a
fan-out read with a version check.

> **CHAPTER 4 SUMMARY**
>
> The partition key is the design. It is simultaneously the unit of storage, replication
> and write throughput, and the ceiling on query shape, and changing it is a data
> migration rather than a configuration change. Hash partitioning gives even distribution
> and no hot range but destroys range queries, so the compensation is a sort key designed
> so the hot access pattern is a prefix scan of a single partition. Throughput scales
> *per partition*, so a single hot key is a per-key ceiling that no amount of extra nodes
> fixes — DynamoDB documents 1,000 WCU/s and 1,000 RCU/s per partition, and adaptive
> capacity redistributes capacity across partitions without ever splitting one. A partition
> is also a storage ceiling, so a key that grows without bound is a table that was never
> partitioned. The three artefacts that make this survivable are the access-pattern list,
> the partition review, and the key-change runbook.

#### Further Reading

- [Amazon DynamoDB Developer Guide — Partition Keys and Sort Keys](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.PartitionKeys.html) — the official statement of hashing, the 10 GB partition size limit and the adaptive-shuffle advice.
- [Amazon DynamoDB Developer Guide — Adaptive Capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/adaptive-capacity.html) — what adaptive capacity does, and the documented per-partition limits it cannot move.
- [Apache Cassandra — Data Distribution](https://cassandra.apache.org/doc/latest/cassandra/architecture/datatransfers.html) and [Replication Strategies](https://cassandra.apache.org/doc/latest/cassandra/architecture/replication.html) — tokens, replicas, and why a partition is not spread across the ring.
- [Designing Data-Intensive Applications — Consistent Hashing](https://dataintensive.net/) — the chapter on the ring, virtual nodes, and why rebalancing is a data movement problem.
- [AWS Architecture Blog — Using Bucketing to Spread Workload Evenly Through Partition Keys](https://aws.amazon.com/blogs/database/using-bucketing-to-spread-workload-evenly-through-partition-keys-with-database-services/) — the official version of the shard-suffix fix, including the read-combining cost.

## Chapter 5 — Cassandra: Architecture

### 5.1 Why Cassandra Is a Log-Structured Store, Not a B+ Tree

A relational engine's write path is a B+ tree insert, and a B+ tree insert is a *random*
page write: find the leaf, read it, modify it, write it back. A page is 4–16 kB. If you
update one column of one row, you still rewrite a whole page, and you pay for it in a
random I/O while holding a latch on that page. The design is excellent for reads, which
is why every OLTP engine since 1970 has used one, and it is the reason write throughput
against a heavily-indexed table degrades.

Cassandra's answer is to invert the problem: **never modify a file in place. Append.**
Writes go to memory, memory gets flushed to immutable files, and files get merged in the
background. This is the *log-structured merge tree*, and the entire storage engine is
four components and a background process.

```text
   WRITE PATH (what the client does)
   ────────────────────────────────

   client
     │  write(pk, ck, value), CL = QUORUM
     ▼
   ┌──────────────────────────┐
   │  COORDINATOR             │  any node can coordinate; it is stateless
   │                          │  with respect to the data — it just routes
   └───────┬──────────┬───────┘
           │          │
           │ writes   │ writes to the replicas
           │ locally  │ for this partition
           ▼          ▼
   ┌──────────────┐  ┌──────────────────────────────────────────────┐
   │  MEMTABLE    │  │  REPLICA 1    REPLICA 2    REPLICA 3        │
   │  in-memory   │  │  memtable     memtable     memtable         │
   │  sorted map  │  │  + commitlog  + commitlog  + commitlog      │
   └──────┬───────┘  └──────────────────────────────────────────────┘
          │
          │ flush when memtable is full (default ~128 MB, memtable_heap_space)
          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  SSTABLE 1        SSTABLE 2        SSTABLE 3        ...      │
   │  immutable        immutable        immutable                 │
   │  + bloom filter   + bloom filter   + bloom filter            │
   │  sorted by key    sorted by key    sorted by key             │
   └──────────────────────────────────────────────────────────────┘
          │
          │ COMPACTION (background)
          ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  SSTABLE 4 — merged, deduplicated, tombstones resolved        │
   └──────────────────────────────────────────────────────────────┘
```

Three properties fall straight out of that picture, and each is a real design win:

1. **Writes are sequential.** Appending to a memtable and to a commit log is a memory write
   and a sequential disk append. The slowest operation in a relational write — a random
   page I/O — happens only in the background, where its latency does not reach the client.
2. **Reads must consult many files.** A key may be in the memtable, in SSTable 3, in SSTABLE
   7, and in the merged SSTable 4. The read path has to check all of them, and it needs
   something to avoid that. That something is the bloom filter.
3. **Deletes and updates are writes.** A tombstone is a row. An update is a newer row. Both
   are appends, and both leave garbage behind — which is what compaction exists to collect.
   This is the root of the tombstone problem, and it is the chapter's most important
   practical consequence.

> **MUST REMEMBER**
>
> In an LSM store, **a write is cheap and a read is a search across files**; in a B+ tree a
> read is a lookup and a write is a page modification. Every operational consequence in this
> chapter — bloom filters, compaction strategies, tombstone accumulation, write latency
> spikes during compaction — follows from that single inversion. When a question goes
> wrong in a Cassandra cluster, ask which of the two costs it is: a write-heavy problem
> lives in the memtable and the commit log, a read-heavy problem lives in the number of
> SSTables and the bloom filters.

### 5.2 The Write Path in Detail

A single write, step by step, and the durability guarantee at each step:

1. **Parse and route.** The coordinator hashes the partition key with the partitioner
   (Murmur3 by default), maps the resulting token to a token range, and looks up the
   replica set for that range. Every node holds the whole ring metadata, so any node can do
   this without a lookup service — that is what makes the topology a gossiped distributed
   hash table rather than a service with a registry.
2. **Consistency level check.** For `QUORUM` at RF=3, the coordinator must receive
   acknowledgements from 2 of the 3 replicas before returning. If the partition is
   partitioned such that only one replica is reachable, the write **fails** — this is the
   "C" in the CAP discussion of Chapter 2, and it is worth being able to say it unprompted.
3. **Commit log write, then memtable write, per replica.** Each replica appends the
   mutation to its commit log and updates its memtable. The order matters: the commit log
   is what makes the write durable, so it is written (and, depending on durability
   settings, flushed) before the memtable is acknowledged.
4. **Memtable flush.** When the memtable reaches its threshold, it is written out as a
   **sorted string table** — an immutable, sorted, on-disk file of the partition's rows,
   with an index and a bloom filter. The memtable is then discarded. From this point the
   data is durable in the SSTable and no longer needs the commit log segment, which is
   truncated.
5. **Compaction.** SSTables overlap — the same key is in many of them — and reads have to
   check all of them. Compaction merges them. This is the background process the next
   sections are about.

```text
  A SINGLE WRITE, WITH THE FAILURE POINTS

  coordinator
      │
      ├──► replica 1 ──► commit log append ──► memtable update ──► ACK
      ├──► replica 2 ──► commit log append ──► memtable update ──► ACK
      └──► replica 3 ──► DOWN
                │
                └──► coordinator stores a HINT for replica 3
                     and (at CL=ONE) returns success

      At CL=QUORUM: 2 ACKs → success, same hint, replica 3 catches
                     up when it returns, or after nodetool repair.
```

> **TRADE-OFF — Replication Factor and Hinted Handoff**
>
> Higher RF buys two things: reads can be served from more replicas, and the *probability*
> that a quorum exists during a partition rises. RF=5 with a quorum read still costs 3
> replica responses, so read latency is not better than RF=3; write cost is 5 writes
> instead of 3. The flip condition is availability during correlated failures: RF=3 survives
> the loss of 2 replicas with a quorum intact, RF=5 survives 3, and in a large cluster
> correlated failures (a rack, an AZ, a bad disk batch) are more likely than independent
> ones. RF=5 is a deliberate availability purchase, and the bill is write amplification
> and storage.

### 5.3 The Read Path: Bloom Filters and the Partition Summary

A read has to answer a question that is much harder in an LSM store than in a B+ tree: *is
the key I want in any of these 40 SSTables?* Checking all 40 is what makes naive LSM reads
quadratic in file count, so two structures exist to avoid it.

**The bloom filter** is a probabilistic set. It is built at SSTable-write time, one bit
per key at a configurable false-positive rate (Cassandra's default is 10 bits per key, a
1% false positive rate). At read time, a key not in the filter is *definitely* not in that
SSTable, and the file is skipped without a disk read. A false positive means a wasted disk
read, which is the whole point of a probabilistic structure: a 1% chance of a wasted read
in exchange for never reading a file that cannot contain the key.

```text
  READ: SELECT * FROM orders WHERE pk = 'C' AND ck > 2026-01-01

  ┌──────────────────┐
  │  MEMTABLE        │  sorted in memory; binary search
  └────────┬─────────┘
           │ not found (or partially)
           ▼
  ┌──────────────────┐   ┌──────┐   ┌──────┐   ┌──────┐   ┌──────┐
  │  SSTABLE 9       │   │ bf:0 │   │ bf:0 │   │ bf:1 │   │ bf:0 │
  │  + bloom filter  │   │ skip │   │ skip │   │ READ │   │ skip │
  └────────┬─────────┘   └──────┘   └──────┘   └──┬───┘   └──────┘
           │                                       │ row found?
  ┌────────┴─────────┐                             ▼
  │  PARTITION INDEX │                    ┌──────────────────┐
  │  (sstable_index) │                    │  SSTABLE 7       │
  │  pk → offset     │                    │  row + SCANNER   │
  └──────────────────┘                    └──────────────────┘

  On a miss in SSTABLE 7, the SCANNER follows the on-disk linked list
  of rows for that partition in that file, reading sequentially until
  the clustering key range is exhausted.
```

**The partition summary (and partition index)** solves the other half: locating a specific
*partition* inside a large SSTable. Each SSTable carries an offset summary — a sampled
index of key → file offset — so the reader can seek approximately and then scan a small
forward window. Without it, every read would start at the beginning of a multi-gigabyte
file. `OffsetIndexSizeInKB` per table controls the sampling density, and it is one of the
knobs that trades memory for read latency.

Two related read concepts round out the path. **Read repair** is discussed in 5.6. The
**scanner** is the part that surprises people: once a key is found, Cassandra keeps
scanning forward within that SSTable, because rows for the same partition are stored
adjacently. This is why a wide `SELECT *` on a large partition is fast (sequential scan of
adjacent rows) and why a partition that is too large is a storage problem, not a latency
one, until it is not.

> **SCALING REALITY CHECK**
>
> Bloom filter false-positive rate is the knob to reach for when read p99 climbs while the
> memtable and SSTable counts look normal. Cassandra's default is 10 bits per key (1%
> false positive); raising it to 20 bits halves the wasted reads at the cost of 10 bits per
> key of memory (10 bytes per key, which is significant on a store with hundreds of millions
> of keys). Note the direction of the trade: this is a *read latency* fix, and it is worth
> making only after checking whether the read is hitting many SSTables because compaction
> is behind — which is a different problem with a different fix.

### 5.4 Compaction: Size-Tiered vs Leveled

Compaction is the background process that merges SSTables, resolves overwrites, and
discards tombstones that are safe to drop. It is the single most important thing to
understand operationally, because **the read path's cost is a function of how many
SSTables exist, and compaction is the only thing that reduces that number.**

```text
  SIZE-TIERED (STCS)                    LEVELED (LCS)
  ────────────────────                  ───────────────────

  4 SSTables of roughly equal size      SSTable 1  (L0, newest, overlapping)
   → merge into 1 big one                  SSTable 2  (L1)
   → repeat with the next tier             SSTable 3  (L1, sorted, non-overlapping)
  ┌────┐ ┌────┐ ┌────┐ ┌────┐            ...
  │ s1 │ │ s2 │ │ s3 │ │ s4 │           When L0 exceeds a threshold, merge into L1.
  └──┬─┘ └──┬─┘ └──┬─┘ └──┬─┘            L1 is large and mostly non-overlapping,
     └────┴────┴────┴────┘               so a read touches L0 + one L1 SSTable.
      → SSTable 10 GB                     A background thread merges L1 into L2.
  ┌──────────────────┐
  │   SSTable 10 GB  │                   Read cost:  L0 (a few) + L1 (1) + ...
  └──────────────────┘
  Read cost: a merge produces ONE
  large file; reads touch few files
  and can be satisfied by one.

  WRITE COST: high.                     WRITE COST: moderate (amortised).
    A rewrite can amplify: 1 GB + 1 GB   READ COST: high at L0, low at L1+.
    into 2 GB. Write amplification
    is 2× per tier crossed, and      L0 files OVERLAP — a key may be in
    a row updated many times can     several. The "read amplification" is
    be rewritten many times.           the number of L0 files plus 1 per level.
```

The trade in one line: **size-tiered is a write-optimised store with occasional large read
stalls; leveled is a read-optimised store with continuous background write work.**

| | Size-tiered (`STCS`) | Leveled (`LCS`) |
| --- | --- | --- |
| Optimised for | Write throughput | Read latency |
| Write amplification | High (up to ~10× over the base data in the worst case) | Lower, amortised across levels |
| Read amplification | Low — few, large files | Higher at L0, decreasing deeper |
| Latency profile | Bursty: fast, then a long compaction pause | Smooth: constant background I/O |
| Disk usage spikes | Large (old + new coexist) | Lower, more gradual |
| Good default for | Write-heavy, append-only, time-series | Read-heavy, mixed, latency-sensitive |
| Default in Cassandra | Yes | No (opt in per table) |

Cassandra also ships **time-window compaction (`TWCS`)**, which is size-tiered with the
buckets arranged by a time column, and it is the right answer for a table where rows expire
— because it means old data is compacted and dropped in whole buckets rather than
individually. It is the one strategy where the "expensive deletion" concern of the next
section largely disappears.

> **INTERVIEW TRAP — "COMPACTION RUNS IN THE BACKGROUND, SO IT DOESN'T AFFECT
> PERFORMANCE"**
>
> It is background *work*, which means it competes for the same disk bandwidth, and on a
> cluster that is write-throughput-bound the compaction queue is the first thing to fall
> behind. The failure chain is: writes arrive faster than compaction merges → the number
> of SSTables grows → reads must consult more files → read p99 climbs → and if it gets bad
> enough, memtables cannot flush fast enough, the commit log becomes the only copy of new
> data, and a node failure in that window is real data loss. So "compaction is background" is
> true in the same sense that "the garbage collector is background" is true in a JVM: it is
> background until it is not, and the metric that tells you which regime you are in is the
> compaction queue depth and pending bytes on the affected nodes. The staff-level version:
> compaction is a *capacity* problem wearing a latency costume, and the fix is a write-rate
> reduction, a better partition key, or TWCS for a TTL table — not a bigger `compaction
> throughput` setting.

### 5.5 Tombstones: Why Deletes Are Expensive

This is the trap this volume owns, and it is worth being able to explain from first
principles because the explanation is short.

A delete in a B+ tree removes a row, or marks a page free, and the space is reclaimed. A
delete in an LSM store **cannot remove anything**, because the row it needs to "remove" is
in an immutable SSTable that is also being read by someone else at this instant. So the
delete is written as a **tombstone**: a row with a deletion timestamp, which sorts *after*
the data row and wins the comparison at read time.

```text
  WHAT A DELETE LOOKS LIKE ON DISK
  ────────────────────────────────

  SSTable 3 (old)                 SSTable 8 (new)
  ┌──────────────────┐            ┌──────────────────┐
  │ pk=C ck=1  {...} │            │ pk=C ck=1  [DEL] │  ← tombstone,
  │ pk=C ck=2  {...} │            │ pk=C ck=5  {...} │    timestamp T
  │ pk=C ck=3  {...} │            └──────────────────┘
  └──────────────────┘
        │                                │
        └──── read: merge, newest wins ──┘
              ck=1 → gone.  But the tombstone
              is a row that must be read,
              compared, and eventually dropped.

  WHY IT IS NOT IMMEDIATE — gc_grace_seconds
  ─────────────────────────────────────────
  t=0        DELETE written at the coordinator
  t=0..10d   the tombstone must be kept, because a replica that
             (a) was down when the delete happened, and
             (b) comes back before hints expire,
             will still have the old row. If the tombstone were dropped
             now, that replica's resurrection would win and the row
             would come back from the dead. Forever.
  t=10d      gc_grace_seconds has elapsed → the tombstone is
             droppable, and compaction removes it and the data.
```

`gc_grace_seconds` (default 10 days) is therefore the delay before a tombstone may be
dropped, and it is a correctness parameter, not a tuning parameter. Setting it lower trades
a resurrection bug for a smaller tombstone count. The actual danger is a partition that
grows faster than compaction can clear it:

> **SCALING REALITY CHECK — Tombstone Accumulation**
>
> The failure signature is a partition in which **a large fraction of rows are tombstones**.
> Compaction then spends its I/O merging deletion markers instead of live data, reads of
> that partition get slower (more tombstone comparisons per row returned), and the
> compaction queue grows. In a Cassandra cluster under sustained delete traffic, a
> tombstone-heavy partition can be the whole story of a latency incident. Detection is
> `nodetool sstablesummary` (which reports estimated dropped and droppable tombstones) and
> `nodetool compactionstats`; the mitigation is a TTL (`default_time_to_live`) so that
> expiring rows are dropped by time-window compaction instead of by tombstone, or a
> partition key with enough cardinality that the delete ratio per partition stays low.
> The real root cause is almost always **deleting most of a partition** — a
> `DELETE FROM time_series WHERE pk = ?` that removes 90% of rows leaves a partition that
> is 90% tombstone and gets slower for the next `gc_grace_seconds` even though it is
> nearly empty.

### 5.6 Read Repair, Hinted Handoff, and "Consistency Is a Background Process"

Three mechanisms finish the consistency story, and all three are *repair* — which is the
framing that makes eventual consistency honest rather than mystical.

**Read repair.** When a read returns data from more than one replica (which is what
happens at `QUORUM`, and probabilistically at `ONE` with `read_repair_chance`, default
10%), Cassandra compares the versions. If a replica is behind, the coordinator
**reconciles it** — merges the newer data back and writes it to the lagging replica. This
is why a `QUORUM` read is not just a slower read; it is a read that repairs on the way
past. The cost is real: a read that discovers divergence performs writes, so read p99 has
a tail caused by repair, and a cluster that is *persistently* divergent pays a repair tax on
every read until the divergence is gone.

**Hinted handoff.** When a write's coordinator cannot reach a replica because it is down,
it stores the mutation as a **hint** in a small internal table, and returns success at the
required consistency level as long as the quorum was satisfied. When the node returns,
cumulative hints are replayed to it. This is what makes a `QUORUM` write succeed during a
single-node failure — and it is also a silent correctness dependency: hints are only
replayed while the node is down for *less than* `gc_grace_seconds`. A node that is down
longer needs `nodetool repair`, which is a full, streaming, range-by-range reconciliation —
and a repair that has never been run on a large cluster is a repair whose runtime nobody can
estimate.

**Anti-entropy repair.** `nodetool repair` is the manual, explicit version. It is essential,
it is expensive, and it should be scheduled per node in small ranges rather than run across
the whole keyspace at once — which is why it is a recurring operational chore with its own
alerting, not a thing you remember to do.

> **MUST REMEMBER**
>
> **Eventual consistency in Cassandra is a background process, not a promise.** There is no
> timer, no bound, and no guarantee written into the protocol. What exists is: quorum reads
> repair on the way past, hinted handoff replays missed writes when a node returns, and
> `nodetool repair` is the backstop that nothing triggers for you. Convergence is a property
> of operations that are running, and the correct interview sentence is: "eventual
> consistency here means repair-on-read plus hinted handoff plus a scheduled repair, and I
> monitor the divergence and the repair backlog, and if a replica is down longer than
> `gc_grace_seconds` I need to run repair explicitly." That sentence contains four
> mechanisms and two monitoring signals, and it is the difference between having used
> Cassandra and having read about it.

#### Common Mistakes

- Describing compaction as free background work — it competes for the same I/O and the
  queue depth is the metric that tells you whether you are keeping up
- Believing a delete removes data — it writes a tombstone, which is a row, which must be
  read, compared and eventually dropped
- Not being able to explain what `gc_grace_seconds` is protecting against
- Treating a `QUORUM` read as just a slower read — it is a read that also performs writes
  when it finds divergence
- Assuming hinted handoff will fix a node that has been down for a week
- Saying Cassandra is "eventually consistent" and stopping, without naming the three
  mechanisms and the two metrics

#### Interview Questions — Cassandra Architecture

**Q1. Walk me through a Cassandra write and tell me where the durability guarantee comes
from.** `ADVANCED`

The coordinator hashes the partition key with Murmur3, maps the token to a token range, and
looks up the replicas from its gossiped ring metadata — no registry service, every node
knows the topology. It then checks the consistency level: at `QUORUM` with RF=3 it needs
2 of 3 acknowledgements and will fail if only one replica is reachable, which is the
"consistency" half of the CAP trade. Each replica appends the mutation to its **commit
log** and then updates its in-memory **memtable**; the commit log is what makes the write
durable, and it is the reason a memtable write is not lost if the process dies. When the
memtable hits its size threshold it is flushed to an immutable, sorted **SSTable** with an
index and a bloom filter, and the corresponding commit log segment is truncated. From then
on the data lives in the SSTable and only **compaction** is still working, in the
background. If a replica is down, the coordinator stores a **hinted handoff** entry and,
provided the quorum was met, returns success.

**Q2. Why are deletes expensive in Cassandra, and what is `gc_grace_seconds` for?**
`STAFF`

Because an LSM store cannot modify or remove anything in an existing SSTable — the files
are immutable and being read concurrently. So a delete is written as a **tombstone**: a
row with a deletion timestamp that sorts after the data and wins the read comparison. That
tombstone is a row, and it must be read, compared, and merged on every read of that
partition until it is dropped. `gc_grace_seconds` (default 10 days) is the minimum time a
tombstone must be retained, and the reason is a resurrection bug: if a replica was down
when the delete happened and comes back within that window, hinted handoff will replay the
old row to it, and if the tombstone had already been dropped, the resurrected row would win
and the data would come back. So the parameter is a correctness guarantee about a
reordering, and lowering it to reduce tombstone count is a trade of a subtle data bug for
a storage problem.

**Q3. Size-tiered versus leveled compaction — when do you choose which?** `TRICKY`

Size-tiered optimises for write throughput: it merges N similarly-sized SSTables into one
large file, so reads touch few files and can be satisfied by a single large sequential
scan, at the cost of high write amplification (data is rewritten as it crosses tiers, and a
row updated many times gets rewritten many times) and bursty latency, because a tier merge
is a long I/O pause. Leveled optimises for read latency: it keeps newer data in a small
overlapping L0 and merges it into large, mostly non-overlapping L1+ files, so a read is L0
plus one file per level, at the cost of continuous background write work. I choose
size-tiered for append-only and time-series workloads where the working set is recent data,
leveled for read-heavy, latency-sensitive, mixed workloads, and time-window for a table
with a TTL, because it lets whole time buckets be expired and dropped rather than
tombstoned one row at a time. And I would check the current default rather than assume it,
because it has moved between major releases.

**Q4. A node in your Cassandra cluster has been down for four days and has come back. What
happens, and what do you check?** `SCENARIO`

It comes back into the ring and starts receiving reads and writes for its token ranges
immediately, and that is the risk. Writes that happened while it was down may have been
covered by hinted handoff, but only if it was down for less than `gc_grace_seconds` —
10 days by default, so four days is inside the window and replay should happen
automatically, though I would verify it rather than assume, because hint delivery is
best-effort. What is *not* automatic is the full range reconciliation: `nodetool repair`
is the explicit anti-entropy pass that compares SSTables range by range and repairs
divergence, and a cluster where repair has never been scheduled is a cluster with unknown
divergence. I would check the node's compaction queue and pending bytes first (a node
returning with a backlog is a compaction-storm risk for the whole ring), then run a repair
for that node's ranges in a throttled window, and add both "node returned" and
"compaction queue depth" to the alerts so the next occurrence is a ticket rather than a
surprise.

> **CHAPTER 5 SUMMARY**
>
> Cassandra is a log-structured merge tree, and every operational question follows from
> that one fact: writes are sequential and cheap, reads are searches across immutable
> files. The write path is coordinator → commit log → memtable → flush to SSTable, with
> bloom filters and a partition index keeping the read from degenerating into a scan of
> every file, and compaction — size-tiered for write throughput, leveled for read latency,
> time-window for expiring data — as the only thing reducing the file count. Deletes are
> writes: a tombstone is a row that must be read and compared until `gc_grace_seconds`
> passes, and a partition that is mostly tombstones is a compaction and latency problem
> with no error message. And eventual consistency here is a *process*, not a promise:
> read repair, hinted handoff and scheduled `nodetool repair` are three mechanisms that run
> only if they are running, which is why the honest answer names the mechanisms and the
> metrics rather than saying the word.

#### Further Reading

- [Apache Cassandra — Data Storage](https://cassandra.apache.org/doc/latest/cassandra/architecture/datatransfers.html) — the official account of the SSTable, memtable and commit log, and of what compaction does.
- [Apache Cassandra — Compaction](https://cassandra.apache.org/doc/latest/cassandra/operating/compaction.html) — the documented strategies, their trade-offs, and the compaction-queue and pending-bytes metrics.
- [Apache Cassandra — Hinted Handoff](https://cassandra.apache.org/doc/latest/cassandra/operations/hinted_handoff.html) — the official statement of when hints are dropped and when repair becomes your job.
- [Apache Cassandra — Consistency Levels](https://cassandra.apache.org/doc/latest/cassandra/dml/consistency.html) — quorum definitions, `LOCAL_QUORUM`, `EACH_QUORUM`, and the serial levels.
- [The Log-Structured Merge-Tree (O'Neil et al.)](https://www.cs.cmu.edu/~dcs765/papers/1996-culwick.pdf) — the original paper; the compaction strategies in current Cassandra are descendants of this.

## Chapter 6 — Cassandra: Data Modelling

### 6.1 Denormalisation First, and Why It Is Not a Compromise

A relational engineer arrives with a deep, well-earned instinct: normalise the schema, and
normalise it further when you find a transitive dependency. In Cassandra that instinct is
actively harmful, and understanding *why* is the whole chapter.

The reason is the query model. A relational engine can join at read time because it has a
query planner, indexes on every column, and no requirement to know in advance what queries
will arrive. Cassandra has **no join**, and it has a hard rule that a query must be able to
locate data by its partition key. The consequence is that anything you want to query
without a full scan must be *pre-joined at write time*. Denormalisation in Cassandra is not
a performance optimisation you apply after profiling — it is how you express a
relationship at all.

> **MUST REMEMBER**
>
> In Cassandra, a duplicate is cheaper than a join. Every place you would have written
> `JOIN`, you write the same fact in two tables, and you accept the write-path cost and the
> eventual consistency of the duplicate. The question is never "is this duplication
> acceptable" in the abstract — it is always "which queries justify this duplicate, and how
> stale may it be?"

### 6.2 Query-First Modelling: Design From the `WHERE` Clause Backwards

This is the rule that separates a Cassandra data model that works from one that looks like
a relational schema dumped into CQL. **You do not design the tables and then write the
queries. You write the queries first — as `WHERE` clauses — and then design one table per
query.**

The procedure, and it is mechanical:

1. **Write every query as a `WHERE` clause, with a consistency level and an expected rate.**
   Not in prose — literally `SELECT ... WHERE a = ? AND b > ? AND c < ?`, with the rate
   next to it. If the list does not fit on a page, the model is not designed.
2. **For each query, ask what Cassandra can serve it in one hop.** If the query can be
   answered by equality on the partition key plus a range or a set of clustering columns,
   it is a point read against one node. If not, it is a fan-out across the ring, and a
   fan-out over a large table is a denial-of-service against yourself.
3. **Make that query a table.** One table per query pattern. The columns are whatever the
   query needs — including the denormalised copies, including a `bucket` column if the
   result is big enough to need page-splitting.
4. **Write to two tables in one operation.** Not a transaction, not a trigger — two
   statements, with a deliberate acknowledgement strategy (more in 6.7).

The example that makes it concrete. A product catalogue with these four queries:

```sql
-- Q1  by SKU                 ~200/s
SELECT * FROM products_by_sku WHERE sku = ?;

-- Q2  by category, newest    ~5,000/s
SELECT * FROM products_by_category
  WHERE category = ? AND created_at > ? ORDER BY created_at DESC LIMIT 20;

-- Q3  full-text search       ~500/s
SELECT * FROM products_by_name WHERE name = ?;      -- exact name lookup only

-- Q4  by tag                 ~100/s
SELECT * FROM products_by_tag WHERE tag = ? AND created_at > ?;
```

Four tables, four query patterns, and a denormalised copy of the product row in each. Note
what is *not* there: a `tags` array inside the product row that you would have to scan. A
multi-valued column you intend to filter on is a table.

```sql
CREATE TABLE products_by_sku (
  sku          text PRIMARY KEY,
  name         text,
  category     text,
  tags         set<text>,
  price_cents  int,
  created_at   timestamp
);

CREATE TABLE products_by_category (
  category     text,
  created_at   timestamp,
  sku          text,                    -- the clustering of the parent identity
  bucket       int,                     -- for large categories: 0, 1, 2 ...
  name         text,
  price_cents  int,
  PRIMARY KEY ((category, bucket), created_at, sku)
) WITH CLUSTERING ORDER BY (created_at DESC, sku ASC);

CREATE TABLE products_by_tag (
  tag          text,
  created_at   timestamp,
  sku          text,
  name         text,
  PRIMARY KEY ((tag), created_at, sku)
);
```

### 6.3 The `WHERE`-Clause-Is-the-Primary-Key Rule

The rule, stated as the constraint it actually is: **Cassandra can only use the columns you
put in the `WHERE` clause to locate data if those columns are in the primary key.** Adding a
predicate on a non-key column later is not a query change — it is a schema migration, and
in practice it means writing a new table and backfilling it.

```sql
-- This is a full scan of the partition, silently.
SELECT * FROM products_by_category WHERE category = 'tools' AND price_cents < 5000;
--                                          ^^^^^^^ key       ^^^^^^^^^^ NOT a key
-- Cassandra: "WHERE clauses with non-primary key columns are not supported"
--   ...unless you add ALLOW FILTERING, which is a different answer (see 6.6).
```

What the statement means practically: **the shape of your read path is fixed at table
creation.** A query you can write in five minutes in SQL is a table, a backfill, and a
dual-write in Cassandra. That is the honest cost of the model, and it is why "we'll add a
query later" is not a plan.

> **TRADE-OFF — One Big Table vs Many Narrow Tables**
>
> The tempting move is one `products` table with a JSON-ish wide row and a few secondary
> indexes, to avoid writing four times per product. The flip condition is the read pattern:
> if every query really is "fetch one product by SKU" and nothing ever filters, one table
> with a handful of extra columns is simpler and fine. The moment a query needs a filter
> on a non-key column, the choice is forced — a second table, a secondary index (6.5), or
> `ALLOW FILTERING` (6.6), and all three are worse than the denormalised table you did not
> write. And the write cost of the many-table design is a per-write amplification you can
> measure and budget, against a read path that is a point lookup forever.

### 6.4 Clustering Keys and the Ordering They Give You Free

A primary key in Cassandra is `(partition key), clustering column, clustering column`, and
the clustering columns do two jobs: they identify rows *within* a partition, and they
**order** them. Rows are stored sorted by the clustering columns, so `ORDER BY` on a
clustering column is free — the data is already in that order, and the query is a range
scan over adjacent rows.

```text
  ONE PARTITION, STORED ON DISK IN CLUSTERING ORDER
  ───────────────────────────────────────────────
  category='tools', bucket=0

  created_at DESC, sku ASC
  ─────────────────────────────────
  2026-09-20 19:02  SKU-8812   tools/bucket=0/...
  2026-09-19 11:40  SKU-8801   tools/bucket=0/...
  2026-09-18 08:15  SKU-8743   tools/bucket=0/...
  2026-09-14 16:55  SKU-8690   tools/bucket=0/...
  ...

  "newest 20 in category tools"
    → LIMIT 20 after the partition key match
    → reads 20 adjacent rows, one node, one SSTable scanner
    → no sort step, no merge, no scatter-gather
```

Two design consequences that candidates miss:

1. **`ORDER BY` on a non-clustering column is not supported.** Ordering is a property of
   the key, not of the query. If you need a different sort order, that is a different
   table, and the trade-off is duplicated writes against a free ordered scan.
2. **The clustering order is a page design decision.** `CLUSTERING ORDER BY (created_at
   DESC)` with a `LIMIT` gives you a newest-first feed. The same table with `LIMIT` on the
   *oldest* end is a different table, because the scan direction is fixed by the storage
   order. Time-ordered data plus a limit is the single most common Cassandra table shape,
   and the most common reason a "slow query" is actually a missing clustering order.

### 6.5 Secondary Indexes: Local, Per-Node, and Fragile

A Cassandra secondary index (2i) is a **local index on each node** over that node's local
data. The consequence is structural, and it is the reason they are discouraged at scale:

- A query on an indexed non-key column must be sent to **all replicas of every partition**
  that might contain a match. With N partitions, that is a coordinator fanning out to N×RF
  nodes. The query stops being a point read and becomes a ring-wide scatter-gather, and its
  latency is the slowest node in the fan-out.
- **All replicas of the base table's data must be up** for the query to answer correctly,
  because a down replica means an unknown gap in the index, and Cassandra will not return a
  possibly-incomplete answer by default.
- Modern Cassandra (3.0+) requires a **partition key restriction** even on a
  secondary-index query — the "index-only" full-table index scan was removed — so a 2i
  query is still bounded by a partition, which already required denormalising.
- Custom indexes can be per-cell, and their cost is a hidden function call on the write
  path of every row.

The rule of thumb that has survived practice: **use a secondary index for a small,
bounded, low-cardinality lookup — a status column, a boolean flag, a tenant id — and never
for anything on a query's hot path.** A secondary index on a column that 40% of your reads
filter on is a fan-out on 40% of your reads.

> **INTERVIEW TRAP — "WE ADDED AN INDEX ON THE STATUS COLUMN, WHY IS IT STILL SLOW?"**
>
> Because a Cassandra secondary index is a *local* index on each node, not a global one, so
> answering the query means fanning out to the replicas of every partition that could hold a
> match — turning a point read into a ring-wide scatter-gather whose latency is the slowest
> participant. And Cassandra will not return a partial answer: the query requires all
> replicas to be up, because a down replica is an unknown gap. The fix is not a better
> index; it is a table. `status` is a low-cardinality column, and low-cardinality columns
> make excellent *partition* keys in a dedicated table (`WHERE status = ? AND updated_at >
> ?`), where the query is one partition, one range, one node. Secondary indexes are for
> convenience lookups on small tables; the moment a query is on the hot path, it becomes a
> table.

### 6.6 `ALLOW FILTERING`: The Trap

```sql
-- Do not do this. Do not do this. Do not do this.
SELECT * FROM products_by_category
  WHERE category = 'tools' AND price_cents < 5000
  ALLOW FILTERING;
```

What `ALLOW FILTERING` does is tell Cassandra: *apply the non-key predicate yourself, after
reading rows from the partition.* It converts a targeted read into a read of the whole
matching partition followed by a client-side filter. So:

- It reads **every row in the partition** and then throws most of them away. The cost is
  proportional to partition size, not result size.
- On some nodes it may still fail with an inconsistent result, and the behaviour is
  version-dependent and not something to rely on.
- Modern Cassandra **emits a warning for every such query**, and in recent versions and
  drivers, filtering against a secondary index in particular is rejected outright. It is
  not a production tool.

The honest framing in an interview: `ALLOW FILTERING` is a *development* affordance that
lets you see data while you are exploring, and in production it is a full partition scan
with a filter bolted on. The only correct use is on a table small enough that the scan is
irrelevant, which is a table that should not have been in Cassandra.

### 6.7 Consistency Levels: The Latency Trade, and the Read-Repair Cost

```text
  CONSISTENCY LEVELS (RF = 3)
  ─────────────────────────────

  level            replicas must ack    reads contact    typical use
  ───────────────  ───────────────────  ───────────────  ───────────────────
  ANY              1 for writes*        1                hinted-handoff only
  ONE              1                    1                default; fast, may be stale
  TWO              2                    2                explicit majority
  THREE            3                    3                rarely sensible
  QUORUM           2 (floor(RF/2)+1)    2                the default write level
  ALL              3                    3                almost never for writes
  LOCAL_QUORUM     2 within one DC      2                multi-DC; avoids cross-DC RTT
  EACH_QUORUM      2 in every DC        2 per DC         global writes
  SERIAL           Paxos                1 (coordinator)  LWT; read-your-writes

  * ANY is a write that only needs one replica and stores a hint for the rest.
```

The arithmetic that has to be right: **`QUORUM` with RF=3 is 2 of 3.** The formula is
`floor(RF/2) + 1`, so RF=3 → 2, RF=5 → 3, RF=2 → 2 (and RF=2 is why you cannot tolerate a
single node failure — a quorum of 2 of 2 is unavailable if one node is down), RF=1 → 1.

Three latency facts that separate a staff answer from a mid-level one:

1. **`ONE` and `QUORUM` within one DC are both about one RTT.** Cassandra contacts replicas
   in parallel and waits for the required count, so a `QUORUM` read in a single-DC cluster
   is *slightly* more expensive than `ONE` — more nodes, more network, but no extra round
   trip. The RTT difference shows up in **multi-DC** deployments, where `QUORUM` that
   spans data centres pays the inter-DC latency, and `LOCAL_QUORUM` is the answer.
2. **A `QUORUM` read also pays the read-repair cost.** If replicas have diverged, the read
   reconciles them — which is writes during a read. So the tail latency of a `QUORUM` read
   is a function of how divergent your cluster is, which is an operational property, not a
   code one. A cluster that has never been repaired has a permanently expensive read path.
3. **`ALL` on writes is nearly always wrong.** It maximises the C half at the cost of
   availability (any single node down and writes fail) and it does not add a meaningful
   consistency guarantee over `QUORUM` — the quorum intersection already gives you
   linearizable-ish behaviour for the read that matters. `ALL` is also not supported for
   writes in some configurations precisely because it defeats the purpose of replication.

And the write side, which is where the interesting design work is:

```text
  WRITING TO TWO TABLES (denormalised) AT DIFFERENT LEVELS
  ─────────────────────────────────────────────────────────

  Option A — both at QUORUM:
    Strong on both. The two tables can still disagree, because "written
    to both" is not "atomically written to both" without a transaction.
    Cassandra has no cross-partition transaction.

  Option B — primary table at QUORUM, secondary at ONE:
    Fast and cheap. The two tables disagree for as long as the
    secondary takes to repair — bounded by nothing you control.
    Correct only if the secondary is genuinely a read-optimised copy
    whose staleness is acceptable.

  Option C — batch / unlogged batch across tables in the SAME partition:
    A logged BATCH is a distributed transaction across replicas
    (LWT-like, expensive, 50% write-overhead penalty in the docs).
    An unlogged batch is only a hint to send together. Use it for
    small batches in one partition; it is not a transaction.

  The staff-level answer: state which of these you chose, and say what
  the window of disagreement is. "Denormalised" with no level named is
  an incomplete design.
```

> **PRODUCTION RELEVANCE**
>
> The most common Cassandra production bug is not a performance problem, it is a
> *consistency* problem that nobody named: a write to the primary table at `QUORUM` and a
> write to the denormalised table at `ONE`, and a read path that mixes them. Then a read
> that joins the two client-side returns a state that never existed — a product whose price
> is from the current row and whose stock count is from four seconds ago. The database is
> correct at every level you asked for. The design is the bug, and it is invisible until
> the two tables are read together.

> **STAFF-LEVEL CONSIDERATION**
>
> The data model in Cassandra is the artefact that determines whether the team can onboard,
> because it is what a new engineer has to hold in their head. Two tables that are written
> together and read separately are not two tables — they are one *logical* entity with a
> consistency contract, and a good team names that entity and that contract. The practice
> that pays for itself: every denormalised table gets a comment naming (a) the query pattern
> it serves, (b) the table it is derived from, (c) the write order, and (d) the acceptable
> staleness. When an incident happens at 2am, that comment is the difference between a
> diagnosis and a guess, and it costs four lines per table.

#### Common Mistakes

- Designing the schema first and the queries second — the whole model is backwards
- Treating a `WHERE` predicate on a non-key column as a query change rather than a schema
  migration
- Reaching for a secondary index on a hot-path column and then discovering the fan-out
- Using `ALLOW FILTERING` as a shortcut and calling it a query
- Assuming a "denormalised" write is a consistent write — it is two writes, and only you
  know the levels and the window
- Forgetting that `ORDER BY` only works on clustering columns
- Claiming `QUORUM` costs two round trips — it is one RTT with more nodes attached, and it
  is *cross-DC* where the cost really appears

#### Interview Questions — Cassandra Data Modelling

**Q1. Explain the query-first rule and why it exists.** `STAFF`

Cassandra has no join, and a query can only locate data by its partition key, so anything
you want to filter on has to be in the primary key or it is a scan. That means the read
path is fixed at table-creation time, so the model has to be derived from the reads. The
procedure: write every query as a `WHERE` clause with its expected rate, ask whether
Cassandra can answer it with a partition key plus a clustering range, and if yes make it a
table. You get one table per query pattern, denormalised, written to together. The cost is
honest and worth stating: you write the same fact several times, the duplicates can
disagree, and the write amplification is a real bill — but a point read is a point read
forever, and no amount of clever key design will make a fan-out into one.

**Q2. Why are Cassandra secondary indexes discouraged?** `ADVANCED`

Because a secondary index is a *local* index on each node, not a global one. Answering a
query on an indexed non-key column requires the coordinator to fan out to the replicas of
every partition that could contain a match, so a point read becomes a ring-wide
scatter-gather whose latency is the slowest participant, and all replicas must be up or
Cassandra will not return a possibly-incomplete answer. Since 3.0 the index does not even
give you a whole-table scan — a partition key restriction is still required — so you have
already denormalised and the index is buying you a small convenience. They are fine for a
bounded, low-cardinality, non-hot-path lookup and dangerous for anything else, and the
right response to a hot-path 2i query is a dedicated table keyed on the filter column.

**Q3. What does `QUORUM` mean at RF=3, and what does it cost?** `TRICKY`

Two of three — the formula is `floor(RF/2) + 1`, so RF=3 gives 2, RF=5 gives 3, and RF=2
gives 2, which is precisely why RF=2 is not survivable: a quorum of 2 of 2 is unavailable
if one node is down. The cost is three things. (1) It contacts two replicas instead of one,
which in a single-DC cluster is still about one round trip because they are contacted in
parallel, so the read latency difference is modest — the big difference appears in
multi-DC, where a `QUORUM` spanning data centres pays the inter-DC RTT and
`LOCAL_QUORUM` is the answer. (2) A `QUORUM` read performs **read repair**: it compares
versions and writes back to any replica that has fallen behind, so the read is also a
write, and the tail latency is a function of how divergent the cluster is. (3) A `QUORUM`
write means a partition with one unreachable replica cannot accept writes, which is the
consistency half of the CAP trade and is why a team that claims "we are AP" and writes at
`QUORUM` has described itself imprecisely.

**Q4. You need to denormalise a customer name into three tables. How do you keep them
agreeing?** `SCENARIO`

I would say, first, that agreement is the wrong goal — a cross-partition transaction does
not exist, so "agreeing" means bounding the window. The design is: the primary table is the
source of truth and is written at `QUORUM`; the two read-optimised copies are written at
`ONE` or `TWO`, which is fast and cheap and converges via hinted handoff and read repair.
Then the read paths that touch more than one table are the thing to design, and that is
where a staff answer earns its keep: either the read is served entirely from one table (so
the copies are independent and no join is needed), or the read merges the copies in the
application and the merge is *tolerant* — it does not assume the copies are in sync, it
takes the newest version it can see, and it treats a missing copy as absent rather than as
zero. And I would add the operational bit: a staleness alert on the copy tables, because a
projection that silently stops converging is a support ticket that arrives as "the name is
wrong" six weeks later.

> **CHAPTER 6 SUMMARY**
>
> Cassandra's data model is derived from its read paths, not from entity relationships. You
> write every query as a `WHERE` clause first, you get one table per query pattern, you
> denormalise because there is no join, and you accept that a predicate on a non-key column
> is a schema migration rather than a query. Clustering keys give ordered range scans for
> free, which is what makes the "newest N" table shape fast. Secondary indexes are local,
> per-node, require all replicas up, and turn a point read into a fan-out, so they are for
> bounded convenience lookups only. `ALLOW FILTERING` is a partition scan with a filter
> bolted on and is not a production tool. `QUORUM` at RF=3 is 2 of 3, costs more nodes than
> `ONE` in the same round trip, and pays a read-repair cost on every read that finds
> divergence — and the denormalised writes are two writes, not one, so the consistency
> levels and the acceptable staleness window are part of the design, not an afterthought.

#### Further Reading

- [Apache Cassandra — Data Modelling](https://cassandra.apache.org/doc/latest/cassandra/data-modeling/index.html) — the official query-first workflow, denormalisation guidance and the `WHERE`-clause rules.
- [Apache Cassandra — Indexes](https://cassandra.apache.org/doc/latest/cassandra/cql/indexes.html) — what a local 2i index does, the partition-key restriction, and why the docs are cautious about them.
- [Apache Cassandra — Filtering](https://cassandra.apache.org/doc/latest/cassandra/cql/select.html) — the official statement of what a `WHERE` clause may contain and what `ALLOW FILTERING` actually costs.
- [Apache Cassandra — Clustering Keys and `CLUSTERING ORDER`](https://cassandra.apache.org/doc/latest/cassandra/cql/clustering.html) — why ordering is a property of the key, and how `LIMIT` becomes a range scan.
- [DataStax — Data Modelling for Apache Cassandra](https://www.datastax.com/devacademy/data-modeling) — the fullest worked treatment of the query-first workflow, including the bucket pattern for unbounded partitions.

## Chapter 7 — DynamoDB: Architecture & Data Model

### 7.1 What Is Documented and What Is Inferred

This chapter has an honesty obligation that Cassandra's does not, and a good candidate
volunteers it before being asked. DynamoDB is a **managed service**, so parts of its
internals are a public design lineage and parts are a vendor implementation detail you
cannot audit. Being clear about which is which is itself a staff-level signal.

**What is documented public interface:** the data model (tables, items, attributes,
key schema), the API semantics, consistency behaviour, the capacity model and its
accounting rules, the transactional and streaming APIs, the global-table behaviour, TTL,
and the per-partition limits. Everything in this chapter that you would write in a design
document is in this category.

**What is the published design lineage:** the 2007 Dynamo paper describes a system built
from a consistent-hash ring with virtual nodes, each data item replicated `N` times across
preference lists, each node using a key/value store over a log plus a RAM cache, with
quorum versions `W` and `R`, Merkle-tree anti-entropy, and vector clocks. DynamoDB's
service documentation is consistent with that lineage — it documents that it partitions
your data using a hash of the partition key and replicates each partition across three
Availability Zones, and it publishes a 700 KB per-item size limit, a 10 MB per-partition
limit, and the per-partition throughput ceilings.

**What is not a documented public interface, and should be stated as inference:** the
exact hash function, the physical file format of the storage node, whether a given
DynamoDB deployment still runs the Dynamo-era log-and-cache engine (it does not, and
nobody outside Amazon knows what it runs now), and any claim that "each storage node holds
a B+ tree of sort keys". Use this chapter to explain the *design reasoning* — the hash,
the replication group, the quorum, the sort-key ordering — and be explicit that you are
reasoning from the paper and the documented contract, not from a source you have read.

> **INTERVIEW TRAP — DESCRIBING DYNAMODB'S INTERNALS AS IF THEY WERE DOCUMENTED**
>
> The trap is a confident, detailed account of a storage node's on-disk structure. It
> sounds like expertise, and it is guesswork dressed as expertise, and a DynamoDB
> interviewer will ask "where did you read that?" The senior move is to draw the
> *documented* design — hash of the partition key to a physical partition, replicated
> across an AZ quorum, items with an optional sort key ordered within the partition,
> quorum reads and writes — and to say explicitly which parts come from the Dynamo paper
> as a published design lineage and which are Amazon's current implementation. Being
> precise about the boundary is the answer, not a hedge around it.

### 7.2 The Data Model, Term by Term

| Term | What it is | What it is not |
| --- | --- | --- |
| **Table** | The container, with a declared key schema. Has provisioned or on-demand capacity, and optionally GSIs, LSIs, a stream, and TTL | Not a relation. No cross-item constraints, no foreign keys, no triggers |
| **Item** | A set of attribute–value pairs. **Maximum 400 KB** | Not a row with a fixed shape. Attribute names and types vary per item |
| **Attribute** | A name–value pair. Values are typed (S, N, B, BOOL, NULL, L, M, SS, NS, BS) | Not a column. Only the key attributes have a declared type |
| **Attribute definition** | The declared type of the attributes used in the key schema | Not a schema for the item. Non-key attributes are untyped and unvalidated |
| **Partition key** | One attribute, whose value is hashed to select a physical partition. Must be a `S`, `N` or `B` | Not a bucket you control the size of. Hashing is the documented behaviour |
| **Sort key** | Optional second key attribute. Items with the same partition key are ordered by it | Not an index. It defines the *only* order within a partition |

Two facts that catch people out:

1. **Only key attributes are declared.** Everything else is untyped and undeclared, so the
   "schema" of a DynamoDB table is a key schema and nothing more. You cannot add a
   constraint, and a service that writes a string where a number is expected is not
   rejected by the database.
2. **The item size limit is 400 KB** and a single partition is limited to 10 MB of data —
   which is a *storage* ceiling and, as Chapter 4 established, a storage ceiling is a
   throughput ceiling in waiting. A "one table with an array of everything" design hits
   both limits, and it hits them in production rather than in a test.

### 7.3 The Key Schema, and "Schemaless" Being a Misnomer

> **INTERVIEW TRAP — "DYNAMODB IS SCHEMALESS"**
>
> It is a misnomer, and saying so is one of the easiest ways to demonstrate that you have
> actually used it. What you have done is *relocated* the schema, not removed it. You
> have designed a **key schema** (partition key, sort key, their types, their order) and an
> **access-pattern set** (every query the system serves, each expressed as a partition key
> equality plus an optional sort key condition), and you have written both in application
> code and in a design document rather than in DDL. The discipline is identical — a bad
> key schema is exactly as expensive here as a bad `CREATE TABLE` is in Postgres, and the
> fix is the same data migration plus dual-write. What you genuinely gain is the ability to
> add a *non-key* attribute to an item without a schema change; what you have lost is the
> database's ability to tell you the attribute is the wrong type, and every index you would
> have declared as `CREATE INDEX`.

The physical layout, as far as it is documented and as far as the design reasoning supports:

```text
  LOGICAL                        PHYSICAL (documented contract + design lineage)
  ────────                       ─────────────────────────────────────────────

  Table: sessions
  ┌────────────────────────┐     hash("PK") → physical partition 0x4f2a...
  │ PK        SK    data   │
  │ ───────── ──── ──────  │        ┌─────────────────────────────────────┐
  │ user#1    2026-09-01  │ ───►  │ PHYSICAL PARTITION 0x4f2a            │
  │ user#1    2026-09-05  │     │  ┌───────────────────────────────┐    │
  │ user#1    2026-09-12  │     │  │ sorted by SK:                │    │
  │ user#7    2026-09-02  │     │  │  2026-09-01  {...}           │    │
  │ user#7    2026-09-11  │     │  │  2026-09-05  {...}           │    │
  └────────────────────────┘     │  │  2026-09-12  {...}           │    │
                                │  └───────────────────────────────┘    │
                                └──────────────┬──────────────────────┘
                                               │  replicated
                        ┌──────────────────────┼──────────────────────┐
                        ▼                      ▼                      ▼
                 ┌────────────┐          ┌────────────┐          ┌────────────┐
                 │ AZ replica │          │ AZ replica │          │ AZ replica │
                 │  (1 of 3)  │          │  (2 of 3)  │          │  (3 of 3)  │
                 └────────────┘          └────────────┘          └────────────┘

  A Query is:  PK = user#1 (exact)
               AND SK BETWEEN a AND b  (optional range)
               → hash to one partition → one replica group
               → ordered scan of the sort key range

  Per-partition ceilings (documented):
    • 10 MB of stored data per partition
    • 400 KB maximum item size
    • ~1,000 WCU/s and ~1,000 RCU/s (3,000 RCU/s for strongly consistent reads)
```

The sort key is the feature that makes this usable rather than merely distributed, and it
is under-used. `SK = created_at` with a descending range gives a newest-first feed for one
user in one partition. `SK = order_id` gives a per-user order list. And a composite sort
key — `SK = "ORDER#" + zero-padded-sequence` — gives a *type-prefixed* stream, so one table
can serve "all orders then all refunds" with the ordering encoded in the key, which is the
single-table design's central trick and Chapter 8's subject.

### 7.4 Physical Design Reasoning: Why the Hash and Why Three AZs

The design decisions worth being able to reason about, each with its cost:

**Why a hash of the partition key?** Because it makes distribution even without any
coordination, and evenness is what keeps a cluster's nodes equally loaded. A range-based
layout would make the newest keys land on one node, and the whole hot-partition problem
would be manufactured by the key space. The cost is that ordering must be re-introduced
explicitly, via the sort key — which is exactly why the sort key exists and why
"partition key plus sort key" is the whole design surface.

**Why three replicas across three AZs?** Two reasons that are separable. *Availability
during correlated failure*: a single AZ outage takes out one replica, leaving a quorum. A
cross-AZ layout is a deliberate purchase, and the bill is inter-AZ round-trip latency on
every quorum operation, which is why strongly consistent reads are measurably slower in a
multi-AZ table. *Durability*: three copies means a quorum write is durable against the
loss of two. And the quorum structure is what makes reads and writes *consistent* at all —
W + R > N, which is the condition from the Dynamo paper, and the reason the read path can
be told to wait for agreement.

**Why is the item size limit 400 KB and the partition limit 10 MB?** Because a partition is
the unit of distribution, and an unbounded unit is a design that cannot be rebalanced. The
limits force the design to say up front how much data one key's world can hold, which is
the discipline the whole model depends on. A design that hits 10 MB in production is a
design whose partition key was chosen before anyone knew the access pattern.

> **SCALING REALITY CHECK**
>
> The numbers to carry: **400 KB per item**, **10 MB per partition**, **1,000 WCU/s and
> 1,000 RCU/s per partition** (AWS documents up to 3,000 RCU/s on a single partition for
> strongly consistent reads). The 10 MB partition limit is the one that is easiest to
> discover late, because a partition that grows slowly crosses 10 MB after a year and
> starts throwing `ValidationException` on the *item* that pushed it over. The mitigation is
> structural — a time-bucketed sort key (`SK = "2026-09-25#ORDER#000123"`) so that old data
> ages into its own sort-key prefix and can be archived or expired, and a `TTL` so the
> data goes away on a schedule rather than accumulating.

#### Common Mistakes

- Calling DynamoDB "schemaless" — you designed a key schema and an access-pattern set, you
  just wrote it in the client
- Describing the storage node's on-disk structure as if it were documented
- Confusing the 400 KB item limit with the 10 MB partition limit
- Assuming a `Query` can filter on a non-key attribute without a GSI
- Forgetting that sort-key ordering is the *only* ordering, and a range condition on the
  sort key is the only way to get a range
- Treating the three-AZ layout as free — it is an inter-AZ latency bill on quorum operations

#### Interview Questions — DynamoDB Architecture & Data Model

**Q1. Explain the DynamoDB data model and the role of the key schema.** `STAFF`

A table has a declared key schema: a partition key and an optional sort key, each a single
attribute of type S, N or B. The value of the partition key is hashed to select a physical
partition, and that partition is replicated across an Availability Zone quorum; the sort
key orders the items inside the partition, so a `Query` with a partition key equality and an
optional sort key condition is a single-partition ordered range read. Everything outside
the key is an untyped, undeclared attribute — the item is a bag of name–value pairs, and
that is the whole model. The role of the key schema is that it *is* the schema: it defines
which queries are efficient (partition key equality, optionally plus a sort key range), it
defines the physical distribution and therefore the throughput ceiling of a single key, and
it is the part you cannot change without migrating the data. Filters in a `Query` or `Scan`
do not change this — a filter is applied after the read and does not use an index, which is
why an unfiltered `Scan` is a table read.

**Q2. What are the hard limits, and which one surprises people most?** `TRICKY`

The documented limits: 400 KB per item, 10 MB of data per physical partition, 1,000 write
capacity units and 1,000 read capacity units per second on a single partition (with up to
3,000 read units per second for strongly consistent reads on one partition), 100 items and
4 MB in a single transaction, 25 items in a `BatchWriteItem` or `BatchGetItem`, and 1 MB on
a `Query` or `Scan` response before pagination. The one that surprises people most is the
10 MB per-partition limit, because it is not a per-item error — it is a *cumulative* limit
that a growing key crosses after months of successful writes, and when a partition is full
the new item is rejected even though the item is small. The second is 400 KB, which rules
out the "put the whole session in one item" design that looks so clean in a diagram.

**Q3. Someone claims DynamoDB "is schemaless, so we can change the data model any time".
Correct them.** `TRICKY`

Three corrections. First, the misnomer: you have designed a key schema and an access-pattern
set, and you have written them in application code rather than in DDL, which relocates the
schema rather than removing it. Second, what you actually gained is the ability to add a
non-key attribute without a migration; what you have lost is any enforcement, any
cross-item constraint, and every secondary index you would have declared with `CREATE
INDEX` — each secondary index in DynamoDB is a separately-provisioned structure you must
design, provision, and keep consistent yourself. Third, the part that is not flexible at
all is the key schema itself: changing a partition key or sort key is a full data migration
with a dual-write window, exactly as in a relational database. So "we can change it any
time" is true for attributes and false for keys, and the keys are the part that matters.

> **CHAPTER 7 SUMMARY**
>
> DynamoDB's documented model is a table with a declared key schema — a partition key and
> an optional sort key — where the partition key's value is hashed to a physical partition
> replicated across an AZ quorum, and the sort key orders items within it, so a partition
> key equality plus a sort key range is the one efficient query shape. Everything else is
> an untyped attribute, which is what "schemaless" actually means: a schema you wrote in
> the client. The limits that matter are 400 KB per item, 10 MB per partition, and about
> 1,000 WCU/s and 1,000 RCU/s per partition — and the partition limit is the one that
> arrives late, after months of writes, when a growing key crosses it. The hash exists to
> keep distribution even, which is why ordering has to be re-introduced explicitly through
> the sort key, and being precise about which parts of the architecture are documented
> contract and which are published design lineage is part of answering well.

#### Further Reading

- [Amazon DynamoDB Developer Guide — Data Model](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-model.html) — the official definition of tables, items, attributes and attribute definitions.
- [Amazon DynamoDB Developer Guide — Partitions, Items and Attributes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.Partitions.html) — the documented partition size limit, the replication across AZs, and the item size limit.
- [Dynamo — Amazon's Highly Available Key-value Store (SOSP 2007)](https://www.allthingsdistributed.com/2007/10/paper-dynamo-amazon-ssos07.html) — the published design lineage: quorum versions, preference lists, Merkle trees, vector clocks.
- [Amazon DynamoDB Developer Guide — DynamoDB Limits](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/limits.html) — every documented account-level and item-level limit in one place.
- [Amazon DynamoDB Developer Guide — Data Modeling Concepts](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html) — the access-pattern-first framing and the "one table, many patterns" pattern in the vendor's own words.

## Chapter 8 — DynamoDB: Consistency, Capacity & Access Patterns

### 8.1 Eventually Consistent vs Strongly Consistent Reads

DynamoDB's default read is **eventually consistent**. A `GetItem`, `Query` or `Scan`
without `ConsistentRead: true` may be served by a single replica and can return a value
that is behind a write you have already received an acknowledgement for. It is half the
read cost, and it is the default — which is the most consequential default in the service,
because "the default" is what an application gets when nobody makes a decision.

Setting `ConsistentRead: true` returns a **strongly consistent, linearizable read**: it
gathers an acknowledgement from a quorum of replicas and returns the value with the
highest version among them. It costs 2× the read capacity units, and — the part that
matters for CAP — **it can fail** if a quorum of the item's replicas cannot be reached
within the HTTP timeout. That is the "C" of CAP expressed as an API contract: under a
partition, the strongly consistent read returns an error and the eventually consistent
read returns a possibly-stale value. You are choosing an error over a wrong answer, and
that is a defensible choice on some paths and not on others.

> **MUST REMEMBER**
>
> **DynamoDB global secondary indexes are always eventually consistent.** There is no
> `ConsistentRead` on a GSI, and there never has been — the GSI is replicated
> asynchronously because it is a separately-maintained, separately-provisioned structure.
> A *local* secondary index, by contrast, has the same options as the table itself. So the
> rule is: if a read must be strongly consistent, it must come from the base table, which
> means the access pattern must be served by the base table's key schema — and if it is
> served by a GSI, the strong-consistency requirement is unmeetable and the design has to
> change rather than the flag.

The practical decision, which is a list and not a policy:

| Read | Level | Why |
| --- | --- | --- |
| The row a user just wrote | Strongly consistent | Read-your-writes; the alternative is a 404 on your own order |
| Account balance, stock count, permission check | Strongly consistent | A stale value here is a financial or security bug |
| Product detail page | Eventually consistent | A stale price is a support ticket; a stale photo is nothing |
| Session token lookup | Strongly consistent if you can afford it; session revocation makes this mandatory in most systems | A revoked session that still works is a security incident |
| Analytics, dashboards, feeds | Eventually consistent | The whole point is a batch view |
| Anything queried through a GSI | Eventually consistent, by necessity | No strong option exists |

### 8.2 Capacity: WCU and RCU with Worked Arithmetic

The capacity model is fully documented, and the arithmetic is worth being able to do out
loud because "how much will this cost" is a real design-review question.

```text
  WRITE CAPACITY UNITS (standard table)
  ─────────────────────────────────────
  1 WCU  per  1 KB  written          (rounded up to the nearest KB)
  1 WCU  per  1 KB  written for a global table   → 2× cost, replicated twice
  1 WCU  per  0.5 KB for a transaction
  1 WCU  per  25 for an LSI write  (on top of the base table's write cost)
  GSI writes consume write capacity on the BASE TABLE only, plus the GSI's own storage

  READ CAPACITY UNITS (standard table)
  ────────────────────────────────────
  1 RCU  per  4 KB   eventually consistent read   (rounded up to 4 KB)
  1 RCU  per  4 KB   eventually consistent read   for a global table
  2 RCU  per  4 KB   strongly consistent read      (i.e. 2× the EC rate)
  1 RCU  per  4 KB   per 4 KB of a transactional read
  1/2 RCU per  4 KB  for a global-table strongly consistent read
```

Now the worked numbers, because a candidate who says "1 KB is 1 WCU" and then cannot
compute a bill has memorised half a rule.

```text
  WORKED EXAMPLE — a session store
  ────────────────────────────────
  Item: 2 KB (session id, user id, issued, ttl, 4 KB of claims)

  WRITE
    2 KB item → 2 WCU
    10,000 sessions written per second, continuously
      → 20,000 WCU/s provisioned (or on-demand at that rate)

  READ, eventually consistent
    2 KB item → 1 KB blocks rounded up: 1 block of 4 KB → 0.5 RCU
    20,000 reads/s → 10,000 RCU/s

  READ, strongly consistent
    same 20,000 reads/s → 20,000 RCU/s   (double the RCU line)

  If 5% of reads are strongly consistent (the post-login check):
    1,000 SC reads/s → 1,000 RCU/s
    19,000 EC reads/s →  9,500 RCU/s
    total reads        → 10,500 RCU/s
    → the strongly consistent path is 5% of traffic and 9.5% of read cost.

  GLOBAL TABLE, same workload
    writes: 2 KB × 2 (written in two regions) = 4 WCU per write
      → 40,000 WCU/s
    EC reads: 1 RCU per 4 KB
      → 20,000 RCU/s  (regional reads are still charged at the global rate)

  LSI, if the session store is queried by user_id as well as by session_id
    each write consumes capacity on BOTH the base table and the LSI
      → the write bill roughly doubles for the LSI access pattern
```

Two arithmetic facts that are worth stating explicitly because they change designs:

- **A 3.9 KB item and a 4.1 KB item cost 1 RCU and 2 RCU respectively for an eventually
  consistent read.** Item size is quantised to 4 KB blocks for reads and 1 KB for writes,
  so shaving 200 bytes off an item can halve a read. This is the one place in the whole
  volume where schema and cost are directly coupled, and it is a real design lever: strip
  the fields you do not read on that path.
- **A global table's writes cost 2×** because the write is replicated to two regions. If a
  design needs a global table for read locality but not for write locality, that is an
  expensive feature, and the mitigation is a single-region table plus a replicated read
  cache in the other region.

### 8.3 On-Demand vs Provisioned

```text
  PROVISIONED WITH AUTOSCALEING              ON-DEMAND
  ────────────────────────────                ─────────
  You set a number. It is a ceiling.          You pay for what you use.
  You are billed for the provisioned           Roughly 2× the per-unit price of
  number whether you use it or not.            provisioned, by AWS's own figure.
  Autoscaling follows a target (usually       No capacity to model, no
  utilisation %) with a floor and a           autoscale lag, no Provisioned-
  ceiling, on a CloudWatch metric.             ThroughputExceededException under
  The lag is real: minutes of scaling          a burst you did not predict.
  behind a spike.                              Predictable cost, unpredictable
  Under-provisioning throttles: you get        invoice.
  ProvisionedThroughputExceededException
  and retries.
```

**The trap, and it is the one the interviewer is listening for: a bad access pattern is a
provisioned-capacity bill either way.** Adaptive capacity redistributes capacity to the hot
partitions, and autoscaling scales the *table*, but neither of them fixes a query that
scans. A `Scan` over a 40 GB table costs the same whether you provisioned for it or not —
you have simply moved the cost from capacity units to request latency and to the read
capacity of every page you read. Conversely, on-demand makes an accidental `Scan`
spectacularly expensive in dollars instead of merely slow, which is a genuine argument for
provisioned if the team is new to the service.

The honest recommendation, which depends on the shape of the load rather than on a
preference:

- **On-demand** for spiky, unpredictable, or low-volume (development, staging, small
  internal tools) workloads, where modelling a ceiling is guesswork. Accept the 2× rate.
- **Provisioned with autoscaling** for steady, well-understood production workloads, where
  the utilisation target is meaningful and the cost saving is real. Give it **headroom**:
  the target should be something like 40–50% of provisioned so the scale-out happens before
  you throttle, and the maximum must exceed your expected peak, not your average.
- **Neither fixes the design.** Before choosing a capacity mode, the first question is
  whether the access pattern is a `Query` against a key or a `Scan`, because a `Scan` is a
  capacity incident regardless of the mode.

> **TRADE-OFF — The 2× question**
>
> On-demand is documented at roughly twice the price of provisioned per unit, and the
> condition that flips the answer is predictability. If your traffic is spiky enough that
> provisioning means paying for the peak all month, on-demand wins. If your traffic is
> flat enough that the provisioned number is honest, provisioned wins by 2× and the only
> cost is the operational discipline of watching the scaling alarm. The one thing neither
> buys is safety from a bad access pattern, and it is worth saying so, because a team
> choosing on-demand to "stop worrying about throttling" has optimised the wrong variable.

### 8.4 Adaptive Capacity and the Hot Partition It Cannot Fix

DynamoDB's **adaptive capacity** is a documented, genuinely useful feature with two parts:
it continuously tracks how item sizes and request distribution vary across the table's
partitions, and it delivers a burst capacity increase to the partitions that need it, so
that a skewed workload does not have to be provisioned for its worst partition across the
whole table. It also handles the "one big item" case by tracking item-size distribution so
that large items are not throttled by a small-item provisioning assumption.

**What it does not do: split a partition.** The ceilings of roughly 1,000 WCU/s and
1,000 RCU/s per partition (and up to 3,000 RCU/s for strongly consistent reads on a single
partition) are structural. A single hot key is one key's ceiling, and no amount of
provisioned capacity, autoscaling, or adaptive capacity moves it, because the work is
concentrated in one partition and a partition is the unit of distribution.

The fix is in the key, and it is the same fix as in Chapter 4 and Chapter 6:

```text
  THE BUCKET-SUFFIX FIX, IN DYNAMODB TERMS
  ────────────────────────────────────────

  Before:  PK = "user#12345"                     → 1 partition, 1,000 WCU ceiling
  After:   PK = "user#12345#" + (counter % 20)   → 20 partitions

  A single-item write becomes a "write to one of 20 keys" and the
  client must know which one — so either the key component is
  something the client can compute (a hash of the order id, a
  monotonically increasing counter, the day bucket), or the
  canonical item is a separate item in a base partition and the
  buckets are a sharded sub-structure.

  Read cost of the fix: reading the whole entity is now 20 GetItems
  or a BatchGetItem, or a Query on one partition if the sub-structure
  is modelled with a sort key. And a 20-way increase in read fan-out
  on the entity's hot read path is a real cost that has to be paid
  deliberately, not discovered.
```

> **PRODUCTION SCENARIO**
>
> Problem: a `customer-events` table throttled for eight minutes every Monday at 09:00, with
> `ProvisionedThroughputExceededException` on roughly 2% of writes, while the CloudWatch
> table-level `ConsumedReadCapacityUnits` sat at 25% of provisioned. Investigation: the
> table-level metrics looked healthy, so the team scaled the table twice and the throttling
> continued. Per-partition and per-item metrics from CloudWatch showed one partition with
> the partition key `tenant = "enterprise-default"` taking 90% of the write rate — a
> placeholder tenant id used by an integration that had not been configured with a real
> tenant. Root cause: a client-side default had collapsed many logical writers onto one
> partition, and the per-partition ceiling — not the table's provisioned capacity — was the
> limit. Adaptive capacity was already enabled and had raised the effective capacity of that
> partition; it could not split it. Solution: a backfill that re-keyed the affected rows to
> `tenant = "enterprise-default#<shard>"` with a dual-write window and a read-side fallback
> for the old key, plus a validation at the integration boundary that rejects a placeholder
> tenant. Prevention: an alert on per-partition consumed capacity as a percentage of the
> documented per-partition ceiling, not just on table-level throttles, and a standing rule
> that any dimension a client can default must never be a partition key.

### 8.5 `PutItem` vs `UpdateItem` and the Read-Modify-Write Race

`PutItem` replaces the entire item. `UpdateItem` applies an update expression to named
attributes, creating the item if it does not exist. `UpdateItem` does **not** do a
read-modify-write internally in a way that makes the sequence atomic with a subsequent
read — it is a single atomic operation on the item, but *composing* it with a read in your
code is two operations and therefore racy.

```java
// THE RACE — two workers both see counter == 41, both write 42, one increment is lost
Item item = getItem(table, "stats#2026-09-27");   // read
int next = item.counter() + 1;
putItem(table, "stats#2026-09-27", next);         // write  →  lost update

// THE FIX — an atomic update expression, one round trip, no read
UpdateItemRequest req = UpdateItemRequest.builder()
    .tableName("stats")
    .key(k -> k.partitionValue("stats#2026-09-27"))
    .updateExpression("SET #c = #c + :one")
    .expressionAttributeNames(Map.of("#c", "counter"))
    .expressionAttributeValues(Map.of(":one", 1))
    .build();
```

`ADD` and `SET x = x + :n` are evaluated atomically by the service on the item, so a
counter is safe. What is *not* safe is any business logic that depends on the current
value — "increment only if below the limit" requires a **condition expression**, and a
condition is DynamoDB's optimistic-concurrency primitive:

```java
// Conditional write — the correct guard against a lost update or a duplicate
UpdateItemRequest.builder()
    .tableName("inventory")
    .key(k -> k.partitionValue("sku#8812"))
    .updateExpression("SET available = :new")
    .conditionExpression("available >= :requested")
    .expressionAttributeValues(Map.of(":new", 0, ":requested", 3))
    .build();
// If the condition fails, the API returns ConditionalCheckFailedException
// and NOTHING is written. The caller retries with fresh state.
```

Three consequences worth stating in a design review:

1. **`PutItem` is not a partial update.** A `PutItem` with three attributes on an item
   that has ten **deletes the other seven**. This is the single most common DynamoDB data
   loss bug, and it is silent — no error, the extra attributes are simply gone.
2. **Conditions are the only atomic guard.** Optimistic locking (`if version = :expected`),
   idempotency keys (an attribute plus `attribute_not_exists(idempotency_key)`), and
   uniqueness enforcement are all expressed as condition expressions, and all of them fail
   loudly with `ConditionalCheckFailedException` rather than corrupting data.
3. **A condition expression is a transaction on one item.** It is not a transaction across
   items, which is the next section.

### 8.6 Transactions: What They Cost and What They Buy

`TransactWriteItems` gives ACID semantics across up to **100 items** and **4 MB** of data
in one operation, in one region. The costs are documented and real:

| Aspect | Cost |
| --- | --- |
| Write capacity | 2 WCU per KB written (double the non-transactional rate) |
| Read capacity | 2 RCU per 4 KB read |
| Latency | Two round trips' worth: the transaction coordinator prepares, then commits |
| Limits | 100 items, 4 MB total, single region, 90-second duration limit |
| Conflicts | A `TransactionCanceledException` with a `CancellationReasons` array — you must inspect it, because a cancellation can be a business condition and not an error |
| Operability | Retries need care; a cancelled transaction that you retried without inspecting the reasons can loop |

The honest staff-level position: **reach for a transaction when the invariant genuinely
spans items, and redesign when it does not.** The single-table design of 8.7 exists
precisely so that the common invariants fit inside one item and need no transaction at
all. A transaction that is on a hot path at 2× capacity and 2× latency is a design
smell, and it is almost always a symptom of modelling related things as separate items.

### 8.7 Access Patterns: One Table or Many

The decision, stated honestly, because both positions are advocated by competent people.

**One table with a type-prefixed sort key.** A single table with
`PK = <entity>#<id>` and `SK = <TYPE>#<sort>` serves many access patterns because the
prefix in the sort key distinguishes record types, and a `Query` with a `begins_with` on
the sort key reads one type out of the same partition.

```sql
-- One table: orders. Access patterns, all point reads, no GSI needed for these.
--   AP1  get one order
--   AP2  get one customer
--   AP3  list a customer's orders, newest first
--   AP4  list a customer's order items
--   AP5  list a customer's cart

-- PK                       SK                          item
-- ───────────────────────  ─────────────────────────  ─────────────
-- ORDER#a1b2               ORDER#a1b2                  the order
-- ORDER#a1b2               ORDER#a1b2#ITEM#1           a line item
-- ORDER#a1b2               ORDER#a1b2#ITEM#2           a line item
-- CUSTOMER#9911            CUSTOMER#9911               the customer
-- CUSTOMER#9911            ORDER#2026-09-25#a1b2       an order, newest first
-- CUSTOMER#9911            CART#9911                   the cart
```

`Query` for AP3: `PK = CUSTOMER#9911 AND begins_with(SK, "ORDER#") AND SK <=
"ORDER#9999-99-99"` with a limit — one partition, one ordered range, no index, no scan.
That is the appeal, and it is real.

**The costs, which are also real.** (1) A single hot entity — one very large customer with
millions of orders — makes one partition huge, and the 10 MB partition limit is
eventually a hard wall. (2) Different access patterns have wildly different access
patterns' characteristics, so one table has one capacity profile and one throttling
domain; a busy feed and a quiet lookup throttle each other. (3) A `Query` with
`begins_with` cannot use an index, so a query that needs a filter *not* on the key
still cannot have it. (4) The table becomes unreadable to anyone who has not memorised
the prefix conventions, and that knowledge lives in a wiki page rather than in a
constraint.

**Many tables** — one per entity, plus a GS index table per non-key access pattern —
cost you write capacity on the base table and on every GSI, eventual consistency on every
GSI, and the mental overhead of a schema spread across tables. In exchange: each table
has its own capacity profile, its own scaling, and the entity boundaries are legible.

**The recommendation, and the review process that produces it.** Default to **one table
with a deliberate access-pattern set** when the entities are genuinely 1:1-ish in access
and no single entity's data is unbounded; default to **many tables with GSIs** when
entities have genuinely different volumes or lifetimes, or when a team will maintain it
and legibility matters more than a round trip. The review process is the real answer and it
is the same in both designs: **write every access pattern as a concrete `Query` with its
key expression and its expected rate, and check that each one is a point read with no
`Scan` and no filter.** If a pattern cannot be written that way, the design is not done.

> **STAFF-LEVEL CONSIDERATION**
>
> The single-table-versus-many-tables argument is usually technical and is usually decided
> by the person who will not operate it. What makes it a staff decision is the *review
> artefact*: a one-page access-pattern list, where each line is a pattern, its key
> expression, its expected rate, and its item size. That list decides the question
> mechanically — a pattern you cannot express as a point read is a GSI or a redesign, and
> a hot entity that appears twice in the list is a partition that will hit 10 MB. It also
> does three things the debate never does: it makes the capacity model derivable (sum the
> writes, multiply by item size, add the index writes), it makes the migration cost visible
> (which patterns break if the key changes), and it gives the next engineer a test. A team
> with that page can change its mind later; a team without it is committed to a decision
> nobody can explain.

#### Common Mistakes

- Believing a GSI supports strongly consistent reads — it does not, ever
- Mislabelling RCU arithmetic: 1 RCU per 4 KB eventually consistent, 2 per 4 KB strongly
  consistent, and 1 WCU per KB written
- Thinking adaptive capacity can split a hot partition — it redistributes capacity across
  partitions and never splits one
- Choosing on-demand to solve throttling when the real cause is a `Scan` or a hot key
- Using `PutItem` as a partial update — it replaces the item and silently drops every
  attribute you did not supply
- Doing a `GetItem` then a `PutItem` to increment something, which is a lost-update race
- Using a transaction where a single item with a type-prefixed sort key would do, paying
  2× capacity and 2× latency for an invariant that fits in one item
- Not noticing a per-item size that crosses a 4 KB read block boundary and doubles the
  read cost

#### Interview Questions — DynamoDB Consistency, Capacity & Access Patterns

**Q1. Your table is at 30% of provisioned capacity and clients are getting throttled. What
is happening and what do you do?** `SCENARIO`

Almost certainly a hot partition. Table-level utilisation is an average, and an average
hides a distribution where a few partition keys are pinned at their per-partition ceiling
while most of the table is idle. Adaptive capacity redistributes capacity toward the hot
partitions and tracks item sizes, so it may already be raising the effective capacity of
the hot ones — but it cannot split a partition, and the documented per-partition limits of
about 1,000 WCU/s and 1,000 RCU/s (up to 3,000 RCU/s for strongly consistent reads) are
structural. So I would look at per-partition and per-item CloudWatch metrics, identify the
key or keys, and check whether it is a defaulted or low-cardinality dimension — a
placeholder tenant id, a "default" account, a single hot entity. Then the fix is in the
key: a shard suffix or a time bucket so the load spreads over several partitions, with a
backfill and a dual-write window, and a validation at the write boundary so a placeholder
identity is rejected at write time. Scaling the table or switching to on-demand does not
fix a single hot key; it just makes the bill reflect it.

**Q2. Do the capacity arithmetic for a 2 KB item written 10,000 times/s and read 20,000
times/s, with 5% of reads strongly consistent, on a standard table.** `TRICKY`

Writes: a 2 KB item rounds up to 2 KB of write units, so 1 WCU per KB gives 2 WCU per
write, and 10,000 writes per second is 20,000 WCU/s. Reads: 2 KB is a single 4 KB block,
which is 0.5 RCU eventually consistent, so 19,000 eventual reads are 9,500 RCU/s. The 1,000
strongly consistent reads cost 1 RCU each — 2× the eventual rate for the same block — so
1,000 RCU/s. Total reads: 10,500 RCU/s. The point worth drawing out is that 5% of the read
traffic is 9.5% of the read cost, which is the entire argument for being selective about
strongly consistent reads rather than defaulting them on. On a global table the write
number doubles to 40,000 WCU/s because the write is replicated to two regions, and the
eventually consistent read rate becomes 1 RCU per 4 KB, so 20,000 RCU/s.

**Q3. Why are global secondary indexes always eventually consistent, and what do you do
about it?** `ADVANCED`

A GSI is a separately-provisioned, separately-maintained structure that is updated
asynchronously from the base table, and DynamoDB does not offer a strongly consistent read
option on one at all — there is no `ConsistentRead` parameter for a GSI query. The
practical consequence is a hard design rule: any read whose staleness is a bug must be
served by the **base table**, which means the access pattern has to be in the base table's
key schema. If a requirement only emerged after the design was built — "we need to look up
orders by promo code" — and the only way to do that is a GSI, then a strongly consistent
version of that read does not exist, and the options are to change the key so the base
table serves it, to accept eventual consistency and design the read path for it (retry
until the value appears, or read the base table by the primary key once you have the
result), or to use a transaction on the base table to maintain a strongly-consistent
projection under its own key.

**Q4. `PutItem` and `UpdateItem` — when do you use which, and what goes wrong?** `TRICKY`

`PutItem` replaces the whole item, so it is right only when you genuinely have the complete
item and you want the missing attributes gone. `UpdateItem` changes named attributes and
creates the item if absent, so it is right for partial changes and for atomic arithmetic —
`SET counter = counter + :one` or `ADD quantity :n` are evaluated atomically by the service.
What goes wrong, in order of how often I see it: (1) using `PutItem` as a partial update,
which **silently deletes every attribute you did not supply** — no error, the data is just
gone; (2) a `GetItem` followed by a `PutItem` to change a value, which is a lost-update
race because two operations is not one; (3) assuming `UpdateItem` is a read-modify-write
you can reason about, when the condition expression is the only atomic guard, and it must
be inspected — a `ConditionalCheckFailedException` is the mechanism, not a failure to retry
blindly.

**Q5. One table or many? Defend your answer.** `STAFF`

It depends on the access-pattern list, not on the argument. One table with a type-prefixed
sort key wins when entities are accessed together and no single entity is unbounded,
because it gives many point reads with no GSI, no eventual consistency on the index, and
no GSI write cost, and the sort key does the filtering via `begins_with`. Many tables win
when entities have genuinely different volumes, lifetimes or capacity profiles, when one
entity is large enough that the 10 MB partition limit becomes a wall, or when legibility
matters more than a round trip. What I would not accept is a decision made without the
access-pattern list: every pattern written as a concrete `Query` with its key expression,
its rate and its item size, checked for point-read-ness with no `Scan` and no filter. That
list decides it mechanically, and it is also what makes the capacity model derivable and
the migration cost visible.

> **CHAPTER 8 SUMMARY**
>
> DynamoDB's consistency is per request and the defaults are consequential: reads are
> eventually consistent and half-priced unless you ask for `ConsistentRead`, which is
> linearizable, costs 2×, and *fails* rather than returning stale data when a quorum is
> unreachable — which is the CAP trade expressed as an API contract. Global secondary
> indexes are always eventually consistent, so any read whose staleness is a bug must be
> served by the base table's key schema. Capacity is 1 WCU per KB written and 0.5 RCU per
> 4 KB read, doubled for a global table and for strongly consistent reads, with the 4 KB
> read quantisation meaning a 3.9 KB item costs half of a 4.1 KB item. On-demand is about
> 2× the per-unit price and buys predictability; provisioned with autoscaling needs
> headroom above the peak; and neither fixes a bad access pattern. Adaptive capacity
> redistributes capacity across a table's partitions and never splits one, so a single hot
> key stays at the documented per-partition ceiling of roughly 1,000 WCU/s and 1,000
> RCU/s. `PutItem` replaces the item and silently drops unspecified attributes,
> `UpdateItem` is atomic for arithmetic, and the condition expression is the only
> guard — and a transaction at 2× cost and 4 MB is a design smell that usually means the
> invariant should live inside one item.

#### Further Reading

- [Amazon DynamoDB Developer Guide — Read and Write Consistency Model](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteConsistency.html) — the per-request contract, and why a strongly consistent read can fail.
- [Amazon DynamoDB Developer Guide — Capacity Units](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.CapacityUnits.html) and [Pricing](https://aws.amazon.com/dynamodb/pricing/on-demand/) — the WCU/RCU definitions in the vendor's own table, plus the on-demand versus provisioned comparison.
- [Amazon DynamoDB Developer Guide — Adaptive Capacity](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/adaptive-capacity.html) — what it does for skew, and the documented per-partition limits.
- [Amazon DynamoDB Developer Guide — Global Secondary Indexes](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/SecondaryIndexes.html) — the eventual-consistency rule, the write cost of maintaining an index, and the "no strongly consistent reads" constraint.
- [Amazon DynamoDB Developer Guide — Expressions and Condition Expressions](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.ConditionExpressions.html) and [Optimistic Locking](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Expressions.OptimisticLocking.html) — the documented mechanism for atomic arithmetic and lost-update prevention.

## Chapter 9 — MongoDB: Document Model & Aggregation

### 9.1 The Document Model: What Is Genuinely Flexible

A MongoDB document is a BSON value — a set of key–value pairs, in which a value can be a
scalar, an array, or a nested document, nested to 100 levels. There is no declared schema
and no table. The collection is a bag of documents, each of which may have a different
shape.

That flexibility is real in three specific ways, and a candidate who cannot name the three
is describing the marketing version:

1. **Optional and sparse attributes cost nothing.** A field that exists on 3% of documents
   is not a nullable column, and there is no `ALTER TABLE`. This is genuinely useful for
   wide, heterogeneous entities.
2. **A small, co-located, bounded sub-structure is one read.** An array of a child's
   identifiers, a nested address, a small set of tags — all arrive with the parent, with
   no join, in one round trip. This is the model's real strength and it is what the
   embedding rules in 9.2 are for.
3. **The shape can evolve without a migration.** Adding a field, or a field to a nested
   document, is a code change rather than a deploy-and-backfill.

And that is where the honesty has to resume, because the same three properties become
liabilities under conditions that are extremely easy to miss:

1. **A field that is optional for one client is optional for every client.** There is no
   constraint, so a service that writes `total_cents` and a service that writes `total` both
   succeed, and the read path that expects one of them silently gets `undefined`. In a
   relational database the constraint would have rejected the second writer. **The
   flexibility that lets you deploy without a migration is the flexibility that lets you
   ship an inconsistency that no test catches.**
2. **Co-location is only free while the sub-structure is small.** An array that grows is a
   document that grows, and 9.2's rules are entirely about that.
3. **Evolving the shape without a migration means the *readers* must evolve too, and there
   is nothing telling you when they have.** MongoDB's answer is schema validation (9.3),
   and a team that does not use it is running a distributed monolith with no contract.

> **INTERVIEW TRAP — "MONGODB IS SCHEMALESS, SO IT IS MORE FLEXIBLE THAN POSTGRES"**
>
> The correction is that it is not schemaless, it is **un-validated**. The schema still
> exists — you have just moved it out of the database and into every client, and it is now
> a convention rather than a constraint. The cost is precisely that the database will not
> tell you when a client breaks it: a service that writes `total` where the reader expects
> `total_cents` succeeds, returns no error, and produces a `NaN` in a dashboard. MongoDB's
> own answer is JSON Schema validation with `validationLevel` set to `strict` and a
> `validationAction` of `error`, which recovers most of what you gave up — so the honest
> position is not "MongoDB has no schema" but "MongoDB's schema is optional, in the
> document, and you should turn on validation or you have replaced a constraint with a
> hope."

### 9.2 Embedding vs Referencing, and the 16 MB Limit

The rule is a boundedness rule, and it is worth having in the form MongoDB's own
documentation states it: **embed data that is read with its parent and grows slowly;
reference data that is read independently, grows without bound, or is shared.**

```text
  EMBED                                  REFERENCE
  ──────                                 ─────────
  data is usually read with the parent   data is queried on its own
  belongs to the parent 1:1 or 1:few     grows without bound
  grows slowly (bounded)                 is shared between parents
  read together always                   needs its own indexes

  EMBEDDED:                             REFERENCED:
  {                                     {
    _id: 1,                               _id: 1,
    customer: "u#12",                     customer: "u#12",
    items: [                              items: ["i#1","i#2"]     ← unbounded
      {sku:"a", qty:2},                       i1: { _id:"i#1", sku:"a", qty:2 },
      {sku:"b", qty:1}                   }
    ]                                    }
  }
  one read, always consistent,            one read per item, or a $lookup,
  no join, no eventual consistency          two-phase and possibly inconsistent
```

**The 16 MB BSON document limit is a hard limit** — MongoDB will refuse a document larger
than 16 MB, and it applies to the document as stored, after any transformation. The limit
exists because the whole-document read path and the WiredTiger storage format are built
around documents fitting in memory, and it is not negotiable.

The failure mode it produces is a **latent** one, and that is why it is worth an
interview trap of its own:

```text
  THE GROWING ARRAY — A YEAR IN THREE PHASES
  ──────────────────────────────────────────

  Month 1     orders collection, avg 3 items per order
              document size ~400 bytes
              p99 read: 1 ms.  Nobody notices anything.

  Month 6     avg 40 items per order
              document size ~5 KB
              p99 read: 4 ms.  A dashboard gets slower. It is
              attributed to traffic growth.

  Month 14    one customer places a 900-item order
              document size ~120 KB
              EVERY read of that order moves 120 KB, even the
              read that only needs the header. The working set
              stops fitting in the WiredTiger cache. p99 read:
              180 ms, and the cache is thrashing for everyone
              because one document is evicting other tenants' data.

  Month 18    the customer's most frequent order crosses 16 MB
              → write fails. CodeIntegrityException or a document
              too large error. The write path is now broken for
              one customer, in production, with a customer-facing
              symptom, and the schema cannot be changed without a
              migration of every existing document.

  The design was fine on the day it was written. The array was
  unbounded and nobody asked whether it would still be.
```

The four questions to ask about any embedded array, in this order, are the ones that would
have caught it in month 1:

1. **Is there a bound on the size?** If the answer is "no, it depends on the customer", the
   array must not be embedded.
2. **Is it read with the parent every time, or only sometimes?** If the child items are
   queried independently, embedding means the only way to reach them is to read the whole
   parent — which is a collection scan wearing a disguise.
3. **Is it shared?** A product that appears in a million orders must be one document
   referenced a million times, never a million copies, or a price change is a million
   writes.
4. **What is the growth rate per document?** The answer "roughly 3 a day" is an
   extrapolation; "unbounded" is a design decision.

Note the asymmetry this creates versus Cassandra: **MongoDB's embedding is a design you
choose per field and can revisit per field**, while a Cassandra table is a design you commit
to for a whole query pattern. MongoDB's mistakes are recoverable — a migration moving a
field from an array to a referenced collection is a program you write — whereas a
Cassandra or DynamoDB partition key is not. That is a real reason to feel more relaxed
about MongoDB, and worth saying in a design review where the team is nervous about
"going NoSQL".

### 9.3 Schema Validation: Turning Optionality Into a Contract

MongoDB supports JSON Schema validation on a collection, and a candidate should know it
exists and what it buys, because it is the answer to "if I use a document store do I lose
constraints".

```bash
# Validation on a collection: types, required fields, ranges, and enums.
db.runCommand({
  collMod: "orders",
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["_id", "customer", "items", "total_cents", "status"],
      properties: {
        _id:        { bsonType: "string" },
        customer:   { bsonType: "string", pattern: "^u#[0-9]+$" },
        items: {
          bsonType: "array",
          minItems: 1,
          items: {
            bsonType: "object",
            required: ["sku", "qty"],
            properties: {
              sku: { bsonType: "string" },
              qty: { bsonType: "int", minimum: 1, maximum: 10000 }
            }
          }
        },
        total_cents: { bsonType: "int", minimum: 0 },
        status:      { enum: ["PENDING","PAID","SHIPPED","CANCELLED"] },
        placed_at:   { bsonType: "date" }
      }
    }
  },
  validationLevel: "strict",     # apply to all inserts and updates
  validationAction: "error"      # reject the write, do not warn
})
```

What this gives you and what it does not. It gives you type checking, required fields,
ranges, enums, and pattern matching — which is a large fraction of what a `CHECK`
constraint plus typed columns gives you in Postgres, and it applies to documents of any
shape. What it does **not** give you is a uniqueness constraint across documents (that is
a unique index, and unique indexes in MongoDB have a restriction on arrays), a foreign key
to another collection, or a cross-document invariant. Cross-document integrity in MongoDB
is application code, exactly as in Cassandra and DynamoDB.

> **PRODUCTION RELEVANCE**
>
> The two settings people get wrong are `validationLevel` and `validationAction`.
> `validationAction: "warn"` logs and proceeds, which is a safe way to roll validation out
> to an existing collection — you can see what *would* fail, fix the writers, and then
> switch to `"error"`. The reverse mistake is setting `"error"` on a live collection
> without first running it in warning mode, which is how a deploy starts rejecting writes
> that have been accepted for a year.

### 9.4 The Aggregation Pipeline

The aggregation pipeline is a sequence of stages, each of which takes documents and emits
documents. It is MongoDB's answer to "we do not have joins or views", and it is where the
framework's real expressiveness lives.

```javascript
// The pipeline: unwind the line items, group to the order, and re-aggregate.
db.orders.aggregate([
  // 1. Narrow FIRST — the cheapest reduction, and putting it last is the
  //    single most common performance mistake in a MongoDB pipeline.
  { $match: { status: "PAID", placed_at: { $gte: ISODate("2026-09-01") } } },

  // 2. Compute per-document, before expanding anything.
  { $addFields: { line_total: { $multiply: ["$qty", "$price_cents"] } } },

  // 3. Explode the array into one document per item.
  { $unwind: "$items" },

  // 4. Group.
  { $group: {
      _id: "$_id",
      total:   { $sum: "$line_total" },
      n_items: { $sum: 1 },
      first_customer: { $first: "$customer" }
  }},

  // 5. Sort and cap — after the group, not before.
  { $sort: { total: -1 } },
  { $limit: 20 }
])
```

The stages you must know, with the one-line definition and the trap:

| Stage | What it does | The trap |
| --- | --- | --- |
| `$match` | Filters documents | The optimiser can push it down to an index only if it is **first** and the shape is indexable |
| `$project` / `$addFields` | Reshapes, computes | Nothing is indexed on a computed field; filtering on one is a scan |
| `$unwind` | Explodes an array into documents | Multiplies document count — a 900-item order becomes 900 documents, and every later stage pays for it |
| `$group` | Accumulates, and is always a blocking stage | Holds a hash table of every group in memory or on disk; there is no streaming |
| `$sort` | Sorts, also blocking | Must come after a `$group` if you are sorting an aggregate; before it, it is a full sort |
| `$limit` | Caps output | Put it **before** an expensive `$group` when you only need the top N, and remember the top-N-of-a-group is not a group |
| `$lookup` | A join, from a field in this collection to another | See below |
| `$project` after `$group` | Renames the accumulator field out of `_id` | Pure syntax; everyone forgets it once |

**`$lookup` deserves its own paragraph**, because it is the stage that decides whether a
document store can express the query you need. The simple form runs a query on the foreign
collection **for every input document**, which is a loop:

```javascript
// THE SIMPLE FORM — one query on "orders" per input document.
{ $lookup: {
    from: "inventory",
    localField: "items.sku",
    foreignField: "sku",
    as: "stock"
} }
```

The consequences: with 1,000 input documents this is 1,000 queries, and the cost is
`O(n)`. The foreign field is `localField`-driven and does not use an index unless the
foreign collection has an index that the planner can use — and with an array `localField`
it fans out once per array element. The performant form is the **pipeline form**, which
uses an index and runs once:

```javascript
// THE PIPELINE FORM — one indexed query, and a $lookup per upstream document
// only if upstream has already been narrowed.
{ $lookup: {
    from: "inventory",
    let: { skus: "$items.sku" },
    pipeline: [
      { $match: { $expr: { $in: ["$sku", "$$skus"] } } },
      { $project: { _id: 0, sku: 1, available: 1 } }
    ],
    as: "stock"
  } }
```

The rule that makes this usable: **`$match` early, `$unwind` late, `$group` never more
than necessary, and `$lookup` as close to the end as you can while still narrowing what it
sees.** A pipeline that starts with a `$lookup` before a `$match` is a full collection
scan multiplied by a per-document loop, and it is a common enough mistake that seeing one in
a code review is a reliable signal.

> **STAFF-LEVEL CONSIDERATION**
>
> A pipeline in a repository is a *query* and should be reviewed like one, and in most
> teams it is not — it lives in a Spring `MongoTemplate` call, is not covered by
> `EXPLAIN`, and its cost is invisible until the collection grows. The practice that pays
> for itself: every non-trivial pipeline gets an `explain("executionStats")` in a test that
> runs against a production-sized fixture, and a comment naming the index it relies on. A
> pipeline that depends on an index but whose comment does not say which is one index
> deletion away from a 40-second query, and the deletion will be made by someone who does
> not know.

### 9.5 Write Concern and Read Concern

These are MongoDB's two knobs, and they are the answer to "which consistency does this
give me" — a per-operation, explicit, documented choice, which is more honest than most
engines.

```text
  WRITE CONCERN — how durable is this write, and how many nodes must have it
  ──────────────────────────────────────────────────────────────────────────
  { w: 0 }                     no acknowledgement, fire and forget. Fastest.
                              A "successful" write may not exist anywhere.
  { w: 1 }                     the default on a standalone and on a replica set
                              primary. Acknowledged by one node. LOST if that
                              node dies before replication.
  { w: "majority" }            acknowledged by a majority of the replica set.
                              THE DEFAULT YOU WANT. Survives the loss of a
                              minority. This is your durability floor.
  { w: 2 }                     acknowledged by two nodes. Explicit, for a
                              specific reason, such as a cross-region write
                              into a second DC's replica set.
  { w: <tag>, wtimeout: ms }   write to nodes with a tag; fail after wtimeout.
                              The right answer for a latency-sensitive write
                              that must not queue behind a replica lag spike.

  READ CONCERN — what may this read return
  ──────────────────────────────────────
  { readConcern: "local" }     the default. Read whatever the node has, which
                              on a secondary may lag by seconds. Returns data
                              from the node's own most recent state.
  { readConcern: "available" } read from any available node, even a stale one.
                              Fastest, and the staleness is unbounded.
  { readConcern: "majority" }  read data acknowledged by a majority. Combined
                              with w:"majority" writes, this gives you
                              read-your-writes across a failover.
  { readConcern: "linearizable" }
                              reads from the primary, waits for a majority to
                              agree, and (documented) may block on an in-
                              progress write or an election. The only option
                              that is a true linearizable read. It is 2×
                              the cost of "majority" in load, and it fails
                              during a primary election.
  { readConcern: "snapshot" }  a causally-consistent snapshot across a
                              transaction or a session; no data seen by the
                              operation can change underneath it.
```

The combination that gets stated in a design review, and the reasoning behind it:

- **Money, stock, permissions:** `{ w: "majority" }` write and `{ readConcern: "majority"
  }` read. This is the strongest guarantee available without a transaction, and it is
  sufficient for read-your-writes *and* monotonicity across a primary failover.
- **Reporting and analytics:** `w: 1` and `readConcern: "local"`, because a report that is
  two seconds stale is worth more than a report that is slow.
- **Session lookups:** `w: "majority"` on write and `readConcern: "majority"` or
  `"linearizable"` on the validation read. A session that survives revocation is a security
  incident, and the cost of the linearizable read is the price of not having one.
- **Anything with a `w: 0` write:** only a metric, a presence indicator, or a
  best-effort log. The failure mode is a write that reports success and does not exist,
  which is a class of bug that surfaces months later as "we lost some events".

### 9.6 `_id`, Indexes, and the Sharding Constraint

**`_id` is an index**, always. Every collection has a unique index on `_id`, created
automatically, and it is the only field guaranteed to have one. So `_id` is not a
convenience identifier; it is the primary access path, and choosing a good one is the
difference between a collection that is fast and one that needs a secondary index for
everything.

The interesting constraint is on a **sharded** collection: `_id` must be **globally
unique**, and a unique index on a sharded collection must have the shard key as a prefix
(supported since MongoDB 4.4). The consequence is a real design rule: **on a sharded
collection, build `_id` out of the shard key** — `_id: { customer: "u#12", seq: 4417 }` or
`_id: "u#12-4417"` — because then uniqueness is checkable locally, the index is co-located
with the shard, and a moveChunk does not have to consult a global index. An `_id` that is
a random UUID on a sharded collection is a design that has opted into a global uniqueness
check on every insert, and that check is a bottleneck you have chosen.

A secondary note that catches people: an **array field cannot be efficiently uniquely
indexed** in the ordinary way, and a unique index on an array field is multikey — MongoDB
permits it, and it means the index has one entry per array element, which changes both the
index size and the semantics of what "unique" means (it is unique per *value*, not per
document). If you need per-element uniqueness you need a different data structure, not an
index option.

#### Common Mistakes

- Calling MongoDB schemaless — it is un-validated, and `collMod` validation is the answer
- Embedding an array whose size is bounded only by what a customer chooses, and discovering
  the 16 MB limit in production
- Ignoring that embedding is fine for reads-with-parent and terrible for query-the-child
  independently
- Putting `$match` after `$lookup` or after `$group`, which turns an index scan into a full
  scan multiplied by a per-document loop
- Assuming `$lookup` is free — the simple form is a loop, and only the pipeline form uses
  an index
- Using `{ w: 0 }` outside a metrics path, or relying on `w: 1` for durability when a node
  can die
- Believing a read concern is a cluster-wide setting — it is per operation, and the
  strongest guarantee is per read
- Choosing a random UUID `_id` on a sharded collection and creating a global uniqueness
  check you did not need

#### Interview Questions — MongoDB

**Q1. When do you embed and when do you reference in MongoDB?** `TRICKY`

Embed when the data is read with its parent, is bounded, and belongs to the parent alone —
you get one read, always internally consistent, with no join and no eventual consistency.
Reference when the data is queried on its own, grows without bound, or is shared across
parents — a product in a million orders must be one document referenced a million times,
or a price change is a million writes. The question that catches the real bug is the
bound: an array that grows with what a customer puts in it is not bounded, and it fails
late, because it is fast for a year and then a single customer crosses the 16 MB document
limit and their write starts failing. So I would ask, of every embedded array, "what bounds
this?" and treat "it depends on the customer" as an answer that means reference it.

**Q2. What does the 16 MB document limit really cost you?** `ADVANCED`

It is a hard limit — MongoDB will refuse a document over 16 MB — and it exists because the
read path and the storage format are built around documents fitting in memory. The cost is
not the limit itself but the *failure mode's latency in time*. An embedded array of
unbounded size passes every test, looks fast, and degrades gradually: the document gets
wider, every read of that document moves the whole array even when the reader wants one
field, the working set stops fitting in the WiredTiger cache, and p99 read latency degrades
for *all* tenants as one large document evicts others. Then, eventually, a write fails. So
the practical design rule is to treat "how large can this document get, and what is the
growth rate" as a design question with a number attached, and to use a bounded, bucketed
sub-collection for anything that grows per entity — and to remember that the cost of
fixing it later is a migration of every document, not a deploy.

**Q3. Explain the aggregation pipeline and where performance goes wrong.** `TRICKY`

It is a sequence of stages, each taking documents and emitting documents, and it is
MongoDB's substitute for joins and views. The performance mistakes are structural and
there are only a few of them. `$match` must come first and must be indexable, because the
optimiser can push an index-backed match down to the index and cannot push a match that
follows an expensive stage. `$unwind` multiplies document count, so everything downstream
pays for it. `$group` is a blocking stage that holds every group in memory or spills to
disk, so it is the expensive one and you want as few as possible, after the narrowing.
`$sort` is also blocking, so sorting a grouped result is fine and sorting before an
expensive match is not. And `$lookup` in its simple form runs one query per input
document, which makes it a loop unless you use the pipeline form with a `$match` on an
indexed foreign field. The review rule is: match early, unwind late, group once, lookup
last, and put an `explain("executionStats")` in a test against a production-sized fixture.

**Q4. What do write concern and read concern actually control, and what combination do you
use for money?** `ADVANCED`

Write concern is about durability: `w: 0` is fire-and-forget and a "successful" write may
not exist anywhere; `w: 1`, the standalone default, is acknowledged by one node and is lost
if that node dies before replication; `w: "majority"` is acknowledged by a majority of the
replica set and survives the loss of a minority; `wtimeout` bounds how long you will wait
when replicas are lagging. Read concern is about what a read may return: `local` (the
default) returns the node's own state, which on a secondary may lag; `available` may read
from a stale node; `majority` returns data a majority has acknowledged, which combined
with `w: "majority"` writes gives read-your-writes and monotonicity across a failover;
`linearizable` reads from the primary and waits for majority agreement, and it is the only
true linearizable read, at about twice the load of `majority`, and it fails during a
primary election. For money and stock I would use `w: "majority"` on the write and
`readConcern: "majority"` on the read, and the reason it is sufficient is that it survives a
failover without re-reading stale data — which is the guarantee a ledger actually needs.

> **CHAPTER 9 SUMMARY**
>
> MongoDB's flexibility is real in three places — sparse attributes, a bounded
> co-located sub-structure, and shape evolution without a migration — and it becomes a
> liability in exactly the same three, because a field optional to one client is optional to
> all of them, a co-located structure is only free while it is small, and an evolved shape
> has no mechanism telling the readers. It is not schemaless; it is un-validated, and
> `collMod` with JSON Schema validation, `validationLevel: "strict"` and
> `validationAction: "error"` recovers most of what a `CHECK` constraint gives you. The
> embedding rule is a boundedness rule, and the 16 MB document limit is the enforcement
> mechanism for a mistake that otherwise surfaces a year later as a latency degradation
> across all tenants followed by a failed write. The aggregation pipeline's performance is
> decided by stage order — match first, unwind late, group once, lookup last, and use the
> pipeline form of `$lookup` — and write concern and read concern are per-operation,
> documented choices where `w: "majority"` plus `readConcern: "majority"` is the right
> default for anything whose staleness is a bug.

#### Further Reading

- [MongoDB Manual — Data Model Design and Embedded Documents](https://www.mongodb.com/docs/manual/core/data-model-design/) — the official embedding-versus-referencing rules, including the "unbounded" test.
- [MongoDB Manual — BSON Types and the 16 MB document limit](https://www.mongodb.com/docs/manual/reference/limits/) — the documented limits, including document size and index key size.
- [MongoDB Manual — Schema Validation](https://www.mongodb.com/docs/manual/core/schema-validation/) — `collMod`, `$jsonSchema`, and the `validationLevel` / `validationAction` pair.
- [MongoDB Manual — Aggregation Pipeline Stages](https://www.mongodb.com/docs/manual/reference/operator/aggregation-pipeline-reference/) and [`$lookup` performance](https://www.mongodb.com/docs/manual/reference/operator/aggregation/lookup/) — the stage reference, and the vendor's own statement of when `$lookup` uses an index.
- [MongoDB Manual — Read and Write Concern](https://www.mongodb.com/docs/manual/reference/read-write-concern/) — the authoritative list of concern levels, including the documented behaviour of `linearizable` during an election.

## Chapter 10 — Choosing a NoSQL Store

### 10.1 The Decision Table

This is the **NoSQL-only** table. Volume 11 owns the consolidated store-selection table
across all eight stores including S3 and Elasticsearch, so the two are complementary
rather than duplicated: if you are choosing between a document store, a wide-column store
and a cache, this is the page; if you are choosing across the whole set including search
and object storage, wait for Volume 11.

| Store | Access-pattern fit | Write scaling | Consistency | Query flexibility | Operational cost |
| --- | --- | --- | --- | --- | --- |
| **PostgreSQL** | Excellent when relationships are real and joins are few and indexed. Also excellent with `jsonb` + GIN for semi-structured data | Single writer. Sharding (Citus) or logical replicas; replicas are read-only | Full ACID, up to `SERIALIZABLE` | Best in the set: ad-hoc SQL, window functions, CTEs, `EXPLAIN` | Low if you know it: MVCC, autovacuum, replication. High if you do not |
| **MySQL** | As above; stronger when the schema is simple and the read path is `INNODB`-shaped | Single writer; read replicas; Group Replication for a small quorum | Full ACID; `REPEATABLE READ` with gap locks is the sharp edge | Good SQL, weaker than Postgres on `jsonb` and window functions historically | Low-to-moderate; the clustered index makes some schema mistakes unrecoverable in place |
| **Redis** | Keys, hashes, sorted sets, streams. Excellent for caching, counters, rate limits, session stores, leaderboards, pub/sub | Excellent: single node, and cluster mode shards by hash slot | Single node is trivially consistent; cluster mode replicates asynchronously, so a failover can lose acknowledged writes | Deliberately poor. No general query language; you compute in the client | Low, and the failure modes are well-known (Volume 9) |
| **Cassandra** | Excellent for **known, fixed, high-volume** point reads and range reads on one key. Terrible for ad-hoc anything | Excellent: writes scale to every node in the ring | Configurable per statement: `ONE` through `ALL`, plus `SERIAL`. Default reads are eventually consistent | Worst in the set. No join, `WHERE` on the primary key only, `ALLOW FILTERING` is a trap | High. Compaction, tombstone debt, repair, hinted handoff, ring operations, `nodetool` fluency |
| **DynamoDB** | Excellent for known access patterns with a partition key plus sort key, and for serverless. Terrible for ad-hoc | Excellent and elastic: on-demand or provisioned with autoscaling | Per request: eventually consistent by default, `ConsistentRead` for linearizable. GSIs always eventually consistent | Poor. No join, no arbitrary filter, `Scan` is a table read | Lowest of the distributed stores — it is managed. The cost is the bill and the key-schema lock-in |
| **MongoDB** | Good for document-shaped entities with a bounded co-located structure and moderately variable queries. Good with the aggregation pipeline | Sharded by a shard key, with a primary handling writes within a shard | Per operation: write concern (`w: 0/1/majority`) and read concern (`local`/`majority`/`linearizable`/`snapshot`) | Medium. The pipeline is powerful, `$lookup` exists and is expensive | Moderate. WiredTiger cache and working-set sizing, sharding, balancer, replica set management |

Two rows deserve their own sentence, because they are the ones people get wrong:

- **Redis is in this table and it is not a system of record.** It is the fastest thing in
  the set and the only one where a failover can lose an acknowledged write. Volume 9 owns
  it; the only thing this volume needs to say is that "we moved to Redis" is a statement
  about a cache, and a cache that has become the source of truth has acquired every
  durability problem of a database and none of the tooling.
- **DynamoDB's low operational cost is real and it is a genuine reason to choose it**, and
  it is bought with the same currency as everyone else — key-schema lock-in and a bill you
  cannot locally predict. A staff engineer choosing DynamoDB is choosing to spend design
  effort on the key schema instead of on operating a cluster, and that is a legitimate
  trade for a team that would rather not run Cassandra.

### 10.2 The Warnings That Decide More Choices Than the Table

> **TRADE-OFF — "YOU CAN ADD A CACHE, BUT YOU CANNOT REMOVE A DATA MODEL"**
>
> The asymmetry is worth stating precisely. Adding a cache in front of a relational
> database is a reversible, local, additive change: a cache miss falls through to the
> database, the cache is populated, and if the cache is wrong the fix is to flush it. A
> cache in front of a cache-shaped data model is much harder to remove than it was to add,
> because the application's reads have started depending on the shape. The deeper reason
> is that the cost of a wrong data model is paid at every read forever, while the cost of a
> wrong cache is paid only while the cache is wrong. So the ordering in a design review
> should be: get the data model right, then cache it — never the reverse, and never
> "let's put it in a cache store and model it properly later", because the modelling is
> the part that gets skipped and the cache is the part that stays.

> **PRODUCTION RELEVANCE**
>
> "We can always add a cache" is true and it is also the reason a lot of teams do not fix
> the underlying access pattern. A `Scan` on a 4 GB table that a cache makes fast is a
> design with the database doing 4 GB of work per cache miss, and the miss rate is a number
> someone chose. The operational signature of this is a database whose CPU is dominated by
> sequential I/O from an application that "is fast" in staging, because staging has a small
> dataset and therefore a warm cache and a fast scan. The design-review version of the same
> point: a cache in front of a full scan is a latency band-aid on a capacity bill that
> grows linearly with data, and it is the *only* mechanism in this volume that gets worse as
> the data gets bigger.

### 10.3 What Makes a NoSQL Choice Hard to Reverse

This is the section that is actually useful in a real design review, and it is the part
that is missing from every "SQL vs NoSQL" comparison chart. A choice is hard to reverse in
proportion to how much of the system has to change to undo it.

| The thing you choose | Reversibility | Why |
| --- | --- | --- |
| The **partition key** in Cassandra or DynamoDB | Very hard. A data migration with a dual-write window, plus every query re-derived | The key determines storage layout, throughput ceiling, and the only efficient query shape. Nothing about the code tells you it is load-bearing |
| The **sort key and its ordering** in DynamoDB | Hard. A GSI is an alternative, at write cost and eventual consistency | Ordering is not a query option; it is the storage order |
| One table vs many tables | Moderate. A migration of the write path, the read path, and the capacity model | The access-pattern list changes, so the capacity model and the throttling domains change |
| **Denormalisation** in Cassandra or MongoDB | Hard. The duplicate becomes depended upon, and its staleness becomes load-bearing in the UI | The staleness cost lands in screens nobody on the team owns |
| `ALLOW FILTERING` or an unbounded `Scan` | Not reversible by design. It becomes the access pattern | It works at 10,000 rows and is a denial-of-service at 10 million |
| `w: 0` or a fire-and-forget write in MongoDB | Hard, and the data is already lost | The loss is not a state you can migrate out of |
| The **consistency level** per statement | Easy — it is a parameter | This is the one cheap decision, which is why it is the one that gets made by accident |
| Adding a Redis cache in front of anything | Easy to add, moderate to remove | Removal is a code and data-shape problem rather than a data one |
| The store itself, early, before any data exists | Easy. This is the window in which the choice is cheap | Everything above gets harder the day the first production row lands |

The row at the bottom is the one worth raising unprompted. **A NoSQL decision made before
there is data is a two-week decision; the same decision made after two years of data is a
two-quarter migration.** The staff-level contribution in a design review is often not an
opinion on the store — it is naming that window, and proposing to use it.

> **STAFF-LEVEL CONSIDERATION**
>
> The best version of this conversation ends with a written artefact rather than a
> decision. Three things, an afternoon: (1) the **access-pattern list** — every query, its
> key expression, its rate, its item size; (2) the **partition review** — which patterns
> are point reads, which keys are hot, which grow without bound; (3) the **exit cost** — one
> paragraph on what it would take to move this data to a different store in two years, and
> roughly what it would cost. That third document is the one that changes behaviour: teams
> that have written the exit cost make better day-one decisions, because the key schema is
> suddenly visible as the thing that would be expensive to change. And it is the document
> that a new engineer inherits, which is the real test of whether a design is understood or
> merely chosen.

#### Common Mistakes

- Choosing a NoSQL store because a benchmark showed it was faster on someone else's
  access pattern
- Treating Redis as a system of record, and acquiring durability problems with none of a
  database's tooling
- Evaluating a store on write throughput while the real constraint is a read pattern with a
  cross-entity filter
- Deciding the key schema before the access-pattern list, and calling it a technical
  decision
- Forgetting that a denormalised duplicate's staleness becomes load-bearing in a UI that
  nobody on the database team owns
- Missing the window in which the decision is cheap — before there is production data

#### Interview Questions — Choosing a Store

**Q1. A team is choosing between Cassandra, DynamoDB and MongoDB for a new product. How do
you run that decision?** `STAFF`

I start by refusing to answer until the access-pattern list exists, because the honest
answer is that this choice is a function of the access patterns and the operational appetite
rather than of the feature lists. So: write every query with its rate, its filter
predicates and its expected item size, and then test each candidate against them. If every
pattern is a point read on a known key and the write rate is the binding constraint,
Cassandra and DynamoDB are the candidates and MongoDB is out. If the entities are
document-shaped with a bounded co-located structure and the queries are moderate and
somewhat variable, MongoDB is in and the wide-column stores are probably out. Then the
second question is operational appetite: DynamoDB means paying roughly 2× per unit for
on-demand predictability and never running a cluster; Cassandra means a team that is
fluent in `nodetool`, compaction, repair, and ring operations. That is often the deciding
factor, and it is not a technical one.

**Q2. When would you choose MongoDB over Cassandra or DynamoDB?** `TRICKY`

When the entity is naturally a document with a bounded co-located sub-structure, and the
queries are moderate in number and somewhat variable rather than known and fixed. MongoDB
wins on the flexibility axis: optional attributes cost nothing, a nested structure arrives
with its parent, the aggregation pipeline expresses a lot of reporting logic that would be
an application-side loop in the wide-column stores, and per-operation write and read
concerns give explicit, documented consistency choices. Cassandra wins when the write rate
against one key is the binding constraint and the access patterns are fixed and known,
because its write path is genuinely distributed and its reads are point reads. DynamoDB
wins when the team does not want to operate a cluster and the bill is acceptable. The
deciding factor between MongoDB and the wide-column stores is usually: how much of the
query is a filter on a non-key column, because that is cheap in MongoDB and expensive
everywhere else.

**Q3. What makes a NoSQL decision expensive to undo?** `STAFF`

The partition key, overwhelmingly, and everything that is downstream of it. The key
determines the physical layout, the per-key throughput ceiling, and the only efficient
query shape, and changing it is a full data migration with a dual-write window plus a
rewrite of every query that relied on the old shape. The denormalised duplicates are
close behind, because the application has started depending on them and their staleness
has become load-bearing in a user interface that the database team does not own — removing
one is a product change, not a migration. A single-table-versus-many decision is moderate
cost because it changes the capacity model and the throttling domains. By contrast the
consistency level per statement is a parameter and is cheap to change, which is exactly why
it is the decision that gets made by accident. And the meta-answer is the window: all of
these are cheap before the first production row lands and expensive afterwards, so naming
that window is often the most valuable thing a staff engineer contributes to the review.

**Q4. Your team is on Postgres and wants to move to a document store because "the queries
have got complicated". What do you ask first?** `SCENARIO`

I ask what "complicated" means, because there are three very different things behind that
word. If it is that the queries join across many tables, the fix is a denormalised
materialised view or a `jsonb` column with a GIN index, and the migration buys nothing. If
it is that the queries are *variable* and hard to predict, that is a case for Postgres and
against a distributed store, because the wide-column stores require you to know the queries
in advance. If it is that one specific query scans 4 GB and the team has put a cache in
front of it, then the real finding is that there is a missing index and the cache is
hiding a capacity bill that grows linearly with data. What I would want before any
migration conversation is a `pg_stat_statements` dump ordered by total time, the `EXPLAIN
(ANALYZE, BUFFERS)` of the three worst queries, and the list of queries that are actually
slow in production rather than in a developer's intuition. In my experience the migration
proposal almost never survives that, and the boring outcome is a better week.

> **CHAPTER 10 SUMMARY**
>
> The NoSQL decision is a function of three things: whether the access patterns are known
> and fixed, which read paths filter on a non-key column, and how much operational appetite
> the team has. Cassandra and DynamoDB are for known, fixed, point-read workloads with high
> write rates; MongoDB is for document-shaped entities with bounded co-located structures
> and moderately variable queries; Redis is a cache and not a system of record; and
> PostgreSQL or MySQL remain the right answer for relational data with ad-hoc queries,
> which is most data. The warning that decides more cases than any feature comparison is
> the asymmetry between adding a cache (reversible, additive, falls through on a miss) and
> changing a data model (permanent, because the read path starts depending on the shape) —
> which is why the ordering in any design review is model first, cache second. And
> reversibility is the axis to think on: the partition key and the denormalised duplicates
> are near-permanent, the consistency level is a parameter, and every one of those
> decisions is cheap in the window before there is production data and expensive after it.

#### Further Reading

- [Amazon DynamoDB Developer Guide — Data Modeling](https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/data-modeling.html) — the access-pattern-first method, in the form most teams will actually use.
- [Apache Cassandra — Data Modelling](https://cassandra.apache.org/doc/latest/cassandra/data-modeling/index.html) — the query-first workflow and the one-table-per-pattern rule.
- [MongoDB Manual — Data Model Design](https://www.mongodb.com/docs/manual/core/data-modeling/) — the embedding rules and the "when to embed" decision tree in the vendor's own form.
- [AWS Builders' Library — Choosing the right data store](https://aws.amazon.com/builders-library/choosing-the-right-data-store/) — the least biased published version of the "understand your access patterns first" argument.
- [Microservices Volume 2, Chapter 8 — Data Ownership & Cross-Service Queries](https://github.com/) — this set's treatment of owning data at the service boundary; a "which database" question is frequently a "who owns this data" question in disguise.

---

### End of Volume 10

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Correct the "pick two of three" CAP answer at the database level: name the operation, the
  consistency level, and what the client sees when the quorum is unreachable, and say why
  a partition is not a choice.
- Explain PACELC's else branch in terms of a configuration choice you have actually made,
  and say why it governs production while CAP governs the incident.
- State what "eventually consistent" is missing until it is a specification — the bound,
  the mechanism, the failure case, and the monitor — and give the read-your-writes fix as
  "a primary route or a version token, nothing else".
- Explain why a partition key is simultaneously the unit of storage, replication, write
  throughput and query shape, and why changing it is a data migration rather than a
  configuration change.
- Give the per-partition ceilings — DynamoDB's 1,000 WCU/s and 1,000 RCU/s, up to 3,000
  RCU/s for strongly consistent reads — and explain why adaptive capacity redistributes
  capacity without ever splitting a partition.
- Draw the LSM write path end to end — coordinator, commit log, memtable, SSTable, bloom
  filter, compaction — and say which operational problem lives in which component.
- Explain why a delete is a write in Cassandra, what `gc_grace_seconds` protects against,
  and how a tombstone-heavy partition degrades reads without any error message.
- Say what size-tiered and leveled compaction each optimise, what the write-versus-read
  amplification trade is, and how a compaction backlog becomes a durability problem.
- Design a Cassandra table from a `WHERE` clause backwards, explain why a predicate on a
  non-key column is a schema migration, and state why `ALLOW FILTERING` and secondary
  indexes are traps on a hot path.
- Compute `QUORUM` at RF=3, explain why it is 2 of 3, and name the read-repair cost that a
  `QUORUM` read pays.
- Say that DynamoDB GSIs are always eventually consistent and design around it, rather than
  reaching for a flag that does not exist.
- Do DynamoDB capacity arithmetic with real numbers — 1 WCU per KB written, 0.5 RCU per
  4 KB eventually consistent, doubled for strong consistency and for a global table — and
  do the on-demand versus provisioned comparison including the "a bad access pattern is a
  bill either way" point.
- Explain the `PutItem` versus `UpdateItem` distinction, the silent attribute loss of a
  partial `PutItem`, and the lost-update race that only a condition expression closes.
- State MongoDB's 16 MB document limit, explain why an unbounded embedded array is a
  latent problem rather than an immediate one, and say when to embed versus reference.
- Say what write concern and read concern control, and name the combination you would use
  for money and why it survives a failover.
- Run a MongoDB store choice as three questions — access-pattern list, non-key filters,
  operational appetite — rather than as a feature comparison.

### Coming in Volume 11 — S3, Elasticsearch & the Database Interview Bank

Volume 10 finished with the distributed stores: what CAP actually guarantees per operation,
what a consistency model costs, what a partition key commits you to, and how Cassandra,
DynamoDB and MongoDB each implement the same three ideas differently. Volume 11 adds the
two stores that are not databases in the transactional sense — S3, where the interesting
consistency question is what "eventually" means for an overwrite, a delete and a list, and
Elasticsearch, where an inverted index and a near-real-time refresh change what a query can
promise. It closes with the consolidated store-selection table across all eight stores,
which supersedes the NoSQL-only table in Chapter 10 rather than repeating it, and with the
full database interview bank drawn from all eleven volumes.

## Chapter 11 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). This bank is deliberately **D-weighted**: the
design questions are what separate a candidate who has read about distributed stores from
one who has been paged about one, because being paged is what produces the judgement to
decline them.

### CAP & Consistency

**D1. Your team writes "CAP: AP" in the architecture document. What do you ask, and what
would make you change the document?** `STAFF`

The first question is *which operation*: the guarantees live at the consistency level of a
statement, not on a table, so "AP" describes nothing until it names a read or a write. The
second is what the system does when the network is **up**, because CAP only bites during a
partition and a design that has only been reasoned about during a partition will be wrong
the other 99.99% of the time. And the third is the one that usually changes the document:
what write did the system accept during the last partition, and where did it go? A
single-writer primary with asynchronous replicas is **CP**, not AP — partition the primary
and writes fail while reads succeed from a lagging replica. A genuine AP write path accepts
writes on the minority side and needs a reconciliation nobody budgeted. So I would ask them
to replace the label with a per-operation statement — "our writes are quorum-durable, our
default reads are eventually consistent, and these two reads are strongly consistent" —
and then I would want the PACELC else branch written down, because that is where the
latency-versus-consistency choice they already made lives.

**D2. A product owner says the catalogue can be eventually consistent "because it's only
product data". What is the engineering response?** `STAFF`

The response is to get the definition of *which* reads, because the engineering can
implement any model and cannot decide that a stale price is acceptable. And the
counter-example is easy: a stale price is a stale price at checkout, and a stale stock
count is an oversell — both are the same catalogue data, and both are the kind of thing
that becomes a refund. What I would produce is a one-page list: the reads where staleness
is a bug (price at checkout, stock, the user's own last write, permission checks) and the
reads where it is cosmetic (the gallery photo, the category listing, the recommendation
rail). Then each bug-read gets a mechanism — a strongly consistent read at 2× the RCU, or
a version token and an escalation, or a route to the primary — and each cosmetic read stays
eventual at half the cost. That artefact is worth more than picking a database, and it is
the thing that is missing three months later when the incident happens.

**D3. Your write path uses `QUORUM` in Cassandra and the default read is `ONE`. Is that
AP, CP, or neither?** `TRICKY`

Neither, as a label — and the specific answer is more useful than either word. The
`QUORUM` write is C: with RF=3 it needs 2 of 3 replicas, so a partition isolating 2 nodes
makes writes *fail* rather than fork. The `ONE` read is A: whichever replica answers
returns, and it may be stale. So the accurate sentence is "our writes are consistent under
partition and our reads are available under partition, and the client sees a failed write
rather than a stale write", and that asymmetry is exactly why most systems described as
"AP" are really read-available-and-write-unavailable. The reason "neither" is the right
label is that the level is a parameter: the same table on the same cluster gives a linearizable
read from a `SERIAL` statement and an eventually consistent read from a `ONE` statement, so
no single property describes the database.

**S2. Your system is described in a design doc as "eventually consistent, CAP-AP". A new
engineer asks what happens if a user updates their profile and then immediately sees the
old name on the order confirmation page. What is your answer?** `STAFF`

The answer is that this is a *specific bug* the label failed to prevent, and the label
is why nobody caught it earlier. "Eventually consistent, AP" says nothing about which
reads, so when the order confirmation was built on a denormalised copy of the customer
record, no review question was asked about it — and the projection is written
asynchronously, so a user who updates their profile and opens a confirmation within a
second sees the old name, and the invoice goes out with it. So my answer has three parts.
First, what the guarantee is: the profile write is durable, the projection copy lags, and
the lag is bounded by the projection worker's poll interval — which nobody wrote down, so
it is unbounded in practice. Second, the fix: the read-your-writes reads get a mechanism,
either a strongly consistent read on the order path or a version token and an escalation,
and the price and address at checkout are on that list. Third, the process: the design doc
gets a list of the reads where staleness is a bug, because the useful conversation is not
"AP or CP" but "which of these seven reads would a user report as a bug". And I would say
the fourth thing, which is the real finding: the label is worse than useless, because it
conferred agreement without anyone having agreed.

**P1. A regional partition lasts nine minutes. One side's product pages show prices from
before the partition and the other side's show the new ones. What is your diagnosis and
what do you tell the team?** `SCENARIO`

The prices came from two different reads and the system has no single answer to "what is the
price", which is a read-your-writes and a read-consistency problem rather than a partition
problem. The mechanism is almost always a denormalised copy: the catalogue's read model is
projected asynchronously, both regions serve from their local read model, and during the
partition the projections in the two regions diverged because the events that carried price
changes could not cross. So the diagnosis is that the price is a *fact* being stored in two
places with no ordering between them, and the partition simply revealed it — the same
disagreement would appear, more slowly, on any lagging projection. The immediate mitigation
is to make the checkout path read the authoritative price rather than the projected one, so
the user-facing harm is bounded to the gallery. The durable fix is to decide which reads
carry the invariant, name the mechanism for each, and alert on projection lag rather than on
partition events, because the next occurrence will not have a partition attached to it.

**T1. A client writes to a Cassandra partition at `QUORUM` and then reads at `ONE` from a
replica that was down during the write and has just returned. What does the client see?**
`TRICKY`

In the good case, a stale value. The `ONE` read is served by whichever replica answers
first, and if that replica was down for the write, hinted handoff may or may not have
replayed the mutation to it yet depending on whether it was down for less than
`gc_grace_seconds`. So the read can return the pre-write value even though the write was
acknowledged by a quorum. The guarantee that broke is read-your-writes, and it was never
provided — a `ONE` read makes no promise about the client's own writes, and quorum
*write* plus `ONE` *read* is a combination the model never promised. There is a second
possibility worth naming: if the node has been down longer than `gc_grace_seconds`, hinted
handoff has dropped its hint and the divergence is permanent until `nodetool repair` runs,
so the stale read can persist for days. The fix is a `QUORUM` read after a `QUORUM` write
(majority intersection guarantees the reader sees the write) or a `SERIAL` read, and the
monitoring question is whether repair is running.

**S1. Review this Cassandra model: `CREATE TABLE events (tenant text, kind text, ts timestamp,
payload text, PRIMARY KEY (tenant, kind, ts))` with a query for "all events for a tenant
in a time range, any kind". What is wrong?** `ADVANCED`

Three things, and the third is the interesting one. First, the query spans `kind`, which is
a clustering column, so it is not a prefix of the primary key — it needs `ALLOW FILTERING`,
which reads the entire partition and filters client-side, and that is a scan of every kind
the tenant has. Second, the clustering order on `ts` with `kind` ahead of it means the time
range is not contiguous even with `kind` fixed, so even the "good" query is not a clean
range. Third, and most important, the partition is keyed on tenant alone: a large tenant
makes a partition that is a storage ceiling, a compaction problem, and — if it is a
defaulted or low-cardinality tenant value — a hot-partition ceiling. The fix is one table per
query pattern: `PRIMARY KEY ((tenant), ts)` for the kind-agnostic time-range query, and
separate tables for the per-kind reads, written together. The `payload` column is fine, but
I would want a width check, because a 1 MB payload in a table with a 10 MB practical
partition budget is a design that will not age well.

### Partitioning & Data Distribution

**D4. You must choose a partition key for a table holding one row per IoT device, and
devices send a heartbeat every 30 seconds. Ten million devices. What is the key?** `STAFF`

Not `device_id`, because that is the obvious answer and it is a hot-partition design in
disguise for a different reason: it is a fine partition key for *reads* but it makes
*writes* a million-way fan-out across the ring, which is fine, and it makes any
*per-tenant* or *per-region* query a scan. The real question is what the dominant write
rate per key is, and at 10 million devices on a 30-second heartbeat that is about 333,000
writes per second spread over 10 million keys, which is a healthy 0.033 writes per key per
second — so `device_id` is fine on throughput grounds. What I would push on is the other
access patterns: "all devices in building B, last hour" and "all devices reporting a fault"
are not point reads on `device_id`, and the moment you add a GSI for them you are paying
eventual consistency and index write cost on the highest-volume table in the system. So I
would want the full access-pattern list first, and my default answer is a hierarchical key
(`building#<b>#device#<id>` with a sort key of `ts`) so that both the per-device and the
per-building reads are point reads, and a separate table for the fault feed.

**D5. Your team wants to shard by `customer_id` because it is the natural key. What are the
three ways this fails, and what would you shard by instead?** `ADVANCED`

First, **a large customer crosses the partition ceiling.** One partition is roughly
bounded — 10 MB in DynamoDB's documented terms, and a practical storage and compaction
budget in Cassandra — and a single enterprise customer with a million orders will cross it
long before the table as a whole is interesting. Second, **a hot customer is a hot
partition**, and the documented per-partition ceilings (about 1,000 WCU/s and 1,000 RCU/s
in DynamoDB) mean one large customer can be your entire throughput problem while the cluster
is 5% utilised — and adaptive capacity cannot split a partition. Third, **the fan-out
problem**: any query that is not "everything for one customer" — a compliance export, a
cross-customer report, an ops query across all devices — is a full ring scan, and the day
someone needs it the design has no answer. The alternative is usually a *hierarchy*: a
parent key for the aggregate plus a child key for the individual, with a shard suffix to
keep any single partition bounded, and a separate table for the cross-customer read model
that is fed asynchronously. And the meta-answer is that "the natural key" is usually the
key that describes the *entity*, while the right partition key describes the *access
pattern* and the *distribution* — those are frequently different.

**D6. A table is hash-partitioned and you need "all rows in a date range". Is the problem
solvable?** `TRICKY`

Solvable, at a price, and the price is a design change. In a hash-partitioned store the
date is not a partition boundary, so a range over it touches every partition: either the
date becomes part of the partition key (`pk = "2026-09"`), which bounds the scan to one
partition and is the usual answer for a bounded time window; or the date becomes the sort
key within a fixed partition, which gives ordered access inside a partition and a scan
across partitions; or you accept the fan-out and cap it, which is fine for a
ninety-day-window report and catastrophic for a full export. The thing to be careful about is
that the first option turns a time range into a *partition* and therefore reintroduces a
hot partition at the current month — a rolling-window key where the current period is
enormous and old periods are cold. The honest answer is usually: put the time component in
the key, size the time bucket so the busiest one is comfortably under the per-partition
ceiling, and keep a separate, asynchronously-fed read model for anything that genuinely
needs to cross buckets.

**S2. Review this partition key for a table of "sessions" that must support "all of a user's
active sessions" and "all sessions created this week across all users".** `STAFF`

The key `pk = "USER#" + user_id` is a clean design for the first pattern and has nothing to
offer the second. "All of a user's active sessions" is a single partition with a sort key
of, say, `last_seen`, so that query is a point read with a range — good. "All sessions
created this week across all users" is every partition in the table, and there is no sort of
key that makes it a range because the sort key is only ordered *within* a partition. So the
second query is a full table scan, and it is being asked on a schedule by something (an
admin view, a metrics job, an audit export) that will keep getting slower. The fix is a
second table with the time component in the *partition key* — `pk = "WEEK#2026-W39"`,
`sk = user_id` — written alongside, which turns a scan into a bounded set of partitions, and
it is bounded because a week of sessions is a known quantity. I would also ask the two
questions the design should have answered: what is the per-user session count (which bounds
the partition), and is the weekly query on a hot path or a job, because if it is a job the
answer is a read replica or an export rather than a second write path. And the general
point: a partition key design is only finished when the access-pattern list has been walked
against it, pattern by pattern, and the ones that turn into scans are named.

**P1. A DynamoDB table's write throttle rate went from 0% to 4% on Monday mornings and
recovered by 10am, with table-level consumption steady at 40% of provisioned. What is
happening?** `SCENARIO`

A hot partition with a time-shaped key, and the table-level metric is hiding it because an
average cannot show a distribution. The morning spike is almost certainly a batch job or a
workflow that writes under a small number of partition keys — a nightly reconciliation that
retries in the morning, or a downstream consumer that drains a queue into one key space.
40% average with 4% throttling is only possible if the utilisation is extremely uneven,
because throttling happens at the per-partition ceiling, not the table ceiling. I would
pull per-partition and per-item CloudWatch metrics, find the keys, and look for the batch
pattern in the application rather than only in the data. The fix is either to shard the key
so the batch spreads, or — more often, and better — to move the batch off the hot write
path: the work is being done synchronously inside a request path or a single-threaded
worker, and giving it a fan-out is treating the symptom. The prevention is an alert on
per-partition consumed capacity as a percentage of the documented per-partition ceiling,
because the table-level throttle alarm tells you about the symptom and this tells you
about the cause.

**T1. A Cassandra node is down, the cluster is at RF=3 with `NetworkTopologyStrategy`, and a
client writes at `QUORUM`. Predict what happens, and then what happens on the third day.**
`TRICKY`

Immediately: the coordinator contacts the two live replicas, both acknowledge, the write
succeeds, and the coordinator stores a **hinted handoff** entry for the down node. So the
client gets a success, and the data is durable on two of three replicas — the write is
correct, and the "C" half of CAP is satisfied because a quorum exists. On the third day,
the node comes back. Now the interesting question: was it down for less than
`gc_grace_seconds` (10 days by default)? If yes, the hints are still held and get replayed
to it, and the node catches up. If it was down longer than `gc_grace_seconds`, the hints
have been dropped and the node is **permanently divergent** until someone runs `nodetool
repair` — and every read that touches it until then can return stale data, and every
`ONE` read is exposed. The prediction to make is that the node also comes back with a
compaction backlog, and if it is brought in too eagerly it will ask the rest of the ring for
bandwidth it does not have.

**S1. Review this key: `pk = "USER#" + user_id` for a table that also needs "all orders for
a customer, newest first" and "orders by status". What is the problem and what would you
propose?** `ADVANCED`

The key is fine for a per-customer read and it is the wrong key for both of the other two
patterns, and that is the whole review. "Newest first for a customer" needs a *sort key*
that is the timestamp, descending — as written, there is no sort key, so the order within
the partition is undefined and the query is a full partition read plus a client-side sort,
which degrades as the customer's order count grows. "Orders by status" is a filter on a
non-key attribute, which in a wide-column store means a secondary index (eventually
consistent, and a write cost on every order) or a second table. So I would propose either
the single-table form — `pk = "USER#" + user_id`, `sk = "ORDER#" + <zero-padded
descending timestamp>` so one `Query` with `begins_with(sk, "ORDER#")` serves the timeline,
plus a dedicated `orders_by_status` table written alongside — or two tables with the status
index as a real GSI with its own capacity. What I want in the review either way is the
access-pattern list, because a key schema proposed without one is a guess, and I would also
flag the `USER#` prefix: it is fine for a single-entity-type table and it becomes a
partition-size liability the moment a customer has millions of orders.

### Cassandra Architecture

**D7. Compaction is falling behind on a write-heavy cluster. What is your diagnosis and
your options, in order?** `ADVANCED`

Diagnosis first, because the options depend on which of three things is true. If the write
rate is genuinely above what the nodes can merge, the answer is to reduce the write rate or
reduce the data: fewer columns, a TTL, a coarser grain, or a coarser partition key. If the
compaction strategy is wrong for the workload — size-tiered on a read-heavy table, or
leveled on a pure append-only time series — the answer is to change it per table, which
costs a full rewrite of the table and is scheduled work. If the hardware is simply
undersized, the answer is faster disks and more IOPS, because compaction is I/O-bound and
`compaction throughput` settings only change the shape of the I/O, not the amount. And the
diagnosis is not optional, because the failure escalates: compaction falls behind → the
SSTable count grows → reads touch more files → read p99 climbs → memtables cannot flush
fast enough → the commit log becomes the only copy of new data → a node failure in that
window is data loss. So a compaction backlog is a *durability* incident in slow motion, and
I would treat the compaction queue depth and pending bytes on the affected nodes as
page-worthy metrics rather than dashboard furniture.

**D8. Your team proposes dropping `gc_grace_seconds` from 10 days to 1 hour to reduce
tombstone counts. What is the trade and what would you say?** `STAFF`

I would say no, and I would explain what the parameter is protecting. `gc_grace_seconds` is
the minimum retention for a tombstone, and the reason is a resurrection bug: if a replica
was down when the delete happened and returns within that window, hinted handoff replays the
old row to it, and if the tombstone has already been dropped the resurrected row wins the
comparison and the data comes back. The parameter is a correctness guarantee about a
reordering that is going to happen, and the failure is silent and permanent. So the trade
is "a small, recoverable storage problem" against "data that occasionally comes back from
the dead, with no error and no trace". I would also point out that the tombstone count is
usually a symptom rather than the problem: a partition that is 40% tombstones is almost
always a workload that deletes most of a partition, and the fix is a TTL with time-window
compaction so rows expire by bucket instead of by tombstone, or a partition key with enough
cardinality that the delete ratio per partition stays low. Tuning `gc_grace_seconds` down to
compensate for a modelling error is the wrong lever.

**D9. A read at `QUORUM` is 40 ms; the same query at `ONE` is 4 ms. Is the 10× cost the
quorum, or is something else wrong?** `TRICKY`

A tenfold gap is not the quorum. In a single-DC cluster, `ONE` and `QUORUM` are both about
one round trip because the replicas are contacted in parallel and the coordinator waits for
the required count — a `QUORUM` read costs a little more in nodes and network but not an
extra RTT. The big cost appears in multi-DC deployments, where a `QUORUM` that spans data
centres pays the inter-DC round trip and `LOCAL_QUORUM` is the answer; a 10× gap is the
signature of exactly that. The other candidate, and the one I would check first, is
**read repair**: a `QUORUM` read that finds divergent replicas performs writes, so a cluster
that has never been repaired has a permanently expensive read path, and the p99 is carrying
that tax. So the diagnosis is: is the cluster single-DC or multi-DC, and what does
`nodetool tablestats` say about pending repairs and row index summaries. A `QUORUM` read
that is 10× slower than a `ONE` read on the same partition is telling you something about
replica divergence or cross-DC fan-out, and neither is the price of the quorum.

**P1. A Cassandra table's p99 read latency rose from 8 ms to 300 ms over four hours, with no
traffic change. Compaction queue depth is at zero and the SSTable count is stable. What is
your diagnosis?** `SCENARIO`

If compaction is healthy and the SSTable count is flat, the LSM read path is not the
problem, so the cost is somewhere else. The candidates in order: a partition whose row
count has grown enough that a `SELECT *` is now moving real data — the read is fine
mechanically and simply has more rows, and if the query returns the whole partition the
latency is proportional to its size; a tombstone load that has not yet reached the
compaction queue because those tombstones are still inside a merged SSTable, where
`nodetool sstablesummary`'s droppable-tombstone estimate is the number to look at; a
cross-partition `ALLOW FILTERING` query that was added to the application and is now
scanning; or — the one I would actually check first on a table with a healthy compaction
queue — a **replica set that lost quorum**, so `QUORUM` reads are now waiting on
desynchronised replicas or a replica that is up but very slow, and the coordinator's
timeout on the slow one is the 300 ms. I would look at per-node read latency and the
request timeouts by node, because "compaction is fine" plus "p99 is up" plus "no traffic
change" almost always means the read is waiting for a node rather than doing more work.

**T1. A developer runs `TRUNCATE` on a large Cassandra table to "clear it and start again".
Predict what the cluster does over the next 24 hours.** `SCENARIO`

The truncate is a schema operation, so it is fast — a few seconds — which is exactly why it
is a trap. The damage is the tombstones: truncating drops the SSTables' data but leaves the
tombstones that must be retained for `gc_grace_seconds`, and on a large table that is a
very large number of deletion markers in a very small amount of live data. What follows is a
compaction problem: compaction spends its I/O merging deletion markers instead of live
rows, the compaction queue grows, and the table that was just emptied becomes slower than
the table that was full. Reads against it are slow because every read pays tombstone
comparisons. And if that table was a hot one, the rest of the ring feels the I/O the
compaction is taking. So the 24-hour prediction is: a table that is empty and slow, a
compaction queue that is not draining, and a paging engineer. The recovery is to force
compaction in stages and accept that the cluster is degraded while it happens; the
prevention is to delete by TTL with time-window compaction, or to drop and recreate the
table, or to use a new table with a different name and repoint the client.

**S1. A code review shows `SELECT * FROM events WHERE tenant = ? AND ts > ? ALLOW
FILTERING` on a table with 40 GB of data. What do you write?** `TRICKY`

I write a blocking comment with the three facts, in this order. `ALLOW FILTERING` tells
Cassandra to read the whole matching partition and apply the predicate itself, so the cost
is proportional to the size of the partition, not to the number of results — on a 40 GB
table that is a production outage, and it gets worse every day. The predicate is on a
non-key column, so this is a schema problem, not a query problem, and the fix is a table:
`PRIMARY KEY ((tenant, day), ts)` gives a bounded partition and a clean range scan, and
`ORDER BY ts` then comes free from the clustering order. And the escalation: this query
should be caught by a lint or a CI check against `ALLOW FILTERING` in a non-interactive
namespace, because it is exactly the kind of change that looks like a one-word fix in a
code review and is a denial-of-service in production. I would also ask what the query is
*for*, because a 40 GB scan behind a user-facing request usually has a better answer
underneath it.

### Cassandra Data Modelling

**D10. Design the tables for an IoT telemetry product with these access patterns: read the
last reading for a device; read a device's history for a day; list a building's devices
with their last readings; and stream all readings for one device in real time.** `STAFF`

Four patterns, so four tables, and the denormalised copy of the last reading is the
interesting one because it is a write-amplification decision that has to be made
explicitly. `last_reading_by_device`: `PRIMARY KEY ((device_id))` with the value
denormalised in, updated on every reading — a hot partition for a high-frequency device,
which is a real problem, and I would shard it if a device reports faster than a few times a
second. `readings_by_device_day`: `PRIMARY KEY ((device_id, day), ts DESC)` with a bucket
column if a day can exceed a sane partition size; this serves the history query as one
range scan. `devices_by_building`: `PRIMARY KEY ((building_id), device_id)`, written when
a device registers — deliberately *not* updated on every reading, because a "last seen"
field on this table would make it the hottest table in the system. And the real-time stream
is the one that deserves a conversation rather than a table, because "stream at low
latency" is a different requirement from "query the last N readings", and a table polled at
100 ms per device is a read-amplification design. The four writes go together, so the
consistency levels and the acceptable staleness of each copy are part of the design and get
written down.

**D11. You have one table per query pattern and four writes per entity. A colleague asks
whether the denormalised copies can be read inconsistently. What is the honest answer?**
`ADVANCED`

Yes, and the design's job is to bound the window rather than to eliminate it, because
Cassandra has no cross-partition transaction and pretending otherwise is the design bug.
So the answer has three parts. First, the mechanism: the primary table at `QUORUM` and the
read-optimised copies at `ONE` or `TWO`, with a bounded — but not bounded-by-anything-you-
control — window until hinted handoff and read repair converge. Second, the read paths:
either a read is served entirely from one table, so no merge is needed, or it merges in the
application and the merge is *tolerant* — newest version wins, a missing copy is absent
rather than zero, and a stale copy is detected by a timestamp rather than assumed away.
Third, the operational half, which is the part that gets skipped: a staleness alert on the
copy tables and a staleness metric in the dashboard, because a projection that silently
stops converging is a support ticket that arrives as "the name is wrong" six weeks later.
And the sharper version of the colleague's question — "can I read these two and be sure
they agree?" — is answered by *you* deciding they never need to agree, and writing that
down where the next engineer will read it.

**D12. When is a Cassandra secondary index the right answer, and what is the test you
apply?** `TRICKY`

The right answer is a bounded, low-cardinality, non-hot-path lookup — a `status` column, a
boolean flag, a tenant id on a small table — where the lookup is a small minority of reads
and the answer set is small. The test is three questions, and if any of them fails, the
answer is a table. (1) Is this query on the hot path? If more than a few percent of reads
filter on it, a secondary index turns that percentage into ring-wide fan-out, because the
index is local to each node. (2) Can I express the query with a partition key restriction?
Since Cassandra 3.0 a 2i query still needs one, so I have already denormalised, and the
index is buying me a small convenience over a table I need anyway. (3) Can the answer be
served by a table keyed on the filter column? If yes — and for a low-cardinality column the
answer is almost always yes — then the table is strictly better: a point read, no fan-out,
no requirement that all replicas be up. The residual use of a 2i is a small operational
convenience on a small table where a whole extra table is genuinely not worth it, and the
cost of that convenience — all replicas must be up or the query will not answer — is a
bargain I would only make in that narrow case.

**S2. Review this table and query, both of which came in the same PR:** `ADVANCED`

```sql
CREATE TABLE messages_by_conversation (
  conversation_id text,
  sender          text,
  sent_at         timestamp,
  body            text,
  PRIMARY KEY ((conversation_id), sent_at, sender)
);

SELECT * FROM messages_by_conversation
  WHERE conversation_id = ? AND sent_at > ? AND sender = ?;
```

`s`

Two problems and they interact. First, the query filters on `sender`, which is the second
clustering column, so it is not a prefix of the primary key — Cassandra will reject it
without `ALLOW FILTERING`, and with it, the read is the whole partition from `sent_at`
onward with a filter applied by the coordinator. The partition could be enormous. Second,
and this is the design error underneath: the primary key sorts by `sent_at` first, so even
for a sender-specific read the rows are not contiguous by sender, and the intent — "this
sender's messages in this conversation in this period" — is not a range the storage order
can serve. The fix is to make the query the schema: `PRIMARY KEY ((conversation_id,
sender), sent_at)` for the per-sender view, and a second table `((conversation_id),
sent_at, sender)` for the whole-conversation timeline, both written together. And the
review question I would add: what is the access-pattern list for this feature? Because
"one table for all message reads" is a design that will be correct for exactly one of the
two queries, and the second one is the one that got written.

**P1. A feature release added a `WHERE status = 'PENDING'` filter to a query that was
previously a clean point read. Latency went from 3 ms to 1.8 s and the coordinator's CPU
saturated. Nothing about the data changed. What is the explanation and the fix?** `SCENARIO`

The filter is on a non-key column, so it is either `ALLOW FILTERING` — a full partition
read with a client-side filter, cost proportional to partition size, which matches the
latency exactly — or a secondary index, which fans out to the replicas of every partition
that might hold a match and makes the coordinator the bottleneck because it is doing all
the coordinating. The CPU on the coordinator is the tell: a ring-wide fan-out puts all the
coordination work on one node, and that node saturating while the rest of the cluster is
idle is the classic signature of a 2i query. The fix is a table: `pending_by_entity` with
`PRIMARY KEY ((status), updated_at)` — status is low-cardinality, which makes it an
excellent partition key in a dedicated table — and the query becomes one partition, one
range, one node. The prevention is a lint rule and a review checklist item, because
"add a filter to a `WHERE` clause" looks like a two-character change in a diff and is a
schema migration in Cassandra. I would also ask what the query is for, because a
coordinator-CPU incident from a status filter is often a status that is too broad.

**T1. Someone runs `SELECT * FROM users WHERE email = ? ALLOW FILTERING` against a table
with `PRIMARY KEY ((tenant), id)`. What exactly does Cassandra do, and what is the worst
case?** `ADVANCED`

It takes the partition key from the tenant — if the tenant is not supplied it cannot even
start, because since 3.0 a 2i and a filtering query both require a partition key
restriction. Given the tenant, the coordinator reads **every row in that tenant's
partition**, from the memtable and every relevant SSTable, applies the email predicate in
memory, and returns whatever matches. The read is done at the coordinator's chosen
consistency level, so it may also pay for read repair across replicas. The worst case is
that a single tenant partition is hundreds of thousands of rows and hundreds of megabytes,
the coordinator is now doing a full scan and a client-side filter for one request, and if
several such queries arrive together the coordinator is the bottleneck for the whole node.
And there is a quieter worst case: this query is *correct*, it returns the right row, it
just took 1.8 seconds, so nothing in the system reports an error and the only signal is
latency. If `email` were backed by a secondary index instead, the same query would fan out
to the replicas of every partition and require all of them to be up. The right answer is
`users_by_email` with `PRIMARY KEY ((email))`, and if the email must be unique per tenant
then `PRIMARY KEY ((tenant, email))` — one partition, one point read, no scan, no
`ALLOW FILTERING`, and the uniqueness is now actually enforced rather than hoped for.

### DynamoDB Design

**D13. You are designing a single-table DynamoDB schema for an order system. What goes in
it, and where do you draw the lines?** `STAFF`

One table with `pk` and `sk`, and both are prefixed. `pk = "ORDER#<id>"` and `sk = "ORDER#<id>"`
for the order header; `sk = "ORDER#<id>#ITEM#<n>"` for its line items; `pk = "CUSTOMER#<id>"`
and `sk = "ORDER#<yyyy-mm-dd>#<id>"` for the customer's order timeline — descending in
practice because a lexicographically descending sort key needs a zero-padded inverted
timestamp or a fixed-width prefix, which is the detail everyone forgets. And a second
pattern: `pk = "CUSTOMER#<id>"`, `sk = "CART#CUSTOMER#<id>"` for the cart, so the cart is
a single item and a checkout is a transactional update of a handful of items under one
partition. The lines I draw: (1) anything that grows without bound for one entity gets its
own table or a time bucket, because the 10 MB partition limit and the 400 KB item limit are
both hard walls; (2) anything queried on an attribute that is not in the key becomes either
a deliberate GSI with its own capacity and its own eventual consistency, or a second table;
(3) cross-attribute invariants go in a transaction or, better, do not exist because the
invariant fits inside one item. And the artefact: every access pattern written as a
concrete `Query` with its rate, so the design is reviewable rather than argued.

**D14. How do you decide between one table and many tables with GSIs?** `ADVANCED`

By the access-pattern list, and I would resist the argument in both directions until it
exists. One table wins when the entities are accessed together, when no single entity is
unbounded, and when the team benefits from there being one place to look — because the
type-prefix sort key gives you point reads with no GSI write cost and no GSI eventual
consistency, and `begins_with(sk, "ORDER#")` is a real query, not a metaphor. Many tables
win when entities have genuinely different volumes, lifetimes or throttling domains, when
one entity is large enough to be a partition-size risk, or when legibility matters more
than a round trip — because a single table has one capacity profile, and a busy feed
throttling a quiet lookup in the same table is a real operational coupling. The tie-breaker
I use: does any access pattern have a *different* traffic shape? If a lookup is 50 rps and
a timeline is 20,000 rps and they share a table, they share a throttle domain, and that is
a bug waiting for a launch. The process that settles it is writing every pattern as a
`Query` with its rate, its item size, and a check that it is a point read with no `Scan` and
no filter — the answer falls out of that page.

**D15. Your entity needs "find by email", and email is not unique. What are the three
designs and what does each cost?** `ADVANCED`

Three, and the middle one is a trap. (1) **A GSI on the email attribute** — a projection
that is always eventually consistent, costs a write on the base table *and* its own
provisioned capacity in the index, and can hold duplicate values for a non-unique
attribute, so a "find one" query has to handle several results. Fine for "show me the
orders for this email" and wrong for "log this user in". (2) **Inlining email into the
partition key** — `pk = "EMAIL#<email>"` — which makes it unique-by-construction, because
DynamoDB's key is unique within a partition, and makes the lookup a point read. The cost is
that the *user* item now has to be a projection of the email-keyed item, or the identity
lookup and the profile read are two different reads in two different partitions, and
keeping them in sync is a consistency problem you have just created. (3) **Normalising
identity** — a separate `email_to_user` table with `pk = "EMAIL#<email>"` and
`user_id` as the item, written transactionally alongside the user with a
`ConditionExpression` for uniqueness. That gives real uniqueness enforcement and a clean
lookup, at the cost of a transaction on the signup path (2× capacity, 100 items, single
region) and one more thing to keep correct. For login specifically I would want (3), because
"find the user for this email" is a read whose answer being stale is an authentication bug,
and I would not serve it from an eventually consistent GSI.

**S1. Review this "one table" design for a product page that needs the product, its
categories, its top reviews, and the price history — all from one `Query`:** `ADVANCED`

```javascript
// pk = "PRODUCT#8812"  — everything for one product in one partition
// sk = "PRODUCT#8812" | "CATEGORY#tools" | "REVIEW#2026-01-01#r441" | "PRICE#2026-01-01"
```

The technique is right and the design has two problems that are both about growth, which
is what single-table designs always have. First, **unboundedness**: price history and
reviews both grow forever for a long-lived product, and this partition is the accumulation
of both. A product with 5,000 reviews and 24 months of daily prices is a partition well
past DynamoDB's documented 10 MB per-partition limit, and the symptom will be a
`ValidationException` on a *small* new price item, which is a confusing failure. The fix is
bucketing the growth in the sort key — `PRICE#2026-09#...` per month, and a `REVIEW#<bucket>`
prefix with a bucket column — so old data ages into a prefix that can be archived or left
alone, and so the review query is a bounded range rather than the whole partition. Second,
**write cost and consistency**: every review write now also updates the product's review
count if that lives in the same partition, which is a `TransactWriteItems` at 2× capacity
and 2× latency, or it is a denormalised count that is eventually consistent and needs a
rebuild job. Both are acceptable; neither is acceptable if nobody decided. The third thing
I would ask, which is the real review question: what is the access-pattern list, and is the
review feed sorted by recency or by score? Those are two different queries with two
different sort-key designs, and the one-table pattern can serve one of them.

**P1. A release added `FilterExpression: "#c = :open"` to a `Query` that was previously a
clean key query. p50 latency is unchanged; p99 is 4 seconds. What happened?** `SCENARIO`

The `FilterExpression` is applied *after* the read, so it changes nothing about what
DynamoDB fetches — it discards rows client-side. So the p50 looks the same only if the
filter is selective for most of the data, and the p99 is where the cost lands: the
`Query` is now reading every item in the partition, up to the 1 MB response limit and then
paginating, and a partition with many items means many round trips before the filter finds
its match. If the filter is on an attribute that is *not* in the key schema, DynamoDB is
reading the whole partition and filtering, and the cost is proportional to the partition's
size, not the result size. The diagnosis is confirmed by the read capacity consumed per
request, which will be far above what the result needs. The fix is to make the filter
attribute part of the key — either move it into the sort key so the query can use a range,
or add it to the key schema or a GSI so the read is a point read — and the prevention is a
review rule, because a `FilterExpression` is a one-line diff that looks free and is a full
partition read in production. I would also want to know what the query was for, because a
four-second p99 behind a user-facing request usually has a cheaper intent underneath it.

**T1. Two clients both `PutItem` to the same `pk` with different `sk` values in the same
partition, and one uses `PutItem` and the other `UpdateItem`. What is the interaction?**
`TRICKY`

The `UpdateItem` touches the named attributes and creates the item if it does not exist; the
`PutItem` **replaces the whole item**, and what it replaces is whatever is there at the
moment it commits. So if the two `sk` values are different, the `PutItem` deletes only the
attributes of *its own* item and leaves the other item alone — the interference is limited
to the same item. The interesting case is the same item written by both: a `PutItem` with
three attributes on a ten-attribute item deletes the other seven, silently, with no error,
and if that happens after the `UpdateItem` commits then the `UpdateItem`'s change is gone.
And the general hazard is that both operations are atomic individually and there is no
transaction between them, so any "update the counter and record the audit entry" pattern
written as a `PutItem` plus an `UpdateItem` is two operations with a window. The rule that
falls out: `PutItem` is for a complete item you are replacing, `UpdateItem` for partial
change, and anything that must happen together is a `TransactWriteItems` or a condition
expression — and `PutItem` as a partial update is the single most common DynamoDB data-loss
bug there is.

### DynamoDB Capacity & Consistency

**D16. Your team wants to cache the results of a `Query` that is currently the p95
expensive operation in the system. What do you ask before agreeing?** `STAFF`

Four questions, and the first one usually ends the conversation. What is the *key
expression* of the `Query`? If it is a partition key plus a sort key range, then the query
is already a bounded range read over indexed storage, the result set is small, and a cache
in front of it is paying a bill to avoid a cost that was already small — and worse, it
adds a staleness window to a path where the answer is already current. If it involves a
`FilterExpression` or a `Scan`, then the cache is a band-aid on a full partition read, the
cost is proportional to the partition and not the result, and the miss rate is a number
someone chose, so the underlying access pattern is the real bug. Second, what is the
cardinality? A cache only works when the hit rate is high, and a query with a high
cardinality — a per-user, per-range, per-entity key — has a hit rate near zero and a cache
that costs money and memory for nothing. Third, what is the staleness tolerance of the
caller, and does the answer have to be read-your-writes? If the caller just wrote the
thing, a cached read is a 404 on their own order. Fourth — and this is the one that
changes the conversation — is the answer derived? If it is, the right answer is usually not
a cache but a maintained projection or a sort key that makes the read cheap. And the meta
point: the ordering in a design review is model first, cache second, because a cache is
reversible and a data model is not.

**D17. How do you design a global, multi-region table for a service that must serve reads
in three regions with a single-digit-millisecond p99?** `ADVANCED`

A global table with regional replicas and a single home region for writes, and the whole
design turns on which reads are allowed to be local. The documented answer is that reads
are local in each region and writes go to the home region, and the price is written down
twice: the write costs 2× capacity because it is replicated to two regions, and the
cross-region write latency is added to every write, which for an interactive checkout is
often unacceptable on its own. So the first thing I want to know is which reads must be
*current* — the ones where a stale value is a bug — because those cannot be served from a
local replica and must route to the home region, which puts the cross-region RTT back into
the critical path for exactly those paths. That leads to the real design pattern: partition
the reads. The global, must-be-current data — a balance, an order status, an entitlement —
lives in a table whose reads are strongly consistent against the home region, and the
global, may-be-stale data — a product catalogue, a feed, a cached profile — is served
locally. And the third thing is the write path: a write in region B goes cross-region to
the home, and if the home is unavailable, writes fail — which is a real availability cost
and the reason some designs use a per-region table with a merge or a conflict-resolving
write rather than a global table. And I would add the thing nobody discusses: the eventual
consistency of a global table is now a *cross-region* convergence problem, with
cross-region latency in the loop, and the per-region read replicas lag by that much plus
the replication interval, so the staleness bound is tens of milliseconds at best and
seconds during a regional incident — which has to be written into the same read-your-writes
list.

**D18. A `TransactWriteItems` call is taking 40 ms and the p99 is 90 ms, on a table whose
ordinary `PutItem` p99 is 4 ms. Why, and what do you do?** `ADVANCED`

The transaction is a different cost shape and the difference is structural rather than a
tuning problem. A transaction is two phases — prepare and commit — against all the
participating items, so it is closer to two round trips than one, and it has to reach a
quorum for each participating item. It also costs 2× the write capacity units of the
equivalent non-transactional writes, and it cannot be partially retried: a
`TransactionCanceledException` can be a business condition (a condition expression
evaluating false) rather than an error, and if you retry without inspecting
`CancellationReasons` you will loop. So the 90 ms is the price of the atomicity, and the
right response depends on whether the atomicity was necessary. In the common case it was
not: the invariants that need a transaction across items are usually invariants that
belong *inside one item*, and the single-table design with a type-prefixed sort key exists
precisely so that "update the order and its items and the customer's timeline" is a small
number of items in one partition with no transaction. So my first move is to ask what the
transaction is protecting and whether a single item with the right shape would do it. If
it genuinely spans items — decrementing stock in two warehouses while writing an order —
then the transaction stays and the work is to keep it off the hot path: batching,
asynchronous where the business allows, and `wtimeout` so a lagging replica fails fast
rather than queueing. And the thing to check in the incident review is whether the
transaction was introduced to fix a bug caused by two non-atomic writes, in which case
removing the non-atomic pattern is the durable fix and the transaction is the patch.

**D19. A read that is stale by 200 ms is acceptable for 95% of your traffic and a bug for
5%. How do you provision for it?** `STAFF`

Split the reads, not the traffic. The base table is provisioned as if all reads were
eventually consistent, and the 5% that cannot tolerate staleness are issued with
`ConsistentRead: true` and pay 2× the read capacity units. The arithmetic is the argument:
at 1 RCU per 4 KB eventually consistent and 2 RCU per 4 KB strongly consistent, a
percentage `p` of strongly consistent reads adds `p` of the eventual read cost — so 5% of
traffic costs about 5% of the eventual read line, and the design is nearly free. I would
then do the harder part, which is *identifying* the 5% rather than assuming it: the reads
where staleness is a bug are a short, writable list — the post-write confirmation, the
payment status, the permission check, the price at checkout — and every other read should be
eventual. The things to check before provisioning are whether a GSI is involved (no strongly
consistent read is possible there, so those paths must be re-keyed to the base table), and
whether the read is multi-region, where a strongly consistent read is cross-region and both
slower and more expensive. And I would add the operational half: a per-request header
recording whether the read was strong, so the 5% is measured rather than remembered.

**D20. On-demand or provisioned for a service with a 3× daily traffic cycle and a launch
event planned?** `ADVANCED`

On-demand, and the launch event is the reason rather than the daily cycle. The daily 3× is
modelled perfectly by autoscaling — the target utilisation and the maximum are both knowable
in advance, so provisioned with headroom above the daily peak covers 99% of the month and
saves roughly half the unit cost. The launch event is a different animal: its peak is not
knowable, autoscaling lags a spike by minutes, and the failure mode of being wrong is
`ProvisionedThroughputExceededException` with retries during the most visible moment in the
company's year. On-demand's roughly 2× per-unit price is a premium paid for not having to
predict, and against a launch that is a good trade. What I would do is run provisioned with
autoscaling for the steady state and raise the maximum capacity — or temporarily move to
on-demand — for the launch window, and I would say plainly that neither choice fixes a bad
access pattern: if a query is scanning, a bigger bill is exactly what you get, and on-demand
makes the bill spectacular rather than merely wrong. So the first question is still whether
every access pattern is a point read.

**D21. Explain what a strongly consistent read costs and when it can fail.** `STAFF`

It is 2× the read capacity units of the equivalent eventually consistent read — 1 RCU per
4 KB eventually consistent, 2 per 4 KB strongly consistent — and it is a read that gathers
an acknowledgement from a quorum of the item's replicas and returns the value with the
highest version among them, which makes it a linearizable read. It can fail: if a quorum of
the item's replicas is unreachable, or if one is unavailable and the HTTP timeout expires
before the read can complete, the API returns an error rather than a stale value. That is
the "C" of CAP expressed as a contract — you have chosen an error over a wrong answer, and
during a partition the strongly consistent read is the thing that breaks. You can raise the
HTTP timeout to tolerate a temporarily unavailable replica, and you can use a replica in
another Availability Zone to spread the read, but the structural point is that a
strongly consistent read trades availability for the guarantee on that one request. And the
design discipline is selectivity: it belongs on the handful of reads where a stale value is
a bug, not as a default.

**P1. A table is on provisioned capacity with autoscaling. Every Monday at 08:00 you get
`ProvisionedThroughputExceededException` on about 3% of writes, and the alarm clears by
08:20. Utilisation is 55%. What do you do, and what do you *not* do?** `SCENARIO`

I would not start by raising the provisioned number, and I would say why out loud so the
team learns it: 55% utilisation with throttling means the load is not uniform in time or in
key, and scaling the table up does not fix either. The Monday-morning shape points at a
scheduled job — a reconciliation, a backfill, a downstream consumer draining a backlog —
that dumps into a small number of hot partition keys, and throttling happens at the
per-partition ceiling, not the table ceiling. So I pull per-partition and per-item metrics,
confirm the concentration, and find the key. Then the fix is in the application: shard the
key if it is a single hot key, and more likely spread the batch across shards or move it
out of the synchronous path entirely. In parallel I would raise the autoscaling target's
maximum as a stopgap, and I would note that 55% is a *table-level* number which tells you
almost nothing about the distribution — the useful metric is per-partition consumption as a
fraction of the documented per-partition ceiling. The durable fix is the alert on
per-partition throttling, because the table-level throttle alarm is a symptom and this is
the cause.

**T1. A read-modify-write increments a counter item: `GetItem`, add 1, `PutItem`. Two
workers run concurrently. What is the result, and what are the two fixes?** `TRICKY`

The result is a lost update: both read the same value, both compute the same next value, and
the second `PutItem` overwrites the first, so two increments produce one. This is not a
DynamoDB bug — it is two operations where the intent was one, and the isolation that would
prevent it does not exist between a read and a write. The two fixes are different and both
are correct for different reasons. The first is an **atomic update expression** —
`UpdateItem` with `SET #c = #c + :one`, or `ADD #c :one` — where the service evaluates the
arithmetic on the item as part of the operation, so it is one atomic request and no read is
needed; this is the right fix for counters and any unconditional increment. The second is a
**condition expression** — `conditionExpression: "#c = :expected"` or a business rule like
`attribute_exists(pk) AND #c < :max"` — which makes the write conditional on the state the
client believes it read, and fails with `ConditionalCheckFailedException` rather than
clobbering; this is the right fix when the decision depends on the value, and it is the
mechanism behind optimistic locking, idempotency keys and uniqueness enforcement. A third
option exists for the case that genuinely needs both: a `TransactWriteItems` with a
condition, at 2× capacity and 2× latency.

### MongoDB

**D22. Embed or reference for "an order and its line items", where a B2B order can have
5,000 lines?** `STAFF`

Reference, without much debate, because the bound is not bounded. The 16 MB document limit
is a hard wall and a 5,000-line order with a few hundred bytes per line is comfortably past
it, so the embedded design fails on the largest orders — which is exactly the set of
customers whose failures are the most expensive. The deeper version of the answer is that
the *latent* version is worse than the hard version: at 30 lines the embedded order is fast,
at 300 it is a document that is 40 KB and every read moves it even when the reader wants the
header, and at 3,000 it is evicting other tenants from the WiredTiger cache and degrading
p99 read latency for the whole collection before any single write has failed. So the test is
"what is the bound and what is the growth rate", and "it depends on the customer" is an
answer that means reference. The referenced design has its own cost — a second query or a
`$lookup`, and the possibility of reading the header and the items at different moments —
and I would pair it with a rule about *which* reads need both together, because that
determines whether a transaction or a documented eventual read is the right answer.

**D23. Your pipeline is `$lookup` first, then `$match`. Walk me through the performance.**
`STAFF`

The `$lookup` runs on every document in the collection before any filter is applied, and in
its simple form it issues one query on the foreign collection per input document — so it is
a loop whose iteration count is the size of the entire collection, not the size of the
result. If `localField` is an array, it fans out once per array element, which makes it
worse by the average array length. Then the `$match` runs on the joined output, so all that
work was done before the filter that would have reduced the input by 99%. On a large
collection that is a scan multiplied by a loop, and it is invisible in staging because the
collection is small. The fixes in order: put `$match` first and make it indexable; use the
**pipeline form** of `$lookup` with `let`/`pipeline` and a `$match` on an indexed foreign
field, which runs one indexed query per input document rather than an unindexed one, and
caches the plan within the stage; move `$lookup` as late as possible while still narrowing
what it sees; and if the join is genuinely needed for a report, ask whether the read model
should be maintained asynchronously instead. I would also want an
`explain("executionStats")` against a production-sized fixture in a test, because this class
of bug is exactly what that catches and exactly what a code review does not.

**D24. What write and read concerns would you use for a payments ledger, and why?** `ADVANCED`

`{ w: "majority" }` on the write, and `{ readConcern: "majority" }` on anything a user sees
of that ledger. The reasoning is the failover case, not the happy path: `w: 1` acknowledges
after one node has the write, so a primary failure immediately after the acknowledgement
loses the entry — and a payments ledger that loses an acknowledged debit is not a bug you
can reconcile later. `w: "majority"` means the entry is on a majority of the replica set
before the write returns, so it survives the loss of a minority *and* survives a primary
failover, which is the case that actually happens. On the read side, `readConcern:
"majority"` returns data a majority has acknowledged, which combined with majority writes
gives read-your-writes and monotonicity across the failover: the new primary is guaranteed
to have the entry, so a user who just saw a debit acknowledged will see it after the
failover. `linearizable` is stronger and is not needed here — it reads from the primary and
can block on an election, which is a latency and availability cost a ledger read does not
need once the write concern is right. `w: 0` is never acceptable. And I would add the
operational half: a `wtimeout` on the write so a replica lag spike fails fast rather than
queueing, and an alert on oplog lag, because a majority write that is slow is a write that
is going to time out.

**S1. Review this schema, which passed review because the JSON Schema validator was turned
on and everything looked fine:** `ADVANCED`

```javascript
// collection: orders
{
  _id: "o#a1b2",
  customer: "u#12",
  lines: [
    { sku: "s#1", qty: 2, price_cents: 1500 },
    { sku: "s#2", qty: 1, price_cents: 800 }
  ],
  total_cents: 3800,          // 2*1500 + 1*800 = 3800  ✓
  status: "PAID",
  placed_at: ISODate("2026-09-25")
}
```

`s`

The validator is doing its job and the document still has two problems, which is the point
to make in the review. First, **the validator cannot check a cross-field invariant**: a
schema can require `total_cents` to be an integer ≥ 0 and it can require `lines` to be a
non-empty array, and it still cannot assert that `total_cents` equals the sum of
`lines[].price_cents * lines[].qty` — because JSON Schema has no way to express it. So
"we have validation" is not "we have constraints", and the invariant is application code
that a second writer can violate. The mitigation is either a `changeStream` consumer that
recomputes and alerts, or making the total a *derived* field that nothing persists, or
accepting it and saying so out loud. Second, **there is no `_id` discipline for sharding**:
`_id: "o#a1b2"` is fine unsharded, but if this collection is ever sharded on `customer`, then
`_id` must be globally unique and the unique index must have the shard key as a prefix, so
this `_id` would need to become `{ customer: "u#12", id: "a1b2" }`. That is a migration of
every document, and the moment to decide it is now. What is good here and should be said
out loud in the review: the address is *not* embedded, the customer name is *not*
denormalised, and the prices are snapshots at order time — all three correct, and none of
them obvious.

**P1. A support ticket says "customers see other people's names in the order summary".
Nothing in the logs. What is your diagnosis?** `SCENARIO`

Almost certainly a read-modify-write on an embedded sub-document, or a
denormalisation that has no read-repair story, and the reason there is nothing in the logs is
that the database is behaving exactly as configured. The classic mechanism is: the order
document embeds a copy of the customer's name, some code path does `GetItem`, mutates
`customer.name`, and `PutItem`s the whole document back — and a concurrent write to the same
order from the fulfilment service is lost, or a read of a *different* order's document is
caching a shared sub-document somewhere in the application. The second classic mechanism is
a `$lookup` in an aggregation that joins orders to customers and the pipeline is returning
the wrong pairing because the join key is not what the reviewer assumed. The investigation
is: reproduce with the exact item ids, check whether the wrong name is a *stale* value (a
consistency or lost-update problem) or a *wrong entity's* value (a join or caching problem),
because those have completely different fixes. The first is a condition expression or
`$set` on a field rather than a whole-document replace; the second is the join key.

**T1. An application writes `{ $set: { "items.0.qty": 3 } }` and another writes a full
document replace a second later. What does the reader see?** `TRICKY`

Both writes are atomic at the document level, so the reader sees one of them — but the
outcome depends on ordering, and the *ordering is the bug*. If the full-document replace
commits after the field update, it overwrites the whole document with whatever that client
believed the document to be, so the `$set` is silently reverted — a lost update, and the
symptom is a quantity that "went back". If it commits before, the field update wins. And
the hazard is worse than a race between two of your own writers: any client that read the
document before the field update will, on its replace, undo *every* change made in between
by every other writer, because a whole-document replace is a statement about the entire
document's contents. The rule: use positional or dotted-path updates for partial change,
never a full-document replace on a document that other writers touch, and if you need
"update if the document is in the state I read", that is optimistic concurrency with a
version field and a filter, and the write that fails the filter is the one you retry. A
whole-document replace as a "save" operation is the MongoDB equivalent of `PutItem` as a
partial update, and it fails the same way — silently.

### Choosing a Store

**D25. A team has outgrown their single Postgres primary. Walk me through how you would
decide whether the next step is a replica, a partition, or a different store.** `STAFF`

The order of the options is the answer, and I would insist on it because the sequence is
usually where the money is saved. First, measure: which query is actually slow, at what
rate, with what `EXPLAIN (ANALYZE, BUFFERS)`, and what is the write rate against the table
that is actually hot. A large share of "we have outgrown Postgres" is a missing index, a
stale `ANALYZE`, a sequential scan inside a write path, or `fsync` batching not matching
the storage — and those are days, not quarters. Second, if the bottleneck is *read* — CPU on
queries, or connection pressure — the answer is a read replica and a routing layer, and
that is a week. Third, if the bottleneck is *write throughput on one table* with a small,
fixed, known set of access patterns and no joins, then partitioning that table (Volume 6)
or moving it to a wide-column store are both legitimate, and the difference is who owns the
shard router and what a cross-shard query costs. Fourth — and only then — if the workload
genuinely needs write scale that one process cannot deliver on a never-joined workload,
a distributed store is the right answer, and at that point the real work is the access
pattern list and the partition key, not the migration. What I would not do is let the
conversation start at step four, because that is where a nine-month migration is proposed
in a design review where an index was the answer.

**D26. A startup has 200 GB of data, 40 queries, and 12 engineers. What do you recommend?**
`TRICKY`

Postgres, on almost any reasonable answer, and the reason is the shape of the numbers rather
than a preference for the familiar. 200 GB is not a data volume problem for a single
Postgres instance — it is a storage and backup problem, and it is solved with partitioning,
a managed service with snapshots, and possibly table storage on faster media, none of which
requires changing the data model. 40 queries is the decisive number, because the wide-column
stores' entire value proposition is that you must know your access patterns *in advance* and
get each one a table; 40 queries is an application whose requirements are still moving, and
every new query in a Cassandra or DynamoDB model is a table, a backfill, and a dual-write.
And 12 engineers is the number that decides the operational question: a team that small
should not be running a Cassandra ring, learning compaction and repair and hinted handoff
in production, because the on-call cost of a distributed store is paid by people who are
also building the product. The one exception worth naming is if the 40 queries include a
genuinely high-volume, never-joined, known-pattern workload — telemetry, an event log, a
feed — in which case a *narrow* migration of that one workload to DynamoDB on-demand, with
a deliberately small key schema, is defensible. The general principle: pick the store whose
operational cost your team can afford, and let the access patterns decide the rest.

**D27. What would make you refuse a NoSQL migration proposal?** `STAFF`

Three things, and I would say them in this order. First, **the access-pattern list does not
exist** — not "we have thought about it", but the artefact: every query, its key expression,
its rate, its item size. Without it, the proposal is a preference, and a preference cannot
be reviewed, cannot be costed, and cannot be migrated away from later. Second, **the
proposal is justified by a symptom with no measurement** — "the database is slow", "we need
horizontal scale", "the queries have got complicated" — because each of those has a cheaper
answer and I would want to see that answer tried or explicitly rejected in writing. Third,
and this is the one that ends the discussion: **the team does not have a way to build,
migrate, and operate the thing.** A store change is not a deploy, it is a data migration
with a dual-write window, a new set of operational runbooks, and a new on-call skill, and
if the plan does not include who writes the runbook and who gets paged at 3am, the plan is
not finished. I would also raise the window explicitly: this decision is cheap before there
is production data and expensive after it, and naming that is often the most useful thing
contributed to the room.

**P1. A company migrated 300 GB to Cassandra 18 months ago. Now every query is slow, nothing
works, and the team wants to go back to Postgres. What is the actual situation?** `SCENARIO`

This is a common and expensive shape, and the first thing to establish is whether the
problem is the data or the key schema, because they have very different outcomes. A
year-and-a-half-old Cassandra cluster that has slowed uniformly is usually carrying several
of the standard debts at once: partitions that have grown past a sensible size, a compaction
backlog, tombstone accumulation in a table that deletes heavily, and secondary indexes
added later under pressure. And the team will have added queries without adding tables,
which is the query-first rule's failure mode — every such query is an `ALLOW FILTERING`
scan or a 2i fan-out, and those get slower as the data grows rather than staying constant.
So the diagnosis is: this is not a "Cassandra doesn't scale" story, it is four specific
debts, and at least two of them (compaction strategy, tombstone handling, a
`gc_grace_seconds` that was lowered to compensate) are fixable in weeks. The *migration*
back to Postgres, meanwhile, is not "going back" — it is a second migration, out of a
system whose data model was built around the target's access patterns, and the duplicate
columns that made the first migration possible are the reason the data is awkward now. So
the honest recommendation is a diagnosis week with a per-query and per-partition profile, a
list of the access patterns, and a decision about which of the debts is worth fixing — and
only then a conversation about where the data should live. The thing I would push back on
hardest is "migrate back" as a first response, because it is a symptom-level reaction to a
set of fixable operational problems.

**S1. Review this handler and tell me what the store should have been.** `STAFF`

```javascript
// POST /orders — 40,000 orders/day, 3 lines each, read by customer and by region
const order = {
  id: uuid(), customerId, customerName, customerAddress,
  region, status: "PENDING",
  items: await Promise.all(lines.map(l => db.collection("inventory").findOne({ sku: l.sku })))
};
await db.collection("orders").insertOne(order);
```

`S`

Five problems, in order of cost. **The N+1 read**: one `findOne` per line item, three
round trips before the write even starts, on the write path of every order. If the inventory
data is needed, either embed a small bounded copy of what the order needs at the time of
ordering (sku, name, unit price — a snapshot, which is *correct* for an order anyway because
the price at order time is the price), or batch the lookup. **The unbounded embed**:
`customerAddress` embedded into the order is defensible precisely because an order's address
is a *snapshot* that must not change, and the reviewer should say so out loud — the same
pattern applied to `items` as a growing array would be the 16 MB problem. **`customerName`
denormalised without a decision**: is it a snapshot or a projection? For an order, a snapshot
is right, and the comment should say "snapshot, intentional". **No uniqueness and no
idempotency**: a `uuid()` generated server-side with no idempotency key means a client retry
after a timeout creates a second order, and in a relational store the natural answer is a
unique constraint on an order reference. **`status` as a plain field**: any state change is
a read-modify-write with no guard, which is the MongoDB equivalent of the lost-update race
in DynamoDB — it needs a filter on the current state or an optimistic version. And the store
question: 40,000 orders a day is nothing for Postgres, the three reads are a `JOIN`, the
snapshot semantics are a normal row, and "read by customer and by region" is two indexes
and a partition. I would push back on the store choice *and* on the handler, and I would
raise the write-amplification of the four downstream writes the design is heading toward
without anyone having decided the consistency levels yet.

**T1. A team is rewriting a Cassandra data model to fix query performance. What should the
access-pattern list look like before they start, and what is the rollback if the new model
is worse?** `TRICKY`

The list should be one page, with one line per pattern: the pattern as a `WHERE` clause, its
expected rate, the item size, and — critically — the table that serves it in the *current*
model and the table that will serve it in the new one. That last column is what turns a
design review into a migration plan, because it exposes the facts that decide whether the
rewrite is worth it: how many new tables, how many writes per entity, and which existing
queries have no point read in the new model. On rollback, the important point is that a
data-model rewrite is not roll-backable in the transactional sense — the old model is still
being read while the new one is being written, so the rollback is a *read-path* switch
rather than a data revert, and it requires the dual-write to have been running long enough
that the old model is complete. Which means the sequencing rule: dual-write first, verify
both models are complete and correct against each other, backfill anything written before
the dual-write started, switch reads, keep the dual-write for a defined window, and only
then delete the old tables. A rewrite that skips the verification step is a rewrite that
discovers its own bugs in production, and the verification — a comparison query between the
two models, run continuously — is the artefact nobody writes and everybody needs.
