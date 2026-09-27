---
title: "The Database Complete Deep-Dive"
volume: 7
series: "POSTGRESQL"
subtitle: "Study & Interview Mastery Guide"
---

# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is volume seven of an eleven-volume set. Volumes 1 through 6 were the portable
material — the physical and logical model, SQL as a language, indexing and query execution,
transactions and concurrency, and schema design. They were written to be true of any
relational database, which is exactly what makes them insufficient at the point where you
are choosing between engines, debugging a production incident, or explaining to a team why
the same query behaves differently on two systems. This volume is the first engine volume.
It takes one database — PostgreSQL — and goes all the way down.

It is not a tutorial. You will not find `CREATE TABLE` explained here, or a guided exercise,
or a worked example you can type along with. What you will find is the machinery underneath
the SQL: the process model that makes connection counts a memory calculation, the page
layout that makes a row's size a function of its history, the visibility rule that decides
which version of a row you see and what it costs, the planner's arithmetic and the settings
that change it, and the janitor whose failure is silent. Every chapter is framed as a
decision with a failure mode, because that is the level at which these things are actually
discussed in a design review.

The hook is that PostgreSQL is *not* quietly doing what you assume. It is not reading the
rows you think it is reading. It is not failing when it should be failing. It holds a
global horizon that one forgotten session can pin for weeks. It picks a plan based on a cost
model you have not calibrated. Every one of those is a fact with a number attached, and
knowing the number is the difference between diagnosing an incident and guessing at it. The
other half of the hook is what an extension can and cannot do: `jsonb` and PostGIS and
`pgvector` add genuinely useful capability, and none of them touch the process model, MVCC,
WAL, or commit semantics.

The register throughout is staff-level. That means the answer includes the operational
consequence, the number, and the condition under which the recommendation flips — not just
the recommendation. It also means the version is stated wherever behaviour changed, because
"CTEs are materialised" was true once and is not true now, and an answer that does not say
which version it means is not an answer. Where this volume is not confident about current
behaviour it says so and tells you to verify, rather than guessing. Cross-references to
other volumes state a target and do not restate the content.

### How This Guide Is Structured

Every chapter in this set follows the same template. The template is the contract; a chapter
that deviates from it is a bug in the chapter, not an exception.

````markdown
## Chapter N — <Title>

### N.1 <Section>
### N.2 <Section>

> **CALLOUT NAME — "THE QUESTION IT ANSWERS"**
>
> Body text, wrapped.

Prose paragraphs, hard-wrapped at ~95 columns, continuation lines flush-left.

- Dash bullets for unordered lists
- 1. **Bold lead-in** — for ordered steps

```sql
SELECT 1;
```

#### Common Mistakes

- ...

#### Interview Questions — <Subtopic>

**Q1. ...?** `STAFF`

Answer as a flush-left wrapped paragraph.

> **CHAPTER N SUMMARY**
>
> ...

#### Further Reading

- [Title](url) — description
````

Not every chapter uses every slot. The callouts are the ones that appear at all, and this is
the legend:

| Callout | Means |
| --- | --- |
| `INTERVIEW TRAP` | the common answer that a senior candidate should catch and correct |
| `TRADE-OFF` | a decision with both sides, and the condition that flips the answer |
| `SCALING REALITY CHECK` | the specific number where this stops working |
| `PRODUCTION RELEVANCE` | why this matters outside an interview |
| `MUST REMEMBER` | the one fact to carry forward |
| `PRODUCTION SCENARIO` | a five-line incident: problem, investigation, root cause, solution, prevention |
| `STAFF-LEVEL CONSIDERATION` | the org or process concern worth raising unprompted |

Each chapter ends with `Common Mistakes` — the things that are wrong often enough to be worth
naming — and with `Further Reading`, which points at the primary source rather than a
tutorial. Volumes end with an `Interview Scenario Bank` whose questions are weighted toward
design trade-offs, and the bank stops when a question would repeat one already asked, so
coverage of a concept is not the same thing as coverage of a concept's easy version.

One volume-specific note before you start. PostgreSQL's behaviour is versioned, and several
of the things candidates are most confidently wrong about changed in a specific release.
Non-recursive CTEs were inlined by default in version 12. `hash_mem_multiplier` arrived in
16. Virtual generated columns arrived in 18. Enum values became usable in the transaction
that added them in 12. Where this volume states a behaviour, it states the version, and where
it is not certain of the current state it says to check the documentation rather than
guessing. That is not hedging; an interview answer that names the version is a stronger
answer than one that does not.

### Continuing From Volume 6

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and slotted pages, heaps, the relational model, keys, normalisation, the algebra, the shape of the scaling problem |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution under `ACCESS EXCLUSIVE`, numeric precision, what each constraint costs, `INSERT`/`UPDATE`/`DELETE`/`TRUNCATE` write paths, three-valued logic |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — join semantics and how `WHERE` silently makes an outer join inner, set operations, `WITH`, window frames, `DISTINCT ON`, `LATERAL` |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, page splits, leftmost prefix, index types, `EXPLAIN` and statistics, join algorithms, cost estimation |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID, the anomalies, the four levels and what each actually prevents, MVCC theory, lock escalation, deadlocks, two-phase commit |
| Volume 6 (this book) | Schema Design, Partitioning & Scaling — grain, normalisation, key choice, indexing strategy, partitioning and its operational cost, denormalisation done on purpose, schema evolution at scale |
| Volume 7 (this book) | PostgreSQL — process model, storage, MVCC in practice, types and JSONB, SQL feature depth, indexes, query planning, isolation and locking, autovacuum and operations |
| Volume 8 | MySQL — InnoDB clustered indexes, next-key locking, the undo log as the read path, purge, replication |
| Volume 9 | Redis & Caching Strategies — cache-aside, stampede, penetration, eviction, persistence, replication |
| Volume 10 | NoSQL & Distributed Stores — Cassandra, DynamoDB, MongoDB; partitioning, consistency, CAP as a database question |
| Volume 11 | S3, Elasticsearch & the Database Interview Bank — object storage semantics, inverted indexes, the consolidated bank |

### Table of Contents — Volume 7

- Chapter 1 — Architecture & the Process Model
- Chapter 2 — Storage: Pages, Heap Files & TOAST
- Chapter 3 — MVCC in Practice
- Chapter 4 — Types, Extensions & JSONB
- Chapter 5 — SQL Feature Depth
- Chapter 6 — Indexes & Indexing
- Chapter 7 — Query Planning
- Chapter 8 — Transactions, Isolation & Locking
- Chapter 9 — Autovacuum, Bloat & the Operational Surface
- Chapter 10 — Interview Scenario Bank

---

# Part 1 — PostgreSQL

## Chapter 1 — Architecture & the Process Model

The first thing to get right about PostgreSQL is what it *is* at the operating system level,
because almost every operational question about it — connection limits, memory sizing, why
the database will not start, why a query killed one other query — is answered by the process
model and by nothing else. The mental model most people carry is "a server process handles
requests", and it is wrong in a specific, consequential way.

### 1.1 The Wrong Mental Model

The intuitive picture is a service: a listening socket, a thread pool, and a shared heap
where queries run. PostgreSQL is not that. It is a **process manager with a set of
independent operating system processes**, and the unit of concurrency is the process, not the
thread. When a client connects, the postmaster `fork()`s a new backend process. That backend
handles that one connection for its entire lifetime, then exits when the client
disconnects. There is no pool, no thread sharing, and no work stealing — a backend that goes
away takes its memory with it.

This is a deliberate design, not an accident of implementation. Separate processes mean a
backend crash takes down one connection rather than the server, that a runaway query's memory
is bounded by the OS rather than by the server's willingness to admit it is misbehaving, and
that many of the internal operations — a `VACUUM`, a `REINDEX`, a parallel query worker —
can run in parallel with almost no locking between them. The price is paid in three places:
process creation cost, per-process memory overhead, and the absence of in-process parallelism
inside a single query unless you opt into parallel workers explicitly.

> **INTERVIEW TRAP — "HOW MANY CONNECTIONS CAN POSTGRESQL HANDLE?"**
>
> The reflexive answer is "hundreds, or a thousand — it's lightweight and fully concurrent."
> That answer is wrong, and wrong in the way that matters operationally, because the number
> that binds is not the connection count but the *memory* multiplication behind it. One
> connection is one process with a multi-megabyte private baseline, and every query that
> backend runs can allocate `work_mem` per plan node per parallel worker on top of that.
> The correct answer has three parts: `max_connections` (default **100**) is a hard ceiling
> that the postmaster enforces by refusing connections, it is not a performance target, and
> the real capacity question is `max_connections × per-connection baseline + concurrent
> memory per query` measured against `shared_buffers` and the machine's RAM. On a 16 GB
> instance, 100 connections is already a large number. On a 256 GB instance with big
> `shared_buffers`, a few hundred is defensible. The number that does not move is the one
> that matters: PostgreSQL does not get more efficient per connection as you add them, and
> past the cache-warm point the marginal connection costs more than it returns.

### 1.2 The Postmaster and Its Children

At startup the postmaster reads the configuration, recovers or initialises the data
directory, and then becomes a supervisor. It owns the shared memory segment, the lock
manager, the buffer pool, and the listening sockets. It does not execute queries. Its
children do.

```text
                    ┌──────────────────────────────────┐
                    │          postmaster              │
                    │  owns: shared memory, lock mgr,  │
                    │        buffer pool, sockets,     │
                    │        WAL, signal handling      │
                    └───────────────┬──────────────────┘
                                    │  fork() per event
        ┌───────────────┬───────────┼───────────┬────────────────┐
        │               │           │           │                │
        ▼               ▼           ▼           ▼                ▼
  ┌──────────┐   ┌──────────┐ ┌─────────┐ ┌──────────┐  ┌────────────┐
  │ backend  │   │ backend  │ │ autovac │ │ checkpointer│ │ walwriter  │
  │ pid 4101 │   │ pid 4102 │ │ launcher│ │           │  │            │
  │ conn →   │   │ conn →   │ │         │ │ fsyncs   │  │ ships WAL  │
  │ 10.0.0.5 │   │ 10.0.0.9 │ │ spawns  │ │ at       │  │ to standbys│
  └──────────┘   └──────────┘ │ workers │ │ checkpoint│  └────────────┘
                            └────┬────┘ └──────────┘
                                 │ fork()
                    ┌────────────┼────────────┬───────────────┐
                    ▼            ▼            ▼               ▼
              ┌──────────┐ ┌──────────┐ ┌───────────┐  ┌────────────┐
              │ vacuum   │ │ vacuum   │ │ parallel  │  │ logical    │
              │ worker 1 │ │ worker 2 │ │ worker    │  │ replication│
              │          │ │          │ │ (per query│  │ / bgworker │
              └──────────┘ └──────────┘ └───────────┘  └────────────┘

  ONE PROCESS PER CONNECTION.  THE REST ARE FIXED-COUNT WORKERS THAT PULL FROM
  SHARED, PRE-COUNTED SLOTS — NOT ONE PER CLIENT.
```

Two design consequences follow directly from this picture and both are worth stating out
loud in an interview.

**Backends are not pooled and not shared.** A backend exists for exactly one connection.
When the connection drops, the process exits. This is why a service that opens a new
database connection per HTTP request — a common and entirely reasonable-looking pattern in
a stateless service — will drive the postmaster's fork rate hard enough to matter. Fork is
not free; on Linux with a large `shared_buffers` segment, the page table copy is the
dominant cost, and a fork storm degrades *every* connection's latency, not just the new
ones. The tell is a rising connection count made of very short-lived sessions, visible in
`pg_stat_database.numbackends` moving without a matching change in application load.

**Fixed-count workers come from a pre-allocated pool.** `max_worker_processes` is the total
number of background worker slots the cluster has, and autovacuum workers, logical
replication workers, parallel query workers, and extension background workers all draw from
it. `autovacuum_max_workers` (default **3**) is a sub-cap. `max_wal_senders` (default
**10**) is a sub-cap on the replication side. When the pool is exhausted the symptom is
subtle: a parallel query gets fewer workers than configured — the plan shows a `Gather` with
fewer children, not an error — and autovacuum falls further behind schedule, silently. The
arithmetic that catches teams out is that 3 autovacuum + 2 logical replication + 8 parallel
workers exceeds a `max_worker_processes` of 8, and the setting does not complain.

### 1.3 Memory Per Connection

This is the calculation that decides whether a connection count is safe, and it is worth
being able to do in your head.

A backend's private memory falls into three buckets.

**The fixed baseline.** Every backend gets private memory it holds for its whole life: a
private portion of the buffer pool's local buffers, a `BackendData` structure, per-backend
state for locks, the client connection buffers, and the memory PostgreSQL allocates for
things like the `pg_stat` hash tables' local portions. The commonly cited figure is roughly
**2–5 MB per connection** for this baseline, and the real cost is usually higher than
people assume because it is per *backend*, not per query, and it is resident whether or not
the connection is running anything.

**Shared memory, which is not per connection.** The buffer pool (`shared_buffers`,
default **128 MB**), the lock manager's shared arrays, and the `pg_stat` shared structures
are shared across all backends. Every backend maps the same pages. This is the part that
makes PostgreSQL's memory efficiency reasonable at moderate connection counts: 100 backends
do not cost 100 times the buffer pool. It is also the part that makes the *total* hard to
reason about, because a large `shared_buffers` is a large fixed cost on a machine where
you wanted the memory for connections.

**Per-query working memory, which is unbounded and is the actual danger.** `work_mem` is a
per-*node* limit, not per query and not per connection. A plan with a hash join, a sort, a
materialise, and a bitmap heap scan can allocate `work_mem` at each of those nodes, and
hash operations are further scaled by `hash_mem_multiplier` (default **2.0**, PostgreSQL
16+). Every parallel worker runs its own copy of the subtree with its own allocations. So
the honest formula is:

```text
  peak RAM  ≈  shared_buffers
             + max_connections  ×  per-connection baseline        (~2-5 MB)
             + (queries running concurrently)
               × (nodes in the plan)
               × work_mem
               × (1 + parallel workers per query)
```

The consequence is arithmetic, not opinion. Set `work_mem` to 64 MB, run a five-node plan
with four parallel workers on 20 concurrent connections, and you have authorised roughly
25 GB of transient allocation on a machine that may not have it. PostgreSQL's answer to
memory pressure is not an out-of-memory error — it is that the kernel's OOM killer chooses
the largest-RSS process, which is the backend running the biggest sort, which is an innocent
query. The resulting symptom — a random pattern of failed queries with no traceable cause
and no error at the time of the kill beyond a log line about a signal — is one of the most
confusing incidents you can be handed.

> **SCALING REALITY CHECK**
>
> `work_mem` defaults to **4 MB** and that default is correct for the overwhelming majority
> of queries. It is a *per-node* limit, so a five-node plan is authorised five times it; it
> is multiplied again by the number of parallel workers, each of which allocates its own;
> and it is multiplied again by every concurrent query on that connection. Raising it
> globally to "a value that makes my worst query fast" is a decision that scales with
> connection count and query concurrency, neither of which the person setting the GUC is
> looking at. The safe pattern is to leave the global default alone and raise it per
> statement with `SET LOCAL work_mem = '256MB'` inside the one transaction that has been
> measured to need it.

### 1.4 Three Failure Modes of the Process Model

**Connection exhaustion.** `max_connections` reached. The postmaster logs a
`FATAL: sorry, too many clients already` and drops the connection. Nothing in the database
is wrong; the allocation is. The diagnostic is `pg_stat_activity` grouped by
`application_name` and client address, cross-referenced with
`pg_stat_database.numbackends`, and the question to ask is always about *lifetime* rather
than *count* — are these few long-lived connections, or many short-lived ones? The second
kind is a fork-rate problem with a different fix.

**A runaway query eating the machine.** Because a backend is a separate process, one bad
query's memory is bounded by the OS and can be killed independently — which is a genuine
advantage over a threaded server where one runaway query can starve everything. But the
default `work_mem` makes "runaway" mean "a query that legitimately needs a lot of memory
and gets it", and `statement_timeout` (default **0**, off) is the setting that converts an
outage into an error message. Setting a `statement_timeout` is one of the cheapest
reliability improvements available on any PostgreSQL installation, and its absence is the
reason a bad deploy can take down a healthy database.

**The postmaster cannot allocate `shared_buffers`.** If the machine does not have enough
contiguous memory for the configured shared segment, the postmaster exits at startup with a
message about `could not resize shared memory segment` or
`insufficient shared memory`. The failure is loud and immediate, which makes it the
friendliest of the three. The cause is nearly always `shared_buffers` set as a fraction of
RAM that does not leave room for the OS and the rest of the machine, on a host where
something else already has a large mapping.

### 1.5 PgBouncer and the Transaction/Session Distinction

Because each PostgreSQL connection is a process, and process creation is not free, the
standard answer to a high connection count is a connection pooler in front. PgBouncer is the
one almost everyone uses, and its three modes are not variants of the same thing — they
have different correctness properties, and choosing the wrong one is a source of bugs that
do not announce themselves.

**Session mode** is a pass-through. The client holds one server connection for the life of
the client connection, and the pooler multiplexes only the *client* side. This preserves
every PostgreSQL feature, because the server genuinely sees one session per client for its
whole life. The cost is that the number of server connections still equals the number of
client connections, so session mode fixes nothing about the count — it only adds a layer.
It is useful when you need `LISTEN`/`NOTIFY`, session-level advisory locks, or `SET`
across statements, and it is the honest answer when you cannot change the application.

**Transaction mode** is the one that solves the problem. The server connection is held only
for the duration of a transaction and then returned to the pool, so a thousand client
connections can share a few dozen server connections. The cost is precise and severe: any
state that is scoped to the *session* rather than the *transaction* is now shared between
unrelated clients or lost between them. Concretely, in transaction mode:

- `SET` without `LOCAL` persists on the server connection and leaks to the next client that
  gets it. In a schema-per-tenant design this is a cross-tenant data leak with no error.
  The fix is `SET LOCAL` inside an explicit transaction, always.
- `LISTEN`/`NOTIFY` does not work, because the listening session ends when the transaction
  commits.
- Session-level advisory locks (`pg_advisory_lock`) leak in the same way as `SET` and are
  worse, because a leaked lock is invisible. `pg_advisory_xact_lock` is safe.
- `WITH HOLD` cursors and multi-statement sequences that assume the same backend can be
  interrupted between statements, so a sequence of statements outside an explicit
  transaction may be served by different backends.
- Named prepared statements need care: PgBouncer's `max_prepared_statements` setting exists
  precisely because protocol-level prepared statements were historically not safe under
  multiplexing, and the default has been a limitation rather than a feature.

**Statement mode** is almost never what you want. It discards transaction state entirely
and only works for autocommit single-statement traffic; implicit transactions, multi-statement
functions, and anything relying on server-side state are all outside it.

> **TRADE-OFF — TRANSACTION MODE IS THE DEFAULT ANSWER, AND ITS BREAKAGE IS QUIET**
>
> Transaction mode is the right default because it is the only one that actually reduces the
> server connection count, and on any real deployment the connection count is the binding
> constraint. What makes it a decision rather than an obvious choice is that its failure
> modes are silent. A leaked `SET` produces wrong query results with no error. A leaked
> session advisory lock produces a job that never runs again. A `LISTEN` that does not
> receive its notification produces a missing update. None of these announce themselves,
> and all of them are introduced by a change that looked like pure infrastructure. The flip
> condition: if the application genuinely needs session state, transaction mode is wrong and
> the answer is session mode with a properly sized server-side pool, or application changes
> that make session state unnecessary. The check that catches it in review is a grep for
> `SET ` outside a transaction block.

### 1.6 The Background Workers

| Worker | Configured by | What it does | When it matters |
| --- | --- | --- | --- |
| Checkpointer | `checkpoint_timeout`, `max_wal_size` | Writes dirty buffers to disk at a checkpoint | A checkpoint that takes too long stalls the checkpointer and then every writer |
| WAL writer | — | Streams WAL out of `pg_wal` | `pg_wal` growth means it is not keeping up |
| WAL sender | `max_wal_senders`, `max_replication_slots` | Streams WAL to standbys and slots | Slot lag is a disk-space problem, not just a replication problem |
| Autovacuum launcher | `autovacuum_naptime` (60s) | Decides which tables need work | Chapter 9 |
| Autovacuum worker | `autovacuum_max_workers` (3) | Actually vacuums and analyzes | The pool is 3, shared across the whole cluster |
| Parallel query worker | `max_parallel_workers_per_gather` | One subtree of a query | Fewer workers than expected is silent |
| Logical replication / custom | `max_worker_processes`, `max_logical_replication_workers` | Apply workers, extension workers | Exhaustion shows up as autovacuum falling behind |
| Archiver | `archive_mode`, `archive_command` | Ships WAL to archive storage | A failing `archive_command` fills `pg_wal` and then stops writes |

The table is worth memorising not as a list but as a set of failure couplings. The one that
catches experienced people: `max_worker_processes` is shared, and autovacuum is the consumer
whose shortfall is silent and cumulative. A cluster that adds logical replication for a new
analytics feed can, purely by consuming worker slots, slow vacuum down enough to accumulate
dead tuples on a table that has nothing to do with replication.

#### Common Mistakes

- Believing PostgreSQL multiplexes connections internally, and sizing `max_connections` as
  if it were a thread pool
- Raising `max_connections` to solve a connection problem without doing the memory
  multiplication, and getting an OOM kill instead of a clean refusal
- Setting `work_mem` globally on the reasoning that "this is how much a sort needs", when
  it is a per-node, per-worker, per-concurrent-query limit
- Running transaction-mode pooling without auditing for session-scoped state — `SET`,
  `LISTEN`, session advisory locks, and protocol-level prepared statements
- Treating a short-lived connection churn problem as a connection count problem, and missing
  the fork-rate bottleneck entirely
- Running with `statement_timeout` at 0 on a production instance, so one bad query is an
  outage rather than an error
- Planning `max_worker_processes` by summing the per-subsystem defaults without noticing
  they draw from one pool

#### Interview Questions — Process Model & Connections

**Q1. What actually happens when a client connects to PostgreSQL?** `TRICKY`

The postmaster accepts the connection and `fork()`s a new backend process to handle it; that
backend lives for exactly as long as the client connection and then exits. The postmaster
retains only shared resources — the shared memory segment holding the buffer pool and the
lock manager arrays, the listening sockets, and the supervision of its fixed-count
background workers. So the unit of concurrency is the operating system process, not a
thread, and there is no internal pool: a backend that goes away releases its memory back to
the OS. That is why the design is worth naming as deliberate — a backend crash costs one
connection instead of the server, a runaway query's memory is bounded by the OS rather than
by the server's willingness to admit it is misbehaving, and `VACUUM`, `REINDEX` and
parallel query workers can run concurrently with almost no cross-locking. The costs are
process creation (the page-table copy dominates on a large `shared_buffers`), a per-process
baseline of a few megabytes, and no in-process parallelism unless parallel workers are
requested.

**Q2. A service opens a new database connection per HTTP request. What breaks, and what is
the first thing to measure?** `TRICKY`

Not the connection count — the fork rate. If the pool is large enough to absorb the
concurrency, the server never hits `max_connections`, and the symptom is latency that scales
badly with load even though every individual query is fast. The cost of a `fork()` in a
process with a large shared memory segment is dominated by copying page tables, and
interleaving many of those with normal query traffic degrades the whole instance. The first
thing to measure is connection *lifetime* rather than count:
`SELECT count(*), min(backend_start), max(backend_start) FROM pg_stat_activity` over a
series of samples, or `numbackends` in `pg_stat_database` watched over time. A sawtooth at a
high frequency is churn; a flat line at a high value is a genuine count problem. The fix is a
client-side pool — HikariCP, `pgbouncer` in transaction mode, or both — and the design
lesson is that the number to manage is connections per unit of work, not total connections.

**Q3. You need to raise `max_connections` from 100 to 500. What else has to change?** `STAFF`

The memory, and specifically the part nobody calculates. Five hundred backends at a few
megabytes of private baseline each is a couple of gigabytes before a single query runs, and
that is only the fixed cost. The dangerous term is the transient one: `work_mem` is a
per-node limit, multiplied by the nodes in a plan, multiplied by the parallel workers, and
multiplied by every concurrent query — so 500 connections makes the *worst-case* transient
allocation dramatically larger, and the failure mode is not a clean error but the OOM killer
choosing the largest backend, which is an innocent query, with no cause visible in the
database. So the changes are: do the arithmetic against actual RAM rather than against
`shared_buffers`; leave `shared_buffers` at a value that leaves headroom for the connections;
keep `work_mem` at its default so the per-query term stays bounded; put PgBouncer in front so
the server-side count is small and the client-side count is not; and set a `statement_timeout`
so a single query cannot authorise a large transient allocation. And the framing that
belongs in the answer: 500 connections is achievable on a large instance, but it is a
capacity decision made on the basis of arithmetic, not a configuration edit. If the pressure
is on the connection count, the first question is which service is opening them and whether
transaction-mode pooling solves it — that answer is usually yes and usually cheaper.

**Q4. Why can a query get fewer parallel workers than `max_parallel_workers_per_gather`
says, without any error?** `ADVANCED`

Because parallel workers, autovacuum workers, logical replication workers and extension
background workers all draw from one shared pool sized by `max_worker_processes`. When the
pool is contended, a query asking for N workers can be granted fewer, and the planner's
`Gather` node simply has fewer children than the GUC suggests. There is no error, because
from the query's point of view a `Gather` with two children is a perfectly valid plan — it is
just a different, slower plan than the one that was intended. The same contention shows up
on the autovacuum side as workers that cannot start promptly, which is the more dangerous
half because it is silent and cumulative: dead tuples accumulate. The diagnostic is to
enumerate what is actually consuming the pool — replication senders and receivers, logical
replication workers, `pg_cron`, custom extension workers, plus the `VACUUM` and `ANALYZE`
you launch by hand — and sum them. Then set `max_worker_processes` above that total with
headroom. The follow-up worth volunteering is that the *count* of workers is not the real
limit anyway: each parallel worker multiplies `work_mem`, so eight workers on a five-node
plan authorise forty times `work_mem` for one query, and the worker count and the memory
setting have to be planned together.

#### Further Reading

- [PostgreSQL — Server Start-Up and Shutdown](https://www.postgresql.org/docs/current/server-start.html) — what the postmaster does at startup, what each background process is, and the shared memory it allocates.
- [PostgreSQL — Connection Management](https://www.postgresql.org/docs/current/runtime-config-connection.html) — `max_connections`, `superuser_reserved_connections`, `idle_in_transaction_session_timeout`, and the connection-level settings that behave differently under pooling.
- [PostgreSQL — `pg_stat_activity`](https://www.postgresql.org/docs/current/monitoring-stats.html) — `backend_xmin`, `wait_event_type`, `state`, and the other columns the process model makes meaningful.
- [PostgreSQL — `CREATE EXTENSION` and Extension Support](https://www.postgresql.org/docs/current/sql-createextension.html) — trusted versus untrusted extensions, and what a background worker contributed by an extension costs from the shared pool.

> **CHAPTER 1 SUMMARY**
>
> PostgreSQL is a process manager, not a threaded service: one `fork()`ed backend per
> connection, alive for that connection's whole life, with a fixed-count pool of background
> workers drawing from a shared `max_worker_processes` budget. `max_connections`
> (default 100) is a hard refusal ceiling rather than a target, and the real capacity number
> is the multiplication — `max_connections × per-connection baseline + concurrent queries ×
> plan nodes × work_mem × parallel workers` — which is why the OOM killer, not a clean
> error, is the failure to design against. PgBouncer in transaction mode is the default
> answer because it is the only mode that reduces the server-side count, and its failure
> modes are silent: a leaked `SET` is a cross-tenant data leak, a leaked session advisory
> lock is a job that never runs again, and `LISTEN`/`NOTIFY` simply does not arrive. The
> traps worth naming: a connection *churn* problem looks nothing like a connection *count*
> problem, and worker-pool exhaustion degrades autovacuum silently long before it degrades
> anything else.

## Chapter 2 — Storage: Pages, Heap Files & TOAST

Volume 1 Chapter 2 established the physical model: pages, the slotted page, heap files, row
locators, and the free space map. This chapter is the PostgreSQL-specific version of the same
ground, and it is worth re-reading Volume 1 alongside it, because the layout here has
specific numbers attached to it and those numbers explain an entire class of surprising
behaviour. The one-line version: a PostgreSQL page is 8 kB, it is *slotted*, tuples are never
moved, and a row that was once large stays expensive forever.

### 2.1 The Page

`BLCKSZ` is 8192 bytes and is compiled in; you cannot configure it. Every table, index, and
TOAST relation is a file made of these pages, and the first 24 bytes of every page are a
fixed header.

```text
  ONE POSTGRESQL PAGE — 8192 bytes
  ════════════════════════════════════════════════════════════════════════════
  offset 0                                                                  8192
  ┌────────────────────────────────────────────────────────────────────────┐
  │ PageHeaderData — 24 bytes, always present                              │
  │ pd_lsn          8   │ xlog position of the last change to this page    │
  │ pd_checksum     2   │ page checksum, 0 when checksums are disabled     │
  │ pd_flags        2   │ has free content, is a visibility-map page, ...   │
  │ pd_lower        2   │ offset of the FIRST line pointer  ← grows up      │
  │ pd_upper        2   │ offset of the END of line pointers← grows down    │
  │ pd_special      2   │ offset of the special space (always 8192)        │
  │ pd_pagesize_version 2 │ page size + layout version                      │
  │ pd_prune_xid    4   │ oldest xid that may have marked this page dead   │
  ├────────────────────────────────────────────────────────────────────────┤
  │                         F R E E   S P A C E                           │
  │   tuples live here, growing UPWARD from pd_lower, and they are the     │
  │   only thing in the page that ever changes size                         │
  ├────────────────────────────────────────────────────────────────────────┤
  │ Line pointers — ItemIdData, 4 bytes each, growing DOWN from pd_upper   │
  │ ┌──────┬──────┬──────┬──────┬──────┬ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐│
  │ │ item0│ item1│ item2│ item3│ item4│          (unused)                 ││
  │ └──────┴──────┴──────┴──────┴──────┴ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘│
  │   each points to where its tuple actually is, and is NEVER MOVED       │
  ├────────────────────────────────────────────────────────────────────────┤
  │ T U P L E S — HeapTupleHeaderData + null bitmap + column data          │
  │ ┌──────────────────────────────────────────────────────────────────┐   │
  │ │ t_xmin 4 │ t_xmax 4 │ t_cid 4 │ t_ctid 6 │ t_infomask 2 │ t_hoff 2│ + │
  │ │ null bitmap (variable)                                          │   │
  │ │ column data, in attribute order, each aligned to its own type    │   │
  │ └──────────────────────────────────────────────────────────────────┘   │
  │ ┌──────────────────────────────────────────────────────────────────┐   │
  │ │ FREE SPACE — orphaned tuples, left behind by UPDATE, never reused │   │
  │ │ until VACUUM marks them available to the FSM                      │   │
  │ └──────────────────────────────────────────────────────────────────┘   │
  ├────────────────────────────────────────────────────────────────────────┤
  │ pd_special → 8192: special space. ZERO bytes for a heap page. It is    │
  │ 8 bytes for an index page (the metapage) and 24 for a visibility map.  │
  └────────────────────────────────────────────────────────────────────────┘
  ════════════════════════════════════════════════════════════════════════════
```

Three features of this layout do most of the explaining work, and all three are things
candidates get wrong in interviews.

**Tuples are identified by `ctid`, which is a location, not an identity.** A `ctid` is a
`(block number, offset within block)` pair, and it identifies *where a row version is
right now*. It is not a primary key, it is not stable, and it changes whenever the row is
updated and the new version does not fit on the same page. Using `ctid` as a row identifier
is a category error, and using it as a *correlation* identifier inside a single statement is
legitimate and occasionally useful.

**Updates never move a tuple.** An `UPDATE` marks the old version dead and appends a new
version — on the same page if it fits (that is a HOT update, Chapter 3), otherwise on
another page, which is a non-HOT update. Either way the old bytes stay put. This is why a
row that was once 3 MB keeps costing you: the page it lived on was shaped around it, the
neighbouring tuples were pushed elsewhere or to other pages, and when the value shrank the
space became a hole that nothing reclaims. The steady-state cost of a row is a function of
the largest the row ever was.

**The free space map is how space comes back without a rewrite.** `VACUUM` does not
compact a heap. It walks the page, identifies space in ranges that is free, and records
20-byte `PageFreeSpaceMap` records in a separate fork. Subsequent inserts reuse that space.
The user's original format does not come back; only the space becomes usable again. This is
the distinction behind the most common bloat misunderstanding, and Chapter 9 returns to it.

### 2.2 Line Pointers and the Lock Fast Path

The slot array deserves more attention than it usually gets, because PostgreSQL uses it for
something clever. A line pointer is 4 bytes normally, but when a tuple is *locked* and not
deleted, the line pointer expands to 8 bytes to hold a transaction id directly.

```text
  UNLOCKED line pointer (4 bytes)          LOCKED line pointer (8 bytes)
  ┌──────────────┬──────────────┐          ┌──────────────┬──────────────┬─────────────┐
  │ lp_off:15    │ lp_flags:2   │          │ lp_off:15    │ lp_flags:2   │ lp_lock:31  │
  │ lp_len:15    │ (unused pad) │          │ lp_len:15    │             │ xid (31b)   │
  └──────────────┴──────────────┘          └──────────────┴──────────────┴─────────────┘
    bit 15 is unused, the other 15 hold the offset and length of the tuple

  WHY: locking a row means writing a transaction id somewhere. Doing it in the 4-byte
  line pointer is a single already-dirtied page write with no tuple modification.
  Doing it in the tuple header would dirty the tuple and defeat the HOT-update
  fast path. The cost is that the slot array — which lives at the TOP of the page —
  must be rewritten, so a page can run out of line-pointer space before it runs out
  of tuple space. That is why you see "no space to copy TOAST" and odd errors on
  pages with an unusually large number of very narrow rows.
```

### 2.3 Relation Forks and the Visibility Map

A table is not one file. It is up to four, distinguished by an OID suffix in the relation
filename, and each answers a different question:

| Fork | Suffix | Contents | Written by |
| --- | --- | --- | --- |
| Main | `16384` | The heap pages themselves | Inserts, updates |
| Free space map | `_fsm` | Where free space exists, in page-sized ranges | `VACUUM` |
| Visibility map | `_vm` | Two bits per page: `ALL_VISIBLE`, `ALL_FROZEN` | `VACUUM` |
| Init | `_init` | The unlogged relation's initial page | Only for `UNLOGGED` tables |

The visibility map is the one with consequences outside of vacuum. `ALL_VISIBLE` means every
tuple on that page is visible to every snapshot that could still exist — no concurrent
transaction could need an older version. When an index-only scan finds that every page in its
range is `ALL_VISIBLE`, it can return rows without touching the heap at all, and the plan
reports `Heap Fetches: 0`. The moment any row on that page is updated, the bit is cleared, and
every index-only scan over that range starts fetching. This is why `Heap Fetches` appearing
in a plan is a vacuum signal, not a plan problem, and why Chapter 9's starvation failure has
a query-performance symptom on top of its disk symptom.

A page that is both `ALL_VISIBLE` and `ALL_FROZEN` additionally has no tuples whose `xmin`
still needs checking against the horizon, which is what lets the freeze scan move forward.

### 2.4 TOAST

A tuple must fit in a page, roughly. If it does not, it is *toasted*: the oversized
attributes are compressed, and if still too large, moved out of line into a separate TOAST
relation that is paired with the heap by the toast table's `chunk_id`.

The thresholds, which people quote imprecisely:

- `TOAST_TUPLE_THRESHOLD` — about **2000 bytes** below which PostgreSQL does not even try.
  So a row under roughly 2 kB is never toasted, whatever its shape.
- `TOAST_TUPLE_TARGET` — about **2000 bytes** of data it aims to leave *after* moving
  attributes out, to leave room for future updates on the same page.
- The trigger is therefore roughly "row over ~2 kB", but the exact behaviour depends on
  per-column storage settings and alignment, so the operational number to measure is
  `pg_column_size` rather than the constant.

Compression is attempted first, because a large `text` of natural language often compresses
by 3-4x and stays inline. PGLZ is the default; LZ4 was added in PostgreSQL 14 and
Zstandard is also available, both usually faster at a modest ratio cost. Verify the current
list against the docs for your version rather than assuming.

The per-column storage mode is the control that matters, and it is underused:

| Mode | Compress? | Move out of line? | Use for |
| --- | --- | --- | --- |
| `PLAIN` | no | no | Never toast; a too-large value is an **error** at insert |
| `EXTENDED` | yes | yes | The default — compress, then relocate if still large |
| `EXTERNAL` | no | yes | Already-compressed payloads: skip the wasted CPU pass |
| `MAIN` | yes | no | Long text you always read with the rest of the row |

```sql
-- what is actually stored, per row
SELECT id,
       pg_column_size(id)          AS id_bytes,
       pg_column_size(body)        AS body_inline,
       pg_column_size(ROW(id, title, body)) AS whole_tuple,
       pg_size_pretty(pg_total_relation_size('documents')) AS total
FROM documents LIMIT 5;

-- a wide row will show a large whole_tuple and a total far larger than rows × tuple
-- because the TOAST relation and its index are counted in pg_total_relation_size
-- and NOT in pg_relation_size
SELECT pg_size_pretty(pg_relation_size('documents'))          AS heap,
       pg_size_pretty(pg_total_relation_size('documents'))    AS heap_plus_toast;

-- and the two that explain the surprises
ALTER TABLE documents ALTER COLUMN body SET STORAGE EXTERNAL;   -- already compressed
ALTER TABLE documents ALTER COLUMN body SET STORAGE MAIN;       -- always read inline
```

A TOAST value is not fetched automatically when you read a row — the heap tuple holds a
pointer, and the out-of-line chunks are read only if the query actually references that
column. So `SELECT id FROM documents` over a table of multi-megabyte documents is *fast*,
and `SELECT id, body FROM documents WHERE ...` can cost a random chunk read per returned
row. This is the inverse of the usual "wide table is slow" intuition and it is worth
raising, because the team that never selects the column never opens the ticket.

### 2.5 Measuring It

```sql
-- accurate, but scans: table-level tuple distribution and free space
SELECT * FROM pgstattuple('documents');
--   tuple_percent   — how full the pages actually are. Low value on a table whose
--                     current rows are small = the shape of the old rows persists.
--   dead_tuple_percent
--   free_percent
--   avg_tuple_size / max_tuple_size

-- approximate and much faster, for a table you cannot scan
SELECT * FROM pgstattuple_approx('documents');

-- per-column, cheap, and the fastest way to find the wide column
SELECT avg(pg_column_size(title)) AS avg_title,
       avg(pg_column_size(body))  AS avg_body,
       max(pg_column_size(body))  AS max_body
FROM documents;

-- index bloat, the same tool
SELECT * FROM pgstattuple('documents_pkey');
```

> **MUST REMEMBER — THE ONE FACT ABOUT POSTGRESQL STORAGE**
>
> A row's cost is a function of the largest the row ever was, not what it is now. The page
> is slotted, updates never move a tuple, and shrinking a column frees bytes into a hole
> that nothing reclaims in place. Diagnose with `pgstattuple` and fix with a rewrite
> (`pg_repack`, or `VACUUM FULL` under a lock) — never with `VACUUM` alone, which makes
> space reusable but does not return it.

#### Common Mistakes

- Believing an `UPDATE` compacts the row or that `VACUUM` shrinks the file — it does
  neither; only a rewrite returns space to the filesystem
- Using `ctid` as a row identifier rather than as a location that changes on update
- Assuming the ~2 kB TOAST threshold is exact, rather than measuring with
  `pg_column_size` and per-column storage modes
- Forgetting that `EXTERNAL` exists, and paying for a full compression pass on data that is
  already JPEG, ZIP, or MP4
- Being surprised that `SELECT id FROM t` is fast on a table of huge documents — the
  out-of-line chunks are only read if the column is referenced
- Reading a rising `Heap Fetches` in an index-only scan as a planner problem rather than a
  visibility-map problem
- Ignoring the TOAST relation when reconciling `pg_relation_size` with
  `pg_total_relation_size` and concluding a table is bigger than its rows require

#### Interview Questions — Storage & TOAST

**Q1. A table's average row is 200 bytes, it has 50 million rows, and the relation is 24 GB
rather than the ~12 GB the arithmetic predicts. Where does the extra space come from, and
what fixes it?** `STAFF`

Three candidates, in order of likelihood, and the first is almost always the answer.
**Historic bloat**: a column that once held much larger values — a `text` body, a JSON
document, a base64 blob — shaped the pages it lived on, and because updates never move a
tuple, shrinking the value left a hole that nothing reclaimed in place. That is the
"steady-state size is a function of the largest the row ever got" effect, and it is
confirmed by `pgstattuple` reporting a `tuple_percent` far below what the current average
row width predicts, together with `pg_column_size` showing a small row next to a large
relation. Second candidate: **TOAST**, which is included in `pg_total_relation_size` but
not in `pg_relation_size`, so a large out-of-line footprint is invisible if you only look at
the heap; the check is the difference between the two functions. Third: **dead tuples**,
which is Chapter 9's territory. The fix ladder is the one from Chapter 9 and it is worth
stating in the answer: `VACUUM` first, which marks space reusable and repaints the
visibility map but does not compact pages and does not shrink the file, so it is necessary
and not sufficient; then `pg_repack`, which rewrites online into a tight copy and is the
right production answer; `VACUUM FULL` does the same with an `ACCESS EXCLUSIVE` lock and
roughly double the disk, for a maintenance window. The prevention is a `fillfactor` below
100 on any table with a column that can grow, so there is room for the update to stay on
the page — and a schema that does not put unbounded blobs in a relational column.

**Q2. What are the four relation forks and what is each for?** `TRICKY`

Main, the free space map, the visibility map, and — for unlogged tables only — the init
fork. The **main** fork is the heap itself: the pages holding the tuples, and the only fork
whose contents change as a result of ordinary inserts and updates. The **free space map**
is a small structure recording, in page-sized ranges, where reusable free space exists; it
is written by `VACUUM` and read by the inserter to decide where a new tuple can go, which
is what allows space to be reused without ever compacting a page. The **visibility map** is
two bits per page — `ALL_VISIBLE` and `ALL_FROZEN` — and it is the enabler for index-only
scans: when a page is marked `ALL_VISIBLE`, no concurrent transaction could need an older
version, so an index-only scan can return rows without touching the heap, and the plan
reports `Heap Fetches: 0`. Any update to any row on a page clears the bit, which is why a
rising heap-fetch count is a vacuum signal. The **init** fork exists only for `UNLOGGED`
tables, holding the page written when the relation was created so that a crash can restore
it without WAL. All four are separate files in the relation's directory, distinguished by
OID suffix, and the operational point is that `pg_total_relation_size` includes all of them
while `pg_relation_size` includes only the main fork.

**Q3. Why does a table of 3 MB documents scan fast when you select only the id?** `TRICKY`

Because TOAST is lazy in the direction that matters here. The threshold is roughly 2 kB per
*row*, so a 3 MB column is compressed first and then, if still too large, relocated out of
line into a separate TOAST relation; the heap tuple retains only a pointer to the first
chunk plus the toast table's identifier. When a query references only `id`, the executor
never dereferences that pointer, so the sequential scan reads the heap — which is small,
because the inline part of each tuple is small — and does no chunk I/O at all. The cost
appears only in queries that select the wide column, and then it is a separate chunk read
per returned row, which is random I/O rather than sequential. This is the inverse of the
usual wide-table intuition and it is worth stating because it explains a common
contradiction: the same table is fast for one query and unusable for another, with no
difference in the schema. The trap it creates is that the team never notices, because the
query that avoids the column is the one that is fast. The measurement that settles it is
`EXPLAIN (ANALYZE, BUFFERS)` on both, looking at the `temp` and `read` counters, plus
`pg_column_size` on the column to confirm it is out of line.

**Q4. A row lock is stored in the line pointer, not the tuple header. Why, and what does it
cost?** `ADVANCED`

Because a lock needs a transaction id written somewhere, and there are two candidate places
with very different consequences. Writing it into the tuple header would modify the tuple,
which means the page is dirtied and — more importantly — it defeats the HOT-update fast
path, because a modified tuple can no longer be linked to from the old version's `t_ctid`
and the update becomes non-HOT, generating index entries on every index covering a changed
column. Instead, PostgreSQL expands the 4-byte line pointer in the page's slot array to 8
bytes and stores the locking transaction's xid directly there, which is a write to a region
of the page that is already being modified for the slot itself and leaves the tuple bytes
untouched. The cost falls on the slot array rather than the tuple, and the slot array grows
downward from `pd_upper` while tuples grow upward from `pd_lower`. That means a page can run
out of line-pointer space before it runs out of tuple space — which is the mechanism behind
the confusing errors you see on pages holding an unusually large number of very narrow rows.
The related multi-tenant case is `FOR SHARE` and `FOR KEY SHARE` by many sessions at once:
a single `xmax` holds one transaction id, so multiple compatible lockers are recorded as a
multi-transaction id, and vacuum must resolve all of them before the tuple can be removed —
which is a real cost on a table with an aggressive shared-lock pattern, and the reason
PostgreSQL's foreign-key checks take the weaker `FOR KEY SHARE` rather than `FOR UPDATE`.

#### Further Reading

- [PostgreSQL — Page Layout](https://www.postgresql.org/docs/current/storage-page-layout.html) — `PageHeaderData` field by field, the line pointer structure including the lock bits, and the special space.
- [PostgreSQL — TOAST](https://www.postgresql.org/docs/current/storage-toast.html) — the thresholds, the four storage modes, chunking, and the available compression methods.
- [PostgreSQL — Database File Layout](https://www.postgresql.org/docs/current/storage-file-layout.html) — the four forks, their filenames, and the relation and page numbering.
- [PostgreSQL — `pgstattuple` Extension](https://www.postgresql.org/docs/current/pgstattuple.html) — the exact bloat measurements, and the difference between the accurate and approximate variants.

> **CHAPTER 2 SUMMARY**
>
> A PostgreSQL page is 8 kB with a fixed 24-byte header, a slot array of 4-byte line
> pointers growing down, and tuples growing up from the bottom; a row that does not fit
> roughly 2 kB is compressed and then moved out of line into a TOAST relation, with the heap
> retaining only a pointer, which is why selecting the id from a table of huge documents is
> fast and selecting the document is not. Three properties explain nearly every storage
> surprise: tuples are identified by `ctid`, which is a location rather than an identity and
> changes on update; updates never move a tuple, so a row's steady-state cost is a function
> of the largest it ever was; and a row lock is stored in the line pointer precisely so that
> it does not dirty the tuple and forfeit the HOT-update fast path. A table is up to four
> forks, and the visibility map's `ALL_VISIBLE` bit is what makes an index-only scan pure
> until an update clears it. The measurement set is `pg_column_size` per column for shape,
> `pgstattuple` for the verdict, and the gap between `pg_relation_size` and
> `pg_total_relation_size` for the TOAST footprint.

## Chapter 3 — MVCC in Practice

Volume 5 introduced multi-version concurrency control theoretically: why it exists, what it
buys, and the anomalies it can and cannot prevent. This chapter is the implementation, and
the implementation is where the interesting facts live — because in PostgreSQL, MVCC is not a
feature layered on top of locking, it is the *entire* concurrency model, and several of its
consequences are things no other engine has.

### 3.1 The Tuple Header Is the Version

There is no separate version store. Every row on disk carries its own concurrency metadata
in its header, and "updating" a row means writing a second copy of it with different values
in those fields.

```text
  HeapTupleHeaderData — the first 23 bytes of every heap tuple, fixed
  ══════════════════════════════════════════════════════════════════════════
  t_xmin      4   inserting transaction id. Who created this version.
  t_xmax      4   deleting/updating transaction id. Who invalidated it.
                ALSO used to hold a row lock, and a multixact if several
                sessions hold compatible locks.
  t_cid       4   command id. Distinguishes statements within one transaction
                so a transaction does not see its own earlier effects.
  t_ctid      6   (block, offset) of the NEXT version. This is the version
                chain pointer, and it is what makes a chain walkable.
  t_infomask  2   flags: HEAP_XMIN_COMMITTED, HEAP_XMIN_INVALID,
                HEAP_XMAX_INVALID, HEAP_XMAX_IS_MULTI, HEAP_XMAX_LOCK_ONLY,
                HEAP_HOT_UPDATED, HEAP_ONLY_TUPLE, HEAP_XMIN_FROZEN …
  t_hoff      2   offset of the column data, after the header + null bitmap
                THIS IS WHY THE NULL BITMAP IS EXPENSIVE: a 1000-column table
                has a large t_hoff and every row pays for it.
  ══════════════════════════════════════════════════════════════════════════

  The infomask is the optimisation that makes the whole thing fast. Committing a
  transaction does not go back and touch every tuple it wrote — that would be
  O(rows) per COMMIT. Instead the commit is recorded once, in shared memory
  (PROC_CLOG), and the infomask bits are set LAZILY, the next time a page
  carrying those tuples is read or written. A hint bit. Its cost is a possible
  one-off write to a shared page the first time any backend touches it.
```

That lazy `xmin` commit hint is worth knowing for a practical reason: it is a *contention*
point. A very hot row or a very hot page is repeatedly re-marked by different backends, and
that is part of why update-heavy workloads on a small table show lock waits in `pg_locks`
that nobody can explain.

### 3.2 The Version Chain

An `UPDATE` does not modify a row. It writes a new row version, and the old version's
`t_ctid` is redirected to point at it. Chains form, and a read that lands on the wrong end of
a chain has to walk it.

```text
  ROW 42 — five versions deep, all on ONE page (a HOT update chain)

  ┌──────────────────────────┐  ctid (0,14)
  │ v1  xmin=100            │──▶ t_ctid ──┐
  │     xmax=105            │            │
  │     status='new'        │            │  dead: superseded
  └──────────────────────────┘            │
                                          ▼
                              ┌──────────────────────────┐  ctid (0,15)
                              │ v2  xmin=105            │──▶ t_ctid ──┐
                              │     xmax=110            │            │
                              │     status='new'        │            │
                              └──────────────────────────┘            │
                                                                   ▼
                                                   ┌──────────────────────────┐
                                                   │ v3  xmin=110            │──▶ ─ ─ ┐
                                                   │     xmax=118            │        │
                                                   │     status='active'     │        │
                                                   └──────────────────────────┘        │
                                                                                    ▼
                                                                    ┌──────────────────────────┐
                                                                    │ v4  xmin=118            │
                                                                    │     xmax=0  (no xmax)   │
                                                                    │     status='active'     │  ◀── LIVE
                                                                    └──────────────────────────┘

  A reader whose snapshot says xmin=100 is valid and xmax=105 is not yet
  committed follows t_ctid from v1 to v2 to v3 to v4. Four page reads for
  one logical row. The chain is walked in memory once the page is pinned,
  so it is not four I/Os — but it is real CPU, and on a high-update table
  the chains get long enough that the cost is visible in the plan.
```

The cost model for a read is therefore: *the number of versions between the one your
snapshot wants and the one that is current*. On a table updated frequently and read
infrequently, that number can be large. This is the specific mechanism behind "the table got
slow and nothing changed" — the same 200-byte row is fine at chain depth 1 and expensive at
depth 40.

### 3.3 The Visibility Rule

A tuple is visible to a snapshot when the snapshot's `xmin` horizon, its in-progress list,
and the tuple's own header agree. Stated precisely, and precisely enough to reason about
edge cases:

A tuple version is visible to a transaction if **all** of the following hold:

1. `xmin` is committed **and** `xmin` is not in the snapshot's in-progress list (`xip`), and
   `xmin` is below the snapshot's `xmax` horizon. If `xmin` is `FrozenTransactionId`
   (2), the tuple is unconditionally visible.
2. `xmax` is 0 (never deleted or updated), **or** `xmax` is in the snapshot's in-progress
   list (so the deleter has not finished), **or** `xmax` is above the snapshot's `xmax`
   horizon (so the deleter started after our snapshot), **or** `xmax` is committed *and*
   below the snapshot's `xmin` horizon (so the deleter finished before our snapshot began).

That third clause — "committed and below the horizon" — is the part that makes the whole
thing cheap. Because the horizon only advances past transactions that are known to have
finished, the common case of "was this deleter already done when I started?" does not need a
lookup; it is a single integer comparison. The `xip` list, the *in-progress* set, is the
exception and it is short, because only currently-running transactions are in it.

```sql
-- the three inputs, live
SELECT txid_current_snapshot() AS my_snapshot,
       pg_current_snapshot()  AS global_snapshot;

-- decode a snapshot's xmin/xmax/xip the way the visibility rule uses it
-- xmin: transactions older than this are all finished
-- xmax: no transaction with an id >= this was running when the snapshot was taken
-- xip: the ones between them that are still in progress and must be checked
SELECT * FROM txid_status(1200);   -- committed / in progress / aborted
```

### 3.4 The Global Horizon — the Most Important Operational Fact in the Volume

Every backend holds a snapshot, and each snapshot publishes a `backend_xmin` — the oldest
transaction that could still be relevant to it. PostgreSQL maintains a **cluster-wide
horizon**, the oldest such value, and that horizon is the oldest transaction in the entire
installation.

This is the fact that causes the most expensive class of production incident in PostgreSQL,
and it is worth being able to state in one sentence:

```text
  ONE LONG-RUNNING TRANSACTION PINS THE GLOBAL xmin HORIZON, AND THEREFORE
  PREVENTS EVERY VACUUM IN EVERY DATABASE IN THE CLUSTER FROM RECLAIMING
  ANYTHING.

       ┌──────────────────────────────────────────────────────────┐
       │   backend A: idle in transaction, 4 days old             │
       │   backend_xmin = 918,273                                │
       └───────────────────────────┬──────────────────────────────┘
                                   │
                                   ▼
              global xmin horizon = 918,273   (frozen in place)
                                   │
       ┌───────────────────────────┴──────────────────────────────┐
       ▼                           ▼                              ▼
  VACUUM in db1:          VACUUM in db2:              VACUUM in db3:
  "relfrozenxid = 918,273"  "relfrozenxid = 918,273"   "relfrozenxid = 918,273"
  cannot freeze anything     cannot freeze anything      cannot freeze anything
  cannot reclaim dead        cannot reclaim dead        cannot reclaim dead
  tuples in ANY table        tuples in ANY table        tuples in ANY table
       │                           │                              │
       └───────────────────────────┴──────────────────────────────┘
                                   │
                                   ▼
       dead tuples accumulate silently in tables nobody is working on
       visibility map goes stale → index-only scans degrade everywhere
       index entries accumulate → every index scan touches more pages
       disk usage climbs with no error, no alert, and no log line
                                   │
                                   ▼
                     eventually: ENOSPC, and the database stops
                     accepting writes. The pager fires.
```

The holder is almost never doing anything. It is a job that opened a transaction, ran one
statement, and then spent hours building a CSV; a test that never rolled back; a `psql`
session someone left open over lunch; a migration tool between batches; a reporting
connection that ran a query and then waited on a human to press a key. The query that finds
it is one of the highest-value queries in this volume:

```sql
-- WHO IS HOLDING THE HORIZON
SELECT pid, datname, usename, application_name, client_addr,
       state,
       now() - xact_start  AS xact_age,
       now() - state_change AS state_age,
       backend_xmin,
       left(query, 120) AS last_query
FROM pg_stat_activity
WHERE backend_xmin IS NOT NULL
ORDER BY xact_start;

-- the same thing, only the ones that are actually idle — the usual culprits
SELECT pid, datname, application_name, client_addr,
       now() - state_change AS idle_for, left(query, 100) AS query
FROM pg_stat_activity
WHERE state = 'idle in transaction'
ORDER BY state_change;
```

The preventive setting is `idle_in_transaction_session_timeout`, whose default is **0**, i.e.
off. Setting it to something like `5min` means the next such session kills itself instead of
pinning the cluster for a week. This is the single highest-value configuration change in
this chapter, and it is not close.

> **PRODUCTION SCENARIO**
>
> Problem: A reporting database's disk usage climbs 8 GB a week. No query is slow, no
> `EXPLAIN` output looks wrong, and there is nothing in the log. Nothing has been manually
> vacuumed in eight months.
> Investigation: `pg_stat_user_tables` shows `events` with 240 million live tuples, 61
> million dead tuples, and `last_autovacuum` of eleven days ago — despite autovacuum being
> enabled and running on schedule. `pg_stat_activity` filtered to `backend_xmin IS NOT NULL`
> shows exactly one row: an ETL service in state `idle in transaction`, `xact_start` four days
> old, `backend_xmin` set, its last query a `COPY` that finished long ago.
> Root cause: that one session holds the cluster's oldest snapshot, so the global `xmin`
> horizon is four days old, so no vacuum in any database can freeze a page or reclaim a dead
> tuple. Autovacuum has been running diligently and achieving nothing.
> Solution: terminate the session, set `idle_in_transaction_session_timeout = 5min` so the
> next one dies on its own, and run `VACUUM (ANALYZE)` on `events`. Note that disk usage
> will not come back — that requires `pg_repack` in a window, or an explicit decision to
> accept the size. Set `autovacuum_vacuum_scale_factor = 0.02` on `events` so the working
> set of dead tuples is an order of magnitude smaller in future.
> Prevention: alert on `max(age(datfrozenxid))`, alert on any `backend_xmin` older than ten
> minutes, alert on `n_dead_tup / n_live_tup > 0.2`, and put a rule in the runbook that any
> job spending more than a minute outside SQL must not hold a transaction open.

### 3.5 HOT Updates

A HOT (heap-only tuple) update is the case where the new version fits on the same page as
the old one. Because the tuple never leaves the page, no index needs a new entry — the old
index entries still point at the page, and a reader follows the chain. PostgreSQL requires
**both** of the following:

1. **No indexed column of the row changed.** If any index covers a modified column, the
   index needs a new entry and the update is necessarily non-HOT.
2. **There is free space on the page.** `fillfactor` reserves space for exactly this.

```text
  ┌───────────────────── PAGE 7 ─────────────────────┐
  │  ┌──────────────┐   ┌──────────────┐            │
  │  │ index entry  │   │ index entry  │   ← UNCHANGED
  │  │ (email)──────┼───┼──▶  block 7   │     with a
  │  └──────────────┘   └──────────────┘     HOT update
  │  ┌──────────────┐   ┌──────────────┐            │
  │  │ index entry  │   │ index entry  │            │
  │  │ (city)───────┼───┼──▶  block 7   │            │
  │  └──────────────┘   └──────────────┘            │
  │                                                    │
  │  ctid (7,10) v1 ──▶ ctid (7,11) v2   [ new rows  │
  │                               sit here, in the    │
  │                               reserved space ]     │
  └────────────────────────────────────────────────────┘

  HOT   : new version on same page, zero index writes, WAL is tiny,
          visibility map can be repainted, chain is pruned on VACUUM.
  NON-HOT: new version on another page, EVERY index covering a changed
          column gets a NEW entry, the old entries become dead, WAL
          carries a full new tuple, and the freed space is unusable
          until VACUUM.
```

```sql
-- reserve room so updates can stay on the page. 10-30% cost, in exchange for
-- HOT updates on any table that is updated rather than appended to.
ALTER TABLE events SET (fillfactor = 80);

-- is it working? this is the number to watch
SELECT relname, n_tup_upd, n_tup_hot_upd,
       round(100.0 * n_tup_hot_upd / nullif(n_tup_upd, 0), 1) AS hot_pct
FROM pg_stat_user_tables
WHERE n_tup_upd > 10000
ORDER BY hot_pct;
```

A low `hot_pct` on a frequently-updated table is diagnostic, and the two causes have
different fixes. If the updated columns are not indexed, the *space* condition is failing
and `fillfactor` is the fix. If an updated column **is** indexed — including a `tsvector`
column maintained by a trigger, which people forget — then no amount of `fillfactor` helps,
and the fix is a partial index excluding the churn, or a different schema. Also note the
trap: `ALTER TABLE ... SET (fillfactor = 70)` is metadata-only and does not rewrite
existing pages, so a table that is already full stays full until it is rewritten.

### 3.6 Multixacts and the Freeze Scan

When several sessions hold *compatible* locks on one tuple, `t_xmax` cannot hold several
transaction ids, so PostgreSQL writes a **multi-transaction id** and sets
`HEAP_XMAX_IS_MULTI`. Vacuum must then resolve every member before the tuple can be removed,
which is a real per-tuple cost on tables with heavy shared-locking patterns.

Separately, `xmin` values cannot be compared forever — the transaction id space is finite
(Chapter 9). So old tuples are **frozen**: their `xmin` is rewritten to
`FrozenTransactionId` (2), which is unconditionally visible to everyone and can never be
rolled back, making it safe to ignore. The freeze scan is how that advances, and it is
driven by `age(relfrozenxid)` against `autovacuum_freeze_max_age`. This is the mechanism
behind the 3am pager, and it is Chapter 9's subject.

#### Common Mistakes

- Believing the visibility rule needs a lookup per row, and not knowing that the `xmin`
  horizon is what makes it a single integer comparison
- Forgetting `t_cid` exists, and reasoning incorrectly about a transaction's visibility of
  its own effects
- Treating `VACUUM` as something that shrinks a table, rather than something that makes
  space reusable and advances the horizon
- Assuming a low `n_tup_hot_upd` ratio is always a `fillfactor` problem, when an indexed or
  trigger-maintained `tsvector` column is the more common cause
- Setting `fillfactor` on a table that is already full and concluding the setting "does not
  work" — it is metadata-only and applies to future page extensions
- Not knowing that `idle_in_transaction_session_timeout` defaults to **0**, and therefore
  that nothing in PostgreSQL stops a session from pinning the cluster's horizon indefinitely
- Treating the global horizon as a per-database property, so an incident in one database is
  misattributed to another

#### Interview Questions — MVCC & Visibility

**Q1. Explain PostgreSQL's visibility rule precisely enough to reason about an edge
case.** `ADVANCED`

A tuple version is visible to a snapshot when three of the tuple's header fields and three
of the snapshot's agree. The tuple contributes `xmin` (who created it), `xmax` (who deleted
or updated it, or zero), and the `x_ctid` chain pointer for following to a newer version. The
snapshot contributes `xmin` — the horizon, meaning every transaction id below it has
finished — `xmax`, the highest id running when the snapshot was taken, and `xip`, the list
of transactions between them that are still in progress. The rule for `xmin`: committed, not
in `xip`, and below the horizon; a `FrozenTransactionId` is unconditionally visible. The
rule for `xmax`: the tuple is visible if `xmax` is zero, or in `xip` (the deleter has not
finished), or at or above the snapshot's `xmax` (the deleter started after our snapshot), or
committed and below the horizon (the deleter finished before we started). The point that
makes it cheap is the last clause: because the horizon only advances past transactions known
to have finished, the common "was that deleter already done?" question is one integer
comparison, not a lookup. Only the `xip` exception requires a list walk, and that list is
short because it contains only currently-running transactions. The `x_ctid` pointer is what
makes a version chain walkable, and walking it is the cost mechanism: a read that lands on
a version several updates behind must traverse to the current one.

**Q2. What is `backend_xmin`, why does it exist, and what happens when it gets stuck?**
`STAFF`

`backend_xmin` is the oldest transaction id that a running backend's snapshot could still
need — the value it publishes so that vacuum can know how far back it is safe to go. Every
transaction has such a value, and PostgreSQL maintains a cluster-wide horizon as the minimum
across all of them. It exists because MVCC cannot reclaim a dead tuple until every snapshot
that might have seen it is finished: a tuple deleted by transaction 500 may still be visible
to a transaction that started at 400, so the tuple cannot be removed, and the freeze cannot
advance past 400, until that transaction ends. The "stuck" case is the expensive one. If any
session holds a transaction open, the horizon sits at that session's `xmin`, and *every*
vacuum in *every* database in the cluster becomes unable to reclaim anything or advance the
freeze. The consequences compound silently: dead tuples accumulate, the visibility map goes
stale so index-only scans start fetching, index bloat grows, and disk usage climbs with no
error anywhere. The holder is almost always idle — a job that ran one statement and is now
writing a file, a test that never rolled back, an open `psql` session. The diagnostic is
`pg_stat_activity WHERE backend_xmin IS NOT NULL ORDER BY xact_start`, and the fix is
`idle_in_transaction_session_timeout`, which defaults to 0 and is therefore the single
highest-value setting in this chapter.

**Q3. A table's `n_tup_hot_upd` is 2% of `n_tup_upd`. The updated column has no index. What
is wrong?** `TRICKY`

If the updated column genuinely has no index, then the HOT precondition about indexes is
satisfied, and the failing condition is space: the new version does not fit on the same page,
so the update goes non-HOT. The cause is that the table is at `fillfactor = 100`, so every
page is full and there is no room for a second version. The fix is
`ALTER TABLE ... SET (fillfactor = 80)` — but with the trap that it is metadata-only and
does not rewrite existing pages, so on a table that is already full it takes effect only as
pages are extended, meaning you also need a `VACUUM FULL` or `pg_repack` for the current
pages. Before concluding that, though, verify the premise, because "no index" is more often
believed than true: a unique index, a partial index whose predicate covers the column, an
expression index that references it, or a `tsvector` generated column maintained by a
trigger all count as indexed columns, and a trigger-maintained full-text column is the one
people miss. If one of those is present, `fillfactor` will not help at all and the fix is a
partial index excluding the churning rows, or moving the mutable text into a side table so
the hot table stops being updated. The verification order is: list every index on the table
and check which columns each one actually indexes, then set the `fillfactor`, then re-check
`n_tup_hot_upd / n_tup_upd` after a repack.

**Q4. Two transactions run under `REPEATABLE READ`. T1 reads a balance and then reads the
audit table; between the two reads, T2 commits a transfer that touched both. Can T1 see an
inconsistent state?** `STAFF`

Yes, and the precise term is **read skew**. `REPEATABLE READ` in PostgreSQL is snapshot
isolation: the transaction takes one snapshot at its first statement and every subsequent
read in that transaction sees the database exactly as of that instant. That is a strong
guarantee — no statement in the transaction ever sees a partially-committed change, and the
transaction never sees its own writes from before its snapshot — but the *snapshot itself* can
be inconsistent with respect to transactions that committed during it. T1's snapshot predates
T2's commit, so T1 sees neither the debit in `accounts` nor the corresponding entry in
`audit`, and the two reads together describe a world that never existed at any single
instant. The reason PostgreSQL allows this is that it is lock-based locking that prevents
read skew in the classic sense — gap locks or predicate locks held for the duration — and
PostgreSQL's `REPEATABLE READ` does not take them. The practical consequence is that a
`REPEATABLE READ` transaction is the *wrong* tool for a multi-table consistency check, which
is the intuition most people carry from other engines. The fixes, in order: perform the reads
at a single consistent grain in one pass, so there is no gap between them; or take the rows
being reconciled with `SELECT ... FOR UPDATE`, so nothing can change between the reads; or
use `SERIALIZABLE`, which detects the dangerous pattern and aborts one of the transactions at
commit, requiring a retry.

**Q5. A report returns totals that do not reconcile between two different aggregations, and
the discrepancy is not reproducible. Where do you look?** `ADVANCED`

Two candidate mechanisms, and the fact that the discrepancy is *not reproducible* is the
discriminator. A deterministic discrepancy points at a grain mismatch — the two queries
aggregate at different grains and one fans out through a join, which is a schema bug and
reproduces every time. An intermittent one points at MVCC read skew: the report runs inside
a `REPEATABLE READ` transaction, reads several tables in sequence, and the snapshot it holds
can be inconsistent with transactions that committed during the report's run, so the
per-region and per-day totals are drawn from different logical instants. The way to
confirm it is to look for a long-running transaction overlapping the report, and to compare
the report's `xact_start` against commits in the tables it reads. The fix is not to abandon
`REPEATABLE READ` — it is working correctly — but to remove the gap between the reads: do
the aggregation in a single pass over a single consistent grain, or reconcile inside a
transaction that holds `FOR UPDATE` locks on the rows being reconciled, or move to
`SERIALIZABLE` and retry. The operational connection worth drawing out loud is that the long
transaction causing the skew is very likely the same one starving vacuum, so the
inconsistency and the bloat have a common cause and one fix.

#### Further Reading

- [PostgreSQL — Concurrency Control](https://www.postgresql.org/docs/current/mvcc-intro.html) — the isolation levels as PostgreSQL implements them, and why `REPEATABLE READ` is snapshot isolation.
- [PostgreSQL — The System Catalog](https://www.postgresql.org/docs/current/catalog-pg-class.html) — `pg_class.relfrozenxid`, `relminmxid` and the age arithmetic behind the freeze.
- [PostgreSQL — `VACUUM` and the Free Space Map](https://www.postgresql.org/docs/current/routine-vacuuming.html) — why space becomes reusable without pages being compacted, and what the visibility map bits mean.
- [PostgreSQL — `pg_stat_activity`](https://www.postgresql.org/docs/current/monitoring-stats.html) — `backend_xmin`, `xact_start` and `state`, which together identify a horizon holder.

> **CHAPTER 3 SUMMARY**
>
> PostgreSQL has no separate version store: every row carries `t_xmin`, `t_xmax`, `t_cid`,
> `t_ctid` and `t_infomask`, and an `UPDATE` writes a new row version and redirects the old
> one's `t_ctid` at it, forming a version chain that a stale reader must walk. Visibility is
> a comparison against three snapshot inputs — the `xmin` horizon, the `xmax` boundary and
> the in-progress `xip` list — and it is cheap because the horizon only advances past
> transactions known to have finished, so the common case is one integer comparison.
> Committing does not touch the tuples it wrote; the infomask commit bit is set lazily on
> next page access, which is a hint-bit contention point rather than a correctness one. The
> single most important operational fact in the volume is that `backend_xmin` is
> cluster-wide: one session holding a transaction pins the global horizon and stops every
> vacuum in every database from reclaiming anything, silently, until the disk fills — and the
> holder is almost always `idle in transaction`, which is why
> `idle_in_transaction_session_timeout` defaulting to 0 is the highest-value setting here.
> HOT updates avoid all index writes but require both that no indexed column changed and that
> there is page space, and a low `n_tup_hot_upd` ratio usually means one of those two is
> failing rather than that vacuum is behind.

## Chapter 4 — Types, Extensions & JSONB

PostgreSQL's type system is not a set of column types; it is an extensible framework, and the
practical consequence is that a large fraction of what people think of as "PostgreSQL
features" are actually extensions. `jsonb` is built in but behaves like an extension in the
ways that matter. PostGIS, `pgvector`, `pg_trgm`, `hstore`, `citext` and `ltree` are
extensions. The question worth being able to answer is what that buys and what it cannot
touch.

### 4.1 The Core Type System

| Category | Types | Notes that matter in interviews |
| --- | --- | --- |
| Integer | `smallint`, `integer`, `bigint` | `bigint` is 8 bytes; no unsigned types, and no `int unsigned` overflow semantics |
| Exact numeric | `numeric` | Arbitrary precision, **never rounds** unless you use a scale; slower than float, stored in a variable-length binary format |
| Approximate | `real`, `double precision` | Binary floating point; cannot represent 0.1 exactly; wrong for money |
| Character | `char(n)`, `varchar(n)`, `text` | `text` and `varchar` are the same storage; length limits are *not* enforced by `varchar(n)` in the way people assume — it truncates or errors depending on context, and does not save space |
| Boolean | `boolean` | `TRUE`/`FALSE`/`NULL`; no separate "unknown" — `NULL` plays that role |
| Date/time | `date`, `time`, `timestamp`, `timestamptz`, `interval` | `timestamptz` stores an absolute instant; `timestamp` does not and is a silent bug |
| Enum | user-defined enum | Compact and self-documenting; append-only, cannot drop a value |
| Geometric | `point`, `line`, `box`, `path`, `polygon` | Rarely what you want; PostGIS is |
| Network | `cidr`, `inet`, `macaddr` | `cidr` normalises and masks; `inet` preserves host bits; containment operators |
| Bit | `bit(n)`, `varbit` | Rarely used; `varbit` for variable-length flags |
| UUID | `uuid` | 128-bit; `uuidv7()` is time-ordered and therefore a much better B-tree key than v4 |
| JSON | `json`, `jsonb` | Chapter below |
| Arrays | `T[]` | Multi-dimensional, arbitrary element types; no per-element constraints |
| Composite | `ROW`, user-defined | A struct; can be a table row type |
| Range | `int4range`, `tstzrange`, … | Built-in; powers `EXCLUDE` constraints |
| Domain | user-defined domain | A type with a base type and a `CHECK` |
| Full text | `tsvector`, `tsquery` | `tsvector` is usually a generated or trigger-maintained column |
| Money | `money` | Locale-dependent; do not use it |

Three of these deserve explicit treatment because they generate real incidents.

**`numeric` is exact and slow, and that is the correct trade more often than people
admit.** It is variable-width, so `numeric(18,4)` does not occupy 18 bytes; the width is
part of the value's encoding. Arithmetic is done in software. For a column where exactness
is a legal requirement, that is worth it. For a column where it is not, `bigint` in minor
units is both faster and exact. The rule is: `float8` is never correct for money, `numeric`
is correct and slow, `bigint` minor units is correct and fast, and `money` is locale-
dependent in both directions and should not be used.

**`timestamptz` versus `timestamp` is a correctness decision, not a style preference.** A
`timestamptz` is stored as a UTC microsecond count and rendered in the session's `TimeZone`
setting. A `timestamp` is stored as a wall-clock value with *no* zone, so the same stored
value denotes different instants for different readers, and nothing errors. If a business
timezone matters, store `timestamptz` plus a separate IANA zone-name column, because a
single instant rendered in a local zone is not the same as a local wall-clock time — the
classic 23:30 case.

**`uuid` generation strategy changes index behaviour.** `uuidv4()` is random, so new values
land anywhere in the B-tree and every insert is a random write across the index.
`uuidv7()` (PostgreSQL 18) is time-ordered, so inserts are effectively sequential and the
index stays dense. On a large insert-heavy table with a `uuid` primary key this is a
measurable write-amplification difference, and it is a version-specific capability worth
knowing the version of.

### 4.2 Arrays, Ranges, Enums, Composites and `hstore`

```sql
-- ARRAYS: no per-element constraints, no statistics per element for the planner,
-- and GIN is the only index that helps most operators
CREATE TABLE products (
  id     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tags   text[] NOT NULL DEFAULT '{}',
  sizes  int4range                     -- a real type, not two columns
);

-- RANGES are the interesting one: they make "no overlap" expressible
ALTER TABLE bookings ADD CONSTRAINT no_overlap
  EXCLUDE USING gist (room_id WITH =, during WITH &&);
-- needs btree_gist for the '=' on a scalar column:
CREATE EXTENSION IF NOT EXISTS btree_gist;
-- now "two bookings for room 12 that overlap" is impossible, for every writer,
-- with no application code involved and no SSI

-- ENUM: compact and self-documenting; append-only in practice
CREATE TYPE order_status AS ENUM ('new','paid','shipped','cancelled');
-- no DROP VALUE, no reordering. Retiring a state means new type + migration + swap.

-- COMPOSITE: a struct type, and optionally a table row type
CREATE TYPE address AS (line1 text, city text, country text);

-- HSTORE: key-value with indexed keys, the pre-JSONB answer
CREATE EXTENSION IF NOT EXISTS hstore;
```

The `EXCLUDE` example is the highest-value thing in this section, and it connects directly to
Chapter 8. A constraint that says "these ranges must not overlap" is enforced for every
writer, needs no retry loop, and cannot be violated by a code path nobody audited. A
transaction that checks for an overlap and then inserts is exactly the read-modify-write
pattern that requires `SERIALIZABLE` and a retry — and the constraint makes the retry
unnecessary. When someone proposes an isolation level, the first question should be whether
the invariant can be a constraint.

### 4.3 `json` vs `jsonb`

| | `json` | `jsonb` |
| --- | --- | --- |
| Stored as | Exact text you supplied | Decomposed binary form |
| Parsed | On every read | Once, on write |
| Key order | Preserved | Canonicalised — duplicate keys: last wins |
| Whitespace | Preserved | Removed |
| Comparison | Textual — `{"a":1,"b":2}` ≠ `{"b":2,"a":1}` | Structural |
| Indexable | No | Yes (GIN) |
| Cast to text | Direct | Must go through `text`: `col::jsonb::text` |
| Use when | You need the exact bytes | You intend to query it |

```sql
-- the cast asymmetry, which surprises people
SELECT '{"a":1}'::jsonb::json;          -- works, goes through text
-- there is no direct jsonb -> json cast; PostgreSQL will not do it implicitly
```

The trade-off in choosing `jsonb` is that the write path gets more expensive and the read
path gets much cheaper, and which side dominates is an empirical question about your
workload. A `jsonb` column that is only ever fetched whole — `SELECT payload FROM events`
— gets you nothing that a `text` column plus a few extracted columns would not give you,
except schema flexibility, and it costs binary parsing on write and full-document reads on
every access. A `jsonb` column that is *queried* — containment, key existence, path
extraction — is a different proposition entirely, and that is where the GIN index pays.

> **TRADE-OFF — WHEN IS `jsonb` THE RIGHT ANSWER?**
>
> `jsonb` is right when the shape is genuinely not yet known, the attributes are sparse and
> per-entity, and the read pattern is "fetch the document" plus occasional containment. It
> is a slow `SELECT *` in disguise when the attributes are queried by name across many rows,
> participate in joins, need a foreign key, or need a `NOT NULL` or `CHECK` — none of which
> `jsonb` provides without a trigger or a hand-written expression index. The frame that
> survives a design review: **flexibility is only valuable while you are still discovering
> the shape.** The expected lifecycle is that a `jsonb` column adopted for flexibility
> acquires a second query with a computed key, gets a GIN index to compensate, sees write
> throughput drop, and is then promoted to real columns. That is a healthy evolution. A team
> that treats `jsonb` as "we will never migrate" for two years has a blob with a query
> interface, and the migration is now harder than adding the columns would have been.

### 4.4 Querying `jsonb`, and the GIN Cost

```sql
-- the operators, and what each needs
--  ->   jsonb    : by key, returns jsonb
--  ->>  text     : by key, returns text
--  #>   jsonb[]  : by path
--  #>>  text[]   : by path
--  @>   <       : containment — the one `jsonb_path_ops` supports
--  <@   <       : reverse containment
--  ?    <       : key exists         ─┐ these three need the default
--  ?|   <       : any of these keys   │ `jsonb_ops` opclass
--  ?&   <       : all of these keys  ─┘
--  @@   tsquery  : full text match
--  jsonb_path_exists / jsonb_path_query : SQL/JSON path (v12+)

SELECT * FROM events WHERE payload @> '{"type":"purchase","currency":"EUR"}';
SELECT * FROM events WHERE payload ? 'user_id';
SELECT * FROM events WHERE jsonb_path_exists(payload, '$.items[*].sku');

-- an expression index is often far better than a GIN for a single key
CREATE INDEX ON events (((payload ->> 'user_id')::bigint));
```

The GIN index is the thing to cost carefully, because it is where the flexibility gets
paid for. A GIN over a wide `jsonb` is commonly 20–40% of the table's size. Every insert
adds an entry per distinct key. Every update of the document is a delete plus a re-insert of
all of them. GIN mitigates this with a pending list — keys go into a buffer and are merged
in batches, controlled by `gin_pending_list_limit` (default 4 MB) — which is why the write
amplification is not as bad as the structure implies, but is not free either. And repair
works differently: GIN bloat is cleaned by `REINDEX`, not by `VACUUM`.

There is also an opclass choice that people get wrong. `jsonb_path_ops` is significantly
smaller and faster, and it indexes *only* `@>` — so a query using `?` against a
`jsonb_path_ops` index gets a sequential scan, with no error and no warning. Write down
which operators the index is meant to serve when you create it.

### 4.5 Extensions: What They Can and Cannot Do

```sql
-- what is available
SELECT name, default_version, installed_version, comment
FROM pg_available_extensions
WHERE installed_version IS NOT NULL
   OR name IN ('postgis', 'pgvector', 'pg_trgm', 'hstore', 'btree_gist', 'pg_stat_statements')
ORDER BY installed_version NULLS LAST, name;
```

| An extension CAN | An extension CANNOT |
| --- | --- |
| Add a data type and its operators | Change the process model or connection semantics |
| Add an index access method with its own operators | Change MVCC, the visibility rule, or version chains |
| Add functions, aggregates, and casts | Change WAL, durability, or commit behaviour |
| Add a background worker, subject to `max_worker_processes` | Change how `SERIALIZABLE` detects conflicts |
| Provide a whole new language (`plpgsql`, `plpython3u`) | Bypass the `shared_preload_libraries` requirement for preload |

That right-hand column is the answer to "can an extension make PostgreSQL do X". If X
touches concurrency or durability, the answer is no, and any extension claiming otherwise is
either doing something much narrower than it appears to or is not safe. This is worth
saying plainly in an interview, because the extension ecosystem is genuinely powerful and
the instinct to over-credit it is common.

The version and privilege dimensions are separate and both matter. Since PostgreSQL 13,
extensions are **trusted** or **untrusted**: a trusted extension can be installed by any role
with `CREATE` on the database, because installing it cannot escalate privilege; an untrusted
one requires superuser, because its install script is arbitrary code. The list of trusted
extensions grows between major versions, so a migration blocked on insufficient privilege
may succeed after an upgrade with no permission change — and a pipeline that hard-fails on
that error is a pipeline whose behaviour changes under you at the next major version.

#### Common Mistakes

- Using `money` for a monetary column and discovering that output depends on `lc_monetary`
- Using `timestamp` where an instant is meant, and getting a silent correctness bug
- Building a GIN index with `jsonb_path_ops` and then writing a `?` query that falls back to
  a sequential scan with no warning
- Reaching for `SERIALIZABLE` when the invariant is expressible as an `EXCLUDE` constraint
- Treating an enum as mutable, then discovering values cannot be dropped or reordered
- Using `uuidv4()` as a clustered primary key and paying random-write amplification
- Believing an extension can change MVCC, WAL, or commit semantics
- Adding a column with `DEFAULT` to a large table in one statement and holding an
  `ACCESS EXCLUSIVE` lock for a table rewrite (Volume 2 and the Spring set cover the
  zero-downtime variants)

#### Interview Questions — Types & Extensions

**Q1. When would you use `jsonb` over real columns, and what does it cost?** `STAFF`

`jsonb` earns its place when the shape is genuinely not yet known, the attributes are sparse
and per-entity, and the read pattern is "fetch the document" plus occasional containment. It
loses to real columns when attributes are queried by name across many rows, participate in
joins, or need a foreign key, a `NOT NULL`, or a `CHECK` — because `jsonb` provides none of
those without a trigger or a hand-written expression index, and joins against `jsonb` keys
are unnests rather than hash joins. The costs that get under-counted are on the write path
and in the index: a GIN over a wide document is commonly 20–40% of the table, every insert
adds an entry per distinct key, every update is a delete plus a re-insert of all of them,
and a single-key query is usually better served by a small B-tree expression index on
`((col ->> 'key'))` than by a GIN over the whole document. The frame that decides it:
flexibility is only valuable while you are still discovering the shape, and the expected
lifecycle is promotion to real columns once a second query needs a computed key. A team
that treats `jsonb` as permanent has a blob with a query interface, and the eventual
migration is harder than adding the columns would have been.

**Q2. What can an extension do that the core engine cannot, and what can it never do?**
`ADVANCED`

The capability that matters is adding an *index access method* with its own operators and a
custom search structure — that is what PostGIS's GiST and SP-GiST indexes on geometry, and
`pgvector`'s HNSW and IVFFlat, actually are. An extension can also add types with their own
operators (PostGIS geometries, `hstore`, `ltree`), functions, aggregates, casts, procedural
languages, and background workers. What it can never do is touch the machinery underneath
concurrency and durability: it cannot change the process model or connection semantics, it
cannot change MVCC, the visibility rule, or how version chains work, it cannot change WAL or
commit behaviour, and it cannot change how `SERIALIZABLE` detects conflicts. Those are not
features the engine exposes — they *are* the engine. The reason this matters is that
"PostgreSQL can do X" is very often "an extension can do X", and the extension brings its
own upgrade cadence, its own trust level, and its own failure modes. Two practical
dimensions follow: since PostgreSQL 13 an extension is trusted (installable by any role with
`CREATE`) or untrusted (superuser required, because the install script is arbitrary code),
and the trusted list grows between major versions, so privilege-dependent behaviour changes
across upgrades.

**Q3. A team stores product attributes in `jsonb` and is about to add a GIN index. What
should you tell them?** `STAFF`

Three things, in order. First, which operators the index serves must be decided before it is
created, because the opclass determines whether it will be used at all. `jsonb_path_ops` is
materially smaller and faster and supports *only* `@>` containment; the key-existence
operators `?`, `?|` and `?&` need the default `jsonb_ops`. A `jsonb_path_ops` index with a
`?` query is a sequential scan with no error and no warning — the most common GIN mistake in
real schemas, and silent. Second, if the queries are single-key extractions, a B-tree
expression index on `((attrs ->> 'key'))` is smaller, faster, and cheaper to maintain than
any GIN, and a GIN should not be created for a workload GIN is bad at. Third, the write
cost, which is the one that decides it: every insert adds an entry per distinct key, every
update is a delete plus a re-insert of all of them, and while GIN's pending list
(`gin_pending_list_limit`, default 4 MB) batches the work, the steady-state write path is
permanently more expensive. If the churn is concentrated — say 2% of rows are actively
updated — a *partial* GIN index excluding them keeps the read benefit where the queries are
and removes the write cost where it is not, which is a much better answer than dropping the
index. And the frame from the section: this whole cost is the price of a bet that you do not
yet know the shape, and it is worth paying only while that bet is live.

**Q4. `EXCLUDE USING gist` versus `SERIALIZABLE` for "no two bookings overlap". Which do you
recommend, and what does it need?** `ADVANCED`

The constraint, without question. `ALTER TABLE bookings ADD CONSTRAINT no_overlap EXCLUDE
USING gist (room_id WITH =, during WITH &&)` states the invariant declaratively, is enforced
for every writer including ones nobody audited, cannot be bypassed by a code path that
forgets a check, and needs no retry loop and no isolation-level escalation. The alternative —
check for an overlap inside the transaction, then insert — is a textbook read-modify-write,
and under `SERIALIZABLE` it is exactly the rw-dependency pattern SSI detects, so it aborts
transactions at commit with `40001` and requires whole-transaction retries. The constraint
is faster, simpler, and has no failure mode. What it needs: `btree_gist` installed, because
the scalar equality on `room_id` needs a GiST operator class and GiST does not support
equality on ordinary scalars by itself. That is the one piece people miss, and the error
message on a missing extension is not always obvious about it. The remaining considerations
are operational rather than correctness: `EXCLUDE` constraints take locks when added, and
adding one to a large existing table needs `NOT VALID` plus a separate validation step, in
the same spirit as a foreign key. And the general principle worth stating: whenever someone
proposes raising the isolation level, the first question is whether the invariant can be a
constraint, because a constraint is strictly better than any isolation level for enforcing
it.

#### Further Reading

- [PostgreSQL — Data Types](https://www.postgresql.org/docs/current/datatype.html) — the full catalogue, with the storage size and behaviour of each.
- [PostgreSQL — JSON Types](https://www.postgresql.org/docs/current/datatype-json.html) — `json` versus `jsonb`, the container operators, and the SQL/JSON path functions.
- [PostgreSQL — Range Types](https://www.postgresql.org/docs/current/rangetypes.html) — the eight canonical operators and how ranges enable `EXCLUDE` constraints.
- [PostgreSQL — `CREATE EXTENSION`](https://www.postgresql.org/docs/current/sql-createextension.html) — trusted versus untrusted, the control file, and schema relocation.
- [PostgreSQL — GIN Indexes](https://www.postgresql.org/docs/current/gin.html) — the opclasses, the pending list, and `jsonb_path_ops` versus `jsonb_ops`.

> **CHAPTER 4 SUMMARY**
>
> PostgreSQL's type system is an extension framework, and most of what looks like built-in
> capability is a plugin: the process model, MVCC, WAL and commit semantics are the parts
> an extension cannot touch, and that boundary is the honest answer to "can it do X". The
> core types carry real decisions — `numeric` is exact and slow and is right for legal
> money, `money` is locale-dependent and should not be used, `timestamptz` and `timestamp`
> differ in whether an instant is stored at all, and `uuidv7()` is a time-ordered key
> where `uuidv4()` is a random-write machine. `jsonb` parses on write and stores binary,
> which makes querying it fast and writing it more expensive; the write cost is dominated by
> a GIN index that is commonly 20–40% of the table, and the opclass must be chosen to match
> the operators actually used or the index is silently unused. The highest-value item in the
> chapter is the range-type `EXCLUDE` constraint, because it is the general answer to "should
> we raise the isolation level?" — a declarative constraint beats serialisability for
> enforcing an invariant, needs no retry loop, and cannot be bypassed by an unaudited writer.

## Chapter 5 — SQL Feature Depth

Volume 3 covered the query language properly. This chapter is about the PostgreSQL-specific
depth — the features where this engine's dialect is meaningfully richer than the standard,
and where the version history matters enough that an answer without a version is wrong. The
CTE materialisation change is the clearest example in the whole set.

### 5.1 CTEs and the Version Boundary

The behaviour of non-recursive CTEs changed in **PostgreSQL 12**, and this is the single
most commonly mis-stated fact about the engine.

```text
  BEFORE PostgreSQL 12
  ────────────────────
  A non-recursive WITH clause is a MATERIALISED optimisation fence.
  The CTE is computed once, into a tuplestore, and every reference
  re-reads that store. The planner will not push a predicate from
  the outer query into the CTE, and will not convert the CTE into a
  subquery, view, or join. This is safe — it protects against
  volatile functions being evaluated more than once — but it means a
  CTE is often much more expensive than the equivalent subquery, and
  people write `WITH` believing it is purely a readability device.

  PostgreSQL 12 AND LATER
  ──────────────────────
  A non-recursive CTE with no side effects is INLINED by default:
  the planner substitutes the CTE's query into the referencing
  query, exactly as if you had written the subquery yourself.
  Predicates push down, join order is chosen globally, and the
  result is frequently far faster. The performance trap largely
  disappears.

  You can still force either behaviour explicitly:
      WITH x AS MATERIALIZED    (...)   -- the pre-12 behaviour
      WITH x AS NOT MATERIALIZED (...)   -- force inlining

  RECURSIVE CTEs ARE ALWAYS MATERIALISED, in every version. The
  working table is inherent to the algorithm, not an optimisation
  choice. This is worth stating because "CTEs are inlined now" is
  the answer people give without the exception.
```

So a candidate who says "PostgreSQL materialises CTEs" is describing version 11 and earlier.
A candidate who says "PostgreSQL inlines CTEs" is describing 12 and later but has forgotten
recursion. The strong answer names both and adds that `MATERIALIZED` remains available when
you *want* the fence — the case where a CTE genuinely should be computed once because
computing it repeatedly would be expensive or would call a volatile function repeatedly.

PostgreSQL 14 added `SEARCH` and `CYCLE` clauses, which turn a recursive CTE into a proper
hierarchy or graph walk:

```sql
WITH RECURSIVE tree AS (
    SELECT id, parent_id, name, ARRAY[id] AS path
    FROM   nodes WHERE parent_id IS NULL
  UNION ALL
    SELECT n.id, n.parent_id, n.name, t.path || n.id
    FROM   nodes n JOIN tree t ON n.parent_id = t.id
    WHERE  n.id <> ALL(t.path)         -- cycle guard
)
SEARCH DEPTH FIRST BY id SET order_seq
CYCLE id SET is_cycle USING path
SELECT * FROM tree;
```

### 5.2 `LATERAL`, `DISTINCT ON`, `FILTER`, and Generated Series

**`LATERAL` lets a subquery reference columns from rows to its left.** The practical form
almost everyone uses is top-N-per-group, which is far faster than the `ROW_NUMBER()` window
version because it only ever materialises N rows per group rather than ranking all of them:

```sql
-- top 3 recent orders per customer — the LATERAL form stops after 3 rows per group
SELECT c.id, o.*
FROM   customers c
CROSS  JOIN LATERAL (
    SELECT * FROM orders
    WHERE  customer_id = c.id
    ORDER  BY placed_at DESC
    LIMIT  3
) o;

-- the window-function form ranks everything, which is correct but does more work
SELECT * FROM (
    SELECT *, row_number() OVER (PARTITION BY customer_id ORDER BY placed_at DESC) rn
    FROM orders
) t WHERE rn <= 3;
```

**`DISTINCT ON` is the PostgreSQL-specific answer to "top per group"** and has one rule that
catches people: the `ORDER BY` must begin with the expressions in the `DISTINCT ON` list.

```sql
-- latest order per customer. This is valid.
SELECT DISTINCT ON (customer_id) customer_id, id, placed_at, total
FROM   orders
ORDER  BY customer_id, placed_at DESC;

-- This is an ERROR: "SELECT DISTINCT ON expressions must match initial
-- ORDER BY expressions" — ORDER BY starts with placed_at, not customer_id
-- ORDER BY placed_at DESC, customer_id
```

**`FILTER` makes aggregates conditional without a `CASE` wrapper**, which matters because
`SUM(CASE WHEN ... THEN 1 ELSE 0 END)` returns the same answer as
`COUNT(*) FILTER (WHERE ...)` but the `CASE` form cannot use a partial index and cannot skip
null-handling subtleties.

```sql
SELECT count(*)                                   AS total,
       count(*) FILTER (WHERE status = 'paid')    AS paid,
       count(*) FILTER (WHERE status = 'refunded') AS refunded
FROM   orders;
-- counts every row once, visits each row once, and the predicate is a real
-- qual rather than an expression the planner must evaluate against a value
```

**`generate_series` and `WITH ORDINALITY`** are the set-returning functions that show up in
real work far more than they get credit for — date ranges without a calendar table,
padding a result set, and numbering rows.

```sql
-- every day in a range, no calendar table needed
SELECT generate_series(date_trunc('day', now() - interval '30 days'),
                       date_trunc('day', now()), interval '1 day') AS d;

-- WITH ORDINALITY gives you a 1-based position
SELECT * FROM unnest(ARRAY['a','b','c']) WITH ORDINALITY AS t(val, n);
```

### 5.3 `ON CONFLICT`, `RETURNING`, `MERGE`, Generated Columns

```sql
-- UPSERT. The conflict target must match a unique index, and a partial index
-- requires its predicate to be repeated here.
INSERT INTO counters (key, n) VALUES ('clicks', 1)
ON CONFLICT (key) DO UPDATE SET n = counters.n + 1
RETURNING key, n;

-- ON CONFLICT on a PARTIAL index must repeat the index's predicate
INSERT INTO events (id, kind) VALUES (1, 'a')
ON CONFLICT (id) WHERE archived DO NOTHING;

-- RETURNING works on INSERT, UPDATE, DELETE, and MERGE — it is how you get the
-- generated identity or the computed value back without a second round trip
INSERT INTO orders (customer_id, total) VALUES (?, ?)
RETURNING id, created_at, total;

-- MERGE (PostgreSQL 15+). One statement for upsert, delete, and update.
-- IMPORTANT: MERGE is NOT atomic per source row when the source has rows that
-- match the same target row — "ON CONFLICT DO UPDATE command cannot affect
-- row a second time" is the equivalent ON CONFLICT trap.
MERGE INTO inventory i
USING shipment s ON i.sku = s.sku
WHEN MATCHED AND s.qty < i.on_hand THEN UPDATE SET on_hand = i.on_hand - s.qty
WHEN NOT MATCHED THEN INSERT (sku, on_hand) VALUES (s.sku, 0);

-- GENERATED ALWAYS AS ... STORED cannot be written to, and on a large table
-- adding one is a full rewrite under lock. PG18 adds VIRTUAL, computed on read.
ALTER TABLE products ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english', name || ' ' || description)) STORED;
```

The `MERGE` non-atomicity is worth stating precisely because it is a genuine footgun: if the
source relation contains two rows matching the same target row, the second one fails. This
was true of `ON CONFLICT DO UPDATE` first and remains true of `MERGE` for the same reason —
one target row cannot be updated twice by one statement.

### 5.4 SQL/JSON Path, `NULLS NOT DISTINCT`, and Other Sharp Edges

```sql
-- SQL/JSON path expressions (v12+), a genuinely different model from -> and @>
SELECT jsonb_path_exists(payload, '$.items[*] ? (@.qty > 10)'),
       jsonb_path_query(payload, '$.items[*].sku') AS skus
FROM   orders;

-- a UNIQUE constraint that treats NULLs as equal. Before v15, NULLs were
-- always distinct in a unique index, so you could not prevent duplicate
-- 'unknown' rows without a partial index or a COALESCE expression index.
ALTER TABLE subscriptions ADD CONSTRAINT one_active_per_user
  UNIQUE NULLS NOT DISTINCT (user_id, status);

-- the pre-15 equivalent, still the portable answer
CREATE UNIQUE INDEX one_active ON subscriptions (user_id, COALESCE(status, ''))
  WHERE status IS NOT NULL;
```

`NULLS NOT DISTINCT` is one of the cleaner version-specific wins: the workaround above
leaks a sentinel value into the index and needs a matching partial-index predicate, and the
constraint version needs neither. Again, say which version.

Other sharp edges worth knowing exist in this dialect: `GROUPING SETS`, `ROLLUP` and
`CUBE` for multi-level aggregation; `FILTER`; `arrays_agg` and `string_agg` with
`ORDER BY` *inside* the aggregate, which is the only way to get ordered aggregation in
PostgreSQL; and the fact that `UPDATE ... FROM` requires the target table to be mentioned in
the `FROM` clause as a self-join, with the notorious "the `FROM` item is a self-join and its
`WHERE` clause references the target table" error when the alias is wrong.

#### Common Mistakes

- Saying "PostgreSQL materialises CTEs" without a version, and forgetting that recursive
  CTEs are always materialised
- Forgetting that `DISTINCT ON` requires the `ORDER BY` to lead with the same expressions
- Writing `ON CONFLICT` against a partial unique index without repeating the predicate
- Using `MERGE` or `ON CONFLICT DO UPDATE` where the source has duplicate matches, and
  hitting "cannot affect row a second time"
- Adding a `GENERATED ALWAYS AS ... STORED` column to a large table in one migration and
  taking a full-rewrite lock
- Reaching for `SUM(CASE WHEN ...)` where `count(*) FILTER (WHERE ...)` visits each row once
  and is index-friendly
- Assuming a unique index prevents duplicate NULLs, which it did not until version 15
- Reaching for the `LATERAL` top-N form and then adding a `Materialize` node by accident
  through a correlated subquery in the `WHERE` clause

#### Interview Questions — SQL Feature Depth

**Q1. Are CTEs materialised in PostgreSQL? Walk me through the version history.** `ADVANCED`

It depends on the version, and the version is the answer. Before PostgreSQL 12, a
non-recursive `WITH` clause was a materialisation fence: the CTE was computed once into a
tuplestore and every reference re-read it, the planner would not push a predicate from the
outer query into it, and it would not be converted into a subquery or a join. That was safe
— it protected against a volatile function being evaluated more than once — but it made CTEs
much more expensive than the equivalent subquery, and it is the reason so much folklore
exists about CTEs being slow. From PostgreSQL 12 onward, a non-recursive CTE with no side
effects is inlined by default: the planner substitutes it into the referencing query as
though you had written the subquery, so predicates push down and join order is chosen
globally. The exception that has to be stated is that **recursive CTEs are always
materialised**, in every version, because the working table is inherent to the algorithm. And
the escape hatch is still there in both directions: `WITH x AS MATERIALIZED (...)` restores
the old behaviour and `WITH x AS NOT MATERIALIZED (...)` forces inlining, which is the tool
when a CTE genuinely must be computed once or contains a volatile function.

**Q2. `DISTINCT ON` gives an error. What are the possible causes?** `TRICKY`

The overwhelmingly common one is the ordering rule: the expressions in the `DISTINCT ON`
list must match the *initial* `ORDER BY` expressions. `SELECT DISTINCT ON (customer_id) ...
ORDER BY customer_id, placed_at DESC` is valid because `ORDER BY` starts with `customer_id`;
the same query with `ORDER BY placed_at DESC, customer_id` fails, because the sort order no
longer groups by the thing being deduplicated. The fix is to reorder the `ORDER BY` — the
`DISTINCT ON` columns first, then the tiebreaker. The other causes are rarer: duplicate
output column names in a query that uses `DISTINCT`; a `DISTINCT ON` expression list that
does not match the actual query semantics, producing a result that looks right and is not,
which is the dangerous version because it does not error at all; and type mismatches where
the `DISTINCT ON` expression and the `ORDER BY` expression are not the same type. The
practical note is that `DISTINCT ON` is very often the wrong tool — it is non-standard,
picking an arbitrary row among ties that happen to match the `ORDER BY`, and for "top N per
group" the `LATERAL` form or a `row_number()` window is usually clearer and often faster
because it stops reading after N rows per group instead of sorting everything.

**Q3. A `MERGE` statement is failing with "ON CONFLICT DO UPDATE command cannot affect row
a second time". What is happening?** `STAFF`

The source relation contains two or more rows that match the same target row. `MERGE` (and
`ON CONFLICT DO UPDATE`, which shares the constraint) processes source rows one at a time
against the target, and a single target row cannot be updated twice within one statement —
the first update makes the row no longer match the join condition in a way the statement can
reason about, or more precisely the statement's semantics do not permit applying two updates
to the same row. This is not a PostgreSQL bug; it is a statement about what the operation
means. The real problem is upstream: the source has duplicates. The usual sources are a join
that fans out — joining a target to a source through a one-to-many relationship, so one
target row matches three source rows — or a source that is not deduplicated. The fixes are
to aggregate the source first (`GROUP BY` the join key and combine with `sum`, `max`, or
whatever the intent is), to deduplicate it with `DISTINCT ON`, or to restructure so the
statement is not doing a one-to-many merge. The design point: `MERGE` is genuinely good for
upsert and for a small number of well-understood cases, and it becomes ambiguous exactly
where a fan-out exists, so the fan-out should be handled in the source relation where it is
visible rather than discovered as an error inside the merge.

**Q4. Adding a `jsonb` column to a 200-million-row table. What are the choices and their
costs?** `ADVANCED`

The cost depends almost entirely on whether the column is nullable with no default, and
whether you backfill. `ALTER TABLE t ADD COLUMN c jsonb` with no `DEFAULT` is a catalog-only
change: PostgreSQL stores the absence of the value in the null bitmap of existing rows rather
than rewriting them, so it is fast on a large table and takes only a brief
`ACCESS EXCLUSIVE` lock. Adding a `DEFAULT` is the dangerous version on older releases,
because a non-volatile `DEFAULT` was implemented as a full table rewrite under lock; the
modern approach is to add the column nullable, backfill in bounded batches, and then — if a
default is genuinely needed — set it, which since PostgreSQL 11 avoids the rewrite for a
non-volatile expression. The backfill is where the real cost hides, and it is Chapter 3's
problem: a single `UPDATE` of 200 million rows is one enormous transaction that holds the
vacuum horizon for its entire duration, which starves autovacuum for the whole cluster while
it runs. So the backfill must be batched — thousands to low millions of rows per
transaction, with a commit between batches — and that in turn means the table is
temporarily in a state where some rows have the value and some do not, so any code reading
it must tolerate both, or the deployment has to be ordered behind the backfill. The
staff-level observation: a schema change that is one statement in the pull request is
frequently a multi-hour operational project, and the review question is "what locks does this
take and for how long" rather than "is the syntax correct".

**Q5. `NULLS NOT DISTINCT` on a unique constraint. Why does it exist and what did people do
before?** `TRICKY`

Because SQL's `NULL` semantics mean a unique index traditionally treats `NULL`s as
*distinct*, so it cannot prevent duplicate "unknown" values — a table with a
`UNIQUE (user_id, status)` will happily hold two rows where `status IS NULL` for the same
user, because `NULL` is not equal to `NULL`. That is correct SQL and useless for the actual
business rule, which is "one active subscription per user, where missing status counts as
inactive". Before PostgreSQL 15 the workarounds were an expression index on
`COALESCE(status, '')` — which requires inventing a sentinel value that then leaks into
every query against the index, and which needs a matching `WHERE status IS NOT NULL`
predicate on any partial index built over it — or a `CHECK` constraint, or simply an
application-level guarantee that nothing checks. `UNIQUE NULLS NOT DISTINCT` (PostgreSQL 15)
states the intent directly, needs no sentinel, and works with partial indexes without a
predicate. The version matters because the behaviour genuinely changed, and a migration
written for 14 that relies on the `COALESCE` idiom still works on 15+ but is now carrying a
sentinel that no longer needs to exist. The general principle: SQL's three-valued logic is
correct and routinely inconvenient, and the versions where an engine grows a way to opt out
of the inconvenience are worth tracking, because the workaround you already have is often
still in the schema after the fix has shipped.

#### Further Reading

- [PostgreSQL — `WITH` Queries](https://www.postgresql.org/docs/current/queries-with.html) — common table expressions, `MATERIALIZED`, recursion, and the `SEARCH`/`CYCLE` clauses.
- [PostgreSQL — `SELECT` Reference](https://www.postgresql.org/docs/current/sql-select.html) — `DISTINCT ON`, the ordering rule, and the locking clause forms.
- [PostgreSQL — `INSERT`](https://www.postgresql.org/docs/current/sql-insert.html) — `ON CONFLICT`, conflict-target inference, partial-index predicates, and `RETURNING`.
- [PostgreSQL — `MERGE`](https://www.postgresql.org/docs/current/sql-merge.html) — the `WHEN MATCHED` / `WHEN NOT MATCHED` forms and the per-source-row non-atomicity.
- [PostgreSQL — JSON Functions and Operators](https://www.postgresql.org/docs/current/functions-json.html) — the path language, `jsonb_path_exists`, and `jsonb_path_query`.

> **CHAPTER 5 SUMMARY**
>
> The dialect depth worth owning is where behaviour is version-specific or where the
> engine offers something the standard does not. The headline is CTEs: inlined by default
> from PostgreSQL 12, materialised as a fence before it, always materialised when recursive,
> and overridable in both directions with `MATERIALIZED` / `NOT MATERIALIZED`.
> `DISTINCT ON` gives non-standard top-per-group at the cost of an ordering rule that errors
> when the `ORDER BY` does not lead with the `DISTINCT ON` expressions. `ON CONFLICT` and
> `MERGE` both fail with "cannot affect row a second time" when the source fans out, which
> is a statement about the source rather than a bug. `NULLS NOT DISTINCT` (15) and `VIRTUAL`
> generated columns (18) are cases where the engine grew a way out of a real SQL
> inconvenience, and the workarounds people built for the older behaviour usually remain in
> the schema afterwards. And the operational point that catches people: adding a column to a
> large table is fast when nullable with no default and a project when backfilled, because
> an unbatched backfill is a single transaction that holds the vacuum horizon for the entire
> cluster.

## Chapter 6 — Indexes & Indexing

Volume 4 owns the B+ tree, the page split, the leftmost-prefix rule, and index types in
general. This chapter is the PostgreSQL-specific surface: the six access methods, what each
is actually good at, and the three index options — partial, expression, and covering — that
have no direct equivalent elsewhere. The decision that matters most here is not "which index"
but "which access method", because PostgreSQL's access methods are genuinely different
structures with genuinely different failure modes.

### 6.1 The Six Access Methods

| AM | Structure | Best for | Notable properties |
| --- | --- | --- | --- |
| **B-tree** | balanced tree, ordered | equality and range on scalar types | The default; supports multicolumn, partial, expression, `INCLUDE` |
| **Hash** | hash table | equality *only*, and only on `=` | Smaller and sometimes faster than B-tree for pure equality; no range, no ordering |
| **GIN** | inverted index, posting lists + a pending list | containment (`@>`, `?`), full text, arrays, `jsonb` | Slow to build, expensive to write, lossy-free; opclass choice is critical |
| **GiST** | a *lossy* search structure over a common extensible interface | geometry, ranges, nearest-neighbour, `EXCLUDE` | Lossy: stores signatures, re-checks candidates; can do KNN and `EXCLUDE` |
| **SP-GiST** | space-partitioning: disjoint regions, one per node | non-balanced structures: IP prefixes, `inet`, `point`, text prefixes | Useful for prefix-like data; more specialised |
| **BRIN** | a small summary per *range of heap pages* | very large tables, data physically correlated with insertion order | Tiny, nearly free to maintain; degrades to a scan when correlation is absent |

Three of these deserve a paragraph each, because they are the ones candidates misdescribe.

**GIN is a posting-list index and its cost is on the write path.** Every value that must be
findable gets an entry; for a document with fifty keys, an insert adds fifty entries, and an
update is a delete plus fifty inserts. PostgreSQL mitigates this with a **pending list**:
new entries go into a small buffer and are flushed into the main structure in batches, so
the cost is amortised and the structure stays append-mostly. The dial is
`gin_pending_list_limit` (default 4 MB), and a persistently non-empty pending list — visible
via `pgstatindex()`'s `pending_list_pages` and `avg_pending_pages` — is a signal that writes
are outpacing the merges. Bloat in a GIN index is repaired by `REINDEX`, not `VACUUM`.

**GiST is lossy, and that is a feature, not a defect.** A GiST index stores a *signature* of
each entry — for a geometry, a bounding box; for a range, a summarising interval — and a
search returns candidates whose signature *might* match, after which the index's `consistent`
function re-checks each one exactly. This is what allows GiST to support arbitrary types
without knowing anything about them, and it is also why GiST index-only scans do not exist:
a lossy index cannot answer a query on its own. The two capabilities that only GiST has in
PostgreSQL are **KNN** (`ORDER BY geom <-> point`, nearest-neighbour without an
approximate structure) and **`EXCLUDE` constraints**.

**BRIN summarises blocks rather than indexing rows**, and its whole design assumes physical
correlation:

```text
  BRIN ON readings (recorded_at)  WITH (pages_per_range = 32)

  A 64 GB table at 8 kB/page = ~8.4 million pages.
  pages_per_range=32  →  ~262,000 summary entries  →  a few MB of index.
  A B-tree on the same column would be tens of percent of the table's own size
  and would need an entry written on every single INSERT.

  The summaries look like:
  ┌──────────────┬──────────────────────────────────────────────┐
  │ block range  │ min recorded_at        max recorded_at      │
  ├──────────────┼──────────────────────────────────────────────┤
  │ pages 1-32   │ 2026-01-01T00:00:00Z    2026-01-01T00:04:12Z │
  │ pages 33-64  │ 2026-01-01T00:04:12Z    2026-01-01T00:08:41Z │
  │ ...          │ ...                    ...                  │
  │ pages 8.39M- │ 2026-02-28T23:55:03Z    2026-02-28T23:59:59Z │
  │     8.39M+32 │                                              │
  └──────────────┴──────────────────────────────────────────────┘

  "last hour"  →  the last few hundred ranges. Everything older is
                  excluded by summary without being read. THAT is the win.

  IF THE CORRELATION IS BROKEN — an UPDATE that moves rows, a
  pg_repack that rewrites the file in a new order, a restore that
  scrambles physical order — every range's min/max now spans the
  whole value domain, every range "might match", and the index
  silently stops excluding anything. The plan still shows a Bitmap
  Heap Scan; it just reads the whole table. There is no error.

  pages_per_range: default 128 (~1 MB of heap at 8 kB pages). Lower it for
  finer granularity and a larger index; raise it for a smaller index and
  coarser exclusion.
```

### 6.2 Partial, Expression, and Covering Indexes

**Partial indexes** are the most under-used feature in the set, and they do double duty: they
save space, and they can enforce a conditional uniqueness constraint that a plain `UNIQUE`
cannot express (because the predicate has to be repeated in `ON CONFLICT`).

```sql
-- only 2% of orders are open; the index covers 2% of the rows
CREATE INDEX ON orders (customer_id, placed_at DESC) WHERE status = 'open';

-- a partial UNIQUE is a constraint no plain UNIQUE can express
CREATE UNIQUE INDEX one_open_per_customer ON orders (customer_id)
  WHERE status = 'open';
```

The failure mode is worth naming because it is silent: a partial index encodes an assumption
about *selectivity*, not just about a predicate, and selectivity is the thing a growing
business changes without telling you. A partial index built when the predicate matched 2% of
rows and matching 71% today is still correct and is now worse than useless — it feeds its
own size into the planner's cost estimate, so the planner may choose an index scan that
fetches most of the table in random order over a sequential scan that would read it in
order.

**Expression indexes** must match the query expression *exactly*, which is stricter than
people expect:

```sql
CREATE INDEX ON users (lower(email));
-- usable by:  WHERE lower(email) = $1
-- NOT by:      WHERE email ILIKE $1
-- NOT by:      WHERE email = lower($1)
```

**Covering indexes** (`INCLUDE`, PostgreSQL 11+) add non-key columns to leaf tuples so an
index-only scan can answer the query without visiting the heap. Two constraints on the idea
are worth knowing: the included columns cannot be used in the index predicate or ordering —
they are payload, not key — and the purity of the resulting index-only scan depends on the
visibility map, so it degrades silently under updates and it is restored by `VACUUM`.

```sql
CREATE INDEX ON orders (customer_id, placed_at DESC) INCLUDE (total, status);
-- index-only scan possible, subject to ALL_VISIBLE on every page in range
```

### 6.3 Multicolumn Column Order

The rule is leftmost prefix, and it is the rule Volume 4 owns. What is PostgreSQL-specific
is *how* to apply it, and the mistake is nearly always the same: putting the equality column
second because it "feels less important". The planner uses a B-tree in equality-first order,
so:

```sql
-- good: equality column leads, range/ordering column second
CREATE INDEX ON orders (status, placed_at DESC);
-- serves: WHERE status = 'open' ORDER BY placed_at DESC LIMIT 20   ← perfect
--         WHERE status = 'open'                                  ← perfect
--         ORDER BY placed_at DESC                                 ← index only, no status filter

-- bad: the range column leads, so the equality cannot be used for a seek
CREATE INDEX ON orders (placed_at DESC, status);
-- serves: WHERE status = 'open'                                  ← full index scan
```

The pattern that pays most often is therefore *equality columns first, then one range or
ordering column, and nothing else*. A third column in a multicolumn B-tree index is almost
never worth it, because the leftmost-prefix rule means it only helps queries that constrain
both leading columns.

### 6.4 Choosing Between GIN, GiST and BRIN

The decision procedure, stated as a procedure:

1. **Is the column's physical order correlated with its value?** If yes and the table is
   large — append-only, time-series, monotonically increasing key — use **BRIN**. This is
   the highest-leverage and least obvious answer, and the cost is a few MB instead of tens of
   percent of the table.
2. **Is the query a containment or membership test** — `@>`, `?`, `?|`, `?&`, `@@`, array
   overlap, trigram match? Use **GIN**, with the opclass chosen to match the operators
   actually used.
3. **Is the type spatial, range-like, or does the query need nearest-neighbour or an
   `EXCLUDE` constraint?** Use **GiST**.
4. **Is the data prefix-structured** — IP prefixes, hierarchical text, points? Consider
   **SP-GiST**.
5. **Everything else**: **B-tree**, and consider whether a partial or expression version is
   what you actually wanted.

The three non-B-tree failure modes, because knowing them is most of the value: a GIN built
with the wrong opclass is silently unused; a BRIN over data with broken physical correlation
is silently useless; and a covering index over an update-heavy table silently stops being
covering as the visibility map goes stale.

#### Common Mistakes

- Creating a `jsonb_path_ops` GIN and then querying with `?`, which never uses it
- Using BRIN on a table that is updated or repacked, losing the physical correlation without
  any error
- Putting a range column before an equality column in a multicolumn B-tree, which forfeits the
  seek
- Expecting a covering index to stay covering under updates, and not correlating `Heap
  Fetches` with vacuum health
- Assuming a partial index keeps its performance as the predicate's selectivity changes
- Writing `WHERE email ILIKE $1` and wondering why the `lower(email)` index is unused
- Expecting an index-only scan to work on a GiST index — GiST is lossy and cannot answer
  alone
- Adding a third column to a multicolumn B-tree index, which almost never pays for itself

#### Interview Questions — Indexes & Indexing

**Q1. You have a 64 GB append-only table of sensor readings with a monotonically increasing
`recorded_at`. What index, and why not a B-tree?** `STAFF`

A BRIN index on `recorded_at`, because an append-only table is physically filled in
insertion order, so `recorded_at` is strongly correlated with physical position — and BRIN
is built precisely on that assumption. It stores one min/max summary per range of heap pages;
at the default `pages_per_range` of 128, which is about 1 MB of heap per range, a 64 GB
table needs roughly 8,000 summaries and a few megabytes of index, against a B-tree on the
same column that is a significant fraction of the table's own size and that needs an entry
written on every single insert. The read path is where the win shows: a `recorded_at`
predicate over the last hour touches a contiguous tail of the heap, so BRIN's summaries let
the planner exclude everything older without reading it, and the plan shows a Bitmap Heap
Scan over a small fraction of the table. `pages_per_range` is the dial — lower for finer
exclusion and a larger index, higher for the reverse. The honest caveat, which belongs in the
answer: BRIN degrades *silently* to a scan if the correlation is ever broken — by an
`UPDATE` that moves rows, a `pg_repack` that rewrites the file in a new order, or a restore
that scrambles physical order — because every range's min/max then spans the whole value
domain and nothing is excluded. There is no error; the plan still says Bitmap Heap Scan. So
BRIN is correct only while the append-only property holds, and a runbook note and a metric
on update rate belong with the index.

**Q2. When is a GiST index better than a GIN index?** `STAFF`

They are not really comparable, because they solve different problems, and reaching for the
wrong one is the common error. GiST is the right choice when the type is **spatial,
range-like, or hierarchical**, and there are two things it can do that nothing else in
PostgreSQL can: **nearest-neighbour** ordering (`ORDER BY geom <-> point`, which returns rows
in distance order without an approximate structure and without a full sort), and
**`EXCLUDE` constraints**, which is how you make "no two bookings overlap" or "one active
subscription per user" a declarative invariant enforced for every writer. GIN is the right
choice for **membership and containment** — `@>`, `?`, `?|`, `?&`, `@@` on `jsonb`, array
overlap, trigram matching — because it is an inverted index with posting lists and gives
exact answers for set-style predicates. The structural difference that explains the
performance difference: GiST is *lossy*, storing a signature per entry (a bounding box for a
geometry, a summarising interval for a range) and re-checking candidates exactly, which is
what makes it extensible to arbitrary types and why it cannot do index-only scans; GIN is
not lossy, which makes it exact and larger and slower to write. So: containment → GIN,
geometry and ranges and KNN and `EXCLUDE` → GiST, prefix-structured data → SP-GiST,
physically-correlated huge tables → BRIN, everything else → B-tree.

**Q3. A query's plan shows an index-only scan with `Heap Fetches: 0`. Three months later it
shows `Heap Fetches: 2.4M` and the query is slower. Nothing changed. What is going on?**
`STAFF`

The visibility map. An index-only scan is only pure when every heap page in the range it
touches has `ALL_VISIBLE` set, which means no concurrent transaction could need an older
row version from that page. `VACUUM` sets those bits; **any update to any row on the page
clears them**. So the table got hot, `VACUUM` has not run since — or, more likely, cannot
run because a long transaction holds the cluster's oldest snapshot, which is Chapter 3's
horizon problem — the bits went stale, and every index-only scan in that range now has to
fetch the heap to confirm visibility. The confirmation is in the plan itself: the node still
says `Index Only Scan`, and `Buffers` shows index pages touched with a large `Heap Fetches`
count. If the node had changed to `Index Scan` instead, the cause would be different — a
query change adding a column the index does not contain. The fix is to restore the
invariant, not to change the index: find the `backend_xmin` holder, and if nothing is
blocking, check whether autovacuum is keeping up on that table given the 0.20 scale factor
on its size. Adding more columns to the `INCLUDE` list will not help at all. The design
point worth raising: on a table with steady updates a covering index's value decays toward
zero, which is a real argument for partitioning hot from cold data so the covering index
stays dense on the read-mostly partition, or for accepting that the hot path is an index
scan and reserving covering indexes for read-mostly tables.

**Q4. A team has 40 indexes on an 8-million-row table with a light write path. How do you
decide what to drop?** `STAFF`

Measure first, argue second. `pg_stat_user_indexes.idx_scan` over a long enough window is
the primary evidence, and an index with zero or near-zero scans is the strongest removal
candidate — with the caveat that a low count may mean the index serves a rare but critical
query, so the window matters and the answer should be a query to the team rather than a
delete. The mechanical wins come first: duplicate indexes (same columns, same predicate,
different name) are pure waste, and there is a standard query to find them. Then overlapping
indexes — a `(a)` alongside a `(a, b)` where every query using the second could use the
first with one extra heap fetch, or the reverse — and the judgement about which direction to
go. Then the biggest win usually available: indexes that a **partial** version could replace.
A full index on a table where 98% of rows are archived and no query ever filters on them
should be a partial index on the other 2%, which is smaller, cheaper to write, and faster.
And there is a cost side people forget, because they count indexes as free: every `INSERT`
pays a B-tree descent per index, a `UPDATE` on a changed column adds entries to every index
covering it, every vacuum scans all 40 indexes for dead entries, and a non-HOT update on a
wide table can require a new heap page. Then the organisational point, which is the staff
part of the answer: index debt accumulates because adding an index is a one-line change with
an immediate measurable benefit while removing one has no immediate symptom. The durable fix
is a recurring review with a named owner and a rule that an index added in a ticket must
state the query it serves, because otherwise nobody can defend it at deletion time.

**Q5. When is a covering index worth it, and when does it become a liability?** `TRICKY`

It is worth it when a query is frequent, reads a small set of rows, and needs columns that
are not in the key — that combination is exactly what `INCLUDE` is for, because the planner
can then satisfy the query entirely from the index and skip the heap. It becomes a liability
in three specific ways, and all three are worth naming. First, **write amplification**: the
included columns are stored in every leaf entry, so a wide included list makes the index
large and every insert more expensive, and `INCLUDE` columns are not deduplicated the way
key columns are. Second, and more subtly, the index is only a *covering* index when the
visibility map allows it, and updates clear those bits — so on an update-heavy table its
value decays over time toward zero while its cost stays constant, which is the worst possible
ratio. Third, **it tempts a design error**: including every column a query might want turns
the index into a second copy of the table, and the right answer to "the query needs six
columns" is often to fix the query. The rules that follow from that: use covering indexes on
read-mostly tables, keep the `INCLUDE` list to what is actually needed and as narrow as
possible, put the filtering and ordering columns in the key rather than the include list
(where they can be used for seeks), and monitor `Heap Fetches` in the plan as the health
metric — if it is climbing, the covering index has stopped covering and the write cost is
being paid for nothing.

#### Further Reading

- [PostgreSQL — Index Types](https://www.postgresql.org/docs/current/indexes-types.html) — B-tree, hash, GiST, SP-GiST, GIN and BRIN, with the operator classes each supports.
- [PostgreSQL — `CREATE INDEX`](https://www.postgresql.org/docs/current/sql-createindex.html) — partial, expression, `INCLUDE`, `CONCURRENTLY`, and the storage parameters per access method.
- [PostgreSQL — BRIN Indexes](https://www.postgresql.org/docs/current/brin.html) — `pages_per_range`, `autosummarize`, and the summarisation types.
- [PostgreSQL — GIN Indexes](https://www.postgresql.org/docs/current/gin.html) — opclasses, the pending list, `fastupdate`, and `jsonb_path_ops` versus `jsonb_ops`.
- [PostgreSQL — GiST Indexes](https://www.postgresql.org/docs/current/gist.html) — the `consistent` interface, lossy re-checking, and KNN ordering.

> **CHAPTER 6 SUMMARY**
>
> PostgreSQL ships six index access methods and choosing between them is a bigger lever
> than choosing columns. B-tree is the default and answers equality and range; hash is
> equality only; GIN is an inverted index for containment and membership, exact but large
> and expensive to write, with a pending list to amortise the cost and a repair that
> requires `REINDEX` rather than `VACUUM`; GiST is a lossy signature index that is the only
> way to get nearest-neighbour ordering and `EXCLUDE` constraints, and whose lossiness is
> why it cannot do index-only scans; SP-GiST suits prefix-structured data; and BRIN
> summarises ranges of heap pages and is the right answer for a large physically-correlated
> append-only table, at a few megabytes instead of tens of percent of the table. The three
> access methods with the most important silent failure modes are GIN with the wrong opclass
> (built with `jsonb_path_ops`, queried with `?`, never used), BRIN after the physical
> correlation is broken (still a Bitmap Heap Scan, now reading everything), and a covering
> index on an update-heavy table (pays the write cost, loses the covering as the visibility
> map goes stale). The three index options — partial, expression, `INCLUDE` — are where most
> of the practical wins are, and a partial index in particular encodes an assumption about
> selectivity that a growing business invalidates without warning.

## Chapter 7 — Query Planning

Volume 4 owns `EXPLAIN` and cost estimation in general. This chapter is the PostgreSQL
planner specifically: what the options actually report, how to read a plan well enough to
find the *first* place it went wrong, why a sort spills, and why the most commonly
recommended "fix" in PostgreSQL tuning is a diagnostic and not a fix.

### 7.1 The Options That Matter

| Option | What it tells you |
| --- | --- |
| `ANALYZE` | Executes the statement and reports real timings and real row counts |
| `BUFFERS` | Shared hits, reads, dirtied, written, and the temp read/written counters |
| `VERBOSE` | Full column lists, out-of-line TOAST targets, and precise expression output |
| `SETTINGS` | The non-default planner GUCs in effect, so you do not have to guess |
| `WAL` | WAL records and bytes generated by the DML — for write-path analysis |
| `FORMAT` | `TEXT` (default), `JSON`, `YAML`, `XML` — JSON is what tooling consumes |
| `TIMING OFF`, `SUMMARY OFF` | Cheaper analysis on a statement you suspect is unsafe to run twice |

`EXPLAIN ANALYZE` **executes the statement**, including its `DELETE`s and `UPDATE`s, so
wrap a mutating statement in `BEGIN; ... ROLLBACK;`. Everyone knows this and it still causes
outages.

### 7.2 Reading a Plan

A realistic plan, annotated. Six things to read, in the order that finds problems fastest.

```sql
EXPLAIN (ANALYZE, BUFFERS, VERBOSE, SETTINGS)
SELECT o.id, o.placed_at, o.total, c.name
FROM   orders o
JOIN   customers c ON c.id = o.customer_id
WHERE  o.status = 'pending'
ORDER  BY o.placed_at DESC
LIMIT  50;
```

```text
 Limit  (cost=48210.44..48212.19 rows=50 width=64) (actual time=812.441..812.689 rows=50 loops=1)
   Buffers: shared hit=48210 read=11903 dirtied=0 written=0,
            temp read=40218 written=40218
   ->  Index Scan using orders_placed_at_status_idx on orders o
         (cost=0.56..48210.44 rows=31194 width=36) (actual time=811.902..812.612 rows=50 loops=1)
         Index Cond: (status = 'pending'::text)
         Buffers: shared hit=48210 read=11903
         ->  Index Only Scan using customers_pkey on customers c
               (cost=0.29..8.31 rows=1 width=28) (actual time=0.031..0.034 rows=1 loops=50)
               Index Cond: (id = o.customer_id)
               Heap Fetches: 0
 Planning Time: 0.214 ms
 Execution Time: 812.902 ms
 Settings: effective_cache_size = '8GB', random_page_cost = 1.1,
           work_mem = '4MB', jit = off
```

**① `temp read=40218 written=40218` — the most important line, and routinely ignored.**
40218 blocks is roughly **314 MB of temporary file**, written and read back. That is a
`work_mem` spill, and it dominates the 812 ms runtime. The `Index Scan` was chosen on
`status` alone and produced 31,194 candidate rows to satisfy `LIMIT 50`, and something
downstream sorted or materialised them. This is a tuning signal, not necessarily a plan
problem — but the plan question comes first.

**② Estimate versus actual: `rows=31194` predicted, `rows=50` actual.** The index scan
returned 50 rows, not 31,194, because `LIMIT` stopped it early. The estimate is not
"wrong" in a way that misled the planner here — the planner costed the full 31,194 and the
limit made it cheap. But note the shape: this is a `LIMIT`-over-an-index plan with a
mis-matching index, and the fix is an index whose leading column is the equality predicate
(`status`) with `placed_at DESC` second, so the scan reads 50 entries in order and stops.

**③ `Heap Fetches: 0` on the customers lookup — the index-only scan is pure.** The
visibility map is healthy for those pages. This is a number to watch over time: if it
climbs, the table has been updated and vacuum has not caught up, which is Chapter 6's
silent degradation.

**④ `Buffers: shared hit=48210 read=11903`** — 48,210 pages came from `shared_buffers` and
11,903 required a read. Roughly 80% cached. On a query this size, `read` is meaningful: it
means either the working set exceeds `shared_buffers` or it is being evicted. `dirtied=0
written=0` is right for a read-only query, and a nonzero value here would be a surprise
worth investigating.

**⑤ `Settings:`** — this is why you should always pass it. `random_page_cost = 1.1` is an
SSD setting someone tuned deliberately. `jit = off` means JIT was disabled at the session or
server level. Without this line, half of these queries' behaviour is unexplainable.

**⑥ `Planning Time` versus `Execution Time`** — 0.2 ms versus 813 ms. Planning is not the
problem, and no amount of planner tuning will help this query. When planning time *is*
significant — a query with many joins, or one using a `LATERAL` over a large relation — the
`enable_*` and statistics discussion below becomes relevant; when it is 0.2 ms, it does not.

### 7.3 Node Types Worth Knowing

- **`Seq Scan`** — reads every page. Correct and often fastest when a large fraction of the
  table is needed; the `Filter` shows how many rows were discarded, and the node's cost is
  `pages × seq_page_cost`.
- **`Index Scan`** — a tree descent plus heap fetches. The `Index Cond` is what the index
  supplied; anything in the `Filter` was applied to the heap tuple and is *not* an index
  filter.
- **`Index Only Scan`** — as above, valid only when the visibility map permits.
- **`Bitmap Index Scan` → `Bitmap Heap Scan`** — reads a compact bitmap of matches, then
  visits the heap in physical order. The right answer for a low-selectivity predicate where
  an index scan would random-access too much; `Heap Blocks: exact` versus `lossy` tells you
  whether the bitmap fit in `work_mem`.
- **`Nested Loop`** — for a small outer side with an indexed inner side. The right plan far
  more often than people expect, especially under a `LIMIT`.
- **`Hash Join`** — needs to build a hash table over the *whole* inner relation, so it is
  the join that spills, and it is subject to `work_mem` and `hash_mem_multiplier`.
- **`Merge Join`** — both inputs sorted; the right choice when both are already ordered by an
  index, and it is the reason an index on the join key can remove a `Sort` node entirely.
- **`Gather` / `Gather Merge`** — parallel query. The number of children is the actual worker
  count, which may be lower than `max_parallel_workers_per_gather` (Chapter 1's worker pool).
- **`Materialize`** — caches the inner side of a nested loop. Its appearance usually means a
  plan shape changed, because the planner could not push an index condition inward.
- **`HashAggregate` / `GroupAggregate`** — the former spills to disk on a sort, the latter
  requires input already ordered.
- **`Subquery Scan` / `CTE Scan`** — a correlated subquery the planner chose not to flatten.

### 7.4 `work_mem` and the Spill

This is the setting most often misconfigured, and the multiplication is the whole point.

```text
  THE MULTIPLICATION, ON ONE QUERY

  work_mem = 4MB (default)
  plan: Hash Join → Hash (node)          allocates up to 4MB × hash_mem_multiplier
                    Sort    (node)        allocates up to 4MB
                    Materialize (node)    allocates up to 4MB
                    Bitmap Heap Scan       allocates up to 4MB
  parallel workers: 4

  leader   :  ~4 nodes × 4MB, with hash doubled by hash_mem_multiplier (2.0)  ≈ 24 MB
  4 workers: 4 × 24 MB                                                     ≈ 96 MB
  ──────────────────────────────────────────────────────────────────────────────────
  ONE QUERY, ONE MOMENT                                                      ~120 MB

  × concurrent queries on that connection  (say 4)                           ~480 MB
  × connections on the instance           (say 50)                        ~24 GB

  So work_mem is NOT a per-connection budget and CANNOT be reasoned about as one.
  Setting it globally to "what my worst query needs" is a decision whose
  consequence scales with connection count and query concurrency, neither of
  which the person editing the GUC is looking at.
```

`hash_mem_multiplier` (default **2.0**, PostgreSQL 16+) exists precisely because hash
operations need more headroom than sorts for the same `work_mem`, and it is the reason a
session that has raised `work_mem` for its sorts can still see a hash spill. It multiplies
the memory available to hash operations only.

The correct practice, in order:

1. **Eliminate the operation.** An index matching the `ORDER BY` and the equality filter
   removes the `Sort` entirely — and unlike memory, it costs nothing at query time.
2. **`SET LOCAL work_mem` for the one query**, at a measured value, inside the transaction
   that needs it.
3. **Per-role or per-database overrides** if a whole class of workload genuinely needs more,
   with the multiplication done for the expected concurrency.
4. **Leave the global default alone.** It is 4 MB for a reason, and that reason is the
   multiplication above.

The diagnostic that finds this in production without you having to run `EXPLAIN` on the
offending statement is `log_temp_files = 0`, which logs *every* temporary file created. It is
almost nobody's default and it is the single best setting in this chapter for finding spill.

> **INTERVIEW TRAP — "WE'LL SET `enable_seqscan = off` TO FORCE THE INDEX"**
>
> The honest answer is that this is a diagnostic, not a fix, and using it as a fix is
> actively harmful. `enable_seqscan = off` does not make the planner's cost estimate correct
> — it removes the planner's ability to *choose* correctly, by making sequential scans look
> so expensive that the planner will use an index scan even when scanning the whole table
> would be far faster. The query gets a plan that looks right and performs worse, and the
> underlying mis-estimate is still there, so the next data distribution change moves the
> cost back. It is also session-scoped, so in a pooled-connection application it leaks onto
> unrelated queries, and it is a per-plan-type switch that teams then start applying
> wholesale, at which point the planner is no longer doing its job at all. The legitimate
> use is diagnostic and narrow: set it, confirm the plan changes and the query gets
> *faster*, and you have learned that the planner's row estimate for that node is wrong. Then
> go and fix the estimate — `ANALYZE`, extended statistics on correlated columns,
> `default_statistics_target`, and check that `random_page_cost` and `effective_cache_size`
> match the actual hardware. `enable_seqscan`, `enable_nestloop`, `enable_hashjoin`,
> `enable_mergejoin` and `enable_indexscan` are all a way of looking at the problem without
> solving it, and their danger is that they work often enough to be copied into production
> by someone who never found the mis-estimate underneath.

### 7.5 JIT

PostgreSQL can compile parts of a query with LLVM. It kicks in above
`jit_above_cost` (default **100000**) and does more work above
`jit_optimize_above_cost` and `jit_inline_above_cost` (both default **500000**). The `JIT:`
block in the plan reports functions compiled, timing, and — importantly — the **emission`
and `optimization` counts, which is where most of the time goes.

JIT pays off on a query with a very expensive plan over a large relation, and it loses on a
query whose plan is expensive because of a bad row estimate, because the compilation cost is
proportional to plan size and the execution is still wrong. It also has a real
operational cost: it allocates memory outside the normal path, and the `jit` GUC is
session-settable, so a session with `jit = on` on a machine without LLVM support will fail
to plan. The practical advice is to look at the `JIT:` block before tuning, because a plan
spending 40% of its time in JIT *emission* is a plan that is too big, and that is a
planning problem wearing a JIT costume.

### 7.6 Statistics

The planner's input is estimates, and estimates come from statistics. The pieces:

- **`default_statistics_target`** (default **100**) — the sample size for a column,
  multiplied by 300 to get the number of rows ANALYZE samples. Raising it on columns with
  skewed distributions directly improves estimates, at the cost of a longer `ANALYZE`.
- **`ANALYZE`** — the re-sampling. Autovacuum's analyzer does it on a schedule
  (`autovacuum_analyze_scale_factor`, default **0.1**), and after a bulk load nothing does
  it for you, which is the single most common cause of "the plan changed and nothing
  changed".
- **Extended statistics** (`CREATE STATISTICS`, PostgreSQL 10+) — for *correlated* columns,
  where the planner's independence assumption is wrong. This is the most under-used feature
  in the whole chapter. Two predicates on correlated columns multiply to an estimate that
  can be off by orders of magnitude, and no amount of `ANALYZE` fixes it because the problem
  is the model, not the sample.

```sql
-- the mis-estimate diagnostic
SELECT attname, n_distinct, null_frac, correlation, most_common_vals, most_common_freqs
FROM   pg_stats WHERE tablename = 'orders' AND attname IN ('status','customer_id');

-- are the statistics stale?
SELECT relname, n_mod_since_analyze, last_autoanalyze, last_analyze
FROM   pg_stat_user_tables WHERE n_mod_since_analyze > 10000;

-- the fix for correlated columns
CREATE STATISTICS orders_status_customer (dependencies, ndistinct)
  ON status, customer_id FROM orders;
ANALYZE orders;

-- and the hardware assumptions, which are the most often-wrong settings
SHOW random_page_cost;        -- 4.0 default = spinning disk. 1.1 is a reasonable SSD value.
SHOW seq_page_cost;           -- 1.0
SHOW effective_cache_size;    -- a *guess* at the OS page cache. Default 4GB is usually wrong.
```

> **SCALING REALITY CHECK**
>
> The first node where `rows=` and `actual rows=` differ by more than an order of magnitude
> is where the plan went wrong, and every node above it is a consequence rather than a
> cause. Chasing the symptom — adding a hint, forcing an access method, raising `work_mem` —
> is what produces a plan that looks right today and regresses on the next data change. The
> discipline is to find that first divergence, then ask which of four things is wrong: stale
> statistics, insufficient statistics (`default_statistics_target`), a correlation the
> planner's independence assumption cannot represent (extended statistics), or hardware
> assumptions that do not match the machine (`random_page_cost`, `effective_cache_size`).
> All four are real fixes. `enable_seqscan = off` is not one of them.

#### Common Mistakes

- Running `EXPLAIN ANALYZE` on a mutating statement without a `ROLLBACK`
- Not passing `BUFFERS` and therefore never seeing the `temp read/written` line that reveals
  a `work_mem` spill
- Not passing `SETTINGS` and being unable to explain behaviour caused by a tuned GUC
- Raising `work_mem` globally on the reasoning that it is a per-query budget
- Setting `enable_seqscan = off` (or `enable_nestloop = off`) in production configuration
- Tuning `random_page_cost` for spinning disks on an SSD, or leaving
  `effective_cache_size` at a default that does not resemble the machine
- Ignoring `Heap Fetches` and mistaking visibility-map staleness for a plan problem
- Chasing the top node of a plan instead of the first node where the estimate diverges
- Believing JIT is a performance win on a plan that is large because of a bad estimate

#### Interview Questions — Query Planning

**Q1. A query spills to a temporary file. What does that mean, and how do you fix it?**
`STAFF`

It means a memory-hungry node exceeded its `work_mem` allocation and wrote to disk. You see
it as `Buffers: temp read=NNNN written=NNNN` on the node — 40218 blocks is about 314 MB,
written and read back, and it very often dominates the runtime. The fix is *not* to raise
`work_mem` globally, because `work_mem` is a per-*node* limit multiplied by the nodes in the
plan, by the parallel workers (each allocating its own), and by every concurrent query on
that connection; setting it globally to what your worst query needs authorises a figure
nobody budgeted, and the failure mode is the OOM killer selecting the largest backend rather
than a clean error. The fix in order of preference: first, **eliminate the operation** — the
common case is a `Sort` above a `Filter` that removes most of the rows to satisfy a `LIMIT`,
and an index matching the `ORDER BY` with the equality column leading turns the sort into a
bounded index scan that stops after N rows, costing nothing at query time and immune to the
threshold. Second, `SET LOCAL work_mem = '...'` inside the one transaction that has been
measured to need it, which is scoped correctly. Third, if a whole class of workload needs
more, a per-role override with the multiplication done for the expected concurrency. And
note that hash operations are separately scaled by `hash_mem_multiplier` (default 2.0,
PostgreSQL 16+), so a session that raised `work_mem` for its sorts can still see a hash
spill — which is exactly what that setting exists to address. In production the setting that
finds this without `EXPLAIN` is `log_temp_files = 0`, which logs every temporary file
created.

**Q2. A query's estimated row count is 3 and the actual is 310,000. Where do you look?**
`ADVANCED`

In a specific order, because a three-row estimate is nearly always a *distinct-count* estimate
that is wrong rather than a filter that is wrong. First, `pg_stats` for the columns in the
predicate — `n_distinct`, `null_frac`, the most-common-values list, and the histogram bounds.
A heavily skewed column where the filtered value is rare and therefore absent from the MCV
list will estimate 3. Second, staleness: `n_mod_since_analyze` and `last_autoanalyze` for the
table, and whether a bulk load happened with no manual `ANALYZE` — the autovacuum analyzer
will not have caught up, and this is the most common single cause. Third, and the most
under-diagnosed: **correlated columns**. When two predicates are on columns whose values
move together, the planner multiplies two independent selectivities and the product can be
wrong by orders of magnitude, and no amount of re-`ANALYZE` fixes it because the problem is
the independence assumption rather than the sample. The fix is extended statistics —
`CREATE STATISTICS ... (dependencies, ndistinct) ON col_a, col_b` — which is the feature
most teams have never used. Fourth, establish *where* the divergence starts by finding the
lowest node in the plan where `rows=` and `actual rows=` differ by more than an order of
magnitude, because everything above it is a consequence. Fifth, planner configuration:
`effective_cache_size` set too low makes the planner believe nothing is cached and inflates
every scan cost, and `random_page_cost = 4` on an SSD overstates index access badly. What
you should not do is reach for `enable_seqscan = off`: that makes the plan look right
without making the estimate right, and the mis-estimate reappears at the next data change.

**Q3. When would you use `enable_*` settings, and what is the risk?** `TRICKY`

Only as a diagnostic, and only narrowly. The legitimate sequence is: set the switch in a
session, re-run `EXPLAIN` and `EXPLAIN ANALYZE`, confirm both that the plan changed *and*
that the query got faster, and treat that as evidence that the planner's cost estimate for
that node is wrong. Then go and fix the estimate — `ANALYZE`, raise
`default_statistics_target` on the skewed column, add extended statistics for the correlated
pair, and check `random_page_cost` and `effective_cache_size` against the actual hardware.
The risk of using them as configuration is that they do not make the planner correct; they
remove the planner's ability to choose correctly, forcing a specific shape regardless of
whether it is right. `enable_seqscan = off` on a table where a sequential scan genuinely is
correct makes every scan an index scan, which is slower and produces a plan that looks
sensible while the mis-estimate underneath is untouched. There are two further practical
hazards: they are session-scoped, so in a pooled-connection application they leak onto
unrelated queries that borrowed the same backend; and they are per-plan-type, so a team that
sets several of them has effectively stopped the planner from choosing, at which point plan
quality depends on whether whoever wrote the settings happened to be right about the
workload.

**Q4. A query has a `Sort` node with 172 MB of temp files above a filter returning 14,000
rows, for a `LIMIT 50`. What is the right fix?** `STAFF`

Make the sort disappear. The plan's shape tells you it is possible: a `Sort` above a filter
that returns 14,000 rows in order to satisfy `LIMIT 50` is almost always a missing
index-matched ordering, and the compound index that fixes it is
`(status, placed_at DESC)` — the equality predicate leading, the ordering column second. That
index satisfies both the `WHERE` and the `ORDER BY`, so the planner reads 50 index entries in
order and stops, with no sort and therefore no spill and no `work_mem` exposure at all. This
is strictly better than raising `work_mem`, because it costs nothing per query, does not
touch the instance's memory budget, and does not depend on a memory setting that someone else
can change. If the filter is not on a single column, or the ordering is by an expression, an
expression index on the sort key with the filter columns leading achieves the same thing. If
no index can serve it — a computed ordering over a computed predicate, say — then the
remaining options are `SET LOCAL work_mem` sized to the measured 172 MB, scoped to the one
transaction, or reducing the rows before the sort. And if this report runs on a schedule,
the honest answer may be neither: a materialised view refreshed on a schedule, or moving the
report to a replica, removes both the sort and the I/O contention it causes on the primary.
The generalisable diagnostic: a `Sort` sitting *above* a filter that eliminates most rows is
the signature of a missing index-matched ordering.

**Q5. How do you decide whether an index is earning its keep on a busy table?** `STAFF`

Start with `pg_stat_user_indexes.idx_scan`, but treat it as evidence for a conversation
rather than a delete instruction, because a low count may mean the index serves a rare
critical query rather than a useless one, and the window matters — a quarterly report's index
looks dead in a week's window. Then check the mechanical wins, which do not need
interpretation: duplicate indexes with different names are pure waste and there is a standard
query; and overlapping indexes where a `(a)` and an `(a, b)` both exist, or a `(a, b)` and
`(b, a)` where only one order matches any real query, which is the same leftmost-prefix
decision from Chapter 6. Then look for the biggest available win, which is usually a
**partial** index: a full index on a table where most rows are in a state no query filters on
should be a partial index on the rest, which is smaller, cheaper to write, and faster to
search. The countervailing costs, which are real and which people forget because indexes feel
free: every `INSERT` pays a descent per index, an `UPDATE` on a changed column adds entries
to every index covering it, a non-HOT update on a wide table can need a new heap page,
vacuum scans every index for dead entries, and the planner evaluates every index as a
candidate. The organisational answer is the part that matters most at staff level: index
debt accumulates because adding one is a one-line change with a visible benefit and removing
one has no visible symptom, so the durable fix is a recurring review with a named owner and
a rule that every index states the query it serves.

#### Further Reading

- [PostgreSQL — Using `EXPLAIN`](https://www.postgresql.org/docs/current/using-explain.html) — every option, what each reports, and the warning about `ANALYZE` executing the statement.
- [PostgreSQL — `EXPLAIN` Reference](https://www.postgresql.org/docs/current/sql-explain.html) — the formal semantics of each option.
- [PostgreSQL — Query Planning](https://www.postgresql.org/docs/current/runtime-config-query.html) — the planner GUCs, including the `enable_*` family and what each one is for.
- [PostgreSQL — Planner Statistics](https://www.postgresql.org/docs/current/planner-stats.html) — `ANALYZE`, `default_statistics_target`, and where the statistics live.
- [PostgreSQL — JIT In-Database Compilation](https://www.postgresql.org/docs/current/jit-reason.html) — when JIT engages, the cost thresholds, and when it loses.

> **CHAPTER 7 SUMMARY**
>
> A plan is read in a fixed order, and the two lines people skip are the two that matter:
> `Buffers: temp read/written` reveals a `work_mem` spill, and `Settings:` reveals which GUC
> somebody tuned. Compare `rows=` against `actual rows=` and find the *lowest* node where
> they diverge by more than an order of magnitude, because everything above it is a
> consequence. `work_mem` defaults to 4 MB and is a limit *per node* — multiplied by the
> nodes in the plan, by the parallel workers, and by every concurrent query — which is why
> the correct response to a spill is an index that removes the operation, then
> `SET LOCAL`, and never a global change. Hash operations are separately scaled by
> `hash_mem_multiplier` (default 2.0, PostgreSQL 16+). The `enable_*` family is a way of
> looking at a mis-estimate, not fixing one: it removes the planner's ability to choose
> correctly, it leaks through connection pools because it is session-scoped, and it makes a
> plan look right without making the estimate right. The durable fixes are `ANALYZE`,
> `default_statistics_target` on skewed columns, extended statistics on correlated columns,
> and `random_page_cost` and `effective_cache_size` set to match the actual hardware.

## Chapter 8 — Transactions, Isolation & Locking

Volume 5 owns ACID, the anomalies, the isolation levels and MVCC as theory, and deadlocks
generally. This chapter is PostgreSQL's specific implementation, and one property of it
surprises almost every candidate: `REPEATABLE READ` is not lock-based, and `SERIALIZABLE`
can still abort your transaction *after* every statement in it has succeeded.

### 8.1 The Four Levels as PostgreSQL Implements Them

| Level | PostgreSQL's implementation | Prevents |
| --- | --- | --- |
| `READ UNCOMMITTED` | **treated as `READ COMMITTED`** | nothing; the name is a fiction |
| `READ COMMITTED` (default) | a *new snapshot per statement* | dirty reads |
| `REPEATABLE READ` | a *single snapshot per transaction* | dirty reads, non-repeatable reads |
| `SERIALIZABLE` | snapshot isolation + **SSI** (Serializable Snapshot Isolation) | all four, by aborting one transaction |

Three things follow from that table.

`READ UNCOMMITTED` does not exist. PostgreSQL maps it to `READ COMMITTED` and reads are
always snapshot-consistent, so a dirty read is not something you can do here at all. Any
question premised on it is premised on a different engine.

`REPEATABLE READ` is **snapshot isolation, not lock-based repeatability**. It guarantees
that a transaction sees one consistent snapshot for its whole life. It does *not* take gap
locks, so it does not prevent phantoms, and it does not prevent read skew — the snapshot
itself can be inconsistent with respect to transactions that committed during it. This is
the single most commonly mis-stated fact about PostgreSQL, and it is where "why isn't the
default level `SERIALIZABLE`" is answered.

`SERIALIZABLE` is **SSI**, which is optimistic: transactions run under snapshots without
blocking each other, the database tracks predicate locks on the rows and ranges they read,
and at commit it checks whether the outcome could correspond to any serial order. If it
could not, one of the participants is aborted.

> **INTERVIEW TRAP — "YOUR TRANSACTION IS ABORTED AT COMMIT WITH `could not serialize access
> due to read/write dependencies among transactions`"**
>
> That is not a bug and it is not data loss. It is the mechanism working. PostgreSQL's
> `SERIALIZABLE` is Serializable Snapshot Isolation, not a locking protocol: the transaction
> ran optimistically, reading under a snapshot, and the database tracked the predicate locks
> needed to know whether the interleaving was safe. By the time it has enough information,
> that is usually at `COMMIT` — which is why the error surfaces on the commit statement
> rather than on any of the work. `SQLSTATE 40001` is the correct delivery of the guarantee
> the level promised. The application must **retry the entire transaction from the first
> statement**, with bounded attempts and exponential backoff plus jitter, because it is the
> *reads* that determined the outcome and re-running only the last statement is meaningless.
> `40P01` (deadlock detection) belongs in the same handler. Before building the retry loop,
> though, the better question is whether the invariant can be a `CHECK`, a unique index, or
> an `EXCLUDE USING gist` — a constraint needs no retry, covers write paths nobody audited,
> and is not exposed to a transaction that contains a non-idempotent side effect. A retry
> loop is the right answer when the invariant genuinely spans rows that cannot be
> constrained, and a liability when the transaction also calls an external API.

A worked example of the SSI abort, because the shape matters more than the definition:

```sql
-- T1                                  -- T2
BEGIN;                                 BEGIN;
SELECT count(*) FROM seats              SELECT count(*) FROM seats
WHERE show_id = 1 AND sold = false;  -- 200        -- 200   (same snapshot view)
-- T1 reads 200 unsold                  -- T2 reads 200 unsold
UPDATE seats SET sold = true            UPDATE seats SET sold = true
WHERE show_id = 1 AND seat_no <= 100;   WHERE show_id = 1 AND seat_no BETWEEN 101 AND 300;
-- 100 rows                             -- 200 rows
COMMIT;                                 COMMIT;
-- SUCCEEDS                             -- ★ ABORTED: 40001, serialization failure
-- "could not serialize access due to read/write dependencies among transactions"

-- The final state has 300 seats sold. T2 committed 200 on top of T1's 100,
-- believing there were 200 free. The database detected that no serial order
-- of T1 and T2 produces that result, and refused to let the wrong one stand.
-- The application retries T2 — and on retry it reads 100, updates 100, and
-- the outcome is correct.
```

### 8.2 Read Skew, and the Fix Hierarchy

Because `REPEATABLE READ` is snapshot isolation, the classic read skew is possible. The
canonical version is the "bank transfer in both directions" check:

```text
  T1 (READ COMMITTED)                      T2 (READ COMMITTED)
  ───────────────────                       ───────────────────
  reads A = 100                            reads B = 100
  reads B = 100                            reads A = 100
  checks: A ≥ 50  ✓                        checks: B ≥ 50  ✓
  A = A - 60   → 40                        B = B - 60   → 40
  COMMIT                                    COMMIT

  Both transactions passed the check. Both committed. The "no overdraft"
  invariant is violated — and each transaction individually saw a
  consistent view, which is precisely why READ COMMITTED permits it.

  NOW THE SAME THING UNDER REPEATABLE READ:
  Each transaction's view is a single snapshot. If T1's snapshot was taken
  before T2 committed, T1 sees A=100, B=100 and passes. If T2's snapshot was
  taken before T1 committed, T2 also sees A=100, B=100 and passes. Both
  snapshots are internally consistent; neither is consistent with the other
  transaction's commit. The read skew SURVIVES.

  This is the counter-intuitive part: REPEATABLE READ does NOT fix this.
  It is a snapshot, not a lock.  SERIALIZABLE does fix it — by aborting one.
```

The fix hierarchy, which is the actionable part:

1. **Express the invariant as a constraint.** `CHECK (balance >= 0)` is exactly "no
   overdraft", enforced for every writer, with no retry and no isolation escalation. This is
   the right answer far more often than people reach for.
2. **Make the read-modify-write a single statement.** `UPDATE accounts SET balance =
   balance - 60 WHERE id = 1 AND balance >= 60` is atomic, holds one row lock, and cannot
   interleave. Then check the affected-row count: zero rows means the check failed.
3. **Lock the rows you read.** `SELECT ... FOR UPDATE` on both accounts before checking, so
   nothing can change between the read and the write.
4. **`SERIALIZABLE` and retry.** Correct, and the last resort rather than the first, because
   of the abort rate, the latency cost, and the requirement that every side effect be
   idempotent.

### 8.3 Row Locks and the Work Queue

```sql
SELECT * FROM jobs WHERE status = 'pending' FOR UPDATE;
SELECT * FROM jobs WHERE status = 'pending' FOR UPDATE NOWAIT;
SELECT * FROM jobs WHERE status = 'pending' FOR UPDATE SKIP LOCKED LIMIT 1;
```

| Clause | Locks | Use for |
| --- | --- | --- |
| `FOR UPDATE` | exclusive, conflicts with everything | read-modify-write on the row's value |
| `FOR NO KEY UPDATE` | exclusive, but weaker — does not conflict with `FOR KEY SHARE` | the right choice for most application updates; leaves foreign keys alone |
| `FOR SHARE` | shared | "read now, ensure it does not change" |
| `FOR KEY SHARE` | weaker shared; never blocks, never is blocked by a non-key update | what foreign-key checks take |
| `NOWAIT` | — | fail immediately rather than block; for latency-sensitive paths |
| `SKIP LOCKED` | — | work queues: take what nobody else has |
| `OF table_alias` | only the named tables | when joining, to lock only one side |

`FOR NO KEY UPDATE` is the under-used one, and it is the right default for application
updates. Because it does not conflict with `FOR KEY SHARE`, it does not block concurrent
foreign-key checks on the same row, which means ordinary updates stop serialising against
every reference to that row.

`SKIP LOCKED` is the work-queue primitive, and it is genuinely excellent — with a specific
failure mode that has to be designed for:

```sql
-- 12 workers pulling from one queue, no coordination
BEGIN;
SELECT id, payload FROM jobs
WHERE   status = 'pending'
ORDER   BY priority DESC, created_at
FOR UPDATE SKIP LOCKED
LIMIT 1;
-- do the work HERE, inside this transaction
UPDATE jobs SET status = 'done' WHERE id = $1;
COMMIT;
```

The design rule is that **the work must happen inside the claiming transaction**, so the row
lock that guarantees exclusivity is held for its duration. That gives at-least-once delivery:
if the worker dies, the transaction rolls back and the job returns to the queue. The cost is
that the transaction is open for the length of the job, which is Chapter 3's failure mode —
a 40-minute video transcode holding a transaction open blocks vacuum for the entire cluster.
So genuinely long jobs need the second fix anyway: a `claimed_at` timestamp with a visibility
timeout, plus a sweep that requeues `running` rows older than the timeout. And the rule teams
skip: **every job must be idempotent**, because at-least-once means the system genuinely
cannot know whether the side effect landed before the crash. Without idempotency the queue is
wrong regardless of how the locking is done.

One more behaviour worth knowing, because it surprises people: under `READ COMMITTED`, when
`FOR UPDATE` finds a row that has been updated by a transaction that has since committed, it
**follows the update and re-evaluates the `WHERE` clause against the new version**. The row
is then silently skipped if it no longer matches. So `FOR UPDATE` under `READ COMMITTED`
guarantees "I have locked a row that *currently* matches", not "I have locked the row I saw" —
which means any code treating "no rows returned" as terminal is wrong. Under `REPEATABLE
READ` the same query raises `could not serialize access due to concurrent update` instead of
silently returning nothing.

### 8.4 Advisory Locks

Advisory locks are application-level locks in a namespace the database reserves for
cooperating code, and there are four functions and two namespaces.

```sql
-- SESSION-scoped: held until explicitly released or the session ends.
-- In a pooled connection this LEAKS if the unlock is skipped on an error path.
SELECT pg_advisory_lock(42);
SELECT pg_try_advisory_lock(42);
SELECT pg_advisory_unlock(42);

-- TRANSACTION-scoped: released automatically at COMMIT or ROLLBACK. Cannot leak.
SELECT pg_advisory_xact_lock(42);
SELECT pg_try_advisory_xact_lock(42);
```

| | `lock(bigint)` | `lock(int, int)` |
| --- | --- | --- |
| Key space | one global 64-bit space | two separate 32-bit spaces |
| Conflict | any 1-arg call conflicts with any 1-arg call | `(classid, objid)` pairs; `(5, 42)` never conflicts with `(9, 42)` |

Three operational rules. **Always prefer the `_xact_` variant**, because it cannot leak and
the session variant reliably will in a pooled connection. **Namespace your keys** —
`pg_advisory_xact_lock(hashtext('invoice-import'))` — because bare integers like `42` live in
a global space shared with every other subsystem and nobody reading the code can tell what
the lock protects. **Hold them for the shortest possible window**, because they are a global
contention point invisible to the table-level lock tooling that on-call actually looks at.

### 8.5 Deadlocks

PostgreSQL detects deadlocks and resolves them by **aborting one transaction** with
`SQLSTATE 40P01` after `deadlock_timeout` (default **1 second**) of waiting. It does not
detect them faster by default, and that one second is worth knowing about because it is
where a "the database hung" report comes from.

The four things that prevent most deadlocks:

1. **A consistent lock order** across all code paths. If every transaction acquires locks in
   the same order, a cycle cannot form.
2. **Keep transactions short.** A transaction that holds a lock for 30 seconds holds it for
   30 seconds, and the deadlock detector needs both participants to be waiting.
3. **Lock rows, not tables or coarse groups**, so the conflict surface is small.
4. **Retry on `40P01`**, with the same handler as `40001`.

The diagnostic, and the one query to memorise:

```sql
-- who is blocking whom, in one line, without joining pg_locks by hand
SELECT a.pid, a.state, a.wait_event_type, a.wait_event,
       pg_blocking_pids(a.pid) AS blocked_by,
       now() - a.query_start    AS running_for,
       left(a.query, 100)       AS query
FROM   pg_stat_activity a
WHERE  cardinality(pg_blocking_pids(a.pid)) > 0;

-- waiting and blocked, with the blocker shown inline
SELECT blocked.pid            AS blocked_pid,
       blocked.query          AS blocked_query,
       now() - blocked.query_start AS blocked_for,
       blocker.pid            AS blocker_pid,
       blocker.state          AS blocker_state,
       blocker.xact_start     AS blocker_xact_start,
       left(blocker.query,100) AS blocker_query
FROM   pg_stat_activity blocked
JOIN   LATERAL unnest(pg_blocking_pids(blocked.pid)) AS b(pid) ON true
JOIN   pg_stat_activity blocker ON blocker.pid = b.pid;

-- a transaction lock held by a long-running transaction, which is the other
-- half of "everything is blocked"
SELECT pid, now() - xact_start AS held_for, left(query, 100)
FROM   pg_stat_activity
WHERE  xact_start IS NOT NULL AND state <> 'idle'
ORDER  BY xact_start;
```

Three settings turn an opaque incident into a diagnosable one: `log_lock_waits = on` logs
every lock wait and what it was waiting for; `deadlock_timeout` lowered from 1 second to a
few hundred milliseconds makes detection faster at a small CPU cost; and
`lock_timeout` set per-role converts an unbounded wait into a bounded error, which is almost
always better than a request that hangs for as long as the holder lives.

#### Common Mistakes

- Believing `REPEATABLE READ` prevents read skew or phantoms — it is a snapshot, not locks
- Treating a `40001` at `COMMIT` as a bug rather than as SSI working as designed, and
  retrying only the failed statement instead of the whole transaction
- Using `pg_advisory_lock` (session-scoped) in a pooled connection, where a skipped unlock
  leaks the lock permanently
- Using bare integers as advisory lock keys in a global namespace shared with every other
  subsystem
- Doing long-running work inside a `SKIP LOCKED` claiming transaction, and thereby blocking
  vacuum cluster-wide
- Building a `SKIP LOCKED` queue whose jobs are not idempotent, which makes at-least-once
  delivery a correctness bug rather than a design choice
- Treating "no rows" from `SELECT ... FOR UPDATE` under `READ COMMITTED` as a terminal
  condition, when the row may have been re-evaluated away
- Assuming a deadlock is always a bug in the database, rather than an inconsistent lock
  order in the application

#### Interview Questions — Isolation & Locking

**Q1. Your `SERIALIZABLE` transaction is aborted at `COMMIT` with `could not serialize access
due to read/write dependencies among transactions`. What is it and what do you do?**
`STAFF`

It is the mechanism, working. PostgreSQL's `SERIALIZABLE` is Serializable Snapshot
Isolation, not a lock-based protocol: the transaction ran optimistically under a snapshot
while the database tracked predicate locks on the rows and ranges it read, and at commit it
checked whether the interleaving could correspond to any serial order. Because that
information accumulates over the transaction's whole life, the failure usually surfaces at
`COMMIT` rather than on any individual statement, and `SQLSTATE 40001` is the correct
delivery of the guarantee the isolation level promised — the database is refusing to let an
unserialisable outcome stand, which is the entire point. The application must retry the
**entire transaction from the first statement**, with bounded attempts and exponential
backoff plus jitter, because the reads are what determined the outcome and re-running only
the failed statement is meaningless; `40P01` for deadlocks goes through the same handler.
Before building that loop, the better question is whether the invariant can be a `CHECK`, a
unique index, or an `EXCLUDE USING gist` — a declarative constraint needs no retry, is
enforced for write paths nobody audited, and is immune to a transaction containing a
non-idempotent side effect. Retry loops are right when the invariant genuinely spans rows
that cannot be constrained, and a liability when the transaction also calls an external API.

**Q2. Does `REPEATABLE READ` in PostgreSQL prevent read skew? Why or why not?** `ADVANCED`

No, and this is where PostgreSQL differs from most engines people have used.
`REPEATABLE READ` in PostgreSQL is **snapshot isolation**: the transaction takes one snapshot
at its first statement and every read in it sees the database exactly as of that instant. That
is a strong guarantee — no statement ever sees a partially-committed change, and the
transaction never sees its own writes from before the snapshot — but the *snapshot itself* can
be inconsistent with respect to transactions that committed while it was running. Take the
classic two-way bank check: T1 reads A=100 and B=100 and passes "A ≥ 50"; T2 reads B=100 and
A=100 and passes "B ≥ 50"; both debit, and both commit with an overdraft. Under
`REPEATABLE READ` the same thing happens, because T1's snapshot and T2's snapshot each
exclude the other's commit, so each sees a pre-debit world. The reason is structural:
preventing read skew in the classic sense requires *gap locks or predicate locks held for the
duration of the transaction*, and PostgreSQL's `REPEATABLE READ` takes neither — it relies on
MVCC instead. What fixes it is `SERIALIZABLE`, which detects the dangerous pattern and aborts
one participant, or better, restructuring: a single atomic statement
(`UPDATE ... WHERE balance >= 60`), a `CHECK` constraint, or `SELECT ... FOR UPDATE` on the
rows being reconciled.

**Q3. You need exactly-once execution of a monthly close job across eight service
instances. What are your options?** `STAFF`

Three, and the third is usually the best. First, a **lease row**: a row with `(owner,
expires_at)` claimed by a conditional `UPDATE ... WHERE expires_at < now()`. The lock
survives a crashed worker because it expires, works across a failover, is visible in ordinary
table queries, and needs no special lock namespace. Its costs are clock discipline and a
cleanup sweep, plus heartbeating if the job can outlive its lease. Second, a
**transaction-scoped advisory lock** (`pg_try_advisory_xact_lock(hashtext('monthly-close'))`):
semantically exactly "am I the only one", released automatically at commit so it cannot leak,
and `try_` means the loser exits immediately rather than waiting. Its weaknesses are that it
is invisible in ordinary queries, that it namespacing is the application's discipline to
maintain, and that if the "job" is really several statements the lock has to span all of
them. Third, and usually the right answer at staff level, a **database-enforced marker**: a
unique constraint on `(job_name, period)` so a second execution attempt violates it. That is
declarative, needs no coordination at all, is enforced even by the instance you forgot about,
and makes the question "did it already run?" answerable with a query. What to avoid: the
session-scoped `pg_advisory_lock`, which in a pooled connection leaks on every error path and
produces a job that silently never runs again.

**Q4. `SELECT ... FOR UPDATE SKIP LOCKED` for a work queue. What is the failure mode, and how
do you design around it?** `ADVANCED`

The primitive is genuinely good — a dozen workers can pull from one queue with no
coordination, because `SKIP LOCKED` makes each worker take only rows no one else holds, and
it converts a queue into a set of parallel consumers. The failure mode is what happens when a
worker dies. If the work is done **inside** the claiming transaction, the crash rolls the
claim back and the job is retried, which gives at-least-once delivery — and at-least-once
means the system genuinely cannot know whether the side effect landed before the crash, so
a non-idempotent job will double-apply roughly as often as workers crash. If the work is done
**outside** the transaction, the row is committed as `running` and a crash after that strands
it forever, which is the worse failure. So there are three required design elements, and
teams routinely ship only the first. One: the work inside the claiming transaction, so the
lock that guarantees exclusivity is held throughout. Two: because that means a long
transaction, a `claimed_at` timestamp with a visibility timeout plus a sweep that requeues
`running` rows older than the timeout, so a crashed worker's job returns to the queue without
human intervention — which is also what stops a long job from blocking vacuum cluster-wide.
Three: **every job must be idempotent**, with an idempotency key recorded in the same
transaction as the effect. Without that third element the queue is wrong no matter how the
locking is done.

**Q5. A deadlock occurred. What causes it in practice, and what do you do about it?**
`STAFF`

PostgreSQL detects deadlocks and breaks them by aborting one participant with `SQLSTATE
40P01`, after `deadlock_timeout` — default **1 second** — of waiting, which is why the
symptom is often reported as "the database hung" rather than as an error. Deadlocks are
always the same shape: two transactions each holding what the other needs, which means an
**inconsistent lock order across code paths**. In practice it is nearly always one of four
things: acquiring locks in whatever order the application happens to touch rows rather than a
fixed global order; a transaction that spans multiple tables where different entry points
begin at different tables; `SELECT ... FOR UPDATE` on a set of rows without `ORDER BY`, so
the order the executor returns them in is not guaranteed stable; or a long transaction that
widens the window until any cycle can complete. The fixes follow directly: impose a
consistent ordering — sort the target ids and lock them in that order, every time — keep
transactions short so both participants are actually waiting, lock rows rather than coarse
groups, and retry on `40P01` through the same handler as `40001`. Operationally, lower
`deadlock_timeout` to a few hundred milliseconds so detection is faster, set
`log_lock_waits = on` so waits are visible, and set a `lock_timeout` per role so an unbounded
wait becomes a bounded error — which is nearly always better than a request hanging for as
long as the blocking transaction lives. The diagnostic is `pg_blocking_pids()`, which gives
the blocking pids directly and is the one query to have ready.

**Q6. When should you use `SELECT ... FOR UPDATE`, and what are the traps?** `TRICKY`

Use it when you need to *hold* a row across a decision — read a value, decide something, and
write back a change that depends on the value you read — and the decision cannot be made in
a single statement. For that case it is the right tool and there is no substitute, because
MVCC alone lets two transactions read the same pre-state and both write. The traps are
specific. First, the lock is held until **commit**, not until the end of the statement, so a
long transaction blocks everyone who wants that row; this is why a transaction that includes
an HTTP call is a row-lock incident waiting to happen. Second, under `READ COMMITTED` when
the row has been updated by a transaction that has since committed, PostgreSQL follows the
update and **re-evaluates the `WHERE` clause** against the new version, silently skipping the
row if it no longer matches — so the guarantee is "I have locked a row that currently
matches", not "I have locked the row I saw", and any code treating zero rows as terminal is
wrong. Under `REPEATABLE READ` the same situation raises `could not serialize access due to
concurrent update` instead of silently returning nothing. Third, the locking clause choice
matters: prefer `FOR NO KEY UPDATE` for ordinary application updates, because it does not
conflict with the `FOR KEY SHARE` locks that foreign-key checks take, so your update stops
serialising against every reference to that row. Fourth, `NOWAIT` versus blocking is a
latency decision — a blocking `FOR UPDATE` in a request path has unbounded latency, and
`NOWAIT` converts that into an immediate, handleable error. And fifth, do not use it when a
single atomic `UPDATE ... WHERE <precondition>` expresses the same thing, because that holds
one row lock for a much shorter window.

#### Further Reading

- [PostgreSQL — Transaction Isolation Levels](https://www.postgresql.org/docs/current/transaction-iso.html) — what each level actually does, and why `READ UNCOMMITTED` is `READ COMMITTED`.
- [PostgreSQL — Serializable Snapshot Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — the anomaly classes SSI detects, and why aborting at commit is expected.
- [PostgreSQL — Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — every row and table lock mode, `NOWAIT`, `SKIP LOCKED`, and `OF`.
- [PostgreSQL — Advisory Locks](https://www.postgresql.org/docs/current/advisory-locks.html) — session versus transaction scope, the two key spaces, and the lifetime rules.
- [PostgreSQL — Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html) — detection, `deadlock_timeout`, the `40P01` error, and prevention strategies.

> **CHAPTER 8 SUMMARY**
>
> `READ UNCOMMITTED` is `READ COMMITTED` — a dirty read is not possible in PostgreSQL.
> `READ COMMITTED` takes a new snapshot per statement, so it prevents dirty reads and
> nothing else; a read-modify-write inside it can interleave, and `SELECT ... FOR UPDATE`
> re-evaluates its `WHERE` clause against a newer version, so "no rows" is not a terminal
> answer. `REPEATABLE READ` is snapshot isolation, not lock-based: it gives one consistent
> snapshot for the transaction but takes no gap locks, so read skew and phantoms remain
> possible, which is the fact most candidates get wrong. `SERIALIZABLE` is SSI — optimistic,
> predicate-lock-tracked, and therefore aborting one participant at `COMMIT` with `40001`,
> which is the guarantee working rather than a failure, and requires a whole-transaction
> retry with backoff. Before reaching for any of it, the first question is whether the
> invariant can be a `CHECK`, a unique index, or an `EXCLUDE USING gist`, because a
> constraint needs no retry and covers writers nobody audited. For work queues,
> `FOR UPDATE SKIP LOCKED` is the right primitive and at-least-once delivery is the
> consequence, so the work belongs inside the claiming transaction, a claimed-at timeout
> handles a dead worker, and every job must be idempotent. Deadlocks are always an
> inconsistent lock order, and `pg_blocking_pids()` is the query that names the blocker.

## Chapter 9 — Autovacuum, Bloat & the Operational Surface

Autovacuum is the feature PostgreSQL users most often discover by having it go wrong, and
almost every autovacuum incident reduces to one misunderstanding: **autovacuum reclaims
space, but it does not return it to the operating system.** The file stays the size it grew
to. That single fact explains `VACUUM FULL` and `pg_repack` and most of "the table is 400 GB
and only 2 GB of it is data".

### 9.1 The Threshold, Visually

Autovacuum decides a table is worth vacuuming by comparing dead tuples against a threshold
that is a fixed number **plus a fraction of the live tuples**:

```text
  VACUUM TRIGGER LEVEL =  autovacuum_vacuum_threshold   +   ( live_tuples × scale_factor )
                           default: 50                    +   ( live_tuples × 0.2 )
                           (autovacuum_vacuum_scale_factor default 0.2)

  ┌──────────────────────────────────────────────────────────────────────┐
  │  orders — a 100-million-row table, 60% UPDATE/DELETE churn          │
  └──────────────────────────────────────────────────────────────────────┘

     live_tuples                                     = 100,000,000
     dead_tuples (since last vacuum)                 =  20,000,000

     trigger = 50 + (100,000,000 × 0.2)
             = 50 + 20,000,000
             = 20,000,050

     20,000,000  <  20,000,050   →  autovacuum does NOT trigger yet.

  ┌──────────────────────────────────────────────────────────────────────┐
  │  THE 20% PROBLEM, VISUALLY                                          │
  │                                                                      │
  │   live = 100,000,000 rows                                            │
  │   dead = 20,000,000 rows (20%)                                       │
  │                                                                      │
  │   trigger level ................................... 20,000,050          │
  │   dead tuples ..................................... 20,000,000 ──┐      │
  │                                                          ◄─────┘      │
  │   gap ............................................ 50 rows              │
  │                                                                      │
  │   VACUUM fires when the bar moves. At exactly 20% churn the bar is  │
  │   not cleared. A table churning at "roughly 20% a day" can sit one   │
  │   row under the threshold indefinitely, because the live count drops │
  │   as rows are removed, which LOWERS the bar... but the dead count    │
  │   keeps climbing, so it clears it. The pathological case is the     │
  │   table whose live count is SHRINKING fast: both numbers fall, and  │
  │   if dead falls proportionally slower, the table never gets cleaned.│
  └──────────────────────────────────────────────────────────────────────┘

  WHAT 20,000,000 DEAD TUPLES ACTUALLY COSTS

  dead tuple                  ~  24 B header + payload, often ~50 B with padding
  20,000,000 × ~300 B         ≈  6 GB  ←  ~15% bloat on a ~40 GB heap

  Every one of those rows is a version someone must walk past. A point query
  that used to touch 1 page now scans until it finds a visible one. Index-only
  scans regress, because Heap Fetches climbs. The table is simultaneously
  using more disk AND answering more slowly, which is what makes it hard to
  believe it is the same problem.

  THE USUAL CONVERSATION, AND THE USUAL WRONG ANSWER

  "the table is bloated, run VACUUM"
      → VACUUM reclaims the space for reuse INSIDE the file.
        Size on disk is unchanged. Scans still walk dead rows... no, they
        do not, once the line pointers are marked LP_DEAD/LP_UNUSED and the
        pages are truncated where possible. But the FILE is unchanged, and
        "df" still shows 400 GB.

  "the table is 400 GB on disk and only 2 GB is data"
      → the only things that shrink the file are VACUUM FULL (rewrites the
        table under an ACCESS EXCLUSIVE lock, blocking all reads and writes,
        needing 2× the disk free, and needing 2× the time), pg_repack (an
        extension: rebuilds into a new heap and swaps, near-zero lock time,
        still needs ~2× disk, still needs a primary key, and it is not
        transactional across failure without care), or CLUSTER (same as
        VACUUM FULL, worse). Pick pg_repack and say why.
```

Per-table overrides exist and are the right answer for a hot table whose global scale
factor makes it either vacuum constantly or never:

```sql
ALTER TABLE orders SET (
    autovacuum_vacuum_scale_factor  = 0.02,   -- vacuum at 2% dead, not 20%
    autovacuum_vacuum_threshold     = 1000,   -- and not below 1,000 rows
    autovacuum_analyze_scale_factor = 0.01,
    fillfactor                       = 85
);
```

The launcher wakes every `autovacuum_naptime` (default **60s**), computes which tables
exceed their thresholds, and hands each to a worker; there are
`autovacuum_max_workers` (default **3**) workers, so three tables vacuum concurrently and
everything else waits its turn. That is why a cluster with 400 tables has a permanently
non-empty `pg_stat_progress_vacuum` backlog: the work is spread over time, not parallelised
to the workload.

### 9.2 The Two Ways Autovacuum Starves

This is the highest-value operational fact in the chapter, and it is the one most
candidates have never been asked about.

**Autovacuum cannot remove a dead tuple that somebody might still see.** Vacuum walks the
visibility rules and marks a dead tuple removable only when no running snapshot could
possibly read it. It uses the oldest still-running transaction id as the horizon. So a
single long transaction pins dead tuples — and the pinning is **per-database**, because the
horizon is the oldest snapshot across every backend in the whole cluster, and a row in
`db1` can be pinned by a reader in `db2`:

```text
  ONE LONG TRANSACTION, THREE DATABASES, ONE STALLED CLUSTER

  backend 4711   BEGIN;  SET TRANSACTION ISOLATION LEVEL REPEATABLE READ;
                SELECT * FROM audit_log;     -- snapshot taken
                ... 41 minutes of nothing ...
                -- backend_xmin = 918,273 for the whole cluster

  ┌─────────────┐        ┌─────────────┐        ┌─────────────┐
  │   db1       │        │   db2       │        │   db3       │
  │  orders     │        │  events     │        │  sessions   │
  │             │        │             │        │             │
  │ 30M dead    │        │ 12M dead    │        │ 4M dead     │
  │ tuples      │        │ tuples      │        │ tuples      │
  │             │        │             │        │             │
  │  NOT        │        │  NOT        │        │  NOT        │
  │  VACUUMABLE │        │  VACUUMABLE │        │  VACUUMABLE │
  └─────────────┘        └─────────────┘        └─────────────┘
        ▲                      ▲                      ▲
        └──────────────────────┴──────────────────────┘
                    all pinned by the horizon 918,273,
                    which is set by a backend that has not
                    touched db1, db2 or db3 in 41 minutes.

  The classic source: an interactive psql session left open at a prompt
  inside a transaction. A BI tool holding a REPEATABLE READ snapshot
  open over a long refresh. A batch job that BEGINs, runs a report for an
  hour, and COMMITs at the end. A connection pool that wraps a whole request
  (or worse, a whole worker loop) in one transaction.
```

**Autovacuum cannot advance the freeze horizon either, for the same reason**, which is how a
long transaction escalates from "bloat" to "the database refuses all writes".

```sql
-- The single most useful autovacuum query
SELECT  n.nspname AS schema, rel.relname AS table,
        n_live_tup, n_dead_tup,
        round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 1)
            AS dead_pct,
        age(rel.relfrozenxid)  AS xid_age,
        last_autovacuum, last_autoanalyze,
        round(autovacuum_vacuum_scale_factor::numeric, 3) AS sf
FROM    pg_stat_user_tables rel
JOIN    pg_namespace n ON n.oid = rel.relnamespace
WHERE   n_live_tup + n_dead_tup > 10000
ORDER   BY n_dead_tup DESC
LIMIT   20;

-- the blockers, ranked. If this returns a row with a large xact age, you
-- have found the incident.
SELECT pid, datname, state,
       now() - xact_start    AS xact_age,
       now() - state_change   AS in_state_for,
       left(query, 120)       AS last_query
FROM   pg_stat_activity
WHERE  xact_start IS NOT NULL
ORDER  BY xact_start
LIMIT  20;

-- replication slots hold back the xmin horizon just as effectively as a
-- long transaction, and nobody thinks of them. A slot abandoned on a
-- decommissioned subscriber is a permanent vacuum freeze.
SELECT slot_name, active, wal_status,
       age(now() - xmin) AS xmin_age,
       age(now() - catalog_xmin) AS catalog_xmin_age
FROM   pg_replication_slots;

-- the write-stop, and the wraparound guard
SELECT datname, age(datfrozenxid) FROM pg_database ORDER BY 2 DESC;
```

The two other horizon-holders are the ones that show up in real incidents: **inactive
replication slots** (a subscriber decommissioned without `pg_drop_replication_slot`) and
**prepared transactions** (`PREPARE TRANSACTION` never committed — invisible in
`pg_stat_activity`, visible only in `pg_prepared_xacts`, and they pin everything forever).
Both are worth memorising as the answer to "vacuum stopped and nothing is running".

> **INTERVIEW TRAP — "A LONG TRANSACTION BLOCKS AUTOVACUUM FOR THE WHOLE DATABASE"**
>
> It is the whole cluster, not the whole database, and the mechanism is the `xmin`
> horizon. A backend that is inside a transaction has a `backend_xmin` — the oldest snapshot
> it might still read from. Autovacuum cannot mark a tuple dead-and-removable unless it can
> prove no running snapshot can see it, and the proof is global: the tuple's `xmin` must be
> older than the *oldest* `backend_xmin` anywhere in the cluster. So one `REPEATABLE READ`
> transaction in a `psql` prompt on `db3` pins dead tuples in `db1` indefinitely, and the
> symptom is not a lock — nothing is blocked, no `pg_blocking_pids()` entry exists — but
> tables that will not shrink while every query still runs at normal latency. The same
> horizon also gates the freeze, so a long transaction escalates the problem from bloat to
> transaction-ID wraparound protection. The three holders of the horizon are long
> transactions, replication slots, and prepared transactions, and the diagnostic is
> `pg_stat_activity` ordered by `xact_start`, plus `pg_replication_slots` and
> `pg_prepared_xacts` for the other two. The real fixes are `idle_in_transaction_session_timeout`
> (default **0**, i.e. off), a pooler that does not hand a connection back mid-transaction,
> and CI-time linting against a long transaction.

### 9.3 Transaction ID Wraparound

The 32-bit transaction ID space is about **4.29 billion** ids, and ids are consumed by every
`INSERT` and `UPDATE`. After about two billion *live* transactions the difference between the
current id and the oldest unfrozen id stops being representable in a signed 32-bit difference,
and PostgreSQL protects the database by **failing writes on purpose** rather than by allowing
id reuse — which would mean a committed row becoming invisible, i.e. silent, unfixable data
loss.

```text
  autovacuum_freeze_max_age   = 200,000,000   (default)

  xid_now - datfrozenxid  >  200,000,000   →  the autovacuum FREEZE pass
                                              becomes urgent (anti-wraparound)

  xid_now - datfrozenxid  →  ~2,000,000,000  →  WRITE STOP. The database refuses
                                               INSERT, UPDATE, DELETE, and anything
                                               that allocates an xid. It is
                                               readable. It is a full outage on
                                               the write path until an operator runs
                                               emergency VACUUM FREEZE.

  WHY IT FAILS HARD, ON PURPOSE
  Because the alternative is not a crash. It is a committed row whose xid is
  later reused by a different transaction, so the row appears to have been
  written by something that never happened, or vanishes from the database's
  view. A loud, total, obvious write outage is the recoverable failure. Silent
  corruption is not. This is a design decision you should be able to defend.

  WHAT DRAGS THE FREEZE HORIZON BACKWARDS  (all three pin autovacuum)
     - a long-running transaction                       ← pg_stat_activity
     - an inactive replication slot                     ← pg_replication_slots
     - a prepared transaction                           ← pg_prepared_xacts

  EMERGENCY RECOVERY (this is a "get it writable first" sequence)
     1. Stop the application so nothing allocates new xids.
     2. SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE xact_start < now() - interval '1 minute';
     3. Check pg_replication_slots; drop abandoned slots.
     4. Check pg_prepared_xacts; COMMIT PREPARED or ROLLBACK PREPARED each.
     5. SELECT age(datfrozenxid) FROM pg_database;   -- confirm it is falling
     6. VACUUM FREEZE;   -- a forced aggressive anti-wraparound pass
     7. Resume writes. Then fix what allowed the horizon to drift.
```

Note the asymmetry worth stating in an interview: the guard is 200 million, the write stop
is around 2 billion, so there is a very wide safety margin — the guard is designed to fire
*long* before the emergency, giving operators roughly a factor of ten in transaction
throughput to notice and act. The failure of that design is not the threshold; it is an
unnoticed 200-million-old transaction or an abandoned slot.

### 9.4 Index Bloat

Vacuum removes dead index entries lazily, and an index cannot be rebuilt in place the way a
heap is cleaned — hence:

- **`REINDEX`, not `VACUUM`, for index bloat.** `VACUUM` on a table does maintain indexes
  but only by the "one vacuum cycle per pass" rule, so a badly bloated index can take
  dozens of passes, and it cannot reduce the index below its high-water mark.
- **`REINDEX INDEX CONCURRENTLY`** (PostgreSQL 12+) rebuilds without taking the
  `ACCESS EXCLUSIVE` lock, so it is the only acceptable choice on a live system. It takes
  longer, cannot run inside a transaction block, and needs a clean `REINDEX` afterwards if
  it fails.
- **`REINDEX INDEX CONCURRENTLY` on a partitioned parent** rebuilds each partition
  (PostgreSQL 14+).
- **GIN bloat is a different animal.** GIN's pending list accumulates during
  `INSERT`s and is flushed by `VACUUM`; the "fastupdate" path keeps a pending list that
  makes writes cheap and reads slightly slower. If it grows unboundedly
  (`gin_pending_list_limit`, default 4 MB) queries degrade. Because the GIN structure's
  free space cannot be reclaimed incrementally, bloat there calls for a `REINDEX` —
  `pgstatginindex()` shows the pending list size.
- **Measuring it:** `pgstattuple` (an extension) gives exact numbers:

```sql
CREATE EXTENSION IF NOT EXISTS pgstattuple;

SELECT relname,
       pg_size_pretty(pg_relation_size(relid))                       AS heap,
       pg_size_pretty(pg_total_relation_size(relid))                AS total,
       pg_size_pretty(pg_indexes_size(relid))                        AS indexes,
       round(100 * (1 - (pg_relation_size(relid) - 24 * n_dead_tup)
                     / nullif(pg_relation_size(relid), 0)), 1)      AS bloat_pct,
       n_live_tup, n_dead_tup, n_mod_since_analyze
FROM   pgstatusertables
ORDER  BY pg_total_relation_size(relid) DESC
LIMIT  20;

-- per-index, which is where REINDEX decisions are made
SELECT relname, indexrelname,
       pg_size_pretty(pg_relation_size(indexrelid))    AS size,
       pg_size_pretty(pg_relation_size(indexrelid)
                      - pg_relation_size(reltable))    AS bloat
FROM   pg_stat_user_indexes
ORDER  BY pg_relation_size(indexrelid) DESC
LIMIT  25;
```

Note that the `bloat_pct` expression is an *approximation* based on dead-tuple count and a
flat 24-byte header, and is fine for ranking tables by suspicion. For a real number,
`pgstattuple`'s `pgstatindex` or a `pgstattuple` scan of the index is authoritative. Being
able to say "this is a heuristic, here's the exact tool" is the staff-level answer.

### 9.5 The Operational Surface

Two settings should be on in production before you need them, and neither is on by default:

```ini
# log every temp file, with the size — the ONLY reliable way to find a
# work_mem spill that does not show up as an obvious slow query
log_temp_files = 0

# log every autovacuum, so "why did it not run" is answerable from the log
log_autovacuum_min_duration = 0

# make lock waits visible before they become an incident
log_lock_waits = on
log_checkpoints = on
log_min_duration_statement = 500
```

`log_temp_files = 0` is the highest-value line in that list. A spill does not appear in
`pg_stat_statements` as slow (the spill time is often amortised over a cheap-looking plan),
and it does not show up as an error. It shows up as `Buffers: temp read=... written=...` in
`EXPLAIN (ANALYZE, BUFFERS)` and nowhere else unless you asked for it.

`pg_stat_statements` is the extension that turns "the database is slow" into a ranked list,
and it is an extension because it needs `shared_preload_libraries`:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- the query that matters first: total time, not mean time
SELECT calls,
       round(total_exec_time::numeric, 0)  AS total_ms,
       round(mean_exec_time::numeric, 2)   AS mean_ms,
       round(stddev_exec_time::numeric, 2) AS stddev_ms,
       rows,
       shared_blks_hit + shared_blks_read  AS blks,
       round(100.0 * shared_blks_hit
             / nullif(shared_blks_hit + shared_blks_read, 0), 1) AS hit_pct,
       left(query, 90) AS query
FROM   pg_stat_statements
ORDER  BY total_exec_time DESC
LIMIT  20;

-- I/O-bound suspects, and the temp-file spammers
SELECT query, calls, temp_blks_written,
       pg_size_pretty(temp_blks_written * 8192::numeric) AS temp_written
FROM   pg_stat_statements
WHERE  temp_blks_written > 0
ORDER  BY temp_blks_written DESC
LIMIT  20;

-- statements that write WAL more than they return rows — a good churn smell
SELECT query, calls, n_tup_ins, n_tup_upd, n_tup_del,
       round(wal_bytes::numeric / 1048576, 1) AS wal_mb
FROM   pg_stat_statements
WHERE  wal_bytes > 0
ORDER  BY wal_bytes DESC
LIMIT  20;
```

Other things worth having on the shelf, briefly:

- **`pg_stat_statements` reset discipline.** `pg_stat_statements_reset()` exists and teams
  use it during an incident — which destroys the baseline you needed. Prefer snapshotting
  the table to a scratch schema and diffing two snapshots.
- **`auto_explain`** with `log_min_duration` and `log_analyze` off, `log_nested_statements`
  on, is how you capture the plan for a query that only misbehaves sometimes. An extension,
  loaded per-session (`LOAD 'auto_explain'`) or in `shared_preload_libraries`.
- **`pg_stat_kcache`** and `pg_stat_io` (PostgreSQL 16+) for wait-event-level breakdown.
- **`track_io_timing = on`** for real per-checkpoint/per-backend I/O timing. It has
  measurable overhead, which is why it is off by default.
- **`idle_in_transaction_session_timeout`** — set it in a pooler or a role, not globally,
  and set it to something like 5 minutes. It is the single best guard against the Chapter 8
  long-transaction scenario.

> **PRODUCTION SCENARIO**
>
> Problem: A `REPORTS` table grew to 410 GB. A dashboard that returned in 2 seconds now
> times out at 30. No error appears anywhere; CPU is 12%.
> Investigation: `pg_stat_user_tables` shows `n_live_tup = 1.2M`, `n_dead_tup = 190M`,
> `last_autovacuum` eight days ago. The plan flipped from an index scan reading 400 pages
> to a bitmap heap scan with `Rows Removed by Filter: 190000000`. `EXPLAIN (ANALYZE,
> BUFFERS)` on the dashboard's own query confirms it. `pgstattuple` confirms ~92% of the
> heap is free space that is not being returned to the OS.
> Root cause: A nightly job runs `DELETE FROM reports WHERE created_at < now() - interval
> '90 days'` in one transaction and then runs `VACUUM ANALYZE` at the end. The `DELETE`
> marked 190M tuples dead but the follow-up `VACUUM` was blocked — or simply lost the race
> to a `VACUUM` that could not complete. Additionally, a read replica's connection was left
> in `idle in transaction` by a dashboard service for six days, holding the global `xmin`
> horizon and preventing the anti-wraparound and normal passes from reclaiming anything.
> Solution: Terminate the idle-in-transaction backend, set
> `idle_in_transaction_session_timeout = 5min` for the dashboard role, delete in batches
> (`DELETE ... WHERE id IN (SELECT id ... LIMIT 50000)` in a loop) so each vacuum can keep
> up, lower `autovacuum_vacuum_scale_factor` to 0.02 for this table, and reclaim the file
> with `pg_repack` during a maintenance window. Verify with `df` and `pgstattuple`, not with
> a guess.
> Prevention: Alert on `n_dead_tup / n_live_tup > 0.4` and on
> `age(datfrozenxid) > 150000000`. Monitor `pg_replication_slots` and `pg_prepared_xacts` in
> the same dashboard — they are the two silent horizon-holders. Make `log_temp_files = 0`
> and `log_autovacuum_min_duration = 0` defaults so the next one is diagnosable from logs.

#### Common Mistakes

- Believing `VACUUM` shrinks the data file — it frees space for reuse inside the file and
  only the file system stays the same size
- Running `VACUUM FULL` or `CLUSTER` on a live large table without noting the
  `ACCESS EXCLUSIVE` lock, the 2× disk requirement, and the 2× time
- Chasing autovacuum starvation as a CPU, I/O, or configuration problem when it is a single
  long transaction — or an inactive replication slot, or a prepared transaction — holding
  the `xmin` horizon
- Treating the per-database scope of the vacuum blocker as the issue when the horizon is
  cluster-wide, so a reader in one database pins tables in another
- Assuming index bloat is fixed by `VACUUM`; index bloat needs `REINDEX`, and
  `REINDEX INDEX CONCURRENTLY` on a live system
- Treating GIN bloat like heap bloat and waiting for `VACUUM` when the structure needs a
  `REINDEX` and a check of `gin_pending_list_limit`
- Calling `pg_stat_statements_reset()` during an incident, destroying the baseline
- `log_temp_files` left at its default, so a `work_mem` spill is invisible outside
  `EXPLAIN (ANALYZE, BUFFERS)`
- Assuming the `autovacuum_freeze_max_age` guard means a wraparound cannot happen — the
  guard depends on autovacuum making progress, which depends on the horizon moving
- Defaulting `idle_in_transaction_session_timeout` to 0 in a pooler and treating a `psql`
  prompt as harmless

#### Interview Questions — Operations & Autovacuum

**Q1. A long transaction is blocking autovacuum. What exactly is it doing, and how far does
it reach?** `STAFF`

Autovacuum cannot mark a tuple dead-and-removable until it can prove that no running
snapshot can still see it, and the proof is global: the tuple's `xmin` must be older than
the **oldest `backend_xmin` anywhere in the cluster**. A backend inside a transaction
publishes that value, and the minimum across all backends is the horizon autovacuum must
respect. So the reach is **cluster-wide, not per-database** — a `REPEATABLE READ`
transaction sitting in a `psql` prompt on `db3` pins dead tuples in `db1`, `db2` and `db3`
alike, and nothing appears blocked anywhere: no lock is held, `pg_blocking_pids()` returns
nothing, latency is normal, and tables simply will not shrink. It also gates the **freeze**
horizon, so a long transaction escalates the problem from bloat to transaction-ID
wraparound protection. Three things hold this horizon: long transactions, inactive
replication slots, and prepared transactions — and the last two are the ones teams do not
think of, because a slot abandoned when a subscriber was decommissioned and a
`PREPARE TRANSACTION` that was never committed are both invisible in `pg_stat_activity` and
both pin everything forever. The diagnostic is `pg_stat_activity` ordered by `xact_start`,
plus `pg_replication_slots` and `pg_prepared_xacts`. The fixes are
`idle_in_transaction_session_timeout` (default **0**), a pooler that never hands a
connection back mid-transaction, and a lint rule against long transactions.

**Q2. A table is 400 GB on disk and contains 2 GB of data. What do you do?** `STAFF`

First, establish the diagnosis rather than assuming — `pgstattuple` for the authoritative
free-space numbers, `pg_stat_user_tables` for `n_live_tup` versus `n_dead_tup`, and `df` to
confirm the file itself is 400 GB. The cause is almost always mass `DELETE` or `UPDATE`:
`VACUUM` reclaims dead space for reuse *inside* the file and does not return it to the
operating system, so the file stays at its high-water mark and, because dead tuples are
still line pointers and still occupy page slots, the table can also be scanning more pages
than it needs to. Then the decision. `VACUUM FULL` rewrites the table and truncates the
file, but it takes `ACCESS EXCLUSIVE` for the duration — every read and write on that table
blocks — and it needs roughly twice the table's size free in disk and twice the time. For
most production tables the answer is **`pg_repack`**: it rebuilds into a new heap, swaps,
and takes only a brief `ACCESS EXCLUSIVE`, so a 400 GB table is repacked in a maintenance
window rather than a weekend outage. Its requirements — a `PRIMARY KEY`, ~2× disk, and care
about behaviour on failure — should be said out loud. `CLUSTER` is the same locking story as
`VACUUM FULL` plus a full sort. The real fix is upstream: delete in batches small enough that
autovacuum keeps up, lower `autovacuum_vacuum_scale_factor` to around 0.02 for that table,
and consider partitioning by date so the drop is a partition detach rather than a mass
delete. Being able to name the two options *and* the operational cost of each is the staff
answer.

**Q3. Transaction ID wraparound. What happens, why, and what are the guard rails?** `ADVANCED`

The `xid` space is 32 bits, so roughly **4.29 billion** ids, and every `INSERT` and `UPDATE`
consumes one. What PostgreSQL protects is not the id space but the *difference* between the
current id and the oldest unfrozen id, and once that difference stops fitting in a signed
32-bit value, ids can repeat — at which point a committed row's `xmin` could be reused by a
later transaction and the row would either vanish from the database's view or appear to have
been written by something that never happened. That is silent, unrecoverable corruption. So
the design decision is to **fail hard on purpose**: `autovacuum_freeze_max_age` (default
**200,000,000**) makes the anti-wraparound freeze pass urgent long before the danger point,
and at roughly **2 billion** transactions of distance the database enters a write stop —
`INSERT`, `UPDATE` and `DELETE` are refused — while remaining fully readable. A loud,
total, obvious write outage is recoverable; silent corruption is not, and being able to
defend that trade-off is the substance of the answer. The failure mode is never the
threshold; it is the horizon failing to advance, because the anti-wraparound pass is
blocked by exactly the three things from the previous question: a long transaction, an
inactive replication slot, and a prepared transaction. The emergency sequence is: stop the
application so nothing allocates new ids, terminate long `xact_start` backends, drop
abandoned slots, resolve `pg_prepared_xacts`, watch `age(datfrozenxid)` fall, then
`VACUUM FREEZE`, then resume writes and fix what allowed the drift. The preventive
monitoring is an alert on `age(datfrozenxid) > 150000000`, which fires with a very wide
margin before the write stop.

**Q4. How do you find the query that is actually hurting you?** `STAFF`

In this order, because each step costs more than the last and most incidents are answered
in the first two. One, **is it the database at all** — check `pg_stat_activity` for
`wait_event_type` and `wait_event`; `Pg`/`Lock` means it is not CPU-bound, and knowing it is
a lock wait rather than slow execution changes the entire investigation. Two,
**`pg_stat_statements` ordered by `total_exec_time`**, not `mean_exec_time` — a 40 ms query
called 4 million times costs more than a 4-second report called once, and ranking by the mean
finds the wrong query first. Then three, `EXPLAIN (ANALYZE, BUFFERS)` on the winner, reading
specifically: `Rows Removed by Filter` (an index that is not selective or statistics that are
stale), `Buffers: temp read=... written=...` (a `work_mem` spill that is otherwise invisible
everywhere), `Sort Method: external merge` (the same), `Heap Fetches` on an index-only scan
(the visibility map is not all-visible, so autovacuum is behind), and a `Seq Scan` on a
large table (either genuinely correct, or stale statistics). Four, and only then, reach for
`auto_explain` with a `log_min_duration` threshold, because the queries that hurt are
frequently the ones that only misbehave during a particular data distribution. The discipline
worth stating: **do not call `pg_stat_statements_reset()` during an incident.** Snapshot the
view to a scratch table and diff two snapshots instead, so you keep the baseline that
explains why the query is now slow. `log_temp_files = 0` should already be on, because a
spill has no other footprint.

**Q5. `enable_seqscan = off`. When is it appropriate?** `TRICKY`

As a **diagnostic, never as a fix.** Its legitimate use is to ask one question — "would the
planner have used this index if it costed it honestly?" — by forcing the alternative and
comparing. If forcing the index produces a plan that is dramatically faster, you have
learned that the planner's cost estimate is wrong, and the *real* work is to fix the estimate:
`ANALYZE` the table, raise `default_statistics_target` on the skewed column, create extended
statistics with `CREATE STATISTICS` for correlated columns the planner assumes are
independent, or fix genuinely stale statistics after a bulk load. If forcing the index
produces something *slower*, which is common, you have learned the planner was right. Leaving
`enable_seqscan = off` in place is an outage waiting to happen: it is a session-level GUC, so
in a pooled environment it may not even apply to the connection you are testing, it will
propagate to every query in that session including ones the index does not suit, and it
converts a well-modelled small-table sequential scan into an index scan that is slower.
Two related notes. For a genuinely sequential-looking query, prefer the actual tool,
`EXPLAIN (ANALYZE, BUFFERS)`, and check the numbers rather than overriding the planner. And
for the specific "I want a sequential scan, always" requirement, the index and the query must
agree — the planner is choosing between them on cost, and the fix is to remove the competing
index or make the index match the query, not to switch a flag off.

#### Further Reading

- [PostgreSQL — Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — thresholds, freeze, and the whole autovacuum model in one page.
- [PostgreSQL — VACUUM](https://www.postgresql.org/docs/current/sql-vacuum.html) — what `VACUUM` reclaims, `VACUUM FULL`'s lock, and the full parameter list.
- [PostgreSQL — REINDEX](https://www.postgresql.org/docs/current/sql-reindex.html) — `CONCURRENTLY`, its preconditions, and why index bloat is not a vacuum problem.
- [PostgreSQL — Transaction ID Wraparound](https://www.postgresql.org/docs/current/explicit-locking.html) — the fail-hard design, `autovacuum_freeze_max_age`, and the recovery sequence.
- [PostgreSQL — pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) — the columns that matter (`total_exec_time`, `temp_blks_written`, `wal_bytes`) and the reset caveat.
- [PostgreSQL — Monitoring Statistics](https://www.postgresql.org/docs/current/monitoring-stats.html) — `pg_stat_activity`, `pg_stat_user_tables`, `pg_stat_progress_vacuum`, and the wait-event catalogue.

> **CHAPTER 9 SUMMARY**
>
> Autovacuum reclaims space for reuse inside the file; only `VACUUM FULL`, `CLUSTER` or
> `pg_repack` returns it to the operating system, and the choice is really about whether you
> can afford an `ACCESS EXCLUSIVE` lock and twice the disk. The trigger is
> `autovacuum_vacuum_threshold` (50) plus `autovacuum_vacuum_scale_factor` (0.2) times live
> tuples, so on a 100M-row table churning 20% the bar sits 50 rows above the dead-tuple
> count, and the resulting ~6 GB of dead versions is what every scan walks past. Autovacuum
> starves when something holds the `xmin` horizon, and that horizon is **cluster-wide** — a
> single long transaction in an idle `psql` prompt pins dead tuples in databases it has never
> touched, blocks nothing, and raises no error. The three holders are long transactions,
> inactive replication slots, and prepared transactions; the same horizon gates the freeze, so
> the escalation path runs from bloat to the 32-bit wraparound guard
> (`autovacuum_freeze_max_age` 200,000,000, write stop near 2 billion), where PostgreSQL
> fails writes on purpose because the alternative is silent corruption. Index bloat is a
> `REINDEX` problem, not a `VACUUM` one, and GIN bloat is neither — it needs
> `pgstatginindex` and a rebuild. Operationally, `log_temp_files = 0`,
> `log_autovacuum_min_duration = 0` and `pg_stat_statements` ranked by `total_exec_time` are
> the three things that turn the next incident into a query instead of an investigation.

### End of Volume 7

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain why a single long-running transaction stops every vacuum in the database from
  reclaiming anything, and name the query that finds the holder
- State the `SERIALIZABLE` mechanism precisely enough to say why aborting at `COMMIT` is
  correct, and write the retry loop that handles `40001` and `40P01`
- Compute the memory exposure of a query from `work_mem`, the plan's node count, the
  parallel worker count and the connection count — and explain why a global `work_mem`
  change is an OOM incident
- Diagnose a `work_mem` spill from `EXPLAIN (ANALYZE, BUFFERS)`, including reading the temp
  buffer line, and say when the right fix is an index rather than a GUC
- Distinguish table bloat from index bloat, name the tool for each, and give the repair
  ladder from `VACUUM` through `REINDEX CONCURRENTLY` to `pg_repack`
- Explain the visibility rule using `xmin`/`xmax`/`ctid`, and say what the in-progress list
  is for
- Justify `jsonb` over columns with the "flexibility is only valuable while you are still
  discovering the shape" frame, including the GIN write cost
- Choose between B-tree, GIN, GiST and BRIN for a given predicate, and say which failure
  mode is unique to BRIN
- Read a plan well enough to name the first node where the estimate and the actual diverge
  and treat everything above it as downstream

### Coming in Volume 8 — MySQL

Volume 7 took the portable model from Volumes 1 to 6 and showed you the exact machinery
PostgreSQL uses to implement it: a process per connection, an 8 kB slotted heap with TOAST
and a visibility map, snapshot-based MVCC with a global vacuum horizon, a type system you
can extend with `CREATE EXTENSION`, six index access methods, and an SSI-based
`SERIALIZABLE`. Volume 8 takes the same problems and a deliberately different set of
trade-offs, because the point of the pair is that nothing in Chapters 1 to 9 of this volume
was arbitrary.

InnoDB makes the **clustered index the table**: rows live in the B+ tree leaf in primary
key order, secondary indexes store `(secondary_key, primary_key)`, and every secondary
lookup costs a second descent. That single decision moves cost between reads and writes in
a way that makes "which engine is faster" the wrong question and "what is your read-to-write
ratio and your row width" the right one. InnoDB's `REPEATABLE READ` is **lock-based** with
next-key and gap locks, so it prevents phantoms and read skew — and pays for it with a
deadlock rate and lock-wait profile PostgreSQL does not have. And because the undo log
doubles as the MVCC read path, "purge" becomes a visible, sometimes alarming background
process rather than an invisible autovacuum, and the same long-transaction problem arrives
with a different name and a different diagnostic. Same problems, different trade-offs, and
knowing why both choices were made is what makes you able to defend either one in a design
review.

## Chapter 10 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). The **D** questions are the ones that separate a
senior answer from a staff one: they push on scale, cost, reversibility, and organisational
fit rather than API correctness. This bank is weighted toward **D**, because the
PostgreSQL-specific facts in this volume — the horizon, SSI, `work_mem` multiplication,
`SKIP LOCKED` — are exactly the facts that a candidate either owns or does not, and
memorising them without a trade-off attached does not survive a design review.

### Process Model & Connections

**D1. Your service has a HikariCP pool of 20, and there are eight instances in production.
PostgreSQL has `max_connections = 100`. A ninth deployment goes out and the database starts
refusing connections. What is the systemic fix, and what would you say if someone proposed
raising `max_connections` to 400 instead?** `STAFF`

Eight instances at a full pool of 20 is 160 connections against a limit of 100, so the
deployment was never going to work and the refusal is the system working correctly. The
systemic fix is to make the connection budget explicit and cluster-wide: pick a total
(PostgreSQL connections minus headroom for administration, monitoring, migrations, and
replication — say 60 of 100), divide it across services by *weight* rather than by instance
count, and put PgBouncer in front so each instance can hold a large application-side pool
against a small server-side one. That converts a per-instance pool size into a per-service
allocation, which is the thing you can actually reason about and change. The argument
against raising `max_connections` to 400 is the one from Chapter 1: 400 is not 400 socket
descriptors, it is 400 OS processes with a multi-megabyte private baseline each, and each
running a query multiplies that by `work_mem` per plan node per parallel worker. The
refusal is replaced by an OOM killer choosing the largest-RSS backend, which is usually a
legitimate query, so the symptom becomes a random pattern of failed queries with no
traceable cause. And the hidden third option people forget: the 400 *is* achievable on a
large instance, but only after you have done the memory arithmetic and raised
`shared_buffers` deliberately, which is a capacity conversation rather than a config edit.

**P1. A deploy rolls out and within four minutes, about 5% of requests fail with
`FATAL: sorry, too many clients already`. Nothing else is wrong. What happened and what is
the immediate mitigation?** `TRICKY`

Almost certainly connection churn rather than a sudden increase in load. A new release
that fails health checks and restarts, a load balancer whose health check *establishes a
real connection* rather than a cheap probe, a cron that fans out to forty parallel jobs, or
a connection pool that is being resized to a much larger number by a config change — each
produces many short-lived backends, and the postmaster's fork rate becomes the bottleneck
before the count does. The immediate mitigation is to buy time: put PgBouncer in front, or
if that is not available, reduce the per-instance pool size so `instances × pool` is under
the limit. The durable fix is a `LISTEN`/`NOTIFY`-free health check that does not open a
session (a TCP connect to the port is enough), a declared per-service connection budget, and
`pg_stat_database`'s `numbackends` and `pg_stat_activity` history in a dashboard so churn
is visible before it is fatal. The follow-up worth raising: a fork storm degrades *every*
query's latency, so the next symptom after the connection errors — if the limit had been
higher — would have been a general slowdown with clean `EXPLAIN` output, which is much
harder to attribute.

**T1. PgBouncer is running in transaction mode. A service issues `SET search_path TO
tenant_42` at the start of a request, then runs three queries, then returns the connection
to the pool. What is the bug, and what is the failure it produces?** `TRICKY`

Two bugs in one. First, the `SET` is session-scoped, and in transaction mode the session is
not the request's — so the setting persists on the server connection and the *next*
request that borrows it inherits `search_path = tenant_42`, and it will run its queries
against the wrong schema. Second, there is a worse variant if the three queries are not
inside an explicit transaction: in transaction mode PgBouncer can hand the server
connection to a different client between statements, so even a request's own three queries
may not run on the same backend. The failure is a cross-tenant data leak in a multi-tenant
schema-per-tenant design, and it is silent — no error, no log line, just occasionally wrong
data. The fix is `SET LOCAL search_path` inside an explicit transaction, which is scoped to
the transaction and discarded at commit; and the discipline of every query sequence in the
request being inside one transaction. The more general statement: in transaction mode, any
session-scoped state — `SET`, `LISTEN`, `WITH HOLD` cursors, session advisory locks, named
prepared statements — is either shared with another tenant or lost between statements, and
a code review that greps for `SET ` outside a transaction block is worth writing.

**S1. A PR adds a `pg_advisory_lock(42)` call around a batch job to stop two instances from
running it simultaneously. What is the review comment?** `STAFF`

Two problems, one of which is a correctness bug and one of which is a design comment. The
correctness problem is that `pg_advisory_lock` is *session*-scoped, and in a pooled
connection it is released only by an explicit `pg_advisory_unlock` — which is skipped on
every error path, on every crash, and on every connection that the pool decides to retire.
The next request to borrow that connection holds a lock nobody can see, and the job never
runs again. The fix is `pg_advisory_xact_lock`, which is released automatically at commit or
rollback and cannot leak. The design comment is the key: `42` is in the *global* advisory
lock space, so it conflicts with every other subsystem's use of the integers around it, and
nobody reading the code can tell what resource it protects. It should be namespaced —
`hashtext('invoice-import')` or a hand-allocated 64-bit key — and it should be acquired for
the shortest possible window, because it is a global contention point invisible to the
table-level lock tooling that on-call actually looks at.

**D2. A `SERIALIZABLE` transaction is aborted at `COMMIT` with `could not serialize access
due to read/write dependencies among transactions`. Is this a bug, and what does the
application have to do?** `STAFF`

Not a bug — it is the mechanism. PostgreSQL's `SERIALIZABLE` is Serializable Snapshot
Isolation, not lock-based: the transaction runs optimistically under a snapshot, the
database tracks predicate locks and detects whether the outcome could correspond to any
serial order, and if it cannot, one of the participants is aborted. The point at which there
is enough information is usually `COMMIT`, so that is where it surfaces. `SQLSTATE 40001`
is the correct delivery of the guarantee. The application must retry — the *entire*
transaction, from the first statement, because the reads are what determined the outcome —
with bounded attempts and exponential backoff plus jitter, since an immediate retry under
contention makes the contention worse. `40P01` (deadlock) belongs in the same handler. The
staff-level follow-up, which is the one that actually improves the system: before building
a retry loop, check whether the invariant can be expressed as a constraint — a `CHECK`, a
unique index, an `EXCLUDE USING gist` — because a constraint needs no retry, covers the
write paths you did not write, and is not vulnerable to a transaction that contains a
non-idempotent side effect. Retry loops are the right answer when the invariant genuinely
spans rows that cannot be constrained, and a liability when the transaction also calls an
external API.

**D3. `work_mem` is 4 MB. A single query has a hash join, a sort, a bitmap heap scan and a
`Materialize`, and it runs with four parallel workers. How much memory can it use, and what
does that tell you about the correct value of `work_mem`?** `ADVANCED`

Not 16 MB. `work_mem` is a cap per *node*, not per query, so four nodes can each allocate
up to 4 MB, and hash operations are additionally scaled by `hash_mem_multiplier` (default
2.0, PostgreSQL 16+) so the hash table alone can reach 8 MB — call it 20 MB for the
leader. Every parallel worker runs the same subtree with its own allocations, so four
workers plus the leader is five times that, on the order of 100 MB for a *single query*. And
that is per concurrent query, per connection. The conclusion is the one that matters
operationally: `work_mem` is not a per-connection budget and cannot be reasoned about as
one, so setting it globally to "a value that makes my worst query fast" multiplies into a
figure no one has budgeted, and the result is the OOM kill from Chapter 1. The correct
practice is to leave the global default alone, raise it narrowly with `SET LOCAL` for the
two or three proven queries that spill, and to spend the effort instead on the
lower-cost levers — an index that eliminates the sort, `random_page_cost` and
`effective_cache_size` so the planner stops making bad scan decisions, and `work_mem` raised
only where a measured spill justifies it. A separate point worth raising: `hash_mem_multiplier`
exists precisely because hash operations need more headroom than sorts for the same
`work_mem`, and it is the reason a session that has raised `work_mem` for its sorts can
still see a hash spill.

### Storage & TOAST

**D4. A table has ten `text` columns, one of which held a 3 MB JSON document for a while and
has since been shrunk to 400 bytes. Scans on this table got 3x slower over six months and
nothing in the schema changed. Explain, and give the fix ladder.** `STAFF`

The page does not compact. A PostgreSQL heap page is slotted, an update never moves an
existing tuple, and a tuple that has once been 3 MB has pushed other tuples out of its
page, and when the value shrank the space stayed as a hole. The page is now shaped around a
row that no longer exists, so every sequential scan reads 8 kB to obtain 400 bytes of live
data, and the same effect appears in the TOAST relation and in every index. The
confirmation is `pgstattuple` on the table reporting a `tuple_percent` far below what the
current average row width predicts, plus `pg_column_size(ROW(...))` showing a small row
next to a large relation size. The fix ladder, in order: `VACUUM` (which marks the space
reusable and repaints the visibility map, and is non-blocking, but does *not* return space
and does not compact pages) — so this is necessary and not sufficient; `pg_repack`, which
rewrites the table online into a tight copy and is the right answer in production; and
`VACUUM FULL`, which does the same rewrite with an `ACCESS EXCLUSIVE` lock and roughly
double the disk, for a maintenance window. The prevention is a `fillfactor` below 100 on
any table with a column that can grow, so there is room for the update to be HOT, and a
schema that does not put unbounded blobs in a relational column in the first place.

**P2. `SELECT id, title FROM articles` on a 3 GB table with a `body` column that was
declared `text` and holds multi-megagraph HTML. The team did not add a `jsonb` column and
does not have a title index. What is actually happening, and why is it worse than the row
count suggests?** `TRICKY`

Two independent problems, and the team has misidentified neither. First, TOAST: a `text`
column over roughly 2 kB triggers compression, and if it is still over the threshold it
moves out of line, so the row's width on the heap page is tiny and the scan reads almost
nothing per row — *unless* a query touches `body`, in which case each such row costs a
separate chunk fetch, a random read, on top of the sequential scan. The trap here is the
inverse of the usual one: a query that carefully avoids the wide column is *faster*, so
nobody has a "why is the wide table slow" ticket; the cost shows up only in the queries
that do select it, and it is a per-row random read. Second, no index on `title` and no
`WHERE` clause, so this is a full scan of 3 GB, and `TOAST` compression means each of the
375,000 rows needs decompressing if the tuple is stored inline — a CPU cost the plan will
not show you. The fix is to project only what is needed, to consider `SET STORAGE EXTERNAL`
or a separate `bytea` for already-compressed payloads so the write path stops burning PGLZ
on incompressible data, and to put the columns that are actually filtered on into an index.
The staff-level observation: the symptom people report ("the table is slow") is usually one
of three different problems — page count, decompression CPU, or out-of-line chunk fetches —
and `EXPLAIN (ANALYZE, BUFFERS)` plus `pg_column_size` distinguishes them in a minute.

**T2. A table has `pg_column_size(ROW(...))` of 1,200 bytes and the query returns 50,000
rows. How many pages does the sequential scan touch, and what number would surprise you?**
`TRICKY`

Roughly 50,000 × 1,200 / 8,192 ≈ 7,300 pages, plus headers, plus the fact that the slots
and free space mean the real number is higher — call it 8,000. The number that surprises
people is the *opposite* direction: a 200-byte row on a table that once held 3 MB rows
gives the same page count, because the pages are still shaped around the old tuples. Row
width drives the ideal page count; history determines the actual one, and the gap between
them is exactly what `pgstattuple`'s `tuple_percent` measures. The second surprise is that
the page count is not the whole cost: at 8,000 pages, whether the query takes 50 ms or 5
seconds depends almost entirely on whether those pages are in `shared_buffers`, which is
what the `Buffers: shared hit=... read=...` line in `EXPLAIN (ANALYZE, BUFFERS)` is for.
A 100% cached 8,000-page scan is fast; a 5% cached one is I/O-bound, and the plan output
distinguishes them in one line that people do not read.

**S1. A PR adds `SELECT ... AS payload` to six reporting queries, where `payload` is a
`jsonb` column. What does the reviewer need to ask?** `TRICKY`

Whether there is a GIN index and which opclass. A containment predicate on `jsonb` is fast
with a GIN index and a sequential scan over a parsed binary document without one, and
"return the whole document" is neither — `SELECT payload` reads and decomposes every
matching row regardless of any index, so the cost is proportional to the *size of the
result*, not to how selective the query was. If the six queries are extracting a single
key, the right index is a B-tree on `((payload ->> 'key'))`, which is much smaller and much
faster than a GIN over the whole document. If they are doing containment, GIN with
`jsonb_path_ops` is right and `jsonb_ops` is a waste of disk and write amplification for a
workload that only uses `@>`. The other question is whether the six queries are now the
reason the table's `jsonb` is 40% of the disk — because a `jsonb` column that six queries
pull whole is a design decision worth naming in the review rather than discovering in a
`pgstattuple` report later.

**T3. A row has a 900-byte `text` column and a 4 MB `bytea` column holding already-compressed
JPEG data. What does the `INSERT` actually do, and what does `SET STORAGE` change?** `TRICKY`

Both columns are TOAST candidates and they take different paths. The 900-byte `text` stays
inline: the TOAST threshold is per *row* (about 2 kB), and a 900-byte column does not push
the row past it on its own, so no compression and no relocation. The 4 MB `bytea` does not:
the row is far over the threshold, so PostgreSQL first tries to **compress** it, and JPEG
does not compress — so the compressor burns CPU, produces output nearly the size of the
input, and the column is then relocated out of line into the TOAST relation and stored as
chunks. That wasted compression pass is the cost people discover only by profiling
inserts. The fix is per-column `SET STORAGE`: `ALTER TABLE photos ALTER COLUMN data SET
STORAGE EXTERNAL` tells PostgreSQL to relocate the column out of line but skip
compression, which is exactly right for an already-compressed payload; `SET STORAGE MAIN`
does the opposite — keep it inline, compress it, never relocate — and is right for a long
text column that is always read with the rest of the row; `PLAIN` disables both and makes
an over-large value an outright error at insert time. The version detail worth knowing is
that LZ4 became available as a compression method in PostgreSQL 14 and is usually several
times faster than the default PGLZ at a modest ratio cost, set with `ALTER TABLE ... SET
(toast_compression = lz4)`; check the current docs for what has been added since, because
this list has grown more than once.

**D5. When is it correct to put a document in `jsonb`, and when is `jsonb` just a slow
`SELECT *` in disguise?** `STAFF`

`jsonb` is right when the shape is genuinely not yet known, the attributes are sparse and
per-entity, and the read pattern is "fetch the document" plus occasional containment. It is
a slow `SELECT *` in disguise when the attributes are queried by name across many rows, or
participate in joins, or need a foreign key, a `NOT NULL` or a `CHECK` — none of which
`jsonb` gives you without a trigger or a hand-written expression index — or when the
predicate uses a *computed* key, because an expression index cannot cover a computed key and
you fall back to a full scan of a blob. The costs people under-count are on the write path:
a GIN index over `jsonb` is large, and every document update is a delete plus a re-insert
of every indexed key, so the flexibility is paid on every write, not just at migration
time. The decision frame is the one that holds up: **flexibility is only valuable while you
are still discovering the shape**, and the expected sequence is that a `jsonb` column
adopted for flexibility gets a second query with a computed key, gets a GIN index to
compensate, sees write throughput drop, and then gets promoted to real columns. That
sequence is a healthy evolution and a team that has planned for it — by keeping the
promotion cheap, e.g. keeping the JSON keys derived from a source of truth rather than
hand-written — is doing well. A team that has treated `jsonb` as "we will never migrate"
for two years has a blob with a query interface.

### MVCC & Visibility

**D6. A report query returns inconsistent totals: the sum of per-day revenue does not match
the sum of per-region revenue. A transaction is open for six hours every night. What is the
most likely mechanism, and what is the correct fix?** `ADVANCED`

Two candidate mechanisms, and the six-hour transaction is the reason to look at the second
first. The obvious one is a grain mismatch — the two queries aggregate at different grains
and one fans out — but that produces a *deterministic* discrepancy, not one that varies
between runs, and the question says inconsistent. The MVCC mechanism is read skew: a
`REPEATABLE READ` transaction in PostgreSQL takes one snapshot for the whole transaction,
which gives a perfectly self-consistent view *of the snapshot*, and the snapshot itself can
be inconsistent with concurrently committed transactions. So a query that reads the orders
table, then the refunds table, then the exchange-rate table, at a snapshot that predates some
of those tables' recent commits, can see a world that never existed at any single instant —
and the discrepancy appears only when a transaction was open across a commit boundary. The
fix is not to abandon `REPEATABLE READ` — it is doing its job. The fixes are: take all the
reads at one consistent grain in one pass (which removes read skew structurally, because
there is no gap between the reads), or take the read and the reconciliation inside a
transaction with `FOR UPDATE` locks on the rows being reconciled so nothing can change
between the two reads, or use `SERIALIZABLE` and retry. And the six-hour transaction is a
separate finding that must be fixed regardless: it is starving vacuum for the whole
cluster, which means the bloat the report is complaining about is being caused by the same
process that is producing the inconsistent numbers.

**P3. `pg_stat_user_tables` shows `events` with `n_live_tup = 240,000,000`,
`n_dead_tup = 61,000,000`, and `last_autovacuum` eleven days ago. Autovacuum is enabled.
What is your investigation, in order?** `TRICKY`

The first question is not "why is autovacuum slow", it is "is autovacuum *able* to do
anything". `pg_stat_activity` filtered to `backend_xmin IS NOT NULL`, ordered by
`xact_start` — if there is a row, the global `xmin` horizon is held back and every vacuum
in the cluster is unable to reclaim anything, which perfectly explains both the dead-tuple
count and the stale `last_autovacuum`. Then check that row's `state`: `idle in transaction`
means the holder is doing nothing, which is the common case, and the immediate fix is to
terminate it and set `idle_in_transaction_session_timeout`. If nothing holds the horizon,
then autovacuum is genuinely behind, and the next questions are `autovacuum_max_workers`
(default 3, shared across every database in the cluster) against how many tables need work,
and the trigger arithmetic: at `autovacuum_vacuum_scale_factor = 0.20` on a 240-million-row
table the trigger is 48 million dead tuples, so 61 million means it is *above* the trigger
and the vacuum is running but not catching up. The levers are more workers, a per-table
`autovacuum_vacuum_scale_factor = 0.02`, and a higher `autovacuum_vacuum_cost_limit` with
`autovacuum_vacuum_cost_delay = 0` so the worker is not deliberately throttled. And the
last question, which is the one that stops the recurrence: what is making 61 million rows
dead in the first week, and is it a missing index on an updated column, an update-heavy
table at `fillfactor = 100`, or a pattern that should be an append-only table plus a
derived view?

**T3. Transaction T1 at `READ COMMITTED` runs `SELECT * FROM t WHERE id = 1`. Transaction
T2 updates row 1, changes `status` to `'archived'`, and commits. Now T1 runs
`SELECT * FROM t WHERE id = 1 AND status = 'active' FOR UPDATE`. What does T1 get, and why
is it different under `REPEATABLE READ`?** `TRICKY`

Under `READ COMMITTED`, T1 gets **zero rows**, and this is correct, expected behaviour. When
`FOR UPDATE` finds that the row it read has been updated by a transaction that has since
committed, it follows the update to the *newer* version and **re-evaluates the `WHERE`
clause against that newer version**; `status` is now `'archived'`, so the row no longer
matches and it is silently skipped. The guarantee `FOR UPDATE` gives under `READ COMMITTED`
is "I have locked a row that *currently* matches", not "I have locked the row I saw" — and
that difference is the source of a whole class of "my worker found no row" bugs. Under
`REPEATABLE READ` the same query does not return zero rows; it raises `ERROR: could not
serialize access due to concurrent update` (`40001`), because the snapshot's version is no
longer current and PostgreSQL refuses rather than re-checking. The design consequence: a
`SELECT ... FOR UPDATE` that expects to find a row must be in a loop, and the `WHERE` clause
should include the state the caller needs (so re-evaluation cannot silently drop the row) —
and any code that treats "no rows" as a terminal condition is wrong under `READ COMMITTED`.

**S2. A PR adds `SELECT count(*) FROM audit_log` to a health-check endpoint that runs every
10 seconds. What is the review comment?** `STAFF`

That it is a full table scan on a table that is append-only and therefore the largest table
in the database, executed every ten seconds forever. On a 500-million-row `audit_log` that
is tens of gigabytes read per hour, it will keep the visibility map from being useful, and
it will show up in `pg_stat_statements` as a top-5 consumer by total time — polluting the
exact tool people reach for during an incident. The correct health check is a
connectivity-and-liveness probe that does not open a session at all, or if a query is
genuinely needed, a `SELECT 1` plus a check of a small, indexed, recently-written table.
The second comment, which is the more valuable one: if the reason for the check is "is the
database healthy", then the useful signal is
`pg_stat_activity.wait_event_type` and the count of sessions in `idle in transaction` —
both of which are cheap — and not a count of a table that only ever grows. The third
comment is about placement: this is the kind of query that belongs in a monitoring
dashboard computed on a schedule, not in a request path that a load balancer can hit N
times a second.

**T4. Three sessions each run `SELECT ... FOR SHARE` on the same row. A fourth runs
`SELECT ... FOR UPDATE`. What is actually stored, and what must autovacuum do to reclaim
the row?** `ADVANCED`

The first three shared lockers all need the same *kind* of lock, and a single `xmax` field
cannot hold three transaction ids, so PostgreSQL stores a **multi-transaction id** in
`xmax` and sets `HEAP_XMAX_IS_MULTI` in the tuple's infomask. The `FOR UPDATE` then
upgrades: because the new request conflicts with the existing shared locks, it waits for
all three to release, and only then takes the row lock and writes its own `xmax`, replacing
the multixact. This matters operationally because a multixact must be *resolved* before the
tuple can be removed, and resolving one means visiting every member transaction to discover
whether it committed or aborted — so a row that has been shared-locked by many short
transactions costs vacuum real work, and it is one reason a table with an aggressive
`FOR SHARE` pattern vacuums more slowly than its size predicts. The related detail is the
one that explains a design choice in the foreign-key machinery: a single `FOR KEY SHARE`
lock fits directly in `xmax` (`HEAP_XMAX_LOCK_ONLY`, no multixact), which is why
PostgreSQL's foreign-key checks take `FOR KEY SHARE` rather than `FOR UPDATE` — a row
contended by many concurrent references therefore does not become a multixact at all, and
conversely a schema that takes `FOR UPDATE` where `FOR NO KEY UPDATE` would do pays the
multixact cost for no benefit.

**P4. Two sessions each run `SELECT count(*) FROM orders` inside a `READ COMMITTED`
transaction, ten minutes apart, and the counts differ. Is that a bug?** `STAFF`

No, and the mechanism is worth being precise about because it is the most misunderstood
property of PostgreSQL's default isolation level. In `READ COMMITTED` each *statement*
takes a fresh snapshot, so the two counts see the database as of two different instants and
anything committed in between is in the second count and not the first. That is not an
anomaly in the ANSI sense — no individual statement saw an inconsistent view — which is
exactly what the level promises. The bug appears when application code assumes the
*transaction* is a consistent snapshot, and it takes the form of a check-then-act: read the
count, decide, write, all inside a transaction the developer believed was stable. Two
concurrent transactions can both pass a "there is capacity" check and both commit, and the
code meant to prevent overselling did not prevent it. The fix depends on the shape of the
invariant. If it is one row, a conditional `UPDATE ... WHERE capacity > 0` puts the check
in the `WHERE` clause so the check and the act are one atomic statement, or a `CHECK`
constraint does it declaratively. If it genuinely spans rows, `SERIALIZABLE` with a retry
or an explicit `SELECT ... FOR UPDATE` on the rows the decision reads. The staff-level
reframing: the question is not "which isolation level" but "is this transaction
read-modify-write, and is the read part of the decision?" — because a write-only
transaction that does not read its own precondition does not care about any of this.

**D7. Your team uses `SERIALIZABLE` for a balance-transfer invariant. The retry loop works,
but p99 latency has doubled and the abort rate is 4%. What are the options, and how do you
decide?** `STAFF`

Three options, and the order to present them in a design review. First, and most often
right: **restructure so the invariant is enforced declaratively.** If the invariant is
"balance must not go negative", a `CHECK (balance >= 0)` is exactly it, enforced for every
writer, with no retry, no aborts, and no latency. If it is "at most one active subscription
per user", a partial unique index is exactly it. If it is "no two bookings overlap", an
`EXCLUDE USING gist` is exactly it. Every one of these is faster than SSI, needs no retry
loop, and covers the write paths nobody wrote. That is why the first question is "can this
be a constraint?" rather than "can we tune SSI?". Second, if the invariant genuinely cannot
be a constraint, **narrow the transaction**: the abort rate is a function of how much each
transaction reads and writes relative to concurrent writers, so reading less (only the rows
the invariant needs), writing in a consistent order, and moving non-database work outside
the transaction all reduce the conflict rate directly. Third, if neither works, accept the
abort rate and *optimise the retry*: exponential backoff with jitter, a cap on attempts, and
— importantly — a distinction between retryable and terminal outcomes, so a genuine
constraint violation does not get retried fifty times. The 4% figure is worth putting in
context: 4% aborts at p99-doubling cost is a very different system from 4% *timeouts*, and
the answer is only visible once you separate the two. And the staff-level addition: the
right long-term answer for a high-contention invariant is usually to change the data model
— partition the contention, or move the invariant into a place where it is a single-row
update — not to make the retry loop faster.

### JSONB & Types

**D8. A team is adding `jsonb` to an existing 200-million-row `products` table to avoid a
migration per attribute, and is about to add a GIN index. Give the full cost picture and
the decision you would argue for.** `STAFF`

The write cost is the dominant one and it is structural: the GIN index is large (commonly
20-40% of the table for a wide document), every insert adds an entry per distinct key, and
every update is a delete plus a re-insert of all of them. The read cost is highly variable
and depends entirely on the operator: `@>` with `jsonb_path_ops` is fast and the index is
much smaller than the default `jsonb_ops`; `?` (key existence) requires `jsonb_ops`; and
`->>` on a single key is best served by a small B-tree expression index on
`((attrs ->> 'brand'))`, not by the GIN at all. The migration cost is the one nobody
mentions: adding a `jsonb` column to a 200-million-row table is fast if it is nullable with
no default, and *not* fast if you backfill it, because a single `UPDATE` of 200 million
rows is one enormous transaction that holds the vacuum horizon for the whole duration —
which is Chapter 9's failure mode, self-inflicted. The decision I would argue for: a
`jsonb` column is a bet that you do not yet know the shape, and if you are adding it to
accommodate a *known* set of attributes arriving one at a time, you have already lost the
bet. Add the columns, nullable, no default, in one migration; backfill in batches with a
bounded transaction size. Use `jsonb` for genuinely unpredictable, sparse, per-entity
attributes, and only add the GIN when a measured query needs it — starting with
`jsonb_path_ops` and a `WHERE` clause that makes it partial if the churn is concentrated.

**P4. A `jsonb` GIN index on a 40 GB table is 11 GB. The table's write throughput dropped
40% when the index was created and has not recovered. What is going on and what are the
options?** `ADVANCED`

The 11 GB is not abnormal for GIN over a wide `jsonb` column, and the write cost is the
structural price of it: every insert adds an entry per distinct key and every update is a
delete plus a re-insert of all of them, so the write path got more expensive permanently,
not temporarily. The "creation" and "after" framing is usually wrong — `CREATE INDEX` does
the bulk work and a GIN build is a large sequential write, but the sustained degradation
means the steady-state write cost changed. The first question is which opclass: if it is
the default `jsonb_ops` and the workload only ever uses `@>`, switching to `jsonb_path_ops`
gives a materially smaller and faster-to-maintain index and would likely be the whole fix.
The second is whether the index needs to cover all rows — a *partial* index with a
discriminator `WHERE` clause that excludes the high-churn rows (the append-only tombstoned
products, say) keeps the benefit where the queries are and removes the cost where it is not.
The third is GIN's own maintenance state: check `pgstatindex()` on the index for
`pending_list_pages` and `avg_pending_pages`; a persistently non-zero pending list means
writes are outpacing the merges, and `gin_pending_list_limit` is the dial. The fourth is
whether the index earns its place at all — `pg_stat_statements` for the queries that use
it, by total time; if the win is 200 ms on a query that runs hourly, the 40% write cost is
a bad trade and the honest recommendation is to drop it and pay the scan. And if it is kept,
the operational addition is that GIN bloat is repaired by `REINDEX`, not by `VACUUM`.

**T4. `SELECT count(*) FROM t WHERE attrs ? 'warranty_months'` on a 5-million-row table with
a GIN index built with `jsonb_path_ops`. Does the index help?** `TRICKY`

No. `jsonb_path_ops` indexes only the `@>` containment operator — that is its entire design
rationale, and the size and speed advantage over the default `jsonb_ops` come precisely
from not carrying the per-key postings that the key-existence operators need. The `?`
operator requires the default `jsonb_ops` opclass, so this query falls back to a sequential
scan. This is the most common GIN mistake in real schemas, and it is silent: the index
exists, it is used by the queries the team wrote when they created it, and the new query is
slow for a reason that has nothing to do with the data. The options are to build a second
index with `jsonb_ops` (and pay the size), to rewrite the query as a containment test
(`attrs @> '{"warranty_months": ...}'` if the value is known, or
`jsonb_path_exists(attrs, '$.warranty_months')` — but check the plan, because path
expressions are not automatically index-usable), or, if the answer is "does this key exist
on a meaningful fraction of rows", to not index that question at all. The review habit worth
installing: when a GIN index is created, write down which operators it serves, because
`jsonb_path_ops` is a bet on the workload using only `@>`, and nothing enforces it.

**S3. A PR replaces ten `text` columns with one `jsonb` column to make the schema "cleaner".
What is the review comment?** `STAFF`

That this trades ten declared, indexed, constrained, joinable columns for one undeclared,
un-constrained blob, and that the trade is only justified if the shape is genuinely unknown
— which ten existing columns say it is not. The concrete losses: no `NOT NULL`, no
`CHECK`, no foreign key, no unique constraint, no per-column statistics for the planner, and
joins become unnests. The concrete costs: every query that filters or sorts on one of those
attributes needs either an expression index (which only works for a non-computed key) or a
GIN index (which is large and expensive to write), and a full rewrite of every read path in
the codebase. The condition that would flip the recommendation is if the attributes were
genuinely sparse and per-entity — most rows having two, some having forty — and if the
read pattern were "fetch the document". The review comment should also ask the question that
determines the outcome: *which query pattern are we optimising for, and can we name it?* A
schema that is "cleaner" and has no named query pattern is a schema that will be discovered
to be wrong in six months, and the discovery will be a performance incident rather than a
design discussion.

**S4. A PR adds `created_at TIMESTAMPTZ` and an `event_date DATE` to the same table, plus a
`CHECK (created_at::date = event_date)`. What does the review comment say?** `STAFF`

That the `CHECK` couples two columns the application writes independently, so it fails on
legitimate writes: a row created at 23:30 UTC on the 14th has an `event_date` of the 13th
or the 14th depending on the business timezone, and the column has no way to express which
one is meant. `timestamptz` is the right type for an *instant* — it stores a UTC microsecond
value and renders it in the session's `TimeZone` — and `date` is the right type for a
calendar date, but the derivation between them belongs in a generated column or in the
application, not in a constraint both must satisfy. The deeper comment is the
`timestamptz` versus `timestamp` distinction: a `timestamp` without the zone carries *no*
zone at all, so one stored value means different instants for different readers, and it is
a silent data-quality bug rather than an error you can catch. Where a real zone is needed,
it is a `timestamptz` plus a separate IANA zone-name column — not a naive timestamp. And
the operational comment that catches people: `SET TimeZone` is a *session* setting, so a
migration or a reporting tool that changes it changes what every subsequent query in that
session sees, which in a pooled-connection world (Chapter 1) is a connection-pooling bug
wearing a timezone costume.

**T5. A migration runs `BEGIN; ALTER TYPE order_status ADD VALUE 'cancelled'; ... COMMIT;`
and the commit fails. What is the rule, and what is still forbidden?** `ADVANCED`

The rule has moved once and the residue is permanent. Before PostgreSQL 12, a new enum
value could not be *used* in the same transaction that added it, because the type's
catalogue entry was not visible to the creating transaction; the workarounds were to commit
the `ALTER TYPE` separately and then use the value, or to build a new type and swap.
PostgreSQL 12 relaxed the use restriction. What has *not* changed across versions is that
there is no `ALTER TYPE ... DROP VALUE` and no way to reorder an enum's values, so retiring
a state means creating a new type, migrating every row, swapping, and dropping — verify the
exact rules against the version you are deploying to, because this is exactly the area that
has changed more than once. The operational consequence is the part a review must catch:
enum schemas are append-only in practice, so they accumulate dead states permanently, and
every `switch` over the enum grows a branch per historical decision that was later
reversed. For anything past a handful of states, the better design is a lookup table with a
foreign key: it can be relabelled, retired with a `status` column and no schema change at
all, and it can carry a display label and a sort order. The one genuine advantage of the
enum — compact storage and a closed, self-documenting set of values — is real, and it is
why enums are defensible for genuinely small, genuinely stable state machines and a
liability everywhere else.

**P5. A finance team stores a `money` column. What are the three problems, and what goes
there instead?** `TRICKY`

Three, and they are structural rather than cosmetic. First, `money` is locale-dependent:
its output symbol, grouping and decimal separator come from `lc_monetary`, so the same
stored value renders differently depending on the session's locale and a report's
formatting silently becomes a function of who ran it. Second, it has fixed-scale
precision — two decimal places — so it cannot represent a fractional satoshi, a
basis-point rate, or an FX amount in a high-precision minor unit without rounding, and you
do not get to choose the scale per column. Third, it is locale-dependent on *input* too, so
`'1,234.56'` and `'1234.56'` parse differently under different settings, which makes bulk
imports and migrations fragile. The replacement is `numeric` with an explicit scale where
the business cares — `numeric(18,4)` for a rate, `numeric(18,2)` for a currency amount —
with the ISO currency code in its own column and rendering done in the application or the
reporting layer where the locale is known and controlled. `numeric` is slower than a float
and much slower than an integer, and that is the honest cost: arbitrary-precision decimal
arithmetic in software. For a column where exactness is a legal requirement that is the
right trade; where it is not, `bigint` in minor units is both faster and exact. The thing
to never do is `float8` for money, because binary floating point cannot represent 0.1 and
the error accumulates silently through arithmetic rather than showing up as a rounding
error you can see.

### Indexing

**D9. A 900 GB time-series table of sensor readings, append-only, `recorded_at` is
monotonically increasing with insertion. You need to answer "readings for device 42 in the
last hour" 400 times a second. What indexes do you create, and why not a B-tree?**
`STAFF`

Range on `recorded_at` first, and it should be a **BRIN**, not a B-tree. The reasoning is
the correlation: an append-only table is physically filled in order, so `recorded_at` is
strongly correlated with physical position, and a BRIN index stores only a min/max summary
per block range — with `pages_per_range = 128` (about 1 MB of heap at the 8 kB page size), a
900 GB table is roughly 900,000 summaries, a few megabytes, against a B-tree on
`recorded_at` that is tens of percent of the table's own size and that must be maintained on
every single insert. The read path: a `recorded_at` predicate over the last hour touches a
contiguous range of the heap, so a B-tree index scan or a sequential scan of the tail is
both efficient, and BRIN's summaries let the planner skip everything older without reading
it. Second index: `device_id`, and here the choice is a **B-tree**, because device IDs are
scattered across the whole table and there is no physical correlation to exploit — a BRIN on
`device_id` would have a min/max covering the entire value domain on every block range and
exclude nothing. In practice the real answer at 400 queries a second is BRIN on
`recorded_at` plus declarative range partitioning by time (Volume 6) plus a B-tree on
`(device_id, recorded_at DESC)` so the per-device query is an index scan that stops after
the rows it needs, plus `fillfactor` irrelevant because nothing is updated. The honest
counter-argument to raise: BRIN degrades silently to a scan if the table is ever updated
rather than appended to, and `VACUUM FULL` or `pg_repack` rewrites the file in a new order
— so BRIN is correct only while the append-only property holds, and a runbook note and a
metric on update rate belong with the index.

**P5. A query that was an index-only scan with `Heap Fetches: 0` now shows
`Heap Fetches: 2.4M`. The index definition did not change. What is happening, and what is
the fix?** `STAFF`

The visibility map. An index-only scan is only pure when every heap page in the range has
`ALL_VISIBLE` set, and that bit is set by `VACUUM` and cleared by any update to any row on
that page. So the table got hot, `VACUUM` has not run since — or cannot run, because a long
transaction holds the horizon — the bits are cleared, and every index-only scan in the
range now fetches the heap. The confirmation is that the plan node still says
`Index Only Scan` and `Buffers: shared hit=` on the index is small while `Heap Fetches` is
large; if the node said `Index Scan` instead, the cause would be a query change adding a
column the index does not contain, which is a different problem. The fix is to restore the
invariant: find what is blocking vacuum (`backend_xmin`), and if nothing is, check whether
autovacuum is keeping up on this table given the `0.20` scale factor on its size. The
`INCLUDE` covering index is not the problem and adding more columns to it will not help.
The related design point worth raising in the same breath: on a table with steady updates,
a covering index's value decays toward zero, which is a real argument for either
partitioning the hot and cold data so the covering index is dense on the cold partition, or
accepting that the hot path is an index scan and reserving covering indexes for the tables
that are actually read-mostly.

**T5. You run `EXPLAIN (ANALYZE, BUFFERS)` on a query with a `Sort` node and see
`Buffers: temp read=0 written=40218`. You raise `work_mem` from 4 MB to 512 MB globally and
the query is fast, but two days later the database has an OOM kill. Explain the sequence.**
`ADVANCED`

The `Sort` was spilling: 40,218 temp blocks is about 314 MB of temporary file, so the sort
node's input exceeded `work_mem` and the executor wrote to disk. Raising `work_mem` to
512 MB stopped that — and created a much larger problem, because `work_mem` is a per-*node*
limit, not per query and not per connection. A 512 MB `work_mem` means any plan with a sort,
a hash, a materialisation, a bitmap or a hash-aggregate node can allocate 512 MB *per node*,
multiplied by the number of parallel workers, multiplied by the number of concurrent queries
in a session, multiplied by the number of sessions. On a 64 GB instance with
`max_connections = 100` and a five-node plan on four workers, the arithmetic reaches
something in the hundreds of gigabytes, and the kernel's OOM killer takes the
largest-RSS backend — which is the process running the *biggest* sort, i.e. an innocent
query. The correct fix for the original problem was `SET LOCAL work_mem = '512MB'` inside
the transaction running that one query, or better, an index that eliminates the sort (a
`Limit` above a `Sort` above a non-selective filter is the classic case: an index matching
the equality and the `ORDER BY` returns 50 rows with no sort at all), or a query that sorts
less. The staff-level point is that `work_mem` is the one setting where the intuitive
reasoning — "this is how much memory a sort needs" — is exactly wrong, and the habit to
install is that no one changes `work_mem` globally without the multiplication.

**S4. A PR adds `CREATE INDEX idx ON t (lower(email))` and a unique index on the same
column, `CREATE UNIQUE INDEX uq ON t (email)`. What is the review comment?** `TRICKY`

That it is almost certainly the same index and should be one. A unique index on `lower(email)`
gives case-insensitive uniqueness *and* serves queries filtering on `lower(email)`, so the
plain unique index on `email` is redundant for uniqueness — and it is not merely redundant,
it is *wrong* in a way that matters: the case-sensitive unique index permits
`Alice@example.com` and `alice@example.com` as two distinct rows, so the two indexes
disagree about what is unique. If the intent is case-insensitive uniqueness, drop the
case-sensitive one. If the intent is case-*sensitive* uniqueness, then `lower(email)` is not
a uniqueness constraint at all and should be a plain non-unique index. The second comment is
about the expression matching: the index on `lower(email)` is only usable by a query that
writes `lower(email)` — `WHERE lower(email) = $1`, not `WHERE email ILIKE $1`, and not
`WHERE email = lower($1)` — and the review should confirm the query does. The third, and the
one worth raising unprompted, is that on a large table both should be `CREATE INDEX
CONCURRENTLY`, because a plain `CREATE INDEX` takes a lock that blocks writes on the table
for the whole build.

**D10. A table has 40 indexes, 8 million rows, and a write path that does one `INSERT` and
occasionally one `UPDATE`. A colleague proposes consolidating the indexes. What is the
analysis, and what would you actually do?** `STAFF`

The analysis is that index count is a write cost, a vacuum cost, a bloat source and a
planning-option cost, and each has a different number. Per `INSERT`, every index is a
separate B-tree descent, WAL record and page touch — and a GIN or GiST index is far more
expensive than a B-tree, so "40 indexes" is not a linear quantity. Per `UPDATE`, every
index on a changed column gets a new entry, and a non-HOT update on a wide table can
require a new heap page, which is why `n_tup_hot_upd / n_tup_upd` is the number to look at.
For vacuum, each index is scanned for dead entries on every pass, so bloat accumulates in
40 places. And for planning, each index is an option the planner evaluates, which is mostly
cheap but does occasionally change the plan in a way nobody can explain. What I would
actually do, in order: first, *measure* — `pg_stat_user_indexes` for `idx_scan` on each
index, and an index with zero or near-zero scans over a long period is the strongest
candidate for removal; a duplicate index (same columns, same predicate, different name) is
a pure win to drop and there is a query to find them. Second, identify *overlapping* indexes
— a `(a)` and a `(a, b)` where every query that uses the second could use the first with
one extra heap fetch; sometimes the composite makes the single-column redundant, and
sometimes the opposite. Third, look for indexes that a *partial* version could replace, which
is where the biggest win usually is: a full index on a table where 98% of rows are
`archived` and no query ever filters on them should be a partial index on the 2%. Fourth,
before dropping anything, `REINDEX INDEX CONCURRENTLY` the ones you keep and re-check. And
the organisational point, which is the staff-level part: index debt accumulates because
adding an index is a one-line change with an immediate measurable benefit and removing one
has no immediate symptom, so the fix is a recurring review with a named owner and a rule
that an index added in a ticket must have a stated query it serves — otherwise nobody can
defend it at deletion time.

**P6. A partial index `orders (customer_id) WHERE status = 'open'` was created when 2% of
orders were open. Now 71% are open and the index is 4 GB. What happened, and what do you
do?** `STAFF`

The index is still *correct* — the planner uses it for exactly the predicate it was built
for — but the selectivity assumption underneath it is gone, and a 4 GB index on a table
whose predicate matches 71% of rows is worse than useless: it feeds its own size into the
planner's cost estimate, so the planner may prefer an index scan that fetches most of the
table in random order over a sequential scan that would read it in order. The first step is
`EXPLAIN (ANALYZE, BUFFERS)` to confirm whether the index is being used and whether using
it is actually costing more than scanning. The diagnostic nobody runs is the one that
explains it: how many rows match the predicate *now*. A partial index encodes an assumption
about **selectivity**, not just about a predicate, and selectivity is precisely the thing a
growing business changes without telling you. So the options are: drop it and let a plain
index serve the now-common query; keep it but check whether the *query* pattern changed as
well as the distribution, since 71% open usually means several previously-rare queries became
common; or, if "open" genuinely stopped being a small set, change the model so the common
query is a small indexed set again — a status column that is `NULL` rather than `'open'`, or
a separate hot table for in-flight work. The general lesson: partial indexes expire
silently, and the metric to alert on is index size against predicate selectivity, not index
size alone.

### Query Planning

**D11. A query's estimated row count is 3 and the actual is 310,000. Where do you look, in
order, and what fixes exist?** `ADVANCED`

First, `pg_stats` for the columns in the predicate — `n_distinct`, `null_frac`, the MCV
list, the histogram bounds. A 3-row estimate is nearly always a *distinct-count* estimate
that is wrong, and the two common causes are a highly skewed column where the filtered
value is rare and absent from the MCV list, and correlated columns where the planner
multiplies two independent selectivities. Second, staleness: `n_mod_since_analyze` and
`last_autoanalyze` for the table, and whether a bulk load has happened without a manual
`ANALYZE` (the autovacuum analyzer will not have caught up). Third, extended statistics:
`CREATE STATISTICS` on the correlated column pair with `dependencies` or `ndistinct` is the
specific fix for the second cause, and its absence is the most common single explanation for
an estimate that is off by five orders of magnitude. Fourth, the position of the bad node:
if the divergence is at a join rather than a scan, the cause is upstream and everything above
it is downstream. Fifth and last, planner configuration: `effective_cache_size` set
unrealistically low makes the planner believe nothing is cached and inflates every scan
cost, and `random_page_cost = 4` on an SSD overstates index access. The discipline: find the
*first* node where estimate and actual diverge by more than an order of magnitude, and treat
everything above it as a consequence. And the anti-pattern to name: `enable_seqscan = off`
"fixes" this by removing the planner's ability to choose correctly, which makes the plan
look right without making the estimate right.

**P6. A dashboard query that ran in 900 ms for months now takes 40 seconds. The query text
has not changed, the schema has not changed, and the data grows about 3% a week. Where do
you start?** `STAFF`

Start with the plan, and specifically with the estimate-versus-actual comparison, because a
3% weekly growth rate crosses a threshold eventually and the most common version of this
story is a sort or a hash that has just tipped over `work_mem`. Concretely: get the current
`EXPLAIN (ANALYZE, BUFFERS)` and look for a `Buffers: temp written=` line that is non-zero
(a new spill that did not exist before), a `Sort` or `HashAggregate` node whose `actual
rows` has grown, and the first node where `rows=` and `actual rows=` diverge. Then check
whether autovacuum has been keeping up on that table — `n_mod_since_analyze`, `last_
autoanalyze`, and whether the table's dead-tuple count is above the trigger, because a
table whose statistics are stale *and* whose pages are bloated fails on both axes at once.
Then check for a long transaction holding the horizon, which would explain stale statistics
and a stale visibility map simultaneously. Then check `pg_stat_statements` for a recently
added index or a changed GUC, because a plan cache entry re-planning after five executions
can pick a different access method. And the check that catches a surprising fraction of
these: `random_page_cost` and `effective_cache_size` versus the actual hardware — a VM
resize or a disk change alters the physical characteristics the planner is modelling, and
the planner has no way to know.

**T6. A `Materialize` node appears above a nested loop in a plan that did not have one last
week, and the query got 3x slower. What happened and what is the real fix?** `TRICKY`

`Materialize` caches the inner side of a nested loop so a re-scan is cheap, and the planner
adds it when it cannot push an index condition into the inner scan — so its appearance is a
*symptom* of a plan that changed shape, usually because an estimate upstream changed and a
different access path or join method became preferable. The most common proximate cause is a
statistics update after a bulk load or a distribution shift, which changed a row estimate,
which changed a join order or a join method, which left the inner side of a nested loop
un-indexable. The real fix is not to suppress the `Materialize` (there is no GUC for that,
and you should not want one) but to fix the estimate that caused it: `ANALYZE` the table,
add extended statistics on any correlated columns involved, or add the index on the inner
side's join column so the inner scan becomes an index scan and the `Materialize` disappears
because it is no longer needed. If the query is a correlated subquery or a `NOT EXISTS`
that the planner has not turned into an anti-join, the same node appears for a structural
reason, and the fix there is to rewrite it as `EXISTS` so the planner can anti-join, which
can then be hash-based rather than loop-based.

**D12. Your team wants to set `enable_nestloop = off` permanently to stop the planner picking
a bad nested loop. What is your response?** `STAFF`

That this is `enable_seqscan = off` with extra steps, and the reasoning is identical: the
GUC removes the planner's ability to make a correct decision, it does not make the incorrect
one right, and it is session-scoped so it leaks through a connection pool onto unrelated
queries. It also has a worse failure profile, because a nested loop is not an obviously bad
plan — it is the *right* plan when the outer side is small and the inner side is
index-backed, which is extremely common in a `LIMIT`-driven query, and turning it off
converts those into hash or merge joins that materialise far more data. The legitimate use
is diagnostic and narrow: set it, confirm the plan changes and the query gets faster, and
you have learned that the planner's cost estimate for the nested loop was wrong. Then find
out why — stale statistics, correlated columns without extended statistics, a
`work_mem`-constrained hash estimate, `random_page_cost` on the wrong hardware assumption —
fix that, and unset the GUC. The permanent-configuration answer is
`random_page_cost` and `effective_cache_size` set to match the hardware, plus
`default_statistics_target` raised on the columns whose distributions are skewed, plus
`CREATE STATISTICS` on the correlated pairs. Those are real planner improvements; the
`enable_*` family is a way of looking at the problem without solving it, and its danger is
that it works often enough to be copied into production by someone who never found the
underlying mis-estimate.

**D13. A batch report runs `SELECT ... ORDER BY placed_at DESC LIMIT 50` and takes 4 seconds
with a `Sort` node showing 172 MB of temp files. You have 400 ms. What do you do?** `STAFF`

Make the sort disappear, in that order of preference. The plan shape tells you what is
possible: a `Sort` above a filter that returns 14,000 rows to satisfy a `LIMIT 50` means
the planner is sorting 14,000 rows to return 50, which is almost always an index-matching
opportunity. A composite index on `(status, placed_at DESC)` — where `status` is the
equality predicate — satisfies both the filter and the `ORDER BY`, and the planner can then
read 50 index entries and stop, with no sort and no spill. That is the fix, and it costs one
index on a table where the write rate is moderate. If the filter is not on a single column,
or the ordering is by an expression, an expression index on the sort key with the filter
columns leading works the same way. If no index can serve it, the second option is
`SET LOCAL work_mem` high enough to hold the sort in memory — scoped to the one transaction
running the report, never global, because Chapter 7's multiplication applies. The third
option, which is the one to raise as a design question: if the report is run on a schedule,
it does not belong on the transactional instance at all — a read replica, or a
materialised view refreshed on a schedule, removes both the 4 seconds and the I/O contention
it causes on the primary. And the diagnostic worth stating: the fact that a `Sort` sits
*above* a `Filter` that removes most of the rows is the signature of a missing
index-matched ordering, and it is a better answer than "raise `work_mem`" because it costs
nothing at query time and does not touch anyone's memory budget.

**T7. A `Sort` node reports `Sort Method: external merge  Disk: 84MB`. The same query against
a smaller table reports `Sort Method: quicksort  Memory: 25kB`. What is different, and is the
second one actually cheap?** `TRICKY`

The first is an external merge sort: the input exceeded `work_mem`, so the executor spilled
to temporary files, merged them, and paid the I/O. The second sorted in memory and never
touched a temp file. The trap is that the second is *not* cheap, and
`Sort Method: quicksort Memory: 25kB` is routinely misread as "fine". Two costs hide in
that line. First, an in-memory quicksort consuming nearly all of `work_mem` is a sort that
is one input row away from spilling, so the same query on slightly more data becomes a disk
sort — that is a cliff, not a slope, and it explains queries that were fine until they were
not. Second, comparison-based sorting is O(n log n) with unpredictable branches, and at
millions of rows the sort itself can be a meaningful fraction of the query's time even with
zero I/O; the correct reading is the node's `actual time` against the plan total, not the
absence of a temp file. The actionable conclusion is identical to the external-merge case:
the fix is not "raise `work_mem`" globally but "stop sorting that many rows" — an index
matching the `ORDER BY`, with the filter's equality columns leading, turns the sort into a
bounded index scan that stops after `LIMIT` rows, which is both faster and immune to the
spill threshold entirely. When the sort genuinely cannot be avoided, `SET LOCAL work_mem` for
that one query, at a measured value, is the correct scope.

### Isolation & Locking

**D14. Two services both need to run a "close the month" job exactly once. One uses a
`SELECT ... FOR UPDATE` on a settings row; the other uses `pg_try_advisory_xact_lock`. Which
is better, and what is the third option?** `ADVANCED`

The advisory lock is better for this, and the reason is scope. `SELECT ... FOR UPDATE` on a
settings row holds a *row* lock, which is invisible to the world as a job lock: it blocks
any other writer to that row, it interacts with the table's own lock manager, it is subject
to deadlock with unrelated code that touches the same row, and if the job takes an hour it
holds that row lock for an hour. A `pg_try_advisory_xact_lock` on a namespaced key is
semantically exactly "am I the only one doing this", it is released automatically at commit
or rollback so it cannot leak, it does not block anything else, and `try_` means the loser
exits immediately rather than waiting. The third option — and the one I would argue for
first — is neither: a **lease row** with an expiry. A row with `(owner, expires_at)` where
the job takes it with a conditional `UPDATE ... WHERE expires_at < now()` gives you a lock
that survives a crashed worker (it expires), works across a database failover, and is
visible in ordinary table queries, which an advisory lock is not. The trade is that a lease
needs clock discipline and a cleanup, and that a job running longer than its lease needs
heartbeating. The decision frame: advisory locks are for *in-process mutual exclusion with
no persistence needs*, a lease row is for *work that can outlive the process that claimed
it*, and `FOR UPDATE` is for *row-level concurrency inside a transaction you already own*.
Choosing the wrong one of the three is a common and expensive confusion, and the symptom is
always the same: "the job sometimes runs twice" or "the job never runs again because a lock
leaked".

**P7. A worker pool of 12 processes processes a job queue using
`SELECT ... FOR UPDATE SKIP LOCKED LIMIT 1`. Two jobs per day are processed twice and
sometimes not at all. What is wrong?** `ADVANCED`

Both symptoms come from the same place, and it is a design question rather than a bug. If
the work is done *inside* the claiming transaction, then a crash rolls the claim back and
the row is retried — which gives at-least-once delivery and can cause a duplicate if the
crash landed after the side effect but before the commit. If the work is done *outside* it,
the row is committed as `running` and a crash after that leaves it `running` forever, which
is the "not at all" symptom. Two fixes, and both are required. First, make the claim and the
work the same transaction, so the lock that guarantees exclusivity is held for the duration
of the work; the cost is that the transaction is open for the length of the job, which is
Chapter 9's failure mode — a 40-minute video transcode holding a transaction open for 40
minutes blocks vacuum for the entire cluster. So for genuinely long jobs, the second fix is
required anyway: a `claimed_at` timestamp plus a visibility timeout, and a sweep that
requeues `running` rows older than the timeout, so a crashed worker's job returns to the
queue without human intervention. The second requirement, which is the one teams skip, is
that **every job must be idempotent**, because at-least-once means the system genuinely
cannot know whether the side effect happened before the crash. If the job is not
idempotent, the queue is wrong regardless of the locking mechanics. And the operational
detail: this is a long-transaction workload by construction, so the connection doing the
claiming must never also be the connection that then holds a transaction open while waiting
on a remote API — the claim and the work have to be a deliberate design, not an accident of
how the code fell out.

**T7. Session A runs `BEGIN; SELECT * FROM t WHERE id=1 FOR UPDATE;` and holds it. Session
B runs the same statement. What is in `pg_locks` for B, and what does B see in
`pg_stat_activity`?** `TRICKY`

B is blocked, and the important detail is *what it is waiting on*: not a lock named after the
table or the row, but a lock on **A's transaction id** (a `transactionid` lock) plus, on A's
side, a `tuple` or `virtualxid` lock recording who holds it. PostgreSQL has no row-level
lock manager for tuples — a row lock is recorded in the tuple's own `t_xmax` field (and, as
a fast path, in the line pointer in the page's slot array), which is why waiting on a row is
really waiting on the transaction that holds it. In `pg_stat_activity`, B shows
`wait_event_type = 'Lock'` and `state = 'active'`, and `pg_blocking_pids(B.pid)` returns A's
pid directly — which is the modern way to answer this, and the reason to prefer it over
manually joining `pg_locks` on `pg_blocking_pids` semantics. The one-line summary to have
ready is: *"a row lock is a `t_xmax`, so waiting for a row is waiting for a transaction, and
that is why `pg_locks` shows you `transactionid` and `virtualxid` rather than anything named
after your table."* The related facts worth volunteering: a transaction lock is held until
the *end of the transaction*, not the end of the statement, so a `FOR UPDATE` in a long
transaction blocks everyone; and `SELECT ... FOR UPDATE NOWAIT` fails immediately with a
lock-not-available error rather than blocking, which is what you want in a latency-sensitive
path.

**S5. A service method is annotated `@Transactional(isolation = Isolation.SERIALIZABLE)` and
contains a call to a third-party payment API. What does the reviewer need to know?** `STAFF`

Three things, in this order. First, the transaction now holds a database snapshot open for
the duration of the HTTP call — which is Chapter 9's failure mode: a 2-second third-party
call at low volume is a rounding error, but under load with a 30-second timeout it pins the
global `xmin` horizon for the whole cluster, and the database starts accumulating dead
tuples everywhere. The call does not belong inside the transaction. Second, `SERIALIZABLE`
means the transaction can be aborted at `COMMIT` with `40001`, and the retry loop that
handles that must re-execute the *entire* transaction — including the payment API call. So
either the API call is idempotent (a client-generated idempotency key, which it should be
anyway) or the retry is unsafe and will double-charge. That is the real bug: a
non-idempotent side effect inside a retryable transaction. Third, the combination of the
two is why this design is worth pushing back on rather than merely noting: the fix is to
either take the invariant out of the database (an `EXCLUDE` constraint, a `CHECK`, a
conditional `UPDATE` that makes the check-and-act atomic in one statement) or restructure
so the payment happens outside the serialised transaction with a compensating action. The
review comment should be blocking, and the conversation is about the transaction boundary,
not about the isolation level.

**D15. A team has an invariant "an order's total must equal the sum of its line items".
They are using `SERIALIZABLE` with a retry loop and it works, but it is 40% of their error
budget. What is the better design?** `STAFF`

The invariant is a *single-row* invariant, and single-row invariants should never need
serialisability. The sum-of-lines check is a read of the child rows followed by a write to
the parent, and under `SERIALIZABLE` that is exactly the read-write dependency pattern SSI
is watching for, so any concurrent edit of the same order collides. The better design is
to make the check-and-act a single statement — an `UPDATE orders SET total = (SELECT
sum(...) FROM order_lines WHERE order_id = ...) WHERE id = ...` — which is atomic in one
statement, holds one row lock, and cannot interleave with another edit of that order. Or,
better still, to *not store* the total at all: derive it, and if a denormalised total is
needed for read performance, have the application compute it inside the same statement that
writes the lines, or maintain it with a trigger, and add a `CHECK` where one can be
expressed. The general principle, which is the actual answer to give: **`SERIALIZABLE`
should be the last resort, not the first**, and the question to ask whenever someone
proposes it is "what is the smallest unit of data this invariant spans?" — if it is one
row, use one statement; if it is a set a constraint can express (`UNIQUE`, `CHECK`,
`EXCLUDE`), use the constraint; only if it genuinely spans rows with no declarative
expression do you need SSI, and then the retry loop is unavoidable. Retry loops are a real
cost in latency, in error-handling complexity, and in the requirement that every side effect
be idempotent, and paying that cost for a single-row invariant is a design error rather than
an engineering constraint.

**S6. A service takes `SELECT ... FOR UPDATE` on an inventory row, then calls two other
services over HTTP, then writes an audit row and commits. What does the reviewer need to
know?** `STAFF`

That the row lock — and every other lock the transaction takes — is held until commit, so
the transaction's duration is the duration of the HTTP calls, and everything in the middle
makes that unbounded. The problems in order of severity. The `FOR UPDATE` lock runs to the
end of the *transaction*, not the end of the statement, so a slow downstream call does not
merely slow this transaction down — it blocks every other transaction that wants that
inventory row, and the queue behind it grows with the downstream latency. A connection pool
sized to request rate now has connections pinned by outbound HTTP, which is how a database
runs out of connections for a reason that has nothing to do with the database: Chapter 1's
connection wall, reached by a completely different road. And the longer the transaction
stays open, the more likely it is to be the oldest snapshot in the cluster, which is
Chapter 9's silent failure mode. The review comment should be about the transaction
*boundary*, not the isolation level: read first, take the lock last, make the decision and
the write one statement, and put the HTTP calls outside the transaction entirely — using a
reserve-then-confirm design with a compensating action if the decision genuinely depends on
the remote answer. If a distributed call truly must be inside, the design needs a
`lock_timeout`, a bounded total transaction lifetime, and an idempotency key, because this
transaction is a distributed transaction in everything but name and will occasionally have
to be abandoned and retried.

### Autovacuum & Operations

**D16. A 3 TB table on a production database has 40% dead tuples, `VACUUM` has run hourly for
a week, and disk is 94% full. `pg_repack` is proposed. What is the plan, and what are the
risks?** `STAFF`

The plan, in order. First, establish *why* vacuum is not keeping up, because repacking a
table whose cause is unfixed buys a week: check `pg_stat_activity` for a `backend_xmin`
holder, check `autovacuum_max_workers` (default 3, shared across the cluster) against how
many tables need work, and check the trigger arithmetic — at `autovacuum_vacuum_scale_factor
= 0.20` on a 3 TB table the trigger is enormous, so the working level is permanently above
it. Set `autovacuum_vacuum_scale_factor = 0.02` and
`autovacuum_vacuum_cost_limit = 1000` with `autovacuum_vacuum_cost_delay = 0` on that
table, and let a `VACUUM (ANALYZE)` run overnight to recover what it can. Then
`pg_repack`: it needs free disk roughly equal to the size of the *live* data (it writes a
new copy), so with disk at 94% you must free space first — which usually means the index
cleanup, since `pg_total_relation_size - pg_relation_size` on a bloated table is often
several hundred gigabytes of reclaimable index. `REINDEX INDEX CONCURRENTLY` on the largest
indexes is the space-saving move and it does not need extra table space. The risks to name:
`pg_repack` needs a primary key or a unique index to repack into, so a table without one
cannot be repacked; it holds a brief `ACCESS EXCLUSIVE` lock at the start and end (triggers
a queue on anything waiting); and it roughly doubles the write volume for the duration, so
it must not be run at peak. The prevention, which is the point of the whole exercise: a
lower `fillfactor` on an update-heavy table so updates are HOT, and index coverage for the
columns being updated so the updates are not non-HOT.

**P8. You get paged: "PostgreSQL is refusing writes: `database is not accepting commands to
avoid wraparound data loss in database`." What is the sequence, and how long will it take?**
`STAFF`

The diagnosis is already in the message: the xid age has passed the point where freezing is
still possible, and PostgreSQL has shut down rather than recycle transaction ids that may be
in use. The sequence is: first, get the cluster back into single-user mode and check the
three horizon holders, because two of them are the ones people forget. `pg_replication_slots`
— a slot for a standby that was decommissioned, or a logical slot whose consumer died, holds
`xmin` indefinitely and is completely invisible unless you look. `pg_prepared_xacts` — a
`PREPARE TRANSACTION` that was never committed or rolled back holds a snapshot forever.
And `pg_stat_activity` for an ordinary long transaction. Drop the stale replication slot
(`pg_drop_replication_slot`) or terminate the offending backend; for a prepared transaction,
`COMMIT PREPARED` or `ROLLBACK PREPARED` by gid. Then the anti-wraparound vacuum must run to
completion, which on a large database takes hours, and during it writes remain refused.
Prevention is the only real answer and it is cheap: alert on `age(datfrozenxid)` per database
at perhaps 20% of `autovacuum_freeze_max_age`, alert on any `backend_xmin` older than ten
minutes, and put replication-slot cleanup and prepared-transaction inspection in the
runbook — because both of the blockers are things a human created and forgot.

**T8. A table is at `fillfactor = 100` (the default) and is updated twice a second, changing
only a column with no index on it. `n_tup_hot_upd` is close to zero. A teammate proposes
setting `fillfactor = 70` and is told it did not help. What is the likely reason?** `ADVANCED`

Because `ALTER TABLE ... SET (fillfactor = 70)` is metadata-only — it records the setting
for *future* page allocations, and it does not rewrite or re-space any existing page. A
table that is already full stays full: every existing page has `pd_lower == pd_upper`, so
there is no room for a HOT version, and the setting does nothing until those pages are
extended, which on a table that is not growing means never. The fix requires a rewrite:
`VACUUM FULL`, or `pg_repack`, or a new table and a swap. That is the surprise, and it is why
"we lowered `fillfactor` and nothing happened" is such a common ticket. The second thing to
check, which is the more likely cause on a table that *is* growing: even with `fillfactor`
set, a HOT update requires the new version to fit on the same page, and a page that is
nearly full cannot take even a small new version, so the *effective* usable fillfactor has to
leave room for the largest update you expect, not for the current row. And the third check,
which costs nothing: confirm the updated column really has no index, including a unique
index, a partial index, an expression index that covers it, and a full-text `tsvector` column
derived from it — because a `tsvector` maintained by trigger counts as an indexed column and
silently makes every update non-HOT. The diagnostic to run first is always
`n_tup_hot_upd / n_tup_upd` on `pg_stat_user_tables`, which tells you which of the two
conditions is failing before you change anything.

**S6. A PR adds `SET work_mem = '256MB'` to a per-role configuration. What is the review
comment?** `STAFF`

That the value is not the problem and the *scope* is. 256 MB is a defensible per-node
allocation for a proven reporting workload, but at role scope it applies to every session
that connects as that role, and each of those sessions may run a multi-node plan with
several sort, hash, materialisation and bitmap nodes, each of which can allocate 256 MB,
multiplied by the number of parallel workers. On a 64 GB instance with 50 concurrent
sessions of that role, the arithmetic is a number nobody in the PR has computed, and the
failure mode is the OOM killer taking the largest backend — an innocent query — with no
error at the time of the kill beyond a log line about a signal. The better design is
narrower: keep the global `work_mem` at its 4 MB default, and have the reporting role issue
`SET LOCAL work_mem = '256MB'` inside the specific transaction that has been measured to
need it. That has the same effect for the query that wants it and no effect on the forty
other queries the role runs. The second comment, which is the more valuable one: the PR
should include the measurement — which query spilled, what the `temp written` count was,
and what the execution time became — because a 256 MB `work_mem` chosen without a
measurement is a guess with a memory price attached. The third: if the goal was to make one
report faster, an index that eliminates the sort, or moving the report to a replica, achieves
the same result with no memory cost at all.

**P9. `pg_stat_statements` shows one query at 40% of `total_exec_time`, 900 calls, 1.8 s
mean, `shared_blks_read` of 4.2 billion. What are the three separate problems, and what does
the team do about each?** `STAFF`

Three, and they need three different fixes. First, the *mean* of 1.8 s makes this a latency
problem and a small fraction of total cost — the answer is `EXPLAIN (ANALYZE, BUFFERS)` on
that one statement to find the responsible node, plus whatever index or rewrite that
identifies. Second, the *total* of 40% makes it a resource problem: at 900 calls it is not
the highest-value thing to optimise per call, but it is consuming two-fifths of the
cluster's query time, and the right lever there is *frequency*, not speed — cache the
result, batch the calls, run it on a schedule rather than per request, or move it to a
replica. Third, and most interesting, `shared_blks_read` of 4.2 billion is roughly 32 TB of
8 kB reads, which for a 1.8-second query is a great deal of I/O per call, and the
`shared_blks_hit` in the same row is what says whether this is a cache problem. The three
"most expensive" lists are genuinely different — by `total_exec_time`, by
`mean_exec_time`, and by `shared_blks_read` — and a team that only reads the first optimises
for aggregate cost when the user-visible problem is usually the second, and never finds the
queries that are I/O-bound on a cold cache. The process answer: `pg_stat_statements` is a
triage tool that narrows thousands of statements to the three worth a plan, and each of
those then needs a plan decision, an index decision and a frequency decision. The extension
fixes nothing; it points.

**S7. A PR adds an index inside a migration, then runs `ANALYZE` and enables a new query in
the same migration. What does the reviewer need to check?** `STAFF`

That the index is created `CONCURRENTLY`, and that the migration handles the consequence:
`CREATE INDEX CONCURRENTLY` cannot run inside a transaction block, so a migration framework
that wraps every migration in a transaction will fail on it. That is the most common
PostgreSQL migration bug and it has a nasty failure mode — the build fails, leaves an
**invalid** index behind, and the migration is marked failed, so the table now carries an
index that takes space and write cost, is never used, and is never rebuilt. The check is
`SELECT indexrelid::regclass FROM pg_index WHERE NOT indisvalid`, and the fix is `DROP INDEX
CONCURRENTLY` and retry, not leaving it in place. The reviewer should also confirm the
migration runs `ANALYZE` (or waits for the autovacuum analyzer) *before* enabling the query,
because a query enabled against stale statistics will choose the plan it would have chosen
anyway and the migration will look like a no-op that nobody debugs. And the operational
point: a concurrent build takes two table scans and waits for every transaction older than
the build to finish before the index becomes valid, so on a large table it can run for hours
and be blocked indefinitely by one long transaction — which means the migration needs a
timeout, a `lock_timeout`, and a documented plan for the case where the index is still
building when the deploy finishes.

### Background Workers, Extensions & Version Boundaries

**D17. `max_worker_processes` is 8, `max_wal_senders` is 10, `max_parallel_workers` is 8,
`autovacuum_max_workers` is 3, and you run two logical replication publications, a `pg_cron`
job, and a dashboard that runs parallel analytical queries. What breaks first, and how do
you plan the number?** `ADVANCED`

The number is shared: `max_worker_processes` is the total pool that autovacuum workers,
logical replication workers, parallel workers and custom background workers all draw from,
and `max_wal_senders` is itself capped by it. So the budget is not the sum of those
settings — it is the *minimum* of the pool and each subsystem's cap, minus the slots the
system reserves for its own workers. With the numbers above the arithmetic is already wrong:
3 autovacuum + 2 logical replication + 8 parallel = 13 against a pool of 8, so parallel
queries silently get fewer workers than configured and the plan shows a `Gather` with fewer
children than you expected rather than an error. What breaks first in practice is autovacuum,
because it is the only one of these whose shortfall is silent *and* cumulative — parallel
queries that get two workers instead of eight are merely slower, whereas three autovacuum
workers competing with a busy cluster means dead tuples accumulate until the disk fills. The
planning discipline: enumerate every background worker in the cluster (autovacuum, logical
and physical replication senders and receivers, parallel workers, custom extensions,
`pg_cron`, logical decoding, plus the `VACUUM` and `ANALYZE` you launch yourself), add them
up, add headroom for manual maintenance, and set `max_worker_processes` above the total.
The other half of the answer is that the *count* is not the real limit — `work_mem`
multiplied by parallel workers multiplied by concurrent queries is, which is why Chapter 7's
multiplication and this setting have to be planned as one decision rather than two.

**D18. You are storing 500 million 1,536-dimension embeddings and need sub-second
approximate nearest-neighbour search. HNSW or IVFFlat, and what is the operational
consequence of the choice?** `STAFF`

Both are approximate and they fail differently. **IVFFlat** is a clustering index: it builds
a list of centroids, assigns each vector to a list at build time, and at query time scans
only the nearest few lists. It is fast to build, small, and its accuracy degrades
predictably as data drifts away from the centroids it was built with — and since vectors
arrive continuously, they do drift, so the fix is a periodic `REINDEX`, which on 500 million
vectors is a long operation on a large table. **HNSW** is a graph: it builds a hierarchical
navigable small-world structure, needs no rebuild as data arrives (new vectors insert into
the existing graph, though quality decays slowly), and gives better recall at the same
latency. Its costs are memory — the graph is large and largely resident — and build time,
much longer than IVFFlat at that scale. So: HNSW if recall is a hard requirement and the
hardware has the memory, accepting the build and the maintenance; IVFFlat if build time and
index size dominate and you can absorb a periodic rebuild. The operational consequences the
choice implies and that a design review must cover: both indexes are approximate, so the
evaluation has to run against a ground-truth set and the recall target has to be a stated
requirement rather than an accident; `ef_search` and `probes` are query-time knobs that make
latency workload-dependent, so they belong in monitored service configuration rather than in
a constant; and `pgvector` is an *extension*, so you are taking on an external dependency's
upgrade cadence on top of PostgreSQL's own. The framing that actually decides it: at 500
million vectors this is a specialist vector-search problem, and the honest recommendation is
to benchmark a dedicated vector store against `pgvector` on the same ground truth, because
the PostgreSQL answer is usually right into the tens of millions of vectors and an
increasingly compromised position beyond that.

**P1. A logical replication publication to a downstream warehouse has been silent for six
hours. Nothing is erroring on the publisher. What is happening, and why is the publisher
telling you nothing?** `ADVANCED`

Almost certainly the slot is not being consumed, and the publisher's silence is the designed
behaviour. A logical replication slot records how far the consumer has got, and the
publisher's WAL retention is tied to that position: the publisher will not remove WAL the
slot still needs. So if the subscriber's apply worker is down, paused, or simply slow
because someone added a trigger on the subscriber that makes it O(days) slow, the slot
stops advancing, WAL accumulates on the publisher, and `pg_wal` grows until the disk fills —
raising no error on the publisher, which is faithfully doing exactly what it was told. The
query that finds it is `pg_replication_slots`, comparing `confirmed_flush_lsn` against the
current LSN via `pg_wal_lsn_diff(pg_current_wal_lsn(), confirmed_flush_lsn)`, and checking
`active`, which is false for a slot whose worker is not running. Two distinct problems need
naming separately, because they have completely different urgency: a *lag* problem (the
consumer is behind but working, fixed by consumer performance) and a *stalled* problem (the
consumer is not running at all, fixed by restarting it or dropping the slot), since a
stalled slot is unbounded disk growth while lag is bounded by your retention window. The
second-order fact is the one that becomes a 3am page: the same slot mechanism is what holds
back the transaction ID horizon (Chapter 9), so an abandoned logical slot can *also* stop
wraparound protection — it is simultaneously a disk-space problem and a data-safety problem,
and invisible in both cases unless someone is looking.

**T1. A `geometry(Point, 4326)` column with 80 million rows needs an index, and the queries
are "points within this bounding box" and "nearest point to here". Which access method, and
what is the column definition's job in that choice?** `TRICKY`

Both query shapes want a spatial index, and the access method is largely made for you by
PostGIS's opclasses rather than by preference — the part that is actually a decision is the
column definition, because `geometry(Point, 4326)` declares both the type *and* the spatial
reference system, and the SRID is not decoration. The index is built in those coordinates,
so a query filtering in a different SRID cannot use it, and mixing SRIDs silently produces
wrong answers rather than an error unless every geometry column is declared with a non-zero
SRID — which is exactly why PostGIS recommends refusing a bare `geometry`. The practical
consequences worth raising in review: use `geography(Point, 4329)` rather than `geometry` if
the queries mean "within N kilometres", because `geography` computes true spheroidal
distance while `geometry` computes Euclidean distance in the projection's units, and getting
that backwards is a common and very quiet bug. For the bounding-box filter, always write the
`&&` operator — or `ST_Intersects` with a `&& _ST_Expand` helper — because
`ST_Contains`/`ST_DWithin` against `geometry` alone will not get an index. And the
operational point: GiST indexes on geometry are large and slow to build (so `CREATE INDEX
CONCURRENTLY`), they are lossy — storing bounding boxes and re-checking candidates — and
they do not give you the `INCLUDE` covering behaviour a B-tree does.

**T2. A migration needs an untrusted extension. What can and cannot be done about
privileges, and what does "trusted" actually change?** `ADVANCED`

`CREATE EXTENSION` requires whatever privilege the extension's control file demands, and
PostgreSQL 13 split extensions into **trusted** and **untrusted**. A trusted extension can
be installed by any role with `CREATE` on the target database, on the assumption that
installing it cannot be used to escalate privilege; the common `postgresql-contrib` modules
are trusted. An untrusted extension requires superuser, because its install script can
contain arbitrary code running with the installing role's rights — which is the entire
point of the distinction. So for a migration needing an untrusted extension, the answer is
that the application's migration role cannot do it at all: it needs a superuser executed out
of band, and that is a change to your deployment topology (a separate privileged step, an
operator-run step, or a restricted admin path), not a `GRANT`. What cannot be done is to make
an untrusted extension safe by granting less, because the escalation surface is the install
script itself, so there is no middle ground to find. The second half, which matters more in
a design review: the list of trusted extensions grows between major versions, so a migration
blocked on insufficient privilege today may succeed after an upgrade with no permission
change at all, and a pipeline that hard-fails on "insufficient privilege" is a pipeline
whose behaviour will change under you at the next major version. The third, and the wider
question: an extension cannot change the process model, the MVCC or WAL machinery, the
commit semantics, or the isolation implementation, because those *are* the engine. An
extension can add a type, an operator, an access method, a function, or an entire new index
implementation. It cannot make PostgreSQL transactional in some new way. Verify the current
trust list against the version you deploy to, because it is a documented, versioned
property rather than a stable one.

**S1. A PR adds a generated column `search_vector tsvector GENERATED ALWAYS AS
(to_tsvector('english', body)) STORED` and a GIN index on it. What does the reviewer need to
know?** `STAFF`

Three things, and the first two are where this pattern goes wrong. First, **a generated
column makes every update of `body` a non-HOT update.** A GIN index over the `tsvector` has
a key derived from a column that is being updated, which is exactly the condition that
disqualifies a HOT update — so every content edit writes a fresh index entry and the
`fillfactor` trick that makes ordinary updates cheap does not apply. That is a perfectly
acceptable trade for a table whose content changes rarely and is searched constantly, and
an unacceptable one where content changes constantly; the check is the same
`n_tup_hot_upd / n_tup_upd` ratio, and it will tell you immediately. Second, `GENERATED
ALWAYS AS ... STORED` means the value cannot be written to, which is right, but note the
migration cost: adding it to a large existing table is a full table rewrite under a lock,
because the column must be populated — and that rewrite holds the vacuum horizon for its
whole duration, which is Chapter 9's failure mode arriving by accident. The safe path on a
large table is `ADD COLUMN` nullable, backfill in bounded batches, then convert. (PostgreSQL
18 adds `VIRTUAL` generated columns, computed on read and so avoiding the rewrite entirely;
check the current docs for what your version supports.) Third, `'english'` is a hardcoded
configuration dictionary — a stemming and stop-word list that will quietly do the wrong
thing for non-English content, and which must be a literal, so it cannot be a parameter. If
the corpus is multi-language that is a schema decision, not an index option.
