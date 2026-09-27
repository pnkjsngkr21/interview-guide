# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

An eleven-volume study & interview mastery guide at senior/staff level, covering databases
from the storage engine up — the physical layer, the relational model, SQL as a language,
indexing and query execution, transactions and concurrency, schema design and scaling, and
then a deep dive on each engine: PostgreSQL, MySQL, Redis, Cassandra, DynamoDB, MongoDB,
Elasticsearch, and S3.

Every chapter is framed as a decision with a failure mode. Every volume ends with an
interview scenario bank weighted toward design trade-offs rather than API recall.

| # | Volume |
|---|--------|
| 1 | [Database Fundamentals & the Relational Model](database-deep-dive-volume-01-fundamentals-relational-model.md) |
| 2 | [SQL — DDL, DML & Constraints](database-deep-dive-volume-02-sql-ddl-dml-constraints.md) |
| 3 | [SQL — Queries, Joins, CTEs & Window Functions](database-deep-dive-volume-03-sql-queries-joins-window-functions.md) |
| 4 | [Indexes, Query Planning & Execution](database-deep-dive-volume-04-indexes-query-planning-execution.md) |
| 5 | [Transactions, Isolation Levels & Concurrency](database-deep-dive-volume-05-transactions-isolation-concurrency.md) |
| 6 | [Schema Design, Partitioning & Scaling](database-deep-dive-volume-06-schema-design-partitioning-scaling.md) |
| 7 | [PostgreSQL](database-deep-dive-volume-07-postgresql.md) |
| 8 | [MySQL](database-deep-dive-volume-08-mysql.md) |
| 9 | [Redis & Caching Strategies](database-deep-dive-volume-09-redis-caching.md) |
| 10 | [NoSQL & Distributed Stores — Cassandra, DynamoDB, MongoDB](database-deep-dive-volume-10-nosql-cassandra-dynamodb-mongodb.md) |
| 11 | [S3, Elasticsearch & the Database Interview Bank](database-deep-dive-volume-11-s3-elasticsearch-interview-bank.md) |

## Study Path

**Core path** — Volumes 1 → 6 are the portable material. Volume 1 gives you the physical
and logical model, 2 → 3 make SQL a language you can write fluently rather than pattern-match,
4 → 5 are the two chapters that decide whether your application is fast and correct, and 6 is
where schema choices start becoming irreversible.

**Engines** — Volumes 7 → 8 are the relational engines most teams actually run, 9 is the
cache that sits in front of everything, 10 is the NoSQL set, and 11 is object storage plus
search plus the consolidated interview bank.

**Prerequisites elsewhere in this repo** — Volume 1 → 5 is assumed knowledge for the Spring
set's Volume 6 (Spring Data JPA & Persistence), which treats the ORM's default behaviour as
the dangerous thing. Volume 5's isolation material is the foundation for the Microservices
set's Volume 2 (Communication, Data & Consistency).

---

# Authoring Format

This section is the contract every volume in this set is written against. It exists so the
eleven volumes stay structurally identical to each other and to the Spring and Microservices
sets.

## File Naming

`database-deep-dive-volume-{NN}-{kebab-case-slug}.md`, two-digit zero-padded volume number.
The volume number and slug are fixed at authoring time and never renumbered.

## Front Matter

Exactly five lines, in this order:

```yaml
---
title: "The Database Complete Deep-Dive"
volume: 1
series: "DATABASE FUNDAMENTALS & THE RELATIONAL MODEL"
subtitle: "Study & Interview Mastery Guide"
---
```

`series` is the volume's topic in ALL CAPS.

## Section Order

A volume file is exactly this, in this order, with no additions:

1. YAML front matter
2. `# The Database Complete Deep-Dive`
3. `**Study & Interview Mastery Guide**`
4. `## About This Guide` — 4–6 paragraphs. Always contains the "It is not a tutorial"
   disclaimer, the design-review framing sentence, a paragraph specific to this volume's
   hook, and a paragraph on the register the answers should hit.
5. `### How This Guide Is Structured` — the template fence, the callout legend table, the
   "not every chapter uses every slot" note, the "chapters end with Common Mistakes"
   note, and the note that banks stop when a question would repeat.
6. `### Continuing From Volume N-1` — the eleven-row coverage table with
   `Volume N (this book)` marked. Volume 1 instead uses a `| Volume | Coverage |` table
   whose first row is `| Volume 1 (this book) | ... |`.
7. `### Table of Contents — Volume N` — a plain dash list of chapter titles, no anchors.
8. `---`
9. `# Part N — <Topic>`
10. `## Chapter N — <Title>` for each chapter
11. `---`
12. `### End of Volume N`
13. `### Coming in Volume N+1 — <Topic>` (Volume 11 omits this)
14. `## Chapter N — Interview Scenario Bank`

## Heading Hierarchy

| Level | Convention | Example |
| --- | --- | --- |
| `#` | Series title, then `# Part N — <Topic>` | `# Part 4 — Indexes, Query Planning & Execution` |
| `##` | `## About This Guide`, `## Chapter N — <Title>` | `## Chapter 4 — B+ Trees in Detail` |
| `###` | `### N.M <Title>` — decimal, no trailing period; also `### <Topic>` inside banks | `### 4.2 Page Splits & Fill Factor` |
| `####` | Only three kinds, in this order, at the end of every **content** chapter | see below |

The three `####` headings per chapter, in order. These close every **content** chapter — the
Interview Scenario Bank chapter has **none** of them. It ends with the last answer's closing
paragraph and nothing else, exactly as the Spring volumes do. A volume of N chapters
therefore carries N-1 `#### Common Mistakes`, N-1 `#### Interview Questions`,
N-1 `> **CHAPTER N SUMMARY**` and N-1 `#### Further Reading` blocks.

```markdown
#### Common Mistakes

- ...

#### Interview Questions — <Subtopic>

**Q1. ...?** `TRICKY`

Answer as a flush-left wrapped paragraph.

> **CHAPTER N SUMMARY**

> ...

#### Further Reading

- [Title](url) — description
```

`#### Further Reading` bullets are single long lines — the one place prose is not wrapped.

## Callouts

Blockquotes, opening with a bold callout name. An em-dash sub-title is optional:

```markdown
> **INTERVIEW TRAP — "WHY ISN'T THE DEFAULT LEVEL SERIALIZABLE?"**
>
> Body paragraphs, each wrapped, continuation lines also prefixed with `>`.
```

The legend that appears in every volume's `### How This Guide Is Structured`:

| Callout | Means |
| --- | --- |
| `INTERVIEW TRAP` | the common answer that a senior candidate should catch and correct |
| `TRADE-OFF` | a decision with both sides, and the condition that flips the answer |
| `SCALING REALITY CHECK` | the specific number where this stops working |
| `PRODUCTION RELEVANCE` | why this matters outside an interview |
| `MUST REMEMBER` | the one fact to carry forward |
| `PRODUCTION SCENARIO` | a five-line incident: problem, investigation, root cause, solution, prevention |
| `STAFF-LEVEL CONSIDERATION` | the org or process concern worth raising unprompted |

`PRODUCTION SCENARIO` is the only callout with a fixed internal shape:

```markdown
> **PRODUCTION SCENARIO**
>
> Problem: ...
> Investigation: ...
> Root cause: ...
> Solution: ...
> Prevention: ...
```

## Question Prefixes

Per-chapter questions use `Q1, Q2, ...` in bold. Scenario-bank questions use four
prefixes, introduced by this paragraph at the top of every bank:

- **P** — production situation
- **T** — predicted behaviour ("given this query/interleaving, what happens?")
- **S** — code-review question
- **D** — design trade-off challenge

In a bank, `D` numbers run continuously across the whole bank (`D1` … `D40`) while `P`, `T`
and `S` restart at 1 within each `### <Topic>` subsection. Order within a subsection is not
alphabetical and is not `P` before `T` — put the best question first.

### Difficulty Tags

Drawn only from this vocabulary, appended after the closing `**` of the question:

`` `STAFF` ``, `` `TRICKY` ``, `` `ADVANCED` ``, `` `SCENARIO` ``

## Style Rules

- Prose hard-wrapped at ~95 columns, continuation lines flush-left with no indent.
- Unordered lists: `- ` only, never `*`.
- Ordered lists: `1. ` followed by a **bold lead-in phrase** and an em-dash.
- Bold pseudo-sub-headings inside a `###` section are colon-terminated and have no heading
  level — e.g. `**The case for staying relational, honestly put:**`.
- Tables: `| --- |` separators, never alignment colons. Identifiers are backtick-wrapped.
- ASCII diagrams use ```text fences and Unicode box-drawing (`│ ─ ┌ ┐ └ ┘ ├ ┤ ┼ ▼ ► → ←`).
- Code fences are language-tagged: `sql`, `java`, `yaml`, `json`, `bash`, `properties`.
  The template diagram in `### How This Guide Is Structured` is a bare fence.
- **No emoji anywhere.** UTF-8, LF line endings.
- Em-dashes for asides; `*italics*` for the concept being defined; `**bold**` for the
  load-bearing claim in a paragraph.
- Longer chapter body prose that a reader is *meant* to remember gets a callout, not extra
  emphasis in the paragraph.

## Volume-End Blocks

```markdown
---

### End of Volume N

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- A specific, checkable capability — not a topic name
- ...

### Coming in Volume N+1 — <Topic>

Four to six wrapped lines: what the previous volume covered, what this one adds, and why
the order matters.
```

`BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO` is an unpunctuated all-caps line with no heading
marker and no bold. It is a deliberate tic of this repository — keep it exactly.

## Deduplication Rule

Before writing a bank question, check the already-written volumes for the same concept. If
the same question exists, drop it and write a **harder variant** instead — a tighter
precondition, an interleaving, a scale number, or a "what would you tell the team" turn.

The hardest traps are each owned by exactly one volume:

| Trap | Owner |
| --- | --- |
| B+ tree internals, page splits, leftmost prefix | Volume 4 |
| `LEFT JOIN` + `WHERE` becoming an inner join; `NOT IN` with a `NULL` | Volume 3 |
| `COUNT(*)` vs `COUNT(col)`; fan-out inflating a count | Volume 3 |
| `SERIALIZABLE` not being strictly serializable | Volume 5 |
| MVCC snapshot skew, HOT updates, bloat, vacuum starvation | Volume 7 |
| Gap locks, next-key locking, per-statement vs per-transaction read view | Volume 8 |
| Cache stampede, penetration, avalanche | Volume 9 |
| Cassandra tombstones, DynamoDB hot partitions | Volume 10 |
| S3 eventual consistency for overwrite, delete and list | Volume 11 |

## Cross-Set References

State the target, do not restate the content:

- **Spring Volume 6** owns the ORM layer above SQL — JPA, Hibernate, the persistence
  context, `ddl-auto`. This set owns the indexes and transactions underneath it.
- **Microservices Volume 2, Chapter 1** owns CAP as an *architecture* question. This set's
  Volume 10 Chapter 2 owns it as a *database* question — what a given engine actually
  guarantees.
- **Microservices Volume 2, Chapter 8** owns caching as a correctness problem across service
  boundaries. This set's Volume 9 owns the Redis mechanics and the three classic bugs.
- **Microservices Volume 2, Chapter 7** owns the outbox and CDC. Volume 5 Chapter 8
  references it for the 2PC alternative rather than re-deriving it.
