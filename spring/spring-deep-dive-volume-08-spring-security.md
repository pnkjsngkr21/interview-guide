---
title: "The Spring Complete Deep-Dive"
volume: 8
series: "SPRING SECURITY"
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
treated as the visible surface of much larger machinery — a proxy chain, a bean lifecycle, a
connection pool, a thread pool — and the notes always go down to that machinery, because
that is the layer where production incidents actually live.

Volume 8 is the volume where "it works locally" hides the most. Every other volume has a
default that fails loudly when you get it wrong — a missing bean, a self-invocation, a N+1
you can see in a log. Security defaults fail *silently and correctly*, which is why they
are dangerous: the configuration that is exactly right for a browser application behind a
login form is wrong for a machine-facing API, and the difference is usually one line of DSL
that compiles, deploys, and passes every test you have. The recurring question in this
volume is therefore not "is this secure" but **"which kind of caller am I defending
against, and did I choose my defaults for that caller?"**

The second thing this volume teaches is that Spring Security is a *filter*, not an
interceptor, and that almost every surprise — security on static resources, method
annotations that do nothing, a `SecurityContext` that is empty on a scheduled thread — is
downstream of that one fact.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto
`AccessDecisionManager` produces filler. The template is a completeness checklist, not a
template to fill.

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

### Continuing From Volume 7

| Volume | Coverage |
| --- | --- |
| Volume 1 | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 (this book) | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

### Table of Contents — Volume 8

- Chapter 1 — The Filter Chain Architecture
- Chapter 2 — Authentication
- Chapter 3 — Authorization & Method Security
- Chapter 4 — JWT & Stateless APIs
- Chapter 5 — OAuth2 & OIDC
- Chapter 6 — CSRF, CORS, Sessions & Attack Surface
- Chapter 7 — Testing & Hardening
- Chapter 8 — Interview Scenario Bank

---

# Part 8 — Spring Security

## Chapter 1 — The Filter Chain Architecture

### 1.1 It Is a Servlet Filter

The single most important structural fact about Spring Security, and the one most often
stated wrongly, is that **it is a servlet `Filter` that runs before `DispatcherServlet`
exists**. It is not a `HandlerInterceptor`, it is not a `@ControllerAdvice`, and it is not
part of Spring MVC.

```text
            an HTTP request arrives
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  CONTAINER FILTERS (Tomcat/Jetty)                            │
  │   ForwardedHeaderFilter, RequestContextFilter, ...           │
  └──────────────────────────────────────────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  springSecurityFilterChain   ← FilterChainProxy              │
  │   (ONE filter, holding an ordered list of security filters) │
  └──────────────────────────────────────────────────────────────┘
                     │
                     ▼
  ┌──────────────────────────────────────────────────────────────┐
  │  DispatcherServlet                                           │
  │   handler resolution → controller → data binding → rendering │
  └──────────────────────────────────────────────────────────────┘
```

The consequences of "filter, not interceptor" are not academic, and each one is a
production behaviour:

| Consequence | What you actually observe |
| --- | --- |
| It runs before the `DispatcherServlet` | Security applies to requests that never reach a controller at all — `/health`, `/error`, static resources, a 404 |
| It applies to error dispatches | A request that throws still passes back through the chain, so the error page can leak or be intercepted |
| It applies to `forward:` and `include:` | A JSP forward runs the chain again unless you scope the matcher or check the dispatcher type |
| Async is a separate problem | A request dispatched with `startAsync()` loses the thread-bound context unless you integrate `WebAsyncManagerIntegrationFilter` (or use the Spring Security-aware async support) |
| A `HandlerInterceptor` cannot do this work | Interceptors run *after* handler resolution, so they cannot secure a request for a handler that does not exist — which is exactly the request an attacker sends |

> **INTERVIEW TRAP**
>
> "Spring Security uses `HandlerInterceptor`s" is the answer that scores zero, and it is
> wrong in a way that matters. Interceptors run inside `DispatcherServlet` dispatching, after
> handler resolution and before the controller method. A filter runs before all of that. The
> interviewer is usually asking this question because someone shipped an authorization check
> that the attacker walked straight past by requesting a path with no handler — the check
> never ran because there was no handler to run it on. One sentence, then move on: it is a
> `Filter` via `FilterChainProxy`, registered as a single `springSecurityFilterChain` bean
> or through the `SecurityFilterAutoConfiguration`.

Spring Boot registers the chain for you. `SecurityFilterAutoConfiguration` defines a
`DelegatingFilterProxyRegistrationBean` named **`springSecurityFilterChain`**, which is a
`DelegatingFilterProxy` over the `FilterChainProxy` bean. The container sees exactly one
filter. Everything you configure becomes entries inside that one filter's ordered list —
which is why "add a filter at position N" is a real and frequently necessary activity.

> **MUST REMEMBER**
>
> You almost never implement `javax.servlet.Filter` and register it in the chain yourself.
> You declare a `SecurityFilterChain` bean (or several) and the framework assembles the
> list. If you do write a custom filter, you either add it to a chain with
> `http.addFilterBefore(...)` / `addFilterAfter(...)`, or you register it as a separate
> servlet filter with an explicit `@Order` — and understand that a plain `FilterRegistrationBean`
> sits *outside* `FilterChainProxy` or *inside* it depending on the order you pick, which
> changes what it can see.

### 1.2 `SecurityFilterChain` vs `WebSecurityConfigurerAdapter`

`WebSecurityConfigurerAdapter` was **deprecated in Spring Security 5.7 and removed in
Spring Security 6.0**. It was an abstract class that you extended and overrode
`configure(HttpSecurity)`; the container created one instance per adapter and Spring detected
them. Its removal is the single biggest migration fact in Spring Security 6, and it is
routinely misstated — people say "removed in 5.7", which is when it was *deprecated*.

The modern replacement is the `SecurityFilterChain` **interface**. You declare one or more
beans; each one owns a `HttpSecurity` and configures the rules for the requests it matches.

```java
// ── BEFORE: Spring Security 5.x and earlier ──────────────────────
@Configuration
@EnableWebSecurity
public class SecurityConfig extends WebSecurityConfigurerAdapter {

    @Override
    protected void configure(HttpSecurity http) throws Exception {
        http.authorizeHttpRequests(a -> a.anyRequest().authenticated())
            .httpBasic(withDefaults())
            .formLogin(withDefaults());
    }

    @Bean                       // the old way of supplying a user store
    public UserDetailsService userDetailsService() {
        UserDetails u = User.withUsername("dev")
            .password("{noop}secret")
            .roles("USER")
            .build();
        return new InMemoryUserDetailsManager(u);
    }
}

// ── AFTER: Spring Security 6.x ───────────────────────────────────
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    SecurityFilterChain apiChain(HttpSecurity http) throws Exception {
        http.securityMatcher("/api/**")                       // scope this chain
            .authorizeHttpRequests(a -> a
                .requestMatchers("/api/admin/**").hasRole("ADMIN")
                .anyRequest().authenticated())
            .sessionManagement(s -> s.sessionCreationPolicy(STATELESS))
            .csrf(csrf -> csrf.disable())
            .httpBasic(withDefaults());
        return http.build();
    }

    @Bean
    UserDetailsService userDetailsService(PasswordEncoder encoder) {
        UserDetails u = User.withUsername("dev")
            .password(encoder.encode("secret"))               // never {noop} in production
            .roles("USER")
            .build();
        return new InMemoryUserDetailsManager(u);
    }

    @Bean
    PasswordEncoder passwordEncoder() {
        return PasswordEncoderFactories.createDelegatingPasswordEncoder();
    }
}
```

| | `WebSecurityConfigurerAdapter` | `SecurityFilterChain` bean |
| --- | --- | --- |
| Status | Deprecated 5.7, **removed 6.0** | Current, and the only option in 6.x |
| Shape | Extend a class, override `configure(HttpSecurity)` | Implement an interface / declare a `@Bean` returning `SecurityFilterChain` |
| Number of chains | Effectively one per adapter; multi-chain was awkward | One or many, first match wins |
| Ordering control | None — container discovered adapters | `@Order` on the `@Bean`, explicit and testable |
| Where state lives | In the adapter instance | In the chain's `HttpSecurity`, which is per-bean |
| Testability | Needs the full context | A chain is just a bean; you can build it in isolation |

The migration is mechanical for the single-chain case. It is *not* mechanical for the
multi-chain case, because the old adapter model made multiple rule sets genuinely hard, so
teams that built something complex under the adapter are usually re-architecting rather than
translating. If you see an application with three `WebSecurityConfigurerAdapter` subclasses
on a path-pattern basis, the migration is a design task.

> **PRODUCTION RELEVANCE**
>
> A common mid-migration failure is leaving `@EnableWebSecurity` on an old adapter class
> *and* adding a `SecurityFilterChain` bean. The adapter's `http` is built anyway, and the
> outcome is a filter chain whose rule set is neither the old one nor the new one, with no
> error. The check is simple and belongs in the migration checklist: after the upgrade,
> `grep -r "WebSecurityConfigurerAdapter"` must return nothing, and `WebSecurityConfigurerAdapter`
> will not even compile against 6.x — which is the good outcome, because the compiler
> catches what reflection-based configuration discovery would not.

### 1.3 The Default Chain, Filter by Filter

Knowing the order is not trivia. When a request is rejected and you cannot work out why,
the answer is almost always "a filter you forgot is in this list." Boot's default chain
(`SpringBootWebSecurityConfiguration#defaultSecurityFilterChain`) is:

```text
 1. DisableEncodeUrlFilter .................. no-op in Spring 6 (URL encoding moved
                                              into the request wrapper); present for
                                              binary compatibility
 2. WebAsyncManagerIntegrationFilter ....... registers Spring Security's Callable/Deferred
                                              interceptor so the SecurityContext survives
                                              Callable and CompletableFuture async
 3. SecurityContextHolderFilter ............. loads the SecurityContext for this request
                                              (replaces SecurityContextPersistenceFilter
                                              in 5.7+)
 4. HeaderWriterFilter ...................... writes X-Content-Type-Options, X-Frame-Options,
                                              Cache-Control and friends (CSP, HSTS)
 5. CorsFilter .............................. evaluates pre-flight and cross-origin rules
 6. CsrfFilter .............................. validates the CSRF token on unsafe methods
 7. LogoutFilter ............................ handles POST /logout
 8. BearerTokenAuthenticationFilter .......... OAuth2 resource-server bearer token
    (or UsernamePasswordAuthenticationFilter  (form login),
     BasicAuthenticationFilter, ...)         positioned per the configured mechanisms
 9. ...OAuth2LoginAuthenticationFilter /
     Saml2WebSsoAuthenticationFilter ....... login callbacks
10. RequestCacheAwareFilter ................. saves the request on auth failure so the user
                                              is redirected back to it after login
11. SecurityContextHolderAwareRequestFilter . wraps the request so getUserPrincipal() and
                                              @AuthenticationPrincipal work
12. AnonymousAuthenticationFilter ........... installs an AnonymousAuthenticationToken so
                                              downstream code always sees a principal
13. SessionManagementFilter ................. session fixation protection, concurrent session
                                              control, session creation policy
14. ExceptionTranslationFilter .............. THE CATCH-ALL — catches AccessDeniedException
                                              and AuthenticationException and decides
                                              between 401, 403, login redirect, or entry point
15. FilterSecurityInterceptor ............... the authorization decision
    (AuthorizationFilter in 6.x)               ← last, so every earlier filter can populate
                                               the SecurityContext first
```

Two entries in that list carry most of the interview weight.

**`ExceptionTranslationFilter` is the last line of defence and the reason a 401 is a 401.**
It sits immediately before the authorization filter, catches everything thrown above it,
and is the only thing that turns an `AccessDeniedException` into an HTTP status. It also
holds the "authentication entry point" and the "access denied handler" — which is why an
API returning a 302 redirect to a login page is a misconfiguration in the *entry point*
choice, not in the authorization rule. A browser chain wants a redirect; a stateless API
chain wants a 401 with `WWW-Authenticate`.

**`AnonymousAuthenticationFilter` is the one people forget, and it is load-bearing.** It
guarantees that `SecurityContextHolder.getContext().getAuthentication()` is never `null` —
it is an `AnonymousAuthenticationToken` instead. Without it, every controller, every
SpEL expression, and every `if (auth != null)` in the codebase becomes a place a null
can arrive. It also matters for `@PreAuthorize`: an anonymous request is *not* unauthenticated
in the Java sense, and expressions that test `authentication == null` never fire.

> **INTERVIEW TRAP — `FilterSecurityInterceptor` vs `AuthorizationFilter`**
>
> Both names are in circulation and the distinction is worth one sentence. `authorizeRequests()`
> used `FilterSecurityInterceptor` + `AccessDecisionManager`; `authorizeHttpRequests()` uses
> `AuthorizationFilter` + `AuthorizationManager`. `authorizeRequests()` was deprecated in
> Spring Security 5.7 and **removed in 6.1**, and `AccessDecisionManager` — with
> `AffirmativeBased`, `UnanimousBased` and `ConsensusBased` — was removed in 6.1 with it.
> The 5.x-era design was a voting strategy over multiple `AccessDecisionVoter`s; the 6.x
> design is a single `AuthorizationManager` that returns a `Supplier<AuthorizationDecision>`
> for the native web stack and a `Mono<AuthorizationDecision>` for the reactive one. If you
> are asked about `ConsensusBased` in a modern interview, the right answer is to explain what
> it did *and* say it was removed in 6.1 in favour of a single `AuthorizationManager`.

### 1.4 Multiple Chains and `securityMatcher`

Declaring more than one `SecurityFilterChain` bean is the supported way to run a browser
application and a machine-facing API in the same process with genuinely different rules.
Each chain declares a `securityMatcher`, and **the first matching chain wins — the request
never reaches the other chains**. A chain with no matcher matches everything, so a catch-all
chain must come last.

```java
@Bean
@Order(1)                                       // highest priority = evaluated first
SecurityFilterChain apiChain(HttpSecurity http) throws Exception {
    return http
        .securityMatcher("/api/**")
        .authorizeHttpRequests(a -> a
            .requestMatchers(HttpMethod.GET, "/api/orders/**").hasAuthority("SCOPE_orders.read")
            .requestMatchers("/api/admin/**").hasRole("ADMIN")
            .anyRequest().authenticated())
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .csrf(csrf -> csrf.disable())
        .oauth2ResourceServer(o -> o.jwt(withDefaults()))
        .exceptionHandling(e -> e.authenticationEntryPoint(
            new HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)))   // 401, not a 302
        .build();
}

@Bean
@Order(2)                                       // the browser fallback
SecurityFilterChain browserChain(HttpSecurity http) throws Exception {
    return http
        .authorizeHttpRequests(a -> a.anyRequest().authenticated())
        .formLogin(withDefaults())
        .build();
}
```

| Rule | What it actually does |
| --- | --- |
| `securityMatcher` / `requestMatcher` on the chain | Restricts which requests this chain handles. The FIRST chain whose matcher matches is used, exclusively |
| `@Order` on the bean | Decides which chain is consulted first. Highest priority first. It is the same `@Order` mechanism as everything else in Spring, and it is easy to forget |
| A chain with no matcher | Matches every request not already claimed. If it is not last, it swallows the rest of the application |
| Chain ordering is global, not per-path | A single mis-ordered `@Order` sends `/api/**` traffic to the browser chain and produces a 302 to a login page from a service-to-service client |
| `securityMatcher` is evaluated once | Matching happens once, at chain-selection time, not per filter — so a chain is chosen before a single filter runs |

`securityMatcher` is an `AntPathRequestMatcher`/`PathPatternRequestMatcher` chain, and it can
also be a `RequestMatcher` you write, which is how you match on method, content type, or a
header:

```java
.securityMatcher(request -> request.getServletPath().startsWith("/internal/"))
.securityMatcher(new OrRequestMatcher(
    new AntPathRequestMatcher("/api/**"),
    new AntPathRequestMatcher("/graphql")))
```

> **STAFF-LEVEL CONSIDERATION**
>
> Multiple chains in one process is a good pattern and a bad default. It is good when the
> two callers genuinely differ — a human with a session cookie, and a service with a bearer
> token — because it makes the difference explicit and testable, and it keeps the stateless
> chain free of the session machinery it does not need. It becomes a liability when teams
> use it to give one application eight subtly different rule sets: then "what protects
> `/api/v2/orders/{id}`?" is a question no reviewer can answer without running the code, and
> a chain added for one feature quietly changes the behaviour of another.
>
> The staff-level move is to bound the number of chains deliberately (two is almost always
> right: human-facing and machine-facing), and to write the test that asserts the
> classification — a `@WebMvcTest` that proves an anonymous browser request to a protected
> page gets a redirect and an anonymous bearer-token request gets a 401. If you cannot write
> that test, you do not have two chains, you have an undocumented one.

### 1.5 `SecurityContextHolder` and the Strategy Model

`SecurityContextHolder` is a static holder of a `SecurityContext`, and how it stores it is
pluggable — which matters because the default assumption (a `ThreadLocal`) is wrong on
both async and reactive stacks.

```java
public interface SecurityContextHolderStrategy {
    void clearContext();
    Authentication getAuthentication();
    void setAuthentication(Authentication auth);
    void setDeferredContext(Supplier<Authentication> deferred);
    Supplier<Authentication> getDeferredContext();
    SecurityContext createEmptyContext();
    SecurityContext getContext();          // may create
    void setContext(SecurityContext context);
}
```

| Strategy | Behaviour | When |
| --- | --- | --- |
| `ThreadLocalSecurityContextHolderStrategy` | A plain `ThreadLocal` | Default. Correct for a servlet container that runs one request per thread |
| `InheritableThreadLocalSecurityContextHolderStrategy` | `InheritableThreadLocal` — child threads inherit at *creation* | Legacy, and dangerous: a pooled thread keeps the value from whoever created it |
| `MODE_INHERITABLETHREADLOCAL` | The above, set globally | Rarely correct for a server. Understand why before you set it |
| `MODE_GLOBAL` | Static single value | Only for standalone/CLI tools |
| Reactive strategy | Context in the Reactor `Context`; `DelegatingSecurityContextRepository` | WebFlux. A `ThreadLocal` is meaningless on an event loop |

```java
SecurityContextHolder.setStrategyName(SecurityContextHolder.MODE_INHERITABLETHREADLOCAL);
```

> **INTERVIEW TRAP — WHY `INHERITABLETHREADLOCAL` IS DANGEROUS**
>
> `InheritableThreadLocal` copies the value at *thread creation*, not at task submission.
> A thread pool created while a request was in flight inherits that request's
> `Authentication` permanently, and then serves a completely different user. This is the
> classic "user A sees user B's data" leak, and it only reproduces under concurrency, which
> is why it survives staging. The correct mechanism for propagating context into work you
> hand to another executor is explicit delegation, which brings us to the next class.

**`DelegatingSecurityContextAsyncTaskExecutor` and `DelegatingSecurityContextScheduler`**
are wrappers that capture the calling thread's `SecurityContext` and re-install it around
each unit of work, then clear it afterwards. This is the correct way to propagate identity
into `@Async` methods and scheduled jobs:

```java
@Bean
TaskExecutor taskExecutor() {
    ThreadPoolTaskExecutor pool = new ThreadPoolTaskExecutor();
    pool.setCorePoolSize(10);
    pool.setMaxPoolSize(50);
    pool.setQueueCapacity(500);
    pool.setThreadNamePrefix("async-");
    // The wrapper is the point: without it the async method sees an empty context.
    return new DelegatingSecurityContextAsyncTaskExecutor(pool);
}
```

For the servlet async case, `WebAsyncManagerIntegrationFilter` (position 2 in the chain)
registers a `SecurityContextCallableProcessingInterceptor` and the matching
`DeferredResult`/`WebAsyncTask` interceptor, so a `Callable` or a `CompletableFuture`
returning controller method still sees the right principal. Without it, code after the
async boundary sees `null` — and if that null is a `SecurityContextHolder.getContext()
.getAuthentication()` call, you get a `NullPointerException` on a code path that works
under `MockMvc` and fails only under real async servlet dispatch.

> **PRODUCTION SCENARIO**
>
> Problem: an audit record written from a `@Async` listener has `principal = null` for about
> 1% of entries, and only under load.
> Investigation: the entries are exactly the ones where the audit listener ran on a pool
> thread, and a thread dump showed the pool threads had been created inside a request
> context.
> Root cause: the `ThreadPoolTaskExecutor` was injected directly. `SecurityContextHolder`'s
> `ThreadLocal` is empty on the pool thread, and the listener read `null` rather than
> failing.
> Solution: wrap the executor in `DelegatingSecurityContextAsyncTaskExecutor`. The
> alternative — `InheritableThreadLocal` — would have introduced a worse bug.
> Prevention: any executor you hand a principal-sensitive task to gets the delegating
> wrapper, and the code that reads the context asserts non-null rather than tolerating it.

### 1.6 `SecurityContextPersistenceFilter` vs Explicit Save/Load

In Spring Security 5.6 and earlier, the filter that loaded and saved the context around the
chain was `SecurityContextPersistenceFilter`. In **5.7 it was replaced by
`SecurityContextHolderFilter`**, and the difference is not cosmetic: the new filter does not
persist anything to a repository by default.

```text
SecurityContextPersistenceFilter (≤ 5.6)
   ├─ load SecurityContext from HttpSession (or the configured repository)
   ├─ set it on SecurityContextHolder
   ├─ chain.doFilter(...)
   └─ save it back to the repository in a finally block, and save the session if dirty

SecurityContextHolderFilter (5.7+)
   ├─ load lazily from the configured SecurityContextRepository
   ├─ set it on SecurityContextHolder
   ├─ chain.doFilter(...)
   └─ does NOT save. If nothing explicitly saves the context, a new Authentication
      created during the request is lost at the end of it.
```

In a **stateless** API you want exactly that: load nothing, save nothing. The idiomatic
configuration is to use `NullSecurityContextRepository` and manage the context yourself:

```java
@Bean
SecurityFilterChain apiChain(HttpSecurity http) throws Exception {
    return http
        .securityMatcher("/api/**")
        .sessionManagement(s -> s
            .sessionCreationPolicy(SessionCreationPolicy.STATELESS)   // no session
            .securityContext(c -> c
                .securityContextRepository(new NullSecurityContextRepository())))
        .oauth2ResourceServer(o -> o.jwt(withDefaults()))
        .csrf(csrf -> csrf.disable())
        .build();
}
```

`NullSecurityContextRepository` means the holder is empty at the start of the request and
nothing is written at the end. Whatever filter sets the `Authentication` (the bearer-token
filter, or your own JWT filter) owns the whole lifetime of the context. This is why the
`sessionCreationPolicy(STATELESS)` line and the `securityContextRepository` line are both
needed: the first stops sessions being *created*, the second stops the context being
*persisted* to a place it isn't.

> **MUST REMEMBER**
>
> `SecurityContextHolderFilter` does not save. If you set an `Authentication` on the holder
> during a request and nothing else saves it, that authentication exists only for the rest of
> that request. A filter that authenticates and then relies on later code to persist it has
> a bug that shows up as "works until the session expires".

### 1.7 `FilterChainProxy` and the Cost of the Chain

`FilterChainProxy` is the single filter Boot registers. It holds a `List<SecurityFilterChain>`
and, on each request, walks the chains asking each one whether it matches, then delegates
to the matching chain's internal filter list. That indirection is why:

- `@Order` on a `SecurityFilterChain` bean is meaningful — it is the chain's evaluation
  order inside the proxy;
- the "chain" in `SecurityFilterChain` is not the same object as the `SecurityFilterChain`
  bean you declare — yours is a `DefaultSecurityFilterChain` **specification**, and the proxy
  builds a real one from it;
- `http.addFilterBefore` is expressed as an `OrderedFilter`, and Spring resolves the
  relative order by class name comparison against the registered filters.

**The cost: every request pays for the whole chain, secured or not.** A request for
`/favicon.ico` runs `DisableEncodeUrlFilter`, `WebAsyncManagerIntegrationFilter`,
`SecurityContextHolderFilter`, `HeaderWriterFilter`, `CorsFilter`, `CsrfFilter`,
`LogoutFilter`, and the rest, then the authorization filter makes a decision, and then
`DispatcherServlet` returns 404. There is no "is this endpoint public" fast path unless you
build one with `securityMatcher`.

| Optimisation | What it buys | What it costs |
| --- | --- | --- |
| `web.ignoring().requestMatchers("/static/**", "/actuator/health")` | Bypasses the chain entirely — genuinely free | Also bypasses `HeaderWriterFilter`, so you lose the default security headers on those paths |
| A `securityMatcher` chain for public paths with `permitAll` | Keeps the headers, still pays the chain | Nearly free; the work is the same filters with a decision that always says yes |
| `OncePerRequestFilter` guards on async dispatch | Avoids re-running your filter on `ASYNC` redispatch | One more thing to get right |

The honest numbers: a default chain is on the order of a dozen filter invocations, each
doing a small amount of work — SpEL evaluation for `permitAll` is not free, BCrypt is
~100ms but only on the authentication path. On a modern core this is a rounding error next
to serialisation and I/O. It matters when you are on a saturated thread pool, and it matters
much more when you have added eight custom filters, each of which does a database lookup.
`web.ignoring()` is the tool for genuinely public static assets, and its cost — losing the
default headers on those paths — is usually acceptable for `favicon.ico` and not acceptable
for anything a browser will execute.

> **SCALING REALITY CHECK**
>
> The failure mode is not "the filter chain is slow", it is "the filter chain does I/O".
> A single custom `OncePerRequestFilter` that loads a tenant or a permission from the
> database adds a database round trip (~1–5ms) to *every* request including anonymous
> 401s and health checks. At 2,000 requests/second that is 2,000–10,000 extra queries per
> second, and it is invisible in a load test that only checks p50. If you need per-request
> data in the chain, cache it — in a Caffeine cache with a short TTL, keyed by whatever the
> lookup used — and remember that the cache is now on the authentication path and needs a
> size bound and a hit-rate metric.

#### Common Mistakes

- Believing Spring Security is built on `HandlerInterceptor`s. It is a `Filter` chain, which
  is why it protects requests that have no controller method at all.
- Saying `WebSecurityConfigurerAdapter` was "removed in 5.7". It was **deprecated** in 5.7
  and **removed in 6.0**.
- Declaring a catch-all `SecurityFilterChain` without `@Order(1)`, so a browser chain
  swallows `/api/**` and a service client gets a 302 to a login page.
- Forgetting `@Order` on multi-chain configurations. Chain evaluation order is bean
  `@Order`, not declaration order in the file, and it is not alphabetical.
- Reading `SecurityContextHolder` in an `@Async` method or a scheduled job with no executor
  wrapper and concluding the user is anonymous. The thread is the problem, not the user.
- Setting `MODE_INHERITABLETHREADLOCAL` to "fix" async propagation. It leaks one user's
  identity into every pooled thread created during their request.
- Assuming `SecurityContextHolderFilter` persists the context. It does not.

#### Interview Questions — The Filter Chain

**Q1. Is Spring Security a filter or an interceptor, and why does the answer matter?**
`TRICKY`

A `Filter` — Boot registers one `springSecurityFilterChain` (`DelegatingFilterProxy` over
`FilterChainProxy`) with the servlet container, ahead of `DispatcherServlet`. It matters
because a filter runs for every request, including ones with no handler: static resources,
`/error`, 404s, and any path an attacker guesses. An interceptor only runs once a handler
has been resolved, so authorization implemented there is bypassed by requesting a path that
maps to no controller. A second consequence is that everything the chain does — the CSRF
check, the header writer, the session policy — applies to the whole application rather than
to controller methods.

**Q2. What are the five collaborators in an authentication attempt, and what does each
one do?** `TRICKY`

`Authentication` is the token/result object — credentials on the way in, principal plus
authorities on the way out. `AuthenticationManager` is the orchestrator; it takes a token
and returns an authenticated token or throws. `AuthenticationProvider` performs one actual
check for one token type and returns `null` if it does not support that type.
`UserDetailsService` loads the user record by username — it is not an authentication
mechanism, only a lookup. `PasswordEncoder` hashes and matches passwords. Confusing
`UserDetailsService` with "the thing that authenticates" is the common error; it loads, and
`DaoAuthenticationProvider` decides.

**Q3. Why did Spring Security remove `WebSecurityConfigurerAdapter`, and what replaces it?**
`TRICKY`

Deprecated in 5.7, removed in 6.0. It forced one rule set per adapter instance, made
multiple chains awkward, and hid configuration in an inherited class. The replacement is the
`SecurityFilterChain` **interface** — you declare `@Bean`s returning `SecurityFilterChain`,
each with its own `HttpSecurity` and an optional `securityMatcher`, ordered by `@Order`, with
the first matching chain winning. The migration is mechanical for a single chain and is a
design task for a complicated multi-chain application.

**Q4. Walk through the default filter chain order and say which filter you'd inspect first
if a request is being rejected unexpectedly.** `ADVANCED`

`DisableEncodeUrlFilter`, `WebAsyncManagerIntegrationFilter`, `SecurityContextHolderFilter`,
`HeaderWriterFilter`, `CorsFilter`, `CsrfFilter`, `LogoutFilter`, then the authentication
filter for the configured mechanism (`BearerTokenAuthenticationFilter`,
`UsernamePasswordAuthenticationFilter`, `BasicAuthenticationFilter`), then
`RequestCacheAwareFilter`, `SecurityContextHolderAwareRequestFilter`,
`AnonymousAuthenticationFilter`, `SessionManagementFilter`, `ExceptionTranslationFilter`, and
finally the authorization filter (`AuthorizationFilter` in 6.x; `FilterSecurityInterceptor`
in 5.x, removed in 6.1). For an unexpected rejection, `ExceptionTranslationFilter` is where
the decision is turned into an HTTP status, and `SecurityContextHolderFilter` is where an
absent `Authentication` originates — the two filters that explain almost every confusing
symptom.

**Q5. A service-to-service client suddenly receives a 302 redirect to a login page. What
happened, and where?** `SCENARIO`

A multi-chain configuration with the chain orders wrong, or with no `securityMatcher` on the
API chain. Because the first matching `SecurityFilterChain` wins exclusively, a browser chain
declared at a higher priority — or a catch-all chain declared too early — captures
`/api/**` and applies form-login semantics, and `ExceptionTranslationFilter` invokes the
browser's `AuthenticationEntryPoint`. The fix is to scope the API chain with
`securityMatcher("/api/**")`, order it first, and set an
`HttpStatusEntryPoint(HttpStatus.UNAUTHORIZED)` as its entry point so a missing token is a
401 rather than a redirect.

**Q6. What does `SecurityContextHolder` use by default, and when is it wrong?**
`TRICKY`

A plain `ThreadLocal`, via `ThreadLocalSecurityContextHolderStrategy`, which is correct only
while one request occupies one thread for its whole life. It is wrong across an async
boundary (`@Async`, a manually created pool, `startAsync()`), on a WebFlux event loop (where
the reactive strategy stores the context in the Reactor `Context`), and it is actively unsafe
with `InheritableThreadLocal`, which copies at thread *creation* and permanently poisons a
pooled thread. The correct fix in every case is explicit propagation —
`DelegatingSecurityContextAsyncTaskExecutor`, or `WebAsyncManagerIntegrationFilter` for
servlet async.

**Q7. Does every request pay for the full filter chain, and is that ever worth
optimising?** `STAFF`

Yes, and it normally is not worth optimising — a dozen filters doing small work is not where
a request's time goes. It becomes worth it when a custom filter in the chain does I/O, since
that puts a database round trip on every request including anonymous ones, and at a few
thousand requests per second that is a load-generating mistake rather than a latency one.
The real optimisations are `web.ignoring()` for genuinely public static assets (accepting
that they lose `HeaderWriterFilter`'s headers) and making sure your own filters are guarded
against async redispatch. Profiling a chain that has two filters in it is a way of
avoiding the question.

> **CHAPTER 1 SUMMARY**
>
> Spring Security is a servlet `Filter` chain, not an interceptor — which is why it
> protects requests that never reach a controller, and why authorization written as an
> interceptor is bypassable. `WebSecurityConfigurerAdapter` was deprecated in 5.7 and
> removed in 6.0; the modern shape is one or more `SecurityFilterChain` beans scoped by
> `securityMatcher` and ordered by `@Order`, with the first match winning exclusively.
> `SecurityContextHolder` is a `ThreadLocal` by default and needs explicit delegation to
> cross a thread boundary; `SecurityContextHolderFilter` loads but does not save, so a
> stateless chain wants `NullSecurityContextRepository` and full manual control of the
> context's lifetime. Every request pays for the whole chain, and the cost that matters is
> never the filter count — it is I/O inside a filter.

#### Further Reading

- [Spring Security Reference — Architecture](https://docs.spring.io/spring-security/reference/servlet/architecture.html) — the filter chain diagram and the role of each filter, from the source docs themselves.
- [Spring Security Reference — Java Configuration](https://docs.spring.io/spring-security/reference/servlet/configuration/java.html) — the `SecurityFilterChain` DSL, `securityMatcher`, and filter ordering.
- [Spring Security Reference — Authentication Architecture](https://docs.spring.io/spring-security/reference/servlet/authentication/architecture.html) — the manager/provider hierarchy, the strategy model, and the `SecurityContextHolder` lifecycle.
- [Spring Security Reference — Migration Guide](https://docs.spring.io/spring-security/reference/migration/index.html) — what was removed in 6.0 and 6.1, including `WebSecurityConfigurerAdapter`, `authorizeRequests()` and `AccessDecisionManager`.
- [Spring Security Reference — Concurrency](https://docs.spring.io/spring-security/reference/servlet/integrations/concurrency.html) — `DelegatingSecurityContextAsyncTaskExecutor` and the async/scheduled context propagation model.

## Chapter 2 — Authentication

### 2.1 The Five Collaborators

Authentication in Spring Security is five objects with distinct jobs. Interviews go wrong
when candidates answer "it uses a `UserDetailsService`", which is a lookup, not a check.

```text
  UsernamePasswordAuthenticationToken          ← the credential-bearing token
                        │
                        ▼
              AuthenticationManager                ← the orchestrator
                        │
                        ▼
  ┌──────────────── AuthenticationProvider ────────────────┐
  │  supports(token)?  ── no ──► return null, try next      │
  │  authenticate(token)                                    │
  │     └─ load via UserDetailsService                      │
  │        └─ compare via PasswordEncoder                   │
  └─────────────────────────────────────────────────────────┘
                        │
                        ▼
              Authentication (principal + authorities)   ← the result
```

| Collaborator | Responsibility | Common confusion |
| --- | --- | --- |
| `Authentication` | Both the credential carrier on the way in and the principal/authorities result on the way out | Believed to be two types. It is one interface; `UsernamePasswordAuthenticationToken` is the unauthenticated form, the same class authenticated |
| `AuthenticationManager` | Orchestrates: iterate providers, return the first successful result, throw if none succeed | Believed to do the checking. It delegates |
| `AuthenticationProvider` | Performs the actual check for one token type; returns `null` if it does not `supports` the token | Returning `null` for "authentication failed" instead of throwing. `null` means "I don't handle this", not "no" |
| `UserDetailsService` | `loadUserByUsername` — a lookup, nothing more | Believed to validate. It does not |
| `PasswordEncoder` | `encode` and `matches` — hash and compare | `matches(raw, encoded)` argument order, which is easy to get backwards |

### 2.2 `ProviderManager` and `ProviderNotFoundException`

`ProviderManager` is the default `AuthenticationManager` implementation. It holds an ordered
`List<AuthenticationProvider>` and does exactly this:

```java
public Authentication authenticate(Authentication authentication) {
    for (AuthenticationProvider provider : getProviders()) {
        if (provider.supports(authentication.getClass())) {
            Authentication result = provider.authenticate(authentication);
            if (result != null) return result;             // provider says: authenticated
            // provider returned null → "I don't know" → keep looking
        }
    }
    // Nothing handled it
    if (parent != null) return parent.authenticate(authentication);
    throw new ProviderNotFoundException(getMissingProviderMessage(authentication));
}
```

| Outcome | Meaning | Result |
| --- | --- | --- |
| Provider returns a non-null `Authentication` | Authenticated | `ProviderManager` returns it immediately — **first match wins, order is significance** |
| Provider returns `null` | "I do not handle this token" | Next provider is tried |
| Provider throws `BadCredentialsException` | "I handle it, and the answer is no" | The exception propagates immediately; the remaining providers are **not** consulted |
| Every provider returns `null` and there is no parent | Nothing supported the token | `ProviderNotFoundException` |

> **MUST REMEMBER**
>
> Returning `null` and throwing are semantically different in Spring Security, and
> confusing them produces a bug that looks like "my second provider is never called". A
> provider returns `null` for a token type it does not support, and throws
> `BadCredentialsException` for a token it supports and the answer to which is no. If your
> provider returns `null` when the password is wrong, `ProviderManager` tries the next
> provider and, if there is none, throws `ProviderNotFoundException` — which surfaces as a
> 500 or an opaque error rather than a 401.

`ProviderNotFoundException` in a normal application almost always means one of two things:
a token type reached the chain that no provider supports (a JWT arriving at a chain
configured only with form login), or a custom `AuthenticationProvider` returns `null` where
it should have thrown.

The parent chain matters more than it looks. `ProviderManager` has a parent, and if no
local provider handles the token it delegates upward. This is how you add a second
mechanism — OAuth2 resource server registers its own provider into the same
`ProviderManager`, and parent delegation is how libraries extend authentication without
replacing yours.

### 2.3 `DaoAuthenticationProvider` and the Pre-Authentication Checks

The default provider for username/password is `DaoAuthenticationProvider`. The part people
forget is that it performs **four account-state checks before it ever touches the password**,
and that its password comparison is deliberately non-constant-time to avoid a user-enumeration
timing signal.

```java
public Authentication authenticate(Authentication authentication) {
    String username = authentication.getName();
    UserDetails user = this.userDetailsService.loadUserByUsername(username);

    if (user == null) {
        throw new UsernameNotFoundException("User " + username + " not found");
    }

    // ── The four pre-authentication checks ───────────────────────
    if (!user.isEnabled())                    throw new DisabledException("User is disabled");
    if (!user.isAccountNonExpired())          throw new AccountExpiredException("Account expired");
    if (!user.isCredentialsNonExpired())      throw new CredentialsNotFoundException("Credentials expired");
    if (!user.isAccountNonLocked())           throw new LockedException("Account locked");

    // ── Then the password ───────────────────────────────────────
    String presented = authentication.getCredentials().toString();
    if (!this.passwordEncoder.matches(presented, user.getPassword())) {
        throw new BadCredentialsException("Bad credentials");
    }

    if (user instanceof PasswordAuthenticationRequiredException) {   // e.g. credentials
        throw new BadCredentialsException("Must change password");    // expired in a different sense
    }

    UsernamePasswordAuthenticationToken result = UsernamePasswordAuthenticationToken
            .authenticated(user.getUsername(), null, user.getAuthorities());
    result.setDetails(this.userDetailsService);                      // for the audit trail
    return result;
}
```

All four `UserDetails` flags are `true` by default in `User.UserBuilder` — which means a
custom `UserDetails` implementation that forgets to override them grants a locked account
access. That is a genuine production bug in custom user stores: someone implements
`UserDetails` by returning `true` from every method as a stub, and the disabled and locked
branches are unreachable.

> **PRODUCTION RELEVANCE**
>
> The exception type matters for two reasons. First, you can map them to HTTP: most
> applications should return an identical 401 for `BadCredentialsException`,
> `UsernameNotFoundException`, `DisabledException` and `LockedException`, because
> distinguishing them tells an attacker which usernames exist. Second, they are what
> `AuthenticationFailureBadCredentialsEvent` and friends are built from — a custom
> `AuthenticationFailureHandler` that only handles `BadCredentialsException` will leak the
> account's existence through a different status code. Handle them all, or handle none.

### 2.4 Password Encoding

`PasswordEncoder` has two operations and the security of the whole scheme rests on
`matches` being safe to call with attacker-controlled input.

```java
public interface PasswordEncoder {
    String encode(CharSequence rawPassword);
    boolean matches(CharSequence rawPassword, String encodedPassword);
    default boolean upgradeEncoding(String encodedPassword) { return false; }
}
```

`upgradeEncoding` is the hook that makes the migration pattern in 2.6 work, and it is the
least-known method on the interface.

| Encoder | Notes |
| --- | --- |
| `BCryptPasswordEncoder` | Default strength **10**. ~100ms per hash at strength 10 on a modern core. Salt is embedded in the output string, so the hash is self-contained |
| `SCryptPasswordEncoder` | Memory-hard; parameters in the encoded string. `DelegatingPasswordEncoder` requires `{scrypt}` support to be explicitly supplied |
| `Argon2PasswordEncoder` | The current OWASP first choice — memory-hard, tunable, and the encoded string carries its parameters. Requires Bouncy Castle |
| `Pbkdf2PasswordEncoder` | `DelegatingPasswordEncoder`'s default when no other is registered — `{pbkdf2}` with a random salt, 185,000 iterations by default in recent versions |
| `NoOpPasswordEncoder` | `{noop}` — compares plaintext. A demo tool and a production vulnerability |

`BCryptPasswordEncoder` truncates at 72 bytes, which is a real and permanent property of the
algorithm: two passwords that share a 72-byte prefix are the same password to it. For a
service where users choose their own passwords, that is a fine trade; for a system where a
72+ character password is generated by a client, the collision is silent.

### 2.5 The Delegating Encoder and Hash Migration

This is the single best production pattern in the authentication story, and it is
underappreciated.

`DelegatingPasswordEncoder` prefixes every stored hash with `{id}` — `{bcrypt}$2a$10$...`,
`{argon2}$argon2id$v=19$...`, `{pbkdf2}$...`. That prefix means the application can hold
hashes made by **different algorithms at the same time**, and know which one produced each.

```java
@Bean
PasswordEncoder passwordEncoder() {
    Map<String, PasswordEncoder> encoders = new HashMap<>();
    encoders.put("bcrypt", new BCryptPasswordEncoder(12));
    encoders.put("argon2", Argon2PasswordEncoder.defaultsForSpringSecurity_v5_8());
    encoders.put("pbkdf2", Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8());
    encoders.put("noop", NoOpPasswordEncoder.getInstance());

    DelegatingPasswordEncoder encoder = new DelegatingPasswordEncoder("bcrypt", encoders);
    encoder.setDefaultPasswordEncoderForMatches(new BCryptPasswordEncoder(12));
    return encoder;
}
```

**The migration pattern, and it is genuinely elegant:** register the new algorithm as the
*default for encoding* and the old one as the *fallback for matching*, and let Spring
re-hash on next login.

```java
// 2023: default encoding = bcrypt, can still match {noop}
// 2025: default encoding = argon2, can still match {bcrypt}
Map<String, PasswordEncoder> encoders = new HashMap<>();
encoders.put("argon2", argon2);          // ← what NEW passwords get
encoders.put("bcrypt", bcrypt12);        // ← what OLD passwords are compared against
encoders.put("noop", NoOpPasswordEncoder.getInstance());
return new DelegatingPasswordEncoder("argon2", encoders);
```

`DaoAuthenticationProvider` calls `passwordEncoder.upgradeEncoding(storedHash)` after a
successful match, and if it returns `true` it re-encodes the presented password and calls
`updatePassword(...)` on the `UserDetails`. From the application's point of view the
migration is a one-line config change plus time. From the security team's point of view, a
weak-algorithm database is a **burn-down problem** — you cannot re-hash offline, because
you don't have the plaintext — and this is the only mechanism that actually solves it,
because the only moment you have the plaintext is the moment the user logs in.

```text
  User logs in with a {bcrypt} hash
            │
            ▼
  ProviderManager → DaoAuthenticationProvider
            │
            ├─ loadUserByUsername → stored "{bcrypt}$2a$10$..."
            ├─ passwordEncoder.matches(presented, stored)   → TRUE
            ├─ passwordEncoder.upgradeEncoding(stored)      → TRUE  (default is now argon2)
            └─ userDetailsService.updatePassword(user, encode(presented))   ← RE-HASHED
```

> **PRODUCTION RELEVANCE**
>
> The cost of the pattern is that the algorithm choice becomes data in your user table
> rather than a constant in your code, and that means an `updatePassword` write on
> essentially every successful login for every migrated user. Two concrete consequences to
> plan for: the `updatePassword` call must not be inside a transaction that also does other
> work, and the `UserDetailsService` implementation must actually persist it — the
> in-memory and JPA-provided implementations do, and a hand-rolled one that returns an
> immutable `UserDetails` silently discards the upgrade. If it does not persist, the
> migration never progresses and nothing tells you.
>
> Also plan for the **lockout policy conflict**: rolling from BCrypt 10 to BCrypt 12 changes
> the hash time by roughly 4×. If your failed-login lockout counts attempts and the
> comparison is on the slow path, you have changed your effective rate limit by 4× as a side
> effect of a security upgrade.

### 2.6 Where the Password Check Lives

```java
@Bean
UserDetailsService userDetailsService(DataSource dataSource) {
    // Provided out of the box by spring-security-jdbc
    JdbcDaoImpl users = new JdbcDaoImpl();
    users.setDataSource(dataSource);
    users.setUsersByUsernameQuery(
        "select username, password, enabled from users where username = ?");
    return users;
}

@Bean
DaoAuthenticationProvider daoAuthenticationProvider(UserDetailsService uds,
                                                   PasswordEncoder encoder) {
    DaoAuthenticationProvider provider = new DaoAuthenticationProvider();
    provider.setUserDetailsService(uds);
    provider.setPasswordEncoder(encoder);
    return provider;
}
```

| Where the user store lives | Verdict |
| --- | --- |
| `InMemoryUserDetailsManager` | Correct for a test, a tutorial, and a service with fewer than a handful of users. A liability the moment it holds a real account, because the password is in source or in a property file and there is no lockout state |
| `JdbcDaoImpl` | Fine. One query, no ORM surprises. Remember to return `enabled` — the column must exist and be true |
| JPA repositories | Fine. The trap is `getAuthorities()` issuing a lazy collection load *inside* the authentication transaction, and returning a mutable `Collection` implementation from JPA, which `DaoAuthenticationProvider` warns about because it mutates the collection to wrap the principal |
| LDAP / AD | Fine, and remember that AD has its own lockout semantics, plus the fact that a successful LDAP bind proves the password to *that* directory and nothing about your local account state |
| A remote HTTP service | Possible and slow. Every login is now a network round trip on a path that is deliberately CPU-expensive, and it puts a third-party outage in your login |

> **INTERVIEW TRAP — "IS IN-MEMORY AUTHENTICATION SECURE?"**
>
> The reflexive answer is "no, it's for demos", which is right and useless. The senior
> answer is that `InMemoryUserDetailsManager` is a perfectly legitimate production choice for
> a service with no user-facing login at all — a machine-to-machine integration with one
> rotating credential, a health endpoint with basic auth, a service whose users live in an
> external IdP and only the group membership is local. What is never acceptable is a *browser*
> application with real users held in an in-memory map, because the credentials end up in
> source control, there is no lockout, no audit trail, and restarting the process deletes the
> account-state changes. The question worth asking in a design review is not "is it in
> memory" but "where is the authoritative user record, and who can change an account's
> state".

> **PRODUCTION SCENARIO**
>
> Problem: a password-strength policy was rolled out for new signups, and the incident
> report says the change "had no effect on any existing user".
> Investigation: the `users` table still contained `{noop}`-prefixed values for every
> account created before the change, and the `passwordEncoder` bean had been replaced with
> a plain `BCryptPasswordEncoder` rather than a `DelegatingPasswordEncoder`.
> Root cause: replacing the delegating encoder with a bare `BCryptPasswordEncoder` makes
> `matches` unable to identify the algorithm in a `{noop}`-prefixed stored value, and
> `DaoAuthenticationProvider` — on finding a stored hash whose prefix it cannot read — threw
> a `BadCredentialsException`-shaped failure. The new encoder also had no `upgradeEncoding`
> story, so no re-hash ever occurred.
> Solution: use `DelegatingPasswordEncoder` with the new algorithm as the encoding default
> and the old ones retained for matching. Re-hash happens on next login.
> Prevention: an alert on the proportion of stored hashes whose `{id}` prefix is not the
> current default. That single metric tells you the migration is working, and it is
> answerable from a `SELECT` on the user table.

#### Common Mistakes

- Believing `UserDetailsService` authenticates. It loads a `UserDetails`; `DaoAuthenticationProvider`
  decides. A `UserDetailsService` that returns a `UserDetails` with every flag `true` has
  made the disabled and locked branches unreachable.
- Returning `null` from a custom `AuthenticationProvider` when the password is wrong.
  `null` means "unsupported token type"; a wrong password must throw `BadCredentialsException`.
- Forgetting that `DaoAuthenticationProvider` writes an upgraded hash back through
  `updatePassword`, and that a hand-rolled `UserDetailsService` which ignores it makes the
  hash migration silently never progress.
- `PasswordEncoder.matches(raw, encoded)` with the arguments reversed. The signature is
  `matches(CharSequence rawPassword, String encodedPassword)` and both are `CharSequence`
  overloads that will not catch the mistake at compile time in some call shapes.
- Using `BCryptPasswordEncoder(10)` forever. The default strength was set when a modern core
  was slower; each +1 is 2× the CPU. Re-tune and use the delegating encoder so you can.
- Believing `InMemoryUserDetailsManager` is always wrong. It is right for a machine-facing
  service with one credential and wrong for any application with real humans.

#### Interview Questions — Authentication

**Q1. Name the five collaborators in an authentication attempt and say which one does the
actual checking.** `TRICKY`

`Authentication` (the token/credential and the result), `AuthenticationManager` (the
orchestrator), `AuthenticationProvider` (the check, per token type), `UserDetailsService` (the
user lookup), `PasswordEncoder` (hash and compare). The checking is done by the
`AuthenticationProvider` — specifically `DaoAuthenticationProvider` for username/password,
which loads through `UserDetailsService`, runs the four account-state checks, and then
compares via the `PasswordEncoder`. The most common wrong answer names
`UserDetailsService` as the mechanism, which is a lookup.

**Q2. What does `ProviderNotFoundException` mean, and when do you actually see it?** `TRICKY`

It means `ProviderManager` iterated every registered provider, none of them
`supports()` the token class, and there was no parent that did. In practice it means a token
type reached a chain with no provider for it — a JWT hitting a chain configured only for form
login, or an OAuth2 login token hitting a chain with the resource-server filter removed. It
is also what you get when a custom provider returns `null` on a path where it should have
thrown `BadCredentialsException`, because "unsupported" and "failed" get conflated. The
exception is not a normal authentication failure; a normal failure is
`BadCredentialsException`, which propagates immediately and skips the remaining providers.

**Q3. Why does `DaoAuthenticationProvider` check `enabled`, `accountNonExpired`,
`credentialsNonExpired` and `accountNonLocked` before comparing the password, and what goes
wrong if a custom `UserDetails` returns `true` for all four?** `TRICKY`

They are the account-state gates, and they are checked first so a disabled or locked account
is rejected on its state rather than on its password — which also means a disabled account
cannot be probed for a valid password. The failure mode with a custom `UserDetails` that
returns `true` everywhere is that the disabled and locked branches become unreachable code:
the account-state mechanism is present, looks correct in review, and does nothing. Every
custom `UserDetails` implementation must override all four, and the default `User` builder
sets them all to `true`, which is exactly why the stub is dangerous.

**Q4. Why is BCrypt's default strength 10, and what does changing it cost?** `SCALING`

BCrypt is deliberately slow — that is the design, because a fast hash is a hash an attacker
can brute-force with GPUs. Strength is a log2 iteration count, so every +1 doubles the work:
strength 10 is roughly 2^10 rounds, about 50–100ms on a modern server core, and strength 12
is about 4× that. The cost is paid on the login path, on registration, and on every
`PasswordEncoder.matches` — including failed logins, which means a failed-login rate limiter
now sees 4× slower comparisons. At 10,000 concurrent login attempts the difference is
measurable CPU, and it is CPU you spent deliberately.

**Q5. Explain the `DelegatingPasswordEncoder` hash-migration pattern and why it is the only
practical way to change algorithms.** `STAFF`

Every stored hash carries an `{id}` prefix naming the algorithm that produced it. The bean
registers new algorithms as the encoding default and retains old ones for matching, so
`DaoAuthenticationProvider` can read any historical hash. After a successful `matches`, it
calls `upgradeEncoding(stored)`; if that returns `true` it re-encodes the plaintext and calls
`updatePassword` on the `UserDetailsService`, rolling the hash forward. It is the only
practical mechanism because you cannot re-hash offline — the plaintext does not exist in your
database — and the only moment you have it is the moment the user authenticates. The costs
to plan for: an extra write per login, an implementation that silently discards the update,
and the fact that upgrading BCrypt strength quadruples comparison time, which changes your
effective rate-limiting behaviour as a side effect.

**Q6. A team moved a service from form login to a JWT API and left
`sessionCreationPolicy(STATELESS)` unset. What breaks?** `SCENARIO`

The container still creates and uses an `HttpSession` if anything touches it, and
`SessionManagementFilter` keeps applying its default policy. Depending on the path this
shows up as session cookies being issued to a stateless API (a scalability bug: every instance
now needs sticky sessions or a shared session store), or as `SecurityContextHolderFilter`
persisting a context to a session that a subsequent request then picks up, reintroducing the
exact statefulness the migration was meant to remove. `STATELESS` stops the session being
created; `NullSecurityContextRepository` stops the context being written. You want both on a
stateless chain, and the second one is the more commonly forgotten.

> **CHAPTER 2 SUMMARY**
>
> Authentication is a manager that iterates providers, a provider that checks, a service
> that loads, and an encoder that compares — and the most common interview error is naming
> `UserDetailsService` as the mechanism. In `ProviderManager`, returning `null` means
> "unsupported token type" while throwing `BadCredentialsException` means "no", and
> conflating them produces `ProviderNotFoundException` where you expected a 401.
> `DaoAuthenticationProvider` runs four account-state checks before the password comparison,
> which is why a `UserDetails` that returns `true` everywhere silently disables them. The
> production pattern worth remembering is the `DelegatingPasswordEncoder` with an `{id}`
> prefix: it is the only mechanism that can roll a hash algorithm forward, because
> re-hashing offline is impossible and login is the only moment the plaintext exists.

#### Further Reading

- [Spring Security Reference — Password Encoding](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/password-encoder.html) — the encoder list, the `{id}` prefix format, and the delegation/upgrade model.
- [Spring Security Reference — `DaoAuthenticationProvider`](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/dao-authentication-provider.html) — the exact check order and the pre-authentication exceptions.
- [Spring Security Reference — Passwords](https://docs.spring.io/spring-security/reference/servlet/authentication/passwords/index.html) — the full authentication section, including in-memory, JDBC and LDAP user stores.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) — the current guidance on factor strength, lockout policy, and what to do about account enumeration.

## Chapter 3 — Authorization & Method Security

### 3.1 URL Rules and the First-Match-Wins Trap

`authorizeHttpRequests` takes a list of rules and evaluates them **in declaration order**.
The first one that matches the request decides, and nothing after it is consulted.

```java
@Bean
SecurityFilterChain chain(HttpSecurity http) throws Exception {
    return http
        .authorizeHttpRequests(a -> a
            .requestMatchers("/admin/**").hasRole("ADMIN")     // 1st — evaluated first
            .requestMatchers(HttpMethod.GET, "/public/**").permitAll()
            .anyRequest().authenticated())                     // LAST — catch-all
        .build();
}
```

Put the catch-all first and everything after it is dead code:

```java
.authorizeHttpRequests(a -> a
    .anyRequest().permitAll()                                  // ← matches EVERYTHING
    .requestMatchers("/admin/**").hasRole("ADMIN"))            // ← never reached
// A request to /admin/report is permitted, because rule 1 matched.
```

There is no warning. There is no log. The application starts, the tests that check
"anonymous can see the home page" pass, and `/admin/**` is world-writable. This is the
single most common Spring Security production bug, and it is a code-ordering bug that
looks like a policy bug.

| Matcher method | Matches |
| --- | --- |
| `requestMatchers(String...)` | Path patterns (Ant style in 5.x, `PathPattern` in 6.x) |
| `requestMatchers(HttpMethod, String...)` | Method + path |
| `requestMatchers(RequestMatcher...)` | Arbitrary predicates — headers, content type, parameters |
| `anyRequest()` | Everything remaining — must be last |
| `permitAll()`, `authenticated()`, `denyAll()` | The unconditional decisions |
| `hasRole("X")` | Requires authority `ROLE_X` |
| `hasAuthority("X")` | Requires authority `X` exactly |
| `hasAnyRole(...)`, `hasAnyAuthority(...)` | OR |
| `access(...)` | Raw SpEL — `access(new WebExpressionAuthorizationManager(...))` or a bean reference |
| `hasRole("X")` and `denyAll()` | The useful idiom for a path that must be explicitly closed off |

> **MUST REMEMBER**
>
> The order of the matchers IS the policy. There is no "most specific wins" logic, no
> specificity scoring, no reordering. The DSL is a chain of `if` statements written top to
> bottom, and a rule after an unconditional rule can never execute. Write the
> most-specific-to-least-specific order deliberately, and put `anyRequest()` last as a
> statement of intent rather than as a habit.

### 3.2 `hasRole` vs `hasAuthority`

`hasRole("ADMIN")` and `hasAuthority("ROLE_ADMIN")` are **exactly equivalent**. `hasRole`
prepends the literal string `"ROLE_"` if it is not already present, and that is the entire
difference. `hasAuthority` compares the string as given.

```java
.hasRole("ADMIN")                    // → requires "ROLE_ADMIN"
.hasAuthority("ROLE_ADMIN")          // → requires "ROLE_ADMIN"   (same thing)
.hasRole("ROLE_ADMIN")               // → requires "ROLE_ADMIN"   (no double prefix)
.hasAuthority("ADMIN")               // → requires "ADMIN"        (NOT the same)
```

This matters because there are two common ways authorities get into an `Authentication`, and
they do not agree:

```java
// Way 1: the User builder's roles → prefixed
User.withUsername("u").roles("ADMIN", "USER")
    // grants: ROLE_ADMIN, ROLE_USER   ← use hasRole("ADMIN")

// Way 2: authorities added raw
User.withUsername("u").authorities("ADMIN", "read:orders")
    // grants: ADMIN, read:orders       ← use hasAuthority("ADMIN")
```

A JWT resource server does a third thing, which is the version that surprises people: by
default `JwtAuthenticationConverter` maps the `scope`/`scp` claim to authorities **prefixed
with `SCOPE_`**:

```text
  JWT payload: { "sub": "svc", "scope": "orders.read orders.write", "aud": ["billing"] }
                     │
                     ▼  JwtGrantedAuthoritiesConverter
  authorities: SCOPE_orders.read, SCOPE_orders.write

  .hasAuthority("SCOPE_orders.read")     ← correct
  .hasRole("orders.read")                ← wrong, and silently so
```

> **INTERVIEW TRAP — "WHY DOES MY JWT SCOPE CHECK FAIL?"**
>
> The almost universal answer is "you forgot the `SCOPE_` prefix", and that is right
> roughly half the time. The other half is that the claim is named `scp` rather than `scope`,
> or that the claim is a space-delimited string while a `List` is expected, or that the
> token was minted by a provider that puts scopes in an array. The diagnostic is to log the
> authorities on the `Authentication` after a failed check — not the token, the
> authorities — because that tells you in one line whether it is a prefix, a claim-name, or a
> type problem. Logging the token itself in production is how credentials end up in a log
> aggregator.

### 3.3 URL Security Is the Wrong Layer for a Service

The strongest argument in this chapter is not about Spring Security at all. It is that
**URL-level authorization is a coarse outer boundary, and a service has a surface far larger
than its URL list.**

```text
   Where does the check have to live?

   ✔ URL rule        — good as a coarse gate: "unauthenticated users see nothing"
   ✔ Method rule     — good as the real boundary: "this operation requires this claim"

   ✘ The controller  — too many, easy to forget, and one forgotten annotation is an open door
   ✘ The repository — wrong abstraction, but occasionally right for row-level ownership
   ✘ The service    — right for business rules that must hold regardless of caller
```

The reason is discoverability. A URL rule set is a list you can read top to bottom and
audit. A method-level policy is an annotation on each of perhaps 400 methods, and the only
way to know the full set is to enumerate them — which is exactly what a security audit
spends its first hour doing, and what no linter checks by default.

There is a real counter-argument, and it is worth making because it is the strong version of
the URL-first position: a method-level check requires the call to actually go through the
proxy. If a caller reaches the object directly, or the annotation is on a private method, or
the class was excluded from proxying, the check does not run. A URL rule is enforced by the
container and cannot be bypassed by a refactor inside the bean. So the defensible position
is **both, at different altitudes**: URL rules for the coarse outer boundary (whole
subsystem requires authentication), method rules for the specific operations.

### 3.4 Method Security: The Annotations

```java
@Configuration
@EnableMethodSecurity          // Spring Security 5.6+
public class MethodSecurityConfig { }
```

| Annotation | Package | What it does |
| --- | --- | --- |
| `@PreAuthorize` | `org.springframework.security.access.prepost` | SpEL, evaluated **before** the method runs. The default choice |
| `@PostAuthorize` | same | SpEL after the method runs, with `returnObject` available. Used to authorize based on what the method produced |
| `@PreFilter` | same | Filters a collection argument before the call — `filterObject` refers to each element |
| `@PostFilter` | same | Filters the returned collection — `filterObject` is the expression root |
| `@Secured` | `org.springframework.security.access.annotation` | JSR-250-style, role names only, prefix **required**: `@Secured("ROLE_ADMIN")` |
| `@RolesAllowed` | `javax.annotation.security` | JSR-250, role names only, prefix not added |
| `@EnableGlobalMethodSecurity` | `org.springframework.security.config.annotation` | **Deprecated in 5.6, removed in 6.0.** Replaced by `@EnableMethodSecurity` |

> **MUST REMEMBER**
>
> `@EnableGlobalMethodSecurity` was deprecated in Spring Security **5.6** and **removed in
> 6.0**, replaced by `@EnableMethodSecurity`. The replacement is not a rename — the old
> annotation defaulted `prePostEnabled = true` but the new one defaults everything to
> **false**. `@EnableMethodSecurity` with no attributes enables nothing, which is the
> upgrade bug: the app compiles, the annotation is present, `@PreAuthorize` is silently not
> enforced, and every protected method is public. The correct form is
> `@EnableMethodSecurity(prePostEnabled = true)`, or the equivalent
> `@EnableMethodSecurity` plus explicit attributes for what you use.

```java
@EnableMethodSecurity(prePostEnabled = true, securedEnabled = true, jsr250Enabled = true)
```

### 3.5 The AND/OR Evaluation Trap

**Multiple `@PreAuthorize` annotations on one method are AND-ed. There is no built-in OR.**
This is the classic "my two roles don't work" bug, and it produces the most confusing error
message in the framework: `AccessDeniedException`, which is indistinguishable from "the user
had neither role".

```java
// BROKEN — nobody but a user with BOTH roles gets in.
@PreAuthorize("hasRole('ADMIN')")
@PreAuthorize("hasRole('AUDITOR')")
public void reconcile(Ledger ledger) { }

// FIXED — hasAnyRole is the OR.
@PreAuthorize("hasAnyRole('ADMIN', 'AUDITOR')")
public void reconcile(Ledger ledger) { }

// Also fine — explicit SpEL OR, with a rich error message.
@PreAuthorize("hasRole('ADMIN') or hasRole('AUDITOR')")
public void reconcile(Ledger ledger) { }
```

`@PreAuthorize` is **not** `@Repeatable` in a way that ORs. Repeating it registers multiple
interceptors and all of them must pass. The one legitimate reason to stack two
`@PreAuthorize`s is when they are genuinely independent conditions, and even then `and` is
clearer inside a single expression.

The SpEL context available in a method-security expression:

| Reference | Available in | Meaning |
| --- | --- | --- |
| `authentication` | all | The `Authentication`; `.principal`, `.credentials`, `.authorities` |
| `principal` | all | Shorthand for `authentication.principal` — a `UserDetails` or a `Jwt` |
| `returnObject` | `@PostAuthorize`, `@PostFilter` | The method's return value |
| `filterObject` | `@PreFilter`, `@PostFilter` | The current element of the collection being filtered |
| `#paramName` | method arguments, since 6.0 | The method argument by name — 6.0 relaxed the "compile with `-parameters`" requirement for this |
| `denyAll` | all | Always deny |
| `hasRole`, `hasAuthority`, `hasAnyRole`, `hasAnyAuthority`, `permitAll`, `isAuthenticated`, `isAnonymous`, `isRememberMe`, `isFullyAuthenticated` | all | The standard expression support |

```java
@Service
public class AccountService {

    // Row-level authorization expressed as data, in the expression.
    @PreAuthorize("hasAuthority('SCOPE_accounts.write')")
    @PostFilter("filterObject.ownerId == authentication.name or hasRole('ADMIN')")
    public List<Account> findVisible(List<Account> accounts) { ... }

    // Argument-aware — "you may only touch your own".
    @PostAuthorize("returnObject.ownerId == authentication.name or hasRole('ADMIN')")
    public Account load(long id) { ... }

    // Pre-filtering: hand the service only the rows the caller may touch.
    @PreFilter("filterObject.ownerId == authentication.name or hasRole('ADMIN')")
    public void archive(List<Account> candidates) { ... }

    // A custom evaluator for domain permissions that are neither roles nor scopes.
    @PreAuthorize("@accountPermission.canEdit(authentication, #id)")
    public void rename(long id, String newName) { ... }
}
```

`@PreFilter` is the most underused of the four. It is the one that keeps unauthorized rows
from reaching your service at all, rather than removing them afterwards — which matters
because a `@PostFilter` still runs the method, and the method may have already logged, sent
a notification, or charged something.

### 3.6 `AuthorizationManager` and Custom Permission Evaluation

The authorization decision in 6.x is made by an `AuthorizationManager`, which is the
generalisation that replaced `AccessDecisionManager`.

```java
@FunctionalInterface
public interface AuthorizationManager<T> {
    AuthorizationDecision check(Supplier<T> authentication, T object);

    default AuthorizationResult authorize(Supplier<? extends Authentication> auth,
                                          T object) {
        return check(auth, object);
    }

    static <T> AuthorizationManager<T> deny() { ... }
    static <T> AuthorizationManager<T> permit() { ... }
}
```

Note the `Supplier<Authentication>` in the native variant, and that the reactive variant
returns a `Mono<AuthorizationDecision>`. The `Supplier` exists so the decision can be
deferred until the authentication is actually needed — relevant when a JWT is validated
asynchronously and the authorization check must wait for it.

`hasRole`, `hasAuthority` and friends are themselves `AuthorizationManager`s, composed into
a `RequestMatcherDelegatingAuthorizationManager`. For a domain permission that is neither a
role nor a scope, there are two extension points:

```java
// 1. A custom SpEL function — @accountPermission.canEdit(...)
@Component("accountPermission")
public class AccountPermissionEvaluator {
    public boolean canEdit(Authentication auth, long accountId) {
        return accountRepository.isOwnedBy(accountId, auth.getName());
    }
}

// 2. A PermissionEvaluator for the hasPermission(...) expression
@Component
public class DomainPermissionEvaluator implements PermissionEvaluator {
    @Override
    public boolean hasPermission(Authentication auth, Object targetDomainObject,
                                 Object permission) {
        return aclService.isAllowed(auth.getName(), targetDomainObject, permission.toString());
    }
}
```

The `PermissionEvaluator` route is JSR-250-shaped and works with `hasPermission` in a SpEL
string. The custom-bean route is more explicit and is what most teams end up with, because
it is greppable — `@accountPermission.canEdit` is a string you can search for, and a
`PermissionEvaluator` is a dispatch through a permission string that is not.

### 3.7 Where Authorization Must Live

This is the staff-level section, and it is about a different failure mode than misconfiguration.

```text
   ┌──────────┐        ┌──────────────┐        ┌──────────────┐
   │  Gateway │ ──────►│  orders-svc  │ ──────►│  db          │
   │          │  token │  @PreAuthorize│       │              │
   │ has authz│        │  on service   │       │  no authz    │
   └──────────┘        └──────────────┘        └──────────────┘

   The gateway's check protects the network path.
   The service's check protects the DATA — and the data is reachable
   by the next caller, the batch job, the admin tool, and the 2027
   migration script nobody wrote yet.
```

**A service called by another service must check its own authorization.** The caller cannot
be trusted, not because it is malicious but because it will change: the gateway will be
replaced, a new consumer will be onboarded, a cron job will be added that bypasses the
gateway entirely, and the person who writes it will not read your gateway's config. This is
the zero-trust argument, and it applies to authorization at least as much as it applies to
network trust.

**A method-level check is only as good as the discipline of never bypassing the proxy.**
This is the self-invocation trap from Volume 3 Chapter 7, and it lands hardest here:

```java
@Service
public class AccountService {

    public void transfer(Transfer t) {
        this.validateLimit(t);          // ← self-invocation — @PreAuthorize NEVER RUNS
    }

    @PreAuthorize("hasRole('ADMIN')")
    public void validateLimit(Transfer t) { ... }
}
```

```text
  caller ──► AccountService proxy ──► target.transfer()
                                          │
                                          └─ this.validateLimit(t)   ← direct call
                                               the proxy is bypassed
                                               the annotation never evaluated
                                               ANY user can call transfer()
```

The failure mode is genuinely severe, and it is why the staff-level answer is never "use
`@PreAuthorize`". It is:

1. Put the check on the **public entry-point methods**, not on internal helpers. An
   annotation on a method nobody outside the class should call is decoration.
2. Make the annotated class `final`-friendly, or ensure it is proxied — Spring Security
   defaults to CGLIB proxies, but a `final` class or a `final` method with `@PreAuthorize`
   silently disables the check.
3. Add a test that asserts an unauthorized caller gets 403. If that test uses the proxied
   bean it catches most regressions; if it constructs the bean with `new` it catches nothing.
4. Have the public API of a protected service be the only way to reach the data.

> **STAFF-LEVEL CONSIDERATION**
>
> At some organisational size, "we remembered to put `@PreAuthorize` on it" stops being a
> viable strategy and becomes a governance problem. The mechanisms that work: a custom
> ArchUnit rule asserting that every `@RestController` or `@Service` in the persistence-
> touching packages is annotated, run in CI; a default-deny at the URL layer so a forgotten
> method-level check fails closed rather than open; and — the one that scales best —
> deriving the policy from the data. "Can this principal act on this row?" answered by a
> query that includes the ownership predicate, is a check that lives with the data and
> cannot be forgotten by a developer who has never heard of Spring Security. The honest
> staff-level framing is that the annotation is a *reminder to the enforcement point*, and
> the enforcement point must be the one place the data can be reached from.

> **PRODUCTION SCENARIO**
>
> Problem: an internal endpoint that returns a customer's full billing history returns 200
> to any authenticated user, including users from a different tenant. It had returned 403 for
> months.
> Investigation: a security patch added a new controller method, `getBillingHistory`, and the
> developer copied an existing controller's pattern but not its `@PreAuthorize` — the new
> method's rule was added to the URL layer, where the path was covered by a broader
> `.anyRequest().authenticated()`.
> Root cause: authorization was split across two layers with no test that asserted the
> invariant "every controller method either has a method-level rule or is covered by a
> URL-level rule that is more specific than `anyRequest()`".
> Solution: added the method-level rule, and added an ArchUnit test asserting that every
> public method on a `@RestController` in the billing package is annotated, failing the
> build otherwise.
> Prevention: the ArchUnit rule is the real fix. A test that fails the build on a missing
> annotation is the only mechanism that scales past "we review carefully".

#### Common Mistakes

- Putting `anyRequest().permitAll()` above a specific rule. The specific rule is dead code
  and `/admin/**` is public. There is no warning at startup or at runtime.
- Using `hasRole("X")` against authorities that were granted raw via
  `.authorities("X")`, or against a JWT's `scope` claim — which becomes `SCOPE_x`.
- Migrating to `@EnableMethodSecurity` and leaving `prePostEnabled` unset. It defaults to
  `false`, so no `@PreAuthorize` is enforced and the app starts normally.
- Stacking two `@PreAuthorize` annotations expecting an OR. They AND.
- Putting `@PreAuthorize` on a private or package-private method, or on a `final` method in
  a `final` class. No proxy, no check.
- Calling an annotated method from within the same class. The proxy is bypassed.
- Trusting the gateway's authorization for a service that other callers can reach.

#### Interview Questions — Authorization

**Q1. Why is `anyRequest().permitAll()` above a `/admin/**` rule one of the worst
things you can write in Spring Security, and what does the framework do about it?**
`TRICKY`

Because `authorizeHttpRequests` rules are evaluated in declaration order and the first match
wins, so a leading `anyRequest().permitAll()` matches every request and the `/admin/**` rule
is unreachable. Nothing warns you: the context starts, the authorization rules are registered,
and there is no unused-rule analysis. The defence is ordering discipline plus a test that
proves `/admin/**` rejects an anonymous request — the test is the actual control, because it
is the only thing that fails when someone reorders the list.

**Q2. `hasRole("ADMIN")` and `hasAuthority("ROLE_ADMIN")` — are they the same?** `TRICKY`

Yes. `hasRole` prepends the literal `ROLE_` prefix if it is not already present, and then
does exactly what `hasAuthority` does. The bug is never in the DSL — it is in what the
`Authentication` actually contains. `User.builder().roles("ADMIN")` grants `ROLE_ADMIN`
(matching `hasRole`), `User.builder().authorities("ADMIN")` grants `ADMIN` (matching
`hasAuthority("ADMIN")` but not `hasRole`), and a JWT's `scope` claim becomes
`SCOPE_orders.read` (matching neither). Naming authorities consistently at the point of
grant is the actual discipline; mixing conventions between the two builders is the
production bug.

**Q3. Two `@PreAuthorize` annotations on one method — AND or OR? And how do you express
OR?** `TRICKY`

AND. Each annotation registers its own interceptor and all must pass, which is why
"the user has the role but still gets 403" is such a common report — they have one of the two
roles and the expression demands both, and the resulting `AccessDeniedException` is
indistinguishable from having neither. Express alternatives with `hasAnyRole('A','B')` or
`hasRole('A') or hasRole('B')`. Repeating the annotation is only correct for genuinely
independent conditions, and even then `and` inside one expression is clearer.

**Q4. `@EnableMethodSecurity` versus `@EnableGlobalMethodSecurity` — what changed, and what
does the no-attribute form actually do?** `ADVANCED`

`@EnableGlobalMethodSecurity` was deprecated in 5.6 and removed in 6.0. The replacement,
`@EnableMethodSecurity`, defaults **all its attributes to `false`** — `prePostEnabled`,
`securedEnabled`, `jsr250Enabled` — whereas the old annotation defaulted `prePostEnabled` to
`true`. So the no-attribute form compiles, starts, and enforces nothing: every `@PreAuthorize`
is silently a comment. This is the worst class of upgrade bug because there is no failing
test and no warning; the only detection is an attempt to access a protected method
unauthenticated. The correct form is `@EnableMethodSecurity(prePostEnabled = true)`.

**Q5. When is URL-level authorization enough, and when must authorization live at the
method?** `STAFF`

URL rules are the right coarse outer boundary — "unauthenticated callers see nothing in this
subsystem" — and they have a real advantage over method rules: they are enforced by the
container and cannot be bypassed by a refactor inside a bean. Method rules are required
whenever the decision depends on the argument, the return value, the row's owner, or the
specific operation, and they are the only layer that holds for a service with more than one
caller. The defensible position is both, at different altitudes: URL rules deny by default,
method rules express the real policy. A URL rule set alone is a policy described as a list
of paths, and it is wrong the moment the same operation is reachable by a non-HTTP route.

**Q6. A colleague argues a method-level `@PreAuthorize` is the safest possible design
because the check is right next to the code. What is the strongest counter-argument?**
`STAFF`

That the check only runs if the call goes through the proxy, and "goes through the proxy" is
a property of the call site, not of the annotation. Self-invocation bypasses it, `final`
classes and `final` methods cannot be proxied and silently lose the check, and a caller
holding the raw target — a `new`-constructed instance, a test, a manually autowired
dependency — bypasses it entirely. The counter-counter, which is the real answer, is that
the check should be on the **public entry-point methods** rather than on internal helpers, so
the question "is this method reachable from outside?" and the question "is this method
protected?" have the same answer. Making the annotated surface equal to the public surface
converts a discipline problem into a structural one.

**T7. A method has `@PostAuthorize("returnObject.ownerId == authentication.name")`. What
happens if the method throws?** `ADVANCED`

The authorization check never runs — `@PostAuthorize` is an interceptor around the method
call, and an exception propagating out of the invocation skips the post-check entirely. That
is usually harmless because no object was produced, but it means `@PostAuthorize` is not a
control you can use to guarantee anything about a method that fails. It is also why
`@PreAuthorize` is the default choice: the check happens before any side effect, including
logging and notifications.

**T8. A `@PreFilter` expression filters a `List` argument. Does the service receive the
original list or the filtered one?**

The filtered one — `@PreFilter` replaces the argument with the filtered collection before
invocation, and `filterObject` refers to the current element. `@PostFilter` instead filters
the returned collection. The practical difference: a `@PostFilter` still runs the method, so
any side effect in it (an audit write, a notification, a metric) has already happened for
every row, including the ones you filtered out. For read paths `@PostFilter` is fine; for
anything with side effects, `@PreFilter` is the one that keeps unauthorized rows out.

> **CHAPTER 3 SUMMARY**
>
> `authorizeHttpRequests` is an ordered list of `if` statements, not a specificity-matched
> rule engine — a leading `anyRequest().permitAll()` makes everything below it dead code, and
> nothing tells you. `hasRole` is `hasAuthority` with a `ROLE_` prefix, and the real failure
> is always a mismatch between what the authentication grant produced and what the
> expression asks for — most often a JWT's `scope` claim becoming `SCOPE_x`. Method security
> replaced `@EnableGlobalMethodSecurity` in 5.6/6.0, and the trap is that
> `@EnableMethodSecurity` defaults every flag to `false`, so a migration that changes the
> annotation and nothing else enforces nothing. Multiple `@PreAuthorize` annotations AND;
> `hasAnyRole` is the OR. And the structural point: URL rules are the coarse gate, method
> rules are the real policy, and a method rule is only as strong as the discipline of never
> bypassing its proxy.

#### Further Reading

- [Spring Security Reference — Method Security](https://docs.spring.io/spring-security/reference/servlet/authorization/method-security.html) — `@PreAuthorize`, `@PostFilter`, the expression context, and the `@EnableMethodSecurity` attributes.
- [Spring Security Reference — Authorization Architecture](https://docs.spring.io/spring-security/reference/servlet/authorization/architecture.html) — the `AuthorizationManager` model, the core authorization classes, and how it replaced the voting model.
- [Spring Security Reference — Authorize HTTP Requests](https://docs.spring.io/spring-security/reference/servlet/authorization/authorize-http-requests.html) — the matcher DSL, the ordering rule, and the low-level `RequestMatcher` alternatives.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — the validate-at-every-layer principle, and the force-first design pattern for row-level ownership.

## Chapter 4 — JWT & Stateless APIs

### 4.1 Why Stateless Became the Default

The reason JWTs are everywhere is not that they are good. It is that a server-side session
store does not scale the way a stateless service does, and the operational cost of session
affinity is high enough that teams reach for tokens long before they need federation.

```text
  With sessions (stateful)
    request ──► [cookie: JSESSIONID] ──► server ──► session store (Redis)
                                               ▲
                          every request pays a lookup, and the store is a
                          second thing to operate, scale, back up and page on

  With JWT (stateless)
    request ──► [header: Bearer eyJ...] ──► server ──► verify signature (µs)
                                               no lookup, no shared state
                                               but: no revocation, and you own
                                               key management and every claim check
```

| Gained | Lost |
| --- | --- |
| Horizontal scaling with no sticky sessions and no shared store | **Revocation** — a valid token stays valid until it expires |
| No session lookup per request | **Visibility** — you cannot ask "who is logged in right now" |
| Token contents are inspectable without a lookup (base64, not encrypted) | **Instant user disable** — firing a user does nothing until `exp` |
| Offline verification at the edge or in a gateway | **Compromise blast radius** — a leaked token works from anywhere until expiry |
| Simple cross-service propagation | **Audience correctness** — which is entirely your problem (Chapter 5) |

Every one of the "lost" items is a consequence of one decision: making the token
self-contained. That is the frame to hold for the rest of this chapter.

### 4.2 Building the Filter Correctly

The most common way to add JWT to an existing application is a custom
`OncePerRequestFilter` rather than the resource-server support in Chapter 5. It is worth
knowing precisely because the mistakes are instructive.

```java
public class JwtAuthenticationFilter extends OncePerRequestFilter {

    private final JwtDecoder decoder;

    public JwtAuthenticationFilter(JwtDecoder decoder) {
        this.decoder = decoder;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        String token = resolveToken(request);
        if (token != null) {
            try {
                Jwt jwt = decoder.decode(token);        // FIXED algorithm — see 4.4
                JwtAuthenticationToken auth =
                        new JwtAuthenticationToken(jwt, authorities(jwt), jwt.getSubject());
                SecurityContextHolder.getContext().setAuthentication(auth);
            } catch (JwtException ex) {
                // An invalid token is NOT an anonymous request. Decide deliberately
                // whether to 401 here or to continue with an empty context.
                SecurityContextHolder.clearContext();
                response.sendError(HttpServletResponse.SC_UNAUTHORIZED);
                return;
            }
        }
        try {
            chain.doFilter(request, response);
        } finally {
            // MANDATORY. Without this the context leaks to the next request on a
            // pooled thread — which is the thread-local leak from Chapter 1, live.
            SecurityContextHolder.clearContext();
        }
    }

    private String resolveToken(HttpServletRequest request) {
        String header = request.getHeader(HttpHeaders.AUTHORIZATION);
        if (header != null && header.startsWith("Bearer ")) {
            return header.substring(7);
        }
        return null;   // deliberately NOT a query parameter — see Common Mistakes
    }

    private Collection<GrantedAuthority> authorities(Jwt jwt) {
        return jwt.getClaimAsStringList("scope") == null
                ? List.of()
                : jwt.getClaimAsStringList("scope").stream()
                     .map(s -> new SimpleGrantedAuthority("SCOPE_" + s))
                     .toList();
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        return !request.getRequestURI().startsWith("/api/");   // scope the filter
    }
}
```

Four things in that class are load-bearing and each one is a real bug when omitted:

1. **`finally { SecurityContextHolder.clearContext(); }`.** `SecurityContextHolder` is a
   `ThreadLocal`. Servlet containers reuse threads. Without the clear, request B on the same
   thread sees request A's `Authentication` — a privilege leak in the most literal sense, and
   one that only reproduces under load.
2. **A fixed algorithm in the decoder.** `decoder.decode(token)` must be configured with the
   algorithm you expect. A decoder that reads `alg` from the header is broken (4.4).
3. **`shouldNotFilter` or an equivalent scope.** A JWT filter that runs on every request —
   including `/actuator/health` — adds a base64 decode and a signature check to every
   unauthenticated request in the system.
4. **The token comes from a header, not a query parameter.** See 4.3.

`OncePerRequestFilter` itself guarantees one invocation per request by default, using a
request attribute as the flag. It does **not** skip async dispatches — set
`setShouldNotFilterAsyncDispatch(true)` and `setShouldNotFilterErrorDispatch(true)`
explicitly if the filter is expensive, and understand what you are turning off.

### 4.3 No Revocation

The defining property of a self-contained token: the server has no state saying "this token
was cancelled". Three responses, and the choice between them is the real design decision.

| Response | Mechanism | Cost |
| --- | --- | --- |
| **Short expiry** | Access token lives 5–15 minutes | Every request past expiry needs a refresh; clock and clock-sync become correctness concerns |
| **Refresh tokens** | Long-lived token, stored server-side, exchanged for a new access token | A store again — you have traded the session store for a smaller one |
| **Denylist / revocation list** | Keep the `jti` of a revoked token until its `exp`, check on each request | The lookup you were avoiding, though a set lookup is cheaper than a session round trip |

In practice, production systems run all three: a 10-minute access token, a refresh token
with its own rotation, and a denylist checked only for tokens whose `jti` is in a
recent-revocations cache.

> **SCALING REALITY CHECK**
>
> The denylist has a natural bound: an entry only needs to live as long as the token it
> revokes, and only tokens with `exp` more than 10 minutes in the future can matter. A
> denylist implemented as "store every `jti` forever" is a memory leak with an operational
> alarm attached. Size it by `issued_per_second × token_lifetime_seconds` — a system issuing
> 50 tokens/second with 15-minute access tokens needs at most 45,000 entries, which fits
> comfortably in a local Caffeine cache with a 15-minute TTL, and needs no Redis at all.

**Where refresh tokens should live** is a security decision with a browser-shaped answer.

```text
  Access token  → in MEMORY (a JavaScript variable). Not localStorage, not a cookie.
                  An XSS payload can read it, but it dies with the tab.
  Refresh token → in an HttpOnly, Secure, SameSite=Strict cookie.
                  JavaScript cannot read it at all, so XSS cannot exfiltrate it.
                  The browser attaches it to the refresh endpoint only.
```

> **INTERVIEW TRAP — "WHY IS A REFRESH TOKEN IN localStorage A PROBLEM?"**
>
> Because `localStorage` is readable by any JavaScript running on the origin. One XSS —
> a third-party script, a stored-XSS in user content, a compromised analytics tag — reads
> the refresh token, and because a refresh token typically lasts 30 days and is often not
> revocable from the client, that is a 30-day credential exfiltration. The `HttpOnly` cookie
> is unreadable from JavaScript by design; the trade is that you need `SameSite` handling
> and a CSRF defence on the refresh endpoint, which is precisely why cookie-based CSRF
> configuration matters even in a JWT application. Storing a long-lived credential in
> `localStorage` was a well-intentioned workaround for cookies and it made the XSS blast
> radius worse.

### 4.4 `alg: none` and Algorithm Confusion

This is the vulnerability that made JWT's reputation, and the mitigation is one line.

```text
  Attack 1 — "none" algorithm
  ┌──────────────────────────────────────────────────────────┐
  │ header: {"alg":"none","typ":"JWT"}                       │
  │ payload: {"sub":"admin","scope":"SCOPE_admin"}            │
  │ signature: (empty)                                       │
  └──────────────────────────────────────────────────────────┘
  A library that trusts the header's alg will decode this as a valid,
  unsigned token. The mitigation is that the decoder is configured with a
  fixed algorithm, so the header's claim is never consulted.

  Attack 2 — algorithm confusion (RS256 → HS256)
  ┌──────────────────────────────────────────────────────────┐
  │ The server has an RSA PUBLIC key. It trusts RS256.        │
  │ The attacker signs an HS256 token using the PUBLIC KEY    │
  │ as the HMAC secret.                                       │
  │ A library that looks at alg and picks the verification    │
  │ method accordingly will verify it successfully, because   │
  │ the public key IS a known string.                         │
  └──────────────────────────────────────────────────────────┘
```

The mitigation is identical for both: **never derive the verification algorithm from the
token.** Configure the decoder with the algorithm you chose.

```java
@Bean
JwtDecoder jwtDecoder(PublicKey publicKey) {
    return NimbusJwtDecoder.withPublicKey((RSAPublicKey) publicKey)
        .signatureAlgorithm(SignatureAlgorithm.RS256)      // FIXED, not read from the header
        .build();
}
```

Nimbus, which backs Spring Security's support, refuses `alg: none` and refuses a key-type
mismatch by default — but only if you have not configured a decoder that bypasses it. The
custom filter in 4.2 is safe here precisely because `decoder.decode` goes through a
configured `JwtDecoder`.

### 4.5 Claim Trust

A JWT that verifies is a JWT that was signed by someone you trust. It is **not** a JWT that
was issued *for you*. These are different claims, and validating only the signature is the
most common JWT deployment error.

```text
  Service A issues:  { "iss":"https://a.example.com", "aud":["a-api"], sub:"u1", scope:"read" }
  Service B issues:  { "iss":"https://b.example.com", "aud":["b-api"], sub:"u1", scope:"admin" }

  API-B verifies the signature of A (shared IdP keys) and accepts the token.
  The user now holds an ADMIN scope in B's API.
```

The claims that must be checked, and what happens when each is skipped:

| Claim | What it prevents if unchecked |
| --- | --- |
| `iss` (issuer) | A token from any other tenant of the same IdP is accepted. In multi-tenant IdPs (Okta, Auth0) this is a full cross-tenant breach |
| `aud` (audience) | Service A accepts service B's token — **cross-service privilege escalation**, and the subject of the staff-level section in Chapter 5 |
| `exp` (expiry) | A token works forever. Nimbus enforces this; a hand-rolled check often forgets it |
| `nbf` (not before) | A leaked token from the future is accepted early. Usually benign, sometimes not |
| `sub` | Not a check, but the identity. Never derive authorization from anything else in the payload |
| `scope`/`scp` | The permissions. A missing scope check is the fifth failure mode in 4.8 |

```java
@Bean
JwtDecoder jwtDecoder(JWKSet jwkSet) {
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withPublicKey(jwkSet)
            .signatureAlgorithm(SignatureAlgorithm.RS256)
            .build();

    OAuth2TokenValidator<Jwt> issuer =
            JwtValidators.createDefaultWithIssuer("https://idp.example.com/");
    OAuth2TokenValidator<Jwt> audience = jwt -> jwt.getAudience().contains("orders-api")
            ? OAuth2TokenValidatorResult.success()
            : OAuth2TokenValidatorResult.failure(
                new OAuth2Error("invalid_token", "aud missing or wrong", null));

    decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(issuer, audience));
    return decoder;
}
```

Note the audience validator is hand-written. `JwtValidators.createDefaultWithIssuer` checks
`iss`, `exp` and `nbf` — **it does not check `aud`**, because "which audiences is this token
for" is a question only your service can answer.

### 4.6 Clock Skew

Tokens have `exp` and `nbf`, both compared against the verifier's clock. In a cluster, those
clocks differ. Without tolerance, a token can be rejected on node A and accepted on node B,
and the failure is intermittent and looks like a load-balancer problem.

```java
decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(issuer));  // zero tolerance

// The fix — a bounded tolerance, applied when building the validator:
OAuth2TokenValidator<Jwt> withClockSkew =
        JwtValidators.createDefaultWithIssuer(issuer);   // then wrap with
JwtTimestampValidator timestamps = new JwtTimestampValidator(Duration.ofSeconds(30));
```

Tolerance is a trade, not a free win. Thirty seconds of skew means a token that expired is
accepted for up to thirty seconds more. Sixty seconds is comfortable and starts to be
noticeable to an incident review. The right number is your worst observed clock drift across
the fleet, and the real fix is NTP — the tolerance is there so that a brief NTP correction
does not produce a burst of 401s.

### 4.7 Key Rotation

Key rotation without a `kid` is a downtime event. A `JwtDecoder` configured with a single
key rejects every token signed with the retired key, so you must either rotate instantly
(which logs out every user) or decode both keys and accept both (which is what `kid` makes
easy).

```text
  JWK set (published at https://idp.example.com/.well-known/jwks.json)
  ┌─────────────┬─────────────┬─────────────┐
  │ kid: k-2025 │ kid: k-2026 │ kid: k-2027 │
  │ key: RSA    │ key: RSA    │ key: RSA    │
  │ status: OLD │ status: NEW │ status: FUT │
  └─────────────┴─────────────┴─────────────┘
        ▲
   the token header says "kid: k-2025", so the decoder knows which key to use
```

```java
// Resolve keys from a remote JWK Set, cached, refreshing when an unknown kid arrives.
@Bean
JwtDecoder jwtDecoder(OAuth2ResourceServerProperties props) {
    String jwkSetUri = props.getJwt().getJwkSetUri();
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withJwkSetUri(jwkSetUri).build();

    // A key that fails to resolve should fail CLOSED, not fall through to a stale key
    // or an unverified token.
    decoder.setJwtValidator(JwtValidators.createDefaultWithIssuer(props.getJwt().getIssuerUri()));
    return decoder;
}

// The simplification, when the key is in your own config:
@Bean
JwtDecoder jwtDecoder(@Value("${app.jwk-set-uri}") String uri) {
    return NimbusJwtDecoder.withJwkSetUri(uri).build();
}
```

`NimbusJwtDecoder.withJwkSetUri` caches the JWK set and re-fetches when it sees a `kid` it
does not recognise — so the rotation path is: publish the new key, wait for the cache TTL or
for a new `kid` to force a refresh, then start signing with the new key, then retire the old
one after the longest access-token lifetime has elapsed. **The retirement delay is the
critical number**: it must exceed the access token lifetime, or you log out every user. For
a 15-minute access token, a 24-hour overlap is a reasonable minimum.

`NimbusJwtDecoder.withIssuerLocation(issuer)` is a one-liner that reads the issuer's
discovery document and configures the decoder from it — issuer, JWK set URI and the
supported algorithms — which is exactly what OIDC discovery is for.

### 4.8 The Missing Scope Check

Authenticating a token and authorizing the request are two operations. Teams routinely do
the first and forget the second, which produces an API where every valid token can call
everything.

```java
// Token is valid. Nothing says this particular endpoint needs write scope.
@PostMapping("/orders")
public Order create(@RequestBody OrderRequest req) { ... }
```

```java
// The fix, at the URL layer for a coarse boundary:
.requestMatchers(HttpMethod.POST, "/api/orders/**").hasAuthority("SCOPE_orders.write")
.requestMatchers(HttpMethod.GET,  "/api/orders/**").hasAuthority("SCOPE_orders.read")

// And at the method layer for the ones that are about the operation, not the path:
@PreAuthorize("hasAuthority('SCOPE_orders.write')")
public void refund(String orderId) { ... }
```

The reason this is worth its own failure mode is that it is invisible. A token with only
`orders.read` calls the refund endpoint, gets 200, and nothing anywhere records that the
distinction was not made. A read-only client becomes a write-capable client through nothing
more than a missing line in a chain.

### 4.9 The Honest Assessment

```text
  What you get by choosing a self-contained token
    ✔ no shared state
    ✔ horizontal scaling without affinity
    ✔ verification at any tier with no network call
    ✘ you now own: revocation, key distribution and rotation, clock skew,
      audience correctness, scope enforcement, storage for refresh tokens,
      and the fact that you cannot answer "who is currently authenticated"
```

Every problem in this chapter is a consequence of one choice, and the choice buys exactly
one thing: eliminating a lookup. If the lookup is not actually your bottleneck, you have
taken on all of this to remove a `Redis.get` that was costing you well under a millisecond.

> **TRADE-OFF**
>
> A server-side session gives you revocation for free — delete the session and the user is
> out — plus "who is online right now" for the security team, per-session audit, and instant
> account disable. It costs a store, session affinity or a shared store, and it does not
> survive being consumed by a third party. The flip condition: the moment you need
> "log out all devices" to be immediate, or you need to enumerate live sessions, or you have
> a handful of users and one region, the session is the better answer and the token was
> solving a scaling problem you do not have.
>
> The condition that flips the other way is a real third party consuming your API, or a
> mobile client on an unreliable network — a session cookie that dies when the browser
> closes and a refresh token that lives 30 days are different products, and only one of them
> is what an external consumer wants.

> **STAFF-LEVEL CONSIDERATION**
>
> The question a staff engineer should raise is not "JWT or session", it is **"what is our
> incident-response capability if a token is stolen?"** Stateless is often chosen precisely
> because the service has no session store, and the same architecture decision removes the
> mechanism the security team would use to respond. If you cannot answer "an admin has a
> compromised token for user U — what do we do in the next five minutes?", the design is
> incomplete, and the missing piece has to be a denylist, a short expiry, or a
> server-side revocation endpoint.
>
> The second staff-level point: choosing JWT because "it's what everyone uses" is a
> decision that has been made for you by every tutorial you have read, and the questions that
> would have revealed the trade-off — do we need session enumeration for compliance, do we
> have user-facing sessions at all, is the scale actually a problem — are worth asking
> out loud once, in writing, before the first token is minted.

> **PRODUCTION SCENARIO**
>
> Problem: a support engineer disabled a user account. The customer remained able to place
> orders for eleven hours.
> Investigation: the account status flag was set to disabled and the session was never
> touched; access tokens had a 12-hour lifetime and there was no denylist, so tokens issued
> before the disable continued to verify for their full remaining life.
> Root cause: a stateless design with no revocation path, combined with an access-token
> lifetime chosen for throughput rather than for revocation. The two decisions were made
> independently and neither was checked against the other.
> Solution: access tokens dropped to 15 minutes, refresh tokens rotated and stored
> server-side, and a denylist keyed by `jti` with a TTL equal to the access-token lifetime
> was added, so disable takes effect within 15 minutes.
> Prevention: a runbook item and a test — "a token issued before account disable is rejected
> after the maximum access-token lifetime" — because a capability that has no test is a
> capability that quietly disappears in a refactor.

#### Common Mistakes

- Reading the token from a query parameter (`?access_token=...`). It lands in access logs,
  browser history, `Referer` headers and proxy logs. A bearer token belongs in the
  `Authorization` header.
- Omitting `SecurityContextHolder.clearContext()` in a `finally`, which leaks one request's
  principal into the next request served by the same pooled thread.
- Configuring a `JwtDecoder` that reads the algorithm from the token header. Configure a
  fixed algorithm; this is the `alg: none` and algorithm-confusion defence.
- Checking the signature and not `aud`. Valid signature means someone you trust signed it,
  not that they signed it *for you*.
- Setting a 12-hour access token "for user experience" and then discovering there is no way
  to revoke it. Lifetime is a revocation budget; spend it accordingly.
- Storing a long-lived refresh token in `localStorage`.
- Authenticating the token and never authorizing the request — every valid token reaching
  every endpoint.

#### Interview Questions — JWT & Stateless APIs

**Q1. What are the four failure modes of a stateless JWT API, and what is the common root
cause?** `ADVANCED`

No revocation (a logged-out or fired user's token works until `exp`); algorithm confusion
(trusting the token's `alg` header, enabling `alg: none` and RS256→HS256 attacks); claim
trust failure (not validating `iss` and `aud`, so another service's or tenant's token is
accepted); and clock skew (tokens rejected or accepted depending on which node they land
on). The common root cause is a single design decision: making the token self-contained.
Every one of these is what you get in exchange for eliminating the state lookup, and the
mitigations — fixed algorithm, audience validation, short expiry plus denylist, bounded
clock-skew tolerance, `kid`-based key rotation — are all consequences of the same choice.

**Q2. Why must a custom JWT filter clear the `SecurityContext` in a `finally` block?**
`TRICKY`

`SecurityContextHolder` stores the context in a `ThreadLocal`, and servlet containers reuse
threads across requests. If request A authenticates and sets the context but does not clear
it, request B arriving on the same thread starts with A's `Authentication` already in place
— so an anonymous or low-privileged request executes with the previous request's identity.
It is a privilege leak, it only appears under concurrency (so never in a single-threaded
test), and it is the single most common bug in hand-written JWT filters.

**Q3. `NimbusJwtDecoder.withIssuerLocation(...)` versus configuring a `JwtDecoder` by hand —
what does the former do that the latter does not?** `ADVANCED`

It performs OIDC discovery: it fetches the issuer's `/.well-known/openid-configuration`
document and derives the JWK set URI, the expected issuer, and the supported signing
algorithms from it. Configured by hand, you supply the JWK set URI and the issuer yourself
and you are responsible for keeping them correct and for the audience validator, which
neither path supplies. `JwtValidators.createDefaultWithIssuer` validates `iss`, `exp` and
`nbf` and **not** `aud` — audience checking is always application-specific, and its absence
is the cross-service privilege escalation in Chapter 5.

**Q4. A team wants to move from long-lived access tokens to short-lived ones. What breaks
first?** `SCENARIO`

Three things, in this order. First, refresh token handling — every user past the new expiry
needs a working refresh path, and if the current design has none, the entire user base is
logged out at the moment of the change unless you stagger it. Second, clock synchronisation:
a shorter window makes clock drift far more likely to produce 401s, so NTP becomes a
correctness dependency rather than a hygiene item. Third, and most easily missed, the login
endpoint's rate limiting: BCrypt comparisons are already ~100ms, and a 10× increase in
authentication traffic to implement the refresh flow can saturate the login path or trip the
lockout policy. Plan the rollout with an overlap window at least as long as the old token
lifetime.

**Q5. When is a server-side session a better answer than a JWT, even at scale?** `STAFF`

When you need revocation, "log out all devices", per-session audit, or the ability to
enumerate live sessions — a security team will ask for exactly that during an incident, and
a stateless design has no answer. Also for a browser application with a modest user base in
one region, where the session store is a solved problem and the token is solving a scaling
issue you do not have. A JWT is the right answer for a third-party API consumer, a mobile
client on an unreliable network, and a genuinely horizontally-scaled service where the
session lookup is a measured bottleneck — and the mistake is choosing it before establishing
that the lookup is a bottleneck.

**Q6. How would you rotate a JWT signing key without logging out every user?** `ADVANCED`

Publish both keys in the JWK set, each with a `kid` in the JWK and in the token header.
`NimbusJwtDecoder.withJwkSetUri` caches the set and re-fetches when it encounters an
unknown `kid`. So: publish the new key, start signing with it, and **keep the old key
published for longer than the access-token lifetime** — for a 15-minute access token, a
24-hour overlap is a sane minimum. Only then retire the old key. The critical number is the
overlap, and the failure mode of getting it wrong is a total logout at the moment of
rotation. A decoder configured with a single static key and no `kid` support has no
graceful rotation path at all.

**T7. A JWT verifies successfully but the endpoint returns 403 for a user with the right
role. What are the candidate causes, in order?** `ADVANCED`

The authorities do not match what the expression asks for — the JWT's `scope` claim becomes
`SCOPE_orders.read`, so `hasRole("orders.read")` never matches and `hasAuthority("orders.read")`
does not either. The claim may be named `scp` rather than `scope`, or be a space-delimited
string where a list is expected. The user's roles may live in a different claim the
`JwtAuthenticationConverter` is not configured to read. Or the 403 is coming from a URL rule
in a chain that matched before the method rule, and the matcher order is wrong — check the
chain selection before the expression.

**T8. Does `OncePerRequestFilter` run on async redispatch?** `TRICKY`

It guards against multiple invocations within a single dispatch using a request attribute,
and by default that includes `ASYNC` and `ERROR` dispatches — so a filter that authenticates
will run again on the redispatch. You can call `setShouldNotFilterAsyncDispatch(true)` to
change that, and the reason to is cost: on an async request the filter may run twice, once
before and once after the async boundary, and if it does I/O that is a real cost. Turn it
off only after confirming the filter is idempotent, because a filter that must run on every
dispatch is the exception, not the rule.

> **CHAPTER 4 SUMMARY**
>
> Stateless became the default because a session store does not scale the way a stateless
> service does — not because JWT is better. Every problem in the chapter is a consequence of
> one choice: no revocation, no session enumeration, key management on you, clock skew
> exposed, and audience correctness entirely yours. The mitigations are all the same shape —
> fixed algorithm in the decoder, explicit `iss` and `aud` validation, short access-token
> lifetime treated as a revocation budget, a `jti` denylist sized by
> `issued_per_second × lifetime`, `kid`-based key rotation with an overlap window longer
> than the token lifetime, and a `finally` that clears the `SecurityContext`. The honest
> staff-level question is not "JWT or session" but "what is our incident response when a
> token is stolen", because stateless is often chosen by the same architecture decision that
> removes the security team's tools.

#### Further Reading

- [Spring Security Reference — OAuth2 Resource Server JWT](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/jwt.html) — `JwtDecoder` construction, validators, the authority mapping, and the resource-server DSL.
- [RFC 7519 — JSON Web Token](https://datatracker.ietf.org/doc/html/rfc7519) — the normative definition of `iss`, `aud`, `exp`, `nbf`, `jti`; read §4.1 and you will never be surprised by a claim's semantics again.
- [Spring Security Reference — Migration Guide](https://docs.spring.io/spring-security/reference/migration/index.html) — what changed in 6.x in the authentication and resource-server configuration, including the removed `AccessDecisionManager` path.
- [OWASP Authentication Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html) — the deployment-level checks around session management, token storage and expiry that sit outside the library.

## Chapter 5 — OAuth2 & OIDC

### 5.1 The Two Grants That Matter

OAuth2 is four or five grants, and two of them cover almost everything in production. Knowing
which grant a system uses tells you who the principal is, which is the first question to ask
about any OAuth2 deployment.

| Grant | Principal | Use it for | Notable |
| --- | --- | --- | --- |
| **Authorization code + PKCE** | The **user** | Browser and mobile applications acting for a person | The only browser grant still recommended. Requires a confidential client only for the back channel |
| **Client credentials** | The **client/service** | Machine to machine: your scheduler calling your API | No user, no browser, no refresh token. The grant is a username/password exchange where the password is the client secret |
| Implicit | The user | — | **Deprecated.** Tokens in the URL fragment, no PKCE, and the reason PKCE was invented |
| Resource owner password (ROPC) | The user | — | **Deprecated.** Your app sees the user's password. Exists only for legacy IdPs |
| Device code | The user | TVs, CLIs, anything with no browser and a keyboard | Useful, and the honest answer for a desktop CLI |

> **MUST REMEMBER**
>
> In **client credentials, there is no user**. The token's subject is the calling service
> and `sub` is meaningless as a person. Every design question that follows from this: you
> cannot do "act on behalf of" anything, there is no refresh token because there is no
> session to refresh, and a `scope` in a client-credentials token describes the *service's*
> permissions, not a user's. Teams that bolt a client-credentials token onto a
> user-facing flow get a token with no user in it, and then log a security event that names
> a service where a person should be.

### 5.2 Authorization Code with PKCE, and Why the Implicit Grant Died

The implicit grant returned the access token directly in the URL fragment. That put a
credential in the browser's address bar, in history, in the `Referer` header of every
outbound request, and in any analytics script on the page. PKCE (RFC 7636) fixes it without
needing a client secret in the browser.

```text
  1. Client generates  code_verifier (43–128 random chars) and
                        code_challenge = BASE64URL(SHA256(code_verifier))
  2. Client → Authorization Server:
        /authorize?response_type=code
                  &client_id=...&redirect_uri=...
                  &scope=openid profile
                  &code_challenge=<challenge>&code_challenge_method=S256
  3. User authenticates and consents. AS redirects:
        https://app.example.com/callback?code=4/0AX...
        ← the token NEVER appears in the URL
  4. Client → Authorization Server (back channel, TLS, client-authenticated):
        /token  grant_type=authorization_code
                &code=4/0AX...
                &code_verifier=<the original verifier>
  5. AS verifies SHA256(code_verifier) == code_challenge, then issues tokens.
```

An interceptor of the code has the `code` and the `redirect_uri` but **not** the
`code_verifier`, which never left the client, so the intercepted code is useless. That is the
entire mechanism, and it is why PKCE is now required for public clients rather than
recommended.

> **INTERVIEW TRAP — "WHY IS THE IMPLICIT GRANT DEPRECATED?"**
>
> The short answer is that it puts a bearer token in a URL, and URLs leak. But the
> interview-grade answer names the specific paths: browser history, `Referer` headers sent
> to third parties, and any script on the page. The implicit grant has no client secret to
> protect the exchange, so an attacker who intercepts the token has it outright. PKCE solves
> the interception problem without a secret, which is why authorization code + PKCE
> replaced it entirely — the implicit grant is deprecated at the OAuth 2.1 draft level and
> removed from OAuth 2.1, and no new system should be built on it.

### 5.3 The Spring Security 6 DSL, Both Sides

As a **client** (login, callback, token storage) and as a **resource server** (verifying
inbound tokens).

```java
@Bean
SecurityFilterChain browserChain(HttpSecurity http) throws Exception {
    var oauth2 = http.oauth2Login(withDefaults())
                     .authorizeHttpRequests(a -> a
                         .requestMatchers("/", "/error", "/public/**").permitAll()
                         .anyRequest().authenticated());
    return oauth2.build();
}

@ConfigurationProperties("spring.security.oauth2.client.registration.google")
public class ClientRegistration {
    private String clientId;
    private String clientSecret;
    private String scope;          // "openid,profile,email"
    // provider, redirect-uri, client-authentication-method, ...
}
```

```yaml
spring:
  security:
    oauth2:
      client:
        registration:
          google:
            client-id: ${GOOGLE_CLIENT_ID}
            client-secret: ${GOOGLE_CLIENT_SECRET}
            scope: openid,profile,email
```

```yaml
# ── As a RESOURCE SERVER (this is what most services are) ──────────
spring:
  security:
    oauth2:
      resourceserver:
        jwt:
          issuer-uri: https://idp.example.com/realms/acme
          # optional; a custom converter changes scope → SCOPE_ if you need it
```

The `issuer-uri` form does OIDC discovery at startup and fails fast if the issuer is
unreachable — which is the correct behaviour for a service that cannot start without a valid
identity provider, and a decision teams should make deliberately. `jwk-set-uri` skips the
discovery round trip and fails later instead, at first request.

### 5.4 The Authorization Server Split

**Spring Authorization Server is no longer part of Spring Security.** It was incubating
inside the framework from 5.x, and in Spring Security 6.0/6.1 the OAuth2 authorization server
and OIDC provider functionality moved to a separate project, `spring-authorization-server`.
Spring Security 6.x contains the **client** and the **resource server**; it does not contain
an authorization server.

```text
  ┌──────────────────────┐        ┌────────────────────────────┐
  │  Spring Security 6.x │        │ Spring Authorization Server  │
  │  ─ oauth2Login()     │        │  (separate project)         │
  │  ─ oauth2Client()    │        │  ─ /authorize, /token       │
  │  ─ oauth2Resource    │        │  ─ /userinfo, /jwks         │
  │      Server().jwt()  │        │  ─ key rotation, consent    │
  │  ─ client_credentials│        │    screens, token storage   │
  └──────────────────────┘        └────────────────────────────┘
        the consumer                    the issuer
```

> **PRODUCTION RELEVANCE**
>
> The split matters because the two sides have genuinely different requirements. A resource
> server needs to verify tokens; an authorization server needs to store client secrets and
> refresh tokens, rotate signing keys, model consent, and be a high-value target. Most
> teams should use a hosted provider (Auth0, Okta, Cognito, Keycloak) for the issuer and be
> a resource server in Spring — because operating an authorization server correctly is a
> specialty, and getting it wrong is a compromise of every client at once.

### 5.5 Resource Server: `JwtDecoder` and the Authority Mapping

```java
@Bean
SecurityFilterChain apiChain(HttpSecurity http) throws Exception {
    return http
        .securityMatcher("/api/**")
        .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.STATELESS))
        .csrf(csrf -> csrf.disable())
        .oauth2ResourceServer(o -> o.jwt(withDefaults()))
        .authorizeHttpRequests(a -> a
            .requestMatchers(HttpMethod.GET, "/api/orders/**")
                .hasAuthority("SCOPE_orders.read")
            .anyRequest().hasAuthority("SCOPE_orders.write"))
        .build();
}
```

The default `JwtAuthenticationConverter` maps claims to authorities as follows:

| Claim in the token | Authorities produced |
| --- | --- |
| `scope` (space-delimited string) or `scp` (array) | `SCOPE_orders.read`, `SCOPE_orders.write` |
| `roles` (array) | `ROLE_ADMIN`, `ROLE_USER` — via `roles` claim extraction, if configured |
| `authorities` (array) | Used verbatim as authorities, if configured |
| `sub` | The `principal` name on the `Authentication` |

```java
@Bean
JwtAuthenticationConverter jwtAuthenticationConverter() {
    JwtGrantedAuthoritiesConverter scopes = new JwtGrantedAuthoritiesConverter();
    scopes.setAuthoritiesClaimName("roles");          // read a custom claim instead
    scopes.setAuthorityPrefix("ROLE_");

    JwtAuthenticationConverter converter = new JwtAuthenticationConverter();
    converter.setJwtGrantedAuthoritiesConverter(scopes);
    return converter;
}
```

The audience validation, which as established in Chapter 4 the defaults do not do:

```java
@Bean
JwtDecoder jwtDecoder(@Value("${idp.issuer}") String issuer,
                      @Value("${app.audience}") String audience) {
    NimbusJwtDecoder decoder = NimbusJwtDecoder.withIssuerLocation(issuer).build();

    OAuth2TokenValidator<Jwt> audienceValidator = jwt ->
        jwt.getAudience() != null && jwt.getAudience().contains(audience)
            ? OAuth2TokenValidatorResult.success()
            : OAuth2TokenValidatorResult.failure(new OAuth2Error(
                "invalid_token", "Token audience does not include " + audience, null));

    decoder.setJwtValidator(new DelegatingOAuth2TokenValidator<>(
        JwtValidators.createDefaultWithIssuer(issuer),    // iss, exp, nbf
        audienceValidator));                              // aud — yours to write
    return decoder;
}
```

### 5.6 OIDC: the Layer Above OAuth2

OAuth2 is a delegation protocol. It says nothing about who the user is. OIDC is an identity
layer on top of it, and the thing that makes it identity is the **id-token**.

| | Access token | ID token |
| --- | --- | --- |
| Audience | Your API | Your client application |
| Contains | `scope`, `aud`, `sub` — permissions | `sub`, `name`, `email`, `iss`, `aud` — identity |
| Presented to | The resource server | The client, from the authorization server |
| Should your API read it? | Yes | **No** — it is not for you, and reading it as authorization is a design error |
| How you get it | Bearer header | `OidcUser` from `oauth2Login` |

```java
@GetMapping("/me")
public Map<String, Object> me(@AuthenticationPrincipal OidcUser user) {
    return Map.of(
        "subject", user.getSubject(),
        "email",    user.getEmail(),
        "claims",   user.getClaims()          // id-token claims
    );
}
```

`OidcUser` is the OAuth2 `OAuth2User` plus the id-token: it is an `OAuth2User` whose
authorities come from `scope`/`scp` (so `SCOPE_`-prefixed) and whose identity comes from the
id-token's `userinfo`-merged claims. `@AuthenticationPrincipal OidcUser` is the login case;
`@AuthenticationPrincipal Jwt` is the resource-server case; the types are different because
the flows are different.

> **INTERVIEW TRAP — "WHAT'S THE DIFFERENCE BETWEEN THE ACCESS TOKEN AND THE ID TOKEN?"**
>
> The access token is for the API: it says what the caller may do, and it is validated at
> every hop. The id-token is for the client application: it says who the user is, it comes
> straight from the authorization server, and it is asserted *to* the client. The
> consequence that matters: a resource server that reads identity from the access token
> instead of trusting the id token minted for it is trusting an assertion made for a
> different audience — which is the audience-validation failure wearing a different hat.

### 5.7 Scopes vs Roles in a Resource Server

| | Scopes | Roles |
| --- | --- | --- |
| Meaning | What this token may do | Who this principal is |
| Granted by | The authorization server, per client and per user | Your database, per user |
| Shape | Fine-grained, many (`orders.read`, `orders.write`, `refunds.approve`) | Coarse, few (`ADMIN`, `USER`, `AUDITOR`) |
| Changes when | A client is re-consented, or a token is issued | A user is promoted |
| In a resource server | The natural model, because the token is the authority | Possible, via a `roles` claim, but now the identity provider is your role database |
| Scales with | Number of operations | Number of kinds of user |

A resource server that models permissions as roles has usually inherited a role model from
a monolith. In a federated setup, roles mean your identity provider has to know your
application's permission model, which couples it to every consumer.

```java
// Fine-grained, which is what a resource server should look like
.requestMatchers(HttpMethod.GET,  "/api/orders/**").hasAuthority("SCOPE_orders.read")
.requestMatchers(HttpMethod.POST, "/api/orders/**").hasAuthority("SCOPE_orders.write")
.requestMatchers("/api/refunds/**").hasAuthority("SCOPE_refunds.approve")
```

The hybrid is legitimate and common: scopes for the API boundary, roles for the
*application's* notion of who someone is (admin screens, an internal console, a role-based
UI). What is not legitimate is having both decide the same question on the same request.

### 5.8 Service to Service: Propagation vs Exchange

This is the distinction that most often gets made badly in a microservice migration, and
the two options answer genuinely different questions.

```text
  QUESTION 1: "Who is the end user doing this?"
      → TOKEN PROPAGATION
        Caller's token is passed straight through to the downstream.
        Downstream sees: the user (sub), their scopes, their tenant.
        Downstream CAN act as the user. Downstream CANNOT be re-attributed
        to the calling service for its own authorization.

  QUESTION 2: "Is this service allowed to do this?"
      → CLIENT CREDENTIALS / TOKEN EXCHANGE
        Caller mints a NEW token for itself (or exchanges the caller's token
        for a narrower one scoped to the downstream).
        Downstream sees: the CALLING SERVICE, and the scopes that service
        was granted at the downstream.
        Downstream CANNOT act as the user. Downstream DOES know who asked.
```

| | Token propagation | Client credentials / token exchange |
| --- | --- | --- |
| Downstream knows the user? | Yes | No (or only via a deliberately narrow delegated claim) |
| Downstream knows the calling service? | No — only the user | Yes — the `sub`/`azp` is the service |
| Downstream authorizes on | The user's permissions | The service's permissions, optionally narrowed to the user |
| Blast radius of a compromised downstream | Everything that service can reach with the user's permissions | Only that service's own permissions |
| Can downstream create new records owned by the user? | Yes, naturally | Needs the user identity passed as *data*, not as authority |
| Good for | Request-scoped user actions ("get my orders") | Background work, cross-service trust, "service A may read service B's data" |

```java
// Propagation — pass the inbound Authorization header through.
@Bean
RestClient downstream(RestClient.Builder builder) {
    return builder.requestInterceptor((request, body, execution) -> {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth instanceof JwtAuthenticationToken jwt && jwt.getToken() != null) {
            request.getHeaders().setBearerAuth(jwt.getToken().getTokenValue());
        }
        return execution.execute(request, body);
    }).build();
}
```

```yaml
# Client credentials for a machine-to-machine client
spring:
  security:
    oauth2:
      client:
        registration:
          orders-service:
            client-id: ${ORDERS_CLIENT_ID}
            client-secret: ${ORDERS_CLIENT_SECRET}
            authorization-grant-type: client_credentials
            scope: orders.read,orders.write
        provider:
          orders-provider:
            token-uri: https://idp.example.com/realms/acme/protocol/openid-connect/token
```

> **PRODUCTION RELEVANCE**
>
> Propagation's cost is subtle and is usually discovered during an incident. If every
> downstream service authorizes on the propagated user token, then a compromise of any one of
> them is a compromise of the user's full permission set at every other one — the
> credentials of the caller are the user's, so the blast radius is the user's blast radius.
> Client credentials invert this: a compromised service is confined to that service's own
> scopes. Token *exchange* (RFC 8693) is the middle path — the caller exchanges the user's
> token for a narrower one targeting one downstream, so the downstream sees both who the
> service is and (optionally) a constrained claim about the user.

> **STAFF-LEVEL CONSIDERATION**
>
> The decision here is an organisational one as much as a technical one, and it is worth
> making explicitly rather than letting it be decided by whichever service was built first.
> The question to answer org-wide is: **is the identity model end-user-centric or
> service-centric?** A user-centric model (propagation) makes end-user features easy —
> "list the orders this customer placed, across all services" is a straightforward query —
> at the cost of a wide blast radius. A service-centric model (client credentials) makes
> internal trust explicit and narrow, at the cost of having to pass user identity as
> validated *data* wherever a downstream genuinely needs it, which is real work and easy to
> get wrong in the other direction (a service that trusts a user id supplied in a request
> body is a worse vulnerability than either).
>
> The pattern that holds up at scale is: **client credentials as the default for every
> inter-service call, and propagation as a deliberate, reviewed exception for the specific
> flows where the downstream genuinely acts on behalf of a user.** That way the exception is
> visible in review, and the default blast radius is a single service's scopes.

### 5.9 Audience Validation Is the Control

Everything in 5.8 assumes the downstream can tell the difference between a token meant for
it and a token meant for someone else. If it cannot, the whole model collapses.

```text
  IdP signs both. Both signatures verify against the shared JWK set.

  Token for service-a-api:  { "iss":"https://idp", "aud":["service-a-api"], sub:"svc-b" }
  Token for service-b-api:  { "iss":"https://idp", "aud":["service-b-api"], sub:"svc-a" }

  service-a validates signature + exp. It does NOT validate aud.
  service-a accepts service-b's token.
        └─► sub "svc-a" is now known to service-a's authorization code
        └─► if the code authorizes on sub, service-a has just granted
            itself the identity it was meant to trust  ── privilege escalation
```

**The absence of audience validation is not a missing best practice. It is a cross-service
privilege escalation path**, and it is the single highest-value check in this chapter,
because it is the one that fails silently and completely.

```java
private static OAuth2TokenValidator<Jwt> audienceMustBe(String required) {
    return jwt -> jwt.getAudience() != null && jwt.getAudience().contains(required)
            ? OAuth2TokenValidatorResult.success()
            : OAuth2TokenValidatorResult.failure(new OAuth2Error(
                    "invalid_token",
                    "Required audience '" + required + "' not present in token. "
                    + "This token was not issued for this service.", null));
}
```

The error message matters as much as the check. "Required audience X not present" tells the
next engineer that the problem is token issuance, not authentication. "Invalid JWT" sends
them to look at the signature, the clock, and the key.

> **TRADE-OFF**
>
> Strict audience validation has a cost that shows up in a real migration: any client that
> mints tokens without setting `aud` correctly stops working, and the failure is a 401 in
> production with a stack trace pointing at the signature verification. The flip condition
> for relaxing it is a *temporary* migration step where a second token endpoint is added
> per service and the audience check is relaxed for one release — never a permanent state,
> because "we'll tighten it next quarter" is how an audience check stays off for three
> years. Validate audience from day one, in every service, in the shared library if you have
> one, so that omitting it is a visible omission rather than the default.

#### Common Mistakes

- Enabling client credentials in a user-facing flow and then wondering why `sub` does not
  identify a person. In client credentials, `sub` is the service. There is no user.
- Using the access token as an identity assertion in the client. The id token is the
  identity; the access token is for the API.
- Relying on the default validators for `aud`. `JwtValidators.createDefaultWithIssuer`
  checks `iss`, `exp` and `nbf` and nothing else.
- Naming a `roles` claim in a token that the converter is not configured to read, and
  concluding the role check is broken.
- Putting the same `aud` on every service's tokens "for simplicity", which is precisely the
  configuration that makes audience validation useless.
- Propagating the user's token to every downstream by default, without a reviewable
  exception, and ending up with a blast radius equal to the user's entire permission set.

#### Interview Questions — OAuth2 & OIDC

**Q1. Client credentials vs authorization code with PKCE — what is the fundamental
difference?** `TRICKY`

Who the principal is. Client credentials authenticate the *client*: there is no user, the
token's subject is the service, there is no browser and no refresh token, and the `scope`
describes the service's own permissions. Authorization code with PKCE authenticates a *user*
through a browser flow and is bound to a redirect URI, with the code exchanged over a
back-channel authenticated by a `code_verifier` so an intercepted code is useless. Choosing
client credentials for a user-facing feature is the characteristic OAuth2 mistake, and its
symptom is a token whose `sub` is a service name where a person should be.

**Q2. Why is PKCE now required for public clients, and what does it actually protect?**
`ADVANCED`

Because a public client — a browser SPA, a mobile app — cannot keep a client secret, so the
code-to-token exchange previously had no protection against an attacker who intercepted the
authorization code from the redirect. PKCE closes it: the client generates a high-entropy
`code_verifier`, sends only its SHA-256 `code_challenge` in the `/authorize` request, and
reveals the verifier in the `/token` request. An interceptor of the redirect URL has the
code but not the verifier, so the exchange fails. It is the reason the implicit grant could
be retired entirely — PKCE gives the code flow the protection the implicit grant's client
secret was supposed to provide, without needing a secret in a browser.

**Q3. What does the default `JwtAuthenticationConverter` map to authorities, and what is
the most common reason a scope check fails?** `TRICKY`

The `scope` claim (space-delimited) or the `scp` claim (array) becomes authorities prefixed
with `SCOPE_`, so `orders.read` becomes `SCOPE_orders.read` and must be matched with
`hasAuthority("SCOPE_orders.read")`. The most common failures in order: writing
`hasRole("orders.read")`, which looks for `ROLE_orders.read`; the claim being named
something else because a non-standard IdP or a custom token structure was used; and the
claim being a string where a list is expected. The diagnostic is to log the authorities on
the `Authentication` — not the token, which puts a credential in your logs.

**Q4. Does Spring Security's default JWT validation check the audience?** `ADVANCED`

No. `JwtValidators.createDefaultWithIssuer(issuer)` validates the issuer, the expiry and the
not-before, and it does not look at `aud` — because "which audiences is this token for" is a
question only the service knows. You must add an `OAuth2TokenValidator<Jwt>` yourself and
compose it with a `DelegatingOAuth2TokenValidator`. This is the highest-value check in the
resource-server configuration, because its absence means any token signed by your trusted
issuer for any other service is accepted, which is a cross-service privilege escalation
rather than a hardening gap.

**Q5. Token propagation or client credentials for a call from service A to service B?**
`STAFF`

Propagation if B genuinely acts on behalf of the user — B must know who the user is and be
able to authorize on their permissions. Client credentials if the relationship is a service
trust relationship — "A may read B's order data" — because it makes B's authorization
express the *service's* permission rather than the user's, and confines the blast radius of
a compromised service to its own scopes. Token exchange is the middle path for the cases
where B needs both a constrained statement about the user and proof of which service is
calling. The decision to make explicitly is whether the identity model is end-user-centric
or service-centric, and the pattern that holds up is client credentials by default with
propagation as a reviewed exception.

**Q6. When should you use Spring Authorization Server rather than a resource server
configuration?** `TRICKY`

When you are building the **issuer** — the thing that holds client secrets and refresh
tokens, rotates signing keys, renders consent screens, and issues the tokens other systems
consume. Authorization server functionality was moved out of Spring Security into its own
project for Spring Security 6.x; what remains in Spring Security is the client
(`oauth2Login`, `oauth2Client`) and the resource server (`oauth2ResourceServer`). Most
Spring applications should be resource servers and use a hosted or dedicated provider for
the issuer, because running an authorization server correctly — key rotation, consent,
token storage, and being a high-value target — is a specialty, and a mistake in it
compromises every client at once.

**Q7. A team says "we put the access token in the browser's `localStorage` so the SPA can
call our API". What is the security review finding, and what is the fix?** `SCENARIO`

An XSS on the origin can read it — and the access token is a bearer credential valid until
expiry, from any origin, with no device binding. If the SPA also needs a refresh token, the
finding is worse: a refresh token in `localStorage` is a long-lived exfiltratable
credential. The fix is asymmetric storage — access token in memory only, refresh token in an
`HttpOnly; Secure; SameSite=Strict` cookie that JavaScript cannot read. That reintroduces a
cookie-based credential, so the refresh endpoint needs CSRF protection and the API chain's
CSRF and CORS configuration stops being optional — which is the real cost of the SPA + JWT
combination and the reason many teams use a BFF pattern instead.

**T8. A resource server accepts a token signed by the right issuer, unexpired, correct
`sub`, but the call is rejected. List the checks in the order you would debug them.**

Signature (was the right key used, is `kid` resolution working), then `iss`, then `exp` and
`nbf` (including clock skew), then `aud` — this is the one people forget and it produces a
401 with no useful clue. Then the claim-to-authority mapping: is the scope in `scope` or
`scp`, is it a list or a string, is the `SCOPE_` prefix correct. Then which layer rejected
it: did a URL rule match first, or a method rule, and are the authorities what you think
they are. Log the `Authentication`'s authorities at the point of rejection, not the token.

> **CHAPTER 5 SUMMARY**
>
> OAuth2's two grants differ in who the principal is: client credentials authenticate the
> service, authorization code + PKCE authenticates the user, and using the wrong one is the
> characteristic mistake. PKCE retired the implicit grant because it protects a
> public client's code exchange without a secret. Spring Security 6 is a client and a
> resource server; the authorization server is a separate project now. In a resource server
> the default converter produces `SCOPE_`-prefixed authorities, `aud` is never validated by
> default, and that absence is a cross-service privilege escalation rather than a missing
> nicety. The service-to-service decision — propagation versus client credentials versus
> exchange — is really the question of whether the identity model is end-user-centric or
> service-centric, and the answer should be made once, explicitly, org-wide.

#### Further Reading

- [Spring Security Reference — OAuth2 Resource Server](https://docs.spring.io/spring-security/reference/servlet/oauth2/resource-server/index.html) — the resource-server model, token types, and the configuration entry point.
- [Spring Security Reference — OAuth2 Client](https://docs.spring.io/spring-security/reference/servlet/oauth2/client/index.html) — registration, `oauth2Login`, the grant types, and how client registration is configured.
- [Spring Authorization Server Reference](https://docs.spring.io/spring-authorization-server/reference/) — the separate project that hosts the `/authorize` and `/token` endpoints; read the getting-started page to see what moving out of Spring Security actually means.
- [OpenID Connect — How the Connect Flow Works](https://openid.net/developers/how-connect-works/) — the id token vs access token distinction, explained by the people who wrote the spec.
- [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) — re-read from the federated angle: the deny-by-default and validate-every-layer principles, which apply more strongly once a third party can present a token.

## Chapter 6 — CSRF, CORS, Sessions & Attack Surface

### 6.1 What CSRF Is and Why Authentication Is Not the Defence

The confusion here is so reliable that it is worth stating as an interview trap on its own.
CSRF is **not** about a forged credential. It is about a **credential the browser attaches
without being asked**.

```text
  The victim is logged in. Their browser holds a valid session cookie for acme.com.

  1. Victim visits evil.com.
  2. evil.com contains:
       <form action="https://acme.com/api/transfer" method="POST">
         <input name="to" value="attacker">
         <input name="amount" value="50000">
       </form>
       <script>document.forms[0].submit()</script>
  3. The browser POSTs to acme.com. It attaches the JSESSIONID cookie,
     because that is what browsers do with cookies for a matching domain.
  4. acme.com sees a valid, authenticated session and executes the transfer.

  The attacker never saw, forged, or transmitted the cookie.
  The victim's own browser supplied it, in obedience to the Same-Origin
  Policy, which protects READING across origins — not SENDING to them.
```

This is why `authenticated()` is not a CSRF defence. The request **is** authenticated —
it carries a genuine, valid session belonging to a genuine, logged-in user. What makes it
forged is that the *user did not intend it*. The defence has to establish intent, and
nothing in the ambient credential can.

> **MUST REMEMBER**
>
> The same-origin policy stops a page at `evil.com` from **reading** the response from
> `acme.com`. It says nothing about whether the browser will **send** the request. Cookies
> are sent to matching domains regardless of which page initiated the request — that is
> how links work. So a cross-site form POST carries your session cookie, and any
> authentication mechanism based on the browser attaching a credential automatically is
> CSRF-able. That includes cookies. It does **not** include an `Authorization: Bearer` header,
> because a cross-origin script cannot set one on a request it constructs.

### 6.2 The Synchroniser Token Pattern

The classic defence is `CsrfFilter`, and it is on by default for exactly the reason above:
it is protecting the default case, which is a browser application with a session.

```text
  GET /checkout
    │
    ├─ CsrfFilter: no token in the request
    │    → generate a random token (SecureRandom, 32 bytes)
    │    → store it in the HttpSession (and mirror it to the request attribute)
    │    → render it into the form as <input type="hidden" name="_csrf" value="...">
    │      (Thymeleaf: <input type="hidden" th:name="${_csrf.parameterName}"
    │                              th:value="${_csrf.token}">)
    │
  POST /checkout
    │
    ├─ CsrfFilter: token present in the request
    │    → load the expected token from the session
    │    → constant-time compare
    │    → match → chain.doFilter
    │    → no match → AccessDeniedException (403)
```

The `CsrfTokenRepository` is the abstraction over "where does the expected token live", and
the two implementations correspond to the two flows:

| Repository | Where the expected token is stored | Used by |
| --- | --- | --- |
| `HttpSessionCsrfTokenRepository` | The `HttpSession` | Server-rendered forms. The default |
| `CookieCsrfTokenRepository` | A cookie the browser echoes back | SPAs and anything that cannot get a server-rendered form |

`CsrfFilter` only checks **unsafe** methods. `GET`, `HEAD`, `TRACE`, and `OPTIONS` are
exempt, because a state change is defined as a non-idempotent method. That is why a GET
endpoint that mutates state is a CSRF-adjacent design error of its own — it is the one place
a browser will cross-site-send a credential with no token check at all.

### 6.3 The SPA Configuration That Is Actually Current

For a JavaScript SPA the session repository is wrong — the SPA has no form to render and no
session to read. The current recommended configuration uses `CookieCsrfTokenRepository` and
`XorCsrfTokenRequestAttributeHandler`.

```java
@Bean
SecurityFilterChain spaChain(HttpSecurity http) throws Exception {
    CsrfTokenRequestAttributeHandler handler = new XorCsrfTokenRequestAttributeHandler();
    // Set the attribute name explicitly so the SPA reads ONE cookie, not two.
    handler.setCsrfRequestAttributeName(null);

    return http
        .csrf(csrf -> csrf
            .csrfTokenRepository(CookieCsrfTokenRepository.withHttpOnlyFalse())
            .csrfTokenRequestHandler(handler))
        .authorizeHttpRequests(a -> a.anyRequest().authenticated())
        .build();
}
```

```yaml
server:
  servlet:
    session:
      cookie:
        name: XSRF-TOKEN
        http-only: false        # must be READABLE by JavaScript — this is the point
        secure: true
        same-site: strict
```

Three things in that configuration are load-bearing and each one is a real bug when
mistaken:

1. **The cookie must be readable by JavaScript** (`httpOnly: false`). The whole
   double-submit pattern is that the SPA reads the cookie, puts the value in a header, and
   the server compares. With `httpOnly: true` the SPA cannot read it, and the SPA either
   silently sends nothing (every write 403s) or a developer "fixes" it by making the token
   an endpoint. Naming the cookie `XSRF-TOKEN` and using the `X-XSRF-TOKEN` header
   convention is Angular's; Spring's `CookieCsrfTokenRepository` supports it out of the box.

2. **`XorCsrfTokenRequestAttributeHandler`** is the BREACH-mitigating handler. The plain
   handler sends the raw token in the request attribute, and because that value is reflected
   into the response body alongside attacker-controlled data, it can be used as a compression
   oracle. The XOR handler masks the token with a random one-time pad. The
   `setCsrfRequestAttributeName(null)` line makes the handler fall back to the
   `XOR-masked` value only, so the SPA sees a single token and does not have to implement
   the un-masking itself.

3. **`same-site: strict` (or `lax`)**. The `XSRF-TOKEN` cookie is deliberately readable, and
   it is a defence against CSRF. If it is sent on cross-site requests, a second channel
   opens. Note the tension with the session cookie: the *session* cookie also needs
   `sameSite`, and `lax` is usually the right value there because `strict` breaks the
   redirect back from the identity provider.

> **INTERVIEW TRAP — "IS `CookieCsrfTokenRepository` SAFE?"**
>
> No, not on its own, and this is the question the double-submit pattern invites. A plain
> cookie whose value is compared to a header is vulnerable to **cookie injection**: an
> attacker who can set a cookie on your domain (via a subdomain, a header-injection bug, or
> a related-domain XSS) can plant a known token and then send a matching header, and the
> server sees a valid pair. The mitigations are that the cookie must be `Secure` (so it
> cannot be planted over plaintext), must be host-only (no `Domain` attribute widening it
> to siblings), and — for the same-origin SPA case — must be combined with
> `SameSite`, which stops the browser from sending the *session* cookie cross-site in the
> first place, which is the property the double-submit pattern is actually a second line of
> defence for.

### 6.4 When Disabling CSRF Is Correct

```java
.csrf(csrf -> csrf.disable())
```

The condition is precise, and teams get it wrong by stating it loosely.

```text
  Disabling CSRF is correct when ALL of these hold:

    1. No browser-held credential authenticates the request.
       (a cookie, a Basic auth cached by the browser, TLS client cert in
       the browser's cert store, or an ambient HTTP auth header)

    2. The credential, if there is one, cannot be attached
       automatically by a third-party page.
       (an Authorization: Bearer header set by your JS qualifies;
        a cookie does not)

    3. You are not relying on the browser's ambient state for
       authentication — the token is attached by application code
       on a page you control.
```

So: **a pure token-authenticated API is the right case.** Bearer tokens, mTLS client
certificates, and API keys in headers are not ambient — a cross-origin page cannot set an
`Authorization` header on a form POST, so there is no credential for an attacker to have the
browser supply.

| Situation | CSRF? | Why |
| --- | --- | --- |
| JWT bearer API, no cookies at all | Disable is correct | No browser-held credential to forge |
| JWT **plus** a refresh token in an `HttpOnly` cookie | **Keep CSRF** | The refresh cookie *is* browser-held and ambient. This is the mistake: "we're stateless" while holding a cookie |
| Form login with `JSESSIONID` | Keep, always | The canonical case |
| Server-rendered Thymeleaf forms | Keep | `th:name="${_csrf.parameterName}"` is free |
| SPA with a cookie-backed session | Keep | Use `CookieCsrfTokenRepository` |
| API with HTTP Basic from a browser (curl-like clients excluded) | Keep | Browsers cache and resend Basic credentials — it *is* ambient |
| SPA with access token in memory, refresh in `HttpOnly` cookie | Keep, on the refresh endpoint at minimum | Same reason as above |

> **PRODUCTION SCENARIO**
>
> Problem: a stateless API was migrated to store its refresh token in an `HttpOnly`
> `SameSite=Strict` cookie so the SPA could not read it. Six weeks later a report came in
> that one user's account had been used from an unfamiliar city.
> Investigation: the chain had `csrf.disable()` carried over from the pure-bearer version,
> and the access token lived in memory while the refresh token lived in the cookie. The
> attack was a cross-site form POST to the refresh endpoint: the browser attached the
> refresh cookie, the endpoint returned a new access token in the response body, and the
> attacker's page could not read it — but it could keep triggering it, and a companion
> script could exfiltrate via a timing-free side channel on a slow endpoint.
> Root cause: "stateless" was applied as a config flag rather than as a property of the
> design. The moment a cookie was reintroduced, the application had a browser-held ambient
> credential and no intent check.
> Solution: `csrf.disable()` was removed and `CookieCsrfTokenRepository` +
> `XorCsrfTokenRequestAttributeHandler` configured; the refresh endpoint takes the token
> from the cookie **and** requires the `X-XSRF-TOKEN` header.
> Prevention: a lint rule in the build that fails if `csrf.disable()` and a `Cookie`-based
> session or token repository appear in the same chain.

### 6.5 CORS

CORS is the browser's cross-origin *read* policy, and it is frequently confused with CSRF
protection. They are different mechanisms solving different halves of the same problem:
CORS decides whether a script may **read** a response; CSRF decides whether a request was
**intended**.

```java
@Bean
SecurityFilterChain chain(HttpSecurity http) throws Exception {
    return http
        .cors(cors -> cors.configurationSource(request -> {
            CorsConfiguration cfg = new CorsConfiguration();
            cfg.setAllowedOrigins(List.of("https://app.example.com"));   // NOT "*" with credentials
            cfg.setAllowedMethods(List.of("GET", "POST", "PUT", "DELETE"));
            cfg.setAllowedHeaders(List.of("Authorization", "Content-Type", "X-XSRF-TOKEN"));
            cfg.setExposedHeaders(List.of("Location"));
            cfg.setAllowCredentials(true);
            cfg.setMaxAge(Duration.ofHours(1));       // how long a preflight may be cached
            return cfg;
        }))
        .build();
}
```

```yaml
spring:
  mvc:
    cors:
      allowed-origins: https://app.example.com
```

The rules that are actually enforced by browsers, and that people get wrong:

| Rule | What it means |
| --- | --- |
| `Access-Control-Allow-Origin: *` with `Access-Control-Allow-Credentials: true` | **Rejected by the browser.** The two cannot be combined. Use an explicit origin, or `allowedOriginPatterns` if you genuinely need wildcards |
| Origin must match exactly | `https://app.example.com` and `https://app.example.com:443` and `https://APP.example.com` are three different things to a browser |
| A preflight is a real HTTP request | For a non-simple request (JSON content type, `Authorization` header, `PUT`/`DELETE`), the browser sends `OPTIONS` first. If your chain does not handle `OPTIONS` correctly, every write from the SPA fails with a CORS error that looks like a server 500 |
| CORS is a browser control only | `curl` ignores it entirely. It is not a server-side authorization mechanism and never was |
| `CorsFilter` sits **above** `CsrfFilter` in the chain | A preflight `OPTIONS` is a safe method and is not CSRF-checked, but ordering still matters for where a rejected preflight's response is produced |

> **INTERVIEW TRAP — "DO I NEED BOTH CORS AND CSRF?"**
>
> Yes, and the reason is that they are not substitutes. CORS stops a foreign page from
> *reading* your response; CSRF stops a foreign page from *causing* an authenticated state
> change. A CSRF attack against a form POST succeeds even with perfect CORS, because the
> attacker does not need the response — the money still moves. Conversely CORS is what stops
> `evil.com` from reading your API's response via `fetch` with credentials. Teams that
> disable CSRF "because we configured CORS" have removed half the defence and kept the half
> that does not matter for the attack they are worried about.

### 6.6 Sessions: Fixation, Concurrency, Timeout, Cookies

```java
http
  .sessionManagement(s -> s
      .sessionFixation(f -> f.changeSessionId())          // the default since 4.x
      .sessionConcurrency(c -> c
          .maximumSessions(1)                              // N+1 forces a new session
          .maxSessionsPreventsLogin(false)                // the default: expire the oldest
          .sessionRegistry(sessionRegistry))
      .invalidSessionUrl("/login?expired")
      .sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED));
```

| Control | Default | What it does | Failure mode if wrong |
| --- | --- | --- | --- |
| **Session fixation protection** | `changeSessionId` | Issues a **new session id** on privilege change, keeping the data | If disabled entirely, an attacker who plants a known `JSESSIONID` in a victim's browser inherits the session after login. `changeSessionId` is the right migration (`migrateSession` copies attributes and is the wrong choice when attributes are themselves sensitive) |
| **Concurrent session control** | Unlimited | Caps how many sessions one principal may hold | Unlimited means a compromised password can be used from ten devices simultaneously and nothing tips anyone off |
| **Session timeout** | 30 minutes idle | Server-side expiry | Too long widens the window for a stolen session; too short logs out legitimate users mid-task. Make it a per-role decision, not a global constant |
| **`HttpSessionIdCookiePolicy`** | `Default` (session cookie, no `Max-Age`) | Names the cookie so only the session cookie travels | Setting `CookiePolicy` to `SingleCookie` breaks applications that keep another cookie |
| **`JSESSIONID` flags** | Boot sets `HttpOnly` and `SameSite=Lax` | `httpOnly` stops JS reading it, `secure` stops plaintext, `sameSite` is a second CSRF defence | `secure: false` in production means the session id is on the wire in every request |

```java
server:
  servlet:
    session:
      timeout: 30m
      cookie:
        name: SESSION
        http-only: true
        secure: true
        same-site: lax
        # path: /
      tracking-modes: cookie      # never URL rewriting — ?jsessionid= leaks in Referer
```

> **PRODUCTION SCENARIO**
>
> Problem: a user reported that clicking a link in an email logged them out and then
> apparently logged *someone else* in on a shared machine.
> Investigation: the link went to a page behind authentication. The session was
> `invalidated` and a new one created, and the container was in `URL` tracking mode because
> `server.servlet.session.tracking-modes` was not set and the cookie was blocked in that
> browser context.
> Root cause: URL-based session tracking. The session id appeared as `;jsessionid=` in the
> URL, and the browser then wrote it into history, bookmarks, and — critically — the
> `Referer` header of every outbound request on the page, including to third parties. Any
> recipient of that `Referer` has a valid session id.
> Solution: set `server.servlet.session.tracking-modes: cookie` and confirmed `http-only`,
> `secure` and `same-site` on the cookie.
> Prevention: a configuration assertion in the test suite that fails if `tracking-modes`
> contains `url`, plus a periodic check of the response headers of a real endpoint.

### 6.7 The Wider Attack Surface

| Attack | Where it lands in Spring | The control |
| --- | --- | --- |
| **Mass assignment** | `@ModelAttribute` and `@RequestBody` binding a client-supplied object directly onto a persistence entity — a client posts `{"role":"ADMIN"}` and gets a role | Do not bind to an entity. Bind to a DTO and map explicitly. This is Volume 5 Chapter 3's `@ModelAttribute` trap, and it is the highest-frequency real vulnerability in Spring applications |
| **Path traversal** | `new File(baseDir, request.getParameter("name"))`, or a `Resource` resolved from user input | Resolve, then assert the result is under the base directory. Spring's `Resource` abstraction does not prevent `../` |
| **Unsafe deserialization** | `ObjectInputStream` on anything from the wire; Jackson polymorphic typing | Jackson's default typing is a deserialization gadget waiting to happen. Never enable `enableDefaultTyping` / `activateDefaultTyping` on untrusted input |
| **Open redirect** | `redirect:` URLs, `AuthenticationSuccessHandler` reading a `returnUrl` parameter, or a `Location` header built from user input | Only redirect to a path on your own host, or validate against an allowlist. `RedirectView` with a user-supplied URL is the classic |
| **XXE** | XML parsers that resolve external entities | Disable DTD and external entities on every `DocumentBuilderFactory`/`SAXParser`/`XMLInputFactory` you create |
| **Expression injection** | SpEL evaluated against user input | SpEL is a full language. Never evaluate a user-supplied string as SpEL |
| **Header/CRLF injection** | Values placed in response headers or logs without sanitising `\r\n` | Spring's header writers are careful; your own `response.setHeader` calls are not |
| **Information leakage** | Stack traces, `/actuator` endpoints, `server.error.include-stacktrace` | The Actuator exposure rule from Volume 7 — `health` and `info` by default, everything else opt-in and network-restricted |

```java
// Mass assignment — the trap, and the fix
@Entity class UserAccount { Long id; String email; Role role; BigDecimal balance; }

@PostMapping("/users")
public UserAccount create(@RequestBody UserAccount incoming) {   // ← role is settable
    return repo.save(incoming);
}

@PostMapping("/users")
public UserResponse create(@RequestBody CreateUserRequest req) { // ← no role field exists
    UserAccount u = new UserAccount(req.email(), req.name());
    return UserResponse.from(repo.save(u));
}
```

> **STAFF-LEVEL CONSIDERATION**
>
> Security review does not scale by reading diffs, and the interesting question in a design
> review is where the *control* lives rather than whether this particular endpoint is
> correct. Mass assignment is the control that is missing: there is no framework flag that
> prevents a controller from binding a request body onto an entity, so the only scalable
> answer is a convention (no controller method takes an entity as a parameter) plus a static
> check that enforces it — an ArchUnit rule over `@RequestBody` parameter types, which is
> the same mechanism as the missing-`@PreAuthorize` rule from Chapter 3. The same reasoning
> applies to open redirects and to user input reaching a `Location` header: both are
> prevented by a shared validator that everyone uses, and neither is prevented by reviewing
> the diff.

> **SCALING REALITY CHECK**
>
> `BCryptPasswordEncoder` at strength 10 costs roughly 100ms of CPU **per comparison**, on
> the login path, by design. A service with 200 concurrent login attempts in flight is
> spending about 20 CPU-seconds per second of wall time, so it needs headroom proportional
> to your peak login rate rather than to your average request rate. Two consequences:
> a failed-login rate limiter is a **capacity** control, not just a security control, and a
> distributed rate limiter (Redis, or the token-bucket filter) is needed if you run more
> than one instance — otherwise a per-instance limit is multiplied by the instance count the
> moment you scale out, which is the number that changes during an attack.

#### Common Mistakes

- Disabling CSRF on a chain that holds a cookie-backed session or a cookie-stored refresh
  token. "Stateless" is a property of the server, not of the browser's credential.
- `CookieCsrfTokenRepository` with `httpOnly: true`, so the SPA cannot read the token and
  every write 403s.
- Treating CORS as a CSRF defence, or CSRF as a CORS defence. They are different halves of
  the same problem.
- Leaving session tracking in URL mode, which puts the session id in `Referer` headers and
  browser history.
- Accepting `Access-Control-Allow-Origin: *` together with `allowCredentials(true)` and
  discovering in the browser console that the response is inaccessible.
- Binding `@RequestBody` to a JPA entity, which lets a client set `role`, `balance` or
  `id`.
- Building a redirect `Location` from a query parameter.

#### Interview Questions — CSRF, CORS, Sessions & Attack Surface

**Q1. What is CSRF, and why is being authenticated not a defence against it?** `TRICKY`

The browser attaches credentials to cross-site requests automatically — a `JSESSIONID` cookie
matching the target domain is sent whether or not the page that initiated the request is
trusted, because that is how cookies work. The attacker never forges or sees the
credential; the victim's own browser supplies it in obedience to the same-origin policy,
which governs *reading* a response, not *sending* a request. So the request really is
authenticated and really is forged: the missing property is user intent. The defence has to
establish intent explicitly, which is what the synchroniser token does.

**Q2. When is disabling CSRF correct, and what is the precise condition?** `ADVANCED`

When no browser-held credential can be attached to a cross-site request automatically. A
pure bearer-token API qualifies: a cross-origin page cannot set an `Authorization` header on
a form POST, so there is no ambient credential to forge. The condition is **not** "the
service is stateless" — it is "no cookie, no cached browser Basic auth, no ambient
credential of any kind". An API that holds a refresh token in an `HttpOnly` cookie is not
stateless from CSRF's point of view, and that is the most common configuration where the
`disable()` is wrong. A precise test: if the browser would attach something to the request
without the application's JavaScript running, CSRF applies.

**Q3. How does the synchroniser token work, and why does the SPA variant use a cookie?**
`TRICKY`

The server generates a random token, stores the expected value in the session, and renders
it into the form as a hidden field; on every unsafe method the filter compares the submitted
token to the stored one. An attacker's page can cause the request but cannot read the token
from your domain, so it cannot supply a matching value. The SPA variant uses
`CookieCsrfTokenRepository` because the SPA has no server-rendered form and no session to
read: the expected value goes in a cookie the JavaScript can read, the SPA copies it into
the `X-XSRF-TOKEN` header, and the server compares the two — the double-submit pattern. The
cookie must therefore be `httpOnly: false`, which is deliberate and is the one thing people
get wrong, and `XorCsrfTokenRequestAttributeHandler` is used to prevent the raw token acting
as a BREACH compression oracle when it is reflected into a response.

**Q4. Is `CookieCsrfTokenRepository` safe on its own?** `ADVANCED`

No — a bare double-submit comparison is vulnerable to cookie injection: anyone who can set a
cookie on your domain (a subdomain takeover, a header-injection flaw, a related-domain XSS)
can plant a token they know and send a matching header, and the server sees a valid pair.
The mitigations are that the cookie must be `Secure` so it cannot be planted over plaintext,
must be host-only rather than `Domain`-widened, and must be combined with `SameSite` — which
stops the browser sending the *session* cookie cross-site at all, making the double-submit
check a second line rather than the only one. In practice the current recommendation is
`CookieCsrfTokenRepository` plus `XorCsrfTokenRequestAttributeHandler` plus a
`SameSite=Strict` session cookie, with CSRF left enabled.

**Q5. Do CORS and CSRF solve the same problem?** `TRICKY`

No, and this is one of the most reliable interview errors. CORS decides whether a script on
another origin may **read** a response; CSRF decides whether a request was **intended** by
the user. A CSRF form POST succeeds with perfect CORS configuration, because the attacker
does not need the response — the money still moves. CORS is also a browser-only control that
`curl` ignores entirely, so it is never server-side authorization. You need both: CSRF
because ambient credentials are forgeable, CORS because cross-origin reads are a leak.

**Q6. What does session fixation protection do, and what is the difference between
`changeSessionId` and `migrateSession`?** `TRICKY`

It issues a new session identifier at the moment of privilege change, so a session id an
attacker planted in a victim's browser before login is worthless afterwards — the attacker's
id points at a session that never gains privileges. `changeSessionId` keeps the existing
session's attributes and only changes the identifier, which is the default and is what you
want. `migrateSession` creates a brand-new session and copies attributes across, which is
the wrong choice when the session holds anything sensitive, because the attacker who knows
the old id may still be able to read the attributes as they are copied. Both defeat the
attack; the second one is strictly more work and more risk for no benefit.

**Q7. A PR binds a `@RequestBody` directly to a JPA entity. What is the vulnerability, and
what is the scalable control?** `STAFF`

Mass assignment. A client can include `role`, `balance`, `id` or `createdAt` in the JSON and
they are bound to the entity, so privilege and financial fields are client-controlled. The
per-endpoint fix is to bind a DTO with only the settable fields and map explicitly, and
leaving the entity setters accessible so it "works with Jackson" is what makes it possible.
The scalable control is not review — it is a static check, an ArchUnit rule asserting that
no controller method takes a `@RequestBody` of an `@Entity` type, failing the build on a
violation. That converts a per-PR vigilance problem into a mechanism, which is the only
thing that survives a team growing.

**Q8. Your team's rule is "stateless APIs disable CSRF". When does that rule cause a
vulnerability?** `SCENARIO`

The moment a cookie is introduced into the chain. The common case: a stateless JWT API adds
an `HttpOnly` refresh-token cookie so the SPA cannot read it, nobody changes the CSRF
configuration, and the refresh endpoint now accepts any cross-site POST carrying that
cookie. The rule needs to be restated as "disable CSRF only where no browser-held
credential authenticates the request", and checked mechanically: a build rule that fails
when `csrf.disable()` and a cookie-based session or token repository appear in the same
chain. The more general lesson is that a rule phrased about the server's architecture
rather than about the browser's state will eventually be applied to a configuration it was
not written for.

> **CHAPTER 6 SUMMARY**
>
> CSRF is not about a forged credential — it is about a credential the browser attaches
> without being asked, which is why "the request is authenticated" and "the request was
> intended" are different things. The synchroniser token is the defence, and
> `CookieCsrfTokenRepository` with `XorCsrfTokenRequestAttributeHandler` is the current SPA
> configuration, with the deliberate consequence that the cookie must be readable by
> JavaScript. Disabling CSRF is correct precisely when no browser-held credential exists to
> be forged, which is narrower than "the service is stateless" and is the single most
> common place that shortcut causes an incident. CORS is a read-control, not an
> intent-control, and the two are complements. Sessions need `changeSessionId` on privilege
> change, cookie-based tracking rather than URL, and honest timeouts. And the wider surface —
> mass assignment above all — is controlled by conventions a static check can enforce, not
> by review.

#### Further Reading

- [Spring Security Reference — CSRF](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html) — the synchroniser pattern, the repositories, and the BREACH/XOR handling.
- [Spring Security Reference — CORS integration](https://docs.spring.io/spring-security/reference/servlet/integrations/cors.html) — how `CorsFilter` fits into the chain and the configuration-source model.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — session fixation, the cookie attributes, and the properties to assert on.
- [OWASP Content Security Policy Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html) — the header `HeaderWriterFilter` writes by default, and what a real policy needs beyond it.
- [OWASP Top Ten](https://owasp.org/www-project-top-ten/) — the broken-access-control and identification-and-authentication-failure categories this chapter's controls map onto.

## Chapter 7 — Testing & Hardening

### 7.1 `@WithMockUser` and Its Honest Limitation

```java
@SpringBootTest
@WebMvcTest(AccountController.class)
class AccountControllerTest {

    @Test
    void anonymous_is_rejected() throws Exception {
        mockMvc.perform(get("/api/accounts/1"))
               .andExpect(status().isUnauthorized());
    }

    @Test
    @WithMockUser(username = "alice", authorities = "SCOPE_accounts.write")
    void writeScope_can_write() throws Exception {
        mockMvc.perform(post("/api/accounts").content("{\"email\":\"a@b.c\"}"))
               .andExpect(status().isCreated());
    }

    @Test
    @WithMockUser(username = "alice", authorities = "SCOPE_accounts.read")
    void readOnly_cannot_write() throws Exception {
        mockMvc.perform(post("/api/accounts").content("{\"email\":\"a@b.c\"}"))
               .andExpect(status().isForbidden());
    }
}
```

The annotations: `@WithMockUser` (a synthetic `UserDetails`-based principal),
`@WithAnonymousUser`, `@WithUserDetails("alice")` (loads the **real** `UserDetails` from
your `UserDetailsService`, so it picks up real authorities and real account state), and
`@WithJwt` / `jwt()` (Spring Security 6's JWT request post-processor, which lets you build
a token with specific claims for a resource-server test).

> **MUST REMEMBER**
>
> **`@WithMockUser`'s authorities are exactly the strings you wrote in the annotation.** They
> are not computed from your `UserDetailsService`, your database, or your role model. A test
> with `@WithMockUser(authorities = "ADMIN")` passes against a system where nobody has the
> authority `ADMIN`, and a test that "proves" the authorization works may be proving a rule
> that no real principal can satisfy. If the authority names matter to the test, use
> `@WithUserDetails`, which goes through the real `UserDetailsService`, or assert the mapping
> in a separate test that constructs the authorities the way production does. The
> dangerous version of this is a suite where every test passes and the deployed system
> grants nobody the scope the code checks for.

### 7.2 `@WebMvcTest` and Skipping the Chain

`@WebMvcTest` auto-configures Spring Security. The two common mistakes are the opposite
ones: forgetting that the filter chain is active (so a test that expected 401 gets 404, or
one that posts without a CSRF token gets 403), and disabling the chain entirely.

```java
@WebMvcTest(AccountController.class)
@AutoConfigureMockMvc(addFilters = false)   // ← an EXPLICIT, REVIEWED decision
class AccountControllerWebLayerTest {
    @Test
    void posts_a_user() throws Exception { ... }   // passes — and tests no security at all
}
```

`addFilters = false` is a legitimate tool: it makes a controller test fast and lets you
assert handler-level behaviour without constructing an authentication each time. It is a
liability when it is the *only* kind of test, because the authorization layer becomes
completely unexercised and a `SecurityFilterChain` change that opens an endpoint is caught
by nothing. The staff-level position is that it should be one of two layers — a
controller-behaviour test without filters, plus a separate integration test **with** the
real chain — and that the decision to use it should be visible in the test name or a
comment, because `@WebMvcTest` alone looks like security is covered when it is not.

```java
// MockMvc WITH the real filter chain — Spring Security 6 request post-processors
@SpringBootTest
@AutoConfigureMockMvc
class RealChainTest {

    @Autowired MockMvc mockMvc;

    @Test
    @WithMockUser(authorities = "SCOPE_accounts.read")
    void readOnly_token_is_forbidden() throws Exception {
        mockMvc.perform(post("/api/accounts")
                .with(csrf())                    // the chain's CSRF filter is real
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.c\"}"))
               .andExpect(status().isForbidden());
    }

    @Test
    void post_without_csrf_token_is_rejected() throws Exception {
        mockMvc.perform(post("/api/accounts")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"email\":\"a@b.c\"}"))
               .andExpect(status().isForbidden());      // proves CSRF is ON
    }

    @Test
    void resourceServer_accepts_a_valid_bearer_token() throws Exception {
        mockMvc.perform(get("/api/accounts/1")
                .with(jwt().jwt(jwt -> jwt.subject("alice")
                                           .audience(List.of("accounts-api"))
                                           .claim("scope", "accounts.read"))))
               .andExpect(status().isOk());
    }
}
```

> **INTERVIEW TRAP — "MY TESTS PASS BUT THE ENDPOINT IS WIDE OPEN"**
>
> The most common cause is `@AutoConfigureMockMvc(addFilters = false)`, which removes the
> filter chain from the test and with it every authorization rule the application has. A
> test that posts to `/api/accounts` and expects 201 will pass whether the rule is
> `.authenticated()`, `.permitAll()`, or absent entirely. The second most common cause is
> `@WithMockUser` authorities that the real system never grants. The third is testing a
> `SecurityFilterChain` bean in isolation with a hand-built `HttpSecurity` and asserting on
> the built chain's shape, rather than making a request through it. The general rule: an
> authorization assertion is only real if the assertion went through the chain, and the test
> should make that visible.

### 7.3 A Hardening Checklist

This is the list worth keeping. Each item says what to verify and what breaks if it is
wrong.

| Verify | Failure mode if wrong |
| --- | --- |
| `PasswordEncoder` is a `DelegatingPasswordEncoder` with no `{noop}` in stored values | Passwords stored in plaintext or a fast hash. Trivially cracked offline from a database dump |
| BCrypt strength is current (12+), or Argon2 is used | An offline attacker with GPUs or rented hashcat. BCrypt strength 10 is roughly 10,000× weaker than 12 against offline cracking |
| No `InMemoryUserDetailsManager` in a non-test profile | Credentials in source control; no lockout; no audit |
| `authorizeHttpRequests` has no `permitAll()` above a specific rule | Whole subsystems world-writable, with no error |
| Method-level `@PreAuthorize` on the public methods of every protected service | Self-invocation and proxy bypass; a forgotten annotation is an open endpoint |
| `csrf.disable()` appears only where no browser-held credential exists | Cross-site state change with a real session |
| `httpOnly`, `secure`, `sameSite` on `JSESSIONID` and any token cookie | Session id on the wire; readable by JS; sent cross-site |
| Session tracking is cookie-only, never URL | Session id in `Referer` headers and browser history |
| `aud` validated on every resource server | Cross-service privilege escalation |
| `JwtDecoder` has a fixed algorithm | `alg: none` and RS256→HS256 confusion |
| Access token lifetime ≤ 15 minutes, and there is a revocation path | Stolen tokens work for hours with no way to stop them |
| Actuator exposure is `health,info` only, on a management port, behind auth | `/actuator/env`, `/actuator/heapdump` leaking configuration and secrets |
| `server.error.include-stacktrace` is `never` in production | Stack traces with package names, versions, and sometimes SQL |
| `management.endpoints.web.exposure.include` reviewed, not `*` | The whole management surface public |
| Security headers present: CSP, `X-Content-Type-Options`, `HSTS`, `frame-ancestors` | Clickjacking, MIME confusion, downgrade. `HeaderWriterFilter` writes several by default — verify a CSP is actually configured, because the default is minimal |
| `@RestController` methods never take an `@Entity` as `@RequestBody` | Mass assignment: role, balance, id are client-controlled |
| No SpEL, no XML parsing, no `ObjectInputStream` on untrusted input | Remote code execution |
| Redirect targets validated against a host allowlist | Open redirect, used for phishing and OAuth token theft |
| CORS `allowed-origins` is explicit, never `*` with credentials | Any origin can read authenticated responses |
| Rate limiting on login, password reset, and token endpoints | Credential stuffing; also a CPU-exhaustion vector, since BCrypt is ~100ms per comparison |
| Logs do not contain tokens, passwords, or full `Authorization` headers | A log aggregator is a credential store, and it is usually less protected than the database |
| `UserDetails` implementations override all four account-state flags | Disabled and locked branches unreachable — lockout does nothing |
| Error responses do not distinguish "user not found" from "bad password" | Account enumeration |

### 7.4 Incident Response

The hardening question has an inverse form, and teams that only prepared the forward
direction find out about the inverse at 3am.

```text
  A credential is suspected compromised. What do you do, in order?

  1. CONTAIN the credential
       session:     delete the session(s) for that user — a session store
                    makes this one API call
       JWT:         there is no session. You need a denylist keyed by jti,
                    a short expiry, or a global signing-key rotation.
                    ← this is the whole argument from Chapter 4, restated
                    as an operational runbook item

  2. ROTATE what was shared
       a leaked client secret → rotate at the authorization server
       a leaked signing key  → publish a new key with a new kid, keep the
                               old one for longer than the max token life

  3. ESTABLISH SCOPE
       who had it, when, from where, what did they reach?
       → requires audit logging of authentication events, authorization
         decisions, and data access, at a granularity you can query

  4. NOTIFY and REVIEW
       what was accessed, what must be disclosed, what must be fixed
```

**Enumerating live sessions is a feature you have to build.** The security team's first
question in any session-based incident is "who is logged in right now, and where from",
and the answer requires a `SessionRegistry` you can query.

```java
@Bean
SessionRegistry sessionRegistry() {
    return new SessionRegistryImpl() {
        @Override
        public SessionInformation getSessionInformation(String sessionId) {
            return super.getSessionInformation(sessionId);
        }
    };
}

@Component
class LiveSessionReport {
    private final SessionRegistry registry;

    List<String> activeUsers() {
        // SessionRegistryImpl holds principals → sessions; expose it deliberately,
        // behind authorization, and audit every call.
        return registry.getAllPrincipals().stream()
                .map(Object::toString)
                .toList();
    }
}
```

`SpringSessionBackedSessionRegistry` does the same against a Redis-backed session store,
which is what you need if the sessions are not in the application's heap. Neither is
enabled by default in a way an on-call engineer can query, and **a stateless JWT
architecture removes the capability entirely** — there is no list, because there is no
state. That is not a bug in the JWT design; it is the design. But it is a capability your
security team will need, and the honest time to establish that is during architecture
review, not during the incident.

> **STAFF-LEVEL CONSIDERATION**
>
> The question worth raising in a design review is: **"when we have an incident at 3am,
> what is the runbook, and does this design support it?"** Security features are usually
> specified by what they prevent, and rarely by what they enable afterwards. Three
> capabilities that a design should be able to answer for, and that most designs do not:
> kill a single user's access immediately; enumerate who is currently authenticated; and
> determine what a given account touched in a window. The first is a session registry or a
> denylist. The second is a session store. The third is audit logging at the data-access
> layer, not at the login layer.
>
> The organisational version: decide once, in writing, whether audit logging is a security
> control or a debugging tool. If it is a control, it is a compliance artefact with
> retention requirements, access control and a cost model — and it is designed for an
> incident responder who is not the engineer who wrote it. If it is a debugging tool, it
> will not be there in the shape you need at 3am, because it will have been tuned for
> development and pruned for cost.

> **PRODUCTION RELEVANCE**
>
> Two logging details cause real incidents. First, `debug=true` on Spring Security logs the
> full `Authorization` header and, in some configurations, the token's claims — which puts
> live bearer tokens into log aggregation, where they are retained for months and are
> visible to a much wider group than the application. Second, a stack trace in a 500
> response leaks class names, versions and occasionally SQL fragments; the check is
> `server.error.include-stacktrace=never` outside local profiles, asserted in a test. Both
> are on the checklist above for a reason.

#### Common Mistakes

- Believing `@WithMockUser` authorities reflect the real system. They are the literal
  strings in the annotation, which can be authorities no real principal holds.
- Using `@AutoConfigureMockMvc(addFilters = false)` as the only test of a protected
  endpoint, and concluding authorization is covered.
- Writing a `SecurityFilterChain` test that builds the chain and asserts on its shape
  instead of making a request through it.
- Mocking a `UserDetailsService` in the test, so the account-state flags and the authority
  mapping are never exercised against real data.
- Enabling Spring Security debug logging in production and shipping tokens to the log
  aggregator.
- A `/actuator` exposure of `*` "just in case", on the main port.
- Assuming revocation exists because there is a logout button.

#### Interview Questions — Testing & Hardening

**Q1. `@WithMockUser` — what exactly does it set up, and what does it not prove?**
`TRICKY`

It installs a synthetic `Authentication` whose principal is a `User` and whose authorities
are exactly the strings in the annotation. It does not consult your `UserDetailsService`,
your database, or your role model, so it can grant a test an authority no real principal
holds — which means a passing test may be asserting against a rule that cannot be satisfied
in production. When the authority names are load-bearing, use `@WithUserDetails`, which
builds the principal from your real `UserDetailsService` and therefore exercises the real
mapping, or test the mapping separately. `@WithAnonymousUser` and Spring Security 6's `jwt()`
post-processor cover the anonymous and resource-server cases.

**Q2. When is `@AutoConfigureMockMvc(addFilters = false)` the right call, and what must you
do if you use it?** `SCENARIO`

It is right for a controller-behaviour test — asserting handler, binding, serialisation and
exception handling without constructing an authentication or a CSRF token for every method.
It is wrong as the *only* kind of test, because it removes the entire `SecurityFilterChain`
and leaves authorization completely unexercised, so a change that opens an endpoint is
caught by nothing. If you use it, pair it with a second layer that makes real requests
through the real chain — asserting a 403 for an insufficient scope and a 401 for an
anonymous request — and make the decision visible in the test name or a comment, because
`@WebMvcTest` on its own reads as "security is covered".

**Q3. A deployment used BCrypt strength 10 for four years. What is the migration path, and
what is the operational risk?** `STAFF`

Switch to a `DelegatingPasswordEncoder` whose encoding default is the stronger algorithm
while retaining BCrypt 10 for matching, and let `DaoAuthenticationProvider` re-hash on next
login — the `{id}` prefix is what makes that possible, and offline re-hashing is impossible
because you do not have the plaintext. Two operational risks to plan for. First, the
comparison cost rises about 4× at strength 12, which changes both login latency and the
throughput of your rate limiter, so capacity-plan the login path before you ship it.
Second, the `updatePassword` call must actually persist; a `UserDetailsService` that ignores
it makes the migration silently never progress, which is why the metric to watch is the
proportion of stored hashes whose `{id}` prefix is the current default.

**Q4. Your team has a stateless JWT API. The security team calls at 3am: a token for user
U is compromised. Walk them through it.** `SCENARIO`

With a stateless design there is no session to kill, so the first question is what capability
you actually have. If you have a `jti` denylist, add the token id and it dies immediately.
If not, the honest answer is that you cannot kill it before `exp`, which makes the remaining
steps: confirm the access-token lifetime and communicate the maximum exposure window, rotate
the signing key if the compromise might be the key rather than the token (publish a new key
with a new `kid`, keep the old one for longer than the longest token lifetime), and force a
global re-authentication by invalidating refresh tokens server-side. Then establish scope
from audit logs — which requires that you log authorization decisions and data access, not
just logins. The runbook gap is usually not technical; it is that nobody decided who can
enumerate live sessions, and a stateless design has no list.

**Q5. How would you verify a `SecurityFilterChain` is actually correct, in a way that
survives refactoring?** `ADVANCED`

With requests, not introspection. A test that builds the chain and asserts on its filter list
tells you about the configuration and nothing about the behaviour, and it will still pass
after someone inserts a permissive rule. Write assertions against the running chain: an
anonymous request to a protected endpoint is 401 (or a 302 on a browser chain — assert the
one your chain should do), an authenticated-but-insufficient-scope request is 403, a
sufficient-scope request is 2xx, and a request to `/admin/**` with a non-admin principal is
rejected. Those four assertions are the policy expressed as tests, and they fail when the
policy changes, which is the only property you want. The one thing to add for a multi-chain
setup is a test that a given path is claimed by the *expected* chain, since chain-selection
order is not visible in any single endpoint test.

**Q6. Which security headers does Spring Security write by default, and which one do you
have to configure yourself?** `TRICKY`

`HeaderWriterFilter` writes several by default, including `X-Content-Type-Options: nosniff`,
`X-Frame-Options: DENY` (or the `frame-ancestors` equivalent), `X-XSS-Protection: 0`, and
`Cache-Control` on responses that set credentials. HSTS is written only when `requiresChannel`
is set to HTTPS. The one you almost always have to configure yourself is **Content-Security-
Policy** — the default is either absent or minimal, and a CSP is the control that actually
prevents an XSS payload from executing, which is the root cause behind most of the
token-theft scenarios in this volume. Also verify `Referrer-Policy` and
`Permissions-Policy`, which are not on by default.

**Q7. A reviewer's checklist item is "no secrets in logs". What is the actual risk, beyond
tidiness?** `STAFF`

Logs have a different trust and reach boundary than the database. They are shipped to a
central aggregator, retained for weeks or months, indexed and searchable, and read by a much
larger group — support, SRE, contractors, and anyone with a Datadog or Splunk role. A bearer
token or a password in that system is a credential with months of lifetime in a system that
nobody threat-models as a credential store. In practice the sources are Spring Security
`debug=true` logging the `Authorization` header and the token claims, exception messages
that interpolate a request parameter, and audit logs that record the full token. The control
is a redaction filter at the appender, not a code review convention, because the review
cannot see what a third-party library logs.

> **CHAPTER 7 SUMMARY**
>
> `@WithMockUser`'s authorities are the literal strings you wrote, not what the real system
> grants, which is the single most misleading thing about security testing. Tests must go
> through the real filter chain, and `addFilters = false` is a legitimate speed tool that
> becomes a coverage hole the moment it is the only layer. The hardening list is worth
> keeping as a table of configuration-against-failure-mode, and the entries with the highest
> incident yield are the delegating password encoder, the matcher ordering rule, `aud`
> validation, the CSRF condition, and mass assignment. Incident response is the inverse
> question, and it is a design question: a system that cannot enumerate live sessions, kill
> one user's access immediately, or say what an account touched in a window has a
> capability gap that no amount of hardening closes.

#### Further Reading

- [Spring Security Reference — Testing](https://docs.spring.io/spring-security/reference/servlet/test/index.html) — the test support module, `@WithMockUser` variants, and the reactive test support.
- [OWASP Logging Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html) — what to log, what must never be logged, and the redaction layer that enforces it.
- [OWASP Session Management Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) — the properties to assert on, and the enumeration capability an incident responder needs.
- [Spring Security Reference — What Is New](https://docs.spring.io/spring-security/reference/whats-new.html) — the deprecations and removals across 6.x and 7.x, which is the fastest way to check whether advice you learned is still current.

---

### End of Volume 8

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- State that Spring Security is a servlet filter rather than an interceptor, and name three
  behaviours that follow from that and would not follow from an interceptor
- List the default `SecurityFilterChain` filters in order, and say which two filters explain
  most confusing rejections (`SecurityContextHolderFilter` and `ExceptionTranslationFilter`)
- Explain `securityMatcher` and `@Order` for multiple chains, and what happens when a
  catch-all chain is declared first
- Describe the five authentication collaborators, and what `null` versus a thrown
  `AuthenticationException` means in a custom `AuthenticationProvider`
- Explain the `DelegatingPasswordEncoder` hash-migration pattern and why offline re-hashing
  is impossible
- State the exact condition under which disabling CSRF is correct, and why "the service is
  stateless" is not that condition
- Configure audience validation on a `JwtDecoder`, and say what a missing `aud` check
  actually enables
- Distinguish token propagation from client credentials, and say which question each one
  answers
- Explain what `@WithMockUser` does not prove, and how to test a `SecurityFilterChain`
  through requests rather than through its shape
- Name the three incident-response capabilities a security team needs, and say which
  architectural choices provide them

### Coming in Volume 9 — Testing & Production Troubleshooting

Volume 8 was the volume where the defaults are usually right and the configuration is where
the incidents are. Volume 9 is the volume about finding out — the test pyramid as it
actually works for Spring, the Boot test annotations and what each one really
auto-configures, Testcontainers so your integration tests are not lying to you, and the
production troubleshooting material: reading a thread dump, a heap dump and a GC log, sizing
the JVM and the connection pool, and the specific failure modes that look like "the
database is slow" and are actually a pool of size five. It is the volume that turns the
mechanism knowledge in Volumes 1 through 8 into something you can use at 3am.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**), and
design trade-off challenges (**D**). The **D** questions are the ones that separate a senior
answer from a staff one: they push on scale, cost, reversibility, and organisational fit
rather than API correctness.

### The Filter Chain

**P1. A service that was stateless has started issuing `Set-Cookie` headers, and the team
cannot find where. What are the first three things you check?**

1. Whether something touches the `HttpSession` — a `@SessionAttributes` controller, a
   `HttpSession` parameter, Spring Session's `SessionRepositoryFilter`, or the `SPRING_SESSION`
   cookie. Any of these creates a session.
2. Whether the chain still has `SessionCreationPolicy.IF_REQUIRED` rather than `STATELESS`.
   `STATELESS` is what stops creation; `NullSecurityContextRepository` is what stops the
   context being *written*.
3. Whether the container is in URL session-tracking mode, which appends `;jsessionid=` to
   URLs and makes the problem look like a redirect loop.

**P2. Ops reports that a batch job occasionally runs with a different user's identity. What
is the most likely cause?**

`InheritableThreadLocal` as the `SecurityContextHolder` strategy. It copies the context at
thread *creation*, so any thread pool created while a request was in flight inherits that
request's `Authentication` permanently, and then serves a different user on the next task.
It reproduces only under concurrency, which is why it survives staging. The fix is to remove
the strategy and wrap the executor in `DelegatingSecurityContextAsyncTaskExecutor` so the
context is captured per *task submission* rather than per thread creation.

**T1. A request passes through `SecurityContextHolderFilter` with an empty context, and later
in the chain `Authentication authentication = SecurityContextHolder.getContext()
.getAuthentication();` returns a non-null object with `isAnonymous() == true`. What set
that?**

`AnonymousAuthenticationFilter`, which is in the default chain between
`SecurityContextHolderAwareRequestFilter` and `SessionManagementFilter`. It exists so the
context is never `null`, which means code that tests `authentication == null` never fires
and every downstream consumer must handle an anonymous principal explicitly.

**T2. What does the `springSecurityFilterChain` bean actually register in the servlet
container?**

Exactly one filter — a `DelegatingFilterProxy` over the `FilterChainProxy` bean. Everything
configured in a `SecurityFilterChain` becomes entries inside that one filter's ordered list
rather than separate container filters. This is why a custom `FilterRegistrationBean` can sit
either outside or inside the whole security chain depending on its `@Order`, and why
"register my filter with the container" and "add my filter to the security chain" are not
the same operation.

**T3. An exception thrown inside a `OncePerRequestFilter` you wrote. What happens to the
`SecurityContext` if you did not use a `finally` block?**

It is not cleared. The exception propagates out of `doFilter`, the container moves on to the
next request, and the same pooled thread can serve that next request with your filter's
`SecurityContextHolder` still populated — so an unauthenticated request executes as the
previous request's principal. This is the thread-local leak and it is invisible in a
single-threaded test.

### Authentication

**P4. A login endpoint's 401 rate tripled overnight. Auth logs show valid usernames with
`BadCredentialsException`. What do you check first?**

Whether the lockout is per-instance. If your failed-attempt counter is an in-memory map, a
per-instance limit is multiplied by the instance count the moment you scale out, and the
multiplied threshold may be indistinguishable from a real credential-stuffing attack. Then
check whether a recent change increased the cost of `PasswordEncoder.matches` — upgrading
BCrypt strength from 10 to 12 quadruples comparison time, which cuts the login path's
throughput to a quarter and makes legitimate traffic look like an attack.

**T6. A custom `AuthenticationProvider` returns `null` when the password is wrong. What
happens?**

`ProviderManager` treats `null` as "I do not support this token type" and tries the next
provider. If none handle it and there is no parent, it throws `ProviderNotFoundException` —
not a 401. The correct behaviour is to throw `BadCredentialsException`, which propagates
immediately and skips the remaining providers. This conflation is the single most common bug
in a custom provider, and it produces an error that looks like a misconfiguration rather than
a failed login.

**T7. An account is marked `enabled = false` in the database, but a user with valid
credentials can still log in. What is the most likely cause?**

The `UserDetailsService` query is not selecting the `enabled` column, or a custom
`UserDetails` implementation returns `true` from `isEnabled()` unconditionally. The
`DaoAuthenticationProvider` check is real and it runs before the password comparison — but it
reads whatever the `UserDetails` reports, and the default `User.UserBuilder` sets all four
account-state flags to `true`. A stub implementation therefore makes the disabled and locked
branches unreachable code.

**S7. A PR adds `User.withUsername("admin").password("{noop}admin").roles("ADMIN")` to a
non-test `@Configuration`. What should the reviewer do?**

Reject it. `{noop}` means plaintext comparison, and the class is in the main source set so the
credential is in version control. The correct form is
`.password(passwordEncoder.encode("admin"))` with a `DelegatingPasswordEncoder` bean, and
the deeper issue is that this credential will exist at all — an in-memory user in a
non-test profile is the shape to push on, not the specific encoder.

### Authorization

**P6. A security review finds that `/admin/reports` is publicly accessible in staging. The
configuration reads correctly. What is the likely cause?**

Matcher order. `authorizeHttpRequests` evaluates in declaration order and the first match
wins, so a single `anyRequest().permitAll()` placed above the `/admin/**` rule makes that
rule unreachable — and the rule is still registered, still visible in the config, and
correct. Nothing warns. The only reliable control is a test that asserts an anonymous
request to `/admin/reports` is rejected, because that is the one artifact that fails when
someone reorders the list.

**P7. A service called by three other services, one of which was added last year by a
different team, can read any customer's billing history. Where should the fix go?**

In the service, not the callers and not the gateway. The service must authorize on its own,
because its callers are not a stable set — the gateway will be replaced, a cron job will be
added that bypasses it, and a future migration will call it directly. That is the
zero-trust argument: authorization belongs where the data is, and the check must hold
regardless of who called. Practically, it means a method-level check on the public entry
points plus, ideally, an ownership predicate in the query itself so the unauthorized row
never enters the method.

**T8. A method has `@PreAuthorize("hasRole('ADMIN')")` and `@PreAuthorize("hasRole('AUDITOR')")`.
A user with only `ADMIN` gets 403. Why?**

Multiple `@PreAuthorize` annotations on one method are AND-ed, not OR-ed — each registers its
own interceptor and all must pass. The alternatives are `hasAnyRole('ADMIN','AUDITOR')` or
`hasRole('ADMIN') or hasRole('AUDITOR')`. The failure is especially confusing because the
resulting `AccessDeniedException` is indistinguishable from the user having neither role.

**T9. A `@PreAuthorize` on `validateLimit(Transfer)` does not run when `transfer(Transfer)`
is called from inside the same class. Why, and what is the fix?**

Method security is proxy-based, and a self-invocation goes directly to the target object,
bypassing the proxy entirely. The fix is to put the annotation on the **public entry-point**
method — `transfer` — so that the set of protected methods and the set of publicly reachable
methods are the same set. That is the structural fix; "remember not to self-invoke" is a
discipline fix, and disciplines do not survive a refactor. See Volume 3 Chapter 7 for the
same trap in `@Transactional`.

**S8. A PR adds `@EnableMethodSecurity` above a class already using `@PreAuthorize`. The
reviewer notes nothing is enforced in staging. What happened?**

`@EnableMethodSecurity` defaults `prePostEnabled`, `securedEnabled` and `jsr250Enabled` all
to `false`, whereas the annotation it replaced — `@EnableGlobalMethodSecurity`, deprecated
in 5.6 and removed in 6.0 — defaulted `prePostEnabled` to `true`. So the upgrade compiles,
starts, and enforces nothing, with no warning and no failing test. The correct form is
`@EnableMethodSecurity(prePostEnabled = true)`.

### JWT

**P8. A security incident: a user's credentials were phished and the account was
immediately disabled, but their active token kept working for eleven hours. What is the
design flaw and the immediate fix?**

No revocation path, combined with an access-token lifetime chosen for throughput rather than
for revocation. The immediate fix is to drop the access token to ~15 minutes and add a `jti`
denylist with a TTL equal to that lifetime. The structural fix is to treat token lifetime as
a revocation budget — the maximum acceptable window between compromise and containment — and
to write it down, because a 12-hour token is a stated policy decision that nobody made
explicitly.

**P9. After a key rotation, roughly 30% of requests are returning 401. Tokens that were
valid an hour ago are not. What is the likely cause?**

Either the rotation overlap is shorter than the access-token lifetime, so tokens signed with
the retired key are still in flight and no longer verifiable; or the new key was published
but the decoder's JWK set cache has not refreshed, so `kid` resolution still fails. The
overlap must exceed the longest access-token lifetime, and with a 15-minute token a
24-hour overlap is a sane minimum. The diagnostic is to log the `kid` of a rejected token and
check whether that key is still in the published set.

**T10. A JWT with `{"alg":"none"}` and an empty signature is presented to a service. What
happens, and why?**

It depends entirely on the `JwtDecoder`, which is the point. A decoder configured with a
fixed algorithm never consults the header, so the request is rejected. A decoder that
dispatches on the token's `alg` — or a hand-written verifier — accepts it, because there is
nothing to verify. The same class of bug, RS256→HS256 algorithm confusion, works by signing
with the server's *public* key as an HMAC secret. Configuring a fixed algorithm on the
decoder is the single mitigation for both.

**T11. A token signed by a trusted issuer, unexpired, correct `sub`, and the correct
`scope`, is rejected with 403. What is the first thing you log?**

The `Authentication`'s authorities at the point of rejection — not the token, which puts a
live credential in the log. The answer is almost always in there: a `scope` claim that
became `SCOPE_orders.read` while the rule asks for `ROLE_orders.read`, a `scp` claim when
the converter reads `scope`, or a space-delimited string where a list was expected. If the
authorities are correct, the next question is which layer rejected it — a URL rule that
matched before the method rule.

**S9. A PR changes the JWT access-token lifetime from 12 hours to 15 minutes. What should
the reviewer check beyond the config value?**

That a refresh path exists and is tested, because every user now needs it within 15 minutes
and a missing or broken refresh endpoint logs out the entire user base at deploy time.
Then: clock synchronisation, because a 48× tighter window makes clock drift a correctness
problem rather than a hygiene one; the login endpoint's rate limiter, because 10× more
authentication traffic will hit a path that deliberately burns 100ms of CPU per comparison;
and whether there is any long-running client (a mobile app offline for hours, a nightly
batch job) whose behaviour changes.

### OAuth2 & OIDC

**P10. A service-to-service call works in staging and fails in production with 401. Staging
uses a shared IdP; production has two tenants. What is the likely cause?**

Missing or wrong `iss` validation, or a missing `aud` check, in a multi-tenant setup. In
production the second tenant's tokens are signed by the same IdP keys, so they pass signature
verification; only an explicit `iss` (or `aud`) check rejects them. This is why
`JwtValidators.createDefaultWithIssuer` exists and why audience validation is application
code — the library cannot know which audiences are yours.

**T12. A service is configured as `oauth2ResourceServer().jwt()` and its `SecurityContext`
shows a principal that is a service name, and the endpoint it calls needs to know which end
user is making the request. What is wrong?**

The service is using client credentials, where the `sub` *is* the service and there is no
user in the token. Either the flow should be authorization code so a user's token is
present, or — for a machine-to-machine call that genuinely needs to act on behalf of a user
— the user identity must be passed as validated *data* and the service must not pretend the
token identifies a person. Mixing these is the most common OAuth2 modelling error.

**S10. A PR adds `client_credentials` support to a service that currently brokers
user-facing requests. What should the reviewer ask?**

Who the principal is on the requests this new flow will serve. Client credentials means the
calling service is the principal and `sub` is not a person, so any audit log, any data
ownership, and any user-facing notification built on `sub` will silently start recording or
addressing a service name. If the intent was to preserve the user's identity downstream, the
right mechanism is token propagation or token exchange, and it should be said explicitly
which of the two questions the change is answering.

### CSRF, CORS & Sessions

**P11. A stateless API added an `HttpOnly` refresh-token cookie so the SPA could not read
it. CSRF is disabled. What is the vulnerability?**

The refresh endpoint now accepts any cross-site request carrying that cookie, because cookies
are ambient — the browser attaches them without JavaScript running. The application is
server-stateless but browser-stateful, which is exactly the condition CSRF defends against.
The fix is to remove `csrf.disable()` from that chain and use
`CookieCsrfTokenRepository` with `XorCsrfTokenRequestAttributeHandler`, taking the refresh
token from the cookie *and* requiring the `X-XSRF-TOKEN` header. The generalisable control
is a build rule that fails when `csrf.disable()` and a cookie-based session or token
repository appear in the same chain.

**P12. Users report being logged out and, on a shared machine, sometimes seeing another
person's account. Logs show no errors. What is the likely cause and the fix?**

URL-based session tracking. The container appended `;jsessionid=` to URLs, which lands in
browser history, bookmarks, and the `Referer` header of every outbound request on the page —
including to third parties. Anyone holding a session id from that trail has a live session.
The fix is `server.servlet.session.tracking-modes: cookie` plus `httpOnly`, `secure` and
`sameSite` on the cookie, asserted in a test so it cannot regress.

**T13. A controller has `@PostMapping("/orders/{id}/cancel")` and a link to it in an email.
What is the CSRF-relevant problem, and what is the worse problem?**

CSRF-relevant: it is a `POST`, so `CsrfFilter` will require a token, and a link cannot supply
one — the form has to be rendered. The worse problem is that a state-changing operation
reachable by `GET` at all is unsafe for a different reason: browsers prefetch `GET` links,
security scanners follow them, and intermediaries cache them, so the operation can fire
without anyone choosing to. State changes belong on `POST` and `PUT`; `GET` should be safe.

**T14. A team configured `allowedOrigins("*")` with `allowCredentials(true)` and reports
"the CORS error only happens in Safari". What is happening?**

The combination is invalid per the CORS specification and browsers reject it — but
implementations differ in *when* they reject and in what they report, which is why it appears
browser-specific. The fix is the same as always: an explicit origin allowlist. If genuinely
wildcarded hosts are required, `allowedOriginPatterns` is the mechanism, but it is a
deliberate decision with a documented reason, not a default.

### Testing & Hardening

**P13. The entire controller test suite passes and the security review finds an
unauthenticated write endpoint. What is the most likely reason the suite missed it?**

`@AutoConfigureMockMvc(addFilters = false)`, which removes the filter chain and with it every
authorization rule. A test that posts to the endpoint and expects 201 passes whether the rule
is `authenticated()`, `permitAll()`, or absent. The fix is a second test layer that makes
requests through the real chain and asserts 401 for anonymous and 403 for
insufficient-scope — the assertion has to go *through* the chain, not around it.

**P14. Security asks which users are currently logged in. You cannot answer. What does that
indicate about the design, and what would you have needed?**

That the design has no session registry queryable by the responder, which is a capability
gap rather than a bug. A `SessionRegistryImpl` for in-heap sessions, or
`SpringSessionBackedSessionRegistry` for a Redis-backed store, would answer it. In a stateless
JWT architecture the capability does not exist at all — there is no list because there is no
state — which is the honest argument for including revocation and session enumeration in the
design review rather than discovering them during an incident.

**T15. A `@WithMockUser(authorities = "SCOPE_admin")` test passes. Does that prove the
authorization is right?**

No. `@WithMockUser` sets the authorities to exactly the strings in the annotation; it does
not consult your `UserDetailsService` or your database. If no real principal is ever granted
`SCOPE_admin`, the test is asserting against a rule nothing can satisfy. The stronger test is
`@WithUserDetails`, which builds the principal through the real `UserDetailsService` and
therefore exercises the real authority mapping — and a separate assertion on the mapping
itself if the names are load-bearing.

**S11. A PR turns on `logging.level.org.springframework.security=DEBUG` in the production
profile to diagnose a token issue. What is the risk beyond log volume?**

`Authorization` headers and token claims appear in the logs, and logs are shipped to a
central aggregator with weeks of retention, a much larger reader population, and typically
far weaker access control than the database. A token in that system is a credential with
months of lifetime in a place nobody threat-models as a credential store. The control is a
redaction filter at the appender, not a review convention.

### Design Trade-Offs

**D1. "Disable CSRF for stateless APIs" is the most common Spring Security rule in
practice. Is it right?** `STAFF`

It is right for the narrow case it describes and wrong far more often, because it is phrased
about the *server's* architecture rather than the *browser's* state. The precise condition is
that no browser-held credential can be attached to a cross-site request automatically — no
session cookie, no cached browser Basic auth, no refresh token in a cookie, no ambient HTTP
auth. A pure bearer-token API qualifies, because a cross-origin page cannot set an
`Authorization` header on a form POST. An API that holds a refresh token in an `HttpOnly`
cookie is server-stateless and still CSRF-able, and that configuration is now common because
SPAs need the refresh token somewhere safe. The rule as commonly stated will eventually be
applied to exactly that configuration, so restate it as a property of the credentials rather
than of the deployment, and enforce the restatement mechanically.

**D2. JWT or server-side sessions? Is "JWT for scale" a real argument?** `STAFF`

The scale argument is real but it is narrower than it sounds, and the first question is
whether the session lookup is actually a bottleneck — a Redis `GET` is well under a
millisecond, and it is not where a request's time goes in an application that does database
queries. What you give up for that millisecond is substantial: revocation becomes a
denylist you build, "log out all devices" becomes impossible until you build it, "who is
logged in right now" becomes unanswerable, the access token cannot be shorter than the
revocation window you are willing to accept, and clock skew becomes a correctness problem.
The honest framing is that a JWT converts a solved problem (sessions) into five unsolved ones
(revocation, session enumeration, key rotation, skew tolerance, audience correctness). Pick
it for a third-party API consumer, a mobile client on an unreliable network, or a measured
bottleneck. Decline it for a browser application with a modest user base where revocation
and audit matter more than a `Redis.get`.

**D3. Token propagation or client credentials for a service-to-service call? Which would
you default to org-wide, and what is the cost of that default?** `STAFF`

Client credentials by default, propagation as a deliberate reviewed exception. The reason is
blast radius: with propagation, a compromise of any single service is a compromise of every
user's full permission set at every service that trusts the propagated token, because the
credentials it holds are theirs. With client credentials, a compromised service is confined to
its own scopes, and the calling service is a known principal. The cost of that default is
real — wherever a downstream genuinely needs to act for a user, you must pass identity as
validated data rather than as authority, and doing that wrong is a different vulnerability:
a service that trusts a `userId` in a request body is worse than either option. The pattern
that holds up is: default to service-centric authority, make the user-acting flows explicit
and reviewable, and be honest that the second half is engineering work rather than
configuration.

**D4. Is writing a custom JWT filter ever the right answer, or should every team use
`oauth2ResourceServer().jwt()`?** `STAFF`

Almost never for a new application, and the reason is not code volume — it is that the
resource-server support already has the audience validator, the fixed-algorithm decoder, the
authority mapping, the key-set resolution with `kid` rotation and re-fetch, and the
`SecurityContext` lifecycle handled. A custom filter is a re-implementation of those with
four ways to get each wrong. It is justified when you need something the support does not
model: a token in a non-standard location, a bespoke claim-to-authority mapping, an
additional principal type, or a constraint the library does not express. The staff-level
point is that the cost of the custom filter is not the file — it is that the library's
security fixes and your knowledge of them now diverge, and nobody on the team knows which
paths you are covering. If you write one, own it explicitly and test each of the five failure
modes in Chapter 4 against it.

**D5. A team has 300 `@PreAuthorize` annotations and a new engineer is asked to add an
endpoint. How do you make it likely they do the right thing?** `STAFF`

Move the control from review to mechanism, because 300 annotations is a number that review
will eventually fail to cover. Three layers: deny-by-default at the URL layer so a forgotten
method rule fails closed rather than open; a static check — an ArchUnit rule asserting that
every public method on a service in a protected package is annotated — that fails the build;
and, for row-level rules, a query that includes the ownership predicate so the unauthorized
row never enters the method at all. The strongest version pushes the rule into the data: "can
this principal act on this row?" answered by a query is a control that lives with the data
and cannot be forgotten by someone who has never heard of Spring Security. The
`@PreAuthorize` then becomes a reminder at the enforcement point rather than the only thing
standing between an attacker and a table.

**D6. Your company is moving from one monolith to twenty services. The monolith had role
checks in a handful of places. What is the security architecture you would design, and what
is the migration's hardest part?** `STAFF`

Service-centric authority by default: every service authorizes on its own scopes, every
inter-service call uses client credentials, and the authorization server issues narrowly
scoped tokens with correct `aud` values. The reason is that the monolith's model does not
survive the split — "is this user an admin" was a property of one database, and across
twenty services it becomes a question each service has to answer, which is exactly the
question that gets skipped. The hardest part of the migration is not the tokens, it is the
audience configuration: issuing tokens with the correct `aud` per service means changing how
the authorization server mints tokens, and a service that omits the check will accept a token
intended for a different service and grant itself privileges. The control is a shared library
or a template that includes the audience validator, so omitting it is a visible deviation,
plus a test per service that presents a token minted for another service and asserts 401.

**D7. Is it acceptable to run an authorization server in-house rather than using a hosted
provider, and what is the real cost?** `STAFF`

It is acceptable and sometimes necessary — for a regulated environment where token contents
cannot leave, or where the identity model is the product. The cost is not the server, it is
the four things you now own: client secret storage, signing key rotation with an overlap
longer than the longest token lifetime, refresh token storage and revocation, and the fact
that a compromise of the authorization server compromises every client in the estate
simultaneously. Hosted providers also give you something teams underestimate — the ability
to add a second factor or a new login method without your clients changing, which is a
product capability, not just an infrastructure one. In-house is a defensible choice made
knowing that list; it is not a defensible choice made because a hosted provider looked
expensive in a spreadsheet.

**D8. Security headers ship by default, and a developer proposes a strict CSP. What is the
cost, and how do you introduce one without breaking production?** `STAFF`

A strict CSP breaks things at deploy time, in ways that are usually invisible in testing:
third-party scripts, inline analytics, embedded video, and — the one that catches everyone —
`unsafe-inline` being required by a component library's injected styles. The rollout is
report-only first: send `Content-Security-Policy-Report-Only` with the same policy and
collect violations, which tells you exactly which directives to relax before enforcing
anything. Then enforce incrementally, directive by directive, moving `unsafe-inline` to a
nonce or a hash. The staff-level framing is that CSP is the control that actually prevents
an XSS payload from *executing* — which is the root cause behind the token-theft scenarios
in this volume — and the cost is a one-off inventory of everything on your pages, which is
work worth doing once rather than skipping.

**D9. A login endpoint is a 100ms CPU operation by design. What is the capacity model, and
what is the risk at scale?** `STAFF`

The number that matters is peak concurrent authentication attempts, not average request rate,
because BCrypt's cost is per *attempt* and failed attempts cost the same as successful ones
— that is the design, and it is also the reason a rate limiter is a capacity control and not
only a security control. A service with 200 concurrent login attempts in flight is spending
about 20 CPU-seconds per wall-clock second, so it needs headroom proportional to peak login
rate. Two scaling risks: a per-instance rate limit is multiplied by the instance count the
moment you scale out, so it must be distributed; and a distributed rate limiter adds a
dependency on the exact path an attacker wants to exhaust. Upgrading BCrypt strength
quadruples all of this, which is why the strength change and the rate-limiter review belong
in the same change.

**D10. A stateless API has no way to enumerate live sessions. Is that a security weakness, a
design choice, or an organisational failure?** `STAFF`

All three, in a specific order. Mechanically it is a direct consequence of statelessness and
is not a flaw — there is no state to enumerate. But it is a design choice that removed a
capability the security team will need, and the honest test is whether anyone made that
choice deliberately. Organisationally, it is a failure if the design was evaluated only on
the properties it has (no shared state, scales cleanly) and not on the properties it lacks.
The capability gap is real and so is the alternative: a `jti` denylist, a short access-token
lifetime with server-side refresh tokens, or a `SessionRegistry` if any session remains. What
I would do is write the runbook — "credential compromised, steps 1 to 4" — and check
whether this design can execute it. If it cannot, the design is incomplete regardless of
what it protects against.

**D11. Is "add `@PreAuthorize` everywhere" ever the wrong instinct, or is more coverage
always better?** `STAFF`

More coverage is not always better, and the reason is that a check you cannot reason about
becomes a check people route around. Annotation on a low-value internal helper is noise that
trains reviewers to skim past the annotation on the one that matters. Annotation on a method
whose result is then re-checked upstream is duplicated policy that will drift. The right
target is: one check per public entry point, at the layer where the decision can actually be
made — method level for argument- and result-dependent policy, query level for row ownership,
URL level for the coarse boundary. Coverage of the *enforcement points* matters; the number
of annotations does not, and an annotation density metric is a code smell that will be
optimised in the wrong direction.

**D12. You inherited a system with 12 `SecurityFilterChain` beans. How do you work out what
is actually protecting each path, and what would you do about it?** `STAFF`

Enumerate the paths and the chains and match them: list every chain with its `securityMatcher`
and `@Order`, list every request mapping, and compute which chain claims each — remembering
that evaluation is in `@Order` sequence and the first match wins exclusively, so a
broadly-matching chain declared early shadows everything below it. That table is the answer,
and it is usually not what the team believes. The remediation is to bound the number of
chains deliberately — two is almost always right, human-facing and machine-facing — and to
delete the rest, folding their rules into the correct chain. The cost of consolidation is
regression risk, which is why it needs the test that asserts the classification: an anonymous
browser request to a protected page redirects, an anonymous bearer request gets 401, and a
service token to a service endpoint succeeds. Twelve chains is not a security defect, but it
is a system where "what protects this endpoint" is unanswerable without running the code.

**D13. You can make a service's authentication more secure by adding more checks, or by
making it faster to operate. Which do you prioritise when both are on the table?** `STAFF`

The operational one, because the security control that only works during business hours is
not a control. A rate limiter that lives in memory, a denylist that only the original author
understands, a lockout counter that resets on deploy, a signing key nobody can rotate under
pressure — each of these is a security feature that fails during the one situation it was
built for. The concrete test is the runbook: can a person who did not build the system, at
3am, with a leaked credential, execute the containment steps? If not, the gap is usually not
in the crypto, it is in capability — enumeration, revocation, key rotation, audit. So I would
prioritise building the runbook and the capability it needs, and treat additional hardening as
something to add once the existing controls are operable by someone else.

**D14. Is adding an authorization server worth it when you only have three internal
services?** `STAFF`

No, and the strongest argument is that the capability you would be building is one you do not
need at that size. With three services and one team, the questions the authorization server
answers — where is the client secret, when does this key expire, which service is this token
for — are answerable with three client secrets in a secret manager, two signing keys in a
config file, and `aud` values in each service's own configuration. What you gain by adding
it is token issuance, consent, and key rotation as someone else's problem; what you pay is a
component to deploy, secure, monitor, and keep in sync with your identity model, plus a
dependency at every login. The trigger to reconsider is organisational, not technical:
a second client team, a partner who needs an account, or a requirement for single
sign-on. Until then, three `client_credentials` clients with client secrets in a secret
manager and correct `aud` validation is the smaller, more operable design.

**D15. What would make you reverse a decision to use JWTs for an application you already
shipped?** `STAFF`

Three things, in order of how likely they are to appear. First, an incident or a near-miss
requiring immediate revocation — a leaked token with an eight-hour lifetime and no denylist
is the moment the design stops being defensible, and it is a capability gap rather than a
vulnerability. Second, a compliance or security review asking for session enumeration or
per-session audit, which stateless cannot provide without new infrastructure. Third, a
measurable scale problem that justifies the complexity, which is the case for JWTs and would
be embarrassing to have abandoned without. The reversibility question matters more than any of
them: the hard part is not stopping issuing JWTs, it is the tokens already in the wild with
their remaining lifetimes, and a rotation window has to be planned backwards from the longest
lifetime you ever issued. That is the real cost of choosing a self-contained token, and it is
worth naming before the first one is minted.
