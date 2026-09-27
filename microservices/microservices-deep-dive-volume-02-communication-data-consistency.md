---
title: "The Microservices Complete Deep-Dive"
volume: 2
series: "COMMUNICATION, DATA & CONSISTENCY"
subtitle: "Study & Interview Mastery Guide"
---

# The Microservices Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is a multi-volume study guide to microservice architecture, written for engineers who
are already shipping backend systems and are preparing for senior and staff-level
interviews. It is not a tutorial. Nothing here explains what a REST endpoint is.

Volume 1 established the *shape* of the problem — where service boundaries come from, DDD,
decomposition, the modular monolith as a legitimate destination, and Conway's law as the
constraint that decides all of it. Volume 2 goes after the thing that actually breaks when
you take those boundaries: **the moment two services have to talk, the guarantees a
single-process system gave you for free stop existing.** A method call in a monolith is
atomic, ordered, and exactly-once. A call across a network is none of those three, and
nothing in your language or your framework tells you which guarantee you actually got.

The organising question of this volume is therefore not "how do services communicate" but
**"what guarantee does this particular interaction give me, what does that guarantee cost,
and what do I have to build to survive the cases it does not cover?"** That reframing is
the whole book. Idempotency keys, transactional outboxes, sagas, partition keys, schema
registries and cache-aside are all answers to the same question, asked at different layers.
A candidate who can name the guarantee at each layer — at-least-once here, effectively-once
there, eventual consistency by default, read-your-writes where the user can see the answer —
sounds like someone who has been paged for one of them.

The recurring frame is a single sentence: **in a distributed system, every message is
delivered at-least-once, every retry is a possible duplicate, and every state you copy is a
consistency problem you now own.** The topics that get the most interview airtime —
exactly-once semantics, CAP, saga choreography versus orchestration — are the ones most
likely to be answered at the wrong altitude. So each is treated here as a decision with a
cost and a failure mode rather than a definition with a name, and the arithmetic is done out
loud: what a duplicate charge costs, what six serial hops do to your p99, what a duplicate
charge costs when your consumer is not idempotent and nobody notices for six weeks.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → The Guarantee It Actually Gives → Code Example → What It Costs →
When to Use → When NOT to Use → Failure Modes → Interview Traps → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto HTTP status codes
produces filler. The template is a completeness checklist, not a template to fill.

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

Volume 2 cross-references `../spring/spring-deep-dive-volume-11-spring-cloud-distributed-systems.md`
in several places — that volume's Chapter 6 covers the same distributed data patterns at
Spring-framework altitude, and where it does, this volume goes deeper on the mechanism and
stays quiet on the annotation.

### Continuing From Volume 1

| Volume | Coverage |
| --- | --- |
| Volume 1 | Foundations — service boundaries, DDD, decomposition, the modular monolith, Conway's law, migration |
| Volume 2 (this book) | Communication, Data & Consistency — CAP, idempotency, REST/gRPC, event-driven architecture, messaging, sagas, outbox, data ownership |
| Volume 3 | Operations, Platforms & Evolution — observability, resilience, deployment, Kubernetes, service mesh, scaling, antipatterns |

### Table of Contents — Volume 2

- Chapter 1 — CAP, PACELC and the Consistency Spectrum
- Chapter 2 — Idempotency & the Exactly-Once Illusion
- Chapter 3 — Sync Communication — REST, gRPC and Contract Design
- Chapter 4 — Async Communication & Event-Driven Architecture
- Chapter 5 — Messaging in Spring — Cloud Stream, Kafka & RabbitMQ
- Chapter 6 — Sagas & Distributed Transactions
- Chapter 7 — The Outbox, the Inbox & CDC
- Chapter 8 — Data Ownership, Cross-Service Queries & Caching
- Chapter 9 — Interview Scenario Bank

---

# Part 2 — Communication, Data & Consistency

## Chapter 1 — CAP, PACELC and the Consistency Spectrum

### 1.1 The Answer Everybody Gives, and Why It Is Wrong

The CAP theorem is the single most repeated fact in technical interviews, and the most
repeated *misstatement* of it is also the most expensive, because it produces genuinely bad
architecture decisions. Here is the answer you will hear:

> "CAP stands for Consistency, Availability and Partition tolerance, and you can only
> pick two of the three."

That is wrong in two independent ways, and a staff-level candidate should be able to name
both without hesitating.

**First: the theorem is conditional.** The actual claim of CAP is that when a network
partition occurs — and in a distributed system, a partition *will* occur, it is not a
design choice, it is a given — you cannot simultaneously guarantee both linearizable
consistency (every read sees the most recent write) and total availability (every request to
a non-failing node returns a non-error response). The choice is only ever forced *during* a
partition. Outside a partition, when the network is whole, you can have both. Any design
decision made at "we chose AP in our architecture diagram" is describing what happens in an
incident, not what happens on a Tuesday.

**Second: the theorem is not a menu of three things where you pick two.** Partition
tolerance is not a feature you adopt or a column in a table. It is a property of the
network your system runs in, and it is true whether you chose it or not. You cannot "pick
CP and not P" by deciding not to handle partitions; you have simply decided that when the
network partitions, your system stops answering, and you have moved the outage rather than
avoided it.

```text
  WHAT PEOPLE SAY                        WHAT THE THEOREM SAYS
  ────────────────                       ───────────────────
  "Pick 2 of 3."                         "During a partition, you cannot have
                                           BOTH linearizable consistency AND
   C  ─┐                                 total availability. P is not a choice."
   A  ─┼─ any two                      
   P  ─┘                                "Outside a partition you can have both,
                                           because the impossibility proof needs
                                           the partition to hold."

  CONSEQUENCE OF THE WRONG VERSION:       CONSEQUENCE OF THE RIGHT VERSION:
  a design-doc checkbox that says        a per-operation decision about what
  "AP" and then never revisited          happens when the network is broken —
  until the day it is
```

> **INTERVIEW TRAP**
>
> "You pick two of three" is the answer that gets half marks at best, because it treats
> partition tolerance as a feature you can decline. The senior answer names the condition:
> **CAP is a statement about what happens *during* a network partition, and P is not a
> choice — it is a given that will happen.** Outside a partition you can have both
> consistency and availability; the impossibility proof only bites while messages are
> being dropped between nodes. The real design work is deciding, per operation, which
> failure you would rather have.
>
> Follow it immediately with: "and notice that CAP says nothing about the 99.9% of the time
> the network is fine — which is why PACELC is the more useful theorem, and nobody mentions
> it."

### 1.2 PACELC — the Branch Everybody Skips

**PACELC** extends CAP with the *else* branch, and that branch is the one that governs your
everyday engineering:

```
  if  there is a Partition   →  choose Availability  or  Consistency
  ELSE                       →  choose Latency       or  Consistency
```

The word doing all the work is **ELSE**. CAP describes a rare, dramatic moment. PACELC
describes every single request in the steady state, and it is in the steady state that you
chose your database's replication mode, your cache TTL, your read strategy, and your
service-level objectives.

Concretely, PACELC is the reason these are the *same* decision:

| Context | No partition | Under partition |
| --- | --- | --- |
| Inventory stock check | Serve from a cache in 1ms, possibly stale | Serve stale, or refuse and let the cart fail |
| Product detail page | Read from a replica in 5ms, up to 2s stale | Serve stale, or fail the whole page |
| Account balance | Read the primary at 20ms, always correct | Read the primary, risk unavailability, or serve a possibly-stale balance |
| Authorisation check | Call the auth service at 15ms | Decide whether to cache a permission decision or fail closed |

Each of those is a PACELC decision, made once, in the *else* branch, and it is the branch
that runs 99.99% of the time. A system that has never thought about the else branch will
have a partition-tolerant design and a *daily* consistency problem, and the daily one will
cost more user trust than the partition ever would.

> **MUST REMEMBER**
>
> **Consistency is a per-operation decision, not a per-system one.** The useful interview
> sentence is: "we are not AP or CP, we are *strongly consistent on the payment
> authorisation and eventually consistent on the product catalogue*, and the reason is that
> a customer who sees a stale price at checkout is a refund, while a customer who sees a
> stale product photo is nothing."

### 1.3 Availability, Defined Precisely

The word "availability" is used loosely and the loose version produces bad reasoning. The
formal definition, from the CAP literature, is:

> **Every request received by a non-failing node returns a response — not necessarily the
> most recent, but a response that is not an error.**

The second half is everything. A node that returns `503 Service Unavailable` because it
decided consistency was more important is *not* available, in the CAP sense, even though it
is running. A node that returns a value it knows might be 30 seconds stale *is* available.
The trade is not "correct versus up" — it is "error versus wrong", and a surprising number
of product teams will accept wrong far more readily than error, then wonder why the incident
review said their design was AP.

> **TRADE-OFF**
>
> Choosing availability under partition means the minority side keeps serving with
> incomplete data. The flip condition is usually a write: serving stale *reads* under
> partition is a small, explicable harm; serving *writes* from both sides is a split-brain
> that produces two diverging truths and a reconciliation problem you did not budget for.
> This is why most AP systems are actually **read-available, write-unavailable under
> partition** — the reads are safe to serve stale, the writes are not safe to serve twice.

### 1.4 Why "We Chose AP" Is Often a Statement About the Database

This is the observation that separates someone who has designed a system from someone who
has configured one.

A great many teams say "we chose AP" when what they mean is "our database is a
single-writer primary with asynchronous replicas". That is not a choice they made about
their *architecture*; it is the default behaviour of the replication mode their database
ships with, and a single-writer primary is **CP**, not AP — the secondary refuses to accept
a write while partitioned, and a write to the primary that has not yet replicated is a
lost write, not a stale read. A genuinely AP data store — Dynamo-style, Cassandra with
`QUORUM` writes and `ONE` reads, Riak — is a specific, deliberate, and considerably more
expensive thing to run.

The diagnostic question to ask a team that claims AP is: **"Which write did your system
accept during the partition, and where did it go?"** If the honest answer is "we didn't
think about it", the system is not AP — it is a system that has never been partitioned,
which is a statement about the network rather than about the design.

```text
  "WE CHOSE AP"                          WHAT ACTUALLY HAPPENED
  ───────────────                         ─────────────────────
  Team configures a single-writer        Team configured the default.
  primary + read replicas, describes     A partition makes the primary
  it as "highly available".              unavailable, and reads from
                                          the stale replica.
     ...but the PRIMARY is the only
     writer. Partition it, and writes    The team's actual guarantee: reads
     FAIL. This is a CP system           are available from a lagging
     wearing an AP label.                 replica; writes fail. The label
                                          was wrong and nobody noticed
                                          because the label was never used
                                          to make a decision.
```

### 1.5 The Consistency Spectrum

Consistency is not binary. It is a spectrum, and each rung costs you something specific —
latency on the read path, and code in your application that must handle staleness. The
useful thing to carry out of this table is not the definitions but the **cost column**: how
much of your code has to know that the model exists.

| Model | What it forbids | Latency cost | Code cost |
| --- | --- | --- | --- |
| **Linearizable** | Nothing — all operations appear to take effect in a single total order consistent with real time | Highest. A quorum read/write per operation (typically +1 RTT) | None. Read and write code are ordinary |
| **Sequential** | Reordering operations *by the same client*; concurrent operations from different clients may interleave freely | One replica's propagation delay | Low. A client just needs a sticky session or a session-local sequence |
| **Causal** | Observing a cause after its effect — if A caused B, no replica may show B without showing A | Propagation delay, plus possibly a vector-clock comparison per read | Moderate. Your cache invalidation can be causal, not global |
| **Read-your-writes** | Showing a client state older than a write it has already been told succeeded | Often just "route this client's next read to the primary" | Low, but a *contract* you owe your users, so it needs a test |
| **Monotonic reads** | Showing a client a value older than one it already saw | Reads pinned to a lagging-but-catch-up replica | Low |
| **Eventual** | Nothing in steady state; guarantees only convergence | Zero — this is the point | **High.** Every screen, every computed field, every "why is this number wrong" ticket is now a possible bug |

Two things about this table are worth saying out loud in an interview.

First, **linearizable is not "the default" — it is the only model that lets you write
ordinary code.** Everything below it exists so you can avoid a quorum round trip, and every
rung below it exists so you can avoid a round trip *at all*. The trade is: you are buying
milliseconds with a correctness burden that lands in your application code, and that
burden is paid again for every screen, every export, every reconciliation job.

Second, **eventual consistency is not free, and the cost is not paid by the database.** It
is paid by whoever builds the user interface on top. The database returning a value from
2009 is one bug; the order confirmation screen that shows the *old* address because the
address projection has not caught up is a support ticket, a refund, and a designer
reworking the screen so the stale value is *less obviously* wrong. The engineering cost of
eventual consistency is paid downstream, by people who were not in the conversation.

> **PRODUCTION RELEVANCE**
>
> The classic eventual-consistency incident is not a server error. It is: the user edits
> their profile, the profile page shows the new value, and the *order confirmation* page —
> which reads a denormalised copy of the customer record — still shows the old name, and
> the invoice goes out with it. The database is working exactly as configured. The
> consistency model was chosen correctly for the write path and never propagated to the
> read model that prints things.

### 1.6 The Number to Carry: Eventual → Read-Your-Writes

If you carry one number out of this chapter, it is this: **moving from eventual consistency
to read-your-writes costs you a route to the primary, or a version check.** Those are the
only two mechanisms, and everything else — session tokens, "sticky" reads, a
`?version=` query parameter, an ETag — is an implementation of one of the two.

```text
  OPTION A — route to the primary.
    The write returns a routing hint (which replica/primary handled it, or simply
    "the primary"); the client's next read for that aggregate goes there.
      • Simple. Exactly correct.
      • Costs primary capacity — including for users who read and never wrote.
      • Breaks in multi-region: "the primary" is a different primary in another region.

  OPTION B — version / token check.
    The write returns a monotonic token (a row version, an event sequence number, an
    opaque ETag). The read carries it; if the replica's version is behind, the read is
    escalated to the primary.
      • Costs nothing in the steady state — 99% of reads are satisfied by replicas.
      • Costs a token in the API contract, which is a real design cost: it is a
        commitment to your clients that will be hard to remove later.
      • Falls out of the storage engine for free on systems with vector clocks.
```

The staff-level observation is that **this is a per-read-path decision, and there is no
global setting for it.** "Our system is eventually consistent" is not a fact about a
system; it is a fact about a *query*, and somewhere on every critical path there is a query
where eventual is not good enough. The review question is not "what is our consistency
model" but "**which reads, if stale, would a user call a bug?**" — and the answer is
usually a small, identifiable set: your balance, your order status, your permission check,
your write confirmation.

> **STAFF-LEVEL CONSIDERATION**
>
> The consistency conversation is a *product* conversation wearing an engineering costume.
> The engineering can implement any of these models; what it cannot do is decide that
> showing a user a stale delivery address is acceptable. Getting that decision made
> explicitly — "here is the list of reads where staleness is a bug, and here is the list
> where it is cosmetic" — is worth more than picking the right database, and it is the
> thing that is missing when the incident happens three months later. A one-page document
> listing the read-your-writes reads is the cheapest and most durable artefact in this
> whole chapter.

#### Common Mistakes

- Answering "pick two of three" and moving on. It is the expected wrong answer, and
  correcting it is most of the marks.
- Describing a system as "AP" or "CP" as a single label. Systems are not; operations are.
- Treating eventual consistency as a database setting. The cost lands in the application.
- Setting a read-your-writes policy globally when only two or three reads actually need it.
- Believing read replicas are read-your-writes. They are not, and the 404 on your own order
  is the receipt.
- Forgetting that CAP says nothing about the steady state, which is 99.99% of requests.
- Assuming a single-writer primary is AP. It is the opposite.

#### Interview Questions — CAP, PACELC and the Consistency Spectrum

**Q1. Explain CAP. What is wrong with "pick two of three"?** `STAFF`

Two things. The theorem is conditional — it says that *when a network partition occurs*,
you cannot simultaneously guarantee linearizable consistency and total availability.
Partition tolerance is not a third option you decline; in a distributed system a partition
is a given, so the choice is only ever forced during one, and outside a partition you can
have both. And the framing as a menu of three where you pick two misleads teams into
writing "AP" on an architecture diagram as a permanent property, when it is a description
of behaviour under failure. The design work is deciding, per operation, which failure you
would rather have — and note that CAP describes only the rare branch, which is why PACELC
is the more useful theorem.

**Q2. What is PACELC, and what does it add that CAP does not?** `ADVANCED`

PACELC adds an else branch: if there is a Partition you choose Availability or
Consistency, and **else** — in the steady state, which is almost every request — you choose
between Low latency and Consistency. That else branch is where the daily trade-off lives:
replica reads versus primary reads, cache TTL versus a fresh read, serving a slightly stale
price versus paying an extra round trip. CAP describes an incident; PACELC describes your
production. A system designed only against CAP has a partition story and a replication
mode, and no idea what it does at 14:00 on an ordinary Tuesday.

**Q3. A team says "we are AP". What questions do you ask?** `STAFF`

Three. Which write did your system accept during the partition, and where did it go —
because if the answer involves a single-writer primary, the system is CP, not AP, and the
label is wrong. What is the replication mode of the store you are actually running — a
primary with asynchronous replicas is CP with lag, and a quorum-based store is genuinely
AP. And have you ever partitioned it, or is "we are AP" a statement about the network
rather than about a decision? The failure mode to watch for is a team using the AP label
to justify a read replica while believing their writes are available too.

**Q4. Define availability in the CAP sense precisely.** `TRICKY`

Every request received by a non-failing node returns a response — not necessarily the most
recent, but not an error. The second clause is the whole point. A node returning a
possibly-stale value is available; a node that is perfectly healthy but returning `503`
because it decided consistency mattered more is not. So the trade is not "correct versus
up" — it is "error versus wrong", and product teams routinely accept wrong more readily
than error while describing their system as strongly consistent.

**Q5. Your e-commerce site shows the wrong delivery address at checkout. Which consistency
model is the fix, and what does it cost?** `TRICKY`

Read-your-writes on that specific read, at minimum — and the honest answer is that the
address is a projection and the fix is that the checkout reads the address service's
authoritative store rather than a denormalised copy, which is a different fix with a bigger
latency cost. Implementing read-your-writes costs one of two things: route that user's read
to the primary, which spends primary capacity, or return a version token from the write
and have the read carry it and escalate to the primary if the replica is behind, which
spends API surface and a promise you cannot take back later. The interesting part is that
this should never have been a global setting — only a handful of reads are bugs when stale,
and the address is one of them.

**Q6. Walk me down the consistency spectrum. What does each one buy and cost?** `STAFF`

Linearizable: total order consistent with real time; costs a quorum round trip per
operation; and crucially it is the only rung that lets you write ordinary code, because
your application does not have to know the model exists. Sequential: stops reordering one
client's operations; costs a sticky session or a session-local sequence. Causal: stops
showing an effect without its cause; costs propagation delay plus a clock or version
comparison per read, and it lets your invalidation be causal rather than global.
Read-your-writes: costs a primary route or a version token, but is the model users
actually perceive as "working". Monotonic reads: never show a client something older than
it has already seen; cheap. Eventual: costs nothing in latency and costs everything in
code — every screen, computed field and reconciliation job has to tolerate a value that is
behind, and that cost is paid by the UI engineers who were not in the conversation.

**Q7. A team sets a five-second replication-lag threshold for routing reads to replicas.
When does this break?** `TRICKY`

It holds in the steady state and fails in the incident, which is exactly when
read-after-write failures cluster. Lag is not constant: a replica at 800ms under normal
load can be at 30 seconds during a failover, behind a long analytical query that pins the
replication thread, or during a storage event on the replica. So a threshold tuned against
the normal case is tuned against the wrong distribution. The mitigations are a sticky
window to the primary after a write, a real lag signal (a heartbeat table on the primary
rather than a guessed threshold), and a permanent primary route for the small number of
aggregates that are genuinely read-after-write-heavy.

**Q8. Is "eventual consistency is fine because users do not notice" a defensible
position?** `STAFF`

It is defensible for genuinely cosmetic reads and indefensible as a general policy, for
three reasons. It is usually wrong about *which* reads are cosmetic — the ones that are not
cosmetic are the money path: the balance, the order status, the permission check, the
quantity just reserved. Second, "users do not notice" is a claim about the happy path; the
complaint you get is a specific one — the invoice printed with the old address — and it
reaches support rather than engineering. Third, the cost of eventual consistency is not
invisible to users, it is invisible to the *architecture diagram*, and it is paid in UI
work that is never scoped. The defensible version of the position names the reads it
applies to and the reads it does not.

> **CHAPTER 1 SUMMARY**
>
> CAP is conditional — it describes what is possible *during* a network partition — and
> partition tolerance is not a choice, it is a given, so "pick two of three" is wrong twice
> over. PACELC is the more useful theorem because its else branch covers the steady state,
> which is 99.99% of requests and where the everyday latency-versus-consistency trade
> actually lives. Availability in the CAP sense means a response rather than an error, not
> necessarily a fresh one, so the trade is "wrong versus error" rather than "correct versus
> up". And "we chose AP" is usually a statement about a database's default replication mode
> rather than a design decision, which is worth checking with the question "which write did
> your system accept during the partition, and where did it go?" The consistency spectrum
> runs from linearizable to eventual, and the cost column matters more than the definition
> column: only linearizable lets you write ordinary code, and every rung below it moves the
> bill from the database to the application. The number to carry is that read-your-writes
> costs a route to the primary or a version check and nothing else. The framing that
> survives the whole volume is that **consistency is a per-operation decision, not a
> per-system one** — a system is not eventually consistent; a *query* is, and a short list
> of queries is where the policy belongs.

#### Further Reading

- [CAP theorem](https://en.wikipedia.org/wiki/CAP_theorem) — the best single treatment of what the theorem does and does not claim, including the original Gilbert–Lynch formulation and the PACELC extension.
- [Database per Service](https://microservices.io/patterns/data/database-per-service.html) — the replication trade-off stated as a pattern, which is where the PACELC else-branch decisions actually live.
- [Microservices](https://martinfowler.com/articles/microservices.html) — the section on how services choose their transaction boundaries is the practical counterpart to this chapter's consistency argument.
- [Microservices Patterns](https://www.manning.com/books/microservices-patterns) — the book-length treatment; the saga and idempotent-consumer chapters are the practical follow-on from here.

## Chapter 2 — Idempotency & the Exactly-Once Illusion

This is the most misunderstood topic in the set, and the misunderstanding is not a matter of
nuanced opinion — it is a flat factual error that produces duplicate charges, duplicate
emails, and duplicate shipments. Get it right and most of Chapter 7 becomes obvious.

### 2.1 True Exactly-Once Delivery Does Not Exist

At the network level, message delivery is **at-least-once**. The only alternatives are
at-most-once (drop messages, and lose work) and exactly-once, which is not available to you
because the sender cannot know, after the fact, whether a message that timed out was
delivered or lost.

The arithmetic that makes this concrete:

```text
  T=0ms    client → POST /payments   {"amount": 4999, "card": "..."}
  T=8ms    server validates, charges the card, commits
  T=9ms    server starts writing the 200 response
  T=41ms   the response is lost — NAT timeout, a proxy dropped the connection,
           a rolling deploy recycled the pod mid-write
  T=2500ms client's HTTP timeout fires. It retries.
  T=2600ms server receives the retry, validates, charges the card, commits again.

  The server cannot distinguish "the first attempt never arrived" from
  "the first attempt arrived and committed and the response was lost".

  From the client's position, both look identical: no response, then a timeout.
  From the server's position, it has two charge records and one customer.

  → THE DUPLICATE WRITE IS THE DEFAULT OUTCOME OF A RETRY.
```

This is not a bug in anyone's code. It is what happens when you combine a network that can
drop a response with a server that has already committed. Every retry policy you have ever
written makes this slightly more likely, and every "the network is reliable, we can skip
the idempotency key" assumption makes it certain.

**What actually exists** is a composition, not a protocol feature:

```
  AT-LEAST-ONCE DELIVERY  +  AN IDEMPOTENT CONSUMER  =  EFFECTIVELY-ONCE

  The message may arrive three times. The *effect* happens once.
```

Note the careful wording: **effectively-once**, not exactly-once. You get exactly-once
*effects*, achieved by accepting at-least-once *delivery* and discarding the duplicates. The
term "exactly-once semantics" in Kafka is real but it is a much narrower claim — it applies
to a *read-process-write* cycle within Kafka's own transactional boundary, and it does not
cover your HTTP API, your side effects, or a message that left Kafka and hit a third
party. More on that in Chapter 4.

> **MUST REMEMBER**
>
> There is no exactly-once delivery at the network level. What there is: **at-least-once
> delivery plus an idempotent consumer, which produces effectively-once effects.** Every
> mechanism in this chapter is one of two things — a way to detect that you have seen this
> request before, or a way to make applying it twice a no-op. There is no third option, and
> "we'll just be careful" is not one of them.

### 2.2 Idempotency Keys — the Workhorse

The most common mechanism, and the right default for an HTTP API that a client might retry.

**How it works.** The client generates a unique key for the logical operation — a UUID, or
better, a deterministic value derived from the operation itself — and sends it with the
request. The server stores the key alongside the result of the operation. On a subsequent
request with the same key, the server returns the *stored result* rather than performing
the operation again.

```text
  REQUEST 1                                    REQUEST 2 (retry, same key)
  ─────────                                   ────────────────────────────
  Idempotency-Key: 7f3a-...                    Idempotency-Key: 7f3a-...
       │                                              │
       ▼                                              ▼
  ┌─────────────┐   not seen   ┌────────────┐  ┌────────────┐
  │ idempotency │─────────────▶│  DO THE    │  │ idempotency │─── hit ──▶ return
  │   table     │             │  WORK      │  │   table     │            stored
  └─────────────┘             │  charge()  │  └────────────┘            201 +
       │                      └─────┬──────┘                              same body
       │                            │
       │  ┌─────────────────────────┴──────────────────┐
       │  │ ONE TRANSACTION:  INSERT INTO idempotency   │
       │  │  (key, response_body, status, created_at)   │
       │  │  +  the actual business write                │
       │  └────────────────────────────────────────────┘
       ▼
  return 201 Created
```

```java
@Transactional
public PaymentResponse createPayment(PaymentRequest req, String idempotencyKey) {
    // 1. Try to claim the key. The UNIQUE constraint is what makes this atomic —
    //    a SELECT-then-INSERT is a race and two concurrent retries both win it.
    Optional<IdempotencyRecord> existing = idempotencyRepo.findByKey(idempotencyKey);

    if (existing.isPresent()) {
        IdempotencyRecord prior = existing.get();
        if (prior.isInFlight()) {
            // The first attempt is still running. Waiting is correct; re-executing is not.
            throw new RequestStillProcessing(idempotencyKey);
        }
        // Replay the ORIGINAL response — same status, same body, same headers.
        return prior.replayAsResponse();
    }

    // 2. Claim it. A duplicate key here means a concurrent identical request won the race;
    //    catch it and replay that one instead.
    try {
        idempotencyRepo.insert(IdempotencyRecord.inFlight(idempotencyKey, req));
    } catch (DuplicateKeyException concurrent) {
        return idempotencyRepo.findByKey(idempotencyKey).orElseThrow().replayAsResponse();
    }

    // 3. Do the work AND record the result in the SAME transaction. A crash between
    //    these two is a duplicate on retry — which is the failure this design exists
    //    to prevent.
    Payment payment = paymentGateway.charge(req);
    PaymentResponse response = PaymentResponse.from(payment);
    idempotencyRepo.complete(idempotencyKey, response);

    return response;
}
```

**The details that decide whether this works:**

| Decision | The real question | The honest answer |
| --- | --- | --- |
| Who generates the key | Client or server | **Client.** A server-generated key is generated *after* the response is lost, so it is a new key and dedup does nothing |
| How long to keep it | TTL on the record | A business decision, not a technical one. The answer is usually "longer than the retry window **and** longer than the client's timeout" — if the client retries for 30 minutes and you keep keys for 24 hours, you are safe. If a client retries for a week, a 24-hour TTL is a hole |
| What to store | Just "seen" or the result | The **result**. Replaying a stored response is what makes the retry a transparent no-op for the client. Storing only "seen" forces the retry into a `409 Conflict`, which pushes a retry-shaped problem onto the client |
| What about concurrent duplicates | Race handling | The unique constraint is the whole mechanism. Two simultaneous retries must not both execute |
| Scope | Global or per-endpoint | Per (key, endpoint, principal). A global key space means one client's collision blocks another |
| Non-idempotent side effects | Email, downstream calls | **Out of scope for this mechanism.** A charge inside a DB transaction is covered; an email is not. That is Chapter 7's problem |

> **SCALING REALITY CHECK**
>
> An idempotency table is a write-amplifying table. Every retried operation adds a row,
> and the rows must be retained for the full retry window — which means a payments API at
> 200 requests/second with a 7-day TTL holds **~120 million rows**. That is a real
> operational artefact: it needs its own index, its own retention job, and it is a
> perfectly plausible thing to forget to purge until the table outgrows the primary. If
> the operations are high-volume, consider a partitioned or time-series-backed store for
> the keys, or a shorter, business-justified TTL.

**A better key, when the operation is naturally deterministic.** For a `PUT`, the key can
be derived from the target resource and the desired state — the operation is idempotent
because writing the same value twice is the same as writing it once. The trap is
`PUT` endpoints that are not actually idempotent because the implementation does
read-modify-write: `PUT /orders/42 {"status": "cancelled"}` where cancelling twice emits
two emails, or where cancelling an already-cancelled order has a side effect the second
time.

### 2.3 The Dedup Table and Why the Database Is the Only Atomic Answer

The consumer-side equivalent of an idempotency key: a table of processed message ids,
written in the same transaction as the business change.

```sql
CREATE TABLE processed_message (
    message_id   VARCHAR(128) NOT NULL,
    consumer     VARCHAR(64)  NOT NULL,
    processed_at TIMESTAMP    NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer, message_id)
);
```

The **primary key is the mechanism**. That is the whole point, and it is the thing
interviewers are listening for when they ask about dedup:

```text
  ✗  THE CHECK-THEN-ACT RACE (what people write)
  ────────────────────────────────────────────────
     if (!processedRepo.exists(messageId)) {      // T0: SELECT — returns false
         businessWrite(payload);                  // T1
         processedRepo.save(messageId);           // T2: INSERT
     }
                                            ▲
     Two consumers on two threads, same message:
       thread A: T0 SELECT → false
       thread B: T0 SELECT → false        ← both proceed
       thread A: T1 write, T2 INSERT (succeeds)
       thread B: T1 write, T2 INSERT ──▶ ✗ unique violation, but the
                                           business write is already
                                           committed and, if the
                                           transaction is separate,
                                           so is the second effect.

     Two problems, actually: the race, AND the fact that if the INSERT
     fails you cannot roll back a business write that already committed.

  ✓  THE ATOMIC VERSION
  ─────────────────────
     INSERT INTO processed_message (consumer, message_id) VALUES (?, ?);
     -- if this throws DuplicateKeyException, a concurrent consumer already
     -- handled this message. Skip. This is a single atomic statement; the
     -- database serialises it for you.

     businessWrite(payload);
     -- in the SAME transaction, so a crash between them rolls back both.

  The rule: the dedup record and the business write are in ONE local
  transaction, and the "have I seen this?" check IS the insert.
```

> **INTERVIEW TRAP**
>
> "`if (processedMessages.contains(id)) return;` followed by the write" is the answer that
> sounds right and is a race. The candidate who says "yes, and the check must be an INSERT
> against a unique constraint, in the same transaction as the business write, because a
> check-then-act is a race between two consumers and a rollback of the dedup record alone
> does not undo the business write" has demonstrated the thing that is actually being
> assessed, which is whether you understand what the database is giving you for free.

### 2.4 Natural Idempotency

Sometimes the operation is idempotent by its own shape, and the right answer is to design
the API so it is.

```text
  ✓  IDEMPOTENT BY CONSTRUCTION
  ────────────────────────────
  PUT  /customers/42         set customer 42 to this exact value
                              → writing the same value twice = writing it once
  DELETE /customers/42       make customer 42 not exist
                              → deleting a non-existent customer is a no-op
  POST /payments  + key      idempotency key handles it
  SET stock = 7              assignment, not increment
  "reserve exactly 5 units"  an absolute target, not "+5"
  "transition PENDING → SHIPPED"  a guarded state machine (see 2.5)

  ✗  NOT IDEMPOTENT — AND LOOKING LIKE IT IS
  ───────────────────────────────────────────
  POST /payments             creates a new payment every call
  POST /orders/42/items      appends an item every call
  PATCH {"quantity": 10}     "add 10 to whatever is there" ≠ "set to 10"
  PUT  /customers/42         that emits a welcome email
                              → the second PUT is a no-op on the row and a
                                SECOND EMAIL
```

The subtlety in the last row is worth dwelling on, because it is the one that catches
teams who have decided "PUT is idempotent" and moved on. **HTTP method semantics describe
the state transition, not the side effects.** A `PUT` that triggers an email, a webhook, or
a payment authorisation is not idempotent, and the API is lying to every client and every
cache in the chain.

### 2.5 Making the Operation Itself Idempotent — the Most Robust Answer

The most reliable approach, and the one most often skipped, is to make the *domain* refuse
to apply the same transition twice. Instead of asking "have I seen this message before?",
you ask "is this transition still valid?" — and the answer lives in the state, not in a
side table.

```text
  THE TRANSITION GUARD — no dedup table at all

    saga_state:  PENDING ──► RESERVED ──► CHARGED
                  ──► FAILED      ──► COMPENSATING ──► COMPENSATED

    "reserve 5 units" arrives twice:
      1st: current state is PENDING     → transition legal  → apply → RESERVED
      2nd: current state is RESERVED    → transition illegal → no-op, log it

    The invariant is the same invariant that made the operation correct the
    first time. There is no second place for correctness to live.
```

```java
/**
 * The compensation in Chapter 6, and the retry from Chapter 2, are the same
 * mechanism: a guarded transition. A refund that arrives twice, and a saga
 * step that is retried, both reduce to "is this transition still legal?".
 */
public class Order {

    private OrderStatus status = OrderStatus.PENDING;
    private int reservedUnits;

    /** Returns true if the transition was applied, false if it was a no-op. */
    public synchronized boolean reserve(int units) {
        if (status != OrderStatus.PENDING) {
            return false;   // already reserved — a duplicate is a NO-OP, not an error
        }
        this.reservedUnits = units;
        this.status = OrderStatus.RESERVED;
        return true;
    }

    public synchronized boolean release() {
        if (status != OrderStatus.RESERVED) {
            return false;   // compensating something that was never reserved
        }
        this.reservedUnits = 0;
        this.status = OrderStatus.PENDING;
        return true;
    }
}
```

The robustness argument is the important one. An idempotency key can expire, or collide,
or be lost by a client that regenerates it on retry. A **guarded state transition cannot**
— it is a property of the domain, it is testable in a unit test with no infrastructure, and
it survives the loss of every other mechanism. This is also why it composes: a saga's
compensating action, a message redelivered three times, and a client retry all reduce to
the same question.

The honest cost: it only works where the domain has a natural state machine. A "send this
email" operation has no state to guard — the transition from unsent to sent is not
observable. That is precisely why the hard cases (payments, inventory, order state) get
this and the easy cases get a dedup table.

### 2.6 Reconciliation — Catching What Idempotency Missed

Idempotency is what lets you retry safely. **Reconciliation is what catches the case where
idempotency was wrong.** They are not alternatives; a system that has only the first is a
system that will eventually be wrong and will not know.

```text
  IDEMPOTENCY vs RECONCILIATION — different jobs, both required

  IDEMPOTENCY      "prevent a second effect at write time"
                   • synchronous, in the request path
                   • best-effort at the boundary (a TTL will expire)
                   • knows only about operations it has seen
                   • silent when it fails

  RECONCILIATION   "detect and repair a wrong state after the fact"
                   • asynchronous, on a schedule
                   • authoritative: compares two systems that should agree
                   • finds effects idempotency never saw — manual DB
                     writes, a service that bypassed the API, a bug in
                     the guarded transition, a compensation that failed
                   • produces WORK, which is why teams under-invest in it
```

The staff framing is that reconciliation is a **control**, not a script. A reconciliation
job that emails a Slack channel when it finds a discrepancy is a dashboard; a job that
repairs the discrepancy and records what it did is a control. Teams build the first
because it is a weekend project and then discover in month eight that nobody has looked at
the channel in seven months.

> **PRODUCTION SCENARIO**
>
> Problem: 1,847 customers were charged twice for the same order over eleven weeks. Total
> roughly £31,000. Discovered by a customer, not by monitoring.
> Investigation: the payment service had a client library that retried on any 5xx with three
> attempts. A rolling deploy in week three caused a burst of connection resets; the server
> had already committed the charge and written part of the response before the pod was
> recycled, so the client saw a 5xx and retried. There was no idempotency key on the
> endpoint and no guarded transition — the handler was `charge(); insert(); return 201;`
> and nothing refused the second call.
> Root cause: a retry policy with no idempotency, meeting a response that could be lost
> after the commit. The retry was not the bug; the retry *without* a key was.
> Solution: an idempotency key on the endpoint with the response stored and replayed, a
> 30-day TTL, and — the part that actually recovered the money — a nightly reconciliation
> against the payment processor's own records, which identified every double charge and
> refunded them automatically.
> Prevention: an idempotency key is now required on any endpoint that moves money, checked
> in code review; the charge path is a guarded state machine so a duplicate is a no-op even
> if the key is lost; and the reconciliation job alerts on *any* discrepancy rather than
> filing a ticket nobody reads.

#### Common Mistakes

- Believing a retry is safe because the operation is "naturally" once. It is not, until you
  have written the guard that makes it so.
- Storing only "seen this key" instead of the response, forcing retries into 409s and
  pushing a retry-shaped problem onto the client.
- Setting a TTL shorter than the client's retry window. A key that expires while a mobile
  client is still retrying is a key that has done nothing.
- Check-then-act dedup with a `SELECT` and an `INSERT`, which is a race between consumers.
- Recording the dedup entry in a *different* transaction from the business write, so a
  crash either loses the record or repeats the work.
- Assuming a `PUT` is idempotent because the HTTP spec says so, while the handler sends an
  email.
- Treating a 409 Conflict as a successful retry. It is a design choice with a real cost, and
  it is usually made by accident.
- Building idempotency and no reconciliation, and discovering the gap in a postmortem
  rather than a dashboard.

#### Interview Questions — Idempotency & the Exactly-Once Illusion

**Q1. Is exactly-once delivery achievable between two services?** `STAFF`

Not at the network level, and the distinction worth making is between *delivery* and
*effect*. Delivery is at-least-once, because a sender that times out cannot distinguish a
lost message from a lost response, and that ambiguity is not resolvable from the sender's
side. What you can achieve is **effectively-once**: at-least-once delivery into a consumer
that is idempotent, so the effect happens once. Kafka's transactional API gives you
exactly-once for a read-process-write cycle inside Kafka's own boundary, which is a real
and useful guarantee that does not extend to your HTTP API, your email, or a message that
has left the broker. The practical consequence is that every retried operation in a
distributed system needs either a dedup key or a guarded state transition, and "we have
retries" is an argument for idempotency, not against it.

**Q2. A client retries a POST and the customer is charged twice. What happened, and what
is the fix?** `STAFF`

The first request charged the card and committed; the response was lost — a NAT timeout, a
proxy drop, or a deploy recycling the pod mid-response. The client saw a timeout, which is
indistinguishable from a request that never arrived, so it retried, and the second attempt
ran the charge again. The fix is an idempotency key generated by the *client* and stored by
the server with the result, in the same transaction as the business write, replayed on a
subsequent hit. The key must be client-generated because a server-generated key is created
after the response was lost, so it is a new key and dedup does nothing. The second fix,
which is the more robust one, is a guarded state machine so a duplicate transition is a
no-op even if the key is lost. The third is reconciliation, because idempotency has a TTL
and cannot cover everything.

**Q3. How long should an idempotency key live, and who decides?** `TRICKY`

It is a business decision, and the framing that makes it tractable is: **longer than the
retry window and longer than the client's timeout.** The retry window is a property of the
client library's retry policy and its total budget, and it is measurable — a mobile client
retrying three times with exponential backoff has a retry window of about a minute, a
batch job retrying for six hours has a window of six hours, and an API gateway with a
30-second timeout has 30 seconds. The business input is the second half: how long can a
client legitimately be confused? A payments API at 200 requests/second with a 7-day TTL
holds around 120 million key rows, which is a real table with a real retention job. The
answer is usually the longer of the two, and the teams who get burned are the ones who
picked 24 hours for a system whose clients retry for a week.

**Q4. A PR adds a dedup check to a consumer. What is the review question?** `STAFF`

Is the check atomic, and is it in the same transaction as the business write. A
`SELECT` followed by an `INSERT` is a race — two consumers on two threads can both see
"not processed" and both apply the effect — and the insert's unique violation arrives
*after* the damage is done, so you cannot roll back the business write. The check has to
BE the insert: attempt `INSERT INTO processed_message (consumer, message_id)` and treat a
`DuplicateKeyException` as "already handled". And it has to share a transaction with the
business change, because a crash between "record the message" and "do the work" either
loses the work or repeats it, depending on the order.

**Q5. Is `PUT` idempotent? What would make your answer no?** `STAFF`

The method semantics say yes and the implementation frequently says no. A `PUT` is
idempotent as a state transition — setting a value to a specific thing twice is the same
as once — but the guarantee is about *state*, not about *side effects*. A `PUT` that
triggers a welcome email, calls a downstream webhook, or issues a payment authorisation
sends that email twice. A `PUT` implemented as read-modify-write (`status = "cancelled"`
where cancelling has a side effect) applies the transition logic twice. This is the trap
that catches people who have read the spec and stopped there, and the review question is
always "what else does this handler do".

**Q6. When is a guarded state machine better than an idempotency key?** `STAFF`

When you want the duplicate to be a no-op *in the domain* rather than in a side table. A
guarded transition cannot be defeated by a lost key, a regenerated key, a key collision,
or an expired TTL, because the protection lives in the aggregate's own state and is
testable in a unit test with no infrastructure. It is also the only mechanism that
composes — a saga compensation, a redelivered message and a client retry all reduce to the
same question, "is this transition still legal?" The cost is that it needs a state machine
in the domain to guard, so it works beautifully for payments, inventory and order
transitions and not at all for "send this email". The honest answer for a system with
natural state is to have both: the key stops the network-level duplicate, the guard stops
the logical one.

**Q7. What is reconciliation for, given that you have idempotency?** `STAFF`

Reconciliation is what catches the case where idempotency was wrong or absent, and there
are more sources of a wrong effect than duplicate delivery. Manual database writes, a
service that bypassed the API, a bug in the guarded transition itself, a compensation that
failed, a downstream provider that succeeded on a call you believed timed out, and the
simple expiry of a TTL while a slow client was still retrying. Idempotency is
synchronous, best-effort, silent when it fails, and only knows about operations it has
seen. Reconciliation is asynchronous, authoritative — it compares two systems that should
agree — and produces work rather than a dashboard. The discipline point is that a
reconciliation job that raises a Slack message is not a control; one that repairs the
discrepancy and records what it did is, and teams build the first because it is a
weekend.

**Q8. A colleague says "our Kafka setup has exactly-once semantics, so we don't need
idempotent consumers." What do you say?** `TRICKY`

That it is probably true and probably irrelevant to the case they are describing. Kafka's
transactional producers give exactly-once for a read-process-write cycle where the output
is produced back to Kafka and the read and write share a transaction — that is a real and
valuable guarantee. It does not cover an HTTP call to a payment processor, an email, a
webhook, or a message that has been consumed by a service writing to its own Postgres. And
it requires every participant in the chain to be configured for it — a consumer that
disables the transactional settings for performance silently opts out, and the guarantee
you thought you had is now provided by nothing. The staff-level point is that exactly-once
is a property of a *configuration that spans every hop*, and a guarantee held by
infrastructure that participants can opt out of is not a guarantee.

> **CHAPTER 2 SUMMARY**
>
> There is no exactly-once delivery at the network level, because a sender that times out
> cannot distinguish a lost message from a lost response — and a retry after a commit is
> therefore a duplicate by default, not by mistake. What exists is at-least-once delivery
> plus an idempotent consumer, which yields *effectively-once* effects. Every mechanism
> here is one of two things: a way to detect that you have seen a request before, or a way
> to make applying it twice a no-op. The workhorse is the client-generated idempotency key
> with the response stored and replayed, in the same transaction as the business write —
> client-generated because a key minted after the response was lost is a new key. Its TTL
> is a business decision framed as "longer than the retry window and the client's
> timeout". The consumer-side equivalent is a dedup table, and the essential detail is
> that the check **is** the insert against a unique constraint in the same transaction as
> the business change — check-then-act is a race, and check-after-act repeats the work. The
> most robust mechanism is a guarded state transition, which cannot be defeated by a lost
> key, a collision, or an expiry, and which composes with sagas and redelivery because all
> three reduce to "is this transition still legal?". And because idempotency is
> best-effort, synchronous and silent when it fails, it needs a counterpart: reconciliation
> that compares two systems which should agree and *repairs* the difference, not just
> alerts on it.

#### Further Reading

- [Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html) — the canonical statement of how at-least-once delivery plus message-ID dedup produces effectively-once processing.
- [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) — the producing half of the same problem; read it alongside this chapter because the two are one mechanism seen from either end.
- [Making retries safe with idempotent APIs](https://aws.amazon.com/builders-library/making-retries-safe-with-idempotent-APIs/) — the same argument from the API-design side, with the client-side key discipline spelled out.
- [Microservices Patterns](https://www.manning.com/books/microservices-patterns) — the book-length treatment; the idempotent consumer and transaction message pattern chapters are the practical reference.

## Chapter 3 — Sync Communication — REST, gRPC and Contract Design

### 3.1 REST: Resource Modelling and the Semantics People Get Wrong

REST is the default because it is the most widely understood, not because it is the best
fit for every interaction. The parts worth being precise about are the ones where teams
regularly violate the spec and then build their own conventions on top of the violation.

```text
  THE FOUR THAT MATTER
  ────────────────────
  GET     safe + idempotent. MUST NOT have side effects.
          A GET that increments a view counter or marks a notification
          read is broken for every actor that is not a browser: prefetchers,
          crawlers, caches, and every link-scanner in the corporate proxy.

  PUT     idempotent. Replaces the resource with the provided representation.
          "This resource should now look exactly like this."

  PATCH   neither safe nor, in general, idempotent.
          A MERGE patch IS idempotent if every field is a SET.
          An "increment" patch is NOT, and is the single most common
          non-idempotent operation in a REST API that nobody notices.

  POST    not idempotent. Creates a subordinate resource. THE default for
          anything that moves money, sends a message, or charges a card —
          and which therefore needs an idempotency key from Chapter 2.
```

The `GET` with a side effect is the most consequential of these, because it is
**cached**. A gateway or a `Cache-Control` header that treats `GET /notifications/42/read`
as a cacheable read will return a cached `200` to the next caller and the side effect
happens once no matter how many times it is invoked.

**Status codes that people get wrong:**

| Code | Correct use | The common misuse |
| --- | --- | --- |
| `200 OK` | Request succeeded and the response carries a representation | `200` for an error body, which breaks every generic client and every dashboard |
| `201 Created` | Resource created; a `Location` header points at it | `200`, which loses the new resource's identity for API consumers |
| `202 Accepted` | Request accepted, **work not yet done** — the response carries a status resource to poll | `200` for async work, so the client thinks it is finished when it has barely started |
| `204 No Content` | Succeeded, and there is deliberately no body | A `200` with `null`, or a `200` with a body on a `204`, which is a protocol violation |
| `409 Conflict` | State conflict — duplicate idempotency key, version mismatch | A generic "bad request" bucket, which makes retry policy impossible to write generically |
| `422 Unprocessable` | Syntactically valid, semantically rejected | `400`, when `400` should mean the request body itself was malformed |
| `429 Too Many Requests` | Rate limited; `Retry-After` says when | `503`, which tells the caller the problem is your fault, not theirs |
| `503` + `Retry-After` | Temporarily unavailable; the caller may retry | A hard `500`, which gives the caller no basis for a decision |

> **INTERVIEW TRAP**
>
> Returning `200 OK` with `{"error": "..."}` in the body is the most common API contract
> bug in the set, and the reason it matters is that it is invisible to the caller. Every
> generic client, every retry policy, every dashboard query, and every load-balancer rule
> that keys on 5xx depends on the status code being a faithful summary. A `200` with an
> error body means a failed dependency shows up in no error metric, is not retried by
> anything, and is reported by users as "the API is broken and nothing logs it".

### 3.2 The Error Contract — the Part of REST Nobody Designs

A fleet of services with no agreed error shape is a fleet that cannot be debugged, cannot
be retried by a gateway, and cannot be alerted on consistently. The design is simple and
almost nobody does it deliberately.

```json
{
  "code": "ORDER_NOT_FOUND",
  "message": "No order with id 42 for tenant acme-eu.",
  "status": 404,
  "detail": "SELECT * FROM orders WHERE id = $1 AND tenant_id = $2",
  "traceId": "4bf92f3577b34da6a3ce929d0e0e4736",
  "timestamp": "2026-03-14T09:12:44.118Z",
  "errors": [
    { "field": "quantity", "issue": "must be greater than zero" }
  ]
}
```

The rules that make this a *contract* rather than a shape:

1. **One shape across the fleet.** Same envelope, same field names, same semantics. A
   generic client that can parse one can parse all of them.
2. **`code` is a stable machine-readable identifier.** Not a number, not a message, and
   critically **not a human-readable string that someone rewords** — a client branching on
   `"Insufficient funds"` breaks when marketing changes the copy. `INSUFFICIENT_FUNDS` is a
   contract; `"Insufficient funds"` is a label.
3. **`message` is for humans and may change.** Never parse it. Never branch on it.
4. **`traceId` is in the body as well as the header.** The body copy survives being pasted
   into a ticket, which the header does not.
5. **`detail` for developers, `message` for users.** Never put a stack trace in `message`.

```text
  ⚠  THE REAL FAILURE MODE: THE ERROR PAGE FROM SOMETHING IN THE CHAIN

  client → gateway → service → (sidecar proxy) → (load balancer) → ???

  Every one of those can terminate a request with an HTML error page and a
  200-family or 5xx status. The specific shape that bites:

    • an nginx or Envoy upstream_timeout returns 504 with an HTML body
    • a service mesh sidecar returns 503 with a plaintext body when its
      upstream pool is empty
    • a CDN or WAF returns a challenge page with a 200

  The caller receives text/html where it expected application/json. A typed
  client either throws a parse exception and loses the status code — so a
  retryable 503 becomes an unparseable error and is NOT retried — or,
  worse, catches parse failures and treats everything as a 500.

  The defence, and it is a contract item rather than a config item:
    • every gateway and proxy error response is configured to emit the
      same JSON envelope, not HTML
    • every client treats an unparseable body as retryable-by-default at
      the same layer that would have retried a 503
    • a contract test asserts the error envelope on synthetic failures
```

> **MUST REMEMBER**
>
> A stable, machine-readable error `code` is worth more than an accurate, well-written
> `message`. The message will be reworded by someone who does not know a client parses it;
> the code will not, because a client parsing it is a build failure someone noticed.

### 3.3 Versioning — and the Question It Avoids

Three mechanisms, and they are more similar than they look:

| Style | How it works | Cost |
| --- | --- | --- |
| **URI** — `/v2/orders` | Version in the path | Trivially cacheable and trivially greppable. The "ugly" objection is aesthetic; a path segment in front of a resource is invisible to most consumers |
| **Header** — `Accept: application/vnd.orders.v2+json` | Media-type negotiation | The RFC-correct answer. Awkward in a browser, easy to get wrong in a client library, and easy for a proxy to strip |
| **Query/body field** — `?version=2` | A parameter | Rare, and usually a sign that the version is per-request rather than per-contract |

**The honest argument is that versioning is often a way of not answering the harder
question.** A version number promises that v1 and v2 can coexist indefinitely, which is a
very large promise. It is worth being able to say what you are actually promising, because
the answer determines how long you must keep v1 alive:

```text
  THE COMPATIBILITY PROMISE YOU ARE ACTUALLY MAKING
  ──────────────────────────────────────────────────
  "Additive only"        Adding optional fields and new endpoints is
                         non-breaking. Consumers ignore what they do not
                         recognise. This is the promise worth making,
                         and it costs almost nothing.

  "Coexistence"          v1 and v2 run side by side and both work.
                         Now you run two code paths, two sets of bugs, and
                         you must decide when v1 dies. That date is
                         usually unnamed, and unnamed dates are never kept.

  "Indefinite"           v1 is never removed. This is the promise teams
                         imply and cannot afford. Every request that
                         v1 receives forever is a request you cannot
                         delete the code for.
```

The staff-level content is the **deprecation discipline**, because "add a version" without
"remove one" is not a strategy, it is a way of never making the decision:

1. Adding a field a consumer does not know about is non-breaking. Prefer additive change
   and version only when you have to.
2. Changing a field's *type*, removing a field, tightening a validation rule, or changing
   the *meaning* of an existing value are all breaking, including the last one. Making
   `status` go from `pending` to `processing` without announcing it is a breaking change
   that no type checker catches.
3. A deprecation needs a **date**, a **usage metric** to decide when it is safe, and an
   **owner**. Without the metric you are guessing, and without the date it never happens.
4. A breaking change in a consumer's favour is still a breaking change. Removing a field
   nobody reads is still a deploy to that consumer.

### 3.4 gRPC and protobuf

gRPC's case is not "REST is bad". It is: **when both ends are under your control, protobuf
plus HTTP/2 buys you typed contracts, code generation, and materially better wire and
call overhead.** When either end is a browser, a third party, or a team you do not share a
language with, REST is usually still the right answer, and the honest reason is
*organisational* — a schema you own is a contract you have to honour, and a contract with
a third party is a negotiation you will lose.

**The mechanics:**

```text
  SCHEMA-FIRST
  ───────────
  // orders.proto — the contract, version-controlled, reviewed
  syntax = "proto3";
  package orders.v1;

  service OrderService {
    // Unary: one request, one response. The 95% case.
    rpc GetOrder(GetOrderRequest) returns (Order);

    // Server-streaming: one request, a stream of responses.
    rpc ListOrders(ListOrdersRequest) returns (stream Order);

    // Client-streaming: a stream in, one response out.
    rpc UploadOrders(stream Order) returns (UploadSummary);

    // Bidirectional: both directions, concurrently.
    rpc WatchOrders(WatchRequest) returns (stream Order);
  }

  message Order {
    string id          = 1;   // ⚠ the number IS the contract
    string customer_id = 2;
    repeated LineItem lines = 3;   // ⚠ `repeated` has NO presence in proto3
    Status   status    = 4;   // ⚠ enum values are integers on the wire
  }
```

Three traps in that schema that every team meets once:

1. **Field numbers are the wire contract, not field names.** Renaming `customer_id` to
   `buyer_id` at number 2 is a *non-breaking* change; changing the number is a breaking
   change that no compiler catches, because both sides compile fine and the field is simply
   empty. Never renumber, never reuse a number once retired.
2. **`repeated` has no presence.** A proto3 repeated field cannot distinguish "empty" from
   "absent", which is why adding a `repeated` field that means "no lines" versus "field not
   set" is not expressible. This is the constraint that makes `optional` in proto3 matter.
3. **Enums are integers.** A new enum value added by a newer server is an unknown integer to
   an older client, and if the client has a `default:` branch that throws, it is an outage
   triggered by a rollout in the other direction.

**Wire efficiency — give the range, not a fake number.** Protobuf is typically **3–10×
smaller than an equivalent JSON payload**, and the honest qualification is that the ratio
depends almost entirely on the shape of the message:

```text
  SAME 6-FIELD ORDER PAYLOAD
  ─────────────────────────
  JSON   {"id":"ord_8812ab","customer_id":"cus_44f1","lines":[{...},{...}],
           "status":"CONFIRMED","created_at":"2026-03-14T09:12:44.118Z", ...}
         →  ~380-520 bytes, mostly field names repeated on every message

  PROTOBUF  →  ~50-120 bytes. Field numbers, varint integers, no names on the wire.

  WHY A RANGE AND NOT A NUMBER:
    • a message of 6 short strings  → 6-8× smaller
    • a message dominated by an opaque blob (an image, a token) → 1.2×,
      because the blob does not compress in either format
    • a message of small integers   → 2-3× (varint), not 10×
  The honest statement: "3-10x for typical structured business messages, and
  close to 1x if the payload is mostly opaque bytes."
```

**HTTP/2 and the head-of-line blocking caveat.** gRPC rides HTTP/2, which multiplexes many
streams on one TCP connection — many concurrent RPCs without the connection-per-request
cost of HTTP/1.1. The caveat that matters: **HTTP/2 multiplexes at the *stream* level, but
TCP delivers bytes in order, so a lost packet stalls every stream on that connection.**
This is TCP-level head-of-line blocking, and it is the reason gRPC deployments that pin
many calls to one connection degrade sharply on a lossy network. Two mitigations worth
naming: `grpc.keepalive_time` / `keepalive_permit_without_calls` with tuned values (so dead
connections are detected and the client can reconnect), and connection pools sized for
concurrency rather than a single connection per host.

> **SCALING REALITY CHECK**
>
> gRPC's advantage is not primarily bandwidth. A typical internal unary RPC is
> **~0.3–1ms of framework overhead** against roughly **1–3ms** for a Spring MVC JSON call in
> the same datacentre — the network round trip dominates either way. The wins that actually
> show up are: no manual JSON parsing on either side, generated clients that fail to compile
> against a broken contract, and streaming, which REST cannot do at all. If your only reason
> for gRPC is "the payloads are smaller", you are optimising the 5% of the cost that is not
> the bottleneck.

**Deadlines.** gRPC propagates a deadline — a timeout as data, carried in a header and
serialised with the call, not enforced by the client merely abandoning the socket. This is
a genuinely important property and its absence in REST is a real gap: a client-side
`HttpClient` timeout cancels the client's *interest*, while the server keeps working. A
propagated deadline means every downstream hop can see the remaining budget and shrink its
own work, so a request with 200ms left does not start a 5-second query. The
`INTERVIEW TRAP` here is calling a client timeout a "timeout" as though they were the same
thing.

### 3.5 Coarse-Grained vs Chatty — the Decision Actually Being Asked About

This is the question an interviewer means when they ask "how would you reduce latency in
this design", and the honest answer is almost never "add parallelism".

```text
  CHATTY — 200 requests for one page
  ─────────────────────────────────────────────
  page  /orders/42/items
    └─▶ GET /orders/42                    1 call   20ms
        └─▶ GET /items/1                   1 call   20ms
            └─▶ GET /customers/7           1 call   20ms   ← to get a display name
                └─▶ GET /stock/1          1 call   20ms
                    └─▶ GET /warehouses/3  1 call   20ms
                        └─▶ GET /taxes/9    1 call   20ms
                            ... × 200 items

  p50  ≈ 200 × 20ms = 4,000ms. The page does not load.
  p99  ≈ 200 × 100ms = 20 seconds.
  Connection pool: 200 concurrent outbound requests, from a service that
  probably has 20 database connections. You have moved the bottleneck
  from the database to your own thread pool and your own fd limit.

  THE USUAL (WRONG) FIX — "parallelise it"
  ──────────────────────────────────────────
  page  /orders/42/items
    └─▶ 200 calls in parallel, 200 threads
        p50  ≈ 20ms (excellent!)   p99 ≈ 100ms (excellent!)
        now: 200× the QPS on every downstream service, 200 database
        connections per request thread pool, thundering-herd retry risk
        on any downstream blip, and a p99 that now depends on 200
        services' health instead of 6.

  ⚠ Lower latency. Strictly worse system. The problem was never the
    serial arrangement — it was that the contract was chatty.

  THE ACTUAL FIX — a coarser contract
  ─────────────────────────────────────
  page  /orders/42/items
    └─▶ GET /orders/42?expand=lines,line.product,customer
        1 call   25ms   1 database query, 3 joins, one response

  You traded 200 calls for 1, added no parallelism, and improved the
  p50 by 80x and the p99 by 800x.
```

The rule, stated so it is usable: **fix the contract before you fix the arrangement.** A
chatty interface is a design defect that parallelism conceals. The legitimate exception is
when the calls are genuinely independent *and* each is on a different service with its own
capacity — then bounded parallelism (not unbounded) is right, and the shape is `flatMap`
with a concurrency cap, not a thread per item.

### 3.6 N+1 Across Service Boundaries

The database N+1 is a query-count problem. The **cross-service** N+1 is worse, because the
per-item cost is 1ms instead of 0.05ms and there is no ORM to batch it for you, and because
it is often invisible — the latency is inside someone else's aggregate metric.

```text
  THE SHAPE
  ─────────
  OrderService:      SELECT * FROM orders WHERE id = 42                    1 call
    for each order_line:                                                  200 calls
      ProductClient.getProduct(line.productId)
      InventoryClient.getAvailability(line.productId)
      WarehouseClient.getName(line.warehouseId)

  The diagnostic that is NOT the latency: count the *requests* in the
  access log for one page view. 600 requests for one screen is the tell,
  and no amount of JVM tuning touches it.

  THE FIXES, in order
  ───────────────────
  1. BATCH ENDPOINT (best when the caller controls both ends)
     POST /products/batch   {"ids": ["p1","p2",...]}  →  one round trip
     ⚠ The trap: "batch" endpoints are implemented naively as a loop
       inside the server. 1 request in, 200 internal queries out. The
       network problem is solved and the database problem is now worse.
       Check that the batch actually does `WHERE id IN (...)`.

  2. FILTER-BY-IDS (best when you cannot change the callee)
     GET /products?ids=p1,p2,p3   with a sane cap (100-500)
     ⚠ Needs pagination semantics. Without a cap, a 10,000-line export
       asks for a 10,000-element IN clause and the database planner
       gives up. This is where "just add ?ids=" turns into a new outage.

  3. DENORMALISE INTO YOUR OWN READ MODEL (best at volume)
     Consume ProductChanged and maintain a local product cache table.
     Costs staleness and a projection — Chapter 8.
```

> **PRODUCTION SCENARIO**
>
> Problem: the order-detail page went from 1.2s to 14s at 09:40, with no deploy and no
> traffic increase. CPU on OrderService was normal; the database was normal.
> Investigation: the access log for a single request showed 1,847 entries across three
> downstream services. A previous change had switched the order-lines iteration from a lazy
> JPA fetch to an explicit per-line client call to make the N+1 "go away" locally — it had
> moved the N+1 one network hop outward. Nothing errored; every one of those 1,847 calls
> succeeded, which is why no alert fired.
> Root cause: an N+1 across a service boundary, made invisible by the fact that all the
> sub-calls succeeded. The latency was structural, not load-related.
> Solution: a batch endpoint implemented with a real `WHERE id IN (...)` and a 200-id cap,
> plus a bounded `flatMap` for the small remainder, and a `Bulkhead` on the downstream
> clients so a page view cannot exhaust the thread pool.
> Prevention: an access-log alert on *requests per inbound request* on the order service,
> which is a far better signal than latency, plus a contract test that fails if a client
> makes more than N outbound calls per invocation.

### 3.7 Contract-First Discipline

The discipline that prevents the outage nobody saw coming: **a breaking change is breaking
in the consumer's favour too, and it must fail the build.**

```text
  ⚠  THE CHANGE THAT IS FINE FOR YOU AND AN OUTAGE FOR THEM

  Producer PR:  remove the `legacyId` field from Order.
    • You removed it. Nobody used it. CI is green.
    • Consumer team: their code reads Order.legacyId to map to a
      external system. They do not know yet.
    • Deploy order: consumer starts throwing NPE on deserialisation, or
      silently writes null, depending on their deserialiser.

  The rule: a field removal is breaking EVEN IF NOBODY USES IT, because
  "nobody uses it" is a belief, not a fact you checked. The build is
  where you find out.

  THE DISCIPLINE
  ─────────────
  • Contract lives in version control and is reviewed like code.
  • Compatibility check in the build, not in a wiki. Buf for protobuf,
    OpenAPI diff for REST, and a Pact/provider test for behaviour.
  • Expand/contract: ADD the new thing, deploy everyone, THEN remove
    the old thing. Never both in one deploy.
  • A consumer-side contract test in the CONSUMER's CI that runs
    against the producer's real stub — this catches it from the other
    direction, which is the direction that matters.
```

> **TRADE-OFF**
>
> Contract-first tooling costs a build dependency and a review rule, and it slows down the
> change that turns out to be genuinely trivial. The flip condition is *how many consumers
> you have and how independently they deploy* — with one in-house consumer on the same
> release train, a wiki and a code review is enough; with forty consumers across six teams
> deploying hourly, a breaking change that CI does not catch is a scheduled outage. The
> intermediate case is the one people get wrong: a shared schema repository that is
> technically the contract but has no compatibility gate, which gives you the ceremony
> without the protection.

#### Common Mistakes

- `200 OK` with an error body, which makes failures invisible to every generic client.
- `POST` for an operation that is naturally idempotent, so it gets no key and no guard.
- A `GET` with a side effect, which is then cached by something in the chain.
- Branching on the error `message` rather than a stable `code`.
- Assuming the error envelope survives to the client — a proxy's HTML 502 in the middle of
  the chain silently converts a retryable failure into a parse error.
- Adding a v2 and never naming the date v1 dies.
- Parallelising a chatty interface instead of coarsening it, which lowers latency and
  multiplies load on every downstream service.
- Writing a `batch` endpoint as a loop inside the server, moving the N+1 rather than fixing
  it.
- Adding `?ids=` with no cap and no pagination, which is a new outage at export time.
- Renumbering a protobuf field, which compiles cleanly and silently empties the field.

#### Interview Questions — Sync Communication and Contract Design

**Q1. A service returns 200 with `{"error": "insufficient funds"}`. What is the actual
damage?** `STAFF`

Every generic consumer is now blind. Load balancers and gateways key retry and circuit
breakers on 5xx, so this is not retried. Dashboards counting error rates show zero, so the
outage is invisible to monitoring. Typed clients see a success and deserialize the error
into a null field, so the failure surfaces as wrong data three systems downstream rather
than as an error at the point it happened. And the operational consequence is that you
cannot answer "how many payment failures were there this morning" without grepping logs,
which is precisely the question you need answered during an incident. The fix is a
faithful status code plus a stable machine-readable `code` in a consistent envelope, and
the envelope has to be enforced at the edge too, because a proxy's HTML 502 in the middle
of the chain produces exactly the same blindness.

**Q2. When is gRPC the right answer over REST, and what does it cost?** `STAFF`

The right answer is when both ends are under your control and you control the language on
both sides. You get a schema-first contract, generated clients that fail to compile
against a broken contract, roughly 3–10× smaller payloads for typical structured business
messages, and streaming, which REST cannot express. The costs are real: you have taken on
a schema you now own, and a schema is a compatibility promise with a deprecation process
attached. Protobuf field *numbers* are the wire contract, so a renumber compiles fine and
silently empties the field. Enums are integers, so a new value from a newer server is an
unknown integer to an older client. And it does not reach browsers or third parties, so
real systems end up with both, which means two contracts to version. The honest reason to
prefer REST for a third party is organisational, not technical: a contract you can change
is worth a great deal.

**Q3. A page makes 1,800 calls and takes 14 seconds. What do you change?** `STAFF`

The contract, not the arrangement. That is a cross-service N+1, and the first number to
produce is requests per inbound request, which is far more diagnostic than latency. The
fix is a batch endpoint or a `filter by ids` query — but the trap is implementing the batch
as a loop inside the server, which solves the network problem and makes the database
problem worse. Verify it does `WHERE id IN (...)`, and cap the list, because an uncapped
`?ids=` on a 10,000-line export produces a 10,000-element IN clause and the planner gives
up. Parallelising the 1,800 calls is the tempting wrong answer: it takes the p50 to 20ms
and multiplies the load on every downstream service by 1,800, puts 1,800 concurrent
requests in front of a service with maybe 20 database connections, and makes your p99 a
function of 1,800 services' health rather than six.

**Q4. What is the compatibility promise you are making when you ship a v2?** `STAFF`

The first question is whether you need a v2 at all, because adding an optional field is
non-breaking and most "v2"s are not. If you do, the honest options are: additive-only,
which costs almost nothing; coexistence, where both run and you now maintain two code paths
and must name the date v1 dies; or indefinite, which is the promise teams imply and cannot
afford. What teams do not write down is the deprecation discipline — a date, a usage metric
that tells you when it is safe, and an owner. Without the metric you are guessing, and
without the date it never happens. And a removal is breaking even if nobody reads the
field, because "nobody reads it" is a belief that only a compatibility check in the build
can turn into a fact.

**Q5. How do you decide between strong and weak consistency on a given call?** `STAFF`

Ask which failure the user would call a bug, not which is easier to implement. A stale
product photo is cosmetic; a stale delivery address at checkout is a refund, and a stale
inventory count is an oversell. For the reads that are genuinely bugs, you pay for
read-your-writes, which is one of two things: route that read to the primary, which costs
primary capacity, or return a version token from the write and have the read carry it and
escalate if the replica is behind, which costs API surface and a promise you cannot easily
remove. The mistake is setting this globally, because a system is not eventually consistent
— *a query* is, and a small identifiable set of queries is where the policy belongs. The
review question is "which reads, if stale, would a user report as a bug?"

**Q6. What does a gRPC deadline do that an HTTP client timeout does not?** `ADVANCED`

A gRPC deadline is data: it is serialised into the call, carried in a header, and visible to
every downstream hop, so a service with 200ms of budget left can refuse to start a
five-second query and return a deadline-exceeded quickly instead. A client-side HTTP timeout
is the client abandoning its interest — the socket closes, but the server keeps working, and
every resource it acquired stays acquired until its own timeout fires. That is the
difference between shedding load and accumulating it: with client timeouts only, a slow
dependency receives more and more concurrent in-flight work from clients that have already
given up, which is the mechanism behind connection-pool exhaustion in a degradation
cascade. The practical point is that a timeout budget has to be propagated *and* budgeted
per hop, and a hop that takes longer than its entire upstream budget is a design error
regardless of which framework enforces it.

**Q7. How do you catch a breaking API change before it ships?** `STAFF`

In the build, on both sides, and the second one is the one that matters. A provider-side
compatibility gate — Buf breaking-change detection for protobuf, an OpenAPI diff for REST —
catches it from the producer's side. A consumer-side provider test, Pact or equivalent,
that runs the consumer's real expectations against the producer's stub in the *consumer's*
CI catches it from the direction that actually causes the outage. Both are needed, because
a change that is fine for you and breaking for them is invisible from your side, and a
change that is breaking for nobody but your own tests is invisible from theirs. The process
around it is expand/contract: add, deploy everyone, then remove — never both in one change
— and the reminder that a removal is breaking even when nobody reads the field, because
"nobody reads it" is a belief rather than a measured fact.

**Q8. Your REST API is served through a gateway and a service mesh. A dependency
times out and the client receives an HTML 502. What is the failure and what should have
been true?** `STAFF`

The failure is that a retryable `503` became an unparseable body, and most clients will
either throw a parse exception that loses the status code — so nothing retries it — or
worse, catch the parse failure and classify it as a `500`, which is neither retryable nor
distinguishable from a real bug. It is the same blindness as a `200` with an error body,
just arriving from a different layer. What should have been true: every proxy and gateway
in the chain emits the same JSON error envelope rather than HTML, clients treat an
unparseable body as retryable-by-default at the layer that would have retried the `503`,
and a contract test asserts the envelope on synthetic failures so a proxy upgrade that
changes it is caught. The general principle is that an error contract is a contract for the
whole path, not for your application, and anything that can terminate a request can
terminate it wrongly.

> **CHAPTER 3 SUMMARY**
>
> Synchronous communication is where the guarantees of a single process stop existing, and
> the design work is stating what guarantee each interaction gives you. For REST that means
> using the method semantics honestly — a `GET` with a side effect is then cached by
> something in the chain, and a `PUT` that sends an email is not idempotent however the spec
> reads — and it means treating the **error contract** as a real artefact: one envelope
> across the fleet, a stable machine-readable `code` that someone cannot reword, and a
> guarantee that the envelope survives the gateway, because an HTML 502 from a proxy
> converts a retryable 503 into an unparseable body and nothing retries it. Versioning is
> worth examining honestly, because a v2 usually means a coexistence promise, and
> coexistence without a named date is a promise you cannot keep. gRPC earns its place when
> both ends are yours: schema-first, generated clients that fail against a broken contract,
> protobuf at three to ten times smaller for structured messages and close to parity when
> the payload is opaque bytes, and streaming. Its costs are real — field *numbers* are the
> wire contract, enums are integers, and a schema you own is a compatibility commitment.
> The cross-cutting content is what an interviewer is actually asking about: fix a chatty
> contract before you parallelise it, because a cross-service N+1 lowered by parallelism is
> a better latency number on a worse system, and the diagnostic is requests per inbound
> request, not response time. And put compatibility checks in the build, from both sides,
> because a breaking change in a consumer's favour is still an outage and "nobody reads
> this field" is a belief rather than a fact.

#### Further Reading

- [Remote Procedure Invocation](https://microservices.io/patterns/communication-style/rpi.html) — the microservices.io framing of synchronous call design, including where the timeout and the retry policy belong.
- [API Gateway](https://microservices.io/patterns/apigateway.html) — the routing, aggregation and protocol-translation layer, and the place where a fleet-wide error contract and rate limiting actually get enforced.
- [gRPC core concepts](https://grpc.io/docs/what-is-grpc/core-concepts/) — the four call types and the service/client model, which is the shortest honest introduction to what streaming buys you.
- [Protocol Buffers: proto3 language guide](https://protobuf.dev/programming-guides/proto3/) — read the sections on field numbers, presence and enums; they are where the silent incompatibilities live.
- [gRPC deadlines](https://grpc.io/docs/guides/deadlines/) — why propagation beats client-side cancellation, which is the part most teams get wrong.

## Chapter 4 — Async Communication & Event-Driven Architecture

### 4.1 When Async Is the Answer, and When It Is an Avoidance

Asynchronous communication is genuinely right in three situations, and it is a way of
avoiding a hard design conversation in a fourth.

**The three good reasons:**

1. **Fan-out that the caller does not need to wait for.** "When an order is placed, notify
   the email service, the loyalty service, the analytics pipeline and the warehouse."
   Three of those four do not belong on the request path, and putting them there means the
   checkout's availability is the *minimum* of four services' availability rather than its
   own.
2. **Burst absorption.** A flash sale sends 50,000 requests/second to a service whose
   comfortable rate is 300/second. With a queue in between, the peak is a backlog number
   rather than an outage, and the backlog drains when traffic returns to normal. This is
   the single strongest operational argument for async and it is under-used as a
   justification.
3. **Availability decoupling.** If service B is down for ten minutes, a synchronous
   dependency means A's write path fails for ten minutes. With a broker, A keeps accepting
   writes, B processes the backlog when it returns, and — if the backlog is bounded and
   B degrades gracefully — the customers do not notice. This is real, and it is also the
   argument that gets abused, because the *cost* is that you have moved the outage to a
   point where it is invisible until the backlog becomes large enough to matter.

**The bad reason, stated plainly:**

> **INTERVIEW TRAP**
>
> "We made it async because microservices should be asynchronous" is a non-answer that
> usually signals the team avoided deciding something. Making a read async does not make a
> read fast; it makes a read *not exist yet*. If a user clicks "place order" and the
> confirmation depends on a message round trip, you have not decoupled anything — you have
> added a hop, a broker, a consumer group and a lag metric to a request that was already
> fast, and you have moved the failure from a clear 500 to an ambiguous "the order might be
> there or might not be, check back later". Async in the *request path of a user-facing
> synchronous decision* is a cost with no benefit. The test: **who is waiting for the
> answer, and would waiting be a worse experience than not knowing?** For a user filling
> out a checkout form, waiting is better. For a nightly reconciliation, waiting is
> meaningless.

### 4.2 The Broker Choice — Kafka vs RabbitMQ vs NATS

The honest framing is that these are not competitors on a single axis. They are different
data structures with different guarantees, and the question that picks between them is
two questions long:

> **Do you need to replay the stream? And do you need ordering?**

```text
  THE ACTUAL SHAPE OF EACH

  KAFKA — a durable, partitioned, append-only LOG
  ┌──────────────────────────────────────────────────────┐
  │ P0 │ m0 m1 m2 m3 m4 │ P1 │ m9 m10 │ P2 │ m20 m21     │
  └──────────────────────────────────────────────────────┘
     ▲ offset 0..N        ▲ offsets are the consumer's position
     └─ a consumer group reads P0 and remembers "I'm at offset 17".
        It can be moved back to 3. Replay is free because the data is
        still there. Nothing is ever "consumed" — reading is just
        storing an offset number.

  RABBITMQ — a QUEUE (or several). Messages are removed on ack.
  ┌──────────────────────────────────────────────────────┐
  │   [ msg ] → [ router ] → [ queue A ] → consumer      │
  │                    └─→ [ queue B ] → consumer        │
  │   ack = delete. No history. No "re-read that one".    │
  └──────────────────────────────────────────────────────┘

  NATS — core NATS is at-most-once pub/sub. JetStream adds
  persistence, and a stream is then a log like Kafka's but
  designed for much lower latency and far less operational weight.
```

| | Kafka | RabbitMQ | NATS (+ JetStream) |
| --- | --- | --- | --- |
| **Structure** | Partitioned log | Queue(s) with routing | Pub/sub; JetStream adds a log |
| **Replay** | **Yes, free** — reset the offset | **No** | Yes with JetStream |
| **Ordering** | Within a partition only | Per queue, FIFO | Per stream/subject, with limits |
| **Fan-out** | Consumer groups — each group gets every message | Native per-binding fan-out | Native, very cheap |
| **Latency** | Higher (batching, disk) | Low | **Lowest** — this is its design point |
| **Routing** | By topic only | **Rich** — headers, exchange types, patterns | By subject, with wildcards |
| **Scale model** | Partitions cap consumer parallelism | Queue count | Streams/partitions |
| **Ops weight** | Highest — partitions, lag, rebalancing, broker failure | Middle | Lowest with core, rises with JetStream |
| **When it fails** | Lag accumulates silently | Messages are gone if the ack was wrong | Depends entirely on whether JetStream is on |

**How to actually decide:**

```text
  "WE MIGHT NEED TO REPLAY IT"                →  Kafka (or NATS JetStream)
  "THE QUEUE IS THE INTERFACE, MESSAGES ARE
   DELIVERED AND FORGOTTEN"                   →  RabbitMQ
  "SUB-100µs AND THE WORKLOAD IS A FLEET OF
   SERVICES MESHING"                          →  NATS
  "I NEED ORDERING"                            →  whichever, and note that
                                                  ordering is per partition,
                                                  not global (§4.3)

  THE TWO-PART QUESTION MOST TEAMS SKIP:
  "Do you need to replay?" is the expensive one to get wrong, because
  it is the difference between a broker and a log — and the log is
  architecture, not a config flag. A RabbitMQ user who later discovers
  they need replay has to replace the broker, and by then the topic
  names and the routing are load-bearing everywhere.
```

> **SCALING REALITY CHECK**
>
> The number that decides Kafka deployments is the **partition count on the topic**, and it
> has a hard ceiling that people discover by hitting it: consumer parallelism in a group is
> capped at the partition count, so a topic with 3 partitions cannot be consumed by 30
> instances — 27 will sit idle. And that cap is also a *lifetime* cap: going from 3 to 30
> consumers requires a repartition, which is a data migration, not a scale button. The usual
> sizing heuristic is to provision partitions for the *maximum* consumer parallelism you
> will ever want, at a size that keeps a single partition's throughput comfortably below
> what one consumer can handle — 50–200 MB/s per partition is the commonly cited figure,
> and a topic on a 3-node cluster with replication factor 3 has three copies of every
> partition, so partition count multiplies your disk bill directly.

### 4.3 Ordering — the Hard Truth

**A global total order is not available.** This is not a limitation of the current
products; it follows from the architecture. To order globally across partitions, every
partition would have to know what every other partition did, which is a consensus
round trip per message, and the throughput ceiling of a distributed system comes precisely
from refusing to do that.

What you *can* have is **ordering per key**, by making all events for one key land in the
same partition.

```text
  PARTITION KEYING — ordering where you need it

  producer.send(topic, key = orderId, value = event)
                     │
                     ▼
     hash(orderId) % partitionCount = 3
                     │
      ┌──────────────┼──────────────┐
      ▼              ▼              ▼
   P0           P1           P2
   order A      order B      order A   ← ✗ NOT the same partition
   1,2,3        7,8,9        4,5,6

  ⚠ Two entities' events can arrive out of order at a consumer.
    Order A's "created" (P2, offset 5) and order A's "cancelled"
    (P0, offset 3) are in different partitions with no ordering
    relationship between them.

  THE DESIGN CONSEQUENCE — and this is the part that is not obvious:
  a consumer that is not order-independent will corrupt state, silently,
  at a rate proportional to traffic. You have two options:

  (a) ORDER-INDEPENDENT CONSUMER
      Applying events as a SET rather than a sequence. The projection is
      commutative, or is guarded by a version: apply only if
      event.version > stored.version. This is the recommended default,
      because it survives partition-count changes, which re-key
      everything.

  (b) STRICT CONSUMER WITH A VERSION CHECK
      Keep the highest version seen per entity and drop anything older.
      This is (a) plus storage, and it is what you need when the events
      are not commutative (a balance delta is not commutative).

  ⚠ The wrong answer: "make the consumer process serially". Serial
    processing does not fix ordering across partitions, it only makes
    the corruption slower.
```

> **MUST REMEMBER**
>
> **Ordering is per partition, and a partition is derived from a key you choose.** The
> design decision is therefore "what is the right partition key", and the honest answer is
> usually the aggregate id — which means two different entities' events are unordered with
> respect to each other, forever. The consumer must therefore be order-independent or
> version-aware. Picking `null` as the partition key (round-robin) is choosing to have no
> ordering at all, and it is the default, which is why people are surprised.

### 4.4 Poison Messages, DLQs, and the Visibility Timeout

The failure mode of at-least-once delivery is the message your consumer cannot process.

```text
  THE POISON MESSAGE
  ──────────────────
  A message arrives that the consumer cannot handle — a payload from a
  future schema, a null in a field that must be non-null, an amount
  that exceeds what the domain permits.

  Three bad responses:
    ✗ Ack it anyway            → silent data loss, discovered in a
                                  reconciliation months later
    ✗ Retry forever             → the consumer is now stuck. It will
                                  never process message 4,001 because
                                  message 4,000 kills it. A poison
                                  message becomes an outage.
    ✓ Move it to a DLQ and ack → the consumer makes progress, and the
                                  failure is visible in a place someone
                                  looks.

  ⚠ THE DLQ THAT NOBODY DRAINS
  ─────────────────────────────
  A DLQ is a data-loss incident with extra steps, because it *looks*
  like the safe option. It is safe only if:
    • it has an alert when its depth increases
    • it has an owner and a documented replay procedure
    • the replay is idempotent — replaying a DLQ re-delivers to the
      very consumers that could not handle it, so the fix must be
      deployed BEFORE the replay, or the replay cycles

  Teams create DLQs in an afternoon and never look at them for six
  months. The number of messages sitting in DLQs across the fleet is
  the honest measure of how much data you have lost.
```

**The redelivery storm** is the other half. A consumer that fails to process a message
requeues it; if the failure is caused by load (a downstream is slow, a pool is exhausted),
the retry traffic makes the load worse. The mitigation is exponential backoff with jitter
and a bounded attempt count before the message goes to the DLQ — and the honest observation
that a bounded retry on a load-induced failure is often just a slower way to fail.

**The visibility timeout** (RabbitMQ) and **the ack timeout** (Kafka) are the mechanism that
makes at-least-once work: the broker marks a message invisible when it is delivered, and
makes it visible again if the consumer does not acknowledge before the timeout. The
parameter is a real design choice with a specific failure:

- Too **short**: a consumer that is slow but working has its message redelivered while it
  is still processing it — so the message is processed **twice**, concurrently. The
  consumer must be idempotent (Chapter 2) or this is a duplicate-write generator.
- Too **long**: a consumer that crashes holds its messages invisible for the full timeout.
  With 3 consumers and a 5-minute timeout, recovering from a consumer OOM costs 5 minutes
  of stalled progress per message in flight.

```text
  THE ARITHMETIC THAT SETS IT

  visibility timeout  >  p99 of a normal successful processing
                      AND <  the point at which a stuck consumer's
                           backlog becomes a business problem

  Typical:  p99 process = 800ms  →  visibility timeout = 30s (generous margin)
  Typical:  p99 process = 12s    →  visibility timeout = 60s
  Bad:      p99 process = 12s    →  visibility timeout = 5s   → guaranteed
                                    duplicate processing under normal load
```

### 4.5 Event Schema Evolution and the Schema Registry

An event published to a topic is a **permanent commitment**. A consumer deployed a year
from now must be able to read what you publish today, which is a stronger constraint than
an API contract — an API you can version, because the callers are alive; an event is read
by something you cannot upgrade.

Three compatibility modes, and the confusion between them is the most common schema-registry
misunderstanding there is:

| Mode | Means | Holds when |
| --- | --- | --- |
| **Backward** | New consumers can read data written by old producers | You **add** an optional field with a default. **This is the mode you want 90% of the time** |
| **Forward** | Old consumers can read data written by new producers | The new producer omits fields the old consumer needs. Rarely what you want, and it caps what you can add |
| **Full** | Both directions | You can add optional fields with defaults. Very restrictive, and it is what most registry configurations are set to by default because it is the safest, not because it is right |

**Why teams get this wrong:** "backward compatibility" *sounds* like "old data stays
readable", and it is not — it means **new readers can read old data**. The direction is
about the *reader*, not the data. A team that believes backward compatibility means old
consumers keep working will set their registry to `BACKWARD`, add a field, and break
every deployed consumer in the fleet.

```text
  THE CHANGE TABLE
  ───────────────
  ADD an optional field with a default         → BACKWARD safe
  ADD a required field with no default         → ✗ breaks old readers
  REMOVE a field                               → ✗ breaks old readers
  RENAME a field                               → ✗ breaks old readers
  CHANGE a field's type                        → ✗ breaks old readers
  ADD a new enum value                         → ⚠ safe IF every reader
                                                  has a default branch;
                                                  an old reader that
                                                  throws on an unknown
                                                  value is an outage
  WIDEN a numeric type (int32 → int64)         → ⚠ needs a registry check
  NARROW a numeric type                        → ✗ breaks old readers
  CHANGE A FIELD'S MEANING with the same
    name and type                              → ✗✗ INVISIBLE TO EVERY
                                                  TOOL. "status: pending"
                                                  becoming "status: processing"
                                                  is the classic one.
```

> **MUST REMEMBER**
>
> The registry's compatibility mode describes whether the **reader** or the **data** is
> moving. `BACKWARD` = new consumers read old data. `FULL` = both. Choosing `FULL` because
> it "feels safest" is the default many teams ship, and it is the reason they cannot add a
> field without coordinating a fleet-wide deploy — which defeats the purpose of having
> events at all.

### 4.6 The Two EDA Failure Modes Worth Naming

**"Everything is an event" — the nouns-as-events anti-pattern.** The reflex when adopting
EDA is to publish an event for every entity and every change, and the result is that every
consumer must understand the full shape of every entity.

```text
  ✗  THE NOUNS-AS-EVENTS SHAPE
  ───────────────────────────
  topic: customer.updated
  payload: the ENTIRE Customer object, all 40 fields

  Consumers that wanted ONE field now have a dependency on the shape
  of all 40. Change the Customer schema to add a field and you have
  changed the contract for 12 consumers. Worse — a consumer that
  accidentally reads a field it should not now has a *runtime*
  dependency on data you did not mean to expose: an internal risk
  score, a fraud flag, a segment. The event became an accidental API.

  ✓  THE FACT-EVENT SHAPE
  ───────────────────────
  topic: customer.email-address-changed
  payload: { customerId, previousEmail, newEmail, version, occurredAt }

  Small, purposeful, nameable. Adding a customer field changes
  nothing. A new consumer needs a new topic, which is a small
  explicit cost rather than a silent coupling.
```

The test: **could a consumer of this event explain what it is for without opening the
payload?** If the honest answer requires the schema reference, the event is a noun.

**The event-as-a-remote-procedure-call trap.** This one is more insidious because it looks
like a reasonable design.

```text
  ✗  THE EVENT THAT IS A COMMAND IN DISGUISE
  ─────────────────────────────────────────
  topic: order.events
  published: OrderCancelled (full command payload: cancelReason,
             notifyCustomer: true, refundAmount: 42.00,
             restockInventory: true, sendEmail: true, ...)

  What you have built: a remote procedure call with extra steps.
  • The producer now knows what every consumer does with it.
  • The consumer's logic is invisible to the producer and to every
    other consumer.
  • "Add a step" now means a coordinated deploy.
  • The event cannot be broadcast to an unforeseen consumer, because
    it is not a fact — it is an instruction aimed at one recipient.

  The diagnostic: if the payload contains verbs and booleans that
  describe what the RECIPIENT should do, it is a command. If it
  contains nouns and values that describe what HAPPENED, it is an
  event.

  ✓  order.cancelled
     { orderId, reason, cancelledAt, cancellationPolicyApplied }
     Consumers decide: email, restock, refund, notify ops.
     A new consumer appears with no producer change at all.
```

> **STAFF-LEVEL CONSIDERATION**
>
> The governance question nobody asks on day one is **"what is the process for adding a
> topic?"** Because an event is a permanent contract, adding one is an API design exercise
> that most teams perform like a config change. The staff answer is that new topics need the
> same review as a public API: what is the fact being published, who is allowed to consume
> it, what is the compatibility policy, and is the payload deliberately minimal. Without
> that, the fleet accumulates hundreds of events whose payload shapes are understood by
> exactly one person, who has since left — and that is the actual cost of the eventual
> consistency decision, paid eighteen months later.

#### Common Mistakes

- Making a user-facing synchronous decision async, which adds a hop and a lag metric to a
  request that was already fast.
- Choosing RabbitMQ because it is "simpler" and discovering you need replay eighteen months
  later, which is a broker migration rather than a config change.
- Letting `null` be the partition key, which is round-robin and therefore no ordering at
  all — and it is the default.
- Expecting ordering across entities and getting corruption at a rate proportional to
  traffic, because consumers were written to process a sequence.
- A DLQ with no alert, no owner and no replay procedure, which is data loss with a
  dashboard.
- A visibility timeout shorter than the p99 of normal processing, which manufactures
  concurrent duplicate processing out of healthy traffic.
- Setting the registry to `FULL` and then discovering you cannot add a field without a
  fleet-wide deploy.
- Believing "backward compatible" means old consumers keep working. It means the opposite.
- Renaming a field's meaning without changing its name or type, which every compatibility
  checker passes.

#### Interview Questions — Async Communication and EDA

**Q1. When is asynchronous communication the right answer, and when is it an
avoidance?** `STAFF`

Right when the caller genuinely does not need to wait — fan-out to three services where only
one belongs on the request path, burst absorption where a queue turns a traffic spike into
a backlog number rather than an outage, and availability decoupling so a downstream outage
does not become an upstream write-path outage. It is an avoidance when you make a
*user-facing synchronous decision* async: making a read or a checkout confirmation
asynchronous does not make it fast, it makes the answer not exist yet, and you have added
a broker, a consumer group and a lag metric to a request that was already fast — while
converting a clear 500 into an ambiguous "it may or may not be there". The test is who is
waiting and whether waiting is a worse experience than not knowing; for a checkout
confirmation, waiting is better.

**Q2. Kafka or RabbitMQ for this workload? How do you decide?** `STAFF`

Two questions. Do you need to replay the stream, and do you need ordering. If replay is
possible, Kafka or NATS JetStream, because a log retains data and a queue deletes it on
ack — and a queue user who later needs replay is looking at a broker migration, with
topic names and routing that have become load-bearing everywhere. If the queue genuinely
is the interface — messages delivered once and forgotten, with rich routing on headers — then
RabbitMQ is the better fit and the log is over-engineering. NATS is the answer at
sub-100-microsecond latency across a large service mesh, where core NATS's simplicity is
itself the feature. Ordering is the second question because Kafka gives it per partition
only, so "I need ordering" is really "I need a partition key and an order-aware consumer",
and if you need *global* ordering none of these give it to you.

**Q3. Consumer lag is 400,000 messages and rising. What is the actual situation, and what
do you do first?** `SCENARIO`

Rising lag means arrival rate exceeds processing rate, and the two have different causes
with opposite fixes. First check whether consumers are running at all and whether rebalances
are happening — a `max.poll.interval` miss or a slow heartbeat causes repeated rebalances
where the group moves partitions and reprocesses, and the lag chart looks like processing
when it is churn. Second, check whether the consumer is *stuck* or *slow*: a stuck consumer
has flat throughput and a rising lag with no progress, and a poison message or a downstream
deadlock is the usual cause. **Adding consumers makes a stuck consumer worse** — you
multiply the number of instances repeatedly crashing on the same message. If it is genuinely
slow, then throughput, and throughput is capped by partition count in a group, so more
consumers beyond the partition count do nothing. The real levers are more partitions (a
repartition, hence a data migration), a faster or batched consumer, or splitting the topic
so one slow consumer is not holding up a partition everyone shares.

**Q4. Can you give a consumer exactly-once processing?** `STAFF`

Not across the whole path, and the distinctions matter. Kafka's transactional API gives
exactly-once for a read-process-write cycle where the read and the write both sit inside
the producer's transaction and the output is produced back to Kafka. It does not cover an
HTTP call to a payment processor, an email, a webhook, or a message consumed by a service
writing to its own Postgres. And it is a property of a configuration that spans every hop,
which means it can be silently lost: a consumer that changes its isolation or transaction
settings for performance has opted out, and nothing tells you. The general answer is
at-least-once delivery plus an idempotent consumer — effectively-once *effects* — with a
dedup record written in the same transaction as the business change.

**Q5. What is a poison message, and what is the right handling?** `STAFF`

A message the consumer cannot process — a payload from a future schema, a null where the
domain requires a value, an amount outside the valid range. There are two wrong responses
and one right one. Acknowledging it loses the data silently and you find out in a
reconciliation six months later. Retrying forever means the consumer never reaches message
4,001 because 4,000 kills it, so one bad message becomes an outage. The right response is
to move it to a DLQ with bounded exponential backoff and jitter before that, and ack the
original. The critical qualifier is that the DLQ is only safe if it has an alert on depth, a
named owner, and a documented *idempotent* replay procedure — and the replay must be run
after the fix is deployed or it cycles. A DLQ nobody drains is a data-loss incident with
extra steps.

**Q6. What does backward compatibility mean in a schema registry, and what is the trap?**
`TRICKY`

It means **new consumers can read data written by old producers** — the reader is the thing
that moves, not the data. The trap is that it sounds like "old data stays readable", which
invites teams to set the registry to `BACKWARD`, add a field, and break every deployed
consumer. The three modes are backward (new readers read old data — the mode you want
almost always), forward (old readers read new data, which caps what you can add), and full
(both, which is what most teams ship because it feels safest and which is why they cannot
add a field without a fleet-wide deploy). A fourth trap the tools cannot catch: changing a
field's *meaning* while keeping its name and type, where `status: pending` silently becomes
`status: processing`.

**Q7. A team publishes `CustomerUpdated` with the whole 40-field customer object. What is
wrong with it?** `STAFF`

It turns every event into a full schema contract, so adding a customer field changes the
contract for twelve consumers and any consumer that reads a field it should not now has a
runtime dependency on data you did not mean to expose — an internal risk score, a fraud
flag, a segment. The event has become an accidental API with a confidentiality problem
attached. The fix is a purposeful, nameable fact: `customer.email-address-changed` with
`{ customerId, previousEmail, newEmail, version, occurredAt }`. The test to apply is
whether a consumer can explain what the event is for without opening the payload — if it
needs the schema reference, the event is a noun rather than a fact.

**Q8. When does an event become a remote procedure call in disguise?** `STAFF`

When the payload contains verbs and booleans that describe what the recipient should do:
`{ cancelReason, notifyCustomer: true, refundAmount, restockInventory: true }`. You have
built an RPC with extra steps — the producer now knows what every consumer does, adding a
step is a coordinated deploy, the consumer's logic is invisible to everyone including the
producer, and the event cannot be broadcast to an unforeseen consumer because it is an
instruction aimed at one recipient. The diagnostic is grammatical: a fact is nouns and
values describing what *happened* (`order.cancelled` with an id, a reason and a timestamp);
a command is verbs and flags describing what should happen *next*. A useful secondary test
is whether you could safely add a second consumer — if adding a consumer requires a
producer change, you wrote a command.

> **CHAPTER 4 SUMMARY**
>
> Async communication is right for fan-out the caller does not wait on, burst absorption,
> and availability decoupling — and it is an avoidance when it is put in the path of a
> user-facing synchronous decision, where it converts a clear failure into an ambiguous
> "it may or may not be there" and adds a broker to a request that was already fast. The
> broker decision is two questions long: do you need to replay, and do you need ordering.
> Replay is the expensive one to get wrong, because a queue that deletes on ack versus a
> log that retains is architecture rather than configuration. Ordering is per partition, so
> the real answer to "I need ordering" is "I need a partition key and an order-aware
> consumer" — and since a null key is the default, teams routinely have no ordering and do
> not know it. The operational content follows from that: a poison message must reach a DLQ
> with bounded backoff, because retrying forever turns one bad message into an outage and
> a DLQ nobody drains is data loss with a dashboard. A visibility timeout shorter than the
> p99 of normal processing manufactures duplicate processing out of healthy traffic.
> Schema evolution is the part that gets people, and the trap is direction: backward
> compatibility means *new readers read old data*, not that old consumers keep working,
> which is why so many teams ship `FULL` and then cannot add a field. And the two EDA
> failure modes are worth naming because both look like reasonable design — publishing a
> whole entity so every consumer depends on all forty fields, and publishing a payload of
> verbs and boolean flags, which is a remote procedure call with an event's syntax and all
> of the coupling you split to remove.

#### Further Reading

- [Messaging](https://microservices.io/patterns/communication-style/messaging.html) — the canonical description of broker-mediated communication, including the message-relay-versus-message-broker split that Kafka and RabbitMQ sit on opposite sides of.
- [Domain-Specific Languages](https://microservices.io/patterns/communication-style/domain-specific.html) — why a good event names what happened in the domain's own language, which is the discipline that separates a fact from a noun-as-event.
- [Kafka design](https://kafka.apache.org/40/design/design/) — the design rationale for the log, partitions and consumer groups; the partition section is why the partition count is a lifetime cap.
- [Schema evolution and compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html) — the canonical explanation of BACKWARD vs FORWARD vs FULL, and the clearest statement of which direction each one protects.

## Chapter 5 — Messaging in Spring — Cloud Stream, Kafka & RabbitMQ

This chapter is the Spring surface for Chapter 4. Where Spring Cloud Stream's
`MessageChannel` abstraction is the useful thing, it is genuinely useful: **the same
application code runs unchanged on Kafka, on RabbitMQ, and on a test in-memory binder.**
Where it is a liability, it is in the places where the abstraction is *thicker than the
guarantee*, and hides which guarantee you actually have. The theme throughout is that
Spring Cloud Stream makes it very easy to be using a binder without knowing which
acknowledgement semantics it is giving you.

### 5.1 Bindings, Destinations and the Configuration Model

A **binding** is a named input or output. A **destination** is the broker-specific thing it
maps to — a Kafka topic, a RabbitMQ exchange and queue. The abstraction is
`destination ← binding ← application function`, and the properties bind them together.

```yaml
spring:
  cloud:
    function:
      definition: inventoryConsumer        # the bean name; multiple: a;b;c
    stream:
      bindings:
        inventoryConsumer-in-0:
          destination: orders.events        # the topic
          group: inventory-svc             # the consumer group — see 5.3
          contentType: application/json
        inventoryConsumer-out-0:
          destination: inventory.events

      kafka:
        binder:
          # ⚠ These are the DEFAULTS. Read them, because the default is
          # at-least-once and most people assume otherwise.
          autoCommit: false                 # the framework manages the commit
          ackMode: record                   # per-record; see 5.4
          maxPollRecords: 500
          minBytes: 1
          maxBytes: 10_485_760
          # This is the one to actually tune in an incident:
          maxPollInterval: 300000            # 5 min — and it interacts with 5.3
```

The properties worth knowing cold, because they are where incidents come from:
`maxPollRecords` (throughput per poll), `maxPollInterval` (how long the consumer can be
away before the broker revokes its partitions — the single most important one for
rebalance storms), and `concurrency` (consumer threads, capped by partition count).

### 5.2 The Functional Model vs the Annotation Model

Both exist, the functional model is the current recommendation, and the difference matters
for testability.

```java
// ── FUNCTIONAL MODEL — beans of type Consumer / Function / Supplier ──
@Bean
public Consumer<OrderPlaced> inventoryConsumer(InventoryService inventory) {
    return order -> inventory.reserve(order.orderId(), order.lines());
}

@Bean
public Function<OrderPlaced, StockReserved> reserveStock(InventoryService inventory) {
    return order -> new StockReserved(inventory.reserve(order.orderId(), order.lines()));
}

// ── ANNOTATION MODEL — @StreamListener, still supported ──
@Bean
public Consumer<OrderPlaced> inventoryConsumer(InventoryService inventory) {
    return order -> inventory.reserve(order.orderId(), order.lines());
}
```

| | Functional (`Consumer` bean) | Annotation (`@StreamListener`) |
| --- | --- | --- |
| Binding name | From the bean name or `spring.cloud.function.definition` | From the annotation value |
| Composition | Natives — `andThen`, `compose` | Awkward — a second listener for the same input |
| Testing | **A plain unit test: call the bean** | Needs a binder or the annotation stripped |
| Error handling | Configured on the binding | Configured around the annotation |
| Recommendation | Current default | Legacy; still the majority of code in the wild |

The testing point is the practical one, and it is worth stating because it is the reason
the functional model is recommended rather than a matter of taste: **a `Consumer<Order>`
bean is a function you can invoke from a unit test with a constructed argument**, and
`@StreamListener` is an annotation that is simply not there when you call the method
directly. That is the difference between a business-logic test and an integration test, and
it is the difference between a fast suite and a slow one.

### 5.3 Consumer Groups and Concurrency — the Misconfiguration That Dominates

This is the single most common Spring Cloud Stream mistake, and it produces a symptom that
looks like a performance problem and is a configuration problem.

```text
  THE RULE
  ───────
  Within one consumer group, the broker hands each partition to exactly
  ONE consumer instance.

  topic: orders.events   with 3 partitions, group: inventory-svc

     P0          P1          P2
      │           │           │
   ┌──▼───┐    ┌──▼───┐    ┌──▼───┐
   │cons-1│    │cons-2│    │cons-3│   ✓ 3 instances, 3 partitions — correct
   └──────┘    └──────┘    └──────┘

   ┌──▼───┐    ┌──────┐    ┌──────┐    ┌──────┐
   │cons-1│    │cons-2│    │cons-3│    │cons-4│  ✗ 4 instances, 3 partitions
   └──┬───┘    └──────┘    └──────┘    └──────┘
      │                                                 ▲
      └─ P0, P1, P2 all here                        IDLE.
        This instance does 3× the work                No assignment.
        of its peers.

  ⚠ The symptom is therefore NOT "it does not scale" — it is that
    scaling out appears to do nothing, one instance does all the work,
    and the other N-1 sit idle while the operator concludes the consumer
    is slow. The fix is MORE PARTITIONS, not more instances.

  ⚠ The corollary that bites later: partition count is a LIFETIME cap.
    Going from 3 partitions to 30 consumers requires a repartition,
    which is a data migration on the topic, not a scale button. Size
    the topic for the maximum consumer parallelism you will ever want.
```

The other half of the same story is the **rebalance**, and `maxPollInterval` is why
rebalance storms happen.

```yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          maxPollInterval: 300000        # 5 min default
        # and on the consumer side, the thing that actually causes the miss:
  kafka:
    consumer:
      properties:
        max.poll.records: 500
```

```text
  THE REBALANCE STORM
  ───────────────────
  A consumer processing 500 records per poll, each taking 200ms,
  with a downstream call per record:

    500 × 200ms = 100s per poll — fine, under 300s.

  Now add a downstream that slows to 900ms under load:
    500 × 900ms = 450s per poll — ✗ EXCEEDS max.poll.interval (300s)

  → Broker revokes the partitions. Every other consumer rebalances.
  → They start reprocessing from their last committed offsets.
  → Load spikes because everything is reprocessing.
  → Consumers get slower because the load spiked.
  → Another revocation.  → the storm is self-sustaining.

  THE FIX: max.poll.records is a BATCH SIZE, not a throughput knob.
  Reduce it (100 or even 1) so the poll cycle stays well under
  max.poll.interval. Throughput comes from the *number of consumers*
  and the partition count, never from making a single consumer's batch
  so large it cannot renew its lease.
```

> **SCALING REALITY CHECK**
>
> There is a hard floor on latency-versus-throughput in a consumer loop, and it is set by
> `max.poll.interval / max.poll.records`. With the defaults — 300s interval, 500 records —
> one record gets **600ms** of the budget on average, and a single record taking longer than
> that end-to-end (including your retries) guarantees a rebalance. If your per-record work
> is a 3-second call to a downstream service, you cannot run those defaults at all: you
> need `max.poll.records: 1` and a different concurrency story, or you need to stop doing
> the call inline and hand it to a local executor with the ack happening on completion.
> This is a much more common surprise than "Kafka is hard" and it has a specific
> configuration fix.

### 5.4 Ack Modes and the Exactly-Once Illusion Returning

At-least-once with manual acknowledgement is the default you want, and the reason is
Chapter 2: you need the ack to happen *after* the business transaction commits, so that a
crash between them causes a redelivery rather than a lost message.

```yaml
spring:
  cloud:
    stream:
      kafka:
        binder:
          ackMode: MANUAL_IMMEDIATE      # ack on the consumer thread,
                                         # immediately — the one you want
          # MANUAL       → ack after the whole batch. If the batch handler
          #                fails at record 40, the whole batch is redelivered.
          # RECORD      → ack per record. Better, still not transactional
          #                with your database.
          # BATCH       → ack when poll() returns. Rarely what you want.
```

```java
// The shape you actually want: ack AFTER the business transaction commits.
@Bean
public Consumer<PaymentEvent> settlePayment(SettlementService settlement,
                                           Consumer<PaymentEvent> ackable) {
    return event -> {
        // @Transactional — commits here
        settlement.record(event);
        // and only then does the ack happen. A crash before the commit
        // means redelivery, which is the correct direction to fail.
    };
}
```

**The exactly-once illusion, specifically in Spring.** Kafka's `read_committed`
isolation level plus a transactional producer in the same service gives exactly-once for
the read-process-write cycle *inside Kafka*. It does not cover your Postgres commit. The
sequence that produces the illusion:

```text
  1. Consumer reads with read_committed            ✓ sees only committed data
  2. Producer writes output to Kafka in a tx       ✓ atomic w.r.t. other consumers
  3. Business row written to Postgres               ✗ NOT in the Kafka transaction
  4. Process crashes here.
  5. Kafka rolls back the output write. The consumer has NOT committed
     its offset (it is in the same tx). So the message is redelivered.
  6. Consumer replays → the Postgres write happens AGAIN.

  → Exactly-once for Kafka, exactly-once for the offset, and a DUPLICATE
    in your database. The guarantee is real; it just does not reach
    your database, which is where your data lives.

  THE FIX IS NOT A DIFFERENT ISOLATION LEVEL. It IS CHAPTER 2:
  a dedup record in the same transaction as the Postgres write, or a
  guarded state transition.
```

> **MUST REMEMBER**
>
> `read_committed` plus a transactional producer gives exactly-once **within Kafka's
> boundary**. Your business transaction is a different system with a different journal, and
> nothing coordinates them. The moment your consumer writes to Postgres — which is always —
> you are back to at-least-once delivery plus an idempotent consumer, and no configuration
> setting changes that.

### 5.5 Content Type Negotiation — the Silent Serialisation

Spring Cloud Stream will convert your payload for you, automatically, based on the
`contentType` and the declared type of the consumer. This is convenient and it is the
mechanism behind a class of production incident that is genuinely hard to diagnose, because
nothing errors — the message is simply serialised in a form the other side cannot read.

```yaml
spring:
  cloud:
    stream:
      bindings:
        output:
          contentType: application/json        # or NOT set — and that matters
```

```text
  THE SILENT FAILURE
  ──────────────────
  Producer:  a Function<Order, OrderPlaced> bean, no contentType set.
            Spring infers from the declared types and writes
            application/json.

  Consumer:  a Consumer<OrderPlaced> bean with a @KafkaListener and an
            explicit String payload, expecting a plain JSON string.

  Nothing throws. The message arrives, the deserialiser produces an
  object where a String was expected, the value is null or a
  "ClassCastException at the boundary" three layers down, and the
  DLQ fills with messages that are perfectly valid JSON.

  THE RULE: contentType is part of the contract, exactly like the topic
  name. Changing it from application/json to application/x-java-serialized-object
  for a single binding is a breaking change to every consumer, and
  the binder will not tell you.
```

Two related traps in the same area: the header vs the payload decision (a content-type
*header* is out of band and therefore not covered by payload schema evolution, so a
registry enforcing schema compatibility on the payload will not catch a consumer that
changed its expected content type), and the fact that **adding a field to a Java class
serialised with the default Java serializer is a breaking change**, because Java
serialisation is positional. This is the strongest practical argument for setting
`contentType: application/json` or using Avro/Protobuf explicitly on every binding.

### 5.6 Lag as the SLI — the Operational Half

Everything above is a design; this is the part a staff engineer is actually asked about,
and it is the reason a messaging platform is an operational commitment rather than a
library dependency.

**Consumer lag is the SLI.** Not throughput, not error rate — **lag**, because lag is the
only number that tells you the system's actual promise is being kept. Throughput can look
perfect while the backlog grows. Error rate can be zero while the consumer is stuck on a
poison message. Lag is the number that means "a customer is waiting for something".

```text
  THE DECISION TREE FOR RISING LAG
  ───────────────────────────────
  Is throughput flat?
    │
    ├─ YES → the consumer is STUCK.
    │        A poison message, a deadlock, or a downstream that
    │        never returns. ⚠ ADDING CONSUMERS MAKES THIS WORSE —
    │        you multiply the instances crashing on the same message.
    │        Check the DLQ, check thread dumps, check the last
    │        successfully processed offset timestamp.
    │
    └─ NO → the consumer is SLOW (arrival rate > processing rate).
             │
             ├─ Consumers < partitions?  → you have headroom. Add consumers.
             ├─ Consumers = partitions?  → hard cap. More instances do nothing.
             │                              You need MORE PARTITIONS
             │                              (a repartition — a data migration,
             │                              not a scale button), or a faster
             │                              consumer, or a split topic.
             └─ Is one partition hot?  → a skewed partition key. Everything
                                         for one key lands on one consumer
                                         and nothing else helps.
```

Spring Cloud Stream exposes this as Micrometer metrics, and the ones that belong on a
dashboard are the native Kafka consumer-group lag metrics plus the binder's own:

```yaml
management:
  endpoints:
    web:
      exposure:
        include: health,metrics,prometheus
  metrics:
    tags:
      application: ${spring.application.name}
```

The three that earn their place on a dashboard, and the fourth that belongs only in a
debug view:

| Metric | What it tells you |
| --- | --- |
| `spring.cloud.stream.kafka.binder.records-lag` (per consumer, per partition) | The backlog. This is the SLI. |
| `...records-lag-max` | The worst partition. A high average with a low max means skew; a high max with a low average means a hot key |
| `...records-consumed-rate` | Actual processing rate. Compare against the producer's rate to distinguish slow from stuck |
| `...records-consumed-total` | Cumulative. A counter — use it for rate math, never for "where is it now" |

> **PRODUCTION SCENARIO**
>
> Problem: order events were arriving in the topic roughly 400/second and the inventory
> projection was visibly stale — the ops dashboard showed stock counts that were 20 minutes
> old, and the on-call rotation was manually confirming stock by phone.
> Investigation: lag was 2.1 million and growing. Throughput was flat at exactly 400/s for
> the two hours before the alert — the same number as the arrival rate — with no error rate.
> The consumer log showed a single thread. The team had scaled the consumer deployment from
> 2 replicas to 12 during an unrelated incident four days earlier and lag had "gone away"
> since.
> Root cause: the topic had 2 partitions. Two consumers could be assigned those partitions
> and the other 10 replicas idled with no assignment. Scaling out could not have worked,
> because consumer parallelism in a group is capped at the partition count. The flat 400/s
> was two consumers saturating, and the ops team's "fix" of adding replicas had changed
> nothing except pod count.
> Solution: repartitioned the topic to 24 partitions, which is a data migration with its own
> rollback, then scaled the consumer to 24 replicas. Lag cleared in about 20 minutes.
> Prevention: a lag alert at a *rate* threshold rather than an absolute one, a dashboard
> panel showing consumer count against partition count, and a runbook entry that says "check
> the partition count before you scale the consumer" — because in every instance of this
> class of incident, the operator's first instinct is the one that cannot work.

#### Common Mistakes

- Adding consumer replicas to fix lag, when the replica count has already reached the
  partition count and the extra replicas are idle.
- Scaling out to hide a *stuck* consumer, which multiplies the instances failing on the same
  poison message.
- Leaving `max.poll.records` at its default when per-record work is slow, which guarantees
  a `max.poll.interval` miss and a self-sustaining rebalance storm.
- Using `ackMode: BATCH` or default `RECORD` and believing you have exactly-once.
- Believing `read_committed` plus a transaction gives you exactly-once for your Postgres
  write. It gives it for Kafka; your database is a different journal.
- Leaving `contentType` unset and letting the binder infer it, which is a contract decided
  by classpath contents.
- Treating a schema-registry check on the payload as covering a content-type change, which
  lives in a header and is out of the payload.
- Alerting on absolute lag rather than on lag *rate*, so a topic with a slow steady-state
  backlog pages forever and a genuine spike is lost in the noise.

#### Interview Questions — Messaging in Spring

**Q1. A team scaled their Kafka consumer from 2 replicas to 12 and throughput did not
change. Why?** `STAFF`

Consumer parallelism within a group is capped at the topic's partition count — the broker
assigns each partition to exactly one consumer, so if the topic has 2 partitions, 2
instances get an assignment and 10 sit idle with nothing to consume. This is the most
common misconfiguration in the whole ecosystem because the symptom looks like a performance
problem and the fix is not a performance change. The consequence is that partition count is
a *lifetime* cap, not a scale button: going from 2 partitions to 30 consumers requires a
repartition, which is a data migration on the topic with its own rollback plan, and it
means the topic should be provisioned for the maximum consumer parallelism you will ever
want rather than the number you need today. Before scaling out, always check the partition
count — and if throughput is also flat, check whether the consumer is stuck rather than
slow, because more instances on a poison message make it worse.

**Q2. What is the right acknowledgement mode for a consumer that writes to a database, and
why?** `STAFF`

At-least-once with manual acknowledgement, acking *after* the business transaction commits.
The reason is directional: if the ack happens before the commit, a crash between them loses
the message permanently; if it happens after, a crash between them causes a redelivery,
which is a duplicate the idempotent consumer handles and which is the correct direction to
fail. `MANUAL_IMMEDIATE` is the mode you want over `MANUAL`, which acks only after the
whole batch — meaning one failing record at position 40 redelivers records 1 through 40.
`RECORD` is an improvement but is still not transactional with your database. The
complementary point is the rebalance risk: a long batch can exceed `max.poll.interval` and
get the partitions revoked mid-processing, so batch size is a lease-renewal constraint, not
a throughput knob.

**Q3. A consumer's lag is rising. Walk me through the diagnosis.** `SCENARIO`

Start by distinguishing stuck from slow, because the two have opposite responses. Flat
throughput with rising lag means stuck — a poison message, a deadlock, or a downstream
that never returns — and **adding consumers makes it strictly worse**, because you
multiply the instances that crash on the same message. Check the DLQ depth and the last
successfully processed offset timestamp. Rising throughput that is simply below the arrival
rate means slow, and then the next question is consumer count versus partition count: if
consumers are below partitions, add consumers; if they have reached the partition count,
more instances do nothing and the levers are more partitions (a repartition, hence a data
migration), a faster or batched consumer, or splitting the topic so one slow consumer is
not blocking a partition everyone shares. Finally check for a skewed partition key, where
one key's traffic concentrates on a single partition and the average lag looks reasonable
while one partition is hours behind.

**Q4. We use `read_committed` and a transactional producer. Are we exactly-once?** `STAFF`

Within Kafka, yes, and it is a real guarantee: reads see only committed data, the offset
update and the output write commit atomically, and a crash rolls back the output rather than
duplicating it. It does not extend to your business transaction, because Postgres has a
different journal and nothing coordinates the two. The failure sequence is concrete: the
consumer writes to your database, then crashes before the Kafka transaction commits. Kafka
rolls back the output and the offset is not committed, so the message is redelivered, and
the database write happens a second time. Exactly-once for Kafka, exactly-once for the
offset, duplicate in the database. The fix is not a different isolation level — it is a
dedup record written in the same transaction as the database write, or a guarded state
transition.

**Q5. What is the risk of leaving `contentType` unset on a binding?** `STAFF`

The binder infers it from the declared Java types, which means the serialization format of
your event is decided by a classpath rather than by a decision. The failure mode is silent
and nasty: a consumer expecting a raw string receives a typed object and produces a null or
a class-cast exception three layers down, and the DLQ fills with messages that are
perfectly valid JSON. Content type is part of the contract exactly like the topic name, and
changing it is a breaking change the binder will not warn you about. The two related traps
are the header: a content-type *header* is out of band, so a schema registry enforcing
compatibility on the payload will not catch a consumer that changed its expected type; and
Java serialization, which is positional, so adding a field to the class is itself a
breaking change for every existing consumer. Setting `application/json` explicitly, or
Avro or Protobuf, removes the whole class of problem.

**Q6. What is a rebalance storm, and what causes it?** `SCENARIO`

A self-sustaining cycle in which consumers get their partitions revoked and reprocess.
The trigger is exceeding `max.poll.interval` — the consumer takes longer than the interval
between polls, so the broker concludes it has died and revokes its partitions. Then every
other consumer rebalances and starts reprocessing from its last committed offset, which
raises load across the fleet, which makes processing slower, which causes another
revocation. The usual trigger is `max.poll.records` being left at its default while
per-record work includes a slow downstream call: 500 records at 200ms is 100s and fine, but
500 at 900ms is 450s and over a 300s limit. The fix is to reduce `max.poll.records` — it is
a lease-renewal constraint, not a throughput knob — and to take throughput from consumer
count and partition count instead.

**Q7. How do you monitor messaging, and what would you alert on?** `STAFF`

Consumer lag is the SLI, because it is the only number that means "a customer's request is
waiting" — throughput and error rate can both look healthy while the backlog grows. Alert
on the *rate* of lag growth rather than an absolute value, so a topic with a large
steady-state backlog does not page constantly. Alongside it: consumed rate per consumer
(compared against the producer's rate to separate slow from stuck), the DLQ depth with an
alert on any increase, and the number of active consumer instances against the topic's
partition count — that last one as a dashboard panel rather than an alert, because the
condition "more consumers than partitions" is a silent waste rather than an outage. Lag
per partition, not just in aggregate, because a healthy average with one very high maximum
is a hot partition key, which is a completely different problem with a completely different
fix.

**Q8. Why does Spring Cloud Stream's abstraction need care rather than gratitude?** `STAFF`

Because the abstraction is thicker than the guarantee. It lets the same function run
unchanged on Kafka, on RabbitMQ, and on an in-memory binder for tests, which is genuinely
valuable — but it also means the application code does not know which acknowledgement
semantics it is getting, and the defaults are at-least-once. The other side is that the
binding-level configuration, not the application code, is where the real decisions live:
`ackMode`, `maxPollRecords`, `maxPollInterval`, `concurrency`, and `contentType` are all
contract decisions, and a code review of the `@Bean` method sees none of them. The staff
point is that the review of a messaging change has to include the YAML, because that file
is where the guarantees are.

> **CHAPTER 5 SUMMARY**
>
> Spring Cloud Stream's binder abstraction is genuinely valuable — the same function runs
> on Kafka, on RabbitMQ, and on an in-memory binder in a test — and it is also *thicker
> than the guarantee*, so application code written against it does not know which
> acknowledgement semantics it is getting. That is the theme: the real decisions live in
> the YAML, which means a code review of a `@Bean` method sees none of them. The
> dominant misconfiguration is consumer replicas exceeding partition count, because the
> symptom looks like a performance problem and the fix is not a performance change —
> scaling out at the partition ceiling does nothing, and partition count is a *lifetime*
> cap because growing it later is a data migration. The related trap is `maxPollRecords`
> treated as a throughput knob when it is a lease-renewal constraint, which produces a
> self-sustaining rebalance storm. On guarantees: manual ack *after* the business commit,
> because failing in the direction of a redelivery is correct; and the exactly-once
> illusion returning in a specific, demonstrable form — `read_committed` plus a
> transactional producer is exactly-once within Kafka and produces a duplicate in Postgres,
> because they are two journals with nothing coordinating them. Content type is part of
> the contract and must not be left to classpath inference, and Java's positional
> serialization means adding a field is itself a breaking change. The staff half is
> operational: **lag is the SLI**, alert on the *rate* of growth rather than the absolute
> value, distinguish a slow consumer from a stuck one — because adding consumers to a stuck
> one multiplies the instances failing on the same poison message — and show consumer
> count against partition count on the dashboard.

#### Further Reading

- [Spring Cloud Stream reference](https://docs.spring.io/spring-cloud-stream/reference/index.html) — the binder abstraction, the functional model, content type, consumer groups and error handling in one place; use the index to reach the specific page rather than guessing paths.
- [Kafka binder](https://docs.spring.io/spring-cloud-stream/reference/kafka/kafka-binder/overview.html) — the binder-specific configuration and the properties whose defaults you should read rather than accept.
- [Partitions and concurrency](https://docs.spring.io/spring-cloud-stream/reference/kafka/kafka-binder/partitions.html) — the partition-count ceiling for consumer instances, which is the topic of Q1 and Q3.
- [Manual acknowledgement](https://docs.spring.io/spring-cloud-stream/reference/kafka/kafka-binder/manual-ack.html) — the ack modes and exactly where the ack has to sit relative to your business transaction.
- [Dead letter queues](https://docs.spring.io/spring-cloud-stream/reference/kafka/kafka-binder/dlq.html) — how the binder routes poison messages, and the properties that make a DLQ a control rather than a data-loss incident with extra steps.

## Chapter 6 — Sagas & Distributed Transactions

Spring Volume 11 Chapter 6.3 and 6.4 cover saga choreography vs orchestration and the
compensating-action model at framework altitude. **Read those for the Spring shape; this
chapter goes deeper on the state machine, on why compensation is a different kind of
operation from the forward path, and on how the saga itself fails** — which is a set of
failure modes that has nothing to do with whether the participants are correct.

### 6.1 The Problem, Precisely

A single business operation that spans services has no transaction. "Place an order" writes
to orders, decrements inventory, reserves a delivery slot, and authorises a payment. There
is no commit that makes those four atomic, and there cannot be one, because ACID is a
property of a single resource manager.

The two honest alternatives, and why neither is acceptable:

```text
  2PC / XA — the "real" answer
  ────────────────────────────
  A distributed transaction coordinator asks every participant to
  PREPARE (promising "I will commit if told"), then COMMITs.
  If any participant says "I cannot prepare", everyone ROLLS BACK.

  Why nobody uses it for microservices:
    • Every participant must be up and reachable for the duration. One
      service restarting for a deploy BLOCKS the transaction.
    • Holding prepared locks across a network call is a lock you cannot
      release, and a coordinator that crashes mid-protocol leaves
      participants in an in-doubt state requiring manual recovery.
    • Throughput: two round trips per transaction, and contention
      propagates — a hot row in one service slows transactions everywhere.
    • You now have an infrastructure dependency whose failure mode is
      "everything hangs", which is the hardest class of outage to run.

  It is the right answer inside a single database, and increasingly it
  is the right answer for a few tightly-coupled participants inside
  the same JVM. Across five independently-deployed services, a saga.
```

### 6.2 Choreography vs Orchestration — the Honest Trade

Volume 11's treatment covers the mechanics. The deeper point is that **both options have a
cost that the comparison table usually hides**, and the choice is really about where you
are willing to put the coupling and where you are willing to put the availability risk.

```text
  CHOREOGRAPHY
  ────────────
  checkout ──OrderPlaced──▶ inventory ──StockReserved──▶ payment
       │                                            │
       ◄──────────── PaymentFailed ─────────────────┘
       │        (and inventory must ALSO react to
       │         PaymentFailed to release the
       │         reservation — which it can only do
       │         if it subscribes to payment's event
       │         TOO, and now checkout and payment and
       │         inventory all know about each other)

  • No coordinator to keep available, and no coordinator in the
    critical path adding latency.
  • BUT: the flow is a property of the EVENT GRAPH, not of any
    component. You cannot read the code and see the flow. To
    understand what happens when payment fails you must know that
    inventory and checkout both subscribe to PaymentFailed.
  • The coupling is real and it grows one event at a time. Nobody
    declares it; it accretes silently until a new participant
    requires changes to existing ones.
  • Failure handling is EVERY participant's job, implemented
    independently, and therefore inconsistently.
  • Adding a participant means publishing and subscribing — cheap.
    But CHANGING an existing participant's behaviour means a
    coordinated review of everyone who subscribes.

  ORCHESTRATION
  ─────────────
  ┌────────────────────────┐
  │  SagaCoordinator       │  explicit state, persisted
  │  order_state:          │
  │   PLACED → INVENTORY_RESERVED → PAYMENT_AUTHORISED → COMPLETE
  │                    ↘ COMPENSATING → COMPENSATED
  └────────────────────────┘
    • One readable state machine. One screen. One place to look when
      an operation is stuck. This is worth an enormous amount at 3am.
    • Participants know nothing about each other. Adding one is a
      coordinator change, which is a controlled, reviewable change.
    • BUT the coordinator is now a DISTRIBUTED SYSTEM COMPONENT:
      it must be available, it must hold durable state, it needs a
      lease or leader election so two coordinators cannot drive the
      same saga, and it needs an operator view of in-flight sagas.
      It is a new thing that can be down, and when it is down sagas
      neither advance nor compensate — they simply sit.
    • It grows into a god service: every business flow that needs
      coordination ends up in it, and it becomes the thing nobody
      wants to change.
```

> **TRADE-OFF**
>
> The flip condition is **the number of participants and the number of flows per
> participant**, not team count. Choreography works well at two or three participants with
> one flow, where the event graph is small enough to hold in your head and the coupling has
> not yet accreted. Orchestration wins past roughly four participants, or the moment one
> participant has two different flows that must behave differently depending on which
> event started them — because at that point the participant needs to know about the whole
> graph, and that is the coupling choreography was supposed to avoid. The other flip
> condition is *debit*: once you have compensated a saga by hand, in production, at 3am,
> you will never choose choreography again.

> **MUST REMEMBER**
>
> **Orchestration buys legibility with availability.** The coordinator is a component that
> must itself be running, that holds durable state, and that needs leader election so two
> instances do not drive the same saga. A team that chooses orchestration has accepted a new
> distributed dependency in exchange for being able to read the flow, and that is usually
> the right trade — but it should be a decision, not an accident.

### 6.3 The Saga State Machine

The saga is a persisted state machine, and persisting it is not optional. The most common
implementation mistake is an in-memory saga definition with a database write only for the
final outcome — which means a coordinator restart loses every in-flight saga, and a
coordinator restart during a partial failure is precisely when you cannot afford to lose it.

```text
  A SAGA IS A PERSISTED STATE MACHINE, NOT A SEQUENCE OF CALLS

  ┌──────────────────────────────────────────────────────────┐
  │  saga_instance                                          │
  │    saga_id            PK, UUID, generated per attempt    │
  │    correlation_id     the business operation id          │
  │    idempotency_key    UNIQUE  ← stops duplicate sagas    │
  │    state              PLACED | INVENTORY_RESERVED | ...  │
  │    current_step       int                               │
  │    payload            jsonb                             │
  │    version            int        ← optimistic lock       │
  │    created_at, updated_at, deadline_at                   │
  │                                                          │
  │  saga_step                                              │
  │    saga_id, step_name, status, attempts, last_error     │
  └──────────────────────────────────────────────────────────┘

  FORWARD PATH                       BACKWARD PATH
  ────────────                       ─────────────
  1. create order          ─┐        5. release reservation
  2. reserve inventory     │        6. cancel order
  3. authorise payment     │        7. (nothing — payment auth
  4. schedule dispatch    ─┘         is released, not reversed)

  Each step: PERSIST the transition, THEN call, THEN persist the
  result. Never call first. A crash between "call" and "record the
  result" means the step runs again on recovery — which is only
  safe because every step is idempotent (Chapter 2).
```

```java
/**
 * The shape a durable saga step needs. Notice that the transition is
 * persisted BEFORE the outbound call, and that the step carries its
 * own retry budget — a saga that retries forever has replaced a
 * partial failure with an indefinite one.
 */
public class SagaStep {

    private final String name;
    private final Duration timeout;
    private final int maxAttempts;

    public void execute(SagaContext ctx) {
        // 1. Record the intent. If we crash now, recovery re-runs this
        //    step — which is safe because the step is idempotent.
        ctx.recordStepStarted(name, maxAttempts);

        try {
            // 2. Do the work with a deadline, NOT an unbounded call.
            ctx.withDeadline(timeout, () -> participant.call(name, ctx.payload()));

            // 3. Record the outcome.
            ctx.recordStepSucceeded(name);
        } catch (StepFailedException e) {
            ctx.recordStepFailed(name, e);
            throw new SagaCompensationRequired(ctx.sagaId(), name, e);
        }
    }
}
```

**Compensation is not symmetric with the forward path, and the asymmetry is the whole
design problem.** A compensation is a *new forward business action*, which means it has
different semantics, different timing, and a different failure rate from the step it undoes.

```text
  FORWARD STEP                        ITS COMPENSATION
  ────────────                        ────────────────
  insert order row        ──▶ row deleted            (nearly symmetric)
  decrement stock          ──▶ stock incremented     (arithmetic — symmetric)
  authorise payment £49.99 ──▶ void the authorisation (ASYNC, may take days)
  send confirmation email  ──▶ send a CORRECTION email (✗ not un-send)
  ship the parcel          ──▶ request a return      (✗ may be in a van)
  notify the partner API   ──▶ send a reversal event (partner may ignore it)
  print & post an invoice  ──▶ issue a CREDIT NOTE   (a new financial artefact)

  ⚠ EVERY compensation can itself fail. A saga that assumes
    compensation succeeds is a saga with an unhandled failure mode.
  ⚠ Every compensation is a DIFFERENT CODE PATH from the forward
    path, and it is the path that only runs when things are already
    broken — i.e. the least tested and most urgent code you own.
  ⚠ Some are not instantaneous. A card refund takes days. The saga
    is "complete" when the refund is INITIATED; your ledger is
    knowingly wrong against reality for that window, and any
    reconciliation that assumes atomic saga closure produces
    false alerts for days afterwards.
```

### 6.4 How the Saga Itself Fails

This is the part that distinguishes someone who has run sagas from someone who has
implemented them. A saga's participants can all be correct and the saga still fails in four
distinct ways.

**1. The saga stuck in a non-terminal state.** The compensation failed and there is no
retry, or the retry budget is exhausted, and now the saga sits in `COMPENSATING` forever.
Nothing is broken; nothing is working. The order is cancelled, the stock is not
released, and no alarm is firing because every individual component is healthy.

```text
  ⚠ THIS REQUIRES A SWEEP, NOT JUST A RETRY.
  Retry handles the first failure. A saga that has exhausted its
  retry budget and had its exception swallowed is invisible until
  someone writes a query.

  The controls:
  • a non-terminal-state SWEEP: any saga in a non-terminal state
    past its deadline is an alert, not a metric
  • an operator view: LIST SAGAS, by state, by age, with the last
    error — the coordinator is a UI, not just a service
  • every compensation carries the same retry budget as the forward
    step, and exhausting it raises an alert rather than a log line
  • a defined MANUAL RESOLUTION path, because at some point a
    human refunds someone
```

**2. The saga runs longer than any timeout.** The coordinator's own timeout, the client's
timeout, the gateway's timeout, and the saga's business deadline are four different clocks
and they are all shorter than the saga takes. The client gives up at 30s; the saga takes
four minutes; the coordinator's step timeout is 10s each. What the client sees is a
timeout, and what it does about it is retry — and now two sagas exist for one order
(Chapter 2's requirement, showing up in a new costume).

```text
  THE RULE: the saga's deadline must be SHORTER than every caller's
  timeout, and the coordinator must be able to detect "my caller
  already gave up".

  Practically:
  • deadline propagates inward: the saga's total budget is less than
    the gateway's, which is less than the client's.
  • a cancelled/expired saga must be reachable by the CALLER, so a
    retry can find the existing saga via the idempotency key rather
    than starting a second one.
  • "the saga finished after the client gave up" is a normal
    outcome that needs a status endpoint, not a failure.
```

**3. Duplicate saga execution on a client retry.** A client times out, retries, and the
`correlation_id` is not unique — so two sagas run for one order, both try to reserve
inventory (one succeeds, one hits the guard), and both try to authorise a payment. This is
Chapter 2 again, and the mechanism is the same: a unique constraint on the idempotency key
at saga creation, checked atomically, so the second attempt reads the *first saga's* state
and returns it rather than starting a new one.

**4. The saga and the event stream disagree.** The saga says the order is `PLACED`; the
event log says `OrderCancelled`. They are different stores with no shared transaction, and
the discrepancy is normal — it is the window between the state change and the event
publish, which is Chapter 7's outbox. The saga's own reconciliation is that events are
derived from the saga, not the reverse, so the saga's table is authoritative and the event
log is a projection. Teams that make the event log authoritative for saga state create a
system where the saga's truth depends on a consumer having caught up.

> **PRODUCTION RELEVANCE**
>
> The operational question that separates a team that runs sagas from one that has built
> them is what you do at 3am when a saga is stuck. The answer needs to be: a query that
> finds non-terminal sagas past their deadline, an alert on the *count* of those, an
> operator view listing them with their last error, and a documented manual resolution.
> A saga implementation without a "list in-flight sagas by state and age" query is not
> finished. That query is thirty lines of SQL and it is the difference between resolving a
> stuck order in five minutes and discovering three hundred of them in a monthly review.

#### Common Mistakes

- Running the saga from an in-memory definition with no durable state, so a coordinator
  restart loses every in-flight saga.
- Persisting the step *result* but not the step *intent*, so a crash after the call and
  before the record is an unknown rather than a retryable.
- Modelling compensation as a rollback and discovering that you cannot un-send an email.
- Not giving compensations their own retry budget, so one failure permanently wedges a saga.
- No sweep for non-terminal sagas, so wedged sagas are found by a customer rather than a
  query.
- Setting the saga deadline longer than the caller's timeout, so client retries create
  duplicate sagas.
- Making the event log rather than the saga table authoritative for saga state.
- Treating the coordinator as a library inside a business service, so it has no leader
  election and two instances drive the same saga.
- Never exercising compensation in a test, which means it is an assumption rather than a
  mechanism.

#### Interview Questions — Sagas and Distributed Transactions

**Q1. Why not just use 2PC across services?** `STAFF`

Because every participant has to be up and reachable for the duration of the transaction,
which means a service restarting for a deploy blocks the transaction rather than failing
it fast. Preparing holds locks across a network call that you cannot force-release, and a
coordinator crash mid-protocol leaves participants in an in-doubt state that requires
manual recovery. It costs two round trips per transaction and propagates contention, so a
hot row in one participant slows transactions everywhere. And it creates an infrastructure
dependency whose failure mode is "everything hangs", which is the hardest class of outage
to operate. 2PC is exactly right inside one database and occasionally for a few tightly
coupled participants in one JVM. Across five independently deployed services, the
engineering cost of the coordinator's availability requirement exceeds the engineering cost
of compensating actions, which are local, retryable, and individually understandable.

**Q2. Choreography or orchestration? Give me a reason to pick the one you would not
choose.** `STAFF`

I would pick orchestration at four or more participants, or the moment one participant has
two flows that must behave differently depending on which event started them — because at
that point the participant needs to know the whole event graph, and that is exactly the
coupling choreography was supposed to remove. The cost I accept is that the coordinator is
a distributed component: it must be available, hold durable state, have a lease or leader
election so two instances do not drive the same saga, and expose an operator view of
in-flight sagas. I would choose choreography only at two or three participants with a
single flow, where the event graph is small enough to hold in your head. And I would
convert to orchestration the first time we compensate a saga by hand, because that
experience changes the team's risk tolerance permanently.

**Q3. A compensation is not a rollback. Walk me through why, and what follows.** `STAFF`

A rollback undoes a write and a compensation is a new forward business action. You cannot
un-send an email — you send a correction. You cannot un-charge a card — you issue a
refund, a separate financial transaction that may take days to appear. You cannot
un-dispatch a parcel — you cancel, and it may already be in a van. Three consequences
follow. Compensation can fail, so it needs its own retry budget and its own idempotency,
and exhausting that budget must raise an alert rather than a log line. Compensation is not
instantaneous, so the ledger is knowingly inconsistent with reality for days, and any
reconciliation that assumes atomic saga closure will produce false alerts for that window.
And compensation is a different code path that only runs when things are already broken,
which makes it the least tested and most urgent code in the system — a compensation never
exercised is an assumption, not a mechanism.

**Q4. A saga is stuck in `COMPENSATING` and nothing is broken. How did that happen, and
what should have existed?** `STAFF`

The compensation failed — a downstream was down, a refund API returned an error, a
deadline was exceeded — and the retry budget was exhausted with the exception swallowed
into a log line. Every individual component is healthy, so no component alerts. The saga
is not progressing and will not recover on its own, and it is invisible until someone
happens to query for it. What should have existed: the intent must be persisted before the
call, not just the result, so recovery can distinguish "not started" from "started,
outcome unknown"; compensations need the same retry budget as forward steps and a
terminal alert when exhausted; and there must be a sweep for non-terminal sagas past their
deadline plus an operator view listing them by state and age with the last error. The
manual resolution path matters too, because eventually a human refunds someone.

**Q5. A client times out and retries, and now two sagas exist for one order. How do you
prevent it, and what is the underlying principle?** `STAFF`

A unique constraint on an idempotency key at saga creation, checked atomically — not a
`SELECT` followed by an `INSERT`, which is a race between two coordinator instances or two
retried requests. The second attempt reads the first saga's state and either returns it or
attaches to it. The underlying principle is that the saga's deadline must be shorter than
every caller's timeout, and the caller must be able to *find* an existing saga with the
same idempotency key after its own timeout — which means the status endpoint is part of the
contract, not an operational extra. This is the same requirement as Chapter 2's
idempotency keys; the saga is simply the operation that happens to be expensive enough that
people assume it is different.

**Q6. When is a durable saga framework worth it, and what does it actually buy you?**
`STAFF`

Temporal is the strongest of the durable execution engines: the workflow is code, the
state is persisted by the engine, and a worker crash resumes the workflow from the last
completed activity rather than restarting it. The specific things it buys are *determinism*
and *activity-level retry and timeout policy declared next to the code*, plus visibility
into in-flight executions, which is the operator view that is missing from hand-rolled
sagas. Spring Cloud's `@Compensable` annotations give a much smaller version: declarative
compensation wiring and a persisted saga, without a separate engine, at the cost of less
control over timers and signals. The honest assessment is that the framework does not
remove any of the hard parts — compensation is still business logic, activities still need
to be idempotent, and the "how do I find stuck sagas" question is still yours. It removes
the *plumbing*, and the plumbing is where hand-rolled sagas leak.

**Q7. Your saga step calls a service that takes 400ms at p50 and 3s at p99. What timeout
do you set, and what else does that number affect?** `STAFF`

Neither of those, on its own. A step timeout set to the p99 fails on the tail far more
often than an SLA allows, and one set to accommodate the p99.9 makes the saga's total
budget enormous, which then exceeds the caller's timeout and creates duplicate sagas — the
failure in Q5. The number has to be derived from the budget: the saga's total deadline is
less than the gateway's, which is less than the client's, and each step gets a share of
what is left, not a fixed number. That is why deadlines propagate as data rather than being
configured per service. The number also constrains the consumer's lease: in a Kafka-backed
saga, a step that takes longer than `max.poll.interval` causes a rebalance, so a
four-minute saga step needs the consumer reconfigured, not just the client timeout.

> **CHAPTER 6 SUMMARY**
>
> A saga replaces a distributed transaction with local transactions and **forward business
> actions that undo the effects of the others** — never with a rollback, because you cannot
> un-send an email (you send a correction) or un-charge a card (you issue a refund, days
> later), and every compensation is therefore a new transaction with its own semantics,
> its own timing, and its own failure rate. The choreography-versus-orchestration trade is
> really about where the coupling and the availability risk go: choreography leaves the
> flow in the event graph where nobody can read it and the coupling accretes silently;
> orchestration puts it in one state machine and creates a component that must itself be
> available, hold durable state, and be leader-elected. The part that separates
> implementation from operation is that **a saga fails as a saga**, independent of whether
> every participant is correct: it can wedge in a non-terminal state with nothing unhealthy
> and therefore nothing alerting, it can outlast every timeout on the path so the client
> gives up and retries into a second saga, and it can be started twice by a client retry
> unless creation is fenced by a unique key. Each of those needs a specific control — a
> sweep for non-terminal sagas past their deadline, a propagated deadline budget that is
> tighter than every caller's, and an atomic uniqueness check at creation — and the
> control that catches all of them is the operator query listing in-flight sagas by state
> and age. Durable saga engines buy determinism, declared activity retries, and execution
> visibility; they do not remove compensation, idempotency, or the stuck-saga question.

#### Further Reading

- [Saga pattern](https://microservices.io/patterns/data/saga.html) — the canonical description of both styles with the failure modes of each stated side by side; the transaction log versus the state-machine distinction is the part worth reading twice.
- [Microservices Patterns](https://www.manning.com/books/microservices-patterns) — the book-length treatment; the saga chapter's treatment of the "nothing else works" state is the honest version of this chapter's §6.4.
- [Temporal documentation](https://docs.temporal.io/) — what a durable execution engine actually provides, which is worth reading precisely to calibrate what hand-rolled sagas must reproduce.
- [Spring Cloud Stream reference](https://docs.spring.io/spring-cloud-stream/reference/index.html) — the binder and error-handling machinery a saga's activity steps are written against; useful for the retry and DLQ interaction.

## Chapter 7 — The Outbox, the Inbox & CDC

Spring Volume 11 §6.5 and §6.6 cover the transactional outbox and Debezium at
framework altitude. This chapter states the dual-write problem precisely, compares the
implementation choices honestly, and spends most of its time on the three questions that
are where outbox-based systems actually fail: **ordering, schema evolution of the events
themselves, and what happens to the outbox table.**

### 7.1 The Dual-Write Problem, Stated Precisely

A service must write to its database **and** publish a message. Those are two systems. There
is no atomic operation across two systems — no shared transaction, no shared journal, no
two-phase commit that does not require every participant to be up.

```text
  THE FOUR OUTCOMES. THREE ARE WRONG.

     ┌──────────────┐
     │ 1. DB write  │──── 2. publish ────▶ 3. commit
     └──────────────┘                             │
                                                  ▼
  ┌────────────────────────────────────────────────────────────┐
  │ ✗ publish FAILS, tx rolls back                            │
  │   → a message exists that describes work that never        │
  │     happened. A consumer acts on a phantom order.          │
  │                                                            │
  │ ✗ tx rolls back AFTER publish succeeded                    │
  │   → same thing, and this is the worse case: the consumer   │
  │     is fast and the rollback is slow, so the phantom       │
  │     message has usually already been acted on.             │
  │                                                            │
  │ ✗ process dies between 1 and 2                             │
  │   → the write committed, no event. SILENT. Nobody knows.  │
  │     You find out in a reconciliation weeks later.         │
  │                                                            │
  │ ✗ publish succeeds, then the consumer processes it TWICE   │
  │   → requires a retry somewhere, so see Chapter 2.          │
  │                                                            │
  │ ✓ DB commit, event published, consumer dedups             │
  └────────────────────────────────────────────────────────────┘

  There is no ordering of steps 1, 2, 3 that avoids this. Not with
  retries. Not with careful coding. It is not an implementation bug;
  it is the absence of an atomic operation that does not exist.
```

**The one thing that is guaranteed by the database alone is a transaction over the
database.** So the pattern is: make the event part of the database transaction, and get it
to the broker afterwards.

### 7.2 The Outbox

```text
  ┌────────────────────────────────────────────────────────┐
  │  ONE LOCAL TRANSACTION — the database does this natively  │
  │                                                         │
  │   BEGIN;                                               │
  │     INSERT INTO orders (...) VALUES (...);             │
  │     INSERT INTO outbox (id, aggregate, type, payload,  │
  │                         created_at, published_at NULL)  │
  │            VALUES (?, ?, ?, ?, now(), NULL);            │
  │   COMMIT;                                              │
  └────────────────────────────────────────────────────────┘
                    │  committed atomically — or not at all
                    ▼
        ┌──────────────────────┐
        │  RELAY               │   reads unpublished rows,
        │  • poller, or        │   publishes, marks published
        │  • log tailer/CDC    │
        └──────────┬───────────┘
                   │
                   ▼
              broker topic

  THE RELAY'S FAILURE MODE — and it is unavoidable:
  it can crash between publishing and marking the row as sent.
  → THE MESSAGE IS PUBLISHED TWICE.

  This is not a bug. This is the at-least-once guarantee, and it is
  the price of the pattern. The consumer MUST be idempotent.
```

```java
@Transactional
public Order placeOrder(PlaceOrderCommand cmd) {
    Order order = orders.save(Order.from(cmd));

    // Same transaction, same database. This is the only thing being made
    // atomic, and the database does it for free.
    outbox.save(OutboxRecord.builder()
            .aggregateId(order.id())
            .eventType("OrderPlaced")
            .payload(objectMapper.writeValueAsString(OrderPlaced.from(order)))
            .build());   // published_at is NULL

    return order;
}
```

### 7.3 Poller vs Log Tailer (Debezium) — the Honest Comparison

Two ways to get rows out of the outbox table, and they differ in a way that determines
whether this is a small feature or an infrastructure commitment.

```text
  A. THE POLLER
  ──────────────
  @Scheduled(fixedDelay = 500)
  List<OutboxRecord> unpublished = repo.findTop100ByPublishedAtIsNullOrderByCreatedAt();
  for (r : unpublished) { broker.publish(r); repo.markPublished(r.id()); }

  • 20 lines of code. No new infrastructure. Deployable with the app.
  • Lag floor = your poll interval. 500ms poll → 500ms minimum
    end-to-end latency, every event, forever.
  • ⚠ COMPETES FOR CONNECTIONS. The poller holds a connection while it
    publishes. If a broker call is slow, the pool is held, and a
    poller that runs on N instances means N pollers, each taking
    batch-sized connections. On a service with a 20-connection pool,
    three pollers at batch 100 can exhaust it.
  • ⚠ Needs its own index, and a query that uses it.
  • The mark-published step is a write per row — on a high-volume
    topic the outbox table generates write amplification on the same
    database as your business traffic.

  B. THE LOG TAILER / DEBEZIUM
  ──────────────────────────────
  Reads the database's OWN log (Postgres WAL, MySQL binlog) and emits
  row changes to Kafka. The outbox table can be skipped entirely.

  • Near-zero lag — it is a follower on a log the database is already
    writing, not a job that asks.
  • No polling, no extra connection pressure on the primary.
  • ⚠ BUT: you now have Debezium as a piece of INFRASTRUCTURE, with
    its own deployment, its own config, its own schema-history store,
    and its own on-call runbook.
  • ⚠ The connector is STATEFUL. It stores its LSN/binlog position.
    Lose the offset store and you either replay everything (duplicate
    storm at every consumer) or skip data. Restoring it correctly is
    an operational procedure, not a config change.
  • ⚠ Schema changes flow through the same stream. A DROP COLUMN
    becomes an event consumers cannot deserialise. And a schema
    change becomes a distributed change requiring expand/contract
    discipline — "deploy the readers" and "drop the column" are
    separate events on a stream everyone sees.
  • ⚠ The log is the coupling. Consumers depend on the PHYSICAL table
    structure. Rename a column for readability and you have broken
    consumers nobody had on record.
```

> **TRADE-OFF**
>
> The flip condition is **event volume and latency requirement**, plus whether you can
> modify the producing service. Poller below roughly a few thousand events per second with
> a half-second latency requirement is the right answer and costs nothing. Above that, the
> connection pressure and the write amplification of marking rows published usually force
> the log tailer. Debezium becomes the *only* answer when the producer cannot be modified
> at all — a legacy system, a third-party datastore, or a fleet of services where writing
> an outbox row means code changes everywhere. The trap is choosing the log tailer for its
> elegance on a low-volume system and inheriting a stateful connector's operational
> surface for a problem that 20 lines of scheduled code solved.

### 7.4 The Inbox — the Consumer-Side Counterpart

The outbox guarantees **at-least-once delivery**. That makes duplicates a *property of the
system*, not a bug to be fixed. The inbox is the mechanism that turns them into no-ops.

```sql
CREATE TABLE inbox (
    consumer     VARCHAR(64)  NOT NULL,
    message_id   VARCHAR(128) NOT NULL,
    received_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    PRIMARY KEY (consumer, message_id)
);
CREATE INDEX ON inbox (received_at);   -- for the purge in 7.7
```

```java
/**
 * The two rules, and both are load-bearing:
 *   1. The dedup check IS the insert, against a unique constraint.
 *      A SELECT-then-INSERT is a race between two consumer threads.
 *   2. The inbox record and the business write are in ONE transaction.
 *      A crash between them either loses the work or repeats it.
 */
@Transactional
public void on(OrderPlaced event) {
    try {
        // Atomic. If this throws DuplicateKeyException, a concurrent
        // consumer already applied this message — skip it.
        inboxRepo.insert(consumerName, event.messageId());
    } catch (DuplicateKeyException alreadyHandled) {
        return;    // duplicate — a no-op, not an error
    }

    inventory.reserve(event.orderId(), event.lines());
    // Same transaction. If reserve() throws, the inbox row rolls back too,
    // so the redelivery is processed rather than silently skipped.
}
```

> **INTERVIEW TRAP**
>
> The wrong order is the one everybody writes first: do the work, then record that you did
> it. A crash between the two means the redelivery repeats the work, and for a payment or a
> stock decrement that is a duplicate. The *other* wrong order — record, then do the work —
> is arguably worse, because a crash between them means the message is marked processed and
> the work never happens, and there is nothing left to retry from. Both must be in one
> transaction, and the check must be an INSERT against a unique constraint, because the
> "have I seen this?" question and the "mark it seen" act have to be the same atomic
> operation.

### 7.5 Ordering — the Outbox Does Not Give It To You

The outbox preserves the order in which the relay *reads* rows, which is `created_at`
order, which is the order the transactions committed — **but only if you read them in that
order and only within one relay.** Three things break ordering:

```text
  ✗ MULTIPLE RELAY INSTANCES
    6 pods, 6 pollers, all doing findTop100ByPublishedAtIsNull
    → two pollers read overlapping windows, publish out of order.

  ✗ BROKER PARTITIONING
    Events for one aggregate must land on the same partition, which
    means the PARTITION KEY must be the aggregate id. A null key
    (the default) is round-robin and gives no ordering at all.
    This is the single most common outbox-adjacent mistake: a
    perfectly good outbox, publishing with no key, and therefore
    delivering OrderCreated and OrderShipped to the same consumer
    in random order.

  ✗ THE CONSUMER IS SINGLE-THREADED OR NOT
    Even in perfect order, a consumer with concurrency=4 and one
    partition is fine, but a consumer with concurrency=4 and four
    partitions processes partition 2's message 5 while partition
    0's message 4 is still in flight. Per-key ordering only holds
    if the key is the partition key.
```

The honest answer to "how do you get ordering out of an outbox" is: **you do not get it
from the outbox; you get it from the partition key, and the outbox's only job is to make
the ordering deterministic enough to survive the relay.** Order by an aggregate sequence
column rather than a timestamp, read with `FOR UPDATE SKIP LOCKED` so two relays do not
double-read, and set the partition key to the aggregate id.

### 7.6 Event Schema Evolution — the Part That Gets People

An event you cannot change but which must remain readable by a consumer deployed a year
from now. This is genuinely harder than API versioning, for three reasons: the reader
cannot be upgraded (it may not exist yet), the data lives in a log or an archive rather
than a table you can migrate, and there is no natural moment at which everyone is
simultaneously on the new version.

```text
  WHY IT IS HARDER THAN API VERSIONING
  ────────────────────────────────────
  An API: you can deploy v2 and every caller is, eventually, on v2.
          You can see the callers. You can message them.

  An event: the consumer may not exist yet. It may be a service that
  was decommissioned and a replacement that will be written next
  year. And you cannot retro-fit a discriminator onto events that
  are already in the log — so the discriminator has to be in the
  FIRST version of the schema, before you know you need it.

  THE FOUR RULES THAT ACTUALLY WORK
  ─────────────────────────────────
  1. PUT A VERSION IN THE ENVELOPE FROM DAY ONE, not in the schema.
     { "type": "OrderPlaced", "version": 1, "id": "...", ... }
     Adding it later is impossible for events already published.
     Versioning the SCHEMA and versioning the EVENT are different
     problems, and only the first is solved by the registry.

  2. ADD FIELDS, NEVER REMOVE OR RENAME, for as long as the topic lives.
     If you must remove, keep the field and stop populating it, then
     remove it only after the retention window has passed and every
     known consumer has been verified against usage metrics.

  3. NEVER CHANGE A FIELD'S MEANING. Same name, same type, new
     semantics — invisible to every compatibility checker, and the
     most expensive kind of break because it produces plausible wrong
     answers rather than errors. If the meaning changes, the field
     is renamed and a new one appears.

  4. AN UPGRADE PATH FOR READERS THAT CANNOT BE UPGRADED: an upcaster
     or a "v1 or v2" deserializer that normalises old events into
     the current shape at the consumer boundary. This is the one
     mechanism that actually solves the problem, and it costs a
     mapping layer you have to maintain forever.
```

The failure mode in rule 3 deserves an example, because it is the one that costs a
quarter:

```text
  v1:  { "status": "pending" }
  v2:  { "status": "pending" }   ← SAME NAME, SAME TYPE, NEW MEANING
       (v2 means "awaiting payment authorisation")
       v1 meant "we have not started processing"

  Every compatibility checker passes. Every consumer deserialises
  successfully. And every consumer that filters on status == pending
  is now showing orders that will be charged as "started" when they
  were not. The bug is found by a customer, or by finance.
```

### 7.7 What Happens to the Outbox Table

It is a table that only ever gets inserts for the first N minutes of its rows' lives, and
then only updates, and then eventually deletes. Two things about it are routinely
underestimated.

**The index you need, and the one that is missing.** The relay's query is
`WHERE published_at IS NULL ORDER BY created_at LIMIT 100`. Without a supporting index
that is a sequential scan of a table with a hundred million rows, every poll, on the
primary, competing with your production traffic. The index is on `(published_at,
created_at)` — a partial index `WHERE published_at IS NULL` is better, because the
published rows then cost nothing to skip.

```sql
-- Postgres: a partial index. Published rows are excluded entirely, so the
-- index stays small no matter how big the table gets.
CREATE INDEX idx_outbox_unpublished
    ON outbox (created_at)
    WHERE published_at IS NULL;
```

**The growth, and the cost of purging too eagerly.** The table grows with your write
volume until the purge job removes published rows. The two failure directions:

```text
  PURGE TOO EAGERLY  →  you delete rows the relay has not yet published.
                         An event is lost. A consumer never hears about
                         the order. Silent, and it is the SAME failure
                         mode as the dual-write bug you built the outbox
                         to eliminate — which is a genuinely painful
                         irony, and the reason the purge must be
                         driven by published_at with a generous margin,
                         never by a blanket "delete old rows".

  PURGE TOO LATE     →  the table grows without bound, the index
                         degrades, and the primary's storage bill
                         climbs. A service writing 500 events/second
                         at 1KB each produces 43GB per day of outbox
                         rows. That is not a table, that is a disk.

  THE HONEST ANSWER: the retention window must exceed the maximum
  time a relay can be stalled (a deploy, a failover, an on-call
  handover) with margin. Days, not hours. And the purge runs on
  published_at, in bounded batches, so it is not itself a
  long-running lock on the primary.
```

> **STAFF-LEVEL CONSIDERATION**
>
> The outbox is the single most valuable pattern in this volume and the one most often
> adopted without the two questions that make it work: **who owns the relay, and what is
> the backstop when the relay has been down for a week?** A relay is a continuously running
> job with no human in the loop for days at a time, and the failure mode of "quietly not
> running" is a silently growing unpublished backlog. The controls that matter are a metric
> on the *oldest unpublished row's age* (not on row count, which is noisy), an alert on it,
> and a reconciliation job that compares business rows against published events and
> publishes what is missing. The reconciliation is the piece teams skip, and it is the only
> thing that catches an outbox relay that was broken in a way its own metrics did not show.

#### Common Mistakes

- Publishing to the broker inside the business transaction, which is the dual-write bug the
  outbox exists to eliminate.
- Running a relay on every instance with no `FOR UPDATE SKIP LOCKED` and no partition key,
  so ordering is lost and duplicates appear.
- Publishing with a null partition key, which round-robins and gives no ordering at all,
  even though the outbox itself is ordering rows correctly.
- Recording the inbox entry in a different transaction from the business write.
- Checking the inbox with a `SELECT` instead of inserting against the unique constraint.
- Omitting the version field from the event envelope on the grounds that you will add it
  later — you cannot, retroactively, for events already in the log.
- Changing a field's meaning while keeping its name and type, which every compatibility
  checker passes and which produces plausible wrong answers.
- Deleting outbox rows by age rather than by `published_at`, which silently loses the
  events the relay never got to.
- Purging too eagerly and then being surprised that you have rebuilt the dual-write bug.
- Monitoring outbox row count instead of the age of the oldest unpublished row.

#### Interview Questions — The Outbox, the Inbox and CDC

**Q1. Why can't you just publish to Kafka inside the database transaction?** `STAFF`

Because there is no atomic operation across two systems — no shared transaction, no shared
journal. Whatever order you choose, some interleaving is wrong: publish first and the
transaction rolls back, so a message describes work that never happened and a fast consumer
acts on a phantom; commit first and publish second, and a crash between them loses the
event silently. Retrying does not help, because the ambiguity is fundamental — after a
timeout the producer cannot know whether the publish succeeded. This is not a bug to code
around, it is the absence of a primitive. The outbox's insight is that the database is the
one thing that *does* give you atomicity, so you write the event there in the same
transaction and get it to the broker afterwards.

**Q2. Your outbox relay publishes a message twice. Is that a bug?** `TRICKY`

No, it is the price of the pattern and the reason consumers must be idempotent. The relay
reads an unpublished row, publishes it, and then marks it published. A crash between the
publish and the mark means the row is still unpublished and the next relay run publishes
it again. The alternative — marking before publishing — trades a duplicate for a *lost*
message, which is strictly worse. So at-least-once is the only correct outbox semantics,
and the consumer needs a dedup record written in the same transaction as its business
write. Teams that treat a duplicate as an incident to fix by making the relay "smarter"
end up with a lost-event bug instead.

**Q3. Debezium or a scheduled poller? When do you choose each?** `STAFF`

Poller below roughly a few thousand events per second with a half-second latency
requirement, because it is twenty lines of code, deploys with the application, and adds no
infrastructure. Its costs are a lag floor equal to the poll interval, connection pressure
on the primary while the broker call is in flight — and on a service with a 20-connection
pool, three pollers at batch 100 is a real exhaustion risk — and a write per published
row on the same database as your business traffic. The log tailer wins above that volume
or below that latency, and it is the *only* answer when the producer cannot be modified:
a legacy system or a third-party datastore. The cost you are accepting is that Debezium
becomes infrastructure with its own deployment and on-call, and the connector is stateful —
its offset store holds the LSN, and losing it means either a replay storm at every consumer
or skipped data. Choosing it for elegance on a low-volume system is how you acquire a
connector's operational surface for no benefit.

**Q4. Schema changes flow through your CDC stream. What breaks, and what is the
discipline?** `STAFF`

Two distinct problems, and the first surprises people. A `DROP COLUMN` becomes an event
that consumers cannot deserialise, and that is not a deployment problem — it is a
distributed schema change with an ordering problem attached. The second is subtler: because
consumers now depend on the *physical table structure* rather than a published contract, a
column renamed for readability breaks consumers nobody had on record. The discipline is
expand/contract: add the new column, deploy every reader to use it, verify by usage
metric, and only then drop the old one — as separate events in time, not one migration.
With a schema registry you get compatibility checking on the event schema, but the
physical coupling to the table is still there, so the discipline is the same.

**Q5. How do you find stuck outbox rows, and what is the right metric?** `STAFF`

Not row count — the age of the oldest unpublished row, which is directly the number of
minutes of event loss if the relay is down. Count is noisy and grows constantly under
normal operation, so it makes a poor alert threshold and an even poorer dashboard. Add a
reconciliation job that compares business rows against published events on a schedule and
publishes what is missing, because that is the only thing that catches a relay that failed
in a way its own metrics did not show. And a purge that runs on `published_at` in bounded
batches with a multi-day retention margin — deleting by age instead silently discards
unpublished rows, which is the same dual-write failure the outbox was built to eliminate.

**Q6. Why is event schema evolution harder than API versioning?** `STAFF`

Three reasons. The consumer may not exist yet — you cannot upgrade a service that has not
been written, and the one that exists now may be replaced next year. The data lives in a
log or an archive, not a table you can migrate in place, so you cannot fix the past. And
there is no moment when everyone is simultaneously on the new version, so you need both a
compatibility window and a reader-side translation. The four rules that follow: put a
version in the envelope from day one, because you cannot retro-fit a discriminator onto
published events; only add fields for as long as the topic lives; never change a field's
meaning, because that is invisible to every checker and produces plausible wrong answers
rather than errors; and keep an upcaster or v1/v2 normaliser at the consumer boundary,
which is the only mechanism that actually solves it and which you must maintain forever.

**Q7. Explain the reordering that a naive outbox relay causes.** `TRICKY`

The relay reads unpublished rows ordered by `created_at`, which is commit order, so the
rows are handed to the broker in the right order. Then three things lose it. If the relay
runs on every instance with a plain `findTop100ByPublishedAtIsNull`, two pollers read
overlapping windows and publish out of order, which is why you want `FOR UPDATE SKIP LOCKED`
or a partitioning scheme so two relays never process the same row. If the producer publishes
with a null partition key, which is the default, the broker round-robins and there is no
ordering at all even though the outbox was perfectly ordered — you need the aggregate id as
the partition key. And if the consumer has concurrency greater than one, messages from
different partitions are in flight simultaneously, so per-key ordering only holds if the
key is the partition key. The honest summary is that the outbox does not give you ordering;
it gives you a deterministic order to hand to something that does.

**Q8. What is the most expensive mistake in an outbox implementation, and why?** `STAFF`

Purging by age rather than by `published_at`. It feels like routine table hygiene and it
quietly reintroduces the exact failure the outbox was built to prevent: rows the relay
never got to are deleted, the event is lost, and the consumer never hears about the order.
It is invisible because everything downstream is consistent — the orders exist, the
consumers just never got the news — and it surfaces as a reconciliation discrepancy weeks
later, at which point nobody remembers the purge job. The discipline is that the retention
window must exceed the maximum time a relay can plausibly be stalled, a deploy or a
failover or an on-call handover, with margin. Days, not hours. The opposite mistake is
equally real: at 500 events/second and 1KB each that is 43GB of outbox rows per day, so
never purging is a disk incident, which is why the purge must exist — just correctly.

> **CHAPTER 7 SUMMARY**
>
> The dual-write problem is not an implementation bug but the absence of a primitive: there
> is no atomic operation across a database and a broker, and no ordering of write, publish
> and commit avoids either a phantom event or a lost one. The outbox works by making the
> event part of the *database* transaction — the one place atomicity is actually
> available — and relaying it afterwards, which makes **at-least-once the only correct
> outbox semantics** and therefore makes the relay's duplicate the price rather than a bug;
> marking before publishing trades a duplicate for a loss, which is strictly worse. Poller
> versus log tailer is a genuine choice: twenty lines of code with a lag floor, connection
> pressure and write amplification, against near-zero lag and no polling but a stateful
> connector that is now infrastructure with its own on-call. CDC is the only answer when
> the producer cannot be modified, and it brings the physical table structure into the
> contract, so a column renamed for readability breaks consumers nobody knew existed. The
> inbox is the consumer-side counterpart and its two rules are both load-bearing: the
> dedup check **is** the insert against a unique constraint, and it shares a transaction
> with the business write — the alternative orders each lose or repeat work on a crash.
> Three things then get people: ordering, which the outbox does not give you and the
> partition key does; schema evolution, which is harder than API versioning because the
> consumer may not exist yet and a version field cannot be retro-fitted; and the outbox
> table itself, whose metric is the age of the oldest unpublished row rather than its
> count, and whose purge must run on `published_at` — because purging by age silently
> discards the very events the pattern exists to deliver.

#### Further Reading

- [Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) — the canonical description including why the relay can and must duplicate, which is the point most implementations get wrong.
- [Event Log Tailing](https://microservices.io/patterns/data/transaction-log-tailing.html) — the polling and CDC variants of getting rows out of the database, and the trade between them.
- [Idempotent Consumer](https://microservices.io/patterns/communication-style/idempotent-consumer.html) — the inbox half, including the requirement that the dedup record and the business write share a transaction.
- [Debezium documentation](https://debezium.io/documentation/) — the connectors, the initial snapshot, and the schema-change handling; the stateful-connector detail in the deployment section is worth reading before you commit.

## Chapter 8 — Data Ownership, Cross-Service Queries & Caching

### 8.1 Database-per-Service, Stated Properly

Spring Volume 11 §6.2 covers the three consequences at framework altitude. Stated
properly, they are one consequence with three faces, and it is worth naming the single
underlying fact before listing them:

> **A database is a private implementation detail of a service, and the moment another
> service can query it, it is a public API with none of the guarantees of one.**

The three things you lose, honestly:

| Lost | What it was | Where the invariant goes now |
| --- | --- | --- |
| **Cross-service joins** | `orders JOIN customers JOIN inventory` in one statement, one plan, one transaction | Into code: a second query, a denormalised copy, or a projection — each with a latency or staleness cost |
| **Referential integrity** | A foreign key that *cannot* be violated | Into code, into an event-driven check, or into **nobody** — and "nobody" is the common outcome |
| **The transaction** | Atomicity across a business operation | Into sagas (Chapter 6), compensation, and eventual consistency |

The one that gets under-estimated is referential integrity, because it is a *guarantee* and
guarantees do not fail loudly. `order_line.customer_id` pointing at a customer that no
longer exists used to be impossible. Now it is a Tuesday. The check has to be re-invented —
soft delete with a `deleted_at`, an event-driven orphan detector, a periodic sweep — and
each of those is a project that exists because a database constraint stopped existing.

> **PRODUCTION RELEVANCE**
>
> The diagnostic for whether you have really separated the data: **pick a table and ask who
> runs a migration on it.** If the answer involves more than one team, the schema is still
> the API. If the answer is "whoever is on call", ownership is convention. If nobody can
> answer, the data boundary does not exist and the service boundary is a code-layout
> convention. This is the check from Volume 1's migration chapter, and it is the one that
> actually predicts whether the split will hold up under load.

### 8.2 How You Query Across Services — Three Answers

**API composition.** The caller makes N calls and joins in memory.

```text
  GET /order-summary/42   →  orders.get(42)      20ms
                             customers.get(c1)    20ms
                             inventory.get(i1)    20ms
                             pricing.quote(...)   20ms
                          total p50 ≈ 80ms

  ✓ Simple. No new infrastructure. No projection to build or rebuild.
    The projection is in the code, and the code is the documentation.
  ✗ Latency is the SUM. Four calls at 20ms median → 80ms p50, and a
    p99 closer to 400ms because the p99 of a sum is the sum of the p99s.
  ✗ The caller's failure domain is the union. If inventory is down,
    the order summary page is down — and it used not to be.
  ✗ N is unbounded in practice. Every new field a page needs is another
    service on the critical path, and the page is nobody's fault.

  THE BOUNDARY: acceptable with a SMALL N (3-4) and a STRICT budget.
  Not acceptable as a page that needs 8 services, and not acceptable
  for anything on a critical path where the summed tail matters.
```

**CQRS projections.** A denormalised read model maintained by consuming events.

```text
  WRITE side (authoritative)          READ side (projected)
  ┌────────────────────────┐  events  ┌────────────────────────┐
  │ orders, order_line,   │─────────▶│ order_summary          │
  │ customers (each owned  │         │  orderId, customerName │
  │ by their own service)  │         │  customerAddress,      │
  │                        │         │  itemCount, total,     │
  │ normalised,            │         │  stockStatus,          │
  │ constrained, ACID      │         │  updatedAt             │
  └────────────────────────┘         └────────────────────────┘
     1 query, 3 joins                1 query, 0 joins, 1 table

  ✓ ONE fast read. The p99 problem is solved. The read model is
    optimised for the query, which the write model is not.
  ✓ Scales: reads hit a different store, can be replicated, cached,
    or put in a read replica.
  ✗ STALENESS. The projection is behind by the consumer lag, and the
    field it is behind on is a business decision, not a technical one.
  ✗ A projection to build, backfill, rebuild from scratch when the
    logic changes, and keep correct under replay.
  ✗ "WHICH IS TRUE?" — the hard operational question. When a customer
    says their order shows the wrong total, someone has to answer
    whether the write model or the projection is authoritative, and
    the answer must be "the write model" and that must be enforced in
    code, not hoped for.
```

**Data duplication.** Each service keeps the copy it needs, and one system is the named
owner.

```text
  orders-service   owns:   orders, order_line
  customer-service owns:   customers                      ← THE OWNER
  orders-service   holds:  customer_name, customer_address ← A COPY
                        (denormalised, for the hot path)

  THE RULE: one system owns the truth. Everyone else holds a copy
  with a documented refresh mechanism and a known staleness bound.

  ⚠ THE LINE THAT MUST NOT BE CROSSED:
  the moment there are TWO WRITABLE copies, you have a distributed
  consistency problem with no owner, and it is the dual-write bug from
  Chapter 7 wearing a different hat. A copy is a projection. A copy
  that can be written by two systems is a distributed transaction
  that does not know it is one.
```

> **MUST REMEMBER**
>
> Data duplication is legitimate and often the right answer. The rule that keeps it
> legitimate is that **exactly one system owns the truth and the others hold copies**. The
> moment a second system can write the same fact, you have a consistency problem with no
> owner — and the symptom is a field that differs between two databases with no way to say
> which one is right.

**Which one, honestly.** API composition below ~4 calls on a non-critical path. CQRS when
the read is genuinely complex (a dozen joins) or read volume dwarfs write volume, or several
different projections of the same data are needed. Denormalised copy when one foreign key is
on a hot path and a bounded staleness is acceptable. Most real systems use all three in
different places, and the failure is picking one uniformly.

### 8.3 Caching — the Invalidation Problem, Honestly

```text
  CACHE-ASIDE (the default, and the only pattern worth starting with)

  ┌────────┐   miss    ┌──────────┐   hit    ┌────────┐
  │ caller │──────────▶│  cache   │─────────▶│  cache │──▶ data
  └────────┘           └──────────┘          └────────┘
        ▲
        └────── miss → load from DB → populate → return ───────┘

  Writes go to the database, NOT through the cache. That is the whole
  design, and it is why "how do I invalidate?" is the hard question —
  there is no code path that knows when the value changed.
```

**The honest statement about invalidation: there is no correct general invalidation
strategy. There are only heuristics**, and they are:

| Strategy | How | Cost |
| --- | --- | --- |
| **TTL only** | Expire after N seconds | The simplest thing that works, and the one people reach for first. Wrong as a *first* answer, because N is a guess about a staleness nobody chose |
| **Write-through** | Every write updates the cache | Correct, and it puts the cache in the write path — a cache failure becomes a write failure |
| **Event-driven invalidation** | Publish `OrderChanged`, subscribers delete | The good answer, and it adds a consumer, a lag, and a failure mode: the event is lost or delayed, so the cache holds stale data anyway |
| **Key versioning** | A version number in the key; a write bumps it | Effectively "delete by not reading", no deletion needed, and the version must live somewhere durable |
| **Nobody knows** | The unowned cache | A memory leak with a hit rate, and the antipattern below |

> **INTERVIEW TRAP**
>
> "Set a TTL and it will be fine" is the answer that produces a cache that is *correct on
> average and wrong at exactly the wrong moment*. A 5-minute TTL on an order page means a
> user who changes their delivery address sees the old one for up to 5 minutes, and the
> support ticket says "I changed it and nothing happened". TTL is the fallback when you
> cannot know when to invalidate, and it should be the *last* thing you add, not the
> first. What TTL is genuinely right for: bounded-staleness data that is *not* written
> often — reference data, feature flags, geographic lookups — where "eventually" is a
> property of the data rather than a compromise.

**TTL as the wrong first answer, stated properly.** A TTL converts an unknown staleness
into a *bounded* one, which is an improvement, and it does so without asking anyone whether
the bound is acceptable. The specific failure is that a TTL is uniform across keys and
across times: an order read 1ms after a write and an order read 4 minutes after a write get
the same guarantee, and only one of those matters. The better mechanisms are all
*event-driven or version-based* — invalidate on the write, or make the write bump a version
the read checks — and they have their own cost: a dependency from the write path to the
cache, or a version lookup on the read path.

**The unowned-cache antipattern.** A cache that no team owns is a cache whose invalidation
nobody owns either, which is worse than no cache: the unowned cache serves data that is
wrong, and its existence means nobody can remove it to fix the problem. The tell is
askable — **who deletes this key when the underlying row changes?** If the answer is
"the TTL", the answer is "nobody, and eventually", and that is a data-correctness decision
being made by a config value. The Volume 11 version of this antipattern is worth pairing
with: the same question applied to a whole cache layer.

### 8.4 The Two Things That Make a Cache a Correctness Problem

These are the two that stop being performance issues, and both are tenant-related in a way
that is easy to miss.

**1. A cache shared across tenants.**

```text
  ⚠  THE TENANT LEAK
  ─────────────────────
    cache key:  "customer:42"
    cache value: { name: "Jane", tier: "enterprise" }

    Tenant A requests customer:42  →  populated
    Tenant B requests customer:42  →  HIT. Same key, same value.

  The cache does not know tenants exist. It is a key-value store and
  your key did not say whose data this was.

  THE FIX IS TRIVIAL AND NON-NEGOTIABLE: the tenant must be in the key.
    "tenant:{tenantId}:customer:42"

  ⚠ AND THE WORSE VERSION: the key omits the tenant AND the value
    contains a list scoped to one tenant. Now you have served tenant A's
    order list to tenant B, and it is not a bug report, it is a breach,
    and the cache is where you will not find it because the cache is
    "working perfectly".

  ⚠ AND THE SUBTLEST VERSION: a shared cache key for a GLOBAL object
    (a currency rate, a tax table) is fine, but a global key that gets
    *overwritten* with tenant-scoped data is not. Enforce the invariant
    structurally — a CacheKey value object that takes a tenantId in its
    constructor, rather than a convention.
```

This is worth a disproportionate amount of interview attention because it is a
correctness *and* security bug that looks like a performance optimisation, and because the
fix is so cheap that not doing it is indefensible.

**2. Negative caching.** Caching a *miss*.

```text
  ⚠  WHY NEGATIVE CACHING EXISTS
  A lookup for a non-existent key hits the database every single time.
  Under a bot scan or a bad client, that is a trivially available
  denial-of-service amplifier against your database.

  ⚠  WHY IT IS DANGEROUS
  Caching "not found" for 60 seconds means: create the customer, then
  immediately GET them, and you get a 404. The user typed the name,
  you created the account, and the system says it does not exist.

  The window is bounded by the negative TTL, and the consequence is that
  every read-your-write path through the cache is now broken. If the
  login flow checks the cache after signup, the user cannot log in for
  the TTL duration.

  ⚠ THE RULE: negative entries get a MUCH shorter TTL than positive
  ones (seconds, not minutes), AND the cache must be invalidated
  explicitly on create. The standard trap is a create path that writes
  the entity but forgets to delete the negative key — which is why the
  invalidation belongs in one place, not in every caller.
```

#### Common Mistakes

- Treating referential integrity as covered because the data is "clean" today, and
  discovering it is not when a customer is hard-deleted.
- API composition with eight services on the critical path, whose p99 is the sum of eight
  tails and whose failure domain is the union of eight.
- Two writable copies of the same fact, and no way to say which is right.
- A cache key that omits the tenant, in a multi-tenant system.
- Negative caching with the same TTL as positive caching.
- TTL as the first and only invalidation strategy on data that is written.
- A cache with no named owner, which is a memory leak that serves wrong answers.
- A CQRS read model with no answer to "which one is true" when they disagree.
- Reading from a cache immediately after a write, in a checkout or a settings-save flow,
  without a read-your-writes policy for that specific read.

#### Interview Questions — Data Ownership, Cross-Service Queries and Caching

**Q1. You have adopted database-per-service. What did you actually lose?** `STAFF`

Three things, and they are one fact seen three ways: a database is a private implementation
detail, and the moment another service can query it, it is a public API with none of the
guarantees of one. Cross-service joins are gone, so a query that joined orders to customers
now needs a second call, a denormalised copy, or a projection. Referential integrity is
gone, and this is the one people underestimate because it is a *guarantee* and guarantees
fail quietly — an `order_line.customer_id` pointing at a deleted customer used to be
impossible and is now a Tuesday, so the check has to be reinvented as a soft delete or an
event-driven orphan detector or a sweep, and "or nobody" is the common outcome. And the
transaction is gone, so every business operation spanning services needs a saga. The
diagnostic for whether you really separated the data is to name the team that runs a
migration on a given table.

**Q2. A page needs data from five services and takes 400ms at p99. What do you do, and
what is the trap?** `STAFF`

The trap is reaching for parallelism. It takes the p50 to 20ms and multiplies the load on
every downstream service by five, puts five concurrent calls in front of each downstream
service's connection pool, and makes your p99 a function of five services' health rather
than one. The real problem is that five services on a page means the page is a composition
by accident, and the p99 is the sum of five tails. The fix is to make it one: a CQRS
projection maintained from events, so the page reads one denormalised table with one query
and no joins. The price is staleness bounded by consumer lag, a projection to build,
backfill and rebuild, and an operational answer to "which one is true" when the projection
disagrees with the write model. Below about four calls on a non-critical path, API
composition is still the right answer, and the honest framing is that the number is a
budget decision rather than a rule.

**Q3. When is CQRS justified, and how do you know you are adopting it for the wrong
reason?** `STAFF`

It is justified when the read is genuinely complex — a dozen joins that the write model
cannot serve without a horrible plan — when you need several projections of the same data,
when read volume dwarfs write volume by a large factor, or when an event stream already
exists and the projection is a natural consequence of it. It is a data-migration project in
disguises when it is adopted to fix one slow query: you inherit a projection pipeline, a
backfill, replay correctness, drift between the read and write models, and a situation
where every new query is a change to a pipeline rather than to a repository. The honest
test is whether you would build the read model even if the database were fast. If yes,
CQRS is earning its cost. If the answer is "no, but Hibernate is making this one screen
slow", the answer is a better query.

**Q4. Is a cache worth the staleness it introduces?** `STAFF`

Only if the staleness is a bounded, measured, business-accepted number on specific reads
— and the honest version of this question is per-read, not per-system. I would not put a
cache in front of anything a user would call a bug when stale: a balance, an order status,
a permission check, a price at checkout. I would put it in front of reference data, feature
flags, and read-mostly reference data where "eventually" is a property of the data. The
specific design point I would insist on is that invalidation is event- or version-driven
rather than TTL-driven for anything the user can write, because a TTL is uniform across
keys and times and the staleness only matters in a small window. And the reason I would
insist on that is the two failure modes that make a cache a correctness problem: a key that
omits the tenant, and negative caching with a long TTL, which breaks read-your-write on
every create.

**Q5. A multi-tenant system caches customer details. What is the single most important
review question?** `STAFF`

Does the cache key contain the tenant, structurally rather than by convention. A key of
`customer:42` shared across tenants is a data breach, not a performance bug, and it is
easy to miss because the cache is working perfectly — every test that uses one tenant
passes. The worse version is a global key whose *value* contains tenant-scoped data, like
an order list, where the leak is not "wrong value" but "someone else's records". The fix is
a `CacheKey` value object that takes a `tenantId` in its constructor, so the key cannot be
constructed without one, rather than a naming convention a reviewer has to remember. And
the version that reaches production without anyone noticing is a global key for a genuinely
global object that later gets *overwritten* with tenant-scoped data.

**Q6. Why is negative caching dangerous, and when is it right?** `TRICKY`

Because it breaks read-your-writes on every create for the length of the negative TTL. A
user signs up, the account is created, and the login flow then looks the account up, gets a
cached miss, and tells the user it does not exist — for the whole TTL window. The user's
experience is that signup silently failed. It is still worth doing, because a lookup for a
non-existent key hitting the database every time is a trivially available amplification
attack against your primary, and bots will find it. The rules that make it safe: the
negative TTL is much shorter than the positive one — seconds, not minutes — and the create
path must explicitly invalidate the negative entry. The trap is that the invalidation
belongs in one place rather than in every caller, because the caller who forgets is the
one whose bug is a user who cannot log in.

**Q7. How do you decide what is authoritative when a projection and a write model
disagree?** `STAFF`

Decide it before it happens, in code, and write it down. The answer is always that the
write model is authoritative and the projection is eventually correct, and the value of
deciding it in advance is that the operational runbook for a customer complaint becomes a
one-line lookup — "rebuild the projection for order 42" — instead of a debate. The
enforcement matters as much as the statement: the projection's refresh path should be
idempotent and re-runnable from an event offset, so "resync" is a normal operation. What
you must never do is let a support engineer "fix" the projection by editing it, because
then there are two writers and the next event overwrites the manual correction. And if the
disagreement is systematic rather than a lag artifact — which the data should tell you —
the real answer is that a read has been migrated to the projection that is not allowed to
be stale.

**Q8. You have a service whose data is read by four other services. How do you manage
that, and what is the line?** `STAFF`

Denormalised copies with one named owner, which is legitimate and usually right — four
services calling your API on a hot path is a latency and availability problem, and a copy
of a customer name in the orders database is a bounded staleness problem. The line is that
exactly one system writes the fact and the others hold copies with a documented refresh
mechanism and a known staleness bound. The moment a second system can write the same fact,
you have a distributed consistency problem with no owner — and the symptom is a field that
differs between two databases with nobody able to say which is right, which is the
dual-write bug wearing a different hat. The practical enforcement is a schema permission or
a lint rule that stops another service writing your table, and a contract on the copy: what
it is for, how fresh it is, and what a consumer is allowed to use it for.

> **CHAPTER 8 SUMMARY**
>
> Database-per-service removes three things and replaces each with a project: joins become
> a second call, a denormalised copy or a projection; referential integrity becomes a soft
> delete, an event-driven orphan check or — the common outcome — nothing; and the
> transaction becomes a saga. Referential integrity is the one that costs least to lose on
> paper and most in practice, because it is a *guarantee* and guarantees fail quietly. The
> diagnostic that tells you whether the data is really separated is simple and worth
> asking in every review: **name the team that runs a migration on this table** — more than
> one answer means the schema is still the API. Cross-service queries have three honest
> answers and they are not interchangeable: API composition, which is fine below about
> four calls and puts the summed tail and the union failure domain on the caller; CQRS
> projections, which solve the read and cost staleness, a projection to rebuild, and a
> "which one is true" question that must be answered in code before it is asked at 3am;
> and duplication, which is legitimate under one rule — **exactly one system owns the
> truth** — because the moment two systems can write the same fact you have a consistency
> problem with no owner. Caching is then the last consistency mechanism you add, and the
> honest statement is that **there is no correct general invalidation strategy, only
> heuristics**; TTL is the fallback for data you cannot invalidate on, not the first answer
> for data a user can write. Two things turn a cache from a performance concern into a
> correctness one, and both are cheap to prevent: a key that omits the tenant, which is a
> breach rather than a bug, and negative caching with a long TTL, which breaks
> read-your-writes on every create and tells a user who just signed up that they do not
> exist.

#### Further Reading

- [Database per Service](https://microservices.io/patterns/data/database-per-service.html) — the consequences of the split stated as a pattern, and the clearest short statement of the join problem.
- [CQRS](https://microservices.io/patterns/data/cqrs.html) — the read/write split, and the failure modes of maintaining the projection — the honest section is more useful than the diagram.
- [API Composition](https://microservices.io/patterns/data/api-composition.html) — the simplest cross-service query answer and its exact limits, including where the latency sum stops being acceptable.
- [Microservices Patterns](https://www.manning.com/books/microservices-patterns) — the book-length treatment; the database-per-service and CQRS chapters show how the trade compounds with scale.

---

### End of Volume 2

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Correct the "pick two of three" CAP answer, explain why partition tolerance is not a
  choice, and state what PACELC's **else** branch adds that CAP does not.
- Say what availability means precisely under CAP, and why "we chose AP" is frequently a
  description of a database's default replication mode rather than a decision.
- Draw the consistency spectrum from linearizable to eventual, and for each rung name what
  it forbids, what it costs in latency, and how much of your code has to know it exists.
- State the one number: moving from eventual to read-your-writes costs a primary route or
  a version token, and nothing else.
- Explain why exactly-once delivery does not exist at the network level, and what
  at-least-once plus an idempotent consumer actually gives you.
- Design an idempotency key scheme: who generates it, what is stored, how long the TTL
  lasts, and why the database's unique constraint is the only atomic dedup.
- Distinguish a `200` with an error body from a faithful status code, and say what each one
  does to your retries, your dashboards, and your 3am.
- Choose Kafka, RabbitMQ or NATS for a workload, using "do you need replay, and do you need
  ordering" as the two questions — and say why ordering is per partition, not global.
- Explain why a saga stuck in a non-terminal state needs a sweep rather than a retry, and
  why compensation is business logic rather than rollback.
- State the dual-write problem and why the outbox is the only ordering of steps that does
  not lose or phantom an event — and why the relay's duplicate is the price, not a bug.
- Answer "which one is true" when a projection and a write model disagree, and what makes
  that answer enforceable rather than aspirational.

### Coming in Volume 3 — Operations, Platforms & Evolution

Volume 2 ended at the boundary of the service: how they talk, what guarantees they give,
and where the data lives. Volume 3 starts on the other side of that boundary — what happens
when one of them is unhealthy at 3am. Observability and alerting on the systems built in
this volume, resilience and the failure cascades they produce, the deployment and platform
story (Kubernetes, service mesh, and what a mesh does and does not buy), scaling and
capacity, the antipatterns that emerge when the patterns here are combined badly, and how a
microservices estate evolves over years rather than quarters.

## Chapter 9 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). This bank is deliberately **D-weighted**: the design
questions are what separate a candidate who has configured these patterns from one who has
operated them, because operating them is what produces the judgement to decline them.

### CAP and the Consistency Spectrum

**D1. Is exactly-once achievable between two services?** `STAFF`

Not at the network level, and the distinction that earns the marks is between *delivery* and
*effect*. Delivery is at-least-once because a sender that times out cannot distinguish a
lost message from a lost response, and that ambiguity is not resolvable from the sender's
side. What is achievable is effectively-once: at-least-once delivery into a consumer that
is idempotent. Kafka's transactional API gives exactly-once for a read-process-write cycle
inside Kafka's own boundary, which is real and useful, and it does not extend to your HTTP
API, your email, or a message that left the broker and hit a third party. I would add that
it is a guarantee held by a configuration that spans every hop, and a participant that
opts out for performance does so silently.

**D2. "We chose AP." What questions do you ask?** `STAFF`

Which write did your system accept during the partition, and where did it go — because if
the answer is "the primary", the system is CP with lag, not AP, and the label is wrong.
What is the actual replication mode of the store you run, since a single-writer primary
with async replicas is the opposite of AP. And have you ever partitioned it, or is "we are
AP" a statement about the network rather than a design? The failure I look for is a team
using the label to justify a read replica while believing their writes stay available
during a partition.

**D3. How do you decide which reads need read-your-writes?** `STAFF`

By asking which stale reads a user would report as a bug rather than which is easiest to
implement. A stale product photo is cosmetic; a stale delivery address at checkout is a
refund, and a stale inventory count is an oversell. The right answer is a short explicit
list — balance, order status, permission check, write confirmation, price at checkout —
rather than a global policy, because a system is not eventually consistent; a *query* is,
and only a handful of queries are bugs when stale. The mechanism for each is either routing
that read to the primary or returning a version token and escalating on mismatch, and the
second is cheaper at scale while costing an API commitment you cannot easily take back.

**D4. Would you make the user-facing part of a checkout asynchronous to decouple the
payment service?** `STAFF`

No, and I would want to know what problem it is solving. If payment is down, making the
call async converts a clear, immediate failure — the user knows their card was not charged —
into an ambiguous state where they are told "we are processing your order" and may be
charged later or not at all, and the support burden moves from engineering to the contact
centre. The decoupled version of this is the queue *behind* the synchronous authorisation:
take the payment synchronously, enqueue the receipt, the loyalty points and the analytics
asynchronously. That gives the availability benefit where it is safe and keeps the user's
immediate question answered. If the real problem is the latency, then the problem is the
call count, and the fix is fewer or coarser calls.

**P1. After a regional network partition, one side of your platform accepted order writes
for eleven minutes and then had to reconcile 4,000 orders. What is your diagnosis?**
`SCENARIO`

The minority side was serving writes during the partition, which is a split-brain: two
diverging truths and a reconciliation that nobody designed because the failure had not been
imagined. Most systems that describe themselves as available are actually
read-available-and-write-unavailable under partition, because serving stale *reads* is a
small explicable harm while serving *writes* from both sides is not. The immediate fix is
to stop accepting writes and to take the written set seriously rather than discarding it —
4,000 orders is real money and real customer expectations. The durable fix is a fence: a
monotonic epoch or a leader lease so the minority side can detect it is not the writer and
refuse. The prevention is to test partition behaviour, because a system that has never been
partitioned has a network, not a design.

**T1. A client writes to the primary, then immediately reads through a replica with 900ms
of lag. What does the user see, and which guarantee was broken?** `TRICKY`

The user sees the pre-write state — a 404 on an order they just created, or the old value of
a field they just edited. The guarantee that broke is read-your-writes, and it was never
provided in the first place: replica reads give you monotonicity at best and nothing about
the client's own writes. It is worth being precise that this is not a rare edge case; it is
the single most common "how did this happen" report in any system with read replicas, and
it is not a bug in the replica — it is working exactly as configured. The fixes are
session stickiness to the primary for a window after a write, a bounded lag check against
a real lag signal, explicit version tokens, or permanently routing the hot aggregates to the
primary.

### Idempotency

**D3. Is idempotency a technical decision or a business decision?** `STAFF`

The TTL is a business decision and the rest is technical. "How long do you keep the key"
translates to "how long can a client legitimately be confused", and the engineering
constraint is the client's retry window, which is measurable from its retry policy and its
total budget. The framing that makes it tractable is *longer than the retry window and
longer than the client's timeout*, and the teams who get hurt are the ones who picked 24
hours for a system whose mobile clients retry for a week. The operational cost is a table
that only grows — a payments API at 200 requests/second with a 7-day TTL holds around 120
million rows — so the retention needs its own index and its own job.

**P2. 1,847 customers charged twice over eleven weeks; the duplicate was found by a
customer. What is the postmortem?** `SCENARIO`

Problem: roughly £31,000 of duplicate charges, discovered by a customer rather than by
monitoring. Investigation: the payment service had a client library retrying on any 5xx
with three attempts; a rolling deploy three weeks in caused connection resets; the server
had already committed the charge and begun writing the response before the pod was
recycled, so the client saw a 5xx and retried. There was no idempotency key on the
endpoint and the handler was `charge(); insert(); return` with no guard on any transition.
Root cause: a retry policy with no idempotency meeting a response that could be lost after
the commit — the retry was not the bug, the retry *without* a key was. Solution: an
idempotency key with the stored response replayed, plus nightly reconciliation against the
processor's records which identified and refunded every duplicate automatically.
Prevention: idempotency keys required on any endpoint that moves money, enforced in review;
a guarded state machine so a duplicate is a no-op even if the key is lost; and a
reconciliation job that alerts on any discrepancy rather than filing a ticket.

**S1. A PR adds `if (!processed.contains(id)) { doWork(); processed.add(id); }` to a
consumer. What is the review comment?** `STAFF`

Two problems in four lines. The check-then-act is a race: two consumers on two threads can
both see "not processed" and both do the work, and the failure surfaces as a
`DuplicateKeyException` *after* the damage, so you cannot roll it back. And the ordering is
wrong — the work happens before the record, so a crash between them repeats the work on
redelivery. The review comment: the "have I seen this" check must *be* the insert, against a
unique constraint, and the inbox record and the business write must be in one transaction.
If the domain has a natural state machine, the stronger fix is a guarded transition, which
cannot be defeated by a lost key or an expired TTL.

**T2. A client sends a request with idempotency key K. The server commits the business
write and then crashes before writing the stored response. What happens on retry with K?**
`TRICKY`

It depends on whether the stored response is in the same transaction as the business write.
If it is, the crash rolls back both, so the key is not committed and the retry executes
freshly — which is the correct outcome and the reason the response record must share the
transaction. If the response is written separately, the key exists with no response, and
the retry finds a key whose recorded state is "in flight" with no result, which is the
ambiguous case you must handle explicitly — either by waiting and re-reading, or by
treating an in-flight key past a timeout as failed and allowing a retry. The first design
is strictly better because it removes the ambiguous state entirely.

### Sync Communication and Contract Design

**D4. REST or gRPC for this boundary?** `STAFF`

The decision is mostly organisational. gRPC when both ends are yours and you control the
language: schema-first, generated clients that fail to compile against a broken contract,
three to ten times smaller payloads for typical structured messages, and streaming that
REST cannot express. REST when either end is a browser, a third party, or a team you do not
share a language with — and the honest reason is not that gRPC is worse there, it is that
a schema you own is a compatibility promise with a deprecation process attached, and a
contract with a third party is a negotiation you will probably lose. Real systems end up
with both, which means two contracts to version, so I would want the gRPC adoption to be
justified by something REST genuinely cannot do.

**D5. A page makes 1,800 calls and takes 14 seconds. Parallelise it, or redesign it?**
`STAFF`

Redesign it. Parallelising takes the p50 to 20ms and multiplies the load on every downstream
service by 1,800, puts 1,800 concurrent requests in front of a service that might have 20
database connections, and makes your p99 a function of 1,800 services' health instead of
six. The real problem is that the contract is chatty — a cross-service N+1 — and the
diagnostic that proves it is requests per inbound request in the access log, which is far
better than latency. The fix is a batch endpoint or a filter-by-ids query, verified to do a
real `WHERE id IN (...)` with a cap, because a batch implemented as a loop inside the server
moves the N+1 rather than removing it and an uncapped `?ids=` on a 10,000-line export is its
own outage. At very high volume the answer is a projection, but that is a bigger project
than this problem needs.

**P3. The order-detail page's p99 goes from 1.2s to 14s with no deploy and no traffic
increase. CPU and the database are both normal. First thing to check?** `SCENARIO`

The access log for a single request. If it shows thousands of entries, this is an N+1
across a service boundary and the latency is structural rather than load-related. I would
expect a recent change that made this worse by *appearing* to fix it — a lazy JPA fetch
replaced with an explicit client call per line, which moved the N+1 one hop outward. The
reason nothing alerted is that every one of those thousands of sub-calls succeeded, so this
is invisible to error-rate monitoring and only visible in a per-request call count. The
immediate mitigation is a bulkhead on the downstream clients so a page view cannot exhaust
the thread pool, and the real fix is the batch endpoint.

**S2. A PR removes a field from a REST response because "nobody uses it". What is the
review question?** `STAFF`

Who checked? A removal is breaking even if nobody reads the field, because "nobody reads
it" is a belief rather than a measured fact, and the cost of being wrong is a deploy to
every consumer at a time you do not choose. The review should ask for evidence — a usage
metric from the gateway over a representative window, or a contract test in each consumer's
CI. The related question is what the compatibility gate is: if there is a provider-side
OpenAPI diff and consumer-side Pact tests, the removal fails the build and this PR never
arrives. If the answer is "we check in the wiki", then the review is doing the tool's job
by hand and will eventually miss. And the version-shaped version of this: if you are adding
v2 rather than removing a field, what is the date v1 dies?

**T3. A protobuf service adds a new enum value. What happens to an older client during a
rolling deploy?** `TRICKY`

Enum values are integers on the wire, so the older client deserialises it as an unknown
integer. Whether that is an outage depends entirely on the older client's code: if it has a
`default:` branch that logs and continues, you get a degraded but live system; if it throws
on unknown values — which JSON and Java enum deserialisers do by default — every message
carrying the new value fails on that client. So the deploy is safe only if you have
deliberately made unknown enum values non-fatal, which is a change you need to make *before*
you add the value. The other direction of the same trap is field numbers: renaming a field
at the same number is non-breaking, changing the number compiles cleanly on both sides and
silently empties the field.

### Async Communication and Event-Driven Architecture

**D6. Kafka or RabbitMQ for this workload?** `STAFF`

Two questions, in order. Do you need to replay the stream — and that is the expensive one
to get wrong, because it is the difference between a broker and a log, and a log is
architecture rather than a config flag. A RabbitMQ user who later needs replay is looking
at a broker migration with topic names and routing that have become load-bearing
everywhere. If replay is possible, Kafka or NATS JetStream. If the queue genuinely is the
interface — delivered once, forgotten, with rich header-based routing — RabbitMQ is better
and the log is over-engineering. Second: do you need ordering, and note that Kafka gives it
per partition only, so the real answer is "I need a partition key and an order-aware
consumer". Global ordering is not on the menu for any of them. NATS is the answer at
sub-100-microsecond latency across a large service mesh, where core NATS's simplicity is
itself the feature.

**D7. A team publishes `CustomerUpdated` with the full 40-field customer object to twelve
consumers. What would you change?** `STAFF`

The event shape, and the reason is not elegance. A full-object event means every
consumer depends on the shape of all 40 fields, so adding a field changes the contract for
twelve teams, and — worse — any consumer that reads a field it should not now has a runtime
dependency on data you did not mean to expose, like an internal risk score or a fraud flag.
The event has become an accidental API with a confidentiality problem attached. I would
replace it with purposeful, nameable facts: `customer.email-address-changed` with the
customerId, previous, new, version and timestamp. The test I would apply to any event
review is whether a consumer can explain what it is for without opening the payload — if it
needs the schema reference, the event is a noun rather than a fact.

**D8. When does an event become a remote procedure call in disguise?** `STAFF`

When the payload contains verbs and booleans describing what the recipient should do —
`{ cancelReason, notifyCustomer: true, refundAmount, restockInventory: true }`. You have
built an RPC with extra steps: the producer now knows what every consumer does with it,
adding a step is a coordinated deploy, the consumer's logic is invisible to everyone
including the producer, and the event cannot be broadcast to an unforeseen consumer
because it is an instruction aimed at one recipient. The diagnostic is grammatical — a
fact is nouns and values describing what happened, a command is verbs and flags describing
what should happen next — and the useful secondary test is whether you could safely add a
second consumer. If adding a consumer requires a producer change, you wrote a command.

**P4. Consumer lag is 2.1 million and growing; throughput is flat and the error rate is
zero. What is happening?** `SCENARIO`

Flat throughput with rising lag means the consumer is stuck, not slow — a poison message, a
deadlock, or a downstream that never returns — and adding consumers makes it strictly
worse because you multiply the instances failing on the same message. The zero error rate is
consistent with this: the consumer is not erroring, it is not progressing. The diagnosis
order is DLQ depth, the timestamp of the last successfully processed offset, and thread
dumps. If throughput is *rising* but still below the arrival rate, it is slow, and then the
question is consumer count versus partition count: below the partition count you add
consumers, at the partition count more instances do nothing and you need more partitions, a
faster consumer, or a topic split. A high average with a low maximum lag means a skewed
partition key, which no amount of scaling fixes.

**S3. A PR sets `spring.cloud.stream.kafka.binder.max-poll-records: 5000` to "improve
throughput". What is the review comment?** `STAFF`

Batch size is a lease-renewal constraint, not a throughput knob. The consumer must
complete a poll cycle within `max.poll.interval` — 300 seconds by default — or the broker
revokes its partitions. 5,000 records at 200ms each is 1,000 seconds, which guarantees a
revocation, and revocation causes every other consumer in the group to rebalance and
reprocess, which raises load, which makes processing slower, which causes another
revocation. The storm is self-sustaining. Throughput comes from the number of consumers and
the partition count, never from making one consumer's batch so large it cannot renew its
lease.

**T4. A producer publishes with a null key. What is the ordering guarantee for events
about the same order?** `ADVANCED`

None, and this is the default, which is why people are surprised. A null key means
round-robin partition assignment, so `OrderCreated` and `OrderShipped` for the same order
can land in different partitions and be delivered to the consumer in either order. The
guarantee the system actually provides is only per-partition ordering, so the consumer must
be order-independent or version-aware regardless. The fix is the aggregate id as the
partition key, which puts one aggregate's events on one partition and therefore in order
— at the cost that two aggregates are unordered with respect to each other, and at the cost
that changing the partition count later re-keys everything and is therefore a data
migration rather than a scale button.

**S4. A PR adds a topic per entity change with the full entity as the payload. What is the
review comment?** `STAFF`

That this is the nouns-as-events antipattern and it makes the topic list a second, hidden
copy of the domain model that every consumer must understand. Adding a field to an entity
becomes a change to every consumer's contract, and a consumer that reads a field it should
not acquires a runtime dependency on data that was not meant to be exposed. The review
should ask for the event to be named after what happened rather than what changed — an
entity name plus a change type is a noun; a domain fact is a sentence — and for the payload
to be limited to the fields the fact is about. If the payload genuinely needs everything,
that is a signal the consumer wants to call the API instead, and the conversation is about
latency and availability, not about event shapes.

### Messaging in Spring

**P5. A team scaled a Kafka consumer from 2 replicas to 12 and throughput did not change.
Why, and what is the durable fix?** `SCENARIO`

Consumer parallelism within a group is capped at the topic's partition count — the broker
assigns each partition to exactly one consumer, so with 2 partitions, 2 instances get an
assignment and 10 sit idle. It looks like a performance problem and it is a configuration
fact. The durable fix is to repartition the topic, which is a data migration with its own
rollback, and then scale the consumers to match. The prevention is a dashboard panel showing
consumer count against partition count, a lag alert based on lag *rate* rather than
absolute value, and a runbook entry that says "check the partition count before you scale",
because in every instance of this incident the operator's first instinct is the one that
cannot work. The sizing heuristic is to provision partitions for the maximum consumer
parallelism you will ever want, because going from 2 to 30 consumers later is a migration,
not a button.

**D9. `read_committed` plus a transactional producer — are we exactly-once?** `STAFF`

Within Kafka, yes, and it is a real guarantee: reads see only committed data, and the offset
update and the output write commit atomically. It does not extend to the business
transaction, because your database has a different journal and nothing coordinates them. The
failure sequence is concrete: the consumer writes to Postgres, then crashes before the Kafka
transaction commits, so Kafka rolls back the output and does not commit the offset, the
message is redelivered, and the database write happens again. Exactly-once for Kafka,
exactly-once for the offset, duplicate in the database. And it is a guarantee held by a
configuration spanning every hop — a consumer that changes its transaction settings for
performance has opted out, silently. The fix is not a different isolation level; it is a
dedup record in the same transaction as the database write.

**S5. A PR leaves `contentType` unset on a binding. What is the review comment?** `STAFF`

That the serialization format of the event has been decided by a classpath rather than by a
person. The failure mode is silent: a consumer expecting a raw string receives a typed
object and produces a null or a class-cast exception three layers down, and the DLQ fills
with messages that are perfectly valid JSON, which is a miserable thing to diagnose. Two
related risks: content type is often carried in a header, and a schema registry enforcing
compatibility on the payload will not catch a consumer that changed its expected type; and
the default Java serializer is positional, so adding a field to the class is itself a
breaking change for every deployed consumer. Content type is part of the contract exactly
like the topic name.

**T5. A consumer with `maxPollRecords: 500` takes 900ms per record under load. What
happens?** `SCENARIO`

500 records at 900ms is 450 seconds per poll cycle, which exceeds the 300-second
`max.poll.interval`, so the broker concludes the consumer is dead and revokes its
partitions. Every other consumer in the group rebalances and starts reprocessing from its
last committed offsets, which raises load across the fleet, which makes processing slower,
which causes another revocation — the rebalance storm is self-sustaining and throughput
falls rather than holding flat. The fix is to reduce `max.poll.records` to a value that
keeps the poll cycle well inside the interval, and to get throughput from consumer count
and partition count instead.

### Sagas

**D10. Choreography or orchestration, and what would make you switch?** `STAFF`

Orchestration at four or more participants, or the moment one participant has two flows
that must behave differently depending on which event started them — because at that point
the participant needs to know the whole event graph, and that is precisely the coupling
choreography was supposed to remove. The cost I accept with orchestration is that the
coordinator is a distributed system component: it must be available, hold durable state,
have a lease or leader election so two instances cannot drive the same saga, and expose an
operator view of in-flight sagas. Choreography is right at two or three participants with a
single flow, where the event graph is small enough to hold in your head and the coupling
has not yet accreted. The thing that would make me switch is compensating a saga by hand
in production at 3am, because that experience changes the team's risk tolerance permanently
and no amount of design discussion will.

**D11. Why is a compensating action not a rollback?** `STAFF`

Because a rollback undoes a write and a compensation is a new forward business action. You
cannot un-send an email — you send a correction. You cannot un-charge a card — you issue a
refund, a separate financial transaction that may take days. You cannot un-dispatch a
parcel — you cancel, and it may be in a van. Three consequences follow, and all three are
routinely un-planned. Compensation can fail, so it needs its own retry budget and its own
idempotency, and exhausting that budget must raise an alert rather than a log line.
Compensation is not instantaneous, so the ledger is knowingly inconsistent with reality for
days, and any reconciliation assuming atomic saga closure will produce false alerts
throughout. And compensation is a different code path that only runs when things are
already broken, which makes it the least tested and most urgent code in the system — a
compensation never exercised is an assumption, not a mechanism.

**P6. A saga has been in `COMPENSATING` for four hours and every component is healthy.
How did that happen and what was missing?** `SCENARIO`

The compensation failed — a downstream was down, a refund API errored, a deadline was
exceeded — and the retry budget was exhausted with the exception swallowed into a log line.
No component is unhealthy, so nothing alerts. The saga is not progressing and will not
recover on its own, and it is invisible until someone happens to query for it. What was
missing is a sweep: any saga in a non-terminal state past its deadline should be an alert
rather than a metric, and there should be an operator view listing in-flight sagas by state
and age with the last error. The specific design gap is that the *intent* is not persisted
before the outbound call, so recovery cannot distinguish "not started" from "started,
outcome unknown" — with the intent persisted, a stalled saga is retryable and a saga that
is stuck is a query, not a mystery.

**S6. A PR changes a saga step to call a participant without a timeout. What is the
review comment?** `STAFF`

That the saga's own deadline is now unbounded by its slowest step, which is the failure in
P6's sibling: a saga that runs longer than the caller's timeout means the client gives up
and retries, producing a second saga for one order. A step timeout is not just hygiene — it
is a budget allocation from the saga's total deadline, which must itself be shorter than the
gateway's, which must be shorter than the client's. And the step must be idempotent, because
a timed-out call whose outcome is unknown is retried on recovery, and if the timeout is
merely "we gave up waiting" rather than "it definitely did not happen", the retry is a
duplicate. Related: a step that takes longer than the consumer's `max.poll.interval` needs
the consumer reconfigured, not just the client timeout.

**T6. A client times out on a saga and retries with the same correlation id. What should
happen?** `TRICKY`

The second attempt should find the existing saga and either return its state or attach to
it, and the mechanism is a unique constraint on an idempotency key checked atomically at
saga creation — an insert, not a select-then-insert, because two retries can race. If the
saga is still running, the client gets a "still in progress" with a status URL rather than
a second saga. If the saga has already completed, the client gets its result. This requires
the status endpoint to be part of the contract rather than an operational extra, because a
client that cannot look up its own saga is a client that will start another one. If the key
is not unique, you get two sagas, both reserve inventory (one wins the guard), and both
attempt a payment authorisation.

### Outbox, Inbox and CDC

**D12. Poller or Debezium?** `STAFF`

A poller below a few thousand events per second with a half-second latency requirement,
because it is twenty lines of code, deploys with the application, and adds no
infrastructure. Its costs are a lag floor equal to the poll interval, connection pressure
on the primary while the broker call is in flight — three pollers at batch 100 on a
20-connection pool is a real exhaustion risk — and a write per published row on the same
database as production traffic. The log tailer wins above that volume or below that
latency, and it is the only answer when the producer cannot be modified at all. The cost of
the log tailer is that Debezium becomes infrastructure with its own deployment and on-call,
and the connector is *stateful*: its offset store holds the LSN, and losing it means either
a replay storm at every consumer or skipped data, so restoring it is an operational
procedure rather than a config change. Choosing it for elegance on a low-volume system is
how you acquire a stateful connector's operational surface for no benefit.

**D13. Debezium or an outbox table, and what breaks with CDC?** `STAFF`

With CDC you skip the outbox table entirely and the producing service writes to its
database as it already does, which is the whole appeal and the whole reason it exists —
legacy systems and fleets that would need code changes everywhere. What breaks is that
schema changes flow through the same stream, so a `DROP COLUMN` becomes an event consumers
cannot deserialise, which turns a migration into a distributed schema change with an
ordering problem attached. And consumers now depend on the *physical table structure* rather
than a published contract, so a column renamed for readability breaks consumers nobody had
on record. The discipline is the same either way — expand/contract, add, deploy every
reader, verify by usage metric, then drop as a separate event in time — and a schema
registry gives you compatibility checking on the event schema but not on the table.

**P7. An order was created, no event exists, and the outbox table shows 40 million rows.
What is the first thing to check?** `SCENARIO`

The age of the oldest unpublished row, not the count. Forty million rows might be a healthy
backlog on a busy topic or a relay that died a week ago, and the count alone cannot tell you
which — but the age of the oldest unpublished row *is* the number of minutes of event loss,
and it is the number to alert on. If the relay is dead, the next check is whether it is
scheduled on one instance or all of them, and whether the query has the index — a relay
doing `WHERE published_at IS NULL ORDER BY created_at` on a table this size without a
partial index is doing a sequential scan on your primary every poll. The secondary concern
is that 40 million rows means the table is not being purged, and the purge must run on
`published_at` in bounded batches, never by age, or you will delete unpublished events and
reintroduce exactly the dual-write failure the outbox exists to prevent.

**S7. A PR adds `inboxRepo.save(messageId)` after the business write, in a separate
transaction. What is the review comment?** `STAFF`

Both halves are wrong. A crash between the business write and the save repeats the work on
redelivery, which for a payment or a stock decrement is a duplicate — the record has to be
written in the same transaction as the change, and it has to be written *first* within
that transaction so a failure in the business logic rolls it back. And the check is a
`save`, not an `insert` against a unique constraint, so two consumers on two threads both
pass a preceding existence check and both do the work. The correct shape attempts the insert
as the first statement of the transaction and treats `DuplicateKeyException` as "already
handled, skip" — the check and the mark have to be the same atomic operation, because
"have I seen this" and "mark it seen" cannot be two steps.

**T5. The outbox relay crashes between publishing a message and marking the row
published. What is the observable effect?** `TRICKY`

The message is published twice, and this is by design rather than by bug. The alternative —
marking before publishing — trades a duplicate for a *lost* message, which is strictly
worse, so at-least-once is the only correct outbox semantics. The consumer therefore must
be idempotent, with the dedup record written in the same transaction as its business write.
Teams that treat a duplicate as an incident to be fixed by making the relay "smarter" end up
with a lost-event bug instead, and the reason is that the relay cannot know whether its
publish reached the broker — the same ambiguity as any at-least-once system, and the reason
the whole pattern is only correct when the consumer is idempotent.

### Data Ownership and Caching

**D14. When is CQRS justified, and how do you know you are adopting it for the wrong
reason?** `STAFF`

It is justified when the read is genuinely complex — a dozen joins the write model cannot
serve — when you need several projections of the same data, when read volume dwarfs write
volume by a large factor, or when an event stream already exists and the projection is a
natural consequence. It is a data-migration project in disguise when it is adopted to fix
one slow query, because then you inherit projection pipelines, a backfill, replay
correctness, drift between read and write models, and a situation where every new query is
a change to a pipeline rather than a repository. The honest test is whether you would build
the read model even if the database were fast. And the thing people forget to budget for is
the operational question, not the technical one: when the projection and the write model
disagree, someone has to be able to say which is true, and the answer has to be enforced in
code rather than hoped for.

**D15. Is a cache worth the staleness?** `STAFF`

Per read, not per system. I would not put one in front of anything a user would call a bug
when stale — a balance, an order status, a permission check, a price at checkout. I would
put one in front of reference data, feature flags and read-mostly lookups where "eventually"
is a property of the data rather than a compromise. The design point I would insist on is
that invalidation is event- or version-driven rather than TTL-driven for anything the user
can write, because a TTL is uniform across keys and times while the staleness only matters
in a narrow window, and a TTL is a guess about a staleness nobody chose. And I would insist
on knowing the two things that turn a cache from a performance concern into a correctness
one: a key that omits the tenant, and negative caching with a long TTL, which breaks
read-your-writes on every create and means a user who just signed up is told they do not
exist.

**P8. A multi-tenant customer was shown another tenant's order history. What is the
first question, and what is the class of bug?** `SCENARIO`

The cache key. The tell is that this never happens in a single-tenant test, so it is a cache
whose key does not contain the tenant — `customer:42` or `orders:42` — populated under one
tenant and served to another. The class of bug is not a performance bug that leaked; it is a
correctness bug with a security consequence, and the reason it survived is that the cache is
"working perfectly" from its own point of view. The immediate response is to flush the
affected cache and confirm the blast radius from the cache access logs. The fix is
structural, not conventional: a `CacheKey` value object that takes a tenantId in its
constructor, so a key that omits the tenant cannot be constructed. I would also look for
the subtler variant — a genuinely global key for global data that later got *overwritten*
with tenant-scoped content — because that one is not caught by a per-tenant test either.

**S8. A PR adds `cache.put(key, emptyList(), Duration.ofMinutes(5))` on a customer
lookup miss. What is the review comment?** `TRICKY`

Negative caching is legitimate and worth doing — a lookup for a non-existent key hitting the
database every time is a trivially available amplification attack, and bots will find it.
But five minutes is far too long and this introduces a user-visible failure: a user signs
up, the account is created, the login flow looks it up, gets a cached miss, and tells them
it does not exist for the whole TTL. The rule is that negative entries get a much shorter
TTL than positive ones — seconds rather than minutes — and that the create path explicitly
invalidates the negative key. The structural point for the review is that the invalidation
belongs in one place, in the write path, rather than in each caller, because the caller who
forgets is the one whose bug is a user who cannot log in.

**T6. A consumer's `read_committed` Kafka transaction rolls back after it has written to
Postgres. What is in each database?** `TRICKY`

Kafka: the output message is not there and the consumer offset is not committed, so the
input message will be redelivered. Postgres: the business row is committed and stays
committed, because Postgres has a different journal and nothing coordinated the two. So the
next delivery of that message runs the business logic again and you get a duplicate row.
This is the precise reason the exactly-once claim does not survive contact with a database,
and the fix is a dedup record in the same transaction as the Postgres write, or a guarded
state transition — not a different isolation level. The failure mode is silent because both
databases report healthy.

**D16. Two services both need customer data. How do you manage that, and where is the
line?** `STAFF`

One named owner and denormalised copies, which is legitimate and usually right — four
services calling your API on a hot path is a latency and availability problem, and a copy
of a customer name in the orders database is a bounded staleness problem. Each copy needs a
documented purpose, a documented refresh mechanism, and a known staleness bound, so a
consumer knows what it is allowed to use the copy for. The line is that exactly one system
writes the fact. The moment a second system can write the same field, you have a
distributed consistency problem with no owner, and the symptom is a column that differs
between two databases with nobody able to say which is right — the dual-write bug wearing
a different hat. The practical enforcement is a database permission or a lint rule stopping
another service writing your table, because a rule in a wiki is not a boundary.

**D17. Your read model and your write model disagree. Which is true, and how do you make
that answer stick?** `STAFF`

The write model, always, and the value of deciding it in advance is that the runbook for a
customer complaint becomes a one-line operation — "resync the projection for order 42" —
instead of a debate during an incident. The enforcement matters as much as the statement:
the projection's refresh path must be idempotent and re-runnable from an event offset, so
resync is a normal operation rather than a project. What must never happen is a support
engineer "fixing" the projection by editing it, because that creates a second writer and the
next event overwrites the correction. And if the disagreement is systematic rather than lag,
the real answer is that a read has been migrated onto a projection that is not allowed to
be stale, and the projection is the wrong place for it.

**S9. A PR adds a new cached read to a service and nothing else. What is missing from the
review?** `STAFF`

Five things. Who invalidates it, and the answer "the TTL" means nobody and eventually, and
that is a data-correctness decision being made by a config value. Whether the key contains
the tenant, structurally. What happens on a miss that is a *negative* result, since that
breaks read-your-writes on every create. What the cache does when the underlying store is
down — fail open and serve stale, or fail closed and take the site down with it, and that
is a deliberate decision with a blast radius. And who owns it: an unowned cache is a memory
leak with a hit rate, and it is worse than no cache because its existence means nobody can
remove it to fix the problem. The review should also ask for the metric that tells you the
cache is hurting, which is the hit rate, because a cache with a 3% hit rate is pure overhead
and a source of bugs.

**P9. A page shows the wrong delivery address at checkout, and the address service is
correct. Where do you look?** `SCENARIO`

At the read path first, before either service. The checkout is almost certainly reading a
denormalised copy of the address — either a column in the orders database or a projection
maintained by consuming `AddressChanged` — and that copy is behind by the consumer lag. The
class of bug is eventual consistency chosen correctly for the write path and never
propagated to the read model that *prints things*. The fix is not a longer cache TTL and it
is not a retry; it is deciding that this specific read is a read-your-writes read, so either
the checkout reads the address service's authoritative store or the order carries a version
that the projection satisfies before the order is placed. The prevention is the document
listing which reads are bugs when stale — and "delivery address at checkout" is on it from
day one.

### Cross-Cutting Design Judgement

**D18. You are splitting a monolith into services. What communication style do you default
to, and what would change your mind?** `STAFF`

Synchronous, and specifically I would default to the *smallest number of synchronous
dependencies that the business actually requires*, because every extra hop is a distribution
rather than a point value and a failure mode that has to be owned. The default to events
is for fan-out the caller does not wait on, burst absorption, and availability decoupling —
not for making a user-facing decision faster, which it does not do. What would change my
mind on a specific boundary: a genuinely slow or bursty dependency that the caller's latency
budget cannot absorb; a dependency that is frequently unavailable and whose absence does not
invalidate the caller's operation; or a one-to-many relationship where the fan-out is three
or more consumers of which only one is on the request path. What would *not* change my mind
is "we should be event-driven", because that is a style preference and the question to ask
is what a consumer of the event would do that the producer does not already know.

**D19. Your platform has adopted outbox, sagas, idempotency keys, CQRS projections and a
service mesh. Is that a well-designed system or an expensive one?** `STAFF`

Probably an expensive one, and the honest way to find out is to price the *operational*
surface rather than the code. Each mechanism has a cost that is not the implementation:
outbox means a relay to run, monitor and purge; sagas mean a coordinator to keep available
with leader election and an operator view of in-flight sagas; idempotency keys mean a table
that only grows; CQRS means a projection to backfill, rebuild on every logic change, and keep
correct under replay; a mesh means a control plane to upgrade. None of these is wrong, and
the answer is not "use fewer" — it is that each one should be justified by a *named*
requirement, and a requirement like "we need replay" or "this read is genuinely complex"
survives scrutiny in a way that "we should be event-driven" does not. The staff question is
which of these you could delete tomorrow without anyone noticing, and if the answer is
several, the architectural maturity is partly inertia.

**D20. A team proposes a new topic per entity change with the full entity as the payload,
plus a new consumer group per consumer. How would you push back?** `STAFF`

Both halves are the nouns-as-events antipattern plus a topology cost. A topic per entity
change with the full object makes the topic list a second copy of the domain model that
every consumer must understand, so adding a field becomes a contract change for everyone,
and a consumer reading a field it should not acquires a runtime dependency on data that was
not meant to be exposed. Per-entity-change topics also fragment the log, which destroys
ordering and makes replay far less useful, because you can no longer replay a single
stream to rebuild a view. On consumer groups: a group per consumer is correct for
independent progress, but it means every message is retained once per group, so retention
cost multiplies by the number of groups, and each group is an independent lag to alert on.
What I would propose is fewer, more purposeful topics carrying domain facts with minimal
payloads, and as few consumer groups as the progress requirements genuinely demand.

**D21. Your CDC connector's offset store is on the same database it reads from. Is that
a problem?** `STAFF`

It is a coupling worth naming even though it works, and the concern is availability rather
than correctness. The connector stores its LSN or binlog position there, which means the
thing that tells you how far the stream has progressed depends on the database being
reachable — and during exactly the incident where you need to know how far behind you are,
the database is the thing that is down. It also means the connector's state is in the same
backup and restore domain as your data, so a restore that rolls the database back to a
point in time also rolls the connector's position back, and on restart the connector
replays from there, producing a duplicate storm at every consumer unless they are all
idempotent. The second-order point is the one I would actually raise in review: it is fine
until a disaster recovery exercise, at which point somebody discovers the coupling and it
becomes a project. Putting the offset store on separate infrastructure — or in the broker,
where several connectors support it natively — costs almost nothing and removes the
dependency.

**D22. A team wants a read-your-writes guarantee across their entire platform. What would
you tell them?** `STAFF`

That it is the wrong scope, and that asking for it signals the real problem has not been
identified. A platform-wide guarantee means every read goes to the primary or carries a
version check, which eliminates the read replicas you built to scale reads and makes the
cache nearly pointless — so you have spent the read-scaling budget and gained an availability
guarantee nobody needed on 2% of reads. The right shape is a short, explicit list of reads
that are bugs when stale: balance, order status, permission check, price at checkout, the
write confirmation. Each gets a mechanism — a primary route or a version token — and each is
tested as a contract. The staff framing is that this is a product decision disguised as an
infrastructure setting, and the artefact worth producing is a one-page document naming the
reads and the reads-that-are-cosmetic, because that document outlives the implementation and
it is the thing that is missing when the incident happens three months later.

**D23. You have exactly-once processing working end to end. What would make you stop
trusting it?** `STAFF`

Four things, in order of how often I have seen them. A consumer that disables or changes its
transaction settings for performance — the guarantee is a property of a configuration that
spans every hop, and opting out is silent. Any side effect that leaves the transaction: an
email, a webhook, a call to a payment processor, anything at all outside the broker and your
database. A change to the consumer that adds a database write not covered by the dedup
record, which is the same failure as Ch 2 wearing better clothes. And a schema evolution that
changes an event's *meaning* while keeping its name and type, which no compatibility checker
catches and which turns exactly-once processing of the wrong thing. What I would actually
do is stop relying on the term and start testing the property: inject a duplicate and assert
the single effect, in an integration test that runs on every build. That test is worth more
than the setting.

**T7. A service publishes 500 events/second at roughly 1KB each and purges published rows
nightly. What is that table costing you?** `TRICKY`

Around 43GB of rows a day at that rate, before indexes, before replication, and before the
write amplification of marking each row published — which lands on the same database as
the business traffic and is a real competitor for I/O at the busiest hour. The nightly
purge is also the wrong shape: it means the table holds a full day of events at peak, the
partial index on unpublished rows is large for most of the day, and the purge itself is a
long-running delete on the primary, which is the moment you least want one. The
improvements are incremental: purge on `published_at` in bounded batches through the day
rather than once at night, right-size the rows (a full-object event is often 1KB where a
fact would be 150 bytes), and consider whether the poller is the right relay at this
volume — 500/second with connection pressure on a shared pool is roughly the point where a
log tailer starts paying for itself.

**S10. A PR adds a `Consumer<OrderPlaced>` bean with `@Transactional` on the handler and
no `ackMode` set. What is the review question?** `STAFF`

Two things, and both are about the transaction rather than the handler. First, what the ack
mode is — the binder default is a batch or record commit, and the requirement is that the
ack happens *after* the business transaction commits, so that a crash between them causes a
redelivery rather than a lost message. A `@Transactional` on the handler plus an ack the
framework performs independently can get the ordering backwards. Second, whether the dedup
record is in that transaction. The handler is `@Transactional`, which is the right place
for the inbox insert and the business write to share a commit, but the common mistake is
inserting the inbox entry in a separate service or after the transactional boundary — which
reintroduces both the race and the repeat-on-crash. The review should also confirm the
handler is genuinely transactional rather than a self-invocation, since a `@Transactional`
that is not on the proxy is not there at all.

**P10. After a database failover, every consumer's lag is high and climbing, and throughput
has not recovered. What is your first hypothesis?** `SCENARIO`

Reprocessing, not falling behind. After a failover the consumer offsets may have been
retained but the database's replication position moved, so the first poll after recovery
re-reads a window and the throughput looks high while the backlog is not actually
progressing. The second hypothesis is rebalance churn — if the broker lost its consumer
group state or the group coordinator changed, the group rebalances and reprocesses, and
throughput that looks like work is actually churn. The diagnostic is the same as always:
compare the *last successfully processed offset timestamp* against the oldest message
timestamp. If that timestamp is advancing, the consumer is slow and you scale; if it is
frozen, the consumer is stuck and scaling makes it worse. The specific thing I would check
first is whether the failover caused the deduplication path to start throwing, because a
consumer that is now failing every message and swallowing the exception looks exactly like a
consumer that is stuck, and it is invisible in throughput metrics.


