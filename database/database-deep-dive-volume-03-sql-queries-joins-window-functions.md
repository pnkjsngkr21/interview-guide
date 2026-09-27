---
title: "The Database Complete Deep-Dive"
volume: 3
series: "SQL — QUERIES, JOINS, CTES & WINDOW FUNCTIONS"
subtitle: "Study & Interview Mastery Guide"
---

# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is an eleven-volume study guide to databases, written for engineers who already know
how to build a backend service and are preparing for senior and staff-level interviews. It is
not a tutorial. Nothing here explains what a `SELECT` statement is.

The organising question of every chapter is the same one a staff engineer gets asked in a
real design review: **not "what does this do", but "why would a team choose this, what does
it cost, when does it break, and how expensive is it to undo?"** SQL is treated as the
visible surface of a much larger machine — a bag algebra evaluated in a specific order,
a join operator with three physical implementations, a recursive fixed-point loop, a window
frame with a default nobody chose — and the notes always go down to that machinery, because
that is the layer where production incidents actually live. A `LEFT JOIN` that silently
becomes an inner join does not throw. It returns a plausible number.

Volume 3 is the language volume. Volumes 1 and 2 built the model and the schema; this one is
about the *only* part of SQL that most engineers never fully internalise, which is that
SQL is not a procedural language and does not evaluate in the order you type it. Every
non-trivial bug in this volume is a consequence of that one fact: an alias used a clause too
early, a window function filtered a level too late, an outer join nullified two clauses
later, a `NOT IN` met a `NULL`. The chapter on evaluation order is therefore not a warm-up
— it is the load-bearing wall the other eight chapters lean on.

The staff-level theme running through the volume is **the gap between the result you asked
for and the result the algebra produced**. Row multiplication from a join, an extra `(null)`
grouping bucket, a running total that silently includes its tie group, a `UNION` that
deduplicated rows you meant to keep twice — none of these produce an error. They produce a
dashboard, and the dashboard is wrong, and the wrongness is discovered by a customer or an
auditor. Being able to *predict the exact row set* from a query you have not run is the
single most under-rated SQL skill, and it is the skill this volume is built to install.

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

This volume is the one where the worked example *is* the argument. Nearly every claim about
row counts — join fan-out, tie behaviour in `RANK`, the default `RANGE` frame, the
`(null)` bucket, `NOT IN` returning nothing — is only credible if you can see the five rows
it happened to. So the volume runs on one small seed dataset, declared in full in
Chapter 1, and every `T`-weighted question in the bank is answerable by counting rows in
that dataset by hand. The rest of the set argues from first principles; this one argues from
row sets, because a wrong answer with confident reasoning is the failure mode that actually
reaches production.

Each chapter ends with `Common Mistakes`, a set of `Interview Questions`, a summary
callout, and `Further Reading` for anyone who wants to go past the chapter.

Volumes end with an `Interview Scenario Bank` — production situations, code-behaviour
predictions, code-review questions, and design trade-off challenges. There is no target
number for these. They stop when the next question would repeat one already asked.

### Continuing From Volume 2

Volume 2 covered how you *create* things. This volume is what you do once they exist, and
almost every bug in it is a query that is syntactically fine and semantically not what the
author believed.

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 (this book) | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL — InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 3

- Chapter 1 — SELECT Execution Order & the Logical Pipeline
- Chapter 2 — Joins, Inners and the Semantics That Bite
- Chapter 3 — Self Joins, Implicit Joins & Anti-Joins
- Chapter 4 — Subqueries: Scalar, Correlated, IN & EXISTS
- Chapter 5 — CTEs & Recursive Queries
- Chapter 6 — Window Functions
- Chapter 7 — Set Operations & Grouping
- Chapter 8 — Grouping, Aggregation & HAVING
- Chapter 9 — Interview Scenario Bank

---

# Part 1 — SQL — Queries, Joins, CTEs & Window Functions

## Chapter 1 — SELECT Execution Order & the Logical Pipeline

### 1.1 A Small Schema to Reason About

Before anything else, a dataset. Every example in this volume runs against it, every `T`
question in the bank can be answered by counting rows in it, and every arithmetic claim
will be checkable. Five tables is enough to produce every trap in the chapter outline and
small enough to hold in your head.

```sql
CREATE TABLE customers (
  id         INTEGER PRIMARY KEY,
  name       VARCHAR(50) NOT NULL,
  country    VARCHAR(2),              -- deliberately nullable, see Chapter 8
  signed_up  DATE NOT NULL
);
CREATE TABLE orders (
  id           INTEGER PRIMARY KEY,
  customer_id  INTEGER NOT NULL REFERENCES customers(id),
  placed_at    DATE    NOT NULL,
  status       VARCHAR(10) NOT NULL,  -- PENDING | SHIPPED | CANCELLED
  total_amount NUMERIC(10,2)          -- NULL until the order is totalled
);
CREATE TABLE order_items (
  id       INTEGER PRIMARY KEY,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  sku      VARCHAR(20) NOT NULL,
  qty      INTEGER NOT NULL,
  price    NUMERIC(10,2) NOT NULL
);
CREATE TABLE products (
  sku        VARCHAR(20) PRIMARY KEY,
  name       VARCHAR(50) NOT NULL,
  category   VARCHAR(20) NOT NULL,
  unit_price NUMERIC(10,2) NOT NULL
);
```

The contents, which you should be able to recite by the end of this chapter:

```text
customers                            orders
id  name   country signed_up         id   cust placed_at  status     total
──  ─────  ─────── ──────────        ───  ──── ─────────  ─────────  ─────
 1  Ada    GB      2024-01-15        101    1   2024-06-01  SHIPPED     31.00
 2  Bruno  DE      2024-03-02        102    1   2024-06-14  SHIPPED     12.50
 3  Chidi  NG      2024-05-20        103    2   2024-06-02  CANCELLED  220.00
 4  Dara   GB      2024-07-11        104    3   2024-06-03  SHIPPED     37.50
 5  Elin   NULL    2024-08-30        105    4   2024-06-20  PENDING     12.00
                                   106    4   2024-07-01  SHIPPED     70.00
order_items                          107    2   2024-07-04  SHIPPED     50.00
id   ord  sku     qty  price         108    3   2024-07-09  PENDING      NULL
───  ───  ──────  ───  ──────        109    1   2024-06-14  PENDING      7.50
1001 101  BOOK      2   12.50
1002 101  PEN       5    1.20      products
1003 102  BOOK      1   12.50      sku      name                category     price
1004 103  DESK      1  220.00      ──────  ──────────────────  ──────────  ─────
1005 104  BOOK      3   12.50      BOOK     Hardback Novel      BOOKS         12.50
1006 105  PEN      10    1.20      NOVEL2   Paperback Novel      BOOKS         12.50
1007 106  BOOK      2   12.50      ANTH     Story Anthology     BOOKS          9.00
1008 106  LAMP      1   45.00      DESK     Standing Desk       FURNITURE   220.00
1009 107  BOOK      4   12.50      CHAIR    Task Chair          FURNITURE   220.00
1010 109  CABLE     2    3.75      LAMP     Desk Lamp           FURNITURE    45.00
                                   PEN      Gel Pen             STATIONERY    1.20
                                   CABLE    USB-C Cable         ELECTRONICS   3.75
```

Four properties of this data are load-bearing for the rest of the volume, so note them now:

- **Customer 5 (Elin) has no orders at all.** She is the anti-join of Chapter 3.
- **Order 108 has no line items and a `NULL` total.** It is the "left row that survived"
  of Chapter 2 and the empty-aggregate case of Chapter 8.
- **Orders 102 and 109 both belong to customer 1 and share `placed_at` 2024-06-14.** This
  single tie is what makes the `RANGE`-versus-`ROWS` frame difference in Chapter 6 visible
  rather than theoretical.
- **Two products in each of `BOOKS` and `FURNITURE` share a price.** So `RANK` and
  `DENSE_RANK` have something to disagree about.
Two totals you will need later, computed once here so no example has to re-derive them:

```text
  SUM(total_amount) over all 9 orders                = 440.50
  SUM over SHIPPED orders (101,102,104,106,107)       = 201.00
  SUM over CANCELLED (103)                            = 220.00
  SUM over PENDING  (105, 108=NULL, 109)              =  19.50
  SUM over June  (101,102,103,104,105)                = 313.00
  SUM over July  (106,107,108=NULL,109)               = 127.50
  COUNT(order_items)                                 =  10
  COUNT(DISTINCT sku in order_items)                  =   5  (BOOK PEN DESK LAMP CABLE)
```

> **MUST REMEMBER**
>
> SQL questions are row-set questions, and you cannot reason about a row set you have not
> written down. When you review a query, do not ask "is this correct" — ask "how many rows
> does this produce, and can I enumerate them". A candidate who can enumerate the rows of a
> five-table join from memory is demonstrating something no `EXPLAIN` output can.

### 1.2 The Eight Clauses and the Logical Pipeline

The single most consequential fact about SQL is that it is *declarative*: you name a result,
and the engine chooses a route. A consequence people miss is that the clauses are not
evaluated in the order you type them, and the order they are evaluated in is fixed by the
standard, not by your text.

```text
  what you type                      what the engine builds
  ─────────────                      ─────────────────────
  SELECT  a, b, c                    ┌─────────────────────────────────────┐
  FROM    t1 JOIN t2 ON ...          │ 7. LIMIT / FETCH FIRST n ROWS       │
  WHERE   ...                     ┐  ├─────────────────────────────────────┤
  GROUP BY a                    │  │ 6. ORDER BY ...                     │
  HAVING  count(*) > 1          │  │  ├─────────────────────────────────────┤
  SELECT  a, sum(b)              │  │ 5. SELECT list (expressions,        │
  FROM    t1 JOIN t2 ON ...      │  │    aliases minted here)             │
  WHERE   ...                    │  │  ├─────────────────────────────────────┤
  GROUP BY a                    ▼  │ 4. HAVING (filters whole groups)    │
  HAVING  count(*) > 1              │  ├─────────────────────────────────────┤
  ORDER BY 2                   │  │ 3. GROUP BY (collapse to groups)    │
  LIMIT    10                   │  ▼  ├─────────────────────────────────────┤
                                 │ 2. WHERE (filters individual rows)   │
                                 ▼  ├─────────────────────────────────────┤
                                   │ 1. FROM (produces the bag, incl.     │
                                   │     joins, subqueries, set ops)      │
                                   └─────────────────────────────────────┘
```

`DISTINCT` sits between the `SELECT` list and `ORDER BY` in the standard's ordering, which
is why `SELECT DISTINCT` forces a global uniqueness requirement on the entire output row
*before* anything is ordered.

Three consequences fall straight out of the picture, and they are the backbone of the next
eight chapters.

1. **`WHERE` sees rows, `HAVING` sees groups.** A predicate in `WHERE` is applied before
   grouping, so it cannot reference an aggregate — there is no group yet. A predicate in
   `HAVING` is applied after grouping, so it *can* reference an aggregate and an aliased
   expression, and cannot reference a column that was neither grouped nor aggregated.
2. **Aliases do not exist until step 5.** Anything named in steps 1–4 must be a real column
   or a fully re-derivable expression. This is not a parser quirk; it is a direct
   consequence of the pipeline, and the `SELECT`-alias-in-`WHERE` error is the engine
   telling you so.
3. **Anything that needs to see the final rows goes late.** `ORDER BY` and `LIMIT` are steps
   6 and 7, which is the *only* reason a window function can be filtered at all — you
   cannot do it in `WHERE` (step 2) or `HAVING` (step 4), so you wrap the query and filter
   the outer result.
> **INTERVIEW TRAP — "WHY CAN'T I USE A `SELECT` ALIAS IN `WHERE`?"**
>
> The common answer is "because SQL is not a programming language" or "it's a syntax rule".
> Both are true and neither explains anything. The real reason is the pipeline: at the
> moment `WHERE` runs, the engine has produced a bag of rows from `FROM` and is about to
> filter them. **The alias you want does not exist yet** — aliases are minted at step 5,
> three steps later, and naming them earlier would mean inventing a name for a value the
> engine has not computed.
>
> ```sql
> SELECT qty * price AS line_total
> FROM   order_items
> WHERE  line_total > 40;      -- ERROR: column "line_total" does not exist
> ```
>
> Three correct rewrites, in increasing order of usefulness:
>
> ```sql
> -- 1. repeat the expression (always correct, worst to maintain)
> SELECT qty * price AS line_total
> FROM   order_items
> WHERE  qty * price > 40;
>
> -- 2. wrap the query — the subquery computes the alias in its own SELECT (step 5)
> --    and the outer WHERE filters the finished rows
> SELECT *
> FROM (
>   SELECT qty * price AS line_total
>   FROM   order_items
> ) t
> WHERE line_total > 40;
>
> -- 3. a CTE, which is the same thing with a name and a scope
> WITH lines AS (
>   SELECT id, order_id, sku, qty * price AS line_total
>   FROM   order_items
> )
> SELECT * FROM lines WHERE line_total > 40;
> ```
>
> The counter-intuitive part, and the part worth saying out loud in an interview: **the
> same alias is perfectly legal in `ORDER BY`**, because `ORDER BY` is step 6 and by then
> the alias exists. The asymmetry is not a wart in the language; it is the language telling
> you the truth about when each value comes into being. It is also legal in `GROUP BY` and
> `HAVING` in PostgreSQL and MySQL — both are extensions that the pipeline does not strictly
> justify, and both are portable enough in practice that nobody argues about them.
>
> The follow-up that separates a senior from a mid-level: **"when would you actually want
> the alias there?"** The answer is a computed measure that `WHERE` would otherwise have to
> repeat — a margin, a normalised amount, a date truncation. The right answer at that point
> is usually a generated column or an expression index (Volume 4), not a subquery, because
> the subquery is a fence that blocks the optimiser from using the base table's indexes for
> the outer predicate.

### 1.3 Logical Order Is Not Physical Order

The pipeline above is the *logical* order, and it is worth being pedantic about the word
"logical", because conflating it with the physical order produces a whole genre of wrong
explanation.

```text
  LOGICAL order (the standard's)         PHYSICAL order (the plan)
  ────────────────────────────            ───────────────────────
  fixed, normative, testable              chosen by the optimiser from
  the same on every engine                millions of legal reorderings
  you may reason about it                 you must EXPLAIN it
  explains why an alias is illegal        explains why a fast query is slow
  explains where a filter can see rows    explains nothing about correctness
```

The optimiser is *permitted* to push a `WHERE` predicate down into a join, to reorder
joins arbitrarily, to turn an outer join into a semi-join, to replace a correlated subquery
with a join, to materialise a view instead of inlining it. All of that is invisible at the
SQL level and irrelevant to the result — **as long as the SQL is semantically what you
thought.**

The reason this volume exists is that the two orders can only diverge when the SQL is
ambiguous or the optimiser is buggy. A query whose result is well-defined produces the same
rows under every legal plan. A query whose *intent* was not well-defined — a `LEFT JOIN` with
a `WHERE` predicate on the right table, a `NOT IN` over a nullable column, an aggregate
after a fan-out join — produces rows the optimiser is entirely within its rights to produce
and that nobody wanted.

> **PRODUCTION RELEVANCE**
>
> The practical consequence is how you read a slow query report. "The optimiser reordered my
> joins" is not a cause, it is a description of the plan. The cause is always a
> mis-estimate: the optimiser believed a join would produce 40 rows and it produced 4
> million, so the hash join it chose had to spill to disk, so the query got slower. The
> plan is the symptom of a wrong belief about the data. Volume 4 is entirely about reading
> the gap between the estimate and the reality; this chapter is about the class of bugs where
> the estimate is irrelevant because the query was never asking for what you thought.

### 1.4 The Level Rule: Why You Cannot Filter a Window Function in `WHERE`

This is the single most common error in the window-function chapter, and it deserves its
own section because the error message is unhelpful and the *workaround* is what people
memorise without the reason.

```sql
-- What everybody writes first. This is an error.
SELECT order_id, sku, qty,
       ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY qty * price DESC) AS rn
FROM   order_items
WHERE  rn = 1;
-- ERROR: column "rn" does not exist
-- What actually works: filter one level out, after the window has been computed.
SELECT * FROM (
  SELECT order_id, sku, qty,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY qty * price DESC) AS rn
  FROM   order_items
) ranked
WHERE rn = 1;
```

The reason is the pipeline again, and this time the numbers make it unavoidable. `WHERE`
is step 2. A window function is not a scalar function over one row — it is a function over
a *partition of rows*, and computing it requires the whole partition to exist. At step 2
the engine has rows but not partitions; it cannot evaluate `ROW_NUMBER()` over an incomplete
partition any more than you can compute a total without seeing every line.

```text
  step 1  FROM order_items          → 10 rows, no partition exists yet
  step 2  WHERE rn = 1              →  ERROR: rn does not exist; a window over
                                      10 rows is not computable row-by-row
  ──────────── you need to cross this line ────────────
  step 5  SELECT ... ROW_NUMBER() OVER (PARTITION BY order_id ...)  → rn is minted
  step 6+ the outer query's WHERE sees it                          → filters
```

`HAVING` does not help either, for a different reason: `HAVING` is step 4, still before the
`SELECT` list, so it cannot see `rn` either. This surprises people who expect `HAVING` to
be the "aggregate place" and assume window functions are aggregates. They are not in that
sense — a window function is a *post-aggregation* construct that has its own place in the
`SELECT` list, and its results are only filterable from a level above.

The rewrite is not a hack; it is the honest expression of what the query means. "Of the
lines in each order, give me the one with the highest value" is genuinely a two-stage
question — first compute the ranking, then select — and the subquery is how you say it.
The `MATERIALIZED` hint and the `WITH` form in Chapter 5 are the same idea with better
ergonomics.

> **MUST REMEMBER**
>
> The level rule generalises far past window functions. You cannot filter on anything that
> has not been computed yet, and you cannot compute anything that needs a group before the
> group exists. `WHERE` sees rows. `HAVING` sees groups. The `SELECT` list sees neither — it
> is where new names are created. `ORDER BY` sees everything. Most "SQL is weird" complaints
> dissolve once you can say which step of the pipeline the offending expression is asking to
> run at.

### 1.5 `ORDER BY`, `LIMIT` and the Pagination That Lies

`ORDER BY` and `LIMIT` are the last two steps, which is why they can see everything:
window functions, aliases, aggregate output, and in most engines a column from an
`OUTER`-joined table that the outer row manufactured as `NULL`.

That last permission is worth stating, because it is a common surprise and a common source
of a non-deterministic answer.

```sql
-- Legal: ORDER BY runs after the join, so it can reference the nullable side.
SELECT c.name, o.id, o.status
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.id
ORDER  BY o.placed_at DESC NULLS LAST
LIMIT  3;
```

`NULLS LAST` is not cosmetic here. Without it, `DESC` puts `NULL`s *first* on PostgreSQL
and Oracle (the `NULL` is treated as larger than everything), so the top three rows are
Elin — the customer with no orders at all — plus the two most recent orders. With
`NULLS LAST`, the top three are the three most recent orders. The query is legal either way
and the two versions are answering different questions.

`LIMIT` without a total `ORDER BY` is the other lie, and it is the root of a family of
production bugs that are notoriously hard to reproduce.

```text
  WRONG                                   RIGHT (usually)
  ──────                                  ───────────────
  SELECT * FROM orders                    SELECT * FROM orders
  LIMIT 10;                               ORDER BY placed_at, id
                                          LIMIT 10;
```

Without `ORDER BY`, the ten rows returned are the ten rows the executor happened to reach
first — which depends on the access path, the physical row order, the statistics, the
vacuum state, and the plan chosen that day. A primary-key order and a freshly-vacuumed
table will *often* return the same ten rows, which is why the bug survives review, and
then returns different rows after a bulk load on a Sunday night. When paginating, the tie
breaker is not optional: if `placed_at` is not unique, `LIMIT` can split a tie group
across page 1 and page 2, and the reader sees one row twice and another not at all.

> **INTERVIEW TRAP — "WHY IS `LIMIT 10` ALLOWED WITHOUT AN `ORDER BY`?"**
>
> Because SQL has no ordering except the one you ask for, and "any ten rows" is a
> well-formed question even if an unusual one. The standard is not promising the *same* ten
> rows twice — it never promised you an order at all, so there is no order to be stable
> across. PostgreSQL is more helpful than it has to be here: it will produce a `Gather` node
> that happens to stream in physical order and will use an index if one helps, which is
> exactly what makes the bug survive, because the output *looks* deterministic. The honest
> framing for a code review is that an unordered `LIMIT` is a coin flip dressed as a
> paginated API, and the cost of adding `ORDER BY` is measured in sort time while the cost
> of not adding it is a support ticket you cannot reproduce.

### 1.6 `DISTINCT`: A Requirement on the Whole Row

`DISTINCT` is a global uniqueness requirement on the **entire output row**, applied after
the `SELECT` list and before `ORDER BY`. Two consequences that catch people:

```sql
-- Dedupes on (sku, category) — NOT on sku alone.
SELECT DISTINCT sku, category FROM products;              -- 7 rows
-- 7 rows in, 5 rows out: DESK and CHAIR both at 220.00 collapse to one FURNITURE row.
SELECT DISTINCT category, unit_price FROM products;
```

The second query is a common report request — "how many price points does each category
have?" — and the surprise is that the answer is the number of distinct *category/price
pairs*, not the number of prices. Reading it as a count requires knowing `DISTINCT` is over
the whole row, which is why the honest version of that report is `GROUP BY category` with
`COUNT(DISTINCT unit_price)`. The same whole-row rule means a column added to a table by
another team's migration can make `SELECT DISTINCT *` return *more* rows than last month,
which makes `SELECT *` a correctness dependency rather than a style preference.

#### Common Mistakes

- Believing clauses run in the order they are typed, and then being unable to explain why
  `DISTINCT` is illegal in `WHERE` or why `HAVING` can see an aggregate but `WHERE` cannot
- Writing `WHERE rownum = 1` or a window-function alias in `WHERE` and reaching for a
  subquery without being able to say *which step* of the pipeline required it
- Using a `SELECT` alias in `WHERE` and then, in the same answer, claiming aliases are not
  evaluated until the `SELECT` — without noticing that this is the reason `ORDER BY` accepts
  them
- `LIMIT` without `ORDER BY`, or `ORDER BY` on a non-unique column without a tie-breaker,
  and then calling the resulting pagination "stable"
- `SELECT DISTINCT` used as a substitute for `GROUP BY`, which silently changes the
  semantics from "one row per group" to "one row per distinct output row"
- `ORDER BY o.column DESC` on an outer-joined nullable column without `NULLS FIRST` /
  `NULLS LAST`, so the top of the report is made entirely of rows that matched nothing
- `SELECT *` in application code, and treating a migration adding a column as a
  non-event

#### Interview Questions — Evaluation Order

**Q1. State the logical evaluation order of a `SELECT` statement.** `STAFF`

`FROM` (including joins, subqueries and set operations, which are all part of producing the
source relation) → `WHERE` → `GROUP BY` → `HAVING` → `SELECT` list (where aliases are minted
and `DISTINCT` is applied) → `ORDER BY` → `LIMIT`/`OFFSET`/`FETCH`. The ordering is normative
and identical across engines, while the *physical* order the optimiser chooses may reorder
any of it as long as the result is unchanged. The distinction matters because almost every
"SQL is strange" behaviour is explained by it: `WHERE` cannot see a `SELECT` alias because
the alias is minted at step 5; `HAVING` can see an aggregate because grouping already
happened at step 3; a window function cannot be filtered in `WHERE` because its partition
does not exist until the `SELECT` list is evaluated.

**Q2. Why is `ORDER BY` allowed to reference a `SELECT` alias when `WHERE` is not?** `TRICKY`
Because of *when* each clause runs. `ORDER BY` is step 6, after the `SELECT` list has been
evaluated and output names have been assigned, so the alias refers to a value that already
exists. `WHERE` is step 2, before the `SELECT` list has been evaluated, so an alias there
would be a name for a value the engine has not computed. It is not a stylistic restriction;
it is the pipeline's typing rule. The same rule explains the asymmetries around

`DISTINCT` (illegal in `WHERE` because the output row does not exist yet) and

`GROUP BY` (legal in PostgreSQL and MySQL as an extension, strict SQL requires repeating
the expression). A useful corollary in an interview: the reason the workaround is a
subquery is that a subquery *is* a pipeline — the inner `SELECT` runs steps 1–5 and the
outer `WHERE` then filters its finished output.

**Q3. A query returns 12,000 rows instead of the expected 1,200. The SQL is
"obviously correct". Where do you start?** `ADVANCED`

At the grain, before the text. Twelve thousand versus twelve hundred is a factor of ten,
which is almost always fan-out from a join to a lower-granularity table, an aggregate
computed over a multiplied measure, or a `LEFT JOIN` that should have been filtered. The
first thing to do is run the query with an explicit `COUNT(*)` and a `GROUP BY` on the
suspected key and look at the distribution of group sizes — if most groups have one row and
a few have hundreds, it is fan-out. The second thing is to check whether any predicate that
belongs in `ON` was written in `WHERE`, which silently converts an outer join to an inner
one and changes the count in the *other* direction. The third is to check for an aggregate
over a nullable column where `SUM` returned `NULL` for some groups and you expected `0`.
None of these are visible in the `SELECT` list, which is why "obviously correct" and
"wrong by 10×" coexist so comfortably.

**Q4. Why is a window function's result not filterable in `WHERE`, and what is the correct
form?** `TRICKY`

Because a window function is evaluated over a *partition* of rows, and at `WHERE` time the
rows exist but the partitions do not — a partition is defined by the `OVER` clause, which is
evaluated as part of the `SELECT` list, three steps later. `HAVING` does not help either:
it is step 4, before the `SELECT` list, so it cannot see the alias either. The correct form
is to evaluate the window in an inner query and filter the finished rows in an outer query,
either as a subquery in `FROM` or as a CTE:

```sql
WITH ranked AS (
  SELECT order_id, sku, qty,
         ROW_NUMBER() OVER (PARTITION BY order_id ORDER BY qty * price DESC) AS rn
  FROM   order_items
)
SELECT order_id, sku, qty FROM ranked WHERE rn = 1;
```

The rewrite is not a workaround — "of the lines in each order, keep the largest" really is a
two-stage question, and the subquery is how SQL expresses the staging. A dialect that
appears to allow it (some MySQL versions historically, and some optimisers push the
computation down) is doing so by internally performing exactly this rewrite for you.

> **CHAPTER 1 SUMMARY**
>
> SQL evaluates in a fixed logical order — `FROM` → `WHERE` → `GROUP BY` → `HAVING` →
> `SELECT` → `DISTINCT` → `ORDER BY` → `LIMIT` — and every surprising behaviour in this
> volume is a consequence of that order rather than a quirk of the language. `WHERE` sees
> rows, `HAVING` sees groups, the `SELECT` list is where names come into existence, and
> `ORDER BY` sees everything; which is why a `SELECT` alias is illegal in `WHERE` and legal
> in `ORDER BY`, why a window function cannot be filtered until a level above, and why
> `LIMIT` without `ORDER BY` returns a coin flip dressed as a paginated API. The optimiser
> is free to choose a completely different *physical* order, and that freedom is exactly
> what makes a semantically ambiguous query dangerous: an outer join with a `WHERE` on the
> nullable side, a `NOT IN` over a nullable column, or an aggregate over a fanned-out join
> all produce confident, plausible, entirely wrong numbers with no error anywhere.

#### Further Reading

- [PostgreSQL — SELECT Reference: Evaluation Order](https://www.postgresql.org/docs/current/sql-select.html#SQL-SELECT-LIST) — the normative list of processing steps, quoted almost verbatim in most engine docs.
- [PostgreSQL — Table Expressions](https://www.postgresql.org/docs/current/queries-table-expressions.html) — joins, subqueries, `LATERAL`, set operations, and the `WITH` clause in one authoritative chapter.
- [PostgreSQL — Window Functions](https://www.postgresql.org/docs/current/tutorial-window.html) — the tutorial treatment, including why the filter has to go outside.
- [MySQL 8.0 — Window Function Descriptions](https://dev.mysql.com/doc/refman/8.0/en/window-function-descriptions.html) — the per-function definitions and frame defaults, engine by engine.
- [SQL Server — SELECT (Transact-SQL)](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-transact-sql) — a second engine's statement of the same clause order, useful for showing the standard is not a PostgreSQL quirk.

## Chapter 2 — Joins, Inners and the Semantics That Bite

### 2.1 The Four Join Types, Precisely

A join is a function from two bags to one bag. Saying it that way is not pedantry — it is
what makes the four types fall out as four different functions rather than four different
syntaxes.

```text
  A = customers (5 rows)      B = orders (9 rows)
  INNER JOIN          keeps the pairs where a match exists
                      →  9 rows (every order has a customer)
  LEFT  JOIN A→B     keeps all of A, null-extends the unmatched
                      → 10 rows (5 customers, 9 orders, 1 NULL-extended: Elin)
  RIGHT JOIN A→B     keeps all of B
                      →  9 rows, same as INNER here because the FK is total
                      (if an order could have a NULL customer_id, RIGHT adds NULLs)
  FULL  JOIN         keeps all of A and all of B
                      → 10 rows — the 9 matches plus Elin's NULL row
```

The single most useful thing about this table is the last line and the second line together.
A `LEFT JOIN` and a `FULL JOIN` produce the **same** row count on this data, because
`orders.customer_id` is a foreign key to `customers.id` and therefore no order can be
unmatched on the left. The row count alone tells you nothing; you have to know which side
*could* have produced the null-extended rows. This is the first step in every "why did I
get N rows" investigation.

The matching pairs, written out, because the null-extension is easier to see as data than
as a rule:

```text
  customer │ order    what the join did
  ─────────┼────────  ─────────────────────────────────────────────────
  Ada   1  │ 101      match
  Ada   1  │ 102      match
  Ada   1  │ 109      match
  Bruno 2  │ 103      match
  Bruno 2  │ 107      match
  Chidi 3  │ 104      match
  Chidi 3  │ 108      match
  Dara  4  │ 105      match
  Dara  4  │ 106      match
  Elin  5  │ NULL     ← manufactured by the LEFT JOIN; no row in B matched
```

Note the shape of the null-extension: Elin appears **once**, not nine times. This is the
thing candidates get wrong when predicting results. A `LEFT JOIN` with no `ON` match emits
one null-extended row, not one per row of the other side. `SELECT COUNT(*)` on a
`LEFT JOIN` between a 5-row table and a 9-row table is 10, not 5 + 9×5.

### 2.2 The Trap: `WHERE` Nullifies the Outer Join

This is the single highest-frequency silent bug in all of SQL, and it is the one the
authoring contract for this set assigns to this volume. The mechanism is a consequence of
Chapter 1, and once you see the pipeline you cannot unsee it.

```sql
-- The intent: "every customer, with their order status if they have one."
SELECT c.name, o.status
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.id
WHERE  o.status = 'SHIPPED';
-- 9 rows. Every one of them has a real o.status.
-- Elin is gone. The LEFT JOIN was an INNER JOIN all along.
```

The engine does exactly what the standard says. The pipeline is:

```text
  1. FROM customers c LEFT JOIN orders o ON o.customer_id = c.id
     → 10 rows, including (Elin, NULL, NULL, NULL)
  2. WHERE o.status = 'SHIPPED'
     → the predicate is UNKNOWN for Elin's row, because NULL = 'SHIPPED'
       is UNKNOWN, and WHERE admits only rows that are definitely TRUE
     → 9 rows

  The LEFT JOIN survived parsing. It just had no effect.
```

`WHERE` is a *filter on the joined rows*. A null-extended row is a joined row whose right
side is unknown. Any predicate in `WHERE` that references the right side will be unknown
for that row, and unknown rows do not pass. **You cannot preserve a null-extended row
through a `WHERE` clause that touches the null-extended side.** Any predicate in `WHERE`
that mentions the right table's columns destroys the outer join.

The fix is to move the predicate into the `ON` clause, which is evaluated *before* the
null-extension, as part of producing the joined relation:

```sql
-- Correct: 5 rows. Elin survives with NULL status.
SELECT c.name, o.status
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.id
                    AND o.status = 'SHIPPED';
-- Also correct, and better: 5 rows, no null-extension, no reliance on NULL semantics.
SELECT c.name, o.status
FROM   customers c
LEFT   JOIN (SELECT * FROM orders WHERE status = 'SHIPPED') o
       ON o.customer_id = c.id;
-- Also correct, 5 rows, and clearest about intent: aggregate the right side.
SELECT c.name, COUNT(o.id) AS shipped_orders
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.id AND o.status = 'SHIPPED'
GROUP  BY c.name;
```

> **INTERVIEW TRAP — "HOW DO I KEEP THE UNMATCHED ROWS?"**
>
> The reflexive answer is `OR o.status IS NULL`, and it is wrong in the general case. It
> does preserve Elin on this data, but it also preserves a customer whose only order was
> `PENDING` — because that customer's row has a non-null `o.status` that fails the
> predicate, so the `OR` does not fire for them, but a customer with a *null* status column
> on a *matched* order would also slip through. The real answer is structural: **the
> predicate belongs in `ON`, because `ON` is evaluated before the null-extension and
> `WHERE` after it.** If you find yourself adding `OR col IS NULL` to a `WHERE` clause over
> a left-joined column, you are compensating for having put the predicate in the wrong
> clause, and the compensation is fragile in exactly the case that matters — a matched row
> that happens to have a `NULL` in the filtered column.
>
> The follow-up is the reverse trap, which is less discussed and more expensive in
> production: putting a predicate in `ON` that *should* have been in `WHERE`. `LEFT JOIN
> orders o ON o.customer_id = c.id AND o.total_amount > 100` gives you every customer plus
> only their large orders. That is a filter on the *result set of the join*, and it is a
> legitimate and very useful thing. The bug is a developer who believes `ON` and `WHERE`
> are interchangeable, so the difference between "show me all customers" and "show me all
> customers who have an order over 100" becomes an accidental design decision discovered
> in a bug report.

The second reverse trap, from the required list: `WHERE o.status = 'x'` nullifies left rows
in exactly the same way. There is no difference between `IS NOT NULL`, `= 'x'`, `> 5`, and
`LIKE 'S%'` here. All four are `UNKNOWN` for a null-extended row. All four convert the
outer join to an inner one. What varies is only how obvious the accident is — `IS NOT NULL`
is a *deliberate* null check that experienced developers write in `WHERE` without
realising they are rewriting the join type, and it is the most common one in real code.

> **MUST REMEMBER**
>
> `ON` filters *which rows are allowed to match*. `WHERE` filters *the joined result*. Any
> `WHERE` predicate on the null-extended side of an outer join silently reduces it to an
> inner join. This one sentence resolves the majority of "why is my left join dropping
> rows" tickets ever filed.

### 2.3 `USING` vs `ON` vs `NATURAL`

Three ways to express a join condition, and the differences are not cosmetic.

```sql
-- ON: full control, names are qualified, you can compare anything to anything.
SELECT c.id AS customer_id, o.id AS order_id
FROM   customers c JOIN orders o ON o.customer_id = c.id;
-- USING: the joined columns are merged into one. c.id disappears as a name.
SELECT id, o.placed_at          -- 'id' is the merged column; o.id does NOT exist
FROM   customers c JOIN orders o USING (id);
-- NATURAL: the engine finds the shared column names itself.
SELECT * FROM customers NATURAL JOIN orders;   -- joins on id, status, ... everything shared
```

`USING` is genuinely useful and under-used. It documents that the join is an equi-join on
a column that becomes a single output column, and it makes the merged-name semantics
explicit. Its cost is that after a `USING` join, the *right* side's copy of the joined
column is no longer addressable — `o.id` is a reference error in PostgreSQL and MySQL. In a
query that joins three tables sharing an `id` column, which is most of them, that produces
`USING (id) USING (id)` and a merged `id` that means three different things.

`NATURAL JOIN` is a trap with no offsetting benefit, and the reason is worth stating

precisely: **it derives the join condition from the schema, and the schema changes.** Add a

`last_modified` column to both tables, or a `status` column to `customers`, and the join
condition changes silently. The query keeps parsing, keeps running, and starts returning a
different number of rows. A `NATURAL JOIN` is a hidden dependency on the *shape* of two
tables that no review tool can see and no test will catch, because the test asserts on
current data.

```text
  customers: id, name, country, signed_up
  orders:    id, customer_id, placed_at, status, total_amount
             ────────
             shared column names today: "id" only
  add customers.updated_at  and  orders.updated_at:
             shared column names tomorrow: id, updated_at
             → NATURAL JOIN now requires BOTH to be equal
             → row count changes, no error, no warning
```

> **TRADE-OFF — "SHOULD WE EVER AUTOMATICALLY JOIN ON SAME-NAMED COLUMNS?"**
>
> Never in a query; occasionally in a tool. The flip condition is that the column *list* is
> closed and the semantics are guaranteed — an analytics tool generating joins from a
> catalogue, or a schema migration tool inferring a foreign key. There, the derivation is
> against a controlled metadata source, not against whatever columns happen to exist this
> week. In application SQL the condition that flips the answer is simply that the join
> condition is *load-bearing business logic*, and business logic should be visible, greppable
> and reviewable in the query text rather than inferred from a naming convention. A `JOIN`
> whose condition you cannot see is a `JOIN` whose condition you cannot fix.

### 2.4 Fan-Out: How a Join Multiplies Rows

This is the bug that inflates revenue, and it is not a SQL bug — it is a

*grain* bug (Volume 1 Chapter 5) that SQL faithfully executes. The query joins an
order-grain fact to a line-grain fact and then aggregates an order-grain measure.

```sql
-- BROKEN: returns 82.00. The correct answer is 51.00.
SELECT c.name, SUM(o.total_amount) AS revenue
FROM   customers c
JOIN   orders o      ON o.customer_id = c.id
JOIN   order_items i ON i.order_id    = o.id
GROUP  BY c.name;
```

Work it by hand, because this is exactly the kind of question a screen asks.

```text
  Ada (customer 1) has three orders. Joining to order_items makes:
  order  line  i.qty*i.price   o.total_amount  ← SUM sees this once per line
  ─────  ────  ──────────────  ──────────────
  101    1001       25.00          31.00
  101    1002        6.00          31.00   ← 31.00 counted a second time
  102    1003       12.50          12.50
  109    1010        7.50           7.50
                  ───────────    ─────────
  SUM              51.00          82.00     ← the answer the query gives
  correct revenue for Ada = 31.00 + 12.50 + 7.50 = 51.00
```

The `SUM(o.total_amount)` is wrong because `o.total_amount` is repeated once per line.
`SUM(i.qty * i.price)` over the same join would give 51.00 and be *correct* — which is
what makes this bug so treacherous: the identical query text is right for one measure and
wrong for another, and which one it is depends on where the column lives.

The fix is to **pre-aggregate the finer-grained table to the coarser grain before joining**,
so the join is one-to-one on the measure's grain:

```sql
-- CORRECT: 51.00. The order-grain total is computed at order grain, then joined 1:1.
SELECT c.name, SUM(o.total_amount) AS revenue
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
GROUP  BY c.name;
-- or, if the line data is genuinely needed for some other column:
SELECT c.name, SUM(per_order.total) AS revenue
FROM   customers c
JOIN (
  SELECT order_id, SUM(qty * price) AS total
  FROM   order_items
  GROUP  BY order_id
) per_order ON per_order.order_id = o.id
JOIN   orders o ON o.id = per_order.order_id
GROUP  BY c.name;
```

The `SUM(DISTINCT ...)` trick deserves an explicit warning, because it is the fix people
discover first and it is *wrong in general*:

```sql
-- Looks like a fix, is a coincidence on this data:
SELECT c.name, SUM(DISTINCT o.total_amount) AS revenue   -- 51.00 here
FROM   customers c
JOIN   orders o      ON o.customer_id = c.id
JOIN   order_items i ON i.order_id    = o.id
GROUP  BY c.name;
```

`SUM(DISTINCT o.total_amount)` de-duplicates identical values, not repeated rows. If Ada
had two orders that each totalled 12.50, this returns 12.50 instead of 25.00. It is a
*detective tool* — "does removing the duplicate-values effect make the number right?" —
not a fix. The second detective tool is `COUNT(DISTINCT o.id)` versus `COUNT(*)`, which
tells you the multiplication factor directly.

The right mental model, stated once:

```text
  A join is a filter on PAIRS. Aggregation collapses PAIRS to GROUPS.
  An aggregate is only well-defined if the measure's grain is not
  finer than the grain of the joined row.

  one row per order  +  one row per line   →  joined row is one per LINE
                                             → order-grain measure is multiplied
  FIX: aggregate the fine table FIRST, so the join is 1:1 at the measure's grain
```

> **PRODUCTION SCENARIO**
>
> Problem: the finance dashboard's monthly revenue runs about 60% over the ledger, and the
> gap widens as orders get more lines. Finance has raised it three times; engineering has
> raised it back three times.
> Investigation: `EXPLAIN` shows nothing pathological — a small hash join, 40ms, no spill.
> The query sums `orders.total_amount` after joining `orders` to `order_items` to pick up the
> line count. For an order with 1 line it is right; for an order with 3 lines it triples.
> On this data, customer 1's true revenue of 51.00 is reported as 82.00 because order 101
> has two lines.
> Root cause: a grain mismatch. The report joined to line grain to obtain a count and then
> reported an order-grain sum, so every measure in the same `SELECT` list was multiplied by
> that order's line count. Nobody wrote down the grain, so nothing in review caught it.
> Solution: pre-aggregate lines to order grain in a CTE, compute the line count there, and
> join the one-row-per-order result to `orders`.
> Prevention: put the grain in a comment on every table, and make "does this query
> fan out?" an explicit line in the query review template. Both fan-out classes — a
> multiplied measure and a nullified outer join — are caught by the same two questions.

### 2.5 Join Order Is the Optimiser's Decision, and Usually the Right One

For a semantically well-formed inner join, **join order is not your decision and does not
affect the result.** It affects the cost, and the optimiser is usually better at that
decision than you are — it has histograms, distinct-value counts, and correlation
statistics you do not have in your head. What *does* affect the result, and what you should
actually be checking in review:

- **Outer-join type.** A `LEFT JOIN` is not commutative with its inputs. Swapping
  `a LEFT JOIN b` to `b LEFT JOIN a` changes which side is preserved, which is why some
  engines refuse to reorder outer joins at all.
- **Which predicate is in `ON` versus `WHERE`**, for the reasons in §2.2.
- **Whether the predicate is equi-join or not.** Non-equi predicates (`>`, `BETWEEN`,
  `LIKE`) disable the hash-join and merge-join strategies and force a nested-loop — a
  physical-plan fact (Volume 4) with a direct consequence for how often the inner relation
  is read.
- **Filters in the right clause**, because they change the *bag* the join consumes, not
  just the timing.
> **INTERVIEW TRAP — "SHOULD I REWRITE THE JOINS IN THE OPTIMAL ORDER?"**
>
> No, and the reason is that the optimiser is already solving a problem you cannot see. The
> planner has histograms on every column, distinct-value estimates, and — in PostgreSQL —
> cross-table statistics that tell it `orders.status` and `orders.total_amount` are
> correlated. It is choosing the join order to minimise the *intermediate* row counts, which
> is the thing that actually determines cost. A developer reordering joins by intuition is
> guessing at a number the optimiser already computed.
>
> The exception, and the honest version of the answer, is when the optimiser is *wrong* — a
> stale statistic, a correlated predicate it does not model, a function wrapping an indexed
> column so the index is unusable, or a 12-table join that exceeds its heuristics. Then the
> right first move is `ANALYZE`, not a hand-ordered join. What you *should* review in a join
> is the thing a planner cannot fix for you: whether the row counts coming out are the row
> counts you intended.

### 2.6 `CROSS JOIN` and the Comma Precedence Trap

A comma-separated `FROM` list is a `CROSS JOIN`, and the comma binds *before* an
explicit `LEFT JOIN` in the same `FROM` clause — which changes what the outer join
preserves.

```sql
-- Both of these are the same query, and both are correct:
SELECT * FROM a, b      WHERE a.id = b.a_id;
SELECT * FROM a CROSS JOIN b ON a.id = b.a_id;
-- This is a DIFFERENT query, and almost nobody writing it means this:
SELECT * FROM a, b LEFT JOIN c ON c.a_id = a.id WHERE b.x = 1;
-- parsed as:  (a CROSS JOIN b) LEFT JOIN c ON ...
-- so the LEFT JOIN preserves all of a⋈b, not all of a
```

The comma form is not slower and not wrong in itself; it is ambiguous to a reader, and a
`CROSS JOIN` that is immediately filtered down to an equi-join should be written as an
explicit `JOIN ... ON` so the join graph is visible. `CROSS JOIN` earns its keep in two

places: generating a dimension (a calendar, a numbers table) to be left-joined against, and

— with `LATERAL` — expressing a per-row subquery in join shape (Chapter 4 §4.7).

#### Common Mistakes

- Believing `ON` and `WHERE` are interchangeable in an outer join, and shipping a `WHERE`
  predicate on the nullable side that quietly turns the join into an inner join
- "Fixing" it with `OR o.col IS NULL`, which preserves the wrong rows when a *matched* row
  happens to have a `NULL` in that column
- Summing an order-grain measure after joining to line grain, and getting a total inflated
  by the average line count
- Using `SUM(DISTINCT measure)` as a fan-out fix, which de-duplicates values rather than
  rows and is silently wrong whenever two legitimate rows share a value
- Reaching for `NATURAL JOIN` to "save typing", coupling the join condition to the current
  column list of two tables
- Hand-reordering joins in the belief that the textual order is the execution order, and
  then distrusting the planner forever
- Writing a comma join mixed with a `LEFT JOIN` and not realising the comma binds first,
  changing which relation the outer join preserves

#### Interview Questions — Joins & Fan-Out

**Q1. Why does `LEFT JOIN ... WHERE right.col IS NOT NULL` behave like an inner join?** `TRICKY`
Because of the evaluation order, not because of any special rule. The `LEFT JOIN` in `FROM`
correctly produces a null-extended row for every left row without a match. `WHERE` is
evaluated next, on the joined rows, and the predicate `right.col IS NOT NULL` is FALSE for
the null-extended row. `WHERE` admits only rows that are definitely TRUE, so the
null-extended row is discarded — and a query that discards the null-extended rows of a left
join is an inner join. The same is true of every other predicate on the right side:
`= 'x'`, `> 5`, `LIKE 'S%'`, `BETWEEN`, and even `IS DISTINCT FROM 'x'`. The fix is

structural: put the filter in the `ON` clause, which is evaluated as part of producing the

join and before the null-extension, or pre-filter the right table in a subquery, or use an
aggregate on the right side instead of a row-level filter. `IS NOT NULL` is the version
that causes the most damage precisely because it looks like a deliberate, careful predicate
rather than an oversight.

**Q2. Your revenue query returns 60% more than the correct number and the plan looks fine.
What is happening and how do you fix it?** `ADVANCED`

It is a grain mismatch, not a plan problem. The query joins an order-grain table to a
line-grain table and then aggregates an order-grain measure (`orders.total_amount`), so
each order's total is counted once per line item and multiplied by that order's line count.
In this book Ada is invoiced 82.00 instead of 51.00, because order 101 has two lines and
its 31.00 is counted twice. The plan is fine because the plan is *correct* — the engine did
exactly what the query asked. The fix is to pre-aggregate the line table to order grain in a
CTE or derived table and join that one-row-per-order result, so the measure is computed at
its own grain. `COUNT(DISTINCT order_id)` versus `COUNT(*)` confirms the diagnosis, and
`SUM(DISTINCT total_amount)` sometimes makes the number look right — but that is a
coincidence of this data, not a fix, because it removes equal values as well as repeated
rows.

**Q3. When is a `RIGHT JOIN` a sign of a query that should be rewritten?** `STAFF`
When it exists at all, in application SQL. A `RIGHT JOIN` is almost always a `LEFT JOIN`
written from the wrong starting table: the developer began from whichever table they had in
front of them rather than from the one whose rows must survive. Since a `RIGHT JOIN` is the
mirror of a `LEFT JOIN` and has identical semantics, it is not *wrong*, but it is harder to
read because the preserved side is the one the query does not name first, and outer joins
are not commutative, so any later reordering of the `FROM` list silently changes the
meaning. The exception where `RIGHT JOIN` is genuinely the clearest form is a full report
built by successively adding tables from the outside in, where reversing the text of the
query would be noisier than mirroring the join. The stronger point for a design review: if
you find yourself needing a `RIGHT JOIN`, check whether the relationship is actually
`NOT NULL` — a `RIGHT JOIN` that never adds a null-extended row is a schema smell, because
it means the foreign key is total and the outer join is decoration.

**Q4. What is `USING` for, and what does it cost?** `TRICKY`

`USING (col)` is a shorthand for an equi-join on identically-named columns with one
additional semantic: after the join, the two copies of the joined column are merged into a
single output column, and the right-hand copy is no longer separately addressable. So
`SELECT id FROM a JOIN b USING (id)` works and `b.id` is a reference error. That is the
whole feature: it documents that the column is genuinely one value after the join, which
is true and worth stating, and it prevents a class of ambiguity where you accidentally
select the left copy thinking it is the right one. The cost is that in a query joining
several tables that all have an `id`, `USING` produces a single `id` that silently means
something different in each clause, and the merge propagates: you end up with `USING (id)
USING (id)` and a very confusing error message when you then reference the third table's
`id`. The rule of thumb is that `USING` is good for one join between two tables and
questionable for three or more. `ON` is never ambiguous and costs four more characters.

> **CHAPTER 2 SUMMARY**
>
> A join is a filter on pairs, and the two clauses that express its condition are not
> interchangeable. `ON` runs before null-extension and decides which pairs survive; `WHERE`
> runs after and decides which joined rows survive. That single ordering fact explains why a
> `WHERE` predicate on the nullable side of a `LEFT JOIN` silently reduces it to an inner
> join, why `ON` is the only correct home for a match condition in an outer join, and why
> moving a predicate across that boundary is the most common join bug in production code.
> Join order is free and join *direction* is not: `LEFT` and `RIGHT` differ only by
> syntactic convenience, but `FULL` is a different function and `CROSS` is a bag product.
> `USING` and `NATURAL` compress the condition at the cost of making correctness depend on
> the schema's column names, which is a coupling a rename can break. And because a join is a
> function from bags to bags, the row count of the result is the sum of the match counts,
> not the count of either input — `orders` joined to `order_items` turns Ada's 51.00 into
> 82.00 unless the child side is pre-aggregated to one row per order. The grain of the
> result is whatever the join's narrowest shared key implies, and stating that grain out
> loud is the cheapest review comment you can write.

#### Further Reading

- [PostgreSQL — Tutorial: Queries with `JOIN`](https://www.postgresql.org/docs/current/tutorial-sql.html) — the shortest clear treatment of inner versus outer, with null-extension worked through row by row.
- [PostgreSQL — Table Expressions: JOIN](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-JOINS) — `CROSS`, `NATURAL`, `LEFT`, `FULL`, `LATERAL`, and the normative rules for `ON` versus `USING`.
- [MySQL 8.0 — JOIN Clause](https://dev.mysql.com/doc/refman/8.0/en/join.html) — a second engine's semantics, including where they diverge from the standard.
- [Use The Index, Luke — The Join Operation](https://use-the-index-luke.com/sql/join) — how each physical join algorithm multiplies rows, and the index that makes the inner side cheap.
- [SQL Server — FROM (Transact-SQL)](https://learn.microsoft.com/en-us/sql/t-sql/queries/from-transact-sql) — `CROSS APPLY`, `OUTER APPLY` and `PIVOT`, useful as a cross-engine check on what "outer" can mean.

## Chapter 3 — Self Joins, Implicit Joins & Anti-Joins

### 3.1 The Question Anti-Joins Answer

Half of the interesting questions in a relational system are of the form "give me the rows
for which there is *no* corresponding row somewhere else." Customers with no orders.
Products never sold. Orders with no line items. Permissions not granted. Users who have
never logged in. This is the *anti-join*, and SQL offers three spellings of it with three
different behaviours, one of which fails silently and catastrophically.

```sql
-- The question: which customers have never placed an order?
-- Which is, in this dataset: Elin. One row.
```

### 3.2 Three Spellings, Three Behaviours

All three of the following are correct answers to the same question on this data, and only
two of them are correct *in general*.

```sql
-- (1) LEFT JOIN ... IS NULL
SELECT c.id, c.name
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.id
WHERE  o.id IS NULL;
-- → 1 row: (5, 'Elin')
-- (2) NOT EXISTS  ← the default
SELECT c.id, c.name
FROM   customers c
WHERE  NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
-- → 1 row: (5, 'Elin')
-- (3) NOT IN  ← the one that breaks
SELECT c.id, c.name
FROM   customers c
WHERE  c.id NOT IN (SELECT o.customer_id FROM orders o);
-- → 1 row: (5, 'Elin')
```

On this data all three agree, which is exactly why option 3 is dangerous: it is correct
until the day somebody sets `customer_id` to `NULL` on an order, and then it returns
**zero rows**, forever, with no error and no warning.

### 3.3 The `NOT IN` NULL Trap, Precisely

This is the trap the authoring contract assigns to this volume, and the reason it belongs
here rather than in the `NULL` material of Volume 2 is that it is not really about `NULL`
at all — it is about three-valued logic meeting a quantifier.

```text
  SQL's IN is defined as a comparison, not as a set membership test:
      x IN (a, b, c)   ≡   x = a OR x = b OR x = c
  NOT IN is the negation of that whole OR:
      x NOT IN (a,b,c) ≡  NOT (x = a OR x = b OR x = c)
                        ≡  x <> a AND x <> b AND x <> c
```

Now walk the sub-select for customer 5 (Elin) against a sub-select that contains one `NULL`:

```text
  c.id = 5.  subquery = { 1, 1, 2, 2, 3, 3, 4, 4, 1, NULL }
      5 = 1        → FALSE
      5 = 1        → FALSE
      5 = 2        → FALSE
      5 = 2        → FALSE
      5 = 3        → FALSE
      5 = 3        → FALSE
      5 = 4        → FALSE
      5 = 4        → FALSE
      5 = 1        → FALSE
      5 = NULL     → UNKNOWN          ← here it is
  NOT (FALSE OR … OR UNKNOWN)  ≡  NOT UNKNOWN  ≡  UNKNOWN
  WHERE admits only TRUE  →  Elin is filtered out
```

**One `NULL` anywhere in the sub-select makes `NOT IN` return the empty set, always.** Not
"usually". Not "for some rows". The entire result becomes empty, for every row of the
outer query, because `UNKNOWN AND FALSE AND FALSE …` is `FALSE`, and `UNKNOWN AND UNKNOWN`
is `UNKNOWN` — neither is ever `TRUE`, and `WHERE` requires `TRUE`.

Here is the demonstration, and it is worth being able to produce from memory in an
interview because it is such a clean illustration:

```sql
-- Add one order with an unknown customer (a real scenario: an imported
-- guest order whose customer record was purged).
INSERT INTO orders (id, customer_id, placed_at, status, total_amount)
VALUES (110, NULL, '2024-07-20', 'PENDING', 5.00);
SELECT c.id, c.name
FROM   customers c
WHERE  c.id NOT IN (SELECT o.customer_id FROM orders o);
-- → 0 rows.  (was 1 row before the INSERT)
SELECT c.id, c.name
FROM   customers c
WHERE  NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id);
-- → 1 row: (5, 'Elin')  — unchanged, as it should be
```

The `NOT EXISTS` version is immune, and the reason is that `EXISTS` is defined

*existentially* rather than by comparison:

```text
  EXISTS (subquery)  ≡  "does this subquery produce at least one row?"
                     ≡  a boolean over the ROW SET, with no comparison
                     ≡  TRUE if ≥1 row, FALSE if 0 rows. Two values only.

  Therefore NOT EXISTS is always exactly TRUE or exactly FALSE.
  It is never UNKNOWN, so NULLs inside the subquery are irrelevant:
  the predicate o.customer_id = 5 is UNKNOWN for the NULL row, but
  that row is simply not a match, and one non-match is all that matters.
```

That is the whole defence, and it generalises: `EXISTS` and `NOT EXISTS` are quantifiers
over a set, so they live in two-valued logic; `IN` and `NOT IN` are sugar for a chain of
comparisons, so they live in three-valued logic. The quantifier form is the one that means
what you meant.

> **INTERVIEW TRAP — "WHY IS `NOT EXISTS` BETTER THAN `NOT IN`?"**
>
> Because `IN` is not a set membership test; it is a chain of `=` comparisons, and `NULL`
> poisons the negation of that chain. `5 NOT IN (1,2,NULL)` expands to `5 <> 1 AND 5 <> 2
> AND 5 <> NULL`, and `5 <> NULL` is UNKNOWN, so the whole conjunction is never TRUE and
> the row is dropped. `EXISTS` is a quantifier — "does at least one row satisfy this" — and
> quantifiers live in two-valued logic: at least one row, or no rows. The `NULL` row in the
> sub-select is simply not a match, which is exactly right, and the result is unaffected.
>
> The follow-up that shows real depth: the two are not *only* different on `NULL`s. `NOT
> IN (subquery)` also has a materially worse plan, because the planner must materialise or
> dedupe the sub-select's value list and then evaluate a semi-join against it, and the
> de-duplication is an expensive step that a `NOT EXISTS` semi-join does not require. So
> the rule "prefer `NOT EXISTS`" is a rule about *correctness first* and *plan shape
> second*, and stating it in that order is what makes it sound like an answer rather than a
> mantra.
>
> The one case where `NOT IN` is genuinely the better choice: a **constant** list with no
> subquery and no possible `NULL`, such as `WHERE status NOT IN ('PENDING','CANCELLED')`. A
> short literal list is faster than a correlated subquery, and it cannot contain a `NULL`
> you failed to notice. The moment the list comes from a table, the rule flips.

### 3.4 Correlated Predicates and the Semi-Join Idea

Both `EXISTS` and `IN` are **semi-joins**: they answer "is there a match?", not "what are
the matches?" This is why they do not multiply rows, which is their other great advantage
over a plain `LEFT JOIN` for the same question.

```text
  JOIN         returns the pairs              → can multiply rows
  SEMI-JOIN    returns the left rows only     → row count preserved
  ANTI-JOIN    returns the left rows with
               no match                        → row count preserved

  The anti-join is the semi-join's complement. SQL does not have a
  keyword for either; IN / EXISTS / NOT EXISTS are the surface syntax.
```

The word *correlated* means the subquery references a column from the outer query. That
reference is what makes it a semi-join rather than a set operation, and it is also what
gives the optimiser the freedom to convert it into a hash anti-join or a merge anti-join
rather than executing it row by row. Modern planners un-correlate aggressively:

```sql
-- Written correlated. The planner may turn this into a single hash anti-join
-- over customers ⋈ orders, executed once.
SELECT c.id, c.name
FROM   customers c
WHERE  EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'SHIPPED');
```

Whether the un-correlation actually happens is a plan-level question (Volume 4), and the
conditions for it are worth knowing: the subquery must not be correlated in a way that
changes its *result* (no `LIMIT`, no `OFFSET`, no `FIRST_VALUE`-style dependence on outer
row order), and the outer reference must be on a joinable key. A subquery with a `LIMIT`
**cannot** be un-correlated, because "the top 3 per outer row" is genuinely a per-row
question — which is exactly why `LATERAL` exists (Chapter 4 §4.7).

The prediction question here is one of the most common on a screen, and the answer is
purely mechanical. Take the query above: which customers have at least one `SHIPPED` order?

```text
  Ada    (1)  101 SHIPPED, 102 SHIPPED, 109 PENDING  → yes
  Bruno  (2)  103 CANCELLED, 107 SHIPPED            → yes
  Chidi  (3)  104 SHIPPED, 108 PENDING              → yes
  Dara   (4)  105 PENDING, 106 SHIPPED              → yes
  Elin   (5)  (no orders)                           → no
  → 4 rows.  EXISTS does not multiply, so Bruno appears once
             despite having two orders, one of which is CANCELLED.
```

### 3.5 The Greatest-N-Per-Group Idiom, as an Anti-Join

The anti-join's most valuable application is not finding missing rows — it is expressing
"the maximum" as a *set difference* rather than as a correlated subquery, which is
sometimes both faster and more readable.

```sql
-- Classic correlated form: find each customer's most recent order.
SELECT c.id, c.name, o.id, o.placed_at
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
WHERE  o.placed_at = (SELECT MAX(o2.placed_at)
                      FROM   orders o2
                      WHERE  o2.customer_id = c.id);
-- → Ada appears TWICE: 102 and 109, because both are 2024-06-14
```

That duplicate is not a bug in the query — it is the honest answer to "each customer's most
recent order" when there is a tie. If you want one row, you need a tie-breaker, which is
what window functions are for (Chapter 6). But the anti-join formulation is worth knowing
because it handles the case where you want *all* rows tied at the maximum, which is a real
business question ("which customers have two orders on their busiest day").

The pure anti-join version, using `EXCEPT` or a `NOT EXISTS` against a derived table:

```sql
-- Anti-join form: everything that is NOT below some other row's value.
SELECT c.id, c.name, o.id, o.placed_at
FROM   customers c
JOIN   orders o ON o.customer_id = c.id
WHERE  NOT EXISTS (
         SELECT 1 FROM orders o2
         WHERE  o2.customer_id = o.customer_id
         AND    o2.placed_at   > o.placed_at
       );
-- → Ada: 102, 109 (both tied at the max, both survive)
--   Bruno: 107      Dara: 106      Chidi: 108
-- Same result as the MAX() form, and it generalises to "top N" by
-- counting the rows that beat this one — which is the shape of
-- RANK() in Chapter 6.
```

Notice what this formulation actually says: *"this row has no superior row in its group."*
That is the definition of a maximum, expressed as an anti-join, and it is worth being able
to read it aloud because it generalises to a surprisingly large family of queries — median
approximations, "keep only rows that are not duplicated by a lower-priority row",
"resolve duplicate entities by keeping the row with the smallest source-system id".

### 3.6 Anti-Joins in `DELETE`, and the Two-Table Form

Anti-joins are not only a read construct, and the most valuable production use is a
`DELETE` that removes exactly the rows with no children:

```sql
-- Delete orders that have no line items.  → order 108.
DELETE FROM orders o
WHERE  NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);
```

The `DELETE ... USING` form (PostgreSQL) or the multi-table `DELETE` (MySQL) with a
`LEFT JOIN` works too, and lets you put extra conditions in `ON`. But `NOT EXISTS` is the
form to reach for, for the §3.3 reason and because it cannot multiply the rows being

deleted: a `DELETE` written as a join against a child table with duplicates will attempt to

delete the same parent row repeatedly, and engines differ on whether that is an error or a
no-op.

The two-table anti-join — "rows in A with no match in B **and** rows in B with no match in
A" — is a `FULL OUTER JOIN` with two `IS NULL` checks:

```sql
SELECT 'customer' AS kind, c.id, c.name FROM customers c
LEFT  JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL
UNION ALL
SELECT 'order', o.id, o.status FROM orders o
LEFT  JOIN customers c ON c.id = o.customer_id WHERE c.id IS NULL;
-- → 1 row: ('customer', 5, 'Elin')   and 0 rows of orders
```

The `UNION ALL` rather than `UNION` is the Chapter 7 lesson in miniature: the two branches
are structurally different and cannot produce identical rows, so deduplication would be pure
cost.

> **SCALING REALITY CHECK**
>
> An anti-join degrades differently from a join, and this is worth knowing before it
> appears in a review. An `INNER` join on a foreign key with an index on the child can be
> driven from the child with a single index probe per parent row — the plan is
> `Nested Loop` over 5 customers and 9 orders, and the cost is proportional to the data. An
> anti-join with no usable index on the child is the same shape but with a *negative* test,
> and the planner will frequently prefer a full scan of the child with a hash build, which
> is fine at 10 rows and catastrophic at 200 million. The practical threshold: an anti-join
> whose subquery scans the child without an index is a query that will be fine in staging
> and fall over the first week of real traffic. Check that `orders.customer_id` is indexed
> (Volume 4) before assuming the anti-join is safe.

#### Common Mistakes

- Using `NOT IN (subquery)` on a nullable column and getting an empty result set, then
  debugging the data rather than the operator
- "Fixing" it with `NOT IN (SELECT ... WHERE col IS NOT NULL)`, which works and hides a
  schema problem instead of surfacing it — and which is exactly the wrong fix when the
  `NULL` is itself the row you are looking for
- Using `OR right_col IS NULL` in a `WHERE` clause to preserve outer-join rows, which
  preserves the wrong rows when a *matched* row has a `NULL` in that column
- Writing the greatest-n-per-group with `= (SELECT MAX(...))` and getting duplicate rows on
  a tie, then adding a tie-breaker that changes the answer to "most recent" into the answer
  to "most recent, first one wins"
- Assuming `EXISTS` duplicates the outer row once per match, because the word "subquery"
  suggests a loop — it does not, and that belief leads people into unnecessary `DISTINCT`s
- Deleting parents with a join against a child table that can have duplicates, without
  noticing that the same parent row is targeted more than once

#### Interview Questions — Anti-Joins & Missing Rows

**Q1. `SELECT * FROM customers WHERE id NOT IN (SELECT customer_id FROM orders)` returns
zero rows. The subquery is correct. What happened?** `TRICKY`

The subquery's result set contains a `NULL`, and `NOT IN` is defined as a negated chain of
comparisons. `x NOT IN (1, 2, NULL)` expands to `x <> 1 AND x <> 2 AND x <> NULL`, and the
last comparison is UNKNOWN, so the conjunction is never TRUE for any row, so `WHERE` — which
admits only definitely-TRUE rows — filters everything out. One `NULL` anywhere in the
sub-select makes the entire result empty, for every outer row, permanently. The fix is
`NOT EXISTS`, which is a quantifier over the row set and lives in two-valued logic: at
least one matching row or none. The `NULL` row is simply not a match, which is the correct
answer. A second fix is `NOT IN (SELECT customer_id FROM orders WHERE customer_id IS NOT
NULL)`, which is correct but suppresses a data problem you probably want to know about.
**Q2. Rewrite `LEFT JOIN ... IS NULL` as `NOT EXISTS`. What actually changes?** `TRICKY`
The result set is identical on well-formed data, but three things change underneath.
(1) Correctness: `NOT EXISTS` is immune to `NULL`s in the sub-select, `LEFT JOIN ... IS
NULL` is not — if `o.id` is itself nullable, a *matched* row with a `NULL` id will satisfy
`o.id IS NULL` and be wrongly reported as unmatched. (2) Row count: the `LEFT JOIN`
approach starts by materialising one null-extended row per unmatched left row and then
discarding it, which is a valid but roundabout plan; `NOT EXISTS` is a native anti-join and
the planner has a hash anti-join and a merge anti-join available for it directly.
(3) Readability: the `LEFT JOIN ... IS NULL` idiom is a well-known anti-pattern that people
copy without understanding, so a reviewer cannot tell whether the author meant an anti-join
or an outer join that was supposed to return rows. Use `NOT EXISTS` by default; keep the
`LEFT JOIN` form when you genuinely need the right-side columns for the rows that *do*
match.

**Q3. When is a correlated subquery in the `SELECT` list a mistake?** `ADVANCED`
Whenever it is in a `SELECT` list, because a correlated subquery in the `SELECT` list
cannot be optimised into a join — the engine has no way to know it will be evaluated once
per row, and it does evaluate it once per row, so a 10,000-row result set means 10,000
subquery executions. That is the SQL equivalent of the ORM N+1, and it is the same trap
arriving through a different door. The fix is a window function, which computes the
correlated value once per partition in a single pass: `SELECT ..., (SELECT COUNT(*) FROM
orders o WHERE o.customer_id = c.id) AS n FROM customers c` becomes

`COUNT(*) OVER (PARTITION BY customer_id)`. The exception is when the subquery genuinely
cannot be expressed as a window — a `MAX` of an unrelated aggregate, a top-N-per-group, a
`LIMIT` — in which case use a `LATERAL` join (Chapter 4) or an explicit join to a
pre-aggregated derived table, which at least lets the planner hash the small side once.
**Q4. How would you delete every `orders` row that has no `order_items` row, and what is
the danger in the obvious version?** `STAFF`

```sql
DELETE FROM orders o
WHERE NOT EXISTS (SELECT 1 FROM order_items i WHERE i.order_id = o.id);
```

The obvious version — a `DELETE` with a `LEFT JOIN` to `order_items` and an `IS NULL`
check — is not wrong in most engines but has two sharp edges. First, it builds a full join
when the anti-join is a single index-driven pass, which on a large `orders` table is the
difference between a seconds-long delete and an hours-long one. Second, if the child table
can contain duplicates for a parent, the join produces the parent row more than once and
the engine's behaviour on a repeated delete target varies — some engines error, some no-op.
`NOT EXISTS` targets each parent row exactly once, uses the index on `order_items.order_id`,
and is portable. Add the `NOT NULL` guarantee on the child's foreign key and the whole class
of concern disappears, which is the schema-level answer.

> **CHAPTER 3 SUMMARY**
>
> "Rows with no match" is the anti-join, and the choice of spelling is a correctness
> decision, not a style one. `NOT EXISTS` is a quantifier: for each outer row it asks
> whether the inner relation has a qualifying row, and it answers yes or no, so a `NULL`
> inside the inner table is just another row that fails to qualify. `NOT IN` is a negated
> comparison chain against a list of values, evaluated under three-valued logic, so a single
> `NULL` in that list makes every comparison evaluate to unknown and the entire result
> empty — zero rows, no error, no warning. `LEFT JOIN ... IS NULL` reaches the same rows in
> the common case and fails in a different way: it breaks if the column being tested for
> `NULL` is itself nullable in the child, because a genuine null is indistinguishable from
> a null-extension. `NOT EXISTS` also has the better plan, because it can stop at the
> first match and use the child's foreign-key index; the other two must materialise.
> Self-joins are the same machinery viewed along a hierarchy, and the implicit self-join
> that `UPDATE t SET x = (SELECT ... FROM t)` performs is the reason correlated updates need
> an explicit alias to say which copy they mean. The transferable rule: express "not
> present" as an absence test, never as a negation over a value list, and add `NOT NULL` to
> the foreign key that the absence test depends on.
>

#### Further Reading

>

- [PostgreSQL — Subqueries](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-SUBQUERIES) — `EXISTS`, `IN`, `ANY`/`ALL`, the correlated forms, and how the planner treats each.
- [PostgreSQL — DELETE](https://www.postgresql.org/docs/current/sql-delete.html) — the `USING` form for multi-table deletes, which is the clearest statement of implicit self-join aliasing.
- [PostgreSQL — Query Planning: Semi-Joins](https://www.postgresql.org/docs/current/geqo.html) — why `IN` and `EXISTS` are the same query to the planner while `NOT IN` is not.
- [Use The Index, Luke — `NOT NULL` Constraints](https://use-the-index-luke.com/sql/where-clause/null/not-null-constraint) — why a `NOT NULL` declaration is the schema-level fix for the `NOT IN` trap, and what it does to the plan.
- [MySQL 8.0 — Subquery Restrictions](https://dev.mysql.com/doc/refman/8.0/en/subquery-restrictions.html) — where an engine will not even let you write the query, and what to write instead.

## Chapter 4 — Subqueries: Scalar, Correlated, IN & EXISTS

### 4.1 Four Shapes, and Only One of Them Is Really About Nesting

"Subquery" is not one thing. There are four structurally different constructs, and they
have different costs, different optimisability, and different rules about what they can
return.

```text
  1. SCALAR     must return exactly one row, one column
                WHERE total_amount > (SELECT AVG(...) FROM orders)
  2. IN / NOT IN compares a value to a value set. Quantifier semantics
                WHERE id IN (SELECT customer_id FROM orders)
  3. EXISTS     a quantifier over a row set. Two-valued logic
                WHERE EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id)
  4. DERIVED    a full table in the FROM clause, joined like any other
                FROM (SELECT customer_id, COUNT(*) n FROM orders GROUP BY 1) t
```

The most common misconception is that a subquery is a loop. It is a *relation*, and the
planner is free to convert it into a join, a semi-join, an anti-join, or a hash table —
unless doing so would change the answer.

### 4.2 Scalar Subqueries and Their Rules

A scalar subquery is a subquery in a position that expects one value. It has one
unary rule and one binary rule, and both are worth stating precisely because "return one
row" and "return at most one row" are different requirements.

```sql
-- Unary: the subquery must evaluate to exactly one row.
SELECT id, name
FROM   customers
WHERE  id = (SELECT MIN(customer_id) FROM orders);
-- → 1 row: (1, 'Ada')
-- Binary: it must evaluate to at most one row, or the query ERRORS.
SELECT id, (SELECT MAX(total_amount) FROM orders) AS biggest
FROM   customers;
-- 5 rows, each with 220.00 — legal, because MAX returns one row
--    whether the aggregate had inputs or not.
```

The `MAX` version works even though `orders` could be empty, because an aggregate over an
empty set still returns one row (with `NULL`). A version *without* an aggregate would not:

```sql
-- If two orders tie for the minimum placed_at, this ERRORS on most engines:
SELECT * FROM orders
WHERE  placed_at = (SELECT MIN(placed_at) FROM orders WHERE customer_id = 1);
-- 102 and 109 both sit on 2024-06-14 → "more than one row returned by a subquery
-- used as an expression"
```

The fix, when the tie is legitimate, is one of: `= ANY (subquery)`, which is a quantified
comparison and returns every tied row; or a window function, which is the modern answer;
or a tie-breaker added to both sides. The error is *good* — it is the engine refusing to
pick arbitrarily — and the reaction to it should be "the data has a tie I did not model",
not "let me add `LIMIT 1`".

> **INTERVIEW TRAP — "WHY DIDN'T THE ENGINE JUST PICK A ROW?"**
>
> Because "which of these two rows" is a business question and the database has no way to
> know your answer to it. `MIN(placed_at)` returning `2024-06-14` when two orders share that
> date means the subquery's *value* is well-defined but its *row* is not, and a scalar
> subquery position needs a row. Engines error rather than guess because a silent `LIMIT
> 1` would make the query's result depend on physical row order — the Chapter 1.5 problem
> arriving in a new costume. If you genuinely want one row, make the tie-breaker explicit:
> `(SELECT id FROM orders ORDER BY placed_at, id LIMIT 1)`. That is now a *decided*
> question with a stated rule, and it will give the same answer on every engine, every
> plan, and every vacuum state.

### 4.3 Correlated Subqueries and Decorrelation

A correlated subquery references a column from the query enclosing it. The word sounds
like it means "executed once per outer row", and historically that is exactly what it
meant — it is how SQL was defined before anybody worried about performance. Modern engines

un-correlate: they detect the pattern, rewrite it as a join or a semi-join, and execute it

in one pass.

```text
  you write:                          the planner may execute:
  for each row r in orders:           ONE pass:
    SELECT MAX(placed_at)             build a hash table:
    FROM orders o                     { customer_id → max(placed_at) }
    WHERE o.customer_id = r.cust      then probe it once per outer row
  ...N executions                     ...1 build + N cheap probes
```

The un-correlation has a precise precondition, and knowing it is the difference between
"subqueries are slow" and a real answer:

- The subquery must be **deterministic given the outer row's values.** No `LIMIT`, no
  `OFFSET`, no `FETCH FIRST`, no dependency on the outer row's *position* in any ordering.
- The outer reference must be on a column the planner can join on, and both sides need
  usable statistics.
- The subquery must not have side effects, and must not be `FOR UPDATE`.

So this one un-correlates, and the scalar one does not:

```sql
-- Un-correlates cleanly. One hash aggregate, then a probe.
SELECT c.id, (SELECT MAX(o.placed_at) FROM orders o
              WHERE o.customer_id = c.id) AS last_order
FROM   customers c;
-- CANNOT un-correlate: "the latest one" is per-customer by definition.
SELECT c.id, (SELECT o.id FROM orders o
              WHERE o.customer_id = c.id
              ORDER BY o.placed_at DESC LIMIT 1) AS last_order_id
FROM   customers c;
```

The second is a "greatest-n-per-group with n=1", and it is the exact shape that `LATERAL`
(§4.7) or a window function (Chapter 6) is designed for. The honest statement in an
interview is not "subqueries are slow" but "**a subquery whose value depends on the outer
row in a way that is not a simple aggregate is a per-row query, and there are two ways out
— make it a lateral join or make it a window**."

Predicting the second query's output is worth doing once:

```text
  Ada    (1)  orders 101 (06-01), 102 (06-14), 109 (06-14)  → 102 (tie, lowest id wins)
  Bruno  (2)  103 (06-02), 107 (07-04)                      → 107
  Chidi  (3)  104 (06-03), 108 (07-09)                      → 108
  Dara   (4)  105 (06-20), 106 (07-01)                      → 106
  Elin   (5)  no orders                                     → NULL
  → 5 rows: 1/102, 2/107, 3/108, 4/106, 5/NULL
```

The tie on `2024-06-14` is why `102` wins: `ORDER BY placed_at DESC LIMIT 1` has no
tie-breaker, so the engine returns whichever of the two it reaches first, and that is not
guaranteed. This query is *non-deterministic* and the data proves it.

### 4.4 `IN`, `ANY`, `ALL` and the Quantifier Family

`ANY` and `ALL` are the quantified comparison operators, and they are the general form
that `IN` and `NOT IN` are special cases of.

```sql
x = ANY (subquery)    ≡  x = first  OR x = second OR …   (same as IN)
x <> ALL (subquery)   ≡  x <> first AND x <> second AND …  (NOT IN)
x >  ANY (subquery)   →  x is greater than at least one
x >  ALL (subquery)   →  x is greater than every one of them
```

`> ALL` is the one that does real work and is genuinely hard to read, because it is a
universal quantifier written in a form that looks like a `GROUP BY` you'd forgotten. Its
classic use is the "greatest-n-per-group" written without a window function:

```sql
-- All orders at least as large as every other order of the same customer.
SELECT o1.id, o1.customer_id, o1.total_amount
FROM   orders o1
WHERE  o1.total_amount >= ALL (SELECT o2.total_amount
                               FROM   orders o2
                               WHERE  o2.customer_id = o1.customer_id);
```

Predict it, carefully — this is exactly the kind of question a screen asks, and the answer
is not the intuitive one:

```text
  Ada   (1)  {31.00, 12.50, 7.50}
           101: TRUE and TRUE and TRUE          → TRUE    → included
           102: FALSE (12.50 < 31.00)           → dropped
           109: FALSE (7.50 < 31.00)            → dropped
  Bruno (2)  {220.00, 50.00}
           103: TRUE and TRUE                   → TRUE    → included
  Chidi (3)  {37.50, NULL}                      ← the edge
           104: (37.50 >= 37.50)=TRUE  AND  (37.50 >= NULL)=UNKNOWN
                TRUE AND UNKNOWN = UNKNOWN      → dropped  ← WRONG
           108: UNKNOWN and UNKNOWN = UNKNOWN  → dropped
  Dara  (4)  {70.00, 12.00}
           106: TRUE and TRUE                   → TRUE    → included
  → 3 rows: 101, 103, 106
```

Three rows, not four. **Chidi's largest order has been silently removed** by a `NULL` on a
different order of the same customer, because `ALL` is a conjunction and one UNKNOWN term
poisons it — the same mechanism as the `NOT IN` trap in Chapter 3, arriving through a
different operator. This is the most under-reported SQL bug there is, because the query
looks obviously correct and the missing row is exactly the row you wanted.

The robust rewrites, in order of preference:

1. `>= ALL (SELECT o2.total_amount FROM orders o2 WHERE o2.customer_id = o1.customer_id
   AND o2.total_amount IS NOT NULL)` — explicit, and correct. Returns 4 rows: 101, 103,
   104, 106.
2. `NOT EXISTS (SELECT 1 FROM orders o2 WHERE o2.customer_id = o1.customer_id
   AND o2.total_amount > o1.total_amount)` — the anti-join form from Chapter 3.5. It
   ignores the `NULL` row naturally, because the `NULL` row is simply not a match, and it
   returns 4 rows including Chidi's 104.
3. A window function, which is null-safe by construction and faster. This is Chapter 6.

The decision you are making in each of those is the same one, stated differently: **does a
missing value beat every other value, lose to every other value, or disqualify the row?**
The default — disqualify, silently — is the fourth option, and nobody chooses it on
purpose.

> **MUST REMEMBER**
>
> `ALL` and `ANY` are quantifiers, so they inherit three-valued logic from the comparison
> they quantify, and a single `NULL` in the sub-select silently changes which rows qualify.
> Whenever you write a quantified comparison over a nullable column, the `NULL` is a
> decision you have not made: does a missing value beat everything, lose to everything, or
> disqualify the row? Say which, in the query, with an explicit `IS NOT NULL` — because the
> default is the fourth option, which is "disqualify the row and tell nobody".

### 4.5 The Correlated Subquery in the `SELECT` List

This is the SQL equivalent of the ORM N+1 problem, and it arrives in application code
constantly because it is the shortest way to write "and also show me a count".

```sql
-- 5 executions. Fine.
SELECT c.name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS n
FROM   customers c;
-- 50,000 executions on a 50,000-row customer list. Not fine.
SELECT c.name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS n
FROM   customers c
WHERE  c.country = 'GB';
```

The window-function replacement is a single pass and is the same shape as the correlated
subquery — which is the general lesson: **correlated scalar aggregates are windows with
extra steps.**

```sql
-- One pass, no N+1.
SELECT c.name, COUNT(o.id) AS n
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name;
-- Or, as a window, which keeps the row-level detail:
SELECT c.name,
       COUNT(o.id) OVER (PARTITION BY c.id) AS n
FROM   customers c
LEFT   JOIN orders o ON o.customer_id = c.id;
```

On this data both give Ada 3, Bruno 2, Chidi 2, Dara 2, Elin 0 — note the `COUNT(o.id)`
rather than `COUNT(*)`, because `COUNT(*)` on a `LEFT JOIN` counts the null-extended row
and reports 1 for Elin. That is the Chapter 8 aggregate-nullability trap arriving through a
join, and it is why the column you count and not `*`.

The case where the window does *not* help is a correlated subquery that is not a simple
aggregate — a top-3, a nearest-in-time row, a `MAX` of a nested aggregate. Those need
`LATERAL` or a self-join, and pretending otherwise is how a 400ms query becomes a 40-second
one at 100× the data.

### 4.6 Derived Tables and the Optimisation Fence

A subquery in `FROM` is a derived table, and it behaves like a table — which is a blessing
for readability and a curse for optimisation.

```sql
-- Legal everywhere, and the thing everybody writes.
SELECT * FROM (SELECT customer_id, COUNT(*) n FROM orders GROUP BY 1) t
WHERE n > 1;
```

The fence: an outer predicate like `WHERE n > 1` references a column of the derived table,
and the engine must materialise (or at least fully evaluate) the derived table before it
can apply the predicate. It cannot push `n > 1` down into the `GROUP BY` as a `HAVING`,
because `n` is an aggregate alias that does not exist until the grouping is done. The
correct form is to push the filter into the subquery where it belongs:

```sql
-- The filter lives at the level where n exists.
SELECT * FROM (SELECT customer_id, COUNT(*) n FROM orders
               GROUP BY 1 HAVING COUNT(*) > 1) t;
```

Fences are why the pre-aggregate fix in Chapter 2.4 is a *fence* and not merely verbose.
The good news is that modern engines push many predicates through derived tables
automatically — PostgreSQL's `subquery_pushdown` and its flattening of simple subqueries,
MySQL's derived merge optimisation — and most of the time the fence is a *documentation*
boundary rather than a performance one. It becomes a real fence when the subquery contains
anything the engine cannot flatten: a `LIMIT`, a `DISTINCT`, a set operation, a window
function, a grouping aggregate, or a volatile function. In those cases, name it with a
CTE so the boundary is explicit and reviewable (Chapter 5), rather than leaving it as an
anonymous nest that a future optimiser flag could quietly change.

> **TRADE-OFF — "SHOULD REPORT LOGIC LIVE IN A VIEW, A CTE, OR THE APPLICATION?"**
>
> In a CTE or a view when the logic is a *filter, a join, or an aggregation* — it is
> declarative, the optimiser can see through it, and the database is the only place that
> can enforce it. In the application when the logic is *presentation*: pagination metadata,
> a percentage formatted for a chart, a permission check that depends on the caller's
> identity. The condition that flips the answer is **whether the rule must be true for
> every reader of the data.** A revenue definition that lives in a Java service is a
> definition that a second service, a BI tool, and an ad-hoc `psql` session will each
> re-derive differently, and the disagreements will be found by an auditor. A "top
> customers" report that means "top by trailing-90-day revenue, excluding cancelled
> orders" belongs in a view, because four consumers will need it and none of them should
> be trusted to remember the exclusions.

### 4.7 `LATERAL`: the Join That Sees the Row on Its Left

`LATERAL` lets a subquery on the right-hand side of a join reference the row on the left.
It is the SQL-standard way to express "for each row here, run this query", and it is the
right answer to three problems this chapter has been circling.

```sql
-- For each order, its two most valuable line items.
SELECT o.id AS order_id, t.sku, t.line_total
FROM   orders o
CROSS  JOIN LATERAL (
  SELECT i.sku, i.qty * i.price AS line_total
  FROM   order_items i
  WHERE  i.order_id = o.id
  ORDER  BY i.qty * i.price DESC
  FETCH FIRST 2 ROWS ONLY
) t
ORDER  BY o.id, t.line_total DESC;
```

Predict it. Order 108 has no line items, and `CROSS JOIN LATERAL` is an inner lateral, so
**order 108 does not appear at all**:

```text
  order  lines returned
  ─────  ──────────────────────────────────
  101    (BOOK, 25.00), (PEN, 6.00)
  102    (BOOK, 12.50)
  103    (DESK, 220.00)
  104    (BOOK, 37.50)
  105    (PEN, 12.00)
  106    (LAMP, 45.00), (BOOK, 25.00)
  107    (BOOK, 50.00)
  108    ← DROPPED. inner lateral, no lines, no row
  109    (CABLE, 7.50)
  → 10 rows across 8 orders
```

That dropped row is the second trap in the query, and the fix is `LEFT JOIN LATERAL ... ON
TRUE`, which null-extends instead of dropping:

```sql
  LEFT JOIN LATERAL ( ... ) t ON TRUE   →  11 rows across 9 orders,
                                            with 108 → (NULL, NULL)
```

The same query written as a window function gives the *inner* semantics — 10 rows, 8
orders — because the window has no rows to number for order 108:

```sql
SELECT * FROM (
  SELECT i.order_id, i.sku, i.qty * i.price AS line_total,
         ROW_NUMBER() OVER (PARTITION BY i.order_id ORDER BY i.qty * i.price DESC) rn
  FROM   order_items i
) t
WHERE rn <= 2;
```

**Why `LATERAL` is faster than window-plus-filter**, which the contract for this volume
requires and which is the genuinely interesting part:

```text
  WINDOW + FILTER                     LATERAL
  ────────────────                    ──────
  1. read ALL 10 line items            1. index probe on order_items(order_id)
  2. partition them (sort or hash)    2. read only the top 2 per order
  3. compute ROW_NUMBER for all       3. stop — 10 rows here, but 2M on real data
  4. throw away rn > 2                4. no sort of the whole table
  ────────────────                    ──────

  work is O(n) over the WHOLE child table, and a sort unless
  the optimiser is lucky
```

The window version reads and ranks every row in `order_items` before discarding most of
them. The `LATERAL` version reads two rows per order, using an index on

`order_items(order_id, qty * price DESC)` if one exists, and stops. On a table with 10 rows
the difference is invisible; on one with 20 million line items and 3 million orders, the
window version sorts 20 million rows and the lateral version does 3 million index probes
returning 2 rows each. **The asymptotic difference is that the window version is O(total
lines) and the lateral version is O(orders × N).** That is why the window version is
written in every tutorial and the lateral version is written in every performance guide.
The other two problems `LATERAL` solves: a top-N-per-group with a tie-breaker the window
function cannot express (`FETCH FIRST 2 ROWS WITH TIES`, which is `RANK() <= 2` and is
*not* the same thing), and a genuinely uncorrelatable scalar subquery — the "latest order
per customer" from §4.3 — expressed as a join so the planner can drive it from an index.

#### Common Mistakes

- Expecting a scalar subquery to pick a row when the data has a tie, and "fixing" the error
  with `LIMIT 1` and thereby making the query non-deterministic
- Believing every subquery is executed once per outer row; most are un-correlated into a
  join, and the ones that are not are the ones with a `LIMIT`
- Writing a correlated scalar subquery in the `SELECT` list and shipping the N+1
- Using `>= ALL` over a nullable column and getting fewer rows than expected, with no
  explanation available from the query text
- Leaving `WHERE n > 1` in the outer query of a derived table instead of `HAVING` inside it,
  creating an optimisation fence and a readability problem
- Replacing a top-N-per-group window function with `LATERAL` for correctness and not
  noticing the `INNER` versus `LEFT` lateral distinction, which silently drops parent rows

#### Interview Questions — Subqueries & Derived Tables

**Q1. When can the planner un-correlate a subquery, and what does it do when it can?** `ADVANCED`
When the subquery's value is a pure function of the outer row's *values* — a single
aggregate with equality predicates on the outer reference, no `LIMIT`, no `OFFSET`, no
dependence on the outer row's position in any ordering, and no `FOR UPDATE`. Then
`SELECT c.name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) FROM customers
c` is semantically identical to a grouped aggregate joined back to `customers`, and the
planner rewrites it as exactly that: build a hash table of `customer_id → count` in one
pass, then probe it once per customer. The N+1 concern evaporates. A subquery with a
`LIMIT` cannot be un-correlated, because "the latest order for *this* customer" is a
per-group question that a single global ranking does not answer without a window function —
and that is the real reason windows and laterals exist rather than being stylistic
alternatives to subqueries.

**Q2. Your query has a correlated subquery in the `SELECT` list. When is it a problem and
what is the fix?** `STAFF`

It is a problem when the outer row count can grow independently of the data you are
actually reading — a filtered customer list, a paginated page, a report over a growing
table. A correlated scalar subquery in the `SELECT` list cannot be turned into a join
(each outer row needs its own value at the moment it is projected), so the engine evaluates
it once per row: 50,000 customers means 50,000 subquery executions, and the latency grows
linearly with a number the developer usually thinks of as "just the rows on this page". The
fix for a simple aggregate is a window function — `COUNT(o.id) OVER (PARTITION BY
customer_id)` — which computes every partition in one pass. The fix for a top-N or a
nearest-in-time value is `LATERAL` (this chapter) or a window function with a filter
outside (Chapter 6). The rule for review: any correlated subquery in a `SELECT` list needs a
justification in a comment naming the maximum outer row count it will be evaluated at.
**Q3. Explain why `LATERAL` beats a window function for top-N-per-group, given both return
the same rows.** `ADVANCED`

Because they do different amounts of work to get there. The window function is a *set*
operation over each partition: it must read every row in the partition, sort it (or hash
it), assign a number to every row, and only then does the outer `WHERE rn <= 2` discard
most of them. Its cost is O(total child rows) plus a sort, and it will scan and rank the
entire `order_items` table even if you want two rows from each of three orders.

`LATERAL` is a *nested-loop* operation: for each outer row it seeks into `order_items` using
an index on `order_id` and reads two rows back, stopping. Its cost is O(orders × N) with no
sort, and — this is the part that matters — it degrades gracefully with the size of the
*parent* while the window version degrades with the size of the *child*. The two are not
equivalent in intent either: `FETCH FIRST n ROWS ONLY` breaks ties arbitrarily like `LIMIT`,
while `WITH TIES` matches `RANK() <= n` and `ROW_NUMBER() <= n` is a different question
again. Same rows in the easy case, different guarantees in the hard one.

**Q4. What is an optimisation fence, and where do you meet them?** `TRICKY`

A fence is a point in a nested query where the engine cannot move a predicate further down,
so a filter that logically belongs in the inner query has to be evaluated after the inner
query is fully computed. Derived tables are the usual fence, and the most common instance is
`SELECT * FROM (SELECT ..., COUNT(*) n ... GROUP BY x) t WHERE n > 1` — the outer `WHERE`
cannot become a `HAVING`, because `n` is an aggregate alias that does not exist until the
grouping is finished. The correct form puts `HAVING` inside. Modern engines flatten many
simple subqueries and push predicates through them, so a fence is often a documentation
boundary rather than a cost, but it becomes a real cost whenever the subquery contains
anything that blocks flattening: a `DISTINCT`, a `LIMIT`, a set operation, a window
function, a grouping aggregate, or a volatile function. Naming the boundary with a `WITH`
clause makes it visible in review and lets you write `MATERIALIZED` when you genuinely
want the fence.

> **CHAPTER 4 SUMMARY**
>
> A subquery is a relation, not a loop, and the four shapes — scalar, `IN`, `EXISTS`, derived
> table — differ in how many rows they may return and in what that cardinality does to the
> outer query. A scalar subquery is unary: zero rows or more than one is an error, not a
> silent choice, which is why "ties in a `MAX()` lookup" is a runtime failure and not a
> wrong answer. A correlated subquery is re-evaluated per outer row and is un-correlatable
> only when the inner side is provably independent of it; `LIMIT` is the clause that
> deliberately breaks that proof, which is why the correlated top-N-per-group query is
> fast and the derived-table version is not. `IN` and `EXISTS` are both quantifiers, they
> agree on results for non-nullable data, and they differ sharply once nulls or large
> inputs arrive — the semi-join rewrite the planner performs means the *choice* usually
> does not matter and the *size* always does. `LATERAL` is the general form: it lets the
> inner query see the outer row, and the difference between `INNER LATERAL` and `LEFT JOIN
> LATERAL ... ON TRUE` is the difference between dropping and keeping parents that have no
> children. Where the outer side is a small set of groups and the inner side is a
> correlated scan, `LATERAL` costs O(groups x N); a window function with the same
> correlation costs O(total children). That is the whole argument for top-N-per-group
> patterns: not that the window version is wrong, but that it reads the whole table when
> the group count says you should not have to.
>

#### Further Reading

>

- [PostgreSQL — Subqueries](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-SUBQUERIES) — the four shapes, `ANY`/`ALL`, and the correlation rules stated precisely.
- [PostgreSQL — LATERAL Subqueries](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-LATERAL) — what `LATERAL` buys you over a correlated scalar subquery, and what it costs.
- [PostgreSQL — SELECT Reference: LIMIT Clause](https://www.postgresql.org/docs/current/sql-select.html#SQL-LIMIT) — the clause that defeats un-correlation, stated as a rule rather than folklore.
- [MySQL 8.0 — Subquery Optimization](https://dev.mysql.com/doc/refman/8.0/en/subquery-optimization.html) — materialisation versus `IN`-to-join conversion, with the conditions under which each is chosen.
- [Use The Index, Luke — Top N Queries](https://use-the-index-luke.com/sql/partial-results/top-n-queries) — the correlated top-N-per-group pattern, and why the same result via a window function costs a full sort.

## Chapter 5 — CTEs & Recursive Queries

### 5.1 `WITH` as a Naming Device

A non-recursive CTE is a name for a result set, scoped to one statement. That is the whole
feature, and it is worth more than it looks, because the thing it fixes is not SQL — it is
the reader.

```sql
WITH shipped AS (
  SELECT * FROM orders WHERE status = 'SHIPPED'
),
june_shipped AS (
  SELECT * FROM shipped WHERE placed_at >= '2024-06-01' AND placed_at < '2024-07-01'
)
SELECT c.name, SUM(j.total_amount) AS revenue
FROM   june_shipped j
JOIN   customers c ON c.id = j.customer_id
GROUP  BY c.name;
```

Compare with the nested-subquery form, which expresses the identical computation and is
readable only if you are the person who wrote it. The CTE version is not shorter; it is
*nameable*, and the names become the vocabulary the rest of the query — and the review — is
written in.

```text
  nested:  6 levels of parentheses, 3 aliases t1/t2/t3
  CTE:     3 named steps, each independently testable
```

Three practical properties that follow from the scoping rules, each of which is a real
review question:

- A CTE is visible to *later* CTEs in the same `WITH` clause (so it can build on itself
  left to right) and to the main query. It is **not** visible to earlier ones and **not**
  visible outside the statement. There is no session-scoped CTE.
- A CTE may be referenced once or many times. Referenced once, it is textually a subquery
  and many engines inline it. Referenced many times, PostgreSQL (before v12) and MySQL
  materialised it once by default; PostgreSQL 12+ inlines single-reference CTEs by default
  and materialises multi-reference ones.
- Recursive CTEs may not be recursive with themselves *mutually* in the portable form —
  `WITH RECURSIVE a AS (...), b AS (... FROM a ...)` works, but a true mutual recursion
  needs a `SEARCH`/`CYCLE` clause or an engine extension.

### 5.2 `WITH` as an Optimisation Tool, and Materialisation

The second, less well-known use of `WITH` is to give the planner a *name* for an
intermediate result so it computes it once. In PostgreSQL, a `MATERIALIZED` keyword makes
that explicit and unconditional:

```sql
-- Computed once, then scanned twice.
WITH per_order AS MATERIALIZED (
  SELECT order_id, SUM(qty * price) AS total
  FROM   order_items
  GROUP  BY order_id
)
SELECT c.name, SUM(p.total)
FROM   per_order p
JOIN   orders o    ON o.id = p.order_id
JOIN   customers c ON c.id = o.customer_id
GROUP  BY c.name;
```

`NOT MATERIALIZED` is the opposite instruction and is useful when you have a CTE you
*know* is cheap and single-use and you do not want the intermediate result built. The
default in PostgreSQL 12+ is "inline if referenced once, materialise if referenced more
than once", which is usually the right answer and occasionally exactly wrong.

**The trap** is that materialisation is not free and can be catastrophic:

```text
  WITHOUT materialising:          WITH MATERIALIZED on a single-use CTE:
  orders ⋈ order_items           build a full 2M-row temp table
  filter pushes into the join     then scan it once
  never materialises anything     → slower, and it evicts the cache for
  → fast                            everything else
```

The version that bites in production is a `MATERIALIZED` added during an incident to "stop
the planner doing something silly", left in a query that is then called from three places
and re-pointed at a table that grew by a factor of fifty. Materialisation is a *memory* and
*disk* decision, and it is not portable: MySQL's optimiser hints (`/*+ NO_MERGE */`,
`/*+ MATERIALIZATION */`) express the same intent in a different dialect, and SQL Server's
is `OPTION (FORCE ORDER)`, which is a different thing again.

> **TRADE-OFF — "SHOULD I MATERIALISE?"**
>
> Materialise when the CTE is expensive, is referenced more than once, and the alternative
> re-derives the same work — a filtered subset reused by two aggregates, a date spine
> joined to several fact tables. Do not materialise when the CTE is cheap and referenced
> once, because you have added a full build-and-scan plus a memory grant for nothing. The
> condition that flips the answer is almost always **row count growth**: a CTE that was
> 4,000 rows when the query was written may be 40 million now, and a plan that is fine at
> 4,000 is not fine at 40 million. Materialisation decisions age badly in a way that plain
> query decisions do not, because the plan is checked at write time and the data is not.

### 5.3 `RECURSIVE`: the Shape of Every Recursive Query

A recursive CTE is a fixed-point iteration. There is exactly one shape, and every example
is an instance of it.

```sql
WITH RECURSIVE tree (id, name, manager_id, depth, path) AS (
  -- ANCHOR: the seed. Runs once.
  SELECT id, name, manager_id, 0, ARRAY[id]
  FROM   employees
  WHERE  manager_id IS NULL
  UNION ALL
  -- RECURSIVE TERM: runs repeatedly, once per row produced last time.
  SELECT e.id, e.name, e.manager_id, t.depth + 1, t.path || e.id
  FROM   employees e
  JOIN   tree t ON e.manager_id = t.id
)
SELECT * FROM tree ORDER BY path;
```

```sql
CREATE TABLE employees (
  id         INTEGER PRIMARY KEY,
  name       VARCHAR(50) NOT NULL,
  manager_id INTEGER REFERENCES employees(id)   -- self-referencing FK
);
INSERT INTO employees (id, name, manager_id) VALUES
  (1, 'Root', NULL),
  (2, 'Aria', 1),
  (3, 'Ben',  1),
  (4, 'Cleo', 2),
  (5, 'Dan',  2),
  (6, 'Esi',  4),
  (7, 'Fay',  3);
```

Predict the output. Note that `ORDER BY path` on an `int[]` sorts lexicographically by
element, which is what makes it a *pre-order* traversal — but only because the ids are
single digits, and that is worth knowing before you rely on it.

```text
  id  name  mgr  depth  path
  ──  ────  ───  ─────  ─────────────
   1  Root  NULL    0    {1}
   2  Aria     1     1    {1,2}
   4  Cleo     2     2    {1,2,4}
   6  Esi      4     3    {1,2,4,6}
   5  Dan      2     2    {1,2,5}
   3  Ben      1     1    {1,3}
   7  Fay      3     2    {1,3,7}
  → 7 rows
```

Two things to notice. `ORDER BY path` gives pre-order — the whole subtree of Aria before
Ben — and it does so *only* because the array is compared element by element. With `id` 10
and `id` 2, `{1,10}` sorts after `{1,2}`, so a ten-level-deep path can interleave
unexpectedly; the robust form is `ORDER BY path` on a `text` path with zero-padded ids, or
`ORDER BY depth, id` if you only want level order. Second, the anchor is

`manager_id IS NULL`, so **only one root is traversed**. If the data has two roots — an
employee whose manager row was deleted, or a genuine forest — the second root and its entire
subtree are missing, silently. That is the most common production bug in recursive CTEs,
and the fix is an anchor that unions all roots.

### 5.4 Accumulating Up a Tree, and the Anchor Seeding Bug

The other thing hierarchies are always asked for is a subtree roll-up, and it exposes a
recursive-CTE bug that has nothing to do with recursion: the anchor row is produced by a
*different expression* than the recursive rows, and any column that means "accumulated so
far" must be initialised consistently in both.

```sql
-- BUG: the anchor seeds subtree_total with 0, so Root's own contribution
-- is never added to its own subtree total.
WITH RECURSIVE rollup (id, name, subtree_total) AS (
  SELECT e.id, e.name, 0::numeric FROM employees e WHERE e.manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, r.subtree_total + coalesce(o.total_amount, 0)
  FROM   employees e JOIN rollup r ON e.manager_id = r.id
  LEFT   JOIN orders o ON o.customer_id = e.id
)
SELECT * FROM rollup WHERE id = 1;     -- → 0.  Wrong; it should carry Root's own value.
-- CORRECT: the anchor seeds with the same expression the recursive term adds.
WITH RECURSIVE rollup (id, name, own, subtree_total) AS (
  SELECT e.id, e.name, coalesce(o.total_amount, 0), coalesce(o.total_amount, 0)
  FROM   employees e LEFT JOIN orders o ON o.customer_id = e.id
  WHERE  e.manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, coalesce(o.total_amount, 0), r.subtree_total + coalesce(o.total_amount, 0)
  FROM   employees e JOIN rollup r ON e.manager_id = r.id
  LEFT   JOIN orders o ON o.customer_id = e.id
)
SELECT id, name, subtree_total FROM rollup ORDER BY id;
```

`depth` is fine (0 in the anchor, `depth + 1` recursively) and `path` is fine. A
`subtree_total` seeded with a literal instead of its own contribution is a bug that shows
up on the root and nowhere else, which is why it survives testing on a hierarchy with more
than one level of data.

The alternative formulation pushes the aggregate *down* the tree instead of up it, and for
a bounded depth it is usually the better plan:

```sql
-- One self-join per level, no recursion at all.
SELECT e.id, e.name, count(d.id) AS reports
FROM   employees e LEFT JOIN employees d ON d.manager_id = e.id
GROUP  BY e.id, e.name;
-- 1→2, 2→2, 3→1, 4→1, 5→0, 6→0, 7→0
```

The flip condition is depth. Recursion carries a working queue and a set-membership test per
row; a self-join per level is `levels` optimisable passes. For a three-level org chart the
self-join wins outright; for a nine-level hierarchy of 200,000 people, recursion wins; for
an unbounded graph, only recursion is even expressible.

### 5.5 Cycles: `SEARCH`, `CYCLE`, and the Path Array

A recursive CTE with no termination guard does not detect a cycle. It iterates until the
engine's limit, which on PostgreSQL is memory and on MySQL is

`cte_max_recursion_depth` (default 1000) and produces an *error* rather than a hang — but
only after doing the work, and on a shallow cycle it produces a spectacular error message
containing a thousand copies of the same row.

Two defences, and you want both.

**The path array.** Track the ids you have visited and refuse to revisit one.

```sql
-- Suppose someone sets Cleo's manager to Esi, creating 4 → 6 → 4.
WITH RECURSIVE tree (id, name, path) AS (
  SELECT id, name, ARRAY[id] FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, t.path || e.id
  FROM   employees e
  JOIN   tree t ON e.manager_id = t.id
  WHERE  NOT e.id = ANY (t.path)          -- ← the guard
)
SELECT * FROM tree ORDER BY path;
```

With the cycle in place, the iteration reaches 4, then 6, then tries to add 4 again, finds
4 already in `{1,2,4,6}`, and stops that branch. You get 6 rows instead of 7, and row 6
(`Esi`) is the one that has the truncated path — which is the row you want to alert on,
because *it* is the one whose chain is broken.

**The `CYCLE` clause**, which does the same thing declaratively and emits a depth-ordered
breadth-first path.

```sql
WITH RECURSIVE tree (id, name, path) AS (
  SELECT id, name, ARRAY[id] FROM employees WHERE manager_id IS NULL
  UNION ALL
  SELECT e.id, e.name, t.path || e.id
  FROM   employees e JOIN tree t ON e.manager_id = t.id
) SEARCH DEPTH FIRST BY id SET ord
  CYCLE id SET is_cycle TO true DEFAULT false
  USING path
SELECT id, name, is_cycle FROM tree ORDER BY ord;
```

`SEARCH` gives you a pre-order or breadth-first ordering without hand-rolling the `path`
array. `CYCLE` gives you a boolean column that flags exactly which row closed the loop. On
data where a cycle is *possible but rare* — an org chart with self-referencing `manager_id`
written by three different HR integrations — `CYCLE` is the version that gets deployed,
because a `WHERE NOT id = ANY (path)` guard silently truncates the branch and produces a
tree that is missing a person, whereas `is_cycle = true` produces a row you can page
someone about.

> **STAFF-LEVEL CONSIDERATION**
>
> A self-referencing foreign key is a modelling decision, and it is the one that makes
> hierarchies hard. `manager_id` says "this person reports to that person" and cannot say
> "as of when" — so you cannot answer a historical question ("who did Chidi report to in
> March?") without a temporal model, and you cannot represent a dotted line, a matrix
> manager, or a project team at all. The staff-level move is to notice that the *data* is
> temporal and the *schema* is not, and to raise it before the first audit asks. The
> recursive CTE is the symptom; the effective-dated relationship table is the cure, and it
> is a Volume 6 decision wearing a Chapter 5 costume.

### 5.6 Iteration Limits, and What Happens When You Hit Them

Every engine bounds recursion, and the bounds differ in a way that turns a query that works
in staging into a query that fails in production.

| Engine | Bound | Behaviour on exceed |
| --- | --- | --- |
| PostgreSQL | memory / `work_mem` | `ERROR: recursive query cancelled after ...` or a memory-exhaustion failure — no built-in row count |
| MySQL 8 | `cte_max_recursion_depth` = 1000 (default) | `ERROR 3636 (HY000): Recursive query aborted after 1000 iterations` |
| SQL Server | `MAXRECURSION n` (default 100) | `ERROR 530: The statement terminated. The maximum recursion 100 has been exhausted` |
| Oracle | none by default, driven by optimiser | runaway until resources exhaust |

The `SQL Server` default of 100 is the one that catches people: a five-level hierarchy
works, a seven-level one does not, and the failure appears on a specific Tuesday when a
contractor is added three levels below the CEO. The habit worth forming is to set the
limit explicitly and *deliberately*, so that hitting it is a signal rather than a surprise:

```sql
-- SQL Server: state the bound you mean.
WITH RECURSIVE tree AS ( ... )
SELECT * FROM tree
OPTION (MAXRECURSION 50);
```

And to remember that a depth limit is not a correctness check. A limit stops a runaway
cycle; it does not tell you a cycle happened. Those are different failures, and only the
`CYCLE` clause or the path guard distinguishes "we stopped because we hit a wall" from
"we stopped because we were done".

#### Common Mistakes

- Anchoring on `manager_id IS NULL` when the forest has more than one root, and silently
  losing an entire subtree
- Seeding the recursive CTE's accumulator column with a literal `0` in the anchor while
  the recursive term accumulates, so the root's own contribution is missing
- Recursing with no cycle guard and no depth guard, and finding out at 1000 iterations
- Ordering by an `int[]` path and assuming it is a depth-first traversal — it is, but only
  while the array elements sort the way you expect
- Using `ORDER BY` inside a recursive CTE's non-recursive term, which is a syntax error in
  some engines and silently ignored in others
- Referencing a CTE from inside another CTE that appears *earlier* in the same `WITH`
  clause, and reading the resulting error as a scope problem rather than an ordering one

#### Interview Questions — CTEs & Recursion

**Q1. What does a non-recursive CTE actually do that a subquery does not?** `STAFF`
Two things, and only one of them is about SQL. First, it is a *name*: a derived table is
`FROM (SELECT ...) t` and you refer to it as `t`, whereas a CTE is referred to by a word
that describes its contents, which changes the query from a nesting problem into a sequence
of named steps. That is a reviewability gain, not a performance one, and it is the larger
of the two. Second, it can be referenced more than once, and depending on the engine and
the reference count it may be computed once and reused (materialised) or inlined at each
use. PostgreSQL's default since v12 is to inline single-reference CTEs and materialise
multi-reference ones, and `MATERIALIZED` / `NOT MATERIALIZED` override that. The real
question to raise in a design review is therefore never "should this be a CTE" but "does
this need to be materialised, and do I know what happens to my working memory when the
table it reads grows by a hundred times".

**Q2. Write a recursive CTE for an org chart. What are the three ways it goes wrong?** `ADVANCED`
The three ways are: (1) the anchor is `WHERE manager_id IS NULL`, which traverses only one
root — if the data has a second root, its entire subtree is missing with no error, and the
fix is an anchor that unions all roots or a `NOT manager_id IN (SELECT id FROM employees)`
form; (2) no cycle guard, so a `manager_id` that has been mis-mutated into a loop iterates
until the engine's recursion limit, and the fix is a `path` array with `WHERE NOT e.id =
ANY (t.path)` or a declarative `CYCLE id SET is_cycle`; (3) the accumulator column seeded
inconsistently — the anchor produces `0` for `subtree_total` while the recursive term
accumulates, so the root's own contribution is missing from its own subtree total, and the
fix is to seed the anchor with the same expression the recursive term accumulates *onto*.
A fourth, at the operational level rather than the logical one, is the recursion limit

itself: SQL Server defaults to 100 levels and MySQL to 1000 iterations, so a hierarchy that

worked when it was five deep fails when it is seven deep.

**Q3. When is a self-join per level better than a recursive CTE?** `TRICKY`

When the depth is small, known, and stable — which covers most real hierarchies. A
six-level self-join is six optimisable joins, each of which can use an index, and the
planner can reorder them and prune the ones that are not needed for a particular row. A
recursive CTE builds a working queue, does a set-membership test per row for cycle
detection, and generally materialises each level before moving on; it is the right tool
when the depth is *unbounded or unknown*, when the shape is a graph rather than a tree (a
shortest path, an all-pairs reachability), or when the traversal is not level-by-level at
all. The flip condition is depth: at three levels the self-join wins, at nine levels with
200,000 rows the recursion wins, and at unbounded depth only recursion is even expressible.
The honest answer also notes that both forms are usually the wrong tool for the question
"how many people report to this person" — a single self-join answers that, and no recursion
is needed for a count.

**Q4. How do you stop a recursive CTE that has entered a cycle?** `STAFF`

With a guard, and there are two levels of guard. The first is a path array: carry the ids
you have visited as an array and refuse to add one that is already in it, with `WHERE NOT
e.id = ANY (t.path)`. This truncates the branch, which is correct but silent — you get a
tree that is short one person and no indication why. The second is the standard `CYCLE`
clause, which produces a boolean column identifying exactly which row closed the loop, so
the data problem becomes a row in an alert rather than a missing node. Add a depth limit
(`OPTION (MAXRECURSION n)` in SQL Server, `cte_max_recursion_depth` in MySQL) as a backstop
against a cycle the guards somehow miss, but be clear that a limit is not a check: it stops
the runaway, it does not report it. Finally, the real fix is at the schema level — the
cycle exists because `manager_id` is unconstrained, and a `CHECK` or a periodic

cycle-detection query over the hierarchy belongs on a schedule.

> **CHAPTER 5 SUMMARY**
>
> A CTE is primarily a *naming* device: it lets a multi-stage query be written in the order
> a human reasons about it, and nothing more. Whether it also materialises is an engine
> decision you can now override in either direction with `MATERIALIZED` and `NOT
> MATERIALIZED`, and the right override is rarely "always one way" — force materialisation
> when the subquery is expensive and small, force inlining when it is a scan-driving
> predicate you want fused with the join. A recursive CTE is a different animal entirely:
> the anchor term is evaluated once and the recursive term once per iteration, unioned
> until the working set is empty, which makes the number of iterations the complexity. Two
> bugs dominate. A multi-root anchor silently produces a forest rather than a tree, and a
> cycle — which a `manager_id` hierarchy permits the moment nobody maintains it — makes the
> recursion run to the engine's limit and return no error at all. The defence is a path
> array carried in the recursive term plus a `WHERE` that rejects a node already on the
> path, or the engine's own `SEARCH` and `CYCLE` clauses, which do the same bookkeeping
> for you. The second lesson is to put the depth limit in the query rather than in the
> operator's head: a bounded hierarchy is a bounded query, and an unbounded one is a
> production incident with a stack-trace-shaped root cause.
>

#### Further Reading

>

- [PostgreSQL — Queries with Common Table Expressions](https://www.postgresql.org/docs/current/queries-with.html) — `WITH`, `RECURSIVE`, `MATERIALIZED` and `NOT MATERIALIZED`, and the one optional-column syntax that confuses everyone once.
- [PostgreSQL — Recursive Query Implementation](https://www.postgresql.org/docs/current/queries-with.html#QUERIES-WITH-RECURSIVE) — `SEARCH` and `CYCLE` clauses, the breadth-first versus depth-first knob, and the working-table model.
- [MySQL 8.0 — Recursive CTE](https://dev.mysql.com/doc/refman/8.0/en/with.html) — the `cte_max_recursion_depth` limit, and the cycle the manual warns you about by name.
- [SQL Server — WITH (Common Table Expression)](https://learn.microsoft.com/en-us/sql/t-sql/queries/with-common-table-expression-transact-sql) — a 100-iteration default that fails loudly where MySQL fails silently.
- [Use The Index, Luke — Index-Only Scans](https://use-the-index-luke.com/sql/clustering/index-only-scan-covering-index) — why a covering index is what makes a recursive term cheap, since it is re-read on every iteration.

## Chapter 6 — Window Functions

### 6.1 `OVER`: Naming a Window

A window function looks and feels like an aggregate and is not one. An aggregate collapses
many rows into one; a window function computes a value for **every** row using a defined
slice of the other rows. That single distinction is the whole chapter.

```text
  AGGREGATE                          WINDOW FUNCTION
  ─────────                          ───────────────
  GROUP BY collapses                 keeps every row
  10 rows → 5 groups                 10 rows → 10 rows, each with extra info
  one value per group                one value per row, computed from a
                                      neighbourhood of rows
  no ORDER BY needed                 ORDER BY inside OVER defines the
                                      neighbourhood
  FILTER/HAVING after                must be filtered from a level above
```

The syntax has three parts, and all three are optional.

```sql
<function>() OVER (
   [PARTITION BY expr, ...]      -- the partition: which rows are peers
   [ORDER BY expr, ...]          -- the ordering: defines peers and sequence
   [frame clause]                 -- which of the ordered rows are in scope
)
```

Without `PARTITION BY`, the entire result set is one partition — which is exactly how you
get a "running total across the whole table", and exactly how you get a wrong answer if you
meant per-customer. Without `ORDER BY`, the ordering within the partition is unspecified,
which makes `ROW_NUMBER()` **non-deterministic**: it still returns 1, 2, 3… but which row
gets which number is not guaranteed and can change between runs, between plans, and after
a `VACUUM`. This is the single most common window-function bug and it has a one-word fix.

```sql
-- Non-deterministic. Valid SQL, meaningless answer.
SELECT sku, ROW_NUMBER() OVER (ORDER BY unit_price) AS rn FROM products;
-- Deterministic, and ties are broken on purpose.
SELECT sku, ROW_NUMBER() OVER (ORDER BY unit_price, sku) AS rn FROM products;
```

### 6.2 The Default Frame, and Why It Is `RANGE`

When you supply `ORDER BY` but no frame clause, the SQL standard defines the frame as:

```sql
RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
```

Most people read that as "all rows up to and including this one" and mentally substitute
`ROWS`. That substitution is the bug. `RANGE` is **peer-aware** and `ROWS` is

**positional**, and they differ the moment the `ORDER BY` has ties — which is most of the
time, on real data, for any `ORDER BY` on a date, a price, or a status.

Here is the demonstration, on data designed to show it. Ada's three orders, two of which
share `placed_at`:

```sql
SELECT o.placed_at, o.id, o.total_amount,
       SUM(o.total_amount) OVER (PARTITION BY o.customer_id
                                 ORDER BY o.placed_at) AS running
FROM   orders o
WHERE  o.customer_id = 1
ORDER  BY o.placed_at, o.id;
```

```text
  placed_at   id  total   running (default RANGE frame)   running (ROWS frame)
  ──────────  ───  ──────  ─────────────────────────────   ─────────────────────
  2024-06-01  101  31.00  31.00                           31.00
  2024-06-14  102  12.50  51.00   ← 102 and 109 are        43.50
  2024-06-14  109   7.50  51.00   ← PEERS: the frame      51.00
                                        includes both
```

The `RANGE` version gives Ada a running total of 51.00 on *both* June rows, because
`RANGE ... CURRENT ROW` means "all rows whose `ORDER BY` value is **less than or equal to**
this row's", and both rows have the same value. The `ROWS` version gives 43.50 then 51.00,
because `ROWS ... CURRENT ROW` means "all rows up to this *position*", and 102 is the
second row.

Both are legitimate answers to two different questions. The `RANGE` version is arguably
*more* correct for a "running total by day" report, because it does not show a

half-populated bucket for a day that has two orders in it. The `ROWS` version is what you
want for a sequential running total, a difference engine, or anything where each row is a
step. **The bug is not using the default; the bug is using the default without knowing
there is one.**

The general rule, and the version worth memorising:

> With ties in the `ORDER BY` key, `RANGE` frames include *all peers* and `ROWS` frames
> include *by position*. Every tie makes them disagree. If you cannot say which one you
> want for your query, you do not yet know what the query means.

There is a third frame unit, and it is the one that produces genuinely surprising results.
`GROUPS` frames by peer *group*: `GROUPS BETWEEN 1 PRECEDING AND CURRENT ROW` means "the
previous peer group and this one".

The full frame vocabulary, and it is worth having all of it in your head:

```text
  UNBOUNDED PRECEDING      from the start of the partition
  n PRECEDING              n rows (ROWS) / n distinct keys (RANGE) before
  CURRENT ROW              this row / this key
  n FOLLOWING              n rows after
  UNBOUNDED FOLLOWING      to the end of the partition

  ROWS    — positional.  ROWS BETWEEN 1 PRECEDING AND 1 FOLLOWING
  RANGE   — value-based. RANGE BETWEEN INTERVAL '1' DAY PRECEDING AND CURRENT ROW
  GROUPS  — peer-group.  GROUPS BETWEEN 1 PRECEDING AND 1 FOLLOWING
```

### 6.3 `ROW_NUMBER`, `RANK`, `DENSE_RANK`, on Real Data

This is the question that appears in every SQL screen, and it is not answerable without
working example. Here is the data.

```sql
SELECT sku, category, unit_price FROM products ORDER BY category, unit_price DESC, sku;
```

```text
  category      sku      unit_price
  ────────────  ──────  ───────────
  BOOKS         BOOK       12.50
  BOOKS         NOVEL2     12.50
  BOOKS         ANTH        9.00
  ELECTRONICS   CABLE       3.75
  FURNITURE     CHAIR     220.00
  FURNITURE     DESK      220.00
  FURNITURE     LAMP       45.00
  STATIONERY    PEN         1.20
```

Three functions, one query shape, three different answers:

```sql
SELECT sku, category, unit_price,
       ROW_NUMBER() OVER w AS rn,
       RANK()       OVER w AS rnk,
       DENSE_RANK() OVER w AS drnk
FROM   products
WINDOW w AS (PARTITION BY category ORDER BY unit_price DESC)
ORDER  BY category, rn;
```

```text
  category      sku      price    rn  rnk  drnk
  ────────────  ──────  ───────  ──  ───  ────
  BOOKS         BOOK     12.50     1    1     1
  BOOKS         NOVEL2   12.50     2    1     1     ← tie: 12.50 twice
  BOOKS         ANTH      9.00     3    3     2     ← gap in rnk, none in drnk
  ELECTRONICS   CABLE     3.75     1    1     1
  FURNITURE     CHAIR   220.00     1    1     1
  FURNITURE     DESK    220.00     2    1     1     ← tie: 220.00 twice
  FURNITURE     LAMP     45.00     3    3     2
  STATIONERY    PEN       1.20     1    1     1
```

Now the definitions, which are the thing people get wrong under pressure:

- **`ROW_NUMBER`** — assigns 1, 2, 3, … with **no gaps and no ties**, ever. Two rows can
  never get the same number. Which of the two 12.50 books gets 1 is **arbitrary and
  unspecified** — the tie here happens to resolve to BOOK then NOVEL2, and that is an
  artefact of the physical row order, not a rule. Add a tie-breaker to the `OVER` clause if
  you care: `ORDER BY unit_price DESC, sku` makes it deterministic.
- **`RANK`** — assigns the same number to tied rows, then **skips**. After two rows tie at
  rank 1, the next row is rank 3. The total number of distinct `RANK` values equals the
  number of distinct ordering-key values.
- **`DENSE_RANK`** — assigns the same number to tied rows and does **not** skip. After two
  rows tie at rank 1, the next is rank 2.
The one-sentence version that lands: **`ROW_NUMBER` says "you are the third row";
`RANK` says "three rows are strictly better than you"; `DENSE_RANK` says "two distinct
values are better than you".**

The consequences, and these are what people actually get burned by:

```text
  "top 3 products per category, ties included"        →  WHERE RANK() <= 3
      BOOKS      → 1,2,3   = 3 rows
      FURNITURE  → 1,1,3   = 3 rows (both 220s AND the 45)
      → an arbitrary number of rows per group. Correct if you want ties.

  "top 3 products per category, exactly 3"           →  WHERE ROW_NUMBER() <= 3
      BOOKS      → 3 rows
      FURNITURE  → 3 rows
      → always exactly 3. But which of the two 220s survives is arbitrary.

  "the 2nd-highest DISTINCT price in each category"  →  WHERE DENSE_RANK() = 2
      BOOKS      → NOVEL2 (12.50) and ANTH (9.00)?  No —
      DENSE_RANK=2 → the rows whose 2nd distinct value is 12.50 → BOOK, NOVEL2 (2 rows)
      FURNITURE  → CHAIR, DESK (2 rows)
      → "second distinct price" is a genuinely different question from
        "second row", and DENSE_RANK is the only one of the three that answers it.
```

The third line is the one that generates real interviews, and it is worth being able to
articulate the difference: `ROW_NUMBER() = 2` gives you *one* row per group; `RANK() = 2`
gives you *no* rows in a group with a tie at 1; `DENSE_RANK() = 2` gives you *all* rows
holding the second distinct value. In `FURNITURE` the answers are 1 row, 0 rows, and 2 rows
respectively. Three functions, three different numbers, one table.

> **MUST REMEMBER**
>
> `ROW_NUMBER` always produces exactly N rows per partition and is non-deterministic under
> ties; `RANK` produces gaps and is deterministic; `DENSE_RANK` produces no gaps and is
> deterministic. If you want "at most N", you want `ROW_NUMBER` *with a tie-breaker in the
> `OVER` clause*. If you want "N or more, ties included", you want `RANK`. If you want "the
> Nth distinct value", you want `DENSE_RANK`. And the tie-breaker is not optional
> politeness: an `ORDER BY` on a non-unique key makes `ROW_NUMBER()` return a different
> answer after a `VACUUM`, and a paginated report built on it will show users different
> rows on different days with no code change.

### 6.4 `LAG`, `LEAD`, and the Difference Engine

`LAG` and `LEAD` are the two window functions with no analogue in aggregate SQL, and they
are the reason most people learn windows.

```sql
SELECT o.customer_id, o.id, o.placed_at, o.total_amount,
       LAG(o.total_amount)  OVER w AS prev_amount,
       LEAD(o.total_amount) OVER w AS next_amount,
       o.placed_at - LAG(o.placed_at) OVER w AS days_since_prev
FROM   orders o
WHERE  o.customer_id IN (1, 2)
WINDOW w AS (PARTITION BY o.customer_id ORDER BY o.placed_at, o.id)
ORDER  BY o.customer_id, o.placed_at, o.id;
```

Predicted output. Ada's two June orders are ordered by `id` as a tie-breaker, which is why
the gap for 109 is 0 rather than NULL:

```text
  cust  id   placed_at   total   prev    next   days_since_prev
  ────  ───  ──────────  ──────  ──────  ─────  ───────────────
     1  101  2024-06-01  31.00   NULL    12.50  NULL      ← first row, no previous
     1  102  2024-06-14  12.50  31.00    7.50  13
     1  109  2024-06-14   7.50  12.50   NULL    0        ← same day as 102
     2  103  2024-06-02 220.00   NULL   50.00  NULL
     2  107  2024-07-04  50.00 220.00   NULL  32
```

Without the `, o.id` tie-breaker, row 109's `LAG` would be `31.00` rather than `12.50`
(they are peers, and `RANGE` default framing makes the peer set ambiguous for

`LAG`/`LEAD` unless an explicit `ROWS` frame is given). This is the same §6.2 phenomenon
showing up in a different function, and it is the reason the `WINDOW` clause with an
explicit frame is worth writing out in production:

```sql
  LAG(total_amount) OVER (PARTITION BY customer_id ORDER BY placed_at, id
                          ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
```

The classic use is period-over-period comparison, and the trap is that the frame for
`LAG`/`LEAD` is the one you almost never want:

```text
  DEFAULT frame  RANGE UNBOUNDED PRECEDING … CURRENT ROW   →  LAG sees EVERY prior row
  WHAT YOU WANT  ROWS BETWEEN 1 PRECEDING AND 1 PRECEDING →  LAG sees exactly one

  With no ties these agree, which is why the bug is invisible until
  the data grows a duplicate date — and then the comparison numbers
  quietly change with no deploy.
```

Most engines document `LAG`/`LEAD` as ignoring the frame or as requiring the explicit form;
the portable and unambiguous version always states `ROWS BETWEEN 1 PRECEDING AND 1
PRECEDING` explicitly.

### 6.5 Running Totals and Moving Windows

Three shapes, three frame clauses, and they are worth having side by side because
predicting them is a standard screen question.

```sql
-- 1. Running total: everything so far. This is the default frame, stated explicitly.
SUM(total_amount) OVER (PARTITION BY customer_id ORDER BY placed_at
                        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)  AS running
-- 2. Whole-partition total: the same value on every row, no ORDER BY needed.
SUM(total_amount) OVER (PARTITION BY customer_id)                          AS lifetime
-- 3. Trailing 30-day total: a moving window with a value-based bound.
SUM(total_amount) OVER (PARTITION BY customer_id ORDER BY placed_at
                        RANGE BETWEEN INTERVAL '30 days' PRECEDING
                                 AND CURRENT ROW)                         AS trailing_30d
```

Predict #3 for Ada, because the `RANGE` semantics make it non-obvious:

```text
  Ada's orders: 101 (06-01, 31.00), 102 (06-14, 12.50), 109 (06-14, 7.50)
  A RANGE frame with a value bound includes every row whose placed_at
  is within 30 days BEFORE OR EQUAL to this row's placed_at.
  101  06-01  → rows in [05-02, 06-01]  = {101}                  → 31.00
  102  06-14  → rows in [05-15, 06-14]  = {101, 102, 109}       → 51.00   ← 109 is a PEER
  109  06-14  → same peer set                                      → 51.00
```

The third and fourth rows are the §6.2 peer problem again: because 102 and 109 share a
date, each one's frame includes the other, so the trailing total is 51.00 on both. If you
wanted a strictly sequential 30-day window you would need `ROWS` with a row count instead
of a date bound, which is a different query — a "last N orders" rather than a "last 30
days" — and the distinction is exactly the kind of thing a report requirement should nail
down and a `TICKY` question will ask about.

### 6.6 `first_value`, `last_value`, and the Useless Default

These two are the most commonly misused window functions in production code, and they fail
in a way that looks like correct data.

`first_value` works by accident. With the default frame (`UNBOUNDED PRECEDING` to
`CURRENT ROW`), it returns the first row of the partition up to the current row — which for
a frame that starts at the beginning of the partition is always the partition's first row.
So `first_value` is correct under the default and you will never notice the frame.
`last_value` is the opposite. With the same default frame, it returns the last row *of the
frame*, and the frame ends at `CURRENT ROW` — so it returns **the current row's own value**.
A `last_value` with no frame clause is a `first_value`-shaped no-op that most people read as
"the last value in the group".

```sql
SELECT c.name, o.id, o.placed_at,
       first_value(o.id) OVER w AS first_order,
       last_value(o.id)  OVER w AS last_order_default,   -- wrong
       last_value(o.id)  OVER (PARTITION BY c.id ORDER BY o.placed_at
                               ROWS BETWEEN UNBOUNDED PRECEDING
                                    AND UNBOUNDED FOLLOWING) AS last_order_correct
FROM   customers c JOIN orders o ON o.customer_id = c.id
WINDOW w AS (PARTITION BY c.id ORDER BY o.placed_at)
ORDER  BY c.name, o.placed_at, o.id;
```

Predicted output for Ada (whose two June orders are peers, so the default `RANGE` frame
makes the effect even more confusing):

```text
  name  id  placed_at   first_order  last_order_default  last_order_correct
  ────  ───  ─────────  ───────────  ──────────────────  ───────────────────
  Ada   101  2024-06-01  101          101                109
  Ada   102  2024-06-14  101          109                109   ← 102 is a peer of 109,
  Ada   109  2024-06-14  101          109                109     so RANGE pulls it in
  Bruno 103  2024-06-02  103          103                107
  Bruno 107  2024-07-04  103          107                107
  Chidi 104  2024-06-03  104          104                108
  Chidi 108  2024-07-09  104          108                108
  Dara  105  2024-06-20  105          105                106
  Dara  106  2024-07-01  105          106                106
```

Read row 2 carefully. `last_order_default` is **109 for order 102** — a value from a
*different order* — and it is wrong for the question being asked, twice over: wrong because
the frame stops at the current row, and wrong because `RANGE` then extends it to the peer
group. The two bugs compound, which is why this function produces a number that looks

plausible: it is a real order id, from the right customer, just the wrong one.

> **INTERVIEW TRAP — "WHAT DOES `last_value(x) OVER (ORDER BY y)` RETURN?"**
>
> It returns the current row's own `x`, not the last row's. The default frame is `RANGE
> BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, and `last_value` returns the last row *of
> the frame* — so with a frame that ends at the current row, the last row of the frame is
> the current row. The fix is the explicit frame `ROWS BETWEEN UNBOUNDED PRECEDING AND
> UNBOUNDED FOLLOWING`. Two things make this bug durable in production code. First, the
> wrong answer is usually *plausible* — it is a real value from the right partition, so it
> passes a spot check and fails an audit. Second, if there are ties in the `ORDER BY` key,
> the `RANGE` default frame makes it worse: every member of a peer group sees the same
> `last_value`, so the third row of a tied group reports a value from a sibling. The
> general rule: any window function whose *name* implies "look elsewhere in the partition"
> — `last_value`, `nth_value`, anything from the "end of the frame" family — needs an
> explicit frame, and the explicit frame should be `ROWS` unless you specifically want
> peer semantics.

### 6.7 Top-N-Per-Group, Three Ways

The most-requested window query. Three implementations, and the choice between them is a
performance decision with a correctness difference.

```text
  1. WINDOW + FILTER OUTSIDE      portable, one pass over the table,
                                  sorts or hashes each partition
  2. LATERAL                      O(groups × N) index seeks, no big sort
  3. QUALIFY (Snowflake, BigQuery, DuckDB)
                                  the cleanest syntax where it exists —
                                  filters windows natively
```

Number 1, the portable form:

```sql
WITH ranked AS (
  SELECT o.customer_id, o.id, o.total_amount,
         ROW_NUMBER() OVER (PARTITION BY o.customer_id
                            ORDER BY o.total_amount DESC NULLS LAST, o.id) AS rn
  FROM   orders o
)
SELECT * FROM ranked WHERE rn <= 2 ORDER BY customer_id, rn;
```

```text
  cust  id   total   rn
  ────  ───  ──────  ───
     1  101   31.00   1
     1  102   12.50   2
     2  103  220.00   1
     2  107   50.00   2
     3  104   37.50   1
     3  108    NULL   2     ← NULLS LAST puts it second, not first
     4  106   70.00   1
     4  105   12.00   2
     → 8 rows
```

Elin is absent, because she has no orders at all — window functions operate on the rows
they are given and never manufacture a row. If the report needs "every customer, with
their top 2 orders or a blank", the `LEFT JOIN` has to be there, and then the ranking
happens in the subquery *before* the join, not after.

The `NULLS LAST` in the `OVER` clause is doing real work. Order 108's `total_amount` is
`NULL`, and without it the default for `DESC` in PostgreSQL is `NULLS FIRST` — so
Chidi's largest order would rank *below* his smallest, and his "top 2" would be 104 and
108 in that order, which is defensible, but if he had three orders the third would displace
one of his real ones. Windows have their own `NULLS FIRST`/`NULLS LAST` syntax precisely
because the window's ordering is independent of the outer query's.

Number 2, the `LATERAL` form, is covered in Chapter 4 §4.7 and is the one to reach for when
the child table is large: it seeks, reads two rows, and stops, rather than reading and
ranking every child row in the database.

### 6.8 When Not to Use a Window Function

> **TRADE-OFF — "WINDOWS VS `GROUP BY`: WHEN DO I ARGUE FOR THE WINDOW?"**
>
> Argue for the window when the row you return is not the row you aggregated — when you
> need each order's total *and* the customer's total, or the current value *and* the
> running value, or the top row per group *with its neighbours intact`. The `GROUP BY` form
> gives you a new, smaller relation and you have to join it back, which costs a join and
> loses row-level columns you did not group by. Argue for `GROUP BY` when the answer is
> genuinely one row per group, because it is smaller, it supports `HAVING`, and it can feed
> a materialised view. The flip condition is a good one to state: **the window wins when
> the grain of the answer equals the grain of the input, and loses when the answer is
> coarser than the input** — because then the window is producing rows nobody asked for.
>
> Two concrete cases where the window is the wrong tool. When the frame would be the whole
> partition anyway: `COUNT(*) OVER (PARTITION BY x)` is `GROUP BY x` with extra steps,
> because it returns every row of the group rather than one, ships more rows over the wire,
> and cannot be filtered with `HAVING`. And when the outer set is huge but the answer is ten
> rows: an outer `ORDER BY ... LIMIT 10` does not stop the window, which must compute over
> all 50,000 rows before the limit applies. Narrow first, then window.

#### Common Mistakes

- Using `ROW_NUMBER() OVER (ORDER BY non_unique_column)` and getting a different answer
  after a `VACUUM`, on a different plan, or on a replica
- Assuming the default frame is `ROWS ... CURRENT ROW` when it is `RANGE`, and getting a
  peer-inclusive running total on any data with duplicate keys
- Using `last_value` with no frame clause and getting the current row's own value back,
  possibly a *peer's* value
- Ranking rows after a `LEFT JOIN` instead of before, so a customer with no orders gets a
  rank rather than being absent
- Forgetting `NULLS LAST` in a `DESC` window over a nullable measure, so nulls rank first
  and displace real rows from the top N
- Using a window where a `GROUP BY` belongs, and shipping more rows than the report needs
- Writing `LAG`/`LEAD` without an explicit frame and getting different values on the day
  two rows share an `ORDER BY` key

#### Interview Questions — Window Functions

**Q1. What is the difference between `ROW_NUMBER`, `RANK` and `DENSE_RANK`, on a concrete
data set?** `TRICKY`

Take `products` partitioned by category, ordered by `unit_price DESC`. `FURNITURE` contains
`CHAIR` at 220.00, `DESK` at 220.00 and `LAMP` at 45.00; `BOOKS` contains `BOOK` and
`NOVEL2` both at 12.50 and `ANTH` at 9.00. `ROW_NUMBER` assigns 1, 2, 3 with no gaps and no
ties — so `CHAIR` and `DESK` arbitrarily get 1 and 2, and which one is unspecified, which is
why you add a tie-breaker to the `OVER` clause. `RANK` gives both 220.00 rows rank 1 and
then jumps to 3, because two rows precede the lamp. `DENSE_RANK` gives both rank 1 and the
lamp rank 2, with no gap. In one sentence: `ROW_NUMBER` says "you are the third row",
`RANK` says "three rows are strictly better than you", `DENSE_RANK` says "two distinct
values are better than you". The consequences that matter in production: `WHERE rn <= 3`
with `ROW_NUMBER` always returns exactly 3 per group; with `RANK` it returns 3 or more
depending on ties; with `DENSE_RANK() = 2` you are asking for the second *distinct* value,
which returns 0 rows in a group with a tie at 1 — a different question entirely from "the
second row".

**Q2. Why is the default frame `RANGE`, and what changes if you use `ROWS` instead?** `ADVANCED`
The default is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, and `RANGE` is
*value-based* while `ROWS` is *positional*. A `RANGE` frame includes every row whose
`ORDER BY` key is less than or equal to the current row's key, so rows that tie on that key
— peers — are all in or all out together. A `ROWS` frame counts positions, so a peer group
is consumed one row at a time. They agree only when the `ORDER BY` key is unique. On
Ada's orders, `SUM(total_amount) OVER (PARTITION BY customer_id ORDER BY placed_at)` gives
31.00, then 51.00, then 51.00, because 102 and 109 both sit on 2024-06-14 and each peer's
frame contains the other; with an explicit `ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT
ROW` it is 31.00, 43.50, 51.00. Neither is wrong — `RANGE` is arguably the right choice
for a "running total by day" report, because it does not show a half-populated bucket for
a day with two orders. The rule to take away is that any tie in the ordering key makes the
two disagree, so you have to decide which question you are asking.

**Q3. `last_value(total_amount) OVER (PARTITION BY customer_id ORDER BY placed_at)` reports
7.50 for order 102, which is a different order's value. What is wrong and what is the
fix?** `TRICKY`

The default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`, and `last_value`
returns the last row *of the frame* — so with a frame ending at the current row, it returns
the current row's own value, not the partition's last. On Ada's rows the effect is doubled:
102 and 109 share `placed_at` 2024-06-14, so under `RANGE` they are peers and each one's
frame includes the other, so 102 reports 7.50 — the value belonging to order 109. The fix
is the explicit frame

`last_value(total) OVER (PARTITION BY customer_id ORDER BY placed_at ROWS BETWEEN
UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)`. This is why `first_value` appears to work
without a frame and `last_value` does not: a frame that starts at the beginning of the
partition already includes the first row. Any window function that implies "look elsewhere
in the partition" needs its frame stated, and it should be `ROWS` unless you want peer
semantics.

**Q4. When is `LATERAL` a better implementation of top-N-per-group than a window function
with a filter?** `ADVANCED`

When the child table is much larger than the parent, because they do different amounts of
work. The window function is a set operation over each partition: it reads every child
row, sorts or hashes the partition, assigns a number to every row, and only then does the
outer `WHERE rn <= 2` discard most of them — O(total children) plus a sort. `LATERAL` is a
nested loop: for each parent row it seeks into the child on an index, reads N rows back,
and stops — O(groups × N) with no sort of the whole table. On this book's ten line items
the difference is invisible; on a real order table with 20 million lines and 3 million
orders, the window version sorts 20 million rows and the lateral version does 3 million
index probes. There is also a correctness difference: `FETCH FIRST n ROWS ONLY` breaks ties
arbitrarily like `LIMIT`, `FETCH FIRST n ROWS WITH TIES` is `RANK() <= n` and not the same
as `ROW_NUMBER() <= n`, and `INNER LATERAL` drops parents with no children while `LEFT
LATERAL ... ON TRUE` keeps them with nulls. Same rows in the easy case, different guarantees
and different asymptotics in the hard one.

> **CHAPTER 6 SUMMARY**
>
> A window function computes a value for every row from a defined slice of its peers, and
> that slice is the whole of the semantics — most window bugs are frame bugs wearing a
> function's clothes. The default frame is `RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT
> ROW`, which means *rows that tie on the `ORDER BY` key*, not *rows before this one*; on
> Ada's two orders both dated 2024-06-14 a running total written with the default silently
> jumps to include both. `ROWS` fixes it, `GROUPS` fixes it with ties grouped
> deliberately. `ROW_NUMBER`, `RANK` and `DENSE_RANK` differ only in what they do with ties
> and each is the right answer somewhere: `ROW_NUMBER` for exactly one row per group after
> an outer filter, `RANK` when a genuine competition should leave gaps, `DENSE_RANK` when
> the gaps imply missing competitors that do not exist. `first_value` and `last_value`
> are the sharpest edge, because their answer is correct only under a frame that reaches
> the end of the partition, and nobody writes that frame by default — a `last_value` under
> the default frame is a per-row no-op. `LAG` and `LEAD` are not aggregates at all: they
> are positional lookups whose frame is irrelevant and whose `NULLS LAST` handling is not,
> which is why a "previous non-null value" needs a frame over a reorder, not a bigger
> offset. And the boundary rule from Chapter 1 returns: there is no way to filter a window
> function in the same query level, so every top-N-per-group and every "keep the row where
> rn = 1" needs a subquery or CTE above it.
>

#### Further Reading

>

- [PostgreSQL — Window Functions Tutorial](https://www.postgresql.org/docs/current/tutorial-window.html) — the worked `SUM` and `LAG` examples, including the running-versus-total distinction.
- [PostgreSQL — Window Function Calls and Frame Clauses](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-WINDOW-FUNCTIONS) — the normative grammar for `ROWS`, `RANGE` and `GROUPS`, and the default frame stated exactly.
- [PostgreSQL — Window Function Descriptions](https://www.postgresql.org/docs/current/functions-window.html) — per-function notes on `RANK`, `DENSE_RANK`, `PERCENT_RANK`, `CUME_DIST` and `NTILE`.
- [MySQL 8.0 — Window Function Descriptions](https://dev.mysql.com/doc/refman/8.0/en/window-function-descriptions.html) — an engine's own framing choices, where a different default frame is the usual surprise.
- [Use The Index, Luke — Window Functions](https://use-the-index-luke.com/sql/partial-results/window-functions) — why the `ORDER BY` inside `OVER` is a sort, and how an index that already provides that order removes it.

## Chapter 7 — Set Operations & Grouping

### 7.1 `UNION` vs `UNION ALL`, and Why the Default Is a Trap

Chapter 1 covered the bag-vs-set distinction; this is where it is spent. `UNION` is set
union and therefore removes duplicates, which requires either a sort or a hash of the whole
result. `UNION ALL` is bag concatenation and does nothing.

```sql
-- Branches that cannot overlap: same customers, different order statuses.
SELECT customer_id, id, placed_at, total_amount FROM orders WHERE status = 'SHIPPED'
UNION ALL
SELECT customer_id, id, placed_at, total_amount FROM orders WHERE status = 'PENDING';
-- 5 + 3 = 8 rows. No dedupe, no sort.
```

Because `status` is constrained to one of three values and the branches test disjoint
values, these two branches are **provably disjoint**. Using `UNION` here is not a
performance oversight; it is a misreading of the algebra that costs a hash aggregate over
the whole result for nothing.

```text
  UNION       8 candidate rows → dedupe → 8 rows     (the work was pointless)
  UNION ALL   8 candidate rows → done     → 8 rows
```

The reverse mistake is the expensive one, and it is the one that appears in financial
reports. Two branches that *can* overlap, joined with `UNION`, silently lose a row:

```sql
-- BROKEN if the branches can overlap: a customer with both a SHIPPED and a
-- PENDING order in the window appears once, not twice, and the monthly
-- total is short.
SELECT customer_id, total_amount FROM orders WHERE placed_at < '2024-07-01'
UNION
SELECT customer_id, total_amount FROM orders WHERE placed_at >= '2024-06-15'
```

`UNION ALL` is the default you should reach for and `UNION` the one you justify. The
question to ask in code review is not "is `UNION` bad" but "**can these two branches
produce the same row?**" If the answer is "no, and here is why" — disjoint status values,
disjoint date ranges, disjoint id ranges — then `UNION ALL` is the correct query, not an
optimisation. If the answer is "probably not", `UNION` is hiding a design problem in your
branches.

### 7.2 `INTERSECT`, `EXCEPT`, and Their `NULL` Behaviour

```sql
-- Customers with BOTH a shipped and a pending order.
SELECT customer_id FROM orders WHERE status = 'SHIPPED'
INTERSECT
SELECT customer_id FROM orders WHERE status = 'PENDING';
-- shipped = {1, 2, 3, 4}   (orders 101, 102, 107, 104, 106)
-- pending = {1, 3, 4}     (orders 109, 108, 105)
-- → {1, 3, 4}  Ada, Chidi, Dara.  Three rows.
-- Customers with a shipped order but no pending order.
SELECT customer_id FROM orders WHERE status = 'SHIPPED'
EXCEPT
SELECT customer_id FROM orders WHERE status = 'PENDING';
-- → {2}  Bruno: one shipped order (107) and one cancelled (103), nothing pending.
```

The interesting customer in that pair of queries is Bruno: he is the only one in the
`EXCEPT` result, because a *cancelled* order does not count as pending. Reading

`EXCEPT` as "orders that are not pending" rather than "customers who have not acted
recently" is the kind of shortcut that produces a report nobody can explain.

`EXCEPT` is the set-difference form of the anti-join, and it is genuinely useful for

reconciliation: "which of these two sources disagree". Unlike `NOT IN`, it is safe with

`NULL`s on the right side, because `EXCEPT` uses distinct-from semantics for matching
rather than a chain of comparisons:

```text
  5 NOT IN (1, 2, NULL)   →  UNKNOWN → row dropped       (Chapter 3.3)
  5 EXCEPT SELECT ... NULL →  a normal set difference, NULLs match NULLs
                              and never poison the result
```

The subtlety to know is that `EXCEPT` and `INTERSECT` compare rows with *distinct-from*
semantics (`IS NOT DISTINCT FROM`), so two `NULL`s are considered equal to each other, while
`UNION`'s dedupe also considers `NULL`s equal for the purpose of removing duplicates. All
three differ from `=` in exactly the way that makes `NULL` handling surprising, and all
three are safe in a way `NOT IN` is not. A further wrinkle: `EXCEPT` and `INTERSECT` are
*distinct* from each other, so `A EXCEPT B EXCEPT C` removes rows in both B and C, while
`A EXCEPT (B UNION C)` does the same only if B and C do not overlap. Nobody remembers this
and everybody gets it wrong once.

`INTERSECT` has higher precedence than `UNION` and `EXCEPT` in the standard, which is
another way of producing a query that means something other than what it looks like. When
in doubt, parenthesise the branches — it costs two characters and removes the question from
the review.

### 7.3 `ORDER BY` Across Branches

`ORDER BY` at the end of a set operation applies to the **combined** result, not to each
branch. This is the correct behaviour and it is exactly backwards from what people expect.

```sql
-- Orders the COMBINED 8 rows. The inner ORDER BY on placed_at is
-- not guaranteed to survive, and in several engines is an error.
SELECT * FROM (SELECT * FROM orders WHERE status = 'SHIPPED'
               UNION ALL
               SELECT * FROM orders WHERE status = 'PENDING')
ORDER BY placed_at;
```

The rules, precisely, and they are worth having straight because they are a favourite
`T` question:

- A trailing `ORDER BY` sorts the whole set operation's output. A column named there must
  come from the *first* branch's column list.
- A parenthesised `ORDER BY` inside a branch is only legal if the engine allows it; most
  allow it, and the optimiser is entitled to discard it, because the set operation's
  output has no order until you say so.
- `LIMIT` after a set operation also applies to the combined result. `… UNION ALL …
  LIMIT 10` is not "10 from each branch"; to get that you need `(SELECT … LIMIT 10) UNION
  ALL (SELECT … LIMIT 10)`, with the parentheses, and even then engines disagree about
  whether the `LIMIT` binds inside.
The general rule is that **`ORDER BY` sorts the output of the whole expression, and the
only guaranteed order is the one you can see at the top level.** Branch-level ordering is
an optimisation hint at best.

### 7.4 `GROUPING SETS`, `ROLLUP`, `CUBE`

Three ways of asking for subtotals in one query instead of three, and the reason they
exist is that the `UNION ALL` of three grouped queries re-scans the table three times.

```sql
SELECT o.status,
       date_trunc('month', o.placed_at) AS month,
       SUM(o.total_amount) AS revenue,
       GROUPING(o.status) AS is_status_total,
       GROUPING(date_trunc('month', o.placed_at)) AS is_month_total
FROM   orders o
GROUP  BY GROUPING SETS (
          (o.status, date_trunc('month', o.placed_at)),  -- detail
          (o.status),                                    -- subtotal by status
          (date_trunc('month', o.placed_at)),            -- subtotal by month
          ()                                              -- grand total
        )
ORDER  BY 1 NULLS LAST, 2 NULLS LAST;
```

Predicted output, all nine rows:

```text
  status      month     revenue   is_status_total  is_month_total
  ──────────  ────────  ────────  ───────────────  ───────────────
  CANCELLED   2024-06     220.00        0                 0
  PENDING     2024-06      12.00        0                 0
  PENDING     2024-07       7.50        0                 0
  SHIPPED     2024-06      81.00        0                 0
  SHIPPED     2024-07     120.00        0                 0
  CANCELLED   NULL        220.00        0                 1
  PENDING     NULL         19.50        0                 1
  SHIPPED     NULL        201.00        0                 1
  NULL        NULL        440.50        1                 1
  → 5 detail rows + 3 status subtotals + 1 grand total = 9
```

`GROUPING()` is the function that makes this table renderable, and it is the one people
miss. A subtotal row for `PENDING` has `month = NULL` — but a *detail* row can also have
`month = NULL` if the underlying column were nullable, and you cannot tell the two apart
by looking at the value. `GROUPING(col)` returns 1 when the column is `NULL` *because the
grouping set omitted it* and 0 when it is `NULL` because the data was null. Without it, the
report has an ambiguous row and the totals do not visibly add up.

The three variants, and the distinction is worth memorising because the row counts differ:

```text
  GROUPING SETS ((a, b), (a), (b), ())   exactly the sets you list       4 sets → 9 rows
  ROLLUP (a, b)                          (a,b), (a), ()   — a hierarchy 3 sets → 9 rows
  CUBE  (a, b)                           all 2^n combinations            4 sets → 9 rows
```

`ROLLUP` and `CUBE` only coincide for two dimensions. For three, `ROLLUP(a,b,c)` gives
`(a,b,c), (a,b), (a), ()` — four sets, a strict hierarchy — while `CUBE(a,b,c)` gives all
eight. In a report with many dimensions, `CUBE` explodes combinatorially, which is the
`SCALING REALITY CHECK` for this section: a `CUBE` over six dimensions is 64 grouping sets
and 64 aggregate computations per query, and the fix is to choose the rollup path you
actually want rather than the full cube.

### 7.5 When Grouping Sets Beat Self-Joins

The classic thing grouping sets replace is a subtotal report assembled as a `UNION ALL` of
self-joins and `CASE` expressions.

```sql
-- The 1990s way: one aggregate per report line, UNION ALL'd together.
SELECT 'detail'  AS level, status, month, revenue FROM …
UNION ALL SELECT 'by status', status, NULL,     revenue FROM … GROUP BY status
UNION ALL SELECT 'total',     NULL,     NULL,    revenue FROM …
```

This works, it is portable, and it scans the table once per branch. The grouping-sets form
computes all the levels in a single pass with a single scan, because the engine groups once
and emits a row for every group it finds in the specified sets. The trade-off is that
grouping sets are **not universally supported** — PostgreSQL, Oracle, SQL Server and
MySQL 8 all have them, and older MySQL, SQLite, and several serverless engines do not — and
that the result carries a `NULL`-for-omitted-column convention that has to be rendered
carefully, which is what `GROUPING()` is for.

The rule for a staff-level answer: **grouping sets are a performance and consistency
optimisation for a fixed set of report levels, and the thing they buy you beyond speed is
that the levels cannot disagree with each other.** Three `UNION ALL` branches can
accidentally use three slightly different filter conditions or three different `NULL`
treatments, and the totals will not add up; one grouping-sets query applies the same
`WHERE` and the same aggregates to every level, so the grand total is by construction the
sum of the details.

> **MUST REMEMBER**
>
> `UNION` removes duplicates because the relational model says a relation is a set
> (Volume 1, Chapter 3) and a set cannot contain the same tuple twice. `UNION ALL` is bag
> concatenation and is the correct default for provably disjoint branches. A trailing
> `ORDER BY` or `LIMIT` on a set operation applies to the *combined* result, never to a
> branch. And a subtotal row's `NULL` is not a data `NULL` — `GROUPING()` is the only
> reliable way to tell them apart, and without it the report's totals do not visibly add
> up.

#### Common Mistakes

- Reaching for `UNION` on branches that are provably disjoint, paying for a dedupe that
  cannot remove anything
- Reaching for `UNION ALL` on branches that *can* overlap, and shipping a double-counted
  financial total with no error
- Expecting a trailing `ORDER BY` to sort each branch, and getting a sort of the combined
  result
- Using `EXCEPT`/`INTERSECT` without parenthesising the branches and relying on precedence
  you have not checked
- Reading a subtotal row's `NULL` as data and hiding it, instead of using `GROUPING()` to
  label it as a total
- Using `CUBE` over four or more dimensions, getting 16 or 32 grouping sets, and wondering
  why the report takes four seconds
- Assembling a subtotal report from `UNION ALL` branches whose filters differ by a
  predicate, so the grand total does not equal the sum of the details

#### Interview Questions — Set Operations & Grouping

**Q1. When should you use `UNION ALL` instead of `UNION`, and how do you prove the branches
are disjoint?** `TRICKY`

`UNION ALL` whenever the branches cannot produce the same row, because `UNION` performs a
dedupe that requires hashing or sorting the whole combined result. Disjointness is provable
when a constraint makes it so: a `CHECK` constraining `orders.status` to three values plus
branches testing `= 'SHIPPED'` and `= 'PENDING'` is disjoint by construction; so are two
branches on disjoint half-open date ranges (`>= '2024-06-01' AND < '2024-07-01'` versus the
complement), or two branches on disjoint id ranges. In each case `UNION ALL` is not a
performance tweak, it is the query written correctly. The review question is therefore not
"is `UNION` slow" but "can these branches produce the same row, and if so, which one do you
want to keep" — and if the answer is that you do not know, that is a design problem in the
branches rather than a keyword choice.

**Q2. Does a trailing `ORDER BY` on a `UNION` sort each branch, or the whole result?** `TRICKY`
The whole result. The set operation is a single relational expression, and the trailing
`ORDER BY` is applied to its output, after the branches have been combined. The rows
arrive in branch order only as an accident of the execution plan, and nothing guarantees
it — which matters for pagination, because `UNION ALL … ORDER BY placed_at LIMIT 10` is
ten rows from the combined eight, and if you want ten from each branch you need two
parenthesised subqueries each with their own `LIMIT`, which some engines parse and some do
not. The same rule applies to `ORDER BY` written *inside* a branch: it is a hint that the
optimiser may discard, and it is not the order of the final output. Only the top-level
`ORDER BY` is a guarantee.

**Q3. What is `GROUPING()` for, and what breaks without it?** `STAFF`

A subtotal row produced by a grouping set has `NULL` in the columns that set omitted, and
that `NULL` is indistinguishable *in the data* from a genuine `NULL` in a detail row. So a
report showing June revenue by status with a `PENDING / NULL` subtotal row and a detail row
where `month` happened to be null are visually identical, and the totals do not visibly add
up. `GROUPING(col)` returns 1 when the column is `NULL` because the grouping set omitted it
and 0 when it is `NULL` because the value was absent, which is the only reliable
discriminator — usually used to substitute a label: `COALESCE(status, 'ALL')` for display,
`GROUPING(status)` to drive a different format for the total row. Without it you can still
get the right numbers, but the report cannot label them, and a report that cannot label its
subtotals is a report finance will not accept.

**Q4. When do grouping sets beat a `UNION ALL` of separate aggregate queries?** `ADVANCED`
When the report has several fixed levels of aggregation and the levels must agree with each
other. Three `UNION ALL` branches re-scan the table three times and, more dangerously, each
branch carries its own `WHERE` clause, its own `NULL` handling and its own expressions —
so a filter tightened in one branch and not the others produces a grand total that is not
the sum of the details, with no error. A single query with `GROUPING SETS` scans once,
applies one filter and one set of aggregate expressions, and emits a row per group per set,
so the total is by construction consistent with the details. The cost is dialect

dependence: `GROUPING SETS` is standard SQL and supported by PostgreSQL, Oracle, SQL

Server and MySQL 8, but not by SQLite or several serverless engines, and the result needs
`GROUPING()` to be renderable. It is also the wrong tool for a report whose levels are not
a known set — if the levels are dynamic, generate the branches.

> **CHAPTER 7 SUMMARY**
>
> `UNION` is set union and deduplicates because the relational model says a relation is a
> set, and `UNION ALL` is the bag-preserving union that most reports actually want — a
> distinct pass over a large result is a real cost, paid to remove duplicates the query
> never had. The consequence that catches people is scope: `ORDER BY` and `LIMIT` after a
> set operation apply to the combined result, not to any arm, and a column can only be
> ordered by if that name exists in the first arm's output. `INTERSECT` and `EXCEPT` are
> distinct operations with their own `NULL` rule — they compare with `IS NOT DISTINCT
> FROM` semantics, so a `NULL` matches a `NULL`, which is the opposite of `=` and exactly
> what "did this customer ever appear in the pending list" needs. Precedence is the other
> trap: set operations bind looser than comparison, so an `OR` in an arm without
> parentheses is parsed as `(...)` union `(...)`, not as a filter. `GROUPING SETS`,
> `ROLLUP` and `CUBE` extend `GROUP BY` from one grouping to several at once, and they
> need `GROUPING()` to tell a real `NULL` from a null the rollup produced — without it
> the subtotal row is indistinguishable from the group whose every value is null. They are
> also the wrong tool when the report's levels are not a known set: generate the branches
> and union them instead, and you get a plan you can read.
>

#### Further Reading

>

- [PostgreSQL — UNION, INTERSECT, EXCEPT](https://www.postgresql.org/docs/current/queries-union.html) — `ALL` variants, the `NULL` comparison rule, and the precedence rules in one page.
- [PostgreSQL — `GROUPING SETS`](https://www.postgresql.org/docs/current/queries-table-expressions.html#QUERIES-GROUPING-SETS) — `ROLLUP`, `CUBE`, `GROUPING SETS` and the `GROUPING()` function, with the subtotal-null problem shown rather than described.
- [MySQL 8.0 — UNION](https://dev.mysql.com/doc/refman/8.0/en/union.html) — an engine that deduplicates with a temporary table rather than a sort, and what that does to the plan.
- [SQL Server — SELECT (Transact-SQL): GROUP BY](https://learn.microsoft.com/en-us/sql/t-sql/queries/select-group-by-transact-sql) — cross-engine check, including the `ALL` aggregate that exists nowhere else.
- [Use The Index, Luke — Sorting and Grouping](https://use-the-index-luke.com/sql/sorting-grouping) — the `GROUP BY` implementations, and why a deduplicating `UNION` needs the same machinery.

## Chapter 8 — Grouping, Aggregation & `HAVING`

### 8.1 What `GROUP BY` Actually Does

`GROUP BY` partitions the bag produced by `WHERE` into groups of equal key values, and
collapses each group to one row. The three rules that follow are the ones that generate
questions.

```text
  1. The output has one row per DISTINCT combination of GROUP BY values.
  2. Every selected expression is either in the GROUP BY, or wrapped in
     an aggregate.  There is no third option.
  3. A column not in the GROUP BY and not aggregated is a coin flip:
     most engines reject it, and the ones that don't are picking a
     value from an arbitrary row in the group.
```

Rule 2 is enforced, which is one of the few genuine safety rails in SQL, and it is worth
knowing that PostgreSQL's `functional dependency` extension relaxes it in exactly one

case: if you `GROUP BY` a table's primary key, every other column of *that table* is

functionally dependent on it and may be selected bare. That is correct, not a hole, and it
is the sanctioned way to write "one row per order, with all its columns".

The version people actually write, and what it returns:

```sql
SELECT c.name, o.status, SUM(o.total_amount) AS revenue
FROM   customers c JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name, o.status
ORDER  BY c.name, o.status;
```

```text
  name    status     revenue
  ──────  ─────────  ───────
  Ada     PENDING      7.50
  Ada     SHIPPED     43.50   ← 101 (31.00) + 102 (12.50)
  Bruno   CANCELLED  220.00
  Bruno   SHIPPED     50.00
  Chidi   PENDING      NULL   ← 108's total is NULL
  Chidi   SHIPPED     37.50
  Dara    PENDING     12.00
  Dara    SHIPPED     70.00

  → 8 groups from 9 orders. Elin is absent entirely, and so is any
    (Ada, CANCELLED) group — GROUP BY does not manufacture groups for
    combinations that do not occur in the data.
```

Two things in that output are traps in waiting. `Chidi / PENDING` has `revenue = NULL`,
because order 108's `total_amount` is `NULL` and `SUM` of a set containing only `NULL`s is
`NULL`, not zero — a report that renders this as a blank or as "0" is making a decision it
did not intend. And Elin is not in the output at all, because `GROUP BY` does not
manufacture rows for absent groups; if the report needs a row per customer, the join has to
be a `LEFT JOIN` and the aggregate has to be `COUNT(o.id)` rather than `COUNT(*)`.

### 8.2 `COUNT(*)` vs `COUNT(col)` vs `COUNT(DISTINCT col)`

Three counts, three answers, and the difference is one of the most reliable sources of
off-by-one bugs in production reporting.

```sql
SELECT COUNT(*),              -- 9  — rows in the group, NULLs included
       COUNT(total_amount),   -- 8  — rows where the column is not NULL
       COUNT(DISTINCT customer_id)  -- 4  — distinct non-NULL values
FROM   orders;
```

| Form | Counts | On our data |
| --- | --- | --- |
| `COUNT(*)` | rows | 9 |
| `COUNT(col)` | rows where `col IS NOT NULL` | 8 (`108.total_amount` is `NULL`) |
| `COUNT(DISTINCT col)` | distinct non-`NULL` values | 4 customers have orders |
| `COUNT(DISTINCT col)` on a join result | distinct values, *after* fan-out | 4 — fan-out does not change the *set* |

The rule that catches people: `COUNT(*)` and `COUNT(col)` differ only when the column is
nullable, and *`COUNT(*)` is almost never what a report wants after an outer join.* The
canonical failure:

```sql
-- Claims Elin placed 1 order. She placed 0.
SELECT c.name, COUNT(*) AS orders
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name;
-- Correct:
SELECT c.name, COUNT(o.id) AS orders
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name;
-- Ada 3, Bruno 2, Chidi 2, Dara 2, Elin 0
```

`COUNT(*)` counts *rows*, and the null-extended row is a row. `COUNT(o.id)` counts rows
where `o.id` is non-`NULL`, and the null-extended row's `o.id` is `NULL`, so it is not
counted. The rule for review is: **after a `LEFT JOIN`, `COUNT(*)` is a bug and

`COUNT(right_table.pk)` is the answer.** The same argument applies to `SUM` and `AVG` on
the nullable side — they already ignore `NULL`s, which is why `SUM(o.total_amount)` on that
same join correctly gives `NULL` for Elin rather than a spurious `0`.

`COUNT(DISTINCT col)` is the other one, and it has a cost worth knowing: it cannot use a
plain index-only scan in most engines, because the engine must either sort or hash the
column's values to deduplicate them. It is the one aggregate in this chapter that can turn
a 40ms query into a 4-second one on a large table, and `COUNT(DISTINCT fk)` on a column
that is already `UNIQUE` is a query that should be rewritten as a subquery count.

### 8.3 `SUM` over Zero Rows Returns `NULL`, Not `0`

The rule, stated once and precisely: an aggregate over an empty set returns `NULL`, with
one exception — `COUNT` returns `0`, because counting nothing is a number.

```text
  SELECT SUM(total_amount) FROM orders WHERE customer_id = 5;
      Elin has no orders  →  (no rows)
      SUM over no rows   →  NULL            ← not 0
  SELECT COUNT(*) FROM orders WHERE customer_id = 5;
      COUNT over no rows →  0
```

This matters more than it looks, because `NULL` propagates silently through arithmetic:

```text
  SUM(x)          → NULL
  SUM(x) + 0      → NULL          ← adding zero does not help
  SUM(x) / 100    → NULL
  SUM(x) > 0      → NULL          ← and this is not TRUE, so a WHERE/HAVING drops the row
  SUM(x) IS NULL  → TRUE          ← this is the fix
```

The two idioms that fix it, and the choice between them is a business decision about
whether "no data" is the same as "zero":

```sql
-- "No orders means zero revenue." Explicit, and the default for a monetary report.
SELECT COALESCE(SUM(o.total_amount), 0) AS revenue
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name;
-- "No orders means unknown revenue." Keep the NULL and let the report show a blank.
-- Elin gets NULL, and a report that shows her as £0.00 is asserting something false.
SELECT SUM(o.total_amount) AS revenue
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name;
```

> **INTERVIEW TRAP — "WHAT DOES `SUM` RETURN FOR AN EMPTY SET?"**
>
> `NULL`. Not `0`, and this trips up engineers who arrive from a programming language where
> summing an empty list gives zero. The reason is that SQL's `NULL` means "not known", and
> "the sum of nothing" is genuinely not known rather than known-to-be-nothing — the
> distinction is the same one that makes `AVG` of no rows `NULL` and would make `AVG` of
> zero rows undefined in any other notation. `COUNT` is the exception, because counting
> nothing is a number: it returns `0`.
>
> The consequences are worse than the value itself, because `NULL` propagates: `SUM(x) + 0`
> is `NULL`, `SUM(x) / 100` is `NULL`, and `SUM(x) > 0` is `NULL`, which is not `TRUE`, so
> a `HAVING SUM(x) > 0` silently drops the row rather than erroring. The fix is
> `COALESCE(SUM(x), 0)`, and the *decision* behind it is a business one that should be
> written down: "a customer with no orders has zero revenue" and "a customer with no orders
> has unknown revenue" are different claims, and for a financial report the second one is
> usually the correct one — showing £0.00 for a customer you have never billed asserts a
> fact you do not have.

### 8.4 The `(null)` Bucket

`GROUP BY` treats `NULL` as a single ordinary value, and it groups all `NULL`s together.
This produces a bucket that appears in every grouped report on a nullable dimension, and it
is almost never what anyone wanted.

```sql
SELECT c.country, COUNT(*) AS customers, SUM(o.total_amount) AS revenue
FROM   customers c LEFT JOIN orders o ON o.customer_id = c.id
GROUP  BY c.country
ORDER  BY c.country NULLS LAST;
```

```text
  country  customers  revenue
  ───────  ─────────  ───────
  DE            1    270.00   (Bruno: 103 220.00 + 107 50.00)
  GB            2    133.00   (Ada 51.00 + Dara 82.00)
  NG            2     37.50   (Chidi: only 104; 108 is NULL)
  NULL          1     NULL     (Elin — the unknown bucket)
  → 4 rows. The NULL row is a real row in the result.
```

The `(null)` bucket is not a display artefact; it is a group. Elin genuinely is a
customer whose country is unknown, and grouping her with the other unknown-country
customers is defensible. What is not defensible is shipping that row into a stacked bar
chart, where it becomes a fifth category labelled "null" alongside DE, GB and NG.
The three ways to handle it, and the choice is a product decision:

```sql
-- 1. Keep the bucket, label it. Use COALESCE or a CASE for display only.
COALESCE(c.country, 'UNKNOWN') AS country
-- 2. Exclude the bucket entirely.
WHERE c.country IS NOT NULL
-- 3. Separate it out — usually the right answer for a data-quality report,
--    where the count of unknown-country customers is the finding.
SELECT COUNT(*) FROM customers WHERE country IS NULL;   -- → 1
```

The generalisation, and it is worth stating because it applies to every nullable dimension
you will ever group by: **`NULL` is a value to the `GROUP BY` and a non-value to a
comparison.** It groups, it never equals, and it is never equal to itself. Any report
dimension that can be null will grow a bucket, and someone has to decide what that bucket
means before it reaches a user.

> **PRODUCTION RELEVANCE**
>
> This one reaches users more often than any other in the chapter, because it is
> invisible in the query and obvious in the chart. A country breakdown with a fifth bar
> called "null" gets reported as a data-import bug by the business, investigated as one,
> and the actual cause — five thousand customers created through a checkout flow that never
> asked — is a product decision that predates the report by a year. The engineering response
> is not to suppress the bucket; it is to make the bucket *countable* (`SELECT COUNT(*) …
> WHERE country IS NULL` as a standing metric), so the question "how many of these are
> real?" is answerable without a SQL query, and to decide explicitly whether the reporting
> dimension is nullable at all.

### 8.5 `HAVING`, and Why `WHERE` Cannot Do It

`HAVING` is step 4 and `WHERE` is step 2, and the difference is grouping, not syntax.

```sql
-- Legal: HAVING sees the group.
SELECT c.name, SUM(o.total_amount) AS revenue
FROM   customers c JOIN orders o ON o.customer_id = c.id
GROUP  BY c.name
HAVING SUM(o.total_amount) > 100;
-- Illegal: WHERE cannot see an aggregate, because no group exists yet.
WHERE SUM(o.total_amount) > 100    -- ERROR: aggregate functions are not allowed in WHERE
```

Ada 51.00, Bruno 270.00, Chidi 37.50, Dara 82.00 → **1 row, Bruno.** The rule to state

cleanly: `WHERE` filters rows, `HAVING` filters groups, and a predicate belongs in the

earlier clause whenever it can be evaluated there — because filtering earlier reduces the
number of rows the aggregate has to process.

```text
  WHERE total_amount > 100    filters 9 rows down to 3 (103, 106, 107)
                              then groups and aggregates those 3
  HAVING SUM(...) > 100       groups all 9 rows, aggregates all 9, then
                              discards 3 of the 4 groups
```

The performance difference is real and the correctness difference is the important one. A
predicate that *can* go in `WHERE` and is written in `HAVING` still produces the same
answer for a group aggregate — but not for every aggregate:

```sql
-- Legal in HAVING, illegal in WHERE — and this is why the rule is not absolute.
HAVING COUNT(*) >= 3
```

`COUNT(*) >= 3` is a genuinely group-level condition with no row-level equivalent, so
`HAVING` is the only place it can live. That is the correct test: **move the predicate to
`WHERE` if it can be evaluated on a single row; leave it in `HAVING` if it is a statement
about the group as a whole.**

A further wrinkle worth knowing, because it produces a genuinely different answer:
`HAVING` can reference a `SELECT` alias in PostgreSQL and MySQL, and it can reference a
`GROUP BY` alias. This is not standard SQL — the standard requires repeating the expression
— but both extensions are widely relied upon. The rule for portable code is to repeat the

aggregate: `HAVING SUM(o.total_amount) > 100` rather than `HAVING revenue > 100`.

### 8.6 `FILTER`, and the Alternative It Replaces

The `FILTER` clause is the SQL-standard way to write a conditional aggregate, and it is
both more readable and, in most engines, faster than the `CASE`-inside-`SUM` idiom it
replaces.

```sql
-- The old way. Correct, and it makes the engine evaluate a CASE per row.
SUM(CASE WHEN o.status = 'SHIPPED' THEN o.total_amount ELSE 0 END) AS shipped_revenue
-- The standard way. Same result, and the engine can often skip the ELSE branch.
SUM(o.total_amount) FILTER (WHERE o.status = 'SHIPPED')                  AS shipped_revenue
COUNT(*)      FILTER (WHERE o.status = 'SHIPPED')                         AS shipped_count
COUNT(DISTINCT o.customer_id) FILTER (WHERE o.status = 'SHIPPED')        AS shipped_customers
```

```text
  Ada     101 SHIPPED 31.00, 102 SHIPPED 12.50, 109 PENDING 7.50  → shipped 43.50, n 2
  Bruno   103 CANCELLED 220.00, 107 SHIPPED 50.00                 → shipped 50.00, n 1
  Chidi   104 SHIPPED 37.50, 108 PENDING NULL                    → shipped 37.50, n 1
  Dara    105 PENDING 12.00, 106 SHIPPED 70.00                    → shipped 70.00, n 1
  Elin    (no orders)                                              → shipped NULL, n 0

  → SUM over Elin's zero rows is NULL, COUNT is 0. Both correct, and they disagree
    about what "no data" means, which is the §8.3 decision again.
```

`FILTER` is PostgreSQL and standard SQL, supported by DuckDB, Redshift and Snowflake. MySQL
and SQL Server do not have it, so the portable form remains the `CASE` version — which is
worth mentioning in an interview, because "which dialect are we writing" is a real question
with a real cost and the answer is rarely "we use one database".

`FILTER` has one subtlety of its own, and it is the same one as everywhere else: `FILTER`
is applied to the aggregate's *input*, so `COUNT(*) FILTER (WHERE o.status = 'SHIPPED')`
counts rows, while `COUNT(o.id) FILTER (WHERE o.status = 'SHIPPED')` counts non-null ids.
After an outer join, the first counts a null-extended row whose status happens to be
`NULL`… no, it does not, because `NULL = 'SHIPPED'` is not TRUE — but `COUNT(*)` with *no*
filter does. The rule is unchanged: after an outer join, count a column from the joined
table, not `*`.

#### Common Mistakes

- `COUNT(*)` after a `LEFT JOIN`, reporting one order for the customer who has none
- `SUM` over zero rows producing `NULL` and then propagating it through `+ 0` or a
  comparison, and the group silently disappearing from a `HAVING` filter
- Shipping the `(null)` grouping bucket into a chart as a category, and being reported as a
  data-import bug
- Putting a row-level predicate in `HAVING` because "it feels more correct", and paying for
  a full aggregation of rows the predicate would have removed
- `AVG` over a nullable column being quietly biased, because `AVG` ignores `NULL`s and so
  averages a different population than `COUNT(*)` suggests
- Using `SUM(DISTINCT …)` to fix fan-out and silently dropping legitimately equal values
- Believing `GROUPING()` is only for pretty output, and using a `NULL` test to detect
  subtotal rows

#### Interview Questions — Grouping & Aggregation

**Q1. What is the difference between `COUNT(*)`, `COUNT(col)` and `COUNT(DISTINCT col)`?**
`TRICKY`

`COUNT(*)` counts rows in the group, including rows where any column is `NULL`; `COUNT(col)`
counts only the rows where `col` is not `NULL`; `COUNT(DISTINCT col)` counts the distinct
non-`NULL` values. On this book's `orders` table that is 9, 8 and 4. The distinction that
produces bugs is `COUNT(*)` versus `COUNT(col)` after a `LEFT JOIN`: the null-extended row
is a row, so `COUNT(*)` reports one order for Elin, who has none, while `COUNT(o.id)`
correctly reports zero. The rule for review is that after an outer join, `COUNT(*)` is
always a bug and the count must be of a column from the joined table. `COUNT(DISTINCT)` is
also the one aggregate here that cannot use a plain index-only scan in most engines, since
it must sort or hash the values, which is why `COUNT(DISTINCT fk)` on a `UNIQUE` column
should be a subquery count instead.

**Q2. Why does `SUM` over zero rows return `NULL`, and what is the right fix?** `TRICKY`
Because `NULL` means "not known" and the sum of nothing is genuinely not known rather than
known-to-be-zero; `COUNT` is the exception, because counting nothing *is* a number and
returns `0`. The propagation is the painful part: `SUM(x) + 0` is `NULL`, `SUM(x) / 100` is
`NULL`, and `SUM(x) > 0` is `NULL`, which is not `TRUE`, so a `HAVING SUM(x) > 0` silently
drops the group rather than erroring. The fix is `COALESCE(SUM(x), 0)` — but the choice
between that and keeping the `NULL` is a business decision, not a technical one. A customer
with no orders has zero revenue or unknown revenue depending on whether you have ever
billed her, and for a financial report the second is usually correct: rendering `NULL` as
£0.00 asserts a fact you do not have.

**Q3. A grouped report has a bar labelled "null". What is it, and what should you do?**
`STAFF`

It is the `(null)` bucket: `GROUP BY` treats `NULL` as a single ordinary value and groups
every `NULL` together, so a nullable dimension always grows a group whose label is null. In
this book's data it is Elin, the one customer with no `country` recorded. It is a real group
and deleting it from the query loses information — the count of customers with an unknown
country is usually a data-quality metric somebody should be watching. The mistake is
letting it reach a chart as a fifth category, where it becomes indistinguishable from DE,
GB or NG. The three handles: `COALESCE(country, 'UNKNOWN')` to label it for display,
`WHERE country IS NOT NULL` to exclude it when the dimension must be populated, and a
standing `SELECT COUNT(*) FROM customers WHERE country IS NULL` metric so the bucket is
visible as a number rather than discovered as a bug. Note that `NULL` is a value to
`GROUP BY` and a non-value to a comparison — it groups, it never equals, and it is never
equal to itself.

**Q4. When should a predicate go in `WHERE` rather than `HAVING`, and when is that
impossible?** `STAFF`

When the predicate can be evaluated on a single row, it belongs in `WHERE`, because
`WHERE` is step 2 and `HAVING` is step 4: filtering before grouping means the aggregate
processes fewer rows, and for a large table that is the difference between scanning nine
rows and scanning nine million. It is impossible when the predicate is a statement about
the group as a whole — `HAVING COUNT(*) >= 3` has no row-level equivalent, and neither does
"the sum of this group exceeds the sum of all groups". The test is exactly that: could
this predicate be true or false for an individual row, or does it only mean something
about the set? A subtlety worth raising in a senior answer is that the choice is not
always answer-preserving — `HAVING SUM(x) > 100` and `WHERE x > 100` are different queries
with different meanings, since the first asks whether the group total exceeds 100 and the
second asks whether every row does. A common portability note: `HAVING` can reference a
`SELECT` alias in PostgreSQL and MySQL, but not in standard SQL, so portable code repeats
the aggregate expression.

> **CHAPTER 8 SUMMARY**
>
> `GROUP BY` collapses the bag to one row per distinct key combination, and everything
> subtle about aggregation follows from that one sentence. It does not manufacture groups:
> a key that appears in no row produces no output row, so "show every customer and their
> order count" is an outer-join problem, not a `GROUP BY` problem. `COUNT(*)` counts rows,
> `COUNT(col)` counts rows where the column is not null, and `COUNT(DISTINCT col)` counts
> values — three different numbers that a single unlabelled `COUNT` in a report makes
> indistinguishable. `SUM` over zero rows is `NULL`, not zero, so a total that is
> legitimately zero and a total for which no rows existed look identical downstream; `COALESCE`
> at the aggregation is the fix, and putting it in the view rather than in every consumer
> is the actual decision. `GROUP BY` also creates a bucket for `NULL` keys, which is
> correct under the standard and surprising to anyone who reads `WHERE country = 'GB'` as
> "a row per country". `HAVING` is `WHERE` one level up: it filters groups, and it is the
> only place a condition on an aggregate can be written — but because it runs after
> grouping, it cannot reduce the input the aggregate saw, so an aggregate-friendly predicate
> belongs in `WHERE` and is a performance decision as much as a correctness one. `FILTER`
> is the clean answer when you want a conditional aggregate instead of a second `GROUP BY`.
> And the discipline that makes all of it reviewable: write the grain of the result as a
> sentence before you write the `GROUP BY`.
>

#### Further Reading

>

- [PostgreSQL — Aggregate Functions](https://www.postgresql.org/docs/current/functions-aggregate.html) — the full set, the `FILTER` clause, and the ordered-set aggregates.
- [PostgreSQL — GROUP BY Clause](https://www.postgresql.org/docs/current/sql-select.html#SQL-GROUPBY) — the normative statement of what grouping guarantees, including the `NULL` bucket.
- [PostgreSQL — Aggregate Expressions](https://www.postgresql.org/docs/current/sql-expressions.html#SYNTAX-AGGREGATES) — how aggregates compose inside expressions, and where they may not.
- [MySQL 8.0 — Aggregate Function Descriptions](https://dev.mysql.com/doc/refman/8.0/en/aggregate-functions.html) — the per-function quirks, including where a bare `NULL` is returned rather than zero.
- [Use The Index, Luke — `NOT NULL` Constraints](https://use-the-index-luke.com/sql/where-clause/null/not-null-constraint) — why a missing `NOT NULL` on the counted column can cost you the `count(*)` plan.

---

### End of Volume 3

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- State the logical evaluation order of a `SELECT` and use it to explain why a `SELECT`
  alias is illegal in `WHERE` but legal in `ORDER BY`
- Take any `LEFT JOIN` with a predicate on the nullable side and explain, in terms of the
  pipeline, why it is an inner join — and rewrite it in `ON` without losing the unmatched
  rows
- Predict the row set of a five-table join on a known dataset, including which rows a
  `LEFT JOIN` manufactures and which an inner join drops
- Explain why join fan-out multiplies a measure, diagnose it with `COUNT(*)` versus
  `COUNT(DISTINCT …)`, and fix it by pre-aggregating the finer-grained table
- Choose correctly between `NOT EXISTS`, `NOT IN` and `LEFT JOIN … IS NULL`, and explain the
  three-valued-logic failure that makes `NOT IN` return an empty set
- Write a correlated subquery, say when the planner can un-correlate it and when a `LIMIT`
  prevents it, and say when a window function or a `LATERAL` is the better tool
- Write a recursive CTE with a cycle guard or a `CYCLE` clause, and state what its anchor
  and its iteration limits are on the engine you work on
- Distinguish `ROW_NUMBER`, `RANK` and `DENSE_RANK` on a data set with ties, and state why
  the default window frame is `RANGE` and what changes when you use `ROWS`
- Use `FILTER` or a conditional aggregate, and explain what a `NULL` country bucket and a
  `SUM` of zero rows mean and how to choose between `0` and `NULL`

### Coming in Volume 4 — Indexes, Query Planning & Execution

This volume was about what SQL *means* — the order it evaluates in, the rows each operator
produces, and the shape of the answer. It deliberately never asked why a query is slow,
because the answer was always "ask the planner". Volume 4 is that answer. It opens the B+
tree and follows a single `SELECT` from parse to plan to execution, covering index types,
composite key order and the leftmost-prefix rule, the four access paths and when each is
chosen, the three physical join algorithms and the row-count estimates that pick between
them, and how to read an `EXPLAIN` plan well enough to see the gap between what the
optimiser believed and what the data actually did.

The order matters because this volume's bugs were all *semantic* — the query was never
asking for the right rows, so no amount of indexing would have helped. Volume 4's bugs are
the opposite: the query is correct and the route is wrong, which means the diagnostic
skill is entirely different. Having finished this one, you should be able to say precisely
what a query is asking for; the next volume is about being able to say what it is doing.

## Chapter 9 — Interview Scenario Bank

This bank uses four prefixes, and the prefixes tell you what is being tested:

- **P** — production situation: something broke, or would have broken, and you are asked what
  you would do
- **T** — predicted behaviour: given this exact query and this exact data, what comes back,
  and how many rows
- **S** — code-review question: here is SQL somebody shipped, what is wrong with it
- **D** — design trade-off challenge: two defensible answers, pick one and defend the
  boundary
`D` numbers run continuously across the whole bank. `P`, `T` and `S` restart at 1 in each
subsection.

This volume's bank is weighted toward `T`, and that weighting is a deliberate departure
from the rest of the set, so it is worth justifying. A SQL screen is not usually a design
conversation — it is an interviewer reading a query aloud and asking "how many rows come
back, and what are they". That question cannot be answered from principles; it can only be
answered by simulating the pipeline over a known dataset, which is a *separate skill* from
knowing that `LEFT JOIN` nullifies a `WHERE`. Engineers routinely know every rule in this
volume and still cannot predict a five-row result without running it, which is why the
failure mode in production is a confident, plausible, wrong number rather than an exception.
The `T` questions below are therefore all answerable by counting rows in the seed dataset
from Chapter 1 without executing anything, and the counts are stated so you can check
yourself. The `D` questions carry the rest of the weight in the bank, and they are where
this volume's material is genuinely a design question rather than a prediction.

Every `T` question below runs against the dataset in §1.1: five customers (Ada 1, Bruno 2,
Chidi 3, Dara 4, Elin 5 with `country` NULL), nine orders (101–109, with 108 having no
items and a `NULL` total, and 102 and 109 both Ada's on 2024-06-14), ten line items, and
eight products. Order totals are 101 = 31.00, 102 = 12.50, 103 = 220.00, 104 = 37.50,
105 = 12.00, 106 = 70.00, 107 = 50.00, 108 = NULL, 109 = 7.50. Sum of all totals = 440.50.

### Evaluation Order

**T1.** `SELECT o.id, o.total_amount * 1.2 AS gross FROM orders o ORDER BY gross DESC LIMIT 3;` — how many rows, and which? `TRICKY`
Three rows: 103 (264.00), 106 (84.00), 107 (60.00). The query is legal because `ORDER BY`
is step 6 and the alias `gross` is minted at step 5, so the alias exists by the time the
sort runs. This is the asymmetry that confuses people: the identical alias in `WHERE` is a
syntax error, because `WHERE` is step 2 and the value it names has not been computed. Note
also that order 108 is absent from consideration entirely — `NULL * 1.2` is `NULL`, which
sorts last under PostgreSQL's `DESC` default of `NULLS FIRST`… in fact `NULLS FIRST` puts
it *first* on a `DESC` sort, so if 108 had a non-null total it would have topped this list;
it does not, because the row's `total_amount` is `NULL` and the ordering here is on the
computed `gross`, which is `NULL` for 108 and therefore sorted according to the engine's
`NULLS` rule. This is a good question to ask yourself: what *is* the `NULLS` default for a
`DESC` sort, and does it apply to the expression or the column?

**T2.** The same query with `WHERE gross > 50` added. What happens, and what is the error
actually telling you? `TRICKY`

It is a syntax error: `column "gross" does not exist`. The message is not about naming
conventions; it is the engine reporting that at the point `WHERE` is evaluated, no value
named `gross` has been produced. The three fixes, in increasing order of usefulness, are to
repeat the expression (`WHERE o.total_amount * 1.2 > 50`), to wrap the query in a derived
table or CTE so the inner `SELECT` mints the alias and the outer `WHERE` filters it, or to
move the computed value into a generated column or expression index so the base table
carries it. The interview point is that the wrapping form is not a syntactic dodge — it is
the honest description of a two-stage question, and its cost is that it is an optimisation
fence that blocks the outer predicate from reaching the base table's indexes.

**T3.** `SELECT c.name, COUNT(*) AS n FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY n DESC LIMIT 1;` — what comes back? `STAFF`
One row: **Ada, 3**. Ada genuinely has three orders, so this is right by luck rather than by
design. The counts are Ada 3, Bruno 2, Chidi 2, Dara 2, Elin 1 — and Elin's 1 is the
`COUNT(*)` trap: the null-extended row is a row, so `COUNT(*)` reports one order for a
customer with none. Change it to `COUNT(o.id)` and the result is Ada 3, Bruno 2, Chidi 2,
Dara 2, Elin 0, and the top row is still Ada, which is why this bug survives review. The
follow-up worth asking yourself is what would make the *bottom* of this list the wrong
answer — a report of "inactive customers", where Elin would appear with 1 and be excluded
from a reactivation campaign that should have included her.

**T4.** `SELECT status, SUM(total_amount) AS rev FROM orders GROUP BY status HAVING SUM(total_amount) > 50 ORDER BY rev DESC;` — rows and values? `STAFF`
Two rows: CANCELLED 220.00 and SHIPPED 201.00. PENDING sums to 19.50 (12.00 + NULL + 7.50
— `SUM` skips the `NULL`, and a group containing only one non-null value is not an empty
group, so there is no `NULL` result here) and is filtered by the `HAVING`. The

`HAVING` can reference the aggregate because `HAVING` is step 4 and grouping happened at
step 3; the identical predicate in `WHERE` would be a syntax error, because `WHERE` is
step 2 and no group exists yet. Note that `HAVING` could also have been written against
the alias `rev` in PostgreSQL and MySQL, which is a non-standard extension worth naming if
you are asked about portability.

**T5.** `SELECT DISTINCT status FROM orders ORDER BY status LIMIT 2;` — how many rows, and
which? `TRICKY`

Two rows: PENDING and SHIPPED. `DISTINCT` is applied to the three statuses

(CANCELLED, PENDING, SHIPPED) before `ORDER BY` sorts them and before `LIMIT` takes two, so
the two returned are the first two alphabetically. The reason this is worth predicting is
that `DISTINCT` is a global uniqueness requirement on the whole output row, not a filter
on one column — `SELECT DISTINCT status, customer_id` would return nine rows, because every
row is unique. And `DISTINCT` has a real cost (a hash or a sort of the whole result) that
`GROUP BY` at the same grain does not, which is why `GROUP BY` is the better tool for
"one row per group".

**P1.** A nightly job writes a CSV of customers with no orders in the last 90 days. It
worked for a year and now returns an empty file, with no error in the logs. What is your
first hypothesis and what do you check? `SCENARIO`

First hypothesis: `NOT IN` over a nullable column. The classic form of this job is
`WHERE c.id NOT IN (SELECT customer_id FROM orders WHERE placed_at >= ?)` and if the inner
`placed_at` filter ever admits a row with a `NULL` `customer_id` — a guest order, an
import, a soft-deleted customer — the entire result becomes empty, permanently, with no
error, because `NOT IN` is a negated chain of comparisons and one `UNKNOWN` term makes the
conjunction never `TRUE`. The check is one query: `SELECT count(*) FROM orders WHERE
customer_id IS NULL`. The fix is `NOT EXISTS`, which is a quantifier and therefore
two-valued, and is immune. The prevention is a `CHECK (customer_id IS NOT NULL)` on
`orders`, so the data problem that exposed the bug cannot recur — and treating the `NOT IN`
as a code smell in review, because the failure is silent and total rather than partial.
**S1.** Review this query, which a developer says "returns the top 10 customers by
revenue": `SELECT c.name, SUM(o.total_amount) FROM customers c JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY 2 DESC LIMIT 10;` — what would you say? `STAFF`
It works, and the review comments are not about this query. Two things. First, it uses an
inner join, so Elin is excluded — which is correct *here*, because a customer with no
orders has no revenue, and it is the wrong choice in the near-identical query that adds a
`LEFT JOIN` in order to show her. Worth saying explicitly that the join type is a
decision and not a default, and that this one happens to be right. Second, and this is the
real comment: this is the exact shape of the fan-out bug, and the day someone adds
`JOIN order_items` to get a line count, the sum silently multiplies by each order's line
count and the dashboard is wrong by 60%. The review comment should name the grain — "one
row per customer, `orders.total_amount` is order-grain" — so the next change has to confront
it. Also worth mentioning: `ORDER BY 2` on an unnamed expression is legal but fragile,
since a column insertion renumbers it; `ORDER BY SUM(o.total_amount)` or an alias is
better, and the *outer* `LIMIT` needs a deterministic tie-breaker if two customers can tie.
**D1.** A team wants a single "customer 360" query returning the customer row plus order
count, lifetime value, last order date and last order id. Some engineers want four scalar
subqueries in the `SELECT` list; others want a `LEFT JOIN` to a pre-aggregated derived
table; others want a window function. Which do you pick, and where is the boundary? `STAFF`
The boundary is whether the four values are all *aggregates* or whether one of them is a
row. Order count and lifetime value are aggregates and are best as a pre-aggregated derived
table joined back — one hash aggregate over `orders`, one probe per customer, no N+1. Last
order *date* is also an aggregate and can live in the same derived table. Last order *id*
is not an aggregate: it is the identity of the row that has the maximum date, and getting
it requires either a `LATERAL` join with `ORDER BY placed_at DESC, id LIMIT 1` or a window
function with a filter outside. So the honest answer is that the correct query mixes two
techniques, and the design point is that the *derived table* is what stops the aggregate
subqueries becoming an N+1, while the `LATERAL` is what handles the non-aggregate. The
argument for four scalar subqueries — simplest to read, one statement, no joins — holds only
while the customer count is small and bounded, and it should be stated with that bound
attached rather than asserted.

### Joins & Fan-Out

**T1.** `SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.status = 'SHIPPED';` — how many rows and which names? `TRICKY`
Four rows: Ada, Bruno, Chidi, Dara. Elin is gone, and the `LEFT JOIN` was an inner join.
Mechanically: the `LEFT JOIN` correctly produces ten rows including Elin with a null-extended
right side, then `WHERE o.status = 'SHIPPED'` evaluates to `UNKNOWN` for that row — because
`NULL = 'SHIPPED'` is `UNKNOWN` — and `WHERE` admits only `TRUE`, so the row is discarded.
Ada and Dara each appear once despite having shipped orders plus a pending one, which
reminds you that a join filters pairs and does not deduplicate the left side unless you
asked for it. The fix, if Elin is wanted, is to move the predicate into `ON`.

**T2.** The same query with the predicate moved: `... LEFT JOIN orders o ON o.customer_id = c.id AND o.status = 'SHIPPED'` — now how many rows? `STAFF`
Five rows: Ada, Bruno, Chidi, Dara, and Elin with `o.status` NULL. `ON` is evaluated as
part of producing the join and before the null-extension, so it restricts *which orders may
match* rather than filtering the joined result. Elin has no shipped orders, so nothing
matches, and she is null-extended — which is exactly the intent. The same five rows come
from pre-filtering the right table in a subquery, and from a `GROUP BY` with a conditional
aggregate, and the choice between them is about which one the next reader will understand.
**T3.** `SELECT COUNT(*) FROM customers c LEFT JOIN orders o ON o.customer_id = c.id;` — the
answer surprises people. What is it? `TRICKY`

Ten. Five customers and nine orders produce ten rows: eight customers contribute their own
order counts (3 + 2 + 2 + 2 = 9 rows) and Elin contributes exactly **one** null-extended
row, not nine. A `LEFT JOIN` emits one null-extended row per unmatched left row; it does not
cross-join the unmatched side. People expect 5 + 9 = 14 or 5 × 9 = 45, and both are wrong.
The internal-join version of the same query returns 9, which is the row-count difference
that distinguishes the two join types on this data.

**T4.** `SELECT SUM(o.total_amount) FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items i ON i.order_id = o.id WHERE c.name = 'Ada';` — the sum, and what it
should be? `ADVANCED`

The query returns **82.00**. The correct figure is **51.00** (31.00 + 12.50 + 7.50). The
join to `order_items` turns an order-grain row into a line-grain row, so order 101's total
of 31.00 is counted once for line 1001 and again for line 1002, giving

25.00 + 6.00 + 12.50 + 7.50 = 51.00 for the *line* values but 31.00 + 31.00 + 12.50 + 7.50
= 82.00 for the *order* values being summed. The fix is to pre-aggregate `order_items` to
order grain before joining, so the join is one-to-one at the measure's grain. Two detective
queries confirm the diagnosis: `COUNT(*)` versus `COUNT(DISTINCT o.id)` gives 4 versus 3,
and `SUM(DISTINCT o.total_amount)` happens to give 51.00 — but that is a coincidence of
this data, since Ada's totals are all distinct, and it would silently drop a real order if
two of hers ever totalled the same amount.

**P1.** A finance report of revenue by country has been quietly wrong since a dashboard
redesign three months ago. The SQL joins `customers` to `orders` and to `order_items` in
one query, grouping by country. Nothing throws and the plan looks clean. Walk me through
what you do in the first hour. `SCENARIO`

Establish the *shape* of the error before anything else: is the number too high or too
low, and does the inflation correlate with anything? A too-high number that scales with
line-item counts is fan-out, and the confirmation is to run the same grouping with
`COUNT(DISTINCT o.id)` against `COUNT(*)` and to check whether the ratio tracks average
lines per order. Then look at the redesign diff specifically for a newly added join — that
is where the change is. The root cause will be a measure aggregated at one grain after a
join at a finer one, and the fix is to pre-aggregate `order_items` to order grain in a CTE
and join that. Prevention is the unglamorous one that actually works: state the grain in a
comment on every table and make "does this query fan out?" a line in the query review
template, because no amount of code review catches this reliably by eye.

**S1.** This query is in production and returns the wrong number: `SELECT c.country, SUM(i.qty * i.price) AS revenue FROM customers c JOIN orders o ON o.customer_id = c.id JOIN order_items i ON i.order_id = o.id WHERE o.status <> 'CANCELLED' GROUP BY c.country;` — what is wrong, and is it
the same bug? `STAFF`

It is a *different* bug, and that is what makes it worth asking. The measure is

`i.qty * i.price`, which is line-grain, so summing it after joining to line grain is
correct — there is no fan-out here. What is wrong is the `WHERE o.status <> 'CANCELLED'`
combined with the fact that this is an inner join: a customer with no non-cancelled orders
disappears from the report entirely rather than appearing with zero, and Elin disappears
because she has no orders at all. The same is true at a subtler level for the `NULL`
country bucket: it appears in the result as a group and is probably rendering as a
category in a stacked chart. The review comment is therefore about the join type and the
`NULL` bucket, not about fan-out — and the general point is that "is this the fan-out bug?"
has the answer "no" often enough that you have to check which measure lives at which
grain rather than reaching for the same diagnosis every time.

**D2.** A report needs lifetime value per customer on every page of a paginated list. The
three options are a denormalised `lifetime_value` column maintained by triggers, a
materialised view refreshed nightly, or computing it in the query with a correlated
aggregate. Which, and what flips the answer? `STAFF`

Compute it in the query first, because the customer count is small enough and the
requirement is one number per customer — a single hash aggregate over `orders` joined back
to the page's customers is cheap and always correct. The flip condition is *write volume
against read volume*, and it is the only one that matters. If lifetime value is read on
every page of every request across a large read fleet and the orders table is in the
hundreds of millions, the aggregate becomes a repeated large scan, and a denormalised
column maintained by a trigger becomes correct — at the cost of making every `orders`
insert pay for it and putting a consistency mechanism on the write path that will
eventually drift. A materialised view is the middle option: cheap reads, bounded staleness
by the refresh interval, and a refresh that has to be monitored because it is silently
stale with no error. The staff-level framing is that all three are answers to "how many
times does this number have to be right, and how often is it read", and the answer should
name the staleness window each option can promise, because "nightly" and "trigger, so never"
are different contracts with different consumers.

### Anti-Joins & Missing Rows

**T1.** `SELECT name FROM customers WHERE id NOT IN (SELECT customer_id FROM orders);` — rows
and names? `STAFF`

One row: Elin. Customers 1 through 4 all appear in `orders.customer_id`, and customer 5
does not. This is the correct answer, and it is also the answer that will change without
warning. The predicate is a negated chain of comparisons —

`5 <> 1 AND 5 <> 1 AND 5 <> 2 AND … AND 5 <> 4 AND 5 <> 1` — all `TRUE`, so the row
passes.

**T2.** Someone inserts `INSERT INTO orders (id, customer_id, placed_at, status, total_amount) VALUES (110, NULL, '2024-07-20', 'PENDING', 5.00);` and reruns T1. What happens, and
what is the general rule? `TRICKY`

Zero rows. The sub-select now contains a `NULL`, so the chain ends with `5 <> NULL`, which
is `UNKNOWN`, and `TRUE AND UNKNOWN` is `UNKNOWN`, which is not `TRUE`, so the row is
dropped — and every other customer was already dropped for having orders. The general rule
is absolute: **one `NULL` anywhere in a `NOT IN` sub-select makes the entire result set
empty, for every outer row, permanently, with no error.** It is not partial and not
row-dependent. The fix is `NOT EXISTS`, which asks "did any row satisfy this predicate"
rather than "did every comparison hold": the `NULL` row simply fails `o.customer_id = 5`,
so it is not a match, and one non-match is all `NOT EXISTS` needs. The secondary fix,
`NOT IN (SELECT customer_id FROM orders WHERE customer_id IS NOT NULL)`, is correct but
suppresses the data problem you just discovered rather than surfacing it.

**T3.** `SELECT c.name FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE o.id IS NULL;` — rows? And is it as safe as `NOT EXISTS`? `TRICKY`
One row, Elin. But it is *not* as safe. The test is `o.id IS NULL`, and `id` is the primary
key, so it can never be `NULL` in a real row — which is what makes this spelling correct
*on this schema*. Change the join to a table whose join key is nullable — an

`order_items.sku` that is optional, a `last_seen_at` timestamp — and a *matched* row whose
`sku` happens to be `NULL` will also satisfy `sku IS NULL` and be reported as unmatched.
`NOT EXISTS` has no such failure mode, because it never tests a value for `NULL`; it tests
whether a match exists. Use `NOT EXISTS` by default, and keep the `LEFT JOIN … IS NULL` form
only when you also need the right-side columns for the rows that *do* match.

**T4.** `SELECT customer_id FROM orders WHERE total_amount >= ALL (SELECT total_amount FROM orders WHERE customer_id = 3);` — how many rows, and
which customers? `ADVANCED`

Three rows: customers 1, 2 and 4 (orders 101, 103 and 106). Chidi's orders are excluded —
and that is the bug. Chidi's sub-select is `{37.50, NULL}`, because order 108 has a `NULL`
total. For order 104, the conjunction is `(37.50 >= 37.50) = TRUE AND (37.50 >= NULL) =
UNKNOWN`, which is `UNKNOWN`, which `WHERE` rejects. So `ALL` — a universal quantifier —
has been poisoned by a `NULL` in a *different* row of the same group, and Chidi's largest
order silently vanishes. It is the same mechanism as `NOT IN`: a negated or universal
comparison inherits three-valued logic from the comparison it wraps. The fixes are
`ALL (SELECT … WHERE total_amount IS NOT NULL)`, which returns four rows, the anti-join
form `NOT EXISTS (SELECT 1 … WHERE o2.total_amount > o.total_amount)`, or a window
function, which is null-safe by construction.

**T5.** `SELECT customer_id FROM orders WHERE status = 'SHIPPED' INTERSECT SELECT customer_id FROM orders WHERE status = 'PENDING';` — how many rows and which? `STAFF`
Three rows: customers 1, 3 and 4. The shipped set is {1, 2, 3, 4} — orders 101, 102 and
109 belong to Ada, 103 and 107 to Bruno, 104 to Chidi, 106 to Dara — and the pending set is
{1, 3, 4} from orders 109, 108 and 105. The intersection is what survives both: Ada, Chidi
and Dara. Bruno is absent, which is the part worth pausing on — he has two orders, one
shipped and one *cancelled*, and a cancelled order is not pending, so he does not appear.
Readers routinely count "not shipped" as "pending" and predict Bruno is in the result. The
same three customers come back from the `EXCEPT` form inverted: shipped minus pending is
{2} alone, one row.

**P1.** A data-sync job reports which products have never been sold, using
`WHERE sku NOT IN (SELECT sku FROM order_items)`. It started returning an empty set last
month and nobody investigated, because "no new orphaned products" is a plausible-looking
result. What happened and what would you have done differently? `SCENARIO`

`order_items.sku` is a `VARCHAR` column that a legacy import wrote as `NULL` for
placeholder lines — so the moment that first `NULL` landed, the job's result went empty and
stayed empty. The damage is the *silence*: a monitoring job that returns zero is
indistinguishable from a healthy job returning zero, so the failure mode is a report that
has quietly stopped reporting. Two changes. One: rewrite it as `NOT EXISTS`, which is
immune. Two, and this is the part a staff engineer raises: an observability job that can
legitimately return zero needs a different signal — a count of rows examined, a sentinel
row, or a check that the job ran at all — because "no results" is not an alert. The deeper
lesson is that correctness of the predicate and observability of the job are separate
concerns, and a monitoring system that fails open is a monitoring system that will fail
open again.

**S1.** Review: `SELECT c.name FROM customers c WHERE c.id NOT IN (SELECT customer_id FROM orders WHERE placed_at >= '2024-06-01');` — one comment or several? `STAFF`
Several, and they are not all about the `NOT IN`. First: `NOT IN` over a nullable column
is a latent total failure, and here `customer_id` is `NOT NULL` in the schema but the
*filter* does not guarantee it — if any order from June onward has a `NULL`

`customer_id`, the result is empty. Rewrite as `NOT EXISTS` and add a `CHECK` on
`orders.customer_id` if guest orders are legitimate. Second: the literal date is embedded
in the SQL, so the query cannot be reused and cannot be tested against a different window;
it should be a bound parameter, and the surrounding report needs a timezone decision
because `placed_at` is a `DATE` here and would be a `TIMESTAMPTZ` in a real system.
Third, and this is the staff-level observation: nothing in the query states *why* the
report exists, and "customers with no orders since June" is a retention metric that other
teams will want with a different window and a different denominator. That belongs in a
named view or CTE so there is one definition.

**D3.** Your hot path checks "does this customer have any orders?" on every product page
view. The options are a correlated `EXISTS` per view, a denormalised boolean or counter on
`customers`, or a `LEFT JOIN` in the view query. Which, and what is the failure mode of
each? `STAFF`

The correlated `EXISTS` is the honest default: the planner turns it into a semi-join, and
with an index on `orders.customer_id` it is a couple of index probes per page — cheap,
correct, and it cannot drift. A denormalised boolean is faster still and is the right answer
if the write path is low-volume, but it introduces a consistency mechanism: every place that
inserts an order must set the flag, including the batch import, the admin tool and the
migration, and a missed update produces a customer page that says "no orders" for a customer
with 4,000 of them. That failure is silent and customer-visible, which is the worst
combination. A `LEFT JOIN` in the view query is a middle ground that avoids the flag but
brings the fan-out risk with it, and it will eventually be joined to something else and
multiply rows. The flip condition is write volume: above roughly one order per customer per
day, the flag's maintenance cost and its failure mode both stop being worth the saved
microseconds, and the correct answer is a better index rather than a denormalised column.

### Subqueries & CTEs

**T1.** `SELECT c.name, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS n FROM customers c ORDER BY c.id;` — the five `n`
values? `STAFF`

Ada 3, Bruno 2, Chidi 2, Dara 2, Elin 0. `COUNT(*)` inside the subquery counts rows in the
sub-select, and for Elin the sub-select is empty, so `COUNT` returns 0 rather than `NULL` —
`COUNT` is the aggregate whose empty-set result is a number. This is the correlated
subquery in the `SELECT` list from §4.5, and the reason it is acceptable *here* is that the
outer set is five rows. At 50,000 customers it is 50,000 subquery executions, and the
window-function replacement `COUNT(o.id) OVER (PARTITION BY c.id)` computes every partition
in one pass.

**T2.** `SELECT * FROM orders WHERE placed_at = (SELECT MIN(placed_at) FROM orders WHERE customer_id = 1);` — rows, and
why might it error? `TRICKY`

Two rows: 102 and 109, both on 2024-06-14. The sub-select returns the scalar `2024-06-14`,
which is well-defined — the *value* is unambiguous even though two rows hold it — so the
query is legal and returns both tied orders. It errors only if the sub-select returned more
than one *row*, which a bare `MIN` never does. The contrast worth drawing is with
`WHERE o.id = (SELECT id FROM orders WHERE customer_id = 1 AND placed_at = (SELECT
MAX(placed_at) ...))`, where the inner select returns 102 and 109 and the outer scalar
comparison errors with "more than one row returned by a subquery used as an expression".
That error is the engine correctly refusing to pick arbitrarily; the fix is `= ANY (subquery)`
if you want all tied rows, or an explicit tie-breaker if you want one.

**T3.** `SELECT c.id, (SELECT o.id FROM orders o WHERE o.customer_id = c.id ORDER BY o.placed_at DESC LIMIT 1) AS last_order FROM customers c ORDER BY c.id;` — the
five values, and is the query deterministic? `ADVANCED`

1 → 102, 2 → 107, 3 → 108, 4 → 106, 5 → NULL. But the first value is **not deterministic**:
Ada's orders 102 and 109 share `placed_at` 2024-06-14, and `ORDER BY placed_at DESC LIMIT 1`
has no tie-breaker, so whether 102 or 109 comes back depends on the plan, the physical row
order and the last `VACUUM`. This is the subquery form of the greatest-n-per-group that
cannot be un-correlated, because "the latest one" is a per-customer question. Two fixes,
both better: add the tie-breaker (`ORDER BY o.placed_at DESC, o.id`), or use `LATERAL` or
a window function. The determinism point generalises — any `ORDER BY … LIMIT 1` inside a
subquery is a silent source of irreproducible results, and the same tie is what makes
Ada's row in the running-total example of Chapter 6 ambiguous.

**T4.** `SELECT COUNT(*) FROM (SELECT customer_id FROM orders GROUP BY customer_id HAVING COUNT(*) > 1);` — the result, and
the equivalent that gets it wrong? `STAFF`

Four. Customers 1, 2, 3 and 4 all have at least two orders; Elin has none and does not
appear as a group at all, which is correct — `GROUP BY` does not manufacture groups for
absent keys. The version that gets it wrong moves the filter outside:

`SELECT COUNT(*) FROM (SELECT customer_id, COUNT(*) n FROM orders GROUP BY customer_id) t
WHERE n > 1`. That returns the same four on this data, which is exactly why it survives
review, and the difference is that the outer form is an optimisation fence — the engine
must fully aggregate every customer before it can apply the filter, rather than discarding
groups as they are produced. The right form puts the filter where the aggregate exists, in
`HAVING`.

**P1.** A monthly finance report has started taking 40 minutes instead of 30 seconds, with
no schema change and no data-shape change the team can find. The query was not edited. What
is your hypothesis and what is the first diagnostic? `SCENARIO`

First hypothesis: something upstream changed the *plan*, not the query. The candidates in
order are statistics going stale after a bulk load (a large `INSERT` into a table whose
distribution shifted invalidates the histogram, and the planner's estimate for the
aggregate's input collapses, so it picks a hash aggregate over a sort or spills to disk);
an index being added or removed by a migration in another team, changing the access path for
the driving side; or a `VACUUM`/`ANALYZE` pattern change after a version upgrade. The first
diagnostic is `EXPLAIN (ANALYZE, BUFFERS)` on the report query compared against a known-good
plan, looking specifically at whether the *estimated* row count for the aggregate's input
has collapsed relative to the actual — that gap is the whole story, and Volume 4 is where
the technique lives. What matters at the SQL level is that the query was not the thing that
changed, so "rewrite the query" is the wrong first move and is usually the wrong second one
too.

**S1.** Review: `WITH recent AS (SELECT * FROM orders WHERE placed_at >= current_date - 90), totals AS (SELECT customer_id, SUM(total_amount) t FROM orders GROUP BY customer_id) SELECT c.name, t.t FROM customers c JOIN recent r ON r.customer_id = c.id JOIN totals t ON t.customer_id = c.id GROUP BY c.name, t.t;` — what is wrong? `ADVANCED`
Several things, and only one is a bug. The fan-out is real: joining `recent` (order grain)
to `totals` (customer grain) multiplies each customer's rows by their recent order count,
and the `GROUP BY c.name, t.t` re-collapses them — so the *sum* here is not computed, and
this query happens to survive because it groups. Remove the `GROUP BY` and you get 9 rows
with totals repeated. But the real problem is semantic: the CTE is called `recent` and is
used only to *restrict which customers appear*, while `totals` is computed over **all**
history. A reader will reasonably assume the total is the recent total. That mismatch between
a CTE's name and its use is the single most common review finding on `WITH` queries, and
the fix is either to compute `totals` from `recent` or to name it `lifetime_totals` and add
a second CTE for the recent figure. Also worth flagging: `current_date` in a `WITH` is fine
here, but the `>=` is not `BETWEEN`, which is the right call for a `DATE` column, and if
`placed_at` were a `TIMESTAMPTZ` this would be a timezone bug as well as a semantics bug.
**D4.** A `WITH` clause holds a filtered subset that three later parts of the query each
join to. Someone proposes adding `MATERIALIZED` because the query is slow. What would you
check before agreeing, and what would you add to the change? `STAFF`

Check three things. First, whether the CTE is actually referenced more than once — if it is
referenced once, PostgreSQL inlines it and `MATERIALIZED` only adds a build-and-scan plus a
memory grant. Second, the row count and growth: materialising a 4,000-row subset is free,
materialising a 40-million-row one is a disk sort and a cache eviction that will affect every
other query on the instance. Third, what the alternative is — pushing the filter into each
consumer, which duplicates the predicate three times and risks the branches drifting apart,
which is precisely the failure mode grouping sets exist to prevent. The change should
therefore be: add `MATERIALIZED` *and* a comment stating the expected row count and the
memory implication, because a materialisation decision is a statement about the data's size
and it is the kind of statement that silently becomes false. If the CTE really is large and
truly reused, the better answer is a real table or a materialised view with a refresh
contract, not a `WITH` clause.

**D5.** Your team's reporting queries all repeat the same five-line definition of
"completed revenue" — `SHIPPED` orders only, excluding refunds, over the closed accounting
period. Should that live in a view, a CTE, or a shared application constant? `STAFF`
A view, and the reason is not brevity. The definition is consumed by the finance BI tool,
by an ad-hoc analyst running `psql`, by a scheduled export, and by two services — four
consumers, three of which are not your application code. A CTE in the application's queries
reaches one of them. A constant in the application reaches one of them. The view is the only
place all four *can* reach, and it is the only place where the rule is enforced by something
other than discipline. The cost is that a view is also the only place where a change to the
rule breaks all four consumers at once, so the rule needs a versioning story — a `v2` view,
or a definition that only ever widens. The condition that flips the answer toward the
application is when the rule depends on the *caller* — a permission scope, a tenant, a
currency — because then it is not one rule but a parameterised family, and a view with
arguments is a different and more awkward thing than a well-named function.

### Window Functions

**T1.** `SELECT sku, ROW_NUMBER() OVER (PARTITION BY category ORDER BY unit_price DESC) AS rn FROM products WHERE category = 'FURNITURE' ORDER BY rn;` — rows, values, and
is it deterministic? `TRICKY`

Three rows with `rn` 1, 2, 3. `CHAIR` (220.00) and `DESK` (220.00) tie, and `LAMP` (45.00)
is third. The query is **not deterministic**: `unit_price` is not unique within the
category, so which of the two 220.00 rows gets 1 and which gets 2 is unspecified — it
happens to resolve to `DESK` then `CHAIR` on this plan, and a `VACUUM`, a different plan or
a different engine can swap them. Add a tie-breaker, `ORDER BY unit_price DESC, sku`, and
it becomes deterministic. This is the most common window-function bug in production: a
paginated report built on `ROW_NUMBER()` over a non-unique key shows users different rows on
different days with no code change.

**T2.** The same query with `RANK()` instead. `STAFF`

Three rows with values 1, 1, 3. Both 220.00 products get rank 1 because they tie, and
`RANK` then skips to 3 rather than 2. `LAMP` is genuinely the third-best row, and `RANK`'s
numbering says so — that is the definition: `rnk` equals one plus the number of rows
strictly better. The production consequence: `WHERE rnk <= 2` returns three rows from
FURNITURE, not two, and a report that promises "top 2 per category" will return an
arbitrary number of rows. If the report must return exactly two, that is a `ROW_NUMBER`
question with a tie-breaker; if it must include ties, it is a `RANK` question and the
variable row count is the honest answer.

**T3.** The same query with `DENSE_RANK()`. `TRICKY`

Three rows with values 1, 1, 2. Both 220.00s rank 1 and `LAMP` ranks 2, with no gap —
`DENSE_RANK` counts *distinct ordering-key values* rather than rows. So the three functions
give three different numbers for the same table: `rn` 1/2/3, `rnk` 1/1/3, `drnk` 1/1/2. The
case that generates interviews is `WHERE DENSE_RANK() = 2`, which asks for "the second
*distinct* price in each category" — and returns zero rows in any category with a tie at
rank 1, which is a very different question from "the second row".

**T4.** `SELECT o.id, SUM(o.total_amount) OVER (PARTITION BY o.customer_id ORDER BY o.placed_at) AS running FROM orders o WHERE o.customer_id = 1 ORDER BY o.id;` — the three `running`
values? `ADVANCED`

Order 101 → 31.00, order 102 → 51.00, order 109 → 51.00. The `RANGE` default frame
(`UNBOUNDED PRECEDING AND CURRENT ROW`) is peer-aware, and 102 and 109 both have
`placed_at = 2024-06-14`, so they are peers: each one's frame contains all three rows, and
both see a running total of 51.00. The running total reaches its final value one row early
and then repeats it. The "surprise" is entirely the default frame, and it is a legitimate
answer for a "running total by day" report — it just is not a sequential running total.
**T5.** The same query with an explicit frame: `SUM(o.total_amount) OVER (PARTITION BY o.customer_id ORDER BY o.placed_at ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)`. `STAFF`
101 → 31.00, 102 → 43.50, 109 → 51.00. `ROWS` counts positions, so 102's frame is 101 and
102 and 109's frame is all three. The two versions differ only because of the tie, and they
would be identical on data where `placed_at` is unique — which is exactly why this bug
survives review and then appears when two orders land on the same day. The rule to take

away: any tie in the `ORDER BY` key makes `RANGE` and `ROWS` disagree, so you have to

decide which question you are asking rather than inheriting the default.

**T6.** `SELECT c.name, o.id, last_value(o.id) OVER (PARTITION BY c.id ORDER BY o.placed_at) FROM customers c JOIN orders o ON o.customer_id = c.id ORDER BY c.name, o.id;` — what does Ada's middle row report? `ADVANCED`
Order 102 reports **109** — a different order's id. The default frame ends at `CURRENT ROW`,
so `last_value` returns the last row *of the frame*, and the last row of a frame ending at
the current row is the current row itself. The peer effect then compounds it: 102 and 109
share `placed_at`, so under `RANGE` each one's frame includes the other, and 102 sees 109 as
the frame's last row. The fix is `last_value(o.id) OVER (PARTITION BY c.id ORDER BY
o.placed_at ROWS BETWEEN UNBOUNDED PRECEDING AND UNBOUNDED FOLLOWING)`, which gives 109
for all three of Ada's rows. This is why `first_value` appears to work without a frame — a
frame that starts at the partition's beginning already contains the first row — and why
`last_value` never does.

**P1.** A "spend over time" chart on the finance dashboard shows a running total that
suddenly jumps to the final value one day early, and only for some customers. Nothing
changed in the release. What is the cause and what do you change? `SCENARIO`

The cause is the `RANGE` default frame meeting a tie. The query is

`SUM(amount) OVER (PARTITION BY customer_id ORDER BY order_date)` with no frame clause, so
`RANGE BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW` applies, and any day on which a
customer placed two orders produces a *peer group* whose members all see the same
cumulative total — including the second order of the day, which already contains the first.
The jump looks like a bug to the reader because it appears on some days and not others: only
days with two orders. Nothing in a release caused it; the data did. The fix is to state the
frame explicitly — and the choice is a requirement question, not a technical one. If the
chart is "cumulative spend by day", `RANGE` is arguably right and the display should group
by day rather than by order. If it is a running total that should step once per order, use
`ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW`. The prevention is a review rule: any
window function with an `ORDER BY` and no frame states a frame.

**D6.** Your analytics engine has `QUALIFY`, which filters window functions directly.
Should you adopt it, and what does adopting it cost? `ADVANCED`

Adopt it in that engine, because it removes the wrapper subquery and therefore removes an
optimisation fence and a readability tax — the filter sits where the level rule says it
belongs. The costs are real and non-obvious. First, portability: `QUALIFY` is not standard
SQL, so a query written with it does not run on PostgreSQL, MySQL or SQL Server, and
report queries in a company tend to outlive the tool that motivated them. Second, it hides
the level structure from readers who learned the standard pipeline, so a team develops a
second mental model and stops being able to explain their own queries. Third, and this is
the one people miss, it removes the explicit boundary that made the query optimisable in
specific ways: a `MATERIALIZED` CTE wrapping a ranked result is a fence you can place
deliberately, and a `QUALIFY` gives you no place to put it. The reasonable answer is
`QUALIFY` in a warehouse query that will only ever run there, the wrapper subquery or CTE
everywhere else, and a lint rule that flags `QUALIFY` in code that claims to be portable.

### Set Operations & Grouping

**T1.** `SELECT customer_id FROM orders WHERE status = 'SHIPPED' UNION SELECT customer_id FROM orders WHERE status = 'PENDING';` — how many rows and which? `STAFF`
Four rows: customers 1, 2, 3 and 4. The shipped set is {1, 2, 3, 4} — five shipped orders
belonging to four distinct customers — and the pending set is {1, 3, 4} from orders 109, 108
and 105; `UNION` takes the set union, so the duplicates of 1, 3 and 4 collapse. Elin is
absent from both branches so she cannot appear. Had the branches been `UNION ALL`, the result
would be eight rows with customers 1, 3 and 4 each appearing twice — which is a different
and often more useful answer, since "list the orders that are either shipped or pending"
wants eight rows, not four.

**T2.** The same query with `EXCEPT` instead of `UNION`. `STAFF`

One row: customer 2. `EXCEPT` is set difference — the shipped customers minus the pending
ones, so {1, 2, 3, 4} − {1, 3, 4} = {2}. This is Bruno, who has a cancelled order (103) and a
shipped one (107) but nothing pending, so he has a shipped order that is not matched by a
pending one. This is the reconciliation form, and it is the right tool for "which of these
two sources disagree" — and unlike `NOT IN`, it is safe against `NULL`s in the right-hand
set, because `EXCEPT` uses distinct-from matching rather than a chain of comparisons.
**T3.** `SELECT status, SUM(total_amount) FROM orders GROUP BY ROLLUP(status) ORDER BY 1;` — how many rows and
what values? `ADVANCED`

Four rows: CANCELLED 220.00, PENDING 19.50, SHIPPED 201.00, and a `NULL`-status row with
440.50. `ROLLUP(status)` is a single-column rollup, so the grouping sets are `(status)` and
`()`, giving one row per status plus the grand total. The total row's `status` is `NULL`
because the grouping set omitted the column, not because the data was null — and that is
exactly what `GROUPING(status)` distinguishes, returning 1 on that row and 0 on the others.
Without it you cannot tell a total row from a hypothetical status that happens to be null,
and since `status` is `NOT NULL` here the display happens to work; on a nullable status
column it would not.

**T4.** `SELECT status FROM orders WHERE placed_at < '2024-07-01' UNION ALL SELECT status FROM orders WHERE placed_at >= '2024-07-01' ORDER BY status LIMIT 2;` — how many rows, and which? `ADVANCED`
Two rows: CANCELLED and PENDING. The `UNION ALL` concatenates nine rows and the trailing
`ORDER BY` sorts the **combined** result — it does not sort each branch and it does not
take two from each. Sorted alphabetically the nine statuses are CANCELLED (103), PENDING
(105, 108, 109), PENDING (105, 108, 109) again, SHIPPED (101, 102), SHIPPED (101, 102)
again — so the first two are CANCELLED and PENDING. If you wanted two of each branch you
would need `(SELECT status … WHERE … < '2024-07-01' ORDER BY status LIMIT 2) UNION ALL
(SELECT status … WHERE … >= '2024-07-01' ORDER BY status LIMIT 2)`, and even then the
branch-level `ORDER BY` is a hint the optimiser may discard; only the top-level `ORDER BY`
is a guarantee.

**S1.** Review: `SELECT customer_id, total_amount FROM orders WHERE placed_at < '2024-07-01' UNION SELECT customer_id, total_amount FROM orders WHERE placed_at >= '2024-06-15'` — what is the
problem, and is `UNION ALL` the fix? `STAFF`

`UNION` is a *correct* query that is quietly deleting a row. The two branches overlap on
orders placed between 2024-06-15 and 2024-06-30 — orders 102, 103, 104 and 105 — and those
rows are *identical* in both branches, so `UNION`'s mandatory dedupe removes the
duplicates. In a report that sums these results, June revenue is understated by

12.50 + 220.00 + 37.50 + 12.00 = 282.00. `UNION ALL` is the right fix here because the
*intent* is "every order in a window that is expressed as two half-ranges", and a report
that genuinely wants to count an order twice has a different question to ask. The review
comment is that the date predicate looks like an off-by-fifteen-days bug — and it probably
*is* one, in which case the fix is to correct the boundary rather than to change the
keyword. This is the general hazard: `UNION` masks a predicate mistake, and switching to
`UNION ALL` to make the symptom disappear would ship the symptom's opposite.

**D7.** A finance report needs revenue by status, by month, by status-and-month, and a
grand total, in one result set. The options are four `UNION ALL` branches, one query with
`GROUPING SETS`, or a report service that runs four queries. Which, and where is the
boundary? `STAFF`

`GROUPING SETS` in one query. The reason beyond speed is consistency: four `UNION ALL`
branches carry four copies of the `WHERE` clause, four sets of expressions and four
opportunities to drift, and a report whose grand total is not the sum of its details is
worse than no report. One grouping-sets query applies one filter and one set of aggregates
to every level, so the total is correct by construction. The cost is dialect dependence —
SQLite and several serverless engines do not support it — and the need for `GROUPING()` to
label the subtotal rows, since a subtotal's `NULL` is otherwise indistinguishable from a
data `NULL`. The boundary that flips the answer is dynamism: if the set of levels is decided
at runtime rather than known at authoring time, generate the branches instead, because
`GROUPING SETS` needs its set list at parse time. A report service running four queries is
the right answer only when the levels live in different systems, which is a different
problem from aggregation.

### Grouping & Aggregation

**T1.** `SELECT COUNT(*), COUNT(total_amount), COUNT(DISTINCT customer_id) FROM orders;` — the three
values? `STAFF`

9, 8, 4. `COUNT(*)` counts all nine orders including 108, whose `total_amount` is `NULL`.
`COUNT(total_amount)` counts the eight where the column is populated. `COUNT(DISTINCT
customer_id)` counts the four distinct customers who have orders — Elin has none, so she
contributes nothing, and `DISTINCT` skips `NULL`s in any case. The first two differ *only*
because the column is nullable, which is the general rule: the distinction between `COUNT(*)`
and `COUNT(col)` is invisible on a `NOT NULL` column and decisive on a nullable one.
**T2.** `SELECT SUM(total_amount) FROM orders WHERE customer_id = 5;` — the result? `TRICKY`
`NULL`, not `0`. Elin has no orders, so the `WHERE` produces zero rows, and an aggregate over
zero rows returns `NULL` with the single exception of `COUNT`, which returns `0` because
counting nothing is a number. The propagation is the part that bites: `SUM(x) + 0` is
`NULL`, `SUM(x) * 100` is `NULL`, and `SUM(x) > 0` is `NULL`, which is not `TRUE`, so a
`HAVING SUM(x) > 0` silently drops the group instead of erroring. The fix is

`COALESCE(SUM(x), 0)`, and the choice between that and keeping the `NULL` is a business

claim: a customer with no orders has zero revenue or unknown revenue, and for a financial

report "unknown" is usually right, because rendering it as £0.00 asserts a fact you do not
have.

**T3.** `SELECT c.name, COUNT(*) AS n FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY n DESC, c.name;` — the full result set? `ADVANCED`
Ada 3, Bruno 2, Chidi 2, Dara 2, Elin 1. The top row is right by luck; the last row is the
`COUNT(*)` bug. The null-extended row for Elin is a row, so `COUNT(*)` reports one order for
a customer who has none. `COUNT(o.id)` gives Elin 0 and leaves everything else unchanged.
The ordering by `n DESC, c.name` is deliberate — without the tie-breaker, the order of
Bruno, Chidi and Dara at 2 is unspecified, and this is the same non-determinism as `T1` in
the window section, arriving through `LIMIT`-free ordering. The general rule worth stating
in an interview: after a `LEFT JOIN`, `COUNT(*)` is always a bug, and any `ORDER BY` used
for pagination needs a unique tie-breaker.

**T4.** `SELECT country, COUNT(*) FROM customers GROUP BY country ORDER BY country NULLS LAST;` — how many rows, and what is
the fourth? `TRICKY`

Four rows: DE 1, GB 2, NG 1, and a `NULL`-labelled row with 1. `GROUP BY` treats `NULL` as
a single ordinary value, so all `NULL` countries group together — here just Elin, the
customer created through a flow that never asked. The row is a real group, not a display
artefact, and `NULLS LAST` only controls where it appears in the ordering, not whether it
exists. The three handles are `COALESCE(country, 'UNKNOWN')` to label it,

`WHERE country IS NOT NULL` to drop it when the dimension must be populated, and a standing
`SELECT COUNT(*) FROM customers WHERE country IS NULL` metric so the bucket is visible as a
number. Note the asymmetry that causes the confusion: `NULL` is a value to `GROUP BY` and a
non-value to a comparison — it groups, it never equals, and it is never equal to itself.
**P1.** A customer-facing report of "orders with no line items" has been returning zero
rows since a migration added a `status` column to `orders`. Nothing in the report code
changed. What is your diagnosis? `SCENARIO`

The new `status` column is the wrong suspect and the right lesson. The real cause is that
the report is almost certainly `SELECT * FROM orders NATURAL JOIN order_items` or a
comma-join written years ago, and the migration added a column whose name now exists in
*both* tables — or the report used a `NATURAL JOIN` whose condition is derived from shared
column names, and a new shared name changed the join condition. The query still parses, still
runs, and returns a different number of rows, with no error and no warning. That is the
signature failure of `NATURAL JOIN`: the join condition is a function of the *schema shape*,
so any schema change is silently a query change. The diagnosis is to expand the `NATURAL
JOIN` into an explicit `ON` and see what condition it was actually deriving. The prevention
is the one already stated in Chapter 2: write the join condition out, because a join whose
condition you cannot see is a join whose condition you cannot fix, and schema evolution is
guaranteed, not hypothetical.

**S1.** Review: `SELECT c.country, COUNT(DISTINCT c.id) AS customers, SUM(o.total_amount) AS revenue FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.country;` — three comments? `ADVANCED`
Three, in ascending order of severity. First, `COUNT(DISTINCT c.id)` is the *right* choice
here precisely because of the `LEFT JOIN` — a plain `COUNT(*)` would count the null-extended
rows, and `COUNT(DISTINCT c.id)` happens to survive that because a null-extended row still
carries the real customer id. That is worth a comment in the code, because the next
developer will "simplify" it to `COUNT(*)`. Second, the `NULL` country bucket will appear
as a fifth group in a chart labelled "null", and that is the §8.4 problem. Third, and the
one that actually bites: `SUM(o.total_amount)` over a `LEFT JOIN` to `orders` is safe from
fan-out only because this query groups by a *customer-grain* key and sums a measure that
lives on the same table as the join. The moment someone adds `JOIN order_items` to get a
line count, this sum multiplies by each customer's order count and the report is wrong by
60% with no error. The review comment should state the grain so the next change has to
confront it.

**D8.** A dashboard needs "revenue per country per month" including countries with zero
revenue, and it must agree to the penny with a nightly finance ledger. How would you build
it, and what would you refuse to do? `STAFF`

Build it as a view over a `LEFT JOIN` from a country dimension to a monthly aggregate, with
`COALESCE(SUM(...), 0)` on the money and an explicit decision about the `NULL`-country
bucket — excluded, labelled, or reported separately. The reason for a view is that the
dashboard, the finance export and the ad-hoc analyst must all get the same number, and a
definition that lives in three places will not stay consistent. What I would refuse is
anything that makes the dashboard number *look* like the ledger number without *being*
derived from it: a client-side aggregation over a paginated API, which will disagree the
moment a page boundary falls inside a month, and a "fudge" `COALESCE` on a value that is
`NULL` because the join was wrong rather than because the revenue is zero. The second
refusal is a caching or pre-computation layer with no staleness contract — a nightly
materialised view that finance reads as if it were live is a reconciliation incident waiting
for a month-end. The flip condition for accepting pre-computation is that finance agrees the
staleness window in writing.

### Query Shape, Cost & Design

**D9.** A report query has grown from 12 table references to 20 as teams added "just one
more join". It is now 8 seconds. What do you raise in the design review? `STAFF`
That this is a schema problem wearing a query costume, and that the fix is not a faster
query. Twenty table references in one statement is past the point where any planner can
reason reliably — PostgreSQL's default `join_collapse_limit` is 8, past which it switches
from exhaustive dynamic programming to a greedy heuristic, and the search space for 20
tables is `20!`. The review should ask what *question* the twenty joins are answering, and
the answer is almost always three or four questions that have been fused into one because
somebody wanted one round trip. The remedies in order: split the query into a `WITH` per
question and let each be independently optimisable; introduce a star schema or a
pre-aggregated fact table for the reporting side so the join count drops by an order of
magnitude; and, if the 20 joins are genuinely a traversal, ask whether the relationship is
a graph that should be traversed with a recursive CTE (Chapter 5) rather than materialised
as 20 sequential joins. What I would not accept is a plan hint or a hand-ordered join list
as the fix — those treat the symptom and buy nothing when the underlying structure changes
again in six months.

**D10.** A dashboard shows "top 3 products per category". The current implementation is a
window function filtered outside; the obvious alternative is a `LATERAL` with `FETCH FIRST
3 ROWS ONLY`. When do you switch, and what do you have to decide about ties? `STAFF`
Switch when the product table is large relative to the category count. The window version
reads and ranks every product row in the database — O(total products) plus a sort of each
partition — and then discards all but three per category. The `LATERAL` version does one
index probe per category and reads three rows back, O(categories × 3), with no sort. On
eight products the difference is unmeasurable; on a catalogue of two million it is the
difference between a one-second query and a thirty-second one. The tie decision is the
correctness half and it is a product question, not a technical one: `FETCH FIRST 3 ROWS
ONLY` breaks ties arbitrarily and non-deterministically, which is a bug in a dashboard;
`FETCH FIRST 3 ROWS WITH TIES` matches `RANK() <= 3` and returns an arbitrary *number* of
rows, which is correct for "show me the top three including ties" and wrong for "show me
three". I would also require the `INNER` versus `LEFT LATERAL` decision to be stated
explicitly, because an `INNER LATERAL` silently drops every category with no products,
which is a different report from the one the stakeholder usually wants.

**D11.** A team wants a `last_seen_at` column on `customers`, updated on every page view,
plus a boolean `has_orders` maintained by a trigger, to avoid two hot queries. What is your
position on denormalising computed state onto a hot row? `STAFF`

I would ask for the write cost before agreeing, because that is where the bill arrives.
Every page view now takes a row lock on the customer, serialises against every other view
of the same customer, and adds a write to the busiest table in the system — to answer a
question an index could answer. A single hot customer is then a lock convoy, and the
failure shows up as lock waits, not as slow queries, which makes it much harder to
diagnose. The `has_orders` trigger is cheaper but is a consistency mechanism on the write
path, and it must be maintained by every writer including the import and the admin tool;
a missed update produces a customer page claiming "no orders" for a customer with 4,000,
which is silent and customer-visible. My preference, in order: make the index do the work
(`EXISTS` on an indexed `orders.customer_id`, or a partial index), denormalise only where
a measurement demands it, and if the hot row is genuinely being written on every request,
that is a signal about the *access pattern* — the counter belongs in a metrics system or a
cache, not in the transactional row.

**D12.** A paginated report joins three tables, groups, and orders by a computed column.
The team proposes moving pagination into the application because the database query is
"slow at 50,000 rows". What is the actual problem, and what do you check? `ADVANCED`
The actual problem is almost never the database. Fifty thousand rows is a small number for
a grouped aggregate over an indexed join; the usual causes are a stale plan, a missing index
on the join or `ORDER BY` key, a `GROUP BY` on an expression that prevents a sort merge, or
a fan-out that is producing far more intermediate rows than the result. Moving pagination
into the application makes all four worse: the database still computes all 50,000 rows and
now ships them over the wire, the offset cost grows quadratically with page depth, and the
ordering is no longer stable because a concurrent write changes the row set between requests
— the classic "row 51 appears on both page 2 and page 3" bug. The right move is keyset
pagination with a deterministic ordering and a tie-breaker, and the right first diagnostic is
`EXPLAIN (ANALYZE, BUFFERS)` with a specific eye on the estimated-versus-actual row counts
at the aggregate's input, which is where a fan-out or a stale statistic shows up. If the
query genuinely cannot be made fast, the honest answer is a narrower report with a
server-side filter, not a client-side loop.

**T7.** `SELECT c.name FROM customers c WHERE NOT EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.status = 'SHIPPED') ORDER BY c.name;` —
rows, and how many subquery evaluations? `STAFF`

Zero rows. Every customer except Elin has at least one shipped order — Ada (101, 102),
Bruno (107), Chidi (104), Dara (106) — and Elin has no orders at all. So the anti-join
returns nothing, which is itself worth noticing: the report has no output, and a report with
no output is indistinguishable from a broken one unless someone says so. On evaluations:
the planner will almost certainly un-correlate this into a single anti-join — build a hash
set of customer ids with a shipped order, then probe it once per customer — so the cost is
one pass over `orders` plus five probes, not five separate subquery executions. It *could*
be executed as five correlated subqueries, and the difference between the two is a plan
question (Volume 4) rather than a semantics question: the row set is identical either way.
**T8.** `SELECT c.name, SUM(o.total_amount) FILTER (WHERE o.status = 'SHIPPED') AS shipped FROM customers c LEFT JOIN orders o ON o.customer_id = c.id GROUP BY c.name ORDER BY c.name;` — the
five `shipped` values? `ADVANCED`

Ada 43.50 (101's 31.00 plus 102's 12.50), Bruno 50.00 (107 only; 103 is cancelled), Chidi
37.50 (104 only; 108 is pending), Dara 70.00 (106 only; 105 is pending), and Elin **`NULL`**
— not `0`. `FILTER` restricts the aggregate's *input*, so for Elin the filtered input is
empty, and `SUM` over zero rows is `NULL` per §8.3. This is the trap worth taking away: a
conditional aggregate is still an aggregate, and it inherits every empty-set and `NULL`
behaviour of the unconditioned one. `COALESCE(SUM(o.total_amount) FILTER (WHERE

o.status = 'SHIPPED'), 0)` gives 0, and whether that is right is the same business decision
as before.

**P1.** A nightly export job that has run unchanged for two years now writes a file with
roughly half the expected rows, and the job reports success. What is the first thing you
do? `SCENARIO`

You do not debug the export — you establish which *half* is missing, because "half" is a
quantity that constrains the hypothesis space enormously. Half the customers, half the
months, or half the columns are three completely different bugs. The most likely candidate
for a query that has not changed is a `UNION` where there used to be no overlap and now
there is — a new order status, a new region, a new source system that began writing
overlapping records — so `UNION`'s mandatory dedupe is now deleting rows it never deleted
before. The second candidate is a `NOT IN` over a sub-select that acquired a `NULL`. The
third is a `HAVING` on a nullable aggregate. The diagnostic that distinguishes all three in
one query is to run the branches or the pre-dedupe union separately and compare counts.
The prevention is the same every time: the job reports the count it wrote, compares it to an
expected count, and alerts on the *delta* — because a job whose only success signal is "did
not throw" will silently under-report forever.

**S1.** Review a query that has been flagged as "the slowest report in the company":
`SELECT o.status, date_trunc('month', o.placed_at) m, c.country, SUM(i.qty * i.price) rev, COUNT(*) n FROM orders o JOIN order_items i ON i.order_id = o.id JOIN customers c ON c.id = o.customer_id WHERE o.placed_at >= '2024-01-01' GROUP BY 1, 2, 3 ORDER BY 2 DESC, 1, 3;` — what are your first three comments? `ADVANCED`
Three, and none of them is "add an index". First, the measure is line-grain and the group is
order-grain × month × country, so there is no fan-out here — `SUM(i.qty * i.price)` summed
over the joined rows is correct, and that is worth confirming out loud, because the first
instinct on a three-table join is to assume the worst. Second, `date_trunc('month',
o.placed_at)` in the `GROUP BY` and in the `ORDER BY` forces a sort and defeats any
possibility of an index-ordered scan on that expression; an index on `(placed_at)` can still
bound the `WHERE`, but the grouping is a hash or sort over everything the filter admits, and
that is likely where the eight seconds go. Third, and the one that will outlast the others:
this is a query with three aggregation levels' worth of intent compressed into one flat
`GROUP BY`, and the moment someone asks for "the total row" or "revenue by country only",
this becomes a `GROUPING SETS` query. The review comment should ask what report this is
*for*, because the answer determines whether the right fix is a generated column, a
materialised daily aggregate table, or a pre-aggregated fact table — and all three of those
are cheaper than making this query fast.

**D13.** Your team owns a reporting API backed by twenty hand-written SQL queries. A
platform engineer proposes replacing them with a single generic query builder that takes
filters and grouping from the request. Do you agree? `STAFF`

No, and the reason is a specific one rather than a general objection to abstraction. These
twenty queries are not twenty implementations of the same thing; they are twenty *different
answers* — different grains, different join types, different decisions about `NULL`
buckets and about whether a customer with no orders appears. A generic builder parameterises
the shape and has to either default each of those decisions or accept them as parameters,
and every default it picks is a silent business decision made by a platform team rather
than by the person who knows what the report means. That is how the `LEFT JOIN` +
`WHERE` bug gets industrialised: one builder, one wrong default, twenty reports. What I
would accept is the opposite move — reduce the twenty by identifying the genuinely shared
shape and extract *that* as a view with named, documented semantics, keeping the distinct
reports as distinct queries. The condition that flips my answer is if the reports really do
converge on one shape, in which case the builder is fine and the problem was the
twenty, not the abstraction.
