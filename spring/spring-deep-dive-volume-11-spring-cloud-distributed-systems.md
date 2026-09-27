---
title: "The Spring Complete Deep-Dive"
volume: 11
series: "SPRING CLOUD & DISTRIBUTED SYSTEMS"
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
a connection pool, a thread pool, a registry lease, a circuit-breaker state machine — and
the notes always go down to that machinery, because that is the layer where production
incidents actually live.

Volume 11 is the last volume, and it is the one where the machinery meets the network. The
recurring frame is a single sentence: **a distributed system converts in-process bugs into
network-shaped ones, and every mitigation has an operational cost.** That means the
circuit breaker that saves your database also hides a genuine outage from your alerting, the
retry that makes a flaky call reliable is the same retry that turns a slowdown into a
stampede, and the service boundary that lets two teams ship independently is also the
boundary where a transaction stops existing. A candidate who can say those things plainly
sounds like someone who has operated the system rather than deployed it once.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto circuit-breaker
state transitions produces filler. The template is a completeness checklist, not a template
to fill.

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

### Continuing From Volume 10

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
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 (this book) | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 11

- Chapter 1 — The Microservices Trade-off
- Chapter 2 — Service Discovery & Configuration
- Chapter 3 — Spring Cloud Gateway
- Chapter 4 — Resilience Patterns (Resilience4j)
- Chapter 5 — Distributed Tracing & Observability
- Chapter 6 — Distributed Data Patterns
- Chapter 7 — Service-to-Service Security
- Chapter 8 — Production Antipatterns & the Org Causes Behind Them
- Chapter 9 — Interview Scenario Bank

---

# Part 11 — Spring Cloud & Distributed Systems

## Chapter 1 — The Microservices Trade-off

### 1.1 What a Service Boundary Actually Costs

Almost every microservices adoption story is told in the language of gains: independent
deployment, independent scaling, team autonomy, technology choice. All of those are real.
The interview question is not whether the gains are real — it's whether you can name the
costs at the same volume, because a candidate who only lists benefits is signalling that
they have read the conference talk and not run the system.

The costs, concretely:

1. **Every call becomes a network call with a distribution.** An in-process method call
   fails atomically and costs nanoseconds. An HTTP call can time out, can be refused, can
   return a 200 with a truncated body, can arrive twice, and costs 0.5–1ms in the same
   datacentre and 30–80ms across regions. You have traded a compile-time contract for a
   runtime negotiation.
2. **Partial failure becomes normal, not exceptional.** In a monolith, an exception means
   the request failed and the transaction rolled back. Across six services, the realistic
   outcome is that three succeeded and three didn't, and there is no rollback. Every
   business operation now needs a story for "what do we do about the half that worked".
3. **You lose ACID across the boundary.** The `@Transactional` machinery from Volume 4
   stops at the JVM. `REQUIRES_NEW` and `PROPAGATION_REQUIRES_NEW` cannot reach another
   service. Two services that both write on behalf of one business operation need a Saga,
   and a Saga is a distributed algorithm, not an annotation.
4. **The deployment and observability surface grows with each service.** Going from 1 to 20
   deployables is not 20 deploys — it's 20 pipelines, 20 sets of dashboards and alerts, 20
   sets of runbooks, 20 base images, and 20 ways to be on call. The observability bill alone
   is the most underestimated line item.
5. **The team-coordination cost is real and does not go away.** Conway's law is a
   description of an equilibrium, not an instruction. Splitting a codebase into services
   without splitting the organisation produces distributed code and centralised
   coordination — which is the distributed monolith in Chapter 8, and it is strictly worse
   than either pure option.

> **SCALING REALITY CHECK**
>
> A same-datacentre service-to-service HTTP call is roughly **0.5–1ms**; a cross-region call
> is **30–80ms**. Neither number is the problem. The problem is the chain: six *serial*
> dependencies at 20ms median each give you a **p50 of 120ms and a p99 closer to 600ms+**,
> because the p99 of a sum is approximately the sum of the p99s. The tail is where incidents
> come from, and the tail is entirely a consequence of how you arranged the calls, not how
> fast any one of them is.

That last number deserves to be internalised, because it is the single most useful piece of
arithmetic in this volume. A chain of six 20ms calls *feels* like 120ms. It is not. Each hop
has its own latency distribution with its own tail; the tails multiply as they add.

```text
SERIAL CHAIN — six hops, 20ms median each

  gateway → orders(20) → inventory(20) → pricing(20) → fraud(20) → email(20) → ledger(20)

  p50:  6 × 20ms  = 120ms      ← the number everyone quotes
  p99:  6 × ~100ms = 600ms+     ← the number users experience as "the site is down"
  p99.9: 6 × ~350ms = 2s+       ← the number that generates pages

PARALLEL — three independent, then join

  gateway → {inventory(20), fraud(20), pricing(20)} → join → email(20) → ledger(20)

  p50:  20 + 20 + 20 = 60ms     ← 2x better at the median
  p99:  ~100 + 20  = 120ms      ← 5x better at the tail
```

The parallel version does more work per request and is dramatically better at the tail,
because latency adds and parallelism does not. The cost is that a partial failure is now
*more* likely to be partial — which is exactly the trade Chapter 6's Saga patterns exist
to manage.

> **INTERVIEW TRAP**
>
> "Microservices give independent deployment and better scalability" is the true answer and
> it scores about half marks, because it names no cost. The staff-level continuation is: they
> convert compile-time failures into runtime ones, remove ACID across a business operation,
> and multiply the operational surface by the number of deployables — and the latency
> arithmetic is a *sum* of distributions, not a sum of medians, so serial chains produce
> p99s nobody budgeted for. The candidate who says "and here's what it costs" is the one
> who gets the follow-up question.

### 1.2 When a Modular Monolith Is the Right Answer

This section exists because the honest recommendation for a great many teams facing this
decision is **not to split**, and a candidate who can argue that convincingly demonstrates
judgment rather than enthusiasm.

A **modular monolith** is a single deployable in which the code is organised into modules
with enforced boundaries — Spring Modulith enforces them at compile time, ArchUnit at test
time — so that the *code* has service boundaries before the *runtime* does. The modules
cannot be extracted later without a rewrite, but they can be made genuinely independent
in reasoning, testing, and team ownership.

**The case for staying monolithic, honestly put:**

| Signal | Why it argues for a monolith |
| --- | --- |
| Fewer than 5 independent teams | Conway's law has no work to do. Splitting produces coordination, not autonomy. |
| One deployable ships fine | Independent deployment was never the bottleneck. |
| The domain is still changing | A boundary drawn today will be wrong by Q3. Boundaries drawn under uncertainty are expensive to move. |
| Data is one coherent model | Cross-entity invariants are the core of the product. Splitting the DB breaks them. |
| Latency budget is already tight | Adding hops to a synchronous path is a regression, not an architecture. |
| On-call is one rotation | You now have N services and one on-call. The services are the problem during an incident. |

Fowler's *MonolithFirst* is the canonical argument and it is well worth reading: the
dominant pattern in the industry is that teams write the monolith, hit a wall, extract
*one* boundary — the one the data and the team structure make most obvious — and find that
the extraction cost was lower than expected because the modular monolith had done the
preparation work. The counter-argument, in *MicroservicePremium*, is equally fair: a
migrated monolith often has **migrated-legacy** code with none of the distribution
properties of code written as a service, and the premium of writing something as a service
is paid once — so a team that will need a service eventually should write it as a service
from the start. The honest reconciliation is that *MonolithFirst* is advice about the
common case and *MicroservicePremium* is advice about the exception.

> **TRADE-OFF**
>
> The flip condition is team count, not codebase size. **Seven teams that will each own a
> service** is a genuine reason to split — seven teams coordinating a lockstep release is
> an org failure that no amount of modularity fixes. Three teams and a 400k-line codebase
> is not: that is a monolith with a build-time problem, and the answer is better build
> tooling, not seven deployables.

### 1.3 The Real Decision Inputs

Staff-level candidates name the actual decision inputs, and they are mostly *not*
technical:

```text
DOES THE TEAM TOPOLOGY JUSTIFY A BOUNDARY?
   7 teams, each with its own on-call and roadmap  ──►  YES, split
   3 teams, 2 of which touch the same code daily   ──►  NO

IS INDEPENDENT DEPLOYMENT NEEDED NOW?
   "We can't ship on Fridays"  ──►  the real problem may be the release process,
                                  not the architecture. Fix the process first.

DOES THE DATA SUPPORT THE BOUNDARY?
   Can the candidate service own its tables without a cross-service join in
   the request path? If not, you are building a distributed monolith.

WHAT IS THE LATENCY BUDGET?
   If the path already has 4 hops at 20ms, adding a 5th for organisational
   reasons needs a justification to the SRE, not a design doc.

IS THE BOUNDARY STABLE?
   Business capabilities churn. "Orders" was a module in 2021, a service in 2022,
   and three services in 2024 after the returns split.
```

> **MUST REMEMBER**
>
> The decision to split a service is driven by **team topology and independent deployment
> need**, not by the size of the codebase. Codebases get big for reasons that have nothing
> to do with deployability. "We have 400,000 lines" is not an argument for microservices;
> "we have six teams that cannot ship without coordinating" is.

### 1.4 The Migration Cost Nobody Puts in the Estimate

Extracting a service is **a data-migration project first and a code-move second**, and
teams that plan it the other way round consistently underestimate by an order of
magnitude. The reason is that the code is the easy part.

```text
CODE MOVE                        what people plan for
   ├─ move the class                    ← 2 days
   ├─ replace the direct call
   │  with a client                     ← 1 week, and it is now a network call
   └─ add a timeout                     ← 1 hour

DATA MOVE                        what actually takes the time
   ├─ who owns this table now?          ← an organisational negotiation
   ├─ who calls the new service on failure?
   ├─ what happens to the join in the request path?
   ├─ the FK from order_line to orders
   │  — now a cross-service consistency problem
   ├─ backfill, dual-write, cutover, verify
   └─ the rollback story if the cutover is wrong
```

A concrete worked example, because the shape matters more than the numbers. Extract
`OrderService` from a monolith that shares a database:

1. **Create the schema in the new service** with the tables it will own. Nothing changes
   yet.
2. **Dual-write.** Every write to the monolith's `orders` table also writes to the new
   service, via the outbox pattern (Chapter 6) — never a synchronous call inside the
   transaction, which is the classic dual-write bug.
3. **Backfill** historical rows into the new service.
4. **Verify.** Compare row counts and checksums. This step is skipped constantly and it
   is the step that saves you.
5. **Switch reads** behind a flag, per endpoint, with a metric on the new path.
6. **Stop writing to the old table**; leave it read-only for a retention window.
7. **Drop the table** — a month later, in a separate change, so the rollback window is
   real.

That is two to four months of work for one boundary. It is also, and this is the point,
the process that leaves you with a genuinely independent service rather than a service
that still joins across a network to a table you did not migrate.

> **STAFF-LEVEL CONSIDERATION**
>
> The migration plan is where most distributed-system projects quietly die, and the reason
> is organisational rather than technical: extracting a table requires deciding who owns
> it, and that conversation surfaces disagreements about product ownership that were
> previously invisible. Budget explicitly for the ownership negotiation, and get the
> data-ownership answer in writing *before* writing any code. A team that extracts a
> service and cannot say who is on the hook when its data is wrong has not finished the
> migration — it has just moved the ambiguity somewhere with a network hop in it.

#### Common Mistakes

- Listing only benefits. The interviewer is listening for the costs, and a candidate who
  gives none has either not operated the system or is not deciding.
- Quoting p50 as "the latency of the chain". The p99 of a sum is the sum of the p99s.
- Treating the microservices decision as a codebase-size question. It is a team-topology
  question.
- Planning an extraction as a code move, and discovering the data migration in week six.
- Assuming a service boundary drawn today survives. Business capabilities churn, and a
  wrong boundary is more expensive to move than no boundary.
- Believing that a shared database between "microservices" is a temporary state. In
  practice it is the permanent state, and it is the defining feature of a distributed
  monolith.

#### Interview Questions — The Microservices Trade-off

**Q1. What does a service boundary cost that a module boundary does not?** `STAFF`

Four things. Latency and a distribution rather than a point value — 0.5–1ms in the same DC
versus 30–80ms cross-region, with a tail that dominates: six serial hops at 20ms median
give a p50 of 120ms and a p99 over 600ms. Atomicity is gone, so partial failure is a
normal outcome and every business operation needs a compensation story. ACID no longer
crosses the boundary, so a two-service write needs a Saga. And the operational surface
multiplies by the number of deployables — pipelines, dashboards, alerts, runbooks, base
images, on-call rotations.

**Q2. When is a modular monolith the correct answer, and how do you argue for it?** `STAFF`

When there are fewer than about five independent teams, when one deployable already ships
without coordination, when the domain is still changing, when the data is one coherent
model with cross-entity invariants, and when the latency budget is already tight. The
argument is Conway's law in both directions: with three teams, a service split produces
coordination rather than autonomy and you get a distributed monolith, which is strictly
worse than either pure option. With seven teams that cannot ship without a lockstep
release, the monolith is the org failure and the split is the fix. The decision input is
team topology and independent deployment need, not codebase size.

**Q3. A team is extracting a service from a shared database. What is the actual order of
work, and what do people forget?** `STAFF`

Create the new schema; dual-write through an outbox rather than a synchronous in-transaction
call; backfill; verify with row counts and checksums; switch reads behind a flag per
endpoint with a metric; stop writing to the old table; drop it a month later. What people
forget is the ownership negotiation and the join. The foreign key from order_line to orders
becomes a cross-service consistency problem, and any query that joined those tables in the
request path now needs either a denormalised copy or an extra network hop. Budget two to
four months and treat it as a data project first.

**Q4. Six synchronous dependencies at 20ms median. What's the p50, and what's the real
problem?** `TRICKY`

p50 is 120ms. The real problem is the p99, which is closer to 600ms or worse, because the
p99 of a sum is roughly the sum of the p99s and every hop contributes its own tail. The fix
is not faster services — it is removing serial dependencies. Three calls in parallel plus a
join gives a p50 of 60ms and a p99 around 120ms, at the cost of making partial failure more
likely, which is then handled by the Saga machinery in Chapter 6.

**Q5. Is a codebase that is too big a reason to split into services?** `TRICKY`

No. Codebases get big for reasons unrelated to deployability — long-lived features, poor
modelling, generated code, a domain with genuinely many cases. A large codebase deploys
fine as one artefact. The question to ask instead is whether the *build and release* process
is the constraint, and if it is, fixing the pipeline is cheaper than splitting. If
independent deployability and independent scaling are the actual needs, the codebase size is
irrelevant to the decision.

> **CHAPTER 1 SUMMARY**
>
> A service boundary converts a compile-time contract into a runtime negotiation: latency
> becomes a distribution, partial failure becomes normal, ACID stops at the JVM, and the
> operational surface multiplies by the number of deployables. The arithmetic worth
> memorising is that six serial hops at 20ms median give a p50 of 120ms and a p99 over
> 600ms — the tail comes from arrangement, not from slowness. The decision to split is
> driven by team topology and independent deployment need, not codebase size, and for a
> large number of teams the honest recommendation is a modular monolith with enforced
> boundaries. When you do extract, it is a data-migration project first: dual-write through
> an outbox, backfill, verify, cut over per endpoint, and drop the old table a month later.

#### Further Reading

- [Microservices](https://martinfowler.com/articles/microservices.html) — the foundational essay; the section on how to find service boundaries is the one to read closely.
- [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) — the argument that most services should be extracted from a modular monolith, and the case against splitting by layer.
- [MicroservicePremium](https://martinfowler.com/bliki/MicroservicePremium.html) — the fair counter-argument, including why code written as a service from the start is a different thing from code extracted into one.
- [Microservices Patterns](https://www.manning.com/books/microservices-patterns) — the book-length treatment; the database-per-service and saga chapters repay the reading.

## Chapter 2 — Service Discovery & Configuration

### 2.1 Client-Side vs Server-Side Discovery

The question is a genuine fork, and the answer determines where the failure lives.

**Client-side discovery** — each client holds a list of known server addresses and does the
load balancing itself. The registry is a source of truth the client *pulls from*, not a
proxy it *calls through*.

```text
CLIENT-SIDE (Eureka / Spring Cloud LoadBalancer)

  ┌──────────┐   1. fetch instance list    ┌────────────────┐
  │ consumer │ ──────────────────────────► │   REGISTRY     │
  │          │ ◄────────────────────────── │  (Eureka,      │
  │  2. pick a                                                  │
  │     healthy │   3. call it directly                         │
  │     instance│ ─────────────────────────► ┌──────────┐    │
  └──────────┘                             │ provider │    │
                                           └──────────┘    │
       the client holds the LB logic, a cache of the list,
       and all the retry/health/zone logic that implies


SERVER-SIDE

  ┌──────────┐                            ┌──────────┐    ┌──────────┐
  │ consumer │ ──────────────────────────► │  load    │───►│ provider │ │
  │ (no LB   │                            │  balancer│    └──────────┘ │
  │  logic)  │                            └──────────┘                  │
  └──────────┘                            (knows health, does routing)
```

| | Client-side | Server-side |
| --- | --- | --- |
| Who does the balancing | The client | An intermediate hop |
| Extra hop in the data path | No | Yes — and it is a latency, a SPOF risk and a scaling concern |
| Where the retry logic lives | Every client library | One place |
| Knowledge of instance health | Cached and possibly stale | Live, if the LB health-checks |
| Client library needs | Discovery + LB | Just HTTP |
| Failure blast radius | The client's own cache | The balancer, for every client |
| Named examples | Eureka + `spring-cloud-loadbalancer` | Consul + a service mesh (Envoy), HAProxy |

The honest summary: **server-side removes a client library dependency and centralises
policy, at the cost of putting a hop in front of every request.** In a Kubernetes
environment the "server side" is usually the `kube-proxy`/service-mesh data plane, which
is why client-side libraries went quiet in the Kubernetes world — you are handed the
server-side behaviour for free.

> **INTERVIEW TRAP**
>
> "Spring Cloud uses Eureka, which is client-side discovery with Spring Cloud
> LoadBalancer." Half right — and the half that's wrong is the interesting half. **Ribbon
> is deprecated and removed**; `spring-cloud-loadbalancer` replaced it, and the current
> namespace is `spring.cloud.loadbalancer.*`, not `spring.cloud.discovery.client.*` for
> balancing concerns (that prefix is about the *discovery client* configuration, not the
> load-balancing algorithm). A candidate who still names `IClient`, `ServerList`, or
> `@RibbonClient` is answering from a 2018 blog post.

### 2.2 Eureka: The Lease Model and the Two Hard Problems

Eureka's model is a **lease**: the client registers, then renews the lease on a timer. If
the lease is not renewed within `lease-expiration-duration-in-seconds`, the server
**evicts** the instance. The client's `renewal interval` must be comfortably less than the
expiration — the default relationship is roughly 30s renewal against 90s expiration.

```text
  provider                                   registry (Eureka server)
     │                                              │
     │  1. POST /eureka/apps/{app}/{id}            │
     │     (register with metadata: zone, ip, port, │
     │      health-check URL, vip address)          │
     │ ───────────────────────────────────────────► │
     │                                              │
     │  2. PUT .../{id}  every 30s                  │
     │     (lease renewal / "heartbeat")            │
     │ ───────────────────────────────────────────► │
     │                                              │
     │  ... 90s pass with no renewal ...            │
     │                                              │  3. EVICT
     │                                              │     instance marked DOWN,
     │                                              │     removed from the registry
```

The design intent is *asymmetric*: the client pushes liveness, and the server decides. That
matters because the alternative — server polling each instance's health endpoint — turns
the registry into N connections per interval and gives you a registry that is slow to start
and slow to recover.

**Hard problem one: the registry is unreachable.** Every client caches its own copy of the
registry, refreshed on a timer. The standard resilience configuration is a single filter
that does three things:

```java
// A client filter that keeps stale data flowing when the registry is down.
public class StaleRegistryCacheFilter implements ClientRequestFilter, LoadBalancerClientFilter {

    @Override
    public ClientResponse filter(ClientRequest request, ClientRequestExecution execution) {
        // 1. on failure, serve the LAST GOOD registry snapshot from local cache
        // 2. when the snapshot ages past a threshold (seconds), drop instances entirely
        // 3. so the client fails fast rather than routing to a host that is gone
    }
}
```

```yaml
eureka:
  client:
    registry-fetch-interval-seconds: 5        # how often to re-fetch
    # the two numbers that decide the trade:
    #   enable-eureka-client-cache / cache responses
  instance:
    lease-renewal-interval-in-seconds: 30    # MUST be < expiration
    lease-expiration-duration-in-seconds: 90
```

The decision to state out loud: **yes, your service keeps serving with stale registry
data while the registry is down**, and that is the correct default. The alternative —
fail fast on registry unavailability — turns a discovery outage into a total outage of
every service that needs discovery. The bounded-staleness filter is what makes this
defensible: after a threshold, instances are dropped anyway, because routing traffic to a
host that has been dead for five minutes is worse than failing fast.

**Hard problem two: the split brain.** If the registry cluster partitions, half the
consumers keep talking to one half of the registry and the other half to the other. Both
halves now hold *incomplete* views, and both will route to instances that the other half
considers dead. This is not hypothetical — it is what happened during the 2021 AWS us-east-1
outage that took a large fraction of the Netflix-named internet down, and it is why Consul's
model is worth understanding.

| Registry | Consistency model | What a partition does |
| --- | --- | --- |
| Eureka (AP) | Eventual consistency; prioritises availability | Both halves serve; the registry has two divergent views |
| Zookeeper (CP) | Strong consistency via quorum | Minority side **stops serving**; availability is traded for a single truth |
| Consul | Configurable per-service, default consistent | Choose deliberately, per service, and know which you chose |
| Kubernetes DNS | Eventual, TTL-based | Stale entries persist for the TTL |

The real lesson is not "AP is wrong" — it is that **you must know which one you are running
and have decided what happens on a partition**, because the two models fail in opposite
directions and only one of them fails loudly.

> **PRODUCTION SCENARIO**
>
> Problem: at 09:14 the registry became unreachable from one availability zone; within
> minutes, checkout across three services returned 503 with `NoInstanceAvailable`.
> Investigation: the client cache filter was configured with a 0-second staleness window
> (a legitimate "fail fast" setting), so the moment the registry fetch failed, the local
> snapshot was discarded.
> Root cause: a discovery outage was converted into an application outage by a resilience
> setting that is correct in a different failure model.
> Solution: set a bounded staleness window (30–60s) so the last known good registry keeps
> serving, and alert on `eureka.client.refresh` failures separately from `5xx` rates.
> Prevention: the staleness window is now a per-environment setting owned by the platform
> team, with the reasoning written next to it, because it is a risk decision and not a
> default.

### 2.3 Consul — the Health-Check-Driven Model

Consul takes a different position, and the difference is a single idea: **the health check
is agent-driven and runs on the node, not on the server.** Each agent on a node runs the
registered check locally — HTTP, TCP, script, gRPC, TTL — and reports criticality to the
servers.

```yaml
# consul service definition
service {
  name = "orders"
  check {
    id        = "orders-liveness"
    http      = "http://localhost:8080/actuator/health/liveness"
    interval  = "10s"
    timeout   = "2s"
  }
  check {
    id        = "orders-readiness"
    http      = "http://localhost:8080/actuator/health/readiness"
    interval  = "10s"
    timeout   = "2s"
  }
}
```

Two things follow immediately, and both connect back to Volume 7 Chapter 7:

1. **The check must be the liveness check, not a composite health check.** This is the
   single most common registry misconfiguration. If the registry deregisters a service
   because *its database is slow*, the service is removed from every consumer's rotation
   and receives no traffic at all — so a partial dependency failure becomes a **zero-traffic
   outage**, and the instances that could still serve useful requests are taken out of
   service by a check that had no business evaluating that dependency.
2. **Liveness and readiness are different questions with different answers.** Liveness
   answers "is this process irreparably broken?" and failing it should restart the process.
   Readiness answers "should traffic come here right now?" and failing it should remove the
   instance from rotation *without* killing it. Registering liveness in the registry is
   correct; registering readiness as a deregistration trigger is a policy choice with a
   real cost — a slow database removes you from the load balancer, which is right for a
   service that cannot serve, and wrong for one that can serve most requests.

> **MUST REMEMBER**
>
> A service-discovery health check must be **liveness**, not a composite health check. A
> dependency failure should not deregister a service that can still serve useful traffic.
> Full readiness gating — taking an instance out of rotation for a slow database — is a
> deliberate policy with a measurable cost, not the default.

### 2.4 Spring Cloud LoadBalancer, and the Config That Replaced Ribbon

```yaml
spring:
  cloud:
    # DISCOVERY client configuration (which registry, how often to fetch)
    discovery:
      client:
        # eureka-specific settings live under spring.cloud.eureka
        healthcheck:
          enabled: true
    # LOAD BALANCING — this is the Ribbon replacement
    loadbalancer:
      health-check:
        initial-delay: 5s          # ping instances shortly after startup
        interval: 35s
      cache:
        enabled: true
        ttl: 35s
        capacity: 256              # Caffeine-backed; default 256 is low for big fleets
      retry:
        enabled: true
        max-retries: 3
        retry-on-status-code: 500, 502, 503, 504
        retry-next-service: false   # ← see the note below
      # replace the ServerList/IRule model
    config:
      fail-fast: true
```

```java
// Naming a specific service for injection — this is @LoadBalanced @Qualifier,
// and the modern replacement for the old @RibbonClient(name = "...") pattern.
@Bean
@LoadBalanced
public RestClient ordersRestClient(LoadBalancerClient lb) {
    RestClient client = RestClient.builder().build();
    return client;   // injected with @Qualifier("ordersRestClient")
}
```

Two settings that are non-obvious and matter:

- **`retry-next-service: false`** is the safe default and it is worth being able to justify.
  If a retry moves to a *different* instance, then a genuine application-level failure
  (a validation error being counted as a 5xx by a sloppy handler, a bug) gets retried on
  every instance, multiplying load exactly when you are least able to serve it. Retry on
  the *same* instance at least respects the state of the one thing that might be recovering.
- **`cache.capacity: 256`** is the default and it is per cache entry — a fleet with more
  than a few hundred services will evict entries and re-fetch. The symptom is periodic
  latency spikes on calls to infrequently-used services, which reads as "the registry is
  slow" and is actually a cache-sizing issue.

### 2.5 Config Server — and Why Config Is a Deploy

Spring Cloud Config Server externalises configuration into a git repository, a Vault, or a
JDBC backend. The modern bootstrap story matters because the legacy one still dominates
blog posts:

```yaml
# ── LEGACY: bootstrap.yml ───────────────────────────────────
# The application fetches config BEFORE the application context starts.
# Requires spring-cloud-starter-bootstrap and the bootstrap context.
spring:
  application:
    name: orders
  cloud:
    config:
      uri: https://config.internal
      fail-fast: true
```

```yaml
# ── MODERN: spring.config.import ────────────────────────────
# Same idea, expressed through the ConfigData mechanism introduced in Boot 2.4.
# No separate bootstrap context, no extra dependency, and it composes
# with everything else in the config data model.
spring:
  application:
    name: orders
  config:
    import: "configserver:https://config.internal"
  cloud:
    config:
      uri: https://config.internal
      fail-fast: true
      git:
        uri: https://github.com/acme/config
```

The real difference is the mechanism, not the syntax: `bootstrap.yml` requires a **separate
bootstrap application context** that exists only to fetch config, which means config
resolution happens before the main context exists — including before your
`@ConfigurationProperties` validation runs. `spring.config.import` brings the remote
config in as a `ConfigData` source in the normal, ordered resolution process, which is why
it composes with profiles, with the environment, and with everything else, and why it is
the one to reach for.

```yaml
management:
  endpoints:
    web:
      exposure:
        include: "refresh,health,info"    # /actuator/refresh to re-read config
  endpoint:
    health:
      show-details: when-authorized
```

**Config version compatibility is the hard problem.** A config change *is* a deploy — it
changes behaviour without changing code, and it changes behaviour in every instance that
re-reads config, which is a different blast radius than a code deploy. Three consequences
that teams discover the hard way:

1. **Rolling compatibility.** Service A is updated to understand a new `payment.timeout`
   property. Instances running the old code ignore it. That is fine. The problem is the
   *reverse*: remove or rename a property that new code expects, and half the fleet throws
   at startup — a config change is deployed through the same rolling process as code, and
   the two versions of the code are both live.
2. **Testing a config change.** There is no code review of a YAML file that can tell you
   whether the timeout is sane. The answer is to version config in git, require review, and
   run the same integration test suite against the candidate config as against a candidate
   build. Otherwise config is the only thing in your system that reaches production
   unobserved.
3. **Rollback.** `git revert` in the config repo and a `/actuator/refresh` is a much
   faster rollback than rebuilding an artefact — *if* the config repo is the source of
   truth. If values were edited by hand in a Consul KV store or a console, there is no
   rollback, and you have a configuration system that is not versioned at all.

> **MUST REMEMBER**
>
> **Config belongs in git, next to the application, reviewed and reverted like code.** A
> config change is a deploy that skips the build, and the systems that let you edit
> production values by hand — Consul KV, a cloud console — are the ones where the first
> incident is "who changed this and how do we undo it?"

**Encryption at rest.** Config Server can encrypt property values in the backing store and
decrypt them on fetch, using a symmetric key or a keystore:

```yaml
encryption:
  key: "{cipher}AQBx...base64..."     # symmetric — simple, but the key is a secret
  keystore:
    location: "file:/etc/acme/keystore.jks"
    alias: "configKey"
    password: "{cipher}..."
```

The honest staff-level note: Config Server's encryption protects the *values in the git
repository*. It does not protect them in transit unless the client is configured for TLS
to the server, and it does not protect them once they are in the running application's
memory. And symmetric encryption means the decryption key sits next to the application that
needs it — which is a much smaller blast radius than a shared database credential, but not
zero. Secrets with a real rotation story belong in a secret manager referenced by property,
not encrypted into a config repo.

> **SCALING REALITY CHECK**
>
> `spring.cloud.config.fail-fast: true` makes an application **refuse to start** when the
> config server is unreachable. That is the correct default for a stateless service that
> would otherwise start with wrong values, and it is genuinely dangerous for a service
> that would otherwise start with *last known good* values. Whichever you choose, it is a
> decision about whether "no config" means "don't serve" or "serve stale config" — and
> unlike most resilience settings, this one is made at startup, once, and it is not
> visible in any per-request metric.

#### Common Mistakes

- Naming Ribbon, `IClient`, or `@RibbonClient` as the current mechanism. They are removed;
  the namespace is `spring.cloud.loadbalancer`.
- Configuring the registry's health check to `/actuator/health` (the composite check).
  This deregisters a service whose database is slow, converting a partial failure into a
  zero-traffic outage.
- Assuming the registry being down means your services are down. The last-known-good cache
  exists precisely so it does not — and a 0-second staleness window turns it back around.
- Using `bootstrap.yml` + `spring-cloud-starter-bootstrap` in a new project. It still
  works and it is the wrong default now; `spring.config.import` composes with the modern
  config data model.
- Editing production config by hand in Consul KV or a console, which removes the rollback
  story and the audit trail in one move.
- Setting `retry-next-service: true` and wondering why a bug turns into a fleet-wide load
  spike.

#### Interview Questions — Discovery & Configuration

**Q1. Client-side vs server-side discovery, and what does the choice cost?** `STAFF`

Client-side means each client holds a list of known servers and does the balancing itself —
no extra hop, but every client carries the LB, retry, zone and health logic, and a bad
client library is a fleet-wide problem. Server-side puts a load balancer in the path: the
client needs only an HTTP library, retry and health policy live in one place, and health
can be live rather than cached — at the cost of an extra hop in every request, a new
scaling and SPOF concern, and a component that has to be as available as the sum of what
proxies through it. In Kubernetes, the mesh data plane gives you server-side behaviour
without an application dependency, which is why client-side libraries went quiet there.

**Q2. What happens when your service registry is unreachable, and what should it do?**
`TRICKY`

Clients cache the registry and refresh on a timer, so the default is to keep serving with
stale data — and that is the correct default, because failing fast on registry
unavailability turns a discovery outage into an application outage across every dependent
service. The defensible version is a *bounded* staleness window: serve the last known good
snapshot for 30–60 seconds, then drop instances so you fail fast rather than routing to a
host that has been dead for five minutes. A zero-second window is a legitimate choice in a
different failure model, but it is a decision about your failure model, not a default.

**Q3. Explain the split-brain case in service discovery, and what you do about it.** `ADVANCED`

If the registry cluster partitions, each half keeps serving with an incomplete view — Eureka
is AP, so both halves continue and the two sides route to instances the other side believes
are dead, which is what makes a discovery partition a mass-routing failure rather than a
clean one. Zookeeper is CP, so the minority side stops serving instead, trading availability
for a single consistent truth. Consul makes it configurable per service. The answer is not
that AP is wrong — it is that you must know which model you are running and have decided
what a partition does, because the two fail in opposite directions and only one fails
loudly.

**Q4. Why must a service-discovery health check be the liveness check?** `STAFF`

Because the check controls whether traffic arrives at all. A composite health check
evaluates dependencies, so a slow database marks the instance down and the registry
removes it from every consumer's rotation — the instances that could still serve useful
requests get zero traffic, and a partial dependency failure becomes a total one.
Liveness answers "is this process irreparably broken?"; readiness answers "should traffic
come here right now?". Registering liveness in the registry is correct. Using readiness as
a deregistration trigger is a policy choice with a real cost, and it should be made
deliberately per service.

**Q5. A config change is a deploy. What follows from that, operationally?** `STAFF`

Three things. Rolling compatibility: old and new code are both live during a rollout, so
removing a property that new code expects takes down the instances that have not been
updated yet — the config must be additive and version-tolerant, and properties get
deprecated, never deleted in the same change. Testability: a YAML file gets no code review
that can tell you whether a timeout is sane, so the candidate config should run against
the same integration suite as a candidate build. Rollback: `git revert` in the config repo
plus a refresh is the only fast path, and it only exists if config is in git next to the
app. If values were edited by hand in a KV store, there is no rollback.

**Q6. `bootstrap.yml` vs `spring.config.import` — what actually changed?** `TRICKY`

`bootstrap.yml` requires a separate bootstrap application context whose only job is
fetching config, which means resolution happens before the main context exists — including
before `@ConfigurationProperties` validation runs — and needs
`spring-cloud-starter-bootstrap`. `spring.config.import` brings the remote config in as a
`ConfigData` source in the normal ordered resolution process, composes with profiles and
the environment like every other config source, and needs no extra dependency. Same
concept, modern mechanism, and the legacy path is the one you should not reach for in a new
project.

> **CHAPTER 2 SUMMARY**
>
> Service discovery is a fork with a real cost on each side: client-side (Eureka plus
> `spring-cloud-loadbalancer`, no extra hop, LB logic in every client) or server-side (one
> policy, one health view, one more hop and one more SPOF). Eureka's lease model makes the
> registry unreachable a survivable event — clients serve last-known-good data under a
> *bounded* staleness window — while a registry partition is the genuinely dangerous case,
> and whether it degrades badly or cleanly depends on whether the registry is AP or CP.
> Ribbon is gone; `spring.cloud.loadbalancer` is the current namespace. The check that
> deregisters an instance must be liveness, not a composite health check, because a slow
> database otherwise becomes a zero-traffic outage. And config is a deploy: keep it in git
> next to the app, make changes additive, and use `spring.config.import` rather than the
> legacy bootstrap context.

#### Further Reading

- [Spring Cloud Commons Reference](https://docs.spring.io/spring-cloud-commons/reference/) — the discovery and `spring-cloud-loadbalancer` configuration surface, including cache and retry settings.
- [Spring Cloud Config Reference](https://docs.spring.io/spring-cloud-config/reference/) — the config server backends, the bootstrap-vs-import split, and the encryption options.
- [Service Registry pattern](https://microservices.io/patterns/service-registry.html) — the pattern independent of any particular product.
- [Consul documentation](https://www.consul.io/docs/intro/) — the agent-driven health-check model, and the consistency trade-off it makes explicit.

## Chapter 3 — Spring Cloud Gateway

### 3.1 Why It Is Reactive, and What That Costs You

Spring Cloud Gateway is built on Spring WebFlux, which means it runs on Reactor Netty's
event loops. This is not an implementation detail — from Volume 10, it means:

1. **The gateway's request-handling threads are event-loop threads.** Any blocking call in
   a filter — a JDBC query, a synchronous `RestTemplate` call, `Thread.sleep`, most legacy
   SDK clients — stalls every other request handled by that loop. With a handful of loops
   (Netty's default is roughly `2 × cores`), one blocking call degrades a large share of
   traffic at once. BlockHound, from Volume 10, is the tool that finds these.
2. **You cannot use servlet filters, `HttpServletRequest`, or anything from
   `spring-webmvc`.** A filter ported from an MVC application either does not compile or
   blocks.
3. **The gateway is a new programming model for the people who write filters**, which is a
   real adoption cost and the reason many teams' first custom filter caused an outage.
4. **Connection pooling is a Netty concern**, not a Tomcat thread pool concern, and
   defaults that were fine in MVC are not fine here.

```java
// CORRECT — a reactive filter. Nothing blocks the event loop.
@Component
public class LoggingFilter implements GlobalFilter, Ordered {

    private static final Logger log = LoggerFactory.getLogger(LoggingFilter.class);

    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        long start = System.nanoTime();
        return chain.filter(exchange)
                .doOnSuccess(v -> log.info("{} {} {}ms",
                        exchange.getRequest().getMethod(),
                        exchange.getRequest().getPath(),
                        (System.nanoTime() - start) / 1_000_000));
    }

    @Override
    public int getOrder() { return -1; }
}
```

```java
// WRONG — this is a servlet-era assumption and it will stall an event loop.
@Component
public class BrokenAuthFilter implements GlobalFilter, Ordered {
    @Override
    public Mono<Void> filter(ServerWebExchange exchange, GatewayFilterChain chain) {
        String header = exchange.getRequest().getHeaders().getFirst("Authorization");
        LegacyJwt.verify(header);            // does file I/O, or worse
        return chain.filter(exchange);
    }
}
```

### 3.2 Route Predicates

A route is `id` + `uri` + a list of predicates and a list of filters. A request matches the
route if **every** predicate matches.

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: lb://orders-service          # lb:// = resolve through discovery + LB
          predicates:
            - Path=/api/orders/**
            - Method=GET,POST
            - Header=X-Tenant, ^acme-.*$
            - Query=version, v2
            - Cookie=session, .+
          filters:
            - StripPrefix=2
            - AddRequestHeader=X-Gateway, edge-1
            - RewritePath=/api/orders/(?<seg>.*), /internal/orders/${seg}
          order: 0
```

| Predicate | Matches on | Typical use |
| --- | --- | --- |
| `Path` | URI path pattern | The workhorse: `/api/orders/**` |
| `Host` | `Host` header | Multi-tenant hosts, `*.acme.com` |
| `Method` | HTTP verb | Splitting reads from writes, or reserving verbs |
| `Header` | header presence or regex | Canary routing on `X-Canary`, tenant selection |
| `Query` | query parameter | Versioning, feature selection |
| `Cookie` | cookie presence or value | Session-affinity routing to a legacy tier |
| `Weight` | group name + integer weight | **Blue/green and percentage canary rollouts** — the one that earns its keep |
| `RemoteAddr` | client IP | Allowlists, geo-ish routing |
| `After` / `Before` / `Between` | time | Legacy, unscheduled deployments |

`Weight` deserves a note because it is the cleanest built-in canary:

```yaml
- id: orders-stable
  uri: lb://orders-service
  predicates:
    - Path=/api/orders/**
    - Weight=orders, 95
- id: orders-canary
  uri: lb://canary-orders
  predicates:
    - Path=/api/orders/**
    - Weight=orders, 5
```

Both routes share the group name `orders`; weights sum to 100. One flag changes the
percentage with no redeploy of the router — but note the consequence: **the split is
random per request, not sticky per user**, so a canary user gets a mix of both versions.
Sticky canaries need the `Cookie` predicate against a session identifier, and that is a
real design decision people discover after the first confused bug report.

### 3.3 Filters and Ordering

Filters come in two shapes: **route-scoped** (declared in the route's `filters` list) and
**global** (implementing `GlobalFilter`, applied to every request). `Ordered` controls
execution, and the ordering is not intuitive:

```text
REQUEST PHASE — lower order runs FIRST
  ┌────────────────────────────────────────────────────────────┐
  │ order  -100  RemoveRequestHeader  (mutate request)        │
  │ order    -1  your custom GlobalFilters (logging, tracing) │
  │ order     0  NettyWriteResponseFilter / routing begins    │
  │           ...  built-in filters at their declared orders  │
  │ order  10000  NettyRoutingFilter — the proxy call         │
  └────────────────────────────────────────────────────────────┘
RESPONSE PHASE — the same chain runs BACKWARDS, highest first
  order 10000 → 0 → -1 → -100
```

Within a route, the declared `filters` list runs in declaration order for the request
phase. The rule to hold: **filters that mutate the request must run before filters that
route, and anything that must observe the response must be low-ordered** so it runs late on
the way out.

| Filter | What it does | Note |
| --- | --- | --- |
| `StripPrefix=n` | Removes the first `n` path segments | The usual companion to `Path=/api/orders/**` |
| `PrefixPath=` | Adds a prefix | The inverse; rarely what you want behind an ingress |
| `AddRequestHeader` / `AddResponseHeader` | Sets a header | Useful for correlation IDs and version stamping |
| `RemoveRequestHeader` | Strips one | Strips internal headers before a request leaves the edge |
| `RewritePath` | Regex rewrite with named groups | `${seg}` substitution, as above |
| `SetPath` / `SetStatus` | Replaces path or status | Powerful and easy to abuse — see 3.6 |
| `RequestRateLimiter` | Token bucket per route | Section 3.5 |
| `Retry` | Retries on status/exception | Has a `series`/`methods`/`exceptions` filter |
| `CircuitBreaker` | Wraps the route in a breaker | Delegates to Resilience4j; see Chapter 4 for the threshold pitfalls |
| `RequestSize` | Rejects bodies over a limit | Cheap protection worth having on public routes |
| `ModifyRequestBody` | Rewrites the body | **The most dangerous filter in the list — see 3.6** |

### 3.4 CORS and the Preflight

CORS is a browser mechanism, and the preflight `OPTIONS` request is a request for
*permission*, not for data. Getting it wrong is the single most common gateway
misconfiguration: the actual API call works, and the browser still blocks the response.

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: lb://orders-service
          predicates:
            - Path=/api/orders/**
          filters:
            - StripPrefix=2
            # ONLY a CorsGatewayFilter on THIS route — not global
            - name: Cors
              args:
                allowedOriginPatterns: "https://*.acme.com"
                allowedMethods: "GET,POST,PUT,DELETE,OPTIONS"
                allowedHeaders: "*"
                allowCredentials: "true"
                maxAge: 3600
```

```java
// The route-scoped form, when the policy needs code rather than YAML.
@Bean
public CorsGatewayFilterApplicationListener corsListener() {
    return new CorsGatewayFilterApplicationListener(source -> {
        CorsConfiguration config = new CorsConfiguration();
        config.setAllowedOriginPatterns(List.of("https://*.acme.com"));
        config.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE", "OPTIONS"));
        config.setAllowedHeaders(List.of("*"));
        config.setAllowCredentials(true);
        config.setMaxAge(3600L);
        return config;
    });
}
```

The three mistakes, in order of frequency:

1. **No `OPTIONS` in `allowedMethods`.** The preflight fails and the browser never sends
   the real request.
2. **A global `CorsGatewayFilter` on routes that are not browser-facing.** Internal
   service-to-service calls do not need CORS, and advertising permissive CORS headers on
   an internal route is a genuine, if small, security regression.
3. **`allowedOrigins: "*"` together with `allowCredentials: true`.** The CORS spec forbids
   this combination; Spring's `allowedOriginPatterns` exists specifically so you can
   express "any subdomain" without the wildcard. Using `*` with credentials either fails
   or is silently downgraded, and either way nobody is sure which is happening.

> **PRODUCTION RELEVANCE**
>
> Gateway CORS is where "it works in Swagger" and "it fails in the browser" diverge,
> because Swagger UI is served from the same origin and does not issue a preflight. Any
> team that has only ever tested through the API explorer has never tested CORS. The
> symptom — a network error with no server-side log line for the actual endpoint — is
> genuinely hard to diagnose, which is why it belongs in a runbook.

### 3.5 Rate Limiting with `RequestRateLimiter`

```yaml
spring:
  cloud:
    gateway:
      routes:
        - id: orders
          uri: lb://orders-service
          predicates:
            - Path=/api/orders/**
          filters:
            - StripPrefix=2
            - name: RequestRateLimiter
              args:
                key-resolver: "#{@tenantKeyResolver}"
                redis-rate-limiter.replenishRate: 100       # tokens per second
                redis-rate-limiter.burstCapacity: 200       # bucket depth
                redis-rate-limiter.requestedTokens: 1
```

The `key-resolver` is an expression evaluated per request, typically a tenant header or a
user id. It returns the bucket key, and **the bucket is a token bucket**: tokens refill at
`replenishRate` per second up to `burstCapacity`, and a request consumes
`requestedTokens`.

```text
  replenishRate: 100/s      bucketCapacity: 200

  t=0    [■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 200 tokens]
         200 requests pass immediately (burst), 100/s thereafter
  t=0.1  [■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 190]
  ...
  t=1.0  [■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■■ 100]  ← back to steady state
```

Two configuration decisions that need stating out loud:

- **Where the bucket lives decides whether the limit is global or per-instance.** The Redis
  implementation is fleet-wide and correct. An in-memory `RequestRateLimiter` is per-JVM,
  so a 20-instance deployment behind one load balancer enforces 20× the limit you
  configured — the same trap Chapter 4 finds in Resilience4j's `@RateLimiter`, and the
  reason the Redis implementation is the default recommendation.
- **`burstCapacity` is the number that causes the incident.** A rate limit of 100/s with a
  burst of 200 lets 200 requests through instantaneously on an empty bucket, which is
  exactly the shape of a retry storm. If the intent is "smooth traffic", burst capacity
  should be close to the replenish rate; if the intent is "absorb a legitimate spike",
  set it consciously and know the number.

### 3.6 Where a Gateway Stops Being the Right Layer

This is the staff-level content, and it is the part most candidates skip because the
gateway is presented as a solution rather than a liability.

```text
┌──────────────────────────────────────────────────────────┐
│                    THE GATEWAY BOTTLENECK                │
│                                                          │
│  Every request in the system passes through ONE component.│
│  Its availability is the product's availability.          │
│  Its p99 is the product's p99.                            │
│  Its connection pool is the product's connection pool.    │
└──────────────────────────────────────────────────────────┘
```

The costs, concretely:

1. **It is a single point of failure and a shared bottleneck.** A gateway outage takes
   down *every* route through it, not one service. Scaling it is easy; making sure it is
   *never* the thing that fails is not, and it becomes the most heavily engineered
   component in the estate for exactly that reason.
2. **It becomes stateful the moment you add a rate limiter, a session, or a token cache**,
   and then it needs to be run in a stateful topology — sticky routing, replication, or
   externalising the state. A component that was stateless and horizontally scalable for
   years acquires an availability constraint.
3. **Every policy added there is global policy.** A rate limit, a header rewrite, or an
   auth rule added as a `GlobalFilter` applies to every team. Changing it for one team is
   a change to everyone, which means a release, which means a coordination cycle. The
   moment several teams want different policies, the global filter becomes a negotiation.
4. **Business logic placed there is logic nobody can deploy independently.** Aggregating
   three services' responses in a gateway `ModifyRequestBody` / `SetPath` chain, or
   computing a price in a filter, puts business behaviour in a component with a different
   owner, a different release cadence, and a different blast radius. It is the most
   natural place in the architecture to accidentally rebuild the thing you split up.

> **MUST REMEMBER**
>
> The gateway should be **small**: routing, auth termination, rate limiting, and
> observability. Business logic in a gateway is logic that cannot be deployed
> independently, cannot be unit-tested against its domain, and takes down every other
> team's traffic when it breaks.

**TLS termination.** The gateway is a reasonable place to terminate TLS for *external*
traffic — one certificate, one rotation, one hardening surface at the edge. For
*internal* service-to-service traffic, the increasingly common answer is that it should
not be: a service mesh handles mTLS between workloads, and terminating TLS inside the
perimeter just means re-encrypting immediately. The right question is not "is TLS
terminated in the gateway" but "who holds the identity of the calling workload", and the
modern answer is that it is the mesh (Chapter 7), not the router.

#### Common Mistakes

- Writing a servlet-style filter with a blocking call inside it, and taking down every
  request on that event loop when the dependency is slow. BlockHound finds these.
- Applying `CorsGatewayFilter` globally to routes that are not browser-facing, or pairing
  `allowedOrigins: "*"` with `allowCredentials: true`.
- Using an in-memory `RequestRateLimiter` in a multi-instance deployment and wondering why
  the observed rate is N times the configured one.
- Setting `burstCapacity` far above `replenishRate` and calling the result a rate limit.
- Adding aggregation or pricing logic to the gateway "because it's already there".
- Deploying **one** gateway instance. Every request in the product goes through it.
- Forgetting that a route's `filters` list runs in declaration order, and putting a
  mutation after a filter that already consumed the original value.

#### Interview Questions — Spring Cloud Gateway

**Q1. Why is Spring Cloud Gateway reactive, and what does that forbid?** `TRICKY`

Because it is built on Spring WebFlux and Reactor Netty, so requests are handled on event
loops rather than a thread pool. That forbids servlet filters, `HttpServletRequest`, and —
the important one — any blocking call in a filter. A JDBC query, a `RestTemplate` call, or
most legacy SDK clients will stall the loop, and with only a handful of loops per process
one slow dependency degrades a large share of traffic simultaneously. BlockHound finds
these at test time, and they are the most common cause of a gateway latency incident that
"only happens under load".

**Q2. `Path=/api/orders/**` with `StripPrefix=2` — what arrives at the service?** `TRICKY`

`/api/orders/123` becomes `/123` — `StripPrefix` removes exactly two leading segments
(`api` and `orders`), and the wildcard part is preserved as the remainder. The pairing to
get right is that the predicate matches on the *public* path and the service sees the
*internal* path, so a mismatch between the two is the classic "404 from the service, 200
from the gateway" symptom. If the service is not behind a context path, a missing
`StripPrefix` sends `/api/orders/123` straight through and nothing matches.

**Q3. Why does a canary via `Weight` produce mixed behaviour for a single user?** `ADVANCED`

`Weight` splits traffic randomly per request, not per user, so a user in the 5% canary
cohort sees the canary on some requests and stable on others. That is correct for a
statistical comparison and wrong for a user who is trying to report a bug about "the new
version". Sticky canaries need a deterministic key — usually the `Cookie` predicate on a
session identifier, or a header set by whatever already identifies the user — and that
choice has to be made before the canary, not after the first confused report.

**Q4. What is the difference between a global `CorsGatewayFilter` and a route-scoped one,
and when is each right?** `TRICKY`

A global filter applies to every request through the gateway; a route-scoped one applies to
that route only. Browser-facing public routes need CORS; internal service-to-service calls
do not, and advertising permissive CORS headers on an internal route is a small but real
security regression. The three classic failures are omitting `OPTIONS` from
`allowedMethods` (the preflight fails and the browser never sends the real request — which
Swagger will not reproduce, because Swagger is same-origin and issues no preflight), a
global filter applied indiscriminately, and `allowedOrigins: "*"` with
`allowCredentials: true`, which the spec forbids — `allowedOriginPatterns` exists so you
can express "any subdomain" without the wildcard.

**Q5. How does `RequestRateLimiter` work, and what is the configuration decision people
get wrong?** `STAFF`

It is a token bucket keyed by a SpEL `key-resolver` — typically a tenant or user header.
Tokens refill at `replenishRate` per second up to `burstCapacity`, and each request
consumes `requestedTokens`. Two decisions matter. First, where the bucket lives: an
in-memory implementation is per-JVM, so 20 instances behind one load balancer enforce 20×
the intended rate — the Redis implementation is fleet-wide and is the right default.
Second, `burstCapacity`: with a replenish rate of 100/s and a burst of 200, an empty
bucket lets 200 requests through instantaneously, which is precisely the shape of a retry
storm. If the goal is smoothing, burst should be close to the refill rate.

**Q6. When is a gateway the wrong layer entirely?** `STAFF`

When it needs business logic — because that logic then belongs to a component with a
different owner and a different blast radius, and cannot be deployed independently or
tested against its domain. Also when the gateway has become a shared bottleneck whose
availability is the product's availability, when a rate limiter or session has made it
stateful and it can no longer be trivially scaled, and when the policy surface has grown
until every team's change is a release for every team. The healthy gateway is small —
routing, auth termination, rate limiting, observability — and the discipline is to resist
adding the fifth thing because it is convenient.

> **CHAPTER 3 SUMMARY**
>
> Gateway is a reactive Netty proxy, which means the event-loop threading rules from
> Volume 10 apply: any blocking call in a filter degrades a large share of traffic at once,
> and BlockHound exists to find them. Routes are predicates (all must match) plus filters
> (declaration order within a route, `Ordered` across the chain, response phase running
> backwards), and `StripPrefix` is the pairing with `Path` that everyone gets wrong at
> least once. CORS belongs on browser-facing routes only, and needs `OPTIONS` in the
> allowed methods or it fails in a way Swagger will not reproduce. `RequestRateLimiter` is
> a token bucket whose fleet-wide-versus-per-instance behaviour depends entirely on where
> the bucket lives. The staff-level content is the limit: the gateway should be small, and
> business logic placed there is logic nobody can deploy independently.

#### Further Reading

- [Spring Cloud Gateway Reference](https://docs.spring.io/spring-cloud-gateway/reference/) — the authoritative list of predicates, filters, and their default orders.
- [Spring Framework Reference — WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html) — the reactive stack the gateway is built on, for the threading rules.
- [Envoy circuit breaking documentation](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/circuit_breaking) — a different implementation of the same patterns, useful for seeing what is framework-independent.

## Chapter 4 — Resilience Patterns (Resilience4j)

Volumes 3 and 10 both deferred this: Volume 3's retry budget and Volume 10's
`retryWhen` stampede analysis both assumed a circuit breaker existed upstream. This is
the chapter that pays that debt, and the single most valuable practical point in it is
that **decorator order is not cosmetic** — the same two annotations in the other order
produce a materially different system.

### 4.1 The Circuit Breaker State Machine

```text
                    failures ≥ failureRateThreshold
                    over the last slidingWindowSize calls
   ┌──────────┐ ──────────────────────────────────────────────► ┌──────┐
   │  CLOSED  │                                                   │ OPEN │
   │ (normal) │ ◄─────────────────────────────────────────────   │      │
   └──────────┘   permittedNumberOfCallsInHalfOpenState          └──────┘
        ▲           all succeed ──► back to CLOSED                     │
        │                                                               │
        │  after waitDurationInOpenState                               │
        │  has elapsed                                                 │
        │  ◄──────────────┐                                           │
        │                 │                                           ▼
        │          ┌───────────┐   any failure
        └──────────│ HALF_OPEN │◄──────────────────────────────   (immediately
                   │ (probing) │                                   back to OPEN)
                   └───────────┘
                        │ any failure → OPEN immediately
                        │ all succeed → CLOSED

  CLOSED    : calls pass through; failures counted in a sliding window
  OPEN      : calls fail IMMEDIATELY, no network call at all, for waitDurationInOpenState
  HALF_OPEN : a limited number of probe calls allowed through; a single failure
              re-opens the breaker immediately
```

The state that matters most is `OPEN`, and the thing people get wrong about it is what
"fail fast" means. **While the breaker is open, no request reaches the failing service.**
Not a reduced rate — zero. The caller gets an exception immediately, and it is the
caller's problem now.

```yaml
resilience4j:
  circuitbreaker:
    instances:
      orders-service:
        # ── the sliding window: how many recent calls the decision is based on
        sliding-window-type: COUNT_BASED            # or TIME_BASED
        sliding-window-size: 100                    # last 100 calls
        minimum-number-of-calls: 20                 # ← THE ONE THAT MATTERS
        failure-rate-threshold: 50                  # % failures to open

        # ── the open state
        wait-duration-in-open-state: 10s            # how long before probing
        automatic-transition-from-open-to-half-open-enabled: true
        permitted-number-of-calls-in-half-open-state: 10

        # ── slow calls count as failures if enabled
        slow-call-rate-threshold: 80                # % of calls slower than...
        slow-call-duration-threshold: 2s            # ...this
```

**The misconfiguration that causes most incidents:** `failure-rate-threshold` is only
evaluated once at least `minimum-number-of-calls` calls have been recorded in the window.
Below that, the breaker cannot open, no matter how bad the failure rate is. Set
`sliding-window-size: 100` with `minimum-number-of-calls: 20` and you have correctly
prevented the breaker reacting to two unlucky calls. Set `sliding-window-size: 10` with
`minimum-number-of-calls: 20` and the threshold **can never be met** — the breaker is
permanently closed, silently, and a whole resilience mechanism is doing nothing at all.

```text
  slidingWindowSize: 100, minimumNumberOfCalls: 20
  ├─ 1–19 calls   → breaker cannot decide, stays CLOSED (correct)
  └─ 20–100 calls → failure rate evaluated, opens at ≥ 50%

  slidingWindowSize: 10, minimumNumberOfCalls: 20     ← BROKEN
  └─ window never reaches 20 → threshold never evaluated → breaker NEVER opens
```

> **MUST REMEMBER**
>
> **`minimumNumberOfCalls` gates `failureRateThreshold`.** A failure rate below the
> minimum number of calls is not "a low failure rate" — it is *no measurement*. Every
> breaker configuration should be sanity-checked against: how many calls must occur before
> the threshold is even evaluated, and how long is that at my p50 rate?

### 4.2 Why a Badly-Configured Breaker Takes Down More Traffic

This is worth stating precisely, because it is counter-intuitive and it is the
counter-argument to reflexively adding breakers.

A dependency is degrading. It is slow, and under load some calls are failing — say 30% of
requests return 500, and the rest take 2 seconds. That is a *degraded* service, not a down
service. A well-behaved caller would shed load smoothly: some users wait, some get an
error, and the dependency keeps enough throughput to recover.

Now put a mis-tuned breaker in the path. It opens after 20 calls at a 50% failure
threshold. While open, **every call fails instantly** — including the 70% that would have
succeeded. The effective success rate of the whole path goes from ~70% to 0%. The callers
that would have degraded gracefully now hard-fail, and because the failure is *fast*, the
breakers in *their* callers trip too, and you get a cascade: a single slow dependency
producing a fleet-wide error in seconds, with a trace that shows every service returning
errors in under 5ms.

```text
  Degraded dependency: 30% failures, 70% slow-but-succeeding

  WITHOUT a breaker:  success rate 70%, latency high, dependency RECOVERS
                      ────────────────────────────────────────────────►
                       t=0        t=5s        t=10s       t=15s
                       70%        70%         70%         95%   ← getting better

  WITH a mis-tuned breaker that opens at 50%:

  t=0    30% failures, breaker CLOSED, degrading
  t=3s   breaker OPEN  →  100% failure  (the 70% that would have worked now 404 instantly)
  t=13s  HALF_OPEN, probes fail, back to OPEN
  t=23s  HALF_OPEN, probes fail, back to OPEN
  ...    the breaker is now AMPLIFYING the outage
```

The correct tuning is a **high** `failureRateThreshold` (75–90%, not 50%) combined with a
**meaningful `minimumNumberOfCalls`** (100+, not 20) and a **`waitDurationInOpenState`
long enough that a genuinely recovering dependency has a chance**. The breaker's job is to
protect a *completely* dead dependency, not to trim the tail off a slow one — slow calls
are handled by timeouts and by the `slowCallDurationThreshold` configuration, which lets
you open on latency without waiting for errors to appear.

### 4.3 `@Retry` and the Retry Budget

```java
@Retry(name = "payment", fallbackMethod = "cachedResult")
public Receipt charge(Card card, long amount) { ... }
```

```yaml
resilience4j:
  retry:
    instances:
      payment:
        max-attempts: 3                    # 1 original + 2 retries
        wait-duration: 200ms
        enable-exponential-backoff: true
        exponential-backoff-multiplier: 1.5   # 200ms → 300ms → 450ms
        enable-randomized-wait: true          # jitter
        randomized-wait-factor: 0.5
        retry-exceptions:
          - java.net.ConnectException
          - java.util.concurrent.TimeoutException
        ignore-exceptions:
          - com.acme.PaymentDeclinedException    # ← a decline is not retryable
```

**Why a retry without a breaker is dangerous**, stated in terms of the multiplication
Volume 10 established. A retry multiplies load on a dependency that is already
struggling. Three retries at three layers of a call chain means a single user request can
generate 27 calls downstream — and the amplification is on the *failing* component, which
is the one with no spare capacity. Retries without backoff, without jitter, and without a
breaker turn a 2× slowdown into a 27× load increase on the component that is least able to
absorb it. This is the mechanism behind every retry storm in production.

**And backoff without jitter is a stampede, not a fix.** If every client that failed at
t=0 retries at t=200ms, they all arrive together. Jitter is not an optimisation; it is the
mechanism that spreads the retries.

**The `ignore-exceptions` list is the part that is usually missing.** Retrying a business
rejection — a declined card, a validation failure, a 404 — multiplies load for a response
that will never change. Retries should be for *transport* failures, and the exception
taxonomy has to be written down or the framework will retry everything that is an
`Exception`.

### 4.4 `@RateLimiter` — the Arithmetic That Surprises People

```java
@RateLimiter(name = "search")
public List<Result> search(String query) { ... }
```

```yaml
resilience4j:
  ratelimiter:
    instances:
      search:
        limit-for-period: 10            # permits per period
        limit-refresh-period: 1s
        timeout-duration: 0             # 0 = fail immediately rather than queue
```

```text
  limitForPeriod: 10, limitRefreshPeriod: 1s

  configured on ONE service with 5 instances:

      instance 1  ── 10 rps
      instance 2  ── 10 rps
      instance 3  ── 10 rps      ═══►  FLEET-WIDE: 50 rps
      instance 4  ── 10 rps
      instance 5  ── 10 rps

  scale that service to 50 instances during Black Friday:

      50 instances × 10 rps  =  500 rps   against a downstream that
                                           was never sized for 500
```

**Resilience4j's rate limiter is per-instance and in-memory, and the configured number is
not the number your system enforces.** Scale out, and the limit scales with you — the
opposite of what a rate limiter is for. Two fixes: distribute the limit externally (Bucket4j
with Redis, or a gateway-level limiter, which is a global bucket by construction), or
divide: if the fleet is N instances and the target is R total, configure `R/N` and
recompute on every scale event — which is fragile and is the argument for the external
bucket.

> **SCALING REALITY CHECK**
>
> A downstream service that can absorb 50 rps, fronted by a Resilience4j `@RateLimiter`
> configured at 10 rps on 5 instances, offers **no protection whatsoever** until the fleet
> exceeds 500 instances. The protection is not partial in a visible way — it looks like it
> is working, right up until the day you scale out, which is precisely the day you needed
> it.

### 4.5 `@Bulkhead` — Pool vs Semaphore

The bulkhead name comes from ship compartments: damage in one holds is contained. Two
implementations, and the difference is not stylistic.

| | Thread-pool isolation | Semaphore isolation |
| --- | --- | --- |
| Limit is on | Threads (a bounded `ExecutorService`) | Permits (a `Semaphore`) |
| A slow/hung call | Blocks a **dedicated** thread; other calls unaffected | Holds a **permit** and blocks the caller |
| Consequence of a hung dependency | The pool's own threads exhaust — **and it contains the damage**, because the other bulkhead's pool is separate | Permits are held until timeout, so the bulkhead fills and **rejects** new calls — it still sheds, but it sheds by rejection, and every rejected call pays a full call's worth of delay first |
| Thread cost | One thread per concurrent call (1MB stack each) | None |
| Use when | The call can genuinely hang and you need hard isolation | Calls are short, latency-bound, and the bulkhead is really a concurrency cap |

```java
@Bulkhead(name = "externalPayment", type = Bulkhead.Type.THREADPOOL)
public Receipt charge(Card card, long amount) { ... }

@Bulkhead(name = "reporting", type = Bulkhead.Type.SEMAPHORE)
public Report generate(Order order) { ... }
```

**Why pool isolation contains a hung dependency and semaphore isolation does not.** With a
thread pool, the bulkhead's threads are *dedicated to that dependency*. If the dependency
hangs, those threads block — and only those. Calls to the other bulkheads use different
threads and are unaffected. With a semaphore, the caller threads are shared. A hung
dependency holds its permits; the semaphore fills; new calls are rejected — and the
rejection is a *fast* failure, which sounds better, but the permits are only released when
the call returns or times out, so the bulkhead stays saturated for as long as the
dependency hangs, and the blast radius is every caller sharing those threads.

The costs, which is why pool isolation is not the default answer:

- **A thread per concurrent call.** 50 concurrent calls is 50 threads; at Tomcat's default
  ~1MB stack that is ~50MB of stack in a bulkheaded service, plus the scheduler overhead.
  Set `maxThreadPoolSize` deliberately, because it is also your maximum concurrency.
- **A pool that starves if the limit is set too low.** The bulkhead is a hard ceiling on
  throughput. Set it to 10 and a 30-rps service cannot serve more than 10 concurrent calls,
  so its p99 becomes queueing delay in your own bulkhead — an outage you built yourself.
- **Both types need the timeout to be set.** A bulkhead without a timeout is a queue with
  no drain, which is the same problem wearing a different name.

### 4.6 `@TimeLimiter` and Why It Is Not a Timeout

```java
@TimeLimiter(name = "reports", fallbackMethod = "cachedReport")
public Mono<Report> generateAsync(Order order) { ... }   // MUST return a CompletableFuture/ Mono
```

`@TimeLimiter` does not speed anything up. It imposes a **deadline on the caller**: if the
annotated method has not completed within the configured duration, the *caller's* future
completes exceptionally. The underlying work keeps running.

| | `@TimeLimiter` | `@Bulkhead` (thread) | Client timeout |
| --- | --- | --- | --- |
| Limits | How long the **caller** waits | How many run **concurrently** | How long the **socket** waits |
| Under a hang | Caller fails fast; work leaks in the background | Threads exhaust and calls are rejected | Connection abandoned; work leaks |
| Alone, is it enough? | No | No | No |

They are complementary, and using one without the others is the common mistake. A
`@TimeLimiter` with no bulkhead means N concurrent callers all start work and then N
callers time out while the work continues — so the system is doing full production load
and reporting failure, which is the worst of both worlds.

### 4.7 Composition — and Why Order Is the Whole Point

This is the highest-value practical point in the chapter.

```java
// ── WRONG ORDER: @Retry OUTSIDE @CircuitBreaker ──────────────────
// Every retry attempt is a separate call the breaker SEES.
// 3 attempts all failing → the breaker counts 3 failures per user request.
// The breaker opens 3x faster than the failure rate implies.
@Retry(name = "payment")
@CircuitBreaker(name = "payment", fallbackMethod = "cachedCard")
public Receipt charge(Card card, long amount) { ... }


// ── RIGHT ORDER: @CircuitBreaker OUTSIDE @Retry ────────────────
// The breaker sees ONE logical call. Retries happen inside the breaker.
// The failure rate reflects user-visible failures, and the breaker
// protects the dependency from the retry amplification.
@CircuitBreaker(name = "payment", fallbackMethod = "cachedCard")
@Retry(name = "payment")
public Receipt charge(Card card, long amount) { ... }
```

```text
  @Retry OUTSIDE @CircuitBreaker          @CircuitBreaker OUTSIDE @Retry

  user req      user req                    user req
     │             │                           │
  ┌──▼──┐       ┌──▼──┐                     ┌──▼──┐
  │ RETRY│──1──▶│ CB  │──fail              │ CB  │──1──▶┌───────┐
  │     │──2──▶│    │──fail              │    │──2──▶│ RETRY │──1──▶dep
  │     │──3──▶│    │──fail              │    │──3──▶│       │──2──▶dep
  └──┬──┘       └──┬──┘                  └──┬──┘  └──┬───┘──3──▶dep
     │            │ 3 failures counted       │        │
     │            │ for ONE request          │        │ ONE failure counted
     ▼            ▼                         ▼        ▼ for ONE request
  opens 3x      (rate inflated)           (rate accurate,
                                           amplification contained)
```

The general rule, stated so it generalises: **the breaker goes outermost, because its job
is to protect the dependency from everything happening inside it.** Anything that makes
more than one call — a retry, a loop over shards, a `flatMap` fan-out — belongs *inside*
the breaker, or the breaker will count amplification as failure and open on a system that
is not as broken as it looks.

The other composition rules:

| Combination | Rule |
| --- | --- |
| `@Retry` outside `@CircuitBreaker` | Wrong. Amplification counted as failure; breaker opens 3× too fast. |
| `@CircuitBreaker` outside `@Retry` | Correct. One logical call; amplification contained. |
| `@TimeLimiter` outside `@CircuitBreaker` | Correct. The deadline applies to the whole protected call including retries. |
| `@Bulkhead` outermost | Correct. Limits concurrency before any work is admitted. |
| `@RateLimiter` + `@Retry` | Fine, but note the rate limiter is per-instance (4.4) and the retry still multiplies downstream load. |

**And the fallback problem.** `fallbackMethod` is the escape hatch that hides outages
from alerting:

```java
private Receipt cachedCard(Card card, long amount, Throwable t) {
    // Returns a Receipt built from the last successful charge.
    return lastKnownReceiptRepository.find(card.fingerprint())
            .orElseThrow(() -> new PaymentUnavailableException());
}
```

If the fallback returns a *success-shaped* response, then from the alerting system's
point of view nothing failed. The circuit breaker is open, every call is being served
from cache, the error rate is 0%, and the business is quietly serving stale or wrong
answers to users. **The failure must remain visible in a metric even when the fallback
succeeds** — count fallbacks as a first-class metric, and alert on the fallback rate, not
only on the 5xx rate. A fallback that returns an error-shaped response makes the outage
visible; a fallback that returns a success-shaped one makes it invisible, and invisible
outages last longer.

> **PRODUCTION RELEVANCE**
>
> The pattern teams converge on: a fallback that returns *degraded but usable* data
> (a cached price, a partial search result) plus a `resilience4j.circuitbreaker.calls`
> breakdown and an explicit `fallback.invoked` counter with an alert on it. The
> degradation is a product decision and the alerting is an engineering one, and they have
> to be made together — otherwise the product decision silently removes the engineering
> signal.

#### Common Mistakes

- `slidingWindowSize` smaller than `minimumNumberOfCalls`, so the failure threshold is
  never evaluated and the breaker is permanently closed while appearing configured.
- `failureRateThreshold: 50`, which opens on a *degraded* dependency and turns a partial
  failure into a total one. Thresholds belong at 75–90%.
- `@Retry` outside `@CircuitBreaker`, so retries are counted as failures and the breaker
  opens three times faster than the failure rate implies.
- Retrying business rejections. A declined card retried three times is three times the
  load for a response that will never change.
- Backoff without jitter — which resynchronises every client that failed at the same
  instant.
- `@RateLimiter` at a per-instance value, mistaken for a fleet-wide one.
- `@Bulkhead(type = THREADPOOL)` with `maxThreadPoolSize` set too low, converting a
  throughput problem into self-inflicted queueing.
- `@TimeLimiter` with no bulkhead: the caller fails fast while the underlying work keeps
  running at full production load.
- A `fallbackMethod` returning a success-shaped response, with no fallback-rate metric, so
  the outage is invisible to alerting.

#### Interview Questions — Resilience Patterns

**Q1. Walk through the circuit-breaker state machine, and say what each state's
transitions depend on.** `TRICKY`

`CLOSED` is the normal state: calls pass through and failures are recorded in a sliding
window (count-based or time-based). When at least `minimumNumberOfCalls` have been
recorded and the failure rate reaches `failureRateThreshold`, it moves to `OPEN` and every
subsequent call fails immediately with no network call at all, for
`waitDurationInOpenState`. After that, it moves to `HALF_OPEN`, where at most
`permittedNumberOfCallsInHalfOpenState` probe calls are allowed through. All probes
succeeding returns it to `CLOSED`; a single failure sends it straight back to `OPEN` and
restarts the wait. Slow calls can be counted as failures via
`slowCallDurationThreshold` and `slowCallRateThreshold`, which is how you protect against
latency rather than only against errors.

**Q2. Why is `minimumNumberOfCalls` the setting that causes the most incidents?** `STAFF`

Because the failure rate is meaningless below it — not "low", *unmeasured*. A breaker with
`slidingWindowSize: 100, minimumNumberOfCalls: 20` correctly refuses to react to two
unlucky calls. A breaker with `slidingWindowSize: 10, minimumNumberOfCalls: 20` can never
reach the minimum, so the threshold is never evaluated and the breaker is permanently
closed — silently, while looking correctly configured. Every breaker config should be
checked for how many calls must occur before a decision is even possible, and how long
that takes at the service's actual request rate.

**Q3. Explain how a badly-tuned circuit breaker can cause a worse outage than having no
breaker.** `STAFF`

A dependency is degrading — 30% errors, 70% slow-but-succeeding. Without a breaker, the
success rate is 70% and it recovers. A breaker tuned at a 50% threshold opens after 20
calls, and while open **every** call fails instantly — including the 70% that would have
succeeded — so path success goes to zero in seconds. Because the failures are fast, the
breakers in the callers trip too, and a single slow dependency becomes a fleet-wide error
whose traces show every service failing in under 5ms. The breaker should protect a dead
dependency, not trim a slow one: high threshold (75–90%), a meaningful minimum number of
calls, and a `waitDurationInOpenState` long enough for a recovering dependency to prove
itself. Slow calls are the job of timeouts and `slowCallDurationThreshold`.

**Q4. `@Retry` outside `@CircuitBreaker` versus the reverse — what changes?** `ADVANCED`

With `@Retry` outermost, each retry is a separate call the breaker observes, so three
attempts count as three failures for one user request and the breaker opens roughly three
times faster than the real failure rate — it opens on a system that is not as broken as it
looks. With `@CircuitBreaker` outermost, the breaker sees one logical call, retries happen
inside it, the failure rate reflects user-visible failures, and the breaker's real job —
containing retry amplification against the dependency — is actually performed. The
general rule: the breaker goes outermost, because its purpose is to protect the
dependency from everything inside it, and anything that makes more than one call belongs
inside the breaker.

**Q5. Why is a per-instance rate limiter a trap?** `TRICKY`

Because the configured number is not the number the system enforces. `@RateLimiter` with
`limitForPeriod: 10, limitRefreshPeriod: 1s` is 10 rps *per JVM*: five instances enforce 50
rps, and scaling to fifty instances for a traffic event enforces 500 rps against a
downstream that was never sized for it. The protection is invisible until the moment you
need it. The fix is to distribute the limit externally — Bucket4j with Redis, or a
gateway-level limiter, where the bucket is global by construction — or to divide the
target by the instance count and recompute on every scale event, which is fragile and is
the argument for the external bucket.

**Q6. Thread-pool vs semaphore bulkhead — when does the difference actually matter?** `STAFF`

It matters when a dependency *hangs*. With thread-pool isolation the bulkhead's threads
are dedicated to that dependency, so a hung call blocks only those threads and other
bulkheads are unaffected — the damage is contained by construction. With a semaphore, the
caller threads are shared; the hung call holds its permits until it times out, the
semaphore stays saturated for the duration of the hang, and new calls are rejected after
already paying a full call's worth of delay. Thread-pool isolation costs a thread per
concurrent call (~1MB stack each) and creates a hard ceiling on throughput, so
`maxThreadPoolSize` must be set deliberately — set it too low and you have built your own
queueing problem. Neither type is safe without a timeout.

**Q7. A `fallbackMethod` returns a stale cached result. What is the operational
consequence?** `ADVANCED`

The outage becomes invisible. From the alerting system's perspective the error rate is 0%
because every call is succeeding — with data from before the incident. The circuit
breaker is open, every request is being served from cache, and the business is quietly
returning wrong answers to users while nothing pages anyone. Invisible outages last longer
because the pressure to fix them never arrives. The requirement is that the degradation be
a product decision and the visibility an engineering one, made together: a first-class
`fallback.invoked` counter with an alert on its rate, not only an error-rate alert.

> **CHAPTER 4 SUMMARY**
>
> A circuit breaker is a three-state machine whose configuration is easy to get silently
> wrong: `minimumNumberOfCalls` gates whether the failure threshold is evaluated at all, so
> a window smaller than the minimum means a breaker that never opens. A breaker tuned too
> aggressively is worse than none — while open, *zero* requests reach the dependency, so a
> 30%-failing service becomes a 0%-succeeding one and the fast failures cascade into the
> callers' breakers. `@Retry` outside `@CircuitBreaker` counts amplification as failure and
> opens the breaker three times too fast; the breaker goes outermost, always. `@RateLimiter`
> is per-instance, so the configured limit grows with the fleet — use an external bucket.
`@Bulkhead` thread isolation contains a hung dependency and semaphore isolation does not,
at the cost of a thread per concurrent call. And a `fallbackMethod` that returns a
success-shaped response removes the outage from your dashboards, which is why the fallback
rate needs its own metric and alert.

#### Further Reading

- [Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html) — the original pattern write-up; the failure-detector section is the part most implementations get wrong.
- [Resilience4j getting started](https://resilience4j.readme.io/docs/getting-started-3) — the annotation and programmatic entry points, and the module map.
- [Resilience4j CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker) — every configuration property, including the sliding-window types and the `slowCall` settings.
- [Resilience4j Retry](https://resilience4j.readme.io/docs/retry) — backoff, jitter, and the exception classification lists.
- [Resilience4j Bulkhead](https://resilience4j.readme.io/docs/bulkhead) — the thread-pool versus semaphore implementations and their configuration.

## Chapter 5 — Distributed Tracing & Observability

### 5.1 Why Metrics Alone Cannot Answer the Question

A user reports: "checkout is slow." With per-service latency dashboards you can see that
`orders` is at p99 400ms and `inventory` is at p99 900ms, and that is genuinely not enough.
The question is **which inventory call, from which order request, and did the request fan
out or run serially?** Metrics are aggregated across every dimension you did not label, so
the specific slow case is invisible by construction — you cannot aggregate your way back to
one request.

A **trace** is a tree of spans, one per operation, sharing a trace ID, with each span
recording its start time, duration, and parent. That is exactly the shape of the question
above.

```text
trace 4bf92f3577b34da6a3ce929d0e0e4736

  checkout-api          412ms
  ├── auth              12ms
  ├── orders            380ms
  │   ├── db.query      35ms
  │   ├── pricing       88ms
  │   │   └── db.query  71ms          ← the actual problem, invisible in aggregate metrics
  │   └── inventory    244ms
  │       ├── db.query  60ms
  │       └── stock-x   180ms         ← downstream, cross-service
  └── notify             18ms

  total 412ms, but the inventory call inside orders is 244ms of it,
  and 180ms of that is another service entirely.
```

### 5.2 W3C Trace Context, and the Header That Is Easy to Forget

```text
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
             ^^ ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^ ^^^^^^^^^^^^^^^^ ^^
             |  trace-id (16 bytes, 32 hex)   span-id (8 bytes)  flags
             version
                                                       └─ 01 = sampled

tracestate: congo=t61rcWkgMzE,rojo=00f067aa0ba902b7
           └─ vendor-specific key/value pairs, propagated in order
```

- **`traceparent`** is the W3C standard. Four dash-separated fields: version, trace ID,
  parent span ID, and a flags byte whose low bit is the sampling decision.
- **`tracestate`** is the escape hatch for vendor-specific data, propagated in insertion
  order so a downstream can read what an upstream knew. If a vendor key carries
  authorisation or routing information, it must be sanitised before being handed to the
  next hop — a trace header is attacker-influenced input on a public edge.
- **B3** (`X-B3-TraceId`, `X-B3-SpanId`, `X-B3-Sampled`) is the older Zipkin format. It is
  still everywhere, and every propagation library supports both. The practical note is
  that B3 allows single-header and multi-header forms, and a bug in a hand-rolled
  propagator that only handles one of them produces traces that break exactly at the
  service boundary you forgot about.

> **MUST REMEMBER**
>
> **The trace context must travel in message headers, and this is easy to forget.** A
> consumer that does not read `traceparent` off the message starts a *new* trace — so the
> async half of your system is invisible, and the visual result is a trace that stops dead
> at the broker. Every consumer needs explicit instrumentation to read the context from
> whatever the broker uses as message metadata, and the test for it is: publish an event
> that triggers a slow downstream call, and check that the trace continues through the
> consumer. If it does not, the propagation is missing and the trace is a lie.

### 5.3 Micrometer Tracing and the `Observation` Gap

The modern instrumentation API is `Observation` — a vendor-neutral description of *what
happened*, which is then translated into a metric **and** a trace span by a tracer
bridge.

```java
@Service
public class CheckoutService {

    private final ObservationRegistry observations;

    public CheckoutService(ObservationRegistry observations) {
        this.observations = observations;
    }

    public Receipt checkout(Cart cart) {
        // Name it after the DOMAIN operation, not the method. The low-cardinality name
        // becomes a metric and a span; the context becomes attributes.
        return Observation.createNotStarted("checkout.submit", observations)
                .lowCardinalityKeyValue("payment.provider", "stripe")
                .observe(() -> {
                    // ...the actual work...
                    return doCheckout(cart);
                });
    }
}
```

> **MUST REMEMBER**
>
> **An `Observation` is not automatically a span.** The two are produced by a *bridge* —
> `ObservedSpan` plus a tracer — and that bridge has to be configured. With
> `micrometer-tracing-bridge-otel` (or `-bridge-brave`) on the classpath and an
> `OpenTelemetry`/`Tracer` bean present, observations become spans. Without it, you get
> excellent metrics and **no traces at all**, with no error and no warning. This is the
> single most common gap in an instrumented application, and the symptom — a full
> `ObservationRegistry` and an empty trace backend — is baffling if you do not know to look
> for it.

The naming discipline is worth stating because it is cheap and it compounds:

| | Low-cardinality key | High-cardinality key |
| --- | --- | --- |
| Becomes | A metric **tag** and a span attribute | A span attribute **only** |
| Cardinality | Tens of values — `payment.provider=stripe` | Thousands — `order.id=...` |
| Correct for | Things you will group by and alert on | Things you will search for inside one trace |

A user ID in a low-cardinality key is the metric-cardinality failure mode from Volume 7
Chapter 7, and it is covered in 5.6.

### 5.4 OpenTelemetry and the Vendor-Neutral Model

OpenTelemetry's contribution is not a tracer — it is the *model* that makes tracers
interchangeable: a shared API, a shared SDK, and **propagators** as the explicit contract
for how context crosses a boundary.

```text
  your app
     │
     ├── Micrometer ObservationRegistry  ← instrumentation API
     │         │
     │         ├── OtelTracerBridge ──► OpenTelemetry SDK ──► OTLP exporter ──► backend
     │         │                              (or)
     │         └── BraveTracerBridge ───► Brave ──────────► Zipkin exporter ─► backend
     │
     └── propagators: W3CTraceContextPropagator / B3Propagator
         (the ONLY part that has to agree across every service in the fleet)
```

The practical point: **the propagator must be uniform across the estate.** A fleet where
three services emit W3C and four emit B3 produces broken traces at the boundaries between
them, and the failure is intermittent enough to be hard to attribute. Pick one, configure
it everywhere, and the tracer implementation underneath becomes a per-team decision that
does not affect your traces.

### 5.5 Baggage — and the Security Warning

Baggage is a set of key/value pairs propagated on **every** request to **every** service
your request touches, and — if the instrumented library is doing what the spec says — on
**every** outbound request to third parties.

```text
  baggage: userTier=gold,tenantId=acme-eu,debugHint=true
                 │
                 ├── forwarded to orders-service
                 │      ├── forwarded to inventory-service
                 │      │      └── forwarded to stock-x  ← a FOURTH-PARTY service
                 │      └── forwarded to stripe (an external API)   ← !!!
                 └── logged by every service along the way
```

Two rules, and the second is a security rule:

1. **Never put PII in baggage.** An email address or a full name in baggage is copied into
   every log line, every trace store, and every downstream request header — multiplying one
   disclosure into dozens, into systems with different retention policies and access
   controls. Baggage is for technical context: a tenant id, a feature flag cohort, a
   deployment version. Even a tenant id deserves a thought if tenants are confidential.
2. **Never put high-cardinality values in baggage.** Every distinct baggage key/value pair
   is a distinct trace in the backend. Putting an order id in baggage means the tail-sampler
   is making per-value decisions across millions of values, and the cost of the propagation
   header — which is sent on every hop — grows with the number of distinct values your
   traffic produces.

The architectural point underneath both: **baggage crosses trust boundaries, so treat it
as untrusted input.** A public-facing service must not accept baggage from a client
unfiltered; a gateway should strip or allow-list it, or an attacker populates your
telemetry with values designed to blow up cardinality.

### 5.6 Sampling — and the Metrics Cardinality Failure

**Head sampling** decides at the root span, before any work happens, and propagates that
decision downstream via the `traceparent` flags byte. It is cheap and it cannot be
un-decided.

**Tail sampling** buffers spans until the trace *completes*, then decides based on what
actually happened — error, or duration over a threshold. That is the only way to keep
"every error and every slow request" while discarding the boring 99%.

```text
  HEAD SAMPLING                        TAIL SAMPLING
  ─────────────                        ─────────────
  decision at the root                 decision after the trace completes
  cheap, no buffering                  needs a buffer, a decision point,
                                       and delayed export
  probability only                     content-aware: keep if
    keep if rand() < 0.1                 span.status == ERROR
                                       keep if duration > 1s
  "1% of traffic"                    "100% of errors + all slow requests"
                                       which is what you actually want
  drops the slow errors too —         and it is only possible because
  99% of failures are lost              the trace is complete
```

Head sampling at 100% does not scale: 1,000 rps × 16 spans × 60s retained = roughly a
million spans a minute, which is a storage cost and an ingest cost that shows up in the
bill and then in the tail-sampling decision nobody made deliberately. Head sampling at 1%
keeps only 1% of your errors. **Tail sampling is the answer**, and the honest caveat is
that it is not free: it requires a collector holding spans in memory until a decision can
be made, which means memory pressure and a latency budget for export, and it requires a
sampling policy somebody owns.

**The metrics half, and cardinality as the failure mode.** Micrometer's metric types are
`Counter` (monotonically increasing), `Gauge` (instantaneous, sampled), `Timer`
(duration, with a count), `DistributionSummary` (size distribution), and `LongTaskTimer`
(in-progress). The problem is not the type — it is the tag.

```java
// A metric tag with a user ID is a memory leak in the metrics backend.
meterRegistry.counter("orders.created", "userId", user.id()).increment();      // ✗

// ~250 active users → 250 time series for ONE metric name, forever.
```

The mechanism: a metrics backend holds one time series per unique tag combination. Tag it
with `userId` and a service with 250 active users creates 250 series, each with a
retention cost, and each of which will eventually be *dormant* rather than deleted. Tag it
with `orderId` and every order ever processed creates a permanent series. The practical
limit is a few hundred label values per metric — beyond that you are not adding
information, you are adding cost, and most dashboards cannot usefully distinguish them
anyway.

> **MUST REMEMBER**
>
> Cardinality is bounded by **the number of distinct values that ever occur**, not the
> number that occur concurrently. A `userId` tag is a permanent series per user, forever.
> The rule: high-cardinality identifiers belong in **span attributes** (searchable inside a
> trace) and logs, never in **metric tags** (which multiply into the backend's memory).

### 5.7 What a Trace ID Does Not Tell You

The honest limits, and they are worth stating because confident tracing claims are easy to
over-claim:

- **It shows where time went, not why a decision was made.** A trace with a 180ms
  `stock-x` span tells you `stock-x` was slow. It does not tell you that `stock-x` took a
  lock, ran a full table scan, or called an external API three times.
- **It does not tell you whether the business outcome was correct.** A trace of a
  successful 200 that charged a customer twice is a beautiful trace of a bad outcome.
  Business correctness is a *different* class of check — invariants, reconciliation,
  domain-level assertions — and no amount of tracing substitutes for it.
- **It is a sample, and the sample is biased.** Head sampling is random; tail sampling is
  biased towards errors and slow requests, which means your "typical" traces are not
  typical. Do not compute a latency percentile from the traces you kept and compare it to
  a metric percentile; they will not agree, and knowing why is the point.
- **It does not show the work that is not instrumented.** A span covering a `JdbcTemplate`
  call tells you the database took 71ms. It does not tell you the database was waiting on
  a lock held by another service's transaction — the most common real cause — unless that
  wait is itself instrumented, which it usually is not.

#### Common Mistakes

- A consumer that does not read the trace context from message headers, so the async half
  of the system has no traces and the trace stops dead at the broker.
- Micrometer `Observation`s everywhere and no traces, because the tracer bridge is missing
  from the classpath. Metrics work; spans do not; nothing complains.
- A `userId` or `orderId` in a metric tag — a permanent time series per identifier in the
  backend.
- PII in baggage, propagated to every downstream service and every third-party API.
- 100% head sampling "to see everything", which is a storage bill decision made by
  accident, followed by tail sampling being added later on top of it.
- Non-uniform propagators across the fleet — three services on W3C and four on B3 produces
  traces that break intermittently at service boundaries.
- Treating a trace as proof of correctness rather than as a map of where time went.

#### Interview Questions — Tracing & Observability

**Q1. Why can't metrics answer "why is this one request slow across six services"?** `TRICKY`

Because metrics are pre-aggregated across every dimension you chose not to label. A p99 of
900ms on `inventory` tells you that 1% of inventory calls were slow; it cannot tell you
which ones, who triggered them, what else was happening in the same request, or whether
they were even part of the same trace. You cannot aggregate your way back to an individual
request. A trace preserves the per-request tree — which call, from which parent, with
which sibling calls in parallel — which is exactly the shape of the question.

**Q2. How does trace context propagate across a message broker, and what happens if a
service forgets?** `TRICKY`

The context travels in the message *headers*, in the same `traceparent` / B3 fields used
for HTTP, and it has to be read out and re-injected on the consumer side explicitly. A
consumer that does not read them starts a **new** trace, so the asynchronous half of the
system is invisible and the visual result is a trace that stops dead at the broker. The
test is: publish an event that triggers a slow downstream call, and check whether the trace
continues through the consumer. If it doesn't, the propagation is missing and the trace is
misleading rather than absent — which is worse, because it looks like an explanation.

**Q3. What is the W3C `traceparent` header, and what are the B3 headers for?** `TRICKY`

`traceparent` is four dash-separated fields: a version, a 16-byte trace ID, the 8-byte
parent span ID, and a flags byte whose low bit carries the sampling decision — so the
sampling choice propagates to every downstream service without a separate round trip.
`tracestate` carries vendor-specific key/value pairs in insertion order. B3 is the older
Zipkin format (`X-B3-TraceId`, `X-B3-SpanId`, `X-B3-Sampled`, plus baggage), still
everywhere, and its subtlety is that it has both single-header and multi-header forms — a
hand-rolled propagator that handles only one of them breaks traces at exactly the service
boundary you forgot.

**Q4. What is a Micrometer `Observation`, and why might you have observations and no
spans?** `ADVANCED`

An `Observation` is a vendor-neutral description of something that happened — a name, a
context of key-values, and timing. It is the modern instrumentation API, and it produces a
metric always and a trace span only when a *tracer bridge* is present and configured
(`micrometer-tracing-bridge-otel` or `-bridge-brave` plus an `OpenTelemetry`/`Tracer`
bean). Without the bridge you get excellent metrics and no traces at all, with no error
and no warning — which is the gap, because an application with a full `ObservationRegistry`
and an empty trace backend looks like a tracing bug in the backend rather than a missing
dependency. Naming is the other discipline: the name becomes a metric, so it must be
low-cardinality and domain-oriented, and identifiers belong in `highCardinalityKeyValue`
span attributes, not in the metric name.

**Q5. Why is PII in baggage a security problem rather than a tidiness problem?** `STAFF`

Because baggage is propagated on every request to every service the request touches, and
on outbound requests to third parties if the library follows the spec. An email address in
baggage is copied into every log line, every trace store, and every downstream request
header — so one disclosure becomes dozens, in systems with different retention policies,
different residency, and different access controls. Two corollaries: baggage crosses trust
boundaries, so a public-facing service must allow-list or strip inbound baggage rather than
trusting it (an attacker can populate your telemetry to blow up cardinality), and
high-cardinality values do not belong in baggage at all, because every distinct value
becomes a distinct trace and the propagation header grows with it.

**Q6. Head sampling vs tail sampling — what can each do that the other cannot?** `STAFF`

Head sampling decides at the root, before any work, and propagates the decision in the
`traceparent` flags byte. It is cheap and needs no buffering, but it can only be
probabilistic — 1% head sampling keeps 1% of your errors, which is not useful. Tail
sampling buffers spans until the trace completes and then decides on content, which is
the only way to keep 100% of errors and 100% of slow requests while discarding the boring
majority. Its cost is real and worth naming: a collector holding spans in memory until a
decision point, a memory budget, export latency, and a sampling policy somebody has to own.
100% head sampling is not a safe substitute — at 1,000 rps it is a million spans a minute
and a storage bill that arrives before anyone decided to pay it.

**Q7. A metric tagged with a user ID. What's the failure mode, and what's the practical
limit?** `TRICKY`

A metrics backend holds one time series per unique tag combination, and series are
retained rather than deleted. Tagging with a user ID therefore creates a permanent series
per user that ever exists — a memory leak in the backend, not in your application, which is
why it is invisible from the service's own dashboards. The practical limit is a few hundred
distinct label values per metric; beyond that you are not adding information, you are
adding cost. The rule is that high-cardinality identifiers — user, order, request, session
— belong in span attributes and structured logs, where they are searchable within one
trace, and never in metric tags, where they multiply.

**Q8. What can a trace ID not tell you?** `STAFF`

Four things. It shows where time went, not why a decision was made — an 180ms span says
the dependency was slow, not whether it was a lock wait, a bad plan, or an external call.
It does not tell you whether the business outcome was correct — a clean trace of a request
that double-charged a customer is a beautiful trace of a failure. The sample is biased, so
percentiles computed from kept traces will not match metric percentiles and shouldn't be
compared. And it does not show work that isn't instrumented, which is most of the
interesting behaviour inside a database.

> **CHAPTER 5 SUMMARY**
>
> Metrics cannot answer a per-request question because they are pre-aggregated, and a trace
> is the structure that can. Context propagates in headers — over HTTP and, just as
> importantly, over message brokers, where a consumer that doesn't read it starts a new
> trace and makes the async half of your system invisible. Micrometer's `Observation` is
> the modern instrumentation API and is *not* automatically a span: the tracer bridge has
> to be present, and its absence produces perfect metrics and no traces with no warning.
> Baggage crosses every trust boundary, so PII and high-cardinality values are both
> problems there. Tail sampling is the only way to keep the errors and the slow requests;
> head sampling at 100% is a bill nobody decided to pay. And cardinality is the metrics
> failure mode — a `userId` tag is a permanent time series per user, which is why
> identifiers belong in span attributes and never in metric tags.

#### Further Reading

- [Micrometer documentation](https://micrometer.io/docs/) — the metric types, the `Observation` API, and the tracer bridges in one place.
- [Micrometer Context Propagation](https://docs.micrometer.io/context-propagation/reference/) — how values cross threads and reactive boundaries, which is the same problem in a different direction.
- [OpenTelemetry — Traces](https://opentelemetry.io/docs/concepts/signals/traces/) — the vendor-neutral model, and the propagator contract that must be uniform across a fleet.
- [OpenTelemetry — Metrics](https://opentelemetry.io/docs/concepts/signals/metrics/) — the data model, and why cardinality is the resource that runs out.
- [Envoy circuit breaking documentation](https://www.envoyproxy.io/docs/envoy/latest/intro/arch_overview/upstream/circuit_breaking) — the same resilience patterns in a non-JVM implementation, useful for separating what is framework-specific from what is not.

## Chapter 6 — Distributed Data Patterns

This is the core chapter, and the honest framing throughout is that **every pattern here
trades a strong guarantee for a weaker one plus operational machinery.** There is no
pattern in this chapter that gives you ACID across services. There are several that give
you something useful, and all of them have a failure mode you must be able to name.

### 6.1 Shared Database — the Antipattern and the Tell

A shared database across services means multiple services can read and write the same
tables. It is the single most common shape in organisations that have adopted "microservices"
in name, and it is worth being able to diagnose it precisely.

**The tell that you have built a distributed monolith**, in order of reliability:

1. **A single transaction spans services.** A `@Transactional` method in service A
   updates tables that service B owns. There is no distributed transaction here — the
   second service's change is not in the same commit, and if the second write fails, the
   first is already durable.
2. **A schema change is a coordinated multi-team deploy.** Renaming a column means every
   service that selects it ships in the same window. That is the cost that makes the
   whole "independent deployment" claim false, and it is the cost you can measure: count
   the deploys that are not independent.
3. **Nobody can answer "who owns this table?"** With a shared schema, ownership is
   implied by convention and enforced by nothing. This is the organisational cause, and
   Chapter 8 returns to it.
4. **Cross-service joins in the request path.** If `orders` and `inventory` are joined to
   build a response, the "boundary" is a table name, not an interface.
5. **One team's deploy breaks another's endpoint.** The most reliable signal, and the one
   that shows up in the incident review.

> **MUST REMEMBER**
>
> A shared database does not make services "transitional" — it makes them permanently
> coupled at the data layer, and it does so in a way that **survives every other
> decoupling you do.** Splitting the code, adding a REST interface, wrapping the repository
> in a client: none of it changes the fact that a `ALTER TABLE` takes down three teams.
> The schema *is* the API, and until you own tables rather than borrowing them, "the
> services are separate" is a claim about code layout, not about the system.

### 6.2 Database per Service — and What It Costs

```text
  orders-service              inventory-service            pricing-service
  ┌────────────────┐          ┌────────────────┐           ┌────────────────┐
  │  orders        │          │  inventory     │           │  rates         │
  │  order_line    │          │  reservations │           │  (time series) │
  │  ────────────  │          │  stock_levels  │           │                │
  │  ────────────  │          │                │           │                │
  │ ✗ NO customer  │          │                │           │                │
  │   table        │          │                │           │                │
  └────────┬───────┘          └────────┬───────┘           └────────┬───────┘
           │   JOIN?                    │   JOIN?                    │
           └──────────── ✗ impossible across services ─────────────┘
```

Three consequences, and each is a real project:

1. **Cross-service joins are impossible.** A query that joined `orders` to `customers`
   now either denormalises the customer data into the orders schema (with a consistency
   window), issues a second call (with a latency cost in the request path), or reads a
   projection that a pipeline maintains. **This is the decision most database-per-service
   migrations discover late**, and the denormalisation is the right answer far more often
   than teams expect — the cost is eventual consistency on a field, and the benefit is
   removing a network hop from the hot path.
2. **Referential integrity is gone.** A foreign key cannot span services. If orders
   reference a customer that has been deleted in the customer service, the database will
   not stop you. The invariant moves into code, into an event-driven check, or into
   nobody — and "into nobody" is the common outcome.
3. **A single business operation spanning services has no transaction.** "Place an order"
   writes to orders, decrements inventory, and reserves pricing. There is no commit that
   makes those three atomic. Everything below in this chapter exists to manage that fact.

### 6.3 Saga — Choreography vs Orchestration

A saga replaces the distributed transaction with a sequence of **local transactions** and
**compensating actions**. The participant services each commit locally; if a later step
fails, earlier steps are compensated by a business action, not by a rollback.

```text
  CHOREOGRAPHY — events, no coordinator

    checkout-service                inventory            payment          shipping
         │                             │                   │                │
         │ ── OrderPlaced ────────────▶│                   │                │
         │                             │ ── StockReserved ▶│                │
         │                             │                   │                │
         │ ◄──────── PaymentFailed ────┼───────────────────│                │
         │                             │                   │                │
    "the emergent behaviour is a property of the EVENT GRAPH,
     not of any component — nobody can read the code and see
     the flow; you have to reconstruct it from the event types"
         • fewer moving parts, no coordinator to be available
         • but the flow lives in the event schema, coupling grows
           event by event, and failure handling is every consumer's job


  ORCHESTRATION — a coordinator drives the sequence

    ┌──────────────────┐
    │  saga-orchestrator│
    │  (state machine) │
    └────────┬─────────┘
             │  command: reserve
             ├──────────────▶ inventory ──▶ reserved
             │  command: charge
             ├──────────────▶ payment ──▶ FAILED
             │  command: compensate
             └──────────────▶ inventory ──▶ release reservation
             │
        every step's outcome is recorded, and the flow is one
        readable state machine you can debug from one screen
```

| | Choreography | Orchestration |
| --- | --- | --- |
| Coordination | None — events | A saga coordinator |
| Where the flow lives | The event graph, implicitly | One state machine, explicitly |
| Debuggability | You reconstruct it from event types | You read one class |
| Coupling | Grows per event; consumers know each other's events | Only the coordinator knows the participants |
| New participant | Publish/subscribe, no coordinator change | Coordinator must be changed |
| Availability | No coordinator to keep alive | **The coordinator is now a component that must itself be available** |
| Failure handling | Every consumer must implement compensation | Centralised, and consistent |

The staff-level point about orchestration is the one people forget: **the coordinator is a
distributed system component with its own availability requirement.** If the orchestrator
is down, sagas in flight cannot progress — they neither advance nor compensate. It needs
durable state (a database), a lease or leader election so two coordinators do not drive the
same saga, and an operator-facing view of in-flight sagas. That is a real operational
surface, and choosing orchestration means accepting it.

### 6.4 Compensating Actions Are Business Logic, Not Rollback

This is the conceptual point that most implementations get wrong, and getting it wrong
produces data that cannot be repaired.

```text
  A ROLLBACK undoes a write.          A COMPENSATION is a NEW, FORWARD business action.

  INSERT order_row        ──rollback──▶  row gone
  UPDATE stock = stock-1  ──rollback──▶  stock restored (an arithmetic fact)

  SEND confirmation email ──✗ NO ROLLBACK── you cannot un-send an email
  CHARGE card £49.99      ──✗ NO ROLLBACK── you issue a REFUND (new txn, days later)
  INVOICE the customer    ──✗ NO ROLLBACK── you issue a CREDIT NOTE
  SEND a dispatch         ──✗ NO ROLLBACK── you CANCEL and it may already be in a van
  NOTIFY a partner system ──✗ NO ROLLBACK── you send a CORRECTION event
```

The consequence: **compensation is a forward action with its own business semantics, and
it is allowed to fail.** Three things follow that teams plan for only after their first
incident:

1. **Compensation can fail**, so it needs its own retry and its own idempotency. A refund
   attempt that times out may or may not have succeeded; retrying without a key can
   double-refund.
2. **Compensation is not instantaneous.** A card refund takes days to appear. The saga is
   "complete" in the sense that the compensating action was *initiated*, and the ledger
   remains inconsistent against reality for that window. Any reconciliation process that
   assumes sagas close atomically will produce false alerts.
3. **Compensation is a different code path and needs its own tests.** It is the code that
   runs when things are already broken, which is exactly the code that is least tested and
   most urgent. A compensation that has never been exercised is an assumption, not a
   mechanism.

### 6.5 Transactional Outbox and Idempotent Consumers

The dual-write problem: you must write to your database *and* publish a message. Those are
two systems, and there is no transaction across them.

```text
  THE DUAL-WRITE BUG — three ways it fails, all of them observed in production

  ┌─────────────┐  1. write order    2. publish ORDER_PLACED
  │  tx: DB     │──────┐
  └─────────────┘      │
         │             ▼
         │      ┌─────────────┐
         └──2───│  broker     │      3. tx rolls back
                └─────────────┘
              → ORDER_PLACED exists; the order does not.  (phantom message)

              OR: step 1 commits, the process dies before step 2
              → the order exists; no event.  (lost event)

  TRANSACTIONAL OUTBOX — one transaction, both writes

  ┌──────────────────────────────────────────┐
  │  tx:  INSERT INTO orders ...             │
  │       INSERT INTO outbox (event) ...     │  ← same local transaction
  └──────────────────────────────────────────┘
                    │  commit atomically
                    ▼
            ┌──────────────┐
            │ OUTBOX RELAY │  polls the outbox table
            │  (or CDC)    │  publishes to the broker
            └──────┬───────┘
                   │  ⚠ the relay can crash between publish and marking sent
                   ▼
            THE MESSAGE IS PUBLISHED TWICE.  → consumers must be idempotent.
```

```java
@Transactional
public Order place(PlaceOrder cmd) {
    Order order = orders.save(new Order(cmd));
    // Same transaction, same database — this is what makes it safe.
    outbox.save(OutboxMessage.of("ORDER_PLACED", order.id(), payloadOf(order)));
    return order;
}
```

```java
// CONSUMER — dedup by message id, in the same transaction as the business write.
@Transactional
public void on(OrderPlacedEvent event) {
    if (inbox.alreadyProcessed(event.messageId())) {
        return;                       // already applied — the duplicate is a no-op
    }
    inventory.reserve(event.orderId(), event.lines());
    inbox.record(event.messageId());  // same tx: if we crash, the record rolls back too
}
```

The inbox is the counterpart and it is not optional. The outbox guarantees **at-least-once**
delivery, which means duplicates are not a bug to be fixed but a property of the system to
be designed for. The `inbox` record must be written **in the same local transaction as the
business change** — if you record "processed" and then do the work, a crash between them
loses the work; if you do the work and then record, a crash between them repeats it.

> **PRODUCTION SCENARIO**
>
> Problem: customers were charged for orders that did not exist, at a rate of roughly 1 in
> 4,000, spread over two months and only discovered by a finance reconciliation.
> Investigation: no `ORDER_PLACED` events for the affected orders, and the payment records
> showed charges with no matching order. The order insert had committed; the publish had
> not.
> Root cause: a dual write — the order was inserted and the event published as two separate
> operations, so a crash between them lost the event, and a compensating retry path
> elsewhere re-published some of them.
> Solution: the transactional outbox, plus consumer-side deduplication by message id in
> the same transaction as the business write. A reconciliation job was added and the
> affected records repaired.
> Prevention: a rule that no service publishes to a broker as part of a business
> transaction without an outbox, enforced in code review because there is no framework
> that can enforce it for you.

### 6.6 CDC with Debezium

Change Data Capture reads the **transaction log** — MySQL binlog, Postgres WAL, MongoDB
oplog — and turns row-level changes into a stream of events.

```text
   your service writes to its own database (unchanged)
                    │
                    ▼
   ┌────────────────────────────────────────┐
   │  WAL / binlog / oplog                 │  ← the database's own ordered log
   └───────────────┬────────────────────────┘
                   │  read, never written
                   ▼
   ┌────────────────────────────────────────┐
   │  Debezium connector                   │
   │  • filters by table                   │
   │  • emits insert/update/delete events  │
   │  • tracks LSN/binlog position         │
   └───────────────┬────────────────────────┘
                   ▼
              Kafka topic
```

**The appeal is real**: the producing service needs no outbox table, no relay, no polling —
it just writes to its own database as it already does, and the change propagates. For a
fleet that cannot be modified to write an outbox row, CDC is often the pragmatic answer to
the dual-write problem.

**The operational caveats are where the cost lives, and the one people underestimate:**

1. **Schema changes flow through too.** A `DROP COLUMN` becomes a schema-change event
   your consumers will receive, and they will fail to deserialise it. This is not a
   deployment problem — it is a *distributed* schema change with an ordering problem
   attached, and CDC tooling supports schema-change topics precisely because the problem
   is real.
2. **A schema change becomes a distributed change.** Dropping a column means: stop reading
   it in every consumer, deploy those changes, *then* drop the column. With CDC in the
   middle, "deploy the readers" and "drop the column" are separate events on a stream that
   every consumer sees, and the ordering discipline is now a distributed-systems problem
   rather than a migration-plan problem.
3. **The log is the coupling.** Consumers now depend on the *physical* table structure,
   not on a published contract. Rename a column for readability and you have broken
   consumers you did not know existed. The discipline is a strict expand/contract
   discipline: add columns, never rename or drop in the same release as a reader change.
4. **The initial snapshot is a special case.** On first start, a connector reads a
   consistent snapshot of existing rows and *then* the log. Ordering here is the connector's
   problem, and for a large table the snapshot is a long, resumable operation.

### 6.7 Read Replicas and the Replication Lag Problem

```text
   WRITE:  primary ──replication──▶ replica

   t=0   primary: INSERT order 42          (committed)
   t=0+  user immediately navigates to the order
   t=0.1 read hits the replica ──▶  order 42 NOT THERE
   t=2   replication catches up

  ⚠ "read-after-write" has just failed. The user saw 404 on an order
    they created 100ms earlier. This is not a rare edge case — it is
    the single most common "how did this happen" report in a system
    with read replicas.
```

The fixes, in order of how often they are the right one:

1. **Session stickiness to the primary for a short window.** The user's session reads
   from the primary for N seconds after a write. Simple, correct for the immediate
   read-after-write case, and it costs primary capacity — including primary capacity for
   users who are not reading anything.
2. **A bounded lag check.** Route reads to a replica only if
   `now() - replication_timestamp < threshold`, else use the primary. This is more
   expensive and more correct for a case the sticky session misses (a write from user A
   read by user B), and it needs a lag signal you can trust — a heartbeat table on the
   primary, whose timestamp is what you measure.
3. **Read your own writes explicitly.** The client carries a timestamp or version and the
   read path guarantees it does not return data older than that. Precise, and it pushes
   the problem onto every read call site.
4. **Route a specific aggregate to the primary permanently.** The right answer for a small
   number of very hot or very read-after-write-heavy aggregates. The wrong answer as a
   default, because you are choosing which users pay.

> **SCALING REALITY CHECK**
>
> Replication lag is not a constant. A replica behind by 800ms under normal load can be
> behind by 30 seconds during a failover, a long-running analytical query that pins the
> replication thread, or a storage event on the replica. A staleness threshold set to 5
> seconds is a threshold that holds in the steady state and fails in the incident — and
> the incident is exactly when the read-after-write failures cluster.

### 6.8 CQRS — When It Pays and When It Is a Migration

CQRS splits the write model from the read model. Writes go to a normalised, invariant-enforcing
model; reads come from a denormalised projection designed for the query.

```text
  WRITE side (authoritative)              READ side (projections)
  ┌──────────────────────┐               ┌──────────────────────┐
  │ orders, order_line,  │  events/CDC   │ order_summary        │
  │ inventory            │──────────────▶│ customer_profile     │
  │ (normalised,         │               │ search_index         │
  │  constraints, ACID)  │               │ reporting_facts      │
  └──────────────────────┘               │ (denormalised,        │
                                         │  no constraints,      │
                                         │  eventually correct)  │
                                         └──────────────────────┘
```

**When it pays:**

- The read model is genuinely complex and the write model genuinely simple, and
  reimplementing the query against the write model would mean a dozen joins.
- You need several different projections of the same data — a search index, a reporting
  cube, and a read-optimised entity view.
- Read volume dwarfs write volume by a large factor and the write model's constraints are
  costing you on the read path.
- You have an event stream already (from the outbox or CDC) and the projection is a
  straightforward consequence of it.

**When it is a data-migration project wearing a pattern's clothes:** a team adopts CQRS
because the ORM is slow on one screen. The projections must be built, kept in sync,
backfilled, and made correct under replay; the write model and the read model can drift;
and every new query becomes a change to a projection pipeline rather than a change to a
repository. The honest test: **would you build the read model even if the database were
fast?** If the answer is "yes, because the query is genuinely complex", CQRS is earning
its cost. If the answer is "no, but Hibernate is making this one screen slow", fix the
query.

### 6.9 Event Sourcing, in One Honest Paragraph

Event sourcing stores the **sequence of state changes** as the source of truth, with
current state derived by replaying them. The benefits are real and specific: a complete
audit trail (which the GDPR and financial audit regimes genuinely require, and which no
row-level design gives you for free), temporal queries — "what did this account look like
on 14 March", answered exactly rather than approximately — and the ability to build new
projections from history that you never stored. The costs are equally specific: **event
schema evolution is the hard problem** (an event written two years ago must still be
readable, so you need versioned event types and upcasters, and "just add a nullable field"
is not available); **there is no current-state query without a projection**, so you build
and maintain one anyway; and **everything is eventually consistent**, which means the
authoritative state is not queryable in the way every developer instinctively reaches for.
Adopt it where the audit trail is a requirement or the temporal query is the product. Do
not adopt it because event sourcing is what the system you admire uses.

#### Common Mistakes

- Splitting services that share a database, believing the code split makes them
  independent. The schema is the API, and an `ALTER TABLE` is still a coordinated deploy.
- Discovering the cross-service join problem during the migration, rather than during the
  boundary design. Denormalising the foreign key into the owning service is usually the
  right answer and is a much smaller project than the alternatives.
- Compensation modelled as rollback. "Un-send the email" and "un-charge the card" are not
  things; a correction and a refund are, and they are new transactions that can themselves
  fail.
- Recording `inbox.processed(messageId)` in a *different* transaction from the business
  write, so a crash between them either loses the work or repeats it.
- Choosing choreography and then discovering the emergent flow cannot be debugged,
  because it does not exist in any single place.
- Routing all reads to replicas and treating a read-after-write 404 as a mystery.
- Choosing CDC, renaming a column for readability, and breaking consumers whose existence
  nobody had on record.
- Adopting CQRS to fix one slow query, and inheriting a projection pipeline.

#### Interview Questions — Distributed Data Patterns

**Q1. How do you tell that a set of "microservices" is a distributed monolith?** `STAFF`

The reliable tells, in order: a single business operation spans services with no
transaction covering it; a schema change requires a coordinated multi-team deploy; nobody
can say who owns a given table; cross-service joins happen in the request path; and one
team's deploy breaks another team's endpoint. The first and second are the ones to cite,
because they are measurable — count the deploys that are not independent, and count the
`ALTER TABLE`s that need more than one team. The underlying cause is a split by technical
layer rather than by business capability, usually combined with one team owning all of
them.

**Q2. Shared database vs database per service — what's the actual difference in day-to-day
work?** `STAFF`

Shared database keeps joins, foreign keys, and cross-entity transactions, and it also
means a column rename is a coordinated multi-team deploy, ownership is implied by
convention rather than enforced, and the "independent" services are not. Database per
service makes all three impossible: no cross-service joins (so you denormalise, issue a
second call, or read a projection), no referential integrity (so invariants move into
code, events, or nowhere), and no transaction across a business operation (so you need a
Saga). The honest framing is that database-per-service is a *data-migration project*, and
denormalising the hot foreign keys is usually the smallest and best part of it.

**Q3. Saga choreography vs orchestration, and what does orchestration cost you?**
`STAFF`

Choreography has no coordinator: each service reacts to events and compensates itself, so
there is fewer moving parts and nothing extra to keep available — but the flow lives in the
event graph, is invisible in any single component, gets harder to debug as events accumulate,
and coupling grows one event at a time. Orchestration puts the flow in a coordinator state
machine, which makes it explicit, readable, and easy to debug — at the cost of a component
that must itself be available, hold durable state, need a lease or leader election so two
coordinators do not drive the same saga, and expose an operator view of in-flight sagas.
Choosing orchestration means accepting a new distributed-system dependency in exchange for
legibility, and that trade is usually worth it past a handful of participants.

**Q4. Why is a compensating action not a rollback?** `STAFF`

Because a rollback undoes a write and a compensation is a new forward business action. You
cannot un-send an email — you send a correction. You cannot un-charge a card — you issue a
refund, which is a separate transaction that may take days to appear on the statement. You
cannot un-dispatch a parcel — you cancel, and it may already be in a van. Three
consequences follow: compensation can itself fail, so it needs its own retry and its own
idempotency; compensation is not instantaneous, so the ledger stays inconsistent with
reality for a window and any reconciliation that assumes atomic saga closure will produce
false alerts; and compensation is a rarely-exercised code path, which is exactly why it
needs dedicated tests rather than a place in the coverage report.

**Q5. Walk through the transactional outbox, and say what the relay's failure mode is.**
`TRICKY`

Instead of writing to the database and publishing as two operations, the producer writes
both the business row and an outbox row in one local transaction — the database is the
only thing being made atomic, and it does it natively. A relay then reads the outbox and
publishes. The relay's failure mode is the important part: it can crash between publishing
and marking the row as sent, so **the message is published twice**. That is not a bug to
fix, it is the at-least-once guarantee, and it means consumers must be idempotent — dedup
by message id, with the "processed" marker written in the *same local transaction* as the
business change, so a crash between them either repeats the work (bad) or loses the record
(bad, but differently).

**Q6. When is CDC a better answer than the outbox, and what does it cost?** `ADVANCED`

CDC wins when the producing service cannot or will not write an outbox row — a legacy
system, a third-party datastore, or a fleet that would need code changes everywhere. It
reads the database's own log (binlog/WAL/oplog) and derives events, so the producing
service writes to its database exactly as before. The costs: **schema changes flow through
the same stream**, so a `DROP COLUMN` becomes an event consumers cannot deserialise, and a
schema change becomes a genuinely distributed change requiring expand/contract discipline.
Consumers now depend on the physical table structure rather than a published contract, so
a well-meant column rename breaks consumers nobody knew existed. And the initial snapshot
is a separate, resumable, long-running operation on a large table.

**Q7. A user creates an order and immediately gets a 404 on the confirmation page. Given
read replicas, what happened and what are the fixes?** `TRICKY`

The write went to the primary and the follow-up read went to a replica that had not yet
replicated it — replication lag, and the read-after-write guarantee is simply not
provided. The fixes, in order of how often they are right: session stickiness to the
primary for a short window after a write (simple, correct for this case, and it costs
primary capacity for readers who are not reading anything recently written); a bounded lag
check that routes to a replica only if `now() - replication_timestamp` is under a
threshold, using a heartbeat table on the primary as the signal (more correct, catches the
case sticky sessions miss where user A wrote and user B read); explicit read-your-writes
via a client-supplied version; or permanently routing hot aggregates to the primary. The
number to set is a judgment call, and the key insight is that lag is not constant — a
threshold that holds in the steady state fails during a failover or a long query on the
replica.

**Q8. When does CQRS pay for itself, and how do you know you are adopting it for the
wrong reason?** `STAFF`

It pays when the read model is genuinely complex, when several different projections of
the same data are needed (a search index, a reporting cube, an entity view), when read
volume dwarfs write volume, or when an event stream already exists and the projection is a
natural consequence. It is a data-migration project in disguise when it is adopted to fix
one slow query — then you inherit projection pipelines, backfill, replay, and drift
between the write and read models, and every new query becomes a change to a pipeline
rather than a change to a repository. The honest test: would you build the read model even
if the database were fast? If yes, CQRS is earning its cost. If no, the answer is a better
query.

**Q9. What are event sourcing's real costs, stated honestly?** `STAFF`

Event schema evolution is the hard problem: an event written two years ago must remain
readable, so you need versioned event types and upcasters, and the "just add a nullable
field" affordance you have with a row schema is not available. There is no current-state
query without a projection, so you end up building and maintaining one anyway — you have
simply changed where the authoritative data lives. And everything is eventually
consistent, so the authoritative state is not queryable in the way every developer
instinctively reaches for. Where it genuinely pays is a regulatory audit trail, which no
row-level design gives you for free, and temporal queries answered exactly rather than
approximately. The bar is "the audit trail is the requirement", not "we want to be the kind
of system that does this".

> **CHAPTER 6 SUMMARY**
>
> Every pattern in this chapter trades a strong guarantee for a weaker one plus
> operational machinery; none of them give you ACID across services. A shared database
> makes services permanently coupled at the data layer no matter how the code is split,
> and the tells are measurable: transactions spanning services, coordinated schema deploys,
> unowned tables. Database per service removes joins, referential integrity, and the
> distributed transaction — and a saga plus compensating actions is the replacement, where
> compensation is a *forward business action* (a refund, a correction) that can itself
> fail and needs its own idempotency. The transactional outbox fixes the dual-write
> problem by writing the event in the same local transaction, and pays for it with
> at-least-once delivery — so consumers must be idempotent, with the dedup marker written
> in the same transaction as the business change. CDC avoids the outbox code but pushes
> schema changes into the event stream. Replicas break read-after-write, and the fixes
> are all real designs with real costs. CQRS and event sourcing are pattern-matched
> decisions, not performance switches.

#### Further Reading

- [Transactional Outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html) — the canonical description, including why the relay can duplicate.
- [Saga pattern](https://microservices.io/patterns/data/saga.html) — choreography and orchestration side by side, with the failure modes of each.
- [Database per Service](https://microservices.io/patterns/data/database-per-service.html) — the consequences stated as a pattern, which is the clearest way to see the trade.
- [Debezium documentation](https://debezium.io/documentation/) — the connectors, the snapshot, and the schema-change handling you will need.
- [Microservices Patterns](https://www.manning.com/books/microservices-patterns) — book-length treatment of everything in this chapter, and the best place to see how the patterns compose.

## Chapter 7 — Service-to-Service Security

### 7.1 mTLS — What It Authenticates and What It Does Not

mTLS is mutual TLS: both ends of a connection present a certificate, and each verifies the
other's. In a service mesh, every workload gets a certificate identifying it, and a
workload calling another presents that certificate as proof of its own identity.

```text
  ┌─────────────────┐                              ┌─────────────────┐
  │ orders-service   │                              │ inventory-service│
  │                  │                              │                  │
  │ identity:        │   ─── TLS 1.3, both sides ──▶│ identity:        │
  │ spiffe://acme/   │   present certificates,      │ spiffe://acme/   │
  │  prod/eu/order   │   both verify the other      │  prod/eu/invent  │
  │                  │                              │                  │
  │ cert rotates     │                              │  → so inventory   │
  │ automatically    │                              │    knows WHO is   │
  │                  │                              │    calling        │
  └─────────────────┘                              └─────────────────┘

  ✅ "orders-service in prod-eu is calling me"     — an IDENTITY claim
  ❌ "orders-service is allowed to do this"        — an AUTHORISATION claim
```

> **MUST REMEMBER**
>
> **mTLS authenticates; it does not authorise.** A valid certificate tells the callee
> which workload is calling. It says nothing about whether that workload is *permitted* to
> make this particular call. Every mTLS connection in your mesh is a mutually
> authenticated connection to *every other service* — which means the authorisation
> question is entirely unanswered by the transport, and must be answered by policy
> (AuthorizationPolicy in a mesh, scopes on a token, or explicit checks in the service).

**The trust consequence is the thing to say next.** Without mTLS, "anything on the network
can call me" is a real and exploited vulnerability: an attacker who reaches the pod
network can call any internal endpoint with no credential at all. With mTLS and
workload identity, the set of things that can call you is exactly the set of workloads
that have been issued an identity — which is a much smaller set, and one that is
enumerable.

### 7.2 Sidecar vs In-Process — and What the Mesh Actually Buys You

```text
  SIDECAR (Istio, Linkerd, Consul + Envoy)          IN-PROCESS
  ─────────────────────────────────────────          ─────────────────────────────
  ┌───────────┐   localhost   ┌────────┐            ┌───────────┐
  │ app pod   │──────────────▶│proxy   │───mTLS───▶│ app pod   │
  │ (no TLS)  │◀──────────────│(Envoy) │            │ (TLS,     │
  └───────────┘  plaintext    └────────┘            │  identity)│
       │                                              └───────────┘
       └─ knows nothing about the network                  ▲
                                                        the library does mTLS,
                                                        retries, and the
                                                        authorisation call
```

| | Sidecar / service mesh | In-process (library) |
| --- | --- | --- |
| Language support | Any language, any framework | Per language, per HTTP client |
| Adoption | Zero code change | Every client call site |
| Failure domain | The proxy can fail or be misconfigured | The app fails |
| Overhead | An extra hop per call, ~1ms and extra CPU | None |
| Who owns the cert rotation | The mesh's control plane | You, or your library |
| Debugging | One more process in the path | One less |
| Policy | Declarative, applied fleet-wide | In code, per call site |

**The honest case for each.** The sidecar wins when you have polyglot estates (the mesh
does not care what language the service is in), when you need fleet-wide policy without a
code change in every service, or when the operational maturity for a control plane exists.
The in-process library wins when the hop matters for latency, when you want the identity
and authorisation in the same code path as the business logic, or when the organisation
cannot support a control plane — because a control plane is a real distributed system with
its own availability, upgrade, and debugging burden, and adopting a mesh you cannot
operate is a worse outcome than no mesh.

> **STAFF-LEVEL CONSIDERATION**
>
> A service mesh is one of the most org-heavy infrastructure decisions there is, and the
> technology is rarely the hard part. You need someone who can debug a sidecar proxy's
> config dump, who can read a certificate issuance failure, and who can carry a control
> plane upgrade. A mesh adopted without that person is a mesh that becomes a permanent
> mystery layer between the app and the network — the outage equivalent of putting a proxy
> in front of everything and calling it observability. Budget for the operating model
> before the technology.

### 7.3 Token Propagation vs Token Exchange

This is the distinction from Volume 8 Chapter 5, restated here as a decision, because
choosing wrong has a security consequence that is not obvious until you have an incident.

```text
  PROPAGATION — forward the caller's token

    user ──[token: scope=read, scope=own-profile]──▶ orders
                                                        │
        orders ──[SAME token] ──▶ inventory
                                        │
        inventory sees scope=read, scope=own-profile
        → it knows the USER, and only what the USER could do

    ⚠ the service's real capability is "do everything orders can do"
       but it is now limited to the user's token
       → under-privileged AND fragile: a user-facing token with
         no service scope cannot be used for a service-to-service call


  EXCHANGE (RFC 8693) — trade the token for a new one

    user ──[token: scope=read, scope=own-profile]──▶ orders
                                                        │
        orders ──exchange──▶ token exchange endpoint (IdP or broker)
        ◀──[NEW token: scope=inventory.write, audience=inventory, exp=60s]──┘
                                                        │
        orders ──[service token]──▶ inventory
                                        │
        inventory sees audience=inventory, scope=inventory.write
        → it knows the SERVICE, and only what inventory should accept
        → a leaked token is bounded to one audience and expires in 60s
```

| | Propagation | Exchange (RFC 8693) |
| --- | --- | --- |
| Downstream knows | The **user** | The **service** |
| Downstream authorisation | Whatever the user's token carries | The service's own declared scopes, for one audience |
| Token lifetime | Often long-lived, human-scoped | Short, audience-bound, machine-scoped |
| Blast radius of a leak | Every service the user can reach | One audience, one short window |
| Audit | "user X did Y" — good for business audit | "service A called B as service A" |
| The footgun | Described below | More moving parts: a broker, a policy, a new failure mode |

> **INTERVIEW TRAP — THE SCOPE-UNION FOOTGUN**
>
> The intuition is "propagate the caller's token so the downstream knows who the user is" —
> which sounds safer than inventing a service identity. It is safer for *audit* and worse
> for *privilege*. The problem: **the downstream's effective authorisation becomes whatever
> the original user's token carries**, so a service that a privileged user calls now runs
> with that user's scopes. Aggregate that across your call graph and a service can
> accidentally hold the union of everything its callers can do — so any user who can reach
> it can do it. The control is **scope narrowing on propagation**: the caller replaces the
> token with one carrying only the scopes the downstream actually needs, for one audience,
> ideally with a short expiry. If you cannot narrow, you should be exchanging instead.

### 7.4 Workload Identity and the Real Win

The strongest version of this is not "mTLS" — it is **no static credentials anywhere**.

```text
  BEFORE — static credentials

    orders-service pod
      env: INVENTORY_API_KEY=ak_live_4f2a...     ← in a Secret, in etcd, in the pod spec
      └─▶ calls inventory with a bearer token from a config value

    problems:
      • the credential exists at rest in etcd and in every pod's environment
      • rotation is a coordinated deploy across every service that holds the key
      • there is no record of *which workload* used it — every pod looks identical
      • a leaked key is valid until someone notices and rotates


  AFTER — workload identity (SPIFFE, or the cloud equivalents)

    orders-service pod
      identity: spiffe://acme/prod/eu/orders     ← derived from where it runs,
      certificate: short-lived (24h default, hours with aggressive rotation)   NOT from
                                                                            a config value

    cloud equivalents:
      EKS  — IRSA:            the pod's service account maps to an IAM role
      GKE  — Workload Identity: the KSA maps to a GCP service account
      Both: the credential is *issued to* the workload by the platform, based on
            where it runs, and is not present in any configuration

    ✓ nothing to store, nothing to rotate, nothing to leak from a config repo
    ✓ the audit record says which workload, from which namespace
    ✓ revocation is a role-binding change, not a secret hunt
```

This connects directly back to Chapter 2: Config Server's encrypted values protect
secrets in a git repository, which is a real improvement but still a static credential in
configuration. Workload identity removes the class of problem, and the cost is a
dependency on the platform's identity provider — which is a dependency worth having, and
one that has to be operated.

### 7.5 Zero Trust, Honestly

The principle is that no request is trusted by virtue of where it came from. Every request
is authenticated, authorised, and encrypted, regardless of network position.

```text
  PERIMETER ASSUMPTION                    ZERO TRUST
  ─────────────────────                   ──────────
  "it's internal, so it's fine"            "authenticate every request"
  "the network segment is trusted"         "network position grants nothing"
  "a compromised pod is still our pod"     "a compromised pod has a valid
                                             identity, and the policy still
                                             constrains what it may call"
  "firewall rules are the control"         "policy is the control; the firewall
                                             is a mechanism underneath it"
```

**The org-level cost is never just the technology**, and saying so is the staff-level part
of the answer:

1. **Every service needs an identity and a policy.** That is a per-service work item, and
   a fleet that went from 3 to 30 services has 30 policies to write, review, and test.
2. **Policies are code with a deployment.** Changing who may call what is a change to a
   config repository, which means the change process you fought for in Chapter 2 applies
   to authorisation too.
3. **The debugging story gets harder.** When a call is denied, the answer is spread across
   the caller's identity, the callee's policy, the mesh config, and the token claims. You
   need tooling that shows the evaluation, and you need someone who can read it.
4. **Latency is not free.** mTLS handshakes and per-hop authorisation cost time on every
   call. Connection pooling mitigates it, and the numbers are real: a full TLS handshake
   plus authorisation check on an unpooled connection is measured in milliseconds, which
   against a 20ms dependency is not nothing.
5. **It can be over-applied.** A team that puts deep authorisation in the mesh for
   internal-only, low-sensitivity calls has added latency and operational surface for a
   threat model that may not apply to those particular calls. Zero trust is a risk-based
   posture, not a uniform one.

> **PRODUCTION RELEVANCE**
>
> The pragmatic shape most mature organisations converge on: mesh mTLS everywhere (cheap,
> uniform, and it removes the "anyone on the pod network can call anything" hole), coarse
> authorisation policy at the mesh (namespace and service level, enforced by people who
> are not the service owners), and fine-grained business authorisation inside the service
> (where the domain rules actually live). Putting domain rules in the mesh is the mistake —
> the mesh cannot know that a user may read *this* order but not another, and the moment it
> tries, you have rebuilt a domain model in YAML.

#### Common Mistakes

- Believing mTLS authorises. It authenticates the caller and nothing more; every
  authenticated workload can reach every other one unless policy says otherwise.
- Adopting a mesh without anyone who can debug a proxy config dump or a certificate
  issuance failure. The control plane is a distributed system and needs an operator.
- Propagating the user's token to services without narrowing scopes, and a service
  accumulating the union of its callers' privileges.
- Putting domain authorisation rules in mesh policy. The mesh can enforce "service A may
  call service B"; it cannot know that a user may read one order and not another.
- Keeping static API keys "just for internal calls" — internal is exactly where the
  credential leaks from a config repo into etcd into every pod's environment.
- Rewriting a business audit log as a service-identity log. Service identity is better for
  *operational* attribution; the business audit question ("which user did this") needs the
  propagated identity or a correlation between the two.

#### Interview Questions — Service-to-Service Security

**Q1. What does mTLS give you, and what does it not give you?** `TRICKY`

mTLS authenticates: both ends present certificates, and the callee learns which workload is
calling — typically via a SPIFFE ID or the certificate CN. It does **not** authorise: a
valid certificate from `orders-service` says nothing about whether `orders-service` is
permitted to make this particular call. The trust consequence is the win — without it,
anything that can reach the pod network can call any internal endpoint with no credential
at all, and with it, the set of things that can call you is the enumerable set of issued
identities. The authorisation question is still entirely open and has to be answered by
mesh policy, token scopes, or explicit checks in the service.

**Q2. Token propagation vs token exchange — what's the decision, and what's the
footgun?** `STAFF`

Propagation forwards the caller's token, so the downstream knows the *user* — good for
business audit, and the reason many teams reach for it. Exchange (RFC 8693) trades the
token for a short-lived, audience-bound one, so the downstream knows the *service* and
authorises against the service's own scopes. The footgun with propagation is that the
downstream's effective authorisation becomes whatever the user's token carries, so a
service called by a privileged user runs with that user's scopes, and across a call graph
a service can accumulate the union of everything its callers can do — meaning any user
who can reach it can do it. The control is **scope narrowing on propagation**: the caller
issues a replacement token carrying only the scopes the downstream needs, for one
audience, with a short expiry. If you cannot narrow, exchange instead.

**Q3. Sidecar-based mesh vs in-process mTLS library — when is each right?** `TRICKY`

The sidecar is right when the estate is polyglot (the mesh does not care what language a
service is in), when you need fleet-wide policy without changing every service's code, or
when identity and policy should be owned by a platform team rather than by each service
author. The in-process library is right when the extra hop matters for latency, when you
want identity and authorisation adjacent to the business logic, or — and this is the one
people skip — when the organisation cannot support a control plane. A mesh adopted without
someone who can debug a proxy config dump becomes a permanent mystery layer between the
app and the network, and that is worse than no mesh.

**Q4. What is workload identity, and why is removing static credentials a real security
win rather than a hygiene improvement?** `STAFF`

Workload identity means a workload's credential is *issued to it by the platform* based on
where it runs — a SPIFFE ID in a mesh, IRSA on EKS, Workload Identity on GKE — rather than
being read from configuration. The win is that the credential is never at rest: it is not
in etcd, not in a pod spec, not in a config repository, and not in a `KEY=` environment
variable. Rotation is a role-binding change rather than a coordinated deploy across every
service holding the key. Auditing becomes "which workload, from which namespace" rather
than "some pod with that key". And revocation stops being a secret hunt. The cost is a
dependency on the platform's identity provider, and on somebody operating it.

**Q5. A team has mTLS everywhere. Are they secure? What's missing?** `TRICKY`

No — and the missing piece is authorisation. mTLS means every workload in the mesh is
*authenticated* to every other, which is a real improvement over "anything on the pod
network can call anything", but it leaves the entire authorisation question open. A
compromised or buggy workload in one namespace can call any service in the fleet and be
believed. What they need next is a coarse namespace/service-level policy enforced by people
who are not the service owners, and then domain authorisation inside the service, because
the mesh cannot know that a user may read one order and not another.

**Q6. What does zero trust cost that a perimeter model does not, beyond the
technology?** `STAFF`

Every service needs an identity and a policy, and a fleet going from 3 to 30 services has
30 policies to write, review and test. Those policies are code with a deployment, so
authorisation changes go through the same change process as configuration. Debugging a
denial is harder, because the answer is spread across the caller's identity, the callee's
policy, the mesh config and the token claims — you need tooling that shows the evaluation
and someone who can read it. Latency is real: handshakes and per-hop authorisation cost
milliseconds on an unpooled connection, against dependencies measured in tens of
milliseconds. And it can be over-applied — putting deep authorisation on internal,
low-sensitivity calls adds latency and surface for a threat model that does not apply
there. Zero trust is a risk-based posture, not a uniform one.

> **CHAPTER 7 SUMMARY**
>
> mTLS authenticates the calling workload and authorises nothing — which is the sentence
> that separates a correct answer from a recited one, because it means the authorisation
> question is entirely open and the trust boundary is the set of issued identities rather
> than the network segment. Token propagation gives the downstream the *user* and is better
> for audit, but the downstream's authorisation then becomes whatever the user's token
> carries, so a service can accumulate the union of its callers' privileges; scope narrowing
> on propagation is the control, and RFC 8693 exchange is the alternative when you cannot
> narrow. Workload identity is the genuinely large win, because it removes static
> credentials from configuration rather than encrypting them. A mesh buys polyglot support
> and fleet-wide policy at the cost of a control plane somebody has to operate — which is
> usually the real constraint, not the technology. And zero trust's cost is org-shaped:
> per-service policies, policies-as-deployments, harder denial debugging, real latency, and
> a strong temptation to over-apply it.

#### Further Reading

- [Istio architecture](https://istio.io/latest/docs/ops/deployment/architecture/) — the sidecar/control-plane/data-plane model, and where the trust decisions actually live.
- [Linkerd features](https://linkerd.io/2/features/) — a lighter-weight mesh, useful for seeing which of these capabilities are separable from the heavier platform.
- [RFC 8693 — Token Exchange](https://datatracker.ietf.org/doc/html/rfc8693) — the specification behind service-to-service token exchange, and the actor/subject/audience model.

## Chapter 8 — Production Antipatterns & the Org Causes Behind Them

Each antipattern here gets three things: what it looks like, what it costs in production,
and **the organisational cause** — because the causes are the useful part. A team that
knows the symptom but not the cause will fix the symptom, and the antipattern will come
back with a different name.

### 8.1 Synchronous Call Chains

**What it looks like.** The request fans out serially. Six dependencies in sequence, each
waiting for the last, because the API "must return everything".

```text
  /api/checkout  →  orders(20ms) → inventory(20ms) → pricing(20ms)
                                                  → fraud(20ms)
                                                  → email(20ms)
                                                  → ledger(20ms)

  p50 = 120ms     p99 = 600ms+     and ONE slow service owns your availability
```

**What it costs.** The p99 is the sum of the p99s, so the chain's tail is the sum of six
tails. Worse than latency: **one slow dependency now owns the availability of the whole
path.** If `fraud` is down, checkout returns 5xx for every user even though four of the
five other steps succeeded — and the four successful steps may have committed partial
state. The serial chain also makes it impossible to degrade one part of the response; you
cannot return a partial order because the chain did not produce one.

**The organisational cause.** *"The API must return everything."* The endpoint's contract
was specified as a complete aggregate, and nobody asked which parts of it are actually
required to render the page. The fix is usually not a distributed-systems fix — it is
declaring a degraded response: return the order with a pending status and let the
downstream results arrive by event.

### 8.2 The Distributed Monolith

**What it looks like.** Services that cannot be deployed independently, share a database,
and ship in lockstep. Different artifacts, one release train.

**What it costs.** Every benefit of splitting is absent while every cost is present: you
have the network latency, the partial-failure surface, and the observability bill of
microservices, and none of the deployment independence. Worse, a deploy that was
independent now coordinates, so a change to service A can break service B at 2am with
neither team expecting it — which destroys the trust in the architecture faster than the
latency does.

**The organisational cause.** Two, and they compound:

1. **A split by technical layer rather than by business capability.** Splitting into
   `api-service`, `service-service`, `worker-service` produces services that cannot be
   deployed independently *by construction* — every feature change touches all three. This
   is the single most common microservice mistake and it is visible in the first diagram
   anyone draws.
2. **One team owning all of them.** Even a correctly split set of services ships in
   lockstep if one team owns all of them, because Conway's law will re-merge the
   deployment process. The service boundary is code; the team boundary is what actually
   produces independence.

> **MUST REMEMBER**
>
> A split by technical layer is not a microservice architecture — it is a monolith that
> pays the network bill. The test: take any single feature request, and count how many
> services have to be changed. If the answer is "all of them", you have a distributed
> monolith and the fix is a redraw, not a refactor.

### 8.3 Shared Database

**What it looks like.** Several services read and write the same tables. The schema is the
API whether anyone said so or not.

**What it costs.** A column rename becomes a coordinated multi-team deploy — and it is a
*coordinated deploy* in the strict sense: every service that selects that column must ship
in the same window, in a known order, or the fleet breaks. The same applies to a new NOT
NULL column, an index that changes a plan, or a constraint that reveals a data assumption
some service was violating silently. The cost is not the migration; it is that the
migration cannot be done without coordinating, forever, which means independent deployment
is a claim the architecture cannot support.

**The organisational cause.** Two, and both are about ownership:

1. **Expediency.** The first version of "service B needs customer name" was a `JOIN` or
   a direct read from B to A's table, and it was the right call at the time. Nothing ever
   revisited it because it works.
2. **No owner for the schema.** Shared schemas are unowned by construction. Nobody is
   accountable for "is this column still needed by anyone", so columns accumulate, and
   every column is a constraint on every future change. The fix is not a technical control
   — it is naming a schema owner, which is an org decision and the one most often deferred.

### 8.4 Retries Without Budgets

**What it looks like.** Every team added retries because their dependency was flaky once.
Nobody coordinated.

**What it costs.** A retry storm. The mechanism, from Volume 10: a slowdown means failures,
failures mean retries, retries mean 2–3× the load on a component that was already
struggling, which deepens the slowdown, which produces more failures. Three layers of
retries means 27 downstream calls per user request. And retries without jitter
resynchronise every client that failed at the same instant, so the recovery is a
thundering herd rather than a recovery.

**The organisational cause.** **Resilience added per-team with no central policy.** Each
team's decision is locally correct — "my dependency is flaky, I should retry" — and the
composition is catastrophic, because no individual team can see the multiplication. This is
the clearest example in this chapter of a problem that *only* exists at the level of the
organisation: each decision is defensible and the sum is an outage. The fix is a central
policy: a retry budget as a percentage of total traffic (a common choice is 10–20%), which
means the *client* sheds retries under load rather than spending them unconditionally.

### 8.5 No Timeouts, or Timeouts Larger Than the Caller's

**What it looks like.** A client call with the library default — which is often no timeout
at all, or 30 seconds of connection timeout plus 30 seconds of read timeout.

**What it costs.** An unbounded call is a resource leak with a timer. It holds a connection
from the pool, and it holds a thread. In a servlet stack, 200 Tomcat threads × a call that
never returns is a completely unavailable service in about the time it takes for enough
traffic to arrive. And a timeout larger than the caller's is worse than no timeout: the
caller has already given up, and your thread is still waiting — you are spending capacity
on a response nobody will read.

**The organisational cause.** **Defaults, plus nobody owning the latency budget.** The
default is invisible, so nobody chose it. And the second half is the harder one: a timeout
is a *contract* between a caller and a callee, and contracts need an owner. The concrete
form of the fix is that every service publishes its own budget, and callers set their
timeouts below it — which means someone maintains that number, and that number is a
design decision, not a config value.

```text
  caller budget: 200ms end-to-end
  ├── orders service:   150ms
  │   ├── inventory:     60ms
  │   └── pricing:       60ms      (parallel — the budget is for the SUM)
  └── (response assembly: 50ms)

  the caller's timeout to orders must be < 150ms
  the caller's timeout to inventory must be < 60ms
  ⚠ a 5s default anywhere in that tree is a thread pool waiting to be drained
```

### 8.6 Chatty Interfaces

**What it looks like.** Twenty calls to fetch one screen. The mobile client calls an
endpoint that fans out to a dozen services, and each returns a handful of records.

**What it costs.** Latency you cannot fix by making any one service faster — it is the sum
over twenty calls. Connection-pool pressure: twenty calls per screen means twenty
connections per active user, and a pool sized for "one request at a time" is now sized for
twenty times the user count. And the failure rate is the *product* of twenty independent
things going right: twenty services at 99.9% availability each is 98% for the screen, and
nobody notices because no individual service looks bad.

```text
  20 sequential calls at 99.9% each:   0.999^20 = 0.980   ← 98% screen success
   20 parallel   calls at 99.9% each:   0.999^20 = 0.980   ← identical, but fast
     20 calls, one  of  which  is 99%:
                                            0.99 × 0.999^19 = 0.980  ← same again

  ⚠ no service is below SLO. The screen is at 98%, and the dashboard
    showing "all services healthy" is telling the truth and being lied to.
```

**The organisational cause.** **A data model built per service rather than per domain.** Each
service designed its API around its own tables, so every consumer has to assemble a
domain object from N service-shaped fragments. The fix is a domain-shaped read API — which
means somebody owning a domain, not a table, and that is a boundary decision (Chapter 1)
repeated at the read side.

### 8.7 Cache as an Unowned Layer

**What it looks like.** Caches with no invalidation strategy, no hit-rate metric, and no
owner. Someone added a cache to fix a slow query, and the layer has been there ever since.

**What it costs.** Stale reads nobody can explain. A cache with no invalidation strategy is
a cache with an unbounded staleness window, and the bug it produces — "the user sees the
old price", "the customer sees the previous address" — has no reproduction, no log line,
and no owner. It also produces **negative caching surprises**: a `null` cached for a key
that is about to be created means the create appears to fail. And the metrics problem: a
cache with no hit-rate metric is invisible in both directions, so a hit rate that collapses
to zero (and the origin database absorbs the full load) is not alarmed on.

**The organisational cause.** **Nobody owns consistency.** A cache is a copy of data that
someone else owns, and the copy has no owner. The two workable arrangements are: the
service that owns the data owns the cache and its invalidation, or the cache is a
deliberate, documented, time-bounded staleness decision (a TTL chosen as a product
tolerance, not as a performance number) with the staleness written down. What does not
work is the third arrangement, which is the default one: a cache nobody chose to be
stale.

### 8.8 Deploying on Fridays, and Manual Release Processes

**What it looks like.** A change-control policy that forbids Friday deploys, a manual
approval step, and a release that takes a human sequence of steps.

**What it costs.** This one is different from the others, and the difference is the point:
**it is a maturity signal, not a cost.** The costs are real but bounded — slower releases,
an approval bottleneck, a knowledge concentration in whoever holds the credentials — while
the signal is diagnostic. Friday deploy bans and manual release steps exist in organisations
whose deploys are *not* safe: not reversible, not observable, not independently
deployable. They are a rational response to a system that has not earned the right to
deploy on a Friday.

**The organisational cause.** It is a stage marker, and the sequence is recognisable:

```text
  "no Friday deploys"
      → automated deploy, no manual step
          → blue/green or canary
              → automated rollback on failed health check
                  → per-service deploys, no lockstep
                      → deploy on any day, and nobody notices which day it was

  each step requires the previous one to be genuinely true:
  you cannot automate a release you cannot reverse, and you cannot
  make a release reversible you cannot observe.
```

The staff-level answer to a candidate who says "we don't deploy on Fridays" is to treat
it as data about the release system, ask which of the four steps the organisation is on,
and note that the constraint is a *symptom* — a good system makes the question irrelevant.
The equally valid staff-level answer is that for a genuinely irreversible change (a data
migration with no reverse), a change window is a legitimate risk decision and not
immaturity. The distinction is whether the constraint is applied to *everything* or
targeted at the thing that is actually irreversible.

### 8.9 The Questions That Predict Operability

If you remember five questions from this volume, these are the five. They are the questions
to ask about *any* distributed system, and a team that can answer all five has a system
that is operable; a team that cannot is guessing during its next incident.

```text
  1. Who owns the retry policy?
     → if the answer is "each team decides", the retry budget is 27×, not 1×

  2. Who owns the schema?
     → if nobody does, a column rename is a coordinated deploy forever
       and the columns will only accumulate

  3. What is the latency budget?
     → if nobody can state the number, every timeout is a library default
       and the whole chain is unbounded

  4. What happens when this one service is entirely down?
     → degraded response, cached value, or hard 5xx for every caller?
       the answer tells you whether the blast radius was ever considered

  5. Can you deploy one of these without the others?
     → the single most diagnostic question. If the answer is no,
       you have a distributed monolith, whatever the code looks like.
```

> **STAFF-LEVEL CONSIDERATION**
>
> Every antipattern in this chapter has an organisational cause, and in four of eight
> cases the cause is a *coordination gap* rather than a technical ignorance. Teams that
> treat these as code-quality problems fix the code and get the antipattern back under a
> different name. The durable fixes are organisational: a central resilience policy
> (retry budgets, timeout ladders, breaker policy) so that locally-correct decisions do not
> compose into an outage; named owners for schemas and caches, so that "nobody owns it"
> stops being the default; and a latency budget published per service, so that a timeout is
> a contract rather than a default. The technical patterns in this volume are downstream of
> those three decisions, not upstream of them.

#### Common Mistakes

- Diagnosing an antipattern without naming its organisational cause, which produces a fix
  that gets reverted the next time the pressure recurs.
- Treating "no Friday deploys" as the problem rather than as a stage marker — the
  constraint is a symptom of a release system that is not yet reversible or observable.
- Answering "who owns the retry policy?" with "the team that owns the client", when the
  multiplication only exists at the fleet level and no individual team can see it.
- Accepting "we don't know what happens when service X is down" as a fair answer, because
  it is the question that predicts the size of the next incident.
- Caching a lookup to fix a slow query without deciding, in writing, how stale it is
  allowed to be.

#### Interview Questions — Antipatterns & Operability

**P1. A team's deploys are gated on a Friday blackout window and a manual approval step.
What does that tell you?** `STAFF`

It is a maturity signal rather than a cost in itself. A Friday blackout usually means
deploys are not reversible or not observable, and the manual step usually means the
rollback is a human procedure with a human holding credentials. Those are rational
responses to a system that has not earned automated deployment, and they mask a real gap
rather than a process preference. The sequence to work through is: automate the deploy
(remove the manual step), make it reversible (blue/green or canary), make it observable
(health checks good enough to gate on), and only then make it independent per service —
after which the question of which day it is becomes irrelevant. The fair exception is a
genuinely irreversible change, where a change window is a real risk decision rather than
immaturity; the tell is whether the constraint is applied to everything or targeted at the
thing that is actually irreversible.

**P2. A service has 20 downstream calls for one user request, and the screen is at 98%
success while every individual service is above 99.9%. Explain the arithmetic.** `TRICKY`

Availability across independent calls is a product, not an average: 0.999^20 ≈ 0.980. No
service breaches its SLO, and the dashboard saying "all services healthy" is
simultaneously true and useless. The compound figure also hides *which* dependency is
responsible when the numbers drift, which is why the screen-level success rate needs to be
measured as its own SLI rather than inferred from the components. The fix is generally to
reduce the number of calls in the path — a domain-shaped read API rather than a fan-out —
and to make partial failure explicit in the response contract, because "20 things must all
succeed" is not an API design, it is a default nobody chose.

**P3. A service is paged because "the user saw stale data". Nothing in the logs explains
it. What's the first question, and what's the underlying issue?** `STAFF`

The first question is whether there is a cache in the path, and if so, what its hit rate
is and who owns its invalidation. A cache with no invalidation strategy has an unbounded
staleness window, and the incident it produces has no reproduction, no log line, and no
owner — which is why it survives so long. Two things then need fixing together: the cache
needs a hit-rate metric and a decision about how stale it is allowed to be (a TTL chosen
as a product tolerance, not a performance number, and written down), and the ownership
question needs an answer, because a cache is a copy of data somebody else owns and the copy
has no owner by default. The deeper version is the same shape as the schema problem: shared
state with no owner is where distributed systems lose their audit trail.

**P4. A service's timeouts are all the library defaults — 30s connect, 30s read — and the
API's own budget is 400ms. What is the concrete failure?** `STAFF`

The service can hold a thread and a pooled connection for up to a minute serving a response
nobody will read, because the caller gave up after 400ms. With 200 request threads that is
a completely unavailable service in the time it takes for enough traffic to arrive — the
library default is not a permissive setting, it is an unbounded resource hold with a timer
attached. The fix is a published latency budget per service, with each caller timing out
below the budget of the thing it calls, so a 400ms API gives its dependencies budgets in the
tens of milliseconds and reserves time for response assembly. The organisational cause is
that a timeout is a contract between a caller and a callee, and no one was made responsible
for either side of it, so both sides took the default.

**S1. A PR adds a cache in front of an expensive lookup. What should the reviewer ask?**
`STAFF`

How stale is this allowed to be, and who decides? A cache added to fix a slow query has an
implicit, unbounded staleness window unless someone chooses a TTL deliberately. The
reviewer should push for: a hit-rate metric and an alert on it (a hit rate collapsing to
zero dumps the full load on the origin database, and is invisible without the metric), a
written staleness decision, and a named owner for the invalidation path. Also worth asking
whether negative results are cached, because a cached `null` for a key that is about to be
created makes the subsequent create appear to fail — which is one of the most confusing
bugs in this category.

**S2. A PR adds `p99: 400ms` to a service's SLO and the dashboard in the PR screenshot
shows a flat line. What is the review comment?** `ADVANCED`

That the line is flat because nothing is being emitted to it, not because the service is
fast — and a green SLO dashboard for a metric nothing reports is worse than no dashboard,
because it converts an unknown into an apparent fact. The reviewer should ask what query
the panel runs, which service actually emits that series, and whether the metric has been
present long enough to have a meaningful percentile. Percentile dashboards also have a
cardinality bill that people forget: a p99 by endpoint is usually fine, a p99 by
endpoint-and-status is usually fine, and a p99 by endpoint-and-user is a memory leak in
the backend (Chapter 5). The general review point: a screenshot is not evidence, and an
SLO with no emission path behind it is a document, not a control.

**D1. Which of the five operability questions would you ask first, and why?** `STAFF`

"Can you deploy one of these without the others?" — because it is the most diagnostic single
question, and the others follow from its answer. If the answer is no, the services are not
independent whatever the code looks like, and every antipattern in this chapter is already
present: the shared database, the coordinated schema change, the retry storm, the unowned
latency budget. If the answer is yes, the fleet genuinely has boundaries and the question
becomes which ownership gaps are producing the incidents you have. It goes first because it
is the only one of the five that is binary and unambiguous — "who owns the retry policy?"
gets an answer like "the team that owns the client", which is true and is exactly the
problem.

**D2. You inherit a fleet of 25 services that all share one database and deploy in
lockstep. What are your first three moves, in order?** `STAFF`

First, measure, because you cannot fix what you have not sized: count the deploys that
require coordination with another team, and count the `ALTER TABLE`s that need more than
one team. That number is the argument for everything else and it is what an executive
will believe. Second, name owners — for the schema, for each service's retry and timeout
policy, and for the latency budgets — because "nobody owns it" is the default that
produces every antipattern in this chapter, and ownership is a decision rather than a
project. Third, pick one boundary and extract it *properly*, with the data migration done
first, because a single well-executed extraction is the only credible evidence that the
rest is possible, and it establishes the runbook the next twelve need. What I would
deliberately not do first is start a broad rewrite or split several services at once:
without an owner and a measurement, the new services inherit every one of the existing
couplings and you have a larger distributed monolith.

**D3. Is it ever the right call to keep a service boundary that has stopped earning its
keep?** `STAFF`

Yes, and the two legitimate cases are worth naming because refusing to name them is what
makes the answer sound like a slogan. A boundary can be right for reasons that outlive the
original one — a team that has since formed and now owns that capability, or a data
ownership boundary that is real regardless of deployment frequency. And a boundary can be
right *because removing it is expensive*: unmerging two services with cross-cutting
contracts, a merged schema, and two on-call rotations is a project, and the cost has to be
counted before declaring the boundary worthless. What is not legitimate is keeping a
boundary on inertia alone, because the cost is not neutral — two services means two
pipelines, two dashboards, two sets of runbooks, and a network hop in the request path, all
paid forever for a reason nobody can now state. The diagnostic is the same one as always:
if the answer to "what does this split buy us today" is a historical reason, the honest
options are to re-earn the boundary or merge deliberately, not to keep paying for it
quietly.

> **CHAPTER 8 SUMMARY**
>
> Every antipattern in this chapter has an organisational cause, and in most cases the
> cause is a coordination gap rather than technical ignorance — which is why fixing the
> code without naming the cause produces the same antipattern under a new name.
> Synchronous chains come from "the API must return everything"; the distributed monolith
> from splitting by technical layer with one team owning all of it; the shared database
> from expediency plus no schema owner; retry storms from per-team resilience with no
> central policy; missing timeouts from defaults plus nobody owning the latency budget;
> chatty interfaces from a data model built per service rather than per domain; the
> unowned cache from nobody owning consistency; and the Friday blackout from a release
> system that is not yet reversible or observable. The five questions in 8.9 — who owns
> the retry policy, who owns the schema, what is the latency budget, what happens when one
> service is entirely down, and can you deploy one of these without the others — are the
> ones that actually predict whether a distributed system is operable, and the fifth is
> the most diagnostic: if the answer is no, you have a distributed monolith whatever the
> code looks like.

#### Further Reading

- [Microservices](https://martinfowler.com/articles/microservices.html) — the essay's deployment-independence and bounded-context sections are the ones this chapter is arguing from.
- [MicroservicePremium](https://martinfowler.com/bliki/MicroservicePremium.html) — the distributed-monolith antipattern by name, with the reasoning about why independently-deployed-but-coupled services are the failure mode.
- [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) — the counter-case, and the argument for extracting one boundary properly rather than starting distributed.

---

### End of Volume 11

That is the series. There is no Volume 12, so this is the consolidation rather than a
pointer — the point where the eleven volumes resolve into one thing, which is that **a
Spring application is a set of mechanisms, and almost every production incident is a
mechanism operating correctly in a context nobody examined.**

Read across the volumes and the same four questions appear every time:

**1. What is actually on the call path?** Nearly every silent failure in the series is a
mechanism that is not in the path. `@Transactional` on a self-invoked method (Volume 3), a
`@TransactionalEventListener` with no active transaction (Volume 1), a proxy that is not
there (Volume 2), an `ApplicationEvent` listener on a thread that no longer has the
`SecurityContext` (Volume 1), a `BPP` that was never registered because the class is not
in the scan (Volumes 1 and 7), a `@Value` that evaluated before the bean it referenced
(Volume 1), a retry annotation on a method Spring never proxied. Before you debug a Spring
mechanism, confirm the mechanism is *engaged* — that is the first question, and it is the
answer to a surprising number of "why isn't this working" incidents.

**2. What owns the resource?** Every volume converges on ownership. The bean that holds a
`DataSource` owns the pool and its sizing. The team that owns a table owns the schema and
its migrations. The service that owns a cache owns its invalidation. The team that owns a
dependency owns the retry, timeout, and breaker policy for calls *into* it — and nobody
else. The volume-11 chapters are the sharpest version of this: the antipatterns in
Chapter 8 are almost all "nobody owns it", and the fixes in Chapter 6 are almost all
"now somebody does". Unowned resources are unmonitored, un-tuned, and un-migrated, and the
incident is always the first person to notice.

**3. What is the number, and when does it stop holding?** Volume 1's `basePackages = "com"`
in a monorepo. Volume 2's thread-per-`@Async`-task default. Volume 5's N+1 and its
`hibernate.default_batch_fetch_size`. Volume 7's lazy-initialisation converting a slow
startup into a slow first request. Volume 10's `flatMap` concurrency of 256. Volume 11's
six serial hops at 20ms. Every one of these is correct guidance with a stated boundary,
and a candidate who says only the rule without the boundary has memorised a rule rather
than a mechanism. The habit to build: **say the number, then say the condition under which
it no longer holds.**

**4. What is the failure mode, and does anything detect it?** Every mechanism in the series
has one. `SimpleAsyncTaskExecutor` creates a thread per task. `AsyncUncaughtExceptionHandler`
logs and swallows. `@Async` and no rejection handler means silent loss. A `fallbackMethod`
returning a success-shaped response means an outage with a 0% error rate. An unbounded
timeout means a resource leak with a timer. A metric tagged with a user ID is a memory leak
in the backend. A distributed system adds a whole category on top: mechanisms that work
perfectly and whose *composition* is catastrophic — three layers of retries, each team's
decision locally correct. The staff-level question is not "is this pattern implemented
correctly" but "when this pattern misbehaves, who finds out".

So, the whole series in one paragraph: **the container's proxy chain, the transaction
boundary, the connection pool, the thread pool, the event loop, the service registry, the
circuit breaker, the trace header, the outbox relay, and the schema are all the same kind
of thing — a mechanism that is correct in isolation, that someone must own, that has a
number attached to it, and that fails in a specific, nameable way.** The interview question
is never "what does this annotation do". It is "who owns this, what is the number, and what
does the failure look like at 3am".

### The Questions That Connect the Whole Series

Worth being able to answer cold, because they are asked in almost every senior loop and
they are the ones that reveal whether the candidate has operated anything:

- **"Walk me through what happens between an HTTP request arriving and a `@Transactional`
  method committing."** Volumes 1 → 5 → 6 → 4 in sequence: the servlet container, the
  `DispatcherServlet` and handler resolution, argument resolution and the filter chain
  (Volume 5), the security filter chain establishing the context (Volume 8), the proxy
  chain intercepting the transaction (Volumes 3, 4), the `EntityManager` and the
  persistence context (Volume 6), the connection pool (Volume 6), the commit. Then the
  senior extension: which of those steps is a network call, and which of them is bypassed
  if the method is called internally rather than through the proxy.
- **"A service works in every test and fails in production. What is the class of
  bug?"** The answer is nearly always a mechanism that is present in a context test does
  not reproduce: proxy not engaged, profile not active, property precedence (Volume 1),
  lazy initialisation deferring a failure (Volumes 2, 7), an event on a different thread
  (Volume 1), a bounded pool that test load never fills (Volumes 6, 9), or a timeout that
  no test ever waits for.
- **"What would you monitor on this service, and what would you alert on?"** Volume 7's
  Actuator surface, Volume 5's metrics and cardinality limits, Volume 11's fallback-rate
  metric — and the key distinction between a metric worth a dashboard, a metric worth an
  alert, and a metric that is a memory leak if you emit it.
- **"How do you know a change is safe to ship?"** Volume 9's test pyramid, Volume 11's
  expand/contract discipline, Volume 2's lifecycle callbacks that make a bean creation
  non-idempotent, and Volume 4's assumption that a migration and a deploy are the same
  window. The staff answer is a health check good enough to gate an automated rollback,
  which is why the release-process question in Chapter 8.8 is a maturity marker.

## Chapter 9 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). This is the most staff-level bank in the set, and it
is deliberately **D**-weighted: the design questions are what separate a candidate who has
configured these patterns from one who has operated them, because operating them is what
produces the judgement to decline them.

### The Microservices Trade-off

**D1. Would you split this monolith into services? What would you need to know first?**
`STAFF`

I would need to know three things before answering, and the first two are not technical.
How many teams will own the pieces, and can any of them currently ship without another
team's permission — that is the Conway's law test, and a blocked release is the only
convincing reason to split. Second, whether the data supports a boundary: can a candidate
service own its tables without a cross-service join in the request path. Third, what the
latency budget is, because adding a hop to an already-serial path is a regression that
someone will have to justify to an SRE. Codebase size is not on the list — a 400k-line
codebase that deploys weekly is not a microservices problem. With fewer than about five
teams and no coordination bottleneck I would recommend a modular monolith with enforced
boundaries, and I would say so even if nobody asked.

**D2. When is a modular monolith the correct answer, and how do you know you are not just
rationalising staying where you are?** `STAFF`

It is correct when there are fewer than about five independent teams, one deployable
already ships without coordination, the domain is still changing, the data is one coherent
model, and the latency budget is tight. The rationalisation test is which argument is
actually doing the work: "we are too big" is rationalising, because a large codebase
deploys fine and the real problem is usually a build or release constraint a pipeline fix
would solve. "Two teams cannot ship without each other's permission" is not rationalising.
There is a second rationalisation worth naming too — reluctance to change, dressed as
architectural maturity — and the way to tell the difference is whether you can name the
specific thing a service split would fix. If the answer is "we would feel more modern",
the honest answer is that the monolith is the right answer.

**D3. You have six serial dependencies at 20ms median. The p50 is fine at 120ms. Why is
this still an incident, and what do you change?** `STAFF`

Because users experience the tail, not the median. The p99 of a sum is roughly the sum of
the p99s, so six hops at 20ms median give a p99 closer to 600ms and a p99.9 in seconds —
and that is where the timeouts, the retries, and the failed checkouts live. The change is
not making any service faster; it is removing serial dependencies. Three of those six calls
are probably independent of each other, and making them parallel takes the p50 to 60ms and
the p99 to about 120ms, at the cost of making partial failure more likely — which is then
handled by the Saga machinery. The second change is the latency budget: each service should
publish its own budget, callers should time out below it, and every one of those six
timeouts should be explicit rather than a library default.

**D4. A team wants to extract a service from a shared database. What is the plan, and what
is the part they will underestimate?** `STAFF`

Plan: create the new schema, dual-write through an outbox row in the same transaction
(never a synchronous call inside it — that is the dual-write bug), backfill, verify with
row counts and checksums, switch reads behind a flag per endpoint with a metric, stop
writing to the old table, and drop it a month later in a separate change so the rollback
window is real. What they underestimate is the data side, not the code: the foreign key
from `order_line` to `orders` becomes a cross-service consistency problem, and any query
that joined those tables in the request path needs denormalisation or an extra hop. The
other thing they underestimate is organisational — deciding who owns the extracted table is
a product-ownership conversation that surfaces disagreements nobody had recorded. I would
also insist on expand-before-contract: nothing is renamed or dropped until every reader
has shipped.

**D5. A service split by technical layer — `api`, `services`, `workers`. Is this a
microservice architecture?** `STAFF`

No. It is a monolith that pays the network bill, and the name is the only difference. The
diagnostic is to take any single feature request and count how many of the three have to
change — if the answer is "all of them", they cannot be deployed independently by
construction, which means you have the latency, the partial-failure surface and the
observability cost of microservices with none of the deployment independence, and every
release is still a lockstep one. The fix is a redraw by business capability, not a
refactor of what is there: bounded contexts, each owning its data, each with a team that
can ship without asking anyone. And if the split is not redrawn, the honest advice is to
undo it, because three deployables that must ship together are three deployables you are
paying network latency to coordinate.

**D6. Is there ever a case for shared-database access between services?** `STAFF`

One, and being able to name it is what distinguishes the answer from a slogan. A read-only
analytical consumer that must join across several domains — a reporting or warehouse load —
is a legitimate reader of a shared schema, provided it has no write authority, no need for
independent deployment, and an explicit documented contract. A second, weaker case is a
very small team that has not hit a deployment bottleneck and should not pay the cost of the
split yet. What is never right is a *writer* into a shared schema: the moment a service
writes, it needs to own its data, because a shared schema makes a column rename a
coordinated multi-team deploy and no amount of code separation changes that.

**D7. When is the extra hop of a service split acceptable, and who decides?** `STAFF`

It is acceptable when the boundary buys something the hop does not cost away: independent
deployment under team pressure, independent scaling because the load is genuinely different,
or a data ownership change that requires a real boundary. It is not acceptable when the
argument is code organisation — because a module boundary gives you the same reasoning
benefits with none of the network cost, and a split made on that basis usually ends up as a
distributed monolith. The decision is not purely technical, because the trade is between
latency and organisational throughput, so it is a decision the tech lead and the engineering
manager make together. What I would insist on is that whoever asks for the split can state
the specific thing it fixes; "we need microservices" is not a thing it fixes.

### Discovery & Configuration

**P1. Every service in one availability zone returns `NoInstanceAvailable` at 09:14. CPU
is normal. What do you check, in order?** `SCENARIO`

Eureka client cache and staleness. The first question is whether the clients are configured
with a bounded staleness window: if it is zero, a registry fetch failure discards the local
snapshot and converts a discovery outage into an application outage across every dependent
service, which is the incident. The second is the lease relationship — if
`lease-renewal-interval-in-seconds` is at or above `lease-expiration-duration-in-seconds`,
instances get evicted under normal conditions and the registry empties without anyone
noticing. The third is whether the zone's clock or network is causing renewals to be
dropped. And the fix is not "add more retries" — it is a staleness window plus alerting on
registry refresh failures separately from the 5xx rate, so the two problems are
distinguishable.

**P2. A partition in the service registry splits the fleet. Half the consumers keep
working and half do not. What is happening, and what is the design decision underneath?**
`ADVANCED`

Eureka is AP, so both halves of a partitioned registry keep serving with incomplete views —
and each half routes to instances the other half believes are dead, which makes a discovery
partition a mass misrouting event rather than a clean one. A CP registry (Zookeeper-based,
or Consul configured for consistency) would instead have the minority side stop serving,
trading availability for a single truth, and the failure would be loud rather than a
subtle routing error. The design decision underneath is a choice about which failure you
would rather have: an availability loss that is visible, or an availability loss that is
silent and misdirected. It is also a decision to make explicitly — a team that did not know
which model they were running cannot answer "what happens on a partition" during one.

**S1. A PR registers `/actuator/health` as the service-discovery health check. What is the
review comment?** `STAFF`

That it will deregister the service when a dependency fails, which is a total outage caused
by a partial one. `/actuator/health` is the composite check — it includes the database, the
disk, and every other contributor — so a slow database marks every instance down, the
registry removes them all from rotation, and a service that could still have served most of
its traffic receives none at all. It should be `/actuator/health/liveness`, which answers
"is this process irreparably broken" and nothing else. If the intent was to shed traffic
when the service genuinely cannot serve, that is `readiness`, and it is a deliberate policy
with a real cost, not something to arrive at by editing a URL.

**S2. A PR changes `spring.cloud.loadbalancer.retry.next-service` to `true`. What should
the review ask?** `TRICKY`

What kind of failures will it retry. Moving a retry to a different instance means a genuine
application-level failure — a validation error counted as a 5xx by an overly broad handler, a
bug that throws — gets retried against every instance in the service, multiplying load
precisely when the fleet is least able to serve it. Retrying on the same instance at least
respects the state of the one thing that might be recovering. The legitimate use for
`true` is retrying a connection-level failure to a specific instance, and the review should
establish that the failure classification is narrow enough that this is what happens.

**D1. What should happen when the service registry is unreachable — fail fast, or serve
stale?** `STAFF`

Serve stale, under a bounded window. Failing fast converts a discovery outage into an
application outage across every service that needs discovery, which is strictly worse
outage topology. Serving stale data indefinitely is also wrong, because you end up routing
to hosts that died hours ago. The answer is the middle: serve the last known good registry
for 30–60 seconds — enough to ride out a transient registry problem without human
intervention — and then drop instances so you fail fast rather than sending traffic into a
void. What makes this defensible is that it is a deliberate risk decision with a written
rationale, not a default, and that registry refresh failures are alerted separately from
5xx rates so the two failure modes are distinguishable at 3am.

**D2. Config lives in a git repository served by Config Server. A config change went out and
broke half the fleet. What should have been true beforehand?** `STAFF`

Three things. Compatibility: a config change is a deploy that skips the build, so during a
rolling update both versions of the code are live, and a property that new code expects
must not be one you removed. That means properties are additive, and deprecation is a real
process with a removal date — never a rename in the same change. Testing: a YAML file
gets no review that can tell you whether a timeout is sane, so the candidate config should
run against the same integration suite as a candidate build, which is cheap if the suite
already exists. Rollback: `git revert` plus a refresh, which only exists if the values were
never hand-edited in a KV store — and I would ask for a check on that, because a config
system that can be edited outside git has no rollback story and no audit trail. Also worth
flagging: the encryption in Config Server protects values at rest in the repository, not in
transit and not in the application's memory, and any real secret with a rotation story
belongs in a secret manager that a property references.

**D3. Is a config server the right call, or is it a single point of failure you do not
need?** `STAFF`

It is the right call when you want configuration versioned, reviewed, and rolled back with
the same machinery as code — because a config change is a deploy, and the reason that is a
problem is usually that the changes are not going through change control. The wrong reason
to adopt one is "so we can change values without a deploy", because the values still need
a deploy-equivalent event and the config server only relocates that. The single-point-of-
failure concern is real and has to be answered explicitly: what does an application do when
config is unreachable at startup, and is that decision made per service? `fail-fast: true`
means the service refuses to start, which is right for one that must not run with wrong
values and wrong for one that could start from a last-known-good cache. Also, the honest
caveat is that a config server does not solve secrets — it stores them, encrypted, next to
the code that uses them.

### Gateway

**P2. A custom gateway filter causes p99 to jump from 30ms to 3s at 40% CPU. What is the
first thing to check?** `SCENARIO`

Whether the filter blocks. The gateway is event-loop based, so one blocking call in a filter
stalls every request handled by that loop, and there are only a handful of loops per
process — which is why CPU is normal and latency is catastrophic. The usual culprits are a
JDBC query, a `RestTemplate` or other synchronous HTTP client, a `Thread.sleep`, or a
legacy SDK doing file I/O. The second check is whether it blocks only under load, which
points at a connection pool or a rate limiter rather than a static block. The fix is
reactive composition or an offload via `Mono.fromCallable(...).subscribeOn(Schedulers
.boundedElastic())`, and the prevention is BlockHound in the test suite so the next one
fails a build rather than a latency SLO.

**T3. A route has `Path=/api/orders/**` and `StripPrefix=1`, and the service returns 404
for every request. What is the service receiving?** `TRICKY`

`/api/orders/123` becomes `/orders/123` — `StripPrefix=1` removes exactly one leading
segment, so the request the service sees still has the `orders` prefix. The usual cause is
a mismatch between the public path shape and the service's internal path: with
`Path=/api/orders/**` the conventional pairing is `StripPrefix=2`, which produces `/123`.
The tell is a 404 from the service with a 200 at the gateway, which distinguishes a routing
or path-mapping problem from a service-side failure — and if the service has a context path,
the count changes again, which is why reading the gateway log's request URI is the fastest
diagnosis.

**D1. When is a gateway the wrong layer?** `STAFF`

When it needs business logic, and when it has stopped being small. A gateway that
aggregates responses, computes a price, or holds domain state is a component with a
different owner and a different blast radius, whose behaviour cannot be deployed
independently and cannot be tested against its domain — and it is also the most natural
place in the architecture to accidentally rebuild the monolith you split up. It is also
wrong as a layer when it is the only one: every request through the product passes through
it, so its availability is the product's availability and one bad config change takes down
every route. And there is a middle case worth naming — a gateway that has become a session
store or a rate-limit state holder has acquired an availability constraint that a stateless
proxy did not have. The healthy shape is small: routing, auth termination, rate limiting,
observability, and nothing else.

**D2. Is gateway-level rate limiting the right place for a limit, and what is the
alternative?** `STAFF`

It is the right place for a *global* or *per-tenant* limit on inbound traffic, because the
bucket is global by construction and you have one place to change it. It is the wrong place
for protecting a downstream dependency, because a gateway limiter limits requests to the
gateway, not the load on the thing you are protecting, and because a limiter configured
with a per-instance backend silently becomes N times the limit under scale-out. For
dependency protection the right tools are a bulkhead and a client-side limiter with an
external bucket, and they belong with the client that makes the call. The other thing worth
saying is that a gateway limiter is a blunt instrument: it can only decide based on what it
sees at the edge, and by the time you have figured out which tenant is misbehaving at the
edge, you have usually got the answer from the service's own metrics already.

**D3. Should the gateway terminate TLS for internal service-to-service traffic?** `TRICKY`

Usually not, in a mature setup. The gateway is a good place to terminate TLS for *external*
traffic — one certificate, one rotation, one hardening surface at the edge. For internal
traffic, if a mesh is in play it handles mTLS between workloads with workload identities, and
terminating TLS in the gateway just means re-encrypting immediately while losing the
ability to see which workload is calling. The question to ask is not "who terminates TLS"
but "who holds the identity of the calling workload", because the modern answer is that it
is the mesh rather than the router. The exception is a small platform with no mesh, where
the gateway is the only place identity can be established, and doing nothing is worse.

### Resilience

**D1. Is a circuit breaker the right answer for a slow dependency?** `STAFF`

Usually not, and that is the interesting part of the answer. A breaker protects a dependency
that is *entirely down* by failing fast and giving it room to recover. A slow dependency is
a different problem: it wants a timeout sized to the caller's latency budget, a bulkhead so
it cannot consume all the calling threads, and — if the slowness is persistent rather than
intermittent — a `slowCallDurationThreshold` that lets the breaker act on latency without
waiting for errors to appear. A breaker applied to a merely-slow dependency with an
aggressive threshold makes the outage worse, and this is the part worth dwelling on: while
the breaker is open, *zero* requests reach the dependency, so a service that would have
served 70% of requests at high latency now serves 0% — and because the failures are fast,
the callers' breakers trip too, and one slow dependency becomes a fleet-wide error in
seconds. The breaker answers "what if it is completely down"; latency is answered by
timeouts and bulkheads.

**D2. A team has `@Retry` and `@CircuitBreaker` on the same method. How do you know which
is outermost, and why does it matter?** `ADVANCED`

`@CircuitBreaker` is typically the outer annotation and `@Retry` the inner one on a method
with both, and that ordering is the correct one — but the point is that it has to be
understood, not assumed, because the reverse breaks the pattern's own purpose. With
`@Retry` outermost, each attempt is a separate call the breaker observes, so three attempts
count as three failures for one user request: the breaker opens roughly three times faster
than the real failure rate, so it trips on a system that is not as broken as it looks, and
the amplification it was supposed to contain is what trips it. With the breaker outermost,
it sees one logical call, the retries happen inside it, and the failure rate reflects
user-visible failures. The rule that generalises: the breaker goes outermost, because its
purpose is to protect the dependency from everything happening inside it.

**D3. What is the retry budget, and why is "each team decides" a bad policy?** `STAFF`

A retry budget is a limit on retries expressed as a *percentage of total traffic* — commonly
10–20% — rather than a fixed count per call. The client spends its budget opportunistically
while the dependency is healthy, and under load the budget is exceeded and further retries
are shed, so the load on a struggling dependency stops growing exactly when it needs to
stop. The reason "each team decides" is a bad policy is a composition argument: every
individual team's decision is locally correct, and the multiplication is what causes the
storm. Three layers of retries means up to 27 downstream calls per user request, all of
them landing on the component with the least spare capacity. Nobody's decision is wrong, and
the sum is an outage — which is why the fix has to be a central policy rather than a
per-team review, and why it also has to include jitter, because a budget without jitter
resynchronises every client that failed at the same instant.

**D4. A team relies on Resilience4j's `@RateLimiter` to protect a third-party API with a
documented 50 rps ceiling. What's the problem?** `STAFF`

That the limiter is per-instance and in-memory, so the configured number is not the number
the system enforces. Ten rps across five instances is 50 rps — the right answer by
coincidence — but scale to fifty instances for a traffic event and you are sending 500 rps
at a provider that will start rate-limiting you in response, and the protection is
invisible until the moment you need it. The fix is to distribute the limit externally:
Bucket4j against Redis, or a limiter at the gateway where the bucket is global by
construction. Dividing the target by the instance count and recomputing on scale events
works but is fragile in a way that will eventually fail during the scale event, which is
the worst possible time. This is the same failure shape as an in-memory gateway rate
limiter, and both exist because "per instance" is the default and nobody reads it as a
fleet-wide statement.

**D5. Thread-pool or semaphore bulkhead for a dependency that can hang?** `STAFF`

Thread-pool, if you can afford the threads, because it is the only one that contains the
damage. With a pool, the bulkhead's threads are dedicated to that dependency, so a hung call
blocks only those threads and every other bulkhead is unaffected — the containment is
structural. With a semaphore, the caller threads are shared, the hung call holds its permits
until it times out, the bulkhead stays saturated for the duration of the hang, and new
calls are rejected only after paying a full call's worth of delay; the blast radius is
every caller sharing those threads. The costs of the pool are a thread per concurrent call
— roughly 1MB of stack each, so 50 concurrent calls is ~50MB — and a hard ceiling on
throughput, so `maxThreadPoolSize` set too low converts a throughput problem into
self-inflicted queueing. Neither is safe without a timeout, and a semaphore bulkhead is
entirely reasonable when the calls are short and latency-bound rather than hang-prone.

**S1. A PR adds `fallbackMethod` that returns a cached result. What is the review
comment?** `ADVANCED`

Ask where the fallback rate is alerted on. A fallback that returns a success-shaped
response removes the outage from the alerting system: the error rate is 0% while every
request is being served from data that predates the incident, so the business is quietly
returning wrong answers and nothing pages anyone — and invisible outages last longer because
nothing creates pressure to fix them. The review should push for a first-class
`fallback.invoked` counter with an alert on its rate, so the degradation is an outcome
rather than a silence. Worth noting alongside: a fallback that returns stale *data* is
different in kind from one that returns stale *capacity* (a cached price versus a cached
queue position), and the first needs a TTL and an owner, the second usually just needs to
exist.

**D2. Is it better to have a fallback that returns an error or one that returns degraded
data?** `STAFF`

Neither universally, and the decision is a product judgement about how wrong the degraded
data can be. A cached price that is two minutes stale is usually better than a failed
checkout; a cached price that is a day stale during a promotion is not. The engineering
requirement is the same either way: the degradation must be *measurable*, because the whole
danger of a fallback is that it removes the signal. So the answer is: return the degraded
data if the product can tolerate its staleness, return the error if not, and in both cases
emit a fallback-rate metric and alert on it — plus give the fallback a TTL and an owner,
because "how stale is this allowed to be" is a question with no default answer.

**P3. Error rate spikes across four services simultaneously, latency is low, and every
failing service's dependency shows a spike in breaker rejections. What happened?** `SCENARIO`

A breaker cascade from one dependency. The originating service's dependency degraded, its
breaker opened — and because the failures are *fast* once the breaker is open, the callers
saw immediate errors rather than slow ones, their own breakers tripped on the error rate,
and the failure propagated outward as a rapid fleet-wide error. The important detail is the
combination of low latency and high error rate: that is the signature of fail-fast rather
than of a genuinely broken dependency, and it is what distinguishes a cascade from a real
outage. The immediate fix is to widen or disable the breakers on the cascade path, which
restores the degraded-but-serving behaviour; the structural fix is the threshold
configuration, because a breaker that opens at 50% is going to do this to you again, and
thresholds of 75–90% with a meaningful `minimumNumberOfCalls` are what make a breaker
protect a dead dependency rather than trim a slow one.

### Tracing & Observability

**P4. An async consumer's work is not visible in traces, and traces appear to stop at the
broker. What is missing?** `TRICKY`

The trace context is not being read out of the message. Trace context travels in the message
headers — the same `traceparent` or B3 fields used for HTTP — and a consumer has to read
them off whatever the broker exposes as message metadata and re-inject them explicitly. A
consumer that does not starts a *new* trace, so the asynchronous half of the system is
invisible. This is worse than having no traces, because it looks like an explanation: the
sync part is coherent and the trace simply ends. The test is to publish an event that
triggers a slow downstream call and check whether the trace continues through the consumer.

**D1. A service has Micrometer `Observation`s everywhere and the trace backend is empty.
What is the likely cause?** `ADVANCED`

The tracer bridge is missing. An `Observation` is a vendor-neutral description of something
that happened and it always produces a metric, but it only becomes a *span* when a bridge
is configured — `micrometer-tracing-bridge-otel` or `-bridge-brave` on the classpath plus
an `OpenTelemetry`/`Tracer` bean. Without the bridge you get excellent metrics and no
traces, and nothing warns you, which is why the symptom is so confusing: the application
looks fully instrumented. The related configuration that is also worth checking is the
propagator, because a fleet with mixed W3C and B3 propagators produces traces that break at
the boundaries between them, intermittently, which is much harder to diagnose than an
absent bridge. The general lesson is worth stating: instrumentation that degrades to
"metrics only, silently" is a gap in the design, not in the config.

**D2. Someone wants to put the user ID and order ID in baggage so traces are searchable by
customer. What is wrong with it?** `STAFF`

Three problems, and they are different in kind. First, security: baggage is propagated to
every service the request touches and to third parties, so a user identifier is copied into
every log line, every trace store, and every outbound header — one disclosure multiplied
dozens of times into systems with different retention and access controls. PII in baggage
is a security problem, not a tidiness one. Second, cost: every distinct baggage value
becomes a distinct trace, and the propagation header grows with the number of distinct
values your traffic produces, so high-cardinality values do not belong there at all.
Third, trust: baggage crosses trust boundaries, so a public-facing service must
allow-list or strip inbound baggage rather than trusting it, or an attacker populates your
telemetry. The right home for these identifiers is span attributes and structured logs,
where they are searchable within a trace and do not propagate to anybody else.

**D3. Is 100% trace sampling a reasonable starting position?** `TRICKY`

As a starting point for a small system, briefly, yes — it is how you find out what you did
not know to instrument. As a steady state, no, and the reason is arithmetic: 1,000 rps ×
roughly 16 spans × 60s retention is about a million spans a minute, which is an ingest and
storage cost that arrives on a bill before anyone decided to pay it. The better steady state
is tail sampling: buffer spans until the trace completes, then keep the trace if any span
errored or the total exceeded a latency threshold. That is the only way to keep 100% of
errors and 100% of slow requests while discarding the boring majority, which is what you
actually want from tracing. Its costs are real and should be stated: a collector holding
spans in memory until the decision point, a memory budget, export latency, and a sampling
policy somebody has to own. Head sampling at 1% is not a substitute — it keeps 1% of your
errors.

**D3. A metric tagged with a user ID. What's the failure mode, and how do you fix it
without losing the information?** `STAFF`

The failure mode is in the metrics backend, not your application: a backend holds one time
series per unique tag combination and retains rather than deletes them, so a `userId` tag
creates a permanent series per user that ever exists — a memory leak you cannot see from
the service's own dashboards, and a cost that shows up as an unexplained bill. A metric
tagged with `orderId` is worse, because it is unbounded. The practical limit is a few
hundred distinct label values per metric; beyond that you are not adding information. The
fix is to move the identifier to a **high-cardinality key** — a span attribute, searchable
within one trace — and keep the metric tag to the low-cardinality dimensions you actually
group and alert on, like `payment.provider` or `outcome`. You lose the ability to graph
per-user metrics, which was never something a dashboard should have been doing anyway.

**D1. What can a trace tell you that metrics cannot, and what can it not tell you?**
`STAFF`

A trace can answer the per-request question — which call was slow, from which parent, with
which siblings in parallel — which metrics cannot, because they are pre-aggregated across
every dimension you did not label. What it cannot tell you: *why* a decision was made (a
180ms span says the dependency was slow, not whether it was a lock wait, a bad plan, or an
external call); whether the business outcome was correct (a clean trace of a request that
double-charged a customer is a beautiful trace of a failure); and the typical case, because
your sample is biased towards errors and slow requests, so percentiles computed from kept
traces will not match your metric percentiles and should not be compared. It also does not
show work that is not instrumented, which is most of the interesting behaviour inside a
database. A trace is a map of where time went, and treating it as an explanation is the
misuse that makes tracing look more powerful than it is.

**S1. A PR adds `Observation` names that include the customer ID. What is the review
comment?** `TRICKY`

That the name is a metric name and the identifiers are in the context, and the split is not
cosmetic. Low-cardinality key-values become metric tags, so anything that varies per user
turns one metric into one time series per user — the cardinality problem from a different
direction. The fix is a stable, domain-oriented observation name (`checkout.submit`) with
the varying values in `highCardinalityKeyValue`, which puts them in span attributes where
they are searchable within a trace and cost nothing in the metrics backend. The related
review point is naming discipline generally: an observation name ends up on a dashboard, so
it should describe the business operation rather than the method, and it should not change
every time the method is refactored.

### Distributed Data

**D1. Is a Saga the right answer, or should you use a distributed transaction?** `STAFF`

A saga is the right answer when a business operation genuinely spans services that own their
own data, because that is the only structure available once you have decided each service
owns its tables — and a distributed transaction (XA/2PC) is not a real alternative at that
point, because it requires the participants to share a transaction manager and hold
resources locked for the duration, which is a coupling the boundary was created to remove.
Where it is *not* the right answer is when the boundary is not actually required, because a
saga is a permanent addition: compensating business logic, an at-least-once delivery
problem, idempotent consumers, a reconciliation process, and an operator view of in-flight
sagas. The honest test is whether the operation can be made atomic some other way — if the
"single business operation" is actually two operations that happen to be adjacent in the
request, a local transaction plus an event is simpler than a saga. And note the asymmetry:
compensations cannot be atomic, so anything genuinely requiring all-or-nothing across
services — a ledger debit — usually has to be designed so it does not need it.

**D2. Saga choreography or orchestration, and how do you decide?** `STAFF`

Orchestration once the flow is complex enough that you need to see it. The decision inputs
are the number of participants, the branching (does the outcome of step 2 change step 3?),
and how much conditional compensation there is. With three participants and a straight line,
choreography is genuinely better: no coordinator to deploy, no coordinator to keep
available, and each service owns its own reaction. But choreography's cost is not
infrastructure, it is *legibility*: the flow lives in the event graph, is invisible in any
single component, gets harder to debug as events accumulate, and coupling grows one event
at a time until services react to each other's internal events. Once you have branching or
a failure path, orchestration wins, and the cost you accept is that the coordinator is now a
distributed-system component needing durable state, a lease or leader election so two do not
drive the same saga, and an operator-facing view. That is a real operational commitment, and
it should be made knowingly.

**D3. Why is a compensating action a different piece of engineering from a rollback?**
`STAFF`

Because a rollback undoes a write and a compensation is a new forward business action with
its own semantics, latency and failure modes. You cannot un-send an email — you send a
correction, and a correction is arguably worse than silence for a customer who already read
the first one. You cannot un-charge a card — you issue a refund, a separate transaction that
may take days to appear, so the ledger is inconsistent with reality for that window. You
cannot un-dispatch a parcel. Three consequences: compensation can itself fail, so it needs
its own retry and its own idempotency, because a timed-out refund may or may not have
succeeded; compensation is not instantaneous, so any reconciliation that assumes sagas close
atomically will produce false alerts; and compensation is a rarely-exercised code path,
which is exactly why it needs dedicated tests rather than a place in the coverage report.
A rollback is tested by every test; a compensation is tested by the one test that exercises
the failure path, if there is one.

**D4. A service writes to its database and publishes to a broker as part of one business
transaction. Walk through the failure modes and the fix.** `STAFF`

Three failure modes, all of them real: publish-then-commit gives you a phantom message for a
row that was rolled back; commit-then-publish gives you a lost event if the process dies
between; and a retry of the publish gives you duplicates. The fix is the transactional
outbox: write the business row *and* an outbox row in one local transaction, and have a
relay publish from the outbox. The database is the only thing being made atomic and it does
it natively. The price is that the relay can crash between publishing and marking the row
sent, so delivery is at-least-once and **consumers must be idempotent** — dedup by message
id, with the "processed" marker written in the same local transaction as the business
change, so a crash between them either repeats the work or loses the record. The one thing
to forbid explicitly is the synchronous in-transaction call to the broker, because that
reintroduces the dual-write problem with worse failure characteristics.

**D5. Read replicas and read-after-write.** A user creates an order and immediately gets a
404. How would you fix it, and what is each fix's cost?** `STAFF`

The read hit a replica that had not yet replicated the write. The fixes, in order of how
often they are the right one: session stickiness to the primary for a short window after a
write — simple, correct for this case, and it costs primary capacity for users who are not
reading anything they just wrote; a bounded lag check that routes to a replica only if
`now() - replication_timestamp` is under a threshold, using a heartbeat table on the
primary — more expensive, more correct, and it catches the case sticky sessions miss where
user A wrote and user B read; explicit read-your-writes via a client-supplied version, which
pushes the guarantee onto every read call site; and permanently routing specific hot
aggregates to the primary, which is right for a few aggregates and wrong as a default. The
number to set is a judgment call and the key insight is that **lag is not constant** — a
5-second threshold holds in the steady state and fails during a failover or a long query on
the replica, which is exactly when the failures cluster.

**D6. A team adopts CQRS to fix one slow screen. What have they actually bought?** `STAFF`

A data-migration project. They now have a write model, one or more read models, a
projection pipeline to build and keep correct, a backfill, a replay story, and two models
that can drift — and every future query becomes a change to a pipeline rather than a change
to a repository. The test for whether CQRS is earning its cost is: would you build the read
model even if the database were fast? If the answer is yes, because the query is genuinely
complex or you genuinely need several projections of the same data, then it is paying. If
the answer is "no, but Hibernate made this one screen slow", then the right fix is a better
query, and CQRS is a large permanent structure bought for a small permanent problem. Worth
also asking whether the projections are events-based or poller-based, because that
determines how much of the pipeline you actually own.

**D7. Event sourcing, or not?** `STAFF`

Only where a specific requirement demands it. The genuine drivers are a regulatory audit
trail — which no row-level design gives you for free, because rows show current state, not
history — and temporal queries answered exactly rather than approximately ("what did this
account look like on 14 March"). If neither applies, the costs dominate: event schema
evolution is the hard problem, because an event written two years ago must remain readable,
so you need versioned types and upcasters and you lose the "just add a nullable field"
affordance you have with a row schema; there is no current-state query without a
projection, so you build and maintain one anyway; and everything is eventually consistent,
which means the authoritative state is not queryable in the way developers instinctively
reach for. The bar is "the audit trail is the requirement", not "we want to be the kind of
system that does this".

**D8. Your team has five services and one database. Two services need data from a third's
tables in the request path. How would you unwind this?** `STAFF`

Start by naming the owner of each table, because that conversation is the actual work and
it surfaces product-ownership disagreements that were previously invisible — budget for it
explicitly. Then, for the specific cross-service reads, the cheapest fix is usually
denormalisation: the consuming service stores the field it needs, updated by an event, with
a staleness window the product can tolerate. That removes a network hop from the hot path
rather than adding one, and it is a smaller project than a full extraction. Where the
consumer genuinely needs many fields, a domain-shaped read API owned by the producing
service is the next step. The full extraction — with the dual-write, backfill, verify,
flag-and-switch, and delayed drop — is the right move when the boundary is real, and it
should be one boundary at a time. What I would not do is split the code first and leave the
data, because that produces a distributed monolith that is strictly worse than where you
started.

**P5. A consumer processed the same message twice and created two shipments. What is the
mechanism, and what should have prevented it?** `SCENARIO`

At-least-once delivery, which is the correct behaviour of a transactional outbox relay: it
can crash between publishing and marking the row as sent, so the message goes out twice.
That is not a bug to be eliminated, it is a property to be designed for, and the design
that should have prevented the duplicate shipment is consumer idempotency — dedup by message
id, with the "processed" marker written in the *same local transaction* as the business
change. If the marker is written separately, then a crash between the write and the marker
repeats the work, and a crash the other way loses the record. Two follow-ups worth making
in the review: the side-effect needs its own idempotency key (a real carrier will not dedup
for you), and there needs to be a reconciliation path, because at-least-once plus a
multi-system side effect means the system that is authoritative about shipments is not the
one that consumed the message.

### Service-to-Service Security

**D1. A service mints a service token and calls downstream with it. A bug lets it read
another customer's data. Is this a token problem or an authorisation problem?** `STAFF`

Authorisation. The token correctly established *which service* was calling — that is
workload identity and it worked. What it did not do is constrain *what* that service may
read, and no amount of token hygiene fixes that. The pattern to look for is a service
token with a broad scope held by a service that has many callers: any caller that can reach
it inherits its access, so authorisation has been delegated to network position and to
"whoever is in the calling chain", which is not a control. The fix is that the downstream
must decide based on the *subject* of the business operation, not the identity of the
process — which means propagating the user context (narrowed to the scopes needed) and
authorising on it, with the service identity as the *authentication* and the user
identity as the *authorisation* subject. This is the distinction between authenticating
the workload and authorising the operation, and the second is a business decision.

**D2. When is token exchange worth the extra machinery over propagating a narrowed
token?** `STAFF`

When the downstream should act as the *service* rather than on behalf of a specific user,
and when the fan-out is wide enough that the distinction matters. If `orders` calls
`inventory` on behalf of a user, propagation (narrowed) is right, because inventory's
decisions — is this user's order allowed to reserve this stock — are user decisions. If
`orders` calls `ledger` to post a balance movement, the downstream is acting as a system,
the authorisation is about the caller's service account and its posting limits, and exchange
gives you a short, audience-bound credential whose blast radius is one service rather than
the user's entire session. The costs that push the other way are real: a broker to run, a
policy to maintain, a new failure mode at startup and during outages, and an extra round
trip. The pragmatic default is: propagate and narrow for user-facing calls, exchange for
machine-to-machine calls that carry no user context at all.

**D3. Is a service mesh the right answer, or is it the fashionable one?** `STAFF`

It is the right answer for polyglot estates, for fleet-wide policy without a code change
in every service, and for organisations with someone who can operate a control plane. That
last clause is the one that decides it more often than the technology does. A mesh is a
distributed system with its own availability, upgrade path, and debugging surface, and a
mesh adopted without an operator becomes a permanent mystery layer between the application
and the network — which is a worse outcome than no mesh, because it looks like security
and is not understood. The in-process alternative wins on latency (no extra hop), on
debuggability, and in small organisations. What I would actually say is: if you cannot
answer "who debugs a certificate issuance failure at 2am", do not adopt a mesh yet — get
mTLS another way and revisit when that person exists.

**D4. We have mTLS between all services. Is the internal network still a trust boundary?**
`STAFF`

No, and that is the win — but the boundary has moved rather than disappeared. Previously the
network was the boundary and anything inside it was implicitly trusted; with mTLS, the
boundary is the set of issued workload identities, which is enumerable and small, and
anything without a valid certificate is rejected regardless of network position. The
residual risks are different ones: a compromised workload with a valid identity can reach
everything unless authorisation policy constrains it; a policy error is now the control
point, and policy errors are as damaging as firewall errors were; and identity issuance
becomes a critical path, because a misconfigured issuer is a fleet-wide outage. So the
network is no longer a trust boundary, but authorisation and identity management have
become the new control plane, and they need the same discipline the firewall had.

**P6. A service-to-service call is rejected with 403 in production but works in staging.
What are the likely causes?** `SCENARIO`

Identity first: the workload identity differs between environments. A SPIFFE ID encodes the
trust domain and the namespace, so a policy written against the staging identity is not the
staging deployment — and an IRSA or Workload Identity binding that exists for one namespace
does not exist for the other. Second, token audience or scope: an exchanged token minted for
the staging audience will be rejected by a production policy checking its own audience, and
a narrowed scope that is sufficient in staging may not be if the production path calls an
extra method. Third, a policy that is environment-specific and has not been deployed, or a
network policy that permits the staging namespace topology and not the production one. The
diagnostic order I would use: dump the identity the *callee* sees (not the one the caller
believes it has), then the policy that evaluated, then the token claims — because the most
common cause is the first one, and it is invisible from the caller's side.

**S1. A PR adds a call to a new downstream service, passing the user's token straight
through. What should the reviewer push for?** `STAFF`

Scope narrowing on propagation, or exchange. Passing the user's token straight through means
the downstream's effective authorisation is whatever that user can do, so the service now
acts with a user's privileges — and because callers vary, the service can end up with the
union of everything its callers can do, meaning any user who can reach it can make it do
anything its other callers could. The reviewer should ask: what does the downstream
actually need to know about the user, and what does it actually need to *do*? If it needs
to act as the service, the token should be exchanged for a short, audience-bound one. If it
genuinely acts for the user, the propagated token should be narrowed to the scopes the
downstream requires, for one audience, with a short expiry — and the review should confirm
the narrowed set is written down, because the next person will widen it.

### Antipatterns & Operability

**D1. Your service has a fallback that returns cached data and the error rate is 0% during
an outage. Is the circuit breaker doing its job?** `ADVANCED`

It is doing something, and the question is whether what it is doing is helping. A breaker
that fails fast is doing its job; a *fallback* that then serves stale success-shaped data
is removing the evidence of the outage from every dashboard you have, which means the
pressure to fix it never arrives and the outage ends when the dependency happens to recover
rather than when anyone acts. In the meantime the business is serving wrong answers to
customers. The correct shape is a fallback that is *observable*: a first-class
`fallback.invoked` counter with an alert on its rate, so the degradation is a monitored
outcome rather than a silent one, plus a TTL and an owner on the cached value so its
staleness is a decision rather than an accident. The general principle: **graceful
degradation is a product decision and noticing the degradation is an engineering one, and
they have to be made together** — otherwise the product decision quietly removes the
engineering signal.

**D2. Your team owns 12 services and everything deploys in lockstep. What is the actual
cause, and what would you change first?** `STAFF`

Team topology, almost certainly, and I would look for two things: whether the services were
split by technical layer rather than by business capability, and whether one team owns all
of them. Either alone produces lockstep deployment — the first because every feature
touches every layer-service, the second because Conway's law re-merges the release process
regardless of the code. The first move is not a code change: it is to count the deploys
that require coordination with another team and the `ALTER TABLE`s that need more than one
team, because that number is the argument everything else rests on. Then name owners — the
schema, the retry and timeout policy, the latency budgets — because "nobody owns it" is the
default that produces every antipattern in the chapter. Then extract one boundary properly,
data migration first, because one well-executed extraction is the only credible evidence
that the rest is possible. What I would deliberately avoid is a broad rewrite or splitting
several services at once: without an owner and a measurement, the new services inherit the
couplings and you end up with a larger distributed monolith.

**D3. A service is split into two services along what looks like a clean business boundary,
and after six months they are being changed in the same commit more often than not. What
has actually happened?** `STAFF`

The boundary was drawn along a noun rather than along a decision. "Orders" and "Fulfilment"
look like separate capabilities, but if every fulfilment change also requires an order
change and every order change requires a fulfilment change, they are one capability
described with two words, and the split bought you a network hop and two pipelines rather
than independence. The tell is the co-change rate, and it is the single metric to watch:
measure how often the two are deployed together, and if it is high, the boundary is wrong
regardless of how clean the domain vocabulary looked. The alternatives are deliberately
deliberate: merge them back and pay the cost of unmerging, or find the actual decision
boundary — often something like "who owns the state machine" rather than "which noun does
this belong to". What I would not do is leave it, because the cost of a boundary nobody
uses is not zero: it is a network hop, a doubled deployment surface, and an on-call rotation
split across two teams who cannot independently fix an incident that spans both.

**D4. The team says "we're a microservices shop now" and there are 14 services and one
database. What is the single most useful thing you could tell them?** `STAFF`

Ask which of the 14 they can deploy without the others, and then ask them to count the
`ALTER TABLE`s that needed more than one team this quarter. Those two numbers collapse the
conversation, because they convert an architecture debate into something an executive
believes: if the answer to the first is "not many" and the answer to the second is "all of
them", then the service boundary is not a deployment boundary, and the codebase is
organised as microservices while the *system* is a distributed monolith. The important
framing point is that this is not a failure of effort — it is a predictable outcome of
splitting by technical layer or of one team owning all of them, and it is invisible from
the code because the code does look separated. The fix is not more splitting; it is picking
one real boundary, extracting its data properly, and using it to establish that independent
deployment is achievable at all. Saying that out loud is more useful than another
architecture diagram.

**P7. Three services' teams each added retries after separate incidents. Now a slowdown
becomes a total outage. Walk me through the mechanism and the fix.** `STAFF`

Slowdown produces failures; failures trigger retries; retries multiply load by two or three
at each layer on the component that is already the bottleneck. Three layers means up to 27
downstream calls per user request, all landing on the least resilient component, which
deepens the slowdown, which produces more failures. If the retries have no jitter, every
client that failed at the same instant retries at the same instant, so the recovery is a
thundering herd. The fix is a central policy, not a per-team review: a retry budget as a
percentage of total traffic (10–20%) that clients shed under load, exponential backoff with
jitter, a breaker outside the retry so the amplification is contained, and timeouts sized
to the published latency budget. The organisational point to make explicitly is that every
individual team's decision was correct and the composition was catastrophic — which is why
this can only be fixed by a policy, and why the question "who owns the retry policy?"
belongs in the interview.

**P8. A team has one cache in front of a hot table, added two years ago by someone who has
left. The hit rate metric does not exist. What do you do first?** `SCENARIO`

Measure before you change anything, and treat the absence of the metric as the primary
finding rather than as a side note. You need the hit rate before you can say whether the
cache is earning its keep, and a hit rate that is quietly near zero means every request is
paying the double cost — the cache lookup *and* the origin query — which is a pure
liability that nobody noticed because the origin load was never the constraint it was
supposed to be. Second, establish the staleness window: nobody chose a TTL, so the answer
is "unbounded, and nobody knows when it started", and until that is known, every
stale-read report is unexplainable. Third, name an owner — a cache is a copy of data
somebody else owns, and a copy with no owner is a copy nobody invalidates correctly. The
tempting move is to delete the cache, and it is sometimes right, but deleting it before you
know the hit rate risks turning a load problem into an outage, so measure, then decide.

**S2. A PR adds a `GROUP BY` to a report endpoint that currently makes three sequential
calls to three services. What should the review push for?** `STAFF`

That the right shape for a report is not three service calls assembled per request. The
endpoint is now the sum of three latencies and its availability is the product of three
availability figures, so a 99.9% service is 99.7% for this screen, and nobody's dashboard
shows a breach. The review should ask: is the data needed in real time? A report is almost
always not — so a domain-shaped read model, maintained by the reporting pipeline, serves
this in one query with none of the fan-out. If it genuinely must be live, then the three
calls should at least be parallel, and the response contract should be explicit about which
parts are required and what happens when one is missing. The underlying cause is a data
model built per service rather than per domain, and the fix is somebody owning the report as
a domain rather than assembling it from three service APIs at request time.

**T4. A service has `@RateLimiter(name = "search")` with `limitForPeriod: 10,
limitRefreshPeriod: 1s`, and it is scaled from 5 to 50 instances during a traffic event.
What changes?** `TRICKY`

The enforced rate goes from 50 rps to 500 rps, because Resilience4j's rate limiter is
per-instance and in-memory — the configured number is a per-JVM number, not a fleet-wide
one. The downstream that was sized for 50 rps now receives 500, and the protection that
appeared to be in place is not. The fix is to distribute the limit externally (Bucket4j
against Redis, or a limiter at the gateway where the bucket is global by construction);
dividing the target by the instance count and recomputing on scale events works but will
eventually fail during the scale event itself, which is the worst possible moment. The
general rule worth stating is that any "limit" whose implementation is per-instance is a
limit that grows with the fleet, and the moment your scaling story and your resilience
story disagree, the resilience story is the one that was wrong.

**T5. A saga orchestrator is deployed as two replicas without a leader election mechanism.
What happens when a step fails mid-saga?** `TRICKY`

Both replicas can observe the same in-flight saga and both can drive it, so the saga
advances twice: the compensating action may be issued twice, and the forward step may be
re-issued after it was already completed. The outcome depends entirely on whether the
steps are idempotent, which they usually are not — compensations that are not designed to be
idempotent are the ones that cause visible damage (two refunds, two cancellations). This is
also the failure mode that motivates the whole discipline of idempotent consumers in
Chapter 6. The orchestrator needs a lease or leader election, and ideally per-saga ownership
so two replicas cannot drive the same instance even briefly. The general point: a
coordinator in a saga is a distributed-systems component with a concurrency problem, and
adopting orchestration means accepting that problem explicitly rather than hoping a
framework solved it.
