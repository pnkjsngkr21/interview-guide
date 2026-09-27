---
title: "The Microservices Complete Deep-Dive"
volume: 1
series: "BOUNDARIES, DECOMPOSITION & TEAM TOPOLOGY"
subtitle: "Study & Interview Mastery Guide"
---

# The Microservices Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is a three-volume study guide to the architecture of distributed systems, written for
engineers who already know how to build a backend service and are preparing for senior and
staff-level interviews. It is not a tutorial. Nothing here explains what an HTTP request is.

Volume 1 is the paradigm volume — the material a working engineer is *missing* if they learned
microservices from configuration tutorials. Those tutorials teach you to switch on Eureka and
a circuit breaker. This volume teaches you the question those tutorials skip: **where does a
service boundary go, what does it cost, and what do you do when the boundary is the wrong
one?** Every chapter here is about a decision that is expensive to reverse — a boundary you
draw today that you will be living with for two years, a migration you start that will take
a quarter, an org structure that will quietly dictate your architecture for five years.

The organising question of every chapter is the one a staff engineer gets asked in a real
design review: **not "what is a bounded context", but "how do I decide this one, what does the
wrong answer cost, and who pays for it?"** The recurring frame is a single sentence: **a
service boundary is a bet on the future, and the size of the bet is the cost of being
wrong.** That means a boundary is not decided by a diagram, a noun, or a table list — it is
decided by change rate, data ownership, latency budget, and team topology, and it is
validated by whether the two halves of the candidate boundary ever change for the same
reason.

A candidate who can say *"I would find the seam by looking at co-change in the git history
and at whether a candidate service can own its tables without a cross-service join in the
request path, and I would expect the honest answer to be a modular monolith until six teams
are each blocked by each other's release train"* sounds like someone who has **operated** a
distributed system. That is the register of this volume.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto context-map
topology produces filler. The template is a completeness checklist, not a template to
fill.

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
| Volume 1 (this book) | Foundations — service boundaries, DDD, decomposition, the modular monolith, Conway's law, migration |
| Volume 2 | Communication, Data & Consistency — CAP, idempotency, REST/gRPC, event-driven architecture, messaging, sagas, outbox, data ownership |
| Volume 3 | Operations, Platforms & Evolution — observability, resilience, deployment, Kubernetes, service mesh, scaling, antipatterns |

### Table of Contents — Volume 1

- Chapter 1 — What a Service Boundary Actually Costs
- Chapter 2 — Domain-Driven Design & Bounded Contexts
- Chapter 3 — Finding Seams
- Chapter 4 — Decomposition Patterns
- Chapter 5 — The Modular Monolith
- Chapter 6 — Conway's Law & Team Topologies
- Chapter 7 — Migrating to Services
- Chapter 8 — Interview Scenario Bank

---

# Part 1 — Foundations, Boundaries & Decomposition

## Chapter 1 — What a Service Boundary Actually Costs

### 1.1 The Arithmetic Everyone Gets Wrong

Start with the number, because it is the one that survives the interview and it is the one
most candidates get wrong.

```text
SAME DATACENTRE, service to service        ~0.5 – 1 ms
SAME AZ, kube pod to kube pod              ~1 – 3 ms
CROSS-AVAILABILITY-ZONE, same region       ~5 – 15 ms
CROSS-REGION (us-east → eu-west)           ~30 – 80 ms
CROSS-CONTINENT                           ~80 – 150 ms

None of those numbers is the problem. The CHAIN is the problem.

  SERIAL CHAIN — six hops, 20ms median each

    gateway → orders(20) → inventory(20) → pricing(20)
            → fraud(20) → payment(20) → notification(20)

    p50:    6 × 20ms   = 120 ms      ← the number everyone quotes
    p99:    6 × ~100ms = 600 ms+     ← the number users experience as "down"
    p99.9:  6 × ~350ms = 2 s+         ← the number that generates pages

  PARALLEL — three independent, then join

    gateway → {inventory(20), fraud(20), pricing(20)} → join → payment(20)

    p50:    20 + 20 + 20 = 60 ms      ← 2× better at the median
    p99:    ~100 + 20     = 120 ms    ← 5× better at the tail
```

The rule is short enough to memorise and important enough to be the centre of the volume:
**the p99 of a sum is approximately the sum of the p99s.** Serial hops add their tails;
parallel hops do not.

> **SCALING REALITY CHECK**
>
> A same-datacentre service-to-service HTTP call is **0.5–1ms**; a cross-region call is
> **30–80ms**. Neither number is the problem. The problem is the chain: six *serial*
> dependencies at 20ms median give a **p50 of 120ms and a p99 closer to 600ms+**, because
> the p99 of a sum is roughly the sum of the p99s. The tail is where incidents come from,
> and the tail is entirely a consequence of how you arranged the calls, not how fast any
> one of them is.

Notice what this arithmetic does *not* say. It does not say "avoid network calls." It says
**avoid serial network calls**, and it says the leverage is in the arrangement, not the
per-hop speed. A team that spends a quarter shaving 4ms off a 20ms call has missed the
available win by a factor of five, and Volume 2's chapter on communication style is where
the fix lives.

There is a second, subtler consequence that only appears at staff level: the p99 is not
just latency, it is **occupancy**. A service at p50 120ms and p99 600ms is holding a
request thread for 600ms on 1% of requests. Thread pools sized on the p50 will exhaust on
the p99, and the exhaustion is not a latency problem — it is a cascading failure, because
the exhausted caller is now holding ITS pool while it waits. Six hops of this is a
coordinated thundering herd with a 600ms fuse.

> **PRODUCTION RELEVANCE**
>
> Latency budgets are the one architectural constraint that is measurable from outside and
> therefore negotiable inside. Put the budget in writing before the split — "the checkout
> path may make at most four synchronous calls and must stay under 400ms at p99" — and you
> turn a taste argument into a constraint a design review can actually enforce. Teams that
> split without a budget discover the budget when a service review adds one call to a path
> that was already at the edge, and the fix is a month of work reverting it.

> **INTERVIEW TRAP**
>
> "Microservices add latency but give independent deployment and independent scaling." This
> is the true answer and it scores about half marks, because it names the cost in the
> abstract and the benefits in the concrete. The staff-level continuation names the specific
> mechanism: they convert compile-time failures into runtime ones, they remove ACID across
> a business operation, they multiply the operational surface by the number of deployables,
> and the latency arithmetic is a **sum of distributions, not a sum of medians** — so serial
> chains produce p99s nobody budgeted for. The candidate who says "and here's what it costs,
> here is the number" is the one who gets the follow-up question.

Volume 11 Chapter 1 sells the trade-off — it is the version to read if you want the
persuasive summary. This chapter is the version to read if you want to be able to defend
the cost model under questioning, which is a different skill.

### 1.2 The Costs That Actually Decide It

Latency is the cost everyone names and the cost that decides the fewest extractions. The
costs that decide real boundaries are the ones that do not show up in a latency graph.

**1. Partial failure becomes the normal case, not the exception.**

In a monolith, an exception means the request failed and the transaction rolled back —
atomicity is the default and failure is a special case the runtime handles for you. Across
six services, the *realistic* outcome of an operation is that three succeeded and three did
not, and there is no rollback. This is not an edge case; at 99.9% availability per service
and six dependencies, the probability that every call in a chain succeeds over a day is
astonishingly low, and the probability that a *user* ever sees a fully-successful chain is
what you are actually designing for.

```text
  ONE CALL AT 99.9% AVAILABILITY

  1 hour      → ~4 calls fail          (1 call/15 min at 99.9% ⇒ 240/hour... see below)
  1 day       → ~1,400 failed calls    at ~57 calls/min × 1440 min × 0.1%
  1 week      → ~10,000 failed calls   across your system
  1 year      → ~500,000 failed calls  and every one of them is a business operation
                that is now HALF DONE

  The 99.9% number is a statement about a single call, per day. A chain of six is
  99.4% at best. Multiply by the number of users and partial failure is not an
  incident, it is the steady state you are designing the error handling for.
```

> **MUST REMEMBER**
>
> **Partial failure is the default, not the exception.** Availability multiplies down a
> chain, and a business operation that touches three services is a distributed algorithm
> whether or not anyone wrote one down. "The call failed" is no longer a complete
> description of the state of the system; the accurate description is "three of these
> four writes committed and I do not know which."

**2. ACID stops at the boundary.**

`@Transactional` — the machinery that makes a business operation atomic — is scoped to a
JVM and a single datasource. `REQUIRES_NEW` cannot reach another process. Two services that
both write on behalf of one business operation need a Saga, and a Saga is a distributed
algorithm with compensating actions, a state machine, and an at-least-once delivery model
that you have to design for. It is not an annotation and it is not free.

The trap is the dual-write: the classic pattern where service A updates its database and
then calls service B, and B fails. You now have a committed write at A and no write at B,
and the "fix" of adding a compensating delete is a business decision dressed as
engineering — what if the delete itself fails? What if the original order shipped in the
30 seconds between the failure and the compensation? Saga design is Volume 2's subject;
the point here is only that **a boundary converts a local transaction into a distributed
protocol, and you have signed up for the protocol whether you named it or not.**

**3. The deployment surface grows per service, and it grows faster than linearly in
practice.**

Going from 1 deployable to 20 is not "20 deploys". It is 20 pipelines, 20 build
definitions to maintain, 20 sets of dashboards, 20 sets of alerts, 20 sets of runbooks, 20
base images to patch, 20 dependency-upgrade chores, and 20 ways for a person to be on call.
The naive model is linear; the observed cost is closer to quadratic in the *number of
distinct kinds of thing you now do* — because every one of the 20 services is a
combination of those dimensions, and the combinations do not share tooling by default.

> **PRODUCTION RELEVANCE**
>
> The observability bill is the most systematically underestimated line item in a
> microservices business case, and it is the one that arrives *after* the decision. Before
> the split you have one set of dashboards and one trace. After, you have 20 services, and
> you need per-service RED metrics, per-service traces with a working propagation format,
> per-service SLOs, and a correlation story that holds together when a request crosses six
> of them. If nobody can say how that will be funded, the business case is incomplete.

**4. On-call load grows, and it grows in a way that hurts retention.**

Before: one rotation, one service, one runbook, and a paged engineer who knows the domain.
After: 20 services, one rotation, and a paged engineer who has to identify *which* of the
20 failed before they can start. Time-to-mitigate has a floor set by diagnosis, not by
fixing — and diagnosis is exactly what got harder. The failure mode is a rotation that
covers services no individual understands, which produces slow mitigation, then
heroics, then attrition of the people who actually understand the system.

**5. The testing story gets strictly worse.**

This one is underweighted and it is the one that shows up on the engineer's desk rather
than the manager's.

```text
  MONOLITH TEST                        DISTRIBUTED TEST
  ─────────────                        ────────────────
  mvn test                             mvn test          (one service)
  spins up the whole context           needs 4 services running to test one flow
  one process, one heap               a port collision per service per run
  debug a stack trace = a              a stack trace per service, and you need
    stack trace                          correlation across them
  "it works on my machine"              "it works when the other three are the
                                         versions I deployed at 14:32"
  integration test = a class           integration test = docker compose OR
                                         a deployed environment OR mocks that
                                         drift from reality within two sprints
```

The consequence that bites hardest: **you can no longer spin up the whole system on one
laptop.** A new engineer joining a 15-service shop cannot reproduce a production incident
locally unless they have a full environment, and the environments drift. Teams respond by
mocking the other 14 services — and mocks are *lies with a compile date*. Within two
sprints, your test suite is green and your production is broken, and the failure mode of
that combination is that people stop trusting the tests, which is the beginning of the
end.

### 1.3 When the Network Cost Is NOT the Problem

Now the honest other half, because a chapter that only argues against splitting is
sloganism. There are cases where a boundary pays for itself and the latency cost is
irrelevant.

**Condition 1 — low fan-out.** A boundary that sits at the *edge* of your call graph, with
nothing serial behind it, costs you one hop and buys you the ability to deploy, scale, and
fail it independently. A reporting service that reads a replica, or an authentication
service that every request hits *first* (where the latency is a single hop, not a chain
position), is nearly free.

**Condition 2 — low traffic.** Latency arithmetic only matters when there are requests to
be slow *for*. A back-office settlement job, a nightly reconciliation run, a batch
importer processing 10k rows a minute — the network is irrelevant to these. A boundary that
serves 2 requests a second has no tail-latency problem, and the argument for splitting it
must be about team autonomy, not performance.

**Condition 3 — the boundary is genuinely independent.** If the two halves change for
different reasons, have different lifecycles, and can be deployed without knowing the
other's release, then you have found something real and the coordination cost you were
trying to avoid was real too. This is the whole argument, and Chapter 3 is how you test
it procedurally rather than by vibe.

```text
  THE SPLIT PAYS FOR ITSELF WHEN...

  ✓ fan-out is low          (it is at the edge, not in a serial chain)
    OR traffic is low       (nobody waits on it)
    OR — the real one —

  ✓ the boundary is INDEPENDENT:
      • the two halves change for DIFFERENT reasons
      • they can be deployed without coordinating
      • one can be replaced without the other knowing
      • a team can own one end to end, on call, with a roadmap

  A boundary that fails this test is a network hop with a name.
```

> **TRADE-OFF**
>
> The flip condition is **team count and change independence, not codebase size**. Seven
> teams that will each own a service and each carry their own on-call is a genuine reason
> to split — seven teams coordinating a lockstep release is an org failure that no amount
> of modularity fixes. Three teams and a 400k-line codebase is not: that is a monolith
> with a build-time problem, and the answer is better build tooling, not seven deployables.

### 1.4 The Honest Summary of the Cost Model

| Cost | Scales with | Paid when | Reversible? |
| --- | --- | --- | --- |
| Serial latency (p50) | number of serial hops | every request | yes, refactor |
| Tail latency (p99) | number of serial hops × tail multiplier | the 1% of requests that time out | partly — retries and circuit breakers *hide* it |
| Partial failure | number of dependencies in a business operation | continuously | no — it is a permanent property |
| Lost ACID | number of services per business operation | per multi-service write | no |
| Deploy/observability surface | number of services, and worse than linearly | weekly, forever | no — this is the sunk cost |
| On-call diagnosis time | number of services per rotation | per incident | no |
| Test environment fidelity | number of services required to test a flow | per developer, daily | no |
| Cross-team coordination | (teams touching the same boundary) | continuously | yes, but only by merging back — expensive |

The last row is the one that kills most migrations: a boundary that two teams both touch
produces coordination, not autonomy, and the cost of coordination **exceeds** the cost of
the monolith (in-process calls, one transaction, one debugging session) while also being
slower. That failure mode has a name — the distributed monolith — and it is the subject of
Volume 3's antipattern catalogue and of Chapter 6's org analysis.

> **STAFF-LEVEL CONSIDERATION**
>
> The way to make this decision well is to **write the cost model down before the split and
> compare it to the benefit afterwards**, with a date. A boundary proposal that says "this
> will be cleaner" is unevaluable. A boundary proposal that says "this removes two serial
> hops, takes `order` and `invoice` out of one release train, splits ownership between two
> teams that each want their own roadmap, and costs us 2 extra deployables at roughly
> £400/month of pipeline and observability each" can be reviewed. The exercise is cheap and
> the candidates who do it are visibly rarer than the candidates who can recite Fowler.

#### Common Mistakes

- Quoting p50 as "the latency of the chain". The p99 of a sum is the sum of the p99s.
- Treating the microservices decision as a codebase-size question. It is a team-topology
  and change-independence question.
- Naming the benefits at full volume and the costs at half volume. The interviewer is
  listening for the costs.
- Believing that a shared database between "microservices" is a temporary state. In
  practice it is the permanent state, and it is the defining feature of a distributed
  monolith.
- Assuming a retry makes a serial chain safe. Six hops each retrying 3 times is a
  multiplicative load amplifier against the slowest dependency, and it is the standard
  mechanism by which a latency problem becomes an outage.
- Treating the testing regression as a footnote. It is the cost that engineers feel
  daily and the one most likely to cause the split to be quietly abandoned.
- Assuming a boundary drawn today survives. Business capabilities churn, and a wrong
  boundary is more expensive to move than no boundary at all.

#### Interview Questions — What a Service Boundary Costs

**Q1. What does a service boundary cost that a module boundary does not?** `STAFF`

Five things. Latency becomes a distribution rather than a point value — 0.5–1ms in the
same datacentre, 30–80ms cross-region — and the p99 of a chain of six 20ms hops is over
600ms because the p99 of a sum is roughly the sum of the p99s. Atomicity is gone, so
partial failure is the steady state and every business operation needs a compensation
story. ACID no longer crosses the boundary, so a two-service write needs a Saga, which is
a distributed algorithm rather than an annotation. The operational surface multiplies by
the number of deployables — pipelines, dashboards, alerts, runbooks, base images,
dependencies, on-call rotations. And the testing story regresses, because a flow that
spans three services cannot be exercised by starting one process on a laptop.

**Q2. Six synchronous dependencies at 20ms median. What is the p50, and what is the real
problem?** `TRICKY`

p50 is 120ms. The real problem is the p99, which is closer to 600ms, and the p99.9 which
is in seconds, because every hop contributes its own tail and the tails add. The second
problem is occupancy: a service holding a request for 600ms on 1% of requests exhausts a
thread pool sized on the p50, and the exhausted caller then holds its own pool while it
waits. The fix is not faster services — it is removing serial dependencies. Three calls in
parallel plus a join gives a p50 of 60ms and a p99 near 120ms, at the cost of making
partial failure more likely, which is then handled by the Saga machinery in Volume 2.

**Q3. A team proposes splitting a 400k-line monolith into six services. What are the
first three questions you ask?** `STAFF`

How many teams will own the pieces, and can any of them ship without another team's
permission — because that is the only convincing reason to split. Whether the data
supports the boundary: can each candidate service own its tables without a cross-service
join in the request path, and if not, what is the denormalised copy that replaces the
join. And what the latency budget is, in writing, because adding a hop to an already-serial
path is a regression somebody has to justify to the SRE team. Codebase size is not on that
list — a 400k-line codebase that deploys weekly is a build-pipeline question, not a
microservices question.

**Q4. A team says "we'll just use the monolith's test suite for the extracted service."
What breaks?** `ADVANCED`

The test suite assumes a single process, a single heap, a single clock and a single
transaction. None of those survive the boundary. Mocks replace collaborators that were
previously in-process objects, and mocks are lies with a compile date — within two sprints
the mock and the real service have diverged, the suite is green, and production is broken.
The specific failure is a test that passes against a stubbed `InventoryService` returning a
fixed response while the real service returns a 209 when stock is low, and the divergence
is invisible because nothing in the suite ever saw a real 209. The fix is not more mocks;
it is contract tests at the boundary and an environment that can actually run the
dependency.

**Q5. Does a circuit breaker fix the serial-chain problem?** `TRICKY`

No, and this is worth being firm about, because it is a common and defensible-sounding
wrong answer. A circuit breaker stops the *accumulation* of failure by failing fast, which
protects your thread pool and your latency budget — genuinely valuable. But it does not
change the p50 of the happy path, it does not make the chain shorter, and it converts a
slow dependency into a fast failure that a Saga must now compensate. It is a containment
mechanism for an architectural decision, and treating it as a substitute for fixing the
arrangement is how a team ends up with a system that is fast when healthy and semantically
incomplete when not.

**Q6. Our microservices have 40% more incidents than the monolith did. What is your first
hypothesis?** `SCENARIO`

That the split produced a distributed monolith, and specifically that two of the services
share a database or sit on one release train. I would test it with three questions: can you
deploy any one of these without the others, does any single deployment require two teams
to coordinate, and does any request path join across service boundaries. A 40% increase in
incidents after a split is almost never "microservices are hard" — it is nearly always a
boundary that does not exist in practice, so you have all of the distributed-system cost
and none of the independent-deployment benefit. The other candidate hypothesis, which I
would check second, is that the on-call rotation is now spread across more services than
any one person understands, so time-to-mitigate has risen and the incident count is
counting the same root cause six times.

> **CHAPTER 1 SUMMARY**
>
> A service boundary converts a compile-time contract into a runtime negotiation, and the
> costs that decide the decision are not the ones people name. Latency is real but
> manageable: 0.5–1ms same-DC, 30–80ms cross-region, and the arithmetic that matters is
> that six serial hops at 20ms median give a p50 of 120ms and a p99 over 600ms, because
> the p99 of a sum is the sum of the p99s. The costs that actually kill migrations are
> structural: partial failure becomes the steady state, ACID stops at the boundary, the
> deployment and observability surface multiplies faster than linearly, on-call diagnosis
> gets a floor it did not have, and the testing story regresses to "you can no longer
> reproduce the system on a laptop". The honest counterweight is that a boundary at the
> edge of the call graph, serving low traffic, and genuinely independent in its change
> rate costs almost nothing and buys a great deal. The decision input is team count and
> change independence, not codebase size — and a team that cannot answer "can this service
> own its tables without a cross-service join in the request path" is not ready to have
> the conversation.

#### Further Reading

- [Microservices](https://martinfowler.com/articles/microservices.html) — the foundational essay; the sections on how to find service boundaries and on the distributed-monolith failure mode are the ones that matter here.
- [MicroservicePremium](https://martinfowler.com/bliki/MicroservicePremium.html) — the distributed monolith antipattern by name, with the reasoning on why independently-deployed-but-coupled services are the failure mode.
- [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) — the counter-case, and the argument for extracting one boundary properly rather than starting distributed.
- [Monolithic Architecture](https://microservices.io/patterns/monolithic.html) — the pattern catalogue's entry on what a monolith is and what it is good at.

## Chapter 2 — Domain-Driven Design & Bounded Contexts

### 2.1 Ubiquitous Language: Why Two Words for One Thing Rot

**Ubiquitous language** is the observation that in any real business, the same thing gets
called different things by different people — and that the disagreement is not a
communication problem, it is a *modelling* problem that shows up in the schema.

```text
  THE SAME ENTITY, FOUR NAMES

  SALES CALLS IT        "Customer"        →  customers table, customer_id
  SUPPORT CALLS IT      "Client"          →  client_ref
  BILLING CALLS IT      "Account Holder"  →  account_holder_code
  THE DEVELOPERS CALL IT "User"           →  user_id, created by the auth team

  Now you have four IDs for one human being and three of them are the auth team's
  business, not yours. Every integration needs a mapping. Every mapping is a place
  where a record silently fails to match. The data quality team exists because of
  this. And nobody is doing anything wrong — everyone is using their own
  vocabulary correctly.
```

The mechanism of the rot is worth being precise about, because it explains why this is a
*technical* problem rather than a vibes problem:

1. Two vocabularies for one thing means two sets of invariants. Sales believes an
   "Account Holder" is never null; billing believes an account exists even with no
   identified holder. One of those is wrong, and the schema can only express one.
2. Two vocabularies means translation code. Every read crosses a boundary where a
   `customer_id` becomes a `client_ref`, and every translation is a place for the
   record to be dropped, defaulted, or matched to the wrong row.
3. Two vocabularies means the domain knowledge is split across teams who do not attend
   the same meetings, and the part that is not written down is the part that is wrong.
   The vocabulary IS the domain model — when the code and the conversation use different
   words, one of them is out of date and usually it is the code.

> **PRODUCTION RELEVANCE**
>
> Ubiquitous language is not an aesthetic preference. The diagnostic is concrete: if two
> teams each have a noun for the same row in the database, you will eventually get a
> migration that adds a `client_ref` column, a backfill that fills it for 98% of rows, and
> a nightly job that reconciles the other 2%. That job is the price of the two
> vocabularies, and it is paid forever.

### 2.2 The Bounded Context Is a Semantic Boundary

A **bounded context** is the region of the model in which a particular meaning of a term
is valid — a semantic boundary, not a technical one. This distinction is the single most
commonly confused idea in the whole subject, and confusing it is what produces
architecture that is technical in shape and meaningless in substance.

```text
  A BOUNDED CONTEXT IS NOT:
    ✗ a package
    ✗ a module
    ✗ a service
    ✗ a database
    ✗ a microservice

  A BOUNDED CONTEXT IS:
    ✓ the region of the domain model in which a term has ONE meaning
    ✓ a place where a model is internally consistent and self-contained
    ✓ the answer to "in what world is this statement true?"

  "Customer" is a bounded-context-relative term.

  SALES CONTEXT                    BILLING CONTEXT
  ─────────────                    ──────────────
  Customer = a person or org       Customer = a legal entity we invoice
  with a commercial relationship   with a payment method and a credit
  who can place orders.            limit.
  Has: pipeline, potential,        Has: account number, balance,
       discounts, territories       payment terms, dunning state
  Changes when: the sales          Changes when: the finance team
       process changes                 changes its dunning policy

  Same word. Different model. Different invariants. Different change rate.
  A service boundary that puts them together preserves the WORD and loses the
  meaning — which is the most common way a well-intentioned split goes wrong.
```

> **INTERVIEW TRAP**
>
> "A bounded context maps one-to-one onto a microservice." Half true, and the false half
> is the load-bearing half. A bounded context is a **semantic** boundary and a service is a
> **runtime** boundary. The mapping is *frequent and desirable* but it is not identity:
> two contexts in one process is a perfectly good modular monolith (Chapter 5), one
> context split across two services is a distributed monolith, and a context with a
> genuinely different scaling or release profile sometimes deserves two services. The
> senior answer separates the two ideas explicitly, because conflating them is how teams
> end up with 14 services that are 6 contexts and no idea which.

The corollary, and it is the useful part: **the test for whether a boundary is real is
whether the two sides would use the same word and mean different things.** If "Customer"
means the same thing to both sides, you probably have a *data* boundary, not a *context*
boundary — a candidate for a schema change inside one service, not a service split. If
"Order" means "a thing the customer intends to buy" on one side and "a thing we have
shipped" on the other, you have found a real context boundary, and it will pay for
itself in change independence.

### 2.3 Context Maps: Six Relationships and Their Failure Modes

A **context map** describes how two bounded contexts relate, and the relationship type is a
*decision with a cost*. The canonical set is six, and each has a characteristic way of
failing.

| Relationship | What it is | Failure mode | When it is right |
| --- | --- | --- | --- |
| **Shared Kernel** | Both contexts share a piece of model and code | A shared kernel across teams is a distributed monolith's twin — the coupling is now invisible and enforced by neither compiler nor org | Two teams, one codebase, genuinely inseparable, and you accept it deliberately |
| **Customer-Supplier** | Downstream's needs are on upstream's roadmap | Upstream ignores the customer's needs until they stop consuming; the power imbalance is the risk | Clear, enforceable commercial or technical relationship where the supplier has incentive |
| **Conformist** | Downstream simply uses upstream's model | Downstream's domain is distorted to fit a model designed for someone else's reasons; it accumulates a permanent translation burden | Cheap and correct when the upstream model is good and the downstream is not differentiating |
| **Anti-Corruption Layer** | Downstream builds a translation layer protecting its model from upstream's | Extra code and latency, and it rots if upstream changes and nobody updates the ACL | The downstream has a real model worth protecting and upstream is not under your control |
| **Separate Ways** | Deliberately no link; each side goes its own way | Duplicated logic and a business requirement to keep both sides consistent by hand | Two genuinely independent domains, and duplication is cheaper than coupling |
| **Published Language** | A shared, well-documented interchange format | The language is a lowest common denominator and drifts toward the least technical consumer | A genuine integration surface with many consumers |

**Shared Kernel deserves its own paragraph, because it is the one that gets chosen
enthusiastically and regretted.** Inside one codebase, a shared kernel is a reasonable
thing: two modules that genuinely cannot be separated, sharing a model, enforced by the
compiler and by a test. Across teams, the same decision is a different thing entirely. The
coupling is still there, it is now invisible to both compilers, neither team can refactor
the shared part without the other, and you have *added* a network call and a release-train
problem to what was previously a compile error. **A shared kernel across a service boundary
is a distributed monolith that has been given HTTP interfaces** — the coupling is the same
coupling, and you have paid for latency and partial failure on top of it.

> **TRADE-OFF**
>
> Shared Kernel versus Anti-Corruption Layer is the real decision. Both accept a
> dependency. A shared kernel accepts the dependency *into your model* — cheap, fast, and
> it means the two teams can never diverge their understanding. An ACL accepts the
> dependency *at the edge* — expensive, one extra hop and a translation layer to maintain,
> and it means the two models can evolve independently. The flip condition is **who has
> the power**: if you control the upstream, conform or share; if you do not, and your model
> is worth protecting, build the ACL.

### 2.4 The Anti-Corruption Layer Is the Most Practically Useful One

The **ACL** is a translation layer that sits between your model and someone else's, so that
their concepts never leak into your code. It is the pattern in this list that pays for
itself most reliably in production, and the reason is that it is the only one that is
*incremental*.

```text
  WITHOUT AN ACL — the supplier's model leaks in

    your-domain (order service)
      │  imports supplier.sdk.SupplierOrder
      │  branches on supplier.get("legacy") vs supplier.get("v2")
      │  stores supplierIds in your order table
      │  handles their nulls, their retries, their field renames
      ▼
    ┌──────────────────────────────────────────┐
    │  SUPPLIER API                            │
    │  · their nouns (Product, Listing)        │
    │  · their invariants                      │
    │  · their breaking changes                │
    │  · their rate limits, their outages      │
    └──────────────────────────────────────────┘
    You have a distributed monolith and a
    quarterly rewrite when they migrate fields.

  WITH AN ACL — the supplier's model stops at the edge

    your-domain (order service)
      │  imports only YOUR interfaces
      │  knows nothing about their SDK
      ▼
    ┌──────────────────────────────────────────┐
    │  ANTI-CORRUPTION LAYER                   │
    │  · translates their nouns → yours        │
    │  · is the ONLY place that knows about    │
    │    their versioning, their nulls, their  │
    │    retries                               │
    │  · is owned by YOU and changes when YOU  │
    │    decide, not when they decide          │
    ▼
    ┌──────────────────────────────────────────┐
    │  SUPPLIER API                            │
    └──────────────────────────────────────────┘
    Their migration becomes a change to one
    adapter class, reviewed by one team, with
    a test that fails loudly when the shape moves.
```

In code, the shape is a translating interface that your domain depends on:

```java
// Your domain depends on THIS. It has your vocabulary, your invariants,
// and no knowledge of the supplier's SDK, their versioning, or their nulls.
public interface SupplierCatalog {

    /** Returns a product in OUR terms, or empty if the supplier does not carry it. */
    Optional<OurProduct> findBySupplierSku(String supplierSku);

    /** OUR rule: a product is orderable only if it meets our criteria. */
    List<OurProduct> listOrderable(OurCategory category);
}

// The ACL implements it. This is the only class that knows the supplier exists.
final class SupplierCatalogAcl implements SupplierCatalog {

    private final SupplierHttpClient client;      // third-party-shaped
    private final RetryPolicy retries;            // their rate limits, not ours
    private final Map<String, OurProduct> cache;  // their id → our id

    @Override
    public Optional<OurProduct> findBySupplierSku(String supplierSku) {
        // 1. call them, with THEIR retry policy and THEIR error shape
        SupplierListing listing = client.getListing(supplierSku);

        // 2. translate their null into OUR concept: absent, not "an error"
        if (listing == null || listing.isDiscontinued()) {
            return Optional.empty();
        }

        // 3. map their fields to ours, applying OUR invariant
        OurProduct product = new OurProduct(
                listing.sku(),
                OurMoney.ofMinorUnits(listing.priceMinor(), Currency.GBP),
                OurCategory.fromSupplierCode(listing.categoryCode()),   // their code, our enum
                listing.stock() > 0);

        // 4. cache the ID mapping so our own tables never store their identifiers
        cache.put(listing.supplierId(), product);
        return Optional.of(product);
    }
}
```

Note the deliberate choices in that sketch, because they are the whole value of the
pattern:

- The domain interface is in **your** nouns. `findBySupplierSku` returns `OurProduct` with
  `OurMoney` and `OurCategory`. A reviewer who sees `SupplierCategoryCode` in a domain
  signature can reject the change, and that is the enforcement mechanism.
- The supplier's identifier is never persisted in your tables. The moment it is, the
  supplier's ID space becomes part of your data model and you cannot migrate off it.
- Their rate limits and their error shapes are handled once, in the ACL, with **their**
  retry policy. Every other call site in the system inherits correct behaviour for free,
  and — the real win — the place you have to look when they are having a bad afternoon is
  one class.
- Their "discontinued" concept does not become your "unavailable" concept. Translating
  *meaning*, not just fields, is what makes this a corruption layer rather than a mapper.

> **TRADE-OFF**
>
> An ACL earns its cost when the upstream is genuinely outside your control **and** your
> own model is worth protecting. It does NOT earn its cost when you are integrating with
> your own other service that you also own and can change — in that case you are paying
  # for a translation layer to protect a boundary you could have just... agreed on. The
  # judgement is about **power and volatility**: high volatility plus low power over the
  # upstream is the exact condition where the ACL pays.

### 2.5 The Honest Skepticism About DDD

Here is the part that gets left out of every DDD advocacy, and it is the part a staff
engineer is expected to bring.

**DDD is expensive.** Event storming, aggregate design, context mapping, repository
abstractions, specification pattern, domain events — none of this is free, and most of it
is a *skill* rather than a diagram. A team that has not done the modelling discipline
will do the vocabulary and get the ceremony:

```text
  WHAT "ADOPTING DDD" USUALLY ACTUALLY MEANS

  ✓ done      the language is shared          (cheap, high value)
  ✓ done      contexts are named and mapped   (cheap, high value)
  ✓ done      the context map exists on a wall (cheap, medium value)

  ✗ not done  the modelling actually happened
  ✗ not done  the invariants are written down anywhere
  ✗ not done  the aggregates have boundaries that mean anything
  ✗ not done  anyone has challenged whether the model is right

  Result: a directory of classes called *Aggregate and *Repository that wrap a
  JPA entity, and a team that now believes it is doing DDD while having gained
  one more layer between itself and the database. The cost is real. The benefit
  is zero. This is the single most common DDD outcome in industry.
```

> **INTERVIEW TRAP**
>
> "We should use DDD because microservices need bounded contexts." The senior correction:
> bounded contexts are useful **independently of microservices**, and microservices do not
> need DDD. A team that introduces DDD *because* it is splitting into services has
> reversed the causality — the language and the context map are what tell you where the
> boundaries go, and the boundaries are worth finding whether or not you ever split
> anything. DDD's value is diagnostic before it is constructive: it is the best tool
> anybody has for finding out what your system actually is, and the deliverable is
> frequently "no, we are not going to split this, and now we know why."

**So how much DDD is right?** The honest calibration is that the vocabulary and the
context map are nearly free and disproportionately valuable, and the tactical patterns are
optional per-context:

| DDD element | Cost | Value | Recommended default |
| --- | --- | --- | --- |
| Ubiquitous language in code and conversation | hours | very high | always |
| Named bounded contexts, even as packages | a day | very high | always |
| A context map, even on a whiteboard | a day | high | always, and revisit it |
| Aggregates with real invariants | days per context | high in complex domains | per-context, not global |
| Tactical patterns (Specification, Repository, Factory) | days | medium, highly variable | only where they remove real branching |
| Full event-sourced aggregates | weeks | high value, very high cost | almost never, deliberately |
| Applying DDD uniformly to every context | months of ceremony | **negative** | no |

> **MUST REMEMBER**
>
> **"Just say it in a bounded context" is the right amount of DDD for most teams.** Naming
> the contexts, writing the language down, and mapping the relationships between them gets
> you 80% of the value at 5% of the cost — and it is the part that is genuinely hard, so it
> is the part worth doing well. The tactical patterns are downstream of getting the context
> boundaries right, and a team that has not got the boundaries right will build elaborate
> aggregates inside a context that should have been two.

#### Common Mistakes

- Treating a bounded context as a package or a service. It is a semantic boundary; the
  mapping to a runtime boundary is frequent and desirable but is not identity.
- Sharing a model across a service boundary. A shared kernel across two teams is a
  distributed monolith with HTTP interfaces.
- Building an ACL where a shared kernel would do, and then maintaining the translation
  layer forever.
- Persisting a third party's identifiers in your own tables. That is how an external ID
  space becomes impossible to migrate off.
- Introducing tactical DDD patterns uniformly across every context. The patterns are a
  per-context decision, and applied everywhere they are pure overhead.
- Treating event storming as a workshop with a deliverable. The deliverable is a shared
  mental model, and if the wall does not change anyone's mind, it was a meeting.
- Using DDD vocabulary to describe a system nobody has modelled. The words become
  unfalsifiable, which is worse than not having them.

#### Interview Questions — Domain-Driven Design & Bounded Contexts

**Q1. What is a bounded context, and how is it different from a service?** `STAFF`

A bounded context is the region of the domain model in where a term has exactly one
meaning — a semantic boundary. A service is a runtime boundary: a deployable, with its own
process, its own failure modes, and a network hop. The two are frequently in one-to-one
correspondence and you usually want them to be, but they are not the same idea, and
conflating them causes two specific failures. Conflating them in the direction of "one
context is always one service" produces services that split a context for reasons that are
about scaling rather than meaning, and you get a distributed monolith inside a context. And
conflating them the other way — treating a context as a package and being done — is fine
until the team count makes the runtime boundary necessary, at which point you have to do the
hard part of the work (data ownership, latency budget, deployment independence) that the
package boundary let you avoid.

**Q2. "Customer" means something different to Sales and to Billing. Is that a service
boundary?** `TRICKY`

Not automatically, and the test is whether the *meaning* diverges or only the *fields*. If
Sales' customer is a prospect-to-be and Billing's customer is a legal entity with payment
terms and a credit limit, then yes — that is a genuine context boundary, and you would want
to name the two contexts differently, which is itself the diagnostic win. If the difference
is that Billing stores four extra attributes, then no: that is one context with two
read-modelled projections, and splitting it would buy a network hop and a distributed
join in exchange for nothing. The question to ask is "in what world is a statement about
this customer true?" — if the answer is "both, for different reasons", you have two
contexts. If it is "both, it's the same thing", you have one context and a missing
projection.

**Q3. What is the anti-corruption layer for, and when does it not earn its cost?** `STAFF`

It is a translation layer that keeps another system's model from leaking into yours, so
their nouns, nulls, versioning and rate limits are handled in exactly one place that you
own. It earns its cost when the upstream is outside your control and volatile and your own
model is worth protecting — a payment provider, a tax authority, a supplier's catalogue
API. It does not earn its cost when the "upstream" is another service you own and can
change: then you are maintaining a translation layer to protect a boundary you could have
just agreed a vocabulary for, and you have paid a network hop and an extra class for the
privilege. The judgement is about power and volatility, not about DDD orthodoxy.

**Q4. A team did event storming. It produced 200 sticky notes and a wall nobody can hold.
What went wrong and what should they have done instead?** `SCENARIO`

Almost certainly too much domain and not enough process. Two hundred sticky notes is the
signal that the session covered the entire business rather than one slice of it, and a
wall that size has no decision in it — nobody leaves a two-hundred-note workshop knowing
what to do. The technique works on a bounded slice: pick one business capability, one
customer journey through it, and storm that. The output you are actually after is three
or four commands, a handful of events, and the *disagreements* — the two places where two
people used different words for the same thing, or where the process has a gap nobody
noticed. Those disagreements are the valuable output, and they get lost in volume. A
200-note wall is a symptom of a session that was a documentation exercise rather than a
modelling one.

**Q5. Is DDD worth it for a team of six working on one product?** `STAFF`

The tactical patterns, mostly not; the language and the boundaries, yes and urgently. A
team of six on one product is precisely the case where you need to *know* where your
contexts are, because the next thing that happens is the team grows to fourteen and the
implicit boundaries calcify into whatever the code happened to look like. So: do the
ubiquitous language, name the contexts, draw the context map, and enforce them as packages
with a test that says modules cannot reach into each other's internals. Skip the
specification pattern and the repository abstraction until a context actually hurts. And be
explicit that the deliverable of the DDD work here is a *boundary map* you can use to
decide about services later, not a set of design patterns to apply now.

**Q6. A team has a shared model library that both the Order team and the Billing team
depend on. What is the actual risk, and has it already happened?** `ADVANCED`

The risk is that a shared kernel has crossed a service boundary, which means the coupling
still exists but is now invisible to both compilers and enforced by neither team's build.
A change to that library is now a coordinated release between two teams, and the compiler
that used to catch the breakage at build time has been replaced by a 3am page. It has
already happened in the sense that the coordination cost is being paid right now — the
symptom is a small number of "quick, can you just release the shared model first" requests
that block each other's pipelines. The fix is to split the library into the part that is
genuinely shared *vocabulary* (which can stay) and the part that is shared *behaviour* (which
is a service boundary pretending to be a library), and to give the behaviour to one team.

> **CHAPTER 2 SUMMARY**
>
> Ubiquitous language is not a style preference — two vocabularies for one thing produces
> two sets of invariants, translation code, and a nightly reconciliation job, and none of
> it is anybody's fault. A bounded context is a **semantic** boundary — the region where a
> term means one thing — and it is not the same as a service, which is a runtime boundary;
> the mapping is frequent and desirable, and conflating the two is the most common source
> of both too-fine splits and distributed monoliths. Context maps describe relationships
> with real costs, and the shared kernel is the one that gets chosen enthusiastically and
> regretted: inside a codebase it is fine, across a service boundary it is a distributed
> monolith with HTTP interfaces. The anti-corruption layer is the most practically useful
> pattern in the list because it is incremental and it stops an external ID space from
> becoming part of your own data model, and it earns its cost exactly when the upstream is
> volatile and outside your control. On DDD itself, the honest position is that the
> vocabulary and the context map are 80% of the value at 5% of the cost, the tactical
> patterns are per-context decisions, and a team that applies the patterns without the
> modelling discipline gets ceremony and no benefit.

#### Further Reading

- [Bounded Context](https://martinfowler.com/bliki/BoundedContext.html) — the shortest honest definition, and it separates the semantic boundary from the technical one exactly as this chapter argues.
- [Ubiquitous Language](https://martinfowler.com/bliki/UbiquitousLanguage.html) — the vocabulary problem in its smallest form, which is the right way to introduce it to someone who thinks DDD is heavyweight.
- [Anti-Corruption Layer](https://microservices.io/patterns/refactoring/anti-corruption-layer.html) — the pattern in its canonical form, including the failure mode of translating fields rather than meaning.
- [DDD in Depth](https://www.domainlanguage.com/ddd/) — Evans' own site; the context-mapping definitions are the authoritative source for the six relationships, and the other volumes are the rare thing that DDD writing actually is: a worked example.

## Chapter 3 — Finding Seams

This is the procedural chapter, and it is the one most candidates cannot answer
concretely. "Use domain-driven design" is not a procedure. The following is.

### 3.1 Event Storming, and Its Failure Mode

**Event storming** is a structured workshop: you walk a business process backwards from
the thing the business actually cares about, sticking down *events* in time order, then
*commands* that produce them, then *policies* that react, then reading the whole thing
and marking where the words get ambiguous.

```text
  THE FORMAT — one slice, 90 minutes, about 40 notes

  TIME ──────────────────────────────────────────────────────►

   Placed      Payment        Order        Stock        Shipped      Refund
     │            │            │            │             │            │
  CUSTOMER   CUSTOMER       ORDER        WAREHOUSE     WAREHOUSE   CUSTOMER
   Puts item   Pays         is          picks and     hands       asks for
   in cart    £42          CONFIRMED    reserves      parcel      money
                                 │            │             │            │
                            ── after this line, WHO owns the
                                order? Is the "order" the same
                                word on both sides?

  THE COLOUR CODING
  orange   = event      (something that happened, past tense, named)
  blue     = command    (an intent, imperative, has an actor)
  yellow   = policy     ("when X happens, we do Y")
  green    = aggregate   (the cluster of events that build one thing)
  purple   = read model  (what a query sees)
  red      = the disagreement, the ambiguous word, the missing
             transition  ← THESE ARE THE OUTPUT
```

The output that matters is the **red** notes. Two people using different words for one
thing. A policy with no command. An event with no producer. A transition everybody assumes
but nobody has drawn. Those are the seams, and finding them is the whole value of the
exercise.

> **SCALING REALITY CHECK**
>
> A 200-sticky-note session is a failed session. The technique works on a **bounded slice**
> — one business capability, one journey through it, about 40 notes, 90 minutes. At 200
> notes you have documented the business, nobody has modelled anything, and the wall is
> physically impossible for a person to hold in their head, which means the workshop's
> actual product — a shared mental model in six people's heads — was not produced. The
> symptom to watch for is a session that ends with someone saying "can we get that on a
> slide"; a workshop whose output is a diagram has become a documentation exercise.

```text
  WHAT EVENT STORMING IS NOT

  ✗ a requirements-gathering meeting
  ✗ a design-doc workshop
  ✗ something you run once a year
  ✗ something that produces a "digital twin of the business"

  What it IS: a way to make six people use the same words, and to find the
  places where they do not. Run it per slice, run it again when the slice
  changes, and treat every red note as a candidate seam.
```

> **PRODUCTION RELEVANCE**
>
> The disagreements that event storming surfaces are frequently *already* in production as
> data-quality incidents. "Two people called this a customer and a client" is a mapping
> table today. "Nobody could say who approved this discount" is an audit finding waiting to
> happen. Running the workshop after those become incidents is possible but expensive —
> the vocabulary is already divergent in the codebase and in people's heads, and you are
> now refactoring under production load.

### 3.2 Domain Analysis Through the Language

Where event storming is generative, language analysis is diagnostic. You take the nouns
the business uses and ask, for each, three questions:

```text
  FOR EVERY NOUN IN THE DOMAIN, ASK:

  1. Is this ONE thing, or several things that share a name?
     "Order" — the intent, the confirmation, the shipment, the invoice,
     the return. Five aggregates sharing a word. In which world is
     "order cancelled" true? (Not after shipment. So "order" is at
     least two contexts.)

  2. Whose invariants does it carry?
     If "an order must have at least one line" is a business rule, that
     rule belongs to whoever owns the order. If both the sales team and
     the finance team have an opinion about when an order is valid, you
     have two contexts and one ambiguous word.

  3. What does it need, and when does it change?
     An aggregate that needs to be consistent with four other aggregates
     across the system is a sign that your boundary is drawn in the
     wrong place — usually around a noun that is not really a thing.
```

A worked example, because this is where candidates hand-wave. Consider "Order" in an
e-commerce system:

| Question | Answer | Consequence |
| --- | --- | --- |
| One thing or several? | Five: intent, confirmation, shipment, invoice, return | "Order" is not a noun you can build a service around |
| Whose invariants? | Sales owns line validity; finance owns invoice consistency | Two owners means two contexts |
| What does it need? | Customer, stock, price, address, payment | It reaches for four other contexts, which is a smell, not a rule |
| When does it change? | On the sales cycle (weekly); the invoice changes on the billing cycle (monthly) | Different change rates — Chapter 4's noun+verb split |

Nothing here says "make five services." It says the word "Order" is hiding a boundary, and
the boundary is between **the thing the customer intends** (which changes weekly, driven by
sales) and **the thing the customer is charged for** (which changes monthly, driven by
finance). That distinction — intent versus billing — is the Invoice/Order split below, and
it is a *context* distinction before it is ever a *service* distinction.

### 3.3 Change Rate Is the Primary Signal

This is the most useful idea in the chapter, and the most operationally checkable.

> **MUST REMEMBER**
>
> **Two pieces of code that change together for the SAME reason belong together. Two that
> change together for DIFFERENT reasons do not.** Co-change in git history is the evidence
> you have, and it is the closest thing to an objective boundary signal that exists.

The rule has a symmetric form, which is the part people forget: co-change is evidence
*against* a boundary as often as for one. A high co-change rate between two modules means
they are driven by the same business event, and separating them buys you a release
coordination problem.

```text
  MODULE A and MODULE B

  co-change high, SAME REASON     → ONE service. The coupling is real and
                                     pretending otherwise costs you a deploy
                                     coordination you did not need.

  co-change high, DIFFERENT REASONS → TWO services, with a real seam between
                                      them. They only appear together in the
                                      same commit because one commit is
                                      doing two unrelated things.

  co-change low, SAME REASON      → probably not a system that should exist;
                                     check whether the "same reason" is
                                     actually a shared config or a shared
                                     library.

  co-change low, DIFFERENT REASONS → the normal, healthy case. Two things that
                                     happen to be in the same repo and have
                                     no reason to be in the same service.
```

**How to measure it.** Four techniques, in increasing order of effort and decreasing order
of noise:

| Method | What it gives you | Cost | Noise |
| --- | --- | --- | --- |
| `git log --format=` + a crude file-path histogram over 12 months | the top-N directories that appear in the same commits | minutes | high — counts "formatting" and "bump version" commits |
| **co-change matrix** over logical directories, excluding merges and mechanical commits | an N×N matrix of "how often do these two change in the same commit" | a day of scripting | low — this is the useful one |
| log parsing by *commit message intent* (a real change vs a chore) | separates genuine co-change from noise | a few days | very low |
| asking the team "which files do you always edit together?" | the human version, and it is usually right about *why* | an hour | biased toward recency, but catches the reason, not just the fact |

The co-change matrix is the one worth building, and the way to read it matters more than
the way to build it:

```text
  CO-CHANGE MATRIX (same commit, 12 months, mechanical commits excluded)

              order    invoice   customer   stock    shipping
  order        —      0.71      0.44      0.39     0.12
  invoice     0.71      —        0.22      0.05     0.31
  customer    0.44     0.22       —        0.18     0.08
  stock       0.39     0.05      0.18       —       0.66
  shipping    0.12     0.31      0.08      0.66       —

  READ IT LIKE THIS:
    order ↔ invoice = 0.71   ← very high. Check the REASON before splitting.
                                 If it is "the sales team changes the order
                                 and the invoice together because a new
                                 promotion changes both" that is a shared
                                 business event, not a seam.

    stock ↔ shipping = 0.66   ← high, and probably for a good reason
                                 (allocation and dispatch are the same event).

    invoice ↔ stock = 0.05   ← they almost never change together. This is a
                                candidate seam with evidence behind it.

    customer ↔ everything   ← the hub. A high-degree hub in a co-change
                              matrix is usually a shared kernel, and a shared
                              kernel in the middle of a service graph is
                              the distributed monolith forming.
```

That last observation is worth pausing on, because it is a genuinely non-obvious result:
**in a co-change matrix, the things that change with everything are the things you should
be most suspicious about extracting.** They look like the *best* candidates — everything
depends on them — and they are in fact where the coupling is densest. What you are looking
for is a pair or a cluster with *high internal* co-change and *low external* co-change.
That is a module, not a service boundary, and getting this backwards is why some
migrations produce a system where the new "shared" service is the busiest and the most
fragile node in the graph.

### 3.4 The Four Tests

Beyond change rate, three more tests. A candidate boundary has to pass enough of them to
be worth the cost of extraction.

**Test 1 — the data ownership test.** Can the candidate service own its tables with no
cross-service join in the request path?

This is the most objective test available and the one most often skipped. It has a
concrete form:

```text
  FOR EACH QUERY ON THE REQUEST PATH:

  1. Which tables does it touch?
  2. Do all of them belong to one candidate context?
  3. If not, what replaces the join?
       (a) a denormalised copy maintained by events
       (b) an extra network call at request time
       (c) a read replica you are now lying about in a comment

  If the honest answer is (b) for a hot path, you do not have a boundary —
  you have a distributed monolith with an HTTP call in the middle of a join.
  Option (a) is legitimate and is Volume 2's subject, but it is real work and
  it introduces a consistency window you must be able to explain.
```

A team that cannot answer this for its candidate boundary has not scoped the project. The
extraction is not "move the classes" — it is "replace every join that touched a foreign
table, and own the consistency window you just created."

**Test 2 — the latency budget test.** How many hops does this add, and to which path?

Not "what is the latency" but "**which path** and **what is the budget**". A boundary on a
cold path (a nightly report, an admin screen, a webhook handler) costs nothing. A boundary
inserted into a four-hop hot path costs you a fifth hop on the most user-visible journey
in the product, and the answer needs to say what the new p99 is, not that it "should be
fine".

**Test 3 — the org test.** Can one team own this end to end, including its on-call, its
schema, and its roadmap? If two teams have to agree to deploy it, the boundary has not
bought anything — you have converted an in-process dependency into a cross-team
dependency, which is *worse*, because now it has a network hop in it too.

**Test 4 — the failure independence test.** Can this component be down without the rest
of the system being down? If the answer is no, the boundary is a naming decision. If the
answer is yes, you have found something where a circuit breaker, a degraded mode, or a
queue can actually buy you availability.

```text
  THE FOUR TESTS, ON ONE PAGE

  ┌─ DATA OWNERSHIP ────────────────────────────────────────────┐
  │  Can it own its tables with no cross-service join on the    │
  │  request path?                        [ ] yes  [ ] no      │
  │  If no: what replaces the join, and what is the            │
  │  consistency window?                     ───────────────    │
  └─────────────────────────────────────────────────────────────┘
  ┌─ LATENCY BUDGET ────────────────────────────────────────────┐
  │  Which path? How many hops does it add? What is the new     │
  │  p99 against a written budget?         ───────────────      │
  └─────────────────────────────────────────────────────────────┘
  ┌─ ORG ──────────────────────────────────────────────────────┐
  │  Can ONE team own build, deploy, on-call, schema, roadmap? │
  │                                              [ ] yes [ ] no │
  └─────────────────────────────────────────────────────────────┘
  ┌─ FAILURE INDEPENDENCE ─────────────────────────────────────┐
  │  Can it be down without the rest being down?  [ ] yes [ ] no │
  └─────────────────────────────────────────────────────────────┘

  Pass 3+ and the extraction is probably worth it.
  Pass 2, and it is a judgement call with a documented risk.
  Pass 1, and you are building a distributed monolith.
```

### 3.5 Worked Example: The Invoice/Order Split

An e-commerce monolith. `orders` and `invoice` tables, changed together in 71% of commits
that touch either. Sales owns the order; finance owns the invoice. The team is arguing
about whether to split them into two services.

**The argument for:** co-change is 0.71, so they always change together — which sounds
like *one* service by the rule above. But look at the *reason* the team gives: "when
marketing runs a promotion, the pricing changes and the invoice format has to follow." That
is a shared business event, and it is not the same as "these two things have the same
reason to change."

**The real analysis:**

```text
  orders                          invoice
  ──────                          ───────
  changes WHEN the sales cycle     changes WHEN the billing cycle runs
  changes BECAUSE a customer       changes BECAUSE finance's rules
    acts                            changed (dunning, tax, payment
  owned by the sales team            terms)
  owned by the finance team
  needs: customer, stock, price    needs: nothing operational — it
  (a fan-out of four contexts)       READS from order and writes
  hot path: yes, it is the          nothing back in the request path
    checkout                        hot path: yes, it is the
                                     "my account → invoices" screen

  0.71 co-change explained: a promotion PR touches both. That is ONE reason
  for co-change, not a shared lifecycle. The rule says "same reason" — and it is.
  But the reasons for change are different, the owners are different, and
  crucially the DEPENDENCY DIRECTION is one-way: invoice reads order, order
  never reads invoice.

  ONE-WAY DEPENDENCY + DIFFERENT OWNER + DIFFERENT CADENCE = a real seam.
```

**The extraction, done properly:**

1. Invoice service creates its own schema; a replication job (or CDC, or an outbox-fed
   consumer — Volume 2) keeps a local read model of the order fields the invoice needs.
2. The invoice service never joins to `orders`. It holds its own copy. There is a
   consistency window — the invoice may show an order state that is up to N seconds stale —
   and that window is *acceptable* because an invoice is a legal document that is
   generated after the fact, not a live view.
3. The sales team's promotion PRs now touch only the order side; the invoice service
   adapts.
4. The finance team can change the invoice format without a sales release.

**The honest counter-case**, which the team also has to consider: the "my account" page
shows both orders and invoices, so the read path needs both, and if that is a hot path
you have just put a join into an API composition (Volume 2), with its own latency and its
own failure mode. Sometimes the right answer is to *not* split, and to instead make the
boundary explicit in the schema — a separate `invoice` module with a foreign key inside
one database — which gets you 80% of the organisational benefit for 0% of the
distributed-system cost. Chapter 5 is about exactly that option.

### 3.6 The Classic Wrong Split: By Technical Layer

The most common decomposition mistake, and the one that produces a system that is worse
than both the monolith it replaced and the microservices it was supposed to become.

```text
  ✗ THE LAYER SPLIT — the distributed monolith

  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐
  │ API SERVICE  │  │ DOMAIN SVC   │  │ DATA SVC     │
  │              │  │              │  │              │
  │ controllers  │  │ business     │  │ repositories │
  │ DTOs         │  │  logic       │  │ DAOs         │
  │ validation   │  │ domain       │  │ migrations   │
  │              │  │ entities     │  │ queries      │
  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘
         │                 │                 │
         └────────► HTTP, twice, per call ◄──┘
         │                 │                 │
         └────────► SHARED DATABASE ◄────────┘
                        (one schema, all of it)

  WHY IT IS WRONG, PRECISELY:

  • Every business operation now crosses two network hops that buy nothing
  • There is ONE transaction boundary, and it is in the data service — so
    the "services" are not independent in any sense
  • A schema change needs all three teams, on the same day
  • You cannot deploy one without the others if they share a release contract
  • The domain entity is now behind two HTTP calls and a serialisation
    boundary, so it is no longer an object
  • Latency: 3× the hops, 3× the p99 contribution
  • You get: all of the cost, none of the benefit
```

> **INTERVIEW TRAP**
>
> "We split the monolith into an API service, a domain service and a data service." The
> senior correction is immediate and categorical: **that is not a decomposition, it is a
> horizontal relayering of the same system, and it produces a distributed monolith.** A
> decomposition is defined by what a service *owns* — a business capability, a set of
> tables, a reason to change. A layer is defined by a *technical* role, and technical
> layers are not independently deployable, not independently scalable (the data layer
> scales with the data, not the traffic), and not independently failure-isolatable. The
> diagnostic question is: **does this service have a business reason to exist that a
> customer or a business process would recognise?** If not, it is a layer.

The reason this mistake is so persistent is that it is *available* — it is right there in
the existing code, and the "services" can be carved out mechanically. The correct
decomposition requires the work of deciding what the business actually does, which is hard
and unglamorous, and it produces fewer, better services. The wrong one produces more
services, faster, and every one of them is a liability.

### 3.7 When a Boundary Is Stable but Not Yet Worth Isolating

Sometimes the analysis is clean — the boundary is obvious, the tests pass — and the answer
is still "not yet". This is a real and common situation, and handling it well is a staff
skill.

```text
  THE BOUNDARY IS CLEAR. THE TESTS PASS. WHY NOT SPLIT?

  REASON 1 — the team count does not justify it
    A clean boundary with three teams is a MODULE, not a service. The
    benefit of a service is independent deployment, and with three teams
    the coordination problem does not exist. You would be paying for
    a capability you have no use for.

  REASON 2 — the load does not justify it
    Splitting does not make anything faster. If the motivation is
    performance, the boundary does nothing for you unless one side has
    a genuinely different scaling profile (a bursty, IO-heavy consumer
    next to a steady, CPU-light API).

  REASON 3 — the data is not ready
    The boundary is real but the data is shared, entangled, or not
    modelled yet. Extracting now means extracting the *wrong* shape and
    doing it twice.

  THE RIGHT MOVE: make the boundary REAL without making it a service.
    • carve it out as a module with enforced package-private visibility
    • forbid cross-module access with an ArchUnit test
    • give it its own schema namespace, or its own tables, inside
      the same database
    • give it its own team if a team forms
    • keep it deployable-in-theory: no parent-package imports, no
      shared mutable state, its own transaction boundary

  Cost: two days. Value: you have the boundary, you can see when it
  graduates, and if it never does you have lost nothing.
```

That last block is the single most practically valuable thing in this chapter, and it is
the natural bridge to Chapter 5. **A boundary you cannot see is a boundary you cannot
move.** Making it real as a module costs almost nothing, gives you the option later, and
works whether or not the org ever justifies the service.

> **STAFF-LEVEL CONSIDERATION**
>
> The reason teams skip the modular step and go straight to services is schedule: a module
> boundary looks like it delays the split, and a service boundary looks like it starts it.
> It is the reverse. A modular boundary is two days of work and it makes the eventual
> extraction a *mechanical* task; a service boundary drawn in a codebase that has no
> internal boundaries is a re-architecture, and it will be redone. Teams that insist on
> going straight to services usually ship a first service in six weeks that then takes
> three months to make genuinely independent, because they spent the six weeks discovering
> the boundary they should have found first.

#### Common Mistakes

- Running event storming on the whole business instead of one slice, and producing a wall
  that nobody can hold and nobody can act on.
- Reading high co-change as "these belong together" without asking whether the *reason* is
  the same. 0.71 co-change between order and invoice is one promotion PR, not a shared
  lifecycle.
- Splitting a co-change matrix at its highest edges. The highest-co-change pairs are
  usually the densest coupling, not the cleanest boundary. Look for high internal and low
  external.
- Skipping the data ownership test because the code "looks separable". The join is the
  project; the code is the weekend.
- Accepting (b) — an extra network call at request time — as the answer to a broken join
  on a hot path, and calling the result a service boundary.
- Decomposing by technical layer because it is mechanically available.
- Treating "the boundary is clear" as "we should split now", when the module version buys
  the option for two days' work.
- Not writing the latency budget down. A budget that is not written is not a budget, and
  the first extra call added to the path after the split will be the one that breaks it.

#### Interview Questions — Finding Seams

**Q1. Walk me through how you'd find a service boundary in a codebase that started as a
monolith.** `STAFF`

I would start with evidence rather than opinion. First, generate a co-change matrix over
logical directories from 12 months of git history, excluding merges and mechanical commits,
and look for clusters with high internal co-change and low external co-change — those are
modules, and the ones that change with everything are a warning, not an opportunity. Second,
run event storming on one bounded slice, not the whole business, and collect the red notes:
the places where two people used different words for the same thing. Third, run the four
tests on each candidate — data ownership (can it own its tables with no cross-service join in
the request path, and if not, what replaces the join), latency budget (which path, how many
hops, what is the new p99 against a written number), org (can one team own build, deploy,
on-call, schema and roadmap), and failure independence. And a candidate that passes 3+ of
4 starts as a module with enforced boundaries, not as a service, unless the team count
independently justifies the deployable.

**Q2. Two modules have 0.7 co-change. Does that mean they belong in one service?** `TRICKY`

No, and this is the question that separates people who have run the analysis from people
who have read that it exists. The rule is not "co-change means together", it is "co-change
for the *same reason* means together". High co-change with different reasons is a seam with
a shared business event crossing it — a promotion PR that changes both pricing and invoice
format is one commit doing two unrelated things. The move is to ask *why* they co-change,
and if the answer is a single business event, that is not evidence of a shared lifecycle.
The number I actually look for is high-internal, low-external: a cluster that changes
together and rarely with anything else.

**Q3. A candidate service needs to join three tables to answer a hot query. What do you
do?** `STAFF`

Three options and they are not equally good. Denormalise — the service keeps its own copy
of the fields it needs, maintained by events — which is legitimate and introduces a
consistency window you have to be able to explain to a customer. Add a network call at
request time, which is only acceptable on a non-hot path and is the single most common way
to build a distributed monolith by accident. Or do not extract this boundary yet, and make
it a module with its own tables inside the shared database instead. What I would not do is
"temporarily" call the other service synchronously in the request path and plan to fix it
later, because temporary cross-service joins in request paths do not get fixed; they get
documented, and then the next engineer extends the pattern.

**Q4. A team ran a three-day event-storming workshop and produced 400 sticky notes. What
should you have done instead?** `SCENARIO`

Run one 90-minute session on one bounded slice — a single customer journey through a
single business capability — and expect about 40 notes. The 400-note version fails for a
specific reason: the technique's product is a shared mental model in a small number of
heads, and 400 notes exceeds what a person can hold, so the session produced documentation
instead of understanding. The observable difference is the output: a good session ends with
people disagreeing about specific words and about specific missing transitions, and those
disagreements are the seams. A 400-note session ends with someone asking for a photo of the
wall, which means the deliverable is a picture and the actual work has not started.

**Q5. The boundary is obvious, all four tests pass, and the team count is three. What do
you recommend?** `STAFF`

Make the boundary real as a module and do not extract. Three teams is below the threshold
where independent deployment buys anything, because the coordination problem that
independent deployment solves does not exist at that size. What you do get for two days of
work is real: enforced package boundaries, a rule that modules cannot reach into each
other's internals, separate tables, its own transaction boundary, and a clean statement of
who owns what. That gives you the option later, makes the boundary visible so you can
actually move it, and costs almost nothing if the org never grows. The module step is
also what makes a future extraction mechanical rather than a re-architecture, which is the
main argument for doing it.

**Q6. How do you tell a real seam from a naming difference?** `ADVANCED`

Ask whether the invariant survives the move. If a rule is genuinely global — "an order
cannot be cancelled after it has shipped" — then the two pieces need to see each other's
state and you have found a place where the boundary must not be, or where you need a
process-level enforcement (a Saga, a state machine) rather than a shared table. If the
rule is local — "a customer must have an email before we email them" — then each side can
enforce it independently and you have found a real seam. The test is about *where the rule
lives*, not about whether the vocabulary matches. A shared vocabulary is weak evidence for
a boundary; a shared invariant is strong evidence against one.

> **CHAPTER 3 SUMMARY**
>
> Finding seams is a procedure, not an intuition. Event storming works on a **bounded
> slice** — 90 minutes, about 40 notes — and its real output is the disagreements, the
> places where two people used different words for the same thing; a 200-note wall is a
> failed session because the product of the technique is a shared mental model and 200
> notes exceeds what a person can hold. Change rate is the primary signal, and the rule is
> asymmetric: two things that change together **for the same reason** belong together, two
> that change together for different reasons do not — so a 0.71 co-change between orders
> and invoices is not a boundary, it is a promotion PR. The four tests are data ownership
> (can it own its tables with no cross-service join in the request path), latency budget
> (which path, how many hops, what is the new p99, written down), org (can one team own it
> end to end), and failure independence. The classic wrong answer is decomposing by
> technical layer, which is not a decomposition at all but a horizontal relayering that
> produces all of the distributed-system cost and none of the independence. And the most
> practically valuable habit in the chapter is that a clean boundary under a three-team org
> should become a **module with enforced boundaries** — two days of work that buys the
> option and makes the eventual extraction mechanical.

#### Further Reading

- [Microservices](https://martinfowler.com/articles/microservices.html) — the section on decomposing by business capability, and the part on why the database is the hard part of the boundary.
- [Decompose by Business Capability](https://microservices.io/patterns/decomposition/decompose-by-business-capability.html) — the pattern catalogue's version, useful as the canonical statement to argue against.
- [Decompose by Subdomain](https://microservices.io/patterns/decomposition/decompose-by-subdomain.html) — the DDD-flavoured decomposition, and the closest pattern-catalogue entry to the bounded-context argument.
- [Microservice Chrestomath](https://microservices.io/patterns/microservices.html) — Fowler's worked example of applying DDD to a real monolith; the step where he extracts the table and the join inverts is the chapter's argument in miniature.

## Chapter 4 — Decomposition Patterns

Chapter 3 gave you a procedure for finding seams. This chapter is the catalogue of the
*named* approaches people use to decompose, each with the failure mode that makes it a
trap rather than a tool. Almost all of them work in the first month and fail in the first
year, and the reason is always the same: they decompose on a **signal**, and a signal is
not a reason.

### 4.1 By Noun / Entity — The Default, and Why It Works Then Stops

**The pattern:** one service per domain entity. `Order`, `Customer`, `Product`,
`Invoice`. This is what people do by default because entities are what the database is
organised around and what the nouns in the requirements are.

It works because it is **close to right in a simple domain** and because it is **fast**.
A system where the entities genuinely map to capabilities — an order system where orders
are the capability — decomposes cleanly and stays decomposed. The co-change matrix would
show high internal and low external co-change for each entity, the data ownership test
passes because each entity has its own tables, and the org test often passes.

```text
  WHERE "ONE SERVICE PER NOUN" WORKS

    ✗ the entity IS the capability
        "Order" service does everything an order does: place, amend, cancel,
        fulfil, query. There is no second thing competing for the noun.

    ✗ the entity has a single clear owner
        one team, one reason to change it

    ✗ the tables hang together
        orders + order_lines, high co-change, low external

    Under those conditions, "one service per entity" and "one service per
    bounded context" are the same decomposition, and the simple rule is
    correct. The rule is not wrong. It is INCOMPLETE, and the incompleteness
    is where the problems come from.
```

It stops working in a specific, predictable way: **when the entity is a noun that names
several processes.** This is the same insight as Chapter 3's domain analysis — "Order" in
e-commerce is the intent, the confirmation, the shipment, the invoice, and the return.
Decomposing by noun gives you one service that must then contain all five processes, and
they have different rates, different owners, and different data needs. What you get is
not a bad decomposition, it is **a service that is internally several services**, with
all the coupling problems of the monolith it came from, plus a network hop on the way in.

> **INTERVIEW TRAP**
>
> "Decompose by noun, one service per entity." The naive answer, and it is genuinely half
> right — which is what makes it dangerous. The senior correction: **"Order" is a noun that
> names at least five processes with different rates and different owners, so one-service-
> per-entity silently produces a service that is internally unsplit, and you have gained a
> deployable without gaining a boundary.** The way to know which case you are in is the
> noun+verb test below: ask what processes hang off the noun, and if there are more than
> two, the noun is hiding a boundary.

### 4.2 By Business Capability

**The pattern:** decompose by what the business *does* rather than by what it *stores*.
Fowler's example is the canonical one: a business with Orders, Invoicing, Accounts
Receivable, and Shipping is decomposed into those four, because those are four capabilities
an operations manager would recognise, not four tables.

This is a better default than the noun rule, and the reason is specific: **capabilities
have owners and nouns mostly do not.** When a business manager says "who owns accounts
receivable?", there is an unambiguous answer, and that answer is a team. When they say
"who owns the customer table?", the answer is a shrug, and the shrug becomes a data
governance ticket.

The failure mode is **capability inflation**: everything is a capability, capabilities
nest, and you end up with a service called "Customer Management" that internally contains
"Customer Onboarding", "Customer Communication", and "Customer Support", each of which
could be a service, and the parent exists to hold them together. The symptom is a service
whose name is an organisational function rather than a business process — and those
functions are exactly what gets reorganised every eighteen months.

> **MUST REMEMBER**
>
> A capability is a **thing the business does**, phrased so that a non-engineer recognises
> it. "Accounts Receivable" is a capability. "Customer table service" is not — it is a
> storage location, and storage locations move when the schema is reorganised. If you
> cannot say what a service does without saying what table it owns, you have decomposed by
> noun and renamed it.

### 4.3 By Transaction Boundary

**The pattern:** put things that must commit together in the same service. The reasoning
is sound — anything that has to be atomic has to be in one place, because ACID stops at
the process boundary.

This pattern has an important and frequently-missed consequence in the *positive*
direction: it tells you where **not** to split. If an invariant requires reading and
writing two aggregates atomically, they are one service, and any decomposition that
separates them has, at creation, introduced a distributed transaction requirement it will
have to pay for forever. This is the most useful form of the pattern because it produces
negative constraints, and negative constraints are the ones that keep you out of trouble.

```text
  THE ATOMICITY CLUSTERS — things that must commit together

  ┌─ one order + its lines         → same service, always
  ┌─ invoice header + its lines    → same service, always
  ┌─ a transfer's two legs         → same service, or a Saga
  └─ a balance + its audit entry   → same service, or an event-sourced ledger

  Each of these is a place where a service split converts a row-level
  guarantee into an eventually-consistent approximation, and the
  approximation has to be explained to somebody whose money is involved.
```

The failure mode is **over-application**. Teams use "these must be consistent" as a
general licence to keep everything together, and because the argument is always *available*
it wins every design discussion by default. The counter-argument is that a great many
business invariants do **not** need to be checked atomically — they need to be checked
*eventually*, with a repair path, and the business is fine with a window of a few seconds.
"Every order must have at least one line" can be enforced in a single service by never
committing a header without lines. "Every order must be invoiced within 24 hours" cannot be
enforced atomically even in a monolith, because 24 hours is not inside a transaction — and
teams routinely use the *second* kind of rule to justify the *first* kind of coupling.

> **TRADE-OFF**
>
> Atomicity is a real constraint, and the flip condition for honouring it is **the length
> of the consistency window the business actually tolerates**. If the rule must hold at
> every instant, one service. If it must hold within a minute, an event plus a repair job.
> If it must hold within a business day, a reconciliation report. The mistake is treating
> every invariant as the first kind, and the staff-level question in a design review is
> "how stale is allowed to get, and who notices?"

### 4.4 By Table

**The pattern:** one service per table, or per table group. This is the wrong split
wearing a technical costume, and it is worth naming precisely because it is common.

The argument for it is that it looks like it maximises independence — each service has
its own data, so no service can block another's writes. The argument is false, and the
reason is that **tables are not independent just because they are separate.** The foreign
key from `order_lines` to `orders` is a dependency. The `customer_id` on every table is a
dependency. And when you extract one table into a service, every join that touched it now
crosses a network, which is the exact problem you were trying to solve.

> **SCALING REALITY CHECK**
>
> A service that owns **one table with one foreign key pointing out of it** is not a
> service; it is a table with a network in front of it. The number that matters: if a
> candidate service touches more than about 3–4 tables in a request-path query, or owns a
> table with more than one FK pointing at a table it does not own, the data ownership test
> has already failed and you are building a distributed join. Below that, it might be fine.
> Above it, the extraction cost is dominated by denormalisation work, not by the code move.

### 4.5 By Change Rate

**The pattern:** group things that change at the same rate and for the same reason, and
split things that do not. This is Chapter 3's co-change matrix turned into a rule, and it
is the most reliable of the catalogue *when you have the data* and the most dangerous when
you do not.

The failure mode is **overfitting to history.** Change-rate decomposition assumes the past
predicts the future, and that assumption is wrong in a specific and predictable way: the
thing that is changing fastest right now is usually the thing under active development,
and the thing that has not changed in two years is often the thing nobody is working on
rather than the thing that is complete. A boundary drawn from two years of git history will
put the module nobody touches on one side, and it will be wrong the moment that module
becomes the most important thing in the business — which is exactly what happens to
whatever is quiet.

### 4.6 By Org Structure

**The pattern:** one service per team. `service-per-team` is a real named pattern on
microservices.io and it is the honest reduction of Chapter 6: the service boundary follows
the team boundary, because that is the boundary that produces autonomous deployment.

The failure mode is the reverse of what you want. Organisational boundaries are not
stable — teams are formed, split, merged, and renamed on a two-year cycle — while code
boundaries are expensive to move. So a decomposition derived from today's org chart has a
half-life, and the interesting question is **what happens to it when the org changes
first**. If the honest answer is "we would have to merge two services and re-join their
data", the org-derived boundary was a bet on the org, and it is a bet that is expensive to
lose.

### 4.7 By Noun + Verb — the One That Actually Generalises

The pattern that resolves the others: **entities are things, processes are processes, and
they have different data and different rates.** The noun tells you what the data is; the
verb tells you what the *change* is. "Order" is a thing. "Order Fulfilment" is a process
that needs warehouse location, carrier, and dispatch time — data that an order does not
have — and that changes on a warehouse cycle rather than a sales cycle.

```text
  NOUN + VERB — the decomposition that survives contact with reality

  ┌──────────────────────┬──────────────────────┬──────────────────────┐
  │                      │ Order (noun)         │ OrderFulfilment      │
  │                      │                      │ (verb)               │
  ├──────────────────────┼──────────────────────┼──────────────────────┤
  │ data it holds        │ lines, prices,       │ pick lists, cartons, │
  │                      │ customer ref,        │ carrier, tracking,   │
  │                      │ payment state        │ dispatch, POD        │
  ├──────────────────────┼──────────────────────┼──────────────────────┤
  │ rate it changes      │ on the sales cycle   │ on the warehouse     │
  │                      │ — minutes, often     │ cycle — hourly,      │
  │                      │                      │ in bulk              │
  ├──────────────────────┼──────────────────────┼──────────────────────┤
  │ who owns it          │ commercial / sales   │ logistics / ops      │
  ├──────────────────────┼──────────────────────┼──────────────────────┤
  │ invariant            │ never ship without   │ never dispatch an    │
  │                      │ an address           │ unpicked line        │
  ├──────────────────────┼──────────────────────┼──────────────────────┤
  │ hot path?            │ yes — checkout       │ no — batch and       │
  │                      │                      │ async               │
  └──────────────────────┴──────────────────────┴──────────────────────┘
     Different data. Different rate. Different owner. Different invariant.
     THIS is a boundary. "Order" and "OrderFulfilment" in one service is
     a service that has been given two reasons to change.
```

This is why the noun rule fails: it only looks at the noun. The verb is where the second
boundary is hiding, and it is almost always hiding there. The test is simple: **for each
entity, list the processes that hang off it. More than two, and the noun is a container
rather than a concept.**

### 4.8 The Two-Entity Rule of Thumb, and Its Limit

There is a rule that is genuinely useful and genuinely limited, and knowing both halves is
the point:

> **If two things always change together, one service. If they have different lifecycles,
> two services.**

It is a compression of Chapter 3's co-change rule, and it is right most of the time. Its
limit is worth being explicit about, because the limit is where the interesting cases live.

**Limit 1 — the two things change together for different reasons.** Covered in Chapter 3,
and the 0.71 order/invoice case. The rule as stated would say "one service", and the
answer is "no, two, because the co-change is a single promotion PR".

**Limit 2 — "always" is doing a lot of work in that sentence.** Real change-rate data is
noisy, and over any fixed window some pairs will co-change more than others for reasons of
recency, a single large project, or an incident. A boundary drawn from six months of data
during an active migration is a boundary drawn from a temporary.

**Limit 3 — the rule cannot see a boundary that does not exist yet.** Two things that
*will* have different lifecycles, once the business stops treating them the same way,
currently change together. The rule sees the present and calls it a single service, and
then the business changes and the boundary is wrong. There is no data-driven answer to
this, which is why the judgement in Chapter 3's four tests exists at all.

**Limit 4 — the rule says nothing about data ownership, and data is what makes extraction
expensive.** Two things that change together for the same reason but own different tables
and are joined on every read are, by this rule, one service — which is correct, and which
happens to be the answer that a naive "they change together, so separate them" reader
would get backwards.

### 4.9 The Wrong-Signals Table

This is the table worth memorising, because in interviews the signal is usually stated as
if it were the rule, and the interviewer is waiting to hear you disagree.

| Proposed signal | Strength | Why |
| --- | --- | --- |
| "It has its own tables" | **WEAK** | Every table has a name. Owning a table is necessary and not sufficient — a service can own one table and still need a cross-service join on every read. |
| "It's a noun in the domain" | **WEAK** | Nouns name things; boundaries sit between processes. "Order" is a noun containing five processes. |
| "It's a bounded context" | **MEDIUM** | Real, but a context is semantic. It maps to a service often, not always, and the mapping is where most of the thinking has to happen. |
| "It changes at a different rate" | **STRONG** | Change independence is the mechanism by which independent deployment actually pays. This is the signal underneath the others. |
| "The team owns it end to end" | **STRONGEST** | Directly predicts the benefit. If nobody owns build, deploy, on-call, schema and roadmap, the service boundary produces coordination instead of autonomy — and the cost exceeds the monolith. |
| "It's a clean layer" | **NEGATIVE** | Technical layers are not independently deployable, scalable, or failure-isolatable. This is the distributed monolith signal. |
| "We need better performance" | **NEGATIVE** | A boundary does not make anything faster. It only lets you scale one side differently, and only if the scaling profiles genuinely differ. |
| "It has a lot of code" | **NEGATIVE** | Codebases get big for reasons unrelated to deployability. Size is a build-pipeline problem. |
| "It's a bounded context and a team, but the data is joined on every read" | **MEDIUM-LOW** | The org argument is real and the data argument is against it. Split it and the first thing you build is a distributed join. This is the genuinely hard case and it needs the ACL. |

> **PRODUCTION RELEVANCE**
>
> The weakest signals are the ones that survive a design review unscathed, because nobody
> can argue with "it has its own tables". The strongest signals are the ones that get
> challenged, because they are claims about the future. That asymmetry is why teams end up
> with services justified by a table list: the justification is unfalsifiable at review
> time and the consequences arrive six months later, when a PR needs two teams. A good
> staff-level move in the review is to ask, of every proposed boundary, **"which team
> will own the on-call for this at 3am?"** — and then to note how many proposals go quiet.

### 4.10 Decomposing Too Fine

The other error, and the one that is easier to *see* but harder to *correct*, because by
the time the fleet has 30 services the cost is structural and the people who made each
individual decision have moved on.

```text
  THE UNIT ECONOMICS OF A SERVICE

  FIXED COST PER SERVICE (roughly independent of its size):
    · a pipeline that must be maintained and kept green
    · a dashboard, an SLO, a set of alerts
    · a runbook and an on-call rotation slot
    · a base image or dependency set to patch
    · a deployment, a rollback path, a health check
    · a service entry in the catalogue, the mesh, the secrets store
    · a CODEOWNERS entry, an escalation policy, a README
    · one more thing that can be down

  VARIABLE COST: roughly nothing extra for a small service
    · 300 lines of code, 4 tables, 20 rps

  So a 300-line service that is deployed alongside its parent and owned by
  the same team, changed in the same commit sequence, and never scaled
  independently, is: all of the fixed cost, none of the benefit.
```

> **SCALING REALITY CHECK**
>
> The number where a service stops paying for itself: **roughly when a candidate service
> cannot justify its own fixed cost** — the pipeline, dashboard, SLO, runbook and on-call
> slot, which in most organisations runs into the low hundreds of pounds a month once
> observability and on-call rota are priced in. In practice that is a service of a few
> hundred lines to a couple of thousand, deployed with its parent, with no independent
> scaling profile and no independent team. The test is not line count. It is: **could this
> be deleted tomorrow and merged into its neighbour, and would anything actually get
> worse?** If the answer is no, it is not a service; it is a folder.

> **INTERVIEW TRAP**
>
> "Small services are good because they're easy to reason about." The senior correction:
> small is necessary but nowhere near sufficient, and taken as a goal it produces
> *too small* services, which pay the full fixed cost — pipeline, dashboard, SLO, runbook,
> on-call slot, one more thing that can be down — and get none of the benefit that made
> the boundary worth drawing. The goal is not small; it is **independently deployable and
> independently owned**, and a 300-line service that always deploys with its parent is
> neither.

#### Common Mistakes

- Decomposing by noun and producing a service that internally contains several processes
  with different rates. This is the most common outcome and it is invisible in the
  diagram, because the diagram says "Order Service" and the code says five services'
  worth of coupling.
- Decomposing by table, which maximises the appearance of data independence while
  guaranteeing that every join that touched the extracted table now crosses a network.
- Using atomicity as a general licence to keep things together. The rule is "must be
  consistent at every instant", and a great many business invariants only need to be
  consistent eventually with a repair path.
- Overfitting a boundary to two years of git history. The quietest module is often the
  least finished, not the most stable.
- Deriving a boundary from today's org chart without asking what happens when the org
  changes. The org has a two-year cycle; the code boundary is a multi-year commitment.
- Splitting on a signal ("it has tables", "it's a noun") rather than a reason, because
  signals are unfalsifiable in a design review and reasons are not.
- Splitting below the size where a service pays for its own fixed cost. The diagnostic is
  "could this be merged back tomorrow, and would anything get worse?"

#### Interview Questions — Decomposition Patterns

**Q1. Our order service handles placing, amending, cancelling, fulfilment and returns.
Is that a problem?** `STAFF`

Probably, and the way to see it is that it is not a service, it is five services' worth of
coupling in a trench coat. Each of those processes has a different change rate, a
different data requirement, and often a different owner — returns data and invoicing data
that placing orders does not need. A service boundary is supposed to buy independent
change, and a service that changes for five unrelated reasons has the release
coordination problem without the independent-deployment benefit. I would split it along the
noun+verb line: the order as a commercial object, and fulfilment and returns as processes
with their own data and their own cycle. The check before doing that is co-change — if all
five change in the same commits for the same reasons, the split is wrong.

**Q2. A team justifies a boundary with "it has its own tables". Is that a good enough
reason?** `TRICKY`

No, and it is a good example of a signal masquerading as a reason. Owning a table is
necessary and it is not sufficient, because the real question is whether the service can
own its tables *with no cross-service join in the request path*. A service that owns one
table, has two foreign keys pointing at tables it does not own, and is joined to on every
read has its own tables and is still a distributed join with extra steps. The data
ownership test is the version of this that decides things: can you answer, for every query
on the request path, which tables it touches and what replaces the join when one of them
moves? If you can, "it has its own tables" was the beginning of an argument. If you
cannot, it was the whole argument and it is not enough.

**Q3. When would you keep two things in one service even though they could be split?**
`STAFF`

When there is an invariant that must hold at every instant between them, because splitting
converts a row-level guarantee into an eventually-consistent approximation and somebody
whose money is involved is going to have to be told about the window. Also when the
co-change is high *for the same reason* — the coupling is real, and hiding it behind a
network hop does not remove it, it just makes it invisible to the compiler. And when the
team count does not justify a deployable: with three teams, a split produces coordination
rather than autonomy. The staff-level version is that the question is not "can we split
these" but "what specifically gets better", and if the honest answer is "nothing concrete",
then the right answer is a module boundary inside one deployable, which Chapter 5 is
about.

**Q4. We have 22 services. How do you work out whether any of them should not exist?**
`SCENARIO`

For each one, ask the merge test first: could this be deleted and merged into a neighbour
tomorrow, and would anything actually get worse? If nothing gets worse, it is not a
service — it is a folder paying the full fixed cost. Then the ownership test: is there
exactly one team that builds, deploys, on-calls, owns the schema and sets the roadmap for
it, and did that team exist when the boundary was drawn? Then the coupling test: how many
other services does it call synchronously on a user-facing path, and what is the summed
p99 of that chain? Services that fail the merge test and pass the ownership test are
usually services that a team split for reporting lines rather than for change
independence, and they are the cheapest to fold back.

**Q5. Is one service per bounded context the right default?** `TRICKY`

It is the right default *about 60% of the time*, and the interesting question is the other
40%. It is right when the context is genuinely one capability, has one owner, and its
tables hang together. It is wrong when a context has a genuinely different scaling profile
in part of it — one part of a context that is bursty and IO-heavy, and the rest steady,
deserves to be a separate deployable for scaling reasons alone, and that is a deployment
boundary rather than a semantic one. And it is wrong when the context is still a
container for two processes with different rates, in which case you have one service
carrying two release cadences. The question is never "is one service per context right",
it is "what happens to this boundary when the org splits next quarter".

**Q6. What is the strongest signal that a proposed boundary is real?** `STAFF`

That one team owns it end to end — build, deploy, on-call, schema, and roadmap — because
that is the only signal that directly predicts the benefit you are buying. Every other
signal is a proxy: tables are a proxy for data ownership, nouns are a proxy for capability,
change rate is a proxy for independence, bounded contexts are a proxy for meaning. The
ownership signal is the thing itself. And it has a useful diagnostic property: if you ask
"which team will be on call for this at 3am?" in a design review and the proposals go
quiet, the proposals were about structure rather than about independence, and the fleet is
about to acquire a lot of coordination it cannot afford.

> **CHAPTER 4 SUMMARY**
>
> The decomposition catalogue is a set of *signals*, and a signal is not a reason — the
> same discipline applies whether you decompose by noun, by table, by transaction, by
> change rate, or by org chart. Decomposing by noun works right up until the noun names
> several processes, and then it produces a service that is internally several services;
> the generalisation is the noun+verb rule, where "Order" is a thing and "OrderFulfilment"
> is a process with different data, a different rate, and a different owner. Decomposing
> by business capability is a better default because capabilities have owners and nouns
> mostly do not, though it fails by inflation into organisational functions. The
> transaction-boundary pattern earns its keep mostly by producing *negative* constraints —
> telling you where not to split — and fails when teams use it to keep things together
> that only need eventual consistency. The wrong-signals table is the chapter's practical
> core: "it has its own tables" and "it's a noun" are weak, "it changes at a different
> rate" is strong, and "a team owns it end to end" is strongest because it directly
> predicts the benefit. And the error that is hardest to reverse is decomposing too fine: a
> few-hundred-line service pays the full fixed cost of a deployable — pipeline, dashboard,
> SLO, runbook, on-call slot, one more thing that can be down — and gets none of the
> independence that justified the boundary.

#### Further Reading

- [Decompose by Business Capability](https://microservices.io/patterns/decomposition/decompose-by-business-capability.html) — the canonical statement of the capability rule, worth reading precisely so you can see where it breaks.
- [Decompose by Subdomain](https://microservices.io/patterns/decomposition/decompose-by-subdomain.html) — the DDD-flavoured version, and the closest thing in the catalogue to a bounded-context decomposition.
- [Self-Contained Service](https://microservices.io/patterns/decomposition/self-contained-service.html) — the pattern that pulls a piece of functionality into one service so it can be changed in one place; the clearest statement of the "same reason" test.
- [Service per Team](https://microservices.io/patterns/decomposition/service-per-team.html) — the org-derived decomposition in its canonical form, and an honest read of when the team boundary is the right one.

## Chapter 5 — The Modular Monolith

This is the chapter that most candidates avoid, and avoiding it is the mistake. The honest
recommendation for a very large fraction of teams considering microservices is **do not
split**, and a candidate who can argue that convincingly is demonstrating judgment rather
than caution. This chapter is the argument.

### 5.1 Why It Is Very Often the Right Answer

A **modular monolith** is a single deployable in which the code is organised into modules
with boundaries enforced by tooling — Spring Modulith verifies them at test time, ArchUnit
enforces them as a test, JPMS at compile time. The code has service boundaries before the
runtime does.

Start with what it gives you, because the list is longer than people expect:

| | Monolith (ball of mud) | Modular monolith | Microservices |
| --- | --- | --- | --- |
| Transactional integrity across the domain | yes, if used | **yes** | no — Saga required |
| Deployables | 1 | **1** | N |
| Processes to profile in an incident | 1 | **1** | N |
| Partial failure | not applicable | **not applicable** | the default |
| Code boundaries | by convention | **enforced by a test that fails the build** | enforced by the network |
| Local dev | clone and run | **clone and run** | N containers or mocks |
| Team-level ownership | package convention | **module + CODEOWNERS** | service + team |
| Latency between modules | nanoseconds | nanoseconds | 0.5–80ms |
| Can one part be scaled differently | no | **no** | yes |
| Can one part be deployed independently | no | **no** | yes |

The last two rows are the entire cost, and they are real. The question is whether the
benefit is worth them *for your team now*, and for a great many teams the answer is that
the benefit is not yet reachable.

**Transactional integrity across the whole domain** is the one people underrate. In a
monolith, "place order, reserve stock, create shipment, write ledger entry" is one
`@Transactional` method. In microservices it is a Saga with compensating actions, an
at-least-once delivery model, and a reconciliation job for the states the Saga did not
manage to reach. The Saga is not a design pattern you add; it is a *permanent, ongoing
operational commitment* to a class of bug that a monolith simply does not have. If your
domain has cross-entity invariants — and most do — this is the biggest single item on the
cost side, and it is invisible until the first time one of them is violated in production.

**One process to profile** is the second, and it is the one engineers feel most. A
distributed trace tells you a call was slow. A profiler on a single JVM tells you *which
allocation* or *which lock* made it slow, with a flame graph, in the same tool, immediately.
Latency debugging across 15 services requires: a trace to identify the slow span, a
service to identify, logs for that service, a metric to confirm, and then a hypothesis. In
a monolith it is: a flame graph. For teams that do not have a mature observability stack
yet, this is not a preference — it is the difference between debugging in minutes and
debugging in a day.

**No partial failure** sounds obvious and is worth stating, because the whole of Volume 2
exists because of it. In a modular monolith there is no such thing as "the inventory
service is down". There is a method that throws, and it is inside your transaction, and
the transaction rolls back. The entire class of bugs that motivates Sagas, outbox patterns,
idempotent consumers, circuit breakers, and bulkheads does not exist in this architecture,
because there is no network in it. You are giving up a large amount of hard-won distributed
knowledge in exchange for a system where a request either commits or does not.

> **TRADE-OFF**
>
> A modular monolith gives up exactly two things: independent scaling, and independent
> deployment. Everything else on the table — transactional integrity, single-process
> debugging, no partial failure, runnable-on-a-laptop testing — it keeps. So the argument
> for microservices reduces entirely to: **do we need one of those two, now?** The flip
> condition is team count and change independence. Seven teams blocked by each other's
> release train need independent deployment. A context that takes 100× the traffic of the
> rest needs independent scaling. Neither of those is true of most systems at the moment
> somebody proposes splitting them.

### 5.2 A Monolith Is Not Automatically Modular

Here is where the argument usually gets lost, and the sentence that has to be said out
loud: **a monolith is not modular by default. Extract a module and what you have is a
monolith with a folder in it, which is worth less than a monolith with a good design and
worth nothing extra.**

Without enforcement, a modular monolith degrades into a ball of mud in a specific and
predictable way — the **package cycle**:

```text
  A MODULE BOUNDARY NOBODY ENFORCES

  com.acme.order      ──────►  com.acme.customer
      ▲                        │
      └────────────────────────┘
            a cycle.

  How it actually happens, in order:
    1. "I'll just import that enum, it's tiny"
    2. "The repository is right there, no point in a port"
    3. "This is a utility, it doesn't really belong to either module"
    4. Two years later: 3,000 cross-module imports, and the
       "modular" monolith is a monolith with extra directories
       and a diagram that lies.

  The tell: the boundary diagram, if you drew one, would have arrows
  going both ways between most pairs of modules. That is not modularity,
  that is a diagram of a monolith.
```

The three words that do the damage are **tiny**, **just this once**, and **it's just a
utility**. Every one of those is locally reasonable and globally fatal, which is the
definition of a decision that needs mechanical enforcement rather than a code-review
norm. And the reason code review does not save you is mundane: the reviewer is looking at
a 20-line diff, not at the accumulated 3,000 cross-module imports, and the person
reviewing is not the person who will pay for it in eighteen months.

### 5.3 The Enforcement Mechanisms

This is the substance of the chapter. There are five, in increasing order of intrusiveness,
and a team that adopts even the first two has captured most of the value.

**Mechanism 1 — package-private visibility.**

The cheapest and the most effective. In Java, if a module's public surface is its
published API and everything else is package-private, then "reaching into another module's
internals" stops being a convention and becomes a compile error.

```java
package com.acme.order.internal;

// The ONLY types the rest of the application may touch.
public sealed interface OrderApi permits OrderService, OrderQuery {
    OrderView place(PlaceOrderCommand command);
    Optional<OrderView> find(OrderId id);
}

// package-private: no other package can construct or read this.
final class OrderService implements OrderApi {
    private final OrderRepository orders;      // also package-private
    private final PricingPort pricing;         // also package-private

    @Override
    public OrderView place(PlaceOrderCommand command) { /* ... */ }
}
```

The subtlety that makes this work in practice is the **named interface** concept: each
module
exports an explicit list of types, and everything else is invisible. It works because it
also gives you a single place to look to answer "what is this module allowed to do", which
is the question a new engineer will ask in month one.

**Mechanism 2 — ArchUnit rules.**

A test that fails the build. This is the workhorse, and it is worth having even when
nothing else is in place, because it converts a review-time judgement into a CI-time
fact.

```java
@AnalyzeClasses(packages = "com.acme")
class ArchitectureTest {

    /** No module may depend on another module's internal packages. */
    @ArchTest
    static final ArchRule modules_do_not_reach_into_each_other =
            noClasses().that().resideInAPackage("..order..")
                    .should().dependOnClassesThat().resideInAPackage("..customer.internal..")
                    .because("customer.internal is not part of customer's API — use the ACL");

    /** Modules may only talk to other modules through their published API packages. */
    @ArchTest
    static final ArchRule cross_module_dependencies_go_via_api =
            noClasses().that().resideOutsideOfPackage("..api..")
                    .should().dependOnClassesThat().resideInAnyPackage(
                            "..customer..", "..pricing..", "..inventory..")
                    .andShould().dependOnClassesThat().resideInAnyPackage(
                            "..customer.api..", "..pricing.api..", "..inventory.api..")
                    .because("a module depends on the other module's contract, not its implementation");

    /** The layering rule: nothing may depend on the web layer except the web layer. */
    @ArchTest
    static final ArchRule layers_are_one_way =
            layeredArchitecture().consideringAllDependencies()
                    .layer("Web").definedBy("..web..")
                    .layer("Service").definedBy("..service..")
                    .layer("Persistence").definedBy("..repository..", "..jpa..")
                    .whereLayer("Web").mayNotBeAccessedByAnyLayer()
                    .whereLayer("Service").mayOnlyBeAccessedByLayers("Web");

    /** Repositories do not leak into the API surface. */
    @ArchTest
    static final ArchRule no_repository_in_the_api =
            noClasses().that().resideInAPackage("..api..")
                    .should().dependOnClassesThat().resideInAnyPackage(
                            "..repository..", "org.springframework.data.jpa..");
}
```

Note what the `layers_are_one_way` rule is doing: it is not about modules, it is about
*the dependency direction inside every module*, and it catches the most common
monolith rot — a `Repository` interface leaking into a service signature until the
service layer is a thin pass-through over JPA. Both are worth having, and they are
different rules.

**Mechanism 3 — module dependency rules at build time.** Split the codebase into Gradle
or Maven subprojects, one per module, with **no** `api`/`implementation` cross-project
dependency except where a build file declares one. Build tools will warn or fail on
undeclared transitive usage, and the module graph becomes a buildable artefact you can
visualise. This is the strongest of the compile-time options and the most disruptive,
because it is a real build change and it slows the build until people stop making
mistakes.

**Mechanism 4 — a rule that a module may not reach into another's internals, written
down and enforced by the above.** The distinction matters: "modules A and B may call each
other" is a different, weaker rule than "module A may depend on B's published API and
nothing else", and the second is the one that holds up. A boundary enforced only at the
module level is a **team** boundary — two teams can share a service, and they will,
because the tool permits it. A boundary enforced at the *internals* level is a **code**
boundary, and it is what makes the module a real unit that could be extracted.

**Mechanism 5 — Spring Modulith module verification.** The Spring-native version, and
for a Spring shop it is the lowest-friction path because it needs no new build structure.

```java
// Spring Modulith derives the module structure from the package layout and
// verifies that the derived dependency graph is acyclic and matches your
// declared expectations. This is an APPLICATION_TEST: it runs in the test
// phase, needs no new dependencies, and fails the build on a violation.
class ModularityTests {

    @Test
    void verifiesModularity() {
        ApplicationModules.of(OrderApplication.class)
                .verify();                       // fails on cycles and on
                                                  // package dependencies that
                                                  // violate the declared boundaries
    }

    // You can go further: verify that no module outside the declared set
    // depends on a given module's internals.
    @Test
    void verifiesThatOnlyTheDeclaredModulesDependOnPricing() {
        ApplicationModules.of(OrderApplication.class)
                .verifyFor(PriceService.class);   // fails if anything depends
                                                  // on PriceService without
                                                  // declaring it
    }
}
```

The genuinely useful part of Spring Modulith is not the verification test, it is that it
**also monitors module interactions at runtime** — every `ApplicationEventPublisher`, every
`@TransactionalEventListener`, every direct bean-to-bean call between modules — and asserts
the resulting interaction graph against the structure you declared. That catches the case
ArchUnit cannot see: a module publishing an event that three other modules listen to,
creating a coupling that exists in the event bus rather than in an import.

> **PRODUCTION RELEVANCE**
>
> The value of the whole apparatus shows up in an incident, not in a design review. When
> a request fails inside a monolith, the stack trace is the topology. When a request fails
> across services, the stack trace is one service's fragment and you need a trace, a clock
> correlation, and a hypothesis. Teams that split and then discover they cannot debug are
> in a worse position than teams that stayed monolithic, because they have paid the cost
> and lost the tool. The modular monolith keeps the tool, and the enforced boundaries mean
> the day you *do* need to extract, you know exactly which pieces move because the build
> already told you.

**What enforcement is actually worth.** The ranking is worth stating because teams
over-invest in the wrong layer:

| Mechanism | Cost | Catches | Adopt when |
| --- | --- | --- | --- |
| Package-private + named interfaces | 1 day | most intra-module leaks | always, first |
| ArchUnit rules | 2–3 days | cross-module reaches, layering, leakage | always, first |
| Spring Modulith verification | 1 day | cycles, undeclared dependencies, event coupling | Spring shop, always |
| Build-time module isolation | 1–2 weeks | everything the compiler can see | when the module count passes ~6 |
| Runtime interaction monitoring | 1 week | couplings that live in events/aspects | when you have ArchUnit green and want more |

The honest position is that **the first three days are where nearly all the value is**, and
a team that spends a quarter redesigning its build to get module isolation has not
understood that the failure mode being prevented is a 20-line import someone will make on
a Friday.

### 5.4 Graduation: When a Module Has Earned Extraction

A modular monolith with enforced boundaries is not a monolith that failed to split. It is
a monolith that has **made the split cheap and deferred it correctly**. The question worth
being able to answer is: what is the specific signal that a module has earned it?

```text
  THE FIVE GRADUATION SIGNALS — a module has earned extraction when…

  1. IT NEEDS A DIFFERENT SCALING PROFILE
     It takes 100× the traffic of the rest, or it is bursty where the rest
     is steady, or it is IO-bound where the rest is CPU-bound. This is the
     ONLY signal that is about runtime, and it is the one people check
     first and it is often the one that is genuinely right.

  2. IT NEEDS A DIFFERENT RELEASE CADENCE
     It changes weekly while the rest changes monthly, or it is a
     compliance component that ships on a fixed schedule the rest does
     not participate in.

  3. IT NEEDS A DIFFERENT TEAM
     A team exists — or is forming — that will own it end to end, and
     that team has its own roadmap and its own on-call. This is the
     strongest signal, and it is also the slowest to appear.

  4. IT NEEDS A DIFFERENT TECHNOLOGY
     It genuinely needs a different runtime, a different data store, or a
     language the rest of the org does not use. Be honest here: "we might
     want to try Rust eventually" is not a signal, and using technology
     novelty as a decomposition driver is how teams end up with a service
     in a language two people on earth can maintain.

  5. IT IS THE PART THAT BREAKS
     It is the thing that pages, the thing with the incident history, the
     thing that is hard to deploy. Extract it and isolate the blast
     radius. This is a legitimate reason and it is reactive rather than
     preventive, which is fine — reactive architecture is often the
     honest kind.
```

Note what is **not** on that list, because each of these is a reason people give and each
is wrong:

- *"It is conceptually separate."* Everything is conceptually separate from something.
  Conceptual separability is the input to the analysis, not a result of it.
- *"It has a lot of code."* Size is a build problem.
- *"The team wants to own it."* If the team has not existed before, wanting is not having.
  The test is whether a team exists, has a roadmap, and will carry the on-call.
- *"It is a good candidate for reuse."* Reuse is a code-reuse problem. If two things need
  the same code, extract a library, not a service.

```text
  THE HONEST SEQUENCE

  day 0    monolith, one deployable, 5 teams
           │
           ├─ carve out modules, enforce boundaries          ← 2 days
           │  (the value is immediate: better test speed,
           │   clearer ownership, no distributed-system cost)
           │
  month 3  a team forms around fulfilment; it has a roadmap
           │  and an on-call rotation                        ← signal 3
           │
           ├─ extract it properly: data first, code second   ← 2–4 months
           │
  month 8  two teams, each on their own rotation, each
           shipping weekly                                    ← the benefit
```

The point of the sequence is that **every step before the extraction was free**, and the
extraction itself became mechanical because the boundary was already real. A team that
skips to the extraction from a boundaryless monolith does the same final step in the same
2–4 months and arrives with a different, worse boundary, because they had to discover it
under schedule pressure.

> **SCALING REALITY CHECK**
>
> The number that keeps the modular monolith honest: **extracting one boundary from a
> boundaryless monolith is a 2–4 month project, and extracting the same boundary from a
> monolith where it is already an enforced module is a 3–6 week project.** The difference
> is entirely the data migration and the join replacement, both of which are hard either
> way — but in the modular monolith you know which tables moved and which imports are
> already legal, because a build has been telling you for six months. Teams consistently
> report the 2–4 month figure and then treat the modular step as a delay, which inverts the
> arithmetic.

### 5.5 The Migration Discipline: It Is a Data Project First

The last thing this chapter needs to say, and it is the thing that is stated worst in
industry: **a monolith-to-microservices migration is a data project first and a code move
second.** Chapter 7 has the full procedure; the principle belongs here because it is the
reason the modular monolith is the right starting point.

```text
  WHAT THE PROJECT ACTUALLY IS

  CODE (what people plan for)            DATA (what takes the time)
  ─────────────────────────              ───────────────────────────
  move the class              2 days     who owns this table now?  a negotiation
  replace the call with a                what happens to the join in the
    client                  1 week        request path?  a design
  add a timeout              1 hour      the FK from order_line to orders
                                                now a cross-service consistency
  (total: ~2 weeks)                        problem  a project
                                         backfill, dual-write, cutover, verify
                                         the rollback story
                                            (total: 2–4 months)

  The teams that plan the code move and discover the data move in week six
  ship late, ship wrong, and usually end up with a service that still reads
  the monolith's tables — which is not a service, it is a network call.
```

> **STAFF-LEVEL CONSIDERATION**
>
> The migration plan is where most distributed-system projects quietly die, and the reason
> is organisational rather than technical. Extracting a table requires deciding who owns
> it, and that conversation surfaces disagreements about product ownership that were
> previously invisible — because inside a monolith nobody has to answer the question. The
> single most valuable thing you can do before writing a line of code is get the
> data-ownership answer in writing, from the people who can commit to it. A team that
> extracts a service and cannot say who is on the hook when its data is wrong has not
> finished the migration; it has moved the ambiguity somewhere with a network hop in it,
> which is strictly worse, because now the ambiguity also has a latency and a partial
> failure mode.

> **INTERVIEW TRAP**
>
> "We should use a modular monolith because microservices are complex." The senior
> correction is that this is the *right conclusion for the wrong reason*, and it will not
> survive a follow-up question. The reason is not complexity — teams handle complexity fine
> and the whole of Volume 2 exists because they do. The reasons are specific and
> measurable: a modular monolith keeps transactional integrity across the domain, it keeps
> one process to profile, it has no partial failure, and it runs on a laptop. Those are
> things you can lose and things you can keep, and the candidate who names them has made a
> decision rather than expressed a preference.

#### Common Mistakes

- Treating "modular monolith" as a monolith with folders. The entire value is in the
  *enforcement*, and without a test that fails the build it is a diagram that lies.
- Enforcing the module boundary but not the internals boundary. A rule that "module A may
  depend on module B" permits a shared implementation, which is the coupling the
  boundary was supposed to remove.
- Over-investing in build-time module isolation and skipping the cheap checks. A 20-line
  Friday import is what you are actually preventing, and ArchUnit catches it on day one.
- Waiting for the "right time" to extract, when the module is still exactly the right
  shape. The extraction cost is the data migration, and the data migration gets *harder*
  with time as more code grows to depend on the tables.
- Grounding a split in a technology preference. "We might want to write it in Go" is not a
  decomposition driver and it produces a service two people on earth can maintain.
- Planning the extraction as a code move, and discovering the data migration in week six.
- Getting to "modular" by renaming packages, without ever writing the rule that makes the
  rename mean something.

#### Interview Questions — The Modular Monolith

**Q1. When is a modular monolith the correct answer, and how do you know you are not just
rationalising staying where you are?** `STAFF`

It is correct when there are fewer than about five independent teams, one deployable already
ships without coordination, the domain is still changing, the data is one coherent model
with cross-entity invariants, and the latency budget is already tight. The rationalisation
test is which argument is actually doing the work. "We are too big" is rationalising,
because a large codebase deploys fine and the real problem is usually a build or release
constraint a pipeline fix would solve. "Two teams cannot ship without each other's
permission" is not rationalising. There is a second rationalisation worth naming —
reluctance to change dressed as architectural maturity — and the way to tell the
difference is whether you can name the specific thing a service split would fix. If the
answer is "we would feel more modern", the monolith is the right answer.

**Q2. Our monolith is 400k lines with 30 modules. We enforced the boundaries last year.
Should we split now?** `STAFF`

Only if there is a specific module whose boundaries have earned it, and the way to know is
the five signals: a genuinely different scaling profile, a different release cadence, a team
that exists and will own it end to end, a genuine technology requirement, or a reliable
history of being the thing that breaks. If you cannot name one with a specific answer, the
right move is to keep going as a modular monolith and revisit in a quarter, because the
boundaries are enforced and the extraction has not got more expensive in the meantime. The
thing that has genuinely got more expensive is the data migration, and that is an argument
for extracting *something* on a schedule rather than for splitting broadly now.

**Q3. How do you enforce module boundaries in a Spring monolith without a big build
change?** `STAFF`

Two things, and they take about three days together. First, make the module API explicit:
package-private for internals, a named interface or a published-package convention for the
types other modules may use, so reaching into an internal package stops being a style
choice and becomes a compile error. Second, ArchUnit rules in the test suite — no classes
in a module depending on another module's internal packages, a layering rule for the
web/service/persistence direction, and a rule that repositories never appear in a published
API. Add Spring Modulith's `ApplicationModules.verify()` on top, because it also verifies
the module interaction graph, which catches a coupling that lives in an event listener
rather than in an import. You do not need build-time module isolation until you have more
than about six modules or someone has already broken the rules twice.

**Q4. What actually goes wrong in a modular monolith?** `SCENARIO`

The package cycle, and it goes wrong in a completely predictable order. Somebody imports
an enum across a module boundary because it is tiny. Somebody then reaches for the other
module's repository because a port would be "over-engineering for one call". Somebody then
extracts a shared utility class, which belongs to nobody. Eighteen months later you have
3,000 cross-module imports, a boundary diagram with arrows in both directions between most
pairs, and a codebase that is a monolith with extra directories. The tell is that a
maintainer has stopped updating the module diagram because it does not reflect reality —
and the reason it stopped reflecting reality is that nothing failed while it drifted.

**Q5. We want to extract a module. What is the order of work?** `STAFF`

Data first, code second, and the data work is most of the project. Create the schema in
the new service and get the data-ownership answer in writing from whoever can commit to it.
Dual-write through an outbox rather than a synchronous call inside the transaction, because
a synchronous in-transaction call is the classic dual-write bug. Backfill historical rows.
Verify with row counts and checksums — the step everybody skips and the step that saves
you. Switch reads behind a flag, per endpoint, with a metric on the new path. Switch
writes. Leave the old table read-only for a retention window and drop it a month later, in
a separate change, so the rollback window is real. The code move itself is about a week.
The whole thing is two to four months, and every team that plans it as a week is planning
the part that is easy.

**Q6. Is it a failure to still be a monolith after two years?** `STAFF`

Only if the monolith is boundaryless, and those are different diagnoses. Two years in a
modular monolith with enforced boundaries, one process, and seven modules that each have an
owner is a system that has avoided an enormous amount of distributed-systems cost while the
domain found its shape. The thing to check is whether the boundaries are still *real* — if
ArchUnit is green and the module diagram is still accurate, then the modularity is
maintained and the deferred split was a decision rather than a failure. If the rules have
been commented out, or the diagram stopped being updated because it stopped being true,
then the monolith is decaying and the honest recommendation is to enforce the boundaries
again before considering any split, because a split from a boundaryless monolith produces a
distributed monolith, which is the outcome the modular monolith exists to prevent.

> **CHAPTER 5 SUMMARY**
>
> The modular monolith is very often the correct answer, and the argument for it is
> concrete rather than timid: it keeps transactional integrity across the whole domain, it
> keeps one process to profile in an incident, it has no partial failure, it runs on a
> laptop, and it still has real code boundaries. The entire cost of microservices reduces
> to two rows in the comparison table — independent scaling and independent deployment —
> so the argument reduces to whether you need either of those *now*, which is a question
> about team count and change independence. The critical qualifier is that a monolith is
> not modular by default: it becomes a ball of mud through small, locally-reasonable
> exceptions, which is precisely why the enforcement has to be mechanical. Package-private
> visibility with named interfaces, ArchUnit rules for cross-module reaches and layering,
> build-time module isolation, and Spring Modulith's verification and runtime interaction
> monitoring
> are the mechanisms, and the first three days of that work captures nearly all the value.
> Graduation is the discipline that makes deferral legitimate: extract when a module
> needs a different scaling profile, a different release cadence, a real owning team, a
> genuine technology requirement, or a reliable history of being what breaks. And every
> extraction, whenever it comes, is a data project first and a code move second — 2–4
> months where the code move is a week.

#### Further Reading

- [Microservice Chrestomath](https://microservices.io/patterns/microservices.html) — the step-by-step worked extraction, including the part where the join inverts and the data has to be duplicated; the single most useful thing to read before planning a migration.
- [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) — the argument that most services should be extracted from a modular monolith, and the case against splitting by technical layer.
- [Shared Database](https://microservices.io/patterns/data/shared-database.html) — the pattern every migration starts from, and the clearest statement of the problem you are trying to escape.
- [Spring Modulith](https://docs.spring.io/spring-modulith/reference/index.html) — the reference for module verification, runtime interaction monitoring, and the event publication catalogue; the lowest-friction path to enforced boundaries in a Spring monolith.

## Chapter 6 — Conway's Law & Team Topologies

### 6.1 The Law, Stated Accurately

The usual statement is *"organizations which design systems are constrained to produce
designs which are copies of the communication structures of those organizations."* That is
fine but it is descriptive, and the interview question is almost always **why**, because
the answer is what makes the law *predictive* rather than merely observed.

The mechanism is **homophily** and **homomorphism**:

```text
  THE MECHANISM, IN THREE STEPS

  1. HOMOPHILY — people form teams with people they can talk to.
     Communication is the bottleneck in software work, so teams cluster
     by communication style, by timezone, by level, and by the problems
     they find interesting. This is not management; it is how humans work.

  2. HOMOMORPHISM — the architecture converges on the communication graph.
     A team that talks to three other teams produces interfaces to those
     three teams. A team that talks internally produces modules. A
     boundary is expensive and communication is the thing that is
     expensive, so the architecture mirrors the org chart because the
     org chart is the cheapest thing to mirror.

  3. THEREFORE the org is an INPUT to the architecture, not an output
     of it, and it will win every argument you have about where the
     boundaries should be.
```

> **MUST REMEMBER**
>
> **Homophilic teams produce homomorphic architectures.** That is the whole mechanism, and
> it is why Conway's Law is predictive rather than descriptive: if you know how teams form,
> you can predict the architecture a set of teams will produce. And the prediction runs
> backwards too, which is Chapter 6.3.

The prediction that matters is the uncomfortable one: **an architecture that contradicts
the org chart does not stay as designed.** It erodes, quietly and for identifiable
reasons. A boundary that crosses teams gets a "temporary" shared library. A service owned
by three teams gets three slightly different ideas of what it does. A "we will keep this
monolithic because it is simpler" decision gets overridden by an acquisition of that code
by one team, because that is the cheapest thing for that team to do. The architecture
converges on the org within about eighteen months, and nobody chose it.

> **PRODUCTION RELEVANCE**
>
> The diagnostic that works is to compare the module/service diagram with the org chart
> and look for mismatches. Each mismatch is a specific, nameable failure in progress. A
> module owned by two teams will accumulate imports from both. A service owned by a team
> that has since been dissolved gets changes from whoever inherited the people, and those
> changes reflect *their* priorities. A team with no owning service is doing maintenance
> on something nobody is accountable for. None of these are technical problems and none of
> them can be fixed with a refactoring.

### 6.2 Why a Split Without an Org Split Fails

The most common failure in the whole field is a team-topology split without a code split,
or a code split without a team split. The second is better than the first and still bad.

```text
  ✗ CODE SPLIT, ORG UNCHANGED — 5 teams, 12 services, one release problem

  Before:  3 teams, 1 monolith, everybody coordinates, everybody ships
  After:   5 teams, 12 services, everybody coordinates, nobody ships
           ───────────────────────────────────────────────────────
           Net: all of the distributed-system cost,
                none of the independent-deployment benefit
           Name: the distributed monolith

  WHY IT IS SPECIFICALLY WORSE THAN EITHER PURE OPTION
    · latency: every in-process call is now a network call
    · transactions: the @Transactional boundary no longer covers the
      business operation
    · debugging: one stack trace became six, correlated by a trace id
    · coordination: UNCHANGED, and now with a network hop attached
    · on-call: MORE services, same number of people

  The org is the variable that decides whether the split paid. If it
  did not change, the split was a pure cost.
```

Note the shape of the argument, because it is the one to use in a review: the problem is
not that the split was *wrong* in some technical sense. It is that **the benefit of a
service boundary is realised by the org, and if the org does not change the benefit is
never collected.** The technical decisions can all be individually defensible. The
aggregate is a strict regression, and the regression is invisible to any single decision.

> **INTERVIEW TRAP**
>
> "Conway's Law means you should never split a monolith, because splitting code without
> splitting teams is a trap." Half the statement is right and the wrong half is the part
> that gets quoted back at you in a bad way. The law is not an argument against
> decomposition — it is an argument that **the org must be part of the change**, and that
> where the org cannot change, the boundary should be enforced in code and held inside one
> deployable. "Never split" and "split and change the team" are both consistent with the
> law; "split and change nothing" is the only version it forbids.

### 6.3 The Inverse Conway Manoeuvre

This is the genuinely useful part of the law, and it is almost never mentioned in
discussions that present Conway as a constraint. The observation is asymmetric: **the
architecture is hard to change and the org is comparatively easy to change.** Teams are
formed, split, and merged in weeks. Codebases take quarters. So when a law says the org
shapes the architecture, the leverage question is obvious — and the answer is to shape
the org to get the architecture you want.

```text
  THE INVERSE MANOEUVRE — deliberately force the org you need,
  so that Conway's Law delivers the architecture

  YOU WANT                    YOU FORCE                      YOU GET
  ────────                    ────────                       ───────
  independent teams           split the team by capability    a boundary
  shipping independently      2 teams, 2 on-call rotations    that deploys
                                                             independently

  no shared code              give each team its own           coupling that
  across a boundary           repo, its own pipeline          cannot be
                                                             accidental

  a platform that other       a platform team with its        a platform
  teams depend on             own roadmap and users           that is a
                                                             product

  a hard subsystem            a complicated-subsystem         one team that
  owned by experts            team with a deliberate           can hold the
                              mandate                        domain

  WHY THIS IS THE RIGHT LEVER
    changing a team structure   → weeks
    changing a codebase        → quarters
    changing an org            → the constraint is reversible
    changing an architecture   → the constraint is not
```

> **STAFF-LEVEL CONSIDERATION**
>
> The inverse Conway Manoeuvre is the answer to the most common senior-level pushback:
> "we cannot restructure the teams, they are fixed by our funding model." That constraint is
> real, and the correct response is not to abandon the analysis but to find the
> **sub-unit** lever. A funding model fixes cost centres, not the internal composition of a
> team. You can split a ten-person team into two five-person teams with different charters,
> different on-call rotations, and different repositories inside an unchanged cost centre,
> and Conway's Law will do the rest within two quarters. The org change that matters is
> *who talks to whom and who is on call for what*, and that is almost always available
> even when headcount and reporting lines are not.

The uncomfortable corollary: **the manoeuvre has a catch, and it is a real one.** You are
using an architecture decision to make a staffing decision stick, and if the manoeuvre
fails the org is worse off, because a team that was told it owns a boundary and then does
not have the budget or the mandate will do boundary-crossing work badly rather than not at
all. The safe version is to run the manoeuvre on the smallest scope that tests the
hypothesis — two teams, one boundary, one quarter — and only widen it when the first one
has demonstrated independent shipping.

### 6.4 Team Topologies: The Four Team Types

Team Topologies takes the Conway observation and makes it operational: four team types,
chosen deliberately, each with a different relationship to the platform.

| Team type | What it does | Interaction mode | Fails when |
| --- | --- | --- | --- |
| **Stream-aligned** | Owns a business capability or a user journey end to end, including its on-call | X-as-a-Service to other teams, and to customers | It is given a component ("you own the orders table") rather than a capability |
| **Platform** | Provides the paved road: CI/CD, observability, deployment, environments | X-as-a-Service — the internal platform is treated as a product with users | It becomes a ticket queue for the stream-aligned teams (see below) |
| **Enabling** | Provides capability the teams do not have: performance, security, testing, coaching | Collaboration, then facilitation — the goal is to make the team able to do it themselves | It is a permanent consulting function nobody graduates from |
| **Complicated-subsystem** | Owns a genuinely hard part — a compiler, an optimiser, a protocol implementation | Collaboration, deep expertise | It is used for anything described as "complex", which is most things |

**Stream-aligned** is the default and the important one. The definition that matters is
"owns a business capability or user journey", because it is different from "owns a
component" in exactly the way Chapter 4 argued. A team that owns "the orders table" will
do table work; a team that owns "the checkout journey" will do whatever checkout needs,
including a table. The second produces a boundary that follows the business, and the first
produces a boundary that follows the schema, which is a boundary that moves every time the
schema is reorganised.

**Platform** deserves its own treatment, because "platform team" is one of the most
commonly misused titles in industry.

> **TRADE-OFF**
>
> A platform team is a **product team with users**. That means it has a roadmap, it names
> its users, it measures whether they are using it, and it treats "nobody adopts the
> deploy pipeline" as a product problem to solve rather than as a compliance issue to
> enforce. The flip condition — where it stops being a platform team and becomes a cost
> centre — is when the only interaction is a ticket and the only metric is tickets closed.
> The test is simple: **does the platform team know who its users are and what they are
> failing to do?** If not, it is a cost centre with a modern name.

```text
  PLATFORM AS A PRODUCT — what it means concretely

  A product has           A platform team has
  ────────────           ────────────────────
  users it names          named consuming teams, and a pulse check
  a roadmap               a 2-quarter roadmap, visible to users
  adoption as a metric    deployment time, lead time, % of deploys
                            that do not need a human
  an experience to design  an internal developer experience, golden
                            paths, and the documentation for them
  churn to worry about     a team that stopped using it, and why
  support costs            everyone filing tickets, because there is
                            no paved road to file them about

  THE TICKET-QUEUE FAILURE
    A "platform team" that responds to tickets is a renamed ops team.
    Its output is closed tickets; its success metric is SLA compliance.
    Nobody uses it because using it is slower than not using it, and the
    reason is that it was never designed — it was staffed.
```

**Enabling** is the easiest to get wrong by accident, because it feels valuable. An
enabling team exists to teach — a performance team, a security team, a test-architecture
team — and its measure of success is **teams that no longer need it**. A team that is
permanently "helping" is a permanent tax, and the organisations that end up with one have
usually decided that the capability is nobody's job, which means it is everybody's job.
The good version has an exit condition: "we will work with three teams for two quarters,
and by the end each of them can do this themselves."

**Complicated-subsystem** is the one that gets rejected, and the rejection is the
institutional problem worth naming.

> **PRODUCTION RELEVANCE**
>
> A complicated-subsystem team is a legitimate answer to a genuinely hard component, and
> managers routinely reject it as a silo. The rejection almost always arrives with a
> number attached — "that team only has six people" or "that team is not aligned to the
> product roadmap" — and the number is the *symptom*, not the argument. The reason a
> complicated subsystem needs its own team is that the knowledge is deep and slow to
> acquire: an optimiser, a query planner, a protocol implementation, a video codec. Such
> knowledge is held by people who have spent years on it, and a reorganisation that
> disperses them across four feature teams converts one expert into four partial experts
> and destroys the capability. The manager-facing argument is not "they are valuable" but
> "this component has a two-year learning curve and we currently have three people who can
> change it safely; dispersal gives us zero."

> **MUST REMEMBER**
>
> The complicated-subsystem team is a real answer, and the argument against it is usually
> an org-chart argument rather than a technical one. "That is a silo" is not a reason to
> disperse expertise — it is a reason to fix the interfaces. The legitimate criticisms
> are specific: the team is isolated from product feedback, the roadmap is unaligned, or
> the "complication" is not real and the component would be fine as an ordinary module.
> Any of those is worth acting on. "We do not like silos" is not.

### 6.5 The Org-Level Antipatterns

Three antipatterns account for most of the organisational damage, and all three are
visible in an org chart within a minute.

```text
  ✗ THE TEAM THAT OWNS ALL THE SERVICES

    ┌──────────────────────────────────────────┐
    │  "Platform" team — owns 12 services      │
    │  Builds them, deploys them, on-calls     │
    │  them, maintains them                    │
    │                                          │
    │  4 product teams file tickets            │
    └──────────────────────────────────────────┘

    What has happened: you have NOT decoupled. You have distributed the
    build. The coordination cost is identical to before — the four teams
    still queue behind each other for the same team's capacity — and you
    have added twelve network hops, twelve pipelines, twelve dashboards,
    and an org chart that now claims a separation that does not exist.

    THE DIAGNOSTIC: ask what the product teams can do on a Friday that
    they could not do on Thursday. If the answer is "request a change",
    there is one team and twelve services.

  ✗ THE ROTATION ACROSS 40 MICROSERVICES

    One rotation, forty services, one pager. Consequences, in order:
      1. time-to-mitigate has a floor set by DIAGNOSIS, not fixing
      2. nobody can remember all 40 dashboards
      3. alert fatigue — the rotation ignores the 5th page
      4. the people who DO understand the system stop being on it
         (unpaid heroics, then attrition)
      5. the alert that mattered was #6 in the queue

    THE FIX IS STRUCTURAL, NOT VOLUNTARY: fewer, larger rotations;
    service-level runbooks that a competent stranger can follow; and
    ruthlessly fewer alerts — an alert that is not worth waking someone
    for is a tax on every page that follows it.

  ✗ THE ORG CHART AS A HARD ARCHITECTURAL CONSTRAINT

    "The payments team must own every table that mentions money."
    Consequence: a single joinable concept becomes the property of one
    team, the schema for half the company stops being able to change
    without their permission, and you have built a data-governance
    bottleneck that produces a queue.

    Converse: "we must own it end to end" taken to mean "no service may
    depend on any service we do not own" — which is how organisations
    end up reimplementing each other's capabilities rather than
    composing them.

    The workable middle: own the DATA and the BEHAVIOUR of your
    capability, and use a published interface to everyone else. Ownership
    is not exclusivity of use.
```

> **MUST REMEMBER**
>
> **Ownership is not exclusivity of use.** A team that owns a capability owns its data, its
> behaviour, its on-call, and its roadmap. It does not own the only right to call other
> capabilities. The confusion between those two is what produces both a data-governance
> bottleneck and a "we must reimplement it" reflex, and it is the single most useful
> distinction to make in an org design conversation.

### 6.6 Choosing a Team Structure

The mechanics, because this is a decision people fumble by listing pros and cons.

```text
  1. WHAT DOES THE BUSINESS DO? Name 3–7 business capabilities or
     user journeys. Not components. Not tables. If a capability has no
     recognisable name outside engineering, you are looking at a
     component, and a component is usually a module.

  2. HOW MANY TEAMS CAN THE ORGANISATION AFFORD?
     Cross-cutting knowledge is a per-team cost. Splitting 6 into 12
     means duplicating security, data, SRE, and platform expertise 12
     times. If the answer is "we cannot staff 8 teams", then 4
     capabilities get 4 teams and the other 2 are inside a neighbour,
     deliberately.

  3. WHERE IS THE HARD KNOWLEDGE?
     Components with a >6-month learning curve and <10 people who have
     it are complicated-subsystem candidates. Everything else is a
     module, not a team.

  4. WHAT DOES THE PLATFORM TEAM ENABLE?
     A platform team exists to make the other teams faster. If you
     cannot name what it unblocks, you are adding a layer.

  5. WHAT HAPPENS WHEN THE ORG CHANGES?
     Teams are created and dissolved on a ~2-year cycle. Boundaries
     derived from today's org must survive that, or be cheap to
     change. Boundary cheap to change == module boundary, enforced
     in code (Chapter 5).
```

The step that is routinely skipped is 2, and skipping it produces org designs that are
excellent on paper and impossible to staff. **Cross-cutting knowledge is a per-team cost**
and it is the constraint that limits how finely you can divide, and it has nothing to do
with how many people you have in total.

#### Common Mistakes

- Quoting Conway's Law descriptively ("orgs design systems that mirror their structure")
  and stopping there. The mechanism — homophily producing homomorphism — is what makes it
  predictive, and the prediction is what the interviewer is listening for.
- Splitting the code and not the org, and then describing the result as a partial success.
  It is a strict regression and the two halves of the trade have to be named together.
- Using Conway's Law as an argument never to split. It is an argument that the org must
  be part of the change.
- Accepting the "complicated subsystem team is a silo" framing at face value. That is an
  org-chart objection wearing a technical costume, and the legitimate criticisms of a
  complicated-subsystem team are all about interface and roadmap, not about size.
- Creating a platform team without a product. A ticket queue with a platform team's name on
  the door is an ops team, and the org has paid for a layer and got a queue.
- Treating ownership as exclusivity. "We own it end to end" is about accountability, not
  about a prohibition on calling other capabilities.
- Designing the team structure without counting the per-team cost of cross-cutting
  knowledge. That is the constraint that actually limits how finely an org divides.
- Never asking what happens to the boundaries when the org changes, which it will, on a
  roughly two-year cycle.

#### Interview Questions — Conway's Law & Team Topologies

**Q1. State Conway's Law and explain the mechanism.** `STAFF`

Organisations design systems constrained to mirror their communication structures. The
mechanism is homophily producing homomorphism: people form teams with people they can talk
to, because communication is the bottleneck in software work, and then the architecture
converges on the communication graph — a boundary is expensive and communication is what
is expensive, so the system mirrors the org chart because the org chart is the cheapest
thing to mirror. The reason this matters is that it makes the law predictive rather than
descriptive: know how the teams formed and you can predict the architecture they will
produce, including in the cases where somebody has drawn a different diagram and is
watching it erode.

**Q2. A company split its monolith into 14 services and kept the same 4 teams. What
happened and why?** `SCENARIO`

They got the distributed monolith, and every part of the cost with none of the benefit. The
coordination cost is identical to before, because the four teams still queue behind each
other for the same people's capacity — but now there is a network hop on every
collaboration that used to be a refactor, transactions no longer cover the business
operation, and an incident means correlating six services' logs. The tell, and the first
thing I would check, is whether a product team can ship anything on a Friday that it could
not have shipped on Thursday. If the answer is "request a change from the platform team",
there is one team and fourteen services. The fix is not to merge the services; it is to
split the team, or to accept the monolith.

**Q3. What is the Inverse Conway Manoeuvre and when would you use it?** `STAFF`

Deliberately shaping the architecture to force the organisation you need, because
Conway's Law will then deliver the architecture you want. The leverage argument is
asymmetry: changing a team structure takes weeks, changing a codebase takes quarters, and
the org is reversible while the architecture is not. So when you want a property —
independent shipping, a genuine platform, one team holding a hard subsystem — you force
the org into the shape that produces it and let the law do the work. I would use it when
the architecture is already correct and the org is lagging, which is the common case,
because teams reorganise more easily than codebases do. The catch is that you are using
an architecture decision to make a staffing decision stick, so I would run it at the
smallest scope that tests the hypothesis — two teams, one boundary, one quarter — and
widen only after independent shipping has been demonstrated.

**Q4. A manager says the platform team is a silo and should be dissolved. How do you
respond?** `SCENARIO`

I would look for what the platform team actually does, because the objection is usually
aimed at the wrong thing. If they take tickets and close them, the criticism is right and
it is not a silo problem — it is a missing product, and the fix is a roadmap, named
users, and an adoption metric, not dissolution. If they own a paved road that teams
genuinely choose to use and can change the rate at which teams ship, then dissolving them
removes the only thing that makes the other teams faster, and I would say so with the
adoption numbers in hand. What I would not do is dissolve a platform team and redistribute
the work into the four product teams, because that multiplies the cost of CI/CD and
observability by four and leaves every team maintaining a deployment pipeline badly. The
legitimate question is whether the platform team knows who its users are and what they are
failing to do, and that is a much better argument than "silos are bad".

**Q5. We have 40 microservices and one on-call rotation. What is the actual problem?**
`STAFF`

Time-to-mitigate now has a floor set by diagnosis rather than by fixing, and that floor
grows with the number of services. Nobody can hold 40 dashboards in their head, the alert
volume exceeds what a human can usefully respond to, so pages get batched and triaged
away — and the fifth page of a night is the one that mattered. Underneath that, the people
who genuinely understand the system drift off the rotation, because being the person who
always gets paged is unpaid heroics and eventually it is somebody else. The fix is
structural rather than a matter of discipline: fewer and larger rotations, runbooks a
competent stranger can follow at 3am, and ruthless alert reduction so that what remains
is worth waking someone for.

**Q6. Our team owns "orders" end to end. Is that a good team boundary?** `STAFF`

It depends on whether "orders" is a capability or a component, and that is the whole
question. If it means the order journey — place, amend, cancel, track, return, and the
data each of those needs — it is a good boundary and the one that produces independent
shipping. If it means "the orders table and the services that write to it", it is a
component boundary, and component boundaries move every time the schema is reorganised,
which is usually within two years. The check is what the team can do that it could not do
before: if the answer is "change the order data model without coordinating with three
other teams", the boundary is real. If the answer is "we are the gatekeepers of this
table", the team has been given a data-governance queue dressed as a capability.

**Q7. How do you decide how many teams an organisation can have?** `STAFF`

By the per-team cost of cross-cutting knowledge, which is the constraint and which has
nothing to do with total headcount. Every team needs security, data, SRE, and platform
expertise, and duplicating that across twelve teams is expensive even where the total
headcount is unchanged — you are buying twelve partial copies of expertise rather than
four whole ones. So: name three to seven business capabilities, then count how many teams
the organisation can actually staff with competent rather than merely present expertise. If
the answer is six and there are eight capabilities, two of them deliberately live inside a
neighbour rather than getting a team that cannot be properly staffed. The mistake being
avoided here is designing an org from the domain model and discovering the staffing
problem after the reorganisation.

> **CHAPTER 6 SUMMARY**
>
> Conway's Law is predictive rather than descriptive because the mechanism is
> **homophily producing homomorphism** — people cluster by who they can talk to, and
> architecture converges on the communication graph because a boundary is expensive and
> communication is what is expensive. The operational consequence is that a service split
> without a team split collects none of the benefit while paying the entire cost, which
> is the distributed monolith, and the diagnostic is whether a product team can ship on
> Friday what it could not ship on Thursday. The law is also a lever rather than only a
> constraint: the **Inverse Conway Manoeuvre** uses the asymmetry that reorgs take weeks
> and codebases take quarters to force the org into the shape that produces the
> architecture you want, run at the smallest scope that tests the hypothesis. Team
> Topologies makes it operational with four types — stream-aligned, which must own a
> capability rather than a component; platform, which is a **product with named users and
> a roadmap** and becomes a cost centre the moment it becomes a ticket queue; enabling,
> whose success metric is teams that graduate; and complicated-subsystem, which is a
> legitimate answer to a genuinely hard component and is routinely rejected by managers as
> a silo when the real criticism is always about interfaces and roadmap. The two
> distinctions worth carrying are **ownership is not exclusivity of use** — you own your
> data, behaviour, on-call, and roadmap, not the only right to call other capabilities —
> and that **cross-cutting knowledge is a per-team cost**, which is the constraint that
> actually limits how finely an organisation can divide.

#### Further Reading

- [Conway's Law](https://martinfowler.com/bliki/ConwaysLaw.html) — the primary source, including the "inverse Conway manoeuvre" observation that turns the law from a constraint into a design tool.
- [Team Topologies: Key Concepts](https://teamtopologies.com/key-concepts) — the four team types, the interaction modes, and the platform-as-product framing; the most directly usable org-design material in the set.
- [Presentation Domain Data Layering](https://martinfowler.com/bliki/PresentationDomainDataLayering.html) — the layers within a service, and the reason the module boundary in Chapter 5 is a layering rule as much as a package rule.
- [MonolithFirst](https://martinfowler.com/bliki/MonolithFirst.html) — the org argument in its clearest form: the reason most services should be extracted one at a time is that a big-bang split fails on the org long before it fails on the code.

## Chapter 7 — Migrating to Services

### 7.1 The Honest Cost Estimate Before Anything Else

Most migrations are underestimated by an order of magnitude, and the reason is always
that the estimate was built for the code move.

```text
  "WE'LL JUST LIFT THE CODE" — what that omits

  ASSUMED (2–3 weeks)                      ACTUAL (8–20 weeks)
  ────────────────────                     ────────────────────
  move the package                        decide who owns the data
  repoint the calls                       (an organisational negotiation,
                                           sometimes the whole project)
  add a service definition
                                          replace every join that touched
  deploy it                                 a foreign table — a denormalised
                                            copy, an event consumer, and a
  "done"                                    consistency window you must
                                           explain to somebody

  ◄── 2–3 weeks ──►                      ◄──────── 2–4 months ────────►

  ... plus the hidden multiplier: running TWO systems during the
      migration, which is where the bugs actually live (7.4)
```

> **SCALING REALITY CHECK**
>
> The number to carry: **extracting one service from a shared-database monolith is a 2–4
> month project, and from a monolith where the boundary is already an enforced module it is
> 3–6 weeks.** The difference is entirely data migration and join replacement. The other
> number: a team's estimate of "we'll just lift the code" is reliably about a third of the
> truth, and the missing two-thirds is always the same two items — who owns the tables, and
> what replaces the join.

Before starting, write down these four answers. If any of them is unknown, you have not
scoped the project:

1. **Who owns the tables, in writing, from someone who can commit to it?**
2. **What replaces every join on the request path, and what is the consistency window?**
3. **What is the rollback, at every step, and how long does it stay available?**
4. **What is the latency budget for the affected path, in writing?**

### 7.2 The Strangler Fig

The **strangler fig pattern** grows a new implementation alongside an old one and routes
traffic at the edge until the new one has replaced it. It is the default migration
strategy, and its mechanism is simple: the router becomes the thing you control.

```text
  STRANGLER — three phases, running BOTH for the middle one

  PHASE 1: BUILD ALONGSIDE
    ┌────────┐        ┌──────────────────────────────────────┐
    │legacy  │        │ NEW SERVICE                          │
    │monolith│        │  · own schema                        │
    │        │        │  · read from replicated order data   │
    │ owns   │        │  · no traffic yet                    │
    │ orders │        │                                      │
    └────┬───┘        └──────────────────────────────────────┘
         │
  PHASE 2: ROUTE, GROW, DUAL-WRITE          ◄── the expensive phase
    ┌────────┐   1%    ┌──────────┐
    │  NEW   │◄───────│  ROUTER  │───────► 99%  ┌──────────┐
    │service │        │(canary)  │─────────────►│  LEGACY  │
    └────────┘        └──────────┘              │ monolith │
                                                └──────────┘
                        + dual-write both paths
                        + reconciliation job comparing them
                        + metric + alert on divergence

  PHASE 3: RETIRE
    ┌──────────┐              ┌────────┐
    │  ROUTER  │─────────────►│  NEW   │   delete the legacy code path
    │  100%    │              │service│   delete the legacy tables
    └──────────┘              └────────┘   (a month later, separately)
```

> **TRADE-OFF**
>
> The strangler is the right default because the router makes the cut-over a
> **configuration change rather than a deployment** — you can go from 1% to 100% by changing
> a weight, and you can go back by changing it the other way, in seconds, without a
> rollback. The flip condition is **whether the old and new code are separable at all**. If
> the feature is spread across a hundred call sites in the monolith with shared local state
> and no seam, there is no edge to route at, and strangling degenerates into a big-bang
> rewrite wearing a canary. That case is Branch by Abstraction, below.

> **INTERVIEW TRAP**
>
> "Strangler fig is always the safe migration pattern." The senior correction: it is the
> safe pattern **for separable functionality**, and the phrase does most of its work in
> practice. When the thing you are extracting is a well-defined slice reachable at one
> entry point — a page, an endpoint, a job — routing works beautifully. When it is a
> behaviour woven through a hundred call sites with shared state, there is no seam to
> strangle, the canary becomes a lie about how much of the path is actually new, and you
> have a big-bang rewrite with extra steps. The question to ask before proposing a
> strangler is "where exactly does traffic enter, and can that be routed per-request?"

### 7.3 Branch by Abstraction

**Branch by abstraction** replaces behaviour behind an interface, in the same codebase,
in small steps, and switches between old and new implementations at runtime behind that
interface. It beats strangling exactly when the code is entangled rather than separable.

```java
// Step 1: introduce an interface over the existing implementation.
// Nothing changes. The interface exists, and the monolith is the only impl.
public interface TaxCalculator {
    BigDecimal taxFor(Order order);
}

@Component
class LegacyTaxCalculator implements TaxCalculator {
    @Override public BigDecimal taxFor(Order order) {
        // the existing, in-place, table-driven implementation
        return lookupInTaxTable(order);
    }
}

// Step 2: add the new implementation beside it. Still not called.
@Component
class RulesEngineTaxCalculator implements TaxCalculator {
    private final TaxRulesEngine engine;   // a real service, or a library

    @Override public BigDecimal taxFor(Order order) {
        return engine.evaluate(order).total();
    }
}

// Step 3: switch, at runtime, per-request. Both are live; this is the
// strangler-equivalent, except the routing lives in your code rather
// than at the edge — and therefore works for entangled call sites.
@Component
class RoutingTaxCalculator implements TaxCalculator {

    private final TaxCalculator legacy;
    private final TaxCalculator rulesEngine;
    private final Toggle toggle;                 // percentage, per-tenant, sticky

    @Override
    public BigDecimal taxFor(Order order) {
        return toggle.isOnFor(order.tenantId())
                ? rulesEngine.taxFor(order)      // NEW
                : legacy.taxFor(order);          // OLD
    }

    // The comparison is the point: a shadow run that computes BOTH and
    // emits a divergence metric is how you know the new one is correct
    // before any traffic depends on it.
    @Scheduled(fixedRate = 30_000)
    void compareImplementations() {
        // sample recent orders, compute both, emit tax_divergence_total
        // when they differ by more than a penny.
    }
}
```

Note the property that makes this better than strangling for entangled code: **the switch
is a per-request decision made in your own code, so it works for a behaviour that is
reached from a hundred call sites.** The strangler needs a routing point at the edge; the
branch has a routing point in the class that implements the interface, which you can put
anywhere. The cost is that you now have a routing branch in production code, and the
discipline required to remove it — because "we'll take that out later" is a promise
organisations break, and the residue is a tax calculation that is sometimes one thing and
sometimes another, which is a genuinely dangerous state for a number that ends up on an
invoice.

> **MUST REMEMBER**
>
> Branch by abstraction leaves a **permanent-looking artefact in production code**: the
> routing toggle. It is a feature flag with teeth, it will outlive the migration by
> default, and every one of them is a branch somebody has to reason about. The discipline
> is to name an owner, an expiry date, and a deletion ticket at the moment you add it —
> and to accept that some will be permanent, which means the design has to be correct on
> both paths, not just the new one.

### 7.4 The Hidden Cost: You Are Now Running Both

The strangler's own diagram says it and almost every estimate ignores it. During a
migration you are not running one system, you are running **two implementations of the
same business rule plus the machinery to keep them from diverging**, and the dual-path is
where the bugs live.

```text
  WHERE MIGRATION BUGS ACTUALLY LIVE

  ✗ the new service                  — 2% of traffic, the untested part
  ✗ the legacy path                  — 98% of traffic, well understood
  ✗ THE BOUNDARY between them        — 98% of bugs, 0% of test coverage
  ✗ the reconciliation job           — written once, alerted never
  ✗ the router configuration         — a weight someone changed by hand

  The three specific ways dual-paths go wrong:

  1. ASYMMETRY — a path is taken for some requests and not others,
     based on a tenant id, a percentage, a header, or a feature flag,
     and the two paths have subtly different behaviour. Now the bug
     is INTERMITTENT and data-dependent, and it reproduces for 2% of
     customers forever.

  2. DUAL-WRITE DIVERGENCE — both paths write, and they disagree.
     A background job that was written to detect this is the ONLY
     thing standing between you and a permanent inconsistency.

  3. THE FLAG NOBODY OWNS — the routing weight was changed by one
     person, during an incident, and no one wrote it down. Six months
     later 40% of production traffic is on a path that was supposed to
     be a temporary canary and whose author has left.
```

> **PRODUCTION RELEVANCE**
>
> The dual-write is the hazard and it needs a named answer before you start. **What
> reconciles the two paths?** Not "we'd notice" — a metric nobody alerts on is not a
> control. The answer is a reconciliation job plus a test that fails when the two paths
> disagree, and the discipline is that both must exist before the first write goes to both
> paths, not after the first divergence. And the single-write rule matters more than
> people expect: **during a migration, exactly one path should be authoritative for
> writes, at any moment**, with a single, timestamped, reversible switch between them.
> "Both paths write" plus "we compare them" is how a system ends up with two databases
> that are both authoritative and neither correct.

### 7.5 The Order That Is Consistently Got Wrong: Data Before Code

**The most reliable finding in migration practice is that the code move is easy and the
data move is the project.** Teams plan the code move, discover the data move in week six,
and then either ship a service that still reads the monolith's tables or run out of budget.

```text
  THE ORDER THAT WORKS                      THE ORDER TEAMS ACTUALLY USE
  ────────────────────                      ───────────────────────────
  1. identify the seam                       1. create the new service
     (Chapter 3's four tests)                2. copy the code into it
  2. name the data owner in writing         3. wire it up
  3. create the target schema               4. discover the join problem
  4. replicate the data                         in production
     (outbox / CDC / batch)                  5. add a call to the old tables
  5. verify: counts + checksums                 "temporarily"
  6. route READS to the new service          6. ship
  7. route WRITES, single authoritative      7. fix it
  8. stop the dual write
  9. leave the old table read-only
  10. drop it a month later, separately
```

The difference is not a matter of diligence. It is that steps 4 and 5 of the wrong column
require a decision nobody can make until the data owner has been identified and the join
has been designed around, and that conversation takes weeks. Doing it first is not
process for its own sake — it is because **the order front-loads the questions that are
expensive to answer late**.

### 7.6 The Seven Steps, In Order

1. **Identify the seam.** Chapter 3's four tests, in writing. If the data ownership test
   fails, stop — you have not identified a boundary, you have identified a component.
2. **Introduce a façade in the monolith.** One interface, at the call sites, so that
   swapping the implementation is a one-line change. This is the step that makes
   everything reversible, and skipping it is how a migration becomes a big bang.
3. **Create the target schema and replicate the data.** Outbox-and-relay, or CDC from the
   monolith's tables, or a batch job. *Never* a synchronous call inside the monolith's
   transaction — that is the classic dual-write bug, and it produces a write at A with no
   write at B and no way to know which.
4. **Verify.** Row counts, checksums, and a sampled field-by-field comparison. This step
   is skipped constantly and it is the step that saves you.
5. **Route reads** behind a flag, per endpoint, with a metric and a divergence alert on
   the new path.
6. **Route writes.** One path authoritative, a reversible switch, the reconciliation job
   running before the switch rather than after it.
7. **Retire.** Stop the dual write; leave the old table read-only for a retention window;
   drop it a month later in a separate change, so the rollback window is real.

**Every step needs a defined way back.** That is not optional, and the interesting part is
that the rollback shapes differ by step:

```text
  ROLLBACK, BY STEP

  step 3-4 (replicating)   → turn off the replicator. Nothing is
                              consuming it yet. Trivially safe.

  step 5 (reads)           → flip the flag back. Seconds. The reason
                              this step is done per-endpoint is so the
                              rollback is per-endpoint too.

  step 6 (writes)          → flip the authoritative flag back AND
                              reconcile the divergence. NOT free. This
                              is the step with a real rollback cost,
                              which is why it is a separate step from
                              reads and gets its own go/no-go.

  step 7 (retired)         → you cannot roll back to a table that was
                              dropped. Hence: read-only for a month,
                              drop as a SEPARATE change. The rollback
                              window is a calendar decision, not a
                              technical one.
```

### 7.7 A Six-Week Pilot That Produces a Real Answer

The problem with "should we go microservices" as a question is that the answer is
unknowable without doing it, and the cost of finding out is 6 months. A pilot gets a real
answer for a fraction of that.

```text
  WEEK 1   Pick ONE bounded slice with a clear seam and low fan-out.
           Write the four tests' answers down. Get the data-owner
           name in writing — if this stalls, that is your answer.

  WEEK 2   Create the new service: schema, build, deploy, one health
           check, one dashboard. No traffic. Deployable and idle.

  WEEK 3   Replicate the data. Verify with counts and checksums. The
           verification is the deliverable of this week.

  WEEK 4   Route READS at 1%, per endpoint. Shadow-compare writes.
           Reconciliation job + divergence alert live. You are now
           running both paths and you can prove they agree.

  WEEK 5   Ramp to 50%, then 100% of reads. Measure the p99 against
           the written budget. This is where the latency question
           gets a real number instead of an opinion.

  WEEK 6   Route WRITES. Drop the legacy path. Write the honest
           retrospective: what did the estimates say, what did it
           cost, and would you do it again.

  THE OUTPUT, in one page:
    · actual days vs estimated days, per phase
    · the new p99 on the affected path, measured
    · the number of deployables, dashboards, alerts, and runbooks
      the organisation now owns
    · whether the owning team could ship independently — the actual
      test of whether the boundary was real
    · a recommendation: more, one, or stop
```

> **STAFF-LEVEL CONSIDERATION**
>
> The most valuable output of a pilot is usually not the recommendation — it is the
> **estimate-versus-actual delta on the data migration**, because that number is the one
> every subsequent extraction estimate is calibrated against, and teams that skip the pilot
> calibrate it against nothing and are wrong by a factor of three on every future project.
> Write the retrospective down where the next team will find it, because the default
> outcome of a pilot that produced an honest estimate and no decision is that the estimate
> is rediscovered from scratch by the next person in two years.

> **INTERVIEW TRAP**
>
> "Strangler fig is incremental and low-risk, so migrating is straightforward." The senior
> correction: the *cut-over* is incremental and reversible, but the **period of running
> both implementations is the highest-risk state the system will ever be in.** Two
> implementations of one business rule, a router that can send the same customer down
> different paths, and a reconciliation job that is the only thing detecting divergence —
> none of which existed a month ago. The strangler makes migration *possible* without
> making it *easy*, and the honest estimate has to include the two-path period, the
> reconciliation machinery, and the discipline to retire the old path rather than leave it
> running for a year.

#### Common Mistakes

- Planning the code move and discovering the data move in week six. Data first is the
  single most reliable finding in migration practice.
- Dual-writing with a synchronous call inside the monolith's transaction. That produces a
  write at A with no write at B and no way to know which.
- Treating the two-path period as cheap. It is the highest-risk state the system will be
  in, and the reconciliation job is the only thing detecting divergence.
- Writing a reconciliation job and never alerting on it. A metric nobody alerts on is not a
  control.
- Letting both paths be authoritative for writes "for safety". Safety here is achieved by
  exactly one path being authoritative with a reversible switch between them.
- Using branch by abstraction and leaving the routing toggle in place indefinitely. Every
  surviving flag is a branch somebody has to reason about, in a code path that handles money.
- Dropping the old table in the same change as the cut-over. The rollback window has to be
  a calendar decision, and it has to be made before you need it.
- Declaring victory at 100% traffic without checking whether the owning team can now ship
  independently. That is the test of whether the boundary was real.

#### Interview Questions — Migrating to Services

**Q1. How would you migrate a shared database into a service?** `STAFF`

Data first, code second, and the data work is most of the project. Create the target
schema and get the data-ownership answer in writing from someone who can commit to it.
Replicate the data through an outbox relay or CDC — never a synchronous call inside the
monolith's transaction, which is the classic dual-write bug. Backfill, then verify with
row counts and checksums, which is the step everybody skips. Route reads behind a flag per
endpoint with a metric and a divergence alert. Route writes with exactly one path
authoritative and a reversible switch, with the reconciliation job running *before* the
switch. Stop the dual write, leave the old table read-only for a month, drop it as a
separate change so the rollback window is real. The code move itself is about a week; the
whole thing is two to four months, and the reason for the order is that the expensive
questions — who owns this table, what replaces this join — are the ones that are cheapest
to answer before you have written any code.

**Q2. When would you use Branch by Abstraction instead of strangling?** `TRICKY`

When the code is entangled rather than separable. Strangling needs a routing point at the
edge — an endpoint, a page, a job — that you can point at the new implementation. If the
behaviour you are extracting is reached from a hundred call sites through shared local
state, there is no such point, and the strangler's canary quietly becomes a big-bang
rewrite with extra steps. Branch by abstraction puts the switch inside your own code, in
the class that implements the interface, so it works for a behaviour that has no clean
entry point. The cost is the residue: the routing branch lives in production code, and if
it survives the migration it is a branch that handles a number which ends up on an invoice.
So it needs a named owner and a deletion ticket from the day you add it.

**Q3. What is the highest-risk part of a strangler migration, and why?** `STAFF`

The period where both implementations are live, and the boundary between them. The cut-over
itself is a configuration change and is trivially reversible. But while both paths are
running, the same request can take different code depending on a tenant id or a percentage,
so bugs are intermittent and data-dependent and reproduce for 2% of customers forever.
Both paths writing means divergence, and the only thing detecting it is a reconciliation
job. And the routing weight is a piece of hand-edited configuration that someone changed
during an incident and nobody wrote down. The mitigation is not caution, it is
mechanism: one authoritative write path with a reversible switch, a reconciliation job with
an alert, and a routing decision that is version-controlled rather than a number in a
dashboard.

**Q4. Our migration is 40% done and running both paths. How do you know the two are
actually the same?** `STAFF`

Four things, in increasing order of how much they should worry you. Row counts and
checksums, to catch a data problem before anyone reads it. A sampled field-by-field
comparison on recent records, to catch a mapping problem that counts match. A shadow run
that computes both and emits a divergence metric, which is the only thing that catches a
*logic* difference — the same inputs producing different outputs, which no amount of
comparing stored data will find. And an alert on that metric, because a reconciliation job
that nobody is paged for is a log line. If we do not have the fourth, I would want it
before increasing the traffic percentage, and the percentage is the risk dial: the two-path
period is safest at 1% and most dangerous at 40%, which is where you are now.

**Q5. A team's strangler migration has been at 90% for eight months. What is wrong?**
`SCENARIO`

The old path is still running and nobody will switch it off, and the most likely reason is
that the two implementations do not quite agree. If the legacy path can still handle
traffic, someone has a reason for it, and that reason is usually a difference nobody has
characterised — an edge case in the new implementation, a customer on a bespoke contract, a
reconciliation divergence that was explained away once. The cost is not just the double
running cost; it is that every future change must be made twice, in two codebases that
have started to diverge, which means the migration is now a permanent tax rather than a
project. I would want to know the specific divergence, treat finding it as a bug with an
owner, and give the old path a dated deletion ticket with a named person.

**Q6. How do you know a migration is worth having done?** `STAFF`

Three numbers, and the first is the one people skip. The estimate-versus-actual delta on
the data migration, because that is the number every future extraction gets calibrated
against. The measured p99 on the affected path against the written budget, because the
whole latency argument in Chapter 1 is only real if somebody checked it rather than
assuming it. And the operational delta: how many deployables, dashboards, alerts and
runbooks the organisation now owns, and how many people are on call for them. And then
the question that decides whether the boundary was real at all: **can the owning team now
ship without coordinating with anyone?** If yes, the migration did what it was supposed to
do. If no, you have the distributed monolith and a better-separated codebase, which is a
better outcome than nothing and a much worse one than a modular monolith would have been.

**Q7. Our first service extraction is three months in and we have not finished the data
migration. What should we do now?** `SCENARIO`

Finish the data migration before touching anything else, and treat the current state as
the lesson rather than as a problem to route around. The most common outcome of a team in
this position is to ship the service with a synchronous read of the monolith's tables
labelled "temporary", and that label is accurate and indefinite — it becomes a dependency
the new service's architecture is built around, and the second attempt at the data
migration is harder than the first because now the service depends on the old schema. The
recovery is to keep the service off real traffic, get the owning table actually owned, and
replicate properly. If that means pushing the launch by a month, the comparison is against
a service that will still be blocked in six months, not against a plan that was achievable
on the original date.

> **CHAPTER 7 SUMMARY**
>
> Migration is a data project with a code move attached, and the order that works is data
> before code for a concrete reason: it front-loads the questions that are expensive to
> answer late — who owns this table, and what replaces this join. The seven steps are
> identify the seam, introduce a façade in the monolith so every later step is reversible,
> create and replicate the target schema, verify with counts and checksums, route reads per
> endpoint behind a flag, route writes with exactly one authoritative path, and retire the
> old table a month later as a separate change. The strangler is the default because the
> router makes the cut-over a configuration change rather than a deployment, but it needs
> a routing point at the edge, which is why **branch by abstraction** — switching inside
> your own code behind an interface — wins when the behaviour is entangled rather than
> separable, at the price of a routing branch that will outlive the migration unless it is
> given an owner and a deletion date. The hidden cost that every estimate omits is the
> two-path period, which is the highest-risk state the system will be in: two
> implementations of one rule, asymmetry that makes bugs intermittent and
> tenant-dependent, and a reconciliation job with an alert as the only thing detecting
> divergence. And the honest cost is **2–4 months from a shared-database monolith, 3–6 weeks
> if the boundary is already an enforced module** — which is the arithmetic that makes
> Chapter 5's argument rather than Chapter 7's.

#### Further Reading

- [Strangler Fig Application](https://martinfowler.com/bliki/StranglerFigApplication.html) — the primary source for the routing-at-the-edge mechanism, and the clearest statement of why the incremental cut-over is what makes it safe.
- [Branch by Abstraction](https://martinfowler.com/bliki/BranchByAbstraction.html) — the alternative for entangled code, and the honest treatment of when the abstraction becomes a permanent fixture rather than a temporary scaffold.
- [Microservice Chrestomath](https://microservices.io/patterns/microservices.html) — the full worked extraction, step by step, including the dual-write, the backfill, the verification, and the cut-over; the single most useful thing to read before planning a migration.
- [Feature Toggle](https://martinfowler.com/bliki/FeatureToggle.html) — the mechanics and the discipline of the toggles both strategies depend on, including the part about how many of them end up permanent.

---

### End of Volume 1

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- **Do the latency arithmetic out loud.** Given a chain of N synchronous calls, state the
  p50 and explain why the p99 is roughly the sum of the p99s, and say what the leverage is
  (removing serial dependencies, not making any one call faster).
- **Name the five non-latency costs** of a service boundary without prompting: partial
  failure as the steady state, ACID stopping at the boundary, the deployment and
  observability surface, on-call diagnosis time, and the testing regression.
- **Distinguish a bounded context from a service** and give an example where the mapping is
  not one-to-one in either direction.
- **Run the four tests** on a candidate boundary — data ownership, latency budget, org, and
  failure independence — and say which one fails most often.
- **Use a co-change matrix** and explain why the highest co-change pairs are a warning
  rather than an opportunity, and what the number you actually want is.
- **Argue for a modular monolith** in a way that names what it keeps (transactional
  integrity, one process to profile, no partial failure, laptop-runnable) rather than
  asserting that microservices are "complex".
- **List the five mechanisms** that make a monolith actually modular, and say which three
  days capture most of the value.
- **State the five graduation signals** — scaling profile, release cadence, owning team,
  technology, and the thing that breaks — and say what is *not* one.
- **Explain homophily → homomorphism**, why it makes Conway's Law predictive, and what the
  Inverse Conway Manoeuvre does with it.
- **Describe the four team types** and say what makes a platform team a cost centre.
- **Say why "ownership is not exclusivity of use"** — the distinction that prevents both a
  data-governance bottleneck and the reimplementation reflex.
- **Run the seven migration steps in order**, and explain why the data move comes first and
  what replaces a join.
- **State the real cost** of an extraction: 2–4 months from a shared-database monolith,
  3–6 weeks from an already-enforced module.

The one-sentence summary of this volume: **a service boundary is a bet on the future, and
the size of the bet is the cost of being wrong** — so find the seam with change rate, data
ownership, latency budget, and team topology; hold it in code as an enforced module until
the org makes it worth a deployable; and when you do extract, do the data first.

### Coming in Volume 2 — Communication, Data & Consistency

Volume 1 is the paradigm: whether to have a boundary, and where. Volume 2 is the
machinery of what happens once you do. It covers sync versus async and the latency
arithmetic from a different angle, API contracts and how to evolve them without breaking
every consumer, events and the difference between an integration event and a domain event,
the Saga patterns in depth, idempotency and why at-least-once delivery is the only honest
default, the transactional outbox, change data capture, CQRS, the consistency models and
the question "how stale is allowed to get", and distributed transactions — what 2PC buys,
why nobody uses it, and the honest comparison. If Volume 1 asked whether the boundary
should exist, Volume 2 is about everything that crosses it.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). This bank is deliberately **D**-weighted: the
design questions are what separate a candidate who has configured a system from one who
has operated it, and this volume is about decisions rather than mechanisms.

### The Cost of a Boundary

**D1. Would you split this monolith into services? What would you need to know first?**
`STAFF`

Three things before I answer, and the first two are not technical. How many teams will own
the pieces, and can any of them ship without another team's permission — that is the
Conway test, and a blocked release is the only convincing reason to split. Second, whether
the data supports the boundary: can each candidate service own its tables without a
cross-service join in the request path, and if not, what is the denormalised copy that
replaces the join. Third, what the latency budget is, in writing, because adding a hop to
an already-serial path is a regression somebody has to justify to the SRE. Codebase size
is not on the list — a 400k-line codebase that deploys weekly is a build-pipeline
question, not a microservices question. With fewer than about five teams and no
coordination bottleneck I would recommend a modular monolith with enforced boundaries, and
I would say so even if nobody asked.

**D2. A team says the monolith is too big to deploy quickly. Is that a microservices
problem?** `STAFF`

Usually not, and the question is worth pushing on because "too big" is a symptom rather
than a diagnosis. What I would measure first is *why* deploys are slow, and the answers
run to things that have nothing to do with service boundaries: a build that recompiles the
world, a test suite with no tiering so a two-minute unit suite is blocking every merge, a
release process that requires a manual approval hop, a database migration coupled to the
deploy, or a Friday deploy ban that has become a Friday deploy drought. Every one of those
is cheaper to fix than a distributed system. The point at which it stops being a build
problem is when two teams cannot ship without each other's permission — that is an org
constraint, and Chapter 6 is the answer rather than Chapter 1. The honest framing is that
deploy speed is a property of the process, and splitting the code only changes it if it
changes the process.

**D3. Our microservices have 40% more incidents than the monolith. What is your first
hypothesis?** `STAFF`

That the split produced a distributed monolith, and specifically that two of the services
share a database or sit on one release train. I would test it with three questions: can you
deploy any one of these without the others, does any single deployment require two teams
to coordinate, and does any request path join across service boundaries. A 40% increase
after a split is almost never "microservices are hard" — it is nearly always a boundary
that does not exist in practice, so you have all of the distributed-system cost and none
of the independent-deployment benefit. The second hypothesis, which I would check next, is
that the on-call rotation is now spread across more services than any one person
understands, so the same root cause is being counted as four separate incidents and
time-to-mitigate has risen.

**D4. Is "always split into services" universally right?** `STAFF`

No, and the useful inversion is that the two rows of the comparison table microservices
lose are the only two it wins. A modular monolith keeps transactional integrity across the
whole domain, one process to profile, no partial failure, and laptop-runnable testing.
Microservices wins on independent scaling and independent deployment, and those are the
only wins. So the decision reduces to whether you need either *now* — which is a question
about a scaling profile and a team count rather than about code quality. A team of three
with a coherent data model and a tight latency budget should absolutely not split. A team
of seven that cannot ship without a lockstep release should, and the release problem is
the reason. The staff-level version of the question is: what specifically gets better, and
by when?

**D5. A team is on their third round of "we should split the monolith". What do you
suspect?** `SCENARIO`

I would suspect they have not yet made the split cheap, so each attempt is a re-architecture
under schedule pressure and produces a boundary they had to discover rather than one they
had found. The pattern is almost always: a proposal, a design review that stalls on data
ownership, a quarter of argument, then a decision to do it in pieces, and then a big-bang
attempt because the pieces were not independently shippable. The cheapest intervention is
to convert the argument into a two-day piece of work: carve the candidate out as a module,
add the ArchUnit rules, and now the next conversation is about a module with enforced
boundaries rather than about a folder. If after that they still want a service, the
question is much better because the boundary is real and the extraction becomes mechanical.

**T1. We have six synchronous dependencies, each with a p50 of 20ms and a p99 of 100ms.
What are the p50 and p99 of the chain, and what is the fix?** `TRICKY`

p50 is 120ms. p99 is roughly 600ms, because the p99 of a sum is approximately the sum of
the p99s, and p99.9 would be in the seconds. The fix is not making any dependency faster —
it is removing serial dependencies. Three of the six in parallel plus a join gives a p50 of
60ms and a p99 near 120ms, which is a five-fold improvement at the tail for the same total
work. The cost is that partial failure becomes more likely to be partial, which is then
handled with a Saga and compensating actions rather than by the serial chain you just
removed. If you cannot parallelise them, the second fix is load shedding: fail fast on the
non-critical ones rather than making the user wait for all six.

**T2. A circuit breaker is open on one of six dependencies. What does the user see?**
`ADVANCED`

Whatever the fallback returns, which is the design decision the circuit breaker has forced
onto you and nobody made explicitly. If the fallback is a default or a cached value, the
user sees a subtly wrong answer — an order placed with a stale price, a checkout that
completes with an empty basket. If the fallback is an error, the user sees a failure on a
path that was not actually broken, and the circuit breaker has converted a partial outage
into a total one. The other thing they see is the metric: an open breaker is a
near-guarantee that the open-circuit rate and the fallback rate are non-zero, and if those
are not on a dashboard the outage is invisible. A breaker without a fallback-rate alert is
an outage with a 0% error rate.

**T3. What is a partial failure in a six-service checkout, concretely?** `STAFF`

Three writes committed and three did not, and no rollback. The realistic case: the order
and the stock reservation succeeded, the payment is in an unknown state because the
provider timed out, the shipment record was never created, and the customer got either a
success page or an error — and if they got a success page, the payment state is unknown to
us. The system's actual state is not describable by any single word, which is the whole
point: in a monolith this outcome is impossible because the transaction either committed
or did not. The design work is to be able to *name* the possible states and have a
compensating action for each, which is a Saga, and to be able to reconcile the ones the
Saga never reached.

**S1. A PR adds a new synchronous call into a five-hop request path. What is the review
comment?** `ADVANCED`

What is the p99 budget for this path and what is it now going to be, in writing. A
fifth-serial-hop path already has a p99 over 500ms; adding another call with a 20ms
median takes it to roughly 600, and the person writing the PR has not costed that because
the cost is not visible in the diff. The acceptable answers are: this call can be made in
parallel with the others, or it can be moved off the request path into an event handler,
or the budget can be raised and somebody senior can say why. The unacceptable answer is
"it's only a few milliseconds", because 20ms median with a 100ms p99 is how you get a
600ms tail, and every one of those milliseconds is paid by users at the 99th percentile.

**S2. A reviewer sees a service that calls the monolith's database directly with a comment
saying "temporary". What do you do?** `STAFF`

Treat the comment as the finding. A service reading another system's tables has not been
extracted, it has been given a network hop — and the difference matters because the
temporary version is now the architecture, because the service's data access is written
against the old schema and a second attempt at the data migration has to start from
scratch. I would want to know the specific reason it is still there, and the honest reasons
are usually one of three: the data owner has not been identified, the join has not been
designed around, or the read is on a cold path and the team deprioritised it. Each has a
different fix, and none of them is "leave it and add a second comment". I would also ask
for a ticket with a date, because a temporary cross-database read with no date is a
permanent one, and the most valuable thing a reviewer can do here is make the date
explicit.

**S3. A service owns 14 tables. What is the review comment?** `ADVANCED`

Fourteen tables is not automatically wrong and it is almost always worth asking why. Either
those tables genuinely hang together — high internal co-change, low external, and they
move together for the same business reason, in which case the service is right and the
question is only whether the schema makes that obvious — or the service has become a
second monolith with a network in front of it. The tell is in the co-change matrix: if
those 14 tables change together with the rest of the system's tables, the service has no
boundary, whatever its directory structure says. I would want the co-change numbers, and
if the service fails the data ownership test because a query on the request path joins
across the boundary, the extraction has bought latency and no independence.

### Domain-Driven Design & Bounded Contexts

**D6. Is DDD worth it for a team of six working on one product?** `STAFF`

The tactical patterns, mostly not; the language and the boundaries, yes and urgently. A
team of six on one product is precisely the case where you need to *know* where your
contexts are, because the next thing that happens is the team grows to fourteen and the
implicit boundaries calcify into whatever the code happened to look like. So: do the
ubiquitous language, name the contexts, draw the context map, and enforce them as packages
with a test that says modules cannot reach into each other's internals. Skip the
specification pattern and the repository abstraction until a context actually hurts. And be
explicit about the deliverable — it is a boundary map you can use to decide about services
later, not a set of design patterns to apply now.

**D7. A team has a shared model library that both the Order team and the Billing team
depend on. What is the actual risk?** `ADVANCED`

A shared kernel has crossed a service boundary, which means the coupling still exists but
is now invisible to both compilers and enforced by neither team's build. A change to that
library is a coordinated release between two teams, and the compiler that used to catch
the breakage has been replaced by a 3am page. It has already happened in the sense that the
coordination cost is being paid now: the symptom is a small stream of "can you just release
the shared model first so I can ship" requests that block each other's pipelines. The fix
is to split the library into the part that is genuinely shared *vocabulary* — which can
stay, and is a fine thing to have — and the part that is shared *behaviour*, which is a
service boundary pretending to be a library, and give the behaviour to one team with an
owner.

**D8. Two teams both need to talk to a supplier whose API is changing underneath them.
What is the right structure?** `STAFF`

One anti-corruption layer, owned by one of them, with the other consuming your interface
rather than the supplier's SDK. This is the case the ACL exists for: the upstream is
volatile and outside your control, your model is worth protecting, and the cost of the
translation layer is genuinely lower than the cost of two teams each absorbing the same
breaking change on their own schedule. The important design points are that the interface
is in your nouns, that the supplier's identifier is never persisted in your tables, and
that their rate limits and error shapes are handled once, in the ACL, with their retry
policy — so when the supplier is having a bad afternoon there is exactly one place to
look. If the supplier is not external — if it is a service you also own — then skip the
ACL and agree a vocabulary instead, because a translation layer protecting a boundary you
control is a cost with no benefit.

**D9. "Customer" means something different to Sales and to Billing. Is that a service
boundary?** `TRICKY`

Not automatically, and the test is whether the *meaning* diverges or only the *fields*. If
Sales' customer is a prospect-to-be and Billing's customer is a legal entity with payment
terms and a credit limit, that is a genuine context boundary and the two contexts deserve
different names — the naming is itself the diagnostic win. If the difference is that
Billing stores four extra attributes, that is one context with two read-modelled
projections, and splitting it buys a network hop and a distributed join for nothing. The
question is "in what world is a statement about this customer true?" If the answer is
"both, for different reasons", you have two contexts. If it is "both, it is the same thing",
you have one context and a missing projection.

**D10. When is a bounded context not a service?** `STAFF`

Most of the time in a well-run system, and the direction of the exception is worth stating
precisely. Two contexts in one deployable is a perfectly good modular monolith, and it is
the right answer for a small team — the semantic boundary is the valuable artefact, and the
runtime boundary is a cost that buys independent deployment you may not need. One context
split across two services, by contrast, is a distributed monolith: the semantics said
"one thing" and the runtime says "two", so you have paid for the cost and gained no
clarity. A context with two genuinely different scaling profiles inside it is the third
case, where one deployable is right for the domain and two are right for the runtime, and
that is a deployment boundary rather than a semantic one.

**T4. Two teams both use the word "Customer" and both create a `customers` table. What
happens over eighteen months?** `TRICKY`

A mapping table, a reconciliation job, and eventually a data-quality team. The mechanism is
that the two vocabularies imply two sets of invariants, and only one of them can be in the
schema: Sales believes a customer is never null, Billing believes an account exists even
with no identified holder, and the schema can only express one. So a migration adds a
second identifier column, a backfill fills it for 98% of rows, and a nightly job
reconciles the other 2% — and that job is the price of the two vocabularies, paid forever,
by nobody's fault, because both teams were using their own vocabulary correctly.

**T5. A team applies DDD's tactical patterns but never did the modelling. What have they
got?** `ADVANCED`

Ceremony and no benefit. Specifically: a directory of classes called `*Aggregate` and
`*Repository` that wrap JPA entities, a domain layer with no invariants in it, and a team
that now believes it is doing DDD. The cost is real — one more layer between the
application and the database, indirection on every use case, and a new hire who has to
work out what any of it is for. The tell is that there is nowhere in the codebase where a
business rule about consistency lives, and nobody could name the contexts if you asked. The
recovery is to stop adding patterns and go back to the language: name the contexts, draw
the map, and only then decide which tactical pattern, if any, a given context has earned.

**S4. A PR introduces `SupplierOrder` — the vendor's DTO — into a domain service
signature. What is the review comment?** `STAFF`

The supplier's model has entered your domain, and now their field renames, their nulls,
their versioning, and their breaking changes are your problems everywhere that type
appears. This is the exact leak the anti-corruption layer exists to stop, and the fix is
small and mechanical: translate it in the ACL into your own type, and have the domain
depend on your interface. The related thing I would check is whether the vendor's
*identifier* is being persisted — that is worse than a DTO in a signature, because it makes
their ID space part of your data model, and migrating off it later becomes a data
migration rather than a refactor.

**S5. A reviewer sees the Customer context's JPA entities being returned straight out of a
REST controller in the Order context. What is the comment?** `STAFF`

Two leaks in one review, and the second is the one that will cost more. First, the other
context's persistence model is now part of this context's published contract — every field
rename and every `@Column` in the customer schema becomes a breaking change to the Order
context's API, and the two will be released in lockstep forever because of it. Second, and
worse, it means the Order context cannot change how it stores customers without changing
what the Order context *returns*, which is the definition of a shared kernel forming by
accident. The comment should name the fix: a DTO in the Customer context's own terms, with
a mapper at the boundary, so the vocabulary and the schema are each allowed to change
independently. And the follow-up question is whether the reverse also happens — Order
reading Customer's schema directly in a join is the same mistake in a worse place, because
it is on the request path.

**S6. A team adds a `Specification` base class to every repository "for consistency". What
is the review question?** `ADVANCED`

Which contexts needed it, and what happened in the ones that did not. The specification
pattern earns its cost in a domain with real combinatorial rule variation — insurance
underwriting, tax, pricing — where expressing the rules declaratively is genuinely clearer
than a chain of conditionals. Applied uniformly as a base class on every repository, it is
an abstract method with two implementations in the codebase and an indirection on every
call, and it makes the simple cases harder to read than the conditionals it replaced. The
review question is per-context, not global, and a team that has to ask "which contexts
needed it" and cannot answer is applying a pattern by habit rather than by decision.

### Finding Seams

**D11. Two modules have 0.7 co-change. Does that mean they belong in one service?**
`TRICKY`

No. The rule is not "co-change means together", it is "co-change for the *same reason*
means together". High co-change with different reasons is a seam with a shared business
event crossing it — a promotion PR that changes both pricing and invoice format is one
commit doing two unrelated things. The move is to ask *why* they co-change, and if the
answer is a single business event, that is not evidence of a shared lifecycle. The number
I actually look for is high-internal, low-external: a cluster that changes together and
rarely with anything else. And the corollary that surprises people: the things that change
with *everything* are usually the densest coupling, not the cleanest boundary, so the
highest edges of a co-change matrix are a warning rather than an opportunity.

**D12. A candidate service needs to join three tables to answer a hot query. What do you
do?** `STAFF`

Three options, not equally good. Denormalise — the service keeps its own copy of the
fields it needs, maintained by events — which is legitimate and introduces a consistency
window you have to be able to explain to a customer. Add a network call at request time,
which is acceptable only off a hot path and is the most common way a distributed monolith
is built by accident. Or do not extract this boundary yet, and make it a module with its own
tables inside the shared database. What I would not do is "temporarily" call the other
service synchronously and plan to fix it later, because temporary cross-service joins in
request paths do not get fixed; they get documented, and then the next engineer extends
the pattern.

**D13. A team ran a three-day event-storming workshop and produced 400 sticky notes. What
should they have done instead?** `SCENARIO`

One 90-minute session on one bounded slice — a single customer journey through a single
business capability — and about 40 notes expected. The 400-note version fails for a
specific reason: the technique's product is a shared mental model in a small number of
heads, and 400 notes exceeds what a person can hold, so the workshop produced documentation
rather than understanding. The observable difference is the output. A good session ends with
people disagreeing about specific words and about specific missing transitions, and those
disagreements are the seams. A 400-note session ends with someone asking for a photo of
the wall, which means the deliverable is a picture and the actual work has not started.

**D14. The boundary is obvious, all four tests pass, and the team count is three. What do
you recommend?** `STAFF`

Make the boundary real as a module and do not extract. Three teams is below the threshold
where independent deployment buys anything, because the coordination problem it solves does
not exist at that size. What you get for two days of work is real: enforced package
boundaries, an ArchUnit rule that stops modules reaching into each other's internals,
separate tables, its own transaction boundary, and a clear statement of who owns what. That
gives you the option later, makes the boundary visible so you can actually move it, and
costs almost nothing if the org never grows. The module step is also what makes a future
extraction mechanical rather than a re-architecture, which is the main argument for doing
it.

**D15. Where do you draw a boundary in a system where the business is still changing every
quarter?** `STAFF`

Draw it where the *invariants* are, and make it enforced in code, but do not pay for a
deployable. Under high domain churn a boundary drawn today will be wrong by Q3, and the cost
of being wrong is asymmetric: redrawing a module boundary is days, redrawing a service
boundary is months because of the data. So the recommendation is: identify the seams now
using the language and the co-change data, enforce them as modules with ArchUnit, and
defer the service boundary until the churn settles. The exception is any seam that is
already stable for a reason other than maturity — a compliance boundary, a data-residency
boundary, a hard technical dependency on a different platform — because those do not move
with the model.

**T6. A co-change matrix shows `customer` co-changing with 9 of 11 other modules at above
0.4. What does that indicate?** `ADVANCED`

A shared kernel, and a shared kernel in the middle of the service graph is the distributed
monolith forming. The high-degree hub is not a good candidate for extraction — everything
depends on it, which sounds like the strongest possible case and is in fact the densest
coupling. What you want is a cluster with high *internal* co-change and low *external*
co-change, and a module that changes with everything has neither. The diagnostic question
is what the coupling is made of: if it is a shared vocabulary — a `CustomerId` value type,
a shared enum — that is fine and should stay shared. If it is shared *behaviour* — the
repository, the service, the rules — then it is a service boundary pretending to be a
library, and the hub is the thing to break up first.

**T7. A module has high co-change with two others and near-zero with everything else.
What is it?** `TRICKY`

Almost certainly a module, not a service, and the reason is that a boundary you do not
need costs a deployable and buys nothing yet. The three modules that co-change probably
form one capability, and the fact that they do not co-change with the rest of the system is
a sign that the capability is genuinely separable — which is exactly the right thing to
know, and exactly the wrong thing to act on immediately if there are three teams. The next
step is not "extract these three" but "does a team exist or is forming that would own these
three", because the boundary is real and the extraction should wait for the org to justify
it. This is Chapter 5's argument in the shape of a co-change reading.

**S7. A PR adds an `import` from one module into another module's `internal` package. What
is the review comment?** `STAFF`

That the other module's internals are not its API. `internal` is the package that team
declared as not part of the contract, and reaching into it couples the two modules at the
*implementation* level, so a refactor on either side breaks the other and neither team sees
it coming. The fix is to depend on the published API, and if what is needed is not exposed,
the real question is whether it should be added to that team's API or whether this module
is using a capability it does not own. The second comment is on the missing test: if a
test did not fail, the boundary is not enforced and this PR is the evidence, because it is
precisely the failure the enforcement was supposed to prevent.

**S8. A reviewer sees a new table added to a service that already joins across its own
boundary. What is the comment?** `ADVANCED`

Ask what the table is for before asking whether it belongs. A new table in a service that
already has a cross-boundary join is sometimes the *right* move — it is often the first step
of fixing the join, because a denormalised copy is a table. If it is that, the comment is
about the consistency window: how is the copy kept fresh, what is the staleness bound, and
who is paged when it drifts. If it is a new source of truth while the join remains, the
comment is that the boundary is not real and this PR is making it worse — because now there
is a join in the request path *and* a denormalisation, so the next person will find a way
to read from whichever is convenient and the two will disagree. Pick one and delete the
other.

### Decomposition

**D16. Our order service handles placing, amending, cancelling, fulfilment and returns. Is
that a problem?** `STAFF`

Probably, and the way to see it is that it is not a service, it is five services' worth of
coupling in a trench coat. Each of those processes has a different change rate, a different
data requirement, and often a different owner — returns and invoicing need data that
placing orders does not. A service boundary is supposed to buy independent change, and a
service that changes for five unrelated reasons has the release coordination problem without
the independent-deployment benefit. I would split along the noun+verb line: the order as a
commercial object, and fulfilment and returns as processes with their own data and their
own cycle. The check before doing that is co-change — if all five change in the same
commits for the same reasons, the split is wrong.

**D17. A team justifies a boundary with "it has its own tables". Is that good enough?**
`TRICKY`

No, and it is a clean example of a signal masquerading as a reason. Owning a table is
necessary and not sufficient, because the real question is whether the service can own its
tables with no cross-service join in the request path. A service that owns one table, has
two foreign keys pointing at tables it does not own, and is joined on every read has its
own tables and is still a distributed join with extra steps. "It has its own tables" was
the beginning of an argument, not the whole of it — and the follow-up question is "what
replaces this join", and a team that cannot answer that has not scoped the project.

**D18. When would you keep two things in one service even though they could be split?**
`STAFF`

When there is an invariant that must hold at every instant between them, because splitting
converts a row-level guarantee into an eventually-consistent approximation and somebody
whose money is involved is going to have to be told about the window. When the co-change
is high for the same reason, because the coupling is real and hiding it behind a network hop
does not remove it — it just makes it invisible to the compiler. And when the team count
does not justify a deployable, because with three teams a split produces coordination rather
than autonomy. The staff-level version is that the question is never "can we split these"
but "what specifically gets better", and if the honest answer is "nothing concrete", the
right answer is a module boundary inside one deployable.

**D19. We have 22 services. How do you work out whether any should not exist?**
`SCENARIO`

For each one, run three tests. The merge test: could this be deleted and merged into a
neighbour tomorrow, and would anything actually get worse? If nothing gets worse, it is a
folder paying the full fixed cost. The ownership test: is there exactly one team that
builds, deploys, on-calls, owns the schema and sets the roadmap — and did that team exist
when the boundary was drawn? The coupling test: how many other services does it call
synchronously on a user-facing path, and what is the summed p99? Services that fail the
merge test and pass the ownership test were usually split for reporting lines rather than
for change independence, and they are the cheapest to fold back — though folding back is
itself a data project, so the diagnosis is the cheap part.

**D20. Is one service per bounded context the right default?** `TRICKY`

It is right about 60% of the time, and the interesting question is the other 40%. It is
right when the context is genuinely one capability, has one owner, and its tables hang
together. It is wrong when part of a context has a genuinely different scaling profile —
bursty and IO-heavy next to steady and CPU-light — because that is a deployment boundary
regardless of what the meaning says. And it is wrong when a context is a container for two
processes with different rates, in which case you have one service carrying two release
cadences and neither. The question is never "is one service per context right" but "what
happens to this boundary when the org splits next quarter".

**D21. What is a weak boundary signal, and what is a strong one?** `STAFF`

Weak signals are "it has its own tables" and "it's a noun" — both are necessary at best and
neither predicts anything, because every table has a name and nouns name things while
boundaries sit between processes. "It's a bounded context" is medium: real, but semantic,
and the mapping to a runtime boundary is where the thinking has to happen. Strong signals
are "it changes at a different rate" — because change independence is the mechanism by
which independent deployment actually pays — and strongest of all "a team owns it end to
end", because that directly predicts the benefit. The negative signals matter just as much:
"it is a clean layer", "we need better performance", and "it has a lot of code" all argue
for a decomposition that will not deliver independence.

**D22. A service is 400 lines, deployed with its parent, same team, no distinct scaling
profile. Keep it?** `STAFF`

No, and the diagnostic is not size, it is independence. That service pays the full fixed
cost of a deployable — a pipeline, a dashboard, an SLO, a set of alerts, a runbook, an
on-call slot, a base image to patch, and one more thing that can be down — and gets none
of the benefit, because it never deploys independently and never scales independently. The
test is: could this be merged back into its neighbour tomorrow, and would anything get
worse? If nothing gets worse, it is not a service, it is a folder. And the honest
recommendation is not just to merge it, but to look at the decision process that produced
it, because a service that small usually got created by a rule rather than a reason.

**T8. A team applies "split by noun" and gets an Order service that also does fulfilment
and invoicing. What does the co-change matrix look like six months later?** `ADVANCED`

High internal co-change and high external co-change, which is the worst of both. High
internal because the three processes are all in one module and the same people change them
together. High external because the shipping team's changes frequently touch the order
module — they cannot get to "my parcel went out" without it. That combination in a matrix
is the signature of a boundary that does not exist: the module is coupled to everything
internally and to the rest of the system externally, which means the extraction bought
latency and a release train and no independence. The diagnosis is that "order" was a noun
containing three processes, and the fix is the noun+verb split.

**S9. Someone proposes extracting the "order" service. What is the first question?** `STAFF`

What does order *do*, in a sentence a business person would recognise — not what it
contains, but what it does. If the answer is "it stores orders, prices, and fulfilment
state", the candidate is a component and it will be a table boundary, which is the weakest
signal in the catalogue. If the answer involves five verbs — place, amend, cancel, fulfil,
return — then "order" is a noun containing several processes, and the real question is
which of those belong together, because the noun+verb rule says a process with different
data and a different rate is its own boundary. The follow-up is the co-change matrix: high
co-change between those five areas *for the same reason* means they stay together, and
co-change that shows up in promotion PRs means the split is at the verb, not at the noun.

**S10. A PR adds a new table to the Order service for a fulfilment feature. What is the
review comment?** `STAFF`

Which of the three processes in this service is it for, and does the answer change the rate
at which the service ships. If it is fulfilment data, the service is now deeper into
holding a process it should not own, because fulfilment has its own data — carrier, carton,
tracking — its own rate, and often its own owner. The comment is not "don't add tables" but
"this is the moment where the noun+verb split becomes visible; if fulfilment now has
enough data and its own change rate, this is the extraction trigger, and it will be much
cheaper to extract now while the tables are still new than in a year when everything depends
on them". The other question is who will be on call for it, and the answer should not be
"the order team, because it is in the order service".

**S11. A reviewer sees a `@Transactional` method in Service A calling Service B, both
microservices. What is the comment?** `ADVANCED`

`@Transactional` stops at the JVM, so this is not a distributed transaction — it is a local
transaction that commits at A, followed by a network call to B that may or may not succeed.
The annotation is actively misleading here because it reads as if the operation were atomic,
and whoever wrote it believes the annotation is doing something it cannot do. The comment
should name the actual states: if B succeeds, both; if B fails, A has already committed and
the operation is half-done, and the question is what compensates it. If the answer is a Saga,
where is the state machine? If the answer is "we will retry", what happens after the fifth
retry, and who reconciles the ones that exhausted?

### The Modular Monolith

**D23. Our monolith is 400k lines with 30 modules. We enforced the boundaries last year.
Should we split now?** `STAFF`

Only if there is a specific module whose boundaries have earned it, and the way to know is
the five signals: a genuinely different scaling profile, a different release cadence, a team
that exists and will own it end to end, a real technology requirement, or a reliable history
of being what breaks. If you cannot name one with a specific answer, keep going as a
modular monolith and revisit in a quarter, because the boundaries are enforced and the
extraction has not got more expensive in the meantime. The one thing that *has* got more
expensive is the data migration, which is an argument for extracting something on a
schedule rather than for splitting broadly now. And note what is not on the list: "it is
conceptually separate", "it has a lot of code", "the team wants to own it", and "it is a
good candidate for reuse" — each of those is a reason people give and none of them is a
reason.

**D24. How do you enforce module boundaries in a Spring monolith without a big build
change?** `STAFF`

Two things, about three days together. First, make the module API explicit:
package-private for internals and a named interface or published-package convention for the
types other modules may use, so reaching into an internal package stops being a style
choice and becomes a compile error. Second, ArchUnit rules in the test suite —
cross-module reaches forbidden, a layering rule for the web/service/persistence direction,
and repositories never appearing in a published API. Add Spring Modulith's
`ApplicationModules.verify()` on top, because it verifies the module *interaction* graph and
catches a coupling that lives in an event listener rather than in an import, which ArchUnit
cannot see. Build-time module isolation is worth doing once you are past about six modules
or once someone has broken the rules twice, and not before.

**D25. What actually goes wrong in a modular monolith?** `SCENARIO`

The package cycle, in a completely predictable order. Somebody imports an enum across a
module boundary because it is tiny. Somebody reaches for the other module's repository
because a port would be over-engineering for one call. Somebody extracts a shared utility
that belongs to nobody. Eighteen months later there are 3,000 cross-module imports, a
boundary diagram with arrows in both directions between most pairs, and a codebase that is
a monolith with extra directories and a diagram that lies. The tell is that a maintainer
stopped updating the module diagram because it stopped reflecting reality — and the reason
it stopped reflecting reality is that nothing failed while it drifted, which is exactly the
problem a test was supposed to solve.

**D26. Is it a failure to still be a monolith after two years?** `STAFF`

Only if the monolith is boundaryless, and those are different diagnoses. Two years in a
modular monolith with enforced boundaries, one process, and seven modules that each have an
owner is a system that has avoided an enormous amount of distributed-systems cost while the
domain found its shape. The check is whether the boundaries are still real: if ArchUnit is
green and the module diagram is still accurate, the modularity is maintained and the
deferred split was a decision rather than a failure. If the rules have been commented out,
or the diagram stopped being updated because it stopped being true, then the monolith is
decaying — and the honest recommendation is to re-enforce the boundaries before considering
any split, because a split from a boundaryless monolith produces a distributed monolith,
which is the outcome the modular monolith exists to prevent.

**D27. A team wants to extract a module to a service. Walk me through the order of work.**
`STAFF`

Data first, code second, and the data work is most of it. Get the data-ownership answer in
writing. Create the target schema. Replicate through an outbox relay or CDC, never a
synchronous call inside the monolith's transaction. Backfill. Verify with row counts and
checksums. Route reads behind a flag, per endpoint, with a metric and a divergence alert.
Route writes with one authoritative path and a reversible switch, with the reconciliation
job running before the switch. Retire: stop the dual write, leave the old table read-only
for a month, drop it in a separate change. The code move is about a week. The whole thing
is two to four months, and the reason for this particular order is that the expensive
questions — who owns this table, and what replaces this join — are the cheapest to answer
before any code has been written.

**T9. Someone adds `import com.acme.order.internal.*` to the customer module. What
happens if the order team refactors?** `STAFF`

The customer module fails to compile, and it fails to compile on *their* release, not
yours. The customer team has a change that is correct in isolation, their build goes green,
they deploy, and then the order module fails to build against the new customer version. If
the customer team is not aware of the dependency, the incident is that the order team is
blocked with an error message naming a package they do not own. The diagnostic is `mvn
dependency:tree` or the equivalent, and the fix is to depend on `com.acme.order.api` and,
if what is needed is not exposed, either to ask for it to be exposed or to accept that this
module is using a capability it does not own. This is exactly the failure the ArchUnit rule
was supposed to catch, and the fact that it did not means the rule is missing.

**S12. A PR adds a `static` mutable field in a shared `util` package. What is the review
comment?** `ADVANCED`

That this module is now shared mutable state with no owner, which is the worst version of
the shared-utility antipattern. Static mutable state in a monolith is at least visible;
inside a modular monolith it is also a boundary violation, because the class is reachable
from every module and so the state is reachable from every module, and nobody can say which
one changed it. The concrete failure is an order test that fails only when the whole suite
runs, because some other test mutated the static, and a failure that depends on test order
is a failure that will eventually happen in production. If the utility is genuinely
shared, it belongs in a named module that owns it, exposed through that module's API, and
even then it should be immutable or a bean with an explicit lifecycle rather than a static.

**S13. A reviewer sees a new module with 200 lines and no tests. What is the review
comment?** `STAFF`

The size is not the issue, so do not comment on the size. The issue is that a new module
with no tests is a new module with no enforcement, and enforcement is the entire mechanism
that makes a monolith modular — without a test, the boundary is a convention, and
conventions decay at exactly the rate the team is under pressure. The comment should be:
where is the ArchUnit rule that stops other modules reaching into this one, and what happens
when somebody does? A new module without a rule is a folder. And the second comment is
about the module's API: has it declared its named interface, so that "what may other
modules touch" has an answer that is a compile error rather than a judgement call?

### Conway's Law & Team Topologies

**D28. A company split its monolith into 14 services and kept the same 4 teams. What
happened and why?** `SCENARIO`

They got the distributed monolith, and every part of the cost with none of the benefit. The
coordination cost is identical to before, because the four teams still queue behind each
other for the same people's capacity — but now there is a network hop on every collaboration
that used to be a refactor, transactions no longer cover the business operation, and an
incident means correlating six services' logs by trace id. The tell, and the first thing I
would check, is whether a product team can ship anything on a Friday that it could not have
shipped on Thursday. If the answer is "request a change from the platform team", there is
one team and fourteen services. The fix is not to merge the services; it is to split the
team, or to accept the monolith and put the effort into making it modular.

**D29. A manager says the platform team is a silo and should be dissolved. How do you
respond?** `SCENARIO`

I would look at what the platform team actually does, because the objection is aimed at the
wrong thing. If they take tickets and close them, the criticism is right — and it is not a
silo problem, it is a missing product, with the fix being a roadmap, named users, an
adoption metric, and probably a paved road designed rather than staffed. If they own a
paved road that teams genuinely choose to use, and they can point at the lead-time
improvement, then dissolving them removes the only thing that makes the other teams
faster. What I would not do is dissolve them and redistribute the work into four product
teams, because that multiplies the cost of CI/CD and observability by four and leaves every
team maintaining a deployment pipeline badly. The legitimate question is whether the
platform team knows who its users are and what they are failing to do, and that is a much
better argument than "silos are bad".

**D30. A team owns a "complicated subsystem" — an optimiser — and a manager wants to
redistribute them across four feature teams. How do you argue against it?** `STAFF`

With the learning curve and the current bench depth, not with the word "silo". The
component has a multi-year learning curve, and if you currently have three people who can
change it safely, dispersing them across four teams gives you four partial experts and zero
people who can review the dangerous changes — which is a slower and more expensive state
than three experts, not a faster one. The manager-facing argument is about risk and
delivery: an optimiser is the kind of code where a bad change is discovered by a customer,
and having nobody who understands it deeply is a continuous risk. The legitimate criticisms
of a complicated-subsystem team are specific and I would make them: the team is isolated
from product feedback, their roadmap is unaligned, and their interface to the rest of the
system may be poor. Any of those is worth fixing. "We do not like silos" is not an
argument, it is a preference about org charts.

**D31. A team of 30 in one "platform" group owns 12 services. Product teams file
tickets. What is the architecture problem?** `STAFF`

There is no architecture problem — there is one team with twelve services, and the org
chart claims a separation that does not exist. The product teams have not been decoupled
from anything; they have been moved one queue further away, and they have lost the ability
to make a change at all, because now even a small change requires a ticket to a team with
its own priorities and its own queue. Meanwhile the organisation has paid for twelve
pipelines, twelve dashboards, twelve sets of alerts, and a network hop on every call. The
diagnostic is what the product teams can do on a Friday that they could not do on Thursday;
if the answer is "request a change", the split produced nothing. The fix is to split the
group along capability lines so each product team owns a journey end to end, or to admit
this was a monolith and go back to one deployable with enforced module boundaries.

**D32. How do you decide how many teams an organisation can have?** `STAFF`

By the per-team cost of cross-cutting knowledge, which is the constraint and which has
nothing to do with total headcount. Every team needs security, data, SRE, and platform
expertise, and duplicating that across twelve teams is expensive even where the total
headcount is unchanged — you are buying twelve partial copies of expertise rather than four
whole ones. So: name three to seven business capabilities, then count how many teams the
organisation can staff with *competent* rather than merely present expertise. If the answer
is six and there are eight capabilities, two of them deliberately live inside a neighbour
rather than getting a team that cannot be properly staffed. The mistake being avoided here is
designing the org from the domain model and discovering the staffing problem after the
reorganisation.

**T10. Two teams, each owning half a service. What does the architecture converge to?**
`ADVANCED`

The service converges to the thing both teams need, which is the intersection, and the
parts only one team needs get neglected or get duplicated in the other half. More
concretely: the module diagram develops imports in both directions between the two teams'
areas, because each team reaches into the other's code for the thing it does not own, and
neither team can refactor its half without the other's release. A "temporary" shared
utility appears and is then extended by both teams. Within about four quarters you have a
service that is internally coupled across a team boundary, which means every change needs
two teams, which is the monolith's coordination problem with a network hop. The fix is to
split the service, not the change requests.

**S14. A PR review reveals the module diagram in the repo has not been updated in eight
months. What is the review comment?** `STAFF`

That the diagram is not documentation, it is a control, and an out-of-date control is worse
than no control because it converts an unknown into an apparent fact. An eight-month-stale
module diagram tells a new engineer a confident and false story about the boundaries, and
the first thing they will do is reach across one. The reason it stopped being updated is
worth asking about, because it is usually one of three: nobody has changed the module
structure in eight months, in which case the diagram is correct and nobody is maintaining it
for a reason; the structure changed and the rule that should have forced the update was
never written; or the ArchUnit test that was supposed to fail has been commented out. I
would want to know which, and the second and third both need fixing before any extraction
is attempted.

**S15. A new service has a runbook that only its original author can follow. What is the
review comment?** `STAFF`

That the runbook is a single point of failure and the service is not operationally
independent yet, whatever the org chart says. The question an on-call engineer asks at 3am
is "what is normal, what is not, and what do I do first", and a runbook that requires the
author's memory is a runbook that will fail during the author's holiday. The comment should
be about the three things a stranger needs: what the RED metrics are and their normal
ranges, the top three failure modes with their symptoms, and the rollback. And the test is
whether somebody who did not build the service can follow it — if not, the service's
independence is nominal, and the team split that was supposed to produce autonomy is
producing a new kind of dependency on one person.

### Migrating to Services

**D35. How would you migrate a shared database into a service?** `STAFF`

Data first, code second, and the data work is most of the project. Create the target schema
and get the data-ownership answer in writing from someone who can commit to it. Replicate
through an outbox relay or CDC — never a synchronous call inside the monolith's transaction,
which is the classic dual-write bug. Backfill, then verify with row counts and checksums.
Route reads behind a flag per endpoint with a metric and a divergence alert. Route writes
with exactly one path authoritative and a reversible switch, with the reconciliation job
running before the switch. Stop the dual write, leave the old table read-only for a month,
drop it as a separate change so the rollback window is real. The code move is about a week;
the whole thing is two to four months. The reason for the order is that the expensive
questions — who owns this table, what replaces this join — are cheapest to answer before any
code has been written.

**D36. When would you use Branch by Abstraction instead of strangling?** `TRICKY`

When the code is entangled rather than separable. Strangling needs a routing point at the
edge — an endpoint, a page, a job — that you can point at the new implementation. If the
behaviour you are extracting is reached from a hundred call sites through shared local state,
there is no such point, and the strangler's canary quietly becomes a big-bang rewrite with
extra steps. Branch by abstraction puts the switch inside your own code, in the class that
implements the interface, so it works for a behaviour with no clean entry point. The cost is
the residue: the routing branch lives in production code, and if it survives the migration
it is a branch somebody has to reason about in a code path that handles a number which ends
up on an invoice. So it needs a named owner and a deletion ticket from the day you add it.

**D37. What is the highest-risk part of a strangler migration, and why?** `STAFF`

The period where both implementations are live, and the boundary between them. The cut-over
itself is a configuration change and is trivially reversible. But while both paths run, the
same request can take different code depending on a tenant id or a percentage, so bugs are
intermittent and data-dependent and reproduce for 2% of customers forever. Both paths
writing means divergence, and the only thing detecting it is a reconciliation job. And the
routing weight is a piece of hand-edited configuration someone changed during an incident
and never wrote down. The mitigation is mechanism, not caution: one authoritative write
path with a reversible switch, a reconciliation job with an alert, and a routing decision
that is version-controlled rather than a number in a dashboard.

**D38. Our migration is 40% done and running both paths. How do you know the two are
actually the same?** `STAFF`

Four things, in increasing order of how much they should worry you. Row counts and
checksums, to catch a data problem before anyone reads it. A sampled field-by-field
comparison on recent records, to catch a mapping problem that counts match. A shadow run
that computes both and emits a divergence metric, which is the only thing that catches a
*logic* difference — same inputs, different outputs, which no amount of comparing stored
data will find. And an alert on that metric, because a reconciliation job nobody is paged
for is a log line. If we do not have the fourth, I would want it before increasing the
percentage, and the percentage is the risk dial: the two-path period is safest at 1% and
most dangerous at 40%, which is where you are now.

**D39. A team's strangler migration has been at 90% for eight months. What is wrong?**
`SCENARIO`

The old path is still running and nobody will switch it off, and the most likely reason is
that the two implementations do not quite agree. If the legacy path can still handle
traffic, someone has a reason for it, and that reason is usually a difference nobody has
characterised — an edge case in the new implementation, a customer on a bespoke contract, a
reconciliation divergence that was explained away once. The cost is not just double running;
it is that every future change must be made twice, in two codebases that have started to
diverge, so the migration has become a permanent tax rather than a project. I would want
to know the specific divergence, treat finding it as a bug with an owner, and give the old
path a dated deletion ticket with a named person.

**D40. How do you know a migration was worth having done?** `STAFF`

Three numbers and one question. The estimate-versus-actual delta on the data migration,
because that is the number every future extraction gets calibrated against and a team that
skips it calibrates against nothing. The measured p99 on the affected path against the
written budget, because the whole latency argument in Chapter 1 is only real if somebody
checked it. The operational delta: how many deployables, dashboards, alerts and runbooks
the organisation now owns and how many people are on call for them. And then the question
that decides whether the boundary was real: can the owning team now ship without
coordinating with anyone? If yes, the migration did its job. If no, you have the distributed
monolith and a better-separated codebase, which is better than nothing and much worse than a
modular monolith would have been.

**D41. Our first extraction is three months in and the data migration is not finished. What
do we do now?** `SCENARIO`

Finish the data migration before touching anything else, and treat the current state as the
lesson rather than as a problem to route around. The most common outcome of a team in this
position is to ship the service with a synchronous read of the monolith's tables labelled
"temporary", and that label is accurate and indefinite — it becomes a dependency the new
service's architecture is built around, and the second attempt at the data migration is
harder than the first because the service now depends on the old schema. The recovery is to
keep the service off real traffic, get the owning table actually owned, and replicate
properly. If that pushes the launch by a month, the comparison is against a service that
will still be blocked in six months, not against a plan that was achievable on the original
date.

**T11. A team adds a synchronous call to the monolith's database inside the monolith's
existing transaction, to keep the new service in sync. What goes wrong?** `ADVANCED`

That is the classic dual-write bug, and it fails in a specific and unfixable way. The
transaction commits at the monolith, and then the network call to the new service either
succeeds or does not — and the commit already happened. So you have a write at A with no
write at B, and the two are now permanently inconsistent, and the failure mode is not that
it is slow, it is that the network call's outcome is unknowable from the transaction's
perspective. Retrying inside the transaction makes it worse, because a retry that succeeds
after a partial failure can double-write. The correct mechanism is an outbox: the write and
an outbox row commit together locally, and a relay delivers the event idempotently, at
least once, with the consumer responsible for dedup. That converts an unknowable outcome
into a retriable one.

**S16. A PR adds `feature.flag = "new-service" = 50` to a properties file, by hand, in
production.** `STAFF`

This is the routing decision that will outlive the migration, and it is the one nobody
writes down. Three comments. First, a hand-edited percentage in a properties file is not
version-controlled in any meaningful sense — the change is in a running container and
nobody can say who set it or when. Second, 50% of traffic on a new path whose divergence
metric has presumably never been checked means the team does not know the two
implementations agree, and the two-path period is most dangerous exactly here. Third, a
flag with no owner and no expiry date becomes permanent, which means a path that was meant
to be a canary is now half of production and every future change must consider both. The
comment should require a named owner, an expiry date, and a deletion ticket, and the
measurement that justifies the percentage.

### The Boundary Tests, Applied

**P1. A new engineer asks you which module owns pricing. What does your answer reveal?**
`SCENARIO`

It reveals whether the boundaries are real, and it is a better diagnostic than any diagram.
If the answer is immediate and specific — one module, one team, one set of tables — the
modularity is real. If the answer requires knowing a person's memory or a chat history,
the boundaries are conventional rather than enforced, and the fact that it is not
answerable is the finding. If the answer is "pricing touches everything so it is sort of
everywhere", the shared kernel has formed and it is the middle of the service graph,
which is where the distributed monolith starts. The useful follow-up is to write the answer
down and then check whether the code agrees with it — in most systems the code does not,
and that gap is the boundary debt.

**P2. A stakeholder asks why the team cannot add a field to the orders table. What is the
real conversation?** `SCENARIO`

The real conversation is about who owns the data and what else depends on it, not about
whether the change is easy. In a monolith the answer is "whoever needs it", and that is a
genuine advantage. In a system with boundaries the answer is "does the owning context
consider it part of their model, and can they add it without breaking the published
contract" — and the right answer to the stakeholder is often to change the interface rather
than the table, because the table is an implementation detail of the owner. The useful thing
the stakeholder learns is that a field on a table is not the same as a field on a
capability, and that "can you expose it through your API" is often a cheaper ask than "can
you add a column". The staff-level framing is that this friction is the boundary doing its
job, and the question is whether it is a useful boundary or an accident.

**P3. Two teams have been blocked on each other's releases for three months. What is your
first move?** `SCENARIO`

Measure it, because that number is the argument for everything else and it is the one an
executive believes. Count the deploys in the last quarter that required another team's
permission, and count the changes that sat in a queue waiting for one. Then name the
ownership explicitly — for the schema, for each service's retry and timeout policy, for the
latency budget — because "it is the platform team's" is true and is exactly the problem when
the answer is the team that owns the client library. Then pick one boundary and extract it
properly, with the data migration first. What I would deliberately not do first is start a
broad rewrite or split several services at once, because without an owner and a measurement
the new services inherit every existing coupling and you end up with a larger distributed
monolith.

**S17. A PR adds a cross-service synchronous call from the checkout path to a service that
is not on the critical path today. What is the review comment?** `STAFF`

Which path, how many hops it adds, and what is the p99 budget. Checkout already has four or
five serial hops, so its p99 is already over 500ms, and a sixth serial call takes it toward
700ms before anyone has measured anything. The comment should ask whether this call can be
made in parallel with the others, or moved off the request path entirely into an event
handler — which it usually can, because "not on the critical path" means it does not need
to be answered before the response goes back. And it should ask what happens when the called
service is down: with a circuit breaker, a fallback, and a fallback-rate alert, or with
nothing at all. A sixth hop that has no failure behaviour is how a partial outage of a
non-critical service becomes a total outage of checkout.

### What I Would Actually Do

**D42. You have 5 teams, a 300k-line monolith, a coherent data model, and a domain that
is still changing. What is your recommendation?** `STAFF`

A modular monolith with enforced module boundaries, and I would spend the next two quarters
proving that it works rather than splitting anything. The reasons in order. Five teams is
marginal — below the threshold where independent deployment reliably pays, and close enough
that a split produces coordination rather than autonomy. A coherent data model with
cross-entity invariants means splitting converts real row-level guarantees into eventually
consistent approximations, and that is a permanent cost, not a temporary one. A changing
domain means a boundary drawn today is wrong by Q3, and a module boundary is days to move
while a service boundary is months because of the data. And 300k lines that deploys fine is
a build-pipeline question. What I would do concretely: carve the candidate boundaries out as
modules this month, put ArchUnit rules in the test suite this month, and name the owning
team for each. Then in a quarter, look at the graduation signals — has a module with a
different scaling profile appeared, has a team formed that will own one end to end — and
extract exactly that one. If I had to name the risk in this plan, it is that the org does
not change and we end up with a well-organised monolith, which is a perfectly good outcome
and a much better one than a distributed monolith.

**D43. Your VP has read that "microservices are the industry standard" and wants 30
services by next quarter. What do you say?** `STAFF`

I would say the number is the wrong unit of measure and that agreeing to it would make
things worse, and then I would offer the diagnostic that would let us choose a number
honestly. The specific risks of a 30-service target are concrete: 30 pipelines, 30
dashboards, 30 alert sets and 30 runbooks to build and maintain before anything is
delivered, 30 things that can be down, a rotation spread across 30 services that nobody
holds in their head, and a codebase where a change to a "cohesive" area now needs 6 teams
because the boundaries are drawn along component lines. The diagnostic I would propose: count
the deploys that currently require coordination between teams, and the schema changes that
need more than one owner. That number is the real constraint, and it is usually one or two
orders of magnitude below 30. Then propose the module-with-enforced-boundaries step, which
delivers most of the organisational benefit at none of the distributed-system cost, and
make the first extraction the one the measurement names. If the VP still wants 30, I would
want it in writing what "done" means for each, and I would note that the fleet will be
unowned by roughly week eight.

**D44. You are inheriting a fleet of 25 services that all share one database and deploy in
lockstep. What are your first three moves?** `STAFF`

First, measure, because you cannot fix what you have not sized: count the deploys that
require coordination with another team, and count the schema changes that need more than
one team. That number is the argument for everything else. Second, name owners — for the
schema, for each service's retry and timeout policy, for the latency budgets — because
"nobody owns it" is the default that produces every antipattern in this volume, and
ownership is a decision rather than a project. Third, pick one boundary and extract it
*properly*, with the data migration done first and a reconciliation job with an alert
running before the first write goes to both paths. What I would deliberately not do first
is start a broad rewrite or split several services at once, because without an owner and a
measurement the new services inherit every existing coupling and you end up with a larger
distributed monolith than the one you started with.

**D45. What is the single most important thing to get right when introducing service
boundaries to an organisation that has none?** `STAFF`

Write down who owns what, before any code moves, and make the answer binding. Everything
else in this volume is a technique; ownership is the substrate they run on, and the
failure mode of a system with no clear ownership is not that its boundaries are in the
wrong place — it is that nothing detects when they drift. An unowned service has no one to
notice that its schema is now blocking three other teams, an unowned latency budget has no
one to notice that a fifth hop was added to the checkout path, an unowned retry policy
becomes four teams' independent, locally reasonable decisions, and a shared database has no
one to decide who may add a column. Ownership is cheap to establish, it is a decision
rather than a project, and every antipattern in this volume traces back to its absence.

