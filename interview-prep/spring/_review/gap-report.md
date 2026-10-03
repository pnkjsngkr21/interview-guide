# Spring interview-prep — Gap report

**Date:** 2026-10-03
**Scope:** `interview-prep/spring/*.html` (11 volumes) and `interview-prep/cheatsheets/spring/*.html` (11 cheatsheets). No other track was read or modified.

Baseline: all 22 pages PASS `check.js --volume` / `--cheatsheet` with exit 0, before and after this pass.

## Framing

This is a **mature, senior-level corpus**, not a remediation job. 1,084 interview Q&A, 388
callouts, 198 diagrams, 217 tables, 172 `docs.spring.io` citations, and every chapter carrying
the `Common Mistakes` → `Interview Questions` → `Further Reading` triple. The prose register is
already the one the brief asks for.

The gaps are therefore three kinds, and only the first two were worth editing time:

1. **Factually wrong** — claims that contradict the official source. These are worse than
   omissions because a candidate who memorises them is actively penalised.
2. **Rendered-broken** — markdown that survived the retired converter into live HTML.
3. **Missing** — real topics absent. Addressed in `checklist.md`; several were judged
   lower-value than the cost of adding a well-integrated chapter late, and are logged below
   rather than half-written.

## 1. Inaccurate or outdated — all verified against official sources

| # | File | Line | Claim as written | Verified truth | Source |
| --- | --- | --- | --- | --- | --- |
| 1 | `spring-02` | §1.3 prose | `ApplicationContextAware` "extends `EnvironmentAware`, `ResourceLoaderAware`, `ApplicationEventPublisherAware` and `MessageSourceAware`… the container therefore makes **four** Aware calls when it makes the fifth" | `ApplicationContextAware extends Aware` and nothing else. `ApplicationContextAwareProcessor.invokeAwareInterfaces` tests each interface independently (`if (bean instanceof EnvironmentAware …)`, then `if (bean instanceof ApplicationContextAware …)`). **Implementing `ApplicationContextAware` alone fires exactly one call.** | [`ApplicationContextAware` javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/context/ApplicationContextAware.html), [`ApplicationContextAwareProcessor` source](https://github.com/spring-projects/spring-framework/blob/main/spring-context/src/main/java/org/springframework/context/support/ApplicationContextAwareProcessor.java) |
| 2 | `spring-02` | §1.3 table | "Called for: **Every bean**" on all seven rows | Each callback fires only for a bean that *implements* the interface. Also `BeanFactoryAware` was missing from the table entirely. | same |
| 3 | `spring-02` | §1.3 | `BeanClassLoaderAware` "skipped when the bean is being created as part of a bean factory's own internal operations for a `BeanClassLoaderAware`" | `invokeAwareMethods` guards it with `if (bcl != null)` — skipped when the factory's class loader is `null`. The stated condition was a garbled non-condition. | [`AbstractAutowireCapableBeanFactory` source](https://github.com/spring-projects/spring-framework/blob/main/spring-beans/src/main/java/org/springframework/beans/factory/support/AbstractAutowireCapableBeanFactory.java) |
| 4 | `spring-02` | §1.3, Q1 | "with `ApplicationContextAware` triggering four separate Aware calls because it extends the other three" | Same as #1 — one call. | same |
| 5 | `cheatsheets/spring-02` | number card | "**4** — Aware calls made when only `ApplicationContextAware` is implemented" | **1**. | same |
| 6 | `spring-05` | §3 | "Spring 5 deprecated it; **Spring 6 removed it**" (`HiddenHttpMethodFilter`) | **Neither.** The class is present and carries no `@Deprecated` in Framework 6.x. `WebMvcAutoConfiguration` still registers it. What changed is the default: `@ConditionalOnBooleanProperty("spring.mvc.hiddenmethod.filter.enabled")` with no `matchIfMissing`, so it is **off unless enabled** — and the page's own YAML immediately below implies you must enable it. | [`WebMvcAutoConfiguration` (3.5.x)](https://github.com/spring-projects/spring-boot/blob/3.5.x/spring-boot-project/spring-boot-autoconfigure/src/main/java/org/springframework/boot/autoconfigure/web/servlet/WebMvcAutoConfiguration.java), [`HiddenHttpMethodFilter` source](https://github.com/spring-projects/spring-framework/blob/main/spring-web/src/main/java/org/springframework/web/filter/HiddenHttpMethodFilter.java) |
| 7 | `spring-09` | §5.7 | "Spring Boot 3.3+ can also expose it over the management port" (JFR) | **No such endpoint exists, in any Boot version.** The built-in actuator endpoint list contains no JFR operation. | [Spring Boot actuator endpoints reference](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html) |
| 8 | `spring-10` | §3.2 | "three layers each retrying twice is **eight** requests per user request" | 3 layers × 3 attempts = **3³ = 27**. The adjacent callout on the same topic already said 27×, and `cheat10` explains the 8-vs-27 distinction explicitly — so the volume contradicted its own cheat sheet. | arithmetic |
| 9 | `cheatsheets/spring-11` | number card + SVG | "`waitDurationInOpenState` … **10s**" | Official default is **60000 ms (60 s)**. `10s` reads as a default but is a tuning choice. | [Resilience4j CircuitBreaker docs](https://resilience4j.readme.io/docs/circuitbreaker) |
| 10 | `spring-11` | snippet | `wait-duration-in-open-state: 10s` | Same — corrected to `60s`, labelled as the default. | same |
| 11 | `spring-03` | §2.1 table | CGLIB "Requires: target is a non-final class with a **visible constructor**"; Weakness: "Constructor must be reachable" | Spring builds the proxy with **Objenesis**, so no visible or no-arg constructor is required. "The constructor of your proxied object will not be called twice, since the CGLIB proxy instance is created through Objenesis." The page's own §2.1 snippet already shows `new ObjenesisCglibAopProxy(config)`. | [Spring AOP proxying reference](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) |
| 12 | `spring-04` | §3.3 | `NESTED` stated without mentioning `nestedTransactionAllowed` | `AbstractPlatformTransactionManager.nestedTransactionAllowed` defaults to **`false`**. `DataSourceTransactionManager` calls `setNestedTransactionAllowed(true)` in its constructor; **`JpaTransactionManager` does not** — under JPA you must set it yourself or you get `NestedTransactionNotSupportedException`. The page covered the JPA *savepoint* problem in depth and never named the flag that gates it. | [`AbstractPlatformTransactionManager` javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/transaction/support/AbstractPlatformTransactionManager.html), [`JpaTransactionManager` javadoc](https://docs.spring.io/spring-framework/docs/current/javadoc-api/org/springframework/orm/jpa/JpaTransactionManager.html) |

## 2. Rendered-broken — markdown that survived the retired converter

The build that converted markdown to HTML was retired at commit `fcec505`. These are its
survivors, and they are the highest-visibility defects in the set because the sidebar is the
first thing rendered on the page.

| File | Line | Defect |
| --- | --- | --- |
| **all 11 volumes** | 15 | Sidebar TOC: **310 raw backticks, 0 `<code>` tags**, never converted from markdown. Per file: `spring-03` 54, `spring-05` 48, `spring-06` 44, `spring-07` 38, `spring-09` 38, `spring-08` 32, `spring-02` 30, `spring-04` 30, `spring-01` 28, `spring-11` 12, `spring-10` 8. |
| `spring-11` | 326, 793 | Malformed Q&A — `<code>` tags interleaved into the badge markup: `` `Path=/api/orders/ <span class="qa__badge"><code> with </code>StripPrefix=2<code> — what arrives…** </code>TRICKY` `` |
| `spring-08` | — | Same malformation, third instance, in the authorization chapter's Q1. |
| `spring-06` | — | Markdown bold leak: `<p>**P13. A paginated admin grid…**</p>` |
| `spring-11` | — | Markdown bold leak: `<li>How would you fix it, and what is each fix's cost?** <code>STAFF</code></li>` |
| `cheatsheets/spring-04` | 246 | Single-instance prose leak: `` `ThreadLocal` `` beside correct `<code>` on the same lines. |

**All 11 volume sidebars were affected** — this was systemic, not three isolated files. The first
pass found 3 files (96 backticks); a corrected multi-line-aware scan found the other 8, because the
initial sweep masked `<pre>` blocks per *line* and so missed backticks in the TOCs of files whose
`<pre>` blocks span lines. Cheatsheets were clean — all 11 were hand-authored against the HTML
contract.

All three malformed QA blocks rebuilt to the house `<span class="qa__badge"><code>TRICKY</code></span>`
form (verified against 111 canonical instances). Final sweep: **all 22 files clean** — zero
backticks and zero bold leaks outside `<pre>`, with only legitimate `/**` glob patterns and
`******` redaction markers remaining.

## 3. Consistency defects

| File | Defect | Fix |
| --- | --- | --- |
| `spring-07` §2.6 | `2.6 A Worked Auto-Configuration` is the **only** content heading in the entire volume at `<h4>`; all 54 sibling numbered sections are `<h3>`. This also demoted it below its own `Common Mistakes` block. | `h4` → `h3` |
| `spring-10` §8.3 | `@MockBean` in a `@WebFluxTest` example, directly contradicting `spring-09` §2.5 which devotes a full section to why that annotation is deprecated on Boot 3.4+. | `@MockitoBean`, with a version comment |
| `spring-01` Ch5 diagram | `AnnotationConfigReactiveWebServerApplicationContext` listed **twice** as siblings, the second annotated "(Netty)" — no such second subclass exists under that name | Second line rewritten to describe what Boot actually does (selects a Netty or Reactor Netty factory bean) |
| `spring-01` §— | `@MockBean` used rhetorically ("no `@MockBean`") — stale on Boot 3.4 | Left as-is; it is a contrast, not a recommendation. Logged. |
| `spring-04` §6.1 | Example declared `private void applyPromotion` **and** self-invoked it, then attributed the failure solely to self-invocation. Two independent defects, one named. | Method made `public` so the example isolates self-invocation; new paragraph states that real code has both and that naming only one is half an answer |
| `spring-03` §2.1 | Flagship blockquote gave the Framework default with no Boot caveat, so a Boot candidate quoting it would be marked wrong — while §2.5 of the same chapter documented the Boot 2.0 default | Boot caveat added inline, cross-referencing §2.5 |
| `spring-02` §1.3 | Table omitted `BeanFactoryAware`, one of the three `invokeAwareMethods` callbacks | Row added |

## 4. Missing topics — assessed, with a decision on each

| Topic | Rating | Decision |
| --- | --- | --- |
| **Spring Cache abstraction** (`CacheManager`, `@Cacheable`, `@EnableCaching`, self-invocation trap, key generation) | High | **Closed 2026-10-03 — added as vol06 §4.6**, plus cheat06 ch4. Placed immediately after §4.5 because the interview question is almost always "how do these two interact?", and the answer is that the Spring Cache, the persistence context and the Hibernate L2 cache are three layers with three different invalidation models. Stampede was left to Database Vol 9 per the linking-not-restating rule. |
| **`RestClient`** (Framework 6.1) | High | **Closed 2026-10-04.** §7.5 is now a three-client comparison. The research falsified four claims that would otherwise have been written — most importantly that `RestClient` does not throw on 4xx/5xx (it does) and that `RestTemplate` is deprecated or in "maintenance mode" (it is neither). See the fourth pass in `change-log.md`. |
| **Messaging — `KafkaTemplate`, `@KafkaListener`, `@RabbitListener`** | High | **Gap, and a scope decision.** Zero occurrences across all 11 volumes. vol11 §6 builds its entire outbox argument on an unnamed "broker". Adding it properly means a new volume (`spring-12-messaging.html`), which is a file creation, not a targeted edit — outside "minimal, targeted edits". |
| Virtual threads | High | **Closed 2026-10-04 — added as vol09 §5.8**, plus cheat09 §5 and an extended `@ConditionalOnThreading` row in vol07/cheat07. Placed in vol09 because §5.4's Tomcat arithmetic and §5.5's pool arithmetic are the argument virtual threads qualify. The research falsified seven pieces of folklore before anything was written — most importantly that `synchronized` still pins (false from JDK 24, JEP 491) and that `-Djdk.tracePinnedThreads` is the way to find pinning (removed in JDK 24). See the fifth pass in `change-log.md`. |
| Boot 4 / Framework 7 | Medium | Not covered. Justified: Boot 4 is recent enough that interview pools still centre on 3.x, and the corpus consistently tags its claims to 3.x. Adding it would require re-verifying every version tag in the set. |
| Structured logging | Medium | Not covered. |
| `@Scheduled` | Medium | Not covered. |
| Cheat-sheet sync gaps (cheat07 missing 3.5/1.5/2.5; cheat08 missing attack-surface table, `AuthorizationManager`, session fixation; cheat11 missing ch. 1, 7, 8) | Medium | **cheat11 closed 2026-10-04** — sections 9–11 added for the trade-off, service-to-service security and antipatterns, each linking back to vol11 rather than restating. cheat07 and cheat08 still open. |
| Boot 2 → 3 migration as a dedicated treatment | High | Partial. The individual Jakarta/deprecation facts are covered in place; a consolidated migration chapter does not exist. |

## 5. Agent findings checked and rejected

Reported by the inventory subagents, verified, and **not** acted on:

- *"vol09 `:404` forward-references Volume 10 for virtual threads — dangling."* Not dangling. vol09 says Volume 10 covers what pool numbers mean for a reactive application, which vol10 does.
- *"Unsatisfied `List<StripeClient>` raises `NoSuchBeanDefinitionException`, not an empty list."* **The opposite is true.** Spring treats arrays, collections and maps specially: an unsatisfied collection injection point is satisfied with an empty collection. vol03 §7.6 is correct as written.
- *"`spring-03:19` / `spring-04:19` mastheads claim 9 chapters but there are 8."* All 11 volumes are internally consistent: 8 content chapters + 1 scenario bank = 9.
- *"`spring-06:541` has a sentence severed mid-clause into an orphaned `<blockquote>`."* Read in full — the blockquote is a deliberate `.note` and the prose flows correctly.
- *"vol03 needs a `ch8` cheatsheet section to match vol04's."* Not a defect. Cheatsheets are built around what a candidate must *say*, and a scenario bank is already reference-shaped.

## 6. File plan

No new content files were created. Every edit went into an existing volume and its matching
cheatsheet in the same pass. Full detail per file in `change-log.md`.