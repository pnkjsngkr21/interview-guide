---
title: "The Spring Complete Deep-Dive"
volume: 4
series: "TRANSACTION MANAGEMENT"
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
a connection pool, a thread pool — and the notes always go down to that machinery, because
that is the layer where production incidents actually live.

Volume 4 is about the gap between an annotation and a transaction. A team can annotate
forty methods with `@Transactional` and have nine of them run with no transaction at all,
and every one of those nine will pass a test that happens not to exercise the failure. The
distance between "the annotation is on the method" and "a transaction started, on this
connection, on this thread" is where data integrity quietly breaks, and the whole volume is
organised around getting better at measuring it.

### Continuing From Volume 3

Volume 1 gave you the container, Volume 2 the bean lifecycle, and Volume 3 the proxy
mechanism. This volume assumes all three, because `@Transactional` is not a data-access
feature in the way it appears — it is a proxy, built on `TransactionInterceptor`, resolving
attributes through the container's `TransactionAttributeSource`. The "why is my annotation
doing nothing" answer is almost always a Volume 3 answer wearing a transaction costume.

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto
`TransactionDefinition.Propagation` produces filler. The template is a completeness
checklist, not a template to fill.

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
| Volume 4 (this book) | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 4

- Chapter 1 — The Transaction Abstraction
- Chapter 2 — `@Transactional` Deep-Dive
- Chapter 3 — Propagation in Depth
- Chapter 4 — Isolation Levels & Concurrency
- Chapter 5 — Declarative vs Programmatic
- Chapter 6 — Common Failure Modes
- Chapter 7 — Beyond One Database
- Chapter 8 — Interview Scenario Bank

---

# Part 4 — Transaction Management

## Chapter 1 — The Transaction Abstraction

### 1.1 Why an Abstraction at All

Before Spring, transaction management was a `try { conn.setAutoCommit(false); ...;
conn.commit(); } catch (...) { conn.rollback(); }` block repeated in every DAO, with the
rule "never let a connection escape the method that opened it" enforced by code review and
hope. The trouble is that the *unit of work* is almost never the unit of data access. A
service method calls three repositories, a JPA repository, and a message publisher, and the
transaction has to span all of them while the transaction resources belong to four different
APIs.

Spring's answer is not clever. It is an interface with three methods:

```java
public interface PlatformTransactionManager {

    TransactionStatus getTransaction(TransactionDefinition definition) throws TransactionException;

    void commit(TransactionStatus status) throws TransactionException;

    void rollback(TransactionStatus status) throws TransactionException;
}
```

That is the whole SPI. Everything else — `@Transactional`, `TransactionTemplate`,
`TransactionSynchronizationManager`, propagation, isolation, the "read-only" hint — is built
on top of those three calls. An interview answer that stops at "Spring handles transactions
for you" has missed the entire point: **the abstraction exists so that the transaction
boundary is a policy decision made in one place, and the resource acquisition is a detail
each technology hides behind an implementation.**

> **INTERVIEW TRAP**
>
> "Spring's transaction management is implemented with AOP" is true and nearly useless on
> its own. The senior version: `@Transactional` is *metadata* read by a
> `TransactionAttributeSource`, turned into a `TransactionAttribute`, applied by a
> `TransactionInterceptor` running inside the proxy chain, which then calls
> `PlatformTransactionManager.getTransaction` / `commit` / `rollback`. The AOP is how the
> advice gets invoked; the `PlatformTransactionManager` is what actually starts and ends
> anything. Knowing which of those two failed is most of the debugging.

### 1.2 The Three Types

```java
// ── WHAT to do (policy) ───────────────────────────────────────────
public interface TransactionDefinition {
    int getPropagationBehavior();
    int getIsolationLevel();
    int getTimeout();                 // SECONDS, not millis — a genuine trap
    boolean isReadOnly();
    String getName();                 // the "label"
    // ... plus mutators for the programmatic path
}

// ── WHAT HAPPENED (state) ─────────────────────────────────────────
public interface TransactionStatus extends SavepointManager {
    boolean isNewTransaction();       // did we CREATE one, or join an existing one?
    boolean hasSavepoint();
    void setRollbackOnly();           // ← the "mark rollback-only" power
    boolean isRollbackOnly();
    boolean isCompleted();
    Object createSavepoint();
    void rollbackToSavepoint(Object savepoint);
    void releaseSavepoint(Object savepoint);
}

// ── HOW (mechanism) ───────────────────────────────────────────────
public interface PlatformTransactionManager { /* getTransaction, commit, rollback */ }
```

`TransactionStatus.isNewTransaction()` is the method that tells you the truth about
propagation, and it is under-used in interviews. A `REQUIRES_NEW` inner call returns a
status with `isNewTransaction() == true` even when an outer transaction exists; a `REQUIRED`
inner call returns `false`. If you want to log or assert on transaction structure rather
than guess it, that is the accessor.

`setRollbackOnly()` is the other under-used one. It marks the *current* transaction as
doomed without throwing — the canonical use is "this inner part failed, I don't want to
throw here, but the whole transaction must roll back." `TransactionAspectSupport` sets it
when an inner participating method throws, which is why a `REQUIRES_NEW` inner transaction
committing successfully does not save the outer one from an earlier failure.

> **MUST REMEMBER**
>
> `TransactionDefinition` carries the **policy** (propagation, isolation, timeout,
> readOnly), `TransactionStatus` carries the **runtime state** (is this new, is it
> rollback-only, does it have a savepoint), and `PlatformTransactionManager` carries the
> **mechanism** (which resource, and how it begins and ends). Interviewers who hear
> "Spring's transaction interface has `commit` and `rollback`" have usually met someone
> who has configured a second data source without reading anything.

### 1.3 The Implementations

| Implementation | Resource it manages | Bound to thread via | Typical use |
| --- | --- | --- | --- |
| `DataSourceTransactionManager` | A JDBC `Connection` | `DataSourceUtils` (`ThreadLocal`) | Plain JDBC, `JdbcTemplate`, Flyway, batch |
| `JdbcTransactionManager` | JDBC `Connection` | Same, but propagates SQLError codes | The JDBC-only replacement, Spring 6+ |
| `JpaTransactionManager` | JPA `EntityManager` / `EntityManagerFactory` | `EntityManagerFactoryUtils` | Hibernate, `JpaRepository` |
| `HibernateTransactionManager` | A Hibernate `Session` | `SharedSessionContract` | Full control of Hibernate integration |
| `JtaTransactionManager` | A JTA `Transaction` (XAResource) | The JTA `TransactionManager` | Distributed, container-managed |
| `R2dbcTransactionManager` | An R2DBC `Connection` | `ConnectionFactoryUtils` | Reactive — see Volume 10 |

The distinction that matters for everything else in this volume: **a transaction manager
manages exactly one resource, and binds it to the current thread for the duration of the
transaction.** `DataSourceUtils.getConnection(dataSource)` checks the thread-bound holder
first, and only borrows a new connection from the pool if there isn't one. That single
indirection is why two `JdbcTemplate`s pointed at the same `DataSource` inside one
transaction share one connection, and why a transaction that leaks a connection into a
different thread breaks everything.

> **SCALING REALITY CHECK**
>
> The thread binding is a `ThreadLocal`, and `ThreadLocal` is per-thread. In an application
> with 200 Tomcat worker threads, a leaked transaction context is 200 separate leaks that
> clean up only when the request thread's context is recycled — which is why Spring clears
> the holder in a `finally` block inside `DataSourceUtils.releaseConnection` and why a
> transaction begun on a request thread and continued on an `@Async` thread is not
> "propagated" so much as "re-created, without the original connection, so it never commits
> atomically with anything." The transaction is a thread-local resource, full stop.

### 1.4 `DataSourceTransactionManager` and Why It Is Not Enough

```java
public class DataSourceTransactionManager extends AbstractPlatformTransactionManager {

    private DataSource dataSource;                 // the single resource

    protected Object doGetTransaction() {
        // Ask the ThreadLocal first, then the DataSource for a fresh connection.
        ConnectionHandle conHandle = DataSourceUtils.getConnectionHandle(dataSource);
        return (conHandle != null ? conHandle : new ConnectionHolder(dataSource));
    }

    protected void doBegin(Object transaction, TransactionDefinition definition) {
        Connection con = DataSourceUtils.getConnection(obtainDataSource());
        try {
            con.setAutoCommit(false);                        // ← the whole trick
            if (definition.getIsolationLevel() != ISOLATION_DEFAULT) {
                DataSourceUtils.prepareConnectionForTransaction(con, definition);
            }
            con.setReadOnly(definition.isReadOnly());         // ← a HINT, see below
            DataSourceUtils.prepareConnectionForTransaction(con, definition);
            doBegin(con, definition);
        }
        catch (Throwable ex) {
            DataSourceUtils.releaseConnection(con, ex);       // return it, do not leak it
            throw new CannotCreateTransactionException(...);
        }
    }

    protected void doCommit(DefaultTransactionStatus status) {
        ConnectionHolder holder = (ConnectionHolder) status.getTransaction();
        Connection con = holder.getConnection();
        try {
            if (con.isReadOnly() && logger.isWarnEnabled()) {
                logger.warn("DataSourceTransactionManager is not driving a transaction "
                    + "on a read-only connection — the driver may reject writes silently");
            }
            con.commit();
        } catch (SQLException ex) {
            if (isRollbackOnCommitFailure()) {
                doRollbackOnCommitException(status, ex);
            }
            throw new TransactionSystemException(ex);
        } finally {
            DataSourceUtils.releaseConnection(con, status);
        }
    }

    protected void doRollback(DefaultTransactionStatus status) {
        ConnectionHolder holder = (ConnectionHolder) status.getTransaction();
        try {
            holder.getConnection().rollback();
        } finally {
            DataSourceUtils.releaseConnection(holder.getConnection(), status);
        }
    }
}
```

Two details in that code cause real incidents and are worth being able to recite:

1. **`con.setAutoCommit(false)` and nothing else.** `DataSourceTransactionManager` knows
   nothing about your SQL. It flips the JDBC flag and hopes the driver has the same idea
   about what "the unit of work" means. A non-transactional table in MySQL, a `CREATE TABLE`
   in PostgreSQL, or a table in an older MyISAM engine will silently not participate, and
   no exception is raised.
2. **`con.setReadOnly(readOnly)` is a hint, not an enforcement.** PostgreSQL will throw on
   any write to a read-only connection. MySQL and H2 will not. So the *same* `@Transactional(readOnly = true)`
   either enforces or does not enforce depending on the database, and code that relies on it
   works in one environment and corrupts in another.

> **PRODUCTION RELEVANCE**
>
> Spring 6 deprecated plain `DataSourceTransactionManager` in favour of
> `JdbcTransactionManager`, which adds two things that matter in production: it translates
> `SQLException` subclasses into Spring's `DataAccessException` hierarchy (so
> `DuplicateKeyException` is catchable without a `SQLIntegrityConstraintViolationException`
> import), and it has `isRollbackOnCommitFailure()` and the exception-quorum behaviour of
> the `SQLExceptionSubclassTranslator`. For a new JDBC-only service, `JdbcTransactionManager`
> is the correct choice; for a new JPA service, `JpaTransactionManager`; for a reactive
> service, `R2dbcTransactionManager`. Migrating an existing `DataSourceTransactionManager`
> is a one-line change with a genuinely small blast radius.

### 1.5 `JpaTransactionManager` — And Why It Is Not a JDBC One

`JpaTransactionManager` does not manage a `Connection`. It manages an `EntityManager` and
binds it (plus the `EntityManagerFactory`) to the thread, so every `JpaRepository` call in
the transaction participates in the *same* persistence context.

```java
public class JpaTransactionManager extends AbstractPlatformTransactionManager {

    @Override
    protected Object doGetTransaction() {
        EntityManagerFactory emf = getEntityManagerFactory();
        // If a @PersistenceContext / SharedEntityManagerCreator-bound EM is already
        // bound to this thread, JOIN it. Otherwise create a new one for the tx.
        EntityManager em = EntityManagerFactoryUtils.doGetTransactionalEntityManager(emf);
        return new JpaTransactionObject(em, new EntityManagerHolder(em));
    }

    @Override
    protected void doBegin(Object transaction, TransactionDefinition definition) {
        if (transaction instanceof EntityManagerHolder emh) {
            EntityManager em = emh.getEntityManager();
            if (!em.getTransaction().isActive()) {
                em.getTransaction().begin();            // ◄── the JPA transaction begins
                emh.setTransaction(newTransactionStatus(definition));
                prepareFlushMode(em, definition);        // ◄── readOnly → MANUAL
                if (definition.getIsolationLevel() != ISOLATION_DEFAULT) {
                    // Deferred: applied on the JDBC connection Hibernate holds,
                    // because JPA's own API cannot express it portably.
                    prepareTransactionIsolation(em, definition);
            }
        }
    }

    @Override
    protected void doCommit(DefaultTransactionStatus status) {
        JpaTransactionObject txObject = (JpaTransactionObject) status.getTransaction();
        EntityTransaction etx = txObject.getEntityManagerHolder()
                                       .getEntityManager().getTransaction();
        try {
            if (etx.isActive()) {
                etx.commit();                            // ◄── flush + commit
            }
        } ...
    }
}
```

Three things fall out of this that belong in an answer:

- **It participates in the JPA flush.** `em.getTransaction().commit()` triggers the
  persistence context's flush — dirty checking, the SQL that Hibernate generates from the
  change set. A `DataSourceTransactionManager` committing the same changes would commit the
  SQL that had already been flushed and would leave the persistence context's pending
  changes unflushed and lost. This is the single most important reason the manager is
  JPA-specific.
- **It sets Hibernate's `FlushMode` from `readOnly`.** `readOnly = true` sets
  `FlushMode.MANUAL`; the change is reverted on completion. So a `@Transactional(readOnly = true)`
  method that mutates a managed entity **silently discards the mutation** unless it calls
  `entityManager.flush()` explicitly. Chapter 6 covers this as a failure mode; this is the
  mechanism.
- **Isolation is deferred to JDBC.** JPA's own API exposes only four portable levels, and
  Hibernate maps `Isolation.SERIALIZABLE` onto a physical `SET TRANSACTION ISOLATION
  LEVEL SERIALIZABLE`. Under `JpaTransactionManager` on a `HibernateJpaDialect`, the value
  is applied to the underlying `Connection` — which means a non-database-aware
  `EntityManager` (some third-party) silently does nothing.

### 1.6 The Combination That Everybody Gets Wrong

`JpaTransactionManager` can be handed a `DataSource`:

```java
@Bean
public JpaTransactionManager transactionManager(
        EntityManagerFactory emf,
        @Qualifier("dataSource") DataSource dataSource) {      // ◄── setDataSource
    JpaTransactionManager tm = new JpaTransactionManager(emf);
    tm.setDataSource(dataSource);       // lets it expose the DataSource as a JDBC resource
    return tm;
}
```

What that buys you: `JpaTransactionManager` then exposes the JDBC `Connection` that
Hibernate obtained as a `JpaDialect`-aware resource, so `JdbcTemplate` and
`DataSourceUtils.getConnection()` **share the same physical connection** as the persistence
context, and a `NativeQuery` or a `JdbcTemplate.update` is inside the same transaction as
the entity writes. This is a real and valuable thing to do in an application that mixes
Hibernate with hand-written SQL.

What it does NOT buy you, and where the incidents live: **it does not give you two
independent transaction managers.** If you *also* declare a `DataSourceTransactionManager`
bean, you now have two `PlatformTransactionManager` beans and every `@Transactional` without
a `value` becomes a `NoUniqueBeanDefinitionException` (Chapter 6). And if you force the
issue with two managers, a JPA transaction can commit while the JDBC one rolls back — a
**partial commit**, with no exception, no warning, and two tables in different states. The
correct answer to "I need JPA and JDBC to commit together" is *one* transaction manager over
one data source, not two.

> **PRODUCTION SCENARIO**
>
> Problem: a nightly reconciliation reported 3,142 orders with a status of `PAID` and no
> corresponding row in `payment_ledger`, every night, for eleven days.
> Investigation: nothing threw. The ledger insert used `JdbcTemplate`; the status update used
> a `JpaRepository.save()`. Both were annotated `@Transactional` — but on two different
> beans, so two different transaction managers were resolved.
> Root cause: `JpaTransactionManager` committed the JPA flush first. The subsequent
> `JdbcTemplate` insert was enlisted in a *separate* `DataSourceTransactionManager`
> transaction on a *different* connection, and the process was OOM-killed between the two
> commits. Two managers, two connections, two commits, one partial result.
> Solution: single `JpaTransactionManager` with `setDataSource(...)` so both access paths
> share one connection and one commit.
> Prevention: a startup assertion that exactly one `PlatformTransactionManager` bean exists,
> unless the application is deliberately multi-datasource with explicit `value` on every
> `@Transactional`.

> **STAFF-LEVEL CONSIDERATION**
>
> **One transaction manager per data source, and never more than one active per thread.**
> The first half is a Spring Boot default (`TransactionAutoConfiguration` creates exactly one
> when it finds a single `DataSource` or a single `EntityManagerFactory`), and the second is
> a property of the `ThreadLocal` binding — a thread has ONE bound resource per manager type
> and ONE "current transaction" per `TransactionSynchronizationManager`, so a second active
> transaction on the same thread means the first one's connection is either suspended
> (`REQUIRES_NEW`, and now competing for a second pool slot) or lost. Teams that add a second
> data source should say so in the architecture document, name the bean, and require
> `value = "..."` on every `@Transactional` that crosses data sources — because a
> `@Transactional` without a name against two candidates fails at *runtime*, per call site,
> and only on the paths that have two databases in play.

### 1.7 `JtaTransactionManager` and `R2dbcTransactionManager`

`JtaTransactionManager` manages a JTA `Transaction` obtained from a
`TransactionManager` (Atomikos, Bitronix, Narayana). Its distinctive capability is
**two-phase commit across XA resources** — the only Spring mechanism that can do that.

```java
@Bean
public PlatformTransactionManager txManager() {
    JtaTransactionManager tm = new JtaTransactionManager();
    tm.setTransactionManager(atomikosTransactionManager);
    return tm;
}
```

Its cost is a whole category of operational tooling (a transaction coordinator, recovery
daemon, `XA` support in every database, and the heuristic-outcome problem — after a
coordinator crash, a resource may be left in a state only the coordinator can resolve).
Chapter 7 treats this as the honest upper bound of "just use ACID across services" and
explains why almost nobody should pay for it.

`R2dbcTransactionManager` is the reactive counterpart of `DataSourceTransactionManager`,
managing a reactive `Connection` and integrating with Reactor's context rather than a
`ThreadLocal`. The rule is the same and the failure mode is the same: one transaction per
connection, and a connection is bound to whatever context created it. See Volume 10 for
what `TransactionalOperator` and `R2dbcTransactionManager` look like inside a `Mono`.

```java
// The reactive equivalent of @Transactional — a wrapper you compose into the chain.
Mono.from(dbClient.sql("UPDATE account SET balance = balance - 100 WHERE id = ?")...)
    .as(txManager::inTransaction)          // no — use TransactionalOperator in practice
    .contextWrite(TransactionalOperator.create(txManager, definition))
    .subscribe();
```

#### Common Mistakes

- Believing `@Transactional` is a data-access feature rather than a proxy. It is advice
  applied by `TransactionInterceptor` inside the proxy chain, which is why the Volume 3
  failure modes — self-invocation, `private`, `final`, `new` — apply unchanged.
- Assuming a `DataSourceTransactionManager` and a `JpaTransactionManager` can share a
  transaction because they point at the same database. They cannot; they are separate
  managers with separate connections and separate commits.
- Adding a second `PlatformTransactionManager` bean without putting `value = "..."` on every
  `@Transactional`, producing a `NoUniqueBeanDefinitionException` at the first call.
- Treating `readOnly = true` as an enforcement. On PostgreSQL it is; on MySQL and H2 it is a
  driver hint that does nothing, so the "protection" is database-dependent.
- Assuming `JpaTransactionManager` and `setDataSource` gives you two independent
  transactions. It gives you one connection and one commit — which is the point.
- Forgetting that `getTransactionTimeout()` is in **seconds**, and that a JDBC
  `setNetworkTimeout` and a JPA/Hibernate query timeout are different mechanisms with
  different failure behaviour.

#### Interview Questions — The Transaction Abstraction

**Q1. What are the three interfaces in Spring's transaction abstraction, and what does each
own?** `TRICKY`

`TransactionDefinition` is the *policy* — propagation behaviour, isolation level, timeout
in seconds, the read-only flag, and the label. `TransactionStatus` is the *runtime state* —
whether the transaction is new or participating, whether it has a savepoint, and whether it
has been marked rollback-only. `PlatformTransactionManager` is the *mechanism* — three
methods, `getTransaction`, `commit`, `rollback`, that know which resource is bound to this
thread and how to begin and end it. A senior answer adds the practical consequence:
`isNewTransaction()` and `isRollbackOnly()` on `TransactionStatus` are how you inspect
propagation behaviour at runtime rather than guessing it.

**Q2. Why can't you use a `DataSourceTransactionManager` with a `JpaRepository`?** `TRICKY`

You can, and it is a common mistake rather than a compile error. The JDBC manager flips
`autoCommit` on one `Connection`; it does not begin the JPA `EntityTransaction`, so the
persistence context never flushes and the entity changes are never written. The JPA flush is
part of the JPA transaction's commit, which is exactly what `JpaTransactionManager` calls
and the JDBC manager does not know about. Use `JpaTransactionManager`.

**Q3. `JpaTransactionManager` has a `setDataSource(...)`. When is it useful, and when is it
dangerous?** `ADVANCED`

Useful: the application mixes Hibernate with hand-written SQL through `JdbcTemplate`, and
you want both to use the same physical connection so a `NativeQuery` and a `JdbcTemplate`
insert are in one transaction. Dangerous: adding it while a separate
`DataSourceTransactionManager` bean also exists. Then you have two managers, `@Transactional`
without a `value` is ambiguous, and if you disambiguate you can get a JPA commit followed
by a JDBC rollback — a partial commit with no exception raised.

**Q4. What actually happens in `JpaTransactionManager.doBegin`?** `ADVANCED`

It obtains a transactional `EntityManager` — an existing thread-bound one if there is one,
otherwise a fresh one — calls `em.getTransaction().begin()`, builds a
`TransactionStatus` from the definition, and then sets Hibernate's `FlushMode` from the
`readOnly` flag (`readOnly=true` → `FlushMode.MANUAL`, reverted on completion). Isolation
cannot be expressed through the portable JPA API, so if the definition asked for a
non-default level it is applied to the underlying JDBC connection on the driver's thread
using the dialect's connection handling mode.

**Q5. A team has one database and two `PlatformTransactionManager` beans. What happens?**
`TRICKY`

Every `@Transactional` without an explicit `value` becomes a
`NoUniqueBeanDefinitionException` at the *first invocation*, not at startup — which makes it
a partial, hard-to-diagnose outage that only affects the call paths a test didn't cover.
The fix is to name the manager on every `@Transactional`, or to delete one. If the two
managers genuinely target two different `DataSource` beans, naming is correct; if they
target the same one, one of them should not exist.

**Q6. How many connections does one `REQUIRES_NEW` call need, and why does that matter at
scale?** `SCENARIO`

Two — the outer transaction's connection is *suspended* (still checked out, still holding
its locks) while a second connection is borrowed for the inner transaction. If the pool is
sized at N and N concurrent requests each do one `REQUIRES_NEW`, every thread is now holding
two connections for N pool slots, so the pool is exhausted and the next request waits on
`connectionTimeout` — which surfaces as
`HikariPool-1 - Connection is not available, request timed out after 30000ms`. It looks like
a database outage and is a code problem.

**Q7. Explain the thread binding, and what it implies for async work.** `STAFF`

A transaction manager stores the acquired resource in a `ThreadLocal` holder owned by
`TransactionSynchronizationManager` / `DataSourceUtils`. That means the transaction's
identity is the thread's identity. Code that hands a task to an executor and expects the
transaction to follow it is wrong: the new thread has an empty holder, gets its own
connection, and its "transaction" is independent — so the async write is neither committed
with nor rolled back with the request that scheduled it. Context propagation (Volume 10) is
the reactive answer; for MVC, the honest answer is that the async work is a separate unit of
work with its own `@Transactional` method.

**Q8. `getTransactionTimeout()` returns seconds. Why is that worth knowing?** `TRICKY`

Because the natural mistake is to write `@Transactional(timeout = 5000)` meaning 5 seconds
and actually get 5000 seconds — an 83-minute transaction that holds locks and defeats every
timeout the operations team set. The unit is inherited from EJB 2.1 and has never changed.
The related trap: on JDBC, the value is applied as a query timeout by the driver, and it
does not bound the time a `SELECT ... FOR UPDATE` waits for a lock unless the database is
configured with `lock_timeout`.

**Q9. Boot auto-configures exactly one `PlatformTransactionManager`. Under what condition
does it create more than one?** `ADVANCED`

When the application declares more than one `DataSource` or more than one
`EntityManagerFactory` bean. `DataSourceTransactionManagerAutoConfiguration` backs off
entirely in that case, and nothing tells you except a `NoUniqueBeanDefinitionException` at
runtime. The convention that holds up: if you have multiple data sources, you name every
`PlatformTransactionManager` bean and you put `value = "..."` on every `@Transactional` in
the application, even the ones that unambiguously use the primary — because the alternative
is an outage that only reproduces on the code paths that touch the second database.

> **CHAPTER 1 SUMMARY**
>
> Spring's transaction abstraction is three interfaces and three methods: a
> `TransactionDefinition` for policy, a `TransactionStatus` for runtime state, and a
> `PlatformTransactionManager` for the mechanism. Every implementation manages exactly one
> resource and binds it to the current thread, which is why a transaction is a thread-local
> fact and why async work does not inherit one. `JpaTransactionManager` is not a JDBC
> manager with a different name — it begins the JPA transaction, so it participates in the
> persistence-context flush, and it can be combined with a `DataSource` via `setDataSource`
> so JPA and JDBC share one connection and one commit. Two managers over one database is
> the dangerous shape: it produces a partial commit with no exception, and it is exactly
> what Spring Boot's single-manager auto-configuration exists to prevent.

#### Further Reading

- [Spring Framework Reference — Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html) — the authoritative chapter, including the strategy table for each `PlatformTransactionManager`.
- [Spring Framework Reference — Declarative Transactions](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html) — the `@Transactional` attribute reference and the full rollback-rule table.
- [Spring Framework Reference — DataSource Utilities](https://docs.spring.io/spring-framework/reference/data-access/jdbc.html) — `DataSourceUtils`, the `ThreadLocal` binding, and why `JdbcTemplate` closes nothing.
- [Spring Framework Reference — ORM Support](https://docs.spring.io/spring-framework/reference/data-access/orm.html) — `JpaTransactionManager`, dialect integration, and shared-EntityManager behaviour.
- [HikariCP](https://github.com/brettwooldridge/HikariCP) — the pool's own README documents the `connectionTimeout` message verbatim; read it before tuning pool size against a `REQUIRES_NEW` bug.

## Chapter 2 — `@Transactional` Deep-Dive

### 2.1 What the Annotation Actually Is

```java
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Inherited
@Documented
public @interface Transactional {

    @AliasFor("transactionManager")
    String value() default "";

    String transactionManager() default "";

    Propagation propagation() default Propagation.REQUIRED;

    Isolation isolation() default Isolation.DEFAULT;

    int timeout() default TransactionDefinition.TIMEOUT_DEFAULT;   // -1

    String label() default "";

    boolean readOnly() default false;

    Class<? extends Throwable>[] rollbackFor() default {};

    String[] rollbackForClassName() default {};
}
```

Every attribute is *metadata*. Nothing in `@Transactional` starts a transaction. The
sequence is:

```text
1. A BeanPostProcessor wraps the bean in a proxy (only if a TransactionAttributeSource
   finds @Transactional on the class or its methods — see Volume 3).
        │
2. At call time, the proxy's TransactionInterceptor builds/looks up a
   TransactionAttribute from the AnnotationTransactionAttributeSource, resolving
   attributes with the SAME precedence rules as Spring's other annotations:
        method annotation  >  class annotation  >  interface method  >  interface
        (and @EnableTransactionManagement(order=) orders multiple advisors)
        │
3. TransactionInterceptor.invokeWithinTransaction(...):
        ├─ tm = getTransactionManager(annotation)          ← name → bean lookup
        ├─ txInfo = createTransactionIfNecessary(tm, attr, ...)  ← PROPAGATION LIVES HERE
        ├─ try { retVal = invocation.proceed(); }
        ├─ catch (Throwable t) { completeTransactionAfterThrowing(txInfo, t); }  ← ROLLBACK RULE
        └─ else { commitTransactionAfterReturning(txInfo); }
```

Steps 2 and 3 are where every failure in this chapter lives. Step 1 is where the failures in
Volume 3 live.

> **MUST REMEMBER**
>
> `@Transactional` is read once, at context refresh, by
> `BeanFactoryTransactionAttributeSourceAdvisor`, and it is a **proxy advisor**. A method
> that is not reachable through a proxy has no transaction — not "a weak transaction", no
> transaction. The annotation is a label on a door; the proxy is the doorframe, and a call
> that bypasses the doorframe never sees it.

### 2.2 Attribute by Attribute

| Attribute | Default | What it does | Where it stops working |
| --- | --- | --- | --- |
| `value` / `transactionManager` | `""` | Selects the `PlatformTransactionManager` bean by name | Two managers + no name = `NoUniqueBeanDefinitionException` at first call |
| `propagation` | `REQUIRED` | Decides join / create / suspend | `REQUIRES_NEW` costs a second connection; `NESTED` needs a savepoint-capable driver |
| `isolation` | `DEFAULT` | Sets the isolation on the underlying connection | Not portable under JPA; deferred to the driver; can invalidate cached plans |
| `timeout` | `-1` (default) | **Seconds.** Maps to a query timeout | `-1` means "use the default", not "infinite" — a real `TIMEOUT_DEFAULT` is unbounded by Spring |
| `readOnly` | `false` | Driver hint + Hibernate `FlushMode.MANUAL` | Not enforced on MySQL/H2; silently drops dirty state under Hibernate |
| `rollbackFor` | `{}` | Additional exception types that force a rollback | Only matches the type and its subclasses; the class list is per-annotation |
| `rollbackForClassName` | `{}` | The same, by string name, for XML/legacy interop | Cannot be validated at compile time; a typo is a silent no-op |
| `label` | `""` | A name in the transaction manager's status — the value in logs and in `TransactionSynchronizationManager.getCurrentTransactionName()` | Purely diagnostic; it changes nothing about behaviour |

A note on `label` that people find useful and almost nobody knows: it is what
`TransactionSynchronizationManager.getCurrentTransactionName()` returns, and therefore what
shows up in the transaction name in your database's `pg_stat_activity` or `information_schema`
output when you set the driver's query-comment behaviour. Setting a meaningful `label` on
long-running transactional methods is one of the cheapest observability wins in the whole
framework, because it turns "connection idle in transaction" from a mystery into a search
term.

```java
@Transactional(label = "settlement.run")            // ◄── shows up in pg_stat_activity
public SettlementSummary runDailySettlement(Date day) { ... }
```

### 2.3 The Rollback Rule — The Most Important Thing in This Chapter

```text
Exception type thrown out of the @Transactional method
        │
        ├── RuntimeException (includes NPE, IllegalArgumentException, DataIntegrityViolation)
        │        └── ROLLBACK
        │
        ├── Error (OutOfMemoryError, StackOverflowError, AssertionError)
        │        └── ROLLBACK
        │
        └── checked Exception (IOException, SQLException, MyBusinessException extends Exception)
                 └── COMMIT   ◄── the default, and the surprise
```

```java
@Transactional
public void transfer(Account from, Account to, BigDecimal amount) throws SQLException {
    debit(from, amount);            // INSERT into ledger
    credit(to, amount);             // UPDATE accounts SET balance = ...
    audit.write("transfer done");   // INSERT into audit
    // ← if audit.write throws a checked exception, credit() is already applied
    //   and the transaction COMMITS. The money moved but the audit row does not exist.
}
```

This is not a Spring bug. It is a direct inheritance from EJB 2.0 CMMT (Container-Managed
Transaction demarcation), where the rule was "the container must not roll back on a *checked*
exception because a checked exception means the application has declared it can handle the
failure." Spring kept the rule for compatibility. The consequence is that **the single most
common production surprise in the whole framework is a method that declares
`throws SomethingChecked` and silently commits partial work.**

> **PRODUCTION SCENARIO**
>
> Problem: a nightly job reported "1,400 of 9,000 settlements failed" and the on-call
> noticed that 61 of the "failures" had a `ledger_entry` row *and* a `settled` flag of `true`.
> Investigation: the error log showed `MyBatchException: record 8,412 was already settled`
> for every one of them. The job method declared `throws MyBatchException`.
> Root cause: `MyBatchException extends Exception`. Unchecked exceptions roll back; checked
> ones commit. The method threw on record 8,412, the exception propagated out, the interceptor
> committed everything up to that point, and the job then reported it as a failure.
> Solution: `@Transactional(rollbackFor = Exception.class)` on the batch method, plus making
> the exception extend `RuntimeException`.
> Prevention: a checkstyle rule banning `throws` on `@Transactional` methods unless
> `rollbackFor` is present. This is a twenty-line change that eliminates a whole class of
> silent partial commits.

> **MUST REMEMBER**
>
> The rollback rule is **"rollback on `RuntimeException` and `Error`, commit on everything
> else."** The most defensive single annotation in any codebase is
> `@Transactional(rollbackFor = Exception.class)` on a method that does batch or multi-step
> work, and most teams that are bitten by this add it to a rule rather than to individual
> methods. The counter-argument is real — it changes the semantics of any nested
> `PROPAGATION_REQUIRES_NEW` boundary — so the honest recommendation is: use it at the
> service layer where a partial commit is unrecoverable, and think twice before using it on a
> deliberately non-transactional read path.

### 2.4 The Proxy Requirement, Enumerated

This is Volume 3's material applied to transactions, and the enumeration matters because
each case fails differently:

```java
@Service
public class OrderService {

    // NO: 1. private — CGLIB cannot override it
    @Transactional
    private void recalculateTotals(Order order) { ... }

    // NO: 2. final — CGLIB cannot override it; a JDK proxy can't reach it either
    @Transactional
    public final void settle(Order order) { ... }

    // NO: 3. static — not an instance method, so not overridable at all
    @Transactional
    public static void archive(Order order) { ... }

    // OK: 4. self-invocation — the call never leaves the object, so it never
    //     reaches the proxy. The annotation on `place()` is honoured;
    //     the annotation on `validate()` is not.
    @Transactional
    public void place(OrderRequest req) {
        validate(req);          // ◄── this call goes to `this.validate(req)`
        repo.save(toOrder(req));
    }

    @Transactional
    public void validate(OrderRequest req) { ... }   // never proxied on this path
}
```

And the three cases that are not about method modifiers:

```text
NO: 5. new OrderService()           — no container, no proxy, no transaction. The annotation
                                     is metadata on a class nobody is intercepting.
NO: 6. A class with no @Component /
    not scanned / instantiated in a
    @Configuration method         — same as above, phrased differently.
NO: 7. A different PlatformTransactionManager is in play — the proxy fires, the advice runs,
    and it resolves a manager that does not manage the data source this code actually uses.
                                    The transaction starts; it just isn't the transaction you think.
```

Fixes for self-invocation, in the order a staff engineer would rank them:

| Fix | Cost | Notes |
| --- | --- | --- |
| Move the inner method to a **different bean** | Low | The right answer. It is also usually the right *design* — the two methods are two units of work |
| Inject self via `@Lazy` | Low | `self.validate(req)` through a proxy. Works, but the cyclic self-reference is a smell |
| `TransactionTemplate` inside the class | Medium | Explicit, no proxy, but loses `@Transactional` for the inner call — you write the boundary by hand |
| `AopContext.currentProxy()` | Low, and deprecated | Requires `exposeProxy = true` on `@EnableTransactionManagement`. A code smell that works |
| `@Async` on the outer method to force a thread hop | — | Never. This is not a fix |

> **INTERVIEW TRAP — "SELF-INVOCATION IS A BLAME-THE-CALLER PROBLEM"**
>
> The reflexive answer is "don't call methods on `this`" — which is advice, not an
> explanation. The mechanism is that a proxy can only intercept calls that *arrive through
> the proxy reference*. `this.validate(req)` is a virtual call on the raw target instance, so
> the target's own method body runs directly. The senior answer names the constraint the
> constraint implies: **any unit of work that must run in its own transaction must be
> reachable as a separate bean**, because "separate bean" is the only condition under which
> Spring can guarantee a proxy exists. That is a design rule, and it explains why the
> "correct" refactor is a design change rather than an annotation change.

### 2.5 Class-Level, Method-Level, and the Precedence Rules

```java
@Service
@Transactional                                    // applies to EVERY public method
public class AccountService {

    @Transactional(readOnly = true)                // method wins for this one
    public BigDecimal balance(long id) { ... }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    public void freezeForAudit(long id) { ... }

    public void rename(long id, String name) { ... }   // inherits readOnly=false, REQUIRED
}
```

The precedence order for attribute resolution, from highest to lowest:

```text
1. method on the concrete class
2. method on an interface the class implements
3. class-level @Transactional on the concrete class
4. class-level @Transactional on an interface
```

The rule people get wrong is 2 vs 3: a `@Transactional` on a **method-level interface
declaration** beats a class-level annotation on the implementation. That is deliberate — it
lets you write the transactional contract in the interface — and it also means adding
`@Transactional(readOnly = true)` to a repository interface method changes the behaviour of
every implementation, including ones you did not write.

The rule that is genuinely surprising: **there is no merging**. A method-level
`@Transactional(readOnly = true)` does not inherit `propagation = REQUIRES_NEW` from the
class — the method-level annotation is the whole attribute set. This is the most common
"why did my propagation change" bug in layered services.

```java
@Transactional(propagation = Propagation.REQUIRES_NEW, timeout = 30, label = "svc")
public class AccountService {

    @Transactional(readOnly = true)      // ◄── propagation is back to REQUIRED.
    public BigDecimal balance(long id) { ... }   //     timeout is unbounded again.
}
```

> **PRODUCTION RELEVANCE**
>
> Multiple `@EnableTransactionManagement` advisors, each with its own `order`, each reading
> a different `TransactionAttributeSource` (a different annotation, say `@Retryable` vs
> `@Transactional`, or a custom one), are supported and are how some teams layer a
> distributed-transaction annotation on top of the local one. The cost is that the ordering
> is now load-bearing and lives in a configuration class, and the effective transaction
> boundaries stop being readable from the service code. Reach for it only when a genuinely
> different boundary is required, and write down which advisor is outermost.

### 2.6 Proving a Transaction Is Actually Running

This is the skill the whole volume is for. Three levels of rigour, cheapest first.

**Level 1 — a one-line assertion inside the method:**

```java
if (!TransactionSynchronizationManager.isActualTransactionActive()) {
    throw new IllegalStateException("no transaction is active in " + methodName);
}
```

```java
// ── What each accessor actually answers ─────────────────────────────────
TransactionSynchronizationManager.isActualTransactionActive();  // is there a real
                                                                 // DB transaction?
TransactionSynchronizationManager.isCurrentTransactionReadOnly();// is it the read-only one?

TransactionSynchronizationManager.getCurrentTransactionName();  // the @Transactional(label)
                                                                 // of the current one

Thread.currentThread().getName();                              // the other half of the
                                                                 // truth: a transaction is
                                                                 // thread-bound
```

**Level 2 — log the connection identity.** This catches the "two connections, one method"
class of bug that the boolean cannot see:

```java
@Transactional
public void audit(String path) {
    var md = DataSourceUtils.getConnection(dataSource).getMetaData();
    log.info("tx={} connection={} url={}",
             TransactionSynchronizationManager.getCurrentTransactionName(),
             System.identityHashCode(DataSourceUtils.getConnection(dataSource)),
             md.getURL());
}
```

Two calls to the same `DataSource` inside one transaction produce the *same* identity hash.
Two calls with two transaction managers produce two different hashes — which is precisely
the Chapter 1 partial-commit bug, caught in a log line.

**Level 3 — watch the driver.** For JDBC:

```java
// Oracle
PreparedStatement ps = conn.prepareStatement("SELECT 1 FROM dual");
ps.unwrap(OracleConnection.class)
  .getQueryTimeout();   // and check the session's v$session info

// Postgres — the best in-database transaction inspector there is
SELECT pid, state, xact_start, query, state_change
  FROM pg_stat_activity
 WHERE state = 'idle in transaction';
```

> **INTERVIEW TRAP — "I CAN TELL BECAUSE THE ANNOTATION IS THERE"**
>
> This is the answer that scores zero, and it is the single most common one. The annotation
> is *always* there — it is on the class, it is in the compiled bytecode, and reading the
> source tells you nothing about whether a proxy was created or whether the call reached it.
> The senior answer names the runtime check
> (`TransactionSynchronizationManager.isActualTransactionActive()`), the reason the check is
> necessary (metadata on a class that is not behind a proxy is inert), and the caveat that
> even that check can lie in one case: `isActualTransactionActive()` is true for a
> `SUPPORTS`-propagated method that joined a transaction, which is not the same as "this
> method started one" — for that you need `TransactionStatus.isNewTransaction()` from the
> programmatic API.

#### Common Mistakes

- Assuming `@Transactional` on a class means one big transaction for the class. It means
  *every public method* gets its own boundary, which for a five-method service is five
  possible transactions, not one.
- Believing method-level annotations merge with class-level ones. They do not — the
  method-level annotation is the complete attribute set.
- Writing `throws Exception` on a `@Transactional` method and being surprised when the
  transaction commits.
- Setting `timeout = 5000` meaning milliseconds. It is seconds, and 5000 seconds is longer
  than your database's `idle_in_transaction_session_timeout` will allow.
- Debugging transaction problems by reading the annotation instead of reading
  `isActualTransactionActive()` and the connection identity.
- Assuming `readOnly = true` prevents writes. On PostgreSQL it throws; on MySQL it is a
  hint; on Hibernate it silently discards the change.

#### Interview Questions — `@Transactional`

**Q1. Walk me through exactly what happens between a call to a `@Transactional` method and
its commit.** `TRICKY`

The proxy created at context refresh (by `BeanFactoryTransactionAttributeSourceAdvisor`)
intercepts the call. `TransactionInterceptor.invokeWithinTransaction` resolves the
`TransactionManager` bean by the annotation's `value`, builds a `TransactionAttribute` from
the `AnnotationTransactionAttributeSource` using the standard precedence rules, then calls
`createTransactionIfNecessary`, which delegates to `PlatformTransactionManager.getTransaction`
— that is where the propagation decision actually happens, and where a connection is
borrowed and `setAutoCommit(false)`. The target method runs; on a normal return the
interceptor calls `commit`, on a `RuntimeException` or `Error` it calls `rollback`, and on a
*checked* exception it calls `commit` unless `rollbackFor` says otherwise. Either way
`TransactionSynchronizationManager` unbind the thread resources in a `finally`.

**Q2. When exactly does `@Transactional` do nothing?** `TRICKY`

Five cases. The method is `private`, `final`, or `static`, so no proxy can intercept it. The
method is self-invoked, so the call never passes through the proxy reference. The object was
constructed with `new`, so it was never wrapped. The class isn't a Spring-managed bean, or
wasn't created by the container (a `@Configuration` method that called `new` instead of
returning the bean, a field-initialised collaborator, a manually registered instance). Or a
different `PlatformTransactionManager` is in play, so a transaction does start — just not
over the resource this code is using. None of these produce an error, which is what makes
them dangerous.

**Q3. Why doesn't a method-level `@Transactional(readOnly = true)` inherit
`propagation = REQUIRES_NEW` from the class-level annotation?** `ADVANCED`

Because there is no attribute merging. `AnnotationTransactionAttributeSource` resolves a
single `TransactionAttribute` per method by looking at the method-level annotation first
and, if it finds one, using it as the complete attribute set. The class-level annotation is
only consulted when the method carries none. This is deliberate — it makes a method's
transactional behaviour readable in one place — but it means that adding a "small" method
annotation to a class that carries a carefully-chosen class-level boundary silently resets
every other attribute to its default.

**Q4. How would you prove, in production, that a transaction is active on a given call?**
`SCENARIO`

Log `TransactionSynchronizationManager.isActualTransactionActive()` together with
`getCurrentTransactionName()` and the thread name, and — this is the part that finds the
bugs a boolean cannot — the identity hash of the connection from
`DataSourceUtils.getConnection(dataSource)`. Two calls in one transaction give the same
connection identity; two transaction managers give two identities, which is the
partial-commit signature. On the database side, `pg_stat_activity WHERE state = 'idle in
transaction'` with the query comment set from `label` is the version that survives a
restart.

**Q5. A method declares `throws SQLException`. What happens if a `SQLException` is thrown
from inside, and what would you change?** `TRICKY`

The transaction **commits**. `SQLException` is checked, and Spring's default rollback rule
is "rollback on `RuntimeException` and `Error` only", inherited from EJB CMMT. Anything the
method wrote before the throw is committed. The fix is `@Transactional(rollbackFor =
Exception.class)`, or making the exception extend `RuntimeException` — the latter is
usually better because it lets `DataAccessException` translation work. I would also argue
that a service method declaring `throws SQLException` is a design smell: the transaction
boundary should not leak the persistence technology.

**Q6. Is there any case where `@Transactional` on the method is correct but the transaction
still doesn't cover the write you care about?** `ADVANCED`

Yes, several. `readOnly = true` under Hibernate sets `FlushMode.MANUAL`, so a mutation of a
managed entity is silently discarded rather than written. A native query executed through
`EntityManager.createNativeQuery` participates, but a `JdbcTemplate` update against a
*different* `DataSource` does not. A `@Modifying` Spring Data JPA query that returns `int`
participates, but one that returns `void` or a stream clears the persistence context
instead of flushing, and a flush-mode-dependent flush can be ordered differently. And any
write performed on a different thread — an `@Async` listener, a `CompletableFuture`, a
parallel stream — is outside the transaction entirely.

**Q7. A reviewer says "add `@Transactional` here." What questions should you ask?**
`STAFF`

Is the method reachable through a proxy — is it public, non-final, on a Spring-managed bean,
and not self-invoked? Is the class already `@Transactional`, in which case the method-level
annotation *replaces* rather than augments it and every attribute resets? Does the method
throw anything checked, because that changes the rollback rule? Does it make a remote call
or publish an event, because a long transaction held across network I/O is a locking
incident? And what is the rollback behaviour if this method is called from inside another
`@Transactional` method — `REQUIRED` means it silently joins and inherits the caller's fate,
which is sometimes right and sometimes not.

> **CHAPTER 2 SUMMARY**
>
> `@Transactional` is metadata read at refresh and applied by `TransactionInterceptor` in a
> proxy — the annotation is inert without the proxy, and that is why the Volume 3 failure
> modes (private, final, static, self-invocation, `new`) are transaction failure modes too.
> The rollback rule — unchecked and `Error` roll back, checked exceptions commit — is the
> single most common source of silent partial commits in the framework, and the defence is
> `rollbackFor = Exception.class` applied as a rule rather than a memory. Attributes do not
> merge: a method-level annotation replaces the class-level one wholesale. And the skill
> that separates a senior from a junior is being able to prove a transaction was running —
> `isActualTransactionActive()`, the transaction `label`, and above all the connection
> identity, because only the last one catches the two-manager case where a transaction *is*
> active and *is* still wrong.

#### Further Reading

- [Spring Framework Reference — Declarative Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html) — the attribute reference, the annotation-vs-XML table, and the model for building a custom annotation.
- [`TransactionAttribute` Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/interceptor/TransactionAttribute.html) — the resolved form of an annotation, including the propagation-behaviour constants and the `SYNCHRONIZATION_ALWAYS` variants.
- [`TransactionDefinition` Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/TransactionDefinition.html) — the constants, including the seconds-based timeout and the `ISOLATION_*` values.
- [Spring Framework Reference — Proxying Mechanisms](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — the proxy mechanics that Chapter 2 leans on for every "why doesn't my annotation do anything" answer.

## Chapter 3 — Propagation in Depth

### 3.1 The Full Table

Propagation is the answer to a question the framework cannot infer: **the method being called
now has a unit of work that either belongs to the caller's unit of work, or is a separate
one.** Spring implements it in `AbstractPlatformTransactionManager.getTransaction` by
inspecting `TransactionSynchronizationManager` for an existing transaction, and its
behaviour is worth reading once rather than memorising.

| Propagation | No existing transaction | Existing transaction | Second connection? | Rollback semantics |
| --- | --- | --- | --- | --- |
| `REQUIRED` (default) | Create a new one | **Join** the existing one | No | Inner rollback marks the whole thing rollback-only; a throw propagates and rolls it back |
| `SUPPORTS` | Run non-transactionally | Join the existing one | No | None of its own — it has no boundary to roll back |
| `MANDATORY` | **Throw** `IllegalTransactionStateException` | Join the existing one | No | Same as `REQUIRED` |
| `REQUIRES_NEW` | Create a new one | **Suspend** the outer, start a new one, resume the outer afterwards | **Yes** | Fully independent — commits or rolls back on its own, regardless of the outer |
| `NOT_SUPPORTED` | Run non-transactionally | **Suspend** the outer for the duration | No | None; any data access inside runs on its own |
| `NEVER` | Run non-transactionally | **Throw** `IllegalTransactionStateException` | No | None |
| `NESTED` | Behaves like `REQUIRED` | Create a **savepoint**; on failure roll back to the savepoint | No (same connection) | Inner failure rolls back only to the savepoint; a checked exception still rolls back the whole thing unless `rollbackFor` |

```java
public enum Propagation {
    REQUIRED(0),
    SUPPORTS(1),
    MANDATORY(2),
    REQUIRES_NEW(3),
    NOT_SUPPORTED(4),
    NEVER(5),
    NESTED(6);
}
```

`MANDATORY` and `NEVER` are the two nobody uses, and they are the two an interviewer
reaches for because they test whether you understand propagation as *assertion* rather than
as *strategy*. `MANDATORY` asserts "this method only makes sense inside someone else's
transaction." `NEVER` asserts "this method must not be called from inside a transaction" —
which is how you guard a method that must not hold locks, must not participate in an
ambient rollback, or must not be visible to an in-flight read.

```java
// MANDATORY — a self-check on the call graph, enforced by the framework
@Transactional(propagation = Propagation.MANDATORY)
public void recordAuditEntry(AuditEntry entry) { ... }
// If some future caller invokes this from a non-transactional path, it fails loudly
// at that call site, in the test, rather than writing an audit row that rolls back
// two transactions later.

// NEVER — a guard against an ambient transaction the caller may not know about
@Transactional(propagation = Propagation.NEVER)
public long computeApproximateAccountTotal(List<Long> accountIds) {
    // Expensive, read-only, and must NOT be folded into the caller's transaction:
    // doing so would hold the caller's write locks for the full scan.
    ...
}
```

> **INTERVIEW TRAP — "PROPAGATION REQUIRES_NEW GIVES YOU A CLEAN SLATE"**
>
> Half right, and the half that is wrong is the expensive one. `REQUIRES_NEW` gives you a
> *logically independent* transaction — a separate commit and a separate rollback. It does
> NOT give you a clean slate: the outer transaction is **suspended, not rolled back**, and it
> still holds its connection, its row locks, and its snapshot. A `REQUIRES_NEW` inside a
> transaction that has already written 40 rows still holds 40 row locks for the whole inner
> call, and the inner call now needs a second connection from the same pool. The senior
> version of the answer is about the two connections and the suspended locks, not about
> isolation.

### 3.2 The Suspension Mechanism

```text
Thread: T1                      Pool: 10 connections
 │
 ├─ OUTER @Transactional                 ── holds CONN-1, has locked rows 1..40
 │    │
 │    ├─► INNER @Transactional(REQUIRES_NEW)
 │    │       1. suspend(txResources)   ── UNBIND CONN-1 from the thread
 │    │                                    (the connection is NOT returned to the pool)
 │    │       2. startNewTransaction()   ── borrow CONN-2
 │    │       3. doBegin()               ── setAutoCommit(false) on CONN-2
 │    │       4. run the inner method
 │    │       5. commit CONN-2
 │    │       6. resume(txResources)     ── REBIND CONN-1
 │    │
 │    └─    continue on CONN-1
 │
 └─ commit CONN-1
```

The single most important line is step 1. `CONN-1` is **unbound from the thread, not
released to the pool**. It stays checked out, still holding `rows 1..40` locks, for the entire
duration of the inner transaction. A pool of size N therefore supports at most `N/2`
concurrent `REQUIRES_NEW` nests, and if the inner transaction then calls a *third* nested
`REQUIRES_NEW`, three connections are held simultaneously.

> **SCALING REALITY CHECK**
>
> A HikariCP pool of `maximumPoolSize = 10`, 10 concurrent request threads each doing one
> `REQUIRES_NEW`, means every thread is holding two connections. The 11th thread waits the
> full `connectionTimeout` and the log shows
> `HikariPool-1 - Connection is not available, request timed out after 30000ms`. The
> database is healthy, its CPU is at 8%, and the on-call paged the DBA. The rule of thumb:
> **the effective connection demand is `pool size × max nesting depth`**, so if you must
> nest, either size the pool as `peak concurrency × max depth` with headroom, or — much
> better — restructure so you don't nest.

`PROPAGATION_REQUIRES_NEW` also has a documented cost beyond connections: it forces
`hibernate.connection.handling_mode` to be something other than `DELAYED_ACQUISITION_AND_HOLD`
in some setups, because the session is suspended and rebound rather than left alone, and
that costs a JDBC round trip per suspend/resume. Under `JpaTransactionManager` the second
connection also means a **second persistence context** — so entities loaded in the inner
transaction are a *different object graph* from the ones in the outer one, detached from
the first-level cache, and a change made to an inner entity is invisible to the outer
transaction's `flush`.

```java
@Transactional
public void process(Order order) {
    order.setStatus(PROCESSING);
    repo.save(order);                 // outer context; order is MANAGED here

    auditService.recordNewTransaction(order.getId());   // REQUIRES_NEW, CONN-2
    // Inside auditService, `repo.findById(order.getId())` loads a DIFFERENT Order
    // instance from a different persistence context. Mutating it does NOT affect
    // the instance out here, and vice versa. This is the single most confusing
    // symptom of REQUIRES_NEW under JPA.
}
```

### 3.3 `NESTED` — The One That Lies

```java
@Transactional(propagation = Propagation.NESTED)
public void reserveInventory(Item item, int qty) { ... }
```

`NESTED` means: **use the same connection, but establish a savepoint**, and on failure roll
back to the savepoint rather than aborting the whole transaction. It is the only propagation
that gives you "roll back just this part and keep going."

Three conditions, all of which must hold:

1. The transaction manager must support savepoints on the *current* transaction object. This
   is true for `DataSourceTransactionManager` and `JdbcTransactionManager` (a JDBC
   `Savepoint` is free and always available on a `setAutoCommit(false)` connection).
2. The JDBC driver and the database must implement savepoints. PostgreSQL, MySQL/InnoDB,
   H2, Oracle and SQL Server all do. Some embedded engines and some proxies (PgBouncer in
   transaction-pooling mode, older MySQL MyISAM) do not.
3. **You must be inside an existing transaction.** With no outer transaction, `NESTED`
   silently behaves like `REQUIRED` and creates a brand-new one — which means there is no
   savepoint and no "partial rollback" behaviour at all.

The Hibernate problem is the important one. With a `JpaTransactionManager`,
`HibernateJpaDialect` has to obtain a `Savepoint` from the underlying JDBC connection.
Whether that works depends on the dialect and the connection handling mode, and where it
cannot work, Spring's behaviour is to **fall back** — and the fallback is a *fresh
transaction*, not an error. A nested method that appears to roll back only its own writes
may in fact be committing them independently of the outer transaction, or rolling them back
independently of it, with no log line either way.

> **MUST REMEMBER**
>
> `NESTED` is the correct tool for exactly one shape of problem: **"if this part fails, undo
> only this part, and let the caller decide what to do."** It is not a synonym for
> "independent transaction" — that is `REQUIRES_NEW` — and it is not a general error-handling
> mechanism. Its failure mode is silent promotion, so if you use it under JPA, verify the
> savepoint actually happened (log `TransactionStatus.hasSavepoint()`) before you trust the
> rollback semantics you designed around it.

```java
// The shape NESTED exists for: try, undo, and either retry or give up locally.
@Transactional
public ImportResult importRows(List<Row> rows) {
    ImportResult result = new ImportResult();
    for (Row row : rows) {
        try {
            rowImporter.importOne(row);              // NESTED — savepoint per row
            result.succeeded(row.id());
        } catch (DataIntegrityViolationException ex) {
            result.failed(row.id(), ex.getMostSpecificCause().getMessage());
            // rowImporter's writes are gone; the import continues; the OUTER
            // transaction still commits every row that succeeded.
        }
    }
    return result;
}
```

Compare with `REQUIRES_NEW` for the same loop: each row would be its own committed
transaction, and the outer transaction would hold nothing but the summary. Which is right
depends entirely on whether the batch is allowed to be partially applied — a product
question, not a technical one.

> **TRADE-OFF**
>
> `NESTED` vs `REQUIRES_NEW` for "undo just this part". `NESTED` uses one connection, keeps
> the outer transaction's locks and its atomicity, and rolls back only to the savepoint — but
> the savepoint is not free (the DB issues statements, and some engines flush before
> establishing one) and it is not universally supported. `REQUIRES_NEW` is universally
> supported and gives a truly independent outcome, but costs a second connection, breaks
> first-level-cache coherence, and means the inner commit survives an outer rollback. The
> flip condition: if the inner operation must be visible to the outside world even when the
> caller fails, you need `REQUIRES_NEW`; if it must vanish with the caller, you need
> `NESTED`.

### 3.4 `NOT_SUPPORTED` and the Ambient-Transaction Problem

`NOT_SUPPORTED` suspends any ambient transaction. Its legitimate use is a long, read-only
computation that must not inherit — or hold — the caller's locks:

```java
@Transactional(propagation = Propagation.NOT_SUPPORTED, readOnly = true)
public RecommendationSet computeRecommendations(String userId) {
    // 30 seconds of batch scoring. If this ran inside the caller's transaction,
    // it would hold the caller's write locks for 30 seconds and pin its MVCC
    // snapshot, bloating bloat and stalling vacuum.
    ...
}
```

The real hazard is the reverse — code that **should** be in a transaction and quietly is
not, because it is reached from a path where nothing started one:

```java
@Service
public class OrderService {
    // NOT annotated, and reached from a @Scheduled method and from an
    // ApplicationListener that fires before any transaction exists.
    public void markExpired() {
        for (Order o : repo.findByStatusAndExpiresAtBefore(PENDING, now())) {
            o.expire();                                  // dirty in the persistence context
        }                                                 // ← committed? who knows
    }
}
```

`markExpired()` has no boundary. Whether its changes are written depends on whether an
outer context happened to be active and whether the persistence context was extended (an
`OpenEntityManagerInViewInterceptor` in a web request extends it, which is why this bug
*does* reproduce on a request path and *does not* reproduce in a `@Scheduled` method — the
test is `@Transactional` by default, so it hides both).

> **STAFF-LEVEL CONSIDERATION**
>
> The reliable defence against ambient-transaction bugs is a **single, explicit rule about
> where transaction boundaries live**: one boundary per use case, at the service layer, and
> none anywhere else. Not "annotate the service layer and maybe a few repositories" — a
> real rule with a real enforcement mechanism, because the two teams that will break it are
> the one writing the new endpoint and the one migrating the old job. Enforcement that
> works: an ArchUnit rule asserting that `@Transactional` appears only on
> `..service..` classes, and a startup assertion in the test slice that every
> `@Scheduled` and `@EventListener` entry point calls a boundary-declared method. A
> documented convention with no enforcement is a convention that decays.

#### Common Mistakes

- Believing `REQUIRES_NEW` releases the outer transaction's connection. It suspends it; the
  connection stays checked out and its locks stay held.
- Using `REQUIRES_NEW` as a general error-recovery tool. It is a *semantic* decision about
  whether the inner work should survive the outer failure, and it is usually made by
  accident.
- Assuming `NESTED` is available everywhere. Under `JpaTransactionManager` + Hibernate it is
  frequently promoted to fresh-transaction semantics, silently.
- Expecting `NESTED` with no outer transaction to establish a savepoint. It creates a plain
  transaction, because there is nothing to nest inside.
- Writing a `@Transactional` method that a `@Scheduled` task and an `ApplicationListener`
  both call, and being surprised that the scheduled path has no transaction.
- Setting `maximumPoolSize` without checking the maximum nesting depth of the code that
  uses that pool.

#### Interview Questions — Propagation

**Q1. Explain what `AbstractPlatformTransactionManager` actually does differently for
`REQUIRED` and `REQUIRES_NEW`.** `TRICKY`

`REQUIRED` finds a transaction (or a synchronization) already bound to the thread via
`TransactionSynchronizationManager`, and if one exists it participates in it — the same
resource, no new connection, `TransactionStatus.isNewTransaction()` is `false`. `REQUIRES_NEW`
always begins a new one: it calls `suspend(existingTransaction)` to unbind the current
resource holders from the thread (the underlying connection is not returned to the pool),
calls `doBegin` on the transaction manager to acquire a second resource, runs the work, then
calls `resume(suspendedResources)` to rebind the original holders. The suspended transaction
object is retained on the stack for the duration, holding its connection and its locks.

**Q2. A service has 10 concurrent requests and a pool of 10 connections. Users start seeing
`Connection is not available, request timed out after 30000ms`, and the database is at 8% CPU.
What do you check first?** `SCENARIO`

Connection demand versus pool size. The classic cause is `PROPAGATION_REQUIRES_NEW` (or
deep self-invocation) somewhere on the path: every request now holds two connections, so ten
requests need twenty and the eleventh blocks. I would also check for a leaked connection
(many DAOs outside Spring, which never return it) and for a long transaction holding a
connection across a remote HTTP call. The fix is to remove the nesting or size the pool as
`peak concurrency × max nesting depth` — and to fix the code, because the second is a
band-aid that makes the next incident worse.

**Q3. What is the difference between `NESTED` and `REQUIRES_NEW` in one sentence?** `TRICKY`

`NESTED` reuses the same connection and establishes a savepoint so a failure rolls back only
that portion of the transaction, while `REQUIRES_NEW` suspends the current transaction,
takes a second connection, and gives the inner work a completely independent commit that
survives — or fails independently of — the outer outcome.

**Q4. When is `NESTED` the wrong tool?** `ADVANCED`

Whenever the inner work must be visible outside the outer transaction even if the caller
later rolls back — then the inner commit must be independent, and `NESTED` (which is
contained by the outer) is wrong. It is also wrong when the persistence layer cannot supply
a savepoint, because Spring's fallback is a fresh transaction that silently changes the
semantics. And it is wrong for anything on a hot path: establishing a savepoint costs
statements and, on some engines, a flush.

**Q5. A developer uses `REQUIRES_NEW` to make a log write survive a rollback. What is
wrong with that beyond the connection cost?** `ADVANCED`

Several things. The log write now needs a second connection from a pool that was sized for
one connection per request. It breaks first-level-cache coherence — the inner transaction
reads a different persistence context, so any entity it loads is a different instance. It
destroys atomicity in a way nobody thinks about: the log entry now claims something happened
that the database says did not. And if the inner transaction is the one that fails, the
outer transaction — which may have done perfectly valid work — still rolls back because the
exception propagates. For an audit trail, a transactionally-outbox row in the *same*
transaction is almost always the better answer (Chapter 7).

**Q6. What do `MANDATORY` and `NEVER` buy you?** `TRICKY`

They are assertions rather than strategies. `MANDATORY` fails fast with
`IllegalTransactionStateException` if the method is called outside a transaction, which
turns a latent design violation into an immediate, obvious failure at that call site.
`NEVER` fails fast if it is called *inside* one, which is how you protect a long read-only
computation from inheriting — and holding — a caller's write locks. Both are more
maintainable than a comment saying "this must be called from a transaction," because they
are enforced by the framework and they are enforced in the test.

**Q7. A `@Transactional` method on a class with `@Transactional(propagation = REQUIRES_NEW)`
at the class level. One method is annotated `@Transactional` with no attributes. What
propagation does it get?** `TRICKY`

`REQUIRED`. The method-level annotation replaces the class-level attribute set wholesale;
there is no merging. This catches teams every time they extract a service and add a method
annotation "just to be explicit" without realising they have reset the propagation. The
diagnostic is `TransactionStatus.isNewTransaction()` from the programmatic API, or logging
the `label` — a `REQUIRES_NEW` class with one `REQUIRED` method logs two different
connection identities for one inbound request.

**Q8. Explain the interaction between propagation and `rollbackFor` on the *outer* method.**
`SCENARIO`

If an inner method participates in the outer's transaction (any propagation other than
`REQUIRES_NEW`) and throws, the inner interceptor calls `completeTransactionAfterThrowing`
with the outer's `TransactionStatus`, which calls `setRollbackOnly()` on it — the outer
transaction is now doomed. If the inner method then *catches* the exception and returns
normally, the outer method sees no exception, proceeds, and at the end tries to commit a
transaction already marked rollback-only. Spring throws
`UnexpectedRollbackException("Transaction rolled back because it has been marked as
rollback-only")`. Teams find this baffling because nothing was thrown; the answer is that
the exception *was* thrown and swallowed, and the marker is how the framework remembers it
after the stack unwound.

> **CHAPTER 3 SUMMARY**
>
> Propagation is not a style preference — it is a statement about whether a unit of work
> belongs to its caller's. `REQUIRED` joins, `REQUIRES_NEW` suspends and takes a second
> connection while the first stays checked out and keeps its locks, `NESTED` reuses the
> connection with a savepoint, and `MANDATORY`/`NEVER` are assertions that fail fast.
> `REQUIRES_NEW` under JPA additionally breaks persistence-context coherence, and its
> connection cost is a genuine capacity-planning input — pool demand is
> `concurrency × nesting depth`. `NESTED` is the right tool for "undo just this part and
> continue," and it is the one most often mis-chosen because the fallback when savepoints
> are unavailable is a fresh transaction rather than an error.

#### Further Reading

- [Spring Framework Reference — Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html) — the propagation table and the "transaction suspension" section, including which resources support it.
- [Spring Framework Reference — DataSource Utilities](https://docs.spring.io/spring-framework/reference/data-access/jdbc.html) — how `DataSourceUtils` binds and unbinds a connection to the thread, which is the mechanism behind every suspension cost.
- [PostgreSQL — Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — what `SELECT ... FOR UPDATE`, `FOR SHARE` and `FOR UPDATE NOWAIT` actually lock, which is what makes a suspended transaction expensive.
- [Microservices Patterns — Saga](https://microservices.io/patterns/data/saga.html) — the cross-service version of the same "commit independently or undo" decision, at a scope where savepoints are not available to you.

## Chapter 4 — Isolation Levels & Concurrency

### 4.1 The Three Anomalies

Everything in this chapter is a consequence of three specific things going wrong:

```text
DIRTY READ
  T1: BEGIN; UPDATE account SET balance = 100 WHERE id = 1;   ── not committed
  T2:                     SELECT balance FROM account WHERE id = 1;  ── sees 100
  T1: ROLLBACK;
      → T2 made a business decision on a number that never existed.

NON-REPEATABLE READ
  T1: BEGIN; SELECT balance ...;   ── sees 100
  T2:        BEGIN; UPDATE ... SET balance = 200; COMMIT;
  T1: SELECT balance ...;   ── sees 200  (same transaction, different answer)
      → T1's "check then act" logic is broken. Compare-and-set does not work.

PHANTOM READ
  T1: BEGIN; SELECT COUNT(*) FROM orders WHERE status = 'PENDING';  ── 40
  T2:        BEGIN; INSERT INTO orders ... (status='PENDING'); COMMIT;
  T1: SELECT COUNT(*) FROM orders WHERE status = 'PENDING';  ── 41
      → the same aggregate query returns a different count inside one transaction.
```

The distinction between the last two matters and is frequently blurred: a **non-repeatable
read** is the same *row* changing, and a **phantom** is a different *set of rows* matching a
predicate. `SERIALIZABLE` prevents both; `REPEATABLE READ` prevents only the first, on most
databases.

### 4.2 The Four SQL Levels

| Level | Dirty | Non-repeatable | Phantom | Mechanism | Cost |
| --- | --- | --- | --- | --- | --- |
| `READ UNCOMMITTED` | **Possible** | Possible | Possible | No locks at all; readers may see uncommitted rows and even re-read a row to a *different* value mid-statement | Rarely correct. A reporting replica at best |
| `READ COMMITTED` | Prevented | **Possible** | Possible | Statement-level snapshot. The PostgreSQL and MySQL/InnoDB default | Each statement takes a fresh snapshot; read consistency is per-statement only |
| `REPEATABLE READ` | Prevented | Prevented | **Possible** (PostgreSQL) / Prevented (MySQL/InnoDB) | Transaction-level snapshot (MVCC) or gap locks (InnoDB) | Long-running transactions pin an old snapshot and inflate bloat |
| `SERIALIZABLE` | Prevented | Prevented | Prevented | Predicate locks / SSI conflict detection (Postgres) or next-key locks (InnoDB) | **Aborts.** Serialization failures become a normal, expected outcome you must retry |

> **INTERVIEW TRAP — "SERIALIZABLE PREVENTS EVERY CONCURRENCY PROBLEM"**
>
> It prevents the three *anomalies*, which is not the same as preventing lost updates and is
> certainly not the same as preventing your application from being wrong. Two important
> corrections a senior answer makes: (1) under `SERIALIZABLE` on PostgreSQL, concurrent
> transactions do not queue — they **abort** with
> `ERROR: could not serialize access due to concurrent update` (40001), so any code that
> runs at `SERIALIZABLE` without a retry loop is a latent outage; (2) the most common
> real-world corruption — the lost update — is *not* on this list at all, and no standard
> isolation level prevents it in the sense people assume. See 4.4.

```java
@Transactional(isolation = Isolation.SERIALIZABLE)
public void transfer(long from, long to, BigDecimal amount) {
    debit(from, amount);
    credit(to, amount);
}
```

This is what the annotation compiles to:

```text
PostgreSQL  →  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE   (on the connection, once)
MySQL       →  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE   (before the tx begins)
Oracle      →  SET TRANSACTION ISOLATION LEVEL SERIALIZABLE
JPA/Hibernate → NOT a portable JPA call. Applied to the JDBC connection underneath,
                which requires a dialect with connection handling that makes this
                possible. On a non-database-aware EntityManager it silently does nothing.
```

### 4.3 MVCC — What Postgres and InnoDB Actually Do

The mental model "isolation level = how many locks" is wrong for the two databases most
Spring applications run on. Both implement **Multi-Version Concurrency Control**: every row
update writes a new row version, and readers read the version that was current when their
snapshot was taken. Old versions are collected later by a cleanup process.

```text
                    ┌───────────── row id 42 ─────────────┐
T1 reads at 10:00  │ version A: balance=100 (created 09:00)│ ◄── T1 sees this
T2 writes at 10:01 │ version B: balance=90  (10:01, uncommitted)
T1 reads again     │ version A: balance=100                 │ ◄── SAME ANSWER
T2 commits at 10:02│ version B: balance=90  (10:01, now committed)
T1 reads again     │ version A: balance=100                 │ ◄── still the snapshot
                    └────────────────────────────────────────┘
```

Three consequences that change how you design transactions:

1. **Readers never block writers, and writers never block readers.** A long `SELECT` does
   not hold an `ACCESS SHARE` lock that blocks an `UPDATE`; it holds a buffer pin and a
   snapshot. This is why a reporting query in Postgres cannot take down the OLTP path the
   way the same query in MySQL's old locking model could.
2. **A long transaction is expensive even if it writes nothing**, because it pins an old
   snapshot and prevents dead row versions from being reclaimed. That is the
   `idle in transaction` state, and the setting that catches it is
   `idle_in_transaction_session_timeout`.
3. **The MVCC snapshot is taken at a specific moment**, and *when* differs by isolation level.
   Under `READ COMMITTED` (the Postgres default) it is taken at the start of each
   *statement*. Under `REPEATABLE READ` or `SERIALIZABLE` it is taken at the start of the
   *transaction*. This is the whole explanation for "the same query inside one transaction
   returned two different counts."

> **MUST REMEMBER**
>
> Under `READ COMMITTED` — which is the PostgreSQL and MySQL/InnoDB default, and therefore
> what most Spring applications run — **the guarantee is per statement, not per
> transaction.** Any "read the value, decide, write" logic that spans more than one query in
> the same transaction is unprotected. That is not a missing isolation setting; it is the
> designed behaviour of the default, and fixing it is a locking decision, not a settings
> change.

### 4.4 Lost Updates — The One No Standard Level Fixes

```text
Account balance = 100

T1: SELECT balance FROM account WHERE id = 1;   ──► 100
T2: SELECT balance FROM account WHERE id = 1;   ──► 100
T1: UPDATE account SET balance = 100 - 30 WHERE id = 1;  ──► 70
T2: UPDATE account SET balance = 100 - 20 WHERE id = 1;  ──► 80
                                            ── the 30 T1 spent is gone
```

Both transactions ran at `SERIALIZABLE` and both still corrupted the data, because the bug is
not in the read — it is that T2 computed its write from a value that T1 had already
invalidated. This is the **read-modify-write race**, and it is by some distance the most
common real data-corruption bug in Spring applications, because it reproduces perfectly
under a single-threaded test.

**Fix 1 — optimistic locking with `@Version`:**

```java
@Entity
@Table(name = "account")
public class Account {

    @Id
    private Long id;

    private BigDecimal balance;

    @Version                                   // ◄── a numeric column, incremented on every UPDATE
    private Long version;
}
```

```sql
-- Hibernate emits:
UPDATE account SET balance = ?, version = ?  WHERE id = ? AND version = ?;
--                                                        ^^^^^^^^^^^^^  0 rows affected
```

```java
@Transactional
public void withdraw(Long id, BigDecimal amount) {
    Account a = repo.findById(id).orElseThrow();
    a.debit(amount);
    repo.save(a);   // may throw ObjectOptimisticLockingFailureException
}
```

The caller must handle it:

```java
public void withdrawWithRetry(Long id, BigDecimal amount) {
    for (int attempt = 1; attempt <= 3; attempt++) {
        try {
            withdrawService.withdraw(id, amount);          // separate bean → separate tx
            return;
        } catch (ObjectOptimisticLockingFailureException ex) {
            if (attempt == 3) throw ex;
            backOff(attempt);                              // jittered, not fixed
        }
    }
}
```

Three properties worth stating: the `@Version` check is **enforced in the `WHERE` clause of
the `UPDATE`**, so it is atomic regardless of isolation level or timing; it requires **no
locks and no waiting**, so it is the cheap option; and it costs one extra column plus a
retry loop that has to be written honestly (bounded attempts, jittered backoff, and a
decision about what happens when the retry budget is exhausted).

**Fix 2 — pessimistic locking with `SELECT ... FOR UPDATE`:**

```java
@Lock(LockModeType.PESSIMISTIC_WRITE)                 // ◄── adds FOR UPDATE
@Query("SELECT a FROM Account a WHERE a.id = :id")
Optional<Account> findByIdForUpdate(@Param("id") Long id);
```

```java
@Transactional
public void withdraw(Long id, BigDecimal amount) {
    Account a = repo.findByIdForUpdate(id).orElseThrow();   // blocks concurrent writers
    a.debit(amount);
    repo.save(a);        // no race possible — anyone else is waiting
}
```

```text
T1: SELECT ... FOR UPDATE  ──► takes ROW EXCLUSIVE, sees balance=100
T2: SELECT ... FOR UPDATE  ──► BLOCKS until T1 commits or rolls back
T1: UPDATE ... COMMIT      ──► balance = 70, lock released
T2: ...resumes...          ──► re-reads (in READ COMMITTED) balance=70, applies its own delta
```

Choose optimistic by default. Pessimistic is right when the conflict rate is high (so that
retrying is mostly wasted work), when the operation is not a simple single-entity write
(a multi-row invariant), or when a "check this precondition holds" semantics is genuinely
needed. Pessimistic's cost is that it **converts a lost update into a wait**, and a wait
with a timeout is a deadlock waiting for a load spike.

> **STAFF-LEVEL CONSIDERATION**
>
> Optimistic locking is a *correctness* decision, but adopting it across a codebase is an
> *organisational* one, because it means every write path can now fail with
> `ObjectOptimisticLockingFailureException` and every caller needs a policy. The realistic
> migration: put `@Version` on the entities where the invariant is real and the write rate
> is moderate, leave it off hot counters, and write down where the retry is owned —
> service layer, or the caller, or (for the genuinely hot paths) a queue with a bounded
> number of attempts. The wrong move is a blanket `@Version` on every entity with no retry
> policy, which converts silent corruption into a visible 500s — technically an improvement,
> operationally a fire.

### 4.5 Deadlocks — The Inevitable Consequence

A deadlock is two transactions each holding what the other wants:

```text
T1: UPDATE account 1        ── holds lock on row 1
T2: UPDATE account 2        ── holds lock on row 2
T1: UPDATE account 2        ── waiting for T2
T2: UPDATE account 1        ── waiting for T1     XX: DEADLOCK
```

The database detects this itself — every major engine has a deadlock detector, and InnoDB
and PostgreSQL both abort one of the two transactions immediately rather than waiting. So
the practical response is not to prevent deadlocks, which is not fully possible, but to
**treat the abort as a normal outcome and retry**.

```text
PostgreSQL:  ERROR: deadlock detected
             DETAIL: Process 4711 waits for ShareLock on transaction 4690;
                     Process 4690 waits for ShareLock on transaction 4711.
             → SQLState 40P01

MySQL:       Deadlock found when trying to get lock; try restarting transaction
             → SQLState 40001

Hibernate:   org.hibernate.exception.LockAcquisitionException
             Spring:    CannotAcquireLockException / PessimisticLockingFailureException
```

```java
// The pattern that is not optional if you use pessimistic locking
public <T> T withDeadlockRetry(Supplier<T> operation) {
    int maxAttempts = 3;
    for (int attempt = 1; ; attempt++) {
        try {
            return operation.get();                       // MUST be a separate @Transactional
        } catch (CannotAcquireLockException | ConcurrencyFailureException ex) {
            if (attempt >= maxAttempts || !isDeadlock(ex)) throw ex;
            Thread.sleep(20L * attempt + ThreadLocalRandom.current().nextLong(20));
        }
    }
}
```

The two things that make this correct rather than decorative:

1. **The retried unit must be a new transaction.** Retrying inside a transaction that has
   already been marked rollback-only does nothing, because the commit at the end will throw
   `UnexpectedRollbackException` regardless of what you did in between. The retry wraps a
   call to a **separate** `@Transactional` method.
2. **The backoff must be jittered.** A fixed backoff means every thread that deadlocked
   retries in lockstep and deadlocks again. This is the same lesson as exponential backoff
   with jitter in an HTTP retry policy.

Prevention, in order of effectiveness: **keep transactions short**, **always acquire locks in
a consistent order** (sort the IDs before locking a set of rows — this single change
eliminates the majority of deadlocks in batch code), **keep one statement per lock** rather
than accumulating locks across a long method, and **use a consistent lock order between code
paths** (a service that locks parent-then-child and another that locks child-then-parent will
always deadlock against each other).

> **PRODUCTION SCENARIO**
>
> Problem: a nightly reconciliation job aborted with
> `ERROR: deadlock detected` and retried, then aborted again, 200 times, for three
> consecutive nights, until someone added a sleep.
> Investigation: the job locked settlement rows in whatever order the query returned them,
> which is not stable across runs, and it locked 500 rows per batch.
> Root cause: two concurrent instances of the same job (a scheduler that had been
> configured twice), locking the same rows in different orders. Classic deadlock.
> Solution: sort the IDs before locking, and add a distributed lock so only one instance of
> the reconciliation runs at a time.
> Prevention: deadlocks are a normal outcome, so a bounded jittered retry is a
> *requirement* of any design that uses pessimistic locking — and lock ordering is a code
> review checklist item, not a hope.

### 4.6 Where Isolation Should Be Set — and What It Costs

```java
// NO: The wrong instinct — set it once, globally, "to be safe"
spring.datasource.hikari.transaction-isolation: TRANSACTION_SERIALIZABLE

// OK: The right instinct — per method, on the operation that needs it
@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
public MonthlyReport buildMonthlyReport(YearMonth month) { ... }

// OK: And only when nothing else will do
@Transactional(isolation = Isolation.SERIALIZABLE)
public void transferWithInvariantCheck(long from, long to, BigDecimal amount) { ... }
```

Four costs that make a blanket `SERIALIZABLE` a bad default:

1. **Throughput collapses.** Under PostgreSQL SSI, `SERIALIZABLE` means every transaction
   takes predicate locks and tracks read/write dependencies. Read-heavy workloads
   degrade badly, and the failures appear as `40001` aborts, not as slowness.
2. **Every abort must be retried.** `SERIALIZABLE` without a retry loop is worse than
   `READ COMMITTED`, because you have converted a rare correctness bug into a frequent
   application error.
3. **Cached plans get invalidated on some databases.** PostgreSQL's plan cache is
   per-`DatabaseUser` × `search_path`; a transaction-isolation change invalidates cached
   plans in some drivers and proxies, and the first execution after the change is a
   re-plan. In a high-QPS service where the isolation is being toggled by an
   application-level retry, that re-planning is a latency tail.
4. **It leaks into read-only paths.** A global setting applies to reporting queries and
   health checks that do not need it, and a `SELECT` at `SERIALIZABLE` can conflict with a
   concurrent write and abort for no benefit.

> **TRADE-OFF**
>
> `READ COMMITTED` + optimistic locking (`@Version`) versus `SERIALIZABLE` + retry. The
> first is fast, needs no waiting, and turns a lost update into a `40001`-shaped
> application exception that you retry; it is also the shape every high-traffic system
> converges on, because retrying a cheap operation beats waiting for a lock. The second is
> correct without any application code, at the cost of aborted transactions you must still
> retry and throughput you lose. The flip condition: when the conflict *rate* is high enough
> that most optimistic attempts fail, `SERIALIZABLE` or pessimistic locking wins — because at
> that point you are doing N failed attempts where one wait would have done.

#### Common Mistakes

- Believing `SERIALIZABLE` prevents lost updates. It does not; the lost-update race is a
  read-modify-write bug and needs `@Version` or `SELECT ... FOR UPDATE`.
- Treating a database deadlock as an incident. It is a normal, expected outcome that
  requires a bounded jittered retry.
- Retrying inside the same transaction after a lock failure, which cannot work because the
  transaction is already marked rollback-only.
- Setting `SERIALIZABLE` globally to "be safe", paying the throughput cost on every
  read-only path.
- Forgetting that a fixed (non-jittered) retry backoff reproduces the deadlock.
- Assuming `READ COMMITTED` gives per-transaction consistency. It gives per-*statement*
  consistency, and any check-then-act spanning two queries is unprotected.
- Locking a set of rows in query-return order in a batch, which guarantees a deadlock
  against any concurrent run doing the same.

#### Interview Questions — Isolation & Concurrency

**Q1. What are the three anomalies, and which isolation level prevents each?** `TRICKY`

Dirty read (reading uncommitted data) is prevented by `READ COMMITTED` and above.
Non-repeatable read (the same row returning a different value within one transaction) is
prevented by `REPEATABLE READ` and above. Phantom read (the same predicate matching a
different *set* of rows) is prevented only by `SERIALIZABLE` in the SQL standard — and only
if the database implements it as genuinely serializable; PostgreSQL's `REPEATABLE READ`
allows phantoms, while MySQL/InnoDB's does not, because it uses next-key locks rather than
a snapshot. Being able to name that database difference is what separates a read-the-table
answer from an answer from experience.

**Q2. Under MVCC, what does a long read-only transaction cost you?** `STAFF`

Not lock contention — a snapshot. It pins a version of the database, so dead row versions
created after it began cannot be reclaimed, which inflates table and index bloat and makes
`VACUUM` (Postgres) or the purge thread (InnoDB) do more work or fall behind. On Postgres
this is the entire cost model of `idle in transaction`, and the mitigation is
`idle_in_transaction_session_timeout` plus the discipline of never holding a transaction
open across a remote call. On InnoDB the undo log grows for the same reason. The staff-level
addition: this is why a slow report endpoint that opens a transaction and then makes an HTTP
call is a database health problem, not just a slow endpoint.

**Q3. A developer reaches for `@Transactional(isolation = Isolation.SERIALIZABLE)` to fix a
lost update. What actually happens?** `ADVANCED`

It doesn't fix it. The lost update is a read-modify-write race: both transactions read the
same value and both compute a write from it. Under PostgreSQL SSI, `SERIALIZABLE` detects
the conflicting dependency and **aborts** one transaction with `40001 could not serialize
access due to concurrent update` — so you have converted silent corruption into a visible
error, which is better, but you now need a retry loop or your write path is throwing. On
MySQL/InnoDB, `SERIALIZABLE` takes next-key locks and the second transaction *waits*, then
reads the committed value and its write is correct — but that is a side effect of locking,
not of the level being "safer". The correct fix is `@Version` or `SELECT ... FOR UPDATE`.

**Q4. Explain `@Version` and say what the caller must do.** `TRICKY`

`@Version` marks a field mapped to a numeric column that Hibernate increments and includes
in every `UPDATE ... WHERE id = ? AND version = ?`. If the row was changed in between, the
`UPDATE` affects zero rows and Hibernate throws
`ObjectOptimisticLockingFailureException` (Spring translates it from Hibernate's
`StaleObjectStateException`). The caller must therefore implement a bounded, jittered retry
around a **new** transaction, and decide what happens when the budget is exhausted. The
error the fix prevents is a lost update, and the property that makes it work is that the
check is in the `WHERE` clause, so it is atomic under any isolation level and without any
lock.

**Q5. When would you choose `PESSIMISTIC_WRITE` over `@Version`?** `STAFF`

When the conflict rate is high enough that optimistic retry is mostly wasted work, when the
invariant spans multiple rows or multiple tables and cannot be expressed as a version
column, or when you need "check that this precondition still holds" semantics rather than
"my write is based on stale data". The costs are explicit: the operation now waits rather
than failing fast, waits time out into `lock wait timeout` errors, deadlocks become a normal
occurrence that the design must handle, and the lock holds for the duration of the whole
transaction — which means the transaction must be short. The default answer for a
single-entity update is optimistic, and pessimistic is the escalation.

**Q6. A production service sees `Deadlock found when trying to get lock; try restarting
transaction` about 200 times an hour. What is your plan, in order?** `SCENARIO`

Diagnose first — the engine's deadlock report names the two conflicting statements and the
keys involved, so I would collect several and look for the *pattern* of which rows lock in
which order. The most common root cause is inconsistent lock ordering between two code
paths, and the fix is to sort the identifiers before locking a set of rows, which removes
the cycle structurally. Second, add a bounded jittered retry around the whole transaction —
that is a requirement, not an optional hardening, because deadlock is a normal outcome of
pessimistic locking. Third, shorten the transactions: a lock held across an HTTP call is a
lock held for the duration of a network timeout. Fourth, only then consider raising the
deadlock victim selection threshold or moving the isolation level, and I'd be sceptical of
that last step.

**Q7. A developer retries a `CannotAcquireLockException` inside the same `@Transactional`
method. Why does nothing change?** `ADVANCED`

Because the transaction is already marked rollback-only. The inner failure called
`setRollbackOnly()` on the shared `TransactionStatus`, so whatever the retry loop does
inside, the eventual `commit` throws `UnexpectedRollbackException` — the retry never had a
chance. Correctly retrying means the retry wraps a call to a **separate** `@Transactional`
method, so each attempt is a genuinely fresh transaction with a fresh lock acquisition.
This is the same structural mistake as retrying inside a nested transaction, and it is
worth naming explicitly because the code *looks* like a retry.

**Q8. You see `SERIALIZABLE` configured on the connection pool. What would you ask?**
`STAFF`

Four questions. Is it applied to *every* transaction including health checks and reporting
queries, and if so what is the throughput cost? Where are the retries — because under
PostgreSQL SSI, `SERIALIZABLE` transactions abort, and code without a retry is a latent
outage? Are there transactions that now abort more often than they commit? And is the
isolation actually being set, or is it being silently ignored — which is the answer under
a `JpaTransactionManager` with an `EntityManager` that is not database-aware, since JPA
cannot express it portably. That last one is a genuinely useful question, because the
symptom is "we set it and nothing changed."

**Q9. Does raising the isolation level fix a phantoms-in-a-batch-report bug?** `SCENARIO`

It fixes the anomaly and creates a worse problem. Yes, `SERIALIZABLE` (or
`REPEATABLE READ` on MySQL/InnoDB) stops the count from changing mid-transaction. But if the
reason the count is inconsistent is that the report runs while writers are active, then the
transaction now holds a snapshot or a set of predicate locks for the report's full
duration, and — under PostgreSQL — the report may be aborted with a serialization failure
and need retrying. The better fix for a report is usually not a stronger isolation level
but a consistent read model: run the report against a replica, or accept a snapshot as of a
timestamp and say so in the output. Isolation level is the right tool when the *logic*
requires it, not when the report merely needs to be self-consistent.

> **CHAPTER 4 SUMMARY**
>
> The three anomalies map cleanly onto the four SQL levels, but the level is only half the
> story: under MVCC — which is what PostgreSQL and MySQL/InnoDB actually implement — readers
> never block writers, the guarantee is per *statement* under `READ COMMITTED`, and a long
> transaction is expensive because it pins a snapshot and blocks space reclamation rather
> than because it holds locks. The corruption that actually happens in production is the
> lost update, which no standard level prevents, because it is a read-modify-write race and
> needs `@Version` or `SELECT ... FOR UPDATE` to fix. Deadlocks are the inevitable price of
> pessimistic locking, so a bounded, jittered retry is part of the design rather than an
> addition to it, and the best prevention is a consistent lock order. Isolation is a
> per-operation decision: setting it globally is a throughput cost paid on every read-only
> path for a benefit only one operation needs.

#### Further Reading

- [PostgreSQL — Transaction Isolation](https://www.postgresql.org/docs/current/transaction-iso.html) — the definitive description of MVCC, of why `REPEATABLE READ` allows phantoms, and of what SSI actually aborts.
- [PostgreSQL — Concurrent Transactions / MVCC](https://www.postgresql.org/docs/current/mvcc.html) — why a long-running read-only transaction is a storage problem, and how the cleanup process is blocked.
- [PostgreSQL — Explicit Locking](https://www.postgresql.org/docs/current/explicit-locking.html) — `FOR UPDATE`, `NOWAIT`, `SKIP LOCKED`, and the deadlock-detection behaviour.
- [Vlad Mihalcea](https://vladmihalcea.com/) — the deepest practitioner writing on Hibernate locking, connection handling and pool tuning; search the archive for optimistic and pessimistic locking.
- [Thorben Janssen](https://www.thorben-janssen.com/) — long-form practitioner articles on transaction boundaries, propagation and locking in Spring Data JPA.

## Chapter 5 — Declarative vs Programmatic

### 5.1 `TransactionTemplate` Is the Same Thing With the Boundary Written Down

`@Transactional` is a declarative wrapper over `TransactionTemplate`. The template is not a
different mechanism — it is the same `PlatformTransactionManager` calls, with the boundary
in a lambda where a control-flow decision can be made.

```java
@Service
public class ReportService {

    private final TransactionTemplate tx;      // configured once, injected

    public ReportService(PlatformTransactionManager tm) {
        this.tx = new TransactionTemplate(tm);
    }

    // An explicit, self-documenting boundary
    public Report build(Long id) {
        return tx.execute(status -> {
            Report r = repo.findById(id).orElseThrow();
            r.setLines(loadLines(id));
            repo.save(r);
            if (status.isRollbackOnly()) {                 // ◄── the status is IN HAND
                metrics.counter("report.rollback").increment();
            }
            return r;
        });
    }
}
```

What you gain that the annotation cannot give you:

| Capability | `@Transactional` | `TransactionTemplate` |
| --- | --- | --- |
| Conditional transaction | Awkward — needs a no-op wrapper or a self-invocation hack | Natural — the `if` is outside the `execute` |
| A transaction per loop iteration | Impossible without a method call per iteration | Natural — `tx.execute` inside the loop |
| Vary propagation/isolation per call site | Annotation is fixed at compile time | `tx.setPropagationBehavior(...)` or a `DefaultTransactionDefinition` per call |
| The `TransactionStatus` in hand | Only via the programmatic API | Yes — you are the caller |
| Read `label`, mark rollback-only, add a synchronisation | Not from the annotation | Yes |
| Applies to code you do not own | No — you cannot add an annotation | Yes — wrap the call |

### 5.2 The Four Cases Where the Template Is Genuinely Better

**Case 1 — a conditional boundary.** The classic: only open a transaction when there is work.

```java
public void processBatch(List<Row> rows) {
    if (rows.isEmpty()) {
        return;                       // no transaction opened, no connection borrowed
    }
    tx.execute(status -> {
        rows.forEach(this::importOne);
        return null;
    });
}
```

With `@Transactional` the only equivalent is a public wrapper method delegating to a
non-annotated inner method — which is the self-invocation workaround, and it works but is
indirect.

**Case 2 — a transaction per iteration, deliberately.** Batch imports, per-item isolation:

```java
public ImportSummary importAll(List<Row> rows) {
    ImportSummary summary = new ImportSummary();
    for (Row row : rows) {
        try {
            tx.execute(status -> { importOne(row); return null; });
            summary.ok(row);
        } catch (DataIntegrityViolationException ex) {
            summary.failed(row, ex);        // this row only; the rest continue
        }
    }
    return summary;
}
```

Each `execute` is a genuinely separate transaction with its own commit, because each
`execute` call gets a fresh `TransactionStatus` and a fresh connection borrow. Note the
cost: this is the `REQUIRES_NEW` pattern implemented explicitly, and it has the *same*
connection pressure if the outer method is itself transactional. The difference is that here
you can see it.

**Case 3 — wrapping code you do not own.** A third-party SDK, a legacy DAO, a library
method that was never written to be transactional:

```java
@Bean
public PlatformTransactionManager txManager(DataSource ds) { ... }

// A Spring AOP aspect that wraps ANY bean, including ones without annotations
@Bean
public Advisor transactionalAdvisor(PlatformTransactionManager tm) {
    return new TransactionInterceptor(tm, new MatchTransactionManagerSourcePointcut());
}
```

The advisor approach — the same machinery `@Transactional` uses, with your own pointcut —
is how teams apply transactions uniformly to code they cannot edit. It is also how you
apply a *different* boundary to an existing `@Transactional` method.

**Case 4 — composing several boundaries with a shared definition.** This is the case that
has no clean declarative equivalent:

```java
public class IndependentTaskRunner {

    private final TransactionTemplate outer;
    private final TransactionTemplate inner;

    public IndependentTaskRunner(PlatformTransactionManager tm) {
        DefaultTransactionDefinition def = new DefaultTransactionDefinition();
        def.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        def.setName("audit-requires-new");
        def.setTimeout(15);

        this.outer = new TransactionTemplate(tm);                 // default: REQUIRED
        this.inner = new TransactionTemplate(tm, def);            // explicit: REQUIRES_NEW
    }

    public void run(Task task) {
        outer.execute(outerStatus -> {
            repo.save(task);

            inner.execute(innerStatus -> {                        // independent commit
                auditLog.record(task);
                return null;
            });

            if (task.isFatal()) {
                outerStatus.setRollbackOnly();     // ◄── audit survives, task does not
            }
            return null;
        });
    }
}
```

Note the last three lines. This is the behaviour the annotation **cannot** express: the
audit write commits, the task rolls back, and the ordering is guaranteed. The cost is the
extra connection from `REQUIRES_NEW`, and the honest staff-level comment is that if you need
this shape often, an outbox row written in the *outer* transaction is usually the better
design (Chapter 7) — same atomicity, one connection, no independent commit to reason about.

### 5.3 The Escape Hatch — `TransactionSynchronizationManager`

When you need to hook the transaction's *lifecycle* rather than wrap work in it, you
register a synchronisation. This is the mechanism underneath
`@TransactionalEventListener`, and it is the correct programmatic form of the same idea.

```java
@Transactional
public void placeOrder(OrderRequest req) {
    Order order = repo.save(toOrder(req));

    TransactionSynchronizationManager.registerSynchronization(
        new TransactionSynchronization() {

            @Override
            public void afterCommit() {
                // The transaction has COMMITTED. Rows are durable.
                notificationGateway.send(order.id());
            }

            @Override
            public void afterCompletion(int status) {
                // status: STATUS_COMMITTED, STATUS_ROLLED_BACK, STATUS_UNKNOWN
                if (status == STATUS_ROLLED_BACK) {
                    metrics.counter("order.placement.rolledback").increment();
                    dlqPublisher.publish(order.id());
                }
            }
        });
}
```

The interface, and what each callback is for:

| Callback | Fires | Use for | Trap |
| --- | --- | --- | --- |
| `beforeCommit(boolean readOnly)` | Just before the commit | Flushing a pending change that must be inside the transaction | Throwing here rolls the transaction back |
| `afterCommit()` | **After** the commit succeeded | Side effects: notify, publish, call a cache | Throwing here does **NOT** roll back — the data is already durable |
| `afterCompletion(int status)` | After commit **or** rollback | Cleanup in both cases, DLQ, metrics | You do not know *which* happened unless you read `status` |
| `beforeCompletion()` | Before commit or rollback | Releasing a resource that must not be held during commit | — |

```java
// Ordering: register more than one, and the order is registration order
TransactionSynchronizationManager.registerSynchronization(first);
TransactionSynchronizationManager.registerSynchronization(second);
```

> **MUST REMEMBER**
>
> **An exception thrown in `afterCommit` does not roll anything back — the transaction is
> over.** This is the same fact Volume 1 flagged for
> `@TransactionalEventListener(phase = AFTER_COMMIT)`, and it is the single most common
> misunderstanding about transaction lifecycle hooks. If the side effect must be reliable,
> the answer is not a better hook; it is a transactional outbox row written *inside* the
> transaction, which is Chapter 7's subject.

### 5.4 How This Differs from `@TransactionalEventListener`

| | `TransactionSynchronizationManager.registerSynchronization` | `@TransactionalEventListener` |
| --- | --- | --- |
| Defined in | Business code, at the point of the event | A separate listener class |
| Receives | The `TransactionSynchronization` callbacks, and (via the surrounding status) the ability to `setRollbackOnly()` | The event payload only |
| Can mark rollback-only | **Yes** — `status.setRollbackOnly()` is in scope | No |
| Can read the transaction label | Yes, via `getCurrentTransactionName()` | No |
| Discovery | None — it is a line of code where you are already looking | Automatic, by event type |
| Cross-cutting | No — every caller must remember to register | Yes — one listener, many publishers |
| Works without a transaction | Throws `IllegalStateException` | Runs immediately unless `fallbackExecution` is set (or is silently dropped — the Volume 1 trap) |

The honest recommendation: **prefer `@TransactionalEventListener` for "when X happens, do
Y" and prefer `registerSynchronization` for "I need to participate in this transaction's
outcome."** The cases that genuinely need the programmatic form are:

```java
// (a) I need to mark this transaction rollback-only from a side path
tx.execute(status -> {
    doWork();
    if (mustAbort()) {
        status.setRollbackOnly();       // no exception, but the outcome is a rollback
    }
    return null;
});

// (b) I need a guaranteed cleanup on BOTH outcomes, with the outcome
TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
    @Override public void afterCompletion(int status) {
        lockRegistry.release(resourceKey, status == STATUS_COMMITTED);
    }
});

// (c) I need a different ordering from the other listeners in the system
```

> **TRADE-OFF**
>
> Declarative (`@Transactional`) versus programmatic (`TransactionTemplate` +
> `registerSynchronization`). Declarative is readable, greppable, impossible to accidentally
> wrap, and it is what a reviewer expects — it should be the default and it should be what
> 90% of a codebase looks like. Programmatic buys you conditional boundaries, per-iteration
> transactions, the ability to wrap code you do not own, and access to the `TransactionStatus`.
> The flip condition: the moment the boundary depends on a runtime value, loops, or needs to
> influence the transaction's *outcome* rather than just its *extent*, programmatic is
> correct. The anti-pattern to avoid is migrating a whole service to templates for style
> reasons — that loses greppability and gets it reverted within a release.

> **PRODUCTION RELEVANCE**
>
> A detail with real operational value: `TransactionSynchronizationManager` lets you register
> a synchronisation that **measures** the transaction. Registering an
> `afterCompletion` that records elapsed time, row counts, and whether it was a new or
> participating transaction gives you a transaction-level latency histogram keyed by the
> `@Transactional(label = ...)` value, per method, with no code change at the call sites —
> only at the ones that matter. That is a very cheap way to answer "which of these forty
> methods is slow in production but fast in the load test", and it is the kind of
> instrumentation that pays for itself the first time a long transaction shows up.

#### Common Mistakes

- Using a single shared `TransactionTemplate` and mutating its propagation behaviour per
  call. The template is not thread-safe for reconfiguration; build a new one, or use
  `DefaultTransactionDefinition` per call.
- Retrying a `TransactionTemplate.execute` around code that already has an outer
  transaction, for the same reason the annotation retry fails — the outer transaction is
  rollback-only.
- Believing an exception in `afterCommit` rolls back the transaction. It cannot; the commit
  already happened.
- Forgetting that `registerSynchronization` throws `IllegalStateException` when no
  transaction is active, which turns a "listener that quietly does nothing" into a
  different kind of bug.
- Wrapping a per-item batch loop in one outer `@Transactional` and expecting a failed item
  to be skipped. Without `NESTED` or a per-item `execute`, the whole batch is one
  transaction and one failure undoes everything.
- Reaching for `REQUIRES_NEW` via a template to solve an "audit must survive" problem,
  when an outbox row in the same transaction gives the same durability with one connection.

#### Interview Questions — Declarative vs Programmatic

**Q1. Is `TransactionTemplate` a different mechanism from `@Transactional`, or the same one?**
`TRICKY`

The same one. `@Transactional` is metadata read by an advisor; the
`TransactionInterceptor` it installs is the code that does
`getTransaction` / `commit` / `rollback`. `TransactionTemplate` calls those same three
methods directly, with the boundary expressed in a lambda. `TransactionTemplate` is the
lower-level API, and the annotation is sugar over it — which is why every annotation
limitation is a `TransactionInterceptor` limitation and every template capability is
something the annotation simply cannot express.

**Q2. Name four situations where the template is the better tool.** `ADVANCED`

A conditional boundary (only open a transaction when there is work); a transaction per
iteration of a loop, so one bad row does not undo the batch; wrapping code you do not own,
such as a third-party SDK or a legacy DAO — via a `TransactionInterceptor` with a custom
pointcut; and varying propagation or isolation per call site, including composing several
templates that share a `DefaultTransactionDefinition` with
`PROPAGATION_REQUIRES_NEW`. Add a fifth, and the most useful one: when you need the
`TransactionStatus` to `setRollbackOnly()` from a side path.

**Q3. What is the difference between `afterCommit` and `afterCompletion`? What can go wrong
in each?** `TRICKY`

`afterCommit` runs only when the transaction committed, and the data is already durable —
an exception thrown there rolls nothing back, so a failure means "the data is written and the
side effect did not happen", which is a lost-effect problem needing an outbox, not a
rollback. `afterCompletion` runs in both cases with a `status` argument of
`STATUS_COMMITTED`, `STATUS_ROLLED_BACK` or `STATUS_UNKNOWN`, and is where you release
resources, increment the right metric, or publish to a dead-letter queue. `STATUS_UNKNOWN`
means the outcome could not be determined — a heuristic outcome, or a connection that died
mid-commit — and code that assumes "it must have committed or rolled back" is wrong.

**Q4. When would you deliberately write `status.setRollbackOnly()` instead of throwing?**
`STAFF`

When the failure is real but the exception is not the right signal to the caller — for
example, a validation check that finds the aggregate is inconsistent and must not be
persisted, where the caller is expected to receive a domain result rather than a stack
trace. Throwing would also work, but it couples the rollback to an exception type and
usually forces the caller to catch something. Marking rollback-only and returning a result
object is honest, and the `UnexpectedRollbackException` on a *later* `commit` is the
mechanism that guarantees the work is not written. The cost is that the signal is invisible
in the stack trace, so it must be logged deliberately.

**Q5. A shared `TransactionTemplate` bean has its propagation changed per call. What is the
bug?** `ADVANCED`

`TransactionTemplate` is not safe for concurrent reconfiguration of its
`DefaultTransactionDefinition`. Two threads changing `setPropagationBehavior` on the same
instance can observe each other's value, so one call runs with the other's propagation —
which, for `REQUIRES_NEW`, means an unexpected second connection and a second commit.
Either build a new `TransactionTemplate` per configuration, hold one template per
propagation behaviour, or pass a fresh `DefaultTransactionDefinition` to the constructor of
a new template each time. The general rule is the same as for any shared mutable
configuration object in a singleton bean.

**Q6. You need "write an audit row that survives even if the business transaction rolls
back". Which approach would you defend in a design review?** `STAFF`

I'd push back on the requirement before implementing it, because it usually encodes a
confusion between "the audit must record that we *attempted* this" and "the audit must
record that this *happened*." If it is the latter, an independent `REQUIRES_NEW` transaction
creates the worse problem: the audit claims an outcome the business data contradicts, and it
costs a second connection per attempt. The two defensible answers are: write the audit in
the *same* transaction when it describes the committed outcome, and use an **attempt log**
written before the attempt (which is genuinely independent and genuinely records attempts);
or write a row to an outbox table inside the same transaction and let a relay publish it,
which gives durability without a second connection. What I would not ship is a
`REQUIRES_NEW` audit write with no reconciliation, because it produces records that lie.

**Q7. A `@Transactional` method publishes an event with
`@TransactionalEventListener(AFTER_COMMIT)`. A user says "the email sometimes never
sends"." What are the candidate causes, ranked?** `SCENARIO`

Ranked: no transaction was active when the event was published, in which case the listener
never runs at all and there is no error; the listener threw, and because `AFTER_COMMIT` runs
after the commit, the exception cannot roll anything back and in an `@Async` listener it is
swallowed by the default `AsyncUncaughtExceptionHandler`; the bounded executor rejected the
task; the process died between the commit and the send. The unifying point is that the
in-process event has no delivery guarantee — which is exactly what Volume 1's events chapter
concluded, and what the transactional outbox exists to fix. The fix for a notification the
business actually depends on is a durable row in the same transaction plus a relay with a
retry and a deduplication key, not a different listener phase.

**Q8. How would you add transaction-level observability without touching call sites?**
`STAFF`

Register a `TransactionSynchronization` in an aspect around all
`@Transactional` methods that, in `afterCompletion`, records the elapsed time, the
`@Transactional(label = ...)`, and whether the transaction was new or participating, keyed
by the label. That gives a per-method transaction latency histogram in production with
annotations on the call sites as the only change — and the labels already exist. The
complement is a slow-transaction log from the database side
(`pg_stat_activity WHERE state = 'idle in transaction'`, or
`information_schema.innodb_trx` on MySQL) which catches the transactions that the JVM
instrumentation cannot see because they were left open by code that has no `@Transactional`
at all.

> **CHAPTER 5 SUMMARY**
>
> `TransactionTemplate` is the same `PlatformTransactionManager` mechanism as
> `@Transactional` with the boundary written in a lambda, and it is the right tool whenever
> the boundary depends on something the annotation cannot see: a runtime condition, a loop
> iteration, code you do not own, or a per-call propagation decision. Its real advantage is
> that you hold the `TransactionStatus`, which is what lets you mark a transaction
> rollback-only without throwing. `TransactionSynchronizationManager.registerSynchronization`
> goes one level deeper and hooks the transaction's lifecycle —
> `beforeCommit`, `afterCommit`, `afterCompletion` — and the fact to carry forward is that
> an exception in `afterCommit` cannot undo anything, which is why "the side effect must be
> reliable" is an outbox question, not a hook question.

#### Further Reading

- [Spring Framework Reference — Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction.html) — the "TransactionAware proxies" and "`TransactionSynchronization`" sections, which cover both the template and the synchronisation callbacks.
- [`TransactionSynchronizationManager` Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/support/TransactionSynchronizationManager.html) — the actual semantics of `registerSynchronization`, including the `IllegalStateException` when no transaction is active.
- [Spring Framework Reference — Declarative Transactions](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html) — how a custom `TransactionAttributeSource` and advisor ordering work, which is how you apply transactions to code you do not own.
- [Microservices Patterns — Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) — the durable alternative to an `afterCommit` side effect, and the reason the hook is not one.

## Chapter 6 — Common Failure Modes

Each entry below is a symptom an on-call engineer has actually seen, the mechanism, and
the fix. Read this chapter as a diagnostic index.

### 6.1 Self-Invocation — the Transaction That Was Never There

Covered in Chapter 2, restated as a catalogue entry because it is the most common one and
because the *symptom* is so misleading.

```java
@Service
public class OrderService {

    @Transactional
    public void place(OrderRequest req) {
        repo.save(toOrder(req));
        applyPromotion(req);          // ◄── transactional, but runs on `this`
    }

    @Transactional
    private void applyPromotion(OrderRequest req) { ... }   // never proxied
}
```

**Symptom:** writes that are occasionally half-applied, a `@Transactional` method that
"doesn't roll back," or an integrity violation that only appears in production. Often
mistaken for a rollback-rule problem.

**Root cause:** `this.applyPromotion(...)` dispatches to the target object, not the proxy.
The proxy's advice never runs for that call.

**Fix:** move it to another bean, or inject self with `@Lazy` and call through the proxy.
The *design* fix is to ask why one class has two units of work, because it usually has two
reasons to change.

**Diagnostic:**
```java
if (orderService.getClass().getName().contains("$$SpringCGLIB$$")) { ... }  // it IS proxied
```
Proving the bean is proxied tells you the annotation on the *entry* method works. It does
not tell you anything about inner calls.

### 6.2 The Checked Exception That Committed

**Symptom:** a method throws, an alert fires, and the data is still written.

```java
@Transactional
public void importFile(Path file) throws IOException, SQLException {
    for (String line : lines) {
        legacyDao.insert(line);          // throws SQLException
    }
}
```

**Root cause:** `SQLException` and `IOException` are checked; the default rollback rule
commits on them.

**Fix:** `@Transactional(rollbackFor = Exception.class)`, or make the exception extend
`RuntimeException` — the better fix, because it also lets Spring's exception translation
produce `DataAccessException` subtypes the caller can handle meaningfully.

**Diagnostic:** grep the codebase for `throws` on methods that also carry
`@Transactional`. It is a two-minute check and it finds most of a team's latent
half-commits.

### 6.3 `readOnly = true` Silently Dropping Changes

**Symptom:** a method annotated `@Transactional(readOnly = true)` mutates an entity, the
test passes, and nothing is written in production. Or — on a different database — the
mutation *is* written, and the "read-only" guarantee you thought you had does not exist.

```java
@Transactional(readOnly = true)
public void markViewed(String userId, String articleId) {
    Article a = articleRepo.findById(articleId).orElseThrow();
    a.incrementViewCount();          // dirty in the persistence context
    // NO repository.save() call, no flush — and under Hibernate:
    // FlushMode.MANUAL means nothing is written at all. Silently.
}
```

**Root cause, and it is two mechanisms:**

1. `JpaTransactionManager.prepareFlushMode` sets Hibernate's `FlushMode.MANUAL` when
   `readOnly` is true, and restores the previous mode on completion. With `MANUAL`, changes
   are not flushed to the database — the persistence context is simply discarded at the end
   of the transaction. The change is **dropped without an error**.
2. The JDBC layer calls `Connection.setReadOnly(true)`. PostgreSQL enforces this and throws
   on any write. MySQL and H2 treat it as a driver hint and **do not enforce it**. So the
   same annotation is a hard guarantee on one database and no guarantee at all on another.

**Fix:** move the mutation to a `@Transactional` method without `readOnly`, and be explicit
about the database you rely on for the enforcement. If you need "read this, then write it,
in one transaction", do not use `readOnly = true` — the flag is describing the *intent* of
the method, and a method that writes is not read-only.

**Diagnostic:** search for `@Transactional(readOnly = true)` methods that call a mutator.
Better: assert it in a test —
```java
assertThat(TransactionSynchronizationManager.isCurrentTransactionReadOnly())
    .as("this method must be read-only")
    .isTrue();
```

> **PRODUCTION RELEVANCE**
>
> `readOnly = true` is still worth setting, and the reasons are not about enforcement. It
> lets the datasource route to a read replica if the infrastructure is set up for it. It
> lets Hibernate skip dirty checking entirely, which is a real saving on read-heavy
> services. It documents intent. What it does not do is *guarantee* anything, and the
> honest description to give a reviewer is "a hint and an optimisation," not "a safety
> mechanism."

### 6.4 Two `TransactionManager` Beans — `NoUniqueBeanDefinitionException`

**Symptom:**

```text
org.springframework.beans.factory.NoUniqueBeanDefinitionException:
  No qualifying bean of type 'org.springframework.transaction.PlatformTransactionManager'
  available: expected single matching bean but found 2:
    - transactionManager
    - replicaTransactionManager
```

**Root cause:** a second `DataSource` was added (read replica, sharding, a second tenant
schema), Boot's auto-configuration backed off because there is more than one candidate, and
someone declared a manager for each. Every `@Transactional` without an explicit
`value` is now ambiguous.

**Why it is worse than it looks:** it is a **runtime** failure, per call site, not a startup
failure. The application starts. The endpoints that happen to use only the primary data
source work, because... actually no — the resolution happens when the advice runs, so the
first call to *any* `@Transactional` method without a `value` throws. In practice this means
it surfaces under production traffic rather than in CI, unless CI has a test that calls such
a method.

**Fix:**
```java
@Transactional(transactionManager = "transactionManager")        // or value =
public void write(...)
```
and — the part teams skip — **apply it to every `@Transactional` in the application**,
including the ones that unambiguously use the primary, because that is what makes the
convention uniform and reviewable. Better still, add a startup assertion:

```java
@Test
void exactlyOneTransactionManagerUnlessDeclaredDeliberately() {
    Map<String, PlatformTransactionManager> beans =
        context.getBeansOfType(PlatformTransactionManager.class);
    // 1 is fine; >1 requires every @Transactional to name a manager — enforce by
    // reflection scan in this test rather than by review.
}
```

### 6.5 Calling a Transactional Method From a Non-Transactional Caller

**Symptom:** data written outside any transaction; `LazyInitializationException`; a
`@Transactional` method that appears not to roll back when called from one place but does
when called from another.

```java
@Service
public class CacheWarmer {

    @Scheduled(fixedDelay = 60_000)
    public void warm() {
        productService.rebuildIndex();       // @Transactional — starts its own. Fine.
    }

    @EventListener
    public void onProductChanged(ProductChangedEvent e) {
        productService.rebuildIndex();       // fine, IF the publisher was transactional
    }
}
```

The genuinely broken version:

```java
@Service
public class BatchJob {

    public void run() {                    // NOT @Transactional, NOT called through a proxy
        for (int i = 0; i < 1000; i++) {
            reportService.generate(i);     // @Transactional → one transaction PER ITEM
        }
    }
}
```

**Root cause:** the caller is outside a transaction, so every inner `@Transactional` call
starts and commits its own. A thousand transactions instead of one — which is both a
correctness problem (partial progress on failure) and a performance problem (a thousand
commits).

**The worse version, and the one that actually corrupts data:**

```java
@Service
public class BatchJob {

    public void run() {                              // no transaction on the CALLER
        for (int i = 0; i < 1000; i++) {
            productRepo.findById(i).ifPresent(p -> {
                p.setName("v2");
                productRepo.save(p);                 // its own transaction, or none at all
            });
        }
    }
}
```

Here the `save` participates in whatever transaction the repository's own `@Transactional`
opens, and a failure at item 700 leaves items 0–699 committed and 700–999 not attempted,
with no record of where it stopped.

**Fix:** put the boundary on the *caller* — `@Transactional` on `run()` — so the whole batch
is one unit of work; or use a `TransactionTemplate` around the loop with a deliberate
per-item `execute` if partial progress is the actual requirement. The question to ask is
which of those two the business wants, and the answer is usually "one transaction, all or
nothing" until proven otherwise.

### 6.6 Long Transactions Holding Locks

**Symptom:** `idle in transaction` on Postgres, `information_schema.innodb_trx` rows on
MySQL, lock wait timeouts, and deadlocks between two services that never touch the same
code.

```java
@Transactional
public OrderResult checkout(Cart cart) throws Exception {
    Cart loaded = cartRepo.findById(cart.id());          // row locked (FOR UPDATE via @Lock)
    validateInventory(loaded);
    PaymentResult p = paymentGateway.charge(loaded);     // ◄── 900ms, 3s, 30s on retry
    orderRepo.save(toOrder(loaded, p));
    inventoryClient.notifyWarehouse(loaded);             // ◄── another 400ms network call
    analyticsClient.track("checkout");                  // ◄── and another
    return OrderResult.from(loaded, p);
}
```

**Root cause:** a database transaction is being held across network I/O. The rows read at
the top of the method are locked for the entire duration of every downstream call, including
every retry and timeout.

**Root cause #2, and it is the one that scales worst:** `@Transactional` on a method that
loops. 10,000 iterations inside one transaction is one lock set held for the whole batch,
and under MVCC it is also one long-lived snapshot preventing vacuum from reclaiming space.

**Fix, in order:**

1. **Move the remote calls outside the transaction.** Load, commit, call, then open a
   second short transaction to write. This is the correct shape and it does mean designing
   for the fact that a failure after the charge needs a compensating write — which is a Saga
   in miniature, and is honest.
2. **Set a database-enforced backstop** so an unbounded transaction cannot exist:
   ```yaml
   # PostgreSQL
   idle_in_transaction_session_timeout: 60s
   statement_timeout: 30s
   lock_timeout: 10s
   ```
   ```properties
   # MySQL
   spring.datasource.hikari.connection-init-sql=SET SESSION innodb_lock_wait_timeout=5
   ```
3. **Bound it in the application** with `@Transactional(timeout = 5)` — understanding that
   this is a query timeout, so it bounds the *queries* and not the time spent in Java
   between them. It is a partial mitigation, and calling it a fix is the common error.
4. **Instrument it.** `afterCompletion` hooks keyed by the `@Transactional(label)` give you
   the distribution, and the database-side view catches what the JVM cannot see.

> **PRODUCTION SCENARIO**
>
> Problem: lock wait timeouts in the checkout path, roughly 2% of requests, clustered in
> the 14:00–15:00 window. The database showed no CPU pressure.
> Investigation: `pg_stat_activity` showed a steady 40–60 sessions in
> `idle in transaction`, the oldest for 3–4 minutes, each holding `FOR UPDATE` row locks
> on `inventory`. A thread dump showed those request threads parked in a socket read to the
> payment gateway.
> Root cause: `checkout()` held its transaction across a payment call that was
> intermittently taking 4 seconds, and the inventory rows were locked for the whole of it.
> Solution: moved the payment call outside the transaction and shortened the write
> transaction to a single indexed update; added
> `idle_in_transaction_session_timeout = 60s` as a backstop.
> Prevention: a review rule that no `@Transactional` method may call a remote client, and
> a slow-transaction log keyed by `@Transactional(label)` so the next one is visible before
> it becomes an incident.

### 6.7 The Test That Passes And Production Doesn't

**Symptom:** everything works in CI. Something in production writes partial data, or
commits something that should have rolled back, or is 100× slower.

**Root cause, and it is usually the test transaction:**

```java
@SpringBootTest
@Transactional                    // ◄── THE PROBLEM
class OrderServiceTest {

    @Autowired OrderService service;      // proxied
    @Autowired EntityManager em;

    @Test
    void orderIsPersisted() {
        service.place(request);
        em.flush();
        em.clear();
        assertThat(repo.findById(id)).isPresent();    // sees the flushed, uncommitted row
    }
}
```

What `@Transactional` on a test class does: it wraps **every test method** in a transaction
that **rolls back at the end**. Three things follow, and each one hides a real bug:

| What the test does | What it hides |
| --- | --- |
| Sees uncommitted data through the same persistence context | A write that would not be visible to another connection or another request |
| Never observes a real `COMMIT` | A failure in the commit path — a constraint deferred to commit, a `commit()` that throws, a lost update at commit time |
| Rolls back unconditionally | A method whose rollback behaviour is wrong, including the checked-exception rule |
| Holds one connection per test for the whole test | Nothing at all — the *cost* of holding a connection across a 5-second test is invisible locally and is exactly what starves a small pool in CI |

The production symptom is therefore almost always: **"the data isn't there."** The write
worked in the test because the test never committed, and in production something downstream
of the write — a queue publish, a cache eviction, a read from a replica — observed a
committed state that did not contain the row.

**Fixes, in order of quality:**

```java
// 1. BEST — no test transaction at all; @Transactional on the service commits for real
@SpringBootTest
@DirtiesContext(classMode = AFTER_EACH_TEST_METHOD)   // slow but honest
class OrderServiceCommitTest {
    @Autowired OrderService service;
    @Autowired TestEntityManager em;   // no flush() needed — commit is real

    @Test
    void dataSurvivesTheCommit() {
        service.place(request);
        assertThat(aggregateService.count()).isEqualTo(1);   // a real read
    }
}

// 2. GOOD for most suites — a dedicated slice for the few tests that must test real commits
@DataJpaTest
@TestPropertySource(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
class RepositoryCommitTest { ... }        // Testcontainers or a real database

// 3. The pragmatic middle — keep the rollback test transaction, but write ONE test class
//    per service that has no @Transactional, and run it in a dedicated profile.
```

The **read-replica angle** is worth stating at staff level: a test with a rollback
transaction running against a primary cannot detect a replication-lag bug, and it cannot
detect a `@Transactional(readOnly = true)` bug, and it cannot detect a "we commit the JPA
flush and then the JDBC insert" partial commit. Those three are exactly the bugs the
framework is most likely to hand you.

### 6.8 Diagnosing a Transaction at Runtime — The Full Toolkit

In escalating order of invasiveness:

```java
// 1. In-process, one line
TransactionSynchronizationManager.isActualTransactionActive();
TransactionSynchronizationManager.getCurrentTransactionName();     // the @Transactional(label)
TransactionSynchronizationManager.isCurrentTransactionReadOnly();

// 2. Connection identity — catches the two-manager case the boolean cannot
var conn = DataSourceUtils.getConnection(dataSource);
log.info("conn={} identity={} txName={} thread={}",
         conn.getMetaData().getURL(),
         System.identityHashCode(conn),
         TransactionSynchronizationManager.getCurrentTransactionName(),
         Thread.currentThread().getName());

// 3. A permanent, opt-in tracer — a TransactionSynchronization on every transaction
@Component
class TransactionTracer {
    @Autowired PlatformTransactionManager tm;

    @Bean
    Advisor tracerAdvisor() {
        var interceptor = new TransactionInterceptor(tm, new TransactionAttributeSource() {
            @Override public boolean isTransactionAttribute(Method m, Class<?> t) { return true; }
            @Override public TransactionAttribute getTransactionAttribute(Method m, Class<?> t) {
                return new TransactionAttribute() { /* defaults: REQUIRED */ };
            }
        });
        return new DefaultPointcutAdvisor(Pointcut.TRUE, interceptor);
    }
}
// Then log in afterCompletion: label, isNewTransaction, elapsed, isRollbackOnly.

// 4. Database side — sees everything, including code with no annotation at all
-- PostgreSQL
SELECT pid, usename, state, xact_start, now() - xact_start AS age, query
  FROM pg_stat_activity
 WHERE state = 'idle in transaction'
 ORDER BY age DESC;

-- MySQL
SELECT trx_id, trx_state, trx_started, trx_wait_started, trx_rows_locked, trx_query
  FROM information_schema.innodb_trx
 ORDER BY trx_started;
```

```properties
# Make the database label every statement with the transaction name (PostgreSQL)
spring.datasource.hikari.connection-init-sql=SET application_name TO 'app'
# and, in the annotation:
@Transactional(label = "settlement.run")   -- appears in pg_stat_activity.query
```

The diagnostic principle behind all of it: **a transaction is a thread-bound, connection-bound
fact, so every question about transactions is really a question about which connection this
thread holds and for how long.** Log the connection identity, log the thread, log the
elapsed time, and most of this chapter's failures become visible before they become
incidents.

> **MUST REMEMBER**
>
> The single most valuable line of defensive code in a Spring codebase is a test that fails
> when a transaction is missing:
>
> ```java
> assertThat(TransactionSynchronizationManager.isActualTransactionActive())
>     .as("this method must run in a transaction — check for self-invocation, " +
>         "a non-proxy instance, or a missing @Transactional")
>     .isTrue();
> ```
>
> Put it in a base class for the tests that cover write paths. It converts the most common
> class of silent transaction bug from "discovered in production" to "red in CI," and it
> costs one line.

#### Common Mistakes

- Trusting a green test suite as evidence that transactions work, when the tests are
  wrapped in a rollback transaction that never commits.
- Setting `readOnly = true` for the performance and treating it as a correctness guarantee,
  when on MySQL and H2 it is a driver hint that does nothing.
- Reading a value, then writing a value computed from it, in a `READ COMMITTED`
  transaction — a lost update that no test running in a single thread will ever reproduce.
- Believing a `@Transactional` method called from a `@Scheduled` task or a listener runs
  inside the caller's transaction. There is no caller transaction.
- Retrying a deadlock inside the same transaction instead of around a new one.
- Assuming a slow endpoint is a slow endpoint, when a thread dump shows it parked in a
  socket read while holding a database transaction open.

#### Interview Questions — Failure Modes

**Q1. A `@Transactional` method is called from a `@Scheduled` method. Is it transactional?**
`TRICKY`

Yes — but as its own, single-method transaction, and only because the scheduler invokes the
bean through the proxy. The scheduler's thread is not a request thread, so there is no
ambient transaction for it to join. That distinction is the one that bites: if the scheduled
method loops over 1,000 items calling a `@Transactional` method, that is 1,000 transactions
and 1,000 commits, not one. And because the outer method has no boundary, a failure at item
700 leaves 0–699 committed with no record of where it stopped.

**Q2. A team's integration tests pass; production shows missing rows. What is the most
likely cause?** `SCENARIO`

The tests are annotated `@Transactional` at the class level, which wraps each test in a
transaction that **rolls back at the end**. Nothing in such a test ever exercises a real
commit, so any bug in the commit path — a deferred constraint violation, a
`@Transactional(readOnly = true)` flush-mode discard, a two-transaction-manager partial
commit, a lost update at commit time — is invisible. The production symptom is almost
always "the data isn't there," because the write that "worked" in the test was never
committed and a downstream reader, on another connection or a replica, correctly did not see
it. The fix is a dedicated test slice with no rollback transaction, against a real database
via Testcontainers, covering the write-and-read-back path.

**Q3. A developer says "I set `readOnly = true` and the code still wrote to the database."
What happened?** `ADVANCED`

Two possibilities, and the honest answer is that the flag is not an enforcement mechanism.
`JpaTransactionManager` sets Hibernate's `FlushMode.MANUAL` for a read-only transaction,
which should discard changes — but on MySQL and H2, `Connection.setReadOnly(true)` is a
driver hint, and if the flush mode was reset (an inner `@Transactional` without `readOnly`,
a manual `em.flush()`, or a native query) the write goes through. On PostgreSQL the same
code would throw. So the behaviour is **database-dependent**, which is the real lesson: if
you need "this method must not write," enforce it somewhere other than a transaction flag.

**Q4. What does `UnexpectedRollbackException: Transaction rolled back because it has been
marked as rollback-only` actually mean?** `TRICKY`

It means an inner participating method threw, was caught somewhere up the stack, and the
outer method then tried to commit. When an inner method that joined the existing
transaction (`REQUIRED`, `SUPPORTS`, `MANDATORY`, `NESTED`) throws, its interceptor calls
`setRollbackOnly()` on the shared `TransactionStatus` before the exception propagates. If
the outer code swallows that exception, the outer method sees a normal return, and the
commit of an already-doomed transaction is what raises this. The fix is not to catch the
exception and continue unless you genuinely can — because the inner work *has* been rolled
back at commit time, and the "continue" runs on a transaction that will not commit.

**Q5. Rank the causes of `HikariPool - Connection is not available, request timed out after
30000ms`, most common first.** `SCENARIO`

1. **Connection demand exceeds pool size because of `REQUIRES_NEW` or deep nesting** — every
   request holds two connections. Check for `REQUIRES_NEW` on the request path first; it is
   by far the most common and least obvious.
2. **A leaked connection** — code doing `dataSource.getConnection()` without try-with-resources
   or a Spring-managed template. Outside Spring, nothing returns it.
3. **Long transactions** — a slow request holds its connection for the request's whole
   duration, so effective capacity is `pool size / average transaction duration × request
   rate`. A 30-second transaction in a 10-connection pool is 0.33 transactions per second of
   capacity.
4. **The pool is genuinely too small for the load** — which is the answer people jump to, and
   the one to check *last*, because raising the pool size to fix a nesting bug makes the
   database worse before it makes it better.

**Q6. A method annotated `@Transactional(readOnly = true)` mutates an entity and the change
is not persisted. No exception. Explain.** `ADVANCED`

`JpaTransactionManager` sets Hibernate's `FlushMode.MANUAL` for read-only transactions and
restores it on completion. With `MANUAL`, dirty state in the persistence context is never
flushed; at the end of the transaction the persistence context is closed and the changes are
discarded. No exception is thrown because nothing failed — the write was simply never
issued. The fix is to remove `readOnly` from a method that writes, and to be aware that this
is the opposite failure mode from the one on MySQL, where the same code *does* write,
because `Connection.setReadOnly` is a hint there.

**Q7. Your service writes to a remote system inside a `@Transactional` method. What are the
three concerns, and how do you address each?** `STAFF`

First, **the transaction holds locks across network I/O**, so the remote call's latency —
including every retry and timeout — becomes lock hold time. Address it by moving the call
outside the transaction. Second, **there is no distributed atomicity**, so a failure after
the remote call commits leaves the two systems inconsistent. Address it with an outbox row
in the same transaction, a compensating action, or a Saga. Third, **a retry of the request
re-does the remote call**, so the call must be idempotent — with an idempotency key, not by
hoping the gateway is. The uncomfortable conclusion, which is the honest one, is that once
a `@Transactional` method calls a remote system you are no longer writing a database method;
you are writing a distributed workflow, and the annotation is only covering the local part.

**Q8. Why does the presence of a rollback test transaction hide bugs rather than merely
"make tests fast"?** `STAFF`

Because it changes what is under test. The test exercises the write path and the flush but
never the commit, so anything that fails specifically at commit is untested: deferred
constraint violations, connection loss during commit, `readOnly` flush-mode discards,
partial commits from two transaction managers, and optimistic-lock failures that only
surface when the `UPDATE` actually reaches the database. It also runs every assertion
through the same persistence context, so a test can assert on uncommitted rows that no other
connection would ever see — which is why a "works in test, missing in production" report is
so common. The staff-level point: the test transaction is an *optimisation* that quietly
removes a class of test, and the honest fix is to keep it for the fast tests and add a real
commit slice for the ones that matter.

> **CHAPTER 6 SUMMARY**
>
> The failure modes in this chapter share one property: **none of them throws.** Self-
> invocation, `readOnly` flush-mode discards, a non-transactional caller, a test that never
> commits, and a read-modify-write race all produce a green build and corrupt data. The
> catalogue that matters is therefore short — self-invocation, the checked-exception
> rollback rule, `readOnly` on a writing method, two transaction managers, a missing caller
> boundary, transactions held across network I/O, and the rollback-wrapped test — and each
> has a specific diagnostic. The generalisable defences are: assert
> `isActualTransactionActive()` in the tests that cover writes, keep a small real-commit test
> slice, label every long-running transactional method, watch
> `pg_stat_activity WHERE state = 'idle in transaction'`, and remember that a transaction is
> a thread-bound fact, so the connection identity and the thread name are the two log fields
> that explain almost everything.

#### Further Reading

- [Spring Framework Reference — Declarative Transactions](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html) — the rollback-rule table, and the section on why self-invocation does not work.
- [`TransactionSynchronizationManager` Javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/support/TransactionSynchronizationManager.html) — the thread-bound resources, and the exact contract of `isActualTransactionActive()` and `registerSynchronization`.
- [Spring Framework Reference — ORM Support](https://docs.spring.io/spring-framework/reference/data-access/orm.html) — the `FlushMode` / `readOnly` interaction and shared-EntityManager behaviour, which is the mechanism behind the silent-drop bug.
- [Spring Boot Reference — Data Access](https://docs.spring.io/spring-boot/reference/data/sql.html) — the auto-configuration that creates exactly one `PlatformTransactionManager`, and what makes it back off.

## Chapter 7 — Beyond One Database

### 7.1 The Problem ACID Does Not Solve

A local transaction gives you four guarantees about **one** resource under **one**
coordinator. Distributed needs all four across several resources, several services, and
several processes — and the reason it is hard is not the algorithms, it is that the
guarantees are incompatible with availability and partitions.

```text
Service A                     Service B
   │                             │
   │ BEGIN  ──────────────────►  │ BEGIN
   │ UPDATE orders               │ UPDATE inventory
   │                             │
   │ ─── can we commit? ──────────│
   │                             │
   ▼                             ▼
A commits, B's network drops   B is stuck: it has a lock on inventory and
                               doesn't know whether A committed
```

A cannot commit alone (B may have failed) and cannot wait for B (B may be down). Every
distributed transaction algorithm is a different answer to that impossibility. This is the
same shape as the CAP argument and the same lesson: **you are choosing which guarantee to
spend**, and the choice is a product decision expressed as a technical one.

### 7.2 2PC and XA — The Blocked-Commit Failure Mode

Two-phase commit splits commit into a *prepare* phase (everyone writes to durable storage
and says "I can commit this") and a *commit* phase (everyone is told to commit).

```text
          COORDINATOR
         /     |      \
        ▼      ▼       ▼
   Resource A Resource B Resource C
   PREPARED  PREPARED  PREPARED   ◄── phase 1: everyone promises
        │      │       │
        ▼      ▼       ▼
   COMMITTED COMMITTED ???        ◄── phase 2: C is unreachable
   ────────────────────────────────────────────────────────────
   ⚠ A and B have committed. C is in-doubt, holding locks, until the
     coordinator runs RECOVERY. If the coordinator itself has lost its
     log, the outcome is a HEURISTIC: an arbitrary, human-resolved guess.
```

**The blocking problem:** between phase 1 and phase 2, every resource holds its locks and
cannot proceed. A participant that has prepared cannot unilaterally decide to abort, because
the coordinator may have already told others to commit. So it waits — and if the coordinator
is gone, it waits for recovery, and if the recovery log is gone too, a human resolves it.

**The cost of XA, concretely:**

| Cost | What it means in practice |
| --- | --- |
| A transaction coordinator | A stateful process (Atomikos, Bitronix, Narayana) that is now a **single point of failure** and a thing to operate |
| Log growth and disk | Coordinators log every decision; recovery on startup is a real operation |
| Lock holding across the network | The prepared resources hold locks for the duration of the slowest participant's response — the blocking failure above |
| Heuristic outcomes | After a coordinator crash, a resource may be in a state only the coordinator can resolve. Your data is now uncertain and a human has to decide |
| Driver and pool support | Every connection pool must be XA-capable, which excludes or complicates several common pools and several cloud databases |
| Throughput | Prepare/record round trips multiply latency; throughput drops well below what a simple commit does |

> **TRADE-OFF**
>
> 2PC/XA is **correct**, which is the whole argument for it: no compensating logic, no
> in-doubt states your application has to reason about, and the data model stays a single
> database. It costs a coordinator, a set of new failure modes (including ones a human must
> resolve), and a latency profile that is wrong for a synchronous request path. The flip
> condition: use it when the data genuinely must be atomic and the latency is acceptable —
> typically a low-throughput, high-value operation like a bank ledger posting, or a
> cross-organisation contract where neither side will accept eventual consistency. Do not
> use it for a checkout path or anything in the request's critical section. And note the
> asymmetry: it is far easier to say "we needed ACID here" than to remove it later, because
> removing it means writing compensating logic for code that was never designed to have any.

> **PRODUCTION SCENARIO**
>
> Problem: a payments service's database transaction coordinator died during a deploy.
> Investigation: on restart, 41 orders were `PENDING` with corresponding `PREPARED` XA
> resources on two databases and no decision recorded. Support found 9 of them had actually
> been charged and 32 had not.
> Root cause: a non-HA coordinator terminated between the prepare and commit phases, with
> no replicated decision log. The transactions were genuinely in-doubt.
> Solution: a human compared each order against the payment provider's records and issued
> the 9 charges and cancelled the 32. Two hours of manual work, plus a customer
> communication for the 9 who had been charged twice in the meantime.
> Prevention: an HA coordinator with a replicated decision log, *or* — the decision a staff
> engineer should push for — removing XA from the checkout path entirely in favour of an
> outbox and a reconciler. The cost of XA is not the happy path; it is the 41 orders that
> needed a human.

### 7.3 The Saga — Compensation Is Business Logic

A Saga is a local transaction per step, plus a **compensating action** per step, orchestrated
in sequence.

```text
CreateOrder saga:

  1. INSERT order (status=PENDING)         ── compensation: DELETE order (or CANCEL)
  2. reserve stock                        ── compensation: release stock
  3. charge card                          ── compensation: refund card     ◄── not "undo"
  4. book courier                         ── compensation: cancel booking
  5. UPDATE order (status=CONFIRMED)      ── no compensation needed

  Step 2 fails →
    run compensation for step 1 in reverse:  DELETE order
    → the system is consistent, but the *history* shows an order existed and was removed
```

Two orchestrations:

| Style | How it works | Strengths | Costs |
| --- | --- | --- | --- |
| **Choreography** | Each service reacts to an event; no central coordinator | No orchestration service to build or run; services stay autonomous; natural in an event-driven estate | The flow is implicit in a set of listeners — hard to see end-to-end, easy to create event cycles, and adding a step means changing N services |
| **Orchestration** | A saga coordinator calls each step and records progress | The flow is explicit, state is queryable, timeouts and compensations are one place, easy to add a step | A new stateful service with its own database, and it becomes the thing that has to be highly available |

```java
// Orchestration, as it looks with a durable saga framework
@Saga
public class CheckoutSaga {

    @Step(order = 1, compensation = "cancelOrder")
    public void createOrder(Order order) { orderService.create(order); }

    @Step(order = 2, compensation = "releaseStock")
    public void reserveStock(Order order) { inventoryService.reserve(order); }

    @Step(order = 3, compensation = "refundPayment", retriable = true)
    public void chargeCard(Order order) { paymentService.charge(order); }

    // ── compensations ──────────────────────────────────────────────
    public void refundPayment(Order order)  { paymentService.refund(order); }
    public void releaseStock(Order order)   { inventoryService.release(order); }
    public void cancelOrder(Order order)   { orderService.cancel(order, "saga failed"); }
}
```

> **MUST REMEMBER**
>
> **Compensation is not a rollback.** A database rollback restores the previous state. A
> compensating action is *new business logic* that happens to move the system back to a
> similar state, and it has all the properties of new business logic: it can fail, it can
> be rate-limited by a third party, it can be observed by users, it can cost money, and it
> is never free. Charging a card and then refunding it is not equivalent to not charging —
> the customer sees both entries on their statement, the provider takes a fee on the
> refund, and fraud-detection systems can flag the pair. The saga design question is not
> "how do I undo this" but "what is the compensating business action, what happens if IT
> fails, and is it idempotent?"

Three further properties that the term "Saga" hides:

- **There is no isolation.** Between two steps, other transactions can read
  partially-completed state. A Saga makes the system *eventually* consistent, not
  *intermediately* consistent, and a UI that reads between steps can show an order with no
  stock. Every Saga design has to answer "what does the user see mid-flight?"
- **Compensations must be idempotent and retriable.** The framework will retry them, and it
  will retry them after a timeout during which the first attempt may have succeeded.
- **The compensation is only as good as the last step.** A Saga that ends with a
  non-compensable step (a sent email, a charged card) is a Saga with a hole in it.

> **STAFF-LEVEL CONSIDERATION**
>
> A Saga is a decision to accept temporary inconsistency across services, and that decision
> belongs to the product, not to engineering. The questions that decide it are: what does
> the user see if this fails halfway; how long is the system allowed to be inconsistent;
> who absorbs the cost of a compensation; and what is the reconciliation story if a
> compensation itself fails. The wrong way to run this is to let a team pick a Saga because
> "2PC is hard." The right way is to make the product owner state which of those four
> answers they want, and then build the thing that provides it. Most teams discover that
> for the large majority of flows, an outbox plus a reconciler is both simpler and more
> honest than a full saga, and that a saga earns its complexity only for genuinely
> multi-step, genuinely compensable business flows.

### 7.4 The Transactional Outbox — The Durability Guarantee In-Process Events Cannot Give

This is the answer to the question Volume 1's events chapter ended on, and it is the single
most important pattern in this volume for anyone running microservices.

```text
THE PROBLEM
  service.commit();          ──►  publishEvent()   ──►  process dies   ──►  NO: message gone
  (two systems of record disagree forever, with no record of the disagreement)

THE OUTBOX
  BEGIN
    INSERT INTO orders       (..., status='CONFIRMED')
    INSERT INTO outbox       (id, aggregate, event_type, payload, created_at)
  COMMIT                                       ◄── ONE atomic commit, both rows

  ── later, by a relay ──
  SELECT * FROM outbox WHERE published_at IS NULL ORDER BY id LIMIT 100
  broker.publish(payload)
  UPDATE outbox SET published_at = now() WHERE id = ?
```

```java
@Service
public class OrderService {

    private final JdbcTemplate jdbc;
    private final OutboxRepository outbox;

    @Transactional
    public Order place(OrderRequest req) {
        Order order = repo.save(toOrder(req));
        outbox.save(OutboxMessage.of("order.confirmed", order.id(), toPayload(order)));
        return order;              // the event is now as durable as the order itself
    }
}
```

**What this buys, precisely:** the event and the state change are committed by the same
transaction, so they cannot disagree. A relay — a `@Scheduled` poller, a Postgres
`LISTEN/NOTIFY` trigger, or Debezium reading the log — publishes it, and can retry, and can
be monitored, and its backlog is a number on a dashboard.

**What it costs, precisely:**

| Cost | Detail |
| --- | --- |
| **Duplicate delivery** | The relay publishes, then crashes before `published_at` is set → the message is published twice. Consumers **must** be idempotent. This is not optional. |
| **Ordering** | Two events for the same aggregate can be published out of order. Fix with a per-aggregate sequence number the consumer checks, or a single-partition-per-aggregate topic. |
| **Relay lag** | Delivery is now "eventually, on the next poll" — a second or two. If the UI needs immediate, the outbox is the wrong tool. |
| **Schema** | The outbox table grows and needs pruning, and its payload format needs a versioning story. |
| **Ordering vs latency** | Streaming the log via CDC removes the poll latency and gives ordering, at the cost of a Debezium + Kafka + connector deployment. |

> **PRODUCTION RELEVANCE**
>
> The most common way an outbox goes wrong in production is **the payload was written but
> nothing ever reads it**, because the relay was deployed to staging and not to production,
> or its `@Scheduled` method is in a profile that is not active, or it silently failed. An
> outbox table with a `published_at IS NULL` row count of 0 is therefore a metric you
> should alert on, not a table you should assume is being drained. The second most common
> way is **duplicate consumption without idempotency**, which produces double-charges and
> duplicate emails that are individually minor and collectively a headline.

### 7.5 CDC — Change Data Capture

CDC reads the database's own change log (Postgres logical replication / `wal2json`, MySQL
binlog, SQL Server CDC) and publishes the changes to a broker, with no code change in the
application.

```text
                         ┌──────────────────────────────┐
   Application           │  Postgres write-ahead log   │
   INSERT INTO outbox ──►│  (WAL)                      │
                         └──────────────┬───────────────┘
                                        │ decoded
                                        ▼
                              Debezium connector
                                        │
                                        ▼
                                  Kafka topic
                                        │
                    ┌───────────────────┼───────────────────┐
                    ▼                   ▼                   ▼
             search index          analytics sink        replica

PROPERTIES
  OK: No polling; sub-second lag
  OK: Ordering is preserved per key (it is the WAL's order)
  OK: The application is completely unaware — no outbox table, no relay, no extra write
  NO: Couples every downstream to the DATABASE SCHEMA, not to an event contract
  NO: A schema change silently changes the event contract unless a connector is configured
  NO: Operational weight: a Debezium deployment, connector config, offset storage, and
    a schema registry if you want one
```

The staff-level comparison: **an outbox is an application-level contract; CDC is a
database-level one.** The outbox is more explicit — you choose the event type and the
payload, and the table is yours. CDC is less code and better ordering, and it means every
schema change is now a potential breaking change to every consumer. The pragmatic answer
most teams converge on: **CDC for replication, search indexing, and analytics, where the
data is a copy and latency matters; an outbox for anything a *business process* depends
on**, where the contract must be explicit and versioned.

### 7.6 Idempotency — The Prerequisite for All of It

Every mechanism above can deliver a message twice. The outbox relay can crash between
publish and mark. CDC's at-least-once semantics duplicate on rewind. A saga retries a
compensating action. A client retries a request that actually succeeded. So idempotency is
not one pattern among several — it is the **precondition** for the rest of them being safe.

```text
THE PROBLEM
  client ──POST /payments──►  service
  client times out at 900ms
  client ──POST /payments──►  service      ◄── the FIRST one is still running
                              → two charges
```

Three layers, in increasing order of strength:

**Layer 1 — an idempotency key, checked in the transaction.**

```java
@Transactional
public PaymentResult charge(ChargeRequest req, String idempotencyKey) {
    // The UNIQUE constraint is the lock. Two concurrent requests with the same key:
    // one inserts, the other gets a constraint violation and reads the winner's row.
    var existing = paymentRepo.findByIdempotencyKey(idempotencyKey);
    if (existing.isPresent()) {
        return existing.get().toResult();          // replay, do not re-charge
    }
    var result = gateway.charge(req);             // the slow, non-idempotent call
    paymentRepo.save(PaymentRecord.from(idempotencyKey, result));
    return result.toResult();
}
```

```sql
ALTER TABLE payment ADD CONSTRAINT uq_payment_idem UNIQUE (idempotency_key);
```

The key rules, and each one is a place teams get it wrong:

- **Derive the key from the client's intent, not from a timestamp.** A client-generated
  UUID per logical operation, carried in a header, survives retries. A server-generated key
  does not.
- **Scope the key.** Two different operations must not share a key space, and the same key
  must not be reusable by a different client — that is an authentication bug.
- **Store the result, not just a "seen" flag.** A retry that gets a "duplicate" response
  without the original result is a bad client experience; replaying the stored response is
  the whole point.
- **Keep the record for as long as the client might retry.** A week is common; deleting it
  "because the table is big" reopens the bug.

**Layer 2 — a dedup table for consumers.**

```sql
CREATE TABLE processed_message (
    consumer      VARCHAR(64)  NOT NULL,
    message_id    VARCHAR(64)  NOT NULL,
    processed_at  TIMESTAMP    NOT NULL,
    PRIMARY KEY (consumer, message_id)
);
```

```java
@Transactional
public void on(OrderConfirmedEvent e) {
    if (!dedupRepo.claim(e.consumer(), e.messageId())) {   // INSERT; false on conflict
        metrics.counter("order.duplicate").increment();
        return;
    }
    projectionRepo.update(e);          // only reached once per message id
}
```

The subtlety worth stating at staff level: **the dedup claim and the business effect must be
in the same transaction.** If you insert the claim and then the projection fails, you have
marked a message processed that was not — and the retry is dropped. Claim and effect
together, or use a state machine on the message itself.

**Layer 3 — natural idempotency in the operation itself.** `SET balance = balance - 100`
is idempotent; `SET balance = 90` is not. `INSERT ... ON CONFLICT DO NOTHING` with a natural
key is idempotent. `DELETE FROM invoice WHERE id = ?` is idempotent; "delete the oldest
invoice" is not. Prefer operations that are naturally idempotent where you can — it removes
a whole class of duplicate-handling code.

```java
// Naturally idempotent — replaying it changes nothing
@Modifying
@Query("UPDATE account SET balance = balance - :amount WHERE id = :id")
void debit(@Param("id") Long id, @Param("amount") BigDecimal amount);
```

> **INTERVIEW TRAP — "USE 2PC SO YOU DON'T NEED IDEMPOTENCY"**
>
> It is not entirely false, and it is entirely the wrong trade. 2PC does give you atomic
> commit, so you do not need an application-level dedup for the commit. But 2PC does not
> give you idempotency for **retries of the request itself** — a client that times out and
> retries has not been in the transaction at all, and 2PC's guarantees are about the
> transaction, not about the HTTP request. And 2PC's cost (a coordinator, in-doubt states,
> a human in the recovery path) is being spent to avoid writing a unique constraint and an
> insert-if-absent. The senior answer is that idempotency is a *client-facing* requirement
> that sits above the transaction layer, so choosing 2PC to satisfy it is a category error,
> and the correct primitive is an idempotency key with a unique constraint.

### 7.7 The Decision You Are Actually Making

> **MUST REMEMBER**
>
> The distributed-transaction question is almost never "which algorithm should we use." It
> is **"which inconsistency can this business tolerate, and for how long."** And the honest
> answer is that this is a product decision that engineering can only execute, not make.
>
> The way to run it in a design review: put the specific inconsistency on the table with a
> number attached — "an order can exist for up to 5 seconds with no inventory reserved, and
> the UI will show it as 'processing' for that period" — and get an explicit answer from the
> product owner. That answer determines the mechanism. If the answer is "zero, ever," you
> need XA or a single database, and you should say what that costs. If it is "a few
> seconds," you need an outbox and a consumer. If it is "a few minutes, and a human
> reconciles," you need a saga and a repair UI. **Do not let the architecture be decided by
> whichever engineer is most comfortable with the mechanism.**

#### Common Mistakes

- Reaching for XA because "distributed transactions need 2PC," without first asking whether
  the consistency requirement justifies a transaction coordinator and its in-doubt states.
- Designing a saga whose compensations are not idempotent, or whose compensation *is* the
  real business action — a refund is not a rollback, and it can fail independently.
- Building an outbox and never monitoring `published_at IS NULL`, so the relay stops and
  nobody notices for a week.
- Using CDC for a business-critical event contract and then shipping a breaking column
  rename, which changes the contract for every consumer at once.
- Deleting idempotency keys "because the table is large," reopening the double-charge bug
  exactly when a client retry finally comes.
- Putting a dedup claim and the business effect in different transactions, so a failure
  after the claim permanently drops the message.
- Believing 2PC removes the need for idempotency. It removes the need for dedup *within* the
  transaction; it does nothing about request-level retries.

#### Interview Questions — Distributed Transactions

**Q1. Why can't a system with two databases just use two local transactions and commit them
one after the other?** `TRICKY`

Because the first commit makes the state visible and durable before the second is attempted.
If the second fails, you have a partial commit with no mechanism to undo the first — and
rolling it back by hand is a compensation, which is exactly the thing you were trying to
avoid. The order does not help: whichever goes second can fail. The only way to get
all-or-nothing without compensating logic is a protocol in which every participant commits
or none does, which requires coordination — 2PC or a saga. The trade is not "atomic vs not"
but "coordination and its failure modes vs compensation and its business-logic cost."

**Q2. Explain the blocking failure mode of 2PC.** `TRICKY`

Between the prepare phase and the commit phase, every resource has promised to commit and
holds its locks. A prepared participant cannot unilaterally abort, because the coordinator
may already have told other participants to commit — so it must wait. If the coordinator is
unavailable, the participant waits for recovery; if the coordinator's log is also lost, the
transaction is *in-doubt* and a human must resolve it by inspecting the participants. The
practical consequence is that a coordinator outage produces stuck transactions holding
locks, and the resolution is manual. That is why XA deployments need a highly available
coordinator with a replicated decision log — which is the operational cost people do not
price in when they propose XA for an order-processing path.

**Q3. What is the difference between a compensating action and a rollback?** `STAFF`

A rollback restores the previous state and is guaranteed by the storage engine. A
compensating action is new business logic that happens to bring the system to a similar
state: it can fail, it can be rejected by a third party, it is visible to users, it can
cost money, and it is not free. Charging a card and refunding it produces two statement
entries, a processing fee, and possibly a fraud flag — none of which is true of a rollback.
So compensation has to be designed, tested, made idempotent, monitored, and given a retry
and a manual repair path. That is a categorically larger commitment than ACID, which is
exactly why 2PC exists and exactly why choosing it is not a step backwards.

**Q4. Choreography vs orchestration for a Saga — when would you pick each?** `STAFF`

Choreography when the number of steps is small and stable, the services are already
event-driven, and a central orchestrator would be a new thing to build, deploy and make
highly available. Its cost is that the flow is implicit — it lives in a set of listeners
across N services, and adding a step means touching all of them, and a cyclic event is
easy to create. Orchestration when the flow has many steps, has timeouts and retries and
compensations, has a business-meaningful state, or needs to be queryable by support ("where
is this order?"). Its cost is a new stateful service with its own database, which is itself
a distributed system to operate. Most teams end up with both: choreography inside a bounded
context, orchestration across contexts.

**Q5. Walk me through the transactional outbox and what it guarantees.** `TRICKY`

You write the domain change and an outbox row — the event, its type, its payload, its
aggregate id — in the *same* local transaction. Both are committed or neither is, so the
event and the state change cannot disagree. A relay then reads unpublished rows and
publishes them to a broker, marking them published. The guarantee is **atomicity of the
state change and the intent to publish**, plus **at-least-once delivery with a retry**, not
exactly-once — so consumers must be idempotent, and ordering per aggregate needs a sequence
number. The costs are duplicate delivery, relay lag, an extra table to prune, and a payload
versioning story.

**Q6. When would you use CDC instead of an outbox?** `ADVANCED`

When the downstream is a *copy* rather than a business process participant: search
indexing, a read replica, analytics, a cache warm. There, an application-level outbox is
unnecessary ceremony — the change log already has the data, it is in order, and CDC removes
the poll latency. For a **business-critical** event contract, prefer the outbox, because
the contract becomes explicit and versioned (an event type and a payload you own) rather
than a de facto consequence of the table schema. That last point is the one to make: CDC
couples every consumer to the database schema, so an innocuous column rename is a breaking
change for all of them.

**Q7. A client retries a `POST /payments` after a timeout and the customer is charged
twice. What is the fix, and what are the four things teams get wrong about it?** `SCENARIO`

An idempotency key: the client generates a UUID per logical operation, sends it in a
header, and the server stores it under a `UNIQUE` constraint inside the same transaction as
the charge, replaying the stored result on a duplicate instead of re-charging. The four
mistakes: (1) generating the key **server-side** per request, so a retry gets a new key and
is not deduplicated; (2) not making it a `UNIQUE` constraint, so two concurrent retries both
pass the "have I seen this?" check; (3) storing a "seen" flag rather than the **result**, so
the retry gets an error instead of the original response; and (4) expiring the keys too
aggressively, so a client retry after a month is charged again.

**Q8. A consumer's dedup table has a row, but the business effect never happened. What went
wrong?** `ADVANCED`

The claim and the effect were in different transactions. The consumer inserted the dedup
row, then the projection failed and the transaction rolled back — but if the claim was
committed separately, the message is now marked processed and the retry is dropped, so the
effect is lost permanently and silently. The fix is to make the claim and the business
effect a single atomic unit, or to model the message's own state machine
(`RECEIVED → PROCESSING → DONE`) so a failure leaves it in a state that is retried rather
than in a state that says "handled." A third option is a transactional inbox in the same
transaction as the effect, which is the same idea as the outbox on the consuming side.

**Q9. Your team is considering XA for the order-processing path. What questions do you
ask?** `STAFF`

What is the actual consistency requirement, in seconds — because "atomic" is not a
requirement, "the customer must never be charged for an order that does not exist" is, and
the second might be satisfiable with an outbox and a reconciler. Who operates the
transaction coordinator, and what is its availability target — because it becomes a
single point of failure. What happens in the in-doubt case, and who resolves it at 3am.
What is the latency budget, given that prepare and commit round trips multiply the critical
section. And what is the migration path away from XA later, given that removing it means
writing compensating logic for code that was never designed to have any. If those answers
are unsatisfiable, the right design is a single database boundary, not XA across services.

**Q10. Is the transactional outbox just a pattern for exactly-once delivery?** `SCENARIO`

No, and conflating them is the mistake. The outbox gives you atomicity between the state
change and the *intent to publish*, and at-least-once delivery from a relay that retries.
Exactly-once delivery is not achievable across a broker and a consumer that cannot
participate in the same transaction, and the honest statement is: the message may arrive
twice, in any order relative to other messages for the same aggregate, and after any
restart. What the outbox *plus* an idempotent consumer gives you is **effectively-once
processing**, which is the property anyone actually needs. Every design that claims
exactly-once is really claiming this, and the difference matters because it tells you where
the deduplication has to live.

> **CHAPTER 7 SUMMARY**
>
> ACID does not span services, and the reason is structural rather than algorithmic — a
> participant that has prepared cannot abort without risking an inconsistent commit, which
> is why 2PC blocks and why XA costs a coordinator, a replicated decision log, and a human in
> the in-doubt path. The practical alternatives are Sagas, where compensation is *business
> logic* that can fail and cost money rather than a rollback; the transactional outbox,
> which makes the state change and the intent to publish a single atomic commit and is
> exactly the durability guarantee in-process events cannot give; and CDC, which is better
> for copies and worse for contracts. Underneath all of them is idempotency, because every
> one of these mechanisms can deliver twice. And the decision in front of you is not an
> algorithm — it is "which inconsistency can this business tolerate, and for how long," which
> is a product question engineering executes and should not answer alone.

#### Further Reading

- [Microservices Patterns — Saga](https://microservices.io/patterns/data/saga.html) — the canonical treatment, with the failure modes of each compensating step spelled out.
- [Microservices Patterns — Transactional Outbox](https://microservices.io/patterns/data/transactional-outbox.html) — the messaging problem, the table schema, and the relay, from the pattern that made the "publish after commit" race a solved problem.
- [Microservices Patterns — Messaging](https://microservices.io/patterns/communication-style/messaging.html) — the broker side: duplication, ordering, and what the message broker does and does not promise.
- [Microservices Patterns (book)](https://www.manning.com/books/microservices-patterns) — the book-length treatment, with the reliability patterns (retry, circuit breaker, bulkhead, saga) in one place.
- [Debezium Documentation](https://debezium.io/documentation/reference/stable/) — the CDC reference, including how the change log is decoded and what the connector guarantees.

---

### End of Volume 4

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Name the three interfaces in Spring's transaction abstraction and say which one owns
  policy, which owns runtime state, and which owns the mechanism
- Explain why `JpaTransactionManager` is not a JDBC manager, and what `setDataSource` does
  and does not give you
- List the five situations in which `@Transactional` is silently a no-op, and say how you
  would prove at runtime that a transaction is actually active
- State the rollback rule exactly, and explain the production consequence of a method
  declaring a checked exception
- Give the "no existing transaction / existing transaction" behaviour for all seven
  propagation levels, and explain why `REQUIRES_NEW` costs a second connection and `NESTED`
  requires a savepoint
- Explain why no standard isolation level prevents a lost update, and describe both fixes
  — `@Version` and `SELECT ... FOR UPDATE` — including what each costs
- List four scenarios where `TransactionTemplate` is the correct tool instead of the
  annotation, and explain what `afterCommit` can and cannot do
- Diagnose `Connection is not available, request timed out after 30000ms` in the right
  order, and name the four reasons a test passing tells you nothing about commit behaviour
- Explain the blocking failure mode of 2PC, and the difference between a compensating
  action and a rollback
- State what the transactional outbox guarantees, what it does not, and why idempotency is
  the precondition for all of it

### Coming in Volume 5 — Spring MVC & the Web Layer

Volume 4 was about the layer under the web stack. Volume 5 is the web stack itself: the
`DispatcherServlet` request lifecycle end to end, how handler resolution and argument
resolution actually work, data binding and validation, the filter chain and its ordering,
`@ControllerAdvice` and the `ExceptionHandler` resolution algorithm, content negotiation,
async and `DeferredResult`, file uploads, and the parts of MVC that quietly determine your
latency profile. The thread model matters more than it used to, because it is the same
thread model that decided whether your transaction was on the same thread as your request —
and the same reason an `@Async` call leaves a transaction behind.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### The Transaction Abstraction

**D1. Is "one transaction manager per data source, and never more than one active per
thread" a rule you would enforce, or a convention you would document?**

Both, in that order of strength. It follows from the thread binding: a thread has one bound
resource per manager type, so two active transactions on one thread means the first is
either suspended — competing for a second pool slot — or lost. That is a mechanism, not a
preference, which is why it is worth a test rather than a wiki page. The enforcement is a
startup assertion that counts `PlatformTransactionManager` beans and fails if there is more
than one without every `@Transactional` naming a manager. The convention is the fallback for
teams who cannot ship the assertion this week, and it should be written as "every
`@Transactional` carries `value`" rather than "be careful," because the second is not
checkable.

**P1. A teammate adds a read-replica `DataSource` and a second transaction manager. CI is
green. Production starts returning 500s on roughly half the write endpoints. What happened?**

`NoUniqueBeanDefinitionException` for `PlatformTransactionManager`, raised when the
transaction advice first runs. Boot's auto-configuration backs off once there are two
`DataSource` beans, and every `@Transactional` without an explicit `value` becomes
ambiguous. It is a runtime failure rather than a startup failure, so the application
deploys cleanly and the first requests to any un-annotated transactional method throw. The
fix is to name the manager on every `@Transactional` — including the ones that unambiguously
use the primary, so the convention is uniform — and to add the startup assertion so the next
data source does not reproduce it.

**T1. A `DataSourceTransactionManager` transaction is active on the current thread. You call
`DataSourceUtils.getConnection(dataSource)`. What exactly do you get?**

The thread-bound connection that the transaction is already using, not a new one from the
pool. `DataSourceUtils` checks its `ThreadLocal` holder first and returns the bound
connection without incrementing the pool's active count. That is why two `JdbcTemplate`s
against the same `DataSource` inside one transaction share one physical connection and are
therefore atomic together — and why a `DataSourceUtils.releaseConnection` on a bound
connection is a no-op, because the transaction owns the lifecycle, not the caller.

**S1. A PR adds a second `@Transactional` method to a class annotated
`@Transactional(propagation = REQUIRES_NEW)`. What is the review comment?**

That the new method silently gets `REQUIRED` and a default timeout, because method-level
attributes do not merge with class-level ones — the method-level annotation is the complete
attribute set. So the method now joins the caller's transaction instead of getting an
independent one, and it inherits the outer timeout rather than the class's. Either give it
the full attribute set it needs or move it to a class where `REQUIRED` is what you meant;
but the review comment is the important part, because this is invisible at the call site and
shows up as an "intermittent" partial commit.

**D2. Someone proposes running `JpaTransactionManager` and `DataSourceTransactionManager`
side by side so that Hibernate and the hand-written SQL both get transactions. What is the
actual risk, and what is the right design?**

The risk is a **partial commit with no exception**: the JPA transaction commits its flush,
and the JDBC transaction commits separately on a second connection, and a failure, a process
kill, or a retry between the two leaves the tables inconsistent with no error anywhere. It
also makes every `@Transactional` ambiguous, so it fails at the first un-annotated call site
at runtime. The right design is one manager — `JpaTransactionManager` with
`setDataSource(dataSource)` — so the JPA transaction and the JDBC access share one
connection and one commit. If there is genuinely no way to run the native SQL through the
same connection, then the real answer is that the data belongs in one place, and the second
access path is a design problem rather than a transaction-manager problem.

**P2. A nightly job writes 4,000 rows inside one `@Transactional` method and takes 90
seconds. What is the production risk beyond slowness?**

Three. Row locks are held for the full 90 seconds, so any concurrent writer to those rows
blocks or times out. Under MVCC the transaction also holds a snapshot for 90 seconds, which
prevents dead row versions from being reclaimed and inflates bloat — on Postgres this shows
up as a vacuum falling behind. And if the job fails at row 3,900, the whole thing rolls back
and all 90 seconds are wasted. The fix is per-item transactions (a `TransactionTemplate`
inside the loop, or `NESTED` where supported), which turns one 90-second all-or-nothing
transaction into 4,000 short ones, with partial progress that is a deliberate and documented
business decision.

### `@Transactional` Mechanics

**T2. A `@Transactional` method on class `A` is called from a method on the same class
`A`. Does the inner method's `@Transactional` apply?**

No, unless the object was obtained through its proxy. `this.inner()` dispatches to the
target instance, so the proxy's advice never runs. That holds regardless of the propagation
value — `REQUIRED`, `REQUIRES_NEW` and `NESTED` are all ignored, because no advice runs at
all. The only reliable fixes are to move the inner method to a separate bean or to inject
self through `@Lazy` and call the proxy.

**T3. A `@Transactional` method throws a checked `IOException` and there is no
`rollbackFor`. What is the outcome?**

The transaction **commits**. The default rule is "roll back on `RuntimeException` and
`Error`," inherited from EJB CMMT, so anything checked is treated as an expected, handled
condition. Everything the method wrote before the throw is durable. This is the single most
common source of silent partial commits in Spring, and it is worth stating as the answer
with the fix attached — `@Transactional(rollbackFor = Exception.class)`, or making the
exception extend `RuntimeException`.

**D3. A team wants to guarantee that no `@Transactional` method is ever a silent no-op. What
would you actually ship?**

Three layers, in increasing order of value. First, a shared test base class that asserts
`TransactionSynchronizationManager.isActualTransactionActive()` at the top of the write
paths — one line, and it turns the most common silent bug from a production discovery into a
red build. Second, an ArchUnit rule that `@Transactional` appears only on `@Service` classes
and on public non-final methods, so the proxy-requirement violations are caught at compile
check time rather than in review. Third, a startup or smoke test that reflects over every
`@Transactional` method and confirms the bean is actually proxied. The general point is that
the "annotation is inert" class of bug is mechanically detectable, and a team that detects
it once with a rule stops having this class of incident permanently.

**P3. A team adds `readOnly = true` to 200 read methods "for performance." Two weeks later
a bug report says an update silently did nothing. What is the most likely mechanism?**

Hibernate's `FlushMode`. `JpaTransactionManager` sets `FlushMode.MANUAL` for a read-only
transaction and restores it on completion, so a dirty entity in the persistence context is
never flushed — at the end of the transaction the context closes and the change is discarded
with no exception. The method looked correct because the entity *was* mutated in memory, and
a test with an open persistence context can see the mutated state. The fix is that a method
which writes is not read-only: remove the flag from the few methods that mutate, and leave
it on the many that genuinely do not. The honest framing for the team is that `readOnly` is
an optimisation and a documentation signal, not a safety mechanism — on MySQL and H2 it
enforces nothing at all.

**S2. A reviewer sees `@Transactional` on a method that calls a `RestTemplate`. What should
they ask?**

How long the remote call takes, what its timeout and retry policy are, and whether the
transaction is held across it. A `@Transactional` method calling a remote service holds its
row locks and its MVCC snapshot for the duration of the network call plus every retry — which
is how a 900ms p99 call becomes a 30-second lock hold at p99.9. The follow-up: what is the
design if the remote call succeeds and the local commit then fails, because that is a
distributed transaction and the answer is an outbox or a compensating action, not a retry.
The reviewer should also confirm the method is not looping, since a loop inside a
transaction is the same problem in a different shape.

**T4. `TransactionSynchronizationManager.isActualTransactionActive()` returns `false` inside
a method annotated `@Transactional`. Name the likely causes in order.**

A `SUPPORTS`-propagated method on a thread with no transaction — legitimately, because
`SUPPORTS` does not create one. A `NEVER` or `NOT_SUPPORTED` method, for the same reason.
Self-invocation, so no proxy advice ran. The object was constructed with `new`, so it was
never wrapped. Or the class is not a Spring-managed bean. The important point for the
interview is that the boolean cannot distinguish "no transaction by design" from "no
transaction by accident" — the first two cases are correct behaviour and the rest are bugs,
so an assertion in a test needs to be paired with knowing which propagation the method uses.

**D4. Is a class-level `@Transactional` a reasonable default for a service, or a
convenience that hides intent?**

It is defensible as a default and it is a trap as a habit. For a service whose every method
is genuinely one unit of work against the same store, a class-level annotation is honest and
readable. The problems are that it silently applies `REQUIRED` to methods that should be
read-only, so the `readOnly` optimisation is never available and read-modify-write races
become invisible; and that any method-level annotation *replaces* it wholesale, resetting
propagation and timeout to defaults. So the staff-level position is: class-level for the
small, uniformly-transactional services, explicit per method for anything that reads, and
never both without a comment saying which attributes you meant to keep.

**T5. `@Transactional` is on a `private` method, and the class is CGLIB-proxied. What
happens?**

CGLIB generates a subclass and overrides the *interceptable* methods — public and protected
non-final ones. A `private` method is not inherited-visible, so no override is generated and
no advice runs. The method executes and its annotation is inert. A `final` method behaves the
same way for CGLIB, and a `static` method is not an instance method at all. In all three
cases the code works, the annotation is present, and there is no warning.

### Propagation

**D5. `REQUIRES_NEW` needs a second connection. Is "size the pool for the nesting depth"
an acceptable answer?**

It is the second-best answer and it should be stated as such. Pool demand is
`peak concurrency × max nesting depth`, so a pool of 10 with one `REQUIRES_NEW` per request
supports 5 concurrent requests, and the sixth blocks until `connectionTimeout` fires. Sizing
for that is legitimate — but it converts a code bug into a permanent capacity tax, it makes
the pool larger than the database's own connection limit, and it hides the nesting from
everyone who did not read the PR. The first answer is to remove the nesting, because
`REQUIRES_NEW` is usually reached for by accident. The honest staff position is: size the
pool for the depth you actually have, and treat any depth greater than 1 as a design review
item.

**P4. Users report intermittent 500s. The log shows
`HikariPool-1 - Connection is not available, request timed out after 30000ms`, and the
database is at 8% CPU. What is the first thing you check?**

Whether any `REQUIRES_NEW` or deep self-invocation is on the request path. Every nesting
holds two connections, so at N pool size you get N/2 concurrent requests, and the rest time
out. It is the most common and least visible cause because the code looks ordinary. Second
is a leaked connection from code doing `dataSource.getConnection()` outside Spring. Third
is long transactions — a 30-second transaction in a 10-connection pool is 0.33 transactions
per second of capacity. The pool being too small is the last answer to try, because raising
it to paper over a nesting bug makes the database worse before it makes the application
better.

**T6. A `REQUIRES_NEW` inner transaction commits successfully, and then the outer
transaction rolls back. What is the state of the data?** `SCENARIO`

The inner transaction's writes are **committed and permanent**; only the outer work is
undone. This is the defining property of `REQUIRES_NEW` and the reason it is a semantic
decision rather than a retry mechanism. In JPA it is worse than that: the inner transaction
runs on a second connection and therefore a second persistence context, so any entity it
loads is a *different instance* from the one the outer transaction holds, and a mutation to
an inner entity is invisible to the outer flush. That is the behaviour that makes
`REQUIRES_NEW` deeply confusing under Hibernate, and the reason to check
`isNewTransaction()` before shipping it.

**S3. A PR changes an inner `@Transactional` method from `REQUIRED` to `REQUIRES_NEW`
"to make sure it always commits." What should the review check?**

Four things, in this order. How many callers invoke it on a request path — each one now
needs a second pool connection, and the blast radius is every caller, not just the author's.
Whether the method is called in a loop, which multiplies the cost. Whether anything under
JPA reads entities inside it, since the second connection means a second persistence context
and broken first-level-cache coherence. And whether "always commits" is actually the
requirement, or whether the real need is "an audit row survives a rollback" — which an
outbox row in the *outer* transaction delivers with one connection and without a commit
that contradicts the business data if the business work fails.

**D6. `NESTED` gives partial rollback. Why is it so rarely used correctly?**

Because it has three preconditions that are invisible at the call site: the transaction
manager must support savepoints, the driver and database must implement them, and there
must already be an existing transaction to nest inside. Where savepoints are unavailable —
notably under some `JpaTransactionManager`/Hibernate configurations — Spring falls back to a
fresh transaction, which means the "partial rollback" is actually a full independent commit
with none of the atomicity the code was designed around, and there is no log line. The
design point is that `NESTED` is correct for exactly one shape — "roll back this part, let
the caller decide, keep the rest" — and it should be used there deliberately and verified
with `TransactionStatus.hasSavepoint()`, not sprinkled around as an error-handling
mechanism.

**T7. An inner participating method throws and the outer method catches it and returns
normally. What happens at the end?**

The transaction is already marked rollback-only, so the commit throws
`UnexpectedRollbackException: Transaction rolled back because it has been marked as
rollback-only`. The inner interceptor called `setRollbackOnly()` on the shared
`TransactionStatus` as the exception propagated; catching it removed the exception, not the
mark. This is why "catch and continue" inside a transactional call is usually wrong: the
inner work *is* rolled back regardless of what the outer code believes.

**D7. When is `MANDATORY` or `NEVER` the right annotation for production code, given
neither is used in most codebases?**

`MANDATORY` when a method's correctness genuinely depends on being inside someone else's
transaction — a method that writes an audit row which must be atomic with the business
change. It converts a latent design violation into an immediate, obvious failure at the
specific call site, and it fails in the test rather than in production. `NEVER` when a
method must not inherit an ambient transaction — a long read-only computation that would
otherwise hold the caller's write locks for its whole duration. Both are cheap, both are
enforced by the framework, and both replace a comment that nothing verifies.

### Isolation & Concurrency

**D8. A developer proposes setting `SERIALIZABLE` globally "to be safe." What is your
response?**

That it pays a throughput cost on every path — including health checks and reporting
queries that need nothing — and that on PostgreSQL it converts a rare correctness bug into
frequent `40001` aborts, which means a retry loop is now a hard requirement rather than an
optimisation. I would ask what the actual defect is: if it is a lost update, the answer is
`@Version` or `SELECT ... FOR UPDATE` and no isolation change at all; if it is a
read-modify-write spanning two statements, the answer is a single atomic statement. The
general principle to state is that isolation is a per-operation decision made on the method
that needs it, and a global setting is a way of not having to make that decision.

**T8. Two transactions both read a balance of 100, and each writes a different value back.
What happens at `READ COMMITTED`, at `REPEATABLE READ`, and at `SERIALIZABLE`?**

At `READ COMMITTED` both read 100, both write, and the second write wins — the classic lost
update, and no level prevents it because it is a read-modify-write race. At `REPEATABLE
READ` on PostgreSQL the same thing happens, because repeatable read prevents a *row* from
changing under you but does not make a computed write safe. At `SERIALIZABLE` on PostgreSQL
one transaction is **aborted** with `40001 could not serialize access due to concurrent
update`, which is better than corruption but requires a retry; on MySQL/InnoDB it instead
waits on a next-key lock and the second transaction re-reads the committed value, so its
write is correct — but that is a side effect of locking, not of the level being "safer."

**P5. A service intermittently returns stale prices. Two readers see different values for
the same row within one request, and the team has moved to `REPEATABLE READ` to "fix" it.
What is the better diagnosis?**

First, find out *why* there are two reads — a replica with replication lag is the most
common cause, and `READ_COMMITTED` on the replica will legitimately return older rows. That
is a consistency-topology problem, not an isolation problem. Second, if the two reads are on
the primary, then the cause is that a multi-statement read-modify-write under
`READ COMMITTED` has per-statement snapshots, and the fix is to make it one statement. Raising
isolation would hide the symptom at the cost of a long-lived snapshot — which, under MVCC,
blocks space reclamation and makes the endpoint a database health problem.

**D9. Optimistic locking with `@Version`, or pessimistic with `SELECT ... FOR UPDATE`?
How do you decide?**

By conflict rate and by the shape of the invariant. Optimistic wins by default: no waiting,
no locks, and the version check is in the `UPDATE ... WHERE version = ?` so it is atomic
under any isolation level. Its cost is a retry loop that has to be written honestly and a
policy for what happens when the retry budget is exhausted. Pessimistic wins when the
conflict rate is high enough that most optimistic attempts fail, when the invariant spans
multiple rows and cannot be expressed as a version column, or when you need
precondition-checking semantics. Its cost is a wait rather than a fast failure, lock
timeouts under load, and deadlocks as a normal occurrence that the design must handle with
bounded jittered retry. If you cannot say what your conflict rate is, measure it before
choosing — the answer changes the recommendation more than anything else.

**T9. A deadlock occurs and the code catches the exception and retries inside the same
`@Transactional` method. What happens?**

Nothing changes, and the eventual commit still fails. The retry wrapper is inside the
transaction boundary, so the retry re-runs the same doomed transaction; each attempt fails
on the same lock, and if it somehow succeeded the commit would throw
`UnexpectedRollbackException` because the transaction is already marked rollback-only. The
retry must wrap a call to a **separate** `@Transactional` method, so each attempt is a
genuinely new transaction with a fresh lock acquisition, and the backoff must be jittered —
a fixed backoff means every thread retries in lockstep and deadlocks again.

**S4. A PR adds `@Version` to an entity. What should the reviewer ask about beyond the
entity itself?**

About every caller. Adding `@Version` means writes can now fail with
`ObjectOptimisticLockingFailureException`, so the review needs to establish which write paths
have a retry policy, which do not, and what each of them does when the budget is exhausted —
return an error, queue it, or fall back to pessimistic locking. The second question is
whether this entity is a hot counter, where the conflict rate will make optimistic retry
mostly wasted work and the pessimistic design is correct from the start. And the third is
whether the `@Version` column is nullable and defaulted in the migration, because an
existing table with a null version defeats the whole mechanism silently.

**D10. A batch job locks 500 rows per batch and deadlocks against another instance of
itself about 200 times an hour. What is the structural fix?**

Lock ordering. If rows are locked in query-return order, which is not stable across runs,
two concurrent instances will eventually lock the same pair in opposite orders and deadlock
structurally. Sorting the identifiers before locking removes the cycle — the lock graph
becomes a total order and no cycle can form. The two other changes are required regardless:
a bounded, jittered retry around the whole transaction, because deadlock detection is a
safety net rather than a strategy; and a distributed lock so only one instance of a
reconciliation-style job runs at a time, which removes the concurrency that produces the
deadlocks in the first place. Shortening the transactions per batch reduces the window
further, but it is the least effective of the three.

### Declarative vs Programmatic

**T10. You need an audit row that survives a rollback of the business transaction. Compare
`REQUIRES_NEW`, `TransactionTemplate` with `PROPAGATION_REQUIRES_NEW`, and an outbox
row.**

They are the same thing for the first two — `TransactionTemplate` with that propagation is
exactly what the annotation compiles to — and both give an independent commit at the cost of
a second connection and, under JPA, a second persistence context. The outbox row is written
in the *same* transaction as the business change, so it rolls back with it; what survives is
the *intent to publish*, and a relay delivers it later. So the outbox answers a different
question: it guarantees "this event will be published" rather than "this row exists even
though the work failed." If the requirement is a record of a *committed* outcome, both work;
if it is a record of an *attempt*, neither is right and you want an attempt log written before
the work starts.

**D11. When is `TransactionTemplate` the correct tool, and how do you stop it becoming the
default?** `STAFF`

It is correct when the boundary depends on something the annotation cannot see: a runtime
condition, a loop iteration, code you do not own, a per-call propagation decision, or a need
to hold the `TransactionStatus` in order to `setRollbackOnly()` from a side path. It is the
wrong default because it loses greppability — `@Transactional` is searchable, and a codebase
that migrates to templates wholesale gets reverted within a release. The stopping rule I
would write down: declarative by default, and the template is introduced at a specific call
site with a reason. It should show up in review as "this boundary is conditional and here is
why", never as "this service is more explicit".

**P6. A method calls `TransactionSynchronizationManager.registerSynchronization(...)` and
the application throws `IllegalStateException: Transaction synchronization is not active`.
What is the cause and what is the better design?**

The method ran with no active transaction, so there is nothing to register against. The
cause is almost always a caller that was not transactional — a `@Scheduled` method, a
listener, a non-proxied instance, or a path where a `NOT_SUPPORTED`/`NEVER` method was
involved. The better design depends on intent: if the work genuinely must be inside a
transaction, annotate the caller; if the hook is optional, use
`@TransactionalEventListener(..., fallbackExecution = true)`, which runs immediately when
there is no transaction rather than throwing. The general lesson is the same as with
`@TransactionalEventListener`: an in-process transaction hook either binds to a transaction
or silently does nothing, and in this case it fails loudly, which is the better of the two.

**S5. A PR adds an `afterCommit` block that calls a payment gateway. What should the review
say?**

That an exception in `afterCommit` cannot roll anything back, because the transaction has
already committed — so the failure mode is "the data is written and the side effect did not
happen," which is a lost-effect problem, not a rollback problem. And it compounds: if the
method is also `@Async`, the exception is swallowed by the default
`AsyncUncaughtExceptionHandler`, so it is not even logged. If the side effect is one the
business depends on, the answer is a row in an outbox table written inside the same
transaction plus a relay with retry and deduplication. `afterCommit` is right for "tell the
cache" and wrong for "charge the card."

**D12. A developer wants `afterCommit` to send an email, and someone proposes "just
rethrow so it fails the request." What is wrong with that, and what would you build?**
`STAFF`

Nothing is wrong with rethrowing in the sense that it does not work: the transaction has
already committed, the rethrow propagates to the caller, the caller returns a 500, and the
database still contains the order. So the user is told the operation failed when it
succeeded, which is a data-integrity problem in the *interaction* rather than the database —
and worse, a retry creates a second order. The honest design is the outbox: write an
outbox row inside the transaction, relay it with a retry, and make the relay idempotent on
the message id. The user's HTTP response then reflects what actually happened, and the email
eventually arrives, or is visible on a dashboard as undelivered. That is the difference
between an event and a promise.

### Failure Modes & Diagnosis

**P7. Everything passes in CI. In production, a downstream service reports it never
received an event for 2% of orders. What is the most likely cause?**

A test transaction that rolls back. If the integration tests are annotated
`@Transactional` at the class level, every test runs inside a transaction that is rolled
back at the end and never committed — so the publish path, the commit path, and anything
that depends on durability are all untested. The specific mechanisms that hide here: a
`@Transactional(readOnly = true)` flush-mode discard, a partial commit from two transaction
managers, a constraint that is only enforced at commit, and an optimistic-lock failure that
only surfaces when the `UPDATE` reaches the database. The fix is a dedicated test slice with
no rollback transaction, against a real database via Testcontainers, that writes and then
reads back through a separate path.

**T11. An application has two `PlatformTransactionManager` beans and one `@Transactional`
method names a manager that does not exist. What happens?**

A `NoSuchBeanDefinitionException` at the first invocation, with the message naming the
missing bean. This is the useful failure: the naming convention was applied, and it caught a
typo at the first call rather than silently using the wrong manager. It is worth contrasting
with the un-annotated case, which fails with `NoUniqueBeanDefinitionException` listing both
candidates — also a runtime failure, but one that tells you nothing about which call site is
wrong.

**D13. A service makes a remote HTTP call inside a `@Transactional` method. What are the
three concerns, and what is the correct shape?** `STAFF`

Three. The transaction holds locks and an MVCC snapshot across the network call, so its
latency — including every retry and timeout — is lock hold time, and a long one stalls
other writers and blocks vacuum. There is no atomicity across the boundary, so a failure
after the remote call commits leaves the two systems inconsistent and the only repair is a
compensating action or a reconciler. And the remote call itself must be idempotent, because
a client retry re-executes it. The correct shape is: open a short transaction, load what is
needed, commit; call the remote system *outside* any transaction; then open a second short
transaction to record the result. And once you accept that shape, you have accepted that this
is a distributed workflow, which means the outbox or the saga question from Chapter 7 is now
on the table rather than optional.

**T12. You add a log line printing
`TransactionSynchronizationManager.getCurrentTransactionName()`. What shows up, and what is
it for?**

The `label` attribute of the `@Transactional` annotation for the transaction currently bound
to this thread — empty if the annotation has no `label` or if no transaction is active. It
is a very cheap observability win, because you can set the driver's application name or
query comment from it, at which point the label appears in `pg_stat_activity.query` or in
`information_schema.processlist` — turning "connection idle in transaction" from a mystery
into a searchable term. Setting `label` on every long-running transactional method is one of
the highest-ratio diagnostics available in this whole volume.

**S6. A reviewer sees a `@Transactional` method that loops over a repository call. What is
the comment?**

That the whole loop is one transaction, so a failure at item 700 discards 700 successful
writes, and the method holds locks and a snapshot for the whole loop's duration. The fix
depends on the requirement, and the review should demand to know which one it is: if
all-or-nothing is correct, the loop belongs inside the transaction but the method should at
least be batched so it does not hold a snapshot for hours; if partial progress is correct,
each iteration needs its own `TransactionTemplate.execute` or `NESTED`, and the summary of
what succeeded needs to be durable somewhere — a returned report, or an outbox row per item.
What is not acceptable is a loop inside a transaction with no decision recorded.

### Distributed Transactions

**D14. Is 2PC ever the right answer, or is it always a smell?** `STAFF`

It is right when the data genuinely must be atomic and the latency budget tolerates it —
typically a low-throughput, high-value operation like a ledger posting between two
institutions, where neither party will accept eventual consistency. It is wrong whenever the
operation is in a request's critical section, and the cost that makes it wrong is not
happiness: a stateful coordinator becomes a single point of failure, prepared resources
block while locks are held, and an in-doubt transaction needs a human to resolve by
inspecting both systems. The asymmetry is the real argument — adopting XA is easy and
removing it later means writing compensating logic for code that was never designed to have
any, so the decision should be made with the exit path in mind rather than as a local
optimisation.

**D15. Saga or outbox? Both solve "an event must not be lost." How do you choose?** `STAFF`

They solve different problems, and choosing between them by asking which is "more robust"
is the mistake. The outbox guarantees that a state change and the intent to publish it are
one atomic commit, and the relay retries — it says nothing about the state after the event
is consumed. A saga coordinates *business* steps, each a local transaction, with a
compensating action per step, and its purpose is the multi-step flow, not the messaging
reliability. The honest framing is: use an outbox whenever a single service's state change
needs to notify the world, and a saga when the flow itself spans services and can fail
halfway with meaningful intermediate state. Many systems need both, at different levels, and
the failure teams hit is implementing a saga that is really just an outbox with extra
steps.

**T13. The outbox relay publishes a message and then crashes before setting
`published_at`. What happens, and how must the consumer behave?**

The row stays unpublished, the relay picks it up again, and the message is published a
second time. So delivery is **at least once**, and the consumer must be idempotent — a
dedup table keyed on `(consumer, message_id)`, or a natural key and an
`INSERT ... ON CONFLICT DO NOTHING`. The related trap is claiming the dedup entry in a
different transaction from the business effect: if the claim commits and the effect fails,
the retry is dropped and the effect is lost permanently and silently. Claim and effect must
be atomic, or the message needs its own state machine.

**P8. A consumer processes an outbox message, then the service is redeployed and the relay
re-delivers it. A customer is charged twice. What should have been in place?**

Idempotency on the consumer side, before anything else. Concretely: a `processed_message`
table with a primary key of `(consumer, message_id)`, claimed in the same transaction as the
business effect, so a duplicate either finds the claim and returns, or races the insert and
loses the `UNIQUE` violation and returns. If the charging side is a gateway rather than
another database, the equivalent is an idempotency key on the *outbound* call. And the
third thing that should be in place is a reconciliation job that compares charges against
orders, because idempotency reduces the rate of a failure class rather than eliminating it,
and the first occurrence of a duplicate that slips through should be caught by a routine
process rather than by a customer.

**D16. Is a retried HTTP request a distributed transaction problem?** `STAFF`

No, and treating it as one is a category error that leads to over-engineering. 2PC's
guarantees are about a *transaction*; a client that times out and retries was never in that
transaction, so no amount of coordination inside the service addresses it. The correct
primitive is an idempotency key: a client-generated UUID per logical operation, a `UNIQUE`
constraint on it, the stored result alongside it, and a retention window longer than the
client's retry window. That is a table, an index, and an insert-if-absent — versus a
coordinator, a decision log, and an in-doubt recovery procedure. The reason this comes up
in a transaction discussion is that it is the same underlying requirement — an effect that
must happen exactly once from the *caller's* point of view — and the layer above is where
it belongs.

**S7. A PR introduces CDC from the orders table to feed a search index and a downstream
service. What should the review raise?**

Three things. First, coupling: every consumer is now bound to the *table schema*, so the
next column rename or column reorder is a breaking change to every consumer unless a schema
registry and a compatibility mode are configured. Second, the data contract: CDC publishes
row shapes, not business events, so a consumer now has to interpret a `status` column
change without any versioning story. Third, whether the two consumers need the same
guarantee — an analytics sink tolerates lag and duplication, and a business process that must
act exactly once does not. The review should push for: CDC for the index and the analytics
sink, an explicit outbox for anything a business process depends on.

**D17. Your team needs "exactly-once processing" across a database and a broker. Is that
achievable?** `STAFF`

Not across that boundary, and any claim to the contrary is a claim about a narrower
guarantee than the words suggest. The broker's publish and the database's commit cannot
participate in one atomic operation, so you get at-least-once delivery — the relay may
publish and fail to record it, or the consumer may process and fail before acknowledging.
What you can achieve is **effectively-once processing**: at-least-once delivery plus
idempotent handling, using a dedup key committed atomically with the effect, or an
inbox table in the same transaction as the state change. So the useful question is not "how
do we get exactly once" but "what is our dedup key and is it committed atomically with the
effect" — because that is the entire difference between a system that tolerates redelivery
and one that does not.

**T14. Under a Saga, an intermediate state is visible to a user between two steps. What
property of the Saga does this violate, and how do you design around it?**

It violates **isolation** — a Saga provides eventual consistency, not immediate
consistency, and the intermediate state is genuinely part of the design rather than a bug.
The design response is not to hide it but to model it: the order row exists in a `PENDING`
state, the UI reads that state and renders "processing," and every read path is written to
handle a partially-completed flow. The staff-level question this forces is a product one:
what does the user see, and is that acceptable for how long? If the answer is "no, never,"
then the flow does not belong in a Saga and the requirements need to change — usually by
splitting it so each user-visible step is a single atomic transaction.

**P9. A developer proposes `PROPAGATION_REQUIRES_NEW` on the "record audit" method so the
audit survives a rollback, "just to be safe." What is the review conversation?** `STAFF`

The first question is what the audit row is asserting — that an *attempt* happened, or that
an *outcome* occurred. If it is an outcome, an independent commit can record a success the
database then rolls back, which is worse than no audit: the audit is now a source of false
information. If it is an attempt, then the right primitive is a log written *before* the
work, not an independent transaction written during it. The second question is capacity:
every request on this path now holds two connections. The third is the JPA consequence —
a second persistence context, so entities loaded inside are different instances. My
recommendation would be an outbox row in the same transaction plus a relay, which gives
durability with one connection and never contradicts the business data.

### Operational & Organisational

**D18. How would you raise the bar on transaction correctness across a codebase you have
inherited, in the first two weeks?**

Instrument first, before changing anything: set `label` on transactional methods, add
`afterCompletion` timing keyed by the label, and alert on
`pg_stat_activity WHERE state = 'idle in transaction'` — you want to know which of the
existing problems are real before you reorganise. Then add the cheap mechanical defences
that convert silent bugs into red builds: assert
`isActualTransactionActive()` in write-path tests, add a real-commit test slice with
Testcontainers, and an ArchUnit rule constraining `@Transactional` to services. Only then
touch the code, and start with the transaction that holds the most locks for the longest
time, because that is the one that produces incidents. The staff-level point to raise with
the team is that this is an *observability* project before it is a refactoring project, and
that the refactoring is mechanical once the instrumentation tells you where to aim.

**D19. A team has decided to write a Saga framework in-house. What should you push back
on, and what is the alternative?** `STAFF`

Push back on the durability requirements first, because that is where in-house loses. A
saga framework must be durable across restarts — the saga's state has to survive a
deployment, or a deploy mid-saga loses every in-flight flow — and it needs at-least-once
step execution with idempotent steps, or a retried compensation double-charges someone. It
also needs a way to compensate a compensation, because that is a real case. That is a
distributed state machine with persistence, and it is a system to operate, monitor, and
migrate. The alternative is usually better: a single database table modelling the flow's
state, a scheduled worker that finds flows that need advancing or compensating, and
compensation expressed as ordinary business methods — which is idempotent, queryable by
support, and inspectable in a database dump. In-house only wins if the flows are simple,
the count is low, and the team genuinely has the operational capacity for another stateful
service.

**T15. A transaction is open, and a `@Async` listener fires from inside it. Is the async
work part of the transaction?**

No. The transaction is bound to a `ThreadLocal`, and the async task runs on a different
thread with an empty holder. It gets its own connection and its own transaction if it is
annotated, and commits independently of the original — so an exception in the async work
cannot roll back the request, and a rollback of the request does not undo the async work.
Worse, if the async work modifies entities loaded in the original transaction, those
entities belong to a different persistence context and the changes may never be flushed. An
`AFTER_COMMIT` listener avoids this for the commit direction, because it fires after the
transaction is over; for work that must happen atomically with the commit, it does not.

**D20. Would you recommend raising the connection pool size to fix transaction problems?**
`STAFF`

Only after ruling out the three causes that make it the wrong answer: `REQUIRES_NEW` or deep
nesting multiplying demand, a leaked connection from code outside Spring, and long
transactions reducing effective throughput. Pool size is a throughput knob, and raising it to
fix a nesting bug converts a code defect into a permanent tax on the database's own
connection limit — you will move the failure from the pool to the database, where it is
harder to diagnose and affects other tenants of the same instance. The correct sequence is:
measure connection demand versus pool size, find where the connections are held for longer
than they should be, fix the holding, and only then consider whether the pool is correctly
sized for the load that remains.

**S8. A PR raises a method's isolation to `SERIALIZABLE` to fix a concurrency bug. What
should the reviewer check before approving?**

Four things. What the actual defect is — if it is a lost update, the fix is `@Version` or
`SELECT ... FOR UPDATE` and the isolation change is doing nothing except adding cost. Whether
every path that runs at `SERIALIZABLE` has a retry loop, because on PostgreSQL those
transactions abort with `40001` and a code path without retry is a latent outage. How long
the transaction is, because a stronger level on a long transaction holds a snapshot that
blocks space reclamation. And whether the isolation is even taking effect — under
`JpaTransactionManager` with an `EntityManager` that is not database-aware, JPA cannot
express it portably and the setting is silently ignored, which is worth asking because the
symptom would be "we set it and nothing changed."

**D21. A product owner says an order must never exist without its inventory. Is that a
technical requirement?** `STAFF`

Not as stated — "never" is not a specification, and the engineering job is to convert it
into one. The questions that make it a specification are: how long is the system allowed to
be inconsistent, what does the user see in that window, and what happens if the inventory
service is down when an order arrives. If the answer is genuinely zero, the options are a
single database boundary or XA, and I would make the cost of both explicit — a coordinator
and an in-doubt recovery path, or a schema that the two concerns can share. If the answer is
"a few seconds, and the order shows as processing," the answer is an outbox and a consumer,
and the design is a fraction of the cost. The point to make in the review is that the
architecture is executing a product decision, and the right move is to help the product owner
state it rather than to pick the mechanism first and then justify it.

**D22. How do you decide where transaction boundaries belong in a codebase that has no
convention?** `STAFF`

Start from the use case, not the layer. A transaction should span everything that must
succeed or fail together, which almost always means one business operation at the service
layer — and the test is a specific question: if this write succeeded and that one failed,
does the system have a coherent state? If not, they belong in one transaction. Then the
enforcement: an ArchUnit rule confining `@Transactional` to the service layer, plus a
review rule that no transactional method calls a remote client or loops. The thing to avoid
is annotating the repository layer "for safety," which gives every repository call its own
transaction by default and produces the exact failure where a three-repository use case
becomes three separate commits — with no boundary at all, since the caller's method is not
transactional.



