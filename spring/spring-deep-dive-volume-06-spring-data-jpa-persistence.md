---
title: "The Spring Complete Deep-Dive"
volume: 6
series: "SPRING DATA JPA & PERSISTENCE"
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
treated as the visible surface of much larger machinery — a proxy chain, a bean lifecycle, a
connection pool, a thread pool, an identity map — and the notes always go down to that
machinery, because that is the layer where production incidents actually live.

Volume 6 is the one where the ORM's default behaviour is more dangerous than most
frameworks, because the defaults are *silently correct-looking*. Nothing throws when you
write `customer.getOrders()` inside a loop — you get a working endpoint that issues 200
queries. Nothing throws when a `Long` ID arrives as `null` in a constructor — you get a
`NullPointerException` in a `@OneToMany` helper that nobody has called yet. The whole volume
is built around the idea that **JPA's failure mode is usually not an exception, it is a
correct-looking answer that came from somewhere other than where you thought.** The
persistence context, dirty checking, the flush order, the fetch strategy — these are not
details to memorise for an interview, they are the mechanism behind the most expensive
performance incidents in the industry.

The staff-level theme running through all seven chapters is **where the abstraction stops
paying for itself**. Spring Data repositories, `@OneToMany`, `Specification`, entity graphs,
`ddl-auto`, the second-level cache — each is genuinely good at something and each has a
point where it becomes actively harmful. Knowing where that point is, and being able to say
it in a design review, is the difference between someone who can configure Hibernate and
someone who can be trusted with the data layer.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto
`GenerationType.TABLE` produces filler. The template is a completeness checklist, not a
template to fill.

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

Volumes end with an `Interview Scenario Bank` — production situations, code-behaviour
predictions, code-review questions, and design trade-off challenges. There is no target
number for these. They stop when the next question would repeat one already asked.

### Continuing From Volume 5

| Volume | Coverage |
| --- | --- |
| Volume 1 | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 (this book) | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 6

- Chapter 1 — JPA & Hibernate Fundamentals
- Chapter 2 — Spring Data Repositories
- Chapter 3 — Entity Relationships & Fetch Strategies
- Chapter 4 — The N+1 Problem
- Chapter 5 — The Persistence Context in Practice
- Chapter 6 — Querying
- Chapter 7 — Schema Evolution & Performance Tuning
- Chapter 8 — Interview Scenario Bank

---

# Part 6 — Spring Data JPA & Persistence

## Chapter 1 — JPA & Hibernate Fundamentals

### 1.1 What JPA Specifies and What Hibernate Adds

The single most common misconception in this whole area is that "JPA" and "Hibernate" are
interchangeable. They are not, and knowing the seam is the difference between a portable
data layer and one that only runs on one database.

**JPA is a specification.** Jakarta Persistence API (formerly `javax.persistence`, now
`jakarta.persistence` since the 3.0 rename — a detail that breaks every `javax` import in a
Boot 3 upgrade) defines:

| JPA specifies | What it actually is |
| --- | --- |
| `EntityManagerFactory` / `EntityManager` | The interface for talking to a persistence provider |
| The persistence context | A mandated identity map — same ID, same object instance, within one context |
| The entity/mapping model | `@Entity`, `@Id`, `@OneToMany`, `@Column` — annotations with specified semantics |
| JPQL | A vendor-independent query language, defined over **entity and attribute names**, never over table or column names |
| The query language, criteria API, bulk operations | `TypedQuery`, `CriteriaBuilder`, `@NamedQuery` |
| Transactions, entity lifecycle states | `persist`, `merge`, `remove`, `flush`, `detach`, and their specified behaviour |
| Generated key retrieval, optimistic locking, schema generation requests | `GenerationType`, `@Version`, `jakarta.persistence.schema-generation.*` |

**Hibernate is an implementation of that specification**, and it adds a large amount that
JPA does not mandate and does not describe:

| Hibernate adds | Why it matters |
| --- | --- |
| Its own `Session` (implements `EntityManager`) | The real implementation behind the spec interface |
| **Dirty checking** | Automatic `UPDATE` on flush by comparing entity state to a snapshot taken at load. Not in the spec. |
| The **first-level cache** | The identity map *is* the spec's persistence context, but Hibernate's dirty-tracking snapshot array is extra |
| HQL and its SQL AST | HQL is a superset of JPQL; Hibernate compiles it to a vendor-specific SQL AST |
| `@BatchSize`, `@Fetch`, `@FetchProfile`, `@Proxy(lazy=false)` | Non-standard fetch optimisations, and they are extremely effective |
| The **second-level cache** and query cache | A cross-`Session` cache with pluggable consistency strategies |
| Enhanced bytecode generation | Lazy proxies, dirty-tracking without source instrumentation |
| HQL AST transformations, `MutantInspectionStrategy`, statement inspectors | A query-planning layer JPA knows nothing about |
| `@Type`, `@TypeDef`, `SQLJavaType`, JSON mapping | Type system extensions that solve problems JPA cannot express |

> **INTERVIEW TRAP**
>
> "JPA uses JPQL so it's database-independent" is the accepted answer and it is
> half-wrong in a way that costs you the point. **JPQL is portable only in the sense that
> the spec defines the language — Hibernate's HQL, and Hibernate's *rendering* of a
> portable query, are not portable.** Two specific places it breaks: (1) a JPQL string
> containing a function Hibernate doesn't know will fail to translate; (2) the moment you
> use a Hibernate extension — `left join fetch` semantics, `@SqlResultSetMapping`,
> `queryHint` names, a `Criteria` node the spec doesn't have — you've left the portable
> subset. And "portable" is worth exactly zero if you never run on two databases, which is
> true of most teams and is a legitimate reason to use vendor features freely.
>
> The sharp version: JPQL operates on **entity and attribute names**, not table and column
> names. So `select p from Product p where p.name = :n` is portable, and
> `select * from products where name = :n` is not — which is the entire argument for the
> query language existing, and also the entire reason a native query needs an explicit
> result mapping.

### 1.2 The Persistence Context — the Most Important Concept in the Volume

Everything in JPA that seems arbitrary falls out of this one idea. **The persistence
context is an identity map.** It guarantees that within one context, any two references to
the same database row are the *same Java object*.

```text
   ┌──────────────────────────────────────────────────────────────┐
   │              PERSISTENCE CONTEXT  (a.k.a. Hibernate Session) │
   │                                                              │
   │   id=1  ──►  [ Customer@3f2a  "Acme"     ]                   │
   │   id=7  ──►  [ Order@8b41    "A-1001"  ]                   │
   │   id=9  ──►  [ Order@c2d9    "A-1002"  ]                   │
   │                                                              │
   │   + snapshot of loaded state, for dirty checking              │
   │   + queue of pending actions (insert / update / delete)       │
   │   + a first query result cache (the same identity map)        │
   └──────────────────────────────────────────────────────────────┘
              ▲
              │  scoped to: one transaction (or one OSIV request)
              │  NOT thread-safe. One thread. One unit of work.
              ▼
        ┌──────────┐   JDBC    ┌────────────────┐
        │ Database │ ◄──────── │ EntityManager  │
        └──────────┘           └────────────────┘
```

Consequences that are not obvious until you've been bitten:

```java
@Transactional
public void demonstrate() {
    Customer a = em.find(Customer.class, 1L);
    Customer b = em.find(Customer.class, 1L);

    System.out.println(a == b);            // TRUE — one context, one instance
    a.setName("Renamed");
    System.out.println(b.getName());      // "Renamed" — same object, not a copy
    // and no save() call. No UPDATE statement yet either.
    // The UPDATE happens at FLUSH. See Chapter 5.
}
```

1. **Identity, not equality.** `em.find()` returning the *same object* is the guarantee
   that makes in-place mutation work at all. `repository.findById()` returning a fresh
   object each call is a bug, not a detail — it means you're crossing a context boundary
   and the identity guarantee is gone.
2. **Mutating an entity is a write.** No `save()` needed, and — this is the scary half — no
   way to mutate an entity *without* a write. A setter called in a read-only code path
   becomes an `UPDATE` at flush.
3. **The context is a cache, and caches go stale.** An entity loaded at the start of a long
   transaction and modified by another transaction will be overwritten on commit, because
   Hibernate's `UPDATE ... WHERE id = ?` does **not** include a version predicate unless the
   entity has a `@Version` field. This is the concrete argument for `@Version`.
4. **`getReference` vs `find` is a proxy-vs-a-query decision**, not a lazy-vs-eager one.
   `getReference` returns a proxy and may never touch the database; `find` returns
   `null` if the row doesn't exist and hits the database if it does.

> **MUST REMEMBER**
>
> The persistence context is scoped to **one transaction**, not one request and not one
> thread's lifetime. With Open Session in View (Chapter 5) it is scoped to the whole HTTP
> request, which is *longer than your transaction* and is exactly why that setting causes
> the problems it does. And it is not thread-safe — an `EntityManager` injected into a
> singleton and shared across requests will corrupt itself. Share the
> `EntityManagerFactory`, never the `EntityManager`.

### 1.3 `EntityManagerFactory` vs `EntityManager`

This is a two-question answer that people get wrong in a way that matters operationally.

| | `EntityManagerFactory` | `EntityManager` |
| --- | --- | --- |
| Represents | A persistence unit — the parsed mapping model, the connection provider, the query plan cache, the second-level cache | One persistence context (Hibernate `Session`) |
| Cost to create | Expensive: parse all entity mappings, build the metadata model, open the connection pool | Cheap: allocate a session, bind (or defer binding) a JDBC connection |
| Thread safety | **Thread-safe.** The intended singleton. | **NOT thread-safe.** One per thread at a time. |
| Lifetime | One per application, one per `persistence-unit` in `persistence.xml` | One per transaction, or one per request under OSIV |
| How you get it | Injected by Spring | Injected by Spring (a `SharedEntityManagerCreator` proxy under the hood) |
| Failure mode | Missing bean → context won't start | Shared across threads → `IllegalStateException` or silent corruption |

```text
   ApplicationContext
          │
          ├── EntityManagerFactory   (singleton, thread-safe)
          │        │
          │        └── LocalEntityManagerProxy ──► delegates to a
          │               transaction-bound EntityManager
          │                  │
          │                  └── EntityManager  (thread-confined, not thread-safe)
          │                        created on first use in a transaction
          │
          └── DataSource / HikariCP  (the actual connection pool underneath)
```

The subtlety worth having in an interview: **Spring does not inject a real
`EntityManager`.** It injects a `SharedEntityManagerCreator` proxy, which looks up (or
creates) a thread-bound `EntityManager` on each call. That is why you *can* inject an
`EntityManager` into a singleton bean without it breaking — and also why the proxy creates
a *new* persistence context outside a transaction rather than sharing one, which means
`em.find()` called outside `@Transactional` will happily work and will quietly give you a
context that never sees your uncommitted writes.

### 1.4 The CRUD Operations, and the `persist` vs `merge` Difference

| Operation | Does | On a **new** (transient) entity | On a **detached** entity | On a **managed** entity |
| --- | --- | --- | --- | --- |
| `persist(e)` | Make managed, schedule an INSERT | Creates; the ID is populated by the time `persist` returns **if** the generator allows it | **Throws** `EntityExistsException` (JPA) / `PersistentObjectException` (Hibernate) | No-op |
| `merge(e)` | Return a **managed copy** | Behaves like `persist`, and returns a *different* instance from the one you passed | Copies state onto the managed instance and returns it | Returns the same instance; dirty checking handles the write |
| `remove(e)` | Schedule a DELETE | **Throws** `IllegalArgumentException` | **Throws** `IllegalArgumentException` | Deletes at flush |
| `find(C.class, id)` | Load by ID | — | — | Returns the managed instance, from the context if already loaded |
| `getReference(C.class, id)` | Return a proxy | — | — | No query until the proxy is used |
| `flush()` | Push pending changes to the DB, now | — | — | Runs the dirty check and issues the SQL |
| `clear()` | Detach **everything** | — | — | Empties the context; the next `find` re-queries |
| `detach(e)` | Remove one entity from the context | — | — | That entity is no longer managed |

The `persist`/`merge` distinction is the single most-asked question in a JPA interview,
and the reason it matters is that **`merge` does not return the object you passed in**.

```java
@Transactional
public void theClassicMistake() {
    Product detached = new Product();          // or: fetched in an earlier transaction
    detached.setName("Widget");
    em.merge(detached);                        // the managed copy is DISCARDED

    detached.setName("Gadget");                // you are mutating the DETACHED object
    // The persistence context is never told. No UPDATE is ever issued.
    // The transaction commits and the row still says "Widget".
}
```

This is the mechanism behind a whole family of real bugs: an object fetched in one
transaction, mutated in a later one, and the write silently vanishes. `SimpleJpaRepository`
saves you from it by calling `em.merge()` and **returning the result** — so
`repository.save(detached)` hands you back the managed instance, and the fix for the manual
case is always *"use the return value of `merge`"*.

A related trap that costs hours: after `merge`, the **managed** copy is a *different
object*, so `em.contains(detached)` is `false`, and mutations to the copy you were given do
nothing. Meanwhile, the managed copy carries the *database's* field values — which is why
`merge` overwrites a field the detached object left `null` with `null` from the row.

> **PRODUCTION RELEVANCE**
>
> Detached entities are not an exotic mistake; they are the default shape of anything that
> crosses a serialization boundary, a queue, a cache, or a thread boundary. Every one of
> those is a place where a managed entity becomes detached, and every one of them is a
> place where `merge` silently returns a different object. The discipline that prevents it:
> entities never leave a transactional method, and everything that crosses a boundary is a
> DTO.

### 1.5 Basic Mapping and ID Generation

```java
@Entity
@Table(name = "products", indexes = {
    @Index(name = "idx_products_category", columnList = "category_id"),
    @Index(name = "uq_products_sku", columnList = "sku", unique = true)
})
public class Product {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false, length = 64)
    private String sku;

    @Enumerated(EnumType.STRING)              // see below — this is the right answer
    @Column(nullable = false, length = 32)
    private ProductStatus status;

    @Column(precision = 19, scale = 4)        // precision = total digits, scale = decimals
    private BigDecimal price;

    @Lob                                    // CLOB / BLOB; deprecated for some types in JPA 3.2
    private byte[] image;

    @Column(name = "created_at",
            insertable = false, updatable = false)   // populated by the DB default
    private Instant createdAt;

    @Version                              // optimistic locking — see below
    private Long version;
}
```

**ID generation strategies, and their real costs:**

| Strategy | How it works | Portable? | Batches? | The cost |
| --- | --- | --- | --- | --- |
| `IDENTITY` | DB auto-increment column; Hibernate must `INSERT` **and read the generated key back** immediately | Widely supported | **No** | Disables JDBC insert batching entirely. One round trip per insert. |
| `SEQUENCE` | `SELECT nextval` (or a pooled pre-allocation) before the INSERT | Not in MySQL < 8.0 / MariaDB < 10.3 | **Yes** | A sequence read per insert, or allocation-inflation problems if the pool is too large |
| `TABLE` | A one-row table with a counter, read and incremented under a lock | Fully portable | **Yes** | A write lock on a single row — a global serialisation point across the whole table |
| `AUTO` | The provider picks (Hibernate usually picks `SEQUENCE` on Hibernate 6 / `hilo`-style on older versions) | Provider-dependent | Provider-dependent | You don't know which one you got, so you don't know the failure mode |
| `UUID` / assigned | Application-generated | — | — | Index fragmentation; see below |

> **SCALING REALITY CHECK — WHY `IDENTITY` AND BATCHING ARE MUTUALLY EXCLUSIVE**
>
> With `IDENTITY`, Hibernate has no ID before the INSERT, so it must execute the INSERT
> **and read the generated key** before it can proceed — it cannot accumulate statements in
> a JDBC batch, because each one needs its result. Turn on `hibernate.jdbc.batch_size=50`
> with an `IDENTITY` entity and the inserts still go one statement at a time, and the
> setting does nothing for that entity. Switch the same entity to `SEQUENCE` and the
> sequence value is obtained in a cheap round trip (or in pre-allocated blocks) and the
> INSERTs batch. This is the single highest-leverage change in most JPA applications, and
> Chapter 7 covers the full configuration.
>
> The flip condition: `IDENTITY` is genuinely better when inserts are rare and you want
> gap-free, monotonically increasing, human-readable IDs that sort in the same order as
> insertion, and when the table has exactly one writer anyway. If throughput is the
> problem, it's `SEQUENCE`.

> **INTERVIEW TRAP — `@Enumerated`**
>
> The default is `ORDINAL`, which persists the enum's **position in the declaration**. A
> senior answer is that `ORDINAL` is almost always a latent production incident: inserting a
> new constant in the middle of the enum silently reinterprets every existing row —
> `status = 1` was `PENDING` and is now `SHIPPED` — and the data is unrecoverable without a
> manual `UPDATE`, because the database was never told what the numbers meant. `STRING`
> costs a few more bytes per row and makes the data self-describing and reordering-safe.
> **Always use `@Enumerated(EnumType.STRING)`.** The one place `ORDINAL` is defensible is a
> closed, never-changing enum where the read query does the mapping in Java and the column
> is strictly internal.
>
> Related: `@Convert` (or an `AttributeConverter`) for enums with a code value the business
> cares about, and for the value objects that Lombok's `@Data` will not give you.

**`@Version`** deserves its own line, because its absence is invisible until it isn't:

```java
@Version
private Long version;    // Hibernate adds: WHERE id = ? AND version = ?
```

On flush, Hibernate's update becomes `UPDATE products SET name=?, version=version+1
WHERE id=? AND version=?`, and if it affects zero rows it throws
`OptimisticLockException`. This is the *only* mechanism that makes the identity-map staleness
from §1.2 fail loudly instead of silently overwriting. Without it, last-writer-wins is
silent, which for anything with concurrent editors is data loss.

> **STAFF-LEVEL CONSIDERATION**
>
> Optimistic locking fails only if the entity has a `@Version` field, and many teams add it
> to a handful of entities and then discover the pattern was never standardised. The
> argument for putting it on **everything** by default is that its cost is one extra
> `BIGINT` column and one extra predicate in the `WHERE` clause, and its absence is silent
> data loss. The argument against is that it turns a "the last write wins, which is fine
> for this field" situation into a retry loop — and for genuinely last-write-wins data
> (a view counter, a heartbeat), a version column is pure cost. The resolution is a
> convention, not a library: `@Version` on entities with concurrent editors, documented
> exceptions for the handful that genuinely don't need it.

### 1.6 Lombok on Entities — the `@Data` Trap

Lombok's `@Data` on a JPA entity generates `equals`, `hashCode`, `toString`, getters,
setters, and a required-args constructor. On an entity, two of those are actively harmful
and one is a production incident waiting for a collection to be used.

```java
// BROKEN — do not ship this
@Entity
@Data                       // generates equals/hashCode over ALL fields
public class Product {
    @Id @GeneratedValue private Long id;
    @Column(name = "price") private BigDecimal price;
    @Version private Long version;
}
```

What goes wrong, precisely:

| Generated method | What it does on an entity | The failure |
| --- | --- | --- |
| `equals` | Compares **every** field, including mutable ones and `id` | A `HashSet<Product>` you put a managed product into, then had Hibernate dirty-check and update the price, now **cannot find that product** — the hash changed while it was in the set |
| `hashCode` | Over all fields | Same problem, worse: the entry is orphaned in the hash bucket |
| `toString` | Prints every field, including `@OneToMany` and `@ManyToMany` | **`StackOverflowError` on a bidirectional association** — `parent.toString()` → `child.toString()` → `parent.toString()` → ... |
| `@Data` on a class with **no** final fields | No `@RequiredArgsConstructor` effect (all fields non-final → no-args ctor) | With `@Id` on a field, Hibernate needs a no-args constructor. `@Data` accidentally provides it, which is why people ship it. |
| `@EqualsAndHashCode(callSuper = true)` on a subclass | Compares the superclass too | Includes the `id`, and defeats the subclass-identity use case |

The correct shape, and it's not much code:

```java
@Entity
@Getter
@Setter
@NoArgsConstructor(access = AccessLevel.PROTECTED)   // JPA needs it; nobody else should call it
public class Product {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "price", nullable = false)
    private BigDecimal price;

    @Version
    private Long version;

    // IDENTITY ONLY: no id, no version, no associations.
    // This is what the spec's identity contract actually guarantees,
    // because those three fields are precisely the ones that legitimately change.
    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Product other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();     // CONSTANT — never field-derived
    }

    // toString: exclude associations. Always. Or don't override it at all.
    @Override
    public String toString() {
        return "Product{id=" + id + ", price=" + price + "}";
    }
}
```

The `id != null` guard and the **constant** `hashCode` are the two details that separate a
correct implementation from a plausible one:

- The `id != null` guard handles the transient case — a new entity not yet persisted has a
  `null` ID. Without the guard, two distinct transient products are "equal", and a
  `Set` will keep only one of them.
- The **constant** `hashCode` is what makes the entity usable in a `HashSet` at all. The
  JPA contract is: an entity's hash code must not change over its lifetime, because
  `id` doesn't exist until after `persist` — and even once it does, Hibernate may reassign
  it. A constant hash with an ID-based `equals` satisfies both constraints. The cost is
  bucket collisions in a `HashSet`, which is irrelevant for entity sets of realistic size
  and is the price you pay for correctness.

> **PRODUCTION SCENARIO**
>
> Problem: an `OutOfMemoryError: Java heap space` on a single request, with a stack trace
> of thousands of repeating frames.
> Investigation: the trace showed `Order.toString()` → `toString(OrderItem)` →
> `toString(Order)` → forever, from a `log.debug("processing {}", order)`.
> Root cause: Lombok `@Data` on both sides of a bidirectional `@OneToMany` generated a
> `toString()` that walks the whole object graph in both directions, and the line was logging
> at DEBUG in a path that was enabled in production.
> Solution: hand-written `toString()` excluding associations, and a log-level audit.
> Prevention: a checkstyle or ArchUnit rule banning `@Data` on `@Entity` classes — the
> cheapest possible control, because the ban is enforceable in seconds and the incident is
> not.

> **INTERVIEW TRAP — THE GENERATED-CODE QUESTION**
>
> "Does Lombok work with JPA?" is not the interesting question. The interesting one is that
> **Lombok's annotation processing and JPA's no-arg constructor requirement interact badly**:
> `@Data` and `@Builder` both suppress the implicit no-args constructor, so adding `@Builder`
> to an entity breaks it at *runtime* with `HibernateException: Unable to invoke no-args
> constructor`, not at compile time. The fix is `@NoArgsConstructor(access =
> AccessLevel.PROTECTED)` alongside `@Builder`, which also closes the "someone built a
> half-initialised entity" hole that a public no-args constructor otherwise leaves open.
> `@Builder.Default` is the other trap — a field initialiser is silently dropped for
> entities built through the builder, so `private Status status = Status.NEW;` becomes
> `null`.

#### Common Mistakes

- Calling `em.merge(x)` and ignoring the return value, then mutating `x`. The managed copy
  is a different object; the mutation is discarded silently.
- Calling `persist` on a detached entity. It throws `EntityExistsException` — this is the
  correct behaviour, and it's the reason `save()` in `SimpleJpaRepository` is `merge` for
  non-new entities.
- Believing the persistence context is per-request. It is per-transaction; OSIV makes it
  per-request, which is why it's controversial.
- Sharing an `EntityManager` across threads. It is not thread-safe. Spring's shared proxy
  masks this until you call `EntityManager` methods off a transaction-bound path.
- Using `GenerationType.ORDINAL` for an enum, or leaving `@Enumerated` off entirely (which
  means `ORDINAL`).
- `@Data` on an entity: mutable-field `equals`/`hashCode`, association-walking `toString`,
  and a `StackOverflowError` waiting on a bidirectional mapping.
- Omitting `@Version` on anything with concurrent editors, and then discovering the
  last-writer-wins behaviour from a customer rather than from a test.
- Building an entity with `@Builder` without `@NoArgsConstructor(access = PROTECTED)`, and
  getting a runtime `Unable to invoke no-args constructor` instead of a compile error.
- Believing a `@Column` in a `@ManyToOne` and a `@Column` in a `@OneToOne` mean the same
  thing. `@OneToOne` defaults to eager *and* requires a unique constraint on the FK column
  to be one-to-one at all; without it, the schema is a `@ManyToOne` with extra steps.

#### Interview Questions — JPA & Hibernate Fundamentals

**Q1. What is the persistence context, and what breaks if you don't understand it?**
`TRICKY`

It's a mandated identity map: within one context, two references to the same row are the
same Java object. Everything else follows — `em.find()` returning the same instance,
mutating an entity being a write, the context going stale against concurrent writers, and
`getReference` being able to return a proxy that never hits the database. If you don't have
it, the `persist`/`merge` behaviour, the `LazyInitializationException`, and the
Open-Session-in-View debate are all unfollowable.

**Q2. `persist` vs `merge` — what's the difference and why does it bite?** `TRICKY`

`persist` requires a *new* (transient) entity and makes that same instance managed, throwing
`EntityExistsException` on a detached one. `merge` takes a detached entity, copies its state
onto a managed instance, and returns **that** managed instance — a different object from the
one you passed in. So `em.merge(x)` followed by a mutation of `x` does nothing to the
database, silently, because the context never saw it. The rule is always "use the return
value of `merge`", and in practice, "never let an entity cross a transaction boundary."

**Q3. Why is `EntityManagerFactory` a singleton and `EntityManager` not?** `TRICKY`

The factory owns the parsed mapping model, the connection provider, the query plan cache and
the second-level cache — expensive to build, immutable thereafter, and genuinely thread-safe.
The `EntityManager` *is* the persistence context: cheap to create, bound to one thread, and
holding per-unit-of-work state (dirty snapshots, pending actions) that would corrupt if
shared. One factory per persistence unit per application; one `EntityManager` per
transaction.

**Q4. A service loads an entity, passes it to a `@Transactional` method in another bean,
which modifies it, and nothing is written. What's wrong?** `ADVANCED`

The entity was loaded outside a transaction, so the shared-`EntityManager` proxy created a
context that is closed when the method returns — the entity is detached. The second method
received a detached object; if it mutated the object it was given, nothing is managed and
nothing is written, and if it called `merge` and ignored the return value, the same thing.
The fix is either "load it inside the transaction" or "map to a DTO at the boundary" — and
the durable fix is the second one, because a detached entity crossing a service boundary is
a recurring, invisible class of bug.

**Q5. Compare `IDENTITY`, `SEQUENCE`, `TABLE` and `AUTO` generation.** `TRICKY`

`IDENTITY` needs the generated key back from the INSERT, so it forces an immediate
round trip and **disables JDBC insert batching**. `SEQUENCE` obtains the ID before the
INSERT, so batching works, at the cost of a sequence read (or allocation-pool inflation).
`TABLE` is fully portable and batchable but serialises every writer on a single counter row.
`AUTO` delegates to the provider, so you don't know which failure mode you have. Practical
default: `SEQUENCE` for throughput, `IDENTITY` when you need gap-free human-readable IDs and
inserts are rare.

**Q6. Why is `FetchType` `EAGER` the default for to-one associations?** `TRICKY`

It's the JPA specification's default (`@ManyToOne` and `@OneToOne` default to `EAGER`;
`@OneToMany` and `@ManyToMany` default to `LAZY`) and Hibernate follows it, so overriding it
is a portable decision. The spec's reasoning is that a to-one association is often part of
the owner's identity, so loading it eagerly is "the safe default" — a decision made in
1998 and mostly regretted in practice, because it means a single `find()` on an entity with
three to-one associations issues four queries before the caller has touched anything. The
defensible answer is to make every association explicitly `LAZY` and fetch deliberately,
which costs a second query when you genuinely need the association and saves two when you
don't.

**Q7. A team uses `@Data` on every entity. Walk me through what breaks and why.**
`STAFF`

Four things. `equals`/`hashCode` over mutable fields means an entity in a `HashSet` becomes
unfindable after dirty checking updates one of those fields. `toString` over associations
produces a `StackOverflowError` on any bidirectional mapping, and the log line that triggers
it is usually the one that was just added for debugging. `@Data` suppresses the no-args
constructor, so the next person to add `@Builder` gets a runtime
`Unable to invoke no-args constructor` instead of a compile error. And `@Data`'s setters
make it trivially easy to mutate a managed entity and have it written to the database with
no `save()` call anywhere in sight. The fix is a hand-written `equals`/`hashCode` based on
ID with a constant hash, a `toString` that excludes associations, and an ArchUnit rule that
bans `@Data` on `@Entity`.

**Q8. When would you deliberately use `Ordinal` for an enum?** `TRICKY`

Only when the enum is a closed set that will never change and the column is internal —
never surfaced, never reported on, never joined to a table another team owns. Even then you
should ask whether the saving matters: a `SMALLINT` instead of a `VARCHAR(32)` is a few
bytes per row, and the moment someone adds a constant in the middle of the enum, every
existing row silently changes meaning. The usual reason people reach for it is that the
default is `ORDINAL` and nobody ever wrote `EnumType.STRING` — which is the answer to give
in the interview.

> **CHAPTER 1 SUMMARY**
>
> JPA is the specification; Hibernate is the implementation that adds dirty checking, the
> first-level cache snapshot, HQL, batch fetching and a second-level cache. The one concept
> everything else depends on is the **persistence context as an identity map** — the reason
> mutating a managed entity is a write, the reason `getReference` can avoid the database,
> and the reason a context that outlives its transaction goes stale. `persist` and `merge`
> differ in one sentence — `persist` needs a new object and `merge` returns a *different*
> managed one — and that sentence explains most of the silent-write-loss bugs in this area.
> The mapping defaults are where teams get hurt: `ORDINAL` enums silently re-interpret
> stored data, `IDENTITY` silently disables insert batching, eager to-one associations issue
> queries nobody asked for, and Lombok's `@Data` puts mutable-field `equals` and
> association-walking `toString` on every entity in the codebase.

#### Further Reading

- [Vlad Mihalcea — Equals and HashCode with JPA and Hibernate](https://vladmihalcea.com/hibernate-facts-equals-and-hashcode/) — the definitive treatment of why the naive generated `equals` is wrong and what the constant-hash trick buys.
- [Vlad Mihalcea — The First-Level Cache](https://vladmihalcea.com/jpa-hibernate-first-level-cache/) — the identity map and the dirty-checking snapshot, explained as one mechanism rather than two.
- [Vlad Mihalcea — Portable ID Generation: Sequence or Identity](https://vladmihalcea.com/how-to-replace-the-table-identifier-generator-with-either-sequence-or-identity-in-a-portable-way/) — the ID-generation trade-off with the actual batching consequence.
- [Vlad Mihalcea — Schema Generation and `hbm2ddl.auto`](https://vladmihalcea.com/hibernate-hbm2ddl-auto-schema/) — what the schema-generation settings actually do, and why they are not a migration tool.
- [Spring Framework Reference — ORM and JPA](https://docs.spring.io/spring-framework/reference/data-access/orm.html) — how Spring wraps Hibernate: the shared `EntityManager` proxy, exception translation, and transaction integration.

## Chapter 2 — Spring Data Repositories

### 2.1 The Interface Hierarchy

```text
                       Repository<T, ID>              (marker — no methods)
                              │
              ┌───────────────┴───────────────┐
              │                               │
    CrudRepository<T, ID>         PagingAndSortingRepository<T, ID>
    save/findById/existsById      + findAll(Sort) + findAll(Pageable)
    findAll/deleteAll/…                     │
              │                             │
              │              ListPagingAndSortingRepository  (Spring Data 3.0+)
              │              + findAll() returning List, + findAllBy(Sort)
              │                             │
              └───────────────┬─────────────┘
                              │
                      JpaRepository<T, ID>
                      + flush() / saveAndFlush()
                      + deleteAllInBatch()          ← the batch one
                      + getOne() / getById()         ← deprecated in 3.x
                      + getReferenceById()           ← the current answer
```

| Interface | Adds | Use it when |
| --- | --- | --- |
| `Repository` | Nothing. A marker. | You want to declare a dependency without exposing persistence operations |
| `CrudRepository` | `save`, `findById`, `existsById`, `findAll`, `count`, `deleteById`, … | In a service you only need whole-aggregate operations |
| `PagingAndSortingRepository` | `findAll(Sort)`, `findAll(Pageable)` returning `Page` | You have a list endpoint and no need to save |
| `ListCrudRepository` (3.0+) | `List<T>`-returning variants: `findAllById`, `saveAll` | You want `List` and no paging — the pre-2.x, non-`Iterable` API |
| `ListPagingAndSortingRepository` (3.0+) | `List<T> findAll(Sort)`, `List<T> findAll(Pageable)` | Paging without a total count |
| `JpaRepository` | `flush`, `saveAndFlush`, `deleteAllInBatch`, `getReferenceById`, `@Lock` support, `JpaSpecificationExecutor` (if extended) | Almost always — and the cost of taking it is that you now have JPA-specific types in your service layer |

> **INTERVIEW TRAP**
>
> "Use `CrudRepository` and stay persistence-agnostic" scores about zero, because the
> abstraction is a lie at the level that matters. `CrudRepository.save` returns `void` and
> hands you **no ID back** for a new entity with a non-`IDENTITY` generator — the single
> most common complaint about it. `ListCrudRepository` fixes the return type but nothing
> else. And the moment you need `getReferenceById` to avoid a query, `@Lock` for
> pessimistic locking, or a `Specification`, you're on `JpaRepository` and leaking a JPA
> concept into your service. The honest staff-level framing is that Spring Data's
> repository abstraction is genuinely good at **CRUD on a single aggregate** and is the
> wrong tool for everything else, and the interface you pick is a smaller decision than the
> queries you write.
>
> The version detail that catches people: Spring Data 3.0 (Boot 3) added the `List*`
> interfaces, and deprecated `getOne()` and `getById()` in favour of `getReferenceById()`.
> `getOne()` throws `EntityNotFoundException` lazily if you dereference a nonexistent
> reference — a behaviour that produced a lot of production 404s that were 500s.

### 2.2 `save()` and the `isNew` Detection

`SimpleJpaRepository.save()` is the single most misunderstood method in Spring Data JPA:

```java
// decompiled, essentially:
@Transactional
public <S extends T> S save(S entity) {
    if (entityInformation.isNew(entity)) {
        em.persist(entity);
        return entity;
    } else {
        return em.merge(entity);
    }
}
```

`isNew` decides which branch, and the default implementation checks whether the ID is
`null` (or, for a primitive-typed ID, whether it's the default value `0`). The consequences
are not subtle once you know them:

| Situation | `isNew` says | What `save()` does | The bug |
| --- | --- | --- | --- |
| New entity, `Long id` still `null` | new | `persist` | Correct |
| New entity, `long id` defaulting to `0` | new | `persist` | Correct — this is why primitive IDs get a special check |
| Existing entity loaded, ID set | not new | `merge` | Correct |
| **New entity with an application-assigned ID** (`@UuidId`, a natural key, a manually set `UUID`) | **not new** | `merge` | The INSERT still happens (merge inserts a transient copy), but you get a `SELECT` first, and `merge` returns a *different* instance — so `save` returns something other than what you passed in |
| Entity with a `@Version` field already set to a non-null value (e.g. copied from a DTO) | not new | `merge` | Same class of surprise |

The fix, when you use assigned IDs, is to override the detection:

```java
public interface OrderRepository extends JpaRepository<Order, UUID> {

    @Override
    default boolean isNew(Order entity) {
        return entity.getId() == null;
    }
}
```

**`@Transactional(readOnly = true)` is worth flagging here too.** `SimpleJpaRepository`
marks its class-level `@Transactional(readOnly = true)` and puts `@Transactional` on the
mutating methods, so reads get the read-only treatment for free — which, in Hibernate,
means `FlushMode.MANUAL` (no dirty check, no accidental writes) and a driver-level hint
that the connection won't be used to modify. See Chapter 7.

### 2.3 Derived Query Methods — the Grammar, and How It Fails

The naming convention is a small language. Knowing it well is a genuine productivity
difference; knowing where it stops is what makes you a senior.

```java
public interface ProductRepository extends JpaRepository<Product, Long> {

    // ── Subject ────────────────────────────────────────────────────────────────
    Optional<Product> findBySku(String sku);
    List<Product>      readBySku(String sku);
    List<Product>      getBySku(String sku);
    Optional<Product>  queryBySku(String sku);
    long               countByStatus(ProductStatus status);
    boolean            existsBySku(String sku);
    void               deleteByStatus(ProductStatus status);

    // ── Limiting ───────────────────────────────────────────────────────────────
    List<Product>  findTop5ByStatus(ProductStatus s);
    List<Product>  findFirstByStatus(ProductStatus s);
    Optional<Product> findTopByStatusOrderByPriceAsc(ProductStatus s);
    List<Product>  findDistinctByBrand(String brand);

    // ── Condition keywords ─────────────────────────────────────────────────────
    List<Product> findByName(String name);                 // =
    List<Product> findByNameIgnoreCase(String name);
    List<Product> findByNameContaining(String fragment);    // LIKE %fragment%
    List<Product> findByNameStartingWith(String prefix);    // LIKE prefix%
    List<Product> findByNameEndingWith(String suffix);      // LIKE %suffix%
    List<Product> findByPriceGreaterThan(BigDecimal p);
    List<Product> findByPriceBetween(BigDecimal lo, BigDecimal hi);  // BETWEEN, inclusive
    List<Product> findByStatusIn(Collection<ProductStatus> s);
    List<Product> findByStatusNotIn(Collection<ProductStatus> s);
    List<Product> findByDeletedAtIsNull();
    List<Product> findByNameIsNotNull();
    List<Product> findByNameNot(String name);

    // ── Composition ────────────────────────────────────────────────────────────
    List<Product> findByStatusAndPriceLessThan(ProductStatus s, BigDecimal max);
    List<Product> findByStatusOrCategoryId(ProductStatus s, Long categoryId);
    List<Product> findByBrandAndStatusNotAndPriceBetween(String b, ProductStatus s,
                                                         BigDecimal lo, BigDecimal hi);

    // ── Traversal ──────────────────────────────────────────────────────────────
    List<Product> findByCategoryName(String name);            // implicit join
    List<Product> findByCategoryParentName(String name);      // implicit join, nested
    List<Product> findByCategoryIdIn(List<Long> ids);

    // ── Return-type-driven modifiers ───────────────────────────────────────────
    Optional<Product> findFirstBySku(String sku);
    boolean           existsBySkuAndStatus(String sku, ProductStatus s);
    Page<Product>     findByStatus(ProductStatus s, Pageable p);
    Slice<Product>    findByStatus(ProductStatus s, Pageable p);   // no count — Ch. 6
    Stream<Product>   findByStatus(ProductStatus s);

    // ── Modifying ──────────────────────────────────────────────────────────────
    @Modifying
    @Query("update Product p set p.status = :new where p.status = :old")
    int bulkSetStatus(@Param("old") ProductStatus old, @Param("new") ProductStatus n);
}
```

The grammar is roughly:

```text
[subject][Distinct][Top N | First N][By][conditions][OrderBy ...][Asc|Desc]*

subject     = find | read | get | query | count | exists | delete | remove
condition   = <Property> <Operator> (<Value>)  joined by And / Or
property    = camelCase path, "." means a JOIN (implicit join to an association)
operator    = Is | Equals | Not | In | NotIn | Between | IsNull | IsNotNull |
              Contains | StartingWith | EndingWith | True | False |
              LessThan | LessThanEqual | GreaterThan | GreaterThanEqual |
              Not( ... )  | Between( ... )  |  Negating( ... )
```

**The parse failure is loud and the message is good**, which is a genuine advantage of
this design:

```text
org.springframework.data.repository.query.QueryMethodParseException:
  At line 1, column 51: Error parsing 'findByStatusAndPriceLess'
  near 'ByStatusAndPriceLess(...)': Cannot resolve 'PriceLess'
```

Two things to say about this in an interview. First, the method is only validated at
**context startup**, not at compile time — which means a broken query takes down startup,
not deployment, and CI catches it only if the test slice boots a context. Second, the
parse error names the *unparsed fragment*, so the diagnosis is mechanical: the parser
couldn't find a property, a keyword, or an `And` boundary. A typo like `findByStatuss`
becomes "cannot resolve property 'Statuss'" and is a five-second fix; a genuinely
unsupported condition becomes "write it in `@Query`", and the *threshold at which you
switch* is the real design decision.

> **TRADE-OFF**
>
> Derived query methods are compile-time invisible, IDE-unindexable, and reviewable only by
> a human who knows the grammar. `@Query` is greppable, refactor-safe (rename a property
> and the compiler — or at least the IDE's SQL view — tells you), and the only option for
> anything the grammar can't express. The flip condition is real though: derived methods
> make trivial queries genuinely trivial, and for `findByStatusAndPriceLessThan` the
> derived form is *clearer*. The staff-level rule that holds up: **derived for
> single-property lookups, `@Query` from the second association traversal onward** — the
> point where a human reader has to hold the whole name in their head is the point where
> the abstraction starts costing you.

### 2.4 `@Query` — JPQL, Native, and the `countQuery` Problem

```java
public interface ProductRepository extends JpaRepository<Product, Long> {

    // JPQL — entity and property names, parsed and validated by the provider
    @Query("""
           select p from Product p
           where p.status = :status
             and p.category.parent.id = :parentId
             and p.price between :min and :max
           """)
    List<Product> findInCategoryTree(@Param("status") ProductStatus status,
                                    @Param("parentId") Long parentId,
                                    @Param("min") BigDecimal min,
                                    @Param("max") BigDecimal max);

    // JPQL with a constructor expression — returns a DTO, not an entity
    @Query("select new com.acme.dto.ProductSummary(p.id, p.sku, p.name, p.price) "
           + "from Product p where p.status = com.acme.ProductStatus.ACTIVE")
    List<ProductSummary> findActiveSummaries();

    // Interface projection — Spring Data generates a proxy (Chapter 6)
    @Query("select p.id as id, p.sku as sku, p.name as name from Product p")
    List<ProductSummaryView> findSummaries();

    // Native SQL — your SQL, your dialect, your result mapping
    @Query(value = """
           select p.*, c.name as category_name, i.stock_on_hand as stockOnHand
           from products p
           join categories c on c.id = p.category_id
           left join inventory i on i.sku = p.sku
           where p.status = 'ACTIVE' and p.price >= :min
           """,
           countQuery = """
           select count(*) from products p
           join categories c on c.id = p.category_id
           left join inventory i on i.sku = p.sku
           where p.status = 'ACTIVE' and p.price >= :min
           """,
           nativeQuery = true)
    Page<ProductWithStock> findActiveInStock(BigDecimal min, Pageable pageable);

    // Dynamic sort — a parameter, not string concatenation
    @Query("select p from Product p where p.status = :status")
    List<Product> findByStatus(@Param("status") ProductStatus s, Pageable p);
}
```

Four things about `@Query` that are worth stating:

1. **JPQL in `@Query` IS validated at startup**, unlike derived names — including
   property names, which is the whole reason it's a compile-time-adjacent safety net. A typo
   in a property name in `@Query` fails at context refresh with
   `Could not resolve attribute` naming the attribute. That is a real advantage of `@Query`
   over a derived method that no amount of "derived methods are more readable" can dismiss.
2. **Binding by name requires `-parameters`** unless you use `@Param` explicitly. Spring
   Boot's Maven plugin sets this by default for the `spring-boot-starter-parent`; a
   different build, or a shade/relocation step that drops it, produces
   `Name for parameter binding must not be null` at startup.
3. **`countQuery` is not optional if the derived count is wrong.** Spring Data derives the
   count query by cloning the main query and replacing the select clause. That is correct for
   most JPQL and **wrong** for any query with a `join fetch` of a collection (it counts
   joined rows, so an order with 5 line items counts 5 times) and wrong for a `distinct`
   it can't translate. Both give you a total that is too high, and a UI showing "1,247
   results" for 340 real ones.
4. **Never concatenate user input into JPQL or SQL.** The string goes in as a named or
   positional parameter. A `sort` field name *is* a genuine injection vector if you
   concatenate it — which is why `Pageable`/`Sort` is passed as a parameter and translated
   by the provider, not built by string formatting. `Pageable.unpaged()` is also the correct
   answer to "the user hasn't scrolled yet", and is much faster.

### 2.5 `@Modifying` — and the Problem It Creates

```java
@Modifying
@Query("update Product p set p.status = :new, p.updatedAt = CURRENT_TIMESTAMP "
       + "where p.status = :old")
int bulkRetire(@Param("old") ProductStatus old, @Param("new") ProductStatus n);
```

A `@Modifying` query issues a **single** `UPDATE`/`DELETE` statement, which is orders of
magnitude faster than loading a million entities and setting a field. That is the appeal.
The cost is that it **bypasses the persistence context entirely**, and the failure is
silent:

```java
@Transactional
public void retire(ProductStatus from, ProductStatus to) {
    int n = repo.bulkRetire(from, to);

    // These are still managed, and their state is STILL the OLD state.
    for (Product p : repo.findAll()) {
        p.someOtherField = compute(p);        // Hibernate sees p as changed...
        // ...and generates: UPDATE products SET status='OLD_TO', some_other_field=?
        //                                     WHERE id = ?
    }
    // On flush, Hibernate writes back the OLD status. The bulk update is undone
    // for every one of these entities.
}
```

This is the single most surprising interaction in the chapter: **a bulk update followed by
dirty checking on entities the bulk update touched produces a write-back of stale data.**
The two fixes, and you need to know both:

```java
@Transactional
@Modifying(clearAutomatically = true, flushAutomatically = true)   // ── FIX 1
@Query("update Product p set p.status = :new where p.status = :old")
int bulkRetire(@Param("old") ProductStatus old, @Param("new") ProductStatus n);
```

| Flag | What it does | When you need it |
| --- | --- | --- |
| `flushAutomatically = true` | Flushes the persistence context **before** executing the bulk statement | When you have pending changes the query must see (an unflushed INSERT whose FK the `UPDATE` targets) |
| `clearAutomatically = true` | Calls `em.clear()` **after** the statement, detaching everything | When loaded entities must not be written back. **This is the one that prevents the data corruption.** |

```java
@Transactional
public void correctSequence() {                 // ── FIX 2: do it the right way
    for (Product p : repo.findByStatus(from)) {
        p.retire();                             // dirty checking, versioned, lifecycle-correct
    }
    // SimpleJpaRepository flushes at commit. Correct, auditable, and 100× slower.
}
```

The rule of thumb: **bulk operations for a large set you will not touch again; the
managed path for anything that shares a transaction with a read of the same rows.** And
`@Modifying` methods are `@Transactional` and must be called from within a transaction —
they throw `TransactionRequiredException` otherwise.

### 2.6 Where the Repository Pattern Is the Wrong Abstraction

This is the staff-level section, and it is the one that most candidates skip.

**The repository pattern works when the operation is CRUD on a single aggregate.** It stops
paying for itself in three distinct ways:

| Symptom | Why it's a problem | What to do instead |
| --- | --- | --- |
| The method name is 40 characters and contains four `And`s | The name *is* the query, and the query is now hidden in a Java identifier. No DBA, no log analyser, no APM tool, and no query cache knows this query exists | Move it to `@Query`, or to a custom fragment |
| You need a `JOIN FETCH`, a window function, a recursive CTE, or a `GROUP BY` with a projection the ORM can't map | The ORM's query language stops being an advantage and starts being an obstacle | Native SQL with an explicit mapping, or a hand-written mapper |
| There are 60 methods and 4 of them have 3 `JOIN FETCH`es with custom `countQuery`s | The abstraction promised to remove SQL, and now the interface is a wrapper around SQL that nobody can read | A custom repository fragment (`ProductRepositoryCustom`) with hand-written JDBC or JdbcClient |

```java
// The escape hatch, and the correct shape for it
public interface ProductRepository extends JpaRepository<Product, Long>,
                                    ProductRepositoryCustom {   // ← fragment interface
    // derived + @Query methods that genuinely belong here
}

public interface ProductRepositoryCustom {
    List<ProductSummary> topSellersByCategory(CategoryId id, Instant since, int limit);
    Map<ProductStatus, Long> countByStatusForUpdate();     // needs a lock
}

public class ProductRepositoryImpl implements ProductRepositoryCustom {   // ← "Impl" suffix
    // fragment: full access to EntityManager, or to a JdbcTemplate if you want raw SQL
}
```

> **STAFF-LEVEL CONSIDERATION**
>
> The real cost of the repository pattern is not verbosity — it is **observability**. A DBA
> asked "which queries touch `products` in the last hour" cannot answer it from Java. A log
> analyser cannot aggregate them. An APM tool cannot build a latency histogram per endpoint
> because the SQL is a runtime-generated string it has never seen. The database's own
> `pg_stat_statements` can, and it will show you queries your repository interfaces don't
> know exist.
>
> The organisational question, which is the one to raise unprompted, is: **where does the
> SQL live?** Three answers, all defensible. (1) Everything in the repository — highest
> cohesion, but your DBAs become second-class citizens and you accumulate unqueryable
> method names. (2) Everything in one dedicated query layer — greppable, DBA-friendly,
> but you re-implement a repository framework you already have. (3) A boundary: simple
> single-aggregate CRUD through Spring Data, anything with a `JOIN FETCH` or a projection
> through an explicit query object. (3) is what most mature teams converge on, and reaching
> it deliberately beats drifting into (1) and discovering the problem when the database is
> already a bottleneck.

#### Common Mistakes

- Ignoring `save()`'s return value with an assigned or application-generated ID — you get
  a managed copy and mutate the wrong object.
- Using `getOne()` / `getById()` (deprecated in Spring Data 3) instead of
  `getReferenceById()`, or expecting `getOne()` to return `null` for a missing row — it
  returns a proxy and throws on dereference.
- Assuming a `@Modifying` query's result is visible to the persistence context. It is not,
  and the stale entities will write the old value back.
- Omitting `clearAutomatically = true` on a bulk update — the data-corruption case above.
- Omitting `countQuery` on a native or fetch-join paginated query, and shipping a total
  count that counts joined rows.
- Writing a derived query with a `JOIN FETCH` you need for performance — derived methods
  cannot express fetch joins, so the method looks right and the N+1 is still there
  (Chapter 3).
- Concatenating a sort field or a filter value into `@Query`. Named parameters only; and
  for sort, pass a `Sort` object.
- Declaring `Repository` (the marker) and then hand-rolling `findById` in every
  implementation, when `CrudRepository` gives it to you.
- Relying on `-parameters` without checking the build actually sets it, so every
  parameterless `@Query` fails at startup with a name-binding error that names no
  parameter.

#### Interview Questions — Spring Data Repositories

**Q1. Walk me through `SimpleJpaRepository.save()` and when it surprises people.** `TRICKY`

It calls `entityInformation.isNew(entity)`; if true it calls `em.persist(entity)` and
returns *your* instance, otherwise it calls `em.merge(entity)` and returns *a different*
managed instance. `isNew` defaults to "is the ID null", so it surprises you in two places:
with an application-assigned ID a genuinely new entity is classified as existing (you get
a wasted `SELECT` and a `merge`), and with a primitive `long` ID the default value `0` is
treated as new, which is a subtlety that catches people on the way *in* rather than out.

**Q2. A `@Modifying` bulk update "doesn't stick". What's the mechanism?** `ADVANCED`

The bulk `UPDATE` runs outside the persistence context, but the entities already loaded in
that context still hold the old field values and are still managed. When the transaction
flushes, Hibernate dirty-checks those entities, sees changes, and issues
`UPDATE ... SET status = <old value>, <other changed field> = ?` — writing the stale status
back and undoing the bulk update. It only affects rows that are both in the bulk set and
loaded in the same context, which is why it reproduces intermittently in production and
never in a test that doesn't also load them.

**Q3. When do you need `clearAutomatically` and `flushAutomatically`?** `TRICKY`

`flushAutomatically` flushes pending changes *before* the bulk statement, for when the
query must see them — an unflushed INSERT whose row the `UPDATE` is targeting, most
commonly. `clearAutomatically` detaches everything *after*, and it's the one that prevents
the stale-write-back described above. In practice `clearAutomatically = true` is what you
want nearly every time, and `flushAutomatically = true` when the bulk query's target rows
include rows this same transaction just inserted.

**Q4. A derived method name doesn't parse. What does the error tell you, and when does it
appear?** `TRICKY`

`QueryMethodParseException` naming the unparsed fragment — the parser consumed what it
understood and stopped at the first token it couldn't resolve to a property, a keyword, or
an `And`/`Or` boundary. The timing matters more than the message: it happens at **context
startup**, not at compile time, so a broken method name takes down the application's boot,
and CI only catches it if the test slice actually boots a context. That's an argument for
keeping at least one integration test that starts the full context.

**Q5. Why does a paginated `JOIN FETCH` query return the wrong rows, and what should you
do?** `ADVANCED`

The `JOIN FETCH` multiplies the result set — an order with 5 line items produces 5 rows —
and the database applies `LIMIT`/`OFFSET` to the *joined* rows, not to the distinct orders.
So page 1 of size 20 can contain 4 orders, and a row that should be on page 3 can appear on
page 1. Hibernate 6 warns about this (`HHH000104`) and offers
`hibernate.query.fail_on_pagination_over_collection_fetch`. The correct fixes, in order of
preference: fetch the collection with a second query (`@BatchSize`, a second `@Query`, or
`@EntityGraph` on a separate call), or paginate by ID in a subquery and fetch outside the
paginated query.

**Q6. When is Spring Data's repository abstraction the wrong tool?** `STAFF`

When the query is not CRUD on a single aggregate: window functions, recursive CTEs,
multi-join reports, projections the ORM can't map, or bulk aggregation. Then you're writing
SQL inside a method name anyway, except the SQL is now invisible to every tool — the log
analyser, the APM trace, and the DBA. The right move is a custom repository fragment with an
explicit result mapping, not a longer method name. The deeper argument is observability:
the abstraction removes the one artifact (the SQL) that the entire performance ecosystem
indexes on.

**Q7. A `Page<Product>` endpoint is slow. What's on the list, in order?** `STAFF`

The count query first — it is often a full scan of a filtered set and is frequently the
majority of the latency; `Slice` or `Pageable.unpaged()` fixes it if the UI doesn't need a
total. Then the offset: a deep page makes the database read and discard every skipped row,
so page 500 of size 20 costs 10,000 row reads. Then N+1 on the returned entities (Chapter 4)
— the count is one query but the rendering is fifty. Then the missing tiebreaker column on
the sort, which makes the count itself non-deterministic under concurrent writes. Then
whether the query is even sargable: a `LIKE '%foo%'` or a function call on an indexed column
turns an index scan into a full scan. And then the pool: 60 concurrent requests each needing
a connection, against a pool of 10, is a queue, not a database problem (Chapter 7).

**Q8. Your repository interface has 60 methods and a new team member can't tell which ones
are safe to call inside a transaction. What would you change?** `STAFF`

Three things, in order of value. (1) Make the read/write boundary explicit — separate
`ProductQueryRepository` (returning DTOs, `readOnly = true`) from the aggregate repository,
so "which is safe" is answered by the type rather than by reading 60 signatures. (2) Move
anything with a `JOIN FETCH` or a custom count into a fragment with a name that says what it
costs. (3) Get to the DTO boundary — every method returning an entity is a method that can
be called wrong, and every method returning a DTO is a method that can only be used
correctly. The measurement to make first is simply: how many of those 60 methods are called
from outside the aggregate's own service? That number is your actual repository size.

> **CHAPTER 2 SUMMARY**
>
> Spring Data's repository abstraction is excellent at CRUD on a single aggregate and
> degrades from there. `save()` is `persist`-or-`merge` decided by an `isNew` check that
> surprises you exactly when IDs are application-assigned. Derived query methods are a real
> language with a loud parse error at startup; `@Query` adds compile-time property
> validation and the ability to express what the grammar can't, and both have a threshold
> where you should switch. `@Modifying` is fast and dangerous in equal measure, because the
> bulk statement bypasses the persistence context and loaded entities will write the old
> values back — `clearAutomatically = true` is the fix you need nearly every time. The
> staff-level point is observability: hiding SQL behind a Java identifier hides it from the
> log analyser, the APM trace, and the DBA, and that is the cost that eventually makes
> teams move to an explicit query layer.

#### Further Reading

- [Spring Framework Reference — ORM Integration](https://docs.spring.io/spring-framework/reference/data-access/orm.html) — the shared `EntityManager` proxy and the exception translation that makes repositories work.
- [Vlad Mihalcea — Bulk Update and Delete with JPA and Hibernate](https://vladmihalcea.com/bulk-update-delete-jpa-hibernate/) — the authoritative treatment of why bulk operations bypass the persistence context and what that costs.
- [Vlad Mihalcea — Detecting the N+1 Problem During Testing](https://vladmihalcea.com/how-to-detect-the-n-plus-one-query-problem-during-testing/) — the query-count assertion, which is the only reliable detector (Chapter 4).
- [Spring Data Reference — Repository Query Keywords](https://docs.spring.io/spring-data/jpa/reference/repositories/query-keywords-reference.html) — the full derived-query grammar, including every keyword the parser accepts.

## Chapter 3 — Entity Relationships & Fetch Strategies

### 3.1 The Four Association Types, and Who Owns What

```text
   @OneToOne        Customer ────1:1──── Passport
        (FK on one side only; unique constraint required)

   @ManyToOne       Order ────N:1──── Customer        ◄── THE COMMON ONE
   @OneToMany       Customer ────1:N──── Order        ◄── usually mappedBy, inverse

   @ManyToMany      Product ────N:M──── Category      ◄── needs a join table
                    @JoinTable(name="product_category",
                               joinColumns=@JoinColumn(name="product_id"),
                               inverseJoinColumns=@JoinColumn(name="category_id"))
```

```java
@Entity
public class Customer {

    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private String name;

    // ── Inverse side: this side owns NOTHING in the schema ────────────────────
    @OneToMany(mappedBy = "customer", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<Order> orders = new ArrayList<>();

    // ── The helper that makes the bidirectional association work ───────────────
    public void addOrder(Order order) {
        orders.add(order);
        order.setCustomer(this);            // ◄── THIS is the line people forget
    }

    public void removeOrder(Order order) {
        orders.remove(order);
        order.setCustomer(null);
    }
}
```

**Owning side vs inverse side** is the concept most of the volume builds on:

| | Owning side | Inverse side |
| --- | --- | --- |
| Has | `@JoinColumn` (for to-one) or `@JoinTable` (for to-many), or the plain FK field | `mappedBy = "<the owning side's field name>"` |
| Column in the schema | Yes | No |
| Hibernate writes to it on flush? | **Yes** | **No** — silently ignored |
| If you set only this side | Works | **Nothing happens. No error.** |

```java
// ❌ Silently does nothing
order.setCustomer(customer);        // this is the OWNING side — correct, this works
customer.getOrders().add(order);   // this is the INVERSE side — Hibernate IGNORES it

// ✅ The two-sided update
customer.addOrder(order);          // sets both sides; the owning side is what gets written
```

> **MUST REMEMBER**
>
> **A bidirectional association is two fields, and only one of them is real.** The owning
> side is what Hibernate writes to the database. Mutating the inverse side is not a no-op
> with a side effect — it is a **complete no-op**, and if the owning side was never set,
> the row is inserted with a null foreign key. This is why the `addX`/`removeX` helper
> pattern exists: not for elegance, but because a hand-written one-sided update is
> indistinguishable from code that does nothing, both to the reader and to the runtime.

### 3.2 `orphanRemoval` and the "Deleted Rows Come Back" Bug

```java
@OneToMany(mappedBy = "customer", cascade = CascadeType.ALL, orphanRemoval = true)
private List<Order> orders = new ArrayList<>();
```

| Annotation | What it does | What it does NOT do |
| --- | --- | --- |
| `cascade = ALL` | Propagates `persist`, `merge`, `remove`, `refresh`, `detach` from parent to children | Detect that you removed a child from the collection |
| `orphanRemoval = true` | On flush, `DELETE`s rows that are no longer in the collection | Help if you only set the child's FK to null instead of removing it from the collection |

The "deleted rows come back" bug is worth understanding precisely, because it is one of the
most-reproduced JPA bugs and the cause is genuinely non-obvious:

```java
@Transactional
public void deleteOrder(Long orderId) {
    Customer customer = customerRepo.findById(id).orElseThrow();
    Order order = orderRepo.findById(orderId).orElseThrow();

    order.setCustomer(null);              // ◄── "detach the orphan"

    customerRepo.save(customer);          // ◄── flush happens here
    orderRepo.delete(order);              // ◄── and this
}
// Result: the row is still there.
// Because: `remove(order)` is a queue operation, but `order.setCustomer(null)` mutated an
// entity that Hibernate now considers... and if the Order is detached or the delete is
// executed before the flush, or a later `merge(customer)` re-attaches it — the row stays.
```

The correct version removes from the collection **and** deletes, in that order, inside the
transaction:

```java
@Transactional
public void deleteOrder(Long orderId) {
    Order order = orderRepo.findById(orderId).orElseThrow();
    order.getCustomer().getOrders().remove(order);   // orphanRemoval now DELETEs it
    orderRepo.delete(order);                         // belt and braces; harmless
}
```

`orphanRemoval` is only valid on the **owner** of the relationship, and it only works on
`@OneToOne` and `@OneToMany` — a `@ManyToMany` cannot use it, because a row missing from
the join table isn't "orphaned", it's just absent.

> **INTERVIEW TRAP**
>
> "You should use `cascade = REMOVE` instead of `orphanRemoval`." This confuses two things.
> `cascade = REMOVE` means "when the parent is deleted, delete the children" — an
> all-or-nothing consequence. `orphanRemoval` means "when a child *leaves the collection*,
> delete the row" — a per-child consequence. If a customer can be deleted with all their
> orders, you need `cascade = REMOVE`; if a customer can remove one order from their
> collection and expect the row to be gone, you need `orphanRemoval`. Many real mappings
> need both, and they are not alternatives.

### 3.3 LAZY vs EAGER — the Defaults, Precisely

The JPA specification's defaults, which Hibernate follows (and which Thorben Janssen's
tutorial states directly: *"All to-one associations use `FetchType.EAGER` and all to-many
associations `FetchType.LAZY`"*):

| Association | Spec default | What it means in practice |
| --- | --- | --- |
| `@ManyToOne` | **EAGER** | Every `find` on a `Order` issues an extra `SELECT` for the `Customer` |
| `@OneToOne` | **EAGER** | Same, plus a unique-constraint requirement that people trip over |
| `@OneToMany` | **LAZY** | A `PersistentBag` proxy; one `SELECT` when you first touch the collection |
| `@ManyToMany` | **LAZY** | A proxy over the join table |

The genuinely counter-intuitive part, and the thing to get right in the interview: **a
`@ManyToOne` is EAGER by default.** The "default lazy" folk memory is wrong, and it's wrong
in the expensive direction — the most common association in a typical domain model is the
one that fires an extra query on every single load. Teams often believe the defaults are all
lazy and are shocked to find the SQL log full of `left outer join customer`.

The **defensible convention**, and the one worth advocating in a design review:

> Make every association explicitly `LAZY`, with no exceptions. Then fetch deliberately,
> where you know you need it.

```java
@Entity
public class Order {

    @ManyToOne(fetch = FetchType.LAZY, optional = false)     // ← LAZY, explicitly
    @JoinColumn(name = "customer_id", nullable = false)
    private Customer customer;

    @OneToMany(mappedBy = "order", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<OrderLine> lines = new ArrayList<>();
}
```

The flip condition, stated honestly: EAGER is defensible for a small, immutable lookup that
is genuinely part of the owner's identity and is needed on every read — a `Currency`, a
`CountryCode`, an enum-like reference row. It is not defensible for anything with
associations of its own, because the eager load then cascades.

> **PRODUCTION RELEVANCE**
>
> `FetchType.EAGER` on a `@ManyToOne` is the reason a "fast" single-entity query takes
> 40ms. `em.find(Order.class, 1L)` in an IDE with SQL logging on will show two statements,
> not one, and the second one is in the log before you've touched anything. Because the
> fetch happens at query time rather than access time, it also defeats
> `@QueryHints` and entity graphs that say "I don't need this" — an EAGER association is
> fetched whether or not the caller uses it, which makes the "just add a projection to avoid
> loading it" optimisation impossible.

### 3.4 LAZY is Not Free

A lazy association is a **proxy**: a subclass instance with only the identifier set, created
by a bytecode-generated subclass that overrides every accessor to call the session and load
the real object on first use. That has three consequences, and all three cause incidents.

**1. Access outside a session throws `LazyInitializationException`.**

```java
@Service
public class OrderService {
    public OrderDto describe(Long id) {
        return orderRepo.findById(id)
            .map(o -> new OrderDto(o.getId(), o.getCustomer().getName()))  // ← boom
            .orElseThrow();
    }
}
// org.hibernate.LazyInitializationException: could not initialize proxy
//   - no Session (and hence no connection) is open through the current thread
```

**2. A lazy load inside a loop is an N+1 wearing a disguise.** This is the crucial one,
because the code *looks* fine and there is no `fetch join` anywhere to review:

```java
for (Order order : orderRepo.findAll()) {       // 1 query
    order.getLines().forEach(l -> total += l.getAmount());   // 1 query PER ORDER
}
// 1 + N. And the N+1 chapter is about exactly this.
```

**3. Lazy is not "eventually cheaper" — it's *deferred to a worse place*.** Moving the load
into the view layer (which is what Open Session in View does, Chapter 5) means the query
runs after the service method's transaction has closed, on a connection that's no longer
managed, in a code path nobody wrote a test for.

**Detached proxies and serialization** produce a third variant worth recognising:

```java
// Controller returns the entity. Jackson serializes it AFTER the transaction ends.
// → LazyInitializationException, or a stack trace full of HibernateProxy.
Order order = orderRepo.findById(id).orElseThrow();
order.getCustomer().getAddress().getPostcode();   // fine inside @Transactional
return order;                                       // and this is not
```

Two fixes, in order of preference: return a DTO (which is what you want anyway), or if you
must return the entity, initialise the associations inside the transaction.

### 3.5 `@EntityGraph` and `JOIN FETCH`, and Their Three Failure Modes

The two ways to say "and I need this association, now, in the same query":

```java
// ── JPQL ─────────────────────────────────────────────────────────────────────
@Query("select distinct o from Order o join fetch o.customer where o.status = :s")
List<Order> findWithCustomer(@Param("s") OrderStatus s);

@Query("select o from Order o left join fetch o.lines where o.id = :id")
Optional<Order> findWithLines(@Param("id") Long id);

// ── Entity graph — declarative, reusable, and overridable per query ────────────
@EntityGraph(attributePaths = {"customer", "lines"})
Optional<Order> findWithAssociationsById(Long id);       // overrides the mapping's fetch

@EntityGraph(attributePaths = {"customer.address"})
Page<Order> findByStatus(OrderStatus status, Pageable pageable);

// Dynamic — a named graph as a parameter, chosen at runtime
@EntityGraph("Order.customer")
List<Order> findByStatus(OrderStatus status);

// Subgraphs — the only way to express a multi-level fetch
@EntityGraph(attributePaths = {"customer", "lines.product", "lines.product.category"})
List<Order> findDeep();
```

`JOIN FETCH` in JPQL, `join fetch` in HQL, and `@EntityGraph` are different mechanisms
doing the same job: the first is a query hint, the second is a per-query override of the
fetch plan. `@EntityGraph` wins when the same association set is needed by several queries,
because you can name it once and override it per call.

Three failure modes, all of which you will be asked about:

**1. Multiple bag fetches throw `MultipleBagFetchException`.**

```java
@Query("select o from Order o join fetch o.lines join fetch o.exchanges")
// org.hibernate.loader.MultipleBagFetchException: cannot simultaneously fetch multiple bags
//   (with one join); need additional queries to the entity using the "with" clause
```

A "bag" is a `List` field with no `@OrderColumn` — Hibernate cannot put two of them in one
result set because both are `List` (not `Set`), and there is no column to disambiguate
which collection a repeated row belongs to. The fix: make one a `Set` (e.g.
`Set<OrderLine>`), which Hibernate can de-duplicate by primary key, or fetch one of them
with a second query. **The same problem does NOT apply to `Set` collections** — two `Set`
fetch joins work fine, so the naive "one collection per query" rule is wrong and the
`List`-vs-`Set` detail is what the interviewer is testing.

**2. A fetch join combined with pagination fetches the wrong rows.** Covered in Chapter 2,
worth restating: `LIMIT` applies to the *joined* rows, so page 1 of 20 contains however many
distinct orders those 20 rows represent. Hibernate 6 logs
`HHH000104: firstResult/maxResults specified with collection fetch; applying in memory!` —
which is even worse than the wrong-rows version: it fetches **all** rows and pages in
memory. `Slice` and `Pageable` plus a separate fetch is the fix.

**3. `join fetch` on an optional to-one association turns it into an inner join.** In JPQL,
`join fetch o.customer` excludes orders with a null customer; `left join fetch o.customer`
keeps them. If the association is `optional = false` this is invisible — and if it isn't,
you get a missing row with no error. This is a classic production-only data problem.

> **STAFF-LEVEL CONSIDERATION**
>
> The honest position on EAGER vs LAZY is that neither is the answer — **what the caller
> needs** is the answer, and that's a per-query property, not a per-mapping one. The
> EAGER/LAZY annotation on the mapping is a *default for the mapping*, and every value of it
> is a compromise: EAGER optimises for code that needs the association and penalises code
> that doesn't; LAZY optimises for code that doesn't and adds a failure mode
> (`LazyInitializationException`) to code that does. The mature position is all-LAZY
> mappings plus deliberate fetch at every call site, and the discipline that makes it
> work is a **query-count assertion in the test suite** (Chapter 4) — because without one,
> "deliberate" silently decays back into "whatever the defaults did".

#### Common Mistakes

- Setting only the inverse side of a bidirectional association. It is not a partial write;
  it is nothing, and the row persists with a null FK.
- Believing `@ManyToOne` defaults to LAZY. It is **EAGER** by default, and the extra query
  fires on every single load.
- Expecting `cascade = ALL` to delete orphaned children. It does not — that's
  `orphanRemoval`, and without it removing a child from the collection is a no-op.
- Using `orphanRemoval` on the inverse side, or on a `@ManyToMany`, where it is not
  supported.
- Two `List` (bag) collections in one `join fetch`, and getting
  `MultipleBagFetchException`. The rule is "two bags" not "two collections" — two `Set`s
  is fine.
- `join fetch` on a nullable to-one association, which silently becomes an inner join and
  drops rows.
- `join fetch` on a collection in a paginated query, producing `HHH000104` and either wrong
  rows or a full in-memory page.
- Returning an entity from a controller. Jackson serializes it after the transaction, and
  the association graph is either uninitialized or a `HibernateProxy` that leaks into the
  JSON.
- Using `join fetch` in a derived method name. It can't be expressed — the method compiles,
  parses, and returns exactly the N+1 you were trying to fix.

#### Interview Questions — Relationships & Fetch Strategies

**Q1. What are the JPA default `FetchType`s, and why does the answer surprise people?**
`TRICKY`

To-one associations (`@ManyToOne`, `@OneToOne`) default to **EAGER**; to-many
(`@OneToMany`, `@ManyToMany`) default to **LAZY**. The surprise is that the most common
association in a typical model — `@ManyToOne` — is the eager one, so every `find` on an
`Order` issues a second query for the `Customer` whether the caller touches it or not. The
defensible convention is to declare every association explicitly `LAZY` and fetch
deliberately, with EAGER reserved for tiny immutable reference data.

**Q2. What is the owning side, and what's the actual failure mode of getting it wrong?**
`TRICKY`

The owning side holds the `@JoinColumn`/`@JoinTable` (or the plain FK field) and is the only
side Hibernate writes. The inverse side has `mappedBy` and is never written. Setting only
the inverse side is not a partial write — it is a **complete no-op**: the collection looks
correct in memory, the flush writes nothing, and the row ends up with a null foreign key.
That's why the `addChild` helper pattern exists: it's the enforcement mechanism, not a
stylistic convenience.

**Q3. `cascade = REMOVE` vs `orphanRemoval = true` — what's the difference?** `TRICKY`

`cascade = REMOVE` propagates the *removal of the parent* to the children — all or nothing.
`orphanRemoval` reacts to a child *disappearing from the collection* — one at a time. A
customer deletion needs the first; a customer removing a single line from their order needs
the second. They are not alternatives, and many mappings want both. The classic bug is
having only `cascade = ALL` and expecting `removeFromCollection` to delete the row — it
doesn't, and the row stays with a dangling FK.

**Q4. Why does `MultipleBagFetchException` mention "bags"?** `ADVANCED`

A bag is a `List` field with no `@OrderColumn`. Hibernate can only put one `List` in a result
set because there is no column telling it which collection a repeated row belongs to.
`Set` collections don't have this problem because rows can be de-duplicated by primary key.
So `join fetch` on two `Set` associations works fine, and the widely-repeated advice
("only fetch one collection per query") is wrong — the constraint is specifically on
`List`-typed fields.

**Q5. A paginated query with a fetch join returns 12 items on a page of size 20. Why?**
`ADVANCED`

The join multiplies rows — an order with 5 line items is 5 rows — and `LIMIT`/`OFFSET` is
applied by the database to the joined rows, not to the distinct root entities. So the page
contains however many distinct orders those 20 rows happen to represent. Hibernate 6 warns
with `HHH000104` and, in some configurations, fetches everything and pages in memory. The
fixes are a second query for the collection, a `@BatchSize`, or paginating a subquery of IDs
and fetching outside it.

**Q6. When is EAGER actually the right answer?** `TRICKY`

For a small, immutable, genuinely-always-needed reference — a `Currency`, a `CountryCode`, a
fixed `FeeSchedule` — where the extra query per load costs more than the couple of columns
it pulls, and where the association has no associations of its own (or the eager load
cascades). It stops being defensible the moment the association is nullable, large, or
itself an aggregate root. And it's not defensible as a *global* policy, because the whole
point of `FetchType` is that the need for the association is a property of the caller, not
of the mapping.

**Q7. A `LazyInitializationException` in production, thrown from a controller. Give me the
full list of causes.** `STAFF`

The session closed and something touched an uninitialised proxy. The usual causes, in
order: the query was made outside a transaction (so the shared-`EntityManager` proxy's
context closed at method exit); the entity was loaded in a service and the access happened
in the view layer, where Open Session in View is the only reason it works at all; the entity
crossed a serialisation or message boundary; the method is `@Transactional` but the call was
a self-invocation, so the proxy never applied; or a fetch join wasn't declared and the
association was simply never loaded. The fix for the first four is the same — DTOs at the
boundary, entities never leaving a transactional method — and the fix for the fifth is
Chapter 4.

**Q8. A PR adds `join fetch` to a repository method to "fix the N+1". What should the
reviewer actually check?** `STAFF`

Four things. Does the method paginate? If so, this produces wrong pages or an in-memory
page, and it's worse than the N+1 it fixes. Is more than one `List` involved? Then it's a
`MultipleBagFetchException` at startup. Is the fetched association nullable? Then `join
fetch` is an inner join and rows are dropped. And — the one people miss — is the caller
actually inside a transaction with the session open? A fetch join outside one is fine
(because the join happens in the query), but it means the entities are now hydrated eagerly
in a context that may be short-lived, so any *remaining* lazy association is worse off than
before. A reviewer who only checks "does this reduce the query count" has missed three of
the four.

> **CHAPTER 3 SUMMARY**
>
> A bidirectional association is two fields and only one of them is real: the owning side
> holds the column and is the only one Hibernate writes, so a one-sided update is a
*complete* no-op, which is why the `addChild` helper pattern is an enforcement mechanism
> rather than a convenience. The default fetch types are `EAGER` for to-one and `LAZY` for
> to-many, and the to-one default is the expensive one — a defensible convention is
> all-LAZY mappings with deliberate fetches. LAZY is not free: it is a proxy that defers a
> query to first access, so it throws outside a session, it is an N+1 in disguise inside a
> loop, and it is a serialization bug in a controller. `@EntityGraph` and `JOIN FETCH` fix
> the query count and introduce three specific failure modes: multiple `List` bags, fetch
> join plus pagination, and inner-join semantics on a nullable association.

#### Further Reading

- [Thorben Janssen — JPA FetchTypes](https://thorben-janssen.com/entity-mappings-introduction-jpa-fetchtypes/) — the clearest statement of the actual spec defaults, which almost every blog gets backwards.
- [Vlad Mihalcea — The Importance of the Fetch Strategy](https://vladmihalcea.com/hibernate-facts-the-importance-of-fetch-strategy/) — fetch strategy as a first-class design decision rather than an annotation detail.
- [Vlad Mihalcea — Avoiding `MultipleBagFetchException`](https://vladmihalcea.com/hibernate-multiplebagfetchexception/) — why it's specifically bags, and the `Set` workaround.
- [Vlad Mihalcea — Join Fetch and Pagination](https://vladmihalcea.com/join-fetch-pagination-spring/) — the fetch-join-plus-pagination failure, with the `HHH000104` behaviour and the fixes.
- [Vlad Mihalcea — Eager Fetching Is a Code Smell](https://vladmihalcea.com/eager-fetching-is-a-code-smell/) — the argument for lazy-by-default and what it costs.

## Chapter 4 — The N+1 Problem

### 4.1 What It Is, with the SQL

An N+1 is not a Hibernate bug or a Spring Data bug. It is what happens when a query
returns N rows and the code then does something per row that requires *more* information.
The ORM's laziness makes it easy to write; the SQL log makes it visible.

```java
// The endpoint. Nothing here looks wrong. It reads like good, clean service code.
@GetMapping("/customers/{id}/orders")
public List<OrderDto> orders(@PathVariable Long id) {
    Customer customer = customerRepo.findById(id).orElseThrow();

    return customer.getOrders().stream()          // LAZY → ONE query here
        .map(o -> new OrderDto(
            o.getId(),
            o.getTotal(),
            o.getCustomer().getName(),            // ← LAZY, and NOT initialised
            o.getStatus().name(),
            o.getLines().size()))                 // ← LAZY, per order
        .toList();
}
```

```text
── 20 customers returned. The log looks like this: ──────────────────────────────

select  ... from customers where id = ?                                  -- 1 query

select  ... from orders where customer_id = ?                            -- 1 per customer
select  ... from orders where customer_id = ?                            --   "
select  ... from orders where customer_id = ?                            --   "
...                                                                      --   20x
select  ... from order_lines where order_id = ?                          -- 1 per order
select  ... from order_lines where order_id = ?                          --   "
...                                                                      --   80x
select  ... from order_statuses where id = ?                             -- 1 per order
...                                                                      --   80x

TOTAL: 181 queries for 20 rows. ───────────────────────────────────────────────
```

The counter-intuitive part, and the thing to explain in the interview: **the first query
is fast and the code is idiomatic.** N+1 doesn't show up as a slow query — every single
query is indexed, fast, and sub-millisecond. The cost is entirely **round trips**: 181
network hops across a 1ms link is 181ms of pure latency, and against a connection pool it
is 181 connection checkouts. On a same-host unix socket or a local docker network it
survives; over a 2ms cross-AZ link, or at 200 requests/second, it is the whole latency
budget.

> **INTERVIEW TRAP**
>
> "The queries are fast, so it's not an N+1 problem." It absolutely is. The unit of
> database cost that N+1 attacks is **round trips**, not per-query time. A p99 of 2ms per
> query across 180 queries is 360ms of latency with the database reporting a *low* average
> query time — which is precisely why N+1 hides from database monitoring and only shows up
> in the application. The second trap is "it's fine because there's an index": an index
> makes each of the 180 queries fast, and 180 fast queries are still 180 queries.

### 4.2 How to Detect It

Four detectors, in descending order of reliability.

**1. A query-count assertion in the test. This is the reliable one.**

```java
@DataJpaTest
class CustomerOrderQueryCountTest {

    @Autowired EntityManagerFactory emf;

    @Test
    void listingOrdersIssuesASaneNumberOfQueries() {
        // populate, in a separate transaction so the counted section is clean
        TestEntityManager entityManager = ...;

        HibernateStatistics stats = emf.unwrap(SessionFactory.class)
                                            .getStatistics();
        stats.setStatisticsEnabled(true);
        stats.clear();

        // ── THE MEASURED BLOCK ───────────────────────────────────────────
        List<OrderDto> dtos = new OrderService(customerRepo).orders(1L);
        // ─────────────────────────────────────────────────────────────────

        assertThat(stats.getPrepareStatementCount())
            .as("query count for %d orders", dtos.size())
            .isLessThanOrEqualTo(3);

        assertThat(stats.getEntityLoadCount()).isEqualTo(...);
    }
}
```

Why this is the only reliable detector: the N+1 is a property of the *combination* of a
query and the code that consumes it, and a unit test of either half cannot see it. The
test has to run the real query, in a real database, through the real mapping, and count the
statements. It is also the only detector that is a **control** rather than a diagnostic —
it fails a build instead of explaining a graph.

Vlad Mihalcea's `datasource-proxy` variant gives the same signal without hand-writing
assertions, by counting at the JDBC layer instead of the Hibernate layer (so it also catches
queries Hibernate issues internally, like lazy loads).

**2. Hibernate statistics in a running app.**

```properties
spring.jpa.properties.hibernate.generate_statistics=true
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.orm.jdbc.bind=TRACE
```

```java
SessionFactory sf = emf.unwrap(SessionFactory.class);
Statistics s = sf.getStatistics();
s.getPrepareStatementCount();     // total statements executed
s.getEntityLoadCount();           // entities hydrated
s.getQueryExecutionCount();       // HQL/Criteria queries
s.getCollectionFetchCount();      // collections loaded  ← the N+1 tells
s.clear();
```

`getCollectionFetchCount()` is the most useful of these and the one nobody knows: it counts
collection initialisations separately, so a page that issues 1 query but
`collectionFetchCount == 20` is an N+1 with a clean-looking query count. Also note the cost:
`generate_statistics` is not free and should never be on in production permanently —
Thorben Janssen's article on activating it is the right starting point for the overhead
question.

**3. The SQL log, read properly.** The mistake here is reading the log for *slow* queries.
An N+1's queries are all fast. The signal is **repetition** — the same statement shape,
hundreds of times, with different bind parameters. That's also what `pg_stat_statements`
shows: one query shape with a high `calls` count and a high `total_exec_time` and a tiny
`mean_exec_time`. That ratio — **many calls, tiny mean** — is the N+1 signature, and it's
the single most useful thing to teach someone reading `pg_stat_statements`.

**4. Reading it off a slow endpoint.** In an APM, an N+1 shows as a span waterfall with N
identical short child spans. In a flame graph, as a row of identical short stacks. In a
connection-pool dashboard, as pool checkout time spiking while query duration stays flat —
which is the diagnostic that distinguishes "the database is slow" from "we made too many
trips to the database", and the two have completely different fixes.

> **PRODUCTION SCENARIO**
>
> Problem: a report endpoint went from 300ms to 14s over two weeks of growth. The database
> CPU was 8%. Single-query p99 was 3ms. Connection pool utilisation was 97%.
> Investigation: the pool dashboard showed checkout wait time at 600ms with query duration
> flat — so the database was never the bottleneck. Enabling `generate_statistics` on a
> staging copy showed `prepareStatementCount = 1,247` for a request that should have been
> 3.
> Root cause: a new `@OneToMany` was added to the `Order` DTO three weeks earlier, and
> because `open-in-view` was `true`, the `lines.size()` access in the template rendered
> outside the service transaction — one query per order line.
> Solution: a constructor-expression projection that aggregates `count(lines)` in the
> database, and `open-in-view: false`.
> Prevention: the query-count assertion, added to the repository test template that every
> new query test uses. That is the control that makes it a template rather than a rule.

### 4.3 The Fixes, With Their Trade-Offs

| # | Fix | Queries for N rows | Kills it when | What it costs / breaks |
| --- | --- | --- | --- | --- |
| 1 | `JOIN FETCH` / `@EntityGraph` | 1 | The association is needed for every row | Breaks with **pagination** (wrong rows / `HHH000104`) and with **two `List` bags** (`MultipleBagFetchException`); makes the association mandatory in the result (inner join on a nullable `to-one`) |
| 2 | `@BatchSize(size = n)` | `ceil(N/n) + 1` | Only the *same* association, on entities already loaded | Silent until you notice the `in (…)` clause; the `IN` list grows; Hibernate needs `IN`-clause padding for old Oracle/MSSQL |
| 3 | `@Fetch(FetchMode.SUBSELECT)` | 2 total, regardless of N | The *same* association across the whole session | Bulk and blunt: one query for a collection that may not be needed, and can return rows for entities you don't care about |
| 4 | `default_batch_fetch_size` (global) | `ceil(N/n) + 1` | Every `to-one` and collection, everywhere | The best "set once" option, but changes behaviour of queries you didn't write and can hide N+1s rather than fix them |
| 5 | **DTO projection** (constructor expression / interface) | 1 | **Always** — because you didn't need the entities | You lose the persistence context, dirty checking, and lazy nav for that query. Which is the point. |
| 6 | Custom repository fragment (hand-written SQL) | Whatever you write | Never | You own the SQL, the mapping, and the database portability |
| 7 | Second-level / query cache | ~0 after warm | Reads that are genuinely cacheable | See §4.5 — usually not worth it |

```java
// ── 1. JOIN FETCH / @EntityGraph ────────────────────────────────────────────
@EntityGraph(attributePaths = {"lines", "lines.product"})
List<Order> findByStatus(OrderStatus status);          // 1 query

@Query("select o from Order o join fetch o.customer where o.id = :id")
Optional<Order> findOneWithCustomer(@PathVariable Long id);

// ── 2. @BatchSize ───────────────────────────────────────────────────────────
@Entity
public class Order {
    @OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
    @BatchSize(size = 50)                  // 20 orders → 1 + ceil(20/50) = 2 queries
    private List<OrderLine> lines;
}

// ── 3. @Fetch(SUBSELECT) — one query for the whole session ───────────────────
@Fetch(FetchMode.SUBSELECT)
@OneToMany(mappedBy = "order", fetch = FetchType.LAZY)
private List<OrderLine> lines;

// ── 4. Global, and the best "set it once" option ────────────────────────────
spring.jpa.properties.hibernate.default_batch_fetch_size=50

// ── 5. DTO PROJECTION — often the only real answer ──────────────────────────
@Query("""
       select new com.acme.dto.OrderRow(
           o.id, o.status, o.total, c.name,
           (select count(l) from OrderLine l where l.order = o))
       from Order o join o.customer c
       where o.status = :status
       """)
List<OrderRow> findRows(@Param("status") OrderStatus status, Pageable p);
```

> **MUST REMEMBER**
>
> **Fix 5 is usually the real answer, and the reason is not performance.** You were
> rendering 20 orders. You needed four scalar columns and one count per order. Every other
> fix is about how to *load entities you have no intention of using* in fewer round trips —
> a bet that the extra columns and the hydration cost are cheaper than the queries saved.
> Fix 5 doesn't make the same bet: it makes the query return exactly what the response
> needs and nothing else. The tell that you've reached it is when you notice that the N+1
> exists at all — the loop only ran because you were mapping entities to display a table.

### 4.4 `@BatchSize` and `@Fetch` in Detail

These two are the most underused Hibernate features in most codebases, and they're the
right answer more often than a fetch join, because they have none of the pagination and
bag-fetching failure modes.

```java
@BatchSize(size = 20)     // on a collection → the IN list holds 20 owner IDs
@BatchSize(size = 20)     // on a @ManyToOne → same, for the parent IDs
@Fetch(FetchMode.SUBSELECT)
@Fetch(FetchMode.JOIN)    // like a join fetch, but applies to the whole session/query
```

| | `@BatchSize` | `@Fetch(SUBSELECT)` | `@Fetch(JOIN)` |
| --- | --- | --- | --- |
| Query count for N rows | `ceil(N/n) + 1` | 2 | 1 |
| Triggered | On first access of *one* proxy | On first access of *any* proxy of that collection | With the owning query |
| `IN` clause | Yes, sized n | No | No |
| Fetch join hazards | None | None | **All of them** — bags, pagination, inner-join semantics |
| Best for | "I need this on some rows" | "I always need this for this entity" | Never, in a Spring Data repository |

The precise arithmetic, because the numbers matter: **N+1 becomes `1 + ceil(N/n)`.** For 20
orders with `@BatchSize(50)`, that is 2 queries instead of 21. For 20 orders with
`@BatchSize(10)`, it is 3. For 5,000 orders with `@BatchSize(50)`, it is **101** — which is
the point at which batching stops being a fix and starts being a slower N+1, and you need
pagination to bound N rather than a bigger batch size.

`default_batch_fetch_size` is the global version of `@BatchSize` and it applies to
collections *and* to-one associations, which means it also fixes the EAGER-to-one extra
query pattern from Chapter 3 if you make them LAZY. The honest caution: it changes the
behaviour of every query in the application, including ones that work perfectly well now,
and the resulting `IN` lists can be surprisingly large on a `to-one` association that
half the queries don't need. It is a good default; it is not free.

> **SCALING REALITY CHECK**
>
> `ceil(N/n) + 1` is the number that decides this. `@BatchSize` is a *constant-factor*
> improvement, not an asymptotic one: 20 rows and 5,000 rows both scale linearly, just with
> a smaller constant. So batching is the right fix for **"I need a bounded list of
> children for each of a handful of parents"** and the wrong fix for **"I need children for
> 50,000 parents"**, where the only answers are pagination, a projection with a `GROUP BY`,
> or a denormalised column. The failure mode nobody plans for is a team that raises
> `batch_size` from 20 to 100 to make a growing report faster, which works until the `IN`
> clause hits a database parameter limit and the query starts failing rather than slowing
> down.

### 4.5 The Second-Level Cache — the Honest Answer

Hibernate's second-level cache stores entities (and optionally query results) across
sessions, in a process-local cache (EHCache, Caffeine, Infinispan) or a shared one.

```java
@Entity
@Cacheable                                    // shared across all EntityManagers
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
public class Product { ... }

@Cacheable
@Cache(usage = CacheConcurrencyStrategy.READ_WRITE)
@ManyToOne(fetch = FetchType.LAZY)
private Category category;

hibernate.cache.use_second_level_cache=true
hibernate.cache.region.factory_class=org.hibernate.cache.caffeine.CaffeineRegionFactory
```

It is a real, well-engineered feature with a real use case: a small set of rows read on
every request by every user. `Category`, `CountryCode`, `ProductCatalog`, a `FeatureFlag`.
Five hundred rows, ten megabytes, read ten thousand times a second.

It is also, for most applications, the wrong thing to reach for, and the reasons are worth
being able to articulate:

1. **The invalidation problem is genuinely hard.** Any write anywhere must invalidate the
   right entries, and a write in a *different* process (a second instance, a batch job, a
   DBA running a fix) cannot. `READ_WRITE` is the safe strategy, and it needs
   `javax.cache` + a region factory + a configuration to get right; `NONSTRICT_READ_WRITE`
   and `READ_ONLY` are faster and have stale-read windows that are unbounded in time.
2. **It doesn't fix N+1 as people think.** It makes each of the N queries *cheap*, not
   fewer. 180 cache lookups still cost 180 lookups, and the first, cold, still hits the
   database. Vlad Mihalcea has a specific article on the query cache making N+1 *worse*,
   because the query cache is keyed on the full bind-parameter set, so 180 queries with 180
   different IDs are 180 distinct cache entries — cache misses, all of them, plus 180
   entries evicting each other.
3. **It's per-process by default.** Ten instances means ten caches, ten times the memory,
   and ten independently-stale copies.
4. **The problem it appears to solve is usually a mapping problem.** If an endpoint issues
   180 queries and the cache makes it 4ms, the endpoint is still fragile: it breaks the
   moment the data changes, it made the first request per instance slow, and it hid the
> real problem instead of fixing it.

> **STAFF-LEVEL CONSIDERATION**
>
> The decision to add a second-level cache is almost never a technical one, and that's
> what makes it a staff-level question. Adding one changes the system's consistency
> contract: you are trading "the database is the truth and everyone sees it" for "a
> process-local copy is *usually* right and the staleness window is unbounded in the worst
> case." That trade is fine for a product catalog and wrong for a balance, a permission
> check, or anything a compliance audit will ask about. The version of the answer that holds
> up is: **push caching up the stack, not down** — an HTTP cache or a service-level cache
> with an explicit TTL and a documented staleness bound, in front of the ORM, where the
> invalidation story is a cache-control header and the blast radius of a bad invalidation is
> one HTTP response. Hibernate's L2 cache pushes it *under* the ORM, where invalidation is a
> correctness problem and the blast radius is every reader in the process.

#### Common Mistakes

- Believing an N+1 is a slow-query problem. Every query is fast; the cost is round trips
  and pool checkouts.
- Applying a fetch join to fix an N+1 in a **paginated** method. That trades N+1 for wrong
  pages or an in-memory page, which is worse.
- Using `@BatchSize` to paper over a loop over 50,000 rows. `ceil(N/n)` is still linear.
- "Fixing" it with the query cache, which makes it worse — 180 distinct bind-parameter sets
  means 180 distinct cache entries.
- Counting only `getPrepareStatementCount()` in the test and missing that
  `getCollectionFetchCount()` is the more sensitive signal.
- Writing the query-count assertion as an exact number, which makes the test fail on every
  unrelated mapping change. Assert an upper bound, and comment why that number is the
  budget.
- Treating a 200-row `IN` clause as a batch. It's a batch, and it's also the thing that
> makes the query plan unstable and the parameter count exceed a driver's limit.

#### Interview Questions — The N+1 Problem

**Q1. What exactly makes an N+1 expensive, given that every query is indexed and fast?**
`TRICKY`

The cost is round trips, not per-query work. N+1 is N+1 network latencies and N+1 connection
checkouts, all of which serialise. That's why it hides from database monitoring — the
database reports a low mean query time and a high total — and why it shows up in the APM
as many short child spans and in the pool dashboard as checkout wait time with flat query
duration. The number where it bites depends entirely on the link: on a unix socket you can
get to hundreds of queries; over a 2ms cross-AZ link, a hundred queries is already 200ms.

**Q2. How do you reliably detect an N+1, and why is your first instinct usually wrong?**
`ADVANCED`

The reliable way is a query-count assertion in an integration test that runs the real
query through the real mapping and counts statements — either Hibernate statistics
(`getPrepareStatementCount`, and `getCollectionFetchCount`, which is more sensitive) or a
JDBC-level proxy. The first instinct is usually "look at the slow query log", and that
fails because an N+1's queries are all fast. The second instinct, "look at the endpoint
latency", fails because latency doesn't tell you the cause. The detection that's right is
the one that runs in CI on every build, because a diagnostic you run during an incident is
a diagnostic that never runs.

**Q3. `JOIN FETCH` fixed one N+1 and created two bugs. Which two, and how do you know
which you're in?** `ADVANCED`

**Pagination** — `LIMIT` applies to the joined rows, so you get the wrong rows, or
Hibernate's `HHH000104` where it fetches everything and pages in memory. **Multiple `List`
bags** — `MultipleBagFetchException`, and specifically two `List` fields, since two `Set`s
is fine. There's a third that's easier to miss: the fetched association is null for some
rows and `join fetch` (as opposed to `left join fetch`) is an inner join, so those rows
disappear. You can tell which you're in from the exception, the `HHH000104` log line, and a
row count that doesn't match your expectations.

**Q4. When is `@BatchSize` better than a fetch join?** `TRICKY`

Whenever the association isn't needed for *every* row, and whenever the query paginates or
involves more than one `List`. `@BatchSize` has none of the fetch-join hazards — no wrong
pages, no bag exception, no inner-join semantics — at the cost of `ceil(N/n) + 1` queries
instead of 1, plus an `IN` clause. It's the right default for "render a list with a
child count or a child name" and the wrong one for a high-QPS single-entity read where one
round trip genuinely matters. And it stops working when N is unbounded: it's a
constant-factor win, not an asymptotic one.

**Q5. When is a DTO projection the *only* correct answer?** `STAFF`

When you don't need the entity. An endpoint that renders four columns and a count did not
need 20 fully hydrated `Order` objects with their collections — the N+1 exists only
because the code was mapping entities to fill in a table. The projection fixes it
completely and unconditionally: one query, only the columns you need, no persistence
context, no dirty checking, no lazy proxies. The thing you give up is the ability to
navigate the object graph afterward, which in a rendering path is almost never needed. The
test to apply: if the method returns an entity and the caller immediately converts it to a
DTO, the projection should have been the query.

**Q6. Would you add a second-level cache to fix an N+1?** `STAFF`

No, and the reason is that it doesn't. It makes each of the N queries cheaper, not fewer —
and with the query cache on, N queries with N different bind-parameter sets are N distinct
cache entries, so you get cache misses *and* the entries evict each other. What it does
buy is real for a small, hot, genuinely-shared reference set: a few hundred `Category` rows
read on every request. What it costs is an invalidation contract you now own, per-process
memory multiplied by instance count, and a consistency model where staleness is unbounded in
the worst case. The better place for the cache is above the ORM, where the invalidation
story is an HTTP cache header and the blast radius is one response.

**Q7. Your team wants to make N+1 impossible by banning fetch joins in review. Is that a
good policy?** `STAFF`

It's the wrong lever for the right instinct. The instinct is right — N+1s are a
review-time problem and they need a control. But a ban removes a tool without replacing it,
and pushes teams to `@BatchSize` defaults or a global `default_batch_fetch_size` that
changes behaviour of every query in the app. The control that actually works is the
query-count assertion in the test template, because it catches every N+1 including the ones
nobody wrote a fetch join for. Ban nothing; assert the count. Then review the projections,
because that's where the real win is.

**Q8. An endpoint issues 1 query and loads 400 entities. Is that an N+1?** `TRICKY`

No, and this is the case that reframes the whole conversation. If the query count is 1 and
the entity count is 400, the problem is not the round trips — it's that you're hydrating 400
entity graphs, each with proxies, each with a dirty-checking snapshot, into a heap that also
has to hold the response. That's a memory and GC problem, and the fixes are different:
a DTO projection (don't hydrate what you don't use), a narrower fetch, or a smaller page.
Checking `getEntityLoadCount()` alongside `getPrepareStatementCount()` is what tells the
two apart, which is why both numbers matter.

> **CHAPTER 4 SUMMARY**
>
> An N+1 costs round trips, not query time, which is why it hides from database monitoring
> and shows up in the pool dashboard and the APM trace instead. The only reliable detection
> is a query-count assertion in an integration test that runs the real query through the
> real mapping — not a log, not a graph, not a dashboard — because that makes it a
> *control* rather than a diagnostic. The fixes are not equal: a fetch join is one query
> with three specific failure modes, `@BatchSize` is `ceil(N/n)+1` with none of them but
> constant-factor only, the query cache makes it worse, and the second-level cache solves a
> different problem at a cost you should be explicit about. The one that is usually the real
> answer is the DTO projection, because it removes the N+1 by removing the reason it
> existed. And the framing that matters most: **N+1 is a review-time problem, and the control
> that catches it is an assertion in the test suite**, because a rule everyone remembers is
> not a control.

#### Further Reading

- [Vlad Mihalcea — The N+1 Query Problem](https://vladmihalcea.com/n-plus-1-query-problem/) — the mechanism, the SQL, and why the query cache makes it worse rather than better.
- [Vlad Mihalcea — Detecting the N+1 Problem During Testing](https://vladmihalcea.com/how-to-detect-the-n-plus-one-query-problem-during-testing/) — the query-count assertion, which is the control that makes this a review-time problem.
- [Thorben Janssen — Avoiding `MultipleBagFetchException`](https://thorben-janssen.com/hibernate-tips-how-to-avoid-hibernates-multiplebagfetchexception/) — the `List`-vs-`Set` detail that the standard advice gets wrong.
- [Thorben Janssen — Fetching Associations in Batches](https://thorben-janssen.com/hibernate-tips-how-to-fetch-associations-in-batches/) — `@BatchSize` and `default_batch_fetch_size` with the arithmetic that decides when it stops working.
- [Vlad Mihalcea — The Second-Level Cache](https://vladmihalcea.com/jpa-hibernate-second-level-cache/) — what the L2 cache actually buys, and the consistency model you take on when you add it.

## Chapter 5 — The Persistence Context in Practice

### 5.1 Flush — the Operation Nobody Names

**Flush is not commit.** A flush pushes pending changes to the database, inside the
transaction. A commit ends the transaction and (typically) makes the changes visible. A
long transaction flushes many times.

Hibernate flushes automatically, without being asked, in four situations:

```text
  1. BEFORE a JPQL/HQL query that overlaps the changed state
     (so the query sees your unflushed INSERTs — "query space" flushing)
  2. BEFORE a native SQL query
  3. WHEN the transaction commits
  4. WHEN you call em.flush() / repository.flush()
```

```java
@Transactional
public void theQuerySpaceFlush() {
    Order order = new Order("A-1");
    orderRepo.save(order);                  // queued, NOT yet sent

    // Hibernate must flush here, or this JPQL would not see the new order
    // even though it is logically in the transaction. Otherwise the report
    // would be computed from stale data — by the same transaction, invisibly.
    long count = em.createQuery("select count(o) from Order o", Long.class)
                     .getSingleResult();

    return count;   // correct, and the INSERT has already been sent
}
```

The flush-before-query rule is not a nicety. Without it, a transaction that inserts an
order and then counts orders would report the count *before* its own insert, and the bug
would be intermittent and extremely hard to attribute.

**What flush does, mechanically:**

1. Runs the **dirty check** — compares each managed entity's current state against the
   snapshot taken at load time.
2. Orders the resulting actions: inserts before updates before deletes (and, for entities
   with `@Version`, the version predicate is appended).
3. Executes them, in the order Hibernate's `ActionQueue` dictates, honouring
   `hibernate.order_inserts`/`order_updates` for batching.

> **MUST REMEMBER**
>
> `em.flush()` and the commit are different operations with different purposes, and the
> difference explains most "my data isn't there yet but I can see it in the same
> transaction" bugs. Flush = send the SQL. Commit = end the transaction. If you need the
> SQL now and might still roll back, flush. If you need the transaction to end, commit. And
> `saveAndFlush()` exists because the two are genuinely independent operations that people
> assume are one.

### 5.2 Dirty Checking — the Surprise of the Setter

The dirty check is Hibernate's, not JPA's, and it's the feature teams are most surprised
by. Here it is in full:

```java
@Transactional
public void getEndpointThatMutates() {
    Product p = productRepo.findById(1L).orElseThrow();

    p.setViewCount(p.getViewCount() + 1);    // ← one line. No save().
    p.setLastViewedAt(Instant.now());

    log.info("viewed {}", p.getName());      // no UPDATE
    return Dto.of(p);
    // ← UPDATE products SET view_count=?, last_viewed_at=? WHERE id=?
    //      at COMMIT. Method return value said nothing about a write.
}
```

The mechanism: at load time Hibernate stores a **deep copy of the loaded state** in a
`Type[]` array alongside the entity. On flush it compares field-by-field. If any differ, it
issues an `UPDATE`. There is no change tracking, no dirty flag, no `save()` call — the
comparison is the tracking.

**The consequences that generate production incidents:**

| The surprise | Why it happens |
| --- | --- |
| A "read-only" method wrote to the database | A setter ran in a `toDto()` method, or a `BeanUtils.copyProperties` copied a computed field over a mapped one |
| An entity was clobbered by a stale value | A long transaction held a managed entity; another transaction changed it; the `UPDATE` has no version predicate unless there's a `@Version` |
| A batch job wrote only *some* fields of every row | The entity was loaded, some fields changed, and flush wrote only those — the others are correct, so the missing ones weren't stale |
| An exception thrown after a mutation left the data changed | The transaction wasn't marked rollback-only, so it committed the dirty-check output anyway |
| A `readOnly = true` method still worked but was slow | `readOnly` sets `FlushMode.MANUAL` — no dirty check at all, so no accidental write, but also no `UPDATE` if you wanted one |

> **INTERVIEW TRAP — "`save()` vs dirty checking"**
>
> The accepted answer — "Spring Data needs `save()`, Hibernate uses dirty checking" — is
> incomplete in a way that costs production time. The precise statement: **dirty checking
> handles updates to entities already managed; `save()` is what makes a *new* entity
> managed in the first place, and what copies a *detached* entity back into the context.**
> So `save()` is genuinely required on the way in and genuinely optional on the way out for
> managed entities. And the corollary, which is the part people get wrong: calling `save()`
> on an already-managed entity is not a no-op safety net, it is a `merge` — which for an
> entity with collections means Hibernate replaces the collection reference and can trigger
> a cascade of unnecessary work. `save()` on managed state is at best redundant and at worst
> a new source of bugs.

> **PRODUCTION RELEVANCE**
>
> Dirty checking is why `readOnly = true` is one of the highest-value annotations in a
> Spring Data application. `SimpleJpaRepository` already marks its class-level
> `@Transactional` as `readOnly = true`, so repository reads get it free. The annotation
> matters on your *service* methods: with `readOnly = true`, Spring sets Hibernate's
> `FlushMode.MANUAL`, skipping the dirty check entirely, and — since Hibernate 6 with
> `hibernate.connection.provider_disables_autocommit` — tells the driver the connection
> won't be used to write, which lets PostgreSQL skip dirty-page flushing. On a read-heavy
> service that is a real, measurable win, and it also makes accidental writes
> structurally impossible rather than merely unlikely.

### 5.3 `clear()` and `detach()` — Freeing Memory

```java
@Transactional
public void processTenMillionRows() {
    for (int i = 0; i < 10_000_000; i++) {
        Row row = repo.findById(i).orElseThrow();
        handle(row);
        if (i % 1000 == 0) {
            em.flush();
            em.clear();          // ◄── without this, you OOM at ~100k entities
        }
    }
}
```

`clear()` detaches **everything**; `detach(e)` detaches **one**. Both make the entities
unmanaged and both mean the next `find` re-queries. The memory math is worth having
precisely: a managed entity is not one object — it's the entity plus Hibernate's state
array, its dirty snapshot (a deep copy of every loaded field), and a
`PersistentCollection` with its own snapshot for every collection. That's easily 3–5× the
object graph size, held for the whole transaction, and the reason a "simple" batch job
that loads a few hundred thousand rows dies with `OutOfMemoryError` and a heap dump full
of `Type[]` arrays.

**In a read-only batch, the right answer is usually not `clear()` at all** — it's a
**stateless session**:

```java
Session session = ((StatelessSessionImplementor) em).getSessionFactory()
                            .openStatelessSession();
Transaction tx = session.beginTransaction();
for (Row r : session.createQuery("from Row where id between :a and :b", Row.class)
                       .setParameter("a", lo).setParameter("b", hi)
                       .getResultList()) {
    handle(r);
    tx.commit();     // commit per batch, not per row
}
session.close();
```

`StatelessSession` has **no persistence context, no dirty checking, and no first-level
cache**. It reads faster and holds less memory. It also has no cascade handling, no
automatic dirty checking, and no entity identity within a query — which is exactly why it
is right for a bulk read and exactly why it is wrong for anything involving writes to those
entities. Spring Data exposes it as `@Transactional` on a method taking a
`StatelessSession` parameter, or via `SharedSessionContractor`.

### 5.4 The First-Level Cache Is the Context

```java
@Transactional
public void demonstrate() {
    Product a = productRepo.findById(1L).orElseThrow();   // SELECT #1
    Product b = productRepo.findById(1L).orElseThrow();   // NO query — a is returned
    System.out.println(a == b);                           // true
    System.out.println(a.getName());                      // still "Widget" even after b
}
// One query. And the context now holds a Product for the rest of the transaction.
```

This is the same identity map from Chapter 1, restated because the *practical* consequence
is the important part: **a query inside a transaction sees the transaction's own
uncommitted state, and does not see anyone else's.** That is correct and desirable for your
own writes, and it is a genuine trap for a read that was meant to be "what does the
database say right now". The ways to go around it:

| Need | Approach |
| --- | --- |
| Fresh data from the DB | `em.refresh(entity)` — reload one entity's state from the DB |
| Forget everything | `em.clear()` — drop the whole context |
| Fresh data, keep working | `em.refresh(entity)` per entity, or a new transaction |
| Bypass entirely | A `StatelessSession`, or a second `EntityManagerFactory` pointed at a read replica |

`@Cacheable` at the Spring level and the Hibernate second-level cache (Chapter 4) sit
*above* this and are a completely separate mechanism, which is a distinction worth being
clean about — people routinely say "the cache" and mean one of three different things.

### 5.5 Open Session in View

```properties
# Spring Boot's default. It has been true since Boot 1.x and is still true in Boot 3.x.
spring.jpa.open-in-view=true
```

**What it does:** Boot registers an `OpenEntityManagerInViewInterceptor` that binds an
`EntityManager` (and therefore a persistence context) to the thread for the **entire HTTP
request** — before the controller, through view rendering, after the controller returns.
The service method's `@Transactional` still opens and commits its own transaction, but the
*persistence context* — the identity map, the loaded entities, the dirty snapshots — stays
alive across the whole request.

```text
  With OSIV (default):
  ┌────────────────────────────────────────────────────────────────┐
  │ open tx ────────────────► close tx                            │ ← view rendered
  │ (context stays open)      (context STILL open)                │   with context
  └────────────────────────────────────────────────────────────────┘
       entity stays in memory; lazy loads work; connection held

  Without OSIV:
  ┌────────────────────────────────────────────────────────────────┐
  │ open tx ────────────────► close tx     │ context closed       │
  └───────────────────────────────────────┴──────────────────────┘
       lazy load in the view → LazyInitializationException
```

**The two real costs — and the second is the one nobody names:**

**Cost 1: memory growth proportional to entities touched per request.** With OSIV the
context lives from the first query to the last byte of the response. Every entity loaded
for rendering, plus every dirty snapshot, stays resident while the response is serialised
and written. An endpoint that touches 5,000 entities holds 5,000 entity graphs and 5,000
snapshot arrays through JSON serialisation. This is a real and measurable cause of
`OutOfMemoryError` and GC pressure under load, and it scales with the *size of the response*,
which means it gets worse exactly when the system is already under strain.

**Cost 2: it makes lazy loading work, which is what hides your N+1s from your tests.**
This is the one to lead with in an interview, because it's the cost that doesn't show up
in a memory graph. With OSIV, a `LazyInitializationException` is a bug you *never* see,
because the context is always open when the view renders. So lazy loading appears to work,
the N+1 doesn't throw, and your integration test with `@SpringBootTest` + `MockMvc` — which
also has OSIV on by default — **passes**. Then you set `open-in-view: false`, the same code
starts throwing, and you discover a pile of N+1s and a pile of entities being serialised
that you never wanted. Setting it to `false` is a *detector*, not just a policy.

**What breaks when you set it to `false`, and the fix:**

```text
Symptom:  org.hibernate.LazyInitializationException:
          could not initialize proxy - no Session ... is open

Cause:    the service returned an entity, and the view (or Jackson) touched
          its lazy association after the transaction closed

Fix:      return a DTO. Always. This is the correct answer regardless of OSIV.
```

```java
// ❌ Needs OSIV, leaks proxies into JSON, breaks the moment OSIV is off
@GetMapping("/{id}")
public Order get(@PathVariable Long id) {
    return orderRepo.findById(id).orElseThrow();
}

// ✅ Nothing to initialise, nothing to hold, no session needed at render time
@GetMapping("/{id}")
public OrderDto get(@PathVariable Long id) {
    return orderService.describe(id);     // → DTO, mapped inside the transaction
}
```

| | `open-in-view: true` (default) | `open-in-view: false` |
| --- | --- | --- |
| Lazy loading in views | Works | `LazyInitializationException` |
| Memory per request | Grows with everything touched | Bounded by the transaction |
| Connection held during render | **Yes** | No |
| N+1s visible in tests | **No** — they pass | Yes, immediately |
| Entities in responses | Common | Structurally impossible |

> **STAFF-LEVEL CONSIDERATION**
>
> Turning OSIV off is one of the highest-value single-line changes in a Spring Boot
> application, and the reason it belongs in a design conversation rather than a PR is what
> it *reveals* rather than what it costs. It will surface every place an entity crosses a
> boundary, and each of those is a place where the response shape and the persistence
> model are coupled — the coupling that makes it impossible to change a column without
> changing an API contract. The rollout is therefore: turn it off, work through the
> `LazyInitializationException`s (all of which become DTOs), then treat "returns an entity"
> as a lint error. The organisational risk is that it's a breaking change to a codebase that
> has been relying on the accident for years, so it wants a dedicated piece of work with a
> count of the exceptions as its success metric — not a drive-by config change in a
> performance ticket. And the honest counter-argument, which should be given if someone
> raises it: for a small application with short responses, OSIV's cost is genuinely
> negligible, and the only non-negotiable part is the DTO boundary, not the flag.

### 5.6 Injecting the `EntityManager`

```java
// ✅ The supported way: a shared proxy, transaction-scoped delegation
@Service
public class OrderService {
    private final EntityManager em;               // SharedEntityManagerCreator proxy

    public OrderService(EntityManager em) { this.em = em; }   // NOTE: not @Autowired
    ...
}

// ❌ Never this
@Service
public class BadService {
    @PersistenceContext
    private EntityManager em;                     // field injection — works, don't
}
```

Three things about the injected `EntityManager` that are worth having straight:

1. **It is not a real `EntityManager`; it's a proxy** that resolves the
   transaction-bound one per call. So injecting it into a singleton is safe, and
   *not* injecting it is not a correctness issue per se.
2. **Outside a transaction, calls create a temporary context.** The proxy will open a
   context, do the work, and close it. Which means `em.find(...)` in a non-transactional
   method works, gives you managed entities, and then silently detaches them at method
   exit. That's a source of "my lazy load worked in the service but not in the controller"
   asymmetry that is genuinely hard to debug.
3. **`@PersistenceContext` vs `@Autowired`** — both work, both resolve to the same shared
   proxy, and both are legacy-vs-modern in name only. Prefer constructor injection for the
   reasons from Volume 1: the dependency is visible and the class is testable.

**The thread-safety statement, precisely:** the *proxy* is thread-safe; the
`EntityManager` it delegates to is not. Passing the injected proxy to another thread
resolves to a different, unbound `EntityManager` in that thread — not a shared one — so
it does something reasonable. Passing an actual `EntityManager` to another thread (obtained
from `em.unwrap(Session.class)`, or from a non-shared context) is undefined behaviour and
produces `IllegalStateException` or silent corruption. In an `@Async` method you get a new
proxy-injected `EntityManager` and a new context, which is a fresh persistence context
that shares nothing with the transaction that spawned the task.

#### Common Mistakes

- Confusing `flush()` and `commit()`. Flush sends the SQL; commit ends the transaction.
  A read-after-write inside a transaction needs the automatic flush before a query, not a
  manual one.
- Believing a "read-only" method is read-only because of its name. Dirty checking runs on
  flush, so a setter anywhere in the method path is a write.
- Not calling `em.clear()` in a large read loop, and watching the heap fill with
  `Type[]` dirty snapshots.
- Reaching for `clear()` where a `StatelessSession` belongs. `clear()` keeps paying the
  snapshot cost; a stateless session doesn't pay it at all.
- Leaving OSIV on and concluding your tests cover the N+1s. They don't — with OSIV on,
  lazy loading always works, so the tests pass.
- Serializing an entity with a lazy collection and getting a `StackOverflowError` on a
  bidirectional `toString`/`hashCode`, or a `LazyInitializationException` from Jackson.
- Injecting a real `EntityManager` (not the proxy) into a singleton and using it from a
  pool of threads.
- Catching an exception in a transactional method, logging it, and returning normally —
  the transaction is already rollback-only and you get
  `UnexpectedRollbackException` at commit, which reads like a framework bug and is a
  business-logic bug.

#### Interview Questions — The Persistence Context in Practice

**Q1. What triggers a Hibernate flush, and why does it matter that it's not the same as
commit?** `TRICKY`

Flush happens automatically before a JPQL/HQL query that overlaps changed state, before a
native query, at commit, and on an explicit `em.flush()`. It matters because flush and
commit have different purposes: flush makes changes visible *to the database and to the
rest of this transaction* while the transaction is still open and still rollback-able;
commit ends the transaction. The automatic flush before a query is what makes a
read-your-own-writes query return the right answer — without it, a transaction that
inserts an order and then counts orders would count before its own insert, and the bug
would be intermittent and nearly unattributable.

**Q2. Explain dirty checking, and give me three ways it bites.** `TRICKY`

At load time Hibernate stores a deep copy of every loaded field in a state array; on flush
it compares field-by-field and issues an `UPDATE` for any difference. No dirty flag, no
`save()` call. The bites: (1) a setter in a method you thought was read-only silently
writes to the database; (2) a long transaction holding a managed entity overwrites a
concurrent writer's change, because the `UPDATE` has no version predicate without
`@Version`; (3) an exception swallowed after a mutation commits the dirty-check output
anyway, because the transaction wasn't marked rollback-only.

**Q3. `save()` is optional because of dirty checking. Why is that statement dangerous?**
`ADVANCED`

Because it's only true for the *update* direction. `save()` is what makes a new entity
managed and what copies a detached one back into the context — dirty checking handles
neither. And calling `save()` on an already-managed entity isn't a harmless no-op: it
goes through `merge`, which for an entity with collections replaces the collection
reference and can trigger unnecessary cascade work. The other half of the danger is
social: "dirty checking means I don't need `save()`" gets repeated until someone writes an
entity outside a transaction, gets no `UPDATE`, and concludes the ORM is broken.

**Q4. A batch job reads 500,000 rows and dies with `OutOfMemoryError`. What's actually in
the heap, and what are the three fixes?** `ADVANCED`

Not just your entities — each managed entity carries a `Type[]` of loaded state, a
**deep-copy dirty snapshot** of every loaded field, and a `PersistentCollection` with its
own snapshot per collection. That's 3–5× the object graph, held for the whole transaction.
The three fixes, in order: (1) `em.flush()` + `em.clear()` every N — works, still pays the
snapshot cost; (2) a `StatelessSession` — no context, no dirty checking, no first-level
cache, which is the right tool for a pure read; (3) stream the result with a scrollable
`ResultSet` (a keyset-paginated loop) so the query never materialises 500,000 entities at
once.

**Q5. What does Open Session in View actually do, and what are its two real costs?**
`TRICKY`

It binds an `EntityManager` — and therefore a persistence context — to the thread for the
whole HTTP request, past the service transaction and through view rendering. Cost one is
memory: the identity map and every dirty snapshot stays resident while the response is
serialised, which scales with response size and is worst exactly when the system is under
load; the connection is also held during rendering. Cost two is the subtler one: it makes
lazy loading work in views, so `LazyInitializationException` never fires — including in
`@SpringBootTest` + `MockMvc`, which has OSIV on by default. Which means your integration
tests pass on code that has an N+1 in it, and the N+1 stays invisible until the day someone
sets `open-in-view: false`.

**Q6. We set `open-in-view: false` and got 200 `LazyInitializationException`s. What's the
honest assessment?** `STAFF`

The exceptions are the diagnosis, not the problem — they are marking every place an entity
crosses a boundary it shouldn't have. Each one is a place where the API response shape and
the persistence model are coupled, which is the coupling that makes "rename a column" a
breaking API change. So the work is: map to DTOs at every boundary, and then make
"a controller method returns an entity" a lint error. The reason this is a staff-level
conversation and not a PR is the rollout — it's a breaking change to a codebase that has
relied on the accident for years, and it needs to be scoped, counted, and landed
deliberately. The fair counter-argument, which you should concede: on a small app with
short responses the flag's cost is negligible, and the DTO boundary is the part that is
non-negotiable regardless.

**Q7. Why does `readOnly = true` actually make things faster, and not just safer?**
`ADVANCED`

Two mechanisms. Spring sets Hibernate's `FlushMode.MANUAL` for a read-only transaction,
which skips the dirty check entirely — no snapshot comparisons, and no accidental writes,
so it's faster *and* structurally safer. And since Hibernate 6, with
`hibernate.connection.provider_disables_autocommit` enabled, Spring opens a read-only
connection so the driver knows the session won't write — which lets PostgreSQL skip
flushing its own dirty pages on every read transaction. `SimpleJpaRepository` already sets
`readOnly = true` at class level, so repository reads get this free; the annotation matters
on your service methods, especially on the read-heavy ones that dominate a typical
application.

**Q8. You inject `EntityManager` into a singleton service. Is that safe, and what happens
outside a transaction?** `TRICKY`

Safe, because Spring injects a `SharedEntityManagerCreator` **proxy**, not a real
`EntityManager`, and the proxy resolves a transaction-bound one per call. The subtlety is
what happens outside a transaction: the proxy opens a temporary context, does the work, and
closes it. So `em.find()` in a non-transactional method succeeds, returns managed entities,
and silently detaches them at method exit — which is the mechanism behind "the lazy load
worked in the service but not in the controller." Share the factory, never a session, and
know that a real `EntityManager` obtained by unwrapping is not thread-safe.

> **CHAPTER 5 SUMMARY**
>
> Flush is the operation nobody names: it happens automatically before an overlapping
> query, before native SQL, and at commit, and it is what makes read-your-own-writes
> correct. Dirty checking is Hibernate's addition to the spec — a deep-copy snapshot
> compared field-by-field at flush — and it is both the feature that removes `save()` from
> the update path and the source of the "read-only method that wrote to the database"
> incident. `readOnly = true` sets `FlushMode.MANUAL` and a read-only connection, which is
> a genuine performance win as well as a safety one. `clear()` in a loop and a
> `StatelessSession` for bulk reads are the memory answers. Open Session in View is `true`
> by default and costs you memory proportional to the response and — more importantly — it
> makes lazy loading work, which means your integration tests pass on code containing N+1s;
> turning it off is a detector. And the injected `EntityManager` is a thread-safe proxy,
> which is what makes it safe in a singleton and what makes its behaviour outside a
> transaction quietly different from what you expect.

#### Further Reading

- [Vlad Mihalcea — The First-Level Cache](https://vladmihalcea.com/jpa-hibernate-first-level-cache/) — the identity map and the dirty snapshot as one mechanism.
- [Vlad Mihalcea — Read-Only Transactions and the Hibernate Optimisation](https://vladmihalcea.com/spring-read-only-transaction-hibernate-optimization/) — why `readOnly = true` is a performance setting, not just a safety one.
- [Vlad Mihalcea — The Open Session in View Anti-Pattern](https://vladmihalcea.com/the-open-session-in-view-anti-pattern/) — the connection-holding cost, and why DTO projections are the answer rather than a workaround.
- [Vlad Mihalcea — Bulk Update and Delete](https://vladmihalcea.com/bulk-update-delete-jpa-hibernate/) — the persistence-context interaction that makes bulk operations dangerous.
- [Spring Data Reference — Transactionality](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html) — where the `readOnly` default comes from, and that declared `@Query` methods have no transaction configuration by default.

## Chapter 6 — Querying

### 6.1 JPQL vs HQL vs Native SQL

| | JPQL | HQL | Native SQL |
| --- | --- | --- | --- |
| Specified by | JPA | Hibernate | You |
| Operates on | **Entity and property names** | Entity, property, and **Java** types | Tables, columns, SQL functions |
| Case | Java identifiers, fully case-sensitive | Java identifiers, case-sensitive | **Insensitive** (`Order` and `order` both work) |
| Table/column names | Never visible | Never visible | Everywhere |
| Subqueries, joins | Yes | Yes, plus more | Yes |
| Vendor features | Cannot express | Yes, for free | Native |
| Startup validation | **Yes** — property names are checked | Yes | **No** — fails at runtime |
| Batch + pagination support | Yes | Yes, incl. `in`-clause tricks | Manual |

The portability each buys, stated honestly:

- **JPQL buys database portability.** A JPQL query compiles to dialect-specific SQL, and
  Hibernate's dialect abstraction handles the differences (paging syntax, identifier
  quoting, function names, `LIMIT` vs `ROWNUM` vs `TOP`). The catch is that the *portable
  subset* is smaller than people assume: a JPQL string naming a function the provider
  doesn't know fails to translate, and anything Hibernate-specific you've learned is by
  definition outside the spec.
- **HQL buys expression power at the cost of the guarantee.** HQL is a superset: it knows
  about Java types, has an AST you can transform, and supports things JPQL doesn't. Once
  you use one, you are committed to Hibernate. The staff-level question is not "is HQL
  allowed" but "do we have a second database?" — and the honest answer for most teams is
  no, which means the portability argument is theoretical and the productivity argument
  is real.
- **Native SQL buys exactness at the cost of everything.** You get the window function, the
  recursive CTE, the `INSERT … ON CONFLICT`, the query planner hint — and you take on
  responsibility for the result mapping, the portability, the count query for pagination,
  and the fact that **nothing validates it until it runs**. A native query with a renamed
  column passes every test that doesn't execute it.

```java
// ── JPQL ────────────────────────────────────────────────────────────────────
@Query("select p from Product p join fetch p.category c "
       + "where p.status = :s and c.slug = :slug order by p.name")
List<Product> findActiveInCategory(@Param("s") ProductStatus s, @Param("slug") String slug);

// ── HQL — Java type literal instead of a fully-qualified entity name ────────
@Query("select p from Product p where p.status = com.acme.ProductStatus.ACTIVE")

// ── Native, with the explicit mapping that makes it a real query ────────────
@Query(value = """
        select p.*, c.name as categoryName
        from products p
        join categories c on c.id = p.category_id
        where p.status = 'ACTIVE' and c.slug = :slug
        order by p.name
        """,
       countQuery = """
        select count(*) from products p
        join categories c on c.id = p.category_id
        where p.status = 'ACTIVE' and c.slug = :slug
        """,
       nativeQuery = true)
Page<ProductWithCategoryName> findActiveInCategoryNative(@Param("slug") String slug,
                                                         Pageable pageable);
```

Without an explicit mapping, a native query returning `categoryName` has nowhere to put it
— the result is a `Object[]`, or an entity with a null field and a warning. That is what
`@SqlResultSetMapping` is for:

```java
@SqlResultSetMapping(
    name = "ProductWithCategoryName",
    classes = @ConstructorResult(
        targetClass = ProductWithCategoryName.class,
        columns = {
            @ColumnResult(name = "id",      type = Long.class),
            @ColumnResult(name = "sku",     type = String.class),
            @ColumnResult(name = "name",    type = String.class),
            @ColumnResult(name = "price",   type = BigDecimal.class),
            @ColumnResult(name = "categoryName", type = String.class)
        }))
@Entity
public class Product { ... }
```

### 6.2 The `Specification` API and Its Real Cost

```java
public interface ProductRepository extends JpaRepository<Product, Long>,
                                    JpaSpecificationExecutor<Product> {

    default Optional<Product> findByIdAndActive(Long id) {
        return findById(id).filter(Product::isActive);
    }
}

// ── the fragment Spring Data supplies for you ───────────────────────────────
public class ProductService {
    public Page<Product> search(ProductFilter filter, Pageable p) {
        Specification<Product> spec = (root, query, cb) -> {
            List<Predicate> ps = new ArrayList<>();

            if (filter.category() != null) {
                ps.add(cb.equal(root.get("category").get("id"), filter.category()));
            }
            if (filter.minPrice() != null) {
                ps.add(cb.greaterThanOrEqualTo(root.get("price"), filter.minPrice()));
            }
            if (filter.text() != null) {
                ps.add(cb.like(cb.lower(root.get("name")), "%" + filter.text() + "%"));
            }
            // DISTINCT: required whenever a specification joins a to-many,
            // or the count query and the page will disagree.
            if (query != null && ps.size() > 1) {
                query.distinct(true);
            }

            return ps.isEmpty() ? cb.conjunction()
                               : cb.and(ps.toArray(new Predicate[0]));
        };
        return repo.findAll(spec, p);
    }
}
```

This is genuinely the right tool for a genuinely common need: **a filter whose shape is not
known until runtime.** It composes (each specification is a `Predicate` and they AND
together), it's type-safe against the metamodel, and it keeps the dynamic-query code out of
the repository interface.

**The cost, stated precisely, because it is a real and non-obvious performance problem:**

> Criteria/JPQL string queries are **parsed once and cached** as a query plan keyed by the
> query string. A `Specification` produces a **new criteria tree on every invocation**, so
> the key is effectively unique every time and **the plan cache never hits**.

```java
SessionFactory sf = emf.unwrap(SessionFactory.class);
QueryPlanCache cache = sf.getQueryPlanCache();
cache.getStatistics();   // number of entries

// After 10,000 different Specification invocations, this is ~10,000 —
// the cache is now pure overhead: entries evicted, memory grown, and every
// query re-parsed. Hibernate 6 has improved this materially with a criteria
// plan cache keyed on the criteria shape, but a genuinely dynamic Specification
// (a different tree every call) still misses more than a fixed query does.
```

The practical consequences, and how serious they are:

1. **Every invocation re-parses and re-plans.** A fixed JPQL string is parsed once and
   then it's a lookup. A dynamic criteria tree is parsed, AST-walked, and translated to
   SQL on every call.
2. **The plan cache grows unboundedly** and the growth is memory, not hits.
3. **The generated SQL may be different on every call**, so the **database's** plan cache
   is also missing — and that one has a much larger penalty, because the database is
   re-planning a query whose parameters changed shape.

The honest assessment, which is what the interview is testing: **for a query called a few
times per request, this is usually irrelevant** — Hibernate 6 and modern databases handle
it fine, and you will not measure a difference. It becomes a real problem for a search
endpoint called thousands of times per second with a different filter combination each
time. And the mitigation is not "avoid `Specification`" — it's:

- **Bound the combinations.** Twenty named queries for the twenty filters people actually
  use is faster, cacheable, greppable, and indexable. A `Specification` is the right tool
  for the *long tail*, not the common path.
- **Cache at a higher level** if the same filter is requested repeatedly (an HTTP cache, a
  short-TTL local cache) — this is the layering argument from Chapter 4.
- **Turn on the Hibernate 6 criteria plan cache** if you're on Hibernate 6, which
  substantially narrows the gap.

> **INTERVIEW TRAP**
>
> "Never use `Specification`, write named queries." That's the overcorrection, and it
> fails the actual requirement — a filter whose shape is genuinely dynamic is exactly what
> `Specification` is for, and forcing 200 named queries for 200 filter combinations is a
> maintenance disaster with worse performance, because you've lost the ability to compose.
> The right answer is the boundary: **named `@Query` for the known and common,
> `Specification` for the long tail, and a hard look at whether the long tail justifies
> itself at all.** And note the honest counter-consideration — the reason the Specification
> performance concern is real is the plan cache, so if your team has measured it and it's
> fine at your actual traffic, the concern is theoretical and the ergonomics win.

### 6.3 The Criteria API Directly

`Specification` is a *convenience wrapper*. Sometimes you need the real thing:

```java
CriteriaBuilder cb = em.getCriteriaBuilder();
CriteriaQuery<Product> cq = cb.createQuery(Product.class);
Root<Product> root = cq.from(Product.class);

cq.select(root)
  .where(cb.and(
      cb.equal(root.get("status"), ProductStatus.ACTIVE),
      cb.isNotNull(root.get("category")),
      cb.greaterThan(root.get("price"), min)))
  .orderBy(cb.desc(root.get("createdAt")));

List<Product> ps = em.createQuery(cq).setMaxResults(50).getResultList();
```

The direct API is needed for: a **subquery** (`cq.subquery(...)` — the common case is "the
minimum price within each category"), a **`UNION`** (via `criteriaBuilder.union`, JPA 2.2+,
which is rare and worth knowing exists), a query whose **select clause isn't a root entity**
but JPQL can't express, or an `INSERT … ON CONFLICT`-style bulk operation. The trade is
verbosity and type-safety-at-compile-time: `root.get("price")` is a `Path<Object>` unless
  you go through the `Metamodel` (`Product_.price`), which is generated by the JPA
  annotation processor.

> **TRADE-OFF**
>
> The typed `Metamodel` (`Product_.PRICE`, `Product_.category`) is compile-time checked and
> survives a field rename — but it requires the annotation processor to be enabled
> (`hibernate-jpamodelgen` or `jakarta.persistence-api`'s processor) and it generates
> classes that must be regenerated. String paths work everywhere with zero setup and fail
> at startup with a `PathNotFoundException` naming the attribute. For a codebase of any
> size, the generated metamodel is worth the build step: a rename that would be a runtime
> failure becomes a compile error, which is the entire argument from Volume 1 applied to
> the data layer.

### 6.4 Projections — the Actual Answer to "I Only Need Three Columns"

```java
// ── 1. Interface projection ─────────────────────────────────────────────────
// Spring Data generates a JDK proxy; "as" aliases must match the getter names
@Query("select p.id as id, p.sku as sku, p.name as name from Product p where p.status = :s")
List<ProductSummary> findSummaries(@Param("s") ProductStatus s);

public interface ProductSummary {
    Long getId();
    String getSku();
    String getName();
}

// ── 2. Constructor expression (record) — no proxy, no getter-name coupling ───
@Query("""
       select new com.acme.dto.ProductRow(p.id, p.sku, p.name, p.price)
       from Product p where p.status = :s
       """)
List<ProductRow> findRows(@Param("s") ProductStatus s);

public record ProductRow(Long id, String sku, String name, BigDecimal price) {}

// ── 3. Class-based DTO projection — the `as` aliases drive setters ───────────
@Query("select p.id as id, p.sku as sku, p.name as name from Product p")
List<ProductSummaryImpl> findSummariesImpl();

public class ProductSummaryImpl {
    private Long id; private String sku; private String name;
    // setters
}
```

| | Interface projection | Constructor expression | Class projection |
| --- | --- | --- | --- |
| Mechanism | A JDK dynamic proxy backed by a `Tuple` | A real object from a `record`/class constructor | Hibernate instantiates the class and sets fields |
| Needs getter names to match aliases? | **Yes** — rename a getter, the field silently becomes null | No — positional, in the query's select order | Yes, via setters |
| Extra columns come for free? | No — only the aliases in the select clause | No | No |
| Refactor safety | Weak | **Strong** (record + positional) | Medium |
| Performance | 1 query, only the selected columns | 1 query, only the selected columns | 1 query, only the selected columns |

The failure mode nobody knows: **an interface projection's alias mismatch returns `null`,
not an error.** `select p.id as identifier` against an interface declaring `getId()`
compiles, starts, runs, and returns an object whose `getId()` is `null`. That is a
data-integrity-shaped bug from a naming mistake, and it will reach production.

The second one: **extra columns in a native query are silently ignored** by an interface
projection. You added `and i.stock as stock` for debugging, the interface has no
`getStock()`, and the value just doesn't appear — with no warning.

> **MUST REMEMBER**
>
> A DTO projection is not a micro-optimisation. It changes the query from "load an object
> graph and walk it" to "ask the database for the four columns the response needs." For a
> read endpoint that is the *correct* query, and it removes the N+1 by removing the reason
> the N+1 existed. The interface projection is the most elegant syntax; the record
> constructor expression is the most refactor-safe; a class projection is what you use when
> you need more than one constructor or some logic. All three are the same idea.

### 6.5 `Page` vs `Slice`, and Why the Count Is Often the Problem

```java
Page<Product>  page = repo.findAll(pageable);   // 2 queries: the page + count(*)
Slice<Product> slice = repo.findAll(pageable2); // 1 query: just the page
List<Product>  unpaged = repo.findAll(Sort.by("name"));  // 1 query, no count
```

| | `Page` | `Slice` |
| --- | --- | --- |
| Queries | **2** — the page, plus `count(*)` | 1 |
| Knows the total? | Yes | No — `hasNext()` only |
| `getTotalPages()` | Yes | Unsupported |
| Suitable for | Admin tables, search UIs that show "1-20 of 1,247" | Infinite scroll, mobile feeds, "load more" |
| The count cost | **Frequently the dominant cost** — a `count(*)` over a filtered set is a full index scan the page query avoids entirely |

```java
// Slice with the SQL that Spring Data generates:
//   select ... from products where status = 'ACTIVE' order by created_at desc limit 21
//   (21, not 20 — one extra row to determine hasNext(). No count.)
```

The count is not a side effect — it is often the *bigger* query. A `count(*)` with the same
`WHERE` clause as the page query has to evaluate the filter for every matching row, and
`hasNext()` can be answered by the presence of one extra row. So on a table with 4 million
rows and a selective filter, the page query is 20 index seeks and the count is 200,000 index
entries scanned. **The `count` is frequently 10× the page query, and it's the part the code
review never looks at.**

```java
@GetMapping("/products")
public Slice<ProductDto> list(@RequestParam(required = false) ProductStatus status,
                               @PageableDefault(size = 20) Pageable p) {
    return status == null
        ? productRepo.findAll(p).map(ProductDto::of)
        : productRepo.findByStatus(status, p).map(ProductDto::of);
}
```

> **TRADE-OFF**
>
> The flip condition for `Slice` over `Page` is genuine: if the UI shows
> "Page 3 of 62" — a total, a page number, direct links to arbitrary pages — you need
> `Page` and you need the count. A `Slice` cannot be randomly navigated; it can only go
> forward. So this isn't "always use `Slice`": it's "make the count an explicit decision
> the endpoint owner is aware of," because the count is a full scan dressed up as a
> convenience. And the third option worth knowing: cache the count, or approximate it, if
> the UI genuinely needs a total on a table too big to count.

### 6.6 Offset Pagination Breaks at Scale

```sql
-- Page 1: fine
select * from products where status='ACTIVE' order by created_at desc limit 20 offset 0;

-- Page 500 of size 20: the database reads 10,020 rows and throws 10,000 away
select * from products where status='ACTIVE' order by created_at desc limit 20 offset 10000;
```

This is the point people reach for `EXPLAIN` and don't find: **the offset is not a scan, it's
a skip, and the database still has to produce every skipped row to skip it.** Cost is
**linear in the page number**, not constant. At page 1 the query is 20 rows; at page 5,000
it is 100,020 rows produced, transmitted from storage, and discarded. Deep-page latency
grows linearly and no index fixes it, because there is no index that can jump to "row 10,001
in this order" without counting the ones before it.

And there's a second, quieter problem: **offset pagination is not stable under concurrent
writes.** If a row is deleted while a user is on page 3, every subsequent row shifts up one
and the last row of page 2 reappears as the first row of page 3 — the user sees a duplicate
and misses an item. Insertions cause the mirror-image problem. This is not a database bug;
it's what offset means.

**The fix is keyset (seek) pagination:**

```java
// Page N+1: "give me the 20 rows strictly after this cursor"
@Query("""
       select p from Product p
       where p.status = :status
         and (p.createdAt, p.id) < (:lastCreatedAt, :lastId)
       order by p.createdAt desc, p.id desc
       """)
List<Product> findNextPage(@Param("status") ProductStatus status,
                           @Param("lastCreatedAt") Instant lastCreatedAt,
                           @Param("lastId") Long lastId,
                           Pageable p);   // limit only — no offset
```

```sql
-- The database seeks straight to the cursor: O(log n) via the index, constant cost
select ... from products
where status = 'ACTIVE' and (created_at, id) < ('2026-09-20 10:00', 48213)
order by created_at desc, id desc
limit 20;
```

```text
  OFFSET 500 × 20:   [████ 10,000 rows produced ████][██ 20 kept ██]
                     └─ every page number costs a different amount of work ─┘

  KEYSET page 500:   [seek to cursor][██ 20 kept ██]
                     └── same cost as page 1 ─────────────────────────────────┘
```

Two things that make the row-comparison syntax necessary, and both are subtle:

1. **The tuple comparison `(created_at, id) < (:lastCreatedAt, :lastId)` is required
   because `created_at` alone is not unique.** Without the `id` tiebreaker, rows sharing a
   timestamp get skipped or repeated. This is the same tiebreaker rule as below, and it is
   not optional.
2. **Some databases need the comparison written out** as
   `(p.createdAt < :t) or (p.createdAt = :t and p.id < :id)` — SQL Server and Oracle
   historically don't support row-value comparison. HQL's row-value syntax is portable; if
   your dialect can't translate it, write the explicit disjunction.

**What you give up:** no random access (no "jump to page 500"), no total count, and the
cursor must be part of the API contract rather than an offset integer. That's why keyset is
right for an infinite-scroll feed and wrong for a paginated admin grid.

> **MUST REMEMBER**
>
> **Every paginated query needs a tiebreaker column that is unique, appended to every
> `ORDER BY`, and stable.** `order by created_at desc` with 50,000 rows sharing 4 distinct
> timestamps gives the database enormous latitude in how to break the tie — and the
> database's choice can differ between two executions of the same query, because the plan
> changed. So row 15 appears on page 1 in one request and on page 2 in the next. The
> correct `Sort` is always:
>
> ```java
> Sort.by(DESC, "createdAt").and(Sort.by(DESC, "id"))   // never Sort.by("createdAt")
> ```
>
> This is a review comment worth making on *every* paginated method, and it is the single
> cheapest correctness fix in the whole volume.

> **STAFF-LEVEL CONSIDERATION**
>
> Offset pagination is a default that everyone inherits and nobody chose, and it fails in
> two independent ways — linearly degrading cost at depth, and instability under concurrent
> writes — that are usually discovered separately and blamed on different teams. The
> staff-level move is to make pagination strategy an **explicit decision in the API
> contract**, not an implementation detail of the repository. Concretely: the endpoint takes
> a cursor, not a page number, for anything user-facing and high-traffic; the admin grid
> that genuinely needs page numbers caps its depth; and the tiebreaker rule is enforced in
> one place — a `PageableDefaults` bean or a base repository method — rather than in each
> caller. The reason this is worth raising unprompted is that the migration cost is in the
> *clients*: once an API returns page numbers, changing to a cursor is a breaking change,
> so the decision has to be made before the first consumer ships.

#### Common Mistakes

- Treating JPQL as genuinely portable. It's portable only where the spec covers it, and
  Hibernate extensions are outside the portable subset by definition.
- Writing a native query with no `@SqlResultSetMapping` and getting `Object[]` or a null
  field, with no error.
- Relying on an interface projection's `as` aliases matching getter names. A mismatch
  returns `null`, silently.
- Assuming `Specification` queries are plan-cached like JPQL strings. They aren't — each
  invocation builds a new criteria tree, so both the Hibernate and the database plan caches
  miss.
- Forgetting `query.distinct(true)` in a `Specification` that joins a to-many, so the count
  and the page disagree.
- Using `Page` where `Slice` would do, and paying for a `count(*)` that is often 10× the
  page query.
- Sorting by a non-unique column with no tiebreaker, so rows shift between pages.
- Believing deep offsets are fixed by an index. The database still materialises and
  discards every skipped row — the cost is linear in the page number.
- Passing user input into `@Query` by concatenation, including a sort field name.

#### Interview Questions — Querying

**Q1. JPQL vs HQL vs native SQL — what does each buy, and what's the cost?** `TRICKY`

JPQL buys database portability and gives you startup validation of property names; it's
limited to the spec's grammar. HQL buys expression power and a transformable AST, and the
cost is that you've committed to Hibernate. Native SQL buys exactness — window functions,
CTEs, upserts, hints — and costs you the result mapping, the count query, portability, and
all validation, because nothing checks it until it runs. The honest framing: portability is
worth something only if you might run on two databases, and for most teams that's
hypothetical, which makes the real question "how much ORM-specific power do we want to be
able to reach?"

**Q2. Why can a `Specification` be slower than an equivalent `@Query`, and when does that
actually matter?** `ADVANCED`

Because a `@Query` string is parsed once into a query plan that's cached and then looked up
by string, while a `Specification` builds a new criteria tree on every invocation, so the
cache key is effectively unique every time — Hibernate re-parses, the plan cache grows
without ever hitting, and the *database's* plan cache misses too, because the generated SQL
shape varies. When it matters is the real question: a few calls per request is fine,
Hibernate 6's criteria plan cache helps a lot, and you'd have to measure to see a
difference. It becomes real for a search endpoint called thousands of times a second with a
different filter shape each time — and the mitigation isn't "ban `Specification`", it's
bounding the common filter combinations into named queries and keeping the specification
for the long tail.

**Q3. An interface projection returns nulls. What are the three causes?** `ADVANCED`

(1) An alias mismatch — `select p.id as identifier` against an interface declaring
`getId()` compiles, starts, runs, and returns `null`, because the proxy looks for a
property matching the alias. (2) A renamed getter, same effect. (3) A native query where
you added a column that the interface has no getter for — the extra column is silently
ignored rather than erroring. All three produce a correctly-shaped object with `null`
fields, which is the worst failure mode in this area because it reaches production as
missing data rather than as an exception.

**Q4. `Page` vs `Slice` — when is the count actually expensive, and what do you give up?**
`TRICKY`

The count is `count(*)` with the same `WHERE` as the page query, which means it evaluates
the filter for every matching row rather than stopping at 20 — on a large table it's
frequently the dominant cost of the request, and it grows as the filter gets more selective
in the *wrong* direction (highly selective on the page query, expensive on the count). You
give up with `Slice` the total count, random page access, and page numbers — you can go
forward only. The decision is whether the UI needs "page 3 of 62" or "load more", and
that's an API-contract decision made at the endpoint, not a repository decision.

**Q5. Why is `offset 10000` slow, and does an index fix it?** `TRICKY`

The database has to produce every skipped row to skip it — offset is a skip, not a jump. So
the cost is linear in the offset: page 1 of 20 is 20 rows, page 500 is 10,020 rows
produced and 10,000 discarded. An index doesn't help because there is no index that can
position at "row 10,001 in this order" without counting the ones before. The fix is keyset
pagination: carry the last row's sort key as a cursor and ask for rows strictly after it,
which is an index seek and constant-cost regardless of depth.

**Q6. Why does every paginated query need a unique tiebreaker in the `ORDER BY`?** `TRICKY`

Because a non-unique sort key gives the database freedom in how to break ties, and that
freedom differs between executions — a plan change, a statistics update, a different
parallelism decision. So the same query can return the same timestamp-sorted rows in a
different *order* on two consecutive requests, and a row on page 1 reappears on page 2.
The fix is always `order by created_at desc, id desc` where `id` is unique and immutable.
It's the cheapest correctness fix in the volume and the one most often missing.

**Q7. When is a native query the right call, and what do you owe the team when you write
one?** `STAFF`

When the query needs something the ORM's language can't express — a window function, a
recursive CTE, an upsert, a database-specific index hint, a tuning the dialect abstraction
prevents. What you owe: an explicit result mapping (a record, or `@SqlResultSetMapping` for
a native entity query) so a column rename fails loudly; a `countQuery` for anything
paginated, because the derived count is wrong for anything with a join; a comment saying
*why* native rather than JPQL; and a test that executes it, since nothing validates it until
runtime. The staff-level framing is that a native query moves the query from a place
where the compiler and the IDE can see it to a place where only a test and a DBA can.

**Q8. A team has 200 repository methods, most with a `Specification` or a dynamic filter.
What would you actually change, and in what order?** `STAFF`

Measure first — turn on `generate_statistics` in a representative load test and look at
`getQueryPlanCache().getStatistics()` and the query mix, because the answer is different if
95% of traffic is two filters. Then, in order: (1) name the top five or ten filter
combinations as explicit `@Query` methods, so the common path is plan-cached, indexable and
greppable, and keep the specification for the long tail; (2) add the unique tiebreaker to
every paginated `Sort`, which is free and fixes a correctness bug; (3) switch the
high-traffic endpoints that don't need a total from `Page` to `Slice`; (4) put a query-count
assertion in the test template so the count can't regress. What I would *not* do is ban
`Specification` — it's the right tool for the shape of problem it solves, and the fix is
about which traffic goes through it, not about removing it.

> **CHAPTER 6 SUMMARY**
>
> JPQL buys portability and startup property validation, HQL buys power at the cost of the
> portability guarantee, and native SQL buys exactness at the cost of everything — including
> all validation, which is why a native query with a renamed column passes every test that
> doesn't run it. The `Specification` API is the right tool for genuinely dynamic filters
  and has a real, specific cost: it builds a new criteria tree per call, so neither
  Hibernate's nor the database's plan cache hits — which matters at thousands of calls a
> second and is invisible at ten. DTO projections are not a micro-optimisation but the
  correct query for a read endpoint, and an interface projection's silent `null`-on-alias-
  mismatch is the most dangerous failure mode in the chapter. `Slice` over `Page` removes a
  `count(*)` that is frequently the dominant query, at the cost of totals and random access.
  Offset pagination fails twice — linearly in cost at depth, and unstably under concurrent
  writes — and the fix is a keyset cursor with a mandatory unique tiebreaker, which is the
  cheapest correctness fix in the whole volume.

#### Further Reading

- [Vlad Mihalcea — Pagination Best Practices](https://vladmihalcea.com/pagination-best-practices/) — offset versus keyset, with the numbers on why deep pages degrade.
- [Vlad Mihalcea — Keyset Pagination with JPA and Hibernate](https://vladmihalcea.com/keyset-pagination-jpa-hibernate/) — the row-comparison predicate and the dialects that need it written out.
- [Vlad Mihalcea — The Query Plan Cache](https://vladmihalcea.com/hibernate-query-plan-cache/) — how the cache is keyed, and why a dynamic criteria tree misses it.
- [Thorben Janssen — DTO Projections](https://thorben-janssen.com/dto-projections/) — all three projection styles with the alias-matching failure modes spelled out.
- [Vlad Mihalcea — The Specification API](https://vladmihalcea.com/spring-data-jpa-specification/) — composition patterns and the `distinct` requirement when a specification joins a to-many.

## Chapter 7 — Schema Evolution & Performance Tuning

### 7.1 `ddl-auto` — the Values and the Actual Default

| Value | Behaviour | Where it belongs |
| --- | --- | --- |
| `none` | **No schema action at all.** Also skips validation | **Any non-embedded database. This is the default.** |
| `validate` | Compares the mapped model against the schema; **fails startup** on any mismatch. No DDL | Production, as a safety net. Also the right setting in a migration-managed production system |
| `update` | Issues DDL for missing tables/columns/indexes on startup. **Never drops anything** | Legacy. Boot logs a warning: it's not meant for production |
| `create` | Drops and recreates the whole schema on startup | Integration tests, local dev against a disposable DB |
| `create-drop` | Creates at startup, drops at shutdown | **Embedded databases — the other half of the default rule** |

**The default, precisely**, because it is commonly misstated in both directions:

> Spring Boot does **not** set a value for `spring.jpa.hibernate.ddl-auto`. When the
> property is unset, Boot's `HibernateDefaultDdlAutoProvider` decides: **`create-drop` for
> an embedded database** (H2, HSQL, or Derby — detected from the connection URL/driver),
> **and `none` for everything else.** The effective default has therefore been `none` for
> any real database for the whole life of Boot, and it is *not* something that changed in
> 2.x.

There is one further piece of the rule that people get wrong: **if Flyway or Liquibase is
on the classpath, Boot sets it to `none` regardless of embedded or not** — because a schema
manager and Hibernate's DDL generator both owning the schema is a race, and Boot's default
is to let the schema manager win.

```yaml
spring:
  jpa:
    hibernate:
      ddl-auto: validate        # production: fail loudly on drift, change nothing
    open-in-view: false         # see Chapter 5
```

> **MUST REMEMBER**
>
> **`ddl-auto` is not a migration tool, and `update` is not a safe one.** Hibernate's
> schema generator emits DDL derived from the *current* mapping. It has no history, so it
> cannot express "add a nullable column, backfill it, then make it `NOT NULL`" — it will
> simply try to alter the column, which on a table with 200 million rows is a table rewrite
> holding an exclusive lock. It cannot rename a column (it'll add one and leave the old),
> it cannot reorder or drop safely, and `update` never drops anything, so the schema drifts
> permanently in the accumulating direction. Flyway and Liquibase exist because a schema
> has a *history* and the operations that matter — backfills, dual writes, contract phases
> — are sequences, not statements.

### 7.2 Flyway and Liquibase, and the Checksum

```text
src/main/resources/db/migration/
├── V1__create_customer_table.sql
├── V2__create_products.sql
├── V3__add_orders_status.sql
├── V4__backfill_orders_status.sql          -- data migration, not DDL
├── V5__orders_status_not_null.sql
└── R__add_view_orders_summary.sql         -- repeatable, re-run when its checksum changes
```

```sql
-- V3__add_orders_status.sql
alter table orders add column status varchar(32);

-- V4__backfill_orders_status.sql   ◄── the part Hibernate could never do
update orders set status = 'UNKNOWN' where status is null;
update orders set status = 'ACTIVE'  where created_at < '2024-01-01';

-- V5__orders_status_not_null.sql
alter table orders alter column status set not null;
```

Two tools, one difference that decides most selections:

| | Flyway | Liquibase |
| --- | --- | --- |
| Migration definition | **SQL scripts**, versioned by filename | **XML/YAML/JSON changelogs** (or SQL) |
| Philosophy | Migrations are SQL. Don't wrap it | Migrations are data structures the tool interprets |
| Rollback | Scripted by you (Flyway doesn't generate them) | **Generated and available** |
| Diffing existing DBs | No | **Yes** — `diff` generates a changelog from a live database |
| Best for | Teams comfortable with SQL, want full control | Java-heavy teams, environments that drift, need rollback |

**The checksum mismatch**, which every team meets and few understand:

```text
Validate failed: Migration checksum mismatch for migration version 3
  Applied:   1234567
  Resolved:  7654321

  -> Applied at: 2026-03-14 09:12:33 (by user 'deploy')
  -> Resolved at: /app/db/migration/V3__add_orders_status.sql (by user 'ci')
```

Every migration's checksum is recorded in the history table when it runs. On every
subsequent run, Flyway recomputes the checksum and compares. This is **a tamper-evidence
feature, and it is correct** — someone changed a migration that has already run, which
means either a hotfix was applied directly to an environment (so the file and reality have
diverged) or a file was edited by accident. The failure is the system working.

The wrong response, which is extremely common, is to `flyway repair` or to delete the
history row. The right response is:

1. **Find out why it changed.** `git log -p` on the migration file. Usually a hotfix
   applied to a running environment and then "tidyed up" in the repo, or a merge conflict
   resolved the wrong way.
2. **Decide whether environments have actually diverged.** If a production hotfix altered
   data, the file no longer describes reality anywhere.
3. **Reconcile deliberately** — either a new migration that makes reality match the
   intended end state, or (rarely, and consciously) a `repair` with a written note, which
   tells Flyway to trust the file.

> **PRODUCTION RELEVANCE**
>
> The organisational control that prevents this is **immutable migrations**: once a version
> is merged to the main branch, it is never edited, by anyone, for any reason. A hotfix
> gets a *new* migration. The cost is one extra file per hotfix; the benefit is that
> "which schema is in which environment" is always answerable, and the checksum mismatch —
> which is a five-minute incident — never happens at all.

### 7.3 Zero-Downtime Schema Changes: Expand and Contract

**The constraint that makes this necessary:** in most databases, DDL takes an **exclusive
lock** on the table for its duration. On PostgreSQL, `ALTER TABLE ... ADD COLUMN ... DEFAULT`
is fast (since PG 11, it doesn't rewrite the table), but `ALTER COLUMN ... TYPE`, adding a
`NOT NULL` constraint without a default, and most index builds that aren't `CONCURRENTLY`
take an `ACCESS EXCLUSIVE` lock — and every concurrent `SELECT`, `INSERT`, `UPDATE` and
`DELETE` **queues behind it**. On a table with 2 million rows, an `ACCESS EXCLUSIVE` lock
for 40 seconds is a 40-second outage, and it is *not* a failure anyone would notice in a
dashboard until it's over.

The pattern that avoids it is to split one breaking change into several non-breaking ones,
spanning multiple deploys:

```text
  PHASE 1 — EXPAND          ◄── deploy N, fully backwards compatible
  ┌──────────────────────────────────────────────────────────────────┐
  │ 1. add the new column NULLABLE, no default (metadata-only in PG) │
  │ 2. deploy code that writes BOTH old and new columns               │
  │ 3. backfill existing rows in batches                              │
  │ 4. verify the backfill (count nulls, compare)                     │
  └──────────────────────────────────────────────────────────────────┘
                              ▼
  PHASE 2 — MIGRATE         ◄── deploy N+1
  ┌──────────────────────────────────────────────────────────────────┐
  │ 5. switch reads to the new column (both are still correct)         │
  │ 6. deploy code that reads the new column, writes both             │
  │ 7. verify in production: no reads of the old column               │
  └──────────────────────────────────────────────────────────────────┘
                              ▼
  PHASE 3 — CONTRACT        ◄── deploy N+2, one release after the last
  ┌──────────────────────────────────────────────────────────────────┐
  │ 8. add NOT NULL, add the new index CONCURRENTLY, stop dual-write  │
  │ 9. deploy code that writes only the new column                     │
  │ 10. drop the old column (fast, metadata-only)                      │
  └──────────────────────────────────────────────────────────────────┘
```

Each phase is individually safe and independently revertible. **The critical rule is the
gap between phases 2 and 3: at least one full release cycle must pass** — because old
instances (from the previous deploy) are still running, and they still write the old
column. Dropping it before they're gone is the classic self-inflicted outage, and rolling
back a deploy after the contract phase is *not possible*. The decision "when is it safe to
drop" is therefore a deployment question, not a schema question: wait for full rollout of
the previous version, then drop in the next.

```java
// Phase 1: dual-write. Old column stays, new one is written alongside.
@Column(name = "status")          private String legacyStatus;
@Column(name = "status_v2")       private String status;

// Phase 2: read the new one, with a fallback that makes the deploy safe
// even if a straggler instance is still writing the old column.
public String effectiveStatus() {
    return status != null ? status : legacyStatus;
}
```

**Renaming a column** is the case that most needs this pattern, because no database renames
a column atomically in a way that old code can survive. The rename is: add the new column,
dual-write, backfill, switch reads, then add the new and drop the old — a rename is a drop
and an add with five deploys in between, which is genuinely uncomfortable and is the correct
answer. The cheaper option most teams should consider seriously: **keep the database
column name and change only the entity field name**, or accept a slightly worse name in
exchange for a one-deploy change. Renaming a database column for aesthetics is a trade that
usually loses.

> **TRADE-OFF**
>
> Expand-and-contract costs three deploys, a backfill job, monitoring to prove each phase
> completed, and the discipline to not run ahead. The flip condition is when it's *not*
> worth it: a new internal table nobody reads, a development environment, a table small
> enough that the lock takes 20ms, or a column change that requires a full-table rewrite
> anyway (in which case the question is the rewrite, not the lock). The heuristic that
> holds up: **if the change is reversible in under a minute and takes the table offline for
> under a second, just do it during a maintenance window and take the simplicity.** The
> pattern is for the changes where the answer is "no, and it takes forty minutes" — which
> is the large-table, constraint-adding, or type-changing case, and those are the ones that
> actually page someone at 2am.

### 7.4 Auditing

```java
@MappedSuperclass
@EntityListeners(AuditingEntityListener.class)
public abstract class Auditable {

    @CreatedDate
    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @CreatedBy
    @Column(name = "created_by", nullable = false, updatable = false, length = 64)
    private String createdBy;

    @LastModifiedDate
    @Column(name = "updated_at")
    private Instant updatedAt;

    @LastModifiedBy
    @Column(name = "updated_by", length = 64)
    private String updatedBy;
}
```

```java
@Configuration
@EnableJpaAuditing(auditorAwareRef = "auditorAware")
public class JpaAuditingConfig {

    @Bean
    public AuditorAware<String> auditorAware() {
        // In a web request: the authenticated principal. In a batch job: "system".
        return () -> {
            Authentication auth = SecurityContextHolder.getContext().getAuthentication();
            if (auth == null || !auth.isAuthenticated()
                    || auth instanceof AnonymousAuthenticationToken) {
                return Optional.of("system");          // ◄── the fallback everyone forgets
            }
            return Optional.of(auth.getName());
        };
    }
}
```

Three things that go wrong with auditing, in order of frequency:

1. **`updatable = false` on `createdAt`/`createdBy`.** Without it, Hibernate's dirty check
   doesn't cause a problem here, but a native `UPDATE`, a `@Modifying` query, or any
   `merge` from a DTO that has a null `createdAt` will happily overwrite the original value
   with null. It also protects the semantics: "created" is a fact about the past.
2. **The "system" fallback.** Batch jobs, scheduled tasks, message consumers, and
   integration tests have no authenticated principal. Without the fallback, `AuditorAware`
   returns `Optional.empty()` and the insert fails with a `null` constraint violation at
   3am in a scheduled job. Every `AuditorAware` needs a non-principal answer.
3. **Auditing adds columns that every query must now carry.** They're on the table, they're
   in every `SELECT *` and every entity, and they are the answer to a question only audit
   and compliance ever ask. For a high-volume fact table, putting the audit fields on a
   separate one-to-one audit table is a legitimate design and occasionally the right one.

### 7.5 JDBC Batching — and the ID Generator Requirement

```properties
spring.jpa.properties.hibernate.jdbc.batch_size=50
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
spring.jpa.properties.hibernate.jdbc.batch_versioned_data=true
```

```text
  batch_size = 50, order_inserts = true, 50 inserts of 3 different entity types

  WITHOUT ordering:  [A][A][A][A][A][B][B][B][B][B][A]... → the batch is flushed
                     every time the type changes → 1 statement per contiguous run
  WITH ordering:     [AAAAA][BBBBB][CCCCC]...             → 1 batch per type
```

`order_inserts` and `order_updates` group same-type statements so they land in one
`PreparedStatement` batch. Without them, interleaved entity types fragment the batch and
you get almost none of the benefit — which is why the two settings always ship together.

**The requirement, and this is the part that's worth being precise about in an interview:**

> **`GenerationType.IDENTITY` disables JDBC insert batching, entirely.** With `IDENTITY`,
> Hibernate has no ID until the INSERT executes, so it must execute each INSERT
> individually *and read the generated key back* before it can proceed. It cannot
> accumulate statements in a batch, because the return value of statement N+1 is needed
> before statement N+1 can be written. `hibernate.jdbc.batch_size` is simply inert for
> that entity.
>
> **`GenerationType.SEQUENCE` (and `TABLE`) allows batching.** The ID is obtained *before*
> the INSERT — from a sequence, or in pre-allocated blocks — so Hibernate knows every
> statement's parameters before executing any of them, and the batch goes out as one
> round trip with N rows.

| | `IDENTITY` | `SEQUENCE` |
| --- | --- | --- |
| Round trips for 50 inserts | 50 (plus key reads) | 1–2 |
| Batching possible? | **No** | **Yes** |
| ID known before INSERT? | No | Yes |
| Gap-free IDs | Yes | No (sequences leave gaps on rollback) |
| Monotonically increasing | Yes | Yes (per sequence) |
| Portable? | Widely | Not on MySQL < 8.0 / MariaDB < 10.3 |
| Sequence reads | None | One per insert, unless allocation-pooled |

The trade that people don't make explicitly: **sequences cost a read.** Hibernate's
sequence optimisers (`pooled`, `pooled-lo`) amortise it by pre-allocating blocks of IDs
per persistence context, at the cost of ID gaps and — if the pool is too large — IDs burned
by short-lived contexts. The default in Hibernate 6 is allocation size 50, which is a
reasonable compromise; raising it to 1,000 in a high-churn service just moves the waste
around.

```java
// Before: 50 INSERTs, 50 round trips
@Entity
public class Event { @Id @GeneratedValue(strategy = GenerationType.IDENTITY) Long id; }

// After: 1 round trip for 50 INSERTs (with order_inserts)
@Entity
public class Event { @Id @GeneratedValue(strategy = GenerationType.SEQUENCE)
                     @SequenceGenerator(name = "event_seq", sequenceName = "event_id_seq",
                                         allocationSize = 50)
                     Long id; }
```

This is very often the single largest throughput improvement available to a JPA
application, and it costs one line of configuration plus a DDL statement. On a service
writing 5,000 events/second, it is the difference between the database being a rounding
error and being the bottleneck.

> **SCALING REALITY CHECK**
>
> The rewrite-batching story continues past JDBC. `hibernate.jdbc.batch_size=50` means
> "one round trip with 50 statements". To turn that into "one round trip with 50 *rows*",
> the driver has to rewrite the batch into a multi-row statement, and that's a **driver**
> setting: MySQL needs `rewriteBatchedStatements=true` (and **not** `useServerPrepStmts`,
> which defeats it), PostgreSQL needs `reWriteBatchedInserts=true`, and SQL Server needs
> `useBulkCopyForBatchInsert=true`. Each of these is worth a large multiple on insert
> throughput, each is a connection-string change, and none of them is a Hibernate setting —
> which is exactly why "we turned on Hibernate batching and nothing changed" is such a
> common finding.

### 7.6 SQL Logging — and What It Costs

```yaml
logging:
  level:
    org.hibernate.SQL: DEBUG            # the SQL text
    org.hibernate.orm.jdbc.bind: TRACE  # the bound parameters
    org.hibernate.type.descriptor.sql: TRACE   # ◄── verbose, rarely needed
```

| Setting | Shows | Cost |
| --- | --- | --- |
| `show_sql = true` | The SQL text, to `System.out` | Formatting + `System.out` on every statement. **Never in production** — and it bypasses your logging framework entirely, so it can't be filtered |
| `show_sql = false`, `format_sql = true` | Same, pretty-printed | `format_sql` is a real cost: it's a per-statement string transformation, and it makes the output *harder* to copy-paste into a terminal |
| `logging.level.org.hibernate.SQL=DEBUG` | The SQL, through SLF4J, filterable | Modest. **The right default for local development** |
| `+ bind params TRACE` | Prepared-statement placeholders bound | **A genuine production cost** — it disables driver-side prepared-statement caching on many drivers, because each distinct parameter set becomes a distinct statement to be prepared again |
| Slow-query log (MySQL/Postgres) | Only queries over a threshold | The right production tool, and it's the *database's* view rather than Hibernate's |

```properties
spring.jpa.show-sql=false
spring.jpa.properties.hibernate.format_sql=false
logging.level.org.hibernate.SQL=DEBUG
logging.level.org.hibernate.orm.jdbc.bind=TRACE
```

The point worth making in a review: **`show_sql` is a boolean, not a level, and it doesn't
go through your logging configuration** — so a `show_sql=true` that gets into a profile is
unfilterable, unredirectable, and its cost is invisible. `logging.level.org.hibernate.SQL`
is strictly better for everything except the initial five minutes of "nothing is happening",
which is what `show_sql` is actually for.

> **PRODUCTION RELEVANCE**
>
> There's a security angle that comes up in audits: `bind params TRACE` and
> `show_sql` log **query parameters**, which means PII, tokens, and — with a
> `LIKE '%...%'` search — partial card numbers — into log aggregation, where they're indexed
> and retained under a different retention policy than the database. In a regulated
> environment, the query log is a data store with a compliance obligation, and nobody
> reviewed that when the debug level was turned on in a hurry.

### 7.7 Read-Only Transactions, Hints, and Indexes

Covered in Chapter 5 (§5.2) — `readOnly = true` sets `FlushMode.MANUAL` and a read-only
connection. Two related knobs:

```java
// Statement-level hints — dialect-specific, and the honest answer is "use them
// sparingly and measure, because the planner usually knows better than you"
@QueryHints({
    @QueryHint(name = "org.hibernate.readOnly", value = "true"),
    @QueryHint(name = "org.hibernate.fetchSize", value = "1000"),   // JDBC fetch size
    @QueryHint(name = "jakarta.persistence.lock.timeout", value = "3000"),
    @QueryHint(name = "org.hibernate.cacheable", value = "true")
})
List<Order> findBigOrders(...);

@Lock(LockModeType.PESSIMISTIC_WRITE)                 // SELECT ... FOR UPDATE
@Query("select o from Order o where o.id = :id")
Optional<Order> findForUpdate(@Param("id") Long id);

@QueryHints(@QueryHint(name = "jakarta.persistence.lock.timeout", value = "-1"))
// −1 = NOWAIT (fail immediately if locked)  ·  0 = WAIT forever (the default!)
// anything positive = wait that many ms
Optional<Order> findForUpdateNowait(@Param("id") Long id);
```

> **MUST REMEMBER**
>
> **A pessimistic lock with the default timeout waits forever.** `LockModeType`
> with no `jakarta.persistence.lock.timeout` hint means `SELECT ... FOR UPDATE` with an
> unbounded wait. A long-running transaction elsewhere — a batch job, a request that
> blocked on something slow — becomes an indefinite queue that other requests pile into
> until connection-pool exhaustion. **Always set the timeout explicitly**, and prefer
> `NOWAIT` (-1) for interactive paths so the caller gets a fast, retryable failure instead
> of an unbounded wait. This is a small setting with a genuinely large blast radius, and it
> is the kind of thing a staff engineer asks about when they see `PESSIMISTIC_WRITE`.

**Indexes** are the other half, and the two rules that matter:

1. **Every foreign key needs an index**, and every index on a column used in a `WHERE` or
   a `JOIN` needs to match the query's *leading* column. An unindexed FK doesn't just slow
   a query — on PostgreSQL and MySQL it makes every `DELETE` or `UPDATE` of the parent row
   take a full scan of the child table, because the database has to check for referencing
   rows.
2. **An index on a column used as `LIKE '%foo%'` or wrapped in a function is not an index.**
   `where lower(name) = 'x'` and `where name like '%foo%'` both require a scan. The fixes
   are a functional index (`create index on customers (lower(name))`), a trigram index for
   substring search, or a full-text index — and the discipline is to check with
   `EXPLAIN ANALYZE` rather than assume the index was used.

```sql
-- The only query plan tool that tells you the truth (it actually RUNS the query)
EXPLAIN ANALYZE
SELECT p.id, p.name FROM products p
JOIN categories c ON c.id = p.category_id
WHERE p.status = 'ACTIVE' AND c.slug = 'tools'
ORDER BY p.name
LIMIT 20;

-- What to read, in order:
--  1. actual time vs planned time   → a 100× gap means stale statistics
--  2. rows= on each node            → a node estimating 10 rows and returning 2M
--                                     is a missing/wrong index, not a slow server
--  3. "Rows Removed by Filter"      → usually the smoking gun
--  4. the plan shape                → nested loop over 2M rows is the N+1 at the
--                                     database level (Chapter 4, seen from the server side)
--  5. "never executed"              → the plan cache chose a bad plan; the fix is
--                                     often better statistics, not a better query
```

The one that's genuinely underused: **run `EXPLAIN ANALYZE` in staging against a
production-sized copy of the data.** An index that works on 10,000 rows and fails on
20,000,000 is a different index, because the planner switches from index scan to
sequential scan somewhere in between — and that crossover point is a number you can only
find with real volume. This is the same argument as Testcontainers (Volume 9): a test
database with 500 rows validates correctness and tells you nothing about performance.

### 7.8 When to Stop Fighting the ORM

```text
  ┌─────────────────────────────────────────────────────────────────────┐
  │  "Express it in the ORM"                                            │
  │   ✅ 80% of queries. This is what an ORM is genuinely better at.    │
  │   ✅  Everything the team can debug, index, and read in one place.   │
  └─────────────────────────────────────────────────────────────────────┘
                                 │
             ┌───────────────────┴───────────────────┐
             │  You needed 3 nested subqueries, a    │
             │  window function, or a GROUP BY with  │
             │  a projection the ORM won't map.     │
             ▼                                       │
  ┌─────────────────────────────────────────────────────────────────────┐
  │  "One native query + an explicit mapping"                          │
  │   ✅  The query is in a file, the mapping is checked by a test.    │
  │   ✅  You've thought about it twice. Stop.                          │
  └─────────────────────────────────────────────────────────────────────┘
```

**The signals you've crossed the line** — and the discipline is to notice them *early*,
because the cost of an ORM-shaped solution to a non-ORM-shaped problem compounds:

| Signal | What it actually means |
| --- | --- |
| A `@Query` with three `JOIN FETCH`es to fight a fetch problem | The entity graph is wrong, not the query |
| `Hibernate` is generating SQL nobody would write | You're fighting the abstraction — Chapter 4 |
| You need `@SqlResultSetMapping` on *every* query in the repository | You're using a repository, not a query layer |
| The query is a report, not a read of an aggregate | Reports are a different problem (Chapter 11's read models, or a warehouse) |
| A fetch join + pagination + a workaround | Stop; the underlying need is keyset pagination |
| Two people have tried to fix it and both gave up | That's the signal. The cost of the next attempt is higher than the cost of the rewrite |

**The discipline that matters:** the decision to leave the ORM should be made at the point
where the *first* workaround appears, not after the third. The reason is that every
workaround is a permanent, load-bearing piece of complexity that the next person has to
understand, and the entity graph underneath a heavily-worked-around repository is usually
already wrong. A repository fragment with hand-written SQL and a record return type is
about 40 lines, is understood by everyone including the DBA, is covered by one integration
test, and has no hidden behaviour. The "we'll refactor it when we understand it" version
of that decision is the one that never gets refactored.

> **STAFF-LEVEL CONSIDERATION**
>
> The org-level question here is **who is allowed to write SQL, and what happens to the
> ones they write.** The failure mode of "just use a native query" as an unexamined escape
> hatch is a codebase where 30% of the repository layer is hand-written SQL with
> hand-written mappings, maintained by the two people who know how, with no index
> consideration and no review by anyone who reads the execution plan. The failure mode of
> the opposite policy — "no native queries, ever" — is a codebase that has contorted its
> entity model to fit an abstraction and is slower than it needed to be, with a report
> query that has been "optimised" four times in JPQL and is still wrong.
>
> The resolution is a **stated boundary plus a review gate**, not a rule. Repositories own
> single-aggregate CRUD. A named query layer owns anything with a `JOIN FETCH`, a
> projection, or a report shape. Native SQL is allowed, and requires: an explicit result
> mapping, a `countQuery` if paginated, a comment saying why, and an `EXPLAIN` before it
> merges if it's a new shape. The measure of whether it's working is that a DBA can look at
> your repository layer and recognise the queries — which is the thing the abstraction
> throws away.

### 7.9 Connection Pool Sizing

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 20
      minimum-idle: 20            # ◄── the setting people get wrong
      connection-timeout: 3000    # fail in 3s, not hang for 30s
      max-lifetime: 1800000       # 30 min — must be < any DB/proxy idle timeout
      idle-timeout: 600000
```

```java
@Bean
DataSource dataSource(DataSourceProperties props) {
    HikariDataSource ds = props.initializeDataSourceBuilder()
                               .type(HikariDataSource.class).build();
    ds.setMaximumPoolSize(20);
    ds.setPoolName("orders");     // ◄── shows up in the metrics, by name
    return ds;
}
```

The rule of thumb, and its honest limits:

> **`pool size ≈ CPU cores + effective spindle count`** — so on a 4-core machine with SSD
> storage, roughly 5. HikariCP's own default is **10**, which is a good generic starting
> point. The intuition behind it: a connection is useful when it's waiting on I/O (disk or
> database), not when it's waiting on CPU, so the pool should cover the *concurrent
> in-flight* work, not the number of users.

**Too small** — the common case:

```text
  pool = 10, 60 concurrent requests, each doing 2 sequential queries
  ► 50 requests queue. A request holding a connection across a 50ms query and a
    5ms query is idle for 45ms of that 55ms — but it still HOLDS the connection.
  ► Queue time dominates: p50 latency is 0, p99 is seconds.
  ► Symptom: pool checkout wait time >> query duration. The database is idle.
  ► Symptom: connections are all busy, DB CPU is 10%, and latency is bad.
```

**Too large** — the failure people don't believe:

```text
  pool = 200, 4-core database server
  ► 200 connections arrive simultaneously. The DB has 4 cores; it context-switches
    between 200 sessions, thrashing on lock latches and buffer pool contention.
  ► p50 latency is now WORSE than with a pool of 20. Not "slightly" — often several-fold.
  ► Symptom: DB CPU pinned at 100%, per-query mean time up, throughput flat.
  ► Every extra connection costs every other connection. There is no free headroom.
```

| Setting | Default | Why it matters |
| --- | --- | --- |
| `maximum-pool-size` | 10 | Sizing is the whole game. Total across instances × replicas must stay below the database's `max_connections`, with headroom for administration and other services |
| `minimum-idle` | = max | **HikariCP keeps the pool full.** `minimum-idle: 0` means connections are created on demand and destroyed on idle — which is the opposite of what a connection pool is for. Rarely set it below max |
| `connection-timeout` | 30s | How long to wait for a connection before failing. 30 seconds of a hung request is a user-visible 30-second hang; 3 seconds is a fast, retryable, observable failure |
| `max-lifetime` | 30 min | Must be **shorter than** the database's, the load balancer's, or any proxy's idle timeout, or connections get killed in use. This mismatch causes "the connection worked at 29 minutes and then didn't" |
| `leak-detection-threshold` | off | Logs a stack trace when a connection is held longer than N ms. Invaluable in development for finding the "connection held across an HTTP call" bug |
| `poolName` | HikariPool-1 | Names the pool in Micrometer metrics. Without it you have one series called `hikaricp_connections_pending` and no idea which service it belongs to |

**Sizing across instances, which is the part that catches teams in production:**

```text
  4 application instances × pool 20  =  80 connections
  + 2 read replicas × pool 20        =  40
  + migrations, admin, monitoring    =  ~5
  ─────────────────────────────────────────────
  Total against the primary:         85
  PostgreSQL default max_connections: 100     ◄── you are at 85% with one
                                                more instance to add

  The correct budget: (max_connections - reserved - admin) / total_instances,
  minus headroom for a scale-out event. A 4-instance service should be sized so a
  6-instance scale-out doesn't exhaust the database.
```

**Rule of thumb, honestly stated:** the pool should usually be *smaller* than feels
comfortable. Every connection is a session on the database server, and the database's
throughput is bounded by its cores, not by the number of sessions waiting for them. If
p99 latency rises with the pool size, the pool is too big — and the fix is fewer
connections, not faster queries. Volume 9 covers pool metrics, leak detection, and the
full diagnostic sequence in production.

#### Common Mistakes

- Believing `ddl-auto` defaults to `update`. It defaults to `none` for a non-embedded
  database and `create-drop` for an embedded one — and Hibernate's DDL generator is not a
  migration tool regardless of which value you pick.
- Editing a migration that has already run and resolving the checksum mismatch with
  `flyway repair` instead of finding out why it changed.
- Running the contract phase too early. Old instances from the previous deploy still write
  the old column, and dropping it before full rollout is an unrecoverable outage.
- Renaming a database column for aesthetics — it is a drop-and-add with five deploys in
  between, and a rename of the *field* achieves the same readability for one deploy.
- `AuditorAware` with no fallback for a non-principal context, so a batch job's insert
  fails on a `NOT NULL` constraint at 3am.
- Enabling `hibernate.jdbc.batch_size` and seeing no improvement, because the entity uses
  `GenerationType.IDENTITY` — which makes the setting inert by construction.
- Stopping at JDBC batching and not checking the driver's `rewriteBatchedStatements` /
  `reWriteBatchedInserts` setting, which is where the round-trip-to-rows conversion
  actually happens.
- `PESSIMISTIC_WRITE` with no `jakarta.persistence.lock.timeout` hint, which means wait
  forever and queues into pool exhaustion.
- Setting `minimum-idle` below `maximum-pool-size`, turning a connection pool into a
  connection *churn* mechanism.
- `connection-timeout` at the 30-second default, so a pool-starved request hangs for 30
  seconds instead of failing in 3.
- Enabling bind-parameter logging in a regulated environment and shipping PII into log
  aggregation.
- Increasing the pool size to fix latency, when the symptom is database CPU at 100% and
  the pool is already the problem.

#### Interview Questions — Schema Evolution & Performance Tuning

**Q1. What is the actual default for `spring.jpa.hibernate.ddl-auto`, and what changed?**
`TRICKY`

Boot doesn't set the property. When it's unset, `HibernateDefaultDdlAutoProvider` chooses:
`create-drop` for an **embedded** database (H2/HSQL/Derby), and `none` for everything else
— and it forces `none` if Flyway or Liquibase is on the classpath, so the schema manager
always wins. So the effective default has been `none` for any real database for the whole
life of Boot, including 2.x and 3.x; nothing changed, and the common claim that it
"defaults to update" is wrong in the direction that matters, because `update` is the one
value that is genuinely dangerous.

**Q2. Why is `ddl-auto` not a migration tool, even `update`?** `TRICKY`

Because it has no history. It emits DDL derived from the *current* mapping, so it can
only express a single statement, never a sequence — it can't "add a nullable column, then
backfill, then set `NOT NULL`", and on a large table the `NOT NULL` is a full rewrite under
an exclusive lock. It can't rename a column (it adds one and leaves the old), it can't
drop anything in `update` mode, so the schema drifts permanently in the accumulating
direction, and a column whose type changed in the entity produces a DDL change on every
startup. Flyway and Liquibase exist because the useful operations are *sequences* and
because "what is the schema in each environment" is a question a history table answers.

**Q3. A Flyway checksum mismatch fired in staging. What do you actually do?** `ADVANCED`

Not `flyway repair` first — that tells Flyway to trust the file, and the file is not
necessarily the truth. Find out *why* it changed: `git log -p` on the migration. The usual
cause is a hotfix applied directly to a running environment and then tidied up in the
repo, which means the environments genuinely diverged and the file no longer describes
reality anywhere. Then decide whether they diverged, and reconcile deliberately: usually a
*new* migration that brings reality to the intended end state, occasionally a `repair` with
a written note. The durable fix is immutability — a merged migration is never edited, and
hotfixes get a new version. That converts a recurring five-minute incident into nothing.

**Q4. Walk me through expand-and-contract for adding a `NOT NULL` column.** `TRICKY`

Five steps across three deploys. Expand: add the column **nullable with no default**
(metadata-only on PostgreSQL, so it's fast), deploy code that dual-writes old and new, then
backfill in batches outside a single long transaction. Migrate: switch reads to the new
column — both are still correct, so this deploy is safe either way — and only once every
old instance is gone switch to reading the new column exclusively. Contract: add the
`NOT NULL`, build the index `CONCURRENTLY`, and drop the old column. The critical detail is
the **gap between the migrate and contract deploys**: at least one full release cycle,
because instances from the previous deploy are still writing the old column, and dropping
it before they're gone is unrecoverable. Rolling back after the contract phase is also not
possible — which is why the contract phase gets its own deploy.

**Q5. Why does DDL cause an outage on a large table?** `STAFF`

Most DDL takes an `ACCESS EXCLUSIVE` lock for its duration, and every concurrent `SELECT`,
`INSERT`, `UPDATE` and `DELETE` **queues behind it** rather than failing — so the failure
mode is latency, not errors, which is why it's missed by error-based alerting. The specific
operations that are dangerous: `ALTER COLUMN ... TYPE` (a full table rewrite under the
lock), adding a `NOT NULL` without a default (a validating scan), and a non-`CONCURRENTLY`
index build. The operations that are *not* dangerous on modern PostgreSQL: adding a
nullable column with no default, and dropping a column. Knowing which is which is the
whole skill, and it's version-dependent — PG 11 changed the default-column case, so
"adding a column is safe" stopped being universally true in 2018.

**Q6. You set `hibernate.jdbc.batch_size=50` and throughput didn't move. Why?** `ADVANCED`

The entity almost certainly uses `GenerationType.IDENTITY`. With `IDENTITY`, Hibernate
has no ID until the INSERT executes, so it must execute and read back each key before it
can proceed — it cannot accumulate statements, and the batch size is inert for that entity.
Switch to `SEQUENCE` (or `TABLE`) and batching works. The second reason people find is
`order_inserts`/`order_updates` not being set: without them, interleaved entity types
fragment the batch into one-statement runs. The third, and the one that gives the biggest
multiple, is that JDBC batching gets you one round trip with 50 *statements* — turning that
into 50 *rows* in one statement is a **driver** setting (`rewriteBatchedStatements`,
`reWriteBatchedInserts`, `useBulkCopyForBatchInsert`), not a Hibernate one.

**Q7. `PESSIMISTIC_WRITE` with no timeout hint. What's the risk?** `TRICKY`

The default is to **wait forever** — `SELECT ... FOR UPDATE` with an unbounded lock wait.
Any long-running transaction elsewhere (a batch job, a request blocked on a downstream
call) becomes an indefinite queue that other requests pile into, and because those waiting
requests are also waiting for pool connections, it compounds into pool exhaustion. Always
set `jakarta.persistence.lock.timeout` explicitly; `-1` (NOWAIT) is usually right for
interactive paths, so the caller gets a fast, retryable failure instead of a 30-second
hang. And prefer optimistic locking with `@Version` unless you have a specific reason —
pessimistic locks held across business logic are a throughput and deadlock liability.

**Q8. Pool is 10, we have 60 concurrent requests, and the database is at 8% CPU. What's
happening and what's the fix?** `ADVANCED`

The pool is the bottleneck, not the database. Fifty requests are queued for a connection,
and the tell is that pool **checkout wait time is high while query duration is flat** —
a connection held across two sequential queries is idle for most of its life but still
held. The fix is usually not "raise the pool" — it's finding why a request holds a
connection for 55ms to do 55ms of work, because that multiplier is what sets the required
size. A connection held across an HTTP call, or across a 50ms `SLEEP` in a retry, sets the
pool requirement far above what the query cost would suggest. The diagnostic to run first
is `leak-detection-threshold` in a test environment, which logs the stack trace of whatever
is holding connections.

**Q9. Pool is 200, 4-core database, and p50 latency is *worse* than it was at 20. Why?**
`TRICKY`

Because a connection is expensive on the server and the database's throughput is bounded by
its cores, not by the number of sessions waiting for them. Two hundred connections
arriving at once means 200 sessions context-switching on 4 cores, contending on buffer
pools and internal latches — every connection's work slows down to give the others room,
and there's no headroom left, so adding more makes it worse, not better. The tell is DB CPU
pinned at 100% with flat throughput and rising per-query mean time, which is the opposite
signature from an undersized pool (where DB CPU is *low* and the queue is in your process).
The rule of thumb is CPU cores + spindles, and the honest version is "smaller than feels
comfortable" — 10 is a good default and HikariCP's.

**Q10. When would you leave the ORM, and how do you decide when?** `STAFF`

Leave it when the query is not CRUD on a single aggregate: a window function, a recursive
CTE, a report shape, an upsert, or a projection the ORM can't map. The decision point is
**the first workaround**, not the third — that's the discipline, and it matters because
every workaround is permanent, load-bearing complexity the next person must understand, and
an entity graph under three fetch-join hacks is usually already wrong. The move is a
repository fragment with hand-written SQL and a record return type: about 40 lines, greppable,
visible to the DBA, covered by one integration test, no hidden behaviour. The org-level
part is that "just use native SQL" as an unexamined escape hatch produces a codebase where
30% of the repository is hand-written SQL maintained by two people with no index review —
so what you actually need is a stated boundary plus a review gate (`EXPLAIN` before a new
shape merges), not a prohibition.

**Q11. How do you decide an index or a query is actually a problem, rather than
theoretical?** `STAFF`

`EXPLAIN ANALYZE` — which actually executes the query, unlike `EXPLAIN` — and read four
things: the gap between *planned* and *actual* time (a large gap means stale statistics, and
the fix is usually statistics, not a better query); `rows=` on each node (a node estimating
10 and returning 2,000,000 is a missing index); `Rows Removed by Filter` (usually the
smoking gun); and a `never executed` node (the plan cache chose badly). And run it in
staging against production-*sized* data, because an index that works on 10,000 rows stops
working somewhere in the millions when the planner switches to a sequential scan, and that
crossover point is only findable with volume. Which is the same argument as Testcontainers:
a 500-row test database validates correctness and tells you nothing about performance.

> **CHAPTER 7 SUMMARY**
>
> `ddl-auto` has no value by default — Boot chooses `create-drop` for embedded databases and
> `none` for everything else, forcing `none` when a schema manager is present — and none of
> the values is a migration tool, because it has no history and cannot express the sequences
> that matter. Flyway's checksum mismatch is tamper-evidence working correctly, and the fix
> is to find out why the file changed, not to repair it; the durable answer is immutable
> migrations. Zero-downtime schema change is expand-and-contract across three deploys with a
> mandatory gap, because instances from the previous deploy are still writing the old
> column. On performance: JDBC batching requires a `SEQUENCE` generator because `IDENTITY`
> makes the setting inert by construction, `order_inserts` makes interleaved types batchable,
> and the round-trip-to-rows conversion is a *driver* setting, not a Hibernate one. The
> second-level cache belongs above the ORM. Pessimistic locks without a timeout wait forever.
> And the pool is usually smaller than feels comfortable — `cores + spindles`, not
> concurrency — with the diagnosis distinguished by whether DB CPU is low (too small) or
> pinned (too large).

#### Further Reading

- [Thorben Janssen — Updating a Database Schema Without Downtime](https://thorben-janssen.com/update-database-schema-without-downtime/) — the expand-and-contract sequence with the PostgreSQL lock behaviour that forces it.
- [Vlad Mihalcea — Flyway and Database Schema Migrations](https://vladmihalcea.com/flyway-database-schema-migrations/) — versioned migrations, the checksum, and how to make them safe.
- [Vlad Mihalcea — Batch Processing with JPA and Hibernate](https://vladmihalcea.com/the-best-way-to-do-batch-processing-with-jpa-and-hibernate/) — `batch_size` with `order_inserts`/`order_updates`, and the numbers on what it actually buys.
- [Vlad Mihalcea — The Optimal Connection Pool Size](https://vladmihalcea.com/optimal-connection-pool-size/) — the core-count-plus-spindles reasoning, and the benchmark behind it. Volume 9 covers the operational side.
- [Thorben Janssen — Generating the Database Schema with JPA](https://thorben-janssen.com/generate-database-schema-jpa/) — what `hbm2ddl` does and doesn't, from the practitioner side.

---

### End of Volume 6

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain the persistence context as an identity map, and derive the behaviour of `persist`,
  `merge`, `getReference` and dirty checking from that one idea
- State precisely which side of a bidirectional association Hibernate writes to, and why
  setting only the other side is a complete no-op rather than a partial write
- State the actual JPA default `FetchType` for to-one and to-many, and explain why the
  to-one default surprises people
- Name the three specific ways a `join fetch` fails — pagination, multiple `List` bags, and
  inner-join semantics on a nullable association — and the fix for each
- Explain why an N+1 is expensive when every individual query is fast, and why the query
  count assertion in a test is the only detector that works as a *control* rather than a
  diagnostic
- Compute the query count for `@BatchSize(size = n)` over N rows, and say the number at
  which it stops being the right answer
- State when Hibernate flushes, and explain why flush-before-query is what makes
  read-your-own-writes correct
- State that `spring.jpa.open-in-view` defaults to `true`, name its two real costs
  (including the one that hides N+1s from your tests), and describe what breaks when you
  turn it off
- Explain why `hibernate.jdbc.batch_size` does nothing for an entity using
  `GenerationType.IDENTITY`, and name the driver setting that completes the optimisation
- State the actual default for `spring.jpa.hibernate.ddl-auto` for embedded vs
  non-embedded databases, and explain why no value of it is a migration tool
- Walk through expand-and-contract for a `NOT NULL` column addition, including the
  mandatory gap between the migrate and contract deploys
- Explain the offset-pagination failure at two depths — linear cost and instability under
  concurrent writes — and give the keyset fix including the mandatory unique tiebreaker
- Say when the repository pattern is the wrong abstraction, and what the observability
  argument against it actually is

### Coming in Volume 7 — Spring Boot & Auto-Configuration

Volume 6 was about what the framework does with your data. Volume 7 is about what the
framework does with your configuration — and it is the volume where most of the magic in
a Spring application becomes visible. How a starter works, how `@Conditional` decides
which of your 200 beans exist, what the executable JAR actually contains and why the
classpath is nested three levels deep, how `@ConfigurationProperties` binding and the
17-level property precedence ladder work, how auto-configuration backs off when you define
your own bean, how the condition evaluation report is the single most useful debugging
tool in Spring, and what Actuator exposes and what it must not. The volumes connect here
too: `ddl-auto` and the connection pool from Volume 6 are set through exactly the
mechanisms Volume 7 explains.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). The **D** questions are the ones that separate a
senior answer from a staff one: they push on scale, cost, reversibility, and organisational
fit rather than API correctness.

### The Persistence Context

**P1. An endpoint was fine until someone added `spring.jpa.open-in-view=false`. Now it
throws `LazyInitializationException` on about 40 endpoints. Nothing is actually broken in
the data model. What do you tell the team?**

> That the flag is a *detector*, and it just detected 40 places where an entity crosses a
> boundary it was never supposed to cross. Each of those is a method returning an entity
> that the caller then walks, which is why it worked — the view was silently triggering lazy
> loads that belonged in the service, on a context kept alive by an interceptor, holding a
> connection during serialisation. The work is mechanical: map to a DTO inside the
> transaction at each of the 40 sites, and add `EntityGraph` or an explicit query where the
> service genuinely needs the association loaded. The part worth saying out loud is that
> every one of those 40 sites was also an N+1 waiting to happen, so the migration improves
> performance as a side effect — which is a better argument for the change than "it
> reduces memory", because it means the backlog is work you needed to do anyway. Plan it as
> a counted piece of work with "exceptions reaching zero" as the success metric, not as a
> drive-by config change in a performance ticket.

**S1. A PR adds a `@Modifying` bulk update without `clearAutomatically`. What does the
reviewer need to know to make this a blocking comment?**

> That the bug is data corruption, not a wrong result, and that it only reproduces when the
> same transaction also *loads* rows the bulk statement touched — which is why it passes
> review, passes unit tests, and reaches production. The mechanism: the bulk `UPDATE` runs
> outside the persistence context, so entities already loaded there still hold the old
> field values; at flush, dirty checking sees their other changes and writes the *stale*
> value of the bulk-updated field straight back. So the review question is "does this method
> run in a transaction that also reads these rows?" — and if the answer is yes or you
> can't rule it out, `clearAutomatically = true` is not a nice-to-have. The second question
> is what happens to the in-memory state afterwards: with `clearAutomatically`, every
> entity in the context is detached, so a caller iterating managed entities after the call
> gets detached ones. That's a real cost of the fix and worth stating in the review rather
> than discovering later.

**P2. A feature flag added last month "reverted itself" overnight. Nothing in the code
changed. What happened?**

> Almost certainly a second application instance still running the previous release, or a
> cached entity. The flag change was a read-modify-write on a managed `Product` without a
> `@Version`, and two instances — or the same instance in two transactions — interleaved,
> so the second write carried the first one's stale value for the fields it hadn't changed.
> The fix is `@Version` on the entity, so the second `UPDATE ... WHERE id = ? AND version = ?`
> affects zero rows and throws instead of silently winning. The deploy is a red herring: a
> rolling deploy means "old and new code are both live" is the normal state, not an
> exception, and any write path without optimistic locking is a race in production that
> only shows up during rollouts.

**P3. A method annotated `@Transactional(readOnly = true)` wrote to the database, and we
have no idea where.**

> Three candidates, in order. (1) The annotation is on a class that isn't proxied at all —
> self-invocation, or a `final` method, or a private one; then read-only is irrelevant.
> (2) A nested `@Transactional` with `Propagation.REQUIRED` and `readOnly = false` on an
> inner method — the inner one joins the outer transaction and, depending on the
> `HibernateDialect` and the `validateExistingTransaction` setting, can participate in
> writing. (3) The write was native SQL or a `@Modifying` query, which `FlushMode.MANUAL`
> does not stop. Start with the proxy: is the call actually going through a Spring-managed
> reference? The tell is usually that the method is called from within the same class.

**T1. Inside one transaction, `em.find(Employee.class, 1L)` is called twice. How many
queries, and what does the second call return?**

> Zero queries on the second call, and the *same* object instance — the first call put it
> in the persistence context, and the context is an identity map. This is the guarantee that
> makes in-place mutation work, and it's also why the context can go stale: the entity
> reflects what the database said when the context loaded it, not what the database says
> now. If you need current data, `em.refresh(entity)`.

**T2. A `@Modifying` method updates 500,000 rows, and 12 of them are also loaded in the
same transaction. What is written for those 12?**

> The old values. The bulk `UPDATE` bypasses the persistence context, so the 12 managed
> entities still hold the pre-bulk state and are still considered managed. At flush, the
> dirty check finds their other changed fields and issues
> `UPDATE ... SET status = '<old>', other_field = ? WHERE id = ?`, writing the stale status
> straight back over the bulk update. This is the one interaction in the volume that
> produces *data corruption* rather than just wrong numbers, which is why
> `clearAutomatically = true` is close to mandatory on a bulk update.

**S2. A PR adds `@Transactional(readOnly = true)` to a service method that later needs to
write. What should the review catch?**

> That the annotation is inherited by every method the class calls into that participates
> in the transaction, and a read-only transaction is not a hint — it sets
> `FlushMode.MANUAL` and a read-only connection, so a write inside it either silently does
> nothing (dirty checking is off) or fails on the read-only connection. The review comment
> is that `readOnly` is a *contract* about the whole transaction, and the contract has to
> hold for everything the method touches, including event listeners and AOP advice.

**D1. The persistence context is scoped to a transaction. Is that the right scope?**
`STAFF`

For a write, yes — it gives you identity, atomicity, and the ability to roll back. For a
read, it's actively wrong in both directions: it forces you to keep entities alive for the
whole transaction when you only needed columns, and dirty checking costs you snapshot
memory proportional to everything you touched. That's the argument for projections and for
`StatelessSession` in read paths. The scope question becomes real when OSIV extends the
context to the whole request, because then the context outlives the transaction and the
guarantee you were relying on — atomicity of what you loaded — no longer matches the
guarantee you have. A context that spans a transaction gives you identity without atomicity,
which is the worst of both.

**D2. Would you put a `second-level` cache in front of a `Product` entity, in a system
where a promotion must be visible within a second?** `STAFF`

No, and the reason is that the consistency contract is the decision, not the performance.
The L2 cache's staleness window is unbounded in the worst case — a write in another process
cannot invalidate a local cache, so the bound is "until something happens to invalidate it",
which is not a bound you can put in a product requirement. The version of this I'd defend
is: push the cache *up* the stack, into HTTP or the service layer, where the TTL is
explicit, the invalidation story is a cache-control header or a message, and the blast
radius of a bad invalidation is one response rather than every reader in the process. The L2
cache is right for a five-hundred-row reference table nobody writes to during business
hours, and wrong for anything a promotion touches.

### CRUD, Identity and Lifecycle

**P4. A nightly job reports "0 orders updated" but the data was definitely there an hour
ago. Nothing was logged. What are the likely causes?**

> (1) The `@Modifying` method was called from a non-transactional context and threw
> `TransactionRequiredException`, swallowed by a broad `catch (Exception)`. (2) The
> derived method name parsed into a condition you didn't intend — `findByStatusAndDate`
> with a `null` date silently becomes `IS NULL` rather than an error, and matches nothing.
> (3) The flush never happened because an exception marked the transaction rollback-only
> and you caught it at the outer layer. (4) The write went to a replica. The distinguishing
> move is to log the affected-row count at the call site and assert it is non-zero — a
> "modified 0 rows" return value is the signal, and it's the one nobody checks.

**P5. A batch job processes 3 million rows in one `@Transactional` method and the heap
grows steadily until it dies. Nothing in the log. What's the actual problem?**

> Three held-at-once things: the entities, Hibernate's dirty snapshots (a deep copy of every
> loaded field per entity), and the connection. The job never clears the persistence
> context, so a 3-million-row loop in one transaction accumulates all of it. The fix
> depends on whether the job writes: if it does, chunk it — `em.flush()` + `em.clear()`
> every few thousand rows, committing per chunk. If it only reads, a `StatelessSession` is
> strictly better, because it has no context, no dirty checking and no first-level cache,
> so the memory cost is the result list you're iterating rather than the whole run. The
> third, often-missed cost is the transaction duration itself: a multi-hour transaction
> holds locks, blocks vacuum, bloats the WAL, and makes every lock-wait metric meaningless.

**T3. `em.persist(detachedEntity)`. What happens?**

> `EntityExistsException` (a JPA exception; Hibernate surfaces it as
> `PersistentObjectException: detached entity passed to persist`). This is correct and
> intentional — `persist` means "this is new, schedule an INSERT" — and it's the reason
> `SimpleJpaRepository.save()` calls `merge` for anything `isNew` says is not new. The
> lesson is that `persist` and `merge` aren't interchangeable spellings of "save"; they
> assert different things about the object's state, and the exception is the assertion
> failing loudly, which is the best case.

**T4. You call `em.merge(x)` and then mutate `x`. Does the database see the change?**

> No. `merge` copies `x`'s state onto a managed instance and returns *that instance*;
> `x` itself is still detached, and the context was never told about the later mutation.
> Nothing is written. The fix is always to use the return value of `merge`, or — the rule
> that actually holds up — to never let a detached entity reach code that mutates it. The
> deeper point: this is a silent failure with no exception, and it produces "the data was
> correct in the dev environment and stale in production" because the dev environment's
> service was `@Transactional` and returned the merged copy.

**S3. A reviewer sees `repo.save(entity); return entity;` on a new entity with a
`@UuidId`. What should they ask?**

> What `save()` returns, and whether the caller is mutating the object it passed in. With
> an application-assigned ID, `isNew` reports "not new", so `save` takes the `merge` path
> and returns a *different* managed instance — the caller's `entity` is detached, and
> anything set on it afterwards is invisible. The fix is either
> `return repo.save(entity)` (honour the return value everywhere) or override `isNew` for
> the repository. The review comment is worth making generally: `save()`'s return value is
> load-bearing and "fire and forget" is a latent bug.

**D3. Is dirty checking a feature or a hazard?** `STAFF`

Both, and which one it is depends on whether the team knows it exists. It's a feature
because it removes an entire category of error — you can't forget to call `save()` for an
update, and the object graph is the source of truth rather than a call graph you have to
keep in sync. It's a hazard because it's invisible: a setter in a "read-only" method is a
write, a `BeanUtils.copyProperties` that copies a computed field over a mapped one is a
write, and there's no line of code that says "this is a write." The resolution isn't to
turn it off — you can't, cleanly — it's to make it explicit in the transaction boundary:
`readOnly = true` everywhere it's true, DTO mapping at the edges, and the discipline that
entities never cross a service method's return. Then the hazard is contained by
construction rather than by vigilance.

**D4. `equals`/`hashCode` on entities: use all fields, use the ID, or use a business key?**
`STAFF`

The ID, and here's the constraint that decides it: an entity's hash code must not change
over its lifetime, because it doesn't have an ID until after `persist` and Hibernate may
reassign it. All-fields breaks a `HashSet` the moment dirty checking updates a mutable
field. A business key is worse, for a different reason: it's mutable in most domains, and
it forces loading the entity to compare it, so a `Set` of entities in a loop is an N+1 by
construction. The ID with a **constant** hash satisfies both constraints — identity is
stable once assigned, and the constant hash accepts bucket collisions as the price. The
residual failure is the transient case: two new entities with null IDs are equal under
`id != null && id.equals(other.id)`, which is why the null guard is in the contract. The
honest final note is that entities in `HashSet`s is a smell that points at a DTO boundary
that doesn't exist.

### Repositories

**P6. `save()` on a new entity returns a different object than the one passed in, and a
day later someone reports "the ID I set wasn't saved." What's the mechanism?**

> Application-assigned ID plus the `isNew` check. With a `@UuidId`, a natural key, or a
> manually-set `UUID`, `isNew` sees a non-null ID and reports "not new", so `save` takes
> the `merge` path — and `merge` returns a *different* managed instance. The INSERT still
> happens (merging a transient entity inserts a copy of it), so the row exists, but the
> caller kept the detached original and every subsequent mutation on it is invisible. The
> durable fixes are to override `isNew` for the repository, and to make the rule "always
> use `save()`'s return value" a review convention — the second one is what actually
> prevents the whole class of bug, because the convention holds for any ID strategy.

**S4. A PR converts a 30-line native-SQL repository fragment to JPQL "for portability."
What should the reviewer push on?**

> The premise. Portability only pays if there's a plausible second database, and if there
> isn't, the conversion trades a query anyone can read for one that has to be expressed in
> a subset designed for portability — and JPQL's subset is smaller than people assume. So
> the review question is: "do we have, or plan, a second database?" If no, the conversion
> is a cost with no benefit and the honest comment is to keep the SQL. If yes, the review
> question becomes "is this actually in the portable subset?", because the usual culprits
> are functions the provider doesn't know, `LIMIT`/`OFFSET` written by hand, and vendor
> functions like `ILIKE` or `DATE_TRUNC`. A third thing worth checking either way: the
> hand-written mapping should survive the conversion. If the native query returns a record
> and the JPQL returns a `List<Object[]>`, the conversion just moved the ugliness.

**D5. A team wants every repository method to return a DTO, because "it prevents the
N+1 and the lazy-loading problems." Is that right?** `STAFF`

Right for reads, and wrong as a blanket rule, and the distinction is what makes it a
design conversation. For a read — anything that ends in a response — a DTO is strictly
better: the query can be a projection returning exactly the columns needed, there's no
entity to accidentally serialise, and the response shape stops being coupled to the schema,
which is what lets you rename a column without breaking a client. For a write path,
returning a DTO breaks the thing the repository exists for: `save()` returns the managed
entity, dirty checking works on managed entities, and a DTO forces you to re-fetch the
entity you just wrote to hand back a populated ID and version. The aggregate repository
should therefore return entities and stay inside a transaction, and the query layer
should return DTOs and be read-only. The stronger version of the argument, which is worth
making because it reframes the whole question: entities in a signature is the mechanism by
which a caller can do something with an object it has no business holding, so removing
entities from read signatures isn't a performance fix — it's a boundary that makes a whole
class of bug unexpressible.

**P7. A teammate says "the repository layer means nobody needs to know SQL." What's the
production cost of that belief?**

> Three concrete ones. (1) The queries are invisible to the log analyser, the APM trace and
> the DBA — a 400-millisecond endpoint is diagnosable only by reading Java. (2) A complex
> query forced through method names becomes an unreadable 60-character identifier, and the
> count query derived from it is silently wrong for anything with a join fetch, so the UI
> shows "1,247 results" for 340. (3) The abstraction removes the artifact every performance
> tool indexes on. The design fix is a stated boundary: single-aggregate CRUD through Spring
> Data, anything with a fetch join or a projection through an explicit query object with a
> hand-written mapping. What's worth saying is not "the abstraction is bad" but "the
> abstraction traded a shared, queryable language for per-query encapsulation, and the
> trade is only good while the queries are simple."

**T5. A derived method `findByStatusAndDateGreaterThan(ProductStatus s, LocalDate d)` is
called with `d = null`. What query does Spring Data generate?**

> An `IS NULL` comparison, not an error. Spring Data's grammar treats a null-valued
> property in a derived query as `= null`, which becomes `IS NULL`. The result is a query
> that returns a plausible set of rows and looks like a data problem, when it's an argument
> problem. This is one of the strongest arguments for `@Query` over derived methods in
> anything with an optional filter, because explicit JPQL lets you write the null case
> deliberately.

**S5. A PR adds 14 derived methods to a 60-method repository. What is the review
comment?**

> That the repository is no longer a repository, it's a query object with a naming
> convention. The right comment is about the boundary, not the count: if these fourteen are
> reads for a reporting or search UI, they belong in a query service with DTO returns, and
> that's a change that gets cheaper now than after another twenty. Also worth asking whether
> several share a filter and should be one `Specification` or one `Slice`-returning method
> with a `Pageable` — because a count query per filter combination is a cost the reviewer
> should be looking at.

**D6. `CrudRepository` is more persistence-agnostic than `JpaRepository`. Is that a reason
to use it?** `STAFF`

No, and the abstraction is thinner than it looks. `CrudRepository.save` returns `void`, so
with a non-`IDENTITY` generator you don't get the new entity's ID back — the single most
common complaint about it, and a small subclass fixes it. Every other "agnostic" benefit
evaporates the moment you need `getReferenceById`, `@Lock`, or a `Specification`, at which
point you're on `JpaRepository` with JPA types in your service. The deeper issue is that
the interface hierarchy implies a portability you don't have and can't test, because
nobody runs a second database. What you actually want from a repository boundary is that
*your service code can't do anything surprising with the persistence model* — and that's
achieved by DTO returns, not by choosing a narrower interface. The real choice is
`JpaRepository` for aggregates, and a separate query type for reads.

**D7. A team is adding `Specification` to 200 repository methods. Is that the right
refactor?** `STAFF`

It's the right shape for a genuinely dynamic filter and the wrong one if it's a
mechanical replacement for many small named queries. Three reasons. (1) It takes the query
out of the plan cache — a new criteria tree per call, so both Hibernate's and the
database's caches miss. (2) It takes it out of the log analyser and the APM, because the
SQL shape now varies per call. (3) It takes it out of review, because a predicate tree is
harder to read than a JPQL string. The version I'd propose: name the top ten filter
combinations as `@Query` methods — they're the ones in the access logs — and keep the
specification for the long tail. And measure first, because at ten requests a second this
whole conversation is theoretical and the ergonomics of `Specification` win outright.

### Relationships & Fetching

**P8. A PR adds `@ManyToMany` between `Article` and `Tag`. The reviewer asks "who deletes
the join-table row?" What is the right answer?**

> The question is really "which side owns the relationship", and neither side is a good
> answer without deciding the domain rule. If tags are independent and reusable, the join
> table is its own aggregate and removing it should be an explicit
> `article.getTags().remove(tag)` **with the owning side updated** — a `@ManyToMany` has
> no cascade orphan-removal support, so removing from one side silently leaves the join
> row and the tag comes back on the next load, which is the same "deleted rows come back"
> shape as the `@OneToMany` case. If tags only exist inside an article, it's a
> `@OneToMany` to an embeddable or a cascade-remove child and the join table is a detail of
> one aggregate. The review comment worth making is that a `@ManyToMany` is usually a
> modelling decision hiding inside an annotation, and it's worth confirming the join table
> has a primary key of its own so a duplicate insert fails loudly rather than silently
> duplicating.

**T6. An entity has `@OneToMany Set<OrderLine> lines`. Two different `Set` collections are
both `join fetch`ed. Does it work, and what is the consequence of using `List` instead?**

> Two `Set`s work — Hibernate de-duplicates the repeated rows by primary key, which is
> exactly why the constraint is on *bags* and not on collections. Switch either to a `List`
> with no `@OrderColumn` and the same query throws
> `MultipleBagFetchException: cannot simultaneously fetch multiple bags`, because a result
> set has no column identifying which collection a repeated row belongs to. The consequence
> of the `Set` workaround is ordering: a `Set` is unordered unless you add `@OrderColumn`
> (a synthetic index column Hibernate maintains on every write) or `@OrderBy` (a read-time
> `ORDER BY`, free on write). So the choice is not "bag versus non-bag" — it's whether you
> want order, and if you do, `@OrderBy` is nearly always the right mechanism.

**S6. A PR changes a `@ManyToOne` to a `@OneToOne` because "it's only ever one". What
should the reviewer catch?**

> That the database schema is still a many-to-one. `@OneToOne` only changes the *mapped*
> side; it has no effect on the foreign key or on whether a unique constraint exists. Two
> rows with the same `customer_id` are still perfectly legal at the database level, and
> Hibernate's eager `SELECT` on a `to-one` will then find more than one row and throw
> `NonUniqueResultException` at runtime — in whatever code path happens to touch it
> first. A real `@OneToOne` needs a unique constraint on the FK column, and that
> constraint is a schema migration, so it belongs in a review comment about the migration
> and not just the annotation. If the constraint can't be added because the data violates
> it, that tells you the relationship was never one-to-one.

**D8. A bidirectional association needs a `helper.addChild(x)` on both sides. Is that
boilerplate worth the abstraction, or should the framework handle it?** `STAFF`

The helper is worth it, and the reason is that the alternative is a silent data bug rather
than a compile error. Hibernate writes only the owning side, so `parent.getChildren().add(x)`
on its own produces a correct-looking object graph, a successful transaction, and a row
with a null foreign key. Nothing throws. The helper is the enforcement mechanism: it makes
the two-sided update the only way to express the operation, so the failure mode becomes
"someone bypassed the helper", which is a review comment, rather than "the data is wrong
and nobody knows why". The same argument applies to a JPA-aware event listener on
pre-`UPDATE` — same guarantee, enforced centrally rather than at each call site, and it
fails loudly for external code. What I'd push back on is the *derived* conclusion people
draw, which is that bidirectional associations are therefore a mistake. They're a
legitimate modelling choice, and the owning-side discipline is a property of them rather
than an argument against them.

**P9. `LazyInitializationException` in a `@RestController`, but only on ~1% of requests.**
`ADVANCED`

`ADVANCED` isn't the tag — the answer is: it's almost certainly not random. Look for
something that is true for 1% of requests. The three candidates, in order: (1) an
`equals`/`hashCode` on an entity that includes a lazily-loaded association — `equals` is
called at unpredictable times (including inside `HashSet` operations), so it only blows up
when that association hasn't been touched; (2) a code path where the association was
already touched — warm — and a path where it wasn't, so the same line works or fails; (3)
JPA's `hashCode` contract: a `HashSet` of entities where one field was updated means
`contains` sometimes does a database hit to compare, and that hit is where the exception
comes from. The fix in all three is the same: `equals`/`hashCode` on ID only, with a
constant hash, and no associations. This is the single most useful demonstration of why
entity `equals` is a real bug and not a style question.

**T7. Two collections are `@OneToMany List`. A `join fetch` on both throws
`MultipleBagFetchException`. Change the second to a `Set` and name the exact consequence.**
`ADVANCED`

It works, and the consequence is **ordering**. A `Set` is unordered — unless you add
`@OrderColumn`, at which point Hibernate maintains a synthetic index column on every
change, so you trade the exception for write amplification and a schema column nobody asked
for. A `List` with `@OrderColumn` (or `@OrderBy`, which is a read-time `ORDER BY` and
costs nothing on write) is usually the right answer when order matters. If order genuinely
doesn't matter, `Set` + `HashSet` is correct and cheap, and the deduplication is done by
Hibernate on primary key — which is why two `Set`s could always be fetched together and
only two *bags* couldn't.

**T8. `optional = false` on a `@ManyToOne`, and `join fetch o.customer`. Does the result
set change if a row has a null customer_id?**

> With `optional = false` there shouldn't be one, so the question is vacuous in practice —
> and that's the trap. The reason the inner-join semantics is dangerous is that
> `optional` is a *modeling* assertion enforced by Hibernate, not by the database, unless
> there's a `NOT NULL` constraint. A row inserted by a data fix, an import, or another
> service can violate it, and then `join fetch` silently drops the order from the result
> while `left join fetch` would have returned it with a null customer. So: `left join
> fetch` on any association you haven't proved is non-null at the database level, and a
> `NOT NULL` constraint backing every `optional = false`.

**S7. A PR adds `cascade = CascadeType.ALL` to a `@OneToMany`. What should the reviewer
push on?**

> `ALL` includes `REMOVE`, and `REMOVE` is a business decision that nobody made. Deleting a
> customer now deletes every order, and the order of operations is Hibernate's, not the
> service's. The review question is "what's the business rule when a customer is deleted —
> delete the orders, soft-delete the orders, or block the delete?" and the answer should be
> an explicit service method, not a cascade. Also worth asking whether the association
> really is owned-and-deleted-with (a `@ManyToMany` to `Tag` almost never is) and whether
> the collection is on the owning side, where `ALL` is often a no-op that misleads readers
> into thinking it does something.

**D9. Is "all associations LAZY" universally right?** `STAFF`

No, and the interesting part is defining the exception. Lazy is right when the association
is a property of a *particular access path* — because the code that needs it varies, and
making it eager taxes every read including the many that don't need it. Eager is right when
the association is a property of the *entity's identity* — a small immutable reference like
a `Currency` or a `CountryCode` that every read genuinely needs, where the alternative is
one extra round trip on the hot path. The flip condition is scale: below roughly ten
thousand requests a second, an extra indexed join is cheap and eager is simpler to reason
about; above it, the multiplication is real. The argument that actually settles most
discussions is not either of those — it's that a fetch strategy is a *default for the
mapping* while the need is a *property of the caller*, and any value of the annotation is a
compromise. Which is why the mature position is lazy mappings plus deliberate fetching
plus a query-count assertion, rather than a rule about which annotation to write.

**D10. Someone proposes adding a second-level cache to "fix the N+1s". Make the case
against it.** `STAFF`

First, it doesn't: the cache makes each of the N queries cheaper, not fewer, and with the
query cache on, N queries with N different bind-parameter sets are N distinct cache
entries — misses, plus mutual eviction. With the query cache off it helps a genuinely hot,
small, read-mostly reference set, and that is the honest case for it. Second, it doesn't
scale across instances: per-process by default, so ten instances means ten caches, ten
times the memory, ten independently-stale copies. Third, and the argument that decides it,
the invalidation contract is now yours: a write in another process cannot invalidate a
local cache, so the staleness window is unbounded in the worst case, and you've traded
"the database is the truth" for a model you can't state to a compliance auditor. The
better placement is above the ORM, where the TTL is explicit and a bad invalidation costs
one response. And the thing worth saying last is that the cache would be *hiding* the N+1
rather than fixing it, which is the failure mode of every performance fix that isn't
measured.

### The N+1 Problem

**P10. `getCollectionFetchCount()` is 200 and `getPrepareStatementCount()` is 1. What's
going on, and why is the second number misleading here?**

> The collections were loaded without separate statements — which sounds impossible until
> you remember Hibernate can initialise a collection from a result set it already has, via
> a multi-load, a `join fetch` on an outer query, or the batch/subselect machinery. So the
> statement count under-reports the work, and it's the number people watch. The collection
> count is the sensitive one: 200 collections for one query means 200 proxies were
> initialised, and if that happened across a request rather than a page, it's the N+1
> signature with a clean-looking query log. The other case worth naming: `join fetch` of a
> collection in a paginated query, where Hibernate warns `HHH000104` and does the paging
> **in memory** — one statement, hundreds of entities hydrated, and a page that returns the
> wrong number of rows. Which is why the assertion in a test should check both the
> statement count and the entity/collection counts, not just the first.

**S8. A reviewer sees a `@Transactional` service method with 40 lines of straight-line
business logic and one repository call in a loop. What should they ask?**

> "Show me the query count." That's the review that generalises, because a loop around a
> repository call is the N+1 shape whether it looks like one or not — and the answer
> decides whether the fix is a fetch join, a batch, or a projection. If the loop is over
> something already in memory, fine. If it's over a collection, the trigger is the
> association access inside it, which is why the review has to read the loop body, not just
> the loop header. The second thing worth asking is whether the method needs to be
> transactional at all: a read-only method annotated `@Transactional` for the wrong reason
> holds a connection for work that might not need one, and the loop is often the reason the
> transaction grew long enough to matter.

**P11. A list endpoint got slower over two weeks. DB CPU is 8%, mean query time is 3ms,
pool utilisation is 97%. What do you look at first, and what is it probably?**

> Pool *checkout* wait time, before anything else. High utilisation with low DB CPU means
> you're queueing for connections, not for CPU — the database is idle while your threads
> wait. The usual cause is round trips, so turn on `generate_statistics` and read
> `getPrepareStatementCount()` and `getCollectionFetchCount()` for one request. The
> `collectionFetchCount` is the one people miss: a request with one query and 200 collection
> initialisations is an N+1 with a clean-looking query count. The distinguishing question
> afterwards is whether the requests went up or the per-request query count did, because
> the fixes are entirely different — the first is a capacity problem and the second is a
> mapping problem.

**T9. An N+1 with `@BatchSize(50)` over 20 rows. How many queries? And over 5,000?**
`ADVANCED`

Two, and one hundred and one: `1 + ceil(N/n)`, so `1 + ceil(20/50) = 2` and
`1 + ceil(5000/50) = 101`. The point of the arithmetic is that `@BatchSize` is a
*constant-factor* improvement, not an asymptotic one — the query count is still linear in
N, just with a smaller slope. So it's the right fix for a bounded list of parents and the
wrong fix for an unbounded one, and the moment you catch yourself raising the batch size to
make a growing report faster, you've found the boundary: 100 queries for 5,000 rows is
still a problem, and the fix is pagination, a projection with a `GROUP BY`, or a
denormalised column — not a bigger `n`.

**S9. A PR adds `@EntityGraph(attributePaths = "lines")` to a method that returns a
`Page`. What should the reviewer say?**

> That's the fetch-join-plus-pagination bug, and it's worse than the N+1 it fixes: `LIMIT`
> applies to the joined rows, so the page contains however many *distinct* orders those
> twenty rows represent — maybe four — and rows are missing from later pages. Hibernate 6
> warns with `HHH000104` and may fetch the entire result set and page in memory, which is
> strictly worse than N+1. The correct shape is a second query for the collection
> (`@BatchSize`, a `@Query` with a separate fetch, or a second repository call keyed on
> the page's IDs), or paginate a subquery of IDs and fetch outside it. And the follow-up
> question is how many `List` fields are involved, because two of them is a
> `MultipleBagFetchException`.

**D11. N+1 is a review-time problem. Why, and what is the actual control?** `STAFF`

Because the failure isn't visible at review time *and* isn't visible at runtime — the code
reads correctly, every query is fast, the endpoint works, and the tests pass (especially
with OSIV on, which is the default). Which means the only place it can be caught is in CI,
by a test that runs the real query through the real mapping and counts the statements. A
review rule is a control only if a human remembers it; a query-count assertion in the
repository test template is a control because it runs on every build. Two design decisions
make it work: the assertion goes in the *template* every new query test copies, and it's
an **upper bound** with a comment explaining the budget, not an exact number — an exact
number fails on every unrelated mapping change and gets deleted within a month. The
organisational version of the answer is that this is a one-time investment in test
infrastructure with a permanent return, and it's the only one in the persistence layer
whose absence compounds.

**D12. Would you ban `join fetch` in review to stop N+1s?** `STAFF`

No — it's the wrong lever for the right instinct, and it fails the requirement it was
aimed at. A ban removes a tool without replacing it, so teams compensate with a global
`default_batch_fetch_size` that changes the behaviour of every query in the app, including
the ones that work fine, and which can introduce large `IN` clauses on to-one associations
half the queries don't need. The control that actually works is the query-count assertion:
it catches every N+1, including the ones nobody wrote a `join fetch` for — the ones inside
loops, the ones from `equals` touching a lazy association, the ones inherited from a
mapping someone else wrote. And then the review comment on a specific `join fetch` is
about *this* method's constraints: does it paginate, is more than one `List` involved, is
the association provably non-null. That's a review that can be done. "No fetch joins" is a
rule that can't be.

**D13. A team has 40 endpoints and 12 of them are on the critical path. Would you fix the
N+1s or rewrite the read layer?** `STAFF`

Fix the N+1s, and fix the ones on the critical path first, because that's a week's work
against a quarter's and it de-risks the rewrite. But the rewrite is the right answer for
the read layer in general, and the reason is the projection argument: the DTO projection
doesn't make the N+1 cheaper, it makes the *query* correct — one query returning the five
columns the response needs, instead of twenty entity graphs walked in Java. Once you accept
that the endpoint never needed the entities, the repository abstraction has nothing left to
abstract and the honest shape is an explicit query object with a hand-written mapping. The
sequencing that works: projections on the twelve hot endpoints, projections in the test
template so new endpoints start correct, the legacy ones as they're touched, and delete the
repository methods when the last caller goes. The migration cost is in the *review*
process, not the code, which is why the test template is the thing to do first.

### Querying & Pagination

**P12. A search endpoint takes a free-text term and a category filter. The category filter
is optional and the endpoint is on the critical path. What would you actually build?**

> Measure first, then split the paths. The two or three combinations that carry almost all
> the traffic get explicit `@Query` methods returning a DTO projection — plan-cached by
> Hibernate, indexable by the DBA, greppable, and returning exactly the columns the response
> needs. The long tail of combinations gets a `Specification`, and it gets one with
> `query.distinct(true)` whenever it touches a to-many, because the derived count and the
> page will otherwise disagree. And the count: if the UI can say "load more" instead of
> "page 4 of 89", that is a `Slice` and it removes the query that is usually the most
> expensive one in the request. The part worth deciding explicitly is the tiebreaker —
> `Sort.by(DESC, "createdAt").and(Sort.by(DESC, "id"))` on every paginated method, because
> a non-unique sort is a correctness bug that shows up as duplicated rows on one user.

**T10. A `Specification` joins a collection, and `Page.getTotalElements()` returns 5× the
real count. Why?**

> Because the count query is derived from the criteria query, and joining a to-many
> multiplies the rows — an article with five tags contributes five rows to the count. The
> page content is usually deduplicated (Spring Data applies the distinct it can), but the
> count isn't, so `getTotalElements()` and `getNumberOfElements()` disagree and the UI
> shows "1,247" for 340. The fix is `query.distinct(true)` in the specification when more
> than one predicate is present, or an explicit `countQuery` when the specification isn't
> in play. Worth saying in the interview that the `if (query != null)` guard around
> `distinct` isn't ceremony — the count query passes a null `Query` for exactly this
> reason.

**S10. A PR adds `@Query` with a constructor expression returning a record. What should the
reviewer check?**

> Three things, in this order. (1) That the constructor argument order in the query matches
> the record's component order — it's positional, so a reordered field is a compile-OK,
> runtime-wrong mapping that produces a DTO with the right shape and wrong values. (2) That
> the `new` expression uses a **fully-qualified** class name, because JPQL resolves it
> against the persistence unit, not the Java import. (3) That the entity field names in the
> select clause exist — this is validated at startup, which is a genuine advantage of `@Query`
> over a derived method, so it's worth confirming someone will notice when it fires. The
> review comment worth making generally is that a constructor expression returning a record
> is the *refactor-safe* projection, and an interface projection is the one that returns
> nulls when a getter is renamed.

**D14. A team has 200 repository methods, and adding the 201st takes two days of
discussion. What's the actual problem, and what would you change first?** `STAFF`

The problem isn't the method, it's that there are two different jobs in one interface and
neither is being served. Some of those 200 are aggregate writes and reads, and they belong
in a repository — but most are read models for a UI, and a read model isn't an aggregate
at all: it has no lifecycle, no invariant, and no reason to be an entity. The first change
is to separate them by type, not by convention: an `OrderRepository` for the aggregate with
entity returns and transactional writes, and a `OrderQueryService` for the reads with DTO
returns, `readOnly = true`, and a `Pageable`. The second change is to make the read side
proactively correct — projections in the test template, `Slice` by default, the tiebreaker
baked into one shared `Pageable` default — so the 201st method is written correctly the
first time instead of becoming the 202nd review. The measurable outcome is the number of
methods called from outside their aggregate's own service, because that's the real size of
the repository problem, and it usually turns out to be about a fifth of 200.

**P13. A paginated admin grid shows 1,247 results; the same filter run by hand returns
340. What's the likely cause?**

> The count query. Spring Data derives it by cloning the main query and replacing the
> select clause, which is wrong for anything with a `join fetch` of a collection (it counts
> joined rows, so an order with five lines counts five times) and wrong when it can't
> translate a `distinct`. The page itself is right; only the total is inflated, which is
> why it looks like a plausible number rather than an obvious one. The fix is an explicit
> `countQuery`, or — better — `Slice` if the UI doesn't genuinely need a total, which also
> removes the most expensive query in the request.

**T11. A keyset-paginated query. Why is `(created_at, id) < (:lastCreatedAt, :lastId)`
required, and what if you drop the `id`?**

> Because `created_at` isn't unique. Without the `id` tiebreaker, the predicate
> `created_at < :lastCreatedAt` skips every row sharing the boundary timestamp with the
> last row you returned — so you silently drop rows on each page boundary. The row-value
> comparison is how you express "strictly after this exact composite position" in one
> predicate; written out it's
> `(created_at < :t) or (created_at = :t and id < :id)`, which is what you need on
> dialects without row-value comparison (SQL Server, older Oracle). This is the same
> tiebreaker rule as the offset case, and it's the one worth making a review comment on
> every paginated method.

**S11. A PR introduces `Pageable` from a `@RequestParam int page, int size` with no
maximum on `size`. What should the reviewer catch?**

> Three things. No upper bound on `size` means `?size=1000000` is a legitimate request that
> hydrates a million entities into the persistence context — a trivially exploitable OOM.
> No validation on `page` means a negative or absurd offset becomes a full scan. And no
> `sort` validation, if the controller passes a sort field from the request into
> `PageRequest.of(page, size, Sort.by(sortField, direction))` — that's a column name from
> user input, which needs a whitelist, not a string. Spring Boot's `spring.data.web.pageable
> .max-page-size` handles the first one, which is the argument for configuring it
> globally rather than per-controller.

**D15. `Page` or `Slice` — is it a technical decision?** `STAFF`

It's an API-contract decision, which is why it belongs in design review. `Page` means "the
client can ask for page 47 and needs the total"; `Slice` means "the client can go forward
and we won't tell it how many there are." That's a commitment to the client, and reversing
it later is a breaking change — which is the real reason it can't be settled at the
repository layer where it looks like a type choice. On the merits, `Slice` is right far
more often than people use it, because the count is frequently the most expensive query in
the request and the UI mostly needs "is there more". The honest exception is a grid with
numbered pages, where the total is a genuine requirement and you should either pay for the
count or cache it. And a third option worth naming for tables too big to count: an
approximate total, clearly labelled.

**D16. Is the ORM the right tool for a reporting workload?** `STAFF`

No, and it's worth being able to say why rather than just that. A report has no aggregate
to load — it's aggregations across entities, usually with window functions, CTEs, calendar
joins and conditional aggregation, and the result is a projection that no entity maps to.
Forcing that through JPQL means either a query nobody can read or a native query with a
DTO mapping, at which point the ORM is contributing nothing except the transaction and the
connection pool. The right shape for a report is a separate read path: a view or a
materialised view, an explicit SQL file, or a read replica. And the argument that settles
it operationally is blast radius — reports have a different query profile, a different
concurrency shape and a different latency tolerance from the transactional path, and
sharing a pool and a cache between them means the report starves the write path. Put them
on separate connections and let the report be as slow as it needs to be.

### Schema, Batching & Sizing

**P14. A deploy succeeded, and twenty minutes later an unrelated feature started failing
with `OptimisticLockingFailureException` on a table nobody in the deploy touched. What is
the likely explanation?**

> The deploy added `@Version` to a shared entity, or changed a flush order. Once an entity
> has a version column, *every* `UPDATE` carries `WHERE id = ? AND version = ?`, and any
> concurrent writer that wins the race turns the loser's update into a zero-row update that
> Hibernate reports as `OptimisticLockingFailureException`. So a version column converts
> silent last-writer-wins into a loud retry requirement — and if the caller doesn't handle
> it, a previously-silent (and previously lossy) race becomes a visible 500. The other
> candidate is a migration that ran concurrently and blocked, extending a transaction past
> the point where conflicts accumulate. Either way the fix is at the caller: catch
> `OptimisticLockingFailureException` and retry the whole transaction a bounded number of
> times, which is the reason to prefer optimistic locking in the first place — it fails
> fast and is retryable, unlike a deadlock or a lock timeout.

**T12. `show_sql=false` and `logging.level.org.hibernate.SQL=DEBUG`. Which is the better
choice for local development, and why?**

> The logging level, and the reason is that `show_sql` is a boolean rather than a level: it
> writes to `System.out`, it bypasses your logging framework entirely, it can't be filtered
> or routed to a file, and its cost is invisible. `format_sql` is a genuine per-statement
> string transformation and makes the output harder — not easier — to copy-paste into a
> `psql` prompt, which is the only thing most people want it for. The logging level goes
> through SLF4J, is category-scoped so you can turn it on for one package, and is the thing
> you actually want in a test. The production note is the one worth making: the level to be
> careful with is `org.hibernate.orm.jdbc.bind=TRACE`, because it logs query *parameters* —
> which means PII and tokens into log aggregation, under a different retention policy than
> the database. In a regulated environment the query log is a data store with a compliance
> obligation.

**S12. A PR raises `maximum-pool-size` from 10 to 50 because "p99 latency is high under
load." What should the reviewer make the author actually measure?**

> The direction of the diagnosis. The two failure modes have opposite signatures, and the
> one that means "raise it" is the rarer one. If the pool is too small, pool **checkout
> wait** is high while query duration is flat and **DB CPU is low** — the database is idle
> while your threads queue, which is a capacity problem. If the pool is already too big,
> DB CPU is pinned near 100%, per-query mean time is rising, and throughput is flat — adding
> connections makes p50 *worse*, because every session contends on four cores. So the
> review question is "what is DB CPU during the incident?" and the follow-up is what the
> connection is *held* for: 60 concurrent requests on a pool of 10 is a symptom of a
> multiplier somewhere — a connection held across an HTTP call, or across a retry sleep —
> and that multiplier is what actually sets the required pool size. `leak-detection-threshold`
> in a test environment finds it.

**D17. A startup query takes 4 minutes because it's scanning a 200-million-row table. Do you
add an index, or change the query?** `STAFF`

You need the `EXPLAIN ANALYZE` before either, because the answer differs and guessing is
how teams add four indexes to a table and get a slower plan. Three outcomes. If it's a
missing index on a selective predicate, add it — but check whether the column is
selective, because an index on a column matching 30% of rows is not used by a planner at
any scale and you've paid write amplification for nothing. If the predicate isn't
sargable — `LIKE '%x%'`, or a function wrapping an indexed column — an ordinary index
won't help and you need a functional index, a trigram index, or a different access path. And
if the query genuinely needs to aggregate 200 million rows, no index is the answer: it
belongs in a materialised view, a pre-aggregated table maintained incrementally, or a
read replica doing the heavy scan — because a four-minute query on the primary is a
four-minute transaction holding a connection, and at any concurrency that is a pool
exhaustion event. The staff-level point is that "add an index" is the answer teams reach
for reflexively, and the reflex is wrong roughly as often as it's right, which is why the
execution plan belongs in the review.

**D18. Ten services share one database. Who owns connection-pool sizing, and what is the
constraint that makes it a shared decision?** `STAFF`

The constraint: total connections across every instance of every service must fit under the
database's `max_connections`, minus headroom for administration, migrations, replication
slots, monitoring and the DBA's own psql session. Ten services at ten connections each is
100 — which is PostgreSQL's default limit, before anything else uses a connection. So pool
size is a per-instance number with a global ceiling, and nobody can own it locally without
being wrong. The answer that works is a shared default: one value in one place
(a `@ConfigurationProperties`-bound `maximum-pool-size`, ideally from a config service or a
convention repository) that each service inherits, with per-service overrides only where
there's a measured reason. The sizing rule — CPU cores plus spindles, and therefore usually
*smaller* than feels comfortable — has to be the shared default too, because the local
optimisation instinct ("this service is slow, give it more connections") is exactly the
thing that produces the outage, since every extra connection makes every other one slower.
The measure of whether this is working is not per-service latency; it's the headroom
remaining at full scale-out, which is the number nobody checks until the day they need to
add an instance.

**P15. A deploy added a `NOT NULL` column. The deployment succeeded, and forty minutes
later the database was unresponsive.**

> `ALTER TABLE ... ALTER COLUMN ... SET NOT NULL` takes an `ACCESS EXCLUSIVE` lock and,
> to validate it, scans the whole table. Every concurrent `SELECT` and `INSERT` queues
> behind it rather than failing, so the outage shows up as latency everywhere and — this
> is the part that hurts — error-rate alerting may never fire. The rollback isn't available
> either: the rollback deploy is waiting on the same lock, and the ALTER itself may be
> waiting on a long-running transaction that holds a conflicting lock. Prevention is
> expand-and-contract: add the column nullable, deploy, backfill, switch reads, and only
> add the `NOT NULL` in a later deploy once the data is known to be clean — or validate it
> out of band, and drop the constraint in a deploy where nothing else is happening.

**T13. `hibernate.jdbc.batch_size=50` set, `order_inserts=true` set, 50 inserts of one
entity type using `GenerationType.IDENTITY`. How many round trips?**

> Fifty — the batch size is inert. With `IDENTITY`, Hibernate has no ID until the INSERT
> executes, so it must execute and read the generated key back before it can proceed; it
> cannot accumulate statements. This is the most common "batching doesn't work" finding and
> the fix is `GenerationType.SEQUENCE`, which gets the ID *before* the INSERT from a
> pre-allocated block, at the cost of gap-free IDs and a portability caveat on older MySQL
> and MariaDB. And the follow-on: even with `SEQUENCE`, JDBC batching is one round trip
> with 50 *statements* — turning that into 50 *rows* needs a driver setting
> (`rewriteBatchedStatements`, `reWriteBatchedInserts`), which is where the biggest
> multiple is.

**S13. A PR changes `@GeneratedValue(strategy = IDENTITY)` to `SEQUENCE` on a live table.
What should the reviewer check?**

> Whether the database supports sequences — MySQL before 8.0 and MariaDB before 10.3 don't,
> so this is a portability and deployment question, not a style one. Whether the ID
> generation semantics change in a way anything depends on: `SEQUENCE` leaves gaps on
> rollback and on failed inserts, so anything that assumes gap-free, monotonically
> increasing IDs — a human-readable ID, a `created_at`-derived sequence, an external system
> that infers order from the ID — breaks. And whether the migration adds the sequence and
> sets the default, or the first insert after deploy fails. All three are real and all
> three have bitten teams that changed it as a "performance tweak" without a migration.

**D19. We set `ddl-auto: update` in production to stop writing migrations. Would you
recommend it?** `STAFF`

No, and it's worth being precise about why, because "it can drop your data" is not the
reason — `update` never drops anything. The reason is that it has no history. It can
express a single statement, not a sequence, so it cannot add a nullable column, backfill it
and then constrain it; and the `NOT NULL` it tries to add directly is a full-table
rewrite under an exclusive lock, which is the P8 outage. It also never drops, so the schema
drifts permanently in the accumulating direction — every removed field's column is still
there forever, and the only record of what the schema was is a running diff. And it fails
silently in a fourth way: a column that exists with the wrong type is left alone. The
staff-level answer is that the cost isn't the DDL, it's that you've replaced an auditable
history with a diff, and the first time you need to answer "which environments have this
column" — which is a Tuesday, not an incident — there's nothing to answer with.

**D20. A schema change needs to be zero-downtime. Walk me through the rollout and tell me
where it goes wrong.** `STAFF`

Expand: add the column nullable with no default (metadata-only on modern PostgreSQL), deploy
code that dual-writes old and new, backfill in batches outside a single long transaction,
and verify — count the nulls, compare aggregates. Migrate: switch reads to the new column
while both are still correct, so this deploy is safe in both directions. Contract: add the
`NOT NULL`, build the index `CONCURRENTLY`, stop dual-writing, drop the old column. It goes
wrong in three places. (1) Running the contract phase too early — instances from the
previous deploy are still writing the old column, and the drop is unrecoverable because the
data's gone. (2) Rolling back after the contract phase, which is impossible by
construction. (3) Assuming one deploy — the whole point is three, spread over at least one
full release cycle, with monitoring proving each phase completed. And the one thing worth
conceding: for a rename, this is genuinely painful, which is the argument for renaming the
*field* and leaving the column alone.

**D21. Pool is 20 per instance, 6 instances, PostgreSQL `max_connections` is 100. Are you
in trouble?** `STAFF`

Yes, and the shape of the trouble is the part that gets teams. 6 × 20 = 120 against a 100
limit means you are *already over*, before the read replicas, the migrations, the analytics
user, or the DBA's psql session — and the failure is not a clean error, it's connections
being refused intermittently on new instances, which presents as random 500s on a fraction
of traffic. The budget is `(max_connections - reserved - admin) / total_instances` with
headroom for a scale-out event, and it has to be sized for the *scaled* state, not the
current one. Which is the deeper point: pool sizing is a per-instance decision with a
global constraint, so it belongs in one place — a `@ConfigurationProperties` bound
`maximum-pool-size` from a shared value — rather than in each service's `application.yml`,
because the failure only appears when the last instance is added and nobody can tell which
service caused it.

**D22. `readOnly = true` is documented as a performance optimisation. How does it actually
make things faster?** `STAFF`

Two mechanisms, and the second is the newer one. Spring sets Hibernate's
`FlushMode.MANUAL` for a read-only transaction, which skips the dirty check entirely — no
snapshot comparisons, and structurally no accidental writes, so it's both faster and safer.
And since Hibernate 6, with `hibernate.connection.provider_disables_autocommit`, Spring
opens a genuinely read-only connection so the driver and the server know no writes are
coming — PostgreSQL will skip flushing its own dirty pages for that transaction, which is
a saving on the *database* side, not just the client. `SimpleJpaRepository` already sets
`readOnly = true` at class level, so repository reads get this free; the annotation that
matters is on your service methods, and the ones worth annotating are the read-heavy
endpoints that dominate a typical application. The honest caveat is that it changes the
transaction's contract, so a write sneaking into a read-only path either silently doesn't
happen or fails — which is a feature, and also the thing that surprises people.

**D23. When do you stop using the ORM, and how do you make that decision on a team rather
than in one PR?** `STAFF`

The signal is the *first* workaround, not the third — that's the discipline, and it matters
because each workaround is permanent, load-bearing complexity that the next maintainer must
understand, and an entity graph under three fetch-join hacks is usually already wrong.
The decision itself is cheap: a repository fragment with hand-written SQL and a record
return type is about 40 lines, greppable, visible to the DBA, covered by one integration
test, with no hidden behaviour. What's hard is the team-level part, because "just write
native SQL" as an unexamined escape hatch produces a codebase where a third of the
repository is hand-written SQL maintained by two people with no index review and no
`EXPLAIN` before merge. So the resolution is a stated boundary plus a review gate, not a
prohibition: repositories own single-aggregate CRUD, a named query layer owns anything with
a fetch join or a projection, and native SQL is allowed with an explicit result mapping, a
`countQuery` if paginated, and an execution plan. The measure of whether it's working is
that a DBA can look at your repository layer and recognise the queries.



