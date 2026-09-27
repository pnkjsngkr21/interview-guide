---
title: "The Spring Complete Deep-Dive"
volume: 9
series: "TESTING & PRODUCTION TROUBLESHOOTING"
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

Volume 9 is different from the other ten, and deliberately so. Every other volume explains a
mechanism. This one is about judgement under the two conditions engineers actually work in:
you are not sure whether a thing is broken, and you are on call. The chapters here are
organised around decisions with prices attached — how many connections, how many threads,
what to mock, what to run against a real database, when a flag is the right abstraction — and
each one names the incident it prevents and the diagnostic command that finds it. Half of
this volume is executable: `jcmd <pid> Thread.print`, `jcmd <pid> JFR.start`, and the
arithmetic behind `max-threads=200` and `maximumPoolSize=10` are worth more in an interview
than any amount of recall about test coverage percentages.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto the test context
cache produces filler. The template is a completeness checklist, not a template to fill.

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
| Volume 9 (this book) | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 9

- Chapter 1 — The Test Pyramid in Spring
- Chapter 2 — Spring Boot Test Annotations
- Chapter 3 — Testcontainers
- Chapter 4 — Mocking & Test Design
- Chapter 5 — Performance & Memory
- Chapter 6 — Distributed Failure Modes
- Chapter 7 — Production Practice
- Chapter 8 — Interview Scenario Bank

---

# Part 9 — Testing & Production Troubleshooting

## Chapter 1 — The Test Pyramid in Spring

### 1.1 The Four Tiers, and What Belongs in Each

The test pyramid is usually drawn as three triangles: many unit tests at the base, fewer
integration tests in the middle, a few end-to-end tests at the top. That drawing is not
wrong, but for a Spring application it is too coarse to act on, because the thing that
matters is not the *count* in each tier — it is **which tier is the only one capable of
catching a given class of bug**.

| Tier | What it means in Spring | Runs in | Typical count | What it structurally CANNOT catch |
| --- | --- | --- | --- | --- |
| Unit | Plain JUnit, no Spring. `new OrderService(repo, clock)`. | Milliseconds | Hundreds | Wiring. Anything the container does. |
| Slice | One auto-configuration, real context. `@WebMvcTest`, `@DataJpaTest`, `@JsonTest`. | ~1–3s | Tens | Cross-slice wiring. Anything the slice excludes. |
| Integration | Full context, real or containerised infrastructure. `@SpringBootTest`. | 10–90s | Tens | Cross-service. Anything outside the JVM. |
| E2E | The deployed system, real HTTP, real dependencies. | Minutes | A handful | The internals. Anything behind a mock. |

The single most important structural fact in that table is the last column. **A unit test
cannot catch a wiring error, and that is not a limitation of effort — it is a limitation of
the technique.** A unit test constructs the object graph by hand. It has no container, no
auto-configuration, no property binding, no `BeanPostProcessor` chain. A service wired with
a `NoSuchBeanDefinitionException` in production has a perfectly green unit test suite,
because the unit test supplied the dependency itself.

> **MUST REMEMBER**
>
> The Spring-specific value of a high-level test is that it is the only tier that exercises
> the **container**. Component scanning, conditional beans, `@ConfigurationProperties`
> binding, JSR-380 validation, auto-configuration ordering, the `BeanPostProcessor` chain,
> and proxy creation all happen at context refresh. A suite of unit tests structurally
> cannot observe any of it. That is the argument for having integration tests at all — not
> "more end-to-end confidence", but "we have never once run the part of the framework that
> most often breaks it."

The same argument runs the other way, and it is the reason teams over-invest in high-level
tests: **an integration test that mocks the thing that broke gives you the cost of the
tier and none of the value.** A `@SpringBootTest` with `@MockitoBean` on the repository is a
slow test that proves the context loads and that Mockito works.

### 1.2 Coverage as a False Signal

Coverage is a *coverage of lines executed*. It has never claimed to be a measure of
correctness, but teams convert it into one anyway, because a number is easier to report than
a judgement. The failure mode is specific and expensive:

```text
Service:          OrderService
Line coverage:    91%
Incidents last 3 quarters: 4
  - #1  missing @Transactional on a self-invoked method (no test asserts a rollback)
  - #2  a query became N+1 after a schema change (every test used one entity)
  - #3  an @Value placeholder resolved to a default instead of failing (no test bound prod config)
  - #4  a @Scheduled job double-fired (no test covered the trigger path — 9% of lines)
```

Each of those four escaped a suite that had executed 91% of the code. Three of them escaped
because the *interesting* branch is the failure branch, and failure branches are exactly
what people don't write tests for. The fourth escaped because coverage is per-line, and a
method that is never invoked reports its body as covered-by-being-written-but-never-run only
if your tooling is lying to you — most report it as uncovered, but they report it as a
*number*, not as a *decision*.

> **INTERVIEW TRAP**
>
> "We have 90% test coverage" is the answer that scores zero on its own, and actively hurts
> when the interviewer follows up. The staff-level version: "Coverage tells me which lines
> ran, not which behaviours are guaranteed. A service with 90% coverage and no test that
> proves a transaction boundary is less safe than one with 40% coverage and a test that
> asserts the rollback actually happens — because the 90% suite has a false sense of
> completion that suppresses the discussion." The follow-up is what they're testing: *which
> tests would you write first, and how would you decide?*

There is a worse variant, and it is the one that actually causes incidents: **a coverage
number that was optimised to.** Once 90% is a target, the cheapest lines to cover are
getters, constructors, and `toString` — which is precisely the wrong work, and it displaces
the test that would have caught incident #1.

> **TRADE-OFF**
>
> Coverage has one genuinely useful property: it finds the code nobody thought about. A
> class with 0% coverage in a service that has been running for two years is a place where
> nobody is sure what happens, and that is genuinely alarming. The flip condition for
> treating coverage as a target rather than a smell-detector: it works as an *outlier*
> signal (this file is 0%, this file is 4%, why?) and fails as a *threshold* (we must be
> above 90%). Outliers point at real risk. A threshold produces the getter-test treadmill.

### 1.3 The Ranking Rule That Actually Works

If coverage is the wrong ranking function, here is the right one, and it costs nothing to
compute:

> **Rank candidate tests by what they would have caught in the last three incidents.**

Concretely, before writing any test, pull the last three production incidents for the
service and write down, for each one, the test that fails before the fix. This is a
thirty-minute exercise and it reorders the backlog more reliably than any coverage tool,
because it optimises for *the bugs this system has actually demonstrated it is capable of*
rather than for the bugs a static analyser can imagine.

The three usual winners:

1. **The transaction boundary.** A test that asserts a rollback happens on failure. It is
   one `@DataJpaTest` or one integration test and it covers self-invocation, propagation
   defaults, checked-exception rollback rules, and non-public method visibility — all of
   which are silent (Volume 4).
2. **The query shape.** A test that asserts a query does not become N+1. This is
   unusually valuable because the failure is a *performance regression that passes every
   functional test in the suite* — every assertion still passes, it just takes 40× longer
   (Volume 6).
3. **The configuration binding.** A test that starts the context with the production-shaped
   configuration and fails when a required property is absent. `@ConfigurationProperties`
   validation is only meaningful if something exercises it.

Notice what is absent: a "happy path for every service method" backlog. It feels productive
and it is almost never what the incidents needed.

> **STAFF-LEVEL CONSIDERATION**
>
> The ranking rule has an organisational dimension that matters more than the technical one.
> A team that ranks its test backlog by recent incidents gets a different backlog every
> quarter, which means test work is *visible* — it changes in response to production
> evidence, and a skipped item can be explained. A team that ranks by coverage has a static
> backlog and a coverage number, which is safe-looking and gives nobody a way to say "this
> was a bad use of a week." The second arrangement is much easier to defend in a planning
> meeting and produces much less incident reduction. If you are asked to justify a testing
> strategy at staff level, the honest argument is about the *feedback loop*, not about the
> tests themselves: the value of a test suite is the rate at which it converts a production
> incident into a red build.

### 1.4 Test Data Independence

A test suite is only trustworthy if tests can run in any order, in parallel, and in
isolation. Three mechanisms break that, and all three are common:

```java
// ── 1. SHARED, MUTABLE FIXTURE STATE ──────────────────────────────
class OrderTests {

    private static Account account;             // shared across every test in the class

    @BeforeAll static void seed()      { account = accounts.save(new Account("acme")); }
    @Test  void testA()                { account.setBalance(0); /* ... */ }
    @Test  void testB()                { assertThat(account.getBalance()).isEqualTo(0); }  // ✓ only by luck
}
// testB passes only because it ran after testA. Reorder them and it fails.
```

```java
// ── 2. @DirtiesContext as a COVER-UP ──────────────────────────────
@Test @DirtiesContext
void createsOrder() { /* ... */ }
// This is the standard fix for test 1, and it is a very expensive one: it tears down the
// cached context and forces the next test class to rebuild it from scratch. Ten of these
// in a class is a ten-minute suite.
```

```java
// ── 3. ORDER DEPENDENCE ACROSS CLASSES, VIA THE DATABASE ─────────
@Test void createsOrder()       { repo.save(orderFor("acme")); assertEquals(1, count()); }
@Test void rejectsEmptyOrder()  { assertEquals(0, count()); }   // fails if run after createsOrder
```

The real fix is the boring one: **every test owns its data and nobody cleans up on its
behalf.** With Testcontainers (Chapter 3) the per-class fixture approach is available and is
often the right trade — a fresh database per test *class*, `TRUNCATE` or a rollback
transaction between tests, never a per-test container. With an in-memory database, the same
discipline applies and is cheaper.

> **PRODUCTION RELEVANCE**
>
> Order-dependent tests are worse than no tests, because they are *unreliable* — and an
> unreliable suite trains the team to re-run failures rather than read them. The re-run
> becomes the workflow, the re-run hides real flakes, and the flake budget quietly becomes
> "whatever we can tolerate". `@DirtiesContext` deserves a code-review question every time
> it appears: *what state is leaking between tests, and why wasn't that state made
> per-test?* Nine times out of ten the answer is a shared mutable fixture, and the fix
> costs less than the context rebuild does.

### 1.5 The Deterministic-Discipline Rules

Four rules. They are not style preferences; each one is a specific, named class of flake
that a team will otherwise spend a month diagnosing.

**1. No `Thread.sleep`.** `Thread.sleep(500)` is a guess about someone else's latency. It is
a coin flip that costs half a second per run and produces a failure rate roughly equal to
the probability that the async work finished in 500ms. The deterministic replacements are
`Awaitility` for polling a condition, or better, a `CountDownLatch`/`CompletableFuture`
the code under test actually completes — and if the code offers no such hook, that is a
finding about the production code, not about the test.

```java
// BAD — a guess
Thread.sleep(500);
assertThat(cache.get("k")).isNotNull();

// GOOD — a condition, polled with a bounded budget
await().atMost(2, SECONDS).until(() -> cache.get("k") != null);

// GOOD — a real completion signal
executor.submit(() -> cache.put("k", "v")).get(2, SECONDS);
```

**2. No wall-clock dependence.** A test that asserts "the report generated today" passes in
CI and fails on a machine whose timezone crosses midnight, and a test that uses
`Instant.now()` to build a boundary case passes today and fails next quarter. Inject a
`Clock` and make the code take it — which, note, is a *production* design improvement that
the test forced into existence, not just a test convenience.

```java
// BAD
Order o = Order.placedAt(Instant.now());
assertTrue(o.isWithinSlawnessOf(Instant.now()));

// GOOD — the clock is a dependency, and the boundary case is expressible
Order o = Order.placedAt(Instant.parse("2026-03-01T23:59:59Z"));
assertTrue(o.isWithinSlawnessOf(Instant.parse("2026-03-02T00:00:01Z")));
```

**3. No ordering dependence.** Covered in 1.4; the rule is that JUnit's method order is not
a contract and `@TestMethodOrder` should be treated as a code smell except for genuinely
stateful lifecycle tests, where a nested class with `@BeforeEach` is usually the honest
form.

**4. No shared external state.** Two suites hitting the same dev database, a fixed port, or
a fixed S3 prefix will collide in CI the first time two branches run. Every test that
touches something outside the JVM must either own that resource or use a per-run
identifier — which, for a container, means a per-class container and a per-test schema.

```java
@SpringBootTest
@ActiveProfiles("test")                       // NOT "dev" — the dev profile is shared state
@TestPropertySource(properties = "app.instance-id=${random.uuid}")
class OrderIntegrationTest { }
```

> **MUST REMEMBER**
>
> A deterministic test is one whose result is a function of the code, not of the machine.
> Every `Thread.sleep`, every `now()`, every hard-coded port, every shared fixture, and every
> dependence on test execution order is a term added to the result that is not the code. The
> test of a test suite is not "how many tests pass" but **"does the suite ever fail for a
> reason unrelated to a change?"** A suite that answers "no" can be trusted to gate a
> deploy. A suite that answers "sometimes" has already stopped gating anything, because
> everyone has learned to re-run.

#### Common Mistakes

- Treating a coverage percentage as a quality measure rather than an outlier detector. The
  number optimises toward getters and away from failure branches.
- Believing a large unit suite removes the need for integration tests. It cannot — wiring is
  invisible to it by construction.
- Using `@SpringBootTest` with mocked collaborators, paying the full-context cost for a
  test that proves the context loads.
- Fixing order dependence with `@DirtiesContext` instead of per-test data ownership. The
  second is a twenty-line change; the first is a suite-wide slowdown.
- Sharing a database or a profile with a developer's local environment, so the suite's
  result depends on whether anyone left something behind.
- `Thread.sleep` as synchronisation. It is a probabilistic wait presented as a deterministic
  one.
- Asserting on `Instant.now()` rather than an injected `Clock`.

#### Interview Questions — The Test Pyramid

**Q1. A service has 92% line coverage. It has shipped four incidents this year. Is the
suite doing its job?** `STAFF`

Not necessarily, and the interesting answer is to ask which lines those 92% are. The
failure branches — rollback, timeout, missing configuration, the scheduled-task entry
point — are systematically under-tested because they are less fun to write. I would pull
the four incidents, write down the test that fails before each fix, and check whether any
of them exist. If none do, the coverage number has been optimised rather than earned, and
the number should stop being reported.

**Q2. What can a unit test in a Spring application not catch, and why is that structural
rather than a matter of effort?** `TRICKY`

Wiring. The unit test constructs the object graph itself, so there is no container, no
component scanning, no auto-configuration, no `@ConfigurationProperties` binding, no
`BeanPostProcessor` chain and no proxy. A missing bean, a missing property, a bad
`@Conditional`, and a self-invocation that skips a proxy all produce a green unit suite
and a broken application. This is why the integration tier exists, and it is the one
argument for it that survives a "why not just unit test everything" challenge.

**Q3. How would you decide what to test next on a service that has a full suite?** `STAFF`

Incident-weighted. Take the last three production incidents, write the test that would
have failed before each fix, and queue those. The reason it beats coverage is that it
optimises for the failures this system has demonstrated it is capable of, rather than for
lines a tool can count. The secondary benefit is organisational: an incident-weighted
backlog visibly responds to production evidence, so skipping an item is explicable.

**Q4. A team uses `@DirtiesContext` in eleven test classes. What are they paying and
what's the actual fix?** `STAFF`

Each use discards the cached `ApplicationContext` and forces the next test class to
refresh a fresh one — typically 3–15 seconds, and the cost compounds when the classes run
adjacent. It is almost always a cover for shared mutable fixture state or leftover rows.
The fix is per-test data ownership: a rollback transaction, a truncate-between-tests, or
one container per class with cleanup at the class boundary. That is a twenty-line change
against a suite-wide slowdown, and it is worth raising as a review question every time a
new `@DirtiesContext` appears.

**Q5. When is a high-level test worse than no test at all?** `TRICKY`

When it is slow enough that people start skipping it, and slow enough that it mocks the
thing that broke. A `@SpringBootTest` that stubs out the repository and the HTTP client
proves the context refreshed and the annotations are spelled correctly — for 8 seconds a
test. Worse, it produces false confidence, because "the integration test passed" becomes an
argument against writing the test that would actually have caught the bug. The tier's
value is that it runs the container; the moment you remove the container, you are paying
the cost without the benefit.

**Q6. How do you make a suite deterministic without making it slow?** `STAFF`

Replace each source of nondeterminism with a controllable one, not a longer wait. `sleep`
becomes a bounded await on a condition or a real completion signal. `Instant.now()` becomes
an injected `Clock`. Shared fixtures become per-test data. Fixed ports become port 0.
Then parallelism becomes possible, and parallel execution is where the payoff lands — a
deterministic suite can be sharded across ten CI runners, and a flaky one cannot be fixed
by adding shards because the flakiness scales with them.

> **CHAPTER 1 SUMMARY**
>
> The pyramid is not three counts, it is a map of which tier can catch which bug — and in
> Spring the mapping is unusually sharp, because only the high-level tiers execute the
> container, which is where wiring, binding and proxying live. Coverage is a line-count
> signal, not a correctness signal; a 90% suite with no rollback assertion is more
> dangerous than a 40% suite with one, because the first suppresses the conversation. Rank
> the backlog by what would have caught the last three incidents, own the data per test,
> and make the result a function of the code rather than of the machine — a suite that fails
> for unrelated reasons has already stopped gating deployments.

#### Further Reading

- [Spring Framework Reference — Testing](https://docs.spring.io/spring-framework/reference/testing.html) — the whole test infrastructure in one chapter, including the context framework, `MockMvc` and the test annotations.
- [Spring Boot Reference — Testing](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html) — the Boot-specific test annotations and how they compose with the framework's.
- [Thorbén Janssen — Spring Boot Testing](https://www.thorben-janssen.com) — the best long-form practitioner writing on slice tests and test-data design; the integration-test articles in particular are directly reusable.
- [JUnit 5 User Guide](https://junit.org/junit5/docs/current/user-guide/) — the authoritative reference for the extension model, nested tests and execution ordering.

## Chapter 2 — Spring Boot Test Annotations

### 2.1 `@SpringBootTest` and What a Full Context Costs

`@SpringBootTest` boots the real application context. That is the point and the cost. The
context has to be discovered, component-scanned, auto-configured, and — for a real
`DataSource` — connected to a database before your first assertion runs.

```java
@SpringBootTest
class OrderServiceTest {
    @Autowired OrderService service;      // the container built this. So did it build the rest?
}
```

| | Plain JUnit | `@SpringBootTest` |
| --- | --- | --- |
| Startup cost | ~0ms | 3–15s per distinct context |
| Proves wiring | No | **Yes** — this is the entire value |
| Proves SQL against a real schema | No | Only if the `DataSource` is real |
| Needs maintenance when config changes | No | Yes — the test is coupled to the context |
| Catches a missing bean, missing property, bad `@Conditional` | No | Yes |
| Useful for | Logic, edge cases, state machines | Wiring, binding, transactions end to end |

The honest way to phrase the choice: **use `@SpringBootTest` when the thing you're testing
is the container, and a slice when it isn't.** A `@SpringBootTest` on a service that only
uses a `Repository` and a `Clock` is paying for 800 beans it doesn't care about.

### 2.2 `webEnvironment`

The single most impactful attribute on `@SpringBootTest`, because it decides whether a real
server exists.

| Value | What happens | Use for | Cost |
| --- | --- | --- | --- |
| `MOCK` (default) | `MockServletContext`; the web layer is present but no socket | `@WebMvcTest`-style controller tests, or service tests that happen to have web config on the classpath | Fastest. No ports, no real HTTP. |
| `RANDOM_PORT` | A real server on an ephemeral port | End-to-end-ish tests through `TestRestTemplate`/`WebTestClient` | Real Tomcat, real HTTP, real serialization |
| `DEFINED_PORT` | A real server on `server.port` (default 8080) | Rarely. Only when something outside the process must reach it | Port collisions, and a suite that can't run in parallel |

The trap: **`MOCK` does not mean "no web".** Under `MOCK`, `@Autowired WebClient`,
`@Autowired RestTemplate` and `TestRestTemplate` all work — they are bound to
`MockRestServiceServer`-capable infrastructure. People assume `MOCK` means the web layer is
untested and write a `RANDOM_PORT` test to compensate, when in fact the `MOCK` environment
plus an explicit `MockRestServiceServer` binding is both faster and more precise.

```java
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
class OrderApiIT {

    @LocalServerPort int port;                       // injected only under RANDOM_PORT/DEFINED_PORT

    @Autowired TestRestTemplate rest;                // pre-configured, no need for the port

    @Test
    void createsOrder() {
        ResponseEntity<Order> r = rest.postForEntity("/orders", cmd, Order.class);
        assertThat(r.getStatusCode()).isEqualTo(CREATED);
    }
}
```

`DEFINED_PORT` deserves a specific warning: it is the reason a developer's local suite fails
because something else on the machine owns 8080, and the reason two test classes cannot
run concurrently. Use it only when a real external process needs to reach the application.

### 2.3 The Context Cache — the Reason Suites Are Slow

This is the mechanism almost nobody knows, and it explains most "our test suite takes 40
minutes" conversations.

`SpringExtension` keeps a static cache of `ApplicationContext` instances, keyed by the
**MergedContextConfiguration** — the set of annotations and properties that determine what
the context looks like. When the next test class has the same key, the cached context is
reused. When it doesn't, a new one is built and added to the cache.

```text
Cache key = (classes, locations, active profiles, property sources, contextCustomizers,
             parent, test-managed resource access, @ActiveProfiles, @TestPropertySource,
             contextConfiguration, bootstrap registrars)

  @SpringBootTest @ActiveProfiles("test")              → key A ──► [ ctx A ]
  @SpringBootTest @ActiveProfiles("test")
  @TestPropertySource(properties = "x=1")              → key B ──► [ ctx A, ctx B ]   2 contexts!
  @SpringBootTest(webEnvironment = RANDOM_PORT)        → key C ──► [ ctx A, ctx B, ctx C ]
  @SpringBootTest @MockitoBean PaymentClient p        → key D ──► [ ... ctx D ]       4 contexts
```

The cost is not linear in tests — it is linear in **distinct configurations**. Thirty test
classes that share one configuration refresh the context once. Thirty test classes that each
add their own `@MockitoBean`, their own `@TestPropertySource`, or their own profile refresh
it thirty times, at 5 seconds each, which is 150 seconds of pure waiting that produces no
signal at all.

The cache default size is **32**. The knob:

```properties
# larger = fewer evictions, more memory held by the JVM for the whole run
spring.test.context.cache.maxSize=64
```

Raising it helps when you have *more* than 32 distinct contexts that are genuinely reused.
It does nothing if each context is used once — a suite with 200 distinct configurations
gets 200 refreshes regardless of cache size, and the fix is to reduce the number of
configurations, not to enlarge the cache.

> **SCALING REALITY CHECK**
>
> Beyond 32 cached contexts the JVM is also holding 32 live `ApplicationContext` instances,
> each with its own bean singletons, each of which may hold a connection pool. A `HikariDataSource`
> in a cached context holds up to 10 real database connections. 32 cached contexts is up to
> 320 idle connections against whatever database the test profile points at — and if that's
> a shared staging instance, the test suite is a resource leak with a build pipeline attached.
> This is a real argument for Testcontainers (Chapter 3): it removes the shared external
> resource, not just the shared context.

> **PRODUCTION RELEVANCE**
>
> The context cache has one more property worth naming: **state leaks between test classes
> that share a context.** A singleton bean mutated by one test class is still mutated when
> the next class reuses that context. This is the mechanism behind "the test passes alone
> and fails in the suite" for tests that do not touch the database at all. It's also why
> `@DirtiesContext` exists, and why its cost is paid against the whole cache.

### 2.4 The Slice Annotations

Slices are auto-configurations applied to a minimal context. Each one loads **one** piece of
the application and excludes the rest, and the whole design rests on one rule you have to
learn per slice: *what it includes and what it excludes.*

| Annotation | Includes | Excludes | Fails when |
| --- | --- | --- | --- |
| `@WebMvcTest` | `@Controller`, `@ControllerAdvice`, `WebMvcConfigurer`, filters, `Jackson`, message converters | `@Service`, `@Repository`, `@Component` generally | You need a service — you need `@MockitoBean` |
| `@DataJpaTest` | `@Entity`, JPA repositories, `JpaRepository` query methods, an in-memory or replaced `DataSource` | Everything not persistence | You need a service or a controller |
| `@JsonTest` | Jackson auto-config, `ObjectMapper` | Everything else | You need Spring at all, arguably |
| `@RestClientTest` | The HTTP client under test + Jackson + a mock `ClientHttpRequestFactory` | The server side entirely | You want to test what the server *returns* |
| `@JdbcTest` | `JdbcTemplate`, an embedded/replaced `DataSource`, SQL initialisation | JPA, services, controllers | You are using JPA |

> **MUST REMEMBER**
>
> **A slice test that needs `@MockitoBean` for a collaborator is usually testing too much.**
> That is the design rule the slice annotations exist to enforce. `@WebMvcTest` plus three
> mocked services is not a slice test — it is a slow `@SpringBootTest` with extra steps,
> and worse, because the mocks hide exactly the wiring the slice was supposed to check. If
> you find yourself mocking collaborators to make a slice work, the correct move is almost
> always to move the assertion down a level: test the controller's contract with a mocked
> service *in a plain unit test* (no Spring), and let the `@WebMvcTest` cover the genuinely
> slice-specific concerns — message converters, validation, status codes, exception handling.

```java
// ── @WebMvcTest: the collaboration with the service IS the contract under test ──
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @MockitoBean OrderService orders;                  // Boot 3.4+; @MockBean in 3.3 and earlier

    @Autowired MockMvc mvc;

    @Test
    void returns201ForValidOrder() throws Exception {
        given(orders.place(any())).willReturn(Order.id(42L));

        mvc.perform(post("/orders")
                   .contentType(APPLICATION_JSON)
                   .content("""
                            {"sku": "ABC-1", "qty": 2}
                            """))
           .andExpect(status().isCreated())
           .andExpect(jsonPath("$.id").value(42));
    }
}
```

```java
// ── @DataJpaTest: real SQL, real transactions, rolled back after each test ──
@DataJpaTest
class OrderRepositoryTest {

    @Autowired OrderRepository repo;
    @Autowired TestEntityManager em;                    // flush() forces the SQL to happen NOW

    @Test
    @Transactional                        // the slice's default; makes every test roll back
    void rejectsNegativeQuantity() {
        em.flush();                       // without this, the constraint violation fires later
        assertThatThrownBy(() -> em.flush())
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void fetchesByStatusWithJoinFetch() {
        List<Order> orders = repo.findByStatusWithFetch(Status.PAID);
        assertThat(orders).allSatisfy(o -> assertThat(o.getLines()).isNotNull());
    }
}
```

Two details in that second test that catch people. `TestEntityManager.flush()` pushes
pending changes to the database immediately, which is the only way a constraint violation
surfaces inside the test rather than at teardown. And the default `@Transactional` on
`@DataJpaTest` is a *convenience* — it means "roll back after each test", not "you're testing
transactions". If you want to test a transaction boundary you must turn it off with
`@Transactional(propagation = Propagation.NOT_SUPPORTED)` and manage the transaction
yourself, which is a confusing signal on its own.

### 2.5 `@MockitoBean` and the `@MockBean` Deprecation

This is current and worth stating precisely, because the answer is version-dependent and
people get it wrong in both directions.

- **Spring Boot 3.4 and later:** `org.springframework.boot.test.mock.mockito.MockBean`
  (and `SpyBean`) are **deprecated in favour of** the Spring Framework annotations
  `org.springframework.test.context.bean.override.mockito.MockitoBean` and
  `MockitoSpyBean`. The Boot 3.4 release notes say so explicitly.
- **Spring Framework 6.2 / Boot 3.4:** `@MockitoBean` and `@MockitoSpyBean` are the
  supported replacements. `@MockitoBean` creates a Mockito mock; `@MockitoSpyBean` wraps
  an existing instance.
- The replacement is **not** a pure rename. `@MockitoBean` is **not supported on
  `@Configuration` classes** — mocks must be declared on fields in the test class, and
  existing test configurations that put `@MockBean` on a `@Configuration` class need
  restructuring. That caveat is called out in the same release notes, and it is the reason
  "just find-and-replace" is not the migration.

```java
import org.springframework.test.context.bean.override.mockito.MockitoBean;   // Boot 3.4+
// import org.springframework.boot.test.mock.mockito.MockBean;               // Boot 3.3 and earlier

@WebMvcTest(OrderController.class)
class OrderControllerTest {
    @MockitoBean OrderService orders;      // the current spelling
}
```

There is a real behavioural difference beyond the annotation name, and it is the reason the
Framework took over the mechanism: the `BeanOverrideHandler` model means an overriding
annotation is processed by a dedicated post-processor rather than by a Boot-specific
`MockitoPostProcessor`, which is why it works outside `@SpringBootTest` — in a plain
`@ContextConfiguration`, in a slice, in a test slice that has no Boot at all.

> **INTERVIEW TRAP**
>
> "`@MockBean` is a Boot annotation" is the answer that is technically true and practically
> out of date. As of Boot 3.4 it is deprecated, and the replacement is a Spring Framework
> annotation — `@MockitoBean` — that is not supported on `@Configuration` classes. A senior
> answer adds the *why*: the move gives the capability to the framework so it works in any
> test context, not just Boot's, and the deprecation rather than the removal exists
> because the `@Configuration`-class restriction makes it a migration, not a rename.

### 2.6 The Client Side: `MockMvc`, `MockMvcTester`, `TestRestTemplate`, `WebTestClient`

| Client | Talks to | Works with | Notes |
| --- | --- | --- | --- |
| `MockMvc` | `DispatcherServlet` directly, no socket | `@WebMvcTest`, `@SpringBootTest(MOCK)` | Default choice for MVC. Fast, but it is *not* the real servlet container. |
| `MockMvcTester` | Same as `MockMvc` | Same | Spring Framework 6.2 / Boot 3.4. The fluent, AssertJ-backed successor. |
| `TestRestTemplate` | A real server over real HTTP | `RANDOM_PORT` | Boot's client, pre-configured for the running port. Fault-tolerant by default. |
| `WebTestClient` | Real HTTP on MVC or WebFlux | `RANDOM_PORT`, or bound to the app | The one client that works for both stacks. |
| `RestClient` | Real HTTP | Any | Boot 3.2+. Modern synchronous client. |

```java
// ── MockMvcTester — the newer fluent API (Spring Framework 6.2) ──────
@WebMvcTest(OrderController.class)
class OrderControllerTest {

    @MockitoBean OrderService orders;
    @Autowired MockMvcTester mvc;                 // not MockMvc

    @Test
    void rejectsMissingSku() {
        mvc.post().uri("/orders")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""
                         {"qty": 2}
                         """)
                .assertThat()
                .hasStatus(HttpStatus.BAD_REQUEST)
                .bodyJson().extractingPath("$.errors[0].field").isEqualTo("sku");
    }
}
```

> **TRADE-OFF**
>
> `MockMvc` exercises `DispatcherServlet` — handler mapping, argument resolvers, data
> binding, validation, message conversion, exception handling. It does **not** exercise the
> servlet container, so it will not catch a filter registered through a non-obvious path, a
> container-level character-encoding default, a missing static resource mapping, or an
> error-page dispatch. `TestRestTemplate` on `RANDOM_PORT` catches all of those, and pays
> for a real Tomcat and a real socket per test. The flip condition: the gap only matters for
> configuration that lives *below* the DispatcherServlet, and if your team can agree on a
> short list of those (filters, security, error handling) then a handful of `RANDOM_PORT`
> tests covering exactly that list is the right proportion.

`TestRestTemplate` has one default worth knowing: it **does not throw on 4xx or 5xx**. A
`postForEntity` that returns 500 gives you a response, not an exception, which is usually
what you want in a test and is a genuine surprise in shared test helpers.

### 2.7 `@ActiveProfiles`, `@TestPropertySource`, and `@DirtiesContext`

`@ActiveProfiles("test")` and `@TestPropertySource(properties = {...})` both change the
context, and therefore **both change the cache key** (see 2.3). That is the hidden cost
people miss: a test class that adds a single `@TestPropertySource` entry to fix one test
adds a full context refresh for the whole class.

`@TestPropertySource` has a higher precedence than almost everything else — it sits at
position 2 in the ladder from Volume 1, above command-line arguments and environment
variables. That is correct for a test, and it is also why a test that sets a property in
`@TestPropertySource` cannot be made to fail by setting the same property in the
environment. Every team needs to know this.

`@DirtiesContext` is the expensive escape hatch:

```java
@Test @DirtiesContext                              // AFTER the test method, before the next
@DirtiesContext(classMode = BEFORE_CLASS)          // before the first test in the class
@DirtiesContext(methodMode = AFTER_METHOD)         // the default
class CacheInvalidationTest { }
```

It marks the context dirty, so the next test class cannot reuse it and rebuilds from
scratch. The honest framing: **every `@DirtiesContext` is a statement that test state is
leaking, and the cost is charged to the entire suite rather than to the test that caused
the leak.**

> **STAFF-LEVEL CONSIDERATION**
>
> Test profiles that differ from production are the single most common source of "passes in
> CI, fails in prod", and the reason is structural rather than careless. A test profile is a
> *place where someone gets to make the application easier to test*, and every such
> relaxation is invisible unless someone deliberately goes looking. The settings that must
> be **identical** between the test profile and production are the ones that change
> behaviour under load and at the edges:
>
> | Setting | Typical test value | The bug it hides |
> | --- | --- | --- |
> | `spring.jpa.open-in-view` | `false` in tests, default `true` in prod | Lazy loading works in tests and throws `LazyInitializationException` in prod |
> | Connection pool size | Tiny, or 1 | Starvation and cascade failure at real concurrency |
> | HTTP client timeouts | Long, or absent | Latency is invisible; the retry storm never shows up |
> | `spring.jpa.show-sql` / logging | `true` | Log volume alone changes timings |
> | Lazy initialisation | `true` in tests | Startup work moves to the first request in prod |
> | Feature flags | All on, or all off | Combination bugs only appear in the real combination |
> | `server.forward-headers-strategy`, locale, charset | Often unset | Routing and encoding differ between environments |
>
> The rule that follows: **a test profile may differ from production in where it points, never in how the application behaves.** Pointing at a container instead of a developer's laptop is correct. Halving a pool size or dropping a timeout is a behavioural change that removes exactly the code path you need to be testing. Volume 1 Chapter 7 covers the precedence mechanics; this is the operational consequence.

#### Common Mistakes

- Using `@SpringBootTest` for logic that has no container in it, and paying 5 seconds per
  class to assert something a plain `new` could assert.
- Reaching for `@MockitoBean` inside a slice until the slice is no longer a slice.
- Adding `@TestPropertySource` to a single test to work around a leak, and paying a full
  context refresh for the class — plus changing the context's position in the precedence
  ladder.
- Using `@DirtiesContext` as synchronisation rather than as a marker of leaked state.
- `DEFINED_PORT` in a suite that also runs in parallel, or locally alongside a running
  application.
- Assuming `MOCK` means the web layer is untested. `MockRestServiceServer` and
  `TestRestTemplate` both work under it.
- Raising `spring.test.context.cache.maxSize` when the real problem is that every class has
  a distinct configuration.

#### Interview Questions — Boot Test Annotations

**Q1. What does the Spring test context cache actually key on, and why does that matter?**
`TRICKY`

It keys on the `MergedContextConfiguration` — the set of classes, locations, active
profiles, property sources, context customizers and parent that determine the shape of the
context. Test classes with the same key share one live `ApplicationContext`. This matters
because the cost of a suite is the number of *distinct* configurations times the refresh
time, not the number of tests — so thirty classes with one configuration refresh once, and
thirty classes that each add a `@TestPropertySource` or a `@MockitoBean` refresh thirty
times. It also matters for correctness: a shared context means a shared singleton, so state
leaks between classes that reuse it.

**Q2. When is `@SpringBootTest` the wrong annotation?** `STAFF`

When the thing under test is not the container. A service with a repository and a clock has
nothing to prove in a full context — the context tells you the beans exist, which a slice
or a plain unit test with a mock collaborator tells you more cheaply. The rule is that the
high-level tier is worth its cost exactly when the container *is* the subject: wiring,
conditional beans, configuration binding, transaction proxies, filter registration. The
stronger staff framing is the cost asymmetry — a full context is 5 seconds and a shared
resource, so putting 400 of them in a 400-test suite is 33 minutes of waiting that produces
no signal.

**Q3. A slice test needs a mocked collaborator. Is that acceptable?** `TRICKY`

Usually it is a signal the assertion is at the wrong level. `@WebMvcTest` plus three mocked
services is not a slice — it is a slow `@SpringBootTest` that has also removed the wiring
the slice existed to check. The right move is to split: test the collaboration contract
(controller → service argument shapes, service → repository) as plain unit tests with no
Spring at all, and keep the slice for what only it can prove — message conversion,
validation, status codes, `@ControllerAdvice` handling. `@MockitoBean` on a slice is
acceptable when the collaborator is genuinely outside the slice's concern and the slice
exists for something else, but it should be the exception you can name, not the default.

**Q4. `@MockBean` versus `@MockitoBean` — what changed and when?** `ADVANCED`

`@MockBean` and `@SpyBean` (from `spring-boot-test`) are **deprecated as of Spring Boot
3.4** in favour of `@MockitoBean` and `@MockitoSpyBean` in the Spring Framework
(`org.springframework.test.context.bean.override.mockito`). The move puts the capability
in the framework so bean overriding works in any test context, not just Boot's. It is not
a pure rename: `@MockitoBean` is not supported on `@Configuration` classes, so
configurations that declared `@MockBean` on a `@Configuration` class have to be
restructured to declare it on test-class fields. Anyone still writing `@MockBean` on
Boot 3.4+ is writing deprecated API.

**Q5. Explain `webEnvironment = MOCK` vs `RANDOM_PORT`, including what MOCK does *not*
mean.** `TRICKY`

`MOCK` builds a web application context with a mock servlet environment — no socket, no
real container, but `DispatcherServlet`, filters, message converters and the whole MVC stack
are real, and `TestRestTemplate` and `WebTestClient` are bound to it via
`MockRestServiceServer`. `RANDOM_PORT` starts a real server on an ephemeral port, so real
HTTP and real serialisation are involved. The thing people get wrong is that `MOCK` does
not mean "web is untested" — it means "the container is not under test", and a controller
test that needs the socket is testing the wrong layer. What `MOCK` genuinely cannot catch:
container-level filter registration, character-encoding defaults, error-page dispatch, and
static resource handling.

**Q6. A suite of 400 tests takes 35 minutes. Walk through the diagnosis.** `STAFF`

Count distinct context configurations, not tests — the context cache keys on the
`MergedContextConfiguration`, so the refresh count is the number of distinct combinations
of profile, property source, web environment and mock annotations. Then: how many classes
use `@SpringBootTest` when a slice would do; how many `@DirtiesContext` occurrences are
evicting a shared context and forcing rebuilds; whether the cache is thrashing past its
default size of 32; and whether a `HikariDataSource` in each cached context is holding
connections to a shared database, which is both a slowness and a resource-leak problem.
The fix order is reduce distinct configurations, then replace full contexts with slices,
then address the actual leaked state behind the `@DirtiesContext`s.

**Q7. Why do test profiles so often diverge from production, and what is the real risk?**
`STAFF`

Because a test profile is the one place a developer can make the application easier to
work with, and every relaxation is invisible by construction. The dangerous divergences are
the behavioural ones, not the environmental ones: open-in-view disabled in tests so lazy
loading looks fine, a smaller connection pool so tests don't need concurrency, generous or
absent timeouts so latency is invisible, and feature flags all-on so no combination is ever
exercised. The rule that holds is that a test profile may differ from production in *where
it points* and never in *how the application behaves* — which means pool size, timeouts,
open-in-view, lazy-init and flag defaults have to match, and the ones that can't match
should be asserted explicitly rather than assumed.

> **CHAPTER 2 SUMMARY**
>
> `@SpringBootTest` earns its cost only when the container is the subject — wiring, binding,
> conditionals, proxying — because a unit test structurally cannot see any of it. Its real
> hidden cost is the context cache: cost scales with the number of *distinct* configurations,
> not the number of tests, and every `@TestPropertySource`, `@MockitoBean` and profile
> combination multiplies it. The slice annotations are the answer to that, with one design
> rule that must be enforced in review: a slice that needs mocked collaborators is
> testing too much. `@MockBean` is deprecated as of Boot 3.4 in favour of the Framework's
> `@MockitoBean`, which is not a rename because it cannot go on `@Configuration` classes.
> And the recurring production failure is the test profile that behaves differently from
> production — pools, timeouts, open-in-view, flags.

#### Further Reading

- [Spring Boot 3.4 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.4-Release-Notes) — the authoritative statement of the `@MockBean`/`@MockitoBean` deprecation and the `@Configuration`-class restriction that makes it a migration.
- [Spring Framework Reference — `@MockitoBean`](https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html) — the bean-override mechanism the replacement is built on, and the difference from a plain Mockito `@Mock`.
- [Spring Framework Reference — MockMvc](https://docs.spring.io/spring-framework/reference/testing/mockmvc.html) — standalone versus context-backed MockMvc, and the assertion DSL.
- [Spring Boot Reference — Testing Spring Boot Applications](https://docs.spring.io/spring-boot/reference/testing/spring-boot-applications.html) — the slice annotations, the context cache, and `webEnvironment` in one page.

## Chapter 3 — Testcontainers

### 3.1 What It Is and the Basic Shape

Testcontainers starts a real Docker container, waits for it to be ready, and hands your
context a `DataSource` (or a broker, or an emulator) pointed at it. The value is not
convenience — it is that the database under test is the database in production, which means
the SQL, the dialect, the locking and the constraints are the real ones.

```java
// ── The pre-3.1 form, which you will still read in a lot of codebases ──
@Testcontainers
class OrderRepositoryIT {

    @Container
    static PostgreSQLContainer<?> postgres = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("orders")
            .withUsername("test")
            .withPassword("test");

    @DynamicPropertySource
    static void datasource(DynamicPropertyRegistry registry) {           // boilerplate
        registry.add("spring.datasource.url", postgres::getJdbcUrl);
        registry.add("spring.datasource.username", postgres::getUsername);
        registry.add("spring.datasource.password", postgres::getPassword);
    }
}
```

### 3.2 `@ServiceConnection` — the Boilerplate That Went Away

**Spring Boot 3.1 introduced `@ServiceConnection`**, and it removes the
`@DynamicPropertySource` block entirely. The annotation goes on the container field, the
container implements `ServiceConnection` (the built-in database and broker modules already
do), and Boot derives the connection details and contributes them to the context.

```java
// ── Boot 3.1+ — no @DynamicPropertySource ─────────────────────────
@Testcontainers
@SpringBootTest
class OrderRepositoryIT {

    @Container
    @ServiceConnection                     // Boot reads the JDBC URL, user, password from the container
    static PostgreSQLContainer<?> postgres =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("orders")
                    .withInitScript("db/migration.sql");   // Flyway/Liquibase runs against it

    @Autowired OrderRepository repo;

    @Test
    void enforcesUniqueSkuPerTenant() {
        // ...
    }
}
```

Why this matters beyond line count: with `@DynamicPropertySource` you hand-write the
property *names*, and a typo there produces a context that quietly starts against
whatever else was on the classpath. `@ServiceConnection` uses the container's own
metadata, so the mapping can't be wrong, and adding a second container (Postgres plus
Kafka plus Redis) doesn't multiply the boilerplate.

> **PRODUCTION RELEVANCE**
>
> Container-backed tests also make a specific class of production failure reproducible for
> the first time: a migration that doesn't apply cleanly against a real Postgres, a
> constraint that H2 accepted and Postgres rejects, a query that uses a function H2 emulates
> and Postgres does not have. Those bugs are not hypothetical — they are the reason a
> service can be green for six months and then fail its first production migration, which
> is one of the most expensive ways to find out, because it lands as an incident rather
> than a test failure.

### 3.3 Why Real Containers Beat H2 — the Specific Bugs

H2 in PostgreSQL-compatibility mode is genuinely useful and genuinely dangerous, and the
honest framing is that it buys speed by changing the thing you are testing.

| What differs | H2 (even in PG mode) | PostgreSQL | The bug H2 hides |
| --- | --- | --- | --- |
| MVCC | Own implementation; historically different visibility rules | True MVCC with per-statement snapshots | A test passes on H2, a concurrent transaction in prod sees a row it shouldn't — or doesn't see one it should |
| Isolation defaults | `READ COMMITTED`, but semantics differ subtly | `READ COMMITTED` with defined snapshot-per-statement behaviour | Lost-update and anomaly tests that pass locally and fail under real concurrency |
| Type system | Wider, looser; implicit casts that Postgres rejects | Stricter, e.g. no implicit `varchar` → `integer` | A JPQL/HQL query that compiles against H2 and throws `PSQLException` in prod |
| Functions | Emulates a subset | Full set, plus extensions | `DATE_TRUNC`, `ILIKE`, `generate_series`, `jsonb` operators — all commonly missing |
| `LIMIT/OFFSET` | Supported, but edge semantics differ | `OFFSET` without `ORDER BY` is non-deterministic; `FETCH FIRST` differs | Pagination tests that pass and return rows in a different order under load |
| Case/collation | Case-sensitive by default | Locale- and database-collation-dependent | A unique-constraint test on `Email` that passes locally and collides in prod on a case-insensitive collation |
| Date/time | `TIMESTAMP` semantics simplified | `timestamptz` vs `timestamp` distinction is real | Timezone bugs: a `timestamp without time zone` written and read in two zones |
| Locking | Simulated | Real `SELECT FOR UPDATE` / `SKIP LOCKED` | Queue-worker tests that pass and double-process in prod because the row lock was never real |
| Boolean/empty string | `''` and `FALSE` behave differently | Oracle-compat mode aside, `''` is distinct | Validation tests that pass because an empty string is falsy in H2 |

MySQL versus Postgres is worse, not better: MySQL's default collation is
case-insensitive and its `datetime` has no timezone, and neither of those is true in
Postgres. A test suite on H2 emulating MySQL has a portability story that is a work of
fiction.

> **MUST REMEMBER**
>
> **Mock at your process boundary; run against your data boundary.** Outbound HTTP, message
> brokers, clocks and randomness get faked. Databases get containers. The reason is not
> ideology — it is that a database is the collaborator whose *behaviour under your exact
> query* is what you are testing, whereas an HTTP client is a collaborator whose *contract
> is a small set of documented responses*. Mock the second, run the first.

### 3.4 The Cost, and the Fix

Container start-up dominates: a Postgres container is typically 1–3 seconds to become
ready, and pulling the image the first time is 30–60 seconds. The naive pattern —
one container per test class — turns a 60-second suite into a 25-minute one.

The fix is a **singleton container shared by the whole suite**:

```java
// ── ONE container for the entire run; per-class schema, per-test cleanup ──
public abstract class PostgresITBase {

    @Container
    @ServiceConnection
    static final PostgreSQLContainer<?> POSTGRES =
            new PostgreSQLContainer<>("postgres:16-alpine")
                    .withDatabaseName("test")
                    .withReuse(true);       // see 3.5 — this line is the dangerous one

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("spring.datasource.url", POSTGRES::getJdbcUrl);
    }
}
```

Two distinct techniques are often confused here, and both are needed:

| Technique | Mechanism | Effect |
| --- | --- | --- |
| Static `@Container` in a base class | JUnit inherits the field, so one container for all subclasses | One start for the whole run |
| Database isolation per class | A unique schema or database per class, switched by a `@DynamicPropertySource` | Tests can run in parallel without colliding |
| Transaction rollback per test | `@Transactional` on the test | Clean state with no delete statements |

`@ServiceConnection` and `@DynamicPropertySource` can coexist: the base class supplies the
connection statically, and the subclass adds a per-class schema name through a second
`@DynamicPropertySource` method.

### 3.5 `withReuse(true)` — and Why It Is Dangerous in CI

`withReuse(true)` makes the container survive between JVM runs. It exists for a real
reason — a developer's local loop pays the start-up cost on every `mvn test` invocation, and
reuse removes it entirely, which is the difference between a 3-second and a 40-second inner
loop.

It is also the mechanism behind a class of baffling local-only failures:

```text
Container "postgres:16-alpine" is reused.  Its data directory still contains the
schema from the previous run, including migrations you have since deleted.

  - the schema has a table from a migration you reverted   → tests pass locally
  - Flyway's baseline was created on first run             → migrations are skipped
  - you are debugging against data you don't know about    → a test "fixes" itself
```

Reuse requires a `testcontainers.reuse.enable=true` opt-in on the consuming side, which is
the correct design — but it means the behaviour differs between "I ran it once" and "someone
else ran it", and between local and CI. The rule that holds: **reuse is a local
developer-loop optimisation, never a CI configuration.** CI should start from a known-empty
container every run, because the whole value of a green build is that it means something.

> **SCALING REALITY CHECK**
>
> The cost picture inverts by environment. On a laptop with Docker Desktop, per-class
> containers at 2 seconds × 60 classes is a 2-minute suite and teams accept it for the
> isolation. On a CI runner with 8 parallel shards and a 5-minute total budget, a 60-second
> image pull per shard is most of the budget. Which means: pin the image tag and pre-pull
> it in the build image (`FROM postgres:16-alpine` as a build stage, or a `docker pull` step),
> share one container per JVM, and if the suite is still too slow, split it rather than
> going back to H2 — because the alternative is a suite that is fast and wrong.

### 3.6 Testcontainers Cloud and the Licensing Question

Testcontainers for Java is Apache 2.0 — free, including the database and broker modules.
Testcontainers Cloud is a commercial hosted product: it removes the Docker requirement
entirely by running the containers in a remote environment, which is the answer to
"our CI runners don't allow Docker in the build step" and "our developers are on machines
where a Docker daemon doesn't work."

The licensing question to have an answer for: the core library and all the module
contributions are Apache 2.0 and stay that way, but a cloud product that your *tests*
depend on is a new external dependency in your build, and it changes what a developer can
do offline. The staff-level framing is that this is a build-infrastructure dependency with
a different failure mode from a library dependency — if the cloud is unreachable, your test
suite does not run, and that is a build outage you did not previously have.

Docker-in-CI constraints are worth knowing by name even if you use the cloud: rootless
Docker, the DinD daemon service, `--privileged`, and the cgroup/overlay filesystem issues
that break a nested daemon on a managed runner. Most of them are solved by the provider's
own build service, and all of them are a reason a team might choose the managed path.

### 3.7 What Still Needs a Mock

You mock **outbound** boundaries. Three of them, and the pattern is the same: a fake server
you control, bound at the HTTP layer rather than at the interface layer.

```java
// ── WireMock: a real HTTP server, deterministic responses, real serialisation ──
@SpringBootTest
class PaymentClientIT {

    @RegisterExtension
    static WireMockExtension paymentServer = WireMockExtension.newInstance()
            .options(wireMockConfig().dynamicPort())
            .build();

    @DynamicPropertySource
    static void props(DynamicPropertyRegistry r) {
        r.add("payment.gateway-url", paymentServer::baseUrl);
    }

    @Test
    void retriesOnceOnDecline() {
        paymentServer.stubFor(post("/charges").willReturn(aResponse().withStatus(402)));

        assertThatThrownBy(() -> client.charge(Money.of(10)))
                .isInstanceOf(PaymentDeclinedException.class);
    }
}
```

Why WireMock rather than a mocked `PaymentClient` bean: the test now exercises the real
serialiser, the real HTTP client configuration, the real error-mapping code, and the real
timeout behaviour. A mocked `PaymentClient` skips every one of those, and the interesting
failures in an HTTP client live exactly there — a missing content type, a body that
deserialises differently than expected, a 500 that maps to the wrong exception.

**Mock databases, HTTP, brokers, clocks and randomness. Do not mock the database.** A
mocked repository proves that the service calls `findById` and that it branches on the
result; it cannot prove that the query exists, that the mapping is right, that the
constraint fires, or that the transaction rolls back. And it will pass identically on a
schema where the column was renamed.

#### Common Mistakes

- Using H2 in PostgreSQL-compatibility mode as a permanent answer. It is a fast test aid
  and a poor substitute; the compatibility mode emulates syntax, not semantics.
- One container per test class. It multiplies the dominant cost of the tier by the number
  of classes.
- `withReuse(true)` in CI, where the value of a green build is that it means something.
- Reaching for H2 the moment the container suite gets slow, which trades the suite's
  correctness for its wall-clock time and loses the thing that justified the tier.
- Mocking outbound HTTP at the interface level instead of standing up a fake server, which
  skips serialisation, error mapping and timeouts.
- Writing `@DynamicPropertySource` property names by hand when `@ServiceConnection` can
  derive them — a typo there silently starts the context against something else.
- Assuming a container test is parallel-safe. The container is shared; the *schema* is not
  unless you make it per-class.

#### Interview Questions — Testcontainers

**Q1. Why does H2 in PostgreSQL-compatibility mode still let production bugs through? Give
three concrete ones.** `TRICKY`

Because the mode emulates syntax, not semantics. Three concrete cases: (1) MVCC and
isolation differ, so a lost-update or anomaly test passes locally and fails under real
concurrency in prod; (2) Postgres is stricter about implicit casts, so a JPQL query that
compiles against H2 throws a `PSQLException` against Postgres; (3) `SELECT FOR UPDATE` is
simulated rather than real, so a queue-worker test that uses it to prove single-processing
passes while production double-processes because the row lock was never genuinely taken.
Others worth naming: collation (case-insensitive uniqueness), `timestamptz` vs `timestamp`,
and functions like `DATE_TRUNC` and `jsonb` operators that H2 may not have at all.

**Q2. What does `@ServiceConnection` actually do that `@DynamicPropertySource` doesn't?**
`ADVANCED`

It's a Boot 3.1+ annotation that puts the container on the context's connection-factory
list. The container (which implements `ServiceConnection`) supplies its own connection
metadata — JDBC URL, username, password, or broker address — and Boot contributes it as a
high-precedence `ConnectionDetails` bean that the `DataSource` or broker auto-configuration
binds. The concrete win is that `@DynamicPropertySource` requires you to hand-write the
*property names*, and a typo there produces a context that quietly starts against
whatever else is on the classpath, with no error.

**Q3. A container-backed suite went from 3 minutes to 25. What are the causes in order?**
`STAFF`

In order: a container per test class rather than one per JVM (the dominant cause —
inherited static `@Container` in a base class fixes it); the image being pulled on every
run rather than pre-pulled in the build image; each container running its own migration
from scratch; and `@DirtiesContext` forcing context rebuilds on top of that. The image-pull
one is specifically a CI problem and the fix is to add the image to the build stage or run
a `docker pull` step in the pipeline, which is cheap and invisible until you measure it.

**Q4. When is `withReuse(true)` the right choice, and what is the risk?** `TRICKY`

It's the right choice on a developer's machine, where a 2-second container start on every
`mvn test` is a real tax on the inner loop. The risk is that the container's data directory
survives between runs: a schema from a migration you've since deleted is still there, a
Flyway baseline was created on the first run so migrations get skipped, and you are
debugging against data you didn't create. Because reuse requires an explicit opt-in on the
consuming side, the behaviour differs between "I ran it once" and "someone else ran it" —
which is exactly why it should be a local-only setting and never a CI one.

**Q5. Why mock outbound HTTP but never the database?** `STAFF`

Because they are different kinds of collaborator. An HTTP client's contract is a small
documented set of responses, and the interesting behaviour is in *your* code's handling of
them — serialisation, error mapping, timeout, retry — which a mocked interface skips
entirely. A database's contract is the actual behaviour of your SQL against your schema
under your concurrency, which is precisely what you cannot fake: the mocked repository
proves the service calls `findById` and branches on the result, and passes identically on a
schema where the column was renamed. WireMock stands up a real HTTP server so the client
path is exercised; Testcontainers stands up a real database so the query path is. Mock at
the process boundary, run against the data boundary.

**Q6. A team runs its integration tests against a shared staging database. What are the
three problems, and what replaces it?** `STAFF`

Isolation (tests collide with each other and with real traffic, and parallel runs are
impossible), determinism (someone else's deploy breaks your build), and leak (test data
accumulates and, worse, a test that truncates a table breaks the running application). The
replacement is a container per JVM with a per-class schema, or a per-run database, started
by the build rather than shared by it. The objection to hear is speed, and the honest
response is that the shared-staging setup is slower once you count retries, the
serialisation it forces, and the human time spent diagnosing someone else's data.

> **CHAPTER 3 SUMMARY**
>
> Testcontainers is the tier that makes the data boundary real, and its value is
> specifically the bugs H2 cannot catch: MVCC and isolation semantics, strict casts,
> real `SELECT FOR UPDATE` locking, collation, `timestamptz`, and functions H2 does not
> have. `@ServiceConnection` (Boot 3.1+) removes the `@DynamicPropertySource` boilerplate
> and, more importantly, the hand-written property-name typos that come with it. The cost
> is container start-up, and the fix is a singleton container for the whole JVM with a
> per-class schema — not per-class containers and not a retreat to H2. `withReuse(true)`
> is a developer-loop optimisation and belongs in exactly zero CI configurations, because a
> green build's value is that it means something. Mock outbound HTTP with a real fake
> server like WireMock; run the database.

#### Further Reading

- [Testcontainers for Java](https://java.testcontainers.org/) — the module list, the supported databases and brokers, and the `@ServiceConnection` integration.
- [Spring Boot Reference — Testcontainers](https://docs.spring.io/spring-boot/reference/testing/testcontainers.html) — how Boot discovers containers, `@ServiceConnection`, dynamic properties, and the per-test lifecycle.
- [Testcontainers — Reusing a container](https://github.com/testcontainers/testcontainers-java/blob/main/docs/features/reuse.md) — the exact semantics and the opt-in mechanism behind `withReuse(true)`, and why it is a local-only setting.
- [WireMock](https://wiremock.org/) — the reference for faking outbound HTTP at the server boundary rather than the interface boundary.

## Chapter 4 — Mocking & Test Design

### 4.1 `@Mock`, `@Spy`, `@InjectMocks` and the Constructor Question

```java
@ExtendWith(MockitoExtension.class)
class OrderServiceTest {

    @Mock  OrderRepository orders;          // a fake object: returns defaults, records calls
    @Mock  PaymentClient payment;           // never calls the real constructor
    @Spy   AuditClock clock;                // REAL object, with calls recorded

    @InjectMocks OrderService service;      // Mockito constructs the class and injects
}
```

| Annotation | What it is | Fails when |
| --- | --- | --- |
| `@Mock` | A subclass instance created without calling a constructor; all methods stubbed to defaults | You need real behaviour from the type |
| `@Spy` | A **real** instance whose calls are recorded and can be partially stubbed | You don't need to override anything — then it is not a spy, it is just a real object |
| `@InjectMocks` | Mockito constructs your class under test and injects the mocks | There are two of the same type, or the type has no usable constructor |

`@InjectMocks` interacts with your injection style, and the interaction is the thing people
get wrong:

- **Constructor injection** — Mockito picks the constructor with the **largest** number of
  arguments and passes the mocks positionally, by type. If two arguments share a type the
  assignment is arbitrary, and Mockito does not warn clearly.
- **Setter or field injection** — Mockito injects by **type first, then by name**. With two
  mocks of the same type, the one whose field name matches wins.

```java
// ── The @InjectMocks trap that bites everyone ─────────────────────
class Checkout {
    private final PaymentClient payment;
    private final PaymentClient fraudCheck;      // same type!
    Checkout(PaymentClient payment, PaymentClient fraudCheck) { ... }
}

@Mock PaymentClient payment;
@Mock PaymentClient fraudCheck;    // Mockito picks the biggest constructor and assigns
                                   // by type — declaration order is not guaranteed, and
                                   // a swap is invisible.

// The fix: build the subject explicitly. Always.
class CheckoutTest {
    private final Checkout checkout = new Checkout(payment, fraudCheck);
}
```

> **MUST REMEMBER**
>
> **Construct the subject under test yourself.** `@InjectMocks` is a convenience that hides
> the thing you most want the compiler to check. An explicit `new Checkout(payment,
> fraudCheck)` fails to compile the moment a dependency is added, added in the wrong order,
> or of the wrong type — and it makes the test's own wiring visible, which is usually the
> fastest way to discover that you have mocked too much. The rule: `@InjectMocks` for a
> class with one dependency, explicit construction for everything else.

`MockitoExtension` also has a strictness mode worth understanding, because it turns a
whole class of silent test rot into a failure. The default `STRICT_STUBS` reports
`UnnecessaryStubbingException` when a stub is set but never used, and
`PotentialStubbingProblem` when a call arrives with arguments no stubbing declared. Both
are features. Both are commonly disabled by a team annoyed by the noise, which is exactly
the wrong response, because both messages are pointing at a test that is not testing what
its author thought.

### 4.2 Argument Captors, `verify`, and `verifyNoMoreInteractions`

```java
// ── verify: "did this happen" ────────────────────────────────────
verify(payment).charge(bigDecimal("10.00"));
verify(payment, times(3)).charge(any());
verify(payment, never()).refund(any());
verifyNoInteractions(payment);              // never touched at all

// ── verifyNoMoreInteractions: "and nothing ELSE happened" ───────
verify(payment).charge(bigDecimal("10.00"));
verifyNoMoreInteractions(payment);          // any call not verified above = failure
```

`verifyNoMoreInteractions` reliably produces false failures, and understanding why teaches
the whole design lesson of this chapter. It fails on any call to the mock you did not
explicitly verify — **including calls the code under test makes for reasons unrelated to
your assertion**, such as a `toString()` inside a log statement or a `hashCode()` when the
mock goes into a set. When you want "these calls and no others", the right tools are
`InOrder` plus specific verifications, or `verifyNoMoreInteractions` on a mock that exists
*only* for the thing being asserted.

```java
// ── ArgumentCaptor: "with WHAT arguments" ────────────────────────
ArgumentCaptor<ChargeRequest> captor = ArgumentCaptor.forClass(ChargeRequest.class);
verify(payment, times(2)).charge(captor.capture());

List<ChargeRequest> all = captor.getAllValues();
assertThat(all.get(0).orderId()).isEqualTo("A-1");
assertThat(all.get(1).orderId()).isEqualTo("A-2");
```

The common misuse is reaching for a captor where a single conditional assertion reads
better. `argThat` is the tool for a conditional, and it usually states the intent more
directly:

```java
verify(payment).charge(argThat(r -> r.orderId().equals("A-1") && r.amount().signum() > 0));
```

### 4.3 The Stubbing Pitfalls That Cost Real Debugging Hours

**Pitfall 1 — stubbing with the wrong argument.** A stub whose matcher does not match
returns the default (`null`, `0`, `false`) rather than failing, and the test then fails
somewhere else with a message pointing nowhere near the cause:

```java
when(repo.findById("order-1")).thenReturn(order);          // the test calls findById("order-1")
assertThat(service.place("order-2")) ...                    //   → null → NullPointerException
```

`STRICT_STUBS` converts this into a `PotentialStubbingProblem` at the exact call site, which
is why it should be left on.

**Pitfall 2 — mixing raw values with matchers.** Once you use any of `any()`, `eq()`,
`argThat()`, *every* argument must be a matcher. Mixing them throws
`InvalidUseOfMatchersException` at the *next* Mockito interaction, not at the line that
caused it — an exception message that points at the wrong file entirely.

```java
when(repo.findById(eq("order-1"), any()))    // correct
when(repo.findById("order-1", any()))        // InvalidUseOfMatchersException, reported later
```

**Pitfall 3 — `thenReturn` versus `thenAnswer` for a changing value.** A stub returns the
same value on every call, so a test expecting different values per call needs an answer:

```java
// WRONG — the same Order comes back for all three calls
when(repo.findAll()).thenReturn(List.of(o1), List.of(o2), List.of(o3));

// ALSO WRONG — the same List instance each time; mutating it corrupts the fixture
when(repo.findAll()).thenReturn(list);

// RIGHT — one invocation at a time
when(repo.findAll()).thenReturn(List.of(o1)).thenReturn(List.of(o2)).thenReturn(List.of(o3));

// RIGHT — a function of the call, for stateful collaborators
when(repo.findAll()).thenAnswer(inv -> cursor.next());

// RIGHT — a fresh value derived from the argument
when(repo.save(any())).thenAnswer(inv -> withId((Order) inv.getArgument(0), nextId()));
```

**Pitfall 4 — `any()` matches `null` too.** From Mockito 2 onward, `any()` matches `null`
and `any(Class)` does not. A stub written as `when(repo.save(any(Order.class)))` will not
match a `null` argument, and the test fails with a null-related error rather than a stubbing
one.

**Pitfall 5 — stubbing a spy.** `when(spy.method()).thenReturn(x)` on a spy actually *calls
the real method* during stubbing. Use `doReturn(x).when(spy).method()` instead, which does
not. This bites anyone who spies on a real object whose constructor touches the database.

### 4.4 The Design Content: Over-Mocking Re-Implementation

This is the section that matters, and it answers "how much mocking is too much".

```java
@Mock OrderRepository orders;
@Mock InventoryClient inventory;
@Mock PaymentClient payment;
@Mock AuditLog audit;
@Mock NotificationClient notify;

@Test
void placeOrder() {
    given(orders.save(any())).willReturn(order);
    given(inventory.reserve(anyString())).willReturn(RESERVED);
    given(payment.charge(any())).willReturn(APPROVED);

    service.place(command);

    verify(orders).save(any());
    verify(inventory).reserve("A-1");
    verify(payment).charge(bigDecimal("10.00"));
    verify(audit).record(any());
    verify(notify).orderPlaced(any());
}
```

What does that test assert? That the class **calls its collaborators**. Every mock returns
a value the test itself chose, so no real logic runs, and the assertions confirm only that
five methods were invoked. It fails on every refactoring — rename a field, reorder two
calls, extract a private method — and it does not fail if the business logic is inverted. If
`place` charges the customer twice and notifies once, this test passes, because it was
written against the shape of the old code.

The general form: **a test that mocks every collaborator re-implements the production code
inside the test.** Two descriptions of the same behaviour now exist, and they will diverge.

> **STAFF-LEVEL CONSIDERATION**
>
> The cost of over-mocking is not test quality, it is *review throughput*. An over-mocked
> suite fails on every refactoring, so teams stop refactoring — or they add `verify` calls
> back one at a time to make a PR green, which is a manual version of the same work. The
> symptom to watch for is a suite where every PR needs two or three "fix the mock" commits.
> That is not a testing problem; it is a signal that the suite has become a second
> implementation of the system which must be updated in lockstep. The correction is
> structural, not stylistic: move the assertions up to the level where the real logic lives,
> and mock only at the process boundary.

> **MUST REMEMBER**
>
> **Mock at your process boundary, not at your class boundary.** The process boundaries are
> outbound HTTP, message brokers, the clock, randomness, the filesystem — and the database,
> which you should *run* rather than mock (Chapter 3). Everything inside the process that
> contains real logic is a candidate for a **fake** or a **real object**. A useful test: if
> your mock has no I/O in it, you probably should not have mocked it.

### 4.5 Test Data: Why a Builder and Not a Constructor Call

Test data is the most-repeated code in most suites, and it is where the compile-error
argument actually lives.

```java
// ── Literals: the version that breaks 400 times ──────────────────
new Order("ord-1", "cus-9", "SKU-ABC", 2, "PENDING", Instant.parse("2026-01-01T00:00:00Z"), null);

// Add a field `currency` to Order. How many call sites break? Every one — and they
// break in test files, so the error message points at a test.
```

```java
// ── Builder: the version that breaks once ────────────────────────
public class OrderBuilder {
    private String id = "ord-default";
    private String customerId = "cus-default";
    private String sku = "SKU-DEFAULT";
    private int quantity = 1;
    private OrderStatus status = OrderStatus.PENDING;
    private Instant placedAt = Instant.parse("2026-01-01T00:00:00Z");
    private Money total = Money.zero("GBP");

    public OrderBuilder id(String v)            { this.id = v; return this; }
    public OrderBuilder customer(String v)      { this.customerId = v; return this; }
    public OrderBuilder sku(String v)           { this.sku = v; return this; }
    public OrderBuilder quantity(int v)        { this.quantity = v; return this; }
    public OrderBuilder status(OrderStatus v)  { this.status = v; return this; }
    public OrderBuilder placedAt(Instant v)    { this.placedAt = v; return this; }
    public OrderBuilder total(Money v)          { this.total = v; return this; }

    public Order build() { return new Order(id, customerId, sku, quantity, status, placedAt, total); }
}

// Usage: only the fields the test actually cares about are named.
Order o = new OrderBuilder().customer("cus-9").status(PAID).build();
```

The stated reason, precisely: **a domain change becomes one compile error in the builder
instead of four hundred broken literals.** The second reason matters just as much for
readability — a test reading `new OrderBuilder().customer("cus-9").status(PAID)` declares
its own preconditions, where a nine-argument positional call forces the reader to count to
find out which one is the status.

| Approach | Good for | Fails when |
| --- | --- | --- |
| Builder | The default for domain objects in tests | The object is trivial (2–3 fields, no invariants) |
| Object Mother / named factory | A **small, stable** set of recurring scenarios (`OrderMother.paidOrder()`) | The set grows past ~10 — then it is a builder with a shared, stale API |
| Static fixtures | Deeply nested, read-only structures you never vary | Anything a test needs to modify |
| Random/valid-data generators | Property-based and load tests (4.6) | A test needs a specific value to be meaningful |

The Object Mother deserves a specific warning, because it is a pattern teams adopt and then
regret. An object mother is fine for *scenarios* — "a paid order" means something
business-wide — and becomes a liability the moment a test needs a variant, because adding
`paidOrderWithDiscount()` changes a shared API every other test can see. A builder with two
or three named static shortcuts on top gives you the readability without the shared
mutability.

### 4.6 Randomised and Property-Based Testing

The complaint that motivates it: "my test data never hits the interesting case." Fixed
fixtures test the cases the author already thought of. The interesting cases are in the gaps
— the empty list, the value at the boundary, the input that overflows.

```java
// ── jqwik: properties, not examples ──────────────────────────────
@Property
void totalIsNeverNegative(@ForAll @IntRange(min = 0) int quantity,
                          @ForAll @BigRange(min = "0.01") BigDecimal unitPrice) {
    Money total = pricing.total(quantity, unitPrice);
    assertThat(total.amount()).isGreaterThanOrEqualTo(BigDecimal.ZERO);
}

@Property
void discountNeverExceedsSubtotal(@ForAll @MoneyAmount Money subtotal,
                                  @ForAll @IntRange(min = 0, max = 100) int percentOff) {
    Money discounted = pricing.discount(subtotal, percentOff);
    assertThat(discounted.amount()).isLessThanOrEqualTo(subtotal.amount());
}

@Property
void roundTripPreservesValue(@ForAll Money m) {
    assertThat(deserialise(serialise(m))).isEqualTo(m);   // the JSON round-trip property
}
```

The value is disproportionate for the amount of code. One property — *a discount never
exceeds the subtotal* — covers every combination of every amount and percentage, including
the boundary cases nobody would write by hand, and finds the off-by-one on the day it is
written rather than in production. The standard JVM tool is **jqwik**: it plugs into JUnit
5 and, critically, **shrinks a failing case to a minimal reproducing input**, which is the
feature that makes property-based tests debuggable in a real team rather than a fuzz
harness that finds a bug nobody can act on.

> **TRADE-OFF**
>
> Property-based tests are excellent at finding invariant violations and poor at communicating
> *intent*. A test named `discountNeverExceedsSubtotal` documents a business rule; a test
> named `testDiscount7` documents a number someone picked. The flip condition for leaning
> on them is that the property must be one a human would recognise as true — if you cannot
> state the invariant in a sentence, the property test will be unreadable. The combination
> most teams settle on: example tests for documented behaviour, property tests for the
> arithmetic and the boundary cases underneath it.

### 4.7 Fake vs Stub vs Mock

| | Stub | Mock | Fake |
| --- | --- | --- | --- |
| Has working behaviour | No | No | **Yes** |
| You configure it | Yes | Yes | Sometimes |
| You assert on it | Rarely | **Yes** — call counts and arguments | Assert on its *state* |
| Cost to write | Trivial | Trivial | Real work, once |
| Fails when | The behaviour is interesting | The behaviour is interesting | The fake drifts from the real thing |

The value of a fake is the part people underrate: **a fake runs real logic, so tests using it
catch real bugs.**

```java
// A fake: real behaviour, wrong transport.
public class InMemoryPaymentClient implements PaymentClient {
    private final Map<String, Payment> charges = new ConcurrentHashMap<>();
    private final Set<String> declinedCards = Set.of("4000000000000002");

    @Override
    public PaymentResult charge(ChargeRequest r) {
        if (declinedCards.contains(r.cardNumber())) {
            return PaymentResult.declined("card_declined");     // a real rule, exercised for real
        }
        charges.put(r.idempotencyKey(), Payment.of(r));
        return PaymentResult.approved();
    }
}
```

With a fake, "an idempotency key must not be charged twice" is a *real* test of the
service's idempotency logic, because the fake stores and can replay. With a mock, the same
test is `verify(payment).charge(anyTimes())`, which proves nothing about the key at all.

The cost is drift: a fake is a second implementation of the dependency and nothing forces it
to stay in sync. The mitigations that work are boring — a contract test suite run against
both the fake and the real implementation, and a rule that a fake must be small enough to
read in one screen.

### 4.8 Test Naming as Documentation

The test name is the only documentation that gets read, because it is the only one in the
failure report. A suite named `testPlaceOrder1`, `testPlaceOrder2`, `testPlaceOrder3` tells
an on-call engineer at 3am that the suite will cost them thirty minutes of reading code.

```java
// BAD
@Test void test1() { }
@Test void test2() { }
@Test void edge() { }

// BETTER — the pattern is <behaviour> when <condition> → <expected result>
@Test void placeOrder_rejectsEmptyCart_doesNotCharge()
@Test void placeOrder_whenPaymentDeclined_releasesInventoryReservation()
@Test void retryIdempotencyKeyChargesOnlyOnce()
```

The staff-level framing: **the value of a test suite to an on-call engineer is the density
of its failure messages.** A test name is a compressed hypothesis. A name reading
`placeOrder_whenPaymentDeclined_releasesInventoryReservation` tells the person reading the
failure what the code is *supposed* to do, so a failure tells them what actually happened.
The same test named `test3` tells them nothing, converting a 30-second diagnosis into a
30-minute one. Suite naming is cheap engineering time paid back on every incident, and it is
almost never done.

#### Common Mistakes

- Using `@InjectMocks` on a class with two collaborators of the same type, where positional
  assignment is arbitrary and a swap is silent. Construct the subject explicitly.
- `verifyNoMoreInteractions` on a mock the code under test also logs through, which fails on
  the `toString()` in a log statement rather than on a real problem.
- `when(spy.method()).thenReturn(...)` — this *calls* the real method during stubbing. Use
  `doReturn(...).when(spy).method()`.
- Mixing raw values and matchers in a `when`, which throws at the next interaction rather
  than at the line that caused it.
- Stubbing with a value production code never passes, and getting a silent `null` instead of
  a useful failure. Leave `STRICT_STUBS` on.
- Mocking every collaborator, producing a test that asserts only that the class calls its
  collaborators and that breaks on every refactor.
- Turning off `STRICT_STUBS` because the exceptions were annoying. Both messages point at a
  test that is not testing what its author believed.
- Building test data with positional constructors, so a domain change breaks 400 call sites
  and the reader has to count arguments to find the preconditions.
- Object mothers that grow past ten named scenarios, at which point they are a builder with
  a stale shared API.

#### Interview Questions — Mocking & Test Design

**Q1. When does over-mocking make a test actively harmful rather than merely weak?**
`STAFF`

When it becomes a second implementation of the system. A test that mocks every collaborator
and verifies calls asserts only that the class calls its collaborators, so it breaks on
every refactoring and does not fail when the logic is wrong. The harmful part is review
cost: the suite needs "fix the mock" commits on PRs, so the team stops refactoring or
reverts the mock to make the build green. The correction is structural: move assertions up
to where the real logic lives, and mock only at the process boundary — outbound HTTP,
brokers, clocks, randomness — using a fake wherever the collaborator has behaviour worth
exercising.

**Q2. What is the rule for where to mock?** `TRICKY`

Mock at your **process boundary**, not your class boundary. The process boundaries are
outbound HTTP, message brokers, the clock, randomness, the filesystem — and the database,
which you should run rather than mock. Everything inside the process containing real logic
is a candidate for a fake or a real object. The diagnostic: if a mock has no I/O in it, you
probably should not have mocked it. The underlying reason is falsifiability — a mocked
collaborator's behaviour is chosen by the test, so the test can only ever check the calls,
never the consequences.

**Q3. `@InjectMocks` with two `PaymentClient` fields. What happens, and what should you do
instead?** `TRICKY`

Mockito picks the constructor with the most arguments and injects positionally by type for
constructor injection; with two candidates of the same type the assignment is arbitrary and
poorly reported. For setter or field injection it matches by type first, then by field name,
which is less dangerous but still implicit. The fix is to construct the subject explicitly —
`new Checkout(payment, fraudCheck)` — which makes the test's wiring visible, fails to
compile when a dependency is added in the wrong place, and by construction shows you how
many collaborators the class actually has. `@InjectMocks` is fine for a one-dependency
class; past that, explicit construction is better in every way.

**Q4. Why leave `STRICT_STUBS` on, when teams keep turning it off?** `STAFF`

Because both exceptions it raises point at a real defect in the test. `UnnecessaryStubbing`
means the test carries state nothing exercises — usually copy-paste from a neighbouring
test, and usually a sign the test asserts less than its author thinks. `PotentialStubbingProblem`
means a call arrived with arguments no stubbing declared, which is the silent-null failure
mode that costs hours: the test gets a default instead of a value and fails somewhere
unrelated to the cause. Teams disable them because the noise is unwelcome, not because the
diagnosis is wrong. The alternative is a suite that quietly returns `null` and `false` from
unstubbed calls.

**Q5. Why use a test-data builder instead of a constructor with all the arguments?** `STAFF`

Two reasons. The mechanical one: a domain change becomes one compile error in the builder
instead of four hundred broken constructor calls across test files. The second is more
valuable — `new OrderBuilder().customer("cus-9").status(PAID)` declares its own
preconditions, where a nine-argument positional call forces the reader to count to find the
status. The second reason is why this is a test-readability decision as much as a
maintenance one, and it is the one that shows up in every code review.

**Q6. When is an object mother better than a builder, and when does it go wrong?** `TRICKY`

An object mother is better when the set of scenarios is small and genuinely business-wide —
`OrderMother.paidOrder()`, `OrderMother.overdueOrder()` — because the name carries meaning a
builder expression does not. It goes wrong when the set grows past about ten, because it is
then a builder with a shared, mutable, widely-visible API: adding `paidOrderWithDiscount()`
changes something every other test can see and no test needs. The pragmatic rule is a
builder with a small number of named static shortcuts on top.

**Q7. What do property-based tests buy you that example tests don't, and what is the
downside?** `TRICKY`

Coverage of the cases you did not think of. One property — *a discount never exceeds the
subtotal* — covers every combination of every amount and percentage including the
boundaries, and finds the off-by-one when it is written rather than in production. The
downside is intent: property tests read as `property3` unless the property is one a person
would recognise as a business rule, so they supplement example tests rather than replace
them. jqwik is the standard JVM tool, and its shrinking of a failing case to a minimal
reproducing input is what makes them debuggable in a real team.

**Q8. How would you review a PR that adds nine `@Mock`-annotated fields to one test class?**
`STAFF`

Ask which of the nine sit at a process boundary. Any in-process collaborator with real logic
should be a fake or a real object, and the assertions should move up to where the logic is.
Then ask what the test would catch if the business rule changed — the honest answer for a
fully-mocked test is "nothing", because the mock returns whatever the test told it to
return. Then ask what happens in six months when a field is renamed on the class under
test: a fully-mocked test needs a fix-up commit, and a behaviour test does not.

> **CHAPTER 4 SUMMARY**
>
> The mechanics of Mockito matter less than the design rule they serve. `@InjectMocks` hides
> the wiring you want the compiler to check — construct the subject yourself. Leave
> `STRICT_STUBS` on, because both of its exceptions point at a real defect. And understand
> the trap `verifyNoMoreInteractions` illustrates: a test that mocks every collaborator
> re-implements the production code, asserts only that the class calls its collaborators,
> breaks on every refactoring, and catches no logic bug. The rule that prevents it is to
> mock at the process boundary and run the rest. Test data is a compiler-error decision — a
> builder turns a domain change into one failure instead of four hundred — and a fake beats
> a mock wherever the dependency has behaviour worth exercising, because a fake runs real
> logic.

#### Further Reading

- [Mockito reference](https://site.mockito.org/javadoc/current/org/mockito/Mockito.html) — the API reference; the strictness modes and `OngoingStubbing` are the sections that repay reading.
- [Spring Framework Reference — `@MockitoBean`](https://docs.spring.io/spring-framework/reference/testing/annotations/integration-spring/annotation-mockitobean.html) — the bean-override mechanism, and how it differs from a plain Mockito `@Mock` inside a Spring context.
- [jqwik](https://jqwik.net/) — property-based testing for the JVM; start with one invariant and see what it finds.
- [Vlad Mihalcea](https://vladmihalcea.com/) — the deepest practitioner writing on persistence testing and the boundary between fake repositories and real ones.

## Chapter 5 — Performance & Memory

This chapter is the one to memorise. Almost everything in it is a number, a command, and a
failure mode — exactly the shape of what a senior engineer needs under pressure, and
exactly the shape of the questions this volume exists to answer.

### 5.1 Heap Sizing and the Container Trap

On a plain host, heap sizing is arithmetic. In a container it is arithmetic with a trap, and
that trap is the single most common reason a Java service is `OOMKilled` despite the JVM
never throwing an `OutOfMemoryError`.

```text
What happens, step by step:

  1. Pod manifest requests  memory: 512Mi
  2. The container starts; the JVM runs
  3. JVM asks the OS:  "how much memory do I have?"
  4. A JVM that cannot see the cgroup filesystem reads the HOST's memory —
     say 64 GiB on a shared CI node
  5. JVM sizes the heap from that: InitialRAMPercentage 1/64, MaxRAMPercentage 1/4 = 16 GiB
  6. The cgroup limit is 512 MiB
  7. The JVM believes it has 16 GiB. The kernel kills the process at 512 MiB.
     Result: exit 137, no stack trace, no OutOfMemoryError, no heap dump.
```

The log line that gives it away is the one the JVM prints at startup. If the **reported
max heap** is much larger than the container's memory limit, you have this bug.

**The fix, and it is one flag:**

```yaml
env:
  - name: JAVA_TOOL_OPTIONS
    value: "-XX:MaxRAMPercentage=70 -XX:InitialRAMPercentage=30"
# 512Mi limit → ~360Mi max heap, ~150Mi left for metaspace, code cache, thread stacks,
# direct byte buffers, and the JVM's own overhead.
```

The reasoning behind the 70%: **the heap is not the process.** Metaspace, the code cache, GC
structures, thread stacks (200 Tomcat threads × ~1 MB ≈ 200 MB) and direct byte buffers all
live outside the heap. An `-Xmx` equal to the container limit guarantees an `OOMKill` on
the first request that touches all of them.

> **MUST REMEMBER**
>
> **The heap is not the process, and a container's memory limit is not the heap.** With 200
> Tomcat threads at roughly 1 MB of stack each, you have committed ~200 MB before executing
> a single line of business code. That is why `-Xmx = container limit` is wrong even when
> the JVM sees the cgroup correctly, and it is why `MaxRAMPercentage` around 70–75% is the
> standard production value. And when a JVM-based pod is `OOMKilled` with no
> `OutOfMemoryError` in the logs, exit 137 plus no heap dump means the kernel killed it —
> so the JVM's own accounting is the first thing to verify.

> **SCALING REALITY CHECK**
>
> `MaxRAMPercentage` is only correct if the JVM can see the limit. JDK 10+ enables cgroup
> awareness by default, so the flag is rarely the problem — but it is still the first
> suspect because it is the one thing you can check in ten seconds. What still bites: an
> image built on a different base, a wrapper script with
> `-XX:+IgnoreUnrecognizedVMOptions` silently swallowing the flag, a launcher that
> overrides `JAVA_TOOL_OPTIONS`, and JDK 8 and earlier which need
> `-XX:+UseContainerSupport` explicitly. The verification is never the flag's presence — it
> is the startup log's reported `Max heap size`. If that does not match
> `memory.limit_in_bytes × MaxRAMPercentage`, the flag did not take.

### 5.2 Collectors: G1, ZGC, Shenandoah

| Collector | Flag | Typical pause | Heap sweet spot | Use it when |
| --- | --- | --- | --- | --- |
| G1 (JDK 9+ **default**) | `-XX:+UseG1GC` | 10–500 ms, targeting sub-ms on small heaps | < 32 GB | The default. You rarely have a reason to change it. |
| ZGC | `-XX:+UseZGC` | **sub-millisecond, at any heap size** | Scales to TB | Latency matters, and you have 8+ cores and a recent JDK |
| Shenandoah | `-XX:+UseShenandoahGC` | **sub-millisecond** | Any size | Latency matters and you accept the CPU cost; smaller operational base |
| Parallel | `-XX:+UseParallelGC` | Long STW pauses | Small heaps, batch work | Not for a request-serving service |

**G1** is the default for a reason: it is predictable, supported on every JDK, and it
partitions the heap into regions so young collections are cheap. Its pauses are bounded by
the pause *goal* (`-XX:MaxGCPauseMillis=200` by default), and when it cannot meet the goal
it does more work per collection rather than pausing longer — the right trade for most
services.

**ZGC** (generational from JDK 21, JEP 439) gives sub-millisecond pauses at any heap size
by doing marking with coloured pointers and relocating during concurrent phases. The costs
are real: roughly 10–20% throughput overhead versus G1, and a hard requirement of about 8
x86 CPUs plus an explicit opt-in. It is the right answer for a latency-SLO-bound service on
a 16-core instance with a 16 GB heap, and the wrong answer for a cost-optimised batch job.

**Shenandoah** achieves comparable pause times and is available on more platforms, but with
a smaller operational base. Naming the reason for choosing it — "we needed sub-ms pauses and
our platform support was narrower" — is a better answer than "Shenandoah is faster".

> **INTERVIEW TRAP**
>
> "ZGC/Shenandoah are faster than G1" is the answer that gets challenged, because it is
> ambiguous. They have **lower pause times and lower throughput**. For a latency-sensitive
> request-serving service the trade is obviously right; for a throughput-maximising batch
> job it is obviously wrong, and a collector optimised for pauses costs throughput to buy
> latency nobody was going to measure. The senior answer names the axis — **pauses versus
> throughput** — and then says which one the SLO cares about.

### 5.3 GC Logging — Turn It On, Keep It Forever

```bash
-Xlog:gc*:file=/var/log/app/gc.log:time,uptime,level,tags:filecount=5,filesize=50M
```

The `:filecount=5,filesize=50M` rotation is not detail — an unrotated GC log will fill the
disk and take the pod down, which is a genuinely embarrassing self-inflicted outage.

| Signal | What it means |
| --- | --- |
| Pause time well under `MaxGCPauseMillis` | Healthy; the goal is being met with headroom |
| Pause time pinned at the goal | The collector is doing extra work per cycle to hit the target. If throughput is also poor, the heap is too small for the live set. |
| Full GC frequency | The real number. A full GC in a request-serving service is an incident-scale event. |
| Humongous allocation | G1 allocates objects larger than half a region directly to old gen. Large byte arrays and big JSON payloads cause this. |
| Young-gen size shrinking across cycles | The live set is growing and the JVM is making a hard decision about it. |

> **PRODUCTION RELEVANCE**
>
> GC logging costs well under 1% of throughput and should be **on in production
> permanently**, not enabled during an incident. The reason is retrospective: a rolling
> log answers "was this service's allocation rate different last Tuesday at 14:00, when
> latency doubled and CPU did not?" — and the answer is usually yes, and usually a
> deployment. Turning logging on at the start of the incident means the data begins
> *after* the interesting part.

### 5.4 Tomcat Threads — the Arithmetic

**The default is `server.tomcat.threads.max = 200`.** Here is what that costs and what it
buys.

```text
Memory:
  200 threads × ~1 MB reserved stack (Linux default, -Xss)   ≈ 200 MB
  + heap (say 512 MB) + metaspace (~80 MB) + code cache (~80 MB)
  + direct buffers + GC overhead
  ───────────────────────────────────────────────────────────────────
  Total for a 1 GiB container: ~900 MB, of which the heap is HALF

Concurrency (Little's Law):
  Throughput = Concurrency / Latency

  200 threads at 100 ms average latency = 2,000 req/s, if every request is CPU-bound
                                         for 100 ms of work
  200 threads at   2 s  average latency =   100 req/s  ◄── threads are IDLE here;
                                                      the DEPENDENCY is slow
```

That second line is the one to internalise. **Tomcat threads bound in-flight requests; they
are not a source of throughput.** If requests spend their time waiting on a database or a
downstream service, 200 threads buys you 200 concurrent *waiters* and the queue behind them
grows as latency. Past a point, more threads make things strictly worse, because each extra
concurrent request also takes a database connection — holding the pool and its lock
contention with it.

> **SCALING REALITY CHECK**
>
> Past roughly 200 threads, the thread count stops being a capacity knob and becomes a
> latency knob. The fix at that point is one of: **make requests non-blocking** (reactive,
> or `CompletableFuture` with async servlet dispatch), **add instances** — almost always
> cheaper and with better failure isolation — or **reduce the work per request**. On JDK 21+
> virtual threads (`spring.threads.virtual.enabled=true`) change this arithmetic entirely,
> because thousands of virtual threads are cheap stackless continuations. But the pool
> underneath still has to be bounded, and the connection pool in front of the database
> becomes the hard limit rather than the thread count. Volume 10 covers what that means for
> a reactive application specifically.

```yaml
server:
  tomcat:
    threads:
      max: 200            # DEFAULT — rarely wrong for a blocking MVC service
      min-spare: 25       # DEFAULT — threads kept alive after a spike
    accept-count: 100     # DEFAULT — queue depth before the OS refuses connections
    max-connections: 8192 # DEFAULT — the connector's connection cap
```

Two defaults that surprise people. `accept-count=100` is how long the OS-level accept queue
goes before Tomcat starts refusing connections outright — which shows up in metrics as
connection-refused rather than as latency. And `max-connections=8192` is a per-connector
cap that, on a small instance, is unreachable before the thread count is, so the thread
count is your real ceiling and the two are not in conflict.

### 5.5 HikariCP — the Arithmetic

**The defaults are `maximumPoolSize = 10`, `minimumIdle` equal to the maximum, and
`connectionTimeout = 30000` ms.** All three are frequently wrong, each for a different
reason.

```text
The classic rule of thumb:
  connections ≈ cores + number of disks

  4 cores, 1 SSD  →  5 connections.  The default 10 is already generous.

Why "smaller is better" is the right instinct:

  1. More concurrent queries do NOT mean more throughput on a database. They mean
     more lock contention, more buffer-pool pressure, more context switching, and
     more chance a slow query holds locks a fast query needs.

  2. A small pool BOUNDS your concurrency. Requests beyond the pool size queue at
     getConnection(), which is a visible, bounded, diagnosable latency — and the
     queue depth is a metric. An unbounded pool converts a controlled queue into an
     uncontrolled collapse of the database.

  3. The cost of a too-small pool is QUEUEING LATENCY, not lost throughput. If your
     database does 8,000 queries/sec and each holds a connection for 1 ms, then
     8 connections = 8,000/sec. Ten is already past the knee. Dropping to 4 halves
     peak throughput but the p99 barely moves — because the database is not the
     bottleneck at all. The bottleneck is the network call.
```

The corollary that surprises senior engineers: **the right pool size is often smaller than
the default, and you should measure it.** The failure signal to look for is a pool where
threads spend visible time parked in `HikariPool.getConnection` — that is saturation, and it
looks exactly like a slow database in every latency metric.

```yaml
spring:
  datasource:
    hikari:
      maximum-pool-size: 10          # DEFAULT — sized as if every app were a monolith
      minimum-idle: 2                # set below max to survive a traffic blip
      connection-timeout: 30000      # DEFAULT 30s — see below
      idle-timeout: 600000           # DEFAULT 10m
      max-lifetime: 1800000          # DEFAULT 30m — MUST be below any DB/proxy idle timeout
      leak-detection-threshold: 0    # DEFAULT off — set to 5000 while debugging
```

`maximumPoolSize` versus `minimumIdle` is the pair people miss. `maximumPoolSize` is the
ceiling — the most concurrent borrowers. `minimumIdle` is how many connections the pool
**keeps open when idle**, and the default ties it to the maximum, meaning your service holds
10 open TCP connections to the database forever, including at 3am. Setting it to 2–3 keeps
a warm pool and lets Hikari scale up to the maximum on demand; setting it to 0 hands
connection establishment to every request and adds latency to the first request after a
quiet period. For a request-serving service, `minimumIdle` around 2–3 is the normal choice,
and it matters operationally because a large idle count multiplied across every instance
and replica can exceed a database's `max_connections` on its own.

`connectionTimeout = 30000` is the default to interrogate hardest. Thirty seconds is an
eternity. A request that cannot get a connection waits half a minute before it throws — and
meanwhile it holds a Tomcat thread. Ten such requests hold ten of your 200 threads, so the
timeout converts a fast failure into a slow one. **Set it to roughly your end-to-end request
budget** — commonly 2,000–3,000 ms — so exhaustion surfaces as a fast, alerting
`SQLTransientConnectionException` instead of a latency cliff.

`max-lifetime` at 30 minutes is also load-bearing: it must be **shorter than** any
connection idle-timeout enforced by PgBouncer, an RDS proxy, or a corporate NAT. The
failure is a `CommunicationsException` on a connection that was perfectly valid when the pool
handed it out, and it appears at an interval matching the infrastructure's timeout rather
than anything in your code.

> **INTERVIEW TRAP**
>
> "Make the connection pool bigger to improve throughput" is the answer that gets corrected
> in production, and the correction is the interesting part. Past the knee of the
> `cores + disks` curve, more connections mean **less** throughput — more lock contention,
> worse buffer-pool locality, a longer tail. And a small pool is a *containment mechanism*:
> it bounds how much concurrency the application can push at the database, which is exactly
> what stops a traffic spike from cascading into a database outage. The senior answer also
> names the real cost of a too-small pool — **queueing latency, not lost throughput** — which
> is the sentence most candidates get wrong.

### 5.6 Triage: `jstack` on a Live Process

This is the most immediately useful material in the volume. It costs no restart, no
deployment, and no APM licence, and it answers most "the service is slow" questions in about
two minutes.

```bash
# 1. Find the PID
jcmd -l                    # or: jps -l   or: ps -ef | grep java

# 2. Take a thread dump
jcmd <pid> Thread.print -l > /tmp/threaddump-1.txt

# 3. WAIT TEN SECONDS. Take another. And a third.
sleep 10
jcmd <pid> Thread.print -l > /tmp/threaddump-2.txt
sleep 10
jcmd <pid> Thread.print -l > /tmp/threaddump-3.txt
```

**The repetition is the entire technique.** A single dump tells you where threads are at one
instant, which is nearly useless — a thread doing real work looks identical to a thread that
is stuck. Three dumps ten seconds apart tell you what *never changes*, and that is the bug.
The `-l` flag is the one that prints lock ownership, so use it: every `BLOCKED` frame comes
with the owning thread ID and address.

```text
PATTERN                          WHAT IT MEANS
──────────────────────────────────────────────────────────────────────────────
"Found one Java-level deadlock"  Real deadlock. The dump names both threads and the
                                monitor each holds and wants. The only unambiguous,
                                machine-detected condition.

Many threads in                    CONNECTION POOL EXHAUSTED. Every request thread is
  com.zaxxer.hikari.pool.          waiting for a connection. The fix is the slow query or
  HikariPool.getConnection         the missing index — NOT the pool size. See Chapter 6.

Many threads in                    DOWNSTREAM. Your service is waiting on someone else.
  sun.nio.ch.SocketInputStream     The frame BELOW this one names who.

Threads in "BLOCKED" on the       LOCK CONTENTENTION. The "-ownable synchronizers" section
  same monitor                     names the owner; if the owner isn't in the dump, it is
                                   itself parked.

RUNNABLE with high CPU            A genuine CPU hot spot — then profile it (5.7),
                                    don't guess.

WAITING on Object.wait()          Normal. That is an idle thread pool. This is what a
  with few RUNNABLE                 HEALTHY idle service looks like.

Hundreds of threads, many         LEAK. Something creates a pool per request, or never
  distinct pool names              shuts one down. Look for distinct pool names.
```

The reading skill that matters: **read bottom-up from the frames you recognise.** A thread
dump lists frames innermost-first, so frame one is where the thread is *now* and the last
is the entry point. The most useful line is usually in the middle — the frame naming which
of *your* classes called the thing that is stuck.

A worked example:

```text
"http-nio-8080-exec-57" #1234 daemon prio=5 os_prio=0 cpu=42100.00ms
   java.lang.Thread.State: WAITING (parking)
     at sun.misc.Unsafe.park(Native Method)
     at java.util.concurrent.locks.LockSupport.park(...)
     at com.zaxxer.hikari.pool.HikariPool.getConnection(HikariPool.java:183)   ◄── 31 threads here
     ...
     at com.example.order.OrderRepository.load(OrderRepository.java:44)        ◄── the actual culprit
     ...
     at org.apache.catalina.core.StandardThreadPoolExecutor...

Reading:  31 of 200 request threads are parked waiting for a connection, and they were in
          the identical frame in all three dumps. OrderRepository.load is holding them.
          Next step: enable Hikari leak detection and look at the query. It is NOT a
          pool-size problem.
```

> **PRODUCTION SCENARIO**
>
> Problem: `/orders/{id}` p99 went from 180 ms to 14 s at 09:40. Error rate flat. No
> deployment.
> Investigation: three `jcmd <pid> Thread.print -l` dumps ten seconds apart. In all three,
> 34 `http-nio-8080-exec-*` threads were parked at the identical frame,
> `HikariPool.getConnection`, with `OrderRepository.load` two frames below. CPU was 18%.
> Root cause: a `JOIN` added to `OrderRepository.load` two days earlier turned a 2 ms
> indexed lookup into a 4 s range scan taking a row-level lock. Every request that hit it
> held its connection for 4 s, so ten connections saturated and the other 190 threads
> queued. The pool was not undersized — it was the *containment* mechanism working exactly
> as designed.
> Solution: revert the query; set a `statement_timeout` at the connection level so a
> pathological query cannot hold a connection indefinitely.
> Prevention: a per-statement timeout, and a test asserting the query plan uses the index —
> which is the test from Chapter 1's incident-weighted backlog.

### 5.7 JFR — a Profiler You Can Attach to a Running Process

JFR (Java Flight Recorder) was commercial in Oracle's JDK until JDK 11 and is **free and
open in every modern JDK**. It is the correct answer to "what is this service actually
doing" in a production process: it starts in seconds, has roughly **1–2% overhead** in the
default profile, and gives you allocation, locking, GC, I/O and exception data a thread dump
cannot.

```bash
# ── Start a 60-second recording on a live process ─────────────────
jcmd <pid> JFR.start name=incident settings=profile duration=60s filename=/tmp/incident.jfr

# ── Or run it continuously from startup ──────────────────────────
-XX:StartFlightRecording=name=continuous,settings=profile,maxsize=500m,maxage=2h
-XX:FlightRecorderOptions=stackdepth=128
```

The second form is the one to run in production. `maxsize=500m,maxage=2h` is a rotating
buffer: it caps disk usage, keeps the last two hours, and means you can pull the recording
for a window that has already passed. Spring Boot 3.3+ can also expose it over the
management port, or you just attach with `jcmd`.

```text
Which settings profile to use — this matters:

  default   ~1-2% overhead, sampled stacks (every 20 ms), GC and allocation events.
            Fine for continuous production recording. Misses short-lived samples.

  profile   ~5-10% overhead, 10 ms sampling, PLUS every exception, every lock
            acquisition, every file read/write, every socket operation.
            This is what you want for a load test, or for a targeted 60-second capture
            during a live incident. NOT for a continuous 24-hour recording.

  The rule:  profile for a bounded capture, default for continuous. The thing people get
  wrong is leaving "profile" on permanently and wondering why latency rose 3%.
```

| JFR tab / event | The question it answers |
| --- | --- |
| **Hot Methods** | Where is the CPU actually going, including inlined frames a sampling profiler would miss? |
| **Allocation by Class** | What is allocating? An unexpected 400 MB/min of byte arrays is a leak the heap histogram would have shown ten minutes later. |
| **TLAB & GC** | Allocation rate, promotion, pause distribution, and whether a young GC is triggered by one giant object. |
| **Socket Reads / File Reads** | The blocking I/O inventory — the JDBC/HTTP equivalent of a thread dump, but with durations. |
| **Java Monitor Blocked** | Lock contention with the owner named. The dynamic version of a deadlock hunt. |
| **Exceptions** | A 10,000-per-minute `SQLException` nobody logged is a class of bug that never reaches a dashboard. |

> **PRODUCTION RELEVANCE**
>
> JFR's default profile is cheap enough that the correct default is to leave **continuous
> recording with a rotating buffer** on every production JVM, and switch to `profile` for a
> targeted capture. The reason is the same as for GC logging: a recording started at the
> beginning of an incident has already missed the interesting part. The strongest argument
> for JFR in a Spring service is that it shows the *inlined* stack — a JIT-optimised frame
> inlined into its caller appears correctly in a JFR hot-methods table and as a misleading
> single frame in almost every other profiler, which is a common reason teams conclude "it's
> all in the framework".

> **MUST REMEMBER**
>
> The two-minute diagnostic procedure for "the service is slow", in order:
>
> 1. `jcmd <pid> Thread.print -l` **three times, ten seconds apart.** What never changes is
>    the bug. A thread in `HikariPool.getConnection` is pool exhaustion; a thread in
>    `SocketInputStream` is a downstream; a thread holding a monitor others want is
>    contention; a dump naming `Found one Java-level deadlock` is the only unambiguous
>    machine diagnosis.
> 2. `jcmd <pid> JFR.start name=diag settings=profile duration=60s` when the dumps say
>    "waiting" without saying on what. JFR's socket and allocation events turn a guess into
>    a measurement.
> 3. The GC log, because a latency spike with flat CPU is very often a full GC — and that
>    one needs no process access at all.

#### Common Mistakes

- Setting `-Xmx` equal to a container's memory limit. The heap is not the process; thread
  stacks alone account for ~200 MB at the default Tomcat sizing.
- Enabling cgroup support but never checking the reported max heap in the startup log. The
  flag's presence is not evidence; the number is.
- Leaving an unrotated GC log running until it fills the disk and takes the pod down.
- Raising `maximumPoolSize` to fix latency when the latency is a slow query holding
  connections. The pool is the containment, not the disease.
- Leaving `connectionTimeout` at the 30-second default, so exhaustion is a slow cliff
  rather than a fast, alerting failure.
- Setting `max-lifetime` longer than a proxy's idle timeout, producing
  `CommunicationsException` on connections the pool handed out perfectly validly.
- Leaving `minimumIdle` at the maximum, so a service with 20 instances holds 200 idle
  database connections at 3am — which on its own can exceed `max_connections`.
- Taking one thread dump and concluding from it. A single snapshot cannot distinguish a
  thread doing work from a thread stuck.
- Running the JFR `profile` settings continuously and attributing the resulting latency
  increase to something else.
- Enabling `leak-detection-threshold` in production and forgetting why. Hikari logs a stack
  trace every time a connection is held past the threshold, which on a hot path is enormous
  log volume. It is a debugging tool.

#### Interview Questions — Performance & Memory

**Q1. A Java pod is `OOMKilled` with exit 137 and no `OutOfMemoryError`. Likely causes, in
order?** `STAFF`

Exit 137 is SIGKILL — the kernel killed it, so the JVM never got to throw. First: the JVM
cannot see the cgroup limit and sized the heap against the host's memory, so it allocated
far more than the limit allows. Verify against the **reported max heap in the startup log**,
not the flags you believe you set. Second: the heap is correctly sized but everything else
is unaccounted for — 200 Tomcat threads at ~1 MB of stack is ~200 MB, plus metaspace, code
cache and direct buffers, so `-Xmx` equal to the container limit leaves nothing. Third: a
genuine leak — an un-evicted cache or an unbounded `ThreadLocal` — where the answer is a
heap dump, not a flag.

**Q2. What is `MaxRAMPercentage` for, and why 70% rather than 90%?** `TRICKY`

It tells the JVM to size the heap as a fraction of the memory limit it can *detect* — the
cgroup limit — rather than the host's total, which is what produced the classic OOMKill. The
70% is the other side of the same coin: the heap is not the process. Metaspace, code cache,
GC structures, thread stacks (200 × ~1 MB at the default Tomcat sizing) and direct buffers
all live outside it, so 90% guarantees an OOMKill on the first request that touches all of
them. The real lesson is that container memory is a whole-process budget and the JVM is only
one of its claimants.

**Q3. When is G1 the wrong collector, and what does "wrong" mean?** `TRICKY`

G1 is wrong when the latency SLO cannot tolerate tens or hundreds of milliseconds of pause
and the machine has the cores to pay for it — a 16-core instance with a 16 GB heap serving a
p99-SLO-bound endpoint. ZGC or Shenandoah give sub-millisecond pauses there at a throughput
cost of roughly 10–20%. The trap is the ambiguity of "faster": pauses and throughput move in
opposite directions, so "G1 is wrong" is only true along one axis. For a throughput-maximising
service, a batch job, or a machine with fewer than about 8 cores, G1 is right and ZGC's
throughput cost is money spent on latency nobody was ever going to be graded on.

**Q4. Latency doubled, CPU flat. What do you turn on, and in what order?** `STAFF`

Thread dumps first, because they cost nothing. Three of them, ten seconds apart, with `-l`
for lock ownership — what never changes across all three is the answer. Then the reading
rules: threads parked in `HikariPool.getConnection` is pool exhaustion, usually a slow query
holding connections rather than a small pool; threads in `SocketInputStream` is a
downstream; `BLOCKED` frames with a named owner are contention; `Found one Java-level
deadlock` is the only machine-detected case. If the dumps say "waiting" without saying on
what, attach JFR with `settings=profile` for 60 seconds and read the socket and allocation
events. And check the GC log, because a latency spike with flat CPU is very often a full GC
and that one needs no process access at all.

**Q5. A team doubles `maximumPoolSize` because latency is high. What did they get wrong?**
`STAFF`

Two things, probably. High latency with all threads parked in `getConnection` is almost
always a slow query holding connections, not a small pool — and raising the pool makes it
worse, because more concurrent slow queries mean more lock contention and a longer tail at
the database. And the pool size is a *containment mechanism*: a small pool bounds how much
concurrency the application can push at the database, which is exactly what stops a traffic
spike from becoming a database outage. The right diagnosis is the `cores + disks` rule and a
query plan, not a bigger number. And while they are there: `connectionTimeout` at the
30-second default turns exhaustion into a slow cliff rather than a fast, alerting failure.

**Q6. What does a too-small connection pool actually cost, and why is it not throughput?**
`TRICKY`

Queueing latency. Past the knee of the throughput curve — a handful of connections per core
for most workloads — more connections reduce throughput through lock contention and
buffer-pool pressure and increase p99. Removing connections below the knee costs peak
throughput but adds a bounded queue at `getConnection()`, and that queue is visible as a
metric and diagnosable. The arithmetic that settles it: if a query holds a connection for
1 ms and the database does 8,000 of them a second, eight connections already sustain
8,000/sec. If the service is not achieving that, the bottleneck is the network call to the
database, not the number of connections.

**Q7. `maximumPoolSize` versus `minimumIdle` — what is each for, and which one bites
first?** `TRICKY`

`maximumPoolSize` is the ceiling on concurrent borrowers and is the number that governs
whether you are saturated. `minimumIdle` is how many connections the pool *keeps open while
idle*, and the default ties it to the maximum — so a service with 20 instances permanently
holds 200 database connections at 3am, which on its own can exceed the database's
`max_connections`. The one that bites first is usually `minimumIdle`, because the failure is
silent and appears as a connection-limit error on the *database* side rather than in your
service's logs. For a request-serving service, 2–3 is the normal value; setting it to 0
hands connection establishment to every request and adds latency to the first request after
a quiet period.

**Q8. A team wants to double `maximumPoolSize` in every service as a general latency
remedy. What would you make them measure first, and why does the answer change the
recommendation?** `STAFF`

The saturation metric before the change, not the latency metric after it: how many threads
are parked in `HikariPool.getConnection` under peak load, and what the database's own
connection usage looks like. If the application pool is saturated while the database is at
40% CPU, the bottleneck is downstream of the pool and a bigger pool just moves the queue
into the database. If the database is saturated, the fix is the query, the index, or a read
replica. The reason this changes the recommendation is that pool sizing is a containment
decision, not a throughput decision: it bounds how much *this* service can take from the
database, and a team that raises it everywhere has silently decided that no service is
allowed to protect the database from itself.

> **CHAPTER 5 SUMMARY**
>
> The four numbers that decide whether a service is healthy are `MaxRAMPercentage`
> (70–75%, because the heap is not the process and 200 Tomcat threads are already ~200 MB
> of stack), the collector (G1 by default; ZGC when the SLO is sub-millisecond and the
> machine has the cores to pay for it), `max-threads=200` (a bound on in-flight requests,
> not a source of throughput), and `maximumPoolSize=10` (a containment mechanism sized at
> `cores + disks`, whose real cost is queueing latency rather than throughput). The
> diagnostic procedure takes two minutes: three `jcmd Thread.print -l` dumps ten seconds
> apart, and what never changes is the bug. JFR covers what the dumps cannot at 1–2%
> overhead in the default profile, and the reason to leave it on permanently is
> retrospective — a recording started at the beginning of an incident has already missed the
> interesting part.

#### Further Reading

- [Oracle JDK — Diagnostic Tools](https://docs.oracle.com/en/java/javase/21/troubleshoot/diagnostic-tools.html) — the authoritative guide to `jcmd`, `jstack`, `jmap` and `jfr`, and how to read what they produce.
- [Java Flight Recorder API](https://docs.oracle.com/en/java/javase/21/jfapi/) — the event model, the settings profiles, and the JFR handbook explaining what each recording actually costs.
- [JEP 328: Flight Recorder](https://openjdk.org/jeps/328) — why it was open-sourced in JDK 11, the event that made production profiling free.
- [Tomcat HTTP Connector configuration](https://tomcat.apache.org/tomcat-10.1-doc/config/http.html) — the authoritative default values for `maxThreads`, `acceptCount` and `maxConnections`, and what each actually bounds.
- [HikariCP](https://hikaricp.com/) — the pool configuration reference; `connectionTimeout`, `maxLifetime` and leak detection are the three worth understanding in detail.

## Chapter 6 — Distributed Failure Modes

Everything in this chapter is the same idea applied to different parts of the system: **a
bound on how much a dependency can take from you.** Thread starvation, deadlock, cascading
failure, retry storms, circuit breakers and bulkheads are all the same defensive move —
deciding in advance what happens when a collaborator misbehaves — and a service that has
none of them has no answer when a collaborator misbehaves.

### 6.1 Thread Starvation

The classic pool-size error, and the arithmetic is Chapter 5's arithmetic:

```text
  200 Tomcat threads
        │
        ├─ 190 blocked waiting for a database connection  (HikariPool.getConnection)
        ├─   8 in flight, each holding a connection for 4 seconds
        └─   2 serving trivial endpoints

  Effect: 99% of the service is unable to serve ANY request — including /health,
          including the endpoint that would have told you what was wrong.
```

This is the failure mode that distinguishes an **incident** from an **outage**. The service
is not slow; it is *stopped*, and it is stopped for reasons entirely unrelated to the code
handling the request that arrived. A user who wants a status page is refused exactly as
hardly as a user who wants their order.

Three causes, in the order they occur:

1. **A slow query holding connections.** The dominant case. A missing index, a `JOIN` that
   was fine at 10,000 rows and is a range scan at 10 million, a query that acquires a row
   lock and waits on another transaction. Diagnose with the thread dump pattern from 5.6.
2. **A pool genuinely too small** for the concurrency the service actually needs. Real,
   but far less common than people assume — check the `cores + disks` rule before raising
   it.
3. **Connection leak.** Connections acquired and never returned: a `DataSource` used
   directly inside a `@Transactional` method that also calls an HTTP client (the connection
   is held for the whole transaction), a `Connection` held across an await, or a
   `@Async` method that inherits a transaction context. `leak-detection-threshold` finds
   these in one run.

> **MUST REMEMBER**
>
> **Thread starvation is a containment failure, not a capacity failure.** A service with
> too few connections is slow. A service where every request thread is waiting for a
> connection is *unavailable*, including the endpoints that would let you diagnose it. The
> mitigation that addresses the class rather than the instance is a **hard statement
> timeout** on every database connection — `statement_timeout` in Postgres, a
> `queryTimeout` on the `DataSource` — so a pathological query cannot hold a connection
> indefinitely regardless of what the application does.

### 6.2 Deadlock

Two threads each holding what the other needs. Detecting it is unusually easy, and the
detection is built into the JVM:

```bash
jstack -l <pid> | grep -A 20 "Found one Java-level deadlock"
```

```text
2026-03-14 09:12:44
Full thread dump OpenJDK 64-Bit Server VM (21.0.4 mixed mode):

Found one Java-level deadlock:
============================="OrderProcessor-3":
  waiting to lock monitor 0x00007f9c2a1b3e40 (object 0x00007f9c2a1b1234, a Account),
  which is held by "AccountUpdater-1"

"AccountUpdater-1":
  waiting to lock monitor 0x00007f9c2a1c8f10 (object 0x00007f9c2a1b5678, an Order),
  which is held by "OrderProcessor-3"

Java stack information for the threads listed above:
"OrderProcessor-3":
        at com.example.order.OrderService.settle(OrderService.java:88)
        - waiting to lock <0x00007f9c2a1b1234> (a com.example.account.Account)
        at com.example.account.AccountService.debit(AccountService.java:41)
        ...

Found 1 deadlock.
```

Note what the JVM does and does not tell you: it names the two threads, the two monitors,
and the code holding them. That is enough to fix it. The `-l` flag is what makes this
possible — without it, a `BLOCKED` frame shows you what a thread wants but not who has it.

The Spring-specific source of deadlocks is not `synchronized` blocks; it is **lock ordering
across service calls**. `OrderService.settle` locks an `Order`, then calls
`AccountService.debit` which locks an `Account`. Somewhere else, a transfer path locks an
`Account` first and then an `Order`. Two threads entering those two paths in opposite
orders deadlock, and it only happens under concurrency that production has and a unit test
does not.

The fixes, in order of preference:

| Fix | How | Cost |
| --- | --- | --- |
| Consistent lock ordering | A documented global order over all lock types; acquire only in that order | Requires discipline and a comment where the order is defined |
| `tryLock` with a timeout | `ReentrantLock.tryLock(200, MILLISECONDS)` and give up cleanly | Turns a deadlock into a retry or a fast failure |
| One lock, not two | Hold the `Order` lock and query the account state without locking it | Requires the account update to be safe without a lock |
| Database-level | `SELECT ... FOR UPDATE NOWAIT` / `SKIP LOCKED`, with the ordering in the SQL | Moves the problem somewhere with better tooling |

> **INTERVIEW TRAP**
>
> "Deadlocks are rare and the JVM detects them" is a technically true answer that misses the
> point. A deadlock in production is not a rare event to be detected — it is a permanent
> hang of every thread that touched the two monitors, and the JVM's report is a post-mortem
> you may never read because the load balancer has already replaced the instance. The real
> answer is that deadlocks are a *design* problem: they are created by acquiring two locks
> in different orders on two code paths, and the fix is a documented global lock order or
> `tryLock` with a timeout, not better detection.

### 6.3 Cascading Failure — the Mechanism

This is the most important concept in the chapter, because every other mechanism in it is
a mitigation for it.

```text
  t=0    Payments service degrades: p99 goes from 40ms to 8s. It is still UP.
         It is not returning errors. It is returning LATE.

  t+2s   Order service calls it with a 30s timeout (the default you never changed).
         Threads park in SocketInputStream. 200 threads are consumed in 2 seconds.

  t+4s   Order service now has ZERO free threads.
         /health, /metrics, /actuator/... all queue behind 200 parked requests.
         Load balancer health checks start timing out. Instance marked unhealthy.
         Instance removed from the pool.

  t+5s   Traffic shifts to the two remaining instances. They receive 1.5× the load.
         They are now ALSO near saturation.

  t+6s   Their timeouts are 30s. They park. They go unhealthy too.

  t+8s   Total outage. The root cause was a service that was never down.
```

The mechanism has one sentence worth memorising: **a service is only as available as its
slowest dependency multiplied by its own capacity.** A dependency that gets 10× slower
consumes 10× more of your capacity per in-flight request, and your capacity is finite and
usually small — 200 threads, 10 connections.

This is why "the dependency was never down" and "we had a total outage" are not in
contradiction. Availability is not about errors; it is about *time*. A dependency that
returns 200 after 8 seconds is far more dangerous than one that returns 503 immediately,
because the second one lets you fail fast and the first one makes you wait.

### 6.4 Timeouts, Bulkheads, Circuit Breakers — Three Different Things

People treat these as interchangeable "resilience patterns". They are not, and using the
wrong one is a common and expensive mistake.

| Mechanism | Bounds | Does NOT bound | Fails by |
| --- | --- | --- | --- |
| **Timeout** | How long you *wait* for one call | How many concurrent calls you make | Returning an error after the deadline |
| **Bulkhead** | How many concurrent calls you make | How long each takes | Rejecting immediately when the bulkhead is full |
| **Circuit breaker** | How many calls you *attempt* at all, over time | How much capacity a single in-flight call consumes | Opening the circuit and failing fast |

Read down the "does NOT bound" column. That is the whole distinction.

```java
// ── All three, on the same client ─────────────────────────────────
@Bean
RestClient paymentClient(RestClient.Builder b, CircuitBreakerRegistry breakers) {
    return b
        .baseUrl(props.gatewayUrl())
        .requestFactory(ClientHttpRequestFactoryBuilder.jdk()
                .build(java.net.http.HttpClient.newBuilder()
                        .connectTimeout(Duration.ofSeconds(1))     // connect — cheap to bound tightly
                        .build()))
        .requestInterceptor((req, body, ex) -> {
            // TIMEOUT: how long a single call may take
            req.getHeaders().add("X-Deadline", deadlineHeader());
            return req;
        })
        .build();
}

@Bean
ThreadPoolTaskExecutor paymentBulkhead() {                        // BULKHEAD: own threads
    var pool = new ThreadPoolTaskExecutor();
    pool.setCorePoolSize(20);                                      // ← from Chapter 5's arithmetic
    pool.setMaxPoolSize(20);
    pool.setQueueCapacity(0);                                      // reject, don't queue
    pool.setThreadNamePrefix("payment-");
    pool.setRejectedExecutionHandler(new ThreadPoolExecutor.AbortPolicy());
    return pool;
}

@Bean
CircuitBreaker paymentBreaker(CircuitBreakerRegistry registry) {   // CIRCUIT BREAKER
    return registry.circuitBreaker("payment", cfg -> cfg
            .failureRateThreshold(50)                              // % failures to open
            .minimumNumberOfCalls(20)                              // do not open on 3 calls
            .slidingWindowSize(100)                                // window of last 100
            .waitDurationInOpenState(Duration.ofSeconds(30))       // how long OPEN stays
            .permittedNumberOfCallsInHalfOpenState(5)             // trial calls
            .build());
}
```

> **TRADE-OFF**
>
> A timeout alone is not enough and is actively dangerous at its default. A long timeout lets
> a failing dependency consume your entire thread pool before it fails — the failure becomes
> an outage. A short timeout turns recoverable slowness into errors. The flip condition:
> set the timeout to **your end-to-end request budget**, not the dependency's
> characteristic latency. If your SLA is 2 seconds, no downstream call gets 30 seconds, no
> matter how slow that dependency usually is — and a dependency that needs 30 seconds to
> respond is a dependency that should not be on the request path at all.

### 6.5 Retry Storms and Retry Amplification

The mechanism, stated once, applies everywhere:

```text
  A retry policy of 3 attempts with no backoff, on a service called 3 times per request:

    requests/sec          100
    downstream calls/sec   100
    × 3 attempts            300
    × 3 hops in the chain  900   ◄── 9× amplification

  When the downstream is degraded, each retry takes longer, so each request holds
  connections and threads longer, so the caller's throughput drops, so the caller's
  retry rate rises, so downstream load rises further. Positive feedback. Stampede.
```

The compounding across a chain is the part that surprises people: three services each
retrying three times produce a 27× multiplier at the end of the chain, not 3×. Volume 3
Chapter 3 and Volume 10 Chapter 3 cover the retry mechanics; what matters here is the
arithmetic's consequence — **a retry policy is a multiplier on someone else's outage, and
you do not control whether they are already overloaded.**

The rules that hold:

1. **Exponential backoff with jitter.** Fixed backoff synchronises every client in the
   fleet into the same retry wave, which turns a smooth recovery into a second, sharper
   outage. Jitter is not optional at fleet scale — a hundred instances retrying at
   `100ms, 200ms, 400ms` arrive as a wall.
2. **Cap the total time, not the attempt count.** Three attempts inside a 2-second budget
   is a different policy from three attempts that can span 90 seconds.
3. **Retry the right things.** Idempotent operations only. A retry of a non-idempotent POST
   is a duplicate charge; a retry of a 4xx is wasted load, because the request is wrong and
   will be wrong again.
4. **Never retry at more than one level of a call chain.** If the gateway retries, the
   service must not, and vice versa. This single rule removes the compounding factor and is
   the cheapest resilience improvement available.

### 6.6 Circuit Breakers — the State Machine

```text
              failure rate > threshold
     ┌────────┐ ──────────────────────► ┌────────┐
     │ CLOSED │                          │  OPEN  │
     │ normal │                          │ reject │
     └────────┘ ◄──────────────────────  └────────┘
          ▲       success rate OK            │
          │                                  │ waitDurationInOpenState
          │  (permittedNumberOfCalls pass)   │ elapsed
          │                                  ▼
          └───────────── ┌──────────┐
                ┌─────── │ HALF_OPEN│
                │         └──────────┘
                │           │   │
          OPEN  └───────────┘   └────► OPEN (any failure re-opens)
```

The parameters, and what a bad value costs:

| Parameter | Meaning | What a bad value does |
| --- | --- | --- |
| `slidingWindowSize` | How many recent calls the rate is computed over | Too large — a burst of failures is diluted and the circuit never opens. Too small — normal variance trips it. |
| `minimumNumberOfCalls` | Calls required before the rate is evaluated | **Zero or 1 is the classic bug.** One failure at 3am with a window of 1 opens the circuit for the whole call. |
| `failureRateThreshold` | Percentage of failures that opens the circuit | Too low and a normal error rate opens it. Too high and the circuit opens after the damage. |
| `waitDurationInOpenState` | How long OPEN stays before a trial | Too short and the circuit flaps, retrying a dependency that is still down. |
| `permittedNumberOfCallsInHalfOpenState` | Trial calls once half-open | Too few and you cannot establish whether it recovered. Too many and you re-open the outage yourself. |
| `slowCallDurationThreshold` | What counts as a *failure* for rate purposes | **Setting this is the highest-value thing you can do.** A circuit breaker that only counts exceptions will never open for a dependency that is slow and returning 200s — which is the cascade from 6.3. |

> **PRODUCTION SCENARIO**
>
> Problem: at 08:15 the fraud service began returning errors. By 08:22 the checkout
> service was returning 100% errors, and the fraud service was healthy and idle.
> Investigation: the checkout service's circuit breaker on fraud had `minimumNumberOfCalls`
> unset, defaulting to behaviour that evaluated on a handful of calls. The first genuine
> failure after the 08:15 error spike opened the circuit — correctly. But `waitDurationInOpenState`
> was 5 seconds, so the circuit re-opened on the first call every 5 seconds, and each
> half-open probe was a real user request rather than a synthetic one.
> Root cause: a breaker configured to flap, with a short open-state duration and real
> traffic as the probe.
> Solution: raise the open-state duration, set a meaningful `minimumNumberOfCalls` so the
> rate is evaluated on a sample, and — the real fix — serve a **stale or default decision**
> during OPEN rather than failing the request, so the dependency's outage becomes a
> degraded checkout rather than no checkout.
> Prevention: resilience configuration reviewed as a unit (the parameters interact), plus a
> `slowCallDurationThreshold` so the breaker also opens for a slow dependency, which is
> the case that actually causes cascades.

> **MUST REMEMBER**
>
> **A circuit breaker with a bad threshold kills more traffic than the outage did.** A
> breaker that opens on one failure rejects 100% of traffic for the duration of its open
> state, when the underlying error rate might have been 2%. That is a strictly worse
> outcome than not having a breaker, because you converted a partial failure into a total
> one. The three settings that make a breaker safe: a real `minimumNumberOfCalls` so the
> rate is measured on a sample, a `slowCallDurationThreshold` so slowness counts as failure
> (otherwise the cascade from 6.3 is invisible to the breaker entirely), and a fallback
> that is *degraded* rather than *absent* — a stale value, a cached decision, a default —
> because a breaker that only rejects is a breaker that converts a dependency problem into
> your problem.

### 6.7 Bulkheads — and Why Thread Pools Beat Semaphores

A bulkhead is a **compartmentation**: give each dependency its own limited capacity so one
can only ever take its share. The options in Spring:

```java
// ── Semaphore bulkhead: bounds concurrency, shares the caller's threads ──
BulkheadConfig cfg = BulkheadConfig.custom()
        .maxConcurrentCalls(20)                // 20 in flight, then RejectedExecutionException
        .maxWaitDuration(Duration.ZERO)        // fail immediately, do not queue
        .build();

// ── Thread-pool bulkhead: bounds concurrency AND has its own threads ──
ThreadPoolBulkheadConfig tp = ThreadPoolBulkheadConfig.custom()
        .maxThreadPoolSize(20)
        .coreThreadPoolSize(10)
        .queueCapacity(0)                      // 0 queue is the point: reject, don't wait
        .build();
```

**Thread-pool isolation is more robust than semaphore isolation here, and the reason is
specific.** A semaphore bounds *how many* calls are in flight, but those calls run on the
caller's threads — so a hung dependency still parks the caller's thread for the full
timeout. With 20 permits and a 30-second timeout, 20 threads are still gone for 30 seconds.
A thread pool puts the work on *its own* threads, so a hung dependency exhausts the bulkhead
and the rejection is immediate and cheap.

The consequences:

| | Semaphore bulkhead | Thread-pool bulkhead |
| --- | --- | --- |
| Bounds concurrent calls | Yes | Yes |
| Bounds time a hung call takes from you | **No** — it still parks the caller's thread | Yes — it only parks a pool thread |
| Thread cost | Free | 20 threads (20 MB) per bulkhead |
| Thread-hopping context propagation | None needed | Must propagate `SecurityContext`, `RequestContextHolder`, MDC |

That last row is where thread-pool bulkheads lose in a Spring application, and it is worth
knowing: `@Async` runs on a different thread, and a `ThreadLocal`-backed
`SecurityContextHolder` or `MDC` is empty there unless you configure the executor with the
TaskDecorator that copies them. Getting that wrong produces a bulkhead that silently drops
the security context, which is a worse bug than no bulkhead at all.

### 6.8 Graceful Degradation and Load Shedding

**Graceful degradation** means the service keeps serving a *worse* answer rather than no
answer. The distinction that matters is visibility:

```java
// ── VISIBLE degradation ──────────────────────────────────────────
@CircuitBreaker(name = "fraud", fallbackMethod = "lastKnownRisk")
public Risk assess(Order o) { ... }

private Risk lastKnownRisk(Order o, Throwable t) {
    meterRegistry.counter("fraud.degraded", "reason", t.getClass().getSimpleName()).increment();
    return RiskCache.byCustomer(o.customerId())          // may be stale — and that is fine
            .orElse(Risk.REVIEW_MANUALLY);               // a real answer, not an exception
}
```

The requirement is that a degraded response must be **distinguishable in the data**. A
fallback that returns a plausible-looking answer without a marker is worse than an error,
because the business acts on it believing it is real. Every fallback needs a metric, a log
line, and — where the answer reaches a user or a downstream system — a flag in the
payload. Volume 3 Chapter 3 covers fallbacks in the resilience-mechanism detail.

**Load shedding** is the opposite discipline: reject work deliberately so the service stays
up for the work it has already accepted. The canonical implementation is
`Retry-After` plus a rate limiter, and the honest framing is that **load shedding is a
product decision disguised as a technical one** — it means some requests are refused on
purpose, and somebody has to decide which ones and tell the users.

```java
// ── Shed at the edge, not at the thread pool ─────────────────────
@Bean
RateLimiter checkoutLimiter(RateLimiterRegistry registry) {
    return registry.rateLimiter("checkout",
            RateLimiterConfig.custom()
                    .limitForPeriod(500)                       // 500 requests
                    .limitRefreshPeriod(Duration.ofSeconds(1))
                    .timeoutDuration(Duration.ZERO)            // reject NOW, don't queue
                    .build());
}
```

The design point: shed *before* the resource is exhausted, not after. A rate limiter that
starts rejecting at 80% of your thread capacity leaves room for the in-flight work to
finish. One that engages when threads are already exhausted is a status page.

### 6.9 The Staff-Level Framing

> **STAFF-LEVEL CONSIDERATION**
>
> **The difference between an incident and an outage is whether one slow dependency
> consumed the whole service's capacity.** That is the sentence to take into the room, and
> every mechanism in this chapter is a bound on how much a dependency can take from you:
> a timeout bounds the time, a bulkhead bounds the concurrency, a circuit breaker bounds
> the attempts, a load limiter bounds the arrival rate. A service with none of the four has
> no bound at all, which means its availability is a function of its dependencies'
> patience rather than of its own design.
>
> The organisational dimension is the one interviewers are actually probing. Resilience
> configuration is **not local to a service** — it is the joint between this service's
> thread pool, connection pool, and retry policy and every downstream's. Three questions
> decide whether you can answer "should this service be resilient?" at all: *what does this
> service do when its worst dependency is 10× slower?* (If the answer is "it stops", the
> design is incomplete and no amount of monitoring fixes it.) *Who owns the retry budget —
> us or the caller?* (Both retrying is the compounding factor in 6.5.) And *what does this
> service return when the dependency is down — a worse answer or no answer?* (A team that
> has never written down the second answer will discover it during the incident, in public,
> and it will be `return null`.)

#### Common Mistakes

- Treating a long timeout as a resilience measure. A 30-second default timeout is the single
  setting most likely to turn a dependency slowdown into a full outage.
- Setting `minimumNumberOfCalls` to 0 or 1 on a circuit breaker, so one failure at 3am opens
  the circuit and rejects 100% of traffic.
- Not setting `slowCallDurationThreshold`, so a breaker that only counts exceptions never
  opens for the slow-but-returning-200s dependency that causes the actual cascade.
- Retrying at more than one level of a call chain, producing a 9× or 27× multiplier on
  someone else's outage.
- Retrying without jitter, so a hundred instances retry in a synchronised wave and turn a
  smooth recovery into a second outage.
- Retrying non-idempotent operations, and retrying 4xx responses, which are the requests
  that will be wrong again.
- A fallback that returns a plausible value with no marker, so the business acts on degraded
  data believing it is real.
- A semaphore bulkhead against a dependency that can hang, on the reasoning that 20 permits
  is enough — it bounds the count, not the time.
- Thread-pool bulkheads with a `TaskDecorator` that does not propagate `SecurityContext`,
  `RequestContextHolder` and MDC, silently dropping the security context.
- Load shedding that engages when threads are already exhausted rather than before.

#### Interview Questions — Distributed Failure Modes

**Q1. Walk me through a cascading failure. What makes it a cascade rather than an
outage?** `STAFF`

A dependency degrades from 40 ms to 8 s p99 while still returning 200s. At 30-second
timeouts, request threads park in `SocketInputStream` and are gone in seconds. With 200
threads, the service now serves nothing — including `/health`, so the load balancer marks it
unhealthy and moves its traffic to the other instances, which then saturate too. The
cascade is the propagation: one dependency's slowness became *every* instance's
unavailability, via a shared resource (the thread pool) that had no bound on how much of it
one caller could take. A single slow dependency becomes a total outage, which is exactly
the difference between an incident and an outage.

**Q2. What is the difference between a timeout, a bulkhead, and a circuit breaker, and
which one is most often missing?** `TRICKY`

They bound different things. A timeout bounds how long you wait for one call. A bulkhead
bounds how many concurrent calls you make. A circuit breaker bounds how many calls you
attempt at all, over time. The "does NOT bound" column is the distinction: a timeout does
not bound concurrency (200 threads × 30 s timeout is still a full outage), and a bulkhead
does not bound time. The most often missing is usually the **timeout set to a sensible
value** — teams add bulkheads and breakers and leave the default 30-second timeout in place,
which means a hung dependency consumes the entire pool before anything fails.

**Q3. A service's circuit breaker opens during a partial failure. Was that correct?**
`TRICKY`

The mechanism worked; the configuration is the question. If `minimumNumberOfCalls` is
unset, a single failure at low traffic can open a circuit and reject 100% of traffic —
strictly worse than the outage it was protecting against, because it converts a 2% error
rate into a 100% one. And without `slowCallDurationThreshold`, the breaker only counts
exceptions, so it will never open for the slow-but-returning-200s dependency that causes
real cascades. The safe configuration is a real minimum call count, a slow-call threshold
set to roughly your dependency's p99, a long enough open state to avoid flapping, and a
fallback that returns degraded data rather than an exception.

**Q4. Semaphore bulkhead or thread-pool bulkhead, for an HTTP dependency that can hang?**
`TRICKY`

Thread pool, and the reason is specific rather than stylistic. A semaphore bounds how many
calls are in flight, but those calls run on the *caller's* threads — so 20 permits against a
dependency that hangs for 30 seconds still park 20 caller threads for 30 seconds, and the
semaphore has bounded nothing that matters. A thread pool runs the work on its own threads,
so a hung dependency exhausts the pool and the rejection is immediate and cheap. The cost is
20 threads and the need to propagate `SecurityContext`, `RequestContextHolder` and MDC
across the hop with a `TaskDecorator` — and getting that wrong is worse than having no
bulkhead, because it silently drops the security context.

**Q5. Two services in a call chain both retry three times. What is the amplification, and
what is the cheapest fix?** `STAFF`

27× at the end of the chain, not 3× — each level multiplies the level below it. The
cheapest fix in distributed-systems engineering is to establish that exactly one layer owns
the retry budget, usually the edge, and every layer below fails fast. That single
organisational rule removes the compounding factor entirely and costs nothing in capability.
Its organisational cost is real, though: it requires agreeing who retries, and that the
edge's retry budget is large enough to cover the service's transient failures — which is a
capacity decision as much as a design one.

**Q6. What makes a fallback harmful rather than helpful?** `STAFF`

Returning a plausible value with no marker. A fallback that returns `null`, a default, or a
stale cached answer — indistinguishable from a real one — means the business acts on
degraded data believing it is true, and you have converted a visible dependency outage
into an invisible data-quality incident. Every fallback needs three things: a metric, a log
line, and a flag in the payload where the answer reaches a user or a downstream system. The
related trap is the *silent* fallback in an async path, where the exception is swallowed by
the `AsyncUncaughtExceptionHandler` and nobody knows degradation is happening at all.

**Q7. How would you decide whether a service needs a circuit breaker at all?** `STAFF`

Ask two questions. First: what does this service do when the dependency is 10× slower? If
the answer is "it stops serving", the service is already a cascade risk and the first fix is
a timeout and a bulkhead, not a breaker. Second: is a fallback available that is better than
an error? A circuit breaker without a fallback is a fast, total failure — valuable only if
you genuinely want the requests to go elsewhere (fail over to a replica, return a cached
answer, queue for later). If no degraded answer exists, a breaker mostly converts a slow
dependency into a fast error, which helps your threads but does not help the user, and
should be sized as a protection for *you*, not as a service to them.

**Q8. A team adds timeouts, bulkheads, and circuit breakers to one service and the outages
get worse. What is the most likely explanation?** `STAFF`

They multiplied amplification instead of bounding it. If both this service and its caller
retry, the retry budget doubled, and if the timeouts are now short enough to convert
recoverable slowness into hard errors while the breaker rejects the remainder, the
dependency's traffic has been concentrated into a small number of very short requests that
are more likely to trip the dependency's own protections. The fix is to bound rather than
multiply: exactly one layer retries, timeouts are set to the request budget rather than
shortened defensively, and the breaker falls back to degraded data rather than rejecting.
It is worth saying in the interview that resilience mechanisms interact, and configuring
them independently is how a service makes its own incident worse.

**Q9. Should every service be resilient, or is that over-engineering?** `STAFF`

No, and the honest test is whether the service has dependencies whose slowness it can
survive. A service whose only external dependency is the database — which it shares with
everything else — gains little from a circuit breaker, because there is nowhere to fail
over to; what it needs is a statement timeout and a bounded pool. A service calling three
other services across a network genuinely needs timeouts, bulkheads and breakers, because
those are the only things bounding what it can lose. The organisational version of the
answer: "resilient" is not a property a service has, it is a set of decisions about what
this service is willing to lose, and a team that has not written that down will make the
decisions by accident during an incident.

> **CHAPTER 6 SUMMARY**
>
> Every mechanism in this chapter is the same move — a bound on how much a dependency can
> take from you. A timeout bounds time, a bulkhead bounds concurrency, a breaker bounds
> attempts, a load limiter bounds arrivals. Without them, a service's availability is a
> function of its dependencies' patience rather than its own design, and the mechanism that
> turns a slow dependency into a total outage is a shared thread pool with no bound on it.
> The configuration errors that make resilience harmful rather than helpful are specific
> and worth memorising: 30-second timeouts, breakers with no `minimumNumberOfCalls`,
> breakers with no `slowCallDurationThreshold` — which means they never open for the
> slow-but-returning-200s dependency that causes the actual cascade — fallbacks with no
> marker, and retry at more than one layer, which multiplies amplification to 27× across a
> three-hop chain. And the sentence that frames the whole chapter: the difference between
> an incident and an outage is whether one slow dependency consumed the whole service's
> capacity.

#### Further Reading

- [Martin Fowler — Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html) — where the pattern came from and the real motivation, which is protecting against the *contingent* failure rather than the expected one.
- [Resilience4j — CircuitBreaker](https://resilience4j.readme.io/docs/circuitbreaker) — every parameter, its interaction with the sliding window, and the failure-rate vs slow-call-rate distinction.
- [AWS Builders' Library — Timeouts, Retries and Backoff with Jitter](https://aws.amazon.com/builders-library/timeouts-retries-and-backoff-with-jitter/) — the best treatment of why jitter is mandatory at fleet scale, and how retries amplify across a call chain.
- [Microservices.io — Circuit Breaker](https://microservices.io/patterns/reliability/circuit-breaker.html) — the pattern in its application form, including the state machine and the retry/timeout relationship.
- [Google SRE Book — Service Best Practices](https://sre.google/sre-book/service-best-practices/) — the monitoring, load-balancing and graceful-degradation practices from a fleet that runs at scale, written by the people who had the incidents.

## Chapter 7 — Production Practice

### 7.1 Configuration in Production

Volume 1 Chapter 7 covers the precedence ladder and `@Profile` mechanics; Volume 7 Chapter 4
covers `@ConfigurationProperties` binding. What belongs here is the operational discipline,
and it has one rule: **the environment decides, the repository does not.**

```yaml
# application.yml — committed, contains DEFAULTS ONLY, and no secrets.
spring:
  application:
    name: order-service
  datasource:
    hikari:
      maximum-pool-size: 10          # the default is a fallback, not a decision
server:
  tomcat:
    threads:
      max: 200

# application-prod.yml — does NOT exist in the repository.
# Production configuration is injected: environment variables, a config server,
# or a mounted file. See Volume 7 Chapter 4 for the config-tree mechanisms.
```

| Never committed | Always committed |
| --- | --- |
| `spring.profiles.active` | Sensible, conservative defaults |
| Credentials, API keys, connection strings | The *shape* of configuration (the `@ConfigurationProperties` class) |
| Per-environment hostnames and pool sizes | Health, metric and log configuration |
| A `prod` profile file with real values | Validation constraints on what must be present |

The failure mode of committing a production profile is not a security incident, it is a
**silent divergence**: the file in the repository says pool size 50, the environment says 10,
and the environment wins — but someone reading the repository believes the service runs with
50. At 3am, that is a real cost. The corresponding rule for the active profile is the one
from Volume 1: set `spring.profiles.default: prod` so that a *missing* profile setting fails
toward production behaviour rather than toward a developer's laptop.

The operational checks that are worth automating because they are cheap:

- **Fail fast on missing configuration.** `@Validated` + JSR-380 on the properties class
  turns a missing value into a startup failure instead of a `null` in a request path.
- **Log the effective configuration at startup, minus secrets.** A property source is the
  answer to "why is this pod different from that one", and it is unanswerable without this.
- **Assert invariants across properties.** A retry count greater than the pool size is
  exactly the coupling that only shows up under load, and a validation constraint is the
  only place it can be caught before an incident.

### 7.2 Feature Flags — Build-Time and Runtime

Two mechanisms that look similar and have completely different properties.

```java
// ── BUILD-TIME: the bean either exists or it does not ────────────
@Configuration
class NewCheckoutConfig {

    @Bean
    @ConditionalOnProperty(name = "feature.new-checkout", havingValue = "true")
    NewCheckoutService newCheckoutService(NewCheckoutRepository repo) { ... }

    @Bean
    @ConditionalOnMissingBean(NewCheckoutService.class)
    LegacyCheckoutService legacyCheckoutService(LegacyRepository repo) { ... }
}
```

| | `@ConditionalOnProperty` | Dynamic flag service |
| --- | --- | --- |
| Evaluated | Once, at startup | Every call |
| Flipping it | Redeploy | A flag change |
| Two code paths in production | No | **Yes** |
| Rollback time | A deploy | Seconds |
| Cost | Zero runtime | An evaluation per call, plus a dependency |
| Test cost | A separate context per value | A mockable seam |

The honest framing of the trade: **a build-time flag is a config value with a compile-time
consequence; a dynamic flag is a runtime branch, and the branch is permanent until someone
removes it.** Build-time flags are cheap and you should use them for anything that does not
need a same-day flip. Dynamic flags earn their cost when the ability to flip without a
deploy is genuinely worth the combinatorial space they create.

The three disciplines that make flags survivable:

1. **The audit trail is not optional.** Every evaluation should be loggable — flag name,
   value, subject (user, tenant, request), and a correlation ID — so that when a bug report
   says "it happened for me", the answer is a lookup rather than an archaeology exercise.
   This is the single most commonly skipped piece and the one that turns a flag from a
   feature into an incident-response tool.
2. **Flags accumulate into a space nobody can reason about.** Ten flags is 1,024
   combinations. The test is not "can I enumerate the combinations" — nobody can — it is
   "can I explain, for any given user, why they saw this?" The answer must be derivable
   from the audit trail, not inferred from source.
3. **Every flag needs a removal ticket and an owner at creation time.** A flag without a
   removal date is a permanent branch. Write the ticket in the same PR.

> **PRODUCTION RELEVANCE**
>
> The failure mode of dynamic flags is not that they are risky — it is that they are
> **invisible in the code review**. Six months after launch, a service has eleven flags, and
> no engineer can state what the system does when all eleven are on. Worse, the interaction
> between flags is where the bugs live, and the flag-evaluation code is usually a separate
> concern that nobody reads carefully. The concrete mitigation: log the evaluated flag set
> with every request at `DEBUG`, and make one endpoint answer "which flags were evaluated
> for user X, in what order, and what did each resolve to" — that endpoint is worth more
> during an incident than most of the traces you could add.

### 7.3 Deployment and Rollout

| Strategy | How | Rollback | Cost | Use when |
| --- | --- | --- | --- | --- |
| **Recreate** | Stop all, start all | Redeploy | Downtime | Almost never |
| **Rolling** | Replace instances in batches | Roll forward or redeploy previous | Brief mixed-version window | Default for stateless services |
| **Blue/green** | Provision a full parallel set, cut traffic | Instant flip back | 2× infrastructure | Schema changes needing care |
| **Canary** | Small % of traffic to the new version | Automatic, on a metric | Metrics infrastructure, and discipline | The highest-confidence option |

The canary is the interesting one, and the thing that makes it a canary rather than a
test is the **automatic rollback trigger**:

```yaml
# The trigger must be a metric comparison, not a human watching a graph.
# A canary that a human has to watch is a canary that fails at 3am.
analysis:
  interval: 1m
  metrics:
    - name: error-rate          # new vs baseline, statistical comparison
      threshold: < 1.5× baseline
      for: 5m                   # sustained, not a single noisy minute
    - name: p99-latency
      threshold: < 1.3× baseline
      for: 5m
    - name: business-conversion # the metric that actually matters
      threshold: < 2% drop
      for: 10m
  rollbackOnFailure: true       # NOT "alert a human"
```

Why metric-based and automatic, stated precisely: a human watcher fails on three counts —
availability (nobody is watching at 3am), objectivity (a deploy is emotionally expensive
to roll back, so the watcher is biased), and speed (the decision takes minutes, and an
incident takes less). An automatic trigger on a business metric rather than only on
technical ones is what distinguishes a real canary from a smoke test: a deploy can be
technically healthy and commercially dead, and only a business metric catches that.

This connects directly to **Volume 7 Chapter 7's readiness probe**, and the connection is
the point: the readiness probe is what determines whether the canary receives traffic at
all, and a probe that is too eager sends traffic to an instance that cannot serve it, which
converts a canary into an outage. The two have to be designed together. Readiness means
"this instance can serve *this* traffic correctly", not "the process has started" — an
instance whose database connection pool is exhausted or whose downstream is circuit-breaking
should be failing readiness, because sending it traffic makes the situation worse.

### 7.4 The Runbook a Service Should Ship With

A service without a runbook turns every incident into an archaeology exercise — and the
archaeology is always done at 3am, by someone who did not write the code, with no time to
read it. The list below is short on purpose; a runbook nobody reads is worse than none.

| Must document | Why | The question it answers at 3am |
| --- | --- | --- |
| **Dependencies and their timeouts** | The first thing every incident needs | "What can this service be waiting on, and for how long?" |
| **Alert definitions, verbatim** | Alerts are code nobody re-reads | "This page fired — what does it mean, and what should I do first?" |
| **The rollback procedure** | The fastest mitigation is nearly always the previous version | "How do I undo the deploy that caused this?" |
| **Feature flags** | Explains why this instance is behaving differently | "Is anything switched on in prod that isn't in staging?" |
| **Scaling limits** | Bounds capacity and cost, and prevents a scale-to-save attempt that makes things worse | "What happens if I double the replicas? What is the ceiling?" |
| **Known failure modes** | The expensive institutional knowledge | "Has this happened before, and what did we learn?" |
| **The data model, at the level of "what breaks if I touch this"** | Cross-cutting | "What happens to this table if I write to it directly?" |

The two that get skipped and should not be are the **alert definitions** and the **known
failure modes**. Alert definitions, because an alert name like `service_error_rate_high`
conveys nothing and the person receiving the page has to go and find the threshold, the
runbook link and the dashboard — three round trips at 3am. Known failure modes, because
this is the only document that captures the *why* of a past decision, and it is the
difference between an incident and a recurrence.

> **STAFF-LEVEL CONSIDERATION**
>
> A runbook is an organisational artefact more than a technical one, and the interesting
> question is who writes it and when. The failure mode is a runbook written once at launch
> by the people who remember the design, and never touched again — which means it is wrong
> within two releases, and worse than absent because it is confidently wrong. The practice
> that works is to **update it in the same PR that changes what it documents**, which is
> only enforceable if the runbook lives next to the code and someone reviews it. The
> sharper version: every post-incident review should end with a question about the runbook,
> not only about the code. "We did not know this was possible" is a documentation finding,
> and treating it as one is what stops the same incident happening twice.

### 7.5 The Observability Checklist

The four signals — **RED and saturation**:

| Signal | What it is | Why it is on the list |
| --- | --- | --- |
| **Rate** | Requests per second, per endpoint | The demand. Without it, every other metric is uninterpretable. |
| **Errors** | Failures per second, **and** the rate of non-2xx responses | The outcome. Count, not boolean — one boolean loses the magnitude. |
| **Duration** | Latency distribution — p50, p95, p99 — not an average | An average is a number nobody can alert on. p99 is the one users experience. |
| **Saturation** | The resource closest to exhaustion: pool usage, queue depth, CPU, GC pause | **The leading indicator.** Rate and errors are lagging; saturation is how you get warning. |

Saturation is the one that is most often missing and most valuable, and the specific
metrics for a Spring service are: **HikariCP `active` / `idle` / `pending` connections**,
**Tomcat `currentThreads` / `busyThreads`**, HTTP client pool utilisation, and the count of
requests waiting. `HikariPool` publishes these through Micrometer the moment
`DataSource` metrics are enabled, which is usually on by default and almost never alerted on
— a missed free signal.

**The three questions every alert should let you answer:**

1. **Is this affecting users right now?** (An alert about a metric nobody experiences is a
   training exercise for people to ignore alerts.)
2. **What changed, and when?** (The alert should carry a link to the dashboard showing the
   same window, and the deployment history for that window.)
3. **What do I do first?** (The runbook link, on the alert itself, not in a wiki nobody has
   heard of.)

An alert that cannot answer all three should not page a human. That is the honest test, and
applying it is most of the work.

> **INTERVIEW TRAP**
>
> "Alert on every metric that crosses a threshold" is the answer that describes why alert
> fatigue is a solved problem in exactly the way that makes it worse. **Alerting on
> everything is alerting on nothing**: the pager becomes noise, responders learn to batch and
> defer, and the real page is dismissed as the twentieth one this hour. The fix is
> symptom-based alerting derived from the user-visible thing — error rate, latency, and
> availability — with the technical metrics as *diagnostic* dashboards you go to *after*
> paging, not as pages in their own right. The senior addition: a good alert is
> *actionable and rare*, and the metric of an alerting system's health is how often a
> human being is woken up for something that turned out not to matter.

> **MUST REMEMBER**
>
> **Alert on symptoms, measure with causes.** Rate, errors, and duration are what the user
> experiences, so they are what pages a human. Saturation, pool depths, queue lengths and GC
> pauses are what explains an alert, so they are what you look at once you have been paged.
> The fourth signal, saturation, is also the only leading one — it is how you get warning
> before the errors start — and for a Spring service the specific numbers are HikariCP
> `pending` connections, Tomcat `busyThreads`, and the HTTP client pool's active count. A
> monitoring setup with RED and no saturation is a setup that learns about its problems
> from the users.

#### Common Mistakes

- Committing `spring.profiles.active` or a production profile file with real values. The
  failure is not a breach, it is that the repository now lies about how the service is
  configured.
- Rolling out a canary whose rollback trigger is a human watching a dashboard. It fails on
  availability, objectivity and speed — and a deploy is emotionally expensive to roll back,
  so the watcher is biased.
- Treating readiness as "the process started", so the canary sends traffic to an instance
  that cannot serve it. Readiness means "this instance can serve this traffic correctly".
- A readiness probe that does not reflect the connection pool, so a database blip does not
  remove the instances it should.
- A runbook written once at launch and never updated, which is worse than none because it
  is confidently wrong.
- Alert names like `service_error_rate_high`, which tell a 3am responder nothing and send
  them to three round trips before they can act.
- Alerting on technical metrics directly rather than treating them as the diagnostic
  dashboard behind a symptom-based page.
- Averaging latency rather than tracking p95/p99, producing a number that is technically
  correct and operationally useless.
- Never deleting a feature flag, so that the combination space grows past what anyone can
  reason about.

#### Interview Questions — Production Practice

**Q1. A team ships a canary rollout. What makes it a canary rather than a smoke test, and
what is the part teams get wrong?** `STAFF`

The part teams get wrong is the **rollback trigger**. A canary exists to limit blast radius,
and it only does that if the decision to roll back is automatic and metric-based. A human
watching a graph fails on availability (nobody is watching at 3am), objectivity (rolling
back a deploy is emotionally expensive, so the watcher is biased), and speed (the decision
takes minutes and the incident takes less). The trigger should compare the canary against
the baseline on technical metrics *and* on a business metric — a deploy can be technically
healthy and commercially dead, and only the business metric catches that. The secondary
point: the canary's readiness probe has to be designed with it, because a probe that is too
eager sends traffic to an instance that cannot serve it and converts the canary into the
outage it was meant to prevent.

**Q2. When is a build-time flag right, and when do you need a dynamic one?** `TRICKY`

`@ConditionalOnProperty` when the flip does not need to happen without a deploy — it is
cheap, it has no runtime evaluation cost, and it cannot produce two code paths in production
simultaneously. A dynamic flag when same-day rollback or per-tenant rollout is worth the
cost, and the cost is specific: two code paths live in production at once, the combination
space grows multiplicatively, and the evaluation adds a dependency. The question to ask
before adding a second dynamic flag is not "is this safe to flip" but "can I explain, for
any given user, why they saw this?" — if the answer comes from the audit trail, the flag is
manageable; if it comes from reading source, it is not.

**Q3. What makes feature flags dangerous, and what are the three disciplines that keep them
survivable?** `STAFF`

They accumulate. Ten flags is 1,024 combinations and nobody can enumerate them, so the
danger is not any individual flag but the interaction space, which is where the bugs live
and which nobody reviews because the evaluation code is usually a separate concern. The three
disciplines: an audit trail (flag, value, subject, correlation ID — so "it happened for me"
is a lookup rather than an archaeology exercise), a removal ticket and an owner created in
the same PR as the flag, and a way to answer "which flags were evaluated for user X, in
what order, and what did each resolve to". That last one is worth more during an incident
than most tracing you could add.

**Q4. What should a service's runbook contain, and what is the most commonly skipped
piece?** `TRICKY`

Six things: dependencies and their timeouts, the alert definitions verbatim, the rollback
procedure, the active feature flags, the scaling limits, and the known failure modes. The
most commonly skipped are the alert definitions and the known failure modes. Alert
definitions, because an alert named `service_error_rate_high` conveys nothing and the
on-call responder has to find the threshold, the dashboard and the runbook link — three
round trips at 3am. Known failure modes, because that is the only document capturing the
*why* of a past decision, and it is the difference between an incident and a recurrence. The
organisational version: a runbook is only trustworthy if it is updated in the same PR that
changes what it documents, and every post-incident review should end with a question about
the runbook as well as the code.

**Q5. What are the four signals you would alert and measure on, and which is the only
leading one?** `STAFF`

Rate, errors, duration, and saturation. Rate is requests per second per endpoint — the
demand, without which every other number is uninterpretable. Errors is failures per second
*and* the non-2xx rate, as a count rather than a boolean, because a boolean loses the
magnitude. Duration is the latency *distribution* — p50, p95, p99 — never an average,
because an average is a number nobody can alert on. Saturation is the resource closest to
exhaustion, and it is the only leading indicator: rate and errors are lagging, saturation
is how you get warning. For a Spring service the specific metrics are HikariCP's
`active`/`idle`/`pending` connections, Tomcat's `busyThreads`/`currentThreads`, and the
HTTP client pool's utilisation — published by Micrometer and almost never alerted on.

**Q6. Why is "alert on every metric" the same as "alert on nothing"?** `STAFF`

Because of the response, not the mechanics. Paging on every threshold trains responders to
batch, defer, and triage by volume — which is the correct learned behaviour given the signal
quality, and it means the real page is dismissed as the twenty-first one this hour. The fix
is symptom-based alerting derived from the user-visible thing — error rate, latency,
availability — with the technical metrics as the *diagnostic* dashboard you open after
being paged. The test for any alert is the three questions: is this affecting users now,
what changed and when, and what do I do first. An alert that cannot answer all three should
not page a human, and applying that filter is most of the work.

**Q7. How do you decide what a readiness probe should actually check?** `TRICKY`

Readiness means "this instance can serve this traffic correctly", not "the process has
started". The checks that belong: can I get a connection from the pool *right now* (not
"is the pool configured"), are the migrations for this version applied, is the instance not
in a circuit-broken state for its own critical dependencies. What does not belong: anything
that fails readiness when a *downstream* is degraded, because that turns a dependency
outage into a fleet-wide one by removing every instance from rotation simultaneously. That
asymmetry is the thing to get right — liveness and readiness have genuinely different
failure semantics, and a probe that conflates them takes the whole service down when one
dependency wobbles.

**Q8. Your team ships 40 services and none has a runbook. What is the cheapest
intervention, and what is the trap?** `STAFF`

Cheapest: make the runbook a template with the six required sections, and generate the parts
that can be generated — the dependency list from the actuator, the alert definitions from the
alerting config, the flag list from a single flag-management class. The trap is treating
that as the deliverable, because a generated runbook is confidently incomplete, and a
confidently incomplete runbook is worse than none — the responder trusts it and discovers
the gap mid-incident. The part that cannot be automated is the known-failure-modes section,
which is written by whoever just had the incident, which is why the post-incident review has
to explicitly ask for it rather than treating it as documentation someone else will handle.

> **CHAPTER 7 SUMMARY**
>
> Production practice is mostly about making the system's state legible to someone who was
> not in the room when it was decided. Configuration is environment-driven with committed
> defaults and no committed profile. Feature flags are cheap when they are build-time and
> expensive when they are dynamic, and the expense is paid in the combination space and in
> the audit trail you did or did not build. Rollouts limit blast radius only if the rollback
> is automatic and metric-based, and a canary's readiness probe has to be designed with it.
> A runbook is an organisational artefact that decays unless it lives next to the code, and
> the observability baseline is RED plus saturation, alerting on symptoms and measuring
> causes — with the three questions (are users affected, what changed, what do I do first)
> as the filter that keeps the pager trustworthy.

#### Further Reading

- [Spring Boot Reference — Profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html) — profile activation, profile groups, and multi-document YAML, which is the mechanism for keeping production config out of the repository.
- [Martin Fowler — Feature Toggle](https://martinfowler.com/bliki/FeatureToggle.html) — the taxonomy (change, experiment, operational, permission-based) and the honest treatment of the maintenance cost.
- [Martin Fowler — Blue/Green Deployment](https://martinfowler.com/bliki/BlueGreenDeployment.html) and [Canary Release](https://martinfowler.com/bliki/CanaryRelease.html) — the two rollout strategies, what each costs, and why a canary without an automated rollback trigger is not worth the extra infrastructure.
- [Google SRE Book — Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) — the four golden signals and the case against alert-on-everything, written from the fleet that learned it the expensive way.
- [Micrometer documentation](https://micrometer.io/docs/) — where the pool, JVM and HTTP client metrics in the saturation list come from, and how to get them into your backend without hand-written instrumentation.

---

### End of Volume 9

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain why coverage is a false signal, and give the ranking rule that replaces it —
  order your test backlog by what would have caught the last three incidents
- Name what a unit test structurally cannot catch in a Spring application, and why the
  integration tier exists for that reason alone
- Explain the context cache: what it keys on, why cost scales with distinct
  *configurations* rather than tests, and what `spring.test.context.cache.maxSize` does and
  does not fix
- State that `@MockBean` is deprecated as of Spring Boot 3.4 in favour of the Framework's
  `@MockitoBean`, and that the replacement cannot go on a `@Configuration` class
- Give three specific bugs that H2 hides and a real container does not, and explain why
  `withReuse(true)` belongs in zero CI configurations
- State the rule for where to mock — process boundary, not class boundary — and the
  compile-error reason a test-data builder beats positional constructor literals
- Do the container memory arithmetic: why `MaxRAMPercentage` is 70–75% and not 90%, and
  what 200 Tomcat threads cost before any business code runs
- Do the pool arithmetic: `max-threads=200` as a bound on in-flight requests rather than
  throughput, and `maximumPoolSize` as containment sized at `cores + disks`, whose real cost
  when too small is queueing latency
- Run the two-minute diagnostic: three `jcmd <pid> Thread.print -l` dumps ten seconds
  apart, and say what each pattern means — `HikariPool.getConnection`, `SocketInputStream`,
  a lock, `Found one Java-level deadlock`
- Start JFR with `jcmd`, know that `default` is for continuous and `profile` for a bounded
  capture, and explain why 1–2% overhead means it should be on permanently
- Explain the cascade mechanism and name which bound each mitigation provides — timeout,
  bulkhead, breaker, load limiter — and why a 27× retry multiplier appears across a
  three-hop chain
- Say what a service's runbook must contain, and name the observability baseline as RED
  plus saturation, with the three questions every alert has to answer

### Coming in Volume 10 — WebFlux & Project Reactor

Volume 9 was about the blocking world: thread pools, connection pools, and the specific
arithmetic that decides whether a blocking Spring service survives contact with a slow
dependency. Volume 10 takes the same questions to the reactive stack — what happens to
those pool numbers when a request is a `Mono` rather than a thread, how backpressure
replaces thread-pool sizing as the capacity bound, and why the confident answers ("just go
reactive", "`flatMap` runs them all at once") are the ones most likely to be wrong.

---

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### The Test Pyramid

**D1. A service has 92% line coverage and shipped four incidents last year. Is the suite
doing its job, and what would you do about it?**

Not necessarily, and the first question is which 92% those are. The failure branches —
rollback, timeout, missing configuration, the scheduled-task entry point — are systematically
under-tested because they are less fun to write, and coverage does not distinguish them from
getters. I would pull the four incidents, write down the test that fails before each fix, and
check whether any of them exist. If none do, the number was optimised rather than earned and
should stop being reported. The deeper problem is that a 92% figure produces a false sense of
completion, and that suppresses the conversation about what is actually unguarded.

**D2. A team proposes to delete the integration test suite and reach 100% unit coverage
instead. Make the case against it, then say when you would accept it.**

The structural argument: a unit test constructs the object graph by hand, so it has no
container, no auto-configuration, no property binding and no proxies. A missing bean, a
missing property, a bad `@Conditional`, and a `@Transactional` self-invocation all produce
a green unit suite and a broken application. Unit tests cannot get to 100% honestly either —
the parts you cannot reach are usually the wiring. I would accept the proposal only for a
service with no HTTP surface, no configuration surface, and no persistence — and even then
only if the wiring is verified some other way, such as a single smoke test per deployable
unit.

**D3. Is the test pyramid still the right model, or has something replaced it?** `STAFF`

It is a model of *where tests go*, and it survives, but the ratios it implies do not. Three
things have changed the arithmetic. Container start-up used to make integration tests
expensive enough to ration; with a singleton Testcontainer per JVM the cost is amortised
across hundreds of tests, so more of them is now cheap. Change in the test world means more
tests are a *product* decision than an engineering one — a feature is not done until it
has tests — which means the pyramid gets argued about by people who own roadmaps. And the
biggest shift is that the expensive failure is increasingly a *configuration* failure, which
no amount of unit testing addresses. So: the shape holds, the ratios are a starting point
rather than a target, and the useful question is the incident-weighted one from the
chapter, not "how many of each tier".

**D4. How do you decide what to test next on a well-covered service?** `STAFF`

Incident-weighted, and the ranking is a function of evidence rather than of a static
backlog. Take the last three incidents, write the test that fails before each fix, and queue
those. Three things usually come out on top: a transaction-boundary test that asserts the
rollback, a query-shape test that fails if the query becomes an N+1, and a
configuration-binding test that fails when a required property is absent. Each of those
catches a *class* of bug rather than an instance, which is the property you want from a
test at this stage.

**P1. A test passes alone and fails in the full suite. The class is annotated
`@DirtiesContext`. What is actually wrong?**

Almost certainly the same thing in both cases: the context is being torn down because test
state leaks. The isolated pass proves the test is order-independent; the suite failure proves
something — a shared row, a cached value, a mutated singleton — survives between classes.
`@DirtiesContext` is a synchronisation primitive being used as a symptom suppressor. The
real fix is per-test data ownership: a rollback transaction, a truncate-between-tests, or one
container per class with cleanup at the class boundary. And the review question for every
new `@DirtiesContext`: what state is leaking, and why wasn't it made per-test?

**S1. A PR adds `@SpringBootTest` to a class that tests a service with two collaborators.
What should the reviewer ask?**

What the context proves that the service does not. A `@SpringBootTest` on that class pays
several seconds per class to assert the beans exist, and the service's actual logic could
be tested with a plain `new` and two fakes. The reviewer's question is "is the container the
subject here, or is it just the most convenient way to get the collaborators?" If the
answer is the latter, the test is a slow unit test wearing the wrong annotation, and the
suite's wall-clock is the cost. The exception worth naming is a test that genuinely needs
the wiring — that is a real reason, and the reviewer should accept it.

**T1. A `@SpringBootTest` class sets a different `@TestPropertySource` from the other
twelve classes in the suite. What does that do beyond changing the config?**

Two things. It changes the context cache key, so this class builds a *new* context rather
than reusing the cached one — the suite's cost is the number of distinct configurations,
not the number of tests. And `@TestPropertySource` sits second in the property precedence
ladder, above command-line arguments and environment variables, so a value set there cannot
be overridden by anything in the environment. Both are reasons to fix the leak behind the
override rather than add another override.

**D5. A team wants 100% coverage on the payment module before launch. What do you say?**
`STAFF`

I would ask what the last three payment-module defects were, because that is the same
question with a number attached. If the module is at 100% and two of those three bugs would
still ship, then the number is measuring line execution and not the property they actually
care about. The specific thing to say is that 100% of a payment module is usually achieved by
testing the getters of a value object, and that the things that cost real money — a
refund applied twice, a currency conversion using a stale rate, a retry double-charging —
are all in the untested failure paths. I would offer a smaller, better-chosen set: a
property test on the arithmetic, an idempotency test against a real database, and a test
that asserts a declined card releases the inventory reservation.

### Boot Test Annotations & Testcontainers

**D6. Testcontainers versus H2 — when would you genuinely choose H2, and what are you
accepting?**

I would choose H2 for two narrow cases: a library's own test suite that must run on a
developer's machine with no Docker, and pure in-memory query logic where the SQL is
trivial. Everywhere else I would use a container, because the emulation buys speed by
changing the thing under test — MVCC and isolation semantics, strict casts, real
`SELECT FOR UPDATE` locking, collation, `timestamptz`, and functions H2 may not have. The
thing to accept explicitly is that H2 is a *second dialect*, and the bugs it hides are the
ones that land during a production migration. The honest middle position, and the one I
usually argue for, is: H2 for the inner loop, a container in CI — the same tests, two
data sources.

**D7. A container-backed suite takes 25 minutes. The team wants to go back to H2. What do
you say?** `STAFF`

I would separate the two claims, because they have different answers. Going back to H2
trades the suite's correctness for its wall-clock, and it is the wrong trade — the bugs H2
hides land in production migrations, which is the most expensive way to find out. But 25
minutes is a real problem with real causes, and the first three are cheap: a container per
test class rather than one per JVM, the image being pulled on every run instead of
pre-pulled in the build image, and migrations re-running per class. Only after those, the
argument is about sharding the suite across runners rather than reducing what it tests.

**D8. Should test suites share a database?** `STAFF`

No, and the reasoning is the same in every environment. A shared database is not isolated
(tests collide with each other and with real traffic, so parallel runs are impossible), not
deterministic (someone else's deploy breaks your build), and not contained (a test that
truncates a table breaks the running application). The replacement is a container per JVM
with a per-class schema, or a per-run database, started by the build rather than shared by
it. The objection to hear is speed, and the honest response is that shared-database setups
are slower once you count retries, the serialisation they force, and the human time spent
diagnosing someone else's data.

**P2. A developer says a Testcontainers test "passes on my machine" and a teammate cannot
reproduce it. What are the three likely causes?**

In order: `withReuse(true)` enabled locally, so the first run left a schema and a Flyway
baseline behind that the second run inherits; a fixed port or a fixed test database name
that another process on their machine already owns; and an uncommitted local config file or
`application-local.yml` that the second machine does not have. The first is the most common
and the most confusing, because the data left behind is from a state of the code that no
longer exists.

**S2. A PR adds `@MockBean` to a test in a Boot 3.4 codebase. What is the review
comment?**

Two things. `@MockBean` is deprecated as of Boot 3.4 in favour of `@MockitoBean` from the
Spring Framework, and a new usage should not be introduced. And the migration is not a
rename — `@MockitoBean` cannot go on a `@Configuration` class, so if this is a pattern the
PR is continuing, the configuration class needs restructuring to declare the bean on test
class fields. The second point is the one worth making in review, because it is the reason
the deprecation is a migration rather than a find-and-replace.

**T2. A `@WebMvcTest` test needs a mocked `OrderService`. Is that a slice test?** `TRICKY`

It is a slice test that has been pushed past its purpose. `@WebMvcTest` loads the web layer
and excludes services precisely so it can verify the layer boundary — message conversion,
validation, status codes, `@ControllerAdvice`. Mocking the service is normal and correct for
that. What is *not* correct is needing three or four mocked collaborators until the
"slice" is really a slow `@SpringBootTest` that has also removed the wiring the slice
existed to check. The test to write for a multi-collaborator controller is a plain unit test
on the controller itself, where the argument assertions are direct and there is no Spring at
all.

**T3. What does `webEnvironment = MOCK` actually give you, given that `TestRestTemplate`
works under it?** `TRICKY`

It gives you a web application context with a mock servlet environment: no socket, no real
container, but `DispatcherServlet`, filters, message converters and the whole MVC stack are
real, and `TestRestTemplate` and `WebTestClient` are bound to it through
`MockRestServiceServer`. So MOCK does not mean "the web layer is untested" — it means "the
servlet container is not under test". What it genuinely cannot catch is container-level
filter registration, character-encoding defaults, error-page dispatch, and static resource
handling. A test that needs the socket is testing below the DispatcherServlet, and it should
be a `RANDOM_PORT` test — but only where you actually have that list of concerns.

**D9. Test profiles differ from production in several settings. Which divergences are
actually dangerous, and what is the rule?** `STAFF`

The dangerous ones are the behavioural, not the environmental. Pointing at a container
rather than a laptop's database is fine. But `open-in-view=false` in tests hides every lazy
loading bug, a smaller connection pool hides starvation, generous or absent timeouts hide
latency and the retry storm behind it, lazy-init hides the startup-to-first-request
conversion, and all-flags-on hides the combination. The rule is that a test profile may
differ from production in *where it points* and never in *how the application behaves* — so
timeouts, pool sizes, open-in-view, lazy-init and flag defaults have to match, and the ones
that genuinely cannot match should be asserted explicitly rather than assumed.

### Mocking & Test Design

**D10. Is heavy mocking ever justified in a service with no external dependencies?** `STAFF`

Rarely, and the question exposes the real issue. With no process boundaries there is nothing
to mock at the correct level, so every mock is a class-boundary mock — which means the test
asserts only that the class calls its collaborators and re-implements the logic in the test.
The legitimate cases are narrow: mocking a static or a `Clock`, which are process
boundaries even though they are in-process, and isolating a genuinely expensive
collaborator in a test that specifically is about the interaction rather than the logic. The
wider point is that a service with no external dependencies should mostly be tested with
real objects and fakes, and that a codebase needing extensive mocks for such a service has a
design problem the mocks are hiding.

**D11. You inherit a test suite where every test mocks all four collaborators. What is the
migration plan, and what will the team push back on?** `STAFF`

The plan is to work backwards from the business rules, not forwards from the test files:
identify the three or four behaviours the class actually decides, write those as tests with
real objects and fakes where a collaborator has behaviour, and delete the `verify` soup for
the ones that turn out to add nothing. The pushback will be on time — it is slower to
rewrite than to maintain — and on the fact that the fully-mocked tests are green, so nothing
is broken. The argument that works is about the *next* refactoring: every one of those tests
needs a fix-up commit, so the team is paying per-PR for a suite that catches no logic bug,
and that cost is invisible only because it is small and constant rather than large and
occasional.

**D12. Property-based testing versus example-based testing — when is each right, and is
the added tooling worth it?** `STAFF`

Examples are right when the behaviour is a documented business rule, because a named
example test *is* the documentation and reads correctly in a failure report. Properties are
right for arithmetic, invariants, and boundaries — a discount that can never exceed the
subtotal, a round-trip through JSON, a total that is never negative — where a fixed example
only proves the case its author thought of. The tooling is worth it once you have one
domain area with real arithmetic, and not before: jqwik is a small dependency and the
shrink-to-minimal-case feature is what makes failures debuggable, but a service with no
invariants will find nothing and conclude the tool is useless.

**P3. A test started failing after an unrelated refactor. The only change was renaming an
internal method. What does that tell you?** `STAFF`

That the test was coupled to structure rather than behaviour — most likely a mock
interaction assertion, since `verify(inventory).reserve("A-1")` pins the shape of the
implementation. It is not a bug in the test, it is the test doing what it was written to do.
The diagnostic question is whether the assertion is about an *observable effect* (the
reservation was made, the charge happened, the event was published) or about a *particular
call* (this collaborator, with these arguments, in this order). The first survives
refactoring; the second is a re-implementation of the code. And the frequency of these
failures is the metric to watch — a suite needing a mock fix-up on a third of its PRs is
telling you it is a second implementation of the system.

**S3. A PR adds a test-data builder with fourteen fields and no defaults set for six of
them. What is the review comment?**

The builder needs defaults for every field, because a test that constructs a domain object
and leaves six fields at their Java defaults is a test whose preconditions are invisible —
and worse, the defaults are *wrong by default* rather than obviously absent, so the failure
appears somewhere unrelated. A builder whose whole point is that only the relevant fields are
named has to make the irrelevant fields safe. The specific rule: a test data builder's
defaults should describe a valid, boring instance of the domain object, and any field whose
default would be a lie — a null id, a zero price, a past date — should fail loudly if used
unset.

**T4. A test stubs `when(repo.findById("order-1")).thenReturn(order)` and the code under
test calls `findById("order-2")`. What does the test see?** `TRICKY`

The default — `null` — with no error from the stub. The call does not match, so Mockito
returns the type's default and the test fails later with a `NullPointerException` or a
failed assertion, pointing at a place that has nothing to do with the cause. This is the
single most common wasted debugging hour in mock-based testing, and it is exactly what
`STRICT_STUBS` exists to prevent: in strict mode the call raises a
`PotentialStubbingProblem` at the actual call site. A team that turns that mode off to
reduce noise has chosen the slow failure over the fast one.

### Performance & Memory

**D13. A service's p99 latency is 4 seconds under load and 60 ms when idle. CPU peaks at
40%. Where do you start, and what would you not do?** `STAFF`

Thread dumps, before any other tool, because they cost nothing and answer most of it. Three
`jcmd Thread.print -l` dumps ten seconds apart, and what never changes is the answer. The
CPU figure already tells you most of it — 40% peak with 4-second latency means threads are
blocked, not computing. If the pattern is `HikariPool.getConnection`, the next question is
which query, not what pool size; if it is `SocketInputStream`, it is a downstream and the
frame below names which. What I would not do first is raise `max-threads` or
`maximumPoolSize` — both add concurrency to a system that is already failing to complete
work in flight, and both make the collapse faster.

**D14. How would you size the database connection pool for a new service, and what would
make you change your answer?** `STAFF`

Start at `cores + disks` for the instance, which on a typical 4-core cloud instance with a
network-attached volume is 5–6 — smaller than the default of 10, and that is deliberate. The
arithmetic that settles it: if a query holds a connection for 1 ms and the database does
8,000 queries a second, eight connections already sustain 8,000, so the default is past the
knee and buying nothing. What changes the answer is the query holding time: a service whose
queries average 200 ms rather than 1 ms needs a different pool entirely, and one doing
long-running analytical work should be on a replica rather than a bigger pool. And I would
set `connectionTimeout` to the request budget rather than leaving the 30-second default,
because that is what turns exhaustion into a fast, alerting failure.

**D15. Is it better to have more Tomcat threads or more instances at a given total
capacity?** `STAFF`

More instances, essentially always, and the reason is not throughput. More threads inside one
instance means more concurrent in-flight work, which means more database connections
competing for the same pool, which means more lock contention and a longer tail at the
database. Instances also give failure isolation, independent deploys, and a way to shed
traffic from one unhealthy replica. Past roughly 200 threads the count stops being a
capacity knob and becomes a latency knob — the queue in front of the pool shows up as
latency rather than as an error. The honest caveat is connection-pool multiplication: ten
instances each with ten connections is a hundred connections against the database, and past a
certain fleet size that is the constraint you hit, not CPU.

**D16. A JVM pod is OOMKilled under load but survives fine locally. What is the most likely
explanation, and how do you confirm it in two minutes?** `STAFF`

The JVM sized the heap against something other than the container limit — most often the
host's memory, on a shared CI node or a misconfigured runtime — so it believes it has far
more heap than the cgroup permits and the kernel kills the process. Exit 137 with no
`OutOfMemoryError` and no heap dump is the signature, because the kernel killed it before the
JVM could throw. The two-minute confirmation is the startup log: compare the **reported max
heap** against the container's memory limit times `MaxRAMPercentage`. If they do not match,
the flag did not take. The second check, once that is right, is whether anything outside the
heap is eating the rest — 200 Tomcat threads at ~1 MB of stack is ~200 MB before any business
code runs.

**D17. Would you enable JFR in production permanently?** `STAFF`

At the `default` profile, yes, with a rotating buffer, and switch to `profile` for targeted
captures and load tests. The default profile is around 1–2% overhead, which is inside the
noise of a service's own variance, and the reason to leave it on is retrospective: a
recording started at the beginning of an incident has already missed the interesting part.
The rotation is not optional — `maxsize=500m,maxage=2h` — because an unbounded recording
will fill the disk and take the pod down, which is a genuinely embarrassing self-inflicted
outage. What I would not do is leave the `profile` settings on continuously; at 5–10% they
are a measurable latency cost for detail you only need during a capture.

**P4. `jcmd` shows 60 Tomcat threads parked in `HikariPool.getConnection`, identical
across three dumps. The team proposes raising `maximumPoolSize` from 10 to 50. What do you
say?**

That the dump already says what the problem is, and the proposal treats the symptom. Sixty
threads waiting for connections means the ten connections are held for long enough that
sixty requests are queued behind them — which means the queries are slow, not that the pool
is small. Raising to fifty would allow five times the concurrent slow queries against the
database, which makes lock contention and the tail worse. The next step is
`leak-detection-threshold` plus the query plan for the frame below `getConnection`. The pool
is the containment mechanism working as designed; the disease is the query holding it.

**S4. A PR adds `-Xmx4g` to a service that runs in a 6 Gi container with 12 replicas. What
should the reviewer check?** `STAFF`

Three things, in order. Whether 4 Gi plus metaspace, code cache, direct buffers and 200
threads' worth of stack fits in 6 Gi with headroom for the GC's own structures — it usually
does not, and the failure mode is a silent `OOMKill` rather than an exception. Whether the
JVM actually sees the cgroup limit, which the startup log's reported max heap answers in ten
seconds and which a hard-coded `-Xmx` bypasses entirely. And whether anyone has checked
what the aggregate memory is doing: twelve replicas is 72 Gi of heap, and if this service
shares a node or a database host, the collective footprint may be the actual constraint the
review should be about.

### Distributed Failure Modes

**D18. "Should this service be resilient?" — how do you answer that without hand-waving?**

With two questions whose answers decide it. First: what does this service do when its worst
dependency is ten times slower? If the answer is "it stops serving", the design is incomplete
and no amount of monitoring fixes it — and the honest first fix is a timeout and a bulkhead,
not a circuit breaker. Second: is there a degraded answer that is better than an error? A
circuit breaker without a fallback is a fast total failure, so it is only worth having if you
can serve a stale value, a default, or a failover. And the framing that makes it a staff
answer rather than a checklist: resilience is not a property a service has, it is a set of
decisions about what this service is willing to lose, and a team that has not written those
decisions down will make them by accident during an incident.

**D19. A team has added timeouts, bulkheads and circuit breakers and the outages got worse.
What happened?** `STAFF`

They multiplied amplification rather than bounding it. If both this service and its caller
retry, the retry budget doubled and a three-hop chain can reach 27×. If the timeouts were
shortened defensively, recoverable slowness became hard errors while the breaker rejected
the rest, concentrating the dependency's traffic into a small number of very short requests
that are more likely to trip the dependency's own rate limits. And if the breaker was
configured with no `minimumNumberOfCalls`, a single failure opened it and it rejected
everything for the open-state duration — converting a partial failure into a total one.
The lesson worth stating is that resilience mechanisms interact, and configuring them
independently is how a service makes its own incident worse.

**D20. Thread-pool bulkheads versus semaphore bulkheads for an HTTP dependency that can
hang — which, and what do you pay for the choice?** `STAFF`

Thread pool, and the reason is specific rather than stylistic. A semaphore bounds how many
calls are in flight, but those calls run on the *caller's* threads, so twenty permits
against a dependency that hangs for thirty seconds still park twenty caller threads for
thirty seconds and the semaphore has bounded nothing that matters. A thread pool runs the
work on its own threads, so a hung dependency exhausts the pool and the rejection is
immediate. The costs are real: twenty threads per bulkhead, and the need to propagate
`SecurityContext`, `RequestContextHolder` and MDC across the hop with a `TaskDecorator` —
and getting that wrong is worse than no bulkhead, because it silently drops the security
context.

**D21. How would you configure a circuit breaker for a dependency you know nothing about?**
`STAFF`

Start with the parameters that prevent it from doing harm, not the ones that make it
responsive. `minimumNumberOfCalls` set to something real, so a single failure at 3am cannot
open the circuit and reject 100% of traffic. `slidingWindowSize` large enough that a short
burst does not dominate, and `failureRateThreshold` above the dependency's normal error
rate. `waitDurationInOpenState` long enough to avoid flapping, and trial calls in half-open
few enough that you do not re-open the outage yourself. And the one most often missing:
`slowCallDurationThreshold` set to roughly the dependency's p99, because a breaker that only
counts exceptions will never open for a slow-but-returning-200s dependency — which is the
case that causes the cascades in the first place. Then add a fallback, because a breaker
that only rejects converts your dependency's problem into yours.

**P5. A service's dependency goes from 40 ms to 8 s p99 but returns 200. The service has
circuit breakers on it. Why doesn't the breaker open?** `STAFF`

Because breakers that only count exceptions count nothing here, and 200s are not exceptions.
This is the failure mode that makes cascade analysis hard: a dependency that is slow and
successful produces no error signal, so error-rate-based alerting and exception-based
resilience both stay silent while the calling service's thread pool drains. The fix is
`slowCallDurationThreshold` on the breaker and slow-call-rate on the rate limiter, and the
diagnostic discipline is to treat *duration* as a first-class failure signal alongside errors
— which is the same reason p99 matters more than a boolean health check.

**S5. A PR adds a fallback that returns an empty list when a recommendation service is
down. What is the review comment?**

That an empty list is indistinguishable from "there are no recommendations", so the business
will act on it as fact — and the failure is invisible, which is worse than the outage that
caused it. A fallback needs three things: a metric so degradation is visible on a dashboard,
a log line with a correlation ID, and a marker in whatever the answer reaches. If the
consumer of that list is a UI, the marker may be a "recommendations temporarily unavailable"
state; if it is a pricing decision, the fallback should be a policy rather than a value. The
general rule: a fallback that cannot be distinguished from the real answer is a data-quality
incident waiting for a reporting cycle to find it.

**T5. Two services in a call chain both retry three times with exponential backoff. What is
the peak downstream load, and what makes it worse?** `TRICKY`

Twenty-seven times the original at the bottom of the chain, because each level multiplies the
level below it: 3 × 3 × 3. What makes it worse in practice is three things. Backoff without
jitter synchronises every client in the fleet into the same retry wave, so a hundred
instances that failed together retry together. Retries that ignore idempotency turn a
partial failure into a duplicate one. And a timeout long enough that each retried attempt
holds a connection and a thread for a long time, which is what turns the amplification into
the cascade. The fix is partly arithmetic and partly organisational: exactly one layer owns
the retry budget, and everything below fails fast.

**T6. A service's circuit breaker has `minimumNumberOfCalls` unset and opens at 03:00 with
no dependency problem. What happened?** `TRICKY`

One genuine failure at low traffic was enough to open the circuit and reject 100% of traffic
for the duration of the open state. That is strictly worse than the outage the breaker was
supposed to protect against, because a 1% error rate became a 100% one — the breaker
converted a partial failure into a total one, entirely on its own. The fix is a real
`minimumNumberOfCalls` so the rate is measured on a sample rather than on one call, plus a
fallback so `OPEN` means degraded rather than absent, plus a slow-call threshold so the
breaker also opens for the dependencies that actually cause cascades.

### Production Practice

**D22. When is a canary rollout not worth its cost?** `STAFF`

When the change is schema-destructive, or when the service has no meaningful traffic to split
— an internal tool with twenty users, or a change that requires all instances to be on the
same version for correctness. It is also not worth it if the rollback trigger is a human
watching a graph, because then you have paid for the infrastructure and kept the risk: a
watcher fails at 3am, is biased against rolling back a deploy, and is slower than the
incident. The cost side is real too — canaries need metrics infrastructure, a baseline to
compare against, and the discipline to wire the trigger to `rollbackOnFailure: true` rather
than to a notification channel. Without the automatic part, blue/green is usually the better
buy: same infrastructure cost, faster and more reliable rollback, and no judgement calls.

**D23. A team has 40 services and no runbooks. What is the cheapest intervention, and what
is the trap?** `STAFF`

A template with the six required sections, and generate what can be generated — the
dependency list from the actuator, the alert definitions from the alerting config, the flag
list from a single flag-management class, the rollback procedure from the deployment config.
The trap is treating that as the deliverable, because a generated runbook is confidently
incomplete and a confidently incomplete runbook is worse than none: the responder trusts it
and discovers the gap mid-incident. The part that cannot be automated is known failure
modes, which is written by whoever just had the incident — which is why the post-incident
review has to explicitly ask for it rather than treating documentation as something someone
else will handle.

**D24. Should a service commit its production configuration?** `STAFF`

No, and the reason worth giving is not the security one. Committing `spring.profiles.active`
or a production profile file means the repository now *lies* about how the service runs:
someone debugging at 3am reads `maximum-pool-size: 50` in the repo and believes it, while
the environment is silently overriding it with 10. Configuration belongs to the environment,
the repository holds conservative defaults and the *shape* of the configuration, and the
`spring.profiles.default: prod` fallback means a missing profile setting fails toward
production behaviour rather than toward a developer's laptop. The exception — a
production-shaped file with no real values, purely to document the required keys — is
reasonable, and the discipline is that no real value ever enters the repository.

**D25. How do you keep feature flags from accumulating into something nobody can reason
about?** `STAFF`

Three practices, and the first is the one that actually does the work. An audit trail that
makes "why did this user see this?" a lookup — flag, value, subject, correlation ID — rather
than an archaeology exercise. A removal ticket and a named owner created in the same PR as
the flag, so it is a scheduled deletion rather than a someday cleanup. And a way to answer
"which flags were evaluated for this request, in what order, and what did each resolve to",
which is the endpoint you will actually want at 3am. The recognition underneath is that ten
flags is 1,024 combinations and nobody can enumerate them, so the question is not "is this
flag safe" but "can I explain any given user's behaviour from recorded evidence".

**P6. An alert fires at 2am for `service_error_rate_high` and the responder spends 20
minutes establishing what it means. What went wrong, structurally?** `STAFF`

The alert was written for the metric rather than for the reader. Three structural problems,
in order: the name carries no threshold, no scope and no meaning, so the responder has to go
and find them. The alert does not link the runbook, so the answer is not where the responder
looks first. And it may not answer the three questions at all — is this affecting users, what
changed and when, what do I do first. The fix is not a better dashboard; it is requiring
every alert to carry a threshold, a scope, a dashboard link for the same window, and a
runbook link, and to be deleted if it cannot answer all three. The 20 minutes is the
measurable cost of the process, and it is how you argue for the review that gets weak alerts
removed.

**S6. A PR changes a readiness probe from a liveness-style check to one that includes a
database connectivity check. What should the reviewer think about?** `STAFF`

That it is right in intent and possibly wrong in scope, and the distinction is the important
part. Readiness means "this instance can serve this traffic correctly", so a pool that
cannot hand out a connection genuinely should fail readiness. But the trap is coupling
readiness to *downstream* health: if readiness fails when a downstream is degraded, every
instance fails readiness simultaneously, the whole service leaves rotation, and a
dependency's blip becomes a total outage. The rule is that readiness reflects this
instance's ability to serve — its own pool, its own migrations, its own warm-up — and
liveness is the "do not kill me" signal that should stay cheap. Reviewers should also check
the failure threshold and period, because a readiness probe that flaps takes a healthy
instance out of rotation and puts it back in with a cold pool.

**T7. Your service has 200 Tomcat threads, 10 database connections, and a 3-second request
budget. A downstream is called with a 2-second timeout and retried twice. What is the
worst-case time and connection occupancy for one inbound request?** `TRICKY`

Worst case is 6 seconds of wall-clock — three attempts at 2 seconds each — which is already
twice the 3-second budget, so the request will have been abandoned by the caller before the
third attempt returns, and that attempt's work is wasted. On connections, if the downstream
call is made inside a `@Transactional` method, the database connection is held for the whole
6 seconds, so ten such requests exhaust the pool and the other 190 threads queue. That is
the arithmetic behind the whole chapter: the timeout does not bound the time the dependency
takes from you unless the retry budget fits inside the request budget, and the database
connection is held for the entire thing.

### Mixed and Cross-Cutting

**D26. A team wants to move from a monolith to microservices for resilience. What would you
say?** `STAFF`

That the monolith is more resilient, and the mechanism is worth spelling out because it is
the argument. In a monolith, a slow call is a thread waiting — bounded by the thread pool,
contained by the pool, observable as saturation. Across a network, the same slow call adds
latency that no thread pool bounds, so the containment has to be rebuilt deliberately in
timeouts, bulkheads and breakers, and the default configuration of all three is worse than
the monolith's implicit ones. That is the real cost of a network hop: not the latency, but
the loss of in-process containment. It is worth saying at staff level that the correct answer
to "should this be a separate service" increasingly includes "what is the bulkhead for it, and
who owns the retry budget" — and a team that cannot answer that has a reason not to split
yet.

**D27. You have one week and one engineer to reduce the incident rate of a service. What do
you do?** `STAFF`

I would do the things that are cheap, high-confidence, and tell me what I got wrong. Turn on
continuous GC logging and JFR at the default profile — an afternoon, and it changes every
future diagnosis from a guess into a measurement. Write the `jcmd` thread-dump procedure into
the runbook so whoever is paged knows it, and write down the dependency list with timeouts
and pool sizes. Then audit the three numbers from Chapter 5 against reality: the reported max
heap against the container limit, `connectionTimeout` against the request budget, and
`maximumPoolSize` against `cores + disks`. Finally, look at the last three incidents and see
which one a test or a timeout would have caught. What I would deliberately not do in a week
is restructure the code, because a service with no visibility has an unknown failure rate and
the first job is replacing "we don't know" with data.

**D28. Your team's tests are slow, the suite is flaky, and nobody trusts the build. What is
the first thing you change?** `STAFF`

Flakiness first, and not speed — because a fast suite that fails randomly is worse than a
slow reliable one, and the reason is behavioural: people learn to re-run failures, the
re-run becomes the workflow, and the moment a real failure looks like a flake, it gets
re-run too. The changes that fix it are unglamorous and specific: replace every
`Thread.sleep` with a bounded await on a condition or a real completion signal, inject a
`Clock` so nothing depends on wall time, give every test its own data, and remove the
`@DirtiesContext` annotations that are covering for leaks. Then reduce the number of distinct
context configurations, which is where the time actually goes. The order matters: trust first,
then speed — a faster untrusted suite is a suite the team will start skipping.

**P7. A deploy goes out at 14:00. At 14:20 p99 doubles on one endpoint, and the deployment
dashboard shows nothing. What is your first command?** `STAFF`

`jcmd <pid> Thread.print -l`, three times, ten seconds apart — before looking at the
dashboard, the logs, or the APM. It is free, needs no instrumentation, and it distinguishes
the four possibilities that a latency graph cannot: pool exhaustion (parked in
`HikariPool.getConnection`), a downstream (parked in `SocketInputStream`, with the caller
named in the frame below), lock contention (`BLOCKED` frames with a named owner), and CPU
saturation (`RUNNABLE` everywhere, in which case JFR is next). The reason to reach for it
first despite having a deployment dashboard is that the dashboard shows *that*, and the dump
shows *what*, and everything else you might do first is a version of asking the dashboard
the same question more slowly.

**D29. A team wants to remove the test suite to "move faster". What is the honest argument
against, beyond "quality"?** `STAFF`

That it makes the feedback loop on changes longer, not shorter, and that the slowdown is
paid by the people who need speed most. Without tests, every change requires reading the
code to convince yourself it is safe, which is slower than running a test, and the reading
gets more expensive as the codebase grows. The second argument is about incidents: the test
suite's value is the rate at which it converts a production incident into a red build, and a
service with no tests converts every incident into a debugging session under time pressure.
The third is the one that actually changes minds — the tests are the only place the
behaviour is written down in a form that does not require reading the implementation, and
removing them means the only specification is code, which only works for people who already
understand the code.

**D30. A service has 40 feature flags and nobody can explain what it does with all of them
on. What is the recovery plan?** `STAFF`

Start with the audit trail, if one exists — the fastest path to "what is actually enabled in
production right now" is a recorded evaluation, and building one is the first step if it does
not exist. Then triage: identify which flags are read at startup (those can be consolidated
into a single typed configuration class and validated together) versus read per request
(those are the combination-space problem, and the ones to convert to typed properties or
remove). Set a removal policy with dates and owners, and get agreement that new flags come
with a ticket. The realistic endpoint is not "delete all forty" — it is that every remaining
flag is typed, validated, recorded and has a date, and that the count is going down rather
than up. A flag with no removal date is a permanent branch, and forty of them is a system
nobody can reason about.

