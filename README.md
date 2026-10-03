# Interview Prep Guide

A curated study collection for technical interview preparation — concept notes, deep-dive
volumes, and printable PDF editions.

> **Start here:** [Interview Prep Guide](index.html) → browse all 34 volumes as a site, or jump
> straight to a track. Everything below is also listed per volume, and each links to both the
> rendered page and its markdown source.

> **Looking to revise rather than learn?** [Cheatsheets](cheatsheets/index.html) condense all 34
> volumes to one scannable page each — the decisions, the traps, and the numbers, for use
> under interview pressure. Read a volume properly first; use these to revise.

The volume links below point at the rendered HTML, with the markdown source beside each one.
The `.md` files remain the source of truth; the HTML is generated from them by
`guides/build.js`, a zero-dependency Node script. See [guides/README.md](guides/README.md).

## Available Topics

### Java — "The Java Complete Deep-Dive"

A 9-volume study & interview mastery guide by **Madhu Kumari**, covering Java from
fundamentals through modern language features, concurrency internals, and production
troubleshooting. Each volume ends with 100+ production-based and tricky scenario
questions for interview practice.

| # | Volume | Format |
|---|--------|--------|
| 1 | [Java Basics](guides/java/java-01-java-basics.html) &middot; [source](java/java-deep-dive-volume-01-java-basics.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%201%20(Java%20Basics).pdf) |
| 2 | [Object-Oriented Programming](guides/java/java-02-object-oriented-programming.html) &middot; [source](java/java-deep-dive-volume-02-object-oriented-programming.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%202%20(Object-Oriented%20Programming).pdf) |
| 3 | [Core Java](guides/java/java-03-core-java.html) &middot; [source](java/java-deep-dive-volume-03-core-java.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%203%20(Core%20Java).pdf) |
| 4 | [Collections Framework](guides/java/java-04-collections-framework.html) &middot; [source](java/java-deep-dive-volume-04-collections-framework.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%204%20(Collections%20Framework).pdf) |
| 5 | [Java 8+](guides/java/java-05-java-8.html) &middot; [source](java/java-deep-dive-volume-05-java-8.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%205%20(Java%208%2B).pdf) |
| 6 | [Multithreading & Concurrency](guides/java/java-06-multithreading-concurrency.html) &middot; [source](java/java-deep-dive-volume-06-multithreading-concurrency.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%206%20(Multithreading%20%26%20Concurrency).pdf) |
| 7 | [JVM Internals & Memory](guides/java/java-07-jvm-internals-memory.html) &middot; [source](java/java-deep-dive-volume-07-jvm-internals-memory.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%207%20(JVM%20Internals%20%26%20Memory).pdf) |
| 8 | [Advanced Java](guides/java/java-08-advanced-java.html) &middot; [source](java/java-deep-dive-volume-08-advanced-java.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%208%20(Advanced%20Java).pdf) |
| 9 | [Final Volume — Modern Java & Production Troubleshooting](guides/java/java-09-final-volume.html) &middot; [source](java/java-deep-dive-volume-09-final-volume.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%209%20(Modern%20Java%20%26%20Production%20Troubleshooting).pdf) |

### Spring — "The Spring Complete Deep-Dive"

An 11-volume study & interview mastery guide written at senior/staff level, covering the
Spring Framework end to end — the IoC container, AOP and proxying, transaction management,
Spring MVC, Spring Data JPA, Spring Boot auto-configuration, Spring Security, WebFlux, and
Spring Cloud. Every chapter is framed as a decision with a failure mode, and every volume
ends with a large interview scenario bank weighted toward design trade-offs.

| # | Volume |
|---|--------|
| 1 | [Spring Core & the IoC Container](guides/spring/spring-01-spring-core-ioc.html) &middot; [source](spring/spring-deep-dive-volume-01-spring-core-ioc.md) |
| 2 | [Bean Lifecycle, Scopes & Advanced DI](guides/spring/spring-02-bean-lifecycle-scopes-di.html) &middot; [source](spring/spring-deep-dive-volume-02-bean-lifecycle-scopes-di.md) |
| 3 | [AOP & Proxying](guides/spring/spring-03-aop-proxying.html) &middot; [source](spring/spring-deep-dive-volume-03-aop-proxying.md) |
| 4 | [Transaction Management](guides/spring/spring-04-transaction-management.html) &middot; [source](spring/spring-deep-dive-volume-04-transaction-management.md) |
| 5 | [Spring MVC & the Web Layer](guides/spring/spring-05-spring-mvc-web-layer.html) &middot; [source](spring/spring-deep-dive-volume-05-spring-mvc-web-layer.md) |
| 6 | [Spring Data JPA & Persistence](guides/spring/spring-06-spring-data-jpa-persistence.html) &middot; [source](spring/spring-deep-dive-volume-06-spring-data-jpa-persistence.md) |
| 7 | [Spring Boot & Auto-Configuration](guides/spring/spring-07-spring-boot-auto-configuration.html) &middot; [source](spring/spring-deep-dive-volume-07-spring-boot-auto-configuration.md) |
| 8 | [Spring Security](guides/spring/spring-08-spring-security.html) &middot; [source](spring/spring-deep-dive-volume-08-spring-security.md) |
| 9 | [Testing & Production Troubleshooting](guides/spring/spring-09-testing-production-troubleshooting.html) &middot; [source](spring/spring-deep-dive-volume-09-testing-production-troubleshooting.md) |
| 10 | [WebFlux & Project Reactor](guides/spring/spring-10-webflux-project-reactor.html) &middot; [source](spring/spring-deep-dive-volume-10-webflux-project-reactor.md) |
| 11 | [Spring Cloud & Distributed Systems](guides/spring/spring-11-spring-cloud-distributed-systems.html) &middot; [source](spring/spring-deep-dive-volume-11-spring-cloud-distributed-systems.md) |

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
| 1 | [Foundations — Boundaries & Decomposition](guides/microservices/microservices-01-boundaries-decomposition.html) &middot; [source](microservices/microservices-deep-dive-volume-01-boundaries-decomposition.md) |
| 2 | [Communication, Data & Consistency](guides/microservices/microservices-02-communication-data-consistency.html) &middot; [source](microservices/microservices-deep-dive-volume-02-communication-data-consistency.md) |
| 3 | [Operations, Platforms & Evolution](guides/microservices/microservices-03-operations-platforms-evolution.html) &middot; [source](microservices/microservices-deep-dive-volume-03-operations-platforms-evolution.md) |

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
| 1 | [Database Fundamentals & the Relational Model](guides/database/database-01-fundamentals-relational-model.html) &middot; [source](database/database-deep-dive-volume-01-fundamentals-relational-model.md) |
| 2 | [SQL — DDL, DML & Constraints](guides/database/database-02-sql-ddl-dml-constraints.html) &middot; [source](database/database-deep-dive-volume-02-sql-ddl-dml-constraints.md) |
| 3 | [SQL — Queries, Joins, CTEs & Window Functions](guides/database/database-03-sql-queries-joins-window-functions.html) &middot; [source](database/database-deep-dive-volume-03-sql-queries-joins-window-functions.md) |
| 4 | [Indexes, Query Planning & Execution](guides/database/database-04-indexes-query-planning-execution.html) &middot; [source](database/database-deep-dive-volume-04-indexes-query-planning-execution.md) |
| 5 | [Transactions, Isolation Levels & Concurrency](guides/database/database-05-transactions-isolation-concurrency.html) &middot; [source](database/database-deep-dive-volume-05-transactions-isolation-concurrency.md) |
| 6 | [Schema Design, Partitioning & Scaling](guides/database/database-06-schema-design-partitioning-scaling.html) &middot; [source](database/database-deep-dive-volume-06-schema-design-partitioning-scaling.md) |
| 7 | [PostgreSQL](guides/database/database-07-postgresql.html) &middot; [source](database/database-deep-dive-volume-07-postgresql.md) |
| 8 | [MySQL](guides/database/database-08-mysql.html) &middot; [source](database/database-deep-dive-volume-08-mysql.md) |
| 9 | [Redis & Caching Strategies](guides/database/database-09-redis-caching.html) &middot; [source](database/database-deep-dive-volume-09-redis-caching.md) |
| 10 | [NoSQL & Distributed Stores — Cassandra, DynamoDB, MongoDB](guides/database/database-10-nosql-cassandra-dynamodb-mongodb.html) &middot; [source](database/database-deep-dive-volume-10-nosql-cassandra-dynamodb-mongodb.md) |
| 11 | [S3, Elasticsearch & the Database Interview Bank](guides/database/database-11-s3-elasticsearch-interview-bank.html) &middot; [source](database/database-deep-dive-volume-11-s3-elasticsearch-interview-bank.md) |

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
├── java/
│   ├── java-deep-dive-volume-01..09-*.md   # Markdown source for each volume
│   └── pdfs/                                # Printable PDF editions
├── spring/
│   └── spring-deep-dive-volume-01..11-*.md  # Markdown source for each volume
├── microservices/
│   └── microservices-deep-dive-volume-01..03-*.md  # Markdown source for each volume
├── database/
│   ├── README.md                                     # Authoring format contract
│   └── database-deep-dive-volume-01..11-*.md        # Markdown source for each volume
└── cheatsheets/
    ├── index.html                            # All 34 cheatsheets, grouped by track
    ├── README.md                             # Cheatsheet authoring contract
    ├── cheatsheet.css                        # Shared stylesheet
    ├── search.js                             # Shared filtering
    ├── highlight.js                          # Code block labelling + highlighting
    ├── java/          01..09-*.html           # One condensed page per volume
    ├── spring/        01..11-*.html
    ├── microservices/ 01..03-*.html
    └── database/      01..11-*.html
```

## Contributing

Add new material as Markdown under a topic folder, and link it from this README so it
stays discoverable.

Cheatsheets live in [`cheatsheets/`](cheatsheets/README.md) and follow their own authoring
contract. Each one is hand-authored from its source volume rather than generated, and
carries a link back to that volume so any claim on the page is traceable.

The rendered volumes in [`guides/`](guides/README.md) are generated, so **edit the markdown,
not the HTML**. Rebuild with `node guides/build.js`; `node guides/build.js --check` asserts
without writing and also fails if the committed HTML is stale. The build checks word and code
conservation per file, so a renderer that dropped a chapter or mangled a diagram fails
rather than shipping.
