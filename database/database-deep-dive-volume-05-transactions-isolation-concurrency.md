---
title: "The Database Complete Deep-Dive"
volume: 5
series: "TRANSACTIONS, ISOLATION LEVELS & CONCURRENCY"
subtitle: "Study & Interview Mastery Guide"
---

# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is an eleven-volume study guide to databases, written for engineers who already know
how to build a backend service and are preparing for senior and staff-level interviews. It
is not a tutorial. Nothing here explains what a transaction is.

The organising question of every chapter is the same one a staff engineer gets asked in a
real design review: **not "what does this do", but "why would a team choose this, what does
it cost, when does it break, and how expensive is it to undo?"** A transaction's
annotations — `ACID`, `REPEATABLE READ`, `MVCC`, `SERIALIZABLE` — are treated as the
visible surface of a concurrency protocol and a durability model, and the notes always go
down to that machinery, because that is the layer where production incidents actually live.
`SERIALIZABLE` is not a magic word that makes a workload correct; it is a specific
algorithm with a specific abort rate, and the gap between those two things is the bug.

Volume 5 is the volume where correctness stops being a schema question and becomes a
*time* question. Everything in Volumes 1 to 4 assumed a single reader looking at a settled
dataset. The moment a second transaction arrives, the questions change shape entirely: not
"what does this row contain" but "what did this row contain *at the moment I looked, and
what did the other transaction think it contained when it decided*". Almost every
catastrophic data bug in a production system that is not a memory leak is an
interleaving bug — two individually reasonable decisions that were each valid against the
state their author saw, and jointly invalid against the state the system now holds.

The staff-level theme running through the volume is **that isolation is a decision with a
price tag, and the price is paid by someone else's query.** Nobody in a design review asks
"what isolation level does this transaction need?" — the real question is "what does
raising it cost the transaction that arrives next, and who is that transaction?" A
`SERIALIZABLE` retry loop against a contended row is a self-inflicted outage; a long
snapshot is a vacuum that never runs; a table lock is a throughput tax collected from every
query on that table including the ones that had nothing to do with the write. The chapters
below are organised so that every claim about correctness comes with the interleaving that
makes it true, and every claim about safety comes with the latency that pays for it.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto the isolation
spectrum produces filler. The template is a completeness checklist, not a template to fill.

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

This volume is the one place in the set where the *drawing* matters more than the prose. A
concurrency claim that is not attached to a concrete interleaving of T1 and T2 is a
paraphrase of someone else's blog post, and the interview will find it. Every anomaly
below is drawn as a timeline showing the statements in the order they executed, the values
read, the values written, and what the final state is. If you can only produce the
definition, you do not yet know the mechanism.

### Continuing From Volume 4

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 (this book) | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL — InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

Volume 4 explained what an index does and why the planner chooses it. This volume explains
what happens while the planner's plan is *running* — what a concurrent transaction can see,
who blocks whom, and why the plan that took four milliseconds at 3am takes four seconds at
noon. Read Volume 4 for the access path; read this one for the traffic it meets.

### Table of Contents — Volume 5

- Chapter 1 — ACID, Precisely
- Chapter 2 — Concurrency Problems
- Chapter 3 — Isolation Levels
- Chapter 4 — MVCC
- Chapter 5 — Locks
- Chapter 6 — Optimistic vs Pessimistic Concurrency
- Chapter 7 — Deadlocks
- Chapter 8 — Distributed Transactions & the Boundaries
- Chapter 9 — Interview Scenario Bank

---

# Part 5 — Transactions, Isolation Levels & Concurrency

## Chapter 1 — ACID, Precisely

### 1.1 The Answer Everybody Gives, and Why It Is Wrong

The standard interview answer is: *"ACID stands for Atomicity, Consistency, Isolation,
Durability, and it means the database guarantees all four."* That answer scores zero, for
the same reason *"a database stores data"* scores zero: it restates the acronym and skips
the four load-bearing details that generate incidents. Those details are: **durability is a
configuration setting, not a property; atomicity is a property of a log rather than of a
transaction; consistency is not a guarantee the database makes at all; and isolation is a
menu of levels rather than a single behaviour.**

Each letter resolves into a mechanism, and every mechanism has a knob:

| Letter | The mechanism | The knob that changes it | What it costs |
| --- | --- | --- | --- |
| A | write-ahead log + rollback records | log file settings, group commit | a `fsync` per commit |
| C | *nothing* — it is your job plus the constraints | `CHECK`, `UNIQUE`, `FOREIGN KEY` | a check per write |
| I | MVCC snapshots or locks | isolation level | a longer snapshot, or more contention |
| D | `fsync` of the log at commit | `synchronous_commit`, `innodb_flush_log_at_trx_commit` | a device flush per commit |

The table is the whole chapter in miniature. Atomicity is bought with a log. Consistency is
bought with constraints and is otherwise a claim you are making in a design doc, not a
guarantee you are given. Isolation is bought with either snapshots or locks and is a
continuum, not a switch. Durability is bought with a flush and is the one you can
accidentally switch off for throughput and not find out for a month.

### 1.2 Atomicity Is a Log Property, Not a Transaction Property

The intuition people have is that atomicity means "the engine holds all the changes until
commit and then applies them at once". That is not what happens, and the difference is not
academic — it explains why uncommitted data is visible in the log, why a rollback is cheap,
and why a crash mid-transaction loses nothing.

What actually happens: **every modification is recorded in the write-ahead log as it
happens, not at commit.** The data pages are modified in the buffer pool, possibly visible
to nobody because of MVCC, and the log record is what makes those modifications real.

```text
  T1: BEGIN; UPDATE account SET balance = balance - 100 WHERE id = 1;
      UPDATE account SET balance = balance + 100 WHERE id = 2;
      COMMIT;

  WHAT THE ENGINE WRITES, IN ORDER
  ────────────────────────────────────────────────────────────────────
  log:  [BEGIN_TXN 4711]
  log:  [UPDATE row=acct/1  before(balance=1000) after(balance=900)]
  log:  [UPDATE row=acct/2  before(balance=1000) after(balance=1100)]
  log:  [COMMIT_TXN 4711]        <-- the atomic point, right here
  ────────────────────────────────────────────────────────────────────
        nothing is "applied". The data pages have not been touched. The
        log is the truth, and COMMIT_TXN is the line after which the
        transaction is *declared* to exist.
```

The consequence worth knowing: **an uncommitted transaction is already in the log,
durably, and will be rolled back by recovery.** If the process crashes after the first
`UPDATE` and before `COMMIT`, the log on disk contains half the transfer with no
`COMMIT_TXN` record. Recovery reads the log, replays the updates to reconstruct the page
images, and then — because there is no commit record for Txn 4711 — discards them. Nothing
was lost that was acknowledged, and nothing that was never acknowledged survived.

> **MUST REMEMBER**
>
> A transaction is not a unit of durability unless it commits. Its intermediate states are
> *in the log* — they are on disk, they survive a crash, and recovery deliberately throws
> them away. "Durable in the log" and "committed" are two different properties, and
> conflating them is what produces the interviewer question about a rolled-back transaction
> being visible after restart.

This is also why rollback is cheap. Undoing a transaction does not require the engine to
have kept the old page images in memory for the duration; in an MVCC engine the old
versions are exactly what the readers are using, and in a locking engine the before-images
are in the log. The engine does not "unapply" anything — it simply stops treating the
transaction as one that happened, and the version it would have created becomes garbage
that the vacuum or purge reclaims later (Volume 7, Chapter 9).

> **INTERVIEW TRAP — "WHAT HAPPENS IF THE DATABASE CRASHES MID-TRANSACTION?"**
>
> The expected answer is "the transaction is rolled back", and that is correct, but it is
> not *enough* — it invites the follow-up "how does it know to roll it back, and why is
> that safe?" The strong answer: the write-ahead log contains a `BEGIN` record and a set of
> update records for the transaction but no `COMMIT` record, because `COMMIT` is a
> separate, later, durable write. Recovery replays the log to rebuild the page state,
> finds the transaction with no commit marker, and discards its effects. **The absence of a
> record is what carries the information** — the log is a record of what happened, and
> "what did not happen" is encoded by what is absent from it.
>
> The follow-up that ends the question: "so is the half-finished transfer visible after the
> crash?" No. It is in the log, and recovery explicitly discards it. Durable-in-the-log
> and committed are different properties, and only the second one means the data is real.

### 1.3 Durability Requires `fsync`, and It Is a Configuration Choice

This is the single most consequential fact in the chapter, and the one most candidates get
wrong. **A commit that does not reach stable storage is not a commit.** The engine will
tell the client "committed", the application will tell the user "done", and the data will
be gone on the next power loss — with no error, no warning, and no way to know in advance
which commits were lost.

The mechanism is `fsync`: at commit, the engine flushes the log record to a device that
survives power loss. On a spinning disk that means waiting for the platter; on an SSD with a
write cache it means waiting for the cache to be flushed; on a network-attached volume it
may mean waiting for an acknowledgement from a device whose own cache may itself be lying
unless it is battery-backed and honouring a flush command.

```text
  COMMIT  ──►  write log record to OS buffer  ──►  fsync()  ──►  ACK to client
                        │                            │
              microseconds                    MILLISECONDS
                        │                  (this is the commit latency)
                        ▼
                 the OS page cache holds it.
                 A power cut here loses it.
                 The client has already been told "committed" only
                 AFTER the fsync returns — unless someone configured
                 the engine not to wait.
```

The knob exists in every major engine, and the settings are on a spectrum of "how much
durability am I willing to trade for throughput":

```sql
-- PostgreSQL: the durability ladder, per session
SET synchronous_commit = on;      -- default. fsync WAL at every commit.
SET synchronous_commit = off;     -- hand WAL to the OS and ACK immediately.
                                  -- Safe ONLY if the OS and device are
                                  -- battery-backed and honest.
SET synchronous_commit = remote_apply;  -- wait for a synchronous standby
                                        -- to apply it, then ACK.
SET synchronous_commit = remote_write;  -- wait for the standby to receive it.

-- PostgreSQL: the alternative, lose durability for everyone at once
ALTER SYSTEM SET wal_level = minimal;   -- no WAL at all for some writes
SET max_wal_senders = 0;
-- with synchronous_commit = off and wal_level = minimal, a crash can
-- lose recently-committed transactions AND corrupt the cluster.
```

```properties
# MySQL/InnoDB: the same ladder, same trade-off, one number
innodb_flush_log_at_trx_commit = 1   # default. fsync the redo log every commit.
                                     # Durable. ~1 commit per disk round trip,
                                     # batched by group commit under load.
innodb_flush_log_at_trx_commit = 2   # write to OS cache at commit, fsync once
                                     # per second by a background thread.
                                     # Loses up to ~1s of commits on power loss.
innodb_flush_log_at_trx_commit = 0   # write AND fsync to the OS cache, no fsync
                                     # at all. A power loss can corrupt InnoDB.
```

Setting `innodb_flush_log_at_trx_commit = 2` on an orders table is a completely normal
thing to find in a codebase, because it makes write throughput dramatically better and no
test ever fails. The failure it causes is a total, silent loss of the last second of
transactions on the day the building loses power — which is exactly the day the incident
review asks why the last orders are missing and nobody can answer.

> **PRODUCTION SCENARIO**
>
> Problem: a payments service commits 900 orders per second through a four-node MySQL
> cluster. The team has been load testing for a month and throughput is healthy. Following
> a routine switch failure, one node reboots. The order list loses the final 40 seconds of
> transactions across all four nodes — roughly 36,000 orders — with no corruption and no
> error anywhere. Customers have card receipts for orders that do not exist.
> Investigation: the log shows clean shutdowns and clean restarts, so nothing crashed. The
> node's own log had the records; the other three did not. Replication had been configured
> with `innodb_flush_log_at_trx_commit = 2` on all four nodes, "to reduce fsync latency
> during peak", and the change had been made in a config file that is not in the
> deployment manifest, so it never got reviewed.
> Root cause: setting 2 means the redo log is written to the OS page cache at commit and
> flushed to disk by a background thread roughly once per second. A switch failure or power
> cut loses everything committed in that window. The design also assumed replication would
> save them, but with setting 2 the replica had the same hole, so the acknowledged commits
> were never durable anywhere.
> Solution: restore the default, accept the fsync, and get the latency back by tuning the
> device rather than by lying about durability. The batch insert path was rewritten to use
> larger multi-row statements so the commit *count* dropped by 40×, which is the honest way
> to reduce fsync pressure. Semi-synchronous replication was enabled so at least one node
> acknowledges only after a replica has the record.
> Prevention: durability settings are part of the schema's contract and go in the migration
> repository next to the DDL, with a startup assertion that fails the boot if the value
> differs from the reviewed one. "Performance tuning" that reduces a durability guarantee
> should be treated as a schema change with a rollback plan, because it is one.

> **SCALING REALITY CHECK**
>
> A single `fsync` is roughly 0.5–10 ms depending on the device and whether it is a
> battery-backed cache or not. That caps a single-threaded committing client at somewhere
> between 100 and 2,000 commits per second, which looks like a hard ceiling and is not. The
> answer is **group commit**: transactions that commit while a flush is in flight attach to
> that flush and all get acknowledged when it returns, so throughput scales with the number
> of concurrent clients while latency stays at one device round trip. This is why the
> relevant number is not "how fast can we fsync" but "how many transactions are in flight
> when the fsync returns" — and it is why a connection pool with 3 connections cannot
> reach the device's ceiling no matter how fast the device is.

### 1.4 Consistency Is Not a Database Guarantee

The letter that gets the least honest treatment. `C` for consistency means, informally, that
a transaction moves the database from one valid state to another valid state. That is
*almost* the definition of an invariant the schema declares, and the engine's actual role in
it is small: the engine enforces the constraints you declared and nothing else.

```text
  WHAT "CONSISTENCY" MEANS, SPLIT BY OWNER
  ─────────────────────────────────────────────────────────────────────────
  The engine guarantees        Your schema declares    Your code decides
  ─────────────────────        ────────────────────    ─────────────────
  UNIQUE, NOT NULL,            "at least 2 doctors    "which doctors may
  CHECK, FK, PK                must be on call"        take this shift"
                               (usually a TRIGGER,
                                a partial unique
                                index, or nothing)
  ─────────────────────────────────────────────────────────────────────────
  The engine cannot know what "at least 2" means. Nobody has told it. The
  most common failure of a "the database guarantees consistency" claim is
  that the invariant was never expressed in anything the engine can check.
```

The standard worked example is a transfer, and it is worth walking through because the
engine's part is genuinely small:

```sql
BEGIN;
  UPDATE account SET balance = balance - 100 WHERE id = 1;  -- check: balance >= 0
  UPDATE account SET balance = balance + 100 WHERE id = 2;  -- check: balance >= 0
COMMIT;
```

The engine's contribution is exactly: (1) if the machine dies at any point, either both
updates are durable or neither is — that is `A`; (2) if another transaction runs
concurrently, it does not see the intermediate state where money has left account 1 and not
yet arrived at account 2 — that is `I`; (3) neither `CHECK` fails, so no error — and if one
*had* failed, the rollback would have preserved the prior state, which is `A` again. The
invariant that "the total is conserved" was never checked by anything. It held because the
two statements were written symmetrically by a careful human. Nothing enforced it.

> **INTERVIEW TRAP — "WHAT DOES THE 'C' IN ACID ACTUALLY GUARANTEE?"**
>
> The trap answer is "the data is always in a consistent state", which asserts a guarantee
> the engine does not make. The honest answer: **the database engine does not guarantee
> application-level consistency at all; it guarantees that the constraints you declared are
> never violated.** `C` in the original formulation is really a restatement of `A` and `I`
> plus your own business rules, and the part your business rules express as a `CHECK` or a
> `UNIQUE` index is the only part the engine can see. If an invariant is not expressible as
> a single-row predicate, a unique index, or a foreign key, then *nothing at the database
> layer is enforcing it* and consistency for that invariant lives entirely in application
> code, where it holds exactly as long as every writer goes through that code and no two
> writers race.
>
> The strong follow-up: "so what does a multi-tenant row-level security invariant belong
> to?" Answer: the same place. If "every query must be scoped to the caller's tenant" is
> enforced by remembering to add `WHERE tenant_id = ?` in every DAO method, then `C` for
> that invariant is a code-review convention, not a database guarantee — and row-level
> security policies in PostgreSQL are the mechanism that moves it into the first category.

> **MUST REMEMBER**
>
> A transaction protects *atomicity, isolation and durability* mechanically. It protects
> *consistency* only as far as your constraints reach. If an invariant is not a `CHECK`, a
> `UNIQUE` index, or a `FOREIGN KEY`, it is a comment in a design doc and a `throw` in Java,
> and no amount of `SERIALIZABLE` will enforce it.

### 1.5 Isolation Is a Menu, Not a Setting

The fourth letter is the one this volume is about, and the first thing to unlearn is that
isolation is a property rather than a choice. It is a *menu of guarantees*, each stronger
than and more expensive than the last, and almost every production system sits at the
weakest level that its correctness argument actually requires — which is almost never the
weakest level available.

```text
  THE FOUR ANOMALIES, AND WHO IS ALLOWED TO CAUSE THEM
  ─────────────────────────────────────────────────────────────
                    Dirty   Non-repeatable   Phantom   Write
                    read       read          read      skew
  ─────────────────────────────────────────────────────────────
  READ UNCOMMITTED    yes        yes           yes      yes
  READ COMMITTED      no         yes           yes      yes
  REPEATABLE READ     no         no            *yes     **yes
  SNAPSHOT (RC)       no         no            no       **yes
  SERIALIZABLE        no         no            no       no
  ─────────────────────────────────────────────────────────────
  *  phantoms depend on the mechanics: predicate locks (InnoDB RR) can
     prevent them; snapshot visibility (PostgreSQL RR) cannot.
  ** write skew is invisible everywhere below SERIALIZABLE, always.
  ─────────────────────────────────────────────────────────────
  (Chapter 3 gives the full per-engine matrix; this is the shape.)
```

`C` and `I` interact in a way worth naming early, because it is the reason this volume
exists: **atomicity is what makes isolation meaningful, and isolation is what makes atomicity
worth asking for.** An all-or-nothing group of writes that other transactions can read
half-finished is not atomic from any business perspective — the atomicity is real in the log
and invisible to the users. That is why the interesting questions are never "is this
transaction atomic" but "what may the other transaction see while it is open".

> **STAFF-LEVEL CONSIDERATION**
>
> The question to raise in a design review is rarely "which isolation level" — it is "what
> is the argument that this level is *sufficient*, and where is it written down?" Most
> teams pick a level by inheritance from whatever the framework's default was in the
> template, and never write down which anomalies their code tolerates. A one-page note per
> transaction — the invariants it depends on, the level that gives them, and the retry
> strategy for serialization failures — is the cheapest correctness artefact a team can
> produce, and it turns every future concurrency question from archaeology into a
> conversation. It is also the artefact that survives the engineer who chose the level
> leaving.

#### Common Mistakes

- Saying `C` means "the data stays consistent", which claims an application-level guarantee
  the engine has no way to give and does not check
- Belving durability is a property of committing, rather than a property of a device flush
  that a configuration switch can turn off — and not knowing what
  `innodb_flush_log_at_trx_commit = 2` actually costs
- Saying an uncommitted transaction's writes are "not saved" — they are in the log,
  durably, and recovery discards them because there is no commit record
- Treating isolation as binary, and therefore assuming `REPEATABLE READ` is "as safe as
  `SERIALIZABLE` but faster" — the anomalies they prevent are not a strict subset
- Assuming a transaction's isolation level is the only thing that matters, and that two
  transactions at the same level always see each other's commits (a `READ ONLY` snapshot
  takes its view when it *starts*; a `READ COMMITTED` transaction takes a new one per
  statement — this is Chapter 3)
- Believing `ACID` is what makes a database enterprise-grade, rather than four independent
  mechanisms that can each be traded away separately

#### Interview Questions — ACID, Precisely

**Q1. Break down each letter of ACID into a mechanism. What is the mechanism behind
each?** `STAFF`

Atomicity is the write-ahead log plus rollback records: modifications are journalled as
they happen and the transaction is declared to exist at a single `COMMIT` record, so
recovery replays committed transactions and discards the rest. Consistency is not a
mechanism in the engine at all — it is the conjunction of the constraints you declared
(`CHECK`, `UNIQUE`, `FOREIGN KEY`), which the engine enforces, plus whatever business rules
lived only in your application code, which it does not. Isolation is a visibility
protocol, and it is a menu rather than a setting: MVCC snapshots (which give `READ
COMMITTED` and `REPEATABLE READ`) or locks (which give everything and cost more), with the
anomalies each level permits as the real specification. Durability is a device flush — a
`fsync` of the log at commit, gated by `synchronous_commit` in PostgreSQL and
`innodb_flush_log_at_trx_commit` in MySQL. Knowing that two of the four are configuration
choices is the part that distinguishes a senior answer.

**Q2. Your service commits an order and immediately ACKs the client. The database host
loses power. The client believes the order exists. What went wrong?** `SCENARIO`

The commit was acknowledged without having reached stable storage, so durability was never
actually provided — the ACID promise was a configuration artifact that nobody checked.
The specific cause is almost always a relaxed log-flush setting: `synchronous_commit = off`
or `innodb_flush_log_at_trx_commit = 2` (or `0`), tuned for benchmark throughput and left
in place. Setting `0` is worse than losing data — it can corrupt InnoDB, because the redo
log's own consistency assumptions break. The other possibility is a device that lies: a
cloud volume or RAID controller with a non-battery-backed write cache that acknowledges
writes it has only buffered. The response is threefold: restore the default setting, verify
the device cache is honest or write through, and if latency is genuinely unacceptable,
buy the latency back with fewer commits (batching, larger statements) or with synchronous
replication rather than with a weaker promise. Then add the startup assertion that makes
the setting impossible to change silently.

**Q3. A transaction updates three rows and the process is killed before `COMMIT`. What is
on disk at that moment, and what does recovery do?** `TRICKY`

On disk, in the write-ahead log, there is a `BEGIN` record and three update records with
their before-images, and no `COMMIT` record. That is durable — assuming the log itself was
flushed, which for an uncommitted transaction is typically *not* forced, so on a power loss
even the log records may be gone; on a process kill (not a power loss) the OS page cache
survives and the records are there. Recovery replays the log to rebuild page state, finds
transactions with a begin and no commit, and discards their effects. Nothing that was
acknowledged is lost, and nothing unacknowledged becomes visible. The point to land is that
"durable in the log" and "committed" are two different properties, and the log encodes
"what did not happen" by the *absence* of a record — which is why `COMMIT` is a separate,
later, flushed write rather than a flag flipped at the end of the work.

**Q4. What invariant does `C` in ACID actually guarantee, and what happens to the ones it
does not?** `ADVANCED`

The engine guarantees exactly that the constraints declared in the schema are never
violated: `PRIMARY KEY` and `UNIQUE` mean no duplicates, `NOT NULL` means no nulls,
`CHECK` means the per-row predicate holds, `FOREIGN KEY` means the reference resolves. That
is the whole of it. Any invariant that is not expressible as one of those — "the sum of
transfers in a batch equals the batch total", "at least two doctors must be on call" — is
enforced by nothing at the database layer. It lives in application code, where it holds for
every writer that goes through that code and no two of them race, which is a much weaker
guarantee than it sounds. The practical consequences are: cross-row invariants should be
redesigned into single-row predicates, unique indexes, or partial indexes rather than left
as application logic; `SERIALIZABLE` does *not* rescue them, because serializability
guarantees the transactions ran in some serial order, not that the order satisfied a rule
nobody wrote down; and a security or tenancy invariant should be moved into a mechanism the
engine evaluates on every statement (PostgreSQL row-level security) rather than into DAO
methodology.

**Q5. Why is a single-threaded transaction loop capped at a few hundred commits per second
on a fast NVMe disk, and what actually raises the ceiling?** `ADVANCED`

Because each commit pays a device flush. An `fsync` is 0.5–10 ms even on fast NVMe — it is
a round trip to a device with its own cache and its own power-loss contract, and no amount
of CPU makes it faster — so a client that commits and waits serialises at one flush per
iteration, giving 100 to 2,000 commits per second and no more. The mechanism that lifts
this without weakening anything is **group commit**: while a flush is in flight, further
transactions write their log records and queue behind that flush rather than starting their
own; when it returns, all of them are acknowledged at once. Throughput therefore becomes
flushes-per-second multiplied by the number of transactions that arrived during each flush,
while per-transaction latency stays at one device round trip. This is the real reason the
connection pool size matters more than the disk, and the reason "increase the fsync speed"
is almost never the answer — it is the arrival rate during the flush window that is the
lever.

> **CHAPTER 1 SUMMARY**
>
> ACID is four independent mechanisms, and three of the four are routinely oversold. Atomicity
> is a property of the write-ahead log, not of the transaction object, and an uncommitted
> transaction is durably in the log and correctly discarded by recovery. Durability is a
> device flush gated by a configuration switch, and a commit acknowledged without one is
> not a commit — which is why `synchronous_commit` and `innodb_flush_log_at_trx_commit`
> belong in the migration repository next to the DDL rather than in a performance
> experiment. Consistency is not a guarantee the engine makes at all; it is whatever your
> `CHECK` and `UNIQUE` constraints reach, and every invariant they do not reach is enforced
> by code that another writer may never call. Isolation is a menu with a price tag, and the
> rest of this volume is about what each rung costs and which anomalies it still permits.

#### Further Reading

- [PostgreSQL — Write-Ahead Log](https://www.postgresql.org/docs/current/wal.html) — the mechanism that makes `A` a property of the log rather than of the transaction, and the full durability ladder.
- [PostgreSQL — `synchronous_commit`](https://www.postgresql.org/docs/current/runtime-config-wal.html#GUC-SYNCHRONOUS-COMMIT) — the four settings, what each one acknowledges, and which failures each one survives.
- [MySQL — `innodb_flush_log_at_trx_commit`](https://dev.mysql.com/doc/refman/8.0/en/innodb-flush-log-at-trx-commit.html) — the three values, the exact window of data loss, and why `0` can corrupt rather than merely lose.
- [PostgreSQL — Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — the only mechanisms through which `C` reaches the engine, and the `NOT VALID` / `VALIDATE` split for large tables.

## Chapter 2 — Concurrency Problems

### 2.1 The Frame: Why Concurrency Bugs Are Different in Kind

A concurrency bug is not a bug with extra steps. It is a bug that is *invisible on every
single-threaded replay*, which means it survives code review, unit tests, integration
tests, staging with one writer, and often a full production week. It appears only when
two things happen in a particular order, and the order that triggers it is the one the
test suite did not happen to produce.

The consequence is that **the class of bug cannot be found by testing at all.** You cannot
write a test for write skew that reliably fails, because whether it manifests depends on
when the scheduler interleaved two threads. What you can do is:

- *design* so the bad interleaving cannot occur (isolation, constraints, ordering rules)
- *reason* about interleavings explicitly, which is what this chapter is for
- *instrument* so that when one does occur you can see it rather than infer it

```text
  WHY THESE BUGS SURVIVE EVERYTHING
  ─────────────────────────────────────────────────────────────
  sequential replay:   T1 then T2  →  fine
  sequential replay:   T2 then T1  →  fine
  the real run:        T1 reads, T1 reads, T2 reads, T1 writes,
                       T2 writes                    →  BROKEN
  ─────────────────────────────────────────────────────────────
  The test suite proves nothing about the third line, ever, because
  the test suite controls the order and the bug is about the order.
```

The practical definition to hold onto: **a lost update is a read-modify-write where the
read and the write were separated. Almost every anomaly in this chapter is one of two
shapes — a read-modify-write that got split (lost update), or a decision made from state
that another transaction is concurrently invalidating (write skew).** Everything else is
a variation on those.

### 2.2 Lost Update

The canonical anomaly, and the one that generated the phrase. It requires nothing exotic:
a read, then a write, where the write is based on the read and nothing prevents another
transaction from writing in between.

**Schema and starting state:**

```sql
CREATE TABLE accounts (
  id     INT PRIMARY KEY,
  owner  TEXT NOT NULL,
  balance INT NOT NULL
);
INSERT INTO accounts VALUES (1, 'ada', 1000);
```

**The bug, in application code:**

```sql
-- T1's application code                     -- T2's application code
SELECT balance FROM accounts WHERE id = 1;   SELECT balance FROM accounts WHERE id = 1;
-- returns 1000                              -- returns 1000
UPDATE accounts SET balance = 1000 - 100     UPDATE accounts SET balance = 1000 - 100
  WHERE id = 1;                              WHERE id = 1;
-- 100 becomes 100                           -- 100 becomes 100
```

**The interleaving, drawn:**

```text
  time │ T1 (withdraw $100)              T2 (withdraw $100)        balance
  ─────┼──────────────────────────────────┼────────────────────────┼────────
   1   │ BEGIN                            │                         │ 1000
   2   │                                  │ BEGIN                   │ 1000
   3   │ SELECT balance → 1000            │                         │ 1000
   4   │                                  │ SELECT balance → 1000    │ 1000
   5   │                                  │                         │ 1000
   6   │ UPDATE balance = 900             │                         │ 1000  ← not
   7   │                                  │ UPDATE balance = 900     │ 900      yet
   8   │ COMMIT                           │                         │ 900
   9   │                                  │ COMMIT                   │ 900
  ─────┼──────────────────────────────────┼────────────────────────┼────────
       │ final balance: 900. Two withdrawals of $100 from $1000.
       │ Correct answer: 800. $100 vanished.
```

Note what happened at step 6: T2's `UPDATE` did not conflict with T1's, in the sense of
erroring. It simply *overwrote* a value that was computed from stale data. The final state
is a value that no transaction ever intended to produce and that satisfies every constraint
in the schema. The database has no reason to complain.

> **MUST REMEMBER**
>
> A lost update is not fixed by any standard isolation level. The SQL standard has no
> `NO LOST UPDATE` level, because Read Committed and above all permit this interleaving by
> definition — the anomaly is *defined* as being permitted. The fixes are structural:
> make the write atomic (`balance = balance - 100`), add a version column and compare and
> swap, or take a row lock before reading (`SELECT ... FOR UPDATE`).

### 2.3 Why `UPDATE ... SET x = x + 1` Is Not the Same Thing

This is the most useful distinction in the chapter, and it is where most candidates stop
being able to explain *why* their code is safe.

```text
  UNSAFE: read-modify-write across two round trips
  ────────────────────────────────────────────────
    connection 1:  SELECT balance      → 1000
                   UPDATE ... SET balance = 1000 - 100
    connection 2:  SELECT balance      → 1000      ← read the same 1000
                   UPDATE ... SET balance = 1000 - 100
    final: 900. One withdrawal lost.

  SAFE: one statement, expression re-evaluated by the engine
  ───────────────────────────────────────────────────────
    connection 1:  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    connection 2:  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
    final: 800. Correct.
```

The safe version is safe because of a specific engine behaviour, not because of a keyword.
When an `UPDATE` reads a column of the row it is updating, the engine evaluates the
expression **against the current, locked version of the row, at the moment the write is
applied** — not at the moment the statement was sent. So the second `UPDATE` waits for the
first to commit, then re-reads `balance`, finds 900, and writes 800.

The consequence to state out loud: **atomicity of `x = x + 1` is a property of the
engine's row-level write path, not a property of the expression.** It holds because the
write takes a row lock and the expression is evaluated under it. It does *not* hold if you
send the value computed in your application:

```java
// WRONG — the value was computed from a read that is now stale
int balance = jdbc.queryForObject("SELECT balance FROM accounts WHERE id = 1", ...);
jdbc.update("UPDATE accounts SET balance = ? WHERE id = 1", balance - 100);

// RIGHT — the engine evaluates `balance - 100` under the row lock
jdbc.update("UPDATE accounts SET balance = balance - 100 WHERE id = 1");

// ALSO RIGHT — read and lock in one statement, so the two cannot separate
jdbc.update("UPDATE accounts SET balance = balance - 100 WHERE id = 1");
```

And the case that is *neither*, and that shows up constantly in ORM code — the read and the
update are in different sessions entirely, because the read was a lazy load inside a
transaction that is not the one doing the write, or the "read" was actually a cache hit
from an in-process map:

```java
// The read may not even have touched the database.
Account cached = accountCache.get(id);          // or a JPA @ManyToOne lazy proxy
entityManager.detach(cached);                    // the persistence context is now
accountRepository.save(new Account(id, 900));   // writing a detached object
// Nothing in this code re-reads under a lock. This is a lost update with
// a caching layer in front of it, which is harder to reproduce and easier
// to ship.
```

> **INTERVIEW TRAP — "IS `UPDATE accounts SET balance = balance - 100` ATOMIC?"**
>
> The trap is answering "yes, because the database does it in one statement." The
> load-bearing word is not *statement* — it is *under the row lock*. The engine locates the
> row, takes a write lock on it, waits if another transaction holds one, then evaluates
> `balance - 100` **against the version it just locked, not the version that existed when
> the statement was sent**. That re-evaluation under the lock is the entire mechanism, and
> it is why the pattern is safe. It stops being safe the moment you compute the value
> anywhere else — in Java, in a Python service, in a Redis cache, in an ORM's detached
> entity — because then the expression is evaluated against whatever that read saw.
>
> The corollary worth volunteering: this safety depends on the row being addressable. If
> the update is a multi-row statement touching many rows in an order the other transaction
> also touches, the same re-evaluation now happens in an order, and two transactions can
> still deadlock — which is Chapter 7, and which is why "just do it in one statement" is
> not a complete answer to a concurrency review.

### 2.4 Dirty Read

Reading data that another transaction has written but not committed, and which may yet be
rolled back.

```sql
-- starting state
CREATE TABLE inventory (sku INT PRIMARY KEY, qty INT NOT NULL);
INSERT INTO inventory VALUES (1, 10);
```

```text
  time │ T1 (order reserves 8 units)         T2 (warehouse dashboard)   qty
  ─────┼─────────────────────────────────────┼─────────────────────────┼──────
   1   │ BEGIN                               │                         │  10
   2   │ UPDATE inventory SET qty = 2        │                         │  10
   3   │   (uncommitted — T1 may still      │                         │
   4   │    roll this back)                  │                         │
   5   │                                     │ SELECT qty → 2          │  10
   6   │                                     │  "only 2 left,          │
   7   │                                     │   order 6" ✓            │
   8   │ ROLLBACK                            │                         │  10
  ─────┼─────────────────────────────────────┼─────────────────────────┼──────
       │ T2 made a business decision on a number that never existed.
       │ The order it placed cannot be fulfilled. T2's "6" was a ghost.
```

The interesting part of this example is that T2 did nothing wrong *in isolation*. It read a
number and used it. The damage is that the number was later retracted, and T2's write into
*its own* tables committed against a value that never was. This is the anomaly that most
obviously justifies Read Committed as a floor, which is why `READ UNCOMMITTED` is almost
never used except as a debugging tool.

`READ UNCOMMITTED` has exactly one legitimate use: **seeing what another session is
currently working on when you are debugging a lock or a slow query.** It is not a
performance setting, which is the only thing people reach for it for, and it is genuinely
dangerous to leave set.

### 2.5 Non-Repeatable Read

The same transaction reads the same row twice and gets two different values, because
another transaction committed in between. This is the anomaly that `READ COMMITTED`
explicitly permits and `REPEATABLE READ` exists to prevent.

```text
  time │ T1 (generate invoice for order 5)    T2 (price changes)     order.price
  ─────┼──────────────────────────────────────┼───────────────────────┼────────
   1   │ BEGIN                                │                       │  100
   2   │                                      │ BEGIN                 │  100
   3   │ SELECT price FROM orders             │                       │  100
   4   │   WHERE id = 5 → 100                 │                       │  100
   5   │                                      │ UPDATE orders SET     │
   6   │                                      │   price = 120         │
   7   │                                      │   WHERE id = 5        │
   8   │                                      │ COMMIT                │  120
   9   │ SELECT price FROM orders             │                       │  120
  10   │   WHERE id = 5 → 120                 │                       │  120
  11   │ COMMIT (invoice says 100,            │                       │
  12   │        database says 120)            │                       │
  ─────┼──────────────────────────────────────┼───────────────────────┼────────
```

The business failure is specific and recognisable: an invoice computed from a price that
no longer exists, a validation that passed against a balance that has since moved, a report
whose two halves come from two different moments. The transaction read the same row twice
and got two different worlds.

Note what does **not** happen here: T1 was not blocked at any point. Read Committed
answers this by taking a *fresh snapshot per statement*, so statement 3 sees the state as
of time 3 and statement 9 sees the state as of time 9. There is no wait, no error, and no
hint that anything is wrong. That absence of any symptom is what makes it dangerous — it is
a silent, plausible-looking wrong answer rather than a loud failure.

### 2.6 Phantom Read

A `SELECT` that returns a set of rows returns a *different set* on a second execution,
because another transaction inserted or deleted matching rows. Non-repeatable read is about
a value changing; phantom is about a set changing.

```text
  time │ T1 (report: orders over $500)     T2 (a new big order)     rows matching
  ─────┼───────────────────────────────────┼─────────────────────────┼────────────
   1   │ BEGIN                             │                         │ {7, 9}
   2   │                                   │ BEGIN                   │ {7, 9}
   3   │                                   │ INSERT INTO orders      │
   4   │                                   │   (id=12, total=900)    │
   5   │                                   │ COMMIT                  │ {7, 9, 12}
   6   │ SELECT count(*) FROM orders       │                         │
   7   │   WHERE total > 500 → 2           │                         │ {7, 9, 12}
   8   │                                   │                         │
   9   │ SELECT sum(total) FROM orders     │                         │
  10   │   WHERE total > 500 → 1600        │                         │ {7, 9, 12}
  11   │ COMMIT                            │                         │
  ─────┼───────────────────────────────────┼─────────────────────────┼────────────
       │ count says 2, sum says 3 rows. The total is understated by 900.
       │ A "repeatable" query about a SET that is not repeatable.
```

Why it needs its own name: fixing non-repeatable read does **not** automatically fix
phantom, and the two fixes are structurally different. A value change is fixable by
remembering which row versions you read — pin the row. A set change has no rows to pin,
because the offending row did not exist when you looked. To fix it you must pin the
*range* the rows could come from — which is what a predicate lock or a gap lock does, and
it is a materially heavier mechanism than a row lock because the range may be large,
infinite, or not indexed at all.

This is where the two major engines genuinely diverge, and it is the single most important
per-engine difference in the whole volume:

```text
  REPEATABLE READ — SAME NAME, DIFFERENT MECHANISM, DIFFERENT ANSWER
  ─────────────────────────────────────────────────────────────────────
  MySQL / InnoDB                                  PostgreSQL
  ─────────────                                  ───────────
  RR = snapshot for CONSISTENT                   RR = snapshot, established
  READS + next-key (gap + record)                at the first statement in the
  locks for UPDATES and DELETES                  transaction, held to COMMIT
        │                                               │
        ▼                                               ▼
  phantoms on UPDATE/DELETE:  PREVENTED          phantoms:  NOT PREVENTED
  (the gap between existing index keys is          (a snapshot has no concept of
   locked, so an INSERT into that gap waits)        a gap; new rows are simply
                                                   invisible)
  phantoms on SELECT ... WHERE:    NOT           phantoms:  NOT PREVENTED
  PREVENTED unless the SELECT itself is           and the inserts do not block
  locking. A plain SELECT never takes gap          either.
  locks at all.
        │                                               │
        ▼                                               ▼
  consequence: an UPDATE in T2 can be blocked     consequence: nothing blocks,
  by a T1 that has merely read the range —         and nothing sees it. To get
  which is famously surprising and is               phantom protection in
  famously deadlock-prone                           PostgreSQL you must go to
                                                   SERIALIZABLE (SSI) or take
                                                   an explicit lock.
```

> **PRODUCTION RELEVANCE**
>
> "Our reports are internally inconsistent — the header count doesn't match the rows" is a
> ticket that arrives in a codebase using `READ COMMITTED`, and it is usually diagnosed as
> an application bug when it is actually the isolation level. The fix depends entirely on
> which engine is underneath: on MySQL/InnoDB, promoting a reporting transaction to
> `REPEATABLE READ` fixes it for the update/delete phantom case for free, but not for
> phantom *inserts* unless the reads themselves lock. On PostgreSQL, `REPEATABLE READ` is
> already snapshot isolation and the promotion that helps is `SERIALIZABLE`, which
> introduces aborts. The same ticket has two different correct fixes depending on the
> engine, and a candidate who cannot name that difference is guessing.

### 2.7 Write Skew — The Anomaly Nobody Is Looking For

Write skew is the anomaly that a candidate who has memorised the isolation table has not
seen, and it is the one that most often separates a senior answer from a staff answer,
because it requires understanding that **isolation levels describe what a transaction
sees, not what a set of transactions may collectively decide.**

The shape has four steps, and all four are necessary:

1. A transaction **reads** state that a constraint depends on.
2. Another transaction **also reads** that same state, and both see a value that permits
   the action.
3. Each transaction **independently decides** the action is permitted — and each decision
   is *locally correct* against the state it saw.
4. Each transaction **writes** in a way that does not violate any individual constraint,
   but the **combination** of the writes violates the constraint.

No transaction ever violated a constraint. The constraint was violated anyway.

**The two-doctor appointment, in full:**

```sql
CREATE TABLE doctors_on_call (
  day          DATE  NOT NULL,
  shift        TEXT  NOT NULL,          -- 'morning' | 'evening'
  doctor_id    INT   NOT NULL,
  PRIMARY KEY (day, shift)
);

-- The business rule, stated plainly:
-- "Every (day, shift) must have at least two doctors on call."
-- It is not expressible as a CHECK on this table, because it is an aggregate
-- over a set. It is enforced today by a service-layer assertion — which is
-- exactly the situation write skew is designed to expose.
```

Initial state: one doctor, Dr. Chen, is on call for the morning of 2026-04-01. The service
requires two, so the rota is temporarily short and two people are being called.

```text
  time │ T1 (Dr. Chen cancels)              T2 (Dr. Okafor cancels)   doctors
  ─────┼────────────────────────────────────┼─────────────────────────┼──────────
   1   │ BEGIN                              │                         │ {Chen}
   2   │                                    │ BEGIN                   │ {Chen}
   3   │ SELECT count(*) FROM doctors_      │                         │ {Chen}
   4   │   on_call                          │                         │ {Chen}
   5   │   WHERE day='2026-04-01'          │                         │ {Chen}
   6   │   AND shift='morning'              │                         │ {Chen}
   7   │   → 1                              │                         │ {Chen}
   8   │                                    │ SELECT count(*) ...      │ {Chen}
   9   │                                    │   → 1                   │ {Chen}
  10   │                                    │                         │ {Chen}
  11   │ 1 is < 2, so the shift is         │ 1 is < 2, so the shift   │ {Chen}
  12   │ already short. Safe to cancel.     │ is already short. Safe   │ {Chen}
  13   │                                    │ to cancel.              │ {Chen}
  14   │                                    │                         │ {Chen}
  15   │ DELETE FROM doctors_on_call        │                         │ {Chen}
  16   │   WHERE day='2026-04-01'           │                         │ {Chen}
  17   │   AND shift='morning'              │                         │ {Chen}
  18   │   AND doctor_id = 1                │                         │ {Chen}
  19   │                                    │ DELETE ...              │ {Chen}
  20   │                                    │   doctor_id = 2         │ {Chen}
  21   │ COMMIT                             │                         │ {}
  22   │                                    │ COMMIT                  │ {}
  ─────┼────────────────────────────────────┼─────────────────────────┼──────────
       │ doctors on call for 2026-04-01 morning: 0
       │ The rule says ≥ 2. Both deletes succeeded. Both decisions
       │ were correct when made. The system is now invalid and nothing
       │ raised an error, because no constraint was ever declared.
```

**Why no isolation level below `SERIALIZABLE` prevents this.** At `READ COMMITTED`, T1 and
T2's reads do not conflict — neither writes a row the other read. At `REPEATABLE READ`,
T1 and T2 read the same stable snapshot — which is exactly what makes the bug *worse*,
because it guarantees both see the same "1 doctor" and both conclude they are safe. At
snapshot isolation, each transaction writes a *different* row, so there is no write-write
conflict to detect, and both commit. The transaction's own view was completely stable and
completely correct. The failure is in the relationship *between* the two transactions, and
the levels below `SERIALIZABLE` only constrain what each transaction can see individually.

That last sentence is the thing to say in an interview. **Isolation levels are defined
per transaction; the anomaly is defined across a set of them.**

**What actually fixes it,** in order of preference:

```sql
-- FIX 1 — restructure so the invariant becomes a per-row write.
--        A single row whose update is the decision removes the skew,
--        because now both transactions contend on one row.
--
--   Instead of one row per (day, shift, doctor), keep a counter row:
--
CREATE TABLE shift_coverage (
  day          DATE PRIMARY KEY,
  shift        TEXT NOT NULL,
  doctor_count INT  NOT NULL,
  CONSTRAINT at_least_two CHECK (doctor_count >= 2)
);
-- Both doctors' cancellation transactions now UPDATE the same row.
-- One of them sees 2 and drops to 1, the other's CHECK fails and it
-- rolls back. The anomaly is gone because the invariant is now single-row.

-- FIX 2 — serialise on the thing both transactions must agree about.
BEGIN;
  -- Take a lock that both transactions will contend for, BEFORE reading.
  -- Now T2 blocks here until T1 commits, and T2 then reads 0 and fails
  -- its own assertion correctly.
  SELECT 1 FROM shift_coverage
   WHERE day = '2026-04-01' AND shift = 'morning'
   FOR UPDATE;
  SELECT count(*) FROM doctors_on_call
   WHERE day = '2026-04-01' AND shift = 'morning';
  DELETE FROM doctors_on_call
   WHERE day = '2026-04-01' AND shift = 'morning' AND doctor_id = 1;
COMMIT;

-- FIX 3 — SERIALIZABLE. Correct, and the most expensive option.
--        One of the two transactions is aborted at commit time and
--        MUST be retried. See Chapter 3 on why that is a normal
--        outcome and not a bug.
BEGIN ISOLATION LEVEL SERIALIZABLE;
  SELECT count(*) FROM doctors_on_call
   WHERE day = '2026-04-01' AND shift = 'morning';
  DELETE FROM doctors_on_call
   WHERE day = '2026-04-01' AND shift = 'morning' AND doctor_id = 1;
COMMIT;
```

> **INTERVIEW TRAP — "AT WHAT ISOLATION LEVEL DOES WRITE SKEW GO AWAY?"**
>
> The trap answer is "`REPEATABLE READ`", and it is the answer that ends the interview
> early, because the candidate has confused *repeatable reads* with *repeatable
> decisions*. `REPEATABLE READ` guarantees T1 sees the same version of every row it reads,
> twice. It says nothing about T2. In the two-doctor example, `REPEATABLE READ` makes the
> bug *more* deterministic: both transactions are pinned to the same snapshot, both see one
> doctor, and both conclude they are safe. The transactions do not conflict on any single
> row — T1 deletes the row for doctor 1, T2 deletes the row for doctor 2 — so there is no
> write-write conflict and nothing to detect.
>
> The correct answer has two halves, and the second half is what makes it a staff answer.
> First: write skew requires `SERIALIZABLE`, or a mechanism that makes the invariant
> single-row (a counter row with a `CHECK`) or serialises the two transactions explicitly
> (`SELECT ... FOR UPDATE` on a shared anchor row). Second — and this is the part that
> gets left out — **the better answer is usually the first one**, because `SERIALIZABLE`
> on a contended invariant is a throughput tax and an abort-retry loop, whereas a
> `CHECK`-enforced counter row makes the constraint a database invariant and removes the
> class of bug entirely. The isolation level is the tool you reach for when you have
> already decided the schema cannot express the rule.

> **MUST REMEMBER**
>
> Write skew requires all four steps: read, read the same, decide independently, write
> without conflict. Remove any one and it is not write skew. The high-yield interview move
> is to *name which step* a proposed fix removes — a version column removes step 4's
> freedom, a `FOR UPDATE` on a shared anchor removes step 1's freedom, a counter row
> collapses steps 1–3 into one contended write, and `SERIALIZABLE` removes the ability of
> the *set* of transactions to run in an order that violates the rule.

### 2.8 Read Skew — The Anomaly That Hides Inside a Correct Snapshot

There is one more shape worth drawing, because it is the one that survives a correct
snapshot and it explains why "every row I read is stable" is not the same as "my answer is
internally consistent."

Read skew (also called aggregate or inconsistent analysis) is when a transaction's snapshot
is itself a legitimate serial state, but the state it observes is one that *no other
transaction's committed changes are consistent with* — because the snapshot was taken
across the boundary of another transaction's commit.

```text
  time │ T1 (transfer: audit "from" and "to")  T2 (deposit)      ledger
  ─────┼───────────────────────────────────────┼─────────────────┼────────────
   1   │ BEGIN                                 │                 │
   2   │                                       │ BEGIN           │
   3   │                                       │ INSERT          │
   4   │                                       │  (acct 2, +500) │
   5   │                                       │                 │
   6   │  ── T2 COMMITs here ──                │ COMMIT          │
   7   │                                       │                 │ acct2: 1500
   8   │ SELECT balance FROM accounts          │                 │
   9   │   WHERE id = 1 → 500                  │                 │ acct1: 500
  10   │                                       │                 │ acct2: 1500
  11   │ SELECT balance FROM accounts          │                 │
  12   │   WHERE id = 2 → 1000                 │                 │
  13   │                                       │                 │
  14   │ "Total held by accounts 1 and 2:      │                 │
  15   │  500 + 1000 = 1500"                   │                 │
  16   │ COMMIT — the reconciliation report    │                 │
  17   │ records 1500. The true total is 2000. │                 │
  ─────┼───────────────────────────────────────┼─────────────────┼────────────
```

T1 read account 1 before T2 committed and account 2 after. Both individual reads are
correct and stable. **The combination never existed** — at no instant was the world
`acct1=500, acct2=1000`. The snapshot is not a *consistent* snapshot; it is a snapshot
taken while a commit was in flight, and whether you catch the before or after side of that
commit is a function of statement timing.

This is the strongest argument for `SERIALIZABLE` over `REPEATABLE READ` for anything that
aggregates across rows, and it is also why the phrase "repeatable read" is misleading. What
`REPEATABLE READ` guarantees is that a *row*, once read, does not change. It does not
guarantee that two rows read at different times are *consistent with each other*.

> **PRODUCTION RELEVANCE**
>
> Nightly reconciliation jobs are the canonical victim. A report that says "these two
> account balances do not sum to the ledger total" is almost never a bug in the arithmetic;
> it is a transaction that read across a concurrent commit. The report is wrong, it has
> been wrong for years, and it is wrong *silently* — there is no error, just a number
> nobody can account for. This is also the failure that makes "we'll re-run the report"
> appear to fix it, since the second run has a different interleaving. Volume 7, Chapter 9
> covers the vacuum-side consequences of the long-running transactions these reports create.

#### Common Mistakes

- Answering "lost updates are fixed by `REPEATABLE READ`" — no standard level fixes them,
  because permitting the anomaly is part of what Read Committed *means*
- Believing `UPDATE ... SET x = x + 1` is atomic because it is one statement, rather than
  because the engine re-evaluates the expression under the row lock it has just taken
- Drawing the write-skew timeline with both transactions reading *different* rows — the
  whole mechanism requires them to read the *same* state and write *different* rows
- Saying `REPEATABLE READ` prevents write skew, because "the reads are repeatable" — the
  anomaly is about the relationship between two transactions, and per-transaction
  guarantees do not reach across
- Treating phantom as "non-repeatable read but for sets" without noticing that the fix is
  structurally different — a set cannot be pinned row-by-row, so it needs range-level or
  predicate-level locking
- Assuming InnoDB's `REPEATABLE READ` and PostgreSQL's `REPEATABLE READ` are the same
  guarantee with different names, when one uses snapshot reads *plus* next-key locks and
  the other uses a snapshot alone
- Forgetting read skew entirely, and therefore believing that a stable snapshot means a
  self-consistent answer

#### Interview Questions — Concurrency Anomalies

**Q1. Draw the interleaving that produces a lost update, and say what fixes it.** `SCENARIO`

T1 and T2 both `SELECT balance` and both read 1000. T1 computes 1000 − 100 and writes 900.
T2, computing against its own stale read, also writes 900. Both commit; the account has
been debited once. The defect is that the read and the write were separated by a round trip,
so the value written was derived from a state that no longer existed. No constraint is
violated, no error is raised, and the final state is a number no transaction intended. The
fixes are structural and none of them is an isolation level: make the write atomic so the
engine evaluates `balance = balance - 100` under the row lock it takes
(`UPDATE ... SET balance = balance - 100`); add a version column and compare-and-swap so
the second transaction's write affects zero rows and it knows to retry; or take the read
under a lock with `SELECT ... FOR UPDATE` so the read and the write cannot separate. The
explicit point to make is that no level in the standard fixes it, because at Read Committed
and above this interleaving is the *definition* of the level's behaviour.

**Q2. Your counter is incremented with `UPDATE counters SET n = n + 1`. Is that safe, and
why?** `TRICKY`

Safe, but not for the reason most people give. It is not safe because it is a single
statement — a single statement that computed a constant in the application would be just as
unsafe. It is safe because when the `UPDATE` reads a column of the row it is writing, the
engine locates the row, takes a write lock on it, waits for any conflicting holder, and
*then* evaluates `n + 1` against the version it just locked — not the version that existed
when the statement was sent. The second transaction therefore blocks, and on waking
re-reads the committed value, producing the correct running total. This re-evaluation under
the lock is the entire mechanism. The safety evaporates the moment the value is computed
anywhere else — in application code, in a cache, in a detached ORM entity, in a different
service — and it is worth naming the corollary that this re-evaluation happens in a row
order, so multi-row updates touching overlapping sets of rows in different orders can still
deadlock.

**Q3. Two doctors both cancel their shift. Both succeed. Nobody is on call. Walk me through
it and tell me which isolation levels prevent it.** `SCENARIO`

Both transactions `SELECT count(*)` for that day and shift, both read 1, both observe that
the shift is already short of the required two and reason that their own cancellation
cannot be the one that empties it, and each deletes a *different* doctor row. There is no
write-write conflict, because they touch different rows, and no read-write conflict that any
level below `SERIALIZABLE` will abort. `READ COMMITTED` permits it because each statement
takes a fresh snapshot. `REPEATABLE READ` permits it, and in fact makes it *more*
deterministic: both transactions are pinned to the same snapshot, both see one doctor, and
both decide independently that they are safe. The invariant "at least two doctors per
shift" is an aggregate over a set, so no single-row constraint ever fired. Nothing below
`SERIALIZABLE` prevents it. The options are: restructure so the invariant is a single row —
a `shift_coverage` counter with `CHECK (doctor_count >= 2)` — which makes both transactions
contend and one of them fail correctly; serialise explicitly with
`SELECT ... FOR UPDATE` on a shared anchor row before the read; or use `SERIALIZABLE` and
handle the resulting abort by retrying. The design-review answer is the first, because it
removes the class of bug rather than paying for it.

**Q4. What is the difference between a non-repeatable read and a phantom read, and why does
the difference matter for the fix?** `ADVANCED`

A non-repeatable read is the same *row* yielding a different value, because another
transaction updated it in between; a phantom is the same *query* yielding a different *set*
of rows, because another transaction inserted or deleted matching rows. The difference
matters because the fixes are structurally different. A value change is fixable by pinning
the row — remembering or locking the versions you read, which is what a snapshot does. A
set change has no row to pin, because the offending row did not exist when the transaction
looked. Preventing phantoms therefore requires pinning the *range* the rows could come
from, which is a predicate lock or a gap lock, and that is materially heavier: the range
may be large, unbounded, or not covered by an index at all. This is exactly where the two
major engines diverge — InnoDB's `REPEATABLE READ` takes next-key locks on `UPDATE` and
`DELETE` and so prevents *those* phantoms, while its plain `SELECT`s take no gap locks and
so do not prevent phantom inserts; PostgreSQL's `REPEATABLE READ` is a pure snapshot and
prevents no phantoms at all, though it also never blocks an inserter.

**Q5. Your monthly reconciliation report has never matched the ledger, and re-running it
sometimes gives a different number. What is happening?** `ADVANCED`

Read skew. The report is a single transaction that reads several accounts, and one of the
concurrent transactions committed a change to one of them partway through the report's
execution. The report read account A before that commit and account B after it, so it
computed a total from a combination of values that never coexisted at any instant. Both
individual reads were correct and stable — the snapshot was perfectly valid for each row as
read — but the aggregate is nonsense. This is why the number changes between runs: the
interleaving is not reproducible, and each execution catches a different side of whatever
commit was in flight. The fix is to give the report a `SERIALIZABLE` transaction (which
will abort and must be retried when the outcome is genuinely concurrent) or to run it
against a snapshot that no writer can interleave with — a physical replica, or a
single-statement version of the query so the whole aggregate is evaluated against one
snapshot. It is worth volunteering that this failure is silent: no error, no constraint
violation, just a wrong number that has been wrong for years.

> **CHAPTER 2 SUMMARY**
>
> Every anomaly in this chapter is one of two shapes: a read-modify-write that got split,
> which is a lost update and which no standard isolation level fixes; or a decision made
> from state another transaction is concurrently invalidating, which is write skew and
> which requires either a schema change that makes the invariant single-row, an explicit
> lock, or `SERIALIZABLE` with a retry. Dirty read, non-repeatable read and phantom read
> are the per-transaction versions of the same idea and are what the isolation levels below
> `SERIALIZABLE` are actually specified to prevent. `UPDATE ... SET x = x + 1` is safe
> only because the engine re-evaluates the expression under the row lock, never because it
> is one statement — and that safety disappears the instant the value is computed anywhere
> else. The transferable skill is drawing the interleaving: if you cannot draw the timeline
> that produces the bug, you do not yet know the mechanism well enough to fix it or to
> argue about which level prevents it.

#### Further Reading

- [Wikipedia — Write skew](https://en.wikipedia.org/wiki/Write_skew) — the shortest correct treatment of the anomaly, including the classic physician-on-call example.
- [PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — the anomalies defined against each level, plus why `READ UNCOMMITTED` is silently mapped to `READ COMMITTED`.
- [J. Gray & A. Reuter — Transaction Processing](https://www.cs.utexas.edu/~djimenez/utsa/cs3343/Gray%20Book%20on%20Transaction%20Processing.pdf) — the free reference for the interleaving formalism, and the chapter to read before drawing another timeline.
- [CMU 15-445 — Concurrency Control](https://www.cs.cmu.edu/~15451-f22/lectures/07-oltp.pdf) — how the anomaly definitions map onto real lock and timestamp protocols, taught the way an exam expects it.

## Chapter 3 — Isolation Levels

### 3.1 The Spectrum, and Why It Is Not a Ladder

The standard presents four levels and calls them increasingly strict. That framing is
convenient and slightly wrong, and the wrongness is the most valuable thing in this
chapter: **the levels are not a total order.** They are four *bundles* of guarantees, and
the guarantees do not nest cleanly, because each level is a different trade of one anomaly
against another mechanism rather than a smaller version of the level above it.

```text
  WHAT EACH LEVEL ACTUALLY DOES, MECHANICALLY
  ─────────────────────────────────────────────────────────────────────
  READ UNCOMMITTED  reads whatever is on the page, including another
                    transaction's uncommitted version. No visibility
                    filter at all. Effectively "the last writer's bytes".

  READ COMMITTED    per-statement snapshot. A new snapshot at the start
                    of each statement; sees everything committed before
                    that moment, nothing after. Non-snapshot reads
                    (FOR UPDATE) still take locks.

  REPEATABLE READ   one snapshot for the whole transaction, established
                    at the first statement and held to commit. Nothing
                    anyone commits afterwards is visible. Some engines
                    ALSO take range locks on writes.

  SERIALIZABLE      the set of transactions' effect is indistinguishable
                    from running them one at a time in some order. Two
                    implementations: strict (take real locks, so nothing
                    interesting can interleave) or optimistic (run freely
                    and abort if a dangerous interleaving turns out to
                    have happened).
  ─────────────────────────────────────────────────────────────────────
  The non-nesting: snapshot isolation is strictly stronger than Read
  Committed on repeatability, but it is NOT strictly stronger on
  aggregate consistency — read skew needs SERIALIZABLE. And the level
  called REPEATABLE READ in PostgreSQL and the level called REPEATABLE
  READ in MySQL are different mechanisms with different anomalies.
```

The single most important structural point: **`READ COMMITTED` takes a new snapshot per
statement, and `REPEATABLE READ` takes one per transaction.** Every behavioural difference
between them follows from that sentence and nothing else.

### 3.2 The Anomaly Matrix

The table to memorise — and to reproduce if asked, because a candidate who draws it from
memory and gets the footnote right is demonstrating that they understand the mechanics
rather than the slogans.

| Level | Dirty read | Non-repeatable read | Phantom read | Write skew | Mechanism |
| --- | --- | --- | --- | --- | --- |
| `READ UNCOMMITTED` | possible | possible | possible | possible | no visibility filter |
| `READ COMMITTED` | prevented | possible | possible | possible | snapshot per statement |
| `REPEATABLE READ` (snapshot) | prevented | prevented | possible | **possible** | snapshot per transaction |
| `REPEATABLE READ` (InnoDB) | prevented | prevented | prevented for `UPDATE`/`DELETE`; **not** for `SELECT` | **possible** | snapshot + next-key locks on writes |
| `SERIALIZABLE` (strict) | prevented | prevented | prevented | prevented | locks on everything |
| `SERIALIZABLE` (SSI) | prevented | prevented | prevented | prevented *by aborting one* | optimistic, commit-time check |

Two footnotes matter more than the table:

- **Write skew is possible at every level below `SERIALIZABLE`, in every engine, without
  exception.** This is not an implementation gap. It is a consequence of the definition:
  the levels below `SERIALIZABLE` constrain what each transaction may *see*, and write
  skew is a violation that is invisible in any individual transaction's view.
- **The two `SERIALIZABLE` rows are the same *guarantee* and completely different
  *mechanisms*, and the difference is operational rather than theoretical.** Strict
  serializability makes dangerous interleavings impossible by preventing them. Snapshot
  serializability allows them and makes them fail at commit. One costs contention; the
  other costs retries. Chapter 7 of the PostgreSQL volume and Chapter 5 of the MySQL volume
  cover the concrete implementations; this chapter is about the shape.

### 3.3 PostgreSQL: Four Levels, Two Really Used

PostgreSQL implements all four, but the defaults make two of them nearly unused and one of
them a trap.

```sql
-- PostgreSQL: the level matrix as the engine actually implements it
SHOW default_transaction_isolation;
-- read committed

BEGIN TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;   -- accepted, == READ COMMITTED
BEGIN TRANSACTION ISOLATION LEVEL READ COMMITTED;     -- DEFAULT
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ;    -- == SNAPSHOT
BEGIN TRANSACTION ISOLATION LEVEL SERIALIZABLE;       -- SSI
```

Three facts a candidate who has actually used PostgreSQL will know and a candidate who has
only read about it will not:

1. **`READ UNCOMMITTED` does not exist.** PostgreSQL silently treats it as `READ
   COMMITTED`. The docs say so explicitly. This is not a bug — MVCC makes dirty reads
   structurally unavailable, and rather than fail the statement it upgrades the guarantee.
2. **`REPEATABLE READ` *is* snapshot isolation.** There is no separate `SNAPSHOT` level in
   PostgreSQL; the name `REPEATABLE READ` is the SQL-standard name for what the industry
   calls snapshot isolation. So asking "is snapshot isolation stronger than repeatable read"
   is a naming confusion, not a technical question, in this engine.
3. **PostgreSQL's default of `READ COMMITTED` is genuinely a good default**, and the
   reason it is defensible rather than merely convenient is that at `READ COMMITTED` a
   serialization failure is *impossible* — no transaction can ever be aborted for a
   concurrency reason. `SERIALIZABLE` in PostgreSQL can abort a transaction that has been
   running for an hour, having done all the work, at the moment of `COMMIT`.

**What `READ COMMITTED` costs when you stay there.** The per-statement snapshot means two
reads in the same transaction can disagree, and it means a `SELECT ... FOR UPDATE` will
block and then return the *new* version of the row — because after the lock is granted, the
statement re-evaluates against a fresh snapshot. That re-evaluation is a documented and
slightly counter-intuitive behaviour:

```sql
-- PostgreSQL, READ COMMITTED. The FOR UPDATE re-reads after the wait.
BEGIN;
  SELECT * FROM accounts WHERE id = 1 FOR UPDATE;   -- sees balance = 1000
  -- meanwhile T2 commits: UPDATE accounts SET balance = 900 WHERE id = 1;
  -- this transaction is released from the wait
  SELECT * FROM accounts WHERE id = 1;             -- sees balance = 900
COMMIT;
-- The two reads disagree inside one transaction. That is READ COMMITTED.
```

**What `REPEATABLE READ` costs when you move there.** One snapshot for the transaction, so
reads are stable — and now a write against a row that another transaction has concurrently
modified does not wait-and-overwrite, it raises:

```sql
ERROR:  could not serialize access due to concurrent update
SQLSTATE: 40001
```

That error is the honest, correct outcome. It is not a defect to be suppressed; it is the
engine telling you that your transaction's assumption — that nobody touched what I am
touching — was wrong. The application must catch `40001` and retry. PostgreSQL's default is
`READ COMMITTED` partly because this error does not exist there, and a codebase with no
retry logic cannot be safely moved to `REPEATABLE READ` overnight.

**What `SERIALIZABLE` costs in PostgreSQL.** The `40001` error becomes possible in far more
cases, including cases where nothing was concurrently *modified* — read-only transactions
can be aborted. The mechanism is Serializable Snapshot Isolation (SSI), and its defining
property is the one that surprises everyone:

> **INTERVIEW TRAP — "IS `SERIALIZABLE` ACTUALLY STRICTLY SERIALIZABLE?"**
>
> No — and this is the single most important correction in the volume. **PostgreSQL's
> `SERIALIZABLE` is implemented with Serializable Snapshot Isolation, which does not prevent
> dangerous interleavings from happening; it lets them happen and aborts one of the
> transactions at `COMMIT` time if a dangerous pattern turns out to have occurred.** The
> transactions are not serialised as they run. They run concurrently, and then the engine
> checks, at commit, whether the set of read/write dependencies contains a cycle that would
> admit a non-serial outcome. If it does, one transaction is killed with
> `could not serialize access due to read/write dependencies among transactions`
> (`SQLSTATE 40001`).
>
> Two consequences follow, and both are the mark of a staff answer. First, **a
> serialization failure at `COMMIT` is a correct outcome, not a bug** — the transaction did
> real work, all of it was valid, and the engine is declining to certify a result that could
> not have happened serially. The application *must* retry, and a codebase that treats
> `40001` as a fatal error is not correct at `SERIALIZABLE`. Second, **abort-at-commit means
> the cost of a serialization failure is paid after you have already done the work** — which
> is why SSI needs a retry loop with bounded attempts and a fallback, and why long
> transactions under `SERIALIZABLE` are disproportionately expensive.
>
> The contrast to volunteer: **MySQL/InnoDB's `SERIALIZABLE` is strict, and it works by
> taking table-level locks** — reads take shared locks, writes take exclusive locks, and
> concurrent access to the table largely stops. It genuinely prevents the bad interleaving
> rather than detecting it afterwards, at the cost of a throughput collapse on a contended
> table. Two engines, one level name, opposite mechanisms and opposite cost profiles.

### 3.4 MySQL/InnoDB: Repeatable Read by Default, With a Surprise

InnoDB defaults to `REPEATABLE READ`, which is a real choice and a historically accidental
one — the default dates from a period when gap locks were the only mechanism available and
`SERIALIZABLE` was cheaper than it is now. The current recommendation from the engine's own
authors is that `READ COMMITTED` is usually the better default for most OLTP workloads,
because InnoDB's `REPEATABLE READ` takes next-key locks on writes that create far more
deadlocks and far more contention than the guarantees are worth. Many teams have moved and
not gone back.

```sql
-- MySQL/InnoDB: what the levels are in this engine
SET SESSION TRANSACTION ISOLATION LEVEL READ UNCOMMITTED;  -- real, and dirty
SET SESSION TRANSACTION ISOLATION LEVEL READ COMMITTED;    -- recommended for most
SET SESSION TRANSACTION ISOLATION LEVEL REPEATABLE READ;   -- InnoDB DEFAULT
SET SESSION TRANSACTION ISOLATION LEVEL SERIALIZABLE;      -- table locks
```

**The mechanism, and the part that surprises people.** InnoDB's `REPEATABLE READ` is a
hybrid: consistent non-locking reads come from the undo log (that is its MVCC, and it
behaves like snapshot isolation), while locking reads — and critically, *writes* — take
next-key locks against the index. A next-key lock covers the record **and the gap before
it**, so an `UPDATE` on a non-existent row in a range locks the gap and blocks any
`INSERT` into that range. That is how InnoDB prevents phantom reads from `UPDATE` and
`DELETE`.

```text
  INNODB AT REPEATABLE READ — TWO READ PATHS IN ONE TRANSACTION
  ─────────────────────────────────────────────────────────────────────
  index on (day, shift) containing keys:  ('2026-04-01','morning')=row1
                                           ('2026-04-02','morning')=row9

  gap                  row1                  gap
  ───                  ─────                 ───
  '2026-04-01 morning'  existing key         '2026-04-02 morning'
  ... anything inserted here BLOCKS ...

  T1: UPDATE doctors_on_call SET ... WHERE day='2026-04-01' AND shift='morning'
      → takes a next-key lock on the record AND the gap before it
      → any concurrent INSERT of a row in that gap now WAITS

  T1: SELECT count(*) FROM doctors_on_call WHERE day='2026-04-01'
      → consistent, non-locking read, served from undo
      → takes NO gap lock. A concurrent INSERT succeeds and is invisible to T1.
  ─────────────────────────────────────────────────────────────────────
  So: UPDATE/DELETE phantoms → prevented.   SELECT phantoms → NOT prevented.
  And: a plain read BLOCKS NOTHING but is BLOCKED BY, which is a real source
  of production incidents and is covered in Chapter 5.
```

That asymmetry — reads take no locks, writes take gap locks — produces a failure mode that
is genuinely confusing the first time you meet it, and it is worth being able to draw:

```text
  THE READ-BLOCKS-WRITER INVERSION, AT INNODB REPEATABLE READ
  ────────────────────────────────────────────────────────────────
   1 │ T1: BEGIN
   2 │ T1: SELECT count(*) FROM inventory WHERE sku BETWEEN 1 AND 100
   3 │    (consistent read — no lock taken)
   4 │ T1: (long-running work — 40 seconds)
   5 │
   6 │ T2: INSERT INTO inventory (sku=50, qty=1)
   7 │    (needs a next-key lock on the gap where 50 belongs)
   8 │    → BLOCKS, waiting for T1
   9 │
  10 │ T1: still working
  ... │    (T2's INSERT is held for the whole of T1's transaction)
  50 │ T1: COMMIT
  51 │    → T2 acquires the lock, proceeds

  The intuition is inverted from what most people expect. A read "caused"
  a write to block, even though the read took no lock. The read did not
  block the write; the write took a lock on a range, and the write then
  discovered it needed to wait for a transaction whose snapshot predates
  it. Under REPEATABLE READ, a transaction that has read a range is
  effectively saying "I am going to see this range as it was", and an
  insert into that range is incompatible with that promise.
  ────────────────────────────────────────────────────────────────
  At READ COMMITTED, InnoDB drops most gap locking (only foreign-key and
  duplicate-key checks retain it), so this specific inversion mostly
  disappears — which is one of the strongest practical arguments for
  changing the default.
```

**`SERIALIZABLE` in InnoDB is the blunt instrument.** It takes a shared lock on every table
the transaction reads and an exclusive lock on every table it writes, converting essentially
all reads to locking reads. It is a genuine strict serializability, it does prevent write
skew, and it will serialise a contended table into a queue. It is the right answer for a
reporting job that runs once a night against a table nobody else is writing, and it is
catastrophic as a default for an OLTP table with twelve application instances.

### 3.5 Choosing a Level: The Decision, Not the Default

The honest framing in a design review is not "which level" but "**which anomalies does this
particular transaction's correctness argument depend on, and what is the cheapest mechanism
that denies them?**" Worked through, most transactions need less than their current level
and one or two need more.

| What the transaction does | Level to start from | Why |
| --- | --- | --- |
| Idempotent read of a single row for display | `READ COMMITTED` | no cross-statement invariant, so no need for stability |
| Read several rows and *sum* them into a report | `SERIALIZABLE` (with retry) | read skew; stability of individual rows is not enough |
| Read a set, decide, then write to that same set | `SERIALIZABLE`, or restructure | write skew; invisible below `SERIALIZABLE` |
| Increment a counter with `SET n = n + 1` | `READ COMMITTED` | the write is atomic; the read is irrelevant |
| Read-modify-write of one row | `READ COMMITTED` + `SELECT ... FOR UPDATE`, or a version column | Chapter 6 |
| Queue consumer claiming a job | `READ COMMITTED` + `FOR UPDATE SKIP LOCKED` | needs to *not* block, which is the opposite requirement |
| Cross-row invariant ("≥ 2 per shift") | a single-row `CHECK`, if at all possible | isolation level is the fallback, not the first move |

> **TRADE-OFF — "WHY ISN'T THE DEFAULT LEVEL `SERIALIZABLE`?"**
>
> The condition that flips the answer is **whether the workload is contended.** Under
> `SERIALIZABLE` you are buying a guarantee whose cost is paid by *whichever transaction
> loses the race*, and the price is either a lock wait (strict) or a full rollback after all
> the work is done (SSI). On a table with one writer and thousands of readers, `SERIALIZABLE`
> costs almost nothing and buys everything. On a table with fifty writers on the same rows,
> `SERIALIZABLE` converts correctness into a throughput collapse with a retry loop
> generating additional load on the exact rows that are already the bottleneck. The
> engineering answer is not to pick a level globally; it is to (1) find the one or two
> transactions that genuinely need a strong guarantee, (2) give *those* the strong level,
> and (3) restructure the write skew cases so they need one at all. A database-wide
> `SERIALIZABLE` is almost always a sign that somebody has not worked out which transaction
> needed it — it converts a design problem into a latency problem, and latency problems get
> solved by downgrading the setting again.

> **SCALING REALITY CHECK**
>
> SSI aborts scale with the number of *concurrent read-write dependency edges*, not with
> transaction count alone. The practical shape: on a hot row or a small set of hot rows,
> every transaction is a candidate to abort every other one, and the abort rate climbs
> toward the transaction arrival rate. Any workload where the same handful of rows are
> touched by most in-flight transactions will not survive `SERIALIZABLE` with retries
> enabled — the retries add load to the contention that caused them, which makes the
> abort rate worse, which produces more retries. The design response is to remove the
> contention structurally (shard the hot rows, or serialise them deliberately with a
> single-writer design), not to keep the retry loop and hope.

> **PRODUCTION RELEVANCE**
>
> `SQLSTATE 40001` is a *correct* error and treating it as a failure is a design mistake
> that hides real bugs. The distinction that matters operationally is between two
> serialization errors: one on a transaction that has done a few milliseconds of work, which
> is a normal, expected, cheap-to-retry event, and one on a transaction that has held a
> connection for forty minutes, which is an architectural problem that the retry is hiding.
> Teams that set a global retry policy on `40001` without an attempt cap and without an
> alert on the retry rate will convert a correctness bug into a connection-pool exhaustion
> incident, because every retried transaction holds its connection for the entire
> backoff.

#### Common Mistakes

- Assuming the four levels form a strict ordering, and that anything `REPEATABLE READ`
  prevents is necessarily also prevented by `SERIALIZABLE` in a cheaper way
- Saying PostgreSQL's `REPEATABLE READ` is weaker than its `SERIALIZABLE` and therefore
  "the same as MySQL's" — in PostgreSQL `REPEATABLE READ` *is* snapshot isolation, and
  there is no separate `SNAPSHOT` level name
- Believing `SERIALIZABLE` prevents bad interleavings by construction, in every engine —
  PostgreSQL's SSI explicitly permits them and aborts at commit instead
- Treating a `40001` serialization failure as a bug to be logged and swallowed, rather than
  a correct outcome that requires a bounded retry
- Recommending `SERIALIZABLE` as a fix for a design problem without naming what the
  contention cost will be, and which transaction pays it
- Believing `READ UNCOMMITTED` is a PostgreSQL performance option — PostgreSQL maps it to
  `READ COMMITTED`, so setting it does nothing except misdescribe what you have
- Not knowing that InnoDB's `REPEATABLE READ` is a hybrid of snapshot reads and gap-locking
  writes, and that this is why a read can end up blocking an insert

#### Interview Questions — Isolation Levels

**Q1. Walk through the levels and say what each one actually prevents.** `STAFF`

Read Uncommitted has no visibility filter, so a read can return another transaction's
uncommitted, later-rolled-back data — the only level where a dirty read is possible, and the
only one with a legitimate use, which is debugging what another session is currently
writing. Read Committed takes a new snapshot per statement, so it prevents dirty reads and
nothing else: the same row read twice in one transaction can return two different values
because each statement sees a later state. Repeatable Read takes one snapshot per
transaction, so each row read is stable for the transaction's duration — which eliminates
non-repeatable read, and eliminates phantoms only if the engine also takes range locks on
writes, which is an engine-specific addition rather than part of the level. Serializable
adds the guarantee that the set of transactions is indistinguishable from some serial
order, which is the only thing that eliminates write skew. The trap in this answer is
claiming the levels nest, because they do not: snapshot isolation is stronger on
repeatability but still permits read skew across an aggregate.

**Q2. Is `SERIALIZABLE` strictly serializable? What happens if a serialization error
happens?** `ADVANCED`

In PostgreSQL, no — and this is worth being precise about because it is the implementation
most candidates have actually used. `SERIALIZABLE` there is Serializable Snapshot
Isolation: transactions run concurrently, are not serialised as they execute, and are
checked at `COMMIT` for a read/write dependency cycle that would admit a non-serial
outcome. If such a cycle exists, one transaction is aborted with `SQLSTATE 40001`. In
MySQL/InnoDB, yes, but by a different mechanism — it converts reads to locking reads and
takes table-level locks, so the bad interleaving genuinely cannot occur, at the cost of
serialising access. So the guarantee is the same and the mechanism is opposite. The
practical consequence of the abort-at-commit model is that **a serialization failure is a
correct outcome rather than a defect**: the transaction did real work, all of it locally
valid, and the engine is declining to certify a result that could not have arisen serially.
The application must implement a bounded retry with backoff. The consequence that hurts
operationally is that the cost is paid *after* the work is done, so `SERIALIZABLE` with
long-running transactions is disproportionately expensive and can abort read-only
transactions that touched nothing anyone else was writing.

**Q3. You move a service from `READ COMMITTED` to `REPEATABLE READ` on PostgreSQL. What
breaks, and why?** `TRICKY`

The immediate break is a new error that cannot occur at `READ COMMITTED`:
`could not serialize access due to concurrent update` (`40001`), raised when the
transaction tries to update a row another transaction has modified since the transaction's
snapshot was taken. At `READ COMMITTED` that same situation silently succeeds — the update
waits and then overwrites — which is precisely the behaviour `REPEATABLE READ` refuses. The
second break is quieter: code that relied on a `SELECT ... FOR UPDATE` re-reading the row
after it was released from the wait no longer does so, so a read-then-decide pattern may now
act on a decision made from data that is provably stale, and the code has no way to tell.
The migration therefore requires a retry path for `40001` *before* the level changes, not
after; a codebase with no retry logic turns a benign update-overwrite into a user-visible
error. The third consideration is that `REPEATABLE READ` on PostgreSQL is snapshot
isolation, so it does not give phantom protection — if the reason for moving up was a
report that reads a set, this level will not fix it and `SERIALIZABLE` will.

**Q4. Your write skew is real and the constraint is genuinely an aggregate over a set. Do
you go to `SERIALIZABLE`, and what does that cost?** `STAFF`

Before `SERIALIZABLE`, exhaust the restructure, because `SERIALIZABLE` is the fallback
rather than the first move. The highest-value fix is to make the invariant single-row: a
`shift_coverage` row per (day, shift) with `CHECK (doctor_count >= 2)`, updated inside the
same transaction as the doctor row. Then both concurrent transactions contend on one row,
the second one's `CHECK` fails, and the database is enforcing the rule with no retry loop
and no abort cost. The second option is a deliberate lock — `SELECT ... FOR UPDATE` on a
shared anchor row *before* the read — which serialises the two transactions and is
completely predictable, at the cost of making that anchor a contention point by design. The
third is a partial unique index if the invariant can be expressed as "at most one of these"
rather than "at least two of those". Only if none of those is possible should the
transaction run at `SERIALIZABLE` with a bounded retry. The cost to name honestly: the
abort rate rises with the number of concurrent read-write dependency edges between the
contending transactions, each abort discards work already done, and the retry adds load to
the contention that caused it — so on a genuinely contended hot row, `SERIALIZABLE` with
retries is unstable rather than merely slow.

**Q5. Explain the gap between what `REPEATABLE READ` promises and what InnoDB
delivers.** `ADVANCED`

InnoDB's `REPEATABLE READ` is a hybrid of two mechanisms, and the promise it makes is
narrower than its name suggests. Non-locking `SELECT`s are served from the undo log, giving
true snapshot semantics — the same row never changes within the transaction. But `UPDATE`
and `DELETE` take next-key locks against the index, covering both the record and the gap
before it, which means a write to a range prevents concurrent inserts into that range. That
gives phantom protection for `UPDATE` and `DELETE`, and *not* for plain `SELECT`s, which
take no gap locks at all — so a phantom insert succeeds and is simply invisible to the
reader. The inversion this creates is the part that generates incidents: a transaction that
has read a range blocks an insert into that range, even though the read took no lock,
because the inserter's next-key lock cannot be granted while a transaction with an older
snapshot exists. This is the single strongest practical argument for moving InnoDB to
`READ COMMITTED`, which drops most gap locking and keeps only the checks needed for
foreign keys and duplicate keys.

> **CHAPTER 3 SUMMARY**
>
> The levels are four bundles of guarantees, not a ladder, and the guarantees do not nest:
> snapshot isolation is stronger on repeatability than Read Committed but still permits
> read skew, and write skew is permitted at every level below `SERIALIZABLE` by definition,
> because those levels constrain what each transaction sees and write skew is a violation
> only visible across a set of transactions. `READ COMMITTED` and `REPEATABLE READ` differ
> by exactly one thing — a new snapshot per statement versus one per transaction — and
> every behavioural difference follows from it. The two `SERIALIZABLE` implementations
> deserve opposite answers: PostgreSQL's SSI lets the dangerous interleaving happen and
> aborts a transaction at `COMMIT`, making a `40001` a *correct* outcome that must be
> retried; InnoDB's takes table locks and genuinely prevents it, at the cost of collapsing
> a contended table. The right level for a transaction is the cheapest one that denies the
> anomalies its own correctness argument depends on, and the first question in that
> decision is almost always whether the invariant can be made single-row instead.

#### Further Reading

- [PostgreSQL — Serializable Isolation Level](https://www.postgresql.org/docs/current/transaction-iso.html#XACT-SERIALIZABLE) — the official statement that `SERIALIZABLE` is SSI, that it can abort read-only transactions, and that `40001` is expected.
- [MySQL — InnoDB Transaction Isolation Levels](https://dev.mysql.com/doc/refman/8.0/en/innodb-transaction-isolation-levels.html) — the per-level behaviour including the gap locking that makes InnoDB's `REPEATABLE READ` a hybrid.
- [Jepsen — Concurrency Control Tests](https://jepsen.io/guides/serializability/) — how the anomalies are turned into executable tests, which is the skill this chapter is really teaching.
- [PostgreWiki — SSI](https://wiki.postgresql.org/wiki/SSI) — the dependency graph and the read-only anomaly, written by the implementers.

## Chapter 4 — MVCC

### 4.1 The One-Sentence Version

**Multi-Version Concurrency Control keeps old copies of rows so readers never have to wait
for writers, and writers never have to wait for readers — and pays for it in storage and
in the garbage those copies become.**

Everything else in this chapter is the consequences of that sentence. The readers-and-
writers non-blocking property is the whole reason MVCC exists and the whole reason the
isolation levels above it are cheap. The storage and garbage costs are the whole reason MVCC
is not free, and they are the reason a long-running transaction is a production incident
rather than merely a slow query.

### 4.2 Version Chains: What Actually Happens on an UPDATE

This is the part candidates half-know, and the half they miss is the mechanism by which a
reader finds the right version. The missing half is a *pointer on the row itself*.

```sql
CREATE TABLE products (
  id    INT PRIMARY KEY,
  name  TEXT NOT NULL,
  price INT NOT NULL
);
-- starting state: id=1, price=100
```

**When T1 updates row 1, MVCC does three things, in this order:**

1. **It copies.** A new physical row version is written somewhere on the heap (in
   PostgreSQL, a new heap tuple; in InnoDB, a new record in the clustered index). The new
   version has `price = 90`.
2. **It marks the old one.** The old version is marked as *superseded* by a transaction
   id, so a reader whose snapshot predates the update knows the old version is no longer
   the current one but is still a legitimate thing to see.
3. **It chains them.** The new version records, via a back-pointer, which transaction
   created the previous version it replaced. This is what makes a *chain* rather than a
   pile.

```text
  THE HEAP AFTER T1 UPDATES price 100 → 90  (T1 NOT YET COMMITTED)
  ────────────────────────────────────────────────────────────────────
  ┌────────────────────────────────────────────────────────────────┐
  │ v3  price=90   xmin=T2(committed)  xmax=0        ← CURRENT      │
  │     ▲                                                            │
  │     └── prev = v2                                                 │
  │ ┌──────────────────────────────────────────────────────────────┐  │
  │ │ v2  price=100  xmin=T1(in progress)  xmax=T2  ← SUPERSEDED   │  │
  │ │     ▲                                by T2, but T1 has not    │  │
  │ │     │                                committed, so if T1 rolls │  │
  │ │     │                                back, v2 is CURRENT again │  │
  │ │     └── prev = v1                                            │  │
  │ │ ┌────────────────────────────────────────────────────────┐   │  │
  │ │ │ v1  price=100  xmin=T0  xmax=T1  ← committed, now old  │   │  │
  │ │ └────────────────────────────────────────────────────────┘   │  │
  │ └──────────────────────────────────────────────────────────────┘  │
  └────────────────────────────────────────────────────────────────┘
  Three physical rows exist for one logical row. A table with heavy update
  traffic accumulates these until something reclaims them.
```

The most instructive part of that diagram is what happens **if T1 rolls back**. Nothing has
to be undone. v3 is discarded, and v2 — which is still physically present, still linked in
the chain, and was never destroyed — becomes current again. Rollback in an MVCC engine is
"stop treating the new version as real", not "reconstruct the old one". This is why MVCC
makes rollback nearly free and why the engine can afford to be generous with copies.

> **MUST REMEMBER**
>
> An `UPDATE` in an MVCC engine is `INSERT a new version + mark the old one + chain them`.
> That is why rollback is cheap, why reads do not block, and why the table grows. All three
> are the same fact seen from three angles.

### 4.3 How a Reader Finds the Right Version

The reader's algorithm is the piece to be able to state precisely, because "it uses a
snapshot" is too vague to reason with and "it looks at `xmin` and `xmax`" is the answer
that demonstrates you have read the source.

```text
  GIVEN: a reader whose snapshot was taken at moment S,
         and a chain of row versions, and a list of transactions
         that committed before S (the "snapshot" proper)

  walk the chain newest-first:

    for each version v, newest to oldest:
        was v's creating transaction (xmin) committed BEFORE S?
            ├─ no, and still in progress  → SKIP. It did not exist at S.
            │                                 (this is how you cannot
            │                                  read uncommitted data)
            ├─ no, and it ABORTED         → SKIP
            └─ yes  → was v deleted or overwritten (xmax) by a
                      transaction committed before S?
                            ├─ yes  → SKIP. It was gone at S.
                            └─ no, or xmax is 0, or xmax is still
                               in progress → THIS IS THE VERSION
                               THE READER SEES. Stop.

  If no version qualifies, the row did not exist at S.
  ────────────────────────────────────────────────────────────────────
  Notice what is NOT in this algorithm: taking a lock. Not on the row,
  not on the page, not on the table. The reader reads bytes that a
  writer may be in the middle of changing, and decides whether those
  bytes are relevant to it by looking at two transaction ids.
```

Two consequences fall directly out of the algorithm, and both are worth stating unprompted
in an interview:

- **The reader's decision is based on *when the reader's snapshot was taken*, not on when
  the row was written.** That is the entire mechanism by which `REPEATABLE READ` is stable:
  the snapshot is fixed, so the comparison against every version is fixed, so the same
  version is selected every time.
- **The scan is not necessarily reading a consistent set of bytes.** A sequential scan can
  walk pages that a writer is concurrently modifying, and get a torn view. Engines handle
  this with page-level validation (`InnoDB` marks pages modified during a read and
  restarts the scan; PostgreSQL relies on the fact that tuple versions are immutable once
  written and appends only, so a scan never sees a half-updated tuple). The "no read blocks
  on write" property is a *logical* property achieved by those physical mechanisms, not an
  absence of machinery.

### 4.4 Why Reads Stop Blocking Writes

The payoff, stated as a diagram because this is the property every engineer is looking for
and few can explain:

```text
  WITHOUT MVCC — the 1990s model
  ─────────────────────────────────────────────────────────────
  time │ T1 (reader)                    T2 (writer)
  ─────┼─────────────────────────────────┼────────────────────────
   1   │ BEGIN                           │
   2   │                                 │ BEGIN
   3   │ SELECT * FROM products          │ UPDATE products SET price=90
   4   │   → S/X lock on row 1, HELD     │   → needs X lock on row 1
   5   │   until COMMIT                  │   → WAITS for T1
   6   │ (T1 does 40s of application     │   → still waiting
   7   │  work with the result set open) │   → still waiting
  ... │                                  │   → still waiting
  47   │ COMMIT                          │   → proceeds
       │                                 │
       └─ a 44-second read blocked a write for 44 seconds, for a
          result set that had already been delivered.

  WITH MVCC
  ─────────────────────────────────────────────────────────────
   1   │ BEGIN                           │
   2   │                                 │ BEGIN
   3   │ SELECT * FROM products          │ UPDATE products SET price=90
   4   │   → no lock at all. Reads v1    │   → writes v2, marks v1
   5   │   (xmin=T0, xmax=0 at snapshot). │   → NO CONFLICT
   6   │   Sees price=100.               │   → proceeds to commit
   7   │ COMMIT                          │ COMMIT
       └─ the read got a coherent answer and blocked nothing, and
          the write blocked nothing. Total elapsed: microseconds.
```

The reason this matters beyond performance is that it changes the *failure model*. Under
locking concurrency control, a long-running read is a denial-of-service vector against every
writer in the system — a single unclosed cursor or a forgotten transaction is a production
outage. Under MVCC, a long-running read is merely expensive for the database's space
reclamation, which is a different failure with a different trigger and a different fix.

> **INTERVIEW TRAP — "WHAT DOES MVCC GIVE YOU, EXACTLY?"**
>
> The trap answer is "better concurrency" or "no read locks", which are slogans. The
> precise answer has three parts and each is load-bearing. (1) **Readers do not block
> writers and writers do not block readers**, because a read resolves to a specific row
> *version* chosen by comparing transaction ids against the reader's snapshot, rather than
> by acquiring a lock on a live row. (2) **Rollback is nearly free**, because rollback means
> discarding a newly written version and letting the previous version — which is still
> physically present in the chain — become current again, rather than reconstructing a
> state. (3) **The price is space and reclamation**: every update leaves a dead version
> behind, table size grows under write-heavy load, and something must eventually identify
> and remove versions no live transaction can need. That third part is where the production
> incidents are, and the second half of most MVCC interview questions is really asking about
> it.
>
> The follow-up that ends the question: "so is a long-running transaction a performance
> problem or a correctness problem?" Both, and in a specific order — first it is
> performance (its versions cannot be reclaimed, so the table bloats and scans get slower
> for *everyone*), and if it lasts long enough it becomes correctness, because it pins
> `xmin` and blocks the reclamation that other transactions' rollbacks and visibility
> decisions depend on.

### 4.5 The Costs: Bloat, Vacuum, and the Long-Running Transaction

The costs are not abstract. They are the majority of the MVCC-related operational work in a
real PostgreSQL or MySQL deployment, and the long-running transaction is the single cause
behind most of them.

**Dead versions accumulate.** Every `UPDATE` and every `DELETE` produces at least one
version that no transaction should ever see again. The table's *logical* size does not
change; its *physical* size does.

```text
  10 million rows, 50% updated once per hour, for 6 hours
  ─────────────────────────────────────────────────────────
  logical rows         10,000,000
  dead versions        10,000,000 × 0.5 × 6 = 30,000,000
  physical rows        40,000,000          (4× the logical size)
  ─────────────────────────────────────────────────────────
  Every sequential scan now reads 40 million physical rows to return
  10 million logical ones. Index entries pointing at dead tuples need
  index scans to follow the chain and discard the dead versions. Bloat
  is a *read* cost, not a space cost — which is why it shows up as
  "the table got slower" long before anyone checks free disk.
```

**Vacuum is the reclamation mechanism, and it is the load-balancing valve that can fail
open.** In PostgreSQL, `VACUUM` walks the table, identifies tuples no live transaction can
need, and marks them reusable (it does not return space to the operating system; that is
`VACUUM FULL`, which takes an exclusive lock and rewrites the table). Autovacuum runs it
on thresholds, and has a `cost_delay` so it never starves foreground traffic.

**The failure mode is the interaction with a long-running transaction, and it is a
cliff rather than a slope.** Vacuum cannot remove a version if some transaction's snapshot
might still need it. It also cannot advance the *oldest* relevant snapshot — the horizon
beyond which versions are certainly garbage. So a single transaction that has been open
since 03:00 pins that horizon, and everything written since 03:00 is uncollectable:

```text
  THE VACUUM HORIZON
  ─────────────────────────────────────────────────────────────────
        oldest live snapshot
                │
   03:00       ▼         09:00        14:00        now
   ────────────┼──────────┼───────────┼────────────┼───────────►
   │           │          │           │            │
   │      T_admin opened │      writes accumulate     │
   │      a transaction  │      here — 40M versions, │
   │      and has not    │      NONE of which can be │
   │      committed      │      reclaimed, because   │
   │      since.         │      T_admin's snapshot   │
   │                    │      might need any of    │
   │                    │      them.                │
   └────────────────────────────────────────────────────
   Table grows 4×. Scans slow down for everyone, not just T_admin.
   The disk fills. This is not T_admin's query being slow; it is the
   whole database degrading because of one forgotten BEGIN.
```

```sql
-- PostgreSQL: finding the transaction that is doing this
-- The oldest transaction that has not been vacuumed, i.e. the horizon.
SELECT pid, state, xact_start, now() - xact_start AS age,
       left(query, 80) AS last_query
  FROM pg_stat_activity
 WHERE xact_start IS NOT NULL
   AND state <> 'idle'
 ORDER BY xact_start LIMIT 10;

-- Every current snapshot, and the oldest one — this is the vacuum's limit.
SELECT pid, backend_xmin, now() - backend_xmin AS age
  FROM pg_stat_activity
 WHERE backend_xmin IS NOT NULL
 ORDER BY backend_xmin LIMIT 5;

-- The metric to alert on, directly.
SELECT datname, age(datfrozenxid) AS xid_age
  FROM pg_database
 WHERE age(datfrozenxid) > 100000000;   -- approaching wraparound
```

**The same story in MySQL, with the same cause and one extra twist.** InnoDB's undo log is
where old row versions live, and `purge` is the thread that reclaims them. Purge cannot
reclaim a version still needed by an active read view, so the read view held open by a
long-running transaction stalls purge, the undo log grows without bound, and — the part
that is specific to InnoDB — **undo log growth inside the system tablespace is not
reclaimable by `TRUNCATE` or by ordinary cleanup**; in older versions it required a dump
and reload to recover. This is the single most common cause of "InnoDB is consuming all
our disk", and the single most common cause of an InnoDB read view being held open is a
long-running `SELECT` or a forgotten transaction in a monitoring tool.

> **PRODUCTION SCENARIO**
>
> Problem: over four days, the main reporting database grows from 200 GB to 1.4 TB with no
> corresponding growth in the data. Every query slows down, replication lag climbs to
> hours, and the on-call runbook has no entry that fits. The team concludes it is a storage
> problem and provisions a larger volume, which buys four days.
> Investigation: `pg_stat_user_tables.n_dead_tup` shows 900 million dead tuples on the two
> largest tables. `pg_stat_activity` shows a single session, `backend_xmin` set, running
> for 3 days 14 hours, in state `active`, whose last query is a
> `pg_sleep` inside a materialized-view refresh that was started by a cron job four days
> ago. The refresh has been blocked on a lock for most of its life but its transaction has
> never ended, because the job wraps everything in an explicit transaction and the exception
> path does not roll it back.
> Root cause: the long-running transaction pins the vacuum horizon, so autovacuum has been
> running continuously and reclaiming nothing at all. Every dead tuple since 03:00 four days
> ago is still on disk. The database is not full of new data; it is full of *garbage it is
> not permitted to delete*. The larger volume did not help because the growth rate is a
> function of write volume, not of capacity.
> Solution: kill the session, which releases the horizon, after which a single `VACUUM`
> reclaims the dead tuples and the tables shrink back to 200 GB in physical pages available
> for reuse. No data was lost at any point. The cron job was rewritten to run without an
> explicit transaction around a potentially-blocking refresh, and to set a
> `statement_timeout` so it cannot hold a snapshot indefinitely again.
> Prevention: three alerts — oldest running `xact_start` over 15 minutes, `n_dead_tup`
> ratio above a threshold, and `age(datfrozenxid)` approaching the wraparound limit — plus a
> `statement_timeout` on every role that is not a migration role. A long-running transaction
> is a *correctness* concern in a database with wraparound, not just a performance one, and
> alerting on it is the cheapest insurance in the subject.

> **SCALING REALITY CHECK**
>
> Bloat scales with *update rate × retention time*, not with table size. The formula worth
> holding: **physical size ≈ logical size × (1 + updates per row during the maximum
> transaction lifetime)**. A table with a one-hour maximum transaction lifetime and rows
> updated twice per hour stays near 3× its logical size. The same table with a
> four-day maximum transaction lifetime reaches 200× before vacuum can do anything at all.
> This is why the operational number that matters is *the longest transaction you permit*,
> and why `statement_timeout` and `idle_in_transaction_session_timeout` are concurrency
> controls rather than merely performance tuning — they are the input to the bloat formula.

> **TRADE-OFF — "MVCC OR LOCKING CONCURRENCY CONTROL?"**
>
> The condition that flips the answer is **the read-to-write ratio and the tolerance for
> blocking.** MVCC wins decisively when reads outnumber writes, when read latency must be
> predictable (a reader's latency never depends on a writer's progress), and when blocking
> is unacceptable — which is every OLTP system, and which is why essentially every major
> engine has converged on MVCC. Locking concurrency control wins when the working set is
> small enough to fit in memory and the engine can afford to serialise, because it produces
> no garbage, no vacuum, and no horizon, and it is genuinely cheaper in space. That is why
> `SERIALIZABLE` as strict locking still exists as a level in an otherwise-MVCC engine: it
> is the right tool for a nightly batch over a table nobody else is touching, and the wrong
> tool as a default. The honest summary is that MVCC did not beat locking — it beat
> blocking, and blocking is what shows up in a latency percentile.

#### Common Mistakes

- Describing MVCC as "keeping multiple versions" without saying *why a reader chooses one
  and what it does with the rest*, which is the part that explains everything
- Claiming `UPDATE` modifies the row in place, and being unable to explain how rollback
  restores the previous value when the previous value was never overwritten
- Treating bloat as a disk-space problem rather than a read-cost problem, and therefore not
  connecting a bloated table to the sudden appearance of slow sequential scans
- Not knowing that vacuum's ability to reclaim is bounded by the *oldest live snapshot*,
  and so not connecting a single long-running transaction to system-wide degradation
- Claiming MVCC means "no locks at all" — locking reads, writes, and serializable
  transactions all take locks, and the absence of reader locks is specifically what does not
  hold
- Believing MVCC prevents write skew, when it is in fact the mechanism that makes write skew
  *deterministic* by pinning both transactions to the same snapshot
- Forgetting that in InnoDB the undo log holds the old versions and purge is the reclaimer,
  so "MVCC garbage" and "disk full" are the same story with a different engine's vocabulary

#### Interview Questions — MVCC

**Q1. Explain MVCC. How does a reader decide which version of a row to return?** `STAFF`

MVCC keeps multiple physical versions of each row. An `UPDATE` writes a *new* version
rather than modifying the existing one, marks the old version as superseded by a
transaction id, and links the new version back to the one it replaced — so the table holds a
chain of versions per logical row, and rollback is simply discarding the new version and
letting the still-present previous one become current again. A reader carries a snapshot
established at some moment, and walks the chain newest-first, selecting the first version
whose creating transaction committed before the snapshot and whose deleting or
overwriting transaction did *not* commit before the snapshot. The mechanism is important
precisely because it takes no locks: the answer is a comparison of two transaction ids
against a fixed snapshot, not an acquisition of exclusive access to a live row. That is why
readers do not block writers, why writers do not block readers, and why a reader's latency
is independent of what every other transaction in the system is doing.

**Q2. Your table has 10 million rows and 900 million dead tuples. What is actually
happening, and what is the real cost?** `TRICKY`

Every `UPDATE` and `DELETE` leaves a version behind that no live transaction should ever see,
and the logical row count is still 10 million — the physical row count is what has grown.
The cost is a *read* cost first and a space cost second, and the order matters because it
explains the symptom: a sequential scan reads 910 million physical rows to return 10 million
logical ones, index scans follow version chains and discard dead tuples at every hop, and
buffer pool hit rates fall because the working set has tripled. Under a write-heavy workload
this is silent until it is severe. The cause is the vacuum horizon: `VACUUM` can only
reclaim versions older than the oldest live transaction's snapshot, so if any transaction
has been open for hours, everything written since is uncollectable regardless of how
aggressively autovacuum is running. The first diagnostic step is therefore not "run vacuum"
but "find the oldest transaction" — `pg_stat_activity` ordered by `xact_start`, or
`information_schema.innodb_trx` in InnoDB — because until that transaction ends, vacuum
reclaims nothing at all and running it manually is wasted work.

**Q3. A transaction has been open for six hours. Why is that a correctness concern and not
just a performance one?** `ADVANCED`

In PostgreSQL it is a correctness concern because of transaction id wraparound. Every
transaction consumes a transaction id from a finite, eventually exhausted 32-bit space.
Because old transactions' statuses must remain known to every other transaction for the
MVCC snapshot comparison to work, a transaction id cannot be recycled while any live
snapshot might still need to know whether it committed. One long-lived transaction holds
that recycling back, and if the distance between the oldest transaction id and the current
one exceeds roughly 2.1 billion, wraparound is imminent — and the safety response is to
refuse to let *any* new transaction assign a transaction id, which means the database
effectively stops accepting writes. That is a self-inflicted outage from a single forgotten
`BEGIN`. The operational controls are the wraparound-distance alert, the
`idle_in_transaction_session_timeout` and `statement_timeout` settings on every non-migration
role, and a periodic query that terminates transactions older than a threshold. In InnoDB
the same long transaction is less catastrophic but has its own version: it holds back
`purge`, so the undo log grows inside the system tablespace and cannot be reclaimed by
ordinary operations — the same root cause with a different failure mode.

**Q4. MVCC removes read locks. Does that mean there are no locks in the system?** `TRICKY`

No, and the specific locks that remain are the ones that generate the interesting
behaviour. Plain `SELECT`s take no row locks in either major engine — that is the property
that makes reads non-blocking. But writes take exclusive locks on the rows they modify, and
InnoDB at `REPEATABLE READ` takes *next-key* locks covering the record and the gap before
it, which is how it prevents phantoms from writes and simultaneously how it can make an
`INSERT` wait on a transaction that only ever read the range. Explicit locking reads —
`SELECT ... FOR UPDATE`, `FOR SHARE`, `FOR NO KEY UPDATE` — take real locks by design, and
are how the `NOWAIT` and `SKIP LOCKED` queue behaviours in Chapter 6 are implemented.
Under `SERIALIZABLE`, PostgreSQL's SSI takes predicate locks — not on rows, but on index
ranges read by the transaction — to detect dangerous patterns, and InnoDB escalates to
table-level shared and exclusive locks. So the accurate statement is that MVCC removes
*reader-to-writer* blocking, not locking from the system.

**Q5. When would you choose locking concurrency control over MVCC, and has anyone
actually?** `STAFF`

Locking concurrency control wins on space and on the absence of reclamation work: it
produces no dead versions, needs no vacuum, has no horizon, and cannot be starved by a
long-running transaction. The reason it lost is not throughput — it is *latency
distribution*. Under locking CC, a reader's latency is a function of every writer in the
system, and a single long transaction is a denial-of-service against all of them; under
MVCC, a reader's latency is a function of itself. That is why every major engine converged
on MVCC, and why the surviving locking implementation is not a competing engine but a
*mode* inside an MVCC one. The real use today is `SERIALIZABLE` applied narrowly: a nightly
reconciliation over a table nobody else is writing, where true strict serializability is
wanted and the contention cost is paid by a job that runs once. The genuinely interesting
engineering question is the hybrid — and the answer is that most engines already are one,
since writes are serialised by locks while reads run on versions.

> **CHAPTER 4 SUMMARY**
>
> MVCC stores multiple versions of each row and lets a reader select the right one by
> comparing transaction ids against a fixed snapshot, which is why readers never block
> writers, why writers never block readers, and why rollback is nearly free — an update is
> a new version plus a superseded marker plus a back-pointer, so undoing a transaction means
> discarding the new version and letting the still-present old one become current. The price
> is that every update leaves a dead version behind, table size grows under write load, and
> reclamation is bounded by the oldest live transaction's snapshot — which is why a single
> long-running transaction degrades the entire database, not just its own query, and why
> in PostgreSQL it is also a wraparound-safety concern rather than only a performance one.
> The operational numbers to remember are the two the bloat formula is built from: update
> rate and the maximum permitted transaction lifetime.

#### Further Reading

- [PostgreSQL — MVCC](https://www.postgresql.org/docs/current/mvcc-intro.html) — `xmin`/`xmax` and the visibility rule, which is the reader's version-selection algorithm stated by the source.
- [PostgreSQL — Routine Vacuuming](https://www.postgresql.org/docs/current/routine-vacuuming.html) — the horizon, the wraparound safety valve, and why autovacuum is configured the way it is.
- [PostgreSQL — `idle_in_transaction_session_timeout`](https://www.postgresql.org/docs/current/runtime-config-client.html#GUC-IDLE-IN-TRANSACTION-SESSION-TIMEOUT) — the setting that turns the most common long-transaction incident into a non-event.
- [MySQL — InnoDB Undo Logs](https://dev.mysql.com/doc/refman/8.0/en/innodb-undo-logs.html) — the same story in InnoDB's vocabulary, including the `purge` thread and the read view that stops it.

## Chapter 5 — Locks

### 5.1 Locks Are the Tax You Pay and Someone Else Sends

The framing that makes this chapter useful: **a lock is not a cost to the transaction
holding it, it is a cost collected from every transaction queued behind it.** The holder
pays nothing for holding; the entire cost is externalised onto whoever arrives next. That
is why "our transaction takes a lock" is never a complete incident analysis, and why the
question a staff engineer asks is always *what class of query is now blocked behind mine*.

Locks exist in MVCC databases too, despite the previous chapter. Plain reads take no row
locks — that is the point of MVCC — but writes do, and explicit locking reads do, and
`SERIALIZABLE` does, and the statement-level and relation-level locks around DDL block
everything regardless of MVCC.

### 5.2 The Modes

Four modes, and the compatibility matrix is the whole subject.

| Mode | Abbrev. | Compatible with | Used for |
| --- | --- | --- | --- |
| Access Share | `S` | `S`, and any `ROW EXCLUSIVE`+ | `SELECT`, and the weakest common denominator — held until end of transaction |
| Row Share | `SR` | `SR`, `S`, and all except `EXCLUSIVE` | `SELECT ... FOR UPDATE`, `FOR SHARE` |
| Row Exclusive | `RX` | `S`, `SR`, `RX`, `S` | `INSERT`, `UPDATE`, `DELETE` |
| Share Update Exclusive | `SUE` | only itself | `VACUUM`, `ANALYZE`, some DDL, `FOR NO KEY UPDATE` in PostgreSQL |
| Share | `S` | `S`, `SR`, `RX`, `SUE`, `S` | `CREATE INDEX`, some DDL, `FOR SHARE` |
| Share Row Exclusive | `SRX` | only `S` and `SRX` | `ALTER TABLE`, most schema changes |
| Exclusive | `X` | nothing | `DROP`, `TRUNCATE`, `ACCESS EXCLUSIVE` DDL |
| Access Exclusive | `AX` | nothing | almost all `ALTER TABLE`, including adding a column with a default |

The compatibility rules in one line each:

```text
  S    + S    = compatible.    Many readers, no writer. This is the whole
                               point of the mode existing.
  S    + X    = CONFLICT.      The writer waits for every reader to finish.
  X    + X    = CONFLICT.      Writers serialise.
  AX   + ANY  = CONFLICT.      A DDL statement stops the entire database.
  SUE  + ANY except SUE = CONFLICT.  Vacuum cannot run while anything
                               modifies the table — and this is why a
                               long-running UPDATE on a large table can
                               starve autovacuum indefinitely.
```

> **INTERVIEW TRAP — "WE ADDED A COLUMN AND THE WHOLE DATABASE STUCK."**
>
> This is the single most common lock incident, and the mechanism is that almost every
> `ALTER TABLE` takes `ACCESS EXCLUSIVE`, which is compatible with nothing. It does not
> wait politely for readers to drain; it requests the one mode no other transaction can
> hold simultaneously, and then **every subsequent query queues behind it** — including
> plain `SELECT`s that were not there when it started. The result is a table that appears
> frozen: existing statements finish, new statements of any kind queue, and the pile grows
> until the connection pool is exhausted and the application reports a total outage rather
> than a slow query.
>
> The senior answer has two halves. First, know the cheap escapes: in PostgreSQL, adding a
> column *with a volatile default* rewrites the table and needs `ACCESS EXCLUSIVE`, but
> adding a column with a constant default, or at the end of the table, or a nullable
> column, takes `ACCESS EXCLUSIVE` only briefly rather than for the duration of a rewrite.
> `CONCURRENTLY` on index creation is the same idea. Second — and this is the staff-level
> point — **the real fix is not a lock timeout, it is not doing DDL on the live table during
> business hours.** The `lock_timeout` setting and a statement timeout are what you add
> *after* an incident, so the next one costs three minutes instead of an outage; the
> structural answer is a migration process with a rehearsal on a copy of production-sized
> data, because a DDL lock's duration is a function of table size and that number should
> never be discovered during a deploy.

### 5.3 Row, Page, Table, and Intention Locks

The granularity question is a genuine trade-off, and the answer is not "finer is better" —
finer locks mean more lock *management* overhead, more memory in the lock table, more
chances to deadlock, and a very different performance profile on a table with many rows
per page.

```text
  GRANULARITY SPECTRUM
  ─────────────────────────────────────────────────────────────────────
  DATABASE   one lock for everything.
             Zero deadlock risk, zero concurrency. Correct for: nothing
             except a single-user embedded database.

  TABLE      one lock per table.
             Kills all concurrency on that table. Used by: `LOCK TABLE`,
             `SERIALIZABLE` in InnoDB, most DDL, and `TRUNCATE`.

  PAGE       one lock per page (8–16 kB).
             A one-row update on a 200-row page locks all 200 rows'
             worth of that page. Cheap to manage, and the unit at which
             physical page-level serialisation happens during a scan
             that meets a concurrent modification.

  ROW        one lock per row (or per index entry).
             Maximum concurrency; maximum bookkeeping. The default for
             writes in both major engines. PostgreSQL additionally
             locks index entries and, at SERIALIZABLE, predicate ranges.

  ─────────────────────────────────────────────────────────────────────
  The "many rows per page" point is the non-obvious one. Because rows
  are physically clustered into pages, a per-row lock does not mean a
  row lives alone. Two updates to *different* rows on the same page do
  not conflict at the row level, but they DO serialise on the page's
  physical write. This is one reason MVCC exists.
  ─────────────────────────────────────────────────────────────────────
```

**Intention locks are the mechanism that makes multi-granularity locking tractable**, and
they are the concept most candidates cannot articulate. The problem they solve: a row-level
lock system must answer, for a `SELECT` that wants to touch 10,000 rows, whether some other
transaction holds a *table-level* lock that would conflict. Scanning 10,000 lock-table
entries per statement is untenable. Intention locks solve it with a two-level protocol:

```text
  THE INTENTION PROTOCOL
  ────────────────────────────────────────────────────────────────────
  T1 wants to UPDATE 5 rows of `orders`.
     1. Before touching any row, T1 takes a ROW EXCLUSIVE lock on the
        TABLE `orders`.  ← the intention. It declares "I will be taking
                           row-level locks in here."
     2. Then T1 takes row-level locks on the 5 specific rows.

  T2 wants to DROP TABLE `orders`.
     1. T2 requests ACCESS EXCLUSIVE on the table.
     2. The engine does not need to scan for row locks. It checks the
        table lock: there is a ROW EXCLUSIVE there, and ACCESS EXCLUSIVE
        is incompatible with it. → T2 waits.
     3. Constant time, regardless of whether T1 held 5 row locks or 5
        million.
  ────────────────────────────────────────────────────────────────────
  A table-level request is granted only if NO conflicting intention
  lock is held and NO conflicting table-level lock is held. A row-level
  request is granted if no conflicting row lock is held AND the intention
  locks already held by others are compatible with the mode the row
  request implies.
  ────────────────────────────────────────────────────────────────────
  This is why "add an index concurrently" is not a free operation even
  though it does not block reads: it takes SHARE UPDATE EXCLUSIVE at
  table level, which conflicts with VACUUM, ANALYZE, and other
  SUE-holders, and it must wait for all existing transactions to drain
  out of the table.
```

The name is slightly misleading and worth correcting if you use it: *intention* locks do not
mean "I intend to take a stronger lock later" — they mean "I hold, or am about to hold, a
lock at a finer granularity than the table." The table-level lock is a declaration, not the
protection.

### 5.4 Lock Waits, Queues, and Timeouts

A lock wait has more structure than "it is slow", and the structure is what tells you
whether to fix the query, the transaction, or the schema.

```text
  THE ANATOMY OF A LOCK WAIT
  ───────────────────────────────────────────────────────────────────
   T1: BEGIN
   T1: UPDATE orders SET status='PAID' WHERE id = 42;
       → holds ROW EXCLUSIVE on `orders`, row lock on row 42
       → application does something slow. 40 seconds of it.

   T2: UPDATE orders SET status='SHIPPED' WHERE id = 42;
       → wants X on row 42 → CONFLICT → WAITS

   T3: UPDATE orders SET status='CANCELLED' WHERE id = 42;
       → wants X on row 42 → CONFLICT → WAITS, BEHIND T2

   T4: SELECT * FROM orders WHERE id = 42;
       → AccessShare on `orders`. Compatible with T1's RowExclusive.
       → PROCEEDS IMMEDIATELY. Not blocked.
       (Under InnoDB REPEATABLE READ this specific read may be served
        from undo, or may block depending on whether it is a locking
        read — see Chapter 3.)

   T1: COMMIT
       → T2 wakes, takes the lock, runs, commits
       → T3 wakes, takes the lock, runs, commits
  ───────────────────────────────────────────────────────────────────
  Three facts that matter operationally:

  1. The queue is FIFO in both engines, and the holder is NOT preempted.
     A 5-second transaction behind a 40-second transaction waits 40
     seconds, not 5. Queue length is what matters, not the work.

  2. Waiting does not consume CPU. A pile of 200 waiters costs almost
     nothing in resources and everything in latency. The database looks
     HEALTHY while being completely unavailable for that row.

  3. The whole transaction is held, not just the statement. A long
     transaction between two short writes holds its locks through the
     gap. Reducing the number of statements is not the fix; reducing
     the time between the first write and the commit is.
```

**The timeouts that bound the damage, and when each is the right one:**

```sql
-- PostgreSQL
SET lock_timeout = '3s';         -- only the time spent WAITING FOR A LOCK.
                                 -- Does NOT include query execution time.
SET statement_timeout = '30s';   -- total time for one statement.
SET idle_in_transaction_session_timeout = '60s';
                                 -- the single most valuable setting in
                                 -- this chapter: kills a transaction
                                 -- that has finished its statement and
                                 -- is sitting idle holding locks.

-- MySQL/InnoDB
SET innodb_lock_wait_timeout = 10;         -- seconds to wait for a row lock
SET lock_wait_timeout = 5;                -- metadata locks
SET max_execution_time = 30000;            -- ms, SELECT only
-- There is no direct equivalent of idle_in_transaction_session_timeout;
-- it is enforced operationally by the pool and by monitoring.
```

```sql
-- PostgreSQL: who is blocking whom, right now
SELECT blocked.pid          AS blocked_pid,
       blocked.query        AS blocked_query,
       now() - blocked.query_start AS waited,
       blocking.pid         AS blocking_pid,
       blocking.query       AS blocking_query,
       now() - blocking.xact_start AS blocker_age
  FROM pg_stat_activity blocked
  JOIN pg_stat_activity blocking
    ON blocking.pid = ANY(pg_blocking_pids(blocked.pid))
 WHERE cardinality(pg_blocking_pids(blocked.pid)) > 0;
```

```sql
-- MySQL 8.0: the same question, and the data_locks view
SELECT r.trx_id            AS waiting_trx,
       r.trx_mysql_thread_id AS waiting_thread,
       r.trx_query         AS waiting_query,
       r.trx_wait_started  AS waiting_since,
       b.trx_mysql_thread_id AS blocking_thread,
       b.trx_query         AS blocking_query
  FROM performance_schema.data_lock_waits w
  JOIN information_schema.innodb_trx r ON r.trx_id = w.REQUESTING_TRX_ID
  JOIN information_schema.innodb_trx b ON b.trx_id = w.BLOCKING_TRX_ID;

-- The relation-level picture, which is what finds the DDL incident
SELECT * FROM performance_schema.metadata_locks
 WHERE OBJECT_TYPE = 'TABLE' AND LOCK_STATUS = 'PENDING';
```

> **PRODUCTION RELEVANCE**
>
> Lock waits are nearly always misdiagnosed, because the query that is *reported* as slow
> is the victim, not the cause. The p99 query in the slow log is the one that arrived
> second; the query that actually cost the system its throughput is the one that arrived
> first and held the lock for forty seconds, and it may be executing perfectly within its
> own timeframe — which is why it never appears in a slow query log at all. The operational
> discipline this demands is that a lock-wait investigation starts from the *blocking*
> session, not the blocked one, and that `pg_stat_activity` ordered by `xact_start` is a
> more valuable dashboard than a list of slow queries. It also explains why raising the
> connection pool is the wrong response: the pool's job here is to hold waiters, and more
> waiters means longer queues and a longer time to detect the real problem.

> **SCALING REALITY CHECK**
>
> The lock table is a shared structure. Row-level locking with millions of live locks costs
> memory that does not come back until the locks are released, and the per-statement
> bookkeeping is proportional to the number of rows a statement touches rather than to the
> number of pages. Two practical consequences: a single statement that updates 500,000 rows
> holds 500,000 locks for its entire duration and blocks every concurrent writer to any of
> them, which is why large batch updates should be broken into chunks inside separate
> transactions; and a transaction that touches many rows in an order another transaction
> also touches is a deadlock candidate by construction, which is Chapter 7.

### 5.5 The Read That Blocks a Writer

The counter-intuitive case deserves its own treatment because it produces incidents that
look like the database has a bug.

```text
  UNDER INNODB REPEATABLE READ
  ───────────────────────────────────────────────────────────────
   1 │ T1: BEGIN
   2 │ T1: SELECT ... FROM inventory WHERE sku BETWEEN 1 AND 500
   3 │    consistent non-locking read — takes NO lock, gets a read view
   4 │ T1: (application work, 30 seconds)
   5 │
   6 │ T2: INSERT INTO inventory (sku=250, ...)
   7 │    needs a next-key lock to insert into the index
   8 │    → BLOCKED
   9 │    → the block is because T1's read view is older than the insert,
  10 │      and InnoDB will not break a read view
  30 │ T1: COMMIT
  31 │ T2: proceeds
  ───────────────────────────────────────────────────────────────
  The intuition is exactly backwards from what people expect. The read
  took no lock, yet the write waited for the reader. The mechanism is the
  read *view*, not a lock: under REPEATABLE READ, a transaction that has
  established a view is asserting that it will see the world as it was,
  and an insert that would be invisible to that view is deferred.
  ───────────────────────────────────────────────────────────────
  AT READ COMMITTED: a new read view per statement, so the above
  mostly disappears. This is the strongest practical argument for
  changing InnoDB's default — and it is why the same code behaves
  correctly in staging (single writer, tests pass) and fails only under
  concurrent production load.
```

There is a related and very common PostgreSQL variant: a plain `SELECT` at
`REPEATABLE READ` takes no lock, but if the transaction later tries to `UPDATE` a row that
changed since its snapshot, it does not wait — it raises
`could not serialize access due to concurrent update` and must be retried. The
compensation for a system designed not to block readers is that the *writer* discovers the
conflict at commit time and its work is discarded.

> **TRADE-OFF — "SHOULD I SET A SHORT `lock_timeout` ON EVERYTHING?"**
>
> The condition that flips the answer is **whether the write is expected to wait
> legitimately.** A short `lock_timeout` is unambiguously right for connection-pool-facing
> OLTP traffic, because a statement that has waited 2–3 seconds for a lock is already a
> latency outlier and failing fast lets the pool serve someone else. It is wrong for batch
> and reporting workloads, where waiting 30 seconds for a nightly vacuum's lock is normal
> and expected behaviour — setting a short timeout there turns a scheduled job into a
> nightly failure that a human has to retry. The cleanest policy is per-role rather than
> per-database: a short `lock_timeout` and a `statement_timeout` on the application role,
> generous timeouts on the reporting role, and no timeout at all on the migration role. What
> must not happen is a global aggressive timeout with nobody watching the resulting error
> rate, which converts a slow database into a *failing* database — the same outage, with
> worse error messages.

#### Common Mistakes

- Describing a lock as a cost to the transaction holding it, rather than a cost externalised
  onto whoever queues behind it
- Not knowing that DDL takes `ACCESS EXCLUSIVE` and therefore stops *reads*, which is why
  "a small schema change" can take down a whole service
- Being unable to explain what an intention lock is for, and therefore unable to say why a
  table-level request does not need to scan the row-lock table
- Assuming a slow query in the slow log is the cause of a lock incident, when it is
  usually the victim
- Recommending a larger connection pool as the fix for lock waits, when more connections
  means a longer queue and a slower time-to-detect
- Believing plain reads never block writers, which is true for PostgreSQL and false for
  InnoDB at `REPEATABLE READ`
- Forgetting `idle_in_transaction_session_timeout`, which is the single most effective
  setting against the most common lock incident

#### Interview Questions — Locks

**Q1. What lock modes exist, and what does the compatibility matrix actually decide?** `STAFF`

The mode set is shared (`S`), exclusive (`X`), and a family of intention modes that
declare intent to hold finer-grained locks — the database-level modes (AccessShare,
RowShare, RowExclusive, ShareUpdateExclusive, Share, ShareRowExclusive, Exclusive,
AccessExclusive) form a deliberate partial order so that coarse requests are refused
without inspecting the fine-grained ones. The matrix decides three practical things: many
readers can coexist (`S` with `S`), a writer excludes everyone (`X` with anything), and
`ACCESS EXCLUSIVE` — which nearly every `ALTER TABLE` takes — is compatible with nothing,
so a DDL statement does not merely wait for the current readers to drain, it stops every
subsequent query from starting. The two modes worth naming unprompted are
`ShareUpdateExclusive`, which is why a long-running `UPDATE` on a large table can starve
`VACUUM` indefinitely, and `RowExclusive`, which every write takes at table level before
taking any row lock, which is the declaration that makes the whole system tractable.

**Q2. What are intention locks for, and how do they work?** `TRICKY`

The problem is that multi-granularity locking must answer, for a statement about to take
row locks, whether any conflicting *table-level* lock exists — and doing that by scanning
the lock table for every row would be O(rows) per statement, which is unusable. Intention
locks invert the direction. A transaction about to take row-level locks first takes a
`ROW EXCLUSIVE` (or `SHARE UPDATE EXCLUSIVE`, or `SHARE`) lock on the *table*, which
declares "fine-grained locks will be taken here." A table-level requester then only needs
to check table-level locks and intention locks, which is constant work, and never examines
row locks. So an `ACCESS EXCLUSIVE` request from `DROP TABLE` is refused in constant time
by finding a `ROW EXCLUSIVE` intention lock, regardless of whether the other transaction
holds five row locks or five million. The name is the thing to get right if you want to
sound precise: the table-level lock is a *declaration* of fine-grained intent, not a
protection in itself, and the protection is the row locks the declaration promises to come.

**Q3. A long transaction in T1 causes 400 slow queries in T2. Which is the problem, and
what do you do?** `SCENARIO`

T1 is the problem; T2 is the symptom, and this is the diagnosis that gets inverted most
often. T2's queries are slow because they are queued behind T1's locks, and they are not
in the slow log in any meaningful sense — they are waiting, not computing, so their own
execution time may be under a millisecond once they finally run. T1 may not appear in the
slow log at all, because it is not slow: it is fast statements separated by 40 seconds of
application work, and the locks are held across that gap. The investigation goes to
`xact_start`, not to `query_start`. The three fixes in order of preference: (1) shorten the
transaction — the gap between the first write and the commit is the actual defect, and
moving work outside the transaction is a code change with a large payoff; (2) set
`idle_in_transaction_session_timeout` and `statement_timeout` so the next occurrence costs
minutes rather than an outage; (3) add `NOWAIT` or `SKIP LOCKED` to the contending statement
if the application can tolerate skipping a locked row. What you should *not* do is raise
the connection pool — the pool is holding the waiters, and a bigger pool produces a longer
queue and a slower time-to-detect without changing the throughput at all.

**Q4. Why can a plain `SELECT` block an `INSERT` in MySQL but not in PostgreSQL?** `ADVANCED`

Because in InnoDB at `REPEATABLE READ` the read establishes a *read view*, and the read
view is what conflicts, not a lock. The `SELECT` itself takes no gap lock — so it cannot be
the thing holding a lock — but the transaction's read view is fixed, and an `INSERT` needs
a next-key lock on the index position, and InnoDB will not grant it while a transaction with
an older view exists, because that insert would be invisible to the older view and
InnoDB's guarantee is that a transaction's view does not change. The two engines diverge
because InnoDB's `REPEATABLE READ` is a *hybrid* — snapshot visibility for consistent
reads plus real range locks for writes — whereas PostgreSQL's `REPEATABLE READ` is a pure
snapshot with no range locking, so its `INSERT`s are never blocked by readers and phantoms
are simply invisible rather than prevented. The practical consequences are that InnoDB can
produce the read-blocks-writer inversion (which is a strong argument for
`READ COMMITTED`, where a fresh view per statement removes it) and that the two engines'
`REPEATABLE READ` guarantee genuinely different things despite sharing a name.

**Q5. How do you find the query blocking your query, in both engines?** `TRICKY`

The principle first: ask who is *blocking*, not who is slow, because the blocked query is
the victim and usually executes quickly once it is released. In PostgreSQL,
`pg_blocking_pids(pid)` returns the array of blocking backend pids for any session, and
joining `pg_stat_activity` on both sides gives you the waiting query, how long it has
waited, the blocking query, and — the most diagnostic field — how long the blocker has held
its transaction open with `xact_start`. In MySQL 8.0 the equivalent is
`performance_schema.data_lock_waits`, which joins `information_schema.innodb_trx` on
`REQUESTING_TRX_ID` and `BLOCKING_TRX_ID` to get both queries and their thread ids. For
the DDL class of incident, neither of those helps, because the blocker is waiting for a
*metadata* lock rather than a row lock: `performance_schema.metadata_locks` filtered to
`LOCK_STATUS = 'PENDING'` finds the queued DDL, and in PostgreSQL `pg_locks` with
`not granted` shows the same thing. The production practice is to have all three queries
pre-written in a runbook, because the difference between a row-lock incident and a DDL
incident is the difference between a five-minute and a two-hour diagnosis.

> **CHAPTER 5 SUMMARY**
>
> A lock is a cost externalised onto whoever arrives next, so a lock incident is never
> explained by the slow query in the log — that query is the victim, and the cause is the
> session with the oldest `xact_start`, which may be executing perfectly within its own
> timeframe and therefore never appearing in a slow log at all. The mode set is a partial
> order in which intention locks let a table-level request be refused in constant time
> without inspecting the row-lock table, and the two modes that generate incidents are
> `ACCESS EXCLUSIVE` (every `ALTER TABLE`, compatible with nothing, which is how a small
> schema change takes down reads) and `ShareUpdateExclusive` (which is how a long write
> starves `VACUUM`). The two shapes to be able to recognise are the FIFO lock queue, where
> a five-second transaction behind a forty-second holder waits forty seconds, and the
> read-blocks-writer inversion, which exists in InnoDB at `REPEATABLE READ` because the
> conflict is with the transaction's *read view* rather than with any lock the read took.
> The single most valuable configuration setting in the subject is
> `idle_in_transaction_session_timeout`, because it converts the most common cause into a
> three-minute event instead of an outage.

#### Further Reading

- [PostgreSQL — Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — the full mode table, `pg_locks`, and the `FOR UPDATE` / `NOWAIT` / `SKIP LOCKED` variants.
- [PostgreSQL — Lock Monitoring](https://www.postgresql.org/docs/current/lock-monitoring.html) — the `pg_blocking_pids` query, written by the documentation rather than by a blog post.
- [MySQL — InnoDB Locking](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking.html) — record, gap and next-key locks, and the `REPEATABLE READ` hybrid that makes reads block inserts.
- [MySQL — `information_schema.innodb_trx`](https://dev.mysql.com/doc/refman/8.0/en/information-schema-innodb-trx-table.html) — the InnoDB view to query first when something is blocked.

## Chapter 6 — Optimistic vs Pessimistic Concurrency

### 6.1 The Actual Question

Both strategies answer the same question — *how do I know nobody else changed this while I
was deciding?* — with opposite assumptions about the world.

```text
  PESSIMISTIC                                   OPTIMISTIC
  "assume someone will interfere"                "assume nobody will interfere"
  ────────────────────────────                   ──────────────────────────────
  take a lock before reading                     read freely
  block other writers while you decide           compute the intended change
  commit                                         compare-and-swap on write
  released                                      0 rows affected → someone beat
                                                you → retry or fail
  ────────────────────────────                   ──────────────────────────────
  cost paid by: the OTHER transaction            cost paid by: YOU, on failure
  waits even when the conflict never happens     no waiting at all in the common
                                                case where nobody conflicts
  best when: conflicts are FREQUENT             best when: conflicts are RARE
  and the work per conflict is expensive         and the work per conflict is cheap
```

The honest one-line summary, and the thing to say if you are asked to choose without
context: **pessimistic moves the cost of concurrency to the other transaction; optimistic
moves it to the failing transaction.** Everything else — deadlock risk, lock table
pressure, latency distribution, retry logic required — follows from where that cost lands.

### 6.2 Optimistic: The Version Column and Compare-and-Swap

The mechanism is a column. On read you remember its value; on write you include it in the
`WHERE` clause, so the update only succeeds if nobody has changed the row in the meantime.
The "0 rows affected" result is the entire detection mechanism.

```sql
ALTER TABLE products ADD COLUMN version INT NOT NULL DEFAULT 0;

-- READ: note the version alongside the data you are about to decide on.
SELECT id, name, price, version FROM products WHERE id = 7;
--  id | name       | price | version
--  7  | Widget     | 100   | 3

-- WRITE: the version goes in the WHERE clause. If anyone has changed
-- the row since the read, this matches zero rows.
UPDATE products
   SET price = 90, version = version + 1
 WHERE id = 7 AND version = 3;
--  rows affected: 1   → we won, nobody interfered

-- versus, if T2 had committed a change first:
UPDATE products
   SET price = 90, version = version + 1
 WHERE id = 7 AND version = 3;
--  rows affected: 0   → we lost, and we now know it
```

**The detail that makes it correct, and that is easy to get wrong: the version must be
checked in the `WHERE` clause, and the row must be identified by the primary key.** Using
a non-unique predicate — `WHERE name = 'Widget' AND version = 3` — makes the update affect
an arbitrary matching row, which is neither a correct conflict check nor a safe write. And
the `version = version + 1` in the `SET` clause is what makes the *next* reader's
compare-and-swap fail; without incrementing it, two transactions could both read version 3
and both successfully write, because the version never changed.

```java
// The retry loop. Note: the ENTIRE read-decide-write must be inside
// the retry, not just the write. A retry that reuses the value it read
// the first time is not a retry.
boolean updateWithRetry(long id, BigDecimal newPrice) {
    for (int attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            return txTemplate.execute(status -> {
                Product p = repo.findById(id)
                    .orElseThrow(() -> new NotFound(id));
                if (p.getPrice().compareTo(newPrice) == 0) {
                    return true;                       // no-op, do not
                }                                       // burn an attempt
                int rows = jdbc.update(
                    "UPDATE products SET price = ?, version = version + 1 " +
                    "WHERE id = ? AND version = ?",
                    newPrice, id, p.getVersion());
                if (rows == 0) {
                    throw new OptimisticLockException(id); // roll back
                }                                       // and retry the
                return true;                            // whole thing
            });
        } catch (OptimisticLockException e) {
            if (attempt == MAX_ATTEMPTS) throw e;
            backoffWithJitter(attempt);   // jitter is not optional;
        }                                  // see 6.5
    }
    throw new IllegalStateException("unreachable");
}
```

**What optimistic locking buys, and what it costs.** It buys zero lock-holding time, no
lock table pressure, no deadlock, and an excellent read latency profile — which is why it is
the default for web applications serving thousands of concurrent readers over a few hundred
rows. It costs you the mandatory retry loop, the need to make every mutating path
version-aware (a single path that forgets is a silent correctness hole rather than an
error), and a hard failure mode under high contention that is discussed in the next
section.

> **INTERVIEW TRAP — "WE ADDED A VERSION COLUMN. IS OUR UPDATE SAFE NOW?"**
>
> Not automatically, and the gap is worth drawing out because it is a real and common bug.
> A version column only protects the statements that *include it in the `WHERE` clause*.
> An ORM that does dirty checking and issues `UPDATE products SET price = ? WHERE id = ?`
> — which is the default generated SQL for most entity states — does **not** use the version
> column, no matter that the column exists on the entity. The protection is a property of
> the SQL that reaches the database, not of the schema. Three specific holes to name: (1)
> a bulk `UPDATE ... WHERE status = 'PENDING'` that does not check versions, and silently
> clobbers concurrent changes to every pending row; (2) a native query written by hand that
> omits the version predicate; (3) a read-modify-write spanning two statements rather than
> one, where the second statement is issued on a different connection or after the version
> was re-read — at which point the check has been defeated.
>
> The review question that catches all three is: *grep the codebase for every `UPDATE` and
> `DELETE` against this table, and confirm each one either checks the version or is a
> deliberate exception.* That is a five-minute audit, and it is the difference between
> having a version column and having optimistic locking.

### 6.3 Pessimistic: `SELECT ... FOR UPDATE` and Its Three Modes

The pessimistic mechanism is: take the lock *before* the read, so the read and the write
are indivisible with respect to other writers.

```sql
BEGIN;
  -- The lock is taken here. Any other transaction wanting this row
  -- now waits. Crucially, this is a LOCKING read, not a snapshot
  -- read: it does not go through the MVCC visibility path.
  SELECT price, stock FROM products WHERE id = 7 FOR UPDATE;

  -- Now decide, with the guarantee that nobody can change it under you.
  -- (The application runs whatever logic takes 5ms or 5 minutes —
  -- the lock is held for the whole of it either way.)
  UPDATE products SET stock = stock - 1, price = 95 WHERE id = 7;
COMMIT;
```

The three lock-strength modifiers, and why each exists:

| Clause | Lock taken | Use when |
| --- | --- | --- |
| `FOR UPDATE` | exclusive row lock — blocks other writers *and* other `FOR UPDATE`/`FOR SHARE` | you are about to change the row |
| `FOR NO KEY UPDATE` | weaker: blocks writers, but *not* deletes of the key / foreign-key checks | you are changing non-key columns only; dramatically less contention on a table with FKs |
| `FOR SHARE` | shared row lock — blocks writers, allows other readers | you are reading to validate a decision others might invalidate |

`FOR NO KEY UPDATE` is the one worth knowing about, because the failure it avoids is
specific and expensive. In PostgreSQL, a foreign-key check requires a `FOR KEY SHARE` lock
on the referenced parent row, and a plain `FOR UPDATE` on the parent conflicts with that —
so a `FOR UPDATE` on a parent row blocks *any* concurrent `INSERT` into the child table. On
a high-volume parent (a customer, an account) that is a serious throughput problem that
appears only under load and looks inexplicable. `FOR NO KEY UPDATE` takes a lock that
conflicts with other writers but not with the key-share a foreign-key check needs.

```sql
-- The queue pattern, which is the other major user of pessimistic locking.
-- Two work items, ONE worker, and the requirement that the worker
-- must not block on an already-claimed item.
BEGIN;
  SELECT id FROM jobs
   WHERE status = 'PENDING'
   ORDER BY priority DESC, created_at
   LIMIT 1
   FOR UPDATE SKIP LOCKED;      -- ← the whole point
  -- No SKIP LOCKED: a second worker BLOCKS here, and the queue
  -- becomes single-threaded even though you have eight workers.
COMMIT;
```

`SKIP LOCKED` and `NOWAIT` are the two escape hatches, and the distinction between them is
the practical content of this section:

| Modifier | Behaviour when the row is locked | Correct use |
| --- | --- | --- |
| plain `FOR UPDATE` | wait indefinitely | you must process this row and nobody else will |
| `NOWAIT` / `NOWAIT` (PG 13+) | raise an error immediately | interactive request where a short wait is unacceptable |
| `SKIP LOCKED` | skip it, return the next unlocked row | a worker draining a shared queue, where *someone else* is handling the locked row |

> **MUST REMEMBER**
>
> `SKIP LOCKED` is not a performance feature; it is a **correctness requirement for a
> multi-consumer queue.** Without it, eight workers pulling from one queue are not eight
> workers — they are eight processes serialised behind whichever one holds the row lock,
> which is strictly worse than a single worker because the serialisation point is
> nondeterministic. With it, `FOR UPDATE SKIP LOCKED` is the standard pattern for
> `SELECT ... LIMIT 1` work distribution, and the same clause is what makes a "claim the
> next available job" loop safe. Volume 7, Chapter 8 covers `SKIP LOCKED` concretely in
> PostgreSQL, including the caveats about what it does to the query's cost estimate and
> about why it can starve rows permanently.

### 6.4 The Poison Message

The interaction between optimistic concurrency, at-least-once delivery, and a message that
cannot be processed is a production scenario with a completely predictable shape, and it
is the failure that turns a "robust" retry loop into an outage.

```text
  THE POISON MESSAGE, DRAWN
  ─────────────────────────────────────────────────────────────────────────
  Queue: orders topic. Consumer processes each message by reserving stock.
  Max attempts: 5. Backoff: exponential.

   msg#1  → reserves stock, writes DB, ACKs                          ✓
   msg#2  → reserves stock, writes DB, ACKS                          ✓
   ...
   msg#9147 → malformed payload. Deserialization throws immediately.
              Attempt 1 fails. Requeued with backoff.
   msg#9148, 9149, ... are now BEHIND it in the queue.              ✓
   ...  5 attempts over 3 hours ...
   msg#9147 → attempt 5 fails. Requeued.                             ✗
   ... forever ...

  Three distinct failures, and the first two are the real incident:

  1. HEAD-OF-LINE BLOCKING. A queue with a bounded number of consumers
     processes messages in order. One unprocessable message at the front
     means everything behind it waits through every retry cycle. Throughput
     drops to zero for a topic that is 99.99% healthy. The dashboard shows
     "consumer lag: 400,000 and climbing" and the on-call engineer sees
     a system-wide outage caused by one bad message.

  2. RETRY AMPLIFICATION. 5 attempts × the message rate of a permanently
     failing message = a constant, self-inflicted load on the exact
     downstream that is already failing. A poison message discovered at
     03:00 becomes 03:00 plus infinite, and each attempt costs a
     database connection for the duration.

  3. SILENT SUCCESS. The poison message is eventually processed
     successfully — by the 900th attempt, when the SKU that was
     temporarily unavailable has been restocked. The business outcome is
     now wrong: the order was placed hours ago, the customer has since
     cancelled, and the reservation succeeds anyway. Nobody knows.
  ─────────────────────────────────────────────────────────────────────────
```

The correct design has three parts, and all three are needed:

```text
  1. BOUND THE RETRIES, AND THEN QUARANTINE.
     After N attempts, move the message to a dead-letter queue (or mark
     it failed and store the payload). The retry budget must be finite
     AND the movement must be explicit. A DLQ that nobody reads is a
     silent data-loss queue, so the DLQ needs an alert and a replay tool
     before it needs to exist.

  2. MAKE THE HANDLER IDEMPOTENT, so a redelivery is a no-op.
     A message key (the order id) recorded in a table with a unique
     constraint, written in the same transaction as the business effect.
     Then "process twice" and "process once" are indistinguishable, and
     at-least-once delivery becomes safe. This is the precondition for
     the whole pattern; see the Microservices Volume 2, Chapter 2.

  3. CLASSIFY THE FAILURE BEFORE RETRYING.
     A validation error or a deserialization failure will NEVER succeed
     on retry. Retrying it is not resilience, it is a loop that burns
     capacity to guarantee failure. Those must go straight to the DLQ.
     A deadlock or a serialization error WILL probably succeed on retry
     and belongs in the retry budget. Distinguishing "transient" from
     "permanent" is the single highest-leverage line of code in a
     consumer, and it is almost never written.
```

> **PRODUCTION RELEVANCE**
>
> The head-of-line blocking shape is not specific to queues — it is what happens to a
> connection pool too, and the two compose badly. A pool with a bounded size, a poison
> message, and a retry loop produces: fewer connections available because more are held by
> retrying consumers, longer waits for the connections that remain, and an increased
> timeout rate, which increases the retry rate. The failure looks like connection
> exhaustion and is actually a poison message plus a retry loop. The diagnostic that
> separates them is the age of the oldest in-flight message versus the pool's wait
> distribution: if the waiters are all behind one very old message, it is the poison
> message.

### 6.5 Retry Loops: Backoff, Jitter, and Bounded Attempts

Every retry loop in the previous three sections has the same three requirements, and
getting any of them wrong turns a resilience mechanism into a load amplifier.

```java
// 1. BOUNDED. An unbounded retry is a hang with extra steps.
private static final int MAX_ATTEMPTS = 5;

// 2. EXPONENTIAL BACKOFF WITH FULL JITTER. Jitter is the load-bearing
//    part, not the growth. Without it, every client that failed at the
//    same moment retries at the same moment, forever, in lockstep —
//    the retry storm is a synchronised thundering herd.
private Duration backoffWithJitter(int attempt) {
    long capMillis = Math.min(MAX_BACKOFF.toMillis(), BASE_BACKOFF.toMillis() * (1L << attempt));
    // ThreadLocalRandom: uniform in [0, cap], NOT cap itself.
    return Duration.ofMillis(ThreadLocalRandom.current().nextLong(capMillis + 1));
}

// 3. RETRY ONLY WHAT IS TRANSIENT. A unique-violation or a validation
//    error is permanent; retrying it converts a fast failure into a
//    slow failure and burns a connection the whole time.
private boolean isTransient(SQLException e) {
    if (e instanceof SQLTransientException) return true;
    String sqlState = e.getSQLState();
    // 40001 serialization_failure, 40P01 deadlock_detected
    return "40001".equals(sqlState) || "40P01".equals(sqlState);
}
```

The three failure modes to name if asked how a retry loop goes wrong in production:

- **No jitter.** A thousand clients fail together, retry together, fail together. The
  retry loop *is* the outage. This is the single most common defect in retry code and it is
  invisible in a test with one client.
- **Unbounded attempts.** A permanently failing transaction holds its connection, its
  snapshot, and (under `REPEATABLE READ` on PostgreSQL) the vacuum horizon, for as long as
  it keeps trying. A retry loop without a bound is the long-running transaction from
  Chapter 4, wearing a different hat.
- **Retrying the wrong layer.** If the same work is retried by the queue *and* by the HTTP
  client *and* by the database's deadlock handler, the effective attempt count is the
  product, and the team believes it is the sum. Worth asking explicitly which layers are
  retrying before adding another.

> **TRADE-OFF — "PESSIMISTIC OR OPTIMISTIC FOR THIS WORKFLOW?"**
>
> The condition that flips the answer is **the conflict rate, and it is measurable rather
 than theoretical.** Optimistic is right when conflicts are rare — the common case for
 user-facing CRUD over a table where one row is touched by a handful of concurrent
 requests — because it costs nothing in the common case and needs no lock table, no
 deadlock handling, and no wait. Pessimistic is right when conflicts are *frequent and
 the work per conflict is expensive*: a claim-the-next-job queue where eight workers
 contend for the head of the queue (use `SKIP LOCKED`), a seat-booking or inventory
 decrement where the compute after the read is a multi-step pricing calculation, or any
 place where a failed optimistic attempt would mean discarding seconds of work. The middle
 case is the one most teams actually have, and the right answer for it is usually neither
 — restructure so that the contended operation is a single atomic statement
 (`UPDATE stock SET n = n - 1 WHERE id = ? AND n >= 1`, checking the affected-row count),
 which is neither an optimistic nor a pessimistic strategy but strictly better than both.

> **SCALING REALITY CHECK**
>
> Optimistic concurrency degrades non-linearly and then falls off a cliff, and the shape is
> worth being able to describe because it looks like a mystery. With a small number of
> contenders, the failure probability per attempt is low and the expected attempts per
> success is close to 1. As contenders on the same row increase, attempts per success
> approaches the number of contenders — *N* writers on one row means on average *N*/2
> attempts per success, and each failed attempt is a full transaction that did real work and
> was rolled back. Beyond roughly a handful of genuinely concurrent writers on a single
> row, the wasted work itself becomes the load, and the system spends most of its capacity
> on rollbacks. The cliff is where a hot counter or a hot status row has a write
> amplification that grows with contention. The fix is never a better retry loop; it is to
> remove the contention — partition the counter, take the contended update out of the
> critical section, or design the workflow so that N writers do not all need the same row.

#### Common Mistakes

- Assuming a version column on the entity means optimistic locking is in place, when the
  generated SQL may not include the version in the `WHERE` clause at all
- Putting the version check in the `WHERE` clause of an `UPDATE` identified by a non-unique
  predicate, which makes it neither a correct check nor a safe write
- Writing a retry loop that reuses the value from the failed attempt's read, which is not a
  retry — the read must be inside the loop
- Adding exponential backoff without jitter, which converts a brief outage into a
> synchronised retry storm that prolongs it
- Using plain `FOR UPDATE` for a queue worker and thereby serialising eight workers behind
  whichever one holds the head-of-queue lock
- Using `FOR UPDATE` on a frequently-referenced parent row and thereby blocking all
  concurrent foreign-key checks from the child table, when `FOR NO KEY UPDATE` would not
- Retrying a permanent failure — a validation error, a deserialization exception — because
  it is in a retry loop, and burning a connection on every attempt
- Choosing pessimistic locking without asking what the conflict rate actually is, which is
  measurable and frequently low enough that a single atomic statement is the right answer

#### Interview Questions — Optimistic vs Pessimistic

**Q1. Compare optimistic and pessimistic concurrency control. When is each right?** `STAFF`

Both detect the same condition — someone else changed the data between your read and your
write — by assuming opposite things about the world. Pessimistic takes a lock before
reading, so the read and the write are indivisible with respect to other writers; the cost
is paid by the *other* transaction, which waits, and that wait happens even when no conflict
would have occurred. Optimistic reads freely, computes the intended change, and detects the
conflict at write time via a version column in the `WHERE` clause returning zero affected
rows; the cost is paid by *you*, as a discarded transaction plus a retry. Optimistic is
right when conflicts are rare and reads dominate — most web CRUD — because it has no
lock-holding time, no lock-table pressure, and no deadlocks. Pessimistic is right when
conflicts are frequent and the work per attempt is expensive, or when correctness demands
that you see the latest committed value before deciding: a claim-the-next-job queue, an
inventory decrement, a pricing calculation. The honest third answer, which is usually the
right one for the middle case, is neither: restructure the contended operation into a
single atomic conditional statement and check the affected-row count, which removes the
read-decide-write window entirely.

**Q2. A team added a version column. Enumerate the ways the optimistic locking can still
be broken.** `ADVANCED`

Because the protection is a property of the SQL that reaches the database, not of the
schema. (1) The ORM generates `UPDATE ... WHERE id = ?` from dirty checking and omits the
version predicate, so the column exists and does nothing. (2) A hand-written or native
query omits it. (3) A bulk statement — `UPDATE products SET price = price * 1.1 WHERE
category = 'A'` — has no version predicate by construction and silently overwrites
concurrent changes to every matching row. (4) The version check and the increment are
split across two statements, or the version is re-read between the check and the write, so
the check has been defeated. (5) The entity is read through a cache and the version comes
from a stale cache entry, so the `WHERE` clause carries a version that is arbitrarily old
and the update always fails — which presents as "optimistic locking broke under load"
rather than as a correctness hole, and is the most confusing of the five. The audit that
catches all of them is a single grep for every `UPDATE` and `DELETE` against the table,
confirming each either checks the version or is a documented exception.

**Q3. Eight workers consume from one queue with `SELECT ... LIMIT 1 FOR UPDATE`. What
happens, and what is the fix?** `TRICKY`

They behave as one worker. The first worker takes an exclusive lock on the head-of-queue
row; the other seven block on that same row rather than proceeding to the next one, so the
queue drains at the speed of a single consumer with seven idle processes behind it. This is
strictly worse than having one worker, because the serialisation point is nondeterministic
and you pay seven blocked connections to get it. The fix is `FOR UPDATE SKIP LOCKED`, which
tells the engine to skip rows that are already locked and return the next available one, so
each worker gets a distinct row and the queue drains in parallel. Two operational notes
that matter: a row that is skipped is not lost — whoever holds it will commit or roll back,
and the next loop iteration will find it — but if a consumer crashes while holding a lock,
the row is invisible to `SKIP LOCKED` consumers until the lock is released, so a bounded
`lock_timeout` on the consumer connection is the safety net. And the `SKIP LOCKED` version
can have a materially different plan, because the engine is now racing other consumers for
the same rows.

**Q4. A poison message is stalling a queue. Consumer lag is 400,000 and climbing. Walk me
through the failure and the fix.** `SCENARIO`

The message is permanently unprocessable — a malformed payload, or a validation error that
will never pass — and the consumer is retrying it forever. Because the queue is ordered and
the number of consumers is bounded, that message is head-of-line blocking everything behind
it, so a topic that is 99.99% healthy delivers nothing. Compounding it, each retry holds a
database connection for the duration and hits the exact downstream that is already failing,
so the retry loop is a self-inflicted load amplifier; and if the failure is eventually
*transient* — the SKU restocks, the dependency recovers — the message succeeds hours late
and produces a business outcome nobody wants, with no record that it was late. The fix has
three parts, all required: classify failures so permanent errors go straight to a
dead-letter queue instead of consuming the retry budget; bound the retries with capped
exponential backoff and **full jitter**, and move the message to the DLQ after a finite
number of attempts; and make the handler idempotent with a message key written in the same
transaction as the business effect, so at-least-once redelivery is a no-op. The DLQ itself
needs an alert and a replay tool, or it is just a slower data-loss queue.

**Q5. When should you add a retry for a `40001` or a deadlock, and what is the correct
shape of that retry?** `ADVANCED`

Retry is correct for exactly two SQLSTATEs — `40001` serialization failure and `40P01`
deadlock detected — because both are the engine's *correct* verdict that this transaction's
execution was invalidated by a concurrent one, and both are eliminated by running again
against fresher state. The correct shape has four properties, and each one that is missing
turns a resilience mechanism into an incident. Bounded attempts, because an unbounded retry
holds a connection and a snapshot indefinitely — and under PostgreSQL's `REPEATABLE READ`
or `SERIALIZABLE` it also holds back the vacuum horizon, so an unbounded retry loop is the
long-running transaction from the MVCC chapter in disguise. Exponential backoff with a cap,
so a burst of contention does not immediately re-collide. **Full jitter**, uniformly
distributed over `[0, cap]` rather than exactly `cap` — this is the load-bearing part, and
without it every transaction that failed at the same instant retries at the same instant,
which turns a brief serialization burst into a synchronised storm. And the whole
transaction, not just the failing statement, must be re-run from the beginning, with fresh
data — a retry that resumes mid-way has already discarded the read whose snapshot made it
invalid.

> **CHAPTER 6 SUMMARY**
>
> Pessimistic locking moves the cost of concurrency onto the transaction that arrives
> second, which is paid whether or not a conflict ever occurs; optimistic locking moves it
> onto the failing transaction, which is paid only when there is a conflict. That single
> difference predicts everything else — lock-table pressure, deadlock exposure, latency
> distribution, and whether you need a retry loop at all. Optimistic locking's protection
> lives in the SQL that reaches the database, not in the schema, so a version column on an
> entity whose ORM does not emit the version predicate buys nothing, and the audit is a grep
> for every statement that writes the table. Pessimistic locking's most important clause is
> `SKIP LOCKED`, without which N queue workers are one worker with N−1 blocked connections;
> and its most useful refinement is `FOR NO KEY UPDATE`, which avoids blocking foreign-key
> checks that a plain `FOR UPDATE` would conflict with. The failure mode that catches both
> teams is the retry loop: unbounded, unjittered, and retrying permanent failures, which is
> how a resilience mechanism becomes the outage it was built to prevent.

#### Further Reading

- [PostgreSQL — Locking Rows](https://www.postgresql.org/docs/current/sql-select.html#SQL-FOR-UPDATE-SHARE) — the exact semantics of `FOR UPDATE`, `FOR NO KEY UPDATE`, `FOR SHARE` and `SKIP LOCKED`, including the `READ COMMITTED` re-read rule.
- [Jakarta Persistence — `LockModeType`](https://jakarta.ee/specifications/persistence/3.1/apidocs/jakarta/persistence/LockModeType.html) — the specification-level definition, for the question of whether the ORM is emitting the version predicate at all.
- [AWS Architecture Blog — Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/) — the definitive treatment of why unjittered backoff is a synchronised thundering herd.
- [PostgreSQL — Detecting and Handling Lock Conflicts](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS) — deadlock detection, victim selection, and the retry obligation it places on the application.

## Chapter 7 — Deadlocks

### 7.1 A Deadlock Is a Cycle, and That Is the Whole Definition

A deadlock is two or more transactions each waiting for a resource the other holds, with
no possibility of progress. It is not a mysterious failure; it is a directed cycle in a
graph, and it is detected the way any cycle is detected — by walking the graph looking for
a path back to the starting node.

```text
  THE MINIMAL DEADLOCK, DRAWN
  ──────────────────────────────────────────────────────────────────
   T1: BEGIN
   T1: UPDATE account SET balance = 900  WHERE id = 1;   -- holds X on row 1
   T1:
   T2: BEGIN
   T2: UPDATE account SET balance = 900  WHERE id = 2;   -- holds X on row 2
   T2:
   T1: UPDATE account SET balance = 1100 WHERE id = 2;   -- wants X on row 2
   T1:   → BLOCKED. T2 holds row 2.
   T1:
   T2: UPDATE account SET balance = 1100 WHERE id = 1;   -- wants X on row 1
   T2:   → BLOCKED. T1 holds row 1.
   T2:
   T1:   waiting for T2 ─────────┐
   T2:   waiting for T1 ─────────┴──► CYCLE. No transaction can proceed.
                                    Neither can commit (both hold uncommitted
                                    changes). Neither can roll back (they are
                                    not told to). The engine must intervene.
  ──────────────────────────────────────────────────────────────────
  The engine's intervention: pick a VICTIM, abort it, and tell the
  application. PostgreSQL: SQLSTATE 40P01, "deadlock detected".
  MySQL: error 1213, "Deadlock found when trying to restart transaction".

  The intervention is the *only* way out. There is no timeout that
  resolves this — both transactions are waiting for each other, not for
  a resource that will be released. This is why deadlock cannot be
  "fixed with a shorter lock timeout", and it is why a deadlock victim
  must be told, so it can roll back and try again.
```

The two preconditions are worth stating as a checklist, because every deadlock in a
codebase can be traced to one of them:

1. **Two or more rows (or other lockable resources) are acquired in a mutually overlapping
   set.** If T1 only ever locks row 1 and T2 only ever locks row 2, no cycle is possible.
2. **The acquisition order differs between the two transactions.** If both ordered their
   locks by a global key — always the lower id first — a cycle is *structurally
   impossible*, because the wait-for graph becomes a forest.

Everything else in this chapter is the engineering answer to "these two things are true
and I cannot change the schema."

### 7.2 The Wait-For Graph

The standard formalism, worth being able to draw because it makes the "cycle" claim
precise and it is how the detection actually works.

```text
  NODES:  transactions
  EDGES:  T1 → T2 means "T1 is waiting for a resource held by T2"

  A DEADLOCK EXISTS IFF THE GRAPH CONTAINS A CYCLE.

  From the timeline above:

        ┌────────────────┐
        │                │
        ▼                │
       T1 ──────────►  T2
        ▲                │
        └────────────────┘

  Deadlock. Both T1 and T2 are reachable from themselves.

  NO cycle — just waiting, which is contention, not deadlock:

        T1 ──────────►  T2          T1 wants something T2 has.
                                   T2 is not waiting for anything.
                                   This is normal and resolves when
                                   T2 commits. It is a LOCK WAIT.
                                   Calling this a deadlock is the most
                                   common misuse of the word.
  ───────────────────────────────────────────────────────────────────
  Also legal in the graph, and worth recognising:

        T1 ──► T2 ──► T3 ──► T1        a three-way cycle. More common
                                     than people expect under load.

        T1 ──► T2                       self-deadlock: T1 holds a lock
        T1 ──► T1                       through two different code paths
                                     in the SAME transaction — a row
                                     locked FOR UPDATE, then the same
                                     row updated again through a
                                     different statement or a different
                                     ORM flush. Not a concurrency bug
                                     at all; a logic bug.
```

The distinction in the boxed section is the most practically valuable thing in this
chapter. **A lock wait is one transaction waiting for another that is making progress. A
deadlock is a cycle in which nothing is making progress.** They have completely different
causes, completely different fixes, and confusing them is how teams end up adding
timeouts to a problem that needs ordering.

Detection is a graph traversal: the engine maintains the wait-for edges (which, in
PostgreSQL, is the `pg_locks` relation plus the backend's own `pg_blocking_pids`, and in
InnoDB is the internal lock graph maintained by the lock manager) and periodically checks
whether a new edge would close a cycle. PostgreSQL's `deadlock_timeout` (default 1s)
controls how often it runs the check — which is why *lowering* it to catch deadlocks faster
just burns CPU on graph walks, and why *raising* it does not make deadlocks go away.

### 7.3 Prevention: Ordering, One Row, and Structure

The three prevention techniques, in order of preference. Global ordering is the one to
reach for, because it is the only one that makes the bug *impossible* rather than *less
likely*.

**Technique 1 — a global lock order.** If every transaction acquires its locks in the same
total order, no cycle can form. This is a *code* convention, and it is enforceable.

```text
  WITHOUT ORDERING (the bug)                    WITH ORDERING (the fix)
  ─────────────────────────                     ──────────────────────
   T1: lock id=1, then id=2                      T1: lock id=1, then id=2
   T2: lock id=2, then id=1                      T2: lock id=1, then id=2
        ▲                                              ▲
        └── CYCLE → DEADLOCK                        └── T2 waits at the FIRST
                                                       lock, T1 completes, no
                                                       cycle ever forms
  ─────────────────────────────────────────────────────────────────────
  The rule: "sort the ids being locked ASCENDING and lock them in that
  order." It is one line of code and it eliminates the entire class of
  two-transaction deadlocks on that data.

  Applies to: batch operations, multi-row updates, "process this set of
  items" loops, anything that acquires more than one lock.
```

```java
// The fix, concretely. This is the shape of almost every
// "process a batch of items" method in a codebase.
@Transactional
public void applyBatch(Collection<Long> itemIds) {
    List<Long> ordered = itemIds.stream().distinct().sorted().toList();
    for (Long id : ordered) {
        repository.lockById(id);      // SELECT ... FOR UPDATE
        processor.process(id);
    }
    // Every batch job in the system does this in the same order, so
    // no two of them can ever build a cycle.
}
```

**Technique 2 — single-row transactions.** If each unit of work touches exactly one row
and commits immediately, there is no second lock to form a cycle with. This is the right
answer for a high-throughput counter or a work queue, and it is why the `SKIP LOCKED` claim
pattern in Chapter 6 is deadlock-resistant: each worker locks one row, does its work, and
commits, so the lock graph is a set of isolated nodes rather than a web.

```sql
-- Before: a transaction that locks N rows and holds them across
--          application logic. N−1 additional deadlock opportunities.
-- After:  N independent single-row transactions. Zero opportunities,
--         at the cost of losing atomicity across the batch — which is
--         correct ONLY if the items are genuinely independent.
BEGIN;  -- per item
  SELECT * FROM jobs WHERE id = ? FOR UPDATE SKIP LOCKED;
  UPDATE jobs SET status = 'RUNNING' WHERE id = ?;
COMMIT;
```

**Technique 3 — reduce the lock surface.** The third technique is the one that is easiest
to reach for and most often misapplied. Every lock is an edge in the wait-for graph, so
removing locks removes cycles. The high-value moves:

- **Do the minimum.** Do not `SELECT * FOR UPDATE` when you need two columns; the lock is
  the same, but the temptation to use the data you fetched is a coupling you did not need.
- **Do not lock what you will not write.** A common and entirely unnecessary pattern is
  locking a parent row to "read it consistently" before a child-only insert. In PostgreSQL
  a plain read at `REPEATABLE READ` already gives you that, with no lock and no edge.
- **Do not hold a lock across a remote call.** A `SELECT ... FOR UPDATE` followed by an
  HTTP request to a payment gateway holds a row lock for the duration of a network call to
  a third party. That is the single most common cause of deadlock escalation in a
  microservices codebase, and the fix is architectural: do not call out while holding
  database locks, and if you must, use a saga step with the lock released between them.
- **Batch in a deterministic order.** A `DELETE ... WHERE id IN (...)` over an unordered
  set is a deadlock generator; the engine may lock the rows in index order or in plan
  order, and two such statements with different plans interleave. Sorting the id list
  before the statement forces the order.

> **INTERVIEW TRAP — "HOW DO YOU FIX DEADLOCKS?"**
>
> The trap answer is "retry on failure" or "lower the lock timeout", and both are wrong in
> a way that matters, because they treat the symptom and make the real problem harder to
> see. Lowering the lock timeout does not resolve a deadlock at all — a deadlock is a cycle
> in which *no* transaction is making progress, so there is no timeout that can break it;
> the engine must abort a victim, and that is what it already does. And retrying without
> fixing the ordering produces a system that deadlocks *more* often under load, because the
> retries add load to the exact contention that caused the deadlock, and the transactions
> that retry are back at the lock-order lottery sooner.
>
> The senior answer is: **a deadlock is a symptom of inconsistent lock ordering, and the
> fix is to make the ordering consistent.** Enumerate the rows or resources each transaction
> acquires, and the order it acquires them in; find two transactions whose sets overlap and
> whose orders differ; apply a global total order (sort the ids ascending) to every
> multi-lock path. That eliminates the class of bug rather than sampling from it. Then
> *additionally* implement a bounded, jittered retry — because even with perfect ordering,
> a self-deadlock from a code path that locks the same row twice, or a
> three-way cycle you did not enumerate, will still occur, and the retry is what makes
> those survivable rather than user-visible. The ordering is the fix; the retry is the
> seatbelt. Confusing the two is the mistake.

### 7.4 Detection and Victim Selection

If the deadlock is not prevented, the engine must break it, and the mechanism is
detection plus abort.

```text
  1. DETECT.  The engine maintains a wait-for graph. On a lock request
     that would block, it checks whether the requester's chain of
     waiters already reaches the resource holder — and therefore whether
     the new edge closes a cycle. PostgreSQL: `deadlock_timeout`
     (default 1s) between checks. InnoDB: continuous, in the lock
     manager itself, which is why InnoDB detects faster.

  2. CHOOSE A VICTIM.  Not random. The usual policy picks the
     transaction with the LEAST work done so far, on the reasoning that
     redoing it is cheapest. This is why the victim in a production
     deadlock is often not the transaction you would have guessed —
     it is the one that happened to be younger.

  3. ABORT THE VICTIM.  Roll it back, release all its locks, and
     return SQLSTATE 40P01 (PostgreSQL) or error 1213 (MySQL) to
     the application.

  4. THE APPLICATION MUST ACT.  If the code catches the exception and
     continues, it will commit a partial result — which is a
     correctness bug far worse than the deadlock. It must roll back
     and retry the whole transaction.
  ───────────────────────────────────────────────────────────────────
  THE HAZARD, AND IT IS SERIOUS: a victim is chosen based on the
  transaction's history so far, but InnoDB's rollback of a large
  transaction is expensive, and the victim is not necessarily the one
  that will finish soonest. Under sustained deadlock pressure, the
  engine spends a large fraction of its time rolling back victims
  that were nearly done. This is the "cascading failure" of deadlock
  handling: the retry that unwinds the deadlock re-enters the same
  contention, and the cycle repeats with the transaction's work
  multiplied by the number of attempts. If you see deadlock RATE —
  not count, rate — climbing with load, the answer is never a faster
  retry. It is fewer and consistently ordered locks.
```

### 7.5 The Operational Shape

How a deadlock actually presents, and the diagnostic path. This is worth having in the
runbook because the reported symptom is never the real one.

```sql
-- PostgreSQL: the last deadlock, with both parties and their queries.
-- log_lock_waits must be on for this to be recorded; by default a
-- deadlock detail line goes to the server log only, at log level
-- DEADLOCK, and most production configurations lose it.
SELECT pid, locktype, relation::regclass, page, tuple,
       transactionid, mode, granted
  FROM pg_locks WHERE NOT granted;

-- The permanent, always-available record: this table survives the
-- incident and is the one to build a dashboard from.
SELECT deadlocks, deadlocks_timed_out FROM pg_stat_database WHERE datname = current_database();
-- PostgreSQL 14+ splits this further:
SELECT * FROM pg_stat_database WHERE datname = current_database();
--   deadlocks             — detected and resolved by aborting a victim
--   deadlock_timeouts     — resolved by a victim timing out (older versions)
-- In MySQL: SHOW ENGINE INNODB STATUS, section "LATEST DETECTED DEADLOCK",
-- which is overwritten by the next one — it is a "latest", not a history.
```

The two operational facts that cause most of the lost time:

- **The details of a detected deadlock are transient.** In MySQL they are written to the
  InnoDB status buffer and *overwritten by the next deadlock*, so an investigation started
  ten minutes late has no data. In PostgreSQL the detail goes to the server log, which many
  deployments at `log_min_messages = warning` or with statement logging turned down do not
  retain. **Instrument before you need it** — that means `log_lock_waits = on` and
  `deadlock_timeout` left at a value that logs, plus an alerting rule on the
  `deadlocks` counter — because the alternative is reconstructing the cycle from
  application logs, which is possible and miserable.
- **The deadlock count is not the metric; the rate is.** A constant low rate is background
  noise that a well-written retry loop absorbs invisibly. A rate that climbs with load
  means the ordering problem is getting worse and the retries are contributing to it, and
  that is the signal to stop adding retries and go fix the ordering.

> **PRODUCTION SCENARIO**
>
> Problem: over six months, the checkout service's error rate crept from 0.01% to 0.4%.
> Every error is a 500 with a deadlock message. There is no traffic spike, no deploy, and
> no dependency change. Latency p50 is unchanged; p99 has doubled. The team's first
> instinct is to add retries, and two engineers spend a week adding a bounded, jittered
> retry loop — which reduces the user-visible error rate to 0.02% and makes p99 *worse*.
> Investigation: the deadlock counter in `pg_stat_database` has grown steadily and its
> rate tracks peak traffic. Reading the server log's `deadlock` lines, every single cycle
> involves exactly two statements: an `UPDATE inventory` and an `INSERT INTO fulfilment`,
> in opposite orders.
> Root cause: the fulfilment service acquires the inventory row lock first and then
> inserts the fulfilment row; the checkout service inserts the fulfilment row first and
> then decrements inventory. Two code paths, one shared pair of tables, opposite
> acquisition order. The two engineers' retry loop did not address the cause — it converted
> a cycle into a longer queue for the same locks, which is why p99 got worse and why the
> error rate only improved.
> Solution: define a global lock order (inventory before fulfilment) and enforce it in
> both code paths. Once both acquire in the same order, the cycle is structurally
> impossible and the deadlock rate drops to zero. The retry loop stays in place, because a
> self-deadlock from a path that locks the same row twice will still occur occasionally and
> the retry makes that survivable.
> Prevention: the retry loop was correct to add and wrong to rely on. The real prevention is
> an integration test that runs the two paths concurrently, which is the only kind of test
> that could ever have caught this — a sequential test passes. Add a deadlock-rate alert,
> and a review rule that any transaction acquiring more than one lock must sort its keys.

> **STAFF-LEVEL CONSIDERATION**
>
> The organisational question behind deadlocks is *who owns the lock order*. If two
> different services — or two different teams inside one service — write to overlapping
> tables, the lock order is a contract between them and there is nowhere in the codebase
> that records it. The cheap artefact is a short document naming the tables and the canonical
> acquisition order, kept next to the schema, plus one integration test that runs the two
> paths concurrently and asserts no deadlock within a bounded number of iterations. The
> more expensive and more durable answer is a shared-data-access layer that owns the
> ordering, so the contract is enforced by construction rather than by convention. Both are
> worth raising, because the first time this is discovered is always during an incident,
> and the second time is during an incident that the first fix did not cover.

#### Common Mistakes

- Describing a deadlock as a timeout or a slow query, when it is a cycle in which no
  transaction is making progress and no timeout can resolve it
- Treating a deadlock victim as the culprit, when the victim is chosen by the engine's
  work-done heuristic and is frequently the transaction that was *nearly finished*
- Adding retries as the fix and thereby increasing load on the contention that caused the
  deadlock, making p99 worse while making the error count look better
- Assuming InnoDB's next-key locks are the cause, when gap locks and record locks held in
  different orders are the mechanism and the cause is always the ordering
- Not knowing that a self-deadlock — one transaction waiting on a lock it already holds via
> a different code path — is a logic bug rather than a concurrency bug
- Relying on a shorter `lock_timeout` to break deadlocks, when it only affects ordinary
> waits and leaves the deadlock path entirely to the victim's own timeout
- Treating a constant low deadlock rate as a problem to fix, rather than as background noise
  a correct retry loop absorbs — the *rate* is the metric, and a rate that tracks load is
  the signal that the ordering is wrong

#### Interview Questions — Deadlocks

**Q1. What exactly is a deadlock, and how does the engine detect one?** `STAFF`

A deadlock is a cycle in a wait-for graph whose nodes are transactions and whose edges mean
"this transaction is waiting for a resource that transaction holds." If any transaction is
reachable from itself, no progress is possible, and no timeout can fix it because every
participant is waiting rather than executing — so the engine must intervene. Detection works
by maintaining that graph as edges are added: when a lock request would block, the engine
walks the requester's chain of waiters to see whether the resource holder is already
downstream, which would close a cycle. It then picks a victim — usually the transaction
with the least work done, so redoing it is cheapest — aborts it, releases its locks, and
returns an error (`40P01` in PostgreSQL, error 1213 in InnoDB). The application must then
roll back and retry the *whole* transaction, and a code path that catches the error and
continues will commit a partial result, which is a much worse failure than the deadlock. The
distinction worth volunteering is between a deadlock and a lock wait: a wait is one
transaction waiting for another that is making progress, and it is normal.

**Q2. Two services deadlock on each other. Both wrote working code. What is the fix?**
`TRICKY`

Neither service's code is wrong in isolation — each acquires its locks in an order that is
locally reasonable, and they disagree. The fix is a **global lock order** agreed between
them: define a total order over the shared tables (say, always `inventory` before
`fulfilment`), and make both code paths sort their lock keys and acquire in that order. With
a consistent total order the wait-for graph is a forest and a cycle is structurally
impossible, which is the property you want — not a lower probability. Concretely: sort the
id list ascending before a batch update, and document the table order in the schema
repository. Add a bounded, jittered retry afterwards, not instead: even with correct
ordering, a self-deadlock from a code path that locks the same row twice, or a three-way
cycle nobody enumerated, will still occur occasionally and the retry is what makes those
survivable. The retry is the seatbelt; the ordering is the fix, and adding the retry first
and measuring p99 getting worse is the predictable outcome of doing them in the wrong
order.

**Q3. Your deadlock rate is climbing with traffic load. What is happening, and what
should you change?** `ADVANCED`

Three things, in order of likelihood. First, the underlying ordering problem is real and
getting worse as more transactions overlap in time — the rate tracking load is the signature
of a latent cycle rather than a fixed one, because with few overlapping transactions the
opposite orderings rarely coincide. Second, and compounding it, retries are amplifying the
contention: each retried transaction re-enters the same lock-order lottery sooner, with
full transaction cost, so a small increase in overlapping transactions produces a
disproportionate increase in deadlocks. Third, the victim-selection policy may be thrashing
— the engine picks the least-worked transaction, and if that is frequently a large
transaction, a meaningful fraction of throughput is being spent on rollbacks that go
nowhere. The changes to make, in order: enumerate the lock-acquisition order of every
transaction touching the contended tables and impose a global total order, which removes
the class of bug; *then* keep a bounded, jittered retry for the residue; and *then*
investigate whether the contended locks can be reduced at all — a lock held across a
remote HTTP call, or a `SELECT * FOR UPDATE` on a parent row that blocks concurrent
foreign-key checks, both add edges to the graph that no amount of ordering discipline
requires you to have.

**Q4. What is a self-deadlock, and is it a concurrency bug?** `TRICKY`

A self-deadlock is a transaction that ends up waiting for a lock it already holds, which
can only happen through two different code paths in the same transaction touching the same
row — for example, a `SELECT ... FOR UPDATE` on a row and then a later statement (or an ORM
flush, or a trigger, or a `SELECT ... FOR UPDATE` on a different row that the engine's join
order causes to touch the first) that reaches the same row again. It is not a concurrency
bug: no other transaction is involved, it reproduces deterministically on a single thread,
and it is a logic error in the transaction's own structure. The tell is that it happens
*immediately* on every run under any load, which a real concurrency deadlock does not. The
fix is to audit the transaction's own lock acquisitions and consolidate them — take each
lock once, up front, in a defined order, rather than acquiring them as control flow
happens to reach them. A related self-deadlock in InnoDB is a gap-lock upgrade: a
transaction that took a shared gap lock via a locking read and then attempts an update that
needs an exclusive lock on the same gap, which is a classic and is usually resolved by
narrowing the query so it touches a record rather than a range.

**Q5. Your deadlock investigation starts after the incident. What data do you have?**
`STAFF`

Less than you need, and that is the point to make. In MySQL, the full details of the last
detected deadlock live in the InnoDB status buffer and are *overwritten by the next
deadlock* — there is no history. Ten minutes after the incident, there is nothing. In
PostgreSQL, the detail is written to the server log at `log_level = DEADLOCK`, which many
production configurations do not retain, and the permanent record is only the counter in
`pg_stat_database.deadlocks`. So the investigation becomes: read the counter to confirm it
was a deadlock and to see the rate, then reconstruct the cycle from application logs, which
is possible and miserable. The prevention is instrumentation done *before* it is needed —
`log_lock_waits = on` in PostgreSQL, a log shipping or `systemd` journal retention policy
that keeps the server log, an alerting rule on the deadlock counter, and in MySQL a
mechanism to snapshot the InnoDB status on detection. The metric to alert on is the *rate*,
not the count: a constant low rate is background noise a correct retry loop absorbs, and a
rate that tracks traffic is the signal that the lock ordering is wrong and needs fixing
rather than retrying.

> **CHAPTER 7 SUMMARY**
>
> A deadlock is a cycle in a wait-for graph — a structural fact, not a timing fluke — and
> the only way out of one is for the engine to abort a victim, because no timeout can break
> a cycle in which every participant is waiting rather than executing. The practical
> consequence is that a deadlock is a *symptom* of inconsistent lock acquisition order, and
> the fix is a global total order over the contended resources so that a cycle becomes
> structurally impossible; a bounded, jittered retry is the seatbelt that makes the residue
> survivable, and adding it first is measurably counterproductive because the retries add
> load to the contention that caused the deadlock. Distinguishing a deadlock from a lock
> wait is the first diagnostic step and the most commonly confused: one is a cycle with no
> progress, the other is normal contention. A self-deadlock is neither — it is a logic bug
> in a single transaction's own lock acquisitions, and it reproduces deterministically. And
> the lock graph can be attacked directly, because every lock is an edge in it: a lock held
> across a remote HTTP call, or a plain `FOR UPDATE` on a frequently-referenced parent row
> that blocks concurrent foreign-key checks, are edges nobody needs to have.

#### Further Reading

- [PostgreSQL — Deadlocks](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-DEADLOCKS) — the official statement that a deadlock is a cycle, and that the application must retry.
- [MySQL — InnoDB Deadlocks](https://dev.mysql.com/doc/refman/8.0/en/innodb-deadlocks.html) — including the warning that the status buffer holds only the *latest* detected deadlock, which is why instrumentation must precede the incident.
- [PostgreSQL — `pg_locks`](https://www.postgresql.org/docs/current/view-pg-locks.html) — the view to build a blocking dashboard from, since the per-deadlock detail in the log does not survive.
- [Jepsen — Analyses](https://jepsen.io/analyses/) — several published analyses whose root causes are lock-ordering problems, which is the most persuasive argument for the ordering discipline.

## Chapter 8 — Distributed Transactions & the Boundaries

### 8.1 Where ACID Stops Being a Property of Anything

A local transaction is atomic, consistent, isolated and durable because a single process
owns a single log and can abort any participant unilaterally. Distributed transactions exist
precisely to preserve that property across processes that do not share a log and cannot
abort each other — and that requirement is where the difficulty lives.

```text
  WHAT A LOCAL TRANSACTION RELIES ON
  ─────────────────────────────────────────────────────────────────
  1. A SINGLE LOG. Every change is in one sequence. A commit is one
     record. Atomicity is a property of a single ordered structure.

  2. A SINGLE ABORT AUTHORITY. The transaction can decide unilaterally:
     "I am rolling back." Nobody else needs to agree.

  3. A SYNCHRONOUS, RELIABLE RESOURCE. The disk is in the same building.
     Its failure modes are fsync timeouts, not network partitions.

  4. NO PARTIAL VISIBILITY. Before commit, nobody sees anything. After
     commit, everybody sees everything. There is no third state.

  ─────────────────────────────────────────────────────────────────
  Every one of those four assumptions fails the moment the second write
  goes to a different process. Distributed transaction protocols exist to
  reconstruct them — and each reconstruction costs something.
  ─────────────────────────────────────────────────────────────────
```

The alternatives to a distributed transaction are not "no transactions"; they are
*weaker but honest* guarantees. Naming the exact guarantee you are choosing over ACID is
the entire content of a design review on this topic, and the most common failure is a team
deploying a saga and describing it as "eventually consistent", which tells a reader nothing
about what a user can observe.

### 8.2 Two-Phase Commit and Its Blocking Failure Mode

2PC is the protocol that actually extends ACID across processes, and its failure mode is
the reason it is nearly absent from modern service architectures.

```text
  THE PROTOCOL
  ──────────────────────────────────────────────────────────────────
  PHASE 1 — PREPARE ("vote")
  ──────────────────────────────────────────────────────────────────
   Coordinator  Participant A      Participant B
       │              │                  │
       │── PREPARE ──►│                  │
       │              │ commit or        │
       │              │ abort the        │
       │              │ transaction to   │
       │              │ its own log,     │
       │              │ durably, and     │
       │              │ report YES/NO    │
       │◄── YES ──────│                  │
       │── PREPARE ─────────────────────►│
       │◄── YES ─────────────────────────│
       │
       │  ! AT THIS MOMENT BOTH PARTICIPANTS HAVE COMMITTED TO THEIR
       │    OWN LOGS AND CANNOT UNDO IT. They are in-doubt: they have
       │    promised but do not know whether the promise is kept.
       │
  PHASE 2 — COMMIT (or ABORT)
  ──────────────────────────────────────────────────────────────────
       │── COMMIT ──►│                  │   (or ABORT, if any vote was NO)
       │── COMMIT ─────────────────────►│
       │              │ now and only now do the participants
       │              │ make their prepared state final
  ──────────────────────────────────────────────────────────────────

  THE FAILURE THAT MATTERS
  ──────────────────────────────────────────────────────────────────
       │── PREPARE ──►│────►│
       │              │     ✗ COORDINATOR DIES HERE
       │◄── YES ──────│     │
       │              │     │  A: prepared, promised, cannot proceed
       │              │     │  B: prepared, promised, cannot proceed
       │              │     │  Neither knows if the transaction
       │              │     │  committed. Neither can unilaterally
       │              │     │  abort — they already promised.
       │              │     │
       │              │     ▼
       │              │  BOTH ARE BLOCKED INDEFINITELY.
       │              │  Every subsequent transaction on A and on B
       │              │  that touches the same resources is blocked
       │              │  behind them. Two participants in-doubt is a
       │              │  partial outage of BOTH services.
  ──────────────────────────────────────────────────────────────────
  This is the blocking failure mode of 2PC. It is not a rare edge case:
  it is what happens every time the coordinator dies between the two
  phases, and a coordinator is a single process that can be OOM-killed,
  evicted, or fail its health check. Recovery is possible — the
  coordinator's own durable log is consulted once it restarts, or a new
  coordinator is elected with a recovery protocol — but the participants
  are unavailable for the duration, and in the general case that duration
  is bounded only by the recovery procedure.
```

The property that makes this unfixable within the protocol is worth stating carefully,
because it is the load-bearing insight: **2PC requires participants to be able to
*remember* a decision they were not told.** A participant that has voted yes has
durably promised. It cannot safely abort, because the coordinator may already have told
other participants "commit". So it must wait. This is why the protocol is called
*blocking* two-phase commit, and it is why the assumption it makes — that the coordinator
is more reliable than the participants — is exactly the assumption that does not hold in a
system where every service is equally likely to be an autoscaling group that gets
terminated.

> **INTERVIEW TRAP — "WHY DOESN'T EVERYONE JUST USE 2PC?"**
>
> Because of the blocking failure mode, and the reason is structural rather than a matter
> of implementation quality. In 2PC's prepare phase, a participant that votes yes has
> **durably promised** to commit. It then cannot abort unilaterally, because the coordinator
> may have already told other participants "commit" — so it must wait for the decision. If
> the coordinator dies between prepare and commit, every participant is *in-doubt*: it
> cannot proceed and it cannot roll back, so it holds its locks, and every subsequent
> transaction on those resources is blocked behind it. Two services are now partially
> unavailable, and the only thing that resolves it is a recovery protocol on the
> coordinator's side, which may be a process that no longer exists.
>
> The second reason, which is the one that usually decides it in a microservices codebase,
> is **the assumption the protocol makes is inverted by the architecture**. 2PC assumes the
> coordinator is more reliable than the participants — which was true when the coordinator
> was a Transaction Manager on a node that nothing else scaled. In a containerised
> platform every service is an autoscaling group subject to OOM-kill, node draining, and
> rolling deploys, and the coordinator has exactly the same failure probability as
> everyone else. Add a network partition — which a distributed system has by definition and
> a monolith does not — and the coordinator is *unreachable* rather than dead, which is
> strictly worse: nobody can tell whether it is preparing, committing, or gone.
>
> The honest conclusion is not "2PC is impossible" but "2PC requires you to trust a single
> component more than your architecture allows you to trust anything, and to accept a
> blocking failure mode in exchange for a guarantee you can usually get more cheaply." That
> is what the outbox, idempotency and at-least-once delivery replace, and what the
> Microservices Volume 2, Chapters 2, 6 and 7 develop properly.

### 8.3 XA: The Same Protocol, With the Transaction Manager Back

XA is 2PC with an extra layer: a transaction manager sits between the application and the
resources, so the application talks to the TM and the TM speaks XA to each resource. It
is a real protocol with a real specification (`X/Open XA`) and it is what a JTA
implementation such as Atomikos or Narayana uses.

```text
  APPLICATION  ──▶  TRANSACTION MANAGER  ──XA──▶  Resource A (PostgreSQL)
       │                   │                ──XA──▶  Resource B (JDBC, a
       │                   │                       mainframe, a message
       │                   │                       broker)
       │                   │
       │              the TM is the coordinator.
       │              It is also now a SINGLE POINT OF FAILURE
       │              and a process that must not be restarted
       │              mid-transaction.
  ──────────────────────────────────────────────────────────────────
  Same blocking failure mode as 2PC — XA does not fix it, it
  relocates the coordinator into a process you now operate.
  ──────────────────────────────────────────────────────────────────
```

Where XA is genuinely the right answer, and it is a real answer rather than a defensive
excuse: the resources are heterogeneous and *you do not control them*. A mainframe DB2
via XA, a vendor database with no idempotent API, an existing corporate system you must
join into a transaction. The decision rule is about **ownership of the resource's
behaviour**: if you can change how the far side handles retries and duplicates, you do not
want 2PC; if you cannot, you may have no choice.

```sql
-- What XA looks like at the resource, in PostgreSQL's own terms.
-- It is not SQL, and the fact that it is not SQL is the point:
-- it is a protocol, and it requires a driver that speaks it.
XA START 'xid-4711';
  UPDATE accounts SET balance = balance - 100 WHERE id = 1;
XA END 'xid-4711';
XA PREPARE 'xid-4711';      -- ← the promise. After this, the
                            --   transaction cannot be undone locally.
                            --   If the TM dies now, this row is stuck.
XA COMMIT 'xid-4711';       -- ← the decision, possibly minutes later
                            --   and possibly issued by a DIFFERENT process
                            --   that recovered the TM's log.
```

The second SQL block is the operational reality of XA, and it is worth being able to
describe it because it makes the cost concrete: **a prepared transaction holds locks until
someone commits or aborts it.** There is a `pg_prepared_xacts` view for exactly this
reason, and finding in-doubt prepared transactions on a PostgreSQL instance — left by a
crashed TM — is a real operational task with a real answer (`COMMIT PREPARED` or
`ROLLBACK PREPARED`, decided by the recovery procedure, not by the application).

### 8.4 The Practical Answer: Idempotency, Outbox, At-Least-Once

What teams actually build instead is not a weaker transaction. It is a *different
guarantee*, chosen deliberately, and made to work by two mechanisms.

**Mechanism 1 — the transactional outbox.** The problem it solves is precise: a dual
write. You must write to your database and publish a message; those are two different
systems; there is no transaction spanning them; so one of them will eventually be wrong.

```text
  THE DUAL WRITE, AND WHY IT IS UNAVOIDABLE
  ─────────────────────────────────────────────────────────────────
   1. INSERT INTO orders (...) VALUES (...);   ── committed
   2. kafka.publish(orderCreatedEvent);        ── ✗ network timeout.
                                                   The event may or may
                                                   not have been received.
                                                   The order exists.
  ─────────────────────────────────────────────────────────────────
  Three bad outcomes, all reachable, none detectable by the app:
   (a) publish throws BEFORE the broker got it    → event lost forever
   (b) publish throws AFTER the broker got it     → retry duplicates it
   (c) publish succeeds, then the app crashes
       before recording that it succeeded         → retry duplicates it
  Note (b) and (c) are indistinguishable from the outside. The
  application genuinely cannot know, and no amount of retry logic at
  this layer can resolve that. Only removing the dual write can.
  ─────────────────────────────────────────────────────────────────

  THE OUTBOX — one transaction, then a relay
  ─────────────────────────────────────────────────────────────────
   BEGIN;
     INSERT INTO orders (...) VALUES (...);
     INSERT INTO outbox (id, topic, payload, created_at)
       VALUES (gen_id(), 'orders', '{...}', now());
   COMMIT;
   ── ONE atomic unit. Either both rows exist or neither does. There is
      no window in which the order exists and the event does not.

   A SEPARATE relay process (or CDC — the Microservices Volume 2,
   Chapter 7 covers both in depth) then reads the outbox and publishes:

     1. read unpublished outbox rows
     2. publish to the broker, with a message key = the outbox id
     3. mark them published
   ── and the relay crashes between (2) and (3) and re-publishes.

   WHICH IS FINE. Because the consumer is idempotent.
  ─────────────────────────────────────────────────────────────────

  WHAT THE OUTBOX GUARANTEES, PRECISELY
  ─────────────────────────────────────────────────────────────────
  ✓ The event WILL eventually be published (assuming the relay runs).
  ✓ The event will NOT be published if the transaction rolled back.
  ✓ No event is published for an order that does not exist.
  ✗ Delivery is at-least-once, NOT exactly-once. Duplicates are expected.
  ✗ The event may be published long after the transaction committed
    (the relay's lag), so the event's timestamp is not the commit time.
  ✗ Publication is not atomic with the order's visibility in any
    external system.
  ─────────────────────────────────────────────────────────────────
  Claiming "exactly-once" from an outbox is the trap. What you have is
  at-least-once delivery with exactly-once *effect*, and the second
  half comes entirely from the consumer.
  ─────────────────────────────────────────────────────────────────
```

**Mechanism 2 — idempotency at the consumer.** This is the precondition for the outbox
being worth anything, and the Microservices Volume 2, Chapter 2 develops it properly. The
shape is always the same: a message key, a unique constraint, and the dedup record written
in the same transaction as the business effect.

```sql
CREATE TABLE processed_messages (
  message_key   TEXT PRIMARY KEY,      -- the deduplication point
  consumer_name TEXT NOT NULL,         -- so two consumers of the same
  processed_at  TIMESTAMPTZ NOT NULL,  -- topic do not collide
  CONSTRAINT dedup_identity UNIQUE (consumer_name, message_key)
);

BEGIN;
  INSERT INTO processed_messages (message_key, consumer_name, processed_at)
  VALUES (:key, :consumer, now());
  -- If a duplicate arrives: unique violation → the whole transaction
  -- rolls back → the business effect is NOT applied twice.

  UPDATE orders SET status = 'CONFIRMED' WHERE id = :order_id;
COMMIT;
-- The insert and the effect are atomic. A redelivery cannot apply the
-- effect twice, because the dedup insert would fail first and take
-- the effect with it on rollback.
```

The three properties that make this correct, and each is load-bearing:

- **The dedup key is derived from the message, not generated at consume time.** A
  consumer-generated UUID is unique on every delivery and deduplicates nothing.
- **The dedup record and the business effect are in the same transaction.** Splitting them
  creates a window where the effect is applied and the record is not, and the next
  redelivery applies it again.
- **The retention of the dedup table exceeds the maximum possible redelivery window.** A
  dedup table pruned too aggressively resurrects old duplicates. This is a real operational
  bug and it appears weeks after the pattern is deployed and working.

**The resulting guarantee, stated honestly.** You have: no lost events, at-least-once
delivery, and exactly-once *effect* per consumer, with a window during which different
consumers observe different states. What you have given up is global serializability across
services. In exchange you have no coordinator, no blocking failure mode, no in-doubt
transactions, and each service can be deployed, scaled, and failed independently.

> **TRADE-OFF — "2PC, SAGA, OR OUTBOX?"**
>
> The condition that flips the answer is **who owns the far side's behaviour.**
> - **2PC / XA** when you need true atomicity across resources *and* you cannot change how
>   the far side handles retries and duplicates — a mainframe, a vendor database, a message
>   broker with no idempotence. The cost is a coordinator you must trust more than your
>   architecture lets you trust anything, and a blocking failure mode where coordinator
>   death leaves participants in-doubt and unavailable.
> - **Saga** when the business process is a sequence of steps with a *semantic* inverse for
>   each — refund, release, cancel, compensate. It is the right answer when the steps are
>   genuinely long-running and the intermediate states are meaningful to the business. It
>   requires designing the compensations, which is real business logic and cannot be
>   generated (Microservices Volume 2, Chapter 6).
> - **Outbox + idempotent consumer** when the far side is a service *you own* and the
>   requirement is "this event must not be lost". It is by far the most common correct
>   answer in a microservices codebase because it needs no new infrastructure, degrades
>   gracefully, and its failure mode is a duplicate rather than an outage.
>
> The decision to *not* choose 2PC is a positive architectural position, and the reason to
> state it in a design review is that "the event must not be lost" is a requirement most
> teams have and few have written down. The outbox satisfies it; a dual write does not; and
> the argument for accepting at-least-once is not that duplicates are harmless but that
> they are *detectable and suppressible at the consumer*, whereas a lost event is neither.

> **SCALING REALITY CHECK**
>
> The outbox is a database table, and it has exactly the operational properties every
> database table has. Three numbers to know. (1) **Relay lag** is the delay between commit
> and publication, and it is a *user-visible* number for anything time-sensitive — an
> alert on outbox age, not just on outbox count. (2) **Table size** grows without bound
> unless published rows are deleted, and the deletion pattern is what determines whether
> the table bloats or stays small; a relay that marks-then-deletes in separate steps
> leaves the rows to be vacuumed. (3) **The relay is a serialisation point at some
> granularity**: if it publishes in key order to preserve per-aggregate ordering, then all
> events for one order are serialised behind each other, which is correct and which caps
> throughput per key at the relay's publish rate. Partitioning the outbox by aggregate id
> gives per-key ordering with parallel relay processes, and that is the design most teams
> converge on once the numbers matter.

> **STAFF-LEVEL CONSIDERATION**
>
> The question to raise unprompted is **what happens when a consumer's dedup table is
> unavailable or a poison message keeps failing**, because that is where a well-designed
> at-least-once system converts into an out-of-order or missing-data system. Concretely: a
> dead-letter queue needs an alert and a replay tool before it needs to exist, the replay
> tool needs to preserve ordering guarantees or explicitly document that it does not, and
> the dedup retention window needs to be a written number tied to the broker's maximum
> redelivery configuration. Teams that adopt an outbox and leave those three things
> implicit are running a system whose correctness depends on configuration nobody wrote
> down, and they will find out during an incident rather than during a review.

#### Common Mistakes

- Explaining 2PC's weakness as "it is slow" or "it is legacy", when the actual argument is
  the blocking failure mode and the in-doubt participant
- Not being able to explain why a prepared participant *cannot* unilaterally abort, which is
  the mechanism that makes the failure mode blocking rather than merely slow
- Confusing XA with 2PC as a different protocol, when XA is 2PC with a transaction manager
  between the application and the resources — and therefore the same failure mode with the
  coordinator relocated into a process you now operate
- Describing the outbox as giving exactly-once delivery, when it gives at-least-once
  delivery and the exactly-once *effect* comes entirely from the consumer's dedup record
- Deduplicating with a UUID generated at consume time, which is unique on every delivery
  and therefore suppresses nothing
- Writing the dedup record in a transaction *before* the business effect rather than in the
  same transaction as it, which creates a window where a redelivery applies the effect twice
- Forgetting that the dedup table's retention must exceed the broker's maximum redelivery
  window, so a table pruned on an arbitrary schedule resurrects old duplicates
- Treating a dual write as a code-quality problem rather than a structural impossibility —
  the application genuinely cannot distinguish "published and lost the ack" from "never
  published", and no retry logic at that layer can resolve it

#### Interview Questions — Distributed Transactions

**Q1. What is two-phase commit, and why is it not used across services?** `STAFF`

2PC is a protocol for extending ACID across multiple resource managers. The coordinator
runs phase one by asking every participant to *prepare* — durably recording a promise to
either commit or abort, and reporting a vote. If all vote yes, phase two tells everyone to
commit; if any votes no, everyone aborts. The reason it is not used across services is the
failure window between the two phases. Once a participant has voted yes it has durably
promised, and it *cannot* abort unilaterally, because the coordinator may already have told
other participants "commit". So if the coordinator dies after prepare and before commit,
every participant is in-doubt: it can neither proceed nor roll back, it holds its locks,
and every subsequent transaction touching those resources blocks behind it. Two services
are partially unavailable until a recovery procedure resolves it. The deeper problem is
that 2PC assumes the coordinator is more reliable than the participants — true when the
coordinator was a Transaction Manager on a fixed node, false in a platform where every
service is an autoscaling group subject to OOM-kill, node drain, and rolling deploy, and
worse under a network partition where the coordinator is unreachable rather than dead and
nobody can tell which.

**Q2. What is XA, and how does it differ from 2PC?** `TRICKY`

XA is 2PC with a transaction manager inserted between the application and the resources.
The application begins and commits against a TM; the TM speaks the XA protocol to each
resource. It is a real, specified protocol — `X/Open XA` — and it is what a JTA
implementation such as Atomikos or Narayana uses to make heterogeneous resources
transactional. The differences that matter in an interview are three. First, **it does not
fix the blocking failure mode**; the same prepare/commit window exists, with the
coordinator now being a process you operate, which arguably makes the operational surface
worse rather than better. Second, **it introduces a durable artefact you then have to
manage**: a prepared transaction is a first-class thing that holds locks until someone
decides its fate, so a PostgreSQL instance can be found holding `pg_prepared_xacts` rows
left by a crashed TM, each requiring an explicit `COMMIT PREPARED` or `ROLLBACK PREPARED`
decided by the recovery procedure rather than by the application. Third, and most
decisively, **XA is only the right answer when you do not own the far side's behaviour** —
a mainframe, a vendor database, an existing corporate system. If you control the far side,
idempotency plus an outbox gives you a usable guarantee without a coordinator.

**Q3. Explain the dual-write problem and how the outbox solves it.** `STAFF`

You must write to your database and publish an event. Those are two different systems with
no transaction spanning them, so one of the two will eventually be wrong, and the failure is
silent. There are three reachable bad outcomes: the publish throws before the broker
received it, so the event is lost forever; the publish throws *after* the broker received
it, so a retry duplicates it; or the publish succeeds and the application crashes before
recording that it succeeded, so a retry duplicates it. The last two are indistinguishable
from outside the application — it genuinely cannot know which happened — which is why no
amount of retry logic at that layer fixes it. The outbox removes the dual write by making
the two writes one atomic unit: the business row and an outbox row are inserted in the same
transaction, so either both exist or neither does. A separate relay then reads the outbox
and publishes, marking rows as it goes, and if the relay crashes between publishing and
marking it re-publishes. That is acceptable precisely because the consumer is idempotent,
which is the second half of the pattern and is not optional. The guarantee you end up with
is at-least-once delivery with exactly-once effect — not exactly-once delivery.

**Q4. Make a consumer idempotent. What are the requirements, and how do they fail?** `ADVANCED`

A dedup table keyed on a message identifier, with a unique constraint, inserted in the
*same transaction* as the business effect; a unique-constraint violation on redelivery
rolls the whole transaction back, so the effect is not applied twice. Three requirements
carry the whole design, and each fails in a characteristic way. First, **the key must be
derived from the message** — the outbox id, the event id, a natural business key —
because a UUID generated at consume time is unique on every delivery and suppresses
nothing, which is the most common implementation of idempotency and it does not work.
Second, **the dedup record and the business effect must be in one transaction**; writing
the record first, or in a separate transaction, creates a window in which the effect is
applied without the record, and the next redelivery applies it again. Third, **the dedup
table's retention must exceed the broker's maximum redelivery window**, and this is the one
that bites weeks later: a dedup table pruned on an arbitrary schedule resurrects duplicates
that the broker still considers undelivered, and the failure is silent and intermittent.
A fourth detail worth raising: key the uniqueness on `(consumer_name, message_key)` rather
than the key alone, so two consumers of the same topic do not suppress each other.

**Q5. Your team wants exactly-once processing across a database and a broker. What is
actually achievable, and what is the honest pitch?** `STAFF`

Exactly-once *delivery* across two independent systems is not achievable, and any proposal
that says otherwise is describing at-least-once delivery with a deduplicating consumer. What
is achievable, and is a perfectly good engineering outcome, is: no lost events, at-least-once
delivery, and exactly-once effect per consumer, with a bounded window during which different
consumers observe different states. The honest pitch is therefore not "we have exactly-once"
but "we cannot lose an event, and we can guarantee each event is applied once, and here is
the test that demonstrates it" — a test that publishes the same event id five times and
asserts the side effect happened once. Beyond that, three things have to be said out loud
in a design review, because they are the operational surface of the pattern: the dead-letter
queue needs an alert and a replay tool before it needs to exist; the replay must preserve
or explicitly document that it does not preserve ordering; and the dedup retention window
must be a written number derived from the broker's redelivery configuration. What is given
up is global serialisability across services, and in exchange there is no coordinator, no
blocking failure mode, no in-doubt transaction, and each service deploys, scales, and fails
independently.

> **CHAPTER 8 SUMMARY**
>
> ACID is a property of a single log and a single abort authority, and every assumption
> behind it fails the moment the second write goes to another process. 2PC reconstructs
> those assumptions and pays for it with a blocking failure mode: once a participant votes
> yes it has durably promised and cannot abort unilaterally, so a coordinator that dies
> between prepare and commit leaves every participant in-doubt, holding locks, blocking
> everything behind it — and the protocol's core assumption, that the coordinator is more
> reliable than the participants, is precisely what a containerised microservices
> architecture inverts. XA does not fix this; it relocates the coordinator into a process you
> operate and adds prepared transactions you then have to manage by hand. The practical
> answer is two mechanisms working together: a transactional outbox, which turns the
> unavoidable dual write into one atomic unit so an event is never lost, and an idempotent
> consumer with a dedup record written in the same transaction as the business effect, which
> turns at-least-once delivery into exactly-once *effect*. The resulting guarantee — no lost
> events, at-least-once delivery, exactly-once effect per consumer — is weaker than ACID and
> is the right trade for a system where every component is equally fallible.

#### Further Reading

- [PostgreSQL — `PREPARE TRANSACTION`](https://www.postgresql.org/docs/current/sql-prepare-transaction.html) — the SQL-level view of a prepared XA transaction, and the two-phase commit failure window stated from the source.
- [PostgreSQL — Distributed Transactions and Prepared Transactions](https://www.postgresql.org/docs/current/distrib-transactions.html) — the `pg_prepared_xacts` view and the operational reality of in-doubt transactions.
- [Debezium — PostgreSQL Connector](https://debezium.io/documentation/reference/stable/connectors/postgresql.html) — CDC as the alternative to polling an outbox table, owned in depth by the Microservices Volume 2, Chapter 7.
- [Microservices.io — Transactional Outbox Pattern](https://microservices.io/patterns/data/transactional-outbox.html) — the dual-write problem, the relay, and the guarantee it does and does not give.
- [Microservices.io — Saga Pattern](https://microservices.io/patterns/data/saga.html) — the compensating-action framing, owned in depth by the Microservices Volume 2, Chapter 6.

---

### End of Volume 5

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain each letter of ACID as a mechanism, and say why durability is a configuration
  setting, why atomicity is a property of the log, and why consistency is not a guarantee
  the engine makes at all
- Draw the step-by-step interleaving for a lost update, a dirty read, a non-repeatable read,
  a phantom read, a write skew, and a read skew, and state the final value in each
- Say why `UPDATE ... SET x = x + 1` is atomic — because the engine re-evaluates the
  expression under the row lock — and name every way that safety is lost
- Give the anomaly matrix for the isolation levels, and explain why write skew is
  permitted at every level below `SERIALIZABLE` by definition
- Explain why `READ COMMITTED` re-reads and `REPEATABLE READ` does not, in terms of a
  snapshot per statement versus a snapshot per transaction
- State that PostgreSQL's `SERIALIZABLE` is SSI and aborts at commit, that a `40001` is a
  correct outcome requiring a retry, and that InnoDB's `SERIALIZABLE` takes table locks and
  prevents the interleaving instead
- Describe a version chain, explain how a reader selects a version by comparing transaction
  ids to its snapshot, and name bloat, vacuum and the vacuum horizon as the three costs
- Name the lock modes, explain what an intention lock is for, and say why an `ALTER TABLE`
  stops reads as well as writes
- Give the two optimisations for `FOR UPDATE` — `NOWAIT` and `SKIP LOCKED` — and say which
  one a multi-consumer queue requires and why
- Draw a wait-for cycle, state that a deadlock is a symptom of inconsistent lock ordering
  rather than something to retry away, and explain why a lock timeout cannot break one
- Explain 2PC's blocking failure mode in terms of a participant being unable to abort after
  promising, and state why XA does not fix it
- State what the outbox guarantees, that it does not give exactly-once delivery, and the
  three requirements that make a consumer idempotent

### Coming in Volume 6 — Schema Design, Partitioning & Scaling

Volume 5 was about the correctness of concurrent access to a fixed schema. Volume 6 is about
the decisions that determine whether that schema can still be operated in three years: key
choice and why the primary key determines the physical layout, modelling one-to-many and
many-to-many relationships without either under- or over-normalising, temporal and
soft-delete patterns and the queries they break, partitioning as a data-volume strategy
rather than a performance trick, sharding and the failure modes it introduces, replication
and the consistency choices behind each mode, and connection pooling as the last unexamined
piece of the write path. The order matters because the concurrency guarantees in this
volume are only as good as the keys and constraints they are expressed over — a write-skew
fix that requires a `CHECK` constraint is not available to you unless the schema has a place
to put one, and a lock-ordering fix requires keys that can be sorted into a total order.

## Chapter 9 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness. This bank is weighted deliberately and heavily toward **T** —
"here are two transactions running these statements in this interleaving; what does each one
see, and what is the final state?" is the single highest-yield concurrency question there
is, and the one candidates most often get wrong, because it cannot be answered from a
definition and has to be derived.

### ACID & Durability

**D1. A team wants to raise write throughput by 4× and proposes
`innodb_flush_log_at_trx_commit = 0`. What is the actual trade, and what would you propose
instead?** `STAFF`

The trade is that you are deleting the durability guarantee, and the deletion is silent.
Setting 0 means the redo log is written to the OS cache and never `fsync`ed by InnoDB at
all, so a power loss can lose recently committed transactions and — unlike setting 2 — can
also corrupt InnoDB, because the log's own internal consistency assumptions break. The
proposal is also self-defeating as stated, because the person proposing it has not measured
where the time goes. The `fsync` is one device round trip, 0.5–10 ms, and throughput is
already decoupled from it by group commit: concurrent transactions attach to an in-flight
flush rather than starting their own, so the number that matters is transactions in flight
per flush, not flush speed. The honest analysis is to measure commit latency separately from
statement latency; if commit latency dominates, the levers are fewer commits (batching
multi-row inserts, which cuts the commit *count* by an order of magnitude with no
guarantee weakened), more connections so group commit has more to batch, or faster
durable storage. If none of those reaches the target, `synchronous_commit = off` is a
defensible *choice* — it preserves InnoDB's internal consistency while trading power-loss
durability for latency, and it requires battery-backed storage and a written decision that
up to one second of commits can be lost. What is not defensible is a setting that can corrupt
the database, made in a config file that is not in the deployment manifest, with nobody
able to say when it was changed.

**P1. A service ACKs an order to the customer immediately on commit. After a switch
failure, 40 seconds of orders are gone from a node that is otherwise healthy. The
application logs show clean `COMMIT`s. What is your diagnosis?** `SCENARIO`

The commits were acknowledged without having reached stable storage, so `D` never held —
the ACID promise was a configuration property that was configured away. The specific cause
is a relaxed log-flush setting, and the confirmation is the *shape* of the loss: a
consistent, bounded, recent window rather than random corruption, which is the signature of
lost log flushes rather than of a crash. `innodb_flush_log_at_trx_commit = 2` (write to OS
cache at commit, background fsync roughly once per second) produces exactly this, and it is
the setting teams adopt because benchmark numbers improve dramatically. Setting 0 would also
produce it, with corruption added. The second possibility to check is the device: a
cloud-attached volume or RAID controller with a non-battery-backed write cache that
acknowledges writes it has only buffered — in that case the setting is correct and the
hardware is lying. The third, and worth ruling out explicitly, is that the loss is on the
*replica* side rather than the primary, in which case semi-synchronous replication was
configured but the primary was acknowledging before the replica applied. The response is
to restore the durability setting, verify or replace the device cache, and get the latency
back by reducing commit count. The prevention is the artefact, not the setting: durability
configuration belongs in the migration repository next to the DDL, and a startup assertion
should fail the boot if the running value differs from the reviewed one — because this
incident was not caused by someone choosing badly, it was caused by nobody noticing that
the value had changed.

**T1. T1 executes `UPDATE account SET balance = balance - 100 WHERE id = 1` and T2 executes
`UPDATE account SET balance = balance - 100 WHERE id = 1`, both inside transactions, both
committing. Starting balance is 1000. What is the final balance, and what is the mechanism
that determines it?** `SCENARIO`

800, and the mechanism is the row lock each `UPDATE` takes, combined with the engine
evaluating the expression against the version it just locked rather than the version that
existed when the statement was sent. Whichever transaction acquires the row lock first
writes 900 and commits; the other blocks on the lock, is released when the first commits,
re-reads the row, finds 900, and evaluates `900 - 100` to write 800. This holds at every
isolation level from `READ COMMITTED` upward, and it holds *because* the expression is
re-evaluated under the lock — not because the statement is atomic, and not because the
transactions are serialised. The moment to draw out is that this safety is a property of the
engine's write path: if the value 1000 is read in a first statement, transmitted to the
application, and the application sends `UPDATE ... SET balance = 900`, both transactions do
the same thing and the final balance is 900, because the application-side computation used
a value that was already stale.

**T2. T1 is a transaction with three `UPDATE` statements. The process is SIGKILLed after
the second one and before the third. What is on disk, what does recovery do, and did the
customer's data survive?** `TRICKY`

On disk, in the write-ahead log, there is a `BEGIN` record and two update records with
their before-images, and **no `COMMIT` record** — `COMMIT` is a separate, later, durable
write, not a flag flipped at the end of the work. For a process kill (as opposed to a power
loss) the log records are also actually on the device, because the OS page cache survives
the process. Recovery replays the log to reconstruct page state, finds transaction 4711
with a begin and no commit, and discards its effects. The customer's data survives because
it was never acknowledged as committed in the first place; what did not happen is encoded in
the log by the *absence* of a record, which is exactly why the commit record is a
separately flushed write rather than an in-memory flag. The nuance to add is that on a
power loss rather than a process kill, even the uncommitted log records may be gone, since
nothing forces them — and that is fine, because they were unacknowledged. A transaction is
not a unit of durability until it commits; its intermediate states are in the log and are
correctly thrown away.

**S1. A PR changes a `docker-compose.yml` file to add
`innodb_flush_log_at_trx_commit=2` to the MySQL service, with the message "fixes slow
commits in dev". What should the reviewer ask?** `TRICKY`

The reviewer should ask whether this file is the source of truth for any environment other
than a developer's laptop, and if not, why the setting exists at all in a file that will
outlive the person who added it. Then the two substantive questions: what measurement
showed commit latency was the problem, and does the same measurement exist for production.
The default (`1`) is correct for any environment whose data anyone cares about, and the
reviewer's leverage is to point out that this is a durability change dressed as a
performance change, which means it belongs in the same review category as a schema change.
The follow-on check — which is the one that actually matters — is `grep` for this variable
across the deployment repository and the infrastructure-as-code, because a setting that
exists in a local compose file is harmless and the same setting in a production task
definition is a silent loss of the `D` in ACID. The reviewer should also ask what the
proposed replacement is, because "make it faster" without a measurement usually means
"remove the guarantee and see if the number improves".

**D2. Would you recommend raising the connection pool size to improve transaction
throughput?** `STAFF`

No, and the reasoning is more interesting than the answer. A `fsync` is a device round
trip, 0.5–10 ms, so a single-threaded committing client is capped at 100–2,000 commits per
second no matter how fast the device claims to be. The mechanism that lifts that cap
without weakening anything is group commit: transactions arriving while a flush is in flight
attach to it and are all acknowledged when it returns. Throughput therefore scales with
*transactions in flight per flush*, which is a function of concurrency — so more connections
genuinely does help, but only up to the point where the database is the bottleneck rather
than the client. Past that point, more connections make everything worse: they lengthen
queueing delay, they increase lock-holding time and therefore deadlock probability, they
consume memory in the engine's per-connection structures, and they push the system from
"each transaction waits a predictable amount" into "each transaction waits an unpredictable
amount", which is the transition that shows up as a p99 incident. The staff answer is that
pool sizing is a *concurrency* decision with a trade-off on both sides, that the right
number is measured rather than guessed, and that the number to watch after raising it is
not throughput but p99 latency and lock wait time. Worth volunteering: in a connection-pool
starvation incident, the pool is usually a *symptom* — a long-running transaction or a
poison message holding connections is the cause, and a bigger pool delays the diagnosis
while multiplying the blast radius.

**P2. A team runs a payments reconciliation job every fifteen minutes. It has been
"succeeding" for four months, and finance has just found that the job's reported total has
been wrong by a few hundred currency units each cycle, in a different direction each time.
The job is a single transaction. What is the most likely cause, and what should the fix
be?** `SCENARIO`

A read that straddled a concurrent commit, and the strong candidate is that the job
computes its total with several separate `SELECT`s inside one transaction at
`READ COMMITTED`. Each statement takes a new snapshot, so a transfer committed partway
through the job is counted on one side of the reconciliation and not the other, and the
error is different every cycle because the interleaving is different every cycle — which
matches the "different direction each time" signature exactly. The alternative worth ruling
out, because it produces the same symptom, is a job that reads a *replica* whose
replication lag varies, so the two halves of the reconciliation are seconds apart. The
distinguishing check is whether the job's read timestamp corresponds to the primary or the
replica. The fix, in order of preference: make the total a single statement so the whole
aggregate is evaluated against one snapshot and the straddle is impossible; or run the job
at `SERIALIZABLE` and handle the `40001` retry; or — cheapest and usually correct for a
reconciliation — run it against a physical snapshot or a replica with a known, pinned LSN,
so the two halves are guaranteed to come from the same point in time. What to push back on
is the instinct to add retries or to re-run until it balances: the re-run takes a different
interleaving, so it produces a different wrong number, and "re-running fixes it" is exactly
the observation that makes this bug survive for four months.

**T3. T1 issues `COMMIT` on a PostgreSQL cluster with `synchronous_commit = off`. The engine
returns successfully to the client. The operating system then crashes and the machine
restarts. What has been promised, what is on disk, and what is the difference between this
and `synchronous_commit = on`?** `ADVANCED`

The client has been told the transaction committed, and nothing has been promised about
stable storage: with `synchronous_commit = off` the engine writes the commit record into
the OS page cache and returns without waiting for it to reach the device, so the
acknowledgement is a promise about memory, not about durability. If the *process* crashed
the record would survive, because the OS page cache outlives the process; if the *machine*
lost power, the record may be gone along with the transaction's data pages, and the
transaction does not exist after recovery even though the client was told it did. With
`synchronous_commit = on` the engine waits for the `fsync` to return before acknowledging,
so the same power loss can only lose transactions the client was never told about. The
setting is safe to relax in exactly one situation — battery-backed, honest storage, where
the OS page cache survives power loss — and the entire judgement reduces to whether the
device below the OS is honest about what it has acknowledged. The two related settings
worth naming are `synchronous_commit = remote_apply`, which waits for a synchronous standby
to apply the record before acknowledging and is the right answer when the concern is losing
a *node* rather than losing a *power supply*, and `wal_level = minimal`, which combines
with `synchronous_commit = off` to remove WAL protection for some writes entirely and is
stronger than a durability relaxation — it can corrupt the cluster, not merely lose data.

### Anomalies & Isolation Levels

**T1. Under PostgreSQL `READ COMMITTED`, T1 reads `balance` from account 1 and then, in a
second statement, reads `balance` from account 2. T2 commits a transfer between T1's two
statements. What can T1 see, and what invariant is violated?** `ADVANCED`

`READ COMMITTED` takes a new snapshot per *statement*, so T1's first read sees the world
before T2's commit and its second read sees the world after. Both individual reads are
correct. The invariant violated is aggregate consistency: the pair of values T1 computed
its answer from never coexisted at any instant, so the sum it reports is not a number that
was ever true of the system. This is read skew, and it is the anomaly that a candidate who
has memorised the level table tends to miss, because nothing at `READ COMMITTED` is
violated on a per-row basis. The fix is to make the whole aggregate one statement — a
single `SELECT sum(...)` gets one snapshot for the whole expression and cannot straddle a
commit — or to run the transaction at `REPEATABLE READ` (which pins the snapshot but still
does not prevent this if the two reads straddle a commit that was in flight when the
snapshot was taken) or `SERIALIZABLE` (which will abort and require a retry). The
single-statement fix is usually the best one and is underused.

**T2. Under PostgreSQL `SERIALIZABLE`, T1 and T2 both read the same two rows in opposite
orders and both write to rows the other read. Both run to completion. What can T1 observe
at `COMMIT`?** `ADVANCED`

T1 can observe a serialization failure — `could not serialize access due to read/write
dependencies among transactions`, `SQLSTATE 40001` — *at the moment of `COMMIT`*, after
having done all of its work, and possibly on a read-only transaction that touched nothing
anyone else was writing. The reason is that PostgreSQL's `SERIALIZABLE` is Serializable
Snapshot Isolation, not strict serializability: the transactions are not serialised as
they execute, they run concurrently, and the engine checks at commit whether the
read/write dependency graph contains a cycle that would admit a non-serial outcome. T1
reading rows in the opposite order from T2 is the canonical way to create exactly that
dependency structure. The correct framing of the outcome is the important part: **this is
a correct result, not a failure.** T1's work was locally valid; the engine is declining to
certify a result that could not have arisen from any serial execution. The application must
catch `40001` and retry the whole transaction, with a bounded number of attempts and jittered
backoff. A team that treats `40001` as a fatal error has not deployed `SERIALIZABLE`
correctly, and a team that sees it constantly has a contention problem that the retry loop
is concealing.

**T3. MySQL/InnoDB at `REPEATABLE READ`: T1 does
`SELECT count(*) FROM inventory WHERE sku BETWEEN 1 AND 500` and then spends 30 seconds
doing application work. T2 attempts `INSERT INTO inventory (sku=250, ...)` at second 5.
What happens, and why?** `SCENARIO`

T2 blocks for the remaining ~25 seconds until T1 commits or rolls back. The intuition is
exactly backwards from what most engineers expect, and that is why this is a good
interview question: T1's `SELECT` is a consistent, non-locking read and takes *no lock at
all*, so the intuition says it cannot be blocking anything. The mechanism is the read
*view*, not a lock. At `REPEATABLE READ` InnoDB establishes a read view when the
transaction's first consistent read happens, and it will not break that view; the `INSERT`
needs a next-key lock on the index position where `sku = 250` belongs, and InnoDB will not
grant it while a transaction holding an older view exists, because the resulting row would
be invisible to that view and the `REPEATABLE READ` promise is that the view does not
change. The practical consequences: the incident looks like "an insert hung for 25
seconds" and the diagnosis is usually attempted against the *insert*, which is innocent;
`READ COMMITTED` removes most of this by taking a fresh view per statement, which is the
strongest practical argument for changing InnoDB's default; and it is a *snapshot*
interaction, not a lock interaction, which is why the general mental model of "reads take
no locks therefore they block nothing" fails in exactly one engine at exactly one level.

**T4. Under `READ COMMITTED` in PostgreSQL, T1 executes
`SELECT * FROM accounts WHERE id = 1 FOR UPDATE` and blocks. While it blocks, T2 commits an
update to that row. When T1's lock is granted, what does T1 see, and why?** `TRICKY`

T1 sees the *new* value. This is documented, deliberate, and counter-intuitive behaviour:
under `READ COMMITTED`, a `SELECT ... FOR UPDATE` that has waited for a concurrent updater
re-evaluates the row against a *fresh* snapshot taken after the lock is granted, precisely
so that `FOR UPDATE` returns a row you can safely write to. If it returned the value that
was current when the statement started, the caller would compute a decision from a value
that is no longer on disk and then write to the row — a lost update by way of a locking
read, which would be indefensible. The consequence to draw out is that the two reads in
this transaction now disagree, which is entirely consistent with what `READ COMMITTED`
promises: a new snapshot per statement. The same query at `REPEATABLE READ` behaves
differently — it does not silently re-read with a new value; it raises
`could not serialize access due to concurrent update` and must be retried, which is the
level's whole point. So the *same* query has two different, and each correct, behaviours at
two adjacent levels, and a codebase moving between them changes failure modes, not just
latency.

**S1. A PR changes a report endpoint's transaction to `SERIALIZABLE` to fix "the numbers
don't add up". What should the reviewer ask before approving?** `ADVANCED`

The reviewer should ask four things in order. (1) *What is the actual defect?* If the report
sums several rows, the most likely cause is read skew at `READ COMMITTED`, and the cheapest
fix is making the whole aggregate a single statement so it gets one snapshot — no isolation
change, no aborts, no risk. (2) *What is the contention?* `SERIALIZABLE` costs aborts that
scale with concurrent read-write dependency edges, and a report that scans a large table
concurrently with the write traffic is exactly the shape that generates them. (3) *Is there
a retry?* `SERIALIZABLE` without a bounded, jittered retry loop converts a concurrency
guarantee into a stream of unhandled exceptions, and `40001` is a correct outcome, not an
error to be logged and swallowed. (4) *Where does the transaction get its connection?* A
long report at `SERIALIZABLE` holds its snapshot for the whole scan, which pins the vacuum
horizon and is the mechanism behind table bloat. The reviewer should also ask whether the
alternative — running the report against a read replica, or a physical snapshot — was
considered, because a report that is allowed to be a few seconds stale does not need any
of this.

**T5. PostgreSQL at `REPEATABLE READ`. T1 does `SELECT count(*) FROM appointments WHERE
day = '2026-04-01'` and reads 3. T2 concurrently inserts a fourth appointment for that day
and commits. T1 repeats the identical statement. What does it return, and has a phantom
occurred?** `TRICKY`

It returns 3 again. T1's snapshot was established at its first statement and is held to
commit, so the new row is simply invisible to it — it does not appear, is not counted, and
does not block T2's insert. No anomaly has occurred in any sense the level promises to
prevent: the same query in the same transaction returned the same result, which is exactly
what `REPEATABLE READ` guarantees. What the level does *not* promise is that the result
reflects the current state of the database, and this is where the phantom question becomes
a real design question rather than a definitional one. The constraint "every day must have
at least three appointments" is being evaluated by T1 against a snapshot that is now
seconds or minutes stale, and if T1 is about to *act* on that count — insert a fourth, or
refuse a booking — the action is based on a version of the world that has already been
superseded. The distinction to land is between *repeatability* (the same query gives the
same answer, which holds) and *serializability* (the answer is consistent with some serial
execution interleaved with other transactions, which does not hold without an abort). It is
also worth naming the engine contrast: InnoDB at its `REPEATABLE READ` would have taken a
*gap lock* on that range for an `UPDATE` and blocked T2's insert entirely, so the two
engines give opposite answers to this exact scenario under the same level name.

**P1. A release candidate is deployed to staging and the smoke test suite is green. The
same build is deployed to production on a Friday, and 40 minutes later support reports
that two customers were double-charged. Staging has one application instance; production
has twelve. What is the most likely defect, and why did staging not find it?** `SCENARIO`

A concurrency defect, and the most likely specific shape is a read-modify-write that is
correct for one writer and wrong for several. A balance decrement implemented as "read the
balance, subtract, write the absolute value" is atomic on a staging box with a single
instance, because there is no second transaction to interleave with; in production, two
concurrent requests both read the same balance and both write the same decremented value,
and one decrement disappears — or, in the double-charge variant, both write a
*set-absolute* value and reconciliation sees two charges for one intent. Everything about
this is invisible to the test suite for the structural reason this whole volume restates:
concurrency bugs are not reproducible on sequential replay, and a smoke test replays
sequentially every time. The other candidate to rule out is a lost-update-shaped defect
somewhere else in the payment path, where a `SELECT` and an `UPDATE` were split across two
requests rather than one conditional statement. The fix is structural, not a configuration
change: collapse the read-modify-write into a single conditional statement and check the
affected-row count, or add a version column. The process fix is worth raising, and it is
the same in every codebase this happens in: **there must be a test that runs two real
transactions against the contended path concurrently and asserts the invariant**, because
that is the only kind of test that can catch this class of bug and it is absent from
essentially every suite. Staging with one instance is not a weaker version of production;
for concurrency defects it is a categorically different system.

**D3. Your service's deadlock rate is climbing with traffic. A team has already added a
retry loop, which improved the error rate and made p99 worse. What is the real problem and
what do you change first?** `ADVANCED`

The real problem is inconsistent lock acquisition order between two or more code paths that
touch overlapping data, and the retry loop is now amplifying it. Each retried transaction
re-enters the same contention with full transaction cost, so a small increase in overlap
produces a disproportionate increase in deadlocks, and p99 gets worse because the queue of
retrying transactions behind the same locks grows. The first change is not more retrying —
it is to stop the retries from being load: cap the attempts, add **full jitter** (uniform
over `[0, cap]`, not `cap` itself, because unjittered retries are a synchronised herd), and
instrument the rate so the effect of the change is measurable. The second and more important
change is structural: enumerate the locks each transaction acquires and the order it
acquires them in, find two paths whose sets overlap and whose orders differ, and impose a
global total order by sorting the keys ascending before any multi-lock path. With a
consistent total order the wait-for graph becomes a forest and a cycle is structurally
impossible. The third is to attack the graph directly: every lock is an edge, so a lock held
across a remote HTTP call, or a plain `FOR UPDATE` on a frequently-referenced parent row
that blocks concurrent foreign-key checks, are edges nobody needs. The retained retry is
the seatbelt for the residue — a self-deadlock from a path that locks the same row twice
will still happen occasionally — but it should be the second step, not the first.

### MVCC

**T1. T1 opens a transaction at 03:00 and does a `SELECT`. It stays open. Between 03:00 and
14:00, 40 million rows are updated. What is the state of the table at 14:00, and what is
the state after T1 commits?** `ADVANCED`

At 14:00 the table holds 10 million logical rows and roughly 50 million physical rows, and
**none** of the 40 million dead versions can be reclaimed — not because vacuum is not
running, but because it is running continuously and reclaiming nothing. Vacuum can only
remove a version older than the oldest live transaction's snapshot, and T1's snapshot is
from 03:00, so every version written since then might still be needed by T1. The table is
four times its logical size, so every sequential scan reads four times the rows it needs,
index scans follow longer version chains, and buffer pool hit rates fall. The degradation is
system-wide, not specific to T1's query. After T1 commits, the horizon advances to the
next-oldest live snapshot and a single `VACUUM` reclaims the dead tuples; the physical
space becomes available for reuse immediately, though it is not returned to the operating
system unless `VACUUM FULL` is run — which takes an exclusive lock and should not be. The
diagnosis to name is therefore not "run vacuum" but "find the transaction", because until
it ends, manual vacuuming is wasted work. In PostgreSQL this is also a wraparound-safety
concern rather than only a performance one; in InnoDB the equivalent is the undo log growing
inside the system tablespace because `purge` cannot advance past the read view T1 holds.

**T2. T1 and T2 both `SELECT` from `products`. T1 then issues
`UPDATE products SET price = 90 WHERE id = 7 AND version = 3` and T2 (having also read
version 3) issues `UPDATE products SET price = 80 WHERE id = 7 AND version = 3`. What
happens, and what is the *mechanism* by which each transaction learns the outcome?** `SCENARIO`

T1 affects one row and T2 affects zero. The mechanism is not a lock and not an abort — it
is that the version number is part of the row's identity for the purposes of the `WHERE`
clause, so T2's predicate `version = 3` no longer matches a row: T1's `SET` clause
incremented `version` to 4, and the engine evaluates the predicate against the *current*
committed row, finds version 4, and matches nothing. T2 learns of the conflict from the
**affected-row count**, not from an exception, which is why the check for zero rows
affected is a mandatory part of the pattern and not an optimisation. Three things make this
correct and each is commonly got wrong: the predicate must be in the `WHERE` clause (a
version column on the entity that the ORM does not emit buys nothing); the version must be
incremented (otherwise two transactions could both read 3 and both write, because nothing
would have changed); and the entire read-decide-write must be inside the retry, because a
retry that reuses the value from the failed attempt's read is not a retry — it is the same
stale computation with a second write.

**T3. A transaction has been open for 26 hours. Beyond performance, what is the
correctness risk in PostgreSQL, and what is the equivalent in InnoDB?** `ADVANCED`

In PostgreSQL the risk is transaction id wraparound, and it is a hard availability
boundary rather than a gradual degradation. Every transaction consumes an id from a finite
32-bit space, and because MVCC requires every transaction to be able to determine whether
any other transaction committed, an id cannot be recycled while a live snapshot might still
need to know its fate. One long-lived transaction holds that recycling back. If the distance
between the oldest transaction id and the current one approaches roughly 2.1 billion,
the engine enters a protective mode: it refuses to let *any* new transaction assign a
transaction id, which means the database stops accepting writes. A single forgotten `BEGIN`
has taken the system offline. The controls are an alert on the wraparound distance
(`age(datfrozenxid)`), `idle_in_transaction_session_timeout` and `statement_timeout` on
every role that is not a migration role, and a scheduled query that terminates transactions
past a threshold. The InnoDB equivalent is less dramatic but has its own severe form: the
open transaction holds back `purge`, so the undo log grows inside the system tablespace,
and in older versions that space could not be reclaimed by `TRUNCATE` or ordinary cleanup
and required a dump and reload. Same root cause, different engine's vocabulary, and in both
cases the answer is the same set of timeouts.

**S1. A PR adds a `@Version` field to a JPA entity to fix a lost-update bug. What should the
reviewer ask beyond "does the field exist"?** `TRICKY`

The reviewer should ask to see the generated SQL, because the version column only protects
the statements that include it in the `WHERE` clause. The specific things to check: does
Hibernate's dirty checking actually emit `WHERE id = ? AND version = ?` for this entity, or
does the custom repository method bypass it; are there bulk `@Modifying` queries or native
`UPDATE`s against the same table that carry no version predicate and therefore silently
overwrite concurrent changes; and is the version increment happening in the `SET` clause of
the generated statement rather than in application code, because an increment performed
after the read has re-inserted the race. The reviewer should also ask about the retry:
`OptimisticLockException` is the *mechanism* of detection, and a codebase that propagates
it as a 500 has converted a correct concurrency signal into a user-visible error, and a
codebase that catches it and retries without a bound or without jitter has converted it
into a load amplifier. The two-minute version of the review is: grep every `UPDATE` and
`DELETE` against the table and confirm each either checks the version or is a documented
exception.

**T4. T1 runs `SELECT * FROM orders WHERE id = 500` at `READ COMMITTED` and reads
`status = 'NEW'`. T2 then updates that row to `'SHIPPED'` and commits. T1 now runs
`UPDATE orders SET status = 'DELIVERED' WHERE id = 500`. What happens, and what was the
last version of that row?** `TRICKY`

The `UPDATE` succeeds and overwrites T2's value, and the last version of that row was
`status = 'SHIPPED'` — committed by T2, and current at the moment T1's write was applied.
This is the classic lost update in its most ordinary form, and it is dangerous precisely
because every statement in it is individually correct. T1's read was a valid committed
value; T2's commit was valid; T1's `UPDATE` matched a row and wrote to it. Nothing
errored, no constraint was violated, and the final state — `DELIVERED` — is a value
neither transaction ever chose. The `WHERE` clause names only the primary key, so the
update is not conditional on anything about the state T1 read; T1's decision was made
against a version that had already been superseded. Note that T1's own read is not even
part of the statement that lost the update — it happened in a previous statement, possibly
on a previous request, possibly from a cache — which is the structural reason no isolation
level between `READ COMMITTED` and `SERIALIZABLE` catches this, and the reason the fixes
are a version predicate, a `FOR UPDATE` before the read, or folding the read and the write
into one conditional statement.

**T5. A table has 10 million rows. Every row is updated exactly once per day by a job that
opens a fresh transaction per 10,000-row batch, commits, and immediately opens the next
batch. Dead tuples accumulate. There is no long-running transaction anywhere. Does vacuum
reclaim them?** `ADVANCED`

Yes, promptly, and the reason is that this workload has a *short maximum transaction
lifetime*, which is the input to the bloat formula — physical size is roughly logical size
times one plus the number of updates per row during the longest live transaction. With
batches that commit immediately, the horizon is always seconds old, so autovacuum reclaims
nearly everything it encounters and the steady-state table sits near twice its logical size
rather than growing without bound. The contrast is what makes the concept land: the
identical job with a single transaction wrapping all ten batches, or with a batch
transaction left open while a 40-minute report runs elsewhere, pins the horizon and every
one of the 10 million dead tuples becomes uncollectable. This is the useful practical form
of the answer — **reclamation is a function of the oldest live snapshot, not of how much
garbage exists or how hard autovacuum is working** — and it reframes the operational
question from "is vacuum keeping up", which autovacuum's own metrics will happily confirm,
to "what is the oldest transaction on this instance", which they will not. The corollary
worth adding is that bloat still matters even in the healthy case: at a steady 2× the table
is twice its logical size, so sequential scans read twice the rows they need and buffer
pool hit rates are correspondingly lower, which is why `fillfactor` and HOT updates matter
on update-heavy tables.

**P1. A table grows from 200 GB to 1.4 TB over four days with no growth in the data. The
team provisions a larger volume, which buys four days. `pg_stat_user_tables.n_dead_tup`
shows 900 million dead tuples. What is actually happening, and what was the mistake?**
`SCENARIO`

A long-running transaction has pinned the vacuum horizon, so autovacuum has been running
continuously and reclaiming nothing at all. The table is not full of new data; it is full
of garbage it is not permitted to delete. The specific culprit is findable in
`pg_stat_activity` — the session with the oldest `xact_start` and a non-null `backend_xmin`
— and here it is a materialized-view refresh started by a cron job four days ago that has
been blocked on a lock for most of its life while its transaction never ends, because the
job wraps everything in an explicit transaction and the exception path does not roll it
back. The second mistake is the response: provisioning a larger volume, which does nothing
because the growth rate is a function of *write volume*, not of capacity, so the team
bought four days rather than a fix. The third is the diagnosis order — starting from
`VACUUM` rather than from the transaction list, so even a manual vacuum run reclaims
nothing and sends the investigation further down the wrong path. The fix is to terminate
the session, after which the horizon advances and a single vacuum reclaims the dead
tuples; the physical space becomes available for reuse immediately without a table
rewrite, and no data was ever at risk. Prevention is three alerts — oldest running
transaction, dead-tuple ratio, and `age(datfrozenxid)` against the wraparound limit — plus
`statement_timeout` and `idle_in_transaction_session_timeout` on every non-migration role,
because in PostgreSQL this is not only a performance problem but a correctness boundary
that one forgotten `BEGIN` can eventually push the database past.

**D4. Should this system use `SERIALIZABLE` on a contended workload to be safe?** `STAFF`

No, and the argument is about who pays rather than about correctness. Under `SERIALIZABLE`
you are buying a guarantee whose cost is paid by whichever transaction loses the race, and
the price is either a lock wait (strict serializability, e.g. InnoDB's table locks) or a
full rollback *after all the work is already done* (SSI, e.g. PostgreSQL). On a table with
one writer and thousands of readers, `SERIALIZABLE` costs almost nothing and buys
everything. On a table with fifty writers on the same rows, it converts correctness into a
throughput collapse with a retry loop generating additional load on the exact rows that are
already the bottleneck — and SSI's abort rate scales with the number of concurrent
read-write dependency edges, so it degrades faster than linearly and, past a handful of
genuinely concurrent writers on one row, the retries add load to the contention that caused
them, producing a feedback loop rather than a stable system. The right shape is
organisational rather than a global setting: find the one or two transactions that genuinely
need a strong guarantee, give *those* the strong level with a bounded jittered retry, and
restructure the rest. For write skew specifically, the better answer is usually a schema
change — a single-row `CHECK`-enforced counter — so the transaction needs no strong level
at all. A database-wide `SERIALIZABLE` is nearly always a sign that nobody worked out which
transaction needed it, and it converts a design problem into a latency problem, which
someone will later solve by lowering the setting again.

### Locking

**T1. T1 holds an exclusive lock on row 42 of `orders` and takes 40 seconds to commit. T2
issues `UPDATE orders SET status='SHIPPED' WHERE id = 42` at second 5, and T3 issues the
same statement at second 6. What does each see, and what is the row's throughput?**
`SCENARIO`

Both block. T2 waits behind the lock holder; T3 waits behind T2, because the wait queue is
FIFO in both PostgreSQL and InnoDB and the holder is not preempted. The observable
behaviour that matters is that T3's wait is not 35 seconds — it is whatever remains of
T1's hold, because it cannot start even if T2's work were instantaneous. So the queue is
governed by the *sum* of the holders' times, not by any individual query's cost, and a
single five-millisecond statement behind a forty-second holder waits forty seconds. Three
operational facts to add: the waiting consumes almost no CPU, so the database looks healthy
in every metric while being unavailable for that row; the entire transaction is held, not
just the statement, so the gap between T1's first write and its commit is the real defect
rather than the number of statements it executes; and the reported symptom will be T2 and
T3 in the slow query log as victims, with T1 — which is fast per statement — not appearing
in it at all. The investigation therefore starts from `xact_start`, not `query_start`.

**T2. Under MySQL/InnoDB `REPEATABLE READ`, T1 does a plain
`SELECT count(*) FROM jobs WHERE status = 'PENDING'` and then holds its transaction open
for 5 minutes doing nothing. Eight workers each run
`SELECT id FROM jobs WHERE status='PENDING' LIMIT 1 FOR UPDATE` and then update the row. What
happens?** `SCENARIO`

The eight workers serialise: worker 1 takes the head-of-queue lock, workers 2 through 8
block behind it, and the queue drains at the speed of a single worker with seven idle
processes holding seven blocked connections. This is strictly worse than having one worker,
because the serialisation point is nondeterministic and you are paying for eight connections
to achieve it. The fix is `FOR UPDATE SKIP LOCKED`, which tells the engine to skip rows
already locked and return the next available one, so each worker gets a distinct row and
the queue drains in parallel. The reason this is a correctness requirement rather than a
performance feature is that without it, the concurrency is illusory — the application is
written as if it has eight consumers and has one. T1's long transaction is a separate but
related problem: it holds a read view open, which stalls `purge` and grows the undo log. Two
operational notes on `SKIP LOCKED`: a row skipped because it is locked is not lost — the
holder will commit or roll back and a later iteration will find it — but a consumer that
crashes while holding a lock makes that row invisible to all other consumers until the lock
is released, so a bounded `lock_timeout` on the consumer connection is the safety net; and
the `SKIP LOCKED` form can have a materially different plan from the plain `FOR UPDATE`
form, because the engine is now racing other consumers for the same rows.

**T3. A migration runs `ALTER TABLE orders ADD COLUMN discount_code TEXT;` on a table with
40 million rows at 11:00. Users report that read endpoints time out. What is happening and
what should have been done?** `SCENARIO`

The `ALTER TABLE` has taken `ACCESS EXCLUSIVE`, which is compatible with no other lock mode
at all. Existing statements finish, and then *every* subsequent query on that table queues
behind the DDL — including plain `SELECT`s that were not running when it started. The
result is not "the migration is slow"; it is that the table appears frozen, the queue grows
until the connection pool is exhausted, and the application reports a total outage rather
than a degraded one. The specific severity depends on the rewrite: in PostgreSQL, adding a
column *with a constant default* or at the end of the table is a metadata-only change that
holds the lock briefly, while a *volatile* default such as `now()` or a generated expression
rewrites the entire table and holds the lock for the duration — so "a nullable column" and
"a column with `DEFAULT now()`" are categorically different operations on the same table.
What should have been done: rehearse the migration against production-sized data to measure
its lock duration, run DDL outside business hours, set a `lock_timeout` so the migration
*itself* fails fast rather than queueing the whole application behind it, and use
`CONCURRENTLY` variants where they exist (index creation, and in newer PostgreSQL versions
`ADD COLUMN` with an existing default). The review lesson is that a DDL lock's duration is
a function of table size, and that number should never be discovered during a deploy.

**S1. A PR wraps a long report query in a transaction with `FOR SHARE` on the rows it
reads, "to make sure the data doesn't change underneath the report". What should the
reviewer say?** `ADVANCED`

The reviewer should say the premise is wrong for PostgreSQL and the cost is high in both
engines. In PostgreSQL, a plain `SELECT` at `REPEATABLE READ` already gives a stable view
of everything the transaction reads — adding `FOR SHARE` acquires real row locks that block
every concurrent writer to those rows for the entire report, converting a consistent read
into a lock queue for no additional correctness. In InnoDB the situation is worse, because
`FOR SHARE` makes the read a locking read that participates in next-key locking, so it can
block inserts into the ranges it touches and can itself be blocked by them. The correct fix
for the stated goal — a report that is internally consistent — is either to make the whole
aggregate a single statement (one snapshot, no locks, no aborts) or to run the report at
`SERIALIZABLE` and handle the `40001` retry. If the report is long, the reviewer should
additionally flag the vacuum horizon: a long-running transaction at any level above `READ
COMMITTED` prevents reclamation, and a report that holds a snapshot for twenty minutes is a
contribution to table bloat system-wide.

**D5. A team wants to add `NOWAIT` to every `SELECT ... FOR UPDATE` in the codebase to
eliminate lock waits. What is the right response?** `STAFF`

Push back, and diagnose why they think the problem is waiting rather than contention.
`NOWAIT` converts every lock wait into an error, which means the application must now have
a correct path for "someone else has this row" — and in most codebases it does not, so the
outcome is a flood of 500s replacing a latency problem with an availability problem.
`NOWAIT` is genuinely right in a narrow set of cases: an interactive request where the user
should be told "someone else is updating this, try again" rather than made to wait; a
job-claiming loop where the application is designed to skip a contended row; and any
low-latency path where exceeding a few milliseconds is itself a failure. It is wrong on
batch and reporting work, where a 30-second wait for a nightly `VACUUM`'s lock is normal
behaviour and turning it into an error produces a nightly job that fails and needs a human
to retry. The better answer to the underlying problem is usually to shorten the
transaction — the gap between the first write and the commit is the real defect — plus
`statement_timeout` and `idle_in_transaction_session_timeout` as the safety net that makes
the next occurrence a three-minute event. Where the requirement genuinely is "never wait",
`SKIP LOCKED` is usually the right clause rather than `NOWAIT`, because it degrades into
"process the next one" rather than into an exception.

**T4. PostgreSQL, `REPEATABLE READ`. T1 does `BEGIN; UPDATE accounts SET balance = 90 WHERE
id = 1;` and commits. T2, which started before T1 committed, then does
`UPDATE accounts SET balance = 80 WHERE id = 1;`. What does T2 see, and does it wait?** `TRICKY`

T2 does not wait, and it does not overwrite either — it raises
`could not serialize access due to concurrent update` (`SQLSTATE 40001`) and its
transaction must be rolled back and retried. This is the defining behaviour of PostgreSQL's
`REPEATABLE READ` and it is worth being able to contrast with the level below. At
`READ COMMITTED`, T2 *would* wait for T1's lock, and on release it would re-evaluate the
row against a fresh snapshot and silently overwrite T1's value — which is precisely the
lost update the level's name suggests it prevents, and which is why PostgreSQL chose to
break it. The mechanism behind the difference is the snapshot: at `REPEATABLE READ` the
transaction's view was fixed before T1 committed, so writing over a row whose current
version is not the version T2 read would produce a result that does not correspond to any
serial execution, and the engine refuses rather than certifying it. The operational
consequences are the two that matter in production: the `40001` error is a *correct*
outcome, so the application needs a bounded jittered retry, and any code that reaches
`REPEATABLE READ` without that retry has traded a silent overwrite for a user-visible
failure.

**P1. Throughput on the checkout service drops by 60% at peak, with no code change and no
traffic increase. p99 goes from 200 ms to 8 seconds. CPU is at 30%, the database is not
saturated, and the slow query log is nearly empty. What is the most likely cause, and what
do you look at first?** `SCENARIO`

Lock waits, and specifically a small number of transactions holding locks for a long time
while everyone else queues behind them. The three signals in the report are the fingerprint:
CPU at 30% means the database is not doing work, it is waiting; p99 up 40× with p50
unchanged means a small fraction of requests are stalled rather than that everything got
slower, which is the shape of a queue and not of a resource; and an almost-empty slow query
log is the confirmation, because the victims execute in under a millisecond *once released*
and so never appear. The first thing to look at is the oldest running transaction —
`pg_stat_activity` ordered by `xact_start`, or `information_schema.innodb_trx` — because the
holder is the cause and it is invisible in the slow log by construction. The two most
likely culprits are a transaction whose scope includes a remote HTTP call, and an interactive
session (a `psql` left open, a long-running analytics query in a BI tool, a monitoring
scrape that opens a transaction) holding locks or a snapshot open. What to explicitly *not*
do is raise the connection pool: the pool is holding the waiters, so more connections means
a longer queue and a slower time-to-detect, and the arithmetic that caused the pool to
exhaust in the first place is unchanged. The immediate mitigation is
`idle_in_transaction_session_timeout` plus `lock_timeout` so the next occurrence is a
three-minute event; the real fix is shrinking the transaction.

**S2. A PR adds `SELECT ... FOR UPDATE` to a repository method named `findByIdForUpdate`
and uses it in the order-status update path. What should the reviewer ask?** `TRICKY`

The reviewer should ask four things, and the third is the one that finds bugs. (1) *What
isolation level is this running at, and what does the lock add?* If it is `READ COMMITTED`,
the lock is doing the job of a consistent read and is a strict downgrade. (2) *How long is
the lock held?* Everything between this call and the `COMMIT` — which, in a service method,
usually includes business logic and sometimes includes a repository call to a different
aggregate. A lock held across application code is a throughput tax on every other
transaction that wants the row, for the duration of code that has nothing to do with the
row. (3) *Does this method lock more than one row, and in what order?* If the answer is
"more than one", the reviewer should require the keys to be sorted before acquisition, and
this is where deadlocks are born. This is the highest-value question because the
single-row case is almost always fine and the multi-row case is a latent incident. (4) *Is
`FOR UPDATE` the right strength, or would `FOR NO KEY UPDATE` do?* If the method updates
only non-key columns on a row that is a foreign-key parent, `FOR NO KEY UPDATE` provides
the same protection against concurrent writers while not conflicting with the key-share
locks that every concurrent child insert needs — a change from `FOR UPDATE` to
`FOR NO KEY UPDATE` is frequently a large throughput win on a hot parent table and is
almost never a deliberate choice.

### Deadlocks

**T1. T1 executes, in order: `UPDATE inventory SET qty = qty - 1 WHERE sku = 5`, then
`UPDATE fulfilment SET status = 'DONE' WHERE order_id = 100`. T2 executes the same two
statements in the opposite order. Both start at the same moment. What happens?** `SCENARIO`

One of them is chosen as a victim and aborted with `40P01` (PostgreSQL) or error 1213
(InnoDB), and the other proceeds once the victim's locks are released. The mechanism is a
cycle in the wait-for graph: T1 holds the inventory row and waits for the fulfilment row,
T2 holds the fulfilment row and waits for the inventory row, and neither is executing, so
no timeout can break it — the engine must abort a victim, usually the transaction with the
least work done so redoing it is cheapest. Note that T1 here is *not* necessarily the
victim even though T1 was described first; the victim is chosen by the engine's heuristic
and is frequently the transaction that was nearly finished. The fix is not a shorter
`lock_timeout`, which does not touch the deadlock path at all, and not merely a retry: the
structural fix is a global lock order — both transactions should acquire inventory before
fulfilment, which is achieved by sorting the key list or by establishing a documented table
order and having both code paths follow it. With a consistent total order the cycle is
structurally impossible. A bounded, jittered retry should still be implemented, because
even correct ordering leaves self-deadlocks and unenumerated three-way cycles, and the
retry is what makes those survivable rather than user-visible.

**T2. T1 (a batch job) locks 500 rows in ascending id order. T2 (another instance of the
same job) locks 500 rows in descending id order, from the same id range. Both start
together. What is the probability of a deadlock, and what single change removes it?** `TRICKY`

With enough overlap in the ranges the probability approaches 1, and the overlap is exactly
what happens when two instances of the same job process the same set — which is a
particularly nasty variant because the bug is *deterministic* rather than load-dependent, so
it will not appear in a staging environment with one instance and will appear consistently in
production with two. The single change is to make both instances sort ascending, so both
acquire in the same global order and the wait-for graph becomes a forest — a cycle becomes
structurally impossible rather than merely less likely. This is why "our tests pass" is
worthless evidence for this class of bug: the tests run one instance. The review rule that
generalises is that any code path acquiring more than one lock must sort its keys before
acquiring, and the integration test that generalises is one that runs two instances of the
job concurrently — the only kind of test that could ever have caught it.

**S1. A PR adds a `catch (DeadlockLoserDataAccessException e) { log.warn(...); }` block to
a service method so the deadlocks "stop appearing in the error rate". What should the
reviewer say?** `ADVANCED`

The reviewer should say the change makes the system *worse* and hides the defect, and
explain why. A deadlock victim is chosen by the engine and rolled back — all of the
transaction's work is discarded — so swallowing the exception means the service continues
after having thrown away everything it did in that transaction, which is a correctness
disaster far worse than the error: a partial result committed as if complete. The minimal
correct change is to catch it at the transaction boundary, roll back, and retry the whole
transaction with a bounded attempt count and jittered backoff. But the reviewer's real
point is the follow-up: *why is the deadlock rate high enough to need a handler at all?*
An occasional deadlock is background noise that a correct retry absorbs invisibly; a rate
that tracks traffic is the signature of inconsistent lock ordering between two code paths,
and the fix is a global total order over the contended resources. Adding a handler without
changing the ordering converts a loud, diagnosable, rate-tracked symptom into a silent
data-integrity bug, and — because the retry adds load to the contention — it will also make
p99 worse, which is the clue a careful reviewer would look for when the next performance
regression is investigated.

**T3. T1 runs `SELECT * FROM orders WHERE customer_id = 42 FOR UPDATE` and gets 12 rows.
T2 runs the identical statement for customer 99 and gets 12 rows. Both are long-running
report queries. Can these two deadlock?** `TRICKY`

Not from each other — they lock disjoint sets of rows, so there is no cycle and no
deadlock; the worst that happens is that they queue against a third transaction touching
those rows. But this statement is a *reliable deadlock generator* against any transaction
that locks a subset of the same rows in a different order, and the reason is that
`SELECT ... FOR UPDATE` acquires locks **in whatever order the plan produces**, not in
sorted key order. Two instances of the *same* query with *different plans* — which is
exactly what happens when the optimiser picks a different access path for customer 42
versus customer 99, or when statistics drift between two nodes of a primary/replica pair —
will lock the same rows in different orders, and one of them deadlocks against the other
deterministically. This is a genuinely counter-intuitive failure because the queries are
identical and the data is disjoint-looking. Three things to draw out: the lock order comes
from the plan, so it is not stable across nodes or across time; a `FOR UPDATE` over a
result set of unknown size is acquiring an unknown number of locks, each one an edge in the
wait-for graph; and a plain `SELECT` would have taken no locks at all. The fixes are to
drop the `FOR UPDATE` and use a snapshot instead (at `REPEATABLE READ` in PostgreSQL a
plain `SELECT` is already consistent and lock-free), or to sort the keys and lock them
individually in a defined order if locking is genuinely required.

**P1. A nightly job that reindexes order search data starts deadlocking heavily the week
the team scales it from one instance to four. It was deadlocking occasionally before. What
happened, and what is the real fix?** `SCENARIO`

The latent lock-ordering problem was always there and the single instance simply could not
express it — with one worker there was never a second transaction to form a cycle with, so
the batch job "passed every test" for its entire life. Four instances turned it from an
invisible defect into a routine failure, because now four transactions acquire overlapping
row sets in whatever order the plan produces. The real fix is not a larger `lock_wait_timeout`
and not another layer of retry: it is to make the job acquire its locks in a global order
(sort the order ids ascending before the first statement) and to reduce its lock surface
(process in bounded chunks in separate transactions rather than holding thousands of row
locks across application logic). What to push back on is the instinct to add retries, which
will lower the failure count and raise p99 while the underlying cycle remains. The
operational fix that is genuinely urgent is the instrumentation: the deadlock details are
gone by the time anyone looks, so `log_lock_waits` and a deadlock-rate alert need to exist
*before* the next occurrence. And the process finding is worth raising once the immediate
fire is out: this is the second incident in this codebase that a concurrency test running
two real transactions concurrently would have caught, and a batch job's concurrency
properties are not tested by running it once.

**S2. A PR adds `ORDER BY id` to the body of a batch update method and commits it with the
message "fixes flaky deadlock". A reviewer asks which deadlock. What should they do?** `STAFF`

The reviewer should treat it as a *promising* change with an unverified premise and ask for
the deadlock evidence, because `ORDER BY` in a `SELECT` list and lock acquisition order in
an `UPDATE` are related but not identical, and the change may be fixing a different thing
than the incident. The specific questions: which statements in which two code paths
deadlocked, and were the two orders genuinely different; is the sort on the *primary key*
(the thing both transactions contend over) or on a column that only happens to correlate
with it; and is the sorted list being used to drive a loop of individual locked updates, or
has it been added to an `UPDATE ... WHERE id IN (...)`, where the lock order still comes
from the plan and the `ORDER BY` does nothing at all. The last of those is the most common
version of this bug — a well-meaning `ORDER BY` added to a subquery that has no effect on
the outer statement's locking behaviour, and a flaky-looking fix that will make the next
engineer believe the issue is closed. The correct review outcome is "show me the two
interleavings this fixes" plus an integration test that runs two instances of the batch
concurrently and asserts no deadlock within a bounded number of iterations, so the claim is
verified rather than asserted.

**D6. Your service holds a database lock across an HTTP call to a payment provider. Nobody
has reported a deadlock, and p99 looks fine in staging. What is the argument for fixing
this now rather than waiting?** `STAFF`

Three arguments, and the strongest is not the deadlock. First, it is a *latent* deadlock
whose trigger is a third party you do not control: the cycle forms whenever the remote
provider's latency lets a concurrent transaction hold the row the callback needs, so
whether it fires depends on someone else's behaviour and can start on any given Tuesday.
Second, and worse than the deadlock, it is a **connection-pool and throughput problem
today**: N concurrent requests each holding a database connection for the duration of a
2-second remote call means N connections consumed for 2 seconds each, so pool exhaustion
under moderate load is a matter of arithmetic rather than bad luck, and the symptom
(`Connection is not available, request timed out`) points at the pool rather than at the
remote call, which is what makes it expensive to diagnose. Third, the fix is a structural
change — move the remote call outside the transaction, and if the operation must be atomic,
split it into a saga step with the compensating action defined — which means it is much
cheaper to do before the pattern has spread through a dozen service methods than after.
Staging hides all of this because there is one instance and no concurrent load, which is
the recurring theme: this codebase's concurrency defects are invisible on sequential
replay, so "it works in staging" is not evidence. The staff-level framing is that holding
a lock across a network call converts a local, well-understood protocol (the database's
victim selection resolves it in milliseconds) into a distributed one with none of the
machinery that would make it recoverable, and the entire recovery time becomes the sum of
every layer's timeout.

**D7. Your batch job deadlocks intermittently against an interactive service that shares
two tables. The batch is retryable and the interactive path is not. What do you change,
and what do you change first?** `STAFF`

First, establish the lock order for both paths and make them agree — enumerate what each
acquires and in what sequence, find the inversion, and impose a total order by sorting keys
before any multi-lock path. This is a contract between the two code paths and possibly
between two teams, so it needs to be written down and enforced by a test rather than
remembered. Second, change the batch job's shape, because the batch is the party that can
absorb the redesign: process items in bounded chunks in separate transactions rather than
holding 500 row locks across application logic, which removes almost all of the graph edges
it contributes, and never hold a database lock across a call to the interactive service or
to any remote API. Third, make the batch *look like* the interactive path in terms of
timing pressure by having it acquire locks early and release them promptly, so it is not
holding a large set while the interactive transaction wants one of them. Fourth, and only
then, add the bounded jittered retry for the residue. The order of these matters because
steps 2 and 3 reduce the deadlock rate structurally, whereas step 4 alone converts cycles
into load and makes p99 worse while making the error count look better. Worth raising
explicitly: the integration test that would have caught this is one that runs the batch and
the interactive path concurrently, and that is a test worth writing and keeping.

### Distributed Transactions

**T1. An order service commits an order and then publishes an `orderCreated` event to Kafka.
The publish call times out. The application retries the publish once, and it also times
out. It logs a warning and returns 200 to the customer. What is the state of the system, and
what is the correct fix?** `SCENARIO`

The system is in one of three states and the application genuinely cannot tell which:
the event was never received and is lost forever; the event was received and the ack was
lost, so the retry duplicated it; or the first publish succeeded entirely and the failure
was somewhere in the response path, so the retry duplicated it. The last two are
indistinguishable from outside, which is the structural point — no retry logic at this layer
can resolve it, because the ambiguity is not in the retry's knowledge but in the
observation. Returning 200 is defensible for the order existing but leaves the event state
unknown, and if the event was lost, every downstream consumer is now permanently
inconsistent with the order service and nothing will detect it. The correct fix is to
remove the dual write: insert the order *and* an outbox row in the same transaction, so
there is no window in which the order exists and the event does not, and have a relay
publish and mark. The relay crashing between publish and mark then produces a duplicate
rather than a loss, and a duplicate is suppressible at the consumer given an idempotent
handler with a dedup record written in the same transaction as the business effect. Note
the delivery guarantee that results: at-least-once delivery, exactly-once effect — not
exactly-once delivery, and the difference should be stated explicitly rather than glossed.

**T2. Two services each hold a database transaction. Service A calls Service B's HTTP API
while still inside its transaction and inside a `SELECT ... FOR UPDATE`. B's write
conflicts with an interactive transaction. Draw the deadlock and say what the structural
fix is.** `ADVANCED`

The cycle is: A holds a row lock on the shared row and is waiting on an HTTP call to B; B
is attempting a write to that same row and is blocked by A's lock. Because A is waiting on a
network call that will not return until B responds, and B cannot respond until it obtains
the lock A holds, the cycle spans a process boundary. The important property is that this is
*worse* than an ordinary deadlock, because A's wait has a timeout governed by HTTP client
configuration and a connection pool, and the recovery time is the sum of every layer's
timeout rather than the database's own fast victim-selection. The structural fix is to
never call out while holding database locks: split the transaction so the lock is released
before the remote call, and if the operation must be atomic, use a saga step with the
compensating action defined — release the lock, call B, and on failure run the compensation.
The deeper lesson is that a database deadlock is a *local* protocol working as designed,
whereas a lock held across a network call converts a local protocol into a distributed one
without any of the machinery that would make it recoverable. A related and very common
variant: the connection pool is held for the duration of the remote call, so even without
a deadlock, N concurrent requests each making a 2-second HTTP call hold N connections for
2 seconds each, and the pool is the next thing to fail.

**S1. A PR adds an outbox table and a relay, but the consumer's handler updates the order
status and *then* inserts a row into a `processed_messages` table in a separate
transaction. What is the bug, and what does it look like in production?** `TRICKY`

The two writes are not atomic, so there is a window in which the business effect is applied
and the dedup record is not. If the process dies between them, or the dedup insert fails, the
next redelivery of the same message applies the effect *again*. For an idempotent status
update that is invisible; for anything involving a balance, a counter, a notification
dispatch, or a payment authorisation, it is a duplicate charge, a double-counted total, or
two emails. The failure will be intermittent and correlated with deploys, timeouts, and
deadlocks rather than with load, which is what makes it survive a test suite — the tests
do not kill the process between the two writes. The fix is to put the dedup insert *first*
but in the *same transaction* as the effect, so a unique-constraint violation on
redelivery rolls the whole thing back and the effect is never applied twice. The reviewer
should also check two adjacent things while they are in there: that the dedup key is derived
from the message rather than generated at consume time (a consume-time UUID is unique on
every delivery and suppresses nothing), and that the dedup table's retention exceeds the
broker's maximum redelivery window, because a table pruned on a weekly schedule will
resurrect duplicates the broker still considers undelivered.

**D8. Is 2PC ever the right answer, or is it always a smell? When would you actually
choose it?** `STAFF`

It is the right answer under one condition, and the condition is about ownership rather
than about technical merit: **when you need true atomicity across resources and you cannot
change how the far side handles retries or duplicates.** A mainframe reachable only over
XA, a vendor database with no idempotent API, an existing corporate system you must join
into a transaction. In that situation 2PC is not a smell — it is the only thing that gives
the guarantee, and the alternative is a bespoke reconciliation process that will be built
badly. Everywhere else it is a smell, for the reason in the previous chapter: a prepared
participant cannot abort unilaterally, so coordinator death leaves every participant
in-doubt and blocking everything behind it, and the protocol's core assumption — that the
coordinator is more reliable than the participants — is exactly what a containerised
architecture inverts. The staff framing is that the decision is about **which failure you
can live with**: 2PC's failure is unavailability of two services with no data corruption
and an eventual recovery; the outbox's failure is a duplicate event, which is detectable and
suppressible at the consumer. Given a service you own, the duplicate is strictly the better
failure, and that is the argument to make. The place to raise the organisational dimension
is that choosing 2PC means committing to operate a transaction manager as a critical piece
of infrastructure with its own availability requirements, recovery tooling, and in-doubt
transaction reconciliation — a commitment no service team makes deliberately.

**D9. How would you raise the bar on transaction correctness across a codebase you have
inherited?** `STAFF`

Four artefacts, in order of value per hour. First, a **written per-transaction note**:
the invariants it depends on, the isolation level that provides them, and the retry
strategy for serialization failures. Most teams have picked their levels by inheriting a
framework default and have never written down which anomalies their code tolerates; this
note converts every future concurrency question from archaeology into a conversation, and
it is the artefact that survives the engineer who chose the level leaving. Second, **an
assertion suite**: every transaction's isolation level is explicit, no `@Transactional`
method makes a remote HTTP call, every retry loop is bounded and jittered, every
`SELECT ... FOR UPDATE` in a multi-lock path is preceded by a sort. These are grep-able and
belong in CI, not in a style guide. Third, **the two concurrency tests that a codebase
almost never has**: one that runs two real transactions against the contended path
concurrently and asserts the invariant holds, and one that runs a batch job and an
interactive path concurrently and asserts no deadlock within a bounded number of
iterations. Both are the only tests that can catch write skew and lock-ordering bugs, and
both are absent from essentially every codebase because the bugs are invisible on
sequential replay. Fourth, **the operational alerts**: oldest running transaction, dead
tuples or undo log growth, retry rate, and lock wait time — the last of which is far more
predictive of future incidents than p99 query latency, because p99 latency is the symptom
and lock wait time is the cause. The framing to open with is that none of this is about
"being careful"; it is about converting correctness from an individual judgement into a
property the system enforces, because the number of writers and the number of services both
grow without anyone re-reviewing the transactions they added.

**P1. Three services now consume `orderCreated` from the outbox. Two of them are idempotent
and the third is not. Duplicates have been appearing about forty times a day since the
relay was redeployed. Nobody knows when the duplication started or which service is
producing the bad effects. What do you do, in order?** `SCENARIO`

Stop the bleeding before the diagnosis, because a non-idempotent consumer with duplicates
in flight is a data-corruption generator and every minute is more corrupted rows. Identify
which consumer is not idempotent — the duplicate *rate* is the tell, since a correctly
deduped consumer's counter does not move on redelivery — and disable or quarantine it
while it is fixed, accepting a backlog over ongoing damage. Then determine the blast
radius: which effects were applied twice, and can they be corrected programmatically or do
they need manual reconciliation? A duplicated balance decrement or a duplicated payment
authorisation is recoverable with a reconciliation job; a duplicated email or a duplicated
physical shipment is not, and the second category is what determines how this is
communicated. Then fix the handler. Note that the relay redeploy is the *reason* the
duplicates became visible, not the cause: the relay was always going to re-publish after a
crash between publish and mark, and the consumer was always going to apply it twice; the
redeploy just made the crash happen. The prevention is the dedup record written in the same
transaction as the effect, plus an alert on the dedup-violation rate, which is the only
signal that would have shown this was happening.

**T3. A saga has three steps. Step 1 commits. Step 2 fails with a validation error that will
never succeed on retry. The saga framework retries step 2 three times, then gives up and
marks the saga failed. What state is the system in, and what did the framework get
wrong?** `ADVANCED`

The system is in the state it is *supposed* to be in after a failed saga — step 1's effect
exists and must be compensated — but the framework has almost certainly got the
compensation wrong, and that is the real finding. Two distinct errors. The first is
retrying a step that failed *validation*: validation failures are permanent, and three
retries of a permanent failure is pure cost, converting a fast loud failure into a slow one
that consumed three sets of connection and lock timeouts. The second and more serious is
what "marks the saga failed" means. If the framework does not run step 1's compensating
action, the system is left with an orphaned effect — an inventory reservation with no
order, a payment captured with no order — and the saga has converted a *visible* failure
into an *invisible* inconsistency. If it does run the compensation, the questions become
whether the compensation is idempotent and whether it can itself fail, because a
compensating action that partially applies leaves the same problem one level down. The
design points: distinguish permanent from transient failures *before* consuming any retry
budget, because a saga's retry policy is business logic and not a library default; make
every compensating action idempotent, for the same reason the outbox consumer must be; and
keep a durable record of "step 1 committed, compensation owed" that a human can query,
because a saga that fails silently in the middle is worse than one that stops and tells
you.

**S2. A PR introduces an outbox and a relay for the `orderCreated` topic. The relay polls
every 200 ms with `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 500`, publishes, then marks the
rows published. What should the reviewer ask?** `ADVANCED`

Four questions, in this order. (1) *What is the ordering guarantee?*
`FOR UPDATE SKIP LOCKED` with eight relay instances gives parallel publication with no
ordering at all, so two events for the same order can be published out of order. If
ordering per aggregate matters, the relay must publish in key order, which means
serialising per key — usually by partitioning the outbox by aggregate id and running one
relay per partition. (2) *What happens if publish succeeds and the mark fails?* A
duplicate, which is acceptable only because the consumers are idempotent — so the reviewer
should verify that they are rather than take it on trust. (3) *What is the retention
policy?* Published rows must be deleted, not merely marked, or the table grows without
bound and the relay's own index scans degrade. (4) *Is the 200 ms poll defensible?* A
polling relay adds up to 200 ms of latency to every event and generates constant small
queries; change data capture off the same transaction log removes both, and it is the
alternative worth raising since it is usually strictly better. The reviewer's closing
question is the one that matters most: *can you demonstrate the guarantee, or is it
asserted?* A test that publishes the same event id five times and asserts the side effect
happened once is worth more than the design document.
