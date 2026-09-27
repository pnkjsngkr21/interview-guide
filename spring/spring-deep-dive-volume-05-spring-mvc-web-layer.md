---
title: "The Spring Complete Deep-Dive"
volume: 5
series: "SPRING MVC & THE WEB LAYER"
subtitle: "Study & Interview Mastery Guide"
---

# The Spring Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

Volume 5 is the web layer — the part of Spring that every backend interview opens with and
that most candidates answer at the level of "the `@RestController` annotation." The real
material is underneath: a servlet container accepting a socket, a filter chain unwinding,
`DispatcherServlet` consulting three pluggable strategies to turn a URL into a Java method
invocation, a chain of argument resolvers deciding what each method parameter means, and a
return-value handler chain deciding how the result becomes bytes on a socket. Almost every
"Spring MVC is mysterious" problem in production lives in one of those four places, and all
four are knowable at the level of mechanism.

This volume treats the web layer the way Volume 1 treated the container: as a set of
specific algorithms with specific costs. There is a chapter on what happens between the
socket and your method, one on how a URL becomes a `HandlerMethod`, one on what each binding
annotation really binds and the specific way it silently fails, and chapters on filters,
interceptors, CORS, exception resolution, validation, and the async model. Where there is a
production trap — a `@ModelAttribute` that turns a JPA entity into a public write API, an
`@ExceptionHandler` that swallows a stack trace, a `server.error.include-stacktrace` that is
`always` in the profile that happens to be the one deployed — the trap gets named explicitly
and given a scenario.

The through-line is that **the web layer is a contract with your clients**, not just a
routing convenience. Status codes, error bodies, content negotiation and validation *are*
the API surface; the annotations are just how you write them. A senior candidate can recite
`@RequestMapping`. A staff candidate can tell you why `POST /orders` returning 200 with an
empty body on a validation failure is a breaking change that takes three client teams and
two sprints to undo.

### Continuing From Volume 4

| Volume | Coverage |
| --- | --- |
| Volume 1 | Spring Core & the IoC Container — architecture, DI, bean definitions, scanning, the context family, events, property resolution |
| Volume 2 | Bean Lifecycle, Scopes & Advanced DI — callbacks, post-processors, scopes, validation, dynamic registration, circular dependencies |
| Volume 3 | AOP & Proxying — the proxy mechanism, aspects, pointcuts, ordering, pitfalls |
| Volume 4 | Transaction Management — the abstraction, `@Transactional`, propagation, isolation, failure modes, distributed transactions |
| Volume 5 (this book) | Spring MVC & the Web Layer — DispatcherServlet, handler resolution, data binding, filters, exception handling, async |
| Volume 6 | Spring Data JPA & Persistence — Hibernate, repositories, fetch strategies, N+1, the persistence context, tuning |
| Volume 7 | Spring Boot & Auto-Configuration — starters, `@Conditional`, config binding, the executable JAR, Actuator |
| Volume 8 | Spring Security — the filter chain, authentication, authorization, JWT, OAuth2/OIDC, hardening |
| Volume 9 | Testing & Production Troubleshooting — the test pyramid, Boot test annotations, Testcontainers, JVM and pool tuning |
| Volume 10 | WebFlux & Project Reactor — the reactive model, operators, backpressure, context propagation |
| Volume 11 | Spring Cloud & Distributed Systems — discovery, gateway, resilience patterns, tracing, Saga, antipatterns |

Volume 4 left you with a proxy that starts, commits and rolls back transactions. Volume 5
puts that proxy behind a URL, and the transaction boundary now depends on a thread, a
dispatch type, and whether the caller came in through a filter. Everything here builds on
the proxy mechanics from Volume 3: an AOP-advised controller becomes a proxy *before*
`RequestMappingHandlerMapping` ever sees it, and that ordering has consequences in
Chapter 2.

### Table of Contents — Volume 5

- Chapter 1 — From Servlet to Spring MVC
- Chapter 2 — HandlerMapping & HandlerAdapter
- Chapter 3 — Controllers & Data Binding
- Chapter 4 — Filters, Interceptors & CORS
- Chapter 5 — Exception Handling
- Chapter 6 — Validation in the Web Layer
- Chapter 7 — Async, Streaming & File Upload
- Chapter 8 — Interview Scenario Bank

---

# Part 5 — Spring MVC & the Web Layer

## Chapter 1 — From Servlet to Spring MVC

### 1.1 The Servlet Contract You Are Actually Building On

Spring MVC does not replace the servlet specification; it is a well-disciplined
implementation of it. An interviewer who asks "explain Spring MVC" and gets a diagram of
`DispatcherServlet` alone has learned half the answer, because the other half is what the
container was doing before Spring was consulted.

```java
public abstract class HttpServlet extends GenericServlet {

    // Called ONCE per servlet instance, at load time. Thread-confined.
    public void init(ServletConfig config) throws ServletException;

    // Called per request, on a container thread.
    protected abstract void doGet(HttpServletRequest req, HttpServletResponse resp);
    protected abstract void doPost(HttpServletRequest req, HttpServletResponse resp);

    // The single entry point every request funnels through.
    public final void service(ServletRequest req, ServletResponse resp) {
        HttpServletRequest  request  = (HttpServletRequest)  req;
        HttpServletResponse response = (HttpServletResponse) resp;

        String method = request.getMethod();
        if ("GET".equals(method))      doGet(request, response);
        else if ("POST".equals(method)) doPost(request, response);
        else if ("PUT".equals(method))  doPut(request, response);
        // ... DELETE, HEAD, OPTIONS, TRACE
        else {
            response.sendError(HttpServletResponse.SC_NOT_IMPLEMENTED);
        }
    }

    // Called ONCE at undeploy, to release resources.
    public void destroy();
}
```

The `ServletConfig` / `ServletContext` split is the part people get wrong under pressure,
and it is a genuine interview question because it is the difference between per-servlet and
per-application state.

| | `ServletConfig` | `ServletContext` |
| --- | --- | --- |
| Scope | One servlet instance | The whole web application |
| Obtained from | `init(ServletConfig)` argument | `config.getServletContext()` |
| Lifetime | Until the servlet is reloaded | Until the whole app is undeployed |
| Read at init time? | Yes | Yes — this is the one big difference from servlets 2.x |
| Typical contents | Servlet name, init params, `DispatcherServlet` mapping | Session, attributes, resources, `RequestDispatcher`, other servlets |
| Thread safety | Not shared | **Shared across all threads — mutate it only with care** |

The distinction that matters operationally: **`ServletContext` is application-wide mutable
state.** Putting a request-scoped object in a `ServletContext` attribute is a data race
waiting to happen, and it is why `RequestContextHolder`, session-scoped beans and
singleton beans all exist.

Then the filter chain, which is where every request physically passes before it reaches
`DispatcherServlet`:

```text
Tomcat receives bytes on a socket
   │
   ▼
┌──────────────────────────────────────────────────────────┐
│ FilterChain                                          │
│   1. CharacterEncodingFilter        (request, response) │
│   2. RequestContextFilter         ◄── binds RequestContextHolder
│   3. FormContentFilter            ◄── PUT/PATCH body → params
│   4. [ your security filter chain ]                     │
│   5. [ your CORS filter ]                               │
│   6. [ your tracing / MDC filter ]                      │
│   ▼                                                     │
│   DispatcherServlet.service()                           │
│   ▼                                                     │
│ Unwind in reverse: 6, 5, 4, 3, 2, 1                     │
│   — and [ your MDC filter clears its ThreadLocal here ] │
└──────────────────────────────────────────────────────────┘
```

Note the unwind. **A filter's code after `chain.doFilter(...)` is cleanup code**, and it is
the only place a filter can reliably run even when the request failed. This matters more
than it sounds: a filter that clears an MDC or a trace ID only *after* the call is correct;
one that clears it at the top leaks the value into whatever the container thread does next.

> **MUST REMEMBER**
>
> `OncePerRequestFilter` (Chapter 4) removes a real hazard that hand-written filters have:
> a container can dispatch the *same* request to the same filter more than once — on an
> `ERROR` dispatch, and again on an `ASYNC` dispatch when the async cycle completes. A
> hand-written filter that increments a counter, or writes a span, double-counts on those
> dispatches. `OncePerRequestFilter` uses a request attribute as a latch and runs once.
> The trap it introduces is that "once per request" is not "once per filter" across
> `ASYNC` re-dispatches, and `shouldNotFilterAsyncDispatch()` is where you opt out of the
> second pass.

### 1.2 The `DispatcherServlet` and Its Three Strategies

`DispatcherServlet` is a `HttpServlet` that does almost nothing itself. It delegates to three
collaborators, each replaceable:

```java
public class DispatcherServlet extends FrameworkServlet {

    // 1. Which handler runs this request?
    private List<HandlerMapping> handlerMappings;

    // 2. How do I invoke that handler, whatever shape it is?
    private List<HandlerAdapter> handlerAdapters;

    // 3. A handler blew up — who turns that into a response?
    private List<HandlerExceptionResolver> exceptionResolvers;
}
```

The three strategies, in the order they are consulted inside `doDispatch`:

| Strategy | Default implementation | Job |
| --- | --- | --- |
| `HandlerMapping` | `RequestMappingHandlerMapping` | URL + method + headers + params → a `HandlerExecutionChain` (handler + interceptors) |
| `HandlerAdapter` | `RequestMappingHandlerAdapter` | Invoke an arbitrary handler shape; resolve arguments and the return value |
| `HandlerExceptionResolver` | `ExceptionHandlerExceptionResolver`, `ResponseStatusExceptionResolver`, `DefaultHandlerExceptionResolver` | Turn an exception into a response |

The architectural point worth stating in an interview: **Spring MVC has no notion of a
controller class.** It has a notion of an `Object` handler plus an adapter that knows how
to call it. That is why a JDK dynamic proxy, an `HttpRequestHandler`, a functional route
and an annotated controller method all work through the identical pipeline — the adapter is
what knows the calling convention. Everything in Chapters 2 and 3 lives inside
`RequestMappingHandlerAdapter`.

### 1.3 The Full Request Lifecycle

This is the diagram to have in your head, because most "why did X happen" questions in
this layer are answered by locating X in it.

```text
 ── CONTAINER ────────────────────────────────────────────────────────────────────►
 │
 │ 1. Acceptor thread reads the socket, HTTP parser builds HttpServletRequest
 │ 2. Connector hands the socket to a worker from the thread pool  (thread-per-request)
 │ 3. Filter chain ENTERS: encoding → RequestContext → form content → security → CORS → MDC
 │
 ▼
 │ 4. DispatcherServlet.service()
 │      └─ FrameworkServlet.processRequest() → doService()
 │           ├─ binds LocaleResolver, ThemeResolver
 │           └─ publishes ServletRequestHandledEvent later
 │ 5. doDispatch(request, response)
 │
 │    ┌─ 6. getHandler(request)                    ── HandlerMapping
 │    │      RequestMappingHandlerMapping looks up
 │    │      RequestMappingInfo (path+method+params+headers+consumes+produces)
 │    │      → HandlerMethod(controllerBean, javaMethod)
 │    │      → HandlerExecutionChain(handler, interceptors…)
 │    │      (no match → 404 unless throwExceptionIfNoHandlerFound)
 │    │
 │    ├─ 7. getAdapter(handler)                     ── HandlerAdapter
 │    │      RequestMappingHandlerAdapter: can this shape be invoked?
 │    │      (falls through to HttpRequestHandlerAdapter → Controller
 │    │       → RouterFunctionAdapter for non-annotated handlers)
 │    │
 │    ├─ 8. interceptor.preHandle()                 ── ORDERED, may VETO
 │    │      a false return stops the chain here (nothing downstream runs)
 │    │
 │    ├─ 9. handle(request, response, handler)      ── the adapter
 │    │    │
 │    │    ├─ 9a. ARGUMENT RESOLUTION               ── HandlerMethodArgumentResolver
 │    │    │       @RequestParam, @PathVariable, @RequestBody, @ModelAttribute,
 │    │    │       HttpServletRequest, Principal, Authentication, Pageable, …
 │    │    │       (each parameter is resolved in declaration order;
 │    │    │        BindingResult / Errors absorbs field errors)
 │    │    │
 │    │    ├─ 9b. HANDLER INVOCATION                 ── Method.invoke
 │    │    │       (or handle() on a CGLIB/JDK proxy — see Chapter 2)
 │    │    │
 │    │    └─ 9c. RETURN VALUE HANDLING              ── HandlerMethodReturnValueHandler
 │    │            @ResponseBody → HttpMessageConverter → Jackson → bytes
 │    │            String        → ViewNameMethodReturnValueHandler → view name
 │    │            Model+view    → ViewResolver → render
 │    │            ResponseEntity → headers + status + body
 │    │            Callable/DeferredResult → startAsync() and RETURN THE THREAD
 │    │            (conversion AFTER the handler returns is not run —
 │    │             @ModelAttribute methods never fire for @ResponseBody)
 │    │
 │    ├─ 10. interceptor.postHandle()                ── ORDERED, reverse
 │    │       runs only on success; NOT called if 9b threw
 │    │       (a @ResponseBody handler has usually already committed the response,
 │    │        so writing here throws IllegalStateException)
 │    │
 │    ├─ 11. interceptor.afterCompletion()           ── ORDERED, reverse
 │    │       ALWAYS runs (success or failure); gets the exception, if any
 │    │
 │    └─ 12. processHandlerException() if 9 threw    ── HandlerExceptionResolver chain
 │            → @ExceptionHandler → @ControllerAdvice → ResponseStatusException
 │              → DefaultHandlerExceptionResolver → container /error dispatch
 │
 │ 13. Filter chain UNWINDS: MDC cleared, CORS headers written, security teardown
 │ 14. Connector flushes the response buffer to the socket; worker thread returns
 ──────────────────────────────────────────────────────────────────────────────────►
```

Four facts in that diagram generate most of the "why" questions:

1. **`postHandle` does not run on failure, `afterCompletion` always does.** Cleanup and
   observation belong in `afterCompletion`.
2. **A `@ResponseBody` handler commits the response inside step 9c**, so anything that
   wants to alter the response — a status code, a header, a wrapping body — must do it
   before the method returns, not after.
3. **Async returns the worker thread at step 9c.** Everything the thread was holding —
   MDC, security context, database connection, transaction — is released, and the container
   re-dispatches the request onto a *different* thread to finish it. Chapter 7.
4. **`@ModelAttribute` methods run in 9a, not after 9b.** A `@ModelAttribute` method never
   runs for a `@ResponseBody` handler, which surprises people who write form-backed
   controllers and then add one REST endpoint to the same class.

> **SCALING REALITY CHECK**
>
> Tomcat's default `maxThreads=200`, `acceptCount=100`, `maxConnections=8192`. With
> ~1MB of thread stack reserved per worker, 200 threads is ~200MB of committed memory
> before the JVM has allocated a single object. The arithmetic that matters: if each request
> spends 50ms in the application, 200 threads is a ceiling of **4,000 requests/second** and
> nothing else raises it. At that point `acceptCount=100` means requests 201–300 sit in the
> TCP accept queue invisible to your application, and 301+ get refused at the socket with
> a connection reset. **The symptom is a latency wall at exactly 200 concurrent requests and
> a sudden error spike with no application-level cause** — the load balancer's health check
> starts timing out because the server is not slow, it is full.

### 1.4 Threading: What `maxThreads`, `acceptCount` and `maxConnections` Actually Do

These three are routinely confused, and the difference is the difference between "queue the
work" and "refuse the connection."

```text
                        maxConnections = 8192
                        (total sockets the Connector will track,
                         kept-alive + in-flight)
                                │
   ┌────────────────────────────┴─────────────────────────────┐
   │  sockets beyond this → connection REFUSED immediately    │
   └──────────────────────────────────────────────────────────┘
                                │
              ┌─────────────────┴──────────────────┐
              │  maxThreads = 200                 │
              │  (busy worker threads)            │
              │                                    │
              │   ┌─ busy ─┬─ busy ─┬─ ... ─┬busy─┤
              │                                    │
              │        idle workers pick these up  │
              └─────────────────┬──────────────────┘
                                │
              ┌─────────────────┴──────────────────┐
              │  acceptCount = 100                 │
              │  (OS accept backlog: connections  │
              │   that arrived with no free thread)│
              └─────────────────┬──────────────────┘
                                │
              ┌─────────────────┴──────────────────┐
              │  beyond backlog → connection        │
              │  REFUSED / timed out by the OS     │
              └────────────────────────────────────┘
```

| Setting | Default | Governs | Failure when exceeded |
| --- | --- | --- | --- |
| `maxThreads` | 200 | Concurrent requests being *executed* | Requests wait in `acceptCount`; latency goes vertical, CPU does not |
| `acceptCount` | 100 | Requests waiting for a free thread | Connection refused / reset — visible to the client as a 502 from the LB |
| `maxConnections` | 8192 | Total tracked sockets (keep-alive included) | Connection refused immediately |
| `maxKeepAliveRequests` | 100 | Keep-alive connections per thread | Connection is closed after N requests (client reconnects) |

`server.tomcat.threads.max`, `server.tomcat.accept-count` and `server.tomcat.max-connections`
in Boot. The two `Connector` protocols matter for connection math:

| | HTTP/1.1 (`protocol="org.apache.coyote.http11.Http11NioProtocol"`) | HTTP/2 (`Http2Protocol`) |
| --- | --- | --- |
| Streams per connection | 1 | Many (multiplexed) |
| Head-of-line blocking | Yes, per connection | No, per stream |
| Concurrent streams in Tomcat | == `maxThreads` | == `maxConcurrentStreams` (default 100) |
| Browser connections per origin | 6 (HTTP/1.1) | 1 (HTTP/2 coalescing) |
| Practical implication | 6× the sockets for the same load | `maxThreads` caps streams, not connections |

> **PRODUCTION RELEVANCE**
>
> Raising `maxThreads` is the reflex fix for a latency wall and it is usually wrong. Each
> additional thread is a megabyte of stack *and* a thread that can independently grab a
> database connection from the pool. If the real bottleneck is a 20ms query and the pool is
> 50 connections, going from 200 to 800 threads does nothing except queue 800 threads on 50
> connections — you have converted a queue in Tomcat into a queue in HikariCP, where it is
> invisible in your thread dump. The right order is: find the blocking resource, size the
> *pool* to the database's capacity, then size threads to the pool plus a margin, and only
> then consider the async model from Chapter 7.
>
> HTTP/2 changes the arithmetic in a way that surprises teams: with multiplexing, one slow
> request no longer blocks others on the same connection, so a `maxThreads` limit now shows
> up as stream-level queuing inside the connector rather than as refused connections.

### 1.5 The `WebApplicationContext` Hierarchy

`DispatcherServlet` owns its **own** `ApplicationContext`, separate from the one that owns
your `@RestController` beans. This surprises people, and it is a real structural fact with a
real consequence: the child context can see the parent's beans, but the parent cannot see
the child's.

```text
ApplicationContext  (the "root", usually created by SpringApplication)
  └─ @RestController, @Service, @Repository, @Configuration, Filter beans, listeners
        │
        │  parent visibility: CHILD sees PARENT ✔
        │  parent visibility: PARENT does NOT see CHILD ✘
        ▼
WebApplicationContext  (per DispatcherServlet — "the servlet context")
  └─ HandlerMapping, HandlerAdapter, HandlerExceptionResolver, ViewResolver,
     MultipartResolver, ConversionService, message converters, @ControllerAdvice
```

The rules:

- **Beans in the root context are visible to the servlet context.** This is how your
  controllers get their services injected.
- **Beans in the servlet context are invisible to the root context.** A `Filter` registered
  in the root context cannot inject a `@ControllerAdvice`.
- `@ControllerAdvice` beans are found by the *servlet* context, so advice registered in the
  root context is still found — because advice is looked up in the same context that
  resolves the handler. A `@Controller` registered only in the servlet context is not
  found by anything in the root.
- Boot collapses this in practice: with `SpringApplication`, there is usually one
  `ServletWebServerApplicationContext` and `DispatcherServlet` shares it unless
  `DispatcherServlet.setContextClass(AnnotationConfigWebApplicationContext.class)` is done
  manually. Old XML configurations created the separate child, which is why so much
  "why can't I inject X" answers online involve two contexts.

> **INTERVIEW TRAP**
>
> "The `ApplicationContext` is a singleton" is the standard answer and it is incomplete in
> a way that matters here. The *root* context is a singleton. The `DispatcherServlet` creates
> a **second** context — `WebApplicationContext` — that is also a singleton, and the
> controller you think is in "the" context may not be. If you have ever wired something
> into `web.xml` or an old `AbstractAnnotationConfigDispatcherServletInitializer` and found
> that your `@Service` beans were not injectable, this is why. A senior answer says
> "singleton scope, yes, but there can be more than one context, and parent/child
> visibility is one-directional."

#### Common Mistakes

- Believing the filter chain and the interceptor chain are the same thing. Filters run on
  **every** dispatch including static resources and `/error`; interceptors run only for
  matched handlers, and only for `HandlerExecutionChain` matches.
- Assuming `@Transactional` and `@Async` work the same in the web layer. Both depend on a
  proxy, both break on self-invocation, and *both additionally* depend on the request
  thread surviving the call.
- Expecting `postHandle` to run after an exception. It does not — cleanup and metrics
  belong in `afterCompletion`.
- Treating a 200-thread pool as a scalability knob. It is a ceiling; raising it without
  sizing the downstream pools just relocates the queue.
- Expecting the root `ApplicationContext` to see beans registered in the
  `WebApplicationContext`. Visibility is one-directional.
- Assuming HTTP/2 with `maxThreads` behaves like HTTP/1.1. Multiplexing changes what the
  limit *means*.

#### Interview Questions — The Servlet Foundation

**Q1. Walk me through what happens from a TCP connection to your controller method.** `STAFF`

Tomcat's acceptor thread reads the socket, the HTTP connector parses it into an
`HttpServletRequest`, and a worker thread is assigned from the pool. That worker runs the
filter chain in registration order — encoding, `RequestContextFilter`, form content,
security, CORS, anything else registered. It then enters `DispatcherServlet.service` →
`doService` → `doDispatch`, which asks the `HandlerMapping` for a `HandlerExecutionChain`,
picks a `HandlerAdapter` for the handler shape, runs interceptor `preHandle`, resolves
method arguments through the argument resolver chain, invokes the method, hands the return
value to a return-value handler, then runs `postHandle` and `afterCompletion`. The filter
chain unwinds in reverse and the response buffer is flushed to the socket.

**Q2. What's the difference between `ServletConfig` and `ServletContext`, and why does it
matter operationally?** `TRICKY`

`ServletConfig` is per-servlet-instance configuration, available in `init()`; `ServletContext`
is per-application and shared by every request thread. The operational consequence is that
`ServletContext` attributes are shared mutable state — anything stored there is a data race
unless it is immutable or `ThreadLocal`-backed, which is exactly why request-scoped state
goes in `RequestContextHolder` or a request-scoped bean instead.

**Q3. Explain `maxThreads`, `acceptCount` and `maxConnections` and what happens when each is
exceeded.** `TRICKY`

`maxThreads` (200) is the number of requests executing concurrently; beyond it, requests
wait, and you see a latency wall with flat CPU. `acceptCount` (100) is the OS-level accept
backlog for requests waiting for a free thread; beyond it the connection is refused, which
the client sees as a reset or a 502 from the load balancer. `maxConnections` (8192) is the
total tracked sockets including keep-alive; beyond it connections are refused immediately.
The classic symptom of a `maxThreads` wall is p99 latency exploding at exactly 200
concurrent requests with no application-level cause.

**Q4. Why does raising `maxThreads` sometimes make a system slower rather than faster?**
`SCENARIO`

Because the real bottleneck is usually a downstream resource — a database pool, a remote
service — and more threads simply means more concurrent waiters on that resource. Each new
thread also costs ~1MB of stack and can independently acquire a connection, so a 800-thread
pool against a 50-connection database adds contention and context switching without adding
throughput. Diagnose by finding the blocking resource and sizing the pool to its capacity;
only then size threads above it.

**Q5. A controller annotated `@Transactional` doesn't get a transaction when called from a
different service. Why?** `TRICKY`

Two candidate causes, and both are real. First, self-invocation: the call never crosses the
proxy boundary, so no transaction is started — this is the Volume 3 proxy rule. Second, and
the one specific to the web layer: if the outer call was made from an `@Async` method, the
new thread has no transaction context and `RequestContextHolder`, MDC and the security
context are all gone. Both are the same root cause — transaction state is thread-bound.

**Q6. What is the parent/child relationship between the root context and the
`WebApplicationContext`?** `TRICKY`

`DispatcherServlet` creates its own `WebApplicationContext` whose parent is the root
context. Child beans can inject parent beans, but the parent cannot see child beans — which
is why a `Filter` in the root context cannot inject a `@ControllerAdvice` defined in the
servlet context. Boot usually collapses them into one context, and the distinction only
becomes visible when someone configures the servlet programmatically or via XML.

> **CHAPTER 1 SUMMARY**
>
> Spring MVC implements the servlet specification rather than replacing it, and the
> container is doing real work — socket accept, thread assignment, the filter chain — before
> Spring is consulted. `DispatcherServlet` itself is thin: three pluggable strategies
> (mapping, adapter, exception resolution) over a handler the framework has no particular
> shape for. The lifecycle diagram is the map for almost every "why did this happen"
> question in this layer, and four facts from it carry the most weight: `postHandle` skips
> failures while `afterCompletion` never does, `@ResponseBody` commits the response inside
> the handler invocation, async returns the request thread early, and `@ModelAttribute`
> methods never run for a `@ResponseBody` handler. Threading is a ceiling, not a knob —
> 200 threads × 50ms is 4,000 req/s and no configuration change beats that arithmetic
> without changing where the time goes.

#### Further Reading

- [Spring Framework Reference — Spring MVC](https://docs.spring.io/spring-framework/reference/web/webmvc.html) — the section index for everything in this volume; the fastest way to find the right sub-page.
- [Spring Framework Reference — DispatcherServlet](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet.html) — the servlet itself, its strategy collaborators, and how to configure them.
- [Spring Framework Reference — Request Processing Lifecycle](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/sequence.html) — the framework's own version of the lifecycle diagram, including the events published at each stage.
- [Spring Framework Reference — ApplicationContext Hierarchy](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/context-hierarchy.html) — the root/servlet context split and what each is for.
- [Apache Tomcat Configuration — HTTP Connector](https://tomcat.apache.org/tomcat-10.1-doc/config/http.html) — the authoritative source for `maxThreads`, `acceptCount`, `maxConnections` and the executor; the Connector documentation is clearer than any blog on the subject.

## Chapter 2 — HandlerMapping & HandlerAdapter

### 2.1 Building the Registry at Startup

`RequestMappingHandlerMapping` does its work **once**, at context refresh, not per request.
It scans every `@Controller` bean, and for every method carrying `@RequestMapping` (or a
meta-annotation of it) it builds a `RequestMappingInfo` and a `HandlerMethod`, and stores
both in a lookup structure.

```text
STARTUP (once)

  @Controller beans
        │
        ▼
  for each method:
    RequestMappingInfo
      ├─ PatternsRequestCondition     ("/orders/{id}")
      ├─ RequestMethodsCondition      (GET)
      ├─ ParamsRequestCondition       (params = "draft=false")
      ├─ HeadersRequestCondition      (headers = "X-Api-Version=2")
      ├─ ConsumesRequestCondition     (application/json)
      ├─ ProducesRequestCondition     (application/json)
      └─ CustomConditionHolder        (your custom condition)
        +
    HandlerMethod(beanName, beanFactory, bridgedMethod)
        │
        ▼
  registered into an in-memory lookup (a PathPattern-based map in 6.x,
  a RequestMappingInfo→List<Match> map in 5.x)
        │
        ▼
  this map is READ-ONLY from here on  ◄── no scanning happens per request
```

Two details here that people get wrong:

**`HandlerMethod` holds the bridged method.** If your controller method takes an
interface-typed parameter, Spring compiles a "bridged" method on the controller class at
compile time and registers *that*, so that the resolved parameter types match the erased
generic signature. This is why a controller method with a `List<Foo>` parameter works even
though reflection says the parameter is a `List`.

**The `HandlerMethod` holds a bean *name*, not an instance.** It stores the bean name and
the `BeanFactory`, and calls `beanFactory.getBean(beanName)` at invocation time. This is
what makes prototype-scoped controllers work at all.

> **INTERVIEW TRAP — THE AOP PROXY AND `AnnotatedElement`**
>
> If the controller is AOP-advised — `@Transactional`, `@Secured`, `@PreAuthorize`,
> `@Async`, `@Cacheable`, metrics, anything — the bean in the container is a **proxy**, not
> your class. `RequestMappingHandlerMapping` stores a `HandlerMethod` whose
> `getBeanType()` returns the *proxy* class. A JDK dynamic proxy implements only the
> interface, and it does **not** propagate annotations to its methods, so:
>
> ```java
> @RestController
> @Transactional                       // class-level advice → CGLIB proxy normally
> public class OrderController { }
> ```
>
> works, but the same thing with only an **interface** and JDK proxying produces a
> `HandlerMethod` that cannot read `@RequestMapping` off the target method through the
> proxy, and Spring has to unwrap to the target class to find it. The unwrapping is
> `AnnotatedElementUtils.findMergedAnnotation` against the *user class*, resolved through
> `ClassUtils.getUserClass`. The practical consequences: (1) `getUserClass()` matters
> anywhere you introspect a proxied bean; (2) `@Transactional` on a controller class forces
> CGLIB proxying or the annotation is lost; (3) any custom code that reflects over
> `handlerMethod.getBeanType().getMethod(...)` gets the proxy's view, not yours.
> `spring.aop.proxy-target-class=true` (the Boot default) hides most of this by preferring
> CGLIB, which is why it is the default and why the bug is so rare in practice.

### 2.2 The Argument Resolver Chain

For each parameter of the matched method, `RequestMappingHandlerAdapter` walks its
`HandlerMethodArgumentResolver` list **in order** and uses the first whose
`supportsParameter` returns true. Order is declaration order; first match wins. With
Spring Boot's default resolver set, the table is:

| Parameter type / annotation | Resolver | Where the value comes from | Failure if absent |
| --- | --- | --- | --- |
| `@RequestParam` | `RequestParamMethodArgumentResolver` | Query string, or form body for non-simple types | `MissingServletRequestParameterException` → 400, **unless** `required=false` or a default |
| `@PathVariable` | `PathVariableMethodArgumentResolver` | URI template variables | `MissingPathVariableException` → 500 (and often a mapping bug, not a client error) |
| `@RequestHeader` | `RequestHeaderMethodArgumentResolver` | Request headers | `MissingRequestHeaderException` → 400, unless `required=false` |
| `@CookieValue` | `CookieValueMethodArgumentResolver` | `Cookie` header | `MissingRequestCookieException` → 400, unless `required=false` |
| `@RequestBody` | `RequestResponseBodyMethodProcessor` | The whole body, deserialised by Jackson | `HttpMessageNotReadableException` → 400 |
| `@RequestPart` | `RequestPartMethodArgumentResolver` | One part of a multipart body | `MissingServletRequestPartException` → 400 |
| `@ModelAttribute` (implicit) | `ModelAttributeMethodProcessor` | Query params + form body bound onto a new instance | Field errors, into `BindingResult` |
| `HttpServletRequest` / `Response` / `Session` | `ServletRequestMethodArgumentResolver` | The container object | n/a |
| `Principal` / `Authentication` | `ServletRequestMethodArgumentResolver` | `request.getUserPrincipal()` | `null`, **not** an error — the #1 auth bug |
| `Pageable` | `PageableHandlerMethodArgumentResolver` | `page`, `size`, `sort` params | Falls back to defaults |
| `@SessionAttribute` | `SessionAttributeMethodArgumentResolver` | The `HttpSession` | `HttpSessionRequiredException` → 400 |
| `@ModelAttribute` method return | `ModelAttributeMethodProcessor(true)` | The value the method returned | n/a |
| `UriComponentsBuilder`, `Principal`, `TimeZone`, `Locale` | various core resolvers | The request | n/a |
| `Callable`, `DeferredResult`, `WebAsyncTask` | `CallableMethodArgumentResolver` etc. | Never a parameter source — a **return**-type story | n/a |
| `@RequestHeader Map<String,String>`, `MultiValueMap` | `RequestHeaderMapMethodArgumentResolver` | All headers | n/a |

> **SCALING REALITY CHECK**
>
> With 400+ handler methods, the *mapping* lookup is a hash/prefix-tree hit — a `PathPattern`
> tree in Spring 6, a `RequestMappingInfo` map in 5.x — and it is genuinely cheap. The cost
> that is NOT amortised is **argument resolution**, which runs per request, per parameter,
> and does a linear `supportsParameter` walk down the resolver list. With ~15 resolvers and
> 6 parameters, that is up to 90 `supportsParameter` calls per request, each doing type
> inspection and annotation lookup. It is normally single-digit microseconds and normally
> invisible — but it is the reason a controller with 20 parameters is measurably slower
> than one with 3, and it is why "one endpoint object with 20 params" anti-patterns cost
> something measurable. If profiling ever shows resolver time, the fix is fewer parameters
> and fewer `Object`-typed ones (a non-simple type with no annotation falls all the way
> through the chain to `@ModelAttribute`).

### 2.3 The Return Value Handler Chain

Same shape, mirrored: `HandlerMethodReturnValueHandlerComposite` tries each handler in
order and the first whose `supportsReturnType` accepts wins.

| Return type | Handler | Result |
| --- | --- | --- |
| `@ResponseBody` (any type) | `RequestResponseBodyMethodProcessor` | `HttpMessageConverter` → Jackson → JSON bytes, `Content-Type` set |
| `ResponseEntity<T>` | same | Status + headers + body; body still through the converter |
| `String` (no `@ResponseBody`, no `@ResponseStatus`) | `ViewNameMethodReturnValueHandler` | The string is treated as a **view name**, not a body |
| `String` (with `@ResponseBody`) | `RequestResponseBodyMethodProcessor` | `StringHttpMessageConverter` → the actual text |
| `Model` / `ModelAndView` / bare custom type | `ModelAndViewMethodReturnValueProcessor` + `ViewResolver` | Server-side view render (Thymeleaf, JSP…) |
| `void` | `RequestResponseBodyMethodProcessor` (async-capable) | No body; status 200 or whatever the response already holds |
| `Callable<V>` | `CallableMethodReturnValueHandler` | Handler returns; the *container thread* is released; a task-executor thread computes the value |
| `DeferredResult<V>` | `DeferredResultMethodReturnValueHandler` | Handler returns; any thread later calls `setResult()` |
| `WebAsyncTask<V>` | `WebAsyncTaskMethodReturnValueHandler` | `Callable` with an explicit timeout + executor |
| `SseEmitter` | `ResponseBodyEmitterReturnValueHandler` | Async, text/event-stream, a thread or an `AsyncContext` loop |
| `StreamingResponseBody` | `StreamingResponseBodyReturnValueHandler` | Writes to the output stream in chunks; the container thread is released |
| `HttpEntity<T>` / `ProblemDetail` | `HttpEntityMethodProcessor` | Status + headers + body, no view |

> **INTERVIEW TRAP**
>
> "A `String` return value is written to the response body" is **wrong** unless the handler
> is `@ResponseBody` (or the controller is `@RestController`). In a plain `@Controller`, a
> returned `String` is a **view name** — `ViewNameMethodReturnValueHandler` puts it in the
> `Model` as `viewName` and `DispatcherServlet` hands it to a `ViewResolver`. This is
> correct, long-standing, required behaviour for server-rendered views, and it is the
> mechanism behind the classic "why did my REST endpoint return the literal text 'ok' as a
> view name and then fail to find a template" bug. The rule: **`@ResponseBody` decides, not
> the type.**

### 2.4 `HandlerAdapter` for Non-Annotated Handlers

The adapter layer is what makes Spring MVC handler-shape-agnostic. Four adapters ship
with the framework:

| Adapter | Handler shape | Where it comes from |
| --- | --- | --- |
| `RequestMappingHandlerAdapter` | An object, a `HandlerMethod`, a proxy, a Kotlin coroutine | `@Controller` / `@RequestMapping` (the 99% case) |
| `HttpRequestHandlerAdapter` | `HttpRequestHandler` — `void handleRequest(req, res)` | Static resources, the default servlet, `SimpleUrlHandlerMapping` |
| `Controller` (the old interface) | `org.springframework.web.servlet.mvc.Controller` — `ModelAndView handleRequest(req, res)` | Pre-annotation Spring; still supported, still in the codebase |
| `RouterFunctionAdapter` | `RouterFunction<ServerResponse>` | Functional endpoints; no annotations at all |

```java
// A functional endpoint — no class, no annotation scanning, no proxy
@Bean
RouterFunction<ServerResponse> routes(OrderService orders) {
    return RouterFunctions.route()
        .GET("/orders/{id}", req -> orders.find(req.pathVariable("id"))
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.notFound().build()))
        .POST("/orders", req -> req.body(PlaceOrder.class)
                .map(orders::place)
                .flatMap(created -> ServerResponse
                        .created(URI.create("/orders/" + created.id())).body(created)))
        .build();
}
```

| | Annotated controllers | Functional routing |
| --- | --- | --- |
| Discovery | Classpath scanning, `@Controller` beans | Bean methods returning `RouterFunction` |
| AOP proxies | Yes — the proxy/`HandlerMethod` subtlety from §2.1 | Rarely — usually no interface to proxy |
| `HandlerInterceptor` support | Yes | **No** — there are no interceptors on a router function |
| `HandlerMethodArgumentResolver` | Yes | No — you use `ServerRequest` |
| Testability | Needs `MockMvc` | Plain method calls, no context |
| Overhead per request | Slightly higher | Slightly lower |
| Readability at 50 routes | Mediocre — long classes | Good — one fluent chain |

> **TRADE-OFF**
>
> Functional routing is genuinely less machinery and is the better answer for a small,
> self-contained, stateless API with few cross-cutting requirements. It is the *worse*
> answer the moment you need `HandlerInterceptor`, `@ControllerAdvice`, argument
> resolution, or a security method annotation on the service — because the interceptor
> chain and the argument resolver chain are exactly what `@RequestMapping` gives you and
> `RouterFunction` does not. The flip condition: if the team already depends on global
> `@ExceptionHandler` advice, functional routing means restructuring your error handling
> per router. Volume 10 covers the reactive variants.

### 2.5 The Lookup Is a Map — and That Is Not the Bottleneck

Worth stating precisely, because people conflate "Spring MVC is slow" with mapping:

| Operation | When it runs | Cost |
| --- | --- | --- |
| Classpath scan for `@Controller` | Once, at startup | Proportional to the scanned classpath |
| `RequestMappingInfo` construction | Once, at startup | Per annotated method |
| **Handler lookup** | **Per request** | **`PathPattern` tree walk / map hit — sub-microsecond, O(1)-ish** |
| Condition evaluation (params, headers, consumes, produces) | Per request | String matching, allocation of `RequestCondition` pairs |
| **Argument resolution** | **Per request, per parameter** | **Linear resolver walk — this is the measurable one** |
| Return value handling + Jackson | Per request | Proportional to payload; usually the largest chunk |

> **PRODUCTION RELEVANCE**
>
> When an endpoint is slow, the mapping is essentially never the cause, and a senior
> candidate should say so and redirect the conversation. The two things that *are* worth
> looking at are argument resolution (many parameters, many `@ModelAttribute` bindings) and
> the work inside the handler. The third, which is more often the real one, is that
> argument resolution forced a *database call* — a `@ModelAttribute` method that queries,
> or a `@PreAuthorize` on the controller bean that loads permissions, is per-request work
> that reads like plumbing. Volume 9 covers how to establish this with a profile.

#### Common Mistakes

- Assuming a controller bean is the class you wrote. If anything AOP-advises it, the bean
  is a proxy, and `getBeanType()` is the proxy class.
- Believing `@RequestMapping` scanning happens per request. It happens once at refresh, and
  the map is read-only afterwards.
- Expecting a missing `Principal` or `Authentication` parameter to fail. It injects
  `null`, and the failure appears as an anonymous user several layers down.
- Expecting `preHandle` returning `false` to still invoke `afterCompletion`. It does not —
  the chain is unwound, not completed.
- Writing a functional router and then wondering why a `HandlerInterceptor` or a
  `@ControllerAdvice` never fires.
- Attributing endpoint latency to handler mapping. It is argument resolution, or the
  handler, or a database call hiding in an annotation.

#### Interview Questions — Handler Resolution

**Q1. When does `RequestMappingHandlerMapping` do its work, and what does it build?**
`TRICKY`

Once, at context refresh. It scans `@Controller` beans, and for every method annotated
`@RequestMapping` (directly or via a meta-annotation) builds a `RequestMappingInfo` — a
combination of pattern, method, params, headers, consumes, produces and custom conditions
— plus a `HandlerMethod` holding the *bridged* method and the bean name, and registers
both in a read-only lookup. Nothing is scanned per request.

**Q2. A controller is annotated with `@Transactional` at the class level. What changes for
`HandlerMapping`?** `ADVANCED`

The bean in the container is a proxy, so `HandlerMethod.getBeanType()` returns the proxy
class. A JDK dynamic proxy implements only the interface and does not carry method
annotations, so Spring unwraps to the user class with `ClassUtils.getUserClass` and reads
the annotations from there. This is why class-level `@Transactional` on a controller
effectively forces CGLIB proxying, and why custom code reflecting over
`getBeanType().getMethod(...)` sees the proxy's view rather than yours.

**Q3. Is handler lookup or argument resolution the per-request cost?** `STAFF`

Lookup is a `PathPattern` tree walk (Spring 6) or a `RequestMappingInfo` map hit (5.x) and
is sub-microsecond. Argument resolution is per parameter, walking the resolver list until
one `supportsParameter` accepts, doing type inspection and annotation lookup each time —
with 15 resolvers and 6 parameters that's up to 90 checks per request. It's normally
invisible, but it's why a 20-parameter endpoint is measurably slower than a 3-parameter one,
and it's the reason a `Object`-typed unannotated parameter (which falls through the whole
chain into `@ModelAttribute`) is a real hot-path cost.

**Q4. A method returns a `String` and the response body is the literal text the client
sent back. Why?** `TRICKY`

The handler is almost certainly not `@ResponseBody`, so `ViewNameMethodReturnValueHandler`
took it — a `String` return from a plain `@Controller` is a **view name**, put in the model
and handed to a `ViewResolver`, which then fails to find a template or renders something
unexpected. `@ResponseBody` (or `@RestController`) is what makes it a body.

**Q5. What's the difference between a `HandlerInterceptor` and a `Filter`, mechanically?**
`TRICKY`

A filter is a servlet-spec component that sees every dispatch, including static resources,
the `/error` dispatch and the async re-dispatch, and it wraps the entire
`DispatcherServlet` including handler resolution. An interceptor is a Spring MVC component
that only runs for a matched `HandlerExecutionChain`, after the handler has been chosen, and
it has three distinct callbacks. A filter cannot know which controller will run; an
interceptor cannot see a request that matched no handler.

**Q6. When would you choose functional routing over annotated controllers?** `STAFF`

For a small, stateless, self-contained API where the routes are few and the handlers are
simple — it removes classpath scanning, removes the proxy subtlety, and tests without a
context. The deciding factor against it is any dependence on the annotated-controller
machinery: `HandlerInterceptor`, `@ControllerAdvice` for error handling, argument resolvers,
or a method-level security annotation on the service. If global exception advice is already
load-bearing in the codebase, functional routing forces you to restructure error handling
per router, which is usually more expensive than the per-request savings.

> **CHAPTER 2 SUMMARY**
>
> Handler resolution is a startup cost with a per-request read: `RequestMappingHandlerMapping`
> builds a `RequestMappingInfo` → `HandlerMethod` registry once at refresh, and every
> lookup afterwards is a tree walk or map hit. The AOP proxy detail is the one that bites
> — an advised controller's `HandlerMethod` holds the proxy, annotations are read off the
> unwrapped user class, and custom reflection gets the wrong answer. Per request, the real
> cost is argument resolution: a linear `supportsParameter` walk per parameter, which is
> normally invisible and becomes visible when a parameter is `Object`-typed or when an
> annotation triggers I/O. The return-value chain is the mirror image, and its most
> important rule is that `@ResponseBody` — not the return type — decides whether a `String`
> is a body or a view name.

#### Further Reading

- [Spring Framework Reference — HandlerMapping and HandlerInterceptor](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/handlermapping-interceptor.html) — the mapping strategies, the interceptor contract, and the ordering rules in one page.
- [Spring Framework Reference — Annotated Controllers](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann.html) — the entry point for everything a controller can declare.
- [Spring Framework Reference — Method Arguments](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/arguments.html) — the full table of which annotation binds which parameter type; the page to memorise rather than the one to skim.
- [Spring Framework Reference — Handler Methods](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods.html) — the handler method model itself, including the return-value and async conventions that most people only pick up from the reference.
- [Spring Framework Reference — Return Values](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/return-types.html) — `ResponseEntity`, `HttpEntity`, `ProblemDetail` and the async return types.

## Chapter 3 — Controllers & Data Binding

### 3.1 The `@RequestMapping` Family

```java
@RestController
@RequestMapping("/api/v2/orders")          // class-level = path prefix + conditions
class OrderController {

    @GetMapping("/{id}")                     // = @RequestMapping(method = GET)
    @RequestMapping(value = "/search", method = RequestMethod.GET,
                    produces = "application/json")
    @RequestMapping(value = "/legacy", method = RequestMethod.GET,
                    params = "draft")        // only if ?draft is present (any value)
    @RequestMapping(value = "/v2only", headers = "X-Api-Version=2")
    @RequestMapping(value = "/export", method = RequestMethod.POST,
                    consumes = "application/json")
    public OrderDto one(@PathVariable Long id) { ... }
}
```

Every `@RequestMapping` attribute is a `RequestCondition`, and at request time **all** of
them must match (they are ANDed). This is worth stating because people think of `params`
and `headers` as an either/or:

```java
@RequestMapping(
    value     = "/orders/{id}",     // pattern
    method    = RequestMethod.PUT,  // HTTP method
    params    = "draft=false",      // query/form param must be present AND equal
    headers   = "X-Tenant=A",       // header must be present AND equal
    consumes  = "application/json", // Content-Type must be compatible
    produces  = "application/json"  // Accept must be compatible
)
```

- `@GetMapping`, `@PostMapping`, `@PutMapping`, `@DeleteMapping`, `@PatchMapping` are
  composed annotations — `@GetMapping("/x")` is exactly
  `@RequestMapping(value="/x", method=GET)`. Interceptors that scan for the literal
  `@RequestMapping` annotation must account for this, and a lot of legacy custom
  framework code does not.
- **Class-level `@RequestMapping` is combined with the method-level one**, and the
  class-level one also applies its conditions to every method. Putting `params` on a class
  is a real technique for version-switching an entire controller.
- `produces` is a *filter*, not a cast. If `Accept` is incompatible you get **406 Not
  Acceptable**, not a different serialisation. If you omit `produces`, the `Accept` header
  is effectively ignored and you may return JSON to a client that asked for XML — which
  then fails in the client, at a distance.
- `consumes` is checked **before** your method runs, against `Content-Type`. A wrong
  `Content-Type` gives **415 Unsupported Media Type**, and it is a good reason to get a 400
  too — because Spring's own message converters may also reject the body.

> **INTERVIEW TRAP — CONDITION ORDERING AND "WHY IS MY MAPPING NOT MATCHING"**
>
> When a request 404s unexpectedly, the debug log line is the answer, and it prints every
> condition and the mapping it tried. The three most common real causes: (1) a trailing
> slash (`/orders/` does not match `/orders` unless `setUseTrailingSlashMatch(true)`);
> (2) a `produces` on the mapping that the client's `Accept` does not satisfy — which
> yields 406, not 404, so if you are seeing 404, it is the path; (3) path variable regexes
> that are greedy — `/{id:[0-9]+}` against `/orders/12/summary` will not match where
> `/{id}` plus a second segment would have.

### 3.2 Path Patterns

```java
@GetMapping("/orders/{id}")                    // one segment, any content
@GetMapping("/orders/{id:[0-9]+}")             // one segment, digits only
@GetMapping("/orders/{id:[0-9]+}/items")       // constrained + suffix
@GetMapping("/files/{*path}")                  // greedy: everything INCLUDING slashes
@GetMapping("/search")                          // exact
@GetMapping("/orders/*")                        // one segment only
```

| Pattern | Matches | Does not match | Use for |
| --- | --- | --- | --- |
| `{id}` | `/orders/12`, `/orders/abc` | `/orders/12/items` | Any single segment |
| `{id:[0-9]+}` | `/orders/12` | `/orders/abc`, `/orders/12/items` | Enforcing shape at the routing layer |
| `*` | `/orders/12` | `/orders/12/items` | Exactly one segment |
| `{*path}` | `/files/a/b/c.txt` | (nothing, it is greedy to the end) | Static-ish file trees, catch-all proxies |

The `{*path}` form only matches at the **end** of a pattern — you cannot have
`/{*path}/edit`. That is a real constraint people hit when trying to build a catch-all
proxy in front of several services.

> **PRODUCTION RELEVANCE**
>
> `{id:[0-9]+}` looks like free input validation and it is not — it is *routing* validation
> that produces a **404** for a malformed id, not a **400**. That is the wrong status for
> a client mistake, it makes the endpoint's error contract inconsistent, and it leaks the
> assumption into the routing layer where it can't be changed without changing the URL
> space. The better split: keep the pattern permissive (`{id}`), parse it, and return 400
> with a proper problem body. A regex in the path is a useful optimisation when the table
> is huge and the majority of traffic is misses — which is not usually the case.

### 3.3 The Binding Annotations, and How Each One Silently Misbehaves

```java
@PostMapping("/orders")
public OrderDto create(
    @RequestParam("idempotencyKey") String key,   // query string (or form body)
    @RequestHeader("X-Tenant")       String tenant,// header, required by default
    @CookieValue("session")          String sess,  // cookie, required by default
    @PathVariable("id")              Long   id,    // from the URI template
    @RequestBody                     CreateOrder body,  // the body, via Jackson
) { ... }

@PostMapping(value = "/orders", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public OrderDto upload(@RequestPart("meta") OrderMeta meta,
                        @RequestPart("file") MultipartFile file) { ... }
```

| Annotation | Binds | Default when missing | The silent failure |
| --- | --- | --- | --- |
| `@RequestParam` | One query/form value → one parameter | `required=true` → 400 | A `String` parameter with no annotation is **not** a `@RequestParam`; an unannotated simple type *is* treated as one, so a typo in the name produces a 400 nobody can explain |
| `@PathVariable` | A URI template variable | **Required** — `MissingPathVariableException` → 500 | The name defaults to the *parameter name*, which requires `-parameters` compilation. Without it, every `@PathVariable` without an explicit name fails to resolve. This is the single most common "works locally, 500s in prod" difference, because IDEs add `-parameters` and hand-rolled builds do not |
| `@RequestHeader` | One header | `required=true` → 400 | Header names are case-insensitive but **`User-Agent` is not `useragent`**; a custom `X-Tenant` must match exactly modulo case |
| `@CookieValue` | One cookie | `required=true` → 400 | Cookie names are case-*sensitive* per RFC 6265; `JSESSIONID` vs `jsessionid` differ |
| `@RequestBody` | The whole body, deserialised by Jackson | `HttpMessageNotReadableException` → 400 | **Consumes the input stream.** You cannot have two `@RequestBody` parameters, and you cannot read the body yourself afterwards — the second read returns empty |
| `@RequestPart` | One part of a multipart body | `MissingServletRequestPartException` → 400 | Requires `consumes = MULTIPART_FORM_DATA`; without it, 415 |
| `@ModelAttribute` | **Every** query param + form field onto a bean | Never fails — silently produces a partly-populated bean | See §3.4 |

> **MUST REMEMBER**
>
> **`-parameters` is on the classpath of a decision you will be asked about.** When you
> declare `@PathVariable Long id` with no explicit name, Spring reads the *parameter name
> from the bytecode*. If the class was compiled without `-parameters`, the name is `arg0`
> and resolution fails. Spring Boot's Maven and Gradle plugins add `-parameters` by default
> since 2.x, so the bug appears in the module you built by hand, the Android build, or the
> legacy ant/`javac` script. The rule: **always name your `@PathVariable` and `@RequestParam`
> explicitly in a public API.** It costs three characters and removes an entire class of
> environment-dependent failure.

### 3.4 The `@ModelAttribute` Trap — A Real Security Finding

This is the most important thing in the chapter, so it gets stated at length.

```java
@Entity
class Account {
    Long id;
    String email;
    String displayName;
    Role role;                       // ← JPA-managed
    boolean internalFlag;
    BigDecimal balance;              // ← computed, has a setter for JPA

    public void setRole(Role role) { this.role = role; }
    public void setBalance(BigDecimal b) { this.balance = b; }
    // setters exist because JPA needs them
}

@PostMapping("/account")
public void update(@ModelAttribute Account account) {
    accountService.save(account);    // ← every writable field is now a public API
}
```

What actually happens, step by step:

1. Spring instantiates `Account` with its **no-arg constructor**.
2. It calls `setEmail(request.getParameter("email"))` — for **every parameter in the
   request**, matched to a writable property by name.
3. **`role` is writable.** `POST /account?role=ADMIN` binds
   `account.setRole(ADMIN)`. If that object is attached to the current `EntityManager`, the
   subsequent `save` is a privilege escalation. It is a Mass Assignment /
   Over-Mass-Assignment vulnerability (CWE-915), and it is in **every** JPA-annotated
   form-backed controller that doesn't guard it.
4. There is **no validation** unless you add `@Valid`, and no allowlist unless you add
   `@InitBinder` `setAllowedFields` or a dedicated form/DTO type.
5. It **fails silently** — an unknown query parameter produces a
   `NotWritablePropertyException` in some containers and is silently ignored in others,
   depending on `ignoreUnknownFields` (the default is `true` in `WebDataBinder`).

```java
// Option 1 — the right one: a dedicated command object with an allowlist by construction
public record UpdateAccountCommand(@NotBlank @Email String email,
                                   @Size(max = 80) String displayName) { }

@PostMapping("/account")
public AccountDto update(@Valid @RequestBody UpdateAccountCommand cmd) { ... }

// Option 2 — if you must keep form binding, allowlist explicitly
@InitBinder
void initBinder(WebDataBinder binder) {
    binder.setAllowedFields("email", "displayName");     // everything else is rejected
}

// Option 3 — bind to the entity but null out everything privileged, immediately
@ModelAttribute
void bind(@ModelAttribute Account a) {
    a.setRole(null);
    a.setBalance(BigDecimal.ZERO);
}
```

| | Entity as `@ModelAttribute` | Command DTO as `@RequestBody` |
| --- | --- | --- |
| Attack surface | Every writable property on the entity | Only the fields on the DTO |
| Field allowlist | Must be configured | Structural — the type *is* the allowlist |
| Validation | Must be added | `@Valid` is the natural pairing |
| Mass-assignment risk | **Yes, and it is a CVE** | No, by construction |
| Ties the HTTP contract to the schema | Yes | No |
| Boilerplate | Less | One more class |
| Works with form-encoded bodies | Yes | No (needs JSON) |

> **PRODUCTION SCENARIO**
>
> Problem: a support ticket from the security team — an ordinary customer escalated
> themselves to `ADMIN` by adding a query parameter.
> Investigation: access logs showed `POST /account?role=ADMIN&email=victim@x.com`; the audit
> trail showed the row updated in the same transaction as the request, with no
> authorization check anywhere in the path.
> Root cause: `@ModelAttribute Account account` on a JPA entity. Spring bound `role` from
> the query string via the entity's JPA-generated setter, and the attached-entity save
> flushed it. There was no allowlist and no validation.
> Solution: introduced `UpdateAccountCommand` as a record with `@Valid @RequestBody`, and
> removed the entity from every controller signature. The entity is now reachable only
> through a service method that sets privileged fields explicitly.
> Prevention: an ArchUnit rule banning any controller method parameter whose type is
> `@Entity`-annotated. It is four lines of code and it makes the finding impossible to
> reintroduce, which a code-review rule does not.

> **STAFF-LEVEL CONSIDERATION**
>
> The org-level fix is to make the DTO the *only* thing a controller can name. Two designs
> achieve it: separate inbound and outbound models (`CreateOrderCommand` in, `OrderDto`
> out) which is the clean version and doubles the mapping code; or one model per direction
> with an explicit mapper layer. Teams that skip this end up with controllers that
> serialise entities directly, which leaks every field — including the ones added six
> months later by a teammate who had no idea it was on the wire. The strongest version of
> the rule is: **nothing annotated `@Entity` appears in a controller signature, ever**,
> and enforce it in the build rather than in review.

### 3.5 Content Negotiation and the Method Override Hack

`produces` and `consumes` are both conditions *and* content negotiation. The negotiation
mechanism is `ContentNegotiationManager` (formerly `ContentNegotiationResolver`), and the
default strategy in Spring 6 is `ContentNegotiationManager` with header-based resolution
first, then path extension, then a registered default:

```java
// Extension-based negotiation was removed as the default in Spring 6.
// If you rely on /orders.json vs /orders.xml, re-enable it explicitly:
@Bean
WebMvcConfigurer configurer() {
    return new WebMvcConfigurer() {
        @Override public void configureContentNegotiation(ContentNegotiationConfigurer c) {
            c.favorParameter(false)
             .ignoreAcceptHeader(false)
             .defaultContentType(MediaType.APPLICATION_JSON);
        }
    };
}
```

```yaml
# Boot switches to parameter-based negotiation when this is set
spring:
  mvc:
    contentnegotiation:
      favor-parameter: true
      parameter-name: format
```

**The HTTP method override hack.** HTML forms only issue `GET` and `POST`, so a long time
ago the convention emerged of tunnelling `PUT`/`DELETE` through a hidden form field:

```html
<form method="post" action="/orders/12">
  <input type="hidden" name="_method" value="DELETE"/>
  <button>Delete</button>
</form>
```

To make that work you need `HiddenHttpMethodFilter` (Spring 5 deprecated it; Spring 6
removed it in favour of the `HttpMethod` resolution in `RequestMappingHandlerMapping`).
The modern form is the **`_method` parameter, the `X-HTTP-Method-Override` header, or the
`HttpMethod` override property on `DispatcherServlet`**:

```yaml
# Boot: enable the _method parameter and/or the header
spring:
  mvc:
    hiddenmethod:
      filter:
        enabled: true
        method-parameter: _method
```

> **PRODUCTION RELEVANCE**
>
> A method-override filter is a **request-smuggling surface**. It means the HTTP verb your
> WAF, your ingress controller and your audit log recorded (`POST`) is not the verb the
> application will execute (`DELETE`). Any security control that authorises on the request
> line is now bypassable, and the audit trail lies. Enable it only for genuinely
> browser-form endpoints, never on a globally-mapped path, and make sure the ingress layer
> knows the same override rules so that both layers agree. Most teams solve this by not
> shipping HTML forms to mutating endpoints at all — a small JS call with a real `DELETE`
> and a JSON body is less code than the override plumbing.

#### Common Mistakes

- Forgetting `-parameters` and relying on implicit `@PathVariable` / `@RequestParam` names.
- Reading the request body yourself *and* declaring `@RequestBody`. The stream is consumed
  once.
- Expecting a regex path variable to produce a 400. It produces a 404.
- Binding a JPA entity with `@ModelAttribute` and calling the whole thing "form binding".
- Adding `produces = "application/json"` and getting a 406 from a client that sends
  `Accept: */*` — it is the *client* that is wrong, and the fix is not to delete `produces`.
- Enabling `_method` override on a globally-mapped path without telling the ingress layer.

#### Interview Questions — Controllers & Binding

**Q1. A controller method works in the IDE but returns 500 in a Docker build with no
message. What's the most likely cause?** `TRICKY`

`@PathVariable` or `@RequestParam` declared without an explicit name, combined with a
compile that omitted `-parameters`. Spring reads the parameter name from bytecode; without
the flag it is `arg0`, resolution fails, and a `MissingPathVariableException` surfaces as
a 500 with a message the logs bury. Fix: always name them explicitly in a public API,
independent of build configuration.

**Q2. Explain what `@ModelAttribute` binds, and what the security implication is.** `STAFF`

It instantiates the target type with its no-arg constructor and then calls a setter for
**every** request parameter whose name matches a writable property — including form fields.
If the target is a JPA entity, that includes every field the entity happens to expose a
setter for, which JPA requires: `role`, `balance`, `tenantId`, `enabled`. With no `@Valid`
and no allowlist, `POST /account?role=ADMIN` is a privilege escalation. The fix is a
dedicated command record bound with `@Valid @RequestBody`, or an explicit
`WebDataBinder.setAllowedFields` allowlist. Enforce "no `@Entity` in a controller
signature" in the build.

**Q3. `produces = "application/json"` and a client gets 406. What happened and who is
wrong?** `TRICKY`

`produces` is a filter, not a cast: it makes the mapping only match when the `Accept`
header is compatible. The client's `Accept` header doesn't admit JSON, so no handler
matched and Spring returned 406 Not Acceptable. The client is technically wrong, but the
realistic diagnosis is that something between them is rewriting or dropping `Accept` — a
proxy, a gateway, or a client library defaulting to `text/plain`. The bug hunt belongs
there, not in the controller.

**Q4. Can a controller method take two `@RequestBody` parameters?** `TRICKY`

No. The body is a single stream and `RequestResponseBodyMethodProcessor` consumes it.
The second parameter throws or receives an empty body depending on the path. If you need
two logical objects, wrap them in one DTO, or use `@RequestPart` with `multipart/form-data`,
which does support several parts.

**Q5. What does a `{id:[0-9]+}` path variable give you, and what doesn't it give you?**
`TRICKY`

It gives you routing-level discrimination: `/orders/abc` matches no handler and returns
404, without invoking your method. It does **not** give you validation, and it does not give
you a 400 — it gives you a 404, which is the wrong status for a client mistake and makes
the error contract inconsistent. Parse the value and return a proper 400 with a
`ProblemDetail` instead, unless the traffic profile genuinely justifies the routing filter.

**Q6. Is the `_method` override filter a security concern?** `SCENARIO`

Yes. It means the verb your WAF, your ingress controller and your audit log observed
(`POST`) is not the verb the application executes (`DELETE`). Anything that authorises on
the request line is bypassable, and the audit trail is wrong. If you enable it, scope it
to the browser-form endpoints that need it and make sure the ingress layer applies the
same override so the two layers agree.

> **CHAPTER 3 SUMMARY**
>
> `@RequestMapping` is a bundle of ANDed conditions, and every attribute — path, method,
> params, headers, consumes, produces — is part of the match, not decoration.
> `@GetMapping` and friends are composed annotations, which catches out any custom
> framework code scanning for the literal `@RequestMapping`. The binding annotations fail
> in a consistent direction: `params`/`headers`/`path` produce 400 or 404, and the ones
> that fail *silently* are `@ModelAttribute` (binds everything, validates nothing) and
> an unannotated simple-typed parameter (treated as a `@RequestParam` with an inferred
> name). The security finding that belongs in every design review is `@ModelAttribute` on
> a JPA entity: it turns every writable field, including JPA-mandated setters for
> privileged attributes, into a public write API with no allowlist and no validation. And
> the two operational details people discover in production are `-parameters` — without it
> implicit `@PathVariable` names don't resolve — and the `_method` override, which is a
> request-smuggling surface between your application and your gateway.

#### Further Reading

- [Spring Framework Reference — `@RequestMapping`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-requestmapping.html) — every condition, how they combine, and how the mapping is matched at request time.
- [Spring Framework Reference — Path Patterns](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/handlermapping-path.html) — `{id}`, regex variables, `*` versus `{*path}`, trailing-slash behaviour and suffix matching.
- [Spring Framework Reference — `@RequestParam`, `@PathVariable` and `@RequestHeader`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/requestparam.html) — the binding rules and the "simple type without annotation" fallback that catches people out.
- [Spring Framework Reference — `@ModelAttribute`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/modelattrib-method-args.html) — what gets bound, the `WebDataBinder` hooks, and the `BindingResult` contract.
- [Spring Framework Reference — Type Conversion](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/typeconversion.html) — how a `String` query parameter becomes an `Instant` or a `BigDecimal`, and where a custom `Converter` goes.

## Chapter 4 — Filters, Interceptors & CORS

### 4.1 `Filter` and `OncePerRequestFilter`

A `Filter` is a servlet-spec interface with three methods, and the third one is the one that
matters:

```java
public interface Filter {

    default void init(FilterConfig filterConfig) throws ServletException { }

    void doFilter(ServletRequest request, ServletResponse response, FilterChain chain)
            throws IOException, ServletException;

    default void destroy() { }
}
```

```java
// The hand-written version — and its two hazards
@Component
public class TraceFilter implements Filter {

    @Override
    public void doFilter(ServletRequest req, ServletResponse resp, FilterChain chain)
            throws IOException, ServletException {

        String traceId = UUID.randomUUID().toString();
        MDC.put("traceId", traceId);
        ((HttpServletResponse) resp).setHeader("X-Trace-Id", traceId);

        try {
            chain.doFilter(req, resp);        // everything downstream
        } finally {
            MDC.remove("traceId");           // ◄── MUST be here
        }
    }
}
```

Two hazards, both of which `OncePerRequestFilter` exists to solve or to give you a place
to solve:

1. **Code after `chain.doFilter` runs only on the way out.** If the request throws, the
   lines after it don't run unless you catch or `finally`. A `MDC.remove()` written after
   the call without a `finally` leaks the trace ID into the next request that thread
   serves, and the symptom is a log line with two trace IDs and no way to tell which is
   which.
2. **The container may dispatch the same request to the same filter more than once.** The
   `ERROR` dispatch and the `ASYNC` dispatch both re-enter the chain. A hand-written filter
   that counts requests, opens a span, or writes a header will do so multiple times.

```java
public abstract class OncePerRequestFilter implements Filter {

    private static final String ALREADY_FILTERED_SUFFIX = ".FILTERED";
    private final Set<String> skipUrls = new HashSet<>();

    // The two hooks people miss
    protected boolean shouldNotFilterAsyncDispatch() { return true; }
    protected boolean shouldNotFilterErrorDispatch() { return true; }

    @Override
    public final void doFilter(req, res, chain) {
        // The latch: a request attribute, not a field
        if (alreadyFiltered(req)) { chain.doFilter(req, res); return; }
        setAlreadyFiltered(req);
        doFilterInternal(req, res, chain);
    }
}
```

| Hook | Default | What it controls |
| --- | --- | --- |
| `shouldNotFilterErrorDispatch()` | `true` | Whether the filter runs on the `/error` dispatch — i.e. whether your `X-Trace-Id` header and MDC are present on the error response |
| `shouldNotFilterAsyncDispatch()` | `true` | Whether the filter runs again when the async cycle completes and the container re-dispatches |
| `shouldNotFilter()` | `false` | Whole-URL opt-out — `addSkipUrls("/actuator/health")` |

> **INTERVIEW TRAP**
>
> The natural mental model — "the filter runs once per request" — is wrong in two specific
> ways that both show up in production. **First**, an `ERROR` dispatch: when your handler
> throws and the error is not handled, the container sends an `ERROR` dispatch through the
> chain again so the error page can be rendered. A filter with
> `shouldNotFilterErrorDispatch()` left at `true` (the default) will *not* re-run — which
> means your error-page rendering has no trace ID. Flip it to `false` and your counters
> double-count. **Second**, async: when a `Callable` or `DeferredResult` completes, the
> container re-dispatches on a container thread, and the default skips your filter — so
> anything you set up before `startAsync` is still there (the request attributes survive)
> but anything you *want to run again* on the second pass does not.

### 4.2 `HandlerInterceptor` — Three Callbacks, Three Different Powers

```java
@Component
class AuthInterceptor implements HandlerInterceptor {

    @Override
    public boolean preHandle(HttpServletRequest req, HttpServletResponse res,
                             Object handler) {

        if (securityContext.isAuthenticated()) return true;   // continue

        res.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
        return false;    // ◄── VETO: the handler NEVER runs
    }

    @Override
    public void postHandle(HttpServletRequest req, HttpServletResponse res,
                           Object handler, ModelAndView mav) {
        // Runs on SUCCESS only. Reverse order of preHandle.
        // For a @ResponseBody handler the response is ALREADY COMMITTED —
        // setStatus() or getWriter() here throws IllegalStateException.
    }

    @Override
    public void afterCompletion(HttpServletRequest req, HttpServletResponse res,
                                Object handler, Exception ex) {
        // ALWAYS runs, success or failure. Reverse order.
        // `ex` is the unhandled exception, or null.
        // This is where metrics, MDC cleanup and transaction-scope teardown belong.
    }
}
```

| Callback | Can veto? | Sees the response? | Runs on failure? | Use for |
| --- | --- | --- | --- | --- |
| `preHandle` | **Yes** — return `false` | Not yet written | Yes (nothing downstream runs) | Auth, tenant resolution, rate limiting, feature flags |
| `postHandle` | No | **Only if not yet committed** | **No** | Rarely — mostly legacy, before `@ResponseBody` was universal |
| `afterCompletion` | No | Yes, and the status | **Yes**, with the exception | Metrics, MDC/trace cleanup, auditing, always-run teardown |

Two rules that follow from the table and from Chapter 1:

- **`postHandle` is nearly dead code in a modern JSON API.** For a `@ResponseBody` handler
  the bytes are written inside the handler invocation, so by `postHandle` the response is
  committed and any attempt to change the status throws. If you need to wrap or alter the
  body, you need a `ResponseBodyAdvice`, not an interceptor.
- **A `preHandle` veto does NOT trigger `afterCompletion`.** The chain is unwound, not
  completed. Code that assumed "vetoed requests still get cleanup" is a resource leak —
  most visibly, a security context or an open span that never gets closed.

```java
// Registration and ordering — this is a WebMvcConfigurer, not a bean annotation
@Configuration
class WebConfig implements WebMvcConfigurer {

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/public/**", "/actuator/**")
                .order(1);                        // lower runs first in preHandle
    }
}
```

Interceptors run in ascending `order` for `preHandle` and **descending** for `postHandle`
and `afterCompletion` — the same nesting discipline as a filter chain. An interceptor
registered without an `order` defaults to `Ordered.LOWEST_PRECEDENCE`, which means it runs
*last* among explicitly ordered interceptors, which is usually not what people expect when
they add a logging interceptor and find it running after the auth one.

### 4.3 Which Layer for Which Concern

This is the table that answers the most common "where should this go" question in the
whole web layer.

| Concern | Filter or interceptor? | Why |
| --- | --- | --- |
| **CORS** | **Filter** (or `CorsFilter`) | Preflight `OPTIONS` requests are rejected by Spring Security's filter chain before they ever reach a handler, so CORS must be a filter — and it must be *above* security in the order |
| **Authentication** | Filter (or Spring Security's own filters) | Must run before handler resolution, and must be able to reject a request that matched no handler |
| **MDC / trace ID** | Filter | Must cover static resources and the `/error` dispatch, and must be cleaned up in a `finally` around the whole chain |
| **Request context** (`RequestContextHolder`) | `RequestContextFilter` (built in) | It *is* the filter that sets and clears it |
| **Metrics** | Filter for the coarse request count; interceptor for handler-level timing | The filter sees every request including 404s and static resources; the interceptor can attribute to a specific handler |
| **Rate limiting** | Filter | Must reject before any work, including before handler resolution |
| **Body caching / re-readable request body** | Filter | Must wrap the stream before the argument resolver reads it |
| **Tenant resolution from the path or header** | Filter, if it must apply to unhandled URLs; interceptor if it is only for controllers | An interceptor only runs for a matched handler |
| **Modifying the response after the handler** | `ResponseBodyAdvice`, **not** an interceptor | The response is already committed for `@ResponseBody` |
| **Modifying the request before the handler** | Filter, or an interceptor `preHandle` | Either works; the filter is the stronger guarantee |

> **PRODUCTION RELEVANCE**
>
> The ordering rule is the practical one and it is not obvious: **CORS must be above
> security in the filter chain.** Spring Security's filter chain rejects unauthenticated
> requests, and an `OPTIONS` preflight request is by definition unauthenticated (the
> browser does not send credentials on a preflight). If security runs first, every
> cross-origin preflight gets a 401, the browser reports it as a CORS failure rather than
> a 401, and the team spends a day debugging the frontend. Register `CorsFilter` with an
> order lower than `SecurityFilterChain`'s, or use `http.cors(withDefaults())` and let
> Spring Security delegate to the same `CorsConfigurationSource` that MVC uses — which is
> the version that doesn't have this bug.

### 4.4 CORS — The Three Configuration Points and the Three Classic Bugs

There are three ways to configure CORS in a Spring application, and they are **not**
equivalent.

```java
// 1. Annotation — narrowest, per handler method or class
@CrossOrigin(origins = "https://app.acme.com", methods = {GET, POST},
             allowedHeaders = "Content-Type", maxAge = 3600)
@GetMapping("/orders")
public List<OrderDto> orders() { ... }

// 2. Global mapping — the usual choice
@Configuration
class WebConfig implements WebMvcConfigurer {
    @Override public void addCorsMappings(CorsRegistry registry) {
        registry.addMapping("/api/**")
                .allowedOrigins("https://app.acme.com")     // NOT "*" with credentials
                .allowedMethods("GET", "POST", "PUT", "DELETE")
                .allowedHeaders("*")
                .exposedHeaders("X-Trace-Id")
                .allowCredentials(true)
                .maxAge(3600);
    }
}

// 3. CorsFilter — a plain servlet filter, works below Spring MVC entirely
@Bean
CorsFilter corsFilter() {
    CorsConfiguration cfg = new CorsConfiguration();
    cfg.addAllowedOrigin("https://app.acme.com");
    cfg.addAllowedMethod("GET");
    UrlBasedCorsConfigurationSource source = new UrlBasedCorsConfigurationSource();
    source.registerCorsConfiguration("/api/**", cfg);
    return new CorsFilter(source);
}
```

**Bug 1 — preflight rejected by security.** Covered above. The `OPTIONS` request must
either be permitted by the security config or handled by a CORS filter registered ahead of
it.

**Bug 2 — `allowCredentials(true)` with `allowedOrigins("*")`.** The CORS specification
forbids this combination, and browsers enforce it: the `Access-Control-Allow-Origin`
response header is **omitted entirely**, so the browser blocks the response and reports a
CORS error. Spring 5.3+ throws `IllegalArgumentException` at startup if you combine
`allowedOrigins("*")` with `allowCredentials(true)` — which turns a silent browser failure
into a startup failure, a genuinely good change. The correct form is
`allowedOriginPatterns("https://*.acme.com")` or an explicit origin list.

**Bug 3 — configured in two places with different results.** A `@CrossOrigin` on a
controller and a global `addCorsMappings` entry for the same path will conflict, and the
resolution is by handler-level versus global precedence with a merge whose exact behaviour
depends on the Spring version. The rule is organisational: **pick one mechanism per
application and enforce it in review.** Mixing them across 40 controllers in a codebase
where three teams have opinions is how "CORS works on `/api/users` but not `/api/orders`"
happens.

> **MUST REMEMBER**
>
> CORS is a **browser-enforced** mechanism, not a server-side access control. The server
> responds to the preflight and to the actual request; the *browser* decides whether to
> hand the response to JavaScript. `curl` does not enforce it, which is why "it works in
> Postman" tells you nothing. And a CORS failure in the browser console always looks like
> a network error with no useful message — so the debugging path is always "look at the
> preflight response with `curl -X OPTIONS -H "Origin: ..." -H "Access-Control-Request-Method: GET"`",
> not "read the JavaScript error".

#### Common Mistakes

- Writing cleanup code after `chain.doFilter()` without a `finally`. The value leaks into
  the next request the thread serves.
- Assuming `preHandle` returning `false` still runs `afterCompletion`. It does not.
- Putting CORS in a `HandlerInterceptor` or a controller method. Preflight requests need to
  be answered before the handler layer.
- Using `allowedOrigins("*")` together with `allowCredentials(true)` — illegal per spec,
  and the browser silently blocks.
- Configuring CORS per-controller in some places and globally in others, then debugging
  why two identical endpoints behave differently.
- Expecting an interceptor to modify a `@ResponseBody` response. It is already committed;
  use `ResponseBodyAdvice`.
- Assuming a `Filter` is only called for controller requests. It is called for static
  resources, `/error`, and async re-dispatches too.

#### Interview Questions — Filters, Interceptors & CORS

**Q1. Filter vs `HandlerInterceptor` — what is the actual difference?** `TRICKY`

A filter is a servlet-spec component that runs on every dispatch, including static
resources, the `ERROR` dispatch and the async re-dispatch, and wraps the entire
`DispatcherServlet` including handler resolution. An interceptor is a Spring MVC component
that only runs for a matched `HandlerExecutionChain`, after the handler has been chosen,
and has three callbacks with different powers. A filter cannot know which controller will
run; an interceptor cannot see a request that matched no handler.

**Q2. Why does `OncePerRequestFilter` exist, and what are its two sharp edges?**
`ADVANCED`

Because a hand-written filter gets dispatched more than once for the same request — the
`ERROR` dispatch and the `ASYNC` dispatch both re-enter the chain, so counters, spans and
headers get written twice. `OncePerRequestFilter` uses a request attribute as a latch. Its
two sharp edges are the hooks people forget: `shouldNotFilterErrorDispatch()` defaults to
`true`, so your error responses are rendered without your trace ID; and
`shouldNotFilterAsyncDispatch()` defaults to `true`, so code that should re-run on the
async completion pass silently does not.

**Q3. What can `preHandle`, `postHandle` and `afterCompletion` each do, and which one
should metrics live in?** `TRICKY`

`preHandle` can veto — returning `false` stops the chain and the handler never runs.
`postHandle` runs only on success, and for a `@ResponseBody` handler the response is
already committed, so it cannot change status or headers. `afterCompletion` always runs and
receives the exception if there was one. Metrics and MDC cleanup belong in
`afterCompletion`; anything that must reject a request belongs in `preHandle`.

**Q4. A `preHandle` returns `false` to reject an unauthenticated request. Does
`afterCompletion` run?** `TRICKY`

No. A veto unwinds the chain — it is not a completion. Only the already-invoked
`preHandle` methods of earlier interceptors get their `afterCompletion` called, and the
vetoing interceptor's own `afterCompletion` does not run. Code that opens a resource or a
span in `preHandle` and closes it in `afterCompletion` leaks it on every rejected request.

**Q5. A cross-origin request fails in the browser but works in Postman. Where do you
start?** `SCENARIO`

At the preflight, not the application. Run
`curl -X OPTIONS -H "Origin: https://app.acme.com" -H "Access-Control-Request-Method: GET"`
against the endpoint and read the response headers. In order of likelihood: the preflight
is being rejected by Spring Security's filter chain before CORS ever runs (security must
come *after* CORS in the filter order); the origin isn't in the allowlist; or
`allowCredentials(true)` is combined with a wildcard origin, which is illegal per spec and
makes the browser drop the response header. Remember that CORS is browser-enforced — curl
tells you nothing on its own.

**Q6. A codebase has `@CrossOrigin` on some controllers and `addCorsMappings` in a
`WebMvcConfigurer`. What should you do?** `STAFF`

Pick one and enforce it. They merge with version-dependent precedence, so the behaviour of
a given endpoint depends on which mechanism touched it, and "works on `/api/users` but not
`/api/orders`" is the predictable result. The practical fix is a global
`CorsConfigurationSource` in one place, plus a lint rule or an ArchUnit test that fails the
build on any `@CrossOrigin`. The third option — a `CorsFilter` registered ahead of the
security filter chain — is worth considering when the ordering requirement is the thing
that keeps biting you, because it makes the ordering explicit.

> **CHAPTER 4 SUMMARY**
>
> Filters and interceptors are different mechanisms, not two flavours of the same one: a
> filter sees every dispatch and can answer a request that matched no handler, an
> interceptor only sees matched handlers and has three callbacks with genuinely different
> powers. `preHandle` can veto — and a veto means `afterCompletion` never runs for the
> vetoing interceptor, which is a leak. `postHandle` is close to dead code in a JSON API
> because the response is already committed. `OncePerRequestFilter` exists because the
> container re-dispatches the same request to the same filter on the `ERROR` and `ASYNC`
> paths, and its two defaults — skip error dispatch, skip async dispatch — each hide a
> different bug. CORS belongs in a filter, ordered *above* security, because a preflight
> `OPTIONS` is unauthenticated by definition and anything that authorises before CORS
> answers will 401 it. And CORS is a browser mechanism that `curl` cannot test, so
> debugging it means reading a preflight response, not reading a JavaScript console.

#### Further Reading

- [Spring Framework Reference — Servlet Filters](https://docs.spring.io/spring-framework/reference/web/webmvc/filters.html) — how filters are registered in Boot, the `FilterRegistrationBean` escape hatch, and filter ordering.
- [Spring Framework Reference — MVC Interceptors](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/interceptors.html) — the three callbacks, the ordering rules, and how to exclude paths.
- [Spring Framework Reference — CORS](https://docs.spring.io/spring-framework/reference/web/webmvc-cors.html) — the single authoritative page for all three configuration mechanisms and the preflight rules.
- [Spring Framework Reference — HandlerMapping and Interceptor](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/handlermapping-interceptor.html) — where the interceptor chain sits relative to handler resolution, which is what makes the "it never runs on a 404" behaviour predictable.

## Chapter 5 — Exception Handling

### 5.1 `@ExceptionHandler` and the Advice Hierarchy

```java
// Controller-local: handles exceptions from THIS controller only
@RestController
class OrderController {

    @ExceptionHandler(OrderNotFoundException.class)
    ProblemDetail notFound(OrderNotFoundException e) {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND,
                "No order with id " + e.getId());
        pd.setTitle("Order not found");
        pd.setProperty("orderId", e.getId());
        return pd;
    }

    @ExceptionHandler({IllegalArgumentException.class, IllegalStateException.class})
    ResponseEntity<String> badRequest(RuntimeException e) { ... }
}

// Global, scoped
@RestControllerAdvice(basePackages = "com.acme.billing")            // by package
@RestControllerAdvice(assignableTypes = {OrderController.class})     // by type
@RestControllerAdvice(annotations = RestController.class)            // by annotation
class BillingExceptionAdvice {

    @ExceptionHandler(OptimisticLockingFailureException.class)
    ProblemDetail conflict(OptimisticLockingFailureException e) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "The record was modified concurrently; retry the request");
    }
}
```

**The precedence rule**, and it is worth stating exactly because people get the ordering
backwards:

1. `@ExceptionHandler` methods in the **controller itself** win over everything.
2. Then `@ControllerAdvice` / `@RestControllerAdvice` beans, **most specific first** —
   specificity by exception type depth (the handler for the most derived exception type
   that matches), then by advice-bean order (`@Order`, lower first).
3. Then the resolvers in the framework's own chain.

If the controller declares a handler for `Exception`, it wins over an advice that declares
one for `IllegalArgumentException`. That surprises people, and the correct advice is: **do
not put a catch-all `@ExceptionHandler(Exception.class)` in a controller** — it silently
disables every global handler for that controller.

### 5.2 The `HandlerExceptionResolver` Chain

`processHandlerException` walks an ordered list, and the first resolver to return a
non-null `ModelAndView` wins:

```text
1. ExceptionHandlerExceptionResolver
   └─ @ExceptionHandler in the controller, then @ControllerAdvice
      └─ Handles most application exceptions. Produces the response body.

2. ResponseStatusExceptionResolver
   └─ @ResponseStatus on the exception class or method, ResponseStatusException
      └─ Resolves a STATUS CODE only. No body. Calls sendError() → container /error.

3. DefaultHandlerExceptionResolver
   └─ Maps Spring's OWN exceptions to status codes:
        HttpRequestMethodNotSupportedException   → 405
        HttpMediaTypeNotSupportedException       → 415
        HttpMediaTypeNotAcceptableException      → 406
        MissingServletRequestParameterException  → 400
        MissingServletRequestPartException       → 400
        ServletRequestBindingException           → 400
        NoHandlerFoundException                   → 404
        AsyncRequestTimeoutException              → 503
      └─ No body. The container renders the error page.
```

The critical thing about resolver 3: **it does not produce a body, it calls
`response.sendError(status)`**, which hands the request to the container's error page
mechanism. In a Boot application that means the `/error` endpoint renders, and what comes
back is a `BasicErrorController` JSON body — which looks nothing like your
`ProblemDetail` responses. That inconsistency is the single most common complaint about
"our API returns nice errors for exceptions we handle and a completely different shape for
everything else."

> **PRODUCTION SCENARIO**
>
> Problem: a client team reports that `POST /orders` returns a clean RFC 7807
> `ProblemDetail` when the domain throws, but a bare `{"timestamp":"...","status":400,
> "error":"Bad Request","path":"/api/orders"}` when the request is malformed. Same endpoint,
> two error shapes.
> Investigation: the malformed request never reaches the controller, so `@ExceptionHandler`
> never fires. `MissingServletRequestParameterException` is resolved by
> `DefaultHandlerExceptionResolver`, which only maps it to a 400 status — the actual body
> is rendered by Boot's `BasicErrorController`.
> Root cause: mixing two error-rendering mechanisms. Handled exceptions go through the
> advice; unhandled framework exceptions go through the container.
> Solution: add an `@ExceptionHandler` for `ErrorResponseException` and
> `MethodArgumentNotValidException` in a global advice so they also return `ProblemDetail`,
> and set `server.error.include-message=never` so the legacy shape carries no extra detail.
> Prevention: one advice class that handles `ProblemDetail`-producing cases broadly, and a
> test that asserts every 4xx/5xx response from the API has the same JSON shape.

### 5.3 `ProblemDetail` — Why the Error Body Is a Contract

Spring Framework 6 ships built-in RFC 7807 support, and it is the single highest-value
addition to the web layer for anyone with external clients.

```java
// Spring's built-in types implement ErrorResponse, so they carry a ProblemDetail
@GetMapping("/orders/{id}")
public OrderDto one(@PathVariable Long id) {
    if (!exists(id)) {
        throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Order " + id + " not found");
    }
    return ...;
}
// → 404 with a proper application/problem+json body, automatically

// A custom exception, opting into the same contract
class OrderNotFoundException extends RuntimeException implements ErrorResponse {
    private final Long orderId;

    public ProblemDetail getBody() {
        ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND,
                "No order with id " + orderId);
        pd.setTitle("Order not found");
        pd.setProperty("orderId", orderId);
        pd.setType(URI.create("https://api.acme.com/problems/order-not-found"));
        return pd;
    }
}

// A handler returning one directly
@ExceptionHandler(OrderNotFoundException.class)
ProblemDetail handle(OrderNotFoundException e) { return e.getBody(); }
```

`ProblemDetail` serialises as:

```json
{
  "type": "https://api.acme.com/problems/order-not-found",
  "title": "Order not found",
  "status": 404,
  "detail": "No order with id 4711",
  "instance": "/api/orders/4711",
  "orderId": 4711
}
```

> **MUST REMEMBER**
>
> **A consistent error body is an API contract, and contracts cost money to change
> afterwards.** Every client that has parsed `{"message": "..."}` is a client that must be
> migrated. The three properties to fix early, because retrofitting them is expensive:
> a stable machine-readable **`type`** URI (not a prose message), a **`status`** that
> matches the HTTP status, and **`detail`** that is safe for a human to read in a log.
> Teams that introduce `ProblemDetail` after launch end up supporting two error shapes
> forever, and the second one is always the one nobody documented.

### 5.4 `@ResponseStatus`, `/error`, and the Stack Trace Leak

Three separate things that get conflated:

**`@ResponseStatus`** sets a status code and an optional reason, and it can go on an
exception class or an exception handler method. It sets the status; it does not build a
body. Using it on an exception class means `ResponseStatusExceptionResolver` picks it up.

**`/error`** is Boot's error endpoint, backed by `ErrorMvcAutoConfiguration` and
`BasicErrorController`. It renders the `BasicErrorController`'s `timestamp` / `status` /
`error` / `path` shape by default, and it is what `DefaultHandlerExceptionResolver`
delegates to when it calls `sendError()`. You can replace it wholesale with your own
`ErrorController` implementing `ErrorController` — that is how you get one consistent
`ProblemDetail` body for *every* error, handled or not.

**The stack trace leak.** This is the production point, and the default protects you:

```yaml
# Boot 2.3+ default: NEVER include the stack trace
server:
  error:
    include-stacktrace: never        # ← the default
    include-message: never
    include-binding-errors: never    # ← this one too
```

```yaml
# application-dev.yml — the line that ships to production
server:
  error:
    include-stacktrace: always       # ◄── THIS IS THE FINDING
```

> **PRODUCTION SCENARIO**
>
> Problem: a penetration test flagged that `GET /api/nonexistent` returned a full Java
> stack trace with internal class names, package structure, and library versions.
> Investigation: the endpoint was reachable in staging, where the `dev` profile is active.
> Root cause: `server.error.include-stacktrace: always` in `application-dev.yml`. The
> `dev` profile was not dev-only — it was selected in a staging and canary deployment
> pipeline because those environments needed the verbose logs.
> Solution: removed the property from the profile entirely, kept `never` as the only
> configured value, and replaced the debugging need with a correlation ID — a trace ID
> returned in a header and in the logs, so an operator can find the stack trace without
> the client seeing it.
> Prevention: a config-lint step that fails the build if
> `server.error.include-stacktrace` is set to anything other than `never` in any profile
> that is not strictly local. The deeper fix is to make profile activation
> environment-driven so a pipeline cannot select one by accident.

Related and equally worth knowing: `include-binding-errors` defaults to `never` and, when
`always`, serialises **every** rejected field value from a `BindingResult` back to the
client. For a login form that echoes the submitted password into the response body. That
one is a credential leak, not just an information leak.

### 5.5 `finally` vs `catch` — and the `@PostConstruct` Failure

There is a distinction in this layer that is easy to state and easy to get wrong, and it is
a genuine interview question about *where* an exception is handled.

```java
// Handler instantiation can FAIL, and it happens inside argument resolution,
// before the method is ever invoked:
@GetMapping("/orders/{id}")
public OrderDto one(@PathVariable Long id) { ... }

// If OrderController's @PostConstruct throws, the bean creation fails.
// That surfaces as a BeanCreationException during getHandler/argument resolution
// in doDispatch — it is NOT your @ExceptionHandler, and it is NOT handled by
// an @ExceptionHandler in this controller, because the controller instance
// does not exist yet.
```

So the rule is:

| Where the failure happens | Who handles it |
| --- | --- |
| Inside the handler method | `@ExceptionHandler` in the controller, then `@ControllerAdvice` |
| During **controller instantiation** (`@PostConstruct`, constructor, proxy creation) | Not your `@ExceptionHandler`. Falls through to `DefaultHandlerExceptionResolver` → 500 → `/error` |
| During **argument resolution** (`HttpMessageNotReadableException`, `MethodArgumentNotValidException`) | `DefaultHandlerExceptionResolver` → 400, unless you add handlers for those specific types |
| In a `Filter` before the servlet | **Not** the `HandlerExceptionResolver` chain at all — it propagates to the container, and the container dispatches `/error`. Your `@ControllerAdvice` may not even run. |
| In an `Interceptor.preHandle` | It **does** go through `processHandlerException`, so `@ControllerAdvice` applies |

That last column is the useful one: **a `Filter` throwing is outside MVC's exception
handling; an interceptor throwing is inside it.** This is a real difference and it is the
answer to "why does my `@ControllerAdvice` handle a 401 from my interceptor but not a 401
from my filter?"

> **INTERVIEW TRAP — `@ExceptionHandler` IN A `@ControllerAdvice` DOES NOT HANDLE FAILURES
> IN THE CONTROLLER'S OWN CONSTRUCTION**
>
> An `@ExceptionHandler` in a controller handles exceptions thrown by that controller's
> **methods**. If the controller bean cannot be created — a constructor throws, a
> `@PostConstruct` fails, a proxy cannot be created — there is no controller instance to
> look the handler up on, and the `HandlerMethod` was never successfully resolved. The
> exception surfaces as a `BeanCreationException` and lands on the 500 path. This is the
> `finally` vs `catch` distinction in concrete form: the `try` block MVC wraps is the
> handler *invocation*, and bean creation happens before that block.

#### Common Mistakes

- Putting `@ExceptionHandler(Exception.class)` in a controller, silently shadowing every
  global advice for that controller.
- Expecting `@ResponseStatus` to produce a body. It produces a status, and the body comes
  from the container's error handling.
- Assuming framework exceptions (`MethodArgumentNotValidException`,
  `MissingServletRequestParameterException`) go through your advice. They only do if you
  add handlers for them.
- `server.error.include-stacktrace: always` in any profile that reaches a shared
  environment. And `include-binding-errors: always`, which can echo a submitted password
  back to the client.
- Assuming a filter's exception reaches `@ControllerAdvice`. It does not — MVC's exception
  chain starts inside `DispatcherServlet`.
- Believing an `@ExceptionHandler` in the controller covers a `@PostConstruct` failure in
  that same controller. The instance does not exist yet.

#### Interview Questions — Exception Handling

**Q1. What is the precedence between a controller's `@ExceptionHandler` and a
`@ControllerAdvice`?** `TRICKY`

The controller's own `@ExceptionHandler` wins, always. Within the advice beans, the most
specific match wins — by exception-type depth first, then by `@Order` on the advice bean
with lower values first. The consequence to know: a catch-all `@ExceptionHandler(Exception.class)`
in a controller silently disables every global advice handler for that controller, which is
why it should not be there.

**Q2. What does `DefaultHandlerExceptionResolver` actually do?** `TRICKY`

It maps Spring's own framework exceptions — `HttpRequestMethodNotSupportedException` to
405, `HttpMediaTypeNotSupportedException` to 415, `HttpMediaTypeNotAcceptableException` to
406, `MissingServletRequestParameterException` to 400, `NoHandlerFoundException` to 404,
`AsyncRequestTimeoutException` to 503 — onto status codes. It does **not** build a body. It
calls `response.sendError(status)`, which hands off to the container's error page, which in
a Boot app is `/error` and `BasicErrorController`. That is why framework errors and handled
errors come back in different JSON shapes unless you unify them.

**Q3. Is a stack trace in a 500 response the default behaviour?** `TRICKY`

No. Since Boot 2.3 the default is `server.error.include-stacktrace=never`, and
`include-message` and `include-binding-errors` also default to `never`. Teams that turn
them on for local debugging leave them on in a `dev` profile that a staging or canary
pipeline also activates. The safe replacement for the debugging need is a correlation ID
returned in a response header and written to the logs, so an operator can find the stack
trace without the client ever seeing it.

**Q4. A filter throws an exception. Does the `@ControllerAdvice` handle it?** `TRICKY`

No. MVC's `HandlerExceptionResolver` chain runs inside `DispatcherServlet.doDispatch`, and
a filter runs outside it. A filter's exception propagates to the container, which does an
`ERROR` dispatch. An interceptor, by contrast, *is* inside `doDispatch`, so its exceptions
do go through `processHandlerException` and do reach `@ControllerAdvice`. This is the
sharpest mechanical difference between the two layers.

**Q5. Your controller's `@PostConstruct` throws. Does its own `@ExceptionHandler` run?**
`ADVANCED`

No, and the reason is worth being precise about. The handler methods are looked up on a
controller *instance*, and the failure here happens while creating that instance, before
the `HandlerMethod` has been successfully resolved and before the invocation `try` block
MVC wraps. The exception surfaces as a `BeanCreationException` and lands on the 500 path,
where it is frequently not even attributed to a request handler in the logs.

**Q6. Why is `ProblemDetail` worth adopting after you already have clients?** `STAFF`

Because the error body is a contract, and retrofitting one is far more expensive than
introducing one. Every client that has parsed a bespoke shape is a client to migrate, and
in practice teams end up supporting both shapes forever with the undocumented one being the
one nobody maintains. The three properties to fix early because they are the ones clients
actually branch on are a stable machine-readable `type` URI, a `status` that agrees with
the HTTP status, and a `detail` string that is safe to put in a log. Adopt it before you
have clients if you can; if you cannot, version the error shape deliberately.

> **CHAPTER 5 SUMMARY**
>
> Exception handling in Spring MVC is a three-stage fallback, and knowing which stage
> fires tells you what shape the client sees. `@ExceptionHandler` in the controller beats
> `@ControllerAdvice`, and a catch-all in a controller silently disables the advice.
> `DefaultHandlerExceptionResolver` maps framework exceptions to status codes and
> delegates the body to the container's `/error`, which is why malformed requests come back
> in a different JSON shape than domain errors unless you unify them. A filter's exception
> never reaches `@ControllerAdvice`; an interceptor's does. `ProblemDetail` is the right
> error contract, and the three properties to fix before you have clients are `type`,
> `status` and `detail`. And the production point: `server.error.include-stacktrace`
> defaults to `never`, is turned to `always` by teams for debugging, and the `dev` profile
> that does it is regularly activated in staging — with `include-binding-errors` the worse
> variant, since it can echo a submitted password back in the response.

#### Further Reading

- [Spring Framework Reference — `@ExceptionHandler` and `@ControllerAdvice`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-advice.html) — both annotations, the scoping attributes, and the precedence rules.
- [Spring Framework Reference — `@ExceptionHandler`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-exceptionhandler.html) — the per-method form, including what happens with a controller-local handler versus an advice one.
- [Spring Framework Reference — REST Exceptions (`ProblemDetail`)](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html) — the built-in RFC 7807 support, `ErrorResponse`, and how the framework's own exceptions already produce one.
- [Spring Framework Reference — Exception Resolvers](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/exceptionhandlers.html) — the resolver chain in order, including the status-code-only resolvers and where `/error` fits.

## Chapter 6 — Validation in the Web Layer

### 6.1 `@Valid` vs `@Validated` and the `BindingResult` Rule

This is the single most useful behaviour in the volume, and it is routinely misremembered
in both directions.

```java
@PostMapping("/orders")
public OrderDto create(@Valid @RequestBody CreateOrder cmd) {
    return orders.place(cmd);        // 400 with MethodArgumentNotValidException
}   //   ▲ @Valid, NO BindingResult following
   //     → if validation FAILS, an exception is thrown and the method NEVER RUNS
   //     → 400, body produced by your @ExceptionHandler or by the /error page


@PostMapping("/orders")
public OrderDto create(@Valid @RequestBody CreateOrder cmd,
                       BindingResult errors) {
    if (errors.hasErrors()) {                 // ◄── THE METHOD BODY RUNS ANYWAY
        return ResponseEntity.badRequest().body(toProblem(errors));
    }
    return ResponseEntity.ok(orders.place(cmd));
}   //   ▲ @Valid, WITH BindingResult immediately after
   //     → validation errors are POPULATED into `errors`, no exception is thrown
   //     → the method is invoked and must check hasErrors() itself
```

**The rule, stated exactly:** the `MethodValidationException` /
`MethodArgumentNotValidException` is thrown only when there is **no** `BindingResult` or
`Errors` parameter immediately following the `@Valid` parameter. With one, Spring has
nowhere to put the errors except your parameter, so it puts them there and calls your
method.

> **INTERVIEW TRAP — THE 200-ON-INVALID-INPUT BUG**
>
> This is the mistake that survives code review because the code *looks* validated:
>
> ```java
> @PostMapping("/orders")
> public OrderDto create(@Valid @RequestBody CreateOrder cmd,
>                        BindingResult errors) {
>     return orders.place(cmd);        // never checks errors.hasErrors()
> }
> ```
>
> With the `BindingResult` parameter present, the invalid `CreateOrder` is **fully bound
> and passed to your method anyway**. The `BindingResult` is populated and then ignored,
> the service layer receives an object with a null email and a negative quantity, and the
> request returns **200 with a persisted bad record**. Nothing throws. Nothing is logged.
> The check is the developer's job and omitting it is a silent data-integrity bug.
>
> The senior-level framing: `@Valid` is not a gate, it is a *report generator*. Whether it
> gates anything is a decision made by the shape of the method signature, which is why
> "always add `BindingResult` for nicer errors" is advice with a real cost attached.

> **MUST REMEMBER**
>
> If you want the framework to reject invalid input for you, **do not** declare a
> `BindingResult` or `Errors` parameter. If you want to build a rich, field-level error
> response yourself, **do** declare one — and then `hasErrors()` is not optional. The two
> styles are not interchangeable, and mixing them in one codebase is how the second bug
> appears.

### 6.2 The Two Exception Types

| | `MethodArgumentNotValidException` | `ConstraintViolationException` |
| --- | --- | --- |
| Raised when | `@Valid` / `@Validated` on a **`@RequestBody` parameter** | `@Validated` on the **class**, for method-level constraints |
| Comes from | `RequestResponseBodyMethodProcessor` → Bean Validation on the object | `MethodValidationPostProcessor` → a CGLIB proxy around the bean |
| Default status | 400 | 500 unless you map it |
| Where the errors are | `ex.getBindingResult()` — a full `BindingResult` | `ex.getConstraintViolations()` — a `Set<ConstraintViolation<?>>` |
| Contains field errors | Yes, with rejected values and nested paths | No — only method-level violations |
| Needs a class-level annotation | No | Yes, `@Validated` |

```java
// The body-validation path
@ExceptionHandler(MethodArgumentNotValidException.class)
ProblemDetail onInvalidBody(MethodArgumentNotValidException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
            "Request validation failed");
    ex.getBindingResult().getFieldErrors().forEach(fe ->
            pd.setProperty(fe.getField(), fe.getDefaultMessage()));
    return pd;
}

// The method-level path — note it needs @ExceptionHandler, not a resolver
@ExceptionHandler(ConstraintViolationException.class)
ProblemDetail onConstraint(ConstraintViolationException ex) {
    ProblemDetail pd = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
            "Constraint violation");
    ex.getConstraintViolations().forEach(v ->
            pd.setProperty(v.getPropertyPath().toString(), v.getMessage()));
    return pd;
}
```

`ConstraintViolationException` returning **500** by default is a genuine production
surprise: a `@Size(min = 1)` on a `@RequestParam` fails a validation rule and comes back
as a server error, which is wrong on both counts. The fix is the `@ExceptionHandler`
above, and the diagnosis is to notice that it is a 5xx for what is clearly bad input.

```java
// Method-level constraints — the @Validated-on-the-class case
@RestController
@Validated                                       // ◄── required for these to fire
class OrderController {

    @GetMapping("/orders")
    public List<OrderDto> list(@RequestParam @Size(min = 3, max = 100) int pageSize) { ... }

    @PostMapping("/orders")
    public OrderDto create(@RequestParam @NotBlank String customerId,
                           @RequestParam @Positive BigDecimal amount) { ... }
}
```

### 6.3 Custom Constraints and the Allowlist

```java
@Documented
@Constraint(validatedBy = ValidSkuValidator.class)
@Target({ FIELD, PARAMETER, METHOD })
@Retention(RUNTIME)
public @interface ValidSku {
    String message() default "invalid SKU";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
}

public class ValidSkuValidator implements ConstraintValidator<ValidSku, String> {
    public boolean isValid(String value, ConstraintValidatorContext ctx) {
        if (value == null) return true;                 // @NotNull handles nullability
        return value.matches("[A-Z]{3}-\\d{4}");
    }
}
```

Validation **groups** are the feature teams underuse. They let the same DTO enforce
different rules for different operations:

```java
public interface OnCreate {}
public interface OnUpdate {}

public record PlaceOrder(@NotBlank(groups = OnCreate.class) String customerId,
                         @Null(groups = OnUpdate.class) Long id,   // null on create
                         @NotNull BigDecimal amount) { }

@PostMapping("/orders")
public OrderDto create(@Validated(OnCreate.class) @RequestBody PlaceOrder cmd) { ... }

@PutMapping("/orders/{id}")
public OrderDto update(@Validated(OnUpdate.class) @RequestBody PlaceOrder cmd) { ... }
```

> **TRADE-OFF**
>
> Groups buy you "one DTO, three operation profiles" without a proliferation of classes,
> and the cost is that the constraint is no longer visible at the field — a reader of
> `@NotBlank(groups = OnCreate.class)` has to know which group the endpoint uses, and
> forgetting to pass the group means the constraint **silently does not run**. Separate
> request types (`PlaceOrder`, `UpdateOrder`, `CancelOrder`) are more code and make every
> rule unambiguous at the point of declaration. The flip condition: use groups when the
> variants genuinely share most of their fields; use separate types when the operation
> profiles diverge past about half the fields, or when a constraint's applicability is
> non-obvious.

### 6.4 Where Validation Belongs — the Layer Question

This is the part interviewers push on, and the answer has a specific structure.

```text
┌─ EDGE (controller / @Valid) ────────────────────────────────────┐
│  • Is the field present?           @NotNull, @NotBlank           │
│  • Is the shape right?             @Pattern, @Size, @Email      │
│  • Is the type parseable?          (binding fails → 400)        │
│  • Is it within a hard range?      @Min(1), @Max(100)           │
│                                                                  │
│  Purpose: reject malformed input BEFORE it costs anything.       │
│  Failure mode if absent: parse errors, NPEs, 500s, injection.    │
└──────────────────────────────────────────────────────────────────┘
                              │  ▼
┌─ DOMAIN (service / entity invariants) ──────────────────────────┐
│  • "An order cannot be shipped before it is paid"                │
│  • "A discount cannot exceed the order subtotal"                 │
│  • "Only the tenant that owns the cart may check it out"         │
│  • "This account is frozen"                                      │
│                                                                  │
│  Purpose: the rules that are true REGARDLESS of who called.     │
│  Failure mode if absent: the rule is enforced only in one        │
│  entry point, and every other entry point silently bypasses it.  │
└──────────────────────────────────────────────────────────────────┘
```

> **STAFF-LEVEL CONSIDERATION**
>
> A team that puts *only* edge validation has a service layer that is **callable from
> anywhere with no protection at all.** Another service, a scheduled job, a message
> consumer, a JPA lifecycle callback, a data fix script, a test — none of them go through
> the controller, so none of them get the `@Valid` check. The domain rule "an order must be
> paid before it ships" is not a statement about HTTP; it is a statement about orders. The
> moment it lives only in a controller, the first internal caller that ships an unpaid
> order is a data-integrity incident, and the code review that let it through is defensible
> because the reviewer was reviewing a controller.
>
> The rule that holds up: **the domain owns the invariant; the edge owns the shape.**
> Duplicate the cheap shape checks at the edge because they save a round trip and give the
> client a good error; enforce every business rule in the domain, because the domain is the
> only place that sees every caller. The mistake to avoid in the other direction is putting
> business rules only in the domain and returning a `ConstraintViolationException` with
> HTTP-flavoured messages — a domain service should not know what a 422 is.

#### Common Mistakes

- Adding a `BindingResult` parameter and never checking `hasErrors()`. The invalid object
  is passed to the service and the endpoint returns 200 with a corrupt record persisted.
- Believing `@Valid` guarantees rejection. It generates a report; the signature decides
  whether the report becomes a rejection.
- Forgetting `@Validated` on the class for method-level constraints on parameters — they
  silently do not fire.
- Treating a `ConstraintViolationException` as a 500. It is bad input; map it to 400.
- Using validation groups and forgetting to pass the group at one call site, which
  disables the constraint with no error.
- Putting business rules in `@Valid` constraints and HTTP concepts in the domain — the
  inversion that makes a service layer untestable without a servlet.
- Relying on edge validation alone and having a message consumer call the service directly.

#### Interview Questions — Validation

**Q1. What happens with `@Valid @RequestBody X` when X fails validation, with and without
a `BindingResult` parameter?** `TRICKY`

Without a `BindingResult` or `Errors` parameter following it, Spring throws
`MethodArgumentNotValidException`, the method body never runs, and the response is a 400
whose body comes from your `@ExceptionHandler` or, absent one, from the container's
`/error`. With a `BindingResult` parameter, Spring has nowhere to put the errors except
that parameter, so it populates it and **invokes the method anyway** — the method must call
`hasErrors()` itself. That asymmetry is why "always add `BindingResult` for nicer errors"
is a trade, not a free improvement.

**Q2. A PR adds `BindingResult errors` to a method to return nicer errors, and nothing
else changes. What is the review comment?** `TRICKY`

That the PR has converted a 400 into a 200 for invalid input unless the body checks
`hasErrors()`. The object is fully bound and passed to the service regardless. The review
must verify the check exists, and ideally push for a helper that makes it hard to forget —
returning a `ProblemDetail` from a shared method rather than three lines of
`getFieldErrors()` loop at each call site.

**Q3. `MethodArgumentNotValidException` vs `ConstraintViolationException` — when do you get
which?** `TRICKY`

`MethodArgumentNotValidException` comes from validating a `@RequestBody` object, and
carries a full `BindingResult` with field errors, rejected values and nested paths.
`ConstraintViolationException` comes from a CGLIB proxy created by `@Validated` on the
**class**, for method-level constraints such as `@Size` on a `@RequestParam`, and carries
a `Set<ConstraintViolation<?>>` with no field-error structure. The second defaults to a
500, which is wrong — map it to 400 explicitly.

**Q4. Where should a business rule live, and what breaks if it lives only in the
controller?** `STAFF`

The domain. A rule like "an order cannot ship before it is paid" is true regardless of who
asked, and a `@Valid` constraint in a controller is only reached by HTTP. Any other caller —
another service, a scheduled job, a JMS consumer, a data-fix script, a test — bypasses it
entirely, and the first one that ships an unpaid order is a data-integrity incident. The
edge should duplicate the cheap *shape* checks (presence, format, range) because they save
a round trip and produce a good client error; the domain owns the invariants because it is
the only layer that sees every entry point.

**Q5. Validation groups — when are they worth the complexity?** `TRICKY`

When the variants genuinely share most of their fields and the operation profiles differ in
only a few constraints — a create/update pair, or a create/cancel pair. Separate request
types are more code but make every rule's applicability obvious at the field. The failure
mode of groups is that a constraint whose group is not passed at a call site **silently
does not run**, and a reader of `@NotBlank(groups = OnCreate.class)` has to know which group
the endpoint uses. Past about half the fields differing, separate types are the better
trade.

**Q6. A validation failure returns 500. What's the likely cause and the fix?** `SCENARIO`

Almost certainly a `ConstraintViolationException` from `@Validated` on the class — method-
level parameter constraints are enforced by a proxy, not by argument resolution, so they
surface as `ConstraintViolationException`, which has no default status mapping and becomes
a 500. It is a constraint on a `@RequestParam` or a method parameter, and the condition is
in fact bad input. The fix is a `@ExceptionHandler(ConstraintViolationException.class)`
returning a 400 `ProblemDetail`, plus verifying `@Validated` is on the class at all.

> **CHAPTER 6 SUMMARY**
>
> `@Valid` is a report generator, not a gate, and the method signature decides whether the
> report becomes a rejection. Without a following `BindingResult`/`Errors` parameter,
> invalid input throws `MethodArgumentNotValidException` and the method never runs; **with**
> one, the errors are populated and your method runs anyway — so forgetting `hasErrors()`
> turns invalid input into a 200 with a corrupt record persisted, silently. Body validation
> throws `MethodArgumentNotValidException` with a full `BindingResult`; method-level
> constraints under a class-level `@Validated` throw `ConstraintViolationException`, which
> has no default mapping and shows up as a 500 for what is plainly bad input. The layer
> question is the one worth getting right in a design review: the edge owns the *shape* and
> the domain owns the *invariant*, because edge validation alone leaves a service callable
> from a message consumer or a scheduled job with no protection at all.

#### Further Reading

- [Spring Framework Reference — Validation in Spring MVC](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-validation.html) — `@Valid` on method arguments, the `BindingResult` contract, and the exact conditions under which an exception is thrown.
- [Spring Framework Reference — Bean Validation](https://docs.spring.io/spring-framework/reference/core/validation/beanvalidation.html) — the JSR-380 annotations, custom constraints, groups, and the message interpolation rules.
- [Spring Framework Reference — Validation, Errors and Binding Result](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-config/validation.html) — `WebDataBinder`, `@InitBinder` allowlists, and how field errors become a response.

## Chapter 7 — Async, Streaming & File Upload

### 7.1 The Four Async Shapes

Every one of these returns control to the container and releases the request thread. They
differ in **who computes the result and when**.

| Return type | Who computes it | When | Use for |
| --- | --- | --- | --- |
| `Callable<V>` | A thread from a `TaskExecutor` | Immediately, in parallel with the client waiting | Slow computation, e.g. a report you can start immediately |
| `WebAsyncTask<V>` | A thread from a **specified** executor | Immediately, with an explicit timeout | The same, but you need to control the executor and the timeout |
| `DeferredResult<V>` | **Any** thread, at any time | Later — could be seconds, minutes, or never | A result produced elsewhere: a JMS listener, a websocket, a polling loop |
| `SseEmitter` | A thread or an async write loop | Continuously, for the life of the connection | Server-sent events |
| `StreamingResponseBody` | A thread, writing to the output stream | Continuously, in chunks | Large downloads, CSV export |

```java
// Callable — "start this now, in parallel"
@GetMapping("/reports/{id}")
public Callable<Report> report(@PathVariable Long id) {
    return () -> reportService.build(id);       // runs on the async task executor
}

// DeferredResult — "the answer will arrive later, from somewhere"
@GetMapping("/orders/{id}/confirmation")
public DeferredResult<OrderDto> confirmation(@PathVariable Long id) {
    DeferredResult<OrderDto> result = new DeferredResult<>(30_000L);
    confirmationListener.onConfirm(id, o -> result.setResult(o));   // later, from JMS
    return result;
}

// WebAsyncTask — Callable with explicit control
@GetMapping("/reports/{id}")
public WebAsyncTask<Report> report(@PathVariable Long id) {
    return new WebAsyncTask<>(60_000L, reportExecutor, () -> reportService.build(id));
}
```

> **TRADE-OFF**
>
> `Callable` and `DeferredResult` are not interchangeable and the difference is a
> thread-count decision. `Callable` **consumes an executor thread for the whole
> computation** — 500 concurrent slow reports against a 100-thread executor means 400 of
> them wait in the executor's queue, and the client-side wait is the same either way.
> `DeferredResult` consumes **zero threads while waiting** and only needs one thread at
> the moment `setResult` is called. So: `Callable` when you can start the work right now
> and the work is CPU-or-blocking-bound; `DeferredResult` when the work is triggered by
> something external, when the wait can be long, or when the result may never arrive at
> all. Choosing `Callable` for something a JMS listener will deliver is how teams end up
> with a blocked executor and an `AsyncRequestTimeoutException` at 30 seconds.

### 7.2 The Async Timeout — and Why It Is Not the Servlet Timeout

```java
// The async timeout is a SEPARATE timer that starts when the handler returns
@GetMapping("/slow")
public DeferredResult<String> slow() {
    DeferredResult<String> r = new DeferredResult<>(5_000L);   // 5 seconds
    return r;
}

// Servlet-level default
@Bean
WebServerFactoryCustomizer<TomcatServletWebServerFactory> timeoutCustomizer() {
    return factory -> factory.setAsyncRequestTimeout(30_000);   // Tomcat default: 30s
}
```

Three separate timeouts exist in this stack, and confusing them is the source of every
"why did this hang for exactly 30 seconds" question:

| Timeout | Whose | Default | Applies to |
| --- | --- | --- | --- |
| `connectionTimeout` | Connector | 20s (Tomcat) | Establishing the connection |
| `asyncTimeout` | Servlet | **30s** (Tomcat `asyncRequestTimeout`) | An async cycle, from when the handler returns |
| Read/write timeout | Connector | 20s each | Individual socket reads/writes |
| `DeferredResult` timeout | Your code | 30s unless set | The `setTimeout` you pass the constructor |

When the async timeout expires, the container fires `AsyncRequestTimeoutException` — and
where that goes matters. `DefaultHandlerExceptionResolver` maps it to **503**, but only if
an `@ExceptionHandler` does not intercept it first, and if the response is already committed
you get a truncated body instead of a clean error. The response you actually get depends on
which layer is still able to write.

**What is lost when the request thread returns early.** This is the part people miss:

```text
LOST (the container thread is released):
  ✘ ThreadLocal state — MDC trace ID, RequestContextHolder, LocaleContext
  ✘ SecurityContextHolder — under the default ThreadLocal strategy
  ✘ @Transactional context — the transaction commits or rolls back at method return
  ✘ Open JDBC connections held by an in-flight transaction
  ✘ Any servlet-container-bound resource tied to the thread

KEPT (request attributes survive the async cycle):
  ✔ HttpServletRequest / Response attributes
  ✔ Anything stored in the ServletRequest attribute map
  ✔ Anything you explicitly propagated (TaskDecorator, Reactor Context)

SO:
  @Async + SecurityContextHolder.getContext()  →  null / AuthenticationCredentialsNotFoundException
  MDC traceId in the async body                  →  null
  A DB write after startAsync()                  →  LazyInitializationException (no session)
```

> **PRODUCTION RELEVANCE**
>
> This is why the async section of every Spring guide eventually says "propagate the
> security context and the MDC manually." In MVC the mechanism is a `TaskDecorator` on the
> async executor, or — for `DeferredResult` — simply capturing what you need into local
> variables **before** you return, because the request thread is about to be recycled and
> everything on it goes with it. The practical discipline: treat the point where you return
> a `Callable` or `DeferredResult` as the end of your access to thread-bound state, and
> capture the trace ID, the tenant and the principal into ordinary fields before that line.
> An audit log that loses the tenant on exactly the endpoints that are slowest is a
> genuinely painful incident to debug.

The underlying mechanism is Servlet 3.1 non-blocking I/O — `startAsync()` returns an
`AsyncContext`, the container suspends the request, and completion calls
`AsyncContext.complete()`. `StreamingResponseBody` and `SseEmitter` sit directly on that,
writing to the response's `OutputStream` from a different thread.

### 7.3 Server-Sent Events

```java
@GetMapping(value = "/events/{channel}", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
public SseEmitter subscribe(@PathVariable String channel) {

    SseEmitter emitter = new SseEmitter(0L);      // 0 = never time out
    subscribers.computeIfAbsent(channel, k -> new CopyOnWriteArrayList<>())
                .add(emitter);

    emitter.onCompletion(() -> subscribers.get(channel).remove(emitter));
    emitter.onTimeout(() -> subscribers.get(channel).remove(emitter));
    emitter.onError(e -> subscribers.get(channel).remove(emitter));
    return emitter;
}

// Elsewhere — any thread
public void publish(String channel, Notification n) {
    for (SseEmitter e : subscribers.getOrDefault(channel, List.of())) {
        try {
            e.send(SseEmitter.event().name("notification").data(n));
        } catch (IOException | IllegalStateException ex) {
            e.complete();                          // client went away
        }
    }
}
```

> **MUST REMEMBER**
>
> **Each `SseEmitter` holds a container thread for the life of the connection.** With
> Tomcat's 200 threads, 200 concurrent SSE clients consume the entire request pool — every
> other endpoint in the application stops working. The symptoms are unmistakable and get
> misdiagnosed constantly: SSE clients work fine in a demo with three subscribers, and in
> production a single endpoint starts returning timeouts for unrelated reasons. The
> mitigations, in order: raise the timeout to 0 (or a long value) so the container's async
> timeout does not reap connections; confirm the connector is set up for it; and understand
> that the *real* fix at scale is a dedicated connector with its own executor, a dedicated
> thread, or moving SSE to a gateway that holds the connections. Volume 11 covers the
> broker-backed alternatives.
>
> The alternative worth knowing: a `ResponseBodyEmitter` returned alongside a
> `DeferredResult` lets the work happen elsewhere and the emitter just writes, without
> pinning a thread for the duration of the wait.

### 7.4 File Upload

```java
@PostMapping(value = "/upload", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
public UploadResult upload(@RequestPart("file") MultipartFile file,
                           @RequestPart("meta") UploadMeta meta) {
    if (file.isEmpty()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST);
    return storage.store(file.getOriginalFilename(),
                         file.getInputStream(), file.getSize());
}
```

```yaml
spring:
  servlet:
    multipart:
      enabled: true                    # default
      max-file-size: 10MB              # per file  → MaxUploadSizeExceededException
      max-request-size: 50MB           # whole request
      file-size-threshold: 0B           # 0 = keep everything on disk (see below)
      location: ${java.io.tmpdir}       # where parts are spooled
      resolve-lazily: false
```

| Setting | Governs | Failure when exceeded |
| --- | --- | --- |
| `max-file-size` | One file | `MaxUploadSizeExceededException` → **500** unless mapped |
| `max-request-size` | All files in one request | Same |
| `file-size-threshold` | Disk vs memory for each part | Not a failure — a behaviour switch |

The threshold behaviour is the one that is genuinely counter-intuitive, and it is a
security-relevant default:

| `file-size-threshold` | Behaviour |
| --- | --- |
| `0` (Boot default) | **Every** part is written to a temp file on disk. Nothing is held in heap. |
| `256KB` (Tomcat's own default) | Parts under 256KB stay **in memory**, above go to disk |
| Any value | Below the threshold, part data is held in a byte array in heap |

A 0-byte upload or a tiny 4KB file still gets a temp file created, deleted, and `marked
for deletion on JVM exit` — the "temporary file will be deleted on exit" note on Tomcat
part files is not cosmetic, it is the known mechanism behind **temporary file accumulation
across deploys** in long-running containers. A 0 threshold is the safer default and it is
what Boot chose for exactly that reason.

`MaxUploadSizeExceededException` defaulting to **500** is a real finding: the client sent
something too big, and the response says the server broke. It needs a `@ExceptionHandler`
mapping it to 413 Payload Too Large, and — in some container configurations — a property
on the connector to make the exception arrive at all rather than being swallowed into a
generic 500.

| Resolver | Backing library | When to use |
| --- | --- | --- |
| `StandardServletMultipartResolver` | The container (Tomcat's own parser) | The default, and the right answer. Fewer dependencies, and the container is where the limits are enforced. |
| `CommonsMultipartResolver` | Apache Commons FileUpload | Legacy. It exists for `CommonsFileUpload`-specific tuning and pre-`Servlet 3.0` compatibility. It is not faster and it is a second implementation of a solved problem. |

> **INTERVIEW TRAP**
>
> "Multipart uploads are handled by `MultipartResolver`, so I should implement one for
> performance" — no. The `StandardServletMultipartResolver` delegates to the container's
> parser, which is where `max-file-size` is enforced anyway, and Commons FileUpload gives
> you a second parser with its own configuration to keep in sync and no throughput benefit.
> If upload throughput is the problem, the answers are streaming to object storage rather
> than buffering locally, raising the size limits, and moving the whole operation out of
> the request path — not swapping the resolver.

### 7.5 Outbound Calls: `RestTemplate` vs `WebClient`

```java
// RestTemplate — blocking, throws
RestTemplate rest = new RestTemplateBuilder()
        .setConnectTimeout(Duration.ofSeconds(2))     // TCP connect
        .setReadTimeout(Duration.ofSeconds(5))        // waiting for the response
        .setErrorHandler(new DefaultResponseErrorHandler() { /* or a custom one */ })
        .build();

try {
    OrderDto dto = rest.getForObject("https://payments/orders/{id}", OrderDto.class, id);
} catch (HttpStatusCodeException e) {          // 4xx and 5xx BOTH throw
    if (e.getStatusCode().value() == 404) return Optional.empty();
    throw new PaymentUnavailableException(e);
} catch (ResourceAccessException e) {          // timeouts, connection refused
    throw new PaymentUnavailableException(e);
}
```

| | `RestTemplate` | `WebClient` |
| --- | --- | --- |
| Model | Blocking, one thread per request | Reactive, event-loop by default |
| Error signal | **Throws** `HttpStatusCodeException` for 4xx/5xx, `ResourceAccessException` for I/O | **Signals** `Mono.error(...)` — errors are values on the stream |
| Timeouts | Connect + read, configured on the client | Per-request `Timeout`; also connect and response |
| Interceptors | `ClientHttpRequestInterceptor` — synchronous, pre-execution | `ExchangeFilterFunction` — must be non-blocking |
| Filters | Servlet `Filter`, same thread | Reactor context, or `WebFilter` in a reactive app |
| Backpressure | n/a | Native |
| Dependency risk | Blocking calls inside a `Mono.pipeTo` block the event loop | Calling `.block()` puts you back on thread-per-request with none of the benefits |

**Timeouts are a chain budget, not a per-client setting.** This is the point to make at
staff level, and it is where a service falls over:

```text
A request arrives with a 5-second deadline from its own caller.
   │
   ├─ 100ms  auth (JWT verification — local, or a network call to a JWKS endpoint)
   ├─ 50ms   our own processing
   ├─ ?
   │  └─ 2000ms  payments service  ← rest.connectTimeout(2s) + rest.readTimeout(5s)
   │             = up to 7 SECONDS on this call alone
   ├─ 2000ms  inventory service
   └─ 1000ms  notification service (fire and forget)
   │
   ▼
Worst case: ~12 seconds, against a 5-second caller deadline.
The caller has already given up. You did not fail fast; you failed LATE
and burned a thread for 7 extra seconds.
```

The rule: **the per-hop timeout must be derived from the remaining budget, not chosen
independently.** Three concrete practices: give each client a connect timeout of 1/10 of
the caller's deadline; give the read timeout the *remaining* budget minus the time already
spent, not a round number; and propagate the deadline as a header so downstream hops can
do the same arithmetic. And never let `readTimeout` exceed what the caller is willing to
wait, because the alternative to timing out is the connection being held by a server
thread — which is how one slow dependency becomes an exhausted thread pool.

> **STAFF-LEVEL CONSIDERATION**
>
> `RestTemplate` vs `WebClient` is not primarily a technology question, and a staff answer
> says so. Adopting `WebClient` in a thread-per-request application buys almost nothing —
> the container is still giving you one thread per request, and `.block()` on a reactive
> client inside a servlet controller is the worst of both worlds: reactive complexity with
> blocking throughput. `WebClient` earns its place in one of three situations: the
> application is already reactive (Volume 10), the call is a fan-out of many downstream
> services where sequential blocking calls are the actual bottleneck, or a specific
> endpoint's latency is dominated by a slow sequential chain that should be parallel. The
> organisational cost is real too — `WebClient`'s error model and its interceptor contract
> are different enough that a team that mixes the two clients in one codebase gets two
> error-handling conventions and no clarity about which is the default.

#### Common Mistakes

- Returning a `Callable` for work triggered by an external event, and exhausting the async
  executor. Use `DeferredResult` — it costs no thread while waiting.
- Reading `SecurityContextHolder` or the MDC inside a `Callable`. Both are thread-bound
  and the thread is gone. Capture them before returning.
- Assuming the async timeout is the servlet timeout. It is a separate 30-second timer that
  starts when the handler returns.
- Letting `MaxUploadSizeExceededException` return 500. It is a 413.
- Setting `file-size-threshold` to a large value, which puts user-uploaded bytes in heap.
  `0` is the safe default.
- Setting every `RestTemplate` timeout to 30 seconds "to be safe" without checking the
  caller's deadline, so a slow dependency holds your threads long after the caller left.
- Calling `.block()` on a `WebClient` inside a servlet controller, which is blocking
  throughput with reactive complexity.

#### Interview Questions — Async, Streaming & Upload

**Q1. `Callable` vs `DeferredResult` — when is each right?** `TRICKY`

`Callable` consumes an executor thread for the entire computation, so it is right when you
can start the work immediately and it is CPU- or blocking-bound. `DeferredResult` consumes
no thread while waiting and only needs one at the moment `setResult` is called, so it is
right when the result is produced by something external — a JMS listener, a websocket, a
polling loop — when the wait can be long, or when the result may never arrive. Choosing
`Callable` for a JMS-delivered result is how an async executor gets exhausted and
`AsyncRequestTimeoutException`s appear at 30 seconds.

**Q2. What state do you lose when a handler returns a `DeferredResult`?** `STAFF`

Everything thread-bound, because the request thread goes back to the pool: MDC and the
trace ID, `RequestContextHolder` and the `LocaleContext`, `SecurityContextHolder` under the
default `ThreadLocal` strategy, and the transaction — which commits or rolls back at method
return, so a DB write attempted afterwards throws `LazyInitializationException` with no
session to bind to. Request *attributes* survive the async cycle. The discipline that
follows: treat the `return` statement as the end of your access to thread-bound state and
capture the principal, tenant and trace ID into local variables or a DTO before it.

**Q3. Is the async timeout the same as the servlet timeout?** `TRICKY`

No. The async timeout is a separate timer, `asyncRequestTimeout`, that starts when the
handler returns and defaults to 30 seconds in Tomcat. When it expires the container fires
`AsyncRequestTimeoutException`, which `DefaultHandlerExceptionResolver` maps to 503 —
unless your `@ExceptionHandler` catches it first, and unless the response was already
committed, in which case the client gets a truncated body rather than a clean error.

**Q4. Each `SseEmitter` holds a thread. What breaks at scale and what is the fix?** `SCENARIO`

At Tomcat's 200 default threads, 200 concurrent SSE clients consume the entire request
pool, and every unrelated endpoint starts timing out — which gets misdiagnosed as a
general capacity problem. It works in demos because demos have three subscribers. The
mitigations in order: set a 0 or long timeout so the container does not reap connections,
verify the connector is configured for it, and understand that the real fix at scale is a
dedicated connector with its own executor, a dedicated thread, or moving SSE termination to
a gateway that holds the connections.

**Q5. A file upload over the limit returns 500. What are the two problems?** `TRICKY`

The status code is wrong — `MaxUploadSizeExceededException` is client input being too
large and should be 413, so it needs an explicit `@ExceptionHandler`; and in some container
configurations the exception does not reach the resolver chain at all, so the size limit has
to be enforced at the connector as well. Related and worth knowing: `file-size-threshold=0`
(the Boot default) writes every part to a temp file, including 4KB ones, and Tomcat's temp
files are marked for deletion on JVM exit — which is the mechanism behind temp-file
accumulation across deploys in long-running containers.

**Q6. Is `CommonsMultipartResolver` ever the right choice over the standard one?**
`STAFF`

Essentially never for a new system. The `StandardServletMultipartResolver` delegates to
the container's parser, which is where `max-file-size` is enforced anyway, so Commons
FileUpload gives you a second parser, a second configuration to keep in sync, and no
throughput benefit. It exists for legacy pre-Servlet-3.0 compatibility and
Commons-FileUpload-specific tuning. If upload throughput is the actual problem, the
answers are streaming to object storage, raising limits, or taking the operation off the
request path.

**Q7. How do you set timeouts for an outbound HTTP call so a slow dependency doesn't take
the service down?** `STAFF`

Treat timeouts as a chain budget, not a per-client setting. Derive each hop's connect and
read timeout from the caller's remaining deadline — typically a connect timeout around a
tenth of it and a read timeout equal to what is left after the time already spent —
rather than picking round numbers per client. Then propagate the deadline as a header so
downstream hops do the same arithmetic. The failure this prevents is specific: a
`readTimeout` longer than the caller's patience means the caller has already gone, and you
have held a thread for the full timeout — turning one slow dependency into an exhausted
thread pool rather than a fast failure.

> **CHAPTER 7 SUMMARY**
>
> Async is a thread-economics decision, not a syntax choice. `Callable` costs a thread for
> the whole computation; `DeferredResult` costs nothing while waiting and is the right
> answer for anything triggered externally. Returning either one ends your access to
> thread-bound state — MDC, security context, transaction, and the request thread itself
> are gone, which is why `SecurityContextHolder` and the trace ID are `null` inside a
> `Callable`. The async timeout is a separate 30-second timer, not the servlet timeout, and
> its expiry is a 503 only if nothing has committed the response yet. `SseEmitter` pins a
> container thread per connection, so 200 SSE clients exhaust a default Tomcat pool and
> break every unrelated endpoint. On upload, `MaxUploadSizeExceededException` returning 500
> is a real bug, and `file-size-threshold=0` is the safe default because it never puts
> user bytes in heap. For outbound calls the staff-level point is that timeouts form a
> **chain budget** — a `readTimeout` longer than the caller's patience means the caller has
> already left and you have held a thread for the difference.

#### Further Reading

- [Spring Framework Reference — Async Requests](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html) — `Callable`, `DeferredResult`, `WebAsyncTask`, the executors, and the timeout configuration.
- [Spring Framework Reference — `SseEmitter`](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/return-types.html) — the emitter API, the timeout, and the `ResponseBodyEmitter` alternative.
- [Spring Framework Reference — File Upload](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-servlet/multipart.html) — the resolvers, the `MultipartFile` API, and the servlet-level configuration.
- [Spring Framework Reference — Multipart Forms in Controllers](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-controller/ann-methods/multipart-forms.html) — `@RequestPart`, the standard servlet multipart resolver, and the size-limit properties.
- [Spring Framework Reference — `RestClient` and `RestTemplate`](https://docs.spring.io/spring-framework/reference/integration/rest-clients.html) — the client-side contract, interceptors, and the error-handling story that Chapter 7's budget argument depends on.

---

### End of Volume 5

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Draw the full request lifecycle from socket accept to filter-chain unwind, and place
  handler resolution, adapter selection, `preHandle`, argument resolution, invocation,
  return-value handling, `postHandle` and `afterCompletion` on it — and say which of
  those steps are skipped on an async dispatch
- Explain what `maxThreads`, `acceptCount` and `maxConnections` each govern, what the
  symptom is when each is exceeded, and why raising `maxThreads` without sizing the
  downstream pools relocates the queue instead of removing it
- State the argument-resolver chain's behaviour for `@RequestParam`, `@PathVariable`,
  `@RequestBody`, `@RequestHeader`, `@CookieValue`, `@RequestPart` and `@ModelAttribute`,
  and name the two that fail silently
- Explain the `@ModelAttribute` mass-assignment finding — why a JPA entity's setters
  become a public write API with no allowlist and no validation — and name the fix and
  the build-level enforcement
- Distinguish what `preHandle`, `postHandle` and `afterCompletion` can each do, state
  that a `preHandle` veto means `afterCompletion` never runs, and place CORS, auth, MDC
  and metrics on the correct layer with the ordering rule that CORS sits above security
- State the `HandlerExceptionResolver` chain in order, explain why a filter's exception
  never reaches `@ControllerAdvice` and an interceptor's does, and describe what
  `server.error.include-stacktrace` defaults to and how it gets turned off in practice
- Explain why `@Valid` with a following `BindingResult` parameter lets invalid input
  reach your method, and distinguish `MethodArgumentNotValidException` from
  `ConstraintViolationException`
- Compare `Callable`, `DeferredResult`, `WebAsyncTask` and `StreamingResponseBody` by
  thread cost, and list the thread-bound state you lose the moment a handler returns one

### Coming in Volume 6 — Spring Data JPA & Persistence

Volume 5 ended at the edge of the database, with a command object, a `ProblemDetail` and a
transaction boundary set by a proxy. Volume 6 goes into what that boundary is actually
protecting: the persistence context, Hibernate's session, flush and dirty checking, fetch
strategies, the N+1 that every stack trace in a Spring Boot application eventually
contains, JPQL versus native queries, batching, connection-pool sizing, and the migration
story. It is where the `@ModelAttribute` finding from Chapter 3 gets its sequel — because
the entity you were told never to bind in a controller is exactly the object whose lazy
loading and dirty checking determine whether a read is one query or four hundred.

## Chapter 8 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). The **D** questions are the ones that separate a
senior answer from a staff one: they push on scale, cost, reversibility, and
organisational fit rather than API correctness.

### From Servlet to Spring MVC

**D1. Is raising `maxThreads` ever the right response to a latency wall?**

Only after you have established that the wall is not a downstream resource. The arithmetic
is unforgiving: at 200 threads and 50ms per request the ceiling is 4,000 req/s, and no
configuration change beats that without changing where the time goes. If the bottleneck is
a 20ms query against a 50-connection pool, 800 threads queue on 50 connections and you have
moved the queue from Tomcat (visible in a thread dump) to HikariCP (invisible). The right
order is: find the blocking resource, size the pool to the database's capacity, size
threads above that, and only then consider async. Raising the number is the reflex and it is
usually wrong.

**P1. A service's p99 latency goes from 80ms to 4s overnight. No deploy, no traffic
change, CPU at 20%. The thread dump shows 180 threads parked in `SocketInputStream`. What
is happening?**

One downstream call has degraded and it is now consuming the whole pool. At 200 threads with
most of them blocked on one socket, the arrival rate exceeds the service rate and the queue
builds. The dump is the evidence: threads are parked in a socket read, not in your code.
This is a capacity problem caused by a dependency, and the fix is a per-hop timeout derived
from the caller's budget, plus a circuit breaker so the failure is fast rather than
cumulative.

**T1. `maxThreads=200`, `acceptCount=100`. A 400th concurrent request arrives. What happens
to it?**

It is accepted at the socket because the Connector is still under `maxConnections`, but
there is no free worker, so it sits in the OS accept queue waiting behind up to 99 others.
The client sees latency, not an error — a p99 of seconds rather than a 502. The 301st
concurrent request, if it arrives when the backlog is full, gets the connection refused or
timed out by the OS, which a load balancer surfaces as a 502 with no application log entry
at all. That absence of a log line is the diagnostic signature of a `maxThreads` wall.

**S1. A PR adds a `Filter` that puts a trace ID in the MDC and clears it after
`chain.doFilter(...)`. What should the reviewer ask?**

Whether there is a `finally` around the call. Code after `chain.doFilter` runs only on the
normal path, so an exception anywhere downstream skips the removal and the trace ID leaks
into whatever the container thread serves next. The symptom is a log line with two trace
IDs and no way to tell which request produced which. The reviewer should also ask why it is
a hand-written filter rather than a `OncePerRequestFilter`, which handles the
`ERROR`/`ASYNC` double-dispatch that this one will also get wrong.

**T2. An `Interceptor.preHandle` returns `false`. Do the other interceptors' `preHandle`
methods run? Does `afterCompletion` run?**

No `preHandle` after the vetoing one runs, because the chain stops there. `afterCompletion`
runs only for the interceptors whose `preHandle` had already returned `true` — the vetoing
interceptor's own `afterCompletion` does **not** run. So an interceptor that opens a span or
a resource in `preHandle` and closes it in `afterCompletion` leaks it on every rejected
request, which is a resource leak proportional to your rejection rate.

**D2. Thread-per-request is described as a limitation. Is it?**

It is a limitation with a specific shape, not a general inferiority. It costs ~1MB of stack
per concurrent request and requires every slow operation to hold a thread for its full
duration, which caps throughput at `threads / latency` and makes the cost of a slow
dependency a throughput cost rather than a latency cost. What it buys is that ordinary code
is ordinary: a blocking JDBC call, a `synchronized` block, or a `ThreadLocal` works with no
cooperative scheduling, no context propagation and no blocking detector. The flip condition
is when the arithmetic stops working — when latency times concurrency exceeds what the
memory and the downstream pools can carry — and at that point the choice is not "use
reactive" but "reduce latency or add instances."

**T3. A `Filter` throws an exception. Does the application's `@ControllerAdvice` run?**

No. MVC's `HandlerExceptionResolver` chain runs inside `DispatcherServlet.doDispatch`, and a
filter is outside it. The filter's exception propagates to the container, which performs an
`ERROR` dispatch, and the advice is at best invoked for that error dispatch. An interceptor
is a different case: it runs inside `doDispatch`, so its exceptions do go through
`processHandlerException` and do reach `@ControllerAdvice`. This is the sharpest mechanical
difference between the two layers and it is a real interview discriminator.

### Handler Resolution & Adapters

**D3. With 400 handler methods, is Spring MVC's per-request mapping cost a scaling concern?**

No, and being able to say why is more valuable than the concern. The registry is built once
at context refresh and is read-only thereafter; lookup is a `PathPattern` tree walk (Spring
6) or a `RequestMappingInfo` map hit (5.x), which is sub-microsecond and effectively O(1).
The per-request cost that *is* real is argument resolution — a linear `supportsParameter`
walk per parameter — which is normally invisible and becomes visible with many parameters or
with an `Object`-typed unannotated parameter that falls through the entire chain into
`@ModelAttribute`. Redirecting a latency investigation away from mapping and toward
argument resolution and handler body is the valuable part of the answer.

**T4. A controller is `@Transactional` at the class level. What is in the `HandlerMethod`
that `RequestMappingHandlerMapping` registered?**

A reference to the **proxy** bean, not your class — `getBeanType()` returns the proxy type.
Because a JDK dynamic proxy implements only the interface and does not carry method
annotations, Spring unwraps to the user class with `ClassUtils.getUserClass` before reading
`@RequestMapping`. Practically this means class-level `@Transactional` on a controller
effectively forces CGLIB proxying, and any custom code that reflects over
`getBeanType().getMethod(...)` gets the proxy's view rather than yours — the `AnnotatedElement`
detail that catches out experienced candidates.

**P2. A controller works in every environment except one Docker image, where every
`@PathVariable` fails with `MissingPathVariableException`. What is the difference?**

The `-parameters` compiler flag. `@PathVariable Long id` with no explicit name reads the
parameter name from bytecode; without `-parameters` it is `arg0`, resolution fails, and the
exception surfaces as a 500. Spring Boot's build plugins add the flag by default, so the
module built by hand, the legacy `javac` script, or the Android build is the one that
differs. The fix is to name every `@PathVariable` and `@RequestParam` explicitly in a public
API — three characters, and it removes an entire class of environment-dependent failure.

**S2. A reviewer sees a controller method with 14 parameters. What should they say?**

That the endpoint is doing too much, and that the per-request cost of argument resolution
is real even though the mapping is not. Each parameter is a `supportsParameter` walk down a
resolver list, and the argument usually *should* be a single command object. The deeper
review point is that a 14-parameter method is a sign the use case has more than one shape
that hasn't been modelled, and the parameters are where that shows up.

**D4. Functional routing vs annotated controllers — a migration worth doing?**

Only for a new, self-contained API with few routes and no dependence on the annotated
machinery. It removes classpath scanning, removes the proxy subtlety from Chapter 2, and
tests without a context. What it does not give you is `HandlerInterceptor`,
`@ControllerAdvice`, argument resolvers, or method-level security on the service — and in
an existing codebase, global `@ExceptionHandler` advice is almost always load-bearing, which
means functional routing forces you to restructure error handling per router. The
migration cost is therefore in the error-handling convention, not in the handlers, and that
is the number to put in front of a decision-maker.

### Controllers & Data Binding

**P3. A security review flags a customer escalating themselves to `ADMIN` by adding a query
parameter. What is the mechanism, and what is the durable fix?**

`@ModelAttribute` bound onto a JPA entity. Spring instantiates it with the no-arg
constructor and calls a setter for every request parameter whose name matches a writable
property — and JPA *requires* setters for `role`, `balance` and every other field, so they
are all bindable. With no `@Valid` and no allowlist, `POST /account?role=ADMIN` binds the
role and the attached-entity save flushes it. It is CWE-915, Over-Mass-Assignment. The
immediate fix is a dedicated command record bound with `@Valid @RequestBody`; the durable
fix is an ArchUnit rule banning any `@Entity`-annotated type in a controller signature, so
the finding cannot be reintroduced by a well-meaning PR.

**T5. `POST /orders` with a JSON body missing a required field returns 200 and a persisted
order. The controller has `@Valid @RequestBody CreateOrder cmd, BindingResult errors`. What
happened?**

Because a `BindingResult` parameter follows, Spring has somewhere to put the errors, so it
populates it, does not throw, and **invokes the method anyway**. The method never checked
`hasErrors()`, so the incompletely-populated `CreateOrder` went to the service and was
persisted. `@Valid` is a report generator, not a gate — the method signature decides
whether the report becomes a rejection. This is the single most valuable behaviour in the
volume and the most common silent data-integrity bug in Spring codebases.

**S3. A PR adds `@ModelAttribute` to a JPA entity parameter and an `email` field to the
entity in the same PR. What is the review comment?**

That the second change made an existing parameter a mass-assignment surface. The
`@ModelAttribute` was harmless when the entity had two bindable fields; adding a third with
a setter is what turns it into a write API. This is the shape of the finding: entity
changes and web-layer changes are individually innocuous and jointly a vulnerability, which
is precisely why "no `@Entity` in a controller signature" is a build rule rather than a
review comment.

**D5. Is `{id:[0-9]+}` good practice on a path variable?**

It is routing-level discrimination, not validation, and the difference has consequences. It
produces a **404** for a malformed id where a **400** is correct, which makes the error
contract inconsistent across the API. It also puts a parsing assumption into the URL space,
where changing it later is a routing change rather than a validation change. It earns its
place only when the traffic profile is genuinely dominated by misses against a very large
table, where rejecting in the router avoids a lookup. The default should be `{id}`, parse
the value, and return a `ProblemDetail` 400.

**T6. A client sends `Accept: text/plain` to an endpoint declared
`produces = "application/json"`. What is the response?**

406 Not Acceptable. `produces` is a condition on the mapping, not a cast on the result: the
handler simply did not match, and `HttpMediaTypeNotAcceptableException` is resolved to 406
by `DefaultHandlerExceptionResolver`. The popular mental model — "produces means this
method returns JSON" — is wrong; the return type and `@ResponseBody` decide the body, and
`produces` decides whether the request was eligible to reach the method at all.

**P6. Can a controller method have two `@RequestBody` parameters? What about
`@RequestPart`?**

Two `@RequestBody` parameters: no. The body is a single stream, consumed by the first
`RequestResponseBodyProcessor`; the second gets an empty body or an exception depending on
the path. `@RequestPart` is the escape hatch — with
`consumes = MULTIPART_FORM_DATA_VALUE`, multipart does support several parts, and each
`@RequestPart` reads one. Omitting the `consumes` declaration gives a 415 before the
method runs.

### Filters, Interceptors & CORS

**P4. Cross-origin requests work for `GET` but every `POST`, `PUT` and `DELETE` fails in the
browser with a CORS error. `GET` and the rest look identical server-side. What is
happening?**

The preflight. Any non-simple method or header triggers an `OPTIONS` preflight, and if that
preflight is rejected — most commonly by Spring Security's filter chain, which authorises
before CORS answers — the browser reports a CORS error and the real request is never sent.
Simple `GET`s with no custom headers skip the preflight, which is why they work. The fix is
ordering: CORS above security, either by registering `CorsFilter` with a lower order or by
`http.cors(withDefaults())` so both layers share one `CorsConfigurationSource`.

**D6. A codebase has `@CrossOrigin` on some controllers and `addCorsMappings` globally. A
team proposes standardising. What is the actual cost of the migration, and what is the
alternative?**

The cost is not the annotations — it is the error-handling and security coupling each
mechanism carries. `@CrossOrigin` is per-handler and easy to forget on a new endpoint, which
is a silent failure rather than a loud one. `addCorsMappings` is global and easy to
over-broaden. The migration is mechanical; the design decision is whether CORS should be
owned by the same place as security configuration, because both need to agree about
preflight and credentials. The genuinely better answer is a single
`CorsConfigurationSource` bean referenced by both MVC and Spring Security, plus a build
check that fails on any `@CrossOrigin` — which removes the "works on `/api/users` but not
`/api/orders`" class of bug by construction.

**T7. An interceptor counts every request for a metric. The number is roughly double the
actual request count. Why, and what is the fix?**

Either the `ERROR` dispatch or the `ASYNC` dispatch is re-entering the chain. The container
re-dispatches the same request to the same components on both paths, and a hand-written
filter or an unguarded interceptor runs again. A filter should be a `OncePerRequestFilter`;
an interceptor should check
`request.getAttribute(HandlerMapping.BEST_MATCHING_PATTERN_ATTRIBUTE)` or count only in
`afterCompletion` with a latch. The other candidate is that the counter is incremented in
`preHandle` and the method is entered twice by a client retry — check for that before
changing the code.

**S4. A PR adds a `Filter` that reads the request body and wraps it so it can be read
twice. What should the reviewer check?**

That it only wraps the body for the cases that need it, and that it handles the form and
multipart content types separately — `getInputStream()` on a `application/x-www-form-urlencoded`
request is empty, and the body has already been consumed by `FormContentFilter` for PUT and
PATCH. Also whether the wrapped stream is closed, and whether it bypasses the
`ContentCachingRequestWrapper` already in the chain, which would silently disable it for
every downstream consumer.

**D7. Where should MDC/trace-ID propagation go, given that `SseEmitter` and
`Callable` handlers run on other threads?**

The filter, for the setup, plus explicit propagation for the async bodies — because a
filter alone gives you the trace ID on the original thread and nothing on the executor
thread. The concrete mechanism differs by mechanism: a `TaskDecorator` on the async
executor for `Callable`, and capturing into local variables before the `return` for
`DeferredResult`, where there may be no executor at all. The staff-level point is that
trace propagation is not a logging concern, it is a debugging-infrastructure concern, and
losing it on exactly the slowest and most expensive requests is the worst possible time to
lose it.

### Exception Handling

**P5. A malformed request returns `{"timestamp":..., "status":400, "error":"Bad Request",
"path":...}` while a domain exception returns a clean RFC 7807 `ProblemDetail`. Same
endpoint, two shapes. Why?**

The malformed request never reaches the controller, so no `@ExceptionHandler` fires.
`MissingServletRequestParameterException` is resolved by `DefaultHandlerExceptionResolver`,
which maps the status and calls `sendError`, handing the body to Boot's
`BasicErrorController` at `/error`. The fix is to handle `MethodArgumentNotValidException`
and `ErrorResponseException` in a global advice so they also return `ProblemDetail`, or to
replace `BasicErrorController` wholesale with an `ErrorController` returning
`ProblemDetail` for everything.

**S5. A PR adds `@ExceptionHandler(Exception.class)` to a controller to "handle unexpected
errors nicely". What should the review say?**

That it silently disables every global `@ControllerAdvice` handler for that controller,
because controller-local handlers always win. A `PaymentDeclinedException` handler in the
global advice will now never fire for that controller, and the generic handler will
serialise it as an internal error. The correct placement for a catch-all is the global
advice, where it is one deliberate decision, not one per controller that quietly
re-shadows the last one someone wrote.

**D8. Is `server.error.include-stacktrace: always` in a dev profile a security finding or a
configuration nit?**

A finding, and the one to bring to a design review. The default is `never` precisely because
a stack trace is a reconnaissance payload: internal class names, package structure, library
versions, and often connection strings in the message. The reason it reaches a shared
environment is organisational — the `dev` profile is selected by a staging or canary
pipeline because those environments wanted verbose logs, and nobody audited which profiles
are reachable where. The durable fix is a correlation ID returned in a header and written to
the logs, plus a config-lint rule that fails the build on any non-`never` value outside a
strictly local profile.

**T8. A controller's `@PostConstruct` queries a table and throws. Does its own
`@ExceptionHandler` run?**

No. Handler methods are looked up on a controller *instance*, and this failure happens while
creating that instance — before the `HandlerMethod` is resolved and before the invocation
`try` block MVC wraps. The exception surfaces as a `BeanCreationException` on the 500 path,
frequently without being attributed to any request handler in the logs. The general
statement: MVC's exception handling covers the handler *invocation*; bean creation,
`@PostConstruct` and proxy creation all sit before it.

**D9. A team has two error response shapes and wants to unify on `ProblemDetail`. What is
the migration actually like?**

Retrofitting is a client-facing migration, not a refactor. Every client parsing the old shape
must change, which means coordination with consumers you may not control, a deprecation
window, and a dual-shape period where the service must support both. The three properties
worth getting right the first time because they are the ones clients branch on are a stable
machine-readable `type` URI (not prose), a `status` that agrees with the HTTP status, and a
`detail` that is safe to log. The organisational version: this is exactly the kind of
decision that is cheap before the first client and expensive after, which is the argument
for making it during a standards pass rather than during an incident.

### Validation

**D10. Where does validation belong, and what is the concrete cost of getting it wrong?**

Shape at the edge, invariants in the domain. The cost of putting everything at the edge is
that the service layer is callable from a message consumer, a scheduled job, a data-fix
script, a JPA callback or a test, and **none of those get the check** — the rule "an order
cannot ship before it is paid" is a statement about orders, not about HTTP. The cost of
putting everything in the domain is different: `@Valid` returning a `ConstraintViolationException`
with HTTP-flavoured messages makes the domain untestable without a servlet, and clients get
400s for business-rule violations that should be 409. Duplicate the cheap shape checks at
the edge; enforce every invariant in the domain.

**P7. A PR adds a `BindingResult errors` parameter to six controller methods to return
richer validation errors. Five of them check `hasErrors()`. What is the review for the
sixth, and what is the process fix?**

The sixth silently turns a 400 into a 200 with a corrupt record persisted, because the
invalid object is fully bound and passed to the service regardless of what happened to the
`BindingResult`. The process fix is structural: a shared helper that both checks and
serialises, so the correct behaviour is the path of least resistance, plus a test asserting
every 4xx response from the API has the expected shape.

**T9. `@Validated` is on the controller class and `@Size(min = 3)` is on a `@RequestParam`.
A request with `pageSize=1` returns 500. Why, and what's the fix?**

The parameter constraint is enforced by a CGLIB proxy created by `@Validated`, not by
argument resolution, so it throws `ConstraintViolationException` — which has no default
status mapping and lands on the 500 path. The input is plainly bad and the response is
plainly wrong. The fix is a `@ExceptionHandler(ConstraintViolationException.class)`
returning a 400 `ProblemDetail`, built from `ex.getConstraintViolations()`.

**D11. Validation groups, or one DTO per operation?**

Groups when the variants share most of their fields and differ in a few constraints — a
create/update pair, or a create/cancel pair. Separate types past about half the fields
differing, or whenever a constraint's applicability is non-obvious. The deciding factor is
not the class count but the failure mode: a constraint whose group is not passed at a call
site **silently does not run**, and no error tells you. That is the condition under which
the extra classes earn their cost.

### Async, Streaming & Upload

**D12. An endpoint returns a `Callable` and the result is produced by a JMS listener. What
goes wrong, and at what scale?**

`Callable` pins a task-executor thread for the whole computation, so every in-flight request
holds a thread while waiting for a message that may take seconds. The async executor
exhausts, requests queue, and at the 30-second async timeout they fail with
`AsyncRequestTimeoutException` — while the messages themselves arrived on time. The fix is
`DeferredResult`, which holds no thread while waiting and needs one only at the moment
`setResult` is called. The scale marker: with 1,000 concurrent long-poll clients, the
executor is fully consumed and every other async endpoint is affected.

**T13. Inside a `Callable`, `SecurityContextHolder.getContext().getAuthentication()` is
null and the MDC is empty. Why?**

The request thread returned to the pool when the handler returned the `Callable`; everything
thread-bound went with it. `SecurityContextHolder` uses a `ThreadLocal` by default, and MDC
is a `ThreadLocal` by definition. Request *attributes* survive the async cycle, which is why
storing the principal in a request attribute works and reading the security context does not.
The fix is a `TaskDecorator` on the async executor, or capturing the values into local
variables before the return.

**P8. A service deployed fine for six months, then a batch of 20,000 concurrent SSE
subscribers connects and every unrelated endpoint starts timing out. Explain.**

Each `SseEmitter` holds a container thread for the life of the connection. At Tomcat's 200
default threads, 200 SSE clients consume the entire request pool and nothing else can be
served. It worked before because real subscriber counts were tens, and the threshold that
matters is *concurrent connections*, not total. The mitigations, in order: set the emitter
timeout to 0 so the container does not reap connections, verify the connector supports it,
and accept that at real scale the answer is a dedicated connector with its own executor, a
dedicated thread, or moving SSE termination to a gateway that already holds connections.

**S6. A PR raises `spring.servlet.multipart.max-file-size` to 2GB to support video
uploads. What should the reviewer say?**

That this keeps the request open and the buffer allocated for the duration of a multi-
minute upload, across a thread pool that is also serving everything else. The request
should be short: a client requests an upload slot, uploads directly to object storage with
a presigned URL, and calls back when finished. If the upload must transit the application,
stream it to storage rather than buffering, and size the limit against the actual
requirement rather than the largest file anyone has ever asked for.

**D13. Is it worth introducing `WebClient` in a thread-per-request application?**

Generally no, and the reason is worth stating precisely: the container is still giving you
one thread per request, so `.block()` on a reactive client inside a servlet controller is
blocking throughput with reactive complexity and none of the benefits. `WebClient` earns
its place in three situations: the application is already reactive, one endpoint's latency
is dominated by a sequential chain of downstream calls that should be a fan-out, or a large
fan-out is genuinely I/O-bound. The organisational cost is real too — a different error
model and a different interceptor contract, so a codebase mixing both clients ends up with
two error-handling conventions and no clear default.

**P9. A request to a downstream service hangs for 30 seconds and takes down a fifth of the
thread pool. The client had given up after 2 seconds. What is the configuration error?**

`readTimeout` (or its absence) is longer than the caller's patience. The timeout has to be
derived from the caller's remaining budget, not chosen per client as a round number, and the
deadline should be propagated as a header so downstream hops do the same arithmetic. The
failure mode is specific and worth naming: because the timeout exceeds the caller's
deadline, the caller has already gone, and the thread is held for the difference — so a slow
dependency becomes a throughput problem rather than a fast failure.

**T14. A file exceeds `max-file-size`. The client gets 500. What is wrong, and what else
should be checked?**

The status code: `MaxUploadSizeExceededException` is client input being too large and should
be 413, so it needs an explicit `@ExceptionHandler`. Also check whether the exception
reaches the resolver chain at all — in some container configurations the size limit is
enforced at the connector and surfaces as a generic 500 before Spring sees it, in which case
the limit must be raised at the connector too. And confirm `file-size-threshold` is `0`
rather than a large value, since a large threshold puts user-uploaded bytes in heap.

**D14. Your API's error body is `{"message": "..."}`. Six months after launch, three teams
depend on it. Is migrating to `ProblemDetail` worth it?**

Yes, and the reason is that the error body is a contract, which means every change is a
coordinated release with consumers you may not control. The migration is a deprecation
window, a dual-shape period, and a compatibility test suite — all of which is why it is
cheaper to introduce before the first client. If it is genuinely too late, version the
error shape explicitly rather than changing it in place, and fix the three properties
clients actually branch on: a stable machine-readable `type`, a `status` that agrees with
the HTTP status, and a `detail` that is safe to put in a log.

**P10. A request is rejected by an interceptor with a 401. A request rejected by a filter
with the same 401 gets a completely different response body. Why?**

The filter's rejection happens outside `DispatcherServlet`, so the exception propagates to
the container, which performs an `ERROR` dispatch rendered by `/error` and
`BasicErrorController`. The interceptor's rejection happens inside `doDispatch`, so
`processHandlerException` runs, the `@ControllerAdvice` chain is consulted, and a
`ProblemDetail` is produced. Same status code, two response contracts, decided entirely by
which layer rejected the request.

**D15. A team wants to move from a thread pool to a reactive stack because "we ran out of
threads." Is that the right diagnosis to act on?**

Rarely, and the diagnosis is the thing to challenge first. Running out of threads is a
*symptom* with three distinct causes, and only one of them is fixed by going reactive. If
requests are blocked on a database, reactive does not help — you still need a connection
per in-flight operation, and now you also have a connection per blocked event loop thread.
If requests are blocked on *each other* because of a lock or a synchronized block,
reactive makes it worse, since cooperative scheduling requires non-blocking code throughout.
If requests are blocked on slow network I/O with short CPU bursts, then reactive genuinely
helps, because it decouples thread count from concurrency. The correct first step is always
to read a thread dump and classify where the threads are actually parked; "we need
reactive" is a decision made before the diagnosis is confirmed, and it is close to
irreversible once the codebase and the team's operating model have changed around it.

**D16. If `WebApplicationContext` and the root context both exist, is it worth collapsing
them?**

Usually yes, and the reason is not performance. Two contexts mean two component scans, two
`@ControllerAdvice` searches, a class of "why can't I inject this" bugs that has nothing to
do with injection, and a parent/child visibility rule that every new joiner has to learn.
Collapsing them — which Boot does by default — removes an entire category of confusion. The
flip condition is genuine multi-servlet or multi-dispatcher setups, where a separate child
context is how you give one servlet a different set of view resolvers or message converters.
The decision should be deliberate and written down, not inherited from a legacy XML config
nobody has deleted.

**D17. The web layer has grown to 40 controllers. Is splitting by bounded context the right
refactor?**

The split is reasonable but it is not where the value is, and the cost is non-trivial: a
split means a second package, a second set of conventions, and — if done by annotation
scoping — a rule about which advice applies where that someone has to maintain. The value
is that each context has one obvious home, and that "which controller handles billing" has
an answer you can read off the directory. The higher-value work is usually smaller: naming,
the command-object boundary, and the rule that entities never appear in a signature. If the
team does the split, the thing to establish is the shared `WebMvcConfigurer` conventions —
otherwise the split just distributes the inconsistency into more directories.

**D18. Is a 429 "rate limit exceeded" response a web-layer concern or a gateway concern?**

Both, and the split matters more than the choice. A gateway is the right place for a coarse
per-IP or per-token limit, because it can reject without consuming a request thread, and it
protects the service from traffic the service never sees. The application is the right
place for a limit that depends on business state — per-tenant quotas, per-plan limits, a
customer's actual concurrent job count — because only it knows the plan. The anti-pattern
is a per-IP limit in the application, which duplicates what the gateway already does and
spends a thread to do it. If you put it in both places, agree the ordering, or the same
request gets two different limit errors depending on which one trips first.

**P11. An endpoint that was 40ms becomes 900ms after adding `@PreAuthorize` to the
controller class. No database or network change. What is the mechanism?**

Method security is a proxy on the bean, and its evaluation cost is whatever the
`AuthorizationManager` does. The common causes are a `PermissionEvaluator` or a
`RoleHierarchy` that loads permissions from the database on each call, a
`@PostAuthorize` that dereferences a lazy association, or SpEL that walks a large object
graph. Because it reads as "free declarative security" and sits outside the method body, it
does not appear in the endpoint's own profiling and is easy to miss. The diagnostic is to
time the security evaluation separately from the handler, or to read a dump and look for
threads in the authorization path rather than in your code.

**D19. Would you put body-size enforcement in a filter, in the controller, or at the
connector?**

At the connector, with the filter and the controller as secondary layers for different
concerns. The connector can reject a request before the body is fully read, which is the
only place you genuinely avoid buffering an oversized upload — and that is the difference
between "we rejected it" and "we buffered 2GB and then rejected it". The filter is the right
layer for a per-route policy and for streaming. The controller is the right layer only for a
business rule ("this plan allows 50MB"), because only it knows the plan. The staff-level
point: the three layers have very different cost profiles when a client lies about size or
sends a slow body, and only the connector can act before the bytes arrive.

**S7. A reviewer sees `res.setStatus(401)` inside an interceptor's `postHandle`. Why is that
a bug?**

Because for a `@ResponseBody` handler the response is already committed by the time
`postHandle` runs — the handler wrote the body inside the invocation, before returning. Any
attempt to change the status or headers at that point throws `IllegalStateException`. This
is why `postHandle` is close to dead code in a modern JSON API, and why anything that needs
to alter the response has to happen in `preHandle` or inside the handler — or in a
`ResponseBodyAdvice`, which is the only component positioned before the bytes are written.




