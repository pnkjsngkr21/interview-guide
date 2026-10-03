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
| `spring/spring-07-spring-boot-auto-configuration.html` | 2 | Heading level, TOC leak |
| `spring/spring-08-spring-security.html` | 2 | Malformed QA block, TOC leak |
| `spring/spring-09-testing-production-troubleshooting.html` | 2 + **§2.5 extended** | **Factual**, TOC leak, **new content** |
| `spring/spring-10-webflux-project-reactor.html` | 3 | **Factual**, consistency, TOC leak |
| `spring/spring-11-spring-cloud-distributed-systems.html` | 7 | **Factual**, TOC leak, 2 malformed QA blocks, bold leak |
| `cheatsheets/spring/02-bean-lifecycle-scopes-di.html` | 1 | **Factual** |
| `cheatsheets/spring/05-spring-mvc-web-layer.html` | **1 added** | **New callout** |
| `cheatsheets/spring/06-spring-data-jpa-persistence.html` | **1 added** | **New section** |
| `cheatsheets/spring/09-testing-production-troubleshooting.html` | **1 added** | **New callout** |
| `cheatsheets/spring/04-transaction-management.html` | 1 | Markdown leak |
| `cheatsheets/spring/11-spring-cloud-distributed-systems.html` | 2 + **3 added** | **Factual**, **new sections** |

**11 volumes + 6 cheatsheets = 17 files edited. 4 new files created, all under `_review/`.**

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

38. **`@MockitoBean`'s `enforceOverride` default** — vol09 §2.5 gained a paragraph, a 4-line
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

## Verification

All 22 Spring pages re-checked after every edit batch, plus the site index:

```
11 volumes      → PASS - no errors, exit 0
11 cheatsheets  → PASS - no errors, exit 0
 index.html     → PASS - no errors, exit 0
```

No file was deleted. No heading was renamed, so no anchor moved. The `pre.snippet` /
`pre.diagram` invariant asserted by `check.js --volume` holds across all 11 volumes — the 310
backtick conversions were all in sidebar TOCs and prose, never inside a `<pre>`.

## Coverage summary

| Checklist area | Before | After |
| --- | --- | --- |
| Verified-correct technical claims | 9 spot-checks | 12 |
| Factual errors found and fixed | — | 12 |
| Rendered-broken markdown defects fixed | — | 10 (310 backticks, 3 malformed QA blocks, 2 bold leaks, 1 prose leak) |
| Heading/structural inconsistencies fixed | — | 3 |
| Volumes PASS `check.js --volume` | 11 | 11 |
| Cheatsheets PASS `check.js --cheatsheet` | 11 | 11 |
| Markdown leaks outside `<pre>` | 316 backticks + 2 bold, all 22 files | **0** |
| High-priority topics closed | 1 (Spring Cache) | 4 (Spring Cache, RestClient, `enforceOverride`, cheat11 ch.1/7/8) |

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

## Unverified / needs human check

1. **Virtual threads are thin.** `spring.threads.virtual.enabled=true` appears as prose and a
   table row, but the senior answer is the mechanism — carrier-thread pinning, why a `synchronized`
   block or a JDBC call inside it defeats the whole thing, and why the connection pool rather than
   the thread count becomes the limit. That is an addition, not a correction, so it was left out
   rather than half-written. **Recommend a dedicated section in vol07 or vol09.**
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
4. **Messaging has no home.** `KafkaTemplate`, `@KafkaListener`, `@RabbitListener` are absent from
   all 11 volumes, and vol11 §6 builds its outbox argument on an unnamed "broker". The brief lists
   messaging as in-scope, but no existing volume owns it — a proper treatment is a new
   `spring-12-*.html`, which is a file creation rather than the minimal targeted edit the brief
   also requires. **Flagged for a decision rather than taken unilaterally.**
5. **Cheatsheet sync gaps remain**: cheat07 is missing §1.5 (scan-root trap), §2.5 (condition
   report) and §3.5 (building your own starter); cheat08 is missing the attack-surface table,
   `AuthorizationManager`, the authorization-server split and session fixation; cheat11 has no
   section at all for volume chapters 1, 7 or 8. Per the authoring contract these are additions,
   not corrections.
6. **Boot 4 / Framework 7 absent.** Justified rather than overlooked — the corpus tags its claims
   to Boot 3.x throughout, and adding Boot 4 responsibly would mean re-verifying every version tag
   in the set. **The verified Boot 4 baseline is now written up in `checklist.md`**, so the next
   pass can add it without re-researching. The highest-value single fact: `@MockBean`/`@SpyBean`
   are *removed* in Boot 4 (not merely deprecated), and `@SpringBootTest` no longer supplies
   `MockMvc`/`WebClient`/`TestRestTemplate` — which breaks every Boot 4 test relying on the old
   default.
7. **`spring-01`'s `@MockBean` reference left in place.** Used as a contrast in a
   constructor-injection argument, not as a recommendation. A defensible reading either way; worth
   a human decision if you want the set to be uniformly 3.4-clean.
8. **`@MockitoBean`'s `enforceOverride` default is absent from vol09 §2.5**, which covers the
   deprecation and the `@Configuration`-class restriction thoroughly but not this. `enforceOverride`
   defaults to `false` (`REPLACE_OR_CREATE`), so a typo'd field silently auto-creates a mock instead
   of failing the test — the opposite of `@MockBean`'s behaviour, and a good senior question. Written
   into `checklist.md`; recommend adding to vol09 alongside the existing material.