---
title: "The Spring Complete Deep-Dive"
volume: 1
series: "SPRING CORE & THE IOC CONTAINER"
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

Volume 1 is the foundation. If the container's behaviour is fuzzy, every later topic —
transactions, AOP, MVC, security, the distributed patterns in Volume 11 — becomes a set of
incantations to memorise rather than a mechanism you can reason about.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto `BeanPostProcessor`
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

Volumes end with an `Interview Scenario Bank` — production situations, code-behaviour
predictions, code-review questions, and design trade-off challenges. There is no target
number for these. They stop when the next question would repeat one already asked.

| Volume | Coverage |
| --- | --- |
| Volume 1 (this book) | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 1

- Chapter 1 — Spring Introduction & Architecture
- Chapter 2 — Inversion of Control & Dependency Injection
- Chapter 3 — Bean Definitions & the Container Internals
- Chapter 4 — Component Scanning & Stereotype Annotations
- Chapter 5 — The ApplicationContext Family
- Chapter 6 — Events & the ApplicationEventPublisher
- Chapter 7 — Profiles & Property Resolution
- Chapter 8 — Interview Scenario Bank

---

# Part 1 — Spring Core & the IoC Container

## Chapter 1 — Spring Introduction & Architecture

### 1.1 What Spring Actually Is

Strip away the marketing and Spring is three things stacked on top of each other, and
knowing which one you are talking about resolves most Spring arguments:

```text
┌─────────────────────────────────────────────────────────────┐
│  spring-web / spring-webmvc / spring-webflux                 │  The web layer
├─────────────────────────────────────────────────────────────┤
│  spring-tx / spring-orm / spring-jdbc                       │  Data access
├─────────────────────────────────────────────────────────────┤
│  spring-aop / spring-aspects                                 │  Cross-cutting
├─────────────────────────────────────────────────────────────┤
│  spring-context / spring-beans / spring-core                 │  The container
│  (IoC, DI, lifecycle, events, resource abstraction)          │
└─────────────────────────────────────────────────────────────┘
```

1. **A container** (`spring-beans`, `spring-context`) that instantiates objects, wires them
   together, manages their lifecycle, and publishes events.
2. **An integration layer** (`spring-tx`, `spring-jdbc`, `spring-orm`, `spring-web`) built
   on top of that container, implementing transactions, persistence, and HTTP.
3. **A programming model** — annotations, generics, and proxies — that makes all of the above
   usable without XML.

Spring is not, and never has been, a persistence framework or a web framework. JPA,
Hibernate, Tomcat and Jackson are separate projects. Spring *adapts* them and wires them
together. A surprising number of "Spring is slow" arguments are actually arguments about
Hibernate or about the connection pool underneath.

> **INTERVIEW TRAP**
>
> "Spring is an IoC container" is the accepted answer and it is also the least useful one.
> A senior answer continues: it's a *container* that owns object construction, wiring,
> lifecycle, and cross-cutting interception — and the reason that matters is that it turns
> cross-cutting concerns like transactions and security into proxy interception, which is
> also exactly why those features fail silently when the proxy isn't in the path.
> Stopping at "it handles object creation" signals you have memorised a definition.

### 1.2 Inversion of Control, Precisely

IoC is the principle that an object does not construct its own dependencies. The container
constructs it and passes dependencies in.

That is the whole idea. Everything else — `@Autowired`, component scanning, `BeanPostProcessor`
— is machinery for achieving it.

The distinction that matters at interview level is **IoC vs DI**. They are not synonyms,
although the industry uses them interchangeably:

| | Inversion of Control | Dependency Injection |
| --- | --- | --- |
| What it is | The *principle* — the container controls construction and lifecycle | The *technique* — one way to achieve IoC, by passing dependencies in |
| Other techniques | Template Method, Strategy, callback registration, `ApplicationEvent` listeners | Constructor, setter, field injection |
| In Spring | Everything the container does | `@Autowired`, `@Inject`, `@Bean` method parameters |

```java
// NOT IoC — the class reaches for its own dependency.
public class OrderService {
    private final PaymentClient client = new RestPaymentClient();  // hard-wired
}

// IoC + DI — the class declares what it needs; the container supplies it.
@Service
public class OrderService {
    private final PaymentClient client;   // only the contract, never a construction call

    public OrderService(PaymentClient client) {
        this.client = client;
    }
}
```

The second version is not just "cleaner". It is **testable without a Spring context** — the
test supplies a fake `PaymentClient` directly, with no `@MockBean`, no context refresh, no
proxy weaving. That is the single most concrete argument for constructor injection, and it is
the one to make in an interview.

> **TRADE-OFF**
>
> The second version also can't read configuration or pick an implementation at runtime, and
> it can't be a proxy-target for no-arg construction. The flip condition: if the dependency is
> genuinely optional, or must be resolved lazily (circular references, `@Lazy` proxies,
> optional integrations), field or setter injection is a legitimate choice — and Spring Boot
> 2.6+ makes the lazy case considerably harder to reach, which is deliberate.

### 1.3 `BeanFactory` vs `ApplicationContext`

The most-asked structural question in Spring interviews, and the one most often answered
wrongly.

```text
                    ApplicationContext
                            │  extends
                    BeanFactory
                            │
              implements (ListableBeanFactory,
               AutowireCapableBeanFactory,
               ConfigurableListableBeanFactory)
```

`BeanFactory` is the **minimal** container: it creates and returns beans. That is all. It is
enough to make dependency injection work and nothing else.

`ApplicationContext` extends it and adds enterprise services on top:

| Concern | `BeanFactory` | `ApplicationContext` |
| --- | --- | --- |
| Get a bean | `getBean()` | `getBean()` |
| Bean discovery / listing | No (it's `ListableBeanFactory`, not `BeanFactory`) | `getBeansOfType()`, `getBeanNamesForType()` |
| Internationalisation | No | `MessageSource` |
| Resource loading | No | `ResourceLoader` / `ApplicationContext` itself |
| Event publishing | No | `ApplicationEventPublisher` |
| Environment access | No | `Environment` |
| Bean post-processing | No | `BeanPostProcessor` registration |
| Lifecycle | No | `close()`, `ContextClosedEvent` |
| Type-safe lookup | No | `getBeanProvider()` |

In practice you use `ApplicationContext` 100% of the time. `BeanFactory` is what you name
when the interviewer asks the question, and it is genuinely used inside libraries and in
very tight startup-time scenarios.

> **INTERVIEW TRAP — "WHY DOESN'T APPLICATIONCONTEXT JUST EXTEND BEANFACTORY AND STOP?"**
>
> Because `BeanFactory` is deliberately minimal and `ApplicationContext` is the
> enterprise-grade façade. A strong answer notes that `BeanFactory`'s narrow surface is what
> makes it cheap to implement and appropriate for embedded or lazy-start contexts, and that
> the split lets Spring Framework ship a core usable in non-web, non-enterprise settings
> while Boot layers conventions on top.

### 1.4 Annotations vs XML

XML configuration still exists (`BeanFactory` is XML-first; `ClassPathXmlApplicationContext`
is a real class) and is still a legitimate interview topic. But since Spring 4.x, the
practical default is annotated or Java-config.

| | XML | Java Config (`@Configuration`) | Mixed |
| --- | --- | --- | --- |
| Refactor safety | Bad — a typo in a class name is a runtime `BeanDefinitionStoreException` | Good — refactoring tools understand `@Bean` methods | Medium |
| Type safety | None — everything is a string | Full — the compiler checks return types | Partial |
| Readability | Verbose, deeply nested for anything non-trivial | Ordinary Java | Mixed |
| Conditionals | Awkward | `@Conditional`, profiles, `@ConditionalOnProperty` | Awkward |
| Startup cost | XML parsing overhead | Compiled; near-zero parse | Both |
| Testability | Possible but painful | Trivial — call the config class | Awkward |

XML is not "old" so much as it is *ungovernable at scale*. A 4,000-bean application with
component scanning has no XML anywhere, and if your migration plan involves hand-converting
XML, the correct staff-level answer is that you shouldn't — you should let component
scanning discover most of it and hand-write only the genuinely dynamic parts.

> **PRODUCTION RELEVANCE**
>
> The real cost of XML shows up in incidents, not in authoring. A bean name typo in XML
> fails at startup with a message that doesn't name the file, and a missing bean definition
> for a rarely-loaded code path can survive to production. Java config moves both into the
> compiler. Teams migrating XML treat the first compile as a genuine incident-prevention
> project, not a chore.

### 1.5 The Modules Worth Knowing by Name

You will be asked which artifact provides what. These are the ones that actually matter:

| Module / artifact | Provides | Chapter |
| --- | --- | --- |
| `spring-core` | `IoCContainer`, `Environment`, utilities | 1, 7 |
| `spring-beans` | `BeanFactory`, `BeanDefinition`, bean lifecycle | 2, 3 |
| `spring-context` | `ApplicationContext`, `@Component`, events, `@Async` | 4, 5, 6 |
| `spring-aop` | `@Aspect`, `ProxyFactory`, pointcuts | 3 (Volume) |
| `spring-expression` | SpEL — the expression language used by `@Value`, `@PreAuthorize`, profiles | 7 |
| `spring-tx` | `PlatformTransactionManager`, `@Transactional` | 4 (Volume) |
| `spring-jdbc` | `JdbcTemplate`, `DataSourceUtils` | 4 (Volume) |
| `spring-orm` | `JpaTransactionManager`, exception translation, Hibernate support | 4, 6 (Volume) |
| `spring-web` | `RestTemplate`, `WebClient`, URI builders | 5 (Volume) |
| `spring-webmvc` | `DispatcherServlet`, `@RequestMapping`, the whole MVC stack | 5 (Volume) |
| `spring-webflux` | Reactive web stack | 10 (Volume) |
| `spring-test` | `MockMvc`, test context framework | 9 (Volume) |

`@Transactional` living in `spring-tx` rather than `spring-context` surprises people. So does
`@Component` (in `spring-context`, not `spring-beans`) and `@Async` (`spring-context`, but
the actual async executor is `spring-context`'s `TaskExecutor` abstraction). Knowing these
boundaries tells you what a minimal `spring-core`-only application can even do.

#### Common Mistakes

- Describing Spring as a persistence or web framework rather than a container that adapts
  them — it leads to questions you can't answer about who owns the connection pool.
- Claiming `BeanFactory` and `ApplicationContext` are "basically the same" — they differ by
  seven enterprise service interfaces, and the difference is the question.
- Using "IoC" and "DI" as interchangeable terms in an interview when the interviewer is
  specifically testing whether you know DI is a *technique* for achieving IoC.
- Assuming `@Autowired` is "reflection" and nothing more. It's reflection, wrapped in a
  candidate-resolution algorithm with priority ordering, qualifier matching, and a
  three-level cache. "It's reflection" is the answer that scores zero.

#### Interview Questions — Spring Architecture

**Q1. What is Spring, in one sentence that isn't "an IoC container"?** `TRICKY`

A container that owns object construction, wiring, lifecycle, and cross-cutting
interception, plus the integration layers (transactions, persistence, web) built on top of
it — the interception is what makes `@Transactional` and `@PreAuthorize` work, and why they
fail silently when the proxy isn't in the call path.

**Q2. What's the actual difference between `BeanFactory` and `ApplicationContext`?**
`TRICKY`

`ApplicationContext` extends `BeanFactory` with enterprise services: bean discovery and
listing, `MessageSource` for i18n, resource loading, event publishing, `Environment` access,
`BeanPostProcessor` registration, and closeable lifecycle. `BeanFactory` alone just creates
and returns beans.

**Q3. Is DI the same thing as IoC?** `TRICKY`

No — IoC is the principle (the container controls construction and lifecycle), DI is one
technique for achieving it. Template Method, Strategy, and event listeners are all IoC
without DI. A senior answer names the relationship in that direction.

**Q4. Why is constructor injection preferred over field injection, and when would you still
use field injection?**

Constructor injection makes the dependency explicit, makes the class immutable and
unit-testable without a context, and fails fast at construction rather than at first use.
Field injection survives only for genuine laziness — circular references, or an optional
integration that must not block startup — and Spring Boot 2.6+ rejects circular references by
default precisely because field injection was hiding them.

**Q5. Which Spring module provides `@Transactional`, and why does the answer matter?**

`spring-tx`, not `spring-context`. It matters because it shows you the module boundaries:
you can use `spring-core` and `spring-beans` without pulling in transaction management, and
`@Async`/`@Scheduled` live in `spring-context` because they're container concerns, not
framework concerns.

**Q6. A team is migrating a 4,000-bean XML application to Java config. What's the staff-level
plan?** `STAFF`

Don't hand-convert. Let component scanning absorb the `<bean>` declarations that are plain
services, keep explicit `@Bean` methods only for the ones that genuinely need runtime
wiring, and treat the first full compile as an incident-prevention project — most of the
value is that typos become compile errors. Budget for the long tail: a small number of
beans with circular or conditional dependencies will be where the migration actually
stalls, and those need design decisions rather than translation.

**Q7. What breaks at the seams between Spring's own layers that you'd want to know about in
production?** `STAFF`

Layered proxies: `@Transactional` on a method called from inside the same class doesn't
apply. Context boundaries: a `RequestContextHolder` assumption breaks in an async or
scheduled thread. Bean lifecycle: a `@PostConstruct` that queries the database runs during
context refresh, before migrations have run. These are covered in detail in Volumes 2 through
4, and they are where the incidents live.

> **CHAPTER 1 SUMMARY**
>
> Spring is a container plus integration layers plus an annotation-based programming model.
> The container is the part everything else depends on: it owns construction, wiring,
> lifecycle and proxy interception, and that last one is the reason Spring's
> cross-cutting features fail silently rather than loudly. `BeanFactory` is the minimal
> container; `ApplicationContext` is the enterprise façade that adds event publishing,
> resource loading, i18n and environment access. The module boundaries — `@Component` in
> `spring-context`, `@Transactional` in `spring-tx` — are the map of what can be used with
> what, and knowing them is the difference between memorising the framework and reading it.

#### Further Reading

- [Spring Framework Reference — Core](https://docs.spring.io/spring-framework/reference/core.html) — the official entry point; the Core chapter is the whole container in about 60 pages.
- [Spring Framework Reference — Beans](https://docs.spring.io/spring-framework/reference/core/beans.html) — the authoritative container documentation, including the full lifecycle section.
- [Spring Annotated Controllers — Official Reference](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann.html) — the declaration model in full: `@Controller`, `@RequestMapping`, and the composition rules for mapping conditions.
- [Spring in Action, 6th edition](https://www.manning.com/books/spring-in-action-sixth-edition) — still the best book-length treatment of the container and the reasoning behind its conventions.
- [The Spring Framework GitHub Wiki](https://github.com/spring-projects/spring-framework/wiki) — design notes and historical context that never made it into the reference docs.

## Chapter 2 — Inversion of Control & Dependency Injection

### 2.1 The Three Injection Styles

```java
@Service
public class OrderService {

    // ── 1. CONSTRUCTOR ──────────────────────────────────────────
    private final PaymentClient payment;
    private final OrderRepository orders;

    public OrderService(PaymentClient payment, OrderRepository orders) {
        this.payment = payment;
        this.orders = orders;
    }

    // ── 2. SETTER ───────────────────────────────────────────────
    private NotificationClient notification;

    @Autowired
    public void setNotification(NotificationClient notification) {
        this.notification = notification;
    }

    // ── 3. FIELD ────────────────────────────────────────────────
    @Autowired
    private AuditClient audit;   // do not do this
}
```

| | Constructor | Setter | Field |
| --- | --- | --- | --- |
| Object is immutable | Yes | No | No |
| Required vs optional deps | Naturally required | Naturally optional | Ambiguous |
| Circular references | Impossible | Works | Works |
| Fails when? | At construction (fail-fast) | At first use | At first use |
| Null-safe by default | Yes (`final`) | No | No |
| `final` fields usable | Yes | No | No |
| Unit test without Spring | Trivial | Trivial | Requires reflection or `@InjectMocks` |
| Spring's recommendation | **Default** | Optional dependencies only | Discouraged; rejected for cycles since Boot 2.6 |

> **MUST REMEMBER**
>
> Constructor injection is the default, not because it's stylistically purer but for three
> concrete reasons: (1) `final` fields are required to be safe under JMM safe publication
> before Spring 5's `@Nullable` handling improved — the real issue is that a non-final field
> written by the container is only safely visible because the container synchronises, and
> that's a property you don't want to depend on; (2) required dependencies cannot be
> accidentally absent; (3) the object is constructible outside Spring, which is what makes
> unit testing free.

#### Why Field Injection Is Actively Risky

Beyond style, field injection has three concrete production consequences:

```java
@Service
public class OrderService {

    @Autowired
    private OrderRepository orders;      // null until after construction

    public OrderService() {
        // "orders" is null here.
        this.ids = new ArrayList<>();
    }
}
```

1. **Anything in the constructor sees `null`.** Not a style nit — a real `NullPointerException`
   for any constructor that touches the field.
2. **The dependency is invisible.** `new OrderService()` compiles. A code reviewer must read
   the body to discover that the class needs a repository. This is why constructor injection
   shows up in design discussions and field injection doesn't.
3. **It masks circular references.** Field injection is the only style where two beans can
   genuinely depend on each other, because construction completes before either is populated.
   That's not a feature — it's the mechanism by which the circular-dependency trap in
   Chapter 2 of Volume 2 stays invisible until someone tightens a scope.

> **INTERVIEW TRAP**
>
> `@Autowired` on a field is a common answer for "why is my field null?" — the real answer is
> that the bean was constructed through a path that bypassed injection (a `new` keyword, a
> static factory, a `@Configuration` method that called `new` instead of returning the bean,
> or a self-invocation of a proxied method). Field injection makes all of these compile
> happily, so the failure is deferred to runtime.

### 2.2 How `@Autowired` Actually Resolves

This is the highest-value algorithm in the container and the one most often hand-waved as
"it uses reflection". The real sequence, for a field or setter:

```text
1. Gather candidates
   └─ find all beans whose type is assignable to the dependency type
      (for a generic type like List<Foo>, find beans assignable to Foo)

2. If none → NoSuchBeanDefinitionException
   (or null, if the parameter/field is @Nullable or Optional<T>)

3. Filter by @Qualifier
   └─ keep only candidates whose bean name or qualifier matches
   └─ if any remain, those are the only candidates

4. If multiple remain:
   a. Look for exactly one @Primary
   b. Else look for the highest @Priority
   c. Else fall back to a NAME MATCH against the field/parameter name
      (e.g. field `paymentGateway` → bean named "paymentGateway")
   d. Else → NoUniqueBeanDefinitionException
```

```java
@Service("stripeClient")
class StripePaymentClient implements PaymentClient { }

@Service("paypalClient")
class PayPalPaymentClient implements PaymentClient { }

@Service
class LegacyPaymentClient implements PaymentClient { }

@Service
public class CheckoutService {

    @Autowired
    @Qualifier("stripeClient")
    private PaymentClient preferred;          // explicit — no ambiguity

    @Autowired
    private PaymentClient primaryOne;          // resolves to LegacyPaymentClient (@Primary)

    @Autowired
    private PayPalPaymentClient named;        // unambiguous by type

    @Autowired
    private List<PaymentClient> allClients;   // ALL FOUR beans, injected as a list
}
```

The last line is the one people don't know and interviewers love. Spring resolves collection
and `Map` injection points specially:

| Injection point type | What you get |
| --- | --- |
| `PaymentClient` | Exactly one bean, resolved by the algorithm above |
| `List<PaymentClient>` | All beans assignable to `PaymentClient`, in registration order |
| `Set<PaymentClient>` | All beans, de-duplicated |
| `Collection<PaymentClient>` | All beans |
| `Map<String, PaymentClient>` | All beans, keyed by bean name |
| `Optional<PaymentClient>` | The resolved bean, or `Optional.empty()` if none exists |
| `Stream<PaymentClient>` | All beans as a stream (auto-closed at context shutdown) |

```java
// The "no-op if nothing configured" pattern — a legitimate and underused feature:
private final List<SearchIndexer> indexers;

public SearchService(SearchIndexer... indexers) {   // varargs = array = collect-all
    this.indexers = List.of(indexers);
}

// or
public SearchService(Optional<SearchIndexer> indexer) {
    this.indexer = indexer.orElse(NOOP_INDEXER);
}
```

> **PRODUCTION RELEVANCE**
>
> `Optional<T>` and collect-all injection are how you make third-party integrations
> *optionally* present without `if (x != null)` scattered through the code. In a codebase
> that has eight optional integrations, the difference between that and null checks is the
> difference between a new integration being a 20-line change and a 200-line change.

### 2.3 What Counts as a "Type"

Spring's type matching handles far more than exact class equality:

```java
// 1. Assignability — a bean of any subtype matches
@Autowired private ObjectProvider<Repository> repos;   // all repositories

// 2. GENERICS — Spring resolves the type argument, which surprises people
public interface ShippingClient {}
public class FedExClient implements ShippingClient { }

@Autowired private List<ShippingClient> clients;   // ONLY FedExClient, not List<ObjectClient>

// 3. @Qualifier narrows the generic match
public class FedExClient implements ShippingClient { }
public class UpsClient implements ShippingClient { }

@Autowired
@Qualifier("fedex")
private List<ShippingClient> clients;   // only the FedEx bean

// 4. Generics on the BEAN side work too
@Configuration
class FedExConfig {
    @Bean
    public FedExClient fedExClient() { ... }
}
// An injection point of List<FedExClient> matches only the FedExClient bean definition.
```

Generic matching works because the bean definition records the resolved return type of the
`@Bean` method. It also has a sharp edge: **generics are erased at runtime**, so if a proxy
is created (JDK dynamic proxy, `@Transactional`), the resolved type can be the interface, and
a generic injection point that expected a concrete class will not match. This is one of the
reasons Spring prefers class-based proxies in several places.

> **SCALING REALITY CHECK**
>
> Bean type resolution is not free. `getBeansOfType()` with a non-trivial type walks the
> entire bean definition registry and, for unresolvable types, loads classes to read their
> hierarchy. In an application with thousands of beans, calling `getBeanNamesForType(SomeClass.class)`
> on a hot path or in a loop is a genuine performance bug — it's O(bean count) per call.
> Cache the list at startup, or inject the collection once and let the container resolve it.

### 2.4 Ambiguity, `@Primary`, `@Qualifier`, and `@Priority`

Four beans of one type produce this:

```text
org.springframework.beans.factory.NoUniqueBeanDefinitionException:
  expected single matching bean but found 4:
    - stripeClient
    - paypalClient
    - legacyClient
    - mockClient
```

Three ways out, and the order you should reach for them is not arbitrary:

| Mechanism | Scope | When |
| --- | --- | --- |
| `@Qualifier` | One injection point | The default choice. It's local and explicit. |
| `@Primary` | One bean, globally | When one implementation is the intended default everywhere |
| `matchesBeanName` fallback | Automatic | Field named `stripeClient` finds bean `stripeClient` |
| `ObjectProvider<T>` | One injection point | Optional dependency, resolved lazily |

```java
@Service
@Primary                                  // the default everywhere
class CardPaymentClient implements PaymentClient { }

@Service
class BankTransferClient implements PaymentClient { }

@Service
public class CheckoutService {

    @Autowired
    private PaymentClient defaultClient;   // CardPaymentClient, via @Primary

    @Autowired
    @Qualifier("bankTransferClient")
    private PaymentClient forRefunds;      // explicit — unaffected by @Primary
}
```

> **STAFF-LEVEL CONSIDERATION**
>
> `@Primary` is a global decision made in one class and obeyed everywhere. It is the right
> tool when one implementation genuinely is the default, and the wrong tool when two
> implementations are each correct in different contexts — because then the default silently
> leaks into the call sites nobody reviewed. The pattern that holds up: `@Primary` for the
> real default, `@Qualifier` everywhere else, and a convention that a `PaymentClient` with
> no qualifier is a code-review comment waiting to happen. At larger scale, the cleaner move
> is to delete one of the implementations or split the interface, not to add another
> qualifier.

### 2.5 `@Value` and SpEL

`@Value` resolves a property, optionally through the Spring Expression Language:

```java
@Value("${payment.gateway.url}")
private String gatewayUrl;

@Value("${payment.timeout-ms:5000}")
private long timeout;                       // default after the colon

@Value("#{systemProperties['user.timezone']}")
private String timezone;

@Value("#{@environment.getProperty('app.name')}")
private String appName;                     // bean reference via @beanName

@Value("#{'${order.limit:100}' * 2}")
private int effectiveLimit;                 // SpEL arithmetic on a property

@Value("#{T(java.time.LocalDate).parse('${launch.date}')}")
private LocalDate launchDate;               // static method call
```

The full SpEL syntax is large, and the useful subset is small. Knowing these six gets you
almost everything:

| Form | Evaluates to |
| --- | --- |
| `${property:default}` | Property lookup against the `Environment` (Chapter 7) |
| `#{expression}` | SpEL expression |
| `#{@beanName.method()}` | Call a method on another bean |
| `#{@beanName.field}` | Read a field on another bean |
| `#{T(com.example.Type).CONSTANT}` | Reference a type, then a static field |
| `#root`, `#this` | The current object, inside a SpEL evaluation context |

> **INTERVIEW TRAP — `@Value` vs `@ConfigurationProperties`**
>
> `@Value` is for pulling in a handful of individual values. `@ConfigurationProperties` is for
> binding a group of related values to a typed object, with validation, defaults, relaxed
> binding, and IDE completion. A senior answer treats `@Value` as the tool you reach for when
> there's exactly one value, and flags using it for a group of related settings as a
> maintainability problem — because the values become a scattered set of string literals
> spread across the codebase with no way to enumerate them, and no way to validate them
> together. Volume 7 covers the binding side in depth.
>
> A harder version of this question: `@Value` fields cannot participate in constructor
> injection ordering reliably, cannot be used for final fields, and SpEL in `@Value` is
> evaluated during bean creation — so a `@Value("#{@someBean.doWork()}")` creates a startup
> ordering constraint that fails with a `BeanCurrentlyInCreationException` you have to debug
> without a stack trace pointing at the annotation.

#### Common Mistakes

- Assuming `@Autowired` is "just reflection" rather than describing the candidate → qualifier
  → primary → priority → name-match algorithm, which is the actual question.
- Believing `@Autowired` on a field is equivalent to constructor injection. It isn't:
  visibility rules, ordering guarantees and cycle handling all differ.
- Expecting `List<InterfaceType>` to contain beans of every type — generics ARE resolved, so
  it only contains matching subtypes. This surprises people constantly with repositories.
- Using `@Primary` to resolve a local ambiguity instead of `@Qualifier`, creating a global
  default as a side effect of a local problem.
- Injecting `ApplicationContext` or `BeanFactory` directly into business code. It works, it
  is a service locator, and it makes the class untestable and its dependencies invisible.
  The legitimate exception is `ObjectProvider<T>` for genuinely optional or lazy resolution.

#### Interview Questions — Dependency Injection

**Q1. Walk me through what `@Autowired` actually does.** `STAFF`

Find all beans assignable to the type, using generics resolution where the injection point is
parameterised. Filter by `@Qualifier` if any is specified. If multiple remain, prefer exactly
one `@Primary`, else the highest `@Priority`, else a fallback match against the field or
parameter name, else fail with `NoUniqueBeanDefinitionException`. If the point is `Optional`
or `@Nullable`, absence yields empty rather than an exception. Collection, `Map` and `Stream`
injection points skip the disambiguation step and receive all matches.

**Q2. A team uses field injection everywhere. Make the case for constructor injection to an
engineering manager who has never had a Spring incident.** `STAFF`

Three concrete wins, not style. First, the class becomes unit-testable with a plain `new` and
no Spring context — a 4000-bean context takes seconds to start, and field injection forces
that cost into every test. Second, `final` fields are safe under safe publication, so
dependency-injected state doesn't depend on the container's synchronisation. Third, a
circular dependency is impossible, so the failure moves from production to compile time.
The migration cost is real but bounded — IDE-assisted refactoring, and a compile per module.

**Q3. You have four beans of type `PaymentClient` and none is marked `@Primary`. What are
your options, in order of preference?** `TRICKY`

`@Qualifier` on the injection point (local, explicit, no global effect); then renaming the
field or parameter to match a bean name if that's genuinely what the code means; then
`ObjectProvider<PaymentClient>` for a genuinely optional dependency; and only if two
implementations are each correct in different contexts, `@Primary` for the real default. If
none of those read naturally, the honest answer is that four implementations of one interface
is a modelling problem — split the interface.

**Q4. Why does `List<Foo>` injection only pick up beans assignable to `Foo`, and what's the
failure mode?** `TRICKY`

Spring resolves generic type arguments on the injection point against the declared return
type of each `@Bean` method. The failure mode is that when a bean is proxied, its resolved
type can widen to the interface, so a generic injection point expecting a concrete class
silently matches nothing rather than erroring.

**Q5. When is injecting `ApplicationContext` into a class the right call?**

For a genuine service locator — optional integration discovery, multi-tenant resolution where
the tenant determines which implementation to use, or plugin lookup. It's the right call
when the dependency graph genuinely cannot be determined at construction. It's the wrong call
when someone wanted to avoid a constructor with 11 parameters, because the fix for that is a
facade object, not a service locator.

**Q6. Your application has 4,000 beans and takes 40 seconds to start in CI. Where do you
look first, and what would you not do?** `STAFF`

First: component scanning breadth (is it scanning `com` instead of the module packages), and
unnecessary eager initialisation — a bean that hits the network or the database in
`@PostConstruct` or a `@Bean` method is almost always the cost. Then: `@Lazy` on genuinely
lazy infrastructure, `spring.main.lazy-initialization` as a diagnostic (not a fix, it moves
the cost to first request), and the classpath count. What I would not do is disable the
context cache or add `-XX:TieredStopAtLevel=1` and call it done — those make a number look
better without making the application better. The real fix is almost always "something is
being initialised eagerly that shouldn't be."

**Q7. `@Value` or `@ConfigurationProperties`?**

`@Value` for an isolated value. `@ConfigurationProperties` for a group of related settings —
it gives typed binding with relaxed naming, defaults, JSR-380 validation, and a single
auditable object listing everything configurable. Use SpEL inside `@Value` only for computed
values, and be aware it evaluates during bean creation, so a `@Value("#{@bean.m()}")`
creates a hidden startup ordering dependency.

> **CHAPTER 2 SUMMARY**
>
> Dependency injection is not "reflection" — it's a four-step candidate resolution:
> find by type (with generics), filter by `@Qualifier`, disambiguate by `@Primary` then
> `@Priority` then field name, and fail loudly if nothing is unique. Constructor injection
> is the default because it makes required dependencies real, makes objects immutable, and
> makes the class constructible without Spring — which is what makes unit testing free.
> Field injection survives only for genuine laziness, and it is the mechanism that keeps
> circular dependencies invisible. The `List<T>` / `Map<String,T>` / `Optional<T>` injection
> forms are underused and are the clean way to make integrations optional.

#### Further Reading

- [Spring Framework Reference — Annotation-Based Container Configuration](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html) — the official description of the resolution algorithm, including the table of what each injection point type resolves to.
- [Baeldung — Constructor Injection in Spring](https://www.baeldung.com/constructor-injection-in-spring) — the practical case for constructor injection, with the circular-dependency failure it avoids shown concretely.
- [Spring Framework Reference — Qualifiers and Primary](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired-primary.html) — `@Qualifier`, `@Primary`, custom qualifiers, and `@Priority` ordering in one page.
- [Baeldung — Spring Dependency Injection](https://www.baeldung.com/spring-dependency-injection) — practical examples of each injection form, useful for filling in syntax quickly.

## Chapter 3 — Bean Definitions & the Container Internals

### 3.1 The Refresh Sequence — How a Context Actually Starts

Before any bean exists, the container runs `AbstractApplicationContext.refresh()`. This is
the single most useful thing to understand about the container, because almost every
"why did my bean do X at startup" question is answered by knowing which phase X happened in.

```text
ApplicationContext.refresh()
 │
 ├─ 1. prepareRefresh() ........... set startup time, init property sources, env events
 ├─ 2. obtainFreshBeanFactory() ... create & load the BeanFactory
 ├─ 3. prepareBeanFactory() ....... set ClassLoader, SpEL, register resolvers
 ├─ 4. postProcessBeanFactory() ... apply BeanFactoryPostProcessors  ◄── PHASE 1
 ├─ 5. registerBeanPostProcessors() register BeanPostProcessors        ◄── PHASE 2
 ├─ 6. initMessageSource() ........ MessageSource i18n
 ├─ 7. initApplicationEventMulticaster() ... the event bus
 ├─ 8. onRefresh() ................ subclass hook (ServletWebServerApplicationContext
 │                                   starts Tomcat HERE)
 ├─ 9. registerListeners() ........ add ApplicationListener beans
 ├─ 10. finishBeanFactoryInitialization() ── instantiate all non-lazy singletons
 │                                        ◄── PHASE 3 — your @PostConstruct runs here
 ├─ 11. finishRefresh() ........... publish ContextRefreshedEvent, init Lifecycle
 └─ 12. destroyBeans() / close() .. on shutdown, run destruction callbacks
```

The three phases that matter most in production:

> **MUST REMEMBER**
>
> **Phase 1 — `BeanFactoryPostProcessor`**: changes the *definitions* (before any bean exists).
> **Phase 2 — `BeanPostProcessor`**: registered early, then applied to every bean as it is
> created. **Phase 3 — bean instantiation**: where your `@PostConstruct`, `@PostConstruct`
> on `@Bean` methods, and InitializingBean callbacks actually run.
>
> The single most common production surprise falls out of this: a `@PostConstruct` or an
> eagerly-scoped `@Bean` method that queries the database runs at phase 10, during context
> refresh — before your application's own migrations have run, and before the embedded
> web server is fully ready in some setups. If the table doesn't exist yet, startup fails
> with a `BeanCreationException` whose cause is buried three frames deep.

### 3.2 `BeanDefinition` — The Real Object

Beans are not objects in the container. Beans are **`BeanDefinition` objects** — metadata that
says how to make one. This distinction is the reason the container can be lazy, can reconfigure
itself, and can answer "what beans exist?" before instantiating anything.

```java
public interface BeanDefinition extends AttributeAccessor, BeanMetadataElement {

    String getBeanClassName();                 // often a STRING until resolution
    void setBeanClassName(String className);

    int SCOPE_SINGLETON = 0;
    int SCOPE_PROTOTYPE = 1;
    int getScope();

    boolean isLazy();                          // don't create at startup
    boolean isSingleton();

    boolean isAutowireCandidate();
    int getAutowireMode();                     // byType, byName, constructor, no

    String[] getDependsOn();                   // explicit ordering
    boolean isDependsOn();                     // "all getBean() must happen first"
    String getFactoryBeanName();               // FactoryBean producing this bean
    String getFactoryMethodName();
    String getInitMethodName();
    String getDestroyMethodName();
    int getRole();                             // APPLICATION vs INFRASTRUCTURE

    // The parent's overrides, merged in
    BeanDefinition getOriginatingBeanDefinition();
    void setOriginatingBeanDefinition(BeanDefinition orig);

    MutablePropertyValues getPropertyValues(); // <constructor-args/>
    ConstructorArgumentValues getConstructorArgumentValues();
}
```

A `GenericApplicationContext` with a few beans registered gives you the whole picture:

```java
var context = new AnnotationConfigApplicationContext();
context.register(MyConfig.class);
context.refresh();

for (String name : context.getBeanDefinitionNames()) {
    var bd = context.getBeanFactory().getBeanDefinition(name);
    System.out.printf("%-30s scope=%-10s lazy=%s factory=%s%n",
        name, bd.getScope(), bd.isLazy(), bd.getFactoryMethodName());
}
```

Typical output:

```text
auditService                   scope=singleton   lazy=false factory=null
dataSource                     scope=singleton   lazy=false factory=dataSource
orderRepository                scope=singleton   lazy=false factory=orderRepository
requestMetrics                 scope=prototype   lazy=true  factory=requestMetrics
```

> **PRODUCTION RELEVANCE**
>
> The `role` field (`ROLE_APPLICATION` vs `ROLE_INFRASTRUCTURE`) is what lets tooling exclude
> framework beans when someone asks "what does this application actually define?" — the
> `ConditionEvaluationReport`, actuator's `/beans` endpoint, and most bean-listing utilities
> filter on it. When a codebase has 4,000 beans and 3,900 are Spring's own, that filter is the
> difference between a useful listing and an unusable one.

### 3.3 Instantiation — How an Object Is Actually Made

```text
Instantiation
    │
    ├─ Supplier<T> .............. if a supplier is set, call get()
    │
    ├─ static factory method .... if factoryMethodName is set, invoke it
    │
    └─ constructor  ───────────── the normal case
         │
         ├─ 0-arg preferred
         ├─ single-arg constructor: ambiguity resolved by
         │     @Autowired on the constructor
         │     → if >1 candidate, must have @Autowired
         │     → if exactly 1 candidate, no annotation needed
         │     → if 0 candidates, looks for a no-arg constructor
         └─ multiple constructors: the @Autowired one is chosen
```

The single-argument-constructor rule is a genuine interview favourite and a genuine source of
production confusion:

```java
@Component
class ReportRenderer {
    ReportRenderer(Clock clock) { }   // one arg, no @Autowired
}
```

The container finds exactly one candidate for `Clock` and injects it — **no annotation
needed**. But add a second `Clock` bean:

```java
@Component
class ReportRenderer {
    ReportRenderer(Clock clock) { }   // NOW: 2 candidates, still no @Autowired
}
// → BeanCreationException: no default constructor found / constructor not autowirable
```

The rule: **a single-argument constructor is only auto-selected while it remains
unambiguous.** Adding a bean anywhere in the application can break it at runtime, in a file
nobody touched. This is a genuine argument for explicit `@Autowired` on the constructor even
when it isn't strictly required.

> **INTERVIEW TRAP**
>
> The reflexive bad answer is "Spring injects by constructor if there's only one, otherwise
> by setter." Setter injection is a *fallback for properties*, never for constructor
> dependencies, and it only happens on a bean that has an instantiable no-arg constructor. The
> real subtlety people miss is the single-argument-constructor ambiguity rule above — the case
> that breaks on a Friday when a teammate adds a `Clock` bean three packages away.

### 3.4 `BeanFactory` in Practice

You rarely touch `BeanFactory` directly, but you should recognise it:

```java
// Plain container, no enterprise services — used in tests and embedded scenarios
var factory = new DefaultListableBeanFactory();
factory.registerSingleton("clock", Clock.systemUTC());
factory.registerSingleton("renderer", new ReportRenderer((Clock) factory.getBean("clock")));

// The provider — the DI-friendly lookup that doesn't force instantiation
ObjectProvider<OrderRepository> provider = context.getBeanProvider(OrderRepository.class);

OrderRepository repo = provider.getObject();          // create now
OrderRepository lazy = provider.getIfAvailable();    // or null
OrderRepository fallback = provider.getIfUnique();   // or null if 0 OR >1

// Stream every bean of a type — resolved lazily, closed with the context
try (Stream<OrderRepository> all = provider.stream()) {
    all.forEach(this::register);
}
```

`ObjectProvider<T>` is the API that makes lazy resolution safe and is the correct answer to
"how do I make this optional without null checks?" — `getIfAvailable()`, `getIfUnique()`, and
`orderedStream()` (respecting `@Order`) cover the practical cases.

#### Common Mistakes

- Confusing a bean with a `BeanDefinition` — beans are metadata; the object is created from it.
- Assuming beans are created in declaration order. There is no guaranteed order. Use
  `@DependsOn`, `@Order`, or constructor injection (which forces resolution order) when you
  need one.
- Putting initialisation work that talks to the network or database in `@PostConstruct` or an
  eagerly-scoped `@Bean` method. That runs during `finishBeanFactoryInitialization()`.
- Relying on an unannotated single-argument constructor staying unambiguous. Adding a second
  candidate bean anywhere breaks it at runtime.
- Looking up beans with `context.getBean(...)` from business code. It works, it is a service
  locator, and it hides the dependency from every tool that reads your code.

#### Interview Questions — Container Internals

**Q1. Explain `refresh()` and why the phase order matters.** `STAFF`

It runs: property preparation → BeanFactory creation → `BeanFactoryPostProcessor`s (phase 1,
modifying definitions) → `BeanPostProcessor` registration (phase 2) → event multicaster and
subclass refresh (ServletWebServerApplicationContext starts Tomcat here) → listener
registration → instantiation of all non-lazy singletons (phase 3, where `@PostConstruct` and
initialisation callbacks run) → `ContextRefreshedEvent`. The order matters because a
`BeanPostProcessor` must be registered before any bean is created in order to be applied to
it, and because anything that needs the full container must run after phase 3.

**Q2. What is a `BeanDefinition`, and why is the bean class often a `String`?** `TRICKY`

It's the container's metadata record for a bean — class name, scope, lazy flag, property
values, constructor arguments, autowire mode, `dependsOn`, init/destroy method names, and
role. The class is held as a `String` so that the class doesn't have to be loaded to register
or even instantiate beans, which is what makes lazy and non-lazy paths possible and keeps
startup from eagerly loading every class in the classpath.

**Q3. When does a single-argument constructor get autowired without `@Autowired`, and what
breaks it?** `TRICKY`

When there is exactly one candidate bean for that type, a single-argument constructor is
auto-selected. It breaks the moment a second candidate exists anywhere in the context — the
container can no longer disambiguate and the bean fails to create, in a file nobody edited.
Mark such constructors `@Autowired` explicitly.

**Q4. A team's context takes 40 seconds to refresh. Name the four things to look for.** `STAFF`

Component scanning breadth (scanning a root package rather than module packages); beans that
do I/O in `@PostConstruct` or `@Bean` methods — a cache warm, a remote config fetch, a schema
check; classpath breadth, since type resolution loads classes; and unnecessary eager
singletons that could be lazy. I would also check whether something registers a
`BeanFactoryPostProcessor` that scans the classpath. I would not "fix" it with
`spring.main.lazy-initialization` as a permanent measure — that just moves cost to the first
request and converts a slow startup into a slow first request per endpoint.

**Q5. When is a `BeanFactory` the right thing to reach for instead of an
`ApplicationContext`?**

In a library, a test, or an embedded scenario where you want bean creation and dependency
injection without internationalisation, event publishing, or resource loading overhead. It
is also the right abstraction in code that only needs lookup — you depend on the narrower
interface and stay testable.

**Q6. How would you find out what beans actually exist at runtime, and how would you exclude
the 3,900 that Spring contributed?**

`applicationContext.getBeanDefinitionNames()`, then read each
`getBeanDefinitionFactoryName` and `getRole()` from the factory — infrastructure-role beans
are the framework's. The Actuator `/beans` endpoint does this over HTTP, and the
`ConditionEvaluationReport` gives the same class of information for auto-configuration.

> **CHAPTER 3 SUMMARY**
>
> Beans are `BeanDefinition` metadata, not objects, and the class name is a string until
> resolution — which is what makes the container lazy-capable and re-configurable.
> `refresh()` is a strict phase order: definition-modifying `BeanFactoryPostProcessor`s,
> then `BeanPostProcessor` registration, then actual singleton instantiation. Everything
> that surprises people at startup — a `@PostConstruct` hitting a not-yet-migrated database,
> a bean that appears in the wrong order — traces back to a specific phase. The subtle rule
> worth memorising is that a single-argument constructor is auto-wired only while it remains
> unambiguous, so adding an unrelated bean somewhere can break a class nobody touched.

#### Further Reading

- [Spring Framework Reference — Beans](https://docs.spring.io/spring-framework/reference/core/beans.html) — the container reference; the `BeanPostProcessor` and lifecycle sections are the highest-value pages in all of Spring.
- [Spring Framework Reference — Annotation Config](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html) — the companion page covering constructor selection, `@Bean` methods, and configuration class processing.
- [Source: `AbstractApplicationContext.refresh()`](https://github.com/spring-projects/spring-framework/blob/main/spring-context/src/main/java/org/springframework/context/support/AbstractApplicationContext.java) — the real implementation, with comments; the fastest way to settle a "what order does this happen in" question.

## Chapter 4 — Component Scanning & Stereotype Annotations

### 4.1 The `@Component` Family

```text
@Component                      (meta-annotated with @Indexed — the root)
     │
     ├── @Service               no additional behaviour — SEMANTIC ONLY
     ├── @Repository            + PersistentExceptionTranslationPostProcessor
     │                              → translates JPA/Hibernate exceptions into
     │                                Spring's DataAccessException hierarchy
     └── @Controller            + registered as a handler in the MVC layer
                                    (and implies @ResponseBody when combined → @RestController)
```

```java
@Repository                       // ← the one with actual behaviour
public class OrderRepository {
    // Any RuntimeException thrown out of this bean's methods is passed through
    // PersistenceExceptionTranslationPostProcessor, which converts vendor-specific
    // exceptions (Hibernate's, JDBC's) into Spring's DataAccessException hierarchy.
    //
    // Practically: callers can catch DataAccessException / OptimisticLockingFailureException
    // without a compile-time dependency on Hibernate.
}
```

This is the most important thing to know about the `@Component` family, and it's routinely
stated as "they're all the same, just semantic." **They are not all the same.** `@Repository`
buys you exception translation; `@Controller` buys you MVC handler registration; `@Service`
buys you nothing at all.

> **INTERVIEW TRAP**
>
> "The stereotype annotations are semantic only" is the standard answer, and it's wrong for
> two of the four. `@Repository` triggers `PersistenceExceptionTranslationPostProcessor`,
> which is a real behavioural difference you can write a test for. `@Controller` is what makes
> `RequestMappingHandlerMapping` pick the class up. Getting this wrong in an interview costs
> you the point that distinguishes someone who has debugged a stack trace from someone who has
> only configured Spring.

### 4.2 Scanning Mechanics

```java
@SpringBootApplication   // = @SpringBootConfiguration + @EnableAutoConfiguration + @ComponentScan
public class Application { }

@ComponentScan("com.acme.billing")   // where to look for @Component and friends
@Configuration
public class AppConfig { }
```

`@ComponentScan` uses ASM metadata reading, not class loading, to find candidates — which is
why a broad scan is faster than it looks but still not free.

**`@ComponentScan` has four attributes that matter:**

| Attribute | Purpose | Staff-level note |
| --- | --- | --- |
| `basePackages` | Which packages to scan | Scanning `com` in a large org is a genuine startup cost; scan the module's own package |
| `useDefaultFilters` | Include `@Component` etc. | Turning this off and using `includeFilters` is how you scan for a `@Configuration`-less library |
| `includeFilters` | Additional types to pick up | `AnnotationTypeFilter`, `AssignableTypeFilter`, `RegexPatternFilter` |
| `excludeFilters` | Types to skip | How every auto-configuration rule is expressed under the hood |
| `lazyInit` | Don't eagerly instantiate | Diagnostic, not a fix |

**Filters exist because third-party libraries need to be scanned without being
component-scanned.** This is the standard pattern for publishing a starter:

```java
// In your library — register your beans explicitly
@Configuration
@Import(OrderServiceAutoConfiguration.class)
public class MyLibraryConfiguration { }
```

> **SCALING REALITY CHECK**
>
> `basePackages = "com"` in a 500-developer monorepo where every team has a `com.acme.*`
> package means the container does an ASM-level scan of every class on the classpath, on
> every module. In a monorepo that produces a build that takes 90 seconds and an application
> context that registers beans from libraries you never meant to include. Scan the module's
> own base package. In a modular monolith this is the difference between a 5-second and a
> 60-second startup, and it's a one-line fix that teams routinely ship without making.

### 4.3 `@Configuration` — Why It Needs CGLIB

```java
@Configuration
public class AppConfig {

    @Bean
    public DataSource dataSource() { return new HikariDataSource(cfg); }

    @Bean
    public OrderRepository orderRepository(DataSource ds) {
        return new JdbcOrderRepository(ds);      // calls the @Bean METHOD, not new DataSource()
    }
}
```

The second method calls `dataSource()`. Without help, that would construct a **second,
separate** `DataSource` — because a Java method call is a method call.

So `@Configuration` makes Spring do something unusual: it **subclasses your configuration
class with CGLIB** and overrides every `@Bean` method so that calling it returns the
container-managed singleton from the bean factory instead of constructing a new object.
This is called **full mode**, and it's why:

- Intra-configuration calls are intercepted and return the same bean
- You get a different `DataSource` instance per call without this
- `proxyBeanMethods = false` is a legitimate and common optimisation

```java
@Configuration(proxyBeanMethods = false)   // "lite mode" — the common default now
public class AppConfig { }
```

| | `proxyBeanMethods = true` (default) | `proxyBeanMethods = false` (lite) |
| --- | --- | --- |
| Class enhanced by CGLIB | Yes | No |
| Intra-`@Bean` calls return the singleton | Yes | No — you get a new instance |
| Bean-definition processing | Full | Lite |
| Cost per `@Bean` call | Bean-factory lookup | Direct invocation |
| Use when | You call your own `@Bean` methods directly | You don't — the default choice for most config |

> **INTERVIEW TRAP**
>
> The near-universal claim that "`@Configuration` classes are proxied" hides the qualifier:
> full-mode CGLIB enhancement happens only when `proxyBeanMethods` is true (the default) AND
> the class is not final AND the methods are not final/private. Change either and you get
> lite mode silently. And in lite mode, calling your own `@Bean` method from another
> `@Bean` method produces a second, unmanaged instance — a real bug that appears when someone
> optimises `proxyBeanMethods` without checking for intra-config calls.

> **STAFF-LEVEL CONSIDERATION**
>
> `proxyBeanMethods = false` matters beyond micro-optimisation: it changes when a circular
> dependency between two `@Bean` methods is a hard failure. In full mode Spring defers the
> call until the bean is being created, so a cycle sometimes resolves; in lite mode the
> intra-config call happens immediately and the cycle fails at startup. Teams that flip this
> flag to "remove CGLIB noise" occasionally get a production-only cycle that only reproduces in
> the profile where the classes are both loaded.

### 4.4 `@Bean` Method Injection

`@Bean` methods have three distinct parameter-injection semantics, and confusing them is a
common source of surprise:

```java
@Configuration
public class Config {

    // 1. BY TYPE — Spring resolves it as a dependency
    @Bean
    public OrderRepository orderRepository(DataSource ds) { ... }

    // 2. WITH @Qualifier — narrows a multi-bean dependency
    @Bean
    public OrderRepository orderRepository(@Qualifier("replica") DataSource ds) { ... }

    // 3. PARAMETER METADATA — the annotation sits on the PARAMETER, not the method
    @Bean
    public AuditRepository auditRepository(@Qualifier("auditDb") JdbcTemplate t) { ... }
}
```

Note case 3: `@Qualifier` goes on the **parameter**. Putting it on the method declares a
qualifier *for the produced bean*, not for the parameter. This is a frequent source of an
ineffective qualifier that is silently ignored.

Also note the method-call difference:

```java
@Bean
public ObjectMapper objectMapper() {
    return new ObjectMapper().registerModule(new JavaTimeModule());
}

@Bean
public OrderController orderController() {
    return new OrderController(objectMapper());   // ← calls the method directly!
}
```

In **full mode** this is safe — CGLIB intercepts it and returns the singleton. In **lite
mode** it constructs a second `ObjectMapper`. Passing the bean as a *parameter* is safer in
both modes, and is the better habit even where the direct call works.

#### Common Mistakes

- Believing `@Service` and `@Repository` behave identically. `@Repository` adds exception
  translation; that's a behaviour, not a comment.
- Leaving a required dependency out of a constructor and defaulting it to `null` in the body.
  This is the field-injection failure mode wearing a constructor costume.
- Assuming `@ComponentScan` is free. A `basePackages = "com"` scan is a real cost in a large
  monorepo, and it's usually a mistake left over from a single-module origin.
- Flipping `proxyBeanMethods = false` without checking for intra-configuration `@Bean` calls.
- Putting `@Qualifier` on a `@Bean` method's *method* level expecting it to disambiguate the
  *parameter*. It disambiguates the produced bean instead.
- Using `@Component` on classes with constructor arguments that the container can't resolve
  "yet" and assuming ordering will sort it out. It won't.

#### Interview Questions — Scanning & Configuration

**Q1. What are `@Component`, `@Service`, `@Repository` and `@Controller`, and which one
actually changes behaviour?** `TRICKY`

All four are meta-annotated with `@Component` and are picked up by component scanning.
`@Repository` additionally triggers `PersistenceExceptionTranslationPostProcessor`, converting
vendor exceptions into Spring's `DataAccessException` hierarchy. `@Controller` registers the
class with `RequestMappingHandlerMapping`. `@Service` adds no behaviour — it's purely a
semantic marker for readers, and the honest thing to say is that its only real value is that
tooling and humans can tell you what a bean is for.

**Q2. Why does Spring need CGLIB for `@Configuration` classes?** `TRICKY`

So that calling one `@Bean` method from another returns the container-managed singleton
rather than constructing a second instance. Spring subclasses the configuration class and
overrides each `@Bean` method to delegate to the bean factory. With
`proxyBeanMethods = false` this enhancement is skipped — which is why an intra-configuration
call in lite mode produces a second, unmanaged object.

**Q3. `@Bean public AuditRepository repo(@Qualifier("auditDb") JdbcTemplate t)` — what does
that `@Qualifier` do?**

It qualifies the **parameter**, selecting the bean named (or qualified) `auditDb`. A
`@Qualifier` at the *method* level would instead put a qualifier on the produced bean, and
would not disambiguate the parameter at all.

**Q4. A monorepo module's Spring Boot app takes 75 seconds to start. What is the first thing
you check?**

`@ComponentScan` breadth. A `basePackages = "com"` in a monorepo with hundreds of `com.*`
packages makes the container scan every class on the classpath, and it's a one-line fix to
narrow the scan to the module's own package. After that, look for `@PostConstruct` and
eager `@Bean` methods doing I/O, then classpath breadth.

**Q5. When would you use `@ComponentScan` with `useDefaultFilters = false`?**

When you're building or consuming a library whose beans aren't annotated with `@Component` and
you don't control their source — you select them with `includeFilters` on an
`@AnnotationTypeFilter` or `AssignableTypeFilter`. This is exactly how auto-configuration
classes apply their `excludeFilters` and `includeFilters` under the hood.

**Q6. A bean needs two dependencies of the same interface, and one is only available in
production. How do you wire it without a null check?** `TRICKY`

`@Qualifier` for the production implementation and `ObjectProvider<T>` for the optional one,
resolved with `getIfAvailable()`. If a bean genuinely may be absent, prefer making it absent
explicitly at construction rather than leaving a field null and checking it at three call
sites — a constructor-time `ObjectProvider` makes the optionality visible and testable.

> **CHAPTER 4 SUMMARY**
>
> The stereotype family is not four names for one thing: `@Repository` buys exception
> translation and `@Controller` buys MVC handler registration, while `@Service` is purely a
> marker — the popular "they're all just semantic" answer is wrong for two of the four.
> `@ComponentScan` does real work and scanning `com` in a monorepo is a genuine, fixable
> startup cost. And `@Configuration` exists in full mode for exactly one reason: CGLIB
> interception so an intra-config `@Bean` call returns the singleton rather than building a
> second object — which means `proxyBeanMethods = false` is not a free optimisation.

#### Further Reading

- [Spring Framework Reference — Annotation-Based Container Configuration](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html) — `@Bean`, `@Configuration` processing, and the lifecycle of configuration classes.
- [Spring Framework Reference — Class Scanning](https://docs.spring.io/spring-framework/reference/core/beans/classpath-scanning.html) — how ASM-based scanning actually works, and the filter model.
- [Baeldung — Spring Component Scanning](https://www.baeldung.com/spring-component-scanning) — practical filter examples for scanning third-party beans.

## Chapter 5 — The ApplicationContext Family

### 5.1 The Hierarchy

```text
ApplicationContext
├── AnnotationConfigApplicationContext ....... @Configuration / @ComponentScan, no web
├── ClassPathXmlApplicationContext ........... XML config, no web
├── GenericApplicationContext ............... base, no default config location
├── GenericWebApplicationContext ............ base for web
│   ├── XmlWebApplicationContext
│   ├── AnnotationConfigWebApplicationContext
│   └── ServletConfigServletWebServerApplicationContext .... Boot's servlet web app
└── ReactiveWebServerApplicationContext
    ├── AnnotationConfigReactiveWebServerApplicationContext ... Boot's WebFlux app
    └── AnnotationConfigReactiveWebServerApplicationContext (Netty)
```

| | Servlet (MVC) | Reactive (WebFlux) |
| --- | --- | --- |
| Context class | `ServletWebServerApplicationContext` | `ReactiveWebServerApplicationContext` |
| Default server | Tomcat | Reactor Netty |
| Request handling | Thread per request, blocking | Event loop, non-blocking |
| App type | `WebApplicationType.SERVLET` | `WebApplicationType.REACTIVE` |
| `WebClient` return types | Bridged back to `Mono`/`Flux` | Native |

Boot picks between them at startup by classpath inspection — if `spring-boot-starter-webflux`
is present and `spring-boot-starter-web` is not, you get a reactive application. If both are
present, MVC wins. This surprises people who add WebFlux to an existing MVC app for
`WebClient` and then wonder why their endpoints are still blocking (which is fine — see
Volume 10).

### 5.2 The Environment

The `Environment` is the abstraction over configuration sources. It is deliberately separate
from any property-file format, which is what lets the same code read from a file, from system
properties, from the command line, and from a config server.

```java
@Autowired Environment env;

String url = env.getProperty("payment.url");
String withDefault = env.getProperty("payment.url", "https://api.default");
Integer typed = env.getProperty("payment.retries", Integer.class);
Integer converted = env.getProperty("payment.retries", Integer.class, 3);
String relaxed = env.getProperty("payment.gatewayUrl");   // relaxed binding applies

// Profiles
String[] active = env.getActiveProfiles();
boolean prod = env.matchesProfiles("prod", "prod-*");
```

> **TRADE-OFF**
>
> Injecting `Environment` into business code is a service locator, and it makes the set of
> configuration a class depends on invisible. The flip condition: use it when the value is
> genuinely dynamic and not part of the class's contract, and use `@ConfigurationProperties`
> when it's a typed group that should be validated at startup. The pathological version —
> `env.getProperty(...)` scattered through a service class — is a configuration coupling that
> no test can see.

### 5.3 Resources

```java
Resource r = new ClassPathResource("templates/order.ftl");
Resource f = new FileSystemResource("/etc/acme/config.yml");
Resource u = new UrlResource("https://cdn.acme.com/logo.png");
Resource b = new ByteArrayResource(bytes);

Resource[] all = new PathMatchingResourcePatternResolver()
        .getResources("classpath*:templates/*.ftl");
```

| Abstraction | What it's for |
| --- | --- |
| `Resource` | Abstract handle to something readable |
| `ResourceLoader` | Strategy for getting a `Resource` from a location |
| `ApplicationContext` | Implements `ResourceLoader`; is itself a `Resource` (shorthand) |
| `PathMatchingResourcePatternResolver` | Ant-pattern and classpath-`*` scanning |
| `ResourcePatternResolver` | The pattern-matching sub-interface |
| `EncodedResource` | Handles encoding explicitly |
| `ResourceEditor` / `PropertyEditor` | Converts a `String` location to a `Resource` |

> **SCALING REALITY CHECK**
>
> `classpath*:` scans are `O(n)` in the number of resources matched, and
> `PathMatchingResourcePatternResolver` has to open and read each candidate's directory
> entries. A `classpath*:templates/**` in an application that ships 40,000 resources is a
> measurable startup cost — and it's typically hidden inside a starter rather than written by
> the team that suffers it. When startup is inexplicably slow, `classpath*:` is a top-three
> suspect along with component scanning breadth and eager I/O.

> **INTERVIEW TRAP**
>
> `classpath:` finds the *first* match and stops. `classpath*:` finds *all* matches across
> every jar. For a single, well-known resource, `classpath:` is faster and the difference is
> invisible. For resources that may be contributed by several jars — templates, locale
> bundles, `spring.factories` — you need `classpath*:` or you will silently pick up only the
> first jar's copy. This is the mechanism behind several "why is my override not being picked
> up" bugs in layered jars.

### 5.4 Internationalisation

```java
@Bean
MessageSource messageSource(ResourceBundleMessageSource fallback) {
    ReloadableResourceBundleMessageSource ms = new ReloadableResourceBundleMessageSource();
    ms.setBasename("classpath:messages/messages");
    ms.setDefaultEncoding("UTF-8");
    ms.setFallbackToSystemLocale(false);   // important: see below
    return ms;
}
```

`messageSource.getMessage("order.confirmed", new Object[]{orderId}, locale)`, with
`LocaleResolver` choosing the locale — `AcceptHeaderLocaleResolver` by default in MVC, reading
the `Accept-Language` header.

`setFallbackToSystemLocale(false)` is the setting people miss. With the default `true`, a user
whose system locale is `en_GB` and who requests `en-GB` gets the `en` bundle only if the
system-locale lookup fails first — which produces the classic "it works on my machine" i18n
bug where message keys resolve to the base bundle on some machines and to a translation on
others.

#### Common Mistakes

- Using `ClassPathXmlApplicationContext` when there's no XML — `AnnotationConfigApplicationContext`
  or, in practice, just the Boot-provided `SpringApplication` context.
- Assuming `getBeansOfType()` is cheap. It's O(bean count) and it can trigger class loading.
  Cache it, or better, inject the collection.
- Using `classpath:` where `classpath*:` was needed, or vice versa.
- Leaving `fallbackToSystemLocale` at its default in a translated app.
- Injecting `Environment` for a value that should be a validated `@ConfigurationProperties`
  group.
- Not knowing that a reactive application context can back `WebClient`-returning MVC
  controllers — you can mix them, and Volume 10 covers the consequences.

#### Interview Questions — The Context Family

**Q1. Why does `ApplicationContext` extend `BeanFactory` rather than the other way
around?**

Because the container interface should stay minimal — `BeanFactory` is cheap to implement and
suitable for embedded or lazy contexts, and adding enterprise services to it would make it
unimplementable in practice. `ApplicationContext` is the façade that bundles the extra
services so applications get them by default.

**Q2. How does Spring Boot decide between a servlet and a reactive application?**

By classpath inspection during `SpringApplication` construction: it sets
`WebApplicationType.REACTIVE` when Spring WebFlux is present and Spring MVC is not, and
`WebApplicationType.SERVLET` otherwise. If both starters are present, servlet wins. You can
override the deduction with `spring.main.web-application-type`.

**Q3. `classpath:` vs `classpath*:` — when does it matter, and what's the failure mode?**

`classpath:` resolves the first match and stops; `classpath*:` aggregates all matches across
every jar. It matters whenever a resource can be contributed by more than one artifact —
templates, locale bundles, auto-configuration metadata. The failure mode is silent: you get
one jar's copy and no warning, so an override in the application jar is simply ignored.

**Q4. A `ResourceBundleMessageSource` works locally and returns English keys in production
for a subset of users. What's the likely cause?**

`fallbackToSystemLocale` is at its default `true`, so a user whose OS locale is `en_GB` can
take the system-locale path and land on the base bundle, while a user with `en` gets the
translation — producing exactly the "works for some users" pattern. Set it to `false` and
make the resolution explicit.

**Q5. How would you enumerate every `NotificationChannel` bean in the application, and why
might you avoid `getBeansOfType`?**

`applicationContext.getBeansOfType(NotificationChannel.class)`, or better, inject
`List<NotificationChannel>` / `ObjectProvider<NotificationChannel>` and let the container
resolve it once. `getBeansOfType` walks the whole registry and may load classes to resolve
types, so it's O(bean count) — fine at startup, a real problem on a hot path.

**Q6. Your service needs a value that comes from config. When is injecting `Environment`
acceptable?** `STAFF`

When the value is genuinely dynamic and not part of the class's contract — a feature-flag
lookup, a tenant-selected setting, a key resolved from a secrets provider at request time.
Not acceptable as a default for a group of related settings, because it makes the class's
configuration surface invisible to readers and to tests, and it can't be validated at
startup. The staff-level version of the answer is that `Environment` injection is a coupling
you should be able to name; if you can't name the cases, use typed configuration properties.

> **CHAPTER 5 SUMMARY**
>
> `ApplicationContext` is the enterprise façade over the minimal `BeanFactory`, and the
> hierarchy choice is mostly about web stack: servlet contexts thread-per-request, reactive
> contexts event-loop based. The `Environment` is the deliberately format-agnostic
> configuration abstraction, and reaching for it directly is usually a sign you wanted typed
> configuration properties. Resources have a genuine performance dimension —
> `classpath*:` scans are O(n) and hide inside starters — and the `classpath:` versus
> `classpath*:` distinction explains a whole family of "my override is ignored" bugs.
> `fallbackToSystemLocale` is the i18n setting people discover in production.

#### Further Reading

- [Spring Framework Reference — Core](https://docs.spring.io/spring-framework/reference/core.html) — `Environment`, resource abstraction, and internationalisation in one chapter.
- [Spring Framework Reference — WebFlux](https://docs.spring.io/spring-framework/reference/web/webflux.html) — the reactive context, for when you need to understand the non-servlet side.
- [Spring Guides](https://spring.io/guides) — the `gs-*` guides cover `Environment` and context configuration with runnable, minimal examples.

## Chapter 6 — Events & the ApplicationEventPublisher

### 6.1 The Model

```text
Publisher  ──publishEvent()──►  ApplicationEventMulticaster
                                       │
                        ┌──────────────┼──────────────┐
                        ▼              ▼              ▼
                    @EventListener  @EventListener  @EventListener
                    (OrderService)  (AuditLog)     (CacheEvict)
```

```java
@Service
public class OrderService {
    private final ApplicationEventPublisher events;

    public OrderService(ApplicationEventPublisher events) { this.events = events; }

    public Order create(CreateOrderCommand cmd) {
        Order order = repo.save(new Order(cmd));
        events.publishEvent(new OrderCreatedEvent(order.id(), Instant.now()));
        return order;                       // synchronous — the handler has already run
    }
}
```

The default multicaster is **synchronous**: `publishEvent` returns only after every listener
has returned. This is the single most important fact about Spring events and the cause of
the most common surprise — a listener that calls a slow service adds its latency to the
publishing request.

```java
// Make it asynchronous
@Bean
ApplicationEventMulticaster eventMulticaster(ApplicationEventPublisher publisher) {
    SimpleApplicationEventMulticaster multicaster = new SimpleApplicationEventMulticaster();
    multicaster.setTaskExecutor(new ThreadPoolTaskExecutor(...));
    return multicaster;
}
```

Or per-listener with `@Async`, which requires `@EnableAsync`.

> **PRODUCTION SCENARIO**
>
> Problem: p99 latency on order creation jumped from 120ms to 2.4s; CPU was flat, the
> database was fine.
> Investigation: a thread dump showed request threads parked in a downstream HTTP client
> called from an `@EventListener`.
> Root cause: the synchronous event multicaster — the publisher's request thread was executing
> the listener inline, and the listener made a blocking call to the notification service,
> which was itself slow.
> Solution: switch to `SimpleApplicationEventMulticaster` with a bounded executor.
> Prevention: treat event handlers as latency-sensitive code; publish a small immutable
> payload and never do I/O inline unless you've explicitly budgeted for it.

### 6.2 Listener Declaration and Ordering

```java
@Component
class OrderAuditListener {

    @EventListener
    public void onCreated(OrderCreatedEvent e) { ... }

    @EventListener
    @Order(10)                                  // runs AFTER order = 1
    public void onCreatedAfterCacheEviction(OrderCreatedEvent e) { ... }

    @EventListener
    @Order(1)
    public void onCreatedFirst(OrderCreatedEvent e) { ... }

    // Multiple events in one method
    @EventListener
    public void onAnything(OrderCreatedEvent | OrderCancelledEvent e) { ... }

    // Conditional
    @EventListener
    @Profile("!test")
    public void onCreatedInProdOnly(OrderCreatedEvent e) { ... }

    // Return a value and Spring publishes it — useful for request/reply
    @EventListener
    public String onQuery(PriceQuery q) { return "..."; }
}
```

For a given event type, listeners are ordered by `@Order` (or `Ordered`), lower value first.
**Order between listeners of the same event is often load-bearing and almost never
documented** — if one listener invalidates a cache and another reads it, the order is a
correctness dependency that lives in two annotation values.

### 6.3 Transactional Events — and the Trap

```java
@Component
class NotificationListener {

    @TransactionalEventListener                       // default phase = AFTER_COMMIT
    public void onOrderCreated(OrderCreatedEvent e) {
        notificationService.send(e);                  // only runs if the tx COMMITTED
    }

    @TransactionalEventListener(phase = TransactionPhase.BEFORE_COMMIT)
    public void auditBeforeCommit(OrderCreatedEvent e) { ... }

    @TransactionalEventListener(phase = TransactionPhase.AFTER_COMPLETION)
    public void cleanupRegardless(OrderCreatedEvent e) { ... }

    @TransactionalEventListener(phase = AFTER_COMMIT, fallbackExecution = true)
    public void sendOrRunIfNoTx(OrderCreatedEvent e) { ... }
}
```

> **MUST REMEMBER**
>
> `@TransactionalEventListener` **binds the listener to a transaction**. If no transaction
> is active when the event is published, the listener **does not run at all** — there is no
> error, no warning, no log. This is the single most common "my listener never fires" cause.
> `fallbackExecution = true` makes it run when there's no transaction, which is what you want
> if the publisher is not always transactional.

> **INTERVIEW TRAP — AFTER_COMMIT AND THE THREAD**
>
> An `AFTER_COMMIT` listener runs *after* the transaction commits, which means the
> transaction is over — and if the outer method is `@Transactional` and the listener is
> `@Async`, it runs on a completely different thread with no transaction context. Two
> consequences people miss: an exception thrown in an `AFTER_COMMIT` listener cannot roll
> anything back (the data is already committed), and if you need the data to still be
> consistent you must be deliberate about *which* transaction phase the work runs in.
> `AFTER_COMMIT` is the right default for "notify the world"; it is the wrong choice for
> "make sure two writes agree."

### 6.4 Events as a Coupling Tool

Spring's in-process events are frequently used to decouple — and frequently used to
disguise coupling.

```java
// The coupling this "decouples"
public class OrderService {
    public Order create(CreateOrderCommand cmd) {
        Order o = repo.save(new Order(cmd));
        auditLog.record("ORDER_CREATED", o.id());
        cache.invalidate(o.customerId());
        emailClient.sendConfirmation(o);
        warehouseClient.notifyShip(o);
        return o;
    }
}
```

Split into an event, and the service no longer mentions four collaborators. But:

1. **The coupling moves, it doesn't disappear.** The listener still exists, still runs on the
   publisher's thread by default, and still fails the request when it throws. The dependency
   is now invisible to anyone reading `OrderService`, which is a net loss for the person
   debugging it.
2. **It has no durability.** The event dies with the process. If the publisher's transaction
   rolls back, uncommitted work is gone; if the JVM dies after commit and before the listener
   runs, the effect is simply lost.
3. **It doesn't scale across processes.** This is in-JVM. Two instances of the service each
   have their own event bus.

> **STAFF-LEVEL CONSIDERATION**
>
> The rule that holds up: **use in-process events for things that are part of the same
> transaction of work — notifications, cache invalidation, local audit — and use a durable
> mechanism (a transactional outbox plus a broker) for anything where losing the effect is
> unacceptable or where the work must reach another service.** The distinction is
> best-effort versus guaranteed, and it should be an explicit decision in the design
> discussion rather than a default. The question to ask in review is always: "if this
> process dies between the commit and the listener running, what is lost?" If the answer is
> "the confirmation email, fine" — events are correct. If the answer is "the ledger entry" —
> you need an outbox.

> **PRODUCTION RELEVANCE**
>
> `@Async` listeners have their own failure mode: an exception thrown in an async listener
> goes to the `AsyncUncaughtExceptionHandler`, which by default **logs and swallows**. The
> request succeeds, the effect silently doesn't happen, and there is no stack trace tying it
> to a request. If async work must be reliable, it needs its own retry and its own
> observability — which is the argument for a broker rather than `@Async`.

#### Common Mistakes

- Assuming `publishEvent` is fire-and-forget. The default multicaster is synchronous, so
  listener latency is on the caller's bill and listener exceptions propagate to the caller.
- Using `@TransactionalEventListener` outside a transaction and concluding the listener is
  broken. It is behaving exactly as designed.
- Relying on listener ordering without `@Order`, then refactoring one listener and silently
  changing behaviour.
- Using in-process events for work that must survive a crash, or that must reach another
  service.
- Letting an `@Async` listener throw, expecting the failure to surface anywhere.
- Mutating the event object inside a listener when other listeners will see it.

#### Interview Questions — Events

**Q1. Is Spring's `ApplicationEventPublisher` asynchronous?** `TRICKY`

No. The default `SimpleApplicationEventMulticaster` is synchronous — `publishEvent` returns
only after every listener has completed, and a listener exception propagates to the
publisher. Asynchrony requires explicitly configuring a task executor on the multicaster, or
annotating the listener `@Async` (with `@EnableAsync`).

**Q2. Why doesn't a `@TransactionalEventListener` fire when published outside a
transaction?** `TRICKY`

Because the listener is registered to fire on a transaction phase, and with no active
transaction there is no phase to fire on — so the event is discarded silently. Use
`fallbackExecution = true` if the publisher is not always transactional.

**Q3. Your p99 on an endpoint jumped 20x with no CPU or database change. Spring events are
involved. Where do you look?**

`SimpleApplicationEventMulticaster`'s default task executor is a `SimpleAsyncTaskExecutor`,
which **creates a new thread per task** — under load that means unbounded thread creation.
That's the classic answer, and the fix is to configure a bounded `ThreadPoolTaskExecutor`
explicitly. The second answer is a listener doing blocking I/O on the caller's thread.

**Q4. When is an in-process Spring event the wrong tool?** `STAFF`

Whenever the effect must be guaranteed: it must survive a process crash, reach another
service, be retried, or be audited as part of the same logical operation as the write. In
those cases you need a transactional outbox plus a broker, or a shared transaction with the
subsystem. The in-process bus is a best-effort, same-JVM decoupling mechanism, and treating
it as durable is the mistake that produces lost side effects nobody can reproduce.

**Q5. How do you guarantee two `@EventListener`s run in a specific order?**

`@Order` with lower values running first — and you should then write that dependency down,
because it will not be obvious to the next person. Ordering matters whenever one listener
invalidates a cache another reads, or one updates state another summarises. If the ordering
is load-bearing, prefer making the second listener depend on the first explicitly via a
constructor dependency rather than an annotation value.

**Q6. Two `@EventListener` methods handle the same event and both throw under load. What
happens?** `SCENARIO`

With the synchronous default, the first exception propagates out of `publishEvent` to the
publisher, so remaining listeners may not run at all — a partial-effect hazard, since a
listener that already sent an email is not rolled back. With `@Async`, both run independently
and the exception goes to the `AsyncUncaughtExceptionHandler`, which by default logs and
swallows. Neither is transactional; that asymmetry is worth knowing before you pick.

> **CHAPTER 6 SUMMARY**
>
> Spring's event bus is a synchronous, in-JVM decoupling mechanism by default — which means
> listener latency is the publisher's latency, listener exceptions are the publisher's
> exceptions, and effects are lost if the process dies. `@TransactionalEventListener` solves
> the "don't notify on rollback" problem but introduces a silent-failure mode: no transaction
> means no listener, no error. Use in-process events for best-effort work inside one
> transaction of effort — notifications, cache eviction, local audit — and reach for a
> transactional outbox plus a broker the moment the effect must be guaranteed or must cross a
> service boundary. The most common production bug in this area is forgetting that
> `SimpleAsyncTaskExecutor` creates a thread per task.

#### Further Reading

- [Spring Framework Reference — Application Events](https://docs.spring.io/spring-framework/reference/core/beans/context-introduction.html#context-functionality-events) — the official event and listener reference, including `@TransactionalEventListener` phases.
- [Spring Framework Reference — Annotation-Based Event Listener](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/autowired.html) — listener registration, ordering, and the reactive event model.
- [Transactional Outbox pattern](https://microservices.io/patterns/data/transactional-outbox.html) — the pattern to reach for when the effect must not be lost, and the reason in-process events aren't enough.

## Chapter 7 — Profiles & Property Resolution

### 7.1 The Property Source Precedence Order

From highest to lowest precedence. This is a genuine interview question and the order is
memorable only if you know the rule behind it: **more specific and more external wins**.

```text
 1. Devtools global settings              @SpringBootApplication defaults
 2. @TestPropertySource                    (tests only)
 3. Command line arguments                 --server.port=9000
 4. SPRING_APPLICATION_JSON                inline JSON
 5. ServletConfig init params / ServletContext params
 6. JNDI attributes                        (java:comp/env)
 7. Java System properties                 System.getProperties()
 8. OS environment variables               $SERVER_PORT
 9. RandomValuePropertySource              random.*
10. Profile-specific application.properties/yaml OUTSIDE the jar
11. Profile-specific application.properties/yaml INSIDE the jar
12. application.properties/yaml INSIDE the jar (default profile)
13. @PropertySource                        in the configuration class
    ...plus, in a Boot app, ConfigData: imports, and CONFIG_ location
    (the config tree is consulted between 3 and 5 in Boot 2.4+)
```

The mentally useful summary: **command line > system properties > environment variables >
config file > `@PropertySource`**. Almost every real question is answered by that line.

```yaml
# application.yml — lowest precedence, shared defaults
server:
  port: 8080

---
# application-prod.yml — profile-specific, inside the jar
spring:
  config:
    activate:
      on-profile: prod
server:
  port: 9000

---
# application.yml OUTSIDE the jar — beats the in-jar one
logging:
  level:
    root: INFO
```

> **INTERVIEW TRAP**
>
> "Environment variables override everything" is the common wrong answer. They sit at
> position 8, below command line arguments and system properties — which is precisely why
> `java -jar app.jar --server.port=9000` beats `SERVER_PORT=9000 java -jar app.jar`.
> And in Boot 2.4+, `spring.config.import` adds a whole config tree with its own precedence
> rules, layered between the command line and the servlet parameters.

### 7.2 `@Profile`

```java
@Configuration
@Profile("prod")
class ProdConfig { @Bean AuditSink auditSink() { ... } }

@Bean
@Profile("!dev")
PaymentClient paymentClient() { ... }              // NOT in the dev profile

@Profile({"staging", "qa"})
class SharedConfig { }                             // in either

@Profile("prod & !eu")                             // expressions supported
@Profile("!prod & !qa")                            // local-only config
```

```yaml
spring:
  profiles:
    active: dev                    # typically set via env var, not committed
    default: prod                  # used when nothing is active
```

`@Profile` is a `@Conditional(ProfileCondition.class)` — the general mechanism you'll meet in
Volume 7.

> **PRODUCTION RELEVANCE**
>
> A committed `spring.profiles.active: dev` will silently override whatever the environment
> intends, and the usual symptom is an app connecting to a developer's database. Set the
> active profile through an environment variable or JVM argument in every deployment, and
> consider `spring.profiles.default: prod` as a fail-safe so a missing profile setting fails
> toward production behaviour rather than toward a development one.

### 7.3 `@Value` and Type-Safe Configuration

`@Value` is for the occasional value. `@ConfigurationProperties` is for a group — and Volume
7 covers it in depth, so this is the shape rather than the detail:

```java
@ConfigurationProperties(prefix = "payment")
@Validated
public record PaymentProperties(
        @NotBlank URI gatewayUrl,
        @Min(1) @Max(10) int retries,
        @NotNull Duration timeout,          // "5s" binds via relaxed conversion
        @DefaultValue("false") boolean sandbox) {
}
```

| | `@Value` | `@ConfigurationProperties` |
| --- | --- | --- |
| Unit | One value | A related group |
| Type safety | String → conversion ad hoc | Fully typed, IDE completion |
| Validation | Manual | JSR-380, fails at startup |
| Naming | `camelCase` in source | Relaxed binding: `kebab-case`, `snake_case`, env vars all work |
| Enumerable | No — scattered string keys | Yes — one object lists everything |
| Overridable per-bean | No | Yes, with `@ConfigurationProperties` on a `@Bean` method |

> **STAFF-LEVEL CONSIDERATION**
>
> The underrated benefit of `@ConfigurationProperties` is auditability. When someone asks
> "what can be changed without a redeploy, and what does changing it do?", the answer for a
> typed properties class is "here is the list, here are the validation constraints, here are
> the defaults." For scattered `@Value` fields the answer is a `grep`. At staff level this is
> the difference between configuration you can hand to an SRE and configuration you cannot.

### 7.4 Relaxed Binding

```yaml
payment:
  gateway-url: https://api.stripe.com    # binds to gatewayUrl
  connectTimeout: 5s                    # Duration
  maxRetries: 3                         # int
```

All of these bind to the same field:

```yaml
payment.gateway-url: ...
payment.gatewayUrl: ...
payment.gateway_url: ...                # from an env var PAYMENT_GATEWAY_URL
PAYMENT_GATEWAYURL: ...                 # from an env var
```

| Target type | Accepted source form |
| --- | --- |
| `Duration` | `10s`, `500ms`, `2m`, ISO-8601 `PT10S` |
| `DataSize` | `10MB`, `512KB`, `1GB` |
| `List<T>` | comma-separated string, or a YAML list |
| `Map<String,String>` | bracketed keys, or dotted notation |
| `Enum` | `UPPER_SNAKE`, `camelCase`, `kebab-case` |

Environment variables are the reason relaxed binding exists at all: an env var cannot
contain `.` or `-`, so `PAYMENT_GATEWAY_URL` has to map to `payment.gateway-url`, and the
binding rules are what make that work.

> **INTERVIEW TRAP**
>
> Relaxed binding applies to `@ConfigurationProperties`, and **not** to
> `@Value("${...}")` lookups — those are exact-key lookups against the `Environment` (modulo
> a little system-environment mapping). A common surprise: a property that binds fine through
> a properties class fails through `@Value` with `Could not resolve placeholder`. The rule of
> thumb is to use the kebab-case key in `@Value` too, and not to rely on the relaxed forms.

#### Common Mistakes

- Committing `spring.profiles.active` to a shared config file, where it overrides the
  environment's intent.
- Using `@Value` for a group of related settings — no validation, no enumeration, no IDE
  completion, and no way to answer "what's configurable here?"
- Expecting relaxed binding to work in `@Value` placeholders.
- Assuming environment variables override the command line. They don't — the command line
  is position 3, env vars position 8.
- Hard-coding a profile-specific file inside the jar that must be overridden externally,
  without knowing the precedence rules.
- Treating a `Duration` binding failure as a mystery — `5` does not bind to `Duration`;
  it needs `5s` or `PT5S`.

#### Interview Questions — Configuration

**Q1. In what order does Spring resolve property sources, and what's the practical rule?**
`TRICKY`

Highest to lowest: `@TestPropertySource`, command line arguments, `SPRING_APPLICATION_JSON`,
servlet parameters, JNDI, Java system properties, OS environment variables, random values,
profile-specific files outside the jar, profile-specific files inside the jar, the default
`application.properties`/`.yml` inside the jar, then `@PropertySource`. The practical rule:
command line > system properties > environment variables > config file > `@PropertySource`.
More specific and more external wins.

**Q2. Why did we move from `spring.factories` to
`META-INF/spring/...AutoConfiguration.imports` in Boot 2.7/3.x?** `ADVANCED`

`spring.factories` was a single generic key-value file used for several unrelated mechanisms,
so listing auto-configurations there was overloaded, hard to load without triggering the
other factories, and made tooling's job harder. The dedicated `AutoConfiguration.imports`
file is type-safe, dedicated to one purpose, supports `@AutoConfiguration` metadata like
before/after ordering directly on the class, and lets the JVM load the list without a
properties parser. Boot 2.7 introduced it and Boot 3 removed the `spring.factories`
auto-configuration support.

**Q3. `@Value("${payment.timeout}")` doesn't resolve, but the same key binds through a
`@ConfigurationProperties` class. Why?**

Because relaxed binding applies to `@ConfigurationProperties` binding, not to placeholder
resolution. `@Value` does an exact-key lookup against the `Environment` (with limited
system-environment mapping). Use the canonical kebab-case key in `@Value` and don't rely on
the relaxed forms.

**Q4. A team has 40 scattered `@Value` fields. What's the cost, beyond tidiness?** `STAFF`

Three concrete costs. You cannot enumerate what's configurable without a `grep`, which means
"what can the SRE change at runtime?" has no reliable answer. You cannot validate related
values together — nothing stops `retries > poolSize` at startup. And a typo in a key name is
a runtime failure rather than a compile or startup failure, because the field is a `String`
with an unresolvable placeholder checked at bean creation, in a bean that may be lazy. A
single `@ConfigurationProperties` record fixes all three and gives an IDE-generated list.

**Q5. `@Profile` vs `@Conditional` — what's the relationship?**

`@Profile` is a specialisation: it's shorthand for
`@Conditional(ProfileCondition.class)`, which matches against the active profiles. The
general `@Conditional` family is what auto-configuration uses, and it's the extension point
for your own conditions. Volume 7 covers the family in depth.

**Q6. Your service reads a secret from configuration. What are the two things that go wrong
in practice, and how would you design around them?**

First: committing the default to `application.yml` — secrets belong in a secret manager or
injected environment, never in version control, and the failure mode is a credential in git
history forever. Second: no rotation story — if the secret is a plain string in a config
file, rotating it is a deploy. The design answer is a property that points at a secret
reference resolved at startup, with the ability to reload it without a full restart, and
with a validation constraint so a missing secret fails at startup rather than on first use.

> **CHAPTER 7 SUMMARY**
>
> Property resolution is a strict precedence ladder — command line beats system properties
> beats environment variables beats config file beats `@PropertySource` — and "environment
> variables win" is a wrong answer that costs marks. `@Profile` is just
> `@Conditional(ProfileCondition.class)`, and a committed `spring.profiles.active` is a
> production hazard. The real decision is `@Value` versus `@ConfigurationProperties`: one
> value versus a typed, validated, enumerable, IDE-completable group. Relaxed binding is why
> `PAYMENT_GATEWAY_URL` works, and it applies to properties binding only — not to `@Value`
> placeholder resolution, which is a genuinely common source of confusion.

#### Further Reading

- [Spring Boot Reference — Externalized Configuration](https://docs.spring.io/spring-boot/reference/features/external-config.html) — the authoritative precedence list, the config tree, and `SPRING_APPLICATION_JSON`.
- [Spring Boot Reference — Profiles](https://docs.spring.io/spring-boot/reference/features/profiles.html) — profile activation, profile groups, and multi-document YAML.
- [Spring Framework Reference — Core Environment Abstraction](https://docs.spring.io/spring-framework/reference/core/beans/environment.html) — `Environment`, `PropertySource`, and `@Value` semantics.

---

### End of Volume 1

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain the full `@Autowired` resolution algorithm — candidates, `@Qualifier`, `@Primary`,
  `@Priority`, name-match fallback — and say which step each of `List<T>`, `Map<String,T>`,
  `Optional<T>` and `Stream<T>` injection points skips
- Describe the three phases of `ApplicationContext.refresh()` and place `BeanFactoryPostProcessor`,
  `BeanPostProcessor` and `@PostConstruct` in the right one
- Explain why a `@Configuration` class is CGLIB-enhanced, and what breaks with
  `proxyBeanMethods = false`
- State the precedence ladder for property sources, and which of command line, system
  properties and environment variables wins
- Explain what `@TransactionalEventListener` does when there is no active transaction

### Coming in Volume 2 — Bean Lifecycle, Scopes & Advanced DI

Volume 1 covered what a bean *is* and how it gets its dependencies. Volume 2 is about the
container's machinery: the full callback sequence a bean goes through, what a
`BeanPostProcessor` can actually do to it, the five scopes and their thread-safety
obligations, JSR-380 validation, dynamic bean registration for plugins and multi-tenancy,
the resource abstraction, and finally the circular-dependency question — why field injection
made it invisible, how the three-level cache resolves it, and why Spring Boot 2.6 rejected it
by default.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### Container Architecture

**D1. Is "constructor injection is always correct" universally true, or are there cases
where field injection is right?**

Field injection survives for genuine laziness: a circular reference that is real rather than
accidental, an optional integration that must not block construction, and integration
discovery where the set of collaborators is determined at runtime. What field injection is
never right for is avoiding a long constructor — the fix there is a facade object. The rule
is a strong default that bends only for laziness, and the bend is a design decision that
should be written down.

**D2. If `@Primary` exists to resolve a local ambiguity, is using it ever actually wrong?**
`STAFF`

It's wrong when two implementations are each correct in different contexts and one is
merely the default — then the default leaks into call sites nobody reviewed, and a new
feature quietly inherits a decision made for someone else's feature. It's right when one
implementation is genuinely the intended default everywhere. The staff-level question isn't
"is `@Primary` correct" but "does anything depend on the default in a way that would surprise
a new joiner?"

**P1. A teammate adds a new `Clock` bean for a feature. CI is green, but one service fails
to start in staging. What's the likely cause?**

A single-argument constructor somewhere, unannotated, that used to be unambiguous. Adding a
second `Clock` candidate makes the container unable to disambiguate, and the bean fails to
create. Search for constructors taking `Clock` (and similar recently-unambiguous types) and
add `@Autowired`.

**S1. A reviewer says "this service can have 11 dependencies." Why does that matter?**

Because it signals the class has more than one reason to change, which is the class-
level symptom of the SRP violation that the package-level aggregation is trying to paper
over. The cost is concrete: an 11-argument constructor needs a builder or a test factory, and
each argument is a place a test can forget to provide. The fix is a facade grouping related
collaborators, not an `ApplicationContext` field.

**T1. `context.getBeansOfType(Foo.class)` on a 4,000-bean application, called once per
request. What's wrong, and what's the fix?**

It's O(bean count) per call and can trigger class loading for unresolvable types — so this
is a genuine throughput bug, not a style issue. Inject `List<Foo>` or
`ObjectProvider<Foo>` once and let the container resolve it at startup.

**D3. Is component scanning `com` in a monorepo ever the right call?**

Only if you genuinely want every module's beans in one context, which is the modular
monolith case and a legitimate answer. Otherwise it's leftover from a single-module origin,
and the cost — a full classpath scan and a slow startup that scales with the org, not the
service — is paid by one service for a decision that was never revisited. The flip condition
is "is this one deployable unit?"

### Dependency Injection

**P2. A service works in every test but returns a stale dependency in production after a
refactor. What class of bug is this?**

Almost always field injection. The field is populated by the container after construction, so
a `new` inside a lambda, a `@PostConstruct` path, a self-invocation, or a `@Configuration`
method that called `new` all leave it null or unmanaged — and the field being `null` is the
symptom. The refactor to constructor injection turns this from a runtime mystery into a
compile error.

**T2. Four beans implement `PaymentClient`; none has `@Primary`. What happens for an
`@Autowired` field named `stripeClient`?**

If a bean named `stripeClient` exists and is assignable to `PaymentClient`, the name-match
fallback selects it and startup succeeds. If no such bean name exists,
`NoUniqueBeanDefinitionException` at startup. This is why the exception is a startup failure
and not a runtime surprise — and why an `Optional<PaymentClient>` injection point instead
yields `Optional.empty()`.

**T3. A constructor takes a generic type, `List<Repository>` (unparameterised raw). What
candidates does Spring collect?**

With a raw type, Spring matches on `List` itself, so it collects every bean that is a `List`
— in practice none — and injects an empty list or fails. Generics are the whole mechanism
that makes collection injection useful, and a raw type disables it silently.

**S1. A PR replaces `@Qualifier("stripe")` with `@Primary` on the Stripe bean. What is the
review comment?**

"That changes a local decision into a global one." `@Primary` now affects every unannotated
`PaymentClient` injection point in the application, including code nobody has written yet.
Either it's genuinely the default everywhere — in which case say so in the PR — or it belongs
back on the injection points that meant it.

**D4. Is injecting `ApplicationContext` a design smell, or a legitimate tool?**

It's a legitimate tool when the dependency graph genuinely cannot be determined at
construction: optional integration discovery, tenant-dependent implementation selection,
plugin lookup. It's a smell when it avoids a long constructor or avoids refactoring. The
test is whether the set of dependencies is knowable — if it is, a service locator is hiding a
dependency from every tool that reads the code, and a facade is the better fix.

**D5. If the container can wire everything, is writing constructor boilerplate ever the
wrong call?**

No — and the reason is worth stating precisely. The dependencies are part of the class's
contract, and expressing them as parameters makes them visible to readers, IDEs, test
factories, and static analysis. Removing that visibility in the name of less typing removes
the information a maintainer needs most, which is exactly the kind of trade-off a staff
engineer should push back on even when the shorter code looks cleaner.

### Bean Definitions & Lifecycle

**P3. A service fails to start with `BeanCreationException`, and the cause mentions a table
that doesn't exist yet. What happened, and what's the fix?**

A bean with eager initialisation queried the database during context refresh
(`@PostConstruct`, or a `@Bean` method, or a non-lazy `initializingBean`), and it ran before
the migration that creates the table. Phase 3 of `refresh()` runs all of it. The fix is to
make the dependency lazy, or to move the check behind an actuator health indicator or a
deferred migration run — a startup gate should not be a bean constructor.

**T4. Does the order of `@Bean` methods in a `@Configuration` class determine creation
order?**

No. There is no guaranteed creation order. Order is established by dependency edges (a `@Bean`
method that takes another bean as a parameter forces that bean first), by `@DependsOn`, or
by `@Order` for collections. Reading order in the source file is not a mechanism, and relying
on it is a bug that survives refactoring.

**S2. A reviewer sees a `static` field initialised from a `@Value` field. What's the
problem?**

Static initialisation runs at class load, before the container has populated the instance
field — so it captures `null` or the wrong value depending on load order. It also defeats
testing entirely, since the value is fixed for the JVM's lifetime. This is a field-injection
failure mode wearing a static costume.

**D6. `spring.main.lazy-initialization=true` is a one-line fix for a slow startup. Should
you ship it?** `STAFF`

As a diagnostic, yes — it tells you whether the cost is in eager initialisation or in context
refresh itself. As a permanent fix, no: it converts a slow startup into a slow first request
per endpoint, moves failures from startup to production traffic, and means a bean with a bad
dependency now fails when a user hits that code path. The real fix is to find the specific
eager bean and make only that one lazy, so the tradeoff is explicit and scoped.

**D7. A startup optimisation has to choose between slower boot and slower first request. Is
that a purely technical trade-off?**

No, and this is where staff-level thinking shows. It changes *when failures surface* — a
startup failure is caught in CI and before any traffic; a first-request failure is caught by
users. It also changes the shape of your incident response, because a cold instance in a
scale-up event serves its worst latency exactly when the system is under stress. So the
trade-off is really about where you want failure and load to land, and that's an operational
and organisational decision as much as a performance one.

### Scanning & Stereotypes

**P4. A library is added as a dependency and its services are not injected. What are the
likely causes, in order?**

The library's packages aren't under your `@ComponentScan` base packages; or it ships beans
that need an `@Import` of its autoconfiguration and the starter wasn't used; or the beans
are registered by a `BeanDefinitionRegistryPostProcessor` that didn't run. Check the
`ConditionEvaluationReport` first — `/actuator/beans` or `--debug` will usually tell you
directly whether a definition exists and why it wasn't created.

**T5. Does `@Repository` change anything at runtime, or is it documentation?**

It changes runtime behaviour: `PersistenceExceptionTranslationPostProcessor` is registered
by `RepositoryConfigurationDelegate` when `@Repository`-annotated beans exist, and it wraps
the bean in a proxy that translates vendor exceptions (Hibernate, JDBC) into Spring's
`DataAccessException` hierarchy. Catch `OptimisticLockingFailureException` without depending
on Hibernate and you'll find this is why it works.

**D8. Are `@Service` and `@Repository` the same thing with different names?**

`@Repository` is not — it triggers exception translation. `@Service` is the one that's
purely semantic. So the honest statement is that the family is three behaviours and one
comment: `@Component` is the root, `@Repository` adds exception translation, `@Controller`
adds MVC registration, and `@Service` adds nothing but clarity for the human reading it.

**S3. A PR changes `@Configuration` to `@Configuration(proxyBeanMethods = false)` across the
codebase as a "CGLIB overhead" fix. What should the review check?**

Whether any configuration class calls its own `@Bean` methods directly. In lite mode those
calls construct a new unmanaged object instead of returning the singleton, and the failure
appears as two connections where one was expected, or a repository that doesn't share the
transaction. It also changes circular-dependency handling, so any inter-`@Bean` cycles that
previously resolved will now fail at startup.

### The Context Family

**P5. A scheduled job runs but its `SecurityContext` is empty. What happened?**

The scheduler runs on a different thread, and `SecurityContextHolder` defaults to
`ThreadLocal` strategy — a different thread means an empty context. Either the job should
run with an explicit elevated principal, or it should not be reading from the context at all.
The general rule: anything crossing a thread boundary must propagate context explicitly.

**T6. Does `context.getBean(MyService.class)` work if `MyService` is a JDK-proxied bean and
the bean definition's target class is `MyServiceImpl`?**

Yes, if the bean definition records a resolvable type — Spring looks at the target class when
building the proxy and stores it, which is why `getBean(MyService.class)` usually resolves.
It fails when the target class itself is only resolvable via generics that have been erased,
which is the sharp edge of the type-resolution system.

**D9. If the container can do internationalisation, resource loading and event publishing
transparently, is it a design problem for business code to call those services directly?**

No — using the `Environment` to read a genuinely dynamic value, or `MessageSource` in a
controller, is using the abstraction the container provides. The design problem is narrower:
using the container as a **service locator for business dependencies**, because that hides
the dependency graph. `env.getProperty` for a feature flag is fine; injecting
`ApplicationContext` to get a `PricingService` is not. The line is whether the container is
being used for its services or as an escape hatch around dependency injection.

**S4. A team wants a "service locator" abstraction because constructors got long. What do
you recommend instead?**

Name the actual problem: the class has too many responsibilities. Group the collaborators
behind two or three facades with meaningful names — `PricingService`, `FulfilmentService` —
which makes each constructor short and each facade independently testable. A generic locator
with `getService("pricing")` gives you the long constructor's dependency count with none of
its compile-time safety, and it makes the coupling stringly-typed.

### Events

**P6. A "customer created" email is silently never sent for about 1% of users, and the code
is `events.publishEvent(...)` followed by an `@EventListener`. What are the three candidate
causes?**

An `@TransactionalEventListener` with no active transaction (the event is discarded without
an error); an `@Async` listener whose exception was swallowed by the default
`AsyncUncaughtExceptionHandler`; or a bounded executor that rejected the task, which also
fails silently unless you configure a rejection handler. The lesson is the same in all three:
Spring's async event path has no built-in delivery guarantee, so "it didn't arrive" is never
diagnosed by the absence of an exception.

**T7. A `@TransactionalEventListener` with default phase fires and the listener itself calls
a `@Transactional` service method. Does the listener get a transaction?**

No. `AFTER_COMMIT` runs after the transaction has committed, so the transaction is no longer
active on that thread. A `@Transactional` call from an `AFTER_COMMIT` listener starts a new
transaction, which is a common surprise when someone assumes "it's still in the transaction."

**S5. A PR adds a listener that sends a Slack message. What should the reviewer ask?**

"What happens if this throws, and what happens if the process dies after the commit?" If the
listener is synchronous, its exception breaks the publisher's request. If async, it's
swallowed. If the process dies, the message is lost with no retry. The reviewer should also
confirm the listener doesn't do slow I/O inline on the caller's thread.

**D10. Is it ever worth the complexity of a transactional outbox and a broker for something
as small as "user registered → send welcome email"?**

Yes, and the reason is that "as small as" is a judgement made before you know the failure
mode. The questions that decide it are: does the effect need to reach another service, does
losing it matter, and how hard is it to detect that it was lost? If the answer to any of the
three is yes, the outbox plus broker — with a deduplication key and a retry — is the correct
primitive, and the extra infrastructure is a one-time cost against a recurring class of lost
effects. If none apply, an in-process event is genuinely the right call and the outbox is
over-engineering you should decline.

**D11. In-process events are described as "decoupling." What have they actually decoupled, and
what have they made worse?** `STAFF`

They've decoupled the *source* from the collaborators at the type level — the publisher no
longer names them. What they've made worse is discovery: the collaborator is invisible to
anyone reading the publisher, so a failure in a listener is now diagnosable only by searching
for the event type. They've also introduced an ordering dependency that lives in annotation
values across two files, and they replaced a compile-time failure (a missing collaborator) with
a silent one (a listener that no longer runs). Decoupling at the type level and coupling at the
behaviour level is the actual trade, and it should be made deliberately.

### Configuration

**P8. A pod starts and connects to a developer's local database. Nothing in the repo sets a
profile. What happened?**

A committed `spring.profiles.active: dev` in a shared `application.yml`, or an
`SPRING_PROFILES_ACTIVE` set on a CI runner that leaked into the deployment manifest. Either
way, something set a profile that beats the environment's intent — which is exactly what
position 10-11 in the precedence ladder allows. The fix is to source the active profile from
the environment and to set `spring.profiles.default: prod` so the failure mode is safe.

**T8. `--server.port=9000` on the command line, `SERVER_PORT=9000` in the environment, and
`server.port=8080` in the in-jar `application.yml`. Which wins?**

The command line, at position 3. Environment variables are position 8. The in-jar file is
position 12. The common belief that environment variables always win is wrong, and it's
wrong in the direction that matters — a CI system's convenience flag can be silently
overridden by whatever the deployment puts on the command line.

**S6. A PR adds `@Value("${feature.newCheckout:false}")` to six classes. What should the
reviewer push for?**

A single `@ConfigurationProperties(prefix = "feature")` class with a boolean field. The
scattered version has no validation, no enumeration, no IDE completion, and no single place
to answer "what feature flags exist?" — which is a question asked during incidents. The
pushback isn't stylistic; it's that the config surface becomes unauditable.

**D12. Twelve months after launch, config has 60 properties. What's the refactor path, and
what's the cost?** `STAFF`

Group them into `@ConfigurationProperties` classes by bounded context, with JSR-380
validation constraints and explicit defaults. The real cost is not the mechanical edit — it's
that validation constraints force a conversation about which values are genuinely
independent, and a surprising number of them turn out to be coupled (a retry count that
should be less than a pool size, a timeout that must be under a downstream budget). That
conversation is the point of the exercise, and the mechanical part is the easy half. Start
with the values that are most often wrong, because those are the ones with incidents behind
them.
