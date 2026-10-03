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
| `spring/spring-05-spring-mvc-web-layer.html` | 2 | **Factual**, TOC leak |
| `spring/spring-06-spring-data-jpa-persistence.html` | 3 | **Factual**, TOC leak, bold leak |
| `spring/spring-07-spring-boot-auto-configuration.html` | 2 | Heading level, TOC leak |
| `spring/spring-08-spring-security.html` | 2 | Malformed QA block, TOC leak |
| `spring/spring-09-testing-production-troubleshooting.html` | 2 | **Factual**, TOC leak |
| `spring/spring-10-webflux-project-reactor.html` | 3 | **Factual**, consistency, TOC leak |
| `spring/spring-11-spring-cloud-distributed-systems.html` | 7 | **Factual**, TOC leak, 2 malformed QA blocks, bold leak |
| `cheatsheets/spring/02-bean-lifecycle-scopes-di.html` | 1 | **Factual** |
| `cheatsheets/spring/04-transaction-management.html` | 1 | Markdown leak |
| `cheatsheets/spring/11-spring-cloud-distributed-systems.html` | 2 | **Factual** |

**11 volumes + 3 cheatsheets = 14 files edited. 4 new files created, all under `_review/`.**

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

## Unverified / needs human check

1. **Virtual threads are thin.** `spring.threads.virtual.enabled=true` appears as prose and a
   table row, but the senior answer is the mechanism — carrier-thread pinning, why a `synchronized`
   block or a JDBC call inside it defeats the whole thing, and why the connection pool rather than
   the thread count becomes the limit. That is an addition, not a correction, so it was left out
   rather than half-written. **Recommend a dedicated section in vol07 or vol09.**
2. **Spring Cache abstraction is absent** (`CacheManager`, `@Cacheable`, `@EnableCaching` — zero
   occurrences site-wide). This is a genuine High-priority gap against the brief's own topic list.
   Belongs in vol06 next to the second-level cache material, because the interview question is
   almost always "how do these two interact?" — and the answer is that they are different layers
   with different invalidation models. **Not added; recommend it be the next piece of work.**
3. **`RestClient` is absent from vol05 §7.5**, which owns outbound HTTP, and from `cheat05`
   entirely. `RestTemplate` entered maintenance mode in Framework 6.1 and `RestClient` is its
   designated successor. The one place `RestClient` appears in the corpus is a Further Reading
   link label. **Recommend §7.5 be extended to the three-client comparison.**
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
   in the set. Flagged because the corpus will need it eventually.
7. **`spring-01`'s `@MockBean` reference left in place.** Used as a contrast in a
   constructor-injection argument, not as a recommendation. A defensible reading either way; worth
   a human decision if you want the set to be uniformly 3.4-clean.