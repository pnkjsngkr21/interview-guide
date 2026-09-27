# Interview Prep Guide

A curated study collection for technical interview preparation — concept notes, deep-dive
volumes, and printable PDF editions.

## Available Topics

### Java — "The Java Complete Deep-Dive"

A 9-volume study & interview mastery guide by **Madhu Kumari**, covering Java from
fundamentals through modern language features, concurrency internals, and production
troubleshooting. Each volume ends with 100+ production-based and tricky scenario
questions for interview practice.

| # | Volume | Format |
|---|--------|--------|
| 1 | [Java Basics](java/java-deep-dive-volume-01-java-basics.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%201%20(Java%20Basics).pdf) |
| 2 | [Object-Oriented Programming](java/java-deep-dive-volume-02-object-oriented-programming.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%202%20(Object-Oriented%20Programming).pdf) |
| 3 | [Core Java](java/java-deep-dive-volume-03-core-java.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%203%20(Core%20Java).pdf) |
| 4 | [Collections Framework](java/java-deep-dive-volume-04-collections-framework.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%204%20(Collections%20Framework).pdf) |
| 5 | [Java 8+](java/java-deep-dive-volume-05-java-8.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%205%20(Java%208%2B).pdf) |
| 6 | [Multithreading & Concurrency](java/java-deep-dive-volume-06-multithreading-concurrency.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%206%20(Multithreading%20%26%20Concurrency).pdf) |
| 7 | [JVM Internals & Memory](java/java-deep-dive-volume-07-jvm-internals-memory.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%207%20(JVM%20Internals%20%26%20Memory).pdf) |
| 8 | [Advanced Java](java/java-deep-dive-volume-08-advanced-java.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%208%20(Advanced%20Java).pdf) |
| 9 | [Final Volume — Modern Java & Production Troubleshooting](java/java-deep-dive-volume-09-final-volume.md) | [PDF](java/pdfs/Java%20Deep-Dive%20Study%20Guide%20-%20Volume%209%20(Modern%20Java%20%26%20Production%20Troubleshooting).pdf) |

### Spring — "The Spring Complete Deep-Dive"

An 11-volume study & interview mastery guide written at senior/staff level, covering the
Spring Framework end to end — the IoC container, AOP and proxying, transaction management,
Spring MVC, Spring Data JPA, Spring Boot auto-configuration, Spring Security, WebFlux, and
Spring Cloud. Every chapter is framed as a decision with a failure mode, and every volume
ends with a large interview scenario bank weighted toward design trade-offs.

| # | Volume |
|---|--------|
| 1 | [Spring Core & the IoC Container](spring/spring-deep-dive-volume-01-spring-core-ioc.md) |
| 2 | [Bean Lifecycle, Scopes & Advanced DI](spring/spring-deep-dive-volume-02-bean-lifecycle-scopes-di.md) |
| 3 | [AOP & Proxying](spring/spring-deep-dive-volume-03-aop-proxying.md) |
| 4 | [Transaction Management](spring/spring-deep-dive-volume-04-transaction-management.md) |
| 5 | [Spring MVC & the Web Layer](spring/spring-deep-dive-volume-05-spring-mvc-web-layer.md) |
| 6 | [Spring Data JPA & Persistence](spring/spring-deep-dive-volume-06-spring-data-jpa-persistence.md) |
| 7 | [Spring Boot & Auto-Configuration](spring/spring-deep-dive-volume-07-spring-boot-auto-configuration.md) |
| 8 | [Spring Security](spring/spring-deep-dive-volume-08-spring-security.md) |
| 9 | [Testing & Production Troubleshooting](spring/spring-deep-dive-volume-09-testing-production-troubleshooting.md) |
| 10 | [WebFlux & Project Reactor](spring/spring-deep-dive-volume-10-webflux-project-reactor.md) |
| 11 | [Spring Cloud & Distributed Systems](spring/spring-deep-dive-volume-11-spring-cloud-distributed-systems.md) |

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
| 1 | [Foundations — Boundaries & Decomposition](microservices/microservices-deep-dive-volume-01-boundaries-decomposition.md) |
| 2 | [Communication, Data & Consistency](microservices/microservices-deep-dive-volume-02-communication-data-consistency.md) |
| 3 | [Operations, Platforms & Evolution](microservices/microservices-deep-dive-volume-03-operations-platforms-evolution.md) |

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

## Repository Layout

```
.
├── README.md
├── java/
│   ├── java-deep-dive-volume-01..09-*.md   # Markdown source for each volume
│   └── pdfs/                                # Printable PDF editions
├── spring/
│   └── spring-deep-dive-volume-01..11-*.md  # Markdown source for each volume
└── microservices/
    └── microservices-deep-dive-volume-01..03-*.md  # Markdown source for each volume
```

## Contributing

Add new material as Markdown under a topic folder, and link it from this README so it
stays discoverable.
