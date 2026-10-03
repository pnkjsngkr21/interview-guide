# Spring interview-prep — Master topic checklist

**Date:** 2026-10-03
**Audience:** senior backend engineer, 10+ years, depth-oriented interviews.
**Versions treated as current:** Spring Framework 6.2, Spring Boot 3.4/3.5, Java 17/21, Jakarta EE 10.

Rating is **interview importance**, not page coverage. `Covered` means the volume teaches it to
senior depth. A rating of High with `Partial` is a real gap and drives the work in `gap-report.md`.

## Core — IoC / DI / lifecycle (Volume 1, 2)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| BeanFactory vs ApplicationContext | High | Covered | v1 |
| Bean lifecycle, full creation order | High | Covered | v2 §1 |
| Aware callbacks — who calls what, and how many | High | **Fixed 2026-10-03** | v2 §1.3 |
| BeanPostProcessor vs BeanFactoryPostProcessor | High | Covered | v2 §2 |
| `@Configuration` CGLIB proxying, full vs lite | High | Covered | v2 §2.3 |
| Static `@Bean` post-processors | Medium | Covered | v2 §2.4 |
| Scopes, singleton cache, prototype-into-singleton | High | Covered | v2 §3 |
| Circular dependencies, Boot 2.6 default | High | Covered | v2 |
| `FactoryBean` vs `@Bean` | High | **Fixed 2026-10-03** | v2 §5.2 |
| `@Import`, dynamic registration, `BeanDefinitionRegistryPostProcessor` | Medium | Covered | v2 §5 |
| Bean validation, `BindingResult` pitfall | Medium | Covered | v2 §4 |
| Conditional beans | High | Covered | v7 §2.3 |
| Profiles, `Environment`, property sources | High | Covered | v7 §4 |
| Application events, the multicaster | Medium | **Fixed 2026-10-03** | v1 §6 |
| `@Async` and the task executor | High | **Fixed 2026-10-03** | v1, cheat01 |

## Boot (Volume 7)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| What `@SpringBootApplication` actually is | High | Covered | v7 §1.2 |
| `@ComponentScan` scan-root trap | High | Covered | v7 §1.5 |
| Which Boot defaults are wrong for a workload | High | Covered | v7 §1.4 |
| Auto-configuration mechanism end to end | High | Covered | v7 §2.1 |
| `spring.factories` → `AutoConfiguration.imports` history | Medium | Covered | v7 §2.2 |
| The `@Conditional` family | High | Covered | v7 §2.3 |
| `@ConditionalOnMissingBean` evaluation-order trap | High | Covered | v7 §2.4 |
| Condition evaluation report | High | Covered | v7 §2.5 |
| Worked auto-configuration | Medium | **Fixed 2026-10-03** (h4→h3) | v7 §2.6 |
| Starters, BOM, parent, what they drag in | High | Covered | v7 §3 |
| Build your own starter | High | Covered | v7 §3.5 |
| Property source precedence | High | Covered | v7 §4.1 |
| `@ConfigurationProperties` binding | High | Covered | v7 §4.3 |
| `spring.application.json` and the config tree | Medium | Covered | v7 §4.2 |
| Actuator endpoints and exposure | High | Covered | v7 §7.1–7.2 |
| Executable JAR, layered jars, `jarmode` | Medium | Covered | v7 §5 |
| AOT and native image | Medium | Covered | v7 §6 |
| Graceful shutdown | High | Covered | v7 §7.6 |
| **Virtual threads** | High | **Added 2026-10-04** — vol09 §5.8: mount/unmount lifecycle, carrier pool, **version-conditional pinning** (`synchronized` pins on JDK 21–23, not on 24+ per JEP 491; `jdk.tracePinnedThreads` removed), `spring.threads.virtual.enabled` (Boot 3.2+, also needs Java 21+; `@Async` follows automatically; `Executor`-bean back-off; no Undertow path), `Thread.dump_to_file`, and why the connection pool becomes the limit | v9 §5.8, v7 §2.3, cheat09 §5, cheat07 |

## AOP (Volume 3)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| Proxy selection rule (JDK vs CGLIB) | High | **Fixed 2026-10-03** — CGLIB needs no visible constructor; Boot caveat added to the flagship blockquote | v3 §2.1 |
| Boot 2.0 `proxyTargetClass=true` | High | Covered | v3 §2.5 |
| `DefaultAopProxyFactory.createAopProxy` | High | Covered | v3 §2.1 |
| `Advised` / `AdvisedSupport` / `TargetSource` | Medium | Covered | v3 §2.2 |
| Interceptor chain | High | Covered | v3 §2.3 |
| Self-invocation | High | Covered | v3 §7.1, v4 §6.1 |
| `final` classes / methods / `record` / Kotlin `data class` | High | Covered | v3 §7.3 |
| `equals`/`hashCode`/`toString` and proxies | Medium | Covered | v3 §7.4 |
| The `proceed()` contract, five obligations | High | Covered | v3 §5.1 |
| Aspect ordering and the `@Order` inversion | High | Covered | v3 §6 |
| Generics / collection injection against proxied types | Medium | Covered | v3 §7.6 |

## Transactions (Volume 4)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| The abstraction and its implementations | High | Covered | v4 §1 |
| `DataSourceTransactionManager` vs `JpaTransactionManager` | High | Covered | v4 §1.4–1.6 |
| What `@Transactional` actually is | High | Covered | v4 §2.1 |
| The rollback rule | High | Covered | v4 §2.3 |
| The proxy requirement | High | Covered | v4 §2.4 |
| Proving a transaction is running | High | Covered | v4 §2.6 |
| Propagation, full table | High | Covered | v4 §3 |
| `NESTED`, savepoints | High | **Fixed 2026-10-03** — `nestedTransactionAllowed` defaults to `false`; `DataSourceTransactionManager` enables it in its constructor, `JpaTransactionManager` does not | v4 §3.3 |
| `REQUIRES_NEW` suspension | High | Covered | v4 §3.2 |
| Isolation levels, MVCC, lost updates | High | Covered | v4 §4 |
| Declarative vs programmatic | Medium | Covered | v4 §5 |
| `TransactionSynchronizationManager` | Medium | Covered | v4 §5.3 |
| Self-invocation catalogue entry | High | **Fixed 2026-10-03** — example isolated to one cause; the `private` variant now called out as a separate defect | v4 §6.1 |
| Checked exception that committed | High | Covered | v4 §6.2 |
| `readOnly=true` | Medium | Covered | v4 §6.3 |
| Long transactions holding locks | High | Covered | v4 §6.6 |
| Distributed transactions, 2PC/XA | Medium | Covered | v4 §7 |

## Web / MVC (Volume 5)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| `DispatcherServlet` request flow | High | Covered | v5 |
| `@RequestMapping` condition bundle | High | Covered | v5 §3 |
| `-parameters` flag | High | Covered | v5 §3 |
| `@ModelAttribute` mass-assignment risk | High | Covered | v5 §3 |
| Hidden HTTP method filter | Medium | **Fixed 2026-10-03** — not deprecated, not removed; off by default in Boot via `@ConditionalOnBooleanProperty` | v5 §3 |
| `ProblemDetail`, `@ControllerAdvice` | High | Covered | v5 |
| Filters vs interceptors | High | Covered | v5 |
| `RestTemplate` | High | Covered | v5 §7.5 |
| **`RestClient`** | High | **Added 2026-10-04** — three-client comparison; `@since 6.1`, synchronous (not reactive), throws by default like `RestTemplate`, per-request `onStatus` vs global `ResponseErrorHandler`, Boot 3.2 prototype builder | v5 §7.5, cheat05 |
| `WebClient` | High | Covered | v5 §7.5, v10 |
| Content negotiation | Medium | Covered | v5 §3 |

## Data / JPA (Volume 6)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| N+1 and its fixes | High | Covered | v6 |
| Lazy loading, `LazyInitializationException` | High | Covered | v6 |
| Fetch types, entity graphs | High | Covered | v6 |
| Pagination | High | Covered | v6 |
| Connection pooling, HikariCP | High | Covered | v6, v9 §5.5 |
| `ddl-auto` real default | High | Covered | v6 §7.1 |
| Schema evolution, Flyway/Liquibase | High | Covered | v6 §7 |
| Second-level cache | Medium | **Fixed 2026-10-03** — `javax.cache` → `jakarta.cache` | v6 |
| **Spring Cache abstraction** | High | **Added 2026-10-03** — `@EnableCaching` attributes, `@Cacheable`/`@CachePut`/`@CacheEvict`, key generation, the three-layer distinction, self-invocation, cache-vs-transaction ordering | v6 §4.6, cheat06 ch4 |
| `@Version` optimistic locking | High | Covered | v6 |

## Security (Volume 8)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| The filter chain | High | Covered | v8 |
| `SecurityContextHolder`, `SecurityContextPersistenceFilter` → `SecurityContextHolderFilter` | High | Covered | v8 |
| Authentication vs authorization | High | Covered | v8 |
| Method security, `@PreAuthorize` | High | Covered | v8 |
| JWT validation | High | Covered | v8 |
| OAuth2 / OIDC | High | Covered | v8 |
| CSRF / CORS | High | Covered | v8 |
| `WebSecurityConfigurerAdapter` removal (6.0), `authorizeRequests()` removal (6.1) | High | Covered | v8 |
| `AuthorizationManager` | Medium | Missing from cheat sheet | v8 |
| Attack surface table, session fixation, `kid` | Medium | Missing from cheat sheet | v8 |

## Cloud / Resilience (Volume 11)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| Discovery, config, gateway | High | Covered | v11 |
| Gateway route predicates and filters | High | **Fixed 2026-10-03** — two malformed Q&A blocks repaired | v11 §3 |
| Resilience4j patterns | High | Covered | v11 §4 |
| `waitDurationInOpenState` default | High | **Fixed 2026-10-03** — 10s → **60s** (60000 ms), the actual Resilience4j default | v11, cheat11 |
| Retry amplification arithmetic | High | **Fixed 2026-10-03** — "eight requests" corrected to 3³ = 27 | v10 |
| Circuit breaker tuning | High | Covered | v11 §4 |
| Saga patterns | High | Covered | v11 |
| Outbox pattern | High | Covered (unnamed broker) | v11 |
| OpenTelemetry | Medium | Thin — one diagram, one paragraph | v11 §5.4 |
| **Messaging (Kafka / RabbitMQ)** | High | **Added 2026-10-04** — new volume 12 + cheatsheet. Log-vs-queue, consumer groups and ordering, `@KafkaListener` (`id`/`idIsGroup`), the 7 `AckMode` values and their `BATCH` default, error handling and the 9-retry default, EOS and its sequence-only qualifier, `KafkaTemplate` send failure, RabbitMQ's 3 `AcknowledgeMode` values, `defaultRequeueRejected=true`, prefetch 250, the two dead-letter paths, `SimpleMessageConverter`'s `Serializable` case, simple/direct namespaces. 23 questions. Version-tagged **4.1.1** | v12, cheat12 |
| Cheatsheet coverage of ch. 1, 7, 8 | Medium | **Added 2026-10-04** — three sections: should you split at all, service-to-service security, antipatterns and their causes | cheat11 §9–11 |

## Testing / Production (Volume 9)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| Test pyramid | High | Covered | v9 |
| Slice tests | High | Covered | v9 |
| `@MockBean` deprecation → `@MockitoBean` | High | Covered | v9 §2.5 |
| `@MockitoBean`'s `enforceOverride` default | High | **Added 2026-10-04** — defaults to `false` / `REPLACE_OR_CREATE`, so a missing bean yields a silently created mock | v9 §2.5, cheat09 |
| Testcontainers | High | Covered | v9 |
| JVM tuning, GC logging | High | Covered | v9 §5.3 |
| Tomcat thread arithmetic | High | Covered | v9 §5.4 |
| HikariCP arithmetic | High | Covered | v9 §5.5 |
| `jstack` triage | High | Covered | v9 §5.6 |
| JFR | High | **Fixed 2026-10-03** — removed the fabricated "Boot 3.3+ exposes JFR over the management port"; no such endpoint exists | v9 §5.7 |
| Retry storms | High | Covered | v9, v10, v11 |

## WebFlux (Volume 10)

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| Reactive model, backpressure | High | Covered | v10 |
| Operators | High | Covered | v10 |
| Context propagation | High | Covered | v10 |
| `retryWhen` with backoff and jitter | High | **Fixed 2026-10-03** arithmetic | v10 §3 |
| `StepVerifier`, virtual time | Medium | Covered | v10 §8 |
| `WebTestClient` slice tests | Medium | **Fixed 2026-10-03** — `@MockBean` → `@MockitoBean`, was contradicting v9 §2.5 | v10 §8.3 |

## Cross-cutting

| Topic | Rating | Status | Where |
| --- | --- | --- | --- |
| Boot 2 → 3 migration, Jakarta rename | High | Partial | scattered; no dedicated treatment |
| Boot 4 / Framework 7 | Medium | Not covered — see below for verified content | — |
| Structured logging | Medium | Not covered | — |
| `@Scheduled` | Medium | Not covered | — |

### Addendum: Spring Boot 4 baseline (verified 2026-10-03, not yet in the corpus)

Sourced from the Spring Boot 4.0 migration guide, the 4.0 system-requirements page, and the
release notes. Recorded here so a future pass can write it without re-researching it.

| Fact | Note |
| --- | --- |
| Boot 4 requires **Java 17+**, not 21 | The "Boot 4 needs Java 21+" claim is wrong. Boot 3.x was also 17+, so Java 21 was never the differentiator. |
| Requires **Spring Framework 7.x** | |
| Based on **Jakarta EE 11**, **Servlet 6.1** baseline | Boot 3 was Jakarta EE 10 / Servlet 6.0 |
| Everything deprecated in Boot 3.x is **removed** in 4.0 | The arc is 3.4-deprecate → 4.0-remove |
| Spring's guidance: upgrade to **3.5 first**, then 4.0 | |
| `@MockBean` / `@SpyBean` support **removed** (not merely deprecated) | `@MockitoBean` / `@MockitoSpyBean` are Spring **Framework** annotations, and cannot be used on `@Configuration` classes |
| `@SpringBootTest` no longer supplies `MockMvc`, `WebClient` or `TestRestTemplate` | `@AutoConfigureMockMvc` required. This breaks every Boot 4 test that relied on the old default. |
| Jackson 3 is now the preferred JSON library | `com.fasterxml.jackson` → `tools.jackson`; `jackson-annotations` keeps the old package. `Jackson2ObjectMapperBuilderCustomizer` → `JsonMapperBuilderCustomizer`. Properties move to `spring.jackson.json.read`/`write`, with `spring.jackson2.*` as a migration namespace. |

### Addendum: `@MockitoBean`'s `enforceOverride` default (verified, absent from the corpus)

`enforceOverride` defaults to **`false`**, mapping to `BeanOverrideStrategy.REPLACE_OR_CREATE`. A
`@MockitoBean` field therefore **creates** a mock when no matching bean exists, rather than failing
the test. A typo'd field name or a missing bean definition is masked by a silently auto-created
mock instead of surfacing a wiring error — a genuinely good senior-interview question, and the
opposite of what `@MockBean` did. Set `enforceOverride = true` to get the old fail-fast behaviour.