---
title: "The Database Complete Deep-Dive"
volume: 9
series: "REDIS & CACHING STRATEGIES"
subtitle: "Study & Interview Mastery Guide"
---

# The Database Complete Deep-Dive

**Study & Interview Mastery Guide**

## About This Guide

This is an eleven-volume study guide to databases, written for engineers who already know
how to build a backend service and are preparing for senior and staff-level interviews. It
is not a tutorial. Nothing here explains what a key-value pair is.

The organising question of every chapter is the same one a staff engineer gets asked in a
real design review: **not "what does this do", but "why would a team choose this, what does
it cost, when does it break, and how expensive is it to undo?"** Redis is treated as the
visible surface of a specific and unusual machine — a single-threaded command loop over
in-memory data structures — and the notes always go down to that machine, because that is
the layer where production incidents actually live. `maxmemory-policy allkeys-lru` is not a
setting; it is a promise about what happens to your data at 3am when the box fills, and
whether anyone on the team can state that promise is the whole game.

Volume 9 is the volume where the interesting failures are not slow queries but *wrong
answers at a specific instant*. Everything else in this set degrades gracefully: a bad plan
is slow, a lock is waited on, a replication lag is visible. A cache failure is a user who
sees yesterday's balance, a database that takes 200 connections of load in 40ms because
every instance of a service missed the same key at the same second, or a bot scanning for
`user_id=999999999` that turns your primary into a spinning wheel. The three classic cache
bugs — stampede, penetration, avalanche — are each about four lines of application code, and
each produces a production outage that looks like a database problem and is not one.

The staff-level theme running through the volume is **where a cache's abstraction stops
paying for itself**. Cache-aside is a genuinely good default and it is right far more often
than not, but it has a cost most teams never write down: a miss is always a double round
trip, an eviction policy is always a silent write of `DEL` to somebody's data, and a TTL is
always a staleness bound nobody chose. Knowing where those costs stop being acceptable —
and being able to say it in a design review, in numbers — is the difference between someone
who has configured Redis and someone who can be trusted with the layer that everything else
in the estate depends on.

### How This Guide Is Structured

Every concept is presented on the same template:

```
Definition → Internal Behavior → Code Example → Real-World Example →
When to Use → When NOT to Use → Scaling & Failure Modes → Interview Traps →
Production Example → Interview Questions
```

Not every chapter uses every slot — forcing a "Real-World Example" onto the cluster hash
ring produces filler. The template is a completeness checklist, not a template to fill.

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

### Continuing From Volume 8

| Volume | Coverage |
| --- | --- |
| Volume 1 | Fundamentals & the Relational Model — storage engine vs query engine, pages and heaps, the model itself, keys and constraints, normalisation, the algebra, scaling lenses |
| Volume 2 | SQL — DDL, DML & Constraints — schema evolution, types and precision, keys, `CHECK`, DML, `NULL` and three-valued logic, views |
| Volume 3 | SQL — Queries, Joins, CTEs & Window Functions — evaluation order, join semantics, anti-joins, subqueries, recursion, windows, set operations |
| Volume 4 | Indexes, Query Planning & Execution — B+ trees, index types, leftmost prefix, access paths, join algorithms, `EXPLAIN`, statistics |
| Volume 5 | Transactions, Isolation Levels & Concurrency — ACID precisely, concurrency anomalies, isolation levels, MVCC, locks, deadlock, 2PC |
| Volume 6 | Schema Design, Partitioning & Scaling — key choice, relationships, temporal data, partitioning, sharding, replication, pooling |
| Volume 7 | PostgreSQL — process model, storage, MVCC in practice, types, planner, autovacuum, operational surface |
| Volume 8 | MySQL — InnoDB, the clustered index, the undo log, next-key locking, RR vs RC, replication |
| Volume 9 (this book) | Redis & Caching Strategies — data structures, cache-aside and its relatives, eviction, the three classic bugs, persistence, cluster |
| Volume 10 | NoSQL & Distributed Stores — CAP precisely, consistency models, Cassandra, DynamoDB, MongoDB, choosing |
| Volume 11 | S3, Elasticsearch & the Interview Bank — object storage, storage classes, inverted index, store selection, the consolidated bank |

### Table of Contents — Volume 9

- Chapter 1 — What Redis Actually Is
- Chapter 2 — Data Structures & When Each One Fits
- Chapter 3 — Caching Strategies
- Chapter 4 — Eviction Policies & Memory
- Chapter 5 — The Three Classic Cache Bugs
- Chapter 6 — Invalidation & Consistency
- Chapter 7 — Persistence & Durability
- Chapter 8 — Replication, Cluster & Sharding
- Chapter 9 — Interview Scenario Bank

---

# Part 9 — Redis & Caching Strategies

## Chapter 1 — What Redis Actually Is

### 1.1 The Answer Everybody Gives, and Why It Is Wrong

Every interview answer starts here: *"Redis is an in-memory key-value store."* It is the
same class of answer as *"a database stores data so you can retrieve it."* It is not
wrong, but it is the answer that scores zero, because it describes the storage medium and
skips the two things that generate every Redis incident: **the single-threaded command
loop**, and **the fact that eviction is a write**.

The useful decomposition is four layers, and Redis is all four at once:

```text
┌─────────────────────────────────────────────────────────────────┐
│  CLIENT / PROTOCOL LAYER                                       │
│  RESP — a binary-ish line protocol on a TCP socket (or TLS,     │
│  or a Unix socket). No connection pooling server-side;          │
│  one TCP connection = one ordered request/response stream.      │
├─────────────────────────────────────────────────────────────────┤
│  COMMAND / DATA STRUCTURE LAYER                                │
│  Strings, hashes, sets, sorted sets, streams, plus modules.     │
│  This is NOT a blob store. The type decides the complexity of   │
│  every operation you are allowed to express.                    │
├─────────────────────────────────────────────────────────────────┤
│  EXECUTION LAYER — THE IMPORTANT ONE                            │
│  One thread. Read a command, look it up in a dispatch table,    │
│  run it against in-memory structures, write the reply.          │
│  No locks. No context switches. No priority inversion.          │
│  Also: no way to yield, so one slow command stalls every        │
│  other client in the instance.                                  │
├─────────────────────────────────────────────────────────────────┤
│  MEMORY / DURABILITY LAYER                                     │
│  The whole dataset lives in RAM. maxmemory bounds it.           │
│  When the bound is hit, the eviction policy writes DELs.        │
│  RDB and AOF are optional, off-by-default-on-a-cache, and are   │
│  not consulted during eviction.                                 │
└─────────────────────────────────────────────────────────────────┘
        ▲ all four are invisible from `GET`/`SET`
```

The consequence that matters most for the rest of this volume: **Redis's concurrency model
is a bet, and the bet pays off spectacularly until a single command is expensive.** The
bet is that in-memory operations are so cheap (nanoseconds) that serialising them is
cheaper than locking them. That is true for `GET`, `SET`, `SADD`, `INCR` and `ZADD`, and it
is *also* true, in a way that surprises people, for moderately large collections — a
`HGETALL` on a 50,000-field hash is a few milliseconds of memcpy, and a few milliseconds is
fifty times the budget you had. The bet fails for `KEYS`, for `HGETALL` on a megabyte
hash, for a Lua script that loops a million times, and for `SORT` on a 500,000-element list.
In all four cases the single thread is doing work that would be invisible in a threaded
server, and every other client is watching their p99 go up in lockstep.

> **MUST REMEMBER**
>
> Redis executes commands on one thread. That is why `GET` is a few microseconds with no
> lock and no syscall on the critical path — and it is also why a command that takes
> 40 milliseconds is a 40-millisecond outage for every client of that instance. The
> design is only safe if you are disciplined about which commands you are allowed to run.

### 1.2 The Single-Threaded Command Loop, and Why It Is an Advantage

The execution layer is genuinely one thread. It reads a complete command off the socket
input buffer, dispatches on the command name, calls the C function, appends the reply to
the client's output buffer, and loops. There is no lock acquisition on any data structure
and no thread to contend with, which means:

- **No lock contention, ever.** A `GET` does not contend with another `GET`. There is no
  convoy, no priority inversion, no thundering herd of threads on a mutex. The latency of
  a `GET` is the latency of a `GET` whether 1 or 10,000 clients are connected, because the
  only variable is how many commands are queued ahead of yours.
- **No context switching.** The thread stays in L1/L2 cache. There is no scheduler
  preemption mid-`INCR`, so a counter increment cannot be interleaved.
- **Atomicity for free.** Because a command runs to completion before the next begins, every
  single Redis command is atomic. `INCR`, `SPOP`, `LPUSH`, `SADD`, `EXPIRE` — all atomic
  without a lock, a transaction, or a compare-and-swap. This is the property that makes
  `INCR` the correct counter implementation and a `GET`/`INCR`/`SET` round trip the wrong
  one.
- **Cheap fork snapshots.** `BGSAVE` calls `fork()`, which on Linux is a copy-on-write
  page-table clone. On a 64 GB dataset that is a few milliseconds of setup and near-zero
  immediate cost — a luxury no large in-process database can offer, and the reason RDB
  snapshots are viable at all.

> **INTERVIEW TRAP — "SINGLE-THREADED MEANS IT CAN'T SCALE / IT'S A BOTTLENECK"**
>
> This is the wrong conclusion from a right premise, and it is worth knowing exactly where
> the reasoning breaks. The single thread is the *command execution* thread, and command
> execution is a memcpy and a few pointer chases for the operations you should be running.
> Measured throughput on a modern instance is on the order of 100,000+ operations per
> second per core for small commands, which is far past the point where a typical database
> *client* pool can even generate the traffic. The bottleneck moves long before the single
> thread saturates: it moves to your connection pool, to the network round trips, to the
> amount of data you are moving per command, or to the tail latency of a single large
> command. Volume 6 covers the general connection-pooling and scaling material; the Redis-
> specific point is that the answer to "Redis is slow" is almost never "add cores" — it is
> "find the command that is doing too much".

The honest caveats to the single-thread argument, which a staff-level candidate should
volunteer rather than wait to be asked:

- **A single command cannot be interrupted or preempted.** A 10-second Lua script is a
  10-second outage. There is no `timeout` on `EVAL` that preempts it. The only mitigation
  is `SCRIPT KILL`, which only works if the script has not performed a write (Redis will
  refuse to kill a script that already wrote, and that refusal exists to preserve
  consistency).
- **Blocking commands have explicit semantics.** `BLPOP` blocks the *client*, not the
  server, which is why `BRPOPLPUSH` is safe but `BLPOP` on the same key from a thousand
  clients is a thousand clients parked. Bounded variants (`BRPOP` with timeout) still hold
  the connection, and a connection held is a client in your pool that is not serving
  anything else.
- **The loop has no fairness mechanism.** A client with a 10,000-command pipeline can
  monopolise the queue. Redis 6+ has `CLIENT PAUSE` and per-client time limits, but the
  default is still first-in-first-out on the input buffer.
- **The single thread makes fragmentation and GC irrelevant but makes memory *shape*
  critical.** No GC pauses means predictable latency, and a `mem_fragmentation_ratio` of
  1.8 means you have paid 60% over your data for allocator slack. This is a different set of
  pathologies from a JVM, and it is covered in Chapter 4.

### 1.3 I/O Threading Is Separate, and the Distinction Matters

Since Redis 6, the server can use additional threads — and they are not the command
thread. The split is:

```text
                    ┌───────────────────────────────────────────┐
   network ────────▶│ I/O THREADS  (io-threads N)              │
                    │  • readQueryFromClient — parse RESP off    │
                    │    the socket, hand buffers to the main    │
                    │    thread, write replies to sockets        │
                    └───────────────┬───────────────────────────┘
                                    │  (a) pre-6.0: read+write only
                                    │  (b) 6.0+: also write the
                                    │      read query to a queue
                                    ▼
                    ┌───────────────────────────────────────────┐
                    │ MAIN THREAD  — still exactly one           │
                    │  • execute every command                   │
                    │  • run eviction, expire, lazy free         │
                    │  • run persistence forks                   │
                    │  • run replication                        │
                    └───────────────────────────────────────────┘
```

The precise statement, which is the one to give: **I/O threads never execute a command.**
In Redis 6.0 they read from and write to sockets, which means a slow client with a
congested socket no longer stalls the whole server. In Redis 6.0 and later they may
additionally write the *parsed query buffer* to a lock-free queue for the main thread, so
the main thread's read path shrinks. Either way, `GET` still executes on one thread.

The practical guidance that follows:

- `io-threads 1` is the default, which means no I/O threading at all. On a workload with
  high client counts and large payloads, `io-threads 4` to `io-threads` equal to the number
  of *physical* cores is a real, measurable win.
- It is not a win for small commands on a low client count. If your workload is 10,000
  `GET`s of 200 bytes from 4 threads, the bottleneck is the main thread and I/O threads add
  synchronisation overhead for nothing.
- There is a real gotcha: enabling I/O threads with `io-threads-do-reads no` (the default
  in 6.0) only helps the write path. Many production guides set `io-threads 4` and leave
  `io-threads-do-reads` at `no` and then conclude "I/O threading didn't help" — it was
  only ever going to help the other direction.

```bash
# What the server thinks it is doing right now
redis-cli CONFIG GET io-threads io-threads-do-reads
redis-cli INFO threads
#   io_threads_active:4
#   threads_active:5        ← 4 I/O + 1 main

# Per-command latency, which is where a stampede or a big HGETALL shows up
redis-cli INFO commandstats
# cmdstat_get:calls=48201104,usec=9120441,usec_per_call=0.19
# cmdstat_hgetall:calls=4112,usec=8930122,usec_per_call=2171.20  ◀ 2.17 ms average
redis-cli SLOWLOG GET 10
redis-cli SLOWLOG LEN
```

`usec_per_call` is the number to look at. A `GET` at 0.19µs is doing its job. An
`HGETALL` at 2,171µs is a single command eating the same time as eleven thousand `GET`s,
and it is invisible in a p99 that only counts requests.

### 1.4 Every Command Is a Round Trip

The second load-bearing fact about the architecture is that Redis speaks a request/response
protocol on a persistent connection. There is no server-side connection pool, no
multiplexed multiplexing, no batching unless you ask for it. One `GET` is one write of a
12-byte request and one read of a 12-byte reply, and the round trip — kernel, NIC, your
container's veth, the other side's container's veth, TLS if you are using it — is paid
**once per command**.

Numbers to make this concrete, on a typical same-host, same-container-network client:

| Transport path | Typical RTT | 1,000 commands, sequential | Pipelined |
| --- | --- | --- | --- |
| Loopback (`127.0.0.1`) | ~40–60 µs | 40–60 ms | ~2–4 ms |
| Same host, different container | ~70–120 µs | 70–120 ms | ~3–6 ms |
| Same datacentre, 1 GbE | ~150–300 µs | 150–300 ms | ~10–20 ms |
| Cross-region | 20–40 ms | 20–40 **seconds** | 20–40 ms for all 1,000 |

Read the last row twice. **A cross-region client doing 1,000 sequential `GET`s takes longer
than the timeout on your HTTP request, by a factor of twenty, and pipelining turns 20
seconds into 20 milliseconds.** This is the single most consequential difference between
talking to Redis and talking to Postgres, and it is why the client library's connection
management and whether you use `MGET` instead of a loop changes your p99 by two orders of
magnitude.

There are three ways to collapse round trips, and they are not equal:

```bash
# (1) MGET / MSET — one command, many keys. Simplest, and the right first answer.
redis-cli MGET user:1 user:2 user:3 user:4

# (2) PIPELINE — one write, N commands, one read, N replies.
#     Cuts N round trips to ~1.5. Does NOT reduce server-side work,
#     and does not make it atomic.
redis-cli --pipe
127.0.0.1:6379> PING

# (3) Lua script via EVAL / EVALSHA — one round trip AND atomic.
#     Cuts N round trips to 1 and makes the whole thing indivisible.
```

```lua
-- A pipeline alone is not enough for read-modify-write.
-- GET then SET in a pipeline is NOT atomic: another client can interleave
-- between your two commands, because the server reads them as two commands.
-- This is the whole reason cache-side rate limiters are written in Lua.

-- rate_limit.lua  -- KEYS[1] = limiter key, ARGV[1] = now (ms)
--                  -- ARGV[2] = limit, ARGV[3] = window (ms), ARGV[4] = cost
local now    = tonumber(ARGV[1])
local limit  = tonumber(ARGV[2])
local window = tonumber(ARGV[3])
local cost   = tonumber(ARGV[4])

redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now - window)
local used = redis.call('ZCARD', KEYS[1])
if used + cost > limit then
  return {0, used}                       -- rejected
end
for i = 1, cost do
  redis.call('ZADD', KEYS[1], now, now .. ':' .. i)
end
redis.call('PEXPIRE', KEYS[1], window)
return {1, limit - used - cost}          -- allowed, remaining
```

Three cautions on Lua, all of which are real:

- **A script blocks every other client.** `redis.call` in a loop is exactly the
  "expensive command" case of §1.2, except now it is a single command, so you cannot even
  see it separately in `commandstats`. `SLOWLOG` will catch it; `redis-cli --bigkeys` will
  not.
- **Scripts must be deterministic on old replication paths.** Redis 5.0 and later use
  *effects replication* — the primary propagates the commands the script actually ran, not
  the script itself — so `redis.replicate_commands()` is no longer required, and
  non-determinism (reading the wall clock via `redis.call('TIME')`) is fine. If you are on
  Redis 4 or reading very old material, this is a hard requirement. Version-check before
  you quote it in an interview.
- **`redis.call` errors abort the script mid-way.** If a type error occurs after three
  writes, the writes are not rolled back. Scripts are atomic, not transactional; Volume 5
  owns what a transaction actually guarantees, and the short version is that
  `MULTI`/`EXEC` is not the transaction you want anyway.

> **SCALING REALITY CHECK**
>
> Round trips, not CPU, are the first wall. A single Redis instance sustains on the order
> of 100,000 small commands per second, but a Java service with a 50-connection Lettuce or
> Jedis pool issuing synchronous `GET`s at 150 µs each tops out at roughly **333,000
> requests per second of theoretical capacity that it will never reach** — real per-call
> overhead, serialisation and the queueing behind a shared connection push the practical
> ceiling to somewhere in the 50,000–80,000 range. Meanwhile if you replace that with 1,000
> pipelined `MGET`s you get 1,000 keys per round trip and the ceiling becomes bandwidth,
> not round trips. **The design question is not "how many keys per second" but "how many
> round trips per key"**, and the second number is the one that runs out first.

### 1.5 `KEYS` vs `SCAN`: the O(n) Command That Stalls Everything

This is the single most common self-inflicted Redis production incident, and it appears in
almost every interview because it is a clean demonstration that the execution model has a
consequence.

```text
  KEYS pattern
  ─────────────
  1. The main thread takes the command.
  2. It walks the ENTIRE keyspace — every key, every bucket, every entry.
  3. For each key it runs the pattern match, O(key length).
  4. Only after the whole walk is done does it write a single reply.
  5. Total: O(n) over the whole keyspace, with the main thread unavailable
     for every microsecond of it.

  SCAN cursor [MATCH pattern] [COUNT n]
  ────────────────────────────────────
  1. The main thread takes the command.
  2. It returns a BATCH and a new cursor. It does NOT walk the keyspace.
  3. Each call is O(COUNT) — bounded work, bounded latency.
  4. The client calls again until the cursor returns to 0.
  5. Total across the full iteration: still O(n) — you have not made the work
     disappear, you have made it *interruptible*, which is the only thing that
     matters when there is one thread.
```

The arithmetic for why this is a real outage: a keyspace of 4,000,000 keys, all in the
default hashtable encoding. `KEYS app:*` walks all 4,000,000, matching each. At roughly
100–250 nanoseconds per key examined on a modern core, that is **0.4 to 1.0 seconds of
total server stall**. On a 1 GbE link, 8,000 concurrent clients each with a 200 µs RTT
queue behind that stall accumulate 800ms × 8,000 = 6,400 client-seconds of queueing. Your
`GET`-only p99 goes from 0.3ms to a second, your connection pool exhausts, your HTTP
threads block, and the incident dashboard shows "everything is slow" with no error and no
CPU spike. The on-call engineer finds one `KEYS` in a slow query log and the whole thing
resolves.

> **PRODUCTION SCENARIO**
>
> Problem: at 14:20, a scheduled admin job runs in every region simultaneously and, at
> 14:20:01, the p99 for every Redis-backed endpoint goes from 2ms to 900ms across the
> estate. No errors. CPU is at 30%. Connection pool exhaustion alarms fire.
> Investigation: `SLOWLOG GET 20` returns eight entries, all `KEYS` with `duration (μs)`
> in the 700,000–1,100,000 range, all at 14:20:00. `INFO commandstats` shows
> `cmdstat_keys:calls=6,usec=5400000`.
> Root cause: the job's "list all sessions for a user" was written as `KEYS session:{userId}:*`
> against a keyspace of 4.1 million keys. One thread, one 900ms walk, every client of that
> instance queued behind it.
> Solution: `SCAN` with an explicit `MATCH`, iterating to cursor 0; for the specific
> "sessions for one user" question, use a Redis Set or a sorted set keyed by user that
> holds the session IDs, so the question is a single `SMEMBERS`.
> Prevention: a lint rule banning `KEYS`/`HKEYS` in application code (only `SCAN`-family
> commands allowed), a lint rule banning `KEYS` in a loop, and a staging load test with
> production-scale key counts so the next one is caught before release.

> **MUST REMEMBER**
>
> `SCAN` does not make iteration O(1) overall. A full iteration of a 4-million-key
> keyspace is still O(n) of work, spread across many interruptible calls. What `SCAN`
> buys is that the main thread is available between calls — and on a single-threaded
> server, availability between calls is the only currency that matters.

The guarantees `SCAN` makes, which are weaker than most people assume and which are worth
stating precisely because the weakness is a correctness property:

- Keys present for the **entire** iteration are guaranteed to be returned at least once.
- Keys added or removed during the iteration **may or may not** be returned. There is no
  snapshot.
- A key may be returned **more than once**. Deduplicate on the client, or live with it if
  the operation is idempotent.
- `COUNT` is a *hint*, not a batch size. The server will return more or fewer, and it can
  return more when it detects a rehashing.
- `SCAN` on a database in cluster mode iterates **one node at a time**, and the cursor
  encodes the node, so a naive `while (cursor != 0)` loop only scans one shard. The correct
  loop iterates every master separately, which is why the Redis clients expose
  `SCAN`-per-node rather than a global `SCAN`.

The same reasoning applies to the whole family of "give me all of it" commands, and it is
worth listing them so a code reviewer has a checklist:

| Command | Complexity | Why it hurts |
| --- | --- | --- |
| `KEYS` | O(n) over keyspace | The canonical stall; no `COUNT` mitigation at all |
| `HKEYS` / `HVALS` / `HGETALL` | O(1) + O(fields) | Fine for a 10-field hash; a 40ms stall for a 500,000-field one |
| `SMEMBERS` / `LRANGE 0 -1` | O(1) + O(elements) | `SMEMBERS` on a 1M-member set is tens of milliseconds |
| `ZRANGE key 0 -1` | O(log n + m) | m = cardinality; a full sorted set is a full table scan |
| `SCAN` | O(COUNT) per call | The correct answer to all of the above |

The right fix is almost never a better command — it is **not storing the data in a shape
that requires the command**. A "sessions for user 42" question answered with
`KEYS session:42:*` is a modelling error. Answered with `SMEMBERS user:42:sessions` where
that set holds session IDs, it is O(1) plus the number of sessions, which is 3. The hash
tag in the key name (`{42}`) is what lets you keep the two keys on the same cluster node,
and that is covered in Chapter 8.

### 1.6 When Redis Is a Database and When It Is a Cache

Redis is used as a cache, a session store, a rate limiter, a message broker, a leaderboard,
a distributed lock, a job queue and a primary database, and these are genuinely different
systems wearing the same binary. The honest classification is by durability assumption —
what happens if this instance loses all its data:

| Use | Loss of all data is… | Persistence needed? | What is the source of truth |
| --- | --- | --- | --- |
| Cache in front of Postgres | Free — the next read repopulates it | No | Postgres |
| Session store | Free-ish, users log in again; a mass logout at 9am is a visible incident | Usually no; RDS/AOF if sessions must survive a restart | The session is the data |
| Rate limiter / lock | **Not free** — a lost lock is a double-execution, a lost limiter is an open door | Yes, or use a primitive that fails safe | The invariant it protects |
| Leaderboard / counter | Free if recomputable, expensive if it is a payout or a high-score record | RDB | The event log |
| Job queue (Streams) | **Not free** — an acked-and-lost job is a silently dropped task | Yes, AOF | The queue itself |
| Primary database | Catastrophic by definition | Yes, plus replication | Redis |

> **INTERVIEW TRAP — "REDIS IS NOT A DATABASE, IT'S JUST A CACHE"**
>
> This is the reflex answer and it is wrong in both directions. Redis **is** a database —
> it is a data structure server with a durability model, a replication model, and
> transactions, and the people who say "it's not a real database" are almost always
> describing a *particular deployment's configuration*, not the software. The sharper and
> more useful move is to invert the question: **"the moment you rely on Redis holding a
> fact that cannot be recomputed, you have a database problem, and here is which three
> guarantees you now need."** Those three are: durability (RDB/AOF, and which
> `appendfsync` setting), availability across a node failure (Sentinel, cluster, or a
> managed service), and the failure behaviour on a cache *miss* — because a rate limiter
> whose counter vanished does not fail closed, it fails open, and that is a security
> property. Chapter 7 and Chapter 8 own the first two; this chapter's point is that the
> classification is a design decision and the tool is agnostic about which one you made.

The single test that separates "cache" from "database" in a code review: **can this value
be reconstructed from somewhere else within a bounded time?** If yes, it is a cache, its
eviction is free, and you should be running `allkeys-lru` with no TTLs and worrying about
nothing. If no — it is a ledger balance, a rate-limit budget, a paid order, an audit
record — then it is a database, and `maxmemory-policy` has become a data-loss decision that
you will need to make on purpose rather than inherit from a Helm chart.

> **STAFF-LEVEL CONSIDERATION**
>
> The thing to raise in a design review, unprompted, is that the *same Redis instance*
> frequently ends up serving four of these uses at once, and the configuration that is
> right for one is actively dangerous for another. A session store and a rate limiter on one
> instance with `allkeys-lru` means a memory-pressure eviction can delete a rate-limit
> counter and silently open a limit — the store keeps working, so nothing alerts, and the
> abuse you were defending against resumes at exactly the moment your system is busiest.
> The fix is not a bigger box. It is separating the instances by *guarantee class*:
> evictable data (cache), non-evictable-with-grace data (sessions, counters, locks, with
> TTLs and `volatile-*` policies), and durable data (queues, ledgers) — and making sure
> the person who can explain the consequence of each configuration is the same person who
> can approve the Helm values.

### 1.7 The Client Surface You Are Actually Coding Against

A last mechanical detail that separates a senior answer from a mid-level one, because it is
what the code review is actually about. The raw protocol is:

```text
C: *2\r\n$3\r\nSET\r\n$5\r\nmykey\r\n$3\r\nval\r\n
S: +OK\r\n

C: *2\r\n$3\r\nGET\r\n$5\r\nmykey\r\n
S: $3\r\nval\r\n
```

RESP2, inline above, is the format in which every "why is my payload bigger than expected"
debugging session happens: strings are length-prefixed (`$`), arrays are count-prefixed
(`*`), integers are `:`, errors are `-`, and a bulk string of `$-1\r\n` is *nil*. RESP3
(default since Redis 6) changes some of these to be self-describing — maps get `%`, doubles
get `,`, big numbers get `(` — and adds server-side **push**, which is how
pub/sub subscribers receive messages on their normal connection instead of on a second
one. RESP3 is a client-library feature as much as a server one: if your driver negotiated
RESP2, push does not reach you and `CLIENT TRACKING`-based caching silently does not work
either.

The client-level things that change your architecture, not your syntax:

- **Multiplexing vs dedicated connections.** `Jedis` multiplexes many operations over one
  connection with a future per command, so one slow reply does not block others; `Lettuce`
  (and RESP3 push) is event-driven and truly asynchronous on a shared connection;
  `redis-py` is a straightforward blocking-per-connection client. Mixing these is how you
  end up with a pool of 1 and a p99 that equals the sum of every call.
- **`CLIENT TRACKING` and `INVALIDATE`.** The server can push an invalidation message to a
  client when a key it has read is modified. This is the closest Redis has to a
  correct-by-construction cache invalidation story, and it is per-connection, tracked by
  key or by prefix (`CLIENT TRACKING on REDIRECT <id> BCAST PREFIX order:`), and it is
  *not* free — the server has to remember what each connection read, and that memory is
  real. Chapter 6 covers the invalidation strategies; this is the one worth knowing the
  name of.
- **`OBJECT ENCODING`, `OBJECT FREQ`, `MEMORY USAGE`.** The three commands that turn "Redis
  is using too much memory" from a guess into a number.

```bash
redis-cli OBJECT ENCODING user:1000          # → listpack | hashtable | intset
redis-cli OBJECT FREQ        user:1000        # → 137   (the LFU counter)
redis-cli MEMORY USAGE       user:1000        # → 2412 bytes
redis-cli DEBUG OBJECT       user:1000        # → serializedlength, lru, lru_seconds_idle
redis-cli --bigkeys -i 0.01                  # samples 1% of the keyspace
redis-cli --memkeys -i 0.01                  # samples for memory per key
redis-cli CLIENT LIST                         # who is connected, and for how long
redis-cli CLIENT TRACKINGINFO                 # what this connection is tracking
```

#### Common Mistakes

- Describing Redis as "an in-memory key-value store" and stopping there — it is a data
  structure server whose *type system* is the part that determines the complexity of every
  operation you can express
- Treating the single-threaded model as a scaling weakness rather than as a bet that pays
  until one command is expensive — and then running `KEYS` on a four-million-key keyspace
- Believing I/O threads execute commands; they never do, and `io-threads-do-reads` is off by
  default even after you enable `io-threads`
- Underestimating round trips and treating the 100,000 ops/sec headline as a bandwidth
  number — it is a *sequential round trip* number, and pipelining or `MGET` changes it by
  orders of magnitude
- Assuming `SCAN` makes iteration O(1) — the work is still O(n) in total; what changes is
  that the main thread is available between calls, and that keys added mid-iteration may
  be missed entirely
- Calling Redis "just a cache" or "a real database" without naming the classification
  question: can the value be reconstructed from somewhere else within a bounded time?
- Putting caches, rate limiters and durable queues on one instance with one
  `maxmemory-policy`, so that a memory-pressure eviction silently deletes a rate-limit
  counter and nothing alerts because the store is still working

#### Interview Questions — Architecture & the Execution Model

**Q1. Why is Redis single-threaded, and is that a good design?** `STAFF`

It is a deliberate bet, and the bet is that in-memory operations are so cheap that
serialising them beats locking them. A `GET` involves a hashtable lookup and a memcpy —
tens of nanoseconds — so a lock acquisition plus two context switches would cost more than
the operation itself. What you get in exchange is that every command is atomic for free
(so `INCR` and `SPOP` need no CAS), there is no lock convoy or priority inversion, the
command-execution thread stays cache-hot, and `fork()` for an RDB snapshot is nearly free
because there are no dirty in-process structures to reason about. What you give up is the
ability to preempt: one slow command — `KEYS` on four million keys, a `HGETALL` on a
500,000-field hash, a long Lua script — blocks every client for its full duration, and
there is no way to interrupt it. So it is a good design that imposes a hard discipline: you
must choose a data structure and a command whose cost is bounded, and the moment your
access pattern needs an unbounded command you have outgrown the assumption.

**Q2. `KEYS` and `SCAN` both return the same keys. Why is one a production incident and
the other is fine?** `TRICKY`

Because the cost is on the server's single thread, not on your connection. `KEYS` walks
the entire keyspace in one uninterrupted command; on 4,000,000 keys that is roughly 0.4 to
1.0 seconds during which the main thread executes nothing else, and every client on that
instance accumulates queueing delay. With 8,000 concurrent clients at 200 µs, that is
about 6,400 client-seconds of latency injected into an otherwise 0.3ms workload. `SCAN`
returns a bounded batch and a cursor, so each call is O(COUNT) and the thread is available
between calls — total work is identical, but it is now interruptible, and interruptibility
is the only currency that matters on a single-threaded server. The correct statement about
`SCAN` is that it does not reduce the O(n); it makes the O(n) *cooperative*. And the
related question worth volunteering is that the real fix is often neither command: if you
need "all sessions for user 42", a set `user:42:sessions` holding the IDs makes it a single
`SMEMBERS` instead of a keyspace traversal at all.

**Q3. Your service makes 400 sequential `GET`s per request. What is the cost, and what do
you change?** `ADVANCED`

400 sequential round trips. On loopback at 50 µs each that is 20ms of pure waiting per
request; same-datacentre at 250 µs it is 100ms; cross-region at 30ms it is 12 seconds,
which exceeds any timeout you have. None of that is Redis doing work — the server is idle
between your requests. Three fixes in order of preference. (1) `MGET` with the 400 keys:
one round trip, one command, identical server work, and it is the right answer whenever
you already know the keys. (2) A pipeline if the commands have dependencies or you want to
batch writes: one write and one read instead of 400, still not atomic, still 400 replies
in one buffer. (3) Restructure the data so you do not need 400 lookups — one `HGETALL` of a
denormalised hash, or a Lua script that assembles the response server-side, which gets
both the round trips and the atomicity. And the structural fix, which is the one that
actually stops this recurring: Redis is not a substitute for a query. If the request
requires 400 independent point lookups, you have built a join in application code, and
Volume 3 has opinions about that.

**Q4. Does enabling I/O threading let Redis use multiple cores for the work that
matters?** `TRICKY`

No, and the precise version is what earns the question. Redis has exactly one thread that
executes commands; it never changes and there is no configuration that makes it two. What
I/O threads do is move socket reads and writes — and since Redis 6.0, optionally writing the
parsed query to a lock-free queue — off that thread. The gain is real in exactly the
situations where clients are slow or payloads are large: in Redis 6.0 a client with a full
TCP window could stall the whole server in `write()`, and I/O threads make that someone
else's problem. The limitation is that it never parallelises the data structure work, so if
your bottleneck is command execution, a large `HGETALL`, or a Lua script, I/O threads do
nothing. The practical gotcha people hit is that `io-threads-do-reads` defaults to `no`, so
setting `io-threads 4` in most guides only helps the write path and then produces a
disappointing benchmark. And it is not free — with few clients and small commands, the
synchronisation costs more than it saves, so the number should be tied to client count and
payload size, not to core count by reflex.

**Q5. Is Redis a database? Argue it both ways and then settle it.** `STAFF`

Settle it with the classification test: can the value be reconstructed from somewhere else
within a bounded time? If yes, it is a cache, its eviction is free, and the configuration
should reflect that. If no — a rate-limit counter, a queued job, a paid order — it is a
database, and the moment you rely on it you inherit three requirements: a durability choice
(`appendfsync` every second loses up to a second; that may be fine for a cache and
unacceptable for a job queue), an availability choice (a single node failing takes the
limiter with it, and if the limiter fails *open* the failure is a security incident, not
an availability one), and a failure-mode choice on eviction. Redis is fully capable of
being the source of truth — it has persistence, replication, Sentinel and cluster — and
plenty of production systems use it that way. The mistake is not choosing a database; the
mistake is choosing one *by accident*, having inherited a config where `maxmemory-policy` is
`noeviction` because the last person who edited the Helm chart was thinking of it as a
cache.

> **CHAPTER 1 SUMMARY**
>
> Redis is four layers wearing one interface: a RESP protocol, a data structure server, a
> single-threaded command executor, and an in-memory store with a durability option. The
> execution model is a bet that in-memory operations are cheap enough that serialising
> them beats locking them, and it pays in three ways people forget to say out loud — every
> command is atomic for free, there is no lock convoy, and `fork()` is cheap enough to make
> snapshots viable. The cost is that nothing can be preempted, so `KEYS` on four million
> keys, a `HGETALL` on a half-megabyte hash, or a long Lua script is a global stall of its
> full duration, and I/O threads do not help because they never execute commands. The
> second load-bearing fact is that every command is a round trip, which means the design
> question is not "how many keys per second" but "how many round trips per key" — and
> that `MGET`, pipelining and Lua are three different answers with different atomicity
> guarantees. Third, and this is the classification that decides your configuration: ask
> whether the value can be reconstructed from somewhere else within a bounded time. If it
> can, it is a cache and eviction is free. If it cannot, you have a database, and
> `maxmemory-policy` has silently become a data-loss decision.

#### Further Reading

- [Redis documentation — Introduction to Redis](https://redis.io/docs/latest/develop/data-types/) — the data type system, which is the part most people skim and the part that matters.
- [Redis documentation — Clients](https://redis.io/docs/latest/develop/clients/) — the client feature matrix, including RESP3, client-side caching and `CLIENT TRACKING`.
- [Redis documentation — Pipelining](https://redis.io/docs/latest/develop/pipelines/) — why pipelining cuts round trips without reducing server work or providing atomicity.
- [Redis documentation — SCAN](https://redis.io/docs/latest/commands/scan/) — the exact guarantees and non-guarantees, including duplicates and mid-iteration mutation.
- [Redis documentation — Optimizing Memory Usage](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/) — the encoding thresholds and the allocator overhead numbers.

## Chapter 2 — Data Structures & When Each One Fits

### 2.1 The Type System Is the API

The most consequential thing about Redis is that it is not a blob store with a string
interface. It has a type system, and **the type you choose determines the complexity of
every operation you are allowed to express.** Every senior-level Redis question reduces to
this: *what is the most expensive question you need to ask, and does the structure let you
ask it in constant time?*

The full built-in set, with the honest reason to reach for each:

| Type | Under the hood | Typical complexity | Reach for it when |
| --- | --- | --- | --- |
| String | Byte array + int, up to 512 MB | `GET`/`SET` O(1), `APPEND` O(n) amortised | One value; a counter; a serialised document; a lock token |
| Hash | `listpack` (small) or `hashtable` (large) | `HGET`/`HSET` O(1); `HGETALL` O(fields) | An object's fields, accessed individually or in small groups |
| List | Quicklist of listpacks | `LPUSH`/`RPOP` O(1); `LRANGE` O(start+n); `LPOS` O(n) | A queue, a recent-items list, a bounded window |
| Set | `intset` (all ints) or hashtable | `SADD`/`SISMEMBER`/`SREM` O(1); `SMEMBERS` O(n) | Membership tests, de-duplication, set algebra |
| Sorted set | `listpack` (small) or skiplist + hashtable | `ZADD`/`ZREM` O(log n); `ZRANGEBYSCORE` O(log n + m) | Ranked or range queries; rate limiting; leaderboards |
| Bitmap | Bit offsets inside a string | `SETBIT`/`GETBIT` O(1) | Dense boolean flags over a known integer domain |
| HyperLogLog | Sparse/dense probabilistic set | `PFADD` O(1); `PFCOUNT` O(1)-ish | Approximate distinct counts at ~12 KB per counter |
| Stream | Radix tree of listpacks | `XADD` O(1); `XREAD` O(log n + m) | Durable-ish message queues with consumer groups |
| Geo | A sorted set under the hood | `GEOADD` O(log n); `GEORADIUS` O(log n + m) | Radius and nearest-neighbour on the globe |
| Module types | RedisJSON, RediSearch, RedisTimeSeries, RedisBloom | Varies | Anything you would otherwise do in application memory |

The design rule underneath all of it: **pick the structure so the operation you perform
most often is O(1), and pick it knowing which operation that is.** Storing a set of
product IDs in a JSON string and testing membership with `GET` + parse is a `SISMEMBER`
written by hand, in your application, at the cost of transferring and parsing the entire
collection. It is not a slower implementation of the same thing; it is a different
complexity class, and it is invisible until the collection is large.

```bash
# ✗ O(size of the whole set) in your JVM, plus network transfer of all of it
redis-cli SET product:1234:tags '["red","sale","winter","cotton","unisex"]'
redis-cli GET product:1234:tags    # → parse, then contains("red")

# ✓ O(1), transfers 0 bytes when present
redis-cli SADD product:1234:tags red sale winter cotton unisex
redis-cli SISMEMBER product:1234:tags red      # → 1
redis-cli SMISMEMBER product:1234:tags red blue # → 1 0   (Redis 6.2+, one round trip)
```

The honest counter-argument, which you should make before the interviewer does: for a
collection of five elements, the difference is nil, and `SADD` requires the caller to
agree on a set-shaped contract while a JSON string lets you put anything in. The
complexity matters when the collection is unbounded — follower lists, tag sets, permission
grants, product variants — and **the design review question is therefore "is this
collection bounded, and what is the bound?"** If nobody can name the bound, the structure
is the decision.

### 2.2 Strings: More Than a Blob, and the Three Commands That Are Not O(1)

Strings in Redis are binary-safe byte arrays of up to 512 MB, which is more capability than
most people use and less than most people assume — "binary-safe" means you can store
protobuf or a raw compressed blob, and it is a common source of confusion because the
protocol is *not* binary-safe in the same way, so a NUL byte in a key breaks naive tooling.

The operations that make strings interesting rather than merely convenient:

```bash
# Atomic counters. O(1), and the ONLY correct way to count under concurrency.
redis-cli INCR   page:views
redis-cli INCRBY page:views 10
redis-cli INCRBYFLOAT metric:latency 0.5

# The wrong way. Three round trips, and a lost update between every one.
# Thread A: 100 -> reads 100. Thread B: 100 -> reads 100.
# Thread A writes 101. Thread B writes 101.  The increment is gone.
redis-cli GET  page:views
redis-cli SET  page:views <n+1>

# Atomic expiry + set, in one round trip. Note this is SET-with-options, NOT
# SETEX-then-EXPIRE, which is two commands and can leave a key with no TTL.
redis-cli SET   session:abc '{"uid":42}' EX 1800
redis-cli SET   session:abc '{"uid":42}' PX 1800000
redis-cli SET   session:abc '{"uid":42}' NX     # only if absent — the SETNX idiom
redis-cli SET   session:abc '{"uid":42}' XX KEEPTTL

# SETEX is not deprecated; it is just two commands' worth of expressiveness
# packed into one, and it is atomic where SETNX + EXPIRE is not.
redis-cli SETEX session:abc 1800 '{"uid":42}'
```

That `SETNX` + `EXPIRE` race deserves a callout, because it is the kind of thing that is
correct in a test and wrong in production:

```text
  THE SETNX + EXPIRE RACE
  ───────────────────────
  T0  Thread A: SETNX lock 42          → 1 (acquired)
  T1  Thread A: ....................  ← A is descheduled here, or the
                                          process is killed here
  T2  Thread B: SETNX lock 42          → 0 (correctly fails)
  T3  Thread B: EXPIRE lock 30         → 1  (B did not own the key, and
                                          still set a TTL on it — harmless
                                          here only by accident)
  T4  Thread A: EXPIRE lock 30         → 1

  WORSE VARIANT: nobody sets the TTL.
  T2  Thread B: SETNX lock 42          → 0
  T3  Thread A: *** crashes here ***
  T4  Thread B: acquires nothing; the key persists forever.
  T5  Every subsequent writer sees SETNX → 0 and the feature is dead
      until somebody manually deletes the key.
```

The fix is one command: `SET lock <token> NX PX 30000`. It sets the value and the expiry
atomically, and it is a single round trip. This is the *only* form of Redis lock I would
write in 2026, and even then Chapter 6's discussion of why a cache lock is not a mutex is
the more interesting material.

The other string operation worth naming is `GETRANGE`/`SETRANGE` and its trap: they are
**O(n) in the length of the string**, so `APPEND`ing a 1-byte counter increment to a
10 MB string copies 10 MB. It is amortised O(1) for the accumulate-and-grow pattern Redis
special-cases, and it is genuinely O(n) when `offset` is far from the end. Volumetric
counters (`INCRBY` on 1 KB counters, summed on read) exist precisely because of this.

`APPEND` also has a real, useful property for caching that is worth stating: **`APPEND` is
atomic and it never overwrites**, so two concurrent processes incrementing a log under
the same key produce a correct interleaved log with no lost writes. That is the simplest
correct distributed append-log in the industry, and it is what a lot of "we need a
lightweight event log" tickets actually want.

### 2.3 Hashes and the Encoding Switch: When a Hash Beats a JSON String

This is the most practically important structural decision in a Redis codebase and it is
almost always made by accident. Storing an object as a JSON string versus as a hash:

| | JSON string | Hash |
| --- | --- | --- |
| Read one field | `GET` + parse the whole document (O(size)) | `HGET` — O(1), transfers one field |
| Read all fields | `GET` — one round trip | `HGETALL` — O(fields) + one round trip |
| Update one field | `GET` + mutate + `SET` — **read-modify-write, lost updates** | `HSET` — atomic, no read |
| Partial update by two writers | Last write wins on the whole document | Last write wins on the field only |
| Schema drift | Impossible to notice | A field can be missing, or be the wrong type |
| Bandwidth on a partial read | Full document | One field |

The hash wins decisively on the first four rows, and the reason it wins on row 3 is the
one that surprises people most: **`SET key <modified json>` is a read-modify-write, and
under concurrency it loses updates.** Two services each setting one field on the same
object produce a lost write with no error and no way to detect it afterwards. `HSET` cannot
do this, because it does not require reading the other fields. If a whole cache-aside layer
is doing `GET` + modify + `SET` on JSON, that is a correctness bug wearing a performance
costume — the fix is `HSET`, and it is a two-character change.

The counter-arguments are real and you should raise them. A hash is fieldless at the
protocol level: nothing stops a caller `HSETing` a string where a number belongs, and there
is no schema. Nested objects are awkward (you flatten, or you store a JSON string in a
field, at which point you are back to parsing). And for a read-mostly object that is always
read whole, a JSON string is one round trip and a hash is one round trip returning a
slightly larger reply — a wash.

The decision rule that holds up: **hash when the read or the write touches a subset of the
fields; string when the object is always read whole, is written whole, and benefits from
being validated and versioned as a unit.** A 40-field configuration blob read whole every
time is a string. A user record where the hot path is "read the display name" and the write
path is "update the last-seen timestamp" is a hash.

Under the hood, the encoding switches automatically and this has a memory consequence
people do not expect:

```text
  listpack  (contiguous, one allocation, no per-field overhead)
  ────────  chosen while the hash has ≤ 128 fields AND each field/value ≤ 64 bytes
            HGET on a listpack: scan the entries, O(fields) but tiny constant
                              (in practice faster than a hash lookup for
                              small hashes because of cache locality)
            memory: ~3 bytes of pointer per entry, no malloc per field

  hashtable
  ───────── chosen once EITHER threshold is crossed
            HGET: O(1) proper
            memory: ~50+ bytes per field of hashtable overhead plus a separate
                    allocation for each field name and each value

  The switch is one-way for a given key until it is deleted, and it happens
  silently, mid-flight, on the key's own single thread. Crossing the threshold
  is therefore a step change in memory, not a slope.
```

That 128-field / 64-byte threshold is a real number with a real consequence: a hash that
holds one field whose value is a 2 KB JSON blob will use the *hashtable* encoding and pay
the overhead of a hashtable for what is functionally one string field. The thresholds are
configurable (`hash-max-listpack-entries`, `hash-max-listpack-value`), and if your usage
pattern is a small number of large fields, raising the *value* threshold and lowering the
*entries* threshold is a legitimate, measured optimisation. The reason it is worth knowing
rather than defaulting to: the memory difference between a listpack hash and a hashtable
hash is on the order of 40–50 bytes per field, so on 10 million hashes with 5 fields each
you are looking at 2 GB of pure encoding overhead, and that is the entire reason
`maxmemory` is not the same number as your data.

> **INTERVIEW TRAP — "STORING JSON IN REDIS IS FINE"**
>
> It is fine for objects that are always read and written whole, and it is a correctness
> bug for objects that are not. The specific failure is `GET` → modify one field → `SET`:
> that is a read-modify-write with no compare-and-swap, so two concurrent writers each
> read version N, each write N+1 with *their* field changed, and one of the two changes
> vanishes with no error, no log line and no way to reconstruct it. The same object stored
> as a hash makes the update `HSET field value`, which is atomic and touches nothing else.
> The secondary trap in the interview answer is the *complexity* claim in the other
> direction: "a hash is faster than a string" is only true for partial reads. For a full
> read of a 40-field object, `HGETALL` moves slightly more bytes than `GET` of the
> equivalent JSON because of the field-name framing. The honest answer picks by access
> pattern, not by a benchmark of one command.

### 2.4 Sorted Sets: The Most Under-Used Structure in Redis

A sorted set is a set where every member also has a `double` score, kept in a skiplist for
range queries and a hashtable for score lookups. It is the structure that turns "give me
the top 10" from an O(n log n) sort into an O(log n + 10) operation, and it is the right
answer to a whole class of problems people solve with far more machinery.

The three canonical patterns, all of which are real production systems:

```text
  1. LEADERBOARD                              3. RATE LIMITING
  ──────────────                              ───────────────
  ZADD  rank:weekly 14850  alice               -- sliding window log, all in
  ZADD  rank:weekly 16230  bob                        one O(log n) structure
  ZADD  rank:weekly 13990  carol
                                              ZREMRANGEBYSCORE rl:user:42 \
  ZREVRANGE rank:weekly 0 9 WITHSCORES              0 <now-window>
  → top 10 in O(log n + 10)                   ZCARD rl:user:42
                                              ZADD rl:user:42 <now> <ts>
  ZRANK rank:weekly alice                     PEXPIRE rl:user:42 <window>
  → alice's position, O(log n)
                                              → O(log n) per request, exact,
  ZREVRANK / ZINCRBY for live updates            and self-cleaning

  2. PRIORITY QUEUE (bounded)
  ───────────────────────────
  ZADD  queue:jobs <priority> <jobid>
  ZPOPMIN queue:jobs            -- O(log n), atomic in Redis 5+
  ZRANGE queue:jobs 0 0         -- peek without removing

  The priority is a double. Make it a fixed-width
  integer score to preserve ordering of large IDs.
```

Rate limiting with a sorted set deserves the deeper treatment, because the "how do you rate
limit without a dependency" question is a staff-level one and the *failure modes* are what
make it staff-level:

- **Memory is O(requests in the window), not O(1).** A token bucket is O(1) in memory; a
  sliding window log is O(limit) per key. At 1,000 distinct users with a 60-second window
  and 100 requests each, that is 100,000 sorted set entries. Bounded, but the bound is
  `users × limit`, not `users`, and nobody writes that down.
- **The `ZREMRANGEBYSCORE` + `ZCARD` + `ZADD` sequence is three commands and is NOT
  atomic on its own.** Under concurrency, 50 simultaneous requests each see `ZCARD = 99`,
  each decide to allow, and each add — so your limit of 100 admits 150. This is the same
  read-modify-write bug as the counter, and the fix is identical: a Lua script (§1.4), which
  makes the three commands indivisible on the single thread.
- **Key cardinality is an eviction risk.** A limiter key per user with a `PEXPIRE` is a
  `volatile-*` candidate, which interacts directly with Chapter 4's `volatile-lru`
  discussion — and the answer to "which eviction policy" is very different for a keyspace
  where every key has a TTL (limiters, sessions) than for one where none do (a plain
  read-through cache).
- **A fixed window is not a sliding window.** `INCR` with `EXPIRE` gives you a window that
  resets on a boundary, so a client can send its full limit at 11:59:59 and again at
  12:00:00 — 2× the limit in two milliseconds. That is the classic fixed-window burst
  problem, and the sorted-set sliding log is the fix. A GCRA/token-bucket implementation in
  Lua is the memory-cheaper fix.

> **SCALING REALITY CHECK**
>
> `ZRANGEBYSCORE` is `O(log n + m)` where m is the number of members returned, and this
> is the number that decides whether a sorted set is a good idea. A "top 10 from 10,000
> members" is `O(log 10,000 + 10)` — essentially free, and this is why leaderboards are
> sorted sets. A "top 10 from 10,000,000 members" is the same cost, which is the *good*
> news. The bad news is the same command used as `ZRANGE key 0 -1 WITHSCORES` to "get
> everything" — now m is 10,000,000, you have built a synchronous 500 MB transfer, and on
> a single-threaded server you have also built a multi-second global stall. **The
> complexity of a range query is not the structure's property, it is the structure's
> property conditional on how many rows you ask for**, and that is the distinction a
> design review needs.

### 2.5 Bitmaps, HyperLogLog, Streams and Geo: The Four You Should Know by Name

**Bitmaps.** `SETBIT key offset value` sets one bit in a string at a byte offset. The
practical property is that 1 million users' daily-active flags is 1,000,000 bits = **125 KB**,
and counting them is `BITCOUNT` over a byte range, which is O(range) on a very cheap
operation. `GETBIT`/`SETBIT` are O(1). The trade-off is that the *user ID space must be
dense and known* — a bitmap indexed by a database surrogate ID works; a bitmap indexed by
a UUID would allocate a bitmap of length 2^128. The real pattern is the "user 12345 was
active on 2026-03-15" flag stored at `offset = (day_id * 1_000_000) + user_id`, which gives
you a week of activity in one `BITCOUNT` over 875 KB. The failure mode to name is the
bitmap *expanding forever*: offsets are never reclaimed, so a bitmap for a growing integer
domain becomes a sparse string full of zero bytes that still costs memory proportional to
its maximum offset.

**HyperLogLog.** `PFADD`, `PFCOUNT`, `PFMERGE`. Standard error 0.81%, **12 KB per counter
regardless of cardinality** (up to a few hundred billion), and `PFADD` is O(1) amortised.
It answers "roughly how many distinct users did this", never "who were they". The honest
framing in an interview: this is the only place in the set where you should volunteer
*approximate* as the correct answer. The failure modes are (a) using it where you need
exactness — a billing counter cannot be 0.81% wrong, (b) the sparse-to-dense conversion,
which is a fixed 12 KB cost per counter and is why a million distinct one-off counters cost
12 GB, and (c) `PFMERGE` is destructive if you use `PFMERGE dest src...` and then
`DEL src` based on an assumption that the source is still there.

**Streams.** The under-used primitive. A stream is an append-only log with an ID
(`<milliseconds>-<sequence>`), and a consumer group turns it into a queue with explicit
acknowledgement and a pending-entries list. The commands that matter:

```bash
XADD orders:events * orderId 8812 status SHIPPED
XREADGROUP GROUP workers g1-1 $ COUNT 10 BLOCK 5000 STREAMS orders:events >
XACK orders:events workers 1754000000000-0
XPENDING orders:events workers                # who has not acked
XAUTOCLAIM orders:events workers other 0 30000  # steal another consumer's dead work
XTRIM orders:events MAXLEN ~ 100000            # bounded, approximate trimming
```

Why this matters at staff level: `XREADGROUP ... BLOCK` is Redis's only blocking-primitive
that is safe at scale, because blocking happens per-client with a shared entry, unlike
`BLPOP` which gives no guarantee about which waiter gets which element. And the
`XAUTOCLAIM` mechanism is the answer to "what happens when a consumer dies mid-message",
which is a question every message-broker interview asks and which `BRPOP` cannot answer at
all. The costs are honest and worth naming: the pending entries list grows without bound
if nobody claims, `MAXLEN ~` trimming is approximate and can trim more than you asked,
stream memory is not free (a 1M-entry stream with 200-byte entries is ~200 MB plus
overhead), and streams are **not** a Kafka replacement for anything requiring replay
across consumers or strict per-key ordering at scale.

**Geo.** `GEOADD`/`GEOSEARCH` are a sorted set where the score is a 52-bit interleaved
latitude/longitude and the member encodes the original name. `GEORADIUS key <lon> <lat>
<radius> m` returns members within a radius, and `GEOSEARCH ... BYBOX` is the cheaper form.
`GEOADD` is `O(log n)`. The honest caveats, which are real design constraints: the
coordinates are stored in a non-standard interleaved format on top of a double score, so
you cannot read the score and get a latitude; radius queries return members and then
filter by exact haversine distance, so the *count* you get back is correct but the
`GEODIST` for each is a second computation; and Redis 6.2+ added proper bounding-box
pre-filtering with `FROMLONLAT BYBOX BYRADIUS` options that materially improved the
`O(m)` constant. The alternative — a real geospatial index such as PostGIS or `geohash`
bucketing in the database — is better once you need polygon containment, which Redis Geo
does not do at all.

**Module types.** RedisJSON (`JSON.GET` with JSONPath), RediSearch (inverted index and
queries, which is genuinely a search engine and Volume 11 owns Elasticsearch), RedisTimeSeries
(compactly-encoded time series with downsampling rules), RedisBloom (bloom and
count-min sketch, and note that `BF.EXISTS` is a bloom filter — the cache-penetration fix
from Chapter 5 is available as a first-class primitive), and RedisJSON's companion
`FT.SEARCH`. The design-level note is the same for all of them: a module type moves work
from your application into the single-threaded server, which is a win when the work is
bounded and a liability when it is not, and it introduces a dependency on a commercial or
open-source module's own versioning and upgrade path.

> **TRADE-OFF — "WHICH STRUCTURE FOR A USER'S TAGS?"**
>
> Set, JSON string, or hash? **Set** if membership is the only question — `SISMEMBER` is
> O(1) and transfers nothing on a hit, and `SMEMBERS` gives you the whole set when you
> need it. **JSON string** if tags are always read whole, are written whole, and you want
> one round trip plus the ability to validate them as a unit. **Hash** if the tags have
> metadata (a display label, a source, a confidence) that you read individually, because
> `HGET tags:1234:red` beats parsing a blob to get one label. The condition that flips the
> answer is *cardinality*: under ~10 elements with no partial access, a string is simpler
> and the difference is noise; over a few hundred, the `SISMEMBER` advantage over
> parse-the-whole-string is the difference between a constant and a linear read. And the
> question worth asking in the review, which usually reveals the real problem: **"what is
> the maximum number of tags?"** A design where nobody can answer that is a design that
> will eventually call `SMEMBERS` on a set with two million members.

#### Common Mistakes

- Storing a set in a JSON string and doing membership tests by parsing it in the
  application — a `SISMEMBER` rewritten by hand at the cost of transferring the whole
  collection
- Using `GET` + mutate + `SET` on a JSON blob and calling it an update, when it is a
  read-modify-write with a lost-update race and no error when it loses
- `SETNX` followed by a separate `EXPIRE`, which leaves an immortal lock if the process
  dies between the two commands — `SET key val NX PX 30000` is one command and atomic
- `ZRANGE key 0 -1` to "get everything" from a sorted set with millions of members, which
  is a `O(log n + m)` command with m in the millions and therefore a multi-second global
  stall on a single-threaded server
- Running a rate limiter's `ZREMRANGEBYSCORE`/`ZCARD`/`ZADD` as three separate commands
  and calling it a limiter, when N concurrent requests each observe the same count and all
  pass the check
- Believing a sorted set limiter is `O(1)` in memory, when it is `O(requests in window)`
  per key and the total is `users × limit`
- Using a bitmap indexed by a sparse or UUID-shaped domain, which allocates a string the
  size of the maximum offset
- Using HyperLogLog where a counter needs to be exact — 0.81% error is a feature when you
  want distinct counts and a bug in a billing path
- Forgetting that a hash silently switches encoding at 128 fields or 64-byte values, and
  reading the resulting memory jump as a leak

#### Interview Questions — Data Structures

**Q1. When would you use a hash instead of a JSON string, and what does it cost you?**
`STAFF`

The decisive question is whether reads or writes touch a *subset* of the fields. A hash
gives `HGET` in O(1) transferring one field, versus `GET` plus parsing the whole document
in your process — the difference between constant time and linear in the object size. More
importantly, `HSET` is an atomic partial update while `GET` + modify + `SET` is a
read-modify-write: two services updating different fields of the same cached object
concurrently will lose one of the writes, silently, with no error and no way to
reconstruct it. That is a correctness bug, not a performance one, and it is the strongest
argument for hashes. The costs are honest: a hash has no schema, so a caller can write a
string into a numeric field or invent a field name; nested structures must be flattened or
stored as a JSON string inside a field, reintroducing the parse; and for a read that always
fetches the whole object, `HGETALL` returns slightly more bytes than `GET` of the
equivalent JSON because of field-name framing. So: hash for partial access and concurrent
partial writes, string for whole-object reads and writes where validation as a unit
matters.

**Q2. `SISMEMBER` on a set is O(1). The same membership test against a JSON string is O(n).
When does that difference actually matter?** `TRICKY`

When the collection is large enough that the constant and the transfer dominate, which is
much earlier than people assume. "Large" here means the JSON blob is bigger than a
network MTU and the *whole thing* crosses the network on every membership test — a 5,000-tag
JSON array at 80 bytes per tag is 400 KB, so every check is a 400 KB transfer and a
400 KB parse, and a membership test costs more than a thousand `GET`s. The other factor
is whether the check is on a hot path: a permission check, a feature-flag evaluation, a
product-availability lookup runs per request per item, so `n` items times a `n`-sized
payload is `O(n²)` per page render. The counter-case worth volunteering is that for
bounded small collections the difference is genuinely negligible and a set's
call-site discipline (adding a tag is `SADD`, removing is `SREM`, and nothing prevents
either) is a real cost. The design-review question that resolves it is "what is the
maximum size of this collection?" — if nobody can answer, the collection is unbounded and
the O(1) structure is the only safe choice.

**Q3. Why is `ZRANGEBYSCORE` the right primitive for a leaderboard, and when does it stop
being right?** `STAFF`

Because the score is a `double` and the members are kept in a skiplist plus a hashtable, so
"give me the top 10" is `O(log n + 10)` — it never sorts, and it never touches the other
n − 10 members. A leaderboard backed by a relational table needs an index on the score
column and a `LIMIT 10` that the planner will honour, which is workable but adds a
per-request sort in some shapes and puts the whole thing behind your primary's connection
pool. Sorted sets also give you rank lookups for free: `ZRANK` is `O(log n)`, so "where is
player X on the board" is the same cost as "what is the top of the board". The case where
it stops being right: a *fixed-size* top-N. If you only ever need the top 10, keeping ten
million members to serve ten of them is waste — a sorted set plus periodic trimming, or a
different structure entirely, is correct. And the real ceiling is `O(log n + m)` where m is
what you ask for, so `ZRANGE key 0 -1` to "get everything" from a ten-million-member board
is not a range query, it is a 500 MB synchronous transfer and a multi-second global stall
on the single-threaded server. The second limit is correctness-adjacent: a `double` score
loses precision above 2^53, so if your priority is a 64-bit ID or a lexicographic string,
you must scale it to a fixed-width integer and accept the range limit.

**Q4. A rate limiter built on a sorted set. Walk through the implementation and tell me
where it breaks.** `ADVANCED`

The implementation is a sliding-window log: `ZREMRANGEBYSCORE key 0 (now − window)` to
drop expired entries, `ZCARD key` to count what remains, `ZADD key now <timestamp>` if
under the limit, `PEXPIRE key window` at the end. It works, and the per-request cost is
`O(log n)` with `n` = requests in the window. It breaks in four places. (1) **It is three
commands and therefore not atomic.** Fifty concurrent requests each observe `ZCARD = 99`,
each decide to pass, and each `ZADD` — so a limit of 100 admits 150. The fix is to wrap the
whole sequence in a Lua script, which is indivisible on the single thread. (2) **Memory is
`O(users × limit)`, not `O(users)`.** A token bucket is `O(1)` per user in memory; this is
a full log of every request in the window. (3) **Key cardinality is an eviction and
connection-pool risk** — a limiter key per user is a `volatile-*` candidate, which
interacts with the `maxmemory-policy` choice in a way that can delete counters and fail
the limiter *open*. (4) **Clock skew across app servers** means "now" differs, so a
request's timestamp can be outside the window it was admitted into. The staff-level
follow-up is that a fixed-window `INCR` + `EXPIRE` limiter is simpler and O(1) in memory
but permits a 2× burst across the window boundary, and a GCRA or token-bucket limiter in
Lua gets you the accuracy without the memory — at the cost of a more interesting piece of
code to review.

**Q5. What are HyperLogLog and streams for, and when is each the wrong choice?**
`TRICKY`

HyperLogLog is for approximate distinct counting and nothing else: fixed 12 KB per
counter, O(1) amortised `PFADD`, 0.81% standard error, and it cannot tell you *who*. It is
exactly right for "how many distinct users hit this endpoint this hour" and exactly wrong
for anything that must be exact — billing, entitlements, anything a customer will dispute —
and the failure is choosing it for cardinality rather than for uniqueness. Its hidden cost
is that the sparse representation becomes a fixed dense 12 KB per counter, so a million
distinct one-off counters is 12 GB, and `PFMERGE` is how you combine weekly counters into
a monthly one. Streams are the opposite: an append-only log with an ID, a consumer group,
explicit `XACK`, a pending entries list, and `XAUTOCLAIM` to steal work from a dead
consumer. They are the right primitive for a small team's internal job queue with
at-least-once delivery and visibility timeouts, and the wrong choice the moment you need
replay from an arbitrary offset for many independent consumer groups, strict per-key
ordering at scale, or a durability story you would defend to an auditor — at which point
you are rebuilding Kafka badly. The honest cost of streams is that the pending list grows
without bound if nobody claims, `XTRIM MAXLEN ~` is approximate, and per-stream memory is
not free.

> **CHAPTER 2 SUMMARY**
>
> Redis has a type system, and the type you choose determines the complexity of every
> question you are allowed to ask — which makes structure choice the real design decision,
> not a micro-optimisation. The two that matter most in practice: a set, because
> `SISMEMBER` is O(1) while the same test against a JSON string is O(n) plus a network
> transfer of the whole collection; and a hash, because `HSET` is an atomic partial update
> while `GET` + modify + `SET` is a read-modify-write that loses updates silently under
> concurrency. Sorted sets are the most under-used structure in the system and the right
> answer for any ranked or range question — `ZRANGEBYSCORE` is `O(log n + m)` — but the
> cost is conditional on m, and `ZRANGE key 0 -1` on a large board is a global stall, not
> a range query. Two implementation details have outsized consequences: the automatic
> encoding switch at 128 fields or 64-byte values, which is a step change in memory rather
> than a slope; and the fact that a multi-command read-modify-write — a counter, a limiter,
> a lock — is only correct inside a Lua script, because the single thread makes individual
> commands atomic and nothing more. The engineering question underneath every one of these
> is the same one: **what is the maximum size of this collection, and who can say?**

#### Further Reading

- [Redis documentation — Data types](https://redis.io/docs/latest/develop/data-types/) — the authoritative list with per-type complexity and per-command pages.
- [Redis documentation — Optimizing Memory Usage](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/) — the listpack-to-hashtable thresholds and the per-encoding memory numbers.
- [Redis documentation — Sorted sets](https://redis.io/docs/latest/develop/data-types/sorted-sets/) — `ZRANGEBYSCORE` and its `O(log n + m)` cost, plus lexicographic ordering.
- [Redis documentation — Streams](https://redis.io/docs/latest/develop/data-types/streams/) — consumer groups, the pending entries list, and `XAUTOCLAIM`.
- [Redis documentation — Geospatial indexes](https://redis.io/docs/latest/develop/data-types/geospatial/) — the 52-bit interleaved encoding and the bounding-box pre-filter.

## Chapter 3 — Caching Strategies

### 3.1 The Vocabulary, and Why There Are Six Names for One Idea

Every caching pattern is a decision about **where the write happens** and **who is
responsible for the read path when the cache misses**. There are six classic names, they
are not equally good, and the interview question is almost never "which do you use" — it is
"what does the one you did not choose cost you".

| Strategy | Read path on a miss | Write path | Who knows about the cache? |
| --- | --- | --- | --- |
| **Cache-aside** | Caller loads from the DB and populates | App writes DB, then invalidates or updates cache | Only the caller |
| **Read-through** | The cache *itself* loads from the DB | App writes DB, then invalidates | Only the caller, via a loader |
| **Write-through** | Cache hit or read-through | App writes DB **and** cache, together | The cache is in the write path |
| **Write-behind** (write-back) | Cache hit, or caller loads | App writes cache only; a worker flushes to the DB later | The cache is in the write path |
| **Refresh-ahead** | Cache hit; a worker repopulates before expiry | Same as cache-aside | Only the caller, plus a worker |
| **Read-repair** | Cache hit; a worker repairs stale entries in the background | Same as cache-aside | Only the caller, plus a worker |

The diagram that is worth memorising, because it is the one that separates the six:

```text
  ─────────────── CACHE-ASIDE (lazy loading) ───────────────

  READ                                          WRITE
  ┌────────┐   GET   ┌────────┐  hit  ┌────────┐
  │ caller │────────▶│ cache  │──────▶│ value  │──▶ return
  └────────┘         └────────┘       └────────┘
       │
       │ miss
       ▼
  ┌────────┐  SELECT ┌────────┐
  │  DB    │◀────────│ caller │   ← the CALLER loads, not the cache
  └────────┘         └────────┘
       │
       ▼  SETEX
  ┌────────┐
  │ cache  │   then return to the caller
  └────────┘

  Cost of a miss: 2 round trips to Redis-equivalent + 1 to the DB.
  Benefit: the cache has no code path to the database. Ever.


  ─────────────── WRITE-THROUGH ───────────────

  WRITE
  ┌────────┐   ┌──────────────────────────────┐
  │ caller │──▶│ write to DB, then write cache │──▶ both or neither
  └────────┘   └──────────────────────────────┘
       │
       │ cache is now IN the write path. A cache outage is a write outage.


  ─────────────── WRITE-BEHIND ───────────────

  WRITE
  ┌────────┐   ┌────────┐                  ┌──────────┐   async   ┌────────┐
  │ caller │──▶│ cache  │────── queue ─────▶│ flusher  │──────────▶│   DB   │
  └────────┘   └────────┘                  └──────────┘           └────────┘
       ▲
       └─ reads NEVER touch the DB. Ever.
          And if the flusher dies, the write is in RAM only.
```

### 3.2 Cache-Aside: The Default, and Exactly What It Costs

Cache-aside is the right answer more often than any other, and the reason is structural
rather than clever: **the cache has no code path to the database.** Nothing in the cache
layer can fail because the database is down, nothing in the cache layer can be down because
of a bug in a loader, and the cache can be flushed, rebuilt or replaced without touching
the application. That is a genuine architectural property and it is why cache-aside is the
default in every serious code base.

The cost, stated as a number rather than as a vibe: **a miss is always a double round
trip.** One `GET` to Redis (0.2 ms on a datacentre link), one `SELECT` to Postgres (say
2 ms), one `SETEX` to Redis (0.2 ms). A hit is 0.2 ms. A miss is 2.4 ms — twelve times a
hit. At a 1% miss rate, the average read is 0.224 ms, which is fine. At 10% — a cold
start, a post-deploy cache flush, an incident — the average is 0.44 ms and the *p99* is
2.4 ms, and the p99 is what users complain about. The structural consequence is that
cache-aside's hit rate is a **tail-latency control**, not just a throughput control: a
5% miss rate does not make the service 5% slower, it puts a 2.4 ms step in the p99 that
never goes away.

The other cost, which is the one that turns into Chapter 5 and Chapter 6: **cache-aside
has no invalidation path.** Writes go to the database, and nothing tells the cache. The
application must remember to delete or update, and the failure mode of forgetting is silent
staleness. The three mitigations, in order of preference:

1. **Delete on write.** `@CacheEvict` in the annotation, or a `cache.delete(key)` in the
   same transaction-adjacent code path as the write. Simple, idempotent, and the failure
   mode (a stale value) is the same failure mode as no cache at all.
2. **Event-driven invalidation.** The write publishes `OrderChanged`; subscribers delete.
   This covers writes that happen *outside* your service — a batch job, an admin tool,
   another service — which is the actual reason to prefer it. It costs a consumer, a lag,
   and a new failure mode (the event is lost, and the cache is stale forever, which is
   worse than the bounded staleness of a TTL).
3. **Versioned keys.** The key includes a version the read path checks. This is
   "invalidate by not reading" and it needs a version source, which is a database read or
   a global counter — which frequently costs more than the cache saved.

> **INTERVIEW TRAP — "CACHE-ASIDE MEANS THE CACHE IS ALWAYS FRESH"**
>
> It does not, and the honest version of this answer is worth more than the name. In
> cache-aside the *write* path does not go through the cache, so at the moment a write
> commits there is no code path that has told the cache anything. Every value in the cache
> is stale from the instant its source row changes until something removes it — and
> "something" is application code that has to remember. The three ways it goes wrong, in
> increasing order of how long the staleness lasts: (1) the write path forgets the
> `delete`, so the value is stale for the whole TTL; (2) the write happens in another
> service, a batch job, or an admin tool, so no write path in *this* service could have
> known, and the value is stale until the TTL; (3) the write path deletes, the read path
> repopulates from a replica that has not caught up, and the freshly-cached value is the
> pre-write one — so the delete-on-write *looks* like it did nothing. That third one is the
> one that makes people abandon cache-aside, and the fix is not a different strategy, it is
> reading from the primary when populating. **Cache-aside is the default because its
> failure mode is bounded staleness, not because it is correct** — and a bounded, measured,
> business-accepted staleness on specific reads is a legitimate design position.

### 3.3 Read-Through, Write-Through and Their Failure Modes

**Read-through** is cache-aside with the loader moved into the cache layer's abstraction —
`@Cacheable` in Spring, a `RedisTemplate` cache manager, a library-level decorator. The
read path is identical; the difference is *where the loading code lives*. Benefits: the
application never writes loader code, the same loader serves every caller, and the "who
populates this key" question has one answer. Costs: the cache layer now has a dependency on
the database, so "the cache has no code path to the DB" — the property that made cache-aside
the default — is gone. A loader bug is now a cache-layer outage. A loader that throws
turns a cache into a latency multiplier rather than a fallback.

The failure mode to name: **read-through with no negative caching is an amplification
attack.** Every miss goes to the database, and a client can manufacture misses at will by
requesting keys that do not exist. Chapter 5 covers it in full; the read-through-specific
version is that the amplification is *inside* your abstraction, so nobody sees it.

**Write-through** puts the cache in the write path: the write succeeds only if both the
database and the cache were written. What it buys is that a read immediately after a write
almost always hits, which is the read-your-writes property that a plain cache-aside
implementation does not give you. What it costs:

- **A cache outage is a write outage.** The database is healthy, the write is valid, and you
  cannot accept it. For a cache that is a performance optimisation, this is an
  availability regression you introduced voluntarily.
- **The double write is not atomic and cannot be.** If the DB write succeeds and the cache
  write fails, you have an inconsistency; if you retry, you may double-apply; if you
  compensate, you are writing a saga in application code. Volume 5 owns what a real
  transaction gives you, and this is the place that lesson lands: the database and Redis
  are two independent systems and there is no atomic write across both.
- **It is only correct if every write goes through it.** One admin script, one migration,
  one `psql` session that writes a row, and the cache is now permanently, silently wrong
  for that entity.

The right use of write-through is narrow and identifiable: **a small, high-value set of
reads where read-your-writes genuinely matters** and where the entity is written by exactly
one system. A shopping cart during checkout, a user's own profile immediately after they
edit it. Everything else should not have a cache in the write path.

> **TRADE-OFF — "SHOULD THE WRITE PATH TOUCH THE CACHE?"**
>
> The condition that flips the answer is **whether read-your-writes is a business
> requirement for this specific read**, plus **whether a cache failure should block a
> business write.** If both are yes, write-through (or a targeted post-write update, not a
> general one) is correct, and the team should say out loud that they have made cache
> availability part of write availability. If either is no — and for the overwhelming
> majority of reads, "the user sees their own change 200ms later" is not a business
> requirement — then delete-on-write is the right answer, because it is idempotent, it
> cannot lose a write, and its failure mode is a bounded staleness that a later read
> repairs. The intermediate option people forget: **delete-on-write plus a read-your-writes
> exception for the two or three flows that need it** — read from the primary, or pass
> through a version token — which gets the business guarantee without making the entire
> write path depend on Redis being up.

### 3.4 Write-Behind: The Fastest Write Path and the Worst Failure Story

Write-behind (write-back) is the only strategy that makes writes *cheaper* rather than
merely different. The application writes to the cache and returns; a background worker
flushes to the database on a schedule or a threshold. The latency win is real: the write
path becomes one in-memory operation instead of a network round trip to Postgres plus a
`COMMIT` fsync, which is often a 5–50× improvement on the write path.

And it requires a durability story that almost nobody writes.

```text
  WRITE-BEHIND, AND EVERY WAY IT LOSES DATA

  ┌────────┐  SET  ┌────────┐         ┌──────────┐        ┌────────┐
  │ caller │──────▶│ cache  │────────▶│ flusher  │───────▶│   DB   │
  └────────┘  acked │ (RAM)  │  batch  │ (durable │  write └────────┘
       ▲            └────────┘         │  queue)  │
       │                               └──────────┘
       │  ! 1. The client already got a 200. The write only exists in RAM.
       │  ! 2. The process is OOM-killed / the node loses power.
       │  ! 3. The flush never happens. The order is silently lost.
       │  ! 4. maxmemory eviction removes it first, because an unflushed
       │       dirty key looks exactly like a cold key to the LRU.
       │  ! 5. RDB snapshot captured it, so a *restore* has the order, but a
       │       normal restart has not flushed it and does not have it either.
       │  ! 6. A second writer reads through the cache, sees the unflushed
       │       value, and makes a decision based on a fact the DB does not have.
```

> **PRODUCTION SCENARIO**
>
> Problem: a metrics counter service used write-behind. Order of events was lost
> intermittently, roughly 40 events per hour, and always during deployments.
> Investigation: the flusher ran in the same process as the HTTP handlers, and the pod's
> `terminationGracePeriodSeconds` was 30 while the flush interval was 60. A rolling
> deploy sent `SIGTERM`; the app exited cleanly; the flusher's remaining 30 seconds of
> batch never ran. `INFO keyspace` after restart showed the keys present but `MONITOR`
> during a manual flush showed the batch count never exceeding 11 — the queue was
> draining, just not at the rate the write rate assumed.
> Root cause: an unflushed write is a write that does not exist, and the client had
> already been told it did. The durability gap was structural; the deployment was only the
> trigger.
> Solution: drain the queue on shutdown, and make the batch size *and* the flush interval
> bound the exposure explicitly — here, a 1-second flush interval reduced the window from
> 60 seconds to 1 second. Anything that must survive the window moved to synchronous
> writes.
> Prevention: write-behind only for data that is recomputable (counters, view counts,
> derived aggregates), never for facts with business consequences, and a load test that
> kills the process mid-write and asserts what was lost.

The honest position, and the one to give in an interview: **write-behind is a legitimate and
often correct choice for derived, recomputable, high-write-volume data** — view counters,
leaderboard aggregates, session touch timestamps, rate-limit budgets where a small loss is
acceptable. It is almost never correct for a fact that represents money, an order, or an
obligation. And the reason is not that "Redis is not durable" — Chapter 7 shows you can
make it durable with `appendfsync always` — it is that **durability in write-behind has to
be achieved by the write path becoming synchronous again, at which point you have paid the
latency and kept the complexity.** The second structural cost is eviction: an unflushed
dirty key is indistinguishable from a cold key to the LRU, so under memory pressure the LRU
will preferentially evict exactly the writes you have not yet persisted. That interaction
is the sharpest technical reason write-behind usually needs `volatile-*` eviction with
TTLs, which in turn constrains every other key in the same instance (Chapter 4).

### 3.5 Refresh-Ahead and Read-Repair: Moving Work Off the Request Path

Both of these are cache-aside plus a background worker, and both are the answer to a
specific and very common complaint: *"the p99 is 2.4ms because 1% of requests are
cold."*

**Refresh-ahead** has a worker pop keys that are about to expire and repopulate them before
they do. The user's request never sees a miss on an expiring key, so the expiry cliff
disappears. The design detail that matters enormously is that the worker must trigger
*before* expiry — the standard implementation is a sorted set of expiry timestamps
(`ZADD refresh:queue <expireAt> <key>`) and a worker that pops everything due within the
next N seconds, which is `O(log n)` to enqueue and `O(log n + m)` to drain.

```lua
-- refresh-ahead worker body, executed atomically on the single thread
local due = redis.call('ZRANGEBYSCORE', KEYS[1], '-inf', now + tonumber(ARGV[1]))
for i = 1, #due do
  local key = due[i]
  local value = loader(key)                     -- your function, may be slow
  if value then
    redis.call('SET', key, value, 'EX', ttl)
    redis.call('ZADD', KEYS[1], now + ttl, key)  -- re-arm
  else
    redis.call('ZREM', KEYS[1], key)             -- gone from the source; stop tracking
  end
end
```

The failure modes are specific and worth naming. (1) **The refresh worker becomes a load
amplifier**: when a deploy flushes the cache, the queue is empty and nothing is pre-warmed,
so the first N thousand requests are misses anyway. (2) **It is only as good as the
enqueue**: a key written without a `ZADD` to the refresh queue is never refreshed, and the
failure is silent. (3) **The worker can be slower than the expiry rate**, in which case it
chases its own tail forever and the queue grows without bound — the fix is a bounded queue
with an explicit drop policy, because a dropped refresh is just a miss, which the normal
path handles. (4) **Refresh-ahead and stampede are the same mechanism with opposite
outcomes**: if the worker refreshes *at* expiry instead of before it, N concurrent workers
(or N requests) all rebuild the same key. The difference is entirely the lead time, which
is why the reference implementations refresh at 90% of the TTL rather than 100%.

**Read-repair** is the other direction: serve the (possibly stale) cached value, and have a
background job notice and fix it. This is only appropriate when the staleness is provably
acceptable and detectable — a cache that stores a timestamp or a version alongside the
value, and a worker that recomputes anything older than a threshold. It is the right answer
for a *huge, expensive-to-compute, low-writethrough* value like an expensive aggregate
report, and the wrong answer for anything a user would call a bug, because read-repair
*guarantees* the user sees the stale value at least once.

> **STAFF-LEVEL CONSIDERATION**
>
> Both of these add a background worker, and a background worker is a component with its
> own deployment, scaling, monitoring, back-pressure and failure story. The design review
> question is not "is the algorithm right" but "**who runs the worker at 3am, and what
> happens if it stops**". A refresh-ahead queue that is not monitored silently converts
> every request into a cache-aside miss, which looks like a performance regression on the
> database rather than as a dead worker. At minimum the queue depth, the worker's
> processing lag, and the miss rate attributable to refresh failures are three numbers that
> should be on the same dashboard as the cache hit rate itself — because a cache hit rate
> that *rises* when the worker dies is the tell.

#### Common Mistakes

- Treating cache-aside as free, when a miss is a guaranteed double round trip and therefore
  a permanent step in the p99 that a hit-rate percentage does not describe
- Believing cache-aside is correct because the write path does not touch the cache — the
  write path *not* touching the cache is precisely why nothing tells the cache the value
  changed
- Write-through "for consistency", turning a Redis outage into a write outage for a
  database that is perfectly healthy, and gaining no atomicity for it because the two
  writes cannot be in one transaction
- Write-behind for anything with a business consequence, where the client has been told the
  write succeeded and it exists only in RAM
- Assuming the RDB or AOF makes write-behind safe, without noticing that the eviction policy
  will preferentially remove the unflushed dirty keys under memory pressure
- A refresh-ahead queue populated by a different code path than the one that writes the
  keys, so some keys are tracked and some are not, and the untracked ones silently expire
- Read-repair on a value a user would consider wrong, which guarantees the user sees the
  stale value at least once and is strictly worse than a miss
- Counting a cache hit rate as a success metric without a dashboard for the *miss* path —
  the hit rate is what the cache is doing, and the miss path is what your database is
  feeling

#### Interview Questions — Caching Strategies

**Q1. Walk me through cache-aside. What does it cost, and why is it still the default?**
`STAFF`

Read: application `GET`s the cache; on a hit it returns; on a miss it queries the database,
writes the value with a TTL, and returns. Write: the application writes the database, then
deletes or updates the cache key. The reason it is the default is structural, not
performative: the cache has no code path to the database, so nothing in the cache layer
can fail because the database is down, a loader bug is impossible by construction, and the
cache can be flushed or replaced without touching the application. The cost is that a miss
is always a double round trip — a Redis `GET` (0.2ms), the `SELECT` (2ms), and a `SETEX`
(0.2ms) — so a miss is roughly 2.4ms against a 0.2ms hit, and that step is in the p99
permanently. So the hit rate is a tail-latency control, not just a throughput one: 1% miss
puts a 2.4ms floor in the p99 that never goes away. The second cost is that cache-aside has
no invalidation path at all — the write does not go through the cache, so nothing tells it,
and the application must remember to delete. And the sharpest version of the failure: if
the miss path repopulates from a *replica* that has not caught up, the freshly-cached
value is the pre-write one, so the delete-on-write looks like it did nothing.

**Q2. When would you put the cache in the write path, and what do you get for it?**
`STAFF`

When read-your-writes is a business requirement for a specific read, and when you have
decided — explicitly — that cache availability is part of write availability. The concrete
cases are a checkout that reads the cart after modifying it, and a user who edits their own
profile and reloads. Write-through gives you the hit immediately after the write, and that
is the entire benefit; it is worth a great deal on those two flows and is worth nothing on
the other ninety-nine percent of writes. The costs are sharp. A cache outage becomes a
write outage, and the database is fine, which is a voluntary availability regression. The
double write is not atomic and cannot be made atomic — if the database write succeeds and
the cache write fails you have an inconsistency, and "retry" may double-apply while
"compensate" is a saga in application code. And it is only correct if *every* writer goes
through it: one admin script or one `psql` session that updates a row, and the cache is
permanently and silently wrong for that entity. So the sharper answer for most teams is
delete-on-write plus a read-your-writes exception for the two or three flows that need it,
which gets the guarantee without making the write path depend on Redis.

**Q3. Explain write-behind and tell me when you would refuse it.** `SCENARIO`

The application writes to the cache, returns success, and a background worker batches those
writes to the database on an interval or a size threshold. The write path becomes one
in-memory operation instead of a network call plus a `COMMIT` fsync, which is often a 5–50×
improvement — that part is real and it is why counters and view counts are written this
way. I would refuse it the moment the fact has a business consequence: an order, a payment,
a ledger balance, anything a customer will dispute. The reason is not that Redis is
in-memory; Chapter 7 shows you can make it durable with `appendfsync always`, and the
honest answer is that making write-behind durable means the write path becomes synchronous
again — you have paid the latency and kept the complexity. Two other failure modes deserve
the airtime: under memory pressure the eviction policy treats an unflushed dirty key as a
cold key, so the LRU preferentially evicts exactly the writes you have not persisted; and
a second reader can observe an unflushed value and make a decision based on a fact the
database does not have, which is a correctness divergence, not just data loss.

**Q4. Refresh-ahead versus read-repair — when does each earn its worker?** `TRICKY`

Refresh-ahead is for a value that is expensive to compute, written often, and read far more
often than written — a product page, an aggregate. It moves the repopulation *before* the
expiry so the request path never sees the miss, and the whole point is the lead time: a
worker that refreshes at 90% of the TTL has a 10% window of slack, while a worker that
refreshes at 100% is indistinguishable from a stampede. Read-repair is for a value that is
expensive, read-mostly, and where serving a *slightly* stale answer immediately and fixing
it in the background is acceptable — an expensive report, a leaderboard, a recommendation
list. Its cost is that it *guarantees* the user sees the stale value at least once, which
is strictly worse than a miss, so it is only acceptable where the user would not call it
wrong. Both share the real cost, which is not the algorithm: it is that you now own a
background worker with its own deployment, back-pressure and monitoring, and a
refresh-ahead queue that is not being drained converts every request into a
cache-aside miss — which shows up as a database performance regression, not as a dead
worker.

**Q5. Your hit rate is 94% and the service is fine. Your hit rate is 91% and it is an
incident. Why?** `ADVANCED`

Because 94% and 91% are not comparable numbers. The hit rate has to be read against the
cost of a miss and the shape of the misses. Three thousand basis points of misses spread
evenly across a large keyspace is 0.6% extra load on the database and nobody would notice.
Three thousand basis points concentrated on 200 hot keys is 200 keys generating all the
traffic, each expiring periodically, which is a stampede with a period — the misses arrive
in synchronised waves, not as a uniform trickle, and the database sees 200 concurrent 200ms
queries rather than a 3% increase in a 50-connection pool. The other half of the answer is
that a hit rate is a *ratio* and hides the absolute count, so the number to put on the
dashboard next to it is misses per second and the p99 latency of the miss path, and the
specific decomposition is misses split by cause — absent, expired, evicted. Those three
have completely different fixes (the first is a modelling problem, the second is a TTL
policy problem, the third is a `maxmemory` sizing problem) and a single hit rate cannot
distinguish them. The version of this that gets asked in a staff interview: tell me how
you would find out that your hit rate dropped by three points, and the answer is that you
have never instrumented the reason, so you cannot.

> **CHAPTER 3 SUMMARY**
>
> The six strategies differ in exactly two decisions: where the write happens, and who owns
> the read path on a miss. Cache-aside is the default because of a structural property
> most candidates miss — the cache has no code path to the database, so a loader bug is
> impossible and a cache failure is a performance event rather than an availability one.
> Its cost is equally concrete: a miss is a guaranteed double round trip, which puts a
> permanent step in the p99 that the hit rate does not describe, and it has *no*
> invalidation path, so every stale value is application code that forgot. Write-through
> buys read-your-writes at the price of putting the cache in the write path without gaining
> any atomicity across two independent systems — worth it on two or three flows, wrong
> everywhere else. Write-behind is the only strategy that makes writes cheaper, and it
> requires a durability story that almost nobody writes, with the sharpest technical
> consequence being that an unflushed dirty key looks exactly like a cold key to the
> eviction policy. Refresh-ahead and read-repair both move work off the request path, and
> both are really proposals to own a background worker whose failure mode is a silent
> conversion back to cache-aside.

#### Further Reading

- [Redis documentation — Cache eviction](https://redis.io/docs/latest/develop/use/patterns/) — the caching patterns Redis itself documents, including the ones with no built-in implementation.
- [Caching Patterns](https://www.infoq.com/article/caching-strategies/) — the six-way taxonomy most interview questions are drawn from, with the trade-offs stated.
- [Redis documentation — Write-behind caching](https://redis.io/docs/latest/develop/use/client-side-caching/) — the write-behind mode in the client-side caching docs, including when the write is actually flushed.
- [Spring Framework — Cache Abstraction](https://docs.spring.io/spring-framework/reference/integration/cache.html) — how `CacheManager` and `@Cacheable` map onto these strategies, and the annotation-level cache resolution rules.

## Chapter 4 — Eviction Policies & Memory

### 4.1 `maxmemory` Is a Write

The first thing to get right about eviction is that it is not a background janitor. When
`maxmemory` is reached, **the write command itself triggers eviction on the main thread
before it is applied.** This is a design choice with two consequences people do not expect:

- **Writes get slower as memory fills.** Eviction sampling (see §4.3) runs on the
  command path, so a server near `maxmemory` has a measurably higher write p99 than one at
  60% — even when nothing is actually being evicted, because the check runs. A benchmark
  run at low memory and a benchmark run at 95% memory are not comparable, and a lot of
  "Redis got slower this month" reports are this.
- **A full server with `noeviction` rejects writes.** Not slow writes — *rejected* writes,
  with an OOM error, which the client surfaces as an exception. If that Redis is a session
  store, every login fails. If that Redis is a rate limiter, the limiter errors, and whether
  that fails open or closed depends on your code.

```bash
redis-cli CONFIG GET maxmemory maxmemory-policy
# 1) "maxmemory"
# 2) "maxmemory"
# 3) "0"
# 4) "allkeys-lfu"

redis-cli INFO memory
```

### 4.2 The Policy Matrix, and the `allkeys` vs `volatile` Distinction

| Policy | Evicts keys with a TTL? | Evicts keys without a TTL? | Right for |
| --- | --- | --- | --- |
| `noeviction` | Never | Never | A database, a queue — anything where data must not be silently deleted |
| `allkeys-lru` | Yes | Yes | A pure cache |
| `allkeys-lfu` | Yes | Yes | A pure cache with skewed access |
| `allkeys-random` | Yes | Yes | Nobody's real reason; a benchmark baseline |
| `volatile-lru` | Yes | **No** | An instance where *only* TTL keys may be dropped |
| `volatile-lfu` | Yes | **No** | Same, with skewed access |
| `volatile-random` | Yes | **No** | Rarely right |
| `volatile-ttl` | Yes (shortest TTL first) | **No** | Very specific: a keyspace where near-expiry is the best eviction candidate |

And here is the configuration bug that costs a real afternoon, that is genuinely on
examinations, and that most people have never triggered:

```text
  !  volatile-lru ON A KEYSPACE WITH NO TTLs
  ─────────────────────────────────────────
  Setup:   maxmemory 8gb
           maxmemory-policy volatile-lru
           The app caches with SET key value   ← no EX, no PX, no EXPIRE.
           (Which is what a library does by default if you did not configure a TTL.)

  Behaviour:
    Server fills to 8gb.
    Write arrives. Redis selects eviction candidates = keys WITH a TTL.
    There are ZERO such keys.
    Redis cannot evict anything.
    Redis's memory cannot reach maxmemory.
    Redis's documented behaviour: the write command returns an OOM error.
    maxmemory is exceeded. Keys are NOT dropped.

  The result is the exact opposite of the configured intent:
    "volatile-lru" was chosen to protect my persistent keys.
    It instead produced a server that hard-fails writes at 8gb
    while holding 8+ gb of data, with no eviction, and no obvious
    reason from the outside — because the config *looks* like it
    is evicting something.

  Diagnosis once you are in there:
    INFO memory  →  used_memory is above maxmemory
    CONFIG GET maxmemory-policy  →  "volatile-lru"
    redis-cli --bigkeys         →  all keys, no TTLs
    The count that proves it:
      redis-cli EVAL "return #redis.call('keys','*')" 0 | wc -l
      redis-cli DEBUG OBJECT key  →  "lru", no "expire" field

  The two-line post-mortem:
    "volatile-* policies only consider keys with an expiry set. A keyspace
     where nothing has a TTL has no eviction candidates, so the server
     goes to OOM on writes instead of evicting. If you want the keyspace
     evicted, you must use an allkeys-* policy. volatile-* is for
     keyspaces where some keys are genuinely not allowed to be evicted."

  Which is EXACTLY backwards from what the name suggests, and that is
  why it is worth an entire callout rather than a line in a table.
```

> **INTERVIEW TRAP — "I SET volatile-lru SO MY IMPORTANT KEYS ARE SAFE"**
>
> The name says the important keys are protected, and the mechanism is the opposite of what
> most people expect. A `volatile-*` policy restricts the eviction *candidate set* to keys
> that have an expiry set. If your keyspace has no TTLs, the candidate set is empty, Redis
> cannot evict anything, `used_memory` grows past `maxmemory`, and the next write is
> **rejected with an OOM error** — you get a hard write failure instead of the graceful
> eviction you configured. So the rule is: `allkeys-*` for a keyspace that is entirely
> evictable (a read-through cache), `volatile-*` for a keyspace that is *mixed* and where
> some keys are not allowed to be dropped, and `noeviction` for a keyspace that is none of
> them. The check that catches this before production is trivial and belongs in your config
> review: if you are choosing a `volatile-*` policy, verify that a non-trivial number of
> keys actually have a TTL, and if your library sets TTLs for you, verify that it does so
> on *every* write path including the error paths.

There is a related and even quieter version of this: **`volatile-lru` where a small
fraction of keys have TTLs**. Say 2% of keys have a TTL because one code path bothers to
call `EXPIRE`. Memory fills, Redis evicts from that 2%, that 2% is gone, the remaining 98%
cannot be evicted, and you go OOM. The 98% is not "protected" — it is *immortal until the
process dies*. The introspection command that finds this is worth knowing by name:

```bash
redis-cli --memkeys -i 1        # sample for memory per key
redis-cli INFO memory
#   used_memory:8589934592        ← == maxmemory; eviction is now on the write path
#   used_memory_rss:9663676416
#   mem_fragmentation_ratio:1.12
#   evicted_keys:0                ← ! zero evictions with memory at maxmemory
#                                     means no eligible candidates
#   expired_keys:4194304
#   keyspace_hits / keyspace_misses
```

**`evicted_keys:0` while `used_memory` is at `maxmemory` is the diagnostic signature of
this bug**, and it is a one-glance check that belongs in anyone's Redis runbook.

### 4.3 LRU Is Approximate, and How the Approximation Works

Redis does not maintain a true LRU list. A true LRU requires updating a recency field on
every access to every key, which would put a write on the read path — the exact opposite
of the design. Instead Redis uses **random sampling**:

```text
  On a write that would exceed maxmemory:
    1. Sample `maxmemory-samples` random keys (default 5)
    2. Evict the one that looks closest to the eviction objective
       (oldest for LRU; lowest counter for LFU)
    3. Repeat until the write fits
    4. If, after 4× the sample size, nothing suitable was found:
       abort the eviction and return an OOM error

  Sampling 5 keys:  fast, and the *approximation error grows with the
                    skew* of your access distribution.
  Sampling 10:      ~2× the CPU cost of 5, and a materially better
                    eviction choice.

  "Flushed" is also a real eviction object: Redis seeds its random
  sample with recently-flushed keys, so a cache flush degrades
  gracefully instead of immediately attacking the surviving hot set.
```

The error analysis is what earns the question. With uniform access, sampling 5 keys gives
you an excellent estimate of the global LRU — sampling theory means the sample minimum is a
good estimator when the distribution is flat. With **skewed** access, which is the normal
case for a cache, sampling 5 can miss the truly cold keys entirely, because a cold key has
a low probability of being in a 5-key random sample of a 10-million-key space. The
empirical result, and the practical guidance, is that `maxmemory-samples 10` is a good
default for a production cache and that the difference between 5 and 10 is the difference
between a hit rate that degrades gracefully and one that falls off a cliff. The cost is
CPU on the write path, which is exactly the trade you are making.

### 4.4 LFU and the Decay Counter

LFU fixes LRU's characteristic weakness: **LRU has no memory of frequency, so a burst of
scans destroys the hot set.** A crawler walks 500,000 cold keys in 30 seconds and every one
of them is now more recently used than the keys serving 4,000 requests per second, so a
pure LRU evicts exactly the keys that matter. LFU evicts by *how often* a key has been
used, so the hot set survives a scan.

The implementation is an 8-bit counter per key, visible with `OBJECT FREQ`:

```text
  The counter:
    • 0–255, saturating. One byte per key, always.
    • Incremented on ACCESS (reads that count toward the LFU counter).
    • Increments are applied LOGARITHMICALLY, not linearly, so that a key
      with 200 hits does not count 200× a key with 2 hits. This is what
      keeps a single pathological client from dominating the ranking.
    • Decays toward 0 on a time constant, so "frequently used" means
      "frequently used recently". Decay is scaled by lfu-decay-time and
      lfu-log-factor.

  Configuration:
    lfu-decay-time   1        (0 = no decay: pure "frequently used ever",
                                which is usually wrong for a cache
                                because it is permanently insensitive
                                to a change in the traffic pattern)
    lfu-log-factor   10       (the recommended value; lower = more
                                aggressive discounting of old hits)

  The trade:
    LRU   — perfectly tracks "most recently used". Zero memory overhead.
            Blind to frequency. One scan destroys it.
    LFU   — tracks frequency with a decaying counter. Survives scans.
            One byte per key. Slower to react to a genuine change in
            the access pattern (that is what the decay is for).
```

> **TRADE-OFF — "LRU OR LFU?"**
>
> The condition that flips the answer is **whether your access distribution is skewed and
> whether it is stationary.** If the hot set is genuinely hot and stable — a product
> catalogue read far more than a session store, a set of 5,000 keys carrying 90% of traffic
> — LFU is better, and dramatically so, because a crawler, a full scan, a
> `FLUSHDB` during a bad deploy, or a burst of one-off lookups will not evict the hot set,
> which pure LRU cannot survive. If the working set *moves* — a flash crowd, a product
> launch, a seasonality change, a job that suddenly reads a different table — LRU adapts
> instantly and LFU adapts at the decay constant, so LFU's ranking is describing traffic
> that no longer exists. And there is a real memory cost: LFU uses one byte per key, which
> sounds like nothing and is 1 MB on a 1-million-key instance, but it is also a *different
> object layout* and on large hash tables it is not free. The pragmatic industry answer,
which is also the honest one: **LFU is the better default for a read-through cache with
skewed traffic, LRU is the right answer when the working set genuinely moves, and the way
to find out which you have is to enable `maxmemory-policy allkeys-lfu` on a canary and
compare hit rates over a week rather than deciding from a blog post.**

### 4.5 Fragmentation and the `INFO memory` Fields That Matter

`maxmemory` is compared against `used_memory`, which is Redis's *own* accounting of
allocated data — not the process RSS. The gap between the two is fragmentation, and it is
where a Redis "using twice as much memory as I computed" incident lives.

```text
  used_memory        → what Redis thinks it allocated for data
  used_memory_rss    → what the OS sees the process actually resident
  mem_fragmentation_ratio = used_memory_rss / used_memory

  ratio ≈ 1.0–1.5   → healthy
  ratio > 1.5        → significant allocator fragmentation. Data is spread
                       across many small allocations that cannot be returned
                       to the OS even after being freed.
  ratio > 2.0        → investigate. Usually one of:
                       • jemalloc arena count too high for the allocation
                         pattern (activedefrag is the tool)
                       • a large value that grew and shrank, leaving a
                         region that cannot be released
                       • the OS not returning freed pages (RSS lag)
  ratio < 1.0        → possible swap, or the OS reclaiming pages faster
                       than Redis notices. Suspicious in a container.
```

In a **container**, there is a second, sharper fragmentation problem: the cgroup memory
limit counts the process RSS plus the page cache, and the kernel will `OOMKill` the largest
process in the cgroup before the `maxmemory` check ever fires. So a container with a 2 GB
limit and `maxmemory 1900mb` can still be OOM-killed by the kernel, and the distinction
matters enormously during triage: **an OOM kill in the kernel log is not a Redis eviction.**
`redis-cli INFO memory` showing `used_memory` at 400 MB while the container died is a
completely different incident from `used_memory` at `maxmemory`, and conflating them sends
the investigation in the wrong direction for an hour.

```bash
redis-cli CONFIG SET activedefrag yes     # jemalloc incremental defrag, 4.0+
redis-cli INFO memory
redis-cli MEMORY STATS
redis-cli MEMORY MALLOC-STATS
redis-cli MEMORY PURGE                      # returns freed pages to the OS now
redis-cli MEMORY DOCTOR                    # top allocators, by bytes
```

The fields worth having on a dashboard, and the question each one answers:

| Field | Question it answers |
| --- | --- |
| `used_memory` | Are we approaching `maxmemory`? |
| `used_memory_rss` | Is the container about to be OOM-killed by the kernel? |
| `mem_fragmentation_ratio` | Are we paying for allocator slack? |
| `evicted_keys` (from `INFO stats`) | Is eviction running, and at what rate? Should be **0** on a healthy cache |
| `expired_keys` | Is TTL expiry dominating eviction? A high ratio means your keyspace is TTL-driven |
| `keyspace_hits` / `keyspace_misses` | Hit rate — the number everyone looks at first and that means nothing without the miss cause |
| `instantaneous_ops_per_sec` | Load |
| `total_net_input_bytes` / `total_net_output_bytes` | Bandwidth, which is often the real limit before memory is |
| `rejected_connections` | The `maxclients` ceiling is being hit — a pool-size problem |
| `current_eviction_exceeded_time` | How long the eviction loop ran in the last attempt; high values mean eviction is struggling to keep up |

> **SCALING REALITY CHECK**
>
> Memory per element is the number that decides whether your keyspace fits, and the rule of
> thumb most people carry — "a Redis key costs about 100 bytes" — is roughly right for a
> small string and badly wrong in both directions. A tiny key (`SET flag 1` on a 1-byte
> value) costs on the order of **50–100 bytes**: the value, a dictEntry of ~24 bytes, a
> robj header, a `sds` header, and jemalloc's own per-allocation rounding and size-class
> overhead of 8–16 bytes per allocation. A 1 KB string costs roughly 1.1 KB, because the
> fixed overhead is now amortised. A 1 MB value costs roughly 1.1 MB. So a keyspace of
> 10 million tiny counters — which is exactly what a naive rate limiter or a
> flag-per-entity design produces — is **1 GB of overhead around 10 MB of data**, and the
> `MEMORY USAGE` command is the only way to find that before you are at 80% `maxmemory`
> in production. The two mitigations, in order: use a hash with many small fields instead of
  many small keys (`HSET counters 1 1 2 1 3 5` is one key, not three), and use
  `ziplist`/`listpack` or `intset` encodings where the shape allows, which is what the
  automatic encoding switch of §2.3 is doing for you.

#### Common Mistakes

- Choosing `volatile-lru` because the name sounds like it protects important keys, on a
  keyspace where nothing has a TTL — which produces an OOM rejection on writes at
  `maxmemory` with zero evictions, the exact opposite of the intent
- Not knowing that `evicted_keys:0` while `used_memory` is at `maxmemory` is the
  diagnostic signature of "no eligible eviction candidates"
- Believing `maxmemory` bounds the process — it bounds Redis's own accounting; the kernel's
  cgroup limit and the OOM killer are separate, and a container can be OOM-killed at
  400 MB with `maxmemory 1900mb`
- Treating `mem_fragmentation_ratio` as noise rather than as the explanation for a keyspace
  that is twice the size the arithmetic predicted
- Treating a hit rate as a health metric without `evicted_keys`, `expired_keys` and
  bandwidth on the same dashboard
- Assuming eviction is a background janitor, and being surprised that write latency rises
  as memory fills
- Setting `lfu-decay-time 0` and describing it as "LFU with no decay" without noting that
  this makes the ranking permanently insensitive to a change in the traffic pattern
- Estimating keyspace memory from payload size and forgetting that a 1-byte value still
  costs 50–100 bytes — the difference between a 1 GB and a 100 MB keyspace at 10 million
  keys

#### Interview Questions — Eviction & Memory

**Q1. `maxmemory-policy volatile-lru`. What happens when the keyspace has no TTLs?** `STAFF`

The write fails. A `volatile-*` policy does not mean "evict the expiring keys first" — it
means "**restrict the eviction candidate set to keys that have an expiry set**." With no
TTLs, that set is empty, so Redis cannot evict anything, `used_memory` continues past
`maxmemory`, and the next write is rejected with an OOM error. The instance does not
degrade gracefully, it stops accepting writes while holding more memory than you
configured, and the config *looks* like it is doing something. The correct mapping is:
`allkeys-*` when the entire keyspace is evictable, which is a read-through cache;
`volatile-*` when the keyspace is mixed and some keys genuinely must not be dropped, and
you have verified that a meaningful fraction actually has a TTL; `noeviction` when nothing
may be silently deleted. The one-glance diagnostic is `INFO stats | grep evicted` — zero
evictions while `used_memory` is at `maxmemory` is exactly this bug, and it is worth
knowing because a partial version of it, where 2% of keys have TTLs, is even quieter: it
evicts those 2%, goes OOM on the other 98%, and the 98% are not protected, they are
immortal until the process dies.

**Q2. When is LFU better than LRU, and what does it cost?** `TRICKY`

When the access distribution is skewed and stationary, and specifically when something
will walk a large cold portion of the keyspace. LRU has no memory of frequency at all — a
crawler, a `FLUSHDB` during a bad deploy, a batch job that reads 500,000 one-off keys, or
a bot scanning for `user_id` values, all make those keys "most recently used" and a pure
LRU evicts precisely the hot set that was carrying your traffic. LFU ranks by an 8-bit
frequency counter with logarithmic increments and a time-based decay, so the hot set
survives the scan. The cost is one byte per key, which is real on a large keyspace and is
not the whole story — the counter is part of the object layout, and the more important cost
is *adaptivity*. LFU's ranking describes recent history, so if the working set genuinely
moves — a flash crowd, a product launch, a seasonal shift — LLR adapts on the next access
while LFU adapts only at the decay constant, and during that window LFU is defending a hot
set that no longer exists. The flip side of the same argument is that `lfu-decay-time 0`
(no decay) is usually the wrong choice, because it makes the ranking permanently
insensitive to exactly the change the decay exists to track. The way to decide is to run
`allkeys-lfu` on a canary and compare hit rates over a week, not to pick from a rule of
thumb.

**Q3. Your Redis instance has 4 GB of `maxmemory` and is filling up. Walk me through
`INFO memory` and what each number tells you.** `ADVANCED`

`used_memory` is Redis's own accounting of allocated data and is what `maxmemory` is
compared against. `used_memory_rss` is what the OS sees resident, and
`mem_fragmentation_ratio` is the ratio between them — 1.0–1.5 is healthy, above 1.5 means
you are paying real money for allocator slack, and above 2.0 usually means jemalloc
arenas or a large value that grew and shrank. Then `evicted_keys` and `expired_keys` from
`INFO stats`, which is where the *reason* for the pressure is: a high `expired_keys` count
means a TTL-driven keyspace, and a rising `evicted_keys` means you are at the ceiling.
Zero `evicted_keys` with `used_memory` at `maxmemory` is the `volatile-*`-with-no-TTLs
signature from Q1. And in a container there is a separate ceiling entirely: the cgroup
limit and the kernel OOM killer, which will `OOMKill` the process at 400 MB while
`maxmemory` says 1,900 MB, so a container OOM kill is not a Redis eviction and the two
must be distinguished during triage or the investigation goes the wrong way for an hour.
`current_eviction_exceeded_time` is the one people miss — it is how long the eviction loop
ran in the last attempt, and high values mean eviction is falling behind the write rate
rather than keeping up.

**Q4. Estimate the memory for 10 million counters, and then tell me how to make it
cheaper.** `TRICKY`

Not 10 MB. A `SET flag <n>` with a one-byte value costs on the order of 50–100 bytes
resident: the value itself, a `dictEntry` of roughly 24 bytes, the `robj` and `sds`
headers, and jemalloc's per-allocation rounding and size-class overhead of 8–16 bytes per
allocation. So 10 million counters is roughly **500 MB to 1 GB of memory for about 10 MB of
payload**, and `MEMORY USAGE` on a real key is the only way to know which end you are on.
Three ways to make it cheaper, in increasing order of how much they change the design. (1)
`MEMORY USAGE key` on a representative key and multiply, rather than estimating from
payload — the estimate is where the incident comes from. (2) Use one hash instead of many
keys: `HSET counters <id> <n>` is one key with 10 million fields, and small hashes use the
contiguous listpack encoding with roughly 3 bytes of pointer per entry instead of a
hashtable's ~50 — though note the automatic switch to hashtable at 128 fields, so this
works in batches of counters, not for one unbounded hash. (3) Bitmaps, if the domain is
dense integers: 10 million bits is 1.25 MB, and `BITCOUNT` over a range answers
"how many are set in this window" in one operation. The honest framing is that
optimisation 3 changes the access pattern from "look up one counter" to "count a range",
so it is only right if that is the question you actually ask.

**Q5. Your cache hit rate dropped from 94% to 91% overnight. What do you do?** `SCENARIO`

First, resist the obvious response, which is to add memory. A three-point hit rate drop is
either a change in the keyspace, a change in the traffic, or a change in the eviction
behaviour, and adding memory treats a symptom that may not be a capacity problem at all.
In order: check `evicted_keys` and `expired_keys` in `INFO stats` — a step change in
evictions means the working set grew or the policy changed, and a step change in expiries
means a deploy changed TTLs. Check `INFO memory` for `used_memory` approaching
`maxmemory`, and check whether `maxmemory-policy` is what you think it is, because a
config change from `allkeys-lru` to `volatile-lru` produces exactly this symptom and
exactly zero evictions. Check whether a key that used to be a single key is now N keys,
which is the most common cause and is invisible in a hit rate. Then check the traffic: a
new endpoint, a crawler, or a bot scanning for non-existent IDs all shift the distribution,
and the bot case is Chapter 5's penetration problem showing up as a hit-rate drop. The
staff-level answer is the one about instrumentation: if you cannot decompose the miss rate
into *absent / expired / evicted*, you cannot diagnose this, and that decomposition should
have been on the dashboard before the incident rather than during it.

> **CHAPTER 4 SUMMARY**
>
> Eviction is not a background process — it runs on the write path, on the single thread,
> before the command is applied — so a server near `maxmemory` has a measurably higher
> write p99 than one at 60%, and a full server under `noeviction` rejects writes rather
> than slowing them. The configuration bug worth knowing cold is that a `volatile-*` policy
> does not "evict expiring keys first", it *restricts the candidate set* to keys with a
> TTL; with no TTLs the set is empty, nothing is evicted, `used_memory` passes
> `maxmemory`, and writes are rejected with an OOM error. The diagnostic signature is
> `evicted_keys:0` at `maxmemory`, and the correct mapping is `allkeys-*` for an entirely
> evictable keyspace, `volatile-*` only for a verified mixed one, `noeviction` when nothing
> may be dropped. LFU beats LRU exactly when a scan will happen, because LRU has no memory
> of frequency and one crawler destroys the hot set; LRU wins when the working set genuinely
> moves, because LFU's decayed ranking is describing recent history and adapts slowly. And
> the memory arithmetic people get wrong is per-*key* overhead, not per-byte: 10 million
> one-byte counters is 500 MB to 1 GB, not 10 MB.

#### Further Reading

- [Redis documentation — Eviction](https://redis.io/docs/latest/develop/reference/eviction/) — the policy list, the sampling algorithm, and the exact OOM behaviour of `volatile-*` with no eligible keys.
- [Redis documentation — Key eviction](https://redis.io/docs/latest/develop/reference/eviction/#maxmemory-policies) — the `maxmemory-samples` and LFU counter parameters, with the decay formula.
- [Redis documentation — INFO memory](https://redis.io/docs/latest/commands/info/) — every field in the memory section and what it measures.
- [Redis documentation — Memory optimization](https://redis.io/docs/latest/operate/oss_and_stack/management/optimization/memory-optimization/) — the encoding thresholds and the fragmentation/active-defrag guidance.
- [Redis documentation — `OBJECT FREQ`](https://redis.io/docs/latest/commands/object-freq/) — reading the LFU counter directly, which is the only way to see what the ranking is actually based on.

## Chapter 5 — The Three Classic Cache Bugs

### 5.1 Why These Three and Not Others

Every caching system has a long list of failure modes. Three get names because they are
common, cheap to cause, expensive to detect, and each has a fix that is a small amount of
code:

| Bug | One line | Who is attacking or helping you |
| --- | --- | --- |
| **Cache stampede** (thundering herd) | One key expires; N concurrent requests all miss and all hit the database | Time — expiry is a synchronising event |
| **Cache penetration** | Requests for keys that do not exist never populate anything | An attacker, or a bug, manufacturing misses |
| **Cache avalanche** | Many keys expire at the same instant | A deploy, a flush, or a config that set every TTL to the same value |

They are distinct and the fixes are not interchangeable, and the interview question is
almost always "name all three and their fixes" — which is a recall question, and therefore
the *easy* part of the interview. The marks are in the arithmetic: being able to say what
happens at 4,000 QPS against a 50-connection pool, and which of the four stampede fixes
costs which trade-off.

The three all share a root cause worth naming up front: **a miss is the expensive path,
and these are three different ways to make the miss path happen more often than the system
was sized for.** Stampede makes many simultaneous misses on a key that *is* real.
Penetration makes misses on keys that do not *exist*. Avalanche makes the misses correlate in
time rather than in key.

### 5.2 Cache Stampede: The Arithmetic of Collapse

The scenario, stated with the numbers so it can be reasoned about rather than
hand-waved:

```text
  THE SETUP
  ─────────
  A key `product:popular:deals` is read 4,000 times per second.
  It is a single key — the homepage "deals of the day" panel.
  It is backed by a 40-million-row products table.
  The query to rebuild it is a GROUP BY over a date range on an
  unindexed expression. It takes 200 ms on a warm buffer pool.
  The application has a database connection pool of 50.

  THE EVENT
  ─────────
  The key has a 300-second TTL. At t=0 the TTL expires.

  BEFORE t=0
    4,000 req/s × 0.2 ms  =  800 connections... no.
    4,000 req/s served from one cache hit each: ~0.2 ms each.
    The connection pool is idle. The database is idle.

  AT t=0
    Every one of the next 4,000 requests finds an expired key.
    Every one of them runs the same 200 ms query.
    Every one of them tries to take a connection from a pool of 50.

  THE ARITHMETIC
  ─────────────
    Offered load           : 4,000 queries/second
    DB capacity            : 50 connections / 0.200 s  =  250 queries/second
    Overshoot              : 4,000 / 250  =  16×  the database can serve
    Backlog build rate     : 4,000 - 250  =  3,750 requests/second accumulating
    Time to drain 4,000    : 4,000 / 250  =  16 seconds
    Time to drain 1 minute : 60 × 4,000 / 250 =  960 seconds  =  16 minutes

  WHAT ACTUALLY HAPPENS (and this is the part that matters)
    • 50 requests get connections. 3,950 block on the pool.
    • Pool acquisition timeout is typically 2–30 s. Requests time out.
    • Timed-out requests return 500s to users. The incident page fires.
    • On a *multi-instance* deployment (say 20 pods), each pod has its own
      pool of 50 = 1,000 connections, and the database connection limit is
      typically 100–200. So you exhaust the DATABASE's connection limit, not
      just your own pool, and now every service sharing that database is down.
    • Automatic retries (HTTP client, resilience library, service mesh) multiply
      the load. A 3× retry policy turns 4,000/s into 12,000/s offered.
    • Because the misses all take 200 ms and the first successful SETEX lands
      at t=200ms, the stampede *does* end quickly — unless the requests are
      spread over the TTL's whole "expiry" granularity, or the value is
      evicted again immediately under memory pressure.
```

The timeline is worth drawing, because the *shape* of it is the diagnosis:

```text
  QPS hitting the DB
  4000 ┤        ┌─┐
       │        │ │  ← 4,000 concurrent misses, 250 QPS served
   250 ┤────────┴─┴────────── DB capacity (pool of 50 @ 200ms)
       │
     0 ┼───────┬────────┬───────┬──────────────────────────►
       0     200ms     1s      2s
                │
                └── the FIRST successful rebuild writes the key.
                    Every later request hits the cache again.
                    The stampede lasts 200ms of *useful* work and
                    200ms of *queueing* — and 3,750 requests timed
                    out in the meantime.

  !  THE VARIANT THAT DOES NOT SELF-HEAL:
    If the rebuild takes 8 s instead of 200 ms (cold buffer pool, concurrent
    index build, a table lock held by something else), the stampede lasts
    8 s and the database is at 250 QPS of pure cache-miss load for 8
    seconds. That is usually enough to take the primary down properly,
    at which point the cache never gets repopulated at all.
```

> **SCALING REALITY CHECK**
>
> The number that decides whether you have a stampede problem is **the ratio of your read
> QPS on one key to your database's capacity**, and it only needs to exceed 1.0 to hurt.
> A key read 4,000 times a second against a database that can serve 250 queries a second is
> a 16× overshoot — and the *only* thing that keeps it from being permanent is that the
> first successful write ends it. The condition for that self-healing to fail is a rebuild
> slower than about `pool_size / QPS` seconds (here 50/4,000 = 12.5 ms — a 200 ms rebuild
> is 16× over that line, so it self-heals; a 2 s rebuild does not). The secondary condition
> is multi-instance: 20 pods × a pool of 50 is 1,000 connections against a database whose
> global limit is often 200, so you exhaust the *shared* limit and take down every other
> service on the same instance. The fix for that specific failure is not a better cache
> strategy — it is making the connection pool a *deliberate* fraction of the database's
> limit, which is Volume 6's material.

**The four fixes, with their real trade-offs:**

**Fix 1: The mutex (single-flight).** Only one request rebuilds; the rest wait or serve
stale.

```lua
-- singleflight.lua
-- KEYS[1] = the cache key.  ARGV[1] = ttl seconds, ARGV[2] = lock seconds
local cached = redis.call('GET', KEYS[1])
if cached then return cached end
if redis.call('SET', KEYS[1 .. ':lock', '1', 'NX', 'EX', tonumber(ARGV[2])) then
  -- we own the rebuild
end
```

The honest version in Java/Kotlin is a per-key `ConcurrentHashMap<K, CompletableFuture<T>>`
— a **single-flight** helper — so that N concurrent misses for key K produce exactly one
loader and N−1 waiters on the same future. That is a *process-local* mutex, which has the
right properties: no lock key in Redis, no lock TTL to tune, no failure mode where the lock
is held by a dead process.

The trade-offs:

- **It is per-process.** 20 pods means 20 concurrent rebuilds, not 1. That is 20 × 200 ms
  queries instead of 4,000, which is a 99.5% reduction — fine — but the number is pods ×
  QPS_per_pod, and at 200 pods with a 4,000 QPS total you still get 200 concurrent
  rebuilds. A distributed mutex (a Redis lock key) fixes that and costs you a lock
  protocol.
- **Waiters block.** A thread per waiter is a thread pool slot, and 4,000 waiters is 4,000
  blocked threads. In a reactive stack the waiters hold a request context and a connection
  from the *HTTP* side. The alternative — serve stale while one request rebuilds — is
  strictly better and is Fix 3.
- **The lock can be orphaned.** The Redis-lock version needs a TTL and needs to handle
  "the holder died mid-rebuild", and a naive implementation deadlocks the key until the
  TTL expires.
- **It fixes exactly one thing.** The mutex prevents concurrent rebuilds. It does not
  prevent a *sequential* pile-up: 4,000 requests arriving over 10 seconds with a 200 ms
  rebuild will each find the cache empty at their moment, get the lock in turn, and rebuild
  4,000 times. In practice the rebuild is faster than that, but not always.

**Fix 2: Probabilistic early expiry (the XFetch algorithm).** Each reader decides
independently whether *it* should be the one to refresh, with a probability that rises as
the TTL approaches.

```lua
-- Each call: return the value, and refresh early with probability p.
--   p grows from 0 to 1 as (now - retrievedAt) approaches the TTL.
local value, retrievedAt, ttl = unpack(ARGV)
local elapsed  = now - retrievedAt
local p        = (elapsed / ttl) * (elapsed / ttl)     -- quadratic ramp
if math.random() < p then
  return loader(KEYS[1])     -- one unlucky request does the work
else
  return value                -- everyone else serves the cache
end
```

The elegance is that there is **no lock and no coordination at all** — each reader rolls
its own die, and because the probability ramps continuously, exactly one request is
expected to win in the last few percent of the TTL. With 4,000 requests per second and a
300-second TTL, roughly 400 requests/second arrive in the final second where `p` is
approaching 1, so the race is a genuine race but the *expected* number of winners is
small. The trade-offs: it needs the retrieval timestamp stored alongside the value (so the
value is a tuple, or a hash with `value` and `fetchedAt` fields), it is probabilistic so
you cannot *guarantee* single-flight — on a low-QPS key, `p` may never reach a value
where anyone wins and you can get a genuine stampede of 3, and it is non-deterministic
which makes it hard to test. It also does nothing for a key that is *evicted* rather than
expired, because the eviction removes the value and there is no "retrievedAt" left to
reason about.

**Fix 3: Stale-while-revalidate (serve stale, refresh in background).** The industry
answer, and the one to lead with.

```text
  Store the value WITH its intended TTL as DATA:
      SET product:deals '{"ttl":300, "data":{...}}'      ← no Redis TTL at all
      (or HSET product:deals data '{...}' fetchedAt 1770000000 ttl 300)

  Read path:
    1. GET the key. Always a hit — Redis never expires it.
    2. age = now - fetchedAt
    3. If age <= soft_ttl   (e.g. 300s):  return fresh
       If age <= hard_ttl   (e.g. 3600s):  return stale AND publish a
                                          refresh request to a worker
       If age >  hard_ttl:                 return stale, do not refresh,
                                          treat as a miss (rebuild inline)
    4. The worker rebuilds and overwrites with a new fetchedAt.

  Why this eliminates the stampede:
    There is no expiry event at all. The cache never transitions from
    present to absent, so there is no instant at which N requests
    simultaneously observe a miss. Refreshes happen while the key is
    still being served.
```

The trade-offs, and they are real: (a) **staleness is now the normal case**, not an
exceptional one, so the staleness bound is `hard_ttl` rather than `ttl`, and a reader
between 300 and 3,600 seconds is reading something that may be eleven times past its
intended freshness. That is a business decision, and it must be made per key, not once.
(b) **A key that is never read is never refreshed**, and the hard-TTL path requires a
reader to notice and rebuild — so a key with zero traffic just sits there. That is
usually correct and occasionally surprising. (c) **The refresh is a fan-out**: 4,000
requests/second all seeing "stale" will all try to publish a refresh unless you
deduplicate, so the publish step needs its own throttle — a `SETNX refresh:pending <key> EX
5` guard, or the worker deduplicates by key. (d) **You have removed the eviction as a
safety valve** by never expiring: a key that should have been dropped stays resident, and
`volatile-*` eviction will never touch it. The honest summary is that stale-while-revalidate
trades *expiry* for *staleness* and makes the staleness a parameter you must be able to
justify to someone whose number is wrong.

**Fix 4: Never expire, refresh asynchronously (refresh-ahead).** Covered in Chapter 3, and
it is the same mechanism as Fix 3 with the lead time made explicit: a worker refreshes at
90% of the TTL, so the refresh never coincides with the expiry. The trade-off versus
Stale-while-revalidate is that refresh-ahead is *stricter* — you serve only fresh values,
so there is no stale window at all — and the cost is a background worker that must be
deployed, monitored and kept up, and whose failure degrades silently back to
cache-aside-with-misses. The version that people get wrong is *never expire, refresh
asynchronously, and have no worker* — the key then lives until evicted, forever, serving a
value from the day the service was deployed.

The comparison, which is the answer to give:

| Fix | Coordination | Staleness | Cost | Survives eviction? |
| --- | --- | --- | --- | --- |
| Mutex / single-flight | Yes, per process or distributed | None | Thread/connection held by waiters | Yes |
| Probabilistic early expiry | None, but requires age metadata | None (refreshes before stale) | Non-deterministic; needs `fetchedAt` | No |
| Stale-while-revalidate | A throttle on the publish | Up to `hard_ttl` | Requires justifying a staleness bound | No |
| Refresh-ahead (worker) | None on the read path | None | You now own a background worker | No |
| Add a random TTL (see 5.4) | None | None | Does not fix a *single* hot key | Yes |

And the one that is not in the table because it is the real answer to a question nobody
asked: **make the rebuild cheap.** If the query is 200 ms because it is a `GROUP BY` over
40 million rows with no index, a covering index or a pre-aggregated table takes it to
2 ms, and the stampede arithmetic goes from a 16× overshoot lasting 16 seconds to a
4,000/25,000 overshoot — which is under 1.0 and does not exist. **A stampede is a
latency problem before it is a caching problem**, and the highest-leverage fix is almost
never in Redis.

### 5.3 Cache Penetration: Requests for Things That Do Not Exist

Penetration is the mirror image of the stampede. The key is *absent* and always will be, so
there is nothing to expire, nothing to warm and nothing to collide with. Every request for
it goes to the database, every time, forever.

```text
  THE AMPLIFICATION
  ─────────────────
  A GET /api/users/profile?id=8812993 that does not exist:
    • misses the cache
    • hits the database (a 40M-row table with a b-tree on id: ~1 ms)
    • returns 404
    • caches nothing

  Attack rate needed:  a single modest VPS can issue 10,000–50,000
  such requests per second. Your database connection pool is 50.
  50 connections / 1 ms = 50,000 queries/second of capacity, and
  the attacker only needs a few percent of that to occupy every
  connection with queries that return nothing.

  The nastiest version: an *id increment*. GET /users/1, /users/2,
  /users/3, ... /users/1000000. Every one of them is a plausible
  request, every one of them misses, and none of them trip a
  rate limiter keyed on the user.
```

Two fixes, both of which people get partly wrong.

**Negative caching** — store the miss as a value.

```bash
redis-cli SETEX user:profile:8812993 30 "NULL"     # note: TTL is SHORT
redis-cli SETEX user:profile:8812993 30 "__MISSING__"
# Read path:
v = GET key
if v == "__MISSING__": return 404      # never touch the database
if v is None:          load from DB
                      if not found: SETEX key "__MISSING__" 30
                      else:          SETEX key value 300
```

The trap the interview is probing: **a negative cache entry with no TTL, or with the same
TTL as a positive one.** Without a TTL it is a permanent lie — the customer is created and
the cache keeps returning 404 forever, which is not a performance bug, it is an
unrecoverable support incident. With a 300-second TTL on both positive and negative
entries, every create is followed by up to 5 minutes of "user does not exist", which
breaks read-your-writes on the signup and login path. The correct TTL is a small fraction
of the positive one — seconds, not minutes — and the create path must explicitly delete the
negative key. This is the same finding as Microservices Volume 2 `### 8.4` reached from
the other side; the difference here is the *mechanism*, which is a sentinel value in the
same keyspace rather than a separate negative cache.

> **INTERVIEW TRAP — "JUST CACHE THE MISS"**
>
> Caching the miss is the right answer and it has two failure modes that make it wrong if
> you stop at the idea. First, a negative entry with no TTL is a permanent wrong answer:
> the user is created, the `GET` still returns the cached miss, and nothing ever clears it
> because nothing in the system knows the answer changed. Second, and this is the one that
> gets caught in review: **if you use the same TTL for negative and positive entries, you
> have broken read-your-writes on every create path.** A user signs up, the row is
> committed, the login flow looks the account up, gets the cached miss, and tells them
> they do not exist for the length of the TTL. The rules that make it safe are: the
> negative TTL is a small fraction of the positive TTL (seconds against minutes), the
> sentinel is distinguishable from real data so a `""` empty string or a legitimate `null`
> field in a JSON payload is not mistaken for a miss, and the *create* path deletes the
> negative key — which is why that delete has to live in one place, not in every caller.

**The bloom filter.** A probabilistic structure that answers "this key definitely does not
exist" in O(1) with a small false-positive rate and no false negatives. A 1-million-element
filter with a 1% false-positive rate is about 1.2 MB and fits in Redis as a module
(`BF.ADD`, `BF.EXISTS`) or in the application as a 1.2 MB byte array.

```text
  Read path with a bloom filter:
    if NOT BF.EXISTS ids user:8812993:      → return 404 immediately.
                                              Never touches Redis or the DB.
                                              (No false negatives: if it was added,
                                               it is always reported as present.)
    else                                   → proceed with the normal
                                              cache-aside path.
                                              (~1% of absent keys are reported
                                               present and reach the database.)

  1% of 50,000 requests/second = 500 requests/second still reaching the
  database. 50,000 → 500 is a 100× reduction, which is the whole point:
  the filter reduces the attack to a manageable trickle rather than
  trying to eliminate it.

  The costs, stated honestly:
    • It is only as complete as its population. A user created after the
      filter was built is reported absent unless the create path adds them —
      so the create path is now coupled to the filter, and a missed add
      is a user who permanently cannot log in. (Mitigation: rebuild the
      filter, or keep a short negative-cache TTL behind the filter, or
      make the "definitely absent" path do a cheap existence check.)
    • It cannot be shrunk. There is no delete, so the filter only grows
      and the false-positive rate only rises.
    • It answers one question ("has this id ever existed") which is only
      the right question for id-shaped, tenant-scoped, monotonically
      assigned keys. It is useless for a free-text search.
```

**The other fix, and it is the one people forget: validate the input before it becomes a
key.** If the `id` parameter is not a positive integer, or is larger than the maximum
plausible id, or the route only makes sense for authenticated users, reject it before the
lookup. A 4-byte integer range check costs nothing and eliminates the entire class. This
is unglamorous and it is more effective than either of the other two for the *id
enumeration* variant, and worth saying out loud in an interview because it demonstrates
that you are thinking about the attack rather than only about the cache.

### 5.4 Cache Avalanche: The Expiry Cliff

Avalanche is the mass-expiry event: a large fraction of the keyspace reaching its TTL at
the same instant, so the miss rate goes from 2% to 90% and stays there for the duration of
the rebuilds.

The three causes, and they are all mundane:

1. **A cold start.** A fresh instance, a fresh deployment, or a `FLUSHDB` after an
   incident. Every key expires relative to now, so every key is missing simultaneously.
2. **A uniform TTL applied by a config or a library default.** Every key written at
   t=0 with `EX 3600` expires at t=3600. If a batch job warms 2 million keys at midnight,
   they all expire at 01:00.
3. **A deploy that changes TTLs**, so an entire keyspace that was on a 3600-second TTL
   becomes a 300-second one and its relative expiries collapse.

The timeline, and the reason the naive fix makes it worse:

```text
  01:00:00  ── 2,000,000 keys expire simultaneously
            │
            │   miss rate: 2%  ─────────────────────▶ 98%
            │
  01:00:01  ── 4,000 concurrent misses. DB at capacity.
  01:00:30  ── ... the database is at 250 QPS of pure miss load.
            │   2,000,000 keys / 250 QPS = 8,000 seconds = 2.2 hours
            │   to fully repopulate. Every one of those seconds the
            │   database is at capacity for cache misses.
            │
  03:13:00  ── finally warm again. 2h13m of degraded service.

  ! THE NAIVE FIX IS A DISASTER HERE:
     "Just add more memory / more DB connections."
     → 500 connections instead of 50.
     → 2,000,000 / (500/0.2) = 800 seconds. Better.
     → But the database now has 500 connections of pure cache-miss load
       from THIS service, which means every other service on the same
       database is starved for 13 minutes. You moved the blast radius.

  ! AND THE WORSE ONE:
     "Just pre-warm the cache."
     → Pre-warming 2,000,000 keys is itself 2,000,000 cache misses,
       executed by the warmer, at exactly the moment you are least able
       to absorb it.
```

**The fix is TTL jitter, and it is two lines of code.**

```java
// Deterministic base plus a random component. The goal is to spread
// the *relative* expiry of keys written together across a window.
long ttlSeconds = BASE_TTL_SECONDS + ThreadLocalRandom.current().nextLong(0, JITTER_SECONDS);
cache.put(key, value, Duration.ofSeconds(ttlSeconds));
```

```lua
-- The same idea, and it is the version that matters in a hot loop:
--   without jitter  → every key written in this batch expires together
--   with jitter     → the batch's expiries are smeared over JITTER seconds
local jitter = math.random(0, tonumber(ARGV[2]))   -- ARGV[2] = jitter window
redis.call('SET', KEYS[1], ARGV[1], 'EX', base + jitter)
```

The arithmetic of why it works, and this is the sentence to have ready: a keyspace of
2,000,000 keys with a 3600-second TTL and a ±300-second jitter does not produce a cliff
anywhere — the expiry events are spread uniformly across 600 seconds, so the *rate* of
expiry is 2,000,000/600 = 3,333 keys per second instead of 2,000,000 in one second. At a
steady-state miss rate of, say, 5% of 4,000 QPS = 200 misses/second, 3,333 keys/second of
expiry is entirely absorbable by the 250 QPS of database capacity. **The jitter window
must be proportional to the write rate and the rebuild capacity**: the rule is
`jitter_window × (expiry_rate) ≤ miss_budget`, and the mistake everyone makes is choosing
the jitter window as a round fraction of the TTL (10%) without checking what the resulting
expiry rate does to the database.

The two companion measures, both of which are necessary in practice:

- **Stagger TTLs by data class.** A product catalogue and a session should not share a TTL
  because they share a cache. Group keys into classes — immutable reference data (very long
  TTL, because it barely changes), hot derived aggregates (short TTL, high jitter),
  sessions (bounded by an absolute session lifetime, not a sliding TTL).
- **Warm in the background, gradually, and before the cliff.** If you must pre-warm, warm
  it at a rate the database can absorb — a rate-limited warmer, not a loop. And warm it
  *before* the event, not at it.

> **MUST REMEMBER**
>
> Cache stampede is one key expiring. Cache avalanche is many keys expiring together. The
> fixes are different: a stampede needs coordination (a lock, a single-flight, a stale
> window) and a cheap rebuild; an avalanche needs *desynchronisation*, which is a random
> component on the TTL and nothing else. Adding memory does not fix either. Adding database
> connections makes the avalanche worse by moving the blast radius onto every other
> service sharing that database.

#### Common Mistakes

- Conflating stampede and avalanche, and applying TTL jitter to a single hot key that is
  read 4,000 times a second — jitter cannot help a key whose every request arrives within
  the jitter window
- Fixing a stampede with a "mutex" that is a Redis lock key with a TTL, and not handling the
  case where the holder died mid-rebuild, which deadlocks the key until the TTL expires
- Blocking threads for 4,000 waiters on a process-local single-flight, converting a database
  problem into a thread-pool exhaustion problem
- A negative cache entry with no TTL, or with the same TTL as positive entries — a
  permanent 404 after signup, or five minutes of "this account does not exist"
- Using a `""` or a literal `null` string as the negative sentinel, which collides with a
  legitimate empty value
- A bloom filter that is not populated on the create path, so newly-created users can never
  log in, with no error anywhere
- "Fixing" an avalanche with more database connections, which shortens the event and
  starves every other service on that database for its duration
- Pre-warming 2 million keys during the incident, which is 2 million cache misses executed
  by the warmer at the least survivable moment
- Ignoring that the *rebuild* is the real problem: a 200 ms query behind a stampede is
  first an indexing problem and second a caching problem, and most of the engineering
  effort belongs in the first

#### Interview Questions — The Three Classic Bugs

**Q1. A key read 4,000 times a second expires. Walk me through what happens and what it
does to the database.** `SCENARIO`

Every one of the next 4,000 requests finds the key absent and every one of them runs the
same 200 ms rebuild against a 50-connection pool. The database's capacity is
`50 / 0.200 s = 250 queries per second`, so the offered load is a 16× overshoot, about
3,750 requests per second accumulate in the backlog, and draining the initial 4,000 takes
16 seconds. Fifty requests get connections; 3,950 block on the pool and hit the pool's
acquisition timeout, so users get 500s. The part that turns a bad minute into an outage is
the multi-instance case: 20 pods with 50 connections each is 1,000 connections against a
database whose global limit is often 200, so you exhaust the *shared* limit and take down
every other service on that database. And any automatic retry in the HTTP client or a
service mesh multiplies the offered load again. The stampede self-heals after the first
successful write — at t = 200 ms if the rebuild is fast, which is the usual case — but a
rebuild that takes 8 seconds instead of 200 ms does not, and that is the threshold to
check: the stampede is survivable while `rebuild_time < pool_size / QPS`, which here is
12.5 ms.

**Q2. What are the fixes for a cache stampede, and what does each cost?** `STAFF`

Four, plus one that is not a cache fix. (1) A **mutex / single-flight** — one rebuild, the
rest wait — implemented as a per-key `CompletableFuture` map, which is per-process, so 20
pods still mean 20 concurrent rebuilds rather than 4,000; and the waiters hold threads, so
4,000 waiters is 4,000 blocked threads unless you serve them stale instead. A distributed
lock fixes the per-process part and costs you a lock protocol with TTLs and orphaned-holder
handling. (2) **Probabilistic early expiry** — each reader refreshes early with a
probability that ramps to 1 as the TTL approaches, so there is no lock at all; it needs
the retrieval timestamp stored with the value, it is non-deterministic so a low-QPS key
can still stampede, and it does nothing for an *evicted* key because there is no
`fetchedAt` left. (3) **Stale-while-revalidate** — store the TTL as data, never set a
Redis TTL, and serve the value while a worker refreshes it. This eliminates the expiry
event entirely, so there is no instant at which N requests observe a miss. The cost is
that staleness becomes the normal case with a bound of `hard_ttl` rather than `ttl`, which
is a business decision someone has to be able to justify, and the fan-out of refresh
requests needs its own throttle. (4) **Refresh-ahead** — a worker refreshes at 90% of the
TTL so the refresh never coincides with the expiry; same mechanism, stricter freshness, and
you now own a monitored background worker. And the answer that is usually the highest
leverage: **make the rebuild cheap.** A 200 ms query behind a 4,000 QPS key is an
indexing problem before it is a caching problem, and taking it to 2 ms changes the
arithmetic from a 16× overshoot to less than 1×.

**Q3. What is cache penetration, and what are the real fixes?** `TRICKY`

Requests for keys that do not exist, so nothing is ever cached, nothing ever expires and
nothing ever collides — every one of those requests goes to the database forever. The
capacity math is what makes it a security problem: a lookup on a 40-million-row table with
an index is about 1 ms, so a 50-connection pool serves 50,000 lookups per second, and a
single modest host can generate 10,000–50,000 requests per second for non-existent ids —
enough to occupy every connection with queries that return nothing. The id-increment
variant (`/users/1`, `/users/2`, …) is the worst because every request looks legitimate and
no per-user rate limit catches it. Three fixes, in increasing order of effectiveness.
**Negative caching** with a short-lived sentinel: store `__MISSING__` with a TTL of
seconds rather than minutes, distinguish the sentinel from a legitimate empty value, and
delete it on the create path — the two ways this goes wrong are a negative entry with no
TTL, which is a permanent 404 for a user who exists, and the same TTL as positive entries,
which breaks read-your-writes on signup and login. **A bloom filter** in front of
everything: O(1), no false negatives, 1.2 MB for a million ids at 1%, turning 50,000
misses per second into 500. Its real costs are that it cannot be shrunk, its false-positive
rate only rises, and the create path is now coupled to it — a missed add is a user who
permanently cannot log in. And the fix nobody puts in the architecture diagram: **validate
the input before it becomes a key** — a 4-byte integer range check eliminates the entire
id-enumeration class for free.

**Q4. What is cache avalanche and what is the actual fix?** `TRICKY`

Many keys reaching their TTL at the same instant, so the miss rate goes from 2% to 90% and
the database is at capacity for the whole rebuild. The causes are mundane: a cold start or
a `FLUSHDB` where every key is written relative to now, a uniform TTL from a config or a
library default, or a deploy that changed the TTL and collapsed everyone's relative
expiry. The arithmetic makes it severe — 2,000,000 keys expiring at once against 250
QPS of database capacity is 8,000 seconds, over two hours, of the database carrying pure
cache-miss load. The fix is **TTL jitter**: a random component added to every TTL so the
expiry *rate* is bounded rather than the expiry *event*. With a 3,600-second TTL and
±300 seconds of jitter, 2,000,000 keys expire uniformly across 600 seconds — 3,333 keys
per second, which a 5% miss rate at 4,000 QPS absorbs comfortably. The rule for sizing the
window is `jitter_window × expiry_rate ≤ miss_budget`, and the mistake is picking 10% of
the TTL as a round number without checking the resulting rate against the database. Two
companions: stagger TTLs by data class, because a product catalogue and a session have no
reason to share a TTL, and if you must pre-warm, do it *before* the event and at a rate
the database can absorb — pre-warming two million keys during the incident is two million
cache misses executed at the least survivable moment.

**Q5. Distinguish a stampede, an avalanche and a penetration from their symptoms alone.
How would you tell them apart in an incident?** `ADVANCED`

They have different fingerprints, and this is the question that separates someone who has
operated a cache from someone who has read about one. **Stampede**: the miss rate spikes
in a narrow band of *keys* — one or a handful of the hottest — while total key count and
expiry rate stay flat; the database load looks like many copies of one expensive query,
visible in `commandstats` as a spike in a single query shape. **Avalanche**: the expiry
*rate* itself steps up, so `expired_keys` in `INFO stats` climbs sharply, the miss rate
steps to near-total and stays there, and the affected keys are a large fraction of the
keyspace rather than a hot subset. **Penetration**: `keyspace_misses` climbs with no
corresponding rise in `expired_keys` or `evicted_keys` — misses without any corresponding
cause — and the cache's *key count* stays flat or falls, because nothing is ever being
written. That last signal is the cleanest: **a miss rate with no expiry and no eviction and
no key growth is penetration by definition.** The other discriminator is the shape of the
database load: stampede and avalanche both show the *known* query shapes at high volume,
while penetration shows a query shape that is mostly returning zero rows, and the
`EXPLAIN` on it will show an index scan that finds nothing, over and over.

> **CHAPTER 5 SUMMARY**
>
> All three classic bugs are the same thing seen three ways: **the miss is the expensive
> path, and these are three different ways to make misses happen more often than the system
> was sized for.** Stampede is many simultaneous misses on one real key — a 4,000 QPS key
> with a 200 ms rebuild against a 50-connection pool is a 16× overshoot, 16 seconds to
> drain, and on a multi-instance deployment it exhausts the *shared* database connection
> limit and takes down every other service. The four fixes trade differently: a mutex costs
> threads and is per-process; probabilistic early expiry needs age metadata and cannot
> help an evicted key; stale-while-revalidate removes the expiry event entirely but makes
> staleness the normal case with a `hard_ttl` bound you must justify; refresh-ahead is the
> same mechanism with a stricter freshness and a background worker you now own. And the
> highest-leverage fix is usually not in Redis at all — a 200 ms rebuild is an indexing
> problem first. Penetration is misses on keys that do not exist, so nothing is ever
> cached and it is a denial-of-service amplifier as much as a performance bug; the fixes
> are a short-lived sentinel, a bloom filter, and input validation that stops the key being
> constructed. Avalanche is misses *correlating in time*, and its fix is desynchronisation —
> a random component on the TTL, sized so that `jitter_window × expiry_rate ≤
> miss_budget`. Adding memory fixes none of them, and adding database connections makes
> the avalanche worse by moving the blast radius.

#### Further Reading

- [Redis documentation — Cache stampede and lock](https://redis.io/docs/latest/develop/use/patterns/) — the canonical stampede mitigation and the lock-based approach, with the `SCRIPT LOAD` pattern.
- [Redis documentation — `SET` with NX/PX/EX](https://redis.io/docs/latest/commands/set/) — the atomic set-with-TTL form that every lock and single-flight implementation is built on.
- [RedisBloom — Bloom filter](https://redis.io/docs/latest/commands/bf.exists/) — `BF.EXISTS` and why the no-false-negative property is what makes it safe for penetration defence.
- [Caching best practices — TTL jitter](https://redis.io/blog/cache-stampede/) — the Redis engineering treatment of the stampede, including the probabilistic and stale-while-revalidate variants.
- [Martin Fowler — Cache Aside](https://martinfowler.com/articles/decorator.html) — the original pattern description, which is the source of most of the vocabulary in this chapter.

## Chapter 6 — Invalidation & Consistency

### 6.1 Naming the Two Hard Problems

The two hard problems, stated as the questions they actually are:

1. **How does a value leave the cache?** There is no code path from your write to your
   cache unless you build one, and the set of writes includes batch jobs, admin tools,
   migrations, and other services.
2. **How stale is a value, and is that acceptable for *this* read?** Not on average. For
   the specific read a specific user is making right now.

The first is a *mechanics* problem with a finite set of answers. The second is a *business*
problem with no engineering answer at all, and the interview trap is spending your time on
the first while implying you have solved the second.

**The cross-reference, stated so it is not re-derived here:** caching as a *correctness
problem across service boundaries* — the unowned cache, the tenant that is missing from the
key, the ownership question of "which one is true" — is owned by Microservices Volume 2
`### 8.3` and `### 8.4`. Read those for the framing. This chapter owns the mechanics
*inside* one system's Redis: which invalidation mechanism to use, what each one costs, and
what the consistency window is in milliseconds for each.

### 6.2 Delete-on-Write Versus Update-In-Cache

This is the first real decision, and the answer is not subtle once stated as a property.

```text
  DELETE-ON-WRITE
  ───────────────
    @CacheEvict(key = "#id", cacheNames = "customers")
    @Transactional
    public void updateCustomer(Customer c) { repo.save(c); }

  Properties:
    • Idempotent.       Deleting an absent key is a no-op. Deleting twice
                        is the same as deleting once.
    • Fails safe.       If the delete fails, the key expires on its TTL
                        and the next read repopulates from the database.
                        The failure mode is bounded staleness.
    • Races benignly.   Read-modify-write is not involved. A concurrent
                        repopulate that started before the commit will write
                        the OLD value — this is the real race, addressed below.

  UPDATE-IN-CACHE
  ───────────────
    @CachePut(key = "#id", cacheNames = "customers")
    @Transactional
    public Customer updateCustomer(Customer c) {
        return repo.save(c);          // returns the entity; framework writes it
    }                                  // to the cache INSIDE the transaction
                        ▼
                        !  If the transaction later ROLLS BACK, the cache
                           now holds a value that was never committed.
                           There is no second delete — the write "succeeded".

  Properties:
    • Needs the full value. You must have every field, so a partial update
      (`UPDATE ... SET last_seen = ?`) overwrites every other field with
      whatever stale copy the application happened to be holding.
    • Two concurrent writers → last-write-wins on the WHOLE object, and a
      read-modify-write at that, so one writer's field change is lost.
    • Rollback does not unwind it.
```

> **MUST REMEMBER**
>
> **Delete-on-write is idempotent and fails safe; update-in-cache is not.** That single
> sentence is the whole argument, and it holds even when update-in-cache looks faster: a
> delete that fails leaves a bounded, self-healing staleness, while an update that
> succeeds against a transaction that later rolls back leaves a permanent value that no
> database contains, and nothing in the system knows it is there.

The remaining subtlety in delete-on-write, which is the one that actually bites, and which
the interview should reach if it is pushed:

```text
  ! THE DELETE-THEN-STALE-REPOPULATE RACE
  ────────────────────────────────────────
    T0  Request A: cache GET order:42        → MISS
    T1  Request A: SELECT ... FROM orders    → (reads version 1)
    T2  Writer B:  UPDATE orders SET ...     → commits version 2
    T3  Writer B:  DEL order:42              → no-op, key is already absent
    T4  Request A: SETEX order:42 <v1> 300  → ! the cache now holds
                                             version 1 for 300 seconds,
                                             and version 1 is the value
                                             that was JUST invalidated.

  The delete was correct. The repopulate was correct. The composition
  is wrong. This is a read-modify-write across two systems with no
  transaction, and it is unfixable by any ordering of DEL and SELECT.

  THE FIXES, in increasing order of correctness:
    1. Populate from the PRIMARY, never a read replica. Removes the common
       case (replica lag) but NOT the race — a concurrent writer on the
       primary still loses.
    2. Delete AFTER the transaction commits, not inside it. Narrows the
       window; does not close it.
    3. Double-delete: DEL, commit, sleep 50ms, DEL again. Closes the
       practical window and is an ugly, widely-deployed, widely-mocked
       answer. It works because the second delete lands after the
       in-flight repopulate has completed. Its cost is a sleep on the
       write path and the fact that it is a timing assumption.
    4. Versioned keys / version checks. The read path stores a version it
       read; the write path bumps a version; a mismatch on read means
       re-load. This is the only one that is actually correct rather
       than probabilistically correct — at the cost of a version lookup
       on every read.
    5. CLIENT TRACKING + INVALIDATE (Redis 6+). The server pushes an
       invalidation to any connection that has read the key, so there is
       no polling and no window between "the read" and "the invalidation".
       The cost is server-side memory per tracked connection, which is a
       real per-client cost and is why this is not the default.
```

The correct position to take in an interview is not "delete is always better" — it is:
**delete is better because it is idempotent and it fails into a state the system already
handles; update is better in exactly one situation, which is a read-your-writes guarantee
on a specific read, and the right way to get that is not `@CachePut` in a transaction but
either a targeted post-commit update or a read that bypasses the cache.**

### 6.3 Event-Driven Invalidation and the Outbox Problem

Event-driven invalidation is the correct answer to the part of problem 1 that delete-on-write
does not solve: **writes you do not control.** A batch job that updates 50,000 rows, an
`psql` session run by a data engineer, a support tool that refunds an order — none of them
call your `cache.delete`, and no amount of discipline in your service will change that.

```text
  ┌────────┐  UPDATE  ┌────────┐  OrderChanged   ┌──────────┐  DEL  ┌────────┐
  │ writer │─────────▶│   DB   │───────────────▶│ consumer │──────▶│ cache  │
  └────────┘          └────────┘   (published    └──────────┘       └────────┘
                                    from the
                                    outbox table)
                                    ▲
                                    └─ the SAME transaction as the write.
                                       There is no dual write.
```

The outbox is not optional here and the reason is the one Volume 5 covers for 2PC: writing
to the database and publishing an event are two independent operations, and if you do them
in sequence you can lose the event (crash between), and if you do them "concurrently" you
can publish an event for a transaction that rolled back. The outbox — insert the event into
a table *in the same transaction as the write*, and have a relay publish from that table —
is the only ordering that does not do either, and the relay's duplicate publish is the price
you pay, not a bug. Microservices Volume 2 `### 8.1` and Chapter 7 own the outbox
mechanism; the point here is narrower: **the consumer must be idempotent, because the
relay guarantees at-least-once and not exactly-once.**

The costs, which are real and which is why this is the right answer and the expensive one:

- **The invalidation lag is the staleness bound.** If the relay polls every 200ms and the
  consumer takes 50ms, the cache is stale for ~250ms after the commit. That is the number
  you should be able to state.
- **A lost event is unbounded staleness.** Unlike a TTL, there is no backstop. If the
  consumer is down for an hour, the cache serves hour-old data for an hour and nothing
  alerts unless you alert on consumer lag. The mitigation is the obvious one — a periodic
  full-invalidation sweep — and the honest framing is that the sweep's period becomes the
  real staleness bound, which means you have a TTL by another name. **That is fine. What
  is not fine is believing event-driven invalidation removed the staleness question. It
  replaced "how stale at most" with "how stale until the next sweep", which is the same
  question.**
- **A slow consumer is a correctness problem, not a lag problem.** If your consumer does a
  `KEYS` scan, or deletes keys in a loop without pipelining, the whole invalidation
  mechanism falls behind. The lag metric is the thing to monitor, and it is the one that
  is missing from most dashboards.

### 6.4 TTL as a Bound, Not a Solution

The framing that should replace "set a TTL and it will be fine":

> A TTL converts an *unknown* staleness into a *bounded* one. It does not make the bound
> acceptable, and it applies the same bound to a read 1 ms after a write and a read 4
> minutes after a write — and only one of those is a problem.

That is the whole argument, and it is Microservices Volume 2 `### 8.3`'s point reached from
the Redis side. What this volume adds is the *number*: a TTL is a uniform bound, so the
expected staleness is `ttl/2` for a uniformly-random access pattern, and `ttl` in the worst
case. A 300-second TTL is not "300 seconds of staleness" — it is *on average* 150 seconds,
and it is 300 seconds exactly for the unlucky read, which is the read where a user
immediately follows a write.

Three TTL strategies, and the third is the one to recommend:

| Strategy | Mechanism | Staleness | Use for |
| --- | --- | --- | --- |
| Sliding | `GETEX key EX 300` on every read (Redis 6.2+) | Grows unboundedly for hot keys — a key read every second never expires | Almost nothing; a hot key becomes permanent |
| Absolute | Set once with `EX`; do not refresh on read | Bounded by `ttl` from the *write* | Data whose freshness is about the write, e.g. a product price |
| **TTL + event invalidation** | TTL as a backstop, event as the primary | Bounded by `min(ttl, event_lag)` | Anything a user can write |

`GETEX` deserves a specific warning because it is a genuinely new command and it is a trap:
refreshing the TTL on read is intuitive and it is wrong for a cache. A key read every second
with a 300-second sliding TTL never expires, so it can serve a value from six months ago
forever, and the failure is invisible because the key looks healthy. **A TTL should measure
the age of the data, not the age of the key**, and only a write to the underlying data can
reset the former. The exception is a session key, where the sliding window *is* the
semantics you want — an idle timeout — and where the absolute cap is enforced separately.

### 6.5 Versioned Keys and the Trade-off Nobody Puts on the Slide

Versioned keys put a version in the key, so a write makes the old key unreachable rather
than deleting it: `product:42:v17`. A read at `v17` misses after the write bumped to `v18`,
and the old value is garbage-collected by its TTL. There is no delete call, so delete-race
from §6.2 is structurally impossible.

The costs:

- **The version has to live somewhere durable and be cheap to read.** A database read for
  the version is a database read on the cache read path, which defeats the point. A global
  `INCR` version counter is a round trip and creates a hot key, which is Chapter 5's
  stampede with a different victim. A per-entity version in Redis is another key to fetch
  and another thing to be stale.
- **The keyspace grows** by one entry per version until the old ones expire, so `SCAN` and
  `DBSIZE` both get worse.
- **A version that resets to 1** — a restore from backup, a key deleted and recreated —
  resurrects a stale value, which is the one failure the mechanism was supposed to make
  impossible.

The honest summary: versioned keys are correct and are almost never worth it outside a
system that already has a version to check. For the majority of caches, delete-on-write plus
an event-driven invalidation plus a TTL backstop is simpler, has one extra dependency, and
its worst failure is a bounded and self-healing staleness rather than an incorrect design.

### 6.6 Multi-Region Caches and Cache Coherence

The question that gets asked at staff level and is genuinely hard: **you have a cache in
`eu-west-1` and a cache in `us-east-1` over the same Postgres primary. What is the
invalidation story?**

The short answer is that there is no good one, and the honest design answer is that a cache
should be regional and the data flowing into it should be regional, so the two caches never
need to agree.

```text
  ✗ ONE CACHE, TWO REGIONS
  ──────────────────────────
    us-east-1 cache  ◀──  EU user reads → 120 ms RTT, and now the
    eu-west-1 cache       US cache is cold for that key.
    both must be invalidated on every write.
    A write in the US invalidates EU via a network call in the write
    path, or via an event with a 500ms+ cross-region lag, or not at all.

  ✓ REGIONAL CACHE, REGIONAL DATA
  ────────────────────────────────
    Users in the EU are served from EU data (EU read replica, EU
    region of the source of truth, or a per-region projection built
    from events — the projection pattern in Microservices Volume 2).
    Each region's cache is invalidated by writes in its own region.
    No cross-region cache coherence exists because no cross-region
    shared value exists.

  THE COST OF THIS ANSWER:
    • Data that is genuinely global (a currency rate, a tax table, a
      product catalogue) is either fetched per-region from a global
      source on a long TTL, or replicated to each region as its own
      key, or — the pragmatic answer most teams converge on — served
      without a cache at all because the source is already fast enough.
    • A genuinely global, frequently-read, frequently-written value is
      a distributed-systems problem wearing a cache's clothes, and the
      right tool is not Redis replication (Chapter 8) because a
      replica is a *read* copy and the write still has to go to one
      place.
```

The intermediate answers and why they are compromises:

- **A single global cache with replicas in each region.** Reads are fast, writes are
  handled at the primary, and replication is asynchronous (Chapter 8) so a regional read
  can be up to the replication lag behind. For a read-mostly value with a staleness bound
  in seconds, this is fine and is what most people build. It fails when a read in one
  region must reflect a write from another within milliseconds.
- **Region-local caches with a global invalidation bus.** Every region publishes its
  invalidations to a bus and every region consumes them. Correct within the bus's delivery
  guarantee, and now you own a distributed system with a partition-mode question you did
  have before.
- **No cross-region cache at all** — the honest answer for a value with a *strong*
  consistency requirement. Some values should not be cached because of where they are, and
  recognising that set is a staff-level skill.

> **STAFF-LEVEL CONSIDERATION**
>
> The question worth raising in a design review is not "how do you invalidate across
> regions" — it is **"which of these cached values is a cache at all, given that a global
> value with a strong read-after-write requirement is a distributed-systems problem we have
> chosen to solve with an in-memory store on a different continent?"** The answer is
> usually to enumerate the values that must be strongly consistent, take them out of the
> cache, and be explicit that the remaining ones have a documented staleness bound per
> value. A cache policy that is "we cache everything with a 5-minute TTL" has not made
> that enumeration, and the moment someone asks "what is the price at checkout?" the team
> will discover it during an incident.

#### Common Mistakes

- Using `@CachePut` inside a `@Transactional` method, so a rollback leaves the cache
  holding a value the database does not have, with no second delete to unwind it
- Treating delete-on-write as covering every writer, when batch jobs, admin tools, data
  engineers and other services are all writers that never call your `cache.delete`
- Deleting inside the transaction rather than after commit, narrowing the window without
  closing it and looking like it closed it
- Believing event-driven invalidation removed the staleness question, when the periodic full
  sweep that backs it up is a TTL by another name and its period is the real bound
- `GETEX` on read, so a key read every second never expires and silently serves a
  six-month-old value while looking healthy
- A versioned key whose version resets after a restore from backup, resurrecting a stale
  value through the one mechanism that was supposed to make it impossible
- One cache per region over shared data, with invalidation crossing a continent in the
  write path or not happening at all
- Treating cache coherence as a Redis problem, when the coherent unit is the *region's
  data*, and a global strongly-consistent value is not a cache at all

#### Interview Questions — Invalidation & Consistency

**Q1. Delete-on-write or update-in-cache? Argue it.** `STAFF`

Delete, because of two properties that update cannot have. It is **idempotent** — deleting
an absent key is a no-op, so a retry, a double-submit and a duplicated event all converge
to the same state. And it **fails safe** — if the delete fails, the entry expires on its TTL
and the next read repopulates from the database, so the failure mode is bounded staleness
that the system already handles. Update-in-cache fails both tests: with `@CachePut` inside
a transaction, the cache write happens before the commit, so a rollback leaves a value the
database does not contain and there is no second delete to unwind it. And a partial update
— `UPDATE ... SET last_seen = ?` — requires you to have every other field, so you
overwrite the rest with whatever stale copy the application held, and two concurrent
writers are a last-write-wins race on the whole object. The one case where update is right
is a specific read with a read-your-writes requirement, and the right way to get that is a
targeted post-commit update or a read that bypasses the cache — not a general
`@CachePut`. The subtlety to volunteer: delete does not close the delete-then-stale-
repopulate race, where a read that started before the write finishes and writes the old
value after the delete — the fixes for that are populating from the primary, a
double-delete, or a version check on the read path.

**Q2. What are the two hard problems of caching, and which one is engineering?** `STAFF`

One is mechanics: *how does a value leave the cache?* There is no code path from a write to
the cache unless you build one, and the set of writes includes batch jobs, admin tools,
migrations, other services and a `psql` session. That problem has a finite set of answers —
delete-on-write, update-on-write, event-driven invalidation, versioned keys, and a TTL
backstop — and it is solvable. The second is: *how stale is this value for this specific
read, and is that acceptable?* That is not an engineering problem, it is a business
decision that has to be made per read: a stale product photo is cosmetic, a stale delivery
address at checkout is a refund, a stale price is a regulatory problem, a stale permission
check is a security problem. The trap in the interview is spending all your time on the
first while implying you have solved the second. And the framing of the second is *not*
"what is the average staleness" — it is "what is the staleness for the read that follows a
write", because that is the read a user will complain about, and it is the read a uniform
TTL gives the worst bound on.

**Q3. Event-driven invalidation versus a TTL. What does the event buy and what does it
cost?** `TRICKY`

The event buys correctness for writes you do not control. Delete-on-write covers the
writes that go through your service; it covers none of the batch jobs, admin tools, data
engineer scripts or other services that write the same tables, and for those the only bound
is the TTL. So event-driven invalidation converts "up to TTL stale" into "up to event lag
stale", which is usually 50–500 ms instead of 5 minutes. The costs are honest. It requires
an outbox — the event must be written in the same transaction as the data change, or you
have a dual-write problem where you can lose the event or publish one for a rolled-back
transaction — and it requires an idempotent consumer, because the outbox relay guarantees
at-least-once. More importantly, a *lost* event is unbounded staleness: there is no backstop
unless you add a periodic full-invalidation sweep, and if you add that sweep, its period is
your real staleness bound, which means you have a TTL by another name. That is fine. What
is not fine is believing the event mechanism removed the staleness question rather than
replacing "how stale at most" with "how stale until the next sweep". The other cost is
operational: consumer lag becomes a first-class metric, and a consumer that is doing a
`KEYS` scan turns invalidation from a latency problem into a correctness problem.

**Q4. A TTL on a hot key, refreshed on every read. What is wrong?** `TRICKY`

The TTL stops measuring the age of the data and starts measuring the age of the key.
`GETEX key EX 300` on every read means a key read every second never expires — it can
serve a value from six months ago, permanently, and the failure is completely invisible
because the key is present, the hit rate is 100%, and nothing has an error. The reason the
behaviour is wrong is that freshness is a property of the *data*, and only a change to the
underlying row can reset it. A sliding TTL is the right semantics in exactly one place: a
session key where the window genuinely *is* an idle timeout, and where you separately
enforce an absolute lifetime so the session cannot be extended forever. Everywhere else,
the TTL is a backstop against a missed invalidation, not a lifetime, and extending it on
read defeats the only mechanism that bounds how long a missed invalidation can persist.

**Q5. You run a cache in each of two regions over one primary. How do you invalidate?**
`SCENARIO`

I would push back on the framing, because the honest answer is usually that these two
caches should not be invalidating each other — the *data* should be regional, and then each
region's cache is invalidated only by writes in its own region and the question disappears.
That means EU users are served from an EU read replica or an EU-region projection built from
events, which is the projection pattern from the Microservices Volume 2 data-ownership
chapter rather than a cache problem. Where the data genuinely is global, there are three
honest answers and they have different costs. A single global primary with regional
replicas: reads are fast, writes go to one place, and a regional read can be up to the
asynchronous replication lag behind — fine for a read-mostly value whose staleness bound is
seconds, and not fine for anything requiring read-after-write. Region-local caches with a
global invalidation bus: correct within the bus's delivery guarantee, and now I own a
distributed system with a partition-mode question. And no cross-region cache for values
with a strong consistency requirement: some values should not be cached, and recognising
that set is the actual staff-level skill here. What I would insist on in the review is an
explicit enumeration of which cached values are genuinely global, what their staleness
bound is, and which of them are strong enough that they should come out of the cache
entirely.

> **CHAPTER 6 SUMMARY**
>
> The two hard problems are *how does a value leave the cache* — a mechanics problem with a
> finite set of answers — and *how stale is this value for this specific read* — a business
> problem with no engineering answer. Almost all interview time goes to the first while
> implying the second is solved. The mechanics decision is delete-on-write over
> update-in-cache, and the argument is not about speed: delete is idempotent and fails safe
> into a bounded staleness the system already handles, while `@CachePut` inside a
> transaction writes a value a rollback will never unwind. Delete does not close the
> delete-then-stale-repopulate race, and the honest fixes for that are populating from the
> primary, a double-delete, or a version check. Event-driven invalidation extends coverage
> to the writes you do not control — batch jobs, admin tools, other services — at the price
> of an outbox, an idempotent consumer, and a lost event that is *unbounded* staleness
> unless a periodic sweep bounds it, which means the sweep's period is your real TTL. TTL
> itself is a bound, not a solution: a uniform TTL gives the same 300-second worst case to
> a read 1 ms after a write and a read four minutes after one, and refreshing it on read
> (`GETEX`) stops it measuring the age of the data entirely. And the multi-region question
> is usually answered by refusing it: make the data regional, and the cross-region cache
> coherence problem disappears along with the cache.

#### Further Reading

- [Redis documentation — `CLIENT TRACKING` and invalidation](https://redis.io/docs/latest/develop/clients/) — server-pushed invalidation, which is the only mechanism that closes the read/invalidate window.
- [Redis documentation — `GETEX`](https://redis.io/docs/latest/commands/getex/) — the sliding-TTL command, and the reason it is wrong for a cache.
- [microservices.io — Cache Aside](https://microservices.io/patterns/data/caching.html) — the pattern description whose invalidation problem this chapter is the Redis-side treatment of.
- [microservices.io — Transactional outbox](https://microservices.io/patterns/data/transactional-outbox.html) — the mechanism that makes event-driven invalidation not lose events.
- [Redis documentation — Key eviction](https://redis.io/docs/latest/develop/reference/eviction/) — why a never-expiring stale-while-revalidate key is no longer an eviction candidate.

## Chapter 7 — Persistence & Durability

### 7.1 The Default Answer and Why It Is Usually Right

Redis ships with **both RDB and AOF off**. That default is correct for the majority of
deployments, because the majority of Redis deployments are caches, and a cache whose data
cannot be reconstructed is a misnamed cache. The interview question is never "should you
enable persistence" — it is "**what is in this Redis that cannot be recomputed?**", and
the answer determines everything else in this chapter.

This is also the cross-reference to Volume 1: Redis is a deliberate exception to the
storage/query/concurrency layering of Chapter 1 there, and it gets away with it because
all three layers are thin — the storage engine is a hash table, the query layer is a
dispatch table with no planner, and the concurrency layer is "one thread", which is a
complete answer for in-memory operations. What Redis does *not* get away with is durability,
and that is where it does have to build a real mechanism.

### 7.2 RDB: Point-in-Time, Compact, and Lossy by Design

An RDB is a binary snapshot of the entire dataset at one instant, written by a background
`BGSAVE` that forks the process.

```bash
redis-cli CONFIG GET save
# 1) "save"
# 2) "3600 1"      ← save if ≥1 key changed in the last 3600s
# 3) "300 100"     ← save if ≥100 keys changed in the last 300s
# 4) "60 10000"    ← save if ≥10000 keys changed in the last 60s
```

The `save` directive is a set of `seconds changes` thresholds, and Redis takes a snapshot
when *any* of them is satisfied. That list **is** the data-loss window, and it is the
number to state: with `save 3600 1`, a crash can lose up to an hour of writes.

The properties:

- **Compact and fast to load.** An RDB is a serialised dump; loading a 40 GB dataset takes
  seconds because it is a straight read and a series of inserts, versus an AOF which has to
  be *replayed* as a command log. For a large dataset, restoring from RDB is often an order
  of magnitude faster.
- **Lossy by design, and the window is the last snapshot.** Everything since the last
  `BGSAVE` is gone. This is not a subtle failure — it is the design, and the fix is a
  shorter `save` interval at the cost of more forks.
- **`fork()` is copy-on-write and it is not free.** The fork itself is cheap (a page-table
  clone), but the *parent* then writes to pages the child has shared, and the kernel has to
  copy those pages. On a large dataset with a high write rate, this can produce a latency
  spike lasting tens or hundreds of milliseconds, and in the pathological case — a large
  dataset receiving a very high write rate — it can exceed the free memory available for
  the copy and the OOM killer will take the process. This is why `vm.overcommit_memory 1`
  and a `maxmemory` comfortably below physical RAM are not optional tuning; they are
  prerequisites.
- **`BGSAVE` failures are silent unless you look.** Check
  `INFO persistence` → `rdb_last_bgsave_status`, and `rdb_last_save_time`. A disk-full
  condition produces a failed background save that keeps failing and nobody notices until
  they need a restore.

> **SCALING REALITY CHECK**
>
> The fork problem has a hard number. `BGSAVE` on a 32 GB dataset forks and then
> copy-on-writes; the memory spike is bounded by *the number of first-touch pages modified
> during the fork window*, which on a busy instance is `write_throughput × fork_duration`.
> Concretely: 20,000 writes/second, each touching a distinct page, over a 100 ms fork
> window, is 2,000 pages, which is not much. The pathological case is a *scanning* workload
> — `SCAN`, a large `HGETALL`, or an `SORT` — that touches the entire keyspace during the
> fork window and forces the entire dataset to be copied. On a 32 GB dataset that is a
> 32 GB spike and an OOM kill. The two mitigations are `vm.overcommit_memory 1` (so the
> fork is not refused) and never running a keyspace-wide traversal during a save. The
> third, which is the real one, is `repl-diskless-sync yes` — a *replica-side* diskless
> fork, which moves the spike to a machine whose loss is not a production outage.

### 7.3 AOF: The Actual Guarantee of Each `appendfsync` Setting

The AOF is an append-only log of the write commands, and the guarantee is set by
`appendfsync`:

| Setting | What it actually does | Worst-case data loss | Cost |
| --- | --- | --- | --- |
| `always` | `fsync()` the AOF **before replying to the client** | Zero, up to hardware failure | **One fsync per write command** |
| `everysec` | `fsync()` once per second from a background thread | **Up to 1 second of writes** | One fsync per second, off the command path |
| `no` | Let the OS decide when to write | **Whatever the OS page cache does**, typically 1–30 s, and unbounded under memory pressure or a host crash | ~zero |

This is the table that gets asked, and the specific point that earns the question is the
distinction between `everysec` and `no`. They look similar — "roughly a second" — and they
are not. `everysec` is a **guarantee**: Redis performs the fsync itself, on a schedule, so
a power loss loses at most one second regardless of what the OS was doing. `no` is
**delegation**: the OS may not have written anything, and under memory pressure the kernel
may be holding megabytes of dirty pages, so the loss window is "however long the OS felt
like", which is unbounded and which grows precisely when the machine is under stress — the
worst possible time.

`always` deserves the arithmetic, because "one fsync per command" only sounds expensive
until you know the disk's number:

```text
  appendfsync always:
    throughput ≤ 1 / fsync_latency

    NVMe with a power-loss-protected cache : 0.1–0.5 ms  → 2,000–10,000 writes/s
    Enterprise SSD, honest fsync          : 1–5 ms      →   200–1,000 writes/s
    Cloud network volume, no PLP          : 5–20 ms      →    50–200 writes/s
    Spinning disk                         : 8–12 ms      →    80–125 writes/s

  A 200 QPS write workload on a cloud network volume cannot use
  `always` without becoming write-latency-bound at the fsync, because
  200 writes/s × 20 ms = 4 seconds of fsync per second of wall clock
  with 20 requests queued on average.

  ! AND THE CLOUD CAVEAT, which is the one that surprises people:
    Most cloud block storage does NOT honour FLUSH/FUA, or honours
    it only to the hypervisor's cache, not the physical device. So
    `appendfsync always` on a cloud volume may give you ZERO against a
    host power loss while appearing to be the strongest setting.
    AOF + replication is the real durability answer, and `WAIT` /
    `min-replicas-to-write` are what turn "probably replicated" into
    "refuse the write if it is not".
```

Two AOF mechanics worth knowing by name, because they are how AOF stays bounded:

- **`BGREWRITEAOF`.** The AOF grows forever as a command log. Rewrite produces a
  minimal AOF representing the current dataset and starts appending to that. The rewrite
  itself uses a child process, so it has the same fork characteristics as `BGSAVE`.
- **Multi-part AOF (Redis 7+).** The AOF is now a *base* file plus *incremental* files
  with a manifest, so a rewrite no longer has to block appends for its duration. If you
  are reading older material that says "AOF rewrite causes a brief write stall", that is
  true for 7.0 and earlier and improved in 7.x.

### 7.4 Persistence Does Not Protect Against Eviction

This is the one that surprises people, and it is worth its own callout because it is a
straightforward logical error that experienced engineers still make:

> **A key evicted for memory is gone, and the persistence layer records its absence.**
> RDB and AOF do not run during eviction. There is no log entry saying "this was deleted
> by the eviction policy", because the eviction *is* a `DEL` as far as every other part of
> the system is concerned — and `DEL` is a write, which the AOF faithfully records and the
> next RDB faithfully reflects.

```text
  ! THE MENTAL MODEL THAT IS WRONG
  ─────────────────────────────────
    "I have AOF everysec, so if Redis runs out of memory and evicts a
     key, restarting Redis will bring the key back."

    WHAT ACTUALLY HAPPENS
    ─────────────────────
    t0  SET user:8812  <value>          → AOF: SET
    t1  used_memory > maxmemory
    t2  eviction policy selects a victim
    t3  DEL user:8812                   → AOF: DEL     ◀ recorded
    t4  process OOM-killed / node lost
    t5  restart
    t6  AOF replay: SET then DEL
    t7  user:8812 does not exist.
        And this is CORRECT BEHAVIOUR — eviction deleted it, on purpose,
        because the whole point of `allkeys-lru` is that this data is
        disposable.

  The corollary, and it is the useful part:
    Persistence protects against  LOSS OF THE PROCESS  (crash, OOM kill,
    node failure, bad deploy).
    Eviction is a DELETION  and is a deliberate data-loss event with the
    process running.

    These are two different failure domains and they do not compose into
    one safety story. Configuring both is not belt-and-braces; it is two
    independent policies that happen to operate on the same bytes.
```

The design conclusion follows directly: **which data is evictable and which is not is a
classification you must make, and `maxmemory-policy` is how you express it.** If a value
must not be silently deleted, it does not belong in a keyspace governed by `allkeys-lru`
with no TTL. The three-way split from Chapter 1.6 is the actual architecture:

| Class | Policy | Persistence | Why |
| --- | --- | --- | --- |
| Recomputable (cache) | `allkeys-lru`, no TTLs | Off | Eviction is free and desirable |
| Bounded-lived (sessions, limiters, locks) | `volatile-lru`/`volatile-lfu`, every key has a TTL | Off, or RDB for convenience | Every key expires on its own, so loss is bounded by design |
| Non-recomputable (queues, ledgers) | `noeviction` | AOF `everysec` or `always` | Deleting one of these is a correctness event |

### 7.5 A Cache With Persistence Is a Source of Truth Nobody Designed For

The reason persistence belongs in this volume at all rather than in a "Redis as a database"
volume is that **enabling it changes what the system is, and it changes it silently.**

```text
  ! THE FAILURE MODE
  ──────────────────
  You enable AOF on a cache "so we don't lose sessions on deploy".

  What you now have:
    1. A durable copy of data whose invalidation logic is best-effort.
    2. On a restore-from-backup (a failover, a `redis-cli --rdb` restore, a
       PITR), you get back the data AS IT WAS — including values that
       were never invalidated, including negative cache entries, including
       rate limit counters from three days ago that will now reject
       traffic for their remaining TTL.
    3. A restore is now an operation you have to think about, and "just
       restore the cache" has become "restore a system with opinions".

  The specific incident:
    A managed Redis instance's automated failover promotes a replica
    that was 40 seconds behind. Everything is fine — replicas have all
    the data, it is just 40 seconds old. But those 40 seconds include
    4,000 invalidated cache keys that were deleted and not yet deleted
    on the replica, so a promoted replica serves 4,000 stale values for
    the rest of their TTLs, and the team has a "Redis is randomly serving
    old data" bug that correlates with failovers for a month before
    anyone connects them.

  THE RULE:
    Persistence on a cache is not free insurance. It is a claim that the
    contents are worth restoring, and if that claim is false, restore
    is the WRONG operation — FLUSHALL and warm is correct, and is faster.
    Decide which, per keyspace, and write it in the runbook.
```

Note that the 40-second-stale-replica problem is not a persistence problem at all — it is
asynchronous replication, and it is Chapter 8's subject. The reason it belongs in this
chapter's argument is that it is the *reason* the cache-with-persistence is dangerous:
the thing that restores your data is also the thing that restores it slightly wrong, at
exactly the moment you are least able to reason.

> **MUST REMEMBER**
>
> Persistence protects against loss of the *process*. Eviction is a *deletion* that happens
> with the process running, and it is faithfully recorded by the AOF and the next RDB. They
> are two independent failure domains, and enabling both is not belt-and-braces — it is
> two policies operating on the same bytes. And enabling persistence on a cache is a claim
> that the contents are worth restoring, which for a cache is usually false: if it is
> false, the correct recovery is `FLUSHALL` and warm, not restore.

#### Common Mistakes

- Quoting "Redis is not durable" without the qualifier, when `appendfsync always` gives
  zero loss against process failure — the honest version is about the specific setting and
  the specific failure domain
- Confusing `appendfsync no` with `appendfsync everysec` because both sound like "about a
  second" — one is a guarantee Redis makes and the other is a delegation to the OS whose
  window is unbounded and grows under memory pressure
- Believing `appendfsync always` guarantees durability on cloud block storage, where
  FLUSH/FUSA may only be honoured to the hypervisor cache
- Assuming the RDB and the AOF together cover eviction, when an evicted key is recorded as
  a `DEL` and is therefore *more* reliably absent after a restore
- Running `BGSAVE` or `BGREWRITEAOF` on a large dataset without `vm.overcommit_memory 1`
  and without headroom, and getting OOM-killed by the copy-on-write spike
- A keyspace-wide `SCAN` or large `HGETALL` during a fork window, which copy-on-writes the
  entire dataset and turns a routine save into an outage
- Not monitoring `rdb_last_bgsave_status` and discovering at restore time that the last six
  scheduled saves all failed on a full disk
- Enabling persistence on a cache and then having no runbook decision about whether a
  restore or a flush is the correct recovery — and finding out during a failover
- Treating "we have replicas, so a promoted replica is fine" as true, when an
  asynchronously-replicated replica is a specific number of seconds stale and the cache
  keys deleted in that window come back to life

#### Interview Questions — Persistence & Durability

**Q1. State the actual data-loss guarantee of each `appendfsync` setting.** `TRICKY`

`always` performs an `fsync` before replying to the client, so the guarantee is zero loss
against process failure — but the cost is one fsync per write command, which bounds
throughput at `1 / fsync_latency`: 2,000–10,000 writes per second on an NVMe with a
power-loss-protected cache, 200–1,000 on an enterprise SSD, 50–200 on a cloud network
volume. `everysec` is a **guarantee of up to one second of writes**: Redis itself performs
the fsync on a schedule from a background thread, so the loss window is one second
regardless of what the OS was doing. `no` is **delegation, not a guarantee** — Redis lets
the OS decide, the OS may be holding seconds of dirty pages, and under memory pressure the
window is unbounded, which is the worst possible time for it to grow. The distinction
people miss is between `everysec` and `no`: both sound like "about a second" and only one
of them is a promise anyone made.

**Q2. Does enabling persistence protect you from `maxmemory` eviction?** `SCENARIO`

No, and the reason is worth being precise about because the mental model people arrive with
is exactly backwards. Eviction is a `DEL` as far as everything else in the system is
concerned. The AOF faithfully records that `DEL`, and the next RDB faithfully reflects the
key's absence — so on restart the AOF replay does `SET user:8812` and then `DEL user:8812`,
and the key does not exist. That is correct behaviour, because `allkeys-lru` exists in
order to delete disposable data. The useful way to put it: **persistence protects against
loss of the process — a crash, an OOM kill, a node failure, a bad deploy — and eviction is a
deletion that happens with the process running.** They are two independent failure domains
and do not compose into one safety story. What this means for design is that the
classification has to be explicit: an `allkeys-lru` keyspace with no TTLs is entirely
recomputable; a keyspace of sessions, limiters and locks uses `volatile-*` and relies on
every key having a TTL; and anything non-recomputable — a queue, a ledger — needs
`noeviction` plus persistence, because for that class a deletion is a correctness event
rather than a performance event.

**Q3. We enabled AOF on a session cache so logins survive a deploy. Was that right?**
`SCENARIO`

Probably not, and the reason is that enabling persistence on a cache is a claim that the
contents are worth restoring. For a session store the claim is half-true — losing sessions
is survivable — but the consequences are asymmetric. On a normal restart, restore is
correct. On a failover, restore is *slightly wrong*: you promote a replica that is
asynchronously replicated, so you get back the state as of some number of seconds ago,
including cache keys that were invalidated on the primary in that window and never
invalidated on the replica. Those keys come back to life and serve stale values for the
rest of their TTL, and the symptom is "Redis randomly serves old data, correlated with
failovers", which is a genuinely hard bug to connect to its cause. The same applies to
negative cache entries and rate limit counters restored from three days ago. The
disciplined version of the answer: decide per keyspace whether restore or flush-and-warm is
the correct recovery, write it in the runbook, and if the data is genuinely recomputable,
prefer flush-and-warm — it is faster and it is correct. A managed failover is not the
moment to be restoring a point-in-time view of something that was always going to be
slightly wrong.

**Q4. What does `BGSAVE` cost on a large dataset, and what makes it an outage?** `ADVANCED`

The fork itself is nearly free — `fork()` clones page tables, and with copy-on-write the
child reads the parent's memory without copying it. The cost arrives in the parent, which
keeps serving and writing while any page it modifies is one the child still references, so
the kernel has to copy that page. The spike is therefore bounded by *the number of distinct
pages first-touched during the fork window*, which on a write-heavy instance is modest —
20,000 writes per second over a 100 ms window is about 2,000 pages. The pathological case
is a **scanning workload during the fork**: a `SCAN`, a large `HGETALL`, or an `SORT` that
touches the whole keyspace forces the entire dataset to be copied, and on a 32 GB instance
that is a 32 GB spike, which is an OOM kill if the kernel has nothing left to give. The
two prerequisites that are not optional are `vm.overcommit_memory 1` — without it the
kernel can refuse the fork outright — and a `maxmemory` comfortably below physical RAM so
there is somewhere for the copy to go. The third, and the real mitigation for a
read-heavy instance, is `repl-diskless-sync yes`, which performs the fork and the transfer
on a *replica* whose loss is not a production outage. And a monitoring point people miss:
`rdb_last_bgsave_status` in `INFO persistence`, because a disk-full condition makes the
background save fail repeatedly and silently.

**Q5. Redis has `MULTI`/`EXEC`. Why is that not the transaction you want?** `STAFF`

Four reasons, and the first two are the ones that matter. First, **it does not roll back**:
if a queued command fails at `EXEC` — a wrong type, for instance — the earlier commands in
the queue have already executed and stay executed. `DISCARD` only prevents execution; it
cannot undo it. Second, **it does not roll back on a runtime error either**, so a
transaction is all-or-nothing at *queue* time and best-effort at *execution* time, which is
the opposite of the property the word implies. Third, `MULTI`/`EXEC` gives no isolation
benefit at all: because commands execute serially on one thread with nothing interleaved,
a transaction is already atomic in the sense people actually want — so `MULTI` adds no
guarantee and costs a round trip. Fourth, and this is the operational one, a long queue
inside `MULTI` blocks every other client for the duration of the whole queue, so a
transaction with 10,000 commands is a 10,000-command global stall. The construct that is
actually right for the read-modify-write cases is a Lua script, which is atomic, executes
in one round trip, and — critically — is written as logic rather than as a command list,
which is what makes the difference between correct and incorrect when two clients
interleave. Volume 5 owns transactions properly; the honest summary here is that Redis has
`MULTI`/`EXEC` and it is not the transaction you want.

> **CHAPTER 7 SUMMARY**
>
> Both RDB and AOF ship off, and that default is right for a cache — the question that
> decides it is what in this Redis cannot be recomputed. RDB is a point-in-time snapshot:
> compact, fast to restore, and lossy by design, with the loss window being the `save`
> directive's own thresholds — `save 3600 1` means up to an hour. AOF is a command log, and
> the guarantee is set entirely by `appendfsync`: `always` is zero loss at the cost of one
> fsync per write command, which on a cloud network volume at 20 ms caps you at 50 writes
> per second; `everysec` is a genuine guarantee of up to one second of loss; and `no` is
> not a guarantee at all but a delegation to the OS whose window is unbounded and grows
> under memory pressure. Both fork, so both inherit the copy-on-write spike, which is
> survivable for writes and an OOM kill for a keyspace-wide scan during the fork window.
> And the finding that surprises experienced engineers: **persistence protects against
> loss of the process, while eviction is a deletion that happens with the process running**
> — the AOF records the `DEL`, so a restored cache is *more* reliably missing the evicted
> key, not less. Which means enabling persistence on a cache is a claim that the contents
> are worth restoring, and for a cache that claim is usually false — in which case
> flush-and-warm is the correct recovery, and it is faster.

#### Further Reading

- [Redis documentation — Persistence](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) — RDB, AOF, the fork model, and the exact `appendfsync` semantics.
- [Redis documentation — `appendfsync`](https://redis.io/docs/latest/operate/oss_and_stack/management/persistence/) — the guarantee of each setting, stated in the docs rather than in a blog post.
- [Redis documentation — Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/) — why replication plus `WAIT` is the durability answer that AOF alone is not.
- [Redis documentation — `INFO persistence`](https://redis.io/docs/latest/commands/info/) — `rdb_last_bgsave_status`, `rdb_last_save_time`, and the AOF rewrite metrics that are worth alerting on.
- [Redis documentation — `MULTI`/`EXEC`](https://redis.io/docs/latest/commands/multi/) — the precise semantics, including the absence of rollback.

## Chapter 8 — Replication, Cluster & Sharding

### 8.1 `replicaof` and What "Asynchronous" Actually Costs

```bash
redis-cli REPLICAOF 10.0.1.5 6379
redis-cli REPLICAOF NO ONE          # promote to master
redis-cli INFO replication
#   role:slave
#   master_link_status:up
#   master_sync_in_progress:0
#   master_repl_offset:9124384712
#   master_repllag:0
```

Replication is **asynchronous**. A write acknowledged to a client has reached the master
and *not* the replica, and the gap between them is `master_repllag` — a number that is
routinely 0 and occasionally seconds, and which nobody monitors until the day it is 40
seconds during a failover.

That single property has four consequences, and every one of them is a design decision:

1. **Reading from a replica is a stale read by an unknown amount.** The read-your-writes
   guarantee is gone. A user who creates an order and then reads through a replica gets a
   404 for up to the replication lag. Microservices Volume 2 owns read-your-writes as a
   consistency property; the Redis-specific part is that *you do not know the lag* at read
   time, so you cannot bound it per read.
2. **A failover promotes a replica that is `master_repllag` seconds behind.** That is a
   data-loss window of exactly that many seconds of writes, and it is unavoidable in an
   asynchronous design. It is also why `min-replicas-to-write 1` +
   `min-replicas-max-lag 2` exists: the master refuses writes it cannot get replicated,
   trading write availability for a bounded loss window. And `WAIT 1 1000` lets an
   application make the durability decision per write rather than globally.
3. **Failover is not instantaneous.** It requires detecting the failure, electing, and the
   replica promoting. Seconds, not milliseconds. Every design that says "Redis is highly
   available" is silent about this window.
4. **Replica reads change the load shape of the primary.** Replication replicates writes
   only, so serving reads from replicas scales reads linearly — but a replica that is
   serving reads is competing for the *same single command thread*, so a hot replica
   serving 100,000 QPS has the same `KEYS` problem as the primary. Replication is not a
   read-path escape from the single-thread constraint; it is a separate instance with the
   same constraint.

The replication mechanics worth naming, because they are how a replica catches up without
a full resync on a brief blip:

- **Full resync.** A replica asks for a snapshot. The master forks and streams an RDB
  directly to the replica (or, with `repl-diskless-sync yes`, forks and streams from the
  *replica's* connection, which avoids a disk write and moves the fork cost to the
  replica).
- **Partial resync.** If the replica reconnects within `repl-backlog-size` (default 1 MB)
  and `repl-backlog-ttl` (default 3600 s), the master sends only the missing commands from
  the replication backlog, identified by a **replication ID** and a **replication offset**.
  This is why a replica that is 30 seconds behind can catch up in milliseconds while one
  that has been down for an hour needs a full resync. The practical consequence: if your
  replicas are large and your backlog is small, every network blip becomes a multi-minute
  full resync, and a replica that is never fully caught up is a replica you cannot fail
  over to.
- **A failover changes the replication lineage.** A promoted replica has a different
  replication ID, and the old master must be told to replicate *from* it. This is what
  Sentinel automates and what is genuinely fiddly to do by hand.

### 8.2 Sentinel: Availability, Not Capacity

Sentinel is a separate small process that monitors a master plus its replicas and performs
automatic failover. It answers exactly one question: **when the master dies, who takes
over?**

```text
   ┌──────────┐  monitors   ┌──────────┐◀──── replicaof ────▶┌──────────┐
   │ SENTINEL │◀──────────▶ │  MASTER  │                     │ REPLICA  │
   └──────────┘             └──────────┘                     └──────────┘
        │  ▲                                                      │
        │  └─────────── promotes on failure ─────────────────────┘
        │
   quorum ≥ 2 of 3 sentinels must agree the master is down
   before a failover happens  (down-after-milliseconds default 5000)

   Timeline for a hard master failure:
     t+0     master stops responding
     t+5s    two sentinels independently mark it sdown then odown
     t+5-15s a sentinel wins the election (authoritative failover)
     t+~10s  a replica is promoted; clients are told the new master
     t+10s+  your client must re-resolve the master

   Total: roughly 10–30 seconds of unavailability, plus
   `master_repllag` seconds of lost writes.
```

The two things about Sentinel that people get wrong:

- **Sentinel does not add capacity.** The whole dataset still fits on one node's memory.
  Sentinel makes a single master survive a node failure; it does not let you hold 500 GB.
  If you need more than one node's RAM, you need cluster or a sharded setup.
- **Sentinel is not the data.** A failed-over master's data is whatever the promoted
  replica had, which is `master_repllag` seconds old. Sentinel guarantees *availability*; it
  does not guarantee *no loss*. The two are frequently conflated, and the conflation is
  expensive when the application is a ledger.

### 8.3 Cluster: 16,384 Hash Slots

Cluster is two things at once: **sharding** (the keyspace is split across N masters, so the
total dataset exceeds one node's memory) and **automatic failover** (each master has
replicas and the cluster gossip coordinates a failover). People frequently use it for one
half and are surprised by the other.

```text
  16384 hash slots, distributed over the masters.

  key → CRC16(key) mod 16384 → slot → the node that owns that slot

  ┌──────────────────────┐  slots 0–5460        ┌──────────────────────┐
  │  MASTER A            │                        │  MASTER B            │
  │  10.0.1.1:6379       │  slots 5461–10922     │  10.0.1.2:6379       │
  │                      │◀──────────────────────▶│                      │
  │  hash slots 0..5460  │                        │  hash slots 5461..   │
  └──────┬───────────────┘                        └──────────┬───────────┘
         │ replica                                           │ replica
         ▼                                                   ▼
  ┌──────────────┐                                    ┌──────────────┐
  │  REPLICA A   │                                    │  REPLICA B   │
  └──────────────┘                                    └──────────────┘

  Clients hold a slot→node map and route accordingly. A node that sees a
  command for a slot it does not own replies with a redirect rather than
  guessing.
```

**Why 16,384 and not "as many as nodes"?** Because the slot count is fixed and the node
count is not. The whole point is that adding, removing and resharding nodes changes the
*slot-to-node* mapping without changing *any key's slot*. If slots were per-node, every
reshard would require recomputing which key belongs where and migrating accordingly; with
a fixed large slot count, a node simply takes over or releases a contiguous range of slots
and the key-to-slot function never changes. The design is a two-level indirection
(key → slot → node) specifically to make topology changes cheap. The historical reason for
16,384 rather than, say, 65,536 is the bitmap encoding of the slot map in the gossip
payload — 16,384 slots is 2 KB per node's map, which is cheap to gossip continuously.

**Hash tags** exist because the two-level indirection creates a hard constraint: any
command touching more than one key must have all of them in the same slot, or the node
cannot execute it. `{` and `}` force that:

```bash
redis-cli SET  {user:42}:profile  '{...}'   # CRC16("user:42")
redis-cli SET  {user:42}:sessions  '...'
# both hash to the same slot → HMSET/SMULTI/MGET across them works

redis-cli MGET  user:42:profile  user:42:sessions
# (err) CROSSSLOT Keys in request don't hash to the same slot
```

That is the real operational difference from a real sharded database, and it is the thing
that bites. In a relational sharded setup you can `SELECT ... FROM users WHERE id IN (...)`
across shards via a scatter-gather, because the query engine knows how to fan out. In Redis
cluster, **`MGET`, `DEL`, `MSET`, `SINTER`, `SUNION`, `SDIFF`, `ZUNIONSTORE` and `MULTI`
across slots are an error, not a slow operation.** There is no scatter-gather and there
will not be one; if you need it, the keys must be co-located with a hash tag, and the tag
is a permanent schema decision that constrains every future query.

> **INTERVIEW TRAP — "MGET IS ATOMIC ACROSS THE CLUSTER"**
>
> It is not, and the precise statement is what earns the question. In cluster mode, every
> command is routed to the single node that owns the hash slot of its keys, and a
> multi-key command whose keys hash to different slots is **rejected with a `CROSSSLOT`
> error** rather than being split, fanned out and recombined. There is no scatter-gather
> for `MGET` and there is not going to be one, because recombining results across nodes
> would mean giving up the single-node atomicity that is the reason to use the cluster in
> the first place. The only way to make a multi-key command work is a **hash tag** —
> `{user:42}:profile` and `{user:42}:sessions` share a slot by construction — and that is
> a schema decision with a cost: you have committed every future query touching those two
> entities to the same node, and if that node is hot you have designed a hot shard. The
> same constraint applies to `DEL k1 k2`, to `SUNION`/`SINTER`, and to any `MULTI` block
> spanning two keys, so a transaction in cluster mode is per-node, full stop.

**`MOVED` vs `ASK` — the two redirects, and the difference is permanent versus
temporary.** This is asked constantly and the answer is short:

```bash
# PERMANENT: this slot lives on a different node NOW and WILL keep living there.
# The client must update its slot→node map and retry against the new node.
127.0.0.1:7001> GET user:42
(error) MOVED 1234 10.0.1.5:6379

# TEMPORARY: this slot is MIGRATING to that node as part of a resharding.
# Retry against the target node with a specific flag. Do NOT update your map.
127.0.0.1:7001> GET user:42
(error) ASK 1234 10.0.1.5:6379
```

The operational consequence, and this is the part that matters: **a client that treats
`ASK` as `MOVED` corrupts its slot map.** It will start routing slots to a node that is
only temporarily accepting them, and after the migration completes those slots move back.
Modern clients handle both correctly — the `ASK` path issues the retry with an `ASKING`
command first — but hand-rolled clients and some HTTP proxies in front of Redis do not, and
the symptom is intermittent errors correlated with resharding operations. If you run a
proxy in front of a cluster, confirm it understands `ASK`.

**The resharding procedure**, because "how do you add a node" has a defined sequence and
the order is the whole point:

```text
  1. redis-cli --cluster add-node 10.0.1.4:6379 10.0.1.1:6379
       the new node joins as an EMPTY master, owning zero slots.
       ! It is in the cluster and is NOT serving data. If the cluster
         fails over now, this node is a master with no data.

  2. redis-cli --cluster reshard <host:port>
       The cluster coordinator computes a slot-migration plan: which
       slots move from which source node to which target node, and
       attempts to make the cluster "balanced".

  3. For each slot batch: the SOURCE node sets the slot to MIGRATING and
     the TARGET node sets it to IMPORTING. Keys are then moved with
     MIGRATE, in batches, per key.
       • During migration, the source answers with ASK <target>
         for keys in a migrating slot.
       • The target answers with MOVED <source> for keys in a slot it has
         not yet received, and with TRYAGAIN while a key is in flight.
       • Existing keys are MIGRATEd. Keys written to the slot during
         migration are ALSO captured, which is why the slot is marked
         MIGRATING — without that, a write arriving mid-migration lands
         on the source after the key was already moved, and it is lost
         from the cluster's perspective.

  4. When a node has given up all its slots, CLUSTER MEET the replica
     nodes as replicas of the new masters, and remove the old node.

  The version-compatible resharding in Redis 6+ lets a replica be
  promoted to master and slots moved in a single operation, which
  replaces most of this sequence.
```

> **MUST REMEMBER**
>
> **Cluster is sharding, not replication.** It splits a keyspace across masters so the
> dataset exceeds one node's memory, and each master has its own replicas for failover —
> but the *data model* is sharded, not replicated, and every command is scoped to one
> slot on one node. That is why a multi-key command across slots is an error rather than a
> fan-out, and it is the operational difference from a relational shard, where the query
> engine scatters and gathers. If you want both scale-out and reads across a large working
> set, you are running two different things — cluster for the keyspace, replicas within
> each shard for read capacity — and they compose.

### 8.4 Redis Cluster vs a Real Shard, and the Managed-Service Question

The comparison that gets asked at staff level, because the honest answer is that "we use
Redis Cluster" does not mean what the name suggests:

| | Redis Cluster | A real sharded relational database |
| --- | --- | --- |
| Routing | Client-side, from a slot map the client caches | Coordinator or scatter-gather in the query engine |
| Cross-shard query | **Not supported.** `CROSSSLOT` error | Scatter-gather; the query planner plans it |
| Cross-shard transaction | Not supported | 2PC or a distributed transaction, with a real cost |
| Cross-shard `MGET` | Not supported | `IN (...)` is one query |
| Schema | None. It is a keyspace | Real. A shard is a schema problem with data in it |
| Failure of a shard | Failover within the cluster, seconds, with `repllag` of loss | Depends; a replica or a failover mechanism |
| Adding capacity | Add a node, reshard slots | Migrate data, often with a dual-write window |
| Consistency of a single key | Strong, within the node's single thread | Whatever the engine's isolation level is |

The row that decides most architecture reviews is the third and fourth: **cluster removes
the ability to ask a question that spans shards.** That is not a limitation to work around;
it is the trade that buys you the memory scale-out, and it means the *data model* has to be
designed so that no question spans shards. In practice that means a query that would be one
`SELECT` in Postgres becomes either a hash tag, a denormalised copy, or an application-side
fan-out — and hash tags commit you to a co-location that may be wrong in six months.

**The managed-service question, and why picking the wrong one is a design decision.** There
are three different answers to "what happens when this node dies", and they have genuinely
different failure semantics:

```text
  1. SENTINEL
     "A single master with automatic failover to a replica."
     → One node's memory. ~10–30s unavailability. `repllag` seconds of
       lost writes. No scale-out.
     Choose this when: the dataset fits in one node and you want the
     operational simplicity of one primary.

  2. CLUSTER
     "A sharded keyspace with per-shard replication and automatic
      failover."
     → Many nodes' memory. Cross-shard queries are an error. Shard
       imbalance is a real operational concern (one hot slot = one hot
       node). Slot-based routing must be understood by every client
       and every proxy.
     Choose this when: the dataset does not fit in one node, AND your
       access patterns are single-key or co-located by hash tag.

  3. MANAGED SERVICE (ElastiCache / MemoryDB / a cloud vendor's)
     "A service that does one of the above for you, with automated
      failover, backups and patching."
     → The real difference is not the mechanism, it is the CONTROL
       PLANE. Who decides the failover policy, the eviction policy,
       the maintenance window, the version upgrade, and what happens
       when the vendor's automation is wrong. Typically 30–60s
       failover, and the vendor's own documented RPO.
     Choose this when: nobody on the team wants to run Sentinel at 3am.
     The cost: you have traded a technical decision for an
     organisational one, and you should be able to say what you
     traded and why.

  THE WRONG CHOICE, made by accident:
     "We adopted cluster because we wanted high availability" — and now
     you have no cross-shard queries, unbalanced shards, a slot map
     that every client and proxy must understand, and no single-master
     mental model. Cluster's primary benefit is memory scale-out;
     availability is something Sentinel also gives you, more simply.
```

> **STAFF-LEVEL CONSIDERATION**
>
> The question to raise in a review is not "cluster or Sentinel" — it is **"what is the
> access pattern we are committing to, and does it survive a shard boundary?"** Cluster's
> hash slots are chosen at design time and are effectively permanent: a key that must be
> queried together with another is a hash tag, and a hash tag is a promise that those two
> entities will always live on one node. If that entity later becomes the hot one — and in
> a system that grows, something does — you have a hot shard in a cluster whose entire
> purpose is distributing load, and the fix is a data-model change plus a migration, not a
> config change. The cheaper question to ask early is: "is any *pair* of things we query
> together going to be hot together?" If the answer is yes, cluster is the wrong tool and a
> single-writer store with replicas underneath is the right one.

#### Common Mistakes

- Reading from a replica and assuming read-your-writes, when the guarantee is a staleness
  of an unknown and unbounded-at-the-time amount
- Treating Sentinel as a capacity mechanism, when it answers only "who takes over" and the
  whole dataset still has to fit on one node
- Believing a failed-over master lost nothing, when the loss is exactly `master_repllag`
  seconds of writes
- Expecting `MGET` across slots to work in cluster, rather than being a `CROSSSLOT` error,
  and reaching for a hash tag as a permanent schema decision made under time pressure
- Treating an `ASK` redirect as an `MOVED` and updating the client's slot map to a node
  that is only temporarily accepting the slot
- Running `SCAN` in cluster mode with a single cursor, which iterates one node and silently
  misses the other shards
- Assuming cluster replicates the data model, when it shards the keyspace and adds
  replication *per shard* — the distinction determines whether you can ask a cross-shard
  question at all
- Adopting cluster for availability when Sentinel gives it more simply, and paying for it
  in a slot map, a `CROSSSLOT` constraint and shard-imbalance operations you did not need
- A replica that is never fully caught up because a small `repl-backlog-size` turns every
  network blip into a full resync, so the replica is not a viable failover target and
  nobody notices

#### Interview Questions — Replication, Cluster & Sharding

**Q1. Why is a multi-key command across cluster slots an error, and what is the
workaround's cost?** `STAFF`

Because in cluster mode every command is routed to the one node that owns the hash slot of
its keys, and a multi-key command whose keys land in different slots would require
splitting it, fanning it out, and recombining the results — which would give up the
single-node atomicity and the single-threaded simplicity that are the reason to use the
cluster at all. So `MGET`, `MSET`, multi-key `DEL`, `SINTER`/`SUNION`/`SDIFF`,
`ZUNIONSTORE` and any `MULTI` block spanning two keys are **rejected with a `CROSSSLOT`
error** rather than being executed slowly. This is the real operational difference from a
sharded relational database, where `WHERE id IN (...)` scatters and gathers because the
query engine knows how to plan a fan-out. The workaround is a **hash tag** — keys wrapped
in `{}` are hashed on the text inside the braces, so `{user:42}:profile` and
`{user:42}:sessions` always land in the same slot. And the cost is that the hash tag is a
permanent schema decision: you have committed every future query touching those two
entities to a single node, and if that entity becomes the hot one you have designed a hot
shard in a cluster whose whole purpose is distributing load. Choosing hash tags is
therefore a modelling decision about which things are always queried together *and* which
things will be hot, and the honest version of the interview answer says both halves.

**Q2. What do `MOVED` and `ASK` mean, and what happens if you treat one as the other?**
`TRICKY`

`MOVED` is **permanent**: the slot genuinely lives on that node now and will keep living
there, so the client must update its slot-to-node map and retry. `ASK` is **temporary**:
the slot is mid-migration as part of a resharding, and the client should retry against the
named node — after sending an `ASKING` command, which is what tells that node "this
connection is temporarily asking about a slot you are importing" — and must **not** update
its slot map. Treating an `ASK` as an `MOVED` means routing slots to a node that is only
temporarily accepting them; after the migration completes those slots move back, and the
symptom is intermittent errors that correlate with resharding operations and then stop,
which makes it very hard to diagnose. Correct clients handle both, and the failure mode
is concentrated in hand-rolled clients and HTTP proxies sitting in front of the cluster,
because a proxy that does not understand `ASK` is a very plausible thing to be standing
there. So the operational check is: if you run anything between your application and the
cluster, confirm it handles `ASK`.

**Q3. Sentinel, cluster, or a managed service — how do you choose, and what does each
actually guarantee?** `STAFF`

Three different answers to "what happens when this node dies", with genuinely different
semantics. **Sentinel** is a single master with automatic failover to a replica: the whole
dataset must fit in one node's memory, unavailability is roughly 10–30 seconds (detection
at `down-after-milliseconds`, default 5 s, plus election and promotion), and you lose
`master_repllag` seconds of writes. It is the right answer when the data fits in one node
and you want one primary with simple operations. **Cluster** is a sharded keyspace with
per-shard replication: it buys memory scale-out, and cross-shard queries are a `CROSSSLOT`
error rather than a scatter-gather, so the data model has to be designed so that no
question spans a shard. Choose it when the dataset does not fit in one node *and* your
access patterns are single-key or hash-tag-co-located. **A managed service** is one of the
two above run by the vendor, and the real difference is the control plane rather than the
mechanism: who decides the failover policy, the eviction policy, the maintenance window and
the version upgrade, and what happens when the vendor's automation is wrong. The failure
mode of choosing wrong here is not technical — adopting cluster for availability when
Sentinel gives it more simply, and paying for a slot map, a `CROSSSLOT` constraint and
shard-imbalance operations you did not need. And the senior-level version of the answer is
that this is an organisational decision disguised as a technical one, and you should be
able to say what you traded.

**Q4. Your replica has been `master_link_status:up` for six months. Can you fail over to
it right now?** `TRICKY`

Probably, but "up" only means the replication link is healthy, and the question worth
asking is `master_repl_offset` versus the master's current offset, and how long that gap
has been large. A replica that is up but 40 seconds behind is a failover target that loses
40 seconds of writes. Three things make the gap large. **Network blips combined with a
small replication backlog**: partial resync only works if the replica reconnects within
`repl-backlog-size` (default 1 MB) and `repl-backlog-ttl` (default 3600 s), and a large
dataset plus a burst of writes can exceed a 1 MB backlog in seconds, so every blip becomes
a full resync — a multi-minute fork-and-stream — and a replica that is never fully caught
up is not a real failover target. **A replica serving heavy reads** competes for the same
single command thread, so under load it falls behind by design. And **`repl-diskless-load`**
during a full resync, which is CPU-bound on the replica. The mitigation is explicit rather
than hopeful: size the backlog for your largest plausible outage
(`repl-backlog-size 64mb` on a busy instance is not unreasonable), alert on
`master_repllag` rather than on link status, and use `min-replicas-to-write` +
`min-replicas-max-lag` so the master refuses writes it cannot get replicated, which trades
write availability for a bounded loss window you can then state.

**Q5. What is the difference between Redis Cluster and a sharded relational database, and
which difference actually decides the architecture?** `SCENARIO`

The difference that decides the architecture is cross-shard queries. In a relational shard
the query engine knows how to scatter and gather, so `WHERE id IN (...)` across shards is
one query and the planner plans it. In Redis cluster, a command that spans slots is a
`CROSSSLOT` **error** — there is no fan-out, because fanning out and recombining would
give up the single-node atomicity that is the reason to use the cluster. So the real cost
of cluster is not operational, it is that the data model has to be designed so that no
question spans a shard: a query that would be one `SELECT` in Postgres becomes a hash tag,
a denormalised copy, or an application-side fan-out. And a hash tag is a permanent schema
decision, because you have committed those two entities to always live on one node — so
the question to ask early is "is any pair of things we query together going to be hot
together?" If yes, cluster is the wrong tool, because in a system that grows, something
eventually becomes hot, and a hot shard inside a cluster is a data-model migration rather
than a config change. The rest of the differences follow: real schemas versus none, 2PC
versus no cross-shard transaction, and adding capacity being a migration versus a
resharding.

> **CHAPTER 8 SUMMARY**
>
> Replication is asynchronous, and that one word carries four consequences: reads from a
> replica are stale by an amount you do not know at read time, a failover promotes a replica
> that is `master_repllag` seconds behind and therefore loses that many writes, availability
> during a failover is seconds rather than milliseconds, and serving reads from replicas
> does not escape the single-thread constraint because a replica is another instance with
> the same one thread. Sentinel answers "who takes over" and nothing else — it adds
> availability, not capacity, and the whole dataset still has to fit on one node. Cluster
> adds memory scale-out by splitting the keyspace across 16,384 fixed hash slots, with
> `CRC16(key) mod 16384`, and the fixed slot count exists precisely so that a topology
> change alters the slot-to-node map without any key's slot ever changing. The constraint
> that defines everything else is that cluster has no scatter-gather: a multi-key command
> across slots is a `CROSSSLOT` error, not a slow query, and the only workaround is a
> hash tag — which is a permanent schema decision that can commit you to a hot shard.
> `MOVED` is permanent and means update your map; `ASK` is temporary, means retry with
> `ASKING`, and must never be cached. And cluster shards the keyspace rather than
> replicating the data model, so the architecture question is not "cluster or Sentinel" but
> "does any pair of things we query together end up hot together" — because that is the
> question that decides whether the hash tags you write today are a design or a trap.

#### Further Reading

- [Redis documentation — Replication](https://redis.io/docs/latest/operate/oss_and_stack/management/replication/) — partial resync, the replication backlog, and the async model with its actual cost.
- [Redis documentation — Redis Cluster specifications](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/) — the 16,384 slots, `MOVED` and `ASK`, and the cluster bus protocol.
- [Redis documentation — Cluster tutorial](https://redis.io/docs/latest/operate/oss_and_stack/management/scaling/) — the reshard procedure, `MIGRATE`, and `TRYAGAIN` during a slot migration.
- [Redis documentation — `WAIT`](https://redis.io/docs/latest/commands/wait/) — making the durability decision per write instead of globally with `appendfsync`.
- [Redis documentation — `CLUSTER INFO`](https://redis.io/docs/latest/commands/cluster-info/) — `cluster_state`, `cluster_slots_assigned`, and the fields worth alerting on.

---

### End of Volume 9

BEFORE YOU MOVE ON, YOU SHOULD BE ABLE TO

- Explain why Redis's single-threaded command loop is a bet that pays in atomicity and
  lock-freedom, and name the four command shapes that lose the bet.
- Do the round-trip arithmetic for `MGET` versus a loop versus a pipeline, and say which
  of the three gives you atomicity as well as one round trip.
- Choose a data structure for a question — a set for membership, a hash for partial reads
  and partial writes, a sorted set for any ranked or range query — and state the
  complexity of both the right and the wrong answer.
- Say exactly what `volatile-lru` does on a keyspace with no TTLs, and name the
  `evicted_keys:0` diagnostic that proves it.
- Do the cache stampede arithmetic for 4,000 QPS, a 200 ms rebuild and a 50-connection
  pool, and price all four fixes.
- Explain why persistence protects against loss of the process while eviction is a
  deletion, and why the two do not compose into one safety story.
- State the loss window of each `appendfsync` setting and the throughput ceiling `always`
  implies on a cloud network volume.
- Distinguish `MOVED` from `ASK`, and explain why cluster is sharding rather than
  replication and what `CROSSSLOT` costs you at design time.

### Coming in Volume 10 — NoSQL & Distributed Stores

Volume 9 finished the layer that sits in front of everything: a single-node,
single-threaded, in-memory store whose failure modes are stampedes, penetration and
avalanche rather than slow queries. Volume 10 goes the other way — to stores that are
genuinely distributed, that give up joins and strong consistency on purpose, and where
the design question is no longer "how do I make this fast" but "which consistency model am
I buying and what does it forbid". Cassandra's replication and tombstone behaviour,
DynamoDB's hot partitions and conditional writes, and MongoDB's document model and
read-preference semantics all live there, as does where "eventual consistency is not a
bug" stops being a slogan and becomes an architectural commitment. The order matters
because Volume 9's invalidation and TTL discussions only make sense once you have read a
volume where staleness is the *default contract* rather than a compromise.

## Chapter 9 — Interview Scenario Bank

Production situations (**P**), predicted behaviour (**T**), code-review questions (**S**),
and design trade-off challenges (**D**). This bank is deliberately **D-weighted**: the
design questions are what separate a candidate who has configured a cache from one who has
operated one, because operating one is what produces the judgement to decline it.

### The Single Thread, Round Trips and the O(1) Choice

**D1. A Java service in Frankfurt issues forty sequential `GET`s per request against a Redis
primary in `us-east-1`, and the p99 is 620 ms. Name the fix, the number it produces, and the
two options you would refuse.** `STAFF`

Round trips, not throughput, and the arithmetic is the whole answer: forty sequential
commands at a 20–40 ms cross-region RTT is 800–1,600 ms of network wait before Redis
executes anything at all, and the 620 ms p99 is that number sampled rather than averaged.
Pipelining collapses it to roughly one RTT plus the transfer — 20–40 ms for all forty,
which is the same order-of-magnitude collapse the transport table gives for 1,000 commands.
The two options I would refuse are a larger Redis instance, because the instance is not the
bottleneck and it is in the wrong continent, and a replica in `us-east-1`, because a replica
has the identical RTT and gives up read-your-writes for nothing. The decision underneath is
residency: forty keys read on every request is a hot dataset on the wrong continent, and
the honest fix is to move the data or to accept that this read path should never have been
cross-region. The number to put on the slide is round trips per request, not keys per
second, because the second one is not what runs out first.

**D2. A team sets `io-threads 4` on a 32-core host and reports that Redis is "still
single-threaded and still slow". Give the precise explanation, and the workload for which
this would have been a win.** `STAFF`

The report is half right, and the half that is right is the half that does not matter. The
main thread is still exactly one thread and it still executes every command; I/O threads
never execute a command. They read from and write to sockets, and since 6.0 they may
additionally hand the parsed query buffer to the main thread over a lock-free queue. So the
ceiling did not move, and for small commands from a modest client count nothing was going to
change — the main thread was never the constraint, and the extra threads add
synchronisation overhead for nothing. The gotcha that produces most of these reports is
that `io-threads-do-reads` defaults to `no`, so `io-threads 4` on its own only helps the
write path; a team that set it, ran a read-heavy benchmark, and saw no movement was testing
the one half that could never have helped. The workload it does help is high client count
with large payloads and congested sockets, where the win is that a slow client no longer
stalls everyone else. Verify with `INFO threads` showing `io_threads_active:4` alongside
`threads_active:5`, and decide from `usec_per_call` in `INFO commandstats` whether the main
thread's queue is what you are actually waiting on.

**P1. The nightly admin job was changed from `KEYS` to `SCAN` last month, and the 14:20 p99
spike came back the next day. Same shape: 2 ms to 900 ms estate-wide, CPU at 30%, no
errors. What is the most likely cause?** `SCENARIO`

`SCAN` did not make the work disappear, it made it interruptible. The total cost is still
O(n) over the keyspace — 4.1 million keys at 100–250 ns each is 0.4 to 1.0 seconds of
examination — and what changed is only that other clients can be served between batches. The
spike is therefore no longer one 900 ms stall but several shorter ones, and the p99 is still
900 ms because a client that lands behind three batches waits for three batches. The second
candidate, and the one I check first, is that the rewritten job calls `DEL` on every key it
matches: deleting inside a `SCAN` loop turns an enumeration into a write workload, and
eviction then runs on the write path for each of those deletes, which is a different and
much worse latency profile than the original scan. The third is `COUNT` — the job was
retuned with a large value because the batches were too small, and `COUNT` is a hint rather
than a batch size, with the server returning more when it detects a rehashing, so a large
`COUNT` quietly reconstructs much of the original stall. Every one of these diagnoses
converges on the same fix as the original post-mortem: the job should not be enumerating at
all, and the sessions for a user should be reachable as a `SMEMBERS` on a per-user set.

**T1. Predict: a 4.1-million-key keyspace is being iterated with
`SCAN 0 MATCH product:* COUNT 500`. Separately, a Lua script on the same instance has been
running for eight seconds and clients are timing out. What is guaranteed, what is not, and
what can be done about the script?** `TRICKY`

On the iteration, the single guarantee is that a key present for the *entire* iteration is
returned at least once. Keys added or removed mid-iteration may or may not appear, a key may
be returned more than once so the client must deduplicate, and `COUNT 500` is a hint that the
server will exceed when it detects a rehashing. The part people miss is that the guarantee
is about individual keys and not about a point in time — there is no snapshot, so the set of
keys you saw is not a consistent view of anything. On the script: eight seconds is a global
stall, because a script runs to completion on the one command thread and there is no timeout
on `EVAL` that preempts it. `SCRIPT KILL` exists, and Redis will refuse it once the script
has performed a write — deliberately, because killing a partially-written script would leave
the keyspace in a state the script was midway through producing. So a script that has already
written is unkillable and must be allowed to finish while every client behind it waits. The
mitigation is design, not configuration: keep the work bounded, because `redis.call` inside a
loop is the same expensive-command case as `KEYS` except that it is a single command and is
therefore invisible in `commandstats`. `SLOWLOG` catches it; `--bigkeys` does not.

**S1. Review this cleanup method: a scheduled job calls `redisTemplate.execute` with a
`scan()` configured for `MATCH session:*` and `COUNT 5000`, then calls `redisTemplate.delete`
for every key in the returned batch, and the loop re-issues the scan from cursor `"0"` rather
than carrying the cursor forward.** `ADVANCED`

Four problems, and the cursor one is the correctness bug. `SCAN` is stateless by design — the
cursor returned by one call is the input to the next — so restarting from `"0"` on every pass
means the job never advances and re-walks the same 4.1 million keys indefinitely; the loop
also has no termination condition tied to the returned cursor reaching `0`. The `COUNT 5000`
is the performance bug: it is a hint, not a batch size, and combined with a full-keyspace
`MATCH` it reconstructs much of the stall the change was meant to remove. The per-key
`delete` inside the loop is the operational bug, because it converts a read-only enumeration
into a write workload, and every one of those writes puts eviction on the command path. The
design fix is that this job should not be enumerating at all: index sessions per user in a
set so the question becomes `SMEMBERS` on a bounded structure, and if a global sweep is
genuinely required, drive it with `UNLINK` in bounded batches from a cursor that is actually
threaded through the loop.

**D3. A service stores users as JSON strings and updates them with `GET`, mutate, `SET`.
Walk me through the migration to hashes, including what you would deliberately leave alone.**
`STAFF`

Start by naming the bug rather than the fix, because it is a correctness bug wearing a
performance costume: `GET` then modify one field then `SET` is a read-modify-write with no
compare-and-set, so two writers each read version N, each write N+1 with only their own field
changed, and one change vanishes with no error and no way to reconstruct it later. The fix is
`HSET`, and it is a two-character change per call site. What I would deliberately leave as a
string is anything always read whole, always written whole, and validated as a unit — a
40-field configuration blob is one round trip as a string and slightly more bytes as a hash
once you count the field-name framing, so converting it buys nothing and loses the schema
check. The migration is dual-write first, read from the hash, verify hit rates and memory,
then stop writing the string; going cut-over-first turns every key into a miss at once. The
number to watch is the encoding: crossing 128 fields or 64 bytes per value flips a hash from
`listpack` to `hashtable`, which costs 40–50 bytes of overhead per field and is a step change
rather than a slope, so verify with `OBJECT ENCODING` on real keys rather than assuming the
small-object case generalised.

**D4. One instance must hold a leaderboard, a per-user rate limiter, and a session store. Give
me the structure for each, say what it costs, and name the thing they have in common that
will bite.** `STAFF`

Leaderboard is a sorted set: `ZADD rank:weekly 14850 alice` then `ZREVRANGE` for the top ten
is `O(log n + m)`, and `ZRANK` answers a single user's position in `O(log n)` — the same
structure makes both the leaderboard and the rank lookup cheap, which is the property that
makes it worth the extra bytes over a set. The rate limiter is also a sorted set, as a
sliding-window log: `ZREMRANGEBYSCORE` to trim, `ZCARD` to count, `ZADD` to admit. The cost
is that memory is `O(users × limit)` rather than `O(users)` — 1,000 users at 100 requests in a
60-second window is 100,000 entries — and that bound is the one nobody writes down. Sessions
are plain strings with an absolute TTL, because a session is a document and is always read
whole. What they have in common is the thing that bites: all three keyspaces have different
guarantee requirements, and a single `maxmemory-policy` applies to all of them at once, so
the leaderboard's data is safely evictable while the session store's is merely bounded-lived
and the rate limiter's is a security control whose loss is a fail-open. That is a
classification you have to make on purpose, and the reason it usually is not is that one
Helm chart served all three.

**S2. Review this rate limiter: three separate calls, `ZREMRANGEBYSCORE` to trim the window,
then `ZCARD` to count, then a `ZADD` if the count is under the limit, with a comment reading
"trim, check, admit".** `ADVANCED`

The comment describes the intent and the code does not implement it, because three commands
are not one decision. On the single command thread, another client's `ZCARD` can be dispatched
between your trim and your count and another `ZADD` between your count and your admit, so
fifty simultaneous requests at 99 of a 100 limit all observe `ZCARD` as 99, all decide to
allow, and all admit — a limit of 100 becomes 150 under load and becomes a larger number
under heavier load. The fix is not a transaction and not `MULTI`; it is a single `EVAL` or
`EVALSHA` of a Lua script, which executes as one indivisible command on the one thread, so
the trim-count-admit sequence cannot interleave. Two things to insist on in review while you
are there: the `ZADD` member must be unique per admission — `now .. ':' .. i` rather than a
bare timestamp — because a repeated member silently collapses into the existing entry and the
log under-counts, which turns the limiter into a leak; and the memory is `O(requests in the
window)` per key, not O(1), so the bound is `users × limit` and that belongs in a comment
next to the limit itself.

### Cache Patterns and Their Failure Modes

**D5. A checkout service reads its own cart immediately after every write. Pick a pattern and
defend it, then tell me what you would not put behind it.** `STAFF`

Delete-on-write cache-aside, plus a narrow read-your-writes exception, and the exception is
the interesting half of the answer. The pattern argument is structural rather than clever:
cache-aside is the default because the cache has no code path to the database, so nothing in
the cache layer can fail because the database is down and the cache can be flushed or
replaced without touching the application. What cache-aside does not give you is freshness at
all — at the instant a write commits, nothing has told the cache anything, and every value is
stale until application code remembers to remove it. So for a read your own user is making
about data they just changed, the options are to read from the primary for that specific
read, to pass a version token, or to do a targeted post-commit cache update. What I would
not put behind this is write-through as a general policy, because it puts the cache in the
write path, which means a cache outage becomes a checkout outage — a voluntary availability
regression on a revenue path. And the number to hold onto: a miss is a double round trip
plus the database read, so a 5% miss rate does not make the service 5% slower, it puts a
permanent step in the p99 that users describe as "sometimes slow".

**D6. A team wants write-behind for a page-view counter. Argue both sides and give me the
condition under which you would refuse.** `STAFF`

For it: a view counter is the canonical case. It is high-write-volume, derivable from an
event log, and nobody reconciles it against money, so the latency win is real and large —
one in-memory `INCRBY` instead of a network round trip plus a `COMMIT` fsync, often 5–50×.
The read path never touches the database, which is a stronger property than cache-aside's.
Against it: there are six ways to lose the write, and the fourth is the one that surprises
people — **`maxmemory` eviction removes an unflushed key first, because a dirty key looks
exactly like a cold key to the LRU**, so the one write most likely to be evicted is the one
that was never persisted. Persistence does not save you either: an RDB snapshot may capture
it, so a *restore* has the counter while a normal restart has neither flushed it nor
captured it. The condition for refusing: if the write represents an obligation, a payment, an
order, or anything a person can be harmed by losing, refuse, because the design has no
bounded recovery point. The honest closing position is that making write-behind durable means
the write path becomes synchronous again, at which point you have paid the latency and kept
the complexity — so the real decision is whether the loss window is a number you could write
in a runbook.

**D7. A service wants the cache to load from the database itself so that no call site can
forget. What have they bought and what have they sold?** `STAFF`

They have bought one real thing: a single place where population happens, so the "someone
forgot to populate" failure has no surface. What they have sold is the property that made
cache-aside the default — the cache layer now has a code path to the database, and that
inverts which failures belong to whom. A loader bug is no longer one bad cache entry, it is a
cache-layer outage, and the blast radius is every call site that reads through it. Worse, the
failure is multiplicative rather than additive: a loader that throws turns the cache from a
fallback into a latency multiplier, because each request that would have been a fast miss
now pays the loader's own timeout before it gets its answer. A loader that is slow under
load has the same shape. The subtlety worth raising is that read-through also silently
converts "no negative caching" into an amplification path, because every request for a key
that does not exist invokes the loader and gets nothing back to store. The condition on which
I would still choose it: a small, high-value set of reads, one loader, monitored independently
from the cache, where the team would rather own one component than audit twenty call sites.

**D8. `evicted_keys` on a cache is climbing steadily and the hit rate is flat. What is the
system telling you, and what do you check before you resize?** `STAFF`

Flat hit rate with climbing eviction is the most reassuring-looking bad dashboard in
operations, and the reason it is bad is that it decouples two things you were implicitly
assuming were the same number. Hit rate is the fraction of reads served from cache; eviction
is the volume of writes being turned into deletions. They are independent, and a system can
hold a perfectly good hit rate while discarding a meaningful fraction of everything it writes
— which means your hit rate is being bought by cache misses on writes, and those misses are
being served by the origin. So the first question is not "is the cache big enough" but "is
the write path polluting the keyspace", because a write-through or write-behind path that
puts short-lived derived data into a cache governed by `allkeys-lru` will evict the
long-lived entries that produce the hit rate. Second, check whether the working set changed —
`expired_keys` against `evicted_keys` separates a TTL-driven keyspace from a
memory-pressure-driven one, and only the second is a sizing question. Third, check
`current_eviction_exceeded_time` and fragmentation: `mem_fragmentation_ratio` above 1.5 means
you are evicting real data to relieve allocator slack, and a bigger box makes that worse
rather than better. The instinct to resize is right and should be last on the list.

**P1. A nightly job runs `ZADD` to append 2 million product rows to a sorted set that the
homepage reads with `ZRANGE 0 9`. At 01:00 the homepage falls over. Walk me through it.**
`SCENARIO`

This is write-behind with the safety catches removed, and the homepage is the innocent party.
The job `ZADD`s into a key the read path also touches, so the cache is now in the write path
and every one of the job's writes competes with the read for the single command thread. Worse,
the structure is the wrong one for the job: a sorted set of 2 million rows built by append is
a `O(log n)` insert per row, but a `ZADD` that changes a member's score or re-adds a member is
worse than an insert, and any rewrite of the members near the top — which is exactly what a
"refresh the featured products" job does — invalidates the top of the skiplist the read path is
walking. The third failure is the write-behind one from the previous question, arriving on
schedule: a `ZADD` that lands in cache and is never flushed is an unflushed dirty key, and at
`maxmemory` it is among the first evicted. The diagnosis order is `SLOWLOG` to find whether
the job's commands are the expensive ones, `INFO commandstats` for `usec_per_call` on `zadd`
against `zrange`, and `INFO memory` for whether eviction was running at 01:00. The fix is that
the job should build into a separate key and swap — or better, should not be writing to a
structure a latency-sensitive read depends on at all.

**T1. Predict: with `allkeys-lru` at `maxmemory`, a `SET` arrives, memory is at 99% of the
limit, and `maxmemory-samples` is at its default of 5. What happens, and when does it
fail?** `TRICKY`

The `SET` itself triggers eviction, on the main thread, before it is applied — which is the
first thing to internalise, because it means `maxmemory` is a write and a server near the
limit has a measurably higher write p99 than one at 60% even when nothing is actually being
evicted. The mechanism then is sampling: take 5 random keys, evict the one closest to the
objective, repeat until the write fits. That is O(1) per eviction by design, at the cost of
inaccuracy — a true LRU would put a write on the read path, which is the exact opposite of the
architecture. The failure mode is the one to watch: after roughly four times the sample size
with nothing suitable found, the eviction attempt is abandoned and the write returns an OOM
error. With uniform access, 5 samples estimate well. With skewed access — and a real keyspace
is always skewed — a cold key has a low probability of appearing in a 5-key random sample of a
10-million-key space, so the sampler can spend its budget evicting warm keys while the truly
cold ones are never seen. That is the argument for `maxmemory-samples 10`, roughly double the
CPU cost of 5 and a materially better choice, and it is the reason `allkeys-random` exists
mostly as a benchmark baseline rather than an answer.

**S1. Review this cache configuration: `maxmemory 4gb`, `maxmemory-policy volatile-lru`,
`appendonly yes`, `appendfsync everysec`, and an application that calls `cache.put(key, value,
ttl)` on every write but has one legacy endpoint that calls `cache.put(key, value)` with no
duration.** `ADVANCED`

Two of these four lines are wrong and the combination is what makes it dangerous rather than
merely misconfigured. `volatile-lru` restricts the eviction *candidate set* to keys with a
TTL, and the one legacy endpoint is a key without one — so as memory fills, the candidate set
drains toward empty, Redis stops being able to evict, `used_memory` climbs past `maxmemory`,
and writes start failing with an OOM error. The configuration looks like it is evicting
something, which is exactly why this costs an afternoon. The fix is either `allkeys-lru` for a
keyspace that is entirely evictable, or auditing the one endpoint and giving it a TTL before
trusting `volatile-*` at all. The second problem is that `appendonly yes` on what is
evidently a cache is a claim that the contents are worth restoring, and for a cache that
claim is usually false — the disciplined version decides per keyspace whether restore or
`FLUSHALL`-and-warm is the correct recovery and writes it into the runbook, because a
managed failover promoting a replica that is 40 seconds behind will hand you back cache keys
that were invalidated in that window, and they will serve stale values for the rest of their
TTLs. The `evicted_keys:0` while `used_memory` sits at `maxmemory` signature is the one-glance
check that catches the first problem, and it belongs in the runbook permanently.

### Eviction and the Memory Budget

**D9. `maxmemory` is 90% of RAM on a container with a cgroup limit, and the pod is being
OOM-killed with `used_memory` at 400 MB. Explain, and tell me what `maxmemory` should be.** `STAFF`

Nothing in that report is an eviction event, and the distinction is the whole answer. The
cgroup limit counts the process RSS *plus* the page cache, and the kernel will OOM-kill the
largest process in the cgroup before Redis ever reaches its own `maxmemory` check — so
`maxmemory` at 90% of the container's limit means the kernel's memory and Redis's memory are
governed by two different numbers, and the kernel's fires first. `INFO memory` at 400 MB with
a dead pod is therefore a completely different incident from the one the dashboard suggests:
you are looking at Redis's accounting of *its own* data, and the thing that grew is something
else. The candidates are the fork's copy-on-write spike during `BGSAVE`, client-buffer memory
which `used_memory` does not include, the page cache attributable to I/O, and fragmentation —
`used_memory_rss` is the number that tells you whether the container is at risk, and
`mem_fragmentation_ratio` above 1.5 says you are evicting real data to relieve allocator
slack. What `maxmemory` should be: comfortably below the cgroup limit with real headroom for
the fork window, because the fork is survivable for writes and an OOM kill for a keyspace-wide
scan during it, and `vm.overcommit_memory 1` is a prerequisite rather than a nicety.

**D10. Choose an eviction policy for an instance that holds session data, rate-limit
counters, and a product cache. Then tell me what the choice costs when the working set moves.**
`STAFF`

The question is unanswerable as asked, and saying so is the answer: one policy applies to one
keyspace, and these three have genuinely different loss semantics. Sessions are
bounded-lived — every key has a TTL, so loss is bounded by design — which is what the
`volatile-*` family is for. Rate-limit counters are the same shape and a worse problem, because
their loss is a fail-open security event. The product cache is freely evictable and wants
`allkeys-lru` or `allkeys-lfu`. So the right move is to split the instances by guarantee
class, and if you cannot, the honest single-policy answer is `allkeys-lru` with the
rate-limiter consequence stated out loud to whoever owns the security review. The second half
is the part that generalises: LRU tracks recency perfectly and is blind to frequency, so a
crawler touching 500,000 cold keys in 30 seconds makes every one of them more recent than the
keys serving 4,000 requests per second, and pure LRU evicts exactly the set that matters.
LFU's 8-bit saturating counter survives that, at the price of reacting to a genuine change in
the working set only at the decay constant. The condition that flips the answer is whether
your access distribution is skewed *and stationary*: skewed and stable, LFU; genuinely moving,
LRU. And the way to find out is a canary at `allkeys-lfu` compared over a week, not a blog
post.

**D11. A team has 10 million tiny counters in Redis and `used_memory` is 6 GB. Where is the
memory, and what would you actually do?** `STAFF`

Almost all of it is per-key overhead, not data. A `dictEntry` is roughly 24 bytes, there is a
`robj` header and an `sds` header, and jemalloc rounds every allocation to a size class with
its own 8–16 bytes of overhead — so a one-byte counter costs 50–100 bytes all told, and 10
million of them is 1 GB of overhead wrapped around 10 MB of actual data. That is why
`maxmemory` is never the same number as your data, and it is why the number to run first is
`MEMORY USAGE` on a representative key, then multiply. The fixes in the order I would apply
them: consolidate into one hash with many small fields, so `HSET counters 1 1 2 1 3 5` is one
key rather than three, with the caveat that the automatic switch to `hashtable` at 128 fields
means this works in batches and not as one unbounded hash; then a bitmap, where 10 million
bits is 1.25 MB and `BITCOUNT` over a byte range answers the count — with the honest framing
that this changes the access pattern from "look up one counter" to "count a range", which is
only a win if that is what you actually do; and only then, more memory. The thing I would
refuse is the application-side cache that appears in the next PR, because it is a memory leak
and a staleness bug with no invalidation path.

**D12. Hit rate fell from 94% to 91% overnight. The team wants to add nodes. What is the
first question you ask?** `STAFF`

Not "where did the misses go" but "which keys" — because a 3,000 basis point change spread
evenly across a large keyspace is 0.6% of extra origin load, which is nothing, while the same
3,000 basis points concentrated on 200 hot keys is 200 keys generating essentially all the
traffic, each expiring periodically, which is a stampede with a period. The dashboard number
is identical and the two incidents have nothing in common. The diagnostic that separates them
is decomposing misses by cause — **absent, expired, evicted** — because those three have
completely different fixes: absent is a key-construction or modelling problem, expired is a
TTL policy problem, and evicted is a `maxmemory` sizing problem. Until you know which, adding
nodes is a guess. What I would want on the dashboard before scaling anything is the hit rate
split by key class, plus `expired_keys` against `evicted_keys` from `INFO stats`, and the
honest framing for the team is that a cache hit rate is a property of a keyspace, not a
property of a cache — 91% may be perfectly correct for a keyspace whose long tail was never
worth caching, in which case the only question worth asking is whether the tail should be
cached at all.

**P1. You are paged because every Redis-backed endpoint in one region degraded at 14:20
exactly. No errors, CPU at 30%, connection pools exhausted. Go.** `SCENARIO`

The exact-minute trigger across a region points at a schedule, and the "no errors, CPU at 30%"
combination is the tell: a workload that stalls the command thread does not burn CPU
*sustainedly*, it blocks the one thread that everything else needs while the fleet's average
utilisation looks unremarkable. First `SLOWLOG GET 20` and look at the commands and the
`duration` field, then `INFO commandstats` and sort by `usec_per_call` — a `GET` at 0.19 µs is
doing its job and a `KEYS` or a large `HGETALL` at 700,000 µs is a single command eating what
eleven thousand `GET`s would. Then check `INFO keyspace` for a key-count jump at 14:20 and the
client list for a burst of connections. The mechanism to hold in your head for the write-up:
`KEYS` on 4.1 million keys at 100–250 ns per key is 0.4 to 1.0 s of total stall, and with
8,000 concurrent clients at a 200 µs RTT that is 6,400 client-seconds of queueing — which is
your exhausted pool, with no error anywhere. The recovery is `SCAN` with an explicit `MATCH`,
or better, not needing enumeration at all: index the per-user sessions in a set so the
question is `SMEMBERS`. The prevention is a lint rule banning `KEYS` and `HKEYS` outside an
operator context, plus a staging load test at production key counts, because this is a bug that
passes every functional test.

**T1. Predict: `INFO memory` shows `used_memory` equal to `maxmemory`, `used_memory_rss`
about 12% higher, `mem_fragmentation_ratio` 1.12, `evicted_keys:0` and `expired_keys`
4,194,304. `maxmemory-policy` is `volatile-lru`. What is the state of this server?** `TRICKY`

This is the diagnostic signature of a `volatile-*` policy on a keyspace that has no eligible
candidates, and the numbers spell it out. `evicted_keys:0` while `used_memory` is at
`maxmemory` means eviction is not running at all — the policy restricts the candidate set to
keys *with a TTL*, and if the live keyspace has none, the set is empty, Redis cannot evict,
and its memory cannot be brought back under the limit. The next write is rejected with an OOM
error, so you get a hard write failure instead of the graceful eviction you configured, and
the config looks like it is evicting something. There is a quieter version worth
distinguishing: 2% of keys have TTLs, so Redis dutifully evicts that 2%, and the remaining
98% is not "protected" — it is immortal until the process dies, and you go OOM anyway. The
`expired_keys` figure is the corroborating detail, since a large number of expiries is what a
TTL-driven keyspace looks like and its absence is what makes the 2% variant likely. The
diagnosis path is `CONFIG GET maxmemory-policy`, then `--bigkeys` to see that nothing has a
TTL, then `DEBUG OBJECT` on a key, which shows `lru` and no `expire` field.

**S1. Review this sizing argument: "We have 200,000 products at roughly 2 KB of JSON each, so
that is 400 MB. The instance has 4 GB. We will set `maxmemory-policy allkeys-lru` and leave
it there."** `ADVANCED`

The arithmetic is roughly right and the conclusion is drawn from the wrong number. 400 MB of
payload becomes something considerably more once it is 200,000 hash entries with per-key
overhead, and the encoding is the bigger multiplier: a hash stays `listpack` only while it is
under 128 fields and 64 bytes per value, and a 2 KB JSON blob in a field is enough to push it
to `hashtable` immediately, at 40–50 bytes of overhead per field plus a separate allocation
for each name and value. So the thing to measure is `MEMORY USAGE` on a real key from each
access pattern, not a payload estimate — and if the same 2 KB is stored as one serialised
JSON string, that is a different key with a completely different cost, which is the encoding
decision the sizing argument has silently skipped. Two more things to raise. First,
`allkeys-lru` with no TTLs is only correct if every one of those 200,000 products is
recomputable; if any of them is a price or a stock level, eviction is a correctness event and
this line in the Helm chart is the decision that made it one. Second, "leave it there" is the
part to push back on hardest: an instance at 4 GB with a 400 MB working set is not
memory-constrained, so this policy will never be exercised, and the first time it is — after
a deploy that quadruples the keyspace — nobody will remember that the policy was chosen by a
sizing argument made before the keyspace existed.

### Cache Stampede, Penetration and Avalanche

**D13. A key is read 4,000 times a second, expires, and takes the database down. Walk me
through the four fixes and tell me which one you would ship first.** `STAFF`

Start with the arithmetic, because it decides everything: the rebuild is a 200 ms `GROUP BY`
over a 40-million-row table on an unindexed expression, the pool is 50, so database capacity
is 50 / 0.200 = 250 queries per second against 4,000 offered — a 16× overshoot, with 3,750
requests per second accumulating and 3,950 of the 4,000 blocked on the pool. And with 20 pods
at 50 connections each you are exhausting the *database's* global limit of 100–200, not just
your own pool, which is why every other service on that instance is down. The four fixes are
coordination (a mutex or single-flight, which needs an orphaned-holder story and a decision
about whether waiters block threads), probabilistic early expiry (needs `fetchedAt` stored
with the value, and useless for an *evicted* key because no timestamp survives), stale-while-
revalidate (serves the expired value and refreshes in the background, and the only fix that
keeps latency flat during recovery), and refresh-ahead (a worker, and now you own a worker at
3am). The one I would ship first is none of them: **make the rebuild cheap**, because a
covering index or a pre-aggregated table takes 200 ms to 2 ms, at which point the overshoot is
under 1.0 and the problem does not exist. A stampede is a latency problem before it is a
caching problem.

**D14. Requests for `/users/profile?id=8812993` are 50,000 a second and every one of them
reaches the database. Give me the three fixes and the one that is cheapest.** `STAFF`

The mechanism is that the miss is the expected state, so nothing looks wrong anywhere — the
key does not exist and never will, no negative entry is ever written, and the origin serves
the query on every single request. Cache penetration, and the shape that makes it dangerous
is an incrementing id: every request is plausible, none of them trip a per-user rate limiter,
and a single modest host can issue 10,000–50,000 a second. Three fixes. Negative caching
writes a short-TTL sentinel so the second request onward is answered from Redis, and it is
correct only if three rules hold: the negative TTL is a small fraction of the positive TTL so
signup does not leave a permanent 404, the sentinel is distinguishable from real data so an
empty string or a legitimate `null` field in a JSON payload is not mistaken for a miss, and
the *create* path deletes the negative key — which is why that delete has to live in one
place. A bloom filter at 1% false positives turns 50,000 misses a second into roughly 500,
a 100× reduction, at 1.2 MB for a million elements, and its cost is that it is only as good as
its population: if the create path does not `BF.ADD`, newly created users can never log in and
there is no error anywhere. The cheapest is the one nobody proposes: **validate the input
before it becomes a key**. A four-byte integer range check costs nothing and eliminates the
class rather than the instance.

**D15. Two million keys were warmed at midnight with a uniform `EX 3600`. At 01:00 the miss
rate goes from 2% to 98% and stays there for two hours. What do you do, and what is the rule
you would put in the design doc?** `STAFF`

The cause is not mysterious and the arithmetic is not complicated: 2,000,000 keys against 250
queries per second of database capacity is 8,000 seconds, 2.2 hours, and for every one of
those seconds the database is saturated on cache misses. What I would not do is the two fixes
that feel responsible. Adding connections shortens the event and moves the blast radius —
500 connections instead of 50 gives you 800 seconds, and then every other service on that
database is starved for thirteen minutes. Pre-warming is 2,000,000 misses executed by the
warmer at exactly the moment you are least able to absorb them. The fix is two lines of code:
a deterministic base TTL plus a random component, so the batch's expiries smear across the
jitter window instead of landing together, and the warmer runs *before* the event at a rate
the database can absorb rather than at it. The rule for the design doc is the one that makes
jitter a number rather than a habit — **`jitter_window × expiry_rate ≤ miss_budget`** — with
2,000,000 keys, a 3,600 s TTL and a ±300 s jitter spreading over 600 seconds, the expiry rate
is 3,333 keys a second, which is comfortably absorbable, whereas the universal mistake is
picking 10% of the TTL as a round number without checking what it does to the database. And
stagger by data class: immutable reference data gets a very long TTL, hot derived aggregates a
short one with high jitter, sessions an absolute lifetime rather than a sliding window.

**D16. A team has added jitter to their TTLs, their hit rate has not moved, and they are
asking why stampede protection is not working. What is the most likely explanation?** `STAFF`

They have probably applied a fix for avalanche to a stampede. Jitter desynchronises *many keys*
expiring together; it does nothing for *one key* read at a high rate, because every one of
the 4,000 requests arrives within the jitter window and the key is still gone for all of them.
If the key is read 4,000 times a second, a ±300 s jitter window is a rounding error against
the rate of arrivals — the key is expired for a meaningful fraction of the window no matter
what you do to the TTL. That is the diagnostic: split the miss causes into absent, expired and
evicted, and if the misses are concentrated on a small number of keys, the TTL is not the
variable. Stampede needs *coordination* — single-flight, a bounded-wait mutex with an
orphaned-holder story, stale-while-revalidate, or probabilistic early expiry, which is
different in kind because it needs no lock and does not block waiters — and it needs a cheap
rebuild, because the whole reason the misses hurt is the 200 ms. The other possibility worth
naming is that they are running the fix in the wrong place: a per-process single-flight across
20 pods still permits 20 concurrent rebuilds, which is a 99.5% reduction and, at 20 rebuilds
each taking 200 ms against 250 queries per second, still roughly double capacity. The
question to ask them is which of the two shapes they have, and the answer is in the key
distribution, not in the TTL configuration.

**P1. A deploy at 09:00 changed the session TTL from 3,600 seconds to 300 seconds across
every service. Walk me through what happens over the next ten minutes.** `SCENARIO`

This is avalanche cause number three, and it is the nastiest because it is self-reinforcing.
Every key that was written under the old policy has a 3,600-second absolute expiry, and
deploying a shorter TTL does not move those expiries — it changes only what is written from
09:00 onward. So the first thing that happens is that relative expiries start collapsing: a
keyspace that was on an hour-long horizon is now half on an hour and half on five minutes, and
five minutes from now the second half arrives all at once. The curve is miss rate climbing in
steps rather than a single cliff, which makes it harder to attribute than a clean 01:00
avalanche. The operational shape to expect: connection pool exhaustion on the session-lookup
path first, because it is on every request; 500s as pool acquisition times out at 2–30 s; and
retries multiplying offered load by whatever the resilience library's multiplier is, which
extends the event. The mistake to name explicitly is the reflex to raise the connection pool,
because that shortens the visible duration and starves every other service on the same
database for exactly as long. The fix is two parts: jitter on the new TTL so the two cohorts do
not align, and — the part that belongs in the runbook — a deploy procedure that does not
change a TTL across a whole keyspace without a staggered rollout or a pre-emptive warm at the
new value.

**T1. Predict: a value is cached with a 300-second TTL. A key is read every second with
`GETEX ... EX 300` refreshing on read. A user opens a page once a month. What do they
see?** `TRICKY`

A value from six months ago, indefinitely, and this is the reason `GETEX`-style sliding TTL
is the wrong default for a cache. The mechanism is that the sliding window resets on read, so
the key's age is the age of the *key* and not the age of the *data*; a key read every second
never reaches its expiry, and once the refresh pattern is established the original write time
is simply not represented anywhere. The meanstaleness you would design for with an absolute
300-second TTL is `ttl/2`, 150 seconds, and the worst case is the unlucky read immediately
after a write, which sees the full 300. Sliding TTL does not improve that; it removes the
bound entirely and replaces it with a number that grows without limit the more popular the key
is. The general statement is the one to say out loud: **a TTL should measure the age of the
data, not the age of the key.** The one legitimate use is a session key, where the sliding
window *is* the semantics — an idle timeout — provided the absolute session lifetime is
enforced separately, because otherwise a stolen cookie never expires. And the second-order
trap is that refresh-on-read also interacts with eviction: a key that is never logically
expired is never a `volatile-*` candidate, so a keyspace using sliding TTLs has quietly
removed most of its own eviction candidates.

**S1. Review this stampede mitigation: a `SETNX rebuild:<key>` with a 30-second TTL guards
the rebuild, and if the lock is not acquired the caller retries every 50 ms for up to 5
seconds.** `ADVANCED`

The intent is right and the implementation has three failure modes that only appear under
exactly the conditions you built it for. First, the TTL is the whole safety story and there is
no renewal: if the rebuild takes longer than 30 seconds — a cold buffer pool, a concurrent
index build, a table lock — the lock expires while the first holder is still working, a second
caller acquires it, and you are running the expensive query concurrently again, which is the
stampede you were preventing. Second, an orphaned holder is indistinguishable from a slow one
from the waiter's side, so the five-second give-up is a guess: too short and you get a second
rebuild, too long and real users wait on a lock whose owner is dead. Third, the 50 ms fixed
retry is a synchronised retry storm — the waiters all woke at the same moment, checked at the
same moment, and the winner's completion releases them all onto the cache simultaneously,
which is fine, but if the lock is contended by *other* traffic the retries themselves become
load. The design I would propose: a per-process single-flight so the waiters are your own
threads with a bounded wait, probabilistic early expiry so the common case needs no
coordination at all, and stale-while-revalidate so that during the rebuild users are served
stale data rather than a timeout — which is the only one of the four that keeps latency flat
*during* the event rather than after it.

### Invalidation and the Consistency Window

**D17. A service uses `@CachePut` inside a `@Transactional` method. Convince me to change
it, and tell me the one situation where you would not.** `STAFF`

Because rollback does not unwind it, and that is a permanent divergence rather than a bounded
one. `@CachePut` writes the value inside the transaction; if the transaction then rolls back
there is no second delete, because the write succeeded as far as anything downstream is
concerned, and the cache now holds a value that no database contains and that nothing in the
system knows is there. Compare delete-on-write, which is idempotent — deleting an absent key
is a no-op and deleting twice equals deleting once — and which *fails safe*, because a failed
delete leaves staleness bounded by the TTL and the next read repopulates. Two more failures
of update-in-cache worth naming because they are more common than the rollback: it needs the
whole value, so a partial `UPDATE ... SET last_seen = ?` overwrites every other field with
whatever stale copy the caller was holding; and two concurrent writers produce
last-write-wins on the entire object, so one writer's field change is silently lost. The one
situation where update-in-cache is right is a read-your-writes guarantee on a specific read —
a shopping cart during checkout — and the right way to get that is not `@CachePut` in a
transaction but a targeted post-commit update or a read that bypasses the cache.

**D18. Delete-on-write is in place and users still see stale data for minutes. Given the
delete-then-stale-repopulate race, what is the order of fixes you would apply?** `STAFF`

First, name the race precisely, because the reason it defeats a team is that each individual
step is correct. A reader misses, selects version 1, a writer commits version 2 and deletes a
key that is already absent so the delete is a no-op, and the reader then writes version 1 back
with a 300-second TTL. The delete was right, the repopulate was right, and the composition is
wrong; it is a read-modify-write across two systems with no transaction, and **no ordering of
`DEL` and `SELECT` fixes it**. The cheapest fix that resolves the common case is populating
from the primary rather than a read replica — this is the one that catches people, because
delete-on-write appears to do nothing when the repopulate comes from a lagging replica. That
narrows the window and does not close it. Deleting after commit rather than inside the
transaction narrows it further and still does not close it. The double-delete — delete, commit,
sleep 50 ms, delete again — closes the practical window, is ugly, is widely deployed and
widely mocked, and works because the second delete lands after the in-flight repopulate
completes; its cost is a sleep on the write path and a timing assumption rather than a
guarantee. Versioned keys, where the read path stores the version it read and the write path
bumps it, are the only one that is actually correct rather than probabilistically correct, at
the price of a version lookup on every read. And `CLIENT TRACKING` with `INVALIDATE` on
Redis 6+ is the mechanism that removes the window between the read and the invalidation
entirely, at the cost of server-side memory per tracked connection, which is why it is not the
default.

**D19. How do you size a TTL?** `STAFF`

You do not size a TTL, you size a staleness budget and let the TTL fall out of it — and the
question the TTL is derived from is never "how long can this be stale on average" but "how
stale is acceptable for this specific read, for this specific user, right now". Two structural
facts drive the number. A TTL converts an *unknown* staleness into a *bounded* one, which is
genuinely valuable and is the whole reason to have one, but the bound is not automatically
acceptable. And the same bound applies to a read one millisecond after the write and a read
four minutes after it, when only one of those is a problem — which is the argument for
per-data-class TTLs rather than one number in a config file. A practical derivation: a
300-second TTL gives a mean staleness of 150 seconds under a uniform access pattern and a
worst case of 300, so if the business can tolerate five minutes of staleness on a product
description, 300 is the right number and the average is better than the budget. If it can
tolerate thirty seconds, the TTL is 30 and you now have an availability problem, because a
30-second TTL on a hot key with a 200 ms rebuild is a stampede every 30 seconds. The
conclusion to state is the uncomfortable one: **the TTL is set by the rebuild economics, and
if the two numbers do not fit, the rebuild has to get cheaper** — no TTL policy fixes a
rebuild that is slower than `pool_size / QPS`.

**D20. A batch job updates 50,000 rows. Nothing in your service knows. What is the correct
architecture, and what is the honest cost?** `STAFF`

Event-driven invalidation from an outbox table, and the outbox is not optional — the write to
the row and the publication of `OrderChanged` must be in the same database transaction, and
then a relay publishes and a consumer deletes. Doing it sequentially in application code
loses the event if the process dies between the two, and doing it concurrently publishes for
a transaction that later rolls back. The honest cost is a set of numbers, not a slogan. If
the relay polls every 200 ms and the consumer takes 50 ms, the cache is stale for roughly
250 ms after the commit — that is the price of moving from "five minutes of TTL" to
"quarter of a second". The relay is at-least-once, so the consumer must be idempotent and the
duplicate publish is the price of not losing events, not a bug. A slow consumer is a
correctness problem, not a throughput one, because a consumer doing a `KEYS` scan or an
unpipelined delete loop stalls the thing it is supposed to be protecting. And the failure that
does not forgive: **a lost event means unbounded staleness**, because event-driven
invalidation has removed the TTL that was bounding you. The mitigation is a periodic
full-invalidation sweep — and the moment you add one, its period becomes the real staleness
bound, which is a TTL by another name. What is not fine is believing the move to events
removed the staleness question.

**P1. A `psql` session run by a data engineer updated a pricing table directly. Two hours
later the marketing site is showing the old prices and nobody can find the bug. What is your
answer?** `SCENARIO`

The bug is not a bug, it is a design property being discovered, and the answer is to say so
plainly: in cache-aside the write path does not go through the cache, so at the moment that
`UPDATE` committed there was no code path anywhere that had told the cache anything, and no
amount of discipline in your service would have changed that. The immediate action is to
evict the affected namespace and confirm the symptoms clear, because that both fixes the
incident and tests the hypothesis — if they do not clear, the diagnosis is wrong and you should
look at replication lag and replica reads instead. The second action is to check how long
other writes have been invisible this way, which is the number that reframes the conversation:
the `psql` session is an outlier, but every admin tool, every migration and every batch job
your team owns is the same class of writer. The structural fix is the outbox — the write and
the event in one transaction, a relay, an idempotent consumer — and the honest admission is
that a periodic full sweep is still required, because the sweep's period is what actually
bounds your staleness once the TTL stops being the mechanism. The staff-level point worth
making in the write-up: TTL and invalidation behaviour belong in the runbook with a named
owner, because this is the class of incident that appears six months after the team who
understood it has moved on.

**T1. Predict: an application reads from a Redis replica to populate the cache after a
delete-on-write. The user refreshes and sees the old value. How long, and why is the delete
irrelevant?** `TRICKY`

Until the replica catches up — however long `master_repllag` is at that moment — and the
delete is irrelevant because it happened on the primary, against a key the replica has not yet
been told to remove. Replication is asynchronous, so a write acknowledged to a client has
reached the master and not the replica, and the gap is a number that is routinely zero and
occasionally seconds. That is what makes this the most convincing-looking failure in the
whole chapter: the write path did exactly the right thing at exactly the right time, the
`DEL` returned success, and the delete-on-write "looks like it did nothing". The part that
makes it worse is that you cannot bound it per read. A replica read is a stale read by an
*unknown* amount — there is no way for the read path to know whether the value it just fetched
was current when the user asked — so unlike a TTL, which gives you a worst case, this gives
you no case at all. The fix is the boring one and it is worth stating without hedging:
**populate from the primary, never a read replica.** That removes this specific failure
entirely. It does not remove the delete-then-stale-repopulate race, because a concurrent
writer on the primary still loses, which is why the race needs a version check rather than a
different read target. And the broader point is the read-your-writes guarantee: serving reads
from replicas means the guarantee is gone, and calling that arrangement "a cache" without
naming what was given up is the mistake.

**S1. Review this Spring caching setup: one `@Cacheable` method on a repository with
`@Transactional` on the calling service, a `@CacheEvict` with `allEntries = true` on a bulk
update, and a `@Cacheable(key = "#id")` that calls a repository method returning a
`CompletableFuture`.** `ADVANCED`

Three separate issues, and the third is the one a reviewer should escalate rather than fix.
First, the cache boundary straddles the transaction: if `@Cacheable` is on the repository and
`@Transactional` is on the service, the cached value is the committed one on a hit but the
read-through populates inside the caller's transaction, so a rollback after population leaves
the cache holding an uncommitted value — the same failure as `@CachePut`, reached by a
different route. Second, `@CacheEvict(allEntries = true)` on a bulk update is an O(N) keyspace
clear, which on a large cache is a `KEYS`-shaped problem wearing an annotation, and the fix is
a version bump or a namespace that makes the old keys unreachable rather than deleted. Third,
a `@Cacheable` on a method returning `CompletableFuture` will cache the *future*, not the
value, if the cache abstraction intercepts the return type it expects — and if it unwraps and
caches the value, it caches it at completion time, on a thread that may not be the one that
ordered the write, so the ordering between this cache population and a subsequent invalidation
is undefined. The general rule to make the review produce: a cache annotation's correctness
depends on where the transaction boundary is, and any `async`, `CompletableFuture` or
reactive return type on a cached method should be treated as a defect until someone has
demonstrated the ordering.

### Persistence and Durability

**D21. A team is using Redis as both a cache and a job queue. Give me the configuration per
keyspace and the recovery procedure for each.** `STAFF`

Three keyspaces, three configurations, and the reason they differ is a classification, not a
preference. The product cache is recomputable: `allkeys-lru`, no TTLs required, persistence
off, and the recovery is `FLUSHALL` and warm — which is both correct and faster than a
restore. Sessions and rate-limit counters are bounded-lived: every key carries a TTL, so
`volatile-lru` or `volatile-lfu` is appropriate, loss is bounded by design, and persistence is
a convenience rather than a requirement, though RDB is cheap if mass logout at 9am is a
visible incident. The job queue is non-recomputable: `noeviction`, AOF `everysec` at minimum,
because an acked-and-lost job is a silently dropped task and deleting a queue entry is a
correctness event rather than a performance one. The recovery procedures differ too, and this
is the part that catches teams out: **enabling persistence on a cache is a claim that the
contents are worth restoring, and for a cache that claim is usually false — this is how a
cache becomes an accidental source of truth.** The first application to run a restore and
find data in there will treat that as the record, and the second one to add a `GET` against
it during an incident will turn a cache miss into a stale answer, so the claim has to be
denied deliberately at the start rather than corrected later. If it is false,
restore is the wrong operation — a managed failover promoting a replica 40 seconds behind hands
you back the invalidated keys from that window, plus negative cache entries, plus rate-limit
counters from three days ago that will now reject traffic for their remaining TTL. Decide
per keyspace, and write it in the runbook, because a failover is the worst moment to be
discovering it.

**D22. `appendfsync everysec` or `appendfsync no`? Give me the honest version of the answer,
including the part where the strong-looking option lies.** `STAFF`

`everysec` is a guarantee and `no` is a delegation, and the reason they are not the same is
that one is a promise Redis makes and the other is a promise the kernel may break. Under
`everysec` Redis itself performs the fsync on a schedule from a background thread, so a power
loss loses at most one second regardless of what the OS had pending. Under `no` the OS decides,
the OS may be holding megabytes of dirty pages, and the loss window is unbounded and *widens
precisely when the machine is stressed* — which is the worst possible time. So: `everysec` for
anything you cannot reconstruct, and the correct framing is that a TTL-bearing cache key is
already covered by its own expiry, so persistence is buying you a faster cold start rather
than correctness. The part where the strong-looking option lies is `always`, which is the
setting everyone reaches for and which is not what they think: throughput is bounded by
`1 / fsync_latency`, so 2,000–10,000 writes per second on an NVMe with a power-loss-protected
cache but only 50–200 on a cloud network volume at 5–20 ms — and most cloud block storage does
not honour FLUSH or FUA, or honours them only to the hypervisor's cache, so `always` on a
cloud volume can give you *zero* against a host power loss while appearing to be the strongest
setting available. The real durability answer is AOF plus replication, with `WAIT` and
`min-replicas-to-write` turning "probably replicated" into "refuse the write if it is not".

**D23. A cache has `save 3600 1` in the config. Nobody knows why. What do you say?** `STAFF`

Say what it is: save a snapshot if at least one key has changed in the last 3,600 seconds.
That list of thresholds *is* the data-loss window, and it is a deliberately lossy design — RDB
is a point-in-time snapshot chosen because it is compact, fast to restore, and cheap, and the
price is that the last minute to an hour is gone unless a threshold happened to fire. The
question to ask is not "should we keep it" but "what in this Redis cannot be recomputed",
because on a cache the answer is normally nothing and the honest recommendation is to turn
`save` off, since a background save is a fork with a copy-on-write spike and a cache gains
nothing from the snapshot. If something *is* not recomputable, the snapshot is the wrong
mechanism and the answer is AOF. Two operational details to raise regardless: the fork is
cheap and the *parent* pays, and what the parent pays is bounded by the number of distinct
pages first-touched during the fork window, which is fine for writes and an OOM kill for a
keyspace-wide `SCAN` running at the same time — and `rdb_last_bgsave_status` in
`INFO persistence` is the field that tells you the last six scheduled saves all failed on a
full disk, which is the incident nobody notices until a restore.

**D24. When would you turn persistence on for a cache, and what would you put in the
runbook?** `STAFF`

The short answer is: when the cost of a cold start exceeds the cost of the fork, and that
means a working set you cannot repopulate quickly — a large session store where a mass logout
at 9am is a real incident, or a derived dataset expensive enough to compute that a cold start
impedes a launch. For a product cache in front of a database, the answer is no: the next read
repopulates it, the fork is pure risk, and a snapshot of a recomputable value is the most
expensive way to do nothing. But the interesting part of the question is that turning it on is
a *classification decision*, and it is easy to make by accident. Persistence on a cache means
a durable copy of data whose invalidation logic is best-effort; it means a restore hands you
back the data as it was, including values that were never invalidated, including negative
cache entries, including rate-limit counters from three days ago that will now reject traffic
for their remaining TTL; and it means "just restore the cache" has become "restore a system
with opinions." The runbook entry I would insist on is one line long: **for this keyspace, is
the recovery restore or `FLUSHALL`-and-warm?** Restore is correct when the contents are worth
restoring. Flush-and-warm is correct, and faster, when they are not. And the incident that
justifies writing it down is a managed failover promoting a 40-second-stale replica, which
brings back 4,000 invalidated keys that then serve stale values for the rest of their TTLs —
a bug that correlates with failovers for a month before anyone connects the two.

**P1. A pod is `OOMKilled` during a nightly `BGSAVE`. `INFO memory` shows `used_memory` at
40% of `maxmemory`. Walk me through it.** `SCENARIO`

`used_memory` at 40% is what makes this confusing, and it is also the answer: `maxmemory` is
compared against Redis's own accounting of allocated data, not against the process RSS, and
the fork's copy-on-write spike lives in the difference. The sequence is: `BGSAVE` calls
`fork()`, which is cheap — a page-table clone, milliseconds even on 64 GB — and then the
parent keeps serving and writing while the child reads the parent's memory. Every page the
parent *modifies* during that window is one the child still references, so the kernel copies
it, and the spike is bounded by the number of distinct pages first-touched during the fork
window. Twenty thousand writes a second over 100 ms is about 2,000 pages, which is fine. The
pathological case is a *scanning* workload running at the same time: a `SCAN`, a large
`HGETALL` or a `SORT` touching the whole keyspace forces the entire dataset to be copied, so a
32 GB instance spikes 32 GB and the kernel OOM-kills the largest process in the cgroup before
`maxmemory` is ever consulted. Two checks: whether a full-keyspace traversal was running in
the window, and whether the kernel log has an OOM-kill line — because an OOM kill in the kernel
log is not a Redis eviction, and the container limit counts RSS plus page cache. The
prevention is `vm.overcommit_memory 1` as a prerequisite rather than a nicety, `maxmemory`
comfortably below the container limit, `repl-diskless-sync yes` to move the fork to a replica
whose loss is not a production outage, and never a keyspace-wide traversal during a save.

**T1. Predict: AOF is enabled with `appendfsync everysec`. The node loses power. What is
missing, and what does the same node do with `appendfsync no`?** `TRICKY`

With `everysec`, at most one second of writes — and the mechanism matters more than the
number, because Redis performs the fsync itself on a schedule from a background thread, so the
loss window is one second *regardless of what the OS was doing*. That is what makes it a
guarantee rather than a hope. With `no`, there is no number to give: the OS may not have
written anything, it may be holding seconds of dirty pages, and under memory pressure the
window grows — unbounded, and widest exactly when the machine is under stress, which is the
worst possible time for a loss window to widen. Both of those sounds like "about a second" to
someone reading a config file, which is exactly why the distinction is worth making out loud:
one is a promise Redis made and one is a promise the kernel may break. And the third case, the
one that breaks the frame entirely: a key that was **evicted** for memory is *more* reliably
absent after a restore, not less, because eviction is a `DEL` as far as everything else is
concerned, the AOF faithfully records that `DEL`, and a replay does the `SET` and then the
`DEL`. Persistence protects against loss of the *process*; eviction is a deletion that happens
with the process running, and the two do not compose into one safety story.

**S1. Review this recovery runbook: "Redis is down. Promote the replica and restore from the
last RDB, then re-enable traffic."** `ADVANCED`

The runbook is written for a database and applied to a cache, and every step needs a
qualifier. "Promote the replica" promotes something `master_repllag` seconds behind, and on a
cache that is a set of *deleted* keys coming back to life — entries invalidated in that window
serve stale values for the rest of their TTLs, which is a bug that correlates with failovers
and is genuinely hard to connect to its cause. "Restore from the last RDB" is worse: the
restore may be hours old by the `save` thresholds, and it returns values that were never
invalidated, negative cache entries, and rate-limit counters from days ago that will reject
traffic for their remaining TTL — and the whole premise is wrong, because for a recomputable
keyspace `FLUSHALL` and warm is not a degraded path, it is the *faster* and *correct* one. So
the runbook needs a per-keyspace decision, stated before the incident: which recovery is
correct for this keyspace, and who owns it. The one line that should never be in a cache
runbook is an unqualified restore, because it silently converts a data-loss question into a
data-staleness question and nobody discovers the difference until a user does. Add `INFO
persistence` and `rdb_last_bgsave_status` to the diagnostic step as well, since a disk-full
condition makes the background save fail repeatedly and silently.

### Replication, Sentinel and Cluster

**D25. Sentinel or cluster? Give me the decision and the number that settles it.** `STAFF`

The number is the working set against one node's memory, and it is a real boundary rather than
a matter of taste. Below it, Sentinel is the right answer and cluster is strictly worse:
Sentinel gives automatic failover with a single-master mental model, roughly 10–30 seconds of
unavailability plus `master_repllag` seconds of lost writes, and the client keeps behaving the
way it already does. Cluster, adopted for availability, removes your ability to ask a question
that spans shards, introduces a slot map every client and every proxy in front of you must
understand, and adds shard imbalance as a new operational concern — and the thing people
forget is that cluster's *primary* benefit is memory scale-out, which Sentinel does not provide
at all, not availability, which Sentinel does. Above the line, cluster is not optional and the
commitment is the access pattern: single-key or hash-tag-co-located access, accepted as
permanent. The review question I would put in front of the team unprompted is *which access
patterns are we committing to, and do they survive a shard boundary?* — the cheaper early form
of it is whether any *pair* of things you query together is going to be hot together. The
third option, and often the real one, is a managed service, where the difference is the
control plane: who decides failover policy, eviction policy, maintenance windows and version
upgrades, and what happens when the vendor's automation is wrong. Choose it when nobody on the
team wants to run Sentinel at 3am.

**D26. A service needs `MGET` across a user's profile, their cart and their last twenty
orders. Cluster is already in place. How do you make that one round trip work, and what
does the key layout cost you later?** `STAFF`

The mechanism is the hash tag: `user:{8812}:profile`, `user:{8812}:cart`,
`user:{8812}:orders`, where `CRC16` is computed over the bytes between the first `{` and the
first `}` that follows it and the result is taken mod 16,384, so all three keys hash to the
same slot and `MGET` is legal because all three keys are in the same slot on the same node.
The cost is a permanent
co-location decision, and it deserves to be said out loud: you have bound these three
lifetimes together. A 40-million-user orders table and a 12,000-user active-session set
cannot share a hash tag, so anything genuinely cross-cutting — a global report, an admin
tool, a cache warmer that walks every key — either leaves the client and does one call per
key or the client splits the request and pays the round trips back. The second trap is
placing the tag too low in the key, so `order:{8812}:detail` and `order:{8812}:index` land
together while `user:{8812}:profile` does not; the tag has to wrap exactly the dimension
you want co-located and nothing wider. The third is that the tag is invisible at the call
site unless it is wrapped in a helper — a key built by string concatenation in two different
services will drift, and the drift shows up as a `CROSSSLOT` error in production and as
nothing in code review. If the requirement genuinely spans nodes, the honest answer is that
it is N round trips, and the design question is whether the data model is wrong: a
cross-entity read is usually a query, not a cache problem.

**D27. Why is `MOVED` different from `ASK`, and what breaks if a client treats them the
same?** `STAFF`

`MOVED` is permanent and `ASK` is temporary, and the difference is the whole answer. `MOVED`
means this slot lives on that node now and will keep living there, so the client must update
its slot-to-node map and retry against the new node. `ASK` means the slot is mid-migration, so
the client must retry against the target with an `ASKING` command first and — the part that
matters — must *not* update its map. A client that treats `ASK` as `MOVED` corrupts its slot
map: it starts routing slots to a node that is only temporarily accepting them, and once the
migration completes those slots move back, so the breakage appears later, intermittently, and
correlated with resharding operations rather than with the reshard itself. Modern clients
handle both correctly and `redis-cli` proves it; hand-rolled clients and some HTTP proxies in
front of Redis do not, and if you run a proxy the question to ask its vendor is whether it
understands `ASK`. There is a third error in the same family worth naming: `TRYAGAIN`, which
the *target* returns for a key still in flight, and which is a retry rather than a redirect —
so a client that treats it as either of the other two will retry against the wrong node.
Understanding why the distinction exists is what tells you the design: the slot is marked
`MIGRATING` so that writes arriving during the migration are captured, because otherwise a
write landing on the source after its key had already been moved would be lost from the
cluster's perspective.

**P1. A team is moving to Redis Cluster because "we need high availability". Walk me through
what they are about to learn the hard way.** `SCENARIO`

They are about to discover that cluster is sharding, not replication, and that the two halves
of that sentence are separately surprising. What they wanted — failover when a node dies — they
could have had from Sentinel with a single-master mental model, and cluster gives it to them
only as a side effect of a memory scale-out they may not have needed. What they did not want
is the set of constraints cluster adds: any multi-key command whose keys hash to different
slots is an *error* rather than a slow operation, so `MGET`, multi-key `DEL`, `SINTER`,
`SUNION`, `ZUNIONSTORE` and any `MULTI` block spanning two keys now fail, and there is no
scatter-gather and there will not be one. The counter is a hash tag, and a hash tag is a
permanent schema decision made by whoever was on call during the migration, because
`{user:42}:profile` and `{user:42}:sessions` sharing a slot commits every future query touching
those two entities to the same node — and if that node is hot, you have designed a hot shard in
a system whose entire purpose is distributing load. The second lesson is operational: a node
joins the cluster as an empty master owning zero slots, so a failover at that moment promotes
a master with no data, and the reshard sequence — `add-node`, `reshard`, `MIGRATE` in batches
with slots marked `MIGRATING` and `IMPORTING`, then `CLUSTER MEET` the replicas — is an
operation whose *order* is the point. And the third is that every proxy, client library and
runbook in their estate now needs to understand a slot map.

**T1. Predict: a `MGET` on two keys that happen to be in different slots, on a cluster, during
a resharding. What does the client see, and in what order do the errors arrive?** `TRICKY`

`MGET` across slots is a `CROSSSLOT` error, and the precise statement is the one that earns
the question: in cluster mode every command is routed to the single node owning the hash slot
of its keys, and a multi-key command whose keys hash to different slots is *rejected* rather
than split, fanned out and recombined. There is no scatter-gather because recombining results
across nodes would give up the single-node atomicity that is the reason to use the cluster.
The order is where the resharding matters, and it is genuinely non-obvious. The client sends
the command to whichever node it believes owns the first key's slot. If that slot is mid-
migration, the source answers `ASK <target>`, and the correct client re-sends with `ASKING`
first and without updating its map. If the second key's slot has not yet been received by its
new owner, the target answers `MOVED` back toward the source. If a key is still in flight,
the answer is `TRYAGAIN`, which is a retry and not a redirect. And the `CROSSSLOT` check is
performed by the *client* before any of that, from its own slot map, which is why a stale map
produces `CROSSSLOT` for a pair that is perfectly co-located and rehashes to the same slot —
a genuinely confusing symptom whose cause is that the client is computing slots from a key it
has not verified, and which is fixed by the hash tag or by not asking a cross-slot question
at all.

**S1. Review this cluster access pattern: a dashboard loads a user's profile, their last 20
orders, and their unread message count. The keys are `user:{id}:profile`, `user:{id}:orders`
and `user:{id}:unread`, and the read is three round trips plus a `MGET` on the order
list.** `ADVANCED`

It works, and it works *because* someone put a hash tag in, which is the point to make: the
braces force `CRC16` over the text inside them, so all three keys share a slot and the
multi-key operations are legal. The question a reviewer should ask is not whether the tag is
present but whether it was placed deliberately, because it is a permanent schema decision.
What has been committed is that every future query touching a user's profile, orders and
unread count lands on the same node, for the lifetime of the key scheme. That is usually right
and it is not free: if user 42 becomes disproportionately hot — a power user, a bot, a
scraping script, or simply the largest tenant in a multi-tenant system — then the node
owning that slot takes the load, and the fix is a data-model change plus a migration, not a
config change. The second thing to raise is the three round trips, which is the cost model
question rather than the cluster question: `MGET` over a hash-tagged keyspace is legal and
collapses them, and where the reply must be combined atomically, a single `EVAL` is better
than a pipeline because a pipeline does not reduce server-side work and does not make the
sequence indivisible. And the third is the migration question nobody asks in review: adding a
hash tag to a key that is already deployed *changes its slot*, so a key that existed before
the tag was added is now in a different slot from every one of its siblings and invisible to
every multi-key command that expects them together.

### Redis in a Real Architecture

**D28. You are designing a caching layer for a new service that reads a Postgres primary and
writes to it. What is the architecture, and what are the first three decisions you make?** `STAFF`

The architecture is boring, which is the point: cache-aside with the cache having no code
path to the database, invalidation on write, a TTL as a backstop rather than as the mechanism,
and one instance separated by guarantee class rather than one instance serving everything.
The three decisions come first because they are the ones that are expensive to reverse. First,
**what is not recomputable here** — every value this service reads is derivable from
Postgres, so it is all evictable, and that single sentence is what makes `allkeys-lru` with
no TTLs the correct configuration and lets you stop thinking about `maxmemory` as a
data-loss decision. Second, **the staleness budget per data class**: a product description and
a cart's line items are not the same TTL, and the number for each comes from what a user would
call a bug, not from a config default. Third, **where the invalidation code lives**, once, in
one place, so that the delete that a rollback must not leave behind and the delete that clears
a negative cache entry are the same delete rather than a convention. What I would also decide
on day one, because it is the thing that is never retrofitted: a warm-up path and a
flush-and-warm recovery, so that the first deploy after a cold start is not a stampede, and so
that the runbook can say `FLUSHALL` and be correct. And the staff-level thing to raise
unprompted: name who can explain the consequence of the eviction policy, because the answer is
currently whoever wrote the first Helm chart, and that person has left.

**D29. The cache is now a dependency of a critical checkout path and the on-call rotation has
changed. What belongs in the runbook?** `STAFF`

Start with the classification, because it determines which failures are performance events and
which are correctness events. The recomputable keyspace failing is an availability event:
degrade to the database and let the stampede arithmetic decide whether it survives. The
rate-limiter keyspace failing is a security event, and the first question is whether the code
fails open or closed, because a limiter that has lost its counters and is failing open is an
open door that nothing will alert on. Then the diagnostics, in the order you want them at 3am:
`INFO memory` for `used_memory` against `maxmemory` with `evicted_keys` beside it — because
`evicted_keys:0` while memory sits at the limit is the signature of a `volatile-*` policy on a
keyspace with no candidates, and it is a one-glance check that belongs in every runbook; the
hit rate, split by cause (absent, expired, evicted) because the aggregate number means nothing
without it; `INFO commandstats` for `usec_per_call` on the slow commands; and `master_repllag`,
which is routinely zero and occasionally forty seconds and which nobody monitors until the
day it is forty. Then the procedures, and the ones that most need writing down are the
decisions rather than the commands: for each keyspace, is the recovery restore or
flush-and-warm; when a key expires, do you hold a lock, serve stale, or let a single request
rebuild it; and what is the number at which you stop serving traffic to protect the database.
The last one matters most, because the reflex in an incident is to add database connections,
which shortens the visible event and starves every other service sharing that database for
its duration.

**D30. You are asked to reduce Redis cost by 60% without changing what the application
returns. What do you do, in what order, and what do you refuse to do?** `STAFF`

Measure before touching anything, because "what the application returns" almost certainly does
not mean "the same bytes". Start with `MEMORY USAGE` on a representative key per access
pattern and `redis-cli --bigkeys`, because the biggest single win in most estates is per-key
overhead rather than payload: a 1-byte counter costs 50–100 bytes, and consolidating into a
hash with many small fields or moving a dense integer flag set to a bitmap is where the 60%
lives. Then the encoding switch, which is a step change rather than a slope — a hash stays
`listpack` only under 128 fields and 64 bytes per value, and `OBJECT ENCODING` tells you which
side of that line any given key is on, and the listpack thresholds are configurable when your
usage is a small number of large fields. Then look for data that should not be in Redis at
all: a cache entry for a value read once, a full export stored where a range read would do.
Then the `volatile-*` question — if the keyspace has no TTLs, that policy is not protecting
anything, it is producing OOM write failures. What I would refuse is `CONFIG SET
maxmemory-policy noeviction` as a "saving", which converts a memory problem into an outage and
does not save a byte; reducing `maxmemory` below what the working set needs, which is the same
move with extra steps; and `allkeys-random`, which is a benchmark baseline rather than an
answer to anything. The honest framing for the team: the reduction comes from changing the
shape of the data, and any policy change that makes the number go down without changing the
shape has moved the cost somewhere less visible.

**P1. A managed Redis instance failed over at 14:00 and for the next two hours users
intermittently saw old data. Nothing correlates with it except the failover. What
happened?** `SCENARIO`

This is the incident that connects three chapters, and the causal chain is short. Failover
promoted a replica, and replication is asynchronous, so the promoted replica is
`master_repllag` seconds behind — call it forty. In that window the primary accepted writes
and, more importantly for a cache, accepted *deletes*: cache keys that the write path
invalidated on the primary were never invalidated on the replica, because the delete had not
replicated. On promotion those keys exist again, and each serves its stale value for the
remainder of its TTL. So the symptom is not "Redis is forty seconds old", it is "specific
keys are serving values that were explicitly deleted minutes ago", which is a much more
alarming thing to observe and a much more explicable one once you know. Two aggravating
factors ride along: negative cache entries come back and keep answering 404 for accounts that
now exist, and rate-limit counters come back from days ago and reject traffic for their
remaining TTL. The immediate fix is to invalidate the affected namespaces rather than trust
the restored contents. The structural answer is the classification from the persistence
chapter: if the contents are not worth restoring, then a restore is the wrong operation, and
`FLUSHALL` and warm is both correct and faster — which is a decision to write in the runbook
before the next failover rather than during it.

**T1. Predict: `SCAN` is used to enumerate a large keyspace on a cluster, with a single
cursor in a `while (cursor != 0)` loop. What is missed, and what is the correct shape?** `TRICKY`

Almost everything on the other shards, and the loop will report clean completion while doing
it. `SCAN` in cluster mode iterates one node at a time — the cursor encodes both a position
and a node — so a naive loop starting at cursor 0 walks the first node and returns, having
silently ignored the rest of the keyspace. The symptom is a job that appears to succeed and
deletes or updates a fraction of what it should, which is the worst failure mode a batch job
can have because the partial run usually looks like a legitimate partial run. The correct
shape is to iterate per node: fetch the node list from `CLUSTER NODES` or `CLUSTER SLOTS`,
and run an independent `SCAN` cursor loop against each master. The second thing to say is
that this is a cure for a symptom, because enumeration at scale is a smell — a client that
has to ask Redis which keys exist is missing an index, and the right structure is a set of
ids or a sorted set of members so the membership question is a range read rather than a scan.
And the guarantee is unchanged by any of this: keys present for the whole iteration are
returned at least once, keys added or removed during it may or may not appear, a key may be
returned more than once so the client deduplicates, and `COUNT` is a hint that the server
exceeds when it detects a rehashing. The total cost is still O(n); `SCAN` makes iteration
interruptible, not free.

**S1. Review this cache key design: `String.format("customer:%d:orders:%d", customerId,
pageNumber)`, cached with a 300-second TTL, invalidated by a `@CacheEvict` on the customer
service's `updateCustomer`, and also read by an admin tool and a nightly report.** `ADVANCED`

The key construction is fine, which is worth saying, because the common bug in this shape is
a key missing a dimension the response varies by, and this one has the entity, the relation
and the page. Three problems follow from the rest. First, the TTL is uniform across
pagination, so page 1 and page 400 are invalidated and rebuilt on exactly the same schedule,
and for a report nobody reads that is 300 seconds of database work per page for no benefit.
Second, and the real one, the invalidation has a single owner and the key has three writers:
the customer service, an admin tool, and a nightly report. An `@CacheEvict` on
`updateCustomer` cannot reach a write made by the other two, and because the key is
paginated, even the service's own delete is a pattern rather than a key — so `allEntries` on a
paged keyspace is an O(N) keyspace clear, and a single-key delete does not cover pages 2
through 400. That is the shape of a stale-pagination bug nobody tests. Third, the fix is not
more evictions, it is deciding whether this is a cache at all: a 300-second TTL with an
incomplete invalidation path is a TTL doing the work of an invalidation strategy, and the
stale bound you are actually buying is the TTL, unbounded above by anything in the write path
you do not control. The reviewer should ask for the answer to "which of these three writers
invalidates this key" before approving.
