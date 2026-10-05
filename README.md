# Interview Prep Guide

A curated study collection for technical interview preparation — concept notes, deep-dive
volumes, and printable PDF editions.

> **Start here:** [Interview Prep Guide](index.html) → browse all 35 volumes as a site, or jump
> straight to a track. Everything below is also listed per volume.

> **Looking to revise rather than learn?** Each volume has a condensed [cheatsheet](index.html)
> — the decisions, the traps, and the numbers, for use under interview pressure. Read a volume
> properly first; use these to revise. The catalogue wall links every volume and its cheatsheet
> side by side.

The volume links below point at the HTML pages in [`interview-prep/`](interview-prep/README.md),
which are the deliverable and are edited directly. There is no build step — the site is plain
static HTML and opens straight from a clone. See [interview-prep/README.md](interview-prep/README.md)
for the authoring contract.

## Available Topics

### Java — "The Java Complete Deep-Dive"

A 9-volume study & interview mastery guide by **Madhu Kumari**, covering Java from
fundamentals through modern language features, concurrency internals, and production
troubleshooting. Each volume ends with 100+ production-based and tricky scenario
questions for interview practice.

| # | Volume | Format |
|---|--------|--------|
| 1 | [Java Basics](interview-prep/java/java-01-java-basics.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%201%20(Java%20Basics).pdf) |
| 2 | [Object-Oriented Programming](interview-prep/java/java-02-object-oriented-programming.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%202%20(Object-Oriented%20Programming).pdf) |
| 3 | [Core Java](interview-prep/java/java-03-core-java.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%203%20(Core%20Java).pdf) |
| 4 | [Collections Framework](interview-prep/java/java-04-collections-framework.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%204%20(Collections%20Framework).pdf) |
| 5 | [Java 8+](interview-prep/java/java-05-java-8.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%205%20(Java%208%2B).pdf) |
| 6 | [Multithreading & Concurrency](interview-prep/java/java-06-multithreading-concurrency.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%206%20(Multithreading%20%26%20Concurrency).pdf) |
| 7 | [JVM Internals & Memory](interview-prep/java/java-07-jvm-internals-memory.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%207%20(JVM%20Internals%20%26%20Memory).pdf) |
| 8 | [Advanced Java](interview-prep/java/java-08-advanced-java.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%208%20(Advanced%20Java).pdf) |
| 9 | [Final Volume — Modern Java & Production Troubleshooting](interview-prep/java/java-09-final-volume.html) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%209%20(Modern%20Java%20%26%20Production%20Troubleshooting).pdf) |

### Spring — "The Spring Complete Deep-Dive"

An 11-volume study & interview mastery guide written at senior/staff level, covering the
Spring Framework end to end — the IoC container, AOP and proxying, transaction management,
Spring MVC, Spring Data JPA, Spring Boot auto-configuration, Spring Security, WebFlux, and
Spring Cloud. Every chapter is framed as a decision with a failure mode, and every volume
ends with a large interview scenario bank weighted toward design trade-offs.

| # | Volume |
|---|--------|
| 1 | [Spring Core & the IoC Container](interview-prep/spring/spring-01-spring-core-ioc.html) |
| 2 | [Bean Lifecycle, Scopes & Advanced DI](interview-prep/spring/spring-02-bean-lifecycle-scopes-di.html) |
| 3 | [AOP & Proxying](interview-prep/spring/spring-03-aop-proxying.html) |
| 4 | [Transaction Management](interview-prep/spring/spring-04-transaction-management.html) |
| 5 | [Spring MVC & the Web Layer](interview-prep/spring/spring-05-spring-mvc-web-layer.html) |
| 6 | [Spring Data JPA & Persistence](interview-prep/spring/spring-06-spring-data-jpa-persistence.html) |
| 7 | [Spring Boot & Auto-Configuration](interview-prep/spring/spring-07-spring-boot-auto-configuration.html) |
| 8 | [Spring Security](interview-prep/spring/spring-08-spring-security.html) |
| 9 | [Testing & Production Troubleshooting](interview-prep/spring/spring-09-testing-production-troubleshooting.html) |
| 10 | [WebFlux & Project Reactor](interview-prep/spring/spring-10-webflux-project-reactor.html) |
| 11 | [Spring Cloud & Distributed Systems](interview-prep/spring/spring-11-spring-cloud-distributed-systems.html) |

### Microservices — "The Microservices Complete Deep-Dive"

A 3-volume study & interview mastery guide at senior/staff level, covering distributed
systems as a discipline rather than a Spring feature set — where to put service
boundaries and when not to, DDD and decomposition, CAP and the consistency spectrum,
idempotency, event-driven architecture, sagas and the outbox, observability, resilience,
progressive delivery, Kubernetes and service mesh. Every chapter is framed as a decision
with a failure mode, a migration cost, and a scenario bank weighted toward design
trade-offs.

| # | Volume |
|---|--------|
| 1 | [Foundations — Boundaries & Decomposition](interview-prep/microservices/microservices-01-boundaries-decomposition.html) |
| 2 | [Communication, Data & Consistency](interview-prep/microservices/microservices-02-communication-data-consistency.html) |
| 3 | [Operations, Platforms & Evolution](interview-prep/microservices/microservices-03-operations-platforms-evolution.html) |

### Database — "The Database Complete Deep-Dive"

An 11-volume study & interview mastery guide at senior/staff level, covering databases
from the storage engine up — the physical layer, the relational model, SQL as a language,
indexing and query execution, transactions and concurrency, schema design and scaling, and
then a deep dive on each engine: PostgreSQL, MySQL, Redis, Cassandra, DynamoDB, MongoDB,
Elasticsearch, and S3. The volume is framed around where the abstraction stops paying for
itself: why `SELECT *` is a page-count problem before it is a bandwidth problem, why the
optimiser is a cost estimator rather than a mind reader, and what a shard key costs to
undo. Volume 11 carries a consolidated database & SQL interview bank of 150+ questions
organised by category rather than by volume.

| # | Volume |
|---|--------|
| 1 | [Database Fundamentals & the Relational Model](interview-prep/database/database-01-fundamentals-relational-model.html) |
| 2 | [SQL — DDL, DML & Constraints](interview-prep/database/database-02-sql-ddl-dml-constraints.html) |
| 3 | [SQL — Queries, Joins, CTEs & Window Functions](interview-prep/database/database-03-sql-queries-joins-window-functions.html) |
| 4 | [Indexes, Query Planning & Execution](interview-prep/database/database-04-indexes-query-planning-execution.html) |
| 5 | [Transactions, Isolation Levels & Concurrency](interview-prep/database/database-05-transactions-isolation-concurrency.html) |
| 6 | [Schema Design, Partitioning & Scaling](interview-prep/database/database-06-schema-design-partitioning-scaling.html) |
| 7 | [PostgreSQL](interview-prep/database/database-07-postgresql.html) |
| 8 | [MySQL](interview-prep/database/database-08-mysql.html) |
| 9 | [Redis & Caching Strategies](interview-prep/database/database-09-redis-caching.html) |
| 10 | [NoSQL & Distributed Stores — Cassandra, DynamoDB, MongoDB](interview-prep/database/database-10-nosql-cassandra-dynamodb-mongodb.html) |
| 11 | [S3, Elasticsearch & the Database Interview Bank](interview-prep/database/database-11-s3-elasticsearch-interview-bank.html) |

## Suggested Study Path

**Java** — Volumes 1 → 3 build the language foundation, 4 → 5 cover the library and
functional programming, 6 → 7 go deep on concurrency and the JVM, and 8 → 9 cover advanced
topics, modern Java (17/21, virtual threads, structured concurrency), and production
scenarios.

**Spring** — Volumes 1 → 2 establish the container and the bean lifecycle, 3 → 4 cover the
two cross-cutting concerns (AOP and transactions) that break silently when misunderstood, 5
→ 6 are the web and data layers, 7 → 8 are the Boot and Security stack, 9 is the practical
volume on testing and production troubleshooting, and 10 → 11 cover the reactive and
distributed frontier. The Java volumes 1 → 7 are a useful prerequisite for the Spring set.

**Microservices** — Volume 1 is the paradigm material (boundary cost, DDD, decomposition,
the modular monolith, Conway's law, migration) and is best read before or alongside Spring
Volume 11, which treats the same territory as a framework feature set. Volume 2 is the
data-and-consistency core (CAP, idempotency, contracts, events, sagas, outbox) and is the
most heavily weighted toward design trade-offs. Volume 3 is the operational half
(observability, resilience, delivery, Kubernetes, mesh, scaling) and assumes you can
reason about failure modes rather than just framework configuration.

**Database** — Volumes 1 → 6 are the portable material and the sensible order: Volume 1
gives you the physical and logical model, 2 → 3 make SQL a language you can write fluently
rather than pattern-match, 4 → 5 are the two that decide whether your application is fast
and correct, and 6 is where schema choices start becoming irreversible. Volumes 7 → 8 are
the relational engines most teams actually run, 9 is the cache in front of everything, 10
is the NoSQL set, and 11 is object storage plus search plus the consolidated interview
bank. Volumes 1 → 5 are assumed knowledge for the Spring set's Volume 6 (Spring Data JPA
& Persistence), which treats the ORM's default behaviour as the dangerous thing, and
Volume 5's isolation material underpins the Microservices set's Volume 2.

## Repository Layout

```
.
├── README.md
├── CLAUDE.md
├── index.html                           # The catalogue wall — the only index
├── fonts/                               # Self-hosted webfonts
├── java/
│   └── pdfs/                            # Printable PDF editions
└── interview-prep/
    ├── README.md                        # Authoring contract for both content types
    ├── site.css                         # Tokens, layout, light/dark; then long-form styles
    ├── toc.js                           # Chapter scroll-spy
    ├── search.js                        # Shared filtering
    ├── highlight.js                     # Code block labelling + highlighting
    ├── check.js                         # Contract checker for all three page shapes
    ├── java/          01..09-*.html      # The deep-dive volumes
    ├── spring/        01..11-*.html
    ├── microservices/ 01..03-*.html
    ├── database/      01..11-*.html
    └── cheatsheets/
        ├── java/          01..09-*.html # One condensed page per volume
        ├── spring/        01..11-*.html
        ├── microservices/ 01..03-*.html
        └── database/      01..11-*.html
```

The volumes were originally authored as markdown and rendered into HTML by a
zero-dependency Node build. That conversion was a one-time task and has been retired, along
with the markdown sources; they remain in git history at commit `fcec505`. The HTML is now
the source of truth and is edited directly.

## Contributing

Edit the HTML. The volumes and the cheatsheets are both hand-authored now, and neither is
generated — there is no build step to run and nothing to rebuild. Both follow the single
authoring contract in [`interview-prep/README.md`](interview-prep/README.md); the cheatsheets
in particular are deliberately hand-condensed from the corresponding volume rather than derived
mechanically.

Before committing a page edit, run its checker. The flag selects the contract:

```
node interview-prep/check.js --volume     interview-prep/java/java-01-java-basics.html
node interview-prep/check.js --cheatsheet interview-prep/cheatsheets/java/01-java-basics.html
node interview-prep/check.js --index      index.html
```

All three resolve every relative link on disk, so a page that still points at an archived file
fails rather than shipping a dead link.
