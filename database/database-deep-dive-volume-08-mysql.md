---
title: "The Database Complete Deep-Dive"
volume: 8
series: "MYSQL"
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
it cost, when does it break, and how expensive is it to undo?"** Volume 8 takes that
question to the engine most teams actually run. MySQL is the world's most deployed
relational database, it is the default in a hundred managed services, and almost nobody
running it can explain why it makes the trade-offs it makes. The vocabulary — buffer
pool, clustered index, undo log, redo log, next-key lock, read view — is treated as the
visible surface of a storage engine and a concurrency protocol, and the notes always go
down to that machinery, because that is the layer where production incidents live.
This volume is built around one fact that most people get wrong, and getting it wrong
colors every other answer they give. **In InnoDB the clustered index *is* the table.** The
row is not in a heap somewhere with an index pointing at it — the row *is* the leaf entry
of the primary key B+ tree. Everything else in the engine follows from that: why a
secondary index lookup that needs a column it does not store costs a second B+ tree
descent (the *回表*, the "return to table"); why a wide table punishes point lookups; why
a random `UUID` primary key shreds write throughput through page splits; why reads on
InnoDB are competitive with engines that have a real heap; and why writes are more
expensive than on a heap-based design. Volume 1 Chapter 2 built the heap-and-pointer
contrast — page locators, a second random read, slots that survive deletes. This volume
is the other side of that picture.

The second half of the volume is the concurrency story, because MySQL's is genuinely
unusual and genuinely load-bearing. MySQL's default isolation level is `REPEATABLE READ`,
not `READ COMMITTED` and not `SERIALIZABLE`, and it earns that default with a mechanism
no other mainstream engine uses: **next-key locking**, which locks the *gaps* between
records so that a `WHERE` predicate over a range cannot later be surprised by a row that
did not exist when the statement started. That single mechanism explains why

`SELECT ... WHERE id BETWEEN 10 AND 20 FOR UPDATE` blocks a concurrent `INSERT` of
`id = 15` even though `id = 15` was never there. It also explains why a team that
switches to `READ COMMITTED` suddenly gets less blocking *and* less protection, and it
explains the deadlocks people spend years learning to recognise rather than prevent. The
read view — created per transaction under `REPEATABLE READ` and per statement under
`READ COMMITTED` — is the other half, and it explains every remaining behavioural
difference between the two levels.

Volume 7 is the PostgreSQL contrast and this volume does not repeat it. Where the two
engines solve the same problem differently — process model, MVCC visibility, vacuum
versus purge, planner statistics — the comparison is stated as a comparison, because the
*difference* is the lesson and because an interviewer who has heard both answers is
testing whether you can hold two designs in your head at once. Volume 5 owns ACID, the
anomalies and isolation levels in general; Volume 4 owns B+ trees, the leftmost prefix rule
and reading `EXPLAIN` in general. This volume is the MySQL mechanism underneath all of
it, and it is where those ideas stop being abstract.

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

### Continuing From Volume 7

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 (this book) | MySQL — InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

What Volume 7 gave you is the *other* mainstream relational engine, built the other way:
one process with many backends, a heap of versioned tuples, a snapshot per statement, a
planner with a lot of opinions, and an autonomous cleaner that reclaims space. This volume
takes the same seven problems — how do you store a row, how do you make it visible to one
transaction and not another, how do you stop two writers colliding, how do you reclaim
space, how do you keep reads fast, how do you survive a crash, how do you scale out — and
shows the MySQL/InnoDB answer to each. Nothing here is new theory. It is the second half
of the comparison.

### Table of Contents — Volume 8

- Chapter 1 — Architecture & the InnoDB Engine
- Chapter 2 — InnoDB Storage & the Clustered Index
- Chapter 3 — MVCC & the Undo Log
- Chapter 4 — Indexes & Index Design
- Chapter 5 — Locks, Gaps & Deadlocks
- Chapter 6 — Isolation Levels
- Chapter 7 — Partitioning, Optimisation & Statistics
- Chapter 8 — Replication, Sharding & the Operational Surface
- Chapter 9 — Interview Scenario Bank

---

# Part 1 — MySQL & the InnoDB Engine

## Chapter 1 — Architecture & the InnoDB Engine

### 1.1 "MySQL" Means Two Different Things in a Conversation

The first thing to get right is that MySQL is a *server* with a pluggable storage layer, and
almost every confusing conversation about MySQL is a conversation in which the two halves
were talking past each other. MySQL is the **server**: connection handling, a SQL parser,
a query optimiser, a privilege system, a binary log, replication, a `mysql` client. InnoDB
is one **storage engine** that plugs into it, and since MySQL 5.5 the default table engine
and effectively the only one that matters.

```text
┌───────────────────────────────────────────────────────────────────────────┐
│  MYSQL SERVER  (mysqld)                                                    │
│                                                                           │
│  ┌─────────────┐  ┌────────────────────────────────────────────────────┐  │
│  │ CONNECTIONS │  │  SQL LAYER                                          │  │
│  │  thread/    │  │  parse → preprocess → rewrite (const subquery,      │  │
│  │  connection │  │    derived merge) → optimise → execute              │  │
│  └─────────────┘  └────────────────────────┬───────────────────────────┘  │
│                                            │ handler API                │
│  ┌─────────────────────────────────────────┴──────────────────────────┐  │
│  │  STORAGE ENGINE LAYER  (the pluggable part)                        │  │
│  │  ┌──────────────┐ ┌──────────┐ ┌────────┐ ┌────────┐ ┌─────────┐  │  │
│  │  │ InnoDB       │ │ MyISAM   │ │ MEMORY │ │ CSV    │ │ ARCHIVE │  │  │
│  │  │ clustered    │ │ no txn   │ │ in-RAM │ │ flat   │ │ rows    │  │  │
│  │  │ idx + undo   │ │ no locks │ │        │ │        │ │ only    │  │  │
│  │  └──────────────┘ └──────────┘ └────────┘ └────────┘ └─────────┘  │  │
│  └────────────────────────────────────────────────────────────────────┘  │
│  ┌────────────────────────────────────────────────────────────────────┐  │
│  │  BINLOG (server level — the engine does not know it exists)        │  │
│  └────────────────────────────────────────────────────────────────────┘  │
└───────────────────────────────────────────────────────────────────────────┘
```

Three things fall out of that picture, and each one answers a question that comes up in
almost every MySQL interview.

**The engine boundary is a real abstraction, not marketing.** You can `CREATE TABLE
archived_events (...) ENGINE=ARCHIVE`, and that table has no indexes, no transactions and
no row modification after insert — while the table next to it in the same schema is fully
transactional. The server does not know or care which is which; it talks to the engine
through a handler interface. This is the same layered structure Volume 1 introduced, and
it is why "MySQL is not ACID" was a true sentence in 2006 and is false now.

**The binlog lives above the engine.** The binary log is the server's record of *what
changed*, written in a form another MySQL can replay. It knows nothing about InnoDB, which
is why the same binlog can feed a replica using a completely different storage engine, and
why an engine change does not lose your replication. It is also why the binlog and the
InnoDB redo log are two different logs with two different jobs, and confusing them is one
of the most common conceptual errors in this area. The redo log is InnoDB's internal
crash-recovery log and is written in InnoDB's own page-oriented format. The binlog is a
server-level, transaction-ordered change stream for replication and point-in-time
recovery. Commit needs the redo log flushed. It needs the binlog flushed only if
`binlog` is enabled, and the two are coordinated by a two-phase commit *between the logs*
so a crash can never leave a transaction half in the binlog.

**A non-InnoDB table is a different database wearing MySQL's clothes.** MyISAM has no
transactions, no MVCC, table-level locking only, and its own crash-recovery log. An
application with one MyISAM table in it has no transactions for that table, full-table
locks on write, and an `ALTER TABLE` that copies the file. The correct senior answer to
"we still have some MyISAM tables" is that this is a *migration* task, and that

`ALTER TABLE t ENGINE=INNODB` is the first step of it, not a scary one — it is online
(using `ALGORITHM=INPLACE` with a brief exclusive lock at the end), and the table's size
is what determines the risk.

> **INTERVIEW TRAP — "MYSQL IS NOT ACID-COMPLIANT"**
>
> It has been since 5.5. Before that, InnoDB was an optional third-party engine with
> transactions and MyISAM was the default without them, and the phrase was a fair
> description of the out-of-the-box product. The interesting part is what the phrase gets
> you to think about, which is worth saying out loud in an interview: MySQL's atomicity
> and durability are *tunable at commit time*. `innodb_flush_log_at_trx_commit` and
> `sync_binlog` together define what "committed" means, and the fully durable setting
> (`1` and `1`) is not the fastest one. A senior answer says: InnoDB is ACID, and the
> guarantee is a configuration choice that most teams have never consciously made.

### 1.2 The Server Layer: Connections, Threads and What They Cost

MySQL is fundamentally **thread-per-connection**. Each client connection that is not using
a connection pool is assigned a thread inside `mysqld` that owns that connection's session
state — `sql_mode`, `autocommit`, the isolation level, temporary tables, prepared
statements, the session's `sort_buffer` and `join_buffer` and `read_buffer` and

`tmp_table_size`, the optimizer trace, the session's transaction. That has consequences
that are still true in MySQL 8.0 and that nobody notices until a connection storm.

```text
   client A        client B        client C        client D
      │               │               │               │
      ▼               ▼               ▼               ▼
  ┌──────┐        ┌──────┐        ┌──────┐        ┌──────┐
  │THREAD│        │THREAD│        │THREAD│        │THREAD│   1 OS thread
  │  #41 │        │  #87 │        │  #92 │        │ #118 │   per connection
  └──┬───┘        └──┬───┘        └──┬───┘        └──┬───┘
     └───────────────┼───────────────┼───────────────┘
                     ▼
        ┌──────────────────────────────┐
        │  SHARED INNODB STATE         │  buffer pool, adaptive hash index,
        │  buffer pool, data dictionary │  lock system, log files, undo
        │  lock system, logs, cache    │  — shared by all of them
        └──────────────────────────────┘
```

The consequences that matter at senior level:

- **Context switching is the cost.** The default thread model is a runnable OS thread per
  connection, and at a few thousand active connections the scheduler cost shows up as
  *latency*, not CPU — the query is fast, the queue to run it is not. MySQL's answer was
  the `thread pool` plugin, which multiplexes many connections onto a small number of
  threads and keeps the per-thread state in per-connection buffers instead of per-thread
  ones. It is not the default, it is a plugin, and it matters more at 5,000 connections
  than at 500.
- **Connection acceptance is a DoS surface.** Each connection costs a thread and memory
  before it sends a single byte. `max_connections` and `back_log` are the two knobs, and
  setting `max_connections` to 10,000 to "fix" a connection error is a well-known way to
  turn a capacity problem into an outage, because 10,000 threads will exhaust memory
  before 10,000 useful queries run. The *right* answer at any scale above a handful of
  instances is a connection pool in the application and a `max_connections` sized to what
  the instance can survive.
- **Per-connection memory is invisible in `SHOW PROCESSLIST`.** A connection running
  `ORDER BY` on a bad plan may hold a 32 MB `tmp_table_size` and a `sort_buffer` at the
  same time. 200 such connections is 6 GB. This is why "the database used all its memory
  and I don't see a query doing anything" is a real incident shape, and why
  `performance_schema` session memory instrumentation exists.
- **Idle transactions hold everything open.** A connection with `autocommit=0` that
  executed a `SELECT` two hours ago still holds a read view open. That blocks purge, which
  grows the undo log, which slows every read. Chapter 3 is entirely about this, and it is
  the single most common MySQL "the database got slow for no reason" cause.
> **STAFF-LEVEL CONSIDERATION**
>
> The thread-per-connection model is a capacity decision your team inherits and an
> availability decision your team should make on purpose. The org-level version of this
> question is not "which thread pool plugin" — it is: do we have a connection-count budget
> per instance, is it monitored as a saturation metric rather than discovered during a
> cascade, and does every team's application pool respect it? Most database outages that
> are called "performance problems" are actually connection storms, and they are prevented
> by a review rule rather than by an engine setting.

### 1.3 The InnoDB Engine and Its Moving Parts

The buffer pool, the change buffer, the redo log and the undo log are four different
caches or logs doing four different jobs, and the standard confusion is that they are all
called "logs" or "buffers" and get conflated. This is the whole engine in one diagram.

```text
   a DML statement
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 1. BUFFER POOL  (innodb_buffer_pool_size, default 128 MB)               │
│   the cache of 16 kB pages. This is where the working set lives.        │
│   LRU list split 3:5 young/old with midpoint insertion.                 │
│   Dirty pages sit here until a checkpoint.                              │
└───────┬───────────────────────────────────────────────────────▲─────────┘
        │ page miss → read from tablespace                          │ write
        ▼                                                              │
  ┌───────────┐                                                    │
  │ OS / disk │                                                    │
  └───────────┘                                                    │
                                                                       │
   a secondary-index MODIFICATION to a page NOT in memory:            │
        │                                                           │
        ▼                                                           │
┌────────────────────────────────────────────────────────────────────────┐
│ 2. CHANGE BUFFER  (innodb_change_buffer_max_size, default 25% of pool) │
│   Buffers the *index* part of an insert, never the row.               │
│   Merged when the page is eventually loaded.                          │
│   A non-sequential index insertion becomes a single sequential write. │
└────────────────────────────────────────────────────────────────────────┘
   every change, of any kind, appended here:
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 3. REDO LOG  (innodb_redo_log_capacity, 100 MB default in 8.0.30+)    │
│   InnoDB's WAL. Physical, page-oriented, circular.                    │
│   Commit = write here + flush here (innodb_flush_log_at_trx_commit=1).│
│   Crash recovery = replay from here. Checkpoints advance the circle.  │
└────────────────────────────────────────────────────────────────────────┘
   the before-image of a row, for readers that need the old version:
        │
        ▼
┌────────────────────────────────────────────────────────────────────────┐
│ 4. UNDO LOG  (innodb_undo_log_tablespaces, undo tablespaces)           │
│   How MVCC works. A reader that needs a pre-image walks the undo chain.│
│   Purge deletes undo records no live read view can need.               │
└────────────────────────────────────────────────────────────────────────┘
```

Now each one in the terms an interviewer wants.

**The buffer pool is the engine's cache and its only cache.** There is no separate index
cache in InnoDB; index pages, clustered pages, undo pages and (in older versions) temporary
tables all live in the same pool and compete for the same space. That single fact explains
a family of tuning advice: your buffer pool is not sized for "your data" but for "your hot
data *plus* the mix of everything else", and the way to find the hot data is

`performance_schema` `innodb_buffer_pool` instrumentation, not a guess. The default
128 MB is a placeholder for development, not for production.

The pool is organised as a list of instances (large servers get several, each an
independent LRU list, which reduces latch contention by letting threads contend within
one region rather than across the whole pool), and each instance's LRU list is split
**3:5 young/old** with midpoint insertion. A page that is read in is inserted at the
*midpoint* rather than the head, so it has to be read again before it is considered hot.
This is the mechanism behind the "warm up the database after a restart" advice: a fresh
pool has no evidence about what is hot, and a burst of full scans will evict the pages you
actually care about. `innodb_old_blocks_pct` and `innodb_old_blocks_time` are the knobs;
on 8.0+ you also get a proper LRU sampling algorithm

(`innodb_lru_scan_depth`, and adaptive LRU resizing) that is better than hand-tuning
those two. On top of all of that sits the **adaptive hash index** — an in-memory hash
over `(space_id, page_no)` for equality lookups on pages that keep being hit. It is
transparent, it is per-instance, and it can be turned off globally

(`innodb_adaptive_hash_index=OFF`) which is the standard first move on

"the CPU is inexplicably high on a read-heavy workload", because a hot hash index that is
being rebuilt can consume a surprising share of cores.

**The change buffer is the one everyone misdescribes.** It does not buffer writes in
general. It buffers the *modification of a secondary index* for a page that is **not in
the buffer pool**, and it never buffers the clustered index or the row itself. The reason
it exists is that a secondary index insertion is normally a random read-modify-write: find
the leaf page, read it, insert into the correct position, write it back. If that leaf page
is not in memory, you have just paid a random I/O to update an index that is almost
certainly not what the next query wants. Instead, InnoDB writes a small record describing
the change into the change buffer area, which is sequential, and merges it into the real
page the next time that page is read in for any reason. The classic case where this pays
for itself enormously is a bulk load into a table with a secondary index where the
secondary index is far larger than memory and the loads are in primary key order.
The cost, and the reason to think twice, is exactly what the brief description of it gets

right: **if the page gets loaded for another reason before it is needed, the merged change

was pure overhead.** You paid a sequential write to the change buffer, then a read of the
page, then a merge write. The change buffer is a bet that the page will not be read soon
— and it is a bet that loses on random-access workloads. That is why it is most valuable
for monotonically increasing secondary keys on an append-heavy table, and nearly worthless
on a random-UUID work queue table. In MySQL 8.0.20 the old

`innodb_change_buffering` enum (`none`/`inserts`/`changes`/`purges`/`all`) was removed
because the benefit was judged to outweigh the cost; the merge threads and the sizing
knob remain. Chapter 4 returns to this with the index-design conditions that make it
win or lose.

**The redo log is the write-ahead log and it is circular.** Every change to any page is
appended to it before or as the page is modified. Because the log contains enough
information to reconstruct the page, a dirty page can be evicted from the buffer pool
without ever being written to the tablespace — the eviction is a `memcpy` of memory and
nothing else, which is the whole reason the log exists. When the log fills, InnoDB cannot
checkpoint (cannot flush dirty pages and advance the start LSN) and every write starts
stalling. This is the behaviour behind the classic tuning advice: make the redo log big
enough that checkpoint flushing is continuous rather than bursty. `innodb_redo_log_capacity`
(default 100 MB in 8.0.30+, replacing the old `innodb_log_file_size` ×

`innodb_log_files_in_group` pair) is a *capacity*, not a file count, and modern guidance
is to set it to roughly 20–30 minutes of write volume so a bulk load or a large `UPDATE`
does not turn into a throughput collapse.

Two supporting structures are worth naming because they appear in every incident review:
the **doublewrite buffer**, which protects against a torn page when the device lies about
a completed write (it writes the page to a sequential area first, then writes the real
page, then later the real page again, and uses the buffer to repair any page that fails
checksum validation on read), and the **adaptive checkpoint**, which advances the flush
point aggressively when the redo log is small and lets it drift when the log is large,
which is the mechanism that makes a bigger log smoother.

**The undo log is the other half of concurrency and it is not a recovery log.** It stores
the *before image* of a row so that a transaction with an older read view can still see the
row as it was. The redo log answers "what did we change"; the undo log answers "what did it
look like before". They are written in the same statement, they are sized and tunnelled
completely independently, and a beginner who says "MySQL has a transaction log" and means
the redo log has just described the wrong one of the two. The undo log is Chapter 3.

> **MUST REMEMBER**
>
> The four structures have four jobs and never substitute for each other: **buffer pool** =
> where hot pages live, **change buffer** = deferred secondary-index edits for cold pages,
> **redo log** = InnoDB's crash-recovery WAL, **undo log** = the before-images that make
> MVCC possible. Every InnoDB tuning argument in the wild reduces to "which of these four
> is the bottleneck", and you cannot answer that without knowing which one does what.

### 1.4 The Same Problem, Two Engines: A Comparison

Volume 7 covered PostgreSQL. The most useful thing a candidate can do in a MySQL interview
is place the two side by side and be precise about *why* each side chose what it chose,
because "MySQL is different" scores zero and "both are right for different read-to-write
ratios" scores well.

| Problem | PostgreSQL (Volume 7) | MySQL / InnoDB (this volume) | Consequence |
| --- | --- | --- | --- |
| Process model | one process, many backends, shared memory | one process, thread per connection, shared structures | connection count is a capacity budget; thread pool matters at scale |
| Row storage | heap of slotted tuples, unordered | **clustered B+ tree — the index is the table** | reads are more uniform, writes pay page splits |
| Row locator | `(block, offset)` in the heap | nothing — the row *is* the leaf entry | no second random read, but a wide row is always fully read |
| Row versioning | new tuple per update, old tuple marked dead in the heap | new version written into the clustered index, old value in undo | a long transaction's updates can block purge badly |
| Snapshot | one snapshot per *statement*, always | read view per statement under RC, per *transaction* under RR | the RR/RC difference is the single biggest behavioural fork |
| Phantom prevention | MVCC: a snapshot simply does not see later rows | **next-key locks**: the range is locked, not just the version | gaps are locked; `FOR UPDATE` on a range blocks inserts |
| Space reclamation | `autovacuum` + `VACUUM`, and `VACUUM FULL` rewrite | `purge` thread walks the undo history list | a long transaction starves the reclaimer; same failure shape as PG's vacuum starvation |
| Statistics | `ANALYZE`, `pg_statistic`, per-column MCV + histograms | `ANALYZE TABLE`, `innodb_stats_persistent`, per-index cardinality + column histograms | both are estimation, both break silently when stale |
| Write amplification from replication | physical WAL segments shipped | logical/row events in the binlog | MySQL needs logical decoding; PG ships physical and needs logical for CDC |
| Crash recovery | WAL replay, with a `recovery_target*` control | redo log replay, with a `recovery_target*` control | both are WALs; the tunnelling of the log size is the tuning point |

Two rows deserve to be read twice because they are the differences that generate almost
every "why is MySQL like that" question.

**The phantom-prevention row.** PostgreSQL prevents phantoms with MVCC alone: a statement's
snapshot was taken at statement start, so a row inserted by a concurrent transaction simply
is not in your snapshot, at any isolation level below `SERIALIZABLE`. It takes a lock to
prevent it, and it takes a real predicate lock under `SERIALIZABLE`. InnoDB at

`REPEATABLE READ` instead *takes locks on the gaps in the index* so that a concurrent
insert physically cannot complete while your transaction is open. That is a more
aggressive answer — it is safer, it gives you first-reader-wins semantics rather than
first-committer-wins — and it is also the reason MySQL has a reputation for

"serialises more than it should". Chapter 5 and Chapter 6 are entirely about the
consequences.

**The space-reclamation row.** Both engines reclaim dead row versions by a background
worker that can only discard what no live snapshot needs, and in both engines the same
thing happens: one long-running transaction pins the oldest version, the backlog grows,
and every read that has to walk a version chain gets slower. It is the same failure, in
two engines, from two different mechanisms, and recognising it in MySQL is Chapter 3 and
recognising it in PostgreSQL is Volume 7. If you can say that in one sentence you have
demonstrated you understand a *protocol* rather than a *product*.

### 1.5 Choosing an Engine, and Choosing a Configuration, on Purpose

The MyISAM question is settled in every codebase that still has it, so the useful senior
answer is the migration argument rather than the trade-off argument.

```sql
SELECT ENGINE,
       COUNT(*)   AS tables,
       ROUND(SUM(DATA_LENGTH + INDEX_LENGTH)/1048576) AS total_mb
FROM   information_schema.TABLES
WHERE  TABLE_SCHEMA = 'shop'
GROUP  BY ENGINE;
-- What is left to migrate, and how big is it?
ENGINE    tables   total_mb
------    ------   -------
InnoDB        84       41093
MyISAM         3          612
```

`ALTER TABLE events_2019 ENGINE=INNODB;` on a 200 MB table is a normal operation. For
large tables, do it with Percona Toolkit's `pt-online-schema-change` or `gh-ost`
(Chapter 8) rather than inline, and watch the replication lag while it runs because the
table copy is a giant burst of writes that the replica has to apply behind you.

The configuration choices a team should make deliberately rather than inherit:

- **`innodb_flush_log_at_trx_commit`.** `1` = flush the redo log at every commit, which is
  the durable setting and means one device sync per commit. `2` = write to the OS at
  commit, flush to device once per second, so you can lose about a second of committed
  transactions on an OS crash but not on a device failure. `0` = never flush; you lose
  committed transactions on an OS crash. The trade is throughput against an RPO of up to
  one second, and it is a legitimate choice for a derived cache rebuildable from a source
  of truth. It is not a legitimate choice for a payments ledger, and nobody has ever
  successfully argued that it is for one.
- **`sync_binlog`.** `1` is the durable pairing. `0` means the binlog lives only in the
  OS page cache, so a replica — including a replica you are using to survive a datacenter
  loss — can be missing transactions that the primary believes are committed. This is a
  real, widely-executed mistake and it is worth naming: with `sync_binlog=0` you have
  lost ACID's durability *for the replicas*, not for the primary.
- **`innodb_buffer_pool_size`.** The one number that is worth getting right. 70–80% of
  RAM on a dedicated host; much less on a shared instance, and the correct value on a
  shared instance is "whatever the platform says the instance has", not "whatever the
  host has".
- **`innodb_flush_method`.** `O_DIRECT` is the default and the right answer, because it
  bypasses the OS page cache so there is exactly one copy of your data in memory rather
  than two, and so a read does not pollute the cache with pages the engine will evict
  itself anyway.
> **PRODUCTION RELEVANCE**
>
> Every one of these is a setting somebody changed once, in a hurry, and nobody wrote
> down. They survive because there is no test that fails when you change them and no
> alert that fires when they are wrong. The organisational fix is the same as the technical
> one: put the durability-relevant settings in version control as infrastructure code,
> with a comment stating the RPO you are accepting, so that "what is our RPO" has an
> answer that is not "whatever the default was on the box someone provisioned".

#### Common Mistakes

- Saying "MySQL is not ACID" without qualifying that this was true before 5.5 and that the
  guarantee is now a *configuration* choice rather than a property
- Conflating the redo log with the binlog, or the undo log with either of them — three
  logs, three jobs, three owners
- Describing the change buffer as a general write buffer; it buffers *secondary index*
  modifications for *non-resident* pages and nothing else
- Saying "the row is stored in a heap and the clustered index points at it" — there is no
  heap in InnoDB
- Believing the default 128 MB buffer pool and 48 MB-ish redo log are production
  recommendations; they are library defaults
- Answering "which engine?" as a live trade-off in 2026 — MyISAM is a migration, not an
  option

#### Interview Questions — Architecture & the Engine

**Q1. What is the change buffer, and when is it a bad idea?** `ADVANCED`

It buffers the modification of a *secondary index* for a page that is not in the buffer
pool, so that an otherwise random read-modify-write of an index leaf becomes a sequential
write into the change buffer, merged into the real page the next time that page is read.
It is a good idea on a monotonically increasing secondary key in an append-heavy table
being bulk loaded, where the index is larger than memory and loads arrive in primary key
order. It is a bad idea whenever the page is likely to be read soon for an unrelated
reason, because then you have paid for a write, a read and a merge, and the merge was
pointless — and it is worthless on random-key workloads, which is exactly the shape of a
UUID-keyed work queue. In MySQL 8.0.20 the on/off enum was removed because the benefit was
judged to dominate; the size knob remains.

**Q2. Your `innodb_buffer_pool_size` is 128 MB on a 64 GB host. What is actually wrong?** `STAFF`
Two things, and the second is the one people miss. The first is that the pool cannot hold
the working set, so you are doing physical I/O on reads that should be memory hits, and
the LRU is churning. The second is that the pool is not the only memory consumer — MySQL
allocates per-connection `sort_buffer`, `join_buffer`, `read_buffer`, `tmp_table_size` and
`net_buffer` on demand, plus the redo log, the undo log, the adaptive hash index, the
table definition cache and the connection threads themselves. Sizing the pool at 80% of
RAM with the default `tmp_table_size` and a connection count of 500 will OOM the host
under a burst of large sorts, because the 20% was never sized against anything. The
correct answer to "how big should the buffer pool be" is measured from

`performance_schema` hit-rate and page-read counters for a representative workload, and it
is on a dedicated host, not a shared one.

**Q3. What is the redo log for, and what happens when it fills up?** `TRICKY`

It is InnoDB's write-ahead log, and it exists so that a dirty page can be evicted from the
buffer pool without being written to the tablespace — durability moves from the page to
the log. When it fills, InnoDB cannot advance the checkpoint because it cannot flush the
dirty pages the checkpoint depends on, so writes stall. The visible symptom is a workload
that is fast, then suddenly flat, then fast again on a cycle, and the cause is that a
small circular log forces a bursty checkpoint: flush everything hard, wait, fill it
again. Sizing the log to hold 20–30 minutes of write volume turns the burst into a
continuous background trickle, which is the actual reason modern advice sets

`innodb_redo_log_capacity` in the hundreds of megabytes to low gigabytes instead of
leaving it at 48 MB.

> **CHAPTER 1 SUMMARY**
>
> "MySQL" is a server *and* a pluggable engine, and most confusion is the two halves
> talking past each other — the binlog belongs to the server, undo and redo belong to
> InnoDB, and the handler interface between them is why an engine change does not lose your
> replication. The engine has four structures with four jobs that never substitute for each
> other: the buffer pool holds hot 16 kB pages, the change buffer defers secondary-index
> edits to cold pages, the redo log is the WAL that makes eviction cheap, and the undo log
> holds the before-images that make MVCC possible. Held next to PostgreSQL, two differences
> generate nearly every "why is MySQL like that" question — InnoDB locks *gaps* to prevent
> phantoms rather than relying on the snapshot alone, and a single long transaction starves
> `purge` in exactly the way it starves `autovacuum` in PostgreSQL. The configuration
> choices that matter are the ones that quietly define your RPO: `innodb_flush_log_at_trx_commit`
> and `sync_binlog`.

#### Further Reading

- [The MySQL Architecture — InnoDB Storage Engine](https://dev.mysql.com/doc/refman/8.0/en/inndb-architecture.html) — the official two-layer picture, and where every subsystem lives.
- [InnoDB Redo Log](https://dev.mysql.com/doc/refman/8.0/en/innodb-redo-log.html) — checkpoints, log capacity, and exactly what happens when the log wraps.
- [InnoDB Change Buffer](https://dev.mysql.com/doc/refman/8.0/en/innodb-change-buffer.html) — the real mechanism, including why it never buffers the clustered index.
- [MySQL 8.0 Reference Manual — InnoDB Buffer Pool](https://dev.mysql.com/doc/refman/8.0/en/innodb-buffer-pool.html) — instances, LRU algorithm, midpoint insertion, resizing and the adaptive hash index.
- [MySQL 8.0 Reference Manual — Storage Engines](https://dev.mysql.com/doc/refman/8.0/en/storage-engines.html) — the pluggable engine interface and what each engine actually supports.

## Chapter 2 — InnoDB Storage & the Clustered Index

### 2.1 Pages, Extents and Tablespaces

InnoDB's unit of I/O is a **16 kB page**, fixed at instance initialisation by

`innodb_page_size` (4 kB, 8 kB, 16 kB, 32 kB, 64 kB are the legal values, chosen before
`mysqld` writes anything and not changeable afterwards). A page is allocated from an
**extent** — 1 MB, which is 64 consecutive 16 kB pages, allocated contiguously so a
sequential scan can be prefetched as one large I/O. Pages within an extent fill from the
end backwards, which is why a page is partially full when fresh and a sequential append
produces pages that are dense.

The page layout is not an academic detail, because the header and trailer bytes are pure
overhead per page and the infimum/supremum records are what make the "no rows on this
page" case cheap:

```text
┌──────────────────────────────────────────────────┬─────────────┐
│ FIL HEADER                     38 bytes          │             │
│   space id, page no, prev/next page (in extent), │  the page's │
│   LSN, checksum, page type, flush LSN            │  identity   │
├──────────────────────────────────────────────────┼─────────────┤
│ PAGE HEADER                    56 bytes          │  free space │
│   PAGE_N_DIR_SLOTS, PAGE_HEAP_TOP, PAGE_N_HEAP,  │  offsets    │
│   PAGE_FREE, PAGE_GARBAGE, PAGE_LAST_INSERT,     │             │
│   PAGE_DIRECTION, PAGE_N_DIRECTION, PAGE_N_RECS,  │  the "page │
│   PAGE_MAX_TRX_ID, PAGE_LEVEL, PAGE_INDEX_ID     │  directory" │
├──────────────────────────────────────────────────┴─────────────┤
│ INFIMUM RECORD (the "first" pseudo-record, marks the lower bound)  │
│ ░░░░░░░░░░░░░░░░░░ free space ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░ │
│ SUPREMUM RECORD (the "last" pseudo-record, marks the upper bound)  │
├──────────────────────────────────────────────────┬─────────────┤
│ USER RECORDS  — the slotted array, 2 bytes each  │  user data  │
└──────────────────────────────────────────────────┴─────────────┘
```

Two things in that layout earn their keep in production. The **infimum and supremum
records** are always present, one at the very start and one at the very end of the index,
and they form the boundary of the key space. When InnoDB takes a *gap lock* on an empty
range, the supremum record is frequently the thing that is actually locked — which is
why a "select nothing" locking read on a table still blocks inserts. And the **page
directory** is a small array of offsets, spaced by `PAGE_DIR_SLOT_SIZE` (4 bytes for the
16 kB page, so 16 kB / 4 = 4096 → 2 kB of the page is the directory ceiling), which is
how a B+ tree does a binary search inside a page without scanning the page linearly.
`innodb_file_per_table = ON` (the default since 5.6) means each table's data and indexes
live in one `.ibd` file. That is the right default and the alternative is close to
unacceptable operationally: the shared tablespace cannot be defragmented, cannot be
returned to the OS, cannot be backed up or restored per table, and grows without bound as
tables are created and dropped. Chapter 8 covers what the `.ibd` file enables, because
online schema change and partial restore both depend on it.

### 2.2 The Clustered Index *Is* the Table

This is the fact the volume is built on, and it is worth stating three different ways
before showing the mechanism.

1. There is **no heap** in InnoDB. The rows of a table live in the leaf pages of a B+ tree
   keyed on the primary key. The tree *is* the table. There is nothing else to look in.
2. Because the tree is keyed on the primary key, the **physical order of the rows is the
   key order**. A `SELECT` with no `ORDER BY` returns primary key order, which is why
   MySQL tables *appear* to return rows in insertion order when the key is monotonic and
   why that appearance is false the moment the key is not monotonic.
3. Because the whole row is at the leaf, **a point lookup reads the entire row**. There is
   no version of "read 8 bytes of this record" — the record is read and its referenced
   off-page columns are the only thing that can be deferred.
The clustered record has a specific, fixed header that is different from a secondary
record, and the difference is the whole mechanism:

```text
  CLUSTERED INDEX LEAF  (this is the table)
  ┌──────────────────────────────────────────────────────────────┐
  │ RECORD HEADER      5 bytes                                   │
  │   info bits, nb cols, heap_no, record_type, next-record ptr  │
  ├──────────────────────────────────────────────────────────────┤
  │ DB_TRX_ID          6 bytes   ← which transaction wrote this  │
  │ DB_ROLL_PTR        7 bytes   ← where is the before-image?    │
  ├──────────────────────────────────────────────────────────────┤
  │ VAR/COLUMN DATA    the rest                                 │
  │   id | name | email | status | created_at | updated_at | ... │
  └──────────────────────────────────────────────────────────────┘

  SECONDARY INDEX LEAF  (this is NOT the table)
  ┌──────────────────────────────────────────────────────────────┐
  │ RECORD HEADER      5 bytes                                   │
  ├──────────────────────────────────────────────────────────────┤
  │ COLUMN DATA        the indexed columns only                 │
  │   email                                              120 B   │
  ├──────────────────────────────────────────────────────────────┤
  │ DB_TRX_ID          6 bytes                                   │
  │ DB_ROLL_PTR        7 bytes                                   │
  ├──────────────────────────────────────────────────────────────┤
  │ PRIMARY KEY        the clustered key, verbatim               │
  │   id                                                   8 B    │
  └──────────────────────────────────────────────────────────────┘
```

Read the two shapes again. The clustered record contains `DB_TRX_ID` and `DB_ROLL_PTR`
because the whole row lives here and MVCC has to work on it. The secondary record contains
the same two fields because the secondary index has to be MVCC-consistent too — you cannot
return a deleted secondary entry to a reader whose snapshot should not see the delete.
And the secondary record ends with the **primary key, in full**. That trailing primary key
is why secondary indexes in InnoDB are *fat*, why an `int` primary key is materially
cheaper than a `bigint` one or a `char(36)` one, and why the term for what happens when you
then follow that primary key back into the clustered index is a phrase you should be able
to say unprompted.

**What if there is no primary key?** Then InnoDB looks for a `NOT NULL` `UNIQUE` index and
uses that as the clustered key. If there is not one, it invents a hidden 6-byte row id
(`GEN_CLUST_INDEX`) and builds the clustered index on that, assigning ids from a
per-table counter. The consequences are severe and worth listing because "we have a few
tables without a primary key" is a common finding on an inherited schema:

```text
  no PRIMARY KEY, no NOT NULL UNIQUE index
        │
        ▼
  hidden GEN_CLUST_INDEX on a 6-byte row id
        │
        ├─► the clustered index is on a sequence nobody can query
        ├─► EVERY secondary index stores that 6-byte id, not your natural key
        ├─► row ids are assigned monotonically, so a delete followed by an
        │   insert puts the new row at the END of the tree — every insert
        │   after a delete is effectively a random-ish page split
        └─► replication and foreign keys both have nothing to point at
```

```sql
-- The single most useful schema audit query on an inherited MySQL database.
SELECT TABLE_SCHEMA, TABLE_NAME, ENGINE,
       ROUND((DATA_LENGTH + INDEX_LENGTH)/1024/1024) AS mb
FROM   information_schema.TABLES
WHERE  TABLE_SCHEMA NOT IN ('mysql','information_schema','performance_schema','sys')
  AND  TABLE_TYPE = 'BASE TABLE'
ORDER  BY mb DESC;
```

```sql
-- Add a surrogate key without blocking if the table is small, or go via
-- pt-online-schema-change (Chapter 8) if it is not.
ALTER TABLE page_views
  ADD PRIMARY KEY (id),
  ALGORITHM=INPLACE, LOCK=NONE;
```

The reverse mistake is worth naming too: a **primary key that is a `char(36)` UUID stored
as text**. It is not just wide. It is *random*, and a random key in a B+ tree means
almost every insert lands in a leaf that is not the rightmost one, so InnoDB splits the
page (at a 15/16 fill threshold, deliberately, so there is room for future inserts) and
then has to maintain a page split list. Section 2.6 does the arithmetic.

### 2.3 The Return to Table (回表)

Now the mechanism that shocks people. Follow a lookup through a secondary index.

```text
  SELECT name, status FROM orders WHERE email = 'a@b.com';
  --                                           ^ secondary index
  --                       ^ NOT in the secondary index →  must  回表
  ┌───────────────────────────────────────────────────────────────┐
  │  STEP 1  descend index_orders_on_email                       │
  │                                                               │
  │        root                                                   │
  │       /    \                                                  │
  │    node     node        ...read 2–3 pages...                  │
  │      |        \                                               │
  │    leaf:  [email][trx][roll][id=88213]   ← the ONLY row       │
  └──────────────────────────────┬────────────────────────────────┘
                                │  you now know id = 88213
                                │  and nothing else. `name` and
                                │  `status` are not here.
                                ▼
  ┌───────────────────────────────────────────────────────────────┐
  │  STEP 2  descend the CLUSTERED INDEX  (PRIMARY)              │
  │                                                               │
  │        root                                                   │
  │       /    \                                                  │
  │    node     node        ...read 2–3 more pages...             │
  │      |        \                                               │
  │    leaf:  [id=88213][trx][roll][name][status][email][...]     │
  │            ^ the whole row, all 400 bytes of it                │
  └───────────────────────────────────────────────────────────────┘
  Total: two B+ tree descents, 4–6 page reads, 2 root-to-leaf lock/unlock
         cycles in the buffer pool, for 400 bytes of answer.
```

The arithmetic that makes it concrete, and the number that decides whether the query is
acceptable. Take a 50-million-row `orders` table with a 400-byte average row and a 16 kB

page: 16,384 / 400 ≈ **40 rows per clustered leaf page**, so the clustered index is about

1.25 million leaf pages and three levels. The secondary index on `email` holds

`email(254) + 6 + 7 + 8 = 275` bytes per entry — with an average address of 24 characters
at utf8mb4 that is 96 + 21 = **117 bytes**, so ~139 entries per leaf page, ~360,000 leaf
pages, three levels.

```text
  cost of a point lookup, cold cache, 50M-row orders table
  ─────────────────────────────────────────────────────────────
  clustered descent    3 page reads   (root, internal, leaf)
  secondary descent    3 page reads   (root, internal, leaf)
                       ─────────────
  physical reads       6              ~96 kB of 16 kB pages
  useful bytes         400            one row
  amplification        240×           ← this is the  回表 tax

  cost with a covering index  (email, name, status) + id
  ─────────────────────────────────────────────────────────────
  secondary descent    3 page reads
  回表                  0
  useful bytes         400 (read from the index, which has it)
```

The number to remember is not 240× — it is that **the second descent is a separate random
access**. It is not free-floating overhead; it is a second B+ tree walk with its own root
page, its own internal pages, its own lock on each, and its own chance of missing the
buffer pool on a cache that may already be under pressure from the first walk. A 3-level
index where the root and one internal level are hot in the buffer pool is not a disaster;
the same walk with a cold root and a cold internal level on a spinning disk is two extra
seek-and-rotate cycles, and on a rotational device a seek is 4–10 ms.

Three design consequences follow immediately, and all three are things a staff engineer
argues for on real schemas:

- **A covering index eliminates the second descent entirely.** `CREATE INDEX ix ON orders
  (email, name, status)` makes the same query a single index descent, and `EXPLAIN` marks
  it with `Using index` in the `Extra` column. This is the cheapest performance win
  available in MySQL and it is routinely left on the table because people do not know
  what to look for in `EXPLAIN`.
- **A narrow primary key shrinks every secondary index.** The primary key is a suffix of
  every secondary record. Going from `char(36)` to `bigint` takes 36 bytes down to 8 in
  *every* secondary index of the table, and it makes the primary key itself clustered
  without randomness. Volume 6 owns key choice in general; this is the physical
  consequence.
- **A wide row makes every point lookup expensive**, because a lookup always reads the
  entire clustered record. `SELECT id FROM t WHERE email = ?` on a table with a 4 kB
  payload column still reads 4 kB per matching row unless a covering index handles it.
  This is the InnoDB version of the `SELECT *` trap from Volume 1 Chapter 2, and the
  chapter 2 section 2.4 setup is exactly this: in a heap, the index holds `(block, offset)`
  and you pay a random read for the row; in a clustered index, the row is at the leaf and
  you pay for its *width* instead.
> **INTERVIEW TRAP — "DOES A SECONDARY INDEX LOOKUP NEED A SECOND TABLE LOOKUP?"**
>
> The reflex answer — yes, you go back to the table — is right in *shape* and wrong in
> *mechanism*, and saying it as "the index gives me a rowid and then I fetch the heap"
> is the answer that marks a candidate as having memorised PostgreSQL. The correct MySQL
> answer is: a secondary index entry holds the secondary key plus the **primary key**, and
> following that primary key down the clustered B+ tree is the return to table, so the
> cost is a second B+ tree descent rather than a random page fetch from a heap. The
> practical difference is not academic: a heap rowid is a `(block, offset)` pair that can
> be resolved in one page read, while a clustered-index lookup re-walks a tree, so the
> "second read" in InnoDB is the more expensive of the two, and it is eliminated by a
> covering index rather than by anything else.

### 2.4 Updates and Deletes Live in the Clustered Index

Because the row *is* the index entry, the mechanics of modifying a row are not "find the
heap tuple and change it". They are much more specific, and the specifics are the reason
InnoDB's behaviour under `UPDATE` is often surprising.

**A `DELETE` does not delete.** It performs an in-place *delete mark*: it sets the
record's `DB_TRX_ID` to a special value and the record's delete-mark bit is set. The
bytes stay exactly where they are, in exactly the same place in the same leaf page, in
exactly the same order. Nothing moves, nothing is compacted, the page does not shrink.
The row becomes invisible to transactions whose read view is newer, and the physical space
is reclaimed only when `purge` runs and the undo log reaches back far enough to prove no
live transaction can still need it.

**An `UPDATE` is a write of a new version, in the same leaf page if it fits.** The engine
reads the record, checks whether the *modified* version still fits in the free space on
that page, and:

- **If it fits**, the new version is written into the page's free space and the old
  version's before-image is written to the undo log. The record's *logical position* in
  the tree does not change, because the primary key did not change. The page can end up
  with two copies of the same key at different offsets, which is legal — the page
  directory and the record chain handle it.
- **If it does not fit**, the page is reorganised to reclaim space from delete-marked
  records; if that is not enough, a page split happens, and a page split on an
  `UPDATE` moves roughly half the records to a new page.
Crucially, **any change to a column that is part of a secondary index also has to
rewrite that secondary index entry.** The old secondary entry is delete-marked and a new
one is inserted — and if the secondary key itself changed, the new entry goes in a
different position in a different B+ tree, potentially on a different page, with its own
split list. This is why "updating a row" is never one write:

```text
  UPDATE orders SET email = 'new@b.com', status = 'SHIPPED' WHERE id = 88213;
       │            │                      │
       │            │                      └── delete-mark old entry in
       │            │                          ix_orders_status, insert new
       │            └── delete-mark old entry in ix_orders_email, insert
       │                new entry in a DIFFERENT leaf page
       └── the clustered record: new version written in place (if it fits),
           before-image to the undo log
  cost: 1 clustered record write + 1 undo record + 2 secondary delete-marks
         + 2 secondary inserts, plus redo records for all of it, plus binlog
```

And this is where the honest comparison with a heap design earns its keep. PostgreSQL has
a **HOT update**: if no indexed column changed and there is room on the page, the new
tuple version is written to the same page and *no index is touched at all*. InnoDB has no
HOT update. **Every `UPDATE` in InnoDB writes to every secondary index whose indexed
columns are affected, plus a redo record, plus an undo record** — and even an update that
only touches an unindexed column still writes a new clustered record version. That is the
real cost of "the index is the table", and it is the reason InnoDB's `UPDATE` throughput
on a table with many indexes is the surprise it is.

> **MUST REMEMBER**
>
> `DELETE` is a delete-mark, not a removal. `UPDATE` writes a new version and rewrites
> every affected secondary index entry. Nothing in InnoDB ever moves a row to make space,
> and nothing ever compacts a page in place except as a side effect of the purge process
> or an explicit rebuild. Every "why is this table not shrinking" and "why does this table
> keep needing more space" question in the next four chapters has its answer here.

### 2.5 Page Splits, the 15/16 Rule, and Random Keys

InnoDB fills a page to **15/16** and then splits, deliberately leaving 1/16 of the new
right-hand page free. The reason is that split *threshold* hysteresis is cheaper than
split *frequency*: if a page were filled completely, every subsequent insert into it would
split it, and a hot leaf page would split on nearly every insert. Leaving 1/16 free means
it takes about sixteen subsequent inserts to the same leaf to cause another split.
That is a good policy for a **monotonically increasing** key, where every insert goes to
the rightmost leaf. It is actively harmful for a **random** key:

```text
  MONOTONIC KEY  (AUTO_INCREMENT)
  ──────────────────────────────
  insert 1..1000000  →  always the rightmost leaf
                     →  it fills, it splits, it becomes the new rightmost leaf
                     →  every 16,000 inserts: ONE split, moving ~7,500 records
                     →  total splits for 1M rows ≈ 63
                     →  sequential page allocation, sequential I/O, nothing random

  RANDOM KEY  (UUIDv4 as char(36))
  ──────────────────────────────
  insert 1        →  key 'a3f2...' lands in a random leaf
  insert 2        →  key '7b91...' lands in a DIFFERENT random leaf
  ...
  Probability a given insert lands in the ~1/16 tail of some leaf = 1/16
  Expected splits for 1M rows ≈ 1M / 16 ≈ 62,500
                     →  1000× the split rate
                     →  each split: allocate a page, copy ~7,500 records,
                        add both pages to the split list, write ~120 kB
                     →  write amplification measured in gigabytes of pure
                        page shuffling
                     →  and the rows are now physically scattered, so the
                        secondary-index 回表 descent misses the buffer pool
                        far more often
```

This is not a theoretical concern. In a `char(36)` text UUID table, the ratio of space
consumed to space used is routinely 2–3× on the clustered index, the `innodb_buffer_pool`
hit rate for point lookups is measurably worse than on the equivalent `bigint` table, and
`ANALYZE TABLE` still reports good statistics — the data is not skewed, only the
*placement* is. The physical symptoms are the ones to look for: an insert rate that is fine
in batches and terrible one row at a time, and page splits visible in

`INFORMATION_SCHEMA.INNODB_METRICS` or the `innodb_page_split` counter.

The fixes, in preference order:

- **Use a monotonic surrogate key.** `AUTO_INCREMENT BIGINT` is the correct default
  answer and it is the one most teams should hear. It is 8 bytes, monotonic, and every
  append lands in the rightmost leaf.
- **If you need a UUID, store it as `BINARY(16)` and generate it in application code
  with a monotonic generator** — a time-ordered UUIDv7, a ULID, or MySQL's own
  `UUID_TO_BIN(uuid(), 1)` swap flag, which rearranges the bytes so the timestamp comes
  first and the index order matches the generation order. `UUID_TO_BIN(uuid(), 0)` gives
  you the compact 16-byte storage *without* the ordering, which fixes the width problem
  and leaves the page split problem exactly as bad as it was.
- **Do not "fix" it by making the primary key a hash of something.** Hashing a
  monotonic key produces a random key and reintroduces the same problem one layer up.

```sql
-- What a well-chosen key looks like.
CREATE TABLE orders (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  public_id   BINARY(16)     NOT NULL,
  email       VARCHAR(254)   NOT NULL,
  status      VARCHAR(16)    NOT NULL,
  total_cents BIGINT UNSIGNED NOT NULL,
  created_at  DATETIME(3)    NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_public_id (public_id),
  KEY ix_orders_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

The `email` secondary index is 4 bytes/char at utf8mb4 for the address bytes plus 2 bytes
of length prefix, plus 6 for `DB_TRX_ID`, 7 for `DB_ROLL_PTR`, and 8 for the `BIGINT`
primary key. For a 24-character address that is 96 + 2 + 21 = **119 bytes per secondary
entry** — against 155 bytes with a `char(36)` text primary key. On a 100-million-row
`users` table with one such index, that is 1.55 GB of secondary index instead of 1.19 GB,
and the difference is entirely the primary key suffix.

### 2.6 Fragmentation, and Why the Table Never Shrinks

Putting the previous four sections together produces the fragmentation behaviour that is
the most common source of "MySQL has a disk space problem we cannot explain".

```text
  orders: 50M rows, 400 bytes each, 16 kB pages
  ┌────────────────────────────────────────────────────┐
  │ LEAF PAGE 812,334                                  │
  │                                                    │
  │  [id=48200001] live                                │
  │  [id=48200002] LIVE BUT DELETED (delete-marked)    │
  │  [id=48200003] LIVE BUT DELETED (delete-marked)    │
  │  [id=48200004] live                                │
  │  [id=48200005] LIVE BUT DELETED (delete-marked)    │
  │  ... 200 bytes of free space, reclaimed on demand  │
  └────────────────────────────────────────────────────┘
       ▲ delete-marked records are still in the page's
         record chain and are still walked by scans
         until purge clears them
  DELETE FROM orders WHERE created_at < '2023-01-01';   -- 45M rows gone
  SELECT COUNT(*) FROM orders;                          -- 5M rows
  information_schema.TABLES: DATA_LENGTH = 1.9 GB      -- 0.2 GB of live data
  → the file is 95% dead rows, and the space is only reusable by
    inserts that FIT in the holes. A new row of the same 400 bytes
    will fit. A new row with a new 2 kB column will not, and the
    insert will extend the file instead of filling the holes.
```

This is the same mechanism Volume 1 Chapter 2 described for a slotted-page heap — holes
that are not reusable until a vacuum, and space that only comes back in units of
"whatever happens to fit" — with the important MySQL-specific twist that **purge has to be
able to advance before the space is reusable at all**. Purge discards undo records for
transactions that no live read view can still need, and it can only do that if there is a
read view old enough. A transaction that has been open for six hours pins the entire
delete history behind it, purge makes no progress, the file does not shrink, and every
scan walks delete-marked records that are not there any more. That is Chapter 3, and
Chapter 3 is entirely about it.

The recovery is not `OPTIMIZE TABLE` as a habit — on a 50-million-row table that is a
full copy with a lock — it is:

```sql
-- 1. Find the oldest transaction. This is the actual root cause query.
SELECT trx_id, trx_state, trx_started,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_seconds,
       trx_mysql_thread_id, LEFT(trx_query, 60) AS query
FROM   information_schema.INNODB_TRX
ORDER  BY trx_started
LIMIT  5;
```

```text
trx_id     trx_state  trx_started           age_seconds  thread  query
---------- ----------  --------------------  -----------  ------  --------------------------------
2987651    RUNNING    2026-09-27 14:02:11    13211        412    UPDATE inventory SET qty = qty - 1 ...
2987644    LOCK WAIT  2026-09-27 17:11:02    180          891    SELECT * FROM orders WHERE id = 55 ...
2987630    RUNNING    2026-09-27 17:12:55    47           233    INSERT INTO audit_log ...
---------- ----------  --------------------  -----------  ------  --------------------------------
                              ▲
                              └── 3.6 hours. purge is stuck behind this.
```

```sql
-- 2. Rebuild once the blocking transaction is gone. Online DDL, not a copy.
ALTER TABLE orders ENGINE=InnoDB, ALGORITHM=INPLACE, LOCK=NONE;
-- 3. For huge tables, do it in chunks with pt-online-schema-change (Chapter 8)
--    so the copy is throttled and does not swamp the replicas.
```

> **SCALING REALITY CHECK**
>
> The rebuild cost is real and worth quoting. A 1.9 GB clustered index on a 5M-live-row
> table takes an `ALGORITHM=INPLACE` rebuild that reads 1.9 GB and writes roughly 0.2 GB
> of new data plus 1.9 GB of redo, and the redo traffic alone can be tens of gigabytes
> depending on `innodb_change_buffering` activity. At 1 GB/s of redo throughput that is
> 20–40 seconds of full-speed write pressure, during which the buffer pool is thrashing
> and every other query on the instance is competing for it. **Above roughly 50 GB, do
> this with `pt-online-schema-change` throttled to a fraction of the replica's apply
> capacity, not inline.** The trigger is the ratio of live bytes to allocated bytes, not
> the absolute size.
> **STAFF-LEVEL CONSIDERATION**
>
> The interesting question about fragmentation is not the rebuild — it is why the table was
> allowed to reach 95% dead rows. `DELETE FROM t WHERE date < X` without a partition drop,
> or with a partition drop done as a row delete, is a routine code pattern and it produces
> exactly this. If your retention story is "we delete old rows", the honest options are
> `PARTITION BY RANGE` with `ALTER TABLE ... DROP PARTITION` (an O(1) metadata operation
> that returns the space to the filesystem), `TRUNCATE` on an archive-and-swap cadence, or
> a periodic rebuild. What is worth raising unprompted in a design review is that retention
> is a *storage* decision in MySQL and not only a data-lifecycle one, and that the schema
> should make the cheap retention path the obvious one.

#### Common Mistakes

- Describing the secondary-index lookup as going "back to the heap" — there is no heap;
  it is a second descent of the clustered B+ tree using the primary key stored in the
  secondary entry
- Claiming a `DELETE` in InnoDB removes the row and frees space — it is a delete-mark in
  place, and the space is not reusable until purge processes the undo
- Assuming an `UPDATE` only writes one record — every affected secondary index entry is
  delete-marked and rewritten, and InnoDB has no HOT-update optimisation
- Believing InnoDB fills a page completely before splitting — it splits at 15/16, on
  purpose
- Treating a `char(36)` UUID primary key as harmless because it is only 36 bytes — the
  problem is randomness and page splits, not just width
- Recommending `OPTIMIZE TABLE` as routine maintenance on a large table without
  mentioning that it is a full copy under an exclusive metadata lock

#### Interview Questions — Clustered Index & Storage

**Q1. Walk me through `SELECT name, status FROM orders WHERE email = 'a@b.com'`, and then
through the same query with a covering index.** `TRICKY`

Without a covering index: descend the secondary index on `email` to its leaf, read the
entry, and learn the primary key. The `name` and `status` columns are not in that tree, so
descend the clustered index on the primary key to its leaf and read the whole record. Two
B+ tree descents, roughly six page reads on a 50M-row table at three levels each, of which
400 bytes is the answer. With `KEY (email, name, status)` the first descent's leaf already
contains everything, so it is one descent, about three page reads, and `EXPLAIN` shows
`Using index`. That difference is the entire return-to-table tax, and it is why the first
thing to check on a MySQL query is whether the predicate columns plus the selected columns
fit in one index.

**Q2. What does a `DELETE` actually do in InnoDB?** `TRICKY`

It is a delete-mark: the record's `DB_TRX_ID` is set to a special value and the

delete-mark bit is set, in place, in the same page, in the same position in the tree. The
bytes are not returned to the free space, the page is not compacted, and the file does not
shrink. The row disappears from read views newer than the deleting transaction

immediately, but the space only becomes reusable when `purge` reaches the undo record that
proves no live transaction can still need the pre-image — which means it only happens if
the history list can advance, and it will stall behind any transaction older than the
delete. A table that has been 95% deleted still takes the same I/O to scan, still has the
same `DATA_LENGTH`, and is still walked record-by-record by a full scan until purge clears
it.

**Q3. Why is a random primary key a write-amplification problem?** `ADVANCED`

InnoDB splits a page at a 15/16 fill threshold, deliberately, so that a subsequent burst of
inserts into the same leaf does not split it again. With a monotonic key every insert
arrives at the rightmost leaf, so roughly 1 split per 16,000 inserts — about 63 splits for
a million rows, all sequential, all cheaply prefetchable. With a random key each insert
lands uniformly across all leaves, so the chance it lands in the 1/16 unfilled tail of some
leaf is 1/16, giving about 62,500 splits per million rows. Each split allocates a page,
copies roughly half its records, registers both pages in the split list, and generates
redo. That is on the order of 1000× the split rate and gigabytes of pure page shuffling for
a million rows. The fix is a monotonic surrogate key, or a time-ordered UUID stored as
`BINARY(16)` with `UUID_TO_BIN(uuid(), 1)`.

**Q4. Your 50M-row table is 95% delete-marked and `DATA_LENGTH` is still 1.9 GB. What is
the actual root cause, and what do you fix first?** `ADVANCED`

Check `information_schema.INNODB_TRX` for the oldest live transaction first, because
purge cannot advance past it and *that* is why the space is still not reusable. If the
oldest transaction is minutes old, the delete simply has not been purged yet and the fix
is to wait and to reduce the transaction's lifetime. If it is hours or days old, the
delete is not the problem you think it is — an unclosed interactive transaction, a
`mysqldump` still running, a replication applier stuck, or a monitoring query that holds a
snapshot, and the fix is to kill it. Only once the history list is draining do you look at
the file size, and then the answer is a rebuild — `ALGORITHM=INPLACE, LOCK=NONE` under
about 50 GB, `pt-online-schema-change` throttled above it, or `PARTITION BY RANGE` with
`DROP PARTITION` if the retention is date-based, which is the answer that makes the
problem stop recurring.

> **CHAPTER 2 SUMMARY**
>
> InnoDB stores rows in 16 kB pages allocated from 1 MB extents, and **the clustered index
> is the table**: the row is the B+ tree leaf entry, there is no heap, and the physical row
> order is the key order. A secondary index entry is `(secondary_key, DB_TRX_ID, DB_ROLL_PTR,
> primary_key)`, so the return-to-table — *回表* — is a second B+ tree descent, roughly
> doubling the page reads of a point lookup on a large table, and a covering index is the
> only thing that eliminates it. `DELETE` is a delete-mark in place and `UPDATE` writes a
> new record version plus a delete-mark and re-insert in every affected secondary index,
> which is why write amplification is InnoDB's characteristic cost and why it has no
> HOT-update optimisation. The 15/16 split threshold is right for monotonic keys and
> catastrophic for random ones, which makes a `char(36)` UUID primary key — around 1000×
> the page split rate of an `AUTO_INCREMENT` — the most consequential one-line decision in
> a MySQL schema. And because nothing is ever compacted in place, a table that is 95%
> deleted stays 1.9 GB until purge can advance past the oldest live transaction and you
> rebuild it.

#### Further Reading

- [InnoDB Physical Structure](https://dev.mysql.com/doc/refman/8.0/en/innodb-physical-structure.html) — pages, extents, the FIL/PAGE header layout, and the infimum and supremum records.
- [InnoDB Indexes](https://dev.mysql.com/doc/refman/8.0/en/innodb-indexes.html) — how clustered and secondary indexes are built, including the 15/16 split rule.
- [InnoDB Record and Page Formats](https://dev.mysql.com/doc/refman/8.0/en/innodb-record-format.html) — the five record header variants and exactly which fields each one carries.
- [InnoDB Internal Temporary Tables and the Online DDL Operation Matrix](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-operations.html) — which `ALTER` variants are in-place, what they rebuild, and what lock each one takes.
- [UUID_TO_BIN() and the UUIDv7 Order-preserving Trick](https://dev.mysql.com/doc/refman/8.0/en/uuid-to-bin.html) — the compact 16-byte storage and the byte-swap flag that makes a UUID index monotonic.

## Chapter 3 — MVCC & the Undo Log

### 3.1 What Versioning Buys, and What It Costs

MVCC answers one question: **which version of this row should this statement see?** Every
implementation has to make the same three decisions, and InnoDB's answers are unusual
enough to be worth stating before the mechanics.

- **Where do multiple versions live?** InnoDB: *in the table*. An update writes a new
  record version into the clustered index leaf, and the previous version's contents live
  in the undo log. PostgreSQL: *in the table too* — a new heap tuple, with the old tuple
  marked dead. The difference is not where the versions live, it is that InnoDB's undo
  holds the before-image and the clustered index holds only the newest, while PostgreSQL's
  heap holds both.
- **Who decides visibility?** InnoDB: a **read view**, which is a snapshot of the set of
  transaction ids that were active or unassigned at a moment in time. PostgreSQL: a
  **snapshot**, which is a list of the same thing in a different structure. Same idea.
- **When is that snapshot taken?** **This is the fork, and it is the entire reason `RR`
  and `RC` behave differently in MySQL.** Under `READ COMMITTED` the read view is created
  **per statement**. Under `REPEATABLE READ` it is created **once per transaction**, on
  its first consistent read. PostgreSQL takes its snapshot per statement in *both* levels,
  and implements `REPEATABLE READ` by holding a *transaction* snapshot — which is the
  same mechanism, arrived at from the other direction.
The cost side is identical in both engines and it is the cost that produces the incident
everyone eventually hits: **a version can only be reclaimed when no live transaction can
still ask for it.** A read view that is four hours old pins every row version modified in
the last four hours, and the space — and the read time — grows with it.

```text
  A row's life in InnoDB
  t0   INSERT               clustered: [id=1][A]        undo: (nothing)
  t1   UPDATE SET x='B'     clustered: [id=1][B]        undo: (id=1, x='A', trx=T1)
  t2   UPDATE SET x='C'     clustered: [id=1][C]        undo: (id=1, x='B', trx=T2)
  t3   DELETE               clustered: [id=1][C] del-marked
                                                   undo: (id=1, x='C', trx=T3) + delete undo
  t4   purge                clustered: [id=1] gone     undo: all three released
                                                    ▲
                                         only if no live read view
                                         predates t1, t2 or t3
```

### 3.2 What an Undo Record Actually Holds

Every clustered record carries a 6-byte `DB_TRX_ID` and a 7-byte `DB_ROLL_PTR`. The
second one is a pointer into the undo log, and understanding *what it points at* explains
every read-view behaviour in this chapter.

The 7-byte `roll_ptr` is a composite: a rollback-segment id, an undo log number within it,
and a slot within the block. It is deliberately compact because it is stored in **every
row of every table**, and a wider pointer is pure overhead in the clustered index.
Undo comes in three flavours, and the difference matters:

- **Insert undo.** Written for a new row, contains almost nothing (the row never existed),
  and is the *only* undo type that can be discarded immediately rather than by purge — if
  the inserting transaction committed, no other transaction can ever need to see the
  absence of that row. This is the "purge is the cost of deletes, not of inserts" rule.
- **Update undo.** Contains the modified columns' previous values plus the `trx_id` that
  made the change and a `DB_ROLL_PTR` to the *previous* update undo record. This is the
  chain.
- **Delete undo.** The largest, and the one people underestimate: besides the row
  pre-image, it carries the primary key of every row in **every secondary index** that
  the delete has to remove. A row with five indexes produces a delete undo record
  containing five primary keys. This is why a large bulk delete inflates the undo log
  far more than a large bulk update, and why "we deleted 50 million rows and the disk
  filled up" has a specific answer.
Undo lives in dedicated **undo tablespaces** (`undo_001`, `undo_002`, ...), *not* in
`ibdata1` and *not* in the redo log. A separate `ibtmp1` holds the undo for transactions
in read-only or temporary-tablespace tablespace mode, and it is capped at

`innodb_temp_data_file_path` (5/6 of the configured file size) precisely so that a runaway
read-only workload cannot consume all of `tmpdir`.

> **INTERVIEW TRAP — "WHERE DOES THE UNDO LOG LIVE, AND IS IT THE TRANSACTION LOG?"**
>
> Not the transaction log — this is the single most common version of the confusion. Undo
> holds **before-images** and exists to serve *readers*; redo holds **after-images in
> page format** and exists to serve *recovery*. They are written in the same statement,
> they live in different tablespaces, they are sized and tunnelled independently, and
> they are both circular or both recyclable but on completely different criteria — redo
> recycles when a checkpoint passes the LSN, undo recycles when purge has processed the
> record. If someone says "MySQL keeps a transaction log so it can roll back", the
> correction to offer is: rollback uses undo; crash recovery uses redo; they are not
> interchangeable and conflating them makes every tuning conversation afterwards go wrong.

### 3.3 The Read View: Three Numbers and an Array

A read view is a frozen picture of the transaction id space. It contains exactly four
things, and naming them precisely is what lets you predict visibility without guessing.

```text
  READ VIEW (m_ids)
  ──────────────────────────────────────────────────────────────────────
  m_low_limit_id   the highest trx_id that existed when the snapshot was
                   taken, plus one. Everything at or above this was created
                   AFTER the snapshot → never visible.
  m_up_limit_id     the lowest trx_id that was still ACTIVE when the snapshot
                   was taken. Everything strictly below this had already
                   committed when the snapshot was taken → always visible.
  m_ids[]           the trx_id of every transaction that was active when the
                   snapshot was taken, excluding m_up_limit_id. These are
                   in the "probably committed, undecided when we looked" zone
                   → NOT visible.
  your own trx_id   not in the array at all. Your own changes are always
                   visible to you, and your own delete-marks always hide a
                   row from you.
  ──────────────────────────────────────────────────────────────────────
```

A worked example makes the three numbers concrete. Suppose the transaction id counter is
currently at 1042 and these are in flight:

```text
  T1000  committed yesterday                          → below m_up_limit_id
  T1003  committed 10 minutes ago                     → below m_up_limit_id
  T1040  ACTIVE  (in m_ids[])
  T1041  ACTIVE  (in m_ids[])
  1042   the next id that will be handed out          → this is m_low_limit_id
```

A read view taken now has `m_low_limit_id = 1042`, `m_up_limit_id = 1040`, and

`m_ids = [1040, 1041]`. Everything follows from that triple, and nothing about it requires
consulting the undo log until you hit a row whose `DB_TRX_ID` is not conclusively
decided — which is exactly when you walk the undo chain.

### 3.4 The Four Visibility Cases

For a row version with `DB_TRX_ID = X` read by a transaction with read view `(low, up,
ids)`, plus the special cases for your own transaction:

1. **`X < up`** — X committed before the snapshot was taken. **Visible.** No undo walk.
   This is the fast path and it is the overwhelming majority of rows in a healthy
   workload.
2. **`X >= low`** — X was created after the snapshot. **Not visible.** No undo walk. The
   row might not even exist yet; if the clustered index has a newer version, you follow
   its `roll_ptr`; if the key has no other version, the row simply does not exist for you.
3. **`X` is in `ids[]`** — X was active when the snapshot was taken, so it may or may not
   have committed since; you cannot know. **Not visible** as of the snapshot. **This is
   the only case that requires walking the undo chain** to find the previous version.
4. **`up <= X < low` and X is not in `ids[]`** — X committed after the snapshot was
   taken but before this row was read. **Visible.** The snapshot did not see it, but the
   *earlier* version that the snapshot could see is still physically present in undo, so
   you walk back one link to get it.
And two special cases that break the framing if you forget them:

- **`X` is your own `trx_id`.** Always visible. Your own uncommitted changes are visible
  to you, which is why a transaction sees a phantom of its own uncommitted insert on a
  second read of the same table.
- **The record is delete-marked and `DB_TRX_ID` is not yours.** The row is invisible to
  you. If the delete-mark's `trx_id` *is* yours, the row is invisible to you as well —
  your own delete hides the row from you immediately, so `SELECT` after `DELETE` inside a
  transaction returns nothing, while a concurrent transaction still sees the old version.
The whole mechanism in one picture:

```text
  CURRENT clustered record:  [id=88213][DB_TRX_ID=1041][roll_ptr=►U3][... B ...]
  U3 undo:  (id=88213, x='C', trx=1041, roll_ptr=►U2)
  U2 undo:  (id=88213, x='B', trx=1040, roll_ptr=►U1)
  U1 undo:  (id=88213, x='A', trx=1003, roll_ptr=►NULL)      ← the original

  READER with read view (low=1042, up=1035, ids={1040, 1041}):
  ─────────────────────────────────────────────────────────────────────
  start at the clustered record, X = 1041
      1041 >= 1042?              no
      1041 in ids[]?              YES  →  not visible → follow roll_ptr → U3
  at U3, X = 1041
      1041 in ids[]?              YES  →  not visible → follow roll_ptr → U2
  at U2, X = 1040
      1040 in ids[]?              YES  →  not visible → follow roll_ptr → U1
  at U1, X = 1003
      1003 < 1035 (up)?          YES  →  VISIBLE  → return x='A'
                                                    ▲
  four versions, three undo records, three extra reads, for one row.

  A READER with read view (low=1040, up=1032, ids={1035,1036,1037}):
  ─────────────────────────────────────────────────────────────────────
  start at the clustered record, X = 1041
      1041 >= 1040 (low)?        YES  →  not visible → follow roll_ptr → U3
  at U3, X = 1041
      1041 >= 1040?               YES  →  not visible → follow roll_ptr → U2
  at U2, X = 1040
      1040 >= 1040 (low)?         YES  →  not visible → follow roll_ptr → U1
  at U1, X = 1003
      1003 < 1032 (up)?           YES  →  VISIBLE  → return x='A'
                                                    ▲
  SAME ANSWER, one more hop. The older the read view relative to the write
  history, the longer the chain — and that is the read-latency mechanism
  that a long-running transaction creates for everybody else.
```

> **MUST REMEMBER**
>
> Visibility is a function of one number — the row's `DB_TRX_ID` — against three numbers
> and a set in the read view. Two of the four cases are decided by arithmetic and never
> touch the undo log. Only "the writer was active when I took my snapshot" forces a chain
> walk, and the length of that walk is exactly how much a long transaction taxes every
> other reader on the instance.

### 3.5 Per-Statement vs Per-Transaction Read Views

This is the single most important fact in the volume for predicting behaviour, because it
deterministically explains every difference between `REPEATABLE READ` and `READ COMMITTED`
in MySQL, including the gap-lock behaviour that is the subject of Chapter 5.

```text
  REPEATABLE READ   (MySQL's default)
  ─────────────────────────────────────────────────────────────────────────
  BEGIN;                     ← NO read view exists yet
  SELECT * FROM t WHERE id=1;   ← read view #1 created HERE, on the first
                                  consistent read. Say low=1042, up=1040,
                                  ids={1040,1041}
  -- meanwhile another session commits T1043
  SELECT * FROM t WHERE id=1;   ← read view #1 REUSED. T1043 is invisible.
  SELECT * FROM t WHERE id=2;   ← read view #1 REUSED. Sees a consistent world.
                                  → non-repeatable reads are IMPOSSIBLE
                                  → this is what "repeatable" buys

  READ COMMITTED
  ─────────────────────────────────────────────────────────────────────────
  BEGIN;
  SELECT * FROM t WHERE id=1;   ← read view #1 created (low=1042, ...)
  -- another session commits T1043
  SELECT * FROM t WHERE id=1;   ← read view #2 created (low=1044, ...)
                                  → T1043 is VISIBLE. Non-repeatable read.
                                  → but never a dirty read
```

`START TRANSACTION WITH CONSISTENT SNAPSHOT` is the explicit form — it forces the read
view to be created at `BEGIN` rather than at the first read, which is what you want in a
replication applier or a report that must see a single moment across many tables. Its
absence from most codebases is why "why did I get an inconsistent report" is a real
category of bug that the default does not prevent.

Three more consequences that fall out of the same fact:

- **Every statement's read view is discarded when the statement ends under `RC`.** That is
  the mechanism, not a side effect. Under `RR` the read view lives for the whole
  transaction, which is why `RC` lets purge advance so much more freely and why
  `RC`-configured MySQL instances have visibly shorter undo chains and lower history list
  lengths. Volume 5 covers the general argument for `RC`; this is the MySQL-specific
  version of it.
- **A transaction that has executed no statement yet pins nothing.** InnoDB creates the
  read view lazily, on the first consistent read. So `BEGIN;` followed by an open socket
  for six hours blocks nothing at all. In PostgreSQL under `REPEATABLE READ`, the
  snapshot is acquired at `BEGIN`, and that idle transaction immediately becomes the
  oldest snapshot in the instance and starves `autovacuum` on every table it could have
  touched. **Same bug, different trigger, opposite engine behaviour** — and it is the
  single best cross-engine observation in this chapter.
- **Locking reads ignore the read view entirely.** `SELECT ... FOR UPDATE`, `SELECT ...
  LOCK IN SHARE MODE` and `SELECT ... FOR SHARE` are *current reads*: they read the latest
  committed version and take locks, because the whole point is to act on the present, not
  on a snapshot. This is the source of the classic MySQL "repeatable read anomaly":

```sql
-- Session A                          -- Session B
BEGIN;                                 -- (autocommit)
SELECT * FROM t WHERE id=1;
                                       INSERT INTO t VALUES (2);  -- succeeds
SELECT * FROM t WHERE id=2;
-- ✗ empty. The read view says "2" did not exist at snapshot time.
SELECT * FROM t WHERE id=2 FOR UPDATE;
-- ✓ returns row 2. A current read ignores the read view.
-- Session A has now seen, within one REPEATABLE READ transaction, a state
-- that did not exist when it started. That is snapshot skew, and it is
-- the honest limitation of MySQL's RR.
```

### 3.6 The Read-Only Optimisation and the Read View's Lifetime

A read view's lifetime is exactly the transaction's lifetime: created on the first
consistent read, discarded at `COMMIT` or `ROLLBACK`. That is the whole of the "read-only
optimisation" that people are usually thinking of, and it has one very practical
consequence that belongs in an operations runbook: **`START TRANSACTION` with no query is
free; a transaction that has executed one `SELECT` and then sits in application code is
holding a read view for the entire time it sits there.**

The detection query is not negotiable; it should be in every runbook and on every
dashboard.

```sql
SELECT trx_id,
       TIMESTAMPDIFF(SECOND, trx_started, NOW()) AS age_seconds,
       trx_state,
       trx_mysql_thread_id  AS conn_id,
       trx_rows_locked,
       trx_rows_modified,
       LEFT(trx_query, 80)  AS query
FROM   information_schema.INNODB_TRX
ORDER  BY trx_started;
```

```sql
-- Map the trx_id to a human. There is no PROCESSLIST column for it.
SELECT id              AS conn_id,
       user, host, db,
       command, time    AS seconds_in_state,
       state,
       LEFT(info, 80)   AS query
FROM   information_schema.PROCESSLIST
ORDER  BY time DESC;
```

The number to alert on is `age_seconds`, not the count. A thousand 2-second transactions
are healthy; one 6-hour transaction is an incident, and it is an incident that degrades
the *whole instance* rather than one query, because it blocks purge for every table in
the instance.

### 3.7 Purge, the History List, and the Cost of Long Transactions

The **history list** is the linked list of committed undo records that purge has not yet
processed. Its length is the backlog. When it is zero, purge is caught up, undo space is
being recycled, and reads are cheap. When it is large, three things happen at once.

```text
  history list:  T9001 ──► T9002 ──► T9003 ──► ... ──► T1041 ──► [purge cursor]
  ◄────────────── everything purge has not yet reclaimed ───────────────►

  1. UNDO SPACE IS NOT RECYCLED. Each undo tablespace has a maximum size; when the
     history list fills it, and transactions that need to write undo BLOCK. The
     symptom is a sudden, total write freeze on the instance.

  2. EVERY READ WALKS A LONGER CHAIN. A row modified ten times after your read view
     was taken costs ten extra reads. Long scans get slower in a way that scales
     with the history list length, not with the table size.

  3. SCANS READ DELETED ROWS. Delete-marked records are still in the clustered
     index pages and are still walked by full scans until purge clears them.
     "Rows examined" climbs while "rows sent" does not.
```

The purge thread can only advance to the point where the **oldest active read view**
starts. If a transaction opened a read view at 14:00 and it is still open, purge cannot
pass any undo record created after 14:00 — regardless of how many transactions have
committed since. One transaction pins the entire instance's space reclamation, and every
delete you have issued since then is sitting in the history list waiting.

The two mitigations InnoDB itself provides, and what each actually does:

- **`innodb_max_purge_lag`** (default 2,000,000) makes purge sleep deliberately so that
  the *replica's* apply lag is reduced. It trades your primary's undo backlog for your
  replica's freshness, and it is off in the sense that setting it to 0 is the normal
  choice. It is not a fix for a long transaction — it is a fix for a *replica* that
  cannot keep up, and it makes the primary's history list deliberately longer.
- **More purge threads.** The number is small by design (a historical value around 4)
  because purge is a background maintenance task and the variable is deprecated in recent
  releases in favour of the newer purge-worker configuration. Adding purge threads does
  help a *large* history list, and it does nothing at all for a *stalled* one. The
  distinction is the whole point: **a large history list is a throughput problem that more
  purge workers can drain; a history list that is not moving at all is a blocking
  problem, and no amount of purge throughput fixes it.**
> **PRODUCTION SCENARIO**
>
> Problem: a reporting service began running p99 queries from 2 seconds to 90 seconds
> overnight, with no deploy, no traffic increase and no change in the query mix. Error
> rate was unchanged; the disk was 30% full.
> Investigation: `SHOW ENGINE INNODB STATUS` reported `History list length 4188233` and
> the monitoring query for `trx_rseg_history_len` had been climbing for six hours.
> `EXPLAIN` of the affected queries was unchanged and still `Using index`. The
> `SELECT` statements were fine — the undo history around them was not.
> Root cause: a nightly report job opened a connection with `autocommit=0`, ran one
> `SELECT` at 02:14 to "warm" the session, and then the job queued behind a slow
> downstream HTTP call for five hours before issuing the real query. The single early
> `SELECT` created a read view at 02:14, purge could not advance past it, and every
> delete-undo record in the instance accumulated behind it.
> Solution: killed the connection, purge drained the history list from 4.2 million to
> under 2,000 in about four minutes, and latency returned to baseline with no other
> change. The immediate fix was `SET SESSION innodb_lock_wait_timeout` in the job and a
> hard statement timeout.
> Prevention: added an alert on `trx_rseg_history_len` growth rate (not on its absolute
> value) and a second alert on any `INNODB_TRX` row older than 10 minutes, with the
> runbook entry naming this exact query. The job was rewritten to run its reads outside
> an explicit transaction, and the "warm the session" line was deleted because it was
> the entire bug.
> **INTERVIEW TRAP — "WHY DID EVERYTHING GET SLOWER AND NOTHING CHANGED?"**
>
> Because the work being done per read went up without the reads changing. A read view
> that is hours old means every row modified since then has to be resolved by walking undo
> until a version older than the read view is found, and a long scan over delete-marked
> records walks rows that are logically gone. `EXPLAIN` is unchanged, the plan is
> unchanged, the row estimates are unchanged, and the query text is unchanged — which is
> exactly why the incident is confusing. The diagnostic that resolves it is the *history
> list length* and the age of the oldest transaction, not the query plan, and the honest
> answer to "how would you find this" is: `SHOW ENGINE INNODB STATUS`, then
> `information_schema.INNODB_TRX` ordered by `trx_started`. Naming those two is the whole
> answer; an interviewer asking this question is testing whether you have ever watched
> purge fall behind.
> **MUST REMEMBER**
>
> **Purge is the reclaimer, and the oldest read view is its brake.** A long transaction
> does not just cost its own query: it blocks space reclamation for the entire instance,
> inflates the undo log toward a hard write-freeze threshold, lengthens the version chain
> every read has to walk, and keeps delete-marked rows in scan paths. Volume 5 owns MVCC in
> general and Volume 7 owns PostgreSQL's equivalent (`vacuum` starvation behind a long
> snapshot); this is the InnoDB mechanism, and the fix is always the same shape —
> **find the oldest transaction and make it end.**

#### Common Mistakes

- Confusing undo (before-images, for readers) with redo (after-images, for recovery), or
  calling either of them "the transaction log"
- Believing a read view is created at `BEGIN` — InnoDB creates it on the **first consistent
  read**, which is why an idle `BEGIN` pins nothing and a `BEGIN` followed by one `SELECT`
  pins everything
- Saying "the read view is per transaction" without qualifying that it is per transaction
  *only under `REPEATABLE READ`*, and per statement under `READ COMMITTED`
- Assuming a locking read (`FOR UPDATE`) respects the read view — it is a current read and
  ignores it, which is the source of MySQL's repeatable-read snapshot-skew anomaly
- Reaching for "add purge threads" as the fix for a stalled history list — that fixes a
  large one, and does nothing for one that is not advancing
- Treating a 4-million-row history list as a disk-space problem rather than a read-latency
  and write-freeze problem

#### Interview Questions — MVCC, Undo & the Read View

**Q1. What is in an undo record, and what is in a row that points at it?** `TRICKY`
Every clustered record carries a 6-byte `DB_TRX_ID` — the transaction that last wrote this
version — and a 7-byte `DB_ROLL_PTR`, a composite pointer of rollback-segment id, undo
log number and slot. Insert undo records are nearly empty and can be released at commit
because nothing can ever want the absence of a committed row. Update undo records hold the
previous values of the changed columns plus the writing transaction's id plus a roll
pointer to the *previous* update undo record, which is what makes the chain. Delete undo
records hold the row pre-image *and* the primary key of the row in every secondary index,
which is why a bulk delete inflates undo far more than a bulk update of the same row count.
**Q2. When is a read view created, and why does it matter?** `STAFF`

On the first consistent read of the transaction, not at `BEGIN`. Under `REPEATABLE READ`
that read view is then reused for the life of the transaction, so every statement in the
transaction sees one consistent world and non-repeatable reads are impossible. Under
`READ COMMITTED` a fresh read view is created for every statement and discarded when that
statement ends, so each statement sees the latest committed state and a row changed by
another transaction between two of your statements is visible to the second one. That one
fact explains every behavioural difference between the two levels in MySQL, including why
gap locks mostly disappear under `READ COMMITTED` and why undo chains are much shorter and
purge much healthier there. `START TRANSACTION WITH CONSISTENT SNAPSHOT` forces creation at
`BEGIN` for code that needs one moment across many tables.

**Q3. A transaction with `autocommit=0` runs one `SELECT` and then the application makes
HTTP calls for four hours. What breaks?** `ADVANCED`

The first `SELECT` creates a read view, and the read view lives for the transaction's
entire remaining life, including the four hours in which no SQL is executing. Purge cannot
advance past that read view, so the history list grows with every committed delete in the
instance, the undo log approaches its tablespace limit, undo chain walks for every read get
longer, full scans keep walking delete-marked rows, and eventually a transaction that needs
to write undo blocks on space. The whole instance degrades from one idle connection, and
nothing in the slow query log shows it, because there is no long-running statement — there
is a long-running *gap*. The fix is to not hold a transaction across non-database work, and
the detection is an alert on the age of the oldest `INNODB_TRX` row, not on the count of
transactions.

**Q4. What is the history list, and what is the correct response to it being large?** `STAFF`
It is the linked list of committed undo records that purge has not yet processed. Large
means three things at once: undo space is not being recycled, so the instance approaches a
hard write-freeze; reads are walking longer version chains, so latency scales with the
history list rather than the table; and full scans are still walking delete-marked records,
so "rows examined" climbs while "rows sent" does not. The correct response depends on
whether it is *draining*: a large-but-draining history list is a throughput problem and
more purge workers plus a look at the delete rate will fix it; a history list that is not
moving is a blocking problem, and the fix is `information_schema.INNODB_TRX` ordered by
`trx_started` to find the oldest transaction and end it. `innodb_max_purge_lag` is not the
answer — it deliberately trades primary-side backlog for replica apply lag.

**Q5. Why does an idle `BEGIN` in MySQL pin nothing while an idle `BEGIN` in PostgreSQL
under `REPEATABLE READ` starves autovacuum?** `ADVANCED`

Because of *when the snapshot is taken*. InnoDB creates the read view lazily, on the first
consistent read, so a transaction that has issued no statement holds no read view and
blocks no purge. PostgreSQL acquires the snapshot at `BEGIN` under `REPEATABLE READ`, so
that same idle transaction immediately becomes the oldest live snapshot in the cluster and
every subsequent dead tuple in every table it could have touched becomes unvacuumable. The
symptom in both engines is identical and the diagnosis is the same query against a
different view — the operational difference is that in MySQL the trigger is *"this
transaction executed a `SELECT` and then did something else for hours"*, and in PostgreSQL
it is *"this transaction said `BEGIN` and then went away"*. Anyone running both engines in
one organisation needs to know that the same ORM default produces two different failure
modes.

> **CHAPTER 3 SUMMARY**
>
> MVCC in InnoDB is a per-transaction **read view** — a lower watermark, an upper
> watermark and an array of in-flight transaction ids — plus a **chain of undo records**
> hanging off each row's 7-byte `DB_ROLL_PTR`. Visibility of a row version is pure
> arithmetic against those three numbers, and only the case "the writer was active when I
> took my snapshot" forces a chain walk; the length of that walk is how much a
> long-running transaction taxes every other reader. The read view is created on the
> **first consistent read**, not at `BEGIN` — which is why an idle `BEGIN` costs nothing in
> MySQL and immediately starves `autovacuum` in PostgreSQL under `REPEATABLE READ`. Under
> `RR` the read view is reused for the transaction's life; under `RC` a new one is created
> per statement, and that single fact explains every behavioural difference between the two
> levels, including gap locks mostly vanishing under `RC` and undo chains being far
> shorter. Locking reads ignore the read view entirely, which is the source of MySQL's
> snapshot-skew anomaly. And the operational law of the chapter is that **purge is the
> reclaimer and the oldest read view is its brake**: one long transaction blocks space
> reclamation for the whole instance, inflates undo toward a write-freeze threshold, and
> degrades every read on it — which is why the first query in the runbook is always
> `information_schema.INNODB_TRX` ordered by `trx_started`.

#### Further Reading

- [InnoDB Undo Logs](https://dev.mysql.com/doc/refman/8.0/en/innodb-undo-logs.html) — the three undo types, undo tablespaces, truncation, and why insert undo is cheap.
- [InnoDB Multi-Versioning](https://dev.mysql.com/doc/refman/8.0/en/innodb-multi-versioning.html) — the read view structure and the visibility rules, from the source of truth.
- [InnoDB Transaction Model](https://dev.mysql.com/doc/refman/8.0/en/innodb-transactions.html) — read views under `READ COMMITTED` and `REPEATABLE READ`, locking reads, and the `WITH CONSISTENT SNAPSHOT` form.
- [InnoDB Information Schema and `SHOW ENGINE INNODB STATUS`](https://dev.mysql.com/doc/refman/8.0/en/information-schema-innodb-metrics-table.html) — the counters that tell you whether purge is keeping up, and the exact command to read them.
- [Troubleshooting InnoDB History List Length](https://dev.mysql.com/doc/refman/8.0/en/innodb-purge.html) — purge's own behaviour, the configurable lag, and what purge actually does when it runs.

## Chapter 4 — Indexes & Index Design

Volume 4 owns B+ trees, the leftmost prefix rule and how to read `EXPLAIN` in general.
This chapter is the MySQL-specific application of all three, and it is dense with
arithmetic because almost every interesting MySQL index decision turns out to be a
question about *bytes per index entry*.

### 4.1 The Schema Every Example Uses

Everything in this chapter uses one table, so the numbers are comparable across examples.

```sql
CREATE TABLE orders (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  email       VARCHAR(254)     NOT NULL,
  status      VARCHAR(16)      NOT NULL,
  channel     VARCHAR(16)      NOT NULL DEFAULT 'web',
  total_cents BIGINT UNSIGNED  NOT NULL,
  created_at  DATETIME         NOT NULL,
  note        TEXT,
  PRIMARY KEY (id),
  KEY ix_orders_customer_status (customer_id, status),
  KEY ix_orders_status (status),
  KEY ix_orders_created  (created_at),
  KEY ix_orders_email    (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
```

50 million rows, average 380 bytes of stored payload per row including the record header,
the transaction fields, the null bitmap and any off-page `TEXT` pointer. 16,384 / 380 ≈ 43
rows per clustered leaf, so the clustered index is about 1.16 million leaf pages and three
levels. That is the reference frame for every cost estimate below.

### 4.2 The Leftmost Prefix Rule, Applied to InnoDB

The rule itself is Volume 4's: a composite index on `(a, b, c)` can serve a predicate on
`a`, on `(a, b)`, on `(a, b, c)` and on a range after the last equality column — and
cannot serve a predicate on `b` or `c` alone. In InnoDB the consequence is *physical*,
because the secondary index's leaf entries are sorted by that tuple, so a lookup that
starts at the second column has no ordered position to start from.

```text
  ix_orders_customer_status  (customer_id, status)
  leaf pages, in sort order:
  page 1                          page 2
  (7,   'CANCELLED')              (91,  'NEW')
  (7,   'NEW')                    (91,  'SHIPPED')
  (7,   'SHIPPED')                (92,  'NEW')
  (12,  'NEW')                    (92,  'SHIPPED')
  (12,  'SHIPPED')                (3500,'NEW')
  (42,  'CANCELLED')  ◄── ?       (3500,'SHIPPED')
  (42,  'NEW')                    ...
  (42,  'SHIPPED')
  WHERE customer_id = 42  AND  status = 'SHIPPED'
      → seek straight to the (42, ...) run, binary search inside it.
        TWO page reads: one root, one leaf. The internal levels are hot.
  WHERE status = 'SHIPPED'
      → 'SHIPPED' appears on page 1 AND page 2 AND page 3 AND ...
        There is no single place the value lives. The index is useless.
```

MySQL 8.0's **skip scan** (introduced in 8.0.13) partially rescues the second case: if the
leading column has low cardinality, the optimiser can enumerate the distinct values of
`customer_id` and do a skip scan for each. It is not free — it is a full scan of the index
with a seek per distinct leading value — and it only kicks in when the leading column's
selectivity is poor enough that the optimiser decides the enumeration is cheaper. Knowing
it exists matters, because `EXPLAIN` will show `type: range` and `key` as your composite
index for a query that has no leading-column predicate, and a candidate who does not know
about skip scan concludes that the `EXPLAIN` is wrong.

Two more InnoDB-specific facts that change design decisions:

- **A nullable column is 1 byte more expensive in every index entry.** You see it directly
  in `key_len`, and at 500 million rows it is real space.
- **Index entry size directly sets fan-out, and fan-out sets tree height.** A secondary
  index on `email VARCHAR(254)` utf8mb4 with a `BIGINT` primary key is
  254×4 + 2 + 6 + 7 + 8 = **1039 bytes per entry** in the worst case. A 16 kB leaf holds
  ~15 of those, so the index is enormously tall for its row count — a 50-million-row email
  index is 3.3 million leaf pages and *four* levels, not three. Cutting the column to
  `VARCHAR(191)`, or storing it as `VARBINARY(255)`, drops it back to three levels. This
  is the most under-appreciated reason to size a `VARCHAR` deliberately.

### 4.3 Covering Indexes and the `Using index` Marker

A covering index is one that contains every column the query needs, so the clustered
index is never touched. This is the highest-leverage optimisation available in MySQL and
it is invisible unless you know to look at the `Extra` column.

```sql
-- Not covering: the index gives you id, the row gives you the rest.
EXPLAIN SELECT id, status FROM orders WHERE customer_id = 42;
```

```text
+----+------------+-------+------------+-------+-------------+-------------------------+---------+-------------+--------+------+-------------+-------+
| id | select_type | table | partitions | type  | possible_keys | key                     | key_len | ref         | rows  | filtered | Extra       |
+----+------------+-------+------------+-------+-------------+-------------------------+---------+-------------+--------+------+-------------+-------+
|  1 | SIMPLE      | orders | NULL      | ref   | ix_orders_customer_status | ix_orders_customer_status |      8 | const       |     6 |   100.00 | NULL        |
+----+------------+-------+------------+-------+-------------+-------------------------+---------+-------------+--------+------+-------------+-------+
                                       ▲ key_len = 8: only customer_id was indexed
                                       ▲ Extra = NULL: NOT covering → the 回表 happens
-- Covering: the index is widened, the clustered index is never read.
ALTER TABLE orders ADD INDEX ix_orders_customer_status_total (customer_id, status, total_cents);
EXPLAIN SELECT id, status, total_cents FROM orders WHERE customer_id = 42;
```

```text
+----+------------+-------+------------+-------+-------------+-------------------------------------+---------+-------------+--------+------+-------------+-----------+
| id | select_type | table | partitions | type  | possible_keys | key                                 | key_len | ref         | rows  | filtered | Extra         |
+----+------------+-------+------------+-------+-------------+-------------------------------------+---------+-------------+--------+------+-------------+-----------+
|  1 | SIMPLE      | orders | NULL      | ref   | ix_orders_customer_status_total | ix_orders_customer_status_total |      8 | const       |      6 |   100.00 | Using index  |
+----+------------+-------+------------+-------+-------------+-------------------------------------+---------+-------------+--------+------+-------------+-----------+
                                       ▲ Extra = "Using index" → no 回表
                                         three page reads, not six
```

There is a second marker that looks the same and is not: **`Using where; Using index`**
means the index *is* covering but a residual predicate remains that the index alone could
not evaluate. And **`Using index condition`** is completely different: it is index
condition pushdown, where a condition involving both an indexed and a non-indexed column is
pushed down to the storage engine so rows that cannot pass it are never fetched from the
clustered index at all. It is a *partial* elimination of the return to table, not a full
one.

**The cost side of a covering index is not free and must be stated.** Widening

`ix_orders_customer_status` from `(customer_id, status)` to

`(customer_id, status, total_cents)` adds 8 bytes to every entry. At 50 million rows the
index goes from 50M × 81 bytes to 50M × 89 bytes — 4.05 GB to 4.45 GB, about 400 MB more
disk, more redo on every insert and every update that touches `status`, and a slightly
taller tree. The correct way to frame that trade in a review is: *a covering index is a
space-for-latency trade, and it is a good trade exactly when the query is hot and the index
is narrow relative to the row.* Adding `note TEXT` to an index to make a query covering is
not a trade, it is a mistake.

### 4.4 Index Merge: When Two Indexes Are Better Than None — Usually Not

Index merge is the optimiser combining the results of several single-column indexes to
satisfy a query. Three variants exist and all three appear in the `Extra` column.

```sql
-- Classic index merge: a UNION of two result sets.
EXPLAIN SELECT * FROM orders
 WHERE customer_id = 42 OR email = 'a@b.com';
```

```text
+----+------------+-------+------------+-------+-------------------------------------+-------+---------+------+-------------+-------------+
| id | select_type | table | partitions | type | possible_keys                       | key   | key_len | ref  | rows        | Extra       |
+----+------------+-------+------------+-------+-------------------------------------+-------+---------+------+-------------+-------------+
|  1 | SIMPLE      | orders | NULL      | range| ix_orders_customer_status,ix_orders_email | NULL |   NULL | NULL |       6554 | Using union |
+----+------------+-------+------------+-------+-------------------------------------+-------+---------+------+-------------+-------------+
                                                          ▲ key is NULL — the optimiser used TWO indexes
```

The variants and the `Extra` marker for each:

| Variant | Marker | Behaviour | When it is right |
| --- | --- | --- | --- |
| `UNION` | `Using union` | reads both indexes, concatenates, de-duplicates | two `OR`-ed equality predicates, both very selective |
| `INTERSECT` | `Using intersect` | reads both indexes, intersects | two `AND`-ed equalities on columns not indexed together, both selective |
| `SORT INTERSECT` | `Using sort_intersect` | reads both, sorts and intersects | the intersect case when the index does not already return rows in primary key order |

Two facts about index merge that are not in most tutorials. First, the whole family can be
turned off in a session with `SET SESSION optimizer_switch = 'index_merge=off'`, and that
is a genuinely useful *diagnostic*: if turning it off improves a query, the optimiser was
making a mistake, and the fix is usually a composite index rather than leaving the merge
enabled. Second, and much more importantly:

> **INTERVIEW TRAP — "IS INDEX MERGE FASTER THAN A FULL TABLE SCAN?"**
>
> Asking *whether* is the wrong question, because the answer is that **index merge is
> frequently slower than a full table scan, and the optimiser will correctly choose the
> full scan.** Consider the `OR` example above on a 50-million-row table. The optimiser
> estimates 6,554 rows will be examined — but it has to read *both* index subtrees,
> collect every matching primary key into a temporary structure, de-duplicate those 6,554
> keys, and then perform a clustered-index descent for **each** of them. That is 6,554
> random page reads, essentially all of them misses in a buffer pool being thrashed by the
> very scan driving them. A sequential scan of 1.16 million clustered pages is 1.16 million
> reads — but *sequential*, prefetchable, and warming the buffer pool as it goes. The
> 6,554 random reads are not prefetched and get no reuse. On spinning storage the full
> scan wins by a wide margin; on NVMe the gap narrows and does not close.
>
> The honest answer is: **index merge is a plan the optimiser falls back to, not a plan
> you design for.** If your query has a disjunction over low-selectivity columns, write the
> composite index that makes the disjunction a single range, or split the query into a
> `UNION ALL` of two indexed queries so you can see the cost of each half separately.

`optimizer_switch` is the instrument for all of this, and being able to toggle one flag in
a session to test a hypothesis is a genuinely senior skill:

```sql
SELECT @@optimizer_switch\G
```

```text
*************************** 1. row ***************************
@@optimizer_switch: index_merge=off,index_merge_union=off,index_merge_intersection=off,
                    index_merge_sort_intersection=off,index_condition_pushdown=on,
                    mrr=on,mrr_cost_based=on,mrr_sort_keys=on,
                    derived_merge=on,derived_with_keys=on,derived_remove_extra=on,
                    firstmatch=on,loosescan=materialization,...
```

### 4.5 Prefix Indexes for Long `VARCHAR` and `BLOB`

A prefix index stores only the first *n* characters of a long column. It is the only way
to index a `TEXT`/`BLOB` column at all, and it is the right way to handle an unbounded
identifier column.

```sql
ALTER TABLE users
  ADD INDEX ix_users_email (email(191)),
  ALGORITHM=INPLACE, LOCK=NONE;
SHOW INDEX FROM users WHERE Key_name = 'ix_users_email';
```

```text
+-------+------------+--------------+-------------+-------------+-----------+-------------+
| Table | Non_unique | Key_name    | Seq_in_index | Column_name | Collation | Cardinality |
+-------+------------+--------------+-------------+-------------+-----------+-------------+
| users |          1 | ix_users_email |          1 | email       | A         |      1829344 |
+-------+------------+--------------+-------------+-------------+-----------+-------------+
```

191 characters of utf8mb4 is 764 bytes plus a 2-byte length prefix, so 766 bytes per
entry instead of 1018 — and, more importantly, an entry that fits many more per leaf page,
so the index drops from four levels back to three. 191 is not a magic number, it is the
widest prefix that fit under the historical 767-byte-per-column index prefix limit with
utf8mb4; with the default `DYNAMIC` row format since 5.7 the limit is 3072 bytes and you
can and often should go wider. The number to compute is the *selectivity you need*, not
the limit you remember.

What a prefix index can and cannot do, and the second column is where people get hurt:

| Can | Cannot |
| --- | --- |
| `WHERE email LIKE 'a@b%'` — a prefix match is exactly a range on the index | return the column value itself, so it is never covering on its own |
| narrow a `TEXT`/`BLOB` column to a small candidate set | `ORDER BY email` or `GROUP BY email` on the full column |
| let most rows be rejected before the return to table | back a `UNIQUE` constraint on a `TEXT` column |
| | be assumed to fully resolve `WHERE email = 'a@b.com'` |

The `=` case is the trap. A prefix index **cannot** be assumed to serve an equality
predicate, because `email = 'a@b.com'` is only equivalent to a prefix range scan if the
value is longer than the prefix. If the query value is *shorter* than the index prefix —
and a 191-character prefix is far longer than most addresses — the engine still has to
compare the remaining bytes after the lookup, which means fetching the row. The way to tell
the difference is to read `key_len`: if it reflects the full column width, the index
resolved the predicate; if it reflects only the prefix, the row still had to be fetched to
confirm the tail.

### 4.6 Cardinality, and the Index the Optimiser Ignores

InnoDB's persistent statistics store, per index, the number of distinct values and a
sample-based distribution. A 50-million-row column with 1.8 million distinct values has
selectivity 0.036; a column with four distinct values has selectivity near 1.0, meaning
"an equality predicate on this returns a quarter of the table", and no index on it is worth
reading — reading a quarter of the table through a random-access index is strictly worse
than reading it sequentially.

```sql
SELECT INDEX_NAME,
       SEQ_IN_INDEX,
       COLUMN_NAME,
       CARDINALITY,
       ROUND(100 / GREATEST(CARDINALITY, 1), 8) AS pct_of_rows
FROM   information_schema.STATISTICS
WHERE  TABLE_SCHEMA = 'shop' AND TABLE_NAME = 'orders'
ORDER  BY INDEX_NAME, SEQ_IN_INDEX;
```

```text
+------------------------+------------+-------------+-------------+-----------------------+
| INDEX_NAME             | SEQ_IN_INDEX| COLUMN_NAME | CARDINALITY | pct_of_rows          |
+------------------------+------------+-------------+-------------+-----------------------+
| PRIMARY                |          1 | id          |     50000000 |          0.00000002  |
| ix_orders_created      |          1 | created_at  |     48000000 |          0.00000021  |
| ix_orders_customer_status |       1 | customer_id |     8200000 |          0.00000122  |
| ix_orders_customer_status |       2 | status      |           4 |          0.02500000  |
| ix_orders_email        |          1 | email       |     1829344 |          0.00054677  |
| ix_orders_status       |          1 | status      |           4 |          0.02500000  |
+------------------------+------------+-------------+-------------+-----------------------+
```

`ix_orders_status` is the interesting row. Four distinct values over 50 million rows: any
equality predicate on `status` returns 12.5 million rows, and 12.5 million random accesses
is a catastrophe. The optimiser knows this — its cost model compares the estimated cost of
the index access against the cost of a full scan and picks the scan. **This is correct
behaviour**, and a candidate who says "the optimiser is being stupid, it should use my
index" is demonstrating that they do not know it is doing arithmetic. The `FORCE INDEX`
escape hatch exists and it is almost always the wrong fix: forcing a low-selectivity index
converts a fast sequential scan of 1.16 million pages into 12.5 million random page reads.
Two related behaviours worth naming:

- **An index that is a leftmost prefix of a wider index is often redundant.** Given
  `(customer_id, status)` and `(customer_id, status, created_at)`, the first cannot serve
  anything the second cannot, and it costs a whole extra tree on every insert and update.
  The 8.0 **invisible index** feature exists precisely to let you find these safely.
- **Statistics drift silently.** The `CARDINALITY` above was sampled from
  `innodb_stats_persistent_sample_pages` (default 20) index pages, not computed exactly. A
  column whose distribution changed — `status` moving from four values to forty thousand
  because a release added per-warehouse states — keeps a badly wrong estimate until
  `ANALYZE TABLE` runs. Chapter 7 is entirely about this.

```sql
-- Make an index invisible: still maintained on every write, ignored by the optimiser.
-- This turns "should we drop this index?" from a leap of faith into an experiment.
ALTER TABLE orders ALTER INDEX ix_orders_status INVISIBLE;
EXPLAIN SELECT id FROM orders WHERE status = 'SHIPPED';
-- ... run the workload, compare latency, then:
ALTER TABLE orders ALTER INDEX ix_orders_status VISIBLE;
ALTER TABLE orders DROP INDEX ix_orders_status;
```

> **MUST REMEMBER**
>
> **An index is a `key_len`, and `key_len` is bytes.** `VARCHAR(254)` utf8mb4 is 1018
> bytes before you add `DB_TRX_ID`, `DB_ROLL_PTR` and the primary key suffix; a nullable
> column costs one more. Bytes per entry set fan-out, fan-out sets tree height, and tree
> height sets how many pages a point lookup touches. When someone asks why a query does six
> page reads when it "should" do three, the answer is in `key_len`, and `key_len` is the
> most useful column in `EXPLAIN` and the one nobody reads.

### 4.7 Descending, Functional and Invisible Indexes

Three index features that exist to solve specific problems and are almost never used.
**Descending indexes** (MySQL 8.0) are real DDL rather than a syntax trick. Before 8.0,
the documented way to get a descending scan was to *reverse the column definition*, which
works for a single column and is nonsense for a mixed-direction composite.

```sql
ALTER TABLE events
  ADD INDEX ix_events_ts_dir (created_at DESC, shard ASC);
```

InnoDB stores a one-byte flag per key part in the record header, so a descending index
costs exactly one extra byte per indexed column — real numbers again, and worth knowing
when someone asks whether there is a price. What it buys is this:

```sql
-- One of these is a 10-second filesort. The other is a backward index scan.
EXPLAIN SELECT * FROM events ORDER BY created_at DESC LIMIT 100\G
```

**Functional indexes** (MySQL 8.0.13) index an *expression*. The expression must be
wrapped in double parentheses, must be deterministic, and cannot contain a subquery or a
non-deterministic function.

```sql
ALTER TABLE users     ADD INDEX ix_users_email_norm  ((LOWER(email)));
ALTER TABLE events    ADD INDEX ix_events_tenant_day  ((tenant_id, DATE(created_at))));
-- Now these are index ranges, not a function call over every row.
SELECT id FROM users  WHERE LOWER(email) = 'a@b.com';
SELECT id FROM events WHERE tenant_id = 7
                          AND DATE(created_at) = '2026-09-27'
                       ORDER BY id LIMIT 500;
```

The portable alternative is a generated column plus an index, which works on every
version:

```sql
ALTER TABLE users
  ADD COLUMN email_norm VARCHAR(254) GENERATED ALWAYS AS (LOWER(email)) STORED,
  ADD INDEX ix_users_email_norm (email_norm);
```

> **TRADE-OFF — "FUNCTIONAL INDEX OR GENERATED COLUMN?"**
>
> Both give the optimiser a usable index on `LOWER(email)`. The functional index has zero
> schema cost — no extra column, no extra storage in the row, nothing to keep in sync —
> and it computes the expression twice per query, once at write time to build the entry and
> once at read time to evaluate the predicate. The stored generated column computes once
> but stores the result on every row, and it is visible to `SELECT *`, to an ORM's entity
> mapping, and to a `pt-online-schema-change` in a way the functional index is not. The
> condition that flips the answer: use the functional index when the expression is a
> read-side filter on a narrow lookup and the write path is hot; use the generated column
> when several queries need the expression and the storage is affordable. On a
> 500-million-row table, 254 bytes of stored column is 127 GB, and that number ends the
> discussion.

### 4.8 Reading `EXPLAIN`: The Fields That Matter

`EXPLAIN` has eleven columns and only some of them change what you do. This is the
working subset.

| Field | What it actually tells you | What to do when it is wrong |
| --- | --- | --- |
| `type` | the access method, best to worst: `system`, `const`, `eq_ref`, `ref`, `fulltext`, `ref_or_null`, `index`, `ALL` | `ALL` on a large table is a full scan. `index` is a full *index* scan, which is often fine on a narrow covering index. `ref` or better on a large table is the goal. |
| `possible_keys` | the indexes the optimiser *considered* | if it is empty, the predicate is not sargable and no index can help |
| `key` | the index it *chose*. `NULL` with a non-empty `possible_keys` means it chose a scan | check `type`; if `ALL`, the cost model said a scan is cheaper |
| `key_len` | **bytes of index used** — the most diagnostic column | a short `key_len` on a long `VARCHAR` means you are using a prefix, or a nullable `+1` |
| `ref` | which columns were compared to what. `const` is a literal, `func` is a function | `ref = func` means wrap the column in an index instead of calling a function on it |
| `rows` | **estimated** rows examined *at this step of the join* | compare against reality; a 100× gap is a statistics problem, not a SQL problem |
| `filtered` | percentage of `rows` expected to survive *this table's* condition | `100.000` means the predicate is applied elsewhere; `rows × filtered%` is the output estimate |
| `Extra` | what the executor will additionally do | the whole next paragraph |

`Extra` is where the operational information lives, and these are the markers worth
memorising:

| `Extra` | Means | Action |
| --- | --- | --- |
| `Using index` | covering — the clustered index is never touched | nothing, this is the goal |
| `Using where; Using index` | covering, but a residual predicate remains | usually fine; look at the predicate |
| `Using index condition` | index condition pushdown — a partly-indexed predicate is evaluated in the storage engine | good; rows that fail are never fetched |
| `Using filesort` | a sort the index could not provide | add an index that provides the order, or verify the sort is over a small row set |
| `Using temporary` | an intermediate table — a `GROUP BY` or `DISTINCT` the index cannot stream | look for a composite index matching the `GROUP BY` order |
| `Using join buffer (Block Nested Loop)` | hash join or BNL — join order or indexing is wrong | check `rows` on both sides; the usual cause is a missing index on the second table |
| `Backward index scan` | reading an ascending index backwards | fine |
| `Not exists` | an anti-join, executed as such | good — the optimiser rewrote your `NOT EXISTS` |
| `Range checked for each record` | re-checking the index per row (MyISAM only) | a MyISAM smell, not an InnoDB one |
| `Impossible WHERE` | the optimiser proved the predicate is never true | your data or your `LIMIT` is wrong |

A realistic two-table join with the reasoning shown:

```sql
EXPLAIN
SELECT o.id, o.total_cents, c.name
FROM   orders o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.created_at >= '2026-09-01'
  AND  o.status = 'SHIPPED'
ORDER BY o.created_at DESC
LIMIT 200;
```

```text
+----+------------+-------+------------+-------+-------------------------+-------------------------+---------+--------------+--------+-------------+-----------------------------+
| id | select_type | table | partitions | type | possible_keys           | key                     | key_len | ref          | rows   | filtered | Extra                         |
+----+------------+-------+------------+-------+-------------------------+-------------------------+---------+--------------+--------+-------------+-----------------------------+
|  1 | SIMPLE      | o     | NULL       | ref  | ix_orders_status        | ix_orders_status         |      66 | const        | 654118 |     0.10 | Using where; Using index      |
|  2 | SIMPLE      | c     | NULL       | eq_ref | PRIMARY                | PRIMARY                  |       8 | o.customer_id |      1 |   100.00 | NULL                          |
+----+------------+-------+------------+-------+-------------------------+-------------------------+---------+--------------+--------+-------------+-----------------------------+
                                  ▲                                            ▲
                                  │                                            └── one row per outer row: the
                                  │                                                clustered index gives a
                                  │                                                single-row lookup. eq_ref is
                                  │                                                the best a join can do.
                                  └── key_len 66 = VARCHAR(16) utf8mb4 = 64 + 2
                                      rows 654,118 estimated for status='SHIPPED'
                                      filtered 0.10% → ~654 rows survive the date filter
```

Note what that plan got *wrong*: 654,118 estimated for a four-valued column is the cost of
sampling on a column whose true cardinality is 4, and the `ORDER BY created_at DESC` is
being satisfied with `Using where; Using index` rather than an ordered scan, so there is no
`Using filesort` and no backward scan — the index it picked is not the index the ordering
wants. `ANALYZE TABLE orders` plus an index on `(status, created_at)` is the fix.

```sql
-- 8.0.18+. This is the plan AND what actually happened, not just the plan.
EXPLAIN ANALYZE
SELECT o.id FROM orders o
 WHERE o.status = 'SHIPPED' AND o.created_at >= '2026-09-01';
```

```text
-> Limit: 200 row(s)
    -> Index range scan on o using ix_orders_status  (cost=1094.6 rows=654 width=8)
        (actual time=3.14..8892.60 rows=641 loops=1)
        -> Index condition: ((o.status = 'SHIPPED') and (o.created_at >= '2026-09-01'))
                            (cost=1094.6 rows=654 width=8)
                            (actual time=3.14..8890.22 rows=641 loops=1)
                                            ▲                     ▲
                              estimate 654, actual 641 — this one is fine.
                              When the two diverge by 100×, the plan is not
                              the problem. The statistics are.
```

> **PRODUCTION RELEVANCE**
>
> `EXPLAIN ANALYZE` *executes* the statement. On a `SELECT` that is usually fine and is
> the best tool in the box. On an `UPDATE` or a `DELETE` it will take the locks and do the
> work. The convention that keeps people out of trouble is to wrap the statement so only
> a `SELECT` is analysed, to run it inside a transaction you are about to roll back, and
> never to put it in a monitoring loop that fires on a schedule against production.

#### Common Mistakes

- Reading `rows` as the rows returned — it is rows *examined* at that join step, and
  `rows × filtered%` is the output estimate
- Believing the "an index is only used if it returns less than 30% of the table" rule —
  there is no such threshold; the cost model compares modelled costs, and the folklore
  number is a coincidence that has outlived the fact it came from
- Treating `Using index condition` as a covering index — it is a partial elimination of the
  return to table, not a full one
- Forgetting that `key_len` is *bytes*, and that `VARCHAR(254)` utf8mb4 costs 1018 bytes per
  secondary entry
- Assuming a prefix index fully serves `WHERE col = 'literal'` — the tail beyond the prefix
  still requires fetching the row
- Reaching for `FORCE INDEX` when the optimiser chose a scan; it usually chose correctly,
  and forcing a low-selectivity index is how a 30-second query becomes a 30-minute one
- Running `EXPLAIN ANALYZE` on an `UPDATE` against production

#### Interview Questions — Index Design & `EXPLAIN`

**Q1. What does `key_len` tell you, and why is it the most useful column in `EXPLAIN`?**
`TRICKY`

It is the number of bytes of the index actually used by the access path, so it tells you
which prefix of a composite index participated and how wide each part is. A `VARCHAR(254)`
utf8mb4 column is 254×4 + 2 = 1018 bytes; a nullable column adds 1; `DATETIME` is 5;
`BIGINT` is 8. A `key_len` much smaller than the column's declared width means a prefix
index is in play, or the composite index was only partially used, or the column is narrower
than you thought. Because bytes per entry determine fan-out, and fan-out determines tree
height, `key_len` is also a direct predictor of how many page reads a lookup will cost —
which makes it the one column that connects a schema decision to a latency number.
**Q2. When is index merge a good plan, and when is it worse than a full scan?** `ADVANCED`
It is good when two single-column indexes each answer one branch of an `OR` and both
branches are very selective — a few hundred primary keys in total. It is worse than a full
scan when the branches are not selective, and that case is common: index merge collects
every matching primary key from both subtrees into a temporary structure, de-duplicates,
and then performs a clustered-index descent per key, so 6,554 matches is 6,554 *random*
page reads with no prefetching and no buffer-pool reuse, against a sequential scan of 1.16
million pages that prefetches and warms the pool as it goes. On spinning storage the scan
wins comfortably. The correct design response is a composite index that turns the
disjunction into one range, or an explicit `UNION ALL` of two indexed queries — not
reliance on the merge. `SET SESSION optimizer_switch='index_merge=off'` is the diagnostic
that tells you whether the optimiser is making a mistake here.

**Q3. You have a four-valued `status` column and 50 million rows, and an index on it that
nobody uses. Why is the optimiser being correct?** `TRICKY`

An equality predicate on `status` returns a quarter of the table, 12.5 million rows.
Serving that through an index is 12.5 million *random* accesses; serving it with a
sequential scan is 1.16 million *sequential* page reads that prefetch and warm the buffer
pool. The optimiser models both and picks the cheaper one, which is the right answer. The
trap is reaching for `FORCE INDEX` to "fix" it, which converts a 30-second sequential scan
into a 30-minute random-access storm. The real questions are whether `status` should lead a
composite index whose other columns make it selective — `(status, created_at)` narrows it
to 654 rows — and whether the four-value cardinality is a *data* problem, because a column
that used to have four values and now has forty thousand is a statistics problem that
`ANALYZE TABLE` fixes.

**Q4. What is a functional index for, and what does it cost?** `ADVANCED`

It indexes an expression — `(LOWER(email))`, `(tenant_id, DATE(created_at))` — so a
predicate on that expression becomes an index range instead of a function call over every
row. The portable alternative is a `STORED` generated column plus an index. The functional
index has no schema cost and computes the expression twice, once at write time and once at
read time; the generated column computes once but stores the result on every row, and it is
visible to `SELECT *` and to an ORM's entity mapping in a way the functional index is not.
The expression must be deterministic, wrapped in double parentheses, and free of
subqueries. The condition that picks the functional index is a cheap expression on a hot
write path where storage is not affordable — on 500 million rows, a 254-byte stored column
is 127 GB, and that number ends the discussion.

> **CHAPTER 4 SUMMARY**
>
> A MySQL index decision is a bytes-per-entry decision. `key_len` is the column that tells
> you the number — `VARCHAR(254)` utf8mb4 is 1018 bytes before the transaction fields, the
> roll pointer and the primary key suffix — and bytes per entry set fan-out, fan-out sets
> tree height, and tree height sets the page reads per lookup. The clustered index is a
> single B+ tree over that key, so a covering index is the only way to avoid the second
> descent, and `Using index` in `Extra` is how you confirm it; `Using index condition` is a
> partial elimination, not a full one, and the widened index is paid for in space and in
> redo on every write. The leftmost prefix rule is physical — the sort order has no single
> home for a non-leading value — with 8.0's skip scan as a partial, costed exception.
> Index merge is a fallback the optimiser takes, not a plan you design for, and it loses
> to a sequential scan whenever the matched set is large, because every match becomes a
> random clustered descent. Low-cardinality indexes are correctly ignored, and forcing them
> with `FORCE INDEX` is how a 30-second query becomes a 30-minute one. And because InnoDB
> samples statistics from 20 index pages, a column whose cardinality changed is a
> confidently wrong plan rather than an error — which is the bridge to Chapter 7.

#### Further Reading

- [Optimization and Indexes](https://dev.mysql.com/doc/refman/8.0/en/optimization-indexes.html) — the official take on multiple-column indexes, the leftmost prefix rule and skip scan.
- [EXPLAIN Output Format](https://dev.mysql.com/doc/refman/8.0/en/explain-output.html) — every column and every `Extra` value, from the reference manual.
- [EXPLAIN ANALYZE](https://dev.mysql.com/doc/refman/8.0/en/explain.html) — actual versus estimated row counts, and the warning that it executes the statement.
- [Multiple-Column Indexes](https://dev.mysql.com/doc/refman/8.0/en/multiple-column-indexes.html) — why the leftmost prefix rule is a physical consequence of the sort order, with worked examples.
- [Invisible Indexes](https://dev.mysql.com/doc/refman/8.0/en/invisible-indexes.html) — the 8.0 feature that makes index removal a measurable experiment rather than a leap of faith.

## Chapter 5 — Locks, Gaps & Deadlocks

Volume 5 owns deadlock, isolation and concurrency control in general. This chapter is the
InnoDB mechanism, and it is the mechanism that makes `REPEATABLE READ` MySQL's default
possible and MySQL's deadlocks different from everyone else's.

### 5.1 Four Granularities, and Why Intention Locks Exist

InnoDB locks at four levels, and the only one people picture is the one that is least
interesting.

| Level | Name | Granularity | Held for |
| --- | --- | --- | --- |
| Tablespace | tablespace-level lock | the whole file | very rare; `LOCK TABLES` interactions |
| Table | table lock, with intention variants | the table's identity | held implicitly by every row lock |
| Index | index record / page | inside one B+ tree | the actual row-level locking |
| Record | record, gap or next-key record | a row, a gap, or a row plus its gap | where `FOR UPDATE` actually lands |

**Intention locks are the reason the table level exists at all.** Before intention locks, a
table-level `S` lock taken by a plain `SELECT` would block a concurrent `INSERT`, so a
long read would stop all writes to the table. Instead, a transaction that wants to lock
rows takes a *table-level intention* lock — `IS` if it will take shared row locks, `IX` if
it will take exclusive row locks, `SIX` if it will take shared row locks and later upgrade
to exclusive. `IS` and `IX` do not conflict with each other or with `IS`/`IX`/`SIX`, so
thousands of transactions can hold intention locks simultaneously. What they *do* is
declare intent, so that a genuine table-level `X` lock — a `LOCK TABLES ... WRITE`, an
`ALTER TABLE`, a `DROP TABLE` — cannot slip in while row locks are outstanding.

```text
  IS  Intentional Share        "I intend to take S row locks"
  IX  Intentional Exclusive    "I intend to take X row locks"
  S   Shared                   "I intend to read every row of this table"
  X   Exclusive                "I intend to write every row of this table"
  SIX Shared Intentional Excl. "I intend to read all rows, then write some"
```

Two consequences people get wrong. **A plain `SELECT` takes no row locks at all** — it is
a consistent nonlocking read served from the read view, so it neither blocks nor is blocked
by writers. It does take an `IS` table intention lock, which is why a `DDL` statement still
waits for it. And **row locks are locks on index records**, which means a statement that
cannot use an index locks far more than it looks like it does: `UPDATE t SET x = 1 WHERE
unindexed_col = 5` scans and locks every record it examines, because there is no index to
narrow the set of records to lock. This is the mechanism behind "an `UPDATE` on an
unindexed column locked the whole table", and the fix is an index.

### 5.2 The Row-Level Modes, Including the Two Everyone Forgets

Six modes, and the last three are the entire reason `REPEATABLE READ` works.

```text
  S  Shared Record Lock        lock_mode = 0
  X  Exclusive Record Lock     lock_mode = 1
  IX Insert Intention Lock     lock_mode = 2
  GAP          locks the gap BETWEEN two index records, without locking either record
               "no one may insert here"
  NEXT-KEY    locks the record AND the gap before it. The default for `FOR UPDATE` at RR.
  PURE NEXT-KEY (SUPREMUM)  a next-key lock on the supremum pseudo-record — i.e. a lock
               on the gap at the very end of the index
```

**Record locks** lock an existing row. Two transactions can both hold `S` on a record; `X`
conflicts with both. A `X` record lock "locks rec but not gap" — the gap beside it is still
available for inserts of *other* keys, which is why record locks alone do not prevent
phantoms.

**Gap locks** lock the interval between two index records, and the two bordering records
are *not* locked. They are the strange ones, because a gap lock on a range containing no
rows is a lock on nothing — and yet it does exactly what you would want, which is prevent
the row appearing.

**Next-key locks** are a record lock and the gap immediately before it, treated as one
unit, and they are the default for a locking read at `REPEATABLE READ`. Because the gaps
tile the index without overlap, locking every next-key record in a range locks the range
completely.

**Insert-intention locks** are the mirror image. An `INSERT` does not take a next-key
lock — which would block every other insert into the same gap — it takes an *insert
intention* lock on the gap, which is compatible with other insert intentions and only
conflicts with an existing gap or next-key lock. The name is a declaration, not a

request: "I intend to insert here, and I will need an exclusive lock on my own record

once I do."

### 5.3 The Picture: Gaps, Next-Keys, and a Phantom

This is the single most important diagram in the volume, so it is worth reading slowly. The
index holds five records; note the gaps *between* them and the one before the first.

```text
  ix_orders_customer_status  (customer_id, status)
  … (7,'NEW')  ▓▓▓ GAP A ▓▓▓  (7,'SHIPPED')  ▓▓▓ GAP B ▓▓▓  (12,'NEW')
  ▓▓▓ GAP C ▓▓▓  (12,'SHIPPED')  ▓▓▓ GAP D ▓▓▓  (42,'CANCELLED')
  ▓▓▓ GAP E ▓▓▓  (42,'NEW')  ▓▓▓ GAP F ▓▓▓  (42,'SHIPPED')
  ▓▓▓ GAP G ▓▓▓  [SUPREMUM]      ← the gap past the last record in the index
  ──────────────────────────────────────────────────────────────────────────
  Session A:  BEGIN;                                  -- RR
              SELECT * FROM orders
               WHERE customer_id = 42 FOR UPDATE;
  ──────────────────────────────────────────────────────────────────────────
  A takes a NEXT-KEY lock on (42,'CANCELLED') → covers GAP E + that record
  A takes a NEXT-KEY lock on (42,'NEW')       → covers GAP F + that record
  A takes a NEXT-KEY lock on (42,'SHIPPED')  → covers GAP G + that record
  A takes a NEXT-KEY lock on [SUPREMUM]      → the end of the index
  Together those three next-key locks tile:
  ▓▓▓E▓▓▓ (42,'CANCELLED') ▓▓▓F▓▓▓ (42,'NEW') ▓▓▓G▓▓▓ [SUPREMUM]
  ▲
  └── GAP D is NOT locked: customer_id = 41 is outside the range, which is
      correct. But a phantom of the form "customer_id = 42" is impossible,
      because there is no unlocked space left for one.
  ──────────────────────────────────────────────────────────────────────────
  Session B:  INSERT INTO orders (customer_id, status) VALUES (42, 'NEW');
  ──────────────────────────────────────────────────────────────────────────
  B computes where (42,'NEW') belongs: between (42,'CANCELLED') and (42,'NEW').
  B needs an INSERT INTENTION lock on that gap.
  That gap is covered by A's next-key lock on (42,'CANCELLED').
  A holds a next-key lock; B holds an insert intention. They CONFLICT.
  B blocks. Forever, until A commits.
  ──────────────────────────────────────────────────────────────────────────
  The row (42,'NEW') DOES NOT EXIST. A locked *nothing*. And yet A's
  transaction is now guaranteed that if it runs the same SELECT again, it
  cannot see a fourth row for customer_id = 42. That is the phantom
  problem, and next-key locking is the whole solution.
```

> **MUST REMEMBER**
>
> **Next-key locking is why MySQL's default isolation level is `REPEATABLE READ`.** Gaps
> in the index are locked, not just rows, so a `SELECT ... FOR UPDATE` over a range makes
> it *impossible* for a concurrent transaction to insert a row into that range — including
> keys that did not exist when the statement ran. That is a stronger guarantee than the
> snapshot alone gives, and it is the reason `REPEATABLE READ` is safe for the
> read-modify-write pattern that most application code actually does. The price is that
> range locking serialises inserts far more aggressively than most people expect, which is
> the subject of the next four sections.

### 5.4 Why the Locking Read Is a *Current* Read

Notice what the locking read returned above. `SELECT ... FOR UPDATE` does not use the
read view at all — it reads the **latest committed version** of each record and locks it.
That is deliberate, and it is the second half of the `REPEATABLE READ` design:

```text
  consistent nonlocking read    ── read view ──►  "the world as it was"
  locking read (FOR UPDATE,     ── latest version ──► "the world as it is,
  FOR SHARE, LOCK IN SHARE MODE)                      and hold it still"

  Why it matters: a read-modify-write
  ─────────────────────────────────────────────────────────────
  -- With a snapshot read and no lock, this is a lost update waiting to happen.
  BEGIN;
  SELECT stock FROM inventory WHERE sku = 'ABC-1';   -- reads 5
                                           -- meanwhile another session
                                           --   UPDATE inventory SET stock = 3;
  UPDATE inventory SET stock = 5 - 1 WHERE sku = 'ABC-1';  -- writes 4
  COMMIT;   -- the other session's 3 is silently gone. Nobody will ever know.

  -- With a locking read, the second session's UPDATE blocks on the row
  -- lock, and the two serialise.
  BEGIN;
  SELECT stock FROM inventory WHERE sku = 'ABC-1' FOR UPDATE;   -- reads 5, locks it
  UPDATE inventory SET stock = 5 - 1 WHERE sku = 'ABC-1';
  COMMIT;
```

The `LOCK IN SHARE MODE` / `FOR SHARE` variant is the read-only version: it locks
`S` rather than `X`, which is enough to prevent anyone from modifying the row while you
read it, and enough to make your own later `UPDATE` safe — but not enough to stop another
reader taking `S` too. `LOCK IN SHARE MODE` was deprecated in MySQL 8.0.22 in favour of
the shorter, clearer `FOR SHARE`.

### 5.5 The Lock Queue, and Why a Long Reader Blocks a Writer

When a transaction requests a lock that is held by another, it goes into a **queue** for
that lock and waits. Two rules make the queue behave, and both are counter-intuitive.
**Rule one: the queue is ordered, and a waiter cannot jump it — but a waiter also cannot
be granted a lock that would starve someone behind it.** If T1 holds `X` on row A, T2
queues for `X` on A, and T3 arrives and requests `S` on A, T3 **cannot** be granted the
`S`. Even though T1's `X` is incompatible with T3's `S` anyway, the reason it is not
granted is queue fairness: T2 is ahead of T3 and T2 wants `X`, so handing T3 an `S` would
mean T2 — which arrived first — waits even longer. This is why "S lock requests are being
ignored" is a symptom of a *long* exclusive holder rather than of shared-lock starvation.
**Rule two: a transaction that is already waiting cannot acquire new locks, in general.**
InnoDB will not let a waiting transaction grab a conflicting lock, which is a

deadlock-avoidance heuristic rather than a fairness rule. The practical consequence is the
thing that generates the "why is my write hanging" tickets:

```text
  T1 (long-running, 20 minutes)
      BEGIN;
      SELECT ... FROM orders
       WHERE customer_id BETWEEN 10 AND 20 FOR UPDATE;   -- 11 next-key locks
      ... doing 20 minutes of work in application code ...
      COMMIT;

  T2  UPDATE orders SET status='CANCELLED' WHERE customer_id = 15;
      → needs an insert intention or a record lock inside [10, 20]
      → blocked by T1's next-key locks
      → and T1 will not release them for 20 minutes

  T3  UPDATE orders SET status='CANCELLED' WHERE customer_id = 100;
      → outside the locked range, proceeds fine
      → which is why the symptom is "some writes are stuck and some are fine"
      →   and why the first hypothesis is usually wrong

  T4  INSERT INTO orders (customer_id, status) VALUES (17, 'NEW');
      → blocked by the SAME locks, even though the row does not exist,
        because T1 locked the *gap* the row would go into
```

Note carefully what is *not* blocking the writer here: a plain long-running `SELECT`. It
takes no row locks. It blocks `purge` and it degrades reads (Chapter 3), but a `SELECT` and
an `UPDATE` of disjoint rows do not block each other. The interaction people blame on
"the long query in staging" is almost always a **locking read** — a `FOR UPDATE` inside a
transaction that spans application code, which is the ORM transaction-scoped-in-a-request
pattern.

### 5.6 Deadlock Detection and How to Turn It On

A deadlock is a cycle in the wait-for graph: T1 waits for what T2 holds, T2 waits for what
T1 holds. No progress is possible, so somebody must lose. InnoDB detects it rather than
waiting for a timeout, and the detection is a real cost — the wait-for graph is traversed
periodically — which is why it is toggleable.

```text
  WAIT-FOR GRAPH at the moment of detection
        ┌───────────────┐   waits for row (B,'x')   ┌───────────────┐
        │   T1  2987901 │ ─────────────────────────► │   T2  2987889 │
        │  holds (A,'x')│                            │  holds (B,'x')│
        └───────────────┘ ◄───────────────────────── └───────────────┘
              ▲                                              ▲
              └──────── cycle: no one can proceed ──────────┘

  resolution: roll back the victim with error 1213
              (ER_LOCK_DEADLOCK: Deadlock found when trying to get lock)

  InnoDB's victim selection heuristic, in the order it applies them:
    1. the transaction with the FEWER rows modified
    2. the transaction with the smaller undo log
    3. the transaction that has done the least work
    4. ultimately: the most recently started

  The heuristic matters, because it means the victim is not always the
  application you would have chosen. Do not build a correctness argument
  on which transaction is rolled back.
```

```sql
-- Detection is ON by default from MySQL 8.0.16. It is worth knowing both names.
SELECT @@innodb_deadlock_detect;        -- 1 = detect and roll back a victim (default)
-- When OFF, MySQL falls back to a timeout, which means a genuine deadlock costs you
-- innodb_lock_wait_timeout seconds of latency instead of milliseconds. Do not turn
-- this off "to reduce overhead" without a measurement and a reason.
```

```sql
-- Log every deadlock, not just the most recent one. Off by default, and
-- turning it on is the difference between "we had one deadlock" and
-- "we had four hundred and we can see the pattern".
SET GLOBAL innodb_print_all_deadlocks = ON;
```

The two error numbers, and telling them apart is a triage skill:

| Error | Name | Meaning | What to do |
| --- | --- | --- | --- |
| **1213** | `ER_LOCK_DEADLOCK` | a cycle was detected; this transaction was rolled back | **fix the lock ordering.** Retrying is a mitigation, not a fix |
| **1205** | `ER_LOCK_WAIT_TIMEOUT` | no cycle, just a long wait — `innodb_lock_wait_timeout` (default 50s) expired | the blocker is long. Find it; it is usually a long transaction across application code |

**Retry on 1213, but only with a full transaction retry.** Retrying the *statement* is
wrong if the statement is part of a multi-statement transaction, because the partial work
has already been rolled back. Retrying the *whole transaction* with a small random
backoff is correct and standard, and the backoff matters: without jitter, both sides of
the next deadlock retry simultaneously and collide again.

```java
@Transactional
public void transfer(long fromAccount, long toAccount, Money amount) {
    retryWithBackoff(() -> {
        // Rule: every path locks in the same order. Sort by the primary key
        // BEFORE the first lock is taken, not inside the retry.
        long first  = Math.min(fromAccount, toAccount);
        long second = Math.max(fromAccount, toAccount);
        long aBalance = accountRepo.lockBalance(first);    // SELECT ... FOR UPDATE
        long bBalance = accountRepo.lockBalance(second);   // SELECT ... FOR UPDATE
        if (aBalance < 0 || bBalance < 0) {
            throw new InsufficientFundsException(fromAccount, toAccount);
        }
        accountRepo.setBalance(first,  aBalance - amount.cents());
        accountRepo.setBalance(second, bBalance + amount.cents());
    }, maxAttempts = 5, baseDelayMs = 20, jitter = true);
}
```

### 5.7 Reading `SHOW ENGINE INNODB STATUS`: A Real Deadlock, Worked Out

This is the tool an interviewer means when they ask *"how would you diagnose this?"* and
it is the answer worth having ready. A real deadlock section, annotated.

```sql
SHOW ENGINE INNODB STATUS\G
```

```text
LATEST DETECTED DEADLOCK
2026-09-27 15:42:11 0x00007F2A1C009200
*** (1) TRANSACTION:
TRANSACTION 2987901, ACTIVE 2 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 3 lock struct(s), heap size 1136, 1 row lock(s)
MySQL thread id 412, query id 8823 127.0.0.1(root) updating
UPDATE inventory SET qty = qty - 1 WHERE sku = 'SKU-B'
*** (1) HOLDS THE LOCK(S):
RECORD LOCKS space id 42 page no 4 n bits 72  index `PRIMARY` of table `shop`.`inventory`
Record lock, heap no 5 PHYSICAL RECORD: n_fields 4; compact format
 0: len 10; hex 534b552d41; asc     ;;   ← sku = 'SKU-A'
 trx_id 2987901 lock_mode X locks rec but not gap
Record lock, heap no 5 PHYSICAL RECORD: n_fields 4; compact format
 0: len 10; hex 534b552d41; asc     ;;
 trx_id 2987901 lock_mode X rec_not_gap  (this second entry is the index-page
                                         lock struct, not a second row)
*** (1) WAITING FOR:
RECORD LOCKS space id 42 page no 4 n bits 72  index `PRIMARY` of table `shop`.`inventory`
Record lock, heap no 9 PHYSICAL RECORD: n_fields 4; compact format
 0: len 10; hex 534b552d42; asc     ;;   ← sku = 'SKU-B'
 trx_id 2987889 lock_mode X locks rec but not gap
*** (2) TRANSACTION:
TRANSACTION 2987889, ACTIVE 5 sec starting index read
mysql tables in use 1, locked 1
LOCK WAIT 3 lock struct(s), heap size 1136, 2 row lock(s)
MySQL thread id 519, query id 8819 127.0.0.1(root) updating
UPDATE inventory SET qty = qty - 1 WHERE sku = 'SKU-B'
*** (2) HOLDS THE LOCK(S):
RECORD LOCKS space id 42 page no 4 n bits 72  index `PRIMARY` of table `shop`.`inventory`
Record lock, heap no 9 PHYSICAL RECORD: n_fields 4; compact format
 0: len 10; hex 534b552d42; asc     ;;   ← sku = 'SKU-B'
 trx_id 2987889 lock_mode X locks rec but not gap
*** (2) WAITING FOR:
RECORD LOCKS space id 42 page no 4 n bits 72  index `PRIMARY` of table `shop`.`inventory`
Record lock, heap no 5 PHYSICAL RECORD: n_fields 4; compact format
 0: len 10; hex 534b552d41; asc     ;;   ← sku = 'SKU-A'
 trx_id 2987901 lock_mode X locks rec but not gap
*** WE ROLL BACK TRANSACTION (2) (2987889)
```

How to read it, as a repeatable procedure. **Find the two `*** (n) TRANSACTION` blocks.**
Take block 1's "HOLDS THE LOCK(S)" and note the record identity — here, the table
`shop`.`inventory`, the index `PRIMARY`, and the key value `SKU-A` on page 4, heap 5. Take
block 1's "WAITING FOR": the same table and index, key `SKU-B`, and the `trx_id 2987889`
tells you *which transaction* holds it. Now look at block 2 and confirm the reciprocal:
2987889 holds `SKU-B` and waits for `SKU-A`. **The cycle is confirmed and both identities
are known.**

The `query id` lines are the other half of the answer. Both transactions were running the
same statement, `UPDATE inventory SET qty = qty - 1 WHERE sku = ?` — with different
parameters. That immediately suggests the shape of the bug, and here it is obvious: the
application decrements two SKUs in whatever order the caller supplied them.

```text
  request 1:  ['SKU-A', 'SKU-B']   →  locks A, then B   ┐
  request 2:  ['SKU-B', 'SKU-A']   →  locks B, then A   ┘  collision
  fixed:  ['SKU-A', 'SKU-B'] and  ['SKU-A', 'SKU-B']   →  same order, no cycle
```

The fix is a `sort()` on the SKU list before the first lock is taken, inside the
transaction and inside the retry. The **rollback victim** line is diagnostic but not

actionable: InnoDB rolled back 2987889 because it had modified one row against 2987901's

one row and then broke the tie on undo-log size. Do not build a system that depends on
which side loses.

`locks rec but not gap` on both rows tells you something additional worth noticing: these
are record locks on rows that *exist* in a unique index, not next-key or gap locks. So
this deadlock is **not** a next-key-locking artefact — it is a pure application
lock-ordering bug. A deadlock that shows `lock_mode X, locks rec but not gap` on existing
unique keys is almost always ordering; a deadlock showing `NEXT-KEY` or a lock on the
supremum record is a range scan, and it is usually about the *shape* of the predicate
rather than the order of the statements.

In MySQL 8.0 the live view is `performance_schema`, and the equivalent of the above for a
deadlock happening right now is:

```sql
SELECT r.trx_id                AS waiting_trx,
       w.trx_id                AS blocking_trx,
       LEFT(rt.trx_query, 60)  AS waiting_query,
       LEFT(bt.trx_query, 60)  AS blocking_query,
       TIMESTAMPDIFF(SECOND, rt.trx_wait_started, NOW()) AS waited_seconds
FROM   performance_schema.data_lock_waits w
JOIN   information_schema.INNODB_TRX  rt ON rt.trx_id = w.REQUESTING_ENGINE_TRANSACTION_ID
JOIN   information_schema.INNODB_TRX  bt ON bt.trx_id = w.BLOCKING_ENGINE_TRANSACTION_ID
JOIN   performance_schema.threads      th ON th.THREAD_ID = bt.trx_mysql_thread_id
ORDER  BY rt.trx_wait_started;
```

```text
+------------+------------+---------------------------------+---------------------------------+----------------+
| waiting_trx| blocking_trx| waiting_query                    | blocking_query                   | waited_seconds |
+------------+------------+---------------------------------+---------------------------------+----------------+
|  2987901   |  2987889    | UPDATE inventory SET qty = qty...| UPDATE inventory SET qty = qty...|              2 |
+------------+------------+---------------------------------+---------------------------------+----------------+
```

> **INTERVIEW TRAP — "HOW DO YOU FIX DEADLOCKS?"**
>
> The reflexive answer — "retry on failure" — is the mitigation, not the fix, and leading
> with it is what gets a candidate held at mid-level. The real answer has three parts and
> should be given in this order. **First: a deadlock is a symptom, and the symptom is
> inconsistent lock ordering across code paths.** Two transactions that take locks in
> different orders will deadlock, always, and no amount of retrying changes the
> probability much. The fix is a *global* rule — every transaction in the system takes
> locks in the same order, usually primary key order, enforced by sorting the identifier
> list before the first lock and by a code review rule — not a local patch. **Second:
> shrink the transaction.** The shorter the window between the first lock and the commit,
> the smaller the window for a collision, which means no network calls, no RPC, no
> message-broker publish and no `Thread.sleep` inside a transaction. **Third: retry the
> whole transaction with jittered backoff**, because a global ordering rule is not always
> achievable and a 1213 is a *designed-for* outcome rather than a bug. And the diagnostic
> that makes all three possible is `SHOW ENGINE INNODB STATUS` with the deadlock section,
> or `performance_schema.data_lock_waits` for a live one — naming the tool is half of
> what the interviewer is asking for.

### 5.8 `SKIP LOCKED` and `NOWAIT`: Locking Without Waiting

Two modifiers on locking reads that turn the queue from a problem into a feature, both
available since 5.7/8.0 respectively.

```sql
-- Take the next unlocked row and LEAVE THE LOCKED ONES ALONE.
SELECT id, payload
FROM   job_queue
WHERE  status = 'PENDING'
ORDER BY priority DESC, id
LIMIT  10
FOR UPDATE SKIP LOCKED;
```

That statement is the entire architecture of a MySQL work queue, and it is worth being
able to explain why it works. Under `REPEATABLE READ` it is a *locking* read, so it
consults the current state rather than the read view, and it sees `PENDING` rows committed
by other workers. `SKIP LOCKED` tells the engine to skip any record whose next-key lock is
held by another transaction, so two workers never pick the same job and neither ever waits.
The `NOWAIT` variant does the opposite — it takes one row and fails immediately with error
3572 if it is locked, which is the right choice when contention is a signal rather than a
queue.

The cost, and it is a real one: **`SKIP LOCKED` and `READ COMMITTED`/`REPEATABLE READ` do
not mix, and neither does `SKIP LOCKED` with statement-based replication.** A statement
that skips rows non-deterministically produces a different result set on a statement-based
replica, which is why row-based replication is effectively mandatory for a queue built this
way. And because it is a locking read, a worker that crashes mid-job leaves the next-key
locks held until the connection dies — which is fine, because the connection dying releases
them, and the *job* itself needs a `locked_until` column with a timeout so it is not lost.

> **SCALING REALITY CHECK**
>
> Under `REPEATABLE READ`, a `WHERE status = 'PENDING'` predicate takes next-key locks
> that cover **every gap in the value range**, not just the matching records. With a
> four-valued `status` column and a queue ordered by `priority DESC, id`, the practical
> result is that `SKIP LOCKED` workers contend heavily with each other and throughput
> flattens well before CPU does. The two fixes, and you need both: put the queue predicate
> in a composite index whose leading column is the status so the next-key range is tight,
> and run the workers at `READ COMMITTED`, where gap locks do not exist and only the
> matching records are locked. A queue worker is one of the few workloads where `READ
> COMMITTED` is unambiguously the right answer, and being able to say *why* — gaps, not
> records — is the whole point.

#### Common Mistakes

- Saying a plain long-running `SELECT` blocks writers — it takes no row locks; what
  blocks writers is a *locking* read, an unindexed `UPDATE`, or a transaction that spans
  application code
- Believing record locks prevent phantoms — they do not, which is exactly why next-key
  locks exist
- Not realising a `SELECT ... FOR UPDATE` over a range locks the *gaps* in that range, so a
  concurrent `INSERT` of a key that does not exist blocks
- Forgetting that an `UPDATE` or `DELETE` on an unindexed column locks every record it
  scans, because locks are on index records
- Treating error 1213 as "just retry" without changing lock ordering
- Reading only the first `*** (n) TRANSACTION` block of a deadlock and concluding the other
  side is at fault
- Interpreting `locks rec but not gap` as a next-key-locking problem — it is a pure
  lock-ordering bug on existing unique keys

#### Interview Questions — Locks, Gaps & Deadlocks

**Q1. Why does MySQL default to `REPEATABLE READ` rather than `READ COMMITTED`?** `STAFF`
Because next-key locking makes `REPEATABLE READ` a genuinely useful level rather than a
formality. A consistent nonlocking read at any level is served from a read view and is
already free of dirty and non-repeatable reads, so on its own `REPEATABLE READ` would be
nearly identical to `READ COMMITTED` — and indeed, in PostgreSQL, where phantoms are
handled by the snapshot, the two levels differ by much less than people expect. InnoDB adds
locking reads that read the *current* version, and those need a real guarantee. Next-key
locking supplies it: `SELECT ... FOR UPDATE` over a range locks the gaps, so a concurrent
insert into that range cannot complete, so the second execution of the locking read cannot
see a row that was not there the first time. That is a stronger guarantee than a snapshot
gives, and it is what makes the ubiquitous read-modify-write pattern safe without the
application having to think about it.

**Q2. `SELECT * FROM orders WHERE customer_id BETWEEN 10 AND 20 FOR UPDATE` — what exactly
is locked, and what does it stop?** `ADVANCED`

Every next-key record in the range, which means each matching record *and* the gap
immediately before it, plus a next-key lock on the supremum record covering the end of the
index. The gaps tile, so the range is completely sealed. It stops three things: any
`UPDATE` or `DELETE` of a matching row, any `INSERT` of a row that would sort into the
range — including rows with primary keys that do not exist yet — and any competing locking
read over the same range. It does not stop a plain nonlocking `SELECT`, which is served
from the read view and takes no locks. Under `READ COMMITTED` the gap locks mostly do not
exist and only the matching records are locked, which is the single most important
behavioural difference between the two levels and is the reason some teams switch.
**Q3. How do you read the deadlock section of `SHOW ENGINE INNODB STATUS`?** `ADVANCED`
Find the two `*** (n) TRANSACTION` blocks. For block 1, read "HOLDS THE LOCK(S)" and note
the table, the index, and the key value in the hex-decoded record — the
`0: len 10; hex 534b552d41` line is `SKU-A`. Then read "WAITING FOR" for the same table
and index, and the `trx_id` on that record tells you which transaction holds it. Confirm
the reciprocal in block 2, and the cycle is established with both identities. Then read the
`query id` lines under each transaction: if both are the same statement with different
parameters, the bug is almost certainly parameter ordering, and the fix is to sort the
identifier list before the first lock. Finally check the lock mode text — `locks rec but
not gap` on existing unique keys is a pure ordering bug, while `NEXT-KEY` or a lock on the
supremum record means the range predicate's *shape* is the problem. The rollback line names
the victim but is not actionable, because the victim is chosen by a heuristic.

**Q4. Why is a deadlock a symptom rather than a bug?** `STAFF`

Because it is the correct, designed response to a cycle in the wait-for graph, and the
cycle exists because two code paths took locks in different orders. Retrying reduces the
symptom's frequency but leaves the probability of collision unchanged, and it adds load
exactly when the instance is least able to absorb it. The three-part fix, in order: enforce
a global lock-ordering rule (primary key order, sorted before the first lock, checked in
code review); shrink the transaction so the window between the first lock and the commit
contains no network calls, no RPC and no broker publish; and, because a global rule is not
always achievable, retry the *whole transaction* with jittered backoff. Retrying a single
statement inside a larger transaction is wrong, because the rest of the transaction has
already been rolled back.

> **CHAPTER 5 SUMMARY**
>
> InnoDB locks at four levels, and the table level exists only to carry *intention* locks so
> that thousands of row-locking transactions do not block each other. Row-level locking
> means six modes: `S` and `X` on an existing record, an insert intention, a gap lock
> between records, and a next-key lock that takes a record plus the gap before it. **Next-key
> locking is why `REPEATABLE READ` is MySQL's default**: a `SELECT ... FOR UPDATE` over a
> range seals the gaps as well as the records, so a concurrent `INSERT` of a key that does
> not exist yet cannot complete, and the phantom is impossible. That is a stronger
> guarantee than a snapshot alone, and it is the reason the read-modify-write pattern is
> safe without the application thinking about it. The cost is that a locking read over a
> range blocks an entire class of inserts while a plain `SELECT` — which takes no row locks
> at all — blocks only purge. The lock queue is ordered, and a long transaction
> consequently blocks not just its own rows but every insert that would land in its gaps,
> which is the "some writes hang and some are fine" report. Deadlocks are a *symptom* of
> inconsistent lock ordering, detected by `innodb_deadlock_detect`, surfaced as error
> 1213 with the cycle visible in `SHOW ENGINE INNODB STATUS`, and fixed by a global
> ordering rule plus shorter transactions — with jittered whole-transaction retry as the
> mitigation when a global rule is not achievable.

#### Further Reading

- [InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html) — record, gap and next-key locks, intention locks, and the full compatibility matrix.
- [InnoDB and Different SQL Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-set-and-next-key-locks.html) — exactly which locks each isolation level takes, and the exceptions under `READ COMMITTED`.
- [Locking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html) — `FOR UPDATE`, `FOR SHARE`, `NOWAIT` and `SKIP LOCKED`, with the `NOWAIT`/`SKIP LOCKED` extensions.
- [Deadlocks in InnoDB](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html) — how detection works, the victim heuristic, and `innodb_deadlock_detect` and `innodb_print_all_deadlocks`.
- [Troubleshooting Deadlocks](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlock-handling.html) — the official checklist, from shortening the transaction to ordering the statements.

## Chapter 6 — Isolation Levels

Volume 5 owns isolation levels as a theory. This chapter is the MySQL mechanism, and
almost everything in it reduces to two independent switches: **when the read view is
created** and **whether gap locks are taken**. Once you hold those two, the four levels
predict themselves.

### 6.1 The Four Levels and How to Set Them

```sql
SELECT @@global.transaction_isolation, @@session.transaction_isolation;
```

```text
+---------------------------------+-----------------------------+
| @@global.transaction_isolation | @@session.transaction_isolation |
+---------------------------------+-----------------------------+
| REPEATABLE-READ                 | REPEATABLE-READ                 |
+---------------------------------+-----------------------------+
```

```sql
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;   -- this session only
SET GLOBAL  TRANSACTION ISOLATION LEVEL READ COMMITTED;   -- new sessions after this
START TRANSACTION READ ONLY, WITH CONSISTENT SNAPSHOT;     -- per transaction
```

| Level | Read view created | Gap locks on locking reads | Useful anywhere? |
| --- | --- | --- | --- |
| `READ UNCOMMITTED` | per statement | yes (as `RR`) | **No.** InnoDB does not perform dirty reads regardless; the level behaves as `READ COMMITTED` and only widens the blast radius. |
| `READ COMMITTED` | **per statement** | **no**, except foreign-key and duplicate-key checks | yes — the usual recommendation for high-concurrency OLTP |
| `REPEATABLE READ` | **per transaction** | **yes**, next-key, on every index record scanned | the default, for compatibility and for read stability |
| `SERIALIZABLE` | per transaction | yes, **and plain `SELECT` is implicitly `LOCK IN SHARE MODE`** | rarely — it is `RR` plus nonlocking reads also taking locks |

### 6.2 `REPEATABLE READ`: What It Actually Means Here

`REPEATABLE READ` in InnoDB is two independent mechanisms that happen to have the same
name in the SQL standard, and confusing them is why the level gets both over- and
under-sold.

**Mechanism one: a transaction-scoped read view.** Every *consistent nonlocking* read in
the transaction is answered from the same read view, created on the first such read. That
gives you a stable snapshot: no dirty reads, no non-repeatable reads, and no phantoms from
the read's point of view, because the set of existing row versions is frozen. It also means
the transaction pins a read view for its whole life, which is the purge interaction from
Chapter 3.

**Mechanism two: next-key locking on locking reads.** Every *locking* read — `FOR UPDATE`,
`FOR SHARE`, `LOCK IN SHARE MODE` — and every `UPDATE` and `DELETE` takes next-key locks on
the index records it scans, sealing the gaps so a concurrent insert into the scanned range
cannot complete. This gives the same stability to current reads, and it is the part that
has operational consequences.

The two mechanisms do not agree, and the gap between them is where the surprises live:

```text
  Txn A (REPEATABLE READ)                          Txn B
  ────────────────────────                         ─────
  BEGIN;
  SELECT * FROM orders                              INSERT INTO orders
   WHERE customer_id = 42;                            (customer_id, status)
  -- consistent read: no locks, read view taken        VALUES (42, 'NEW');
  --                                                   │
  --                                          B COMMITS — no blocking at all,
  --                                          because A's read was nonlocking
  SELECT * FROM orders
   WHERE customer_id = 42 FOR UPDATE;
  -- ▲ current read, IGNORES the read view
  -- ▲ returns THREE rows, including the one that did
  --   not exist when this transaction started
```

That is snapshot skew, and it is the honest limitation of MySQL's `REPEATABLE READ`. The
nonlocking path is stable; the locking path is current; mixing them in one transaction
lets you observe a state that never existed. It does not make `REPEATABLE READ` a poor
level — it makes it *not* serialisable, which is a claim nobody should make about any
engine's `REPEATABLE READ`.

One more consequence of mechanism two that belongs in this chapter rather than Chapter 5,
because it is a *correctness* observation rather than a performance one: **next-key
locking is why MySQL's `REPEATABLE READ` resists write skew.** Two doctors on call, at
least one must remain: both read `SELECT COUNT(*) FROM shifts WHERE on_date = X AND
on_duty = 1`, see 2, and each inserts themselves as the third on-duty shift. Under
PostgreSQL `REPEATABLE READ` this succeeds and you have zero doctors. Under InnoDB, the
second insert must take a next-key lock in a range the first transaction has already
sealed, so it blocks. **InnoDB prevents write skew by locking far too much, not by
detecting it** — which is a correct answer to a correctness question and a very expensive
one to the rest of the workload.

### 6.3 `READ COMMITTED`: Where the Gap Locks Go

Switching to `READ COMMITTED` changes exactly two things and leaves everything else alone.
This is worth stating because the folklore version ("`READ COMMITTED` is more concurrent")
does not tell you *why*, and the why is what tells you when it is safe.

1. **The read view is created per statement.** A new read view for every consistent
   read, discarded when the statement ends. This is the entire mechanism behind
   non-repeatable reads, and behind short undo chains and healthy purge.
2. **Gap locks are disabled for locking reads.** Only record locks are taken, on the
   records that actually matched. The two documented exceptions are foreign-key constraint
   checking, where a gap lock is required to prevent a foreign-key violation from a
   concurrent insert, and duplicate-key checking, where a gap lock prevents two concurrent
   inserts of the same unique key from both believing they succeeded.

```text
  READ COMMITTED
  ────────────────────────────────────────────────────────────────────────────
  Txn A                                 Txn B
  BEGIN;                                BEGIN;
  SELECT * FROM orders                   INSERT INTO orders
   WHERE customer_id = 42 FOR UPDATE;     (customer_id, status)
                                          VALUES (42, 'NEW');
  A takes RECORD locks on the 3 matching  B takes an insert intention on the
  rows. GAP 4 — the space where the       gap where (42,'NEW') would go.
  new row would go — is NOT sealed.        GAP 4 is not locked by anyone.
        │                                       │
        └────────►  B COMMITS immediately ◄─────┘
  And because the read view is per statement:
  A's second  SELECT ... WHERE customer_id = 42;   now returns FOUR rows.
  A re-executed the same predicate and got a different answer. That is a
  non-repeatable read, and — by the standard's definition — a phantom.
```

So `READ COMMITTED` in MySQL permits **both** non-repeatable reads and phantoms, and the
second is the one people forget. It is a statement-level snapshot: each statement sees one
consistent world, but not the same world as the previous statement. The read itself is
never torn and never dirty; the guarantee is simply smaller.

> **TRADE-OFF — "SHOULD WE SWITCH TO `READ COMMITTED`?"**
>
> The condition that flips the answer is **whether your application re-reads the same rows
> within a transaction and assumes the answer cannot change.** If it does — a
> read-modify-write, a "check then insert" uniqueness test, a balance check, an inventory
> decrement — `READ COMMITTED` is wrong unless you take the lock explicitly, because
> `SELECT` then `SELECT` and `SELECT` then `INSERT` are now genuinely racy and the gap is
> gone. If your transactions are single-statement (which, with a connection pool and an
> ORM with proper autocommit, is most of them), `READ COMMITTED` is strictly better: no gap
> locks means far less blocking and far less deadlock, undo chains are short, purge keeps
> up, and the history list stays near zero instead of climbing. The teams that get burned
> are the ones who switched globally, kept a multi-statement transaction somewhere in an
> ORM service, and found a lost update. The teams that get it right make the switch and then
> audit for multi-statement transactions. Do not make the switch without that audit — it is
> a correctness change wearing a performance costume.

### 6.4 `SERIALIZABLE`: One Line of Semantics

`SERIALIZABLE` in InnoDB is `REPEATABLE READ` with one additional rule: **every plain
`SELECT` is implicitly converted to `SELECT ... LOCK IN SHARE MODE`.** That is the whole
of it. There is no separate serialisable predicate-lock machinery, no SSI (serialisable
snapshot isolation) and no dangerous-structure detection — the mechanisms you may have read
about in research papers describe PostgreSQL's implementation, not MySQL's.

The consequences are immediate. A nonlocking read that previously took no locks now takes
next-key locks, so a read query blocks an `INSERT` into the range it examined and blocks
other readers of the same range in the exclusive case. A reporting query that scans eight
tables now holds next-key locks on all eight for its whole duration. A `SELECT COUNT(*)`
becomes a write. The level is genuinely serialisable in the SQL standard's sense — the
standard's definition is stated in terms of forbidding the three anomalies, and `SERIALIZABLE`
forbids them by construction — but it is serialisable by *brute force*, and the cost is
that the instance stops being concurrent.

The number to quote in an interview: a mixed read/write workload that sustains roughly
3,000 statements per second under `REPEATABLE READ` will typically fall to well under
500 under `SERIALIZABLE` on the same hardware, and the drop is not gradual — it is a
collapse driven by lock wait queue depth, so the failure mode is a latency cliff rather
than a throughput slope. Use it for the narrow case where a transaction genuinely must
behave as if it ran alone — a nightly reconciliation whose result must be exact against a
database that other systems are writing to — and set it **per transaction** rather than
per server, so one job does not degrade everything else.

```sql
-- The right shape: one transaction opts in, not the instance.
START TRANSACTION ISOLATION LEVEL SERIALIZABLE;
  SELECT SUM(total_cents) FROM orders
   WHERE created_at >= '2026-09-01' AND created_at < '2026-10-01';
  -- ... reconcile against the ledger ...
COMMIT;
```

### 6.5 The Anomaly Matrix, for MySQL Specifically

| Anomaly | `READ UNCOMMITTED` | `READ COMMITTED` | `REPEATABLE READ` | `SERIALIZABLE` |
| --- | --- | --- | --- | --- |
| Dirty read | impossible in InnoDB | impossible | impossible | impossible |
| Non-repeatable read | possible | **possible** (per-statement read view) | impossible | impossible |
| Phantom (read sees a new row) | possible | **possible** (per-statement read view; no gap locks on locking reads) | impossible for both read paths | impossible |
| Lost update | possible | possible unless `SELECT ... FOR UPDATE` | possible unless `SELECT ... FOR UPDATE` | impossible |
| Write skew | possible | possible | **prevented**, by locking too much | impossible |
| Read view lifetime | per statement | per statement | **per transaction** | per transaction |
| Gap locks (locking reads) | yes | **no** | yes | yes, and on nonlocking reads too |

The two rows that differ from the naive expectation are the last two. **`REPEATABLE READ`
is not snapshot-isolated in MySQL** — it is snapshot-isolated *plus* gap locks, and the gap
locks are what make it write-skew-resistant at a price. And **`READ COMMITTED` permits
phantoms**, which surprises people who assume "no dirty reads, no non-repeatable reads"
means "repeatable read".

### 6.6 The Practical Decision

The default answer in a design review is: **`REPEATABLE READ` for correctness-sensitive
multi-statement transactions, `READ COMMITTED` for everything else**, and the honest
version says that the second group is nearly all of a well-built system.

- **Keep `REPEATABLE READ`** for ledger postings, inventory decrements, quota checks,
  anything that reads a row and then writes it, and anything that runs a
  uniqueness-check-then-insert. The gap locks are what make these correct without explicit
  locks, and the fact that they lock too much is a throughput problem you can measure
  rather than a correctness problem you cannot.
- **Move to `READ COMMITTED`** for services whose transactions are single-statement, for
  queue workers using `SKIP LOCKED`, for high-contention reporting, and for any workload
  where deadlocks and lock waits dominate. Percona, Vitess and several large operators
  recommend it as the default for web workloads, and the argument is entirely about gap
  locks and purge.
- **Use `SERIALIZABLE`** per transaction, rarely, for exact reconciliation jobs.
- **Never use `READ UNCOMMITTED`.** It buys nothing — InnoDB will not perform the dirty
  reads it promises — and it is the setting a junior engineer adds while debugging and
  forgets to remove.

```sql
-- Prove it on your own data rather than believing a blog post. The deadlock rate
-- and the history list length are the two numbers that decide this.
SELECT COUNT(*) AS deadlocks_last_hour
FROM   performance_schema.events_transactions_history
WHERE  state = 'ROLLED BACK'
  AND  trx_id IN (SELECT DISTINCT trx_id FROM performance_schema.data_lock_waits);
SHOW ENGINE INNODB STATUS\G     -- History list length
```

> **PRODUCTION RELEVANCE**
>
> The isolation level is a per-session setting, and that is a feature and a hazard. A
> session that runs `SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED` while
> debugging leaves every subsequent transaction on that pooled connection at that level
> until the connection is recycled — and a pooled connection is recycled on a schedule you
> do not control. The defensive measures are boring and worth knowing: set the level
> explicitly in the connection-pool initialisation SQL for every datasource, alert on any
> session whose `transaction_isolation` differs from the intended default, and prefer the
> transaction-scoped form (`START TRANSACTION ISOLATION LEVEL ...`) over the session-scoped
> form so the setting has a scope that matches the unit of work.

#### Common Mistakes

- Assuming `REPEATABLE READ` is snapshot isolation — it is a snapshot *plus* next-key
  locks, which is why it resists write skew and why it is not what the standard's phrase
  means
- Believing `READ COMMITTED` prevents phantoms — it does not, because the read view is
  recreated per statement, so a row committed between two identical statements is visible
  to the second
- Blaming a long plain `SELECT` for blocking writers at any isolation level — it takes no
  row locks; the blocker is a locking read, an unindexed `UPDATE`, or a transaction that
  spans application code
- Believing `SERIALIZABLE` in InnoDB uses serialisable snapshot isolation with
  dangerous-structure detection — it is `REPEATABLE READ` with every plain `SELECT`
  implicitly `LOCK IN SHARE MODE`
- Setting the isolation level with `SET SESSION` and leaving it on a pooled connection
- Recommending `READ UNCOMMITTED`, which buys nothing because InnoDB will not perform the
  dirty reads it promises

#### Interview Questions — Isolation Levels

**Q1. What actually differs between `READ COMMITTED` and `REPEATABLE READ` in InnoDB?**
`STAFF`

Two things, and everything else follows. The read view is created **per statement** under
`READ COMMITTED` and **per transaction** under `REPEATABLE READ` — that single fact
produces non-repeatable reads, allows phantoms under `READ COMMITTED`, makes undo chains
short and purge healthy, and means a transaction-scoped read view that pins purge under
`REPEATABLE READ`. And gap locks are disabled under `READ COMMITTED`, so locking reads
take only record locks on matching rows, which is what removes the phantom-preventing
behaviour that makes `REPEATABLE READ` the default. The two exceptions to the gap-lock
removal are foreign-key constraint checking and duplicate-key checking.

**Q2. Does MySQL's `REPEATABLE READ` prevent write skew? How?** `ADVANCED`

Yes, but by locking rather than by detecting, and the mechanism is worth being able to
name. Two transactions each read a predicate over a range — "at least one doctor must be
on duty on date X" — and each sees that the condition is satisfied, then each inserts a
row that together violate it. Under PostgreSQL's `REPEATABLE READ` both succeed. Under
InnoDB the first insert takes a next-key lock sealing the range it scanned, and the second
insert must take an insert intention in that same range, so it blocks until the first
transaction ends. The correctness is real; the cost is that `REPEATABLE READ` serialises
far more than a snapshot-isolated engine does, and the range that gets sealed is every gap
in the index range the statement scanned — which, with no usable index, is the entire
table.

**Q3. What is the operational cost of `SERIALIZABLE` in InnoDB and how would you deploy
it?** `TRICKY`

One line of semantics with a large blast radius: every plain `SELECT` is implicitly
`SELECT ... LOCK IN SHARE MODE`, so read queries take next-key locks, block inserts into
the ranges they scanned, and hold them for the transaction's duration. A mixed workload
that sustains a few thousand statements per second under `REPEATABLE READ` can fall to a
few hundred under `SERIALIZABLE`, and the failure mode is a latency cliff driven by lock
queue depth rather than a gradual slope. The way to deploy it is **per transaction**, not
per server: `START TRANSACTION ISOLATION LEVEL SERIALIZABLE` in the one nightly

reconciliation job that genuinely needs to behave as if it ran alone, so the rest of the
instance keeps its concurrency. Setting it globally to fix one job is how a batch window
becomes an outage.

**Q4. Two identical `SELECT COUNT(*)` statements in one `REPEATABLE READ` transaction
return different numbers. What happened?** `ADVANCED`

One of them was a locking read. A consistent nonlocking read is answered from the
transaction's read view, which is fixed for the transaction's life, so it cannot see a row
inserted and committed after the transaction began. A locking read — `FOR UPDATE`,
`FOR SHARE`, `LOCK IN SHARE MODE` — is a *current* read: it reads the latest committed
version and ignores the read view entirely, which is the whole point of a locking read. So
if the first `SELECT` was nonlocking and a concurrent transaction inserted a matching row
and committed, the second `SELECT ... FOR UPDATE` legitimately returns a higher count: it
is reporting the world as it is, not as it was. That is snapshot skew, it is a genuine
limitation of MySQL's `REPEATABLE READ`, and it is worth naming unprompted because "MySQL's
`REPEATABLE READ` is serialisable" is a common and wrong claim.

> **CHAPTER 6 SUMMARY**
>
> MySQL's four isolation levels are two independent switches — **when the read view is
> created** and **whether gap locks are taken** — plus one extra line for `SERIALIZABLE`.
> Under `READ COMMITTED` the read view is per statement and gap locks are off (bar
> foreign-key and duplicate-key checks); under `REPEATABLE READ` the read view is per
> transaction and next-key locks seal every index range a locking read scans;
> `SERIALIZABLE` is `REPEATABLE READ` plus an implicit `LOCK IN SHARE MODE` on every plain
> `SELECT`, with none of PostgreSQL's serialisable-snapshot machinery. The consequences
> worth remembering: `READ COMMITTED` permits **both** non-repeatable reads and phantoms,
> because a fresh read view per statement sees rows committed since the previous statement;
> `REPEATABLE READ` is not snapshot isolation but a snapshot *plus* gap locks, which is
> why it resists write skew by locking too much; and mixing a snapshot read with a
> locking read in one transaction produces snapshot skew, which is the honest limit on
> calling it serialisable. The practical decision is `REPEATABLE READ` for
> correctness-sensitive multi-statement transactions, `READ COMMITTED` per service or per
> workload where transactions are single-statement, `SERIALIZABLE` per transaction and
> rarely, and `READ UNCOMMITTED` never.

#### Further Reading

- [Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/transaction-isolation-levels.html) — the official table of which anomalies each level permits, and InnoDB's actual behaviour for each.
- [InnoDB and Different SQL Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-set-and-next-key-locks.html) — the locking rules per level, including the two `READ COMMITTED` exceptions.
- [Consistent Nonlocking Reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html) — the read view mechanism, `WITH CONSISTENT SNAPSHOT`, and what makes a read current rather than snapshot.
- [Setting the Transaction Isolation Level](https://dev.mysql.com/doc/refman/8.0/en/set-transaction.html) — the session, global and transaction-scoped forms, and how the setting interacts with a pool.

## Chapter 7 — Partitioning, Optimisation & Statistics

Volume 6 owns partitioning and sharding as architectural choices. This chapter is the
MySQL implementation, and the second half of it is the subject that causes more confidently
wrong plans than anything else in this volume: **statistics**.

### 7.1 What Partitioning Is

Partitioning splits one logical table into several physical partitions, each with its own
tablespace file, and requires every unique key to contain the partitioning expression. That
last constraint is the one that surprises people, because it means partitioning silently
changes the shape of your primary key.

```sql
CREATE TABLE events (
  id          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tenant_id   BIGINT UNSIGNED NOT NULL,
  kind        VARCHAR(32)     NOT NULL,
  payload     JSON            NOT NULL,
  created_at  DATETIME        NOT NULL,
  PRIMARY KEY (id, created_at),          -- ◄── partitioning column MUST be here
  KEY ix_events_tenant (tenant_id, created_at)
) ENGINE=InnoDB
PARTITION BY RANGE COLUMNS (created_at) (
  PARTITION p2026_08 VALUES LESS THAN ('2026-09-01'),
  PARTITION p2026_09 VALUES LESS THAN ('2026-10-01'),
  PARTITION p2026_10 VALUES LESS THAN ('2026-11-01'),
  PARTITION pmax      VALUES LESS THAN (MAXVALUE)
);
```

| Scheme | Function | Prunes on |
| --- | --- | --- |
| `RANGE` | a numeric or date expression, `RANGE COLUMNS` for dates and strings | a range predicate on the expression |
| `LIST` | an explicit value set, `IN (…)` | equality or `IN` on the expression |
| `HASH` | `MOD()` of the expression | only a complete key lookup that pins the partition |
| `KEY` | MySQL's own hash of the expression | similar to `HASH` |

```sql
EXPLAIN SELECT * FROM events
 WHERE created_at >= '2026-09-01' AND created_at < '2026-10-01'
   AND tenant_id = 42;
```

```text
+----+------------+-------+------------+-------+---------------+-------------+---------+-------------+------+-------------+--------+
| id | select_type | table | partitions | type | possible_keys | key         | key_len | ref         | rows | filtered | Extra      |
+----+------------+-------+------------+-------+---------------+-------------+---------+-------------+------+-------------+--------+
|  1 | SIMPLE      | events | p2026_09  | ref  | ix_events_tenant | ix_events_tenant |    16 | const       |    3 |   100.00 | NULL       |
+----+------------+-------+------------+-------+---------------+-------------+---------+-------------+------+-------------+--------+
                                  ▲ ▲
                                  │ └── p2026_08, p2026_10 and pmax were never
                                  │     opened. Pruning happens at OPEN time, so
                                  │     a pruned partition costs a metadata
                                  │     operation, not a file access.
                                  └── one partition, not four
```

### 7.2 What Partitioning Buys, and What It Does Not

```text
  BUYS                                        DOES NOT BUY
  ───────────────────────────────────         ──────────────────────────────────────
  • O(1) retention: DROP PARTITION is a       • Speed. A query that touches every
    metadata operation and returns the          partition is exactly as slow as the
    space to the filesystem, where              unpartitioned table.
    DELETE of the same rows is not.          • Parallelism. A partition is still one
  • Manageability: REORGANIZE, EXCHANGE,        file on one volume. Partitioning is
    ANALYZE and OPTIMIZE per partition.         not a way to spread I/O across disks.
  • Pruning: fewer partitions opened, so      • Smaller indexes. Every secondary index
    fewer files, less page cache pressure       is still a single B+ tree per partition
    for cold data, easier archiving.            — you have not made the index smaller.
  • A cheap ALTER: adding or dropping a       • A global unique index that excludes the
    partition is metadata; adding a column      partitioning column. That is not
    that is NULL in all existing partitions     permitted, which is a real modelling
    still rewrites everything.                   constraint on your key design.
  • Dropping a hot partition to reclaim       • Sharding. It is one server, one
    space from a live table.                    endpoint, one buffer pool, one
                                                write path. Volume 6 owns sharding.
```

The two lines that generate the most argument in design reviews:

> **INTERVIEW TRAP — "WE PARTITIONED IT TO MAKE IT FASTER."**
>
> Partitioning makes a query faster only if the query has a predicate the optimiser can
> **prune** on — that is, a predicate on the partitioning expression that excludes whole
> partitions. If the query does not, the optimiser opens every partition and the plan is a
> union of the same per-partition plans you would have got anyway, plus the overhead of
> resolving which partitions to open. On MySQL that is usually a small regression, not a
> catastrophe, and the honest summary is: partitioning buys **retention and manageability**,
> and it buys **speed** only in the narrow case where pruning applies. The most common real
> use is exactly the retention one: `PARTITION BY RANGE` on a date with
> `ALTER TABLE events DROP PARTITION p2026_08` returning 400 GB to the filesystem
> instantly, where the equivalent `DELETE` would have produced 400 GB of undo, blocked
> purge, and left the file the same size. Note also what partitioning costs you: every
> unique key must include the partitioning column, so `PRIMARY KEY (id)` had to become
> `PRIMARY KEY (id, created_at)` — and that is a schema change to your key, not a
> performance knob.
> **TRADE-OFF — "FOREIGN KEYS AND PARTITIONING DON'T MIX"**
>
> InnoDB does not support foreign keys on partitioned tables, at all. This is not a
> performance trade-off or a "prefer app-level integrity" judgement; the feature is simply
> absent, and a partitioned schema is a schema where referential integrity is enforced
> entirely by application code. That changes the argument in both directions: it removes a
> class of bugs the database used to catch, and it removes a class of runtime write
> amplification the database used to cause. It also means the partitioned table cannot
> `REPLICATE AS` or participate in the cross-engine replication setups that assume FK
> integrity, and it interacts badly with the online schema change tooling in Chapter 8 —
> `gh-ost` refuses to operate on a table with foreign keys, and a partitioned table has
> none, so that particular blocker disappears while a different one appears. The condition
> that flips the answer: if the schema has many child tables, partitioning is asking you to
> write and maintain referential integrity in code, and that cost should be in the decision.

### 7.3 Statistics: Persistent, Transient and Auto-Recalculated

InnoDB's optimiser is fed numbers, and every bad plan traces back to a wrong one. The
statistics machinery has four moving parts and you need to know all four.

```text
  PERSISTENT (the default, ON)
  ─────────────────────────────
  Sampled from innodb_stats_persistent_sample_pages (default 20) leaf pages
  of each index when ANALYZE runs, then written to the data dictionary and
  kept across restarts. Re-estimated automatically when InnoDB decides the
  table has changed by more than 10% of its rows and a persistent table
  has not been manually sampled with STATS_PERSISTENT=1.
       stored in: mysql.innodb_table_stats, mysql.innodb_index_stats

  TRANSIENT (per-table opt-out)
  ─────────────────────────────
  Sampled from innodb_stats_transient_sample_pages (default 8) leaf pages,
  recomputed on every InnoDB restart and after every table definition change,
  and never written anywhere.

  HISTOGRAMS (8.0+, opt-in per column)
  ─────────────────────────────
  A sampled distribution of ONE column's values, stored in the data
  dictionary, used to estimate the selectivity of predicates on columns that
  are not indexed. Does not replace index statistics.

  THE PLANNER'S ESTIMATE
  ──────────────────────
  The number the optimiser actually used. `EXPLAIN` shows it; `EXPLAIN ANALYZE`
  shows it next to reality. A 100× divergence is a statistics incident.
```

```sql
-- What does InnoDB currently believe about this table?
SELECT table_name, last_update, n_rows, clustered_index_size
FROM   mysql.innodb_table_stats
WHERE  database_name = 'shop' AND table_name = 'orders'\G
SELECT index_name, stat_name, stat_value
FROM   mysql.innodb_index_stats
WHERE  database_name = 'shop' AND table_name = 'orders'
  AND  stat_name = 'n_diff_pfx%'\G
```

```sql
-- Sampling more pages: fewer bytes, less work per page, and the page must be
-- read with a shared lock, so a very large sample blocks concurrent DDL.
ALTER TABLE orders STATS_SAMPLE_PAGES = 64;
ANALYZE TABLE orders;
-- Re-estimate a single index rather than the whole table.
ALTER TABLE orders ALTER INDEX ix_orders_status STATS_PERSISTENT = 1;
ANALYZE TABLE orders;
-- Make a big data load not use a plan derived from pre-load statistics.
-- Load first, then sample, then let traffic resume.
LOAD DATA INFILE 'orders-2026-09.csv' INTO TABLE orders;
ANALYZE TABLE orders;
```

The operational pattern that follows from all this, and it is the one worth taking away:
**bulk loads end with `ANALYZE TABLE` before traffic resumes.** A table loaded from empty
has statistics from zero rows, the optimiser believes it is empty or tiny, it chooses
plans appropriate for a small table, and the first production query after the load is a
full scan of a table that is now enormous. This is not folklore; it is the most common
consequence of a failed migration and it is entirely avoidable with one statement.

### 7.4 Histograms: Estimating Columns You Did Not Index

A histogram is a sampled distribution of a single column's values, stored in the data
dictionary rather than as an index, and used to estimate selectivity for predicates on
non-indexed columns. They exist because InnoDB's index statistics describe *indexes*, and
a column with no index has no statistics at all — so a predicate on it gets a crude
default estimate and the optimiser plans for the wrong number of rows.

```sql
ANALYZE TABLE orders
  UPDATE HISTOGRAM ON channel, status WITH 16 BUCKETS;
SELECT SCHEMA_NAME, TABLE_NAME, COLUMN_NAME,
       JSON_EXTRACT(HISTOGRAM, '$.histogram-type')        AS type,
       JSON_LENGTH(JSON_EXTRACT(HISTOGRAM, '$.buckets'))   AS bucket_count
FROM   information_schema.COLUMN_STATISTICS
WHERE  SCHEMA_NAME = 'shop' AND TABLE_NAME = 'orders';
```

```text
+------------+-------------+-------------+---------+---------------+
| SCHEMA_NAME | TABLE_NAME  | COLUMN_NAME | type    | bucket_count  |
+------------+-------------+-------------+---------+---------------+
| shop        | orders      | channel     | numeric |            16 |
| shop        | orders      | status      | numeric |            16 |
+------------+-------------+-------------+---------+---------------+
```

The limitations are what make histograms a supplement rather than a replacement, and every
one of them is worth knowing before proposing them:

- **Single column only.** There is no multi-column histogram, so a predicate on
  `(channel, status)` jointly — the one place where correlation lives — is not helped.
- **Base columns only, and no geometry.** You cannot histogram a functional index
  expression, which is unfortunate because a functional index usually exists precisely
  because the raw column is unselective.
- **The generation is a sample with a memory cap.** `histogram_generation_max_mem_size`
  (20 MB by default) bounds it; when the cap is hit MySQL samples fewer rows and raises a
  warning, so a histogram on a hundred-million-row column may describe a small fraction of
  it. The count of rows actually sampled is in the histogram JSON.
- **It is a static sample until re-collected.** Unlike index statistics, which InnoDB
  re-estimates automatically after a 10% change, a histogram stays stale until you run
  `ANALYZE TABLE ... UPDATE HISTOGRAM` again. That makes it a scheduled job, and a
  scheduled job that gets forgotten is a stale estimate that is worse than no estimate
  because it looks authoritative.

### 7.5 The Range Estimation Heuristic, and `optimizer_switch` as a Diagnostic

InnoDB does not store a value distribution for index range estimation. It samples leaf
pages and applies a **fixed heuristic**: a range predicate on the first key part of an
index is estimated to select a large fraction of the index, and each *additional* range
condition divides the estimate by a further order of magnitude. The practical consequence is
a rule worth memorising, because it is a genuine footgun:

```sql
-- These are NOT the same estimate to InnoDB, and the difference is roughly 10×.
EXPLAIN SELECT * FROM orders WHERE created_at BETWEEN '2026-09-01' AND '2026-10-01';
EXPLAIN SELECT * FROM orders
 WHERE created_at >= '2026-09-01' AND created_at < '2026-10-01';
```

```text
+----+------------+-------+------------+-------+---------------+---------+---------+------+-------------+-------+
| id | select_type | table | partitions | type | possible_keys | key     | key_len | ref  | rows       | Extra |
+----+------------+-------+------------+-------+---------------+---------+---------+------+-------------+-------+
|  1 | SIMPLE      | orders | NULL      | range| ix_orders_created | ix_orders_created |      5 | NULL | 6250000  | NULL  |
+----+------------+-------+------------+-------+---------------+---------+---------+------+-------------+-------+
  estimated 6,250,000 rows for ONE month of a 50M-row table
+----+------------+-------+------------+-------+---------------+---------+---------+------+-------------+-------+
| id | select_type | table | partitions | type | possible_keys | key     | key_len | ref  | rows      | Extra |
+----+------------+-------+------------+-------+---------------+---------------+---------+---------+------+-------------+-------+
|  1 | SIMPLE      | orders | NULL      | range| ix_orders_created | ix_orders_created |      5 | NULL | 625000  | NULL  |
+----+------------+-------+------------+-------+---------------+---------+---------+------+-------------+-------+
  estimated 625,000 rows for the SAME query written with two conditions
```

Both plans are the same access path; the *estimated row count* differs by an order of
magnitude, and that estimate is what the join order, the join algorithm and the choice of
full scan versus index are all computed from. This is why "rewrite `BETWEEN` as two
inequalities" is sometimes a *fix* and never is a *style* — and why `EXPLAIN ANALYZE` is
the only way to see which side of reality you are on.

`optimizer_switch` closes the loop: it is the set of cost-based decisions the optimiser is
allowed to make, and toggling one flag in a session is a cheap experiment that turns a
hypothesis into a measurement.

```sql
-- Is the join order the problem? Turn off the semijoin strategies and see.
SET SESSION optimizer_switch = 'semijoin=off';
EXPLAIN FORMAT=JSON SELECT ... ;
-- Is the estimate the problem? Trace it.
SET SESSION optimizer_trace = 'enabled=on';
SELECT * FROM orders WHERE created_at BETWEEN '2026-09-01' AND '2026-10-01';
SELECT TRACE FROM information_schema.OPTIMIZER_TRACE\G
SET SESSION optimizer_trace = 'enabled=off';
```

The optimizer trace is the last-resort diagnostic and it is genuinely useful: it shows the
cardinality the optimiser chose for each table, the access paths it considered, the cost it
assigned to each, and which one it kept. When the `rows` in `EXPLAIN` disagrees with
`EXPLAIN ANALYZE`, the trace tells you which of the two is lying and why.

> **PRODUCTION RELEVANCE**
>
> Statistics are the quietest cause of incidents and the easiest to prevent, because the
> prevention is three statements and a schedule: `ANALYZE TABLE` after every bulk load,
> `ANALYZE TABLE` after every schema change, and a periodic re-collection of histograms on
> the handful of columns that have them. The detection is one comparison — `rows` from
> `EXPLAIN` against `rows` from `EXPLAIN ANALYZE`, or "rows examined" against "rows sent"
> in the slow query log. A query where examined is more than two orders of magnitude
> greater than sent is not a badly written query; it is a table where the optimiser is
> working from a fiction, and the fix is `ANALYZE TABLE`, not a rewrite.

#### Common Mistakes

- Believing partitioning makes queries faster in general — it makes them faster only where
  pruning applies, and it really buys retention and manageability
- Forgetting that every unique key must include the partitioning column, so partitioning
  silently changes your primary key
- Trying to put a foreign key on a partitioned InnoDB table — the feature does not exist
- Treating a histogram as a replacement for index statistics — it is single-column, it
  cannot be created on a functional index, it is capped by a memory limit, and it goes
  stale silently
- Splitting a single range into two inequalities without knowing it degrades InnoDB's
  estimate by roughly an order of magnitude
- Leaving a bulk load without a trailing `ANALYZE TABLE` and letting production traffic
  meet pre-load statistics

#### Interview Questions — Partitioning, Optimisation & Statistics

**Q1. What does partitioning actually buy you in MySQL, and what does it cost?** `STAFF`
The reliable win is retention: `PARTITION BY RANGE` on a date with

`ALTER TABLE t DROP PARTITION p` is an O(1) metadata operation that returns the space to
the filesystem, where the equivalent `DELETE` produces gigabytes of undo, blocks purge, and
leaves the file the same size. It also buys per-partition maintenance —

`REORGANIZE`, `EXCHANGE`, `ANALYZE PARTITION`, `OPTIMIZE PARTITION` — and pruning, which
skips opening partitions that cannot match. It does not buy general speed: a query with no
prunable predicate opens every partition and is at best as fast as the unpartitioned table.
The costs are structural: every unique key must contain the partitioning column, so
`PRIMARY KEY (id)` had to become `PRIMARY KEY (id, created_at)`; foreign keys are not
supported on partitioned InnoDB tables at all, so referential integrity moves into
application code; and each partition is a separate file on one volume, so it is not a way
to spread I/O. Volume 6 owns sharding, which is the thing that does distribute.

**Q2. What are histograms for, and when will they not help you?** `TRICKY`

They give the optimiser a sampled value distribution for a **single column that is not
indexed**, so a predicate on it gets a real selectivity estimate instead of a default. They
are stored in the data dictionary, not as an index, so they cost no space in the table and
no write amplification. They will not help you when the problem is a predicate across two
correlated columns, because there is no multi-column histogram; when the selectivity comes
from a functional index, because you cannot histogram the expression; when the column is
low-cardinality enough that the default estimate was already right; and — most
importantly — when they have gone stale, because unlike index statistics they are not
re-collected automatically and a stale histogram is worse than none, since it looks
authoritative. Any adoption of histograms is therefore a scheduled job, and the schedule is
part of the feature.

**Q3. A query plan changed overnight and nothing was deployed. Where do you look first?**
`STAFF`

Statistics, before anything else. Run `EXPLAIN ANALYZE` on the query now and compare the
estimated row count against the actual one; a plan that got worse almost always got worse
because the estimate got worse, not because the query changed. Then check whether the data
changed *shape* — a column that was low-cardinality becoming high-cardinality, or the
reverse, is the single most common cause of a plan flipping with no code change, and both
the sampled `CARDINALITY` in `information_schema.STATISTICS` and a histogram on that column
will show it. Then check the collection settings: `innodb_stats_persistent` on, a sensible
`innodb_stats_persistent_sample_pages`, and a histogram that was re-collected rather than
left to go stale. If the estimates now agree with reality and the plan is still wrong, the
estimate is not the problem — turn on the optimizer trace for one session, reproduce, and
read the access paths it rejected and the cost it assigned them. The habit to build is
pairing `ANALYZE TABLE` with any bulk load, because a bulk load is exactly the shape of
change that invalidates a sampled distribution.

> **CHAPTER 7 SUMMARY**
>
> Partitioning in MySQL buys **retention and manageability** — an O(1) `DROP PARTITION`
> that returns space to the filesystem, per-partition maintenance, and pruning that skips
> opening partitions that cannot match — and it buys general query speed only where pruning
> applies. It costs a structural thing people forget: every unique key must include the
> partitioning column, so `PRIMARY KEY (id)` becomes `PRIMARY KEY (id, created_at)`, and
> foreign keys are not supported on partitioned InnoDB tables at all, moving referential
> integrity into application code. The optimiser itself is fed entirely by **statistics**:
> persistent index statistics sampled from 20 leaf pages, re-estimated automatically after a
> 10% change; transient per-table statistics that do not survive a restart; and optional
> single-column histograms for columns with no index, which are the feature to reach for
> when a predicate on an unindexed column gets a default estimate. None of it re-collects
> itself except the index statistics, which is why a bulk load ends with `ANALYZE TABLE`
> and why a histogram you set up once and never refresh is a stale estimate that looks
> authoritative. And because InnoDB's range estimation is a heuristic rather than a
> distribution, splitting one `BETWEEN` into two inequalities can change the estimated row
> count by an order of magnitude — which is why `EXPLAIN ANALYZE`, printing estimated
> against actual side by side, is the diagnostic that ends the argument.

#### Further Reading

- [Partitioning Types](https://dev.mysql.com/doc/refman/8.0/en/partitioning-types.html) — the five schemes, their pruning behaviour, and the restriction that every unique key must contain the partitioning expression.
- [Partition Pruning](https://dev.mysql.com/doc/refman/8.0/en/partitioning-pruning.html) — exactly when pruning applies and when the optimiser must examine all partitions.
- [Optimizer Statistics](https://dev.mysql.com/doc/refman/8.0/en/optimizer-statistics.html) — persistent versus transient statistics, sample pages, and the 10% auto-recalculation threshold.
- [Optimizer Trace](https://dev.mysql.com/doc/refman/8.0/en/optimizer-trace.html) — the last-resort diagnostic: chosen cardinalities, considered access paths, and the cost of each.
- [Column Statistics and Histogram Analysis](https://dev.mysql.com/doc/refman/8.0/en/optimizer-statistics.html) — creating, inspecting and dropping column histograms, with the memory cap and the sampling caveats.

## Chapter 8 — Replication, Sharding & the Operational Surface

Volume 6 owns replication, sharding and pooling as architectural choices. This chapter is
the MySQL implementation, plus the operational tooling that a team genuinely cannot do
without.

### 8.1 The Replication Pipeline

Replication is asynchronous, and every operational property of a MySQL replica follows from
that one word.

```text
   PRIMARY                                    REPLICA
   ───────                                    ───────
   transactions
       │
       ▼
   ┌─────────────┐   binlog files (the server-level change stream)
   │  BINLOG     │ ──────────────────────────────┐  ┌──────────────────────┐
   │  #000001    │  dump thread reads and ships  │  │ RELAY LOG            │
   │  #000002    │  the bytes; nothing waits for │  │  relay-log.000001    │
   │  #000003 ◄──┼── the replica to acknowledge   │  │  relay-log.000002    │
   └─────────────┘                              │  └───────────┬──────────┘
                                                 │              │
                                                 │   ┌──────────▼──────────┐
                                                 │   │ applier thread(s)   │
                                                 │   │ READ relay log       │
                                                 │   │ APPLY to the tables  │
                                                 │   │ write a NEW binlog   │──► chained replica
                                                 │   └─────────────────────┘
```

The four things to know:

- **It is one-way and asynchronous.** The primary commits and returns to the client whether
  or not any replica has the transaction. Nothing in the commit path waits.
- **The replica is a normal MySQL.** It has its own buffer pool, its own redo log, its own
  statistics, and — this is the one people forget — **its own optimiser and its own plans**.
  A query that is fast on the primary can be slow on the replica because the statistics
  have drifted, the hardware is weaker, or the `ANALYZE` schedule differs.
- **The replica writes its own binlog**, which is what makes chained replication
  (`A → B → C`) and per-replica tooling (`pt-table-checksum`, CDC consumers) possible.
- **MySQL 8.0 renamed everything**: `slave_*` variables are deprecated in favour of
  `replica_*`, and `Seconds_Behind_Source` is deprecated. `SHOW REPLICA STATUS` and
  `performance_schema.replication_*` are the current interfaces.

```sql
SHOW REPLICA STATUS\G
```

```text
Replica_IO_Running: Yes
Replica_SQL_Running: Yes
Seconds_Behind_Source: 47          ◄── deprecated in 8.0.22; do not alert on this
Replica_IO_State: Waiting for source to send next chunk
Last_IO_Error:
Last_SQL_Error:
Executed_Gtid_Set: 3e1a5f2b-...:1-88213
```

### 8.2 Row-Based Replication, GTID, and Parallel Apply

```text
  STATEMENT  the SQL text is logged. Smaller binlog, but the replica re-executes
             the statement and can get a DIFFERENT result from a different
             plan, a different statistic, or a different value of NOW().
             Unsafe for anything non-deterministic and for
             SKIP LOCKED / LIMIT-without-ORDER-BY.

  ROW        the changed rows are logged as before/after images. The replica
             applies exactly what happened. Larger binlog. This is the default
             since 5.7 and it is what you want.

  MIXED      statement where safe, row where not. A historical compromise that
             now mostly just means "row, with a compatibility check".
```

**GTID** replaces `file:position` with a transaction identifier that is globally unique
across the topology.

```sql
SELECT @@gtid_mode, @@enforce_gtid_consistency;   -- ON, ON
-- "Wait until the replica has applied this transaction."
SELECT WAIT_FOR_EXECUTED_GTID_SET('3e1a5f2b-...:1-88213', 5);
```

What it buys is failover. With file and position, promoting a replica means knowing exactly
which file and offset to start every other replica from, and getting it wrong either
duplicates transactions or loses them. With GTID the promoted replica has its own
`Executed_Gtid_Set`, every other replica is told "catch up to everything you are missing",
and reparenting is a `CHANGE REPLICATION SOURCE TO` with no coordinates at all.

What it costs is a set of restrictions that are non-negotiable under

`enforce_gtid_consistency`: no non-transactional table updates mixed with transactional
ones in the same transaction, no `CREATE TEMPORARY TABLE` inside a transaction, and no
non-deterministic statements affecting both transactional and non-transactional tables.
**Parallel apply** is the fix for the single biggest cause of lag, and it has a subtlety
that is worth understanding rather than memorising.

```sql
SHOW VARIABLES LIKE 'replica_parallel%';
```

```text
+-------------------------------+-------+
| Variable_name                 | Value |
+-------------------------------+-------+
| replica_parallel_type         | LOGICAL_CLOCK |
| replica_parallel_workers      | 4     |
| replica_preserve_commit_order | ON    |
+-------------------------------+-------+
```

Applying transactions one at a time means a single-threaded applier cannot exceed one
transaction's worth of throughput, no matter how fast the hardware is — and a workload of
many small transactions is limited by per-transaction overhead, not by disk. Parallel
appliciers fix that by running several transactions at once, but concurrent transactions
can touch the same rows, so the applier must know which ones conflict. `DATABASE` mode
serialises everything touching the same *schema*, which is correct and conservative.
`LOGICAL_CLOCK` — the 8.0 default — runs transactions concurrently and detects conflicts
from their write sets, which requires that the primary's commit order has no GTID gaps
among concurrently-committed transactions; if there are gaps, the applier cannot tell
whether two transactions conflict and falls back to serialising them.

`replica_preserve_commit_order` is the third piece and it is the one that has a direct
effect on the application: with parallel apply, the order transactions *finish* applying
can differ from the order they *committed* on the primary. If your application reads a
replica and expects to see writes in commit order, that invariant must be restored
explicitly, and this variable is what restores it.

### 8.3 Replication Lag Is a Correctness Problem, Not a Performance One

```text
  14:00:00.000  primary: INSERT INTO orders (id=99123) ...  → COMMIT, client gets "ok"
  14:00:00.004  replica: has not received it
  14:00:00.011  client: GET /orders/99123  → served by the replica
  14:00:00.011  client: 404. The order they just created does not exist.
  This is not a slow query. This is a read-after-write violation, and it is
  the single most common correctness complaint about a read-replica
  architecture. No amount of replica hardware fixes it, because the
  guarantee is architectural: the primary never waits for the replica.
```

```sql
-- Measure it the way that actually means something: business-visible staleness.
-- This is what Percona's pt-heartbeat does, and it is 15 lines of SQL.
CREATE TABLE heartbeat (
  id           INT NOT NULL PRIMARY KEY,
  server_id    INT NOT NULL,
  ts           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY ix_heartbeat (server_id, id)
) ENGINE=InnoDB;
-- On the replica, once a second:
SELECT TIMESTAMPDIFF(SECOND, ts, NOW()) AS lag_seconds
FROM   heartbeat
WHERE  server_id = :primary_id
ORDER  BY id DESC
LIMIT  1;
```

```text
+-------------+--------------+---------------------+
| server_id   | ts           | lag_seconds         |
+-------------+--------------+---------------------+
|         101 | 18:04:22.114 |                   0 |
+-------------+--------------+---------------------+
-- 12 seconds later, during a pt-online-schema-change copy:
+-------------+--------------+---------------------+
|         101 | 18:04:22.114 |                  12 |
+-------------+--------------+---------------------+
```

The four causes, in the order they account for real incidents:

1. **One large transaction.** Parallel apply cannot split a transaction. A single
   `DELETE FROM events WHERE created_at < '2020-01-01'` touching 200 million rows is one
   event; the replica applies it single-threaded, serially, and the lag graph is a single
   step. The fix is to make large changes many small transactions: delete in batches with a
   sleep, or use `DROP PARTITION` which is a fast metadata event.
2. **A DDL, especially a copy-based one.** An `ALGORITHM=COPY` `ALTER` on a 400 GB table, or
   a `pt-online-schema-change` copy, produces a burst of writes on the primary that the
   replica must apply behind you. This is the single most common cause of a lag incident
   during a maintenance window.
3. **Not enough applier workers, or `replica_parallel_type=DATABASE` on a single-schema
   workload.** Every transaction touches the same database, so the applier serialises and
   the parallelism setting is doing nothing.
4. **The replica is under its own load.** A long analytical query on the replica holds a
   read view, starves purge, and competes for the applier's buffer pool. The replica's
   InnoDB instance has the same Chapter 3 failure modes as the primary.
> **INTERVIEW TRAP — "WE USE SEMI-SYNCHRONOUS REPLICATION, SO READS FROM THE REPLICA ARE
> CONSISTENT."**
>
> Not quite, and the gap is worth being precise about because it is a real production
> failure. Semi-synchronous replication changes the *commit* path on the primary: the
> primary waits for at least one replica to acknowledge that it has **received** the
> transaction. It does not wait for the replica to **apply** it. The replica still has a
> backlog, and a client that writes to the primary and immediately reads from that replica
> will still miss its own write. Semi-sync narrows the window enormously — from
> unbounded to whatever the applier's backlog is, typically well under a second — and it
> is a genuine durability improvement, because an acknowledged transaction is on disk
> somewhere. It is not a read-consistency guarantee. If your application reads from a
> replica at all, you still need an explicit read-your-writes mechanism.

The four mechanisms for read-after-write, and what each costs:

| Mechanism | Latency cost | Correctness | When to use it |
| --- | --- | --- | --- |
| **Route the session to the primary for a window** after any write (sticky-to-primary in the proxy, or a `last_write_at` on the user record) | one added round trip only for the session that wrote | exact, per session | the default. It is simple, stateless in the database, and it is what most systems actually do |
| **Read from the primary for the whole request that performed a write** | primary load | exact, per request | when the write and the read are in the same user action |
| **`WAIT_FOR_EXECUTED_GTID_SET(gtid, timeout)`** | the current lag, blocking | exact, bounded by a timeout | when you need the read to be linearizable against a specific write and the lag is small and measured |
| **Just accept it and let the UI retry** | a visible error | eventual, user-visible | only with a retry in the client, and never for money or inventory |

### 8.4 A Large `ALTER TABLE` Is a Table Copy

In MySQL 8.0 most `ALTER` variants are online, but "online" is not free and it is not
universal. The three algorithms, and specifying one is the single best habit in schema
migration:

| `ALGORITHM` | What happens | Takes a write lock? |
| --- | --- | --- |
| `INSTANT` | metadata only — adding a column at the end, expanding a `VARCHAR`, changing a default | no |
| `INPLACE` | rebuild or modify the index without copying the table. Adding a secondary index, adding a column, dropping a column | brief exclusive lock at start and end; `LOCK=NONE` allows concurrent DML throughout |
| `COPY` | **copies the whole table to a new file** and swaps | exclusive for the entire copy — reads and writes both block |

```sql
-- Best practice: make the algorithm explicit so a surprise is an error, not an outage.
ALTER TABLE orders ADD COLUMN shipped_at DATETIME NULL, ALGORITHM=INSTANT;
ALTER TABLE orders ADD INDEX ix_shipped (shipped_at), ALGORITHM=INPLACE, LOCK=NONE;
ALTER TABLE orders MODIFY email VARCHAR(500), ALGORITHM=INPLACE, LOCK=NONE;
-- ^ the last one is a COPY. Without ALGORITHM=INPLACE it would have been a silent
--   two-hour exclusive lock on a 400 GB table. With it, MySQL fails in one second.
ALTER TABLE orders MODIFY email VARCHAR(500), ALGORITHM=INPLACE, LOCK=NONE;
-- ERROR 1846 (0A000): ALGORITHM=INPLACE is not supported. Reason: Column length change.
```

The rule: **above roughly 50–100 GB, or above a few million rows, do not run a rebuilding
`ALTER` inline even when it says `INPLACE`.** The rebuild reads and writes the whole table
at whatever rate the storage sustains, generates tens of gigabytes of redo, thrashes the
buffer pool for every other query on the instance, and produces a replication lag spike on
the replica that can take hours to drain. Use one of the two online schema change tools.
**`pt-online-schema-change` (Percona Toolkit)** — trigger-based:

```text
  1. CREATE TABLE _orders_new LIKE orders;  apply the ALTER to the NEW table
  2. loop:  INSERT INTO _orders_new SELECT ... FROM orders
           WHERE pk > :last_chunk_pk LIMIT :chunk        ◄── the copy, in chunks
     • throttled (--max-load, --critical-load, --max-lag)
     • every chunk is a small transaction → parallel apply keeps up, lag stays low
     • pausing for the trigger's benefit: none needed between chunks

  3. AFTER triggers on the ORIGINAL table copy concurrent DML into _orders_new
     during the copy — this is why step 2 must catch up from the start

  4. ATOMIC RENAME: orders → _orders_old, _orders_new → orders

  5. DROP _orders_old

  constraints that shape the whole design:
    ✗ the original table must have a PRIMARY KEY or UNIQUE NOT NULL index (the chunk
      cursor needs a resumable, ordered position)
    ✗ the original table must have NO existing triggers
    ✗ no foreign keys referencing the table — the documented workaround is
      SET FOREIGN_KEY_CHECKS=0, which removes the database's enforcement for the
      duration of the copy and is its own decision
    ✗ the triggers are the whole write-capture mechanism, and they are why the copy
      generates a large, sustained replication lag and a lot of binlog
    ✗ cannot run where the trigger's DDL would be replicated to a replica that
      does not have the same privileges
```

**`gh-ost` (GitHub)** — binlog-based, and for most teams the better default:

```text
  1. CREATE the "ghost" table with the new definition
  2. HOOK the binary log: stream the row changes for the original table and apply
     them to the ghost table, continuously and in batches
     • no triggers on the original at all
     • minimal impact on the primary: it reads the binlog, which is already there
     • throttling on replica lag is native (--max-lag)

  3. cutover: atomic RENAME, then wait for the binlog to drain to the replica

  4. drop the old table

  constraints:
    ✗ NO FOREIGN KEYS on the table — gh-ost refuses to run, by design, because the
      cutover RENAME would break every referencing table
    ✗ requires ROW-format binlog and a primary with the binlog enabled
    ✓ no triggers needed, so it coexists with a table that already has them
    ✓ throttles on replication lag rather than on load, which is the control that
      actually matters
```

> **TRADE-OFF — "`pt-osc` OR `gh-ost`?"**
>
> The deciding constraint is **foreign keys**. If the table has any, `gh-ost` refuses to
> run and `pt-online-schema-change` requires `SET FOREIGN_KEY_CHECKS=0` for the duration of
> the copy, which means the database is not enforcing referential integrity during a
> multi-hour window — a decision that should be made explicitly rather than by falling
> into a tool's default. If there are no foreign keys, prefer `gh-ost`: it reads the binlog
> rather than adding triggers, so it does not compete with any triggers already on the
> table, and its throttling control is *replication lag* rather than server load, which is
> the number you actually care about during a copy. `pt-osc` remains the better choice when
> you are on a version where `gh-ost`'s binlog requirements are awkward, when you need
> `--dry-run` and `--execute` separation for a very large table, or when you are
> replicating from something that is not a MySQL primary.

### 8.5 The Operational Surface You Actually Need

Four tools, and being able to name them is a large part of answering "how would you
diagnose this?" honestly.

```sql
-- 1. SHOW PROCESSLIST: the oldest diagnostic in the box and still the fastest triage.
SHOW FULL PROCESSLIST;
```

```text
Id  User  Host               db      Command  Time  State                        Info
412 root  10.0.4.19:55123    shop    Query    1842  Sending data                SELECT * FROM events WHERE ...
519 root  10.0.7.88:49882    shop    Query      3  Waiting for table metadata…  ALTER TABLE orders …
733 root  10.0.9.2:61004     —        Sleep   8401                                  (idle 2h20m, autocommit off)
+------+------+-----------------+--------+---------+------+---------------------------+------------------------------+
  ▲                                                        ▲                ▲
  │                                                        │                └── the shape of the
  │                                                        │                    Chapter 3 incident:
  │                                                        │                    idle, but a
  │                                                        │                    transaction is open
  │                                                        └── blocked behind a DDL taking a
  │                                                            metadata lock
  └── 1842 seconds in "Sending data" = a scan, not a lock wait.
      State tells you the kind of problem; Time tells you how long it has been.
```

```sql
-- 2. performance_schema: what PROCESSLIST cannot show, and it is on by default.
SELECT * FROM performance_schema.metadata_locks\G
SELECT * FROM performance_schema.data_lock_waits\G
SELECT DIGEST_TEXT, COUNT_STAR, ROUND(SUM_TIMER_WAIT/1e12, 2) AS total_seconds,
       SUM_ROWS_EXAMINED, SUM_ROWS_SENT,
       ROUND(SUM_ROWS_EXAMINED / GREATEST(SUM_ROWS_SENT,1)) AS examined_per_sent
FROM   performance_schema.events_statements_summary_by_digest
ORDER  BY SUM_TIMER_WAIT DESC
LIMIT  10;
```

That last query is the most valuable single query in MySQL operations: it is a live,
always-on equivalent of the slow query log, and the `examined_per_sent` column is the
statistics-health metric from Chapter 7 applied to live traffic.

```sql
-- 3. The slow query log. Two settings that matter more than long_query_time.
SET GLOBAL slow_query_log = ON;
SET GLOBAL long_query_time  = 0.2;
SET GLOBAL min_examined_row_limit = 1000;   -- ignore the fast-and-pointless queries
SET GLOBAL log_slow_extra = ON;              -- logical reads, tmp tables, filesort
```

```text
# Time: 260927 18:04:22.114  Id: 412  User: root@10.0.4.19  Schema: shop
# Rows_sent: 640  Rows_examined: 6250000
SET timestamp=1789963462
SELECT id, total_cents FROM orders
 WHERE created_at >= '2026-09-01' AND created_at < '2026-10-01';
                                ▲
              Rows_examined / Rows_sent = 9765. The optimiser thought this
              predicate would return 625,000 rows. It returned 640. That is a
              statistics problem, and no rewrite of this query will fix it.
```

```bash
# 4. pt-query-digest: groups the slow log by fingerprint and ranks by total time,
#    not by slowest single occurrence.
pt-query-digest /var/log/mysql/slow.log | head -60
```

```text
# 40 queries with a fingerprint of 1.2M rows, 0.06s avg time, 41.6M total
SELECT status, COUNT(*) FROM orders
 WHERE created_at BETWEEN ? AND ? GROUP BY status
# pct of time = 24.4%, pct of calls = 11.2%
# pct of rows received = 0.4%, rows sent = 410K avg
#   → 11% of your queries consuming a quarter of the time and returning almost
#     nothing. That ratio is the whole finding; the query text is secondary.
```

```bash
# 5. mysqlbinlog: for the replication and point-in-time questions.
mysqlbinlog --read-from-remote-server --start-datetime="2026-09-27 14:00:00" \
            --stop-datetime="2026-09-27 14:05:00" --stop-never \
            --base64-output=DECODE-ROWS -v replica-relay-bin.000042 > /tmp/rows.sql
# The row-based replication use case, and the reason this tool exists in an
# operations runbook rather than a shelf: find the exact transaction that
# diverged or that blew up the replica, in readable form.
grep -n "Rows_query\|UPDATE\|DELETE" /tmp/rows.sql | head -40
```

> **STAFF-LEVEL CONSIDERATION**
>
> The interesting organisational question here is that all four of these tools are
> point-in-time diagnostics and all four of the failures in this chapter are
> *recurring*. A team that learns to use `SHOW ENGINE INNODB STATUS` has solved one
> incident. A team that has `examined_per_sent` from the digest table on a dashboard, a
> lag alert keyed on a business-visible heartbeat rather than `Seconds_Behind_Source`, and
> an `INNODB_TRX` age alert, has made the same class of failure visible *before* it is an
> incident. That is the difference between debugging a system and operating one, and it is
> worth raising in an interview because it demonstrates you have run one.

#### Common Mistakes

- Alerting on `Seconds_Behind_Source` — it is deprecated in 8.0.22, and it measures nothing
  useful during a stall anyway
- Believing semi-synchronous replication makes reads from a replica consistent — it waits
  for *receipt*, not for *application*
- Running a rebuilding `ALTER` inline on a large table because the output said `INPLACE` —
  "online" still means reading and rewriting the whole table
- Forgetting that a single large transaction cannot be parallelised on the replica, so
  lag is a step function rather than a slope
- Using `pt-online-schema-change` on a table that already has triggers, or without noticing
  that it needs `SET FOREIGN_KEY_CHECKS=0`
- Believing `SHOW PROCESSLIST` tells you why a statement is slow — it tells you the *kind*
  of wait; `performance_schema` and the slow log's `Rows_examined` tell you the rest

#### Interview Questions — Replication & the Operational Surface

**Q1. A user writes an order and the very next request fetches it from a read replica and
gets a 404. What is the cause and what are your options?** `STAFF`

It is a read-after-write violation, and the cause is architectural: replication is
asynchronous, so the primary commits and returns before any replica has the transaction.
Semi-synchronous replication narrows the window but does not close it, because it waits
for the replica to *receive* the transaction, not to *apply* it. The options, in order of

preference: route the session that performed the write to the primary for a short window,

which is exact, per-session and needs nothing in the database; read from the primary for
the whole request that performed a write, which is exact per request; use

`WAIT_FOR_EXECUTED_GTID_SET(gtid, timeout)` to block until the specific transaction is
applied, which is exact but adds the current lag to the read; or accept it and retry in the
client, which is only acceptable when the client actually retries. What you do *not* do is
alert on `Seconds_Behind_Source` and call the problem solved — that number is deprecated
and measures nothing meaningful during a stall.

**Q2. Replication lag jumps to four minutes every night at 02:00. How do you find out
why, in order?** `ADVANCED`

First, correlate with what the primary was doing at 02:00 — the answer is almost always
there, and a `pt-online-schema-change` copy or a bulk delete is the usual culprit. Second,
establish whether the lag is a step or a slope: parallel apply cannot split a transaction,
so a single `DELETE` of 200 million rows is one event and produces a step, while a
sustained copy produces a plateau. Third, check the applier configuration —

`replica_parallel_type=DATABASE` on a single-schema workload serialises everything and makes
the worker count irrelevant. Fourth, check whether the replica is under its own load: a long
analytical query on the replica holds a read view, starves purge, and competes with the
applier for the buffer pool, which is the same Chapter 3 failure mode on a different
instance. Fifth, measure it properly with a heartbeat row or GTID comparison, because
`Seconds_Behind_Source` is deprecated and is not a business-visible measure of staleness.
**Q3. Why does a large `ALTER TABLE` need `pt-online-schema-change` or `gh-ost`, and what
is the difference between them?** `STAFF`

Because `ALGORITHM=INPLACE` describes whether the table is *copied*, not whether it is
*free*. An in-place rebuild of a 400 GB table reads and rewrites all of it, generates tens
of gigabytes of redo, thrashes the buffer pool for every other query, and produces a
replication burst that takes hours to drain — and an `ALGORITHM=COPY` variant takes an
exclusive lock for the entire copy, which is an outage. The two tools exist to make the copy
incremental and throttled. `pt-online-schema-change` uses `AFTER` triggers on the original
to capture concurrent changes, which means the table must have a primary key, must have no
existing triggers, and — the constraint that decides most cases — has no foreign keys, since
the documented workaround is `SET FOREIGN_KEY_CHECKS=0` for the whole copy. `gh-ost` reads
the binary log instead of using triggers, so it does not fight with existing triggers, and
it throttles on replication lag rather than on server load, but it refuses outright to
operate on a table with foreign keys. So: foreign keys present means `pt-osc` with an
explicit integrity decision; no foreign keys means `gh-ost`.

**Q4. You inherit a MySQL with no observability. What do you turn on first, and what do
you measure?** `STAFF`

Four things, in order of value per hour spent. Enable `performance_schema` if it is off and
put the statement digest table on a dashboard — `events_statements_summary_by_digest` gives
a live equivalent of the slow query log, ranked by total time rather than by slowest single
occurrence, and its `SUM_ROWS_EXAMINED / SUM_ROWS_SENT` ratio is the single best early
warning of bad statistics. Enable the slow query log with `min_examined_row_limit` set so it
captures the pathological queries rather than the merely frequent ones, and run

`pt-query-digest` on it nightly. Add an alert on the *age* of the oldest

`information_schema.INNODB_TRX` row, not the count, because one six-hour transaction
degrades the whole instance and a thousand two-second ones do not. And replace

`Seconds_Behind_Source` with a business-visible measure — a heartbeat row written by the
primary and read on the replica — so the lag number means something to the person being
paged. The organisation-level point is that all four are *recurring* failure modes and
point-in-time diagnostics only solve one incident each.

**Q5. `gh-ost` refuses to run on one of your largest tables. What is wrong with the table,
and what is the alternative?** `TRICKY`

It has foreign keys, either on it or referencing it, and `gh-ost` refuses deliberately
rather than accidentally: the cutover is an atomic `RENAME`, and renaming a table out from
under a foreign key would leave every referencing constraint pointing at a name that no
longer exists. The alternatives: run `pt-online-schema-change` instead, which handles the
case with `SET FOREIGN_KEY_CHECKS=0` for the duration of the copy — and that is a decision
about referential integrity, not a flag, because for a multi-hour window the database is
not enforcing it and application bugs that the constraint would have caught will now reach
production. Or change the schema: if the child tables are few, drop the constraints,
perform the `ALTER` with `ALGORITHM=INPLACE, LOCK=NONE` if it is small enough, and restore
them. Or leave the table alone and add the new column with a generated column and a
functional index, which needs no rebuild at all. The senior answer includes naming which of
these you would choose and why, because the tool refusal is a signal about the schema
rather than a tooling problem.

> **CHAPTER 8 SUMMARY**
>
> Replication is asynchronous and single-direction, and every operational property of a
> replica — including that it has its own optimiser, its own statistics and its own
> Chapter 3 failure modes — follows from that. Row-based replication plus GTID is the
> combination to run: row-based because statement-based cannot reproduce
> non-deterministic results, `SKIP LOCKED` results, or a replica with a different plan; GTID
> because it makes failover a set-membership question rather than a file-and-offset
> question. Parallel apply fixes the most common cause of lag, and
> `replica_preserve_commit_order` is the setting that keeps commit order intact on the
> replica, which is a correctness property and not just a performance one. **Replication lag
> is a correctness problem**: a client that writes and immediately reads from a replica can
> miss its own write, semi-synchronous replication narrows that window without closing it
> because it waits for receipt rather than application, and the fix is session routing,
> `WAIT_FOR_EXECUTED_GTID_SET`, or an honest client retry — measured with a heartbeat row
> rather than the deprecated `Seconds_Behind_Source`. A large `ALTER` is a table copy even
> when it says `INPLACE`, which is why `pt-online-schema-change` and `gh-ost` exist and why
> the choice between them turns on foreign keys. And the operational surface — `SHOW
> PROCESSLIST` for triage, `performance_schema` for what PROCESSLIST cannot show, the slow
> log plus `pt-query-digest` for the query mix, and `mysqlbinlog` for the exact transaction
> — is what turns "the database is slow" into a five-minute investigation.

#### Further Reading

- [Replication](https://dev.mysql.com/doc/refman/8.0/en/replication.html) — the official topology, the dump thread, the relay log and the applier, with the 8.0 `replica_*` terminology.
- [Replication Configuration](https://dev.mysql.com/doc/refman/8.0/en/replication-options.html) — GTID, parallel replication, `replica_preserve_commit_order` and the `enforce_gtid_consistency` restrictions.
- [Online DDL Operations](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-operations.html) — the full matrix of which `ALTER` is `INSTANT`, which is `INPLACE`, which is `COPY`, and the lock each one takes.
- [The Slow Query Log](https://dev.mysql.com/doc/refman/8.0/en/slow-query-log.html) — `min_examined_row_limit`, `log_slow_extra`, and what each extra field is telling you.
- [Point-in-Time Recovery from Binary Logs](https://dev.mysql.com/doc/refman/8.0/en/point-in-time-recovery.html) — `mysqlbinlog` and `mysqlbinlog2mysql`, the actual procedure for recovering to a moment.

---

### End of Volume 8

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain why the clustered index *is* the table, and compute the page-read cost of a secondary-index lookup that is not covered versus one that is
- Predict exactly which of the four visibility cases applies to a given row version, read view and `trx_id`, and say what each case costs in undo walks
- State when the read view is created, and explain non-repeatable reads, phantom behaviour and gap-lock behaviour under both `READ COMMITTED` and `REPEATABLE READ` from that one fact
- Read a `SHOW ENGINE INNODB STATUS` deadlock section and name the cycle, the two queries, and the code change that removes it
- Diagnose a stalled history list with `information_schema.INNODB_TRX` and explain the instance-wide consequences of one long transaction
- Read an `EXPLAIN` and say which of `type`, `key`, `key_len`, `rows`, `filtered` and `Extra` told you something the others did not
- Explain why replication lag is a read-after-write correctness problem, and name the four mechanisms that fix it

### Coming in Volume 9 — Redis & Caching Strategies

Volumes 1 to 6 gave you the portable model — the physical layer, SQL as a language, indexes
and plans, transactions and isolation, schema and scaling. Volumes 7 and 8 then gave you
the two mainstream relational engines in full, including the mechanisms that make them

differ: heap versus clustered, snapshot versus next-key locking, vacuum versus purge. What

sits in front of both of them is a cache, and a cache changes every problem in this set —
it introduces a consistency window you did not have, it introduces three specific failure
modes (cache stampede, penetration and avalanche) that have no analogue in a database, and
it introduces an eviction policy that is a correctness decision disguised as a memory
decision. Volume 9 covers the data structures, cache-aside and its relatives, eviction, the
three classic bugs, persistence, and the cluster. It belongs immediately after this one
because every question in this volume — buffer pool sizing, read replicas, page cache — is
really a question about a cache, and Volume 9 is where the answers are generalised.

## Chapter 9 — Interview Scenario Bank

This bank uses four prefixes, and they are not interchangeable:

- **P** — production situation: something is happening now, and you have to decide what to do
- **T** — predicted behaviour: given this query, this configuration or this interleaving, what happens
- **S** — code-review question: here is code, what is wrong with it
- **D** — design trade-off challenge: there is no correct answer, only a defensible one and its cost

**The design questions are weighted most heavily, and that is deliberate.** A `T` question
can be answered by someone who has memorised the manual, and memorising the manual is not
the job. The `D` questions cannot be answered that way: each one has a real answer with a
real cost attached, and the only way through is to reason about the mechanism, name the
trade-off, say which side you are on and under what condition you would change your mind. In
this volume that means the clustered index versus the heap, the isolation level versus
concurrency, the copy versus the outage, and the replica versus the read-your-writes
guarantee. If you can only prepare part of this bank, prepare the `D` questions.

### Architecture & Buffer Pool

**P1. You are paged at 02:00 because CPU on the primary is at 95% and query latency is up
four-fold, but throughput is unchanged. What are the first three things you check?** `SCENARIO`
Throughput unchanged with latency up means contention or a plan change, not extra work.
First, `SELECT NAME, COUNT(*) FROM performance_schema.threads GROUP BY NAME` — an
unexplained thread count is a stuck transaction or a thread-pool problem. Second, the
adaptive hash index: `innodb_adaptive_hash_index=OFF` in a session is a zero-risk test, and
a hot AHI being rebuilt on a read-heavy workload is a real cause of exactly this shape.
Third, the digest table in `performance_schema.events_statements_summary_by_digest` sorted
by `SUM_TIMER_WAIT` — the same queries are running, and something in the instance (a
concurrency change, a statistics change on a table) made them more expensive. Query count
unchanged plus latency up is almost never a query problem.

**P2. A batch job finishes and leaves `innodb_buffer_pool_size` at 128 MB on a 64 GB host.
Walk me through what you would change and how you would know it worked.** `SCENARIO`
Size the pool from data, not from RAM: 70–80% on a dedicated host, and the correct number on
a shared instance is whatever the platform says the instance has. Before changing anything,
measure the hit rate from

`performance_schema.innodb_buffer_pool_read_requests` versus

`innodb_buffer_pool_reads` — if the miss ratio is already small, the pool is not the
problem and changing it will not help. Then, and this is the part people skip, size the
non-pool memory in the same change: `tmp_table_size`, `max_heap_table_size`,

`sort_buffer`, `join_buffer`, `read_buffer`, `read_rnd_buffer_size` and `thread_stack` are
all per-connection. 200 connections each holding a 32 MB tmp table is 6 GB, so a pool at
80% plus 20% for per-connection memory is how you OOM the host under a burst. Verify with
the hit ratio over a full traffic cycle, not a five-minute window.

**T1. A connection with `autocommit=0` runs `SELECT 1` and then the application makes HTTP
calls for six hours. What is the effect on the rest of the instance?** `TRICKY`

The first `SELECT` creates a read view, and it lives for the whole transaction. Purge
cannot advance past it, so every committed delete in the instance accumulates in the
history list, the undo log approaches its tablespace limit, read latency rises as version
chains get longer, and full scans keep walking delete-marked rows. One idle connection
degrades every other query. Note what does *not* happen: no other query is blocked, because
a plain read holds no row locks. The detection is

`SELECT trx_started FROM information_schema.INNODB_TRX ORDER BY trx_started LIMIT 1` and
the fix is to stop holding transactions across non-database work.

**S1. Review this connection setup.** `ADVANCED`

```java
dataSource.setUrl("jdbc:mysql://db:3306/shop?useServerPrepStmts=true");
dataSource.setMaximumPoolSize(200);
dataSource.setConnectionTimeout(2000);
// autocommit defaults to true — no explicit call.
```

```java
@Transactional
public Order placeOrder(List<LineItem> items) {
    validateInventory(items);          // → pricing-service, 200ms, 20 calls
    Order order = orderRepository.save(Order.from(items));   // → 1 INSERT
    emailClient.sendConfirmation(order.getId());             // → SMTP, 3 seconds
    return order;
}
```

Two problems, one of them serious. The `SMTP` call is inside a transaction, so the
transaction — and every lock the `save` took — is held for three seconds, and under
concurrency that is a lock-queue problem rather than a slow function. The inventory check
calls out to another service *before* the insert, so any two concurrent orders for the last
unit both see stock and both succeed; that is a correctness bug, not a performance one, and
it is the argument for a locking read or a conditional update rather than for a retry. The
pool of 200 is not obviously wrong for a dedicated host, but it is a blast radius: 200
threads each able to allocate `sort_buffer` and `tmp_table_size` is the memory budget from
the previous question. The fixes are to move the notification to an outbox after commit,
make the inventory decrement a single conditional `UPDATE ... WHERE stock >= n` that
returns the rows affected, and set the isolation level and the pool size explicitly rather
than inheriting them.

**D1. A 2 TB working set on a 1 TB machine. Do you add memory, add read replicas, or
change the schema?** `STAFF`

The right first move is the schema, because 2 TB of working set on a 1 TB machine is
usually 1.9 TB of it being data nobody reads. That means archiving, `PARTITION BY RANGE`
with a retention policy so `DROP PARTITION` is the deletion mechanism, and auditing the
indexes — a covering index that is never used and a four-level index on a

`VARCHAR(254)` are both pure working-set tax, and the invisible-index feature makes
finding them an experiment rather than a leap of faith. Once the working set genuinely
fits, replicas are the answer for *read* scale, and they are a bad answer for this problem
specifically, because a replica's buffer pool is a second copy of the same hot set and the
hot set is what does not fit. If the working set is irreducibly 2 TB — an analytics fact
table nobody has partitioned — then the answer is a different engine, and Volume 10 owns
that argument. I would change my mind in favour of replicas if the working set were 600 GB
and the read:write ratio were 100:1.

**D2. How would you decide between a bigger primary and a read replica for a 10× traffic
increase?** `STAFF`

Decompose the 10×. Write throughput above what one instance can sustain needs sharding or
a different engine, and a replica does not help at all — replication is one-way and every
write still lands on the primary. Read throughput above what one instance can serve is a
replica problem, and the arithmetic to do first is buffer-pool capacity against the hot
index, because a replica only helps if it can hold the same working set, which doubles your
memory requirement. The third axis is query shape: if the 10× is a specific report, a
materialised view or an analytical replica is far cheaper than both. The condition that
flips the answer to "shard" is sustained write volume beyond one primary's redo and buffer
capacity, at which point no amount of reading helps. And the question to ask before any of

it: which of the ten is the extra, and is it cacheable?

**D3. You inherit a MySQL with `innodb_flush_log_at_trx_commit=2` and `sync_binlog=0`.
What is the actual exposure, and what would you change?** `ADVANCED`

`innodb_flush_log_at_trx_commit=2` means the redo log is written to the OS at commit and
flushed to the device once per second, so an OS or power failure can lose up to a second of
committed transactions. `sync_binlog=0` means the binlog is only in the OS page cache, so
the same failure can lose binlog events for transactions the primary *believes* are
committed — and because the binlog is what feeds replicas, a standby you are relying on for
datacenter survival can be missing transactions that the primary's data files still have.
The exposure is therefore asymmetric and worth stating precisely: the primary is
self-consistent after recovery, the *replicas* are not, and divergence is permanent. For a
derived cache rebuildable from a source of truth, the trade is defensible and should be
written down with the RPO it implies. For a payments ledger it is indefensible. I would
move both to `1`, accept the commit-latency cost, and if that cost is unacceptable, reduce
it by batching at the application layer rather than by weakening the guarantee.

### Clustered Index & Storage

**P1. A 500 GB `events` table has 490 GB of delete-marked rows. What do you check first,
and what is the fix?** `SCENARIO`

The oldest transaction, not the table. `SELECT trx_started FROM

information_schema.INNODB_TRX ORDER BY trx_started LIMIT 1` — if there is a six-hour-old
transaction, purge cannot advance and no amount of rebuilding will reclaim anything, because
the deleted rows' undo is still pinned. A `SHOW ENGINE INNODB STATUS` "History list length"
that is not draining confirms it. If the history list *is* draining and the file is still
490 GB, then the deletes have been purged and the space is only reusable by rows that fit in
the holes, so the fix is a rebuild — `ALGORITHM=INPLACE, LOCK=NONE` under about 50 GB,
`gh-ost` above it, and if the retention is date-based, `PARTITION BY RANGE` with `DROP
PARTITION` so the problem does not recur.

**T1. `DELETE FROM t WHERE created_at < '2026-01-01'` removes 400 million rows. What does
the primary do, and what does the replica do?** `TRICKY`

The primary delete-marks 400 million records, which is 400 million record visits and a large
volume of delete-undo — each carrying the row pre-image *and* the primary key of the row in
every secondary index — and it does not reclaim anything until purge advances. The replica
receives **one** event. Parallel apply cannot split a transaction, so the replica applies
those 400 million row changes single-threaded, serially, and the lag graph is a step
function rather than a slope. The primary is fine and the replica is hours behind, which is
the shape that gets reported as "replication is broken". The fixes are to delete in batches
with a sleep, or — if the table is partitioned by date — to `DROP PARTITION`, which is a
fast metadata event on both sides.

**T2. Two tables, identical data, one with `PRIMARY KEY (id BIGINT AUTO_INCREMENT)` and one
with `PRIMARY KEY (id CHAR(36))` holding random UUIDs. Same row count, same columns. Which
inserts faster, and by roughly how much?** `ADVANCED`

The `BIGINT` one, and the gap is not marginal. InnoDB splits a page at a 15/16 fill
threshold specifically so that a burst of inserts into the same leaf does not split it
again. With a monotonic key every insert lands on the rightmost leaf, so roughly one split
per 16,000 inserts — about 63 splits per million rows, all sequential, all cheaply
prefetchable. With a random key each insert lands uniformly across all leaves, so the
chance of hitting the 1/16 unfilled tail of some leaf is 1/16, giving about 62,500 splits
per million rows. Each split allocates a page, copies roughly half its records, registers
both pages in the split list, and generates redo — on the order of 1000× the split rate
and gigabytes of pure page shuffling. The secondary-index read path is worse too, because
the rows are physically scattered and the return to table misses the buffer pool far more
often.

**S1. Review this DDL.** `TRICKY`

```sql
CREATE TABLE sessions (
  session_uuid CHAR(36)     NOT NULL,
  user_id       BIGINT       NOT NULL,
  payload       TEXT         NOT NULL,
  created_at    DATETIME     NOT NULL,
  PRIMARY KEY (session_uuid),
  KEY ix_sessions_user (user_id)
) ENGINE=InnoDB;
```

Three problems in six lines. The primary key is a random 36-byte text UUID, which is the
worst available choice — 36 bytes stored, 36 bytes repeated as a suffix in every secondary
index, and randomness forcing page splits on nearly every insert. `payload TEXT` inline
means InnoDB will store the first 2,000 bytes in the row and only off-page beyond a
threshold, so a 4 kB payload makes every point lookup expensive because the whole record is
read. And there is no monotonic surrogate, so nothing in the schema gives the clustered
index a favourable distribution. The fix: `id BIGINT UNSIGNED AUTO_INCREMENT` as the primary
key, keep the UUID as a `UNIQUE BINARY(16)` (or drop it and generate a UUIDv7 in the
application), and take `payload` out of line entirely into a separate table if it is not
read on every lookup.

**D4. You must choose: a narrow table with a join, or a wide denormalised table with no
join. What drives the decision?** `STAFF`

Read volume against write volume, and — more precisely — whether the join is on the *hot*
path. A wide denormalised table pays on every write: in InnoDB a `UPDATE` rewrites the
clustered record *and* every affected secondary index entry, there is no HOT-update
optimisation, and a wide row means a bigger redo record and a lower fan-out. It pays on
read only if the hot query needs the joined columns, in which case it eliminates an entire
B+ tree descent. So: if the joined data changes rarely and is read constantly — a customer
name on an order, a product title on a line item — denormalise and add a process that
rebuilds it when the source changes. If the joined data changes as often as it is read, the
denormalisation buys a per-write cost that the join was never costing, because the join is
a second descent and the second descent is a *read* cost. The condition that flips it back
is a write-heavy table with a rarely-used join.

**D5. Your table has no primary key and 40 million rows. Walk me through the migration and
tell me what you will not tolerate.** `ADVANCED`

The migration is an online `ALTER TABLE events ADD PRIMARY KEY (id),

ALGORITHM=INPLACE, LOCK=NONE` — but only if a natural unique key exists, because there is
nothing to add if the table is genuinely keyless, and in that case the first step is a
data-quality conversation about which combination of columns is meant to be unique. What I
will not tolerate is a nullable or non-unique surrogate, a random UUID, and an `ALTER` run
inline on a table this size. Beyond the immediate fix: every table without a primary key
costs a hidden 6-byte `GEN_CLUST_INDEX` in every secondary index, has no resumable cursor
for `pt-online-schema-change`, and cannot be the target of a foreign key — so this is a
migration with a checklist, not a one-line `ALTER`, and the checklist belongs in a schema
lint that runs in CI.

**D6. A table's physical size is 400 GB with 390 GB of live data. Rebuilding it takes
four hours and blocks nothing. Why is that a problem?** `STAFF`

Because `ALGORITHM=INPLACE` describes whether the table is *copied*, not whether it is
*free*. A 400 GB rebuild reads and writes all of it, generates tens of gigabytes of redo,
evicts the hot working set from the buffer pool for the duration, and produces a write
burst on the replica that takes hours to drain. The primary serves requests throughout, which
is exactly what makes it dangerous: nothing errors, and by the time anyone notices, the
replica is four hours behind and the buffer pool has been cold for two of them. So the
rebuild moves to `gh-ost`, throttled on replication lag rather than on server load, run in
batches with a plan for aborting. And the structural fix is to stop creating the condition:
`PARTITION BY RANGE` on the retention column, so the future version of this operation is a
`DROP PARTITION` that returns the space to the filesystem in a second.

### Undo

**P1. `SHOW ENGINE INNODB STATUS` reports "History list length 4,188,233" and climbing. Reads
have gone from 2 s to 90 s overnight. What is the incident?** `SCENARIO`

Purge is not keeping up, and everything downstream follows. The undo log is filling toward
its tablespace limit — a hard write-freeze when it gets there — reads are walking version
chains whose length scales with the history list rather than the table, and full scans are
walking delete-marked rows that are logically gone. The first query is

`SELECT trx_id, trx_started, trx_mysql_thread_id, LEFT(trx_query, 80) FROM

information_schema.INNODB_TRX ORDER BY trx_started` — the oldest transaction. In the
canonical version of this incident it is a connection with `autocommit=0` that ran one
`SELECT` to "warm the session" and then queued behind a slow downstream call. Kill it,
confirm the history list drains, and add an alert on its *growth rate* and an alert on any
transaction older than ten minutes.

**T1. Does an idle `BEGIN;` with no query block purge?** `TRICKY`

No, and this is the detail that distinguishes MySQL from PostgreSQL. InnoDB creates the
read view lazily, on the first consistent read, so a transaction that has issued no
statement holds no read view and pins nothing. The equivalent PostgreSQL transaction under
`REPEATABLE READ` takes its snapshot at `BEGIN`, immediately becomes the oldest live
snapshot in the cluster, and starves `autovacuum` on every table it could have touched. The
MySQL trigger for the same incident is therefore "this transaction executed a `SELECT` and
then did something else for hours"; the PostgreSQL trigger is "this transaction said `BEGIN`
and went away". The other half of the answer: a `SELECT ... FOR UPDATE` creates a read view
too, and holds locks, so a locking read that is idle inside application code is the worst
of both.

**S1. Review this service method.** `TRICKY`

```java
@Transactional(readOnly = true)
public Report buildReport(String tenantId) {
    List<Order> warm = orderRepository.findByTenant(tenantId);   // one SELECT
    return metricsClient.fetch(tenantId)                          // 30s HTTP
        .map(m -> aggregate(orderRepository.findByTenant(tenantId), m))
        .orElseThrow();
}
```

Under `REPEATABLE READ` the first `findByTenant` creates a read view and holds it for the
duration of the HTTP call. That is thirty seconds of pinned history list, and if the
metrics call retries, minutes. `readOnly = true` does not help: it prevents writes, not the
read view, and it does not shorten the transaction. The fix is to move the HTTP call before
the transaction boundary so the transaction is only the database work, and to fetch the
orders once instead of twice — the second `findByTenant` is also the reason the report is
inconsistent, since the read view is fixed at the first call so the two reads are not
actually the same thing under `READ COMMITTED`. The structural version is a scheduled job
that materialises the aggregate, rather than a request that holds a snapshot for an
upstream timeout.

**D7. Your reporting job runs 6 hours and holds a read view. Would raising the isolation
level, lowering it, or splitting it help?** `STAFF`

None of the three, and that is the interesting answer. Raising the level to `SERIALIZABLE`
makes it strictly worse — every `SELECT` becomes a locking read and the report now blocks
writes. Lowering it to `READ COMMITTED` helps a little: the read view is released at the end
of each statement rather than at the end of the six hours, so between statements purge can
advance, and only the currently-executing statement's view is pinned. But the report is one
giant statement, so that buys almost nothing. Splitting it — by partition, by tenant, by
date range, into statements of minutes rather than hours — is the only real fix, because it
is the length of the *longest single pinned read view* that matters, not the total runtime.
The remaining option, if the report genuinely must be one consistent snapshot across
thousands of tables for six hours, is to take it off the primary entirely onto a replica or a
logical dump, and accept that it is measuring the primary as of six hours ago.

**D8. `innodb_max_purge_lag` is set to 2,000,000 in production. Is that helping?** `ADVANCED`
It is doing something, and it is not what the name suggests. It makes purge sleep
deliberately so that the *replica's* apply lag is reduced — it trades primary-side history
list backlog for replica freshness. So it is a replica-lag control that expresses itself as
primary-side undo growth, and if your replicas are keeping up perfectly well it is
accumulating history list for no benefit, which is the Chapter 3 failure mode with an
authoritative-looking setting making it worse. It is also not a fix for a *stalled* history
list at all: it is a throttle on a cleaner that is already blocked. The correct sequence is
to set it to 0, find and end the long transaction, and only reconsider the setting if you
have a genuinely replica-bound workload and have measured what the number buys.

### MVCC & Read Views

**P1. A `DELETE FROM audit_log` of 200 million rows ran overnight and now the instance
"feels heavy" even though the table is 5% of its former size. What is happening?** `SCENARIO`
The space is not free yet and the reads are paying for it. The delete-marks are still in the
clustered leaf pages, so full scans still walk them; the delete-undo is still in the history
list until purge advances past the oldest read view; and every read that touches a recently
modified row walks a version chain. `DATA_LENGTH` unchanged is expected — InnoDB never
shrinks a file in place. The triage is `SHOW ENGINE INNODB STATUS` for the history list
length, then `INNODB_TRX` for the oldest transaction, then the digest table for

`SUM_ROWS_EXAMINED` on the tables involved. The fix is: end the long transaction so purge
drains, and then rebuild, or — if it recurs, which it will, because "we delete old rows" is
a code pattern and not a storage strategy — partition by date and use `DROP PARTITION`.
**T1. Under `REPEATABLE READ`, session A runs `SELECT * FROM t WHERE id = 1` (no lock),
then session B inserts and commits, then session A runs `SELECT * FROM t WHERE id = 2 FOR
UPDATE`. What does the second statement return?** `ADVANCED`

Row 2, if it sorts into A's locked range — because a locking read is a *current* read. It
reads the latest committed version and ignores the read view entirely, which is the whole
point of a locking read: you want to act on the present, not on a snapshot. So a single
`REPEATABLE READ` transaction has observed a state that did not exist when it started. That
is snapshot skew, it is the honest limitation of MySQL's `REPEATABLE READ`, and it is why
"MySQL's `REPEATABLE READ` is serialisable" is a claim worth refusing. The nonlocking first
read cannot see row 2, because its read view is fixed for the transaction's life.
**T2. A transaction does `SELECT 1;` then loops calling a stored procedure that does nothing
for an hour. Is the read view a problem?** `TRICKY`

Yes, and the size of the problem depends on the isolation level. Under `REPEATABLE READ` the
`SELECT 1` — if it is a query against a transactional table — creates a read view that lives
for the hour, pinning purge for the whole instance. Under `READ COMMITTED` the read view is
created per statement and released when `SELECT 1` finishes, so an hour of procedural
nothing costs nothing. This is the single strongest practical argument for `READ
COMMITTED` in a service that is genuinely idle inside transactions, and it generalises: the
resource you are holding is not the connection and not the locks, it is the read view. The
subtle version: `SELECT 1` is a constant and some optimisations skip read-view creation for
it, so do not design around that — `SELECT 1 FROM t LIMIT 1` definitely creates one.
**S1. This is supposed to be a "read the latest version" helper. Why is it wrong?** `TRICKY`

```java
@Transactional
public Order getOrder(long id) {
    return orderRepository.findById(id).orElseThrow();   // no lock
}
```

Under `REPEATABLE READ` the read view is created on this read and pinned for the
transaction's life, so a caller that loops over this method inside one transaction builds a
chain of consistent-but-stale reads and, worse, pins the instance's history list for the
duration. Under `READ COMMITTED` it is merely a read: it may miss a concurrent commit, which
is fine for a read but is *not* fine if the caller then makes a decision on the value. If the
caller is doing read-modify-write, the fix is `SELECT ... FOR UPDATE`, not a different
isolation level — the lock is what makes the subsequent write safe, and adding it makes the
transaction shorter rather than longer. The review comment is: state the isolation level
explicitly for this method, and say whether it is a current read or a snapshot read.
**D9. Your team wants to switch the whole instance to `READ COMMITTED`. What would you
audit first, and what would make you refuse?** `STAFF`

The audit is for multi-statement transactions that re-read what they wrote or read. Every
`@Transactional` method with two or more statements, every check-then-insert uniqueness
test, every balance or quota or inventory check, and every place a second read of the same
rows is assumed to return the same answer. The gap locks that `READ COMMITTED` removes are
the *only* thing making those patterns safe under `REPEATABLE READ`. I would refuse if that
audit cannot be completed — the switch is a correctness change wearing a performance
costume, and an incomplete audit is not a migration plan. I would also push back on doing it
globally rather than per service, because the workloads that want it (queue workers,
high-contention reporting) are a minority, and a per-datasource setting in the connection
pool gives the same benefit with a much smaller blast radius. The condition that flips my

answer: if the audit comes back clean and single-statement transactions dominate, it is a

clear win, and I would still do it per service first.

**D10. Design a job queue on MySQL. What isolation level, what indexes, and what is your
throughput ceiling?** `ADVANCED`

`READ COMMITTED`, always, and the reason is gap locks: at `REPEATABLE READ` a `WHERE status =
'PENDING'` predicate takes next-key locks covering every gap in the value range, not just
the matching records, so workers contend with each other and throughput flattens well before
CPU does. At `READ COMMITTED` only the matching records are locked, `SKIP LOCKED` skips the
busy ones, and workers scale roughly linearly until the primary's write capacity is hit.
The index is `KEY (status, priority, id)` so the range is tight and the `ORDER BY` is
satisfied by the index rather than a filesort. The table needs `locked_until` and
`attempts` columns, because a worker that dies mid-job releases its locks when the
connection closes and the row must become available again on a timeout rather than being
lost. The throughput ceiling is the primary's insert rate minus the vacuum of completed
rows, which is typically a few thousand to a few tens of thousands of jobs per second
depending on row width — and the ceiling is reached long before the CPU does, which is the
detail worth having ready. Row-based replication is mandatory, because `SKIP LOCKED` is
non-deterministic and a statement-based replica would apply a different job set.

### Index Design

**P1. A query in the slow log shows `Rows_sent: 640, Rows_examined: 6250000`. The plan is
unchanged and there was no deploy. What is the first action?** `SCENARIO`

Statistics. A 9,765:1 examined-to-sent ratio means the optimiser believed the predicate
would return 625,000 rows and was wrong by three orders of magnitude, and every downstream
decision — join order, join algorithm, scan versus index — was computed from that
belief. `EXPLAIN ANALYZE` confirms it in one statement, printing estimated against actual.
Then `ANALYZE TABLE`, and check whether the column's cardinality changed rather than
assuming the statistics are merely old: a four-valued `status` that now has forty thousand
values is a data-shape change, and the sample of 20 leaf pages will not have caught it. The
preventions are an `ANALYZE TABLE` after every bulk load and after every schema change, and
a dashboard panel on `SUM_ROWS_EXAMINED / SUM_ROWS_SENT` from the statement digest table,
because a two-orders-of-magnitude gap is never acceptable.

**T1. `EXPLAIN` says `key: NULL`, `possible_keys: ix_orders_status`, `type: ALL`, `rows:
50000000`. Is the optimiser wrong?** `TRICKY`

No, and this is the calculation. An equality predicate on a four-valued column over 50
million rows returns 12.5 million rows, and serving that through an index is 12.5 million
*random* page reads, while a sequential scan is 1.16 million *sequential* prefetchable
reads. The optimiser models both and picks the cheaper. The trap is reaching for `FORCE
INDEX`, which converts a thirty-second scan into a thirty-minute random-access storm. The
real questions are whether `status` should lead a composite index whose other columns make
it selective — `(status, created_at)` narrows it to 654 rows — and whether the four-value
cardinality is itself a data problem. The related trap is the "30% of the table" folklore

threshold: there is no such threshold, the cost model compares modelled costs, and the

number is a coincidence that has outlived the fact it came from.

**S1. Review this index set.** `TRICKY`

```sql
CREATE TABLE orders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(16) NOT NULL,
  email VARCHAR(254) NOT NULL,
  note TEXT,
  PRIMARY KEY (id),
  KEY ix_a (customer_id),
  KEY ix_b (customer_id, status),
  KEY ix_c (status),
  KEY ix_d (email),
  KEY ix_e (email, status)
) ENGINE=InnoDB;
```

Five secondary indexes for a table with four queryable columns, and two of them are
redundant. `ix_a (customer_id)` is a strict leftmost prefix of `ix_b (customer_id, status)`
and cannot serve anything `ix_b` cannot — it is a full extra B+ tree maintained on every
insert and every update that touches `customer_id`, and it can be dropped. `ix_e (email,
status)` is only justified if a query filters on both *and* needs `status` back cheaply; if
no such query exists it is pure write cost. What survives review is `ix_b`, `ix_d`, and
possibly `ix_e`. Then the second question: `email VARCHAR(254)` utf8mb4 is 1018 bytes per
secondary entry before the transaction fields and the primary key suffix, which drops a
50-million-row email index to four levels — is a prefix index on `(email(120))` enough
selectivity, and does any query need `email` in a `GROUP BY`? And the third: nothing here
indexes `note`, and if something does, a prefix index is the only option.

**D11. You can add exactly one index to a table with 50 million rows and four hot query
shapes. How do you choose?** `STAFF`

Not by picking the most frequent query. The arithmetic that decides it is *marginal cost
per unit of work added*, which means counting how many of the four queries become covering
and how many bytes of the row they stop reading. The strongest candidate is almost always
a widening of an existing index to cover a hot query's selected columns, because it turns
two B+ tree descents into one for a few bytes per entry — at 8 bytes per entry on 50
million rows that is 400 MB, which is cheap against the latency of removing a random page
read from the hot path. The weakest candidate is a new index on a low-cardinality column,
which buys nothing and costs a full tree on every write. Before choosing, read

`Rows_examined` versus `Rows_sent` per query from the digest table: a query with a 10:1
ratio has headroom; one with 10,000:1 has a statistics problem that an index will not fix.
And the fourth question: which of these four queries is the one whose latency the business
actually feels, because that is not necessarily the most frequent one.

**D12. When is a denormalised read model the right answer, and who owns keeping it
correct?** `STAFF`

When the join is on the hot path and the denormalised value changes far more slowly than it
is read — a customer's current plan tier on every one of their forty thousand orders, say.
Then the read is one descent instead of two, and the write cost, which is a redo record and
a secondary-index entry on the parent, is paid on the rare update rather than on every read.
The condition that rules it out is when the denormalised column changes as often as it is
read, because then the write cost is paid on every write and the join — a *read* cost — is
what you were trying to avoid. "Who owns keeping it correct" is the more important half of
the answer: in MySQL there is no cheap way to do it, so it is a change-data-capture
subscription, a trigger, or a periodic rebuild, and one of those three has to be named
before the design is approved, along with what the staleness bound is. A denormalised column
whose refresh mechanism has not been named is not a design; it is a bug with a schema.

### Next-Key Locking

**P1. A nightly job runs `UPDATE orders SET status = 'CANCELLED' WHERE customer_id BETWEEN
10 AND 500` and takes 40 minutes. During that window, inserts for customers 10–500 hang
while inserts for everyone else are fine. Why?** `SCENARIO`

The gap locks, if that update goes through a locking read or a scan that takes next-key
locks — which it does, because InnoDB locks every index record it scans, and the scan
covers every gap in the range, not just the matching records. Every insert that would land
inside that range needs an insert intention in a gap that is sealed, so it queues behind
the job's locks and stays there for the full 40 minutes. The inserts outside the range are
unaffected, which is exactly the "some writes hang and some are fine" report and exactly
the signature that rules out a general resource problem. The diagnosis is

`information_schema.INNODB_TRX` ordered by `trx_started` plus

`performance_schema.data_lock_waits` to see the blocking transaction. The fix is to shorten
the job into batches with a pause, or to run the instance at `READ COMMITTED` where the gap
locks do not exist.

**T1. `SELECT * FROM t WHERE id BETWEEN 10 AND 20 FOR UPDATE` runs while `id = 15` does not
exist. What is locked, and what blocks?** `ADVANCED`

Every next-key record in the range — each existing record *and* the gap immediately before
it — plus a next-key lock on the supremum record covering the end of the index. The gaps
tile, so the range is sealed. A concurrent `INSERT` of `id = 15` must take an insert
intention lock on the gap the row would occupy, that gap is covered by an existing next-key
lock, and the two modes conflict — so the insert blocks until the locking read's
transaction ends. This is the entire mechanism by which `REPEATABLE READ` prevents phantoms
for current reads, and it is why the level is MySQL's default. Note what is *not* blocked: a
plain nonlocking `SELECT`, because it is served from the read view and takes no locks.
**T2. Two sessions each run `UPDATE inventory SET qty = qty - 1 WHERE sku = ?` with
different SKUs and deadlock. No ranges, no gaps, rows all exist. How?** `STAFF`

Lock ordering. The rows exist, the primary key is `sku`, so these are record locks on unique
keys — `lock_mode X, locks rec but not gap` in the deadlock output — and a deadlock between
two such locks can only come from the two transactions having taken their locks in
different orders. The application shape that does this is decrementing a *set* of SKUs in
whatever order the caller supplied them, so session 1 goes A then B and session 2 goes B
then A. The fix is a global ordering rule: sort the SKU list before the first lock is taken,
inside the transaction and inside the retry. The same deadlock from the same code is what
`SHOW ENGINE INNODB STATUS` shows with two blocks where each transaction's "HOLDS THE LOCK(S)"
is the other's "WAITING FOR".

**S1. Review this method.** `TRICKY`

```java
@Transactional
public void applyAdjustments(Map<String, Integer> adjustments) {
    for (var e : adjustments.entrySet()) {
        int stock = inventoryRepo.lockStock(e.getKey());   // SELECT ... FOR UPDATE
        inventoryRepo.setStock(e.getKey(), stock + e.getValue());
    }
    auditClient.record(adjustments);        // HTTP, 2 seconds, inside the transaction
}
```

Three issues. The iteration order comes from a `Map`, which means it depends on the hash
of the key strings — so two sessions sending the same adjustments in a different insertion
order can lock in different orders and deadlock, deterministically and intermittently. The
audit HTTP call is inside the transaction, holding every lock acquired in the loop for two
extra seconds, which turns a rare collision into a frequent one. And each

`lockStock`/`setStock` is two round trips where a conditional `UPDATE ... SET stock = stock +
? WHERE sku = ? AND stock + ? >= 0` returning the rows affected is one, which is both faster
and race-free. The fix, in order: copy into a `TreeMap` or a sorted list before the loop,
move the audit call to an outbox after commit, and collapse the read-then-write into a
single conditional update.

**D13. You are designing a service where many workers must decrement a shared pool of
counters, and you cannot use Redis. What is the design?** `ADVANCED`

Each counter gets a row, each worker takes a locking read on exactly the rows it needs in a
deterministic order — sorted by primary key, always, as a global rule — and updates them
within a short transaction. The service runs at `READ COMMITTED` so that only the matching
records are locked rather than every gap in the counter keyspace, which matters enormously
when many workers touch adjacent counter ids. Deadlocks are still possible when two workers
need overlapping sets in different orders, so the ordering rule is non-negotiable and the
transaction must be a whole-transaction retry with jittered backoff. To reduce contention

further: shard the counters across several `N` shards and have each worker take a shard per

transaction, turning a many-row lock set into a one-row one at the cost of a small amount of
fan-out. And the thing to say unprompted: if the contention is high enough that you are
designing around it, the honest answer is that the counter is a shared mutable resource that
a cache with atomic operations would serve better — which is exactly why Volume 9 exists,
and why "we cannot use Redis" is a constraint worth questioning rather than designing around.
**D14. A recurring deadlock between two services, both of which claim to order their locks by
primary key. What do you ask next?** `STAFF`

I ask what the *rows* are, not what the code says. Ordering by primary key only prevents
deadlocks when the two transactions need the same rows and lock them in the same relative
order — and the usual ways it fails are: one service locks through a *different index* than
the other, so "primary key order" means different physical positions, because InnoDB locks
index records and the record it locks for `WHERE email = ?` is not the record it locks for
`WHERE id = ?`; one of them takes a gap lock from a range predicate that the other does not;
or one of them locks a row the other only reads, so the ordering is over a set the other
does not have. So the questions are: which index does each statement actually use
(`EXPLAIN`, and the `key` column), what are the predicates' shapes, and — with
`innodb_print_all_deadlocks=ON` and a few days of data — is the pattern always the same two
tables in the same two orders. If it is, the fix is a shared lock-ordering convention
expressed in terms of *index entries*, not primary keys, and enforced in both codebases. If
the deadlock involves gap or next-key locks, the answer is a different one: the predicate
shape is the problem, and `READ COMMITTED` on the affected service removes it.

**D15. A transaction needs to lock 500 rows. `SELECT ... FOR UPDATE` on all 500 in one
statement versus 500 separate statements. Which is better and what is the difference?** `ADVANCED`
One statement, and the reason is that a single scan over a range takes next-key locks on
every record and every gap it passes, so it acquires the same locks in one atomic operation.
Five hundred separate statements acquire the same locks in five hundred separate operations,
each of which is a deadlock opportunity, and between statements other transactions can
sneak in and create the ordering conflicts that the single statement would have made
impossible. The single statement is also one round trip rather than five hundred. The
consequence is that the single statement is also the *worse* choice when the 500 rows are
computed by application code — then you are back to 500 separate locks, and the only fix is
to sort them and issue one `WHERE pk IN (…)` with the list pre-sorted, letting InnoDB acquire
them in index order. So the design rule is: never lock a set of rows that the database could
have locked in one scan, and when you must, make the set's order deterministic at the point
where the order is chosen.

### Isolation Levels

**P1. A team wants `READ COMMITTED` to reduce deadlocks. What do you ask before agreeing,
and what is the audit?** `STAFF`

Whether any transaction re-reads rows and then writes based on what it read. The gap locks
that `READ COMMITTED` removes are the only thing making `SELECT`-then-`UPDATE` and
`SELECT`-then-`INSERT` uniqueness checks safe under `REPEATABLE READ`, so removing them
converts those into real lost updates. The audit is a search of every `@Transactional`
method with two or more statements, every check-then-insert uniqueness test, every balance,
quota or inventory check, and every place a second read of the same rows is assumed to
return the same answer. The second thing to ask is whether the level will be set globally or
per service, because per-datasource in the connection pool gets the same benefit with a much
smaller blast radius. And the third: what will detect the regression, since a lost update is
silent and will not show up as an error.

**T1. Under `REPEATABLE READ`, two `SELECT COUNT(*)` statements on the same predicate in one
transaction return different numbers. Possible?** `TRICKY`

Yes, if one of them was a locking read. A consistent nonlocking read is answered from the
transaction's read view, which is fixed for the transaction's life, so it cannot see a row
inserted and committed after the transaction began. A `SELECT ... FOR UPDATE` is a current

read: it reads the latest committed version and ignores the read view, which is deliberate,

because the intent of a locking read is to act on the present. So the second statement
legitimately reports the world as it is rather than as it was — snapshot skew, and the
honest limit on calling MySQL's `REPEATABLE READ` serialisable. If both statements were
nonlocking, this cannot happen.

**S1. This is a uniqueness test. What is wrong with it under `READ COMMITTED`?** `TRICKY`

```java
@Transactional
public void claimCoupon(String code, long userId) {
    if (couponRepo.findByCode(code).isPresent()) {
        throw new AlreadyClaimedException(code);
    }
    couponRepo.save(new Coupon(code, userId));
}
```

Under `REPEATABLE READ` at default settings this is protected by a gap lock on the `code`
value — the check-then-insert race is closed by the index range being sealed. Under
`READ COMMITTED` the gap locks are gone, so two concurrent requests both see "not present"
and both insert, and the only thing that stops the second is the `UNIQUE` constraint, which
fires as an error at commit time rather than as a clean domain exception at the point of
the check — so the caller gets a 500 instead of a 409 and the exception handling around it
is not designed for that. The database is still correct; the application's contract is not.
The fixes: catch the constraint violation and translate it, or do the check as a single
conditional `INSERT ... SELECT ... WHERE NOT EXISTS`, or take an explicit advisory lock, or
keep this particular method at `REPEATABLE READ` while the service runs at

`READ COMMITTED`. The per-method answer is the one that scales.

**D16. Design a ledger with double-entry accounting on MySQL. What isolation level, and
what is the invariant you are protecting?** `ADVANCED`

`REPEATABLE READ` for the posting transaction, and the invariant is that the sum of debits
equals the sum of credits for every transaction, that no account balance is read and then
written from a stale value, and that a posting is either wholly visible or wholly absent.
At `READ COMMITTED` the read-then-write on the balance row has to be a `SELECT ... FOR
UPDATE` anyway — you do not want the gap locks protecting this — and the check-then-insert on
the idempotency key has to be a unique constraint with the violation caught and translated.
Beyond isolation, the design points that matter are: an idempotency key with a `UNIQUE`
constraint so a retry cannot double-post, an append-only postings table that is never
updated, and a balance that is a materialised aggregate rebuilt from the postings rather
than a mutable counter — because a mutable counter is a row that every posting transaction
contends on, and contention on a single row is a throughput ceiling no isolation level
fixes. Partition the postings table by period so the ledger's hot set shrinks as it ages.
**D17. Your instance is at `REPEATABLE READ`. A service is read-only. A service is a hot
write path. A batch job needs an exact reconciliation. What do you set?** `STAFF`
Per service, and the reasons are different in each case. The read-only service gets
`READ COMMITTED` because nothing it does requires repeatability, and because at

`REPEATABLE READ` even a read that opens a transaction and then does application work pins
the instance's history list — the Chapter 3 incident, in its purest form. The hot write
path gets `REPEATABLE READ` if it has any read-modify-write in it, because that is exactly
what the gap locks are for, and `READ COMMITTED` if it is genuinely single-statement, in
which case the switch is a clear win on blocking and deadlock. The batch job gets
`SERIALIZABLE`, set **per transaction** with

`START TRANSACTION ISOLATION LEVEL SERIALIZABLE`, so the job is exact against a database
other systems are writing to and the rest of the instance keeps its concurrency. The point
to make in the review is that isolation level is a per-unit-of-work property, and the fact
that it is settable per session is a feature you should use rather than a hazard you should
centralise.

**D18. A team says "we need `SERIALIZABLE` because our reports must be exact." What do you
ask?** `TRICKY`

What "exact" means, and whether a snapshot would do. `SERIALIZABLE` in InnoDB converts every
plain `SELECT` into `LOCK IN SHARE MODE`, so a report that scans eight tables holds next-key
locks on all eight for its entire duration and blocks inserts into every range it examined —
which, on a busy table, is most of them. If "exact" means "the total did not change under
me", then a consistent read at `REPEATABLE READ` already gives that for every table, because
one transaction-scoped read view covers all of them, and it costs nothing. If "exact" means
"nothing was written anywhere in the database while I ran", that is a much stronger claim
and `SERIALIZABLE` is a heavy way to get it. The better answers in almost every case are a
replica with a heartbeat to measure staleness, a materialised view refreshed on a schedule, or
a point-in-time dump. And the structural question worth asking: why is a report reading
tables that are being written to, and could it read a snapshot of them instead?

### Replication & Operations

**P1. A user creates an order and the next page load says the order does not exist. The
replica lag is 0.2 seconds. What happened and what is the fix?** `SCENARIO`

Lag of 0.2 s and a missing write is exactly the read-after-write case: the write committed on
the primary, the read was served by a replica that had not applied it yet. Semi-synchronous
replication does not prevent this — it waits for the replica to *receive* the transaction,
not to *apply* it. The fix is a read-your-writes mechanism, and the simplest one is
per-session routing: after a write, the proxy pins that session to the primary for a window
longer than the measured p99 lag, which is 0.2 s here. The alternatives are reading from
the primary for the whole request that performed the write, or

`WAIT_FOR_EXECUTED_GTID_SET(gtid, timeout)` for the cases that need linearizability against
a specific write. What you do not do is raise the replica hardware — the problem is
architectural, not a capacity problem, and 0.2 s of lag is already excellent.

**P2. A 400 GB `ALTER TABLE ... ADD COLUMN` was run at 03:00 with `ALGORITHM=INPLACE`. No
errors. At 09:00 the replica is six hours behind. What went wrong?** `SCENARIO`

Nothing errored because nothing was wrong in the way the plan checks for. `INPLACE` means
the table was not *copied*; it does not mean it was free. A 400 GB rebuild reads and
rewrites all of it, generates tens of gigabytes of redo, and produces a sustained write
burst — and the replica, which applies that burst serially behind everything else, is now
six hours behind with no mechanism to catch up except applying it. The buffer pool was also
cold for a large part of it, so the primary's own latency degraded without any error. The
recovery is to let it drain, or to rebuild with `gh-ost`, which throttles on replication lag
precisely so this cannot happen. The prevention is a policy: above roughly 50–100 GB, no
rebuilding `ALTER` runs inline, and every one is a `gh-ost` run with a stated lag ceiling.
**T1. `binlog_format=STATEMENT` and a table has a query using `NOW()` and `LIMIT` without
`ORDER BY`. What happens on the replica?** `TRICKY`

The replica re-executes the statement rather than replaying rows, and it does so at a
different time with a different plan and a different set of statistics. `NOW()` returns the
replica's clock at apply time, not the primary's clock at commit time. A `LIMIT` without
`ORDER BY` has no defined row order, so the replica may return a different subset of rows —
and it will, eventually, because the optimiser is free to choose a different access path once
the statistics have drifted. The result is silent divergence that `START SLAVE` reports as
working. `ROW` is the default since 5.7 for exactly this reason, and it is also mandatory for
a queue built on `SKIP LOCKED`, whose result set is non-deterministic by design. `MIXED`
converts the statement to row events in some cases, which makes the behaviour harder to
reason about rather than safer.

**S1. Review this deployment script.** `ADVANCED`

```bash
mysql -e "SET GLOBAL sync_binlog=0;"
mysql -e "SET GLOBAL innodb_flush_log_at_trx_commit=2;"
mysql -e "SET GLOBAL long_query_time=0;"
mysql -e "SET GLOBAL log_queries_not_using_indexes=ON;"
```

Every line is a decision nobody made on purpose. `sync_binlog=0` means the binlog lives
only in the OS page cache, so a replica — including a standby relied on for datacenter
survival — can be missing transactions the primary believes are committed, and that
divergence is permanent after recovery. `innodb_flush_log_at_trx_commit=2` accepts up to a
second of lost commits on an OS failure, which is defensible for a rebuildable cache and
indefensible for a ledger. `long_query_time=0` logs *every* statement, which on a busy
instance is a disk-space and parsing problem rather than a diagnostic one, and

`log_queries_not_using_indexes` is the classic self-inflicted outage: it logs every index
scan on a table with no index, which is every full scan, which on a reporting replica is
most of the traffic. The review comment: durability settings belong in version-controlled
infrastructure with the RPO they imply written next to them, and the logging settings want
`min_examined_row_limit` rather than zero.

**D19. Design the read path for a service where a user must see their own write
immediately, and the primary is already at 80% CPU.** `STAFF`

Route reads for a session that has written to the primary for a bounded window, and put
everything else on replicas. The window is the measured p99 lag plus a margin, not a
constant someone picked — with GTID and a heartbeat-based lag measurement it is a number you
can compute and put in a config file. The primary keeps the write plus the reads from
sessions currently pinned to it, which is a small fraction of total read volume because the
pin expires. The alternative shapes: `WAIT_FOR_EXECUTED_GTID_SET` on the replica after a
write, which is exact but adds the lag to every read-after-write and is awkward inside an
ORM; a "read your writes" token handed to the client, which is more machinery than most
systems need. What I would not do is add read replicas hoping the primary frees up — the
primary's 80% is on the write path, and reads on replicas do not touch it. The condition
that changes my answer is a workflow where a user writes and another, different user must
see it within milliseconds: that is not a read-your-writes problem, it is a case for the
replication lag to be under the business SLA, which is a capacity commitment.

**D20. Your primary must survive the loss of an availability zone and you have two
replicas. What is the actual design?** `ADVANCED`

The constraint is what "survive" means, and it has three parts. Zero data loss requires
either semi-synchronous replication with *at least one* replica in another zone, which gives
acknowledged-but-not-applied, or a synchronously-replicated pair, which costs commit
latency on the write path. Recoverable-in-an-RPO requires plain asynchronous replication
plus binlog shipping to object storage — which is cheap, is almost always worth doing
regardless, and is the baseline rather than the answer. Fast failover requires automatic
promotion, which means GTID, `CHANGE REPLICATION SOURCE TO` with no coordinates,
automatic replica selection, and an application that can be pointed at the new primary
without a human. The thing to say unprompted is that failover correctness is a rehearsal
outcome and not a design outcome: a failover plan that has not been exercised quarterly is
a plan, and the exercise is what finds the split-brain. I would also insist the

monitoring be on data currency — a heartbeat row and a lag number — rather than on process
liveness, because a primary that is up and 40 minutes behind has already failed the test.
**D21. Your `orders` table is 2 TB, mostly audit rows older than 90 days, and disk is the
constraint. Walk me through the fix, including what you will not do.** `STAFF`

Partition by month on `created_at`, backfill the partitions from a logical dump in batches,
and then make the retention mechanism `ALTER TABLE orders DROP PARTITION p2026_06` — an O(1)
metadata operation that returns the space to the filesystem, against a `DELETE` that would
produce hundreds of gigabytes of delete-undo, block purge for the duration, inflate the
history list, and leave the file the same size. The prerequisite to state explicitly: adding
the partitioning expression to the primary key, because every unique key must contain it, so
`PRIMARY KEY (id)` becomes `PRIMARY KEY (id, created_at)`, and that is a schema change with
its own migration. What I will not do: `OPTIMIZE TABLE` or an `ALGORITHM=COPY` rebuild
inline, because that is 2 TB of I/O, an exclusive lock, and a multi-day replication
backlog; or a `DELETE` in batches as the *only* mechanism, because the file never shrinks;
or drop the audit rows entirely without a retention policy, because the same table will be
back here in ninety days. And the honest caveat: partitioning does not make queries
faster unless they prune, so the partition count and the access pattern have to be looked at
together — weekly partitions for monthly retention is a reasonable middle, and `HASH`
partitioning would buy nothing here.
