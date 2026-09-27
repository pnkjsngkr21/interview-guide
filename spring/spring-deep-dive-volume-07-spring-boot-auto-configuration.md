---
title: "The Spring Complete Deep-Dive"
volume: 7
series: "SPRING BOOT & AUTO-CONFIGURATION"
subtitle: "Study & Interview Mastery Guide"
---

# The Spring Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

Volume 7 is where Spring stops being a framework you configure and becomes an ecosystem
you inherit. Everything in the previous six volumes — the container, the proxy chain, the
transaction boundary, the `DispatcherServlet`, the persistence context — was assembled by
hand, one bean at a time, by a team who knew exactly what they wanted. Spring Boot's
proposition is that most teams do not know that, and that the correct response is to give
them a set of decisions that were already made competently and let them override the ones
they care about.

That proposition is genuinely good, and it is also where the staff-level conversation
starts. Because the whole design rests on a *silent* mechanism — auto-configuration backs
away when your bean exists and says nothing when it doesn't — every default becomes an
invisible decision that a team either made deliberately or inherited by accident. The
interview question is no longer "what does `@EnableAutoConfiguration` do". It is "which of
these defaults is wrong for your workload, and how would you know?" An answer that lists
`open-in-view` and `ddl-auto` is competent. An answer that names the connection pool, the
Tomcat thread count, the actuator exposure surface, and the packaged-jar static-resource
404 is staff.

The organising spine of this volume is therefore *decision review*, not API recall. We take
each Boot subsystem — the starter, the condition, the config property, the jar, the actuator
endpoint — and ask the four questions a design review actually asks: what did Boot decide,
what did that decision cost, what breaks at the boundary of your workload, and how expensive
is it to undo. Chapter 1 is the inventory of Boot's opinions. Chapter 2 is the mechanism
that makes them reversible. Chapter 3 is the dependency graph hiding inside a starter. Chapter
4 is the configuration surface and its secret-leak endpoints. Chapter 5 is the packaging
format and the JVM flags a platform team will ask for. Chapter 6 is AOT and native image,
where the trade is cold-start against build-time cost. Chapter 7 is the observability
surface, where exposure is a security decision and cardinality is a memory leak.

> **MUST REMEMBER**
>
> Convention over configuration is not the absence of configuration — it is configuration
> you did not write. A default is a decision someone else made on your behalf, and the
> senior skill is not memorising defaults, it is knowing *which* defaults are load-bearing
> for your workload before production finds out for you.

### Continuing From Volume 6

Volume 6 closed on the persistence context, fetch strategies, and Hibernate tuning. That
work assumed you had a `DataSource`, a transaction manager, and a configured
`spring.jpa.*` namespace. This volume is where those things come from — and where several
of the defaults that Volume 6 had to work around were actually set.

| Volume | Coverage |
| --- | --- |
| Volume 1 | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 (this book) | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 7

- Chapter 1 — Spring Boot's Thesis
- Chapter 2 — Auto-Configuration
- Chapter 3 — Starters & Dependency Management
- Chapter 4 — Externalized Configuration
- Chapter 5 — The Executable JAR
- Chapter 6 — AOT & GraalVM Native Image
- Chapter 7 — Actuator, Metrics & Observability
- Chapter 8 — Interview Scenario Bank

---

# Part 1 — Spring Boot & Auto-Configuration

## Chapter 1 — Spring Boot's Thesis

### 1.1 The Five Things Spring Boot Actually Is

Most people describe Spring Boot as "Spring with auto-configuration". That is one of five
things, and the one that matters least, because auto-configuration is the part you can
already reason about once you understand `@Conditional` — which is Chapter 2.

```text
┌───────────────────────────────────────────────────────────────────┐
│  1. AN OPINIONATED DEPENDENCY SET                                │
│     spring-boot-dependencies BOM — versions pinned, no            │
│     dependencyManagement, no parent-of-your-own                  │
├───────────────────────────────────────────────────────────────────┤
│  2. A STARTER PACKAGING CONVENTION                                │
│     A POM with no code that means "these libraries, these         │
│     versions, already reconciled"                                 │
├───────────────────────────────────────────────────────────────────┤
│  3. AN AUTO-CONFIGURATION LAYER                                   │
│     Conditions decide which of Boot's own @Configuration         │
│     classes apply to YOUR classpath and YOUR properties          │
├───────────────────────────────────────────────────────────────────┤
│  4. AN EXECUTABLE JAR                                             │
│     Repackaged with BOOT-INF/, launched by a custom classloader,  │
│     runnable with java -jar and deployable as one artefact       │
├───────────────────────────────────────────────────────────────────┤
│  5. ACTUATORS + EMBEDDED SERVERS                                 │
│     Tomcat/Netty/Jetty in-process; /actuator/* as the             │
│     management surface over the same port                         │
└───────────────────────────────────────────────────────────────────┘
```

Notice what is *not* in that list: the IoC container, the AOP proxy chain, the MVC
dispatcher, the transaction manager. Boot did not replace or wrap any of it. Boot is a
**layer above Spring Framework** that makes a reasonable set of choices and then gets out
of the way. The confusion this causes is real: interview candidates who say "Spring Boot
is the thing that does dependency injection" are describing Volume 1, and the interviewer
knows it.

The other thing that is deliberately absent from the list is **a deployment model**. Boot
ships an executable jar because that was the right answer for "how does a team deploy this
in 2013-2016", and it kept shipping it after the answer changed. Chapter 5 is largely about
what that decision costs in 2026 and when a JVM deployment beats a native one.

### 1.2 `@SpringBootApplication`, Decomposed

The single most examined annotation in the Spring ecosystem, and the one most often
answered as "it's a convenience annotation". Decompose it — the three constituents do three
genuinely different things and have three different blast radii.

```java
@SpringBootApplication
// = @SpringBootConfiguration
// + @EnableAutoConfiguration
// + @ComponentScan
public class OrderServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(OrderServiceApplication.class, args);
    }
}
```

| Constituent | What it does | What it does NOT do | Failure mode if misconfigured |
| --- | --- | --- | --- |
| `@SpringBootConfiguration` | Marks the class as the application root; itself `@Configuration`. | — | Two `@SpringBootConfiguration` classes on the classpath produce `Found multiple @SpringBootConfiguration` in *tests* |
| `@EnableAutoConfiguration` | Imports every auto-configuration listed in `AutoConfiguration.imports` that passes its `@Conditional`s. | It does NOT scan your packages. | Absent it, nothing is auto-configured and the app fails to start missing a `DataSource` or `DispatcherServlet` |
| `@ComponentScan` | Scans **the package of the annotated class and everything below it** for `@Component` and friends. | It does NOT scan parent packages. | Sitting in `com.acme` in a monorepo pulls in every module — see 1.5 |

Two facts here are the ones interviewers probe:

1. **`@SpringBootConfiguration` is a test-time hazard, not a runtime one.** A
   `@SpringBootTest` searches upward from the test class for exactly one
   `@SpringBootConfiguration` and fails if it finds two. A multi-module build where the
   shared `test` module has a test-support `@SpringBootApplication` and the service module
   has its own produces exactly that error — and the fix is `@SpringBootTest(classes = …)`
   or moving the shared config out of a scanned package.

2. **`@ComponentScan` without a base package scans the declaring class's package.** Not
   the JVM's root package, not "the whole project" — the package of the class carrying the
   annotation, and everything beneath it. Volume 1 Chapter 4 covers the scanning mechanics
   (ASM metadata reading, filters, `proxyBeanMethods`); what matters here is that the
   scope of your scan is decided by *where you put your main class*, which is a
   file-location decision that nobody reviews.

### 1.3 Convention over Configuration, Honestly Assessed

What it buys, concretely:

| Boot gives you | The decision you no longer make | Cost if you'd made it yourself |
| --- | --- | --- |
| `spring-boot-starter-web` | Which Jackson, which Tomcat, which validation API | ~3 hours of version reconciliation per project, and a different answer per project |
| `DataSourceAutoConfiguration` | Pool choice (HikariCP), validation query, connection lifecycle | The single most-reinvented piece of config in the Java ecosystem |
| `JacksonAutoConfiguration` | `ObjectMapper` with `JavaTimeModule` registered, `WRITE_DATES_AS_TIMESTAMPS` disabled | An API that returns epoch-millis for dates nobody asked for |
| `DispatcherServletAutoConfiguration` | The `DispatcherServlet` registration, its `CharacterEncodingFilter`, the error-page mapping | A war file that 404s on `/` because you forgot the servlet mapping |
| `spring.factories` / BOM | Version alignment across 60 transitive dependencies | The classpath hell that made "Java EE" a pejorative in 2015 |

Where the convention becomes a liability — and these are the honest answers, not
boot-camping:

1. **The defaults are tuned for a demo, not a workload.** Hikari's 10-connection pool
   assumes a low-concurrency service. `open-in-view=true` assumes the UI and the service
   are the same deployable. `max-threads=200` assumes requests are short. None of these
   is a *wrong* default; all of them are a default for a workload that is not yours.

2. **Silence makes overrides hard to find.** When Boot backs off because your bean
   exists, it logs nothing. That is a deliberate design decision (it would otherwise spam
   every startup) and it means the *presence* of an auto-configuration is the thing you
   have to go looking for — which is exactly what `/actuator/conditions` is for.

3. **Convention is a coupling to Boot's release cadence.** Every default is a value you
   can only change by *overriding*, never by *configuring the mechanism*. The moment a
   default is wrong, you fork the behaviour, and a minor upgrade can change the default
   underneath your override. This is a real cost and it is the strongest argument for
   knowing the defaults rather than trusting them.

4. **It collapses the "what did we decide" question.** In a non-Boot Spring application,
   reading `web.xml` plus five `@Configuration` classes tells you the whole web
   configuration. In a Boot application, most of it is implicit and lives in a jar you did
   not write. The compensating discipline is a documented, reviewed
   `application.yml` — not the default one you never wrote.

> **TRADE-OFF**
>
> Convention over configuration trades *control* for *time-to-first-request*. The flip
> condition is workload specificity: the moment your service is not a CRUD app with a
> single database and modest concurrency, the defaults stop being free and start being
> decisions you are making by accident. The condition does NOT flip back for a small team
> shipping a small service — for that case the defaults are genuinely correct and
> overriding them is the mistake.

### 1.4 Which Defaults Are Wrong for Your Workload

This is the staff-level spine of the chapter, and the one to rehearse. The right shape is
a table of default → what it assumes → when it's wrong → the override. The wrong shape is
a list of property names.

| Default | Value | What it assumes | Wrong when | Override |
| --- | --- | --- | --- | --- |
| `spring.jpa.open-in-view` | `true` | The UI shares a process with the service and serialises JPA entities in the view layer | You serialise entities to JSON, the session stays open for the whole request, and a slow serialisation holds a DB connection | `false` — always, in a service returning DTOs |
| `spring.jpa.hibernate.ddl-auto` | `create-drop` for embedded DBs, `none` otherwise | Nobody uses the schema in prod | You're relying on it in dev *and* forgetting that production runs Flyway/Liquibase | `validate` (prod), `create-drop` (H2 only) |
| `spring.datasource.hikari.maximum-pool-size` | `10` | Low concurrency, cheap queries | Latency-bound services where 10 connections × 2s query latency caps throughput at 5 QPS regardless of how many app threads you have | Size from the Little's-law calculation in Volume 9 |
| `server.tomcat.threads.max` | `200` | Short requests | Thread-per-request with blocking I/O downstream; 200 × 1MB stack ≈ 200MB of heap before any of your data | Size to the database pool and the downstream budget, not to "more is better" |
| `spring.mvc.servlet.path` | `/` | Root mapping | You set it to `/app` and now static resources 404 | Leave it at `/`; if you need a context path use `server.servlet.context-path` |
| `spring.jackson.default-property-inclusion` | `always` (nulls serialised) | The client wants every field | Your API contract says "absent means null" or the other way round; a 200KB DTO padded with nulls | `non_null`, or `@JsonInclude` per type — a contract decision, not a preference |
| `management.endpoints.web.exposure.include` | `health` | Nothing | Nothing — this default is CORRECT and is the one people wrongly widen | Leave it. Chapter 7 |
| `management.endpoint.health.show-details` | `never` | Anonymous callers get only `status` | Never for a public endpoint; `when-authorized` for internal | `when-authorized` + auth |
| `server.error.include-stacktrace` | `never` | Errors are not diagnostic material for the caller | Never in prod; a support engineer needs correlation IDs instead | Leave it; add a correlation ID to the error body |

Three of these are commonly misstated, and getting them wrong in an interview costs the
point:

> **INTERVIEW TRAP — THE THREE THAT GET MISSTATED**
>
> **`open-in-view` is `true` by default**, not `false`. It has been the default since
> Boot 1.x and there is no deprecation path that flips it — which is precisely why every
> service should set it to `false` explicitly and mean it. **`ddl-auto` has no single
> default**: Boot sets it to `create-drop` when it detects an *embedded* database (H2,
> HSQLDB, Derby) and to `none` otherwise — so "the default is none" is right for Postgres
> and wrong for an H2-backed test. And **actuator's default web exposure is `health`
> only** — not `health,info`, and emphatically not `*`. The "expose everything in a dev
> profile" reflex is the single most common actuator security mistake, and Chapter 7 covers
> why it is a breach rather than a shortcut.

The `open-in-view` one deserves a mechanism, because "it keeps the session open" is only
half the story. `OpenEntityManagerInViewInterceptor` binds an `EntityManager` to the
request thread for the entire request lifecycle, including **serialisation**. On a read-
heavy service with lazy associations and Jackson serialisation, a single request can hold a
connection for the entire response — and the connection pool, not the JVM, becomes the
ceiling. The metric that shows it: pool active connections pinned near `maximum-pool-size`
with low transaction throughput, and request threads in `WAITING` on `HikariPool.getConnection`.

> **PRODUCTION SCENARIO**
>
> Problem: after a module upgrade, p99 latency on the read endpoints went from 90ms to
> 4.1s; p50 was unchanged.
> Investigation: Hikari metrics showed active connections at the pool ceiling (10/10)
> almost permanently, with 200 Tomcat threads queued on `getConnection`. Thread dumps
> showed most of them inside Jackson serialisation, not inside a transaction.
> Root cause: a circular JSON structure introduced a lazy association that Jackson
> resolved, and `open-in-view=true` held the `EntityManager` (and its connection) open
> through serialisation — so ten slow serialisations filled the pool for everyone.
> Solution: `spring.jpa.open-in-view=false`, plus DTOs that the persistence layer
> populates eagerly. The property alone fixed the saturation; the DTO change fixed the
> 4.1s.
> Prevention: a load test that asserts p99, and a startup check that fails if
> `open-in-view` is true in a non-local profile — the property is cheap to assert and
> expensive to discover.

The `spring.mvc.servlet.path` surprise deserves its own paragraph because it produces a
confusing, frequently misdiagnosed 404. Historically, `DispatcherServlet` was mapped at the
context root and the container's default servlet served `/` — so `GET /app.js` hit the
default servlet and found the static resource. Set `spring.mvc.servlet.path=/app` and Boot
maps the `DispatcherServlet` to `/app/*`; the container's default servlet is no longer
registered at `/`, so anything not under `/app` — including static resources and the
`/index.html` most SPA builds need — returns 404. The fix is to not set it, and if you
genuinely need a context path, use `server.servlet.context-path` instead, which leaves
the servlet mapping at `/`.

### 1.5 The `@SpringBootApplication` Scan-Root Trap

This is the highest-frequency Boot mistake in large codebases, and it is worth
understanding as a *mechanism* rather than a warning.

`@ComponentScan` with no `basePackages`/`baseClassPattern` attribute defaults to the
**package of the class carrying it, and every sub-package**. So the scan root is a
*consequence of file location*:

```text
com.acme                              ← NOT scanned
com.acme.orders                       ← NOT scanned
com.acme.orders.OrderServiceApplication  ← the class is here → root = com.acme.orders
   ├── OrderController                ← scanned
   ├── OrderService                   ← scanned
   └── infra                          ← scanned
com.acme.orders.shipping              ← NOT scanned (sibling)
com.acme.billing                      ← NOT scanned
```

The trap is the second row: a monorepo where every team names their root package
`com.acme.<team>` and someone drops the main class in `com.acme` "because that's the
application root". Everything in the org is now a candidate. Volume 1 Chapter 4 gives the
performance framing — ASM-level scan of every class on the classpath — but the *staff*
framing is worse than slow startup: the context now contains beans you did not ask for,
from modules that may have their own `@Bean` definitions, their own `@Transactional`
boundaries, and their own `spring.factories` entries. Two teams' components can be
auto-configured into each other's contexts, and the resulting `NoUniqueBeanDefinitionException`
points at a file neither team touched.

The correct placement rule is one line and it is worth putting in a team's contribution
guide: **the `@SpringBootApplication` class belongs in the narrowest package that contains
all of this service's own beans, and in no broader one.** A service with modules
`order`, `shipping`, and `shared` puts its main class in the service's root package and
uses explicit `@Import` for anything outside — or, better, does not use `@ComponentScan`
for shared beans at all and lets auto-configuration supply them.

> **SCALING REALITY CHECK**
>
> The scan cost is roughly linear in the number of classes under the root, and the
> *blast radius* is what actually hurts. A `basePackages = "com.acme"` scan in a
> 500-developer monorepo doesn't just add seconds to startup — it changes which beans
> exist, and a classpath change in an unrelated module can now change this service's
> behaviour. The cost scales with the organisation, and the team paying it is the team
> running the service.

#### Common Mistakes

- Believing Spring Boot "is" dependency injection or the IoC container. It is a layer
  above Spring Framework; every mechanism it uses is one you already know from Volumes 1–5.
- Answering "`@SpringBootApplication` is a convenience annotation" and stopping. The
  three constituents have three different failure modes, and the `@ComponentScan` one is
  decided by file location.
- Treating `@EnableAutoConfiguration` as if it also scans. It imports; `@ComponentScan`
  scans. An app that removes `@ComponentScan` and keeps the rest still auto-configures
  Tomcat and Jackson and finds none of its own controllers.
- Forgetting that a second `@SpringBootConfiguration` on the classpath breaks every
  `@SpringBootTest` in the module, with an error that names both classes and not the
  conflict.
- Widening actuator exposure with `include=*` in a profile, then discovering that
  `prod` inherits `dev`'s profile group. Chapter 7.
- Setting `spring.mvc.servlet.path` for a context path and losing static resources.
- Treating `open-in-view=true` as a harmless default because "it just works". It works,
  and it is the reason your connection pool saturates.

#### Interview Questions — Spring Boot's Thesis

**Q1. What is Spring Boot, in one sentence that isn't "Spring with auto-configuration"?**

A curated set of five decisions — a dependency BOM, a starter naming convention, a
conditional auto-configuration layer, an executable-jar packaging format, and an embedded
server plus actuator surface — layered above Spring Framework so that a service can be
running with a `main()` method and a dependency block, while every one of those five
remains overridable. The senior part is that auto-configuration is the *least* interesting
of the five, because it is the only one that is fully reversible.

**Q2. Decompose `@SpringBootApplication` and say which constituent is most likely to
cause an incident.** `STAFF`

`@SpringBootConfiguration` (marks the root; a duplicate in a test-scope module breaks
`@SpringBootTest` with "found multiple"), `@EnableAutoConfiguration` (imports the
auto-configurations that pass their conditions), and `@ComponentScan` (scans the annotated
class's package and below). The most incident-prone is `@ComponentScan`, because its root
is decided by where the file sits — a main class in `com.acme` in a monorepo pulls in every
module's beans, which is a startup cost and, more seriously, a correctness one.

**Q3. A service is slow to start (45s) and the startup log shows thousands of beans. Name
the three things to check, in order.** `STAFF`

Scan breadth first — is the main class in a package broader than the service? Then eager
initialisation: a bean doing network or database I/O in `@PostConstruct` or a `@Bean`
method runs during `finishBeanFactoryInitialization()` (Volume 1, Chapter 3). Then
classpath breadth, because type resolution loads classes and a large starter set costs
real time. I would not permanently fix it with `spring.main.lazy-initialization`, which
converts a slow startup into a slow first request per endpoint and moves failures from CI
into production traffic.

**Q4. Is convention over configuration a good default at staff level? When would you argue
against it?** `STAFF`

Yes as an organisational default, because the cost of the alternative is version
reconciliation repeated per project and per engineer, and that cost is paid by everyone and
amortised badly. Argue against it when the workload is specific enough that Boot's defaults
are wrong in a way that only shows up under load — a latency-bound service with a
connection-bound database, a service whose API contract depends on null serialisation, a
high-concurrency service where Tomcat's 200 threads are the ceiling. The tell is that the
default is *tuned for a demo*: a 10-connection pool and 200 server threads are not neutral
choices, they are a small-deployment decision.

**Q5. What does the `open-in-view` default actually cost, and what is the mechanism?**

It binds an `EntityManager` to the request thread for the whole request, including
serialisation. Any lazy association Jackson resolves holds a database connection for that
whole window, so the connection pool rather than the JVM becomes the throughput ceiling —
ten concurrent slow serialisations starve every other request. The cost is invisible at low
traffic and appears as a p99 cliff under concurrency, which is exactly when you least want
a new failure mode.

**Q6. A team wants to expose all actuator endpoints in staging "for debugging". What is the
staff-level response?** `STAFF`

The response is that staging is where the credentials, the config and the heap dump of a
production-shaped system live, and `include=*` turns `/actuator/heapdump` and
`/actuator/env` into a data-exfiltration surface on a network that is usually reachable
from wherever the team's VPN terminates. The correct answer is a separately-authenticated
management port or path bound to the internal network, an allow-list rather than a
wildcard, and a stated expiry date on any temporary widening. The debugging need itself is
real — that's what `/actuator/conditions`, `/actuator/loggers` and a debugger-attached JVM
are for.

> **CHAPTER 1 SUMMARY**
>
> Spring Boot is five decisions layered above Spring Framework — a dependency BOM, a
> starter convention, a conditional auto-configuration layer, an executable-jar format,
> and an embedded server plus actuator — and auto-configuration is the least interesting
> of them because it is the one you can always reverse. `@SpringBootApplication` is three
> annotations with three different blast radii, and the `@ComponentScan` one is decided by
> file location, which makes the scan root the most common large-monorepo mistake in
> Spring. The real staff-level content is not the mechanism but the inventory of defaults
> that are wrong for a specific workload: `open-in-view` defaults to `true` and pins a
> connection through serialisation, `ddl-auto` defaults to `create-drop` only for embedded
> databases and `none` otherwise, Hikari's pool defaults to 10, Tomcat's threads to 200,
> and actuator exposes only `health` by default — a default that is correct, and the one
> teams most often wrongly widen. Convention over configuration is a good organisational
> default and a liability the moment your workload is specific enough that someone else's
> demo assumptions stop holding.

#### Further Reading

- [Spring Boot Reference — Using the `@SpringBootApplication` Annotation](https://docs.spring.io/spring-boot/reference/using/using-the-springbootapplication-annotation.html) — the three constituents and the nested-configuration rule, straight from the reference.
- [Spring Boot Reference — Structuring Your Code](https://docs.spring.io/spring-boot/reference/using/structuring-your-code.html) — the recommended package layout, which is really the argument about where the scan root belongs.
- [Spring Boot Reference — Spring Beans and Dependency Injection](https://docs.spring.io/spring-boot/reference/using/spring-beans-and-dependency-injection.html) — how injection differs in a Boot application, including constructor binding.
- [Spring Boot Reference — Common Application Properties](https://docs.spring.io/spring-boot/appendix/application-properties/index.html) — the authoritative list of every default quoted in this chapter; the first place to look before asserting one in an interview.

## Chapter 2 — Auto-Configuration

### 2.1 The Mechanism, End to End

```text
@EnableAutoConfiguration
        │
        ▼
ImportSelector.getCandidateConfigurations()
        │
        ▼
AutoConfigurationImportSelector
        │
        ├─ reads  META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
        │         (classpath*: across EVERY jar on the classpath)
        │
        ├─ filters out @AutoConfigureExclude / your excludes
        │  (spring.autoconfigure.exclude)
        │
        ▼
Every surviving class is registered as a @Configuration bean definition
        │
        ▼
For each @Bean method, Spring consults the @Condition annotations
        │
        ├─ any condition fails  → the whole @Configuration class is skipped
        │                          (not the method — the class)
        └─ all conditions pass  → its @Bean methods register
        │
        ▼
ConditionEvaluationReport — recorded either way, readable via --debug
```

Three structural facts fall out of that diagram, and each one is interview material:

1. **Auto-configuration classes are ordinary `@Configuration` classes.** They are
   registered into the context and processed by the same machinery as your own config. That
   means `@ComponentScan`-found `@Configuration` classes and auto-configurations are peers
   — the difference is *when* and *under what conditions* they are registered.

2. **A failing condition skips the whole class, not the method.** So
   `@ConditionalOnMissingBean` on a class-level condition kills every bean it would have
   defined. This is why a library author puts a condition on the class only when the entire
   configuration is genuinely contingent.

3. **Order matters, and it is alphabetical-then-declared by default.** With no ordering
   metadata, the import selector sorts candidate configurations alphabetically, which is why
   the `before`/`after` attributes exist at all. Section 2.4 is entirely about this.

### 2.2 `spring.factories` → `AutoConfiguration.imports` — the Exact History

This is a favourite interview question and is usually answered with a half-truth that
reveals the candidate read the release notes but not the migration. The precise version:

| Version | What happened |
| --- | --- |
| **Boot ≤ 2.6** | Auto-configurations are listed under the key `EnableAutoConfiguration` in `META-INF/spring.factories` — a generic key-value properties file that also carried initializers, listeners, application runners, and failure analysers |
| **Boot 2.7** | `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` is introduced as the **preferred** location. Listing auto-configurations in `spring.factories` is deprecated. During 2.7 both are read, and using both is an error |
| **Boot 3.0** | Support for registering auto-configurations via the `spring.factories` `EnableAutoConfiguration` key is **removed**. Only the `.imports` file works. (Other `spring.factories` keys — listeners, initializers, loaders, ApplicationRunners — continue to exist and are not affected) |

The *why* is worth being able to give, because "it's cleaner" is not the answer:

- **Overloading.** One file with one flat namespace for five unrelated extension mechanisms
  means loading the list of auto-configurations required parsing a file that also described
  things you didn't want, and a typo in an unrelated key was a silent failure in a shared
  file.
- **Type safety and tooling.** `AutoConfiguration.imports` contains only fully-qualified
  class names, one per line, in a file whose location *is* the semantics. A refactoring
  tool can find and rewrite the entries; `spring.factories` string literals scattered
  across a properties file are invisible to IDE navigation.
- **On-demand loading.** The `ImportSelector` machinery can be smart about *not* loading
  the whole list when a class is already known to be present.
- **Ordering metadata moved to the annotation.** `@AutoConfiguration` (new in 2.7) carries
  `before` / `after` attributes directly on the class, next to the bean methods, instead
  of forcing a separate `@AutoConfigureBefore` / `@AutoConfigureAfter` annotation on the
  class.

```java
// Boot 2.7+ — the modern form
@AutoConfiguration(before = DataSourceAutoConfiguration.class)
@ConditionalOnClass({ javax.sql.DataSource.class, EmbeddedDatabaseType.class })
@ConditionalOnProperty(prefix = "acme", name = "reporting", havingValue = "embedded")
public class AcmeEmbeddedReportingAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean
    public ReportingService reportingService(DataSource dataSource) {
        return new JdbcReportingService(dataSource);
    }
}
```

> **MUST REMEMBER**
>
> `@AutoConfiguration` is itself meta-annotated with
> `@Configuration(proxyBeanMethods = false)`. Every modern auto-configuration is therefore
> in **lite mode** — there is no CGLIB subclass, and calling one `@Bean` method from
> another inside the same class constructs a *new* instance rather than returning the
> singleton. Auto-configuration code that calls its own `@Bean` methods is a real and
> common bug, precisely because the Boot-authored code you're copying does it correctly by
> taking parameters.

### 2.3 The `@Conditional` Family

`@Profile` from Volume 1 Chapter 7 is one instance of the general mechanism:
`@Conditional(SomeCondition.class)`, where the condition implements `Condition.matches()`
returning a `ConditionOutcome`. Boot's `spring-boot-autoconfigure` module supplies a set of
ready-made conditions, and these are the ones you will actually use.

| Annotation | Matches when | Notes & traps |
| --- | --- | --- |
| `@ConditionalOnClass(Foo.class)` | `Foo` is on the classpath | **Does not load the class** — uses ASM on the class metadata. Safe on types that only exist under a condition. The single most-used condition in the ecosystem |
| `@ConditionalOnMissingClass(Foo.class)` | `Foo` is *not* on the classpath | The negative form of the above; use it to provide a fallback bean |
| `@ConditionalOnBean(Foo.class)` | A bean of type `Foo` is already registered | **Order-sensitive** — see 2.4. Only reliable inside auto-configuration, never on your own `@Configuration` |
| `@ConditionalOnMissingBean(Foo.class)` | No bean of type `Foo` is registered | The back-off mechanism, and the foundation of every override-able starter. Also **order-sensitive** |
| `@ConditionalOnProperty(name="acme.x", havingValue="on")` | The property is present and, if `havingValue` is set, equal | The workhorse. `matchIfMissing` (default `false`) is the parameter people forget |
| `@ConditionalOnWebApplication(type = SERVLET)` | The context is a servlet web app | Use `type` explicitly — bare `@ConditionalOnWebApplication` also matches a reactive app, which is not what "web application" usually means |
| `@ConditionalOnExpression("${acme.enabled:false} and ${acme.mode:simple} == 'full'")` | The SpEL expression evaluates to `true` | For compound conditions only. It's evaluated once at startup, so it cannot see properties that change afterwards |
| `@ConditionalOnSingleCandidate(Foo.class)` | Exactly one bean of the type | Differs from `@ConditionalOnBean` in that multiple candidates still match if one is `@Primary` |
| `@ConditionalOnResource`, `@ConditionalOnBean`, `@ConditionalOnWarDeployment` | A resource exists / a bean exists / deployed as a war | The war-deployment one is the escape hatch for the "works in a container, breaks in a war" class of bug |
| `@ConditionalOnThreading(Threading.VIRTUAL)` | The app is running on virtual threads | Boot 3.2+; the condition that lets a starter behave differently under `spring.threads.virtual.enabled` |

Three of these have non-obvious semantics that a senior answer should have ready:

- **`matchIfMissing`** is the parameter that decides whether "no property" means "on" or
  "off". The default is `false` — a condition on a property the user never set does **not**
  match. The alternative convention (`havingValue = "true" matchIfMissing = true`) makes the
  feature opt-*out*, which for a library is a hostile default: a user who adds your starter
  and doesn't know about the flag should not silently get the behaviour.
- **`@ConditionalOnExpression` runs at configuration-parsing time.** It cannot observe a
  property that changes at runtime, and an expression referencing an undefined property
  throws unless you give it a default (`${acme.mode:simple}`). Compound conditions are
  better expressed as `AllNestedConditions` — several custom conditions in one class — than
  as a long SpEL string that nobody can read.
- **`@ConditionalOnMissingBean` with no attributes** means "no bean of the *return type of
  the method it's on*". That is nearly always what you want, and occasionally exactly wrong:
  if your `@Bean` method returns a concrete class but the application defines the interface,
  the check passes and you get two beans. `@ConditionalOnMissingBean(MyService.class)` is
  the explicit form.

### 2.4 The `@ConditionalOnMissingBean` Evaluation-Order Trap

This is the single highest-value thing in the chapter, and it is the reason auto-configuration
is not "just conditionals".

`@ConditionalOnMissingBean` is answered by asking the bean factory what it currently knows
about. What it knows depends entirely on **when the question is asked** — which is decided by
configuration class *processing order*. If your auto-configuration is processed before the
thing it's supposed to defer to, the answer is "no such bean exists" and you register a
duplicate.

```text
Scenario A — the class you must run AFTER:  ✔ backs off correctly
  MyAutoConfiguration            (your auto-config)
      @ConditionalOnMissingBean(MyMapper)
  AppConfig                      (user's @Configuration)
      @Bean MyMapper myMapper()

  Processing order: MyAutoConfiguration first.
  It asks "is there a MyMapper bean?" → bean factory has none registered yet → NO.
  → Your MyMapper is registered. Later, AppConfig registers theirs too.
  → Two beans of type MyMapper. The application silently overrides a library.

Scenario B — the class you must run AFTER:  ✗ backs off IN TIME
  MyAutoConfiguration is @AutoConfigureAfter(AppConfig.class)
  AppConfig is processed first, so its MyMapper is a registered definition when the
  condition is evaluated → the condition matches → your bean is NOT registered.
```

The ordering is declared with `before` / `after` on `@AutoConfiguration` (or the older
`@AutoConfigureBefore` / `@AutoConfigureAfter`):

```java
@AutoConfiguration(after = DataSourceAutoConfiguration.class)          // my DS-backed thing
public class AcmeJdbcReportingAutoConfiguration { … }

@AutoConfiguration(before = AcmeJdbcReportingAutoConfiguration.class)   // theirs registers first
public class AcmeVendorDataSourceAutoConfiguration { … }
```

**The rule, stated precisely: `@ConditionalOnBean` and `@ConditionalOnMissingBean` are only
reliable on auto-configuration classes, never on your own `@Configuration` classes, and
only when the ordering relationship to the bean's owner is declared.** The reason for the
first half is structural: user `@Configuration` classes found by `@ComponentScan` are
processed in an order nobody controls, so a `@ConditionalOnMissingBean` on them is a coin
flip that changes when a library is added to the classpath. The reason for the second half
is the mechanism above.

There is a further subtlety worth knowing: conditions on *class* level are evaluated during
`ConfigurationClassPostProcessor`'s parse phase, before any `@Bean` method is invoked.
`@ConditionalOnMissingBean` at *method* level is evaluated when the bean definition is being
registered — which is still before instantiation, so a user's `@Bean` method that has not run
yet does not count as "existing". This is the "bean definition vs bean instance" distinction
from Volume 1 Chapter 3, and it's why "but I defined the bean, why didn't it back off?" is
almost always an ordering answer.

> **PRODUCTION RELEVANCE**
>
> When two beans of the same type both exist and one is marked `@Primary`, the application
> starts, the tests pass, and the override appears to work — because the `@Primary` one wins
> by injection. The bug surfaces later, in the one place that does a `getBeansOfType()` or
> injects `List<MyMapper>` and gets two entries. Condition-ordering bugs are
> *intermittent by nature*: they depend on the classpath, so they reproduce in the module
> that has the library and vanish in the module that doesn't.

### 2.5 The Condition Evaluation Report — the Best Debugging Tool You Have

When someone asks "why isn't my bean being created", the answer is almost always in the
condition report, and almost nobody looks.

```text
┌────────────────────────────────────────────────────────────────────────────┐
│  NEGATIVE MATCHES                                                          │
│  ──────────────                                                            │
│  DataSourceAutoConfiguration:                                            │
│    Did not match:                                                          │
│      - @ConditionalOnProperty (acme.datasource.url) did not find ...       │
│  AcmeVendorIntegrationAutoConfiguration:                                   │
│    Did not match:                                                          │
│      - @ConditionalOnClass found missing class 'com.vendor.sdk.Client'    │
│      - @ConditionalOnBean did not match required bean ...                  │
│    Exclusions:                                                             │
│      - Unconditional excluding beans: ...                                  │
└────────────────────────────────────────────────────────────────────────────┘
```

Get it three ways:

| Method | How | When |
| --- | --- | --- |
| Startup log | `--debug` on the command line, or `debug=true` in `application.properties` | Locally, while developing |
| HTTP | `/actuator/conditions` (exposed, not enabled, by default — see Chapter 7) | In a running instance where you need it live |
| Test | `ApplicationContextRunner` / `WebApplicationContextRunner` with `.run(ctx -> …)` and `assertThat(ctx).hasNotFailed()` | In an auto-configuration's **own test suite** — which you should write |

> **MUST REMEMBER**
>
> `/actuator/conditions` is **exposed** but not **enabled** by default. Actuator endpoints
> are enabled by default, but only `health` is in the default
> `management.endpoints.web.exposure.include` list, so `/actuator/conditions` returns 404
> until you add it to `include`. "The endpoint is missing" almost never means "Boot is
> broken" — it means the exposure allow-list is doing its job.

The `ApplicationContextRunner` deserves emphasis for anyone building a starter, because it
turns "why isn't my bean created" from an integration problem into a unit test:

```java
class AcmeReportingAutoConfigurationTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(AcmeReportingAutoConfiguration.class));

    @Test
    void backsOffWhenTheApplicationDefinesItsOwn() {
        runner.withUserConfiguration(MyOwnMapper.class)
              .run(ctx -> assertThat(ctx).doesNotHaveBean(AcmeMapper.class));
    }

    @Test
    void contributesOneWhenNobodyElseHas() {
        runner.run(ctx -> assertThat(ctx).hasSingleBean(AcmeMapper.class));
    }

    @Test
    void backsOffWhenTheVendorSdkIsAbsent() {
        runner.withClassLoader(new FilteredClassLoader(AcmeVendorSdk.class))
              .run(ctx -> assertThat(ctx).doesNotHaveBean(AcmeMapper.class));
    }
}
```

That third test — `FilteredClassLoader` — is the one that catches a class of bug you
cannot otherwise find: an auto-configuration that references a vendor type in a `@Bean`
method signature fails with `NoClassDefFoundError` on any classpath without the vendor jar,
even when the condition said it shouldn't load.

#### 2.6 A Worked Auto-Configuration

The thing a platform team actually produces. Note every decision below: the condition, the
back-off, the ordering, the property, and the refusal to define a bean the application
might want to own.

```java
package com.acme.reporting.autoconfigure;

@AutoConfiguration(after = DataSourceAutoConfiguration.class)
@ConditionalOnClass({ JdbcTemplate.class, DataSource.class })
@ConditionalOnProperty(prefix = "acme.reporting", name = "enabled",
                        havingValue = "true", matchIfMissing = false)
@EnableConfigurationProperties(AcmeReportingProperties.class)
public class AcmeReportingAutoConfiguration {

    @Bean
    @ConditionalOnMissingBean                       // ← back off if the app defines one
    public ReportingService reportingService(DataSource dataSource,
                                             AcmeReportingProperties properties) {
        JdbcTemplate jdbc = new JdbcTemplate(dataSource);
        jdbc.setQueryTimeout(properties.getQueryTimeoutSeconds());
        return new JdbcReportingService(jdbc, properties.getDefaultPageSize());
    }

    // A @Bean method, NOT a second @Bean-less type. No constructor calls across
    // @Bean methods — proxyBeanMethods is false here, so that would create a
    // second, unmanaged instance.
}
```

```properties
# META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports
# (src/main/resources/, one class per line, no comments in Boot 3)
com.acme.reporting.autoconfigure.AcmeReportingAutoConfiguration
```

And the properties class, which is the user-facing contract of the whole thing:

```java
@ConfigurationProperties(prefix = "acme.reporting")
@Validated
public record AcmeReportingProperties(
        @NotNull @Min(1) @Max(3600) Integer queryTimeoutSeconds,   // has a default below
        @Min(1) @Max(1000) Integer defaultPageSize) {

    public AcmeReportingProperties {
        // Compact-constructor defaults — the record form of @DefaultValue.
        if (queryTimeoutSeconds == null)  { queryTimeoutSeconds = 30; }
        if (defaultPageSize == null)     { defaultPageSize = 100; }
    }
}
```

Six decisions worth naming out loud in a design review:

1. `after = DataSourceAutoConfiguration.class` — the `@ConditionalOnMissingBean` on
   `ReportingService` is only reliable if a user-defined `DataSource` has been registered
   by the time we ask, and if our `DataSource` would have backed off theirs.
2. `@ConditionalOnProperty(..., matchIfMissing = false)` — opt-in, not opt-out.
3. `@ConditionalOnMissingBean` on the `@Bean` method — the single most important line.
4. We take `DataSource` and `AcmeReportingProperties` as **parameters**, never by calling
   another `@Bean` method.
5. We add **no beans of our own core types** — no `ReportingProperties`-adjacent interface
   the application would reasonably want to define itself.
6. Everything user-tunable is in a `@ConfigurationProperties` record with validation, so
   the IDE generates the metadata and `/actuator/configprops` can show it.

#### Common Mistakes

- Reading `AutoConfiguration.imports` from only your own jar. It is read across
  `classpath*:` — the whole classpath contributes candidates, and one badly-behaved
  dependency can contribute one.
- Believing alphabetical ordering is a design. It is a fallback; the ordering that matters
  is expressed in `before` / `after`, and the alphabetical sort is why missing `after`
  declarations produce order-dependent bugs.
- Putting `@ConditionalOnMissingBean` on your own `@Configuration` class and expecting it
  to work. It is evaluated in a scan order nobody controls.
- Using `@ConditionalOnMissingBean` with no type argument on a method returning a concrete
  class while the application defines the interface — the check passes and you get two
  beans.
- Omitting the `.imports` file, or adding a comment line to it. Boot 3 rejects a malformed
  imports file outright.
- Expecting `/actuator/conditions` to work out of the box. The endpoint is enabled by
  default but not in the default exposure list.
- Using `@ConditionalOnClass` on a class that you *also* reference in the
  `@Configuration` class's own signature or in a field type — the condition protects the
  `@Bean` method, not the class loading of the config class itself, and you get a
  `NoClassDefFoundError` at a much more confusing moment.

#### Interview Questions — Auto-Configuration

**Q1. Walk me through what `@EnableAutoConfiguration` does, precisely.** `TRICKY`

It imports `AutoConfigurationImportSelector`, which reads
`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` from
`classpath*:` across every jar, removes entries listed in `spring.autoconfigure.exclude`,
and registers each remaining class as a `@Configuration` bean definition. Each class's
`@Conditional` annotations are then evaluated during configuration-class parsing; any
failure skips the *entire class*, and the outcome of every evaluation — positive or
negative — is recorded in the `ConditionEvaluationReport`.

**Q2. Why did `spring.factories` go away, and what exactly changed in which version?**
`ADVANCED`

`spring.factories` was one flat key-value file overloaded across several unrelated
extension mechanisms, which made loading one list require parsing a file describing four
others and gave tooling nothing to navigate. Boot 2.7 introduced the dedicated
`AutoConfiguration.imports` file and deprecated the `EnableAutoConfiguration` key in
`spring.factories`; both were read during 2.7 and using both was an error. Boot 3.0
removed `spring.factories` support for auto-configuration entirely — other `spring.factories`
keys like listeners and initializers are unaffected. The related win is that `@AutoConfiguration`
(in 2.7) carries `before`/`after` directly on the class rather than requiring separate
`@AutoConfigureBefore`/`@AutoConfigureAfter` annotations.

**Q3. A starter's bean and the application's bean of the same type both exist, and
nothing is marked `@Primary`. What is the root cause, and how do you fix it at the source?**
`STAFF`

The root cause is evaluation order, not a missing annotation. `@ConditionalOnMissingBean`
asks the bean factory what is registered *at that moment*; if the auto-configuration is
processed before the application's `@Configuration` class, the factory has no record of the
application's bean and your condition matches when it shouldn't. Fix it at the source by
declaring `@AutoConfiguration(after = …)` relative to the configuration that owns the bean —
or, more robustly, by making your starter back off on a *type* the application would
plausibly own and documenting the ordering contract. Adding `@Primary` to your bean hides
the symptom and creates a second problem: any `List<T>` injection point now gets two
entries.

**Q4. When is `@ConditionalOnBean` unreliable?** `TRICKY`

Whenever it's evaluated before the bean's owner is registered. That means on your own
`@Configuration` classes found by component scanning (scan order is not a mechanism), and
in an auto-configuration that doesn't declare the right `before`/`after` relationship. It
is also evaluated against *bean definitions* in the parse phase, not against instantiated
beans, so a user's `@Bean` method that hasn't been invoked yet does not count as existing.

**Q5. What is the fastest way to find out why a bean isn't being created?** `TRICKY`

`--debug` on the command line, which prints the `ConditionEvaluationReport` with both
matches and non-matches and the reason for each. On a running instance, expose
`/actuator/conditions` — note it's enabled by default but not in the default exposure
allow-list, so you must add it to `management.endpoints.web.exposure.include`. In a
starter's own test suite, use `ApplicationContextRunner` with `FilteredClassLoader` to
assert the class-absent case, which is otherwise untestable.

**Q6. What does `matchIfMissing` do and what's the right default for a library?** `TRICKY`

It decides whether the condition matches when the property is *absent*. The default is
`false` — absent means "off". For a library, that is the right default: someone who adds
your starter and doesn't know about the flag should not silently acquire the behaviour.
`matchIfMissing = true` makes a feature opt-out, which is a decision about someone else's
application, and the wrong one.

**Q7. Why does every auto-configuration class now run in `@Configuration(proxyBeanMethods =
false)` mode, and what's the bug it enables?** `ADVANCED`

Because `@AutoConfiguration` is meta-annotated with it. In lite mode there is no CGLIB
subclass, so calling one `@Bean` method from another *in the same class* is an ordinary Java
call that constructs a second, unmanaged object instead of returning the singleton. The bug
is a duplicate connection, a mapper that doesn't share a transaction, or a surprising
identity mismatch — and it's easy to write because copying a `@Bean` method call from
full-mode application code looks harmless. Take parameters instead.

> **CHAPTER 2 SUMMARY**
>
> Auto-configuration is three things: a discovery mechanism that reads
> `AutoConfiguration.imports` from `classpath*:` (which replaced the `spring.factories`
> `EnableAutoConfiguration` key in Boot 2.7 and was the only supported route from Boot 3.0),
> a set of `@Conditional` annotations evaluated during configuration-class parsing where a
> single failure skips the whole class, and an ordering contract expressed with
> `before`/`after` on `@AutoConfiguration`. The trap that costs the most in production is
> `@ConditionalOnMissingBean`'s dependence on evaluation order — it asks what is registered
> *now*, so it only works if you run after the class it defers to, which is what `before`
> and `after` are for. And the answer to "why isn't my bean created" is essentially always
> the `ConditionEvaluationReport`, reachable with `--debug` or `/actuator/conditions` and
> automatable with `ApplicationContextRunner` and `FilteredClassLoader` in your starter's own
> tests.

#### Further Reading

- [Spring Boot Reference — Auto-Configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html) — the canonical chapter: candidate discovery, condition annotations, back-off, and the report.
- [Spring Boot Reference — Production-ready Features (Actuator Endpoints)](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html) — the `/actuator/conditions` endpoint and, crucially, the default exposure allow-list that determines whether you can reach it.
- [Spring Framework Reference — Annotation Config](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html) — the configuration-class parsing machinery the conditions hook into.
- [Spring Boot 3.0 Migration Guide (Wiki)](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.0-Migration-Guide) — the authoritative list of what was removed and migrated, including the `spring.factories` change.

## Chapter 3 — Starters & Dependency Management

### 3.1 What a Starter Is

A starter is a POM with dependencies and **no code**. That is the whole definition, and it
is worth saying plainly because people assume there's magic in it. There isn't: adding
`spring-boot-starter-web` adds four or five libraries to your classpath with versions that
someone already reconciled.

```text
   What you write                    What you get
┌──────────────────┐      ┌──────────────────────────────────────────┐
│ <dependency>     │─────►│ spring-boot-starter                     │
│ spring-boot-     │      │  ├─ spring-boot-starter-logging         │
│ starter-web      │      │  ├─ spring-boot-starter-json            │
│ </dependency>    │      │  │   └─ jackson-databind, jsr310 module │
│                  │      │  ├─ jakarta.annotation-api              │
│                  │      │  ├─ spring-core, spring-context          │
│                  │      │  ├─ snakeyaml                           │
│                  │      │  ├─ spring-boot-starter-tomcat          │
│                  │      │  │   └─ tomcat-embed-core, -el, -websocket│
│                  │      │  ├─ spring-web, spring-webmvc           │
│                  │      │  └─ spring-boot-autoconfigure         │
└──────────────────┘      └──────────────────────────────────────────┘
```

The important observation for a senior candidate: **a starter is a *transitive dependency
set*, and transitive dependency sets are how version conflicts arrive.** You did not choose
Tomcat, Jackson, or SnakeYAML. Someone chose them for you, and they chose a *version*, and
that version is now in your classpath whether you asked for it or not.

### 3.2 The BOM — `spring-boot-dependencies` and the Parent

```xml
<!-- Option 1: parent POM — brings the BOM AND plugin management -->
<parent>
  <groupId>org.springframework.boot</groupId>
  <artifactId>spring-boot-starter-parent</artifactId>
  <version>3.4.1</version>
  <relativePath/>
</parent>

<!-- Option 2: import the BOM directly — no parent inheritance -->
<dependencyManagement>
  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-dependencies</artifactId>
      <version>3.4.1</version>
      <type>pom</type>
      <scope>import</scope>
    </dependency>
  </dependencies>
</dependencyManagement>
```

| | `spring-boot-starter-parent` | `spring-boot-dependencies` (import) |
| --- | --- | --- |
| Supplies the version BOM | Yes | Yes |
| Supplies plugin versions (compiler, surefire, `spring-boot-maven-plugin`) | Yes | **No** — you declare and configure the plugin yourself |
| Inherits `application.yml`/`.properties` resource filtering (`@..@` delimiters) | Yes | No |
| Inherits other `<build>` and `<pluginManagement>` config | Yes | No |
| Correct for | A single-module application | A multi-module build where you don't want the parent's build config leaking in — and libraries, always |

The staff-level point about the parent: **a parent POM is inheritance, and inheritance leaks.**
`spring-boot-starter-parent` sets `maven.compiler.source`, resource filtering delimiters, and
plugin versions for every module beneath it. In a 20-module monorepo that is convenient
until one module needs a different compiler release or a different Surefire configuration,
at which point the only options are overriding everything explicitly or dropping the parent
for the `dependencyManagement` import — which is why mature multi-module setups typically
import the BOM and configure the plugin themselves. The flip condition is a single-module
service, where the parent is unambiguously the right answer and fighting it is waste.

**How the mechanism actually resolves** — the same idea, three build tools:

```text
Maven   <dependencyManagement> declares versions for artifacts.
        A dependency that OMITS <version> and matches a managed entry gets
        that version. "Nearest definition wins" for conflicts; a direct
        declaration in your POM always beats a transitive one.

Gradle  implementation(platform("org.springframework.boot:spring-boot-dependencies:3.4.1"))
        = a *platform*: a constraint set applied to the whole graph.
        Gradle then picks the HIGHEST version among competing constraints,
        unless you force one with a resolution strategy. Note the inversion:
        Maven's nearest-wins and Gradle's highest-wins can disagree.

Both    A starter's POM omits versions for everything it pulls, precisely so
        that the BOM (or platform) above it supplies them. That is why a
        starter version change can move a library version in your app without
        a single line of your code changing.
```

> **INTERVIEW TRAP**
>
> "The BOM pins the versions so nothing can conflict" is wrong in the way that matters
> operationally. The BOM pins versions **for dependencies that omit a `<version>`** — which
> is everything a starter pulls. The moment *you* declare a version yourself, yours wins
> (Maven) or the highest wins (Gradle), and you now own a version you have to keep
> reconciling with Boot's BOM at every upgrade. The BOM manages your classpath; it does not
> protect you from your own overrides.

### 3.3 What the Common Starters Actually Drag In

| Starter | Brings | The one that bites |
| --- | --- | --- |
| `spring-boot-starter-web` | `spring-web`, `spring-webmvc`, `spring-boot-starter-json` (Jackson + `jackson-datatype-jsr310`), `spring-boot-starter-tomcat` (Tomcat embed core/el/websocket), `spring-boot-starter` (logging, snakeyaml) | Tomcat is embedded — the app binds a port in-process, so you cannot run two instances on one host without changing `server.port`, and "deploy to the app server" is no longer a deployment model |
| `spring-boot-starter-data-jpa` | `spring-boot-starter-aop`, `spring-boot-starter-jdbc` (**HikariCP**), `jakarta.persistence-api`, `hibernate-core`, `spring-data-jpa`, `spring-aspects` | HikariCP arrives by default with a 10-connection pool (Volume 9), and `spring-aspects` brings `@Async`/`@Scheduled` aspect support whether you use it or not |
| `spring-boot-starter-security` | `spring-security-config`, `spring-security-web`, `spring-security-core` (→ `spring-security-crypto`) | Adding it to a service that already has its own auth flips on the **default** filter chain: every endpoint becomes password-protected and a generated password appears in the logs. Volume 8 |
| `spring-boot-starter-actuator` | `spring-boot-actuator-autoconfigure`, Micrometer core + observation | Micrometer arrives with the observation API; a team instrumenting by hand before adding it will be refactoring onto a different API later |
| `spring-boot-starter-test` | JUnit 5, Mockito, AssertJ, Hamcrest, JSONassert, JsonPath, XmlUnit, `spring-test`, `spring-boot-test`, `spring-boot-test-autoconfigure` | Scope is `test` in a well-formed POM, but several teams widen it "for convenience", which drags test libraries into the production jar and its layer cache |
| `spring-boot-starter-validation` | Hibernate Validator, Jakarta EL | **Not** pulled in by `starter-web` since Boot 2.3 — the single most common "my `@Valid` does nothing" cause |
| `spring-boot-starter-actuator` + `micrometer-registry-prometheus` | Prometheus client | The registry choice is a monitoring-stack decision, and it is cheap to add and expensive to change later |

The Hibernate Validator point is worth stating with a number: since Boot 2.3, bean
validation is **not** a transitive dependency of `spring-boot-starter-web`. A service that
upgrades from 2.2 to 2.3 and had `spring-boot-starter-validation` only transitively loses
`@Valid` enforcement silently — no compile error, no startup error, just unvalidated input
reaching the persistence layer. That is a genuine, shipped, widely-reported migration
incident, and it is the kind of thing a staff candidate should be able to name unprompted.

### 3.4 The Cost of Starters

```text
You want:      spring-boot-starter-web        → Jackson 2.17.x, Tomcat 10.1.x
A library wants: jackson-databind 2.18.0      → your app's Jackson is now 2.18.0
                      │
                      ▼
        Outcome depends on the build tool and on whether anyone
        looked. Maven nearest-wins may keep 2.17 while the library
        was compiled against 2.18. Gradle highest-wins silently
        moves you to 2.18. Either way NOBODY CHOSE IT.
```

The failure modes, in increasing severity:

1. **Silent version drift.** A starter upgrade moves a library version in your service with
   no diff in your repository. The change appears in the changelog of a dependency you don't
   own.
2. **Classpath bloat.** Each starter brings transitive trees; an application that started
   with three starters routinely ends with 60+ jars. Startup time, layer cache size and
   attack surface all scale with it.
3. **Conflicting autoconfigurations.** Two libraries can both auto-configure the same type,
   and which one wins depends on `before`/`after` metadata neither team wrote about the
   other. This is the same ordering trap as Chapter 2, occurring across organisational
   boundaries.
4. **Classpath conflicts at runtime.** The genuinely nasty one: a library compiled against
   Jackson 2.18 calling a method that doesn't exist in 2.17 throws
   `NoSuchMethodError` — in a code path that only executes in production.

> **PRODUCTION SCENARIO**
>
> Problem: after a routine starter upgrade, the `/api/orders` endpoint began returning 500s
> with `NoSuchMethodError` in the logs, only under a specific content type.
> Investigation: the stack trace named a vendor SDK, and the method it called did not exist
> in the resolved `jackson-databind`. The BOM said 2.17; the SDK was compiled against 2.18.
> Root cause: Maven's nearest-wins resolution kept Boot's managed Jackson because the SDK
> declared it as a direct dependency of a `compile`-scoped path the app also reached, and
> nobody had a test that exercised that content type.
> Solution: pin Jackson explicitly at 2.18 and add an integration test for the failing path.
> Prevention: `mvn dependency:tree` in CI and a diff check on it, because a classpath change
> in a PR that doesn't touch your code is exactly the change nobody reviews.

> **SCALING REALITY CHECK**
>
> Layered Docker images cache on file content, which is why dependency layers only rebuild
> when a version changes (Chapter 5). A 60-jar classpath means a large dependency layer —
> often 80–150MB — that is re-pushed on every dependency bump, and a cold pull in a scale-up
> event is measured in tens of seconds of registry transfer. For a service that autoscales
> from zero on traffic spikes, that transfer time is *part of your p99 during an incident*.

### 3.5 Building Your Own Starter

This is a genuinely valuable staff-level skill and it deserves the detail. The structure is
**two modules**, always:

```text
acme-reporting-spring-boot-starter/
│
├── acme-reporting-spring-boot-autoconfigure      ← CODE lives here
│   ├── pom.xml
│   │     depends on: spring-boot-autoconfigure,
│   │                 spring-boot-configuration-processor  (optional, IDE metadata),
│   │                 acme-reporting-core                (your actual library)
│   └── src/main/
│       ├── java/com/acme/reporting/autoconfigure/
│       │   ├── AcmeReportingAutoConfiguration.java
│       │   ├── AcmeReportingProperties.java
│       │   └── AcmeReportingClientFactory.java      (the SPI, if you have one)
│       └── resources/META-INF/spring/
│           └── org.springframework.boot.autoconfigure.AutoConfiguration.imports
│
└── acme-reporting-spring-boot-starter             ← POM ONLY, no code
    ├── pom.xml                                     ← depends on the autoconfigure module
    └── README.md                                   ← documents the properties
```

```xml
<!-- acme-reporting-spring-boot-starter/pom.xml — the whole file -->
<project>
  <modelVersion>4.0.0</modelVersion>
  <groupId>com.acme</groupId>
  <artifactId>acme-reporting-spring-boot-starter</artifactId>
  <version>1.2.0</version>
  <dependencies>
    <dependency>
      <groupId>com.acme</groupId>
      <artifactId>acme-reporting-spring-boot-autoconfigure</artifactId>
      <version>1.2.0</version>
    </dependency>
  </dependencies>
</project>
```

The **two-module split is not ceremony** — it is a hard architectural rule:

| Module | May depend on | Must not depend on |
| --- | --- | --- |
| `-autoconfigure` | `spring-boot-autoconfigure`, your core library | **Any other Spring Boot starter.** Pulling a starter into an autoconfigure module drags its entire auto-configurations into every consumer's context, whether they use your feature or not |
| `-starter` | The autoconfigure module | Anything that isn't the autoconfigure module (plus optional, explicitly-scoped extras) |

The classic mistake — putting a dependency on `spring-boot-starter-web` or
`spring-boot-starter-data-jpa` inside the autoconfigure module — is what makes a starter
work in the author's demo and pull an entire web or persistence stack into an unrelated
batch job. The correct approach is to depend on the narrow API
(`jakarta.persistence-api` or `spring-jdbc`) and use `@ConditionalOnClass` to activate only
when the real implementation is present.

**The two rules that make a starter work with other people's configuration:**

> **MUST REMEMBER**
>
> **Rule 1: `@ConditionalOnMissingBean` on every single bean you contribute.** If the
> application can reasonably want to define the bean itself, you must back off — silently
> and by type, not by name. A starter that unconditionally defines `ObjectMapper`,
> `RestTemplate`, `DataSource`, or any client type is a bug, and it will be reported as
> "your library broke our app" the first time two of them are on the classpath.
>
> **Rule 2: never define a bean of a type the application might reasonably want to define
> itself.** This is broader than Rule 1. If your type is *yours*, fine — contribute it
> with `@ConditionalOnMissingBean`. If your type is a **general-purpose infrastructure type
> that anyone might reasonably own** — a pool, a mapper, a template, a scheduler, a
> `Clock` — contribute a *factory* that the application can use, and let the application
> own the instance.

The second rule has a corollary that surprises people: **contribute a factory, not the
thing.** Boot itself follows this — `DataSourceAutoConfiguration` contributes a
`DataSourceBuilder`; `JacksonAutoConfiguration` contributes
`Jackson2ObjectMapperBuilder`. That's the design constraint on a well-behaved starter, and
it's the design constraint on a well-behaved `@Configuration` class in any codebase.

Supporting material that makes a starter genuinely good rather than merely functional:

- **Configuration metadata.** Adding
  `spring-boot-configuration-processor` as an annotation-processor path dependency gives
  you `@ConfigurationProperties` classes that complete in an IDE, and it generates
  `additional-spring-configuration-metadata.json` for the properties you want but don't
  have a typed class for. It is a build-time dependency, marked `<optional>true</optional>`.
- **`@ConditionalOnMissingBean` *and* a documented property.** Back-off alone means users
  get the library's opinion with no way to configure it. A property like
  `acme.reporting.enabled` with a documented default gives them the decision explicitly.
- **Auto-configuration tests.** `ApplicationContextRunner` with at least four cases:
  contributes-when-nothing-else-does, backs-off-when-the-app-defines-one, skips-when-the-
  optional-class-is-absent (`FilteredClassLoader`), and applies-the-property-when-set.
  `mvn verify` running them is the difference between a starter and a liability.
- **A README that shows a property table and an override example.** Users will not read
  your Javadoc; they will paste your starter into a POM at 4pm.
- **Semantic versioning with a stated compatibility policy.** A Boot minor upgrade that
  changes a default is a breaking change for someone, and saying so is how you keep the
  relationship.

> **STAFF-LEVEL CONSIDERATION**
>
> Publishing a starter is publishing a *policy*, not a library. Once `acme-reporting` is in
> 40 services, every behaviour is a compatibility surface and every default is a decision
> you made for 39 other teams. The staff-level question to bring to the design review is not
> "is this a good abstraction" but "what happens to the other 39 services when this
> changes" — which is a semver, a deprecation policy, and a migration note question, and
> it is a different conversation from the one about the code.

#### Common Mistakes

- Using `spring-boot-starter-parent` in a multi-module build and then fighting inherited
  plugin configuration for one module. Import the `spring-boot-dependencies` BOM instead.
- Assuming the BOM protects your explicit versions. It manages dependencies that omit one;
  your declarations win, and now you own the upgrade.
- Depending on another *starter* from inside an `-autoconfigure` module, which drags that
  starter's whole auto-configuration into every consumer.
- Contributing a bean of a general infrastructure type without
  `@ConditionalOnMissingBean` — `ObjectMapper`, `RestTemplate`, `DataSource`, `TaskExecutor`,
  `Clock`. This is the single most common starter defect.
- Forgetting `spring-boot-configuration-processor`, so users get no IDE completion and no
  `/actuator/configprops` metadata, and the "what can I configure?" question has no answer.
- Putting `spring-boot-starter-validation` in the transitive graph of a *production* module
  and assuming `@Valid` is enforced without Boot 2.3's separate starter.
- Shipping the starter without `AutoConfiguration.imports`, or with the file in the wrong
  module — the entries must be in the **autoconfigure** module's resources.
- Widening the scope of `spring-boot-starter-test` to `compile` "for convenience", which
  puts test libraries in the production jar and in the Docker dependency layer.

#### Interview Questions — Starters & Dependency Management

**Q1. What is a Spring Boot starter, and why do libraries ship two modules?** `TRICKY`

A starter is a POM with no code that declares a dependency set with versions omitted, so the
BOM above it supplies the versions. Libraries ship two modules — `-autoconfigure` holding
the `@AutoConfiguration` classes and the `.imports` file, and `-starter` holding a POM that
depends only on the autoconfigure module — so that the code, which must not depend on other
starters, stays separable from the dependency convenience layer.

**Q2. When would you import `spring-boot-dependencies` instead of using
`spring-boot-starter-parent`?** `TRICKY`

When you're building a multi-module project or a library, because a parent POM inherits
build configuration you may not want — plugin versions, resource-filtering delimiters,
compiler release. Importing the BOM gives you the same version management as
`dependencyManagement` with no build inheritance, at the cost of having to declare and
configure `spring-boot-maven-plugin` (or the Gradle plugin) yourself.

**Q3. A starter brings in a Jackson version that conflicts with one your application
declares explicitly. What happens, and why does the answer differ between Maven and
Gradle?** `ADVANCED`

Your explicit declaration always wins over the managed version, so the resolved Jackson is
yours — and the library compiled against the other version may hit a
`NoSuchMethodError` at runtime in a path you don't exercise. Maven resolves conflicts
"nearest definition wins" and Gradle's platform constraints default to "highest version
wins", so the two builds can genuinely produce different classpaths from the same
declarations. The fix is to pin the version deliberately, reconcile the library's
requirement, and add `dependency:tree` diffing to CI so a classpath change never arrives
without a diff.

**Q4. Why did bean validation stop coming in transitively with `starter-web`, and what
breaks?** `TRICKY`

It was removed from the `starter-web` dependency list in Boot 2.3 as part of making the
web starter reflect only what a web application strictly needs; `spring-boot-starter-validation`
is now explicit. The breakage is silent — a service that upgrades from 2.2 and relied on the
transitive dependency loses Hibernate Validator entirely, and `@Valid` on a controller
argument becomes a no-op with no compile error and no startup error. The failure is
unvalidated input reaching the persistence layer.

**Q5. Explain the two rules a well-behaved starter follows.** `STAFF`

`@ConditionalOnMissingBean` on every contributed bean, so the application can always
override by type, silently. And never define a bean of a type the application might
reasonably own — which is broader than the first rule: for general infrastructure types
(an `ObjectMapper`, a pool, a template, a scheduler) contribute a *factory* the application
can use and let the application own the instance. That's why Boot contributes
`Jackson2ObjectMapperBuilder` and `DataSourceBuilder` rather than those things
unconditionally.

**Q6. A team's `dependency:tree` grew from 40 artifacts to 90 over a year without anyone
adding a dependency. Is that a problem?** `STAFF`

Yes, in three separate ways. Startup cost, because type resolution and classpath scanning
scale with it. Docker image size and cold-pull time, which is directly relevant if the
service scales from zero during an incident. And blast radius — every one of those 90 jars
is code that can throw, and each is a version that will move on a starter upgrade. The
finding to bring to the review is usually a starter pulled for one class; the fix is
depending on the narrow API and using `@ConditionalOnClass` to activate on the real
implementation.

**Q7. Your starter's `ObjectMapper` bean is overriding a user's. How do you find it, and
how do you prevent it?** `TRICKY`

`/actuator/conditions` (after adding it to the exposure allow-list) or `--debug` shows the
`@ConditionalOnMissingBean` positive match, and `/actuator/beans` shows both instances. The
prevention is in the library, not the app: the condition should be on the method, matching
the *return type*, and the starter's test suite should include a
`withUserConfiguration(MyObjectMapper.class)` case asserting `doesNotHaveBean`. If the type
is a general infrastructure type, the correct design is to contribute a builder instead.

> **CHAPTER 3 SUMMARY**
>
> A starter is a POM with no code, and its whole mechanism is transitive dependency
> resolution against a BOM — which means the starters you didn't choose are still setting
> versions in your classpath, and a version bump in someone else's starter is a classpath
> change with no diff in your repository. The BOM manages dependencies that *omit* a
> version; your explicit declarations win, which means overriding Boot is how you take
> ownership of an upgrade. Building your own starter means two modules, an
> `AutoConfiguration.imports` file in the autoconfigure one, a rule that the autoconfigure
> module must never depend on another starter, and two behavioural rules that decide whether
> your starter is a library or a future incident: `@ConditionalOnMissingBean` everywhere, and
> never define a bean of a type the application might reasonably own. The highest-value
> defensive tool is a `dependency:tree` diff in CI, because the classpath change nobody
> authored is the one nobody reviews.

#### Further Reading

- [Spring Boot Reference — Build Systems](https://docs.spring.io/spring-boot/reference/using/build-systems.html) — the Maven `starter-parent` vs `dependencyManagement` import decision, and the Gradle equivalent.
- [Spring Boot Specification — Configuration Metadata](https://docs.spring.io/spring-boot/specification/configuration-metadata/index.html) — what the `spring-boot-configuration-processor` generates, and the exact shape of `additional-spring-configuration-metadata.json`.
- [Spring Boot Reference — Common Application Properties](https://docs.spring.io/spring-boot/appendix/application-properties/index.html) — the version-managed defaults behind every starter; useful for answering "what does this starter actually pull" precisely.
- [Paketo Java Buildpacks](https://paketo.io/) — how buildpacks infer a classpath, which is the closest public analogue to what a starter does for a JVM deployment.

## Chapter 4 — Externalized Configuration

Volume 1 Chapter 7 established the *precedence ladder* — command line beats system properties
beats environment variables beats config file beats `@PropertySource`, and the `Environment`
abstraction underneath it. This chapter is about what Boot added on top, and the decision
that sits at the centre of it: **your configuration is an API, and it should be reviewed
like one.**

### 4.1 Where Boot Looks for Configuration

Boot 2.4 replaced the old "one file plus profile variants, discovered by a list of
hard-coded locations" model with a unified `ConfigData` API. The default search locations, in
the order they are consulted — later locations do **not** override earlier ones; the
*first* match wins, and profiles in the same location override the profile-less file:

```text
 1. classpath:/                         (inside the jar)
 2. classpath:/config/                  (inside the jar, conventional override dir)
 3. file:./                             (the working directory)
 4. file:./config/                      (the conventional external override dir)
 5. file:./config/*/                    (multi-tenant / per-instance profile dirs)
```

`optional:` is prefixed to all of them by default, which means "skip this location if it
doesn't exist" rather than "fail". The practically important consequences:

- **`file:./config/` beating `classpath:/` is the whole point.** The jar carries
  sensible defaults; the directory next to the jar carries the deployment's actual values.
  This is how you change a setting without rebuilding a container image, and it is how a
  Kubernetes ConfigMap volume gets mounted.
- **`file:./` is the *first* external location, so it beats `file:./config/`.** Teams
  routinely assume `config/` is more specific and therefore wins; it does not. A stray
  `application.yml` in the working directory silently shadows the one your runbook says is
  authoritative. This is a real and confusing incident shape, and the debugging answer is
  `/actuator/env` or the `spring.config.location` value in the startup banner.
- **`file:./config/*/` is a profile-per-directory pattern.** Each subdirectory is a
  profile name, and you can pick among them with `spring.profiles.active` — the shape used
  by legacy config layouts and by some multi-tenant deployments where the tenant ID is the
  profile.
- **Location can be overridden entirely.** `spring.config.location` replaces the default
  list; `spring.config.additional-location` *adds* to it, and its entries are consulted
  **before** the defaults. Adding a location is the operation that actually wins.

```properties
# Replace the search list entirely — note the trailing / and that the
# classpath entries are gone, so an in-jar application.yml is no longer read
spring.config.location=file:/etc/acme/,classpath:/application.yml

# Add one, consulted BEFORE all defaults
spring.config.additional-location=file:/etc/acme/overrides/
```

> **INTERVIEW TRAP**
>
> "The `config/` directory takes precedence over the working directory because it's more
> specific" is the common wrong answer, and it is wrong in the direction that costs an
> afternoon. Precedence in the config-data model follows the **order of the search list**,
> not specificity: `file:./` is position 3 and `file:./config/` is position 4, so a file in
> the working directory wins. The intuition that "more specific wins" is true of
> *profile-specific vs profile-less files within a location*, and false *across* locations.

### 4.2 `SPRING_APPLICATION_JSON` and the ConfigTree

`SPRING_APPLICATION_JSON` is an environment variable (or system property) whose value is a
JSON **document** injected as a high-precedence property source — position 4 in Volume 1's
ladder, above servlet parameters and system properties, below command line arguments. It
exists because neither a flat key=value environment variable nor a command line can express
structured configuration cleanly.

```bash
# A list of profile files to load — a genuinely awkward thing in a shell env var
SPRING_APPLICATION_JSON='{"spring":{"profiles":{"active":["prod","eu-west"]}}}'

# Structured values that env vars cannot express
SPRING_APPLICATION_JSON='[{"spring.datasource.hikari.maximum-pool-size":25}]'

# In Kubernetes, from a ConfigMap, replacing a whole list-valued property
SPRING_APPLICATION_JSON='{"management.endpoints.web.exposure.include":["health","prometheus","metrics"]}'
```

The reason it matters at staff level: **it is the highest-precedence source that a
container orchestrator can set from a mounted ConfigMap**, and it is *not* lower
precedence than command-line args. An operator who sets `SPRING_APPLICATION_JSON` can
override an application baked to be correct, and — the part that matters — can override
security settings the deployment is relying on. Anyone who can write the pod spec can
change the exposure list.

**`spring.config.import` and the ConfigTree** (Boot 2.4+) is the larger feature, and it
replaces `bootstrap.properties`/`bootstrap.yml` and the Spring Cloud config-server
machinery:

```yaml
spring:
  application:
    name: order-service
  config:
    import:
      - "optional:configserver:http://config.internal:8888"   # remote, higher precedence
      - "optional:vault:                 # secrets from a vault
          uri: https://vault.internal:8200
          token: ${VAULT_TOKEN}"
      - "file:/etc/acme/shared.yml"                          # a plain file
      - "classpath:defaults.yml"                             # packaged defaults
      - "optional:file:/etc/acme/${spring.profiles.active}.yml"
```

The precedence rule for imports is the part people get wrong, so state it exactly:
**an imported document is inserted into the property source list immediately *below* the
document that declared the import — and it takes precedence over the document that
declared it, but *below* anything that was in the environment before it.** So in the
example above, `configserver` is the most authoritative of the listed documents, and the
whole `spring.config.import` result sits above `application.yml` in the classpath but below
command-line arguments and `SPRING_APPLICATION_JSON`.

```text
  command line args                    ─┐
  SPRING_APPLICATION_JSON              ─┤
  ──────────────────────────────────── │ ── nothing below here can
  imported documents (spring.config.   ─┤    override these
    import), innermost listed first)   ─┤
  the document that declared the import┘
  ─────────────────────────────────────
  application.yml (default profile)
  application-{profile}.yml
```

`optional:` prefix is what you almost always want — without it, a missing config server or
vault is a startup failure, and that is a *deliberate* choice you should make rather than
inherit. The flip side is a genuine trade-off, and it's the kind of one to be explicit
about in a design review: a hard dependency on a config server means **your application
cannot start when the config server is down**, which turns a single service's dependency
into a fleet-wide availability problem at deploy time. Most teams want `optional:` plus a
cached last-known-good, and they want that decision written down rather than defaulted.

> **PRODUCTION RELEVANCE**
>
> The migration from `bootstrap.yml` to `spring.config.import` is not a find-and-replace.
> `spring-cloud-starter-bootstrap` re-enables the old behaviour and makes the property
> file work *again*, so a team can believe it has migrated while still running the old
> context. The tell is whether the starter is still on the classpath. For an interview, the
> useful framing is: the config-data model made remote configuration a *first-class
> concern of Boot* rather than something a Spring Cloud project bolted on, and the price is
> that you now own an ordering model you have to be able to explain.

### 4.3 `@ConfigurationProperties` in Depth

`@Value` for one value, `@ConfigurationProperties` for a group — Volume 1's conclusion, and
it holds. What follows is the machinery that makes the group version worth it.

```java
// ── JavaBean style: setter binding, mutable, needs a no-arg constructor ──
@ConfigurationProperties(prefix = "acme.reporting")
@Validated
public class ReportingProperties {

    /** JSR-380 constraint — enforced at startup because of @Validated. */
    @NotNull
    private Duration queryTimeout = Duration.ofSeconds(30);

    @Min(1) @Max(1000)
    private int pageSize = 100;

    @Valid                                   // cascade into the nested object
    private Delivery delivery = new Delivery();

    public Duration getQueryTimeout() { return queryTimeout; }
    public void setQueryTimeout(Duration t) { this.queryTimeout = t; }
    // ... getters/setters
}
```

```java
// ── Constructor binding: immutable, one canonical constructor ──
@ConfigurationProperties("acme.reporting")
@Validated
public record ReportingProperties(
        @NotNull @DefaultValue("30s") Duration queryTimeout,   // a duration, not an int
        @Min(1) @Max(1000) @DefaultValue("100") int pageSize,
        @Valid Delivery delivery) {

    public record Delivery(
            @DefaultValue("sync") Mode mode,                    // enum, relaxed binding
            @DefaultValue("3") int retries,
            DataSize maxPayload) {                                // "10MB" binds
    }

    public enum Mode { SYNC, ASYNC }
}
```

| Feature | Detail |
| --- | --- |
| **Binding source** | `Environment` → `Binder` → conversion service → the target object |
| **Relaxed naming** | `acme.reporting.page-size`, `acme.reporting.pageSize`, `ACME_REPORTING_PAGE_SIZE` all bind. **Not** available in `@Value` |
| **`@ConstructorBinding`** | Implied on a single-argument constructor since Boot 3.0; explicit on the class when you also have a default constructor. Required on a multi-constructor class |
| **`@DefaultValue`** | Record form of a field default. Must be a compile-time constant — no `"${...}"` in it |
| **Types** | `Duration` (`30s`, `500ms`, `PT30S`), `DataSize` (`10MB`, `512KB`), enums, `List<T>`, `Map<K,V>`, `Optional<T>` |
| **Collections** | YAML list *or* comma-separated string both bind to `List<T>`. A `List<Record>` binds by index from `acme.x[0].field` — the form used for heterogeneous per-item config |
| **Maps** | `Map<String, Region>` binds from `acme.x.eu-west.timeout=5s`. Keys are preserved verbatim in lower case; use `Map<String, String>` and parse yourself if the key case matters |
| **Validation** | `@Validated` on the class + JSR-380 (`@NotNull`, `@Min`, `@NotEmpty`, `@Pattern`) → `BindValidationException` at startup. `@Valid` cascades into nested types |
| **Registration** | `@EnableConfigurationProperties(ReportingProperties.class)`, or `@ConfigurationPropertiesScan` on a `@Configuration` class to scan a package |
| **On a `@Bean` method** | `@Bean @ConfigurationProperties("acme.x")` binds the returned object's properties — the way to add typed config to a third-party bean without subclassing it |

Two of these are genuinely underused and both are staff-level wins:

- **`@ConfigurationProperties` on a `@Bean` method.** You cannot change a library class's
  source, but you can wrap it: declare the bean, annotate the method, and every settable
  property on that bean becomes configurable with typed validation. This is how you make a
  third-party client configurable without forking it, and it is much better than a stack of
  `@Value` fields setting properties imperatively.
- **Validation constraints as a design conversation.** `@Min(1) @Max(1000) pageSize` is
  free; the valuable part is that the constraint forces a decision. A `retries` count
  with no upper bound and a `connectTimeout` with no lower bound are two properties whose
  relationship is load-bearing and currently unenforced — the constraint is where you
  discover that. This is the same argument Volume 1 Chapter 7 makes, and it is worth
  raising unprompted in a review.

> **MUST REMEMBER**
>
> `@ConfigurationProperties` validation runs at **startup** and fails the context. That is
> the whole point of `@Validated` — and it is why a missing mandatory property is a
> deployment failure rather than a `NullPointerException` at 3am in a rarely-taken code
> path. The corollary is that `@Validated` on a class you forgot to register does nothing
> at all: validation is wired by `@EnableConfigurationProperties` or
> `@ConfigurationPropertiesScan`, not by the `@ConfigurationProperties` annotation alone.

### 4.4 `@Value` vs `@ConfigurationProperties` — the Decision

Volume 1 Chapter 7 has the table. The staff-level version is about which one makes your
configuration surface **auditable**, and the honest answer is that this is the whole
argument:

| | `@Value` | `@ConfigurationProperties` |
| --- | --- | --- |
| Unit | One value | A typed group |
| Failure mode | `Could not resolve placeholder` at bean creation — possibly in a lazy bean | `BindValidationException` at startup, always |
| Enumerable | No — a `grep` | Yes — one class lists everything |
| Relaxed binding | **No** — exact key only | Yes, including `UPPER_SNAKE` env vars |
| Validation | Manual, scattered | JSR-380, with cross-field constraints possible |
| Nested / collections | Not practical | Native, with indexes and map keys |
| Use for | A genuinely isolated value, or a SpEL expression | Everything else |

There is one more `@Value` capability worth naming because it is legitimately
irreplaceable: **SpEL in `@Value` can call a method on another bean**
(`@Value("#{@featureFlags.isEnabled('new-checkout')}")`). `@ConfigurationProperties` binds
data, not behaviour, and a small number of cases genuinely need computation. The trap,
restated from Volume 1: that SpEL is evaluated during bean creation, which creates a
startup ordering constraint that surfaces as a `BeanCurrentlyInCreationException` with
nothing in the stack trace pointing at the annotation.

### 4.5 `/actuator/configprops` — the Endpoint That Prints Your Configuration

`/actuator/configprops` lists every `@ConfigurationProperties` bean, every property, and —
depending on `management.endpoint.configprops.show-values` — the bound value. Three
settings, and the defaults matter enormously:

```properties
management.endpoints.web.exposure.include=health          # default — configprops is NOT in it
management.endpoint.configprops.show-values=never          # default — values replaced by ******
management.endpoint.env.show-values=never                  # default — same
management.endpoint.health.show-details=never              # default
```

**The defaults are correct and the defaults are the defence.** Two independent mechanisms
protect you: the endpoint is not in the default exposure allow-list, and even if you expose
it, values are `******`-sanitized by default. The failures are always the same two:

1. **Someone sets `include=*` in a profile** and it reaches production. Now
   `/actuator/env` prints every property, `/actuator/configprops` prints every bound value,
   `/actuator/heapdump` hands over the entire heap — including every secret ever loaded into
   memory and every `byte[]` in flight.
2. **Someone sets `show-values=always`** "so I can debug it", and it survives into a
   shared config or a chart default. That converts a sanitised endpoint into a credential
   disclosure endpoint, and any password, token, or connection string bound through
   `@ConfigurationProperties` is now in the response body.

> **PRODUCTION SCENARIO**
>
> Problem: a security review flagged that `GET /actuator/configprops` returned 401 on the
> internet-facing service, but a staging service answered with full configuration
> including a database password.
> Investigation: `management.endpoints.web.exposure.include=*` was set in
> `application-staging.yml`, and the staging profile was active in one production
> environment because a Helm value set `SPRING_PROFILES_ACTIVE=staging` for a debug rollout.
> Root cause: the exposure allow-list is inherited by every profile, and
> `configprops.show-values` was `always` in the same file.
> Solution: removed the wildcard; set `show-values=when-authorized`; moved actuator to a
> separate management port bound to the internal interface.
> Prevention: a startup assertion in a `EnvironmentPostProcessor` that fails the boot if
> `exposure.include` contains `*` outside a local profile, and an IaC policy test in CI
> that greps every chart for `include=*`.

The sanitization itself is worth understanding, because it is partial and it is
pattern-based. Boot replaces values whose *name* looks sensitive — anything containing
`password`, `secret`, `key`, `token`, `credentials`, or the common suffixes — with
`******`. The consequences: a property called `acme.credentials-file` is sanitised even
though it is a path; a property called `acme.apiTokenLocation` is sanitised even though it
holds nothing sensitive; and, more seriously, **a secret held under a name that doesn't
match the patterns is printed in full**. `sanitize` on a properties source is a
name-based filter, not a value-based one. This is the honest reason to say that
`show-values=when-authorized` is the correct setting and not a console-only compromise.

### 4.6 Secrets: Where They Should Come From

The design, stated as a pipeline:

```text
   Secret store (Vault / cloud secret manager / mounted file)
        │
        ▼
   Injected as environment variables or a mounted file
        │
        ▼
   Bound to @ConfigurationProperties with @NotBlank
        │
        ▼
   /actuator/env and /actuator/configprops SANITIZE it by name
        │
        ▼
   Never written to application.yml, never logged, never in a heap dump you share
```

Why a committed default is the specific failure everyone should be able to articulate:
`application.yml` is in version control, is baked into the container image, is readable by
anyone who can `docker pull` or clone the repo, and is preserved in git history **forever** —
`git rm` does not remove it from the history, and rotation does not remove it either. The
subtle and much more expensive version: teams commit

```yaml
# THE FAILURE MODE
spring:
  datasource:
    password: ${DB_PASSWORD:devpassword}    # "just a dev default"
```

and then the default becomes the production password, because the environment variable was
never set, because the deployment manifest didn't wire it, and nobody noticed because
production worked. A committed default is a *silent* production secret.

The design that avoids it:

| Requirement | How |
| --- | --- |
| No secret in the repo | The property has **no default**: `@NotBlank String password` with no `:` fallback. Missing → startup failure → caught in CI |
| No secret in the image | Inject as an env var or a mounted file, not a baked `application.yml` |
| No secret in the observable surface | `show-values=when-authorized` (never `always`), and actuator on a separate port/path |
| Rotation without a deploy | For database credentials, prefer an external source (`spring.config.import` with a config server, or Spring Cloud's `refresh` scope); for everything else, rotation *is* a deploy, and that should be a conscious acceptance |
| Rotation for a long-lived process | If a secret must change without a restart, it cannot live in `@ConfigurationProperties` — it needs a `Vault`-backed bean with a token that re-reads, or a `SecretKeyRef` that the platform rotates under a running process |

That last row is the one people skip. A `@ConfigurationProperties` value is bound **once**,
at startup. Refreshing a property source does not rebind an already-constructed bean. So
"rotate the secret" is, for a `@ConfigurationProperties`-bound credential, a restart — and
if your platform's rotation story requires zero downtime, the credential has to be read
through an abstraction that re-reads (a supplier bean, a dynamic data source) rather than
bound at construction.

> **STAFF-LEVEL CONSIDERATION**
>
> The question worth raising in a design review is not "are the secrets safe" — it is
> "**who is allowed to see this, and for how long**". A secret in a config file is
> readable by everyone with repo access, forever. A secret in an environment variable is
> readable by anyone who can read the pod spec, and shows up in `kubectl describe` output
> and in some CI logs. A secret in a vault is readable by a workload identity and
> auditable. Those are three different trust boundaries, and a team that has never
> articulated which one it is in has not made the decision — it has just not been asked
> yet. The follow-on question that gets the real answer is "when this person leaves, what
> changes?" If the answer is "we rotate everything", the rotation story is real; if the
> answer is "nothing", the credentials are permanent and should be designed that way
> honestly.

#### Common Mistakes

- Assuming `file:./config/` overrides `file:./` because it is more specific. Precedence
  follows the search-list order, and `file:./` comes first.
- Using `spring.config.location` when you meant `spring.config.additional-location`.
  `location` *replaces* the default list, so the in-jar `application.yml` silently stops
  being read — usually discovered as "my default timeout is null".
- Expecting `spring.config.import` entries to be consulted before the environment.
  Imported documents sit *below* the environment and command line, and *above* the
  document that declared the import.
- Forgetting that `optional:` changes a hard startup dependency into a silent fallback, and
  not deciding which one you meant.
- Believing the config data is in sync with a `@ConfigurationProperties` class after a
  remote change. Binding happens once at startup; a refreshed property source does not
  rebind a constructed bean.
- Expecting `/actuator/configprops` to exist by default. It is enabled by default but not
  in the default exposure allow-list, so it 404s until you add it.
- Setting `management.endpoint.configprops.show-values=always` for debugging and not
  reverting it. Sanitization is a **name-based** filter, so a secret under an
  unrecognised property name is printed in full regardless.
- Committing `${DB_PASSWORD:devpassword}`. The default silently becomes the production
  secret wherever the environment variable is missing, and a git history keeps every past
  value forever.

#### Interview Questions — Externalized Configuration

**Q1. What are Boot's default configuration search locations, and in what order?** `TRICKY`

`classpath:/`, `classpath:/config/`, `file:./`, `file:./config/`, `file:./config/*/` — all
`optional:` by default, so a missing location is skipped rather than fatal. The first match
wins, and within a location, profile-specific files override the profile-less one.
`file:./config/*/` is the per-profile-directory pattern. Critically, `file:./` is consulted
*before* `file:./config/`, so a file in the working directory shadows the one in the
conventional directory.

**Q2. `spring.config.location` and `spring.config.additional-location` — what is the
difference, and which one do you usually want?** `TRICKY`

`location` *replaces* the default search list, which means the in-jar `application.yml`
stops being read unless you list it explicitly — the classic cause of "my default value is
now null". `additional-location` *adds* to the list and its entries are consulted before the
defaults, so it is almost always the right choice for an override directory, and the right
choice for a ConfigMap mount.

**Q3. Where do `spring.config.import` documents sit in the precedence order?** `TRICKY`

Immediately below the document that declared the import — so imported config beats the
`application.yml` that named it, but loses to everything that was in the environment
before configuration classes were parsed: command line arguments and
`SPRING_APPLICATION_JSON`. Within the import list, the order you declare is the order
they're inserted, so the first `spring.config.import` entry is the most authoritative.

**Q4. What does `SPRING_APPLICATION_JSON` do and why does it exist?** `TRICKY`

It injects a JSON document as a property source at position 4 in the precedence ladder —
above servlet parameters and system properties, below command line arguments. It exists
because neither a shell environment (flat strings, no structure) nor a command line (no
lists, awkward quoting) can express structured configuration. It is also the highest-
precedence source an orchestrator can set from a ConfigMap, which means anyone who can
write the pod spec can override your security settings — worth knowing when you design
around it.

**Q5. When would you use `@ConfigurationProperties` on a `@Bean` method rather than on a
class?** `TRICKY`

When you want to make a third-party bean configurable without owning its source. You
declare the bean, annotate the method with `@ConfigurationProperties("acme.vendor")` and
`@Validated`, and every settable property on the returned object becomes a typed, validated,
enumerable configuration surface. It's the standard answer to "how do I configure a library
I can't change", and it's much better than imperatively setting properties from scattered
`@Value` fields.

**Q6. What is sanitized by default at `/actuator/configprops` and `/actuator/env`, and why
is that not a complete defence?** `ADVANCED`

`management.endpoint.configprops.show-values` and `management.endpoint.env.show-values` both
default to `never`, which replaces values with `******`. Sanitization is a **name-based**
filter matching patterns like `password`, `secret`, `key`, `token`, `credentials`. So it both
over-sanitizes (a property called `api-key-location` is hidden) and under-sanitizes (a secret
under a name that doesn't match a pattern is printed in full). The correct default posture
is `when-authorized` plus a management surface that isn't publicly reachable — not reliance
on the name filter.

**Q7. Your team rotates a database password. The application reads it through
`@ConfigurationProperties`. What happens?** `TRICKY`

Nothing, until the next restart. `@ConfigurationProperties` is bound once during context
refresh, and refreshing a property source does not rebind an already-constructed bean. So
rotation for a properties-bound credential is a restart. If your platform requires
zero-downtime rotation, the credential has to be read through something that re-reads — a
supplier-style bean, a dynamic data source, or a platform mechanism that rewrites a mounted
secret under a running process.

**Q8. Is `spring.config.import` without `optional:` a good idea?** `TRICKY`

It's a real decision with a real cost. A hard import means the application cannot start when
the config server or vault is unavailable, which turns one service's dependency into a
fleet-wide deploy-time availability problem. Most teams want `optional:` plus a cached
last-known-good, or a `fail-fast` profile that only fails in environments where that's the
right answer. What matters is that the choice is made and written down, because the default
(`optional:`, and therefore silent degradation to packaged defaults) hides the failure
instead of surfacing it.

> **CHAPTER 4 SUMMARY**
>
> Boot's configuration model is an ordered search list —
> `classpath:/`, `classpath:/config/`, `file:./`, `file:./config/`, `file:./config/*/` — where
> precedence follows list order rather than specificity, which is why a stray file in the
> working directory beats the one your runbook calls authoritative.
> `spring.config.import` composes documents from config servers, vaults and files, and sits
> immediately below the document that declared it and above nothing that was in the
> environment. `@ConfigurationProperties` is the mechanism that makes the surface typed,
> enumerable and startup-validated, with `Duration`/`DataSize`/collections/maps handled
> natively and `@Bean`-method binding extending it to code you don't own. Two
> frequently-misstated facts belong in any senior answer: `/actuator/configprops` and
> `/actuator/env` sanitize values by default but are **not** in the default exposure
> allow-list, and the sanitization is a name-based filter that misses secrets stored under
> unremarkable property names. And the secret design conclusion is concrete — no committed
> default, no baked-in value, `when-authorized` at best, and an explicit acknowledgement
> that properties-bound credentials can only be rotated by a restart.

#### Further Reading

- [Spring Boot Reference — Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html) — the authoritative list of locations, the config tree, `SPRING_APPLICATION_JSON`, and the config-data ordering model.
- [Spring Framework Reference — Environment Abstraction](https://docs.spring.io/spring-framework/reference/core/beans/environment.html) — `Environment`, `PropertySource`, and why `@Value` and the binder resolve properties differently.
- [Spring Boot Reference — Profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html) — profile groups, `on-profile` documents, and how a profile-specific file interacts with the search list.
- [Spring Boot Reference — Actuator How-to](https://docs.spring.io/spring-boot/how-to/actuator.html) — securing actuator endpoints, the exposure allow-list, and the `show-values` sanitization settings.

## Chapter 5 — The Executable JAR

### 5.1 What's Actually Inside

```text
order-service.jar
├── META-INF/
│   └── MANIFEST.MF              Main-Class: org.springframework.boot.loader.launch.JarLauncher
├── org/springframework/boot/    The loader classes — Boot's own classloader
│   └── loader/
│       ├── launch/JarLauncher.class
│       ├── launch/JarLauncher.class
│       ├── jar/JarFile.class, JarEntry.class      ← nested jar support
│       └── ...
├── BOOT-INF/
│   ├── classes/                 YOUR compiled classes and resources
│   │   └── com/acme/orders/OrderService.class
│   ├── lib/                     EVERY dependency, as a nested .jar
│   │   ├── spring-boot-3.4.1.jar
│   │   ├── spring-web-6.2.1.jar
│   │   ├── tomcat-embed-core-10.1.x.jar
│   │   └── ... 60 more
│   └── classpath.idx            the order to load BOOT-INF/lib in
└── (your own classes at the root if the jar is also a library)
```

A conventional jar is a **zip**. Boot's jar is a zip whose entries are themselves zips —
`BOOT-INF/lib/spring-web.jar` is a complete jar file stored *inside* the outer archive.
That nesting is the entire reason the format is unusual, and it is the root of everything
else in this chapter.

### 5.2 Why `java -jar` Works and `java -cp` Doesn't

```text
java -cp app.jar com.acme.Application     ✗  ClassNotFoundException
java -jar app.jar                          ✓  runs

WHY:
  java -cp app.jar  → the JVM's AppClassLoader treats app.jar as an ORDINARY
                      classpath root. It looks for com/acme/Application.class at the
                      TOP LEVEL. It is not there — it's under BOOT-INF/classes/.
                      And BOOT-INF/lib/*.jar are files, not classpath entries, so
                      they are never opened. Result: nothing found.

  java -jar app.jar  → reads META-INF/MANIFEST.MF, finds
                      Main-Class: JarLauncher, and hands control to Boot's
                      OWN loader, which understands the nested layout:
                        • BOOT-INF/classes/  → added as a classpath entry
                        • BOOT-INF/lib/*.jar  → each opened as a nested jar
                        • the outer jar itself → added too, for the loader classes
```

So the answer to "why doesn't `java -cp` work" is not that the jar is special — it's that
`java -cp` uses a loader that does not know the format is nested, while `java -jar` reads
the manifest and uses one that does. This is a genuinely good interview question because
the instinct is to say "because it's a fat jar", and the real answer is about **which class
loader is in play**.

Boot's loader (`LaunchedClassLoader` / `LaunchedURLClassLoader` in the 3.x line) is a
`URLClassLoader` subclass whose `findClass` special-cases nested entries: when the parent
fails, it looks for the resource inside the nested jar bytes and defines the class itself.
It's an unusual piece of machinery and it is the reason several production behaviours are
what they are:

| Behaviour | Cause |
| --- | --- |
| `java -jar` is required; `java -cp` fails | `AppClassLoader` doesn't know the nested format |
| A "corrupted" jar that a 7-Zip user extracts and re-zips runs differently | The nested jars must be **stored** (uncompressed) for random access; re-zipping compresses them and the loader's seek-based reader degrades or fails |
| `jib`, `buildpacks` and layered images all do unusual things | They all manipulate `BOOT-INF/` directly |
| The jar is ~10–20% larger than the sum of its parts | No cross-jar compression |

> **PRODUCTION RELEVANCE**
>
> Repackaging a Boot jar — "just unzip and re-zip" — is a real incident generator. The
> loader's nested-jar reader depends on stored (uncompressed) entries; recompressing them
> makes the app slower at best and broken at worst, and the failure is often intermittent
> enough to look like flakiness. The other genuine source of the same symptom is a build
> pipeline that assembles a "thin" jar and expects `java -cp` to work, which needs the
> dependencies on the classpath explicitly. Both come up in supply-chain and legacy
> repackaging work, and the answer is always the same: don't rebuild the archive by hand.

### 5.3 The Nested-Jar URL Handler and the `jarmode` Move

For most of Boot's life, a nested jar was reachable as a `jar:nested:/path/to/lib.jar!/`
URL, handled by a custom `URLStreamHandler` in `spring-boot-loader`. This let a nested jar
be treated as a first-class resource URL: `new URL("jar:nested:...")`, and it worked with
tools that wanted to *stream from inside* the archive.

Spring Boot 3.2 **deprecated** URL-handler-based access to nested jars, and the supported
alternatives are the `jarmode` tools. The deprecation is worth understanding, not just
remembering:

- The custom `URLStreamHandler` is a global JVM extension. Registering one changes how
  `jar:` URLs are parsed **for the entire process**, including in code you don't control,
  and it interacts badly with the module path, with `URL.openStream()` caching, and with
  classloaders that expect a standard handler.
- The nested-jar read path is the one part of a Spring Boot jar that is neither
  conventional nor fast. Every class load from a nested jar can go through custom seek
  logic.

So the supported operations are now explicit and out-of-band, rather than implicit:

```bash
# Explode the whole archive to a directory — the general-purpose operation
java -Djarmode=tools extract --file app.jar --destination ./app-extracted/

# Explode into a directory with a Docker-ready layer layout
java -Djarmode=layertools extract --file app.jar --destination ./app-layers/

# 2.x-era spelling, still around in scripts you'll inherit
java -Djarmode=layertools list

# Run a different main class from the same fat jar
java -Djarmode=tools -Dloader.main=com.acme.Cli app.jar
```

> **INTERVIEW TRAP**
>
> "Boot 3 still uses a custom URL handler for nested jars" is out of date. Boot 3.2
> deprecated URL-handler-based access to nested jars precisely because the handler is a
> process-global JVM extension that interacts badly with the module path and with foreign
> classloaders; the supported path is the `jarmode` tools — `layertools extract` for the
> layered layout, `tools extract` for a plain explode. The `jar:nested:` URL form still
> appears in blog posts and old runbooks, which is exactly why it's worth getting right.

### 5.4 Layered Jars and the Docker Layer-Cache Payoff

This is the practical heart of the chapter, and the reasoning is clean once you see it.
A Docker image is a stack of filesystem layers. Each layer is a **tar diff**. When
Docker pulls or builds, a layer is a cache hit only if its content and its parent chain are
unchanged. So the layout question is: **what changes most often, and is it in its own
layer?**

```text
Unlayered fat jar:
  [ ONE layer containing classes + all 60 dependency jars ]
  → any code change rebuilds and re-pushes the whole 150MB.

Layered (classpath.idx entries tagged with layer ids):
  layer 1  dependencies/       ← spring-boot, spring-core, tomcat, jackson ...
  layer 2  spring-boot-loader/
  layer 3  classpath/          ← BOOT-INF/classes — YOUR code and resources
  → a code change rebuilds ~2MB; the 130MB dependency layer is cached and never
     re-pushed unless a version changed.
```

The separated directory layout that `layertools extract` produces:

```text
app/
├── application.jar                     the repackaged thin jar
├── dependencies/                        the dependency jars, unchanged between code deploys
│   └── BOOT-INF/lib/*.jar
├── spring-boot-loader/                  the loader
│   └── org/springframework/boot/loader/**
└── classpath/                           the class files and resources
    └── BOOT-INF/classes/**
    └── BOOT-INF/classpath.idx
```

The class-file/jar split is the whole trick. The dependency directory is byte-identical
across a thousand deployments of the same build; the `classpath/` directory is the only
thing that changes when you ship a feature. Putting them in separate layers converts
"every deploy pushes 150MB" into "every deploy pushes 2MB", and — more importantly —
converts a **cold pull of a 150MB image into a cached pull of the dependency layer plus a
2MB delta**.

| | Unlayered | Layered |
| --- | --- | --- |
| Image size on disk | ~150MB in one layer | ~150MB total, split |
| Bytes pushed per code deploy | ~150MB | ~2MB |
| Cold pull after a code change | Full transfer | Cached dependency layer + small delta |
| Layer invalidation trigger | Any change | Only a dependency version change |

> **SCALING REALITY CHECK**
>
> The reason layer caching matters operationally rather than cosmetically is scale-from-zero.
> A service that autoscales from zero on a traffic spike has to pull its image during the
> spike. With an unlayered 150MB image, every new replica is paying a registry transfer at
> the exact moment the system is under stress — and the scale-up that was supposed to fix
> an incident is itself gated on network transfer. With layers, a scale-up event is a
> metadata request plus a few megabytes. This is the single most concrete argument for
> layering, and it only shows up in the incident where you most needed the extra replicas.

An important caveat: **layering does nothing if your build produces a new
`dependencies/` directory on every run.** A common mistake is having the build write
timestamps, or having the dependency directory regenerated with unstable ordering, which
changes the tar even when the jars are identical. The `classpath.idx` file is what pins the
ordering precisely so that the layer is stable; if you rebuild it each time, the layer
hash changes and the cache misses every deploy.

### 5.5 CNB, `build-info`, and `PropertiesLauncher`

**Cloud Native Buildpacks / Paketo** automate the whole thing, and the reason they matter
is that they do the layering correctly by default rather than requiring a team to get it
right:

```bash
# Cloud Native Buildpacks (requires the `pack` CLI and a builder image)
pack build order-service:1.4.0 --builder paketobuildpacks/builder-jammy-base

# Paketo's Maven/Gradle buildpack, invoked directly, which is what pack wraps
./mvnw spring-boot:build-image
```

The `spring-boot:build-image` goal is worth knowing precisely because it is the lowest-friction
path and it does more than it looks:

- Runs the application through buildpacks to produce an OCI image **layered by default**.
- Adds the `BP_JVM_VERSION`, `BP_JVM_TYPE` and `BP_JVM_JVMARGS` environment variables
  during the *build* so the compiled bytecode targets the image's JVM — the fix for the
  "compiled with Java 21, image has Java 17" class of deploy failure.
- Adds a `build-info` section to `/actuator/info` containing the build revision, name,
  group, version and time, generated from the build tool's own metadata.

```bash
# The build-info Maven goal
./mvnw spring-boot:build-info
# → target/classes/META-INF/build-info.properties
```

That `build-info.properties` is a small, high-value operational feature: `/actuator/info`
then answers "which commit is this instance?" without anyone maintaining a `GIT_COMMIT`
env var in the Helm chart. The failure it prevents is real and recurring — an incident
where three versions of a service are running and nobody can say which one is on which pod,
because the image tag was mutable and the version lived only in a build log.

**`PropertiesLauncher`** is the escape hatch for when `JarLauncher`'s assumptions are wrong —
typically long-running processes that need to be *updated* without a full restart, or a jar
that is a library plus a process:

```properties
# application.properties inside the jar
loader.path=lib/extra-jars/,lib/one.jar,lib/two.jar     # added to the classpath
loader.main=com.acme.daemon.DaemonApplication           # override the entry point
loader.main=org.springframework.boot.loader.PropertiesLauncher
```

A daemon-style deployment is where this is genuinely used: a long-lived worker process that
pulls a new build's jars into `lib/` and restarts, with the outer jar and the loader
unchanged, so the restart is a file copy rather than a distribution step. The cost is that
you have opted out of the straightforward "one artefact, one command" model, and
`PropertiesLauncher` is a different classloader configuration with different
diagnostics.

### 5.6 What `java -jar` Looks Like to a Platform Team

The packaging decision and the JVM flags are the same conversation. A platform engineer
looking at `ENTRYPOINT ["java", "-jar", "/app.jar"]` in a Dockerfile is looking at a
deployment that cannot answer: how much heap, where does the GC log go, what happens on
OOM, does it respect the container's memory limit.

```dockerfile
# A container-aware, diagnosable JVM invocation
ENTRYPOINT ["java", \
  "-XX:MaxRAMPercentage=75.0", \                 # respect the container limit, not the host's RAM
  "-XX:+ExitOnOutOfMemoryError", \              # exit non-zero on OOM so the platform restarts you
  "-XX:+HeapDumpOnOutOfMemoryError", \          # dump the heap — but to a WORM volume
  "-XX:HeapDumpPath=/var/dumps", \              # NOT to a container-local ephemeral path
  "-Xlog:gc*,safepoint:file=/var/log/gc.log:time,uptime,level,tags:filecount=5,filesize=20M", \
  "-XX:+UseContainerSupport", \                  # default on in modern JVMs; explicit for clarity
  "-Djava.security.egd=file:/dev/./urandom", \  # entropy without a blocking read
  "-jar", "/app.jar"]
```

| Flag | Why a platform team asks for it | The failure it prevents |
| --- | --- | --- |
| `-XX:MaxRAMPercentage=75.0` | The JVM's ergonomics in a container should be derived from the *cgroup* limit, not the host's memory. `-Xmx` hard-coded at build time breaks the moment the limit changes | A container OOM-killed by the kernel because the JVM sized its heap from the host |
| `-XX:+ExitOnOutOfMemoryError` | An OOM should terminate the process with a non-zero exit code, not limp on in an undefined state | The genuinely bad one: the JVM survives OOM, the pod is `Running`, the app is serving 500s, and nothing restarts it |
| `-XX:+HeapDumpOnOutOfMemoryError` | The dump is the only real evidence of what was in memory | Guessing at a leak with only heap metrics |
| `-XX:HeapDumpPath=/dumps` | A dump is often several GB and must go to a persistent volume | A dump written to the container's writable layer, which is deleted when the container is replaced — *after* the platform restarts it |
| `-Xlog:gc*:file=…` with rotation | GC pause data is the input to every JVM sizing decision | Resizing the heap by intuition, or restarting the pod for a long GC pause without knowing it was GC |
| `-Xshare` / CDS / AOT (Chapter 6) | Class-data sharing cuts both startup time and steady-state footprint | Paying the class-loading cost on every instance start, which is exactly the cost that hurts during a scale-up |

The pairing to emphasise is the first two rows. **`-XX:MaxRAMPercentage` without
`-XX:+ExitOnOutOfMemoryError` gives you a container that is correctly sized and silently
broken**, and that combination is what most base images ship today. The second is that
`HeapDumpOnOutOfMemoryError` without a persistent `HeapDumpPath` is close to useless in
Kubernetes: the restart that should capture the evidence is the restart that deletes it.

> **STAFF-LEVEL CONSIDERATION**
>
> The packaging decision and the deployment model are the same decision, and at staff
> level it is worth being the person who says so. "One fat jar, run it with `java -jar`"
> is an excellent answer for a batch job, a CLI, and a simple service, and a poor answer
> for a service that must be updated 50 times a day across 40 instances, because the
> immutable-JVM-image model pushes a different operational model (image promotion, layer
> caching, config as a separate concern, sidecar injection) that the team has to be
> willing to adopt. The question that surfaces this is not "should we use containers" but
> "**how do we ship a change to 40 instances in the next 10 minutes**", and the honest
> answer is that an app server or a shared runtime wins that, while a JVM image wins on
> reproducibility and dependency isolation. Neither is universally right, and the
> interview answer that scores well names the condition that flips it.

#### Common Mistakes

- Reaching for `java -cp app.jar` on a Boot jar. It cannot work — the JVM's
  `AppClassLoader` does not understand `BOOT-INF/`, and the nested dependencies are never
  opened.
- Re-zipping a Boot jar with an archive tool. The loader's nested-jar reader expects
  stored, uncompressed entries; recompressing them degrades class loading or breaks it,
  intermittently, which is worse.
- Using the `jar:nested:` URL form in new tooling. URL-handler-based access to nested jars
  was deprecated in Boot 3.2 in favour of `jarmode`; the old form still appears in older
  runbooks.
- Enabling layered extraction but regenerating the `dependencies/` directory on every
  build, so the layer hash changes every time and the cache never hits.
- Hard-coding `-Xmx` in a container instead of `-XX:MaxRAMPercentage`, so a limit change
  silently OOM-kills the pod.
- Shipping `-XX:+HeapDumpOnOutOfMemoryError` without a persistent `HeapDumpPath`, so the
  dump is written to the container's ephemeral layer and destroyed by the restart it was
  supposed to explain.
- Omitting `-XX:+ExitOnOutOfMemoryError`, leaving the JVM to survive an OOM in an
  undefined state with the pod still `Running`.
- Mutable image tags, so a running incident has three versions of a service deployed and
  nobody can say which is on which pod. `spring-boot:build-info` fixes this for the
  cost of one build step.

#### Interview Questions — The Executable JAR

**Q1. Why does `java -jar app.jar` work when `java -cp app.jar` fails?** `TRICKY`

`java -cp` uses the JVM's standard `AppClassLoader`, which treats the archive as an
ordinary classpath root and looks for `com/acme/Application.class` at the top level —
it isn't there, it's under `BOOT-INF/classes/`, and the dependency jars are files under
`BOOT-INF/lib/` that nothing ever opens. `java -jar` reads `Main-Class` from the manifest,
which points at Boot's own `JarLauncher`, and hands off to a custom
`LaunchedClassLoader` that adds `BOOT-INF/classes/` as a classpath entry and opens each
nested `BOOT-INF/lib/*.jar` as a jar in its own right. It's a difference of class loader,
not a difference of jar.

**Q2. What did Spring Boot 3.2 change about nested jars, and why?** `ADVANCED`

It deprecated URL-handler-based access to nested jars. A custom `jar:` `URLStreamHandler`
is a **process-global** JVM extension — registering it changes URL parsing for code you
don't control, and it interacts badly with the module path and with classloaders that
expect a standard handler. The nested-jar read path is also the one unconventional,
seek-heavy part of the format. The supported alternative is out-of-band and explicit:
`java -Djarmode=layertools extract` for a layered layout, and
`java -Djarmode=tools extract` for a plain explode, with `-Djarmode=tools` also providing
`loader.main` override.

**Q3. What problem do layered jars actually solve, and what is the concrete number?** `TRICKY`

Docker layers are cache hits only when content and parent chain are unchanged, so an
unlayered fat jar re-pushes all ~150MB on any code change. Layering separates the
dependency jars (`dependencies/`) from your class files (`classpath/`), so a code-only
deploy becomes a ~2MB push while the 130MB+ dependency layer stays cached. The number that
matters operationally is the **cold-pull time during a scale-up event** — an unlayered
image makes every new replica pay a full registry transfer at the exact moment the system
is under stress.

**Q4. When is a layered build worse than an unlayered one?** `STAFF`

When the layering is not stable. If the build regenerates the dependency directory with
different ordering, different timestamps, or a different tar layout, the layer hash
changes on every run and the cache never hits — you have all the complexity and none of
the benefit. That's why `classpath.idx` exists: it pins the classpath order so the layer
is byte-stable. The check is empirical — deploy twice with no dependency change and
confirm the dependency layer is a cache hit — and a team should do it once during
adoption rather than assume.

**Q5. What JVM flags would you put on a Boot container, and why each?** `STAFF`

`-XX:MaxRAMPercentage=75.0` so the heap derives from the cgroup limit rather than a
hard-coded `-Xmx` baked at build time; `-XX:+ExitOnOutOfMemoryError` so an OOM terminates
with a non-zero exit code instead of leaving a `Running` pod serving 500s from an undefined
JVM; `-XX:+HeapDumpOnOutOfMemoryError` with `-XX:HeapDumpPath` on a **persistent** volume,
because a dump to the container's ephemeral layer is destroyed by the restart it was meant
to explain; `-Xlog:gc*:file=…` with `filesize`/`filecount` rotation, because GC pause data
is the only legitimate input to a heap-sizing decision. The pairing I'd insist on is the
first two: correctly sized *and* failing loudly.

**Q6. What is `build-info` for, and what's the incident it prevents?** `TRICKY`

`./mvnw spring-boot:build-info` generates `META-INF/build-info.properties` from the build
tool's metadata — revision, name, group, version, time — and
`spring-boot:build-image` does it automatically, so `/actuator/info` reports which commit
an instance is running. The incident it prevents is the mutable-image-tag one: three
versions of a service running, an incident in progress, and no way to tell which pod has
which build without exec-ing into each container and guessing from a file timestamp.

**Q7. When is `PropertiesLauncher` the right choice over `JarLauncher`?** `STAFF`

When the outer artefact and the process are managed separately — a long-running daemon
whose dependencies are updated by replacing jars in a `lib/` directory, or a jar that is
both a library and a process. `loader.path` and `loader.main` let the classpath and entry
point vary per invocation. The cost is opting out of "one artefact, one command" and into a
different classloader configuration with different diagnostics, so it's a deliberate choice
for update-in-place deployments rather than a default.

> **CHAPTER 5 SUMMARY**
>
> The executable jar is a zip whose entries are themselves zips, and that nesting is why
> `java -jar` works (Boot's manifest points at a custom `LaunchedClassLoader` that
> understands `BOOT-INF/`) while `java -cp` cannot (the JVM's `AppClassLoader` looks for
> top-level class entries and never opens the nested dependencies). Boot 3.2 deprecated
> URL-handler access to nested jars — a process-global JVM extension that interacts badly
> with the module path — in favour of the `jarmode` tools, and that deprecation is a
> standard interview differentiator. The practical payoff is layering: separating
> `dependencies/` from `classpath/` turns a 150MB push per deploy into a 2MB push, which
> matters most during a scale-from-zero event when every new replica is pulling its image
> under load. Buildpacks and `spring-boot:build-info` are the two cheap wins — the first
> does the layering correctly by default, the second answers "which commit is this pod"
> during an incident. And the packaging conversation is really a deployment-model
> conversation: the same `ENTRYPOINT` should carry `MaxRAMPercentage`,
> `ExitOnOutOfMemoryError`, a persistent `HeapDumpPath` and GC logging, because a platform
> team reads those flags before it reads your jar.

#### Further Reading

- [The Executable JAR Format (Boot Specification)](https://docs.spring.io/spring-boot/specification/executable-jar/index.html) — the normative description of the layout, the manifest, and the `classpath.idx`; the authoritative answer to "what is actually in there".
- [Spring Boot Reference — Packaging Your Application for Production](https://docs.spring.io/spring-boot/reference/using/packaging-for-production.html) — WAR vs JAR, `PropertiesLauncher`, and the deployment options including the supported `jarmode` spellings.
- [Spring Boot Reference — Packaging Spring Boot Applications](https://docs.spring.io/spring-boot/reference/packaging/index.html) — the umbrella for executable, container and OCI packaging, and where `spring-boot:build-image` and build-info sit.
- [Cloud Native Buildpacks](https://buildpacks.io/) — how the layered OCI image is actually constructed, and why a buildpack gets the layer boundaries right by default.
- [BellSoft Liberica](https://bell-sw.com/) — a JDK distribution with container-aware builds and CDS/AOT baked in; useful for seeing the JVM-flag side of the same conversation.

## Chapter 6 — AOT & GraalVM Native Image

### 6.1 What AOT Processing Is and Why It Exists

Ahead-of-time processing is the answer to a structural problem with the JVM and Spring
specifically. Spring does two things at runtime that require *inspecting* code rather than
executing it:

```text
┌─────────────────────────────────────────────────────────────────┐
│  1. REFLECTION   — reading annotations, instantiating a class    │
│                    from a name, calling a method by name,       │
│                    resolving generic type arguments             │
│                                                                 │
│  2. PROXYING     — generating a subclass (CGLIB) or a JDK proxy │
│                    AT RUNTIME, from a class that may not        │
│                    implement an interface                        │
│                                                                 │
│  Both are unbounded work: Spring cannot know ahead of time      │
│  which of your 4,000 classes it will reflect over or proxy.     │
└─────────────────────────────────────────────────────────────────┘
```

AOT processing runs the application context at **build time**, in a special mode where these
operations are *recorded* rather than performed. The output is a set of generated source
files plus a resource listing:

```text
build time                                    run time
──────────                                    ─────────
  SpringApplication.run(...)                   Load context from:
    (in AOT mode)                                 ├── generated __ bean definitions
      │                                            └── META-INF/spring/aot-resources.ser
      ├── CREATE every bean definition
      ├── RECORD every reflection call  ─────►    READ the record, no reflection
      ├── RECORD every proxy request     ─────►    USE the generated subclass
      └── WRITE generated sources + a
          resource index
```

The practical result: at startup, Spring no longer performs the expensive reflective
discovery. It reads a precomputed index. That is why AOT is described as improving startup
time and memory — and it is genuinely on by default for some scenarios in Boot 3, not an
opt-in you have to find.

```java
// Opting in explicitly (in a Gradle build, the build plugin does it for you)
// and the registrar API you would write as a library author:

@ImportRuntimeHints(AcmeHints.class)
@Configuration
class AcmeConfiguration { … }

class AcmeHints implements RuntimeHintsRegistrar {
    @Override
    public void registerHints(RuntimeHints hints, ClassLoader classLoader) {
        // Tell AOT which members need reflective access — a Jackson-serialised DTO:
        hints.reflection().registerType(MyDto.class, MemberCategory.INVOKE_DECLARED_CONSTRUCTORS,
                                                    MemberCategory.INVOKE_DECLARED_METHODS,
                                                    MemberCategory.DECLARED_FIELDS);
        // A resource read reflectively:
        hints.resources().registerPattern("templates/*.ftl");
        // A proxy that must be generated ahead of time:
        hints.proxies().registerJdkProxy(MyServiceInterface.class, java.io.Serializable.class);
    }
}
```

**When do you need to write a `RuntimeHintsRegistrar`?** Exactly when AOT processing *fails*
to capture something it cannot see — and it can only see what it can infer. The three
categories, with the real-world example of each:

| Category | What AOT cannot infer | Example |
| --- | --- | --- |
| Reflection | A reflective call whose target type is not reachable from a constructor, a `@Bean` method, or a scanned component | A legacy `ObjectMapper` configured to serialise a DTO class that is only ever built reflectively |
| Resources | A resource loaded by a computed name at runtime | A tenant-specific template `templates/{tenantId}.html` |
| Proxies | A JDK proxy requested for an interface combination never seen statically | A `Serializer`/`Deserializer` pair for a custom wire format |

The honest staff-level statement about this work: **it is unavoidable for library authors and
it is a real ongoing tax.** A library that uses reflection internally and doesn't ship hints
makes native image impossible for its users, and the signal arrives as an exception at
native-image build time — a CI failure for the *consumer*, not a warning in the library's own
build. The mitigation is that GraalVM ships a community metadata repository
(`reachability-metadata`) that covers popular libraries, so the common cases are handled
externally; the residue is your own dynamic code.

### 6.2 GraalVM Native Image: What It Gives

Compiled ahead-of-time to a **standalone native binary** — no JVM, no `libjvm.so`, no class
loading, no JIT.

| Benefit | Mechanism | Where it shows up |
| --- | --- | --- |
| **Millisecond startup** | Nothing is parsed, verified, or JIT-compiled at startup. The binary is already machine code | A JVM service that takes 8–15s to accept traffic starts in tens of milliseconds |
| **Low memory footprint** | No JVM metadata (metaspace, code cache, JIT structures) — typically 10–50MB of RSS for a trivial service, versus 60–100MB+ for a bare JVM | This is the number that changes density economics: many more instances per node |
| **No JIT warm-up** | No interpreter-then-C1-then-C2 phase; the code is already optimised | Steady state from the first request, not from the 10,000th |
| **Predictable latency** | No GC pauses from a generational collector doing its work, and no compilation happening on the request path | p99 far closer to p50 than on JVM, for short-lived and modest workloads |
| **Single binary** | The runtime, the application and the (selected) system libraries are statically linked | No JRE to install, no `JAVA_HOME` to configure, trivial container images |

For serverless and scale-to-zero, the cold-start and memory numbers are not marginal — they
determine whether the architecture is viable at all. A JVM Lambda with 512MB of memory and a
10-second cold start behaves badly; a native binary with 50MB and 50ms is the difference
between a feasible and an infeasible design.

### 6.3 What It Costs

| Cost | Detail | The number people underestimate |
| --- | --- | --- |
| **Build time** | Full AOT compilation of the whole reachable program | **Minutes**, not seconds — commonly 2–10 minutes for a Spring Boot application, and it grows with the dependency graph |
| **Lower peak throughput** | The AOT compiler optimises for *startup*, not for hot loops. No profile-guided optimisation, no re-JIT, no deoptimisation/recompilation | On a CPU-bound hot path, a native binary can be **slower** than a warmed-up JVM. This surprises people who benchmarked startup and assumed throughput followed |
| **Constrained reflection** | Only registered reflective accesses exist at runtime; anything unregistered is a hard failure | Every dynamic framework in the graph (Jackson polymorphic types, Hibernate proxies, your own reflection) needs hints |
| **Binary size** | Statically linked, no shared deduplication | A simple Spring Boot native binary is commonly 50–90MB — larger than you expect, and it does not shrink |
| **No JIT, no tiered compilation** | Code quality is fixed at build time | A long-running, high-traffic, computation-heavy workload leaves real throughput on the table |
| **CI cost** | A native build per platform per commit, or a slower pipeline | The operational cost that actually decides it — see 6.4 |
| **Debugging** | No `jstack`, no heap dump, no `-XX:+HeapDumpOnOutOfMemoryError` | Observability tooling is materially worse; you depend on the native agent ecosystem instead |
| **Dynamic language features** | Agents, bytecode generation, some mocking frameworks | Anything that generates bytecode at runtime is out |

The throughput point deserves a concrete correction to the common story, because it is the
one that changes architecture decisions:

> **INTERVIEW TRAP — "NATIVE IMAGE IS FASTER"**
>
> The reflexive claim is that native image makes Spring Boot faster, and the correct
> decomposition is that it makes **startup** faster and **memory** smaller, while making
> **peak throughput on hot code worse**. The reason is that GraalVM's AOT compiler
> optimises the whole program for startup and for image size, with no opportunity for
> profile-guided optimisation — the JVM's advantage is precisely that it *watches which
> methods are hot* and recompiles them, which a build-time compiler cannot do. So for a
> service whose cost is dominated by database round-trips and network I/O — the overwhelming
> majority of Spring services — the throughput difference is noise and the startup and
> memory wins are real. For a service doing genuinely CPU-bound work in a hot loop, the
> warmed-up JVM can beat the native binary. Stating "native is faster" costs you the
> point; stating the three axes separately earns it.

### 6.4 The Staff-Level Assessment

The framing that holds up: **native image is a cold-start and memory optimisation. It is not
a throughput optimisation, and it is not free.** Two things follow, and both are
organisational rather than technical.

**First, who is the workload for?** The fit is strong when the workload is
spiky, bursty, or scale-to-zero: serverless functions, CLI tools, short-lived jobs, a
service that sits at 5% CPU for hours and then needs 50 replicas at once. In those cases
the JVM's per-instance footprint and idle memory are the binding constraint, and native
changes the unit economics. The fit is weak for a steady-state, high-utilisation, CPU-bound
service — there the JVM is already warm, already profile-optimised, and the memory
difference is amortised against a node that runs a handful of instances anyway.

**Second, and this is the one that gets skipped: the build-time cost is an operational
cost with a staffing dimension.**

```text
JVM:      ./mvnw package                  →  ~30s      → push an image
NATIVE:   ./mvnw -Pnative native:compile  →  2-10 min   → push an image
                       ▲
                       └── multiplied by: platforms (linux/amd64, linux/arm64)
                           × whether it runs on every commit or nightly
                           × cache hit rate of a 5-minute, memory-hungry build
```

That is not a build-time problem, it is a **CI capacity and feedback-loop** problem:

- A 10-minute build means a 10-minute feedback loop, which changes how the team works —
  fewer, larger pull requests, more batching, more work in progress. Long feedback loops
  have a measurable, well-documented effect on both velocity and defect rate.
- It is memory-hungry. Native compilation routinely needs 4–8GB of RAM per build. On a
  shared CI runner that is a scheduling and cost problem, and parallel builds on a small
  runner will thrash or OOM.
- The cache is fragile. A cache keyed on the full dependency graph misses whenever any
  dependency changes, so the most painful moments — a big upgrade, a release, a
  dependency bump — are exactly when everyone waits 10 minutes.
- Cross-compilation for two architectures doubles it, and `linux/arm64` is not optional for
  any team deploying to Graviton or a mixed-architecture node pool.

The honest cost-benefit for a typical CRUD service is: *the startup and memory wins are
real but modest because the service is probably already running on adequately-sized nodes
at steady concurrency; the build-time cost is paid on every developer machine and every CI
run, forever.* For a serverless or scale-from-zero workload the trade inverts decisively.
The staff-level move is to make that call **on the workload's shape, explicitly, in a
design review** — and to pilot with one service rather than committing the whole estate to
a pipeline rebuild.

> **PRODUCTION SCENARIO**
>
> Problem: the team adopted native image across twelve services to cut cold-start time in a
> scale-from-zero test. Startup dropped from 9s to 60ms as advertised, and median instance
> memory dropped from 340MB to 90MB. Then two things happened: CI build time went from 4
> minutes to 38 minutes, and a p99 regression appeared on the one endpoint that does
> CPU-heavy invoice PDF generation.
> Investigation: the CI time was dominated by native compilation running on every commit
> with a cache that missed whenever any module's dependencies changed. The p99 regression
> traced to a PDF-rendering path with a hot loop that the warmed-up JVM had been
> optimising and the native binary had not.
> Root cause: the adoption was framed as "make it faster" rather than "trade cold start
> for build time", so the throughput axis was never measured and the CI cost was assumed
> to be a one-off.
> Solution: kept native for nine I/O-bound services; reverted three compute-heavy ones to
> the JVM; moved native builds to nightly with a per-architecture cache and made the
> production image a promoted artefact from a separate pipeline.
> Prevention: an explicit admission test per service — measure p99 before and after, count
> build-minutes as a first-class cost, and require a documented reason beyond "it's newer".

> **MUST REMEMBER**
>
> AOT processing and native image are **two different things that share a mechanism**. AOT
> runs parts of the application at build time to remove *runtime reflection*, and it
> produces a normal JVM jar — it speeds up startup and reduces memory, and it is largely
> free because it happens inside a build you already run. Native image compiles the whole
> program to a standalone binary with GraalVM, which additionally removes the JVM itself
> and buys the dramatic startup and footprint numbers — and which costs minutes of build
> time and constrained reflection. "Boot does AOT" is true and it is not the same claim as
> "Boot is native".

> **SCALING REALITY CHECK**
>
> Density is the number that decides this for a large fleet. A JVM service with a 350MB
> RSS on a 16GB node fits ~30 instances before the node's memory and the JVM's per-instance
> overhead dominate; a native binary at 90MB fits far more. The savings are not linear
> (the node has fixed costs, GC and CPU contention rise as instance count climbs), but the
> direction is real and it is the argument a platform team will make. The counter-argument
> a staff engineer should have ready: if the service is one of several per node rather than
> dozens, the memory difference is immaterial and the build-time cost is not.

#### Common Mistakes

- Describing AOT and native image as the same thing. AOT is build-time reflection
  elimination producing a JVM jar; native image is a whole-program compilation to a
  standalone binary. The first is nearly free; the second costs minutes per build.
- Claiming native image makes an application "faster". It makes startup faster and memory
  smaller; peak throughput on genuinely CPU-bound hot code is *worse*, because there is no
  JIT and no profile-guided optimisation to exploit the fact that those methods are hot.
- Adopting native image to "fix slow startup" for a service that is already a long-running
  steady-state process. The startup improvement is real and the service benefits from it
  essentially zero times.
- Ignoring the CI cost. A 2–10 minute, memory-hungry, cache-fragile build on every commit
  is a change to the team's feedback loop and to runner cost, and it needs to be costed
  before adoption, not after.
- Expecting the observability story to transfer. No `jstack`, no JVM heap dump, no
  `-XX:+HeapDumpOnOutOfMemoryError`; the native agent ecosystem is good but it is a
  different toolchain, and a team whose runbooks depend on thread dumps will notice.
- Assuming hints are optional. A library using reflection without a `RuntimeHintsRegistrar`
  makes native builds fail for its *consumers*, and the failure surfaces in someone else's
  pipeline.

#### Interview Questions — AOT & Native Image

**Q1. What problem does AOT processing solve, and what does it actually produce?** `ADVANCED`

Spring performs two classes of work that require inspecting code rather than executing it:
reflection (annotation reading, name-based instantiation, generic resolution) and runtime
proxy generation (CGLIB subclasses and JDK proxies). Both are unbounded at runtime because
Spring cannot know in advance which of your classes it will reflect over. AOT processing
runs the context at build time in a mode where these operations are *recorded*, and emits
generated sources plus a resource index. The output is an ordinary JVM jar — which is why
AOT and native image, despite sharing a mechanism, are different claims.

**Q2. What is `RuntimeHints` and when does a library author have to write one?** `TRICKY`

`RuntimeHints` is the API for declaring what reflective accesses, resources and proxies
AOT-generated code requires, and a `RuntimeHintsRegistrar` is the implementation, usually
registered with `@ImportRuntimeHints` or discovered via a `META-INF/spring/aot.factories`
entry. You need one when AOT cannot *infer* the need: reflection on a type not reachable
from a constructor, a `@Bean` method or a scanned component; a resource loaded by a
computed name; or a JDK proxy for an interface combination never seen statically. It's
unavoidable work, and the failure it prevents surfaces in a *consumer's* native build
rather than in the library's own.

**Q3. What does GraalVM native image give you, and what does it cost?** `STAFF`

Gives: millisecond startup (nothing to parse, verify or JIT at startup), a small memory
footprint (no JVM metaspace, code cache or JIT structures — tens of MB for a trivial
service versus 60–100MB+ for a bare JVM), no warm-up phase, and a single self-contained
binary. Costs: multi-minute builds that grow with the dependency graph, constrained
reflection requiring hints, a 50–90MB binary, weaker debugging tooling (no `jstack`, no
heap dump), and — the one people miss — **lower peak throughput on genuinely CPU-bound hot
code**, because the AOT compiler cannot use profile-guided optimisation and there is no
recompilation.

**Q4. Is native image a throughput optimisation? Argue it.** `D`

No, and the argument is mechanical. The JVM's throughput advantage comes from
*observing* which methods are hot and recompiling them with that knowledge, and from
deoptimising and re-JITting as the profile changes. A build-time compiler has no such
opportunity — GraalVM optimises the whole program for startup and image size, which is the
right objective for a binary that must start fast and is fixed thereafter. So the honest
decomposition is three axes: startup better, memory better, peak throughput on hot CPU
paths worse. For I/O-bound Spring services, which is nearly all of them, the throughput
axis is noise and the wins are real. For a compute-heavy service, the warmed-up JVM wins,
and the trade is a real decision rather than a free upgrade.

**Q5. A team wants to adopt native image across their estate. What do you ask before
agreeing?** `D`

What is the workload shape — spiky and scale-from-zero, or steady-state? That single
question determines whether cold start and memory are the binding constraints or
irrelevant. Then: what is the current per-instance memory and utilisation, and how many
instances per node? If it's a handful, the memory win is immaterial. Then the cost side:
how many minutes does a native build add, what does it do to the PR feedback loop, how
much RAM does it need, and will it run on every commit or nightly? And finally: is the
p99 measured on a compute-heavy path, where a native build could regress it? The staff
answer is a pilot on one representative service with a measured p99 comparison and a
counted build-minutes cost, not an estate-wide mandate.

**Q6. Why is a native binary sometimes slower than a warmed-up JVM on the same
workload?** `ADVANCED`

Because the JVM's advantage is adaptive and the native binary's is static. The JVM
profiles running code, recompiles hot methods with that information, deoptimises when a
profile turns out wrong, and re-optimises — all of which happens without the developer's
involvement. GraalVM compiles the whole reachable program up front with no runtime profile
and no re-JIT, optimising for startup latency and image size. On a workload dominated by
database and network I/O, that difference is invisible. On a workload with a genuinely
CPU-bound hot loop, the JVM's runtime optimisation can win measurably.

**Q7. What breaks in a native build that works fine on the JVM, and how do you find out?**
`TRICKY`

Anything that reflects on types AOT cannot infer are reachable from — a Jackson
deserialiser for a class only ever built reflectively, a Hibernate custom type, a
`Class.forName` on a tenant-specific name, a resource loaded by a computed path. At
runtime these are not degraded, they are *absent*, so the failure is a hard error at
first use, not a warning at build. Find it by running the build: GraalVM's build-time
analysis reports unreachable elements, and Boot's AOT test task runs a context-load smoke
test that catches most classpath-level problems before the image is ever produced.

**Q8. Your library doesn't compile to native because of reflection. Is that your team's
problem or the library's?** `D`

The library's, structurally — and the reason is that the failure appears in the
*consumer's* CI, not in the library's, which is the worst possible signal about where the
work belongs. The practical obligations on a library author shipping to a native-capable
ecosystem are: register a `RuntimeHintsRegistrar` for the accesses you know about, keep
the set of dynamic types small enough to hint explicitly, and add a native build to your
own CI so the obligation is discharged before a consumer finds it. The community
reachability-metadata repository covers popular third-party libraries, which is exactly
why your own reflection is the residue that matters.

> **CHAPTER 6 SUMMARY**
>
> AOT processing runs the application context at build time in a mode where reflection and
> proxying are *recorded* rather than performed, emitting generated sources and a resource
> index; the output is a normal JVM jar, which is why AOT and native image are routinely
> conflated and why they are different claims with different costs. `RuntimeHints` is how a
> library author declares the reflective accesses, resources and proxies AOT cannot infer,
> and it is unavoidable work whose absence fails in a consumer's build. GraalVM native
> image compiles the whole program to a standalone binary: millisecond startup, tens of
> megabytes of RSS, no warm-up — against multi-minute builds, constrained reflection, a
> 50–90MB binary, weaker debugging tooling, and lower peak throughput on genuinely CPU-bound
> code because there is no JIT and no profile-guided optimisation. The staff-level
> conclusion is the one to memorise: **native image is a cold-start and memory
> optimisation, not a throughput one**, and its real price is paid in CI — build minutes,
> runner memory, and a longer feedback loop on every commit — which is an organisational
> cost to be counted before adoption, not discovered after it.

#### Further Reading

- [Spring Boot Reference — Ahead-of-Time Processing With the JVM](https://docs.spring.io/spring-boot/reference/packaging/aot.html) — what AOT does, the generated artefacts, and how the build plugins wire it in.
- [Spring Boot Reference — GraalVM Native Images](https://docs.spring.io/spring-boot/reference/packaging/native-image/index.html) — the supported feature set, the current compatibility status, and what the native build actually does to your dependency graph.
- [Spring Boot How-to — GraalVM Native Applications](https://docs.spring.io/spring-boot/how-to/native-image/index.html) — the practical build and test loop, including the AOT test task that catches most problems before an image is produced.
- [Spring Boot How-to — Ahead-of-Time Processing](https://docs.spring.io/spring-boot/how-to/aot.html) — the `RuntimeHintsRegistrar` APIs and how to write and verify your own hints.

## Chapter 7 — Actuator, Metrics & Observability

Everything in this chapter is a **security surface that happens to be observability**, and
the chapter's spine is that separation. Actuator is not a debugging tool. It is a management
API on the same process, and in the same JVM, as the code it reports on.

### 7.1 The Endpoints and What They Actually Reveal

| Endpoint | Exposes | Why it is sensitive |
| --- | --- | --- |
| `/actuator/health` | Aggregate status, and with `show-details` each contributor's detail | With `show-details=always` it names every downstream dependency, its address and its failure message |
| `/actuator/info` | Build metadata; `build-info` from Chapter 5 | The Git SHA. Not a secret, but it identifies an exact vulnerable build |
| `/actuator/metrics` | Every metric name, with tags and quantiles | The full shape of your system, including business dimensions you'd not publish |
| `/actuator/env` | Every property and (if allowed) every value | Credentials, connection strings, internal hostnames. **A credential disclosure endpoint** |
| `/actuator/configprops` | Every `@ConfigurationProperties` bean and bound value | The same class of leak as `/env`, in a typed form — this is the one teams forget |
| `/actuator/beans` | Every bean name, type, dependencies | A complete map of the application's internals. Free reconnaissance |
| `/actuator/conditions` | Every auto-configuration, and which conditions matched and which didn't | Reveals which optional dependencies are present and which features are configured |
| `/actuator/loggers` | The logging hierarchy; **writable** — you can change a log level at runtime | `POST /actuator/loggers/{name}` with `{"configuredLevel":"DEBUG"}` turns on debug logging for any package, which on a data-handling path can log request payloads to disk |
| `/actuator/threaddump` | A full thread dump | Hostnames, request URLs, stack frames, thread names that often embed customer IDs |
| `/actuator/heapdump` | A full **GC-rooted heap dump** | Every secret ever loaded into memory, every `byte[]` in flight, every cached object. A complete data-exfiltration primitive |
| `/actuator/prometheus` | Metrics in Prometheus exposition format | Same as `/metrics`, machine-readable, and trivially scraped by an attacker |
| `/actuator/mappings` | Every registered request mapping | Your entire API surface, including internal endpoints and admin routes |
| `/actuator/shutdown` | Closes the context | **Disabled by default** — `management.endpoint.shutdown.enabled` is `false`, and enabling it gives anyone who reaches it a one-request shutdown. The correct default, and one worth being able to state in an interview |

**The default state, precisely** — this is the set of facts most often misstated:

```properties
management.endpoints.enabled-by-default=true               # every endpoint is ENABLED...
management.endpoints.web.exposure.include=health           # ...but only `health` is EXPOSED
management.endpoint.health.show-details=never               # only `{"status":"UP"}` to anonymous callers
management.endpoint.health.show-components=when-authorized  # contributors listed only when authorized
management.endpoint.configprops.show-values=never           # values replaced by ******
management.endpoint.env.show-values=never                   # same
management.endpoint.shutdown.enabled=false                  # shutdown is DISABLED
```

The distinction to hold onto: **enabled ≠ exposed.** Every one of those endpoints is
*enabled* by default, and only `health` is *exposed* over HTTP. That is why
`/actuator/conditions` 404s on a stock application even though the endpoint exists and
works — the exposure allow-list is doing its job, and "the endpoint is missing" is almost
never a Boot bug.

> **INTERVIEW TRAP — THE ACTUATOR DEFAULTS**
>
> Three claims that cost marks, in order of how often they appear. **(1) "Actuator exposes
> health and info by default"** — the default `management.endpoints.web.exposure.include` is
> `health` alone. `info` is *enabled* and must be added. **(2) "`/actuator/heapdump` is on
> in a default application"** — it is enabled but not exposed, and `/actuator/shutdown` is
> the one that is not even enabled. **(3) "Actuator is safe because it only exposes
> health"** — true of the default, and irrelevant once someone sets `include=*` in a
> profile that reaches production. The two independent defences are the exposure
> allow-list and the value sanitization; the failures are always one of the two being
> disabled.

### 7.2 Exposure Is a Security Decision

The `include=*` incident has a specific shape worth narrating, because it recurs:

```yaml
# application-dev.yml   — reasonable in isolation
management:
  endpoints:
    web:
      exposure:
        include: "*"
```

The dev profile is a wildcard, which is genuinely useful locally. Then one of three things
happens, in decreasing order of how often I have seen it:

1. `spring.profiles.default: prod` and a missing profile setting means a developer runs the
   app in prod mode. Wildcard exposed.
2. The Helm chart sets `SPRING_PROFILES_ACTIVE=dev` for a debug rollout and somebody later
   changes the image tag. Wildcard exposed.
3. Profile groups: `spring.profiles.group.prod=dev,prod` was added during a migration and
   nobody removed `dev`. Wildcard exposed in production.

None of these are "someone misconfigured production". They are all a wildcard that was
never the problem on the day it was written.

> **MUST REMEMBER**
>
> The staff-level answer to "how should actuator be exposed" is not a property value. It is:
> **actuator is a separately-authenticated, internal-network-only management surface**, and
> the property that expresses that is `management.server.port` (a different port from the
> application) combined with `management.server.address` (bound to an internal interface)
> combined with a real authentication mechanism. The wildcard is a symptom of not having
> decided the trust boundary. Every endpoint in the table above assumes the caller is
> trusted, and `/actuator/heapdump` in particular hands over everything the process has
> ever held.

> **PRODUCTION SCENARIO**
>
> Problem: a penetration test found `GET /actuator/heapdump` returning a 100MB binary from
> an internet-facing service. No credential had been used; it was simply reachable.
> Investigation: `management.endpoints.web.exposure.include=*` was set in a shared
> `application.yml` (not a profile file) added during a migration from Spring Boot 1.x,
> where a properties file was the normal place for such settings. `show-values` was
> `never`, so `/actuator/env` was sanitized — which is exactly why the team believed the
> surface was safe.
> Root cause: exposure was treated as a debugging convenience and never reviewed as an
> access-control decision. The sanitization defaults created false confidence about the
> endpoints *around* the dangerous one.
> Solution: narrowed the allow-list to `health,info,prometheus`; moved the rest to a
> management port bound to the internal interface with authentication; swept git history
> for the wildcard.
> Prevention: a CI test that fails the build if any non-local config contains
> `include: "*"`, and an IaC policy requiring `management.server.port` to be set wherever
> an actuator dependency is present.

### 7.3 Health: Indicators, Liveness, Readiness

A `HealthIndicator` is a bean whose `health()` returns a `Health` with a status and
contributors. The model is deliberately small: `UP`, `DOWN`, `OUT_OF_SERVICE`, `UNKNOWN`,
with a map of named components.

```java
@Component
class PaymentGatewayHealthIndicator implements HealthIndicator {

    private final PaymentClient client;

    @Override
    public Health health() {
        try {
            client.ping();                      // must be CHEAP and must have a timeout
            return Health.up().build();
        } catch (Exception e) {
            // OUT_OF_SERVICE, not DOWN — see below
            return Health.outOfService()
                    .withDetail("error", e.getClass().getSimpleName())
                    .withDetail("gateway", "acme-pay")
                    .build();
        }
    }
}
```

`OUT_OF_SERVICE` versus `DOWN` is the distinction that matters, and it is a readiness
concept: a dependency being degraded does not mean *this instance* is broken, it means this
instance should not receive *new* traffic. Marking it `DOWN` conflates "I have a problem"
with "stop sending me work", and that's precisely the error described below.

**The liveness/readiness split**, and what each one is for:

```yaml
management:
  endpoint:
    health:
      probes:
        enabled: true            # auto-enabled in Kubernetes; explicit is better
      group:
        liveness:
          include: livenessState,dbLivenessState,ping
        readiness:
          include: readinessState,dbReadinessState,customReadiness
```

| | Liveness | Readiness |
| --- | --- | --- |
| Path | `/actuator/health/liveness` | `/actuator/health/readiness` |
| Question | "Is this process irrecoverably broken?" | "Can this instance serve traffic right now?" |
| Failure action | **Kill and restart the container** | **Remove from the load balancer**, leave it running |
| Must NOT check | Anything that recovers on its own | Nothing — it's allowed to be sensitive |
| Failure cost | A restart, and it repeats if the cause persists | Reduced capacity in the pool |

```properties
# Kubernetes manifests — the two probes, with their real semantics
livenessProbe:
  httpGet: { path: /actuator/health/liveness, port: 8080 }
  initialDelaySeconds: 30
  periodSeconds: 10
  failureThreshold: 3          # 30s of failure before a restart
readinessProbe:
  httpGet: { path: /actuator/health/readiness, port: 8080 }
  initialDelaySeconds: 5
  periodSeconds: 5
  failureThreshold: 1          # out of rotation almost immediately
```

**The rules that follow, and the one that is a genuine production incident:**

- **Liveness must only check things that are *not* self-healing and are *not*
  downstream.** A liveness probe that checks the database will kill every pod when the
  database blips — turning a brief dependency problem into a full restart storm, with
  connection churn, and with the pods unable to start again because the database is still
  unavailable. Liveness checks "is the JVM alive and the internal state consistent";
  `ping` (a trivial liveness contributor) and the internal state are the right contents.
  Check your `/actuator/health/liveness` output for a database check and remove it.
- **A readiness check that fails on a degraded *optional* dependency takes the instance out
  of rotation for a problem it can still serve.** This is the single most common health-check
  design error. If the recommendation service is down and the service can serve 95% of its
  endpoints without it, failing readiness removes capacity precisely when you are short of
  it — the check should *degrade the response* (return a partial result, or a
  `degraded` field) and report `UP`, not remove the pod. A readiness check is a statement
  about whether *this instance* can serve, and an instance that can serve 95% of traffic can
  serve.
- **Every health check needs a timeout.** A `HealthIndicator` that blocks for 30 seconds
  against a hung downstream turns the health endpoint itself into an availability problem,
  because the probe times out and the orchestration platform does its default thing —
  which for liveness is a kill.
- **Custom indicators should be cheap and local by default.** A liveness or readiness
  contributor that makes a network call on every probe, every 5 seconds, across 40 pods, is
  8 network calls per second to a system that may itself be the problem.

### 7.4 Metrics and the Cardinality Trap

Micrometer is Boot's metrics facade, and it is on the classpath whenever
`spring-boot-starter-actuator` is, whether or not you write a line of instrumentation. Four
types cover essentially everything:

| Type | What it is | Use for | The mistake |
| --- | --- | --- | --- |
| `Counter` | Monotonically increasing | Requests, errors, messages consumed | Registering it with a changing tag — a counter that goes down is a bug in your code, and it breaks rate calculations |
| `Gauge` | A single instantaneous value sampled at scrape time | Queue depth, active connections, thread count | Holding a strong reference to a large object graph in the gauge's lambda — it is a genuine memory leak, because the registry holds it for the process lifetime |
| `Timer` | Duration distribution, plus a count | Latency, with `percentileHistogram` for percentiles | A separate tag per route *template* is fine; per *URL* is the cardinality trap below |
| `DistributionSummary` | Size distribution, no time semantics | Payload sizes, batch sizes | Using it where a `Timer` belongs and then having no duration data |

> **MUST REMEMBER**
>
> **A metric tagged with a user ID, an order ID, a session ID, a full URL path, an email
> address or a timestamp is a memory leak in the metrics backend.** This is not a Boot bug
> and Micrometer will not stop you — it is the most common observability production incident
> in the Java ecosystem, and it presents as the metrics *backend* falling over while the
> application is perfectly healthy. The mechanism: in Prometheus, a metric name plus a tag
> set is a **time series**, held in memory for the retention period, and the backend also
> does work proportional to the number of *combinations*. Ten million user IDs on one
> counter is ten million time series in RAM, plus ten million series files on disk, plus a
> label lookup that gets slower with every new one. The application-side symptom — if you
> use a Micrometer in-memory or Atlas-style backend with a TTL — is unbounded heap growth
> that looks exactly like an application leak and is not.

The rules that prevent it, and they are not negotiable:

| Instead of | Use | Why |
| --- | --- | --- |
| `user.id` = the user's ID | `user.type` = `free` / `paid`, or nothing | Unbounded, and cross-tenant cardinality |
| `url` = `/orders/918273` | `uri` = `/orders/{id}` (the **template**, not the path) | Unbounded; note the JVM observation and Micrometer both use the pattern by default for `http.server.requests` and the mistake is made by hand-added tags |
| `email` | nothing | Same failure, plus a compliance problem |
| `timestamp` as a tag | nothing; a `DistributionSummary` bucket | Time is the *axis* of a histogram, never a *tag* |
| `error.message` = the exception text | `error.type` = the exception class | Exception messages contain IDs, paths and query strings |
| `cache.key` | `cache.name` | Textbook unbounded cardinality; the example every cardinality talk uses |

The rule of thumb worth carrying: **every tag value must come from a set whose size is
bounded by something you control — the number of endpoints, the number of HTTP methods, the
number of regions, the number of plan tiers. Never from a set that grows with traffic.**

> **PRODUCTION RELEVANCE**
>
> Cardinality failures are unusual in that the trigger is a *good* day. A feature adds a
> `user.id` tag; nothing happens for weeks because the series count is small. Then a
> marketing push, a backfill job, or a traffic spike multiplies the distinct values, and
> the metrics backend runs out of memory. Meanwhile the application is fine, so the incident
> looks unrelated to the deploy that caused it. The diagnostic is the *ratio* — distinct
> series per metric name — and the prevention is a cardinality budget enforced in the
> registry: Micrometer supports a `MeterFilter` that refuses or truncates a tag whose value
> exceeds a length or cardinality threshold, and putting one in is cheap insurance.

### 7.5 `SpringApplication.run` Internals

The full sequence, with the events that let you observe each phase:

```text
SpringApplication.run(Application.class, args)
 │
 ├─ 1. inferFromClasspath() ............ deduce SERVLET vs REACTIVE vs NONE
 │                                      (Volume 5 Ch 4 — WebFlux wins only if MVC is absent)
 │      → ApplicationStartingEvent
 │      → deduceMainApplicationClass()   find the @SpringBootConfiguration class
 │      → ApplicationEnvironmentPreparedEvent
 │      → configureEnvironment()         build the Environment, load the config data
 │                                        (Chapter 4: locations, profiles, imports)
 │      → ApplicationContextInitializedEvent
 ├─ 2. createApplicationContext() ...... AnnotationConfigServletWebServerApplicationContext
 │                                        or AnnotationConfigReactiveWebServerApplicationContext
 ├─ 3. prepareContext() ................  applyInitializers(), load bean definitions,
 │                                        set environment, print the banner
 │      → ApplicationPreparedEvent
 ├─ 4. refreshContext() ................ the FULL refresh (Volume 1 Ch 3):
 │                                        Tomcat starts at onRefresh(),
 │                                        beans instantiate at finishBeanFactoryInitialization()
 │      → ApplicationStartedEvent  (context is refreshed, server is up)
 ├─ 5. callRunners() ................... ApplicationRunner then CommandLineRunner,
 │                                        both sorted together by @Order
 ├─ 6. listeners.running() ............. ApplicationReadyEvent
 │
 └─ on failure:  handleRunFailure() → ApplicationFailedEvent, then exit(ExitCode)
```

Three things in that sequence produce incidents:

**`callRunners` ordering.** Both `ApplicationRunner` and `CommandLineRunner` beans run at
step 5, *after* the context has refreshed and the web server is listening, but *before*
`ApplicationReadyEvent`. They are collected into one list and sorted together by
`@Order`/`Ordered`, so ordering between the two interface types is not fixed by type — it is
whatever the `AnnotationAwareOrderComparator` produces, and ties break by registration
order.

```java
@Component
@Order(1)                                   // runs FIRST
class SchemaValidationRunner implements ApplicationRunner {
    @Override public void run(ApplicationArguments args) { … }
}

@Component
@Order(2)                                   // runs SECOND
class WarmCacheRunner implements CommandLineRunner {
    @Override public void run(String... args) { … }
}
```

The trap: **the web server is already accepting traffic at step 5.** A runner that takes 40
seconds to warm a cache does not delay the readiness probe — unless you wire it to, which
you should, by failing readiness until the warm-up completes. A runner that throws aborts
startup *after* the port was opened, so you get a brief window where the instance is
reachable and then dies.

**The events.** `ApplicationStartingEvent` is too early for most uses (the Environment is
not ready). `ApplicationEnvironmentPreparedEvent` is where you can change profiles or add
property sources. `ApplicationContextInitializedEvent` fires after the context object
exists but before refresh. `ApplicationPreparedEvent` is after definitions are loaded but
before refresh. `ApplicationStartedEvent` is after refresh — the server is up. And
`ApplicationReadyEvent` is after the runners, which is the correct place for anything that
announces the instance to the rest of the system.

**Exit codes.** `SpringApplication` maps an exception to an exit code via an
`ExitCodeGenerator` (a bean implementing it) or an `ExitCodeExceptionMapper`; failing to
start yields a non-zero code, and the JVM terminates. A `main` that catches its own
exception and returns normally exits **0** — which every orchestrator reads as success. The
container terminates cleanly, the platform logs a normal shutdown, and the service is
missing from the pool with nothing in the logs indicating a crash. If your startup can fail,
let it: don't catch it.

### 7.6 Graceful Shutdown

```properties
server.shutdown=graceful
spring.lifecycle.timeout-per-shutdown-phase=30s
```

With `graceful`, in-flight requests are allowed to complete before the web server stops
accepting, bounded by `timeout-per-shutdown-phase` (default 30 seconds). On Kubernetes this
pairs with the termination lifecycle, and **the ordering is the whole point**:

```text
  t=0s    SIGTERM arrives. The pod is marked Terminating.
          Kubernetes begins two CLOCKS, in parallel:
            • preStop hook / terminationGracePeriodSeconds begins
            • the endpoint controller begins removing the pod from Services
  t=0s+ε  The two are NOT synchronised. Endpoint removal takes time —
          control-plane propagation, kube-proxy, and each node's
          iptables/IPVS update. Typically hundreds of ms to a few seconds.
  ─────────────────────────────────────────────────────────────────────
  THE BUG:  server.shutdown=graceful starts refusing NEW connections
            IMMEDIATELY on SIGTERM — i.e. BEFORE the pod has left the
            load balancer. Every request routed during that window is
            a connection refused. Readiness flips AFTER.
  ─────────────────────────────────────────────────────────────────────
  THE FIX:  Make readiness fail FIRST, then wait, then shut down.
```

The mechanism in Spring's terms: implement `ApplicationListener<ContextClosedEvent>` to
publish `ReadinessState.REFUSING_TRAFFIC` (which is what
`management.endpoint.health.probes.enabled` wires into the readiness probe), then sleep for
the propagation window, and only then let the graceful shutdown proceed. Or, equivalently,
put the delay in a `preStop` hook so it happens before the JVM is signalled at all — which
is often the cleaner place, because it does not require the application to know about the
propagation delay.

> **SCALING REALITY CHECK**
>
> The number that matters is the propagation delay, and it is not zero and not small: on a
> cluster with several hundred nodes, endpoint removal propagates to every node's proxy in
> roughly 1–5 seconds. A 2-second preStop sleep is the common practitioner answer and it is
> a guess, not a measurement. The right value is measured — add a long-running endpoint,
> deploy, SIGTERM a pod, and time how long requests still arrive after the process sees
> SIGTERM. Teams that skip this and see "occasional connection refused during deploys"
> attribute it to the load balancer, and are usually right about the cause and wrong about
> the fix.

> **STAFF-LEVEL CONSIDERATION**
>
> The deeper point about graceful shutdown is that **it is a contract between the
> application and the platform, and most of it is not in the application.** "Stop cleanly"
> is really: stop accepting, finish what you have, flush what you own, and exit with a code
> that tells the truth. The application controls only the middle of that; the preStop delay
> is platform configuration, `terminationGracePeriodSeconds` is platform configuration, and
> a deploy that ignores both produces connection-refused errors that look like application
> bugs. At staff level the contribution is noticing that the deploy pipeline — not the
> service — owns half the contract, and going and fixing it there.

#### Common Mistakes

- Setting `management.endpoints.web.exposure.include=*` in a shared config file, and
  treating the sanitization defaults as making it safe. `/actuator/heapdump` hands over
  everything the process has held, sanitized or not.
- Expecting `/actuator/conditions` to work out of the box. It is enabled by default but
  only `health` is exposed, so it 404s until you add it to the allow-list.
- Putting a database check in the **liveness** probe. A database blip then kills and
  restarts every pod, converting a brief dependency problem into a restart storm whose pods
  may not come back.
- Failing **readiness** on a degraded optional dependency, removing capacity from the pool
  for a problem the instance can still serve. Degrade the response and report `UP`.
- Writing a `HealthIndicator` with no timeout, so a hung downstream makes the health
  endpoint itself the availability problem.
- Tagging a metric with a user ID, a full URL, an error message or a timestamp. That is a
  memory leak in the metrics backend, it presents as the *backend* failing while the
  application is healthy, and it gets worse on exactly the days the system is busiest.
- Catching a startup exception in `main` and returning normally, so the process exits 0 and
  the platform records a clean exit for a failed deploy.
- Setting `server.shutdown=graceful` and assuming that makes rolling deploys clean. It
  stops accepting immediately on SIGTERM, which is *before* the pod has left the load
  balancer, so you get connection-refused errors for the propagation window. Readiness must
  flip first, or a `preStop` delay must precede the signal.

#### Interview Questions — Actuator, Metrics & Observability

**Q1. What are actuator's exposure defaults, and which three facts about them are most
often misstated?** `TRICKY`

`management.endpoints.web.exposure.include` defaults to `health` alone — not `health,info`
and not `*`. `management.endpoints.enabled-by-default` is `true`, so every endpoint is
*enabled* while only one is *exposed*; "enabled" and "exposed" are different mechanisms and
confusing them explains why people expect `/actuator/conditions` to work on a stock app.
And `management.endpoint.shutdown.enabled` is `false`, so `/actuator/shutdown` is the one
endpoint that is not even enabled, which is the correct default and a good thing to be able
to defend.

**Q2. How should actuator be exposed, and why isn't a property value the answer?** `STAFF`

As a separately-authenticated, internal-network-only management surface. Concretely:
`management.server.port` on a different port from the application, `management.server.address`
bound to an internal interface, a real authentication mechanism in front of it, and a narrow
allow-list rather than a wildcard. The reason it isn't a property value is that every
endpoint assumes a trusted caller — `/actuator/heapdump` returns a complete memory dump,
`/actuator/loggers` is writable, `/actuator/threaddump` leaks request URLs and thread names.
The `include=*`-in-a-profile incident isn't a misconfiguration in the moment; it is the
symptom of never having decided the trust boundary, and profile inheritance is what later
turns the decision into a breach.

**Q3. What goes in a liveness probe, what goes in readiness, and what is the most common
error?** `ADVANCED`

Liveness answers "is this process irrecoverably broken" and its failure action is a restart,
so it must only check things that are *not* self-healing and *not* downstream — the internal
liveness state and a trivial `ping` contributor. Readiness answers "can this instance serve
traffic right now" and its failure action is removal from the load balancer, so it *should*
be sensitive to downstream dependencies. The most common error is a database check in
liveness: a database blip then restarts every pod in the cluster, and because the pods
cannot start without the database either, a 30-second blip becomes a full outage. The
second most common is failing readiness on a degraded *optional* dependency, which removes
capacity precisely when you are short of it.

**Q4. Why is a metric tagged with a user ID a production incident?** `STAFF`

Because a metric name plus a tag set is a distinct time series in the backend, held in
memory for the retention window and stored on disk, and all backend work scales with the
number of series. Ten million user IDs is ten million series. The application is fine, so
the incident appears to be in the monitoring system while the deploy that caused it — adding
the tag — is forgotten. It's usually triggered by a good day (a marketing push, a backfill),
which is why the correlation is so poor. The prevention is a cardinality budget: every tag
value must come from a set bounded by something you control, plus a `MeterFilter` that
refuses or truncates an over-long value.

**Q5. Explain `SpringApplication.run` and where your code can hook in.** `TRICKY`

It infers the application type from the classpath, builds the `Environment` and loads config
data, creates and prepares the context, calls `refresh()` — during which the web server
starts and all eager singletons instantiate — then invokes the runners, then publishes
`ApplicationReadyEvent`. The hook points are the `SpringApplicationEvent` sequence:
`ApplicationStartingEvent`, `ApplicationEnvironmentPreparedEvent` (the last point to change
profiles or add property sources), `ApplicationContextInitializedEvent`,
`ApplicationPreparedEvent` (definitions loaded, not yet refreshed), `ApplicationStartedEvent`
(context refreshed, server listening), `ApplicationReadyEvent`, and `ApplicationFailedEvent`.

**Q6. `ApplicationRunner` and `CommandLineRunner` — when do they run, and how do you order
them?** `TRICKY`

After `refresh()` and after the web server is listening, before `ApplicationReadyEvent`.
Both interface types are collected into one list and sorted together by
`@Order`/`Ordered` via `AnnotationAwareOrderComparator`, so ordering between an
`ApplicationRunner` and a `CommandLineRunner` is decided by the same annotation, with
registration order breaking ties. The trap is the position: the port is already open, so a
runner that takes 40 seconds does not delay the readiness probe unless you wire it to, and a
runner that throws aborts startup after the instance was already briefly reachable.

**Q7. Your app catches its own startup exception and logs it. What does the platform see?**
`TRICKY`

A normal exit with code 0. `SpringApplication`'s exit-code mapping only runs if the
exception propagates out of `run`; a `main` that catches and returns terminates the JVM
cleanly, and every orchestrator records a graceful shutdown. The service is simply absent
from the pool, the container log shows a normal termination, and the deploy looks successful.
Let the exception propagate — that is what `ExitCodeGenerator` and
`ExitCodeExceptionMapper` exist for.

**Q8. `server.shutdown=graceful` is set, but rolling deploys still produce connection-refused
errors. Why?** `ADVANCED`

Because graceful shutdown stops accepting new connections *immediately* on SIGTERM, and on
Kubernetes the SIGTERM and the removal of the pod from Service endpoints are concurrent — the
endpoint controller and the preStop/termination clocks start together, and endpoint
propagation takes roughly 1–5 seconds across a large cluster. So there is a window where the
load balancer still routes to a pod that is already refusing. Readiness must be flipped to
refusing *first*, then wait for propagation, then shut down — either by publishing
`ReadinessState.REFUSING_TRAFFIC` from an `ApplicationListener<ContextClosedEvent>` and
sleeping, or, more cleanly, by putting the delay in a `preStop` hook so it happens before
the JVM is signalled at all.

**Q9. `/actuator/loggers` is exposed to an internal team. What can they do that you might
not expect?** `TRICKY`

It is **writable**. `POST /actuator/loggers/{name}` with a `configuredLevel` turns a log
level on at runtime, for any package. `DEBUG` on a data-handling package can write request
payloads — including PII and credentials in headers — to disk, and on a high-traffic
endpoint that is a fast way to fill a volume and a compliance problem. It is a write
operation on a management endpoint, and it deserves the same "who is trusted" analysis as
`/heapdump`, not the "it's only logs" treatment.

**Q10. Micrometer is already on the classpath with `spring-boot-starter-actuator`. What
happens if you also register metrics by hand?** `TRICKY`

You end up with two parallel metrics systems — Micrometer and the manual registry — and the
manual one does not reach whatever exporter is configured, so the dashboards that matter
don't show it and the metrics nobody looks at cost you the same cardinality risk. It also
means the observation API's automatic instrumentation and your hand-written metrics use
different naming, so correlation across them is impossible. Register through Micrometer, and
use the auto-instrumentation (`http.server.requests`, `jvm.*`, `hikaricp.*`) rather than
rolling your own versions of things that already exist.

> **CHAPTER 7 SUMMARY**
>
> Actuator is a management API running in the same JVM as the code it reports on, and its
> defaults are a defence rather than an accident: `management.endpoints.enabled-by-default`
> is `true` but `management.endpoints.web.exposure.include` is `health` **alone**,
> `show-details` is `never`, `configprops.show-values` and `env.show-values` are `never`, and
> `shutdown` is the one endpoint not even enabled. Two independent mechanisms protect you
> and the failures are always one of them being switched off — the classic being
> `include=*` in a profile that later reaches production, at which point `/heapdump` is a
> memory dump, `/loggers` is a *writable* endpoint, and `/mappings` is your API surface.
> The staff answer is that these endpoints are a separately-authenticated, internal-network
> surface, and that the wildcard is a symptom of never having decided the trust boundary.
> Health splits into liveness (irrecoverable, non-downstream, or you get a restart storm) and
> readiness (can this instance serve — and failing it on a degraded *optional* dependency
> removes capacity precisely when you are short of it). Micrometer's cardinality rules are
> the most consequential operational rule in the chapter, because a tag with a user ID is a
> memory leak in the metrics backend that manifests as the *backend* failing on the busiest
> day. And the `SpringApplication.run` sequence explains the two most-missed behaviours
> entirely: runners execute *after* the port is open, and graceful shutdown stops accepting
> *before* the pod has left the load balancer, so readiness has to flip first.

#### Further Reading

- [Spring Boot Reference — Production-ready Features](https://docs.spring.io/spring-boot/reference/actuator/index.html) — the management overview, and the boundary between what is exposed, what is enabled, and what is secure.
- [Spring Boot Reference — Actuator Endpoints](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html) — every endpoint, the `show-values` sanitization settings, and the Kubernetes liveness/readiness probe configuration.
- [Micrometer Reference — Concepts](https://docs.micrometer.io/micrometer/reference/concepts.html) — the meter types, tags, and the registry model; the cardinality discussion is worth the time.
- [Spring Boot Reference — Metrics](https://docs.spring.io/spring-boot/reference/actuator/metrics.html) — the supported meter types, the auto-configured meters, and the `MeterFilter` hook for enforcing a cardinality budget.

---

### End of Volume 7

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Decompose `@SpringBootApplication` and say which constituent decides the scan root, and
  what the cost is when that root is broader than the service
- State the actuator exposure defaults precisely — enabled-by-default versus exposed-by-
  default, `health` alone, `show-details=never`, `shutdown` disabled — and say which three
  claims about them are most commonly wrong
- Explain why `@ConditionalOnMissingBean` only works when your configuration is processed
  *after* the bean it defers to, and how `before`/`after` in `@AutoConfiguration` express
  that
- Say exactly what changed between `spring.factories` and `AutoConfiguration.imports`, and in
  which Boot version each part of that change happened
- List Boot's default config search locations in order, and say why `file:./` beats
  `file:./config/` despite being less specific
- Distinguish the defaults that are wrong for a real workload — `open-in-view=true`,
  `ddl-auto` for embedded databases, Hikari's 10, Tomcat's 200 threads — from the defaults
  that are correct and that teams wrongly widen
- Explain why `java -jar` works where `java -cp` does not, what Boot 3.2 deprecated about
  nested-jar URL handlers, and what layered jars buy in a cold-pull scenario
- Argue that native image is a cold-start and memory optimisation and not a throughput one,
  and name the CI cost that pays for it
- Explain the liveness/readiness split, name the check that belongs in neither, and explain
  why a metric tagged with a user ID is a memory leak in the metrics backend
- Describe the `SpringApplication.run` sequence and say where runners, readiness and
  graceful shutdown sit in it

### Coming in Volume 8 — Spring Security

Volume 7 ended at a management surface with a trust boundary. Volume 8 is the other one.
Security in Spring is a filter chain that runs before your code and after the context is
built, and almost everything worth knowing is about ordering and about what happens when
the chain is misordered: the `FilterChainProxy` and its position in the servlet container,
authentication strategies and what a principal actually is, method security and its
tension with the proxying from Volume 3, the `SecurityContext` and why it is thread-bound,
password encoders and why `{bcrypt}` is not optional, session versus stateless and the
cookie flags, CSRF, CORS, and the fact that a JWT in a localStorage is a different security
architecture rather than a different token. Then OAuth2 and OIDC as a protocol, not a
library — the authorization code flow with PKCE, why resource servers validate rather than
introspect, and what happens to your blast radius when a token's signing key is shared with
a dozen other services. The hardening chapter is the one to read twice, and the interview
bank is the one to argue from.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). The **D** questions are the ones that separate a
senior answer from a staff one: they push on workload fit, cost, reversibility and
ownership rather than API correctness.

### Spring Boot's Defaults

**D1. Which of Spring Boot's defaults are wrong for a service under real load, and which
are correct and routinely widened anyway?**

The genuinely wrong ones for a latency-bound service: `spring.jpa.open-in-view=true` (pins a
connection through serialisation, so the pool rather than the JVM is the ceiling),
`spring.jpa.hibernate.ddl-auto` if you're relying on it anywhere but an H2 test,
`spring.datasource.hikari.maximum-pool-size=10` (a latency arithmetic problem, not a
tuning preference), `server.tomcat.threads.max=200` (200 × ~1MB stack ≈ 200MB of heap
before any of your data), and `spring.jackson.default-property-inclusion=always` if your
API contract says otherwise. The ones that are *correct* and get widened anyway:
`management.endpoints.web.exposure.include` (health alone is right), and
`management.endpoint.health.show-details` (`never` is right for anonymous callers). The
distinction that matters in a review: a default being wrong for *your* workload is a
decision to make; a default being widened because it was convenient for debugging is a
decision nobody made.

**D2. Is convention over configuration a good default for a team, and when would you argue
against it?** `STAFF`

Yes as an organisational default: the alternative is version reconciliation repeated by
every project and every engineer, and that cost is paid continuously and amortised badly.
Argue against it when the workload is specific enough that Boot's assumptions don't hold — a
latency-bound service with a connection-bound database, a service whose JSON contract
depends on null serialisation, a high-concurrency service where 200 threads is the ceiling.
The tell is that the defaults are tuned for a demo, not for a production workload. The
correct staff position is not "defaults good" or "defaults bad" but "here are the six
defaults we are deliberately overriding, here is why, and here is the test that will tell us
when one of them needs revisiting".

**D3. A team has 60 `@Value` fields across 12 classes. What's the migration, and what's the
part that isn't mechanical?** `STAFF`

The mechanical part is grouping them into `@ConfigurationProperties` records by bounded
context — IDE-assisted, one compile per module. The part that isn't mechanical is the
validation conversation: the moment you put `@NotNull` on a timeout and `@Min(1)` on a
retry count, you discover which values are genuinely independent and which are coupled, and
a surprising number turn out to be the latter (retries that should be bounded by a pool
size, a timeout that must sit under a downstream budget). That conversation is the actual
deliverable. Start with the values that are most often wrong, because those are the ones
with incidents behind them.

**D4. You own 40 services. Should you publish a platform default configuration — a
committed `application.yml` every service inherits?**

Yes, and the value is that it makes the *opinion* a reviewed artefact rather than a
per-team invention. The trap is what a shared default cannot express: it cannot know that
one service is latency-bound and needs a 50-connection pool while its neighbour needs 8. So
the platform default should carry the *safe* decisions (actuator exposure, `open-in-view=false`,
`ddl-auto=validate`, graceful shutdown, GC and heap-dump flags) and leave the
*workload-specific* ones — pool sizes, thread counts, timeouts — as explicit per-service
configuration. The other cost to raise: a shared default is a change you now have to roll
out and support across 40 repos, and the migration story for a service that has legitimately
deviated is harder than the initial authoring.

### Auto-Configuration

**D5. You maintain a starter used by 40 services. When is a behaviour change acceptable, and
what does that imply about your versioning policy?**

A behaviour change is acceptable when it is observable and the alternative is worse — a
security fix, or a default that causes data loss. Everything else needs a major version. The
point to raise in the review is that a Boot minor upgrade that changes a default *is* a
breaking change for someone, so your compatibility surface is "every default I ship", and
your deprecation policy has to cover both your own code and the Boot BOM underneath you.
Practically that means: a stated compatibility matrix, a deprecation window measured in
releases rather than weeks, and an upgrade note that says what a consuming team has to do.
The staff contribution is recognising that you're publishing a policy, not a library.

**D6. Your auto-configuration registers a bean the application also defines. The app has
`@Primary` on its own, so it works. Is that acceptable?**

No, and the reason is that it moves a startup failure into a subtle runtime one. With
`@Primary` present the app starts, tests pass, and every injection point resolves correctly
— so the duplicate is invisible until something does `getBeansOfType()` or injects
`List<T>` and gets two entries. Add `@ConditionalOnMissingBean` in your starter, add a
`ApplicationContextRunner` test that asserts `doesNotHaveBean` when the user supplies their
own, and if your type is a general infrastructure type, contribute a builder instead of the
instance. The deeper lesson: an override that "works" is harder to find than one that fails
at startup.

**T7. A library puts `@ConditionalOnMissingBean` on its own `@Configuration` class. Does it
work?**

Usually, and that is the problem — it works until the classpath changes. Component-scanned
`@Configuration` classes are processed in an order nobody controls, so the condition is
answered against whatever bean definitions happen to be registered at that moment. It works
in the developer's module, fails in the module that also has the library the condition was
meant to defer to. `@ConditionalOnMissingBean` is reliable on auto-configuration classes
with a declared `before`/`after` relationship, and unreliable everywhere else.

**P8. A bean stopped being created after a teammate added a dependency. Nothing in your
service changed. What happened, and what's the first diagnostic?**

An auto-configuration on the new dependency's classpath now matches a condition it didn't
before — most often `@ConditionalOnClass` on a class the new library provides, or a
`@ConditionalOnProperty` default that flipped. It registered a bean of a type you also
define, and depending on `@Primary` that either silently changed your binding or produced a
`NoUniqueBeanDefinitionException`. First diagnostic is always `/actuator/conditions` (after
adding it to the exposure allow-list) or `--debug`: it names the auto-configuration and
which condition newly matched. Long-term fix is a `withUserConfiguration` case in the
library's own test suite, which is the only way to catch "we now collide with a classpath
we didn't have".

**S9. A PR adds a second `@Bean` method to an auto-configuration class that already has one.
What specifically should the reviewer check?**

Whether the new method calls the existing one directly. `@AutoConfiguration` implies
`@Configuration(proxyBeanMethods = false)`, so there is no CGLIB subclass and an
intra-configuration call constructs a second, unmanaged object rather than returning the
singleton. The symptom is subtle and load-bearing: two connection objects, a mapper that
doesn't share a transaction, an identity mismatch. The correct form is to take the dependency
as a method parameter.

**D10. Should your library's auto-configuration ever define a bean of a type the application
might reasonably own? Ever?**

No, and this is broader than "add `@ConditionalOnMissingBean`". A bean of *your* type,
contributed with a back-off, is correct. A bean of a general-purpose infrastructure type —
an `ObjectMapper`, a pool, a template, a scheduler, a `Clock` — is not, because the
application has a legitimate claim to it. For those, contribute a **factory**: that's why
Boot ships `Jackson2ObjectMapperBuilder` and `DataSourceBuilder` rather than those objects
unconditionally. The test of whether a bean is yours is whether you could name the
alternative a reasonable team would have written; if the answer is "a default
`ObjectMapper`", it's theirs.

### Starters & Dependencies

**D11. A starter brings a Jackson version that conflicts with one your application pins.
Whose problem is it, and what do you put in CI?**

It's a classpath ownership problem, and the CI answer is a `dependency:tree` **diff** — the
point is not to inspect the tree but to fail a build when it changes without a diff in your
repository. The specific danger is that the two build tools disagree: Maven resolves
conflicts nearest-wins, Gradle's platform constraints default to highest-wins, so the same
declarations can produce different classpaths in CI and production. Beyond CI, the real fix
is to stop pulling the starter: depend on the narrow API and use `@ConditionalOnClass` to
activate on the real implementation. The version matrix you end up maintaining is the actual
cost, and it grows with every transitive edge nobody chose.

**P12. A routine starter upgrade broke a specific content type on one endpoint. What class
of bug is this?**

A `NoSuchMethodError` — a library compiled against a newer Jackson than the one resolved.
The JVM's `java -cp app.jar` semantics mean the class present wins over the class expected,
and the failure only appears in the code path that calls the missing method, which is why it
survives CI when the affected content type isn't tested. The fix is to pin the version
deliberately and add a test for the path; the prevention is the classpath diff, because this
change had no diff in your repository and therefore no reviewer.

**S13. A reviewer sees `<scope>compile</scope>` on `spring-boot-starter-test`. What's the
review comment?**

Test libraries in the production artefact. It drags JUnit, Mockito and AssertJ into your
runtime image and into the Docker dependency layer, which hurts cold-pull time for a
dependency set nobody imports at runtime. It also widens the classpath in ways that make
classpath-conflict debugging harder. The fix is `scope=test` (or Gradle's `testImplementation`),
and if a team genuinely needs test classes in a shared module, that's a `test-fixtures` or
`test-jar` arrangement — not a scope change on a starter.

**D14. A module's classpath grew from 40 to 90 artifacts over a year with no dependency
added. Is that a problem, and who fixes it?**

Yes, in three ways: startup cost (type resolution and scanning scale with it), image size
and cold-pull time (which matters directly if the service scales from zero during an
incident), and blast radius (90 jars is 90 sets of code that can throw, each moving on a
starter upgrade). The cause is nearly always a starter pulled in for one class. The fix is
a deliberate reduction: depend on the narrow API, make the optional part conditional, and
accept a slightly more verbose POM in exchange for a classpath you can explain. This is a
good candidate for a quarterly task rather than an incident response.

### Configuration & Secrets

**D15. Where should a database password come from, and what's the specific failure of a
committed default?** `STAFF`

From a secret store, injected as an environment variable or a mounted file, bound to a
`@ConfigurationProperties` field with **no default value**, so a missing secret fails at
startup and is caught in CI. The specific failure of `${DB_PASSWORD:devpassword}` is
silence: everywhere the environment variable is missing, the default becomes the production
credential, and nothing logs, nothing fails, and production works — with a password that is
in git history forever, where rotation will not remove it and `git rm` will not either. The
harder second question is rotation, and the honest answer is that properties-bound values
bind once at startup, so rotation *is* a restart unless the credential is read through
something that re-reads.

**T16. A file in the working directory and a file in `./config/` both define
`server.port`. Which wins?**

`file:./` wins. The config-data precedence follows the order of the search list, not
specificity: `classpath:/`, `classpath:/config/`, `file:./`, `file:./config/`,
`file:./config/*/`. The intuition that "more specific wins" is true within a location for
profile-specific versus profile-less files, and false across locations. This is the single
most confusing configuration incident because the debugging instinct is to look at
`./config/`, which is the file being ignored.

**P17. An application starts in staging and reads values from a config server it was
supposed to bypass. What probably happened?**

One of three: `SPRING_APPLICATION_JSON` was set by the platform and it sits above imported
documents; the active profile is not what the deployment intended, so a profile-specific
file inside the jar is winning; or `optional:` on the import made a failed config-server
fetch fall through silently to packaged defaults. The diagnostic is the startup banner and
`/actuator/env`, which shows the *origin* of each property — and the property origin, not the
value, is what tells you which file won.

**S18. A PR sets `management.endpoint.configprops.show-values=always` "temporarily, for
debugging". What is the review comment?**

That it is a credential-disclosure setting on an endpoint that prints every bound property,
and the sanitization it disables is a **name-based** filter — so any secret stored under a
property name that doesn't match `password`/`secret`/`key`/`token`/`credentials` was already
being printed in full anyway, and now the ones that were masked are too. If the value is
`when-authorized` with authentication in front, debugging is still possible. The second half
of the comment: "temporarily" needs an expiry, in the same PR, because that is how the
`include=*` incident happens.

**D19. Is a hard dependency on a config server at startup — no `optional:` — a good
design?**

Rarely, and the cost is availability-shaped rather than technical. A hard import means the
application cannot start when the config server is unavailable, which converts one service's
dependency into a fleet-wide deploy-time failure: a config server restart during a release
window takes down every service restarting at that moment. `optional:` plus a cached
last-known-good is almost always the better trade — but it has its own failure, which is
silent degradation to packaged defaults, and a packaged default for a database URL is a
connection to the wrong database. The staff answer is that the *choice* is what matters
and it must be explicit: hard-fail in the environments where a stale config is worse than a
down service, `optional:` with alerting everywhere else, and the alerting is the part teams
forget.

### The Executable JAR & Deployment

**D20. Your service deploys 50 times a day across 40 instances. Would you use an executable
jar, a native image, or an app server?** `STAFF`

The question that decides it is "how do we ship a change to 40 instances in the next ten
minutes". An app server or shared runtime wins on update speed: swap a jar, restart a pool,
one artefact per team. A JVM container image wins on reproducibility, dependency isolation
and per-service configuration, at the cost of a pipeline rebuild and a full image
distribution. A native image wins on cold start and footprint and loses on build time. The
staff-level contribution is naming that the packaging decision *is* the deployment-model
decision — immutable images pull along image promotion, layer caching, config as a separate
artefact and sidecar injection, and the team has to be willing to adopt all of it. Choosing
"fat jar in a container" without agreeing that is a common source of mid-project surprise.

**P21. A build pipeline re-zips the Boot jar with an archive tool "to add a manifest
attribute". What breaks?**

The nested-jar reader. Boot's loader expects `BOOT-INF/lib/*.jar` entries to be **stored**
(compressed) for random access, and recompressing them makes class loading degrade or fail —
and fail *intermittently*, which is far worse than a clean break because it presents as
flakiness under load. The correct fix is to configure the build tool to produce the fat jar
directly rather than post-processing it, and the review rule is that nothing in the pipeline
should rebuild the archive by hand.

**D22. Layered extraction is enabled, but the dependency layer misses the cache on every
deploy. Why?**

The dependency directory is not byte-stable. Something in the build regenerates it with
different ordering, different timestamps, or a different tar layout, so the layer hash
changes even though the jars are identical. That's exactly what `classpath.idx` exists to
prevent: it pins the classpath order so the layer is reproducible. The check is empirical
rather than theoretical — deploy twice with no dependency change and confirm the second build
is a cache hit — and a team should do it once during adoption, because the symptom (slow
builds) looks like a CI problem and the cause is the packaging.

**D23. Which JVM flags do you put on a container, and which pairing do you insist on?**

`-XX:MaxRAMPercentage` rather than a hard-coded `-Xmx`, so the heap derives from the cgroup
limit; `-XX:+ExitOnOutOfMemoryError`, so an OOM exits non-zero instead of leaving a
`Running` pod serving 500s from an undefined JVM; `-XX:+HeapDumpOnOutOfMemoryError` with a
**persistent** `HeapDumpPath`, because a dump to the container's ephemeral layer is deleted
by the restart it was meant to explain; and `-Xlog:gc*` with file rotation, because GC pause
data is the only legitimate input to a heap-sizing decision. The pairing I insist on is the
first two: correctly sized *and* failing loudly. Most base images ship only the first, which
is the worst combination — it makes an OOM invisible rather than impossible.

**D24. Do you need `build-info` if your CI already tags images immutably?**

Immutable tags remove half the problem, but not all of it. `build-info` puts the Git SHA in
`/actuator/info`, which answers "which commit is this pod" for a *running* instance without
a registry lookup or an exec into the container. The incident it prevents is the mutable-tag
one: three versions running during an incident, no way to say which pod has which without
shelling into each one. It's one build step and no runtime cost, which makes it close to
free. The related decision is whether the SHA alone is enough or you also need the
dependency set, and the honest answer for a "which build is this" question is usually that
you also need the resolved versions, which is a harder problem.

### AOT & Native Image

**D25. Is native image worth it for your services?**

Ask what the workload shape is before anything else. If the service is spiky, bursty, or
scales to zero — serverless, CLI, short jobs — the JVM's per-instance memory and cold start
are the binding constraints and native changes the unit economics, so yes. If the service is
steady-state with a handful of instances per node, the memory difference is immaterial
because the node's fixed costs dominate, and you are paying minutes of build time on every
commit for a startup improvement you experience zero times. Add the throughput caveat: on a
genuinely CPU-bound hot path, native is *slower* than a warmed-up JVM, so a compute-heavy
service should measure p99 before and after, not assume.

**D26. Your team adopted native image and CI went from 4 minutes to 38. What went wrong, and
is native the wrong choice?**

Not necessarily — but the adoption was framed as "make it faster" rather than as a trade, so
neither the throughput axis nor the build cost was measured. The 38 minutes is the sum of a
5-minute build × every commit × two architectures, run on runners that were provisioned for
4-minute builds. The fix is structural: move native builds to nightly, cache per
architecture keyed on the dependency graph, and promote a produced artefact to production
rather than rebuilding. The throughput regression is the other half: the one
compute-heavy endpoint got slower, because there is no JIT to profile and recompile it.
The staff-level outcome is an admission test per service — measure p99 both ways, count
build-minutes as a first-class cost — rather than an estate-wide mandate.

**P27. A service works on the JVM and fails at native-image build time with an
unreachable-element error. Whose problem is this?**

Structurally the library's, even though it surfaces in your pipeline — and that asymmetry is
the argument. The library uses reflection on classes AOT cannot infer are reachable from a
constructor, a `@Bean` method or a scanned component, and it ships no
`RuntimeHintsRegistrar`. Your options are to register the hints in your own build, which you
should not want to maintain, or to file it upstream. The community reachability-metadata
repository covers popular third-party libraries, which is exactly why the residue that
matters is your own dynamic code.

**S28. A PR adds `RuntimeHints` for a class used in exactly one code path. What should the
reviewer ask?**

Whether it can be registered more narrowly, and whether the class is reachable in a way that
AOT genuinely couldn't infer. Over-broad hints are a real cost: a class registered for
`INVOKE_DECLARED_METHODS` and `DECLARED_FIELDS` keeps its reflective surface alive in the
binary, which works against the size and startup goals that justified the native build in the
first place. The bar is "AOT could not see this" — a type that is only ever built through a
constructor AOT can see needs no hint, and adding one hides future breakage rather than
fixing it.

### Actuator, Health & Metrics

**D29. Who owns the actuator surface, and what should the platform team enforce?**

A platform team should own the *transport* and each service team should own the *content*.
Concretely: `management.server.port` on a separate port, bound to an internal interface, with
authentication in front, and a narrow allow-list — all enforceable in a base image or a Helm
chart, so no individual service can get it wrong. What a platform team must not do is expose
`/actuator/*` at the ingress and let the application's own security config decide, because
that means every service re-solves the same decision and one of them resolves it wrong. The
content side — which indicators exist, what `show-details` reveals, which health groups are
on — is genuinely application knowledge and stays with the service.

**D30. Is `include=*` ever acceptable?**

For a developer's laptop, on a loopback interface, with a profile that cannot be activated in
any deployed environment. Everywhere else, no — and the reason is not that the endpoints are
dangerous individually but that the surface changes shape without anyone deciding it. A
management endpoint list is a security control that looks like a configuration convenience,
which is why it survives code review. If the need is real debugging, the answer is a
`management.server.address` bound to loopback plus a VPN or an SSH tunnel, not a wider
allow-list.

**D31. Should a readiness probe fail when an optional downstream dependency is degraded?**

No, and this is the most consequential health-check design error there is. A readiness
failure removes the instance from the load balancer; if the dependency is *optional* — a
recommendation service, a review tool, a notification path — then the instance can still
serve the overwhelming majority of its traffic, and you are removing capacity precisely when
you are short of it. The correct behaviour is to degrade the response (return a partial
result, or a `degraded` marker) and report `UP`, with the degradation visible in a metric
rather than in the probe. Reserve readiness failure for dependencies without which the
instance genuinely cannot serve, and put everything else in readiness *as a soft signal* or
in a separate, non-probe-evaluated indicator.

**D32. Should a liveness probe check the database?**

No, and the failure is severe enough to be worth arguing loudly about. Liveness failure
triggers a container restart. If the liveness check depends on the database, a 30-second
database blip restarts every pod in the cluster — and because the restarted pods also need
the database, the restarts will not succeed either, so a dependency blip becomes a full
outage with connection churn on top. Liveness should contain the internal liveness state and
a trivial `ping`, and nothing that is downstream of the process or that can recover on its
own. Readiness is where the database check belongs, because the failure action there is
removal from rotation, not termination.

**D33. A team tags every metric with the request's user ID so they can slice by user. Argue
against it.**

A user ID is an unbounded set, and in Prometheus a metric name plus a tag set is a distinct
time series held in memory for the retention window. Ten million users is ten million series,
and the backend's cost — memory, disk, and lookup latency — scales with the series count
rather than the request count. The incident is nastier than a slow dashboard because the
trigger is usually a *good* day: a marketing push or a backfill multiplies the distinct
values, and because the application is healthy the incident gets attributed to the
monitoring system and the deploy that caused it is forgotten. The legitimate question behind
the request — "can I see per-user behaviour?" — is a logging and tracing question, not a
metrics one, and those systems are designed for high-cardinality dimensions.

**D34. A service's Prometheus endpoint is publicly reachable. What is the worst thing in the
list, and why?**

`/actuator/heapdump` if it's exposed, because a heap dump is everything the process has ever
held: every secret it loaded, every cached object, every `byte[]` in flight. It is a
complete data-exfiltration primitive that requires no credential, and it is the endpoint most
often added to an allow-list during a debugging session. Second worst is the writable
`/actuator/loggers`, which lets a caller turn on `DEBUG` for a data-handling package and
write request payloads to disk. The rest are reconnaissance — `/mappings` gives the API
surface, `/beans` gives the internals, `/env` gives configuration — which is useful to an
attacker and cheap to close off.

**P35. Rolling deploys produce intermittent connection-refused errors even though
`server.shutdown=graceful` is set. Why, and what's the fix?**

Because graceful shutdown stops accepting new connections immediately on SIGTERM, and on
Kubernetes SIGTERM and endpoint removal are concurrent — the propagation of "this pod is
gone" to every node's proxy takes roughly 1–5 seconds. So there's a window where the load
balancer still routes to a pod that has already stopped accepting. The fix is ordering:
publish `ReadinessState.REFUSING_TRAFFIC` first, wait for the propagation window, then let
the graceful shutdown proceed — either from an
`ApplicationListener<ContextClosedEvent>` or, more cleanly, a `preStop` hook with a sleep, so
the delay happens before the JVM is signalled at all. The number should be measured, not
guessed: time how long requests still arrive after the process sees SIGTERM.

**P36. A service's startup takes 90 seconds, of which 70 is in an `ApplicationRunner`
warming a cache. What's the problem and what do you change?**

Two problems. The readiness probe is not gated on it, so the instance starts taking traffic
before the cache is warm and serves a slow first request per endpoint. And if the warm-up
throws, the startup fails *after* the port is open, so the instance was briefly reachable
and then died. The fix is to make readiness depend on warm-up — an
`ApplicationAvailability` check that reports `ReadinessState.REFUSING_TRAFFIC` until a flag
is set — rather than to make the warm-up faster. If 70 seconds is genuinely required, the
question to bring to the review is whether it should be in a runner at all rather than a
background refresher that lets the instance serve immediately.

**D37. Is a slow startup a technical problem or an organisational one?**

Both, and the organisational half is the one that decides whether anyone fixes it. A slow
startup lengthens the feedback loop, which changes how the team works — larger pull requests,
more batching, more work in progress — and long feedback loops have a measurable effect on
both velocity and defect rate. It also lengthens every scale-from-zero event and every
rolling deploy, so a 90-second startup multiplied across a rolling replacement is real
downtime risk. The technical causes are knowable and usually boring: scan breadth, eager
I/O in `@PostConstruct`, classpath size. The staff move is to treat the startup number as a
team-health metric, not a code-cleanup task.

### Cross-Cutting & Ownership

**T38. A deployment fails and the platform reports a clean exit code 0. What did the service
do?**

It caught its own startup exception. `SpringApplication`'s exit-code mapping only runs if the
exception propagates out of `run`; a `main` that catches and returns lets the JVM terminate
normally, which every orchestrator reads as success. The pod terminates cleanly, the deploy
looks green, and the service is missing from the pool with nothing in the logs to say why.
The fix is to let the exception propagate, or to use `ExitCodeGenerator` /
`ExitCodeExceptionMapper` deliberately — never to swallow it.

**S39. A reviewer sees `spring.main.lazy-initialization=true` in a service that starts in
40 seconds. What is the review comment?**

That this trades a startup cost for a first-request cost and a failure-mode change, so it
needs a reason. It converts failures caught in CI into failures caught by users: a bean with
a bad dependency now fails when a user hits that path, not at boot. It also means every
endpoint pays a first-request penalty, which during a scale-up event means every new replica
serves its worst latency exactly when the system is under stress. The acceptable version of
this change is as a *diagnostic* — it tells you whether the cost is in eager
initialisation — followed by making the specific expensive bean lazy, so the trade is scoped
rather than global.

**D40. A team wants to standardise on a single Spring Boot version across 40 services.
What are the real trade-offs?**

The real gain is not the version itself, it's that a common version makes security patches,
dependency CVE triage and framework behaviour a single decision instead of 40. The costs
are on both axes: technical (a stuck service pins everyone, and a forced upgrade across 40
repos is a large, risky batch) and organisational (you've created a platform team that now
owns upgrades, or a bottleneck everyone resents). The staff-level framing is that this is
less a version policy than a decision about who owns the upgrade burden, and that the
question to ask is what happens to a service that genuinely cannot upgrade — the answer
determines whether the policy is real.

**D41. Your team ships a service with 90 exposed actuator endpoints on the same port as the
API, behind a gateway that doesn't route `/actuator`. Is that safe?**

Not as a control, because it's one routing rule away from being wrong, and the rule will
eventually be relaxed — a debug session, a new ingress path, a service mesh sidecar
bypassing the gateway. Defence in depth says the management surface gets its own port
(`management.server.port`) bound to an internal interface, so that even a total failure of
the gateway's routing leaves it unreachable from the internet. The pattern to push for is
making the safe thing the default that works even when someone forgets, rather than a
convention that depends on a config file being correct.

### Defaults, Ownership & Reversibility

**D42. A framework default silently changed between two minor versions and broke a service.
Whose bug is it?**

Boot's, and the argument is about what a default *is*. A default is a published behaviour of
a released artifact, so changing it is a breaking change by any reasonable definition, and
the fact that it sat in an auto-configuration rather than in your code doesn't change what
shipped. What a service team owes in return is a *decision*: either the default is correct
and you never touched it, in which case you own the upgrade's consequences as a consumer, or
you explicitly overrode it, in which case you already knew the value and were insulated. The
failure mode this rule prevents is the third state — a service that neither decided nor
overrode, and therefore discovered the change the first time a request path behaved
differently. The staff-level contribution is making "we reviewed the defaults we rely on" a
recurring, owned activity rather than a one-time reading of a documentation page.

**D43. A platform team standardises a `application.yml` every service inherits. How do you
stop it becoming a straitjacket?**

Keep the distinction between *safe* decisions and *workload-specific* ones, and let only the
first live in the shared file. Safe: `open-in-view=false`, `ddl-auto=validate`,
`server.shutdown=graceful`, the JVM container flags, actuator exposure. Workload-specific:
pool size, thread count, timeouts, cache sizes, feature-flag defaults — these must be
explicit per service, because one service's safe value is another's incident. The test of a
shared default is that a service deviating from it should be able to say *why* in one
sentence; if a deviation requires an exemption process, the default is too prescriptive and
will be overridden anyway, just without the conversation.

**D44. Is `open-in-view=false` a change that is always safe to make?** `ADVANCED`

No, and that's the honest answer. It is correct for any service that returns DTOs or
projections, and it is a *behaviour change* for a service that currently returns entities and
relies on the session being open through serialisation — set it to `false` on that service
and every lazy association Jackson resolved on demand now throws a
`LazyInitializationException`, and you find every one of them in production, not in a test
that used a different serialisation path. The staff move is to make it a deliberate change:
set it, run the full endpoint test suite against the real serialisation path, and expect to
find three or four places. The reasoning to give a manager is that leaving it on is not
neutral — it is a capacity ceiling you haven't measured.

**P45. After upgrading Boot, a service's `DataSource` stopped honouring a custom pool
setting. What happened and what do you check?**

Almost certainly that the property name moved or the binding changed shape — Boot has
renamed Hikari and Tomcat properties across majors, and the relaxed-binding rules are
strict about the prefix. The check is `/actuator/configprops` (after adding it to the
allow-list), which shows every `@ConfigurationProperties` bean with its bound value, or
`/actuator/env` for the raw property and its origin. The general lesson for a version
upgrade is to diff the *effective configuration*, not the source — a rename compiles
perfectly and fails silently at runtime, which is the most expensive class of upgrade
regression because nothing in the build catches it.

**D46. Two teams both added an `ObjectMapper` bean and the application starts. What is the
correct long-term fix?**

Neither `@Primary` nor removal-by-fiat. The right move is to decide who owns the type: either
one team owns it and the other injects it, or neither does and both build their own from a
shared factory. `@Primary` leaves two instances, one of which is configured differently and
used by whichever code happened to be written later — so the bug is a *consistency* bug, not
an ambiguity bug, and it will surface as two components disagreeing about date format or
unknown-property handling. The staff-level point is that "it works" is the least informative
outcome available here; a hard failure at startup would have been cheaper.

**D47. A team wants to make every Boot default explicit in their `application.yml` so
nothing is implicit. Is that a good idea?**

Half right, and the half that matters is the distinction between *load-bearing* and
*incidental*. Writing out a default to pin it is good practice for anything whose change
would alter behaviour — pool size, thread count, `open-in-view`, exposure — because pinning
it converts a future silent change into a visible diff. Writing out every default is bad
practice, because it buries the handful that matter in hundreds of lines that are never
reviewed as carefully, and it produces config that looks load-bearing everywhere and is
load-bearing nowhere. Pin the fifteen that matter, leave the rest, and write down which
fifteen so the next person knows the list exists.

**S48. A PR adds a `HealthIndicator` that makes an HTTP call to a third-party API, and it's
picked up by the readiness probe. What's the review comment?**

Three problems in one. The call has no stated timeout, so a hung third party makes the
health endpoint itself an availability problem — the probe times out and the platform does
its default thing, which for readiness is removal from rotation. It runs on every probe,
every few seconds, across every pod, so it multiplies into steady load on a system that may
be the problem. And it makes readiness depend on an optional dependency, so the service
leaves the pool for something it can still serve. The correct form is a cached health
signal updated by a scheduled task with a short timeout, a `TimeoutException` mapped to
`UNKNOWN` rather than `DOWN`, and a decision about whether it belongs in readiness at all.

**T49. What happens to a `@ConfigurationProperties`-bound secret when the underlying
property source is refreshed?**

Nothing. Binding happens once, during context refresh, and the already-constructed bean
keeps the value it was given. `@ConfigurationProperties` has no `@RefreshScope`; rebinding
requires either a scoped proxy that re-reads, or a different mechanism entirely. This is the
mechanism behind the claim that rotating a properties-bound credential is a restart — the
refresh endpoint changes the `Environment`, and nothing downstream of it cares. The
consequence for design is that anything requiring zero-downtime rotation must be read
through an abstraction that re-reads, not bound at construction.

**D50. Which of these decisions is the most expensive to reverse: a default, a starter, a
packaging format, or an actuator exposure?**

They are not comparable without saying *what reversing costs*, and the useful staff answer
separates them by the size of the blast radius. A default is a one-line config change —
cheap, and cheap *because* the convention is that everything is overridable. A starter is a
dependency swap plus whatever the new one auto-configures differently — bounded but not
trivial. A packaging format is expensive, because the deploy pipeline, the base image, the
runbook and the operational runbooks all encode it, and changing it invalidates everyone's
muscle memory. An actuator exposure decision is cheap to change and catastrophic to get wrong,
which is the worst combination available: low cost, high consequence, and no signal until
someone probes it. The lesson is to match your *review* effort to the reversal cost and the
blast radius, and to notice that the cheapest-to-reverse thing is the one that gets reviewed
least, because everyone assumes it's low-stakes.

**D51. A service has 12 `@ConfigurationProperties` classes and 200 properties. Is the
configuration surface a liability?**

At that size, the liability is not the count, it's the absence of an inventory. Nobody can
answer "what can be changed without a redeploy, and what does changing it do?" from memory,
which is the question asked during incidents. The two concrete consequences: you cannot
reason about which properties are coupled (a retry count that should be bounded by a pool
size, a timeout that should sit under a downstream budget), and a change to one property has
an unknown blast radius. The fix is not fewer properties but a generated document — the
`additional-spring-configuration-metadata.json` the configuration processor produces is most
of the way there — plus a convention that a class is owned by a team and a bounded context.
The measurement that settles it: try to answer "which properties does this service read?"
from the code alone, and time yourself.

**P52. After a config-server migration, a service starts but reads defaults for three
properties. The properties are present in the remote config. What happened?**

One of the classic ConfigTree failures: the properties are in a **profile-specific** file in
the remote config and the profile isn't active, so the profile-less document is loaded and
those keys simply don't exist — with `@ConfigurationProperties` and no `@NotNull`, that
silently falls back to the field default rather than failing. The second classic is
precedence: the remote values lose to a higher-precedence source, most often
`SPRING_APPLICATION_JSON` or a command-line argument the deployment platform sets. The
diagnostic is `/actuator/env`, and specifically its **origin** column, which names the
property source that won. The prevention is `@NotNull` with no default on anything that
must come from the server, so a missing key is a startup failure instead of a surprise.

**D53. Your team relies on `spring.main.allow-bean-definition-overriding=true`. What is
happening, and what should you do about it?**

By default Boot disables bean-definition overriding, precisely because two `@Bean` methods
for the same name is almost always a mistake — and enabling the flag turns that startup
error into a silent "the last one registered wins", which is order-dependent and becomes a
production-only behaviour on the path that happens to use the bean that lost. The
legitimate reasons for the flag are real: a library that registers a bean the application
also defines, or a migration where two beans are briefly equivalent. So the staff answer
is: keep the flag if you must, but track every use, and treat each one as a `@Primary` or a
rename waiting to happen. A team that has had it on for a year is usually surprised to learn
how many overrides are in there.

**D54. Boot 3.2 deprecated the nested-jar URL handler. A team has tooling that depends on
`jar:nested:` URLs. What's the migration?**

Replace the `jar:nested:` access with an explicit `jarmode` operation: `-Djarmode=tools
extract` to explode the archive, `-Djarmode=layertools extract` for the layered layout, and
`-Djarmode=tools -Dloader.main=…` to run a different entry point. The reason the deprecation
matters beyond convenience is that a custom `jar:` `URLStreamHandler` is a process-global
JVM extension — it changes URL parsing for code you don't control, and it interacts badly
with the module path and with classloaders that expect a standard handler, which is exactly
the kind of failure that appears in someone else's dependency rather than in your tooling.
The migration is usually mechanical, but the thing to check afterwards is whether the
extraction step has been wired into the build rather than run by hand — hand-run extractions
don't run in CI.

**D55. A service has 40 instances behind a load balancer, and deploys produce intermittent
`502`s during the rollout. You have `server.shutdown=graceful` and a 60-second
termination grace period. Why does it still happen?**

Because the two clocks aren't synchronised and the grace period doesn't help. On SIGTERM,
the pod starts terminating *and* Kubernetes begins removing it from Service endpoints at the
same time; endpoint propagation across 40 nodes' proxies takes one to five seconds, and
during that window the load balancer still sends requests to a pod that has already stopped
accepting. The 60-second grace period only bounds how long the pod is *allowed* to live; it
does nothing about the gap. The fix is ordering — publish
`ReadinessState.REFUSING_TRAFFIC` first, wait for the propagation window, then shut down —
implemented either as a `ContextClosedEvent` listener that flips readiness and sleeps, or
cleaner, as a `preStop` hook that sleeps before the JVM is signalled at all. And the number
should be measured against this cluster's propagation delay, not copied from a blog.



