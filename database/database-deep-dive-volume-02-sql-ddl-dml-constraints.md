---
title: "The Database Complete Deep-Dive"
volume: 2
series: "SQL — DDL, DML & CONSTRAINTS"
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
it cost, when does it break, and how expensive is it to undo?"** SQL is treated as the
visible surface of a storage engine, a concurrency protocol and a durability model, and the
notes always go down to that machinery, because that is the layer where production incidents
actually live. The `ALTER TABLE` you are about to run is not a schema edit — it is a lock, a
possible full table rewrite, and a WAL volume, and those three facts decide whether your
deploy succeeds at 09:00 or pages you at 09:03.

Volume 2 is the volume that separates people who can query a database from people who can be
trusted with one. Everything here is *declarative and permanent*: a `CREATE TABLE` is a claim
about the shape of the data that every future write is checked against, and a `NUMERIC(12,2)`
is a decision that is very hard to widen later. That permanence is the volume's theme. The
questions are not "what is the syntax for a foreign key" — those are lookup questions and they
score nothing. The questions are "what does this `ALTER TABLE` do to my 8,000 concurrent
connections", "which of my three similar columns silently rounded a penny last quarter", and
"why did this `NOT IN` query return zero rows when I assumed the logic was fine".
The staff-level theme running through all seven chapters is **the cost of a permanent,
unreviewed decision**. A type is a constraint you can never remove. A `CHECK` is an invariant
that survives the departure of the engineer who wrote it. A `CASCADE` is a data-destruction
policy disguised as a convenience setting. A `DEFAULT` is a promise made to every future
caller of a function you have not written. The recurring habit a staff engineer has, and a
senior one is beginning to have, is asking *"what does this cost, what does it prevent, and
can I undo it in a weekend?"* before typing any of it.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto the `ALTER TABLE`
lock table produces filler. The template is a completeness checklist, not a template to fill.
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

### Continuing From Volume 1

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 (this book) | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL — InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 2

- Chapter 1 — DDL: Creating and Evolving Schema
- Chapter 2 — Data Types, Collation & Precision
- Chapter 3 — Primary, Foreign & Unique Constraints
- Chapter 4 — Check Constraints & Domains
- Chapter 5 — DML: INSERT, UPDATE, DELETE
- Chapter 6 — NULL, Three-Valued Logic & the Perversity of SQL
- Chapter 7 — Views, Materialized Views & Generated Columns
- Chapter 8 — DDL & DML Interview Scenario Bank

---

# Part 1 — SQL — DDL, DML & Constraints

## Chapter 1 — DDL: Creating and Evolving Schema

### 1.1 DDL Is Not "Just Schema"

The beginner framing of DDL is that it is the safe, offline part of SQL — the stuff you run
once, by hand, on a laptop, before the interesting stuff starts. That framing is exactly
backwards. In production, **DDL is the part of SQL that takes locks the application cannot
route around, rewrites terabytes of data, and cannot be rolled back once it is half done.**
The distinction that matters is between DDL that is *declarative* (it changes the catalogue
and the meaning of future statements) and DDL that is *physical* (it moves bytes). A
surprising number of `ALTER TABLE` statements are both, and the ratio is the single most
important operational fact about schema evolution.

```text
  ┌──────────────────────────────────────────────────────────────────────┐
  │  CATALOGUE-ONLY DDL                        PHYSICAL DDL              │
  │  (instant, brief lock)                      (long lock + rewrite)     │
  │                                                                      │
  │  ADD COLUMN nullable, no default            ALTER COLUMN TYPE         │
  │  DROP COLUMN (with no rewrite needed)       int → bigint              │
  │  RENAME COLUMN                              varchar(10) → varchar(50) │
  │  SET DEFAULT                                 SET NOT NULL (validated) │
  │  ADD CONSTRAINT … NOT VALID                 ADD PRIMARY KEY           │
  │  CREATE INDEX (metadata part only)          ADD COLUMN … NOT NULL    │
  │                                             ADD COLUMN with a value  │
  └──────────────────────────────────────────────────────────────────────┘
        ▲ you can run this in a transaction
        ▲ and usually roll it back if you regret it
```

`RENAME COLUMN` looks, in the abstract, like the most disruptive possible operation, and in
practice it is one of the cheapest — a dictionary entry. `ADD COLUMN NOT NULL DEFAULT 0` is
usually cheaper than people fear on modern engines and is *not* on old ones. Knowing which
is which is the entire content of this chapter, and it is the difference between a migration
that takes nine seconds and one that takes nine hours.

> **MUST REMEMBER**
>
> In PostgreSQL the rewrite status of an `ALTER TABLE` is documented per-statement in the
> official docs under "Subforms", and MySQL exposes it explicitly as `ALGORITHM=INPLACE |
> COPY | INSTANT` and `LOCK=NONE | SHARED | EXCLUSIVE`. **You never have to guess.** The
> senior move is to ask the engine to tell you, by writing the statement with the algorithm
> clause on a test clone, and reading what it accepts. Volume 7 covers the PostgreSQL
> specifics; Volume 8 covers InnoDB's online-DDL matrix.

### 1.2 Creating a Table: The Shape of a Good `CREATE TABLE`

The order of clauses in a `CREATE TABLE` is not cosmetic. It determines how the engine
records the constraints and, more importantly, it determines what a reader of the file
learns first.

```sql
CREATE TABLE orders (
    id            bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_id   bigint       NOT NULL,
    reference     varchar(32)  NOT NULL,
    status        order_status NOT NULL DEFAULT 'PENDING',
    total_cents   bigint       NOT NULL DEFAULT 0,
    tax_bps       integer      NOT NULL DEFAULT 0,
    currency      char(3)      NOT NULL DEFAULT 'GBP',
    placed_at     timestamptz  NOT NULL DEFAULT now(),
    created_at    timestamptz  NOT NULL DEFAULT now(),
    updated_at    timestamptz  NOT NULL DEFAULT now(),
    CONSTRAINT orders_customer_fk
        FOREIGN KEY (customer_id) REFERENCES customers (id),
    CONSTRAINT orders_total_nonneg
        CHECK (total_cents >= 0),
    CONSTRAINT orders_tax_range
        CHECK (tax_bps BETWEEN 0 AND 10000)
);
```

Five decisions in that statement are worth defending out loud, and each of them is a
`TRADE-OFF` rather than a default:

1. **`GENERATED ALWAYS AS IDENTITY` rather than a sequence or `SERIAL`.** The
   `SERIAL` / `BIGSERIAL` types are pseudo-types: `SERIAL` is sugar for "create a sequence,
   create a default, create a `NOT NULL` column", and the sequence is an *independent
   object* with a lifetime you do not control. If you drop the table, the sequence survives
   and keeps burning. Identity columns tie the sequence to the column, which is why they
   became standard SQL and why `SERIAL` is on its way out. Volume 7 covers the sequence
   caching behaviour that makes `SERIAL` also a correctness problem.
2. **Money as `bigint` cents, not `NUMERIC`.** See Chapter 2.3 — the argument is about
   rounding, arithmetic precision, and index size, and the interview answer is a sentence
   long.
3. **`status` as an enum type rather than a `varchar` with a `CHECK`.** Both enforce the
   same domain; the enum makes the set a first-class object you can extend with
   `ALTER TYPE ... ADD VALUE`, which does not rewrite the table, whereas changing a
   `CHECK` constraint means dropping and re-adding and re-validating every row.
4. **`timestamptz` and never `timestamp` for wall-clock instants.** Chapter 2.8.
5. **`updated_at` maintained by a trigger or the application, stated explicitly.** A column
   that is *nominally* maintained and *actually* not is a bug that reports itself as "the
   audit log says the record never changed" nine months later.
> **INTERVIEW TRAP — "WHAT IS THE DIFFERENCE BETWEEN A `PRIMARY KEY` AND A `UNIQUE` ON THE
> SAME COLUMN?"**
>
> The reflexive answer is "`PRIMARY KEY` is stronger" or "the PK is the identity". Both miss
> the mechanical differences that actually cost you time. There are four:
>
> 1. **`NOT NULL`.** A `PRIMARY KEY` implies `NOT NULL`; a `UNIQUE` constraint does not. In
>    most engines you can have exactly one `NULL` under a `UNIQUE` constraint — or many, see
>    Chapter 3.6 — which means `UNIQUE` alone does not identify a row.
> 2. **Index type and the `INVISIBLE`/`WHERE` options.** PostgreSQL creates a `PRIMARY KEY`
>    as a unique B+ tree; MySQL/InnoDB makes the `PRIMARY KEY` *the clustered index*, and
>    therefore cannot make it invisible or partial. A `UNIQUE` constraint there is a
>    secondary index and can be both. This is the single largest structural difference and
>    it is why a wide primary key is a much worse mistake in MySQL than in PostgreSQL.
> 3. **Referential target.** Only a `PRIMARY KEY` or a `UNIQUE` constraint can be the target
>    of a foreign key — you cannot reference an arbitrary index. (You can in MySQL, which
>    loosens the rule and lets you point at a non-unique index; that is a divergence, not a
>    permission worth taking.)
> 4. **The optimiser's freedom.** Many engines let a query planner assume a PK has no
>    duplicates at all, even when the planner must be told a `UNIQUE` might have duplicates
>    because of `NULL`s. This is why `SELECT DISTINCT` is sometimes dropped on a PK-joined
>    query and never on a `UNIQUE`-joined one.
>
> The staff-level addition: a `PRIMARY KEY` is a *design claim* that this column identifies
> the row, forever, including in every other system that reads your schema. A `UNIQUE` is a
> claim that a *business rule* holds today. When the business rule changes — and business
> rules change, email addresses get reused, phone numbers get recycled — you drop a `UNIQUE`
> in seconds and you are still arguing about the PK for a quarter.

### 1.3 `IF EXISTS` and `IF NOT EXISTS`: What They Hide

`CREATE TABLE IF NOT EXISTS` and `DROP TABLE IF EXISTS` are the most-used tokens in
migration tooling, and both of them suppress a signal you sometimes need.

```sql
-- The dangerous pair. Both succeed. Neither tells you what it did.
CREATE TABLE IF NOT EXISTS metrics_daily (day date, requests bigint);
DROP TABLE IF EXISTS metrics_daily;
```

The two failure modes, both real and both seen in production:

- **A typo in a `CREATE` silently does nothing.** You meant `metrics_daily_v2`; the table
  `metrics_daily_v2` already exists from a half-applied migration three deploys ago, with
  *last week's* column layout. `IF NOT EXISTS` turns a loud failure into a silent no-op,
  and the deploy reports green.
- **A `DROP ... IF EXISTS` in a rollback script deletes the wrong generation of a table.**
  The rollback for `v2 → v3` runs `DROP TABLE IF EXISTS customers` and, because `v4` has
  not been created yet at that point in the sequence, it succeeds and takes the live table
  with it.
> **INTERVIEW TRAP — "IS IT SAFE TO USE `IF NOT EXISTS` IN MIGRATIONS?"**
>
> The common answer is "yes, it makes migrations idempotent". The mechanism says otherwise.
> `IF NOT EXISTS` makes migrations *idempotent by suppressing the evidence*. Idempotency is
> a property you want; suppressing the difference between "already correct" and "already
> wrong" is not the same thing, and a migration tool cannot tell them apart, so neither can
> you.
>
> The staff-level practice is to reserve the clause for genuinely disposable paths — a
> scratch table in a smoke test, an index that a concurrent migration may already have built
> — and to use a real migration tool (Flyway, Liquibase, Django migrations, `alembic`) that
> keeps a *version history* rather than inferring state from the catalogue. The tool's
> checksum of the migration file is the thing that catches a script that was edited after it
> ran; `IF NOT EXISTS` catches nothing at all. A tool that records what it did can tell you
> the difference between "step 7 already ran" and "step 7 produced nothing"; the clause
> cannot.
>
> The failure this prevents: on a team of twenty, the migration runner is
> `flyway-migrate` on deploy and `flyway-info` in CI. Flyway is right, the clause is a
> workaround for the fact that someone is running raw `psql` against production from a
> laptop. Fix the process, not the SQL.

### 1.4 The `ALTER TABLE` Cost Table

This is the table to memorise, and memorising it is *not* the point — knowing how to ask
your engine for the answer is. PostgreSQL's documentation lists lock levels and rewrite
behaviour per subform; MySQL's documentation has a full online-DDL support matrix. Both are
authoritative and both are read by very few engineers.

| Statement | PG lock | Rewrites table? | Notes |
| --- | --- | --- | --- |
| `ADD COLUMN` (nullable, no default) | `ACCESS EXCLUSIVE` | no | brief; metadata only |
| `ADD COLUMN … DEFAULT <constant>` | `ACCESS EXCLUSIVE` | no (PG 11+) | constant is folded into a missing-value marker |
| `ADD COLUMN … DEFAULT <volatile fn>` | `ACCESS EXCLUSIVE` | **yes** | `DEFAULT now()` rewrites; `DEFAULT (now() AT TIME ZONE …)` does not, because it is stable |
| `ADD COLUMN … NOT NULL` (no default) | `ACCESS EXCLUSIVE` | no | the *scan* is what is expensive; see below |
| `ADD COLUMN … NOT NULL DEFAULT 0` | `ACCESS EXCLUSIVE` | no (PG 11+) | instant since 11; a full rewrite on PG 10 and earlier |
| `DROP COLUMN` | `ACCESS EXCLUSIVE` | no | metadata only; the bytes stay until a rewrite |
| `RENAME COLUMN` / `RENAME TO` | `ACCESS EXCLUSIVE` | no | the cheapest meaningful DDL there is |
| `ALTER COLUMN TYPE` widening `varchar(n)→varchar(m)` | `ACCESS EXCLUSIVE` | no | length metadata only |
| `ALTER COLUMN TYPE` any other change | `ACCESS EXCLUSIVE` | **yes** | full heap rewrite + all indexes |
| `ALTER COLUMN SET DEFAULT` / `DROP DEFAULT` | `ACCESS EXCLUSIVE` | no | metadata only |
| `ALTER COLUMN SET NOT NULL` (PG 12+) | `ACCESS EXCLUSIVE` then `SHARE UPDATE EXCLUSIVE` | no rewrite | scans once to prove no `NULL`s exist |
| `DROP NOT NULL` | `ACCESS EXCLUSIVE` | no | instant |
| `ADD CONSTRAINT … CHECK/FK` (validated) | `ACCESS EXCLUSIVE` | no rewrite, **full scan** | blocks everything for the scan |
| `ADD CONSTRAINT … NOT VALID` | `ACCESS EXCLUSIVE` | no | brief; skips the scan |
| `VALIDATE CONSTRAINT` | `SHARE UPDATE EXCLUSIVE` | no | concurrent-friendly scan |
| `ADD PRIMARY KEY` | `ACCESS EXCLUSIVE` | **yes** | builds an index and rewrites the heap in PG |
| `CREATE INDEX` | `SHARE` | no | **blocks all writes** for the duration |
| `CREATE INDEX CONCURRENTLY` | `SHARE UPDATE EXCLUSIVE` | no | two table scans, may leave an invalid index |
| `ADD FOREIGN KEY` | `SHARE ROW EXCLUSIVE` on both | no | scans the child table |

```text
  Why the scan and the lock are separate costs, and why that matters:
    ACCESS EXCLUSIVE  ──►  the table is frozen. No SELECT. No INSERT.
                          Nothing queues except a queue of waiters.
      │
      │  400M-row scan, holding it, 9 minutes:
      │
      ▼
    every connection in production is now in lock-wait state
      │
      ▼
    pgbouncer pool_expiry fires, or the app's request timeout
    fires, and the *application* starts throwing timeouts —
    which looks like "the database went down" and pages you

  The fix is not a bigger lock timeout. The fix is to never
  hold ACCESS EXCLUSIVE for the length of a scan.
```

> **SCALING REALITY CHECK**
>
> The practical rule that falls out of the table: **on a table above roughly 10 million
> rows, nothing that scans may hold a lock that blocks reads.** Every row of the table above
> is a row you are asking the engine to touch while holding a lock that 8,000 connections
> are queued behind. The two techniques that exist for this are (1) `NOT VALID` plus
> `VALIDATE CONSTRAINT`, which splits one exclusive scan into a brief exclusive moment and a
> concurrent scan, and (2) `CREATE INDEX CONCURRENTLY`, which builds the index in two passes
> and accepts a brief window in which the index is invalid. Neither is free. Both are one
> hundred times better than a nine-minute `ACCESS EXCLUSIVE`.
>
> Below ~100,000 rows, none of this matters and you should stop reading about it. The
> crossover is not a rule of thumb to quote in an interview — it is a number you should go
> and measure on *your* table, because it depends on row width, on how long a scan takes on
> your hardware, and above all on how long your application can hold a connection open
> before its own timeout fires.

### 1.5 The Rename Is a Trap, and the Backfill Is the Fix

The single most expensive schema mistake a working system makes is renaming or retyping a
column in one statement, because the application code is deployed *separately* from the
migration and for a window the two disagree.

```text
  t=0    migration runs:  ALTER TABLE orders RENAME COLUMN user_id TO customer_id;
         ── instant, metadata only, and completely invisible to the running app
  t=0+1  the old app version receives a request, and generates
             SELECT user_id FROM orders WHERE id = ?
         ── ERROR: column "user_id" does not exist
  t=0+1  the new app version is not deployed yet
  ── total production errors: every request, for the length of the deploy gap
```

The fix is the **add / dual-write / migrate / contract** sequence, and it is worth knowing
by name because a staff engineer is expected to propose it unprompted:

```sql
-- 1. EXPAND. Add the new column, nullable, no default. Instant, no rewrite.
ALTER TABLE orders ADD COLUMN customer_id bigint;
-- 2. BACKFILL. In batches, outside a single long transaction.
--    (Chapter 5.7 covers batching properly; the shape is what matters here.)
UPDATE orders SET customer_id = user_id
 WHERE id BETWEEN :lo AND :hi AND customer_id IS NULL;
-- 3. DUAL WRITE. Old code writes user_id. New code writes both.
--    This is the phase that actually takes time in engineering hours, not SQL minutes.
--    A trigger is the alternative if you cannot change every writer:
CREATE FUNCTION sync_customer_id() RETURNS trigger AS $$
BEGIN
  NEW.customer_id := COALESCE(NEW.customer_id, NEW.user_id);
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER orders_sync_customer_id
  BEFORE INSERT OR UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION sync_customer_id();
-- 4. MIGRATE READS. Flip the read path to customer_id, one caller at a time.
--    Both columns now exist, so both old and new readers work.
-- 5. CONTRACT. Only once nothing reads or writes user_id.
ALTER TABLE orders DROP COLUMN user_id;
ALTER TABLE orders ADD CONSTRAINT orders_customer_fk
  FOREIGN KEY (customer_id) REFERENCES customers(id);
```

The phase people skip is step 5, and skipping it is why schema debt accumulates. A migration
that expands and never contracts leaves two columns carrying the same fact, which is a
denormalisation without the benefits — and Volume 5 Chapter 5 is the chapter about what that
costs. A good team puts a *date* in the migration comment: "drop `user_id` after 2026-11-30
once grep finds no readers", and an alert on the date.

> **TRADE-OFF — "SHOULD WE EVER RENAME A COLUMN IN ONE STEP?"**
>
> **Yes, in exactly one situation**: a table with no application reading it — a table that
> is about to be dropped, a scratch or staging table, an internal table whose only consumer
> is a batch job you will pause for the duration, or a table small enough that the migration
> and the deploy happen in the same maintenance window with the application *stopped*.
>
> **No, in every other situation**, because the deploy and the migration are different
> events with an unpredictable gap between them, and a `RENAME` is exactly the kind of
> operation that is atomic on one side and catastrophic on the other. The expand/contract
> sequence costs you two columns and two deploys. A rename costs you zero columns and,
> if the gap is thirty seconds, an incident channel.
>
> The condition that flips the answer: **can you prove there is no reader other than the
> code you are about to change?** `pg_stat_statements` and the engine's slow-query log are
> how you prove it, not confidence.
> **PRODUCTION SCENARIO**
>
> Problem: a Tuesday deploy at 10:15 produces a spike of HTTP 500s. The error is
> `column "user_id" does not exist`. Nobody is paged because the migration step reported
> success.
> Investigation: the release had a `ALTER TABLE orders RENAME COLUMN user_id TO
> customer_id` in step 3 and the code change in step 5. Step 3 finished at 10:15:04. The
> application pods began restarting at 10:15:31 and the first old-version pod served a
> request at 10:15:33. The window was 29 seconds, in which roughly 40,000 requests failed
> with a 500.
> Root cause: schema and code were coupled in a single deploy unit with no expand phase.
> The rename is instant and therefore feels harmless, which is exactly what makes it
> dangerous — its cost is zero in the database and total in the application.
> Solution: roll back. `ALTER TABLE orders RENAME COLUMN customer_id TO user_id;` is just
> as instant in the other direction, and it was issued 40 seconds later, before any new
> pod had started.
> Prevention: a schema-change checklist requiring an expand/contract plan for any change to
> a column a running application references, enforced by a migration lint rule that rejects
> `RENAME COLUMN`, `ALTER COLUMN TYPE` and `DROP COLUMN` against a table in the live schema.

### 1.6 `DROP` and the Order of Destruction

`DROP` is the only irreversible statement in ordinary SQL, and the reason it needs a
conversation is not that it cannot be undone — it is that the *breadth* of what it removes
is almost never what the author intended.

```sql
DROP TABLE orders;
```

What actually happens, in order, is: the table's data file is unlinked, its indexes are
dropped, every **view** that referenced it is dropped with it, every **foreign key** in
*other* tables that referenced it is dropped, every **function or trigger** in the database
that mentioned its columns may fail to be replaced and can leave a broken object, and the
**privileges** and **ownership** attached to it disappear. In PostgreSQL the same is true
for the sequence owned by a `SERIAL` column, the type in the case of an enum, and the
`SECURITY LABEL` and comments.

```text
  DROP TABLE orders;
      │
      ├── the table's data file                        gone
      ├── its 7 indexes                               gone
      ├── view order_summary                          CASCADED — silently
      ├── matview revenue_by_day                      CASCADED — silently
      ├── FK from order_line → orders                 CASCADE — silently
      ├── sequence orders_id_seq                      ORPHANED (SERIAL only)
      └── the 40 stored functions that took a          may now fail to execute
          composite type named after the table          at CREATE time
```

> **PRODUCTION RELEVANCE**
>
> The reflexive safety behaviour — wrap the drop in a transaction and `ROLLBACK` — does not
> work for DDL in most engines, and this surprises people. PostgreSQL *does* give you
> transactional DDL, so `BEGIN; DROP TABLE orders; ROLLBACK;` is a genuine dry run there.
> MySQL **does not**: DDL causes an implicit commit, so the drop is already durable before
> you get the chance to roll back. The safe pre-flight is therefore not a transaction — it
> is a dependency query.
>
> ```sql
> -- PostgreSQL: what would this actually destroy?
> SELECT dependent_ns.nspname AS schema, dependent.relname AS object,
>        dependent.relkind
>   FROM pg_depend d
>   JOIN pg_rewrite r        ON r.oid = d.objid
>   JOIN pg_class dependent  ON dependent.oid = r.ev_class
>   JOIN pg_class src        ON src.oid = d.refobjid
>   JOIN pg_namespace dependent_ns ON dependent_ns.oid = dependent.relnamespace
>  WHERE src.relname = 'orders';
> ```
>
> Running that before a `DROP` is thirty seconds of work that has prevented real incidents on
> more than one team, and it is also the query that answers "what will this break" in a
> design review.

### 1.7 `CREATE TABLE AS SELECT` and the Cloned-Schema Anti-Pattern

`CREATE TABLE new AS SELECT * FROM old` is the standard way to make a copy, and it is
almost always the wrong way.

```sql
-- what people write
CREATE TABLE orders_new AS SELECT * FROM orders;
-- what a copy is actually for, and what it costs
--   ✓ index definitions:        NOT copied
--   ✓ foreign keys:             NOT copied
--   ✓ check / unique constraints NOT copied
--   ✓ defaults, comments, grants, ownership: NOT copied
--   ✗ column types are *inferred* from the expression, not preserved
--   ✗ NOT NULL is preserved only if the source column is not nullable
--   ✗ the copy is a new physical table: full space cost, new statistics
```

The failure is specific and has bitten many teams: a table is "cloned" for a data
migration, the copy is missing the `UNIQUE` on `email`, the data is migrated, the old table
is dropped, and six weeks later a duplicate email is inserted because the constraint that
was protecting it was never in the new table. The invariant was not in the data; it was in
the schema, and the schema was the thing that was lost.

If you need a copy, the honest forms are:

```sql
-- PostgreSQL: preserves everything, including indexes, constraints, defaults
CREATE TABLE orders_new (LIKE orders INCLUDING ALL);
-- or, better, no copy at all: do the migration in place, in batches (Chapter 5.7)
-- or, best for very large tables, add-then-backfill-then-drop (Section 1.5)
```

> **INTERVIEW TRAP — "HOW WOULD YOU MIGRATE A 500-GB TABLE TO A NEW SCHEMA WITHOUT DOWNTIME?"**
>
> The answer people give is "create a new table, copy the data, swap" — the in-place
> rewrite, which is precisely the operation that requires the exclusive lock this question
> is trying to avoid. On PostgreSQL, `ALTER TABLE … ALTER COLUMN TYPE` takes
> `ACCESS EXCLUSIVE` for the entire rewrite, so a 500-GB rewrite is not a migration, it is
> an outage with extra steps.
>
> The correct answer is that you do **not** change the column's type at all. You *add* a new
> column of the new type, backfill it in batches with a keyset-paginated `UPDATE` outside a
> long transaction, dual-write for the duration, switch reads, and then drop the old column
> — the expand/contract sequence from Section 1.5. Every individual statement is either
> instant or a small, resumable batch. The swap is metadata, so switching readers is the
> only real cutover step and it is reversible in one statement.
>
> The staff-level additions are the three things nobody mentions: (1) the backfill must be
> **resumable**, so it paginates on the primary key and records its high-water mark, rather
> than running one `UPDATE` with a `WHERE id > last_seen`; (2) the batch size must be
> **adaptive**, because a batch that is fast on an idle table can be a 400 MB WAL burst on a
> busy one; and (3) the whole thing needs a **kill switch** — a flag the batch loop checks
> every iteration, so that when the WAL volume spikes at 02:00 you can stop it in one
> statement instead of during the incident call. Volume 5 Chapter 8 owns the outbox
> alternative; Volume 6 owns the partitioning rewrite that is sometimes the better answer
> entirely.

#### Common Mistakes

- Believing DDL is cheap because `RENAME COLUMN` and `ADD COLUMN` *are* cheap, and
  generalising that to `ALTER COLUMN TYPE` and `ADD CONSTRAINT`, which are not
- Using `CREATE TABLE IF NOT EXISTS` to make a migration idempotent, thereby making it
  impossible to tell "already correct" from "already wrong"
- Using `CREATE TABLE new AS SELECT *` to copy a table and losing every constraint and index
  in the process
- Renaming a column in the same deploy as the code change that stops using it, and
  discovering the 29-second window during the deploy rather than before it
- Believing `BEGIN; DROP TABLE x; ROLLBACK;` is a dry run — that works in PostgreSQL and
  silently does not in MySQL, where DDL implies commit
- Adding a `CHECK` to a large table in one statement and taking `ACCESS EXCLUSIVE` for the
  length of the validation scan
- Assuming `ALTER TABLE … SET NOT NULL` is instant, when it scans the table to prove the
  absence of `NULL`s

#### Interview Questions — Schema Evolution

**Q1. Why is renaming a column the most dangerous schema change you can make?** `STAFF`
Because it is instant in the database and total in the application. The statement itself
costs a catalogue entry and an `ACCESS EXCLUSIVE` lock held for a millisecond, so every
migration tool reports success and every dashboard says nothing happened — but the running
application still generates SQL containing the old name, and every one of those statements
now fails to parse. The deploy and the migration are separate events with an unpredictable
gap between them, and the gap is the outage. The correct answer is to never rename: add the
new column, backfill it in batches, dual-write from both application versions, switch reads
one caller at a time, and drop the old column later on a date. Two columns and two deploys
beats a thirty-second outage every time.

**Q2. Which `ALTER TABLE` statements rewrite the table, and why does it matter?** `ADVANCED`
The general rule is that a rewrite happens when the engine has to physically re-encode
every row. Adding a nullable column, renaming, setting or dropping a default, and widening
`varchar(n)` to `varchar(m)` are catalogue-only. Changing a column's type to anything else,
adding a `PRIMARY KEY`, and adding a `NOT NULL` column without a fast default all rewrite.
The subtlety worth volunteering is that modern PostgreSQL (11+) can add a column with a
*non-volatile* default instantly by recording the default in the catalogue and synthesising
the value on read — but a `volatile` default like `DEFAULT now()` still rewrites, and the
non-obvious workaround is to wrap it so it is only *stable*, e.g. `DEFAULT (now() AT TIME
ZONE 'utc')` or adding the column nullable, backfilling, then setting the default. It
matters because a rewrite holds `ACCESS EXCLUSIVE` for its entire duration, and on a large
table that is a production outage rather than a slow query.

**Q3. What locks does `ALTER TABLE` take, and how would you add a foreign key to a live
600M-row table?** `ADVANCED`

Lock levels vary by subform, and the ones that matter are `ACCESS EXCLUSIVE` (blocks reads
*and* writes — essentially the whole table) for most catalogue changes, `SHARE` (blocks
writes but allows reads) for `CREATE INDEX`, and `SHARE UPDATE EXCLUSIVE` for the operations
that are safe to run concurrently. Adding a validated `FOREIGN KEY` requires scanning the
entire child table to prove every row has a valid parent, and holding a lock strong enough
to stop the table changing underneath that scan. The safe sequence is: add it `NOT VALID`,
which takes a brief exclusive lock and skips the scan; then run `VALIDATE CONSTRAINT`
separately, which takes only `SHARE UPDATE EXCLUSIVE` and permits concurrent reads and
writes; then, in MySQL, use `ALGORITHM=INPLACE, LOCK=NONE` where supported. The constraint is
enforced for all new writes the moment the `NOT VALID` version is installed — only the
*existing* rows are unchecked — which is exactly the property you want, since the existing
rows were already correct by construction.

**Q4. How do you add a `NOT NULL` column to a 200M-row table in production?** `TRICKY`
You do not, in one statement, and the reason is that `SET NOT NULL` is not free even
though it does not rewrite. The engine must prove no row has a `NULL`, and that is a full
table scan. The safe sequence is three statements. (1) `ADD COLUMN status text` — nullable,
no default, instant, no rewrite, no scan. (2) Backfill in keyset-paginated batches:
`UPDATE t SET status = 'ACTIVE' WHERE id BETWEEN $lo AND $hi AND status IS NULL`. (3)
`ALTER TABLE t ALTER COLUMN status SET NOT NULL` — now a *validated* scan, but over a column
where the engine can use the null bitmap; PostgreSQL 12+ additionally scans with a check
constraint that can be validated separately, so you can add `CHECK (status IS NOT NULL)
NOT VALID`, `VALIDATE` it concurrently, and then apply the `SET NOT NULL` which is then
proved by the check rather than by a new scan. The whole sequence is resumable and every
step is individually short. The point worth making as a staff engineer is that every one of
these steps is *idempotent and restartable*, which is what a migration run in a deploy
pipeline actually requires.

**Q5. When is `IF EXISTS` / `IF NOT EXISTS` appropriate, and when is it a code smell?** `TRICKY`
Appropriate when the statement is genuinely best-effort and the alternative — failing a
deploy because a nightly job already dropped the scratch table — is worse than doing

nothing: dropping and recreating a staging table, creating an index that a concurrent

migrator may have already built, or in a test fixture. It is a code smell on any statement
touching a schema object that is supposed to exist, because it converts a loud, correct
failure into a silent no-op. The failure it hides is always the same: a migration that
believes it applied a change to a table that already existed in a different shape. The right
instrument is a migration tool with a version table and a per-migration checksum
(Flyway, Liquibase, Alembic, Django migrations), because that can tell the difference
between "step 7 already ran" and "step 7 did nothing at all", which the clause structurally
cannot. If you find `IF NOT EXISTS` in a hand-written production migration, that is a
review flag, not a style note.

**Q6. `DROP TABLE` in a transaction — does rolling back undo it?** `TRICKY`

It depends on the engine, and pretending otherwise is how people lose data. PostgreSQL has
transactional DDL: `BEGIN; DROP TABLE t; ROLLBACK;` is a genuine dry run, and the data is
intact. MySQL does not — DDL statements cause an implicit commit, so the moment `DROP
TABLE` succeeds it is durable and the `ROLLBACK` is a no-op on a transaction that has already
committed. The safe pre-flight is therefore a dependency query rather than a transaction:
join `pg_depend` to find every view, matview and foreign key that references the table, and
read the result before you run the statement. The broader point is that `DROP` does not
remove one object — it removes the table, its indexes, its sequence if it was a `SERIAL`,
every view that selects from it, and every foreign key in other tables that points at it.
The blast radius is rarely the one the author had in mind.

> **CHAPTER 1 SUMMARY**
>
> DDL is the part of SQL that takes the locks the application cannot route around, and the
> useful skill is not memorising syntax but knowing which statements are catalogue-only and
> which physically move data. The distinction to carry forward: `RENAME`, `ADD COLUMN`
> nullable, `DROP COLUMN`, `SET DEFAULT` and widening `varchar(n)` are instant; type changes,
> `ADD PRIMARY KEY`, and validated constraints over a large table take `ACCESS EXCLUSIVE`
> for the length of a scan or a rewrite. Because the deploy and the migration are separate
> events, the safe evolution of any column a running application touches is expand, backfill
> in resumable batches, dual-write, switch reads, contract later — never a rename. And
> because a schema is permanent, every irreversible statement should be preceded by a
> dependency query rather than a transaction you assume will roll back.

#### Further Reading

- [PostgreSQL — ALTER TABLE](https://www.postgresql.org/docs/current/sql-altertable.html) — the per-subform lock levels and rewrite notes; the single most useful page in the documentation for this chapter.
- [PostgreSQL — Don't Store Money as a Floating Point Number](https://www.postgresql.org/docs/current/datatype-numeric.html) — why `NUMERIC`, not `float`, for exact decimals, in the engine's own words.
- [MySQL — Online DDL Operations](https://dev.mysql.com/doc/refman/8.0/en/innodb-online-ddl-operations.html) — the `ALGORITHM` / `LOCK` matrix showing which changes are instant, in-place or copying.
- [PostgreSQL — Database Schema Best Practices](https://www.postgresql.org/docs/current/ddl-manage.html) — the official guidance on keeping migrations reversible, including the expand/contract advice this chapter is built on.
- [Prisma — Expand and Contract Data Migrations](https://www.prisma.io/datasearch/tutorials/expand-and-contract-patterns) — a clean, engine-agnostic treatment of the sequence in Section 1.5, with the deployment-ordering failure it prevents.

## Chapter 2 — Data Types, Collation & Precision

### 2.1 A Type Is a Constraint You Can Never Remove

The framing that makes type choices interesting is that a column type is not a storage
optimisation. It is a *rule about the data, enforced by the engine on every write, forever*,
and it is one of the cheapest protections in the system — which is exactly why it is also
one of the hardest things to walk back.

```text
  NUMERIC(12,2)          cannot hold 12.4                 (enforced, forever)
  NUMERIC(12,2)          silently ROUNDS 12.345 to 12.35  (PostgreSQL, always)
  bigint                 cannot hold 2^63                  (enforced, forever)
  varchar(255)           cannot hold a 300-char string     (enforced, forever)
  char(3)                cannot hold 'GBPX'                (enforced, forever)
  timestamptz            cannot hold a naive local time    (enforced, forever)

  To change any of these you need a table rewrite (see Chapter 1), which means
  a lock. So the decision you make in a design review in March is the decision
  that costs you a maintenance window in November.
```

The interview question is never "should I use `bigint` or `int`". The interview question is
"what happens the day you are wrong", and the answer is a lock, a rewrite, and a deploy
window.

### 2.2 `int` vs `bigint` and the Arithmetic That Silently Wraps

The 32-bit signed range is `-2,147,483,648` to `2,147,483,647`. That looks enormous right up
until you have a table with a few million rows and an incrementing surrogate key, or a counter
column that counts events.

```sql
CREATE TABLE page_views (
    id        int GENERATED ALWAYS AS IDENTITY PRIMARY KEY,   -- 2.1 billion rows
    path      text NOT NULL,
    viewed_at timestamptz NOT NULL
);
```

The interesting part is not that the table breaks. It is **how it breaks**, and the answer
differs by engine, and that difference is the whole content of this section.

```text
  OVERFLOW BEHAVIOUR — the part nobody has tested
  ─────────────────────────────────────────────
  INSERT 2147483647  →  succeeds
  INSERT 2147483648  →  ERROR: integer out of range
                      ── loud, immediate, obvious. You will find this.

  id = 2147483647, then:
  INSERT ... (id = 2147483647 + 1)          →  ERROR, as above

  But arithmetic on the column:
  UPDATE t SET id = id + 1 WHERE id > 2000000000;
      PostgreSQL   →  ERROR: integer out of range       (strict; checked)
      MySQL        →  wraps to -2147483648 (or clamps,
                     depending on sql_mode)             (silent!)

  And this, which is the real one:
  SELECT SUM(total) FROM orders;
      int SUM overflows at ~2.1 billion and the answer is
      WRONG SILENTLY in MySQL unless sql_mode = STRICT_TRANS_TABLES /
      NO_UNSIGNED_SUBTRACTION is set. PostgreSQL widens SUM(int)
      to bigint and is correct.

  And the one that is genuinely a data-loss bug:
  SELECT count(*) FROM events;   -- count(*) returns bigint: safe
  SELECT SUM(amount) ...         -- SUM of an int column: NOT safe
```

> **INTERVIEW TRAP — "WHY USE `bigint` FOR AN ID WHEN `INT` HOLDS 2 BILLION?"**
>
> Because the `int` ceiling is not a per-table problem, it is a *lifetime* problem, and the
> relevant number is not "how many rows will I have in the first year" but "how many rows
> will this table have before it is retired". A table that will be partitioned annually and
> dropped is genuinely fine as `int`; a table that is append-only and never archived — an
> event log, a page-view table, an audit trail — will cross 2.1 billion, and it will cross
> it at 2am on a Saturday.
>
> The senior addition is that the interesting failures are not on `INSERT` but on
> *arithmetic*. MySQL's default `sql_mode` has historically wrapped or clamped integer
> overflow rather than raising an error, so `UPDATE t SET counter = counter + 1` past the
> boundary silently produces a negative number, and `SUM()` over an `int` column silently
> returns a wrong total. PostgreSQL raises an error in both cases, and widens `SUM(int)` to
> `bigint` in aggregate. The trap in the trap is that this makes the bug *engine-specific*,
> so a schema that is safe on PostgreSQL and unsafe on MySQL is a schema that has been
> tested on the wrong database.
>
> The staff-level answer: the cost of `bigint` is 4 extra bytes per value and a marginally
> larger index — on an 8 kB page holding 200-byte rows, that is roughly a 2% page-count
> difference on the clustered structure. That is not a consideration. The cost of being wrong
> is a silent data-corruption incident in the one table nobody backfills. **Take the
> `bigint`.** And note the exceptions: a local small lookup table that is rebuilt weekly, or
> a `rowversion`/`xmin`-style system column the engine manages itself, are legitimate
> `int`.

### 2.3 `NUMERIC` vs `float` vs `double precision`: The Money Answer

This is the most-asked technical question in database interviews and the most-misanswered,
because candidates reach for "floats have rounding errors" as a slogan rather than as a
mechanism.

**Why binary floating point cannot represent 0.1.** A `float` (32-bit) or `double
precision` (64-bit) stores a *sign*, an *exponent*, and a *significand* — a binary fraction.
0.1 in binary is `0.0001100110011...`, a non-terminating expansion, exactly as 1/3 is
non-terminating in decimal. The hardware rounds to the nearest representable value, so what
you store is not 0.1 but the closest binary fraction to it.

```text
  0.1 as a double, in base 10:
    stored  0.1000000000000000055511151231257827021181583404541015625
            └──── the error is ~5.5e-18 ────┘

  0.1 + 0.2 in IEEE 754 double:
    result  0.30000000000000004
    ✓ not 0.3. The error is representational, and it does not cancel.

  The classic that breaks a financial report:
    SELECT 0.1::float + 0.2::float = 0.3::float;   -- false
    SELECT 0.1::numeric + 0.2::numeric = 0.3;      -- true

  And the accumulating one, over 10,000 lines of $0.10:
    float:     1000.0000000001591
    numeric:   1000.00
    difference: 1.6e-4 — small, non-zero, and never goes away
```

The mechanism for `NUMERIC` is completely different: it is a **base-10 decimal type
implemented with an integer significand and a scale**. `NUMERIC(12,2)` means "a signed
12-digit decimal number with the last two digits being the fraction", stored as an integer
scaled by 100. 0.10 is the integer 10. It is *exact*, by construction, for any value within
its precision — which is why it is the correct type for money, quantities with fixed scale,
tax rates, and anything you will `SUM`.

```sql
-- What you want
CREATE TABLE ledger_entry (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    amount      numeric(18,4) NOT NULL,   -- 14 integer digits, 4 decimal places
    currency    char(3)       NOT NULL,
    posted_at   timestamptz   NOT NULL
);
-- What quietly costs you a penny
CREATE TABLE ledger_entry (amount float NOT NULL);          -- never
CREATE TABLE ledger_entry (amount numeric(38,10) NOT NULL); -- unbounded-ish; see below
CREATE TABLE ledger_entry (amount double precision);        -- never, for money
```

Three refinements that separate a senior answer from a mid-level one:

1. **Scale is a rounding decision, not a display decision.** `NUMERIC(12,2)` *rounds* on
   insert in PostgreSQL — it does not error. If your value must not be rounded, the correct
   fix is a `CHECK` constraint (`CHECK (amount = round(amount, 2))`), not a wider column.
   This is exactly the failure in the `NUMERIC(12,2)` ledger in Volume 1's production
   scenario, and it is worth volunteering unprompted.
2. **Very wide `NUMERIC` is not free.** `NUMERIC` up to a certain precision is stored inline
   in the tuple; beyond the engine's chosen threshold (around 1,000 bytes of digits) it
   spills to out-of-line storage, and moderately wide numerics are stored in a
   variable-length encoding that is more expensive to compare and index than a `bigint`.
   `numeric(38,10)` is a 38-digit value, not a free choice.
3. **The best money type is often an integer in the smallest unit.** `bigint` cents is exact,
   8 bytes fixed-width, the fastest to compare and the smallest to index, and it makes the
   rounding boundary structurally impossible because there is no fraction to round. The
   price is that arithmetic must be explicit — you cannot `SUM` across currencies without
   converting, and division loses the remainder unless you handle it. Volume 6 owns the
   multi-currency modelling question.
> **TRADE-OFF — "MONEY AS `NUMERIC` OR AS INTEGER CENTS?"**
>
> **`NUMERIC(18,4)` wins** when the domain genuinely has fractional units and human review
> matters: FX conversion rates, unit prices per kilogram, tax computed at sub-cent
> precision in some jurisdictions. It reads correctly in a `SELECT`, so a support engineer
> running a query by hand gets the right answer without knowing your convention, and it
> survives being read by a spreadsheet.
>
> **Integer minor units win** when the domain is one currency with two decimals, which is
> most payment systems. Fixed-width 8 bytes, the fastest comparison, the smallest index,
> and no rounding path exists at all — the bug class of "we rounded a penny" is
> unrepresentable rather than merely guarded. The cost is convention: every human doing
> ad-hoc SQL has to remember to divide by 100, and a column named `amount_cents` in a
> codebase where another is named `amount` is a real source of a 100× error.
>
> **The condition that flips the answer** is how many people query the column outside your
> application. If the answer is "a finance analyst, a support agent, and a monthly report
> written by hand", use `NUMERIC` and pay the storage. If the answer is "only services, and
> all of them go through one repository method", use integer minor units and enforce the
> conversion in exactly one place. The interview answer that lands is: *"both are exact, and
> the choice is about who else has to read the column."*

### 2.4 `TEXT` vs `VARCHAR(n)`

The reflexive answer is "`VARCHAR(n)` saves space because it is bounded". This is wrong in
PostgreSQL, near-irrelevant in MySQL, and misses the actual reason to prefer one.

```text
  PostgreSQL  ── varchar(n) and text are THE SAME STORAGE
               `text` is a 4-byte length header + the bytes.
               `varchar(n)` is a 4-byte length header + a MODIFIER
               stored in the system catalogue, and the length is NOT
               enforced on the tuple at all — only the CHECK-ish
               constraint on the value itself.
               A `varchar(1)` and a `text` column holding the same
               short string occupy identical bytes.

  MySQL InnoDB ── `varchar(n)` stores a 1- or 2-byte length prefix.
               `text` is stored OFF-PAGE beyond a threshold
               (65,535 bytes for a row, effectively), and
               reading a `text` column means reading from
               overflow pages even when it holds 12 characters.
               Here the difference is real.
```

There is also a **statistics** difference that surprises people and has bitten real systems:
PostgreSQL's planner can use a declared `varchar(n)` as weak evidence of average row width
when planning. Changing `text` to `varchar(500)` on a column that in practice holds 20
characters changes the planner's estimate of how many rows fit on a page, which changes
join-strategy choices, which can change a fast query into a slow one for reasons that have
nothing to do with your change.

> **MUST REMEMBER**
>
> `varchar(n)` is a *constraint*, and its only benefit over `text` is that it refuses bad
> data. In PostgreSQL it costs nothing to store. Reach for it when the business has a real
> maximum, and for `text` when the honest answer is "I do not know, and the answer should
> not be my problem." A `varchar(255)` on a column that legitimately holds a 4,000-character
> description is a support ticket and an outage; a `text` column that should have been
> `varchar(64)` is a few extra megabytes and a missing piece of validation that belongs in a
> `CHECK` or, better, nowhere at all.

### 2.5 `CHAR(n)`: The Padding Rule Nobody Teaches

`CHAR(n)` stores the value blank-padded to exactly `n` characters, and the semantics that
follow from that are obscure enough that they generate real bugs.

```sql
CREATE TABLE currency (code CHAR(3) NOT NULL PRIMARY KEY);
INSERT INTO currency VALUES ('GBP');
INSERT INTO currency VALUES ('GBP');   -- succeeds! Different PK value internally.
```

**The rules, precisely:**

- A `CHAR(n)` value is **right-padded with spaces** to `n` on storage. `'GBP'` is stored as
  `'GBP'` at 3 characters, but `'G'` in a `CHAR(3)` is stored as `'G  '` — three characters,
  two of them spaces.
- **Comparisons ignore trailing spaces** in most engines when the *other* side is also a
  character type. This is the ANSI `PAD SPACE` collation behaviour, and it is the default
  in PostgreSQL and in most MySQL collations. So `'G' = 'G  '` is **true**.
- The consequence that produces the bug: a **primary key on a `CHAR(n)`** column does *not*
  necessarily reject what looks like a duplicate, in engines that apply pad-space comparison
  — but a **`UNIQUE` index implementation that stores the padded bytes** may reject it, or
  the reverse. The two behaviours coexist in the wild because it depends on whether the
  comparison went through a `BTREE` index (byte comparison of the padded form) or through a
  sequential scan with the type's comparison operator (pad-space comparison). This is a
  genuine, documented class of cross-path inconsistency.
- **`VARCHAR` does not pad.** So in a comparison between a `CHAR(3)` and a `VARCHAR(10)`
  column, the collation rules decide, and the answer is not always "the same as comparing
  two `CHAR(3)`s".

```text
  CHAR(3)  'GBP'   → bytes: 47 50 42                     (exactly 3, no padding needed)
  CHAR(3)  'G'     → bytes: 47 20 20                     (padded with two spaces)
  CHAR(3)  'G' = 'G   '                                → TRUE  (pad-space comparison)

  The trap, stated as it appears in a ticket:
    INSERT INTO currency VALUES ('GBP');   -- ok
    INSERT INTO currency VALUES ('GBP');   -- ??? depends on the access path
    and, on a JOIN:
      c.code = i.currency_code            -- CHAR(3) vs VARCHAR(3)
    'GB' = 'GB '                         -- TRUE here, and the join
                                         -- matches a row you did not expect
```

> **PRODUCTION RELEVANCE**
>
> The realistic modern usage of `CHAR(n)` is a fixed-width country or currency code where
> the ISO standard guarantees the length, and it is genuinely defensible there. The
> realistic *harm* is a `CHAR(2)` state code padded into a join against a `VARCHAR(2)` that
> somebody trimmed, which matches more rows than anyone expects and produces a report that
> is 3% too large with no error anywhere. The staff-level guidance is simple: **use `CHAR(n)`
> only when the domain standard fixes the width exactly, and prefer a `CHECK (col ~ '^[A-Z]{3}$')`
> on a `char(3)` over any assumption about how it was written.** Postgres's `BPCHAR` type
> comparison is the direct way to see the padding rule:
> `SELECT 'G'::bpchar = 'G'::bpchar;` — the literal is cast, padded, and compared.

### 2.6 Collation: Where Comparison Semantics Live

A collation is a set of rules for comparing character strings: which characters are
considered equal, which sort before which, whether case matters, and how accents and
punctuation are weighted. It is not a display setting. **It changes the meaning of `=`, of
`ORDER BY`, of `GROUP BY`, of `UNIQUE`, and of every index built on that column.**

```sql
-- In a case-insensitive, accent-insensitive collation:
SELECT * FROM users WHERE email = 'John.Doe@Example.COM';
   -- matches 'john.doe@example.com' — which is often what you want for login
-- In the same collation:
CREATE UNIQUE INDEX users_email_key ON users (email);
   -- and now 'John@x.com' and 'john@x.com' are the SAME KEY,
   -- so the second insert fails. Which is also often what you want.
-- But in a case-SENSITIVE collation, the same query returns nothing
-- and a user typing a different case gets "account not found".
```

```text
  THE CASE-INSENSITIVE UNIQUENESS PROBLEM
  ──────────────────────────────────────
  The schema:  email text, UNIQUE (case-sensitive, default)
  INSERT 'Alice@x.com'   ── ok
  INSERT 'alice@x.com'   ── ok        ← the "constraint" did not stop it
  INSERT 'ALICE@x.com'   ── ok        ← nor this

  The team believes:  "email is unique in our database."
  The database says:  "the exact byte sequence is unique."

  The fix, part 1 — normalize on write (the correct answer, usually):
      CREATE DOMAIN citext AS text COLLATE "en_US_ci";
      -- or a generated column, or normalise in the app

  The fix, part 2 — a functional index (the pragmatic answer):
      CREATE UNIQUE INDEX users_email_ci
          ON users (lower(email));
      -- and then the CHECK that everything is actually lower:
      ALTER TABLE users ADD CONSTRAINT email_lowercase CHECK (email = lower(email));

  The fix, part 3 — the WRONG one:
      CREATE UNIQUE INDEX users_email
          ON users (email COLLATE "en_US_ci");
      -- this DOES work for the index, and it also silently changes
      -- the semantics of every '=' comparison on that column,
      -- including ones you did not intend to change.
```

> **INTERVIEW TRAP — "WHY DID THE UNIQUE CONSTRAINT NOT CATCH THE DUPLICATE EMAIL?"**
>
> Because a `UNIQUE` constraint is a constraint on *the value as stored*, and "the value as
> stored" is a byte comparison under a particular collation. The default collation in almost
> every configuration is **case-sensitive**, so `'Alice@x.com'` and `'alice@x.com'` are two
> different byte sequences and the constraint is satisfied. The team wrote "email is unique"
> and the database implemented "the exact case-sensitive string is unique", and neither of
> those statements is false — the gap between them is the bug.
>
> The senior answer goes to the cause, which is that uniqueness is a claim about *identity*
> and the case of an email address is not part of anyone's identity. So the fix is not to
> make the index case-insensitive, which changes comparison semantics for every query on
> that column including ones you did not think about; the fix is to **normalise on write** —
> store lowercase, enforce it with a `CHECK (email = lower(email))` so the normalisation
> cannot be skipped by a future writer, and index the normalised value. A
> case-insensitive *collation* on the column is a legitimate alternative when you genuinely
> want `'José'` and `'Jose'` to be the same person, but then you have also decided something
> about accents, and you should be aware you have decided it.
>
> The staff-level addition is the second-order consequence people miss: an index declared
> `COLLATE "en_US_ci"` silently changes the semantics of every `=` and `GROUP BY` on that
> column in the whole database, including queries that were written and tuned long before
> anyone thought about case. The choice of index collation is a schema-wide decision wearing
> a small piece of syntax, and it deserves the same review as adding a column.

### 2.7 Timestamps: With, Without, and the Bug That Follows

`timestamp without time zone` stores a *wall-clock reading with no reference to any
reference point*. It is a lie of omission: it looks like a time, and it is not.

```text
  2026-03-29 01:30 in Europe/London
  ─────────────────────────────────────────────────────────────────
  2026-03-28 23:30 UTC            (GMT, before the DST switch)
  2026-03-29 02:30 BST            (UTC+1, after the DST switch)

  Store `timestamp` and you store "01:30" and a type that says
  "this is 01:30, and I promise nothing about which 01:30."
  Store `timestamptz` and you store a single point on the
  universal timeline: 2026-03-29T01:30:00Z.
  The *display* then differs per session, which is correct,
  because that is what time actually does.
```

The bug it causes, in the shape it takes in production:

1. Server A writes `created_at` using its local clock in `timestamp` columns.
2. The application fleet is migrated to a second region, or the host's timezone changes
   because of a base-image upgrade, or a developer runs a script from a laptop in
   `America/New_York`.
3. Rows from region A and region B are now **not comparable**. A dashboard showing "orders
   per hour" double-counts 01:00–02:00 on the spring DST day and *loses an hour* on the
   autumn one, and the error is 100% on exactly the two days nobody tests.
4. Worse, once written, the information is **destroyed**. You cannot recover which reading
   was actually UTC, because the column does not record it.
The reason this is so common is that `timestamp` and `timestamptz` are visually

indistinguishable in most tools, the default for a naive ORM mapping is the naive type, and
`CURRENT_TIMESTAMP` returns a `timestamptz` that is *silently cast* to a `timestamp` the
moment you store it — so the type system offers no warning at all.

```sql
-- PostgreSQL
CREATE TABLE event_log (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    occurred   timestamptz NOT NULL,     -- the instant. Always.
    recorded   timestamptz NOT NULL DEFAULT now()   -- when we learned it
);
-- the two-column pattern is the correct one and costs nothing
-- the two mistakes, both of which appear constantly
CREATE TABLE event_log (occurred timestamp);                 -- no zone: the bug
CREATE TABLE event_log (occurred timestamp DEFAULT now());   -- ALSO no zone — cast!
```

> **MUST REMEMBER**
>
> `timestamptz` does **not** store a timezone; it stores a UTC instant and renders it in the
> session's timezone on read. That is exactly the behaviour you want, and the reason it is
> correct is that the rendering is a presentation concern, not a data concern. The one thing
> `timestamptz` genuinely cannot do is tell you what the local time *was* where the event
> happened — a store in Tokyo and a store in London both store the same instant — and if you
> need that, it is a separate `text` column with the IANA zone name, set at write time by the
> client that knows. The rule is: **instants are `timestamptz`, durations are `interval`,
> wall-clock local times that mean something to a human are `timestamp` plus an explicit
> zone column, and the default for anything called `created_at` is `timestamptz`.**

### 2.8 JSON vs Text, and the Shape of the Trade

A native `json`/`jsonb` type is genuinely different from storing JSON in a `text` column,
and the difference is a validation guarantee.

| Aspect | `text` holding JSON | Native `jsonb` |
| --- | --- | --- |
| Validation on write | none | the whole document is parsed; malformed JSON is rejected |
| Key order | preserved as written | normalised — last key wins on duplicate keys |
| Duplicate keys | preserved | collapsed, last one wins |
| Whitespace | significant to the byte length | stripped on parse |
| Key lookup | application parses the string | indexable, and an expression index can index one path |
| Comparison / dedupe | byte equality | semantic equality, so `{"a":1,"b":2}` = `{"b":2,"a":1}` |
| Write cost | a memcpy | a full parse and re-serialise |

The two consequences that decide it in practice:

- **The write-path cost is real.** Storing a `jsonb` document means parsing it on every
  `INSERT` and `UPDATE`. For a wide document written on a hot path, that is measurable CPU,
  and for a wide document with a small frequently-read part, it is the reason to extract that
  part into a real indexed column instead.
- **Semantic equality changes what `UNIQUE` means.** Two `jsonb` values that differ only in
  key order or whitespace are *equal*, so a `UNIQUE` constraint on a `jsonb` column is a
  constraint on meaning rather than on bytes. That is usually what you want and occasionally
  a surprise.
The deeper question is not "json or text" but "**is this a column or a table**". The moment
you want to join on a JSON field, aggregate across it, constrain it, or reference it from
another table, the honest answer is a column. The use cases where JSON earns its place are
narrow and worth naming precisely:

- genuinely heterogeneous payloads, where the shape is client-defined and the server does not
  interpret it
- sparse attributes on a wide entity, where most rows have two of the forty
- an opaque third-party blob you must store and return without understanding

```sql
-- the pragmatic middle: JSON for the payload, real columns for the queried part
CREATE TABLE webhook_delivery (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    endpoint_id  bigint      NOT NULL REFERENCES endpoints(id),
    event_type   text        NOT NULL,          -- extracted, indexed, foreign-keyable
    payload      jsonb       NOT NULL,          -- opaque, not queried
    received_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX webhook_delivery_type_idx ON webhook_delivery (event_type, received_at DESC);
```

> **STAFF-LEVEL CONSIDERATION**
>
> The question worth raising in a design review is not "should we use JSON" — it is "**what
> happens to the day someone needs to report on a field inside it**". The usual trajectory is
> that a payload starts opaque, a dashboard needs `payload->>'country'`, so a functional index
> is added, then a second, then a join, and the document has quietly become a table with
> none of a table's guarantees: no `NOT NULL`, no `CHECK`, no foreign key, no statistics for
> the planner, and no way to write a `UNIQUE` constraint that means what you think. The
> convention that prevents this is a one-line rule — *anything the server filters, sorts,
> joins or constrains is a column; anything it only stores and returns is JSON* — and it is
> worth writing into the schema's README because it will be argued in eleven months by
> someone who has not read the original discussion.

#### Common Mistakes

- Choosing `int` for an ID or a counter on a table that will be append-only for years, and
  discovering the boundary as a silent wrap on one engine and a loud error on another
- Using `float` or `double precision` for money, and reading the tiny error as "acceptable
  rounding" rather than as an unrepresentable value that accumulates
- Widening `NUMERIC(12,2)` to "fix a rounding problem", which is a table rewrite and does not
  address the real question of whether the value should have been rounded at all
- Assuming `VARCHAR(n)` saves space, which is true in MySQL and false in PostgreSQL, and
  therefore is a claim nobody can verify without knowing the engine
- Using `CHAR(n)` in a join against a `VARCHAR(n)` and getting pad-space comparison matches
  nobody expected
- Adding a `UNIQUE` on a case-sensitive column and describing it in the README as "email is
  unique"
- Using `timestamp` for an event time because the ORM's default mapping produced it and
  nothing threw
- Storing JSON in a `text` column, losing all write-time validation, and then discovering a
  malformed payload in a downstream consumer

#### Interview Questions — Types, Precision & Collation

**Q1. Why can't a float represent 0.1, and why does that matter for money?** `TRICKY`
Because a float stores a binary fraction — a sign, an exponent, and a significand of binary
digits — and 0.1 has no terminating binary expansion, exactly as 1/3 has no terminating
decimal one. The hardware rounds to the nearest representable value, so what is stored is
0.10000000000000000555…, an error of about 5.5e-18. The error does not cancel across

operations: `0.1 + 0.2` evaluates to 0.30000000000000004, not 0.3. Ten thousand additions of

$0.10 accumulate a visible discrepancy that never goes away and is never roundable away,
because each step is inexact. `NUMERIC` avoids this by construction — it stores a
base-10 significand and a decimal scale, so 0.10 is the integer 10, exact. That is why it
is the right type for money, and the deeper reason is that the class of bug is not "small
error" but "the value you asked to store is not a value the type can hold".

**Q2. When is `int` genuinely the right choice for an identifier?** `STAFF`

When the value is bounded by construction and the bound is provable, not hoped for. A
rebuilt-every-night lookup table, a small enum-like code table, a per-shard sequence, and
engine-managed system columns are all legitimate. The test is whether you can state the
lifetime bound as a number: a table partitioned monthly and dropped after ninety days can
never approach 2.1 billion rows, so `int` is safe and halves the index. The trap is
choosing `int` for a table whose growth is *not* bounded by a process you control — an
append-only event or audit table, a page-view counter, an incrementing surrogate key on a
table that is never archived — because those cross the boundary silently, at 2am, on a
weekend. And the boundary failure is not a clean error even when it is an error: MySQL's
`SUM()` over an `int` column silently returns a wrong total, while `INSERT` past the
boundary raises. So the last thing to say is that the danger is arithmetic, not insertion.
**Q3. What is the difference between `varchar(n)` and `text`?** `TRICKY`

The honest answer is engine-dependent, and giving the PostgreSQL answer unqualified is the
error. In PostgreSQL they occupy identical storage — both are a length header plus the
bytes — and `varchar(n)` stores its limit in the catalogue as a modifier that is not
enforced on the tuple; the only difference is that it refuses values that are too long. The
one real difference is statistical: the planner uses a declared maximum length as weak
evidence of row width, so converting `text` to `varchar(500)` can change join-strategy
choices for reasons unrelated to your change. In MySQL InnoDB the difference is physical:
`varchar` is stored inline with a length prefix, while `text` is subject to off-page storage
past a row-size threshold, so reading a `text` column can mean an extra overflow-page read
even for a short value. The design question underneath is not storage but whether you have a
real business maximum. If you do, `varchar(n)` is a free constraint in PostgreSQL and a
cheap one in MySQL. If you do not, the honest type is `text` and a `CHECK` is better than a
guess.

**Q4. What is the bug with `CHAR(n)` that most people cannot explain?** `TRICKY`
Padding, and the asymmetric comparison rules that follow from it. A `CHAR(n)` value is
right-padded with spaces to exactly `n` characters, so `'G'` in a `CHAR(3)` is stored as
`'G  '`. Under the ANSI pad-space collation behaviour — the default in PostgreSQL and most
MySQL collations — trailing spaces are ignored in comparisons, so `'G' = 'G   '` is true, and
a join between a `CHAR(3)` and a `VARCHAR(3)` that someone has been trimming can match rows
nobody expected. The genuinely nasty part is that a `UNIQUE` or `PRIMARY KEY` on a `CHAR(n)`
column can behave inconsistently, because an index lookup compares the padded bytes while a
sequential-scan comparison applies the pad-space operator — so the same insert can succeed
or fail depending on whether the engine chose an index. The guidance is to use `CHAR(n)` only
where an external standard fixes the width exactly, like a three-letter ISO currency code,
and never to rely on the padding being invisible.

**Q5. Your team says "email is unique in the database" and three case variants of one
address now exist. Why, and what is the right fix?** `ADVANCED`

Because a `UNIQUE` constraint is a statement about the value as stored, and as stored means
byte comparison under the column's collation, which is case-sensitive by default. So
`'Alice@x.com'`, `'alice@x.com'` and `'ALICE@x.com'` are three distinct values and the
constraint is correctly satisfied. The gap is that the team wrote a claim about *identity* and
the database implemented a claim about *bytes*, and neither statement is false. The right fix
is to normalise on write: store lowercase, and enforce it with

`CHECK (email = lower(email))` so a future writer — a bulk import, an admin tool — cannot
skip the step. A case-insensitive collation on the index is a valid alternative and is the
answer when you also want `'José'` and `'Jose'` to be the same person, but it is a bigger
decision than it looks, because declaring `COLLATE` on the index changes comparison semantics
for every `=` and `GROUP BY` on that column across the whole database, including queries
written long before anyone considered case.

**Q6. When do you use `timestamp without time zone`, and what goes wrong?** `STAFF`
When the value is a wall-clock reading that means something to a human in a *specific*
place — a store's opening hours, a scheduled report time, "the 1st of the month at 03:00
server time" — and you are explicitly not claiming it is an instant. For anything that
records when something *happened*, it is the wrong type, and the failure it causes is

specific: rows written by servers in different regions, or by a laptop in a different

timezone, become mutually incomparable, so a per-hour report double-counts one hour on the
spring DST transition and loses an hour on the autumn one — a 100% error on exactly the two
days nobody tests. Worse, the information is destroyed on write: the column does not record
which reading was UTC, so it cannot be recovered later. The related trap is

`timestamp DEFAULT now()`: `now()` returns a `timestamptz` that is *silently cast* to the
naive type on assignment, so the type system gives no warning at all. Store instants as
`timestamptz` always, and add a separate `text` column with the IANA zone name if you need to
know where it happened.

**Q7. JSON column or normalised columns? Give the decision rule.** `ADVANCED`

The rule is about what the *server* does with the value, not about how variable it looks.
Anything the server filters, sorts, joins, aggregates, constrains or references from another
table is a real column. Anything it only stores and returns unchanged is a JSON document.
The reason is not aesthetic: a JSON field has no `NOT NULL`, no `CHECK`, no foreign key, no
statistics for the planner, and a `UNIQUE` constraint over it means something subtly
different because `jsonb` compares semantically rather than byte-wise. The usual failure
trajectory is that a payload starts opaque, a dashboard needs one field, a functional index
is added, then a second field, then a join, and the document has become a table without any
of a table's guarantees. So the useful senior move is to extract the two or three fields that
are actually queried and index those, keep the remainder opaque, and write the convention
down — because the argument about it will happen again in eleven months with someone who
has not read the original discussion.

> **CHAPTER 2 SUMMARY**
>
> A column type is a constraint enforced on every write forever, and widening it is a table
> rewrite — which makes type choice a decision whose cost lands months later. Use `bigint`
> for anything append-only, because the interesting failure is arithmetic rather than
> insertion and it is silent on one engine and loud on another. Use `NUMERIC` for exact
> decimals and integer minor units for money, and know that both are correct so the choice is
> about who else reads the column. `varchar(n)` and `text` differ in PostgreSQL only in
> validation; `CHAR(n)` pads and its comparison rules are asymmetric with `VARCHAR`. Collation
> decides what `=`, `UNIQUE` and every index on a text column mean, so a case-insensitive
> uniqueness rule needs either write-time normalisation with a `CHECK`, or a functional index
> — and a collation change on an index is a schema-wide decision wearing small syntax. Store
> instants as `timestamptz`, always, because the naive type destroys the information on
> write. And put a decision rule in front of the JSON question: anything the server queries
> is a column, anything it only stores is a document.

#### Further Reading

- [PostgreSQL — Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html) — exact decimals versus floating point, stated by the engine that cares most, including the `NUMERIC` overflow behaviour.
- [PostgreSQL — Character Types](https://www.postgresql.org/docs/current/datatype-character.html) — `char(n)`, `varchar(n)`, `text`, and the blank-padding rules compared side by side.
- [PostgreSQL — Collation Support](https://www.postgresql.org/docs/current/collation.html) — how collation changes comparison, ordering and index behaviour, and the ICU versus libc distinction.
- [MySQL — Integer Types](https://dev.mysql.com/doc/refman/8.0/en/integer-types.html) — display width, `UNSIGNED`, and the `sql_mode` behaviour that decides whether overflow is an error or a wrap.
- [IEEE 754 — Floating Point Arithmetic](https://en.wikipedia.org/wiki/Floating-point_arithmetic) — the reference for exactly why 0.1 is not representable, with the worked example.

## Chapter 3 — Primary, Foreign & Unique Constraints

### 3.1 The Semantics Were Introduced in Volume 1; This Chapter Is the Machinery

Volume 1 Chapter 4 introduced what a constraint *claims*: that a column identifies a row, that
a value identifies a business entity, that a reference resolves, that a rule holds. This
chapter is about what each claim **costs at write time** and **implies structurally** — which
indexes appear on their own, which lock is taken, which row is blocked, and which
engine-specific behaviour you will be asked about.

```text
  THE THREE CLAIMS AND THEIR THREE MACHINERIES
  ┌────────────────────────────────┬──────────────────────────────────┐
  │ PRIMARY KEY                    │ NOT NULL + UNIQUE, enforced by   │
  │ "this identifies the row"      │ the engine; in InnoDB it IS the  │
  │                                │ clustered index                  │
  ├────────────────────────────────┼──────────────────────────────────┤
  │ UNIQUE                         │ a second B+ tree; duplicates     │
  │ "no two rows have this value"  │ rejected; NULLs are NOT equal    │
  │                                │ so several may coexist           │
  ├────────────────────────────────┼──────────────────────────────────┤
  │ FOREIGN KEY                    │ on every child write: lock the   │
  │ "this resolves to a parent"    │ parent row, probe the parent     │
  │                                │ index, hold until statement end  │
  └────────────────────────────────┴──────────────────────────────────┘
```

### 3.2 Creation Syntax: The Three Ways, and Which One You Should Use

```sql
-- (a) Column-level, anonymous. Works. You will regret the unnamed constraint.
CREATE TABLE orders (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    reference   varchar(32)  UNIQUE,
    customer_id bigint       REFERENCES customers (id)
);
-- (b) Table-level, named. The default for anything you will ever look at twice.
CREATE TABLE orders (
    id          bigint GENERATED ALWAYS AS IDENTITY,
    reference   varchar(32) NOT NULL,
    customer_id bigint      NOT NULL,
    CONSTRAINT orders_pkey         PRIMARY KEY (id),
    CONSTRAINT orders_reference_key UNIQUE (reference),
    CONSTRAINT orders_customer_fk  FOREIGN KEY (customer_id)
        REFERENCES customers (id) ON DELETE RESTRICT
);
-- (c) ALTER, named, for a table that already exists. Always ALTER, never bare ADD.
ALTER TABLE orders ADD CONSTRAINT orders_reference_key UNIQUE (reference);
```

Naming is not cosmetics. Constraint names appear in:

- the error message a user sees (`duplicate key value violates unique constraint
  "orders_reference_key"`)
- `ALTER TABLE … DROP CONSTRAINT`, which is how you ever change or remove it
- the engine's catalogue views, which is how you audit what a table actually enforces
- **every ORM's schema generation**, which will try to recreate a constraint it does not
  recognise by name
> **PRODUCTION RELEVANCE**
>
> An unnamed constraint is generated by a naming convention that differs by engine
> (`orders_reference_key` in PostgreSQL, `reference` in MySQL, `UQ__orders__…` with a
> generated hash in SQL Server). A migration that drops and re-adds a constraint by name
> works on the developer's laptop and fails in production, and the failure appears at the
> worst possible moment — halfway through a schema deploy, with the new constraint already
> installed and the old application still running. The rule is short enough to fit in a
> lint rule: **every constraint has an explicit name, following `<table>_<purpose>`, and
> the name appears in the migration file.** Spring Data JPA's `ddl-auto=update` is the case
> that makes this concrete — it reads the catalogue to decide what to create, so an
> unexpected name becomes an unexpected `CREATE` on the next boot. Spring Volume 6 owns that
> failure mode in full.

### 3.3 The Indexes Constraints Create Implicitly

The single most consequential fact about constraints is that **they create indexes whether
you asked for one or not**, and that index is a permanent cost on every write.

| Constraint | Index it implies | Notes |
| --- | --- | --- |
| `PRIMARY KEY` | unique index on the key columns | in InnoDB this *is* the clustered index — every other index is secondary |
| `UNIQUE` | unique index on the column list | a real, maintained B+ tree on the write path |
| `FOREIGN KEY` | index on the **child** columns | required by the standard; most engines require or create it |
| `FOREIGN KEY` | index on the **parent** key | usually already exists as the parent's `PRIMARY KEY` |
| `CHECK` | **none** | checked row by row; not indexed, not queryable by the planner |
| `NOT NULL` | **none** | a per-row flag check |
| `DEFAULT` | **none** | a value used when the column is not in the `INSERT` list |

```text
  WRITE AMPLIFICATION, one INSERT into a table with 6 declared things:
    heap tuple write ...................................... 1
    PRIMARY KEY btree insert ............................... 1
    UNIQUE(email) btree insert ............................. 1
    UNIQUE(tenant_id, external_id) btree insert ............. 1
    FK index on customer_id btree insert ................... 1
    FK check: lock parent row 42, probe parent PK index .... 1
    CHECK constraints evaluated ........................... 2
    ──────────────────────────────────────────────────────────────
    8 index structures touched, 1 row of actual data

  Dropping one UNIQUE that exists only "for safety" removes
  an eighth of the write cost. That is a measurable, defensible
  optimisation — and it is invisible unless somebody counts.
```

> **INTERVIEW TRAP — "WHY DOES A FOREIGN KEY NEED AN INDEX ON THE CHILD TABLE?"**
>
> Because the index is not there to make the *insert* fast — it is there to make the
> **referential actions** fast, and to make the constraint checkable. Two reasons, both
> concrete. First, when a parent row is deleted, the engine must find every child row that
> references it in order to `RESTRICT`, `CASCADE` or `SET NULL` them. Without an index on the
> child columns that is a full table scan, per deleted parent row — so deleting ten thousand
> parents from a ten-million-row child table is a hundred billion row examinations. With the
> index it is ten thousand index probes. Second, the SQL standard requires that a foreign
> key's referencing columns be indexed, and most engines either create the index silently or
> refuse the constraint without one, which is why a `ForeignKeyConstraintException` in MySQL
> usually means "add an index", not "fix your data".
>
> The senior addition is the write-side cost that gets forgotten: this index is maintained on
> every insert and every update of the FK column, forever, and it is pure overhead if the
> relationship is never used to join or to find children — which happens when the FK is a
> compliance annotation rather than a real relationship. And the truly nasty version of the
> trap: the FK index is on the child, but the *lock* is on the **parent**, so the cost of the
> constraint lands on a completely different table than the cost of its index. Two different
> tables, two different scaling characteristics, one constraint.

### 3.4 The `ON DELETE` / `ON UPDATE` Action Matrix

The action is a **policy about data destruction**, and the only responsible way to choose one
is to be able to state what happens to a four-year-old row.

| Action | On parent delete | On parent key update | Use when |
| --- | --- | --- | --- |
| `RESTRICT` | reject immediately, before any other work | reject | children must be explicitly re-homed first |
| `NO ACTION` | reject at end of statement / at commit (deferrable) | as `RESTRICT` by default | you need to move rows within the same statement |
| `CASCADE` | delete or update every child | update every child | the child is a strict *component* of the parent |
| `SET NULL` | set the child's FK to `NULL` | as `RESTRICT` | the child outlives the parent; the link is optional |
| `SET DEFAULT` | set the FK to its column default | as `RESTRICT` | rarely — the default must be a real, existing parent |

Two distinctions in that table are worth spelling out, because they are asked constantly and
confused constantly:

- **`RESTRICT` vs `NO ACTION`.** They look identical and are not. `RESTRICT` refuses
  *immediately*, checking the constraint before any other work in the statement.
  `NO ACTION` defers to the end of the statement, and if the constraint is declared
  `DEFERRABLE`, all the way to `COMMIT`. That is the entire reason `NO ACTION` is the default
  in the standard and the only workable choice for a multi-row re-parenting operation.
- **`ON UPDATE CASCADE` is a hidden performance decision.** A parent key that changes
  cascades to every child. If the parent key is a `bigint` surrogate, `ON UPDATE CASCADE` will
  never fire and costs nothing. If the parent key is a natural key like an email or an
  external ID, every parent update becomes a mass update of the child table — potentially
  millions of rows, holding locks on all of them, in a single statement nobody planned.
> **TRADE-OFF — "SOFT DELETE WITH `SET NULL`, OR HARD DELETE WITH `CASCADE`?"**
>
> **Soft delete with `ON DELETE SET NULL` and a `deleted_at` on the parent** is correct when
> the child rows have independent meaning and someone will need to know they used to belong
> to something: orders that must keep existing after a GDPR erasure request, audit rows that
> must survive the deletion of the entity they describe, anything with a legal retention
> requirement. The cost is that `deleted_at` now has to be in every query, and forgetting it
> once is a data-exposure incident rather than a bug.
>
> **Hard delete with `CASCADE`** is correct only when the child is genuinely a *component* —
> `order_line` items of an `orders` row have no meaning without the order, and there is no
> scenario where a user wants orphaned lines. The cost, when applied by habit, is that
> `ON DELETE CASCADE` is a **data-destruction policy dressed as a convenience setting**: one
> support action on a `users` row takes four years of order history with it, in a single
> statement, irreversibly, and there is no error to alert on.
>
> **The condition that flips the answer** is a question about the child, not about taste:
> *would a human ever want to look at this child row and not know which parent it belonged
> to?* If yes, cascade is wrong. If no, cascade is correct and `RESTRICT` is just extra work.
> The default that makes this safe is `RESTRICT`, with `CASCADE` as an explicit, reviewed,
> per-constraint decision — and Volume 1 Chapter 4 has the incident that makes the case.

### 3.5 The FK Write Path, and the Hot-Parent Serialisation Problem

This is the most under-appreciated cost in the whole of SQL, and it is invisible from the
query.

```text
  INSERT INTO order_line (order_id, sku, qty) VALUES (42, 'X', 3);
                    │
                    ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ 1. index probe on order_line(order_id)  → find where to write  │
  └───────────────────────────────────────────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ 2. REFERENTIAL CHECK on order_line_order_fk                  │
  │    · lock parent row orders.id = 42   ◄── FOR KEY SHARE       │
  │    · probe orders' PK index to confirm 42 exists              │
  │    · hold that lock UNTIL THE STATEMENT (or transaction)      │
  │      ENDS                                                        │
  └───────────────────────────────────────────────────────────────┘
                    │
                    ▼
  ┌───────────────────────────────────────────────────────────────┐
  │ 3. write the tuple, maintain the FK index, append to the log  │
  └───────────────────────────────────────────────────────────────┘

  Now run step 2 for 400 concurrent inserts against order 42:
     T1  ── lock FOR KEY SHARE on parent 42 ────────┐
     T2  ── lock FOR KEY SHARE on parent 42 ───┐    │
     T3  ── lock FOR KEY SHARE on parent 42 ─┐  │    │
     ...                                      │  │    │
     T400 ────────────────────────────────────┼──┼────┘
     FOR KEY SHARE is SHARED among themselves ─┴──┴─► all 400 proceed
     BUT: a concurrent UPDATE orders SET status='CANCELLED' WHERE id=42
     needs a FOR UPDATE (exclusive) lock on that SAME parent row.
     T401 ── FOR UPDATE on parent 42 ──► BLOCKED by all 400.
     Customer service cancels an order.
     400 inserts queue behind it.
     The cancellation is not slow. The INSERTS are slow.
     The dashboard says "orders are failing to save."
```

> **MUST REMEMBER**
>
> A foreign key is not a validation, it is a **lock on another table's row, held for the
> duration of your statement**. `FOR KEY SHARE` is shared with other `FOR KEY SHARE`
> holders, so many concurrent inserts of children are fine — but it conflicts with
> `FOR UPDATE` on the parent, so a single parent-row update serialises behind every
> in-flight child insert. **The FK's write cost lives on the parent, its index cost lives on
> the child, and its lock cost lives on whichever row is hottest.** The
> "one customer with 40,000 orders" pattern is the standard way teams meet this: the parent
> is the hottest row in the system, and every insert into its child table now contends with
> every other write against it.
> **PRODUCTION SCENARIO**
>
> Problem: order capture latency on the busiest tenant goes from 40 ms p99 to 14 seconds.
> The same code, the same table sizes, and only on one tenant — the one with 400,000 orders.
> Investigation: `pg_stat_activity` shows 60–90 sessions in `LockAcquired` / `waiting`,
> all of them `INSERT` on `order_line`, all blocked by a single `SELECT ... FOR UPDATE` on
> `orders` for that tenant. The blocking query is a fraud-scoring job that locks the order
> row for the duration of an external HTTP call.
> Root cause: the `FOR KEY SHARE` locks taken by 400 concurrent line inserts conflict with
> the `FOR UPDATE` the fraud job needs on the same parent row, and the fraud job's lock is
> held across a network call to a third party. Neither party is doing anything expensive
> individually; the parent row is simply a serialisation point, and one participant made it
> expensive.
> Solution: shorten the fraud job's lock — do the scoring before taking the row lock, or
> score on a snapshot and take a short lock only to write the result. Separately, partition
> the inserts by order so the lock queue is not a single FIFO.
> Prevention: a review rule that no transaction may hold a row lock across an external call,
> and a per-tenant p99 dashboard on write latency rather than only a global average — the
> global average hid this for eleven days because only one tenant was affected.

### 3.6 `UNIQUE` on a Nullable Column

The standard's rule is that a `UNIQUE` constraint rejects two rows only if no column in the
key is *distinctly* unequal, and `NULL` is never distinctly unequal to anything. So
multiple `NULL`s coexist under a `UNIQUE` in most engines.

```sql
CREATE TABLE users (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      text UNIQUE          -- nullable, unique-if-present
);
INSERT INTO users (email) VALUES (NULL);
INSERT INTO users (email) VALUES (NULL);   -- succeeds
INSERT INTO users (email) VALUES (NULL);   -- also succeeds
```

| Engine | Multiple `NULL`s under `UNIQUE` |
| --- | --- |
| PostgreSQL | allowed (`NULL`s are distinct, since 9.0) |
| MySQL / InnoDB | allowed |
| SQL Server | **not** allowed — one `NULL` per `UNIQUE` column |
| Oracle | allowed |
| SQLite | allowed |

The interview question is rarely "can it happen" — it is "**is it what I meant?**" And the
answer depends entirely on what the column means:

```text
  email text UNIQUE, nullable
  ─────────────────────────────
  Intended: "an optional identifier that is unique when present"
  Realised: "an optional identifier that is unique when present"
  VERDICT:  correct. Several legacy accounts with no email is normal and fine.

  external_ref text UNIQUE, nullable
  ─────────────────────────────
  Intended: "at most one row may have no external reference"
  Realised: unlimited
  VERDICT:  the constraint is not doing what the name says.

  fixed: partial unique index, PostgreSQL 9.x+
  CREATE UNIQUE INDEX users_one_null_ref
      ON users ((1)) WHERE external_ref IS NULL;
  or, more idiomatically, make it NOT NULL and use a sentinel —
  or a separate one-row-per-tenant partial index, which is what
  production systems actually do.
```

### 3.7 `DEFERRABLE` and the Transaction as the Unit of Truth

A constraint checked immediately cannot express an invariant whose *intermediate* states are
invalid even though the *final* state is fine. The canonical case is a re-parenting, a tree
build from the leaves up, or a swap.

```sql
ALTER TABLE category
    ADD CONSTRAINT category_parent_fk
    FOREIGN KEY (parent_id) REFERENCES category (id)
    DEFERRABLE INITIALLY DEFERRED;
BEGIN;
  -- Both of these transiently violate the constraint.
  -- Immediate checking makes them individually illegal.
  UPDATE category SET parent_id = 12 WHERE id = 11;
  UPDATE category SET parent_id = 11 WHERE id = 12;
COMMIT;   -- evaluated here — and both rows are valid at this instant
```

The default, `INITIALLY IMMEDIATE`, is right far more often than people think, and
`DEFERRABLE INITIALLY DEFERRED` is not free: it moves the check to commit, which means a
constraint violation surfaces at `COMMIT` rather than at the offending statement, so the
error message points at a line of code that did not cause it. That debugging cost is real and
is the reason most teams only reach for deferrable when they hit a specific re-ordering
problem.

> **INTERVIEW TRAP — "WHY IS `ON DELETE NO ACTION` THE DEFAULT INSTEAD OF `CASCADE`?"**
>
> Because the default is a **data-safety decision disguised as a syntax default**, and
> getting it wrong is unrecoverable. `CASCADE` says: *when a parent disappears, take its
> children with them, silently, in the same statement, with no confirmation and no audit
> trail of what was lost.* That is an extraordinary power to hand to a schema default, and it
> is the power most wanted by the person who typed the `DELETE` by accident. The consequences
> are asymmetric in exactly the way that matters: choosing `RESTRICT` when you wanted
> `CASCADE` produces a constraint-violation error, which is loud, immediate, and costs one
> statement. Choosing `CASCADE` when you wanted `RESTRICT` produces four years of order
> history deleted, no error, and recovery from a backup. **The asymmetry is the whole
> argument** — one order of mistake is an inconvenience and the other is an incident with a
> customer-trust component.
>
> The senior addition: the reason this matters more than it used to is that `CASCADE` is
> *recursive in effect at the application layer*. One delete on a `users` row cascades to
> `orders`, which cascades to `order_line`, which cascades to `discount_allocations`, and the
> person who wrote the constraint on `order_line` had no idea that the `users` constraint
> existed. **Cascade depth is a property of the whole graph, and nobody reviews the graph.**
> The staff-level practice is to treat the presence of any `CASCADE` on a table whose child
> set is unbounded as a schema-review flag, and to require a written statement of what gets
> destroyed.

### 3.8 Composite Keys and Column Order

A composite constraint is a set of columns with the *leftmost-prefix* rule of an index, which
means **the column order is a decision about which queries the constraint can accelerate**,
not just about which columns are listed first.

```sql
-- "no tenant may reuse an external id"
CREATE UNIQUE INDEX orders_tenant_external_key
    ON orders (tenant_id, external_id);
CREATE UNIQUE INDEX orders_external_tenant_key
    ON orders (external_id, tenant_id);   -- a DIFFERENT constraint
```

The second one enforces "no two rows anywhere share an `external_id`" — globally, across all
tenants. Both are `UNIQUE`; they enforce entirely different facts; the difference is two
characters of column order. This is the same leftmost-prefix rule that governs composite
indexes in Volume 4, and it is the single most common cause of "the unique constraint does
not fire when I expect it to".

```text
  UNIQUE (tenant_id, external_id)   ── enforces:  (tenant, ext) pair is unique
       ▲
       │  external_id alone is NOT unique — many rows may share
       │  external_id=42 as long as they are in different tenants.
       ▼
  a multi-tenant integration that assumes external ids are globally
  unique will pass local tests and corrupt on the second tenant.
```

#### Common Mistakes

- Writing constraints without names, so the drop-and-recreate migration works in dev and
  fails in production because the generated name differs
- Believing a foreign key is free because it does not add a column, without counting the
  implicit child index, the parent lock, and the parent-side contention
- Applying `ON DELETE CASCADE` as a default on a table whose child set grows without bound
- Using `NO ACTION` where `RESTRICT` was meant, or not knowing which one a statement's
  transaction boundary will be judged at
- Describing a `UNIQUE` on a nullable column as "enforces uniqueness" without saying what it
  does with `NULL`
- Declaring `ON UPDATE CASCADE` on a natural key and not realising every parent-key change
  becomes a mass child update
- Ordering a composite `UNIQUE` by habit rather than by which leading column your queries
  filter on

#### Interview Questions — Constraints & Integrity

**Q1. What indexes does a foreign key create, and where?** `TRICKY`

One on the child, on the referencing columns — the SQL standard requires it and most engines
either create it silently or reject the constraint without one, which is why a missing-index
error is a common first surprise. And on the parent, the referenced key must be a `PRIMARY
KEY` or `UNIQUE`, so an index already exists there. The child index is what makes the
referential actions viable: deleting a parent row requires finding every child referencing it,
and without that index it is a full scan of the child table *per deleted parent row*. The
write-side consequence is the part usually missed — this index is maintained on every insert
and every `UPDATE` of the FK column forever, and it is pure overhead if the relationship is
never used to join or to locate children, which happens when an FK was added for compliance
reasons rather than as a real relationship. The genuinely surprising part is that the index
cost is on the child but the *lock* cost is on the parent, so the constraint charges two
different tables for two different resources.

**Q2. Why is `RESTRICT` safer than `CASCADE` as a default?** `STAFF`

Because the cost of being wrong is asymmetric in a way that should decide the default.
`RESTRICT` when you wanted `CASCADE` produces a constraint-violation error — loud,
immediate, and costing one statement to diagnose. `CASCADE` when you wanted `RESTRICT`
produces the silent destruction of a parent's entire child set, with no error, no audit
record, and no recovery except a restore. One order of the mistake is an inconvenience and
the other is an incident with a customer-trust component. The staff-level extension is that
cascade is a property of the *graph*, not of one constraint: a single `CASCADE` on
`order_line` looks harmless in isolation, but a `CASCADE` on `users` reaching `orders` which
reaches `order_line` means one `DELETE FROM users WHERE id = ?` destroys four years of
history across three tables, and the person who wrote the innermost constraint had no idea
the outer one existed. That is why the practice is to treat any `CASCADE` over an unbounded
child set as a schema-review flag requiring a written statement of what gets destroyed.
**Q3. What is the write cost of a foreign key, and where does it show up?** `ADVANCED`
Three costs at three different layers, and only one of them is visible in a profile. The
visible one is an extra index maintenance on the child on every insert and update of the FK
column. The less visible one is a probe of the parent's key index to confirm the referenced
row exists. The genuinely expensive one is a **lock on the parent row, held for the duration
of the statement or transaction**: an `INSERT` into `order_line` takes a `FOR KEY SHARE` lock
on `orders` row 42, and every concurrent insert taking the same shared lock is fine — but any
transaction needing `FOR UPDATE` on that parent row blocks behind all of them. So a single
parent-row update serialises behind every in-flight child insert, and if the parent is hot —
one customer with 400,000 orders is the standard example — that one row is the throughput
ceiling for the entire child table. The correct diagnosis of a "slow inserts" incident is
therefore to look at the *parent* table's row locks, not the child table's.

**Q4. Does a `UNIQUE` constraint on a nullable column allow multiple `NULL`s?** `TRICKY`
In most engines, yes, and the mechanism is the NULL semantics rather than a special rule for
uniqueness. The standard says two rows violate `UNIQUE` only if no column in the key is
*distinctly* unequal, and `NULL` is never distinctly unequal to anything — not to a value, and
not to another `NULL`. So every row whose key is `NULL` is "distinct" from every other such
row and the constraint is satisfied. SQL Server is the exception and permits only one, and
PostgreSQL has a family of `NULLS NOT DISTINCT` options on newer versions to restore the old
behaviour deliberately. The design question is not whether it is allowed but whether it is
what you meant: on an optional email address, unlimited `NULL`s is usually exactly the intent,
because legacy accounts without an email are normal. On a column where the constraint name
says "at most one", the unlimited case is a bug with a silent signature. The fix is not to
loosen the constraint but to make the invariant expressible — a partial unique index on a
constant expression filtered to the rows in question, or a `NOT NULL` column with a sentinel.
**Q5. What is `DEFERRABLE` for, and when is it a mistake to reach for it?** `ADVANCED`
It exists for invariants that span multiple rows whose correct write order is not the
obvious one. Building a category tree from the leaves upward, swapping the parents of two
adjacent nodes, or re-parenting a subtree in a single transaction all produce intermediate
states that transiently violate the constraint even though the final state is valid; with
immediate checking each of those steps fails individually and the whole operation becomes
impossible, which is why people reach for a trigger or an application-level check instead.
`DEFERRABLE INITIALLY DEFERRED` moves the check to `COMMIT`, where the final state is what
matters. It is a mistake to reach for it reflexively, for two reasons. First, it is a
statement about *transaction* semantics, and it encourages the belief that constraints are
about rows when they are about the end state of a unit of work. Second, it has a real
debugging cost: the violation surfaces at `COMMIT`, so the error points at the commit frame
rather than the statement that caused it, and in a large transaction that is a genuinely
expensive hour of bisecting. The default of `INITIALLY IMMEDIATE` is right far more often
than people assume, and the correct question when a constraint blocks you is whether the
invariant genuinely is per-row.

**Q6. You added a foreign key and inserts slowed by 40%. What do you investigate?** `ADVANCED`
Three things, in this order. First, whether the child columns are indexed — the FK's index
is not there for the insert, but a `UPDATE` of the FK column on an unindexed child table is a
delete-plus-insert of every matching row on every statement. Second, the parent row's lock

contention: check the parent table's row-level lock profile, not the child's, because the FK

check takes a `FOR KEY SHARE` on the parent for the duration of the statement and that
conflicts with any `FOR UPDATE`. A dashboard of child-table insert latency will point you at
the wrong table; a query for sessions waiting on a parent row will find it immediately.
Third, whether the extra index is a problem in its own right — a table with a primary key, a
unique constraint, and an FK index is three btree inserts per row instead of one, and if the
FK is there for compliance rather than for a real relationship, dropping it is a legitimate
optimisation. The fourth thing, which is a design question rather than a tuning question, is
whether that FK should be a `bigint` reference to a local table at all, or a soft reference to
a row in another service, where a constraint is not available anyway.

> **CHAPTER 3 SUMMARY**
>
> Constraints are a schema-wide commitment expressed in three rows of SQL, and each one
> implies machinery you did not ask for: a `PRIMARY KEY` is the clustered index in InnoDB, a
> `UNIQUE` is a btree maintained on every write, and a `FOREIGN KEY` is an implicit index on
> the child *plus a lock on the parent row held for the duration of your statement*. That
> last fact is the one that generates incidents, because the constraint's index cost is on
> the child while its contention cost is on the parent, so the fix is never where you are
> looking. `ON DELETE` is a data-destruction policy and `RESTRICT` is the safe default
> because the two error modes are wildly asymmetric; `DEFERRABLE` moves the check to commit
> and is the right tool only when the invariant genuinely is not per-row. And `UNIQUE` on a
> nullable column does not do what its name says, because `NULL` is never distinctly equal to
> anything — including itself.

#### Further Reading

- [PostgreSQL — Table Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html) — every constraint type, the `NOT VALID` / `VALIDATE` split, and the full action matrix.
- [PostgreSQL — Foreign Key Constraint Locking](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-FK-LOCKS) — the exact `FOR KEY SHARE` / `FOR UPDATE` interaction, which is the answer to the lock question above.
- [MySQL — InnoDB Foreign Key Constraints](https://dev.mysql.com/doc/refman/8.0/en/innodb-foreign-key-constraints.html) — the rules on index requirements and the restrictions MySQL places on referencing a non-unique key.
- [MySQL — Implicit and Explicit Index Creation](https://dev.mysql.com/doc/refman/8.0/en/innodb-index-types.html) — what the engine creates on its own and the cost it adds to writes.
- [PostgreSQL — `CREATE INDEX` (partial and functional indexes)](https://www.postgresql.org/docs/current/sql-createindex.html) — the tool for the "at most one NULL" case and for case-insensitive uniqueness.

## Chapter 4 — Check Constraints & Domains

### 4.1 What `CHECK` Can and Cannot Express

A `CHECK` is a boolean expression over the row being written. It must not evaluate to false;
`true` and `unknown` both pass. That last clause is the source of the most common `CHECK`
bug in production.

```sql
-- CAN express: everything computable from this row's own columns
CREATE TABLE subscription (
    id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    plan        text NOT NULL,
    seats       integer NOT NULL,
    price_cents bigint  NOT NULL,
    starts_at   timestamptz NOT NULL,
    ends_at     timestamptz,
    CONSTRAINT subscription_dates_ordered
        CHECK (ends_at IS NULL OR ends_at > starts_at),        -- NULL passes, deliberately
    CONSTRAINT subscription_price_nonneg
        CHECK (price_cents >= 0),
    CONSTRAINT subscription_seats_range
        CHECK (seats BETWEEN 1 AND 10000),
    CONSTRAINT subscription_tier_consistent
        CHECK (plan <> 'ENTERPRISE' OR seats > 100)             -- a real cross-column rule
);
-- CANNOT express: anything about another row
-- ✗ CHECK (seats <= parent.max_seats)                    — no such thing
-- ✗ CHECK (NOT EXISTS (SELECT 1 FROM invoice WHERE ...))  — not a constraint, a lie
-- ✗ CHECK (end_date > (SELECT MAX(end_date) FROM t))     — errors, or silently misbehaves
-- ✗ CHECK (owner_id <> id) is FINE (same row) but
--          CHECK (owner_id NOT IN (SELECT id FROM user WHERE ...)) is NOT
```

```text
  THE NULL RULE, WHICH IS THE WHOLE CHAPTER IN ONE LINE
    CHECK (ends_at > starts_at)      with ends_at = NULL
      →  NULL > anything  =  UNKNOWN
      →  UNKNOWN is not FALSE
      →  CONSTRAINT PASSES
    That is usually what you want (an open-ended subscription has no
    end date). It is catastrophic when it is not, e.g.:
      CHECK (discount_pct > 0 AND discount_pct < 100)
      with discount_pct = NULL  →  UNKNOWN AND UNKNOWN  →  UNKNOWN  →  PASSES
      "at most one row may have a NULL discount" is now false, and
      nobody was told.
```

The robust fix for the second case is to make the null-ness explicit rather than to rely on
`UNKNOWN` being good news:

```sql
ALTER TABLE subscription
  ADD CONSTRAINT subscription_discount_present
    CHECK (discount_pct IS NULL OR (discount_pct > 0 AND discount_pct < 100));
-- or, if the column must be present:
  ADD CONSTRAINT subscription_discount_not_null
    CHECK (discount_pct IS NOT NULL);
```

### 4.2 Why Application Validation Is Not a Substitute

Volume 1 Chapter 4 established the four ways validation and a constraint come apart: the
second write path, the race between two individually-valid requests, the partial failure, and
the rule change. The mechanism worth naming here is narrower and sharper.

```text
  WHY THE SERVICE CHECK AND THE CONSTRAINT ARE NOT THE SAME THING
  Service:   "is this request well-formed?"
  CHECK:     "can this row exist at all?"
  A race that only the database can lose:
    T1  BEGIN  SELECT stock FROM inventory WHERE sku='X';  → 1
    T2  BEGIN  SELECT stock FROM inventory WHERE sku='X';  → 1
    T1  UPDATE inventory SET stock = 0 WHERE sku='X';     -- no CHECK, so fine
    T2  UPDATE inventory SET stock = -1 WHERE sku='X';    -- also "fine"
    COMMIT; COMMIT;   -- invariant violated, and no exception was EVER thrown

  With a CHECK (stock >= 0):
    T2  UPDATE ... → ERROR: check constraint "inventory_stock_nonneg" violated
    T2  ROLLBACK;  -- and the client gets a real 409, not a silent oversell

  The service check cannot fix this because the two service checks
  ran at different instants. Only something that runs AT the write
  can see the state the write is about to destroy.
```

> **INTERVIEW TRAP — "I VALIDATE IN THE APPLICATION, SO `CHECK` IS REDUNDANT, RIGHT?"**
>
> The error is conflating a check on *input* with a check on *state*. Application validation
> runs before the write, against a snapshot the request did not control. A `CHECK` runs as
> part of the write, against the row's committed neighbours, atomically. The gap between
> those two is not theoretical — it is the classic inventory oversell: two concurrent
> requests each read "1 in stock", each validate "quantity ≤ 1" successfully, each subtracts
> one, and the result is stock of -1 with no exception thrown anywhere. The service was
> correct; the state it read was stale. Only a constraint evaluated at the moment of the
> write can catch it, and the error it produces is a real one that reaches the client as a
> 409 rather than as a corrupted quantity discovered at reconciliation.
>
> There are three further reasons the constraint is not redundant even when the service is
> careful. The **second write path** — a backfill, an import, an admin tool, a second
> service, a `psql` session from a laptop — does not go through your validation at all, and
> the constraint is the only thing covering it. The **rule change** creates a window: the
> code deploys on Tuesday and the migration relaxes the constraint on Wednesday, and for a
> day the two disagree. And the **permanent cost asymmetry** is the staff-level point:
> validation is ongoing human effort that scales with the number of people who remember,
> while a constraint is a one-time decision that scales with the number of writers. The
> framing that lands in a design review is not "defence in depth" — it is **"validation
> protects a request; a constraint protects a dataset."**

### 4.3 Invariants That Make Bad States Unrepresentable

The strongest use of a `CHECK` is not validating input; it is **reshaping the schema so that
the illegal state has no encoding**. This is the difference between a rule that is checked
and a rule that is *impossible*.

```sql
-- 1. INTERVAL instead of two timestamps.
--    "ends_at > starts_at" is now unexpressible as a violation:
--    an interval is negative or zero only if you construct it so.
--    (Keep a CHECK too — intervals can be negative. But the two-column
--     version has a whole state space that the one-column version does not.)
start_date date,
length     interval GENERATED ALWAYS AS (end_date - start_date) STORED
-- 2. ENUM instead of a nullable status with three magic strings.
--    'ACTIVE' / 'active' / 'A' cannot all be in the domain.
status order_status NOT NULL
-- 3. A value object, so the unit is in the type.
--    amount_cents bigint with a documented invariant beats
--    amount numeric with a comment.
CHECK (amount_cents >= 0)
-- 4. A generated column, so the derived value cannot drift.
gross_cents bigint GENERATED ALWAYS AS (net_cents + tax_cents) STORED
-- there is now no such thing as a row where gross ≠ net + tax
```

> **MUST REMEMBER**
>
> The hierarchy of integrity enforcement, strongest first: **(1)** a type that cannot hold the
> bad value — `bigint` for money, an `ENUM` for a closed set, an interval for a duration.
> **(2)** A `NOT NULL` that means something. **(3)** A `CHECK` for a rule over one row.
> **(4)** A `UNIQUE` for a rule about identity. **(5)** A `FOREIGN KEY` for a rule about
> reference. **(6)** A trigger, which is where you go when nothing above can express it, and
> which costs on every write and is invisible in the schema. Reach for a higher-numbered
> mechanism only when the lower ones genuinely cannot express the invariant, and when you do,
> say so explicitly in a comment — because a trigger is the one constraint mechanism that a
> reader of `DESCRIBE table` cannot see at all.

### 4.4 Adding a `CHECK` to a Table That Already Has Data

The operational sequence, and it is the same sequence as for a foreign key:

```sql
-- Step 1: install the constraint WITHOUT validating. Brief ACCESS EXCLUSIVE.
ALTER TABLE subscription
  ADD CONSTRAINT subscription_price_positive
  CHECK (price_cents >= 0) NOT VALID;
--   From this instant, every NEW write is checked. The old rows are not.
-- Step 2: find out how bad it is. Concurrent-friendly scan.
SELECT count(*) FROM subscription WHERE NOT (price_cents >= 0);
--   This count is the engineering estimate for the remediation work.
-- Step 3: remediate in batches.
UPDATE subscription SET price_cents = 0 WHERE price_cents < 0;
-- Step 4: validate, under SHARE UPDATE EXCLUSIVE — reads and writes continue.
ALTER TABLE subscription VALIDATE CONSTRAINT subscription_price_positive;
```

Two things a candidate rarely volunteers and a staff engineer always does. First, the
**remediation is usually a business decision, not a SQL one**: setting 400 negative prices to
zero is not obviously right, and someone who understands the domain has to choose between
zero, absolute value, and reversal. Second, the **`NOT VALID` state is a real, queryable
state** — you can list constraints that are enforcing-but-unvalidated, and any constraint
left in that state after a deploy is a claim your data does not actually satisfy.
MySQL has no `NOT VALID`, and its equivalent is the reverse operation: add the `CHECK` with
`ALTER TABLE … ADD CONSTRAINT … , ALGORITHM=INPLACE` where supported, accepting a metadata
lock and a scan; the engine-specific matrix is in Volume 8.

> **PRODUCTION SCENARIO**
>
> Problem: a new business rule — "every order's total must equal the sum of its lines" — is
> ready to enforce. The migration fails at 02:00 with
> `check constraint "orders_total_matches_lines" of relation "orders" is violated by some row`.
> Investigation: 47 of 3.1 million `orders` rows have `total_cents` differing from their line
> sums, and every one of them is a hand-adjusted order from a promotion campaign run in 2023.
> Root cause: the migration was a single `ALTER TABLE … ADD CONSTRAINT` with no `NOT VALID`
> phase, so the validation scan ran under `ACCESS EXCLUSIVE`, and it was written assuming
> the data was clean. Neither assumption held.
> Solution: add the constraint `NOT VALID`, run the counting query to scope the problem, take
> the 47 rows to the business owner — this is not a decision a migration script can make —
> fix them, then `VALIDATE CONSTRAINT` concurrently.
> Prevention: a two-phase pattern in the migration template (install `NOT VALID` → remediate
> → validate), and a rule that any `CHECK` on a table over a million rows ships in three
> separate deploys so each phase is independently observable and independently reversible.

### 4.5 `CHECK` Performance: The Optimiser's Friend

A `CHECK` is not just validation — engines use satisfiable `CHECK` constraints to remove
branches from query plans, and this is a real optimisation with a real gotcha.

```sql
CREATE TABLE t (
    id   bigint PRIMARY KEY,
    kind text NOT NULL,
    n    integer NOT NULL,
    CONSTRAINT t_n_nonneg CHECK (n >= 0)
);
SELECT * FROM t WHERE n < 0;   -- provably empty
-- PostgreSQL: "Result  (cost=0.00..0.01 rows=0 width=0)"
-- The planner used the constraint to prune the scan entirely.
-- The gotcha: this only works for constraints the planner can PROVE
-- satisfiable — a single-row subquery, an immutable function. Anything
-- volatile, and any NOT VALID constraint, is ignored.
ALTER TABLE t DROP CONSTRAINT t_n_nonneg;
-- A constraint that is dropped can no longer inform a plan that
-- depended on it. Existing cached plans are invalidated.
```

> **TRADE-OFF — "TRIGGERS OR `CHECK` CONSTRAINTS?"**
>
> **`CHECK`** when the rule is computable from the row's own columns. It is free to read,
> visible in `DESCRIBE`/`\d`, optimisable, and dropped and re-added as part of a migration
> like any other object. It cannot see other rows, cannot run a subquery, and cannot fire
> more than once per row per statement.
>
> **A trigger** when the rule genuinely needs other rows, needs a side effect, or needs to
> fire on events other than a row write. It can do almost anything. It also costs on every
> write to the table, whether or not the rule is relevant, it is invisible in a schema dump
> unless you know to look for it, it silently stops applying if the column it reads is
> renamed, and — the real cost — it is application logic living inside the database, so it is
> versioned, tested and debugged with the worst toolchain of either environment.
>
> **The condition that flips the answer** is almost always *"can this be expressed over one
> row?"* If a trigger is in the design, the first thing to try is a redesign: a partial
> unique index expresses "no two active rows per group", a generated column expresses
> "this derived value cannot drift", and an exclusion constraint in PostgreSQL expresses
> "no two rows may overlap in time" — which is the non-overlap invariant people reach for a
> trigger for constantly, and which a trigger enforces badly, because a trigger that checks
> the previous row's range cannot see a concurrent inserter.

#### Common Mistakes

- Relying on `CHECK (x > 0)` to reject `NULL`, and finding that `UNKNOWN` passes
- Writing a `CHECK` with a subquery and believing it is being enforced
- Adding a `CHECK` to a large table in one statement, holding `ACCESS EXCLUSIVE` for the
  validation scan
- Adding a trigger when a partial unique index or a generated column would express the same
  invariant declaratively and visibly
- Treating "the constraint passed" as "the constraint was checked on every row", when a
  `NOT VALID` constraint passes without checking any existing row
- Assuming a trigger fires once per row when it may fire once per row *per statement* in
  statement-level triggers, or zero times on a bulk path that bypasses it

#### Interview Questions — Check Constraints & Domains

**Q1. Why does a `CHECK` constraint pass when the expression evaluates to `NULL`?** `TRICKY`
Because the standard defines the rule as "the constraint is satisfied unless the expression
evaluates to false", and it defines three-valued logic, so there is a third outcome. When
`ends_at` is `NULL` on a subscription, `ends_at > starts_at` is *unknown*, not false, and
unknown is not a violation. For an open-ended subscription that is exactly right — the row
has no end date, so there is no ordering to violate — and writing `CHECK (ends_at > starts_at
OR ends_at IS NULL)` is redundant. The rule becomes a problem when it is not what you meant:
`CHECK (discount_pct > 0 AND discount_pct < 100)` happily accepts a `NULL` discount, so a
column whose constraint name implies "every row has a valid discount" enforces nothing at
all. The fix is to make the null-ness explicit in the expression, or to add

`CHECK (discount_pct IS NOT NULL)`, or better to declare the column `NOT NULL` and remove
the ambiguity entirely. The general habit this builds is worth stating in an interview: when
you write a `CHECK`, ask what it does with a `NULL` in each column, and write that down in a
comment, because `UNKNOWN` passing is a documented feature and a silent hole.

**Q2. What can a `CHECK` constraint not express, and what do you use instead?** `ADVANCED`
Anything about another row. A `CHECK` is evaluated against the row being written and nothing
else, so "this order's total equals the sum of its lines", "this child's parent is not
itself", "these two time ranges do not overlap", "this seat count is within the plan's
maximum" are all inexpressible, and writing them with a correlated subquery either errors or
is silently ignored depending on the engine. For each of those, the answer is a different
mechanism. A non-overlap invariant on time ranges is an *exclusion constraint* in PostgreSQL
with a range type and `&&` — which enforces it correctly under concurrency, which a trigger
checking the neighbouring row cannot do, because the trigger's neighbour lookup does not see
a concurrent inserter. A per-group limit is a partial unique index. A derived value that
cannot drift is a generated column. A cross-row aggregate is genuinely a trigger, or a
periodic job, and the honest thing is to say so and to say which one you mean, because a
trigger is the only constraint mechanism that does not appear in a schema dump.

**Q3. You add a new business rule as a `CHECK` to a 40-million-row table. Walk me through
the deploy.** `ADVANCED`

Three phases across three deploys, because the failure mode you are managing is a long lock,
not a wrong answer. Phase one: `ALTER TABLE … ADD CONSTRAINT … CHECK (…) NOT VALID`, which
takes a brief `ACCESS EXCLUSIVE` lock, changes only the catalogue, and starts enforcing the
rule on every *new* write immediately — the existing rows are untouched and unchecked. Phase

two: scope and remediate. Run the counting predicate as a plain `SELECT count(*)` to find

out how many rows violate it, then fix them in keyset-paginated batches outside a long
transaction. That remediation is usually a business decision rather than a SQL one — a
negative price becomes zero, absolute value, or a reversal, and only someone who understands
the domain can choose. Phase three: `VALIDATE CONSTRAINT`, which scans the table under
`SHARE UPDATE EXCLUSIVE` so reads and writes continue throughout, and is the only phase
that touches every row. The point worth making as a staff engineer is that a single
`ADD CONSTRAINT` is three operations wearing one costume, and that after phase one your
system is in a state — enforcing but unvalidated — that a schema audit can see and that a
schema audit *should* be looking for, because a constraint left unvalidated after a deploy
is a claim your data does not actually satisfy.

**Q4. A `CHECK` costs nothing. True or false?** `TRICKY`

False in two specific ways. The evaluation cost is small but not free — it is a function call
per row per statement, on the write path, and a table with six of them has six evaluations
per row. The real cost is that a `CHECK` is *not* a stable part of the schema: adding one
requires a migration, dropping one requires a migration, and a rule that moves every quarter
becomes a recurring operational cost rather than a one-time decision. And there is a third
cost that is a genuine trap rather than a cost: `CHECK` constraints change query plans.
PostgreSQL uses a satisfiable `CHECK` to prune plan branches — `SELECT * FROM t WHERE n < 0`
against a `CHECK (n >= 0)` returns a plan with a one-time filter and no scan at all, which
is a real and desirable optimisation. The trap is that it is an optimisation the planner is
entitled to make, so dropping the constraint can change plans that were already cached, and
a constraint that is `NOT VALID` is not used at all. So: cheap on the read path, sometimes
helpful, but not free in the sense that matters — it is a permanent architectural commitment
that has to be migrated in and out.

**Q5. When is a trigger the right answer rather than a `CHECK`?** `STAFF`

When the rule genuinely cannot be expressed over one row, and you have exhausted the
declarative alternatives. The concrete list: a rule about another row's aggregate ("total
must equal the sum of its lines"), a rule with a time dimension ("no booking may overlap an
existing one" — although in PostgreSQL an exclusion constraint with a range type does this
correctly and handles concurrency, which a trigger does not), and anything with a side
effect such as writing to an audit table or enqueuing a job. The reason to be slow about
reaching for it is that a trigger is application logic inside the database, with the worst
toolchain of either environment: it is invisible in a schema dump unless you know to look,
it costs on every write to the table whether the rule is relevant or not, it silently stops
applying if a column it reads is renamed, and its firing semantics differ by type — a
statement-level trigger fires once per statement, a row-level trigger fires once per
affected row, and `INSERT … ON CONFLICT DO UPDATE` and bulk paths have their own rules. The
first move should always be to try to reshape the invariant so a `CHECK`, a partial unique
index, a generated column or an exclusion constraint can carry it, and if none of them can,
say so in a comment so the next reader knows the trigger is load-bearing.

**Q6. What is a domain, and is it worth using?** `ADVANCED`

In the formal relational model a domain is a named set of permissible values plus the
operations valid on them — the type system's job, stated as data. In practice engines give
you two ways to build one, and they are worth different amounts. A `CREATE DOMAIN` is a named
alias with a base type plus a `CHECK` and optional collation: reusable, visible in the
catalogue, enforced on every write, and genuinely useful for a value that recurs across
tables — a currency code, a country code, a non-negative amount, an email shape. A
PostgreSQL `ENUM` is different in kind: the set of values is itself an object you can extend
with `ALTER TYPE … ADD VALUE` without a table rewrite, which makes it the right answer for
a closed set that the business will extend a value at a time. The honest assessment is that
`CREATE DOMAIN` is under-used and genuinely valuable, and that `ENUM` is a better fit than
`VARCHAR` plus a `CHECK` for a status field, because changing a `CHECK` means dropping,
migrating and re-validating every row, while adding an enum value is a catalogue operation.
The condition for using either is that the value set really is closed and really is shared —
if only one table has the column, a `CHECK` in that table is simpler and equally safe.

> **CHAPTER 4 SUMMARY**
>
> A `CHECK` is a per-row boolean evaluated at write time, which makes it the cheapest way to
> enforce a rule that spans two columns of the same row — and structurally incapable of
> anything that spans two rows, where the answers are a partial unique index, a generated
> column, an exclusion constraint, or a trigger. The rule that catches people is that it
> passes on `UNKNOWN`, so `CHECK (x > 0)` accepts a `NULL` and any constraint whose name
> implies presence enforces nothing; make the null-ness explicit. Application validation is
> not a substitute because it runs before the write, against a state the request did not
> control, which is exactly how the inventory oversell happens with no exception thrown
> anywhere. And the operational reality is that `ADD CONSTRAINT` is three operations wearing
> one costume: install `NOT VALID`, remediate, `VALIDATE` — three phases, three deploys, so
> that a 40-million-row table is never scanned under a lock that stops production.

#### Further Reading

- [PostgreSQL — Check Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-CHECK-CONSTRAINTS) — the semantics including why `NULL` passes, and the recommended `NOT NULL` pattern.
- [PostgreSQL — Domain](https://www.postgresql.org/docs/current/sql-createdomain.html) — a named type with its own constraints and collation, and when it is worth the indirection.
- [PostgreSQL — Enum Types](https://www.postgresql.org/docs/current/datatype-enum.html) — why adding a value is non-rewriting and why removing one is not supported.
- [PostgreSQL — Exclusion Constraints](https://www.postgresql.org/docs/current/ddl-constraints.html#DDL-CONSTRAINTS-EXCLUSION-CONSTRAINTS) — the declarative, concurrency-correct answer to non-overlap invariants that triggers get wrong.
- [MySQL — CHECK Constraints](https://dev.mysql.com/doc/refman/8.0/en/create-table-check-constraints.html) — MySQL 8.0's implementation and the differences from the standard worth knowing before you port.

## Chapter 5 — DML: INSERT, UPDATE, DELETE

### 5.1 `INSERT` and What It Actually Costs

An `INSERT` is a btree insert per index, a tuple write, a log record, and — for a table with
foreign keys — a lock on somebody else's row. The common misconception is that the cost is
"one row".

```sql
INSERT INTO orders (customer_id, reference, total_cents) VALUES (42, 'ORD-1', 2500);
```

```text
  WHAT THIS ONE STATEMENT TOUCHES
  ────────────────────────────────
   1. identity sequence nextval            (a separate object; see below)
   2. FK index probe + FOR KEY SHARE lock on customers row 42
   3. btree insert into orders_pkey
   4. btree insert into orders_reference_key
   5. btree insert into orders_tenant_ref_key
   6. heap tuple write
   7. 2-3 WAL records (tuple + index inserts are separately logged)
   8. at COMMIT: the log is forced

  Removing one UNIQUE constraint removes step 4. That is a
  measurable fraction of write throughput, and it is invisible in
  any profile that only looks at the table.
```

The sequence deserves its own note. `GENERATED ALWAYS AS IDENTITY` and `SERIAL` both draw
from a sequence, and sequences in PostgreSQL and Oracle **cache values in memory**: a session
that draws `nextval` 1, 2, 3 and then crashes has consumed three values permanently, because
they were never returned to the pool. The consequence is gaps in the identifier sequence, and
the consequence of *that* is that a test asserting "the new id is 8" fails intermittently, and
a team spends an afternoon learning that identity columns are not dense. Caching can be turned
down (`CACHE 1`, which is contention-free but slow) and can be turned up (`CACHE 1000`, which
is fast and burns up to 1000 values per crash). The tuning is Volume 7's; the behaviour is a
fact you need in an interview.

### 5.2 `RETURNING`: The Clause That Changes the Architecture

`RETURNING` gives you the row the statement wrote or deleted, from inside the statement.

```sql
INSERT INTO customer (email, name)
VALUES ('a@x.com', 'A')
RETURNING id, created_at;
--  id | created_at
-- ----+-------------
-- 9182| 2026-09-27 10:14:02.881+01
UPDATE account SET balance_cents = balance_cents - 1000
 WHERE id = 42
RETURNING balance_cents;
--  balance_cents
-- ---------------
--          48200        <-- the post-write value, no second round trip
```

Three consequences, and the third is the one that changes systems:

- It removes the **read-after-write round trip**. Without it, `INSERT` then `SELECT` is two
  network hops and, worse, two chances for a replica lag or a concurrent writer to give you a
  different answer.
- It returns the **generated** values — identity, defaults, `timestamptz` defaults, computed
  columns — that the client would otherwise have to guess or fetch.
- It returns rows you did **not** ask to write. `DELETE … RETURNING` is how a GDPR erasure
  produces a manifest of exactly what was destroyed, and that manifest is the difference
  between "we processed the request" and "we can prove what we deleted".
The caveat that a senior answer includes: `RETURNING` returns the row as the *statement* sees
it, and in some engines it has historically returned pre-update values or been restricted in
`INSERT … ON CONFLICT DO UPDATE`. And in a streaming context, `RETURNING` on a large
`DELETE` buffers every deleted row in memory before returning any of them — so a `DELETE` of
50 million rows with `RETURNING *` is a memory exhaustion incident, not a delete. Always
project the few columns you need.

### 5.3 Upsert: Three Syntaxes and the Race Underneath

An upsert is "insert this row, or if it already exists, update it". The syntax differs, the
semantics differ, and the failure mode is the same in all of them.

```sql
-- (a) PostgreSQL / SQLite: explicit conflict target
INSERT INTO counters (key, hits) VALUES ('homepage', 1)
ON CONFLICT (key) DO UPDATE
    SET hits = counters.hits + 1;
--                                     ^ the existing row, not the proposed one
-- (b) MySQL
INSERT INTO counters (`key`, hits) VALUES ('homepage', 1)
ON DUPLICATE KEY UPDATE hits = hits + 1;
--   note: no conflict target. ANY unique key that matches wins, and
--   which one fired is invisible.
-- (c) Standard-ish / SQLite: upsert syntax
INSERT INTO counters (key, hits) VALUES ('homepage', 1)
ON CONFLICT DO UPDATE SET hits = counters.hits + 1;
```

```text
  THE RACE, DRAWN OUT
  Two connections, same key 'homepage', no unique index on (key):
    T1  INSERT (homepage, 1)   -- no conflict detected -- INSERTED  hits=1
    T2  INSERT (homepage, 1)   -- no conflict detected -- INSERTED  hits=1
        COMMIT; COMMIT;
        ->  TWO rows for 'homepage', both with hits=1, and the true
          count was 2. The counter is now permanently wrong, with
          no error, no warning, and no way to detect it except a
          periodic duplicate-key audit nobody wrote.

  With UNIQUE (key):
    T1  INSERT (homepage, 1)   -- holds the speculative insertion token
    T2  INSERT (homepage, 1)   -- BLOCKS on T1's token (or raises
                                  ON CONFLICT, then waits for the
                                  outcome, then updates)
        ->  exactly one row, hits=2. Correct.

  The unique index IS the concurrency control. Without it, an upsert
  is not an upsert, it is two inserts.
```

> **INTERVIEW TRAP — "WHAT IF THERE IS NO UNIQUE INDEX FOR `ON CONFLICT` TO CONFLICT ON?"**
>
> In PostgreSQL you cannot get this — the `ON CONFLICT (cols)` clause requires a matching
> unique index or constraint, and the statement fails to plan without one, which is a *good*
> outcome because the mistake is caught at deploy time rather than at 3am. In MySQL it is
> trivially reachable, because `ON DUPLICATE KEY UPDATE` has no conflict target: it fires on
> *any* unique key violation, and if there is no unique key, there is never a violation and
> the statement is always a plain insert. So the upsert silently degrades into a
> duplicate-producing insert, concurrently, under exactly the conditions you care about.
>
> The mechanism to explain is that an upsert's correctness depends on a **serialisation
> point**, and in every engine that point is the unique index's entry — the index takes a
> speculative insertion lock, so a concurrent inserter of the same key waits for the outcome
> and then updates the committed row. Remove the index and you have removed the only thing
> that made two concurrent upserts of the same key mutually exclusive. The result is two
> rows, both claiming to be the counter, and the damage is permanent and silent: a duplicate
> key audit run a year later finds it, or a customer does.
>
> The second-order trap worth adding: with **two** unique constraints, MySQL's form does not
> tell you which one conflicted, and the `DO UPDATE` clause may try to write a column that
> is part of the *other* unique key, failing with a duplicate-key error on a key you were not
> thinking about. Always state the conflict target explicitly, and if the engine cannot, make
> the intended key the only one that can plausibly collide.

### 5.4 `UPDATE`: The Statement with No Safety Net

`UPDATE` is the most dangerous statement in ordinary SQL, and the reason is a property of its
syntax rather than its implementation: **`UPDATE` with no `WHERE` clause is valid SQL.**

```sql
UPDATE accounts SET balance_cents = 0;
-- 200 million rows, one statement, one implicit transaction,
-- 40 GB of WAL, and every balance gone.
```

The defences, in the order they actually help:

1. **`sql_safe_updates`** (MySQL) and similar client settings reject an `UPDATE` or `DELETE`
   without a `WHERE` on a non-key column when `WHERE` is present but uses no index. It is a
   guard rail, not a guarantee, and it is a client setting — which means `psql` does not have
   an equivalent by default.
2. **`RETURNING`** turns an unbounded write into a reviewable one:
   ```sql
   DELETE FROM sessions WHERE expires_at < now()
   RETURNING id;      -- see exactly what you are about to lose
   ```
3. **The batched delete**, which is the real answer for anything large, and which Section 5.6
   develops.
4. **A transaction with a `SELECT count(*)` first**, inside the same transaction, so the
   count and the delete see the same snapshot. This is the pattern Volume 1's production
   scenario recommends and it costs one query.
> **PRODUCTION RELEVANCE**
>
> The thing worth saying about `UPDATE` in an interview is that its danger is *social*, not
> technical. The engine has no opinion about whether updating 200 million rows is what you
> meant. The defences that actually fire in production are the ones that make the mistake
> *visible before it is durable*: running the predicate as a `SELECT` first and reading the
> count, using `RETURNING` so the affected rows are enumerated, and wrapping the whole thing
> in an explicit transaction so an obviously wrong row count can be caught and rolled back.
> That last one is why "did you wrap it in a transaction" is the first follow-up question on
> any destructive statement — and why the answer "it is a single statement, so it is already
> atomic" is a misunderstanding that costs someone their Friday.

### 5.5 `DELETE` vs `TRUNCATE` vs `DROP`

Three ways to remove data, and they are not interchangeable at any level: cost, locking,
reversibility, transaction semantics, and what happens to the identity sequence.

| | `DELETE` | `TRUNCATE` | `DROP` |
| --- | --- | --- | --- |
| Row-by-row, evaluated predicate | yes | no | n/a |
| Triggers fire | yes (row-level) | no | no |
| `WHERE` clause | yes | **no** | no |
| Transactional and rollback | yes | yes (PostgreSQL) | yes (PostgreSQL) |
| Bypasses MVCC | no — writes a new row version for every delete | **yes** — creates no row versions | yes |
| Lock level | `ROW EXCLUSIVE` | `ACCESS EXCLUSIVE` | `ACCESS EXCLUSIVE` |
| Resets identity sequence | no | **yes** (or `RESTART IDENTITY` variants) | yes, sequence dropped |
| Reclaims disk immediately | no (space reusable later, `VACUUM` to return it) | yes | yes |
| On a huge table | minutes, log-heavy | seconds | instant |

```text
  WHY TRUNCATE IS FAST, PRECISELY
  DELETE FROM events WHERE created_at < '2025-01-01';
    -> read 300M tuples
    -> for each: mark the old version dead, write a WAL record,
      update 4 index entries, write a new MVCC row version
    -> 300M x 6 operations, and 300M dead row versions that
      VACUUM must later reclaim
    -> the table is the same size afterwards, plus bloat

  TRUNCATE TABLE events;
    -> unlink or reset the relation's file
    -> no row versions, no WAL per row, no index entries
    -> the disk is actually reclaimed
    -> and MVCC readers holding an older snapshot are not disturbed,
      because there are no new row versions to conflict with them

  THE TRAP IN THAT LAST POINT -- the reason TRUNCATE is
  "not MVCC-friendly":
    T1  BEGIN;  SELECT count(*) FROM events;   -- 300M
    T2  TRUNCATE TABLE events;                 -- 2 seconds, committed
    T1  SELECT count(*) FROM events;           -- still 300M
    T1  COMMIT;                                -- then the count collapses to 0
    A reader that was inside a transaction sees the table as
    non-empty, keeps reading, and then has its results silently
    invalidated by a statement it never waited for. The rule that
    falls out: TRUNCATE during business hours is a coordination
    problem, not just a DDL problem.
```

> **INTERVIEW TRAP — "WHAT'S THE DIFFERENCE BETWEEN `DELETE` AND `TRUNCATE`?"**
>
> "Truncate is faster" is the answer that gets partial credit and teaches nothing. The
> mechanism has four parts, and each is a different decision. (1) **`TRUNCATE` does not
> evaluate a predicate.** It cannot — there is no `WHERE` clause. It resets the relation
> wholesale, so it is O(relation), not O(rows matching), and it is a DDL statement. (2) **It
> does not create MVCC row versions.** A `DELETE` writes a new row version marking each old
> one dead, which is why a 300-million-row `DELETE` leaves a 300-million-row table full of
> dead tuples that `VACUUM` must reclaim later, and why the table has *grown* by the time the
> statement finishes. `TRUNCATE` reclaims the space immediately because there is nothing to
> reclaim. (3) **It resets the identity sequence** unless you ask it not to, which silently
> breaks any external system holding references to the old identifiers. (4) **It takes
> `ACCESS EXCLUSIVE`** — a much stronger lock than the `ROW EXCLUSIVE` a `DELETE` takes — so
> `TRUNCATE` is *more* disruptive to concurrent traffic despite being *faster* in wall-clock
> time.
>
> The staff-level addition, and the one that actually causes incidents: `TRUNCATE` is not
> MVCC-friendly, and a `TRUNCATE` during business hours can be *invisible* to a long-running
> reader. A transaction that read 300 million rows before the truncate continues to see 300
> million rows, builds aggregates on them, and only sees the table empty at its next snapshot
> — so a report computed from it is wrong in a way that no error reports. The practical rule
> is that `TRUNCATE` is a maintenance-window operation on a live table, and the window exists
> because the correctness question is about readers, not writers.

### 5.6 Batching: The Only Safe Way to Delete a Lot

The large un-batched delete is dangerous for four compounding reasons, and all four are
about *one statement* rather than about the total volume.

```text
  DELETE FROM events WHERE created_at < '2024-01-01';
    (40 million rows)
  1. ONE LOCK SET, HELD TO THE END
       Every row it locks stays locked until COMMIT. A single
       transaction locking 40M rows holds 40M row locks and the
       lock table grows without bound.

  2. ONE SNAPSHOT
       The transaction's view is fixed at its first statement. At
       REPEATABLE READ it cannot see rows inserted since, and the
       version chain it walks is enormous either way.

  3. WAL VOLUME, ALL AT ONCE
       40M tuple deletions plus their index entries. At ~200 bytes
       per WAL record that is multiple GB in one burst: it fills the
       disk, saturates the log shipper, and arrives on a replica as
       a single multi-hour transaction blocking the whole stream.

  4. NO PROGRESS, NO PAUSE, NO RESUME
       If it fails at 39 million rows it rolls back all 40 million.
       There is no checkpoint. It cannot be throttled. It cannot be
       interrupted without losing the work.

  The fix -- every element is required:
     - keyset pagination, not OFFSET (OFFSET re-scans and
       re-locks everything it skipped)
     - bounded batch size, adaptively reduced if the batch is slow
     - commit per batch, so progress is durable and resumable
     - a kill switch checked every iteration
     - a high-water mark so a concurrent insert cannot be caught
```

```sql
-- The shape, in PostgreSQL. Every element is load-bearing.
DO $$
DECLARE
    lo bigint := 0;
    hi bigint;
    n  integer;
BEGIN
    LOOP
        SELECT max(id) INTO hi FROM events
         WHERE created_at < now() - interval '2 years';
        EXIT WHEN hi IS NULL;
        WITH batch AS (
            DELETE FROM events
             WHERE id IN (
                 SELECT id FROM events
                  WHERE id > lo
                    AND id <= hi
                    AND created_at < now() - interval '2 years'
                  ORDER BY id
                  LIMIT 5000
                  FOR UPDATE SKIP LOCKED      -- never block another reaper
             )
            RETURNING 1
        )
        SELECT count(*) INTO n FROM batch;
        lo := hi;
        EXIT WHEN n < 5000;
        PERFORM pg_sleep(0.05);   -- throttle; remove if the table is cold
    END LOOP;
END $$;
```

`FOR UPDATE SKIP LOCKED` deserves a sentence of its own: it is how a batch job avoids
colliding with another instance of itself or with a user session, by taking only the rows
that are free and skipping the ones that are not. It is the standard building block for any
queue table or work-claiming loop, and it is the difference between a reaper that degrades
gracefully under contention and one that deadlocks against production traffic.

> **SCALING REALITY CHECK**
>
> The batch size is a function of the transaction's cost, and the interesting number is the
> **WAL per batch**, not the row count. A 5,000-row batch of wide rows can be 40 MB of log;
> a 50,000-row batch of narrow rows can be 3 MB. So the right rule is to choose the batch size
> so that *one batch's log volume stays under roughly 100-200 MB* — small enough that the log
> writer, the log shipper and the replica can each keep up, large enough that you are not
> committing 10,000 times. Past about 10 million rows, the honest answer is that a partition
> drop beats a delete entirely: `DROP TABLE events_2024` is O(1) rather than O(n), and it is a
> Volume 6 design decision made long before the day you need the delete.

### 5.7 Archive-Then-Delete, or Just Delete

| Approach | Cost | Reversible | Use when |
| --- | --- | --- | --- |
| `DELETE` un-batched | O(n) WAL, one lock set, one snapshot | only if it completes | never, on a large table |
| `DELETE` in committed batches | O(n) total, bounded per-step risk | partially — deleted rows stay deleted | the general case |
| `TRUNCATE` | near-constant | yes in PostgreSQL, no in MySQL DDL | the whole table, maintenance window, no concurrent readers |
| `DROP TABLE` + `CREATE` | near-constant | no — schema is gone | you are also changing the schema |
| `DROP PARTITION` | near-constant | no | partitioned by time; the right answer at 100M+ rows |
| Archive to cold storage, then delete | O(n) read + O(n) write + O(n) delete | the data survives | you must keep it but not in the hot table |

> **TRADE-OFF — "ARCHIVE-THEN-DELETE, OR JUST DELETE?"**
>
> **Just delete** when the data has no retention obligation, no legal hold and no analytical
> value. This is rarer than teams assume, because "we might want it for analytics" is a real
> requirement that never appears on a requirements document. Deleting is the cheapest
> operation on this list and it is the only one that leaves you with one fewer thing to
> operate.
>
> **Archive then delete** when the data must survive but must not slow the hot table. The cost
> is that you have now created a *second* store with its own schema, its own backup policy,
> its own restore procedure and its own compliance story, and migrating that store is a
> project. The benefit is real: the hot table shrinks, its indexes shrink with it, and the
> queries that matter get faster in a way that no amount of index tuning on the original table
> achieves. Volume 9 owns the "put the cold copy on cheaper storage" pattern, and Volume 6
> owns partitioning, which is the version of this that does not need a second system.
>
> **The condition that flips the answer** is whether anyone has ever queried the old data. If
> yes, and you delete it, someone will ask for it back and the honest answer will be that it
> is in a backup taken eleven months ago. If no — and "no" here should be an answer you got in
> writing — then archive is a project you are doing for a hypothetical.

#### Common Mistakes

- Believing an `INSERT` of one row is one unit of work, rather than one tuple write plus one
  btree insert per index plus a foreign-key lock on another table
- Using `ON DUPLICATE KEY UPDATE` with no unique index behind it, so the upsert is a plain
  insert and concurrent runs create duplicate rows silently
- Adding a new unique index to support an upsert and forgetting that the index is now
  maintained on every write to the table
- Writing `ON CONFLICT DO UPDATE SET hits = hits + 1` without qualifying which `hits` is
  being incremented, and getting the proposed value rather than the stored one
- Running a large `DELETE` un-batched, in one transaction, and filling the disk with a single
  WAL burst
- Assuming `TRUNCATE` and `DELETE` are interchangeable because both "remove the rows" — they
  differ on sequence reset, on MVCC, on triggers and on lock level
- Using `LIMIT` with `DELETE` and assuming it makes the damage bounded — the statement is
  bounded, the *next run* re-does the work
- Using `OFFSET` in a batched delete, which re-reads and re-locks every row it skips

#### Interview Questions — DML & Write Paths

**Q1. What does a single `INSERT` actually cost on a table with three indexes and a foreign
key?** `ADVANCED`

Six distinct units of work, not one. A nextval from the identity sequence, which is a separate
object with its own cache and its own contention. A referential check: a probe of the parent's
key index to confirm the referenced row exists, and a `FOR KEY SHARE` lock on that parent row
held for the duration of the statement — the cost that is invisible in every local profile.
Then one btree insertion per index: the primary key, and each `UNIQUE` constraint, which are
real maintained structures. Then the heap tuple write. Then the WAL records, typically one for
the tuple and one per index entry, so three indexes means roughly four records. And at commit,
the log force, which is the durability latency and the reason batch commits of small
transactions are dramatically faster than one large one. The practical consequence is that the
levers on insert throughput are *index count* and *foreign key count*, not table size, and a
team that has never counted them has no idea which of their columns cost what.

**Q2. What is the difference between `DELETE`, `TRUNCATE` and `DROP`?** `TRICKY`
Four differences, and only the first is about speed. `TRUNCATE` has no `WHERE` clause, so it
cannot evaluate a predicate — it resets the whole relation. It does **not create MVCC row
versions**, which is the real reason it is fast: a `DELETE` writes a new row version per row
and leaves that many dead tuples for `VACUUM`, so a large `DELETE` can leave the table
*bigger* than it found it, whereas `TRUNCATE` reclaims the space immediately. It resets the
identity sequence unless told not to, silently breaking anything holding old identifiers. And
it takes a much stronger lock — `ACCESS EXCLUSIVE` versus the `ROW EXCLUSIVE` a `DELETE` takes
— so it is more disruptive to concurrent traffic while being faster in wall-clock terms.
`DROP` goes further: it removes the schema, the indexes, and every view and foreign key that
referenced the table, and it is not a data operation at all. The trap worth naming is that
`TRUNCATE` is not MVCC-friendly: a long-running reader inside a transaction can keep seeing
the pre-truncate contents and build aggregates on them, so a truncate during business hours is
a correctness problem for readers, not merely a locking one.

**Q3. Why is a large un-batched `DELETE` dangerous?** `ADVANCED`

Because four costs compound, and all four come from the fact that it is *one statement* in
*one transaction*. First, the locks: every row it touches is locked until commit, so a
40-million-row delete holds 40 million row locks simultaneously and the engine's lock table
grows without bound. Second, the snapshot: the transaction's view is fixed, so it cannot see
concurrent inserts, and the version chain it walks is enormous. Third, the WAL: 40 million
tuple deletions plus their index entries arrive as a single multi-gigabyte burst that fills
the disk, saturates the log shipper, and lands on a replica as one multi-hour transaction
blocking everything behind it in the stream. Fourth, there is no progress and no resume — a
failure at 39 million rows rolls back all 40 million, there is no checkpoint, and the
statement cannot be throttled or interrupted without losing the work. The fix is not a bigger

timeout: it is keyset-paginated committed batches with `FOR UPDATE SKIP LOCKED`, an adaptive

batch size tuned so one batch's log volume stays in the low hundreds of megabytes, and a kill
switch the loop checks every iteration so you can stop it with one statement at 2am.
**Q4. What does `ON CONFLICT DO UPDATE` do if there is no unique index to conflict on?** `TRICKY`
PostgreSQL refuses to plan the statement — the conflict target must match an existing unique
index or constraint, so the mistake is caught at deploy time, which is the correct outcome.
MySQL is where this is dangerous, because `ON DUPLICATE KEY UPDATE` has no conflict target at

all: it fires on a violation of *any* unique key, and if there is no unique key on the table

then there is never a violation and the statement is silently always a plain insert. The
mechanism is worth understanding rather than memorising: an upsert is only correct because
the unique index provides a serialisation point — the index entry is taken speculatively, so
a concurrent inserter of the same key waits for the outcome and then updates the committed
row. Remove the index and you have removed the only thing making two concurrent upserts
mutually exclusive, so you get two rows, both claiming to be the counter, and the corruption
is permanent and undetectable except by a duplicate-key audit nobody scheduled. There is a
second-order trap in MySQL too: with two unique constraints the statement does not tell you
which one conflicted, and the update clause may itself violate the other.

**Q5. When is `RETURNING` the right tool, and what is the catch?** `TRICKY`

Three situations where it is strictly better than the alternative. Removing a read-after-write
round trip, so `INSERT` then `SELECT` is one statement instead of two network hops and two
opportunities for a different answer. Getting at generated values you cannot know client-side —
identity, defaults, generated columns, `timestamptz` defaults. And capturing a manifest of what
was destroyed, which is what turns "we processed the erasure request" into "we can prove
exactly which rows we deleted", and that manifest is what makes a GDPR deletion defensible
under audit. The catches: the returned row is the row as the *statement* sees it, which on
older engines meant pre-update values in some cases, so check the version; you must project the
columns you want, because `RETURNING *` on a wide `DELETE` is a memory problem; and streaming
a large `DELETE` with `RETURNING` buffers every returned row before the client sees any of
them, so a 50-million-row delete with `RETURNING *` is an out-of-memory incident rather than a
delete.

**Q6. What is the write cost of a foreign key, in terms of locks?** `ADVANCED`

On every insert or update of a child row, the engine locks the referenced parent row with
`FOR KEY SHARE` and holds that lock until the statement — or, in an explicit transaction, until
commit — ends. Because `FOR KEY SHARE` is shared, that is fine between many concurrent child

inserts: four hundred of them can hold it simultaneously. The problem is that `FOR KEY SHARE`

conflicts with `FOR UPDATE`, so any transaction that wants to modify the parent row blocks
behind every in-flight child insert. One parent-row update therefore serialises behind the
entire child-insert stream for that parent, and if the parent is hot — one enterprise customer
with 400,000 orders, which every multi-tenant system has — that single row is the throughput
ceiling for the whole child table. This is why the diagnosis of "inserts got slow" points at
the *parent* table's row locks rather than the child table's, and why the classic mistake of
"optimising the inserts" fixes nothing. The mitigations, in order: shorten the parent
transaction so it does not hold the lock across anything slow, particularly an external call;
consider whether the relationship needs to be a hard constraint at all; and shard the hot
parent so it is not a single serialisation point.

**Q7. Why is deleting in batches better than deleting in one statement, mechanically?** `STAFF`
Because a batch converts one unbounded, unresumable unit of work into many bounded, durable
ones, and each of those four adjectives corresponds to a specific cost. **Bounded** locks: only
the current batch's rows are locked at any moment, so the lock table stays small and production
traffic is not blocked behind forty million held row locks. **Durable**: committing per batch
means progress survives a crash, so a job that dies at 39 million rows restarts at 39 million
rather than at zero. **Resumable**: a high-water mark on the primary key means you can record
where you got to, which is what makes the kill switch meaningful. **Throttled**: a sleep or an
adaptive batch size lets the WAL writer, the log shipper and the replica keep up, instead of
arriving as one multi-gigabyte burst that fills the disk. The implementation detail that
separates a working reaper from a dangerous one is `FOR UPDATE SKIP LOCKED` — without it the
batch job blocks on rows production holds, or deadlocks with it; with it, the job takes only
the rows that are free and skips the rest, and two reapers can run at once without colliding.

> **CHAPTER 5 SUMMARY**
>
> DML is where the abstraction in "just one row" fails hardest: an `INSERT` is a sequence
> draw, a parent-row lock, one btree insert per index, a heap write, several WAL records and a
> commit-time log force, so the levers on write throughput are constraint *count*, not table
> size. An upsert is correct only because the unique index provides the serialisation point
> that makes two concurrent upserts of the same key mutually exclusive — without it, on MySQL,
> you get silent duplicate rows rather than an error. `DELETE`, `TRUNCATE` and `DROP` differ
> on far more than speed: MVCC row versions, sequence reset, trigger firing, lock level and
> whether a concurrent reader notices anything at all. And the large un-batched delete is
> dangerous not because of its total volume but because it is a single transaction, which
> means unbounded locks, one snapshot, one multi-gigabyte WAL burst, no progress and no
> resume — so the answer is always committed, keyset-paginated, throttled batches with
> `FOR UPDATE SKIP LOCKED` and a kill switch.

#### Further Reading

- [PostgreSQL — DELETE](https://www.postgresql.org/docs/current/sql-delete.html) — the `RETURNING` clause and the snapshot semantics that make batching non-trivial.
- [PostgreSQL — TRUNCATE](https://www.postgresql.org/docs/current/sql-truncate.html) — `RESTART IDENTITY`, the `ACCESS EXCLUSIVE` lock, and the statement's interaction with open transactions.
- [PostgreSQL — `INSERT … ON CONFLICT`](https://www.postgresql.org/docs/current/sql-insert.html) — the conflict-target requirement that makes a missing unique index a planning error rather than a silent bug.
- [MySQL — `INSERT … ON DUPLICATE KEY UPDATE`](https://dev.mysql.com/doc/refman/8.0/en/insert-on-duplicate.html) — why the form has no conflict target and which key wins when several match.
- [Use The Index, Luke — Write Cost](https://use-the-index-luke.com/idx/write-cost.html) — the index-count argument with the arithmetic, which is the cleanest statement of the write-amplification case.

## Chapter 6 — NULL, Three-Valued Logic & the Perversity of SQL

### 6.1 `NULL` Is Not a Value

`NULL` is not zero, not an empty string, not `false`, and not a member of any domain. It is a
**marker that a value is absent or unknown**, and the reason it causes so much trouble is

arithmetic: SQL's comparison operators were defined over *values*, and `NULL` is not one.

```sql
SELECT NULL = NULL;        -- NULL   (not true, not false)
SELECT NULL <> NULL;       -- NULL
SELECT NULL + 1;           -- NULL
SELECT NULL || 'x';        -- NULL   (concatenation propagates)
SELECT 1 + NULL = 1;       -- NULL
SELECT NULL IS NULL;       -- TRUE    (the only operator that works)
SELECT NULL IS DISTINCT FROM NULL;  -- FALSE
```

`IS NULL` is not a comparison. It is a **type test** — "is this a marker rather than a value?"
— and it is the only operator that can answer the question that `NULL` actually poses.

```text
  THE THREE-VALUED TRUTH TABLES
  AND      T  F  U        OR       T  F  U        NOT
  T       T  F  U         T        T  T  T        T -> F
  F       F  F  F         F        T  F  U        F -> T
  U       U  F  U         U        T  U  U        U -> U

  Two consequences that generate the whole family of bugs:

  1. FALSE AND UNKNOWN  =  FALSE          (not unknown!)
     -> a WHERE clause can reject a row it "does not know" about,
        which is why  x <> 1  is not  x = 1  negated safely.

  2. FALSE OR UNKNOWN   =  UNKNOWN
     -> a WHERE clause can ACCEPT a row it "does not know" about,
        which is why a NOT IN with a NULL returns nothing.
```

### 6.2 The `WHERE` Clause Admits Only `TRUE`

This is the single rule that explains most `NULL` behaviour, and it is worth stating in a
form you can apply to any predicate you have not thought about for ten seconds.

```sql
SELECT * FROM orders WHERE shipped_at = '2026-01-01';
-- rows where shipped_at is NULL are NOT returned
--   because NULL = '2026-01-01' is UNKNOWN, and WHERE keeps only TRUE
SELECT * FROM orders WHERE shipped_at <> '2026-01-01';
-- rows where shipped_at is NULL are NOT returned either
--   because NULL <> '2026-01-01' is also UNKNOWN
-- the fix, and the reason two different-looking queries disagree:
SELECT * FROM orders WHERE shipped_at IS DISTINCT FROM '2026-01-01';
```

> **MUST REMEMBER**
>
> **`WHERE` and `HAVING` admit a row only when the predicate is definitively `TRUE`.**
> `UNKNOWN` is not "probably true", it is "not false", and it is dropped. Every `NULL` surprise
> in SQL is a consequence of that one sentence — the `NOT IN` that returns nothing, the
> `COUNT(col)` that is smaller than `COUNT(*)`, the `CHECK` that passes on a `NULL`, the
> anti-join that finds nothing. When a query returns fewer rows than you expect, ask "which
> predicate was `UNKNOWN` for the rows I expected?" before you ask anything about indexes.

### 6.3 `COUNT(*)` vs `COUNT(col)` vs `COUNT(DISTINCT col)`

```sql
CREATE TABLE attendance (person_id int NOT NULL, checked_in timestamptz);
SELECT count(*)          FROM attendance;   -- every row
SELECT count(checked_in) FROM attendance;   -- rows where it is NOT NULL
SELECT count(DISTINCT person_id) FROM attendance;  -- distinct non-NULL values
```

The behaviours follow directly from the previous section, but the *reasons* are worth having
straight because they are asked in different forms:

- **`COUNT(*)` counts rows.** It cannot be confused by a `NULL` because it never looks at a
  value. The common myth is that `COUNT(*)` is slow because it has to read the whole row —
  it does not; a count of rows can be answered from an index or a visibility-map entry
  without touching the heap at all.
- **`COUNT(col)` counts non-`NULL` values.** It is the standard way to answer "how many rows
  actually have this field filled in", which is a *data-quality* question wearing a
  SQL costume. The classic use is `SELECT count(*) - count(email) FROM users;` — the number
  of accounts with no email, which is a metric nobody puts on a dashboard and everybody
  needs.
- **`COUNT(DISTINCT col)` skips `NULL`s and then deduplicates.** A subtle and useful
  consequence: `count(distinct col)` is *not* the number of distinct values including the
  absent ones, so it under-reports by exactly the number of `NULL` rows if you were expecting
  the absent value as a category.
> **INTERVIEW TRAP — "WHAT IS THE DIFFERENCE BETWEEN `COUNT(*)` AND `COUNT(col)`?"**
>
> `COUNT(*)` counts rows; `COUNT(col)` counts rows in which `col` is not `NULL`. The mechanism
> is the three-valued logic, not a special case in the aggregate: `COUNT` is defined as "the
> number of non-`NULL` inputs", and `COUNT(*)` is the special form that supplies a
> never-`NULL` constant instead of a column, so it counts rows. The consequences people
> actually get wrong are: a `LEFT JOIN` followed by `COUNT(t2.id)` counts matches, not rows
> from the left table, and counts each match separately — so the right-hand count silently
> drops to zero on non-matching rows instead of counting them as 1, which is usually what
> `COUNT(*)` would have given you; and `SUM(DISTINCT x)` used as a detective measure on a
> fanned-out join silently skips `NULL`s in the measured column, so a `NULL` in the fact can
> make the diagnostic agree with a clean total. The genuinely useful framing is that
> `count(*) - count(col)` is a data-quality metric: it is the number of rows where this field
> is missing, and on any table where that number is not zero, every aggregate over that column
> is under-reporting by exactly that much.
>
> The staff-level addition belongs to the ownership question, not the syntax: the ownership
> rule for a team is *"every aggregate over a nullable column is a claim about the non-null
> subset, and the person who wrote it did not say so"*. That is what produces the finance
> report that is 3% short and nobody can find.

### 6.4 Aggregates Over Empty Sets

An aggregate over no rows returns **one row**, and that row contains a value that is usually
`NULL` rather than the identity you would expect.

| Aggregate | Over zero non-`NULL` inputs |
| --- | --- |
| `COUNT(col)` | `0` |
| `SUM(col)` | `NULL` |
| `AVG(col)` | `NULL` |
| `MIN(col)` / `MAX(col)` | `NULL` |
| `array_agg(col)` | `NULL` (or `{}` with a coalesce) |
| `string_agg(col, ',')` | `NULL` |

```sql
-- The classic: revenue for a month with no orders
SELECT sum(total_cents) FROM orders
 WHERE created_at >= '2026-02-01' AND created_at < '2026-03-01';
-- sum: NULL      <-- not 0
-- And the bug it causes, three layers up:
INSERT INTO monthly_revenue (month, revenue_cents)
VALUES ('2026-02', (SELECT sum(total_cents) FROM orders WHERE ...));
-- ERROR: null value in column "revenue_cents" violates not-null constraint
-- The insert fails, the job fails, and the report is simply MISSING for
-- February with no indication that February had no orders.
-- The fix, and the semantic question behind it:
SELECT coalesce(sum(total_cents), 0) FROM orders WHERE ...;
```

> **TRADE-OFF — "`COALESCE` TO ZERO, OR MAKE IT `NULL`?"**
>
> **Coalesce to zero** when absence genuinely means zero — no orders means no revenue, and a
> financial report that shows a blank for February is wrong. The cost is that you have thrown
> away the distinction between "zero" and "we could not compute this", and in a pipeline that
> distinction is often load-bearing: a failed upstream query that returns no rows now looks
> exactly like a month with no sales.
>
> **Leave it `NULL`** when absence means *unknown* — no rows matched because the partition was
> missing, the source was unavailable, or the time range was outside retention. `NULL`
> propagates, and a downstream `NOT NULL` insert then fails loudly, which is the correct
> behaviour: the pipeline stops rather than writing a confident zero.
>
> **The condition that flips the answer** is a question about the domain, not the code: *is
> there such a thing as a real zero here?* For revenue, yes. For a conversion rate whose
> denominator is zero, no — `0/0` is not zero, and coalescing it to zero reports a
> catastrophic failure as perfect performance. The general rule worth carrying: **coalesce at
> the boundary where the domain has agreed what absence means, and nowhere else.** A blanket
> `coalesce(…, 0)` across a codebase is how a metrics pipeline starts reporting zeros for
> outages.

### 6.5 `NOT IN` with a `NULL`

`NOT IN` inherits every property of three-valued logic, which means one `NULL` anywhere in
the list silently changes the meaning of the query:

```sql
SELECT * FROM orders WHERE customer_id NOT IN (10, 20, 30);   -- clean anti-join
SELECT * FROM orders WHERE customer_id NOT IN (10, 20, NULL);  -- returns ZERO rows
```

The full derivation — why the `NULL` poisons the predicate globally rather than filtering one
row, where those `NULL`s come from in practice, and why `NOT EXISTS` is the correct
replacement — belongs to **Volume 3, Section 3.3**, which treats it as a quantifier problem
meeting three-valued logic rather than as a `NULL` problem. The `IS DISTINCT FROM` answer
follows in Section 6.6 below.

### 6.6 `IS DISTINCT FROM`: The Operator That Fixes Half of SQL

`IS DISTINCT FROM` treats `NULL` as a comparable value: it is true when the two are different
*including* in their null-ness.

```sql
SELECT 1 IS DISTINCT FROM 2;         -- true
SELECT 1 IS DISTINCT FROM NULL;      -- true   (ordinary = would be UNKNOWN)
SELECT NULL IS DISTINCT FROM NULL;   -- false  (ordinary = would be UNKNOWN)
SELECT NULL IS NOT DISTINCT FROM NULL; -- true
-- The rewrite it makes possible
--  before:  WHERE shipped_at = '2026-01-01' OR shipped_at IS NULL
--  after:   WHERE shipped_at IS DISTINCT FROM '2026-01-01'
--  before:  WHERE NOT (status <> 'SHIPPED')      -- drops NULLs silently
--  after:   WHERE status IS NOT DISTINCT FROM 'SHIPPED'
--  before:  WHERE NOT EXISTS (SELECT 1 FROM x WHERE x.k = t.k)
--  after:   WHERE t.k IS DISTINCT FROM (SELECT k FROM x)   -- the NULL-safe NOT IN
```

It is not standard SQL, but both PostgreSQL and MySQL support it, and it is the single most
useful non-standard operator in the language. The reformulation it enables — turning
`NOT (a = b)` into `a IS NOT DISTINCT FROM b` — is the correct way to negate a comparison
without accidentally dropping `NULL` rows, and the fact that so few queries are written that
way is why NULL handling is still the most common source of subtly wrong reports.

### 6.7 `COALESCE` vs `NULLIF`

They are often presented as opposites. They are not: they do different jobs, and pairing them
produces a specific and useful idiom.

```sql
-- COALESCE: first non-NULL argument. A NULL-substitution operator.
SELECT coalesce(discount_pct, 0)                 FROM t;   -- default for a value
SELECT coalesce(a, coalesce(b, 'unknown'))       FROM t;   -- nested defaults
-- short-circuits: COALESCE never evaluates an argument it does not need,
-- which matters if the fallback is expensive or has side effects.
-- NULLIF: returns NULL if the two arguments are equal, else the first.
-- A NULL-TRIGGERING operator. It is a *guard*, and its whole purpose
-- is to create a division-by-zero or a constraint violation on demand.
SELECT avg(score / nullif(total_questions, 0))    FROM t;  -- classic
SELECT * FROM t WHERE col <> nullif(col, 0);              -- "non-zero and non-null"
-- THE PAIR, and the reason you want it:
-- COALESCE substitutes a value; NULLIF creates a hole.
-- Together they express "if the divisor is zero, the answer is unknown,
-- and the caller must supply a fallback rather than receive infinity."
```

The trap: `COALESCE` in a `WHERE` clause silently discards the `NULL` rows rather than
matching them, which is a bug with a plausible-looking cause:

```sql
-- Intended: match status = 'SHIPPED', or treat NULL as 'PENDING'
WHERE coalesce(status, 'PENDING') = 'SHIPPED'
-- That is fine logically, but it is UNINDEXABLE: the expression is not
-- the indexed column, so a 200M-row table gets a sequential scan.
-- The index-friendly form:
WHERE (status = 'SHIPPED' OR status IS NULL)   -- PostgreSQL may use a partial index
```

### 6.8 `NULL` in `GROUP BY` and `ORDER BY`

```sql
SELECT status, count(*) FROM orders GROUP BY status;
-- NULL is its OWN GROUP. It is not merged with the empty string,
-- not merged with 'UNKNOWN', and not omitted.
-- count(*) for the NULL group is the number of rows with no status,
-- which is usually the single most useful number in the result and
-- the one nobody is looking at.
SELECT * FROM t ORDER BY created_at;
-- PostgreSQL: NULLs sort LAST by default in ASC
-- MySQL:      NULLs sort FIRST in ASC
-- Both: NULLs sort FIRST in DESC
-- => The same query returns a different ORDER on two engines.
--    Never rely on it. Write NULLS FIRST / NULLS LAST explicitly.
```

> **PRODUCTION RELEVANCE**
>
> The `GROUP BY` fact has a concrete use worth volunteering: `GROUP BY status` on an order
> table gives you one row per status *plus* a row whose label is `NULL` and whose count is
> "orders with no status at all". In a dashboard that groups by status, that row either
> disappears (filtered by the presentation layer) or is rendered as a separate bar labelled
> "null" that nobody has ever clicked. The number of orders in that bucket is almost always
> the most actionable data-quality number in the table, and it is invisible by construction.
> The same applies to `sum()` over a group: the group's `NULL` total is not a bug, it is a
> fact about the group, and coalescing it to zero at the query level hides it.

### 6.9 The Default-Value-When-NULL Anti-Pattern

The single most damaging `NULL` decision in a schema is `DEFAULT 0` on a numeric column that
represents something whose absence is meaningful.

```sql
CREATE TABLE shipment (
    id            bigint PRIMARY KEY,
    tracking_code text    NOT NULL DEFAULT '',
    weight_kg     numeric(8,3) NOT NULL DEFAULT 0,   -- "unknown weight" is now 0.000
    delivered_at  timestamptz,
    signed_by     text
);
-- The bug this creates, in every downstream query:
SELECT avg(weight_kg) FROM shipment;                 -- dragged toward 0
SELECT sum(weight_kg) FROM shipment;                 -- under-reports freight cost
SELECT count(*) FROM shipment WHERE weight_kg > 0;   -- silently excludes unknowns
-- Nothing errors. The column is NOT NULL. The schema looks perfect.
```

The correct pattern is to let absence be visible:

```sql
CREATE TABLE shipment (
    id            bigint PRIMARY KEY,
    tracking_code text,
    weight_kg     numeric(8,3),              -- NULL means "not weighed"
    delivered_at  timestamptz,
    signed_by     text,
    CONSTRAINT shipment_has_code CHECK (tracking_code IS NOT NULL AND tracking_code <> '')
);
-- and every consumer is forced to make the decision explicitly:
SELECT avg(weight_kg) FROM shipment;                        -- ignores unknowns (correct)
SELECT avg(weight_kg) FILTER (WHERE weight_kg IS NOT NULL) FROM shipment;  -- explicit
```

> **MUST REMEMBER**
>
> **`DEFAULT 0` on a nullable-in-meaning column converts "unknown" into "zero", and that
> conversion is invisible from the schema.** Every `sum`, every `avg`, every `count(col) >
> 0` downstream is then quietly wrong, and the schema — which is `NOT NULL`, constrained and
> tidy — gives no hint of the problem. The defensive form is: **let the column be `NULL` when
> absence is meaningful, and add a `CHECK` when presence is mandatory.** A `CHECK
> (col IS NOT NULL AND col <> '')` is a better tool than a default, because a default supplies
> a value to anyone who forgets, while a check refuses the row.
> **INTERVIEW TRAP — "WHY IS `NULL` NOT EQUAL TO `NULL`?"**
>
> Because `NULL` is not a value — it is a marker that no value is present, and the `=`
> operator was defined over values. Two absences are not the same value; they are two
> *absences*, and the operator has nothing to compare. So `NULL = NULL` is `UNKNOWN`, not
> `TRUE`, and that is not a quirk of any engine, it is the consequence of the design decision
> to distinguish "unknown" from "not applicable" — the two things a single sentinel value
> would have conflated. That distinction is the entire reason `NULL` exists and it is also
> the reason it is a permanent wart.
>
> The mechanism people need to be able to state precisely: a comparison with `NULL` using an
> ordinary operator yields `UNKNOWN`; `WHERE` and `HAVING` admit only `TRUE`; therefore every
> row with a `NULL` in a compared column is silently excluded. So `WHERE x = 5` and
> `WHERE x <> 5` are **not** complements — both exclude the `NULL` rows — and any query that
> assumes they partition the table is wrong about exactly the rows whose value is absent.
> The two tools that fix it are `IS NULL` (a type test, not a comparison) and
> `IS DISTINCT FROM` (a comparison that treats absence as a comparable value, so
> `IS NOT DISTINCT FROM` is the correct negation of `=` and `NOT EXISTS` is the correct
> form of an anti-join). The senior-level closing is that this is not a database quirk to
> memorise but a design decision with consequences, and the schema-level defence is to decide
> per column whether absence is *unknown* or *not applicable*, because those two get opposite
> treatment in every one of these operators.

#### Common Mistakes

- Writing `WHERE col <> value` as if it were the complement of `WHERE col = value`, when
  both exclude `NULL` rows
- Using `NOT IN` with a subquery over a nullable column, and getting an empty result set
  with no error anywhere
- Putting `coalesce(col, 0)` in a `WHERE` clause, which makes the predicate unindexable and
  hides the `NULL` rows rather than matching them
- Coalescing an aggregate to zero in a pipeline, converting "we could not compute this" into
  "the answer is zero"
- Assuming `sum()` returns 0 for an empty set — it returns `NULL`, and the `NOT NULL` insert
  downstream fails with an error that points at the wrong statement
- Using `DEFAULT 0` on a column whose absence is meaningful, so `avg` and `sum` are quietly
  wrong from then on
- Relying on `NULL` ordering in `ORDER BY` and getting different results on PostgreSQL and
  MySQL
- Comparing with `= NULL` instead of `IS NULL`, which returns no rows and no error

#### Interview Questions — NULL & Three-Valued Logic

**Q1. Why is `NULL = NULL` not true, and what breaks because of it?** `STAFF`

Because `NULL` is not a value, it is a marker that no value is present, and `=` was defined
over values. The design reason `NULL` exists is to distinguish *unknown* (we do not know the
value) from *not applicable* (there is no value to know), and a single sentinel equal to
itself would conflate them. The mechanism to state precisely: any comparison with `NULL`
using an ordinary operator yields `UNKNOWN`, and `WHERE` admits only `TRUE`, so every row
with a `NULL` in a compared column is excluded. The consequence people miss is that `WHERE x
= 5` and `WHERE x <> 5` are **not** complements — both drop the `NULL` rows — so any query
that assumes they partition the table is wrong about exactly the rows whose value is absent,
and the schema-level defence is to decide per column whether absence means unknown or not
applicable, because those get opposite treatment in every operator.

**Q2. Why does `x NOT IN (1, 2, NULL)` return zero rows?** `ADVANCED`

Because `NOT IN` is syntactic sugar for `x <> 1 AND x <> 2 AND x <> NULL`, and the third
comparison is `UNKNOWN` for every row, and `UNKNOWN AND TRUE` is still `UNKNOWN`, and `WHERE`
keeps only `TRUE`. So the row is dropped regardless of what `x` is — the presence of one
`NULL` poisons the predicate *globally* rather than for matching rows. The result is an empty
set rather than an error, and the query is syntactically valid, so nothing warns you. The
practical skill is knowing where the `NULL` comes from, because it is almost never a typed

literal: it is a subquery selecting a nullable column, so

`WHERE id NOT IN (SELECT order_id FROM refunds)` dies the day someone makes

`refunds.order_id` nullable — a schema change in a different repository, months earlier. That
is what makes it a production incident rather than an interview question. The fix is
`NOT EXISTS`, which is NULL-safe by construction because it asks an existence question, which
has no third value, and which the planner can implement as a hash or merge anti-join instead of
a per-row list probe.

**Q3. What is the difference between `COUNT(*)`, `COUNT(col)` and `COUNT(DISTINCT col)`?** `TRICKY`
`COUNT(*)` counts rows, and cannot be confused by nulls because it never reads a value — and it
is not slow, because a row count can come from an index or a visibility-map entry without
touching the heap. `COUNT(col)` counts rows where `col` is not `NULL`, which makes
`count(*) - count(col)` a data-quality metric: the number of rows where the field is missing.
`COUNT(DISTINCT col)` skips `NULL`s and then deduplicates, so it under-reports by exactly the
number of absent rows if you were counting the absent value as a category. The trap people
fall into is with `LEFT JOIN`: `COUNT(t2.id)` counts matches, and counts each match
separately, so on a non-matching left row it returns 0 rather than 1 — meaning a fan-out
inflates it and a non-match deflates it, and `COUNT(*)` in the same query would have given
neither. The staff-level point is not the syntax, it is the ownership convention: every
aggregate over a nullable column is a claim about the non-null subset, and the person who
wrote it did not say so.

**Q4. Why does `sum()` over an empty set return `NULL` and not 0?** `TRICKY`

Because `SUM` is defined as an aggregate over its inputs, and with no non-`NULL` inputs there
is no value to sum — and the standard chose `NULL` over the additive identity 0 so that "no
data" is distinguishable from "the data sums to zero", which matters because zero revenue and
no revenue are different facts. `COUNT` is the exception, returning 0, precisely because
"count of nothing" is genuinely zero in a way that "sum of nothing" is not. The production
failure this causes is one layer downstream: `INSERT INTO monthly_revenue … VALUES
(coalesce((SELECT sum(…)), 0))` is necessary, and forgetting the `coalesce` produces a
`NOT NULL` violation whose error message points at the insert rather than at the empty
subquery four lines earlier, so the failure surfaces on a day with no orders and no
monitoring catches it until someone asks why February is missing. The rule worth stating is
to coalesce at the boundary where the *domain* has agreed what absence means, and nowhere
else — a blanket `coalesce(…, 0)` across a metrics pipeline is how an outage gets reported as
a month of zero sales.

**Q5. What problem does `IS DISTINCT FROM` solve?** `TRICKY`

It makes absence a comparable value, so the negation of a comparison is safe. `x = y` is
`UNKNOWN` when either side is `NULL`, and `NOT (x = y)` is also `UNKNOWN` in that case, so
writing a comparison's negation by wrapping it in `NOT` silently drops the `NULL` rows. The
correct negation is `x IS NOT DISTINCT FROM y`, which is true when both are `NULL` and false
when only one is. That single transformation is the whole fix for a large family of bugs:
`WHERE NOT (status <> 'SHIPPED')` becomes `WHERE status IS NOT DISTINCT FROM 'SHIPPED'`, and
the `NULL` rows are handled as the domain intends rather than vanishing. The same operator
gives you the NULL-safe replacement for `NOT IN` in the single-table case, and it is not
standard SQL but both PostgreSQL and MySQL support it. The senior observation is that so few
queries are written this way is precisely why NULL handling is still the most common source
of subtly wrong reports — the wrong answers are always *fewer rows*, and fewer rows do not
raise anything.

**Q6. Your `avg()` over a nullable measurement column is too low. Where do you look?** `STAFF`
At the column's history, not the query. The usual cause is a `DEFAULT 0` applied when the
column was added, or an ETL that coalesces a parse failure to zero rather than leaving it
absent. `avg()` skips `NULL`s, which is correct behaviour and is doing exactly what it should
— but if the "unknown" measurements were stored as 0 rather than as `NULL`, then every
zero is being averaged in as a real measurement and the mean is dragged toward the floor. The
diagnostic is a single query: `SELECT count(*) AS total, count(weight_kg) AS measured,
round(100.0 * count(weight_kg) / count(*), 1) AS pct_measured FROM shipment;` and if that
percentage is low, the average is not wrong arithmetic, it is a claim about a subset nobody
wrote down. The prevention is a schema decision — a column whose absence is meaningful stays
nullable and is never defaulted, and if presence is mandatory you add

`CHECK (col IS NOT NULL)` rather than a default, because a default supplies a value to anyone
who forgets while a check refuses the row.

**Q7. Why does `GROUP BY` treat `NULL` as its own group, and why does that matter?** `TRICKY`
Because `GROUP BY` uses the equality of the grouping expression, and `NULL` is not equal to
anything, so the `NULL` group cannot be merged with any other group — it forms a group of its
own. That is usually the right behaviour and it is almost always invisible: a

`GROUP BY status` on an order table returns one row per status plus a row whose label is
`NULL` whose count is the number of orders with no status, and in a dashboard that row either
disappears in the presentation layer or renders as an unlabelled bar nobody has ever clicked.
That count is typically the most actionable data-quality number in the table. The related trap
is ordering: `NULL`s sort last in `ASC` on PostgreSQL and first in `ASC` on MySQL, so the same
query returns rows in a different order on two engines — which is why `NULLS FIRST` and
`NULLS LAST` should always be written explicitly rather than inherited from a default that
differs between the systems you might be migrated onto.

> **CHAPTER 6 SUMMARY**
>
> `NULL` is a marker, not a value, and every consequence in this chapter falls out of that one
> fact. A comparison with `NULL` yields `UNKNOWN`; `WHERE` and `HAVING` admit only `TRUE`;
> therefore `NULL` rows are silently excluded from both sides of a comparison, `NOT IN` with a
> `NULL` in the list can never be true for any row, `COUNT(col)` differs from `COUNT(*)`, and
> `CHECK` constraints pass. The operators that fix it are `IS NULL` (a type test), `IS NOT
> DISTINCT FROM` (a safe negation) and `NOT EXISTS` (an existence question, which has no third
> value). The staff-level lessons are about defaults: `DEFAULT 0` on a column whose absence is
> meaningful converts "unknown" into "zero" and makes every downstream `sum` and `avg` quietly
> wrong, and a blanket `coalesce(col, 0)` in a pipeline converts "we could not compute this"
> into "the answer is zero". Coalesce at the boundary where the domain has agreed what absence
> means, and nowhere else.

#### Further Reading

- [PostgreSQL — Functions and Operators, Conditional Expressions](https://www.postgresql.org/docs/current/functions-conditional.html) — `COALESCE`, `NULLIF` and the `CASE` forms, from the engine that implements them most carefully.
- [PostgreSQL — Comparison Operators](https://www.postgresql.org/docs/current/functions-comparison.html) — the three-valued comparison semantics, and `IS DISTINCT FROM` in its proper place.
- [PostgreSQL — Querying with `ORDER BY`](https://www.postgresql.org/docs/current/queries-order.html) — the explicit `NULLS FIRST` / `NULLS LAST` syntax and the default that differs between engines.
- [Use The Index, Luke — `NULL` in SQL](https://use-the-index-luke.com/idx/null.html) — the practical index consequences, including why `IS NULL` can use an index and `= NULL` cannot.
- [SQL Standard — `Unknown` truth value](https://www.postgresql.org/docs/current/datatype-logical.html) — the formal treatment of three-valued logic, for the candidate who is asked to derive the truth tables.

## Chapter 7 — Views, Materialized Views & Generated Columns

### 7.1 A View Is a Saved Query, Not a Table

The mental model that causes the most trouble is "a view is like a table but virtual". The
accurate model is narrower: **a view is a named query, stored in the catalogue, that the
parser expands into the statement that uses it.** It has no storage, no rows, no statistics
of its own, and no independent existence — it is a macro with a schema.

```sql
CREATE VIEW order_totals AS
SELECT o.id, o.customer_id, o.status, sum(l.qty * l.unit_cents) AS total_cents
  FROM orders o
  JOIN order_line l ON l.order_id = o.id
 GROUP BY o.id, o.customer_id, o.status;
-- What actually happens when you query it:
SELECT * FROM order_totals WHERE status = 'SHIPPED';
-- is rewritten to
SELECT o.id, ... FROM orders o JOIN order_line l ON l.order_id = o.id
 WHERE o.status = 'SHIPPED' GROUP BY o.id, o.customer_id, o.status;
-- The view contributed nothing. It is textual substitution.
```

Three consequences that follow directly and that every engineer meets:

- **The view does not shield the schema.** `ALTER TABLE orders DROP COLUMN status` succeeds
  if no view depends on it *in a way the engine tracks*; in PostgreSQL it fails with a
  dependency error, in MySQL it may succeed and leave you with a view that errors at query
  time. Either way, the view is a claim about columns that somebody can break from another
  file.
- **The view has no statistics.** The planner has no idea how many rows a view produces
  unless it inlines it and can reason about the underlying tables — which it can, and which
  is why inlining is usually a *good* thing for plans and a *bad* thing for evolvability.
- **A view nested twelve deep is twelve queries to read.** The text substitution means a
  12-level view stack is a 12-level expansion, and any reviewer debugging it is reading
  generated SQL.
> **MUST REMEMBER**
>
> **A view is a query fragment with a name; a materialized view is a table with a
> refresh policy.** Every design question about views follows from that distinction. The
> question "is this view updatable?" is really "did I write it as a simple projection over
> one table?" The question "is this view stale?" only has an answer for the materialized kind
> — a plain view is never stale, because it has no contents. And the question "should this be
> a view or a table?" is really "is the expensive part the *definition* or the *result*?"

### 7.2 Updatable Views and the `WITH CHECK OPTION` Guarantee

A view over a single table, with no aggregation, no `DISTINCT`, no set operation and no
grouping, is **updatable** in most engines: an `INSERT`, `UPDATE` or `DELETE` against it is
routed to the base table.

```sql
CREATE VIEW active_users AS
SELECT id, email, created_at FROM users WHERE deleted_at IS NULL;
-- PostgreSQL: this works. The WHERE is part of the view's definition,
-- so the base table gets "AND deleted_at IS NULL" appended.
UPDATE active_users SET email = 'new@x.com' WHERE id = 42;
-- But: you can now UPDATE a row that the view did not show.
UPDATE users SET deleted_at = now() WHERE id = 42;
```

`WITH CHECK OPTION` closes exactly that hole. It requires that every row *written through the
view* still satisfies the view's own `WHERE` clause.

```sql
CREATE VIEW active_users AS
SELECT id, email, created_at FROM users WHERE deleted_at IS NULL
WITH LOCAL CHECK OPTION;   -- LOCAL: check against this view only
-- WITH CASCADED CHECK OPTION: check against this view AND every
--   view it is built on, so a nested view's filters apply too.
```

Without it, you can drive a view into a state the view's own definition says is impossible.
With it, you get an error at write time — and the error is the point, because the alternative
is a view that is quietly wrong.

```text
  THE VIEW-LAYERING FAILURE, IN ONE DIAGRAM
    CREATE VIEW v_all       AS SELECT * FROM users;
    CREATE VIEW v_active    AS SELECT * FROM v_all WHERE deleted_at IS NULL;
    CREATE VIEW v_verified  AS SELECT * FROM v_active WHERE verified_at IS NOT NULL;
    INSERT INTO v_verified (email) VALUES ('x@y.com');
    -- writes to `users`. v_active's filter is NOT enforced.
    -- v_verified now CONTAINS a row that v_active excludes,
    -- and v_active CONTAINS a row that v_all excludes.
    -- The views are supposed to be nested subsets. They are not.
    WITH CASCADED CHECK OPTION on v_verified:
    -- ERROR: new row violates check option for view "v_active"
```

### 7.3 The Write-Through Question

The question to ask in a design review is not "is this view updatable" but **"what happens if
somebody writes through it?"** The failure mode is a view that hides a trigger, an audit
trail, or a partition boundary.

```text
  WHERE THE WRITE ACTUALLY LANDS
  INSERT INTO v_verified (…) VALUES (…)
      │
      ▼
  the planner rewrites this to INSERT INTO users (…) VALUES (…)
      │
      ├── triggers on `users` DO fire          (PostgreSQL: yes, they fire)
      ├── but the caller's context is lost:    the view hid which path was used
      ├── row-level security on `users`?       applies (PostgreSQL), so RLS is safe
      ├── a BEFORE INSERT trigger that rewrites columns?  fires, possibly
      │     overwriting what the view's owner intended
      └── in MySQL, a view defined with ALGORITHM=MERGE vs TEMPTABLE
            changes whether the write is even possible at all

  The practical rule: treat every view you create as READ-ONLY in
  your conventions, and grant UPDATE/DELETE on the base tables
  directly. A view is an interface for reading, not a permission
  boundary for writing.
```

> **INTERVIEW TRAP — "ARE VIEWS FASTER THAN TABLES?"**
>
> The question conflates two completely different things, and the honest answer is *it depends
> on which view you mean*. A **plain view** is a saved query that the engine inlines before
> planning, so it costs exactly what the query underneath it costs — no less, because there is
> no cached result, and no more, because the planner sees the real tables and can choose a
> good plan. It is sometimes marginally *better* than writing the query yourself, because a
> view can be annotated with planner hints or security-barrier settings, and because it stops
> the definition from being copy-pasted into twelve application queries where it drifts. A
> **materialized view** is a real table with real storage, and it is faster for exactly the
> reason a table is faster than a query: the result already exists. It is also a second copy
> of the data, which brings a refresh policy, a staleness window, and a write path that is now
> the refresh rather than the query.
>
> The trap underneath both is **staleness with no error**. A materialized view does not know
> it is out of date; it confidently returns last refresh's numbers, and there is nothing in the
> result set, the plan, or the log to distinguish a fresh answer from a six-hour-old one. So
> the question is never "is the view fast", it is "**how stale may this number be, and where
> is that documented**" — and the staff-level follow-up is that a materialized view's staleness
> is a *design parameter* that has to be written down, monitored, and agreed with whoever
> consumes it, because the failure mode is a finance report that is wrong by six hours of
> trading and reports no error at all.

### 7.4 Materialized Views: Staleness, Refresh Cost, `CONCURRENTLY`

```sql
CREATE MATERIALIZED VIEW daily_revenue AS
SELECT date_trunc('day', created_at) AS day,
       sum(total_cents)             AS revenue_cents
  FROM orders
 GROUP BY 1;
-- The four refresh modes, and what each costs:
REFRESH MATERIALIZED VIEW daily_revenue;
--   Full recompute under ACCESS EXCLUSIVE. The old contents stay
--   visible until the swap. Cost: O(whole view).
REFRESH MATERIALIZED VIEW CONCURRENTLY daily_revenue;
--   Recompute into a temp structure, then SWAP. Readers see the
--   old data until the instant of the swap. Requires a UNIQUE index
--   on the view. Cost: 2x disk, 2x compute, and it can run while
--   the table is being read and written. This is the one you want.
REFRESH MATERIALIZED VIEW daily_revenue;
--   (UNIQUE version) Single-row update, if the view is a simple
--   delta — this is what makes incremental refresh possible.
-- And the incremental pattern, which is the real engineering:
--   a counter table (day -> last_watermark) is updated in the same
--   transaction as the orders, and a job refreshes only the days
--   whose watermark moved.
```

The cost model for choosing between full and incremental:

| | Full refresh | Incremental | `CONCURRENTLY` |
| --- | --- | --- | --- |
| Recompute cost | O(whole view) | O(changed rows) | O(whole view) |
| Reader impact | none during compute, blocked at swap | none | none |
| Peak disk | 1x | 1x + delta | 2x |
| Complexity | low | needs a watermark and a delta source | needs a unique index on the view |
| Failure mode | stale by one cycle | **stale by a cycle, silently, if the watermark is wrong** | a failed refresh leaves the old view in place, which is *good* |

> **SCALING REALITY CHECK**
>
> A full refresh is fine while the view is cheaper to recompute than to maintain, which in
> practice means while the underlying table is under about a million rows *and* the query is a
> simple aggregate. Past that, three things break in order: the refresh's runtime crosses the
> job's window, the `ACCESS EXCLUSIVE` swap starts colliding with the peak hour, and the
> replica cannot apply the recompute within its lag budget, so a materialized view designed to
> offload reporting ends up *delaying* reporting. The honest answer at that point is usually
> not a better refresh strategy but a **partitioned source and a per-partition view**, or a
> real reporting store — which is Volume 6's territory and a decision made when the table is
> designed, not when the report is slow.

### 7.5 Generated and Stored Columns

A generated column computes a value from other columns of the same row, at write time or on
read, and stores it (or not).

```sql
-- STORED: computed at INSERT/UPDATE, physically present, indexable,
--           the value cannot drift from its inputs.
CREATE TABLE order_line (
    id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id     bigint      NOT NULL,
    qty          integer     NOT NULL CHECK (qty > 0),
    unit_cents   bigint      NOT NULL CHECK (unit_cents >= 0),
    tax_bps      integer     NOT NULL DEFAULT 0,
    line_cents   bigint GENERATED ALWAYS AS
                 (qty * unit_cents + (qty * unit_cents * tax_bps) / 10000) STORED,
    CONSTRAINT order_line_total_positive CHECK (line_cents >= 0)
);
-- VIRTUAL (MySQL, PostgreSQL 18+): computed on read, not stored,
--           costs nothing in storage, but must be indexed to be usable.
CREATE TABLE order_line_v (
    qty        integer NOT NULL,
    unit_cents bigint  NOT NULL,
    line_cents bigint AS (qty * unit_cents) VIRTUAL
);
```

The cases where a generated column is the right tool:

- **A derived value that must not drift.** `line_cents` cannot disagree with `qty` and
  `unit_cents`, because there is no way to write one without the other. A trigger could
  enforce it; a `CHECK` could assert it; only a generated column makes it structurally
  impossible.
- **An indexable expression.** This is the under-used power. A functional index and a stored
  generated column do the same job, and the generated column wins when the expression is
  complex enough that the functional index's maintenance cost on every write is worth paying
  once, or when you want the value in the tuple for an index-only scan.
- **A normalisation that must be enforced.** A `lower(email)` search column, generated and
  stored, means no writer can skip the normalisation — the column is a `GENERATED ALWAYS`, so
  `INSERT`ing a value into it is an error, not a silent inconsistency.

```sql
-- The canonical use: making case-insensitive uniqueness declarative
CREATE TABLE users (
    id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    email      text NOT NULL,
    email_norm text GENERATED ALWAYS AS (lower(trim(email))) STORED
);
CREATE UNIQUE INDEX users_email_norm_key ON users (email_norm);
-- Now "unique" means unique, regardless of case or whitespace,
-- and no writer — service, import, admin tool, psql — can skip it.
-- This is the fix for the trap in Chapter 2.6 and 3.6 together.
```

> **INTERVIEW TRAP — "WHY NOT JUST USE A TRIGGER?"**
>
> Three reasons, and they are structural rather than stylistic. A trigger is **invisible in
> the schema**: `DESCRIBE`/`\d` does not show it, a schema dump does not include it, and a
> new engineer reading the table definition has no way to learn that `line_cents` is
> maintained by something. A trigger is **brittle under refactoring**: rename a column and the
> trigger silently stops compiling, or worse, keeps working against a column that no longer
> means what it meant. And a trigger's **firing semantics are subtle and differ by type** — a
> statement-level trigger fires once per statement, a row-level trigger once per affected row,
> `INSERT … ON CONFLICT DO UPDATE` fires the update path's triggers and not the insert path's,
> and some bulk paths bypass triggers entirely. A generated column has none of these problems:
> it is declared where the value is declared, it is type-checked, it cannot be bypassed, and
> `GENERATED ALWAYS` means a writer who tries to set it gets an error rather than a silent
> inconsistency.
>
> The honest caveat, which is what a staff answer adds: a generated column can only reference
> **other columns of the same row**, in a deterministic expression. The moment the derivation
> needs another row — a total that must equal the sum of its children, a non-overlap
> constraint, a value from a lookup table — you are back to a trigger, and the right move is
> to try to reshape the invariant first (a partial unique index, an exclusion constraint, a
> generated column that hoists the needed data into the row) rather than to reach for the
> trigger immediately.

### 7.6 When a View Is a Liability

Views are not free, and the failure mode is a specific one: a view that everyone reads and
nobody owns.

```text
  THE VIEW THAT BECAME LOAD-BEARING
  v_order_summary
    ├─ read by 6 services
    ├─ used by 2 BI dashboards
    ├─ referenced in 1 compliance export
    ├─ joined into 14 hand-written reports
    └─ last reviewed: 2 years ago, by someone who has left

  Now the request is: "add cancelled_at to the view."
    - Which consumers can tolerate the extra column?  (fine — additive)
    - Does anything SELECT *?  (then the shape changed)
    - Can we instead add a second view and migrate?  (six services)
    - Who signs off?  (nobody owns it)

  The view was a convenience. It is now an API with 9 consumers
  and no versioning policy, and it grew there without anyone deciding.
```

> **STAFF-LEVEL CONSIDERATION**
>
> The question to raise in a design review is not "should we use a view" but **"what happens
> when this view needs to change"**. A view with one consumer is a named query and costs
> nothing. A view with nine consumers and no owner is a public interface without a version
> policy, a deprecation process, or a test suite — and it accumulated that way without a
> single decision, which is the part that makes it hard to fix. The mitigations are unglamorous
> and effective: require that any view with more than one consumer have a named owner in the
> schema's README; prefer **additive** changes only (`CREATE VIEW v2 AS …` and migrate
> consumers) over in-place changes; and keep a catalogue query in the review checklist that
> lists every view with its consumer count, run quarterly, because the view with nine
> consumers did not get nine consumers in one decision. Volume 6 owns the schema-evolution
> side of this and Volume 11's Elasticsearch material covers the same drift when the "view"
> becomes an index or a mapping.
> **TRADE-OFF — "VIEW, MATERIALIZED VIEW, OR A REAL TABLE?"**
>
> **View** when the query is cheap or the planner can optimise it, and when you want
> guaranteed freshness for free. It costs nothing in storage and never goes stale, because it
> has no contents. It gives up on two things: repeated execution of an expensive query, and
> stability of the result's cost, because the plan changes when the statistics change.
>
> **Materialized view** when the query is genuinely expensive — a multi-join aggregate over
> tens of millions of rows — and staleness bounded by a refresh window is acceptable. You pay
> a second copy of the data, a refresh job, a failure mode that is silent, and a
> `REFRESH` that either blocks or needs `CONCURRENTLY` plus a unique index plus double disk.
>
> **A real table** when the derived data is not derivable any more — because the source
> changed shape, or because you need to enrich it with something the source does not have, or
> because you need to write to it. This is the version that has been quietly chosen by teams
> whose materialized view refresh kept failing, and the honest way to arrive at it is to say
> so up front rather than let it happen. The condition that flips the answer is always the
> same: **is the expensive part the definition, or the result?** If the definition is what is
> hard to write and it is cheap to run, use a view. If the result is expensive to produce and
> staleness is bounded, use a materialized view. If it is expensive *and* you need to write to
> it, use a table and accept the synchronisation problem you have just created.

#### Common Mistakes

- Treating a plain view as a cache, and being surprised that it recomputes on every query
- Writing through an updatable view without `WITH CHECK OPTION`, and letting the view contain
  rows its own definition excludes
- Creating a materialized view with a full refresh on a schedule that eventually crosses the
  peak hour, and calling it a performance problem when it is a scheduling one
- Using `REFRESH MATERIALIZED VIEW` without a unique index on the view and without knowing
  you cannot then use `CONCURRENTLY`
- Adding a generated column that references another row — which is not possible — and
  concluding generated columns do not work
- Using a trigger where a generated column would make the invariant structurally impossible
- Creating a view with many consumers and no owner, and then being unable to change it

#### Interview Questions — Views & Derived Data

**Q1. Are views faster than tables? When is a view the right answer?** `TRICKY`

A plain view is not faster or slower than the query it wraps — the engine inlines the
definition before planning, so it costs exactly what the underlying query costs, and it is
sometimes marginally better because a single definition cannot drift across twelve
copy-pasted application queries, and because the view is where planner hints and
security-barrier settings live. What a plain view buys you is a named, single-source
definition and guaranteed freshness, for free, with no storage. What it costs is evolvability:
the view is a claim about columns that a change in another file can break, and `ALTER TABLE …
DROP COLUMN` on a table a view references may fail, or in MySQL may succeed and leave you
with a view that errors at query time. So a view is right when the query is cheap or the
planner can optimise it, and when you want one definition rather than twelve. It is wrong when
the query is expensive and runs often, because then you want a materialized view or a real
table.

**Q2. What does `WITH CHECK OPTION` do, and what breaks without it?** `TRICKY`

It requires that every row written *through* the view still satisfies the view's own `WHERE`
clause. Without it, a view is only a read filter: `CREATE VIEW active_users AS SELECT … WHERE
deleted_at IS NULL` can be updated, and you can also make a row's `deleted_at` non-null
through some other path, so the view and the base table diverge silently. The failure that
matters is the layered one: stack `v_all` over `v_active` over `v_verified` and an insert
through `v_verified` does not enforce `v_active`'s filter, so `v_verified` ends up
containing rows that `v_active` excludes and `v_active` containing rows `v_all` excludes —
the views are supposed to be nested subsets and are not. `WITH LOCAL CHECK OPTION` checks
against this view's own predicate; `WITH CASCADED CHECK OPTION` also checks every view it is
built on, which is what you want for a stack. And the practical convention that makes this

moot: treat views as read-only interfaces, grant write privileges on the base tables

directly, because a view is a naming device and not a permission boundary.

**Q3. When would you materialize a view, and what does it cost?** `ADVANCED`

When the query is genuinely expensive to run and cheap to run *less often* — a multi-join
aggregate over tens of millions of rows, computed nightly for a dashboard — and the consumer
can tolerate staleness bounded by the refresh window. The costs, and they are not small: a
second physical copy of the data, so storage and backup double; a refresh job that is itself
an operational concern with its own monitoring; a failure mode that is **silent**, because a
materialized view has no idea it is out of date and returns last refresh's numbers with no
indicator anywhere; and a `REFRESH` that is either exclusive at the swap, or requires
`CONCURRENTLY`, which needs a unique index on the view and doubles peak disk and compute. The
full-versus-incremental choice then becomes the real engineering: full refresh is fine while
recomputing is cheaper than maintaining, which in practice means while the source is under
about a million rows, and past that you need a watermark table updated in the same
transaction as the source, with the risk that a wrong watermark is *also* silent. The
honest alternative at that scale is a partitioned source with per-partition views, or a real
reporting store — a Volume 6 decision made at design time rather than when the report is
slow.

**Q4. When is a generated column better than a trigger?** `ADVANCED`

Whenever the value is a deterministic function of other columns in the same row, which covers
most of the cases people reach for a trigger over. Three structural reasons make the
generated column strictly better there. It is **visible in the schema** — the definition sits
next to the columns it depends on, so `DESCRIBE` shows it and a schema dump includes it, while
a trigger is invisible to both. It is **brittle-free under refactoring** — a trigger that
references a renamed column silently stops working, whereas a generated column fails to be
created and the rename is rejected. And it is **unbypassable** — `GENERATED ALWAYS` means a
writer who tries to supply the value gets an error rather than a silent inconsistency, which
is exactly the protection a trigger written by one person and maintained by another does not
provide. The important limit to state is that a generated column can only reference other
columns of the same row in a deterministic expression, so anything needing another row — a
total equal to the sum of its children, a non-overlap rule, a value from a lookup table — is
genuinely a trigger, and the right move there is to reshape the invariant first with a partial
unique index, an exclusion constraint, or by hoisting the needed data into the row.
**Q5. What is the most dangerous property of a materialized view?** `STAFF`

That it is **stale with no error**. A plain view has no contents and so cannot be stale; a
materialized view has real contents that were correct as of the last refresh, and it has no
way to tell a consumer that this. So a finance dashboard reading a materialized view is
reading a number that is wrong by up to one refresh window, and there is nothing in the
result, the plan, the log, or the API response to distinguish a fresh answer from a six-hour-old
one. A failed refresh is the same failure: if the refresh job has been failing for a week, the
view silently keeps serving last week's data and no query ever errors. The staff-level response
is to treat staleness as a **design parameter that has to be written down and monitored**, not
a property of the implementation: record the maximum acceptable lag in the schema's README,
expose the last successful refresh timestamp in the data the consumer actually receives rather
than in a dashboard nobody opens, and alert on refresh age rather than on refresh failure. The
reflex to unlearn is "materialized views are a performance feature" — they are a performance
feature that also creates a silent correctness problem, and the two have to be designed
together.

**Q6. Your team has a view with nine consumers and no owner. How do you fix it without
breaking anything?** `STAFF`

By treating it as a public interface and applying interface discipline, because that is what
it has become whether anyone decided it or not. Concretely: first, make the consumers visible,
because nobody can manage what they have not counted — a catalogue query joining
`pg_depend` or `information_schema` to list every view with its referencing count turns an
argument into a number, and it is a five-minute query that has changed the outcome of these
conversations more than any other step. Second, assign an owner in the schema's README; an
unowned interface is what made this unreviewable, and the current maintainers are volunteers by
default. Third, restrict changes to **additive** ones — `CREATE VIEW v2 AS …` alongside the
existing view, migrate consumers one at a time, and only drop `v1` when the count reaches
zero. Fourth, add the consumer-count query to the quarterly review so the next nine consumers
arrive as a visible number rather than as a surprise. The framing that lands is that the view
did not become load-bearing through a decision; it accumulated, and the fix is to make
change cost proportional to the consumer count rather than pretending the count is one.

> **CHAPTER 7 SUMMARY**
>
> A view is a named query the parser inlines — no storage, no statistics, no independent
> existence — and a materialized view is a table with a refresh policy. Every practical
> question follows: a plain view is never stale and costs what its query costs, so reach for
> it when you want one definition rather than twelve; a materialized view is fast and
> **silently stale**, so its maximum acceptable lag is a design parameter that must be
> written down, exposed to consumers, and alerted on. Updatable views are a write-through
> hole unless `WITH CHECK OPTION` closes it, and with stacked views you want `CASCADED`; the
> better convention is to treat views as read-only interfaces and grant writes on the base
> tables. Generated columns are strictly better than triggers whenever the value is a
> deterministic function of the same row's other columns, because they are visible in the
> schema, survive refactoring, and cannot be bypassed — and they cannot reference another row,
> which is the boundary where a trigger becomes correct rather than lazy.

#### Further Reading

- [PostgreSQL — `CREATE VIEW`](https://www.postgresql.org/docs/current/sql-createview.html) — the updatability rules and exactly when a view becomes read-only.
- [PostgreSQL — Materialized Views](https://www.postgresql.org/docs/current/rules-materializedviews.html) — the refresh modes, `CONCURRENTLY` and its unique-index requirement, and how to make a view incrementally updatable.
- [PostgreSQL — Generated Columns](https://www.postgresql.org/docs/current/ddl-generated-columns.html) — `STORED` semantics and why generation happens at write time rather than at read time.
- [MySQL — Generated Column Optimizations](https://dev.mysql.com/doc/refman/8.0/en/generated-column-optimizations.html) — indexed virtual and stored generated columns, and the functional-index equivalence.
- [PostgreSQL — `WITH CHECK OPTION` and View Updatability](https://www.postgresql.org/docs/current/sql-createview.html) — the `LOCAL` versus `CASCADED` distinction that the layered-view failure depends on.

---

### End of Volume 2

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Name, from memory, which forms of `ALTER TABLE` are catalogue-only and which physically
  rewrite the table, and state the lock each one takes
- Write an expand/backfill/dual-write/contract migration for a renamed column, and say which
  step is the point of no return
- Explain why `float` cannot represent 0.1, why that error accumulates, and choose between
  `NUMERIC` and integer minor units for a given set of consumers
- Predict exactly what `INSERT … ON CONFLICT DO UPDATE` does with and without a unique index
  behind it, on both PostgreSQL and MySQL
- Derive the write cost of a foreign key and name the table where its lock contention appears
- Explain why `x NOT IN (1, 2, NULL)` returns no rows, and write the `NOT EXISTS` replacement
- State the difference between `COUNT(*)`, `COUNT(col)` and `SUM` over an empty set, and say
  when coalescing to zero is a bug
- Compare `DELETE`, `TRUNCATE` and `DROP` on MVCC, lock level, sequence reset and reversibility
- Design a resumable, throttled, kill-switchable batch delete for a 40-million-row table
- Say what `WITH CHECK OPTION` prevents, and when a generated column is strictly better than a
  trigger
- State the maximum acceptable staleness of a materialized view, and how it would be alerted on

### Coming in Volume 3 — SQL — Queries, Joins, CTEs & Window Functions

Volume 2 established that SQL is a language of permanent, unreviewable decisions: what a
column can hold, what a row must satisfy, and what a write costs. It left the question of
*reading* almost entirely open — how a query is decomposed, what order its clauses are
evaluated in, and what the engine does with the relationships a schema expresses.
Volume 3 takes that up. It is the volume that makes SQL a language you write fluently rather
than pattern-match, covering evaluation order, join semantics and the fan-out that breaks
every aggregate, anti-joins and the set operations, subqueries and their correlation, recursion
through hierarchical and recursive CTEs, and the window functions that let you express "top N
per group" and running totals without a self-join. The order matters because Volume 4 then
opens the hood on why a particular plan was chosen, and every plan in that volume is a
consequence of the query shape this one teaches.

## Chapter 8 — DDL & DML Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness. Read the **D** answers twice.

### Schema Evolution

**P1. A deploy at 10:15 caused 40,000 HTTP 500s over 29 seconds. The migration step reported
success. What happened?** `SCENARIO`

The migration was coupled to the deploy without an expand phase. Most likely it renamed a
column, or changed a column's type, and the running application still generated SQL containing
the old name — which fails at parse time, not at the storage layer, so every request in the
window failed instantly and loudly. The 29 seconds is the gap between the migration completing
and the new pods becoming ready. The recovery is to run the inverse DDL, which is equally
instant, before the new code starts; anything later and the application has to be rolled back
too. The lesson is that a rename is a coordinated event across two deploy units, and the
correct shape is expand (add nullable), backfill in batches, dual-write, switch reads, contract
on a later date.

**T1. You run `ALTER TABLE t ADD COLUMN status text NOT NULL DEFAULT 'ACTIVE'` on a
200-million-row table on PostgreSQL 15. How long does it lock, and does it rewrite?** `TRICKY`
Milliseconds, and no rewrite. Since PostgreSQL 11, a column added with a *non-volatile* default
is recorded in the catalogue as a missing-value attribute, and the default is synthesised on
read for rows that predate the column, so there is no scan and no tuple rewrite. The column
must still be written by the engine for new rows, which is why the `NOT NULL` does not force a
scan. Two caveats worth volunteering: on PostgreSQL 10 and earlier this is a full rewrite with
`ACCESS EXCLUSIVE` for its duration; and a *volatile* default such as `now()` is not folded, so
`ADD COLUMN created timestamptz DEFAULT now()` does rewrite — the workaround is to add it
nullable with no default, backfill, then `SET DEFAULT now()`, which is metadata only.
**T2. Two sessions are blocked behind your `ALTER TABLE`. What are they waiting on, and what
will the application do next?** `ADVANCED`

They are queued on the table's `ACCESS EXCLUSIVE` lock, which conflicts with every other lock
level a query can take, so reads and writes both queue. The application will not see a database
error at first — it will see latency, and it will hit *its own* timeout, which is configured in
the application and usually much shorter than the database's `lock_timeout`. That is why the
symptom of a long DDL is "the service is down" rather than "a migration is running", and why
the on-call engineer should be looking at `pg_locks` and `pg_stat_activity` rather than at
error rates. The practical defence is a short `lock_timeout` on the DDL itself, so a migration
that cannot get its lock fails fast and retries on the next deploy rather than freezing the
table behind a queue that grows for nine minutes.

**S1. A migration adds `CREATE INDEX` (no `CONCURRENTLY`) to a 60-million-row column that is
written on every request. Review comment?** `STAFF`

It takes a `SHARE` lock, which allows reads but **blocks all writes** for the duration of the
build, and a 60-million-row build is minutes. For a column that is written on every request,
that is a write outage, not a slow deploy. `CREATE INDEX CONCURRENTLY` takes only
`SHARE UPDATE EXCLUSIVE`, allows reads and writes throughout, and costs two table scans plus
brief exclusive moments at the start and end. The trade-off to name: a concurrent build can
fail and leave an `INVALID` index behind, which still costs write performance and disk until
dropped, so the migration needs a retry and a `DROP INDEX CONCURRENTLY` on failure. On a very
large table, building the index on a replica and promoting is the third option.

**T3. A table has 50 million rows and you must add a `NOT NULL` column with a default.
`ALTER TABLE … ADD COLUMN … NOT NULL DEFAULT 0` and `ADD COLUMN` then backfill then
`SET NOT NULL` produce different plans. Which, and why does it matter which you run at
02:00?** `ADVANCED`

On PostgreSQL 11 and later both are cheap in lock terms: the first is a catalogue operation
because a non-volatile default is stored as a missing-value attribute, and the second is three
cheap statements plus a backfill. The difference that matters at 02:00 is the *third* phase.
`SET NOT NULL` in either path scans the table to prove no `NULL` exists, and that scan is the
expensive part. The first form's scan is over a column the engine knows is non-`NULL` by
construction, so it can use the column's own null bitmap and the scan is short. The second
form's scan is over a column that *was* nullable and may still hold `NULL`s from a partially
completed backfill, so it is a genuine full validation and it will fail if the backfill was
interrupted. That is the real operational lesson: the second form is more controllable, so
it is the one you want, but it introduces a window where the column is nullable and a
partial backfill is indistinguishable from a complete one unless you record the watermark
somewhere the constraint can see.

**S2. A migration drops a `NOT NULL` from a column "temporarily, we will put it back next
sprint". Review comment?** `STAFF`

Reject, and treat it as the schema decision it is. Two problems. First, the *next sprint* is
not a date — the column is now nullable in every environment, the ORM mapping still assumes
it is not, and the first query that forgets the null check throws an unboxing exception in
production rather than a constraint error at the database. Second, and worse, a

`DROP NOT NULL` is invisible: nothing fails, nothing warns, and the damage shows up months
later as a report that is subtly wrong. If the column genuinely must become nullable — and
sometimes it does, when a legacy import cannot supply the value — then the migration should
say so in a comment, the application change that handles `NULL` should ship *first*, and the
restore should carry a date and an owner. The generalisation: every schema change that
removes a protection is a change that should require the same evidence as adding one.
**D1. Your team ships schema changes as a SQL file applied by a job in the deploy pipeline. A
senior engineer proposes moving to a migration tool with a version table. Convince or
dissuade.** `STAFF`

Dissuade the migration tool and solve the actual problem, which is not the absence of a tool
— it is that the team has no record of what state the schema is in. A migration tool is one
answer, but three of four are cheaper and equally effective: a `schema_migrations` table with
an applied-at timestamp and a checksum, a CI step that runs the migrations against an empty
database and asserts they apply cleanly, and a lint rule that rejects `DROP TABLE`,
`RENAME COLUMN` and `ALTER COLUMN TYPE` without an expand/contract annotation. The
organisational point is the one to make: the reason the current setup is dangerous is that
`IF NOT EXISTS` was used to paper over not knowing, and a tool does not help if the discipline
does not follow. Buy the version table first, buy the tool second.

**D2. You are migrating a 4-billion-row table from `int` to `bigint` ids, with a live service
reading and writing. Give the plan, the reversibility story, and the point of no return.** `STAFF`
The plan is expand/contract, never `ALTER COLUMN TYPE`, which is a full rewrite under
`ACCESS EXCLUSIVE`. Add `new_id bigint` nullable — instant, metadata only. Backfill in
keyset-paginated committed batches of a few thousand rows with `FOR UPDATE SKIP LOCKED`,
adaptive on measured latency, resumable from a recorded high-water mark, and behind a kill
switch the loop checks every iteration. Dual-write from both application versions, with a
trigger only if you cannot change every writer. Switch reads one caller at a time. Then, and
only then, enforce `NOT NULL` via `CHECK … NOT VALID` plus `VALIDATE CONSTRAINT` in two more
phases, and finally drop the old column on a dated change. The point of no return is the
`DROP COLUMN`, and before it the honest test is a dependency query plus a grep of the
application and the warehouse for the old name. Reversibility is total until the drop and
partial after it, which is the argument for dating the contract step six weeks out and
instrumenting the old column's usage rather than trusting the plan.

### Types, Precision & Collation

**P1. Quarterly revenue is 0.4% below the payments provider's settlement report. Nothing
throws. Where do you look?** `SCENARIO`

At the `amount` columns on both sides, specifically at their declared types and scales. The
classic causes, in order of likelihood: a `NUMERIC(12,2)` on our side silently *rounding* a
sub-cent amount that the provider records to six places, with the difference accumulating
across a quarter; a `float`/`double precision` column accumulating representational error
across millions of rows; a `VARCHAR` amount being parsed and re-formatted with a locale
difference on one side; or a currency conversion applied on one side only. The diagnostic is
one query per side — group by day, find the first day where the two diverge, then compare that
day's raw rows. The root cause is almost always a domain chosen when the system only handled
whole pennies, and it is silent because `NUMERIC` rounds by design rather than erroring.
**T1. `SELECT 0.1::float + 0.2::float = 0.3::float;` returns false. Why, and what would you
use instead for a ledger?** `TRICKY`

Because `float` is IEEE 754 binary floating point: a sign, an exponent, and a significand of
binary digits. 0.1 has no terminating binary expansion — exactly as 1/3 has none in decimal —
so the hardware stores the nearest representable value, 0.10000000000000000555…, and 0.2
likewise. Adding them yields 0.30000000000000004, because each step is independently inexact
and the errors do not cancel. For a ledger you want exact decimal arithmetic, which is what
`NUMERIC` provides by storing a base-10 significand and a scale: `0.1::numeric + 0.2::numeric
= 0.3` is true, and 0.10 is the integer 10. For money specifically, integer minor units are
better still — fixed width, smallest, fastest to index, and no rounding path exists. The
deeper point: the error is not "small enough to accept", it is a value the type cannot hold,
and it accumulates without ever being roundable away.

**T2. You add a `UNIQUE` index on a case-sensitive `email` column and the team believes emails
are now unique. Predict what happens.** `TRICKY`

Three addresses differing only in case coexist, and nothing errors. A `UNIQUE` constraint is a
statement about the value as stored, which is a byte comparison under the column's collation,
and the default collation is case-sensitive in every common configuration. The team's sentence
"email is unique" is a claim about *identity*; the database implemented a claim about *bytes*;
neither is false and the gap is the bug. The correct fix is to normalise on write and enforce
it, not to make the comparison case-insensitive after the fact — a generated stored column
`email_norm text GENERATED ALWAYS AS (lower(trim(email))) STORED` with a `UNIQUE` index on it
means no writer, including an import or a `psql` session, can skip the normalisation.
**S1. A `price_cents bigint DEFAULT 0 NOT NULL` column holds shipping weights in grams, and a
downstream job computes freight cost from it. Review comment?** `STAFF`

Reject the default. The column's absence is meaningful — "not weighed" is not "weighs zero
grams" — and `DEFAULT 0` converts one into the other invisibly, because the schema is
`NOT NULL`, constrained and tidy. Every downstream `sum` under-reports, every `avg` is dragged
toward zero, and every `WHERE weight_grams > 0` silently excludes unknowns, with no error
anywhere. Make the column nullable so the aggregate functions skip it correctly and the
percentage of unweighed shipments becomes a number somebody can look at; if presence is
genuinely mandatory, add `CHECK (weight_grams IS NOT NULL)` instead, because a check refuses
the row while a default supplies a value to anyone who forgets.

**T3. You store a `CHAR(10)` product code and an application trims it before comparing.
`WHERE trimmed_code = 'ABC-123'` returns duplicate-looking rows from a join. Explain.** `TRICKY`
`CHAR(n)` is blank-padded on storage, so the stored value is ten bytes whether it holds seven
characters or ten, and under the ANSI pad-space comparison behaviour — the default in
PostgreSQL and in most MySQL collations — trailing spaces are ignored, so `'ABC-123   '` and
`'ABC-123'` compare equal in a sequential scan. The duplicates appear because the two sides of
the join went down different access paths: a btree index lookup compares the padded bytes
byte-for-byte, while a filter comparison applies the type's comparison operator with its
pad-space rule. The same logical predicate can therefore match or not match depending on
whether the planner chose an index, which is the genuinely nasty property. The fix is to stop
relying on the padding: make both columns the same type, add a `CHECK (col ~ '^[A-Z0-9-]{7}$')`
so the width is enforced rather than implied, and if a fixed width is genuinely part of the
standard then use it on both sides or on neither.

**S2. A PR adds `UNIQUE (sku)` to a 40-million-row products table, for "data hygiene". Review
comment?** `TRICKY`

Ask what problem it solves before accepting the cost, because this constraint is not free. It
creates a maintained btree on every insert and update of the table — one more structure in
the write path of the most-written table in the system — and adding it requires a full scan of
40 million rows to build, which means either a long `ACCESS EXCLUSIVE` window or a
`CREATE UNIQUE INDEX CONCURRENTLY` followed by attaching the constraint. More importantly,
adding a `UNIQUE` to a table with existing duplicates **fails**, and the migration then has to
wait on a data-quality remediation that nobody scoped. So the review question is not "is this
the right index" but "do you know there are no duplicates, and if not, who is deciding what
happens to the 300 rows it finds". If `sku` is genuinely a candidate key, the constraint is
correct and the migration is a three-phase job. If it is a hygiene aspiration, a periodic
audit query costs nothing and does not become a permanent write cost.

**D3. A multi-tenant system stores money in `numeric(18,4)`. The CFO asks why not `bigint`
cents, and a senior engineer asks why not `float`. Who is right, and how does the answer depend
on who else reads the column?** `STAFF`

The CFO is right on correctness grounds — `float` cannot represent 0.1 and the error
accumulates — but the interesting argument is between `numeric(18,4)` and integer minor units,
and it turns entirely on the second question. Integer cents are fixed 8 bytes, the fastest to
compare, the smallest to index, and structurally incapable of rounding, so they win on every
technical axis. They lose on the humans: a finance analyst running a query by hand has to know
the column is cents, and a codebase with one column named `amount` and another named
`amount_cents` is a real source of a 100x error. `numeric(18,4)` reads correctly to everyone,
survives being pasted into a spreadsheet, and is the right answer when the domain genuinely has
sub-cent precision — FX rates, per-kilogram pricing, tax computed fractionally. So: use
integer minor units when the answer to "who else queries this column outside the service layer?"
is "nobody but us, through one repository method", and use `numeric` when the answer includes a
finance team and a hand-written monthly report. Note also that `numeric(18,4)` is not free —
wide numerics use a variable-length encoding and are more expensive to compare and index — so
this is a real decision rather than a free one.

**D4. Your product is launching in three more countries. The `country` column is `char(2)`,
and a report is returning 4% too many rows. Walk through the diagnosis and the fix.** `STAFF`
The 4% is the leading half of every ISO code, which is exactly what a `CHAR(2)` join

mis-matches: `'GB'` is stored padded to `'GB '`, and pad-space comparison rules — the ANSI

default in PostgreSQL and most MySQL collations — treat the two as equal, so a join between a
`CHAR(2)` and a `VARCHAR(2)` that somebody has been trimming matches rows nobody expected. The
diagnosis is to run the join both ways with `length()` on each side and count the asymmetry;
the tell is that the inflated count is close to the count of two-letter country codes, because
each is being double-counted against a padded variant. The immediate fix is a

`CHECK (col ~ '^[A-Z]{2}$')` and a backfill with `rtrim`, plus a change to the join to `trim()`
or, better, to matching on types. The durable fix is to stop using `CHAR` where the standard
fixes the width exactly and the joining column does not: make both sides the same type, and
add a `CHECK` that enforces the width so the padding rule is never load-bearing. The
staff-level addition is that `CHAR(n)` is one of those conveniences whose cost is invisible
until a second team joins the table with a differently-typed column — which is a
schema-evolution decision, not a query decision.

### Constraints & Integrity

**P1. A one-off `DELETE FROM users WHERE email = 'test@example.com'` succeeded in 4.7 seconds.
Six weeks later a customer's entire order history is missing. Why?** `SCENARIO`

`orders.user_id` carries `ON DELETE CASCADE`, applied when the constraint was created for a
different child table — a `user_preferences` table where cascade was correct — and never
reconsidered when the same pattern was copied to `orders`. The delete took 41,000 order rows
with it. It was not reversible because a single statement is already atomic: it succeeded, so
there was nothing to roll back. The root cause is cascade chosen by habit rather than by a
decision about whether the child is a *component* of the parent, and the reason nobody noticed
is that a `CASCADE` over a bounded child set is indistinguishable from one over an unbounded
one until the day it is not. Prevention is a review rule — any `CASCADE` on a table whose
child set grows without bound is a flag — and a soft-delete pattern: `ON DELETE SET NULL` with
a nullable FK and a `deleted_at` on the parent.

**T1. A transaction inserts 500 child rows referencing the same parent, and a second
transaction wants to `UPDATE` that parent row. What happens, and what does the dashboard show?**
`ADVANCED`

The 500 inserts each take a `FOR KEY SHARE` lock on the parent row and hold it until commit.
`FOR KEY SHARE` is shared, so the 500 inserts are mutually compatible. But `FOR KEY SHARE`
conflicts with `FOR UPDATE`, so the second transaction blocks until all 500 commit. What the
dashboard shows is the *parent* table's row locks, and the parent row as the serialisation
point — the child table looks healthy, the insert latency looks fine, and the only symptom is
that one update is slow. If the parent is hot — one enterprise tenant with 400,000 orders —
that single row is the throughput ceiling for the entire child table, and the correct
mitigation is to shorten the parent transaction, not to optimise the inserts.

**S1. A PR adds `ON UPDATE CASCADE` to `users.email`, referenced by 14 tables. Review
comment?** `TRICKY`

Reject it. The child FKs are almost certainly not cascading, and the cascade will fire on every
table that references the email — a single user update potentially becoming a multi-table,
multi-thousand-row mass update holding locks on all of them, in a statement nobody planned. If
the email genuinely is the parent key, the right move is to stop using it as one: add a
surrogate `bigint` primary key, have the children reference that, and keep `UNIQUE (email)` as
an alternate-key claim that can change without consequence. The general rule worth stating:
`ON UPDATE` actions are a performance decision disguised as a data policy, and they only need
to be written once — for the natural key you will regret choosing.

**T2. You add `CHECK (status <> 'DELETED')` to a table, then insert a row with
`status = NULL`. Does the constraint fire? What about `CHECK (status NOT IN ('A','B'))`?** `TRICKY`
Neither fires. Both expressions evaluate to `UNKNOWN` for a `NULL` input, and a `CHECK`
constraint is satisfied unless the expression is definitively `FALSE` — so `UNKNOWN` passes.
This is not an engine quirk, it is the standard's rule, and it is the single most common way a
`CHECK` silently enforces nothing. For the first constraint, "the status is not DELETED" is
arguably satisfied by an unknown status, so the behaviour is defensible. For the second it is
almost certainly a bug: a `NOT IN` list is a closed set, and a `NULL` status is not a member
of it, so the row should have been rejected, and the constraint name says the set is
exhaustive. The fix is to make the null-ness explicit in the expression, or — better, because
it is the same answer every time — to make the column `NOT NULL` and add

`CHECK (status IS NULL OR status IN ('A','B'))` only if the null is genuinely permitted. The
habit worth building: when you write a `CHECK`, enumerate what it does with a `NULL` in each
referenced column, because `UNKNOWN` passing is a documented feature and a silent hole.
**S2. A PR adds `CHECK (start_date < end_date)` to a 200-million-row `bookings` table in a
single statement. Review comment?** `STAFF`

Reject in this form. The statement validates every existing row under `ACCESS EXCLUSIVE`, and
on 200 million rows that is a multi-minute table freeze whose symptom is an application
timeout rather than a database error. The three-phase form is required: `ADD CONSTRAINT …
CHECK (…) NOT VALID`, which is a catalogue operation and enforces the rule on all new writes
immediately; a remediation pass in batches, with the count scoped first, because fixing
violated date ranges is a business decision about which end is wrong; then `VALIDATE
CONSTRAINT`, which scans under `SHARE UPDATE EXCLUSIVE` so reads and writes continue. If the
team wants a one-statement version, the MySQL `ALGORITHM=INPLACE` path is the equivalent, and
even then the remediation question is unanswered. Also worth asking: does this table have a
`NOT VALID` convention already, or is this the first constraint to be added, because the first
one is where the operational pattern gets established.

**D5. A team wants to add a foreign key from `orders.customer_id` to `customers.id` but is
blocked on write latency. What are the real options, and what is the one you would
recommend?** `STAFF`

Four options, and the ordering matters. First, shorten the parent-side transaction: the FK
cost is a `FOR KEY SHARE` held until the *child* statement ends, and if the parent update path
holds its own lock across a network call, that is the dominant cost and it is fixable
independently of the constraint. Second, check whether the hot parent is a genuine hot spot —
one customer with 400,000 orders is a data-modelling issue, and sharding or partitioning by
that key removes the serialisation point without touching the schema. Third, keep the
constraint but drop the child index if the relationship is never used to join, accepting a
full scan on the referential actions in exchange for the write cost — a real trade and rarely
the right one. Fourth, and this is the one I would actually recommend: **keep the constraint
and fix the workload**, because the constraint is the only mechanism covering the writers you
have not written yet — the import job, the admin tool, the data migration — and the
"validation in the service" alternative costs the same lock in every case while protecting
only the paths you control. The organisational point is that the team is optimising the wrong

layer: they are looking at insert latency on the child table, and the cost is in the parent.

**D6. "Enforce everything in the database" versus "validate in the service" — you are asked to
arbitrate. What is the actual decision variable?** `STAFF`

How many things can write the table, and how long the rule will live. If one service in one
repository deploys together with the schema, application validation is genuinely fine and

cheaper: no lock, no migration, changeable by a deploy. If three services plus a nightly

import plus an admin console write it, the constraint is the only mechanism that scales with
the number of writers rather than the number of engineers who remembered, and the lock cost
is the price. The second variable nobody names is rule *stability*: a constraint is a migration
every time the rule moves, so a business rule that changes quarterly belongs in the
application, and a rule that has been true for four years belongs in the schema. The third is
the race: application validation runs *before* the write against a state the request did not
control, which is precisely how the inventory oversell happens with no exception thrown. So
the answer is neither "always in the database" nor "always in the service" — it is *per
constraint, decided by writer count and rule volatility, with the cross-row and

concurrency-dependent ones always in the database because nothing else can enforce them.*

### DML & Write Paths

**P1. A scheduled job was meant to delete 40 million old rows. It ran for three hours, filled
the disk to 100%, and the primary came back hours later. What went wrong?** `SCENARIO`
It ran as one un-batched `DELETE` in one transaction. That means forty million row locks held
simultaneously until commit, a single multi-gigabyte WAL burst that filled the disk, one
snapshot for the whole duration, and no progress to show for three hours. The application went
down because the disk filled — not because the delete was slow, but because the log and the
data could no longer be written, which is the part that surprises people. Recovery was PITR,
which is its own multi-hour operation. The fix is committed, keyset-paginated batches with
`FOR UPDATE SKIP LOCKED`, a batch size chosen so one batch's WAL stays in the low hundreds of
megabytes, a throttle, a kill switch, and — at 40 million rows — the honest answer, which is a
partition drop that is O(1) rather than O(n) and should have been designed into the table two
years earlier.

**T1. Two services both run `INSERT … ON CONFLICT (k) DO UPDATE SET n = n + 1` on the same
table, 500 times per second. With and without a `UNIQUE` on `k`, what happens?** `ADVANCED`
With the `UNIQUE`, the index entry is the serialisation point: the first inserter holds a
speculative insertion token on the key, the second blocks on it until the first commits or
rolls back, and then updates the committed row. The result is exactly 1000 increments and one
row. Without it, PostgreSQL will not even plan the statement — the conflict target must match a
unique index — so the mistake is caught at deploy. On MySQL, where `ON DUPLICATE KEY UPDATE`
has no target and fires on any unique violation, the no-index version is always a plain
insert, so you get 1000 rows each claiming `n = 1`, a counter wrong by a factor of 1000, and no
error anywhere. The mechanism is that the index is the only thing serialising the two writers;
the statement's own logic is not.

**T2. What does `DELETE FROM events WHERE created_at < $cutoff` do to a replica while it runs?**
`STAFF`

It generates the same volume of WAL as on the primary — a tuple deletion plus its index
entries, around 200 bytes per record — and the replica must apply all of it before it can apply
anything behind it. So a 40-million-row delete arrives as a single multi-hour transaction in
the replication stream, and every query that needs data *after* the events table in WAL order
waits for it. Reads of unrelated tables are fine under PostgreSQL's physical streaming
replication, but anything ordered behind it stalls, and the replica's lag graph shows one
enormous flat line rather than a gradual climb, which is the diagnostic signature. The batched
version turns that one wall into a sawtooth: short bursts of log, replication catching up
between batches, and a lag graph a human can reason about.

**S1. A PR contains `DELETE FROM audit_log WHERE created_at < now() - interval '1 year';`
against a 900M-row table. Review comment?** `STAFF`

Reject in this form and specify the alternative. A single un-batched delete on a table this size
is a multi-hour exclusive operation with an unbounded lock set, a disk-filling WAL burst, no
resume point and no throttle. Require: a keyset-paginated loop over the primary key with a
recorded high-water mark, committed batches of a few thousand rows, `FOR UPDATE SKIP LOCKED` so
it does not fight production traffic, a throttle, and a kill switch. Then ask the question the
PR is really about — is 900 million rows of audit log something you should be deleting from a
hot table at all, or should it be archived and then dropped in partitions, which is O(1)? At
this size the answer is partitioning, and the absence of partitioning on an append-only table
with retention is the design decision that made the delete scary.

**T3. `UPDATE t SET counter = counter + 1;` on a table where `counter` is `integer` and the
value is at 2,147,483,647, on PostgreSQL and on MySQL. Predict both.** `ADVANCED`
PostgreSQL raises `integer out of range` and the statement fails, so the value is unchanged
and the transaction is poisoned. MySQL's default behaviour depends on `sql_mode`: under
`STRICT_TRANS_TABLES` it raises as well, but in the permissive default of older

configurations it **wraps** to -2,147,483,648 — so the counter silently goes negative and
every subsequent value is wrong, permanently, with no error. This is the specific reason
`int` counters on append-only tables are a staff-level objection rather than a style note: the
boundary failure is engine- and configuration-dependent, and the two most likely engines
behave differently. The same asymmetry applies to `SUM(int_column)`, which PostgreSQL widens to
`bigint` and MySQL does not, so a report can be wrong on one and right on the other. The fix
is the same in both cases and costs four bytes per row: declare the column `bigint`, or better
as `numeric` if the quantity is a measurement rather than a count.

**S2. A PR changes `ON CONFLICT DO UPDATE SET hits = hits + 1` to
`ON CONFLICT DO UPDATE SET hits = excluded.hits + 1`. Review comment?** `STAFF`

This is a real bug and the review must say why. Inside `DO UPDATE`, the unqualified `hits` in
the `SET` clause refers to the **row already in the table**, while `excluded.hits` refers to
the row the statement proposed to insert. So the original is correct — increment the stored
value by one — and the change replaces it with "set the counter to whatever the proposed
insert said, plus one", which means every upsert **resets** the counter to 1. It is silent:
the statement succeeds, the value is plausible, and the counter is now permanently wrong with
a value that looks live on a dashboard. The reason it is a good interview question is that
both spellings read as obviously-correct English, which is exactly the class of bug code review
is for. The convention to add to the team's style guide is that any `DO UPDATE` clause
referencing an aggregated or incremental value qualifies the stored side explicitly, and that
`excluded` is only used when the intent really is "use the proposed value".

**D7. A nightly reconciliation job updates 30 million rows and takes 40 minutes, during which
the replica lags four hours. Design it.** `STAFF`

Batched and committed, with the batch size driven by the replica's lag rather than by a fixed
row count. Concretely: keyset-paginate on the primary key, take a few thousand rows per batch
with `FOR UPDATE SKIP LOCKED` so the job never blocks or is blocked by application traffic,
commit per batch, sleep between batches, and — this is the part that matters — make the loop
*lag-aware*: read the replica's current lag and increase the sleep or reduce the batch size when
it exceeds a threshold, resume at full speed when it drains. That converts a fixed 40 minutes
of wall-clock damage into a job that spreads its work across the window it actually has and
adapts to the system's state. The deeper question for the design review is why the
reconciliation is a mass `UPDATE` at all: if it recomputes a value, that value is a generated
column or a view; if it is a comparison between two systems, it is a read-and-report with a
small write, not a rewrite; and if it genuinely must touch 30 million rows, then the table
wants to be partitioned by the dimension being reconciled so each partition can be processed
and dropped independently.

**D8. Your idempotency layer writes a request key to `processed_request(request_key, result)`
with a `UNIQUE` constraint, and you get a duplicate-charge report anyway. What are the
plausible mechanisms?** `STAFF`

Four, in the order I would investigate them. First, the `UNIQUE` is on a nullable column and
some code path inserts `NULL` as the key — under SQL's uniqueness semantics multiple `NULL`s
are distinct, so every "idempotent" request with no key went in as a new row. Second, the
constraint is on the wrong column or was never created, so there is no serialisation point and
concurrent requests both insert. Third, the check and the insert are in different transactions
or on different connections — a `SELECT` then an `INSERT` with a gap is a race, and the
`UNIQUE` is the only thing that closes it, which is why an application-level check is not
idempotency. Fourth, the code catches the unique-violation error as the *success* path but
then re-reads the row before the winning transaction has committed, so it reads nothing and
falls through to a charge. The fix for all four is the same shape: the `UNIQUE` constraint, the
insert attempted *first*, and the violation treated as "someone else is processing this — do not
charge", with a bounded retry if you genuinely need the result. The staff-level addition is
that an idempotency key table has a retention problem, and a key deleted too early is the same
bug as a key never written.

### NULL & Three-Valued Logic

**P1. A support report returns zero rows. The query is `WHERE region NOT IN (SELECT region
FROM excluded_regions)` and `excluded_regions.region` is nullable. What is happening?** `SCENARIO`
`NOT IN` expands to `region <> 'EU' AND region <> 'US' AND region <> NULL`, and the third
comparison is `UNKNOWN` for every row, so `UNKNOWN AND TRUE AND TRUE` is `UNKNOWN`, and `WHERE`
keeps only `TRUE`. Every row is dropped, not just the ones in an excluded region, so the report
is empty rather than filtered. Nothing errors and the query is syntactically valid. The
provenance is the important part: nobody typed that `NULL` — the subquery selects a nullable
column, and the schema change that made it nullable was made in a different repository months
earlier, which is why this is a production incident rather than a code review finding. The fix
is `NOT EXISTS`, which asks an existence question with no third value, and the prevention is a
review rule against `NOT IN` with a subquery.

**T1. `SELECT count(*), count(middle_name) FROM customer;` returns 4,000,000 and 3,100,000.
What does the second number mean and what should you do with it?** `TRICKY`

It is the number of customers whose `middle_name` is not `NULL` — a data-quality metric, not a
business one. The gap of 900,000 is the number of customers with no middle name recorded, and
that number is invisible everywhere else: `count(*)` looks healthy, the column is `text` and
nullable so nothing complains, and the only place the gap appears is a query somebody had to
think to write. What to do with it depends on whether absence is meaningful for the domain: if
middle names are genuinely optional, the number is fine and the column's *nullability* is
correctly modelled. If the source system always has one and the absence is a migration
artefact, then 900,000 rows are missing data and the fix is upstream, not in SQL. The point to
make in an interview is that `count(*) - count(col)` is the cheapest data-quality metric
available and it should be on a dashboard for every nullable column whose absence would change
a number.

**T2. `SELECT avg(discount_pct) FROM orders;` is lower than finance expects, and the column is
`numeric(5,2) DEFAULT 0`. What happened?** `ADVANCED`

The `DEFAULT 0` on a column whose absence is meaningful. Every order created without an explicit
discount got the literal zero, and `avg` does not skip zeros — it averages them, dragging the
mean toward the floor by exactly the proportion of orders that had no discount recorded. The

arithmetic: if 30% of orders defaulted to 0 instead of being absent, the average is

approximately 0.7x what it should be. The diagnosis is a single query comparing `count(*)` with
`count(discount_pct)`, and if the counts are equal the `DEFAULT` is the story; if they are not,
some rows are genuinely `NULL` and the picture is a mix. The fix is to `ALTER COLUMN … DROP
DEFAULT` and set the genuinely-absent rows to `NULL` so the aggregate skips them, which requires
a table update of the affected rows and therefore a migration — and the prevention is the rule
that a column whose absence is meaningful never carries a default.

**S1. A service method builds `WHERE id NOT IN (:ids)` from a list that a left join on the Java
side has made contain `null`. Review comment?** `STAFF`

Reject, and explain the mechanism rather than just the rule. The list containing a `NULL` makes
the predicate globally unsatisfiable: `id NOT IN (1, 2, NULL)` expands to `id <> 1 AND id <> 2
AND id <> NULL`, the third term is `UNKNOWN` for every row, and `WHERE` keeps only `TRUE`, so
the method returns an empty set and returns it *silently*. This is worse than an error because
an empty result set is a valid-looking answer that downstream code handles as "no matches
found". The fix has two parts: filter nulls out of the list at the boundary where it is built,
so the `NULL` never reaches SQL, and — the durable part — use `NOT EXISTS` for the single-table
case or, in JPA, an explicit subquery rather than an `IN` list, because a list parameter is
where `NULL`s come from. The review comment is worth writing once as a team convention: **`IN`
lists are a boundary; `NOT EXISTS` is an expression, and only one of them is null-safe.**
**T3. `SELECT * FROM t ORDER BY score DESC LIMIT 10;` returns 12 rows in a test and 10 in
production. What is different?** `TRICKY`

Almost certainly ties at the boundary, and the engine broke them differently. There is no
defined ordering between rows whose sort key is equal — the engine is free to return any of
them — so with ten rows tied at the tenth position, which ten come back is arbitrary and can
change with the plan, the statistics, the physical order, or the collation. It is not a `NULL`
ordering issue unless the ties involve `NULL`s, in which case the default placement of `NULL`s
differs between engines as well. The test passed because the test data had no ties. The fix
is to add a tiebreaker to the ordering — `ORDER BY score DESC, id` — which makes the result
deterministic, and the general rule is that **any `LIMIT` used in application logic, in a
pagination contract, or in a test must have a total ordering**, because without one the same
query against the same data can legitimately return different rows. This is the same family of
bug as the missing `ORDER BY` that Volume 1 covers, and it is worth naming that the `LIMIT`
makes it visible: without a `LIMIT` nobody notices the missing ordering, because nobody was
depending on it.

**S2. A PR adds `WHERE status IS NOT NULL` to a query that already had `WHERE status = 'X'`.
The reviewer calls it redundant. Who is right?** `TRICKY`

The reviewer is right about the logic and wrong about the plan, and that distinction is the
whole answer. Logically, `IS NOT NULL` is implied by `= 'X'`, so it changes nothing about the
result set. For the planner it is not redundant at all: `status = 'X'` alone is usable by a
btree index only if `status` is declared `NOT NULL`, because a nullable indexed column stores
`NULL` entries and the planner will not assume `NULL` is excluded. An explicit

`IS NOT NULL` on a nullable indexed column is what lets the engine use a partial or a
full index for the equality rather than a sequential scan with a filter. So the correct
review comment is not "remove it" but "keep it, and add a comment saying it is there for the
planner" — and the better fix, which is a schema change rather than a query change, is to make
the column `NOT NULL` or to create the index as `CREATE UNIQUE INDEX … WHERE status IS NOT
NULL` so the property is expressed once rather than repeated in every query. The staff-level

point: "redundant to the semantics" and "redundant to the planner" are different questions, and

in a performance review only one of them is being asked.

**D9. Your analytics pipeline has been silently reporting zero for two days on a metric whose
`coalesce` was added during an incident. What is the correct policy for `coalesce` in a
pipeline?** `STAFF`

The policy is that `coalesce` belongs at exactly one place — the boundary where the domain has
agreed what absence means — and nowhere else. A blanket `coalesce(sum(x), 0)` in a pipeline is
a machine for converting three different states into one: a genuine zero, a partition with no
rows because nothing happened, and a failed upstream query that returned no data at all. Those
have different correct responses — ship the zero, ship nothing, page someone — and coalescing
them all to zero is why an outage is reported as a flat line of poor performance rather than as
a gap. The concrete policy: allow `coalesce` where the metric is a count or a sum over a
complete, known-complete partition and absence genuinely means zero; forbid it over a rate or a
ratio, where a zero denominator is not a zero result; and require that every pipeline stage
which can produce no rows emit an explicit *status* alongside the value — rows present, source
freshness timestamp, upstream error flag — so the coalesce is a presentation decision made by
the consumer rather than a decision the pipeline made on their behalf. That is the staff-level

answer: the bug is not the `coalesce`, it is that the pipeline had no way to say "I do not

know" any more.

### Views & Derived Data

**P1. A finance dashboard showed revenue that was six hours stale for three weeks, with no
error. What is the failure and what should have alerted?** `SCENARIO`

The dashboard reads a materialized view refreshed on a schedule, and the refresh job had been
failing since a schema change made one of its source columns nullable, so every refresh failed
and the view kept serving its last good contents. Nothing alerted because the refresh failure
was in a job log nobody was watching, and nothing in the query result distinguishes a fresh
answer from a six-hour-old one — the view does not know it is stale. The root cause is that
staleness was never treated as a design parameter: there was no stated maximum acceptable lag,
no refresh timestamp exposed to the consumer, and the alerting was on process liveness rather
than on data freshness. The fix is to expose the last successful refresh time in the payload
the dashboard actually receives, alert on refresh *age* rather than refresh *failure*, and
write the acceptable lag into the schema's README so the six-hour window is a decision rather
than an accident.

**T1. A `VIEW` on a single table with a `WHERE` clause is updated by an application
repository. Is the row guaranteed to satisfy the view's predicate afterwards?** `TRICKY`
No. The view is updatable in most engines, but updatability is about *routing* the write to
the base table, not about *constraining* it. The view's `WHERE` clause is used to find the rows
to update — it is appended to the statement's predicate — so a row selected through the view is
necessarily already in the result set, and the update cannot move it out. The hole is

elsewhere: a row that did *not* satisfy the predicate can be made to satisfy it, or another

writer can set the column the predicate tests, so the view and the table diverge through paths
that do not go through the view at all. `WITH CHECK OPTION` closes the write-through direction
by requiring every row written through the view to still satisfy the predicate. The convention
that makes the whole question moot is to treat views as read-only interfaces and grant write
privileges on the base tables directly.

**T2. A `REFRESH MATERIALIZED VIEW` fails halfway through. What state is the view in?** `TRICKY`
In PostgreSQL, the view keeps its **previous contents** — `REFRESH` without `CONCURRENTLY`
recomputes into a new structure and swaps only on success, under a brief `ACCESS EXCLUSIVE`
lock at the swap. So a failed refresh is a *good* failure in one sense: readers get stale data
rather than a partial one, and there is no half-computed state to reconcile. The consequences
are the ones that matter: the view is now stale by however long the refresh has been failing,
which may be weeks, and nothing about the view itself reports that. The tempting and correct
response is therefore not to "retry harder" but to make staleness observable — expose the last
refresh timestamp, alert on refresh age, and put a bound on how old the data is allowed to get
before the consumers are told. With `REFRESH … CONCURRENTLY`, the same holds plus it requires a
`UNIQUE` index on the view and costs double the disk and compute during the rebuild.
**S1. Someone proposes replacing an eight-table-join nightly aggregate with a materialized view,
refreshed every five minutes, on a source table at 200M rows. Review comment?** `STAFF`
The refresh cost, not the query cost, is the problem. At five-minute intervals, a full refresh
is 288 recomputes of an eight-table join over 200 million rows per day, each producing a
multi-gigabyte WAL stream that the replica must apply inside the same five-minute window. The
first version of this design fails on replication lag, not on query latency, and the team will
diagnose it as a "materialized view problem" when it is a source-design problem. Require one
of three before proceeding: a source partitioned by time with a per-partition or per-day
incremental refresh driven by a watermark; a refresh frequency matched to the actual staleness
requirement, which nobody has established yet; or a real reporting store, which is the honest
answer at 200M rows with an eight-way join. Also require that the maximum acceptable staleness
be written down before the view is built, because that number determines the design and is
currently a guess.

**D10. Denormalise into a real table, or materialize a view? Both make the report fast. How do
you choose, and what does the choice cost?** `STAFF`

They solve different problems and the choice is really about whether the derived data is still
*derivable*. A materialized view is correct precisely as long as its definition still matches
the source and the refresh works — the derived data is a cache of a pure function, and the
engineering cost is the refresh policy, the double disk, and the silent staleness. A real table
is correct only if you now own a synchronisation problem: something must keep it in step, and
that something is a trigger, a dual write in the application, an outbox and a consumer, or a
job — and each of those is a distinct mechanism with its own failure mode. So the choice is:
materialize while the derivation is a pure function of the source and the staleness bound is
acceptable; denormalise when the derived value needs to be *writable*, when it needs to be
enriched with data the source does not have, or when the refresh has repeatedly failed because
the definition is no longer cheap. The honest staff-level framing is that denormalising is not a
performance decision, it is a **consistency decision you are making by hand**, and the thing
to name in the review is the mechanism — trigger, dual write, or CDC — because "we'll keep it
up to date in the application" is how four write paths become five and the fifth is the one
that forgets.

**D11. A view with nine consumers has no owner. What is the process change, and what does it
have to do with how the problem arose?** `STAFF`

The process change is unglamorous: count the consumers, name an owner in the schema's README,
and restrict changes to additive ones — create `v2`, migrate consumers one at a time, drop `v1`
when the count reaches zero. The catalogue query that does the counting is a five-minute join
against the dependency view, and it is the step that matters most because it converts "I feel
like a lot of people use this" into a number. The reason it has to be done this way is

structural: the view did not become load-bearing through a decision, it accumulated, one

consumer at a time, each of which was individually reasonable and none of which triggered a
review — which is exactly why a change to it now cannot be a decision either, but has to be a
migration with a deprecation window. The thing to generalise from it is that **any interface
without an owner and without a versioning policy will become unchangeable, and the interface
in question here is not the view, it is the table underneath it** — the same discipline of
counting consumers and making changes additive applies to a column rename, a type change and a
constraint, which is the through-line from Chapter 1. Run the consumer count quarterly, because
the ninth consumer arrived without anybody noticing the first eight.

### Scale Boundaries & Where the Cost Moves

**T4. At what table size does your advice in this volume change?** `STAFF`

Every recommendation in this volume has a scale boundary and it is worth naming them rather
than asserting them. The `ALTER TABLE` rewrite advice stops mattering below about a hundred
thousand rows, where a full rewrite is a second and the whole conversation is premature. The
`NOT VALID` / `VALIDATE` split for constraints starts mattering above roughly ten million
rows, where a validation scan under `ACCESS EXCLUSIVE` is a multi-minute table freeze. The
batched-delete guidance starts mattering above about a million rows and becomes mandatory by
ten million, where an un-batched delete's WAL burst is measured in gigabytes. The
`DEFAULT 0`-on-a-meaningful-column problem has no scale boundary at all — it is wrong on a
table with four rows, and it is wrong on a table with four hundred million, which is why it is
the one item on the list that should never be scaled away. The `UNIQUE`-on-a-nullable-column
issue is likewise scale-free: it is a correctness property of the constraint, not a
performance one. The honest framing for an interview is that **the performance advice in this
volume is scale-dependent and the integrity advice is not**, and that the second category is
the one that causes the incidents that take a team a day rather than a quarter.

**S3. A PR adds a second `UNIQUE` constraint to a high-write table "for the new integration".
What is the first thing you ask?** `STAFF`

Whether the key is a genuine candidate key or just an integration detail, because the two have
completely different costs. A candidate key is a claim about identity that the domain already
makes, and adding the constraint is usually correct. An integration detail — a partner's
external reference, a webhook delivery id — is a `UNIQUE` that buys a lookup guarantee and
costs a maintained btree on every write forever, plus a full index build on a large table, plus
a migration that fails if there are existing duplicates. The specific things to ask: is the
column nullable, because a `UNIQUE` on a nullable column permits unlimited `NULL`s and the
constraint may not be doing what its name says; is the pair genuinely unique today, which is a
five-minute group-by before the migration rather than a discovery during it; and is the
leading column of a composite key the one the queries filter on, because the leftmost-prefix
rule means the column order is a decision about which queries the constraint can accelerate
and a pair ordered the other way enforces a materially different fact. If the answer to the
first question is "it is a partner's id and they are supposed to be unique but we've never
checked", the right answer is a periodic audit query, not a permanent write cost.
**D12. Everything in this volume has a scale ceiling. Design the operating model that
degrades gracefully as each ceiling is hit, rather than a series of one-off fixes.** `STAFF`
The pattern is the same in all four cases, and naming it is the point: **each technique in this
volume converts an unbounded problem into a bounded one by moving work off the critical path,
and each one eventually reaches a ceiling where the moved work becomes its own unbounded
problem.** The DDL advice moves the work from a 40-million-row lock to a backfill loop that
runs for three days — so the next ceiling is a job that needs a resume point, a throttle and a
kill switch, which is the same answer as the batched delete. The batched delete moves the work
from one transaction to 8,000 of them, and the next ceiling is total volume, where the answer
is a partition drop because O(1) beats O(n) no matter how well O(n) is tuned. The upsert moves
the work from the application to a serialisation point in a unique index, and the next ceiling
is a hot key, where 500 upserts per second on one row is a lock queue and the answer is
sharding the counter or accepting eventual consistency on that metric. The materialized view
moves the work from query time to refresh time, and the next ceiling is refresh volume, where
the answer is incremental refresh with a watermark, which then needs the watermark itself to be
correct. So the operating model is not four fixes, it is one practice applied four times:
**identify the unbounded work, bound it explicitly, make the bound observable, and give the
bound an escape hatch.** Applied to the meta-question — what happens when the escape hatch is
needed at 3am — it means every one of these loops needs a kill switch, every one of these
refreshing things needs a last-success timestamp, and every one of these backfills needs a
watermark. A team that has that discipline can cross each ceiling deliberately; a team that
does not crosses all of them at once, during an incident, in the same week.
