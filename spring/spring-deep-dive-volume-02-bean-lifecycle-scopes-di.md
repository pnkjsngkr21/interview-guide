---
title: "The Spring Complete Deep-Dive"
volume: 2
series: "BEAN LIFECYCLE, SCOPES & ADVANCED DI"
subtitle: "Study & Interview Mastery Guide"
---

# The Spring Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is the second volume of an eleven-volume study guide to the Spring ecosystem, written
for engineers who already know Java and are preparing for senior and staff-level backend
interviews. It is not a tutorial. Nothing here explains what a class is.

Volume 1 covered the container's *surface*: what a bean is, how `@Autowired` resolves, how
scanning works, how properties bind. This volume goes underneath it. The question every
chapter here answers is the one that shows up in a real design review or a 3 a.m.
`BeanCreationException`: **at what exact moment does this code run, what created it, and what
happens if it runs at the wrong moment?**

The material here is the machinery people hand-wave in interviews and then rely on in
incidents. A `@PostConstruct` that queries a table before migrations run. A `BeanPostProcessor`
declared in a non-static `@Bean` method that is not itself processed. A prototype injected
into a singleton and silently frozen at startup. A circular dependency that worked for two
years and fails the day Boot 2.6 changes a default. None of these are exotic — they are the
normal consequences of a container with eleven lifecycle callbacks, five scopes, and a
three-level circular-dependency cache, all of which are documented and all of which teams
routinely get wrong.

The through-line is **phase and provenance**. Almost every interesting failure in this volume
reduces to one of two questions: *which phase of `refresh()` is this code running in?* and
*is this bean Spring's, mine, or a proxy around one of the two?*

### Continuing From Volume 1

| Volume | Coverage |
| --- | --- |
| Volume 1 | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 (this book) | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 2

- Chapter 1 — The Full Bean Lifecycle
- Chapter 2 — BeanPostProcessor vs BeanFactoryPostProcessor
- Chapter 3 — Bean Scopes
- Chapter 4 — Bean Validation
- Chapter 5 — Dynamic Bean Registration
- Chapter 6 — Resource Loading & the Environment
- Chapter 7 — Circular Dependencies
- Chapter 8 — Interview Scenario Bank

---

# Part 1 — Bean Lifecycle, Scopes & Advanced DI

## Chapter 1 — The Full Bean Lifecycle

### 1.1 The Complete Creation Sequence

Every singleton is built by `AbstractAutowireCapableBeanFactory.doCreateBean()`. The method
name is a warning, not a description — the thing doing the work is roughly 300 lines of
callback dispatch, and every Spring lifecycle bug is a misreading of one of its branches.

```text
 ApplicationContext.refresh()
  │
  └─ finishBeanFactoryInitialization()  ◄── PHASE 3: singletons created HERE
       │
       └─ getBean("orderService")
            │
            ▼
 ┌────────────────────────────────────────────────────────────────────────┐
 │ 1. INSTANTIATION                                                       │
 │    ├─ InstantiationAwareBeanPostProcessor                              │
 │    │     .postProcessBeforeInstantiation()   ← can return a proxy and   │
 │    │                                          skip the constructor     │
 │    ├─ Supplier<T>.get()  │  static factory method  │  constructor      │
 │    └─ an ObjectFactory lambda is parked in singletonFactories (L3)     │
 │       so a cycle can ask for this instance before it is finished       │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 2. PROPERTY POPULATION                                                 │
 │    MergedBeanDefinitionPostProcessor                                   │
 │    InstantiationAwareBeanPostProcessor.postProcessPropertyValues()     │
 │    → @Autowired fields, @Value, <property>, setter injection           │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 3. AWARE CALLBACKS                                                     │
 │    BeanNameAware.setBeanName()                                         │
 │    BeanClassLoaderAware.setBeanClassLoader()                           │
 │    EnvironmentAware.setEnvironment()  (ApplicationContextAware extends  │
 │                                        this — it is a 4th, unnamed)   │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 4. BeanPostProcessor.postProcessBeforeInitialization()                │
 │    └─ CommonAnnotationBeanPostProcessor fires @PostConstruct IN HERE    │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 5. InitializingBean.afterPropertiesSet()                               │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 6. custom init-method   (@Bean(initMethod = "…"))                     │
 ├────────────────────────────────────────────────────────────────────────┤
 │ 7. BeanPostProcessor.postProcessAfterInitialization()                 │
 │    └─ AbstractAutoProxyCreator wraps the bean here — the AOP proxy     │
 │       is born at step 7, so a proxy's own @PostConstruct never ran     │
 └────────────────────────────────────────────────────────────────────────┘
            │
            ▼
   promotion: earlySingletonObjects (L2) ──► singletonObjects (L1)
```

Then the destruction sequence, which is **not** the reverse of the creation sequence — and
the fact that it isn't is the subject of Section 1.5.

```text
 context.close()  /  DisposableBean destruction pass
  │
  ├─ 1. DestructionAwareBeanPostProcessor
  │        .postProcessBeforeDestruction()
  │        └─ CommonAnnotationBeanPostProcessor fires @PreDestroy HERE
  │
  ├─ 2. DisposableBeanAdapter.destroy()
  │        ├─ DisposableBean.destroy()
  │        ├─ else if bean instanceof AutoCloseable → close()
  │        └─ then the custom destroy-method
  │
  └─ 3. (nothing) — the container does not track prototypes at all
```

> **MUST REMEMBER**
>
> **`@PostConstruct` runs BEFORE `afterPropertiesSet()`.** This is the single most-asked
> ordering question in Spring interviews and the most common wrong answer, because the two
> are documented in two different places — `@PostConstruct` in the JSR-250 lifecycle
> annotations section, `InitializingBean` in the "customising the nature of a bean"
> section — and the documentation never puts them side by side.
>
> The reason is structural, not conventional. `@PostConstruct` is not a callback the
> container *calls*; it is invoked from inside
> `CommonAnnotationBeanPostProcessor.postProcessBeforeInitialization()`. It is a
> `BeanPostProcessor` firing an annotation, one layer below the callback the container
> dispatches. The container only reaches `afterPropertiesSet()` two steps later.
>
> Getting this wrong in an interview costs a mark. Getting it wrong in production means code
> that reads, in source order, as "validate then initialise" executes as "initialise then
> validate" — or more often, the two methods both assume the other ran first.

### 1.2 Instantiation: How the Object Is Actually Made

Three paths, chosen in this order, plus one interceptor that sits above all of them.

```java
// 1. A Supplier — used by the container when the bean definition
//    sets one. Referred to in the wild as the "lambda constructor".
bd.setInstanceSupplier(() -> new OrderService(repo));

// 2. A static factory method — BeanDefinition.getFactoryMethodName()
@Bean
public static OrderService orderService() { ... }      // static is REQUIRED
                                              // only when it must be callable
                                              // without instantiating the config class

// 3. A constructor — the normal case.
//    0-arg preferred; single-arg auto-selected only while unambiguous;
//    multiple args → the @Autowired constructor wins.
```

Above all three sits
`InstantiationAwareBeanPostProcessor.postProcessBeforeInstantiation(beanClass, beanName)`.
This is the least-known hook in the whole container, and it is the one that makes
`@Lookup`, `abstract-method` bean definitions, and lazy-resolution proxies possible — a
post-processor may **return a fully-formed substitute object and the constructor never
runs**. `InstantiationAwareBeanPostProcessorAdapter.postProcessBeforeInstantiation` is the
default implementation and returns `null`, which means "carry on."

> **PRODUCTION RELEVANCE**
>
> The consequence of step 7 existing at all: for any proxied bean, `@PostConstruct` runs on
> the **target**, not the proxy, and it runs **before** the proxy exists. So a `@PostConstruct`
> that calls a method the aspect is supposed to intercept — `@Transactional`, `@PreAuthorize`,
> a custom metric aspect — sees the *unproxied* method. No transaction, no security check, no
> metrics. Volume 3 covers this in full; the one-line version is that you cannot rely on your
> own aspects intercepting your own initialisation callbacks.

### 1.3 The Aware Callbacks

```java
public class DiagnosticBean implements BeanNameAware,
                                    BeanClassLoaderAware,
                                    ApplicationContextAware {

    @Override public void setBeanName(String name)             { ... }   // always called
    @Override public void setBeanClassLoader(ClassLoader cl)    { ... }   // unless overridden
    @Override public void setApplicationContext(ApplicationContext ctx) { ... }
}
```

| Interface | What it receives | Called for |
| --- | --- | --- |
| `BeanNameAware` | The bean name it was registered under | Every bean |
| `BeanClassLoaderAware` | The context's class loader | Every bean |
| `EnvironmentAware` | The `Environment` | Every bean |
| `ApplicationContextAware` | The context itself | Every bean |
| `ResourceLoaderAware` | The `ResourceLoader` | Every bean |
| `ApplicationEventPublisherAware` | The publisher | Every bean |
| `MessageSourceAware` | The `MessageSource` | Every bean |

`ApplicationContextAware` is not a Spring-level interface — it is declared in
`org.springframework.context` and it *extends* `EnvironmentAware`, `ResourceLoaderAware`,
`ApplicationEventPublisherAware` and `MessageSourceAware`. The container therefore makes
**four** `Aware` calls when it makes the fifth. That detail matters for anyone writing a
`BeanPostProcessor` that logs what a bean is wired into.

Note the condition on `BeanClassLoaderAware`: it is skipped when the bean is being created
as part of a bean factory's own internal operations for a `BeanClassLoaderAware` — a real
edge case in the framework's own internals, rarely relevant to application code.

> **INTERVIEW TRAP**
>
> "`BeanFactoryAware`/`ApplicationContextAware` is the container's back door and should never
> be used in business code" is the right instinct and the wrong framing. It is a legitimate
> dependency when the value genuinely cannot be known at construction — a tenant resolver, a
> pluggable feature registry, a test seam. It is a service locator, and service locators are
> wrong when they *avoid a refactor*.
>
> The sharper version of the question is: **implementing `ApplicationContextAware` makes the
> class depend on the container, which means it cannot be constructed in a plain unit test.**
> A senior answer distinguishes "implements the Aware interface" (container coupling, the
> class is no longer framework-independent) from "has a `setApplicationContext` method by
> convention but nothing calls it" (harmless dead code that confuses the next reader).

### 1.4 Initialisation: Four Callbacks, One Order

```java
@Component
public class OrderService implements InitializingBean {

    @PostConstruct
    void postConstruct() {
        // STEP 4 — inside CommonAnnotationBeanPostProcessor
        // Fires BEFORE afterPropertiesSet(). Has no access to a proxy.
    }

    @Override
    public void afterPropertiesSet() {
        // STEP 5 — the container calls this directly
    }

    @Bean(initMethod = "warmUp")           // STEP 6 — name-based, on a @Bean method
    public PaymentClient paymentClient() { ... }
}
```

| Step | Mechanism | Fails loudly? | Sees the proxy? |
| --- | --- | --- | --- |
| `@PostConstruct` | `CommonAnnotationBeanPostProcessor` (a BPP) | Yes — `BeanCreationException` wrapping the cause | No |
| `afterPropertiesSet()` | `InitializingBean`, dispatched by `invokeInitMethods` | Yes | No |
| custom `init-method` | Name on the `BeanDefinition`, invoked after `afterPropertiesSet` | Yes | No |
| `postProcessAfterInitialization()` | The last BPP in the chain | Yes | This is where the proxy is made |

All four are on the **creation path** of a singleton, and all four run during
`finishBeanFactoryInitialization()` — phase 3 of `refresh()`. The practical consequence,
restated because it is the highest-yield fact in this chapter: **all of it happens during
context refresh, before your application's scheduled jobs run, and in an order that is not
the order your eye reads the file in.**

The distinction between the three is mostly a compatibility artefact now. `InitializingBean`
predates annotations; `@PostConstruct` is the JSR-250 standard; `init-method` is the
XML-era name-based approach that survives because it works on beans you didn't write. The
one that still earns its place is `InitializingBean` on **framework interfaces** — Spring
uses it internally (`afterPropertiesSet` on `FactoryBean` support, on `InitializingBean`
inside `AbstractPropertySource` adapters, on AOP infrastructure), and implementing an
interface avoids string-based coupling that refactoring tools can break.

> **TRADE-OFF**
>
> If you are choosing between `@PostConstruct` and `afterPropertiesSet()` in your own code,
> use `@PostConstruct`. It is the standard, refactoring tools understand it, it does not
> make your class implement a Spring interface, and it composes with the JSR-250 lifecycle
> that other containers also honour. The flip condition is the interface case above: when
> you are implementing a framework contract that declares `InitializingBean`, you have no
> choice, and you should know that your method runs *after* every `@PostConstruct` in the
> same class.

### 1.5 Destruction — and Why Its Order Differs

The creation order is intuitive. The destruction order is not, and the reason is worth
knowing because it explains a real asymmetry.

```text
CREATION                                    DESTRUCTION
──────────────────────────────────────      ──────────────────────────────────────
instantiate                                 @PreDestroy
populate properties                         DisposableBean.destroy()
@PostConstruct (inside a BPP)                custom destroy-method
afterPropertiesSet()
custom init-method
postProcessAfterInitialization (proxy born)

Destruction is NOT the reverse. @PreDestroy fires FIRST on destruction, not last.
```

**Why.** `@PreDestroy` is handled by `DestructionAwareBeanPostProcessor`, which is a
*different* extension point from `BeanPostProcessor`. `AbstractAutowireCapableBeanFactory`
calls `applyBeanPostProcessorsBeforeDestruction(bean, name)` — the destruction-aware
pre-pass — **before** it calls `bean.destroy()` on the `DisposableBeanAdapter`. The same
`CommonAnnotationBeanPostProcessor` that fires `@PostConstruct` inside
`postProcessBeforeInitialization` fires `@PreDestroy` inside
`postProcessBeforeDestruction`, and those are two different phases of the container's
dispatch, at the two ends of the lifecycle. Symmetry of the *API* was never the design goal;
symmetry of the *dispatch points* is.

`DisposableBeanAdapter` is the object that owns the rest of it, and it is where the
name-based and interface-based mechanisms are unified:

```java
// DisposableBeanAdapter.destroy(), simplified
if (bean instanceof DisposableBean) {
    ((DisposableBean) bean).destroy();                       // 1
} else if (bean instanceof AutoCloseable) {
    ((AutoCloseable) bean).close();                          // 2 — try-with-resources closes
}                                                            //     your beans instead
if (this.customDestroyMethodName != null) {                  // 3
    invokeCustomDestroyMethod();
}
```

Three things fall out of this that bite in production:

1. **The `else if` is exclusive, the custom method is not.** A bean that implements
   `DisposableBean` does *not* get its `AutoCloseable.close()` called by the adapter — only
   the custom `destroy-method`, if you declared one. A bean that implements only
   `AutoCloseable` gets `close()` and nothing else.
2. **`@Bean(destroyMethod = "")` disables the inference.** By default, Spring *infers* a
   `close()` or `shutDown()` method on a `@Bean` return type and registers it. Setting
   `destroyMethod = ""` turns that off — which is what you want for a bean whose lifecycle
   the framework owns (a `DataSource` whose pool you manage elsewhere, for instance).
3. **`DisposableBeanAdapter` is also where the inferred-destroy-method determination
   happens**, which is why a `@Bean` method returning a type with a public `close()` gets a
   shutdown callback you never wrote.

> **INTERVIEW TRAP — "@PostDestroy vs destroy() ORDER"**
>
> The reflexive answer is that the creation-order list runs backwards, so `@PreDestroy` is
> last. It is **first**. The reason is that `@PostConstruct` and `@PreDestroy` are both
> fired by `CommonAnnotationBeanPostProcessor`, and it is a *destroyation-aware* processor
> whose pre-destruction pass runs before the `DisposableBeanAdapter` is ever consulted. If
> you can name `DestructionAwareBeanPostProcessor.postProcessBeforeDestruction` and say it
> runs before `DisposableBeanAdapter.destroy()`, you have answered it correctly. A candidate
> who says "reverse order" has memorised a symmetry that the implementation does not have.

### 1.6 Refresh Time vs First Use

This is the question that decides whether a bean is safe to touch the network from.

| | Runs at refresh (phase 3) | Runs at first `getBean()` |
| --- | --- | --- |
| Non-lazy singleton | Yes | Already built |
| `@Lazy` singleton | No | Yes, on first injection/use |
| `SmartInitializingSingleton` | Yes, all together at the end | No |
| `prototype` | No | Every single time, forever |
| `request` / `session` scope | Bound at request time | Per request / per session |
| `ApplicationListener` on `ContextRefreshedEvent` | Last thing in `refresh()` | No |

So the honest answer to "does this run at startup?" is: **it depends on scope and laziness,
and you should be able to say which before you open the file.** The four cases that generate
incidents:

```java
@Lazy                              // moved to first use — a cold-start latency spike
@PostConstruct void init() { cacheClient.warmUp(); }

@PostConstruct                     // UNCHANGED — still at refresh, still before
void init() { repository.count(); }   // your Flyway migration has run

@PostConstruct                     // scope does not save you
void init() { /* this is a prototype: it runs on EVERY getBean() */ }
```

A prototype's `@PostConstruct` runs on **every single `getBean()` call**. If your prototype
does expensive work in `@PostConstruct`, an injected prototype that is resolved lazily turns
a bean into a per-call expense. This is the least-known consequence of prototype scope and it
is exactly what Chapter 3's `ObjectProvider` discussion comes back to.

### 1.7 The Batch Case — `SmartInitializingSingleton`

Individual callbacks are a poor fit for work that should happen *after everything else is
built*: a cache that must be populated from the database, a scheduler that must not start
until every listener is registered.

```java
@Component
public class SearchIndexWarmer implements SmartInitializingSingleton {

    @Override
    public void afterSingletonsInstantiated() {
        // Runs ONCE, after finishBeanFactoryInitialization() has built
        // every non-lazy singleton. Safe to inject ANY bean here, including
        // ones defined in a file you have never read.
    }
}

@Component
public class GracefulScheduler implements SmartInitializingSingleton, DisposableBean {

    @Override public void afterSingletonsInstantiated() { scheduler.start(); }

    @Override public void destroy() throws Exception {
        scheduler.shutdown();
        scheduler.awaitTermination(30, TimeUnit.SECONDS);   // bounded — see below
    }
}
```

`afterSingletonsInstantiated()` is the only lifecycle callback where the container is
guaranteed to be fully populated. That guarantee is the whole point, and it is why it exists
separately: a `SmartInitializingSingleton` can inject a collaborator by constructor with
zero risk of `BeanCurrentlyInCreationException`, which a `@PostConstruct` doing the same
thing can hit.

```text
    finishBeanFactoryInitialization()
      │
      ├─ preInstantiateSingletons()  ── every non-lazy singleton, in dependency order
      │      └─ each one: instantiate → populate → @PostConstruct → afterPropertiesSet
      │                  → init-method → postProcessAfterInitialization
      │
      └─ THEN: for every SmartInitializingSingleton → afterSingletonsInstantiated()
```

> **PRODUCTION RELEVANCE**
>
> Two practical notes. First, `SmartInitializingSingleton` is the correct place to start a
> scheduler, a poller, or a warm-up job — starting them in `@PostConstruct` races every bean
> that happens to be defined after yours. Second, a blocking `afterSingletonsInstantiated()`
> blocks *context refresh*, which means it delays the web server accepting traffic, and it
> delays a Kubernetes readiness probe. A 30-second database warm-up in this method is a
> 30-second window where the pod is not ready. If the work is not essential to correctness,
> the honest answer is: do it asynchronously, and make the result observable.
>
> On the other side: `destroy()` on the same class is a `DisposableBean` callback, and the
> container's shutdown sequence gives you **no default timeout**. A `destroy()` that blocks
> on a 60-second HTTP call makes every pod take 60 seconds to terminate, and most
> orchestrators will `SIGKILL` you first. Always bound your own wait and understand that
> the JVM's own shutdown hooks have their own separate budget.

#### Common Mistakes

- Believing destruction callbacks run in the reverse order of creation callbacks. They don't
  — `@PreDestroy` runs first because it is fired by a `DestructionAwareBeanPostProcessor`
  pre-pass, before `DisposableBeanAdapter` is consulted.
- Doing network or database I/O in `@PostConstruct` on a non-lazy singleton. That is phase 3
  of `refresh()`, which is before Flyway, before your scheduler, and — in some setups —
  before the web server has finished starting.
- Assuming a prototype's callbacks run once. Every `getBean()` on a prototype re-runs
  instantiation, population, `@PostConstruct`, `afterPropertiesSet`, `init-method` and
  `postProcessAfterInitialization`. Prototypes with expensive callbacks are a per-call cost.
- Registering a `BeanPostProcessor` from a non-static `@Bean` method and expecting it to be
  applied to the beans defined alongside it. Post-processors are created in
  `registerBeanPostProcessors()`, which runs *before* `finishBeanFactoryInitialization()` —
  see Chapter 2.
- Declaring a bean `implements InitializingBean` without knowing that `afterPropertiesSet()`
  runs after every `@PostConstruct` in the same class, and after the Aware callbacks, and
  before the proxy exists.
- Expecting `@PostConstruct` code to be intercepted by your own `@Transactional` /
  `@PreAuthorize` aspects. The proxy is created in `postProcessAfterInitialization`, two
  steps later.
- Writing a `destroy()` that blocks on a remote call without a bounded wait. Shutdown stops
  being observable and the orchestrator starts killing you.

#### Interview Questions — The Bean Lifecycle

**Q1. State the full bean creation sequence, in order.** `TRICKY`

Instantiation (Supplier, static factory method, or constructor — after
`postProcessBeforeInstantiation` has had its chance to substitute a bean), then property
population (`@Autowired` fields, `@Value`, setters), then the `Aware` callbacks
(`BeanNameAware`, `BeanClassLoaderAware`, `EnvironmentAware` — with `ApplicationContextAware`
triggering four separate `Aware` calls because it extends the other three), then
`postProcessBeforeInitialization`, then `InitializingBean.afterPropertiesSet()`, then the
custom `init-method`, then `postProcessAfterInitialization` — which is where AOP proxies are
created.

**Q2. Does `@PostConstruct` run before or after `afterPropertiesSet()`?** `TRICKY`

Before. `@PostConstruct` is invoked from inside
`CommonAnnotationBeanPostProcessor.postProcessBeforeInitialization()` — it is a
`BeanPostProcessor` firing an annotation, not a container-dispatched callback. The container
only reaches `invokeInitMethods()` (and therefore `afterPropertiesSet()`) after the
`postProcessBeforeInitialization` pass completes.

**Q3. Does `@PreDestroy` run before or after `DisposableBean.destroy()`?** `TRICKY`

Before. `@PreDestroy` is fired by `DestructionAwareBeanPostProcessor.postProcessBeforeDestruction()`,
which the factory calls before it ever reaches the `DisposableBeanAdapter`. So destruction is
*not* the reverse of creation, despite the appealing symmetry — because the two annotation
hooks hang off two different dispatch phases, one inside the BPP chain at the start of
initialisation and one in a pre-destruction pass at the very end.

**Q4. A `@PostConstruct` calls a method annotated `@Transactional`. Does it run in a
transaction?** `ADVANCED`

No. The AOP proxy is created in `postProcessAfterInitialization`, which is the *last* step
— two steps after `@PostConstruct` has already run. Even if the bean were already proxied,
calling through the injected reference from inside the target does not re-enter the proxy.
The correct answers are to move the work into a `TransactionTemplate` explicitly, or into
another bean's public method that is itself transactional, and to understand that this is
self-invocation rather than a lifecycle bug.

**Q5. A bean implementing `DisposableBean` also implements `AutoCloseable`. Which is
called?** `TRICKY`

Only `destroy()`. `DisposableBeanAdapter` uses `if (bean instanceof DisposableBean) ...
else if (bean instanceof AutoCloseable)`, so the branches are exclusive. A custom
`destroy-method`, if declared, is invoked *in addition* to whichever of the two fired — that
call sits outside the `if`/`else if`.

**Q6. What is `SmartInitializingSingleton` for, and when would you use it over
`@PostConstruct`?** `TRICKY`

For work that must happen after the container is fully populated. `afterSingletonsInstantiated()`
runs once, after `finishBeanFactoryInitialization()` has built every non-lazy singleton, so
it can safely inject any bean — including one from a file you have never read. `@PostConstruct`
on a bean's own initialisation can't guarantee that, which is why it produces
`BeanCurrentlyInCreationException` in a cycle. The cost is that it blocks context refresh, so
it delays readiness; for a scheduler start this is correct, for a long warm-up it is a
trade-off you should be able to justify.

**Q7. Your context has 3,000 beans and refresh takes 25 seconds. Which lifecycle callbacks
are the first thing you'd audit and why?**

Every `@PostConstruct` and every non-lazy `@Bean` method that does I/O, because they all run
in `finishBeanFactoryInitialization()` and they run *serially on the refresh thread*. A
`@PostConstruct` making three HTTP calls at 200ms each is 600ms per bean. Then
`SmartInitializingSingleton` implementations, which are a single serial batch by definition.
What I would not do is reach for `spring.main.lazy-initialization` as the fix — see the
scenario bank, D6 in Volume 1 — because it moves a startup failure into a first-request
failure.

> **CHAPTER 1 SUMMARY**
>
> The lifecycle is eleven dispatch points in a fixed order, and almost every Spring startup
> bug is a misread of that order. `@PostConstruct` runs *before*
> `afterPropertiesSet()` because it is fired from inside a `BeanPostProcessor` pass, not by
> the container; `@PreDestroy` runs *before* `destroy()` because it is fired from a
> `DestructionAwareBeanPostProcessor` pre-pass, and destruction is therefore not the reverse
> of creation. Everything on the singleton creation path runs during
> `finishBeanFactoryInitialization()` — which means before your migrations, before your
> scheduler, and before the web server is ready. The AOP proxy is created in the last step,
> so no callback before it can be intercepted by your own aspects. And the two answers that
> separate a senior from a staff candidate are knowing *why* the annotation hooks are ordered
> the way they are, and knowing that a prototype re-runs the entire sequence on every
> `getBean()`.

#### Further Reading

- [Spring Framework Reference — Customizing the Nature of a Bean](https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html) — `InitializingBean`, `DisposableBean`, `@PostConstruct`, `@PreDestroy`, custom init/destroy methods, and the `DisposableBeanAdapter` rules in one page. This is the authoritative callback documentation and it contradicts most blog posts.
- [Spring Framework Reference — @PostConstruct and @PreDestroy](https://docs.spring.io/spring-framework/reference/core/beans/annotation-config/postconstruct-and-predestroy-annotations.html) — the JSR-250 lifecycle annotations specifically, including what the container does *not* guarantee about their order relative to the Spring interfaces.
- [Spring Framework Reference — Application Startup Steps](https://docs.spring.io/spring-framework/reference/core/appendix/application-startup-steps.html) — the phase-by-phase list of what `refresh()` actually does; use it to settle any "does this run at startup?" argument with a citation rather than a recollection.
- [Spring Framework Reference — Bean Scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html) — the next chapter's territory, but the lifecycle and destruction sections here are the ones that explain why prototypes are not tracked.

## Chapter 2 — BeanPostProcessor vs BeanFactoryPostProcessor

### 2.1 The Two-Phase Hook Model

Spring has two extension points and confusing them is one of the most reliable ways to
write a post-processor that appears to do nothing.

```text
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  PHASE 1 — BeanFactoryPostProcessor                                       │
 │  Timing:  refresh() step 4, postProcessBeanFactory()                     │
 │  Input:   BeanDefinition objects — METADATA, no instances yet            │
 │  Power:   add, remove, MUTATE bean definitions                          │
 │  Cannot:  see a bean instance, inject one, be proxied                   │
 │                                                                          │
 │    ├─ PropertySourcesPlaceholderConfigurer   resolves ${...} in           │
 │    │                                          bean definition VALUES    │
 │    └─ ConfigurationClassPostProcessor        reads @Configuration,       │
 │                                               @ComponentScan, @Import,  │
 │                                               and REGISTERS the @Bean   │
 │                                               definitions it finds      │
 ├──────────────────────────────────────────────────────────────────────────┤
 │  PHASE 2 — BeanPostProcessor                                              │
 │  Timing:  refresh() step 5 registers them; applied to EACH bean          │
 │           as it is created, in phase 3                                    │
 │  Input:   live bean instances                                            │
 │  Power:   wrap, replace, inspect, or veto a bean                         │
 │  Cannot:  affect which definitions exist                                 │
 │                                                                          │
 │    ├─ AutowiredAnnotationBeanPostProcessor     processes @Autowired       │
 │    ├─ CommonAnnotationBeanPostProcessor        @PostConstruct, @Resource │
 │    ├─ AnnotationAwareAspectJAutoProxyCreator   creates the AOP PROXIES   │
 │    ├─ PersistenceExceptionTranslationPostProc. wraps @Repository beans    │
 │    └─ ConfigurationClassPostProcessor's BPP    full vs lite mode         │
 └──────────────────────────────────────────────────────────────────────────┘
```

The single sentence that settles almost every question in this chapter: **a
`BeanFactoryPostProcessor` runs before beans exist and therefore cannot see one; a
`BeanPostProcessor` runs once per bean and therefore cannot see the whole graph.**

| | `BeanFactoryPostProcessor` | `BeanPostProcessor` |
| --- | --- | --- |
| Sees | `BeanDefinition`s | Bean instances |
| Runs | Once, at refresh step 4 | Once per bean, as it is created |
| Can register new definitions? | No (that's the registry subclass) | No, ever |
| Can mutate scope/lazy/qualifiers? | Yes | No |
| Can return a substitute object? | No | Yes — `postProcessAfterInitialization` |
| Typical user | Rare — you almost never write one | Common, and dangerous |
| Spring's own examples | `PropertySourcesPlaceholderConfigurer`, `ConfigurationClassPostProcessor` | `AutowiredAnnotationBeanPostProcessor`, `AnnotationAwareAspectJAutoProxyCreator` |

### 2.2 The Two That Matter — and Both Are Spring's Own

`PropertySourcesPlaceholderConfigurer` is a `BeanFactoryPostProcessor` that walks every bean
definition and resolves `${...}` placeholders in property *values*, so that by the time the
bean is instantiated, `@Value("${payment.url}")` holds a concrete string. It is a
`BeanFactoryPostProcessor` precisely because it must run before instantiation — it is
changing the recipe, not the meal.

`ConfigurationClassPostProcessor` is the other, and it is more interesting: it is registered
as a `BeanDefinitionRegistryPostProcessor` and it is what turns `@Configuration` classes into
bean definitions at all. Chapter 5 covers what it does with `@Import`; what matters here is
the *phase*. It has to run in phase 1, because everything it produces is a `BeanDefinition`.

> **INTERVIEW TRAP — "WHAT IS THE ORDER OF POST-PROCESSORS?"**
>
> There is no guaranteed order for `BeanPostProcessor`s, and asserting one costs the point.
> The rules that actually hold:
>
> - `PriorityOrdered` post-processors run first, then `Ordered`, then the rest — in
>   registration order within each group.
> - `postProcessBeforeInitialization` is called in registration order;
>   `postProcessAfterInitialization` is called in **reverse** registration order. That
>   asymmetry is deliberate: it means a later-registered post-processor that wraps a bean
>   ends up *outside* an earlier-registered one's wrapper.
> - The order in which post-processors are *registered* is not the order in your source
>   file. `PriorityOrdered` beats `Ordered` beats registration, and the registration order
>   itself comes from `getBeanNamesForType` over the registry.
>
> If your post-processor's behaviour depends on running before or after another one, the
> only robust answer is to implement `PriorityOrdered` and say so — not to hope.

### 2.3 `@Configuration`, CGLIB, and Full vs Lite Mode

Volume 1 Chapter 4 covered *why* `@Configuration` needs CGLIB: so an intra-config call to a
`@Bean` method returns the container-managed singleton rather than constructing a second
object. This chapter adds the part that is genuinely obscure — **how the container decides
between full and lite mode**, and what that has to do with post-processor phases.

```text
 ConfigurationClassPostProcessor  (a BeanDefinitionRegistryPostProcessor, phase 1)
   │
   ├─ parses each @Configuration class
   │     ├─ @PropertySource        → registers a PropertySource
   │     ├─ @ComponentScan        → scans, registers @Component definitions
   │     ├─ @Import               → recurses or delegates (Chapter 5)
   │     └─ @Bean methods         → registers a bean definition PER METHOD
   │
   └─ for each parsed class, records a flag in the ConfigurationClass:
         lite mode  ← if proxyBeanMethods=false, or the class is final,
                      or a @Bean method is private/final/static-should-be,
                      or the class has no intra-config calls
         full mode  ← otherwise
```

Full mode is what produces the CGLIB-enhanced subclass, and the enhancement happens through
a `BeanPostProcessor` — `ConfigurationClassEnhancer`, registered as an
`InstantiationAwareBeanPostProcessor` in phase 2. So the two halves of this answer live in
different phases: the *decision* is made in phase 1 by
`ConfigurationClassPostProcessor`, the *mechanism* is installed in phase 2, and the
*enhancement* is applied in phase 3 when the config class bean is created.

```java
@Configuration(proxyBeanMethods = false)      // lite — no CGLIB, no self-call interception
public class InfraConfig {
    @Bean DataSource dataSource() { ... }
    @Bean JdbcTemplate jdbcTemplate(DataSource ds) { return new JdbcTemplate(ds); }  // parameter!
}

// A @Bean method may only be non-static if the config class is NOT used by another
// @Configuration class. Two config classes calling each other's @Bean methods is the
// case that produces "Bean method 'x' is non-static and returns an object of type 'y'".
```

> **PRODUCTION RELEVANCE**
>
> The most common real-world symptom of getting this wrong is a bean that works in
> integration tests and behaves differently in production for no reason anyone can find. The
> mechanism is always the same: a `@Configuration` class in **lite** mode whose
> `@Bean` method calls its own method directly, producing a second unmanaged instance.
> Lite mode is silent about it — no warning, no log line. The two instances then disagree
> about state, and the disagreement surfaces as a cache that never invalidates or a
> transaction that never commits.
>
> The rule that holds up: **pass collaborators as `@Bean` method parameters, never by
> calling your own `@Bean` methods.** It works identically in both modes, it is what the
> container would do anyway, and it removes an entire class of bug that toggling
> `proxyBeanMethods` can resurrect.

### 2.4 The Ordering Problem — Why `@Bean` Post-Processors Must Be `static`

This is the one that bites teams writing a custom post-processor, and the failure message
gives almost no hint of the cause.

```java
@Configuration
public class MetricsConfig {

    @Bean                                             // ← NOT static
    public MetricsBeanPostProcessor metricsPostProcessor() {
        return new MetricsBeanPostProcessor();
    }
}

public class MetricsBeanPostProcessor implements BeanPostProcessor {
    @Override
    public Object postProcessAfterInitialization(Object bean, String name) {
        if (bean instanceof MyService) ((MyService) bean).enableMetrics();
        return bean;
    }
}
```

Why the `static` is mandatory:

1. To register post-processors, the container calls `beanFactory.getBean(...)` on the
   `@Bean` method during `registerBeanPostProcessors()` — **refresh step 5**.
2. Invoking a non-static `@Bean` method requires an instance of the configuration class.
3. Creating that instance means creating the config class bean — which means running it
   through the `BeanPostProcessor` chain, which at that point contains almost nothing,
   because you are *in the middle of registering* the chain.

The result is a `BeanCurrentlyInCreationException` (or, more confusingly, a
`BeanPostProcessorChecker` warning in Boot) telling you the post-processor is not eligible
for auto-proxying or is declared non-static. `BeanPostProcessorChecker` exists precisely
because this is the single most common authoring mistake for the extension point:

```text
Bean 'xxx' is not eligible for getting processed by all BeanPostProcessors
(for example: not eligible for auto-proxying)
```

`static` fixes it because a static `@Bean` method needs no instance, so nothing is being
created recursively. **The other legal fix is to implement `BeanFactoryPostProcessor`'s
sibling contract — declare it as a `static` method, or register it as a component
*definition* rather than instantiating it through the config class.** The `static @Bean`
method is the idiom; a `BeanDefinitionRegistryPostProcessor` is not a substitute for a
`BeanPostProcessor`.

> **SCALING REALITY CHECK**
>
> A `postProcessAfterInitialization` that does real work runs **once per bean, per
> refresh** — 3,000 beans means 3,000 invocations, plus once more per early-reference
> resolution in a cycle. A post-processor that does a `Map` lookup, a string check, or
> reflection on the bean's class costs perhaps microseconds; one that logs, resolves
> annotations, or builds a key through `ClassUtils.getUserClass` costs more. This is not
> where your 25-second startup comes from — it is where a 5-millisecond regression comes
> from after someone adds a log line. Keep the hot path to an early `instanceof` return.

### 2.5 Programmatic Registration

You rarely declare a post-processor in Java config. You usually register it against the
`BeanFactory` directly, which is what several frameworks do.

```java
// Programmatic — works with a plain BeanFactory, no annotations involved
var factory = new DefaultListableBeanFactory();
factory.addBeanPostProcessor(new TracingPostProcessor());
factory.registerSingleton("clock", Clock.systemUTC());
OrderService svc = factory.getBean(OrderService.class);   // traced at creation

// BeanDefinitionRegistryPostProcessor — the registry-capable subclass.
// Can ADD or REMOVE definitions before anything is instantiated.
public class TenantBeanRegistrar implements BeanDefinitionRegistryPostProcessor {
    @Override
    public void postProcessBeanDefinitionRegistry(BeanDefinitionRegistry registry) {
        for (String tenant : tenantRepository.activeTenants()) {
            GenericBeanDefinition bd = new GenericBeanDefinition(TenantContext.class);
            bd.getConstructorArgumentValues().addGenericArgumentValue(tenant);
            registry.registerBeanDefinition("tenantContext-" + tenant, bd);
        }
    }
    @Override
    public void postProcessBeanFactory(ConfigurableListableBeanFactory bf) { /* optional */ }
}
```

`addBeanPostProcessor` on a live factory is the sharp edge: a post-processor added *after*
beans have been created will never see those beans. Register it first or don't bother.

> **MUST REMEMBER**
>
> **`BeanFactoryPostProcessor` → `BeanDefinitionRegistryPostProcessor` is a two-step
> extension ladder, and the second step is the one that changes what you can do.** The
> registry subclass adds `postProcessBeanDefinitionRegistry`, letting you register or remove
> definitions; the `postProcessBeanFactory` callback it inherits is otherwise identical.
> Spring Boot's own auto-configuration import, `ConfigurationClassPostProcessor`, and every
> third-party starter's `META-INF/spring.factories` `EnableAutoConfiguration` entry sit on
> this ladder. That is why a starter can add beans to your application without you
> importing anything.

#### Common Mistakes

- Writing a `BeanPostProcessor` to change a bean's scope, lazy flag, or qualifiers. Those
  live on the `BeanDefinition`, and by the time a `BeanPostProcessor` runs, the definition
  has already been used. That is a `BeanFactoryPostProcessor`'s job.
- Declaring a `BeanPostProcessor` in a non-static `@Bean` method. It must be `static`,
  otherwise the container has to instantiate the configuration class to reach the
  post-processor — during post-processor registration, before the chain exists.
- Assuming `BeanPostProcessor`s run in source or registration order. Implement
  `PriorityOrdered`; don't guess.
- Adding a `BeanPostProcessor` to a running factory with `addBeanPostProcessor` and expecting
  it to retroactively process existing beans. It only sees beans created after the call.
- Confusing "the `@PostConstruct` didn't run" with "the `BeanPostProcessor` didn't run." If a
  `CommonAnnotationBeanPostProcessor` has been displaced by a `PriorityOrdered` one of your
  own, `@PostConstruct` disappears application-wide — a genuine, catastrophic, and
  easy-to-miss failure.
- Registering a post-processor that returns `null` from `postProcessAfterInitialization`
  thinking it's a no-op. Returning `null` deletes the bean and produces
  `BeanNotOfRequiredTypeException` or a `NullBeanException`.

#### Interview Questions — Post-Processors

**Q1. What is the difference between `BeanFactoryPostProcessor` and `BeanPostProcessor`?**
`TRICKY`

A `BeanFactoryPostProcessor` runs once, in `refresh()` step 4, and operates on
`BeanDefinition`s — the metadata. It can add, remove or mutate definitions before a single
bean instance exists, which is why it cannot inject anything. A `BeanPostProcessor` is
registered in step 5 and applied to every bean individually as it is created, so it can
inspect, wrap or replace instances but has no view of the graph and no authority over
definitions. `PropertySourcesPlaceholderConfigurer` and `ConfigurationClassPostProcessor` are
examples of the first; `AutowiredAnnotationBeanPostProcessor` and
`AnnotationAwareAspectJAutoProxyCreator` are examples of the second.

**Q2. Must a `BeanPostProcessor` be declared in a `static` `@Bean` method? And why?** `TRICKY`

Yes, if you declare it in a `@Configuration` class that might also be used by other
configuration classes. The container must `getBean()` the `@Bean` method during
`registerBeanPostProcessors()` (step 5); a non-static method requires an instance of the
config class, and creating that instance means running it through a `BeanPostProcessor` chain
that is not yet assembled. `BeanPostProcessorChecker` reports this as "not eligible for
getting processed by all BeanPostProcessors."

**Q3. Your `postProcessAfterInitialization` returns `null` for a bean. What happens?** `TRICKY`

`BeanPostProcessor` implementations must return the bean — original or replacement. Returning
`null` registers a `NullBean`, and injection of it fails with `NullBeanException` or, if
injected by type, with a misleading "expected single matching bean but found 0." The
`before` variants have the same contract and are just as easily got wrong.

**Q4. Is there a guaranteed order in which `BeanPostProcessor`s run?** `ADVANCED`

Only partially, and the asymmetry is the part people miss. `postProcessBeforeInitialization`
runs in registration order; `postProcessAfterInitialization` runs in **reverse** registration
order, so later-registered wrappers end up outermost. Registration order itself is governed by
`PriorityOrdered` (first), then `Ordered`, then registration order — not by source file
order. If the behaviour depends on it, implement `PriorityOrdered` and document it.

**Q5. How does the container decide between full and lite `@Configuration` mode, and what
changes in lite mode?**

`ConfigurationClassPostProcessor` parses the class in phase 1 and records the mode on the
`ConfigurationClass`: lite if `proxyBeanMethods = false`, if the class is `final`, or if a
`@Bean` method is `private` or `final` — conditions that make CGLIB enhancement impossible.
In full mode the config class is CGLIB-enhanced in phase 3 and intra-config `@Bean` calls
return the singleton. In lite mode they construct a fresh unmanaged object, silently.

**Q6. A library registers a `PriorityOrdered` `BeanPostProcessor` that returns beans
unmodified. Nothing works. What's the likely explanation?**

It is probably a `BeanPostProcessor` that doesn't implement `Ordered` at all, which
registers it in the *unordered* group and puts it last in the chain — but the more common
cause of application-wide breakage is a post-processor that throws in
`postProcessBeforeInitialization` for a bean it doesn't understand, which aborts the whole
refresh rather than one bean. The debugging move is `--debug` plus the
`BeanPostProcessorChecker` output, and then running with
`Debug` logging on `org.springframework.beans.factory.support` to see the actual chain.

**Q7. You need to add a bean definition for each of 200 tenants at startup. Which extension
point, and what are you signing up for?**

`BeanDefinitionRegistryPostProcessor` — it inherits `BeanFactoryPostProcessor` and adds
`postProcessBeanDefinitionRegistry`, which is the only hook that can add definitions before
anything is instantiated. What you're signing up for is 200 additional beans created at
startup, 200 × whatever each tenant's graph costs, and a context whose size is a function of
your customer count. Chapter 5's staff-level section is the right place to decide whether
this is the right design at all versus a `Map<tenantId, Impl>`.

> **CHAPTER 2 SUMMARY**
>
> Two extension points, one distinction: a `BeanFactoryPostProcessor` runs once on
> *definitions* before any instance exists, and a `BeanPostProcessor` runs once per bean on
> *instances* and has no authority over definitions. Both of Spring's most important
> post-processors are its own — `ConfigurationClassPostProcessor` is what makes
> `@Configuration` work at all, and `AutowiredAnnotationBeanPostProcessor` is what makes
> `@Autowired` work — which is why a custom one often behaves unexpectedly: it is competing
> with infrastructure, and a `PriorityOrdered` implementation of your own can displace
> `CommonAnnotationBeanPostProcessor` and take `@PostConstruct` with it. The two rules that
> prevent the classic failures: post-processors declared in `@Bean` methods must be `static`,
> and the only way to guarantee ordering is `PriorityOrdered`.

#### Further Reading

- [Spring Framework Reference — Container Extension Points](https://docs.spring.io/spring-framework/reference/core/beans/factory-extension.html) — the authoritative `BeanPostProcessor` and `BeanFactoryPostProcessor` page, including the Aware interfaces and the `BeanPostProcessorChecker` explanation.
- [Spring Framework Reference — Composing and Importing Configuration Classes](https://docs.spring.io/spring-framework/reference/core/beans/java/composing-configuration-classes.html) — `@Import`, `ImportSelector`, `ImportBeanDefinitionRegistrar`, and how `ConfigurationClassPostProcessor` drives them.
- [Spring Framework Reference — Creating an ApplicationContext](https://docs.spring.io/spring-framework/reference/core/beans/java/basic-concepts.html) — the `@Bean`/`@Configuration` model in full, including the static-method rule and full vs lite mode.
- [Spring Framework Reference — AOP Proxying](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — how `AnnotationAwareAspectJAutoProxyCreator` uses `postProcessAfterInitialization` to create proxies; the natural companion to this chapter.
- [Spring Boot Reference — Auto-Configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html) — how the registry post-processor machinery loads starters without any explicit import on your side.

## Chapter 3 — Bean Scopes

### 3.1 The Five Scopes, and the One Rule That Governs Them

```text
                 ┌──────────────────────────────────────────────┐
                 │  singleton (default)                         │
                 │  ONE instance per BeanFactory. Never garbage-  │
                 │  collected by the container. Fully managed.   │
                 └──────────────────────────────────────────────┘
                 ┌──────────────────────────────────────────────┐
                 │  prototype                                  │
                 │  A NEW instance every getBean().              │
                 │  ⚠ NOT tracked. NO destruction callback.      │
                 │  ⚠ NO dependency resolution between calls.    │
                 └──────────────────────────────────────────────┘
   ── web only ─┐ ┌────────────────────────────────────────────┐
                ├►│  request    — one per HTTP request          │
                │ └────────────────────────────────────────────┘
                │ ┌────────────────────────────────────────────┐
                ├►│  session   — one per HTTP session          │
                │ └────────────────────────────────────────────┘
                │ ┌────────────────────────────────────────────┐
                └►│  application — one per ServletContext,      │
                  │  shared across ALL requests in that context  │
                  └────────────────────────────────────────────┘
                ┌──────────────────────────────────────────────┐
                │  websocket — one per WebSocket session        │
                │  (Spring 6, requires a reactive-capable stack)│
                └──────────────────────────────────────────────┘
```

**The rule that generates most of the confusion: singleton is the only scope the container
manages past construction.** Everything else in the table is the container handing you an
object and then forgetting about it.

| | singleton | prototype | request | session | application | websocket |
| --- | --- | --- | --- | --- | --- | --- |
| Instances per context | 1 | Unlimited | 1 per request | 1 per session | 1 per context | 1 per WS session |
| Container tracks it? | Yes | **No** | No (a `RequestScope` map does) | No (a `SessionScope` map does) | Yes | No |
| Destruction callback fires? | Yes | **No** | No | No | Yes | No |
| Default resolution | Container | Container | Request | Session | ServletContext | WebSocket |
| Can `@Autowired` it? | Yes | Yes | Only via proxy | Only via proxy | Only via proxy | Only via proxy |
| Needs a web context? | No | No | Yes | Yes | Yes | Reactive |
| Thread-safe? | **Your problem** | **Your problem** | Per-request | Per-session | **Your problem** | Per-session |

### 3.2 The Prototype-into-Singleton Trap

This is the highest-frequency scoping bug in Spring, and its signature is so consistent
that once you have seen it you will never miss it.

```java
@Service
public class OrderService {
    private final CartService cart;                 // CartService is @Scope("prototype")

    public OrderService(CartService cart) {         // ← resolved ONCE, at startup
        this.cart = cart;
    }
}

@Service
@Scope("prototype")
public class CartService {
    private final List<Item> items = new ArrayList<>();
    public void add(Item i) { items.add(i); }
}

// What the developer believes: every user gets their own cart.
@GetMapping("/cart")
public Cart cart() { return service.getCart(); }   // every user gets the SAME CartService
```

```text
 getBean("orderService") during refresh
   └─ constructor needs CartService
        └─ getBean("cartService")  → creates instance #1
             └─ stores it in OrderService.cart
   └─ never called again

 10,000 requests later:
   └─ service.getCart()  →  returns the same CartService instance #1
        └─ User A's items are visible to User B
```

The prototype semantics are honoured — the container *did* create a new object. It just
created it once, because a singleton is created once and its dependencies are resolved at
construction. The dependency is a **value**, captured at startup, not a **recipe**, re-run per
use. Injecting a prototype does not inject "a prototype"; it injects "one prototype".

> **PRODUCTION SCENARIO**
>
> Problem: a shopping-cart endpoint started leaking items between users on a Friday
> afternoon. No exception, no error, plausible-looking responses.
> Investigation: heap dump showed exactly one `CartService` instance with a live `ArrayList`
> of 40,000 items. The metrics for `cartServiceCreates` was `1`.
> Root cause: `CartService` is `@Scope("prototype")`, injected by constructor into the
> singleton `OrderService`. The container resolved it once during refresh and the singleton
> held that instance forever. Prototype scope was doing nothing at all.
> Solution: inject `ObjectProvider<CartService>` and call `getObject()` per request — this is
> the correct fix for a stateless-per-request collaborator, but see Section 3.3 for why
> `CartService` was also a modelling problem.
> Prevention: a review rule that any `prototype`-scoped bean injected by constructor into a
> singleton is a blocking comment, plus an architecture test that asserts the scope of every
> injected type.

### 3.3 The Three Fixes

```java
// ── FIX 1: ObjectProvider — resolve at the point of use ──────────────
@Service
public class OrderService {
    private final ObjectProvider<CartService> carts;

    public OrderService(ObjectProvider<CartService> carts) {   // container injects the
        this.carts = carts;                                    // PROVIDER, not the bean
    }

    public Cart freshCart() { return carts.getObject(); }       // new instance EVERY call
}

// ── FIX 2: ObjectFactory — the older, narrower interface ────────────
@Service
public class OrderService {
    private final ObjectFactory<CartService> cartFactory;

    public OrderService(ObjectFactory<CartService> f) { this.cartFactory = f; }
    public Cart freshCart() { return cartFactory.getObject(); }
}

// ── FIX 3: Scoped proxy — inject a TYPE, get a FRESH instance per call
@Bean
@Scope(value = "prototype", proxyMode = ScopedProxyMode.TARGET_CLASS)
public CartService cartService() { return new CartService(); }

@Service
public class OrderService {
    private final CartService cart;      // inject the PROXY — looks identical
    public void doSomething() { cart.add(item); }   // a DIFFERENT CartService per call
}
```

| | `ObjectProvider<T>` | `ObjectFactory<T>` | Scoped proxy |
| --- | --- | --- | --- |
| Inject what? | The provider | The factory | A proxy that implements `T` |
| New instance per...? | `getObject()` call | `getObject()` call | Every method invocation |
| Handles absent beans? | Yes — `getIfAvailable()` | No — throws | No |
| `orderedStream()`, generics? | Yes | No | No |
| Overhead per use | Method call on the provider | Method call on the factory | **Proxy dispatch + target lookup on every call** |
| Detectable in the bean? | Yes — it's a different type | Yes | **No** |

`ObjectProvider<T>` extends `ObjectFactory<T>`, so it is strictly the better of the two
when you have the choice. `ObjectFactory` survives because it is the interface `ObjectProvider`
was designed around, and because some older extension APIs expose only it.

**Scoped proxies are the elegant one and the expensive one.** Injecting `CartService` looks
exactly like injecting a singleton, reads exactly like a singleton, and is not: every method
call goes through the proxy, which calls `scopedTarget.get()` on the scope to obtain the
current instance for the calling context. For `request` scope that means a
`RequestContextHolder` lookup or a `RequestAttributes` map lookup *per method call*. The
overhead is microseconds individually and it is invisible in a profiler — but it is also
invisible in a code review, because a scoped proxy is indistinguishable from a real bean at
the injection point.

> **INTERVIEW TRAP**
>
> "A scoped proxy is just a proxy, so it's free" is the wrong answer. The cost is a **target
> lookup per method invocation**, and for `request` scope that lookup is a `ThreadLocal`
> dereference plus a map access. A service with 20 methods called 50 times per request pays
> 1,000 lookups that a singleton would not. Worse, a scoped proxy masks the type: the injected
> object is a `CartService` subclass, so `@Autowired` on its class, `instanceof` checks, and
> method resolution all still work — which means the substitution is invisible in code
> review and only shows up in a flame graph.
>
> The second trap in the same area: **a scoped proxy only works for singletons depending on
> the narrower scope.** A `request`-scoped bean injected into a `prototype` bean that is
> itself resolved many times per request is fine; a `singleton` depending on a `singleton`
> with a scoped proxy on the wrong side is a startup failure at best.

### 3.4 Why Prototypes Have No Destruction Callback

There is no `destroy()` for prototypes, and there is no configuration flag to enable one.
The reason is not an omission — it is a direct consequence of what the container knows.

```text
 For a SINGLETON the container holds:
   ┌────────────────────────────────────────────────────┐
   │  singletonObjects : name → instance                │  ← strong reference
   │  DisposableBeanAdapter for the bean                 │  ← it knows HOW to destroy it
   └────────────────────────────────────────────────────┘
   On close(): iterate the map, invoke each adapter.     ✓

 For a PROTOTYPE the container holds:
   ┌────────────────────────────────────────────────────┐
   │  (nothing)                                         │
   └────────────────────────────────────────────────────┘
   It created the object, returned it, and dropped the
   reference. It has no list, no adapter, no name → object
   handed it out and never saw it again.
```

A prototype with a connection, a file handle, or a thread therefore leaks, and the only
leak-detection tooling in the JVM — a heap dump — will show you a `CartService` with a live
`Connection` and no path to any GC root you recognise.

What to do about it, in order of preference:

```java
// 1. BEST: don't hold resources in a prototype. If it needs cleanup,
//          it needs to be a singleton with a real lifecycle.
@Bean(destroyMethod = "close")                    // for a SINGLETON of a closeable type
public ReportCache reportCache() { return new ReportCache(); }

// 2. For genuinely request-scoped resources, use request scope — a
//    RequestContextHolder callback closes it at end of request.
@Component
public class RequestResources implements DisposableBean {
    @PreDestroy void release() { /* runs at request completion */ }
}

// 3. Implement AutoCloseable and use try-with-resources at the call site.
public void process() {
    try (ReportCache cache = provider.getObject()) {
        cache.warm();
    }
}

// 4. As a last resort, @PreDestroy on a prototype genuinely does not fire.
//    Do not rely on it. Use a shutdown hook on a SINGLETON that tracks
//    the instances it created.
@Component
public class PrototypeTracker implements DisposableBean {
    private final Set<Closeable> live = ConcurrentHashMap.newKeySet();
    public <T extends Closeable> T track(T c) { live.add(c); return c; }
    @Override public void destroy() { live.forEach(Closeable::close); }
}
```

> **MUST REMEMBER**
>
> **Prototypes are not garbage-collected by the container and are not destroyed by it.**
> The phrase "the container manages the prototype's lifecycle" is wrong and appears in
> documentation-adjacent blog posts. What the container manages is only the *act of
> construction*. Everything after that is ordinary Java, and ordinary Java means
> `finalize`-free, `Cleaner`-optional, reference-counted-if-you-actually-want-it
> determinism.
>
> The interviewer follow-up that separates candidates: *"so what's the difference between a
> prototype and just calling `new` yourself?"* — and the honest answer is **almost none**,
> except that a prototype still gets injection, post-processing and proxying, which is
> occasionally worth it and frequently is not.

### 3.5 Thread-Safety: What the Container Promises and What It Cannot

The container promises exactly two things about singletons:

1. There is one instance per `BeanFactory`.
2. That instance is fully constructed before any other thread can obtain it —
   the safe-publication property that `singletonObjects` being a `ConcurrentHashMap` and
   the creation path's happens-before edges provide.

The container promises **nothing** about the methods on that instance. It does not
synchronise, does not copy, does not isolate. A singleton with a mutable field read and
written by two request threads is a data race, and the container's safe publication is
irrelevant to it.

```text
 SAFE because the container did it:
   ✔ instance is fully initialised before publication
   ✔ no two threads can see a half-built object
   ✔ @PostConstruct has finished before anyone gets the reference

 YOUR problem, always:
   ✘ mutable fields on a singleton
   ✘ a `SimpleDateFormat` field (not thread-safe, and the classic interview question)
   ✘ a lazily-initialised cache without a proper ConcurrentMap
   ✘ a `@Scheduled` method mutating a field the request path reads
```

The two container features that change the obligation:

**`@Lazy` moves the construction.** The safe-publication guarantee still holds — Spring
synchronises on the bean creation per `getBean()` call — but the *timing* is now inside a
request, so a `@Lazy` bean's `@PostConstruct` latency is a first-request latency, and a
`@Lazy` bean's failure is a first-request failure. Exactly the trade-off Volume 1 called out
for `spring.main.lazy-initialization`, applied per bean.

**`request` scope moves the concurrency model entirely.** A request-scoped bean is only ever
touched by one request thread, so it may be freely mutable — that is the entire reason to
use it. The cost is that the object must be reached through a proxy or a `RequestContextHolder`
lookup, and that it is invisible to static analysis.

> **TRADE-OFF**
>
> `request` scope is underused and overused in roughly equal measure. It is right when a
> collaborator genuinely carries per-request state (a `SecurityContext` holder, a request
> counter, a per-request DTO assembler) and you want Spring to construct and discard it for
> you. It is wrong when the "per-request state" is one field, because a scoped proxy costs a
> target lookup per method call to avoid a constructor parameter.
>
> The flip condition: **if you can pass the value as a parameter, do that.** Scoped beans
> are for objects whose *identity* is request-bound, not objects whose *data* is.

### 3.6 Request and Session Scopes Need a Web-Aware Context

`request` and `session` scopes are implemented by `RequestScope` and `SessionScope`, which
depend on a `RequestContextHolder` / `SessionScope` backed by the `ServletRequestAttributes`
installed by `DispatcherServlet` at the start of request processing.

```text
 Non-web context (AnnotationConfigApplicationContext, a @SpringBootTest
 with webEnvironment = NONE, a command-line job):
   └─ getBean(requestScopedBean)
        └─ No RequestAttributes bound to this thread
             └─ IllegalStateException: No thread-bound request found
                → obtain a request-scoped bean from this thread

 Web context, OUTSIDE request processing (an ApplicationRunner,
 a @Scheduled job, an @EventListener for a non-request event):
   └─ same exception — there IS a web context, just no request on THIS thread
```

That second case is the nastier one, because the application *looks* like a web
application and the failure only appears in the code paths that happen to run off the
request thread. The standard symptom is a scheduled job or a startup task failing with
"No thread-bound request found" while every HTTP endpoint works perfectly.

There is a second, subtler failure that produces a **stale** object rather than an
exception: if a request-scoped bean is captured in a field of a singleton during one
request, every subsequent request on that thread sees the captured instance. Nothing
throws. The `ScopedProxyMode` fixes are for this reason — the proxy re-resolves per
invocation instead of capturing once.

> **PRODUCTION RELEVANCE**
>
> The rule for scoping across threads: **any object obtained from a web scope must be used
> on the thread it was obtained from.** A `session`-scoped bean passed to
> `@Async`, to a `CompletableFuture.supplyAsync`, or to a message listener is a
> correctness bug even when it doesn't throw — the `ThreadLocal` that backs it belongs to
> a thread that has moved on. Micrometer's context-propagation module and Reactor's
> `Context` are the modern answers, and Volume 10 covers the reactive side.

#### Common Mistakes

- Injecting a `prototype` into a `singleton` by constructor and believing you get one per
  use. You get one, ever.
- Assuming a prototype's `@PostConstruct` or `destroy` runs once, or at all. Every
  `getBean()` re-runs initialisation, and destruction never runs.
- Using a scoped proxy in a hot path and not realising every method call does a target
  lookup. Correct, invisible, and worth measuring before you standardise on it.
- Resolving a `request`-scoped bean from a `@Scheduled` method, an `ApplicationRunner`, or
  an async task. There is no request on that thread, and the exception says so at least.
- Capturing a `request`-scoped bean in a singleton field — no exception, just one user's data
  served to another.
- Assuming the container makes a singleton thread-safe. It guarantees safe *publication*; the
  methods are entirely yours.
- Declaring `session` scope for a bean that holds a `SecurityContext` and then also storing
  the principal in a static field "for convenience."

#### Interview Questions — Scopes

**Q1. What is the difference between `singleton` and `prototype` in terms of what the
container manages?** `TRICKY`

A singleton is created once, stored in `singletonObjects`, published safely, and tracked for
destruction — its `@PreDestroy` / `destroy()` / custom method all run at context close. A
prototype is constructed and returned, and the container keeps no reference to it at all:
it is not tracked, not destroyed, not published, and its initialisation callbacks re-run on
every `getBean()` call. Which is why the honest answer to "how is a prototype different from
`new`" is: only in that it still gets injection, post-processing and proxying.

**Q2. You inject a `prototype`-scoped `CartService` into a singleton `OrderService` and all
users share one cart. Why?** `TRICKY`

Because the singleton's constructor runs once, at refresh. Resolving the prototype at that
moment creates one instance and stores it as a field value. Prototype semantics are
honoured — that instance *was* a fresh prototype — but the dependency is a captured value,
not a recipe, so the container is never asked again. The fixes are `ObjectProvider<T>` with
`getObject()` per call, `ObjectFactory<T>`, or `@Scope(..., proxyMode = ScopedProxyMode.TARGET_CLASS)`
on the prototype so the injected reference re-resolves per method invocation.

**Q3. Why can't a scoped proxy be used everywhere instead of `ObjectProvider`?** `ADVANCED`

Three reasons. The per-invocation target lookup is real overhead — a `ThreadLocal` and map
access per method call, which is invisible in a profiler and visible in a flame graph. The
proxy hides the substitution completely, so a reviewer reading an injection point cannot tell
whether they have a singleton or a request-scoped object, and the thread-safety obligation
differs by an order of magnitude. And for types that must be handled concretely — a
`final` class, a class with final methods, an object that gets serialised, or one cast to an
exact type — CGLIB cannot subclass it and the whole mechanism fails. `ObjectProvider` is
explicit; the proxy is convenient; you should be able to say which one you chose and why.

**Q4. Your `@Scheduled` job calls a method that depends on a request-scoped bean. What
happens and why?**

`IllegalStateException: No thread-bound request found` — or, in a slightly different
configuration, `Request scope is not active`. `RequestScope` resolves through
`RequestContextHolder`, and the scheduler thread has no `RequestAttributes` bound to it.
The scheduler is not a request; the fact that the application is a web application is
irrelevant. The fix is to stop depending on request scope from background work, and to pass
what the job needs explicitly.

**Q5. Does the container make singleton beans thread-safe?** `TRICKY`

No. It guarantees safe *publication* — the bean is fully constructed, its `@PostConstruct`
has completed, and the reference is safely published to any thread that later retrieves it.
It guarantees nothing about the methods on that bean: no synchronisation, no copying, no
isolation. Every mutable field on a singleton is a shared mutable field. Request scope is
the scope that removes the obligation, because a request-scoped bean is only ever touched by
one thread.

**Q6. A prototype-scoped bean holds a database connection. What happens at shutdown, and
what should have been done?**

Nothing. The container holds no reference to a prototype, so it has no `DisposableBeanAdapter`
and no destruction pass, and the connection is closed whenever the JVM or the GC gets to it
— which for a pooled connection means the pool never sees it returned. The fixes in order:
don't hold resources in a prototype (make it a singleton with a real lifecycle); use
`@Bean(destroyMethod = "close")` on a singleton of a `Closeable` type; or use
try-with-resources at the call site, which requires `ObjectProvider` rather than a direct
injection.

**Q7. Is `request` scope a clean way to avoid passing a parameter through five method
signatures?**

No, and this is the question worth answering carefully at staff level. Request scope buys you
a hidden dependency: the code reads as if the object came from nowhere, no constructor
mentions it, and no test can construct the class without a `RequestContextHolder` setup. It
is correct when the object is genuinely request-bound *identity* — the security context, the
current user's locale, a per-request idempotency token — and wrong when it is just a value
being passed through a call chain. The test: would you be comfortable if the value had to
change mid-request? If yes, pass it as a parameter.

> **CHAPTER 3 SUMMARY**
>
> `singleton` is the only scope the container manages past construction — everything else
> is created, handed out, and forgotten. That single fact explains the prototype-into-singleton
> trap (the constructor runs once, so the "prototype" is a captured value), the absence of
> prototype destruction (no reference, no adapter, no callback), and the request-scope
> exception on background threads (no `RequestAttributes` on that thread). The three fixes
> for the trap are `ObjectProvider<T>`, `ObjectFactory<T>` and scoped proxies, and the choice
> between them is really a choice about visibility and cost: the provider is explicit and
> free, the proxy is invisible and pays a target lookup per method call. The container
> guarantees safe publication of a singleton and nothing else — thread safety of the methods
> is entirely your problem.

#### Further Reading

- [Spring Framework Reference — Bean Scopes](https://docs.spring.io/spring-framework/reference/core/beans/factory-scopes.html) — the authoritative scope reference, including the `request`/`session` custom-scope example and the `annotation-config` custom scope declaration.
- [Micrometer Context Propagation](https://docs.micrometer.io/context-propagation/reference/) — the modern answer to propagating request-scoped values across thread and reactive boundaries; the counterpart to this chapter's thread-boundary rules.
- [Spring Framework Reference — Lazy-Initialized Beans](https://docs.spring.io/spring-framework/reference/core/beans/dependencies/factory-lazy-init.html) — how `@Lazy` changes construction timing and what it costs, which is the per-bean version of the scope trade-off.
- [Spring Framework Reference — JSR-330 Annotations](https://docs.spring.io/spring-framework/reference/core/beans/standard-annotations.html) — `@Named`, `@Inject`, `@Qualifier`, `@Scope` and the Jakarta dependency-injection annotations, for when an interviewer asks whether Spring's `@Autowired` is the standard.

## Chapter 4 — Bean Validation

### 4.1 JSR-380, and the Annotation People Misuse Most

Jakarta Validation (formerly JSR-380, formerly Bean Validation 1.1) is a **specification**.
Hibernate Validator is the reference implementation and the one Spring Boot pulls in. The
distinction matters when a team asks whether they can swap it: they can, and the spec is the
contract.

```java
public record CreateOrderRequest(
        @NotBlank  String customerId,                       // non-null AND non-empty
        @NotNull   Instant requestedAt,                     // non-null only
        @Size(min = 1, max = 100) List<@NotNull String> lines,
        @Min(1) @Max(50)   int quantity,
        @DecimalMin("0.01") BigDecimal unitPrice,
        @Email    String contactEmail,
        @Pattern(regexp = "^[A-Z]{2}-\\d{4}$") String region   // "GB-0042"
) { }
```

| Annotation | Null | Empty string `"  "` | Empty list | Meaning |
| --- | --- | --- | --- | --- |
| `@NotNull` | **Fails** | Passes | n/a | "there is a value" |
| `@NotBlank` | **Fails** | **Fails** | n/a | "there is non-whitespace content" |
| `@NotEmpty` | **Fails** | **Fails** | **Fails** | "size > 0" (strings, collections, maps, arrays) |
| `@Size(min, max)` | Passes (null) | Fails if min > 0 | Fails if min > 0 | length bounds |
| `@Min` / `@Max` | Passes | — | — | numeric bounds |
| `@Pattern` | **Fails** | — | — | regex; null fails unless the regexp allows it |
| `@Email` | **Fails** | **Fails** | — | deliberately loose — it is not RFC 5322 |
| `@Past` / `@Future` | **Fails** | — | — | temporal |
| `@Positive` | **Fails** | — | — | `> 0`, also rejects 0 |
| `@Digits(integer, fraction)` | **Fails** | — | — | precision bounds |

> **INTERVIEW TRAP — `@NotNull` vs `@NotBlank`**
>
> `@NotNull String customerId` on a field that arrives from JSON as `""` **passes**. The
> request goes through, a row is written with an empty customer ID, and three weeks later
> support is asking why some orders have no customer. Every string that comes from outside
> your process and identifies something should be `@NotBlank`, and the number of teams that
> have learned this from a production incident rather than from review is very high.
>
> The complementary trap: `@NotBlank` on an `Integer` does not compile — it is declared for
> `CharSequence`. And `@NotEmpty` on a `List` means "size > 0", which is *not* the same as
> "every element is non-null" — that needs `@NotNull` on the type argument, as in
> `List<@NotNull String>` above, which is the container element type-use syntax and is
> supported since Jakarta Validation 2.0.

### 4.2 Nested Objects, Groups, and Custom Validators

```java
// ── CASCADING — @Valid on a field is what makes the validator descend
public record OrderRequest(
        @NotBlank String customerId,
        @NotNull  @Valid Address shipping,          // ← the cascade trigger
        @Valid List<@Valid OrderLine> lines         // ← works on collection elements too
) { }

public record Address(
        @NotBlank String line1,
        @NotBlank String postcode,
        @NotNull  @Valid Country country            // nested to any depth
) { }

// ── GROUPS — different constraints for different entry points
public interface DraftChecks   { }                 // marker interfaces
public interface PublishChecks { }

public class Article {
    @Null(groups = DraftChecks.class)              // must be null when creating
    @NotNull(groups = PublishChecks.class)         // must be set when publishing
    private String body;
}

// Validate a specific group instead of Default
validator.validate(article, PublishChecks.class);
```

Groups exist because the same object has genuinely different legal states at different points
in its lifecycle, and duplicating it into `ArticleDraft` and `ArticlePublished` to work
around that duplicates every subsequent change. The cost is real: **group membership is
easy to forget**, and a constraint left in the `Default` group silently applies to everything
including paths you never thought about. If you are using groups, the rule is that a
constraint belongs in `Default` unless a *specific named operation* needs a different one.

```java
// ── CUSTOM — the whole point of the specification
@Documented
@Constraint(validatedBy = Iso4217Validator.class)
@Target({ FIELD, PARAMETER, RECORD_COMPONENT })
@Retention(RUNTIME)
public @interface Iso4217 {
    String message() default "must be a valid ISO-4217 currency code";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class Iso4217Validator implements ConstraintValidator<Iso4217, String> {

    private static final Set<String> VALID = Set.of("GBP", "EUR", "USD", "JPY");

    @Override
    public boolean isValid(String value, ConstraintValidatorContext ctx) {
        if (value == null) return true;                  // let @NotNull own nullability
        if (VALID.contains(value)) return true;
        ctx.disableDefaultConstraintViolation();         // otherwise you emit two messages
        ctx.buildConstraintViolationWithTemplate(
                "unsupported currency " + value + "; supported: " + VALID).addConstraintViolation();
        return false;
    }
}
```

Two details in that validator that experienced reviewers check for: **`null` returns `true`**
so that nullability is a separate concern owned by `@NotNull` — the opposite convention makes
every usage site need both annotations — and **`disableDefaultConstraintViolation()`** before
adding a custom template, or the caller receives the default message *and* the custom one and
your API starts returning duplicate field errors.

> **TRADE-OFF**
>
> Custom validators are the highest-leverage thing in this chapter and the easiest to abuse.
> The line worth drawing: a constraint that checks a *shape* (`@Pattern`, `@Size`,
> `@Range`) belongs on the field; a constraint that requires a *lookup* (does this SKU exist,
> is this postcode deliverable, is this IBAN valid per the registry's checksum) does not —
> because constraints are expected to be pure, synchronous and fast, and a constraint that
> hits the network turns a 400 response into an outage vector.
>
> The flip condition: if a validation genuinely needs a lookup, do it in the service layer,
> in the same transaction as the write, and return a domain exception. The exception is
> "keep bean validation about shape, keep referential integrity in the domain."

### 4.3 Where Validation Actually Runs

```text
 ┌──────────────────────────────────────────────────────────────────────┐
 │ A. @Valid / @Validated on an MVC @RequestBody parameter              │
 │    WHEN:  during argument resolution, before the controller method   │
 │    ON FAIL: throws MethodArgumentNotValidException (extends          │
 │             BindException extends Exception)                        │
 │    MVC's DefaultHandlerExceptionResolver → 400 Bad Request           │
 │    (Spring 6: can be a HandlerMethodValidationException)            │
 ├──────────────────────────────────────────────────────────────────────┤
 │ B. @Valid on a method PARAMETER (not @RequestBody)                   │
 │    WHEN:  during argument resolution, IF a validator is configured  │
 │    ON FAIL: throws ConstraintViolationException                     │
 │    (or HandlerMethodValidationException → 400 in Spring 6.1+)       │
 ├──────────────────────────────────────────────────────────────────────┤
 │ C. @Validated on the @ConfigurationProperties class                 │
 │    WHEN:  at BINDING time, during refresh                           │
 │    ON FAIL: BindValidationException → startup FAILS. By design.     │
 ├──────────────────────────────────────────────────────────────────────┤
 │ D. @Validated on a class, method-level @Valid on its parameters     │
 │    WHEN:  via MethodValidationPostProcessor (a BeanPostProcessor)   │
 │    ON FAIL: ConstraintViolationException, handled by                │
 │             @ControllerAdvice / @ExceptionHandler                    │
 └──────────────────────────────────────────────────────────────────────┘
```

`@Valid` alone on a controller does **not** trigger method-level validation — that requires
`@Validated` on the **class**, which makes `MethodValidationPostProcessor` register a proxy
that validates every annotated parameter on entry. `@Valid` is only a marker that the
`ValidationAnnotationPostProcessor` / `SmartValidator` picks up *if* something is asking it
to. This is a genuinely confusing pair of names and it is a common interview question:

| | `@Valid` | `@Validated` |
| --- | --- | --- |
| Type | Bean Validation (JSR-380) | Spring's grouping + method validation |
| Package | `jakarta.validation.Valid` | `org.springframework.validation.annotation.Validated` |
| On a `@RequestBody` param | Triggers validation during binding | Also triggers it (it is meta-annotated with `@Valid` semantics) |
| On a **class** | Does nothing by itself | Activates method-level validation via a proxy |
| Carries `groups` | No | Yes — `value = PublishChecks.class` |
| Proxy created? | No | Yes, by `MethodValidationPostProcessor` |

### 4.4 The Critical MVC Pitfall — `BindingResult`

This is the single most consequential bean-validation bug in Spring MVC, and it has a
genuinely counter-intuitive mechanism.

```java
// CASE 1 — @Valid with NO BindingResult following it
@PostMapping("/orders")
public Order create(@Valid @RequestBody CreateOrderRequest request) {
    return service.create(request);          // is this reached with invalid input?
}
// ❌ NO. MVC throws MethodArgumentNotValidException → 400. The body is never entered.

// CASE 2 — @Valid WITH a following BindingResult
@PostMapping("/orders")
public String create(@Valid CreateOrderRequest request, BindingResult errors) {
    if (errors.hasErrors()) {
        return "orders/new";                 // ← YOU must check. Nothing else will.
    }
    service.create(request);
    return "redirect:/orders";
}
```

```text
  WHY the difference?

  ModelAttributeMethodProcessor.resolveArgument(...) builds the model attribute, then:

    if (bindingResult.hasErrors() && isBindExceptionRequired(...)) {
        throw new MethodArgumentNotValidException(...);       // no BindingResult param
    }
    ...

  isBindExceptionRequired(...) is TRUE only when the method has NO
  immediately-following parameter of type BindingResult or Errors.

      @Valid CreateOrderRequest r                              → throw → 400
      @Valid CreateOrderRequest r, BindingResult errors        → NO throw → you decide
```

So the presence of a `BindingResult` parameter **suppresses the exception entirely** and
hands the responsibility to you. A controller that adds a `BindingResult` for form
repopulation and then forgets the `hasErrors()` check will happily process a completely
invalid request — and for a `@RequestBody` in a REST API that means persisting a row with a
null customer and returning `201 Created`.

> **PRODUCTION SCENARIO**
>
> Problem: a `POST /orders` endpoint began accepting orders with no customer ID after a
> refactor three weeks earlier. Returns `201`, orders appear in the database, downstream
> fulfilment fails.
> Investigation: the PR added a `BindingResult` parameter to support a new
> `BindingResult` advice for one form endpoint, using a find-and-replace across the
> controller. No test covered the invalid-payload case.
> Root cause: with `BindingResult` present, `ModelAttributeMethodProcessor` no longer throws
> `MethodArgumentNotValidException`, and the new code never checked `hasErrors()`.
> Solution: added `if (bindingResult.hasErrors()) throw new
> MethodArgumentNotValidException(...)`, or removed the parameter on the REST endpoints and
> handled the errors in a `@RestControllerAdvice`.
> Prevention: a lint rule or an ArchUnit test asserting that no REST controller method
> declares a `BindingResult` parameter — `@RestController` + `BindingResult` is a code smell
> on its own, and the check is four lines.

> **MUST REMEMBER**
>
> **`@Valid` without a following `BindingResult`/`Errors` is fail-closed. `@Valid` with one
> is fail-open — you own the check.** The parameter that looks like it is "collecting errors
> for a nicer response" is in fact the switch that turns MVC's automatic `400` off. That is
> not documented prominently anywhere, it is exactly backwards from the intuition, and it is
> why REST endpoints should generally *not* declare `BindingResult`.

### 4.5 Hibernate Validator and the Dependency Picture

```xml
<dependency>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-validation</artifactId>
</dependency>
```

Until Boot 2.3 this came in transitively with `spring-boot-starter-web`. From 2.3 it does
not, because Hibernate Validator was pulled out of the web starter so that a non-web
application would not silently carry a validation engine. The migration symptom is
`NoProviderFoundException: HV000183` or `jakarta.validation.ValidationException: Unable to
create a Configuration, because no Jakarta Bean Validation provider could be found` — a
startup failure the first time a `@Valid` parameter is processed, not a compile error.

Hibernate Validator's own configuration knobs are worth knowing because they change
behaviour, not just speed:

| Property | Effect |
| --- | --- |
| `failFast` | Stop at the first violation per object — you lose the other messages |
| `hibernate.validator.fail_fast` | Same, via the standard property name |
| `traversableResolver` | How deep `@Valid` cascades; tightening it stops infinite recursion on cyclic graphs |
| `jakarta.validation.message_interpolation` | Set to `false` to skip EL interpolation — a measurable win if you don't use `${...}` in messages |

> **SCALING REALITY CHECK**
>
> `@Valid` cascades, and a cascade on an object graph with a bidirectional relationship
> recurses until the traverser complains or the stack overflows — this is a genuine
> production failure in JPA-backed DTOs, and it belongs in the same conversation as Volume 6's
> fetch strategies. The other real cost is per-request: validating a large `@Valid` nested
> graph is O(nodes in the graph), and on a list of 200 order lines with an address each that
> is 600 objects walked per request. It is not slow, but it is not free, and the number
> worth remembering is that cascade depth is a design choice, not an accident.

### 4.6 A Domain Concern First

The ordering of this argument matters more than any individual annotation. Validation is
**not** a controller-layer concern, and the reason is not purity — it is that the invariants
live in the domain, and a rule expressed only on an inbound DTO is a rule that every other
entry point bypasses.

```java
// A rule that lives only on the DTO is bypassed by every other caller.
public record CreateOrderRequest(@Positive int quantity) { }

// The same rule, in the domain, cannot be bypassed.
public class Order {
    public void addLine(OrderLine line) {
        if (line.quantity() <= 0) {
            throw new IllegalArgumentException("quantity must be positive");
        }
        ...
    }
}
```

Everything else follows from that. Bean validation at the edge is an **ergonomic** layer: it
turns 90% of malformed input into a clean, structured `400` with field-level messages,
without anyone writing an `if`. The domain is the authority. The DTO annotations are a
convenience layer over a rule that must already exist somewhere, and a team that has never
written the domain rule has not validated anything — it has added a request-shape filter
that happens to use the same library as Jakarta EE.

> **STAFF-LEVEL CONSIDERATION**
>
> The question a staff engineer should raise in a design review is not "are the annotations
> right" but **"what is the source of truth for this invariant, and how many entry points are
> there?"** The interesting cases are the ones where the answer is not obvious: a batch import
> that bypasses MVC entirely, a message consumer deserialising with a different validator, a
> scheduled job constructing the object directly, a database migration writing rows that
> violate the rule. At that point the correct question becomes "where does this live so that
> all five paths obey it" — and the answer is usually the domain constructor, with bean
> validation layered on top for the paths that want good error messages.
>
> The second-order concern is error-message stability. Bean-validation messages are part of
> your API contract whether you documented them or not: a frontend that switches on
> `field + " " + message` breaks when someone rewords a constraint, and at scale that
> becomes an API versioning problem. A `@RestControllerAdvice` that maps violations to a
> stable error *code* rather than a message is the difference between an error contract you
> can change and one you cannot.

#### Common Mistakes

- Using `@NotNull` on a `String` that comes from a request and expecting blank input to be
  rejected. `"", "   "` all pass.
- Writing a custom validator that returns `false` for `null`, then also adding `@NotNull` —
  you get two violation messages for one field, and one of them is always the wrong one.
- Forgetting `disableDefaultConstraintViolation()` before adding a custom message template,
  so every violation carries both the default and the custom text.
- Using `@Valid` on a controller **class** and expecting method-level validation. That needs
  `@Validated` on the class.
- Adding a `BindingResult` parameter to a `@RestController` method for error handling and
  not checking `hasErrors()` — which silently disables MVC's automatic 400.
- Assuming a `BindingResult` parameter is required for `@Valid` to work. Without it, MVC
  throws for you; that is the better default on a REST endpoint.
- Adding a constraint that calls a repository or a remote service. Constraints are expected
  to be pure, synchronous and fast, and one that does I/O turns a validation endpoint into an
  amplification vector.
- Forgetting that `spring-boot-starter-validation` is no longer transitive from
  `spring-boot-starter-web` since Boot 2.3, and getting a provider-not-found failure at
  runtime rather than at compile time.

#### Interview Questions — Validation

**Q1. `@NotNull` versus `@NotBlank` — when does the difference actually bite?** `TRICKY`

`@NotNull` only checks for a null reference. `""`, `"   "` and `"\t"` all pass it. So
`@NotNull` on any string arriving from JSON or a form lets empty values straight through,
and the failure surfaces later — a database row with a blank customer ID, a downstream
service that throws on an empty key. `@NotBlank` checks for null *and* for content that is
null or whitespace-only after trimming. The rule that holds: any string from outside your
process that identifies something is `@NotBlank`.

**Q2. What is the difference between `@NotBlank`, `@NotEmpty` and `@NotNull`?** `TRICKY`

`@NotNull` rejects null only. `@NotEmpty` rejects null and anything with zero size — it
works on `CharSequence`, `Collection`, `Map` and arrays, so it rejects `""` and `List.of()`
but passes `"   "`. `@NotBlank` rejects null and strings that are empty *after trimming*,
and is only declared for `CharSequence`. They are not interchangeable and the container case
is the one people miss: `@NotEmpty List<@NotNull String>` is what means "at least one
element, and no element is null."

**Q3. Why does adding a `BindingResult` parameter change MVC's failure behaviour?** `TRICKY`

Because `ModelAttributeMethodProcessor` only throws
`MethodArgumentNotValidException` when the handler method has *no* immediately-following
`BindingResult` or `Errors` parameter. Add one and the exception is suppressed entirely; the
errors are populated into the `BindingResult` and it becomes the handler's job to check
`hasErrors()`. So the parameter that looks like it's there to collect errors for a nicer
response is actually the switch that turns off the automatic 400 — which is why REST
controllers should generally not declare one.

**Q4. `@Valid` on a controller class does nothing. What are you missing?** `TRICKY`

Method-level validation requires `@Validated` (Spring's annotation, not Jakarta's) on the
**class**, which makes `MethodValidationPostProcessor` create a proxy that validates every
annotated parameter when a method on that bean is called. `@Valid` alone is a marker for the
`ValidationAnnotationPostProcessor`; it is passive, and it only does anything when something
else — argument resolution for a `@RequestBody`, or the method-validation proxy — asks a
validator to look. The two annotations also serve different purposes: `@Validated` is the
only one that can carry `groups`.

**Q5. Your custom `ConstraintValidator` returns `true` for `null`. A reviewer says that's
wrong. Who's right?**

The reviewer is wrong on this specific point, and the convention is deliberate: a constraint
validator should only validate what it owns, and nullability is owned by `@NotNull`.
Returning `false` for null makes every usage site need both annotations, produces two
violation messages for one field, and makes `@NotNull` on a `@NotBlank`-like constraint
meaningless. What the reviewer should be checking is the *other* half: that you call
`disableDefaultConstraintViolation()` before adding a custom template, and that the
validator does no I/O.

**Q6. What happens to validation after a Boot 2.3 upgrade, and why did it change?** `TRICKY`

Hibernate Validator stopped coming transitively from `spring-boot-starter-web`, so an
application using `@Valid` fails at runtime with a provider-not-found error the first time
validation is actually attempted. The change was made so that non-web applications would not
carry a validation engine they never use. The fix is to add
`spring-boot-starter-validation` explicitly, and the honest process note is that the
dependency being implicit was itself the risk — nothing in the build file recorded that the
application depended on validation.

**Q7. A rule like "an order cannot contain more than 100 lines" is enforced on the request
DTO. Is that enough?** `STAFF`

No, and the reason is about entry points rather than elegance. The DTO annotation protects
exactly the paths that go through MVC argument resolution. A batch import, a message
consumer, a scheduled reconciliation job, a data migration, and a test calling the service
directly all bypass it. The rule belongs in the domain — an `Order.addLine` that throws — and
the DTO annotation is an ergonomic layer on top that produces structured 400s for the 90% of
malformed traffic that arrives over HTTP. The review question is not "is the annotation
right" but "how many entry points exist, and which of them enforce this?"

**Q8. Is putting validation on `@ConfigurationProperties` at startup better than validating
at the point of use?** `TRICKY`

For configuration, overwhelmingly yes — a wrong configuration value is a deployment error
and should fail before any traffic, not when the code path that reads it first executes. The
`@Validated` + JSR-380 combination on a properties class means `BindValidationException`
during refresh, which is a startup failure an operator sees immediately. The trade-off is
that you can only validate what you can express as constraints, so a cross-field rule
(`retries < poolSize`) needs a class-level `@Constraint` rather than field annotations. The
organisational point worth making: failing at startup is cheap to fix, and a team that
validates at point of use has chosen to discover its configuration errors in production.

> **CHAPTER 4 SUMMARY**
>
> Bean validation is a specification with Hibernate Validator as the reference
> implementation, and the annotations people misuse most are `@NotNull` (which lets `""` and
> `"   "` through) and `@Valid` without a following `BindingResult` — the one that actually
> *disables* MVC's automatic 400 and hands you an obligation to check `hasErrors()` yourself.
> Method-level validation needs `@Validated` on the class, not `@Valid`. The deeper argument
> is that validation is a domain concern first: the DTO annotations produce good 400s for
> the paths that go through MVC, and the invariant itself has to live somewhere every entry
> point obeys.

#### Further Reading

- [Jakarta Validation Specification](https://jakarta.ee/specifications/bean-validation/3.0/) — the normative list of built-in constraints and the exact null/empty semantics, which is where most `@NotNull` arguments are settled.
- [Spring Framework Reference — Validation, Data Binding, and Type Conversion](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html) — Spring's integration layer: `Validator`, `@ConfigurationProperties` validation, and method validation.
- [Thorben Janssen — Bean Validation](https://www.thorben-janssen.com/) — the most thorough practitioner writing on Jakarta Validation in practice; the posts on custom constraints, groups and class-level validators are directly interview-relevant.

## Chapter 5 — Dynamic Bean Registration

### 5.1 `@Import` — Three Forms, Three Use Cases

```java
// ── FORM 1: a plain @Configuration class (or a @Component-annotated one)
@Configuration
class InfraConfig { @Bean DataSource dataSource() { ... } }

@Import(InfraConfig.class)
@Configuration
class AppConfig { }

// ── FORM 2: an ImportSelector — returns CLASS NAMES as Strings.
//    Runs BEFORE any of them are processed as configuration.
public class FeatureSelector implements ImportSelector {
    @Override
    public String[] selectImports(AnnotationMetadata metadata) {
        if (metadata.getEnvironment().matchesProfiles("kafka")) {
            return new String[] { "com.acme.config.KafkaConfig", "com.acme.config.ConsumerConfig" };
        }
        return new String[] { "com.acme.config.SqsConfig" };
    }
}

@Import(FeatureSelector.class)
@Configuration
class AppConfig { }

// ── FORM 3: an ImportBeanDefinitionRegistrar — full programmatic control.
//    Receives the Registry and the class metadata; registers BeanDefinitions
//    directly. Nothing is returned.
public class FeatureRegistrar implements ImportBeanDefinitionRegistrar {
    @Override
    public void registerBeanDefinitions(AnnotationMetadata metadata, BeanDefinitionRegistry reg) {
        for (String impl : discoverImplementations()) {
            GenericBeanDefinition bd = new GenericBeanDefinition(NotificationChannel.class);
            bd.setBeanClassName(impl);
            bd.setAutowireMode(AbstractBeanDefinition.AUTOWIRE_CONSTRUCTOR);
            bd.setScope("singleton");
            reg.registerBeanDefinition(impl + "Channel", bd);
        }
    }
}

@Import(FeatureRegistrar.class)
@Configuration
class AppConfig { }
```

| Form | You supply | Runs | Use for |
| --- | --- | --- | --- |
| A class | A configuration class | As a configuration class | Ordinary modular config — **the default** |
| `ImportSelector` | Class **names** | Before the named classes are parsed | Conditional selection *among* configs; can't touch the registry |
| `ImportBeanDefinitionRegistrar` | Code that calls `registry.registerBeanDefinition` | During `ConfigurationClassPostProcessor` | Fully programmatic, generated, or per-tenant registration |

The distinction that matters in review: an `ImportSelector` **cannot** register a bean
definition — it returns strings and the container processes them as configuration classes. If
you need to register a definition for a class that is not a configuration class, you need
`ImportBeanDefinitionRegistrar`. A team that reaches for an `ImportSelector` to register
`DataSource` implementations gets an error about the class not being a configuration class,
and the fix is not to add `@Configuration` to a `DataSource` — it is to use the registrar.

> **PRODUCTION RELEVANCE**
>
> `@Import` is the mechanism every Spring Boot starter uses to get into your application
> without you naming it. The starter ships an auto-configuration class, Boot's
> `AutoConfigurationImportSelector` (an `ImportSelector` — Form 2, exactly) reads
> `META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports`, and
> `@Conditional` decides whether each one applies. Understanding this chain is what turns
> "why is this bean not there?" from a mystery into a
> `ConditionEvaluationReport` lookup.

### 5.2 `FactoryBean` — a Bean Whose Product Is Another Bean

`FactoryBean<T>` is a container-level indirection. The bean named `x` in the registry is the
`FactoryBean` instance; the bean *injected* when you ask for `T` is whatever
`getObject()` returned.

```java
public interface FactoryBean<T> {
    T getObject() throws Exception;              // called for every injection point
    Class<?> getObjectType();                    // used for TYPE MATCHING, before creation
    default boolean isSingleton() { return true; }
    default boolean isPrototype() { return false; }
}
```

```java
public class SqlClientFactoryBean implements FactoryBean<SqlClient> {

    @Override public SqlClient getObject() {
        return new SqlClient(dataSource, dialect, timeout);   // real work, every call
    }
    @Override public Class<?> getObjectType() { return SqlClient.class; }  // NOT SqlClientFactoryBean
    @Override public boolean isSingleton()    { return true; }  // default
}

@Configuration
class PersistenceConfig {
    @Bean public SqlClientFactoryBean sqlClient(DataSource ds) { return new SqlClientFactoryBean(ds); }
}
```

**How it differs from an ordinary bean — four things, all of them surprising:**

1. **Type matching uses `getObjectType()`, not the factory's class.** Injecting
   `SqlClient` works; injecting `SqlClientFactoryBean` requires `&sqlClient`. This is why
   `getObjectType()` is not optional decoration — returning the wrong thing (or the factory
   class) makes the bean invisible to type-based injection, and the failure is
   `NoSuchBeanDefinitionException` for a bean that is plainly registered.

2. **The `&` dereference convention.** `getBean("&sqlClient")` returns the *factory*;
   `getBean("sqlClient")` returns the *product*. The ampersand is not decoration — it is how
   you reach the factory when the product's type doesn't help. This convention is genuinely
   obscure, appears in very few codebases, and is a reliable thing to demonstrate in an
   interview.

3. **`isSingleton()` is a claim, not a guarantee.** If it returns `true` (the default),
   `getObject()` is called once and the product is cached. If you return `false`, it is
   called on **every** `getBean()` — which is a `FactoryBean` expressing prototype scope, and
   it inherits every problem from Chapter 3, including the absence of destruction.

4. **`FactoryBean` is a `BeanPostProcessor`'s worst case for type prediction.** The
   container has to call `getObjectType()` during type resolution, possibly before the
   factory is fully initialised. A `FactoryBean` that touches its own `@Autowired` field in
   `getObjectType()` is a `BeanCurrentlyInCreationException`.

> **INTERVIEW TRAP — "FACTORYBEAN VS @BEAN"**
>
> The common answer — "a `FactoryBean` is for creating complex objects that a constructor
> can't build" — misses the point entirely. **A `FactoryBean` and a `@Bean` method are the
> same mechanism.** `@Bean public SqlClient sqlClient() { return new SqlClient(...); }`
> registers a `FactoryBean` behind the scenes (a
> `ConfigurationClassBeanDefinitionReader` that wraps the method) and does exactly the same
> thing.
>
> The only reason to write a `FactoryBean` *class* rather than a `@Bean` method is that you
> are writing a **library**, and the indirection has to be a type: an XML `<bean>` can point
> at a `FactoryBean` class by name, and third-party configuration you do not control needs
> the same indirection. In an application where you own the config class, a `FactoryBean`
> class is a `@Bean` method written the long way.

### 5.3 `BeanDefinitionRegistryPostProcessor` and Programmatic Registration

The four levels of programmatic control, in increasing power:

```java
// 1. RegistryDefinition via @Bean — returns a BeanDefinition object
@Bean
static BeanDefinition myBean() {
    RootBeanDefinition bd = new RootBeanDefinition(MyService.class);
    bd.setScope("singleton");
    bd.setLazyInit(false);
    bd.getPropertyValues().add("timeout", "5s");     // strings, resolved later
    return bd;
}

// 2. GenericApplicationContext.registerBean(Class, Consumer<BeanDefinition>)
context.registerBean(PaymentClient.class, bd -> bd.setScope("prototype"));

// 3. BeanFactory.registerSingleton(name, instance) — the object is ALREADY built.
//    The container takes it as-is. No post-processing, no AOP, no validation.
beanFactory.registerSingleton("clock", Clock.systemUTC());

// 4. ImportBeanDefinitionRegistrar / BeanDefinitionRegistryPostProcessor
//    Full control, runs before anything is instantiated.
```

The distinction between 2 and 3 is the one that causes silent failures. `registerSingleton`
takes an already-constructed object, so **it bypasses the entire `BeanPostProcessor` chain**.
That object gets no `@Autowired` processing beyond what you did yourself, no
`@PostConstruct`, no AOP proxy, and no exception translation. It appears in the context and
is invisible to every tool that inspects bean definitions. For infrastructure objects that is
correct and desirable; for anything with Spring annotations on it, it is a trap.

### 5.4 The Staff-Level Payoff — Plugins and Multi-Tenancy

This is where dynamic registration becomes a real architectural question rather than a
framework trick. The pattern is: **an `ImportBeanDefinitionRegistrar` (or a
`BeanDefinitionRegistryPostProcessor`) that discovers tenant- or plugin-specific
implementations and registers a definition per instance at startup.**

```java
public class TenantBeanRegistrar implements ImportBeanDefinitionRegistrar {

    private final TenantRepository tenants;

    public TenantBeanRegistrar(TenantRepository tenants) { this.tenants = tenants; }

    @Override
    public void registerBeanDefinitions(AnnotationMetadata md, BeanDefinitionRegistry reg) {
        for (Tenant tenant : tenants.findAllActive()) {     // 200 tenants
            RootBeanDefinition bd = new RootBeanDefinition(TenantContext.class);
            bd.getConstructorArgumentValues()
              .addGenericArgumentValue(tenant.id())
              .addGenericArgumentValue(tenant.locale())
              .addGenericArgumentValue(tenant.currency());
            bd.setScope("singleton");
            reg.registerBeanDefinition("tenantContext-" + tenant.id(), bd);
        }
    }
}

@Component("tenantContext")
class AnyTenantResolver {
    private final Map<String, TenantContext> contexts;

    public AnyTenantResolver(Map<String, TenantContext> contexts) { this.contexts = contexts; }
    public TenantContext current(TenantId id) { return contexts.get(id.value()); }
}
```

It works, it is genuinely used, and it buys real things: per-tenant configuration bound at
startup, startup-time validation that every tenant's graph is resolvable, and a failure at
deploy rather than at the first request from a customer you cannot reach.

**The costs, stated as numbers:**

```text
 Tenant     Registered beans   Startup cost (approx)   Memory (approx)
 ───────────────────────────────────────────────────────────────────────────
     10                 20                   negligible                   ~2 MB
    100                200              +2–5 s refresh              ~20 MB
  1,000              2,000             +20–50 s refresh            ~200 MB
 10,000             20,000        +3–8 min, OOM risk                ~2 GB
```

The scaling is linear in tenants and the constant is not small, because each tenant's beans
are a **graph** — `TenantContext` pulls in whatever it depends on, and if any of those are
`@Service`s that are not shared, they multiply too. A registrar that registers 200 tenants
× 15 beans each is 3,000 beans, and you are back to Volume 1's 3,000-bean startup problem
plus a multi-tenant multiplier.

Beyond the arithmetic, four structural costs:

1. **Everything is validated at startup, forever.** A tenant whose configuration breaks
   prevents the *entire application* from deploying — including the 199 tenants that are
   fine. You have converted a per-tenant problem into a global one.
2. **Adding a tenant is a deploy.** No new tenant without a restart, and the registrar runs
   before the context exists, so there is no runtime path at all. For SaaS, that is
   disqualifying.
3. **The resolution step is a map lookup on a `String` key.** A typo in a tenant ID is a
   `null` at request time, not a compile error, and the registrar's map is invisible to
   static analysis.
4. **It is genuinely hard to undo.** Definitions registered programmatically are invisible
   to a reader scanning `@Configuration` classes, and the "one bean per tenant" convention
   does not show up in code review. Migrating away means rewriting the resolution layer, not
   deleting an annotation.

**When the right answer is `Map<tenantId, Impl>` instead:**

```java
@Component
class TenantRegistrar {
    private final Map<TenantId, NotificationChannel> channels;   // plain map

    public TenantRegistrar(List<NotificationChannelFactory> factories) {
        this.channels = factories.stream()
                .flatMap(f -> f.supportedTenants().stream()
                        .map(t -> Map.entry(t, f.create())))
                .collect(toMap(Map.Entry::getKey, Map.Entry::getValue));
    }

    public NotificationChannel forTenant(TenantId id) {
        return channels.computeIfAbsent(id, unknownTenant());   // fails LOUDLY
    }
}
```

| | Per-tenant bean registration | `Map<TenantId, Impl>` |
| --- | --- | --- |
| Bean count | O(tenants) | O(implementations) |
| Startup validation | Every tenant, or none | Every *implementation* — shared across tenants |
| New tenant at runtime | Requires a deploy | One `computeIfAbsent` call |
| A broken tenant's config | Blocks the whole deploy | Fails for that tenant, at request time |
| Type safety | Bean names are `String`s | Keys are `TenantId` |
| DI within a tenant's graph | Full — it's a real bean graph | Manual — you construct it yourself |
| Testability | Needs a context | A plain map, a plain test |
| Undo cost | High — invisible wiring | Low — one class |

**The decision rule:** use per-tenant bean registration when the tenant's *object graph*
genuinely differs — different beans, different qualifiers, different `@Primary` — and when
the tenant count is known, small, and mostly static. Use the map when the difference is the
*implementation* of one interface, which is the overwhelmingly more common case. The
misdiagnosis is reaching for bean registration when you actually have a strategy problem, and
the tell is a registrar whose registered beans are all of the same type.

> **STAFF-LEVEL CONSIDERATION**
>
> The organisational question underneath this is **who owns the tenant's configuration
> lifecycle.** Per-tenant bean registration answers it with "the deploy" — configuration is
> code, changes go through review, and a wrong value is caught in CI. That is genuinely
> valuable for regulated tenants and painful for self-serve. The map answers it with "the
> database" — configuration is data, changes are immediate, and a wrong value is caught by
> the first request that uses it.
>
> Neither is the "correct" answer; the review should establish which one your customers
> expect. The failure mode I would raise unprompted is the third option teams drift into
> without deciding: per-tenant beans *and* a runtime override, which gives you startup
> validation for some tenants and none for others, with no way for a reader to tell which is
> which. Pick one, and write down why.

#### Common Mistakes

- Using an `ImportSelector` to register a `BeanDefinition` for a class that is not a
  configuration class. An `ImportSelector` returns class names that are then processed *as
  configuration*; for definition registration you need an `ImportBeanDefinitionRegistrar`.
- Returning the `FactoryBean` class from `getObjectType()`. The bean then cannot be found by
  its product type, and the failure is a `NoSuchBeanDefinitionException` for a bean that is
  demonstrably registered.
- Writing a `FactoryBean` in application code as a "clean" alternative to a `@Bean` method.
  They are the same mechanism; the class form is for libraries.
- Using `beanFactory.registerSingleton()` for a bean that has Spring annotations on it. The
  object bypasses the `BeanPostProcessor` chain entirely — no `@PostConstruct`, no AOP, no
  exception translation, and it never appears in a bean-definition listing.
- Declaring `isSingleton() = false` on a `FactoryBean` without realising you have re-created
  the prototype-scope problem, including the absence of any destruction callback.
- Registering one bean per tenant and then discovering that adding a tenant requires a
  restart, in a product whose entire value proposition is self-serve onboarding.
- Assuming per-tenant registration gives you a *small* context. It gives you a context whose
  size is a function of your customer count, which is the one number that grows.

#### Interview Questions — Dynamic Registration

**Q1. What are the three forms of `@Import` and when do you use each?** `TRICKY`

A plain class imports a configuration class and is the default — it is just modular config.
An `ImportSelector` returns class *names* as strings and lets you choose between
configurations conditionally (Boot's own `AutoConfigurationImportSelector` is one); it runs
before the named classes are parsed and cannot touch the registry. An
`ImportBeanDefinitionRegistrar` gives you the `BeanDefinitionRegistry` and full programmatic
control — it is the only one of the three that can register a definition for a class that is
not a configuration class, and it is what per-tenant and plugin registration use.

**Q2. How does a `FactoryBean` differ from a plain bean, and when would you write one?**
`TRICKY`

The bean registered under the name is the factory; what gets injected is whatever
`getObject()` returned. Type matching uses `getObjectType()`, not the factory's class, so
returning the wrong type there makes the bean invisible to type-based injection. You reach
the factory itself with the `&beanName` convention. `isSingleton()` controls whether
`getObject()` is called once or per lookup. The key insight is that `@Bean` methods are
themselves implemented as a `FactoryBean` — so writing a `FactoryBean` *class* is only
warranted when you are writing a library whose configuration is described by name rather
than by code, such as XML or a third-party configuration file.

**Q3. Your registrar creates one `TenantContext` bean per tenant, and there are 1,500
tenants. What's wrong, and what's the alternative?** `STAFF`

Context size scales linearly with the customer count: 1,500 tenants means thousands of beans
and a startup that degrades in proportion, and it is the one number that grows without limit.
Structurally, adding a tenant requires a deploy, and a single tenant's misconfiguration
prevents the whole application from deploying. The alternative is a
`Map<TenantId, Impl>` where the map is keyed by a typed key and values are constructed by
factories — bean count becomes O(implementations) rather than O(tenants), new tenants are a
runtime operation, and a failure is scoped to one tenant. The decision hinges on whether the
tenant's *object graph* genuinely differs or only the *implementation* of one interface.

**Q4. What is the `&` prefix for in `getBean("&sqlClient")`?** `TRICKY`

It dereferences to the `FactoryBean` itself. Normally `getBean("sqlClient")` returns what
the factory produced; prefixing the name with `&` returns the factory instance. You need it
when you want to reach the factory — to inspect it, to call a method only it has, or to
reach a bean whose product type does not make it injectable. The convention is obscure and
rarely used outside library code, which is why it is a good thing to be able to explain
rather than merely recognise.

**Q5. `beanFactory.registerSingleton("clock", Clock.systemUTC())` — what does that bean miss
out on?** `ADVANCED`

The entire `BeanPostProcessor` chain, because the object is already constructed when you
hand it over. It gets no `@Autowired` processing, no `@PostConstruct`, no
`afterPropertiesSet()`, no init method, and no AOP proxy. It also never appears as a
`BeanDefinition`, so it is invisible to tooling that inspects definitions. That is correct
for infrastructure you built yourself and a trap for anything carrying Spring annotations —
use `registerBean(Class, Consumer<BeanDefinition>)` instead when you want a definition.

**Q6. Spring Boot's auto-configuration uses an `ImportSelector`. How does that relate to what
we've built, and what breaks if a starter's conditions aren't met?**

Boot's `AutoConfigurationImportSelector` implements `ImportSelector`, reads the
`META-INF/spring/...AutoConfiguration.imports` file from every jar on the classpath, and
returns the class names it wants processed as configuration; the `@Conditional` annotations
on those classes then decide whether each applies. This is why a starter's beans appear
without any import on your side. When a condition is not met, the bean simply does not
exist, and the correct diagnostic is the `ConditionEvaluationReport` — available from
`--debug` at startup or `/actuator/conditions` at runtime — which records every condition
that was evaluated, whether it matched, and why.

**Q7. A team has 400 tenants on per-tenant bean registration. Startup has gone from 20s to
3 minutes and the deployment is now the bottleneck. What is your recommendation?**

Measure first: the cost is 400 × the size of each tenant's graph, so check whether the
registrar is registering one bean per tenant or a subgraph, and whether shared services are
being duplicated. Then the structural recommendation is almost always to move to
`Map<TenantId, Impl>` where the per-tenant difference is the implementation of one
interface — that converts an O(tenants) startup into O(implementations). If the graph
genuinely must differ, the fallback is one `ApplicationContext` per tenant with the shared
beans in a parent, which contains the blast radius but not the memory. The organisational
point: the deploy has become the product's onboarding bottleneck, and that is a change in
what the team is optimising for, not just a performance problem.

> **CHAPTER 5 SUMMARY**
>
> `@Import` comes in three forms with genuinely different powers: a class (modular config),
> an `ImportSelector` (choose class names, can't touch the registry), and an
> `ImportBeanDefinitionRegistrar` (register definitions programmatically, which is the only
> one that works for non-configuration classes). `FactoryBean` is the indirection behind
> `@Bean` methods — it changes type matching to `getObjectType()`, adds the `&name`
> dereference, and is worth writing as a class only in library code. The staff-level
> question is what dynamic registration buys you: per-tenant beans give you startup-time
> validation and dependency injection at the cost of O(tenants) startup, a deploy per new
> tenant, and a global blast radius. When the only difference between tenants is the
> implementation of one interface — which is almost always the case — a `Map<TenantId, Impl>`
> is the right answer and the bean registration is over-engineering.

#### Further Reading

- [Spring Framework Reference — Composing and Importing Configuration Classes](https://docs.spring.io/spring-framework/reference/core/beans/java/composing-configuration-classes.html) — all four `@Import` variants with worked examples, including `ImportBeanDefinitionRegistrar`'s interaction with the registry.
- [Spring Framework Reference — Programmatic Bean Registration](https://docs.spring.io/spring-framework/reference/core/beans/java/programmatic-bean-registration.html) — `registerBean`, `registerSingleton`, and what each one skips; the clearest available statement of the distinction asked about in Q5.
- [Spring Framework Reference — Customizing the Nature of a Bean](https://docs.spring.io/spring-framework/reference/core/beans/factory-nature.html) — the `FactoryBean` and `SmartFactoryBean` contract, `getObjectType()`'s role in type prediction, and the bean lifecycle callbacks.
- [Spring Boot Reference — Auto-Configuration](https://docs.spring.io/spring-boot/reference/using/auto-configuration.html) — how the `ImportSelector` chain turns starters into beans, and how `@Conditional` decides whether each one applies.

## Chapter 6 — Resource Loading & the Environment

### 6.1 The `Resource` Hierarchy

Volume 1 Chapter 5 introduced the resource abstraction in the context of the context
hierarchy. This chapter is about the parts that cost you in production: the classpath-scan
behaviour, the i18n gotcha, and the fact that a `Resource` is an abstraction over *where
bytes come from* while a `BeanDefinition` is an abstraction over *how objects are made*, and
the two get confused constantly.

```java
public interface Resource extends InputStreamSource {
    boolean exists();
    URL getURL() throws IOException;
    InputStream getInputStream() throws IOException;
    Resource createRelative(String relativePath) throws IOException;   // ← the interesting one
    String getFilename();
    String getDescription();
}

 ClassPathResource     new ClassPathResource("db/schema.sql")
 FileSystemResource    new FileSystemResource("/etc/acme/config.yml")
 UrlResource           new UrlResource("https://cdn.acme.com/logo.png")
 ByteArrayResource     new ByteArrayResource(bytes)
 InputStreamResource   new InputStreamResource(inputStream)             // read-once, can't read twice
```

The `ResourceLoader` is the strategy for producing one from a location string, and
`PathMatchingResourcePatternResolver` is the layer that adds Ant-style patterns and the
`classpath*:` prefix.

> **MUST REMEMBER**
>
> **`ApplicationContext` is both a `ResourceLoader` and a `Resource`.** That dual role is
> why `new ClassPathXmlApplicationContext("beans.xml")` works — the string is resolved
> *against the context itself*, before the context exists, through a
> `DefaultResourceLoader`. It is a genuinely strange design and it is the reason resource
> location in Spring is a string rather than a typed object. It also means the prefix you
> write (`classpath:`, `file:`, `http:`) selects the resolution strategy, and a
> `Resource` constructed without a prefix on a context is resolved relative to that context.
>
> `InputStreamResource` deserves a specific warning: it is the only `Resource` whose
> `getInputStream()` may be called only **once**. Reading it twice returns an empty or
> failing stream. Any code that passes resources around and might read twice needs a
> `ByteArrayResource` instead.

### 6.2 `classpath:` vs `classpath*:` — Cross-Referenced

Volume 1 covered this distinction and the reasoning is unchanged, so it is one line here
and the failure mode is the part worth keeping:

```text
 classpath:db/migration.sql
   └─ resolves the FIRST match, then stops.
      A copy in your application jar is IGNORED if a dependency ships one first.

 classpath*:db/*.sql
   └─ resolves ALL matches across every jar, via ClassLoader.getResources().
      Ordering is classloader order — NOT alphabetical, and not guaranteed stable.
```

`classpath*:` is what makes Flyway-style discovery, multi-JAR locale bundles, and
`spring.factories` aggregation work, and it is also the mechanism behind a whole family of
"my override isn't being picked up" bugs. Where a resource may legitimately be contributed
by more than one artifact, you need `classpath*:`; where you want your own copy to win, you
want `classpath:` — or you want `classpath*:` plus an explicit ordering rule, which is
usually the honest answer and almost never the one people write.

### 6.3 The Message Source Decision

```java
@Bean
MessageSource messageSource() {
    ReloadableResourceBundleMessageSource ms = new ReloadableResourceBundleMessageSource();
    ms.setBasename("classpath:messages/messages");   // messages_de.properties etc.
    ms.setDefaultEncoding("UTF-8");
    ms.setFallbackToSystemLocale(false);              // ← THE setting people miss
    ms.setCacheSeconds(-1);                          // no caching; for dev only
    return ms;
}
```

| | `ResourceBundleMessageSource` | `ReloadableResourceBundleMessageSource` |
| --- | --- | --- |
| Caching | Uses `ResourceBundle`'s JVM-level cache | Its own, with `setCacheSeconds` |
| Reload without restart | No | Yes — `setCacheSeconds(-1)` in dev, or a small positive value |
| `classpath*:` bundles across jars | No | No — same limitation; use an aggregate |
| Production overhead | Lower | Slightly higher; a file-timestamp check |
| `.properties` only | Yes | Yes, plus YAML variants via a custom resolver |

`setFallbackToSystemLocale(false)` is the setting that produces the "works on my machine"
i18n bug. With the default `true`, resolution falls back to `Locale.getDefault()` — the
**JVM's** locale, which on a developer machine is often not what the user's request says.
The failure pattern: a user in `en-GB` gets the `en` bundle on a machine whose default
locale is `en-GB`, and a translated `messages_de.properties` in a container with a
default locale of `en` gets ignored for the same reason. Set it to `false` and make the
resolution explicit.

> **PRODUCTION RELEVANCE**
>
> The container-side version of the same bug is worse: in Docker, `LANG` is frequently unset,
> so `Locale.getDefault()` is `en_US` for every request, and any message key missing from
> the requested bundle silently resolves against `en` rather than failing. If your
> application translates user-facing strings, `setFallbackToSystemLocale(false)` plus a
> `LocaleResolver` you control is a five-character change that removes an entire class of
> "only some users see translated text."

### 6.4 `PropertiesLoaderUtils` and `EncodedResource`

Loading properties with a known encoding — the two utilities worth naming:

```java
// PropertiesLoaderUtils — fills a Properties from a Resource, resolving ${...} within it
Properties props = PropertiesLoaderUtils.loadProperties(
        new ClassPathResource("config/limits.properties"), "UTF-8");

props.getProperty("order.max-lines");        // "100"
// ${...} placeholders INSIDE the file are resolved against the Environment

// EncodedResource — when you control the reader
Properties props2 = new Properties();
try (InputStream in = new EncodedResource(
            new ClassPathResource("limits.properties"), "UTF-8").getInputStream()) {
    props2.load(in);
}
```

The `setDefaultEncoding` argument to `loadProperties` is the point. `Properties.load(InputStream)`
is **ISO-8859-1 by specification** — it has been since Java 1.0 and it has never changed,
which is why a properties file with a `€` sign or an accented character comes out mangled
unless you read it through a reader or use the encoding-aware overload. Every team meets
this once, and the fix is `loadProperties(resource, "UTF-8")` rather than
`resource.getInputStream()`.

> **INTERVIEW TRAP**
>
> "YAML properties files, so encoding isn't an issue" is the answer that sounds right and
> isn't the whole story. YAML is UTF-8, so the encoding trap is genuinely gone — but the
> *other* half of the problem remains: `@PropertySource` reads `.properties` files, not
> `.yml`, and a `@PropertySource` pointing at a YAML file either fails or needs a custom
> `PropertySourceFactory`. And `Environment.getProperty` is unaffected either way — it is
> the `Properties.load` call in your own code that has the ISO-8859-1 behaviour.

### 6.5 SpEL — Where It Can Reach

Volume 1 covered `@Value` SpEL syntax. The senior-level question is not the syntax, it is
**the blast radius** — which subsystems evaluate expressions, and what happens if an
expression is user-supplied.

```text
 @Value("#{...}")                      expression evaluated at bean creation, against the
                                       bean as the root object
 @PreAuthorize("hasRole('ADMIN')")     Spring Security — a WHOLE SpEL language, at
                                       authorisation time, on the security-critical path
 @Profile("prod & !eu")                profile expressions are SpEL too
 @Conditional(SpelCondition.class)     SpEL in conditions — a general extension point
 @Scheduled(cron = "#{...}")           cron expression from a property
 BeanDefinitionRegistryPostProcessor   anything you write that calls
                                       expressionParser.parseExpression(...)
```

The security case deserves the emphasis, because it is the one with a real threat model.
`@PreAuthorize("hasRole('ADMIN') and @rateLimiter.allow(authentication.name)")` is
expressive and completely normal. It is also a place where a **string concatenation bug
becomes an authorization bypass**:

```java
// ❌ SpEL injection — if `path` is attacker-controlled, this is RCE-class
@PreAuthorize("hasRole('ADMIN') and @acl.isAllowed(#path, authentication.name)")
// where #path came from a request parameter

// ✅ The safe form: pass the value as a variable, never concatenate into the expression
@PreAuthorize("hasRole('ADMIN') and @acl.isAllowed(#path, authentication.name)")
public void delete(@P("path") String path) { ... }
```

In the correct version the *expression* is a constant in the annotation and only the
*variable* comes from the caller. That distinction — expression fixed, data bound to a
parameter — is the whole security property, and it is a genuinely good interview answer to
"where would you draw the line on SpEL?"

### 6.6 The Classpath-Scan Cost, and the Starter That Hid It

```text
  PathMatchingResourcePatternResolver.getResources("classpath*:templates/**")
   │
   ├─ ClassLoader.getResources("templates/")      ← every JAR's directory entries
   ├─ for EACH returned URL
   │     └─ walk the directory tree, matching the Ant pattern
   └─ return every match

  Cost = O(total resources in every matching JAR), and the constant includes
         opening a JarFile per JAR and reading its central directory.
```

This is a top-three suspect for unexplained startup cost, alongside component-scan breadth
and eager I/O in `@PostConstruct` — the three recur in Volume 1 for a reason. The number
worth carrying: a `classpath*:` scan over a fat jar containing 40,000 resources is
measurably slow, and it is slow **at every resolution**, not cached across calls unless you
cache the result yourself.

> **PRODUCTION SCENARIO**
>
> Problem: a service's startup went from 8 seconds to 55 seconds after a routine dependency
> upgrade, with no change to application code.
> Investigation: `--debug` startup timing showed 41 seconds inside
> `ConfigurationClassPostProcessor` and template resolution, not in bean creation. A
> `ClassPathScanningCandidateComponentProvider` trace showed the scan hitting 14,000 classes.
> Root cause: the upgraded library's auto-configuration added a
> `classpath*:META-INF/spring/*.imports`-style scan that did not exist in the previous
> version. The application's own scanning was unchanged.
> Solution: exclude the new auto-configuration explicitly, or narrow the library's scan.
> Prevention: record baseline startup timings in CI and alert on a regression rather than on
> an absolute number — a 40-second startup that is 4x your baseline is a real signal, and a
> 40-second startup that is 1.05x your baseline is not.

The failure mode that recurs: **the expensive scan is never in the team's code.** It is in
a starter, contributed by a transitive dependency, added by a framework team optimising for
the general case rather than for your deployment. When startup degrades, the first question
is "what is scanning the classpath," and the answer is frequently three packages deep in a
library.

> **STAFF-LEVEL CONSIDERATION**
>
> Startup time is an SLO, not a preference, and the reason is operational rather than
> aesthetic: it is the ceiling on how quickly a rolling deploy completes, the ceiling on how
> fast a scale-up event adds capacity, and the time a pod spends burning money before it
> serves a request. A 60-second startup on a 200-replica service is 200 replica-minutes per
> deploy spent idle — which is a real line item and a real argument in a capacity plan.
>
> The practice that pays for itself is a startup-time budget enforced in CI, with the
> condition reporting captured so a regression names the condition that changed rather than
> just producing a number that got worse. The second practice is knowing which of your
> starters' scans you could disable, and having that list — because the question will be
> asked during an incident, not during a design review.

#### Common Mistakes

- Using `InputStreamResource` anywhere the stream might be read twice. It is read-once, and
  the second read returns nothing.
- Reading `.properties` through `resource.getInputStream()` and `Properties.load` and
  wondering why the non-ASCII characters are mangled. `Properties.load(InputStream)` is
  ISO-8859-1 by specification; use `PropertiesLoaderUtils.loadProperties(resource, "UTF-8")`
  or a reader.
- Leaving `setFallbackToSystemLocale` at `true` in a translated application, and then
  debugging a bug that only reproduces in Docker because the container's default locale is
  `en_US`.
- Using `classpath:` for a resource that a dependency might also ship, and silently losing
  your own copy.
- Concatenating an untrusted value into a SpEL expression in `@PreAuthorize`. The expression
  must be a constant in the annotation and the data must be bound to a parameter.
- Assuming a slow startup is bean creation. Classpath scanning, `classpath*:` resolution and
  eager I/O are all in the same window and the `--debug` timing output distinguishes them.
- Caching nothing. Every `classpath*:` resolution re-walks the classpath, so a template
  lookup on a hot path is a genuinely bad idea.

#### Interview Questions — Resources & Environment

**Q1. `classpath:` versus `classpath*:` — what is the actual difference and when does it
bite?** `TRICKY`

`classpath:` resolves the first match and stops, which is a single
`ClassLoader.getResource` call. `classpath*:` calls `getResources` and aggregates every match
across every jar, then walks each one. It matters whenever a resource can legitimately be
contributed by more than one artifact — migration scripts, locale bundles, auto-configuration
metadata. The failure mode is silent: with `classpath:`, your application's copy of a
resource that a dependency also ships is simply never read, and there is no warning. The
performance dimension is that `classpath*:` is O(resources) and is usually the hidden cost in
a slow startup.

**Q2. Why do my properties files get mangled when I read them directly?** `TRICKY`

`Properties.load(InputStream)` decodes as ISO-8859-1, and that has been the specified
behaviour since Java 1.0. A UTF-8 file with an accented character or a currency symbol comes
out as mojibake unless you either use `PropertiesLoaderUtils.loadProperties(resource,
"UTF-8")` or load through an `InputStreamReader` with an explicit charset. Note the related
trick: non-ASCII characters *may* be escaped as `\uXXXX`, which works regardless of encoding
— which is why some files work and others don't.

**Q3. What does `setFallbackToSystemLocale(false)` actually change, and what breaks if you
leave it at the default?** `TRICKY`

With the default `true`, message resolution falls back to `Locale.getDefault()` — the JVM's
locale — when the requested bundle does not resolve. In a container with no `LANG` set that
is `en_US` for every request, so a request for `de` that is missing a key resolves against
English rather than failing, and on a developer machine whose locale matches the bundle the
same code path succeeds. The result is translations that work for some users and not others,
and it is the classic "works on my machine" internationalisation bug. Setting it to `false`
makes resolution explicit and deterministic.

**Q4. Your startup regressed from 8s to 55s after a dependency upgrade, and nothing in your
code changed. Where do you look?** `TRICKY`

At what is scanning the classpath, in order: component-scanning breadth (has the new
dependency added a `@ComponentScan` over a broad package?), `classpath*:` resolution
contributed by the library's auto-configuration, and `BeanFactoryPostProcessor`s that scan
`ClassPathScanningCandidateComponentProvider`. The `--debug` startup timing output separates
these, because the expensive work lands in `ConfigurationClassPostProcessor` rather than in
bean creation. The realistic answer is that the scan is in the library, not in your code, and
the fix is to exclude that auto-configuration or narrow the scan.

**Q5. How would you make a template overridable by an application without editing the
library?** `TRICKY`

Two approaches, and the choice is about how much control you want. With `classpath*:`, every
matching template from every jar is collected and you pick the winner by an explicit rule
based on classloader order or a priority annotation — deterministic, but you have to define
the rule. With `classpath:` on a well-known path, your jar's copy wins only if it is first on
the classpath, which is fragile. The robust third option, which most platforms converge on,
is a chain: a library default resource, an application override resource, and an explicit
"this one wins" marker, resolved by code rather than by classpath order.

**Q6. `@PreAuthorize("hasRole('ADMIN') and @acl.allows(" + path + ")")` — is that a
problem?** `ADVANCED`

Yes, and it is a serious one. If `path` is attacker-controlled, the attacker controls the
expression, and SpEL in a security annotation is a code-execution-class vulnerability. The
fix is to keep the expression a constant in the annotation and bind the data to a parameter
with `@P`:
`@PreAuthorize("hasRole('ADMIN') and @acl.allows(#path)")` with the value supplied as a
method argument. The general rule is that SpEL is a powerful language and every place it is
evaluated is a place where a fixed expression and bound data is the security property you
are relying on — so the rule is worth stating explicitly in review rather than assuming
everyone knows it.

**Q7. `ApplicationContext` implements both `ResourceLoader` and `Resource`. Why is that
worth knowing?** `TRICKY`

Because it explains why a context can be used as a source location: `new
ClassPathXmlApplicationContext("classpath:beans.xml")` resolves the string against the
context's own `ResourceLoader`, using the prefix to select a strategy, and the context is
itself a `Resource` so a child context can load relative to its parent. It also means the
classloader used for resolution is the context's, which matters in a container where the
thread context classloader and the application's differ. It is a strange design that you will
meet exactly once and misread exactly once.

**Q8. `MessageSource` fails to find a bundle in production but works locally. The bundle
exists in the jar. What are the three candidate causes?** `STAFF`

Encoding: the properties file was written as UTF-8 with non-ASCII characters and loaded
through a path that is ISO-8859-1, so the keys that contain non-ASCII are themselves
corrupted and no longer match. Classpath: a `classpath:` prefix is resolving a different
jar's copy of the bundle — common when a dependency ships the same base name, and silent.
And locale fallback: `fallbackToSystemLocale` at its default, with a container `LANG` that
points somewhere the resolution chain goes to the base bundle for requests that should have
hit a translated one. All three produce "works locally, wrong in production," and all three
are invisible without checking the resolution chain in a container-identical environment.

> **CHAPTER 6 SUMMARY**
>
> `Resource` is an abstraction over where bytes come from, `BeanDefinition` over how objects
> are made, and the two are constantly confused. The three things that cost real money:
> `classpath*:` is O(resources) and is the hidden scan in most slow startups, usually
> contributed by a starter rather than by the team; `Properties.load(InputStream)` is
> ISO-8859-1 by specification and mangles UTF-8 unless you say otherwise; and
> `setFallbackToSystemLocale` at its default produces internationalisation bugs that
> reproduce only in containers. SpEL's real question is not syntax but reach — it is
> evaluated in `@Value`, in `@PreAuthorize`, in `@Profile` and in `@Conditional`, and the
> security property in all of them is that the expression stays a constant and the data is
> bound to a parameter.

#### Further Reading

- [Spring Framework Reference — Resources](https://docs.spring.io/spring-framework/reference/core/resources.html) — the `Resource` hierarchy, `ResourceLoader`, `PathMatchingResourcePatternResolver`, and the `classpath:` versus `classpath*:` semantics with the resolution algorithm.
- [Spring Framework Reference — Core Environment Abstraction](https://docs.spring.io/spring-framework/reference/core/beans/environment.html) — `Environment`, `PropertySource`, `@Value` semantics, and where SpEL is evaluated in the container.
- [Spring Framework Reference — Core](https://docs.spring.io/spring-framework/reference/core.html) — the internationalisation section covering `MessageSource`, `ResourceBundleMessageSource` versus `ReloadableResourceBundleMessageSource`, and the `LocaleResolver` chain.
- [Spring Framework Reference — Core Validation](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html) — cross-reference for the conversion pipeline that sits between a `Resource`, a `String` and a bound property, which is where a surprising number of "my value didn't bind" bugs actually live.

## Chapter 7 — Circular Dependencies

### 7.1 The Three-Level Cache

`DefaultSingletonBeanRegistry` holds three maps, and this is the mechanism behind every
circular-dependency behaviour in Spring — including the ones that are hard failures and the
ones that are not.

```text
 ┌──────────────────────────────────────────────────────────────────────────┐
 │  LEVEL 3 — singletonFactories:  name → ObjectFactory<?>                  │
 │  "If anyone needs this bean before it's finished, CALL THIS."            │
 │  Populated the moment instantiation starts.                              │
 │                                                                          │
 │  LEVEL 2 — earlySingletonObjects:  name → Object (raw or exposed early)   │
 │  "Someone already asked for this; here's the answer."                   │
 │                                                                          │
 │  LEVEL 1 — singletonObjects:  name → Object (fully initialised)           │
 │  "This bean is done. Serve it to everyone."                              │
 │                                                                          │
 │  Lifecycle of one bean:                                                  │
 │    createBean()                                                           │
 │      └─ addSingletonFactory(name, () -> getEarlyBeanReference(beanName)) │  → L3
 │      └─ populate / initialise                                            │
 │      └─ if cycle: someone called getSingleton()                          │
 │           → calls the L3 factory                                         │
 │           → getEarlyBeanReference() asks every SmartInstantiationAware   │
 │             BeanPostProcessor whether to wrap the raw instance           │
 │           → result moved L3 → L2, and the L3 entry is REMOVED            │
 │      └─ clearSingletonFactory(name)                                       │
 │      └─ addSingleton(name, fullyInitialisedBean)                          │  → L1
 └──────────────────────────────────────────────────────────────────────────┘
```

### 7.2 The Cycle, Step by Step

```java
@Service class AService { AService(BService b) { ... } }   // constructor injection
@Service class BService { BService(AService a) { ... } }
```

```text
 getBean("AService")
  └─ beforeInstantiate: no cached factory → instantiate AService
       └─ CONSTRUCTOR RUNS → resolve BService
            └─ getBean("BService")
                 └─ no cached factory → instantiate BService
                      └─ CONSTRUCTOR RUNS → resolve AService
                           └─ getBean("AService")
                                └─ L1?  no
                                └─ L2?  no
                                └─ L3?  YES — ObjectFactory registered at the
                                       START of AService's creation
                                     └─ call the factory
                                          └─ getEarlyBeanReference("AService")
                                             └─ returns the RAW AService
                                                (partially constructed, not
                                                 initialised, not proxied)
                                          └─ store in L2, remove from L3
                                └─ BService's constructor receives the raw A ✓
                      └─ BService initialised, added to L1
       └─ AService's constructor receives B ✓
  └─ AService initialised, promoted L2 → L1
```

### 7.3 Why Three Levels and Not Two

This is the question that separates people who have read `DefaultSingletonBeanRegistry` from
people who have memorised a blog post about it, and the answer is **because a raw object
must never be handed out twice, and a proxy must be consistent.**

Consider what happens with two levels. `AService` needs an early reference. We look in
`earlySingletonObjects` and store the raw instance there. Later, when `AService` finishes,
it gets promoted to `singletonObjects` — but between those two moments, a *second* consumer
arrives. With only two maps, we cannot distinguish "the first consumer already took the raw
object" from "no one has taken it yet", so we would have to either:

- **hand out the raw object every time**, which means `@Transactional` on `AService` does
  not work for *any* consumer in the cycle, or
- **upgrade the cached object to a proxy later**, which means the first consumer holds a
  reference to a different object than the second, and the two disagree about whether the
  bean is proxied.

The three-level design fixes both: **level 3 holds the factory, not the product.** The
factory is called at most once, and its result is written to level 2. Every subsequent
consumer finds it in level 2 and gets the *same* object — whatever `getEarlyBeanReference`
decided that object is, proxy or not. The factory entry is removed precisely so a second
call cannot produce a second, different answer.

```text
  Why the ObjectFactory is essential, stated precisely:

  AOP decides at early-reference time whether to wrap the raw instance.
  If we cached the RAW instance and decided about proxying later, the first
  consumer would already be holding the unwrapped object — and @Transactional
  would be silently absent for exactly the beans in a cycle, which are the ones
  least likely to be covered by a test.

  Caching a FACTORY defers that decision to the first consumer and makes it
  consistent for all of them.
```

### 7.4 The Rule — Setter/Field Yes, Constructor No

```text
 ┌───────────────────────┬────────────────────┬──────────────────────────────┐
 │ Injection style       │ Cycle resolvable?  │ Why                          │
 ├───────────────────────┼────────────────────┼──────────────────────────────┤
 │ Field (@Autowired)    │ YES                │ instance exists before      │
 │                       │                    │ population — it can be       │
 │                       │                    │ handed over mid-population   │
 ├───────────────────────┼────────────────────┼──────────────────────────────┤
 │ Setter                │ YES                │ same — the object exists     │
 │                       │                    │ before the setter is called  │
 ├───────────────────────┼────────────────────┼──────────────────────────────┤
 │ Constructor           │ NO                 │ the constructor has not      │
 │                       │                    │ RETURNED. There is no       │
 │                       │                    │ instance to hand out. The   │
 │                       │                    │ `this` reference does not    │
 │                       │                    │ exist until the JVM assigns  │
 │                       │                    │ it, and that happens after   │
 │                       │                    │ the body completes.          │
 └───────────────────────┴────────────────────┴──────────────────────────────┘
```

The JVM-level reason is the important one. Inside a constructor, the object under
construction is a local variable in the JVM's frame, not yet an object reference the VM
will publish. Java's own `this` escape rules forbid handing `this` out before construction
completes for good reason — a subclass or a collaborator that stores the reference can
observe a partially-initialised object. Spring's early-reference mechanism is precisely a
`this` escape, which is why the container refuses to do it for constructor injection and
why it is a genuine code smell where it does happen.

> **MUST REMEMBER**
>
> **Field injection hides cycles; it does not solve them.** The three-level cache makes a
> setter/field cycle *work* — and that is exactly the problem, because a working cycle is
> invisible. Nobody gets an exception, so nobody investigates. The class is genuinely
> un-constructible in isolation, `new AService(b)` and `new BService(a)` are mutually
> impossible, and the only reason the application runs is that the container is willing to
> hand out half-built objects. Every test that constructs these classes with a mock gets a
> different object graph than production.
>
> When a field-injected cycle shows up in a code review, the finding is not "add `@Lazy`" —
> it is "this class cannot be constructed without a container, and that is a design problem
> hiding behind a runtime mechanism."

### 7.5 Boot 2.6 — `allow-circular-references=false`

```properties
# Boot 2.6+ — THIS IS THE DEFAULT
spring.main.allow-circular-references=false

# The escape hatches, and what they cost
spring.main.allow-circular-references=true      # restores the old behaviour entirely
spring.main.lazy-initialization=true            # makes cycles "work" by deferring creation
```

Boot 2.6 changed the default after a body of reports that circular references were masking
real design problems and, in a circular bean with AOP, producing objects that were
**unproxied** — the early reference path and the proxying path do not always agree, and the
result is a `@Transactional` bean that silently is not transactional for callers inside the
cycle.

```text
  The tempting "fix" after 2.6:

  spring.main.lazy-initialization=true

  ── what it appears to do ────────────────────────────────
  Nothing is created during refresh, so no cycle is ever hit. Startup passes.

  ── what it actually does ────────────────────────────────
  The cycle is not solved; it is deferred to the first request that touches
  the cycle. Consequences:
    · startup no longer validates the object graph
    · the first request on each code path pays construction cost
    · a cold instance in a scale-up serves its worst latency under load
    · a BeanCurrentlyInCreationException now surfaces as a 500 in production
      instead of a startup failure in CI

  Use it to DIAGNOSE ("is the cost in eager init?"), never as the fix.
```

### 7.6 `@Lazy` — A Real Fix With a Real Cost

```java
@Service
public class AService {
    private final ObjectProvider<BService> b;      // ← the modern form: no proxy needed
    public AService(ObjectProvider<BService> b) { this.b = b; }
    public void use() { b.getObject().doWork(); }
}

@Service
public class AService2 {
    private final BService b;
    public AService2(@Lazy BService b) { this.b = b; }   // ← injects a PROXY
}

@Component
class CircularHolder {          // ── the actual recommended fix
    private final A a;
    private final B b;
    public CircularHolder(A a, B b) { this.a = a; this.b = b; }
    public void run() { a.setB(b); }        // wiring after construction, one direction
}
```

| Fix | Cost | Reversibility |
| --- | --- | --- |
| `@Lazy` on the injection point | A CGLIB proxy allocated for the dependency; a virtual call per method; a `BeanCurrentlyInCreationException` deferred to first use if the cycle is *actually* exercised | Easy to remove; easy to add back by accident |
| `ObjectProvider<T>` | No proxy; explicit `.getObject()` at the use site; the call site now says "resolved late" | Easy, and it is honest about the timing |
| `spring.main.lazy-initialization=true` | Everything above, for everything, plus a broken startup-failure story | **Hard** — teams forget it is set and it becomes load-bearing |
| Extract a third object | An extra class; genuinely correct | High — the extra class is obviously right |
| Event-based inversion | Latency of the event; a failure mode that is now "the listener never ran" | Medium |
| `allow-circular-references=true` | The whole 2.6 rationale un-done, application-wide | Trivial, which is the problem |

> **PRODUCTION SCENARIO**
>
> Problem: after a Boot 2.6 upgrade, one service failed to start with
> `BeanCurrentlyInCreationException: Error creating bean with name 'orderService':
> Requested bean is currently in creation: Is there an unresolvable circular reference?`
> Investigation: the stack trace named two beans, `pricingFacade` and `ruleEngine`. Neither
> had changed in two years.
> Root cause: a `@Component` on a configuration class had been changed to depend on a
> component that itself depended on that configuration class. Constructor injection made it
> unresolvable, and the field injection that had been silently covering it had been removed
> in a "cleanup" PR.
> Solution: extracted the shared state both classes needed into a third bean —
> `PricingRules` — which both now depend on. No cycle, no proxy, no `this` escape.
> Prevention: an ArchUnit rule forbidding a cycle among constructors, run in CI. The cycle
> had been invisible for two years precisely because field injection made it work; the rule
> makes it visible at the moment it is introduced.

### 7.7 The Honest Analysis

A circular dependency between two collaborating objects is, with a small and identifiable set
of exceptions, **a modelling error.** It means the two objects cannot be constructed in any
order, which means neither of them is independently meaningful, which means the thing they
are actually modelling — the third thing that genuinely holds the relationship — has not been
given a name.

**Fix one: extract the shared object.**

```text
   OrderService ◀────▶ PricingRules        Both know about the rules.
        │                                      Neither knows about the other.
        ▼
   PricingRules  ◀── the thing the cycle was implicitly about
```

If two classes need each other, they usually both need the *same third thing*, and naming it
is the refactor. This is the fix that is almost always right, and it is the one the
ArchUnit rule should push you towards.

**Fix two: invert the dependency with an event.**

```text
   OrderService ──publishes──▶ (event bus) ──▶ AuditListener
                                     ▲
                              no compile-time link
```

The `ApplicationEventPublisher` pattern from Volume 1 Chapter 6 is the container-native way
to break a cycle that genuinely is bidirectional in the domain. The cost is the trade-off
Volume 6's ending already describes: you move the coupling from the type level to the
behaviour level, the failure mode becomes "the listener silently did not run" rather than
"this will not compile," and there is no durability. Use it when the relationship is
genuinely "when this happens, that should be told" rather than "these two are one thing."

> **INTERVIEW TRAP — "WHY DID SPRING BOOT 2.6 TURN CIRCULAR REFERENCES OFF?"**
>
> Because the three-level cache makes them *work*, and working cycles are worse than broken
> ones. The mechanism is a `this` escape: a half-constructed object is handed to a
> collaborator before its `@PostConstruct` has run and before AOP has decided whether to
> proxy it. The concrete failures are that `@PostConstruct` may never run on the object that
> was handed over early, that a bean in a cycle can be handed out **unproxied** so
> `@Transactional` silently does nothing for exactly the callers inside the cycle, and that
> the cycle is invisible until the day a field injection is converted to constructor
> injection — which is what happened to thousands of teams on 2.6.
>
> The follow-up that shows depth: **"so is `@Lazy` the right fix?"** — `@Lazy` is *a* fix
> and it is legitimate, but it does not remove the cycle, it defers it to first use and
> allocates a proxy, and it does nothing about the modelling problem. The staff answer is
> that you should reach for it when the cycle is real and unavoidable, and otherwise extract
> the third object.

### 7.8 When a Cycle Is Genuine — The JPA Case

One class of circular dependency is **correct**: a bidirectional association. `Order` has a
`Set<OrderLine>`, and `OrderLine` has an `Order`. Neither is meaningful without the other,
no third object is hiding in the middle, and the domain genuinely has the cycle.

```text
  The problem is NOT the domain. The problem is that a bidirectional
  ORM association requires BOTH sides to be constructed, and object
  construction cannot satisfy a cycle.

  The solution is persistence-context navigation, not bean construction:

     Order order = repo.findById(id).orElseThrow();       // fully managed
     order.getLines().forEach(line -> line.getOrder());   // no bean wiring involved

  The JPA entity is a persistence artefact with a lifecycle the container
  does not manage. The BEAN that owns it — a service, a repository wrapper —
  is a different object, and the cycle lives in the entities, not in the graph
  the container builds.
```

The resolution is to **not let the cycle into the bean graph at all**: keep the entities out
of constructor injection, load them through a repository, and let the persistence context
navigate between them. Volume 6 covers the fetch strategies that make this work in practice,
including why the naive fix — `@JsonIgnore` on one side, or splitting the entity into a
read model and a write model — is usually the right call for an API boundary regardless.

> **MUST REMEMBER**
>
> **A circular dependency is a statement about construction order.** If two objects cannot
> be constructed in any order, then neither of them can be constructed without the other
> already existing, which means at least one of them is not an object you should be
> constructing — it is a *view* over something else. The container's willingness to paper
> over this with a raw half-built reference is a compatibility feature, not a design
> endorsement, and Boot 2.6's default is the framework telling you so.

#### Common Mistakes

- Reaching for `@Lazy` as the first response to a cycle, before establishing whether the
  cycle is real. It defers the failure to first use and allocates a proxy on every injection
  point.
- Setting `spring.main.lazy-initialization=true` to make a cycle "go away". It converts a
  startup failure caught in CI into a first-request failure caught by users, and a cold
  instance in a scale-up serves its worst latency under load.
- Setting `allow-circular-references=true` and not recording that you did. It is a
  one-character, invisible, application-wide reversal of a deliberate 2.6 decision.
- Assuming a bean in a cycle is fully initialised when you receive the early reference. It
  may have had no `@PostConstruct` and no AOP proxy applied, and the container's own
  `getEarlyBeanReference` gives every `SmartInstantiationAwareBeanPostProcessor` a chance to
  change that.
- Assuming `@Lazy` on the injection point means the bean is created at context refresh. It
  is created at first use, which is a first-request latency cost.
- Believing the cycle is in your constructor because that's where the exception names the
  beans. The cycle may be a field-injected one that only became visible after someone
  converted one side to constructor injection.

#### Interview Questions — Circular Dependencies

**Q1. Explain the three-level singleton cache and what each level is for.** `STAFF`

Level 3, `singletonFactories`, holds an `ObjectFactory` per bean, registered the moment
creation starts. It exists so that the *decision* about early exposure — whether to wrap the
raw instance in a proxy — is deferred to the first consumer and made once. Level 2,
`earlySingletonObjects`, holds the result of that factory after a cycle asked for the bean
before it was finished. Level 1, `singletonObjects`, holds fully initialised beans. Three
levels rather than two because caching the raw object would either hand out an unproxied
instance — silently disabling `@Transactional` for everyone in the cycle — or upgrade the
cached object later, giving the first consumer a different object from the second.

**Q2. Why can't constructor injection participate in the cycle resolution?** `TRICKY`

Because there is no instance to hand out. The constructor has not returned, so the object
does not yet exist as a reference the container can pass to anyone — the `this` reference is
assigned by the JVM after the constructor body completes. Field and setter injection work
because the object exists before its dependencies are populated, so an early reference can
be handed over mid-population. Handing out an object mid-constructor is a `this` escape,
which Java's own object model forbids for good reason.

**Q3. Spring Boot 2.6 disabled circular references by default. Why, and what was the actual
harm?** `STAFF`

Because they were working, and working cycles hide three concrete problems. A bean obtained
as an early reference may never have had its `@PostConstruct` run, and may never have been
proxied — so a `@Transactional` bean in a cycle is silently non-transactional for exactly
the callers inside the cycle. The half-constructed state means a field initialised in
`@PostConstruct` or later in the method body is `null` for consumers that got the early
reference. And the cycle itself is invisible, so it survives refactors until someone converts
field injection to constructor injection — which is what surfaced thousands of them in 2.6.

**Q4. A team adds `spring.main.lazy-initialization=true` to fix a cycle. What would you say
at the design review?** `STAFF`

That it defers the problem rather than solving it, and the deferral has a cost that lands on
users. Startup no longer validates the object graph, so the failure moves from CI to the
first request that touches the cycle. A newly scaled instance in an autoscaling event serves
its worst latency exactly when the system is under stress. The legitimate use is
diagnostic — turning it on and seeing whether startup improves tells you the cost is in
eager initialisation — and the legitimate permanent fix is `@Lazy` on the specific
injection point, or better, extracting the third object that the cycle is implicitly about.

**Q5. Is `@Lazy` the correct answer to a circular dependency?** `ADVANCED`

Sometimes, and it is better than the alternatives when the cycle is real. But it does not
remove the cycle: it injects a proxy that resolves the target on first invocation, so the
`BeanCurrentlyInCreationException` moves to the first call rather than going away, the
dependency allocates a proxy at every injection point, and every call becomes a virtual
dispatch. The `ObjectProvider<T>` form is better where you can use it, because it is
explicit about the timing and allocates no proxy. The best answer is usually neither: extract
the shared object, or invert the dependency with an event.

**Q6. When is a circular dependency *correct*, and how do you handle it without the
container solving it for you?**

Bidirectional JPA associations. `Order` holds `Set<OrderLine>` and `OrderLine` holds
`Order`, and no third object is hiding between them. The resolution is to keep the cycle out
of the bean graph entirely: the entities are persistence artefacts managed by the
persistence context, not beans the container constructs, and navigation between them goes
through a repository load rather than through constructor injection. What the container
should be wiring is the *service* and the *repository*, and those should not be circular. The
boundary that resolves it is a good one to draw regardless of JPA — a bidirectional
association is a persistence concern, and a bidirectional *service* dependency almost never
is.

**Q7. A `BeanCurrentlyInCreationException` names two beans, neither of which changed. Where do
you actually look?** `TRICKY`

The exception is thrown at the point the cycle became *unresolvable*, which is not where it
was *created*. A cycle that used to be resolvable via field injection becomes a hard failure
the moment either side is converted to constructor injection, so look at recent
constructor-injection refactors and recent `proxyBeanMethods = false` changes, which have
the same effect on intra-config cycles. Also check whether a bean moved package or whether a
new bean of an existing type was introduced, which can change how an ambiguous dependency
resolves. The right tool is a cycle detection rule in CI, because reading the stack trace
tells you where the loop closes, not where it started.

**Q8. Is the three-level cache a feature or a hazard? Would you rather it not exist?** `STAFF`

It is a compatibility feature and a hazard, and both are true at once. It exists because
`this` escapes and partial construction are impossible in a sound object model, and Spring
chose to make old applications keep working rather than break them at a minor version. The
hazard is that it converts a *design* error into a *runtime* success, which is the worst
possible failure mode for a container: the code works, the tests pass, and the modelling
problem ships. Boot 2.6's default is the correct correction, and the remaining question at
staff level is what your migration posture is — whether you fix the cycles, or turn the flag
back on and schedule the work. Turning it on silently is the answer that ages badly.

> **CHAPTER 7 SUMMARY**
>
> The three-level cache exists to hand out a partially-constructed bean when a cycle asks
> for it, and the third level holds an `ObjectFactory` rather than the object precisely so
> that the proxying decision is made once and applied consistently. That is why field and
> setter injection can participate in a cycle and constructor injection cannot — there is no
> instance to hand out until the constructor returns. Which is also the real lesson: field
> injection *hides* cycles rather than solving them, Boot 2.6's `allow-circular-references=false`
> default is the framework naming that, and `spring.main.lazy-initialization` is a diagnostic
> rather than a fix. The genuine exception is a bidirectional JPA association, and the right
> response there is to keep the cycle in the entities — where the persistence context, not
> the container, resolves it.

#### Further Reading

- [Source: `DefaultSingletonBeanRegistry`](https://github.com/spring-projects/spring-framework/blob/main/spring-beans/src/main/java/org/springframework/beans/factory/support/DefaultSingletonBeanRegistry.java) — the actual three maps and the `getSingleton` / `addSingletonFactory` / `getEarlyBeanReference` logic; the single most useful file to read for this chapter.
- [Spring Framework Reference — Circular References and Bean Dependencies](https://docs.spring.io/spring-framework/reference/core/beans/java/composing-configuration-classes.html) — the framework's own position on cycles, including the `proxyBeanMethods` interaction and what the container will and will not resolve.
- [Spring Boot 3.5 Release Notes](https://github.com/spring-projects/spring-boot/wiki/Spring-Boot-3.5-Release-Notes) — the migration notes covering the circular-reference default change and what teams were expected to do about it.
- [Baeldung — Constructor Injection in Spring](https://www.baeldung.com/constructor-injection-in-spring) — the practical case for constructor injection, with the circular-dependency failure it avoids shown concretely.

---

### End of Volume 2

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- State the full bean creation and destruction sequences in order, and explain *why*
  `@PostConstruct` runs before `afterPropertiesSet()` and `@PreDestroy` runs before
  `destroy()` — naming `CommonAnnotationBeanPostProcessor` and
  `DestructionAwareBeanPostProcessor` as the two dispatch points
- Distinguish `BeanFactoryPostProcessor` from `BeanPostProcessor` by what they see
  (definitions vs instances), name Spring's two examples of each, and explain why a
  `BeanPostProcessor` declared in a `@Bean` method must be `static`
- Explain why a `prototype` injected into a `singleton` gives you exactly one instance
  forever, and name the three fixes with the cost of each
- Describe where bean validation runs in MVC and why adding a `BindingResult` parameter
  silently disables the automatic 400
- Walk through the three-level singleton cache, explain why level 3 holds an
  `ObjectFactory` rather than the object, and state the rule that makes constructor
  injection unable to participate in a cycle
- Decide between per-tenant bean registration and a `Map<tenantId, Impl>`, and say what
  the decision costs at 1,000 tenants

### Coming in Volume 3 — AOP & Proxying

Volume 2 ended where Volume 3 has to begin. The AOP proxy is created in
`postProcessAfterInitialization` — the last step of the creation sequence — which is why it
cannot intercept anything that ran before it, and why the early-reference path in Chapter 7
can hand out an unproxied object. Volume 3 takes that one hook and follows it: JDK proxies
versus CGLIB and why the choice is not yours, `@Aspect` and the pointcut language, advice
ordering and why it is the most common source of "my aspect fired twice", the full list of
things that bypass a proxy (self-invocation, `new` in a `@Configuration` method, direct
`this` calls, private methods, final methods), and the resulting catalogue of silent
`@Transactional` failures. If Volume 1 was about the container and Volume 2 about its
machinery, Volume 3 is about the one mechanism that makes every other Spring feature
silently conditional on a proxy being in the call path.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### The Bean Lifecycle

**P1. A service fails to start with `BeanCreationException`, and the cause chain mentions a
`@PostConstruct` method that queries a table. What is happening and what is the fix?**

The `@PostConstruct` runs during `finishBeanFactoryInitialization()` — phase 3 of
`refresh()` — which is before your application's migrations have run, and before anything
scheduled has started. The fix is not to remove the check; it is to stop treating a startup
gate as a bean constructor. Move the check to an actuator health indicator, or make the bean
that needs the table `@Lazy` so the dependency is created on first use, after the
application is up. Making every bean lazy is the wrong move and pushes the failure into
production traffic.

**T1. A class has `@PostConstruct` and `afterPropertiesSet()`. Which runs first, and which
one can the AOP proxy see?**

`@PostConstruct` runs first, because it is invoked from inside
`CommonAnnotationBeanPostProcessor.postProcessBeforeInitialization()` — a
`BeanPostProcessor` firing an annotation, one dispatch layer below
`invokeInitMethods()`. Neither can be seen by the AOP proxy: the proxy is created in
`postProcessAfterInitialization`, which is the last step of all, after both have run.

**T2. Does a prototype-scoped bean's `@PostConstruct` run once, or every time?**

Every time. The container instantiates, populates, initialises and post-processes the bean
on each `getBean()` call, so `@PostConstruct`, `afterPropertiesSet()`, the init method and
`postProcessAfterInitialization` all run per lookup. The thing that never runs is
destruction — the container holds no reference to a prototype and therefore has no
`DisposableBeanAdapter` for it.

**S1. A PR adds a `@PostConstruct` that calls a method annotated `@Transactional`. What is
the review comment?**

That it will not be in a transaction, and that nothing will fail — the AOP proxy is created
in `postProcessAfterInitialization`, which runs after `@PostConstruct` has already
executed, so even a self-invocation question never arises. The correct move is a
`TransactionTemplate` used explicitly, or a call into another bean whose method is
transactional, with the understanding that this is a self-invocation-equivalent problem and
Volume 3 covers the full list of proxy bypasses.

**D1. Is the eleven-step bean lifecycle a reasonable design, or is it too much machinery?**
`STAFF`

It is reasonable, and the reason is worth being able to argue: each step exists for a
different compatibility or integration need, and each was added when something could not be
expressed any other way. The cost is real and shows up in three places — ordering bugs
(`@PostConstruct` before `afterPropertiesSet` is counter-intuitive and nobody remembers it),
the ambiguity of having four different ways to say "initialise" and three to say "destroy",
and the fact that a custom callback in the wrong phase is a production incident rather than a
compile error. The honest assessment is that the design is right and the *documentation*
of the ordering is the defect. Which is why knowing the order by heart, rather than knowing
that it exists, is what an interview is testing.

**D2. A team proposes removing `@PostConstruct` in favour of doing the work in the
constructor. Is that a reasonable modernisation?** `STAFF`

No, and the reasoning is a good discussion to have. In a constructor, the dependencies are
not yet injected if they are field-injected, so any work that needs a collaborator cannot go
there; and with constructor injection, the work would run before the object's own invariants
are established. The worse problem is subtler: an exception from a constructor body is
reported as a bean *creation* failure, and the object may be visible to an early reference
before the work completes. The correct home for "after the container has wired me" is
`@PostConstruct`; for "after everything is built" it is `SmartInitializingSingleton`; and
for "when this specific thing should happen" it is neither, and a lifecycle callback is the
wrong tool entirely.

**P7. A pod takes 45 seconds to become ready and the readiness probe times out during
rollouts. Which lifecycle callbacks do you look at first?**

Anything doing I/O on the singleton creation path — `@PostConstruct`, a non-lazy `@Bean`
method, an eager `init-method` — because all of it runs serially on the refresh thread
during `finishBeanFactoryInitialization()`. Then `SmartInitializingSingleton`
implementations, which are a single serial batch by definition, and then classpath
resolution. The probe timing is itself the tell: a slow *startup* delays readiness
measurably, whereas a slow first request delays nothing until traffic arrives, so the
symptom separates the two causes before you open a profiler.

**D15. Does the container guarantee anything at all about a singleton's thread safety?**
`STAFF`

Exactly one thing, and stating it precisely is the whole answer: **safe publication**. The
bean is fully constructed, its `@PostConstruct` has completed, and the reference is
published to any later thread with the happens-before edges the creation path establishes.
The container guarantees nothing about the methods — no synchronisation, no copying, no
isolation. Every mutable field on a singleton is a shared mutable field, and a
`SimpleDateFormat` or a non-concurrent cache field is a data race that publication does not
touch. The scope that *removes* the obligation rather than documenting it is `request`
scope, where the object is only ever touched by one thread — which is an argument for
using it, not an argument against it.

### Post-Processors

**P2. A new library is added and suddenly no `@PostConstruct` in the application runs. What
happened?**

A `BeanPostProcessor` registered by the library, ordered ahead of
`CommonAnnotationBeanPostProcessor`, is almost certainly displacing it — `PriorityOrdered`
runs before the unordered group. Or the library's processor is throwing in
`postProcessBeforeInitialization` for beans it does not recognise, which aborts the whole
refresh. The diagnostic is the `BeanPostProcessorChecker` output with `--debug`, plus
enabling `DEBUG` on `org.springframework.beans.factory.support` to see the actual chain and
its order.

**S8. A PR adds a `BeanPostProcessor` that wraps every bean in a timing decorator. What is
the reviewer's first question?**

How many beans, and how many of them are on a hot path. The hook runs once per bean per
refresh, and if it returns a proxy rather than the original, every subsequent method call
pays a virtual dispatch — and if it does that for the `DataSource` or the `RestTemplate`, it
is on every request. The second question is what it does when the bean is already proxied,
since the container's own AOP proxies are created in the same hook and the ordering between
them is not obvious from the code. The third is whether a `try`/`catch` is in place: an
exception in this hook aborts the entire context refresh, not just one bean.

**T3. Does `postProcessAfterInitialization` run in the same order as
`postProcessBeforeInitialization`?** `ADVANCED`

No. The `before` methods run in registration order and the `after` methods run in
**reverse** registration order, which is deliberate: a post-processor registered later and
registered earlier then wraps the bean so that the later one ends up outermost. On top of
that, "registration order" is itself governed by `PriorityOrdered` first, then `Ordered`,
then registration — not by source file order.

**S2. A PR adds a `BeanPostProcessor` that sets a scope or a `@Qualifier` on beans. What is
the review comment?**

That it cannot work. Scopes, lazy flags, qualifiers and primary flags live on the
`BeanDefinition`, and by the time a `BeanPostProcessor` runs the definition has already been
consumed to create the instance. A `BeanPostProcessor` sees live objects and can wrap,
inspect or replace them; changing what gets created and how it is described is a
`BeanFactoryPostProcessor`'s job, and if it needs to add a definition, a
`BeanDefinitionRegistryPostProcessor`'s.

**D3. A team wants to write a custom `BeanPostProcessor` that adds a metric to every
service. Is this a good use of the extension point?** `STAFF`

It is a legitimate use, and I would still push back on it. `postProcessAfterInitialization`
runs once per bean per refresh — with 3,000 beans that is 3,000 invocations, and it runs
again for early references in cycles. The cost per invocation is small if the body is an
`instanceof` and a map put, and it becomes visible the moment someone adds a log line or an
annotation lookup. The better tools for the stated goal are Micrometer's observation
support for beans, or an aspect in Volume 3's sense — both of which are designed for "wrap
this class's methods" rather than "touch every object the container ever makes." The general
principle: the extension point is powerful, it runs in the container's hot path, and the
cost of a mistake is paid by every bean in the application.

**D4. Is `BeanPostProcessor` the right place to enforce a cross-cutting architectural rule,
or should that be a build-time check?**

A build-time check, almost always. The appeal of the post-processor is that it is
enforceable and impossible to bypass, which is real — but the cost is that it runs inside
the container's lifecycle, so the failure mode is a startup exception with an unhelpful
message rather than a compiler error, and it cannot see anything the class files do not
expose. ArchUnit, Error Prone, or a forbidden-apis rule gives the same guarantee as a build
failure with a much better message and no runtime cost. Reserve `BeanPostProcessor` for
things that genuinely need the live object graph.

**D16. Could you implement `@Transactional` as a `BeanPostProcessor` rather than as an
aspect? What would you lose?** `ADVANCED`

Mechanically you could — the proxy creation is exactly what
`AnnotationAwareAspectJAutoProxyCreator` already does, and it *is* a `BeanPostProcessor`.
What you would lose is composition. Aspects have ordering (`@Order` on the advice),
pointcut expressions that select precisely the methods that should be advised, and the
ability for several advisors to stack on one proxy in a defined sequence. A hand-rolled
post-processor that proxies everything has no notion of which methods to intercept, so you
end up advising getters and `toString` as well, and there is no way to say "this advice runs
outside that one." The deeper point is that the extension point is the wrong *level* — it is
about objects, transactions are about *invocations* — and choosing the level wrong is why
custom infrastructure becomes unmaintainable: the cost shows up as the features you cannot
add later, not the ones you could not build on day one.

### Scopes

**P3. A shopping cart leaks items between users. `CartService` is `@Scope("prototype")` and
injected into a singleton `OrderService`. What is the mechanism and the fix?**

The singleton's constructor ran once, at refresh, and resolved the prototype at that moment.
The container honoured prototype semantics — that instance *was* freshly created — but the
singleton captured it as a field value and never asked again. The dependency is a value
captured at startup, not a recipe. The fix is `ObjectProvider<CartService>` with
`getObject()` per call, or a scoped proxy on the prototype. The prevention is the review
rule: a prototype injected by constructor into a singleton is a blocking comment, because
the annotation says "prototype" and the code means "one of them."

**T4. A `request`-scoped bean is captured in a field of a singleton during request 1. What
does request 2 see?**

The captured instance, with no exception. The scoped-proxy mechanism exists precisely to
prevent this: the proxy re-resolves the target per invocation. Capturing the object rather
than the proxy freezes it, and because the singleton field is shared, every request on that
thread sees whichever instance was captured last. This is the failure mode that produces
"one user's data is visible to another" with no stack trace pointing anywhere useful.

**S3. A PR changes a `session`-scoped bean to hold a `SecurityContext`. What should the
reviewer raise?**

That `SecurityContext` already has a lifecycle-managed home and adding a second one creates
two sources of truth that can disagree. More broadly, the reviewer should ask what happens
on the session's expiry and on container restart — a session-scoped bean's contents live in
the session, so anything security-relevant placed there is not durable, and anything
stateful placed there becomes state that outlives the request in a way the team may not have
intended. The general rule for session scope: it is for data whose lifetime genuinely is the
session, and the blast radius of a mistake is the user, not the request.

**D5. Is a scoped proxy a good default for solving the prototype problem?** `STAFF`

No, despite being the most elegant solution. It is invisible — nothing at the injection
point distinguishes a scoped proxy from a real bean, so a reviewer reading the constructor
cannot see that every call is doing a scope lookup, and the thread-safety obligation differs
by an order of magnitude. It costs a target lookup per method invocation, which is a
`ThreadLocal` dereference plus a map access, multiplied by every call in the request. And it
fails for types CGLIB cannot subclass — a `final` class, a class with `final` methods, an
object that gets serialised. `ObjectProvider<T>` is explicit, free, and states the timing in
the code. Use the proxy when you want the injection point to read naturally and the type is
proxyable; prefer the provider when you want the resolution to be visible.

**D6. A team uses `request` scope to avoid threading a parameter through six method
signatures. What would you recommend?** `STAFF`

Pass the parameter. Request scope converts a compile-time dependency into a hidden runtime
one: the class no longer names the collaborator, no constructor mentions it, and no unit
test can construct the class without a `RequestContextHolder` setup. It is correct when the
object's *identity* is request-bound — the security context, the current locale, a per-request
idempotency token — and wrong when it is a value being carried through a call chain. The
test I would apply in review: could this value legitimately change mid-request? If yes, it
must be a parameter, because a request-scoped bean is frozen at first resolution for the
remainder of the request. The cost people forget is the scoped proxy's per-call lookup,
paid on every method of every request-scoped bean in the request.

**P8. A `@Scheduled` job in an otherwise-working web application throws
`IllegalStateException: No thread-bound request found`. Everything HTTP works. What is
happening?**

The job runs on a scheduler thread that has no `RequestAttributes` bound to it, so
`RequestScope` — which resolves through `RequestContextHolder` — cannot produce a target.
The application is a web application, but *this thread* is not processing a request, and
`RequestScope` only cares about the thread. The same failure appears in an
`ApplicationRunner`, an `@Async` task, and a startup listener. The fix is to stop depending
on request scope from background work and pass what the job needs explicitly; the
preventable version is a request-scoped dependency reached from a service that is *also*
called by the scheduler, which makes an HTTP-only feature break a nightly job.

**T9. A `@Scheduled` method calls a service whose method parameter is a `request`-scoped
bean. Does it work if the app is `spring-boot-starter-web`?**

No. The scope is resolved per thread through `RequestContextHolder`, and a scheduler thread
has no `RequestAttributes`, regardless of whether the application is a web application. The
bean's scope and the application's web-ness are independent facts. The exception is
`IllegalStateException: No thread-bound request found` — or, when a `RequestScope` is
registered but unbound, "Request scope is not active."

**D17. At what point would you standardise a team on `ObjectProvider` over scoped proxies,
and what would you say to the other side?** `STAFF`

I would standardise on `ObjectProvider` as the default and treat the scoped proxy as an
exception requiring justification, and the argument is visibility rather than performance.
A scoped proxy makes the substitution invisible: nothing at the injection point
distinguishes it from a real bean, so a reviewer cannot see that every call is doing a scope
lookup, and the thread-safety obligation differs by an order of magnitude between the two
forms. That invisibility is a durable cost in a codebase, and it is paid at every future
review. The performance argument is real but weaker — microseconds per call, invisible in a
profiler — and I would not win a review with it. The genuine case for the proxy is
ergonomic: when a request-scoped bean is a legitimate dependency in twenty classes, the
provider form is noisy, and the noise is what eventually drives people back to injecting
`ApplicationContext`. So the honest position is that the default is the explicit form and
the proxy is a team-level convention you adopt once, deliberately, rather than a per-bean
discovery.

### Validation

**P4. A `POST /orders` endpoint began accepting orders with a null customer after a
three-week-old refactor. No exception was thrown. What is the most likely cause?**

A `BindingResult` parameter was added to the handler — plausibly to support form
repopulation elsewhere — and the new code never checks `hasErrors()`.
`ModelAttributeMethodProcessor` only throws `MethodArgumentNotValidException` when the
method has no immediately-following `BindingResult` or `Errors` parameter, so adding one
turns MVC's automatic 400 off. The row is written and the endpoint returns 201. The
prevention is an ArchUnit rule forbidding `BindingResult` on `@RestController` methods,
which is four lines and catches the whole class.

**T5. A controller method declares `@Valid CreateOrderRequest r, BindingResult errors` and
does not check `errors`. What happens with an invalid payload?**

`MethodArgumentNotValidException` is **not** thrown — the `BindingResult` parameter
suppresses it. The model attribute is built, the violations are collected into the
`BindingResult`, and the method body runs normally. Anything the method does next happens
with invalid input. This is the single most consequential thing to know about bean
validation in MVC, and it is exactly backwards from the intuition that adding an
error-collection parameter makes the framework stricter.

**S4. A PR adds `@NotNull` to a `String` field on a request DTO that currently accepts blank
values. Is the change correct?** `S`

No — it will not catch what the author intends. `@NotNull` rejects null only; `""` and
`"   "` pass. If the intent is "this must be provided and must have content", the
annotation is `@NotBlank`, and the review comment should say so explicitly, because the
diff looks equivalent and the change will pass review and fail in production. The companion
question to ask is whether the field can also arrive as an empty list, which needs
`@NotEmpty` rather than either of the string annotations.

**D7. Should validation live on the DTO, in the service, or in the domain?** `STAFF`

In the domain, with the DTO annotations as an ergonomic layer on top. The reason is about
entry points, not elegance: a rule expressed only on a request DTO protects exactly the
paths that go through MVC argument resolution, and a batch import, a message consumer, a
scheduled reconciliation job, a data migration and a test calling the service directly all
bypass it. Bean validation on the DTO still earns its place — it turns most malformed
traffic into a structured 400 with field-level messages, which nobody wants to hand-write —
but it is a filter over a rule that has to exist somewhere every caller obeys. The review
question is never "is the annotation right"; it is "how many entry points are there, and
which of them enforce this?"

**D8. Is failing validation at startup better than at the point of use, universally?**
`STAFF`

For configuration, unambiguously yes — a wrong config value is a deployment error and should
fail before any traffic rather than when the code path that reads it first runs.
`@Validated` on a `@ConfigurationProperties` class converts that into a
`BindValidationException` during refresh, which an operator sees immediately. For inbound
request data, the opposite is true: failing at the edge is the entire purpose. The genuine
tension is that the same annotation mechanism does both, and the failure mode differs — one
is a crash-loop you want, the other is a 400 you want. The process question underneath is
that startup failures are caught in CI and before traffic, which is a materially cheaper
place to discover a problem, and that is the argument to make when someone proposes moving
configuration validation later.

**D19. Is `reloadable` in `ReloadableResourceBundleMessageSource` a production feature?**
`STAFF`

It is a development feature that is risky in production, and the reason is easy to miss: the
implementation checks file timestamps, which on most container filesystems means a stat call
per bundle on every cache expiry, and the behaviour under an overlay filesystem or a layered
image is not something I would depend on. What it genuinely buys is fast iteration on
translations during development, where a restart is friction. The production configuration is
`ResourceBundleMessageSource`, or `ReloadableResourceBundleMessageSource` with a positive
`cacheSeconds` and the reload path unused. The review question is whether the cache is
disabled in a profile that also ships to production, because the symptom — bundles resolving
slowly under load — is easy to misattribute to the database.

**T10. A resource is injected as `InputStreamResource` and read in two places in the same
request. What happens on the second read?**

Nothing. `InputStreamResource` is the only `Resource` whose `getInputStream()` is documented
as callable at most once — it wraps a supplied stream without buffering it, so the second
call returns an empty or failing stream rather than a fresh one. The sharp edge is that every
other `Resource` is re-readable, so the behaviour is surprising precisely when you have been
working with the others. The fix is to inject a `ByteArrayResource` or a
`ClassPathResource`, and to treat `InputStreamResource` as a single-delivery carrier.

**P9. After a Boot 2.3 upgrade, an application that worked fails at runtime with a
Hibernate Validator "unable to create a configuration, no provider found" error. What
changed and what is the fix?**

Hibernate Validator stopped being a transitive dependency of `spring-boot-starter-web` in
Boot 2.3, so the validation provider is no longer on the classpath. The failure is at
runtime rather than compile time because the provider is looked up lazily, the first time
something actually validates — which is why it can pass every test that never exercises a
validated endpoint. The fix is an explicit `spring-boot-starter-validation` dependency. The
process note is the more interesting half: the dependency being implicit was itself the
risk, because nothing in the build file recorded that the application depended on
validation, and no code change was needed to break it.

**D18. Should a validation error response be a stable error code or a human-readable
message?** `STAFF`

Stable codes, and this is a versioning question more than a design one. Bean-validation
messages are part of your API contract whether you documented them or not: a frontend that
switches on `field + " " + message` breaks when someone rewords a constraint, and at scale
that becomes an API you cannot change without a coordinated release. A
`@RestControllerAdvice` that maps each violation to a stable code — `CUSTOMER_ID_REQUIRED`,
`QUANTITY_OUT_OF_RANGE` — with the message as display metadata makes the codes your
contract and the messages free to improve. The counter-argument, which is real, is that a
code per violation is significant ongoing work and most teams will not maintain it — so the
pragmatic middle is a small set of codes for the constraints that clients must branch on and
free-form messages for the rest, with the branch-on set documented as the contract. The
staff-level point is that someone needs to decide which, because "we will keep messages
stable" is not a decision anyone makes on purpose and everyone discovers later.

**S10. A PR adds a custom `ConstraintValidator` that calls a repository to check whether a
SKU exists. What is the review comment?**

That a constraint must be pure, synchronous and fast, and this one is none of those. It
turns every validation of that object into a database call, which means a validation path
becomes an amplification vector under load and a request's latency now depends on a
dependency the controller did not declare. The right home for an existence check is the
service layer, in the same transaction as the write, returning a domain exception — with
bean validation checking the *shape* and the domain checking the *reference*. The reviewer
should also check the other half of the contract: that `isValid` returns `true` for null so
nullability stays with `@NotNull`, and that `disableDefaultConstraintViolation()` is called
before adding a custom template, or every violation arrives with two messages.

### Dynamic Registration & Multi-Tenancy

**P5. Onboarding a new customer requires a full application restart, and the deploy queue is
now the product's bottleneck. What architecture is this almost certainly using?**

Per-tenant bean registration — an `ImportBeanDefinitionRegistrar` or a
`BeanDefinitionRegistryPostProcessor` that registers a definition per tenant at startup. It
works, and it buys real things: per-tenant configuration bound at startup, and startup-time
validation that the tenant's graph resolves. But it makes context size O(tenants) — 1,500
tenants is thousands of beans and minutes of refresh — and a new tenant is a deploy by
construction, because the registrar runs before the context exists. The fix for a
self-serve product is a `Map<TenantId, Impl>` where the map is keyed by a typed key and
values come from factories: bean count becomes O(implementations), and a new tenant is one
`computeIfAbsent` call.

**T6. A `FactoryBean`'s `getObjectType()` returns the factory class instead of the product
class. What breaks?**

Type-based injection. The container resolves the type of the `sqlClient` bean by calling
`getObjectType()`, so injecting `SqlClient` finds no candidate and fails with
`NoSuchBeanDefinitionException` — for a bean that is plainly registered, and visibly so in
`getBeanDefinitionNames()`. This is why the javadoc on `getObjectType()` is emphatic that it
must return the *product* type, and why the `&beanName` dereference convention exists for
the cases where you need the factory rather than its product.

**S5. A PR uses `beanFactory.registerSingleton("clock", Clock.systemUTC())` for a class that
carries Spring annotations. What is the review comment?**

That the object bypasses the entire `BeanPostProcessor` chain, because it is already
constructed when handed over. It gets no `@Autowired` processing, no `@PostConstruct`, no
`afterPropertiesSet`, no init method, no AOP proxy and no exception translation — and it
never appears as a `BeanDefinition`, so it is invisible to tooling that inspects
definitions. For a plain `Clock` that is correct and desirable. For anything carrying Spring
annotations it is a silent trap, and `registerBean(Class, Consumer<BeanDefinition>)` is the
correct call.

**D9. When is per-tenant bean registration the right architecture, and how would you decide?**
`STAFF`

When the tenant's *object graph* genuinely differs — different beans, different qualifiers,
a different `@Primary` — rather than only the implementation of one interface. And when the
tenant count is known, small, and mostly static, because it imposes an O(tenants) startup
cost and a deploy per new tenant. The decision hinges on two questions: does a new customer
need to onboard without a deploy (which rules it out for self-serve), and does one tenant's
broken configuration block everyone else's (which it does — the failure is global). The
underlying question is who owns the tenant's configuration lifecycle: per-tenant beans answer
"the deploy", which suits regulated tenants with review-based change control; the map
answers "the database", which suits self-serve. The failure mode I'd raise unprompted is the
third option teams drift into — per-tenant beans *and* a runtime override — which gives
startup validation for some tenants and none for others with no way for a reader to tell
which is which.

**D10. Is writing a `FactoryBean` class ever better than a `@Bean` method in application
code?** `STAFF`

No, and the reason is genuinely instructive: they are the same mechanism. A `@Bean` method
is implemented as a `FactoryBean` internally — the container wraps the method in one — and
it produces the same bean with the same indirection. The class form earns its place only
when the indirection has to be a *type*: library configuration described by name in XML or
in a third-party configuration file, or a proxying strategy that needs to be swappable at
the type level. In application code, a `FactoryBean` class is a `@Bean` method written the
long way, with the added cost of a `getObjectType()` contract that must be right or the
bean becomes invisible, and an `isSingleton()` flag that is easy to get wrong in a way that
reintroduces every prototype problem from Chapter 3.

**P10. A third-party library's beans are simply absent from the application, and nothing in
the team's code imports anything. What mechanism put them there, and what is the
diagnostic?**

Boot's `AutoConfigurationImportSelector` — an `ImportSelector` — reads
`META-INF/spring/org.springframework.boot.autoconfigure.AutoConfiguration.imports` from every
jar on the classpath and returns the class names, which `ConfigurationClassPostProcessor`
then processes as configuration; each candidate's `@Conditional` annotations decide whether
it applies. So the beans arrive without any import on your side, and their absence is a
condition mismatch rather than a missing import. The diagnostic is the
`ConditionEvaluationReport`, from `--debug` at startup or `/actuator/conditions` at
runtime, which records every condition evaluated, whether it matched, and the reason — the
difference between debugging this in a minute and debugging it by bisecting the classpath.

**S9. A PR introduces a registrar that registers one bean per region, following an existing
per-tenant pattern. What should the reviewer ask?**

Three things in order. Does the *graph* differ per region, or only the implementation of one
interface — because only the latter warrants registration and the former is almost always a
`Map<key, Impl>` wearing a costume. What is the current count and its growth, since the
startup cost is linear in the key. And is there any way to add a region without a deploy,
because if not, the change is a product decision being made inside a pull request. The
reviewer should also check that the registrar runs before the context exists — meaning it
cannot consult a bean, and that whatever data it needs at startup is available then.

### Resources & the Environment

**P6. Startup regressed from 8s to 55s after a dependency upgrade, with no application code
change. What is the investigation?**

`--debug` startup timing first, to separate bean creation from classpath scanning — the
expensive work almost always lands in `ConfigurationClassPostProcessor` and classpath
resolution rather than in the beans themselves. Then: did the new dependency add a broad
`@ComponentScan`? Does it contribute a `classpath*:` resolution over a large pattern? Does it
register a `BeanFactoryPostProcessor` that uses `ClassPathScanningCandidateComponentProvider`?
The realistic answer is that the scan is in the library, not in the team's code, and the fix
is to exclude that auto-configuration or narrow the scan. The prevention is a startup-time
baseline in CI that alerts on regression rather than on an absolute number.

**T7. `Properties.load(inputStream)` is used on a UTF-8 properties file containing a `€`
sign. What is in the resulting string?**

Mojibake. `Properties.load(InputStream)` decodes as ISO-8859-1, and that has been the
specified behaviour since Java 1.0. The UTF-8 bytes are read as eight-bit characters. The
fix is `PropertiesLoaderUtils.loadProperties(resource, "UTF-8")` or loading through an
`InputStreamReader` with an explicit charset. The related fact worth knowing: a
`\uXXXX` escape works regardless of encoding, which is why some properties files are fine and
others are not — a file that was saved with escapes is immune to this entirely.

**S6. A PR replaces a hand-written `@ConfigurationProperties` class with 40 `@Value` fields
across the codebase. What is the review comment?**

That configuration becomes unauditable. You cannot enumerate what is configurable without a
`grep`, so "what can the SRE change at runtime, and what happens if they do?" has no reliable
answer. You cannot validate related values together, so nothing stops `retries >
poolSize` at startup. And a typo in a key becomes a runtime failure in a possibly-lazy bean
rather than a startup failure. The replacement is one typed properties class with JSR-380
constraints and explicit defaults, which gives an IDE-generated list and moves every
misconfiguration to startup.

**D11. Is `classpath*:` a reasonable thing to reach for by default?** `STAFF`

No, and the default should be `classpath:`. `classpath*:` is a `ClassLoader.getResources()`
call plus a walk of every match across every jar, which makes it O(resources) and re-runs on
every resolution unless you cache it. It is the right tool for a genuinely multi-jar concern —
migrations, locale bundles, auto-configuration metadata — and the wrong tool everywhere else,
where a single well-known resource exists. The failure mode when you get it wrong in the other
direction is worse than a performance issue: `classpath:` resolves the *first* match, so if a
dependency ships a copy of the resource, your application's copy is silently ignored with no
warning, and the template that renders in production is not the one in your repository. The
rule that holds: use `classpath*:` when several artifacts may legitimately contribute, and
make the winner explicit by code rather than by classpath order.

**D12. Internationalisation works locally and returns base-bundle text for a subset of
production users. Three candidate causes?**

`setFallbackToSystemLocale` left at its default `true`, so resolution falls back to
`Locale.getDefault()` — and in a container with no `LANG` set, that is `en_US` for every
request, so a missing key resolves to English rather than failing. Encoding: properties files
loaded through the ISO-8859-1 path, which corrupts any key or value containing non-ASCII
characters, and those keys then match nothing. And `classpath:` resolving a different jar's
copy of the bundle, which is common when a dependency ships the same base name and is silent.
All three produce the same symptom and all three are invisible without reproducing the
container's locale and classpath.

### Circular Dependencies

**P12. After a Boot 2.6 upgrade, one service fails to start with
`BeanCurrentlyInCreationException` naming two beans that have not changed in two years. What
actually happened?**

A cycle that was previously resolvable became unresolvable. The most common causes are a
refactor that converted field injection to constructor injection on one side — which removes
the early-reference path entirely — or a change to `proxyBeanMethods = false`, which has the
same effect on cycles between `@Bean` methods. The exception names where the loop *closes*,
not where it *started*, so the investigation is a search for recent injection-style changes
rather than a reading of the two classes the trace mentions. The right fix is an ArchUnit
rule forbidding constructor cycles in CI, because the cycle had been invisible for two years
precisely because field injection made it work.

**T8. Two beans have a field-injection cycle. Bean A is `@Transactional`. Does a call from B
to A get a transaction?** `ADVANCED`

Not reliably, and this is the sharp edge of the whole mechanism. When B resolves A, the
container hands over A's *early reference* — the raw, partially-constructed object, before
`postProcessAfterInitialization` has run and therefore before AOP has decided whether to wrap
it. `getEarlyBeanReference` does give every
`SmartInstantiationAwareBeanPostProcessor` a chance to wrap, so the outcome depends on
whether A's proxy is created that way; but the point stands that the bean B holds may not be
the same object another caller holds, and the cycle is exactly where you would not think to
write a test. Boot 2.6's default exists because this class of silent failure was widespread
enough to be worth a breaking default change.

**S7. A PR resolves a circular dependency by adding `@Lazy` to one injection point. What
should the review check?**

Whether the cycle is real or accidental, because `@Lazy` handles both identically and only
one of them deserves the fix. Then: that the deferred resolution means a
`BeanCurrentlyInCreationException` now surfaces on first use rather than at startup, which
is a real trade; that a proxy is allocated at that injection point and every call through it
is a virtual dispatch; and that there is a test which actually exercises the deferred path,
because by construction the startup-time test does not. If the cycle is a modelling error —
which is the overwhelming majority — the review should ask for the third object instead, and
that is a better outcome for the codebase than a working proxy.

**D13. Is a circular dependency always a design error?** `STAFF`

Almost always, with a small and identifiable set of exceptions. The framing that makes this
arguable: a cycle is a statement that two objects cannot be constructed in any order, which
means neither is independently meaningful, which means the thing they are jointly modelling
has not been given a name — and the refactor is almost always to extract it. The genuine
exceptions are bidirectional JPA associations, where the cycle lives in the persistence model
rather than in the bean graph and is resolved by the persistence context rather than the
container, and genuinely mutual runtime relationships where the second object is created after
the first rather than being a dependency of it. The staff-level point is that the container's
willingness to resolve cycles with a half-built object is a *compatibility* feature, and
treating it as a design tool means shipping a modelling error that happens to run.

**D14. Would you rather Spring had never had the three-level cache?** `STAFF`

The cache is correct as a compatibility decision and wrong as a design affordance, and
holding both of those is the honest answer. It cannot be removed without breaking every
application that has a working setter-injected cycle, so its removal is off the table; but
what the framework can do — and did in 2.6 — is make the default reject cycles so the error
is loud. The residual question is migration posture: fix the cycles, or turn
`allow-circular-references=true` back on and schedule the work. Turning it on silently is the
answer that ages badly, because it is invisible in the configuration, it re-enables
unproxied early references application-wide, and the next engineer to hit a mysterious
`@Transactional` failure has no way to know it is there. My recommendation is to never
re-enable it globally and to use `@Lazy` or an extracted object for the handful of cycles
that survive.

**P11. After re-enabling `allow-circular-references=true`, a `@Transactional` method
occasionally commits nothing. The team suspects the connection pool. What is the real
mechanism?**

The early-reference path. A bean obtained from inside a cycle is handed over as a raw
instance via `getEarlyBeanReference`, and whether that raw instance gets wrapped depends on
every `SmartInstantiationAwareBeanPostProcessor` having a chance to wrap it at that moment.
Where it does not — or wraps differently from the normal path — the caller invokes the
target directly, the `TransactionInterceptor` is never entered, and there is no transaction.
The tells are that it is intermittent, correlated with call paths that go through the cycle
rather than with load, and that the pool is entirely healthy. The real fix is to remove the
cycle; the flag is what let it survive long enough to produce this.

**T11. Bean A and Bean B have a constructor cycle. The team adds `@Lazy` to B's parameter
in A. Does the application start, and what happens the first time A uses B?**

It starts, because the `@Lazy` injection point receives a proxy rather than an instance, so A
constructs without resolving B. The first time A calls a method on that proxy, the container
resolves B for real — and if B's construction is genuinely still in progress on that thread,
you get a `BeanCurrentlyInCreationException` at that point rather than at startup. So
`@Lazy` converts a startup failure into a first-use failure, which in a controller is a 500
in production. It only fully works if the cycle is never actually exercised at runtime, which
is a fragile property to depend on.

**D20. What would you actually do about a codebase with 40 cycles and a two-year-old test
suite that still passes?** `STAFF`

Not a bulk flag flip and not a rewrite — the sequencing is the whole answer. First, make the
cycles *visible* before changing anything: an ArchUnit rule in report mode, so we know which
forty and whether any are load-bearing. Then triage into three buckets, because they have
different answers. The accidental ones — two services split for no reason, sharing a
repository — get the third-object extraction, and that is probably thirty of the forty. The
genuine bidirectionals, mostly JPA entities, get moved out of the bean graph entirely. And
the handful that are real runtime relationships get `@Lazy` with an explicit comment saying
why, so the next reader knows it is a decision rather than an accident. What I would
explicitly not do is re-enable `allow-circular-references` as a migration strategy: it
reinstates the unproxied-early-reference hazard application-wide precisely while the work is
in progress, which is the one period where a silent `@Transactional` failure is least
acceptable. The organisational framing is that this is a bounded refactor — forty extractions
is several weeks — and the sequencing that makes it survivable is landing the visibility rule
first, so the count only ever goes down and CI keeps it there.

> **CHAPTER 8 SUMMARY**
>
> The scenario bank for this volume has one theme running through it: **almost every failure
> here is a phase error or a provenance error.** Code ran at the wrong point in the
> lifecycle; a bean was Spring's when you thought it was yours, or the reverse; a value was
> captured at construction when you assumed it was resolved at use; a proxy was assumed to be
> in the path when it was not. The candidates who stand out in a real interview are the ones
> who ask "which phase is this in?" before answering, and the ones who can say *why* the
> container behaves as it does rather than only that it does — `@PostConstruct` before
> `afterPropertiesSet` because of a `BeanPostProcessor` dispatch, `preDestroy` before
> `destroy` because of a destruction-aware pre-pass, no prototype destruction because the
> container holds no reference, no constructor cycles because there is no instance to hand
> out. The design questions — whether to standardise on scoped proxies, whether per-tenant
> beans are the right architecture, whether validation belongs at the edge or in the domain —
> have no universally correct answer, and the strong candidates are the ones who can state the
> condition that flips it and the number at which it stops working.




