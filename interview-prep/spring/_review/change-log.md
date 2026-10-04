# Spring interview-prep — Change log

**Date:** 2026-10-03
**Branch:** `spring-review-2026-10-03`
**Baseline commit:** `99d3ee0` "Snapshot before Spring interview-prep review (2026-10-03)"

Every change below is a targeted correction or addition to an existing file. No file was created
or deleted in the content tree, no heading was renamed, no section was rewritten wholesale.

## Files edited

| File | Changes | Category |
| --- | --- | --- |
| `spring/spring-01-spring-core-ioc.html` | 3 | Diagram defect, TOC leak |
| `spring/spring-02-bean-lifecycle-scopes-di.html` | 6 | **Factual**, TOC leak |
| `spring/spring-03-aop-proxying.html` | 3 | **Factual**, TOC leak |
| `spring/spring-04-transaction-management.html` | 4 | **Factual**, TOC leak |
| `spring/spring-05-spring-mvc-web-layer.html` | 2 + **§7.5 rebuilt** | **Factual**, TOC leak, **new content** |
| `spring/spring-06-spring-data-jpa-persistence.html` | 3 + **§4.6 added** | **Factual**, TOC leak, bold leak, **new section** |
| `spring/spring-07-spring-boot-auto-configuration.html` | 2 + **1 cell extended** | Heading level, TOC leak, **new content** |
| `spring/spring-08-spring-security.html` | 2 | Malformed QA block, TOC leak |
| `spring/spring-09-testing-production-troubleshooting.html` | 2 + **§2.5 extended + §5.8 added** | **Factual**, TOC leak, **new content**, **new section** |
| `spring/spring-10-webflux-project-reactor.html` | 3 | **Factual**, consistency, TOC leak |
| `spring/spring-11-spring-cloud-distributed-systems.html` | 7 + **1 pager added** | **Factual**, TOC leak, 2 malformed QA blocks, bold leak, **navigation** |
| `spring/spring-12-messaging-kafka-rabbitmq.html` | **NEW** | **New volume** — 4 chapters + scenario bank |
| `cheatsheets/spring/02-bean-lifecycle-scopes-di.html` | 1 | **Factual** |
| `cheatsheets/spring/05-spring-mvc-web-layer.html` | **1 added** | **New callout** |
| `cheatsheets/spring/06-spring-data-jpa-persistence.html` | **1 added** | **New section** |
| `cheatsheets/spring/09-testing-production-troubleshooting.html` | **1 added** + **§5 extended** | **New callout**, **new section** |
| `cheatsheets/spring/07-spring-boot-auto-configuration.html` | **1 cell extended** | **New content** |
| `cheatsheets/spring/04-transaction-management.html` | 1 | Markdown leak |
| `cheatsheets/spring/11-spring-cloud-distributed-systems.html` | 2 + **3 added** + **footer corrected** + **11 files whitespace-normalised** | **Factual**, **new sections**, **navigation**, encoding hygiene |
| `cheatsheets/spring/12-spring-messaging-kafka-rabbitmq.html` | **NEW** | **New cheatsheet** |
| `index.html` | **1 row added** | **Registration** |
| `interview-prep/check.js` | 3 counts + 1 comment | **Required** — the `--index` contract hardcodes the wall totals |

**12 volumes + 12 cheatsheets + index.html + check.js = 26 files edited across six passes.
8 new files created: 4 under `_review/`, plus the volume 12 / cheatsheet 12 pair.**

### New files created

| File | Shape |
| --- | --- |
| `spring/spring-12-messaging-kafka-rabbitmq.html` | Volume — 6 `data-filter-target` sections, 23 Q&A, 5 ASCII diagrams, 6 snippets, 5 tables, 13 callouts. Version-tagged spring-kafka / spring-amqp 4.1.1. |
| `cheatsheets/spring/12-spring-messaging-kafka-rabbitmq.html` | Cheatsheet — 6 sections + numbers, 9 captioned `table--decision`, 2 SVG figures, 3 snippets, 8 callouts, 8 number cards. Zero warnings. |

## Change-by-change

### `spring/spring-01-spring-core-ioc.html`

1. **Ch5 context-hierarchy diagram** — `AnnotationConfigReactiveWebServerApplicationContext`
   appeared twice as siblings, the second annotated "(Netty)". There is no second subclass by
   that name. Rewritten to state what Boot actually does: it selects a Netty or Reactor Netty
   *factory bean* at startup. The context class is the same either way.
2. **`@MockBean` (constructor-injection passage)** — left as-is deliberately. It is used as a
   contrast ("testable with no `@MockBean`"), not as a recommendation. Logged under
   *Unverified / needs human check* as a judgement call rather than silently changed.

### `spring/spring-02-bean-lifecycle-scopes-di.html` — the largest correction

3. **§1.3 prose rewritten.** Claimed `ApplicationContextAware` extends four other interfaces and
   that the container "makes four Aware calls when it makes the fifth". Both false.
   Verified against the Framework 6.x source of `ApplicationContextAware` and
   `ApplicationContextAwareProcessor`: the interface extends only the `Aware` marker, and
   `invokeAwareInterfaces` tests each of the five context-level interfaces with an independent
   `instanceof`. Rewritten to explain the two dispatch paths — `invokeAwareMethods` (three
   interfaces, on the bean factory) and `ApplicationContextAwareProcessor` (five, a BPP) — and to
   state plainly that implementing `ApplicationContextAware` alone gets **one** call.
4. **§1.3 table corrected.** Every row said "Called for: Every bean", which is wrong — each fires
   only for beans implementing it. `BeanFactoryAware` was also absent from a table of Aware
   interfaces despite being one of the three `invokeAwareMethods` callbacks. Row added, all
   values corrected, and the `null`-classloader condition recorded.
5. **§1.3 `BeanClassLoaderAware` condition corrected.** The stated condition ("created as part of
   a bean factory's own internal operations for a `BeanClassLoaderAware`") described nothing real.
   The actual guard is `if (bcl != null)`.
6. **Q1 answer corrected** to the same truth.
7. **Snippet comment** `// unless overridden` → `// unless the loader is null`.

### `cheatsheets/spring/02-bean-lifecycle-scopes-di.html`

8. **Number card** "**4** — Aware calls made when only `ApplicationContextAware` is implemented"
   → "**1**", with the reason inline: it extends only the `Aware` marker, and each callback is
   tested independently. This card existed precisely so a candidate would memorise the wrong
   number under interview conditions.

### `spring/spring-03-aop-proxying.html`

9. **Sidebar TOC** — 54 raw backticks converted to `<code>`. First thing rendered on the page.
   (Converted in every volume; see the sidebar sweep below.)
10. **§2.1 proxy comparison table** — CGLIB "Requires: a non-final class with a visible
    constructor" and "Weakness: Constructor must be reachable" removed. Spring builds the proxy
    with Objenesis, which bypasses the constructor chain entirely; the page's own snippet four
    lines above already showed `new ObjenesisCglibAopProxy(config)`. Replaced with the real
    weaknesses (`final` classes/methods, introspection seeing the subclass).
11. **§2.1 flagship blockquote** — added the Spring Boot 2.0+ caveat. The stated rule is the
    *Framework* default; §2.5 of the same chapter documents that Boot sets
    `proxyTargetClass=true`, so a candidate reciting the blockquote verbatim in a Boot interview
    would be marked wrong.

### `spring/spring-04-transaction-management.html`

12. **Sidebar TOC** — 30 raw backticks converted.
13. **§3.3 `NESTED`** — added the missing first condition. `nestedTransactionAllowed` defaults to
    `false` on `AbstractPlatformTransactionManager`; `DataSourceTransactionManager` enables it in
    its constructor, **`JpaTransactionManager` does not**. The section already explained the JPA
    savepoint problem at length without ever naming the flag that gates it, and this is the most
    common `NESTED` interview miss — because every JDBC-flavoured example works without it.
14. **§6.1 self-invocation** — the example declared `private void applyPromotion` **and**
    self-invoked it, then blamed only self-invocation. Two independent defects. Method changed to
    `public` so the example isolates one cause, with a new paragraph stating that real code
    stacks both, and that naming only one is a half-answer.

### `cheatsheets/spring/04-transaction-management.html`

15. **Line 246** — a single `` `ThreadLocal` `` backtick leak in prose, surrounded by correct
    `<code>` on the same lines.

### `spring/spring-05-spring-mvc-web-layer.html`

16. **§3 `HiddenHttpMethodFilter`** — "Spring 5 deprecated it; Spring 6 removed it" is false in
    both halves. Verified: the class is present with no `@Deprecated` in Framework 6.x, and
    `WebMvcAutoConfiguration` on Boot 3.5.x still registers it via
    `@ConditionalOnBooleanProperty("spring.mvc.hiddenmethod.filter.enabled")` — with no
    `matchIfMissing`, so it defaults **off**. The page's own YAML block contradicted the sentence
    above it. Rewritten to state the class is alive, the default changed, and Boot contributes
    `OrderedHiddenHttpMethodFilter` so the override sits at a known chain position.

### `spring/spring-06-spring-data-jpa-persistence.html`

17. **Second-level cache section** — `javax.cache` corrected to `jakarta.cache`, with the
    Hibernate 5 vs Hibernate 6 distinction stated, since on Boot 3 the `javax` spelling will not
    resolve.

### `spring/spring-07-spring-boot-auto-configuration.html`

18. **§2.6 heading level** `h4` → `h3`. It was the only content heading in the volume at `h4`
    (54 sibling sections are `h3`), which also demoted it below its own `Common Mistakes` block.

### `spring/spring-09-testing-production-troubleshooting.html`

19. **§5.7 JFR** — removed "Spring Boot 3.3+ can also expose it over the management port".
    Fabricated: the built-in actuator endpoint list has no JFR operation in any Boot version.
    Replaced with the negative result, which is itself the useful interview fact, plus the three
    real options (`jcmd`, pull the `.jfr` off the host, or write your own endpoint over
    `FlightRecorderMXBean`).

### `spring/spring-10-webflux-project-reactor.html`

20. **§3.2 retry arithmetic** — "three layers each retrying twice is eight requests" corrected to
    `3³ = 27`. The adjacent callout already said 27×, and `cheat10` explains the 8-vs-27
    distinction explicitly, so the volume was contradicting its own cheat sheet.
21. **§8.3 `@WebFluxTest`** — `@MockBean` → `@MockitoBean` with a version comment. `spring-09`
    §2.5 devotes a full section to why `@MockBean` is deprecated on Boot 3.4+; this example taught
    the opposite from the same series.

### `spring/spring-11-spring-cloud-distributed-systems.html`

22. **Sidebar TOC** — 12 raw backticks converted.
23. **Q2 (Gateway)** and **T3 (Scenario Bank)** — malformed markup rebuilt. Both had `<code>` tags
    interleaved into the badge element:
    `` `Path=/api/orders/ <span class="qa__badge"><code> with </code>StripPrefix=2<code> — what arrives at the service?** </code>TRICKY` ``
    Rebuilt to the canonical `<span class="qa__badge"><code>TRICKY</code></span>` form, verified
    against 111 clean instances in the same file.
24. **Resilience4j snippet** — `wait-duration-in-open-state: 10s` → `60s`, labelled as the default.
25. Typo `destroyation-aware` → `destruction-aware` in the FactoryBean material.

### Sidebar TOC sweep — all 11 volumes

28. **310 raw backticks converted to `<code>` across every volume sidebar** (`spring-01` through
    `spring-11`, all on line 15). The TOCs were generated from the retired markdown pipeline and
    never converted. This was systemic: the first pass found 3 files, and a corrected
    multi-line-aware scan found the remaining 8, because the initial sweep masked `<pre>` blocks
    per *line* and so missed TOCs in files whose `<pre>` blocks span lines. The conversion was
    scoped to anchor text only, never inside `href="…"`; verified 0 remaining backticks outside
    `<pre>` in all 22 files.
29. **`spring-08` malformed Q&A block repaired** — the authorization chapter's Q1 had the same
    interleaved-badge malformation as the two in vol11: `` `anyRequest().permitAll()</code> above
    a `/admin/ <span class="qa__badge"><code> rule…** </code>TRICKY` ``.
30. **Two markdown bold leaks converted to `<strong>`** — `spring-06` (`<p>**P13. …**</p>`) and
    `spring-11` (`<li>…cost?** <code>STAFF</code></li>`, which also became a proper badge span).

### `cheatsheets/spring/11-spring-cloud-distributed-systems.html`

26. **Number card** "10s / 10 — `waitDurationInOpenState` and the half-open probe budget" →
    "60s / 10 … **default**".
27. **SVG edge label** "10s — a trial request" → "60s by default — a trial request".

### Earlier in this pass

28. `spring-01` Ch6 Q3 — the multicaster was described as using a `SimpleAsyncTaskExecutor` by
    default. It has **no** executor configured: `SimpleApplicationEventMulticaster` is synchronous,
    so listener latency is publisher latency. `SimpleAsyncTaskExecutor` is the trap in the *fix*
    people reach for, not the default. Rewritten.
29. `cheatsheets/spring-01` — the "Async failures vanish" callout and its number card reframed to
    match (28).
30. `spring-02` §5.2 — a `FactoryBean` / `@Bean` conflation corrected. `@Bean` registers a
    `ConfigurationClassBeanDefinition` with a `factoryMethodName`; it does **not** register a
    `FactoryBean`. The observable difference: only the `@Bean` case also exposes `&sqlClient`.

## Second pass — mined from the completed `deep-research` workflow

The background workflow (`wf_d560f97d-ec3`, 107 agents, ~58 min) finished after the first commit.
Its output was triaged claim-by-claim against the corpus rather than applied wholesale.

**Two claims the workflow marked "refuted" were both non-issues:**

1. *"`@Transactional.proxyTargetClass` defaults to `false`, so 'transactions always use CGLIB' is wrong."* — `@Transactional` has **no** `proxyTargetClass` attribute at all. The attribute list is `value`, `transactionManager`, `label`, `propagation`, `isolation`, `timeout`, `timeoutString`, `readOnly`, `rollbackFor`, `rollbackForClassName`, `noRollbackFor`, `noRollbackForClassName`. The corpus's §2.2 table lists these correctly and never makes the claim. Separately, the *container-level* `spring.aop.proxy-target-class` default (Boot 2.0+, `true`) is correct in vol03 §2.5.
2. *"`@MockitoBean` is Framework 6.2, not a Boot 3.2 feature."* — vol09 already says "Framework 6.2 / Boot 3.4". Correct as written.

**One real gap found and fixed:**

31. `spring-04` §2.4 "The Proxy Requirement, Enumerated" enumerated the visibility rules without
    stating the **Spring Framework 6.0 relaxation**: since 6.0, `protected` and package-private
    methods are advised by default on CGLIB class-based proxies, so "transactions only work on
    public methods" — the standard interview answer — is out of date. Added, with the two
    constraints that keep it from being a free pass (JDK proxies still require `public` +
    interface-declared; package-private must be visible to the generated proxy) and a note that
    self-invocation bypasses all of it because the rule is about proxy reachability, not modifiers.

**Recorded but not added** (Boot 4 baseline and the `@MockitoBean` `enforceOverride=false` trap)
— both verified, both High importance, both additions rather than corrections. Written into
`checklist.md` as an addendum so they are not lost, rather than half-written into a volume.

## Third pass — Spring Cache abstraction (added 2026-10-03, after user request)

Closes item 2 of *Unverified / needs human check* below, which had flagged the Spring Cache
abstraction as a genuine High-priority gap: `CacheManager` occurred **0 times site-wide** across
all 22 Spring pages. Added as a new **§4.6** in vol06 plus a matching cheat06 block — an addition,
not a rewrite, so no existing section was touched.

32. **`spring-06` §4.6 "The Spring Cache Abstraction — the Layer Above"** — new `h3` section, inserted
    between §4.5 and the chapter's `Common Mistakes` block so the volume keeps its
    `section → Common Mistakes → Interview Questions → Further Reading` triple intact. Contains:
    - **One-line framing** — the abstraction is not a cache; it is an AOP layer that decides
      *whether to call your method*, plus a `CacheManager` that supplies the storage.
    - **Annotation snippet** — `@Cacheable` / `@CachePut` / `@CacheEvict` with their distinguishing
      one-liners (`@CachePut` always runs then stores; `@CacheEvict` removes).
    - **A three-layer `pre.diagram`** — Spring Cache → persistence context (L1) → Hibernate L2 →
      database, which is the actual interview question: *how do these interact?* The answer is that
      they are three layers with three different invalidation models, and the diagram is what makes
      that legible without prose.
    - **Comparison table** (Layer / Scope / Invalidated by / Knows about JPA?) covering all three.
    - **Four callouts**, each a real interview trap:
      - `trap` — an unnamed `@Cacheable` throws `IllegalStateException`; a *misspelled* name throws
        `IllegalArgumentException`. Two different exceptions, and candidates routinely describe them
        as the same one.
      - `must` — cache a DTO, never a detached entity. A cached entity leaves the persistence
        context, so lazy associations throw `LazyInitializationException` on the next access.
      - `scale` — `ConcurrentMapCache` (the default) has no TTL, no size bound and is process-local.
      - `staff` — cache advice and transaction advice are **both** at `LOWEST_PRECEDENCE`, so their
        relative order is undefined. An eviction can therefore run before the commit, and a rollback
        leaves the cache holding an entry for a write that never landed. Fix:
        `TransactionAwareCacheManagerProxy`, which defers `put` to the after-commit phase.
33. **8 `Common Mistakes` bullets** appended to the chapter's existing list.
34. **4 new Q&A articles** (`4-the-n1-problem-9` … `-12`) — missing cache name, caching entities
    rather than DTOs, array arguments and key generation, and evict-vs-commit ordering.
35. **3 `Further Reading` links** — Framework cache abstraction reference, Boot caching reference,
    `@EnableCaching` javadoc.
36. **Sidebar TOC + masthead** — `<summary>8 sections` → `9 sections`, the §4.6 `<li>` inserted, and
    the masthead counters updated to `9 chapters | 126 questions | 20 diagrams`.
37. **`cheatsheets/spring/06-*`** — one decision table (which layer a question means, captioned per the
    `table--decision` contract), a `callout--trap` and a `callout--must`, added inside `ch4`. Both
    callout labels use the conventional `Interview trap — ` / `Must remember — ` prefixes. The
    cheatsheet TOC is chapter-level (8 anchors), so adding an `<h3>` inside `ch4` required no TOC
    change. Per the deduplication rule the block **links** to vol06 §4.6 for the full treatment and
    to Database Vol 9 for the stampede rather than restating either.

### Source discipline for this pass

Every claim was verified against **Framework 6.2.x source**, not the reference prose. This mattered:
the docs' own `@EnableCaching` example shows `cacheManager = "cacheManager"`, an attribute that does
not **exist** on `@EnableCaching` (`cacheManager` lives on `@CacheConfig` and on the operation
annotations). Three claims in the rendered documentation were falsified by source and corrected
rather than transcribed:

| Documentation claim | Verified truth (source) |
| --- | --- |
| `@EnableCaching(cacheManager = …)` | No such attribute. Only `proxyTargetClass` (default `false`), `mode` (default `PROXY`) and `order` (default `LOWEST_PRECEDENCE`). |
| `@Cacheable` attributes listed without `cacheManager` / `cacheResolver` | Both exist. Full set: `value`, `cacheNames`, `key`, `keyGenerator`, `cacheManager`, `cacheResolver`, `condition`, `unless`, `sync`. |
| Spring generates a cache name from class + method when none is given | It **throws**. `CacheAspectSupport.getCaches` raises `IllegalStateException("No cache could be resolved for … At least one cache should be provided per cache operation.")`. `CacheOperation.Builder.cacheNames` defaults to `Collections.emptySet()` and `SpringCacheAnnotationParser` never derives one. |

Also verified rather than assumed:

- `SimpleKeyGenerator.generateKey` — 0 args → `SimpleKey.EMPTY`; exactly one non-array arg → the
  argument itself; **anything else** (multiple args *or* a single array) → `new SimpleKey(params)`.
  The array case is the one that surprises people, so it became its own Q&A.
- `sync = true` restrictions, from the `Cacheable` javadoc: `unless` is unsupported, only one cache
  may be named, and no other cache operation may be combined. It is also documented as
  *"effectively a hint"* — provider-specific, so Redis and Caffeine behave differently.
- `@CacheEvict` has `allEntries` and `beforeInvocation` but **no** `unless` and **no** `sync`;
  `@CachePut` is `@Cacheable` minus `sync`.
- The default `CacheManager` is `ConcurrentMapCacheManager` over a `ConcurrentHashMap`; Boot's
  `CacheAutoConfiguration` → `SimpleCacheConfiguration` contributes exactly this when no provider
  bean exists, and Boot's own reference calls it *"not really recommended for production usage."*
- The advisor-ordering claim was traced end to end: `BeanFactoryCacheOperationSourceAdvisor` and
  `BeanFactoryTransactionAttributeSourceAdvisor` both extend `AbstractBeanFactoryPointcutAdvisor`,
  neither overrides `getOrder()`, and `AbstractPointcutAdvisor.getOrder()` returns
  `Ordered.LOWEST_PRECEDENCE`. `@EnableTransactionManagement.order()` defaults to the same value.
  Relative order is therefore genuinely undefined, which is what the `staff` callout says.

## Fourth pass — `RestClient`, `@MockitoBean.enforceOverride`, cheat11 sync (2026-10-04)

39. **`@MockitoBean`'s `enforceOverride` default** — vol09 §2.5 gained a paragraph, a 4-line
    snippet, a trap callout and Q&A `2-spring-boot-test-annotations-8`; cheat09 gained a matching
    trap callout. Closes item 8 of *Unverified*. Verified at source:
    `boolean enforceOverride() default false;`, mapping to `BeanOverrideStrategy.REPLACE_OR_CREATE`.
    The javadoc states the consequence twice — *"a mock will be created if a corresponding bean
    does not exist"* — so a typo'd field name, an unregistered bean or a `@ConditionalOnProperty`
    that did not fire all produce a **passing** test. Worth flagging because the migration narrative
    runs backwards here: `@MockBean` failed loudly in that situation, so the replacement is
    *quieter*, not stricter. Two adjacent restrictions from the same javadoc were added too — only
    **singleton** beans can be mocked, and under `@ContextHierarchy` every `@MockitoBean` applies to
    **all** levels unless `contextName` pins one (the javadoc marks this `WARNING`).
39. **`RestClient` added to vol05 §7.5**, which already owned outbound HTTP but compared only
    `RestTemplate` with `WebClient`. §7.5 is now a three-client comparison, with a snippet, a
    three-column table, a callout and a Q&A; cheat05 gained the matching one-liners.

### Claims the research falsified — corrected rather than written

The `RestClient` facts were gathered by a research agent against Framework 6.2.x source, and four
claims that would have been natural to write were **false**. All four are recorded because they are
the claims a candidate is most likely to have absorbed from blog posts:

| Claim that would have been written | Verified truth |
| --- | --- |
| "`RestClient` does not throw on 4xx/5xx by default" | **False — it does.** `RestClient.java`: *"By default, 4xx response code result in a `HttpClientErrorException` and 5xx response codes in a `HttpServerErrorException`."* The real difference is *mechanism and granularity*: `RestTemplate` has one global pluggable `ResponseErrorHandler`; `RestClient` has a **per-request** chain of `Predicate<HttpStatusCode>` → handler via `onStatus(...)`, with user handlers inserted **before** the defaults (`DefaultRestClient.java`: `// Default handlers always last`) and first-match-wins. |
| "`RestTemplate` is deprecated / in maintenance mode" | **False in 6.2.x.** Not `@Deprecated`; no such javadoc. The source says only *"As of 6.1, `RestClient` offers a more modern API"* and *"`RestClient` is the focus for new higher-level features."* See item 3 above. |
| "`RestClient` is reactive, or has async support" | **False.** The class javadoc says *"a fluent, synchronous API"*, and an exhaustive grep for `AsyncExchangeFunction` / `CompletableFuture` / `Mono` across `RestClient.java` and `DefaultRestClient.java` returns zero hits. The old `AsyncRestClient` is gone from 6.2.x entirely. The `exchange(...)` on `RestClient` is a **synchronous** callback, not an async exchange. |
| "`RestClientAdapter` lets you pass a `RestClient` where a `RestTemplate` is expected" | **False.** It lives in the `support` subpackage and adapts `RestClient` to `HttpExchangeAdapter` for `HttpServiceProxyFactory` / `@HttpInterface`. The RestTemplate→RestClient direction is `RestClient.create(RestTemplate)`, not an adapter. |

Verified and used:

- `RestClient` is `@since 6.1`.
- `RestClient.Builder` is **prototype-scoped** and auto-configured by Boot **3.2.0**
  (`RestClientAutoConfiguration`), pre-configured with `HttpMessageConverters` and a request factory.
  Boot's own wording: *"It is strongly advised to inject it in your components."* The prototype
  scope is the non-obvious part — each injection point gets a freshly cloned builder, so a
  component cannot rely on a shared mutated builder.
- Builders are **stateful**: *"Any change on the builder is reflected in all clients subsequently
  created with it"*, hence `builder.clone()`.
- `retrieve()` is **lazy** — *"this method does not actually execute the request until you call one
  of the returned `ResponseSpec`"*.
- `exchange()` applies **no** status handling by design: *"Status handlers are not applied when use
  `exchange()`, because the exchange function already provides access to the full response."*
- Infrastructure is **shared** with `RestTemplate` — same request factories, interceptors,
  initializers and message converters, so an interceptor written for one works on the other.

## Fifth pass — virtual threads (2026-10-04)

### What was added

| File | Change |
| --- | --- |
| `spring/spring-09` §5.8 | **New section**, "Virtual Threads — What Changes, and What Does Not": the mount/unmount lifecycle as an ASCII diagram, the JDK 21-vs-24 pinning table, what `spring.threads.virtual.enabled` does and does not switch on, the connection-pool argument, and the observability change. Plus 6 Common Mistakes bullets, Q&A `5-performance-and-memory-9` … `-12`, 3 Further Reading links, and the sidebar TOC (`10 sections` → `11 sections`). |
| `spring/spring-09` §5.4 | One clause added to the existing `scale` callout so the forward-reference resolves to §5.8 instead of leaving the topic dangling. |
| `cheatsheets/spring/09` §5 | **New "Virtual threads" block**: a `table--decision` of what the flag switches on, a version-conditional pinning table, the scheduler properties, and three trap callouts. Links to vol09 §5.8 rather than restating the mechanism. |
| `spring/spring-07` §2.3 + `cheatsheets/spring/07` | The `@ConditionalOnThreading(VIRTUAL)` row gained the fact that the condition matches only when the property **and** Java 21+ are both true. |

### Why vol09, not vol07

The topic was thin in both, but §5.4's Tomcat arithmetic and §5.5's HikariCP arithmetic are
exactly the argument virtual threads qualify, and the existing scale callout already forward-referenced
the topic. Placing it there completes a running argument rather than opening a new one.

### Claims the research falsified before they were written

This is the third pass in a row where source verification overturned the folklore. The claims below
are the ones a candidate is most likely to have memorised from blog posts, and **none** of them were
written into the corpus:

| Folklore claim | Verified truth | Source |
| --- | --- | --- |
| "`synchronized` pins a virtual thread" | **Version-conditional.** True on JDK 21–23; **false from JDK 24**, where JEP 491 made monitors independent of the carrier. | JEP 444; JEP 491 (Release 24) |
| "Use `ReentrantLock` instead of `synchronized` under virtual threads" | JEP 491 **explicitly retracts** this: *"such migration will no longer be necessary. You need not revert code."* Correct advice on 21–23, unnecessary on 24+. | JEP 491, Description |
| "Set `-Djdk.tracePinnedThreads=full` to find pinning" | **Removed** in JDK 24, not deprecated — *"setting it on the command line will have no effect."* Use the `jdk.VirtualThreadPinned` JFR event (retained, on by default, 20 ms threshold). | JEP 491 |
| "`@Async` needs a second property to use virtual threads" | **False.** With the flag set, `applicationTaskExecutor` is already a virtual-thread `SimpleAsyncTaskExecutor`. `OnExecutorCondition` has two triggers and `spring.task.execution.thread-name-prefix` is in neither. | `TaskExecutorConfigurations.java` (3.5.x) |
| "`jcmd Thread.dump` shows virtual threads" | Wrong command. It is `jcmd <pid> Thread.dump_to_file -format=json <file>`. `jstack` and `Thread.print` show **no** virtual threads at all. | JEP 444 |
| Virtual threads work on any embedded server | **Tomcat and Jetty only.** No `UndertowVirtualThreadsWebServerFactoryCustomizer` exists in any Boot version, including 3.2.x where the feature was introduced. | `TomcatVirtualThreadsWebServerFactoryCustomizer`, `JettyVirtualThreadsWebServerFactoryCustomizer` (3.5.x) |
| Pinning causes reentrancy failure | The failure mode is **starvation**: *"The scheduler does not compensate for pinning by expanding its parallelism."* `maxPoolSize` (default 256) can rescue non-pinning blocking, never pinning. | JEP 444, Motivation |
| Virtual threads make requests faster | *"They exist to provide scale (higher throughput), not speed (lower latency)."* | JEP 444 |

The last one shaped the section's central claim. §5.4 previously said virtual threads *"change
this arithmetic entirely"*, which is the tidier and less accurate version. The section now argues
what the JEPs support: virtual threads **relocate** the bottleneck from the request queue to the
connection pool, which is why §5.5's arithmetic still governs. JEP 444's own warning against
pooling virtual threads to limit concurrency is quoted for the same reason.

## Sixth pass — messaging, Kafka & RabbitMQ (2026-10-04)

This pass is **file creation rather than targeted edit**, and that was the one decision I escalated
rather than took. Messaging was flagged as unowned across all 11 volumes; the user's *"complete the
open items"* was the decision I was waiting on, so the volume was created.

### What was added

| File | Change |
| --- | --- |
| `spring/spring-12-messaging-kafka-rabbitmq.html` | **New volume**, 4 chapters + scenario bank, 23 questions, 5 ASCII diagrams, 6 snippets, 5 tables, 13 callouts. Ch.1 the two models; Ch.2 spring-kafka; Ch.3 spring-amqp; Ch.4 choosing and operating; then 3 production narratives. |
| `cheatsheets/spring/12-spring-messaging-kafka-rabbitmq.html` | **New cheatsheet**, 6 sections + numbers, 9 `table--decision`, 2 SVG figures, 8 callouts, 8 number cards. |
| `index.html` | Volume 12 registered in the Spring wall. |
| `spring/spring-11` | Forward `pager__next` added to both pagers, so the chain is walkable from 11 to 12. |
| `cheatsheets/spring/11` | Footer pager gained the volume-12 link; `Volume 11 of 11` corrected to `of 12`. |
| `check.js` | Index counts 35/34/35 → **36/35/36** (the only shared-asset change, and unavoidable: the index contract hardcodes them). |

### Deduplication, deliberately

Volume 11 owns the outbox (§7), saga compensation (§6) and consumer idempotency (§7). This volume
**links** to those rather than restating them — §2.5 and §4.4 cover the transactional gap from the
broker-API side and then point at vol11. Per the authoring contract, that is the rule, and the
cheatsheet's keyfacts entry 5 does the same.

### The research falsified my own premise

I asked the research agent to verify messaging "on spring-kafka / spring-amqp 3.3.x / 3.4.x". The
agent's opening line was that the premise was wrong:

> *"Your premise 'current is 3.3.x/3.4.x' is WRONG. The current GA for both projects is 4.1.1…
> This matters: major API changes landed in 4.0 that invalidate several commonly-repeated interview
> answers."*

That is the fourth consecutive pass where verification overturned what I would otherwise have
written uncritically (RestClient 4, virtual threads 7, messaging 18). Both new files are tagged
**4.1.1 / Boot 4.1.1** and §2 opens by saying so, because the version is load-bearing here in a way
it is not in most volumes.

### Claims the research falsified before they were written

| Folklore claim | Verified truth | Source |
| --- | --- | --- |
| `@KafkaListener.idIsGroup` defaults to `false` | **Defaults to `true`.** The source is `boolean idIsGroup() default true;`. Its javadoc ends *"@return false to disable"*, which reads as the opposite — and is where the folk answer comes from. | `KafkaListener.java` |
| Kafka's default ack mode is `RECORD` | **`BATCH`** — `private AckMode ackMode = AckMode.BATCH;`. Spring Boot does not change it: `spring.kafka.listener.ack-mode` has no default in its metadata. | `ContainerProperties.java`; Boot config metadata |
| There are four `AckMode` values | **Seven**: RECORD, BATCH, TIME, COUNT, COUNT_TIME, MANUAL, MANUAL_IMMEDIATE. | `ContainerProperties.AckMode` |
| Default backoff is a sensible exponential | **9 retries, no delay.** Not a policy anyone wrote. | `DefaultErrorHandler` |
| Unmatched exception types are fatal | Classified **retryable** — the classifier defaults to `true`, so an unexpected NPE gets nine attempts. | `ExceptionClassifier` |
| The fatal list contains Kafka's `SerializationException` | It contains **Spring's** `DeserializationException`, in `org.springframework.kafka.support.serializer` — a different class in a different package. | `DefaultErrorHandler` |
| You configure a producer-side error handler | **No such API.** Verified absent from `DefaultKafkaProducerFactory`, `ProducerFactory` and `KafkaTemplate` in 4.1.1. Failure arrives on the `CompletableFuture`, or via a `ProducerListener`. | `DefaultKafkaProducerFactory.java`; `KafkaTemplate.java` |
| `KafkaTemplate.send()` returns `ListenableFuture` | Returns **`CompletableFuture` since 3.0**; `ListenableFuture` through 2.9.x. | spring-kafka 3.0 release notes |
| Keys/values are `StringSerializer` by default | A **Boot** convention, not a spring-kafka one — `DefaultKafkaProducerFactory` has nullable serializers. That attribution matters: it explains why a Boot POJO send fails with a class-name error. | `DefaultKafkaProducerFactory.java` |
| Mark exceptions with a `RetriableException` interface | **Does not exist.** Replaced by `ExceptionMatcher`; the vocabulary inverted — you configure what is *not* retryable. | spring-kafka error handling docs |
| `SeekToCurrentErrorHandler` is current | **Removed in 3.0**, replaced by `DefaultErrorHandler`. | 3.0 migration notes |
| A transaction manager and an error handler coexist | **No error handler is installed at all** when a `transactionManager` is present — so retry and DLT policy silently stops applying. | spring-kafka docs |
| RabbitMQ has `MANUAL_IMMEDIATE` | It has **exactly three** values — NONE, MANUAL, AUTO — unchanged since 2.3.0. `MANUAL_IMMEDIATE` is a spring-kafka concept, and carrying it across is the most common cross-contamination between the two APIs. | `SimpleMessageListenerContainer.AcknowledgeMode` |
| `defaultRequeueRejected` default is `false` | **`true`** — so a listener that throws causes an immediate, unbounded redelivery loop with no delay and no attempt limit. | Boot metadata; `SimpleMessageListenerContainer` |
| `SimpleMessageConverter` is JSON-ish | It handles String, byte[] **and `Serializable`** — so most DTOs get **Java serialization silently**, at both ends. | `SimpleMessageConverter.java` |
| A queue DLX and `RepublishMessageRecoverer` are two layers | They are **one path, chosen by the recoverer.** With the republish recoverer, *"the message is ack'd and is not sent to the dead letter exchange by the broker"* — the broker DLX is silently inert. | spring-amqp container docs |

### One premise the research itself corrected mid-report

The agent also corrected a figure I had assumed for the exactly-once caveat, and the correction is
what made the section worth writing. The official qualifier is that EOS guarantees *the sequence*
completes exactly once — **"the read and process have at least once semantics."** That parenthetical
is now the quoted centrepiece of §2.5, because it is precisely the thing a candidate who has only
read the marketing gets wrong. Related: the docs state that when the second commit fails after the
primary has committed, the application *"should take remedial action, if necessary, to compensate
for the committed primary transaction"* — which is the documented admission that the cross-system
atomicity nobody claims actually exists.

### What I deliberately did not write

The research marked exactly one item **UNVERIFIED** and safety rule 5 applies: whether
`isolation.level=read_committed` is a Spring-managed setting. It is **not** in the corpus. That
setting is a Kafka consumer config property, and describing it as Spring-managed would be an
unverifiable claim — it is listed below instead.

## Verification

All Spring pages re-checked after every edit batch, plus the site index. Current state:

```
12 volumes      → PASS - no errors, exit 0
12 cheatsheets  → PASS - no errors, exit 0
 index.html     → PASS - no errors, exit 0
```

**New files, fully clean.** `spring-12` passes `--volume` with no warnings at all. `cheat12` passes
`--cheatsheet` with no warnings at all — unusual, since the 11 siblings run ~559 advisory warnings
between them. Six defects were found and fixed during authoring rather than accepted:

- three wrong `Series` sidebar links (I had guessed `02-bean-lifecycle-context`,
  `03-transaction-management`, `04-spring-aop`; the real filenames are
  `02-bean-lifecycle-scopes-di`, `04-transaction-management`, `03-aop-proxying`);
- three snippets missing `data-title`, which is a hard error not a warning;
- a `callout--scale` label not following the house `Scaling reality check — <claim>` form;
- a 5-word `data-title` where the checker wants 3–4;
- a snippet line at 89 columns (the count included the `&lt;&gt;` escapes; wrapped anyway);
- the two `callout--tradeoff` / `callout--scale` mix warnings, resolved by writing callouts the
  content actually warranted rather than by adding filler.

`figure count 0 outside 2-4` was also fixed on merit: all 11 siblings carry 2–4 SVG figures and
mine had none. The two added are the consumer-group/partition assignment picture and the
Kafka-vs-RabbitMQ failure-path contrast — the two things a candidate most often draws wrong.

**Whitespace normalisation, all 11 existing cheatsheets.** A direct scan found exactly 2
trailing-whitespace lines in each of the 11 pre-existing cheatsheets (22 total) — the blank line
inside the sidebar `Series` list. Confirmed pre-existing by `git stash` diff against HEAD, not a
regression from this pass, but it violates the stated no-trailing-whitespace rule and was fixed in
a whitespace-only edit that touches no other byte. The new `cheat12` has none.

Encoding invariants re-verified by direct scan across all **24** Spring pages:

```
diagTagged (pre.diagram carrying data-lang)   0
CR characters                                0
tab characters                               0
trailing-whitespace lines                    0
emoji outside <pre>                          0 files
```

**One shared asset was modified**, which needs stating plainly: `check.js`. The `--index` contract
hardcodes `35` volume links, `34` cheatsheet links and `35` `data-filter-target` rows, so adding a
volume fails the index check until they become `36` / `35` / `36`. This was unavoidable, and the
alternative — leaving `check.js --index` failing — would have been worse. The stale explanatory
comment above those lines ("Adding a cheatsheet for it makes both 35") was updated in the same edit.
`site.css`, `search.js`, `highlight.js` and `toc.js` are untouched.

Cheatsheet warnings were diffed against the pre-edit baseline (`git stash` → capture → restore):
the only delta is `cheat09`'s callout count moving 20 → 23, which trips the advisory
`callout count 23 is above the 12-20 composition guide`. No new warning class was introduced. Two
warnings that *were* mine on first write — an uncaptioned table and a trap callout missing the
`Interview trap` prefix — were fixed rather than accepted.

## Coverage summary

| Checklist area | Before | After |
| --- | --- | --- |
| Verified-correct technical claims | 9 spot-checks | 20 |
| Factual errors found and fixed | — | 12 |
| Rendered-broken markdown defects fixed | — | 10 (310 backticks, 3 malformed QA blocks, 2 bold leaks, 1 prose leak) |
| Heading/structural inconsistencies fixed | — | 3 |
| Volumes PASS `check.js --volume` | 11 | 11 |
| Cheatsheets PASS `check.js --cheatsheet` | 11 | 11 |
| Markdown leaks outside `<pre>` | 316 backticks + 2 bold, all 22 files | **0** |
| High-priority topics closed | 1 (Spring Cache) | 5 (Spring Cache, RestClient, `enforceOverride`, cheat11 ch.1/7/8, virtual threads) |

### By version

| Claim class | Verified against |
| --- | --- |
| `ApplicationContextAware`, `invokeAwareMethods` | Spring Framework 6.x javadoc + source |
| CGLIB / Objenesis proxying | Framework AOP proxying reference |
| `HiddenHttpMethodFilter` status + Boot default | `HiddenHttpMethodFilter` source, `WebMvcAutoConfiguration` (3.5.x) |
| Actuator endpoint set (JFR) | Boot actuator endpoints reference |
| `nestedTransactionAllowed` default | `AbstractPlatformTransactionManager` / `JpaTransactionManager` javadoc, `DataSourceTransactionManager` source |
| Resilience4j `waitDurationInOpenState` | Resilience4j CircuitBreaker docs |
| `@MockBean` deprecation | Boot 3.4 release notes (carried over from the inventory pass) |
| `@EnableCaching` attributes, `@Cacheable`/`@CachePut`/`@CacheEvict` attribute sets | Framework 6.2.x **source** — `EnableCaching.java`, `Cacheable.java`, `CachePut.java`, `CacheEvict.java` |
| Unnamed-cache and misspelled-cache exceptions | `CacheAspectSupport.getCaches`, `AbstractCacheResolver.resolveCaches` source |
| Key generation incl. the array case | `SimpleKeyGenerator.generateKey` source |
| `sync = true` restrictions | `Cacheable` javadoc source |
| Default `CacheManager`; Boot's SIMPLE provider | `ConcurrentMapCacheManager`, `SimpleCacheConfiguration` (Boot 3.5.x), Boot caching reference |
| Cache-advice vs transaction-advice ordering | `BeanFactoryCacheOperationSourceAdvisor`, `BeanFactoryTransactionAttributeSourceAdvisor`, `AbstractBeanFactoryPointcutAdvisor`, `AbstractPointcutAdvisor`, `ProxyCachingConfiguration` source |
| `enforceOverride` default + singleton-only + `@ContextHierarchy` warning | `MockitoBean.java` (6.2.x) source; `BeanOverrideStrategy` enum |
| `RestClient` `@since`, sync-only, default-throws, `onStatus` ordering, lazy `retrieve()`, `exchange()` bypass | `RestClient.java`, `DefaultRestClient.java`, `StatusHandler.java`, `RestTemplate.java` (6.2.x) source; `rest-clients.adoc` |
| Boot prototype-scoped `RestClient.Builder`, stateful builder | `RestClientAutoConfiguration` (3.5.x), Boot `io/rest-client.adoc` |
| Virtual-thread pinning in JDK 21–23 vs 24+; `jdk.tracePinnedThreads` removal; lock-migration retraction | [JEP 444](https://openjdk.org/jeps/444) (Release 21), [JEP 491](https://openjdk.org/jeps/491) (Release 24) |
| Carrier-pool parallelism = core count; no compensation for pinning; `maxPoolSize` default 256; "scale not speed" | JEP 444 |
| `Thread.dump_to_file -format=json`; `jstack`/`Thread.print` omit virtual threads; disjoint carrier stacks; `jdk.VirtualThreadPinned` 20 ms | JEP 444 |
| `spring.threads.virtual.enabled` requires Java 21+; `@Async` follows by default; `Executor`-bean back-off | `Threading.java`, `TaskExecutorConfigurations.java` (Boot 3.5.x); Boot `task-execution-and-scheduling.adoc` |
| Tomcat/Jetty virtual-thread support; no Undertow path | `TomcatVirtualThreadsWebServerFactoryCustomizer`, `JettyVirtualThreadsWebServerFactoryCustomizer` (Boot 3.5.x); full-tree file listing |
| Do not pool virtual threads to limit concurrency — use semaphores | JEP 444 |

## Seventh pass — logging, `@Scheduled`, OpenTelemetry (2026-10-04)

Three Medium-rated gaps from the original checklist, closed together. Unlike the sixth pass this
was **purely additive** — see "Nothing to purge" below for why.

### What was added

| File | Section added | Core of it |
| --- | --- | --- |
| `spring/spring-07-spring-boot-auto-configuration.html` | **§7.7 Structured Logs — and the Thing You Actually Ship** | The two `logging.structured.format.*` properties and their three format names; **no default**; Logback *and* Log4j2 both supported; the log groups (`web`, `sql`) and the `logging.group.*` property name; why correlation IDs come from Micrometer Tracing, not a logging property; MDC → JSON fields. 5 Common Mistakes bullets, 3 new Q&A (Q10–12), 1 Further Reading link. |
| `spring/spring-09-testing-production-troubleshooting.html` | **§5.9 Scheduling — the Single-Threaded Pool Nobody Sized** | `pool.size=1` co-tenancy failure; the six `@Scheduled` attribute defaults; the milliseconds trap; the **documented `fixedRate` overrun gap**; the virtual-threads `fixedDelay` trap quoted from the javadoc; `scheduling-` vs `task-`; both routes to a single-threaded scheduler; the opt-in `tasks.scheduled.execution` observation. 7 Common Mistakes bullets, 3 new Q&A (Q13–15), 1 Further Reading link. |
| `spring/spring-11-spring-cloud-distributed-systems.html` | **§5.3** (annotation subsection) + **§5.4** (dependency table) | `@Observed` is Micrometer, not Spring; its three attributes; the `ObservedAspect` and the property that gates it; the two OpenTelemetry dependency sets and the Boot 4.2 removal. 3 Common Mistakes bullets, 3 new Q&A (Q9, Q10, Q12 — renumbering Q8→Q11), 2 Further Reading links. |
| `cheatsheets/spring/07-…` | `## Structured logging` inside the Actuator section | Format table, snippet, 2 callouts, 1 number card. |
| `cheatsheets/spring/09-…` | `### Scheduling` inside Pools/memory/triage | Attribute-defaults table, properties snippet, 3 callouts, 1 number card. |
| `cheatsheets/spring/11-…` | `### Instrumenting it` inside Tracing | Dependency-set table, 2 callouts, 1 number card. |

Masthead counts updated in all three volumes to match the new question and diagram totals
(vol07 108→111 questions / 21→22 diagrams; vol09 102→111 / 14→15; vol11 114→117).

### The falsifications

Every one of these was in my head before this pass and was **wrong**. The table is the reason the
pass was worth doing.

| What I would have written | Verified truth | Source |
| --- | --- | --- |
| `@Observed` is a Spring Framework annotation | It does **not exist in Spring Framework**. It is `io.micrometer.observation.annotation.Observed`, `@since 1.10.0` of Micrometer Observation. `org/springframework/stereotype/` contains exactly `Component`, `Controller`, `Indexed`, `Repository`, `Service`, `package-info` | jar inspection + `ObservationAutoConfigurationTests` |
| Boot auto-configures the `ObservedAspect` by default, so `@Observed` just works | **The reference page is wrong.** `ObservationAutoConfiguration.ObservedAspectConfiguration` carries `@ConditionalOnBooleanProperty("management.observations.annotations.enabled")` with **no** `matchIfMissing`, and `matchIfMissing()` defaults to `false` — so the bean does not exist unless the property is explicitly `true`. Boot's own test sets it in the shared context runner | `ObservationAutoConfiguration.java` (3.5.x **and** `main`), `ConditionalOnBooleanProperty.java` |
| Structured logging is Logback-only | Boot ships `StructuredLogEncoder` (Logback) **and** `StructuredLogLayout` (Log4j2), both driven by the same two properties | [Structured logging reference](https://docs.spring.io/spring-boot/reference/features/logging.html#features.logging.structured) |
| Upgrading to Boot 3.4 makes logs JSON | **No default format.** Set neither `logging.structured.format.*` property and the output is the 3.3 plain-text pattern | same |
| `logging.logback.group.*` is the property | The property is `logging.group.*`; there is no `logging.logback.group` property. Predefined groups are exactly `web` and `sql` | same |
| `spring.mvc.log` / `spring.web.log` control request logging | **Neither property exists in any Boot version.** Correlation IDs come from Micrometer Tracing; `logging.pattern.correlation` only renders the result | grepped the reference; property-metadata sweep |
| `logging.group.sql` gives you jOOQ SQL | It covers `org.springframework.jdbc.core`, `org.hibernate.SQL`, `org.jooq.tools.LoggerListener` — `LoggerListener` is a different logger, not jOOQ's SQL logger | same |
| `spring.task.scheduling.thread-name-prefix` defaults to `task-` | It defaults to **`scheduling-`**; `task-` is `spring.task.execution.thread-name-prefix` | Boot reference |
| `@Scheduled` has no `timeUnit`, or defaults to seconds | `timeUnit` defaults to **`MILLISECONDS`**. `fixedRate = 5` is every 5 ms | `@Scheduled` javadoc, Framework 6.2 |
| Virtual threads make scheduled tasks parallel | `SimpleAsyncTaskScheduler` "will ignore any pooling related properties" — and the javadoc says fixed-delay tasks still "operate on a single scheduler thread" | `@Scheduled` javadoc, Framework 6.2 |
| Default trace sampling is 100%, or tracing is off unless enabled | **`management.tracing.sampling.probability` defaults to `0.10`** in Boot 3.x and 4.x. `TracingProperties.Sampling.probability` is initialised to `0.10f` | `TracingProperties.java` |
| `@KafkaListener`-style OTel bridge guidance is current | The Zipkin route (`spring-boot-micrometer-tracing-opentelemetry` + `micrometer-tracing-bridge-otel` + `spring-boot-zipkin` + `opentelemetry-exporter-zipkin`) is **deprecated, removal in Boot 4.2**. `spring-boot-starter-opentelemetry` is the forward path | [Tracing reference](https://docs.spring.io/spring-boot/reference/actuator/tracing.html) |

### A documentation gap, documented rather than filled

The Framework 6.2 `@Scheduled` javadoc explicitly says that co-located `@Scheduled` declarations
"may overlap and execute multiple times in parallel or in immediate succession" — but it is
**silent on single-task `fixedRate` overrun**. The folklore answer ("it runs concurrently with
itself") is asserted far more confidently than it is documented.

Both vol09 §5.9 and cheat09 state the documented part, then say plainly that the single-task case
is undocumented. Filling a gap from memory is exactly what safety rule 4 forbids.

### Nothing to purge

Grepped the whole Spring corpus before writing any of it:

```
@Observed                = 0 occurrences
jdbc.queries             = 0 occurrences
management.tracing       = 0 occurrences
logging.structured       = 0 occurrences
```

So all three topics are purely additive — there was no folklore to correct and no contradiction to
leave behind. (I also confirmed there is **no** `jdbc.queries` observation in `spring-jdbc` — zero
observation classes in the jar; Boot gives you `jdbc.connections.*` pool gauges instead. Since the
corpus never claimed it, nothing needed removing.)

### Verification

- **24 checks**: `check.js --volume` on all 12 volumes, `--cheatsheet` on all 12 cheatsheets, plus
  `--index`. All exit 0.
- **Encoding invariants across all 24 Spring pages**: CR = 0, TAB = 0, trailing whitespace = 0,
  emoji outside `<pre>` = 0, `pre.diagram` carrying `data-lang` = 0.
- Three defects found and fixed during the pass:
  1. The vol07 Further Reading `<li>` was inserted **before** the `<h4>`/`<ul>` instead of inside
     the list. The checker does not catch this; caught by reading the emitted HTML back.
  2. A scripted splice silently dropped one of the three new vol11 Q&A blocks. Caught by the
     question count not moving by the expected amount; re-added as Q12.
  3. Two trailing-whitespace lines from the number-card insertions in cheat07 and cheat11.
- **`check.js` was NOT modified this pass.** Counts are unchanged because no file was created.

### Unverified / needs human check (new)

10. ~~**Single-task `fixedRate` overrun behaviour under Spring's scheduler is undocumented.**~~
    **CLOSED 2026-10-04 — resolved from Framework 6.2 source, and the folklore answer is wrong in
    both halves.** The documentation genuinely does run out here: neither the `@Scheduled` javadoc
    nor the reference page says what happens when a task overruns its period. The source does:

    - `ReschedulingRunnable.run()` calls `super.run()` (the task) and **only afterwards**
      computes the next execution and calls `schedule()` again. A task therefore **cannot overlap
      itself** — the common claim that a `fixedRate` task runs concurrently with its own previous
      run is false by construction.
    - `PeriodicTrigger.nextExecution` returns `lastExecution.plus(period)` when `fixedRate` is
      true and `lastCompletion.plus(period)` when it is false. So an overrun pushes the next
      execution instant **into the past**, the computed delay goes **negative**, and
      `ScheduledThreadPoolExecutor` documents: *"If the specified delay is less than or equal to
      zero, the command is not delayed but is executed immediately."*

    Net behaviour: **immediate catch-up** — the next run fires the instant the previous one returns,
    and keeps firing back-to-back until the deficit is repaid. The second half of the folklore
    ("it just falls behind") is also wrong. `fixedDelay` never accumulates the debt, because it
    measures from completion.

    Written into vol09 §5.9 as a new diagram plus a trap callout, Q16 (STAFF) and a Common
    Mistake; the cheat09 trap callout was rewritten to the verified answer and given a number card.
    Also useful as an interview framing: **the failure mode is load, not correctness** — a 5-second
    period with a 14-second runtime runs permanently saturated at ~3x the requested work, so the
    instance burns CPU before anything alerts.

    **Follow-up worth a human eye** (not written, no claim made): the exact behaviour when the
    task throws. `ReschedulingRunnable` reschedules after `super.run()`, and
    `ScheduledThreadPoolExecutor` suppresses subsequent executions of a repeating task that threw
    — so whether a failed `fixedRate` task keeps firing depends on which layer reschedules. That
    needs a read of the whole 6.2 `ReschedulingRunnable` plus a test, and the corpus makes no claim
    about it.
11. **Boot's metrics reference page contradicts Boot's own source** on whether `ObservedAspect` is
    auto-configured. **No edit needed — this is a documentation issue, not a content gap, and the
    corpus is already correct.** Recorded as CLOSED with the disagreement left standing on purpose.

    The reference page says *"By default, Spring Boot will auto-configure an `ObservedAspect` to
    enable `@Observed` support."* The source says otherwise: `ObservationAutoConfiguration`'s
    `ObservedAspectConfiguration` carries `@ConditionalOnBooleanProperty("management.observations.annotations.enabled")`
    **without** `matchIfMissing`, and `ConditionalOnBooleanProperty.matchIfMissing()` **defaults to
    `false`** — verified in both `3.5.x` and `main`. Boot's own
    `ObservationAutoConfigurationTests` sets the property explicitly in its shared context runner,
    which is the giveaway. So the bean does not exist unless you ask for it.

    vol11 §5.3 and cheat11 both state the source behaviour, and the trap callout names the
    documentation contradiction explicitly rather than hiding it — which is the better answer in an
    interview anyway. If Spring later corrects the page, nothing here needs to change; if the
    intended behaviour really is on-by-default, §5.3 and cheat11 need a one-line edit each.

    **Worth raising upstream.** This is the third time in this corpus that a Spring reference page's
    prose has been contradicted by its own code (after the `HiddenHttpMethodFilter` default in
    `gap-report.md` #6 and the `@MockBean` deprecation framing).

## Unverified / needs human check

1. ~~**Virtual threads are thin**~~ — **CLOSED 2026-10-04.** Added as vol09 §5.8 with a matching
   cheat09 block, covering the mechanism, version-conditional pinning, what Boot switches on, and
   why the connection pool becomes the limit. See the fifth pass above.

   **One adjacent claim the research did not verify, deliberately not written:** whether
   `SecurityContextHolder`'s `ThreadLocal` strategy needs changing under virtual threads, and
   whether `InheritableThreadLocal` / `RequestContextHolder` behave differently. This is a real
   senior-level question and it is **not** in the corpus. Left out rather than filled from memory.
   **Recommend a human check of Spring Security's `VirtualThreadSecurityContextHolderStrategy`
   before writing it.**
2. ~~**Spring Cache abstraction is absent**~~ — **CLOSED 2026-10-03.** Added as vol06 §4.6 with a
   matching cheat06 block; see the third pass above. `CacheManager` now appears throughout §4.6.
3. **`RestClient` was absent from vol05 §7.5**, which owns outbound HTTP, and from `cheat05`
   entirely. **CLOSED 2026-10-04** — §7.5 is now a three-client comparison. See the fourth pass
   above.

   **Correction to this entry's own original wording.** It previously said *"`RestTemplate` entered
   maintenance mode in Framework 6.1."* That phrasing is **not in the Framework source** and has
   been removed. Grepping `RestTemplate.java`, `RestClient.java` and `DefaultRestClient.java` in
   6.2.x for `maintenance`, `freeze` and `deprecat` returns one hit, a single protected
   `doExecute` overload. `RestTemplate` is **not** `@Deprecated` and carries no class-level
   deprecation javadoc. What the source actually says:

   > "As of 6.1, `RestClient` offers a more modern API for synchronous HTTP access."
   > "`RestClient` is the focus for new higher-level features."

   That is a *softer* deprecation — pointed at as legacy and explicitly not the focus for new
   features, without the `@Deprecated` annotation. The distinction matters for an interview answer,
   because "maintenance mode" and "deprecated" are different statements and only the second one
   would be checkable.
4. ~~**Messaging has no home.**~~ — **CLOSED 2026-10-04.** Created `spring/spring-12` and
   `cheatsheets/spring/12`, registered both in `index.html`. `KafkaTemplate`, `@KafkaListener` and
   `@RabbitListener` now have a home. See the sixth pass above.
5. **Cheatsheet sync gaps** — **CLOSED 2026-10-03/04.** All of the reported gaps were closed:
   cheat07 gained §1.5 (scan-root trap), §2.5 (condition report) and §3.5 (building your own
   starter); cheat08 gained the attack-surface table, `AuthorizationManager`, the
   authorization-server split and session fixation; cheat11 gained chapters 1, 7 and 8.

   **Correction to this entry's own earlier claim.** It previously said these topics were "missing"
   from the cheatsheets, inferred from a keyword scan. Reading the actual files showed cheat07
   already carried the scan-root trap, §2.5 the condition report, and cheat08 mass assignment —
   all present under different wording. The keyword scan produced **false positives**, and I
   recorded the correction rather than quietly "fixing" gaps that did not exist.
6. **Boot 4 / Framework 7 absent.** **CLOSED 2026-10-04** — added as vol09 §2.8 with a matching
   cheat09 block. Framework 7 requires **Java 17+**, not 21+. `@MockBean`/`@SpyBean` are *removed*
   in Boot 4 (not merely deprecated), and `@SpringBootTest` no longer supplies
   `MockMvc`/`WebClient`/`TestRestTemplate` — which breaks every Boot 4 test relying on the old
   default.
7. ~~**Messaging: `isolation.level=read_committed` as a Spring-managed setting.**~~ **CLOSED
   2026-10-04 — the question as posed was wrong, and the real answer is better than the flag.**
   Safety rule 5 held: nothing was written until it was verified from source. Then it turned out
   the framing "is it a Spring-managed setting?" has the wrong answer in **both** directions.

   Evidence: all 354 `spring-kafka/src/main/java/**/*.java` files in the 4.1.1 tree were scanned
   for `[Ii]solationLevel|isolation.level`. **Exactly two hits**, and neither is a setter:

   - `ConsumerProperties.java` line 449 — a **javadoc comment** on `setFixTxOffsets`:
     *"the lag will only be corrected if the consumer is configured with
     `isolation.level=read_committed` and `max.poll.records` is greater than 1."*
   - `KafkaTransactionManager.java` lines 143–144 — an explicit **rejection**:
     `throw new InvalidIsolationLevelException("Apache Kafka does not support an isolation level concept")`

   There is **no** `isolationLevel` on `ConsumerFactory`, on `DefaultKafkaConsumerFactory`, or on
   `ContainerProperties`, and **no** `@KafkaListener` attribute for it. So the research agent's
   framing was right that it is not a spring-kafka *API* — but the follow-on assumption that it is
   therefore unmanaged was wrong. **Boot does expose it**, as a property:
   `spring.kafka.consumer.isolation-level`, bound to `KafkaProperties.Consumer.isolationLevel`
   (an enum of `READ_UNCOMMITTED` / `READ_COMMITTED`), **defaulting to `READ_UNCOMMITTED`**, and
   mapped straight into `ConsumerConfig.ISOLATION_LEVEL_CONFIG`. Verified in **both** the `3.5.x`
   branch (`spring-boot-project/spring-boot-autoconfigure`) and `4.0.x`
   (`module/spring-boot-kafka`) — identical default and mapping, no change between them.

   What went into the corpus, as a new `<h4>` in vol12 §2.5 plus a cheat12 trap callout and number
   card:

   - the property name, the two enum values, and the `read_uncommitted` **default**;
   - that `read_uncommitted` means the consumer reads **aborted transactional records**, so enabling
     EOS on the producer and leaving this at the default still surfaces rolled-back writes — which
     completes the §2.5 exactly-once story that previously stopped at the sequence qualifier;
   - the two real costs of turning it on (fetch held open until the transaction outcome is known →
     latency; post-restart `UnknownProducerId` / `UnknownTopicOrPartition` while the producer epoch
     is re-established);
   - the **two-isolations trap**: Kafka's `isolation.level` decides what a consumer *reads*, while
     Spring's `TransactionDefinition` isolation scopes a *transaction*, and asking for one where
     the other belongs is a runtime `InvalidIsolationLevelException`, not a warning.

   Plus vol12 Common Mistake bullet, Q7 (STAFF) and a Further Reading link to Boot's
   `spring-kafka.html` configuration page. The section's earlier "deliberately not written" note in
   the sixth pass is what this closes.
8. ~~**`spring-01`'s `@MockBean` reference left in place.**~~ **CLOSED 2026-10-04 — updated to
   `@MockitoBean`.** It was a single occurrence, in the constructor-injection argument: *"the test
   supplies a fake `PaymentClient` directly, with no `@MockBean`, no context refresh, no proxy
   weaving."* So it was a contrast, not a recommendation — but vol10 §8.3 had already been corrected
   from `@MockBean` to `@MockitoBean` for exactly this reason in the third pass, and vol09 §2.5
   devotes a section to why the old annotation is deprecated on Boot 3.4+. Leaving one file calling
   it by the deprecated name made the corpus inconsistent with its own argument.

   One-word change; the sentence's meaning is unchanged, because the point is that no Spring context
   is needed at all. `@MockitoBean` is the correct name for "the bean-override approach we are not
   using" on 3.4+.

   **The remaining `@MockBean` mentions in the Spring track are correct and were left alone**: they
   are all inside vol09 §2.5 / cheat09's *deprecation* treatment (the commented-out import, the
   "deprecated as of Boot 3.4" bullets, the Boot 4 removal table). Naming the deprecated annotation
   in order to explain it is the point.
9. ~~**`@MockitoBean`'s `enforceOverride` default is absent from vol09 §2.5**~~ — **CLOSED 2026-10-04.**
   It is present in **both** vol09 §2.5 (4 occurrences: prose, a Java snippet, a follow-up paragraph
   and a trap callout) and the matching cheat09 block (2 occurrences). This entry was written when
   the material had only been recorded in `checklist.md`; a later pass in the same day added it to
   both pages. Closing rather than re-doing the work.