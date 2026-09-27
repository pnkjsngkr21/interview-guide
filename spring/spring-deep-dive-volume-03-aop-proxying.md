---
title: "The Spring Complete Deep-Dive"
volume: 3
series: "AOP & PROXYING"
subtitle: "Study & Interview Mastery Guide"
---

# The Spring Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is the volume that explains why `@Transactional` and `@PreAuthorize` fail silently.

Not "can fail" — **do**, routinely, in a way that produces no error, no log line, and no
failing test. A team can ship six months of `@Transactional` methods where three of them
never open a transaction, because they are called from another method of the same class. The
data still writes. The tests pass. The rollback that was supposed to happen on a failed
payment provider call does not happen, and the discovery is a reconciliation report weeks
later rather than a stack trace. Everything in this volume exists to make that class of bug
*legible before it reaches production*.

The mechanism behind it is the proxy, and the proxy is not an implementation detail you can
skip until something breaks. Spring AOP is **proxy-based, not bytecode-weaving** — which
means it can only intercept calls that arrive through a Spring-managed proxy, on a
Spring-managed bean, through a non-private, non-static, non-final method. Every one of those
qualifiers is a constraint you will violate at some point, usually by accident, usually in a
method that looks like the obvious place to put the annotation.

So the volume is built bottom-up: the vocabulary, then the proxy mechanism in detail, then
the three ways to declare an aspect, then the pointcut language, then the `@Around` contract
that most advice gets subtly wrong, then ordering — the `@Order` inversion that is a genuine
interview trap — and finally a dedicated chapter on the pitfalls, because that is the
chapter the volume exists for.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot. The template is a completeness checklist, not a form to
fill in.

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
callout, and `Further Reading`.

Volumes end with an `Interview Scenario Bank` — production situations, code-behaviour
predictions, code-review questions, and design trade-off challenges.

| Volume | Coverage |
| --- | --- |
| Volume 1 | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 (this book) | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 3

- Chapter 1 — AOP Concepts & the Vocabulary
- Chapter 2 — Spring AOP Under the Hood
- Chapter 3 — Declaring Aspects
- Chapter 4 — Pointcut Expression Language
- Chapter 5 — `@Around` & the `proceed()` Contract
- Chapter 6 — Aspect Ordering
- Chapter 7 — AOP Pitfalls & Why They Exist
- Chapter 8 — Interview Scenario Bank

---

# Part 1 — AOP & Proxying

## Chapter 1 — AOP Concepts & the Vocabulary

### 1.1 The Vocabulary

Seven terms, and the interview asks for all of them. The trap is that most candidates can
define them and almost none can say which of them Spring AOP actually supports.

| Term | Definition | Does Spring AOP support it? |
| --- | --- | --- |
| **Join point** | A point in the execution of a program where advice *could* be applied | **Partially** — method executions on Spring beans, only. Not field access, not constructor execution, not the execution of code in a `new`-ed object |
| **Pointcut** | A *selection* of join points — the filter that says which calls get advised | Yes — as a string expression (Chapter 4) |
| **Advice** | The action taken *at* a join point | Yes — five types (Chapter 3) |
| **Aspect** | The module that pairs a pointcut with advice: "when X, do Y" | Yes — `@Aspect` (Chapter 3) |
| **Weaving** | The mechanism that links aspects with the target — how the advice actually gets into the call path | Yes, but **only at runtime via a proxy** |
| **Target** | The object being advised | Yes — the object behind the proxy |
| **Introduction** | Adding new interfaces (and therefore new methods) to a proxied class | Yes, in the API; rarely used in practice |

The single most important row is **weaving**, and the most commonly wrong claim in Spring
interviews is that Spring weaves. It does not weave in the AspectJ sense. It **substitutes
a proxy for the bean** and puts the advice in the proxy's method.

```text
AspectJ (load-time / compile-time weaving)
─────────────────────────────────────────
    Aspect bytecode is woven INTO the target class.
    new OrderService(...)          →  an OrderService, with advice compiled in.
    Any caller, any call site, is intercepted — including self-invocation.

Spring AOP (runtime proxying)
─────────────────────────────
    The container returns a PROXY, not the target.
    new OrderService(...)          →  an OrderService, no advice at all.
    new OrderServiceProxy(target)   →  a proxy; only calls THROUGH the proxy are advised.
```

That difference is the entire subject of Chapter 7. Everything that frustrates people about
Spring AOP — self-invocation, `new`-ed objects not being advised, `private` methods being
unadvised — is the same fact viewed from a different angle: **the proxy has to be in the call
path, and it only is if the caller holds the proxy rather than the target.**

### 1.2 The Three Implementation Approaches, and Why Spring Chose One

AOP has three historical mechanisms. Understanding why Spring picked the least powerful one
explains almost every Spring AOP limitation you will be asked about.

| | Proxy-based (Spring AOP) | Load-time weaving (AspectJ LTW) | Compile-time weaving (AspectJ CTW) |
| --- | --- | --- | --- |
| When advice is applied | At runtime, when the proxy is created | At class-load time, by a Java agent | At compile time, by a compiler plugin |
| Build step required | **No** | No (but a JVM agent flag or `-javaagent`) | **Yes** — a modified `javac` / AspectJ compiler |
| Intercepts self-invocation | **No** | Yes | Yes |
| Intercepts `new`-ed objects | **No** | Yes | Yes |
| Intercepts `private`/`static` methods | **No** | Yes (with limitations) | Yes (with limitations) |
| Sees Spring DI / transactions | **Yes** — it *is* Spring | Partially | Partially |
| Cost per call | A chain walk + reflective dispatch | Near zero after weaving | Near zero after weaving |
| Change a pointcut | Recompile nothing; restart | Restart / re-define | **Full recompile** |
| Debuggability | **Worse** — stack trace goes through `MethodInterceptor.invoke` | Good | Good |
| Applicable outside a Spring context | No | Yes | Yes |

Why Spring chose proxies:

1. **No build-time coupling.** The target class is an ordinary class. You do not need a
   special compiler, an agent, or a `ajc` invocation, which is why Spring AOP works in every
   environment where Spring works — including a plain `main()`, a JUnit test, and a
   GraalVM native-image build where an agent is a serious problem.
2. **Opt-in and reversible.** A pointcut change is a config change and a restart. Not a
   recompile of every module that transitively depends on the target.
3. **Seamlessness with the container.** The proxy is created by a `BeanPostProcessor` during
   context refresh, at exactly the moment the container already has the fully-wired target.
   AOP is implemented *as* a container extension, which is why an advised bean and a
   transactional bean and a `new`-ed object behave differently with no extra configuration.
4. **Interfaces-first semantics.** A JDK dynamic proxy is generated from the interface, so
   the proxy is guaranteed to be type-safe against the contract the rest of the code already
   depends on.

The costs follow directly, and they are not incidental — they are the price:

| Cost | Consequence |
| --- | --- |
| The proxy must be *in* the path | Self-invocation is not advised (Chapter 7) |
| Only proxyable members | `private`, `static`, `final` methods are not advised |
| JDK proxy exposes only interfaces | `(OrderServiceImpl) bean` throws `ClassCastException` |
| Runtime dispatch | Every advised call pays a chain walk plus reflection |
| The proxy is a different object | Identity, serialization, `equals`, stack traces all change |
| Pointcuts are strings | A rename is a silent behaviour change, not a compile error (Chapter 4) |

> **INTERVIEW TRAP**
>
> "Spring AOP uses AspectJ" is the answer that loses points, and it is wrong in the
> direction that matters. Spring AOP uses **AspectJ's pointcut expression language and its
> `@Aspect` annotation model** on top of a **Spring-implemented proxying mechanism**. The
> `@Aspect`, `@Before` and `execution(...)` syntax is AspectJ; the interception is Spring's
> `AopProxyFactory`. The precise version, and the one to give: *Spring borrows AspectJ's
> language, not its mechanism — which means it inherits AspectJ's expressiveness at the
> pointcut level and none of its power at the interception level.*
>
> The follow-up, which is the real question: "when would you use AspectJ over Spring AOP?"
> The answer is when you need to advise something Spring AOP cannot reach — a `new`-ed
> object, a self-invocation, a `private` or `static` method, field access, or a
> third-party jar you do not control — and you can accept the load-time agent and the loss
> of Spring DI semantics inside the woven code. That is a real answer in a legacy codebase
> full of un-adviseable static utility methods. It is rarely the right answer in a greenfield
> Spring application, where the design fix — extract an interface, inject a collaborator — is
> usually cheaper than an agent.

> **MUST REMEMBER**
>
> Spring AOP can only intercept **method calls on a Spring-managed bean, arriving through a
> proxy, on a method that is not `private`, `static` or `final`**. If any one of those four
> conditions fails, the advice does not run — and nothing tells you.

### 1.3 When AOP Is the Wrong Tool

The honest list, because a chapter that only argues *for* AOP is a chapter that gets you
hired and then blamed.

**AOP is wrong when you need to intercept:**

| Target | Why Spring AOP cannot | What to do instead |
| --- | --- | --- |
| An object you `new` yourself | Nothing creates a proxy for it | Make it a bean; inject it |
| A `static` method | Instance proxies cannot intercept statics | Make it an instance method on a bean |
| A `private` method | The proxy is a different class; it cannot see private members | Change visibility to package-private or public, or restructure so the caller is external |
| A `final` method | CGLIB cannot override it | Remove `final`, or move the call |
| A `final` class | CGLIB cannot subclass it | Remove `final`; `record` and Kotlin `data class` are the traps |
| A method called from inside itself | The call never leaves the object, so it never reaches the proxy | Extract to another bean, or inject self via `@Lazy` (Chapter 7) |
| A `ThreadLocal`-scoped or plain `new`-ed helper | Same as above | Restructure |
| Code in a library you do not own | You cannot add a bean definition to it easily | AspectJ LTW, or a decorator at your own boundary |

**AOP is also the wrong tool when the concern is not cross-cutting.** The test is honest and
simple: *would you want this applied identically to forty unrelated classes, and would you be
surprised if any of them opted out?* If the answer to the second half is no, the concern
belongs in the call site, as an explicit collaborator, because a decorator is visible at the
call site and an aspect is not.

> **TRADE-OFF**
>
> The alternative to an aspect is a decorator — a class with the same interface, injected
> explicitly, that wraps the real implementation. The decorator costs you a constructor
> parameter, a class, and a line at every call site. The aspect costs you zero call-site
> changes and gives you a behaviour that no reader of the target class can see. The flip
> condition: **use the decorator when there are few call sites and the wrapping is part of
> that call's semantics; use the aspect when the concern is genuinely uniform across dozens
> of call sites and nobody could reasonably want it applied differently to one of them.** A
> team that reaches for `@Aspect` to avoid writing a constructor is trading a compile-time
> cost for a runtime one — the behaviour is now only discoverable by reading the pointcut.

> **PRODUCTION RELEVANCE**
>
> The failure mode of over-using AOP is a *silent behaviour change* in a class whose author
> never read the aspect. A team adds a timing aspect on `execution(* ..service..*(..))`, and
> suddenly three services are 40% slower because the aspect opens a `Timer` and appends to a
> shared `StringBuilder` that is not thread-safe. The classes did not change, no PR touched
> them, no test failed — the aspect did. This is why the next chapter is about the
> mechanism, and why Chapter 3 spends real time on aspect *ownership*.

#### Common Mistakes

- Saying Spring AOP "weaves" advice into the class. It does not; it substitutes a proxy. This
  is the root of every other mistake in the list.
- Believing AOP can advise `private` or `static` methods in Spring. It cannot, and this is
  not a configuration problem — there is no flag.
- Treating an aspect as free. Every advised call pays a chain walk and a reflective dispatch.
- Reaching for `@Aspect` to avoid a constructor parameter, converting a visible design
  decision into an invisible one.
- Assuming an aspect applies to "the whole application." It applies to beans the auto-proxy
  creator chose to proxy, matched by a pointcut that is a string you probably wrote six
  months ago.
- Confusing "Spring AOP" with "AspectJ" when the question is whether advice runs on a
  self-invocation. In Spring AOP it does not. In AspectJ it does.

#### Interview Questions — AOP Concepts

**Q1. Explain AOP's core vocabulary: join point, pointcut, advice, aspect, weaving.**
`TRICKY`

A join point is a point in program execution where advice could apply. A pointcut is the
*selection* of join points. Advice is the action taken. An aspect is the pairing of a
pointcut with advice. Weaving is the mechanism that links aspects to the target. The senior
part is the last column: in Spring AOP the only supported join points are method executions
on Spring beans, and the only supported weaving is runtime proxying — so three of AspectJ's
capabilities (field access, constructor execution, static-method interception) are
unavailable.

**Q2. Why does Spring use proxy-based AOP rather than AspectJ's weaving?** `TRICKY`

Because proxying needs no build step, no compiler plugin and no load-time agent, which makes
AOP work in any environment Spring works in — including tests and native images. It is
opt-in and reversible at a pointcut change. And it slots into the container naturally,
because the proxy is created by a `BeanPostProcessor` once the target is fully wired. The
cost is that the proxy must be in the call path, which is why self-invocation, `new`-ed
objects, `private` and `static` methods are all un-adviseable.

**Q3. A team asks you to advise every call to a static helper class in a third-party jar.
What do you tell them?** `STAFF`

Spring AOP cannot do it — instance proxies do not intercept statics, and the jar is not
Spring-managed. The options, in order: wrap it in your own Spring bean whose method delegates
to the static, and advise the wrapper — cheapest, and correct if the surface is small; use
AspectJ load-time weaving if the calls are genuinely unavoidable and you can accept the
agent; or, best, argue for removing the static so it can be injected. The staff part is that
the third option is usually right and takes one refactor, and that "we need load-time
weaving" is almost always a statement that the design is fighting the tool.

**Q4. Is a decorator ever better than an aspect? When?** `TRICKY`

Yes — when the call sites are few and the wrapping is part of that call's own semantics. A
decorator costs a constructor parameter and a line at each call site, and buys complete
visibility and easy unit testing. An aspect costs nothing at the call site and buys
invisibility. The rule of thumb: an aspect should apply something every reader of the target
class would *expect* to apply; a decorator should apply something the specific caller
decided. If only some callers want the behaviour, it is a decorator.

**Q5. What is an "introduction" in AOP, and does Spring AOP support it?** `TRICKY`

An introduction lets an aspect add new interfaces — and therefore new method contracts — to
the proxied type. Spring AOP supports it through `IntroductionAdvisor` and
`IntroductionInterceptor`, adding a marker interface to the proxy. It is genuinely supported
and almost never used, because the JDK proxy mechanism already makes the interface list
flexible while CGLIB subclasses cannot truly add new state. The honest framing: a feature
you can name, that you should not reach for, because annotating the class with the interface
is clearer.

**Q6. A codebase has forty `@Aspect` classes. Is that a smell, and what would you do?**
`STAFF`

It depends entirely on whether they are uniform cross-cutting concerns or scattered
workarounds. The test: can you name every pointcut in the codebase and the set of methods
each one affects? If yes, forty is a lot of infrastructure but a coherent one. If no — and
in a typical codebase the answer is no, because the pointcuts are strings — then the
aspects have accreted as local solutions to local problems, and each one is a hidden
behaviour change in a class nobody reviewed. The remediation is an inventory: for each
aspect, list the affected method signatures, and delete or convert to an explicit decorator
anything a reader would not predict. Expect roughly a third to survive.

> **CHAPTER 1 SUMMARY**
>
> Spring AOP is proxy-based, not bytecode-weaving. It can only intercept method calls on
> Spring-managed beans that arrive through a proxy on a method that is not `private`,
> `static` or `final`. That is why it was chosen — no build step, no agent, opt-in, and it
> slots into the container — and it is the direct cause of every limitation people
> rediscover in production. The vocabulary is worth learning precisely so you can say which
> part of it Spring actually implements. And the honest framing is that AOP is the wrong
> tool whenever the concern is not genuinely uniform: a decorator is visible at the call
> site, an aspect is not, and that difference is a design decision rather than a style
> preference.

#### Further Reading

- [Spring Framework Reference — AOP Concepts](https://docs.spring.io/spring-framework/reference/core/aop/introduction-defn.html) — the official definitions of join point, pointcut, advice, aspect and weaving, with the diagram that separates them.
- [Spring Framework Reference — AOP Proxies](https://docs.spring.io/spring-framework/reference/core/aop/introduction-proxies.html) — the one page that states plainly which join points Spring AOP supports and why the others are excluded.
- [Spring Framework Reference — Using AspectJ with Spring Applications](https://docs.spring.io/spring-framework/reference/core/aop/using-aspectj.html) — what you gain and lose by mixing real AspectJ weaving into a Spring application.
- [Spring in Action, 6th edition](https://www.manning.com/books/spring-in-action-sixth-edition) — book-length treatment with the clearest prose on proxy-vs-weaving trade-offs I have found.

## Chapter 2 — Spring AOP Under the Hood

### 2.1 The Proxy Selection Rule

One rule, stated precisely, and most of the surprises in this chapter follow from it:

> **JDK dynamic proxy if the target implements at least one interface. CGLIB subclass proxy
> otherwise. `proxyTargetClass = true` forces CGLIB regardless.**

The decision is made by `DefaultAopProxyFactory`, not by your configuration directly:

```java
// DefaultAopProxyFactory.createAopProxy() — the whole decision
@Override
public AopProxy createAopProxy(AdvisedSupport config) throws BeansException {
    if (config.isOptimize() || config.isProxyTargetClass() || hasNoUserSuppliedProxyInterfaces(config)) {
        Class<?> targetClass = config.getTargetClass();
        if (targetClass.isInterface() || Proxy.isProxyClass(targetClass)) {
            return new JdkDynamicAopProxy(config);     // must fall back — can't subclass an interface
        }
        return new ObjenesisCglibAopProxy(config);
    }
    return new JdkDynamicAopProxy(config);
}
```

| | JDK dynamic proxy | CGLIB subclass proxy |
| --- | --- | --- |
| Mechanism | `java.lang.reflect.Proxy` at runtime | Generates a subclass at runtime, overrides methods |
| Requires | Target implements ≥1 interface | Target is a non-final class with a visible constructor |
| Proxy is castable to | The interfaces **only** | The target class **and** its supertypes |
| Handles generics | Poorly — type args are erased | As well as the class allows |
| Final methods | Cannot be advised | **Cannot be advised** — they are not overridden |
| Final class | N/A | **Cannot be proxied at all** |
| Private methods | Cannot be advised | Cannot be advised |
| Overhead per call | Reflection through the `InvocationHandler` | Generated fast classes, `MethodProxy` dispatch |
| Weakness | `ClassCastException` on concrete cast | Constructor must be reachable |

**The `ClassCastException` that starts an outage.** This is the single most common
AOP-attributed production bug, and it is a direct consequence of the rule above:

```java
@Service
public class OrderServiceImpl implements OrderService {
    // ...
}

// Somewhere, a service that injects the CONCRETE type:
@Service
public class OrderFacade {
    private final OrderServiceImpl orders;   // ← works without AOP
    public OrderFacade(OrderServiceImpl orders) { this.orders = orders; }
}
```

The moment an aspect, `@Transactional`, or `@PreAuthorize` is added to `OrderServiceImpl`,
the container wraps it in a `java.lang.reflect.$Proxy42` implementing only `OrderService`.
The injection point asks for `OrderServiceImpl`. The bean is not assignable to it. Startup
fails with:

```text
org.springframework.beans.factory.BeanCreationException:
  Error creating bean with name 'orderFacade':
  Factory method threw exception; nested exception is java.lang.ClassCastException:
  class com.sun.proxy.$Proxy42 cannot be cast to class com.acme.OrderServiceImpl
        ($Proxy42 and OrderServiceImpl are in unnamed module of loader 'app')
```

Note what makes this nasty: **the code that breaks did not change.** A teammate added
`@Transactional` to a different class, and a class in a different module stopped starting.
The stack trace points at the *consumer*, not the class that was annotated.

> **MUST REMEMBER**
>
> **Program to interfaces.** It is not a style preference here — it is the difference
> between a bean that can be proxied at all and a bean that cannot. An interface-first
> design is a precondition for the framework's cross-cutting features to be usable, which
> makes it a design constraint rather than a convention. The corollary that gets people:
> with a JDK proxy you *cannot* cast down to the implementation, and you cannot rely on
> implementation-specific methods being advised at all — if a method is not on the interface,
> a JDK proxy will not route it through the chain.

### 2.2 `Advised`, `AdvisedSupport`, and `TargetSource`

Three types that explain how the proxy is configured and what it is standing in for.

```text
AdvisedSupport                         Advised
  ├─ targetSource ─────────┐             (implemented by every Spring proxy)
  ├─ interceptorList (chain)│            getTargetSource()
  ├─ interfaces / proxyTargetClass       addAdvisor() / removeAdvisor()
  ├─ frozen flag                          setTargetSource()
  └─ aopProxyFactory                     getProxiedInterfaces()
                                        isFrozen() / setFrozen()
                                        toProxyConfig()
```

`Advised` is the interface every Spring AOP proxy implements, which gives you runtime access
to the proxy's *own* configuration. This is genuinely useful, and genuinely a trap, because
it means any code holding an advised bean can silently change how it is advised:

```java
// Inspect the proxy's configuration at runtime
OrderService proxy = (OrderService) ctx.getBean("orderService");

if (proxy instanceof Advised advised) {
    advised.getProxiedInterfaces();          // what CAN this proxy be called as?
    advised.getTargetSource().getTarget();    // unwrap to the raw target (handle TargetSource)
    advised.getAdvisors();                   // the advice chain
    System.out.println(proxy.getClass());    // com.sun.proxy.$Proxy42  vs  OrderServiceImpl$$SpringCGLIB$$0
}
```

```java
// The trap — runtime advice injection with no compile-time trace
if (proxy instanceof Advised advised) {
    advised.addAdvisor(new Advisor(
        new StaticMethodInterceptor(),                       // MethodInterceptor
        new NameMatchMethodPointcut("create", "cancel")));  // where it applies
}
// "create" and "cancel" are now advised. Nothing in the source changed.
```

> **INTERVIEW TRAP — "HOW DO I FIND OUT WHETHER A BEAN IS PROXIED?"**
>
> The reflexive answer is `AopUtils.isAopProxy(bean)`, which is right but incomplete —
> it only tells you a proxy exists, not what it is. The senior answer continues: also check
> `((Advised) bean).getProxiedInterfaces()` to see the *exposed* interface list (which is
> the class-versus-interface question in a runtime form), and
> `AopProxyUtils.ultimateTargetClass(bean)` to get past nested proxies to the real
> implementation. The genuinely useful form of the question is the operational one: in a
> stack trace, a frame reading `com.sun.proxy.$Proxy42.create(..)` means the advice
> *did* run; a frame reading `OrderServiceImpl.create(..)` with the proxy class above it
> means the advice did *not* run for that particular call — which is the self-invocation
> signature from Chapter 7.
>
> The follow-up that separates a senior from a staff candidate: "should production code ever
> cast to `Advised`?" The honest answer is that runtime inspection is a debugging tool and a
> test-harness tool, not application logic. Production code that mutates advisors through
> `Advised` has made behaviour depend on bean initialisation order, and it is unreviewable.

### 2.3 The Interceptor Chain

Every advised call walks the same path. This is the code that explains both the correctness
rules in Chapter 5 and the performance cost in 2.4.

```text
caller
  │
  ▼
PROXY.create(..)                     ← JDK: InvocationHandler.invoke()
  │                                    CGLIB: FastClass / MethodProxy.invoke()
  ▼
DynamicAdvisedInterceptor.intercept(invocation)
  │
  ▼
ReflectiveMethodInvocation  ── interceptorIndex = 0
  │  method: OrderService.create(..)
  │  target: OrderServiceImpl@1a2b3c
  │  arguments: [OrderRequest]
  │
  ├── proceed()
  │     │  currentInterceptorIndex++   →  1
  │     ▼
  │   interceptor[1]  ── @Before logging
  │     │
  │     ├── proceed()
  │     │     │  currentInterceptorIndex++  →  2
  │     │     ▼
  │     │   interceptor[2]  ── the TRANSACTION interceptor
  │     │     │
  │     │     ├── proceed()
  │     │     │     │  currentInterceptorIndex++  →  3
  │     │     │     ▼
  │     │     │   interceptor[3]  ── @Around metrics
  │     │     │     │
  │     │     │     ├── proceed()
  │     │     │     │     │  index++ → 3 == size-1  ⇒  THE TARGET
  │     │     │     │     ▼
  │     │     │     │   AopUtils.invokeJoinpointUsingReflection(target, method, args)
  │     │     │     │     │
  │     │     │     │     │  ══►  OrderServiceImpl.create(..)   ← real code runs HERE
  │     │     │     │     │          returns an Order
  │     │     │     │     │  ◄══  return value unwinds back up the chain
  │     │     │     │     ...
```

The unwinding is the other half of the picture, and it is where advice ordering becomes
visible: the return value travels back **up** the chain, so the *outermost* interceptor's
post-processing runs **last**.

The essential source, reduced:

```java
public class ReflectiveMethodInvocation implements InvocationTargetExceptionAware {

    private final Object target;                    // the RAW target, never the proxy
    private final Method method;
    private final Object[] arguments;
    private final Class<?> targetClass;

    @Nullable private final List<Object> interceptorsAndDynamicMethodMatchers;
    @Nullable private MethodInvocation currentInterceptorIndex = ...;   // starts at -1

    public Object proceed() throws Throwable {
        // Are we at the end of the chain? Then run the actual method on the target.
        if (this.currentInterceptorIndex == interceptors.size() - 1) {
            return invokeJoinpoint();
        }
        Object interceptor = interceptors.get(++this.currentInterceptorIndex);
        // If it's a MethodInterceptor:  interceptor.invoke(this)  →  it calls proceed() again
        // If it's a plain MethodInvocation: run the advice body, then proceed() automatically
        return ((MethodInterceptor) interceptor).invoke(this);
    }

    @Nullable
    protected Object invokeJoinpoint() throws Throwable {
        // ⚠ NOTE: this is REFLECTION on the target, for every advised call.
        return AopUtils.invokeJoinpointUsingReflection(target, method, arguments);
    }
}
```

Two things in that snippet are load-bearing for the rest of the volume:

1. **`target` is the raw object, not the proxy.** The chain deliberately holds the *target*,
   which is precisely why the chain must terminate — if it ever invoked the proxy instead of
   the target, every `proceed()` would re-enter the chain from the start and recurse
   infinitely. The chain only works because the last link reaches past the proxy to the real
   object.
2. **`invokeJoinpoint()` is reflective.** `Method.invoke` on every call, for every advised
   method. That is the performance floor discussed next, and it is why Spring ships
   `CglibAopProxy` with a `ClassLoader`-cached `FastClass` and why `@Transactional` on a
   method called in a tight loop shows up in a profile.

### 2.4 What an Advised Call Costs

Roughly, per advised method invocation:

| Component | Cost |
| --- | --- |
| Proxy dispatch (JDK) | `InvocationHandler.invoke` — reflective, no fast path |
| Proxy dispatch (CGLIB) | `FastClass` + `MethodProxy` — a generated switch, notably cheaper |
| Chain walk | One array index, one virtual call, **per interceptor** |
| Aspect bodies | Whatever *your* advice does — usually the dominant term |
| Terminal dispatch | `Method.invoke` on the target — reflective, boxes primitives |
| Allocation | A `ReflectiveMethodInvocation` per call, plus any `Object[]` for args |

So a method advised by three aspects is not "slightly slower" — it is roughly
**3–5× the dispatch cost of an unadvised call for work that takes tens of nanoseconds**, and
the crossover point where this matters is much lower than people assume.

> **SCALING REALITY CHECK**
>
> The cost is irrelevant for a method that touches a database (milliseconds) and decisive
> for one that does real work in memory. A hand-rolled in-memory permission check, a
> hot-path cache lookup, or a serializer running at 200,000 calls/second is exactly the case
> where a four-aspect chain doubles the cost. The practical threshold: if a method is called
> more than ~50,000 times/second **and** runs for under ~50 microseconds, the proxy overhead
> is measurable and you should move the hot path behind an explicitly-constructed
> collaborator rather than the container. The one number worth memorising is that reflective
> dispatch is roughly **20–50ns per hop** on a modern JVM with the JIT warm, against a
> direct call at ~1–2ns — so the *dispatch* is cheap, and what actually costs is the advice
> bodies and the allocation of the invocation object.

### 2.5 Boot 2.0 Changed the Default — Here Is What It Cost and Bought

Since **Spring Boot 2.0**, `spring.aop.proxy-target-class` defaults to `true`, which forces
CGLIB even when interfaces exist. This is not a small change and it is the reason a great
deal of Boot-era code injects concrete classes happily.

```yaml
# application.yml — the Boot 2.0+ default
spring:
  aop:
    proxy-target-class: true      # CGLIB unless the target IS an interface
```

```java
// Opt back into interface-only proxies, per bean:
@Service
@Scope(value = "prototype", proxyMode = ScopedProxyMode.TARGET_CLASS)   // CGLIB
public class TenantContext { }

@Service
@Scope(value = "prototype", proxyMode = ScopedProxyMode.INTERFACES)     // JDK
public class TenantResolver { }
```

**What it bought:**

- Concrete-type injection keeps working after AOP is added, so `@Service` classes with no
  interface — the majority of modern application code — are advised without anyone having to
  restructure them.
- The `ClassCastException` class of failure essentially disappears for ordinary beans.
- Generic resolution survives, which matters for `List<Foo>` injection points against
  proxied types (Volume 2, Chapter 2).
- One mechanism everywhere, so there is no "why is this bean a JDK proxy and that one
  CGLIB" conversation.

**What it cost:**

- The proxy now **is** a subclass of your class, so `final` classes, `final` methods and
  `private` methods become load-bearing constraints rather than style nits. The set of
  things that break got *wider*, not narrower.
- CGLIB proxies are **not serializable** by default even when the target is, and they hold
  a `CGLIB$Enhanced` set of generated classes. This is the cause of
  `NotSerializableException` on session-scoped beans.
- CGLIB cannot advise a class with only package-private constructors and gets visibly slower
  on classes with deep hierarchies, because method resolution walks the hierarchy.
- `@Configuration` classes were already CGLIB (Volume 1, Chapter 3, section 4.3), so
  developers now live with two different proxy generations in one context.

> **STAFF-LEVEL CONSIDERATION**
>
> The Boot 2.0 default is a good decision that arrived with an unadvertised cost, and the
> migration conversation is worth having explicitly rather than discovering three years
> later. The pattern that holds up: **adopt the class-proxy default, and treat `final` as a
> forbidden annotation on Spring beans** — enforce it with ArchUnit, because the failure
> mode is a silently un-advised method, not a compile error. A single ArchUnit rule of the
> form "classes annotated with a stereotype in `com.acme` must not be final, and methods
> carrying `@Transactional`/`@PreAuthorize`/`@Async` must not be private, static or final"
> converts an entire chapter of silent-failure bugs into a build failure. That is the
> highest-leverage ten lines of AOP governance an organisation can adopt, and it is worth
> raising unprompted in a design review.

> **PRODUCTION SCENARIO**
>
> Problem: a service that had worked for a year started throwing
> `BeanCreationException: class com.acme.OrderServiceImpl$$EnhancerBySpringCGLIB$$xxx cannot be cast to ...` after a routine dependency upgrade, with no change to that service.
> Investigation: a git bisect landed on a starter upgrade that added
> `@Transactional` to a repository in the same module.
> Root cause: the application overrode `spring.aop.proxy-target-class=false` from a
> `application-test.yml`, so the annotated repository was JDK-proxied and no longer
> assignable to its concrete type, which a sibling `@Component` injected directly.
> Solution: remove the override, or convert the injection point to the interface.
> Prevention: a rule that every bean injected by concrete type must be non-final and
> adviseable, enforced in the build.

#### Common Mistakes

- Believing Boot's class-proxy default means everything is advised. It means everything is
  *eligible* to be advised; a `final` method, a `private` method, or a self-invocation is
  still invisible, and those are the actual bugs.
- Assuming a proxied bean is a different object is harmless. It changes identity,
  `equals`, serialization, stack traces, and `getClass()`.
- Writing an aspect and forgetting that an `@Around` method that does not call `proceed()`
  silently removes the target method. This is Chapter 5, and it is the most destructive
  single line in AOP.
- Injecting by concrete type and treating it as harmless. It works until the first aspect.
- Using `@Scope(proxyMode = INTERFACES)` on a class with no interface, which falls back to
  CGLIB anyway and confuses everyone reading the annotation.

#### Interview Questions — The Proxy Mechanism

**Q1. When does Spring AOP use a JDK dynamic proxy and when does it use CGLIB?** `TRICKY`

A JDK dynamic proxy if the target implements at least one interface; a CGLIB subclass proxy
otherwise. `proxyTargetClass = true` forces CGLIB regardless, and Spring Boot 2.0 changed
the default `spring.aop.proxy-target-class` to `true` so that concrete-type injection keeps
working once a bean is advised. `DefaultAopProxyFactory` also falls back to CGLIB if the
configured target is itself an interface or another proxy, since an interface cannot be
subclassed into an implementation.

**Q2. A bean works fine until `@Transactional` is added to it, then a
`ClassCastException` appears in a different class. Explain.** `TRICKY`

The bean is now a JDK dynamic proxy implementing only its interfaces, and a consumer injects
it by its concrete implementation type, which a proxy is not assignable to. The class that
broke did not change — the annotation did, on a bean somewhere else. The fixes are to inject
by the interface, to switch to a class-based proxy, or to stop injecting the concrete type.
The prevention is a build rule, because the coupling here is invisible at every call site.

**Q3. Walk me through what happens between a caller invoking a method and the target method
executing.** `ADVANCED`

The proxy's entry point runs — `InvocationHandler.invoke` for JDK, a generated
`FastClass`/`MethodProxy` dispatch for CGLIB — and hands off to
`DynamicAdvisedInterceptor.intercept`, which builds a `ReflectiveMethodInvocation` holding
the target, method, arguments and the ordered interceptor list. `proceed()` advances a
cursor and invokes the next interceptor; advice that does not call `proceed()` again
terminates the chain early. When the cursor reaches the last interceptor, the invocation
invokes the method on the **target** (never on the proxy, which is what prevents infinite
recursion) via `Method.invoke`, and the return value — or the exception — unwinds back up
the chain, so the outermost interceptor's post-processing runs last.

**Q4. What does the `Advised` interface give you, and is it a good idea to use in
production code?** `TRICKY`

It exposes the proxy's own configuration at runtime — the target source, the advisor list,
the proxied interfaces, and mutators like `addAdvisor` and `setTargetSource`. Every Spring
AOP proxy implements it. Using it for *inspection* in tests and diagnostics is legitimate
and is the reliable way to answer "is this bean proxied". Using it to *mutate* advisors in
production code is a trap, because it makes behaviour depend on bean initialisation order
and leaves no trace in the source.

**Q5. What is `TargetSource` for, and when have you needed it?** `ADVANCED`

It is the indirection that decides *which object* the proxy stands in front of, evaluated
on every call rather than once. `SingletonTargetSource` is the normal case — a fixed target.
`PrototypeTargetSource` returns a **new** target per method call. `ThreadLocalTargetSource`
binds a target per thread, which is how request-scoped state works. `RefreshableTargetSource`
swaps the delegate when a bean is refreshed, which is how hot-reloadable dev tooling works.
The general point is that the proxy is a stable handle onto a changing object, and that is
what makes scoped proxies possible at all.

**Q6. An advised method is called 200,000 times/second and takes 20 microseconds. Is the
proxy overhead acceptable?** `STAFF`

It is roughly a 20–50ns dispatch per interceptor hop plus a reflective terminal call,
against a ~20µs method — so around 0.1%, and acceptable. The number that would change the
answer is a method in the low microseconds running at high rate: a 3-interceptor chain on a
2µs in-memory method can add meaningful overhead, because allocation of the invocation
object and the advice bodies start to matter. At that point the fix is to move the hot path
behind an explicitly constructed collaborator, not to remove the aspects from the class —
because the aspects are usually there for correctness, and correctness is the thing you do
not trade away for microseconds.

**Q7. Spring Boot 2.0 changed the class-proxy default. Was it right, and what did it cost?**
`STAFF`

Right for the common case: the majority of application classes implement no interface, and
forcing them to grow one just so `@Transactional` could apply pushed interface-first design
onto teams for framework reasons. The cost is that CGLIB is less forgiving — `final`
classes, `final` methods and non-serializability all become real failure modes, and
developers rarely learn the connection. The right follow-through is to make `final` a
prohibited annotation on Spring beans via ArchUnit, so the sharper tool comes with the
guardrail.

> **CHAPTER 2 SUMMARY**
>
> The proxy selection rule is one line — JDK dynamic proxy if the target implements an
> interface, CGLIB otherwise, `proxyTargetClass` overriding both — and nearly every AOP
> surprise is a consequence of it. A JDK proxy is castable only to its interfaces, which is
> the source of the `ClassCastException` that starts incidents; Boot 2.0's switch to
> class proxies by default bought concrete-type injection and cost us `final` as a real
> constraint. Underneath, every advised call walks an interceptor chain via
> `ReflectiveMethodInvocation.proceed()` and dispatches to the **target** reflectively at the
> end — the chain holding the target rather than the proxy is exactly what stops it
> recursing. `Advised` exposes the proxy's own configuration, which is invaluable for
> diagnostics and dangerous for mutation.

#### Further Reading

- [Spring Framework Reference — Proxying Mechanisms](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — the authoritative statement of the JDK-vs-CGLIB rule, `proxyTargetClass`, and the optimisation properties.
- [Spring Framework Reference — Manipulating Advised Objects](https://docs.spring.io/spring-framework/reference/core/aop-api/advised.html) — what `Advised` exposes, with the canonical "unwrap to the target" recipes.
- [Spring Framework Reference — Using TargetSource Implementations](https://docs.spring.io/spring-framework/reference/core/aop-api/targetsource.html) — prototype, thread-local and refreshable target sources, which is where scoped proxies actually get their behaviour.
- [Source: `CglibAopProxy.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/framework/CglibAopProxy.java) — the proxy generator, including the `EqualsInterceptor` and `HashCodeInterceptor` that Chapter 7 depends on.
- [Source: `ReflectiveMethodInvocation.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/framework/ReflectiveMethodInvocation.java) — forty lines that explain the entire interception model.

## Chapter 3 — Declaring Aspects

### 3.1 The Wiring: `@Aspect` and `@EnableAspectJAutoProxy`

```java
@Configuration
@EnableAspectJAutoProxy                 // registers AnnotationAwareAspectJAutoProxyCreator
public class AopConfig { }

// Explicit, and usually clearer:
@Configuration
@EnableAspectJAutoProxy(proxyTargetClass = true)     // match the Boot 2.0 default
public class AopConfig { }
```

`@EnableAspectJAutoProxy` registers an `AnnotationAwareAspectJAutoProxyCreator` — a
`BeanPostProcessor` that runs during context refresh, before ordinary beans are created. For
every candidate bean it asks the `Advisor` registry whether any advisor applies, and if so
wraps the bean in a proxy. **That is the entire mechanism**, and knowing it explains why:

- Only beans the post-processor sees are candidates — so anything created with `new`, or by
  a static factory that bypasses the container, is never proxied.
- A bean that is **already** a proxy is not re-proxied; instead the existing proxy's advisor
  list is extended, which is why you never get a proxy-of-a-proxy in a single declaration.
- `@Transactional`, `@PreAuthorize` and `@Async` do not need `@EnableAspectJAutoProxy` —
  their own infrastructure brings in an auto-proxy creator. Adding your own is additive, not
  a prerequisite.

### 3.2 The Five Advice Types, and Precisely When Each Runs

```java
@Aspect
@Component
public class OrderAspect {

    // 1. BEFORE — runs, then the target runs. Cannot prevent it.
    @Before("execution(* com.acme..*Service.*(..))")
    public void before() { audit("attempt"); }

    // 2. AFTER — ALWAYS runs, like a finally block. No access to return value or exception.
    @After("execution(* com.acme..*Service.*(..))")
    public void after() { metrics.record(); }

    // 3. AFTER RETURNING — runs only on normal completion. Can transform the return value.
    @AfterReturning(pointcut = "execution(* com.acme..*Service.*(..))", returning = "result")
    public void afterReturning(Object result) { cache.put(result); }

    // 4. AFTER THROWING — runs only on an exception. Can rethrow or swallow.
    @AfterThrowing(pointcut = "execution(* com.acme..*Service.*(..))", throwing = "ex")
    public void afterThrowing(Exception ex) { alerting.page(ex); }

    // 5. AROUND — wraps the target. Controls whether, when and how often it runs.
    @Around("execution(* com.acme..*Service.*(..))")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        return pjp.proceed();
    }
}
```

| Advice | On success | On exception | Can skip target? | Can see return value? | Can see exception? |
| --- | --- | --- | --- | --- | --- |
| `@Before` | Runs | Runs | No | No | No |
| `@After` (finally) | Runs | Runs | No | No | No |
| `@AfterReturning` | Runs | **Skipped** | No | **Yes** | No |
| `@AfterThrowing` | **Skipped** | Runs | No | No | **Yes** |
| `@Around` | You decide | You decide | **Yes** | **Yes** | **Yes** |

Three things in that table cause most of the bugs:

1. **`@After` is a `finally`, not a cleanup on success.** It runs on the failure path too,
   so anything in it is running while an exception is propagating. If it throws, it *replaces*
   the original exception.
2. **`@AfterReturning` does not run on the failure path.** An aspect author who puts
   "invalidate the cache" in `@AfterReturning` gets exactly that — it is skipped on failure.
3. **`@Around` is the only advice that can skip or repeat the target.** That power is why it
   is the right tool for retry and caching, and why a bug in it is catastrophic: no
   `proceed()` means the method never runs, and two calls mean it runs twice (Chapter 5).

`@Before` also runs inside a transaction but outside the transaction interceptor if the
transaction aspect has higher precedence — the ordering question Chapter 6 exists to answer.

### 3.3 `execution()` vs `within()`

The distinction people get wrong, because the two look interchangeable:

```java
// execution — match the METHOD SIGNATURE
@Before("execution(* com.acme.order.OrderService.create(..))")     // one method
@Before("execution(public * com.acme..*Service.*(..))")           // every method of every Service
@Before("execution(public * com.acme..*Service.save*(..))")       // save*, saveAll, saveAndFlush

// within — match the TYPE, then ALL its methods
@Before("within(com.acme.order.OrderService)")                     // every method of this class
@Before("within(com.acme..service..*)")                            // every method of every service
@Before("within(@com.acme.Audited *))"                            // every method of @Audited classes
```

| | `execution(...)` | `within(...)` |
| --- | --- | --- |
| Matches | A method signature | A type, then all its methods |
| Can name a single method | **Yes** | No |
| Expresses "all methods of this class" | Verbosely, with `.*(..)` | Directly |
| Overridden methods in subclasses | **Not matched** unless the subclass type is in the pattern | Matched, if the subclass is within the type pattern |
| Performance | Evaluated per candidate method | Cheaper — evaluated per type |

The override trap is the practical difference and it catches people constantly. Given a
`class SpecialOrderService extends OrderService`, this does **not** advise
`SpecialOrderService.create(..)`:

```java
@Before("execution(* com.acme.order.OrderService.create(..))")   // ✗ parent signature only
```

The CGLIB proxy for `SpecialOrderService` reports the declared method from
`SpecialOrderService` during matching, so the pattern does not hit. The fix is to include
the type pattern broadly (`execution(* com.acme.order.*Service.create(..))`) or to switch to
`within` on the concrete type. This is a real production bug — a subclass gets a new
behaviour, the parent's aspect silently stops applying, and the diff shows nothing.

> **INTERVIEW TRAP**
>
> `within(@Service *)` looks like a safe, elegant way to advise "all services". It is a
> pointcut on the annotation, and it will match every `@Service` bean in the application
> **including the ones your aspect author had in mind and the forty they did not**. It is
> also evaluated against the *proxy* class, so a class proxied for an unrelated reason can
> change how the match behaves. The senior correction: a broad pointcut is a global decision
> with a blast radius, and the right width for a logging aspect on service packages is a
> *package* pattern (`com.acme.order..*`), not an annotation pattern that reaches into
> every module in the codebase including the ones that did not ask.

### 3.4 `@Component` vs `@Bean` — and the Ordering Consequence

```java
// A. Annotated component
@Aspect
@Component
public class MetricsAspect { /* ... */ }

// B. Produced by a @Bean method
@Configuration
public class ObservabilityConfig {
    @Bean
    MetricsAspect metricsAspect(MeterRegistry registry) {
        return new MetricsAspect(registry);       // dependencies resolved by the container
    }
}
```

Functionally, AOP sees the same `Aspect` either way. The difference is **how you get
dependencies into it and how you control it**:

| | `@Aspect @Component` | `@Aspect` from `@Bean` |
| --- | --- | --- |
| Dependencies | Constructor injection only — the aspect is created by the scanner | **Any** — the `@Bean` method's parameters are resolved for you |
| Component-scanned | Yes — it must be inside a scanned package | No — put it anywhere |
| Conditional | `@Conditional`, `@Profile` | `@Conditional`, `@Profile`, and Boot's `@ConditionalOnMissingBean` |
| Works without `@ComponentScan` | No | **Yes** — essential in a library or an auto-configuration |
| Testable in isolation | Needs the container | **A plain constructor call** |
| Ordering | `@Order` on the class | `@Order` on the class **or** the method |

**The ordering consequence is the non-obvious part.** When the aspect is a scanned
`@Component`, the auto-proxy creator discovers it through the `BeanFactory`'s advisor lookup,
and ordering is resolved from `@Order` on the class. When it is produced by a `@Bean` method,
there is a second path — `AnnotationAwareAspectJAutoProxyCreator` also collects advisors
directly from beans implementing `Advisor`, and **`@Order` on the `@Bean` method participates
in the sort** in a way it does not for a plain component. Declaring the same aspect both ways
produces two advisor instances and therefore advice running twice, which is a genuinely
nasty bug: a log line per operation, and a metrics counter that is double-counted with no
error anywhere.

The rule that holds up: **an aspect is declared exactly once.** If it needs conditional
assembly, external configuration, or it lives in a library, it is a `@Bean` method and the
package is not scanned. Otherwise it is a `@Component` and it is trivial. Doing both is the
most common way to end up with advice that mysteriously runs two times per call.

```java
// Library / starter — the correct shape. No @ComponentScan needed.
@Configuration(proxyBeanMethods = false)
@ConditionalOnClass(MeterRegistry.class)
@ConditionalOnMissingBean(MetricsAspect.class)     // belt and braces against double registration
public class MetricsAutoConfiguration {
    @Bean
    @Order(Ordered.HIGHEST_PRECEDENCE + 100)
    public MetricsAspect metricsAspect(MeterRegistry registry,
                                       ObjectProvider<MetricsAspect> existing) {
        return existing.getIfAvailable(() -> new MetricsAspect(registry));
    }
}
```

### 3.5 Aspect Extraction — When a Concern Earns Its Own Module

The question a staff engineer gets: *should logging, metrics and transactions be aspects, or
code in the services?*

| | Aspect | Explicit code in the service |
| --- | --- | --- |
| Visibility | Invisible at the call site | Visible |
| Unit testing | Needs a context to prove it applies | Free |
| Uniformity | Guaranteed if the pointcut holds | Depends on every author remembering |
| Onboarding | New joiner cannot see it in the class | Self-documenting |
| Removal | Change the pointcut, restart | Delete the lines |
| Debuggability | Stack trace through the chain | Direct |

**Extract a concern into an aspect when all of these hold:** the behaviour is genuinely
identical everywhere it applies; it is mechanical (timing, tracing, metrics, authorisation,
retry) rather than business logic; the number of call sites is large enough that explicit
code would be a genuine burden; and the team is willing to own the pointcut as a reviewed
artefact.

**Do not extract when:** the behaviour differs per call site; it is business logic; the point
is to make one specific call safer (an aspect there is a decorator in disguise); or the
team has no mechanism for reviewing a pointcut. The over-engineering failure is real and
common — a codebase with an aspect per concern, each with a broad pointcut, each invisible,
is *harder* to reason about than code with a `log.info` in it, and it will have a silent
behaviour bug in it within a year.

The migration path when you are somewhere in the middle: pick one concern (usually metrics),
extract it, measure, and let the team form an opinion from the result rather than from a
principle. What the team will discover is that the aspect version is genuinely less
maintainable for anything that needs to be understood — and genuinely more maintainable for
anything that must be uniform.

> **STAFF-LEVEL CONSIDERATION — THE OWNERSHIP PROBLEM**
>
> The honest objection to AOP is not performance. It is that **an aspect silently changes the
> behaviour of code its author never reads, and no reviewer of the changed file can see
> that it did.** A pull request that adds a validation call to `OrderService.create` looks
> completely self-contained; there is no hint in the diff that a pointcut now intercepts it.
> That breaks two assumptions a team relies on: that a reviewer of a diff is seeing the
> behaviour change, and that a developer can reason about their class by reading their class.
>
> The mitigations that actually work are organisational, not technical. **One:** own the
> aspects in a named module with a named owner, so "who decided this behaviour applies to
> `com.acme.order`?" has an answer. **Two:** write a test that asserts the *pointcut* — that
> `MetricsAspect` applies to `OrderService` and to `PaymentService` — so a refactor that
> silently narrows the blast radius fails CI. **Three:** cap the pointcut. A pointcut
> matching a package is reviewable; a pointcut matching `within(@Service *)` is a global
> policy decision nobody signed off on. If a team cannot articulate those three, the honest
> staff answer is that they should not be using aspects for that concern yet — and that
> saying so is the more valuable contribution.

#### Common Mistakes

- Using `@After` as "cleanup on success". It is a `finally` — it runs on the exception path
  too, and an exception from it replaces the original one.
- Using `@AfterReturning` to invalidate a cache, assuming it runs on failure. It does not.
- Writing an aspect both as an `@Aspect @Component` and as a `@Bean` method. The advice
  runs twice, with no error.
- Reaching for `within(@Service *)` because it looks tidy. It is a global policy decision
  with a blast radius across every module.
- Expecting `execution(parentType.method(..))` to match a subclass override. It does not.
- Forgetting that an aspect in a package outside `@ComponentScan` is simply never applied —
  and nothing logs that either.
- Treating a broad pointcut as a local decision.

#### Interview Questions — Declaring Aspects

**Q1. Name the five advice types and say which can prevent the target method from
running.** `TRICKY`

`@Before` runs then the target runs. `@After` is a `finally` that always runs. `@AfterReturning`
runs only on normal completion and can see and transform the return value.
`@AfterThrowing` runs only on an exception and can see and rethrow or swallow it. `@Around`
wraps the target and is the only one that can skip it, defer it, repeat it, or change the
return value — because only `@Around` receives a `ProceedingJoinPoint` that controls whether
`proceed()` is called.

**Q2. What is the difference between `execution()` and `within()`?** `TRICKY`

`execution()` matches a method signature — modifiers, return type, declaring type, name
pattern, parameters — so it can name one method. `within()` matches a type and then applies
to all of its methods. The practical difference is overridden methods: `execution(* Base.foo(..))`
does not match an override declared in a subclass, because the CGLIB proxy reports the
subclass's declared method, so an aspect silently stops applying when a class is subclassed.
`within` is also cheaper, being evaluated per type rather than per method.

**Q3. Why would you declare an aspect as a `@Bean` method rather than an
`@Aspect @Component`?** `TRICKY`

When it needs dependencies the scanner cannot supply, when it must be conditional
(`@ConditionalOnMissingBean` in an auto-configuration), when it lives outside any scanned
package — which is the normal case for a library or starter — or when you want to construct
it directly in a test. The `@Bean` method's parameters are container-resolved, so an aspect
can depend on a `MeterRegistry` or a tenant resolver without the aspect class itself knowing
about injection. The warning: declaring the same aspect both ways registers it twice and
advice runs twice per call.

**Q4. A teammate's aspect quietly doubles every HTTP call, and the counter in their
dashboard is exactly 2×. What is the most likely cause?** `TRICKY`

The aspect is registered twice — once as a scanned `@Aspect @Component` and once as a
`@Bean` method, or in two auto-configuration classes without a
`@ConditionalOnMissingBean` guard. The auto-proxy creator collects advisors from both
paths, so both instances intercept. This is the reason library aspects must be guarded, and
the reason you should assert in a test that a given aspect is applied exactly once.

**Q5. When should a cross-cutting concern NOT be an aspect?** `STAFF`

When the behaviour varies by call site — then it is a decorator or an explicit collaborator,
because an aspect is a uniform policy and a non-uniform policy is a lie. When it is business
logic, because business logic is what a service should contain. And when the team cannot
name who reviews the pointcut and cannot write a test asserting what it matches — because an
aspect nobody owns is a behaviour change nobody can find. The decision criterion is
visibility: an aspect should apply something every reader of the target class would expect;
anything else needs to be visible at the call site.

**Q6. Your team wants a `@Around` aspect on every method in `com.acme.order..*` to log
before and after. Review that request.** `STAFF`

The mechanics are right but the implementation should be `@Before` and `@AfterReturning`
plus `@AfterThrowing` rather than `@Around` — the same behaviour with a smaller blast radius,
because forgetting `proceed()` in `@Around` silently deletes the method. Push back on the
package width and push for a test that asserts the aspect applies to the classes the team
intends, because a pointcut that is a string has no other safety net. And name the cost:
every call in that package now pays a chain hop, and the stack trace for every one of those
methods now runs through `MethodInterceptor.invoke`.

> **CHAPTER 3 SUMMARY**
>
> Declaring an aspect is two annotations and a `BeanPostProcessor` that decided at context
> refresh time which beans to wrap — and that decision is invisible in every file it affects.
> The five advice types differ in exactly one dimension that matters: only `@Around` can skip,
> defer or repeat the target, and only `@AfterReturning` and `@AfterThrowing` see the outcome
> the caller will see. `execution` versus `within` is a real difference, not a stylistic one,
> and the overridden-subclass case is a production bug hiding in the common answer. Whether
> a concern belongs in its own module comes down to uniformity and ownership, and the
> strongest objection to AOP is not performance — it is that an aspect changes the behaviour
> of code its author never reads and no reviewer of that code can see it.

#### Further Reading

- [Spring Framework Reference — `@AspectJ` Support](https://docs.spring.io/spring-framework/reference/core/aop/ataspectj.html) — the five advice types, `@AspectJ` style pointcuts, and the `@target`/`@args` forms.
- [Spring Framework Reference — Choosing a Declaration Style](https://docs.spring.io/spring-framework/reference/core/aop/choosing.html) — `@AspectJ` versus schema-based versus the programmatic style, and when each is the right one.
- [Spring Framework Reference — Mixing Aspect Types](https://docs.spring.io/spring-framework/reference/core/aop/mixing-styles.html) — how the different advice declarations combine, and the restrictions when you mix them.
- [Spring Framework Reference — the Auto-Proxy Facility](https://docs.spring.io/spring-framework/reference/core/aop-api/autoproxy.html) — what the auto-proxy creator actually does to each candidate bean, and why it will not double-proxy.

## Chapter 4 — Pointcut Expression Language

### 4.1 The Nine Designators

Every designator Spring AOP supports, and what each one actually tests:

| Designator | Matches on | Matches at | Example |
| --- | --- | --- | --- |
| `execution` | The **method signature** — modifiers, return type, declaring type, name, parameters, throws | Static analysis of the method, then runtime check | `execution(public * com.acme..*Service.save*(..))` |
| `within` | The **declaring type** of the method, then all its methods | Static | `within(com.acme.order..*)` |
| `args` | The **runtime argument types** of the call | Runtime | `args(String, long, ..)` |
| `@annotation` | An annotation **on the method being executed** | Static | `@annotation(com.acme.Audited)` |
| `@target` | An annotation on the **declaring type** of the executing method | Static | `@target(org.springframework.stereotype.Service)` |
| `@args` | Annotations **on the arguments** of the call | Runtime | `@args(com.acme.Sensitive)` |
| `bean` | The **bean name** of the target | Runtime (consults the factory) | `bean("orderService*")` |
| `this` | The **type of the proxy** — the object as the caller sees it | Runtime | `this(com.acme.order.OrderService)` |
| `target` | The type of the **target object** behind the proxy | Runtime | `target(com.acme.order.OrderServiceImpl)` |

Two of these are Spring-only and worth naming in an interview: `bean()` matches by **bean
name**, and it does not exist in AspectJ, because AspectJ has no container and therefore no
bean names. It is also the only designator that requires runtime evaluation against the bean
factory on every match attempt, which is why it is the slowest of the nine.

### 4.2 `execution()` in Depth — the One You Will Actually Use

```text
execution(
    modifiers-pattern?      public | protected | private | static | final | + -  (unrestricted)
    return-type-pattern?    com.acme..* | void | * | ? (any single type)
    declaring-type-pattern? com.acme.order..* | OrderService | * (any)
    name-pattern            create | get* | * | ? (single char)
    ( parameter-patterns )  (String, long, ..) | () | (*, String) | (com.acme..*, ..)
    throws-pattern?         com.acme..*
)
```

The separators matter more than anything else here, and they are the first thing people get
wrong:

| Pattern | Matches | Does NOT match |
| --- | --- | --- |
| `*` | Anything in that one segment — e.g. any name | Anything across a `.` |
| `..*` | Any number of package segments, including none | — |
| `?` | Exactly one character | More than one |
| `*Service` | Any class name **ending** in `Service` | `ServiceImpl` is a different name |

So `com.acme..*Service` matches `com.acme.order.OrderService` and `com.acme.Service` — the
`..*` is required to cross package boundaries. A common bug is writing
`com.acme*.*Service`, which matches only the `com` package's direct children.

Real examples, in the order you would reach for them:

```java
// 1. One specific method on one specific class
"execution(* com.acme.order.OrderService.create(..))"

// 2. Every method named save* on any Service in the order package
"execution(* com.acme.order..*Service.save*(..))"

// 3. Every public method of every class in two packages — the safe default for a logging aspect
"execution(public * com.acme.order..* || execution(public * com.acme.payment..*)"

// 4. No-argument methods only, returning anything
"execution(* com.acme..*Service.*())"

// 5. Constructor execution — matches, but Spring AOP CANNOT advise it
//    (a proxy cannot intercept construction of the target)
"execution(public com.acme..OrderService.*(..)) && execution(public com.acme..OrderService(..))"
```

That fifth example is a genuine trap worth raising in an interview. `execution()` happily
*matches* a constructor, and Spring will create the proxy — it just does nothing useful,
because a proxy cannot intercept the construction of the object it wraps.

> **INTERVIEW TRAP — "WHICH DESIGNATOR IS FASTEST?"**
>
> The reflexive answer is `execution`, on the grounds that it is the most specific. The
> correct answer distinguishes **match time** from **frequency**. `execution` and `within`
> are resolved largely from static metadata at proxy creation time. `bean()`, `this()`,
> `target()`, `args()` and `@args()` require a runtime check on the actual invocation, and
> `bean()` additionally has to resolve against the bean factory. So the honest ranking is
> the static designators first, the runtime ones after, and `bean()` last — and the practical
> consequence is not nanoseconds, it is that a broad runtime pointcut across a hot path is
> measurably worse than the equivalent static one, which is an argument for `within` over
> `execution(..*..*)` when both express the same intent.

### 4.3 `args()` vs `@args()`, and the Runtime/Match-Time Split

```java
// args() — the ARGUMENT TYPES must match, resolved at runtime
@Before("args(String, long)")
@Before("args(.., com.acme.Money)")
@Before("execution(* com.acme..*Service.*(..)) and args(id)")

// @args() — the ARGUMENTS must carry these ANNOTATIONS
@Before("@args(com.acme.Sensitive)")
@Before("@args(com.acme.Audited, com.acme.Owned)")
```

The most valuable pattern in the whole language, and one people rarely write:

```java
// Audit any call that passes a Sensitive argument, whatever the method is called.
@AfterReturning(pointcut = "@args(com.acme.Sensitive)", returning = "result")
public void auditSensitiveCalls(Object result) { /* ... */ }
```

This is data-flow-driven rather than name-driven — it applies to `save`, `update`, `findById`
and `export`, and it keeps working when those methods are renamed. Compare that to the
equivalent name-based pointcut, which has to enumerate every method name that could receive
a sensitive argument, and which silently stops applying the day someone renames one. It is
the strongest practical argument for keeping pointcuts narrow and semantic rather than
structural.

| | Resolved | Implication |
| --- | --- | --- |
| `execution`, `within`, `@annotation`, `@target` | **Match time** (once, at proxy creation) | Cheap; the decision is cached in the advisor |
| `args`, `@args`, `this`, `target`, `bean` | **Runtime, per invocation** | Correct, but paid on every call |

### 4.4 `bean()` — Matching by Bean Name

```java
// Exact name
@Before("bean(orderService)")

// Wildcards — a real, supported use
@Before("bean(*Service)")
@Before("bean(order*Repository)")

// Composition — the actual reason to reach for bean()
@Before("bean(*Service) and !bean(auditService)")
@Before("bean(orderService) || bean(paymentService)")

// Scope it to a type as well
@Before("bean(orderService) and execution(* *(..))")
```

`bean()` is the pragmatic designator, and the composition operator is where it earns its
place:

```java
// "Every service, except the ones that must not be timed"
@Around("bean(*Service) and !bean(healthService) and !bean(noopService)")

// "The three services that talk to the legacy system"
@Around("bean(legacyBillingService) || bean(legacyTaxService) || bean(legacyLedgerService)")
```

It is also the designator that makes pointcuts *worse*, because bean names are strings too,
and worse than type names: renaming a bean is a more common refactoring than renaming a
method, and a `bean()` pointcut that no longer matches is not an error — it is advice that
stops running.

> **STAFF-LEVEL CONSIDERATION — THE STRING-POINTCUT REFACTORING HAZARD**
>
> This is the single most important thing to understand about pointcuts, and almost nobody
> raises it in an interview.
>
> **A pointcut is a string, not a symbol.** A method call site is a compile-time reference:
> rename the method, and the compiler points at every caller. A pointcut reference is a
> string that the compiler has never seen and will never check. Rename `OrderService.create`
> to `OrderService.place`, and:
>
> ```text
> BEFORE   execution(* com.acme.order.OrderService.create(..))
>          ──────────────────────────────────────────────────────►  matches nothing
>          ──────────────────────────────────────────────────────►  NO error
>          ──────────────────────────────────────────────────────►  NO warning
>          ──────────────────────────────────────────────────────►  NO failing test
> ```
>
> The advice stops running. The metric stops being recorded. The authorisation check stops
> happening — and `@PreAuthorize` stopping happening is a **security** failure, not a
> performance one. The failure is not a crash; it is the *absence* of a behaviour, which is
> the hardest class of defect to detect, because the system continues to work perfectly for
> everyone not affected.
>
> **Why Spring doesn't fix it.** AspectJ's pointcuts are type-safe: a pointcut is a value
> produced by a method call (`execution(OrderService+.create(..))`) that the compiler
> type-checks, and a rename inside the IDE updates every pointcut that mentions it. Spring's
> pointcuts are strings, because they are resolved by a runtime expression parser
> (`PointcutParser`) with no compile-time participation — which is what allows them to
> reference bean names, which are themselves runtime strings, and to be composed in
> configuration rather than in code. That is a real trade: Spring gives you pointcuts that
> can name beans, and takes away refactoring safety. The honest statement is that **Spring's
> pointcuts are closer to a query language than to a type**, and should be reviewed as one.
>
> **What to do about it, in order of value:**
> 1. **Test the pointcut.** Assert that the aspect applies to the methods the team intends.
>    A pointcut test is cheap — instantiate the `AspectJExpressionPointcut`, call `matches`,
>    assert. It converts a silent behaviour loss into a red build.
> 2. **Prefer `within` / `@annotation` / `@args` over name patterns.** These survive renames
>    because they do not name methods. `@annotation(Audited)` is far more durable than
>    `execution(* *..*Service.create(..))`.
> 3. **Prefer annotating the code over describing it in the pointcut.** A method annotated
>    `@Audited` is a type-safe declaration; a class listed in a `bean()` list is a string.
> 4. **Treat `grep` as part of the refactor.** A rename of an advised method must be
>    accompanied by a search for the method name across `*Config`, `application.yml` and
>    every aspect. Put it in the PR checklist, because nobody will remember.
> 5. **Cap the width.** A narrow pointcut has a small blast radius when it breaks. A
>    `bean(*Service)` pointcut is a global dependency on the naming convention of an entire
>    codebase.

> **PRODUCTION RELEVANCE**
>
> The most expensive version of this is `@PreAuthorize`, because the pointcut and the
> SpEL expression are *both* strings, and both fail silently. An annotation whose expression
> references a renamed method, or a permission constant that moved, produces an endpoint that
> is now open to anyone — with no error, no failing test, and no log line. That is why
> Spring Security's method security should be covered by integration tests that assert
> *denial* for an unauthorised principal, not only success for an authorised one. A test
> suite that only tests the happy path of authorisation has no chance of catching a broken
> pointcut, because the broken state is "everything is allowed".

### 4.5 Composing Pointcuts

```java
// AND
"execution(* com.acme..*Service.*(..)) and @annotation(com.acme.Audited)"

// OR
"bean(orderService) || bean(paymentService)"

// NOT — note the parentheses, or precedence surprises you
"execution(* com.acme..*Service.*(..)) and !(@annotation(com.acme.InternalOnly))"

// Toggling — the only genuinely dynamic form
"execution(* com.acme..*Service.*(..)) and @annotation(com.acme.SlowOperation)"
```

A `toggling` pointcut — one whose expression is read from a bean — is a legitimate and
underused escape hatch, and it is the right answer for "we need to disable this aspect in an
incident without a rebuild":

```java
@Aspect
@Component
public class MetricsAspect {
    private static final Expression STUB = parse("true");   // never matches

    private final Toggle toggle;   // reads a property, refreshed at runtime

    public MetricsAspect(Toggle toggle) { this.toggle = toggle; }

    @Around("com.acme..MetricsPointcuts.metricsTracked()")
    public Object around(ProceedingJoinPoint pjp) throws Throwable {
        if (!toggle.isEnabled()) {
            return pjp.proceed();        // a cheap bypass; still a chain hop
        }
        // ...
    }
}

// A pointcut is just a bean, which means it can be shared, named and tested.
public final class MetricsPointcuts {
    public static final Pointcut METRICS_TRACKED = Pointcut.matches(
        "execution(* com.acme.order..*Service.*(..))"
      + " and !@annotation(com.acme.NoMetrics)");
    public static final Pointcut STUB = Pointcut.matches("true");   // matches nothing
}
```

The `STUB` trick matters more than it looks: `Aspect` classes are final in their *behaviour*
only once the creator is registered, and a pointcut that matches nothing lets you disable an
aspect by rebinding a bean rather than by deleting a `@Component`. The cost is that an
aspect that is "disabled" is still consulted on every call unless the pointcut is a constant
`false`, so this is a feature for cutting an expensive body, not for removing a chain hop.

#### Common Mistakes

- Renaming an advised method and leaving the pointcut as a string. The advice silently stops
  applying — a behaviour loss, not an error.
- `com.acme*.*Service` instead of `com.acme..*Service`. It matches only the direct children
  of `com.acme`, and if it matches anything at all it looks correct, so the bug is invisible.
- Using `bean(*)` or `within(@Service *)` as a "safe default". These are global decisions.
- Assuming `args()` is a match-time check. It is evaluated per invocation.
- Testing only the authorised path of a `@PreAuthorize` expression, which is exactly the test
  that cannot detect a broken pointcut.
- Forgetting parentheses around `!`, and getting the precedence wrong.
- Believing `execution()` matching a constructor means Spring can advise construction. It
  cannot — a proxy wraps an object that already exists.

#### Interview Questions — The Pointcut Language

**Q1. List the pointcut designators Spring AOP supports and say which are Spring-only.**
`TRICKY`

`execution`, `within`, `args`, `@annotation`, `@target`, `@args`, `bean`, `this`, `target`.
`bean()` is Spring-only — it matches by bean name, which requires a container, so AspectJ
has no equivalent. `this()` and `target()` also have no AspectJ equivalent in the same form,
because in Spring they distinguish the proxy's type from the target's type.

**Q2. Write an `execution()` pointcut for "every public method of any class in the
`com.acme.order` package".** `TRICKY`

`execution(public * com.acme.order..*)` — or, more explicitly,
`execution(public * com.acme.order..*.*(..))`. The subtle part is that `..*` is required to
cross package boundaries; `com.acme.order.*` would match only classes directly in
`com.acme.order`, and both are easy to write and hard to notice is wrong.

**Q3. What is the difference between `args(String)` and `@args(com.acme.Sensitive)`?**
`TRICKY`

`args()` matches the runtime *types* of the call's arguments; `@args()` matches
*annotations* present on the arguments. Both are resolved at invocation time rather than at
match time. The staff point is that `@args()` is the more robust designator, because it is
driven by the data's sensitivity rather than by the method's name — so it keeps working
through a rename, and it covers methods the author of the pointcut did not know existed.

**Q4. Why is a string pointcut a refactoring hazard, and why does Spring not use
AspectJ's model?** `STAFF`

Because a string is not a symbol. Renaming a method updates every compile-time reference and
updates none of the pointcuts, so the advice silently stops applying — and the failure is a
missing behaviour, not an error, which is far harder to detect than a crash. Spring uses
strings because the parser must be able to resolve bean names, and bean names are themselves
runtime strings; AspectJ's pointcuts are values produced by method calls, so the compiler
type-checks them and an IDE rename updates them. The mitigations are a pointcut test that
asserts what matches, a preference for `within`/`@annotation`/`@args` over name patterns,
and putting the aspect on the code rather than in a pattern.

**Q5. Is `bean(*Service)` a reasonable pointcut for a logging aspect?** `TRICKY`

It works, and it is one of the few genuinely useful uses of `bean()`, because it expresses
intent ("all the services") rather than structure. It is also slow — it resolves against the
bean factory at runtime — and it makes the aspect's behaviour depend on a naming convention
that someone can break by renaming a bean. The better form is
`bean(*Service) and !bean(auditService)`, and the better still form is
`@annotation` on the classes that should be logged, which is durable under rename.

**Q6. Your pointcut silently matched nothing after a refactor, and nobody noticed for six
weeks. What process change prevents that?** `STAFF`

Treat pointcuts as reviewed code. Concretely: a test that asserts the aspect applies to the
specific methods the team intends, so a rename that breaks the match turns CI red; a
convention of annotating the target (`@Audited`) rather than describing it in a pattern;
narrow pointcuts so the blast radius of a mistake is small; and an explicit PR checklist item
that greps for renamed advised method names across aspects, configuration and
`application.yml`. The test is the highest-value item by a wide margin — everything else is
a convention that depends on someone remembering.

**Q7. When would you write a pointcut as a constant in Java rather than inline in the
annotation?** `TRICKY`

When it is shared by several aspects, when you want a testable handle on it
(`assertTrue(MetricsPointcuts.TRACKED.matches(method, targetClass))`), or when you want the
"disable by swapping the constant for `Pointcut.matches("true")`" escape hatch. It also
gives you a place to name the concept, which an inline string in six annotations does not.

> **CHAPTER 4 SUMMARY**
>
> Nine designators, two of which — `execution` and `within` — resolve at match time and
> carry most of the real usage, with `execution` able to name a single method and `within`
> naming a type. The rest are resolved per invocation, which is a cost and, for `@args`, a
> robustness advantage: matching on an argument's annotation survives a rename that a
> name-based pointcut does not. The staff-level content of this chapter is that **a pointcut
> is a string, not a symbol** — renaming an advised method silently removes the behaviour,
> with no compile error, no warning, and no failing test, and for `@PreAuthorize` that is a
> security failure rather than a metrics gap. Spring uses strings because its parser must
> resolve bean names, which are also runtime strings; AspectJ's type-safe model buys
> refactoring safety at the cost of that flexibility. The practical answer is to test what
> your pointcuts match, prefer the designators that do not name methods, and keep pointcuts
> narrow enough that a mistake has a small blast radius.

#### Further Reading

- [Spring Framework Reference — Pointcuts (At-AspectJ)](https://docs.spring.io/spring-framework/reference/core/aop/ataspectj/pointcuts.html) — the operator precedence rules and the full grammar, with the reference to the AspectJ pointcut language.
- [Spring Framework Reference — Pointcut API in Spring](https://docs.spring.io/spring-framework/reference/core/aop-api/pointcuts.html) — `PointcutParser`, `ComposablePointcut`, and how string expressions become evaluated objects.
- [Spring Framework Reference — `@AspectJ` Support](https://docs.spring.io/spring-framework/reference/core/aop/ataspectj.html) — the designators as they appear in annotations, including `@target` and `@args`.

## Chapter 5 — `@Around` & the `proceed()` Contract

### 5.1 Five Obligations

`@Around` is the only advice that controls the target, and therefore the only advice that
can break it catastrophically. Five obligations, in order of how often they are violated:

```java
@Around("execution(* com.acme..PaymentGateway.*(..))")
public Object around(ProceedingJoinPoint pjp) throws Throwable {
    // OBLIGATION 1 — call proceed() EXACTLY ONCE.
    //   zero times → the method never runs. The caller gets null, or your fallback.
    //   twice      → the method runs twice. For a payment, that charges twice.
    Object result = pjp.proceed();

    // OBLIGATION 2 — rethrow unless you are deliberately swallowing.
    return result;    // exceptions from proceed() propagate automatically ONLY if
                      // you declare `throws Throwable` and don't catch
}
```

| # | Obligation | Violation | Symptom |
| --- | --- | --- | --- |
| 1 | Call `proceed()` **exactly once** | Never called | The method silently does nothing. Returns `null`. The worst bug in AOP |
| 1 | Call `proceed()` **exactly once** | Called twice | The method runs twice — double charge, double email, double insert |
| 2 | Rethrow exceptions unless deliberately swallowing | Caught and dropped | Failures become silent successes. The database write is gone and nobody knows |
| 3 | Measure around `proceed()`, not around setup | Timer started before, stopped early | Metrics that do not measure the method |
| 4 | Return type must match | Returning `null` for a `void` method's advice | NPEs in the caller if the return is dereferenced |
| 5 | Do not block | Anything that waits on I/O, a lock, or another thread | Thread-pool exhaustion under load |

Obligation 1 deserves a diagram, because the two failure modes look identical from the
outside:

```text
CORRECT — one proceed()
  pjp.proceed() ─► target.create(..) ─► returns Order
  caller receives Order                                    ✔

BUG 1 — zero proceed()                    the method NEVER runs
  (nothing)
  caller receives null                      ✘ silent, no exception

BUG 2 — two proceed() calls               the method runs TWICE
  pjp.proceed() ─► target.create(..) ─► Order #1
  pjp.proceed() ─► target.create(..) ─► Order #2
  caller receives Order #2
                                      ✘ Order #1 was written and leaked
```

Bug 2 is the worse of the two, because a charge happened and a row was inserted, and the
caller has no way of knowing.

### 5.2 Obligation 1 in Depth — Why `Object result = proceed()`

The question "why do I need to assign the result?" has a precise answer. `proceed()` is a
method with a return value. If you call it and discard the result, the target's return value
is thrown away and the caller receives whatever *you* return — which, if you have no `return`
statement, is `null`.

```java
// ✗ The target runs, its return value is discarded, caller gets null
@Around("execution(* com.acme..*Service.find*(..))")
public void around(ProceedingJoinPoint pjp) throws Throwable {
    pjp.proceed();      // result dropped on the floor
}
```

```java
// ✔ Capture it, transform it, return it
@Around("execution(* com.acme..*Service.find*(..))")
public Object around(ProceedingJoinPoint pjp) throws Throwable {
    Object result = pjp.proceed();     // the return value
    if (result == null) {
        throw new IllegalStateException("service returned null");
    }
    return result;
}
```

The same reasoning applies to exceptions. `proceed()` declares `throws Throwable`, so
**propagation is automatic as long as you do not catch it and as long as your method declares
`throws Throwable`**. The moment you add a `catch` block, you have taken responsibility for
the failure and the framework will never see it.

```java
@Around("execution(* com.acme..*Service.*(..))")
public Object around(ProceedingJoinPoint pjp) throws Throwable {
    // Adding `try { ... } catch (Exception e) { }` here means a failure in the target
    // becomes a normal return to the caller. That is a design decision, and it must be
    // a deliberate one.
    try {
        return pjp.proceed();
    } catch (BusinessException e) {
        metrics.increment("business.rejected");
        throw e;                  // ← rethrow. This is the default you want.
    }
}
```

> **MUST REMEMBER**
>
> `proceed()` is the only line in your aspect that runs the target. Everything else is
> decoration. A missing `proceed()` is a **method that silently does nothing**; a duplicated
> `proceed()` is a **method that runs twice**. Neither produces an exception, a log line, or
> a failing test. This is why the `@Around` contract is the highest-value thing to review in
> an aspect, and why "did you call `proceed()` exactly once?" is the first question to ask
> about any `@Around` in a code review.

### 5.3 The Canonical Use: MDC / Trace-Id Propagation

The most common legitimate `@Around`, and the one worth being able to write from memory.

```java
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)          // run OUTSIDE everything else
public class TraceIdAspect {

    private final Tracer tracer;

    public TraceIdAspect(Tracer tracer) {
        this.tracer = tracer;
    }

    @Around("execution(* com.acme..*Controller.*(..)) || "
          + "execution(* com.acme..*Service.*(..))")
    public Object withTraceId(ProceedingJoinPoint pjp) throws Throwable {
        // 1. Capture the caller's id, if there is one.
        String incoming = MDC.get("traceId");
        String traceId  = (incoming != null) ? incoming : tracer.newTraceId();

        // 2. Publish it so logback's %X{traceId} picks it up on this thread.
        MDC.put("traceId", traceId);
        long startNanos = System.nanoTime();
        try {
            // 3. Run the target — ONCE.
            return pjp.proceed();
        } finally {
            // 4. Restore, always. A `finally` is the only correct home for this.
            long elapsed = System.nanoTime() - startNanos;
            MDC.put("traceId.elapsedMs", String.valueOf(elapsed / 1_000_000));
            log.info("{} {} took {}ms",
                     pjp.getSignature().getDeclaringType().getSimpleName(),
                     pjp.getSignature().getName(),
                     elapsed / 1_000_000);
            if (incoming != null) {
                MDC.put("traceId", incoming);
            } else {
                MDC.remove("traceId");     // ← remove, never just put
            }
        }
    }
}
```

Four details separate this from a version that works in development and leaks in production:

1. **The `finally`.** Without it, an exception leaves the `traceId` in the MDC and every
   subsequent log line on that pooled Tomcat thread carries a stale id. With Tomcat's
   200-thread default pool, that is 200 threads permanently mislabelled, and it self-heals
   only when the server restarts.
2. **Restore, don't just set.** On an inbound call you are borrowing a thread's MDC from the
   caller; you must put back what was there, not leave yours.
3. **The ordering annotation.** This aspect must be the *outermost* one, or it will record a
   trace id that excludes the transaction and security interceptors. This is Chapter 6.
4. **The thread-boundary caveat.** `MDC` is a `ThreadLocal`. The moment the call crosses onto
   another thread — `@Async`, a `CompletableFuture`, a parallel stream, a scheduled task —
   the trace id is gone. The fix is a `TaskDecorator` on the executor or Micrometer's context
   propagation, not a better aspect.

> **PRODUCTION SCENARIO**
>
> Problem: for roughly 5% of requests, every log line carried the **same** trace id, and
> the ids belonged to completely unrelated users. Support could not reconstruct a single
> failing request.
> Investigation: a `MDC.remove` was missing from a `finally` in a tracing aspect, and the
> pool had 200 threads. Whichever request happened to be the first to hit that thread after
> an exception kept the id, and the thread served that stale id to every subsequent request.
> Root cause: a `ThreadLocal` set on a pooled thread and never cleared, with the number of
> affected requests being a function of pool size and error rate rather than of anything in
> the code path.
> Solution: `MDC.clear()` in the `finally` — always, unconditionally, and regardless of
> whether the id was generated or inherited.
> Prevention: treat every `ThreadLocal` write in request-scoped code as requiring a matching
> `finally` that removes it. A static-analysis rule catches the pattern; code review catches
> it only if someone asks the right question.

### 5.4 The Canonical Use: Timing Metrics

```java
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class TimingAspect {

    private final MeterRegistry registry;
    private final Map<String, Timer> timers = new ConcurrentHashMap<>();
    private final String serviceName;

    public TimingAspect(MeterRegistry registry, Environment env) {
        this.registry = registry;
        this.serviceName = env.getProperty("spring.application.name", "app");
    }

    @Around("execution(public * com.acme..*Service.*(..))")
    public Object time(ProceedingJoinPoint pjp) throws Throwable {
        String key = pjp.getSignature().getDeclaringType().getSimpleName()
                   + "." + pjp.getSignature().getName();

        // ⚠ The timer is a *single* object reused across calls, so the sample is shared.
        //   That is the point: you are accumulating a distribution, not logging per call.
        Timer timer = timers.computeIfAbsent(key, k ->
            Timer.builder(k)
                 .tag("app", serviceName)
                 .publishPercentiles(0.5, 0.95, 0.99)     // buckets the tail for you
                 .register(registry));

        // Start the STOPWATCH here — after the lookup, immediately before proceed().
        return Timer.Sample.start(registry)
                     .stop(timer);   // ← no. This measures nothing useful; see below.
    }
}
```

The last three lines are a mistake, and the corrected version is the one to remember:

```java
@Around("execution(public * com.acme..*Service.*(..))")
public Object time(ProceedingJoinPoint pjp) throws Throwable {
    String key = pjp.getSignature().getDeclaringType().getSimpleName()
               + "." + pjp.getSignature().getName();

    Timer timer = timers.computeIfAbsent(key, k ->
        Timer.builder(k).tag("app", serviceName)
             .publishPercentiles(0.5, 0.95, 0.99).register(registry));

    long start = System.nanoTime();
    try {
        return pjp.proceed();                 // ONCE, and the return value is returned
    } finally {
        long elapsedNanos = System.nanoTime() - start;
        timer.record(elapsedNanos, TimeUnit.NANOSECONDS);
    }
}
```

Three things about the corrected version are load-bearing:

- **`System.nanoTime()`, never `currentTimeMillis()`.** `nanoTime` is monotonic;
  `currentTimeMillis` is wall-clock and jumps backwards on NTP adjustment, which produces
  negative durations and a corrupted histogram that nobody can explain.
- **The `try/finally`, not a straight-line pair.** Without it, exceptions are not recorded at
  all and your dashboard shows a service that only succeeds.
- **A `Timer` per method signature, not a log line per call.** A per-call log at 10,000
  calls/second is 864 million log lines a day, which is both a performance problem and a
  storage bill. A Micrometer `Timer` is a `LongAdder`-backed accumulator that costs
  nanoseconds.

> **INTERVIEW TRAP — "WHY NOT JUST USE `@Timed`?"**
>
> Micrometer's `@Timed` exists and is the right answer *for the body of a method*. It is not
> equivalent to an `@Around` timing aspect for three reasons worth naming: **first**, it
> annotates the method rather than a pointcut, so applying it to a package means touching
> every class; **second**, it does not compose with ordering — you cannot make it the
> outermost interceptor, so it will time only the work *inside* the transaction and security
> chain, which is a systematically lower number than what the caller experienced; **third**,
> it gives you no hook to attach a trace id or a tenant tag dynamically. The honest summary:
> `@Timed` is better for instrumenting your own code, an `@Around` aspect is better for
> instrumenting code you do not own, and the aspect is worse at everything else.

### 5.5 The Other Canonical Uses: Retry and Cache

```java
// RETRY — the clearest legitimate use of a second proceed()
@Around("@annotation(com.acme.Retryable)")
public Object retry(ProceedingJoinPoint pjp) throws Throwable {
    Retryable cfg = pjp.getMethod().getAnnotation(Retryable.class);
    int attempts = cfg.attempts();

    for (int i = 1; ; i++) {
        try {
            return pjp.proceed();          // a retry is a DELIBERATE second call
        } catch (Exception ex) {
            if (i >= attempts || !isRetryable(ex)) {
                throw ex;                  // rethrow on the last attempt — never swallow
            }
            backoff(i);
        }
    }
}
```

This is the one case where calling `proceed()` more than once is correct, and the reason the
rule is stated as "exactly once **or deliberately not at all**" rather than as an absolute.
The safety properties that make it legitimate: the call is inside a loop with a bounded
counter, the exception is rethrown on the final attempt, and the retryable exceptions are
whitelisted rather than caught broadly.

```java
// CACHE — @Around is the right shape because you can choose not to call the target at all
@Around("execution(* com.acme..CatalogLookup.lookup(..))")
public Object cached(ProceedingJoinPoint pjp) throws Throwable {
    String key = keyGenerator.generate(pjp.getArgs());
    CatalogEntry hit = cache.get(key);
    if (hit != null) {
        return hit;                        // ⚠ the "zero proceed()" case — DELIBERATE
    }
    Object fresh = pjp.proceed();
    cache.put(key, fresh);
    return fresh;
}
```

The cache aspect is the cleanest illustration of the whole subject: a "forgotten" `proceed()`
here is a feature, a "forgotten" `proceed()` in a logging aspect is a bug, and the difference
between the two is entirely in the reader's head. That is precisely the argument from
Chapter 1 — an aspect is invisible, and its correctness depends on an inference no reader of
the target class can make.

> **SCALING REALITY CHECK**
>
> **`@Around` is a synchronous interceptor.** It runs on the calling thread and it runs
> *around* everything else in the chain, so anything that blocks in an `@Around` holds the
> request thread for its full duration. With Tomcat's default 200 threads, an `@Around` that
> calls a 500ms downstream service on a path hit at 300 requests/second saturates the pool in
> under a second and the application stops accepting — not because of a leak, but because the
> arithmetic is: `200 threads ÷ 0.5s per call = 400 calls/second` is the ceiling, and any
> concurrency above that queues forever.
>
> The rules that follow. **One:** an `@Around` that makes a network call is a latency
> decision, and it belongs on a small number of methods, not on `*Service.*(..)`. **Two:**
> an `@Around` on a hot path pays the chain cost on every call, so measure before adding one
> more. **Three:** in a reactive application (Volume 10) a blocking `@Around` is worse than
> wrong — it blocks an event-loop thread and can stall every request multiplexed onto it, so
> the equivalent advice must be non-blocking. **Four:** an `@Around` that acquires a lock or
> a semaphore converts a local delay into a system-wide one, and lock ordering between two
> aspects that both take locks is a deadlock waiting for the day the call graph changes.

#### Common Mistakes

- Forgetting `proceed()` in a logging or metrics aspect. The method silently does nothing,
  returns `null`, and no test catches it.
- Calling `proceed()` twice for a reason that is not a deliberate retry. Every call to the
  target is a real-world effect.
- Catching an exception and not rethrowing it. A failed payment becomes a successful order.
- Timing with `currentTimeMillis()` instead of `System.nanoTime()`. NTP adjustment produces
  negative durations.
- Measuring outside a `try/finally`, so failures are never recorded.
- Logging a line per call on a hot method — 10,000 calls/second is 864 million lines a day.
- `MDC.put` without a matching `MDC.remove` in a `finally` on a pooled thread.
- Putting a blocking call inside an `@Around` on a broad pointcut.

#### Interview Questions — The `proceed()` Contract

**Q1. What are the obligations when writing an `@Around` advice method?** `TRICKY`

Call `proceed()` exactly once — or deliberately zero times (a cache) or in a bounded loop (a
retry). Rethrow any exception unless you are deliberately swallowing it, which means either
not catching it or catching and rethrowing. Capture the return value if you need it. Put
timing or cleanup in a `finally` so the exception path is covered. And never block, because
`@Around` runs synchronously on the caller's thread.

**Q2. A developer writes `@Around` advice that logs the call but forgets `proceed()`. What
happens at runtime?** `TRICKY`

The target method never executes. The caller receives whatever the advice returns, which
with no `return` statement is `null` for a non-void method. There is no exception, no log
line, and no failing test — the method simply stops working, and only the callers that
depend on its side effect notice. This is the single most destructive omission in AOP and
the first question to ask about any `@Around` in review.

**Q3. Why do you need `Object result = pjp.proceed()` rather than just `pjp.proceed()`?**
`TRICKY`

`proceed()` has a return value — the target method's return value. Discarding it means the
caller receives `null` for a non-void method. If the advice is only logging and has no
`return` statement, the method's result is lost even though the method ran. That is a bug
that presents as an NPE somewhere else, usually several frames away.

**Q4. When is calling `proceed()` more than once correct?** `ADVANCED`

In a bounded retry loop, where the number of attempts is capped and the exception is rethrown
on the final attempt. That is the only legitimate form, and it is legitimate precisely
because it is recognisable: a loop, a bound, a whitelist of retryable exceptions, and a
rethrow. The same shape appears in a circuit breaker. What is never legitimate is a second
`proceed()` on the same path without a bound, because each one is a real side effect — a
charge, an insert, an email.

**Q5. An `@Around` aspect on all service methods made p99 latency triple under load. What
do you check first?** `SCALING REALITY CHECK`

Whether the advice blocks. The chain cost of a proxy hop is tens of nanoseconds and cannot
triple a p99; what can is I/O. Look for a network call, a lock, a `Future.get()`, or a
logging call that flushes — inside the advice body. Then check the pointcut width: an
`@Around` on `com.acme..*Service.*(..)` that adds 200ms to 40 services is 200ms × every
request, and the connection pool exhaustion and thread starvation that follow look like a
completely different problem. The arithmetic to hold onto is 200 Tomcat threads ÷ per-call
latency = the hard ceiling on throughput.

**Q6. Your `MDC`-based trace aspect leaks trace ids between requests. What is the
mechanism and the fix?** `SCENARIO`

`MDC` is a `ThreadLocal` and Tomcat's threads are pooled and reused. If the aspect sets the
value and does not remove it in a `finally`, whichever request next lands on that thread
inherits the stale id — and every log line it produces is mislabelled. The pool size (200 by
default) and the error rate, not the code path, determine how many requests are affected,
which is why it looks intermittent. Fix: `MDC.clear()` unconditionally in a `finally`,
restoring the inbound value if there was one. The same reasoning applies to any
`ThreadLocal` written in request-scoped code.

**Q7. Is an `@Around` caching aspect the right design, or should caching live in the
service?** `STAFF`

Both are legitimate and they are not equivalent. The service knows what is cacheable and
can be tested directly; the aspect applies uniformly and can be switched off globally for an
incident. The aspect's costs are real: a cache key derived from `pjp.getArgs()` silently
breaks on a `hashCode`/`equals` that was not designed for it, invalidation becomes implicit
and therefore invisible, and a cached value that should have been tenant-scoped leaks across
tenants. The staff answer is that caching is a good aspect candidate *if and only if* the
cache is genuinely uniform across the matched methods — otherwise it belongs in the service
where the key and the invalidation are visible.

> **CHAPTER 5 SUMMARY**
>
> `@Around` is the only advice that controls whether the target runs, and that makes its
> contract the most dangerous in the framework: a missing `proceed()` is a method that
> silently does nothing, and a duplicated one is a method that runs twice — neither producing
> an error, a log line, or a failing test. The legitimate deviations (a cache that skips the
> call, a bounded retry that repeats it) are legitimate only because they are *visible* as
> such, which is the whole problem with an invisible advice body. `Object result = proceed()`
> is necessary whenever you need the value, exceptions propagate automatically if you declare
> `throws Throwable` and do not catch, timing belongs in a `finally` and must use
> `System.nanoTime()`, and — the scaling fact that constrains every decision — **`@Around` is
> a synchronous interceptor on the caller's thread**, so with Tomcat's 200 threads a 500ms
> blocking advice caps the application at 400 calls/second.

#### Further Reading

- [Spring Framework Reference — Advice API in Spring](https://docs.spring.io/spring-framework/reference/core/aop-api/advice.html) — `MethodInterceptor`, `ProceedingJoinPoint`, `MethodInvocation.proceed()`, and what each advice type can do.
- [Micrometer Documentation](https://micrometer.io/docs/) — the `Timer`, `LongTaskTimer` and percentile APIs, which is where the timing-aspect example belongs in production.
- [Micrometer — Context Propagation](https://docs.micrometer.io/context-propagation/reference/) — the correct answer to "the MDC did not survive the thread hop", and the reason the MDC advice needs a companion on the executor.
- [Martin Fowler — Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html) — the canonical shape for the retry and circuit-breaker `@Around` bodies, and the failure modes to design for.

## Chapter 6 — Aspect Ordering

### 6.1 The Rule, and the Inversion

> **Lower value = higher precedence = runs first on the way in, and LAST on the way out.**

`@Order` follows the same convention as everything else in Spring: `Ordered.HIGHEST_PRECEDENCE`
is `Integer.MIN_VALUE`, `Ordered.LOWEST_PRECEDENCE` is `Integer.MAX_VALUE`, and unannotated
aspects sort last, i.e. at `LOWEST_PRECEDENCE`. The subtlety is that *precedence* describes
entry order, and Spring builds the interceptor chain so that the highest-precedence aspect is
**outermost** — which means it is entered first and exited last.

```text
Aspect A:  @Order(1)      ← LOWER value = HIGHER precedence = OUTERMOST
Aspect B:  @Order(50)
Aspect C:  @Order(100)    ← HIGHER value = LOWER precedence = INNERMOST

  A.before  ──────►  B.before  ──────►  C.before  ──────►  target
  A.after   ◄──────  B.after   ◄──────  C.after   ◄──────
                 ▲                                              ▲
                 └── unwinding runs the OUTSIDE last ─────────┘
```

The confusion this produces is worth naming, because it is the standard interview trap:

| | Entering | Exiting |
| --- | --- | --- |
| `@Order(1)` — highest precedence | Runs **first** | Runs **last** |
| `@Order(100)` — lowest precedence | Runs **last** | Runs **first** |

So if you read `@Order` as "how important is this", you have the direction backwards for
exit code. A `@Before` reads naturally; an `@After`, `@AfterThrowing` or an `@Around`'s
post-`proceed()` section does not.

`@Order` and implementing `Ordered` are equivalent. Both are read by
`AnnotationAwareOrderComparator` (formerly `AspectJAwareOrderComparator`), and `@Order`
wins when both are present:

```java
@Aspect
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)      // -2147483638 — effectively first
public class TracingAspect { }

@Aspect
@Component
@Order(Ordered.LOWEST_PRECEDENCE)            // 2147483647 — effectively last
public class MetricsAspect { }
```

### 6.2 Why This Is Not a Tidy Idea

Look at how the two highest-value cross-cutting concerns are ordered **by default**, and
notice that neither chose this deliberately:

```text
@Transactional          ── @EnableTransactionManagement(order = LOWEST_PRECEDENCE)
   ⇒ order = Integer.MAX_VALUE  ⇒ INNERMOST  ⇒ a commit happens INSIDE it

@PreAuthorize            ── @EnableMethodSecurity, no default order
   ⇒ LOWEST_PRECEDENCE       ⇒ INNERMOST  ⇒ the check runs INSIDE it
```

Both are innermost. That is a defensible default — the transaction wraps the smallest
possible amount of business work — but it means the transaction interceptor sits *inside*
every other advice you write unless you deliberately move it out, and the consequences in
6.3 are the direct result.

To make the transaction outermost — which is what you want if anything outside it must
observe the committed outcome — you set its order explicitly, and **lower than everything
else**:

```java
@Configuration
@EnableTransactionManagement(order = Ordered.HIGHEST_PRECEDENCE)   // outermost
public class TxConfig { }
```

> **INTERVIEW TRAP**
>
> "Higher `@Order` value means higher priority" is the answer that gets this wrong, and
> people believe it because `@Order` reads like a ranking where 1 is first and 10 is tenth.
> The correction, stated once and remembered: **`Ordered.HIGHEST_PRECEDENCE` is
> `Integer.MIN_VALUE`**, not `1`. Lower value, higher precedence, outermost position, first
> on the way in, last on the way out. The version of the question that actually tests
> understanding is the follow-up: *"given `@Order(1)` on aspect A and `@Order(2)` on aspect
> B, which one's `@AfterThrowing` runs first?"* The answer is **B's**, because B is inner
> and the exception unwinds from the inside out. Candidates who answer A have the direction
> of the unwind wrong, and that is the mistake that produces the bug in 6.3.

### 6.3 What Is Guaranteed, and What Is Not

**Guaranteed:**

- Aspects with explicit `@Order` are sorted relative to each other, and the order is
  **total** among aspects that declare one.
- The highest-precedence aspect is the outermost, so its exit logic runs last.
- Once the chain is built, it is fixed — a `Singleton` advisor's order does not change at
  runtime.
- `Ordered.HIGHEST_PRECEDENCE` aspects are outside `Ordered.LOWEST_PRECEDENCE` aspects, and
  unannotated aspects are effectively `LOWEST_PRECEDENCE`.

**NOT guaranteed:**

- **The relative order of two aspects with the same `@Order` value.** AspectJ then falls back
  to its own precedence rules, and the result is not something to design around. If two
  aspects must be ordered relative to each other, give them different values.
- **The order of advisors on the same aspect**, and the order of a framework advisor
  (`@Transactional`, `@Async`, `@Cacheable`, `@Retryable`) relative to yours, unless you have
  set the framework's order explicitly. `@Async` and `@Cacheable` both use
  `Ordered.LOWEST_PRECEDENCE` by default, which means they are *inner* relative to any
  aspect you wrote — and `@Async`'s position is what determines whether your timing aspect
  measures the async submission or the eventual completion.
- **That an aspect applies at all**, which is the pointcut question (Chapter 4), not the
  ordering question.
- **Order across proxies.** A bean proxied for two unrelated reasons is proxied once with a
  combined advisor list, and the list is built once. Nothing recomputes it.

### 6.4 The Classic Bug: Logging a Commit That Rolls Back

The scenario worth memorising, because it is a genuine incident template and the fix is a
single annotation.

```java
// Two aspects. Neither author has thought about the other.

@Aspect @Component @Order(10)                       // outer
class AuditAspect {
    @Around("execution(* com.acme..OrderService.*(..))")
    public Object audit(ProceedingJoinPoint pjp) throws Throwable {
        try {
            Object r = pjp.proceed();
            auditLog.write("ORDER " + pjp.getArgs()[0] + " SUCCEEDED");   // ← records success
            return r;
        } catch (Throwable t) {
            auditLog.write("ORDER FAILED");
            throw t;
        }
    }
}

@Service
class OrderService {
    @Transactional                      // ⚠ @EnableTransactionManagement default order
    public void place(Order o) {         //    = LOWEST_PRECEDENCE = INNERMOST
        orders.save(o);
        paymentGateway.charge(o);        // throws → transaction rolls back
    }
}
```

```text
Order arrives
  │
  ▼
AuditAspect            @Order(10)   ── writes "SUCCEEDED" ─────┐
  │                                                        │
  ▼                                                        │  ✘ written BEFORE
TransactionInterceptor  (innermost)                          │    the outcome
  │                                                        │    is known
  ▼                                                        │
OrderServiceImpl.place(..)                                  │
  │  paymentGateway.charge(..)  →  throws                   │
  ▼                                                        │
TransactionInterceptor  ── ROLLBACK ────────────►           │
  │                                                        │
  ▼                                                        ▼
AuditAspect            ── (the "catch" runs, but the
                          SUCCEEDED line is already
                          committed to the audit log)
```

The audit log now contains a durable, timestamped record that a payment succeeded, for an
order that was rolled back. If the audit log is what compliance and reconciliation read, that
is not a metrics bug — it is a false record in a system of record, and it will be discovered
by a finance team rather than by an engineer.

**The fix is one annotation**, and understanding *which* value it needs is the whole chapter:

```java
@Configuration
@EnableTransactionManagement(order = Ordered.HIGHEST_PRECEDENCE)   // tx becomes OUTERMOST
public class TxConfig { }
```

```text
AuditAspect                  @Order(10)   ── inner
  │
  ▼
TransactionInterceptor       (now OUTERMOST)
  │  BEGIN
  ▼
AuditAspect's advice body
  │
  ▼
OrderServiceImpl.place(..)   → throws
  │
  ▼
TransactionInterceptor  ── ROLLBACK ──► COMMIT FAILS HERE
  │                                        │
  ▼                                        ▼
AuditAspect            ── never sees success; the exception
                          propagates out through it
```

Now the audit aspect can only write SUCCEEDED after the transaction has returned, which means
the commit has already succeeded. The ordering was the bug, and ordering was a string in a
different file.

**The general rule this yields:** *anything that makes a durable record of an outcome must be
OUTSIDE the transaction interceptor.* If it is inside, it is recording an intent, not an
outcome, and calling it `SUCCEEDED` is a lie. That applies equally to metrics, audit rows,
webhook enqueues, cache invalidation and "order created" events — all of which belong outside
the transaction, which is exactly why `@TransactionalEventListener(AFTER_COMMIT)` exists
(Volume 1, Chapter 6).

> **PRODUCTION RELEVANCE**
>
> The uncomfortable part of this chapter is that **ordering is invisible until the day it
> matters.** In development, with one aspect, with transactions that commit, with low volume,
> any order produces plausible output. The bug surfaces when a commit fails under a specific
> combination — usually a database failover, a lock timeout, or a deferred constraint — which
> is a production-only, low-frequency event. The consequence is that the team's model of
> their own system is wrong, and they do not know it is wrong, because the code has never
> told them anything.
>
> The organisational answer is to make ordering an explicit, reviewed artefact. In practice
> that means: a short document listing the aspects in the application with their order values
> and what each one is outermost to; a code-review convention that adding a new aspect
> requires a stated position in that list; and a test that asserts the durable-effect
> behaviours run outside the transaction. Without those three things, the chain order is
> emergent, and emergent order is a latent incident.

#### Common Mistakes

- Believing a higher `@Order` value means higher priority. `HIGHEST_PRECEDENCE` is
  `Integer.MIN_VALUE`.
- Expecting an `@Order(1)` aspect's cleanup to run first. It runs last — it is outermost.
- Recording a durable success message from an aspect that is *inside* the transaction
  interceptor, and calling it an outcome when it is an intent.
- Assuming two aspects with the same `@Order` have a defined relative order. They do not.
- Assuming a framework advisor (`@Async`, `@Cacheable`) is outside your aspect because it
  "feels more fundamental." They default to `LOWEST_PRECEDENCE`, so they are inner.
- Ordering the aspects but not the pointcuts — a correct order over an aspect that matches
  nothing is still a no-op.

#### Interview Questions — Aspect Ordering

**Q1. Explain `@Order`, including the part that surprises people.** `TRICKY`

Lower value means higher precedence. `Ordered.HIGHEST_PRECEDENCE` is `Integer.MIN_VALUE` and
`LOWEST_PRECEDENCE` is `Integer.MAX_VALUE`; unannotated aspects sort at the low-precedence
end. The surprise is the interaction with the call stack: the highest-precedence aspect is
the **outermost**, so it is entered first and exited last. That means for `@Before` code,
lower value means earlier, and for `@After` and post-`proceed()` code, lower value means
**later**.

**Q2. Aspects A is `@Order(1)` and B is `@Order(2)`. Both have `@AfterThrowing`. Which
runs first when the target throws?** `TRICKY`

B's, because the exception unwinds from the inside out and B is the inner aspect. This is
the question that actually tests whether the model is right, because candidates who reason
"lower value = first" without accounting for the unwind get it wrong. The general form: for
any exit-side advice, the **highest-value** order number runs first on the way out.

**Q3. Where do `@Transactional` and your own aspect sit relative to each other by
default, and how do you change it?** `TRICKY`

`@EnableTransactionManagement(order = ...)` defaults to `Ordered.LOWEST_PRECEDENCE`, so the
transaction interceptor is **innermost** — inside any aspect you wrote unless you set an
order. To make it outermost, set
`@EnableTransactionManagement(order = Ordered.HIGHEST_PRECEDENCE)`, which is lower than any
order value your aspects use. The reason to want it outermost is that anything outside the
transaction can then observe the real outcome, including the commit.

**Q4. A PR adds an aspect that writes an audit record after the method returns. What should
the reviewer check?** `STAFF`

Three things, in order. **First:** is the aspect inside or outside the transaction
interceptor — i.e. is its `@Order` value lower or higher than the transaction's? If it is
inside, it is recording intent rather than outcome, and a commit failure produces a false
success record. **Second:** is the advice durable? An audit row written inside the transaction
rolls back with it, which is a different and also wrong bug. **Third:** is it idempotent,
given that any retry or `@Async` replay will run it again. The reviewer's question is not
"does this log" but "what does this record, and is it still true if the transaction rolls
back after it runs?"

**Q5. Two aspects both declare `@Order(1)`. Is their relative order defined?**
`ADVANCED`

No. AspectJ's own precedence rules apply, and the result is not something to design around.
The rule is that any ordering you actually depend on must be expressed with a distinct
`@Order` value — and a distinct value is cheap, so there is never a good reason to rely on
the tie-break. The broader version of the answer is that Spring guarantees a **total** order
over aspects that declare distinct values, and guarantees nothing else: not the order of
advisors on one aspect, not the position of a framework advisor relative to yours unless you
set it, and not that a given aspect applies at all.

**Q6. `@Async` is on a method and a timing aspect is on the same class. What is measured?**
`ADVANCED`

Whatever is inside the `@Async` interceptor — normally the *submission* of the task, not its
completion, because `@Async`'s advisor sits at `LOWEST_PRECEDENCE` and is therefore inner
relative to your aspect. So a "service latency" metric on an `@Async` method measures how
long it took to hand the task to the executor, which is microseconds, and it will look
suspiciously good. Measuring the actual work requires either a separate aspect inside the
async boundary or an `ExecutorServiceMetrics`/task decorator, and the discrepancy is exactly
the kind of dashboard number that a team trusts for three months before anyone checks it.

> **CHAPTER 6 SUMMARY**
>
> `@Order` is the same convention as the rest of Spring and inverted from intuition:
> **lower value, higher precedence, outermost, first in and last out.** `HIGHEST_PRECEDENCE`
> is `Integer.MIN_VALUE`, not `1`. Because the chain is nested, any exit-side advice runs in
> reverse of entry order, which is the trap that the `@AfterThrowing` question exposes. Spring
> guarantees a total order over aspects with distinct `@Order` values and nothing beyond that
> — not tie-breaks, not the position of framework advisors, not that an aspect applies. The
> canonical consequence is the audit aspect that records a success while still inside the
> transaction, producing a durable false record of a payment that rolled back; the fix is one
> annotation, and the durable lesson is that anything recording an outcome must sit outside
> the transaction interceptor. Ordering is invisible until the day a commit fails under load,
> which is why it belongs in a reviewed document rather than in the heads of the people who
> wrote the aspects.

#### Further Reading

- [Spring Framework Reference — Advice API in Spring](https://docs.spring.io/spring-framework/reference/core/aop-api/advice.html) — `MethodInterceptor` and the chain model that ordering is expressed in terms of.
- [Spring Framework Reference — Proxying Mechanisms](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — `optimize` and the `Advised` properties that govern how the advisor list is built and frozen.
- [Spring Framework Reference — Declarative Transaction Management](https://docs.spring.io/spring-framework/reference/data-access/transaction/declarative.html) — the `order` attribute of `@EnableTransactionManagement`, which is the setting that decides the transaction interceptor's position in the chain.

## Chapter 7 — AOP Pitfalls & Why They Exist

This is the chapter the volume exists for. Every item below is a consequence of one decision
— **Spring AOP substitutes a proxy rather than weaving bytecode** — and every one of them
fails *silently*. No exception, no log line, no failing test. The method runs. The advice
does not.

### 7.1 Self-Invocation — the Big One

```java
@Service
public class OrderService {

    @Transactional                       // ← looks completely correct
    public void place(Order order) {
        audit("place");
        validate(order);
        applyDiscount(order);            // ⚠ internal call
        orders.save(order);
    }

    private void applyDiscount(Order order) {
        if (order.isMember()) { order.discount(); }
        else { order.tax(); }
    }

    // The real-world shape: a public @Transactional method calling another.
    public void placeBulk(List<Order> orders) {
        orders.forEach(this::place);     // ⚠ also an internal call
    }
}
```

The trace, with the proxy drawn in, is the whole explanation:

```text
CORRECT PATH — an EXTERNAL caller

  OrderController
       │
       │  autowired reference is the PROXY
       ▼
  ┌──────────────┐
  │ $Proxy42     │
  │  .place()    │  ──► intercept ──► TRANSACTION ADVISOR  ──► BEGIN
  └──────────────┘                                          │
                                                            ▼
                                                  OrderServiceImpl.place()
                                                            │
                                              ┌─────────────┴─────────────┐
                                              ▼                           ▼
                                    this.applyDiscount()        orders.save()
                                    ⚠ DIRECT.  this == the
                                      target, not the proxy.
                                      The proxy is bypassed
                                      entirely.  No advice.
```

The precise mechanism: inside `place()`, the object `this` is the **target**, not the proxy.
The proxy is a different object that delegates to the target; the target has no reference
back to it. So `this.applyDiscount()` is a plain Java method call on a plain object, and
there is no proxy anywhere in its path.

Three consequences, and only the first is commonly known:

1. `@Transactional` does not apply. No transaction is opened.
2. `@PreAuthorize` does not apply. **The authorisation check does not run.**
3. `@Async` does not apply. The method runs synchronously on the caller's thread.
4. `@Cacheable` does not apply, and neither does `@Retryable`.

```java
@Service
public class OrderService {

    private final OrderRepository orders;

    public void placeBulk(List<Order> orders) {
        this.orders = orders;
    }

    @Transactional
    public void place(Order order) {
        orders.save(order);
    }

    public void placeAll(List<Order> batch) {         // NOT annotated — correctly
        batch.forEach(this::place);                   // ⚠ 200 saves, 200 auto-commits
    }
}
```

That is the production shape: 200 inserts, 200 separate transactions, and if insert 137
fails, 136 rows are already committed. The report says "partial order". Nobody is looking for
it because every individual `save` did exactly what it was told.

**The two fixes, with their real costs:**

```java
// FIX 1 — inject a reference to the proxy. @Lazy breaks the construction cycle.
@Service
public class OrderService {

    @Lazy                                  // a lazy-resolution proxy for self-injection
    @Autowired
    private OrderService self;             // ⚠ self-injection — see the costs

    @Transactional
    public void place(Order order) {
        orders.save(order);
    }

    public void placeAll(List<Order> batch) {
        batch.forEach(self::place);        // ✅ goes back out through the proxy
    }
}
```

| | Fix 1: inject self via `@Lazy` | Fix 2: restructure — extract the advised part into its own bean |
| --- | --- | --- |
| Code change | One field, one annotation | A new class; the caller is changed |
| Understandability | **Poor.** A class injecting itself is deeply confusing to a reader | Clear — the dependency is real and explicit |
| Testability | Needs a container; `new OrderService()` will not have `self` | Both classes unit-test with plain `new` |
| Failure mode if forgotten | `NullPointerException` on `self` in a unit test | None |
| Works for private methods | **No** — the proxy still cannot see a private method | n/a |
| When it is right | A contained fix when you cannot change the callers | **The default answer** |

```java
// FIX 2 — extract. The transaction lands where it belongs, and it is testable.
@Service
public class OrderWriter {                 // the thing that must be transactional

    private final OrderRepository orders;

    @Transactional
    public void write(Order order) {
        orders.save(order);
    }
}

@Service
public class OrderService {

    private final OrderWriter writer;      // a real, visible dependency

    public OrderService(OrderWriter writer) { this.writer = writer; }

    public void place(Order order) { writer.write(order); }
}
```

**Fix 2 is the right answer**, and the reason is not aesthetic. A self-injected reference is
a self-injected reference: the class appears to depend on nothing, the container is doing
something non-obvious to make it work, and a unit test with a plain `new` will throw an NPE.
Fix 2 makes the transaction boundary a first-class object you can name, inject, mock and
point at in a design review.

> **PRODUCTION SCENARIO**
>
> Problem: a nightly reconciliation reported ~4% of orders missing their line items, and
> the pattern was always the same: orders whose largest line item had a quantity over 100.
> No exception, no error rate change, and the discrepancy was invisible for eleven weeks
> because nothing downstream noticed the partial writes.
> Investigation: a repository call in `OrderService.persist(..)` invoked
> `lineItemWriter.saveAll(..)` internally, and that method was `@Transactional`. The outer
> method was not, and was called from another method in the same class, so no transaction
> was ever opened. The quantity filter was a red herring — it was the only path where the
> second write could fail and leave a partial state.
> Root cause: self-invocation bypassing the proxy, exactly as Chapter 1 and 2 predicted. The
> test suite passed because every test called the service from outside, through the
> container, where the proxy *was* in the path.
> Solution: extract `LineItemWriter` as its own bean with its own `@Transactional` boundary,
> and make the outer method explicitly define what it wants (one transaction for the whole
> aggregate, or per item — the decision was per item, for throughput).
> Prevention: an ArchUnit rule that fails the build if a method carrying a Spring
> cross-cutting annotation is invoked via `this.` — the *call*, not the declaration, which is
> the part no IDE rule catches on its own.

### 7.2 `private`, `static` and `final` Methods

| | Why CGLIB cannot | Why a JDK proxy cannot |
| --- | --- | --- |
| `private` | The proxy is a **different class**. `private` members are not inherited, so the proxy has no way to see them | Not on the interface |
| `static` | Belongs to the class, not an instance. An instance proxy has no instance to invoke it on | Not on the interface |
| `final` | A subclass **cannot override** a `final` method, so the interceptor is never entered | Not on the interface |

```java
@Service
public class ReportService {

    @Transactional                       // ⚠ NO EFFECT — private
    private void generateInternal(...) { }

    @Transactional                       // ⚠ NO EFFECT — static
    public static void generateBatch(...) { }

    @Transactional                       // ⚠ NO EFFECT — final
    public final void generate(...) { }

    @Transactional                       // ✅ works
    public void generatePublic(...) { }
}
```

Two of these deserve a note because they look fixable and are not. `static` methods can be
made adviseable by moving them onto a bean — the advice works, the `@Transactional` applies —
but the cost is that the "static" utility is now a Spring-managed object with a lifecycle and
a test-time context, and a plain `new ReportService()` in a unit test no longer provides it.
And `private` is fixable by widening to package-private, which CGLIB *can* override if the
package matches, but the reason to do it is a proxy, which is not a reason that survives code
review.

> **INTERVIEW TRAP**
>
> "Make it `public`" is the reflex, and it is right more often than not — but the real answer
> names the mechanism. A private method cannot be advised because the proxy is a different
> class and private members are not inherited. Widening to `protected` or package-private
> fixes the CGLIB case *provided the package matches*; making it `public` fixes it
> unconditionally but exposes it as part of the bean's API. The genuinely good answer for a
> private `@Transactional` helper is: **move it to another bean.** A private method that
> needs a transaction is a method that is doing something a collaborator should be doing, and
> the fact that it is private is the design telling you so.

### 7.3 `final` Classes, `record`, and Kotlin `data class`

CGLIB works by generating a **subclass**. A `final` class cannot be subclassed, so it cannot
be proxied. This is a hard failure, and it fails at the most annoying possible moment:

```text
org.springframework.cglib.core.ReflectiveOperationException:
  Cannot subclass final class com.acme.report.FiscalReport
```

```java
public record FiscalReport(String id, BigDecimal total) { }   // ⚠ implicit final

public final class FiscalReport { }                           // ⚠ cannot be advised
```

The `record` case is the one that catches experienced teams out, because the language
feature that makes records attractive — immutability by construction — is exactly the
property that makes them un-proxyable. **Every `record` is `final`.** So is every Kotlin
`data class` by default (Kotlin classes are final unless declared `open`). And a `final` class
in Java is not a style preference in a Spring application; it is a declaration that this bean
cannot participate in transactions, security, caching, retry or metrics.

```kotlin
// Kotlin: a `data class` proxy target
data class Report(val id: String, val total: BigDecimal)

// Kotlin: make it proxyable
open class Report(val id: String, val total: BigDecimal)

@Component
open class ReportWriter {                  // ⚠ components must be `open` too
    @Transactional
    fun write(r: Report) { }
}
```

The fix is mechanical — remove `final`, add `open` — and the reason to care is that it is
never discovered until the annotation is added, at which point the failure is a startup
exception naming a class someone wrote two years ago. This is the exact case for the ArchUnit
rule proposed in Chapter 2.

### 7.4 `equals`, `hashCode` and `toString`

These three are the ones nobody thinks about, and they are where a proxy stops being a
transparent substitute for its target.

```java
@Service
public class TenantContext { }

Map<TenantContext, Region> regions = new HashMap<>();
regions.put(tenantContext, EU);              // ⚠ key is a PROXY
regions.get(realContext);                    // → null, if equals doesn't delegate
```

CGLIB generates **two special interceptors** for exactly this reason, and they are worth
reading in the source (`CglibAopProxy`):

```java
private static class EqualsInterceptor implements MethodInterceptor, Serializable {
    @Override
    public Object intercept(Object proxy, Method method, Object[] args, MethodProxy mp) {
        // Only route to the target when equals() is declared on Object itself.
        // A target that OVERRIDES equals() gets its own advice if it matches the pointcut.
        if (!equals.equals(method)) {
            return mp.invokeSuper(proxy, args);
        }
        return (proxy == args[0] ? Boolean.TRUE : equals.invoke(args[0], EMPTY_ARGS));
    }
}

private static class HashCodeInterceptor implements MethodInterceptor, Serializable {
    @Override
    public Object intercept(Object proxy, Method method, Object[] args, MethodProxy mp) {
        if (!hashCode.equals(method)) return mp.invokeSuper(proxy, args);
        return hashCode.invoke(args[0], EMPTY_ARGS);
    }
}
```

The condition is `!equals.equals(method)` — **only `Object`'s `equals` is delegated to the
target.** If the target class **overrides** `equals()` and that override matches a pointcut,
the aspect handles it instead, and now the two `equals` implementations are different
objects. The consequences:

| Situation | What happens |
| --- | --- |
| Target does not override `equals` | Built-in interceptor delegates → proxy equals the target. Correct |
| Target overrides `equals`, no matching advice | CGLIB's `equals` is not advised, so the target's `equals` runs. Correct |
| Target overrides `equals`, **and a pointcut matches it** | The aspect's advice runs instead of the target's `equals` → the proxy is no longer equal to the target. **Broken** |
| Proxy used as a `HashMap` key, target has no `equals` | `HashCodeInterceptor` delegates, so the proxy hashes as the target. Correct |
| Proxy used as a `HashSet` member, target has no `equals` | Same. Correct |
| `toString()` | **Not intercepted at all** — `mp.invokeSuper` calls the *proxy's* generated `toString`, which prints the proxy class name |

That last row is a genuine operational annoyance. Under CGLIB, `log.info("{}", bean)` on an
advised bean logs something like `com.acme.TenantService$$SpringCGLIB$$0@1f2e3d` rather than
a useful description — which is why log statements in a proxied codebase sometimes show
obfuscated class names, and why someone eventually adds a `toString()` override and is
surprised it does not help.

`hashCode` also has a second-order effect people hit with Spring Security's
`UsernamePasswordAuthenticationToken` and with `@Cacheable` keys: two invocations that return
the "same" logical object return **two different proxies** with different identity
hashcodes, so a cache keyed on the object never hits.

### 7.5 Serialization

A proxy is a distinct object, and it carries state that the target does not — a reference
back to the target, the `TargetSource`, and the advisor chain. If the target is serializable
and the proxy is not, the write succeeds and the read fails.

```text
java.io.NotSerializableException: com.acme.report.FiscalReport$$SpringCGLIB$$0

Caused by: an object stored in a session-scoped bean is the PROXY,
           and the proxy's class was never made Serializable
```

The classic production shape is a session-scoped or a `@Cacheable`d DTO that also happens
to be a Spring bean:

```text
  HTTP request 1                     HTTP request 2 (or a session replay)
       │                                     │
       ▼                                     ▼
  proxy (advised, NOT serializable)  ──serialize──► NotSerializableException
```

The fixes, in order of preference:

1. **Do not put beans in sessions.** Store identifiers, not objects. This is the real answer
   and it also removes a class of stale-state bugs.
2. **Make the target `Serializable` and proxy JDK-style**, so the proxy's interfaces are all
   `Serializable` — which is why a JDK proxy is serializable when its target is.
3. **Register a custom `ObjectInputStream` / use a serialization proxy** for the specific
   case where a bean genuinely must cross a boundary.

> **PRODUCTION RELEVANCE**
>
> Serialization is a good example of the general rule for this volume: the proxy decision
> does not just change *where advice runs*, it changes the **object identity and lifecycle**
> of every advised bean. `getClass()` is different, `equals` may be different, identity
> hashcodes are different, the object is not serializable when the target is, and the stack
> trace has four extra frames. None of that is a bug in your code, and all of it is
> surprising to someone who has not internalised that "the bean in my hand is not the object
> you wrote."

### 7.6 Proxies and Generics

Referenced from Volume 1, section 2.3, and Volume 2, Chapter 2: **generics are erased at
runtime.** A JDK proxy implements an interface, and the interface's type arguments are not
recoverable from the proxy class. The result is a resolution failure that looks like a
missing bean:

```java
public interface PaymentClient { }
public class StripeClient implements PaymentClient { }

@Autowired private List<PaymentClient> clients;    // works
@Autowired private List<StripeClient> clients;     // ⚠ may resolve to EMPTY
```

With a JDK proxy for `PaymentClient`, the bean's resolvable type widens to the interface, so
a `List<StripeClient>` injection point — which Spring would otherwise satisfy from the
`@Bean` method's declared return type — finds nothing. It fails as an empty list rather than
an exception, which is worse.

This is a real part of the argument for Boot 2.0's `proxyTargetClass = true` default: a CGLIB
subclass **retains** the concrete class as its resolvable type, so generic resolution keeps
working. The flip side is the `final` constraints from 7.3. Neither proxy strategy is
dominant, which is why the framework makes it a per-bean decision via `proxyTargetClass` and
`@Scope(proxyMode = ...)`.

### 7.7 The Debuggability Cost

The non-obvious one, and the one that costs the most engineer-hours over a year, because it
does not announce itself.

```text
BEFORE AOP — every frame is a real method

  com.acme.web.OrderController.place(..)
    com.acme.order.OrderService.place(..)
      com.acme.payment.StripeClient.charge(..)          ✅ you can read this

AFTER AOP — the frames are framework machinery

  com.acme.web.OrderController.place(..)
    com.sun.proxy.$Proxy42.place(..)                     ← what is this
      org.springframework.aop.framework.CglibAopProxy$DynamicAdvisedInterceptor.intercept(..)
        org.springframework.aop.framework.ReflectiveMethodInvocation.proceed(..)
          org.springframework.aop.interceptor.AnnotationTransactionAspectSupport.invokeWithinTransaction(..)
            com.acme.order.OrderService.place(..)        ← there it is, 4 frames down
              com.acme.aspect.MetricsAspect.around(..)
                com.acme.payment.StripeClient.charge(..)
```

Every stack trace through an advised bean now contains at least three framework frames, and
`$Proxy42` tells you nothing. Anyone debugging in production reads past them, which is fine
until the frames are what you needed — a `NullPointerException` inside the advice, or
determining which aspect called your method.

The mitigations, and which is the right one depends on the question:

```java
// Q: "Is this bean actually proxied?"
AopUtils.isAopProxy(bean);                      // a boolean, no stack walking
AopProxyUtils.ultimateTargetClass(bean);         // the real class, past nested proxies

// Q: "How many advisors are on it, and what are they?"
((Advised) bean).getAdvisors();                 // the chain, in order
((Advised) bean).getProxiedInterfaces();        // what you can cast it to

// Q: "Where in the class did this get called from?"
new Throwable().getStackTrace();                // the JDK way; works through proxies

// Q: "Call a method ON the target, bypassing all advice, and keep the stack trace clean"
AopTestUtils.getTargetObject(bean);             // unwraps to the raw target
AopTestUtils.getUltimateTargetObject(bean);     // past nested proxies too

// Q: "Turn the stack-trace pollution off for a specific proxy (JDK only)"
proxyFactory.setOpaque(true);                   // hmm — read the docs; this is a real
                                                 // flag but it changes proxy identity too
```

**The one that is actually correct in production code** is `new Throwable().getStackTrace()`,
or the "log where you came from" idiom, because it costs nothing and it is the only approach
that works with both proxy strategies. The unwrapping helpers are test-harness tools. And the
deeper point for a team is that once AOP is in a codebase, **the debugger is less useful than
it was**, and a stack trace is no longer a complete description of the call path — which is
an argument for structured logging with an explicit method name, and for keeping aspects few
enough that reading one is a reasonable thing to ask of a new joiner.

### 7.8 `@Transactional` on a Method That Cannot Be Advised

The three conditions under which `@Transactional` is a **no-op that compiles, starts, and
passes every test**, with no transaction and no error:

| Condition | Why |
| --- | --- |
| The method is `private` | CGLIB cannot override it; the annotation is never read |
| The method is `final` | CGLIB cannot override it; the annotation is never read |
| The method is called via self-invocation | The call never reaches the proxy |
| The method is `static` | An instance proxy cannot intercept it |
| The class is `final` | Startup fails outright, rather than silently |
| The bean is not Spring-managed (`new`-ed) | No proxy exists |

```java
@Service
public class PaymentService {

    @Transactional                       // ⚠ private — NO TRANSACTION
    public void refundInternal(Payment p) { ledger.credit(p); }

    @Transactional                       // ⚠ self-invoked — NO TRANSACTION
    public void refund(Payment p) {
        ledger.debit(p);
        refundInternal(p);              //    one method, two writes, no transaction
    }

    @Transactional                       // ⚠ final — NO TRANSACTION
    public final void refundFinal(Payment p) { ledger.credit(p); }
}
```

There is a fourth, quieter one worth naming: `@Transactional` on a method of a class that is
not a Spring bean at all. `new PaymentService(ledger).refund(p)` opens no transaction, and
the compiler is perfectly happy. This is the reason the annotation is so dangerous in a
codebase with a service-locator style — the type carries the annotation but there is no proxy.

The full picture — propagation, isolation, read-only hints, `rollbackFor`, and why
`rollbackOnly` is a sticky flag that surprises people — is Volume 4. What belongs here is
the rule: **an annotation on a method Spring cannot intercept is not a weaker transaction,
it is no transaction at all, and the failure is silent.**

> **MUST REMEMBER**
>
> Every item in this chapter is the same fact: **the proxy has to be in the call path, and
> it only is if the caller holds the proxy rather than the target.** A `new`-ed object has no
> proxy. A self-invocation never leaves the object, so it never reaches the proxy. A
> `private` method belongs to an object the proxy cannot see. A `final` method is one a
> subclass cannot override. A `static` method has no instance for an instance proxy to
> dispatch to. Learn the one mechanism and the eight symptoms stop being eight things to
> memorise.

#### Common Mistakes

- Believing a `@Transactional` that did not apply would have produced an error. It produces
  **nothing** — the method runs, the writes commit, and the only symptom is a data
  discrepancy discovered weeks later.
- Fixing self-invocation by injecting self via `@Lazy` when a bean extraction is available.
  The first makes the class untestable with `new` and confusing to read; the second names
  the transaction boundary.
- Widening a `private` method to `public` to make an annotation work, instead of moving the
  method to a collaborator that deserves to be a bean.
- Treating `final` on a Spring bean as a style choice. It is a declaration that the bean
  cannot participate in transactions, security, caching, retry or metrics.
- Expecting `toString()` on a CGLIB-proxied bean to print anything useful. It prints the
  generated class name unless the method matches a pointcut.
- Using a proxied bean as a `HashMap` key or a `@Cacheable` key without checking that
  `equals`/`hashCode` delegate to the target.
- Serializing a bean into an HTTP session because it "worked on the CGLIB-free path".
- Reading a proxied stack trace and concluding the call did not happen, because the frame
  you are looking for is four levels below a `DynamicAdvisedInterceptor`.

#### Interview Questions — AOP Pitfalls

**Q1. A `@Transactional` method runs with no transaction. Enumerate every possible
cause.** `TRICKY`

The method is `private`, `final` or `static`; the class is `final` (which fails at startup
rather than silently); the method is called via self-invocation; the method is called on a
bean that was created with `new` or a static factory rather than by the container; or the
annotation is on an implementation method that is invoked through a JDK proxy, so it is not
even on an interface the proxy implements. The first three are the common ones, and all of
them are silent — the method runs and the writes commit.

**Q2. Explain self-invocation and why it defeats the proxy.** `TRICKY`

Inside an instance method, `this` refers to the **target**, not the proxy — the proxy is a
separate object that delegates to the target, and the target holds no reference back to it.
So `this.advisedMethod()` is a plain Java call that never touches the proxy, and no
interceptor is entered. Any Spring cross-cutting annotation on that method — `@Transactional`,
`@PreAuthorize`, `@Async`, `@Cacheable`, `@Retryable` — is silently ignored. The consequence
is a method that looks transactional and commits every statement individually, which is a
partial-write bug rather than a crash.

**Q3. What are the two ways to fix self-invocation, and which do you recommend?**
`STAFF`

Inject a reference to yourself via `@Lazy @Autowired` so the call re-enters the proxy, or
extract the advised part into its own bean. The self-injection fix is smaller but it is
worse in every dimension that matters long-term: a class that injects itself confuses every
reader, it throws an NPE in a unit test that uses a plain `new`, and it does not help at all
for `private` methods. The extraction fix names the transaction boundary as a first-class
object you can inject, mock and review. Recommend extraction; keep self-injection for
genuinely contained cases where the callers cannot change.

**Q4. Why can't a `record` be advised, and what do you do about it?** `TRICKY`

Every `record` is implicitly `final`, and CGLIB proxies work by generating a subclass — a
`final` class cannot be subclassed. So the bean fails to proxy, either at startup or, if the
annotation is added later, with a `ReflectiveOperationException` naming a class someone wrote
two years ago. The same applies to Kotlin's `data class`, which is `final` unless declared
`open`, and to a Kotlin component class that is not `open`. The fix is mechanical — remove
`final`, add `open` — and the reason to care is that the failure arrives at the moment
someone adds an annotation, not at the moment they wrote the class.

**Q5. What happens when a CGLIB-proxied object is used as a key in a `HashMap`?** `ADVANCED`

CGLIB installs two dedicated interceptors, `EqualsInterceptor` and `HashCodeInterceptor`,
and both delegate to the target — but **only when the method is the one declared on
`Object`**. So a target that does not override `equals`/`hashCode` behaves correctly: the
proxy hashes and compares as the target, and a `HashMap` lookup with the real object finds
the entry stored under the proxy. The failure case is a target that **overrides**
`equals`/`hashCode` *and* whose override matches a pointcut — then the aspect's advice
handles it instead of the target's implementation, and the proxy is no longer equal to the
target. The practical corollary is separate and bites more often: two calls that return the
"same" object return two different proxies with different identity hashcodes, so a cache
keyed on the object never hits.

**Q6. A session-scoped bean throws `NotSerializableException`. Why, and what is the
principled fix?** `STAFF`

A proxied bean is a different object from its target, and the proxy carries a reference back
to the target plus the advisor chain. If the target is serializable and the proxy is not, the
write succeeds and the read fails. The principled fix is not to serialize it — put an
identifier in the session rather than the object, which also removes a class of stale-state
bugs. A JDK proxy is serializable when its target is, which is a reason to prefer it for a
specific bean, but the real answer is that a Spring-managed object with a lifecycle does not
belong in a session.

**Q7. Why is a stack trace through an advised method harder to read, and what do you do
about it in production?** `STAFF`

Every advised call now runs through the proxy entry point,
`DynamicAdvisedInterceptor.intercept`, `ReflectiveMethodInvocation.proceed` and each
interceptor body, so a frame the developer expects to see is four levels below framework
code and the class name at the top is `$Proxy42` or `$$SpringCGLIB$$0`. The cost is
cumulative: engineers learn to read past the frames, and then the frames are exactly what
they needed. The production answer is to stop relying on the stack trace as the primary
narrative — log the method name explicitly, and use `AopUtils.isAopProxy` and
`AopProxyUtils.ultimateTargetClass` for the proxy question. The unwrapping helpers are
test-harness tools, and the deeper argument is that fewer aspects would fix this more
effectively than any logging change.

**Q8. Your team has eight aspects and no document explaining their order. What is the
first thing you would build, and why is it not a test?** `STAFF`

A one-page document listing the aspects in chain order with their order values and what each
one is outermost to, because the ordering is a global coupling between files that no single
PR touches. A test is the better *mechanism* but the wrong first step: you cannot write an
assertion about the chain until you have decided what the chain should be, and that decision
is a design conversation. Once the document exists, the test that asserts the durable-effect
behaviours run outside the transaction falls out of it naturally. The general pattern is that
emergent configuration needs to be made explicit before it can be tested, and that making it
explicit is itself the valuable artefact.

> **CHAPTER 7 SUMMARY**
>
> Every AOP pitfall is one fact — **the proxy must be in the call path, and it only is if the
> caller holds the proxy rather than the target** — seen from eight angles. Self-invocation
> is the one that costs the most, because `this` is the target and the call never leaves the
> object; the fix that survives is extracting the advised work into its own bean, not
> self-injection. `private`, `final` and `static` methods and `final` classes are
> un-adviseable for the same reason, and the `record` and Kotlin `data class` cases are the
> version that arrives two years after the class was written. The subtler costs are identity
> — `equals`, `hashCode`, `toString` and serializability all change under CGLIB — and
> debuggability, since a stack trace through an advised method is no longer a complete
> description of the call path. The rule that carries into Volume 4: **an annotation on a
> method Spring cannot intercept is not a weaker transaction, it is no transaction at all,
> and it fails silently.**

#### Further Reading

- [Spring Framework Reference — Proxying Mechanisms](https://docs.spring.io/spring-framework/reference/core/aop/proxying.html) — the definitive list of what Spring AOP can and cannot proxy, including the `final`-class and `final`-method constraints.
- [Spring Framework Reference — AOP Proxies](https://docs.spring.io/spring-framework/reference/core/aop/introduction-proxies.html) — the join points Spring supports, which is the cleanest statement of why self-invocation and `new`-ed objects are excluded.
- [Source: `CglibAopProxy.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/framework/CglibAopProxy.java) — read `EqualsInterceptor` and `HashCodeInterceptor`; they are the whole basis of the `equals`/`hashCode` behaviour in section 7.4.
- [Source: `ReflectiveMethodInvocation.java`](https://github.com/spring-projects/spring-framework/blob/main/spring-aop/src/main/java/org/springframework/aop/framework/ReflectiveMethodInvocation.java) — the `proceed()` chain and the terminal reflective dispatch, in about forty lines.
- [Spring Framework Reference — Class Scanning](https://docs.spring.io/spring-framework/reference/core/beans/classpath-scanning.html) — the ASM-based metadata reading that makes component scanning cheap enough to proxy everything it finds.

---

### End of Volume 3

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- State the proxy selection rule exactly — JDK dynamic proxy if the target implements at
  least one interface, CGLIB otherwise, `proxyTargetClass` overriding both — and explain why
  Boot 2.0 changed the default and what that cost
- Trace a call from the proxy through `DynamicAdvisedInterceptor.intercept` and
  `ReflectiveMethodInvocation.proceed()` to the target, and say why the chain holds the
  target rather than the proxy
- Name all nine pointcut designators, say which resolve at match time and which at runtime,
  and explain why a string pointcut is a refactoring hazard that fails silently
- List the five advice types and say exactly which can skip the target, which can see the
  return value, and which runs on the exception path
- State the `@Order` inversion — lower value is higher precedence, outermost, first in and
  **last** out — and explain why a log line from an aspect inside a transaction records an
  intent rather than an outcome
- Explain self-invocation, the `@Lazy` self-injection fix and the bean-extraction fix, and
  say which you would choose and why
- Explain why `private`, `final` and `static` methods and `final` classes cannot be advised,
  and why `record` and Kotlin `data class` are the version of that trap that arrives late
- Describe what happens to `equals`, `hashCode`, `toString`, serialization and generic type
  resolution when a bean is proxied

### Coming in Volume 4 — Transaction Management

Volume 3 established that `@Transactional` is an annotation read by a proxy, and that
whether it does anything depends entirely on whether a proxy is in the call path. Volume 4
takes that one mechanism seriously: the `PlatformTransactionManager` abstraction, the
declarative model, propagation and isolation with the specific situations each level solves,
read-only hints, `rollbackFor`, the sticky `rollbackOnly` flag that turns a nested
`RuntimeException` into a surprise `UnexpectedRollbackException`, the interaction with JPA's
persistence context that makes "the data is gone" and "the transaction rolled back" different
statements, and the boundary where an in-process transaction stops being enough —
two-phase commit, the outbox pattern, and the failure modes of distributed consistency.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### The Proxy Mechanism

**P1. A service that has worked for a year started failing at startup with
`ClassCastException: $Proxy42 cannot be cast to OrderServiceImpl` after a routine dependency
upgrade. What happened?**

> Someone else's class was annotated. A teammate added `@Transactional` to a repository, which
> made it JDK-proxied, and a consumer that injected it by concrete type no longer matches.
> The class that broke did not change — the annotation did, in a different module. Fix by
> injecting the interface or switching to a class proxy; prevent it with a build rule that
> every bean injected by concrete type is non-final and adviseable.

**T1. A JDK-proxied bean is stored in a `HashMap` and then looked up using the real target
instance. Does it work?**

> It does, provided the target does not override `equals` and `hashCode`. CGLIB's
> `EqualsInterceptor` and `HashCodeInterceptor` delegate to the target, and a JDK proxy
> inherits the target's implementations. The lookup fails only when the target overrides
> those methods *and* the override matches a pointcut, in which case the aspect handles the
> call instead of the target's implementation.

**T2. An `@Around` advice calls `proceed()` and the target throws. What does the caller see,
given the advice has no `catch` block?**

> The original exception, unchanged, with the advice's frames appended below it. Propagation
> is automatic because `proceed()` declares `throws Throwable` and the advice neither catches
> nor declares something narrower. Adding a `catch` block is the moment the advice takes
> responsibility for the failure and the framework stops seeing it.

**D1. Spring Boot 2.0 switched the default to class-based proxies. Was that the right
trade, and what is the right follow-through?** `STAFF`

Right for the common case — most application classes implement no interface, and forcing
them to grow one purely so `@Transactional` could apply pushed a framework constraint onto
every team. The cost is that CGLIB is unforgiving: `final` classes, `final` methods and
non-serializability became real failure modes, and developers rarely connect those to the
setting they changed. The follow-through is to treat `final` as prohibited on Spring beans
and enforce it with ArchUnit, so the sharper tool arrives with the guardrail that makes it
safe.

**S1. A PR adds `@Transactional` to a repository that another module injects by its
concrete class. What should the review catch?**

> That the injected type is the concrete class, so the bean will no longer be assignable to
> it once proxied — either via a JDK proxy or, once the annotation is added, in a way that
> depends on the proxy strategy. The review question is not "is a transaction desirable" but
> "what type do the consumers inject", and it should be checked before the annotation lands
> rather than after a deployment fails.

**D2. Is the per-call proxy overhead ever the reason to remove an aspect?** `STAFF`

Almost never, and the number is why. A chain hop is tens of nanoseconds and the terminal
dispatch is reflective but also tens of nanoseconds, so a four-aspect chain on a method that
touches a database is rounding error. The overhead becomes real only when a method runs in
the low microseconds at very high call rates — a hot-path cache lookup, an in-memory
permission check — where the invocation-object allocation and the advice bodies start to
register. Even then the right move is usually to move the hot path behind an explicitly
constructed collaborator, because the aspects are usually there for correctness, and
correctness is not something you trade for microseconds.

### Aspects & Advice

**P2. A logging aspect's lines stopped appearing for one class, but the class was never
touched in the diff. What are the likely causes?**

> The pointcut stopped matching because a method was renamed — the pointcut is a string, so
> the compiler did not help and nothing warned. Or the class was made `final` and stopped
> being proxyable. Or the class moved out of the scanned package. Or the aspect was
> registered twice and then one registration was removed. In order of likelihood: the
> renamed method, then the `final` class, then the scan.

**T3. An aspect is declared as an `@Aspect @Component` in a scanned package, and a `@Bean`
method in an auto-configuration also returns one. What happens?**

> Two advisor instances, so the advice runs twice per call. The auto-proxy creator collects
> advisors from both paths. Nothing errors, the metrics counter is exactly double, and the
> only symptom is unexplained. `@ConditionalOnMissingBean` on the `@Bean` method is the
> guard that prevents it.

**D3. Should logging, metrics and transactions all be aspects? What decides it?** `STAFF`

The deciding question is uniformity, not elegance. An aspect should apply something that
every reader of the target class would *expect* to apply and that no caller would reasonably
want to opt out of. Logging, metrics, tracing and authorisation qualify; anything that varies
by call site does not, and belongs in an explicit collaborator where it is visible. The
over-engineering failure is a codebase with an aspect per concern, each with a broad
pointcut, each invisible — that is harder to reason about than a `log.info` in the method,
and it will have a silent behaviour bug within a year.

**S2. A PR adds an `@Around` that logs before and after every method in
`com.acme.order..*Service`. What should the reviewer push for?**

> Not `@Around` — the same behaviour with a smaller blast radius is `@Before` plus
> `@AfterReturning` and `@AfterThrowing`, because an `@Around` that forgets `proceed()`
> silently deletes the method. Push for a test asserting the aspect applies to the classes
> the team intends, and name the cost: every call in that package now pays a chain hop and
> every stack trace in that package now runs through `MethodInterceptor.invoke`.

**D4. A pointcut covers forty services. A new service is added and is immediately advised.
Is that good?** `STAFF`

It is defensible for logging and metrics, and indefensible for anything with a
behavioural consequence. The property to preserve is that a reader of `NewService` can
predict what runs around its methods, and a pointcut that reaches into a package they have
never seen does not give them that. The mitigation is to annotate the code — an `@Audited`
annotation on the class — rather than describe it in a pointcut, so the declaration is
type-safe, appears at the class, and is reviewable by whoever reviews the class.

### Pointcuts

**P3. A pointcut stopped matching after a method was renamed from `create` to `place`. No
test failed and no warning was logged. Why is this the most dangerous class of bug?**

> Because the failure is the *absence* of a behaviour, not an error. The system keeps working
> for everyone not affected, so there is nothing to alert on. If the pointcut carried
> `@PreAuthorize`, the failure is that an endpoint is now open to anyone — a security defect
> discovered by an auditor rather than by a test.

**T4. Does `execution(* com.acme.order.OrderService.create(..))` match
`SpecialOrderService.create(..)` where `SpecialOrderService extends OrderService`?**

> No, in the normal case. The CGLIB proxy for the subclass reports the method as declared in
> `SpecialOrderService`, and the pattern names the parent's declaring type, so it does not
> match. The aspect silently stops applying the moment the class is subclassed, with no
> change to either class. Widening the type pattern to `com.acme.order.*Service` or using
> `within` on the concrete type fixes it.

**D5. Spring's pointcuts are strings and AspectJ's are type-safe. Has Spring made the wrong
trade?** `STAFF`

The trade is real and the reason is defensible. Spring's parser must be able to resolve bean
names, and bean names are runtime strings, so the whole language has to be string-based; that
is also what allows pointcuts to live in configuration and to name containers AspectJ has no
concept of. What Spring gives up is refactoring safety, and that is not a small thing — a
rename silently removes a behaviour with no compile error and no failing test. The correct
response is not to argue for AspectJ's model but to make the string safe: test what your
pointcuts match, prefer designators that do not name methods, and treat a pointcut as
reviewed code.

**S3. A PR changes a pointcut from `bean(*Service)` to `execution(* com.acme..*Service.*(..))`
to "make it more precise". What is the reviewer's concern?**

> That the replacement drops the `!bean(healthService)`-style exclusions the original may have
> relied on, so a new no-op or internal service is now advised. And that nothing verifies
> the two pointcuts match the same set — which is exactly the assertion the PR should add,
> because "the new one looks more specific" is not evidence that it is equivalent.

**D6. Is there a way to make pointcuts survive refactoring without switching to
AspectJ?** `STAFF`

Yes, and the mechanism is to stop naming methods. `@annotation`, `@target` and `@args` match
on annotations rather than names, so a rename leaves them untouched. The strongest version
puts the declaration on the code itself — a class annotated `@Audited` — which makes the
pointcut `within(@Audited *)` or `@annotation(Audited)` and puts the decision in a file a
reviewer of that class will read. The residual risk is removing the annotation, which is at
least a visible, reviewable act rather than an invisible one in a config file.

### Around Advice

**P4. A service that processes 3,000 rows per request suddenly fails with
`RejectedExecutionException` and 500s under load. An `@Around` aspect was added last week.
What is the first hypothesis?**

> That the advice blocks. A synchronous interceptor on a 200-thread Tomcat pool holding a
> thread for its full duration caps throughput at 200 divided by per-call latency, so a
> 500ms advice body puts a hard ceiling of 400 calls/second — and the queue absorbs the rest.
> The chain walk itself cannot cause this; I/O in the advice body can. Look for a network
> call, a `Future.get()`, or a lock inside the advice.

**T5. An `@Around` advice has no `return` statement and its pointcut matches a method
returning `String`. What does the caller get?**

> `null`. The target method executes, but its return value is discarded and the advice
> returns nothing, so the caller receives `null` and fails wherever it dereferences the
> result — usually several frames away, which is what makes this bug expensive to trace.

**D6. When is calling `proceed()` more than once the right design?** `STAFF`

In a bounded retry loop, and only there. What makes it legitimate rather than a bug is that
every element of the safety argument is visible: a loop, a capped attempt count, a
whitelist of retryable exceptions, a backoff, and a rethrow on the final attempt. Each
`proceed()` is a real side effect, so the cost of getting the bound wrong is a duplicate
charge or a duplicate row rather than an error message. A cache's single skipped `proceed()`
is the mirror case and is legitimate for the opposite reason — it is a decision to not run
the target, made once, in a place where a reader can see it.

**S4. A PR adds an `@Around` that wraps a cache lookup around a hot in-memory method. What
should the reviewer ask?**

> What the hit rate is, and whether the cache key derived from `pjp.getArgs()` is
> tenant-scoped. A key built from `hashCode`/`equals` that was not designed for it silently
> misses, and a key that omits the tenant identifier leaks entries across tenants. Both
> failures are silent, and both are cheaper to prevent in review than to diagnose from a
> dashboard.

### Ordering

**P5. An audit aspect records "payment succeeded" for orders that were rolled back by a
database failover. Why, and what is the fix?**

> The audit aspect is inside the transaction interceptor, so it wrote the record before the
> commit was attempted. A failover fails the commit, the transaction rolls back, and the
> audit row is already durable. The fix is one annotation —
> `@EnableTransactionManagement(order = Ordered.HIGHEST_PRECEDENCE)` — which makes the
> transaction outermost so nothing outside it can observe an outcome that has not happened.

**T6. Aspect A is `@Order(1)` and aspect B is `@Order(2)`. Both have `@AfterThrowing`. When
the target throws, which runs first?**

> B's. The exception unwinds from the inside out, and the higher order value is the inner
> aspect. Lower order value means earlier on the way *in*, which is the opposite of earlier
> on the way out — and the reason the `@Order` inversion is a standing interview trap.

**D7. Aspect order values are scattered across `@Order` annotations in eight files. Who
should own them, and what is the artefact?** `STAFF`

Ordering is a global coupling between files that no single pull request touches, so the
owner is whoever owns the behaviour the chain expresses — usually the team that owns the
cross-cutting concerns rather than the team that owns any one aspect. The artefact is a
short document listing the aspects in chain order with their values and what each is
outermost to, plus a review convention that a new aspect must state its position, plus one
test asserting the durable-effect behaviours run outside the transaction. A test alone is
not the first step, because you cannot assert a chain until you have decided what it should
be, and that decision is the design conversation.

**D8. Is the transaction interceptor's default position — innermost — actually right?**
`STAFF`

For the common case, yes: a transaction that wraps the smallest possible amount of business
work commits earlier, holds locks for less time, and reduces the chance of a rollback
having to discard unrelated work. It is defensible as a default. It becomes wrong the moment
anything outside it needs to observe the committed outcome, which is the audit case, and it
is a global setting, so the cost of the correction is a change in behaviour for every aspect
in the chain — which is why it should be made once, deliberately, and documented, rather than
discovered aspect by aspect.

### Pitfalls & Diagnosis

**P6. A nightly job reports partial writes for roughly 4% of orders. The service looks
correct and no exceptions were logged. Where do you start?**

> At the transaction boundaries, not the business logic. A partial write means several
> statements committed where one transaction was assumed. The candidates in order:
> self-invocation of a `@Transactional` method, a `@Transactional` on a `private` or `final`
> method, a `new`-ed object that never got a proxy, and a `@Transactional` method called
> through a JDK proxy where the annotation is on the implementation. All four are silent,
> and a test that calls the service from outside the container will not catch any of them.

**T7. A `@Transactional` method on a Kotlin `data class` component. Does the transaction
apply?**

> No, and the bean will not proxy at all. Kotlin classes are `final` by default, and a
> `data class` is final unless declared `open`; CGLIB cannot subclass a final class, so
> proxy creation fails. In Java the same trap is a `record`, which is implicitly final. The
> failure arrives when the annotation is added, naming a class someone wrote long before.

**T8. You log a bean in a `@Service` and get
`com.acme.TenantService$$SpringCGLIB$$0@1f2e3d`. Why?**

> `toString()` is not one of the two methods CGLIB intercepts. CGLIB installs
> `EqualsInterceptor` and `HashCodeInterceptor` only; every other call, including
> `toString()`, goes to `mp.invokeSuper` on the generated subclass, which has no useful
> implementation. An explicit `toString()` on the target helps only if a pointcut matches it,
> because otherwise it is not advised either.

**D9. A codebase has 400 methods carrying `@Transactional` and no test asserts that any of
them actually opens a transaction. What is the real risk, and what would you do?**
`STAFF`

The risk is not that some of them are wrong today — it is that the codebase cannot answer
the question, and that nobody will notice as it grows. An annotation that silently does
nothing is a defect class with no signal, so the exposure scales with the number of annotated
methods while the detection ability stays flat. The first move is measurement: an ArchUnit
rule that fails the build if a method carrying a Spring cross-cutting annotation is `private`,
`static` or `final`, or is invoked via `this.`. The second is a test that asserts the
transaction boundary for the two or three services where it matters most, because a rule can
find the syntactic cases but not the structural ones.

**S5. A PR adds `@PreAuthorize("hasRole('ADMIN')")` to a service method. What should the
reviewer ask beyond "is that the right role"?**

> Whether there is a test asserting **denial** for an unauthorised principal. A suite that
> only tests the authorised path cannot detect a broken pointcut, because the broken state is
> "everything is allowed" — and the pointcut is a string, so a rename produces that state
> silently. Also worth asking whether the check belongs on the service at all, or on the
> controller boundary, where the blast radius of a mistake is one endpoint rather than every
> caller of the service.

**D10. Is the debuggability cost of AOP acceptable, and what is the alternative?**
`STAFF`

The cost is real and cumulative: every stack trace through an advised bean gains at least
three framework frames, engineers learn to read past them, and then the frames are exactly
what they needed. But it is not the strongest argument against AOP — the strongest is that
an aspect changes the behaviour of code its author never reads. Neither is fixed by tooling.
The realistic mitigations are to keep the aspect count small, log the method name explicitly
rather than relying on the stack trace, and to make aspect ownership explicit. A codebase
where reading a stack trace no longer tells you the call path is a codebase where the next
incident takes twice as long to diagnose, and that cost is paid every single time.

### Designing for It

**D11. Your team is extracting all cross-cutting concerns into aspects. What is the
migration plan and the honest cost?** `STAFF`

Do not extract all of them — extract one, measure, and let the team form the opinion from
the result rather than from a principle. The first candidate should be the most mechanical
and the most uniform, usually metrics or tracing, because it is the easiest to argue against
and the easiest to remove. The cost that nobody puts in the plan is that aspects are
unreviewable in the ordinary way: a diff to `OrderService` does not show that a pointcut now
intercepts it, and no reviewer of that diff can see it. The plan has to include whatever
makes that visible — a pointcut test, a documented chain order, a named owner — or the
extraction trades a compile-time cost for a runtime one and comes out worse.

**D12. A team wants `@Aspect` on every method in every service for uniform tracing. Would
you recommend it?** `STAFF`

Not as the first move, and not without a width cap. The uniform-tracing goal is legitimate
and an aspect is the right tool for it, but the proposal as written has a blast radius of the
entire service layer, an unowned pointcut, and a permanent per-call chain cost on every hot
path. The version I would support is narrower: a package-scoped pointcut rather than an
annotation-scoped one, an explicit order so the trace aspect is outermost, a test asserting
what it matches, and a documented owner. And I would want to know the answer to one
question first — what happens when this aspect is wrong at 3am, and who gets paged.

**D13. Is a self-injected `@Lazy` reference to your own bean ever the right
answer?** `STAFF`

Occasionally, and rarely enough that it should be an explicit decision rather than a
convenience. It is the right answer when the callers cannot change, when the alternative is
duplicating an annotated method, and when the class genuinely has no natural collaborator to
extract into. It is wrong whenever a bean extraction is available, because a class that
injects itself confuses every reader, throws an NPE in a unit test that uses a plain `new`,
and does nothing for `private` methods. The test is simple: if you can name the class that
should own this behaviour, name it — a self-injection is a signal that nobody has yet.

**D14. AspectJ load-time weaving would solve several of the problems in this volume. Why
don't most teams reach for it?** `STAFF`

Because the problems it solves are usually cheaper to fix by design. Load-time weaving
reaches `new`-ed objects, self-invocations and `static` methods, which is genuinely powerful
and genuinely hard to justify: it requires an agent flag or a build plugin, it changes the
bytecode of code you may not own, it is harder to debug, and it interacts badly with native
images and with some observability tooling. The designs that *need* weaving — a static
utility in a third-party jar, a legacy module with no seam — are a small minority, and in
those the better answer is usually a thin wrapper bean. The honest framing is that the
cases needing AspectJ are the cases where the design is fighting the tool, and that is a
signal worth acting on before reaching for the agent.

### Interoperability & the Wider Framework

**P7. An `@Around` aspect that propagates a trace id works for web requests and produces
empty ids for scheduled jobs and `@Async` work. Why, and what is the fix?**

> `MDC` is a `ThreadLocal`. A scheduler runs on its own thread and `@Async` runs on an
> executor thread, so neither inherits the value the aspect set on the request thread. The
> aspect is not wrong — it is doing exactly what a thread-bound advice can do. The fix is on
> the other side of the boundary: a `TaskDecorator` on the executor that captures the MDC
> at submit time and restores it in the worker, or Micrometer's context propagation. The
> general rule is that any context carried in a `ThreadLocal` has to be propagated
> explicitly, and an aspect cannot do it because it does not own the thread handoff.

**T9. A `@Bean` method returns a lambda implementing a functional interface, and an
`@Transactional` annotation is applied to it. Does the transaction apply?** `ADVANCED`

No, and the reason is the proxy mechanism rather than the annotation. CGLIB proxies by
generating a subclass, and a lambda's class is generated and final, so it cannot be
subclassed — proxy creation either fails or, in a JDK-proxy configuration, produces a proxy
with no way to reach the implementation. The general rule is that the proxy mechanism
requires a proxyable type: a non-final class with a reachable constructor, or an interface.
Anonymous classes and lambdas are the two forms people forget, and the practical fix is
always the same — make it a named class.

**T10. A service has `@Cacheable` on `findById` and another method in the same class calls
`findById` in a loop. The database shows the queries; the cache is empty. Why?** `TRICKY`

Self-invocation. The internal call never reaches the proxy, so the cache interceptor is
never entered, and every iteration hits the database. The cache is not misbehaving — it was
never consulted. The fix is the same as for `@Transactional`: extract the cached method into
its own bean, or inject self. This is worth knowing as a pair with the transaction case
because they have the same root cause and the same fix, and a team usually discovers them
separately.

**P8. Adding a metrics aspect to a service made the Prometheus scrape fail with
"duplicate metrics for type". Nothing in the aspect creates a duplicate. What happened?**

> A pointcut that matches by method signature will produce the same metric name from two
> different aspects, or from one aspect declared twice — for example as an
> `@Aspect @Component` and again from an auto-configuration. Micrometer rejects a duplicate
> meter name for the same tag set at registration time, so the failure surfaces as a scrape
> error rather than as a wrong number. The lesson is that metric names are part of your
> interface: a global registry means an aspect author in another module can break your
> dashboard, so names should be namespaced by convention and enforced.

**D15. Is Spring AOP the right tool for observability in a large codebase, given that
Micrometer, `@Timed`, tracing agents and OTEL all exist?** `STAFF`

Usually not for measurement, and yes for propagation. Instrumentation should be owned by
the libraries that know the semantics — a `Timer` with a histogram configured correctly, a
span with the right attributes — and an aspect produces measurements without knowing what
the method means, so it ends up tagged by class and method name, which is exactly the
high-cardinality shape that makes a metrics bill painful. Where AOP genuinely wins is the
concern that is uniform and mechanical across everything: injecting a correlation id, adding
a tenant tag, enforcing a policy. So the split is: aspects for cross-cutting *policy*,
libraries and agents for cross-cutting *measurement*.

**D16. Your organisation wants a rule that every `@Transactional` method must actually
open a transaction. How would you enforce it, and what can the rule not catch?** `STAFF`

Statically, an ArchUnit rule that fails the build when a method carrying a Spring
cross-cutting annotation is `private`, `static` or `final`, when the class is `final`, or
when such a method is invoked via `this.` — the *call*, not the declaration, which is the
part that catches self-invocation. That is the high-leverage move because it converts a
silent runtime class of bug into a build failure. What it cannot catch is structural
self-invocation through a helper, a service instantiated with `new` outside the container,
or a proxy created by a configuration the rule does not model — those need integration
tests asserting the transaction is actually active, on the two or three boundaries where it
matters most. Rules find the syntax; tests find the structure; you need both.

**S6. A PR wraps a `RestClient` call in a new `@Around` aspect to add a retry with backoff.
What should the reviewer ask?**

> Three things in order. **Whether the advice is idempotent-safe** — a retry around a
> non-idempotent POST can charge a card twice, and the retry loop makes that a real
> probability rather than a theoretical one. **Whether the retryable exceptions are
> whitelisted** rather than caught broadly, because a broad catch retries the 4xx responses
> that will never succeed and turns a fast failure into three slow ones. And **whether this
> belongs in the client configuration at all** — Spring Boot exposes retry and timeout
> settings for the HTTP client itself, which is where they are visible, testable, and not
> applied by a pointcut someone might narrow next quarter.

**D17. A pointcut matches by bean name, and the metrics it records are indexed by bean
name. The number of distinct beans grows every quarter. What is the trajectory?** `STAFF`

Unbounded cardinality, and it is a bill that arrives monthly rather than a failure that
arrives now. A bean-name index is only safe while the bean set is small and stable; as teams
add services the series count grows with them, and the failure mode is not a crash but a
metrics backend that becomes slow, expensive, and eventually unusable — at which point
people turn off the high-cardinality tag rather than fixing it, and the observability
investment is spent. The rule is that any tag must come from a bounded domain, and a bean
name is not one. The review question for a `bean()` pointcut is therefore never "does it
match the right beans" but "what does it use for a tag value".

