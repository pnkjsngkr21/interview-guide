---
title: "The Spring Complete Deep-Dive"
volume: 10
series: "WEBFLUX & PROJECT REACTOR"
subtitle: "Study & Interview Mastery Guide"
---

# The Spring Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is an eleven-volume study guide to the Spring ecosystem, written for engineers who
already know Java and are preparing for senior and staff-level backend interviews. It is not
a tutorial. Nothing here explains what a class is.

The organising question of every chapter is the same one a staff engineer gets asked in a
real design review: **not "what does this do", but "why would a team choose this, what does
it cost, when does it break, and how expensive is it to undo?"** Spring's annotations are
treated as the visible surface of much larger machinery — a proxy chain, a bean lifecycle,
a connection pool, a thread pool, an event loop — and the notes always go down to that
machinery, because that is the layer where production incidents actually live.

Volume 10 is the reactive frontier. If Volume 1 is about how the container builds objects,
this volume is about what happens when a single request must fan out across twenty services
and every one of them is slow. It is the volume where the most confident answers are most
likely to be wrong, because the reactive paradigm invites confident answers.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto `Publisher` produces
filler. The template is a completeness checklist, not a template to fill.

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

| Volume | Coverage |
| --- | --- |
| Volume 1 | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 (this book) | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation, reactive persistence |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 10

- Chapter 1 — The Reactive Programming Model
- Chapter 2 — Project Reactor Core
- Chapter 3 — Errors, Retries & Timeouts
- Chapter 4 — WebFlux vs MVC
- Chapter 5 — Writing WebFlux Endpoints
- Chapter 6 — Reactive Persistence & Remote Calls
- Chapter 7 — Context Propagation
- Chapter 8 — Testing & Production Patterns
- Chapter 9 — Interview Scenario Bank

---

# Part 10 — WebFlux & Project Reactor

## Chapter 1 — The Reactive Programming Model

### 1.1 The Actual Change

Reactive is not "async with nicer syntax." It inverts control of the data flow. In an
imperative model, your code decides what happens next and blocks until it does. In a reactive
model, you hand a `Publisher` to a framework, and the framework decides when to request more
data — that decision is called **demand**, and demand-based flow control is the entire point
of the Reactive Streams specification.

```text
IMPERATIVE                              REACTIVE

┌──────────┐        ┌──────────┐        ┌──────────┐   request(n)   ┌──────────┐
│ Producer │ ─────► │ Consumer │        │ Subscriber│ ────────────► │ Publisher │
│ produces │        │ blocks,  │        │   ◄───────┤ ◄──────────── │ produces │
│ as fast  │        │ requests │        │  onNext   │   onNext × n  │ as fast  │
│ as it    │        │ one at a │        └──────────┘                │ as it is │
│ can      │        │ time     │                                     │ DEMANDED │
└──────────┘        └──────────┘                                     └──────────┘

Push model: producer has no idea if          Pull model: consumer is in control;
the consumer is keeping up. Overflow          the producer CANNOT outrun the consumer.
is possible and invisible.
```

That inversion is the whole design. It exists because of a specific failure: a fast producer
and a slow consumer, where the intermediate has no way to express "slow down."

### 1.2 Reactive Streams — The Four Methods

```java
public interface Publisher<T> {
    void subscribe(Subscriber<? super T> s);
}

public interface Subscriber<T> {
    void onSubscribe(Subscription s);      // 1. gate to demand
    void onNext(T t);                     // 2. data, only if requested
    void onError(Throwable t);            // 3. terminal, at most once
    void onComplete();                    // 4. terminal, at most once
}

public interface Subscription {
    void request(long n);                 // demand signal
    void cancel();                        // consumer gives up
}
```

The contract, and the parts people get wrong:

| Rule | Consequence |
| --- | --- |
| `onSubscribe` is called first, exactly once | It's the only place you get a `Subscription` |
| `onNext` only after `request(n)` with `n > 0` | A publisher emitting without demand is a spec violation |
| `request(n)` is a *hint*, not a demand counter | Publishers may emit fewer; they must never emit more |
| `request(Long.MAX_VALUE)` means "unbounded" | A publisher that honours it without bound has removed backpressure |
| `onError` and `onComplete` are terminal, at most one | Nothing follows |
| `cancel()` means "no more, ever" | After cancel, the publisher must stop |
| Signals are serialised | Never `onNext` from two threads concurrently |
| None of the four methods may block | This is the rule that breaks imperative code |

> **MUST REMEMBER**
>
> `request(n)` is a **hint**, not a demand counter. A publisher is permitted to emit fewer
> items than requested — `request(10)` on a source with three items left emits three and
> completes. What it may never do is emit *more*. This is why `Flux.generate` and
> `Flux.push` are careful about how they honour requests, and it's the single most common
> source of "my backpressure settings aren't being respected" confusion.

### 1.3 Backpressure, and Where It Actually Comes From

Backpressure propagates upstream through the demand chain. If the consumer requests 1 and the
publisher produces 1000, a compliant publisher produces 1, waits for the next `request`, and
so on. Intermediate operators propagate the demand — `map`, `filter` and `flatMap` all pass
`request(n)` through, translating as needed.

```text
Database cursor ──► map ──► flatMap ──► filter ──► WebFlux write
     ▲                                                        │
     └──────────── request(n) propagates upstream ◄───────────┘
```

The problem is real-world sources that *can't* be slowed:

| Source | Can it honour backpressure? |
| --- | --- |
| `Flux.fromIterable` | Yes — a collection can be iterated lazily |
| Database cursor (R2DBC streaming) | Yes, with a fetch-size bounded cursor |
| `Flux.range` | Yes, trivially |
| Netty inbound read | Yes — that's why TCP has a receive window |
| Kafka consumer | **No** — the consumer polls into a buffer, and the buffer has a fixed size |
| In-memory `List` turned into a hot `Flux` | **No** — the data is already in memory |
| `Schedulers.parallel()` timer | No — the clock doesn't stop |

When the source can't be slowed, backpressure has to be *inserted*, and this is where the
dangerous operators live:

```java
source.onBackpressureBuffer()          // UNBOUNDED — an OOM waiting to happen
source.onBackpressureBuffer(1024)      // bounded, but drops the OLDEST silently
source.onBackpressureDrop()            // drops new elements — LOSSY, silent
source.onBackpressureLatest()          // keeps only the newest — correct for state, wrong for data
source.onBackpressureError(            // converts overflow into a signal you can see
        new IllegalStateException("consumer too slow"));
```

> **INTERVIEW TRAP — "WHAT HAPPENS IF THE CONSUMER CAN'T KEEP UP?"**
>
> The reflexive answer is "backpressure kicks in and the producer slows down." That is true
> only for sources that can honour demand. For a source that can't — a Kafka consumer, an
> in-memory collection, a JDBC-style buffered source — the answer is that backpressure has to
> be *inserted* with an `onBackpressureX` operator, and every one of those operators either
> buffers without bound, drops silently, or errors. The senior answer names which operator and
> what it costs. "It just buffers" is the answer that produces a production OOM.

> **SCALING REALITY CHECK**
>
> `onBackpressureBuffer()` with no argument is **unbounded**. In a system where the consumer
> degrades — GC pause, slow downstream, cache miss storm — the buffer grows until the heap
> dies, and the process then takes the healthy event loops down with it. The bounded form
> throws `IllegalStateException` when full, which is a much better failure: visible,
> bounded, and diagnosable. If you cannot avoid `onBackpressureBuffer`, give it a size and
> handle the error signal.

### 1.4 When Reactive Is the Wrong Answer

This is the chapter section that separates a staff answer from a junior one, because the
industry spent five years telling people reactive was strictly better.

```text
┌─────────────────────────────────────────────────────────────┐
│  Reactive WINS when the bottleneck is WAITING               │
│  ───────────────────────────────────────────────────         │
│  • I/O-bound, high concurrency, low CPU                      │
│  • Thousands of concurrent connections, few of them active  │
│  • Fan-out to many services                                  │
│  • Streaming responses (SSE, chunked)                        │
│  • Gateway / proxying                                         │
│  • Apps with WebSocket or push                              │
├─────────────────────────────────────────────────────────────┤
│  Blocking WINS when the bottleneck is CPU                    │
│  ───────────────────────────────────                        │
│  • CPU-bound work: image processing, encryption, compression │
│  • Anything needing a JVM feature that is thread-oriented   │
│  • Team already knows threads; no I/O fan-out               │
│  • Most CRUD APIs at normal load                             │
│  • Anything needing a blocking database driver               │
└─────────────────────────────────────────────────────────────┘
```

The honest framing: **reactive trades threads for complexity, and it only pays when threads
were the constraint.** For a typical CRUD service handling 200 requests/second, the JVM can
give you 200 threads comfortably and the reactive machinery buys nothing while costing
significant debuggability.

> **STAFF-LEVEL CONSIDERATION**
>
> The real cost of a reactive migration is not the library — it's the people. `block()`, a
> `ThreadLocal` MDC lookup, a blocking JDBC driver, and a debugger that shows an event loop
> thread with a 40-frame stack are all things that quietly stop working. Before recommending
> reactive, the question a staff engineer should ask is: **do we have a measured concurrency
> requirement that threads cannot meet, and is the team prepared for the operational
> consequences?** "It's more scalable" is not an answer. "We need 50,000 concurrent
> connections and Tomcat needs 50,000 threads at 1MB stack each, which is 50GB" is an answer.

#### Common Mistakes

- Describing reactive as "async" without saying what changed: **demand-based flow control**.
- Assuming backpressure is automatic everywhere. It is automatic only for sources that can
  honour `request(n)`.
- Using `onBackpressureBuffer()` unbounded as a "safe default" — it's an unbounded heap
  liability.
- Believing reactive is always more scalable. It trades memory-per-request for threads, and
  adds real complexity either way.
- Ignoring that `request(Long.MAX_VALUE)` is a legitimate client choice that removes
  backpressure entirely.

#### Interview Questions — The Reactive Model

**Q1. What is the actual difference between reactive and imperative code?** `TRICKY`

Control of flow. Imperative code is push-based: the producer decides when to produce and
blocks if the consumer is slow. Reactive is pull-based: the consumer requests demand via
`request(n)` and the producer may never emit more than has been requested. That inversion is
the Reactive Streams contract, and everything else — operators, schedulers, `Mono`/`Flux` —
exists to implement it.

**Q2. Is `request(n)` a demand counter?** `TRICKY`

No — it's a **hint**. A publisher may emit fewer items than requested (request(10) on three
remaining items emits three), but must never emit more. This is why honouring requests is
delicate, and why `Flux.push` and `Flux.generate` take request-accounting arguments
seriously.

**Q3. A consumer slows down and memory climbs until the pod is OOM-killed. What's the
mechanism?**

The source can't honour backpressure — Kafka, a hot `Flux`, a buffered source — so an
`onBackpressureBuffer()` with no size argument accumulated without bound. The fix is a
bounded buffer with `onBackpressureError` (visible failure) or a deliberate drop strategy
appropriate to the data. The systemic fix is to find out why the consumer slowed and whether
the buffer was ever the right shape.

**Q4. When is reactive the wrong choice?** `STAFF`

When the bottleneck is CPU rather than waiting, when the work needs thread-oriented JVM
features, or when the team's operational capability can't absorb the debugging cost. A
typical CRUD API at normal load is served fine by blocking threads, and the reactive version
costs composability, thread-local propagation, and debuggability for no measurable gain. The
decision should be driven by a measured concurrency requirement, not by a framework's
reputation.

**Q5. What does `request(Long.MAX_VALUE)` do to backpressure, and who calls it?**

It asks for unbounded demand, which is a legal request that removes backpressure entirely for
that subscription — the producer may then emit as fast as it can. It's called by anything
consuming a `Flux` into a scalar (`collectList`, `block`), and by some of Reactor's own
convenience operators. It doesn't break the spec, it just means the guarantee is gone.

> **CHAPTER 1 SUMMARY**
>
> Reactive inverts control of the data flow: the consumer requests demand and the producer may
> not outrun it. `request(n)` is a hint, not a counter, and the whole spec exists to make
> "the fast producer and the slow consumer" a representable situation rather than an OOM.
> Backpressure is only automatic for sources that can honour it — Kafka, hot publishers and
> buffered sources need `onBackpressureX` inserted, and the unbounded buffer variant is a
> real production failure mode. The decision to go reactive should be driven by a measured
> concurrency requirement, because what reactive actually buys is a different cost structure,
> not free scalability.

#### Further Reading

- [Reactive Streams Specification](https://www.reactive-streams.org/) — the actual spec, and the `Publisher`/`Subscriber`/`Subscription` contract with the rule set. Short, and worth reading once properly.
- [Project Reactor Reference — About This Documentation](https://projectreactor.io/docs/core/release/reference/aboutDoc.html) — the entry point to the operator-by-operator reference; start here for the "Which operator do I need?" decision tables.
- [Reactive Manifesto](https://reactivemanifesto.org/) — the original rationale, including why the authors argue reactive is about handling *overload* rather than speed.

## Chapter 2 — Project Reactor Core

### 2.1 `Mono` and `Flux`

| | `Mono<T>` | `Flux<T>` |
| --- | --- | --- |
| Cardinality | 0 or 1 | 0 to N |
| Completes with | A value, or empty | A value, a completion, or neither |
| `subscribe()` returns | `Mono<Void>` | `Flux<Void>` |
| Typical use | A single DB row, an HTTP response | A stream of records, a collection |

```java
Mono.just("a")                 // 1 item
Mono.empty()                   // 0 items
Mono.error(ex)                 // 0 items + error
Mono.justOrEmpty(nullable)     // null → empty

Flux.just(1, 2, 3)             // 3 items
Flux.range(1, 1000)            // 1000 items
Flux.empty()                   // completes immediately
Flux.error(ex)
Flux.fromIterable(list)
Flux.never()                   // never emits, never completes
```

### 2.2 Assembly Time vs Subscription Time

This is the single most important operational fact in Reactor, and it explains a whole class
of "why didn't my code run?" bug.

```java
// ASSEMBLY happens here — the pipeline is built, but nothing executes
Flux<Data> pipeline = Flux.just("a", "b", "c")
        .map(this::transform)          // ← NOT called yet
        .filter(this::keep)            // ← NOT called yet
        .retry(3)
        .doOnNext(this::log);          // ← NOT called yet

// SUBSCRIPTION happens here — and again for every subsequent subscriber
pipeline.subscribe(this::consume);
pipeline.subscribe(this::consume);    // transforms run AGAIN, from scratch
```

```java
// WRONG — a common real bug
public void start() {
    hotFlux.subscribe(this::handle);   // the subscription is discarded
}
// The Flux keeps running with nobody listening to the results,
// and the returned Disposable is unreachable, so it can never be cancelled.
```

> **INTERVIEW TRAP**
>
> "Reactive operators are lazy" is right, and the useful follow-up is: **lazy per
> subscription, not per assembly**. A cold `Flux` re-executes its whole pipeline — including
> the database query — for every subscriber. Two subscribers to a cold pipeline means two
> queries. This is why `publish().autoConnect()` exists, why a cold `Mono` field is a latent
> N+1, and why the fix for "my controller method is being called twice" is almost always to
> understand whether something is subscribing more than once.

### 2.3 Cold vs Hot

| | Cold | Hot |
| --- | --- | --- |
| Data produced | Per subscriber, on demand | Once, regardless of subscribers |
| Late subscriber | Gets all data from the start | Gets only data after it subscribed |
| Examples | `Flux.range`, `Flux.fromIterable`, a DB query, `Mono.just` | `Flux.interval`, `Sinks.Many`, a Kafka stream |
| Buffers for late subscribers | No — data is generated per subscriber | Yes, or dropped |

```java
// Making a hot source
Flux<Long> ticks = Flux.interval(Duration.ofSeconds(1))
        .publish()
        .autoConnect(1);              // 1 = start emitting once there's this many subscribers

// Explicit Sinks — the modern API for hot sources
Sinks.Many<String> sink = Sinks.many().multicast().onBackpressureBuffer();
sink.tryEmitNext("hello");
sink.tryEmitComplete();
```

> **SCALING REALITY CHECK**
>
> `Sinks.many().multicast().onBackpressureBuffer()` buffers for slow subscribers, and with
> no bound specified, that buffer grows until the heap dies. `Sinks.many().multicast().directBestEffort()`
> drops for the slowest subscriber instead — correct for a *state* stream where only the latest
> value matters, silently wrong for a *data* stream where every event is a fact. The choice
> between them is a data-modelling decision, and it should be made deliberately rather than
> by picking whichever compiles.

### 2.4 The Composition Operators That Matter

```java
Mono<A> a = …;  Mono<B> b = …;  Flux<C> c = …;

// ── Sequential, discard the intermediate ─────────────────────
Mono<C> both = a.then(b);              // wait for a, then b; emit only b's value
Mono<C> bothValues = a.then(Mono.zip(a, b));   // emit both

// ── Concurrent, emit all ─────────────────────────────────────
Mono<Tuple2<A,B>> pair = Mono.zip(a, b);        // subscribes to both at once
Flux<Object> merged = Flux.merge(a.flux(), b.flux(), c);   // interleave all

// ── Concurrent, lose the intermediate ────────────────────────
Mono<C> concurrent = Mono.zip(a, b).then();      // both ran concurrently; only b emitted
Flux<C> sequence = c.concatMap(this::enrich);     // sequential, ordered

// ── Flatten a Flux of Monos ──────────────────────────────────
Flux<String> flat = Flux.just(m1, m2, m3)
        .flatMap(this::unwrap);      // concurrent; default concurrency 256
Flux<String> ordered = Flux.just(m1, m2, m3)
        .concatMap(this::unwrap);    // sequential; preserves order
Flux<String> seq = Flux.just(m1, m2, m3)
        .flatMapSequential(this::unwrap);  // concurrent AND ordered
```

> **MUST REMEMBER**
>
> `flatMap`'s default concurrency is **256** (`Queues.SMALL_BUFFER_SIZE`). That is a real
> number with a real consequence: `flux.flatMap(this::callService)` over a 10,000-element
> stream will have 256 concurrent calls in flight, not 10,000 — and if each one hits a
> downstream with a rate limit, 256 concurrent is the number that trips it. `concatMap` is
> sequential; `flatMapSequential` is concurrent but ordered. Choosing between them is often
> the whole performance story of a reactive pipeline.

#### Common Mistakes

- Subscribing inside a `flatMap` instead of returning the inner `Mono` — this breaks
  composition and error propagation entirely.
- Expecting `flatMap` to preserve order. It does not; `concatMap` or `flatMapSequential` do.
- Assuming one cold `Mono` field is one query. Every subscription re-executes it.
- `publish().autoConnect()` without a sensible subscriber count, or `share()` where
  `refCount(1)` is required for a resettable source.
- Calling `block()` and then wondering why the application is slow — it takes a thread out of
  the pool, and on an event-loop thread it throws.
- Using `onBackpressureBuffer()` unbounded to "fix" a slow consumer.

#### Interview Questions — Reactor Core

**Q1. What does "lazy" mean in Reactor, and what is the trap?** `TRICKY`

Operators build an assembly description without executing. Execution happens per
*subscription*, not per assembly. So a cold `Flux` re-runs its entire pipeline — including
the database query — for every subscriber, and a controller that subscribes twice performs
the query twice.

**Q2. `flatMap` vs `concatMap` vs `flatMapSequential`?**

`flatMap` subscribes to inner publishers concurrently and does not preserve order.
`concatMap` is sequential and ordered. `flatMapSequential` is concurrent but emits results in
the original order. `flatMap`'s default concurrency is 256, which is a real bound on
in-flight work and often the number that trips a downstream rate limit.

**Q3. Your controller method's database query runs three times per request. Why?**

Something is subscribing more than once, or a cold `Mono` is being resolved in more than one
place — a `flatMap` with an explicit `subscribe` inside, a `Mono` field shared and subscribed
in three operators, or an interceptor that subscribes to the body. The fix is to return the
`Mono` and let exactly one subscription happen, or to make the source explicitly hot with
`share()`.

**Q4. When would you use `Sinks.many().multicast().onBackpressureBuffer()` and when
`directBestEffort`?** `TRICKY`

`onBackpressureBuffer` when every element is a fact and losing one is unacceptable — you are
willing to spend memory to keep it. `directBestEffort` when the stream represents *state* and
only the latest value is meaningful — a live dashboard, a current-value stream. Using
`directBestEffort` for data silently loses events; using `onBackpressureBuffer` unbounded for
a fast producer is an OOM.

**Q5. `Mono.zip(a, b).then(c)` vs `Mono.zip(a, b, c)`?**

The first subscribes to `a` and `b` concurrently, waits for both, discards their values, and
runs `c` — so all three ultimately execute. The second emits a tuple of all three. The
distinction matters when you think you're saving a round trip: `.then()` is a sequencing
operator, not a short-circuit.

> **CHAPTER 2 SUMMARY**
>
> `Mono` is 0-or-1, `Flux` is 0-to-N, and the entire vocabulary exists to express demand.
> The fact that matters operationally is that laziness is **per subscription**: a cold
> pipeline re-executes for every subscriber, which is why a shared cold `Mono` field is a
> latent N+1 and why a discarded `subscribe()` is a real bug. `flatMap` runs 256 inner
> publishers concurrently by default — a number that is often exactly the number that trips a
> downstream rate limit — while `concatMap` and `flatMapSequential` trade concurrency for
> ordering. And hot sources are a data-modelling decision: a bounded or erroring buffer for
> facts, a latest-value sink for state.

#### Further Reading

- [Project Reactor Reference — Which Operator Do I Need?](https://projectreactor.io/docs/core/release/reference/apdx-operatorChoice.html) — the decision tables mapping intent to operator; the fastest way to build operator fluency.
- [Reactor `flatMap` javadoc](https://projectreactor.io/docs/core/release/api/reactor/core/publisher/Flux.html) — the concurrency default and the ordering guarantees stated precisely.
- [Micrometer — Context Propagation Reference](https://docs.micrometer.io/context-propagation/reference/) — the official guidance on `ThreadLocal` propagation across reactive boundaries, covered in detail in Chapter 7.

## Chapter 3 — Errors, Retries & Timeouts

### 3.1 The Error Signal

An error is a terminal signal that travels down the chain. There is no exception thrown
across a thread boundary — the subscriber receives `onError`.

```java
// Fallback: substitute a value and CONTINUE
Flux.just(1, 2, 3)
    .map(this::divide)             // throws on 1
    .onErrorReturn(-1);            // emits -1 and completes

// Fallback: switch to a DIFFERENT pipeline
Flux.just(1, 2, 3)
    .map(this::divide)
    .onErrorResume(ex -> Flux.just(0, 0));   // emits 0, 0 and completes

// Fallback with context
    .onErrorResume(OrderNotFound.class, ex -> Mono.empty())
    .onErrorResume(ex -> {
        log.error("lookup failed", ex);
        return Mono.just(UNKNOWN);
    });

// Terminal operator: make ANY error fatal — usually for tests
    .onErrorMap(PaymentDeclined.class, ex -> new BusinessRuleViolation("payment", ex.getMessage()))
    .onErrorComplete();             // swallow and complete
```

> **INTERVIEW TRAP — `onErrorContinue`**
>
> `onErrorContinue` lets an element that errored be dropped and the stream carry on. It is
> documented as best avoided, and the reason is worth knowing: the operator must attempt to
> resubscribe to recover the next element, and recovering the *position* of a failed element
> inside a source that isn't restartable produces duplicate or skipped data. If you need
> "skip the bad rows", do it in `filter`/`flatMap` with an explicit per-element result type
> rather than with `onErrorContinue`.

### 3.2 Retry — and the Stampede

```java
// Immediate retry — the version that causes incidents
Mono.just(callApi())
    .retry(3);         // no delay, no backoff, no jitter

// Backoff with jitter — the version you want
Mono.just(callApi())
    .retryWhen(Retry.backoff(3, Duration.ofMillis(100))
                      .maxBackoff(Duration.ofSeconds(2))
                      .jitter(0.5)              // ±50% randomisation
                      .filter(this::isTransient)  // don't retry a 400
                      .onRetryExhaustedThrow((spec, signal) -> { ... }));
```

| `retry` argument | Behaviour |
| --- | --- |
| `retry()` | Infinite — do not ship |
| `retry(3)` | Three immediate retries, no delay |
| `retryWhen(companion)` | Full control: backoff, jitter, filter, exhaustion |
| `retryWhen(Retry.max(n))` | Max attempts, still immediate unless you add backoff |

> **PRODUCTION SCENARIO**
>
> Problem: at 09:14 the orders API's p99 went from 80ms to 12s and the upstream service
> reported a 4x traffic spike that matched *our* request count, not real user traffic.
> Investigation: our `retry(3)` on a call to a service that was returning 503s. Every client
> request became up to four requests within milliseconds.
> Root cause: a retry with no backoff and no jitter, on a dependency that was already
> degraded — the retry multiplied load exactly when the system could least afford it, and the
> synchronised retries from many instances created a self-sustaining stampede.
> Solution: `retryWhen` with exponential backoff, jitter, and a filter that excludes
> non-transient statuses; plus a circuit breaker so a failing dependency is failed fast
> rather than retried (see Volume 11).
> Prevention: no retry without a budget. Every retry policy in the system should be
> enumerable, and the total amplification factor across a call chain should be known — three
> layers each retrying twice is a 27x multiplier nobody budgeted for.

> **SCALING REALITY CHECK**
>
> Un-jittered retry is worse than no retry in a fleet. If every instance retries at
> 100ms, 200ms, 400ms after a shared dependency fails, the retries are synchronised across
> the fleet and produce periodic load spikes that keep the dependency from recovering.
> Jitter is not a nicety; it is what breaks the synchronisation. And the multiplication is
> multiplicative across a call chain: a 4-hop chain where each hop retries twice is
> **2³ = 8 requests per user request**, per layer, and it compounds with the number of
> concurrent callers.

### 3.3 Timeouts

```java
// SIMPLE — applies to the whole subscription
Mono.just(call())
    .timeout(Duration.ofSeconds(2));      // no fallback: errors with TimeoutException

// WITH FALLBACK — the idiom you'll use constantly
Mono.just(call())
    .timeout(Duration.ofSeconds(2), Mono.just(DEGRADED_RESPONSE));

// PER-ITEM on a Flux — resets the timer on each element
Flux.just(1, 2, 3)
    .timeout(Duration.ofSeconds(1));      // idle timeout, not total

// THE ONE THAT BITES EVERYONE
Mono.just(verySlowCall())
    .timeout(Duration.ofMillis(100),
              Mono.fromCallable(() -> "fallback"))   // ⚠ the FALLBACK is a Mono
    .block();
// → the fallback Mono is ALSO subject to the timeout, and if it blocks, the timeout
//   measures wall clock across both, not just the source.
```

> **MUST REMEMBER**
>
> `timeout(Duration, Mono<T> fallback)` times the **entire** assembly including the fallback.
> A fallback that is itself slow does not extend the budget; it consumes it. When you need an
> independent budget for the fallback, compose explicitly:
> `source.timeout(Duration.ofSeconds(2), Mono.empty()).onErrorResume(ex -> fallbackMono)`.
> This is the source of the "my timeout fallback never fires" and "my timeout fires even
> though the fallback is instant" bug reports, and it is worth being able to explain precisely.

> **TRADE-OFF**
>
> Timeouts are the most under-set and most consequential value in a reactive service. Too
> tight and you shed load you could have served; too loose and a slow dependency consumes
> your request threads or event-loop capacity until everything fails together. The flip
> condition is not "what's a good number" but **where in the budget chain this call sits** —
> a downstream call in a 500ms end-to-end budget should be well under 500ms, and the deepest
> call should have the smallest timeout. Budgets are allocated from the outside in, and every
> layer should have a timeout strictly less than its caller's.

#### Common Mistakes

- `retry(n)` with no backoff and no jitter, on a dependency that is already failing.
- Infinite `retry()`.
- Retrying non-idempotent operations, so a 504 after the work actually succeeded becomes a
  duplicate write.
- Believing `timeout(Duration, fallback)` gives the fallback its own budget.
- Setting no timeout at all and relying on the caller's — which fails the caller, not you.
- A fallback that hides a total dependency outage behind a cheerful 200, so the failure never
  reaches the alerting.

#### Interview Questions — Errors, Retries, Timeouts

**Q1. Why is `retry(3)` on a failing dependency dangerous?** `STAFF`

Three compounding reasons. There's no delay, so retries arrive in a burst exactly when the
dependency is least able to serve them. There's no jitter, so every instance in the fleet
retries in lockstep and the retries are synchronised rather than spread. And the
multiplication is multiplicative across a call chain — three layers each retrying twice is
eight requests per user request, which is how a modest dependency slowdown becomes an
outage. The fix is `retryWhen` with backoff, jitter, a filter for transient errors only, and
a circuit breaker so sustained failure fails fast.

**Q2. What is the difference between `onErrorReturn` and `onErrorResume`?**

`onErrorReturn(v)` substitutes a fixed value and completes. `onErrorResume(f)` invokes a
function with the exception and continues with whatever `Publisher` it returns — so it can
return a different fallback pipeline, an empty `Mono`, or rethrow. You need `onErrorResume`
when the fallback depends on the error type or needs to be asynchronous.

**Q3. Explain the `timeout(Duration, Mono fallback)` trap.**

The timeout applies to the whole sequence, fallback included. A slow fallback does not get an
independent budget — it consumes the one that's already running, so you get a `TimeoutException`
instead of the fallback's value. To give the fallback its own budget, use
`timeout(d, Mono.empty()).onErrorResume(...)`.

**Q4. When is retrying the wrong thing entirely?**

When the operation isn't idempotent and the failure is ambiguous — a request that timed out
may still have been processed. Also when the failure is not transient: retrying a 400, a 401
or a validation error is pure load. And when the dependency is down rather than slow, since
retries can't fix absence. In all three cases the answer is to fail fast and let a
circuit breaker or a queued retry handle it.

**Q5. How would you set timeouts for a four-hop call chain?** `STAFF`

Allocate the budget from the outside in. If the end-to-end SLO is 500ms, the frontend's
downstream call gets maybe 400ms, the next hop 300, then 200, then 100 — each strictly less
than its caller, so a stall is localised rather than compounding. Every layer must have its
own timeout; a layer without one inherits its caller's, which means the caller's thread is
held for the full budget. Then verify with a fault injection test, because the numbers are
only correct if the chain actually behaves as modelled.

> **CHAPTER 3 SUMMARY**
>
> Errors are terminal signals travelling down the chain, not exceptions crossing threads, and
> the fallback operators — `onErrorReturn` for a fixed value, `onErrorResume` for a different
> pipeline — are the whole vocabulary. Retry is where reactive services cause outages:
> `retry(n)` has no backoff and no jitter, so retries burst, synchronise across the fleet,
> and multiply multiplicatively through a call chain. Timeouts are a budget allocation
> problem, not a constant, and `timeout(Duration, fallback)` measures the fallback with the
> same clock as the source — a trap worth being able to explain precisely.

#### Further Reading

- [Project Reactor Reference — Error Handling](https://projectreactor.io/docs/core/release/reference/coreFeatures/error-handling.html) — the full operator set, including the caveat on `onErrorContinue`.
- [Reactor `Retry` javadoc](https://projectreactor.io/docs/core/release/api/reactor/util/retry/Retry.html) — backoff, jitter, and the filter/exhaustion hooks.
- [AWS Architecture Blog — Timeouts, Retries and Backoff with Jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) — the canonical argument for why jitter is mandatory in a fleet, from the team that operates at scale.

## Chapter 4 — WebFlux vs MVC

### 4.1 The Two Threading Models

```text
SERVLET (MVC)                          REACTIVE (WebFlux)
────────────────                       ───────────────────
Tomcat thread pool                     Reactor Netty event loops
  default 200 threads                 default ~2 × CPU cores
       │                                     │
  ┌────▼─────┐                        ┌────▼─────┐
  │ Request  │──► controller         │ Request  │──► controller
  │ thread   │    (blocking)         │ event    │    (non-blocking)
  └────┬─────┘                       └────┬─────┘
       │                                   │
  blocked while                         never blocked;
  JDBC / HTTP / FS                      the thread moves on
       │                                   │
  ~1MB stack × 200 = 200MB              ~1MB stack × 16 = 16MB

Concurrency model: thread-per-request    Concurrency model: event-loop, non-blocking
```

**A blocking call on a WebFlux event-loop thread is not merely slow — it stalls every other
request that event loop is handling.** Reactor detects the most obvious case and throws:

```text
java.lang.IllegalStateException: block()/blockFirst()/blockLast() are blocking,
which is not supported in thread reactor-http-nio-3
```

The unsafe case is a blocking library that doesn't declare itself, which shows up as a
throughput plateau far below the hardware's capability and is genuinely hard to diagnose.

### 4.2 The Migration Trap

The most common production surprise in Spring's reactive story is a mixed stack:

```java
// An MVC application (spring-boot-starter-web) that ALSO has webflux on the classpath
@RestController
public class OrderController {

    @GetMapping("/orders")
    public Mono<List<Order>> list() {        // reactive return type
        return blockingRepository.findAll(); // BLOCKING JPA call, converted to Mono
    }
}
```

Boot picks `WebApplicationType.SERVLET` when MVC is on the classpath, so this is an **MVC**
controller that *bridges* the `Mono` back to a servlet thread and blocks it. It works. It
gives you none of WebFlux's benefits and all of its costs — the reactive types exist, but
there's no event loop, no backpressure, and blocking threads are still doing the work.

> **INTERVIEW TRAP**
>
> "WebFlux is faster because it's non-blocking" is wrong as a general claim. WebFlux is a
> different *resource profile*: it holds many connections open on few threads, at the cost of
> complexity and of losing any advantage the moment a blocking call sneaks in. It is faster
> for I/O-bound work at high concurrency, and slower in practice for CPU-bound work and for
> teams whose code is full of blocking calls. A staff answer names the bottleneck, not the
> framework.

> **STAFF-LEVEL CONSIDERATION**
>
> The question behind the framework choice is rarely "which is better" but "what is our
> concurrency requirement, and what does our team cost per unit of complexity?" A gateway
> holding 50,000 mostly-idle connections is a genuine reactive use case. A CRUD service at
> 300 requests/second is not, and migrating it to reactive is a net cost: more complex code,
> harder debugging, thread-local context that needs a compatibility layer, and a persistence
> story that requires leaving JPA. The honest recommendation for most internal services is
> that they stay on MVC, and that reactive is used where the connection count — not the
> request rate — is the constraint.

#### Common Mistakes

- Adding `spring-boot-starter-webflux` to an existing MVC app to get `WebClient`, and then
  assuming the app is reactive. With both starters present, Boot selects the servlet stack.
- Calling `block()` anywhere in a reactive request path. On an event loop it throws; in
  `subscribe()` it deadlocks the result.
- Using `Schedulers.parallel()` for I/O. That pool is sized to the CPU count and is meant for
  CPU work; blocking it starves computation. `boundedElastic()` exists for blocking calls.
- Blocking JDBC/JPA in WebFlux with a bridge, which defeats the whole model and is harder to
  reason about than plain MVC.
- Assuming thread-local state (MDC, `SecurityContextHolder`, request-scoped beans) propagates
  across operator boundaries. It does not.

#### Interview Questions — WebFlux vs MVC

**Q1. What does WebFlux actually give you that MVC doesn't?** `TRICKY`

A different resource profile, not raw speed. Non-blocking I/O lets a few event-loop threads
hold thousands of mostly-idle connections, so the win appears at high connection counts with
low per-connection CPU — gateways, streaming, WebSocket. For CPU-bound work or ordinary load
with blocking dependencies, MVC with a normal thread pool is at least as fast and simpler.
WebFlux only outperforms MVC if no blocking call sneaks in.

**Q2. You add `spring-boot-starter-webflux` to a Spring Boot app. What actually happens?**

Boot's `WebApplicationType` deduction sees MVC on the classpath and selects
`WebApplicationType.SERVLET`, so you get a servlet stack with a reactive `WebClient` bean
available. The `Mono`-returning controller method is bridged and blocked on a servlet thread.
You get reactive types without reactive execution. You can force it with
`spring.main.web-application-type=reactive`, but only if you're also removing the blocking
dependencies.

**Q3. What happens if you `block()` on a WebFlux event-loop thread?**

Reactor throws
`IllegalStateException: block()/blockFirst()/blockLast() are blocking, which is not
supported in thread reactor-http-nio-N`. This is the deliberately-detected case. The
undetected case — a blocking library that doesn't declare itself — is worse: it silently
caps throughput, and diagnosing it means finding the blocking call with a stack dump or
`BlockHound`.

**Q4. Which scheduler should blocking calls use in a reactive application, and why?**

`Schedulers.boundedElastic()`, because it is a bounded pool designed to absorb blocking work
and grows on demand up to a cap. `Schedulers.parallel()` is sized to the CPU count and is for
CPU-bound work; putting blocking calls on it starves the very computations it exists to run.
Even so, moving a blocking call to `boundedElastic` is a bridge, not a fix — the thread is
still consumed, and the fix is a non-blocking implementation.

**Q5. What is the `BlockHound` library for?**

It detects blocking calls made on Reactor event-loop threads by instrumenting `Thread.sleep`,
synchronized blocks, and `Thread.join` to throw when the calling thread is a non-blocking
thread. It's the tool for finding the undeclared blocking call that Reactor can't detect —
the one that shows up as a mysterious throughput plateau.

> **CHAPTER 4 SUMMARY**
>
> WebFlux changes the resource profile, not the speed: a handful of event-loop threads holding
> many mostly-idle connections, at the cost of complexity, the loss of `ThreadLocal` state, and
> total dependence on nothing blocking. The single most common production surprise is
> `spring-boot-starter-webflux` added alongside MVC — Boot selects the servlet stack, and the
> `Mono`-returning controller is bridged and blocked, giving reactive types with none of
> reactive execution. Blocking an event loop is caught by Reactor when it's `block()` and not
> caught at all when it's an undeclared blocking library — which is what `BlockHound` is for.

#### Further Reading

- [Spring Framework Reference — WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html) — the reactive stack, its threading model, and the `WebClient` contract.
- [Project Reactor Reference — Schedulers](https://projectreactor.io/docs/core/release/reference/coreFeatures/schedulers.html) — `parallel`, `boundedElastic`, and when each is correct.
- [BlockHound](https://github.com/reactor/BlockHound) — the detection tool, and the README explains which blocking calls Reactor can and cannot catch on its own.

## Chapter 5 — Writing WebFlux Endpoints

### 5.1 Return Types

```java
@RestController
@RequestMapping("/orders")
public class OrderController {

    @GetMapping("/{id}")
    public Mono<Order> get(@PathVariable UUID id) {
        return service.findById(id);                    // Mono: 0 or 1
    }

    @GetMapping
    public Flux<Order> list(@RequestParam int page) {
        return service.findPage(page);                  // Flux: 0 to N
    }

    @GetMapping("/count")
    public Mono<Long> count() {
        return service.count();                         // 0 or 1
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public Mono<ResponseEntity<Order>> create(@RequestBody Mono<CreateOrderRequest> req) {
        return req.flatMap(service::create)
                   .map(o -> ResponseEntity.status(HttpStatus.CREATED).body(o));
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public Mono<Void> delete(@PathVariable UUID id) {
        return service.delete(id).then();               // discard the result
    }
}
```

`Mono<T>` → body with 200, `Flux<T>` → body (or a delimited stream), `Mono<Void>` → empty
body, `Mono<ResponseEntity<T>>` → full control over status and headers. Returning
`Flux<T>` with a single element is legal but the content type is `application/json` with an
array, so use `Mono<T>` for exactly-one semantics — clients and metrics tooling care.

### 5.2 Request and Response Bodies

```java
// WebFlux binds request bodies REACTIVELY — the body is a Publisher
@PostMapping
public Mono<Order> create(@RequestBody Mono<CreateOrderRequest> body) { … }

// Jackson still works
@PostMapping
public Mono<Order> create(@RequestBody CreateOrderRequest body) { … }

// Reactive types inside a normal object work
public record BulkRequest(List<CreateOrderRequest> orders) { }

@PostMapping("/bulk")
public Mono<BulkResponse> bulk(@RequestBody BulkRequest req) { … }
```

> **INTERVIEW TRAP — `@RequestBody` and max in-memory size**
>
> WebFlux's `spring.codec.max-in-memory-size` defaults to **256KB** and applies to
> *aggregated* bodies — anything not handled as a stream. Exceed it and you get
> `DataBufferLimitException` and a 500. The overflow is a genuine production surprise for
> file uploads, because people configure `spring.servlet.multipart.max-file-size` (a
> completely separate limit that doesn't apply to WebFlux) and conclude they're covered.
> Both limits exist and they are different properties on different stacks.

### 5.3 Server-Sent Events

```java
@GetMapping(value = "/events", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public Flux<ServerSentEvent<Notification>> stream(@AuthenticationPrincipal User u) {
    return notificationSink.asFlux()
        .filter(n -> n.userId().equals(u.id()))
        .map(n -> ServerSentEvent.builder(n)
                                  .id(n.sequence())            // for Last-Event-ID
                                  .event(n.type())
                                  .retry(Duration.ofSeconds(5))
                                  .build());
}
```

```java
// A heart-beat, so proxies and load balancers don't reap an idle connection
Flux<ServerSentEvent<?>> withHeartbeat = Flux.interval(Duration.ofSeconds(20))
    .map(i -> ServerSentEvent.<Object>builder().comment("keepalive").build())
    .mergeWith(actualEvents);
```

> **SCALING REALITY CHECK**
>
> SSE holds a connection open per client for the connection's whole life. A service that
> pushes updates to 20,000 idle clients is holding 20,000 sockets, and every hop in the path
> — load balancer, ingress, proxy — needs a raised idle timeout, or connections are reaped
> and every client reconnects in a synchronised wave. That reconnect wave is a self-inflicted
> thundering herd, and the fix is jittered client-side reconnect (the `retry(Duration)` on the
> server event and a randomised reconnect in the client) plus a heart-beat to keep the path
> warm. This is the practical scaling conversation for anything stream-shaped.

### 5.4 Batching and Windowing

```java
// Batch every 100 items, or every 1 second, whichever comes first
Flux<Order> orders = orderFlux
    .bufferTimeout(100, Duration.ofSeconds(1))
    .filter(batch -> !batch.isEmpty())
    .flatMap(this::bulkInsert);          // one statement, not 100

// Rate-limit upstream to protect a fragile dependency
Flux<Order> limited = orderFlux
    .limitRate(100);                     // request 100 at a time, not MAX_VALUE

// Backpressure-aware windowing for aggregation
Flux<Bucket> buckets = orderFlux
    .window(Duration.ofSeconds(5))
    .flatMap(window -> window.collectList());
```

> **MUST REMEMBER**
>
> `limitRate(n)` is the operator that keeps a downstream sink from asking for
> `Long.MAX_VALUE` and quietly destroying backpressure for the whole chain. Without it, one
> greedy consumer downstream of a database cursor turns a bounded pipeline into an unbounded
> one, and the memory growth shows up far from the cause.

#### Common Mistakes

- Returning `Flux<T>` when the contract is 0-or-1, producing a one-element array where the
  client expects an object.
- Assuming `spring.servlet.multipart.*` configures WebFlux uploads. It doesn't —
  `spring.codec.max-in-memory-size` is the WebFlux limit and it's 256KB by default.
- SSE without a heart-beat, so proxies reap the connection and every client reconnects in
  lockstep.
- Forgetting `limitRate`, letting a downstream `collectList()` request unbounded demand from
  a database cursor.
- Calling `subscribe()` in a controller instead of returning the `Mono` — the request returns
  before the work completes, and errors vanish.

#### Interview Questions — WebFlux Endpoints

**Q1. What happens if a WebFlux request body exceeds the configured in-memory limit?**

`DataBufferLimitException`, surfaced as a 500. The limit is
`spring.codec.max-in-memory-size`, 256KB by default, and it applies to aggregated bodies.
Critically, `spring.servlet.multipart.max-file-size` is a different property on a different
stack and does not apply — so a team that configured multipart limits and then moved to
WebFlux is unprotected and finds out from production.

**Q2. Why would you use `Flux` for an endpoint that returns one element?**

You wouldn't, normally. `Flux<T>` with one element serialises as a JSON array and the
content type reflects a stream, so a client expecting an object breaks. Use `Mono<T>` for
0-or-1 semantics, because the type is a contract that clients, metrics, and generated
documentation all read. `Flux` is for genuinely-many.

**Q3. How do you keep an SSE connection alive through a load balancer?**

A heart-beat — an SSE comment or an interval event on a shorter period than the proxy's idle
timeout — plus a matching idle-timeout configuration on every hop. Without it, connections
are reaped and clients reconnect together, and the synchronised reconnect is itself a load
spike. The client should also jitter its reconnect delay.

**Q4. `bufferTimeout(100, Duration.ofSeconds(1))` — what does it do, and why?**
`TRICKY`

It accumulates elements and emits a list when either 100 elements have arrived or 1 second
has elapsed, whichever comes first. It's the batching primitive for write throughput — one
bulk insert instead of 100 individual ones. The dual trigger matters: a count-only buffer
stalls on a low-volume stream, and a time-only buffer emits enormous batches under load.

**Q5. What is `limitRate` for and what breaks without it?**

It sets the maximum demand a downstream operator requests upstream, instead of
`Long.MAX_VALUE`. Without it, a greedy downstream (`collectList`, `block`, anything that asks
for everything) removes backpressure for the entire upstream chain including a database
cursor, and memory grows unbounded. It's a small operator that protects a large system.

> **CHAPTER 5 SUMMARY**
>
> WebFlux controllers are ordinary controllers with reactive return types, and the return type
> is a contract: `Mono<T>` for 0-or-1, `Flux<T>` for genuinely many, `Mono<Void>` for none.
> WebFlux binds request bodies reactively and caps *aggregated* bodies at
> `spring.codec.max-in-memory-size` (256KB) — a different property from servlet multipart
> limits, and the source of a real production gap. Streaming endpoints need heart-beats or
> they cause synchronised reconnection waves, and `limitRate` is the cheap operator that
> stops one greedy consumer from destroying backpressure for the whole chain.

#### Further Reading

- [Spring Framework Reference — WebFlux annotated controllers](https://docs.spring.io/spring-framework/reference/web/webflux/controller/ann.html) — return-type handling, reactive binding, and the codec limits.
- [Spring Framework Reference — Web MVC Annocated Controllers](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller.html) — useful side-by-side for the servlet return-type contract.
- [Spring Guides](https://spring.io/guides) — the `gs-reactive-rest-service` walkthrough is the shortest complete WebFlux example available.

## Chapter 6 — Reactive Persistence & Remote Calls

### 6.1 R2DBC

R2DBC is the Reactive Relational Database Connectivity API — a `Publisher`-returning
equivalent of JDBC. The `DatabaseClient` (Spring Framework's R2DBC client) is the
equivalent of `JdbcTemplate`.

```java
@Repository
public class OrderRepository {

    private final DatabaseClient client;

    public Flux<Order> findByStatus(OrderStatus status) {
        return client.sql("SELECT * FROM orders WHERE status = :status")
            .param("status", status.name())
            .map((row, meta) -> new Order(
                    row.get("id", UUID.class),
                    row.get("status", OrderStatus.class),
                    row.get("total", BigDecimal.class)))
            .all();
    }

    public Mono<Integer> insert(Order order) {
        return client.sql("INSERT INTO orders (id, status, total) VALUES (:id, :status, :total)")
            .param("id", order.id()).param("status", order.status().name())
            .param("total", order.total())
            .fetch().rowsUpdated();
    }
}
```

| | JDBC | R2DBC |
| --- | --- | --- |
| Blocking | Yes | No |
| Driver support | Universal | Subset — PostgreSQL, MySQL, MSSQL, H2, Oracle, DB2 |
| ORM | JPA/Hibernate | R2DBC, and JPA has no reactive equivalent |
| Transactions | Yes | Yes, via `TransactionalOperator` |
| Pagination | Offset-based | Offset-based, or keyset (better) |
| Maturity | Decades | Young — fewer edge cases, more gaps |

> **TRADE-OFF**
>
> R2DBC's real cost isn't the driver — it's that **JPA/Hibernate has no reactive equivalent**,
> so choosing R2DBC means leaving the ORM. That is a large decision: you lose entity mapping,
> dirty checking, the persistence context, derived queries, `Specification`, and years of
> accumulated tuning knowledge. The flip condition is the one that makes it worth it: a
> genuinely high-concurrency, I/O-bound service where blocking threads are genuinely the
> constraint and the query surface is simple enough not to need an ORM. For most services,
> the honest answer is that MVC + JPA + a well-sized pool is the better trade.

### 6.2 Reactive Transactions

There is no `@Transactional` in reactive code, because the transaction spans an asynchronous
boundary that annotations cannot express.

```java
@Service
public class OrderService {

    private final TransactionalOperator tx;   // not @Transactional
    private final R2dbcTransactionManager tm;
    private final OrderRepository orders;

    public Mono<Order> create(CreateOrderCommand cmd) {
        return tx.transactional(tm, s -> orders.insert(toOrder(cmd))
                                              .then(Mono.defer(() -> orders.findById(...))));
    }
}
```

The subtlety worth knowing: `tx.transactional(...)` is **lazy in exactly the way that
matters** — the callback runs on subscription, and the connection is acquired then, not when
`transactional()` is called. The `Mono.defer` in the example is there because an eager
`Mono` built outside the callback would execute its query outside the transaction.

### 6.3 `WebClient` — the Reactive HTTP Client

```java
WebClient client = WebClient.builder()
    .baseUrl("https://inventory.internal")
    .defaultHeader(HttpHeaders.ACCEPT, MediaType.APPLICATION_JSON_VALUE)
    .codecs(c -> c.defaultCodecs().maxInMemorySize(2 * 1024 * 1024))
    .clientConnector(new ReactorClientHttpConnector(
        HttpClient.create()
            .option(ChannelOption.CONNECT_TIMEOUT_MILLIS, 500)
            .responseTimeout(Duration.ofSeconds(2))))
    .build();

Flux<InventoryItem> lookup(List<String> skus) {
    return Flux.fromIterable(skus)
        .flatMap(sku -> client.get().uri("/items/{sku}", sku)
                              .retrieve()
                              .bodyToMono(InventoryItem.class), 8);   // 8 concurrent
        .retryWhen(Retry.backoff(2, Duration.ofMillis(100)).jitter(0.5));
}
```

```java
retrieve()  vs  exchangeToMono()   vs  exchangeToFlux()

retrieve()            — 4xx/5xx → onError; 2xx → body          ← the default, use this
exchangeToMono(f)     — you get EVERY response, you decide what an error means
exchangeToFlux()      — for a streaming/chunked response body
```

`retrieve()` throws `WebClientResponseException` on 4xx/5xx, which arrives as `onError`.
If you need the status to drive logic rather than fail the chain, use `exchangeToMono()`.

> **SCALING REALITY CHECK**
>
> `WebClient` must be **injected, not built per request**. A `WebClient` carries a connection
> pool, and constructing one inside a controller method creates a pool per request — which
> is a connection storm against both your service and the remote one, and shows up as file
> descriptor exhaustion on the *client* side. The pool size is also shared across all users
> of that bean, so under 1,000 concurrent requests a default pool of ~100 (Netty's
> `HttpResources`) becomes a queue that manifests as latency rather than as an obvious error.

#### Common Mistakes

- Using `@Transactional` in reactive code. It has no meaning across the async boundary; use
  `TransactionalOperator`.
- Building an eager `Mono` outside `tx.transactional()`, so the query runs outside the
  transaction. `Mono.defer` is the fix.
- Creating a `WebClient` per request instead of exposing it as a bean.
- Using `retrieve()` where you need the status code to drive a decision — that's
  `exchangeToMono()`.
- Assuming R2DBC can replace JPA. It can't; the ORM has no reactive equivalent.
- Defaulting `maxInMemorySize` when the remote returns large payloads, and hitting
  `DataBufferLimitException` under load rather than in testing.

#### Interview Questions — Reactive Persistence

**Q1. Why is there no `@Transactional` in reactive Spring?** `TRICKY`

Because `@Transactional` works by intercepting a method call, binding a connection to the
calling thread, and committing when the method returns. A reactive pipeline returns
immediately and does work later, on a different thread, so there is no thread to bind a
connection to and no "return" to commit on. `TransactionalOperator.transactional(manager,
callback)` replaces it, and the callback runs on subscription with the connection acquired at
that moment.

**T1. You build a `Mono` outside `tx.transactional()` and return it from inside. Does the
query run inside the transaction?**

No. The `Mono` was already assembled, and any eager operator in its construction executed
at assembly time, outside the transaction. Only operators that defer execution — `Mono.defer`,
or a chain built inside the callback — run inside. The symptom is a write that commits
outside the transaction boundary despite the code looking correct.

**Q2. `WebClient` vs `RestTemplate` — which and when?**

`WebClient` is non-blocking, supports HTTP/2, streaming response bodies, and integrates with
Reactor. `RestTemplate` is blocking and simpler, and remains the right choice in an MVC
application where you have no concurrency reason to go reactive. The trap is constructing a
`WebClient` per request — it carries a connection pool, so that creates a pool per request.

**S1. A PR introduces `WebClient` inside a controller method. What is the review comment?**

That each call constructs a connection pool. `WebClient` should be a bean, built once with
its timeouts and codec limits configured at construction. The review should also check that
timeouts and a retry policy exist at all — an HTTP client with no connect timeout and no
response timeout is a latency bug waiting for a slow dependency.

**D1. Is moving a JPA service to R2DBC worth it?** `STAFF`

Rarely, and the deciding question is whether you have a measured concurrency requirement
that threads can't meet. The cost is losing Hibernate entirely — entity mapping, dirty
checking, the persistence context, derived queries, `Specification`, and the accumulated
tuning knowledge that comes with years of operating the same ORM. R2DBC also has thinner
driver coverage. The flip conditions that make it right: genuinely high-concurrency I/O-bound
work, a simple query surface that doesn't need an ORM, and a team prepared to own the
persistence layer. Absent those, MVC + JPA + a correctly-sized pool is the better trade, and
saying so is a stronger answer than listing R2DBC's advantages.

> **CHAPTER 6 SUMMARY**
>
> R2DBC is the reactive database API, but its real cost is that JPA has no reactive
> equivalent — so the decision is really "leave the ORM or not", and most services should
> not. Transactions in reactive code go through `TransactionalOperator` rather than
> `@Transactional`, because there is no thread to bind a connection to and no method return
> to commit on; the callback runs on subscription, which is why an eagerly-built `Mono`
> assembled outside it executes outside the transaction. And `WebClient` must be an injected
> bean — it carries a connection pool, so building one per request creates a pool per request.

#### Further Reading

- [Spring Framework Reference — Reactive Data Access with R2DBC](https://docs.spring.io/spring-framework/reference/data-access/r2dbc.html) — `DatabaseClient`, `TransactionalOperator`, and the reactive transaction model.
- [Spring Framework Reference — WebClient](https://docs.spring.io/spring-framework/reference/web/webflux-webclient.html) — the reactive HTTP client, its timeouts, and `exchangeToMono` semantics.
- [R2DBC SPI](https://r2dbc.io/) — driver SPI and the current driver support matrix; check this before assuming your database has one.

## Chapter 7 — Context Propagation

### 7.1 The Problem Reactor Creates

`ThreadLocal` state is a per-thread mechanism. Reactor's whole point is that work moves
between threads — the HTTP event loop schedules onto `parallel` for a `map`, onto
`boundedElastic` for a blocking call, back to the event loop for the response.

```java
// This works in MVC
MDC.put("traceId", traceId);          // set on the request thread
Mono.just(1)
    .map(x -> MDC.get("traceId"))     // ⚠ null — a different thread
    .doOnNext(id -> log.info("x"));   // ⚠ logs without a traceId
```

This is a genuine operational problem, not a theoretical one. MDC-based trace correlation,
`SecurityContextHolder` in the default `ThreadLocal` mode, and `RequestContextHolder` all
break across operator boundaries.

### 7.2 The Fix — Reactor Context

```java
// Write to the Reactor Context, not to a ThreadLocal
Mono.just(1)
    .contextWrite(ctx -> ctx.put("traceId", traceId))
    .doOnNext(x -> {
        String id = Mono.deferContextual(c -> Mono.just(c.get("traceId")));
        // ... but this is clunky, because Reactor Context is not a ThreadLocal
    });
```

Reactor Context is a per-subscription immutable map that flows **downward** with the signal —
which is correct, and is why it beats a `ThreadLocal`. But it's awkward to read from inside
ordinary code, which is what the compatibility layer is for.

```java
// Micrometer Context Propagation — bridge Reactor Context into ThreadLocals
ContextRegistry.getInstance()
    .registerThreadLocalAccessor(
        MDC.class.getName(),                          // key
        () -> MDC.get("traceId"),                     // read from TL
        value -> MDC.put("traceId", (String) value),  // write to TL
        () -> MDC.remove("traceId"));                 // clear

Hooks.enableAutomaticContextPropagation();
```

With that registered and automatic propagation enabled, Reactor copies the Reactor Context
into the relevant `ThreadLocal` around each operator invocation, and your existing
`MDC.get(...)` and `SecurityContextHolder.getContext()` code keeps working.

> **MUST REMEMBER**
>
> **`ThreadLocal` values in a reactive application are wrong by default.** The correct
> store is the Reactor `Context`, which travels with the subscription. Micrometer's Context
> Propagation bridges it to `ThreadLocal` for compatibility — and that bridge, once enabled,
> is a piece of global state that affects the whole application. Two teams both registering
> accessors for the same key is a silent conflict, which is a reason to have one team own the
> bootstrap configuration.

> **SCALING REALITY CHECK**
>
> Reactor's default `Context` stores values in an **immutable linked structure, one node per
> `contextWrite`**. A pipeline with dozens of `contextWrite` calls builds a chain that every
> signal walks. At hundreds of operators and thousands of requests per second this is
> measurable — and the cause is usually a `contextWrite` inside a `flatMap` that then
> multiplies across thousands of concurrent inner subscriptions. The fix is to write context
> once at the entry point, not per element.

#### Common Mistakes

- Assuming `MDC` or `SecurityContextHolder` works across operators. It doesn't without
  Context Propagation, and the symptom is log lines without trace IDs rather than an error.
- Using `ThreadLocal` for request-scoped state in WebFlux. Spring's
  `RequestContextHolder` is ThreadLocal-based and therefore unreliable there; the answer is
  to pass the context explicitly or use the reactive accessor.
- Registering Context Propagation accessors in more than one place, so a second registration
  silently overwrites the first.
- Calling `contextWrite` deep in a pipeline, where the cost multiplies across concurrent
  inner subscriptions.
- Assuming an `InheritableThreadLocal` solves it. It copies at thread *creation*, not at task
  submission, so any thread pool — which is what schedulers use — misses it entirely.

#### Interview Questions — Context Propagation

**Q1. Why doesn't `MDC` work in a WebFlux application by default?** `TRICKY`

`MDC` is `ThreadLocal`-backed, and Reactor moves work between threads — the event loop, then
`parallel`, then `boundedElastic` — so a value set on the request thread is not present when
the operator runs. The symptom is log lines missing their trace ID, not an error.
Micrometer's Context Propagation restores it by copying the Reactor `Context` into the
`ThreadLocal` around each operator invocation.

**Q2. Why is the Reactor `Context` the right store rather than a `ThreadLocal`?** `TRICKY`

Because it is scoped to the subscription and travels with the signal, so it follows the work
across scheduler hops automatically, and it's immutable per-scope so concurrent subscriptions
can't see each other's values. A `ThreadLocal` is scoped to a thread, which is the wrong axis
in a reactive pipeline — and `InheritableThreadLocal` doesn't help, because it copies at
thread creation, not at task submission, so thread pools miss it entirely.

**Q3. What is a real cost of Reactor `Context` that people don't expect?**

It's an immutable linked structure with one node per `contextWrite`, and every signal walks
it. A pipeline with many `contextWrite` calls — especially inside a `flatMap` that multiplies
across concurrent inner subscriptions — pays that cost per element. The mitigation is to
write context once at the entry point rather than per element.

**D2. Is enabling automatic Context Propagation globally a safe default?** `STAFF`

It's a reasonable default, but it's global mutable state, and the registrations are keyed by
class name — so two teams both registering an accessor for the same key is a silent
conflict where one quietly wins. The staff-level move is to own the registration in one
bootstrap configuration that the whole application imports, rather than letting each library
or starter register its own. And it's worth being explicit that the bridge exists to
preserve existing `ThreadLocal`-based code, not to encourage new `ThreadLocal` usage —
new code should take the context as a parameter.

> **CHAPTER 7 SUMMARY**
>
> Reactive breaks `ThreadLocal` state — MDC, `SecurityContextHolder`,
> `RequestContextHolder` — because work moves between threads, and the symptom is log lines
> without trace IDs rather than an exception. The correct store is Reactor's `Context`,
> which is scoped to the subscription and travels with the signal; Micrometer's Context
> Propagation bridges it to `ThreadLocal` for compatibility with existing code. The
> surprising cost is that `Context` is an immutable linked structure walked by every signal,
> so `contextWrite` belongs at the entry point, not inside a `flatMap`.

#### Further Reading

- [Micrometer Context Propagation](https://docs.micrometer.io/context-propagation/reference/) — the API, the `ThreadLocalAccessor` model, and the automatic-propagation hook.
- [Project Reactor Reference — Adding a Context to a Reactive Sequence](https://projectreactor.io/docs/core/release/reference/advancedFeatures/context.html) — how Reactor Context works and why it's the right store, from the authors.
- [Spring Framework Reference — WebFlux Context](https://docs.spring.io/spring-framework/reference/web/webflux.html) — how the reactive context relates to the servlet request context.

## Chapter 8 — Testing & Production Patterns

### 8.1 `StepVerifier`

```java
@Test
void retriesOnceThenSucceeds() {
    StepVerifier.create(callingApiTwiceThenOk())
        .expectNext("first-failure", "second-ok")
        .expectComplete()
        .verify(Duration.ofSeconds(5));        // FAIL the test rather than hang
}

@Test
void timesOutAfterTwoSeconds() {
    StepVerifier.create(slowCall().timeout(Duration.ofSeconds(2), Mono.just(DEGRADED)))
        .expectNext(DEGRADED)
        .expectComplete()
        .verify(Duration.ofSeconds(5));
}
```

`verify()` without a timeout is the single most common way a reactive test suite hangs CI
instead of failing it. **Always pass a duration.**

### 8.2 Virtual Time

```java
@Test
void emitsEverySecond() {
    StepVerifier.withVirtualTime(() -> Flux.interval(Duration.ofSeconds(1)).take(5))
        .expectSubscription()
        .thenAwait(Duration.ofMinutes(10))      // instant — virtual clock
        .expectNext(0L, 1L, 2L, 3L, 4L)
        .verifyComplete();
}
```

Virtual time tests an hours-long timer in milliseconds — and it tests it *deterministically*,
which matters more than the speed. A `Thread.sleep`-based test of a retry schedule is both
slow and flaky.

### 8.3 WebFlux Integration Tests

```java
@SpringBootTest(webEnvironment = RANDOM_PORT)
class OrderApiIT {

    @Autowired WebTestClient client;      // auto-configured, bound to the random port

    @Test
    void returnsOrder() {
        client.get().uri("/orders/{id}", KNOWN_ID)
              .exchange()
              .expectStatus().isOk()
              .expectBody().jsonPath("$.status").isEqualTo("CONFIRMED");
    }
}

// A slice test — no server, no full context
@WebFluxTest(OrderController.class)
class OrderControllerTest {
    @Autowired WebTestClient client;
    @MockBean OrderService service;

    @Test
    void delegates() {
        given(service.findById(ID)).willReturn(Mono.just(ORDER));
        client.get().uri("/orders/{id}", ID)
              .exchange()
              .expectStatus().isOk();
    }
}
```

`WebTestClient` (reactive) vs `WebTestClient.bindToServer()` (real server) vs `TestRestTemplate`
(servlet, for MVC) — the first is faster and doesn't need a port; the second tests the full
HTTP stack; the third is for MVC applications.

### 8.4 The Operational Reality

This is the section that decides whether reactive is viable for your team, and it belongs in
a staff-level conversation more than in a chapter.

| | MVC | WebFlux |
| --- | --- | --- |
| Thread dump interpretation | Straightforward — one frame per request | Very hard — a single event-loop frame interleaves thousands of requests |
| Blocking a thread | Slows one request | Stalls every request on that event loop |
| CPU profiling | Attaches to request threads cleanly | Samples across event loops; attribution is harder |
| Debugger step-through | Works | Frequently requires a virtual-thread-style or async-aware debugger |
| Load generator needed for realistic tests | No | Usually yes — the interesting behaviour is concurrency behaviour |
| Latency tail visibility | Per-request correlation | Needs Reactor Context propagation to even attribute correctly |

> **STAFF-LEVEL CONSIDERATION**
>
> The honest staff-level summary: adopting reactive means accepting a different operational
> toolset, and that has a real staffing cost. A thread dump on an event-loop thread is close
> to unreadable; a CPU profile is harder to attribute; and the failure mode of a stray
> blocking call is a global throughput plateau rather than a slow endpoint, which is much
> harder to localise. Before recommending it, the question is whether the team has or will
> build the capability to operate it — and if the answer is "we'll figure it out during the
> first incident", the recommendation should be MVC with a properly sized thread pool, which
> is boring and works.

#### Common Mistakes

- `StepVerifier...verify()` with no timeout, so a hung pipeline hangs the build.
- Testing a retry or timeout schedule with `Thread.sleep` instead of virtual time.
- Testing only the "happy path" of a reactive service — the error, retry, and
  timeout-fallback paths are where the value is.
- Reaching for `block()` in tests to make assertions easy and thereby testing a different
  code path from production.
- Treating a load test as unnecessary because the tests pass. Reactive behaviour *is*
  concurrency behaviour.

#### Interview Questions — Testing & Operations

**Q1. Why is `StepVerifier.verify()` called without a timeout a problem?** `TRICKY`

Because `verify()` blocks until the sequence terminates. If the pipeline never completes —
which is exactly what a bug in a `flatMap` or a missing `onErrorResume` produces — the test
thread hangs until the build's global timeout, producing a build failure with no useful
message. Passing a duration makes the test fail with a clear "expected complete, but timed
out" instead.

**Q2. What is virtual time for, and what does it buy beyond speed?** `TRICKY`

It lets a test advance a virtual clock instead of waiting, so an hours-long timer or retry
schedule is tested in milliseconds. The more important benefit is determinism: a
`Thread.sleep`-based test of a retry schedule is both slow and flaky under CI load, whereas
virtual time produces the same result every run.

**T1. A reactive endpoint is fast in tests and plateaus in production. What are the three
most likely causes?**

A blocking call on an event loop, which caps concurrency at the event-loop count — find it
with `BlockHound`. An unbounded `onBackpressureBuffer` or `Sinks` buffer, which trades
throughput for heap until it dies. And a missing connection pool sizing in a `WebClient` bean,
which turns concurrency into a queue and shows up as latency rather than as an error.

**D3. What would make you *not* adopt reactive for a new service?** `STAFF`

A CPU-bound workload, a team without reactive operational experience, a service dominated by
a blocking database driver with no reactive equivalent, or — most tellingly — a service
whose real constraint is throughput at a level threads handle comfortably. The tiebreaker is
whether the constraint is *connections held open* (which reactive solves) or *requests per
second* (which it usually does not). And the honest recommendation for a service that hasn't
measured either is to instrument first and decide second: it's entirely possible the answer
is MVC with a properly sized Tomcat pool and a tuned connection pool, which is boring,
debuggable, and ships.

> **CHAPTER 8 SUMMARY**
>
> `StepVerifier` is the reactive test tool and `verify()` must always take a duration, because
> a hung pipeline otherwise hangs CI rather than failing it. Virtual time tests hours-long
> retry and timeout schedules in milliseconds *and* deterministically, which matters more
> than the speed. And the operational table is the one that should decide the framework
> question: on an event loop a thread dump is near-unreadable, a stray blocking call stalls
> every request sharing that loop rather than one request, and CPU profiles are harder to
> attribute — so adopting reactive is adopting a different operational toolset, with a real
> staffing cost.

#### Further Reading

- [Project Reactor Reference — Testing](https://projectreactor.io/docs/core/release/reference/testing.html) — `StepVerifier`, virtual time, and the operator-level test utilities.
- [Spring Framework Reference — WebFlux Testing](https://docs.spring.io/spring-framework/reference/web/webflux/controller/ann.html) — `WebTestClient`, `@WebFluxTest`, and the slice-test setup.
- [BlockHound](https://github.com/reactor/BlockHound) — the tool that finds the blocking calls Reactor can't detect, and the README is explicit about which blocking calls Reactor does catch on its own.

---

### End of Volume 10

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain the Reactive Streams contract and what `request(n)` does and does not guarantee
- State what changes when you add `spring-boot-starter-webflux` to an app that already has
  Spring MVC, and why it isn't what most people expect
- Explain why `flatMap`'s default concurrency of 256 is a real operational number
- Describe why `retry(n)` without backoff and jitter causes a stampede, and how the
  multiplication compounds across a call chain
- Explain the `timeout(Duration, fallback)` trap precisely enough to debug it
- Say why `ThreadLocal` state is wrong by default in a reactive application and what
  replaces it
- Name the operational costs of running an event-loop application in production

### Coming in Volume 11 — Spring Cloud & Distributed Systems

Volume 10 was the last of the framework volumes. Volume 11 is where the machinery meets the
network: what a microservice actually costs, service discovery and configuration, the Spring
Cloud Gateway, the resilience patterns — circuit breakers, retries, rate limiters, bulkheads
that Volume 10's retry chapter assumed existed — distributed tracing, Saga and outbox and
CDC, service-to-service security, and the production antipatterns that most of those
patterns exist to mitigate.

## Chapter 9 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### The Reactive Model

**D1. Is backpressure "handled by the framework"?** `TRICKY`

Only for sources that can honour `request(n)` — iterables, ranges, database cursors, and the
Netty inbound read, which is precisely why TCP has a receive window. For sources that cannot
— Kafka consumers, hot publishers, anything already materialised in memory — backpressure has
to be inserted with `onBackpressureX`, and every one of those operators either buffers without
bound, drops silently, or errors. The honest answer names which operator and what it costs;
"it just buffers" is the answer that produces an OOM.

**D2. If reactive handles 100x the concurrency, why not adopt it everywhere?** `STAFF`

Because the 100x applies to connection-holding, I/O-bound, mostly-idle workloads, and it is
given up in exchange for a materially harder system to operate: thread dumps that are close to
unreadable, a stray blocking call that stalls an entire event loop instead of one request,
lost `ThreadLocal` state, and a persistence story that means leaving Hibernate. For a CRUD
service at 300 requests/second the thread model was never the constraint, so the trade buys
complexity and nothing else. The deciding measurement is whether the constraint is connections
held open or requests served.

**P1. A pod's heap grows until it's OOM-killed, and a heap dump shows a large byte array. What
are the two most likely causes?**

An unbounded `onBackpressureBuffer()`, and a `Sinks.many().multicast().onBackpressureBuffer()`
with no size. Both are unbounded heap growth by design when the producer outruns the consumer.
The second question is always *why is the consumer slow* — GC pressure, a slow downstream, a
cache-miss storm — because the buffer is usually a symptom of a consumer degradation that
should have been found first.

**T1. A cold `Flux` field is subscribed twice in one request. What happens?**

The pipeline executes twice, producing the data twice. A database-backed `Flux` means two
queries; a side-effecting pipeline means the effect happens twice. This is the most common
WebFlux N+1 and it is invisible in tests, which subscribe once.

**S1. A PR adds `.retry(3)` to a `WebClient` call. What is the review comment?**

That it retries immediately, without backoff or jitter, on every error including
non-transidempotent ones. Ask for `retryWhen(Retry.backoff(...).jitter(...).filter(...))` with
a transient-error filter, and ask whether the operation is safe to repeat at all. And ask
whether there's a circuit breaker — because retry is the wrong tool for a dependency that is
down rather than slow.

**D3. `Mono.zip(a, b).then(c)` looks like it avoids a round trip. Does it?** `TRICKY`

No. `.then()` is a sequencing operator, not a short-circuit — `a` and `b` are subscribed
concurrently, both must complete, their values are discarded, and then `c` runs. All three
execute. The distinction matters when someone reads `.then()` as "don't do the earlier work",
which is a very natural mistake and produces load, not savings.

### Reactor Core

**P2. An endpoint returns `Flux<Order>` and the client complains it got an array with one
element. What happened and should it change?**

`Flux` is for 0-to-N; a single-element result still serialises as a JSON array with a stream
content type. If the contract is 0-or-1, the return type is wrong — `Mono<Order>` is the
correct signature. The type is a contract that clients, metrics, and generated docs all read,
so this is worth fixing rather than papering over on the client.

**T2. Does a `Mono` built with `Mono.just(x)` execute `x`'s computation at assembly time?**

Yes — `Mono.just` captures the value, so any work done to produce it is already done. That's
why `Mono.just(fetchExpensiveThing())` executes eagerly and defeats the point. `Mono.defer(() ->
...)` defers both the construction and the computation.

**D4. If laziness is per-subscription, is caching a cold `Mono` field a good optimisation?**
`STAFF`

It changes semantics, not just cost. A cached `Mono` reuses one result for every subscriber
including ones that would have wanted fresh data, and it hides that from the type — a `Mono`
field looks lazy and behaves eager. The correct tool is a hot source (`share()` or
`cache()`) with a TTL, chosen deliberately, or a cache at the layer that actually has a
staleness policy. Silently caching a `Mono` field is the kind of change that ships, works,
and is wrong six months later when someone needs fresh data.

**S2. A reviewer sees `Flux.just(m1, m2, m3).flatMap(this::unwrap).collectList().block()`. What
is wrong?**

Three things. `flatMap` runs the three concurrently at 256 default concurrency, so if
`unwrap` is rate-limited downstream, the concurrency is the problem. `collectList()` requests
`Long.MAX_VALUE`, removing backpressure for the whole upstream chain. And `block()` inside a
request path occupies a thread — on an event loop it throws outright.

### Errors, Retries, Timeouts

**P3. An upstream dependency's request count spikes 4x exactly when it starts returning 503s.
What is the most likely explanation, and what is the second?**

Most likely: a client `retry(3)` with no backoff — one user request becomes four. Second: a
caller with a circuit breaker absent, so a failing dependency is hammered rather than failed
fast. Both are the same class of mistake: no retry budget and no fail-fast path. The
corrective work is to enumerate every retry policy in the system and know the total
amplification across a call chain.

**T3. `timeout(Duration.ofSeconds(2), Mono.just(FALLBACK))` where the source takes 1.5s and
the fallback construction takes 0.6s. What is emitted?**

`FALLBACK`. The 1.5s source completes before the 2s deadline, so the timeout never fires and
the fallback is never subscribed — the fallback's cost is irrelevant because the timeout
short-circuits. Now flip it: source takes 2.5s. The timeout fires at 2s, the fallback
`Mono.just` is immediate, and you get `FALLBACK`. The trap case is a *slow* fallback, where
the timeout measures the fallback with the same clock and you get a `TimeoutException` instead.

**D5. Is a circuit breaker a substitute for a retry policy, or a complement?** `STAFF`

A complement, and they fail in different modes. Retry handles *transient* failures — a brief
blip where the second attempt succeeds. A circuit breaker handles *sustained* failure by
failing fast for a window, which is what stops retries from amplifying an outage. Retry
without a breaker turns a dependency slowdown into an outage; a breaker without retry makes
a brief blip into a hard failure. The staff-level point is that they need a shared policy
owner, because the interaction between the two is where the amplification gets configured by
accident.

**S2. A PR adds a fallback that returns HTTP 200 with a degraded payload when the
downstream is unavailable. What should the reviewer push for?**

That the outage becomes invisible to alerting — dashboards stay green while users get
degraded data. A fallback should either be visibly distinct (a different status, a header, a
metric) or the degradation should be alerted on directly. Silent fallbacks are how a
dependency outage becomes a customer complaint rather than a page.

### WebFlux vs MVC

**P4. A team adds `spring-boot-starter-webflux` to speed up an app and nothing changes. What
happened?**

Boot's `WebApplicationType` deduction sees Spring MVC on the classpath and selects
`WebApplicationType.SERVLET`. The app is still servlet-based; `Mono`-returning controllers are
bridged and blocked on servlet threads. Reactive types exist, but there is no event loop and
no backpressure. Nothing got faster, and they paid the complexity cost of the reactive types.

**T4. A `block()` call appears deep in a WebFlux request. What is the exact failure?**

If it's on an event-loop thread, Reactor throws
`IllegalStateException: block()/blockFirst()/blockLast() are blocking, which is not supported in
thread reactor-http-nio-N`. If it's on a `boundedElastic` thread (because an earlier operator
scheduled there), it succeeds — and that's the more insidious case, because it works in
testing and consumes a thread per call under load.

**D6. Is `Schedulers.boundedElastic()` a legitimate fix for a blocking call?** `STAFF`

It's a legitimate bridge and a poor destination. It does stop the event loop from stalling,
which converts a global throughput plateau into a bounded pool of blocked threads — but the
thread is still consumed, and you have added a hop and a context switch. It's the right
interim measure during a migration, and the wrong steady state. The staff-level framing: use
it to buy time to replace the blocking dependency, and put a date and an owner on that.

**S3. A service is CPU-bound — image processing with 40 concurrent uploads. Would you
recommend reactive?** `STAFF`

No. The workload is CPU-bound, so the constraint is cores, and reactive doesn't add cores — it
removes threads and adds scheduling overhead, so it will be slower. The right design is a
bounded worker pool with backpressure at the queue, or an asynchronous job submission that
takes the work off the request thread entirely. Reactive earns its complexity on I/O-bound
fan-out, and its whole premise — many connections, little work each — is the opposite of this
workload.

### Reactive Persistence

**P5. A service migrated to R2DBC lost a feature. What's the most likely casualty?** `TRICKY`

Anything that depended on the ORM. R2DBC is a database API, not an ORM: entity mapping,
dirty checking, the persistence context, derived query methods, `Specification`, and
`@EntityGraph` are Hibernate features with no reactive equivalent. The migration cost is
re-implementing the object model by hand, which is a data-modelling project wearing a
persistence change's clothes.

**T5. A `Mono` built outside `tx.transactional()` and returned from inside it — does the
query join the transaction?**

No. The `Mono` was assembled at construction, and any eager operator ran then, outside the
transaction. Only deferred execution — `Mono.defer`, or a chain built inside the callback —
runs inside. The symptom is a write that commits outside the boundary while the code reads
as though it doesn't.

**D7. When is leaving JPA worth it?** `STAFF`

When you have a measured concurrency requirement that threads cannot meet, a query surface
simple enough not to need an ORM, and a team prepared to own the persistence layer. Absent
those, MVC + JPA + a correctly sized HikariCP pool is the better trade, and it is a stronger
answer to say so than to list R2DBC's advantages. The migration also needs a stated
rollback: object mapping and query logic have to be re-derived and tested, and that is a
quarter of work that doesn't show up in the migration ticket.

### Context Propagation

**P6. Logs from a WebFlux service have no trace ID on about half the lines. What's the cause
and the fix?**

`MDC` is `ThreadLocal`-backed, and Reactor moves work across threads, so the value set on the
request thread is absent when the operator runs. Enable Micrometer Context Propagation:
register a `ThreadLocalAccessor` for the MDC key and call
`Hooks.enableAutomaticContextPropagation()`. The half-and-half pattern is diagnostic — lines
emitted from the event-loop thread have the ID, lines emitted after a scheduler hop don't.

**T6. Does `InheritableThreadLocal` solve `ThreadLocal` propagation in Reactor?** `TRICKY`

No. It copies at *thread creation*, not at task submission. Every scheduler in Reactor uses a
pre-created pool, so the child thread was created long before the value was set, and the
inherited copy is whatever was there at pool warm-up. The correct mechanism is Reactor's
`Context`, which travels with the subscription.

**D8. Is enabling automatic Context Propagation globally a safe default?** `STAFF`

It's reasonable but it's global mutable state keyed by class name, so two teams registering
an accessor for the same key is a silent conflict. Own the registration in one bootstrap
configuration the whole application imports. And be explicit that the bridge exists to keep
existing `ThreadLocal` code working, not to license new `ThreadLocal` usage — new code should
take context as a parameter, because the whole point of the reactive model is that the
subscription is the right scope.

### Testing & Operations

**P7. CI hangs on a reactive test suite rather than failing it. What's the likely cause?**

`StepVerifier...verify()` with no duration, on a pipeline that never terminates — which is
exactly what a missing `onErrorResume` or a `flatMap` that swallows the terminal signal
produces. `verify()` blocks until the sequence ends, so the build's global timeout is what
eventually fires, with no useful message. Always pass a duration to `verify()`.

**D9. You have a choice between a hang in CI and a false failure in CI. Which is worse, and
what does that tell you about the test?** `STAFF`

A hang is worse, because it consumes the whole pipeline budget and reports nothing — the team
learns to ignore it, and the real signal is lost. The fix is that `verify()` takes a duration
so an incomplete sequence is a fast, legible failure with the expected-versus-actual
difference. The deeper point is that a test which can hang is a test whose failure mode hasn't
been designed, and reactive pipelines make that easy to overlook because nothing blocks
visibly.

**S3. A reactive service is in production and nobody can find a slow endpoint from a thread
dump. What should have been in place, and what would you do now?** `STAFF`

In place: Reactor Context propagation so the trace ID reaches every log line, and metrics
tagged by endpoint so the latency is attributable at all. Now: a JFR recording (event-loop
threads are sampled rather than blocked, so a parking or CPU profile finds what a thread
dump cannot), and `BlockHound` in a load test to locate the blocking call. The staff-level
conclusion to surface is that this is the operational tax of the model, and it should be
argued for explicitly before adoption rather than discovered during the first incident.
